#!/usr/bin/env python3
"""Variables pane (e()/r() results, frames), kernel is_complete and user_expressions, with a
stand-in engine. Needs Positron's bundled `positron` package; skipped when it isn't installed."""

import asyncio
import os
import sys
import types
import unittest

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(repo_root, "kernel"))

try:
    from positron_stata_kernel import _positron_loader  # noqa: F401
    from positron.variables_comm import VariableKind  # noqa: F401
    from positron_stata_kernel.variables_handler import StataVariablesHandler
    HAVE_POSITRON = True
except Exception:  # pragma: no cover - depends on a local Positron install
    HAVE_POSITRON = False


class FakeEngine:
    def __init__(self):
        self.semicolon_delimiter = False
        self.dataset = {"obs": 74, "vars": 2, "name": "auto.dta", "var_names": ["price", "mpg"],
                        "var_labels": {"price": "Price"}, "var_types": {"price": "int", "mpg": "int"}}
        self.results = {
            "e": {
                "numscalar": [("N", 74.0), ("r2", 0.2933891232)],
                "macro": [("title", "Linear regression"), ("cmdline", "regress price mpg weight"), ("cmd", "regress")],
                "matrix": [("b", 1, 3), ("V", 3, 3)],
            },
            "r": {"numscalar": [("N", 74.0), ("mean", 6165.2568)], "macro": [], "matrix": []},
        }
        self.matrices = {
            ("e", "b"): ([[-49.5, 1.75, None]], ["y1"], ["mpg", "weight", "_cons"]),
            ("e", "V"): ([[1.0, 2.0, 3.0], [2.0, 4.0, 5.0], [3.0, 5.0, 6.0]], ["mpg", "weight", "_cons"],
                         ["mpg", "weight", "_cons"]),
        }
        self.frames = [{"name": "default", "obs": 74, "vars": 2, "current": True}]
        self.expressions = []

    def get_current_dataset_info(self):
        return self.dataset

    def get_stored_result_names(self):
        return {"marker": True}

    def get_stored_results(self, cls, names=None):
        return self.results[cls]

    def get_matrix(self, cls, name):
        return self.matrices[(cls, name)]

    def get_matrix_dataframe(self, cls, name):
        import pandas as pd
        values, rows, cols = self.matrices[(cls, name)]
        return pd.DataFrame(values, index=rows, columns=cols)

    def get_frames(self):
        return self.frames

    def get_frame_variables(self, name):
        return [("x", "float", "an x"), ("s", "str5", "")]

    def get_frame_dataframe(self, name):
        import pandas as pd
        return pd.DataFrame({"x": [1.0, 2.0]})

    def evaluate_expression(self, expr):
        self.expressions.append(expr)
        if expr == "bad":
            return False, "bad not found\nr(111);"
        return True, "42"


class FakeComm:
    def __init__(self):
        self.results, self.errors, self.events = [], [], []

    def send_result(self, result):
        self.results.append(result)

    def send_error(self, code, message):
        self.errors.append((code, message))

    def send_event(self, name, payload):
        self.events.append((name, payload))


class FakeKernel:
    def __init__(self):
        self.engine = FakeEngine()
        self.registered = []

    def register_data_explorer_table(self, df, title, path):
        self.registered.append((df, title, path))
        return "comm-1"

    def open_data_explorer_for_current_dataset(self):
        return "comm-dataset"


