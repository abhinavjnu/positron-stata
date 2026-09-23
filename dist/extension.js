"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode3 = __toESM(require("vscode"));
var positron2 = __toESM(require("positron"));
var fs3 = __toESM(require("fs"));
var os2 = __toESM(require("os"));
var path4 = __toESM(require("path"));

// src/runtimeManager.ts
var vscode = __toESM(require("vscode"));
var positron = __toESM(require("positron"));
var fs = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// src/discovery.ts
var path = __toESM(require("path"));
var EDITIONS = ["mp", "se", "be"];
function parseEdition(value) {
  const v = value?.toLowerCase();
  return v && EDITIONS.includes(v) ? v : void 0;
}
function describeInstallation(homeDir, exePath, editionHint) {
  const exeLower = path.basename(exePath).toLowerCase();
  let edition = "be";
  if (editionHint) {
    edition = editionHint;
  } else if (exeLower.includes("mp")) {
    edition = "mp";
  } else if (exeLower.includes("se")) {
    edition = "se";
  }
  const editionStr = edition === "mp" ? "MP (Parallel Edition)" : edition.toUpperCase();
  let version = "19";
  const match = homeDir.match(/stata(?:now)?\s*(\d+)/i) || exePath.match(/stata(?:now)?\s*(\d+)/i);
  if (match) {
    version = match[1];
  }
  const isStataNow = /statanow/i.test(homeDir) || /statanow/i.test(exePath);
  const prefix = isStataNow ? `StataNow ${version}` : `Stata ${version}`;
  return {
    homeDir,
    executable: exePath,
    version,
    edition,
    displayName: `${prefix} ${editionStr}`,
    shortName: `${version} ${edition.toUpperCase()}`,
    source: `System (${homeDir})`
  };
}
var WINDOWS_BINARIES = [
  ["StataMP-64.exe", "mp"],
  ["StataSE-64.exe", "se"],
  ["StataBE-64.exe", "be"],
  ["Stata-64.exe", "be"],
  ["StataMP.exe", "mp"],
  ["StataSE.exe", "se"],
  ["StataBE.exe", "be"],
  ["Stata.exe", "be"]
];
var MAC_APPS = [
  ["StataMP.app", "mp"],
  ["StataSE.app", "se"],
  ["StataBE.app", "be"],
  ["Stata.app", "be"]
];
function findStataInstallations(opts) {
  const { env: env2, exists } = opts;
  const installations = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (homeDir, exePath, editionHint) => {
    const key = `${homeDir}:${exePath}`;
    if (seen.has(key)) return;
    seen.add(key);
    installations.push(describeInstallation(homeDir, exePath, editionHint));
  };
  if (opts.configHome && exists(opts.configHome)) {
    const candidates = [
      "stata-mp",
      "stata-se",
      "stata",
      ...WINDOWS_BINARIES.map(([b]) => b),
      "StataMP.app/Contents/MacOS/stata-mp",
      "StataSE.app/Contents/MacOS/stata-se",
      "StataBE.app/Contents/MacOS/stata-be",
      "Stata.app/Contents/MacOS/stata"
    ];
    const found = candidates.map((b) => path.join(opts.configHome, b)).find(exists);
    add(opts.configHome, found || opts.configHome, opts.configEdition);
  }
  const linuxDirs = [
    "/usr/local/stata20",
    "/usr/local/stata19",
    "/usr/local/stata18",
    "/usr/local/stata17",
    "/usr/local/stata",
    "/opt/stata20",
    "/opt/stata19",
    "/opt/stata18",
    "/opt/stata17",
    "/opt/stata"
  ];
  for (const dir of linuxDirs) {
    if (!exists(dir)) continue;
    const bin = ["stata-mp", "stata-se", "stata"].map((b) => path.join(dir, b)).find(exists);
    if (bin) add(dir, bin);
  }
  const macBaseDirs = [
    "/Applications/StataNow 20",
    "/Applications/StataNow20",
    "/Applications/Stata 20",
    "/Applications/Stata20",
    "/Applications/StataNow 19",
    "/Applications/StataNow19",
    "/Applications/StataNow",
    "/Applications/Stata 19",
    "/Applications/Stata19",
    "/Applications/Stata 18",
    "/Applications/Stata18",
    "/Applications/Stata 17",
    "/Applications/Stata17",
    "/Applications/Stata"
  ];
  for (const base of macBaseDirs) {
    if (!exists(base)) continue;
    for (const [app, ed] of MAC_APPS) {
      const cliPath = path.join(base, app, "Contents", "MacOS", `stata-${ed}`);
      const guiPath = path.join(base, app, "Contents", "MacOS", app.replace(".app", ""));
      const bin = [cliPath, guiPath].find(exists);
      if (bin) {
        add(base, bin, ed);
        break;
      }
    }
  }
  const programFiles = [
    env2["ProgramFiles"],
    env2["ProgramFiles(x86)"],
    "C:\\Program Files",
    "C:\\Program Files (x86)"
  ].filter((p) => !!p);
  const winDirs = ["StataNow20", "Stata20", "StataNow19", "Stata19", "StataNow18", "Stata18", "Stata17", "Stata"];
  for (const pf of programFiles) {
    for (const wd of winDirs) {
      const dir = path.join(pf, wd);
      if (!exists(dir)) continue;
      const hit = WINDOWS_BINARIES.find(([b]) => exists(path.join(dir, b)));
      if (hit) add(dir, path.join(dir, hit[0]), hit[1]);
    }
  }
  const envPath = env2["PATH"] || env2["Path"] || "";
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    for (const b of ["stata-mp", "stata-se", "stata"]) {
      const full = path.join(dir, b);
      if (exists(full)) {
        add(path.dirname(dir), full);
      }
    }
  }
  return installations;
}
function isWindowsAppsDir(dir) {
  return /[\\/]Microsoft[\\/]WindowsApps[\\/]?$/i.test(dir);
}
function newestPythonDirs(entries, pattern) {
  const version = (name) => {
    const m = name.match(/(\d+)\.?(\d+)?/);
    if (!m) return 0;
    let major = 3;
    let minor = 0;
    if (m[2] !== void 0) {
      major = Number(m[1]);
      minor = Number(m[2]);
    } else if (m[1].startsWith("3") && m[1].length > 1) {
      major = 3;
      minor = Number(m[1].slice(1));
    } else {
      minor = Number(m[1]);
    }
    return major === 3 && minor >= 14 ? -1 : major * 1e3 + minor;
  };
  return entries.filter((e) => pattern.test(e)).sort((a, b) => version(b) - version(a));
}
function resolvePythonExecutable(opts) {
  const { platform, env: env2, exists, listDir } = opts;
  const win = platform === "win32";
  const p = win ? path.win32 : path.posix;
  if (opts.configured && exists(opts.configured)) {
    return opts.configured;
  }
  const userHome = env2.HOME || env2.USERPROFILE || "";
  if (userHome) {
    const dedicatedVenv = win ? p.join(userHome, ".local", "share", "positron-stata", "venv", "Scripts", "python.exe") : p.join(userHome, ".local", "share", "positron-stata", "venv", "bin", "python");
    if (exists(dedicatedVenv)) return dedicatedVenv;
  }
  const envRoots = [
    [env2.VIRTUAL_ENV, win ? ["Scripts", "python.exe"] : ["bin", "python3"]],
    [env2.CONDA_PREFIX, win ? ["python.exe"] : ["bin", "python3"]]
  ];
  for (const [root, rel] of envRoots) {
    if (!root) continue;
    const candidate = p.join(root, ...rel);
    if (exists(candidate)) return candidate;
  }
  const pathDirs = (env2.PATH || env2.Path || "").split(win ? ";" : ":").filter(Boolean);
  const names = win ? ["python.exe", "python3.exe"] : ["python3.13", "python3.12", "python3.11", "python3.10", "python3.9", "python3", "python"];
  for (const name of names) {
    for (const dir of pathDirs) {
      if (win && isWindowsAppsDir(dir)) continue;
      const candidate = p.join(dir, name);
      if (exists(candidate)) return candidate;
    }
  }
  if (win) {
    const localAppData = env2.LOCALAPPDATA;
    if (localAppData) {
      const base = p.join(localAppData, "Programs", "Python");
      for (const dir of newestPythonDirs(safeList(listDir, base), /^Python3\d+$/i)) {
        const candidate = p.join(base, dir, "python.exe");
        if (exists(candidate)) return candidate;
      }
      const storeBase = p.join(localAppData, "Microsoft", "WindowsApps");
      for (const dir of newestPythonDirs(safeList(listDir, storeBase), /^PythonSoftwareFoundation\.Python\.3\./i)) {
        const candidate = p.join(storeBase, dir, "python.exe");
        if (exists(candidate)) return candidate;
      }
    }
    return "python";
  }
  for (const candidate of [
    "/opt/homebrew/bin/python3.13",
    "/opt/homebrew/bin/python3.12",
    "/opt/homebrew/bin/python3.11",
    "/opt/homebrew/bin/python3.10",
    "/opt/homebrew/bin/python3.9",
    "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.10/bin/python3",
    "/usr/local/bin/python3.13",
    "/usr/local/bin/python3.12",
    "/usr/local/bin/python3.11",
    "/usr/local/bin/python3.10",
    "/usr/bin/python3",
    "/home/linuxbrew/.linuxbrew/bin/python3",
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3"
  ]) {
    if (exists(candidate)) return candidate;
  }
  return "python3";
}
function safeList(listDir, dir) {
  try {
    return listDir(dir);
  } catch {
    return [];
  }
}

