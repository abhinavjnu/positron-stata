<p align="center">
  <img src="https://raw.githubusercontent.com/abhinavjnu/positron-stata/main/icon.png" width="128" height="128" alt="Positron Stata Logo" />
</p>

# Stata Support for Positron IDE

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-positron--stata-purple)](https://open-vsx.org/extension/abhinavjnu/positron-stata)
[![GitHub Release](https://img.shields.io/github/v/release/abhinavjnu/positron-stata?color=green)](https://github.com/abhinavjnu/positron-stata/releases)

First-class Stata development environment for **[Positron IDE](https://github.com/posit-dev/positron)**. Connects directly to your local licensed Stata installation (Stata 17, 18, or 19; MP, SE, or BE) to provide interactive execution, live variable inspection, vector graphics rendering, and dataset exploration.

> [!NOTE]
> This extension is designed specifically for Positron IDE and uses Positron's native runtime, variables, and data explorer APIs.

---

## 📸 Experience Positron IDE with Stata

Positron IDE brings modern data science ergonomics to Stata users. Stata acts as the high-performance analytical engine, while Positron delivers first-class interactive exploration tools:

### Interactive Data Explorer & Column Profiling
Inspect datasets in Positron's spreadsheet viewer with in-column summary distribution histograms, data type profiling, sorting, and search. Double-click `.dta` files or type `browse` in your script.

![Positron Data Explorer with Stata Dataset](https://raw.githubusercontent.com/abhinavjnu/positron-stata/main/resources/positron_stata_data_explorer.png)

### Vector Plots & Live Variables Pane
Stata graphs (`scatter`, `twoway`, `histogram`, `marginsplot`, etc.) automatically render into Positron's interactive **Plots** pane with zoom and history. In-memory data is continuously tracked in the **Variables** pane with storage types and value labels.

![Positron Visualizations & Plots Pane](https://raw.githubusercontent.com/abhinavjnu/positron-stata/main/resources/positron_stata_visualizations.png)

---

## 🧪 Public Demo Workspace

Explore full working examples, sample do-files, and famous public datasets (`nlsw88.dta`, `census.dta`, `penguins.dta`) in the **[Stata Positron Demo Repository](https://github.com/abhinavjnu/stata-positron-demo)**.

---

## ✨ Features

- **Native Stata Runtime**: Direct, in-process execution via PyStata and SFI. Supports Stata 17, 18, and 19 (MP, SE, BE).
- **Auto-Discovery**: Automatically locates your Stata installation and Python environment on **Linux**, **macOS**, and **Windows**.
- **Interactive Variables Pane**: Real-time view of variables, storage types, display formats, value labels, and variable labels.
- **Native Data Explorer**: Interactive spreadsheet grid with column profiling histograms, search, sorting, and filtering. Opens automatically with `browse` or by clicking a dataset.
- **Plots Pane**: High-resolution vector graphs (`scatter`, `twoway`, `histogram`, `marginsplot`, etc.) rendered directly in Positron's **Plots** tab.
- **Standalone `.dta` Dataset Viewer**: Double-click any `.dta` file in Positron's File Explorer to view it instantly without loading it into memory.
- **Error Propagation**: Stata syntax and runtime errors surface directly in the console and halt multi-statement executions appropriately.

---

## ⌨️ Shortcuts

| Shortcut (Linux / Windows) | Shortcut (macOS) | Action |
|---|---|---|
| `Ctrl+Enter` | `Cmd+Enter` | Execute selected lines or current line |
| `Ctrl+Shift+D` | `Cmd+Shift+D` | Run the entire `.do` file |

---

## 📋 Prerequisites

1. **[Positron IDE](https://github.com/posit-dev/positron/releases)** (v2024.06.0 or newer).
2. **Stata**: Licensed installation of Stata 17, 18, or 19 (MP, SE, or BE).
3. **Python**: 64-bit Python 3.9+ with the required bridge packages:

   ```bash
   python -m pip install ipykernel pandas pyarrow
   ```

---

## 📦 Installation

### From Open VSX Registry (Recommended)
1. Open Positron IDE.
2. Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3. Search for `positron-stata` and click **Install**.

### From `.vsix` Package
Download the latest `positron-stata-0.1.3.vsix` from [Releases](https://github.com/abhinavjnu/positron-stata/releases) and run:

```bash
positron --install-extension positron-stata-0.1.3.vsix
```

Or open Positron, press `Ctrl+Shift+P` (`Cmd+Shift+P`), and run **Extensions: Install from VSIX...**.

---

## ⚙️ Configuration Settings

Open Positron Settings (`Ctrl+,` or `Cmd+,`) and navigate to **Extensions → Stata**:

| Setting | Type | Default | Description |
|---|---|---|---|
| `positron-stata.stataHome` | `string` | `""` | Path to Stata installation directory. Auto-discovered if left blank. |
| `positron-stata.stataEdition` | `string` | `"auto"` | Stata edition (`auto`, `mp`, `se`, `be`). Defaults to MP > SE > BE. |
| `positron-stata.pythonPath` | `string` | `""` | Path to Python interpreter. Auto-detected from active environment if blank. |

### Default Discovery Paths

- **Linux**: `/usr/local/stata19`, `/usr/local/stata18`, `/usr/local/stata17`, `/opt/stata*`
- **macOS**: `/Applications/StataNow 19`, `/Applications/Stata 19`, `/Applications/Stata 18`, `/Applications/Stata*`
- **Windows**: `C:\Program Files\StataNow19`, `C:\Program Files\Stata19`, `C:\Program Files\Stata18`, `C:\Program Files\Stata*`

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
