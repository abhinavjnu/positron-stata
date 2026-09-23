#!/usr/bin/env python3
"""StataEngine unit tests against a stand-in PyStata/SFI, so they run without Stata.

tests/test_stata_engine.py remains the end-to-end check against a real installation.
"""

import os
import sys
import tempfile
import types
import unittest

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(repo_root, "kernel"))


class FakeStata:
    def __init__(self):
        self.commands = []
        self.graph_in_memory = False

    def run(self, code, **_kwargs):
        self.commands.append(code)
        if code.startswith("qui graph export"):
            if not self.graph_in_memory:
                raise SystemError("no graphs in memory\nr(693);")
            path = code.split('"')[1]
            with open(path, "w", encoding="utf-8") as f:
                f.write("<svg>" + "x" * 600 + "</svg>")
            return
        if "graph drop" in code:
            self.graph_in_memory = False
            return
        if code.startswith("bad"):
            raise SystemError("command bad is unrecognized\nr(199);")
        if code.startswith(("scatter", "do ")):
            self.graph_in_memory = True
        print(f"ran: {code}")


class FakeData:
    def __init__(self):
        self.obs = 74
        self.vars = [["price", "int", "Price", "%8.0gc"], ["foreign", "byte", "Car origin", "%8.0g"]]

    def getObsTotal(self):
        return self.obs

    def getVarCount(self):
        return len(self.vars)

    def getVarName(self, i):
        return self.vars[i][0]

    def getVarType(self, i):
        return self.vars[i][1]

    def getVarLabel(self, i):
        return self.vars[i][2]

    def getVarFormat(self, i):
        return self.vars[i][3]


class FakeMacro:
    def __init__(self):
        self.values = {"c(filename)": "/data/auto.dta", "c(changed)": "0"}

    def getGlobal(self, name):
        return self.values.get(name, "")


class FakeValueLabel:
    @staticmethod
    def getVarValueLabel(i):
        return "origin" if i == 1 else ""


def install_fakes():
    stata = FakeStata()
    config = types.ModuleType("pystata.config")
    config.init = lambda edition, **_kwargs: None
    pystata = types.ModuleType("pystata")
    pystata.config = config
    pystata.stata = stata
    sfi = types.ModuleType("sfi")
    sfi.Data = FakeData()
    sfi.Macro = FakeMacro()
    sfi.ValueLabel = FakeValueLabel()
    sys.modules.update({"pystata": pystata, "pystata.config": config, "sfi": sfi})
    return stata, sfi


class TestStataEngineUnit(unittest.TestCase):
    def setUp(self):
        self.stata, self.sfi = install_fakes()
        from positron_stata_kernel.stata_engine import StataEngine
        self.engine = StataEngine(stata_home=tempfile.gettempdir(), edition="mp")

    def test_success_has_no_error(self):
        res = self.engine.execute("summarize price")
        self.assertIsNone(res.error)
        self.assertIn("ran: summarize price", res.stdout)

    def test_stata_error_is_reported_once_as_error(self):
        res = self.engine.execute("bad command")
        self.assertIn("r(199);", res.error)
        self.assertEqual(res.stderr, "", "error text must not also be streamed to stderr")

    def test_graphs_drawn_by_do_files_are_captured(self):
        res = self.engine.execute('do "C:/work/analysis.do"')
        self.assertEqual(len(res.plots), 1)
        self.assertIn("<svg", res.plots[0])

    def test_plain_commands_do_not_export_graphs(self):
        self.engine.execute("summarize price")
        self.assertFalse(any("graph export" in c for c in self.stata.commands))

    def test_graph_export_path_uses_forward_slashes(self):
        self.engine.execute("scatter price mpg")
        export = next(c for c in self.stata.commands if "graph export" in c)
        self.assertNotIn("\\", export)

    def test_rename_refreshes_variables_pane(self):
        self.assertTrue(self.engine.execute("sysuse auto").dataset_changed)
        self.assertFalse(self.engine.execute("summarize").dataset_changed)
        self.sfi.Data.vars[0][0] = "cost"
        self.assertTrue(self.engine.execute("rename price cost").dataset_changed)

    def test_label_change_refreshes_variables_pane(self):
        self.engine.execute("sysuse auto")
        self.sfi.Data.vars[0][2] = "Price in dollars"
        self.assertTrue(self.engine.execute('label variable price "Price in dollars"').dataset_changed)

    def test_format_change_refreshes_variables_pane(self):
        self.engine.execute("sysuse auto")
        self.sfi.Data.vars[0][3] = "%10.2f"
        self.assertTrue(self.engine.execute('format price %10.2f').dataset_changed)

    def test_display_do_does_not_export_graph(self):
        self.engine.execute('display "do"')
        self.assertFalse(any("graph export" in c for c in self.stata.commands))

    def test_dataset_info_includes_formats_and_value_labels(self):
        self.engine.execute("sysuse auto")
        info = self.engine.get_current_dataset_info()
        self.assertEqual(info["var_formats"]["price"], "%8.0gc")
        self.assertEqual(info["var_value_labels"]["foreign"], "origin")
        self.assertEqual(info["var_value_labels"]["price"], "")

    def test_golden_fixture_matches(self):
        import json
        fixture_path = os.path.join(repo_root, "tests", "fixtures", "stata_golden.json")
        if os.path.exists(fixture_path):
            with open(fixture_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.assertIn("sysuse_auto", data["runs"])
            self.assertEqual(data["runs"]["sysuse_auto"]["dataset_info"]["obs"], 74)
            self.assertEqual(data["runs"]["sysuse_auto"]["dataset_info"]["vars"], 12)
            self.assertIn("error_command", data["runs"])
            self.assertIn("r(199);", data["runs"]["error_command"]["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
