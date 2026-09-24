"""
PositronStataKernel: First-class Jupyter Kernel for Stata in Positron.
Handles execution, streaming output, plots, Variables pane comms, UI/Help comms, and Data Explorer comms.
"""

import os
import re
import signal
import socket
import threading
from typing import Optional

from . import _positron_loader

# CRITICAL: Import ipkernel first so comm registers ipykernel.comm.manager.CommManager
from ipykernel import ipkernel
from ipykernel.kernelbase import Kernel
import comm

from positron.data_explorer import DataExplorerService
from positron.utils import BackgroundJobQueue

from . import completeness
from .completer import complete_stata
from .stata_engine import StataEngine
from .variables_handler import StataVariablesHandler
from .ui_handler import StataUiHandler
from .help_handler import StataHelpHandler

class PositronStataKernel(Kernel):
    implementation = "positron_stata"
    implementation_version = "0.2.2"
    language = "stata"
    language_version = os.environ.get("STATA_VERSION", "19")
    language_info = {
        "name": "stata",
        "version": os.environ.get("STATA_VERSION", "19"),
        "mimetype": "text/x-stata",
        "file_extension": ".do",
        "pygments_lexer": "stata",
        "codemirror_mode": "stata",
        "positron": {
            "input_prompt": ". ",
            "continuation_prompt": "> ",
        },
    }
    banner = "Positron Stata Kernel"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # Initialize Jupyter Comm Manager
        self.comm_manager = comm.get_comm_manager()
        if self.comm_manager is None or not hasattr(self.comm_manager, "register_target"):
            from ipykernel.comm import CommManager
            self.comm_manager = CommManager(parent=self)
        self.comm_manager.kernel = self
        Kernel._instance = self

        comm_msg_types = ["comm_open", "comm_msg", "comm_close"]
        for msg_type in comm_msg_types:
            self.shell_handlers[msg_type] = getattr(self.comm_manager, msg_type)

        # Initialize Stata Engine
        stata_home = os.environ.get("STATA_HOME", "/usr/local/stata19")
        edition = os.environ.get("STATA_EDITION", "mp")
        version = os.environ.get("STATA_VERSION", "19")
        self.engine = StataEngine(stata_home=stata_home, edition=edition)
        self.banner = f"Positron Stata Kernel (Stata {version} {edition.upper()})"

        # Initialize Positron services
        self.job_queue = BackgroundJobQueue()
        self.data_explorer_service = DataExplorerService("positron.dataExplorer", self.job_queue)
        self.variables_handler = StataVariablesHandler(self)
        self.ui_handler = StataUiHandler(self)
        self.help_handler = StataHelpHandler(self)

        # Register Positron Comm Targets
        self.comm_manager.register_target("positron.variables", self.variables_handler.on_comm_open)
        self.comm_manager.register_target("positron.ui", self.ui_handler.on_comm_open)
        self.comm_manager.register_target("positron.help", self.help_handler.on_comm_open)
        self.comm_manager.register_target("positron.plot", lambda comm, msg: None)

        self._sigint_watcher = _SigintWatcher(self.engine.request_break) if os.name != "nt" else None

    # ----- Interrupts -----
    #
    # While Stata runs, the main thread is inside C (StataSO_Execute), so Python-level SIGINT
    # handlers cannot run until Stata finishes. Both interrupt modes therefore end in
    # StataEngine.request_break (StataSO_SetBreak) called from another thread, which stops
    # Stata like its Break key: the run fails with "--Break--\nr(1);" and the session stays
    # usable.

    def _send_interrupt_children(self):
        # interrupt_mode "message" (all platforms): ipykernel's control thread calls this for
        # an interrupt_request. The default sends SIGINT to the process group, which would
        # raise KeyboardInterrupt at an arbitrary point once Stata returns (and is not
        # supported on Windows), so break Stata directly instead. Outside user code there is
        # nothing long-running to stop.
        self.engine.request_break()

    def pre_handler_hook(self):
        # interrupt_mode "signal" (POSIX): ipykernel installs default_int_handler around every
        # shell handler. Replace it with a handler that never raises (a KeyboardInterrupt
        # escaping do_execute would leave the request without a reply) and route the C-level
        # signal through a wakeup fd to a watcher thread that breaks Stata immediately.
        super().pre_handler_hook()
        try:
            signal.signal(signal.SIGINT, self._on_sigint)
        except (ValueError, OSError):
            return
        if self._sigint_watcher is not None:
            self._sigint_watcher.arm()

    def post_handler_hook(self):
        if self._sigint_watcher is not None:
            self._sigint_watcher.disarm()
        super().post_handler_hook()

    def _on_sigint(self, signum, frame):
        # Runs once the main thread is back in Python; the watcher usually got there first.
        self.engine.request_break()

    async def do_is_complete(self, code: str):
        return completeness.check(code, semicolon_delimiter=self.engine.semicolon_delimiter)

    def do_complete(self, code: str, cursor_pos: int):
        return complete_stata(code, cursor_pos, self.engine.get_variable_names)

    def do_execute(self, code, silent, store_history=True, user_expressions=None, allow_stdin=False):
        code_trimmed = code.strip()
        if not code_trimmed:
            return self._ok_reply(user_expressions)

        help_code = code_trimmed
        if self.engine.semicolon_delimiter:
            help_code = help_code.rstrip("; \t")
        help_m = re.match(r"^(?:help|h)(?:\s+([a-zA-Z0-9_\.]+))?\s*$", help_code, re.IGNORECASE)
        if help_m and self.help_handler._comm is not None:
            topic = help_m.group(1) or "help"
            self.help_handler.show_help(topic)
            if not silent:
                self._send_stdout(f"Displaying Stata help for '{topic}' in the Help pane.\n")
            return self._ok_reply(user_expressions)

        stdout_cb = (lambda text: self._send_stdout(text)) if not silent else None
        stderr_cb = (lambda text: self._send_stderr(text)) if not silent else None

        try:
            res = self.engine.execute(code, stdout_callback=stdout_cb, stderr_callback=stderr_cb)
        except Exception as e:
            # Typically PyStata failing to initialise (bad STATA_HOME, licence, Python bitness).
            return self._error_reply(str(e), silent)

        # Send plots (displays in Positron's Plots tab)
        if res.plots and not silent:
            for plot_svg in res.plots:
                self.send_response(
                    self.iopub_socket,
                    "display_data",
                    {
                        "data": {"image/svg+xml": plot_svg},
                        "metadata": {}
                    }
                )

        # If the dataset, e()/r() results or frames changed, refresh Variables pane
        if res.dataset_changed or res.results_changed:
            self.variables_handler.send_refresh_event()

        # If user ran `browse` or `view`, open Data Explorer tab immediately
        if res.request_open_data_explorer:
            self.open_data_explorer_for_current_dataset(res.browse_request)

        self.ui_handler.poll_working_directory()

        if res.error:
            # Per ipykernel, user_expressions are only evaluated after successful execution.
            return self._error_reply(res.error, silent)
        return self._ok_reply(user_expressions)

    def _ok_reply(self, user_expressions=None):
        return {
            "status": "ok",
            "execution_count": self.execution_count,
            "payload": [],
            "user_expressions": self._evaluate_user_expressions(user_expressions),
        }

    def _evaluate_user_expressions(self, user_expressions) -> dict:
        """Evaluate Jupyter `user_expressions` (used by Quarto inline code) with `display`."""
        results = {}
        for key, expression in (user_expressions or {}).items():
            try:
                ok, text = self.engine.evaluate_expression(str(expression))
            except Exception as e:
                ok, text = False, str(e)
            if ok:
                results[key] = {"status": "ok", "data": {"text/plain": text}, "metadata": {}}
            else:
                results[key] = {
                    "status": "error",
                    "ename": "StataError",
                    "evalue": text,
                    "traceback": [text],
                }
        return results

    def _error_reply(self, message: str, silent: bool):
        # An empty ename makes Positron show Stata's message verbatim ("name: message" otherwise).
        content = {"ename": "", "evalue": message.rstrip("\n"), "traceback": []}
        if not silent:
            self.send_response(self.iopub_socket, "error", content)
        return {"status": "error", "execution_count": self.execution_count, **content}

    def open_data_explorer_for_current_dataset(self, request=None) -> Optional[str]:
        """Convert in-memory Stata data to DataFrame and register with Positron Data Explorer.

        `request` (a BrowseRequest from `browse varlist if in`) limits what is shown."""
        df = self.engine.get_dataframe(request)
        subset = request is not None and (bool(request.variables) or request.obs is not None)
        if df is None or len(df.columns) == 0 or (df.empty and not subset):
            self._send_stderr("No data in memory to browse.\n")
            return None

        info = self.engine.get_current_dataset_info()
        title = info.get("name", "Current Dataset")
        if subset:
            return self.register_data_explorer_table(df, f"{title} (subset)", None)
        return self.register_data_explorer_table(df, title, ["current_dataset"])

    def register_data_explorer_table(self, df, title: str, variable_path) -> Optional[str]:
        """Open a pandas DataFrame in Positron's Data Explorer; return the comm id."""
        try:
            return self.data_explorer_service.register_table(
                df,
                title=title,
                variable_path=variable_path,
            )
        except Exception as e:
            self._send_stderr(f"Failed to open Data Explorer: {e}\n")
            return None

    def _send_stdout(self, text: str):
        self.send_response(
            self.iopub_socket,
            "stream",
            {"name": "stdout", "text": text}
        )

    def _send_stderr(self, text: str):
        self.send_response(
            self.iopub_socket,
            "stream",
            {"name": "stderr", "text": text}
        )


