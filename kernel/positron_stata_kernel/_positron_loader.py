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
                os.path.join(base, "lib", "ipykernel", "py3"),
                os.path.join(base, "lib", "python"),
            ]:
                if os.path.exists(sub) and sub not in sys.path:
                    sys.path.insert(0, sub)
            return

ensure_positron_imported()
