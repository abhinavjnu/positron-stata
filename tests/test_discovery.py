#!/usr/bin/env python3
"""
test_discovery.py: Verifies cross-platform detection patterns for Stata.
Tests path resolution, version extraction, and edition parsing.
"""

import os
import re
import unittest

def parse_stata_info(home_dir: str, exe_path: str):
    exe_lower = os.path.basename(exe_path).lower()
    edition = 'be'
    if 'mp' in exe_lower:
        edition = 'mp'
    elif 'se' in exe_lower:
        edition = 'se'

    version = '19'
    match = re.search(r'stata(?:now)?\s*(\d+)', home_dir, re.I) or re.search(r'stata(?:now)?\s*(\d+)', exe_path, re.I)
    if match:
        version = match.group(1)

    is_statanow = 'statanow' in home_dir.lower() or 'statanow' in exe_path.lower()
    prefix = f"StataNow {version}" if is_statanow else f"Stata {version}"
    edition_str = "MP (Parallel Edition)" if edition == "mp" else ("SE" if edition == "se" else "BE")
    
    return {
        "home": home_dir,
        "exe": exe_path,
        "version": version,
        "edition": edition,
        "display": f"{prefix} {edition_str}",
        "short": f"{version} {edition.upper()}"
    }

class TestStataDiscovery(unittest.TestCase):
    def test_linux_stata19_mp(self):
        info = parse_stata_info("/usr/local/stata19", "/usr/local/stata19/stata-mp")
        self.assertEqual(info["version"], "19")
        self.assertEqual(info["edition"], "mp")
        self.assertEqual(info["display"], "Stata 19 MP (Parallel Edition)")
        self.assertEqual(info["short"], "19 MP")

    def test_macos_statanow_19(self):
        info = parse_stata_info("/Applications/StataNow 19", "/Applications/StataNow 19/StataMP.app/Contents/MacOS/stata-mp")
        self.assertEqual(info["version"], "19")
        self.assertEqual(info["edition"], "mp")
        self.assertEqual(info["display"], "StataNow 19 MP (Parallel Edition)")

    def test_macos_stata18_se(self):
        info = parse_stata_info("/Applications/Stata18", "/Applications/Stata18/StataSE.app/Contents/MacOS/stata-se")
        self.assertEqual(info["version"], "18")
        self.assertEqual(info["edition"], "se")
        self.assertEqual(info["display"], "Stata 18 SE")

    def test_windows_stata19_mp(self):
        info = parse_stata_info(r"C:\Program Files\Stata19", r"C:\Program Files\Stata19\StataMP-64.exe")
        self.assertEqual(info["version"], "19")
        self.assertEqual(info["edition"], "mp")
        self.assertEqual(info["display"], "Stata 19 MP (Parallel Edition)")

    def test_windows_stata17_be(self):
        info = parse_stata_info(r"C:\Program Files\Stata17", r"C:\Program Files\Stata17\Stata-64.exe")
        self.assertEqual(info["version"], "17")
        self.assertEqual(info["edition"], "be")
        self.assertEqual(info["display"], "Stata 17 BE")

    def test_future_stata20_linux(self):
        info = parse_stata_info("/usr/local/stata20", "/usr/local/stata20/stata-mp")
        self.assertEqual(info["version"], "20")
        self.assertEqual(info["edition"], "mp")
        self.assertEqual(info["display"], "Stata 20 MP (Parallel Edition)")

if __name__ == "__main__":
    unittest.main(verbosity=2)
