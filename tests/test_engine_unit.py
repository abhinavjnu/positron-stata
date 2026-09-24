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
        self.kwargs = []
        self.macro = macro
        self.graphs = {}  # name -> SVG, in draw order; the last one is the current graph
        self.rc = 0

    def _draw(self, name, body):
        self.graphs.pop(name, None)
        self.graphs[name] = "<svg>" + body + "x" * 600 + "</svg>"

    def run(self, code, **kwargs):
        self.commands.append(code)
        self.kwargs.append(kwargs)
        if re.search(r"(?m)^\s*(?:#delimit ;\n)?(?:browse|br|edit)\b", code):
            # The kernel's browse.ado shim records the request in a global.
            self.macro.values["positron_stata_browse"] = "1"
        if code.startswith("#"):
            if "\n" not in code:
                # PyStata runs single lines directly, where `#` is not a command (verified live).
                raise SystemError("# is not a valid command name\nr(199);")
            # Multi-line code goes through a temp do-file; model the transcript real Stata prints.
            first, rest = code.split("\n", 1)
            echo = kwargs.get("echo", True)
            head = ("\n. " + first if echo else "") + "\ndelimiter now ;\n"
            if rest.startswith("bad"):
                # On error real PyStata streams nothing; the whole transcript is in the exception.
                raise SystemError(head + (". " + rest + "\n" if echo else "")
                                  + "command bad is unrecognized\nr(199);\nr(199);\n")
            print(head + (". " + rest + "\n" if echo else "") + f"ran: {rest}")
            return
        if code.startswith("display "):
            expr = code[len("display "):]
            if expr.startswith("nosuch"):
                raise SystemError(f"{expr} not found\nr(111);")
            print(f"  {eval(expr, {})}  ")
            return
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

    def setGlobal(self, name, value):
        if value:
            self.values[name] = value
        else:
            self.values.pop(name, None)


MISSING = 8.98846567431158e307


class FakeResults:
    """Stored results plus the sfi pieces (SFIToolkit, Scalar, Matrix, Frame) that read them."""

    def __init__(self, macro):
        self.macro = macro
        self.stata_calls = []
        self.scalars = {}  # "e(N)" -> value
        self.matrices = {}  # "e(b)" -> (values, rownames, colnames)
        self.frames = [("default", 74, 2)]
        self.cwf = "default"

    # SFIToolkit
    def stata(self, cmd):
        self.stata_calls.append(cmd)
        for g, cls, kind in re.findall(r'st_global\("(\w+)", invtokens\(st_dir\("(\w)\(\)", "(\w+)"', cmd):
            if kind == "numscalar":
                names = [k for k in self.scalars if k.startswith(cls + "(")]
            elif kind == "matrix":
                names = [k for k in self.matrices if k.startswith(cls + "(")]
            else:
                names = [k for k in self.macro.values if k.startswith(cls + "(")]
            self.macro.values[g] = " ".join(k[2:-1] for k in names)

    def macroExpand(self, text):
        m = re.fullmatch(r"`: (row|col)fullnames (\w\(\w+\))'", text)
        values, rows, cols = self.matrices[m.group(2)]
        return " ".join(rows if m.group(1) == "row" else cols)

    # Scalar
    def getValue(self, name):
        return self.scalars.get(name)

    # Matrix
    def get(self, name):
        return [list(r) for r in self.matrices[name][0]]

    def getRowTotal(self, name):
        return len(self.matrices[name][0])

    def getColTotal(self, name):
        return len(self.matrices[name][0][0])

    def getRowNames(self, name):
        return [n.split(":")[-1] for n in self.matrices[name][1]]

    def getColNames(self, name):
        return [n.split(":")[-1] for n in self.matrices[name][2]]

    # Frame
    def getCWF(self):
        return self.cwf

    def getFrameCount(self):
        return len(self.frames)

    def getFrameAt(self, i):
        return self.frames[i][0]

    def connect(self, name):
        _, obs, nvars = next(f for f in self.frames if f[0] == name)
        return types.SimpleNamespace(
            getObsTotal=lambda: obs,
            getVarCount=lambda: nvars,
            getVarName=lambda i: f"v{i}",
            getVarType=lambda i: "float",
            getVarLabel=lambda i: f"label {i}",
        )


class FakeValueLabel:
    @staticmethod
    def getVarValueLabel(i):
        return "origin" if i == 1 else ""


def install_fakes():
    sfi = types.ModuleType("sfi")
    sfi.Data = FakeData()
    sfi.Macro = FakeMacro()
    sfi.ValueLabel = FakeValueLabel()
    results = FakeResults(sfi.Macro)
    sfi.results = results
    sfi.SFIToolkit = sfi.Scalar = sfi.Matrix = sfi.Frame = results
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


