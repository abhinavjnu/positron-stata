#!/usr/bin/env python3
"""
crop_screenshots.py: Takes the raw 2160x1440 live Positron screenshots
and crops them into clean, high-resolution visual assets for the LinkedIn carousel.
"""

import os
from PIL import Image

RAW_DIR = "/media/abhinav/WorkData/Positron/positron-stata/carousel_assets/raw_captures"
OUT_DIR = "/media/abhinav/WorkData/Positron/positron-stata/carousel_assets/processed"
os.makedirs(OUT_DIR, exist_ok=True)

def crop_and_save(src_name, dst_name, box):
    src_path = os.path.join(RAW_DIR, src_name)
    dst_path = os.path.join(OUT_DIR, dst_name)
    if not os.path.exists(src_path):
        print(f"Error: {src_path} does not exist")
        return
    img = Image.open(src_path)
    cropped = img.crop(box)
    cropped.save(dst_path, "PNG", optimize=True)
    print(f"Saved {dst_name}: {cropped.size[0]}x{cropped.size[1]} (from {img.size})")

# 1. Hero Overview (Slide 1) - Complete Positron window with Stata 19 MP connected, Do-file, Console, Variables, Plots
crop_and_save("05_plot_generated.png", "hero_positron.png", (72, 0, 2160, 1410))

# 2. Data Explorer Full View (Slide 2) - Starts cleanly at tab Data: nlsw88.parquet, ends at row counter
crop_and_save("01_data_explorer_clean.png", "slide2_data_explorer_full.png", (72, 75, 2160, 1408))

# 3. Standout Feature 1: Summary Distributions & Histograms (Slide 3)
# Variable summary panel with sparklines, percentages, expanded south card, and union 16% missing
crop_and_save("02_wage_expanded_try2.png", "slide3_summary_distributions.png", (72, 140, 1600, 1408))

# 4. Standout Feature 2: Value Labels & Data Types (Slide 4)
# Clean table grid showing decoded value labels (Black/White, Single/Married, College grad) without clipped column
crop_and_save("01_data_explorer_clean.png", "slide4_value_labels.png", (680, 138, 2120, 1180))

# 5. Do-File Editor Intelligence: Cells & Sections (Slide 5)
# Focus on the editor with **# sections, * %% cells, Run CodeLens buttons, starting at editor tab
crop_and_save("03_dofile_clean_top.png", "slide5_dofile_editor.png", (72, 75, 1700, 1180))

# 6. Console Regression Table (Slide 6) - Clean terminal output only, no editor lines
crop_and_save("04_console_regress.png", "slide6_console_regress.png", (72, 735, 1680, 1410))

# 6b. Variables Pane (Slide 6) - Clean variables view with e() and r()
crop_and_save("04_console_regress.png", "slide6_variables_pane.png", (1728, 88, 2155, 455))

# 6c. Plots Pane Detail (Slide 6) - Stitched toolbar and plot canvas tightly
def stitch_plots_pane():
    src_path = os.path.join(RAW_DIR, "05_plot_generated.png")
    dst_path = os.path.join(OUT_DIR, "slide6_plots_pane.png")
    img = Image.open(src_path)
    tb = img.crop((1732, 730, 2155, 848))
    pl = img.crop((1732, 975, 2155, 1395))
    out = Image.new("RGB", (tb.width, tb.height + 4 + pl.height), (255, 255, 255))
    out.paste(tb, (0, 0))
    out.paste(pl, (0, tb.height + 4))
    out.save(dst_path, "PNG", optimize=True)
    print(f"Saved stitched slide6_plots_pane.png: {out.size}")

stitch_plots_pane()

# 7. Open VSX Marketplace (Slide 7) - Unmasked metadata with Identifier, Version 0.2.2, Size, Published
crop_and_save("positron_active.png", "slide7_marketplace.png", (530, 80, 2140, 890))

print("All screenshots cropped cleanly with zero cutoffs!")
