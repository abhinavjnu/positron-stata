"""
StataEngine: In-process Stata execution engine via PyStata and SFI.
Connects directly to Stata 19 MP (or any licensed Stata installation).
"""

import atexit
import hashlib
import io
import os
import re
import shutil
import sys
import tempfile
import threading
from typing import Any, Dict, List, Optional, Set, Tuple

from .completeness import delimiter_state, parse_delimit, strip_strings_and_comments

# Global used to read back `_rc` after `capture graph drop Graph`.
_RC_GLOBAL = "positron_stata_rc"

# Stata's own `pause` (pause.ado) reads the console with _request() and blocks forever in a
# headless kernel, even with stdin at /dev/null. This replacement keeps `pause on/off`
# semantics ($PAUSEON) but never waits for input. It is written to a kernel-owned directory at
# the front of the adopath, so Stata autoloads it instead of the original even after
# `clear all` or `program drop _all` (an in-memory definition would not survive those).
_PAUSE_ADO = """*! pause override installed by the Positron Stata kernel
program define pause
    version 6
    if `"`1'"'=="on" | `"`1'"'=="off" {
        if `"`2'"'=="" {
            if "`1'"=="on" {
                global PAUSEON "yes"
            }
            else global PAUSEON
            exit
        }
    }
    if "$PAUSEON"=="" {
        exit
    }
    di as txt `"pause:  `0'"'
    di as txt "(pause skipped: interactive pause is not supported in the Positron console)"
end"""

# `browse`/`edit` are GUI commands that console Stata (and so PyStata) reports as
# "unrecognized" (r(199)) after searching the adopath. These shims let Stata itself parse and
# validate `browse [varlist] [if] [in] [, nolabel]` (in loops and do-files too), record the
# request in globals, and store the selected observation numbers in a Mata vector. They never
# change the data: marksample's tempvar is dropped and does not set c(changed) (verified).
_BROWSE_GLOBAL = "positron_stata_browse"
_BROWSE_VARS_GLOBAL = "positron_stata_browse_vars"
_BROWSE_NOLABEL_GLOBAL = "positron_stata_browse_nolabel"
_BROWSE_SUBSET_GLOBAL = "positron_stata_browse_subset"
_BROWSE_OBS_MATA = "positron_stata_browse_obs"
_BROWSE_ADO = f"""*! browse override installed by the Positron Stata kernel
program define browse
    version 16
    syntax [varlist(default=none)] [if] [in] [, NOLabel *]
    capture mata: mata drop {_BROWSE_OBS_MATA}
    global {_BROWSE_SUBSET_GLOBAL} 0
    if `"`if'`in'"' != "" {{
        marksample touse, novarlist
        mata: {_BROWSE_OBS_MATA} = selectindex(st_data(., "`touse'"))
        global {_BROWSE_SUBSET_GLOBAL} 1
    }}
    global {_BROWSE_VARS_GLOBAL} `"`varlist'"'
    global {_BROWSE_NOLABEL_GLOBAL} "`nolabel'"
    global {_BROWSE_GLOBAL} 1
end"""
# Abbreviations only work for built-ins, so each accepted spelling needs its own ado file.
_BROWSE_ALIASES = ("br", "bro", "brow", "brows", "edit", "ed", "edi")

# Scratch frame used to snapshot data for the Data Explorer.
_BROWSE_FRAME = "positron_stata_browse"


def value_labels_enabled() -> bool:
    """POSITRON_STATA_VALUE_LABELS: show value labels in the Data Explorer (default on)."""
    return os.environ.get("POSITRON_STATA_VALUE_LABELS", "1").strip().lower() not in ("0", "false", "off", "no")


class BrowseRequest:
    """What a `browse`/`edit` command asked to see. `obs` holds 0-based observation indices
    (None = all observations); `variables` is empty for all variables."""

    def __init__(self, variables: Optional[List[str]] = None, obs=None, value_labels: bool = True):
        self.variables = list(variables or [])
        self.obs = obs
        self.value_labels = value_labels


_PAUSE_ON = re.compile(r"\bpause\s+on\b", re.IGNORECASE)

PAUSE_NOTE = (
    "Note: `pause` is not supported in the Positron console (it would wait for keyboard input "
    "forever); `pause` statements are skipped.\n"
)

_DELIMIT_PREFIX = "#delimit ;\n"

# PyStata's message when a run is stopped with StataSO_SetBreak (verified live).
BREAK_MESSAGE = "--Break--\nr(1);"