class TestDelimitUnit(_EngineTestCase):
    def run_streamed(self, code):
        chunks = []
        res = self.engine.execute(code, stdout_callback=chunks.append)
        return res, "".join(chunks)

    def test_lone_directive_is_handled_by_the_kernel(self):
        for code, expected in (("#delimit ;", True), ("#delimit cr", False), ("#d ;", True),
                               ("#d cr", False), ("#delimit ; // switch", True), ("  #delim ; /* c */", True)):
            res, streamed = self.run_streamed(code)
            self.assertIsNone(res.error, code)
            self.assertEqual(self.engine.semicolon_delimiter, expected, code)
            self.assertEqual(streamed, f"delimiter now {';' if expected else 'cr'}\n")
        self.assertFalse(any(c.lstrip().startswith("#") for c in self.stata.commands),
                         "a lone #delimit must never reach PyStata's single-line path")

    def test_semicolon_mode_single_line_is_unechoed_and_clean(self):
        self.engine.execute("#delimit ;")
        res, streamed = self.run_streamed("summarize price;")
        self.assertEqual(self.stata.commands[-1], "#delimit ;\nsummarize price;")
        self.assertEqual(self.stata.kwargs[-1], {"echo": False})
        self.assertEqual(streamed, "ran: summarize price;\n")
        self.assertEqual(res.stdout, "ran: summarize price;\n")
        self.assertTrue(self.engine.semicolon_delimiter, "state persists across executions")


    def test_semicolon_mode_multi_line_hides_injected_directive(self):
        self.engine.execute("#delimit ;")
        res, streamed = self.run_streamed("regress price\n  mpg;")
        self.assertEqual(streamed, "\n. regress price\n  mpg;\nran: regress price\n  mpg;\n")
        self.assertNotIn("#delimit", res.stdout)

    def test_semicolon_mode_error_message_hides_injected_directive(self):
        self.engine.execute("#delimit ;")
        res = self.engine.execute("bad;")
        self.assertEqual(res.error, "command bad is unrecognized\nr(199);\nr(199);")
        res = self.engine.execute("bad;\ndisplay 1;")
        self.assertTrue(res.error.startswith("\n. bad;"), res.error)

    def test_mid_block_switches_track_final_state(self):
        self.engine.execute("sysuse auto\n#delimit ;\nsummarize price\n mpg;")
        self.assertTrue(self.engine.semicolon_delimiter)
        self.engine.execute("display 1; #delimit cr\ndisplay 2")
        self.assertFalse(self.engine.semicolon_delimiter)
        self.assertEqual(self.stata.commands[-1], "#delimit ;\ndisplay 1; #delimit cr\ndisplay 2")
        self.engine.execute("summarize")
        self.assertEqual(self.stata.commands[-1], "summarize")

    def test_cr_mode_code_is_run_unchanged(self):
        self.engine.execute("summarize price")
        self.assertEqual(self.stata.commands[-1], "summarize price")
        self.assertEqual(self.stata.kwargs[-1], {})

    def test_directives_in_strings_or_comments_are_ignored(self):
        self.engine.execute('display "#delimit ;"')
        self.engine.execute("* #delimit ;\ndisplay 1")
        self.engine.execute("display 1 // #delimit ;")
        self.assertFalse(self.engine.semicolon_delimiter)

    def test_non_interactive_execution_ignores_and_keeps_state(self):
        self.engine.execute("#delimit ;")
        self.engine.execute("help regress", interactive=False)
        self.assertEqual(self.stata.commands[-1], "help regress")
        self.assertTrue(self.engine.semicolon_delimiter)

    def test_browse_with_semicolon_opens_data_explorer(self):
        self.engine.execute("#delimit ;")
        self.assertTrue(self.engine.execute("browse;").request_open_data_explorer)


