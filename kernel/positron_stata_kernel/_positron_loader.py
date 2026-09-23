"""
_positron_loader.py: Dynamically locates and inserts Positron's internal Python modules (posit)
into sys.path across Linux, macOS, and Windows.
"""
import os
import sys

def ensure_positron_imported():
    # 1. Environment variable passed from extension
    env_path = os.environ.get("POSITRON_PYTHON_FILES")
    if env_path and os.path.exists(env_path) and env_path not in sys.path:
        sys.path.insert(0, env_path)
        return

    # 2. Probe candidate platform locations
    candidates = [
        # Linux
        "/usr/share/positron/resources/app/extensions/positron-python/python_files/posit",
        "/usr/lib/positron/resources/app/extensions/positron-python/python_files/posit",
        # macOS
        "/Applications/Positron.app/Contents/Resources/app/extensions/positron-python/python_files/posit",
        # Windows
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Positron\resources\app\extensions\positron-python\python_files\posit"),
        os.path.expandvars(r"%PROGRAMFILES%\Positron\resources\app\extensions\positron-python\python_files\posit"),
    ]
    for c in candidates:
        if c and os.path.exists(c) and c not in sys.path:
            sys.path.insert(0, c)
            return

ensure_positron_imported()
