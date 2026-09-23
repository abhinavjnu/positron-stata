"""Decides whether console input forms a complete Stata statement."""

import re
from typing import Dict

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

COMPLETE: Dict[str, str] = {"status": "complete", "indent": ""}
INCOMPLETE: Dict[str, str] = {"status": "incomplete", "indent": "    "}


def strip_strings_and_comments(code: str) -> str:
    """Blank out string literals and comments, keeping `///` continuation markers."""
    text = _STRINGS.sub('""', code)
    text = _BLOCK_COMMENTS.sub(" ", text)
    text = _LINE_COMMENTS.sub("", text)
    return _STAR_COMMENTS.sub("", text)


def check(code: str) -> Dict[str, str]:
    text = strip_strings_and_comments(code)
    # Checked after stripping so "/*" inside a // comment doesn't count.
    if "/*" in text:
        return INCOMPLETE

    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return COMPLETE
    if _CONTINUATION.search(lines[-1]):
        return INCOMPLETE

    if text.count("{") > text.count("}"):
        return INCOMPLETE

    depth = 0
    for line in text.splitlines():
        stripped = line.strip()
        if _BLOCK_END.match(stripped):
            depth -= 1
        elif _BLOCK_OPEN.match(stripped):
            depth += 1
    return INCOMPLETE if depth > 0 else COMPLETE