class TestPauseGuardUnit(_EngineTestCase):
    def test_override_is_prepended_to_adopath_once(self):
        self.sfi.Macro.values["S_ADO"] = "BASE;SITE;.;PERSONAL;PLUS;OLDPLACE"
        self.engine.execute("summarize")
        self.engine.execute("summarize")
        ado_path = self.sfi.Macro.values["S_ADO"]
        m = re.fullmatch(r'`"([^"]+)"\';BASE;SITE;\.;PERSONAL;PLUS;OLDPLACE', ado_path)
        self.assertIsNotNone(m, ado_path)
        with open(os.path.join(m.group(1), "pause.ado"), encoding="utf-8") as f:
            ado = f.read()
        self.assertIn("program define pause", ado)
        self.assertNotIn("_request", ado, "the override must never read the console")

    def test_install_runs_no_stata_commands(self):
        # Running ado code such as `adopath ++` would overwrite r().
        self.engine.execute("summarize")
        self.assertEqual(self.stata.commands, ["summarize"])

    def test_note_is_shown_once_on_stderr(self):
        from positron_stata_kernel.stata_engine import PAUSE_NOTE
        errs = []
        res = self.engine.execute("pause on\npause here", stderr_callback=errs.append)
        self.assertEqual(errs, [PAUSE_NOTE])
        self.assertIn(PAUSE_NOTE, res.stderr)
        errs.clear()
        self.engine.execute("pause on", stderr_callback=errs.append)
        self.assertEqual(errs, [])

    def test_no_note_without_pause_on(self):
        errs = []
        self.engine.execute("pause off", stderr_callback=errs.append)
        self.engine.execute('display "pause on"', stderr_callback=errs.append)
        self.assertEqual(errs, [])

    def test_failed_install_falls_back_to_pause_off(self):
        self.sfi.Macro.values["PAUSEON"] = "yes"
        original = self.sfi.Macro.setGlobal

        def failing(name, value):
            if name == "S_ADO":
                raise RuntimeError("cannot set S_ADO")
            return original(name, value)

        self.sfi.Macro.setGlobal = failing
        self.engine.execute("summarize")
        self.assertNotIn("PAUSEON", self.sfi.Macro.values)


class TestExpressionsUnit(_EngineTestCase):
    def test_value_is_trimmed(self):
        self.assertEqual(self.engine.evaluate_expression("2+2"), (True, "4"))
        self.assertEqual(self.stata.kwargs[-1], {"echo": False})

    def test_error_returns_stata_message(self):
        self.assertEqual(self.engine.evaluate_expression("nosuch"), (False, "nosuch not found\nr(111);"))

    def test_bad_input_is_rejected_without_running(self):
        before = len(self.stata.commands)
        self.assertFalse(self.engine.evaluate_expression("   ")[0])
        self.assertFalse(self.engine.evaluate_expression("1\ndisplay 2")[0])
        self.assertEqual(len(self.stata.commands), before)

    def test_trailing_semicolon_is_dropped(self):
        self.assertEqual(self.engine.evaluate_expression("3*3;"), (True, "9"))

    def test_expression_output_is_captured_not_printed(self):
        import contextlib
        import io
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            self.assertEqual(self.engine.evaluate_expression("1+1"), (True, "2"))
        self.assertEqual(buf.getvalue(), "")


class TestInterruptUnit(_EngineTestCase):
    def setUp(self):
        super().setUp()
        self.engine.initialize()
        self.breaks = []
        self.engine._stlib = types.SimpleNamespace(StataSO_SetBreak=lambda: self.breaks.append(1))

    def test_break_only_during_user_code(self):
        self.assertFalse(self.engine.request_break(), "idle: nothing to stop")
        results = []

        def run(code, **kwargs):
            results.append(self.engine.request_break())
            raise SystemError("--Break--\nr(1);")

        self.stata.run = run
        res = self.engine.execute("forvalues i = 1/1000000 {\n}")
        self.assertEqual(results, [True])
        self.assertEqual(self.breaks, [1])
        self.assertTrue(res.interrupted)
        self.assertIn("--Break--", res.error)
        self.assertFalse(self.engine.is_running_user_code)

    def test_keyboard_interrupt_becomes_break_error(self):
        def run(code, **kwargs):
            raise KeyboardInterrupt

        self.stata.run = run
        res = self.engine.execute("display 1")
        self.assertTrue(res.interrupted)
        self.assertEqual(res.error, "--Break--\nr(1);")


class TestValueLabelsUnit(unittest.TestCase):
    def setUp(self):
        from positron_stata_kernel import stata_engine
        self.mod = stata_engine

    def test_categorical_follows_code_order(self):
        cat = self.mod.labeled_categorical([2, 1, float("nan"), 3, 1], {1: "zeta", 2: "alpha"})
        self.assertTrue(cat.ordered)
        self.assertEqual(list(cat.categories), ["zeta", "alpha", "3"])
        self.assertEqual(list(cat.codes), [1, 0, -1, 2, 0])

    def test_duplicate_labels_stay_distinct(self):
        cat = self.mod.labeled_categorical([1, 2], {1: "x", 2: "x"})
        self.assertEqual(list(cat.categories), ["x", "x (2)"])

    def test_env_switch(self):
        old = os.environ.get("POSITRON_STATA_VALUE_LABELS")
        try:
            os.environ.pop("POSITRON_STATA_VALUE_LABELS", None)
            self.assertTrue(self.mod.value_labels_enabled())
            os.environ["POSITRON_STATA_VALUE_LABELS"] = "0"
            self.assertFalse(self.mod.value_labels_enabled())
        finally:
            if old is None:
                os.environ.pop("POSITRON_STATA_VALUE_LABELS", None)
            else:
                os.environ["POSITRON_STATA_VALUE_LABELS"] = old


