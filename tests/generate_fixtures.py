#!/usr/bin/env python3
"""
generate_fixtures.py: Runs against a licensed Stata installation on this machine
and records exact golden outputs, dataset metadata, macros, formats, error strings
and graph-memory behaviour into tests/fixtures/stata_golden.json.

tests/test_engine_unit.py checks the engine and its stand-in PyStata against this
fixture, so machines without Stata still test against real Stata results.
"""

import json
import os
import sys

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(repo_root, "kernel"))

from positron_stata_kernel.stata_engine import StataEngine


def record_steps(engine, commands):
    steps = []
    for command in commands:
        res = engine.execute(command)
        steps.append({"command": command, "plots_count": len(res.plots), "error": res.error})
    return steps


def generate():
    fixtures_dir = os.path.join(repo_root, "tests", "fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)
    golden_file = os.path.join(fixtures_dir, "stata_golden.json")

    print("Initializing StataEngine against local licensed Stata...")
    engine = StataEngine()
    engine.initialize()
    print(f"Connected to Stata ({engine.stata_home}, edition={engine.edition}).")

    golden_data = {
        "stata_version": engine._sfi.Macro.getGlobal("c(stata_version)"),
        "stata_home": engine.stata_home,
        "edition": engine.edition,
        "runs": {},
    }

    # 1. Load Dataset
    print("Recording: sysuse auto, clear")
    res1 = engine.execute("sysuse auto, clear")
    info1 = engine.get_current_dataset_info()
    golden_data["runs"]["sysuse_auto"] = {
        "command": "sysuse auto, clear",
        "stdout": res1.stdout,
        "dataset_changed": res1.dataset_changed,
        "dataset_info": info1,
        "error": res1.error,
    }

    # 2. Regression
    print("Recording: regress price mpg weight foreign")
    res2 = engine.execute("regress price mpg weight foreign")
    golden_data["runs"]["regress"] = {
        "command": "regress price mpg weight foreign",
        "stdout": res2.stdout,
        "dataset_changed": res2.dataset_changed,
        "error": res2.error,
    }

    # 3. Format Mutation
    print("Recording: format price %10.2f")
    res3 = engine.execute("format price %10.2f")
    info3 = engine.get_current_dataset_info()
    golden_data["runs"]["format_mutation"] = {
        "command": "format price %10.2f",
        "dataset_changed": res3.dataset_changed,
        "price_format": info3["var_formats"].get("price"),
        "error": res3.error,
    }

    # 4. Plot Generation
    print("Recording: scatter price mpg")
    res4 = engine.execute("scatter price mpg")
    golden_data["runs"]["scatter"] = {
        "command": "scatter price mpg",
        "plots_count": len(res4.plots),
        "has_svg": len(res4.plots) > 0 and "<svg" in res4.plots[0],
        "plot_bytes": len(res4.plots[0]) if res4.plots else 0,
        "error": res4.error,
    }

    # 5. Non-graph Command with "do" in string (False Positive Guard)
    print('Recording: display "do"')
    res5 = engine.execute('display "do"')
    golden_data["runs"]["display_do"] = {
        "command": 'display "do"',
        "stdout": res5.stdout,
        "plots_count": len(res5.plots),
        "error": res5.error,
    }

    # 6. Syntax / Runtime Error
    print("Recording: unrecognized_cmd_abc")
    res6 = engine.execute("unrecognized_cmd_abc")
    golden_data["runs"]["error_command"] = {
        "command": "unrecognized_cmd_abc",
        "error": res6.error,
        "stdout": res6.stdout,
    }

    # 7. Named graphs must survive for graph combine, and must not be re-sent by later
    #    commands that match the plot trigger but draw nothing.
    print("Recording: graph combine scenario")
    golden_data["runs"]["graph_combine"] = {"steps": record_steps(engine, [
        "scatter price mpg, name(g1, replace)",
        "scatter price weight, name(g2, replace)",
        "graph combine g1 g2",
        "generate line = 1",
        "drop line",
    ])}

    # 8. Re-running the same unnamed plot shows it each time.
    print("Recording: re-run of an unnamed plot")
    golden_data["runs"]["rerun_default_plot"] = {"steps": record_steps(engine, [
        "scatter price mpg",
        "scatter price mpg",
    ])}

    # 9. Redrawing a named graph with new content shows the new version.
    print("Recording: redraw of a named plot")
    golden_data["runs"]["redraw_named_plot"] = {"steps": record_steps(engine, [
        "scatter price mpg, name(g3, replace)",
        "scatter price weight, name(g3, replace)",
    ])}

    # 10. r() results survive the graph housekeeping the kernel runs after a trigger command.
    print("Recording: r() preservation")
    engine.execute("summarize price")
    engine.execute("generate line = 1")
    after = engine.execute("display r(mean)")
    engine.execute("drop line")
    golden_data["runs"]["r_results_preserved"] = {
        "display_r_mean": after.stdout.strip(),
        "error": after.error,
    }

    with open(golden_file, "w", encoding="utf-8") as f:
        json.dump(golden_data, f, indent=2)
        f.write("\n")

    print(f"\nSUCCESS: Generated golden ground truth at:\n{golden_file}")


if __name__ == "__main__":
    generate()
