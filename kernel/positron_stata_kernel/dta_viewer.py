"""
DTA Viewer helper for Positron.
Reads .dta files (Stata 114–119) with variable labels and value labels
and surfaces them for Positron Data Explorer.
"""

import os
import pandas as pd
from typing import Dict, Any, Tuple

def load_dta_file(file_path: str) -> Tuple[pd.DataFrame, Dict[str, str], Dict[str, Any]]:
    """
    Loads a .dta file into a pandas DataFrame and extracts variable labels and metadata.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    # Read using pandas with metadata iterator
    with pd.read_stata(file_path, iterator=True) as reader:
        var_labels = reader.variable_labels()
        df = reader.read()

    meta = {
        "filename": os.path.basename(file_path),
        "filepath": file_path,
        "obs": len(df),
        "vars": len(df.columns),
        "var_labels": var_labels
    }
    return df, var_labels, meta
