<p align="center">
  <img src="https://raw.githubusercontent.com/abhinavjnu/positron-stata/main/icon.png" width="128" height="128" alt="Positron Stata Logo" />
</p>

# Bring your Stata to Positron

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-positron--stata-purple)](https://open-vsx.org/extension/abhinavjnu/positron-stata)
[![GitHub Release](https://img.shields.io/github/v/release/abhinavjnu/positron-stata?color=green)](https://github.com/abhinavjnu/positron-stata/releases)

Use **your own licensed Stata** (17 or newer — BE, SE, MP or StataNow) inside **[Positron](https://positron.posit.co)**, the free data science IDE from Posit. Keep your do-files, ado-files, `profile.do` and license. Get a modern editor, a spreadsheet-style Data Explorer, a Plots pane with history, and Quarto reports, all connected to the same Stata you already have.

> [!NOTE]
> This extension needs Positron; it uses Positron's console, Variables, Data Explorer, Plots and Help panes. It does not work in plain VS Code.

---

## 🚀 Quick start

1. **Install [Positron](https://positron.posit.co/download.html).**
2. **Install this extension**: in Positron open Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`), search for **Stata**, and click **Install**.
3. **Open a do-file.** Your Stata is found automatically. The first time, Positron offers to **Set Up Automatically** a small private Python helper that Stata uses to talk to Positron. Say yes, wait a minute, and click **Start Stata**.

A **Get Started with Stata in Positron** walkthrough opens the first time and shows the basics. You can reopen it any time with **Stata: Get Started with Stata in Positron**.

---

## 📸 What it looks like

### Data Explorer
Type `browse` (or double-click a `.dta` file) for a spreadsheet view with sorting, filtering, search and column summaries. Value labels are shown instead of codes, as in Stata's browse.

![Positron Data Explorer with Stata Dataset](https://raw.githubusercontent.com/abhinavjnu/positron-stata/main/resources/positron_stata_data_explorer.png)

### Plots and Variables
Graphs (`scatter`, `twoway`, `histogram`, `marginsplot`, …) appear in the **Plots** pane with history. The **Variables** pane lists the data in memory plus your `e()`/`r()` results and frames.

![Positron Visualizations & Plots Pane](https://raw.githubusercontent.com/abhinavjnu/positron-stata/main/resources/positron_stata_visualizations.png)

---

## ✨ Features

**Running Stata**
- Stata runs in-process through StataCorp's PyStata. Output looks the same as Stata's Results window.
- **Run the statement at the cursor** with `Ctrl+Enter`. Multi-line commands (`///`, `{ … }` blocks, `program … end`, `#delimit ;`) are sent as one statement.
- **Do the whole file** with `Ctrl+Shift+D`, or run cells (`* %%`) and sections (`**#`) with the **Run Cell / Run Section** links. You can also run from the top to the cursor, or from the cursor to the end.
- **Break** a long-running command with the Console's stop button.
- Errors stop multi-command runs, just like `do`.

**Seeing your data and results**
- **Variables pane**: variables with storage types, formats, variable and value labels. Also shows the latest `e()` and `r()` scalars, macros and matrices, and all frames.
- **Data Explorer**: `browse` opens the current dataset, and double-clicking a `.dta` file opens it without loading it into Stata. Value labels can be turned on or off.
- **Plots pane**: every Stata graph, with history.
- **Help pane**: press `F1` on any command, function or option, or type `help regress`.

**Editing do-files**
- Syntax highlighting, completion for commands (with abbreviations), functions, variables and macros, and hover documentation.
- An outline of sections, cells and programs, plus folding.

**Reports**
- **Quarto & Jupyter**: the extension keeps a `positron-stata` Jupyter kernel registered, so Quarto documents with `jupyter: positron-stata` and `{stata}` code chunks render with your Stata.

**Setup that explains itself**
- Finds Stata 17–21 and StataNow on Linux, macOS and Windows, and reads the version from the installation itself.
- Checks Python before starting, so a missing helper shows a clear message with a fix button rather than a kernel crash.
- **Stata: Diagnose Setup** writes a copyable report of everything it checked.

---

## 🔁 Stata → Positron

| In Stata | In Positron |
|---|---|
| Results window | **Console** |
| Command window | Console input line |
| Do-file Editor | **Editor** |
| Review window | **History** / Console up-arrow |
| Variables & Properties windows | **Variables** pane |
| Data Editor / `browse` | **Data Explorer** |
| Graph window | **Plots** pane |
| Viewer / `help` | **Help** pane (`F1`) |
| `cd` / `pwd` | Same commands; the working directory is shown in the Console header |
| Break button | Console **stop** button |

`log using`, `profile.do` (run at startup via Stata's usual search, for example in the folder you open), your ado-path, and `ssc install` / `net install` packages all work as usual.

---

## ⌨️ Shortcuts

| Linux / Windows | macOS | Action |
|---|---|---|
| `Ctrl+Enter` | `Cmd+Enter` | Run the current statement or selection |
| `Ctrl+Shift+D` | `Cmd+Shift+D` | Do the whole file |
| `Ctrl+Shift+Enter` | `Cmd+Shift+Enter` | Run the current cell |
| `Shift+Enter` | `Shift+Enter` | Run cell and advance (files with `* %%` cells) |
| `Ctrl+Alt+S` | `Ctrl+Alt+S` | Run the current section |
| `F1` | `F1` | Help for the word at the cursor |

## 🧰 Commands

| Command | What it does |
|---|---|
| **Stata: Set Up Python Environment** | Creates the private Python helper (Python 3.12 + numpy, pandas, pyarrow, pyreadstat) |
| **Stata: Diagnose Setup** | Writes a report on Stata, Python, Positron and the Jupyter kernel to the *Stata* output channel |
| **Stata: Choose Python Interpreter…** | Use a Python of your own instead |
| **Stata: Open Sample Do-File** | Opens a short tour do-file based on `sysuse auto` |
| **Stata: Get Started with Stata in Positron** | Opens the walkthrough |
| **Stata: Do File** | Runs the current file (`Ctrl+Shift+D`) |
| **Stata: Open Current Dataset in Data Explorer** | Same as `browse` |
| **Stata: Run Current Cell / Section / Cells Above / To Cursor / From Cursor** | Run parts of a do-file |

## ⚙️ Settings

| Setting | Default | Description |
|---|---|---|
| `positron-stata.stataHome` | `""` | Stata folder, a macOS `.app` bundle, or the Stata executable. Auto-discovered if blank. |
| `positron-stata.stataEdition` | `"auto"` | `auto`, `mp`, `se` or `be`. |
| `positron-stata.pythonPath` | `""` | Python used to host Stata (3.9–3.13, 64-bit, with numpy + pandas). Auto-selected if blank. |
| `positron-stata.dataExplorer.showValueLabels` | `true` | Show value labels instead of codes in the Data Explorer. |
| `positron-stata.jupyterKernelspec.enabled` | `true` | Keep the `positron-stata` Jupyter kernel registered for Quarto/Jupyter. |
| `positron-stata.codeLens.enabled` | `true` | Show Run Cell / Run Section links. |

---

## 🩺 Troubleshooting

Start with **Stata: Diagnose Setup** (`Ctrl+Shift+P` → "Stata: Diagnose"). It lists the Stata installations it found and the Python interpreters it tried, with the reason each one was rejected. It also checks the Positron components the kernel uses and the Jupyter kernel status. Click **Copy Report** to paste it into an issue.

- **"Stata needs a small Python helper"**: click **Set Up Automatically**. It uses [uv](https://docs.astral.sh/uv/) if you have it, or an existing Python 3.9–3.13. Otherwise it asks before downloading uv and a standalone Python. Everything goes into one folder: `~/.local/share/positron-stata` on Linux/macOS, `%LOCALAPPDATA%\positron-stata` on Windows. Delete that folder to undo.
- **Stata not found**: set `positron-stata.stataHome` to your Stata folder, e.g. `/usr/local/stata19`, `/Applications/StataNow` (or `…/StataMP.app`), or `C:\Program Files\StataNow19`.
- **"PyStata was not found"**: Positron needs Stata 17 or newer. PyStata ships in `<Stata folder>/utilities`.
- **Python 3.14**: PyStata doesn't support it yet. The extension skips it automatically. Run setup to get a 3.12 helper.

### Advanced: use your own Python

Any 64-bit Python 3.9–3.13 with numpy and pandas works (pyarrow is needed for the `.dta` viewer, pyreadstat is optional):

```bash
python -m pip install numpy pandas pyarrow pyreadstat
```

Then run **Stata: Choose Python Interpreter…** or set `positron-stata.pythonPath`. You don't need ipykernel: the kernel uses the one bundled with Positron.

### Quarto

```yaml
---
title: "My analysis"
jupyter: positron-stata
---
```

Use `{stata}` code chunks. Rendering from the command line needs Quarto's own Python with `jupyter` installed (`quarto check jupyter`). The Stata helper environment is used automatically for the kernel.

---

## 📦 Other installation options

Download a `.vsix` from [Releases](https://github.com/abhinavjnu/positron-stata/releases) and run `positron --install-extension positron-stata-<version>.vsix`, or use **Extensions: Install from VSIX…**.

## 🧪 Demo workspace

Sample do-files and datasets: **[Stata Positron Demo Repository](https://github.com/abhinavjnu/stata-positron-demo)**.

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