@unittest.skipUnless(HAVE_POSITRON, "Positron's python_files (positron package) not found")
class TestVariablesPane(unittest.TestCase):
    def setUp(self):
        self.kernel = FakeKernel()
        self.handler = StataVariablesHandler(self.kernel)
        self.comm = self.handler._comm = FakeComm()

    def top_level(self):
        return {v.access_key: v for v in self.handler._get_variables()}

    def inspect(self, path):
        self.handler._inspect_var(path)
        return {c["access_key"]: c for c in self.comm.results[-1]["children"]}

    def test_top_level_entries(self):
        top = self.top_level()
        self.assertEqual(list(top), ["current_dataset", "e", "r"])
        e = top["e"]
        self.assertEqual(e.display_name, "e() results")
        self.assertEqual(e.display_value, "regress price mpg weight, N=74, R²=0.2934")
        self.assertTrue(e.has_children)
        self.assertEqual(top["r"].display_value, "N=74, mean=6165.2568")

    def test_empty_results_are_hidden(self):
        self.kernel.engine.results["e"] = {"numscalar": [], "macro": [], "matrix": []}
        self.kernel.engine.results["r"] = {"numscalar": [], "macro": [], "matrix": []}
        self.assertEqual(list(self.top_level()), ["current_dataset"])

    def test_enumerates_names_once_per_refresh(self):
        calls = []
        engine = self.kernel.engine
        original = engine.get_stored_result_names
        engine.get_stored_result_names = lambda: calls.append(1) or original()
        self.handler._get_variables()
        self.assertEqual(len(calls), 1)

    def test_inspect_e_results(self):
        children = self.inspect(["e"])
        keys = list(children)
        self.assertEqual(keys[:3], ["macro:cmd", "macro:cmdline", "macro:title"], "cmd/cmdline come first")
        self.assertEqual(children["scalar:N"]["display_name"], "e(N)")
        self.assertEqual(children["scalar:N"]["display_value"], "74")
        self.assertEqual(children["macro:cmdline"]["display_value"], "regress price mpg weight")
        b = children["matrix:b"]
        self.assertTrue(b["has_viewer"])
        self.assertEqual(b["display_value"], "mpg=-49.5, weight=1.75, _cons=.")
        self.assertEqual(children["matrix:V"]["display_value"], "3 × 3 matrix")

    def test_inspect_matrices(self):
        b = self.inspect(["e", "matrix:b"])
        self.assertEqual([c["display_name"] for c in b.values()], ["mpg", "weight", "_cons"])
        self.assertEqual(b["col:2"]["display_value"], ".")
        v = self.inspect(["e", "matrix:V"])
        self.assertEqual(v["row:1"]["display_name"], "weight")
        self.assertEqual(v["row:1"]["display_value"], "mpg=2, weight=4, _cons=5")

    def test_view_matrix_opens_data_explorer(self):
        self.handler._perform_view_action(["e", "matrix:V"])
        df, title, path = self.kernel.registered[-1]
        self.assertEqual(title, "e(V)")
        self.assertEqual(path, ["e", "matrix:V"])
        self.assertEqual(list(df.index), ["mpg", "weight", "_cons"])
        self.assertEqual(self.comm.results[-1], "comm-1")

    def test_view_dataset_unchanged(self):
        self.handler._perform_view_action(["current_dataset"])
        self.assertEqual(self.comm.results[-1], "comm-dataset")

    def test_view_unknown_path_is_an_error(self):
        self.handler._perform_view_action(["e", "scalar:N"])
        self.assertEqual(len(self.comm.errors), 1)

    def test_dataset_children_unchanged(self):
        children = self.inspect(["current_dataset"])
        self.assertEqual(list(children), ["price", "mpg"])
        self.assertEqual(children["price"]["display_value"], "Price")

    def test_frames(self):
        self.assertNotIn("frames", self.top_level(), "a lone default frame is not listed")
        self.kernel.engine.frames = [
            {"name": "default", "obs": 74, "vars": 2, "current": True},
            {"name": "other", "obs": 2, "vars": 1, "current": False},
        ]
        frames = self.top_level()["frames"]
        self.assertEqual(frames.display_value, "2 frames (current: default)")
        children = self.inspect(["frames"])
        self.assertEqual(children["frame:default"]["display_name"], "default (current)")
        self.assertEqual(children["frame:other"]["display_type"], "2 obs, 1 vars")
        self.assertTrue(children["frame:other"]["has_viewer"])
        variables = self.inspect(["frames", "frame:other"])
        self.assertEqual(variables["s"]["kind"], "string")
        self.handler._perform_view_action(["frames", "frame:other"])
        self.assertEqual(self.kernel.registered[-1][1], "frame other")

    def test_non_default_current_frame_is_listed(self):
        self.kernel.engine.frames = [{"name": "work", "obs": 1, "vars": 1, "current": True}]
        self.assertIn("frames", self.top_level())

    def test_refresh_event_includes_results(self):
        self.handler.send_refresh_event()
        name, payload = self.comm.events[-1]
        self.assertEqual(name, "refresh")
        self.assertEqual([v["access_key"] for v in payload["variables"]], ["current_dataset", "e", "r"])


