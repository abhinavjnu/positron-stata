"""
Main launcher for positron_stata_kernel.
"""

from ipykernel.kernelapp import IPKernelApp
from .kernel import PositronStataKernel

if __name__ == "__main__":
    IPKernelApp.launch_instance(kernel_class=PositronStataKernel)
