# Open a do-file

Open any `.do` file, or click **Open Sample Do-File** to get one that uses `sysuse auto`.

Do-files can be split into blocks:

```stata
**# A section heading (Stata 18+ bookmarks) — shows in the Outline
* %% A code cell — gets a "Run Cell" link
sysuse auto, clear
summarize price mpg
```

You also get completion for commands, variables and macros, hover help, folding, and an outline of
sections and programs.