class _SigintWatcher:
    """Calls `on_sigint` from a background thread as soon as SIGINT arrives.

    The C-level signal handler writes the signal number to the fd registered with
    signal.set_wakeup_fd even while the main thread is blocked in C. `arm()` registers our
    socket (main thread only) and `disarm()` restores the previous wakeup fd; bytes for other
    signals, or any SIGINT while a previous fd was registered (e.g. by an asyncio loop that
    uses add_signal_handler), are forwarded to it so its owner keeps working.
    """

    def __init__(self, on_sigint):
        self._on_sigint = on_sigint
        self._reader, self._writer = socket.socketpair()
        self._writer.setblocking(False)
        self._previous_fd = -1
        self._armed = False
        self._thread = threading.Thread(target=self._run, name="positron-stata-sigint", daemon=True)
        self._thread.start()

    def arm(self):
        try:
            self._previous_fd = signal.set_wakeup_fd(self._writer.fileno(), warn_on_full_buffer=False)
            self._armed = True
        except (ValueError, OSError):
            self._armed = False

    def disarm(self):
        if not self._armed:
            return
        self._armed = False
        try:
            signal.set_wakeup_fd(self._previous_fd)
        except (ValueError, OSError):
            pass
        self._previous_fd = -1

    def _run(self):
        while True:
            try:
                data = self._reader.recv(64)
            except OSError:
                return
            if not data:
                return
            if signal.SIGINT in data:
                try:
                    self._on_sigint()
                except Exception:
                    pass
            previous = self._previous_fd
            if previous not in (-1, None):
                try:
                    os.write(previous, data)
                except OSError:
                    pass
