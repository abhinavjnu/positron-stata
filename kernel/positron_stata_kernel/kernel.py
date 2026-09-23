"""
PositronStataKernel: First-class Jupyter Kernel for Stata in Positron.
Handles execution, streaming output, plots, Variables pane comms, UI/Help comms, and Data Explorer comms.
"""

import os
import sys
from typing import Optional

from . import _positron_loader

# CRITICAL: Import ipkernel first so comm registers ipykernel.comm.manager.CommManager
from ipykernel import ipkernel
from ipykernel.kernelbase import Kernel
import comm

from positron.data_explorer import DataExplorerService
from positron.utils import BackgroundJobQueue

from .stata_engine import StataEngine
from .variables_handler import StataVariablesHandler
from .ui_handler import StataUiHandler
from .help_handler import StataHelpHandler

class PositronStataKernel(Kernel):
    implementation = "positron_stata"
    implementation_version = "0.1.0"
    language = "stata"
    language_version = "19.5"
    language_info = {
        "name": "stata",
        "version": "19.5",
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

    async def do_is_complete(self, code: str):
        clean = code.strip()
        if not clean:
            return {"status": "complete", "indent": ""}
        lines = [line.strip() for line in clean.splitlines() if line.strip()]
        if lines and lines[-1].endswith("///"):
            return {"status": "incomplete", "indent": "    "}
        if "/*" in clean and "*/" not in clean.rsplit("/*", 1)[-1]:
            return {"status": "incomplete", "indent": "    "}
        return {"status": "complete", "indent": ""}

    def do_execute(self, code, silent, store_history=True, user_expressions=None, allow_stdin=False):
        code_trimmed = code.strip()
        if not code_trimmed:
            return {
                "status": "ok",
                "execution_count": self.execution_count,
                "payload": [],
                "user_expressions": {},
            }


        # Handle help commands directly
        if code_trimmed.lower().startswith("help "):
            topic = code_trimmed.split(maxsplit=1)[1].strip()
            self.help_handler.show_help(topic)

        # Stream callbacks
        stdout_cb = (lambda text: self._send_stdout(text)) if not silent else None
        stderr_cb = (lambda text: self._send_stderr(text)) if not silent else None

        # Execute code in active engine with live streaming
        res = self.engine.execute(code, stdout_callback=stdout_cb, stderr_callback=stderr_cb)

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

        # If dataset changed, refresh Variables pane
        if res.dataset_changed:
            self.variables_handler.send_refresh_event()

        # If user ran `browse` or `view`, open Data Explorer tab immediately
        if res.request_open_data_explorer:
            self.open_data_explorer_for_current_dataset()

        return {
            "status": "ok",
            "execution_count": self.execution_count,
            "payload": [],
            "user_expressions": {},
        }

    def open_data_explorer_for_current_dataset(self) -> Optional[str]:
        """Convert in-memory Stata data to DataFrame and register with Positron Data Explorer."""
        df = self.engine.get_dataframe()
        if df is None or df.empty:
            self._send_stderr("No data in memory to browse.\n")
            return None

        info = self.engine.get_current_dataset_info()
        title = info.get("name", "Current Dataset")

        try:
            comm_id = self.data_explorer_service.register_table(
                df,
                title=title,
                variable_path=["current_dataset"]
            )
            return comm_id
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
