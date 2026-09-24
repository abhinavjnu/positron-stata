#!/usr/bin/env python3
"""Live checks against a licensed Stata (PyStata): #delimit, pause/more safety, stored results,
frames and expression evaluation. Skipped when Stata or a PyStata-compatible Python is missing."""

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(repo_root, "kernel"))

STATA_HOME = os.environ.get("STATA_HOME", "/usr/local/stata19")
EDITION = os.environ.get("STATA_EDITION", "mp")
HAVE_STATA = os.path.isdir(os.path.join(STATA_HOME, "utilities", "pystata")) and sys.version_info < (3, 14)
SKIP_REASON = f"needs Stata at {STATA_HOME} and Python <= 3.13 for PyStata"


@unittest.skipUnless(HAVE_STATA, SKIP_REASON)
class TestLiveFeatures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from positron_stata_kernel.stata_engine import StataEngine
        cls.engine = StataEngine(stata_home=STATA_HOME, edition=EDITION)
        cls.engine.initialize()
        cls.engine.execute("sysuse auto, clear")

    def tearDown(self):
        self.engine.semicolon_delimiter = False

    def run_streamed(self, code):
        chunks = []
        res = self.engine.execute(code, stdout_callback=chunks.append)
        return res, "".join(chunks)

    def test_delimit_semicolon_across_executions(self):
        res, out = self.run_streamed("#delimit ;")
        self.assertIsNone(res.error)
        self.assertEqual(out, "delimiter now ;\n")
        res, out = self.run_streamed("display 1\n+ 2;")
        self.assertIsNone(res.error, res.error)
        self.assertIn("\n3\n", out)
        self.assertNotIn("#delimit", out)
        res, out = self.run_streamed("display 40 + 2;")
        self.assertIsNone(res.error, res.error)
        self.assertEqual(out.strip(), "42")
        res = self.engine.execute("nosuchcommand;")
        self.assertTrue(res.error.startswith("command nosuchcommand is unrecognized"), res.error)
        self.run_streamed("#delimit cr")
        res, out = self.run_streamed("display 7")
        self.assertEqual(out.strip(), "7")

    def test_delimit_switch_mid_block(self):
        res, out = self.run_streamed("#delimit ;\ndisplay 1;\n#delimit cr\ndisplay 2")
        self.assertIsNone(res.error, res.error)
        self.assertFalse(self.engine.semicolon_delimiter)
        res, out = self.run_streamed("#delimit ;\ndisplay \"a;b\";")
        self.assertIn("a;b", out)
        self.assertTrue(self.engine.semicolon_delimiter)

    def test_stored_results_and_r_preserved(self):
        self.engine.execute("regress price mpg weight")
        self.engine.execute("summarize price")
        e = self.engine.get_stored_results("e")
        macros = dict(e["macro"])
        self.assertEqual(macros["cmd"], "regress")
        self.assertEqual(macros["cmdline"], "regress price mpg weight")
        self.assertEqual(dict(e["numscalar"])["N"], 74.0)
        self.assertIn(("V", 3, 3), e["matrix"])
        df = self.engine.get_matrix_dataframe("e", "V")
        self.assertEqual(list(df.columns), ["mpg", "weight", "_cons"])
        self.assertEqual(list(df.index), ["mpg", "weight", "_cons"])
        r = dict(self.engine.get_stored_results("r")["numscalar"])
        self.assertAlmostEqual(r["mean"], 6165.2568, places=3)
        # Enumeration must not clobber r() or e().
        self.assertEqual(self.engine.evaluate_expression("%9.2f r(mean)"), (True, "6165.26"))
        self.assertEqual(self.engine.evaluate_expression("e(N)"), (True, "74"))

    def test_results_change_detection(self):
        self.engine.execute("summarize price")
        self.assertFalse(self.engine.execute("display 1").results_changed)
        self.assertTrue(self.engine.execute("summarize mpg").results_changed)
        self.assertTrue(self.engine.execute("regress price mpg").results_changed)

    def test_frames(self):
        self.engine.execute("capture frame drop pst_other\nframe create pst_other\nframe pst_other: set obs 3\n"
                            "frame pst_other: gen y = _n")
        try:
            frames = {f["name"]: f for f in self.engine.get_frames()}
            self.assertEqual(frames["pst_other"]["obs"], 3)
            self.assertFalse(frames["pst_other"]["current"])
            self.assertEqual(list(self.engine.get_frame_dataframe("pst_other")["y"]), [1.0, 2.0, 3.0])
        finally:
            self.engine.execute("frame drop pst_other")

    def test_browse_subset_with_value_labels(self):
        self.engine.execute("sysuse auto, clear")
        res = self.engine.execute("browse make price foreign if foreign == 1 in 50/60")
        self.assertIsNone(res.error, res.error)
        self.assertTrue(res.request_open_data_explorer)
        df = self.engine.get_dataframe(res.browse_request)
        self.assertEqual(list(df.columns), ["make", "price", "foreign"])
        self.assertEqual(list(df.index), list(range(53, 61)))  # 1-based observation numbers
        self.assertEqual(set(df["foreign"].astype(str)), {"Foreign"})
        # The user's data is untouched.
        self.assertEqual(self.engine._sfi.Data.getVarCount(), 12)
        self.assertEqual(self.engine._sfi.Macro.getGlobal("c(changed)"), "0")
        res = self.engine.execute("browse, nolabel")
        df = self.engine.get_dataframe(res.browse_request)
        self.assertEqual(df.shape, (74, 12))
        self.assertNotEqual(str(df["foreign"].dtype), "category")
        full = self.engine.get_dataframe()
        self.assertEqual(list(full["foreign"].cat.categories), ["Domestic", "Foreign"])
        res = self.engine.execute("browse nosuchvar")
        self.assertFalse(res.request_open_data_explorer)
        self.assertIn("r(111);", res.error)

    def test_expression_errors(self):
        ok, msg = self.engine.evaluate_expression("nosuchthing")
        self.assertFalse(ok)
        self.assertIn("r(111);", msg)


