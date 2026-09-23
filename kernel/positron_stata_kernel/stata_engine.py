"""
StataEngine: In-process Stata execution engine via PyStata and SFI.
Connects directly to Stata 19 MP (or any licensed Stata installation).
"""

import hashlib
import io
import os
import re
import sys
import tempfile
from typing import Any, Dict, List, Optional, Set, Tuple

from .completeness import strip_strings_and_comments

# Global used to read back `_rc` after `capture graph drop Graph`.
_RC_GLOBAL = "positron_stata_rc"

_PLOT_TRIGGER = re.compile(
    r"\b(graph|twoway|tw|scatter|line|connected|histogram|hist|kdensity|lowess|lpoly|"
    r"marginsplot|coefplot|binscatter|binsreg|bar|hbar|box|hbox|pie|qnorm|pnorm|qqplot|"
    r"ac|pac|xcorr|tsline|tsrline|xtline|rvfplot|rvpplot|avplot|avplots|cprplot|acprplot|"
    r"lvr2plot|stcurve|heatplot|spmap|grmap|event_plot|rdplot|"
    # Graphs drawn inside do-files or included scripts.
    r"do|run|include)\b",
    re.IGNORECASE,
)


class ExecutionResult:
    def __init__(self, stdout: str, stderr: str = "", plots: Optional[List[str]] = None,
                 dataset_changed: bool = False, request_open_data_explorer: bool = False,
                 error: Optional[str] = None):
        self.stdout = stdout
        self.stderr = stderr
        self.plots = plots or []
        self.dataset_changed = dataset_changed
        self.request_open_data_explorer = request_open_data_explorer
        self.error = error


def _optional(getter) -> str:
    try:
        return getter() or ""
    except Exception:
        return ""


class _StreamInterceptor:
    def __init__(self, callback=None):
        self.callback = callback
        self.buf = io.StringIO()

    def write(self, s: str):
        if not s:
            return
        self.buf.write(s)
        if self.callback:
            try:
                self.callback(s)
            except Exception:
                pass

    def flush(self):
        pass

    def getvalue(self) -> str:
        return self.buf.getvalue()