// src/runtimeManager.ts
function getPythonExecutable() {
  return resolvePythonExecutable({
    platform: process.platform,
    env: process.env,
    exists: fs.existsSync,
    listDir: fs.readdirSync,
    configured: vscode.workspace.getConfiguration("positron-stata").get("pythonPath")
  });
}
function findStataInstallations2() {
  const config = vscode.workspace.getConfiguration("positron-stata");
  return findStataInstallations({
    env: process.env,
    exists: fs.existsSync,
    configHome: config.get("stataHome"),
    configEdition: parseEdition(config.get("stataEdition"))
  });
}
async function workspaceHasStataFiles() {
  if (!vscode.workspace.workspaceFolders?.length) {
    return false;
  }
  const matches = await vscode.workspace.findFiles(
    "**/*.{do,ado,dta,DO,ADO,DTA}",
    "**/{node_modules,.git}/**",
    1
  );
  return matches.length > 0;
}
function getPositronPythonFilesPath() {
  if (vscode.env.appRoot) {
    const candidate = path2.join(vscode.env.appRoot, "extensions", "positron-python", "python_files", "posit");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const fallbacks = [
    "/usr/share/positron/resources/app/extensions/positron-python/python_files/posit",
    "/Applications/Positron.app/Contents/Resources/app/extensions/positron-python/python_files/posit",
    path2.join(process.env["LOCALAPPDATA"] || "", "Programs", "Positron", "resources", "app", "extensions", "positron-python", "python_files", "posit")
  ];
  for (const fb of fallbacks) {
    if (fb && fs.existsSync(fb)) {
      return fb;
    }
  }
  return void 0;
}
var StataRuntimeManager = class {
  constructor(context) {
    this.context = context;
    this.onDidDiscoverRuntime = this._discoverEmitter.event;
    this.onDidCompleteDiscovery = this._completeEmitter.event;
  }
  context;
  _discoveredRuntimes = /* @__PURE__ */ new Map();
  onDidDiscoverRuntime;
  _discoverEmitter = new vscode.EventEmitter();
  onDidCompleteDiscovery;
  _completeEmitter = new vscode.EventEmitter();
  _discoveryComplete = false;
  _discoveredRuntimeCount = 0;
  alwaysRediscover = true;
  get isDiscoveryComplete() {
    return this._discoveryComplete;
  }
  get discoveredRuntimeCount() {
    return this._discoveredRuntimeCount;
  }
  buildRuntimeMetadata(inst, startupBehavior = positron.LanguageRuntimeStartupBehavior.Implicit) {
    const pythonBin = getPythonExecutable();
    const kernelPythonPath = path2.join(this.context.extensionPath, "kernel");
    const positronPythonFiles = getPositronPythonFilesPath();
    const runtimeId = `stata-${inst.version}-${inst.edition}-official`;
    const existingPythonPath = process.env.PYTHONPATH;
    const pythonPath = existingPythonPath ? `${kernelPythonPath}${path2.delimiter}${existingPythonPath}` : kernelPythonPath;
    const currentPath = process.env.PATH || "";
    const pathWithStata = currentPath.includes(inst.homeDir) ? currentPath : `${inst.homeDir}${path2.delimiter}${currentPath}`;
    const envVars = {
      PYTHONPATH: pythonPath,
      PATH: pathWithStata,
      POSITRON_STATA_ENGINE: "stata",
      STATA_HOME: inst.homeDir,
      STATA_EDITION: inst.edition,
      STATA_VERSION: inst.version
    };
    if (positronPythonFiles) {
      envVars["POSITRON_PYTHON_FILES"] = positronPythonFiles;
    }
    if (process.platform === "linux") {
      const currentLd = process.env.LD_LIBRARY_PATH || "";
      if (!currentLd.includes(inst.homeDir)) {
        envVars["LD_LIBRARY_PATH"] = currentLd ? `${inst.homeDir}:${currentLd}` : inst.homeDir;
      }
    }
    const launcherScript = path2.join(this.context.extensionPath, "kernel", "launcher.py");
    return {
      runtimeId,
      runtimeName: inst.displayName,
      runtimeShortName: inst.shortName,
      runtimeVersion: `${inst.version}.0`,
      runtimeSource: inst.source,
      languageName: "Stata",
      languageId: "stata",
      languageVersion: inst.version,
      runtimePath: inst.executable,
      base64EncodedIconSvg: void 0,
      startupBehavior,
      sessionLocation: positron.LanguageRuntimeSessionLocation.Workspace,
      cacheable: false,
      extraRuntimeData: {
        engine: "stata",
        kernelSpec: {
          argv: [
            pythonBin,
            launcherScript,
            "-f",
            "{connection_file}"
          ],
          display_name: inst.displayName,
          language: "stata",
          interrupt_mode: "signal",
          kernel_protocol_version: "5.3",
          env: envVars
        }
      }
    };
  }
  async *discoverAllRuntimes() {
    try {
      for (const inst of findStataInstallations2()) {
        const metadata = this.buildRuntimeMetadata(inst);
        this._discoveredRuntimes.set(metadata.runtimeId, metadata);
        this._discoveredRuntimeCount++;
        this._discoverEmitter.fire(metadata);
        yield metadata;
      }
    } finally {
      this._discoveryComplete = true;
      this._completeEmitter.fire();
    }
  }
  // `Immediate` starts a session as soon as Positron sees the runtime, so it is
  // reserved for workspaces that actually contain Stata files.
  async recommendedWorkspaceRuntime() {
    if (!await workspaceHasStataFiles()) {
      return void 0;
    }
    const [preferred] = findStataInstallations2();
    return preferred ? this.buildRuntimeMetadata(preferred, positron.LanguageRuntimeStartupBehavior.Immediate) : void 0;
  }
  async validateSession(sessionId) {
    try {
      const supervisorExt = vscode.extensions.getExtension("positron.positron-supervisor");
      if (supervisorExt && supervisorExt.isActive) {
        const supervisorApi = supervisorExt.exports;
        if (supervisorApi && typeof supervisorApi.validateSession === "function") {
          return await supervisorApi.validateSession(sessionId);
        }
      }
    } catch {
    }
    return true;
  }
  async restoreSession(runtimeMetadata, sessionMetadata, sessionName) {
    const supervisorExt = vscode.extensions.getExtension("positron.positron-supervisor");
    if (!supervisorExt) {
      throw new Error("positron-supervisor extension is required to restore Stata sessions.");
    }
    if (!supervisorExt.isActive) {
      await supervisorExt.activate();
    }
    const supervisorApi = supervisorExt.exports;
    if (supervisorApi && typeof supervisorApi.restoreSession === "function") {
      return await supervisorApi.restoreSession(
        runtimeMetadata,
        sessionMetadata,
        initialDynState(sessionName || runtimeMetadata.runtimeName)
      );
    }
    return await this.createSession(runtimeMetadata, sessionMetadata);
  }
  async createSession(runtimeMetadata, sessionMetadata) {
    const supervisorExt = vscode.extensions.getExtension("positron.positron-supervisor");
    if (!supervisorExt) {
      throw new Error("positron-supervisor extension is required to launch Stata sessions.");
    }
    if (!supervisorExt.isActive) {
      await supervisorExt.activate();
    }
    const supervisorApi = supervisorExt.exports;
    if (!supervisorApi || typeof supervisorApi.createSession !== "function") {
      throw new Error("Supervisor API createSession method not found.");
    }
    const extraData = runtimeMetadata.extraRuntimeData || {};
    const kernelSpec = extraData.kernelSpec;
    if (!kernelSpec) {
      throw new Error(`No kernelSpec configured for runtime: ${runtimeMetadata.runtimeName}`);
    }
    return await supervisorApi.createSession(
      runtimeMetadata,
      sessionMetadata,
      kernelSpec,
      initialDynState(runtimeMetadata.runtimeName)
    );
  }
};
function initialDynState(sessionName) {
  return {
    sessionName: sessionName || "Stata",
    inputPrompt: ". ",
    continuationPrompt: "> "
  };
}

// src/dtaEditorProvider.ts
var vscode2 = __toESM(require("vscode"));
var path3 = __toESM(require("path"));
var fs2 = __toESM(require("fs"));
var os = __toESM(require("os"));
var crypto = __toESM(require("crypto"));
var import_child_process = require("child_process");
function convertDtaToParquet(filePath, cachedParquetPath) {
  const pythonBin = getPythonExecutable();
  const pythonScript = `
import sys

src = sys.argv[1]
dst = sys.argv[2]

try:
    import pandas as pd
    df = pd.read_stata(src)
    df.to_parquet(dst, index=False)
except Exception as e_pandas:
    try:
        import pyreadstat
        df, _ = pyreadstat.read_dta(src)
        df.to_parquet(dst, index=False)
    except Exception as e_readstat:
        sys.stderr.write(
            f"pandas error: {e_pandas}\\npyreadstat error: {e_readstat}\\n"
            "Viewing .dta files needs pandas and pyarrow in the configured Python "
            "(pip install pandas pyarrow).\\n"
        )
        sys.exit(1)
`;
  return new Promise((resolve, reject) => {
    (0, import_child_process.execFile)(pythonBin, ["-c", pythonScript, filePath, cachedParquetPath], (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve();
      }
    });
  });
}
async function openDtaInNativeDataExplorer(dtaUri, _context) {
  const filePath = dtaUri.fsPath;
  const fileName = path3.basename(filePath);
  const hash = crypto.createHash("md5").update(filePath).digest("hex").substring(0, 8);
  const datasetDir = path3.join(os.tmpdir(), "positron-stata-cache", hash);
  if (!fs2.existsSync(datasetDir)) {
    fs2.mkdirSync(datasetDir, { recursive: true });
  }
  const baseName = path3.parse(filePath).name;
  const cachedParquetPath = path3.join(datasetDir, `${baseName}.parquet`);
  let needsConvert = true;
  if (fs2.existsSync(cachedParquetPath)) {
    try {
      const dtaStat = fs2.statSync(filePath);
      const parquetStat = fs2.statSync(cachedParquetPath);
      if (parquetStat.size > 0 && parquetStat.mtimeMs >= dtaStat.mtimeMs) {
        needsConvert = false;
      }
    } catch {
      needsConvert = true;
    }
  }
  if (needsConvert) {
    try {
      await convertDtaToParquet(filePath, cachedParquetPath);
    } catch (err) {
      if (fs2.existsSync(cachedParquetPath)) {
        try {
          fs2.unlinkSync(cachedParquetPath);
        } catch {
        }
      }
      throw new Error(`Failed to convert .dta file for Data Explorer: ${err.message}`);
    }
  }
  const parquetUri = vscode2.Uri.file(cachedParquetPath);
  try {
    await vscode2.commands.executeCommand(
      "vscode.openWith",
      parquetUri,
      "workbench.editor.positronDataExplorer"
    );
  } catch {
    await vscode2.commands.executeCommand("vscode.open", parquetUri);
  }
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var DtaCustomEditorProvider = class _DtaCustomEditorProvider {
  constructor(context) {
    this.context = context;
  }
  context;
  static viewType = "positron-stata.dtaViewer";
  static register(context) {
    const provider = new _DtaCustomEditorProvider(context);
    return vscode2.window.registerCustomEditorProvider(
      _DtaCustomEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: false },
        supportsMultipleEditorsPerDocument: false
      }
    );
  }
  async openCustomDocument(uri) {
    return { uri, dispose: () => {
    } };
  }
  async resolveCustomEditor(document, webviewPanel, _token) {
    const fileName = escapeHtml(path3.basename(document.uri.fsPath));
    webviewPanel.webview.html = `<!DOCTYPE html>
<html>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui,-apple-system,sans-serif;color:#888;background:#1e1e1e;">
    <div style="text-align:center;">
        <div style="font-size:24px;margin-bottom:8px;">\u{1F4CA}</div>
        <div>Opening <strong>${fileName}</strong> in Positron Data Explorer...</div>
    </div>
</body>
</html>`;
    try {
      await openDtaInNativeDataExplorer(document.uri, this.context);
      setTimeout(() => {
        try {
          webviewPanel.dispose();
        } catch {
        }
      }, 300);
    } catch (err) {
      webviewPanel.webview.html = `<!DOCTYPE html>
<html>
<body style="padding:24px;font-family:sans-serif;color:#f87171;background:#1e1e1e;">
    <h3>Failed to open ${fileName} in Data Explorer</h3>
    <pre>${escapeHtml(String(err?.message ?? err))}</pre>
</body>
</html>`;
    }
  }
};

