"""
completer.py: Autocompletion logic for Stata in Positron.
Completes variable names in memory, factor variable prefixes,
macros, and common Stata commands.
"""

import re
from typing import Callable, Dict, List, Optional

_COMMON_STATA_COMMANDS = (
    "regress", "summarize", "tabulate", "describe", "generate", "replace",
    "browse", "view", "edit", "clear", "use", "save", "drop", "keep",
    "rename", "recast", "merge", "append", "reshape", "collapse", "contract",
    "sort", "gsort", "order", "aorder", "format", "label", "notes",
    "display", "quietly", "noisily", "capture", "preserve", "restore",
    "scatter", "twoway", "histogram", "graph", "margins", "marginsplot",
    "predict", "test", "lincom", "nlcom", "correlate", "pwcorr", "ttest",
    "anova", "logit", "probit", "xtreg", "xtset", "tsset", "help",
    "count", "list", "codebook", "inspect", "duplicates", "assert",
)

_COMMON_GLOBALS = (
    "$c(N)", "$c(k)", "$c(filename)", "$c(pwd)", "$c(current_date)", "$c(current_time)",
    "$c(stata_version)", "$c(os)", "$c(machine_type)", "$c(username)",
)


def complete_stata(code: str, cursor_pos: int, get_var_names: Optional[Callable[[], List[str]]] = None) -> Dict:
    """Computes completion matches for Stata code at cursor_pos."""
    if not code or cursor_pos <= 0:
        return {"matches": [], "cursor_start": cursor_pos, "cursor_end": cursor_pos, "metadata": {}, "status": "ok"}

    subcode = code[:cursor_pos]
    m = re.search(r"([`$]?[a-zA-Z_0-9.]*)$", subcode)
    token = m.group(1) if m else ""
    cursor_start = cursor_pos - len(token)
    token_lower = token.lower()

    matches = []
    vars_in_mem = get_var_names() if get_var_names else []

    # Factor variable prefixes like i.var or c.var
    fv_match = re.match(r"^([ic]\.)(.*)$", token, re.IGNORECASE)
    if fv_match:
        prefix, var_token = fv_match.group(1), fv_match.group(2).lower()
        matches.extend(f"{prefix}{v}" for v in vars_in_mem if v.lower().startswith(var_token))
    else:
        matches.extend(v for v in vars_in_mem if v.lower().startswith(token_lower))

    if token.startswith("$"):
        matches.extend(g for g in _COMMON_GLOBALS if g.lower().startswith(token_lower))
    elif not fv_match:
        matches.extend(c for c in _COMMON_STATA_COMMANDS if c.startswith(token_lower))

    return {
        "matches": sorted(set(matches)),
        "cursor_start": cursor_start,
        "cursor_end": cursor_pos,
        "metadata": {},
        "status": "ok",
    }
