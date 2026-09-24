"""Decides whether console input forms a complete Stata statement."""

import re
from typing import Dict, Tuple

_STRINGS = re.compile(r'`".*?"\'|"[^"\n]*"', re.DOTALL)
_BLOCK_COMMENTS = re.compile(r"/\*.*?\*/", re.DOTALL)
_CONTINUATION = re.compile(r"(?:^|\s)///")
_LINE_COMMENTS = re.compile(r"(?:^|\s)//(?!/).*$", re.MULTILINE)
_STAR_COMMENTS = re.compile(r"^\s*\*.*$", re.MULTILINE)
_BLOCK_OPEN = re.compile(
    r"^(?:(?:capture|cap|quietly|qui|noisily|noi)\s+)*"
    r"(?:program(?:\s+define)?\s+(?!(?:drop|dir|list)\b)\S+|(?:mata|python)\s*:?\s*$)",
    re.IGNORECASE,
)
_BLOCK_END = re.compile(r"^end\s*$", re.IGNORECASE)
# `#delimit` abbreviates down to `#d`; Stata also accepts `#delimi;` with no space.
# Live Stata 19 treats any argument other than exactly `cr` (including none) as `;`.
_DELIMIT = re.compile(r"^\s*#d(?:e(?:l(?:i(?:m(?:i(?:t)?)?)?)?)?)?(?![A-Za-z0-9_])(.*)$", re.IGNORECASE)

COMPLETE: Dict[str, str] = {"status": "complete", "indent": ""}
INCOMPLETE: Dict[str, str] = {"status": "incomplete", "indent": "    "}


def strip_strings_and_comments(code: str) -> str:
    """Blank out string literals and comments, keeping `///` continuation markers."""
    text = _STRINGS.sub('""', code)
    text = _BLOCK_COMMENTS.sub(" ", text)
    text = _LINE_COMMENTS.sub("", text)
    return _STAR_COMMENTS.sub("", text)


def parse_delimit(line: str):
    """Return True/False for a `#delimit ;`/`#delimit cr` line (comments already stripped), else None."""
    m = _DELIMIT.match(line)
    if not m:
        return None
    return m.group(1).strip() != "cr"


def delimiter_state(code: str, semicolon: bool = False) -> Tuple[bool, str]:
    """Track `#delimit` switches through `code`.

    Returns whether `;` is the delimiter after `code` runs, and the comment-stripped text that
    follows the last `#delimit` directive (all of it when there is none). A directive is only
    recognised at the start of a statement and, even in `;` mode, ends at the end of its line.
    """
    text = strip_strings_and_comments(code)
    tail_start = 0
    pos = 0
    at_start = True
    continued = False
    for line in text.splitlines(keepends=True):
        pos += len(line)
        if not semicolon:
            at_start = not continued
        rest = line
        while True:
            if at_start:
                switch = parse_delimit(rest)
                if switch is not None:
                    semicolon = switch
                    tail_start = pos
                    at_start = True
                    break
            if not semicolon:
                break
            idx = rest.find(";")
            if idx < 0:
                if rest.strip():
                    at_start = False
                break
            rest = rest[idx + 1:]
            at_start = True
        continued = not semicolon and bool(_CONTINUATION.search(line))
    return semicolon, text[tail_start:]


def _block_depth(statements) -> int:
    depth = 0
    for statement in statements:
        stripped = statement.strip()
        if _BLOCK_END.match(stripped):
            depth -= 1
        elif _BLOCK_OPEN.match(stripped):
            depth += 1
    return depth


def _check_semicolon_mode(text: str) -> Dict[str, str]:
    stripped = text.strip()
    if not stripped:
        return COMPLETE
    # Under `#delimit ;` nothing runs until the statement is terminated.
    if not stripped.endswith(";"):
        return INCOMPLETE
    if text.count("{") > text.count("}"):
        return INCOMPLETE
    statements = (" ".join(s.split()) for s in text.split(";"))
    return INCOMPLETE if _block_depth(statements) > 0 else COMPLETE


def check(code: str, semicolon_delimiter: bool = False) -> Dict[str, str]:
    """`semicolon_delimiter` is the engine's `#delimit` state before `code` runs."""
    text = strip_strings_and_comments(code)
    # Checked after stripping so "/*" inside a // comment doesn't count.
    if "/*" in text:
        return INCOMPLETE

    semicolon, text = delimiter_state(code, semicolon_delimiter)
    if semicolon:
        return _check_semicolon_mode(text)

    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return COMPLETE
    if _CONTINUATION.search(lines[-1]):
        return INCOMPLETE

    if text.count("{") > text.count("}"):
        return INCOMPLETE

    return INCOMPLETE if _block_depth(text.splitlines()) > 0 else COMPLETE
