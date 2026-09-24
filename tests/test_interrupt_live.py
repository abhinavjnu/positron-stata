#!/usr/bin/env python3
"""End-to-end interrupt check: launch kernel/launcher.py with jupyter_client, interrupt a long
Stata loop and expect a clean `--Break--` error reply, then confirm the kernel still works.

Skipped when Stata, a PyStata-compatible Python, or ipykernel/jupyter_client are missing.
"""

import os
import sys
import time
import unittest

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATA_HOME = os.environ.get("STATA_HOME", "/usr/local/stata19")
EDITION = os.environ.get("STATA_EDITION", "mp")
POSITRON_PY = "/usr/share/positron/resources/app/extensions/positron-python/python_files"
# Positron's bundled ipykernel: pure-Python packages plus compiled ones (zmq) per CPython version.
_CP = f"cp{sys.version_info.major}{sys.version_info.minor}"
IPYKERNEL_LIBS = [p for p in (os.path.join(POSITRON_PY, "lib", "ipykernel", "py3"),
                              os.path.join(POSITRON_PY, "lib", "ipykernel", "x64", _CP),
                              os.path.join(POSITRON_PY, "lib", "ipykernel", "x64", "cp3"),
                              os.path.join(POSITRON_PY, "lib", "ipykernel", "arm64", _CP),
                              os.path.join(POSITRON_PY, "lib", "ipykernel", "arm64", "cp3"))
                  if os.path.isdir(p)]
IPYKERNEL_LIB = os.pathsep.join(IPYKERNEL_LIBS)
for _p in IPYKERNEL_LIBS:
    if _p not in sys.path:
        sys.path.append(_p)

try:
    import ipykernel  # noqa: F401  (the kernel process needs it too)
    from jupyter_client import KernelManager
    from jupyter_client.kernelspec import KernelSpec
    HAVE_JUPYTER = True
except Exception:
    HAVE_JUPYTER = False

HAVE_STATA = os.path.isdir(os.path.join(STATA_HOME, "utilities", "pystata")) and sys.version_info < (3, 14)

LOOP = "forvalues i = 1/100000000 {\n    quietly local x = `i' * 2\n}"


@unittest.skipUnless(HAVE_STATA and HAVE_JUPYTER, "needs Stata, Python <= 3.13 and ipykernel/jupyter_client")
@unittest.skipIf(os.name == "nt", "POSIX-only live check")
class TestInterruptLive(unittest.TestCase):
    def start(self, interrupt_mode):
        env = dict(os.environ)
        env.update({
            "PYTHONPATH": os.pathsep.join(p for p in (os.path.join(repo_root, "kernel"), IPYKERNEL_LIB,
                                                      env.get("PYTHONPATH", "")) if p),
            "STATA_HOME": STATA_HOME,
            "STATA_EDITION": EDITION,
            "STATA_VERSION": env.get("STATA_VERSION", "19"),
            "POSITRON_PYTHON_FILES": os.path.join(POSITRON_PY, "posit"),
        })
        km = KernelManager()
        km._kernel_spec = KernelSpec(
            argv=[sys.executable, os.path.join(repo_root, "kernel", "launcher.py"), "-f", "{connection_file}"],
            display_name="Stata (test)", language="stata", interrupt_mode=interrupt_mode, env={},
        )
        km.start_kernel(env=env)
        kc = km.client()
        kc.start_channels()
        try:
            kc.wait_for_ready(timeout=60)
        except Exception:
            kc.stop_channels()
            km.shutdown_kernel(now=True)
            raise
        self.addCleanup(lambda: (kc.stop_channels(), km.shutdown_kernel(now=True)))
        return km, kc

    def execute(self, kc, code, timeout):
        msg_id = kc.execute(code)
        reply = kc.get_shell_msg(timeout=timeout)
        while reply["parent_header"].get("msg_id") != msg_id:
            reply = kc.get_shell_msg(timeout=timeout)
        return reply["content"]

    def drain_iopub(self, kc):
        msgs = []
        while True:
            try:
                msgs.append(kc.get_iopub_msg(timeout=0.5))
            except Exception:
                return msgs

    def check_interrupt(self, interrupt_mode):
        km, kc = self.start(interrupt_mode)
        self.assertEqual(self.execute(kc, "display 1", timeout=60)["status"], "ok")
        msg_id = kc.execute(LOOP)
        # Wait until the kernel is busy with the loop (not just queued), then let it run.
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            msg = kc.get_iopub_msg(timeout=30)
            if (msg["parent_header"].get("msg_id") == msg_id and msg["msg_type"] == "status"
                    and msg["content"]["execution_state"] == "busy"):
                break
        time.sleep(3)
        t0 = time.monotonic()
        km.interrupt_kernel()
        reply = kc.get_shell_msg(timeout=15)
        while reply["parent_header"].get("msg_id") != msg_id:
            reply = kc.get_shell_msg(timeout=15)
        elapsed = time.monotonic() - t0
        content = reply["content"]
        self.assertEqual(content["status"], "error", content)
        self.assertIn("--Break--", content["evalue"])
        self.assertIn("r(1);", content["evalue"])
        self.assertNotIn("KeyboardInterrupt", content.get("ename", "") + content["evalue"])
        self.assertLess(elapsed, 10)
        for msg in self.drain_iopub(kc):
            text = str(msg["content"])
            self.assertNotIn("Traceback", text)
            self.assertNotIn("KeyboardInterrupt", text)
        self.assertTrue(km.is_alive())

        msg_id = kc.execute("display 2+2")
        out = []
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            msg = kc.get_iopub_msg(timeout=30)
            if msg["parent_header"].get("msg_id") != msg_id:
                continue
            if msg["msg_type"] == "stream":
                out.append(msg["content"]["text"])
            if msg["msg_type"] == "status" and msg["content"]["execution_state"] == "idle":
                break
        self.assertIn("4", "".join(out))
        # An interrupt while idle must not break the next command.
        km.interrupt_kernel()
        time.sleep(0.5)
        self.assertEqual(self.execute(kc, "display 3", timeout=30)["status"], "ok")

    def test_message_mode(self):
        self.check_interrupt("message")

    def test_signal_mode(self):
        self.check_interrupt("signal")


if __name__ == "__main__":
    unittest.main()
