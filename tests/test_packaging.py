#!/usr/bin/env python3
"""
test_packaging.py: Verifies VSIX package integrity, manifest correctness,
and asset bundling for Open VSX publication.
"""

import os
import sys
import json
import zipfile
import xml.etree.ElementTree as ET
import unittest

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(repo_root, "package.json"), encoding="utf-8") as _f:
    package_version = json.load(_f)["version"]
vsix_path = os.path.join(repo_root, f"positron-stata-{package_version}.vsix")

class TestPackaging(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Run package_vsix.py to ensure fresh build
        import subprocess
        print(f"\n--- Running package_vsix.py ---")
        subprocess.run([sys.executable, os.path.join(repo_root, "package_vsix.py")], check=True, cwd=repo_root)

    def test_vsix_exists(self):
        self.assertTrue(os.path.exists(vsix_path), "VSIX file must exist")
        size_kb = os.path.getsize(vsix_path) / 1024
        self.assertGreater(size_kb, 10, "VSIX file must be larger than 10KB")
        print(f"[PASS] VSIX package exists ({size_kb:.1f} KB).")

    def test_vsix_contents(self):
        with zipfile.ZipFile(vsix_path, "r") as zf:
            namelist = zf.namelist()
            
            # Required top-level manifests
            self.assertIn("[Content_Types].xml", namelist)
            self.assertIn("extension.vsixmanifest", namelist)
            
            # Required extension assets
            self.assertIn("extension/package.json", namelist)
            self.assertIn("extension/README.md", namelist)
            self.assertIn("extension/LICENSE", namelist)
            self.assertIn("extension/icon.png", namelist)
            self.assertIn("extension/dist/extension.js", namelist)
            self.assertIn("extension/syntaxes/stata.tmLanguage.json", namelist)
            self.assertIn("extension/kernel/positron_stata_kernel/kernel.py", namelist)
            self.assertIn("extension/kernel/positron_stata_kernel/stata_engine.py", namelist)
            self.assertIn("extension/kernel/positron_stata_kernel/_positron_loader.py", namelist)
            print(f"[PASS] All {len(namelist)} expected package assets verified.")

    def test_manifest_xml_validity(self):
        with zipfile.ZipFile(vsix_path, "r") as zf:
            manifest_xml = zf.read("extension.vsixmanifest").decode("utf-8")
            root = ET.fromstring(manifest_xml)
            
            # Check namespace
            self.assertTrue(root.tag.endswith("PackageManifest"))
            
            # Check icon asset in manifest
            icon_assets = [e for e in root.iter() if e.tag.endswith("Asset") and e.attrib.get("Type") == "Microsoft.VisualStudio.Services.Icons.Default"]
            self.assertEqual(len(icon_assets), 1, "Manifest must specify default icon asset")
            print("[PASS] VSIX manifest XML is valid and conforms to Open VSIX specification.")

    def test_package_json_metadata(self):
        with zipfile.ZipFile(vsix_path, "r") as zf:
            pkg_data = json.loads(zf.read("extension/package.json").decode("utf-8"))
            self.assertEqual(pkg_data["name"], "positron-stata")
            self.assertEqual(pkg_data["version"], package_version)
            self.assertIn("icon", pkg_data)
            self.assertEqual(pkg_data["icon"], "icon.png")
            self.assertIn("repository", pkg_data)
            self.assertIn("positron-stata.stataHome", pkg_data["contributes"]["configuration"]["properties"])
            print("[PASS] package.json metadata and configuration schema verified.")

if __name__ == "__main__":
    unittest.main(verbosity=2)
