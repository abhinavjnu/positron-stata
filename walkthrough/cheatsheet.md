# Stata ↔ Positron cheat sheet

| In Stata | In Positron |
|---|---|
| Results window | **Console** |
| Command window | **Console** input line |
| Do-file Editor | **Editor** (`.do` files) |
| Review window | **History** (and the Console's up arrow) |
| Variables window | **Variables** pane |
| Properties window | **Variables** pane (expand a variable) |
| Data Editor / `browse` | **Data Explorer** |
| Graph window | **Plots** pane |
| Viewer / `help` | **Help** pane (`F1`) |
| `cd` / `pwd` | Same commands; the working directory is shown in the Console header |
| Break button | Console **stop** button |
| `do myfile.do` | `Ctrl+Shift+D` (`Cmd+Shift+D`) |

Things that work just like in Stata:

- `log using …`, `capture`, `quietly`, `preserve`/`restore`, frames, `#delimit ;`
- `profile.do` runs when the Stata console starts (Stata's usual search, e.g. the folder you opened)
- Your ado-path, `net install` / `ssc install` packages, and your Stata license
