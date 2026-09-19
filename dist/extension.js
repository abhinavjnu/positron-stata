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
  const candidates = [
    "/home/linuxbrew/.linuxbrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
    "python3"
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return "python3";
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
      const stata19Paths = [
        "/usr/local/stata19/stata-mp",
        "/usr/local/stata19/stata-se",
        "/usr/local/stata19/stata",
        "/usr/local/stata/stata-mp",
        "/usr/local/stata/stata"
      ];
      let foundStata19;
      for (const p of stata19Paths) {
        if (fs.existsSync(p)) {
          foundStata19 = p;
          break;
        }
      }
      if (foundStata19) {
        const isMP = foundStata19.includes("mp");
        const editionStr = isMP ? "MP (Parallel Edition)" : "SE";
        const metadata = {
          runtimeId: "stata-19-mp-official",
          runtimeName: `StataNow 19.5 ${editionStr}`,
          runtimeShortName: isMP ? "19.5 MP" : "19.5 SE",
          runtimeVersion: "19.5",
          runtimeSource: "System (/usr/local/stata19)",
          languageName: "Stata",
          languageId: "stata",
          languageVersion: "19.5",
          runtimePath: foundStata19,
          base64EncodedIconSvg: void 0,
          startupBehavior: positron.LanguageRuntimeStartupBehavior.StartOnDemand,
          sessionLocation: positron.LanguageRuntimeSessionLocation.Local,
          extraRuntimeData: {
            engine: "stata19",
            kernelSpec: {
              argv: [
                pythonBin,
                "-m",
                "positron_stata_kernel",
                "-f",
                "{connection_file}"
              ],
              display_name: `StataNow 19.5 ${editionStr}`,
              language: "stata",
              interrupt_mode: "message",
              kernel_protocol_version: "5.3",
              env: {
                PYTHONPATH: kernelPythonPath,
                POSITRON_STATA_ENGINE: "stata19",
                STATA_HOME: "/usr/local/stata19",
                STATA_EDITION: isMP ? "mp" : "se"
              }
            }
          }
        };
        this._discoveredRuntimes.set(metadata.runtimeId, metadata);
        this._discoveredRuntimeCount++;
        yield metadata;
      }
      const openStataPaths = [
        "/media/abhinav/WorkData/.cargo_target/release/open-stata",
        "/media/abhinav/WorkData/.cargo_target/debug/open-stata",
        "/home/abhinav/.cargo/bin/open-stata",
        "/usr/local/bin/open-stata"
      ];
      let foundOpenStata;
      for (const p of openStataPaths) {
        if (fs.existsSync(p)) {
          foundOpenStata = p;
          break;
        }
      }
      if (foundOpenStata) {
        const metadata = {
          runtimeId: "open-stata-rust",
          runtimeName: "OpenStata (Rust Engine)",
          runtimeShortName: "OpenStata",
          runtimeVersion: "0.1.0",
          runtimeSource: "Rust Local Target",
          languageName: "Stata",
          languageId: "stata",
          languageVersion: "19.5",
          runtimePath: foundOpenStata,
          base64EncodedIconSvg: void 0,
          startupBehavior: positron.LanguageRuntimeStartupBehavior.StartOnDemand,
          sessionLocation: positron.LanguageRuntimeSessionLocation.Local,
          extraRuntimeData: {
            engine: "openstata",
            kernelSpec: {
              argv: [
                pythonBin,
                "-m",
                "positron_stata_kernel",
                "-f",
                "{connection_file}"
              ],
              display_name: "OpenStata (Rust Engine)",
              language: "stata",
              interrupt_mode: "message",
              kernel_protocol_version: "5.3",
              env: {
                PYTHONPATH: kernelPythonPath,
                POSITRON_STATA_ENGINE: "openstata",
                OPENSTATA_BIN: foundOpenStata
              }
            }
          }
        };
        this._discoveredRuntimes.set(metadata.runtimeId, metadata);
        this._discoveredRuntimeCount++;
        yield metadata;
      }
    } finally {
      this._discoveryComplete = true;
      this._completeEmitter.fire();
    }
  }
  async recommendedWorkspaceRuntime() {
    if (this._discoveredRuntimes.has("stata-19-mp-official")) {
      return this._discoveredRuntimes.get("stata-19-mp-official");
    }
    if (this._discoveredRuntimes.has("open-stata-rust")) {
      return this._discoveredRuntimes.get("open-stata-rust");
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
  const candidates = [
    "/home/linuxbrew/.linuxbrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
    "python3"
  ];
  for (const p of candidates) {
    if (fs2.existsSync(p)) {
      return p;
    }
  }
  return "python3";
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
      const dtaMtime = fs2.statSync(filePath).mtimeMs;
      const parquetMtime = fs2.statSync(cachedParquetPath).mtimeMs;
      if (parquetMtime >= dtaMtime) {
        needsConvert = false;
      }
    } catch {
      needsConvert = true;
    }
  }
  if (needsConvert) {
    const pythonBin = getPythonExecutable2();
    const pythonScript = `
import pandas as pd
df = pd.read_stata(r'''${filePath}''')
df.to_parquet(r'''${cachedParquetPath}''', index=False)
`;
    await new Promise((resolve, reject) => {
      (0, import_child_process.execFile)(pythonBin, ["-c", pythonScript], (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve();
        }
      });
    });
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
    vscode3.commands.registerCommand("stata.selectEngine", async () => {
      const options = [
        {
          label: "StataNow 19.5 MP (Official)",
          description: "Full licensed Stata 19 MP Parallel Edition via PyStata"
        },
        {
          label: "OpenStata (Rust Engine)",
          description: "High-performance open-source Rust engine"
        }
      ];
      const selected = await vscode3.window.showQuickPick(options, {
        placeHolder: "Select active Stata engine for console"
      });
      if (selected) {
        const engine = selected.label.includes("OpenStata") ? "openstata" : "stata19";
        await positron2.runtime.executeCode("stata", `%engine ${engine}
`, false, true);
        vscode3.window.showInformationMessage(`Switched Stata engine to: ${selected.label}`);
      }
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
