"""
StataUiHandler: Implements the 'positron.ui' comm for Stata.
Handles general UI requests like console width, module queries, and working directory synchronization.
"""

import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import _positron_loader
from positron.positron_comm import PositronComm, JsonRpcErrorCode
from positron.ui_comm import (
    UiBackendMessageContent,
    CallMethodRequest,
    EvaluateCodeRequest,
    DidChangePlotsRenderSettingsEvent,
    FrontendReadyEvent,
    WorkingDirectoryParams,
    UiFrontendEvent,
)

logger = logging.getLogger(__name__)


class StataUiHandler:
    def __init__(self, kernel):
        self.kernel = kernel
        self._comm: Optional[PositronComm] = None
        self.working_directory: Optional[Path] = None

    def on_comm_open(self, base_comm, _msg):
        self._comm = PositronComm(base_comm)
        self._comm.on_msg(self.handle_msg, UiBackendMessageContent)
        self.working_directory = None
        self.poll_working_directory()

    def handle_msg(self, msg, raw_msg):
        request = msg.content.data

        if isinstance(request, CallMethodRequest):
            rpc_request = request.params
            result = self._dispatch_method(rpc_request.method, rpc_request.params)
            if self._comm is not None:
                self._comm.send_result(data=result)

        elif isinstance(request, EvaluateCodeRequest):
            code = request.params.code
            try:
                res = self.kernel.engine.execute(code, interactive=False)
                if self._comm is not None:
                    if res.error:
                        self._comm.send_error(JsonRpcErrorCode.INTERNAL_ERROR, res.error)
                    else:
                        self._comm.send_result(data={"result": res.stdout, "output": res.stdout})
            except Exception as e:
                if self._comm is not None:
                    self._comm.send_error(JsonRpcErrorCode.INTERNAL_ERROR, str(e))

        elif isinstance(request, DidChangePlotsRenderSettingsEvent):
            # Positron notifying plot render setting changes
            pass

        elif isinstance(request, FrontendReadyEvent):
            self.poll_working_directory()

        else:
            logger.warning(f"Unhandled UI request: {request}")

    def _dispatch_method(self, method: str, params: List[Any]) -> Any:
        if method == "setConsoleWidth":
            return None
        elif method == "isModuleLoaded":
            return False
        elif method == "getLoadedModules":
            return []
        elif method == "getMissingImports":
            return []
        elif method == "getPackagesInstalled":
            return []
        elif method == "getPackageDetail":
            return None
        elif method == "checkRequiresPython":
            return True
        elif method == "poll_working_directory":
            self.poll_working_directory()
            return str(Path.cwd())
        return None

    def poll_working_directory(self) -> None:
        try:
            current_dir = Path.cwd()
            if current_dir != self.working_directory:
                self.working_directory = current_dir
                if self._comm is not None:
                    event = WorkingDirectoryParams(directory=str(current_dir))
                    self._comm.send_event(UiFrontendEvent.WorkingDirectory, event.dict())
        except Exception as e:
            logger.exception("Error polling working directory: %s", e)
