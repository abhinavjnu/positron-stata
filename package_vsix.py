#!/usr/bin/env python3
"""
package_vsix.py: Standard Open VSIX packager for positron-stata.
Creates an installable .vsix package containing the extension,
bundled Python kernel, and language definitions.
"""

import os
import sys
import json
import zipfile
from xml.sax.saxutils import escape, quoteattr

def build_vsix():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    pkg_path = os.path.join(base_dir, "package.json")
    with open(pkg_path, "r", encoding="utf-8") as f:
        pkg = json.load(f)

    name = pkg.get("name", "positron-stata")
    version = pkg.get("version", "0.1.0")
    publisher = pkg.get("publisher", "abhinav")
    display_name = escape(pkg.get("displayName", "Stata Support for Positron"))
    description = escape(pkg.get("description", ""))
    categories = escape(",".join(pkg.get("categories", ["Programming Languages"])))
    keywords = escape(",".join(pkg.get("keywords", ["stata", "positron"])))
    engine = quoteattr(pkg.get("engines", {}).get("vscode", "^1.90.0"))
    ext_deps = pkg.get("extensionDependencies", [])
    dependencies_prop = f'\n      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value={quoteattr(",".join(ext_deps))}/>' if ext_deps else ""

    vsix_filename = f"{name}-{version}.vsix"
    vsix_path = os.path.join(base_dir, vsix_filename)

    # 1. Content Types XML
    content_types_xml = """<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".md" ContentType="text/markdown"/>
  <Default Extension=".png" ContentType="image/png"/>
  <Default Extension=".py" ContentType="text/x-python"/>
  <Default Extension=".svg" ContentType="image/svg+xml"/>
  <Default Extension=".txt" ContentType="text/plain"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>
"""

    # 2. VSIX Manifest XML
    vsix_manifest_xml = f"""<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="{name}" Version="{version}" Publisher="{publisher}"/>
    <DisplayName>{display_name}</DisplayName>
    <Description xml:space="preserve">{description}</Description>
    <Tags>{keywords}</Tags>
    <Categories>{categories}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Icon>extension/icon.png</Icon>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value={engine}/>{dependencies_prop}
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/>
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png" Addressable="true"/>
  </Assets>
</PackageManifest>
"""

    # Build extension first
    import subprocess
    print("Running esbuild...")
    subprocess.run(["node", os.path.join(base_dir, "esbuild.js")], check=True)

    files_to_include = [
        "package.json",
        "README.md",
        "LICENSE",
        "icon.png",
        "language-configuration.json",
        "dist/extension.js",
        "syntaxes/stata.tmLanguage.json",
    ]

    # Include kernel directory recursively
    kernel_dir = os.path.join(base_dir, "kernel")
    for root, dirs, files in os.walk(kernel_dir):
        # Exclude pycache
        if "__pycache__" in root:
            continue
        for file in files:
            if file.endswith((".py", ".json")):
                rel = os.path.relpath(os.path.join(root, file), base_dir)
                files_to_include.append(rel)

    print(f"Packaging {len(files_to_include)} files into {vsix_filename}...")
    with zipfile.ZipFile(vsix_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add manifests
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("extension.vsixmanifest", vsix_manifest_xml)

        for rel_path in files_to_include:
            full_path = os.path.join(base_dir, rel_path)
            if os.path.exists(full_path):
                arc_name = f"extension/{rel_path}"
                zf.write(full_path, arc_name)
                print(f"  + {arc_name}")
            else:
                print(f"  ! Warning: missing {rel_path}")

    size_kb = os.path.getsize(vsix_path) / 1024
    print(f"\nSUCCESS: Created {vsix_filename} ({size_kb:.1f} KB)")
    print(f"Install command: positron --install-extension {vsix_path}")

if __name__ == "__main__":
    build_vsix()
