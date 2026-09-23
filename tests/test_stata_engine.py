#!/usr/bin/env python3
"""
test_stata_engine.py: End-to-end verification of StataEngine using installed Stata 19 MP.
Tests command execution, stdout capture, dataset state changes, variable inspection,
plot capture, and browse command detection.
"""

import os
import sys
import unittest

# Ensure kernel module is importable
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(repo_root, "kernel"))

from positron_stata_kernel.stata_engine import StataEngine

class TestStataEngineEndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        stata_home = os.environ.get("STATA_HOME", "/usr/local/stata19")
        edition = os.environ.get("STATA_EDITION", "mp")
        print(f"\n--- Initializing StataEngine ({stata_home}, edition={edition}) ---")
        cls.engine = StataEngine(stata_home=stata_home, edition=edition)
        cls.engine.initialize()
        print("StataEngine initialized successfully.")

    def test_01_load_dataset(self):
        res = self.engine.execute("sysuse auto, clear")
        self.assertIn("1978 automobile data", res.stdout)
        self.assertTrue(res.dataset_changed)
        
        info = self.engine.get_current_dataset_info()
        self.assertEqual(info["obs"], 74)
        self.assertEqual(info["vars"], 12)
        print(f"[PASS] Dataset loaded: {info['obs']} observations, {info['vars']} variables.")

    def test_02_estimation_command(self):
        res = self.engine.execute("regress price mpg weight foreign")
        self.assertIn("R-squared", res.stdout)
        self.assertIn("Root MSE", res.stdout)
        self.assertIn("mpg", res.stdout)
        self.assertIn("weight", res.stdout)
        self.assertIn("foreign", res.stdout)
        print("[PASS] Regression executed and verified.")

    def test_03_variables_inspection(self):
        df = self.engine.get_dataframe()
        self.assertIsNotNone(df)
        self.assertEqual(len(df), 74)
        self.assertIn("price", df.columns)
        self.assertIn("mpg", df.columns)
        self.assertIn("make", df.columns)

        info = self.engine.get_current_dataset_info()
        labels = info["var_labels"]
        self.assertIn("price", labels)
        self.assertEqual(labels["price"], "Price")
        print(f"[PASS] Dataframe extracted with {len(df.columns)} columns and {len(labels)} labels.")

    def test_04_browse_detection(self):
        res = self.engine.execute("browse")
        self.assertTrue(res.request_open_data_explorer)

        res2 = self.engine.execute("br price mpg")
        self.assertTrue(res2.request_open_data_explorer)

        res3 = self.engine.execute("summarize")
        self.assertFalse(res3.request_open_data_explorer)
        print("[PASS] Browse / Data Explorer trigger detection verified.")

    def test_05_plot_generation(self):
        res = self.engine.execute("scatter price mpg")
        self.assertTrue(len(res.plots) > 0, "Expected at least one SVG plot to be captured")
        self.assertIn("<svg", res.plots[0], "Captured plot content must contain valid SVG XML")
        print(f"[PASS] Plot generated and captured ({len(res.plots[0])} bytes SVG).")

if __name__ == "__main__":
    unittest.main(verbosity=2)
