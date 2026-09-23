"""
launcher.py: Standalone launcher for Positron Stata Kernel.
Guarantees the extension's kernel package is on sys.path even if the supervisor
environment does not preserve PYTHONPATH.
"""
import os
import sys

kernel_dir = os.path.dirname(os.path.abspath(__file__))
if kernel_dir not in sys.path:
    sys.path.insert(0, kernel_dir)

from positron_stata_kernel.kernel import PositronStataKernel
from ipykernel.kernelapp import IPKernelApp

if __name__ == "__main__":
    IPKernelApp.launch_instance(kernel_class=PositronStataKernel)
