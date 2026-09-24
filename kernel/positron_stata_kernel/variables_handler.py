"""
VariablesHandler: Implements the 'positron.variables' comm for Stata.
Surfaces the active Stata dataset, observation/variable count, labels,
estimation (e()) and stored (r()) results, other frames,
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

from .stata_engine import format_number

_RESULT_GROUPS = {"e": "e() results", "r": "r() results"}
_FRAMES_KEY = "frames"
# Matrices can be large (e(V) with many regressors); cap what the pane previews.
_MAX_CHILDREN = 200
_MAX_PREVIEW_VALUES = 8
# Shown first in the e() group, in this order; the rest keep Stata's order.
_E_MACRO_ORDER = ("cmd", "cmdline", "depvar", "title", "vce")


def _now() -> int:
    return int(time.time() * 1000)


def _variable(access_key, display_name, display_value, display_type, kind, *, type_info="",
              has_children=False, has_viewer=False, length=0, size=0) -> Variable:
    display_value = str(display_value)
    truncated = len(display_value) > 1000
    return Variable(
        access_key=access_key,
        display_name=display_name,
        display_value=display_value[:1000],
        display_type=display_type,
        type_info=type_info or display_type,
        kind=kind,
        length=length,
        size=size,
        has_children=has_children,
        has_viewer=has_viewer,
        is_truncated=truncated,
        updated_time=_now(),
    )


def _preview(labels, values) -> str:
    parts = [f"{label}={format_number(v)}" for label, v in zip(labels, values)][:_MAX_PREVIEW_VALUES]
    more = ", …" if len(values) > _MAX_PREVIEW_VALUES else ""
    return ", ".join(parts) + more

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

        engine = self.kernel.engine
        names = engine.get_stored_result_names()
        for cls in ("e", "r"):
            results = engine.get_stored_results(cls, names)
            group = self._results_group(cls, results)
            if group is not None:
                variables.append(group)

        frames_var = self._frames_group(engine.get_frames())
        if frames_var is not None:
            variables.append(frames_var)

        return variables

    # ----- e() / r() results -----

    def _results_group(self, cls: str, results) -> Optional[Variable]:
        count = sum(len(v) for v in results.values())
        if count == 0:
            return None
        scalars = dict(results["numscalar"])
        macros = dict(results["macro"])
        if cls == "e":
            summary = [macros.get("cmdline") or macros.get("cmd") or "estimation results"]
        else:
            summary = []
        if "N" in scalars:
            summary.append(f"N={format_number(scalars['N'])}")
        for key, label in (("r2", "R²"), ("r2_p", "pseudo R²")):
            if cls == "e" and key in scalars:
                summary.append(f"{label}={format_number(round(scalars[key], 4))}")
                break
        if cls == "r" and "mean" in scalars:
            summary.append(f"mean={format_number(scalars['mean'])}")
        if not summary:
            summary.append(f"{count} result{'s' if count != 1 else ''}")
        return _variable(
            cls, _RESULT_GROUPS[cls], ", ".join(summary), f"{cls}() results [{count}]", VariableKind.Map,
            type_info="Stata stored results", has_children=True, length=count,
        )

    def _result_children(self, cls: str) -> List[Variable]:
        results = self.kernel.engine.get_stored_results(cls)
        macros = results["macro"]
        if cls == "e":
            order = {name: i for i, name in enumerate(_E_MACRO_ORDER)}
            macros = sorted(macros, key=lambda item: order.get(item[0], len(order)))
        children = []
        for name, text in macros:
            children.append(_variable(
                f"macro:{name}", f"{cls}({name})", text, "macro", VariableKind.String,
                type_info="Stata macro", length=len(text), size=len(text),
            ))
        for name, value in results["numscalar"]:
            children.append(_variable(
                f"scalar:{name}", f"{cls}({name})", format_number(value), "scalar", VariableKind.Number,
                type_info="Stata scalar", size=8,
            ))
        for name, rows, cols in results["matrix"]:
            children.append(self._matrix_variable(cls, name, rows, cols))
        return children

    def _matrix_variable(self, cls: str, name: str, rows: int, cols: int) -> Variable:
        value = f"{rows} × {cols} matrix"
        if rows == 1:
            try:
                values, _, colnames = self.kernel.engine.get_matrix(cls, name)
                value = _preview(colnames, values[0])
            except Exception:
                pass
        return _variable(
            f"matrix:{name}", f"{cls}({name})", value, f"matrix [{rows}×{cols}]", VariableKind.Table,
            type_info="Stata matrix", has_children=rows * cols > 0, has_viewer=True,
            length=rows, size=rows * cols * 8,
        )

    def _matrix_children(self, cls: str, name: str) -> List[Variable]:
        values, rownames, colnames = self.kernel.engine.get_matrix(cls, name)
        if len(values) == 1:
            # Row vectors such as e(b): one child per coefficient.
            return [
                _variable(f"col:{j}", col, format_number(v), "number", VariableKind.Number, size=8)
                for j, (col, v) in enumerate(zip(colnames, values[0]))
            ][:_MAX_CHILDREN]
        return [
            _variable(
                f"row:{i}", row, _preview(colnames, vals), f"row [{len(vals)}]", VariableKind.Collection,
                type_info="Stata matrix row", length=len(vals), size=len(vals) * 8,
            )
            for i, (row, vals) in enumerate(zip(rownames, values))
        ][:_MAX_CHILDREN]

    # ----- frames -----

    def _frames_group(self, frames) -> Optional[Variable]:
        current = next((f["name"] for f in frames if f["current"]), "default")
        if len(frames) <= 1 and current == "default":
            return None
        return _variable(
            _FRAMES_KEY, "Frames", f"{len(frames)} frames (current: {current})", f"frames [{len(frames)}]",
            VariableKind.Map, type_info="Stata frames", has_children=True, length=len(frames),
        )

    def _frame_children(self) -> List[Variable]:
        children = []
        for f in self.kernel.engine.get_frames():
            current = " (current)" if f["current"] else ""
            children.append(_variable(
                f"frame:{f['name']}", f["name"] + current,
                f"Stata frame: {f['obs']:,} observations × {f['vars']} variables",
                f"{f['obs']:,} obs, {f['vars']} vars", VariableKind.Table,
                type_info="Stata frame", has_children=f["vars"] > 0, has_viewer=True,
                length=f["obs"], size=f["obs"] * max(f["vars"], 1) * 8,
            ))
        return children

    def _frame_variable_children(self, frame: str) -> List[Variable]:
        return [
            _variable(
                name, name, label, vtype or "var",
                VariableKind.String if "str" in (vtype or "") else VariableKind.Number,
            )
            for name, vtype, label in self.kernel.engine.get_frame_variables(frame)
        ]

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
            return

        try:
            children = self._children_for_path(path)
        except Exception as e:
            self._send_error(JsonRpcErrorCode.INVALID_PARAMS, f"Cannot inspect path {path}: {e}")
            return
        self._send_result(InspectedVariable(children=children, length=len(children)).dict())

    def _children_for_path(self, path: List[str]) -> List[Variable]:
        root = path[0]
        if root in _RESULT_GROUPS:
            if len(path) == 1:
                return self._result_children(root)
            if len(path) == 2 and path[1].startswith("matrix:"):
                return self._matrix_children(root, path[1][len("matrix:"):])
        elif root == _FRAMES_KEY:
            if len(path) == 1:
                return self._frame_children()
            if len(path) == 2 and path[1].startswith("frame:"):
                return self._frame_variable_children(path[1][len("frame:"):])
        return []

    def _perform_view_action(self, path: List[str]):
        """Open Data Explorer for the requested variable."""
        if not path or path[0] == "current_dataset":
            comm_id = self.kernel.open_data_explorer_for_current_dataset()
            self._send_result(comm_id)
            return

        engine = self.kernel.engine
        try:
            if len(path) == 2 and path[0] in _RESULT_GROUPS and path[1].startswith("matrix:"):
                name = path[1][len("matrix:"):]
                df = engine.get_matrix_dataframe(path[0], name)
                title = f"{path[0]}({name})"
            elif len(path) == 2 and path[0] == _FRAMES_KEY and path[1].startswith("frame:"):
                name = path[1][len("frame:"):]
                df = engine.get_frame_dataframe(name)
                title = f"frame {name}"
            else:
                self._send_error(JsonRpcErrorCode.INVALID_PARAMS, f"Cannot view path: {path}")
                return
        except Exception as e:
            self._send_error(JsonRpcErrorCode.INTERNAL_ERROR, f"Cannot view {path}: {e}")
            return
        self._send_result(self.kernel.register_data_explorer_table(df, title, list(path)))

    def _send_result(self, result: Any):
        if self._comm is not None:
            self._comm.send_result(result)

    def _send_error(self, code: JsonRpcErrorCode, message: str):
        if self._comm is not None:
            self._comm.send_error(code, message)
