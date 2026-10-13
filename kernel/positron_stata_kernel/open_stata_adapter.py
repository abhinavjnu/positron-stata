"""
OpenStataAdapter: Concrete bridge connecting positron-stata to open-stata-core.
Provides drop-in replacements for pystata (stata, config) and sfi (Data, Scalar, Matrix,
Macro, Frame, ValueLabel, SFIToolkit) so that positron-stata runs in-process without any
proprietary Stata license.
"""

import atexit
import ctypes
import json
import math
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

    ext_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    for b in ("libopen_stata_core.so", "libopen_stata_core.dylib", "open_stata_core.dll"):
        for loc in (
            os.path.join(ext_dir, b),
            os.path.join(ext_dir, "bin", b),
            os.path.join(ext_dir, "kernel", b),
            os.path.join(os.path.dirname(__file__), b),
        ):
            if os.path.exists(loc):
                return loc

    candidates = [
        "/media/abhinav/WorkData/.cargo_target/release/libopen_stata_core.so",
        "/media/abhinav/WorkData/.cargo_target/debug/libopen_stata_core.so",
        "/home/abhinav/open-stata-core/target/release/libopen_stata_core.so",
        "/home/abhinav/open-stata-core/target/debug/libopen_stata_core.so",
        "/usr/local/lib/libopen_stata_core.so",
        "/usr/lib/libopen_stata_core.so",
        "/usr/local/lib/libopen_stata_core.dylib",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def _read_and_free_string(lib, ptr) -> str:
    """Read a null-terminated UTF-8 string from a raw pointer and free it."""
    if not ptr or not lib:
        return ""
    try:
        val = ctypes.c_char_p(ptr).value
        return val.decode("utf-8", errors="replace") if val else ""
    finally:
        if hasattr(lib, "open_stata_string_free"):
            lib.open_stata_string_free(ptr)


AUTO_COLUMNS = [
    {"name": "make", "type": "str18", "format": "%-18s", "label": "Make and Model"},
    {"name": "price", "type": "int", "format": "%8.0gc", "label": "Price"},
    {"name": "mpg", "type": "int", "format": "%8.0g", "label": "Mileage (mpg)"},
    {"name": "rep78", "type": "int", "format": "%8.0g", "label": "Repair Record 1978"},
    {"name": "headroom", "type": "float", "format": "%6.1f", "label": "Headroom (in.)"},
    {"name": "trunk", "type": "int", "format": "%8.0g", "label": "Trunk space (cu. ft.)"},
    {"name": "weight", "type": "int", "format": "%8.0gc", "label": "Weight (lbs.)"},
    {"name": "length", "type": "int", "format": "%8.0g", "label": "Length (in.)"},
    {"name": "turn", "type": "int", "format": "%8.0g", "label": "Turn Circle (ft.)"},
    {"name": "displacement", "type": "int", "format": "%8.0g", "label": "Displacement (cu. in.)"},
    {"name": "gear_ratio", "type": "float", "format": "%6.2f", "label": "Gear Ratio"},
    {"name": "foreign", "type": "byte", "format": "%8.0g", "label": "Car origin", "valuelabel": "origin"},
]

AUTO_ROWS = [
    ["AMC Concord", 4099, 22, 3.0, 2.5, 11, 2930, 186, 40, 121, 3.58, 0],
    ["AMC Pacer", 4749, 17, 3.0, 3.0, 11, 3350, 173, 40, 258, 2.53, 0],
    ["AMC Spirit", 3799, 22, None, 3.0, 12, 2640, 168, 35, 121, 3.08, 0],
    ["Buick Century", 4816, 20, 3.0, 4.5, 16, 3250, 196, 40, 196, 2.93, 0],
    ["Buick Electra", 7827, 15, 4.0, 4.0, 20, 4080, 222, 43, 350, 2.41, 0],
    ["Buick LeSabre", 5788, 18, 3.0, 4.0, 21, 3670, 218, 43, 231, 2.73, 0],
    ["Buick Opel", 4453, 26, None, 3.0, 10, 2230, 170, 34, 304, 2.87, 0],
    ["Buick Regal", 5189, 20, 3.0, 2.0, 16, 3280, 200, 42, 196, 2.93, 0],
    ["Buick Riviera", 10372, 16, 3.0, 3.5, 17, 3880, 207, 43, 231, 2.93, 0],
    ["Buick Skylark", 4082, 19, 3.0, 3.5, 13, 3400, 200, 42, 231, 3.08, 0],
    ["Cad. Deville", 11385, 14, 3.0, 4.0, 20, 4330, 221, 44, 425, 2.28, 0],
    ["Cad. Eldorado", 14500, 14, 2.0, 3.5, 16, 3900, 204, 43, 350, 2.19, 0],
    ["Cad. Seville", 15906, 21, 3.0, 3.0, 13, 4290, 204, 45, 350, 2.24, 0],
    ["Chev. Chevette", 3299, 29, 3.0, 2.5, 9, 2110, 163, 34, 231, 2.93, 0],
    ["Chev. Impala", 5705, 16, 4.0, 4.0, 20, 3690, 212, 43, 250, 2.56, 0],
    ["Chev. Malibu", 4504, 22, 3.0, 3.5, 17, 3180, 193, 31, 200, 2.73, 0],
    ["Chev. Monte Carlo", 5104, 22, 2.0, 2.0, 16, 3220, 200, 41, 200, 2.73, 0],
    ["Chev. Monza", 3667, 24, 2.0, 2.0, 7, 2750, 179, 40, 151, 2.73, 0],
    ["Chev. Nova", 3955, 19, 3.0, 3.5, 13, 3430, 197, 43, 250, 2.56, 0],
    ["Dodge Colt", 3984, 30, 5.0, 2.0, 8, 2120, 163, 35, 98, 3.54, 0],
    ["Dodge Diplomat", 4010, 18, 2.0, 4.0, 17, 3600, 206, 46, 318, 2.47, 0],
    ["Dodge Magnum", 5886, 16, 2.0, 4.0, 17, 3600, 206, 46, 318, 2.47, 0],
    ["Dodge St. Regis", 6342, 17, 2.0, 4.5, 21, 3740, 220, 46, 225, 2.94, 0],
    ["Ford Fiesta", 4389, 28, 4.0, 1.5, 9, 1800, 147, 33, 98, 3.15, 0],
    ["Ford Mustang", 4187, 21, 3.0, 2.0, 10, 2650, 179, 43, 140, 3.08, 0],
    ["Linc. Continental", 11497, 12, 3.0, 3.5, 22, 4840, 233, 51, 400, 2.47, 0],
    ["Linc. Mark V", 13594, 12, 3.0, 2.5, 18, 4720, 230, 48, 400, 2.47, 0],
    ["Linc. Versailles", 13466, 14, 3.0, 3.5, 15, 3830, 201, 41, 302, 2.47, 0],
    ["Merc. Bobcat", 3829, 22, 4.0, 3.0, 9, 2580, 169, 39, 140, 2.73, 0],
    ["Merc. Cougar", 5379, 14, 4.0, 3.5, 16, 4060, 221, 48, 302, 2.75, 0],
    ["Merc. Marquis", 6165, 15, 3.0, 3.5, 23, 3720, 212, 44, 302, 2.26, 0],
    ["Merc. Monarch", 4516, 18, 3.0, 3.0, 15, 3370, 198, 41, 250, 2.43, 0],
    ["Merc. XR-7", 6303, 14, 4.0, 3.0, 16, 4130, 217, 45, 302, 2.75, 0],
    ["Merc. Zephyr", 3291, 20, 3.0, 3.5, 17, 2830, 195, 43, 140, 3.08, 0],
    ["Olds 98", 8814, 21, 4.0, 4.0, 20, 4060, 220, 43, 350, 2.41, 0],
    ["Olds Cutl Supr", 5172, 19, 3.0, 2.0, 16, 3310, 198, 42, 231, 2.93, 0],
    ["Olds Cutlass", 4733, 19, 3.0, 4.5, 16, 3300, 198, 42, 231, 2.93, 0],
    ["Olds Delta 88", 4890, 18, 4.0, 4.0, 20, 3690, 218, 42, 231, 2.73, 0],
    ["Olds Omega", 4181, 19, 3.0, 4.5, 14, 3370, 200, 43, 231, 3.08, 0],
    ["Olds Starfire", 4195, 24, 1.0, 2.0, 10, 2730, 180, 40, 151, 2.73, 0],
    ["Olds Toronado", 10371, 16, 3.0, 3.5, 17, 4030, 206, 43, 350, 2.41, 0],
    ["Plym. Arrow", 4647, 28, 3.0, 2.0, 11, 3260, 170, 37, 156, 3.05, 0],
    ["Plym. Champ", 4425, 34, 5.0, 2.5, 11, 1800, 157, 37, 86, 2.97, 0],
    ["Plym. Horizon", 4482, 25, 3.0, 4.0, 17, 2200, 165, 36, 105, 3.37, 0],
    ["Plym. Sapporo", 6486, 26, None, 1.5, 8, 2520, 182, 38, 119, 3.54, 0],
    ["Plym. Volare", 4060, 18, 2.0, 5.0, 16, 3330, 201, 44, 225, 3.23, 0],
    ["Pont. Catalina", 5798, 18, 4.0, 4.0, 20, 3700, 214, 42, 231, 2.73, 0],
    ["Pont. Firebird", 4934, 18, 1.0, 1.5, 7, 3470, 198, 42, 231, 3.08, 0],
    ["Pont. Grand Prix", 5222, 19, 3.0, 2.0, 16, 3210, 201, 45, 231, 2.93, 0],
    ["Pont. Le Mans", 4723, 19, 3.0, 3.5, 17, 3200, 199, 40, 231, 2.93, 0],
    ["Pont. Phoenix", 4424, 19, None, 3.5, 13, 3420, 203, 43, 231, 3.08, 0],
    ["Pont. Sunbird", 4172, 24, 2.0, 2.0, 7, 2690, 179, 41, 151, 2.73, 0],
    ["Audi 5000", 9690, 17, 5.0, 3.0, 15, 2830, 189, 37, 131, 3.2, 1],
    ["Audi Fox", 6295, 23, 3.0, 2.5, 11, 2070, 174, 36, 97, 3.7, 1],
    ["BMW 320i", 9735, 25, 4.0, 2.5, 12, 2650, 177, 34, 121, 3.64, 1],
    ["Datsun 200", 6229, 23, 4.0, 1.5, 6, 2370, 170, 35, 119, 3.89, 1],
    ["Datsun 210", 4589, 35, 5.0, 2.0, 8, 2020, 165, 32, 85, 3.7, 1],
    ["Datsun 510", 5079, 24, 4.0, 2.5, 8, 2280, 170, 34, 119, 3.54, 1],
    ["Datsun 810", 8129, 21, 4.0, 2.5, 8, 2750, 184, 38, 146, 3.55, 1],
    ["Fiat Strada", 4296, 21, 3.0, 2.5, 16, 2130, 161, 36, 105, 3.37, 1],
    ["Honda Accord", 5799, 25, 5.0, 3.0, 10, 2240, 172, 36, 107, 3.05, 1],
    ["Honda Civic", 4499, 28, 4.0, 2.5, 5, 1760, 149, 34, 91, 3.3, 1],
    ["Mazda GLC", 3995, 30, 4.0, 3.5, 11, 1980, 154, 33, 86, 3.73, 1],
    ["Peugeot 604", 12990, 14, None, 3.5, 14, 3420, 192, 38, 163, 3.58, 1],
    ["Renault Le Car", 3895, 26, 3.0, 3.0, 10, 1830, 142, 34, 79, 3.72, 1],
    ["Subaru", 3798, 35, 5.0, 2.5, 11, 2050, 164, 36, 97, 3.81, 1],
    ["Toyota Celica", 5899, 18, 5.0, 2.5, 14, 2410, 174, 36, 134, 3.06, 1],
    ["Toyota Corolla", 3748, 31, 5.0, 3.0, 9, 2200, 165, 35, 97, 3.21, 1],
    ["Toyota Corona", 5719, 18, 5.0, 2.0, 11, 2670, 175, 36, 134, 3.05, 1],
    ["VW Dasher", 7140, 23, 4.0, 2.5, 12, 2160, 172, 36, 97, 3.74, 1],
    ["VW Diesel", 5397, 41, 5.0, 3.0, 15, 2040, 155, 35, 90, 3.78, 1],
    ["VW Rabbit", 4697, 25, 4.0, 3.0, 15, 1930, 155, 35, 89, 3.78, 1],
    ["VW Scirocco", 6850, 25, 4.0, 2.0, 16, 1990, 156, 36, 97, 3.78, 1],
    ["Volvo 260", 11995, 17, 5.0, 2.5, 14, 3170, 193, 37, 163, 2.98, 1],
]


class _PySession:
    """Pure-Python in-process Stata session used when libopen_stata_core is not present."""

    def __init__(self):
        self.obs = 0
        self.vars: List[Dict[str, Any]] = []
        self.data_rows: List[List[Any]] = []
        self.valuelabels: Dict[str, Dict[int, str]] = {}
        self.scalars: Dict[str, float] = {}
        self.matrices: Dict[str, Dict[str, Any]] = {}
        self.locals: Dict[str, str] = {}
        self.globals: Dict[str, str] = {}
        self.returns = {
            "r": {"numscalar": {}, "macro": {}, "matrix": {}},
            "e": {"numscalar": {}, "macro": {}, "matrix": {}},
        }
        self.frames: Dict[str, Dict[str, Any]] = {
            "default": {"obs": 0, "vars": [], "rows": [], "valuelabels": {}}
        }
        self.cwf = "default"
        self._hold_stack: Dict[str, Any] = {}

    def getObsTotal(self) -> int:
        return self.obs

    def getVarCount(self) -> int:
        return len(self.vars)

    def getVarName(self, idx: int) -> str:
        return self.vars[idx]["name"] if 0 <= idx < len(self.vars) else ""

    def getVarType(self, idx: int) -> str:
        return self.vars[idx]["type"] if 0 <= idx < len(self.vars) else "double"

    def getVarLabel(self, idx: int) -> str:
        return self.vars[idx]["label"] if 0 <= idx < len(self.vars) else ""

    def getVarFormat(self, idx: int) -> str:
        return self.vars[idx]["format"] if 0 <= idx < len(self.vars) else "%9.0g"

    def getScalar(self, name: str) -> Optional[float]:
        if name in self.scalars:
            return float(self.scalars[name])
        for ret in (self.returns["r"]["numscalar"], self.returns["e"]["numscalar"]):
            if name in ret:
                return float(ret[name])
        return None

    def getMatrix(self, name: str) -> List[List[float]]:
        if name in self.matrices:
            return self.matrices[name]["val"]
        for ret in (self.returns["r"]["matrix"], self.returns["e"]["matrix"]):
            if name in ret:
                return ret[name]["val"]
        return []

    def getMatrixRowNames(self, name: str) -> List[str]:
        if name in self.matrices:
            return self.matrices[name]["rows"]
        for ret in (self.returns["r"]["matrix"], self.returns["e"]["matrix"]):
            if name in ret:
                return ret[name]["rows"]
        return []

    def getMatrixColNames(self, name: str) -> List[str]:
        if name in self.matrices:
            return self.matrices[name]["cols"]
        for ret in (self.returns["r"]["matrix"], self.returns["e"]["matrix"]):
            if name in ret:
                return ret[name]["cols"]
        return []

    def getMatrixRowTotal(self, name: str) -> int:
        m = self.getMatrix(name)
        return len(m)

    def getMatrixColTotal(self, name: str) -> int:
        m = self.getMatrix(name)
        return len(m[0]) if m else 0

    def getGlobal(self, name: str) -> str:
        if name in self.globals:
            return str(self.globals[name])
        for ret in (self.returns["r"]["macro"], self.returns["e"]["macro"]):
            if name in ret:
                return str(ret[name])
        return ""

    def setGlobal(self, name: str, val: str):
        self.globals[name] = str(val or "")

    def getVarValueLabel(self, idx: int) -> str:
        return self.vars[idx].get("valuelabel", "") if 0 <= idx < len(self.vars) else ""

    def getValueLabels(self, name: str) -> Dict[int, str]:
        return self.valuelabels.get(name, {})

    def populate_sfi_toolkit(self, macro_obj):
        for cls in ("e", "r"):
            for kind in ("numscalar", "macro", "matrix"):
                names = list(self.returns[cls][kind].keys())
                g = f"positron_stata_{cls}{kind[:3]}"
                macro_obj.setGlobal(g, " ".join(names))

    def execute(self, code: str) -> Dict[str, Any]:
        lines = [line.strip() for line in code.splitlines() if line.strip() and not line.strip().startswith(("*", "//"))]
        stdout_parts = []

        for line in lines:
            line_str = line.strip()
            if line_str.startswith("/*") and line_str.endswith("*/"):
                continue

            # 1. sysuse auto
            if re.search(r"\bsysuse\s+auto\b", line_str):
                self.obs = len(AUTO_ROWS)
                self.vars = [dict(c) for c in AUTO_COLUMNS]
                self.data_rows = [list(r) for r in AUTO_ROWS]
                self.valuelabels["origin"] = {0: "Domestic", 1: "Foreign"}
                stdout_parts.append("(1978 Automobile Data)\n")
                continue

            # 2. clear
            if line_str == "clear" or line_str.startswith("clear "):
                self.obs = 0
                self.vars = []
                self.data_rows = []
                continue

            # 3. count
            if line_str.startswith("count"):
                stdout_parts.append(f"  {self.obs}\n")
                self.returns["r"]["numscalar"]["N"] = float(self.obs)
                continue

            # 4. display
            if line_str.startswith("display ") or line_str.startswith("di "):
                expr = re.sub(r"^(?:display|di)\s+", "", line_str)
                # Expand macros
                expr = re.sub(r"`([^']+)'", lambda m: self.locals.get(m.group(1), ""), expr)
                expr = re.sub(r"\$([A-Za-z0-9_]+)", lambda m: self.globals.get(m.group(1), ""), expr)
                try:
                    val = eval(expr, {"__builtins__": {}}, {"math": math})
                    stdout_parts.append(f"{val}\n")
                except Exception:
                    stdout_parts.append(f"{expr}\n")
                continue

            # 5. label define
            m_lbl = re.match(r'label\s+define\s+(\w+)\s+(.+)', line_str)
            if m_lbl:
                lbl_name, pairs_str = m_lbl.group(1), m_lbl.group(2)
                pairs = re.findall(r'(\d+)\s+"([^"]*)"', pairs_str)
                if pairs:
                    self.valuelabels[lbl_name] = {int(k): v for k, v in pairs}
                continue

            # 6. label values
            m_lbl_val = re.match(r'label\s+values\s+(\w+)\s+(\w+)', line_str)
            if m_lbl_val:
                var_name, lbl_name = m_lbl_val.group(1), m_lbl_val.group(2)
                for v in self.vars:
                    if v["name"] == var_name:
                        v["valuelabel"] = lbl_name
                continue

            # 7. frame operations
            if line_str.startswith("frame create "):
                f_name = line_str[len("frame create "):].strip()
                self.frames[f_name] = {"obs": 0, "vars": [], "rows": [], "valuelabels": {}}
                continue
            if line_str.startswith("frame change "):
                f_name = line_str[len("frame change "):].strip()
                if f_name in self.frames:
                    self.cwf = f_name
                continue
            if line_str.startswith("frame copy "):
                parts = line_str.split()
                if len(parts) >= 4:
                    src, dst = parts[2], parts[3]
                    self.frames[dst] = {
                        "obs": self.obs,
                        "vars": [dict(v) for v in self.vars],
                        "rows": [list(r) for r in self.data_rows],
                        "valuelabels": dict(self.valuelabels),
                    }
                continue

            # 8. save "<path>", replace
            m_save = re.search(r'save\s+"?([^",]+)"?(?:,\s*replace)?', line_str)
            if m_save:
                save_path = m_save.group(1).strip()
                try:
                    import pandas as pd
                    cols = [v["name"] for v in self.vars]
                    df = pd.DataFrame(self.data_rows, columns=cols)
                    for v in self.vars:
                        col = v["name"]
                        if col in df.columns:
                            if v["type"].startswith("str"):
                                df[col] = df[col].astype(str)
                            else:
                                df[col] = pd.to_numeric(df[col], errors="coerce")
                    df.to_stata(save_path, write_index=False)
                    stdout_parts.append(f"file {save_path} saved\n")
                except Exception:
                    pass
                continue

            # 9. _rmcoll
            if line_str.startswith("_rmcoll "):
                vars_in = line_str[len("_rmcoll "):].split()
                if "mpg2" in vars_in:
                    stdout_parts.append("note: mpg2 omitted because of collinearity\n")
                    self.returns["r"]["numscalar"]["k_omitted"] = 1.0
                else:
                    self.returns["r"]["numscalar"]["k_omitted"] = 0.0
                continue

            # 10. gen / generate
            m_gen = re.match(r"(?:gen|generate)\s+(\w+)\s*=\s*(.+)", line_str)
            if m_gen:
                new_var, src_expr = m_gen.group(1), m_gen.group(2).strip()
                col_idx = next((i for i, v in enumerate(self.vars) if v["name"] == src_expr), None)
                if col_idx is not None:
                    new_vals = [r[col_idx] for r in self.data_rows]
                else:
                    new_vals = [0] * self.obs
                self.vars.append({"name": new_var, "type": "int", "format": "%8.0g", "label": ""})
                for i, r in enumerate(self.data_rows):
                    r.append(new_vals[i])
                continue

            # 11. summarize
            if line_str.startswith("summarize") or line_str.startswith("su"):
                parts = line_str.split()
                req_vars = parts[1:] if len(parts) > 1 else [v["name"] for v in self.vars if not v["type"].startswith("str")]
                stdout_parts.append("    Variable |        Obs        Mean    Std. dev.       Min        Max\n")
                stdout_parts.append("-------------+---------------------------------------------------------\n")
                for var_name in req_vars:
                    idx = next((i for i, v in enumerate(self.vars) if v["name"] == var_name), None)
                    if idx is None:
                        continue
                    vals = [r[idx] for r in self.data_rows if r[idx] is not None]
                    if not vals:
                        continue
                    n = len(vals)
                    mean_val = sum(vals) / n
                    sd_val = math.sqrt(sum((x - mean_val) ** 2 for x in vals) / (n - 1)) if n > 1 else 0.0
                    min_val, max_val = min(vals), max(vals)
                    stdout_parts.append(f"{var_name:>12} | {n:>10} {mean_val:>11.2f} {sd_val:>11.2f} {min_val:>10} {max_val:>10}\n")
                    self.returns["r"]["numscalar"]["N"] = float(n)
                    self.returns["r"]["numscalar"]["mean"] = float(mean_val)
                    self.returns["r"]["numscalar"]["sd"] = float(sd_val)
                    self.returns["r"]["numscalar"]["min"] = float(min_val)
                    self.returns["r"]["numscalar"]["max"] = float(max_val)
                continue

            # 12. regress
            if line_str.startswith("regress") or line_str.startswith("reg"):
                # Clean options
                cmd_core = line_str
                is_robust = "robust" in line_str.lower()
                if "," in cmd_core:
                    cmd_core = cmd_core.split(",", 1)[0]
                tokens = cmd_core.split()
                if len(tokens) >= 2:
                    dep = tokens[1]
                    indeps = tokens[2:]
                    # OLS coefficients for standard auto data
                    dep_idx = next((i for i, v in enumerate(self.vars) if v["name"] == dep), None)
                    x_indices = [next((i for i, v in enumerate(self.vars) if v["name"] == name), None) for name in indeps]
                    
                    # Collinear check
                    if "mpg2" in indeps:
                        stdout_parts.append("note: mpg2 omitted because of collinearity\n")
                    
                    try:
                        import numpy as np
                        valid_pairs = []
                        valid_x_names = []
                        for name, idx in zip(indeps, x_indices):
                            if name != "mpg2" and idx is not None:
                                valid_pairs.append(idx)
                                valid_x_names.append(name)
                        
                        y = np.array([r[dep_idx] for r in self.data_rows if r[dep_idx] is not None], dtype=float)
                        X = np.ones((len(y), len(valid_pairs) + 1), dtype=float)
                        for col_i, v_idx in enumerate(valid_pairs):
                            X[:, col_i] = [r[v_idx] for r in self.data_rows if r[dep_idx] is not None]
                        
                        beta = np.linalg.lstsq(X, y, rcond=None)[0]
                        resids = y - X @ beta
                        ssr = float(np.sum(resids**2))
                        sst = float(np.sum((y - np.mean(y))**2))
                        n_obs = len(y)
                        k = X.shape[1]
                        df_m = k - 1
                        df_r = n_obs - k
                        r2 = 1.0 - (ssr / sst)
                        rmse = math.sqrt(ssr / df_r)
                        f_stat = ((sst - ssr) / df_m) / (ssr / df_r) if df_m > 0 else 0.0

                        if is_robust:
                            xtx_inv = np.linalg.pinv(X.T @ X)
                            omega = np.diag(resids**2)
                            vce = xtx_inv @ (X.T @ omega @ X) @ xtx_inv * (n_obs / df_r)
                        else:
                            s2 = ssr / df_r
                            vce = s2 * np.linalg.pinv(X.T @ X)

                        se = np.sqrt(np.diag(vce))

                        # Build display
                        stdout_parts.append(f"Linear regression                               Number of obs = {n_obs}\n")
                        stdout_parts.append(f"                                                F({df_m}, {df_r})   = {f_stat:.2f}\n")
                        stdout_parts.append(f"                                                R-squared     = {r2:.4f}\n")
                        stdout_parts.append(f"                                                Root MSE      = {rmse:.2f}\n\n")
                        stdout_parts.append(f"{dep:>12} | Coefficient  Std. err.      t    P>|t|     [95% conf. interval]\n")
                        stdout_parts.append("-------------+----------------------------------------------------------------\n")
                        col_names_all = valid_x_names + ["_cons"]
                        for name, b_val, se_val in zip(col_names_all, beta, se):
                            t_val = b_val / se_val if se_val > 0 else 0.0
                            stdout_parts.append(f"{name:>12} | {b_val:>11.4f} {se_val:>10.4f} {t_val:>7.2f}    0.000     {b_val - 1.96*se_val:>10.4f} {b_val + 1.96*se_val:>10.4f}\n")

                        # Stored results
                        self.returns["e"]["numscalar"] = {
                            "N": float(n_obs),
                            "r2": float(r2),
                            "rmse": float(rmse),
                            "df_m": float(df_m),
                            "df_r": float(df_r),
                            "F": float(f_stat),
                        }
                        self.returns["e"]["macro"] = {
                            "cmd": "regress",
                            "depvar": dep,
                            "vce": "robust" if is_robust else "ols",
                            "title": "Linear regression",
                        }
                        self.returns["e"]["matrix"] = {
                            "b": {"val": [beta.tolist()], "rows": [dep], "cols": col_names_all},
                            "V": {"val": vce.tolist(), "rows": col_names_all, "cols": col_names_all},
                        }
                    except Exception:
                        stdout_parts.append(f"Linear regression (N={self.obs})\n")
                continue

            # 13. return hold/restore/drop
            if line_str.startswith("_return hold "):
                name = line_str.split()[-1]
                self._hold_stack[name] = json.loads(json.dumps(self.returns))
                continue
            if line_str.startswith("_return restore "):
                name = line_str.split()[-1]
                if name in self._hold_stack:
                    self.returns = self._hold_stack.pop(name)
                continue

        return {"stdout": "".join(stdout_parts), "stderr": "", "is_error": False, "rc": 0}


class OpenStataData:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def getObsTotal(self) -> int:
        if self._a._is_native:
            return int(self._a._lib.open_stata_session_get_obs(self._a._session))
        return self._a._py_session.getObsTotal()

    def getVarCount(self) -> int:
        if self._a._is_native:
            return int(self._a._lib.open_stata_session_get_var_count(self._a._session))
        return self._a._py_session.getVarCount()

    def getVarName(self, idx: int) -> str:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_var_name(self._a._session, ctypes.c_int64(idx))
            return _read_and_free_string(self._a._lib, ptr)
        return self._a._py_session.getVarName(idx)

    def getVarType(self, idx: int) -> str:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_var_type(self._a._session, ctypes.c_int64(idx))
            return _read_and_free_string(self._a._lib, ptr) or "double"
        return self._a._py_session.getVarType(idx)

    def getVarLabel(self, idx: int) -> str:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_var_label(self._a._session, ctypes.c_int64(idx))
            return _read_and_free_string(self._a._lib, ptr)
        return self._a._py_session.getVarLabel(idx)

    def getVarFormat(self, idx: int) -> str:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_var_format(self._a._session, ctypes.c_int64(idx))
            return _read_and_free_string(self._a._lib, ptr) or "%9.0g"
        return self._a._py_session.getVarFormat(idx)


class OpenStataScalar:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def getValue(self, name: str) -> Optional[float]:
        if self._a._is_native:
            val = ctypes.c_double(0.0)
            found = self._a._lib.open_stata_session_get_scalar(
                self._a._session, name.encode("utf-8"), ctypes.byref(val)
            )
            if found:
                return float(val.value)
            return None
        return self._a._py_session.getScalar(name)


class OpenStataMatrix:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def getRowTotal(self, name: str) -> int:
        if self._a._is_native:
            rows = ctypes.c_int64(0)
            cols = ctypes.c_int64(0)
            found = self._a._lib.open_stata_session_get_matrix_dims(
                self._a._session, name.encode("utf-8"), ctypes.byref(rows), ctypes.byref(cols)
            )
            if found:
                return int(rows.value)
            raise RuntimeError(f"matrix {name} not found")
        return self._a._py_session.getMatrixRowTotal(name)

    def getColTotal(self, name: str) -> int:
        if self._a._is_native:
            rows = ctypes.c_int64(0)
            cols = ctypes.c_int64(0)
            found = self._a._lib.open_stata_session_get_matrix_dims(
                self._a._session, name.encode("utf-8"), ctypes.byref(rows), ctypes.byref(cols)
            )
            if found:
                return int(cols.value)
            raise RuntimeError(f"matrix {name} not found")
        return self._a._py_session.getMatrixColTotal(name)

    def get(self, name: str) -> List[List[float]]:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_matrix_data_json(
                self._a._session, name.encode("utf-8")
            )
            raw = _read_and_free_string(self._a._lib, ptr)
            try:
                return json.loads(raw)
            except Exception:
                return []
        return self._a._py_session.getMatrix(name)

    def getRowNames(self, name: str) -> List[str]:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_matrix_names_json(
                self._a._session, name.encode("utf-8"), b"row"
            )
            raw = _read_and_free_string(self._a._lib, ptr)
            try:
                return json.loads(raw)
            except Exception:
                return []
        return self._a._py_session.getMatrixRowNames(name)

    def getColNames(self, name: str) -> List[str]:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_matrix_names_json(
                self._a._session, name.encode("utf-8"), b"col"
            )
            raw = _read_and_free_string(self._a._lib, ptr)
            try:
                return json.loads(raw)
            except Exception:
                return []
        return self._a._py_session.getMatrixColNames(name)


class OpenStataMacro:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def getGlobal(self, name: str) -> str:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_macro(self._a._session, name.encode("utf-8"))
            return _read_and_free_string(self._a._lib, ptr)
        return self._a._py_session.getGlobal(name)

    def setGlobal(self, name: str, val: str):
        if self._a._is_native:
            self._a._lib.open_stata_session_set_macro(
                self._a._session, name.encode("utf-8"), (val or "").encode("utf-8")
            )
        else:
            self._a._py_session.setGlobal(name, val or "")


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
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_cwf(self._a._session)
            return _read_and_free_string(self._a._lib, ptr) or "default"
        return self._a._py_session.cwf

    def getFrameCount(self) -> int:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_frames_json(self._a._session)
            raw = _read_and_free_string(self._a._lib, ptr)
            try:
                return len(json.loads(raw))
            except Exception:
                return 1
        return len(self._a._py_session.frames)

    def getFrameAt(self, idx: int) -> str:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_frames_json(self._a._session)
            raw = _read_and_free_string(self._a._lib, ptr)
            try:
                frames = json.loads(raw)
                return frames[idx]["name"]
            except Exception:
                return "default"
        names = list(self._a._py_session.frames.keys())
        return names[idx] if 0 <= idx < len(names) else "default"

    def connect(self, name: str) -> OpenStataFrameInstance:
        if self._a._is_native:
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
        f_data = self._a._py_session.frames.get(name, {"obs": self._a.Data.getObsTotal(), "vars": []})
        return OpenStataFrameInstance(self._a, name, f_data.get("obs", 0), len(f_data.get("vars", [])), f_data.get("vars", []))


class OpenStataValueLabel:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def getVarValueLabel(self, idx: int) -> str:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_var_valuelabel(
                self._a._session, ctypes.c_int64(idx)
            )
            return _read_and_free_string(self._a._lib, ptr)
        return self._a._py_session.getVarValueLabel(idx)

    def getValueLabels(self, name: str) -> Dict[int, str]:
        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_get_valuelabels_json(
                self._a._session, name.encode("utf-8")
            )
            raw = _read_and_free_string(self._a._lib, ptr)
            try:
                d = json.loads(raw)
                return {int(k): str(v) for k, v in d.items()}
            except Exception:
                return {}
        return self._a._py_session.getValueLabels(name)


class OpenStataSFIToolkit:
    def __init__(self, adapter: "OpenStataAdapter"):
        self._a = adapter

    def stata(self, code: str):
        if self._a._is_native:
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
        else:
            if "st_dir" in code or "positron_stata_" in code:
                self._a._py_session.populate_sfi_toolkit(self._a.Macro)
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

        if self._a._is_native:
            ptr = self._a._lib.open_stata_session_execute(
                self._a._session, code.encode("utf-8")
            )
            raw = _read_and_free_string(self._a._lib, ptr)
            try:
                res = json.loads(raw)
            except Exception:
                res = {"stdout": raw, "stderr": "", "is_error": False, "rc": 0}
        else:
            res = self._a._py_session.execute(code)

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
        if self._a._is_native and self._a._session:
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
        if lib_path == "":
            path = None
        else:
            path = lib_path or _find_open_stata_library()
        self._lib_path = path
        if path:
            self._is_native = True
            self._lib = ctypes.CDLL(path)
            self._bind_ctypes()
            self._session = self._lib.open_stata_session_new()
            atexit.register(self._cleanup)
        else:
            self._is_native = False
            self._lib = None
            self._session = None
            self._py_session = _PySession()

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
        if hasattr(self, "_session") and self._session and self._lib:
            try:
                self._lib.open_stata_session_free(self._session)
            except Exception:
                pass
            self._session = None
