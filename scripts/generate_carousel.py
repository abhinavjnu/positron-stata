#!/usr/bin/env python3
"""
generate_carousel.py: Generates a high-resolution 7-slide LinkedIn carousel
for positron-stata using freshly captured live Positron UI screenshots.

Aesthetic upgrades:
  - Palette: Deep Obsidian (#080c14) + Ambient Positron Cyan (#0ea5e9) & Stata Cobalt (#6366f1)
  - Typography: Plus Jakarta Sans (Headings/Body) + JetBrains Mono (Code/Metadata)
  - Micro-badges: Precision Lucide SVG vector icons in frosted neon pill containers (Zero emojis)
  - Layout: Fully unmasked metadata, expanded distributions, and complete regression output.

Outputs:
  - carousel_assets/linkedin_carousel.html
  - carousel_assets/positron-stata-linkedin-carousel.pdf (1080x1350 4:5 portrait PDF)
  - carousel_assets/slide-1.png ... slide-7.png (High-DPI slide images)
"""

import os
import sys
import base64
import subprocess
import shutil

BASE_DIR = "/media/abhinav/WorkData/Positron/positron-stata"
ARTIFACT_DIR = "/home/abhinav/.gemini/antigravity/brain/6a94fdc5-b04c-4f7a-925d-7fcf457b193f"
PROC_DIR = os.path.join(BASE_DIR, "carousel_assets/processed")
OUT_DIR = os.path.join(BASE_DIR, "carousel_assets")
os.makedirs(OUT_DIR, exist_ok=True)

def b64_img(path):
    if not os.path.exists(path):
        print(f"Warning: Missing image {path}")
        return ""
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    ext = os.path.splitext(path)[1].lstrip(".").lower()
    if ext == "svg":
        return f"data:image/svg+xml;base64,{data}"
    return f"data:image/png;base64,{data}"

# Load fresh processed assets
img_icon = b64_img(os.path.join(BASE_DIR, "icon.png"))
img_hero = b64_img(os.path.join(PROC_DIR, "hero_positron.png"))
img_explorer = b64_img(os.path.join(PROC_DIR, "slide2_data_explorer_full.png"))
img_dist = b64_img(os.path.join(PROC_DIR, "slide3_summary_distributions.png"))
img_labels = b64_img(os.path.join(PROC_DIR, "slide4_value_labels.png"))
img_dofile = b64_img(os.path.join(PROC_DIR, "slide5_dofile_editor.png"))
img_regress = b64_img(os.path.join(PROC_DIR, "slide6_console_regress.png"))
img_vars = b64_img(os.path.join(PROC_DIR, "slide6_variables_pane.png"))
img_plots = b64_img(os.path.join(PROC_DIR, "slide6_plots_pane.png"))
img_market = b64_img(os.path.join(PROC_DIR, "slide7_marketplace.png"))

# Lucide SVG Icon Snippets (Clean, Professional, Vector)
SVG_DATABASE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>'
SVG_ZAP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>'
SVG_SORT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4"></path><path d="M17 20V4"></path><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path></svg>'
SVG_BARCHART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path></svg>'
SVG_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
SVG_SPARKLES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>'
SVG_TAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>'
SVG_FILTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>'
SVG_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>'
SVG_PLAY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>'
SVG_LISTTREE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12h-8"></path><path d="M21 6H8"></path><path d="M21 18h-8"></path><path d="M3 6v4c0 1.1.9 2 2 2h3"></path><path d="M3 10v6c0 1.1.9 2 2 2h3"></path></svg>'
SVG_BRAIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z"></path></svg>'
SVG_CPU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><path d="M9 1v3"></path><path d="M15 1v3"></path><path d="M9 20v3"></path><path d="M15 20v3"></path><path d="M20 9h3"></path><path d="M20 14h3"></path><path d="M1 9h3"></path><path d="M1 14h3"></path></svg>'
SVG_LAYERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>'
SVG_LINECHART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path></svg>'
SVG_GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>'
SVG_GITHUB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>'
SVG_AWARD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>'