# Globals used to read stored-result names out of Mata's st_dir().
_RESULT_KINDS = ("numscalar", "macro", "matrix")
_RESULT_GLOBALS = {
    (cls, kind): f"positron_stata_{cls}{kind[:3]}" for cls in ("e", "r") for kind in _RESULT_KINDS
}
_RESULT_NAMES_MATA = "mata: " + "; ".join(
    f'st_global("{g}", invtokens(st_dir("{cls}()", "{kind}", "*")\'))'
    for (cls, kind), g in _RESULT_GLOBALS.items()
)
# Stata's missing values are stored as doubles at or above this.
_STATA_MISSING = 8.98846567431158e307

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
                 error: Optional[str] = None, results_changed: bool = False,
                 browse_request: Optional[BrowseRequest] = None, interrupted: bool = False):
        self.stdout = stdout
        self.stderr = stderr
        self.plots = plots or []
        self.dataset_changed = dataset_changed
        self.request_open_data_explorer = request_open_data_explorer
        self.error = error
        # e()/r() results or frames changed, so the Variables pane needs a refresh.
        self.results_changed = results_changed
        # Details of the `browse`/`edit` request when request_open_data_explorer is set.
        self.browse_request = browse_request
        # The user's code was stopped by an interrupt.
        self.interrupted = interrupted


def _optional(getter) -> str:
    try:
        return getter() or ""
    except Exception:
        return ""


def _optional_value(getter):
    try:
        return getter()
    except Exception:
        return None


def _is_missing(value) -> bool:
    return value is None or (isinstance(value, float) and value >= _STATA_MISSING)


def format_number(value) -> str:
    if _is_missing(value):
        return "."
    return f"{value:.10g}"


class _PrefixFilter:
    """Stream wrapper that replaces `prefix` with `replacement` if the stream starts with it."""

    def __init__(self, callback, prefix: str, replacement: str = ""):
        self.callback = callback
        self.prefix = prefix
        self.replacement = replacement
        self.pending = ""
        self.done = False

    def __call__(self, text: str):
        if self.done:
            self.callback(text)
            return
        self.pending += text
        if self.pending.startswith(self.prefix):
            self.done = True
            rest = self.replacement + self.pending[len(self.prefix):]
            self.pending = ""
            if rest:
                self.callback(rest)
        elif not self.prefix.startswith(self.pending):
            self.done = True
            rest, self.pending = self.pending, ""
            self.callback(rest)

    def flush(self):
        if self.pending:
            rest, self.pending = self.pending, ""
            self.callback(rest)
        self.done = True


def _replace_prefix(text: str, prefix: str, replacement: str) -> str:
    return replacement + text[len(prefix):] if text.startswith(prefix) else text


class _OutputRouter:
    """File-like object installed as PyStata's config.stoutputf; writes to `target`."""

    def __init__(self):
        self.target = None

    def write(self, text):
        (self.target or sys.stdout).write(text)

    def flush(self):
        target = self.target or sys.stdout
        if hasattr(target, "flush"):
            target.flush()

    def close(self):
        pass


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


def _extended_missing_codes(column):
    """Map a pandas read_stata(convert_missing=True) column to {row position: ".a"...}."""
    from pandas.io.stata import StataMissingValue
    out = {}
    values = column.to_numpy(dtype=object)
    for pos, value in enumerate(values):
        if isinstance(value, StataMissingValue) and value.string != ".":
            out[pos] = value.string
    return out


def labeled_categorical(values, mapping: Dict, ext_missing: Optional[Dict[int, str]] = None):
    """Ordered pandas Categorical showing value labels, with categories in code order.

    Codes without a label are shown as the number (as Stata's browser does); missing values
    are NaN unless an extended missing value (.a-.z) has a label. Duplicate labels are made
    unique by appending the code, so each code keeps its own sort position.
    """
    import numpy as np
    import pandas as pd
    arr = np.asarray(values, dtype="float64")
    present = ~np.isnan(arr)
    uniq = np.unique(arr[present])
    names: List[str] = []
    seen: Set[str] = set()

    def add(text: str, code_text: str):
        if text in seen:
            text = f"{text} ({code_text})"
        base, n = text, 2
        while text in seen:
            text, n = f"{base} #{n}", n + 1
        seen.add(text)
        names.append(text)

    for u in uniq:
        u = float(u)
        code_text = format_number(u)
        label = mapping.get(int(u)) if u.is_integer() else None
        add(label if label is not None else code_text, code_text)

    codes = np.full(len(arr), -1, dtype=np.int64)
    codes[present] = np.searchsorted(uniq, arr[present])
    if ext_missing:
        rows_by_code: Dict[str, List[int]] = {}
        for pos, code in ext_missing.items():
            if code in mapping and 0 <= pos < len(arr) and not present[pos]:
                rows_by_code.setdefault(code, []).append(pos)
        for code in sorted(rows_by_code):  # ".a" < ".b" < ... matches Stata's order
            codes[rows_by_code[code]] = len(names)
            add(str(mapping[code]), code)
    return pd.Categorical.from_codes(codes, categories=names, ordered=True)


