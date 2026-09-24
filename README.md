<p align="center">
  <img src="https://raw.githubusercontent.com/abhinavjnu/positron-stata/main/icon.png" width="128" height="128" alt="Positron Stata Logo" />
</p>

# Bring your Stata to Positron

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-positron--stata-purple)](https://open-vsx.org/extension/abhinavjnu/positron-stata)
[![GitHub Release](https://img.shields.io/github/v/release/abhinavjnu/positron-stata?color=green)](https://github.com/abhinavjnu/positron-stata/releases)

Use **your own licensed Stata** (17 or newer: BE, SE, MP or StataNow) inside **[Positron](https://positron.posit.co)**, the free data science IDE from Posit. Keep your do-files, ado-files and `profile.do`. Get a modern editor, a Data Explorer, a Plots pane and Quarto reports.

## Quick start

1. Install [Positron](https://positron.posit.co/download.html).
2. In Positron's Extensions view, search for **Stata** and click **Install**.
3. Open a do-file. Your Stata is found automatically. The first time, click **Set Up Automatically** to create the small Python helper Stata needs, then **Start Stata**.

![Positron Data Explorer with Stata Dataset](https://raw.githubusercontent.com/abhinavjnu/positron-stata/main/resources/positron_stata_data_explorer.png)

## What you get

| In Stata | In Positron |
|---|---|
| Results / Command window | **Console** |
| Do-file Editor | **Editor** with completion, hover docs, outline, cells (`* %%`) and sections (`**#`) |
| Variables window | **Variables** pane, plus `e()` / `r()` results and frames |
| Data Editor / `browse` | **Data Explorer** with value labels, sorting and filtering; double-click any `.dta` file |
| Graph window | **Plots** pane with history |
| Viewer / `help` | **Help** pane (`F1` on any command) |
| Break button | Console **stop** button |

`log using`, `#delimit ;`, `profile.do`, and `ssc install` packages work as usual. Quarto documents run Stata with `jupyter: positron-stata`.

## Shortcuts

| Linux / Windows | macOS | Action |
|---|---|---|
| `Ctrl+Enter` | `Cmd+Enter` | Run the current statement (multi-line aware) or selection |
| `Ctrl+Shift+D` | `Cmd+Shift+D` | Do the whole file |
| `Ctrl+Shift+Enter` | `Cmd+Shift+Enter` | Run the current cell |
| `Ctrl+Alt+S` | `Ctrl+Alt+S` | Run the current section |
| `F1` | `F1` | Help for the word at the cursor |

## Troubleshooting

Run **Stata: Diagnose Setup** from the Command Palette. It shows what was found and why anything was rejected, with a **Copy Report** button for issues.

- **Stata not found:** set `positron-stata.stataHome` to your Stata folder (e.g. `/usr/local/stata19`, `/Applications/StataNow`, `C:\Program Files\StataNow19`).
- **Own Python instead of the helper:** any 64-bit Python 3.9–3.13 with `numpy pandas pyarrow` works. Pick it with **Stata: Choose Python Interpreter…**.
- **Undo setup:** delete `~/.local/share/positron-stata` (Linux/macOS) or `%LOCALAPPDATA%\positron-stata` (Windows).

Sample do-files: [stata-positron-demo](https://github.com/abhinavjnu/stata-positron-demo). License: [MIT](LICENSE).
