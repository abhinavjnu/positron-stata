"""
OpenStataEngine: Persistent Open-Source Rust Stata Engine for Positron.
Runs open-stata as a persistent interactive session, supports multi-line do-files,
exports datasets to pandas DataFrames for Positron Data Explorer,
tracks variables for Positron's Variables Pane, and captures SVG plots for the Plots tab.
Zero Stata license required.
"""

import io
import os
import re
import shutil
import subprocess
import tempfile
from typing import Any, Dict, List, Optional
import pandas as pd

from .stata_engine import ExecutionResult

class OpenStataEngine:
    def __init__(self, binary_path: Optional[str] = None):
        self.binary_path = self._resolve_binary_path(binary_path)
        self._proc: Optional[subprocess.Popen] = None
        self._current_df: Optional[pd.DataFrame] = None
        self._last_dataset_info: Dict[str, Any] = {
            "obs": 0,
            "vars": 0,
            "name": "empty",
            "var_names": [],
            "var_types": {},
            "var_labels": {}
        }
        self._last_obs = 0
        self._last_vars = 0
        self._sentinel = "__OPENSTATA_DONE_TOKEN__"

        if self.binary_path and os.path.exists(self.binary_path):
            self._start_process()

    def _resolve_binary_path(self, user_path: Optional[str]) -> str:
        candidates = [
            user_path,
            os.environ.get("OPENSTATA_BIN"),
            "/media/abhinav/WorkData/.cargo_target/release/open-stata",
            "/home/abhinav/.cargo/bin/open-stata",
            "/media/abhinav/WorkData/.cargo_target/debug/open-stata",
            shutil.which("open-stata")
        ]
        for c in candidates:
            if c and os.path.exists(c) and os.access(c, os.X_OK):
                return c
        return "/media/abhinav/WorkData/.cargo_target/release/open-stata"

    def _start_process(self):
        try:
            self._proc = subprocess.Popen(
                [self.binary_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
            # Drain startup banner
            self._read_until_sentinel(init=True)
        except Exception:
            self._proc = None

    def _read_until_sentinel(self, init: bool = False) -> str:
        if not self._proc or not self._proc.stdout:
            return ""

        self._proc.stdin.write(f'display "{self._sentinel}"\n')
        self._proc.stdin.flush()

        lines = []
        while True:
            line = self._proc.stdout.readline()
            if not line:
                break
            if self._sentinel in line:
                break
            if f'display "{self._sentinel}"' in line:
                continue
            lines.append(line)

        output = "".join(lines)
        if init:
            return ""
        return output

    def execute(self, code: str) -> ExecutionResult:
        if not self.binary_path or not os.path.exists(self.binary_path):
            return ExecutionResult(
                stdout="",
                stderr=f"OpenStata binary not found at: {self.binary_path}\n"
            )

        if self._proc is None or self._proc.poll() is not None:
            self._start_process()
            if self._proc is None:
                return ExecutionResult(stdout="", stderr="Failed to launch OpenStata process.")

        # Check if user requested Data Explorer via `browse` or `view`
        request_open_data_explorer = False
        clean_lines = []
        for raw_line in code.splitlines():
            line = raw_line.strip()
            lower = line.lower()
            if lower.startswith("//") or lower.startswith("*") or not lower:
                continue
            if lower in ("browse", "view", "edit", "br", "ed") or lower.startswith(("browse ", "br ", "edit ", "ed ")):
                request_open_data_explorer = True
                continue
            clean_lines.append(line)

        # Send lines to persistent process
        try:
            for line in clean_lines:
                self._proc.stdin.write(line + "\n")
            output = self._read_until_sentinel()
        except Exception as e:
            self._start_process()
            return ExecutionResult(stdout="", stderr=f"OpenStata execution error: {e}\n")

        # Check if dataset was loaded or modified
        dataset_changed = False
        load_match = re.search(r'\(Loaded dataset with (\d+) variables, (\d+) observations\)', output)
        if load_match or any(kw in code.lower() for kw in ("use ", "sysuse ", "clear", "drop ", "keep ", "generate ", "gen ", "replace ")):
            dataset_changed = self._sync_dataset_state(code)
            if load_match:
                dataset_changed = True

        # Check for graphics generation (e.g. scatter, twoway, hist)
        plots = self._check_and_generate_plots(code)

        return ExecutionResult(
            stdout=output,
            stderr="",
            plots=plots,
            dataset_changed=dataset_changed,
            request_open_data_explorer=request_open_data_explorer
        )

    def _sync_dataset_state(self, cmd_code: str = "") -> bool:
        """Export active dataset to temporary CSV and update in-memory DataFrame and schema."""
        if not self._proc or self._proc.poll() is not None:
            return False

        try:
            # Extract dataset name if command was use/sysuse
            name_match = re.search(r'(?:sysuse|use)\s+["\']?([^,\s"\']+)', cmd_code, re.IGNORECASE)
            if name_match:
                ds = name_match.group(1).strip()
                if not ds.endswith(".dta"):
                    ds += ".dta"
                self._dataset_name = os.path.basename(ds)
            elif not hasattr(self, "_dataset_name") or not self._dataset_name:
                self._dataset_name = "auto.dta"

            tmp = tempfile.mktemp(suffix=".csv")
            self._proc.stdin.write(f'export delimited using "{tmp}", replace\n')
            self._read_until_sentinel()

            if os.path.exists(tmp) and os.path.getsize(tmp) > 0:
                df = pd.read_csv(tmp)
                self._current_df = df
                obs = len(df)
                vars_cnt = len(df.columns)
                changed = (obs != self._last_obs or vars_cnt != self._last_vars or
                           list(df.columns) != self._last_dataset_info.get("var_names", []))

                self._last_dataset_info = {
                    "obs": obs,
                    "vars": vars_cnt,
                    "name": self._dataset_name,
                    "var_names": list(df.columns),
                    "var_types": {col: str(df[col].dtype) for col in df.columns},
                    "var_labels": {col: f"Variable {col}" for col in df.columns}
                }
                self._last_obs = obs
                self._last_vars = vars_cnt
                os.remove(tmp)
                return changed
            else:
                if self._last_obs > 0 or self._last_vars > 0:
                    self._last_obs = 0
                    self._last_vars = 0
                    self._current_df = None
                    self._last_dataset_info = {"obs": 0, "vars": 0, "name": "empty", "var_names": [], "var_types": {}, "var_labels": {}}
                    return True
        except Exception:
            pass
        return False

    def _check_and_generate_plots(self, code: str) -> List[str]:
        """Generate high-quality SVG vector graphic for Positron Plots tab."""
        plots = []
        lower = code.lower()
        if not any(kw in lower for kw in ("scatter", "plot", "twoway", "histogram", "hist")):
            return plots

        if self._current_df is None or self._current_df.empty:
            return plots

        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt

            # Extract variable names from scatter command: scatter y x
            scatter_match = re.search(r'scatter\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)', lower)
            if scatter_match:
                y_col = scatter_match.group(1)
                x_col = scatter_match.group(2)
                cols_lower = {c.lower(): c for c in self._current_df.columns}

                if y_col in cols_lower and x_col in cols_lower:
                    real_y = cols_lower[y_col]
                    real_x = cols_lower[x_col]

                    fig, ax = plt.subplots(figsize=(7, 5), dpi=100)
                    ax.scatter(self._current_df[real_x], self._current_df[real_y], color="#1a69a4", alpha=0.8, edgecolors="none", s=35)
                    ax.set_xlabel(real_x, fontsize=11, fontweight="medium")
                    ax.set_ylabel(real_y, fontsize=11, fontweight="medium")
                    ax.set_title(f"Scatter: {real_y} vs {real_x}", fontsize=13, fontweight="bold", pad=12)
                    ax.grid(True, linestyle="--", alpha=0.4)
                    ax.spines["top"].set_visible(False)
                    ax.spines["right"].set_visible(False)

                    buf = io.StringIO()
                    fig.savefig(buf, format="svg", bbox_inches="tight")
                    plt.close(fig)

                    svg_str = buf.getvalue()
                    if "<svg" in svg_str:
                        plots.append(svg_str)
        except Exception:
            pass

        return plots

    def get_current_dataset_info(self) -> Dict[str, Any]:
        return self._last_dataset_info

    def get_dataframe(self) -> Optional[pd.DataFrame]:
        if self._current_df is None or self._current_df.empty:
            self._sync_dataset_state()
        return self._current_df

    def close(self):
        if self._proc:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=2)
            except Exception:
                pass
            self._proc = None
