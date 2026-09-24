#!/usr/bin/env python3
"""StataEngine unit tests against a stand-in PyStata/SFI, so they run without Stata.

tests/test_stata_engine.py remains the end-to-end check against a real installation, and
tests/fixtures/stata_golden.json (written by tests/generate_fixtures.py) records real Stata
results that the stand-in is checked against.
"""

import json
import os
import re
import sys
import tempfile
import types
import unittest

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(repo_root, "kernel"))

FIXTURE = os.path.join(repo_root, "tests", "fixtures", "stata_golden.json")


class FakeStata:
    """Models the parts of Stata's graph memory the engine relies on."""

    def __init__(self, macro):
        self.commands = []
        self.macro = macro
        self.graphs = {}  # name -> SVG, in draw order; the last one is the current graph
        self.rc = 0

    def _draw(self, name, body):
        self.graphs.pop(name, None)
        self.graphs[name] = "<svg>" + body + "x" * 600 + "</svg>"

    def run(self, code, **_kwargs):
        self.commands.append(code)
        if code.startswith("qui graph export"):
            if not self.graphs:
                raise SystemError("no graphs in memory\nr(693);")
            path = code.split('"')[1]
            with open(path, "w", encoding="utf-8") as f:
                f.write(next(reversed(self.graphs.values())))
            return
        if re.fullmatch(r"(?:qui|quietly) capture graph drop Graph", code):
            self.rc = 0 if self.graphs.pop("Graph", None) is not None else 111
            return
        if code.startswith("global positron_stata_rc"):
            self.macro.values["positron_stata_rc"] = str(self.rc)
            return
        if code.startswith("macro drop positron_stata_rc"):
            self.macro.values.pop("positron_stata_rc", None)
            return
        if code.startswith("bad"):
            raise SystemError("command bad is unrecognized\nr(199);")
        if code.startswith("graph combine"):
            missing = [g for g in code.split()[2:] if g not in self.graphs]
            if missing:
                raise SystemError(f"graph {missing[0]} not found\nr(111);")
            self._draw("Graph", code)
        elif code.startswith(("scatter", "do ")):
            named = re.search(r"name\((\w+)", code)
            self._draw(named.group(1) if named else "Graph", code)
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
    sfi = types.ModuleType("sfi")
    sfi.Data = FakeData()
    sfi.Macro = FakeMacro()
    sfi.ValueLabel = FakeValueLabel()
    stata = FakeStata(sfi.Macro)
    config = types.ModuleType("pystata.config")
    config.init = lambda edition, **_kwargs: None
    pystata = types.ModuleType("pystata")
    pystata.config = config
    pystata.stata = stata
    sys.modules.update({"pystata": pystata, "pystata.config": config, "sfi": sfi})
    return stata, sfi


class _EngineTestCase(unittest.TestCase):
    _ISOLATED = ("pystata", "pystata.config", "sfi", "positron_stata_kernel.stata_engine")

    def setUp(self):
        self._orig_modules = {k: sys.modules.get(k) for k in self._ISOLATED}
        self.stata, self.sfi = install_fakes()
        sys.modules.pop("positron_stata_kernel.stata_engine", None)
        from positron_stata_kernel.stata_engine import StataEngine
        self.engine = StataEngine(stata_home=tempfile.gettempdir(), edition="mp")

    def tearDown(self):
        for k, v in self._orig_modules.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v

    def plot_counts(self, *commands):
        return [len(self.engine.execute(c).plots) for c in commands]


class TestStataEngineUnit(_EngineTestCase):
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

    def test_named_graphs_survive_for_graph_combine(self):
        self.assertEqual(self.plot_counts("scatter price mpg, name(g1)", "scatter price weight, name(g2)"), [1, 1])
        res = self.engine.execute("graph combine g1 g2")
        self.assertIsNone(res.error)
        self.assertEqual(len(res.plots), 1)

    def test_named_graph_is_not_resent_by_later_trigger_commands(self):
        self.assertEqual(self.plot_counts("scatter price weight, name(g2)", "generate line = 1", "drop line"), [1, 0, 0])

    def test_graph_combine_result_is_not_followed_by_a_stale_graph(self):
        counts = self.plot_counts(
            "scatter price mpg, name(g1)", "scatter price weight, name(g2)", "graph combine g1 g2", "generate line = 1"
        )
        self.assertEqual(counts, [1, 1, 1, 0])

    def test_rerunning_the_same_plot_shows_it_again(self):
        self.assertEqual(self.plot_counts("scatter price mpg", "scatter price mpg"), [1, 1])

    def test_redrawn_named_graph_is_shown(self):
        self.assertEqual(self.plot_counts("scatter price mpg, name(g1)", "scatter price weight, name(g1, replace)"), [1, 1])

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


