#!/usr/bin/env python3
"""Unit tests for console input completeness (no Stata required)."""

import os
import sys
import unittest

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(repo_root, "kernel"))

from positron_stata_kernel.completeness import check


class TestCompleteness(unittest.TestCase):
    def assertComplete(self, code):
        self.assertEqual(check(code)["status"], "complete", code)

    def assertIncomplete(self, code):
        self.assertEqual(check(code)["status"], "incomplete", code)

    def test_simple_commands(self):
        self.assertComplete("")
        self.assertComplete("sysuse auto, clear")
        self.assertComplete('display "http://example.com"')

    def test_line_continuation(self):
        self.assertIncomplete("regress price mpg ///")
        self.assertIncomplete("regress price mpg /// weight follows")
        self.assertComplete("regress price mpg ///\n    weight")

    def test_braced_blocks(self):
        self.assertIncomplete("foreach v of varlist * {")
        self.assertIncomplete("forvalues i = 1/3 {\n    display `i'")
        self.assertComplete("foreach v of varlist * {\n    summarize `v'\n}")

    def test_braces_in_strings_and_comments_are_ignored(self):
        self.assertComplete('display "{"')
        self.assertComplete("* open {")
        self.assertComplete("summarize price // {")
        self.assertComplete("summarize price /* { */")

    def test_block_comments(self):
        self.assertIncomplete("/* still commenting")
        self.assertComplete("/* done */ summarize")

    def test_program_blocks(self):
        self.assertIncomplete("program define hello\n    display 1")
        self.assertComplete("program define hello\n    display 1\nend")
        self.assertComplete("capture program drop hello")

    def test_mata_and_python_blocks(self):
        self.assertIncomplete("mata:")
        self.assertComplete("mata: x = 1")
        self.assertComplete("mata\nx = 1\nend")
        self.assertIncomplete("python:\nprint(1)")
        self.assertComplete("python:\nprint(1)\nend")


if __name__ == "__main__":
    unittest.main(verbosity=2)