PAUSE_SCRIPT = textwrap.dedent(
    """
    import sys
    sys.path.insert(0, {kernel!r})
    from positron_stata_kernel.stata_engine import StataEngine
    e = StataEngine(stata_home={home!r}, edition={edition!r})
    e.initialize()
    res = e.execute("pause on\\ndisplay 1\\npause hello\\nclear all\\npause again\\ndisplay 2")
    assert res.error is None, res.error
    assert "pause:  hello" in res.stdout and "Positron console" in res.stderr
    res = e.execute("pause single line")
    assert res.error is None, res.error
    res = e.execute("set more on\\nsysuse auto, clear\\nlist\\nforvalues i = 1/300 {{\\ndisplay `i'\\n}}")
    assert res.error is None and "--more--" not in res.stdout
    print("PAUSE_OK")
    """
)


@unittest.skipUnless(HAVE_STATA, SKIP_REASON)
class TestLivePauseAndMore(unittest.TestCase):
    def test_pause_and_more_never_block(self):
        script = PAUSE_SCRIPT.format(kernel=os.path.join(repo_root, "kernel"), home=STATA_HOME, edition=EDITION)
        # A script file rather than `python -c`: under -c, PyStata's process output is lost.
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
            f.write(script)
        try:
            proc = subprocess.run([sys.executable, f.name], stdin=subprocess.DEVNULL,
                                  capture_output=True, text=True, timeout=90)
        except subprocess.TimeoutExpired:
            self.fail("pause/more blocked the engine (timed out)")
        finally:
            os.remove(f.name)
        self.assertIn("PAUSE_OK", proc.stdout, proc.stdout[-2000:] + proc.stderr[-2000:])


if __name__ == "__main__":
    unittest.main(verbosity=2)