class TestStoredResultsUnit(_EngineTestCase):
    def setUp(self):
        super().setUp()
        self.engine.initialize()
        r = self.sfi.results
        m = self.sfi.Macro.values
        m.update({"e(cmd)": "regress", "e(cmdline)": "regress price mpg", "e(_internal)": "x"})
        r.scalars.update({"e(N)": 74.0, "e(r2)": 0.2934, "r(mean)": 6165.25, "r(max)": MISSING})
        r.matrices["e(b)"] = ([[-238.9, 11253.1]], ["y1"], ["mpg", "_cons"])
        r.matrices["e(V)"] = ([[1.0, 2.0], [2.0, MISSING]], ["mpg", "_cons"], ["mpg", "_cons"])

    def test_names_come_from_st_dir_and_skip_internal(self):
        names = self.engine.get_stored_result_names()
        self.assertEqual(names[("e", "macro")], ["cmd", "cmdline"])
        self.assertEqual(names[("e", "numscalar")], ["N", "r2"])
        self.assertEqual(names[("e", "matrix")], ["b", "V"])
        self.assertEqual(names[("r", "numscalar")], ["mean", "max"])
        self.assertEqual(len(self.sfi.results.stata_calls), 1, "one Mata call enumerates everything")
        self.assertTrue(self.sfi.results.stata_calls[0].startswith("mata: "))
        self.assertFalse([k for k in self.sfi.Macro.values if k.startswith("positron_stata_")],
                         "helper globals must be cleaned up")

    def test_values(self):
        res = self.engine.get_stored_results("e")
        self.assertIn(("cmdline", "regress price mpg"), res["macro"])
        self.assertIn(("N", 74.0), res["numscalar"])
        self.assertEqual(res["matrix"], [("b", 1, 2), ("V", 2, 2)])

    def test_matrix_missing_values_and_names(self):
        values, rows, cols = self.engine.get_matrix("e", "V")
        self.assertEqual(values, [[1.0, 2.0], [2.0, None]])
        self.assertEqual(rows, ["mpg", "_cons"])
        df = self.engine.get_matrix_dataframe("e", "V")
        self.assertEqual(list(df.index), ["mpg", "_cons"])
        self.assertEqual(list(df.columns), ["mpg", "_cons"])
        self.assertTrue(df.isna().iloc[1, 1])

    def test_equation_names_keep_columns_unique(self):
        self.sfi.results.matrices["e(b)"] = ([[1.0, 2.0, 3.0, 4.0]], ["y1"], ["1:mpg", "1:_cons", "2:mpg", "2:_cons"])
        self.assertEqual(list(self.engine.get_matrix_dataframe("e", "b").columns),
                         ["1:mpg", "1:_cons", "2:mpg", "2:_cons"])

    def test_results_change_detection(self):
        self.engine.execute("regress price mpg")
        self.assertFalse(self.engine.execute("display 1").results_changed)
        self.sfi.results.scalars["r(mean)"] = 21.3
        self.assertTrue(self.engine.execute("summarize mpg").results_changed)
        self.sfi.Macro.values["e(cmdline)"] = "regress price weight"
        self.assertTrue(self.engine.execute("regress price weight").results_changed)
        self.sfi.results.frames.append(("other", 3, 1))
        self.assertTrue(self.engine.execute("frame create other").results_changed)
        self.assertFalse(self.engine.execute("display 2").results_changed)

    def test_frames(self):
        self.sfi.results.frames.append(("other", 3, 1))
        self.assertEqual(self.engine.get_frames(), [
            {"name": "default", "obs": 74, "vars": 2, "current": True},
            {"name": "other", "obs": 3, "vars": 1, "current": False},
        ])
        self.assertEqual(self.engine.get_frame_variables("other"), [("v0", "float", "label 0")])

    def test_enumeration_failure_is_harmless(self):
        def boom(_cmd):
            raise SyntaxError("failed to execute the specified Stata command")
        self.sfi.SFIToolkit = types.SimpleNamespace(stata=boom)
        self.engine._sfi = self.sfi
        self.assertEqual(self.engine.get_stored_results("e"), {"numscalar": [], "macro": [], "matrix": []})


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
            def execute(self, cmd, **_kwargs):
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

