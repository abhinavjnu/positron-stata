"""
OpenStataAdapter: Concrete bridge connecting positron-stata to open-stata-core.
Provides drop-in replacements for pystata (stata, config) and sfi (Data, Scalar, Matrix,
Macro, Frame, ValueLabel, SFIToolkit) so that positron-stata runs in-process without any
proprietary Stata license.
"""

import atexit
import ctypes
import json
import os
import re
import sys
import types
from typing import Any, Dict, List, Optional, Tuple


def _find_open_stata_library() -> Optional[str]:
    """Find the libopen_stata_core shared library."""
    custom = os.environ.get("OPEN_STATA_LIB")
    if custom and os.path.exists(custom):
        return custom

    candidates = [
        "/media/abhinav/WorkData/.cargo_target/release/libopen_stata_core.so",
        "/media/abhinav/WorkData/.cargo_target/debug/libopen_stata_core.so",
        "/home/abhinav/open-stata-core/target/release/libopen_stata_core.so",
        "/home/abhinav/open-stata-core/target/debug/libopen_stata_core.so",
        "/usr/local/lib/libopen_stata_core.so",
        "/usr/lib/libopen_stata_core.so",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def _read_and_free_string(lib, ptr) -> str:
    """Read a null-terminated UTF-8 string from a raw pointer and free it."""
    if not ptr:
        return ""
    try:
        val = ctypes.c_char_p(ptr).value
        return val.decode("utf-8", errors="replace") if val else ""
    finally:
        lib.open_stata_string_free(ptr)


class OpenStataData:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def getObsTotal(self) -> int:
        return int(self._a._lib.open_stata_session_get_obs(self._a._session))

    def getVarCount(self) -> int:
        return int(self._a._lib.open_stata_session_get_var_count(self._a._session))

    def getVarName(self, idx: int) -> str:
        ptr = self._a._lib.open_stata_session_get_var_name(self._a._session, ctypes.c_int64(idx))
        return _read_and_free_string(self._a._lib, ptr)

    def getVarType(self, idx: int) -> str:
        ptr = self._a._lib.open_stata_session_get_var_type(self._a._session, ctypes.c_int64(idx))
        return _read_and_free_string(self._a._lib, ptr) or "double"

    def getVarLabel(self, idx: int) -> str:
        ptr = self._a._lib.open_stata_session_get_var_label(self._a._session, ctypes.c_int64(idx))
        return _read_and_free_string(self._a._lib, ptr)

    def getVarFormat(self, idx: int) -> str:
        ptr = self._a._lib.open_stata_session_get_var_format(self._a._session, ctypes.c_int64(idx))
        return _read_and_free_string(self._a._lib, ptr) or "%9.0g"


class OpenStataScalar:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def getValue(self, name: str) -> Optional[float]:
        val = ctypes.c_double(0.0)
        found = self._a._lib.open_stata_session_get_scalar(
            self._a._session, name.encode("utf-8"), ctypes.byref(val)
        )
        if found:
            return float(val.value)
        return None


class OpenStataMatrix:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def getRowTotal(self, name: str) -> int:
        rows = ctypes.c_int64(0)
        cols = ctypes.c_int64(0)
        found = self._a._lib.open_stata_session_get_matrix_dims(
            self._a._session, name.encode("utf-8"), ctypes.byref(rows), ctypes.byref(cols)
        )
        if found:
            return int(rows.value)
        raise RuntimeError(f"matrix {name} not found")

    def getColTotal(self, name: str) -> int:
        rows = ctypes.c_int64(0)
        cols = ctypes.c_int64(0)
        found = self._a._lib.open_stata_session_get_matrix_dims(
            self._a._session, name.encode("utf-8"), ctypes.byref(rows), ctypes.byref(cols)
        )
        if found:
            return int(cols.value)
        raise RuntimeError(f"matrix {name} not found")

    def get(self, name: str) -> List[List[float]]:
        ptr = self._a._lib.open_stata_session_get_matrix_data_json(
            self._a._session, name.encode("utf-8")
        )
        raw = _read_and_free_string(self._a._lib, ptr)
        try:
            return json.loads(raw)
        except Exception:
            return []

    def getRowNames(self, name: str) -> List[str]:
        ptr = self._a._lib.open_stata_session_get_matrix_names_json(
            self._a._session, name.encode("utf-8"), b"row"
        )
        raw = _read_and_free_string(self._a._lib, ptr)
        try:
            return json.loads(raw)
        except Exception:
            return []

    def getColNames(self, name: str) -> List[str]:
        ptr = self._a._lib.open_stata_session_get_matrix_names_json(
            self._a._session, name.encode("utf-8"), b"col"
        )
        raw = _read_and_free_string(self._a._lib, ptr)
        try:
            return json.loads(raw)
        except Exception:
            return []


class OpenStataMacro:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def getGlobal(self, name: str) -> str:
        ptr = self._a._lib.open_stata_session_get_macro(self._a._session, name.encode("utf-8"))
        return _read_and_free_string(self._a._lib, ptr)

    def setGlobal(self, name: str, val: str):
        self._a._lib.open_stata_session_set_macro(
            self._a._session, name.encode("utf-8"), (val or "").encode("utf-8")
        )


class OpenStataFrameInstance:
    def __init__(self, adapter: "OpenStataAdapter", frame_name: str, obs: int, vars_cnt: int, var_list: Optional[List[Dict[str, Any]]] = None):
        self._a = adapter
        self.frame_name = frame_name
        self._obs = obs
        self._vars_cnt = vars_cnt
        self._var_list = var_list or []

    def getObsTotal(self) -> int:
        return self._obs

    def getVarCount(self) -> int:
        return self._vars_cnt

    def getVarName(self, idx: int) -> str:
        if self.frame_name == self._a.Frame.getCWF():
            return self._a.Data.getVarName(idx)
        if 0 <= idx < len(self._var_list):
            return self._var_list[idx].get("name", f"v{idx}")
        return f"v{idx}"

    def getVarType(self, idx: int) -> str:
        if self.frame_name == self._a.Frame.getCWF():
            return self._a.Data.getVarType(idx)
        if 0 <= idx < len(self._var_list):
            return self._var_list[idx].get("type", "double")
        return "double"

    def getVarLabel(self, idx: int) -> str:
        if self.frame_name == self._a.Frame.getCWF():
            return self._a.Data.getVarLabel(idx)
        if 0 <= idx < len(self._var_list):
            return self._var_list[idx].get("label", "")
        return ""


class OpenStataFrame:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def getCWF(self) -> str:
        ptr = self._a._lib.open_stata_session_get_cwf(self._a._session)
        return _read_and_free_string(self._a._lib, ptr) or "default"

    def getFrameCount(self) -> int:
        ptr = self._a._lib.open_stata_session_get_frames_json(self._a._session)
        raw = _read_and_free_string(self._a._lib, ptr)
        try:
            return len(json.loads(raw))
        except Exception:
            return 1

    def getFrameAt(self, idx: int) -> str:
        ptr = self._a._lib.open_stata_session_get_frames_json(self._a._session)
        raw = _read_and_free_string(self._a._lib, ptr)
        try:
            frames = json.loads(raw)
            return frames[idx]["name"]
        except Exception:
            return "default"

    def connect(self, name: str) -> OpenStataFrameInstance:
        ptr = self._a._lib.open_stata_session_get_frames_json(self._a._session)
        raw = _read_and_free_string(self._a._lib, ptr)
        try:
            frames = json.loads(raw)
            for f in frames:
                if f["name"] == name:
                    return OpenStataFrameInstance(self._a, name, f["obs"], f["vars"], f.get("var_list", []))
        except Exception:
            pass
        return OpenStataFrameInstance(self._a, name, self._a.Data.getObsTotal(), self._a.Data.getVarCount())


class OpenStataValueLabel:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def getVarValueLabel(self, idx: int) -> str:
        ptr = self._a._lib.open_stata_session_get_var_valuelabel(
            self._a._session, ctypes.c_int64(idx)
        )
        return _read_and_free_string(self._a._lib, ptr)

    def getValueLabels(self, name: str) -> Dict[int, str]:
        ptr = self._a._lib.open_stata_session_get_valuelabels_json(
            self._a._session, name.encode("utf-8")
        )
        raw = _read_and_free_string(self._a._lib, ptr)
        try:
            d = json.loads(raw)
            return {int(k): str(v) for k, v in d.items()}
        except Exception:
            return {}


class OpenStataSFIToolkit:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def stata(self, code: str):
        if ("st_dir" in code or "positron_stata_" in code) and hasattr(
            self._a._lib, "open_stata_session_get_return_names_json"
        ):
            for cls in ("e", "r"):
                for kind in ("numscalar", "macro", "matrix"):
                    ptr = self._a._lib.open_stata_session_get_return_names_json(
                        self._a._session, cls.encode("utf-8"), kind.encode("utf-8")
                    )
                    raw = _read_and_free_string(self._a._lib, ptr)
                    try:
                        names = json.loads(raw)
                    except Exception:
                        names = []
                    g = f"positron_stata_{cls}{kind[:3]}"
                    self._a.Macro.setGlobal(g, " ".join(names))
            return
        self._a.stata.run(code, quietly=True, echo=False)

    def macroExpand(self, text: str) -> str:
        m = re.fullmatch(r"`:\s*(row|col)fullnames\s+([^']+)'", text)
        if m:
            which, mat_name = m.group(1), m.group(2)
            names = (
                self._a.Matrix.getRowNames(mat_name)
                if which == "row"
                else self._a.Matrix.getColNames(mat_name)
            )
            return " ".join(names)
        m = re.fullmatch(r"`([^']+)'", text)
        if m:
            return self._a.Macro.getGlobal(m.group(1))
        return text


class OpenStataStata:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def run(self, code: str, **kwargs):
        echo = kwargs.get("echo", True)
        quietly = kwargs.get("quietly", False)

        ptr = self._a._lib.open_stata_session_execute(
            self._a._session, code.encode("utf-8")
        )
        raw = _read_and_free_string(self._a._lib, ptr)
        try:
            res = json.loads(raw)
        except Exception:
            res = {"stdout": raw, "stderr": "", "is_error": False, "rc": 0}

        stdout = res.get("stdout", "")
        stderr = res.get("stderr", "")
        is_error = res.get("is_error", False)
        rc = res.get("rc", 0)

        if stdout and not quietly:
            if self._a.config.stoutputf:
                self._a.config.stoutputf.write(stdout)
            else:
                sys.stdout.write(stdout)
                sys.stdout.flush()

        if is_error:
            err_msg = stderr or stdout or f"r({rc});"
            raise SystemError(err_msg)


class OpenStataStlib:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def StataSO_SetBreak(self):
        self._a._lib.open_stata_session_set_break(self._a._session)


class OpenStataConfig:
    def __init__(self):
        self.stoutputf = None
        self.sfiinitialized = True
        self.stlib = None

    def init(self, edition: str = "open"):
        pass

    def get_output(self) -> str:
        return ""


class OpenStataAdapter:
    """Universal in-process adapter implementing PyStata and SFI contracts via open-stata-core."""

    def __init__(self, lib_path: Optional[str] = None):
        path = lib_path or _find_open_stata_library()
        if not path:
            raise FileNotFoundError(
                "Could not find libopen_stata_core.so. Please build open-stata-core with `cargo build`."
            )
        self._lib_path = path
        self._lib = ctypes.CDLL(path)
        self._bind_ctypes()
        self._session = self._lib.open_stata_session_new()
        atexit.register(self._cleanup)

        self.config = OpenStataConfig()
        self.stata = OpenStataStata(self)
        self.stlib = OpenStataStlib(self)
        self.config.stlib = self.stlib

        # SFI API components
        self.Data = OpenStataData(self)
        self.Scalar = OpenStataScalar(self)
        self.Matrix = OpenStataMatrix(self)
        self.Macro = OpenStataMacro(self)
        self.Frame = OpenStataFrame(self)
        self.ValueLabel = OpenStataValueLabel(self)
        self.SFIToolkit = OpenStataSFIToolkit(self)

        # Mock SFI module
        sfi_mod = types.ModuleType("sfi")
        sfi_mod.Data = self.Data
        sfi_mod.Scalar = self.Scalar
        sfi_mod.Matrix = self.Matrix
        sfi_mod.Macro = self.Macro
        sfi_mod.Frame = self.Frame
        sfi_mod.ValueLabel = self.ValueLabel
        sfi_mod.SFIToolkit = self.SFIToolkit
        self.sfi = sfi_mod

    def _bind_ctypes(self):
        lib = self._lib
        lib.open_stata_session_new.restype = ctypes.c_void_p
        lib.open_stata_session_free.argtypes = [ctypes.c_void_p]
        lib.open_stata_string_free.argtypes = [ctypes.c_void_p]

        lib.open_stata_session_execute.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        lib.open_stata_session_execute.restype = ctypes.c_void_p

        lib.open_stata_session_get_obs.argtypes = [ctypes.c_void_p]
        lib.open_stata_session_get_obs.restype = ctypes.c_int64

        lib.open_stata_session_get_var_count.argtypes = [ctypes.c_void_p]
        lib.open_stata_session_get_var_count.restype = ctypes.c_int64

        lib.open_stata_session_get_var_name.argtypes = [ctypes.c_void_p, ctypes.c_int64]
        lib.open_stata_session_get_var_name.restype = ctypes.c_void_p

        lib.open_stata_session_get_var_type.argtypes = [ctypes.c_void_p, ctypes.c_int64]
        lib.open_stata_session_get_var_type.restype = ctypes.c_void_p

        lib.open_stata_session_get_var_label.argtypes = [ctypes.c_void_p, ctypes.c_int64]
        lib.open_stata_session_get_var_label.restype = ctypes.c_void_p

        lib.open_stata_session_get_var_format.argtypes = [ctypes.c_void_p, ctypes.c_int64]
        lib.open_stata_session_get_var_format.restype = ctypes.c_void_p

        lib.open_stata_session_get_scalar.argtypes = [
            ctypes.c_void_p, ctypes.c_char_p, ctypes.POINTER(ctypes.c_double)
        ]
        lib.open_stata_session_get_scalar.restype = ctypes.c_int32

        lib.open_stata_session_get_macro.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        lib.open_stata_session_get_macro.restype = ctypes.c_void_p

        lib.open_stata_session_set_macro.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p]
        lib.open_stata_session_set_macro.restype = ctypes.c_int32

        lib.open_stata_session_get_matrix_dims.argtypes = [
            ctypes.c_void_p, ctypes.c_char_p, ctypes.POINTER(ctypes.c_int64), ctypes.POINTER(ctypes.c_int64)
        ]
        lib.open_stata_session_get_matrix_dims.restype = ctypes.c_int32

        lib.open_stata_session_get_matrix_element.argtypes = [
            ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int64, ctypes.c_int64, ctypes.POINTER(ctypes.c_double)
        ]
        lib.open_stata_session_get_matrix_element.restype = ctypes.c_int32

        lib.open_stata_session_get_matrix_names_json.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p]
        lib.open_stata_session_get_matrix_names_json.restype = ctypes.c_void_p

        lib.open_stata_session_get_matrix_data_json.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        lib.open_stata_session_get_matrix_data_json.restype = ctypes.c_void_p

        lib.open_stata_session_get_valuelabels_json.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        lib.open_stata_session_get_valuelabels_json.restype = ctypes.c_void_p

        lib.open_stata_session_get_var_valuelabel.argtypes = [ctypes.c_void_p, ctypes.c_int64]
        lib.open_stata_session_get_var_valuelabel.restype = ctypes.c_void_p

        lib.open_stata_session_get_cwf.argtypes = [ctypes.c_void_p]
        lib.open_stata_session_get_cwf.restype = ctypes.c_void_p

        lib.open_stata_session_get_frames_json.argtypes = [ctypes.c_void_p]
        lib.open_stata_session_get_frames_json.restype = ctypes.c_void_p

        lib.open_stata_session_set_break.argtypes = [ctypes.c_void_p]

        if hasattr(lib, "open_stata_session_get_return_names_json"):
            lib.open_stata_session_get_return_names_json.argtypes = [
                ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p
            ]
            lib.open_stata_session_get_return_names_json.restype = ctypes.c_void_p

    def _cleanup(self):
        if hasattr(self, "_session") and self._session:
            try:
                self._lib.open_stata_session_free(self._session)
            except Exception:
                pass
            self._session = None