class StataEngine:
    def __init__(self, stata_home: Optional[str] = None, edition: Optional[str] = None):
        self.stata_home = stata_home or os.environ.get("STATA_HOME", "/usr/local/stata19")
        self.edition = edition or os.environ.get("STATA_EDITION", "mp")
        self._initialized = False
        self._stata = None
        self._sfi = None
        self._last_signature: Optional[Tuple] = None
        self._shown_graphs: Set[str] = set()

    def initialize(self):
        if self._initialized:
            return

        utilities_path = os.path.join(self.stata_home, "utilities")
        if utilities_path not in sys.path:
            sys.path.insert(0, utilities_path)

        target_edition = (self.edition or "mp").lower()
        if target_edition not in ("mp", "se", "be"):
            target_edition = "mp"

        candidate_editions = [target_edition]
        for ed in ("mp", "se", "be"):
            if ed not in candidate_editions:
                candidate_editions.append(ed)

        last_error = None
        for ed in candidate_editions:
            try:
                from pystata import config
                config.init(ed)
                from pystata import stata
                import sfi
                self._stata = stata
                self._sfi = sfi
                self.edition = ed
                self._initialized = True
                return
            except Exception as e:
                last_error = e

        raise RuntimeError(
            f"Failed to initialize PyStata from {self.stata_home} (editions tried: {candidate_editions}): {last_error}\n"
            "Please verify that your Stata license is active and that Stata 17+ is installed at this path."
        )

    def execute(self, code: str, stdout_callback=None, stderr_callback=None) -> ExecutionResult:
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

        # Capture output with streaming interceptors
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        capture_out = _StreamInterceptor(callback=stdout_callback)
        capture_err = _StreamInterceptor(callback=stderr_callback)
        sys.stdout = capture_out
        sys.stderr = capture_err

        error = None
        try:
            self._stata.run(code)
        except Exception as e:
            # PyStata raises on a non-zero Stata return code; the message ends with "r(###);".
            error = str(e).rstrip("\n") or f"{type(e).__name__} raised while running Stata code"
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
            request_open_data_explorer=request_open_data_explorer,
            error=error,
        )

    def _check_and_export_plots(self, executed_code: str) -> List[str]:
        """Export the current graph to SVG if it has not been shown yet."""
        # Strings and comments are ignored so `display "do"` or `// line` don't trigger an export.
        if not _PLOT_TRIGGER.search(strip_strings_and_comments(executed_code)):
            return []

        svg = self._export_current_graph()
        if svg is None:
            return []

        digest = hashlib.sha1(svg.encode("utf-8", "replace")).hexdigest()
        # The unnamed `Graph` is redrawn by every plot command, so it is always shown and then
        # dropped. Named graphs stay in memory for `graph combine`, so a named graph that is
        # still current would otherwise be re-sent after every later trigger command.
        is_default_graph = self._drop_default_graph()
        if not is_default_graph and digest in self._shown_graphs:
            return []
        self._shown_graphs.add(digest)
        return [svg]

    def _export_current_graph(self) -> Optional[str]:
        tmp = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as tf:
                tmp = tf.name

            # Forward slashes: Stata treats a backslash before ` or $ as an escape.
            stata_path = tmp.replace("\\", "/")
            self._stata.run(f'qui graph export "{stata_path}", as(svg) replace')
            if os.path.exists(tmp) and os.path.getsize(tmp) > 500:
                with open(tmp, "r", encoding="utf-8", errors="replace") as f:
                    svg_content = f.read()
                if "<svg" in svg_content:
                    return svg_content
        except Exception:
            pass
        finally:
            if tmp and os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except Exception:
                    pass
        return None

    def _drop_default_graph(self) -> bool:
        """Drop the unnamed graph `Graph`; return whether it existed."""
        try:
            self._stata.run("quietly capture graph drop Graph")
            self._stata.run(f"global {_RC_GLOBAL} = _rc")
            rc = self._sfi.Macro.getGlobal(_RC_GLOBAL)
            self._stata.run(f"macro drop {_RC_GLOBAL}")
            return str(rc).strip() == "0"
        except Exception:
            return False

    def _dataset_signature(self) -> Tuple:
        data = self._sfi.Data
        n = data.getVarCount()
        value_label_api = getattr(self._sfi, "ValueLabel", None)
        return (
            data.getObsTotal(),
            n,
            self._sfi.Macro.getGlobal("c(filename)") or "",
            self._sfi.Macro.getGlobal("c(changed)") or "0",
            # Names, types, labels, formats and value labels, so rename/recast/label var/format refresh the Variables pane.
            tuple(
                (
                    data.getVarName(i),
                    data.getVarType(i),
                    data.getVarLabel(i),
                    _optional(lambda idx=i: data.getVarFormat(idx)),
                    _optional(lambda idx=i: value_label_api.getVarValueLabel(idx)) if value_label_api else "",
                )
                for i in range(n)
            ),
        )

    def _check_dataset_changed(self) -> bool:
        try:
            signature = self._dataset_signature()
        except Exception:
            return False
        changed = signature != self._last_signature
        self._last_signature = signature
        return changed

    def get_current_dataset_info(self) -> Dict[str, Any]:
        """Retrieve metadata of the dataset currently in Stata memory."""
        if not self._initialized:
            return {"obs": 0, "vars": 0, "name": "empty", "var_names": []}

        try:
            obs = self._sfi.Data.getObsTotal()
            var_count = self._sfi.Data.getVarCount()
            filepath = self._sfi.Macro.getGlobal("c(filename)") or ""
            name = os.path.basename(filepath) if filepath else "Untitled Dataset"
            
            data = self._sfi.Data
            value_label_api = getattr(self._sfi, "ValueLabel", None)
            var_names, var_labels, var_types, var_formats, var_value_labels = [], {}, {}, {}, {}
            for i in range(var_count):
                var = data.getVarName(i)
                var_names.append(var)
                var_labels[var] = data.getVarLabel(i)
                var_types[var] = data.getVarType(i)
                var_formats[var] = _optional(lambda: data.getVarFormat(i))
                var_value_labels[var] = _optional(lambda: value_label_api.getVarValueLabel(i)) if value_label_api else ""

            return {
                "obs": obs,
                "vars": var_count,
                "name": name,
                "filepath": filepath,
                "var_names": var_names,
                "var_labels": var_labels,
                "var_types": var_types,
                "var_formats": var_formats,
                "var_value_labels": var_value_labels,
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