html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

  * {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }}

  body {{
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #080c14;
    color: #f8fafc;
    -webkit-font-smoothing: antialiased;
    margin: 0;
  }}

  @page {{
    size: 1080px 1350px;
    margin: 0;
  }}

  .slide {{
    width: 1080px;
    height: 1350px;
    page-break-after: always;
    position: relative;
    overflow: hidden;
    background: 
      radial-gradient(circle at 12% 12%, rgba(14, 165, 233, 0.12) 0%, transparent 45%),
      radial-gradient(circle at 88% 88%, rgba(99, 102, 241, 0.10) 0%, transparent 45%),
      radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.04) 0%, transparent 60%),
      #080c14;
    display: flex;
    flex-direction: column;
    padding: 60px 65px 50px 65px;
  }}

  /* Blueprint Grid background */
  .slide::before {{
    content: "";
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px);
    background-size: 54px 54px;
    pointer-events: none;
    z-index: 1;
  }}

  .content-layer {{
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    height: 100%;
    justify-content: space-between;
  }}

  /* Top Bar */
  .top-bar {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 22px;
  }}

  .brand {{
    display: flex;
    align-items: center;
    gap: 14px;
  }}

  .brand img {{
    width: 42px;
    height: 42px;
    border-radius: 10px;
    box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35);
  }}

  .brand-text {{
    font-weight: 700;
    font-size: 20px;
    letter-spacing: -0.02em;
    color: #ffffff;
  }}

  .brand-text span {{
    color: #38bdf8;
  }}

  .slide-counter {{
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 6px 14px;
    border-radius: 20px;
  }}

  /* Header Section */
  .header {{
    margin-bottom: 20px;
  }}

  .badge-category {{
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.22);
    padding: 5px 12px;
    border-radius: 6px;
    margin-bottom: 10px;
  }}

  .badge-category::before {{
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 8px #38bdf8;
  }}

  .title {{
    font-size: 40px;
    font-weight: 800;
    letter-spacing: -0.035em;
    color: #ffffff;
    line-height: 1.15;
    margin-bottom: 8px;
  }}

  .subtitle {{
    font-size: 16.5px;
    font-weight: 400;
    color: #94a3b8;
    line-height: 1.45;
  }}

  /* Standard Visual Container */
  .visual-container {{
    height: 670px;
    position: relative;
    border-radius: 14px;
    overflow: hidden;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(56, 189, 248, 0.12);
    display: flex;
    flex-direction: column;
    margin-bottom: 22px;
  }}

  .window-header {{
    height: 36px;
    background: #1e293b;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    padding: 0 14px;
    gap: 8px;
    flex-shrink: 0;
  }}

  .window-dots {{
    display: flex;
    gap: 6px;
  }}

  .window-dot {{
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }}

  .dot-red {{ background: #ef4444; }}
  .dot-yellow {{ background: #f59e0b; }}
  .dot-green {{ background: #10b981; }}

  .window-title {{
    font-family: 'JetBrains Mono', monospace;
    font-size: 11.5px;
    color: #94a3b8;
    margin-left: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }}

  .kernel-indicator {{
    color: #10b981;
    font-weight: 600;
  }}

  .visual-frame {{
    flex: 1;
    overflow: hidden;
    position: relative;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
  }}

  .visual-frame img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top left;
    display: block;
  }}

  .visual-frame.contain img {{
    object-fit: contain;
    background: #ffffff;
    padding: 0;
  }}

  /* Feature Grid / Cards */
  .features-grid {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: 18px;
  }}

  .feature-card {{
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }}

  .feature-icon-badge {{
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 6px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }}

  .feature-icon-badge svg {{
    width: 18px;
    height: 18px;
  }}

  .badge-cyan {{ background: rgba(6, 182, 212, 0.12); border-color: rgba(6, 182, 212, 0.3); color: #38bdf8; }}
  .badge-emerald {{ background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.3); color: #34d399; }}
  .badge-amber {{ background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.3); color: #fbbf24; }}
  .badge-blue {{ background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.3); color: #60a5fa; }}
  .badge-indigo {{ background: rgba(99, 102, 241, 0.12); border-color: rgba(99, 102, 241, 0.3); color: #818cf8; }}
  .badge-purple {{ background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.3); color: #c084fc; }}
  .badge-rose {{ background: rgba(244, 63, 94, 0.12); border-color: rgba(244, 63, 94, 0.3); color: #fb7185; }}

  .feature-title {{
    font-size: 14px;
    font-weight: 700;
    color: #f8fafc;
    letter-spacing: -0.015em;
  }}

  .feature-desc {{
    font-size: 12px;
    font-weight: 400;
    color: #94a3b8;
    line-height: 1.4;
  }}

  .feature-desc code {{
    font-family: 'JetBrains Mono', monospace;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
    padding: 1px 4px;
    border-radius: 4px;
  }}

  /* Bottom Bar */
  .bottom-bar {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }}

  .bottom-author {{
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 600;
    color: #cbd5e1;
  }}

  .author-avatar {{
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #2563eb;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 12px;
    color: #ffffff;
  }}

  .bottom-cta {{
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #38bdf8;
  }}

  .bottom-cta svg {{
    width: 15px;
    height: 15px;
    fill: currentColor;
  }}

  /* Multi-Image Layouts (Slide 6) - Stacked Layout */
  .stacked-visual-container {{
    height: 660px;
    max-height: 660px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 22px;
  }}

  .top-console-card {{
    height: 330px;
    flex-shrink: 0;
  }}

  .top-console-card .visual-frame img {{
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: left center;
    background: #ffffff;
    display: block;
  }}

  .bottom-dual-row {{
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    min-height: 0;
  }}

  .bottom-dual-row .split-card {{
    height: 100%;
  }}

  .bottom-dual-row .visual-frame img {{
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
    background: #ffffff;
    display: block;
  }}

  .split-card {{
    border-radius: 14px;
    overflow: hidden;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
  }}

  .split-card .window-header {{
    height: 34px;
    padding: 0 12px;
  }}

  .split-card .window-title {{
    font-size: 11px;
    margin-left: 6px;
  }}

  .split-card .visual-frame {{
    flex: 1;
    overflow: hidden;
    background: #ffffff;
  }}

  /* Cover Slide Layout */
  .cover-hero {{
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 15px;
    margin-bottom: 25px;
  }}

  .cover-logo-badge {{
    width: 76px;
    height: 76px;
    border-radius: 18px;
    margin-bottom: 22px;
    box-shadow: 0 10px 30px rgba(14, 165, 233, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }}

  .cover-title {{
    font-size: 52px;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.1;
    color: #ffffff;
    margin-bottom: 16px;
  }}

  .cover-title span {{
    background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }}

  .cover-subtitle {{
    font-size: 19px;
    font-weight: 400;
    color: #94a3b8;
    max-width: 780px;
    line-height: 1.5;
    margin-bottom: 24px;
  }}

  .pills-row {{
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }}

  .pill {{
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    color: #cbd5e1;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 6px 16px;
    border-radius: 20px;
  }}

  .pill-green {{
    color: #34d399;
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(16, 185, 129, 0.3);
  }}

  /* CTA Steps */
  .cta-box {{
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: 14px;
    padding: 20px 24px;
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }}

  .install-step {{
    display: flex;
    align-items: center;
    gap: 16px;
  }}

  .step-num {{
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: #38bdf8;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }}

  .step-text {{
    font-size: 15px;
    color: #e2e8f0;
  }}

  .step-text code {{
    font-family: 'JetBrains Mono', monospace;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 2px 7px;
    border-radius: 5px;
    color: #38bdf8;
    font-size: 13px;
  }}
</style>
</head>
<body>

<!-- ==========================================
     SLIDE 1: COVER SLIDE
     ========================================== -->
<div class="slide">
  <div class="content-layer">
    <div class="top-bar">
      <div class="brand">
        <img src="{img_icon}" alt="Stata for Positron">
        <div class="brand-text">Positron<span>Stata</span></div>
      </div>
      <div class="slide-counter">01 / 07</div>
    </div>

    <div class="cover-hero">
      <img src="{img_icon}" class="cover-logo-badge" alt="Logo">
      <div class="cover-title">
        Bring Your Stata to<br><span>Positron IDE</span>
      </div>
      <div class="cover-subtitle">
        First-class Stata language support, interactive data explorer, live console execution, and variables tracking inside Positron.
      </div>
      <div class="pills-row">
        <div class="pill pill-green">v0.2.2 on Open VSX</div>
        <div class="pill">Stata 17, 18, 19 MP / SE / BE</div>
        <div class="pill">Free & Open Source</div>
      </div>
    </div>

    <div class="visual-container" style="height: 610px;">
      <div class="window-header">
        <div class="window-dots">
          <div class="window-dot dot-red"></div>
          <div class="window-dot dot-yellow"></div>
          <div class="window-dot dot-green"></div>
        </div>
        <div class="window-title">
          <span>01_explore_data.do — stata-positron-demo — Positron</span>
          <span class="kernel-indicator">● Stata 19 MP (Parallel Edition)</span>
        </div>
      </div>
      <div class="visual-frame">
        <img src="{img_hero}" alt="Positron Stata Live IDE Overview">
      </div>
    </div>

    <div class="bottom-bar">
      <div class="bottom-author">
        <div class="author-avatar">A</div>
        <span>Abhinav Kumar · Open Source Extension</span>
      </div>
      <div class="bottom-cta">
        <span>Swipe to Explore</span>
        <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    </div>
  </div>
</div>

<!-- ==========================================
     SLIDE 2: DATA EXPLORER FULL VIEW
     ========================================== -->
<div class="slide">
  <div class="content-layer">
    <div class="top-bar">
      <div class="brand">
        <img src="{img_icon}" alt="Stata for Positron">
        <div class="brand-text">Positron<span>Stata</span></div>
      </div>
      <div class="slide-counter">02 / 07</div>
    </div>

    <div class="header">
      <div class="badge-category">Native Data Explorer</div>
      <div class="title">Double-Click Any .dta File</div>
      <div class="subtitle">Inspect your datasets instantly in Positron's high-speed virtualized Data Explorer.</div>
    </div>

    <div class="visual-container">
      <div class="window-header">
        <div class="window-dots">
          <div class="window-dot dot-red"></div>
          <div class="window-dot dot-yellow"></div>
          <div class="window-dot dot-green"></div>
        </div>
        <div class="window-title">
          <span>Data: nlsw88.parquet (2,246 rows, 17 columns)</span>
          <span class="kernel-indicator">● Active Stata Dataset</span>
        </div>
      </div>
      <div class="visual-frame">
        <img src="{img_explorer}" alt="Positron Data Explorer Full View">
      </div>
    </div>

    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon-badge badge-blue">{SVG_DATABASE}</div>
        <div class="feature-title">Native .dta Support</div>
        <div class="feature-desc">Double-click in file tree or run <code>browse</code> from console to open.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-amber">{SVG_ZAP}</div>
        <div class="feature-title">Arrow Columnar Speed</div>
        <div class="feature-desc">Virtualized infinite scrolling handles millions of rows effortlessly.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-cyan">{SVG_SORT}</div>
        <div class="feature-title">Sorting & Filtering</div>
        <div class="feature-desc">Search, reorder columns, and filter records with zero lag.</div>
      </div>
    </div>

    <div class="bottom-bar">
      <div class="bottom-author">
        <div class="author-avatar">A</div>
        <span>Positron Stata Data Explorer</span>
      </div>
      <div class="bottom-cta">
        <span>Next: Header Histograms</span>
        <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    </div>
  </div>
</div>

<!-- ==========================================
     SLIDE 3: STANDOUT FEATURE 1 — IN-COLUMN DISTRIBUTIONS
     ========================================== -->
<div class="slide">
  <div class="content-layer">
    <div class="top-bar">
      <div class="brand">
        <img src="{img_icon}" alt="Stata for Positron">
        <div class="brand-text">Positron<span>Stata</span></div>
      </div>
      <div class="slide-counter">03 / 07</div>
    </div>

    <div class="header">
      <div class="badge-category">Standout Feature #1</div>
      <div class="title">In-Column Distributions & Sparklines</div>
      <div class="subtitle">Understand distribution skewness, outliers, and missing rates before running any code.</div>
    </div>

    <div class="visual-container">
      <div class="window-header">
        <div class="window-dots">
          <div class="window-dot dot-red"></div>
          <div class="window-dot dot-yellow"></div>
          <div class="window-dot dot-green"></div>
        </div>
        <div class="window-title">
          <span>Variable Profiles: Sparklines, Missing Rates & Category Breakdown</span>
        </div>
      </div>
      <div class="visual-frame" style="background: #ffffff;">
        <img src="{img_dist}" alt="In-Column Sparklines and Summary Distributions" style="object-fit: contain; object-position: center; background: #ffffff;">
      </div>
    </div>

    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon-badge badge-cyan">{SVG_BARCHART}</div>
        <div class="feature-title">Inline Histograms</div>
        <div class="feature-desc">Visual distribution curve for every numeric variable right in the header.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-rose">{SVG_ALERT}</div>
        <div class="feature-title">Missing Value Alerts</div>
        <div class="feature-desc">Instant % missing tracking warns you about nulls prior to regression.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-purple">{SVG_SPARKLES}</div>
        <div class="feature-title">One-Click Summary</div>
        <div class="feature-desc">Expand any column for unique counts, mean, median, and quantiles.</div>
      </div>
    </div>

    <div class="bottom-bar">
      <div class="bottom-author">
        <div class="author-avatar">A</div>
        <span>Data Explorer Intelligence</span>
      </div>
      <div class="bottom-cta">
        <span>Next: Value Labels</span>
        <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    </div>
  </div>
</div>

<!-- ==========================================
     SLIDE 4: STANDOUT FEATURE 2 — VALUE LABELS
     ========================================== -->
<div class="slide">
  <div class="content-layer">
    <div class="top-bar">
      <div class="brand">
        <img src="{img_icon}" alt="Stata for Positron">
        <div class="brand-text">Positron<span>Stata</span></div>
      </div>
      <div class="slide-counter">04 / 07</div>
    </div>

    <div class="header">
      <div class="badge-category">Standout Feature #2</div>
      <div class="title">Automatic Value Label Decoding</div>
      <div class="subtitle">Never decode arbitrary 0s, 1s, and 2s in your head again. Seamless Stata label fidelity.</div>
    </div>

    <div class="visual-container">
      <div class="window-header">
        <div class="window-dots">
          <div class="window-dot dot-red"></div>
          <div class="window-dot dot-yellow"></div>
          <div class="window-dot dot-green"></div>
        </div>
        <div class="window-title">
          <span>Decoded Stata Categoricals: race, married, never_married, collgrad</span>
        </div>
      </div>
      <div class="visual-frame">
        <img src="{img_labels}" alt="Stata Decoded Value Labels in Table Grid">
      </div>
    </div>

    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon-badge badge-rose">{SVG_TAG}</div>
        <div class="feature-title">Human-Readable Grid</div>
        <div class="feature-desc">See "Married", "Single", "College grad" automatically decoded.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-cyan">{SVG_FILTER}</div>
        <div class="feature-title">Label-Based Filtering</div>
        <div class="feature-desc">Filter records by their label strings instead of cryptic numeric codes.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-emerald">{SVG_SHIELD}</div>
        <div class="feature-title">Full Type Fidelity</div>
        <div class="feature-desc">Maintains underlying VARCHAR and TINYINT data types intact.</div>
      </div>
    </div>

    <div class="bottom-bar">
      <div class="bottom-author">
        <div class="author-avatar">A</div>
        <span>Stata Value Label Fidelity</span>
      </div>
      <div class="bottom-cta">
        <span>Next: Do-File Editor</span>
        <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    </div>
  </div>
</div>

<!-- ==========================================
     SLIDE 5: DO-FILE EDITOR — CELLS & SECTIONS
     ========================================== -->
<div class="slide">
  <div class="content-layer">
    <div class="top-bar">
      <div class="brand">
        <img src="{img_icon}" alt="Stata for Positron">
        <div class="brand-text">Positron<span>Stata</span></div>
      </div>
      <div class="slide-counter">05 / 07</div>
    </div>

    <div class="header">
      <div class="badge-category">Do-File Editor</div>
      <div class="title">Interactive Cells & Section Headings</div>
      <div class="subtitle">Experience notebook-like ergonomics inside clean, production-grade .do scripts.</div>
    </div>

    <div class="visual-container">
      <div class="window-header">
        <div class="window-dots">
          <div class="window-dot dot-red"></div>
          <div class="window-dot dot-yellow"></div>
          <div class="window-dot dot-green"></div>
        </div>
        <div class="window-title">
          <span>01_explore_data.do — Run Section & Run Cell CodeLens</span>
        </div>
      </div>
      <div class="visual-frame">
        <img src="{img_dofile}" alt="Do-File Editor with Cells and Sections">
      </div>
    </div>

    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon-badge badge-cyan">{SVG_PLAY}</div>
        <div class="feature-title">Cells (* %%)</div>
        <div class="feature-desc">Run Cell, Run Above, and Run Next Cell CodeLens buttons inline.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-indigo">{SVG_LISTTREE}</div>
        <div class="feature-title">Sections (**#)</div>
        <div class="feature-desc">Creates a hierarchical outline view for effortless navigation.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-purple">{SVG_BRAIN}</div>
        <div class="feature-title">Smart Completion</div>
        <div class="feature-desc">Autocompletes Stata commands, functions, and dataset variables.</div>
      </div>
    </div>

    <div class="bottom-bar">
      <div class="bottom-author">
        <div class="author-avatar">A</div>
        <span>Modern Do-File Ergonomics</span>
      </div>
      <div class="bottom-cta">
        <span>Next: Console & Execution</span>
        <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    </div>
  </div>
</div>

<!-- ==========================================
     SLIDE 6: LIVE CONSOLE, VARIABLES & PLOTS
     ========================================== -->
<div class="slide">
  <div class="content-layer">
    <div class="top-bar">
      <div class="brand">
        <img src="{img_icon}" alt="Stata for Positron">
        <div class="brand-text">Positron<span>Stata</span></div>
      </div>
      <div class="slide-counter">06 / 07</div>
    </div>

    <div class="header">
      <div class="badge-category">Interactive Execution</div>
      <div class="title">Live Console, Variables & Plots</div>
      <div class="subtitle">Your licensed Stata engine running natively with live variable tracking and plot history.</div>
    </div>

    <div class="stacked-visual-container">
      <div class="split-card top-console-card">
        <div class="window-header">
          <div class="window-dots">
            <div class="window-dot dot-red"></div>
            <div class="window-dot dot-yellow"></div>
            <div class="window-dot dot-green"></div>
          </div>
          <div class="window-title">Console — Stata 19 MP Regression Table</div>
        </div>
        <div class="visual-frame">
          <img src="{img_regress}" alt="Stata Regression Output in Console">
        </div>
      </div>

      <div class="bottom-dual-row">
        <div class="split-card">
          <div class="window-header">
            <div class="window-title">Variables — e() & r() Returns</div>
          </div>
          <div class="visual-frame">
            <img src="{img_vars}" alt="Variables Pane with Return Objects">
          </div>
        </div>
        <div class="split-card">
          <div class="window-header">
            <div class="window-title">Plots — Twoway Fit & History</div>
          </div>
          <div class="visual-frame plot-frame">
            <img src="{img_plots}" alt="Plots Tab with History Navigation">
          </div>
        </div>
      </div>
    </div>

    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon-badge badge-blue">{SVG_CPU}</div>
        <div class="feature-title">Native Stata Engine</div>
        <div class="feature-desc">Full terminal output with formatted tables, regression, and logs.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-amber">{SVG_LAYERS}</div>
        <div class="feature-title">e() / r() Tracking</div>
        <div class="feature-desc">Visual inspection of estimation results and return scalars.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-indigo">{SVG_LINECHART}</div>
        <div class="feature-title">Plot History</div>
        <div class="feature-desc">Integrated Plots tab with back/forward history, zoom, and export.</div>
      </div>
    </div>

    <div class="bottom-bar">
      <div class="bottom-author">
        <div class="author-avatar">A</div>
        <span>Live Interactive Power</span>
      </div>
      <div class="bottom-cta">
        <span>Next: Get Started</span>
        <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    </div>
  </div>
</div>

<!-- ==========================================
     SLIDE 7: GET STARTED & OPEN VSX
     ========================================== -->
<div class="slide">
  <div class="content-layer">
    <div class="top-bar">
      <div class="brand">
        <img src="{img_icon}" alt="Stata for Positron">
        <div class="brand-text">Positron<span>Stata</span></div>
      </div>
      <div class="slide-counter">07 / 07</div>
    </div>

    <div class="header">
      <div class="badge-category">Available Now</div>
      <div class="title">Upgrade Your Stata Workflow</div>
      <div class="subtitle">Free, open source, and works immediately with your existing Stata license.</div>
    </div>

    <div class="visual-container" style="height: 520px;">
      <div class="window-header">
        <div class="window-dots">
          <div class="window-dot dot-red"></div>
          <div class="window-dot dot-yellow"></div>
          <div class="window-dot dot-green"></div>
        </div>
        <div class="window-title">
          <span>Extension: Stata Support for Positron (v0.2.2)</span>
          <span class="kernel-indicator">● Verified on Open VSX</span>
        </div>
      </div>
      <div class="visual-frame" style="background: #ffffff;">
        <img src="{img_market}" alt="Open VSX Extension Card" style="object-fit: contain; object-position: center; background: #ffffff;">
      </div>
    </div>

    <div class="cta-box">
      <div class="install-step">
        <div class="step-num">01</div>
        <div class="step-text">Open <strong>Positron IDE</strong> and go to Extensions Marketplace (<code>Ctrl+Shift+X</code>).</div>
      </div>
      <div class="install-step">
        <div class="step-num">02</div>
        <div class="step-text">Search for <code>Stata</code> and click <strong>Install</strong> on <code>abhinavjnu.positron-stata</code>.</div>
      </div>
      <div class="install-step">
        <div class="step-num">03</div>
        <div class="step-text">Open any <code>.do</code> or <code>.dta</code> file — your Stata is detected automatically!</div>
      </div>
    </div>

    <div class="features-grid" style="margin-bottom: 20px;">
      <div class="feature-card">
        <div class="feature-icon-badge badge-cyan">{SVG_GLOBE}</div>
        <div class="feature-title">Open VSX Registry</div>
        <div class="feature-desc"><code>open-vsx.org/extension/abhinavjnu/positron-stata</code></div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-purple">{SVG_GITHUB}</div>
        <div class="feature-title">GitHub Repository</div>
        <div class="feature-desc"><code>github.com/abhinavjnu/positron-stata</code></div>
      </div>
      <div class="feature-card">
        <div class="feature-icon-badge badge-emerald">{SVG_AWARD}</div>
        <div class="feature-title">Open Source</div>
        <div class="feature-desc">MIT Licensed · Community contributions welcome</div>
      </div>
    </div>

    <div class="bottom-bar">
      <div class="bottom-author">
        <div class="author-avatar">A</div>
        <span>Abhinav Kumar · Stata for Positron</span>
      </div>
      <div class="bottom-cta">
        <span>Star on GitHub ⭐</span>
      </div>
    </div>
  </div>
</div>

</body>
</html>
"""

html_path = os.path.join(OUT_DIR, "linkedin_carousel.html")
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Generated HTML slide deck at: {html_path}")

# Generate PDF using headless Chrome
pdf_path = os.path.join(OUT_DIR, "positron-stata-linkedin-carousel.pdf")
print("Rendering PDF via headless Chrome...")
chrome_cmd = [
    "google-chrome",
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--print-to-pdf=" + pdf_path,
    "--print-to-pdf-no-header",
    "--window-size=1080,1350",
    html_path
]
subprocess.run(chrome_cmd, check=True)
print(f"Generated multi-page PDF at: {pdf_path}")

# Export individual slide PNGs using pdftoppm
print("Exporting individual PNG slides at 150 DPI...")
pdftoppm_cmd = [
    "pdftoppm",
    "-png",
    "-r", "150",
    pdf_path,
    os.path.join(OUT_DIR, "slide")
]
subprocess.run(pdftoppm_cmd, check=True)

# Rename slide-01.png etc. to slide-1.png for clarity
for i in range(1, 8):
    padded = os.path.join(OUT_DIR, f"slide-{i:02d}.png")
    unpadded = os.path.join(OUT_DIR, f"slide-{i}.png")
    if os.path.exists(padded) and padded != unpadded:
        shutil.move(padded, unpadded)

print("Individual PNG slides generated:")
for i in range(1, 8):
    p = os.path.join(OUT_DIR, f"slide-{i}.png")
    if os.path.exists(p):
        print(f"  - slide-{i}.png: {os.path.getsize(p) // 1024} KB")

# Copy to brain artifact directory for instant viewing
for i in range(1, 8):
    src = os.path.join(OUT_DIR, f"slide-{i}.png")
    dst = os.path.join(ARTIFACT_DIR, f"slide-{i}.png")
    if os.path.exists(src):
        shutil.copyfile(src, dst)

shutil.copyfile(pdf_path, os.path.join(ARTIFACT_DIR, "positron-stata-linkedin-carousel.pdf"))
shutil.copyfile(html_path, os.path.join(ARTIFACT_DIR, "linkedin_carousel.html"))

print("Copied all carousel artifacts to brain directory.")
