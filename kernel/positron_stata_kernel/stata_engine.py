"""
StataEngine: In-process Stata execution engine via PyStata and SFI.
Connects directly to Stata 19 MP (or any licensed Stata installation).
"""

import io
import os
import re
import sys
import tempfile
from typing import Any, Dict, List, Optional, Tuple

class ExecutionResult:
    def __init__(self, stdout: str, stderr: str = "", plots: Optional[List[str]] = None, 
                 dataset_changed: bool = False, request_open_data_explorer: bool = False):
        self.stdout = stdout
        self.stderr = stderr
        self.plots = plots or []
        self.dataset_changed = dataset_changed
        self.request_open_data_explorer = request_open_data_explorer


class StataEngine:
    def __init__(self, stata_home: str = "/usr/local/stata19", edition: str = "mp"):
        self.stata_home = stata_home
        self.edition = edition
        self._initialized = False
        self._stata = None
        self._sfi = None
        self._last_obs = -1
        self._last_vars = -1
        self._last_file = ""
        self._last_plot_counter = 0

    def initialize(self):
        if self._initialized:
            return

        utilities_path = os.path.join(self.stata_home, "utilities")
        if utilities_path not in sys.path:
            sys.path.insert(0, utilities_path)

        try:
            from pystata import config
            config.init(self.edition)
            from pystata import stata
            import sfi
            self._stata = stata
            self._sfi = sfi
            self._initialized = True
        except Exception as e:
            raise RuntimeError(f"Failed to initialize PyStata from {self.stata_home}: {e}")

    def execute(self, code: str) -> ExecutionResult:
        if not self._initialized:
            self.initialize()

        # Check if code requests opening the data explorer
        request_open_data_explorer = False
        for raw_line in code.splitlines():
            line = raw_line.strip().lower()
            if line.startswith("//") or line.startswith("*") or not line:
                continue
            if line in ("browse", "view", "edit", "br", "ed") or line.startswith(("browse ", "br ", "edit ", "ed ")):
                request_open_data_explorer = True
                break

        # Capture output
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        capture_out = io.StringIO()
        capture_err = io.StringIO()
        sys.stdout = capture_out
        sys.stderr = capture_err

        try:
            # Execute command in Stata
            self._stata.run(code)
        except Exception as e:
            capture_err.write(str(e))
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr

        stdout_str = capture_out.getvalue()
        stderr_str = capture_err.getvalue()

        # Check for generated plots
        plots = self._check_and_export_plots(code)

        # Check if dataset state changed
        dataset_changed = self._check_dataset_changed()

        return ExecutionResult(
            stdout=stdout_str,
            stderr=stderr_str,
            plots=plots,
            dataset_changed=dataset_changed,
            request_open_data_explorer=request_open_data_explorer
        )

    def _check_and_export_plots(self, executed_code: str) -> List[str]:
        """Detect and export any newly generated Stata graphs to SVG."""
        plots = []
        # Commands likely to produce graphics
        plot_keywords = (
            "graph", "scatter", "twoway", "histogram", "hist", "kdensity", 
            "marginsplot", "coefplot", "line", "bar", "box", "pie", 
            "qnorm", "pnorm", "ac", "pac", "xcorr", "binscatter"
        )
        lower_code = executed_code.lower()
        if not any(kw in lower_code for kw in plot_keywords):
            return plots

        try:
            tmp = tempfile.mktemp(suffix=".svg")
            # Export the currently active Stata graph to SVG
            self._stata.run(f'qui graph export "{tmp}", as(svg) replace')
            if os.path.exists(tmp) and os.path.getsize(tmp) > 500:
                with open(tmp, "r", encoding="utf-8", errors="replace") as f:
                    svg_content = f.read()
                if "<svg" in svg_content:
                    plots.append(svg_content)
                os.remove(tmp)
        except Exception:
            pass

        return plots

    def _check_dataset_changed(self) -> bool:
        """Check if observation count, variable count, or filename changed."""
        try:
            obs = self._sfi.Data.getObsTotal()
            vars_cnt = self._sfi.Data.getVarCount()
            filename = self._sfi.Macro.getGlobal("c(filename)") or ""

            changed = (obs != self._last_obs or vars_cnt != self._last_vars or filename != self._last_file)
            self._last_obs = obs
            self._last_vars = vars_cnt
            self._last_file = filename
            return changed
        except Exception:
            return False

    def get_current_dataset_info(self) -> Dict[str, Any]:
        """Retrieve metadata of the dataset currently in Stata memory."""
        if not self._initialized:
            return {"obs": 0, "vars": 0, "name": "empty", "var_names": []}

        try:
            obs = self._sfi.Data.getObsTotal()
            var_count = self._sfi.Data.getVarCount()
            filepath = self._sfi.Macro.getGlobal("c(filename)") or ""
            name = os.path.basename(filepath) if filepath else "Untitled Dataset"
            
            var_names = [self._sfi.Data.getVarName(i) for i in range(var_count)]
            var_labels = {self._sfi.Data.getVarName(i): self._sfi.Data.getVarLabel(i) for i in range(var_count)}
            var_types = {self._sfi.Data.getVarName(i): self._sfi.Data.getVarType(i) for i in range(var_count)}

            return {
                "obs": obs,
                "vars": var_count,
                "name": name,
                "filepath": filepath,
                "var_names": var_names,
                "var_labels": var_labels,
                "var_types": var_types
            }
        except Exception:
            return {"obs": 0, "vars": 0, "name": "empty", "var_names": []}

    def get_dataframe(self):
        """Extract the in-memory Stata dataset as a pandas DataFrame."""
        if not self._initialized:
            import pandas as pd
            return pd.DataFrame()

        try:
            return self._stata.pdataframe_from_data()
        except Exception as e:
            import pandas as pd
            return pd.DataFrame()