// src/extension.ts
var runtimeManager;
function activate(context) {
  console.log("Activating Positron Stata Extension...");
  runtimeManager = new StataRuntimeManager(context);
  const runtimeRegistration = positron2.runtime.registerLanguageRuntimeManager("stata", runtimeManager);
  context.subscriptions.push(runtimeRegistration);
  (async () => {
    try {
      for await (const runtime2 of runtimeManager.discoverAllRuntimes()) {
        console.log(`Discovered Stata runtime: ${runtime2.runtimeName} (${runtime2.runtimeId})`);
      }
    } catch (err) {
      console.error("Error during initial Stata runtime discovery:", err);
    }
  })();
  const dtaEditorRegistration = DtaCustomEditorProvider.register(context);
  context.subscriptions.push(dtaEditorRegistration);
  context.subscriptions.push(
    vscode3.commands.registerCommand("stata.runLineOrSelection", async () => {
      await vscode3.commands.executeCommand("workbench.action.positronConsole.executeCode");
    })
  );
  context.subscriptions.push(
    vscode3.commands.registerCommand("stata.doFile", async () => {
      const editor = vscode3.window.activeTextEditor;
      if (!editor) {
        vscode3.window.showWarningMessage("No active Stata do-file open.");
        return;
      }
      let filePath;
      if (editor.document.isUntitled) {
        const tempDir = path4.join(os2.tmpdir(), "positron-stata");
        if (!fs3.existsSync(tempDir)) {
          fs3.mkdirSync(tempDir, { recursive: true });
        }
        const tempFile = path4.join(tempDir, `untitled_${Date.now()}.do`);
        fs3.writeFileSync(tempFile, editor.document.getText(), "utf8");
        filePath = tempFile.replace(/\\/g, "/");
      } else {
        if (editor.document.isDirty && !await editor.document.save()) {
          vscode3.window.showWarningMessage("Save the do-file before running it.");
          return;
        }
        filePath = editor.document.uri.fsPath.replace(/\\/g, "/");
      }
      const doCmd = `do \`"${filePath}"'
`;
      await positron2.runtime.executeCode("stata", doCmd, true, true);
    })
  );
  context.subscriptions.push(
    vscode3.commands.registerCommand("stata.openDataExplorer", async () => {
      await positron2.runtime.executeCode("stata", "browse\n", false, true);
    })
  );
  context.subscriptions.push(
    vscode3.commands.registerCommand("stata.openDtaInDataExplorer", async (uri) => {
      const targetUri = uri || vscode3.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        vscode3.window.showWarningMessage("No .dta file selected.");
        return;
      }
      await openDtaInNativeDataExplorer(targetUri, context);
    })
  );
  console.log("Positron Stata Extension successfully activated.");
}
function deactivate() {
  runtimeManager = void 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