def _import_kernel():
    try:
        from positron_stata_kernel.kernel import PositronStataKernel
        return PositronStataKernel
    except Exception as e:  # pragma: no cover - depends on a local Positron install
        raise unittest.SkipTest(f"kernel dependencies unavailable: {e}")


@unittest.skipUnless(HAVE_POSITRON, "Positron's python_files (positron package) not found")
class TestKernelMethods(unittest.TestCase):
    """Calls PositronStataKernel methods on a stand-in `self`, avoiding a live ZMQ session."""

    def setUp(self):
        self.K = _import_kernel()
        self.engine = FakeEngine()
        self.sent = []
        self.refreshed = []
        k = types.SimpleNamespace(
            engine=self.engine, execution_count=3, iopub_socket=None,
            send_response=lambda sock, kind, content: self.sent.append((kind, content)),
            help_handler=types.SimpleNamespace(_comm=None),
            variables_handler=types.SimpleNamespace(send_refresh_event=lambda: self.refreshed.append(1)),
            ui_handler=types.SimpleNamespace(poll_working_directory=lambda: None),
        )
        for name in ("_ok_reply", "_error_reply", "_evaluate_user_expressions", "_send_stdout", "_send_stderr"):
            setattr(k, name, getattr(self.K, name).__get__(k))
        self.k = k

    def test_is_complete_uses_engine_delimiter(self):
        self.assertEqual(asyncio.run(self.K.do_is_complete(self.k, "regress price mpg"))["status"], "complete")
        self.engine.semicolon_delimiter = True
        self.assertEqual(asyncio.run(self.K.do_is_complete(self.k, "regress price mpg"))["status"], "incomplete")
        self.assertEqual(asyncio.run(self.K.do_is_complete(self.k, "regress price mpg;"))["status"], "complete")

    def test_user_expressions(self):
        reply = self.k._ok_reply({"a": "e(N)", "b": "bad"})
        self.assertEqual(reply["user_expressions"]["a"],
                         {"status": "ok", "data": {"text/plain": "42"}, "metadata": {}})
        err = reply["user_expressions"]["b"]
        self.assertEqual(err["status"], "error")
        self.assertEqual(err["ename"], "StataError")
        self.assertEqual(err["evalue"], "bad not found\nr(111);")
        self.assertIsInstance(err["traceback"], list)
        self.assertEqual(self.sent, [], "expressions must not print to the console")

    def test_user_expressions_default_empty(self):
        self.assertEqual(self.k._ok_reply()["user_expressions"], {})

    def test_do_execute_with_empty_code_still_evaluates_expressions(self):
        reply = self.K.do_execute(self.k, "", False, user_expressions={"x": "1+1"})
        self.assertEqual(reply["user_expressions"]["x"]["data"]["text/plain"], "42")

    def _execute(self, result, **kwargs):
        self.engine.execute = lambda code, **_kw: result
        return self.K.do_execute(self.k, "summarize", False, **kwargs)

    def test_results_change_refreshes_variables_pane(self):
        from positron_stata_kernel.stata_engine import ExecutionResult
        self._execute(ExecutionResult(stdout="", results_changed=True))
        self.assertEqual(len(self.refreshed), 1)
        self._execute(ExecutionResult(stdout=""))
        self.assertEqual(len(self.refreshed), 1)

    def test_expressions_skipped_after_error(self):
        from positron_stata_kernel.stata_engine import ExecutionResult
        reply = self._execute(ExecutionResult(stdout="", error="r(199);"), user_expressions={"x": "1"})
        self.assertEqual(reply["status"], "error")
        self.assertEqual(self.engine.expressions, [])

    def test_help_interception_accepts_semicolon_in_semicolon_mode(self):
        shown = []
        self.k.help_handler = types.SimpleNamespace(_comm=object(), show_help=shown.append)
        self.engine.semicolon_delimiter = True
        self.K.do_execute(self.k, "help regress;", False)
        self.assertEqual(shown, ["regress"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
