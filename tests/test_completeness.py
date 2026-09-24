#!/usr/bin/env python3
"""Unit tests for console input completeness (no Stata required)."""

import os
import sys
import unittest

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(repo_root, "kernel"))

from positron_stata_kernel.completeness import check, delimiter_state


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
        self.assertComplete("summarize price // comment ///")

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
        self.assertIncomplete("/* still commenting\n * more")
        self.assertComplete("/* done */ summarize")
        self.assertComplete("summarize price // see /* note")

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


class TestSemicolonDelimiter(unittest.TestCase):
    def status(self, code, sc=True):
        return check(code, semicolon_delimiter=sc)["status"]

    def test_statement_needs_terminator(self):
        self.assertEqual(self.status("regress price mpg"), "incomplete")
        self.assertEqual(self.status("regress price\n mpg"), "incomplete")
        self.assertEqual(self.status("regress price\n mpg;"), "complete")
        self.assertEqual(self.status("display 1; display 2;"), "complete")
        self.assertEqual(self.status("display 1; display 2"), "incomplete")

    def test_default_is_cr_mode(self):
        self.assertEqual(check("regress price mpg")["status"], "complete")

    def test_comments_and_strings_do_not_terminate(self):
        self.assertEqual(self.status("display 1 // ;"), "incomplete")
        self.assertEqual(self.status("display 1 /* ; */"), "incomplete")
        self.assertEqual(self.status('display ";"'), "incomplete")
        self.assertEqual(self.status("display 1; // trailing comment"), "complete")
        self.assertEqual(self.status("* just a comment"), "complete")
        self.assertEqual(self.status(""), "complete")

    def test_blocks(self):
        self.assertEqual(self.status("foreach v in a b {;\n display 1;"), "incomplete")
        self.assertEqual(self.status("foreach v in a b {;\n display 1;\n};"), "complete")
        self.assertEqual(self.status("program define hi;\n display 1;"), "incomplete")
        self.assertEqual(self.status("program define hi;\n display 1;\nend;"), "complete")
        self.assertEqual(self.status("mata;\n x = 1;"), "incomplete")
        self.assertEqual(self.status("mata;\n x = 1;\nend;"), "complete")

    def test_directives(self):
        self.assertEqual(self.status("#delimit ;", sc=False), "complete")
        self.assertEqual(self.status("#delimit cr"), "complete")
        self.assertEqual(self.status("#delimit ;\nregress price", sc=False), "incomplete")
        self.assertEqual(self.status("#delimit ;\nregress price;", sc=False), "complete")
        self.assertEqual(self.status("display 1;\n#delimit cr\nregress price"), "complete")
        self.assertEqual(self.status("display 1;\n#delimit cr\nregress price ///"), "incomplete")

    def test_delimiter_state(self):
        self.assertEqual(delimiter_state("#delimit ;")[0], True)
        self.assertEqual(delimiter_state("#d ;")[0], True)
        self.assertEqual(delimiter_state("#delimi;")[0], True)
        self.assertEqual(delimiter_state("#delimit")[0], True)  # bare #delimit means `;` (live Stata 19)
        self.assertEqual(delimiter_state("#delimit cr", True)[0], False)
        self.assertEqual(delimiter_state("#d cr // back", True)[0], False)
        self.assertEqual(delimiter_state("#dx ;")[0], False)
        self.assertEqual(delimiter_state("display 1; #delimit cr\ndisplay 2", True)[0], False)
        # Not at the start of a statement: part of the unterminated `display` statement.
        self.assertEqual(delimiter_state("display 1\n#delimit cr", True)[0], True)
        # A directive ends at its line even in `;` mode.
        self.assertEqual(delimiter_state("#delimit ;\n#delimit cr\ndisplay 1")[0], False)
        self.assertEqual(delimiter_state('display "#delimit ;"')[0], False)
        self.assertEqual(delimiter_state("regress y ///\n#delimit ;")[0], False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
