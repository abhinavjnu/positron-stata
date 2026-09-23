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

// src/runtimeManager.ts
var vscode = __toESM(require("vscode"));
var positron = __toESM(require("positron"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
function getPythonExecutable() {
  const configPython = vscode.workspace.getConfiguration("positron-stata").get("pythonPath");
  if (configPython && fs.existsSync(configPython)) {
    return configPython;
  }
  const candidates = [
    "/home/linuxbrew/.linuxbrew/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
    "/usr/bin/python3",
    "python3"
  ];
  for (const p of candidates) {
    if (p === "python3" || fs.existsSync(p)) {
      return p;
    }
  }
  return "python3";
}
function getPositronPythonFilesPath() {
  if (vscode.env.appRoot) {
    const candidate = path.join(vscode.env.appRoot, "extensions", "positron-python", "python_files", "posit");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const fallbacks = [
    "/usr/share/positron/resources/app/extensions/positron-python/python_files/posit",
    "/Applications/Positron.app/Contents/Resources/app/extensions/positron-python/python_files/posit",
    path.join(process.env["LOCALAPPDATA"] || "", "Programs", "Positron", "resources", "app", "extensions", "positron-python", "python_files", "posit")
  ];
  for (const fb of fallbacks) {
    if (fb && fs.existsSync(fb)) {
      return fb;
    }
  }
  return void 0;
}
function findStataInstallations() {
  const installations = [];
  const seen = /* @__PURE__ */ new Set();
  const addInstallation = (homeDir, exePath, versionHint, editionHint) => {
    const key = `${homeDir}:${exePath}`;
    if (seen.has(key)) return;
    seen.add(key);
    const exeLower = path.basename(exePath).toLowerCase();
    let edition = editionHint || "be";
    if (exeLower.includes("mp")) {
      edition = "mp";
    } else if (exeLower.includes("se")) {
      edition = "se";
    }
    let editionStr = "BE";
    if (edition === "mp") editionStr = "MP (Parallel Edition)";
    else if (edition === "se") editionStr = "SE";
    let version = versionHint || "19";
    const match = homeDir.match(/stata(?:now)?\s*(\d+)/i) || exePath.match(/stata(?:now)?\s*(\d+)/i);
    if (match) {
      version = match[1];
    }
    const isStataNow = homeDir.toLowerCase().includes("statanow") || exePath.toLowerCase().includes("statanow");
    const prefix = isStataNow ? `StataNow ${version}` : `Stata ${version}`;
    installations.push({
      homeDir,
      executable: exePath,
      version,
      edition,
      displayName: `${prefix} ${editionStr}`,
      shortName: `${version} ${edition.toUpperCase()}`,
      source: `System (${homeDir})`
    });
  };
  const configHome = vscode.workspace.getConfiguration("positron-stata").get("stataHome");
  const configEdition = vscode.workspace.getConfiguration("positron-stata").get("stataEdition");
  if (configHome && fs.existsSync(configHome)) {
    const candidateBins = [
      "stata-mp",
      "stata-se",
      "stata",
      "StataMP-64.exe",
      "StataSE-64.exe",
      "Stata-64.exe",
      "StataMP.app/Contents/MacOS/stata-mp",
      "StataSE.app/Contents/MacOS/stata-se",
      "Stata.app/Contents/MacOS/stata"
    ];
    let foundBin;
    for (const b of candidateBins) {
      const full = path.join(configHome, b);
      if (fs.existsSync(full)) {
        foundBin = full;
        break;
      }
    }
    addInstallation(configHome, foundBin || configHome, void 0, configEdition);
  }
  const linuxDirs = [
    "/usr/local/stata19",
    "/usr/local/stata18",
    "/usr/local/stata17",
    "/usr/local/stata",
    "/opt/stata19",
    "/opt/stata18",
    "/opt/stata17",
    "/opt/stata"
  ];
  for (const dir of linuxDirs) {
    if (!fs.existsSync(dir)) continue;
    const bins = ["stata-mp", "stata-se", "stata"];
    for (const b of bins) {
      const p = path.join(dir, b);
      if (fs.existsSync(p)) {
        addInstallation(dir, p);
        break;
      }
    }
  }
  const macBaseDirs = [
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
    if (!fs.existsSync(base)) continue;
    const appEditions = [
      ["StataMP.app", "mp"],
      ["StataSE.app", "se"],
      ["Stata.app", "be"]
    ];
    for (const [app, ed] of appEditions) {
      const cliPath = path.join(base, app, "Contents", "MacOS", `stata-${ed}`);
      const guiPath = path.join(base, app, "Contents", "MacOS", app.replace(".app", ""));
      if (fs.existsSync(cliPath)) {
        addInstallation(base, cliPath, void 0, ed);
        break;
      } else if (fs.existsSync(guiPath)) {
        addInstallation(base, guiPath, void 0, ed);
        break;
      }
    }
  }
  const progFiles = [
    process.env["ProgramFiles"],
    process.env["ProgramFiles(x86)"],
    "C:\\Program Files",
    "C:\\Program Files (x86)"
  ].filter(Boolean);
  for (const pf of progFiles) {
    const winDirs = ["StataNow19", "Stata19", "Stata18", "Stata17", "Stata"];
    for (const wd of winDirs) {
      const dir = path.join(pf, wd);
      if (!fs.existsSync(dir)) continue;
      const bins = [
        ["StataMP-64.exe", "mp"],
        ["StataSE-64.exe", "se"],
        ["Stata-64.exe", "be"],
        ["StataMP.exe", "mp"],
        ["StataSE.exe", "se"],
        ["Stata.exe", "be"]
      ];
      for (const [b, ed] of bins) {
        const full = path.join(dir, b);
        if (fs.existsSync(full)) {
          addInstallation(dir, full, void 0, ed);
          break;
        }
      }
    }
  }
  const envPath = process.env["PATH"] || "";
  const pathBins = ["stata-mp", "stata-se", "stata"];
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    for (const b of pathBins) {
      const full = path.join(dir, b);
      if (fs.existsSync(full)) {
        const homeDir = path.dirname(dir);
        addInstallation(homeDir, full);
      }
    }
  }
  return installations;
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
  async *discoverAllRuntimes() {
    try {
      const pythonBin = getPythonExecutable();
      const kernelPythonPath = path.join(this.context.extensionPath, "kernel");
      const positronPythonFiles = getPositronPythonFilesPath();
      const stataInstalls = findStataInstallations();
      for (const inst of stataInstalls) {
        const runtimeId = `stata-${inst.version}-${inst.edition}-official`;
        const envVars = {
          PYTHONPATH: kernelPythonPath,
          POSITRON_STATA_ENGINE: "stata",
          STATA_HOME: inst.homeDir,
          STATA_EDITION: inst.edition,
          STATA_VERSION: inst.version
        };
        if (positronPythonFiles) {
          envVars["POSITRON_PYTHON_FILES"] = positronPythonFiles;
        }
        const metadata = {
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
          startupBehavior: positron.LanguageRuntimeStartupBehavior.StartOnDemand,
          sessionLocation: positron.LanguageRuntimeSessionLocation.Local,
          extraRuntimeData: {
            engine: "stata",
            kernelSpec: {
              argv: [
                pythonBin,
                "-m",
                "positron_stata_kernel",
                "-f",
                "{connection_file}"
              ],
              display_name: inst.displayName,
              language: "stata",
              interrupt_mode: "message",
              kernel_protocol_version: "5.3",
              env: envVars
            }
          }
        };
        this._discoveredRuntimes.set(metadata.runtimeId, metadata);
        this._discoveredRuntimeCount++;
      }
    } finally {
      this._discoveryComplete = true;
      this._completeEmitter.fire();
    }
  }
  async recommendedWorkspaceRuntime() {
    for (const [id, meta] of this._discoveredRuntimes.entries()) {
      if (id.startsWith("stata-")) {
        return meta;
      }
    }
    return void 0;
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
    const sessionName = sessionMetadata.sessionName || runtimeMetadata.runtimeName || "Stata";
    const dynState = {
      sessionName,
      inputPrompt: ". ",
      continuationPrompt: "> "
    };
    return await supervisorApi.createSession(
      runtimeMetadata,
      sessionMetadata,
      kernelSpec,
      dynState
    );
  }
};

// src/dtaEditorProvider.ts
var vscode2 = __toESM(require("vscode"));
var path2 = __toESM(require("path"));
var fs2 = __toESM(require("fs"));
var os = __toESM(require("os"));
var crypto = __toESM(require("crypto"));
var import_child_process = require("child_process");
function getPythonExecutable2() {
  const configPython = vscode2.workspace.getConfiguration("positron-stata").get("pythonPath");
  if (configPython && fs2.existsSync(configPython)) {
    return configPython;
  }
  const candidates = [
    "/home/linuxbrew/.linuxbrew/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
    "/usr/bin/python3",
    "python3"
  ];
  for (const p of candidates) {
    if (p === "python3" || fs2.existsSync(p)) {
      return p;
    }
  }
  return "python3";
}
function convertDtaToParquet(filePath, cachedParquetPath) {
  const pythonBin = getPythonExecutable2();
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
        sys.stderr.write(f"Pandas error: {e_pandas}\\npyreadstat error: {e_readstat}\\n")
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
  const fileName = path2.basename(filePath);
  const hash = crypto.createHash("md5").update(filePath).digest("hex").substring(0, 8);
  const datasetDir = path2.join(os.tmpdir(), "positron-stata-cache", hash);
  if (!fs2.existsSync(datasetDir)) {
    fs2.mkdirSync(datasetDir, { recursive: true });
  }
  const baseName = path2.parse(filePath).name;
  const cachedParquetPath = path2.join(datasetDir, `${baseName}.parquet`);
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
    const fileName = path2.basename(document.uri.fsPath);
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
    <pre>${err.message}</pre>
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
      if (editor.document.isDirty) {
        await editor.document.save();
      }
      const filePath = editor.document.uri.fsPath.replace(/\\/g, "/");
      const doCmd = `do "${filePath}"
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
