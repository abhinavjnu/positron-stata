"""
_positron_loader.py: Dynamically locates and inserts Positron's internal Python modules (posit)
into sys.path across Linux, macOS, and Windows.
"""
import os
import sys

def ensure_positron_imported():
    # 1. Environment variable passed from extension
    env_path = os.environ.get("POSITRON_PYTHON_FILES")
    base_dirs = []
    if env_path and os.path.exists(env_path):
        base_dirs.append(os.path.dirname(env_path) if os.path.basename(env_path) == "posit" else env_path)

    # 2. Probe candidate platform locations
    base_dirs.extend([
        # Linux
        "/usr/share/positron/resources/app/extensions/positron-python/python_files",
        "/usr/lib/positron/resources/app/extensions/positron-python/python_files",
        # macOS
        "/Applications/Positron.app/Contents/Resources/app/extensions/positron-python/python_files",
        # Windows
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Positron\resources\app\extensions\positron-python\python_files"),
        os.path.expandvars(r"%PROGRAMFILES%\Positron\resources\app\extensions\positron-python\python_files"),
    ])

    for base in base_dirs:
        if base and os.path.exists(base):
            for sub in [
                os.path.join(base, "posit"),
                os.path.join(base, "lib", "python"),
                os.path.join(base, "lib", "ipykernel", "py3"),
            ]:
                if os.path.exists(sub) and sub not in sys.path:
                    sys.path.insert(0, sub)

            # Native compiled ipykernel dependencies (zmq, tornado, psutil)
            ipykernel_dir = os.path.join(base, "lib", "ipykernel")
            if os.path.isdir(ipykernel_dir):
                py_ver = f"cp{sys.version_info.major}{sys.version_info.minor}"
                try:
                    for entry in os.listdir(ipykernel_dir):
                        arch_dir = os.path.join(ipykernel_dir, entry)
                        if os.path.isdir(arch_dir) and entry != "py3":
                            for cp_dir in (py_ver, "cp3"):
                                full_cp = os.path.join(arch_dir, cp_dir)
                                if os.path.exists(full_cp) and full_cp not in sys.path:
                                    sys.path.insert(0, full_cp)
                except OSError:
                    pass
            return


ensure_positron_imported()
