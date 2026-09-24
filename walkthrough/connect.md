# Connect your Stata

This extension runs **your own licensed Stata** (17 or newer; BE, SE, MP or StataNow) inside Positron.

1. **Stata is found automatically** in the usual places:
   - Linux: `/usr/local/stata19`, `/usr/local/statanow19`, `/opt/stata*`
   - macOS: `/Applications/Stata`, `/Applications/StataNow`, `/Applications/Stata 19`
   - Windows: `C:\Program Files\Stata19`, `C:\Program Files\StataNow19`

   Installed somewhere else? Set **`positron-stata.stataHome`** to the folder, the `.app`, or the Stata executable.

2. **A small Python helper is set up for you.** Stata talks to Positron through PyStata, which needs
   Python 3.9–3.13 with `pandas`. If you don't have one, choose **Set Up Automatically** when asked
   (or run **Stata: Set Up Python Environment**). It creates a private environment and never touches
   your other Python installations.

3. **Start Stata** from the interpreter picker at the top right of the Console, or with the button above.

Trouble? Run **Stata: Diagnose Setup** — it writes a report to the *Stata* output channel you can copy.
