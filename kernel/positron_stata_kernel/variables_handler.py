"""
VariablesHandler: Implements the 'positron.variables' comm for Stata.
Surfaces the active Stata dataset, observation/variable count, labels,
and sends events to refresh the Variables pane.
"""

import sys
import time
from typing import Any, Dict, List, Optional

from . import _positron_loader
from positron.variables_comm import (
    Variable, VariableKind, VariableList, RefreshParams, InspectedVariable,
    VariablesBackendMessageContent, ListRequest, InspectRequest, ViewRequest,
    VariablesFrontendEvent,
)
from positron.positron_comm import PositronComm, JsonRpcErrorCode

class StataVariablesHandler:
    def __init__(self, kernel):
        self.kernel = kernel
        self._comm: Optional[PositronComm] = None
        self._version = 0

    def on_comm_open(self, base_comm, _msg):
        self._comm = PositronComm(base_comm)
        self._comm.on_msg(self.handle_msg, VariablesBackendMessageContent)
        self.send_refresh_event()

    def handle_msg(self, msg, raw_msg):
        request = msg.content.data
        if isinstance(request, ListRequest):
            self._send_list()
        elif isinstance(request, InspectRequest):
            self._inspect_var(request.params.path)
        elif isinstance(request, ViewRequest):
            self._perform_view_action(request.params.path)
        else:
            self._send_error(
                JsonRpcErrorCode.METHOD_NOT_FOUND,
                f"{type(request).__name__} is not supported by the Stata kernel",
            )

    def _get_variables(self) -> List[Variable]:
        variables = []
        info = self.kernel.engine.get_current_dataset_info()

        # If a dataset exists in memory
        if info.get("obs", 0) > 0 or info.get("vars", 0) > 0:
            obs = info.get("obs", 0)
            vars_cnt = info.get("vars", 0)
            name = info.get("name", "Current Dataset")
            
            var = Variable(
                access_key="current_dataset",
                display_name=name,
                display_type=f"{obs:,} obs, {vars_cnt} vars",
                display_value=f"Stata Dataset: {obs:,} observations × {vars_cnt} variables",
                has_children=True,
                has_viewer=True,
                is_truncated=False,
                kind=VariableKind.Table,
                length=obs,
                size=obs * max(vars_cnt, 1) * 8,
                type_info="Stata Dataset",
                updated_time=int(time.time() * 1000)
            )
            variables.append(var)

        return variables

    def send_refresh_event(self):
        if self._comm is not None:
            self._version += 1
            variables = self._get_variables()
            params = RefreshParams(
                variables=variables,
                length=len(variables),
                version=self._version,
            )
            self._comm.send_event(VariablesFrontendEvent.Refresh.value, params.dict())

    def _send_list(self):
        variables = self._get_variables()
        var_list = VariableList(
            variables=variables,
            length=len(variables),
            version=self._version,
        )
        self._send_result(var_list.dict())

    def _inspect_var(self, path: List[str]):
        if not path:
            self._send_result(InspectedVariable(children=[], length=0).dict())
            return

        root = path[0]
        if root == "current_dataset":
            info = self.kernel.engine.get_current_dataset_info()
            var_names = info.get("var_names", [])
            var_labels = info.get("var_labels", {})
            var_types = info.get("var_types", {})
            var_formats = info.get("var_formats", {})
            var_value_labels = info.get("var_value_labels", {})

            children = []
            for name in var_names:
                vtype = var_types.get(name, "") or "var"
                vlabel = var_labels.get(name, "")
                vformat = var_formats.get(name, "")
                value_label = var_value_labels.get(name, "")

                kind = VariableKind.String if "str" in vtype else VariableKind.Number
                details = [vtype] + [d for d in (vformat, f"value label: {value_label}" if value_label else "") if d]

                child = Variable(
                    access_key=name,
                    display_name=name,
                    display_type=vtype,
                    display_value=vlabel or vformat,
                    has_children=False,
                    has_viewer=False,
                    is_truncated=False,
                    kind=kind,
                    length=info.get("obs", 0),
                    size=0,
                    type_info=", ".join(details),
                    updated_time=int(time.time() * 1000),
                )
                children.append(child)

            self._send_result(InspectedVariable(children=children, length=len(children)).dict())
        else:
            self._send_result(InspectedVariable(children=[], length=0).dict())

    def _perform_view_action(self, path: List[str]):
        """Open Data Explorer for the requested variable."""
        if not path or path[0] == "current_dataset":
            comm_id = self.kernel.open_data_explorer_for_current_dataset()
            self._send_result(comm_id)
        else:
            self._send_error(JsonRpcErrorCode.INVALID_PARAMS, f"Cannot view path: {path}")

    def _send_result(self, result: Any):
        if self._comm is not None:
            self._comm.send_result(result)

    def _send_error(self, code: JsonRpcErrorCode, message: str):
        if self._comm is not None:
            self._comm.send_error(code, message)