class TestAgainstGoldenFixture(_EngineTestCase):
    """Checks the engine and the stand-in against results recorded from a real Stata run."""

    @classmethod
    def setUpClass(cls):
        if not os.path.exists(FIXTURE):
            raise unittest.SkipTest("no tests/fixtures/stata_golden.json; run tests/generate_fixtures.py with Stata")
        with open(FIXTURE, encoding="utf-8") as f:
            cls.golden = json.load(f)["runs"]

    def test_dataset_info_matches_real_stata(self):
        recorded = self.golden["sysuse_auto"]["dataset_info"]
        names = recorded["var_names"]
        self.sfi.Data.obs = recorded["obs"]
        self.sfi.Data.vars = [
            [n, recorded["var_types"][n], recorded["var_labels"][n], recorded["var_formats"][n]] for n in names
        ]
        self.sfi.Macro.values["c(filename)"] = recorded["filepath"]
        value_labels = [recorded["var_value_labels"][n] for n in names]
        self.sfi.ValueLabel = types.SimpleNamespace(getVarValueLabel=lambda i: value_labels[i])

        self.engine.execute("sysuse auto, clear")
        self.assertEqual(self.engine.get_current_dataset_info(), recorded)

    def test_stand_in_error_format_matches_real_stata(self):
        recorded = self.golden["error_command"]["error"]
        self.assertRegex(recorded, r"^command \S+ is unrecognized\nr\(199\);$")
        self.assertRegex(self.engine.execute("bad command").error, r"^command \S+ is unrecognized\nr\(199\);$")

    def test_recorded_refresh_and_plot_behaviour(self):
        g = self.golden
        self.assertTrue(g["sysuse_auto"]["dataset_changed"])
        self.assertFalse(g["regress"]["dataset_changed"])
        self.assertTrue(g["format_mutation"]["dataset_changed"])
        self.assertEqual(g["format_mutation"]["price_format"], "%10.2f")
        self.assertEqual(g["scatter"]["plots_count"], 1)
        self.assertEqual(g["display_do"]["plots_count"], 0)

    def test_recorded_graph_memory_behaviour(self):
        if "graph_combine" not in self.golden:
            self.skipTest("fixture predates the graph scenarios; rerun tests/generate_fixtures.py with Stata")
        combine = self.golden["graph_combine"]["steps"]
        self.assertEqual([s["error"] for s in combine], [None] * len(combine))
        self.assertEqual([s["plots_count"] for s in combine], [1, 1, 1, 0, 0])
        self.assertEqual([s["plots_count"] for s in self.golden["rerun_default_plot"]["steps"]], [1, 1])
        self.assertEqual([s["plots_count"] for s in self.golden["redraw_named_plot"]["steps"]], [1, 1])
        # summarize price then a trigger command: r(mean) must survive the kernel's graph housekeeping.
        self.assertTrue(self.golden["r_results_preserved"]["display_r_mean"].startswith("6165.25"))


class TestStataHelpHandler(unittest.TestCase):
    def test_help_handler_http_server_and_show_help(self):
        import urllib.request
        from positron_stata_kernel.help_handler import StataHelpHandler

        class MockEngine:
            def execute(self, cmd):
                class MockRes:
                    stdout = "[R] regress -- Linear regression syntax"
                    error = None
                return MockRes()

        class MockKernel:
            def __init__(self):
                self.engine = MockEngine()

        class MockComm:
            def __init__(self):
                self.events = []

            def send_event(self, name, payload):
                self.events.append((name, payload))

        kernel = MockKernel()
        handler = StataHelpHandler(kernel)
        self.assertGreater(handler._port, 0)

        # Test HTTP GET
        url = f"http://127.0.0.1:{handler._port}/help?topic=regress"
        with urllib.request.urlopen(url) as resp:
            self.assertEqual(resp.status, 200)
            content = resp.read().decode("utf-8")
            self.assertIn("Stata Help: <code>regress</code>", content)
            self.assertIn("Linear regression syntax", content)

        # Test show_help with mock comm
        handler._comm = MockComm()
        handler.show_help("regress")
        self.assertEqual(len(handler._comm.events), 1)
        name, payload = handler._comm.events[0]
        self.assertEqual(name, "show_help")
        self.assertEqual(payload["content"], url)
        self.assertEqual(str(payload["kind"]), "ShowHelpKind.Url")
        self.assertTrue(payload["focus"])

        handler.shutdown()


if __name__ == "__main__":
    unittest.main(verbosity=2)