def _finish_browse_frame(df, request: BrowseRequest, labels: Dict[str, Dict],
                         ext_missing: Dict[str, Dict[int, str]]):
    """Apply the variable order, observation subset, 1-based row labels and value labels."""
    import numpy as np
    import pandas as pd
    if request.variables:
        df = df[[v for v in request.variables if v in df.columns]]
    n = len(df)
    if request.obs is not None:
        obs = np.asarray(request.obs, dtype=np.int64)
        obs = obs[(obs >= 0) & (obs < n)]
        df = df.iloc[obs]
        ext_missing = {
            c: {new: m[old] for new, old in enumerate(obs.tolist()) if old in m}
            for c, m in ext_missing.items()
        }
        df.index = pd.Index(obs + 1, name=None)
    else:
        df.index = pd.RangeIndex(1, n + 1)
    if labels:
        df = df.copy() if request.obs is not None else df
        for col, mapping in labels.items():
            if col in df.columns and pd.api.types.is_numeric_dtype(df[col].dtype):
                df[col] = pd.Series(
                    labeled_categorical(df[col].to_numpy(), mapping, ext_missing.get(col)),
                    index=df.index,
                )
    return df


class StataEngine:
    def __init__(self, stata_home: Optional[str] = None, edition: Optional[str] = None):
        self.stata_home = stata_home or os.environ.get("STATA_HOME", "/usr/local/stata19")
        self.edition = edition or os.environ.get("STATA_EDITION", "mp")
        self._initialized = False
        self._stata = None
        self._sfi = None
        self._stlib = None
        self._config = None
        self._last_signature: Optional[Tuple] = None
        self._last_results_signature: Optional[Tuple] = None
        self._shown_graphs: Set[str] = set()
        # `#delimit ;` state; Stata resets it at the end of every run, so the engine carries it.
        self.semicolon_delimiter = False
        self._pause_guard_needed = True
        self._pause_note_shown = False
        self._browse_shim_installed = False
        # Interrupt support: StataSO_SetBreak may be called from any thread (verified live), but
        # only while the user's code is running, so an interrupt that races with the kernel's
        # own helper runs (graph export, results enumeration) is ignored.
        # Reentrant: request_break may run from a Python signal handler on the main thread.
        self._break_lock = threading.RLock()
        self._user_run_active = False
        self._break_requested = False
        self._output_router = _OutputRouter()

    def initialize(self):
        if self._initialized:
            return

        if sys.version_info >= (3, 14):
            raise RuntimeError(
                f"Python {sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]} is not supported by Stata. "
                "Stata's PyStata C-bridge requires Python <= 3.13. Please configure 'positron-stata.pythonPath' to point to Python 3.9-3.13."
            )

        utilities_path = os.path.join(self.stata_home, "utilities")
        if utilities_path not in sys.path:
            sys.path.insert(0, utilities_path)

        target_edition = (self.edition or "mp").lower()
        if target_edition not in ("mp", "se", "be"):
            target_edition = "mp"
        candidate_editions = [target_edition, *(ed for ed in ("mp", "se", "be") if ed != target_edition)]

        last_error = None
        for ed in candidate_editions:
            try:
                from pystata import config
                config.init(ed)
                if not getattr(config, "sfiinitialized", True):
                    stata_msg = config.get_output() if hasattr(config, "get_output") else ""
                    detail = f"\nStata diagnostic: {stata_msg.strip()}" if stata_msg and stata_msg.strip() else ""
                    raise RuntimeError(
                        f"Stata failed to initialize Python environment (code -7100).{detail} "
                        "This usually indicates an incompatible Python version, missing shared library, or architecture mismatch with Stata."
                    )
                from pystata import stata
                import sfi
                self._stata = stata
                self._sfi = sfi
                self._stlib = getattr(config, "stlib", None)
                self._config = config
                # PyStata's output thread prints to config.stoutputf, or to sys.stdout when unset,
                # which it swaps back and forth while the main thread's RedirectOutput swaps it
                # too. A fixed stoutputf keeps streamed output out of that race.
                if hasattr(config, "stoutputf") and config.stoutputf is None:
                    config.stoutputf = self._output_router
                self.edition = ed
                self._initialized = True
                return
            except Exception as e:
                last_error = e

        raise RuntimeError(
            f"Failed to initialize PyStata from {self.stata_home} (editions tried: {candidate_editions}): {last_error}\n"
            "Please verify that your Stata license is active, that Stata 17+ is installed at this path, "
            "and that Python <= 3.13 is being used."
        )

    def execute(self, code: str, stdout_callback=None, stderr_callback=None,
                interactive: bool = True) -> ExecutionResult:
        """Run user code. `interactive=False` (help pages, UI requests) ignores and keeps the
        console's `#delimit` state."""
        if not self._initialized:
            self.initialize()

        stripped = strip_strings_and_comments(code)
        semicolon_before = self.semicolon_delimiter if interactive else False
        semicolon_after, _ = delimiter_state(code, semicolon_before)
        if not interactive:
            semicolon_after = self.semicolon_delimiter

        # A lone `#delimit` line: single lines bypass do-file parsing in PyStata, where `#` is
        # "not a valid command name" (r(199)), so the kernel applies it itself.
        directive_lines = [line for line in stripped.splitlines() if line.strip()]
        if interactive and directive_lines and all(parse_delimit(line) is not None for line in directive_lines):
            self.semicolon_delimiter = semicolon_after
            message = f"delimiter now {';' if semicolon_after else 'cr'}\n"
            if stdout_callback:
                stdout_callback(message)
            return ExecutionResult(stdout=message)

        pre_stderr = self._guard_pause(stripped if interactive else "")
        if pre_stderr and stderr_callback:
            stderr_callback(pre_stderr)

        # Text-based detection of Data Explorer requests. With the browse shim installed, Stata
        # itself reports `browse`/`edit` (see _consume_browse_request); a bare `view` is kept.
        request_open_data_explorer = False
        for raw_line in code.splitlines():
            line = raw_line.strip().lower()
            if semicolon_before:
                line = line.rstrip("; ")
            if line.startswith("//") or line.startswith("*") or not line:
                continue
            if self._browse_shim_installed:
                if line == "view":
                    request_open_data_explorer = True
                    break
                continue
            if line in ("browse", "view", "edit", "br", "ed") or line.startswith(("browse ", "br ", "edit ", "ed ")):
                request_open_data_explorer = True
                break

        run_code, run_kwargs, prefix, replacement = code, {}, None, ""
        if semicolon_before:
            # Stata restores `cr` at the end of every do-file/include, so re-enter `;` mode and
            # hide the echo of that injected line.
            run_code = _DELIMIT_PREFIX + code
            if len(code.strip().splitlines()) == 1:
                # Keep single-line input un-echoed, as it would be in `cr` mode.
                run_kwargs = {"echo": False}
                prefix = "\ndelimiter now ;\n"
            else:
                prefix, replacement = "\n. #delimit ;\ndelimiter now ;\n", "\n"

        out_cb = stdout_callback
        prefix_filter = None
        if prefix and stdout_callback:
            prefix_filter = out_cb = _PrefixFilter(stdout_callback, prefix, replacement)

        # Capture output with streaming interceptors
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        capture_out = _StreamInterceptor(callback=out_cb)
        capture_err = _StreamInterceptor(callback=stderr_callback)
        sys.stdout = capture_out
        sys.stderr = capture_err
        self._output_router.target = capture_out

        error = None
        interrupted = False
        self._begin_user_run()
        try:
            self._stata.run(run_code, **run_kwargs)
            self._drain_output(capture_out)
        except KeyboardInterrupt:
            # A SIGINT handled by Python's default handler once Stata returned control.
            error = BREAK_MESSAGE
            interrupted = True
        except Exception as e:
            # PyStata raises on a non-zero Stata return code; the message ends with "r(###);".
            # After an interrupt it is SystemError("--Break--\nr(1);...").
            error = (str(e) + self._drain_output(None)).rstrip("\n")
            if not error:
                # PyStata's output thread can stream the error text itself and raise with an
                # empty message (seen after interrupts).
                error = (BREAK_MESSAGE if self._break_requested
                         else f"{type(e).__name__} raised while running Stata code")
        finally:
            break_requested = self._end_user_run()
            self._output_router.target = None
            sys.stdout = old_stdout
            sys.stderr = old_stderr
            if prefix_filter:
                prefix_filter.flush()
        if error and (interrupted or (break_requested and "--Break--" in error)):
            interrupted = True

        browse_request = self._consume_browse_request()
        if browse_request is not None:
            request_open_data_explorer = True

        # The final state is taken from the code as written, even if Stata stopped early.
        self.semicolon_delimiter = semicolon_after

        stdout_str = capture_out.getvalue()
        stderr_str = pre_stderr + capture_err.getvalue()
        if prefix:
            stdout_str = _replace_prefix(stdout_str, prefix, replacement)
            if error:
                error = _replace_prefix(error, prefix, replacement)

        # Check for generated plots
        plots = self._check_and_export_plots(code)

        # Check if dataset state changed
        dataset_changed = self._check_dataset_changed()
        results_changed = self._check_results_changed()

        return ExecutionResult(
            stdout=stdout_str,
            stderr=stderr_str,
            plots=plots,
            dataset_changed=dataset_changed,
            request_open_data_explorer=request_open_data_explorer,
            error=error,
            results_changed=results_changed,
            browse_request=browse_request,
            interrupted=interrupted,
        )

    def _drain_output(self, stream):
        """Forward output PyStata left in Stata's buffer.

        PyStata's output thread reads the buffer, then checks whether the command finished;
        if Stata finishes in between, it prints the stale (often empty) read and exits, and the
        rest of the output is never fetched (~5% of short commands lose all output, measured).
        """
        get_output = getattr(self._config, "get_output", None)
        if get_output is None:
            return ""
        try:
            rest = get_output()
        except Exception:
            return ""
        if rest and stream is not None:
            stream.write(rest)
        return rest or ""

    # ----- Interrupts -----

    def _begin_user_run(self):
        with self._break_lock:
            self._user_run_active = True
            self._break_requested = False

    def _end_user_run(self) -> bool:
        """Mark the user's run as finished; return whether a break was requested during it."""
        with self._break_lock:
            self._user_run_active = False
            requested, self._break_requested = self._break_requested, False
            return requested

    @property
    def is_running_user_code(self) -> bool:
        return self._user_run_active

    def request_break(self) -> bool:
        """Ask Stata to stop the user's code, as the Break key does. Safe from any thread.

        Returns True if a run was in progress. Stata stops at its next check, and
        `stata.run` raises SystemError("--Break--\\nr(1);"), leaving the session usable.
        Outside user code (idle, or the kernel's helper runs) this does nothing.
        """
        with self._break_lock:
            if not self._user_run_active or self._stlib is None:
                return False
            try:
                self._stlib.StataSO_SetBreak()
            except Exception:
                return False
            self._break_requested = True
            return True

    def _guard_pause(self, stripped_code: str) -> str:
        """Make sure `pause` cannot block; return a one-time note for the console, if any."""
        if self._pause_guard_needed:
            self._pause_guard_needed = False
            try:
                ado_dir = tempfile.mkdtemp(prefix="positron_stata_ado_")
                atexit.register(shutil.rmtree, ado_dir, True)
                with open(os.path.join(ado_dir, "pause.ado"), "w", encoding="utf-8") as f:
                    f.write(_PAUSE_ADO + "\n")
                with open(os.path.join(ado_dir, "browse.ado"), "w", encoding="utf-8") as f:
                    f.write(_BROWSE_ADO + "\n")
                for alias in _BROWSE_ALIASES:
                    with open(os.path.join(ado_dir, f"{alias}.ado"), "w", encoding="utf-8") as f:
                        f.write(f"*! browse alias installed by the Positron Stata kernel\n"
                                f"program define {alias}\n    browse `0'\nend\n")
                # Prepend to the adopath by editing S_ADO directly: `adopath ++` is an rclass
                # ado program and would overwrite r(). S_ADO also survives `macro drop _all`.
                ado_path = self._sfi.Macro.getGlobal("S_ADO") or "BASE;SITE;.;PERSONAL;PLUS;OLDPLACE"
                entry = '`"' + ado_dir.replace("\\", "/") + "\"'"
                self._sfi.Macro.setGlobal("S_ADO", f"{entry};{ado_path}")
                self._browse_shim_installed = True
            except Exception:
                # Fall back to turning pause off so a later `pause` is a no-op.
                try:
                    self._sfi.Macro.setGlobal("PAUSEON", "")
                except Exception:
                    pass
        if not self._pause_note_shown and _PAUSE_ON.search(stripped_code):
            self._pause_note_shown = True
            return PAUSE_NOTE
        return ""

    def evaluate_expression(self, expression: str) -> Tuple[bool, str]:
        """Evaluate `display <expression>` without echoing to the console.

        Returns (True, text) or (False, Stata's error message). Used for Jupyter
        `user_expressions` (e.g. Quarto inline code); `display` leaves r()/e() untouched.
        """
        if not self._initialized:
            self.initialize()
        expression = expression.strip().rstrip(";").strip()
        if not expression:
            return False, "empty expression"
        if "\n" in expression or "\r" in expression:
            return False, "expression must be on a single line"
        old_stdout, old_stderr = sys.stdout, sys.stderr
        capture = _StreamInterceptor()
        sys.stdout = sys.stderr = capture
        self._output_router.target = capture
        try:
            self._stata.run(f"display {expression}", echo=False)
            self._drain_output(capture)
        except Exception as e:
            return False, (str(e) + self._drain_output(None)).strip() or type(e).__name__
        finally:
            self._output_router.target = None
            sys.stdout, sys.stderr = old_stdout, old_stderr
        # Formats such as %9.2f pad with spaces, which inline (Quarto) output shouldn't carry.
        return True, capture.getvalue().strip()

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

    # ----- Stored results (e(), r()) and frames, for the Variables pane -----

    def get_stored_result_names(self) -> Dict[Tuple[str, str], List[str]]:
        """Names of e()/r() numeric scalars, macros and matrices, keyed by (class, kind).

        Uses Mata's st_dir() via SFIToolkit.stata, which runs no ado code, prints nothing and
        leaves r()/e() intact. Internal names starting with `_` are skipped.
        """
        empty = {key: [] for key in _RESULT_GLOBALS}
        if not self._initialized or self._sfi is None:
            return empty
        try:
            self._sfi.SFIToolkit.stata(_RESULT_NAMES_MATA)
            names = {}
            for key, g in _RESULT_GLOBALS.items():
                names[key] = [n for n in (self._sfi.Macro.getGlobal(g) or "").split() if not n.startswith("_")]
                self._sfi.Macro.setGlobal(g, "")
            return names
        except Exception:
            return empty

    def get_stored_results(self, cls: str, names: Optional[Dict] = None) -> Dict[str, List[Tuple]]:
        """Values of e() (cls="e") or r() (cls="r") results.

        Returns {"numscalar": [(name, value)], "macro": [(name, text)], "matrix": [(name, rows, cols)]}.
        """
        names = names if names is not None else self.get_stored_result_names()
        sfi = self._sfi
        out = {"numscalar": [], "macro": [], "matrix": []}
        if sfi is None:
            return out
        for name in names.get((cls, "numscalar"), []):
            out["numscalar"].append((name, _optional_value(lambda: sfi.Scalar.getValue(f"{cls}({name})"))))
        for name in names.get((cls, "macro"), []):
            out["macro"].append((name, _optional(lambda: sfi.Macro.getGlobal(f"{cls}({name})"))))
        for name in names.get((cls, "matrix"), []):
            try:
                full = f"{cls}({name})"
                out["matrix"].append((name, sfi.Matrix.getRowTotal(full), sfi.Matrix.getColTotal(full)))
            except Exception:
                pass
        return out

    def get_matrix(self, cls: str, name: str) -> Tuple[List[List[Optional[float]]], List[str], List[str]]:
        """Values (None for missing), row names and column names of matrix `cls(name)`."""
        full = f"{cls}({name})"
        sfi = self._sfi
        values = [[None if _is_missing(v) else v for v in row] for row in sfi.Matrix.get(full)]
        rows = self._matrix_names(full, "row", len(values))
        cols = self._matrix_names(full, "col", len(values[0]) if values else 0)
        return values, rows, cols

    def _matrix_names(self, full: str, which: str, count: int) -> List[str]:
        # `: colfullnames` includes equation names (e.g. "1:mpg" after mlogit); plain names
        # would repeat across equations.
        try:
            names = self._sfi.SFIToolkit.macroExpand(f"`: {which}fullnames {full}'").split()
            if len(names) == count:
                return names
        except Exception:
            pass
        getter = self._sfi.Matrix.getRowNames if which == "row" else self._sfi.Matrix.getColNames
        try:
            names = list(getter(full))
            if len(names) == count:
                return names
        except Exception:
            pass
        return [f"{which}{i + 1}" for i in range(count)]

    def get_matrix_dataframe(self, cls: str, name: str):
        import pandas as pd
        values, rows, cols = self.get_matrix(cls, name)
        seen: Dict[str, int] = {}
        unique_cols = []
        for c in cols:
            seen[c] = seen.get(c, 0) + 1
            unique_cols.append(c if seen[c] == 1 else f"{c}_{seen[c]}")
        return pd.DataFrame(values, index=rows, columns=unique_cols, dtype=float)

    def get_frames(self) -> List[Dict[str, Any]]:
        """Frames in memory (Stata 16+) as [{name, obs, vars, current}]."""
        if not self._initialized or self._sfi is None:
            return []
        frame_api = getattr(self._sfi, "Frame", None)
        if frame_api is None:
            return []
        try:
            current = frame_api.getCWF()
            frames = []
            for i in range(frame_api.getFrameCount()):
                name = frame_api.getFrameAt(i)
                frame = frame_api.connect(name)
                frames.append({
                    "name": name,
                    "obs": frame.getObsTotal(),
                    "vars": frame.getVarCount(),
                    "current": name == current,
                })
            return frames
        except Exception:
            return []

    def get_frame_variables(self, name: str) -> List[Tuple[str, str, str]]:
        """(name, type, label) for each variable in frame `name`."""
        frame = self._sfi.Frame.connect(name)
        return [
            (frame.getVarName(i), frame.getVarType(i), _optional(lambda idx=i: frame.getVarLabel(idx)))
            for i in range(frame.getVarCount())
        ]

    def get_frame_dataframe(self, name: str):
        return self.get_dataframe(frame=name)

    def _results_signature(self) -> Tuple:
        names = self.get_stored_result_names()
        sfi = self._sfi
        r_scalars = tuple(
            _optional_value(lambda n=n: sfi.Scalar.getValue(f"r({n})")) for n in names[("r", "numscalar")]
        )
        r_macros = tuple(_optional(lambda n=n: sfi.Macro.getGlobal(f"r({n})")) for n in names[("r", "macro")])
        return (
            tuple((key, tuple(v)) for key, v in sorted(names.items())),
            _optional(lambda: sfi.Macro.getGlobal("e(cmdline)")),
            _optional_value(lambda: sfi.Scalar.getValue("e(N)")),
            r_scalars,
            r_macros,
            tuple(tuple(sorted(f.items())) for f in self.get_frames()),
        )

    def _check_results_changed(self) -> bool:
        try:
            signature = self._results_signature()
        except Exception:
            return False
        changed = signature != self._last_results_signature
        self._last_results_signature = signature
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

    # ----- Data Explorer snapshots -----

    def _consume_browse_request(self) -> Optional[BrowseRequest]:
        """Read and clear the request recorded by the browse shim during the last run."""
        if not self._browse_shim_installed or self._sfi is None:
            return None
        macro = self._sfi.Macro
        try:
            if (macro.getGlobal(_BROWSE_GLOBAL) or "").strip() != "1":
                return None
            variables = (macro.getGlobal(_BROWSE_VARS_GLOBAL) or "").split()
            nolabel = bool((macro.getGlobal(_BROWSE_NOLABEL_GLOBAL) or "").strip())
            subset = (macro.getGlobal(_BROWSE_SUBSET_GLOBAL) or "").strip() == "1"
            for g in (_BROWSE_GLOBAL, _BROWSE_VARS_GLOBAL, _BROWSE_NOLABEL_GLOBAL, _BROWSE_SUBSET_GLOBAL):
                macro.setGlobal(g, "")
        except Exception:
            return None
        obs = self._read_browse_obs() if subset else None
        return BrowseRequest(variables, obs, value_labels=value_labels_enabled() and not nolabel)

    def _read_browse_obs(self):
        """0-based indices of the observations selected by `browse ... if/in` (None if unknown)."""
        import numpy as np
        mata = getattr(self._sfi, "Mata", None)
        if mata is None:
            return None
        try:
            if mata.getRowTotal(_BROWSE_OBS_MATA) * mata.getColTotal(_BROWSE_OBS_MATA) == 0:
                obs = np.empty(0, dtype=np.int64)
            elif hasattr(mata, "toNPArray"):
                obs = np.asarray(mata.toNPArray(_BROWSE_OBS_MATA)).ravel().astype(np.int64) - 1
            else:
                obs = np.asarray(mata.get(_BROWSE_OBS_MATA), dtype=float).ravel().astype(np.int64) - 1
        except Exception:
            obs = None
        try:
            self._sfi.SFIToolkit.stata(f"capture mata: mata drop {_BROWSE_OBS_MATA}")
        except Exception:
            pass
        return obs

    def _current_frame(self) -> str:
        frame_api = getattr(self._sfi, "Frame", None)
        name = _optional(frame_api.getCWF) if frame_api is not None else ""
        return name or _optional(lambda: self._sfi.Macro.getGlobal("c(frame)")) or "default"

    def get_dataframe(self, request: Optional[BrowseRequest] = None, frame: Optional[str] = None):
        """The in-memory dataset (or frame `frame`) as a pandas DataFrame for the Data Explorer.

        Like Stata's browser: missing values are NaN, the row labels are observation numbers
        (1-based), and value-labeled variables are ordered Categoricals whose category order
        follows the numeric codes (so sorting matches Stata), unless labels are disabled via
        POSITRON_STATA_VALUE_LABELS=0 or `browse, nolabel`. `request` limits the variables and
        observations. Returns None when there is nothing to show; never changes the data.
        """
        import pandas as pd
        if not self._initialized:
            return pd.DataFrame()
        if request is None:
            request = BrowseRequest(value_labels=value_labels_enabled())
        source = frame or self._current_frame()
        try:
            df, labels, ext_missing = self._snapshot_via_file(source, request)
        except Exception:
            try:
                df, labels, ext_missing = self._snapshot_via_sfi(source, request)
            except Exception:
                return pd.DataFrame()
        if df is None:
            return None
        return _finish_browse_frame(df, request, labels if request.value_labels else {}, ext_missing)

    def _snapshot_via_file(self, source: str, request: BrowseRequest):
        """Copy the data into a scratch frame, save it and read it with pandas.

        About 3-4x faster than PyStata's pdataframe_from_data (which builds Python lists) on
        large data. The scratch frame means `save` never touches the user's c(filename) or
        c(changed), and r() is held and restored around the helper commands.
        """
        import pandas as pd
        fd, path = tempfile.mkstemp(prefix="positron_stata_browse_", suffix=".dta")
        os.close(fd)
        variables = " ".join(request.variables)
        copy = (f"frame {source}: frame put {variables}, into({_BROWSE_FRAME})" if variables
                else f"frame copy {source} {_BROWSE_FRAME}")
        run = lambda code: self._stata.run(code, quietly=True, echo=False)
        current = self._current_frame()
        try:
            try:
                run(f"_return hold {_BROWSE_FRAME}\ncapture frame drop {_BROWSE_FRAME}\n{copy}\n"
                    f"frame change {_BROWSE_FRAME}")
                if self._sfi.Data.getObsTotal() <= 0 and self._sfi.Data.getVarCount() == 0:
                    return None, {}, {}
                labels = self._value_label_maps() if request.value_labels else {}
                stata_path = path.replace("\\", "/")
                run(f'save "{stata_path}", replace')
            finally:
                run(f"frame change {current}\ncapture frame drop {_BROWSE_FRAME}\n"
                    f"capture _return restore {_BROWSE_FRAME}")
            df = pd.read_stata(path, convert_dates=False, convert_categoricals=False,
                               convert_missing=False, preserve_dtypes=True)
            # Labeled extended missing values (.a-.z, e.g. "Refused") need a second read that
            # keeps them apart; plain NaN otherwise.
            ext_missing = {}
            ext_cols = [c for c, m in labels.items() if any(isinstance(k, str) for k in m)]
            if ext_cols:
                raw = pd.read_stata(path, columns=ext_cols, convert_dates=False,
                                    convert_categoricals=False, convert_missing=True)
                for c in ext_cols:
                    ext_missing[c] = _extended_missing_codes(raw[c])
            return df, labels, ext_missing
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

    def _snapshot_via_sfi(self, source: str, request: BrowseRequest):
        """Fallback: PyStata's own conversion (slower; extended missing values are not kept)."""
        import numpy as np
        var = request.variables or None
        if source == self._current_frame():
            df = self._stata.pdataframe_from_data(var=var, missingval=np.nan)
            labels = self._value_label_maps(request.variables) if request.value_labels else {}
        else:
            df = self._stata.pdataframe_from_frame(source, var=var, missingval=np.nan)
            labels = {}
        return df, labels, {}

    def _value_label_maps(self, variables: Optional[List[str]] = None) -> Dict[str, Dict]:
        """{variable: {code: label}} for value-labeled variables in the current frame."""
        api = getattr(self._sfi, "ValueLabel", None)
        if api is None:
            return {}
        data = self._sfi.Data
        wanted = set(variables or [])
        cache: Dict[str, Dict] = {}
        out = {}
        for i in range(data.getVarCount()):
            name = data.getVarName(i)
            if wanted and name not in wanted:
                continue
            if data.getVarType(i).startswith("str"):
                continue
            lab = _optional(lambda idx=i: api.getVarValueLabel(idx))
            if not lab:
                continue
            if lab not in cache:
                cache[lab] = _optional_value(lambda: api.getValueLabels(lab)) or {}
            if cache[lab]:
                out[name] = cache[lab]
        return out

    def get_variable_names(self) -> List[str]:
        """Return variable names in the current dataset."""
        if not self._initialized or not self._sfi:
            return []
        try:
            return [self._sfi.Data.getVarName(i) for i in range(self._sfi.Data.getVarCount())]
        except Exception:
            return []
