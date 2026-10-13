#!/usr/bin/env python3
"""
Test OpenStataAdapter: Verify that Positron-Stata runs in-process with open-stata-core
without requiring any proprietary Stata license or binary.
"""

import os
import sys
import unittest

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(repo_root, "kernel"))

from positron_stata_kernel.stata_engine import StataEngine
from positron_stata_kernel.open_stata_adapter import OpenStataAdapter, _find_open_stata_library


class TestOpenStataAdapter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        lib = _find_open_stata_library()
        if not lib:
            raise unittest.SkipTest("libopen_stata_core.so not yet built")

    def setUp(self):
        self.engine = StataEngine(edition="open")
        self.engine.initialize()

    def test_edition_is_open(self):
        self.assertEqual(self.engine.edition, "open")
        self.assertTrue(self.engine._initialized)

    def test_sysuse_and_summarize(self):
        res = self.engine.execute("sysuse auto, clear")
        self.assertIsNone(res.error)

        info = self.engine.get_current_dataset_info()
        self.assertEqual(info["obs"], 74)
        self.assertEqual(len(info["var_names"]), 12)
        self.assertIn("price", info["var_names"])
        self.assertIn("mpg", info["var_names"])

        res2 = self.engine.execute("summarize price mpg")
        self.assertIsNone(res2.error)
        self.assertIn("Variable", res2.stdout)

    def test_regress_and_stored_results(self):
        self.engine.execute("sysuse auto, clear")
        res = self.engine.execute("regress price mpg weight foreign, robust")
        self.assertIsNone(res.error)
        self.assertIn("Number of obs", res.stdout)
        self.assertIn("R-squared", res.stdout)

        # e(b) coefficient matrix
        values, rows, cols = self.engine.get_matrix("e", "b")
        self.assertEqual(len(values), 1)
        self.assertIn("mpg", cols)
        self.assertIn("weight", cols)
        self.assertIn("_cons", cols)

        # Stored results
        stored = self.engine.get_stored_results(cls="e")
        scalars = dict(stored["numscalar"])
        self.assertIn("N", scalars)
        self.assertEqual(scalars["N"], 74.0)
        self.assertIn("r2", scalars)
        self.assertIn("df_r", scalars)
        macros = dict(stored["macro"])
        self.assertEqual(macros.get("cmd"), "regress")
        self.assertEqual(macros.get("vce"), "robust")
        self.assertEqual(macros.get("title"), "Linear regression")
        matrices = [name for name, _, _ in stored["matrix"]]
        self.assertIn("b", matrices)
        self.assertIn("V", matrices)

    def test_collinearity_and_rmcoll(self):
        self.engine.execute("sysuse auto, clear")
        self.engine.execute("gen mpg2 = mpg")
        res = self.engine.execute("_rmcoll mpg mpg2 weight")
        self.assertIsNone(res.error)
        self.assertIn("note: mpg2 omitted because of collinearity", res.stdout)

        stored = self.engine.get_stored_results(cls="r")
        r_scalars = dict(stored["numscalar"])
        self.assertEqual(r_scalars.get("k_omitted"), 1.0)

        # Regress with collinear variable
        res_reg = self.engine.execute("regress price mpg mpg2 weight")
        self.assertIsNone(res_reg.error)
        self.assertIn("omitted", res_reg.stdout)

    def test_dataframe_and_value_labels(self):
        self.engine.execute("sysuse auto, clear")
        self.engine.execute('label define origin 0 "Domestic" 1 "Foreign"')
        self.engine.execute("label values foreign origin")

        df = self.engine.get_dataframe()
        self.assertIsNotNone(df)
        self.assertEqual(df.shape, (74, 12))
        self.assertIn("price", df.columns)
        self.assertIn("foreign", df.columns)

        val_labels = self.engine._value_label_maps()
        self.assertIn("foreign", val_labels)
        self.assertEqual(val_labels["foreign"].get(0), "Domestic")
        self.assertEqual(val_labels["foreign"].get(1), "Foreign")

    def test_frames(self):
        self.engine.execute("sysuse auto, clear")
        self.engine.execute("frame create extra")
        frames = self.engine.get_frames()
        self.assertEqual(len(frames), 2)
        frame_names = [f["name"] for f in frames]
        self.assertIn("default", frame_names)
        self.assertIn("extra", frame_names)

        vars_default = self.engine.get_frame_variables("default")
        self.assertEqual(len(vars_default), 12)
        var_names = [name for name, _, _ in vars_default]
        self.assertIn("price", var_names)
        self.assertIn("mpg", var_names)


if __name__ == "__main__":
    unittest.main()
