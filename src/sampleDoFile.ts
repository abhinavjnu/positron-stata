/** Sample do-file opened by "Stata: Open Sample Do-File" and the getting-started walkthrough. */
export const SAMPLE_DO_FILE = `**# Welcome to Stata in Positron
* Ctrl+Enter (Cmd+Enter on macOS) runs the statement under the cursor, then moves on.
* Ctrl+Shift+D (Cmd+Shift+D) runs the whole file, like "do" in Stata.
* "Run Cell" / "Run Section" links appear above * %% cells and **# sections.
* Put the cursor on a command and press F1 to open its help in the Help pane.

**## Load and describe data
* %% Load the auto dataset
sysuse auto, clear
describe
summarize price mpg weight

* %% Look at the data
* Opens the Data Explorer (value labels are shown, like Stata's browse).
browse

**## Model
* %% Regression
regress price mpg weight i.foreign
* e() results now appear in the Variables pane.
display "R-squared: " %5.3f e(r2)

**## Graphs
* %% Scatter plot (shows up in the Plots pane)
twoway (scatter price mpg) (lfit price mpg), ///
    title("Price vs. mileage")
`;
