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
var vscode8 = __toESM(require("vscode"));
var positron7 = __toESM(require("positron"));
var fs6 = __toESM(require("fs"));
var os3 = __toESM(require("os"));
var path7 = __toESM(require("path"));

// src/runtimeManager.ts
var vscode2 = __toESM(require("vscode"));
var positron2 = __toESM(require("positron"));
var fs4 = __toESM(require("fs"));

// src/discovery.ts
var path2 = __toESM(require("path"));

// src/pythonEnv.ts
var path = __toESM(require("path"));
var import_child_process = require("child_process");
var MIN_PYTHON_MINOR = 9;
var MAX_PYTHON_MINOR = 13;
var SUPPORTED_MINORS = [13, 12, 11, 10, 9];
var SETUP_PYTHON_VERSION = "3.12";
var REQUIRED_PACKAGES = ["numpy", "pandas"];
var OPTIONAL_PACKAGES = ["pyarrow", "pyreadstat"];
function pathApi(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}
function homeDir(env2) {
  return env2.HOME || env2.USERPROFILE || "";
}
function dataDirectory(platform, env2) {
  const p = pathApi(platform);
  if (env2.POSITRON_STATA_DATA_DIR) {
    return env2.POSITRON_STATA_DATA_DIR;
  }
  if (platform === "win32" && env2.LOCALAPPDATA) {
    return p.join(env2.LOCALAPPDATA, "positron-stata");
  }
  return p.join(homeDir(env2), ".local", "share", "positron-stata");
}
function legacyDataDirectory(platform, env2) {
  const home = homeDir(env2);
  return home ? pathApi(platform).join(home, ".local", "share", "positron-stata") : void 0;
}
function venvPython(venvDir, platform) {
  const p = pathApi(platform);
  return platform === "win32" ? p.join(venvDir, "Scripts", "python.exe") : p.join(venvDir, "bin", "python");
}
function isWindowsAppsDir(dir) {
  return /[\\/]Microsoft[\\/]WindowsApps[\\/]?$/i.test(dir);
}
function minorFromName(name) {
  const dotted = name.match(/3\.(\d+)/);
  if (dotted) return +dotted[1];
  const compact = name.match(/3(\d{1,2})(?!\d)/);
  return compact ? +compact[1] : void 0;
}
function isSupportedMinor(minor) {
  return minor !== void 0 && minor >= MIN_PYTHON_MINOR && minor <= MAX_PYTHON_MINOR;
}
function safeList(listDir, dir) {
  try {
    return listDir(dir);
  } catch {
    return [];
  }
}
function enumeratePythonCandidates(opts) {
  const { platform, env: env2, exists, listDir } = opts;
  const win = platform === "win32";
  const p = pathApi(platform);
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (file, source, args) => {
    const key = `${win ? file.toLowerCase() : file}\0${(args || []).join(" ")}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(args ? { path: file, args, source } : { path: file, source });
  };
  const addIfExists = (file, source) => {
    if (file && exists(file)) add(file, source);
  };
  if (opts.configured) addIfExists(opts.configured, "positron-stata.pythonPath setting");
  const dataDir = dataDirectory(platform, env2);
  addIfExists(venvPython(p.join(dataDir, "venv"), platform), "Stata helper environment");
  const legacy = legacyDataDirectory(platform, env2);
  if (legacy) addIfExists(venvPython(p.join(legacy, "venv"), platform), "Stata helper environment (legacy location)");
  if (env2.VIRTUAL_ENV) {
    const rels = win ? [["Scripts", "python.exe"]] : [["bin", "python3"], ["bin", "python"]];
    const hit = rels.map((r) => p.join(env2.VIRTUAL_ENV, ...r)).find(exists);
    if (hit) add(hit, "active virtualenv (VIRTUAL_ENV)");
  }
  if (env2.CONDA_PREFIX) {
    const rels = win ? [["python.exe"]] : [["bin", "python3"], ["bin", "python"]];
    const hit = rels.map((r) => p.join(env2.CONDA_PREFIX, ...r)).find(exists);
    if (hit) add(hit, "active conda environment (CONDA_PREFIX)");
  }
  for (const c of opts.registered || []) {
    if (c.args?.length) add(c.path, c.source, c.args);
    else addIfExists(c.path, c.source);
  }
  const pathDirs = (env2.PATH || env2.Path || "").split(win ? ";" : ":").filter((d) => d && !(win && isWindowsAppsDir(d)));
  if (!win) {
    for (const minor of SUPPORTED_MINORS) {
      for (const dir of pathDirs) addIfExists(p.join(dir, `python3.${minor}`), "PATH");
    }
    for (const minor of SUPPORTED_MINORS) {
      for (const file of [
        `/opt/homebrew/bin/python3.${minor}`,
        `/usr/local/bin/python3.${minor}`,
        `/Library/Frameworks/Python.framework/Versions/3.${minor}/bin/python3`,
        `/home/linuxbrew/.linuxbrew/bin/python3.${minor}`,
        `/usr/bin/python3.${minor}`
      ]) {
        addIfExists(file, "standard install location");
      }
    }
  } else {
    const localAppData = env2.LOCALAPPDATA;
    const bases = [
      localAppData && p.join(localAppData, "Programs", "Python"),
      env2.ProgramFiles,
      env2["ProgramFiles(x86)"],
      "C:\\"
    ].filter((b) => !!b);
    for (const base of bases) {
      const dirs = safeList(listDir, base).filter((d) => /^Python3\d+$/i.test(d) && isSupportedMinor(minorFromName(d))).sort((a, b) => (minorFromName(b) ?? 0) - (minorFromName(a) ?? 0));
      for (const dir of dirs) addIfExists(p.join(base, dir, "python.exe"), "python.org installer");
    }
    if (localAppData) {
      const storeBase = p.join(localAppData, "Microsoft", "WindowsApps");
      const dirs = safeList(listDir, storeBase).filter((d) => /^PythonSoftwareFoundation\.Python\.3\./i.test(d) && isSupportedMinor(minorFromName(d))).sort((a, b) => (minorFromName(b) ?? 0) - (minorFromName(a) ?? 0));
      for (const dir of dirs) addIfExists(p.join(storeBase, dir, "python.exe"), "Microsoft Store");
    }
    const launcher = [...pathDirs.map((d) => p.join(d, "py.exe")), p.join(env2.SystemRoot || env2.windir || "C:\\Windows", "py.exe")].find(exists);
    if (launcher) {
      for (const minor of SUPPORTED_MINORS) add(launcher, `py launcher (-3.${minor})`, [`-3.${minor}`]);
    }
  }
  const genericNames = win ? ["python.exe", "python3.exe"] : ["python3", "python"];
  for (const name of genericNames) {
    for (const dir of pathDirs) addIfExists(p.join(dir, name), "PATH");
  }
  if (!win) {
    for (const file of ["/usr/bin/python3", "/home/linuxbrew/.linuxbrew/bin/python3", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"]) {
      addIfExists(file, "standard install location");
    }
  }
  return out;
}
var PROBE_SCRIPT = [
  "import sys, struct, json, os, site",
  'r = {"executable": sys.executable, "version": "%d.%d.%d" % tuple(sys.version_info[:3]),',
  '     "bits": struct.calcsize("P") * 8, "prefix": sys.prefix, "venv": sys.prefix != getattr(sys, "base_prefix", sys.prefix)}',
  'for m in ("numpy", "pandas"):',
  "    try:",
  '        mod = __import__(m); r[m] = getattr(mod, "__version__", True)',
  "    except Exception as e:",
  '        r[m] = False; r[m + "_error"] = "%s: %s" % (type(e).__name__, e)',
  "import importlib.util as u",
  'for m in ("pyarrow", "pyreadstat"):',
  "    try:",
  "        r[m] = u.find_spec(m) is not None",
  "    except Exception:",
  "        r[m] = False",
  "paths = []",
  "try:",
  "    paths = list(site.getsitepackages())",
  "except Exception:",
  "    pass",
  'r["sitePaths"] = [p for p in paths if os.path.isdir(p)]',
  "print(json.dumps(r))"
].join("\n");
function parseProbeOutput(stdout) {
  const line = stdout.split(/\r?\n/).reverse().find((l) => l.trim().startsWith("{"));
  if (!line) {
    return { error: `unexpected output: ${stdout.trim().slice(0, 200) || "(none)"}` };
  }
  try {
    return JSON.parse(line);
  } catch (e) {
    return { error: `could not parse probe output: ${String(e)}` };
  }
}
function pythonMinor(result) {
  const m = result.version?.match(/^(\d+)\.(\d+)/);
  return m ? { major: +m[1], minor: +m[2] } : void 0;
}
function evaluateProbe(result) {
  const problems = [];
  const warnings = [];
  if (result.error) {
    return { ok: false, baseOk: false, problems: [result.error], warnings };
  }
  const v = pythonMinor(result);
  if (!v) {
    problems.push("could not determine the Python version");
  } else if (v.major !== 3 || v.minor < MIN_PYTHON_MINOR || v.minor > MAX_PYTHON_MINOR) {
    problems.push(`Python ${result.version} is not supported by PyStata (needs 3.${MIN_PYTHON_MINOR}\u20133.${MAX_PYTHON_MINOR})`);
  }
  if (result.bits !== 64) {
    problems.push(`${result.bits ?? "?"}-bit Python (Stata needs 64-bit)`);
  }
  const baseOk = problems.length === 0;
  for (const pkg of REQUIRED_PACKAGES) {
    if (!result[pkg]) {
      const err = result[`${pkg}_error`];
      problems.push(err && !/No module named/.test(err) ? `${pkg} failed to import (${err})` : `${pkg} is not installed`);
    }
  }
  if (!result.pyarrow) warnings.push("pyarrow is not installed (needed to open .dta files from the Explorer)");
  return { ok: problems.length === 0, baseOk, problems, warnings };
}
function probePython(candidate, timeoutMs = 2e4, exec = import_child_process.execFile) {
  return new Promise((resolve2) => {
    const env2 = { ...process.env };
    delete env2.PYTHONHOME;
    delete env2.PYTHONPATH;
    exec(candidate.path, [...candidate.args || [], "-c", PROBE_SCRIPT], { timeout: timeoutMs, windowsHide: true, env: env2 }, (err, stdout, stderr) => {
      const parsed = parseProbeOutput(String(stdout || ""));
      if (!parsed.error) {
        resolve2(parsed);
      } else if (err) {
        const detail = String(stderr || "").trim().split(/\r?\n/).slice(-2).join(" ");
        resolve2({ error: `could not run: ${detail || err.message}` });
      } else {
        resolve2(parsed);
      }
    });
  });
}
function describeCandidate(c) {
  return c.args?.length ? `${c.path} ${c.args.join(" ")}` : c.path;
}
function uvAsset(platform, arch, musl = false) {
  const cpu = arch === "x64" ? "x86_64" : arch === "arm64" ? "aarch64" : void 0;
  if (!cpu) return void 0;
  let target;
  if (platform === "darwin") target = `${cpu}-apple-darwin`;
  else if (platform === "win32") target = `${cpu}-pc-windows-msvc`;
  else if (platform === "linux") target = `${cpu}-unknown-linux-${musl ? "musl" : "gnu"}`;
  else return void 0;
  const ext = platform === "win32" ? "zip" : "tar.gz";
  return { target, ext, url: `https://github.com/astral-sh/uv/releases/latest/download/uv-${target}.${ext}` };
}
function uvCandidates(platform, env2) {
  const p = pathApi(platform);
  const win = platform === "win32";
  const exe = win ? "uv.exe" : "uv";
  const home = homeDir(env2);
  const dirs = (env2.PATH || env2.Path || "").split(win ? ";" : ":").filter(Boolean);
  return [
    ...dirs.map((d) => p.join(d, exe)),
    ...home ? [p.join(home, ".local", "bin", exe), p.join(home, ".cargo", "bin", exe)] : []
  ];
}

// src/discovery.ts
var EDITIONS = ["mp", "se", "be"];
var VERSIONS = ["21", "20", "19", "18", "17"];
function parseEdition(value) {
  const v = value?.toLowerCase();
  return v && EDITIONS.includes(v) ? v : void 0;
}
function editionFromName(name) {
  const n = name.toLowerCase();
  if (/mp/.test(n)) return "mp";
  if (/se(?:-64)?(?:\.exe|\.app)?$|stata-?se/.test(n)) return "se";
  if (/be/.test(n)) return "be";
  return void 0;
}
function versionFromInstallFiles(entries) {
  let best = -1;
  for (const e of entries) {
    const m = e.match(/^(?:isstata|installed)\.(\d{3})$/i);
    if (m && +m[1] > best) best = +m[1];
  }
  if (best < 0) return void 0;
  return { major: String(Math.floor(best / 10)), minor: String(best % 10) };
}
function describeInstallation(homeDir2, exePath, editionHint, homeEntries) {
  const edition = editionHint ?? editionFromName(path2.basename(exePath)) ?? "be";
  const editionStr = edition === "mp" ? "MP (Parallel Edition)" : edition.toUpperCase();
  let version3 = "19";
  let fullVersion;
  let versionSource = "default";
  const fromFiles = homeEntries ? versionFromInstallFiles(homeEntries) : void 0;
  if (fromFiles) {
    version3 = fromFiles.major;
    fullVersion = `${fromFiles.major}.${fromFiles.minor}`;
    versionSource = "install files";
  } else {
    const match = homeDir2.match(/stata(?:now)?\s*(\d+)/i) || exePath.match(/stata(?:now)?\s*(\d+)/i);
    if (match) {
      version3 = match[1];
      versionSource = "folder name";
    }
  }
  const isStataNow = /statanow/i.test(homeDir2) || /statanow/i.test(exePath) || !!fromFiles && fromFiles.minor !== "0";
  const prefix = isStataNow ? `StataNow ${version3}` : `Stata ${version3}`;
  return {
    homeDir: homeDir2,
    executable: exePath,
    version: version3,
    edition,
    displayName: `${prefix} ${editionStr}`,
    shortName: `${version3} ${edition.toUpperCase()}`,
    source: `System (${homeDir2})`,
    fullVersion,
    versionSource,
    isStataNow
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
var UNIX_BINARIES = ["stata-mp", "stata-se", "stata"];
function parentOf(p) {
  const trimmed = p.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx > 0 ? trimmed.slice(0, idx) : trimmed;
}
function join(base, ...parts) {
  const sep = /\\/.test(base) && !/\//.test(base) ? "\\" : "/";
  return [base.replace(/[\\/]+$/, ""), ...parts].join(sep);
}
function resolveConfiguredHome(configured, exists) {
  const home = configured.replace(/[\\/]+$/, "");
  const appMatch = home.match(/^(.*?)[\\/]([^\\/]+\.app)(?:[\\/]Contents(?:[\\/]MacOS(?:[\\/]([^\\/]+))?)?)?$/i);
  if (appMatch) {
    const [, parent, app, exe] = appMatch;
    const edition = editionFromName(app);
    const appDir = join(parent, app);
    const exeCandidates = exe ? [join(appDir, "Contents", "MacOS", exe)] : [join(appDir, "Contents", "MacOS", `stata-${edition ?? "be"}`), join(appDir, "Contents", "MacOS", app.replace(/\.app$/i, "")), join(appDir, "Contents", "MacOS", "stata")];
    return { homeDir: parent, executable: exeCandidates.find(exists) ?? exeCandidates[0], edition };
  }
  const base = home.split(/[\\/]/).pop() || "";
  if (/^x?stata(?:-(?:mp|se|be))?$/i.test(base) || /^stata.*\.exe$/i.test(base)) {
    if (!exists(join(home, "utilities")) && !UNIX_BINARIES.some((b) => exists(join(home, b)))) {
      return { homeDir: parentOf(home), executable: home, edition: editionFromName(base) };
    }
  }
  return { homeDir: home };
}
function findStataInstallations(opts) {
  const { env: env2, exists } = opts;
  const installations = [];
  const seen = /* @__PURE__ */ new Set();
  const list = (dir) => {
    if (!opts.listDir) return void 0;
    try {
      return opts.listDir(dir);
    } catch {
      return void 0;
    }
  };
  const add = (homeDir2, exePath, editionHint) => {
    const key = homeDir2.replace(/[\\/]+$/, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const inst = describeInstallation(homeDir2, exePath, editionHint, list(homeDir2));
    inst.hasPyStata = exists(join(homeDir2, "utilities", "pystata"));
    installations.push(inst);
  };
  if (opts.configHome && exists(opts.configHome)) {
    const resolved = resolveConfiguredHome(opts.configHome, exists);
    const candidates = [
      ...UNIX_BINARIES,
      ...WINDOWS_BINARIES.map(([b]) => b),
      ...MAC_APPS.flatMap(([app, ed]) => [`${app}/Contents/MacOS/stata-${ed}`, `${app}/Contents/MacOS/${app.replace(".app", "")}`])
    ];
    const found = resolved.executable ?? candidates.map((b) => join(resolved.homeDir, ...b.split("/"))).find(exists);
    add(resolved.homeDir, found || resolved.homeDir, opts.configEdition ?? resolved.edition);
  }
  const linuxDirs = [
    ...VERSIONS.flatMap((v) => [`/usr/local/statanow${v}`, `/usr/local/stata${v}`]),
    "/usr/local/statanow",
    "/usr/local/stata",
    ...VERSIONS.flatMap((v) => [`/opt/statanow${v}`, `/opt/stata${v}`]),
    "/opt/statanow",
    "/opt/stata"
  ];
  for (const dir of linuxDirs) {
    if (!exists(dir)) continue;
    const bin = UNIX_BINARIES.map((b) => join(dir, b)).find(exists);
    if (bin) add(dir, bin);
  }
  const macBaseDirs = [
    ...VERSIONS.flatMap((v) => [`/Applications/StataNow ${v}`, `/Applications/StataNow${v}`, `/Applications/Stata ${v}`, `/Applications/Stata${v}`]),
    "/Applications/StataNow",
    "/Applications/Stata"
  ];
  for (const base of macBaseDirs) {
    if (!exists(base)) continue;
    for (const [app, ed] of MAC_APPS) {
      const cliPath = join(base, app, "Contents", "MacOS", `stata-${ed}`);
      const guiPath = join(base, app, "Contents", "MacOS", app.replace(".app", ""));
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
  const winDirs = [...VERSIONS.flatMap((v) => [`StataNow${v}`, `Stata${v}`]), "StataNow", "Stata"];
  for (const pf of programFiles) {
    for (const wd of winDirs) {
      const dir = join(pf, wd);
      if (!exists(dir)) continue;
      const hit = WINDOWS_BINARIES.find(([b]) => exists(join(dir, b)));
      if (hit) add(dir, join(dir, hit[0]), hit[1]);
    }
  }
  const envPath = env2["PATH"] || env2["Path"] || "";
  for (const dir of envPath.split(path2.delimiter)) {
    if (!dir) continue;
    const bin = UNIX_BINARIES.map((b) => join(dir, b)).find(exists);
    if (bin && exists(join(dir, "utilities"))) {
      add(dir, bin);
    }
  }
  return installations;
}
function resolvePythonExecutable(opts) {
  const [first] = enumeratePythonCandidates(opts).filter((c) => !c.args?.length);
  return first?.path ?? (opts.platform === "win32" ? "python" : "python3");
}

// src/setup.ts
var vscode = __toESM(require("vscode"));
var positron = __toESM(require("positron"));
var fs3 = __toESM(require("fs"));
var os = __toESM(require("os"));
var path5 = __toESM(require("path"));

// src/envSetup.ts
var fs = __toESM(require("fs"));
var path3 = __toESM(require("path"));
var import_child_process2 = require("child_process");
var SetupCancelled = class extends Error {
  constructor() {
    super("Setup was cancelled.");
  }
};
function exeName(platform, name) {
  return platform === "win32" ? `${name}.exe` : name;
}
function run(cmd, args, o) {
  return new Promise((resolve2, reject) => {
    if (o.token?.isCancellationRequested) return reject(new SetupCancelled());
    o.log(`$ ${[cmd, ...args].map((a) => /\s/.test(a) ? `"${a}"` : a).join(" ")}`);
    const child = (0, import_child_process2.spawn)(cmd, args, { env: o.env, cwd: o.cwd, windowsHide: true });
    const tail = [];
    const onData = (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        o.log(`  ${line}`);
        tail.push(line);
        if (tail.length > 8) tail.shift();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const sub = o.token?.onCancellationRequested?.(() => child.kill());
    child.on("error", (err) => {
      sub?.dispose();
      reject(err);
    });
    child.on("close", (code) => {
      sub?.dispose();
      if (o.token?.isCancellationRequested) reject(new SetupCancelled());
      else if (code === 0) resolve2();
      else reject(new Error(`${path3.basename(cmd)} exited with code ${code}: ${tail.slice(-3).join(" | ")}`));
    });
  });
}
async function works(cmd, args) {
  try {
    await run(cmd, args, { log: () => void 0 });
    return true;
  } catch {
    return false;
  }
}
async function findUv(o, includeDownloaded = true) {
  const candidates = [
    ...uvCandidates(o.platform, o.env),
    ...includeDownloaded ? [path3.join(o.uvStorageDir, exeName(o.platform, "uv"))] : []
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && await works(c, ["--version"])) return c;
  }
  return void 0;
}
function isMusl() {
  try {
    const report = process.report?.getReport?.();
    return !report?.header?.glibcVersionRuntime;
  } catch {
    return false;
  }
}
function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path3.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const hit = findFile(full, name);
      if (hit) return hit;
    }
  }
  return void 0;
}
async function downloadUv(o) {
  const asset = uvAsset(o.platform, o.arch, o.platform === "linux" && isMusl());
  if (!asset) throw new Error(`uv has no prebuilt download for ${o.platform}/${o.arch}.`);
  fs.mkdirSync(o.uvStorageDir, { recursive: true });
  const archive = path3.join(o.uvStorageDir, `uv-download.${asset.ext}`);
  const extractDir = path3.join(o.uvStorageDir, "extract");
  o.log(`Downloading ${asset.url}`);
  o.report?.("Downloading uv\u2026");
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} ${response.statusText} (${asset.url})`);
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  if (o.token?.isCancellationRequested) throw new SetupCancelled();
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  await run("tar", ["-xf", archive, "-C", extractDir], o);
  const binary = findFile(extractDir, exeName(o.platform, "uv"));
  if (!binary) throw new Error("The uv archive did not contain a uv executable.");
  const dest = path3.join(o.uvStorageDir, exeName(o.platform, "uv"));
  fs.copyFileSync(binary, dest);
  if (o.platform !== "win32") fs.chmodSync(dest, 493);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.rmSync(archive, { force: true });
  o.log(`uv installed at ${dest}`);
  return dest;
}
function uvEnv(o) {
  return {
    ...o.env,
    // Keep the interpreter next to the venv so OS/Homebrew Python upgrades can't break it, and ignore
    // any uv.toml/pyproject settings from the user's current folder.
    UV_PYTHON_INSTALL_DIR: path3.join(o.dataDir, "python"),
    UV_PYTHON_PREFERENCE: "only-managed",
    UV_NO_CONFIG: "1",
    VIRTUAL_ENV: void 0
  };
}
async function installPackages(o, installer) {
  const warnings = [];
  o.report?.(`Installing ${REQUIRED_PACKAGES.join(", ")}\u2026`);
  await installer([...REQUIRED_PACKAGES]);
  o.report?.(`Installing ${OPTIONAL_PACKAGES.join(", ")}\u2026`);
  for (const pkg of OPTIONAL_PACKAGES) {
    try {
      await installer([pkg]);
    } catch (e) {
      if (e instanceof SetupCancelled) throw e;
      const msg = `Optional package ${pkg} could not be installed (${e.message}); the related feature will be unavailable.`;
      o.log(`WARNING: ${msg}`);
      warnings.push(msg);
    }
  }
  return warnings;
}
function removeVenv(venvDir, dataDir) {
  if (path3.resolve(path3.dirname(venvDir)) === path3.resolve(dataDir) && path3.basename(venvDir) === "venv") {
    fs.rmSync(venvDir, { recursive: true, force: true });
  }
}
async function viaUv(o, uv, venvDir, python, reuse) {
  const env2 = uvEnv(o);
  if (!reuse) {
    o.report?.(`Creating environment with Python ${SETUP_PYTHON_VERSION} (uv downloads it if needed)\u2026`);
    await run(uv, ["venv", "--python", SETUP_PYTHON_VERSION, venvDir], { ...o, env: env2, cwd: o.dataDir });
  }
  return installPackages(o, (pkgs) => run(uv, ["pip", "install", "--python", python, ...pkgs], { ...o, env: env2, cwd: o.dataDir }));
}
async function viaVenv(o, base, venvDir, python, reuse) {
  const env2 = { ...o.env, PIP_DISABLE_PIP_VERSION_CHECK: "1", PYTHONPATH: void 0 };
  if (!reuse) {
    o.report?.(`Creating environment from ${describeCandidate(base)}\u2026`);
    await run(base.path, [...base.args || [], "-m", "venv", venvDir], { ...o, env: env2, cwd: o.dataDir });
  }
  return installPackages(o, (pkgs) => run(python, ["-m", "pip", "install", ...pkgs], { ...o, env: env2, cwd: o.dataDir }));
}
async function runSetup(o) {
  const strategy = o.strategy ?? "auto";
  const venvDir = path3.join(o.dataDir, "venv");
  const python = venvPython(venvDir, o.platform);
  fs.mkdirSync(o.dataDir, { recursive: true });
  o.log(`Setting up the Stata Python environment in ${venvDir}`);
  let reuse = false;
  if (fs.existsSync(python)) {
    const existing = evaluateProbe(await probePython({ path: python, source: "existing" }));
    reuse = existing.baseOk;
    o.log(reuse ? "Existing environment has a usable Python; installing/updating packages." : `Existing environment is unusable (${existing.problems.join("; ")}); recreating it.`);
  }
  if (!reuse) removeVenv(venvDir, o.dataDir);
  const attempts = [];
  const finish = async (used, warnings) => {
    const probe = await probePython({ path: python, source: "new environment" });
    const verdict = evaluateProbe(probe);
    if (!verdict.ok) throw new Error(`The new environment is not usable: ${verdict.problems.join("; ")}`);
    o.log(`Done: ${python} (Python ${probe.version}, pandas ${probe.pandas}, numpy ${probe.numpy}) via ${used}.`);
    return { python: probe.executable || python, strategy: used, probe, warnings: [...warnings, ...verdict.warnings] };
  };
  const failed = (what, e) => {
    if (e instanceof SetupCancelled) throw e;
    const msg = `${what} failed: ${e.message}`;
    o.log(msg);
    attempts.push(msg);
    if (!reuse) removeVenv(venvDir, o.dataDir);
  };
  if (strategy === "auto" || strategy === "uv") {
    const uv2 = await findUv(o);
    if (uv2) {
      o.log(`Using uv at ${uv2}`);
      try {
        return await finish("uv", await viaUv(o, uv2, venvDir, python, reuse));
      } catch (e) {
        failed("uv", e);
      }
    } else if (strategy === "uv") {
      throw new Error("uv was not found.");
    }
  }
  if (strategy === "auto" || strategy === "venv") {
    const bases = await o.baseInterpreters();
    if (bases.length) {
      try {
        return await finish(`python -m venv (${describeCandidate(bases[0])})`, await viaVenv(o, bases[0], venvDir, python, reuse));
      } catch (e) {
        failed("python -m venv", e);
      }
    } else {
      o.log(`No existing Python 3.9\u20133.13 (64-bit) found to base the environment on.`);
      if (strategy === "venv") throw new Error("No compatible base Python found.");
    }
  }
  const consent = await o.confirmDownload(
    `Stata needs a private copy of Python. OK to download uv (Astral's Python installer, ~20 MB, from github.com) and Python ${SETUP_PYTHON_VERSION} (~30 MB)? Everything goes into ${o.dataDir} and ${o.uvStorageDir}.`
  );
  if (!consent) {
    throw new Error(["Setup needs to download uv and Python, but the download was declined.", ...attempts].join(" "));
  }
  const uv = await downloadUv(o);
  try {
    return await finish("downloaded uv", await viaUv(o, uv, venvDir, python, reuse));
  } catch (e) {
    failed("downloaded uv", e);
    throw new Error(`Could not create the Python environment. ${attempts.join(" ")}`);
  }
}

// src/kernelspec.ts
var fs2 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
var KERNELSPEC_NAME = "positron-stata";
var MANAGED_KEY = "positron-stata";
function buildKernelEnv(o) {
  const { inst, platform, baseEnv } = o;
  const delimiter2 = platform === "win32" ? ";" : ":";
  const prepend = (value, existing) => !existing ? value : existing.split(delimiter2).includes(value) ? existing : `${value}${delimiter2}${existing}`;
  const env2 = {
    PYTHONPATH: o.standalone ? o.kernelDir : prepend(o.kernelDir, baseEnv.PYTHONPATH),
    POSITRON_STATA_ENGINE: "stata",
    STATA_HOME: inst.homeDir,
    STATA_EDITION: inst.edition,
    STATA_VERSION: inst.version,
    POSITRON_STATA_VALUE_LABELS: o.valueLabels ? "1" : "0"
  };
  if (!o.standalone) {
    env2.PATH = prepend(inst.homeDir, baseEnv.PATH ?? baseEnv.Path);
  }
  if (o.positronPythonFiles) {
    env2.POSITRON_PYTHON_FILES = o.positronPythonFiles;
  }
  if (platform === "linux") {
    env2.LD_LIBRARY_PATH = o.standalone ? inst.homeDir : prepend(inst.homeDir, baseEnv.LD_LIBRARY_PATH);
  }
  return env2;
}
function kernelDisplayName(inst) {
  return `${inst.isStataNow ? "StataNow" : "Stata"} ${inst.version} ${inst.edition.toUpperCase()}`;
}
function buildKernelSpec(python, launcherScript, displayName, env2) {
  return {
    argv: [python, launcherScript, "-f", "{connection_file}"],
    display_name: displayName,
    language: "stata",
    // Message-based interrupts work on every platform (signals do not exist on Windows) and let the
    // kernel stop Stata cleanly between commands.
    interrupt_mode: "message",
    env: env2
  };
}
function jupyterKernelSpec(spec) {
  const { kernel_protocol_version: _unused, ...rest } = spec;
  return { ...rest, metadata: { [MANAGED_KEY]: { managed: true } } };
}
function jupyterDataDir(platform, env2) {
  const p = platform === "win32" ? path4.win32 : path4.posix;
  if (env2.JUPYTER_DATA_DIR) return env2.JUPYTER_DATA_DIR;
  const home = env2.HOME || env2.USERPROFILE || "";
  if (platform === "win32") return p.join(env2.APPDATA || p.join(home, "AppData", "Roaming"), "jupyter");
  if (platform === "darwin") return p.join(home, "Library", "Jupyter");
  return p.join(env2.XDG_DATA_HOME || p.join(home, ".local", "share"), "jupyter");
}
function kernelspecDir(platform, env2) {
  const p = platform === "win32" ? path4.win32 : path4.posix;
  return p.join(jupyterDataDir(platform, env2), "kernels", KERNELSPEC_NAME);
}
var LEGACY_LAUNCHER = /abhinavjnu\.positron-stata-[^\\/]*[\\/]kernel[\\/]launcher\.py$/i;
function kernelspecOwnership(existing) {
  if (existing === void 0) return "missing";
  let json;
  try {
    json = JSON.parse(existing);
  } catch {
    return "unreadable";
  }
  if (json?.metadata?.[MANAGED_KEY]?.managed === true) return "managed";
  if (Array.isArray(json?.argv) && json.argv.some((a) => typeof a === "string" && LEGACY_LAUNCHER.test(a))) return "legacy";
  return "foreign";
}
function provisionKernelspec(dir, spec, fsImpl = fs2) {
  const file = path4.join(dir, "kernel.json");
  let existing;
  try {
    existing = fsImpl.readFileSync(file, "utf8");
  } catch {
    existing = void 0;
  }
  const content = JSON.stringify(jupyterKernelSpec(spec), null, 2) + "\n";
  const owner = kernelspecOwnership(existing);
  if (owner === "foreign" || owner === "unreadable") {
    return { status: "skipped", path: file, reason: `a kernelspec not created by this extension already exists (${owner})` };
  }
  if (existing === content) {
    return { status: "unchanged", path: file };
  }
  fsImpl.mkdirSync(dir, { recursive: true });
  fsImpl.writeFileSync(file, content, "utf8");
  return { status: "written", path: file, reason: owner === "legacy" ? "replaced a stale kernelspec from an older release" : void 0 };
}

// src/setup.ts
var CONFIG = "positron-stata";
var PROBE_CACHE_KEY = "pythonProbeCache.v1";
var SELECTED_KEY = "selectedPython.v1";
var README_TROUBLESHOOTING = "https://github.com/abhinavjnu/positron-stata#troubleshooting";
function findInstallations() {
  const config = vscode.workspace.getConfiguration(CONFIG);
  return findStataInstallations({
    env: process.env,
    exists: fs3.existsSync,
    listDir: fs3.readdirSync,
    configHome: config.get("stataHome") || void 0,
    configEdition: parseEdition(config.get("stataEdition"))
  });
}
function getPositronPythonFilesPath() {
  const candidates = [
    vscode.env.appRoot && path5.join(vscode.env.appRoot, "extensions", "positron-python", "python_files", "posit"),
    "/usr/share/positron/resources/app/extensions/positron-python/python_files/posit",
    "/Applications/Positron.app/Contents/Resources/app/extensions/positron-python/python_files/posit",
    path5.join(process.env["LOCALAPPDATA"] || "", "Programs", "Positron", "resources", "app", "extensions", "positron-python", "python_files", "posit"),
    path5.join(process.env["ProgramFiles"] || "C:\\Program Files", "Positron", "resources", "app", "extensions", "positron-python", "python_files", "posit")
  ];
  return candidates.find((c) => !!c && fs3.existsSync(c));
}
function ipykernelSupport(pythonFiles, version3) {
  if (!pythonFiles) return "Positron python_files not found";
  const base = path5.join(path5.dirname(pythonFiles), "lib", "ipykernel");
  if (!fs3.existsSync(path5.join(base, "py3"))) return `missing ${path5.join(base, "py3")}`;
  const m = version3?.match(/^3\.(\d+)/);
  if (!m) return `found ${base}`;
  const cp = `cp3${m[1]}`;
  let archDirs = [];
  try {
    archDirs = fs3.readdirSync(base).filter((d) => d !== "py3" && fs3.statSync(path5.join(base, d)).isDirectory());
  } catch {
  }
  const hit = archDirs.find((d) => fs3.existsSync(path5.join(base, d, cp)));
  return hit ? `ok (${path5.join(base, hit, cp)})` : `no ${cp} build under ${base}/{${archDirs.join(",")}}`;
}
function mtime(p) {
  try {
    return fs3.statSync(p).mtimeMs;
  } catch {
    return -1;
  }
}
var current;
function getStataEnvironment() {
  return current;
}
var StataEnvironment = class {
  constructor(context) {
    this.context = context;
    this.output = vscode.window.createOutputChannel("Stata");
    current = this;
  }
  context;
  output;
  selecting;
  settingUp;
  lastPromptAt = 0;
  _onDidSetup = new vscode.EventEmitter();
  /** Fires with the interpreter path after a successful setup. */
  onDidSetup = this._onDidSetup.event;
  dispose() {
    this.output.dispose();
    this._onDidSetup.dispose();
    if (current === this) current = void 0;
  }
  log(line) {
    this.output.appendLine(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] ${line}`);
  }
  get dataDir() {
    return dataDirectory(process.platform, process.env);
  }
  // ------------------------------------------------------------------ interpreter selection
  async registeredPythons() {
    try {
      const runtimes = await Promise.race([
        positron.runtime.getRegisteredRuntimes(),
        new Promise((resolve2) => setTimeout(() => resolve2([]), 3e3))
      ]);
      return runtimes.filter((r) => r.languageId === "python" && r.runtimePath).map((r) => ({ r, minor: minorFromName(r.languageVersion) })).filter(({ minor }) => minor === void 0 || minor >= MIN_PYTHON_MINOR && minor <= MAX_PYTHON_MINOR).sort((a, b) => (b.minor ?? 0) - (a.minor ?? 0)).map(({ r }) => ({ path: r.runtimePath, source: `Positron interpreter: ${r.runtimeName}` }));
    } catch {
      return [];
    }
  }
  async candidates() {
    return enumeratePythonCandidates({
      platform: process.platform,
      env: process.env,
      exists: fs3.existsSync,
      listDir: fs3.readdirSync,
      configured: vscode.workspace.getConfiguration(CONFIG).get("pythonPath") || void 0,
      registered: await this.registeredPythons()
    });
  }
  stamps(candidate, result) {
    const paths = /* @__PURE__ */ new Set([...candidate.args?.length ? [] : [candidate.path], ...result.executable ? [result.executable] : [], ...result.sitePaths || []]);
    return Object.fromEntries([...paths].map((p) => [p, mtime(p)]));
  }
  /** Probe results are cached until the interpreter or its site-packages folders change. */
  async probe(candidate, force = false) {
    const key = describeCandidate(candidate);
    const cache = this.context.globalState.get(PROBE_CACHE_KEY, {});
    const hit = cache[key];
    if (!force && hit && !hit.result.error && Object.entries(hit.stamps).every(([p, t]) => mtime(p) === t)) {
      return { result: hit.result, cached: true };
    }
    const result = await probePython(candidate);
    if (!result.error) {
      cache[key] = { result, stamps: this.stamps(candidate, result) };
    } else {
      delete cache[key];
    }
    await this.context.globalState.update(PROBE_CACHE_KEY, cache);
    return { result, cached: false };
  }
  /**
   * Returns the first compatible interpreter in preference order. With `all`, every candidate is probed
   * (for diagnostics). Concurrent callers share one run.
   */
  selectPython(opts = {}) {
    if (!opts.all && !opts.force && this.selecting) return this.selecting;
    const run2 = (async () => {
      const evaluated = [];
      let selected;
      for (const candidate of await this.candidates()) {
        const { result, cached } = await this.probe(candidate, opts.force);
        const e = { candidate, result, verdict: evaluateProbe(result), cached };
        evaluated.push(e);
        if (e.verdict.ok && !selected) {
          selected = e;
          if (!opts.all) break;
        }
      }
      const exe = selected ? selected.result.executable || selected.candidate.path : void 0;
      if (exe !== this.context.globalState.get(SELECTED_KEY)) {
        await this.context.globalState.update(SELECTED_KEY, exe);
        this.log(exe ? `Using Python ${selected.result.version} at ${exe} (${selected.candidate.source}).` : "No compatible Python found.");
      }
      const configured = vscode.workspace.getConfiguration(CONFIG).get("pythonPath");
      const configuredEval = configured ? evaluated.find((e) => e.candidate.path === configured) : void 0;
      if (configuredEval && !configuredEval.verdict.ok) {
        this.log(`positron-stata.pythonPath (${configured}) is not usable: ${configuredEval.verdict.problems.join("; ")}. Falling back to another interpreter.`);
      }
      return { selected, evaluated };
    })();
    if (!opts.all) {
      this.selecting = run2;
      run2.finally(() => {
        if (this.selecting === run2) this.selecting = void 0;
      });
    }
    return run2;
  }
  /** Last verified interpreter, available synchronously (used while building runtime metadata). */
  cachedPython() {
    const exe = this.context.globalState.get(SELECTED_KEY);
    return exe && fs3.existsSync(exe) ? exe : void 0;
  }
  /** Resolves to a verified interpreter, or shows the setup prompt and throws a readable error. */
  async requirePython() {
    const { selected } = await this.selectPython();
    if (selected) return selected.result.executable || selected.candidate.path;
    this.promptSetup();
    throw new Error(
      `Stata needs Python 3.${MIN_PYTHON_MINOR}\u20133.${MAX_PYTHON_MINOR} (64-bit) with numpy and pandas to run, and none was found. Run "Stata: Set Up Python Environment" (or set positron-stata.pythonPath), then start Stata again. "Stata: Diagnose Setup" shows what was checked.`
    );
  }
  promptSetup() {
    if (Date.now() - this.lastPromptAt < 15e3) return;
    this.lastPromptAt = Date.now();
    void vscode.window.showWarningMessage(
      `Stata needs a small Python helper (Python 3.${MIN_PYTHON_MINOR}\u20133.${MAX_PYTHON_MINOR} with pandas). Set it up automatically?`,
      "Set Up Automatically",
      "Choose Interpreter\u2026",
      "Learn More"
    ).then((choice) => {
      if (choice === "Set Up Automatically") void this.setupEnvironment();
      else if (choice === "Choose Interpreter\u2026") void this.chooseInterpreter();
      else if (choice === "Learn More") void vscode.env.openExternal(vscode.Uri.parse(README_TROUBLESHOOTING));
    });
  }
  async chooseInterpreter() {
    const picked = await vscode.window.showOpenDialog({
      title: "Select a Python 3.9\u20133.13 interpreter with numpy and pandas",
      canSelectMany: false,
      openLabel: "Use for Stata",
      filters: process.platform === "win32" ? { Python: ["exe"] } : void 0
    });
    if (!picked?.[0]) return;
    const file = picked[0].fsPath;
    const result = await probePython({ path: file, source: "chosen" });
    const verdict = evaluateProbe(result);
    if (!verdict.ok) {
      const choice = await vscode.window.showErrorMessage(`That interpreter can't run Stata: ${verdict.problems.join("; ")}.`, "Set Up Automatically");
      if (choice) void this.setupEnvironment();
      return;
    }
    await vscode.workspace.getConfiguration(CONFIG).update("pythonPath", file, vscode.ConfigurationTarget.Global);
    await this.selectPython({ force: true });
    void vscode.window.showInformationMessage(`Stata will use Python ${result.version} at ${file}.`);
  }
  // ------------------------------------------------------------------ automatic setup
  setupEnvironment() {
    if (this.settingUp) return this.settingUp;
    this.settingUp = this.doSetup().finally(() => this.settingUp = void 0);
    return this.settingUp;
  }
  async doSetup() {
    this.output.show(true);
    try {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Stata: setting up Python", cancellable: true },
        (progress, token) => runSetup({
          platform: process.platform,
          arch: process.arch,
          env: process.env,
          dataDir: this.dataDir,
          uvStorageDir: path5.join(this.context.globalStorageUri.fsPath, "uv"),
          log: (line) => this.log(line),
          report: (message) => progress.report({ message }),
          token,
          confirmDownload: async (message) => await vscode.window.showInformationMessage(message, { modal: true }, "Download and Set Up") === "Download and Set Up",
          baseInterpreters: async () => {
            const { evaluated } = await this.selectPython({ all: true });
            return evaluated.filter((e) => e.verdict.baseOk).map((e) => ({ path: e.result.executable || e.candidate.path, source: e.candidate.source }));
          }
        })
      );
      await this.selectPython({ force: true });
      this._onDidSetup.fire(result.python);
      for (const w of result.warnings) this.log(`Note: ${w}`);
      const choice = await vscode.window.showInformationMessage(
        `Stata is ready: Python ${result.probe.version} with pandas is set up. Start a Stata console to begin.`,
        "Start Stata"
      );
      if (choice === "Start Stata") await this.startStata();
      return result.python;
    } catch (e) {
      if (e instanceof SetupCancelled) {
        this.log("Setup cancelled.");
        return void 0;
      }
      const message = e.message;
      this.log(`Setup failed: ${message}`);
      const choice = await vscode.window.showErrorMessage(`Stata Python setup failed: ${message}`, "Show Log", "Diagnose", "Choose Interpreter\u2026");
      if (choice === "Show Log") this.output.show();
      else if (choice === "Diagnose") await this.diagnose();
      else if (choice === "Choose Interpreter\u2026") await this.chooseInterpreter();
      return void 0;
    }
  }
  async startStata() {
    const [inst] = findInstallations();
    if (!inst) {
      void vscode.window.showWarningMessage("No Stata installation was found. Set positron-stata.stataHome to your Stata folder.");
      return;
    }
    const runtimeId = `stata-${inst.version}-${inst.edition}-official`;
    try {
      await positron.runtime.selectLanguageRuntime(runtimeId);
    } catch (e) {
      this.log(`Could not start ${runtimeId}: ${e.message}`);
      await vscode.commands.executeCommand("workbench.action.language.runtime.selectSessionInterpreter");
    }
  }
  // ------------------------------------------------------------------ kernel launch config
  buildKernelSpec(inst, python, standalone = false) {
    const config = vscode.workspace.getConfiguration(CONFIG);
    const env2 = buildKernelEnv({
      inst,
      kernelDir: path5.join(this.context.extensionPath, "kernel"),
      positronPythonFiles: getPositronPythonFilesPath(),
      platform: process.platform,
      baseEnv: process.env,
      valueLabels: config.get("dataExplorer.showValueLabels", true),
      standalone
    });
    const spec = buildKernelSpec(python, path5.join(this.context.extensionPath, "kernel", "launcher.py"), standalone ? kernelDisplayName(inst) : inst.displayName, env2);
    return standalone ? spec : { ...spec, kernel_protocol_version: "5.3" };
  }
  /** Writes/refreshes the `positron-stata` Jupyter kernelspec so Quarto and Jupyter can use Stata. */
  async refreshKernelspec(python) {
    if (!vscode.workspace.getConfiguration(CONFIG).get("jupyterKernelspec.enabled", true)) return void 0;
    const [inst] = findInstallations().filter((i) => i.hasPyStata !== false);
    if (!inst) return void 0;
    const exe = python ?? (await this.selectPython()).selected?.result.executable;
    if (!exe) return void 0;
    try {
      const result = provisionKernelspec(kernelspecDir(process.platform, process.env), this.buildKernelSpec(inst, exe, true));
      if (result.status !== "unchanged") this.log(`Jupyter kernelspec ${result.status}: ${result.path}${result.reason ? ` (${result.reason})` : ""}`);
      return result;
    } catch (e) {
      this.log(`Could not write the Jupyter kernelspec: ${e.message}`);
      return void 0;
    }
  }
  // ------------------------------------------------------------------ diagnostics
  async buildReport() {
    const lines = [];
    const add = (s = "") => lines.push(s);
    const ext = this.context.extension;
    add("Stata for Positron \u2014 setup report");
    add(`Generated: ${(/* @__PURE__ */ new Date()).toISOString()}`);
    add();
    add(`Extension:  ${ext.id} ${ext.packageJSON?.version ?? "?"} (${this.context.extensionPath})`);
    add(`Positron:   ${positron.version ?? "?"} (build ${positron.buildNumber ?? "?"}), VS Code API ${vscode.version}`);
    add(`Platform:   ${process.platform} ${process.arch} (${os.release()})`);
    add();
    const config = vscode.workspace.getConfiguration(CONFIG);
    add("Settings:");
    for (const key of ["stataHome", "stataEdition", "pythonPath", "dataExplorer.showValueLabels", "jupyterKernelspec.enabled"]) {
      add(`  ${CONFIG}.${key} = ${JSON.stringify(config.get(key))}`);
    }
    add();
    const installs = findInstallations();
    add(`Stata installations (${installs.length}):`);
    if (!installs.length) add("  none found \u2014 set positron-stata.stataHome to your Stata folder");
    for (const i of installs) {
      add(`  ${i.displayName}`);
      add(`    home:       ${i.homeDir}`);
      add(`    executable: ${i.executable}`);
      add(`    version:    ${i.fullVersion ?? i.version} (from ${i.versionSource ?? "?"}), edition ${i.edition.toUpperCase()}`);
      add(`    PyStata:    ${i.hasPyStata ? `found (${path5.join(i.homeDir, "utilities", "pystata")})` : "NOT FOUND \u2014 Stata 17 or newer is required"}`);
    }
    add();
    const pythonFiles = getPositronPythonFilesPath();
    const { selected, evaluated } = await this.selectPython({ all: true, force: true });
    add("Python for the Stata kernel:");
    if (selected) {
      const r = selected.result;
      add(`  selected:   ${r.executable} (${selected.candidate.source})`);
      add(`  version:    ${r.version}, ${r.bits}-bit${r.venv ? ", virtual environment" : ""}`);
      add(`  packages:   numpy ${r.numpy}, pandas ${r.pandas}, pyarrow ${r.pyarrow ? "yes" : "no"}, pyreadstat ${r.pyreadstat ? "yes" : "no"}`);
      for (const w of selected.verdict.warnings) add(`  note:       ${w}`);
    } else {
      add('  selected:   NONE \u2014 run "Stata: Set Up Python Environment"');
    }
    add(`  helper env: ${this.dataDir}${fs3.existsSync(path5.join(this.dataDir, "venv")) ? "" : " (not created)"}`);
    add("  candidates:");
    if (!evaluated.length) add("    none found");
    for (const e of evaluated) {
      const status = e.verdict.ok ? "OK" : `rejected: ${e.verdict.problems.join("; ")}`;
      const ver = e.result.version ? ` [${e.result.version}]` : "";
      add(`    - ${describeCandidate(e.candidate)}${ver} (${e.candidate.source}) \u2014 ${status}`);
    }
    add();
    add("Positron integration:");
    add(`  python_files/posit: ${pythonFiles ?? "NOT FOUND (the kernel borrows Positron's bundled ipykernel from here)"}`);
    add(`  bundled ipykernel:  ${ipykernelSupport(pythonFiles, selected?.result.version)}`);
    add();
    const ksDir = kernelspecDir(process.platform, process.env);
    const ksFile = path5.join(ksDir, "kernel.json");
    let ksText;
    try {
      ksText = fs3.readFileSync(ksFile, "utf8");
    } catch {
      ksText = void 0;
    }
    add("Jupyter kernelspec (Quarto / notebooks):");
    add(`  ${ksFile}: ${kernelspecOwnership(ksText)}${config.get("jupyterKernelspec.enabled", true) ? "" : " (provisioning disabled)"}`);
    if (ksText) {
      try {
        add(`  argv: ${JSON.stringify(JSON.parse(ksText).argv)}`);
      } catch {
      }
    }
    add(`  use in Quarto with:  jupyter: ${KERNELSPEC_NAME}`);
    return lines.join("\n");
  }
  async diagnose() {
    const report = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Stata: checking setup\u2026" },
      () => this.buildReport()
    );
    this.output.appendLine("");
    this.output.appendLine(report);
    this.output.show(true);
    const hasPython = !/selected: {3}NONE/.test(report);
    const actions = hasPython ? ["Copy Report"] : ["Set Up Python Environment", "Copy Report"];
    const choice = await vscode.window.showInformationMessage('Stata setup report written to the "Stata" output channel.', ...actions);
    if (choice === "Copy Report") {
      await vscode.env.clipboard.writeText(report);
      void vscode.window.showInformationMessage("Setup report copied to the clipboard.");
    } else if (choice === "Set Up Python Environment") {
      void this.setupEnvironment();
    }
  }
};

// src/runtimeManager.ts
function getPythonExecutable() {
  return getStataEnvironment()?.cachedPython() ?? resolvePythonExecutable({
    platform: process.platform,
    env: process.env,
    exists: fs4.existsSync,
    listDir: fs4.readdirSync,
    configured: vscode2.workspace.getConfiguration("positron-stata").get("pythonPath")
  });
}
function runtimeIdFor(inst) {
  return `stata-${inst.version}-${inst.edition}-official`;
}
async function workspaceHasStataFiles() {
  if (!vscode2.workspace.workspaceFolders?.length) {
    return false;
  }
  const matches = await vscode2.workspace.findFiles(
    "**/*.{do,ado,dta,DO,ADO,DTA}",
    "**/{node_modules,.git}/**",
    1
  );
  return matches.length > 0;
}
var INTENTIONAL_EXITS = /* @__PURE__ */ new Set([
  positron2.RuntimeExitReason.Shutdown,
  positron2.RuntimeExitReason.ForcedQuit,
  positron2.RuntimeExitReason.Restart,
  positron2.RuntimeExitReason.SwitchRuntime,
  positron2.RuntimeExitReason.Transferred,
  positron2.RuntimeExitReason.ExtensionHost
]);
var StataRuntimeManager = class {
  constructor(context, env2) {
    this.context = context;
    this.env = env2;
    this.onDidDiscoverRuntime = this._discoverEmitter.event;
    this.onDidCompleteDiscovery = this._completeEmitter.event;
  }
  context;
  env;
  _discoveredRuntimes = /* @__PURE__ */ new Map();
  onDidDiscoverRuntime;
  _discoverEmitter = new vscode2.EventEmitter();
  onDidCompleteDiscovery;
  _completeEmitter = new vscode2.EventEmitter();
  _discoveryComplete = false;
  _discoveredRuntimeCount = 0;
  alwaysRediscover = true;
  get isDiscoveryComplete() {
    return this._discoveryComplete;
  }
  get discoveredRuntimeCount() {
    return this._discoveredRuntimeCount;
  }
  buildRuntimeMetadata(inst, startupBehavior = positron2.LanguageRuntimeStartupBehavior.Implicit) {
    return {
      runtimeId: runtimeIdFor(inst),
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
      sessionLocation: positron2.LanguageRuntimeSessionLocation.Workspace,
      cacheable: false,
      extraRuntimeData: {
        engine: "stata",
        installation: inst,
        // Rebuilt in createSession with a verified interpreter and current settings.
        kernelSpec: this.env.buildKernelSpec(inst, getPythonExecutable())
      }
    };
  }
  async *discoverAllRuntimes() {
    try {
      for (const inst of findInstallations()) {
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
  /** Announces installations that appeared since the last discovery (e.g. after stataHome changed). */
  rediscover() {
    for (const inst of findInstallations()) {
      const metadata = this.buildRuntimeMetadata(inst);
      if (!this._discoveredRuntimes.has(metadata.runtimeId)) {
        this._discoveredRuntimes.set(metadata.runtimeId, metadata);
        this._discoverEmitter.fire(metadata);
      }
    }
  }
  // `Immediate` starts a session as soon as Positron sees the runtime, so it is
  // reserved for workspaces that actually contain Stata files.
  async recommendedWorkspaceRuntime() {
    if (!await workspaceHasStataFiles()) {
      return void 0;
    }
    const [preferred] = findInstallations();
    return preferred ? this.buildRuntimeMetadata(preferred, positron2.LanguageRuntimeStartupBehavior.Immediate) : void 0;
  }
  /** Stored metadata from an older session/extension version is refreshed from current discovery. */
  async validateMetadata(metadata) {
    const inst = findInstallations().find((i) => runtimeIdFor(i) === metadata.runtimeId);
    if (!inst) {
      throw new Error(`${metadata.runtimeName} is no longer installed. Set positron-stata.stataHome if Stata moved.`);
    }
    return this.buildRuntimeMetadata(inst, metadata.startupBehavior);
  }
  async validateSession(sessionId) {
    try {
      const supervisorExt = vscode2.extensions.getExtension("positron.positron-supervisor");
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
    const supervisorApi = await this.supervisor();
    if (typeof supervisorApi.restoreSession === "function") {
      return await supervisorApi.restoreSession(
        runtimeMetadata,
        sessionMetadata,
        initialDynState(sessionName || runtimeMetadata.runtimeName)
      );
    }
    return await this.createSession(runtimeMetadata, sessionMetadata);
  }
  async createSession(runtimeMetadata, sessionMetadata) {
    const supervisorApi = await this.supervisor();
    const extraData = runtimeMetadata.extraRuntimeData || {};
    const inst = extraData.installation ?? findInstallations().find((i) => runtimeIdFor(i) === runtimeMetadata.runtimeId);
    if (inst && inst.hasPyStata === false) {
      throw new Error(
        `PyStata was not found in ${inst.homeDir}/utilities. Positron needs Stata 17 or newer; if Stata is installed elsewhere, set positron-stata.stataHome.`
      );
    }
    const python = await this.env.requirePython();
    const kernelSpec = inst ? this.env.buildKernelSpec(inst, python) : extraData.kernelSpec && { ...extraData.kernelSpec, argv: [python, ...extraData.kernelSpec.argv.slice(1)] };
    if (!kernelSpec) {
      throw new Error(`No kernelSpec configured for runtime: ${runtimeMetadata.runtimeName}`);
    }
    const session = await supervisorApi.createSession(
      runtimeMetadata,
      sessionMetadata,
      kernelSpec,
      initialDynState(runtimeMetadata.runtimeName)
    );
    this.watchForStartupFailure(session);
    return session;
  }
  watchForStartupFailure(session) {
    let ready = false;
    const subs = [];
    subs.push(session.onDidChangeRuntimeState((state) => {
      if (state === positron2.RuntimeState.Ready || state === positron2.RuntimeState.Idle) ready = true;
    }));
    subs.push(session.onDidEndSession((exit) => {
      subs.forEach((s) => s.dispose());
      const failed = exit.reason === positron2.RuntimeExitReason.StartupFailed || !ready && !INTENTIONAL_EXITS.has(exit.reason);
      if (!failed) return;
      this.env.log(`Stata session failed to start (${exit.reason}, exit code ${exit.exit_code}): ${exit.message}`);
      void vscode2.window.showErrorMessage(`Stata failed to start${exit.message ? `: ${exit.message}` : "."}`, "Diagnose", "Set Up Python Environment").then((choice) => {
        if (choice === "Diagnose") void this.env.diagnose();
        else if (choice === "Set Up Python Environment") void this.env.setupEnvironment();
      });
    }));
    this.context.subscriptions.push(...subs);
  }
  async supervisor() {
    const supervisorExt = vscode2.extensions.getExtension("positron.positron-supervisor");
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
    return supervisorApi;
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
var vscode3 = __toESM(require("vscode"));
var path6 = __toESM(require("path"));
var fs5 = __toESM(require("fs"));
var os2 = __toESM(require("os"));
var crypto = __toESM(require("crypto"));
var import_child_process3 = require("child_process");
function convertDtaToParquet(filePath, cachedParquetPath) {
  const pythonBin = getPythonExecutable();
  const pythonScript = `
import os
import sys

src = sys.argv[1]
dst = sys.argv[2]

def convert_chunked():
    import pandas as pd
    import pyarrow as pa
    import pyarrow.parquet as pq
    writer = None
    try:
        with pd.read_stata(src, chunksize=200_000) as reader:
            for chunk in reader:
                table = pa.Table.from_pandas(chunk, preserve_index=False)
                if writer is None:
                    writer = pq.ParquetWriter(dst, table.schema)
                else:
                    # A chunk whose column is all-missing infers a different type.
                    table = table.cast(writer.schema)
                writer.write_table(table)
    finally:
        if writer is not None:
            writer.close()
    if writer is None:
        pd.read_stata(src).to_parquet(dst, index=False)

try:
    try:
        convert_chunked()
    except Exception:
        if os.path.exists(dst):
            os.remove(dst)
        import pandas as pd
        pd.read_stata(src).to_parquet(dst, index=False)
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
  return new Promise((resolve2, reject) => {
    (0, import_child_process3.execFile)(pythonBin, ["-c", pythonScript, filePath, cachedParquetPath], (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve2();
      }
    });
  });
}
async function openDtaInNativeDataExplorer(dtaUri, _context) {
  const filePath = dtaUri.fsPath;
  const fileName = path6.basename(filePath);
  const hash = crypto.createHash("md5").update(filePath).digest("hex").substring(0, 8);
  const datasetDir = path6.join(os2.tmpdir(), "positron-stata-cache", hash);
  if (!fs5.existsSync(datasetDir)) {
    fs5.mkdirSync(datasetDir, { recursive: true });
  }
  const baseName = path6.parse(filePath).name;
  const cachedParquetPath = path6.join(datasetDir, `${baseName}.parquet`);
  let needsConvert = true;
  if (fs5.existsSync(cachedParquetPath)) {
    try {
      const dtaStat = fs5.statSync(filePath);
      const parquetStat = fs5.statSync(cachedParquetPath);
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
      if (fs5.existsSync(cachedParquetPath)) {
        try {
          fs5.unlinkSync(cachedParquetPath);
        } catch {
        }
      }
      throw new Error(`Failed to convert .dta file for Data Explorer: ${err.message}`);
    }
  }
  const parquetUri = vscode3.Uri.file(cachedParquetPath);
  try {
    await vscode3.commands.executeCommand(
      "vscode.openWith",
      parquetUri,
      "workbench.editor.positronDataExplorer"
    );
  } catch {
    await vscode3.commands.executeCommand("vscode.open", parquetUri);
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
    return vscode3.window.registerCustomEditorProvider(
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
    const fileName = escapeHtml(path6.basename(document.uri.fsPath));
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

// src/completion.ts
var vscode4 = __toESM(require("vscode"));
var positron3 = __toESM(require("positron"));

// src/stataCommands.ts
var COMMAND_ROWS = [
  // ---- Data management -------------------------------------------------
  ["use", "", "data", "use [varlist] [if] [in] using filename [, clear nolabel]", "Load a Stata dataset (.dta) into memory."],
  ["save", "sa", "data", "save [filename] [, replace nolabel emptyok]", "Save the dataset in memory to disk."],
  ["saveold", "", "data", "saveold filename [, version(#) replace]", "Save dataset in a format readable by older Stata versions."],
  ["sysuse", "", "data", 'sysuse ["]filename["] [, clear]', "Load an example dataset shipped with Stata (e.g. `sysuse auto`)."],
  ["webuse", "", "data", 'webuse ["]filename["] [, clear]', "Load an example dataset from the Stata website."],
  ["clear", "", "data", "clear [all | mata | results | matrix | programs | ado | frames]", "Clear data and/or other objects from memory."],
  ["describe", "d", "data", "describe [varlist] [, short fullnames numbers]", "Describe the dataset in memory or a file."],
  ["codebook", "", "data", "codebook [varlist] [if] [in] [, compact problems]", "Describe data contents in detail."],
  ["inspect", "", "data", "inspect [varlist] [if] [in]", "Display simple summary of data attributes."],
  ["lookfor", "", "data", "lookfor string [string ...]", "Search variable names and labels for a string."],
  ["list", "l", "data", "list [varlist] [if] [in] [, noobs clean separator(#) abbreviate(#)]", "List values of variables."],
  ["browse", "br", "data", "browse [varlist] [if] [in] [, nolabel]", "Open the dataset in the Data Explorer (read-only)."],
  ["edit", "ed", "data", "edit [varlist] [if] [in] [, nolabel]", "Open the data editor."],
  ["count", "cou", "data", "count [if] [in]", "Count observations satisfying a condition. Result in `r(N)`."],
  ["generate", "g", "data", "generate [type] newvar[:lblname] = exp [if] [in] [, before(varname) after(varname)]", "Create a new variable."],
  ["replace", "", "data", "replace oldvar = exp [if] [in] [, nopromote]", "Replace contents of an existing variable."],
  ["egen", "", "data", "egen [type] newvar = fcn(arguments) [if] [in] [, options]", "Extensions to generate (group, mean, total, rank, tag, rowmean, ...)."],
  ["drop", "", "data", "drop varlist | drop if exp | drop in range", "Drop variables or observations."],
  ["keep", "", "data", "keep varlist | keep if exp | keep in range", "Keep variables or observations."],
  ["rename", "ren", "data", "rename old new | rename (old1 old2 ...) (new1 new2 ...)", "Rename one or more variables."],
  ["order", "", "data", "order varlist [, first last before(varname) after(varname) alphabetic]", "Reorder variables in the dataset."],
  ["sort", "", "data", "sort varlist [in] [, stable]", "Sort data in ascending order."],
  ["gsort", "", "data", "gsort [+|-]varname [[+|-]varname ...] [, generate(newvar) mfirst]", "Sort in ascending or descending order."],
  ["label", "la", "data", 'label variable varname "label" | label define lblname # "label" ... | label values varlist lblname', "Manipulate variable and value labels."],
  ["labelbook", "", "data", "labelbook [lblname-list] [, problems detail]", "Describe value labels."],
  ["numlabel", "", "data", "numlabel [lblnamelist], {add|remove} [mask(str)]", "Add or remove numeric values from value labels."],
  ["notes", "", "data", "notes [evarname]: text", "Place notes in the dataset."],
  ["format", "", "data", "format varlist %fmt", "Set the display format of variables."],
  ["recast", "", "data", "recast type varlist [, force]", "Change storage type of variables."],
  ["compress", "", "data", "compress [varlist]", "Compress data in memory by demoting storage types."],
  ["destring", "", "data", 'destring [varlist], {generate(newvarlist)|replace} [ignore("chars") force]', "Convert string variables to numeric."],
  ["tostring", "", "data", "tostring varlist, {generate(newvarlist)|replace} [format(%fmt) force]", "Convert numeric variables to string."],
  ["encode", "", "data", "encode varname [if] [in], generate(newvar) [label(name) noextend]", "Encode a string variable into a labeled numeric variable."],
  ["decode", "", "data", "decode varname [if] [in], generate(newvar) [maxlength(#)]", "Create a string variable from a labeled numeric variable."],
  ["recode", "", "data", "recode varlist (rule) [(rule) ...] [, generate(newvar) prefix(str)]", "Recode categorical variables."],
  ["mvencode", "", "data", "mvencode varlist [if] [in], mv(# | mvc=# [\\ ...]) [override]", "Change missing values to numeric values."],
  ["mvdecode", "", "data", "mvdecode varlist [if] [in], mv(numlist | numlist=mvc [\\ ...])", "Change numeric values to missing."],
  ["merge", "", "data", "merge {1:1|m:1|1:m|m:m} varlist using filename [, keep() keepusing() generate() nogenerate update replace]", "Merge datasets."],
  ["append", "", "data", "append using filename [filename ...] [, generate(newvar) keep(varlist) force]", "Append datasets."],
  ["joinby", "", "data", "joinby [varlist] using filename [, unmatched(none|both|master|using)]", "Form all pairwise combinations within groups."],
  ["cross", "", "data", "cross using filename", "Form every pairwise combination of two datasets."],
  ["reshape", "", "data", "reshape {long|wide} stubnames, i(varlist) j(varname) [string]", "Convert data between wide and long form."],
  ["collapse", "", "data", "collapse clist [if] [in] [weight] [, by(varlist) cw fast]", "Make dataset of summary statistics (e.g. `(mean) x (sum) y`)."],
  ["contract", "", "data", "contract varlist [if] [in] [weight] [, freq(newvar) percent(newvar) zero]", "Make dataset of frequencies and percentages."],
  ["expand", "", "data", "expand [=]exp [if] [in] [, generate(newvar)]", "Duplicate observations."],
  ["fillin", "", "data", "fillin varlist", "Rectangularize dataset."],
  ["xpose", "", "data", "xpose, clear [varname format(%fmt)]", "Interchange observations and variables."],
  ["stack", "", "data", "stack varlist [if] [in], into(newvars) [clear wide]", "Stack data."],
  ["sample", "", "data", "sample # [if] [in] [, count by(groupvars)]", "Draw a random sample."],
  ["duplicates", "", "data", "duplicates {report|examples|list|tag|drop} [varlist] [, force generate(newvar)]", "Report, tag, or drop duplicate observations."],
  ["isid", "", "data", "isid varlist [using filename] [, sort missok]", "Check whether variables uniquely identify observations."],
  ["levelsof", "", "data", "levelsof varname [if] [in] [, clean local(macname) separate(sep) missing]", "Store the distinct values of a variable in a macro."],
  ["split", "", "data", "split strvar [if] [in] [, generate(stub) parse(pchars) destring]", "Split a string variable into parts."],
  ["separate", "", "data", "separate varname [if] [in], by(byvar|exp) [generate(stubname)]", "Create separate variables by group."],
  ["clonevar", "", "data", "clonevar newvar = varname [if] [in]", "Clone an existing variable, including labels and formats."],
  ["corr2data", "", "data", "corr2data newvarlist [, n(#) means(vector) corr(matrix)]", "Create dataset with specified correlation structure."],
  ["drawnorm", "", "data", "drawnorm newvarlist [, n(#) means(vector) corr(matrix) sds(vector) seed(#)]", "Draw a sample from a multivariate normal distribution."],
  ["set", "", "utility", "set setting value", "Set Stata system parameters (e.g. `set obs`, `set seed`, `set more off`)."],
  ["input", "", "data", "input [type] varname [type varname ...]", "Enter data from the keyboard/do-file, terminated by `end`."],
  ["insheet", "", "files", "insheet [varlist] using filename [, comma tab names clear]", "Read text data (superseded by `import delimited`)."],
  ["infile", "", "files", "infile varlist using filename [if] [in] [, clear]", "Read unformatted text data."],
  ["infix", "", "files", "infix using dfilename [if] [in] [, using(filename) clear]", "Read fixed-format text data."],
  ["import", "", "files", "import {delimited|excel|sas|spss|fred|haver} [using] filename [, clear options]", "Import data from other formats (CSV, Excel, SAS, SPSS, ...)."],
  ["export", "", "files", "export {delimited|excel|sasxport8} [varlist] using filename [if] [in] [, replace options]", "Export data to other formats."],
  ["outsheet", "", "files", "outsheet [varlist] using filename [if] [in] [, comma replace]", "Write text data (superseded by `export delimited`)."],
  ["odbc", "", "files", 'odbc load [extvarlist] [if] [in], {table("TableName")|exec("SqlStmt")} [dsn("DsnName") clear]', "Load, write, or view data from ODBC sources."],
  ["tsset", "", "panel", "tsset [panelvar] timevar [, format(%fmt) delta(#)]", "Declare data to be time-series data."],
  ["tsfill", "", "panel", "tsfill [, full]", "Fill in gaps in time variable."],
  ["xtset", "", "panel", "xtset panelvar [timevar] [, delta(#)]", "Declare data to be panel data."],
  ["xtdescribe", "xtdes", "panel", "xtdescribe [if] [in] [, patterns(#) width(#)]", "Describe pattern of panel data."],
  ["xtsum", "", "panel", "xtsum [varlist] [if]", "Summarize panel data (overall, between, within)."],
  ["xttab", "", "panel", "xttab varname [if]", "Tabulate panel data."],
  ["xtline", "", "panel", "xtline varlist [if] [in] [, overlay i(varname) t(varname)]", "Panel-data line plots."],
  ["mi", "", "data", "mi {set|register|impute|estimate|describe|...} ...", "Multiple imputation suite."],
  ["char", "", "data", 'char evarname[charname] ["text"]', "Define characteristics of variables or the dataset."],
  ["assert", "", "programming", "assert exp [if] [in] [, rc0 null fast]", "Verify that an expression is true for all observations."],
  ["preserve", "", "programming", "preserve", "Preserve data so it can be restored later with `restore`."],
  ["restore", "", "programming", "restore [, not preserve]", "Restore data saved with `preserve`."],
  ["snapshot", "", "programming", 'snapshot {save|restore #|list|erase} [, label("label")]', "Save and restore data snapshots."],
  // ---- Summary statistics & tables --------------------------------------
  ["summarize", "su", "reporting", "summarize [varlist] [if] [in] [weight] [, detail meanonly format separator(#)]", "Summary statistics. Results stored in `r()`."],
  ["tabulate", "ta", "reporting", "tabulate varname [varname] [if] [in] [weight] [, missing row col cell chi2 nofreq generate(stub)]", "One- and two-way tables of frequencies."],
  ["tab1", "", "reporting", "tab1 varlist [if] [in] [weight] [, missing]", "One-way tables for each variable."],
  ["tab2", "", "reporting", "tab2 varlist [if] [in] [weight] [, options]", "All possible two-way tabulations."],
  ["tabstat", "", "reporting", "tabstat varlist [if] [in] [weight] [, statistics(statname ...) by(varname) columns(variables|statistics)]", "Compact table of summary statistics."],
  ["table", "", "reporting", "table (rowvars) (colvars) [(tabvars)] [if] [in] [weight] [, statistic(stat varlist) nototals]", "Tables of frequencies, summaries, and command results (Stata 17+ collect-based)."],
  ["dtable", "", "reporting", "dtable [varlist] [if] [in] [weight] [, by(varname) export(filename)]", 'Create a table of descriptive statistics ("Table 1").'],
  ["etable", "", "reporting", "etable [, estimates(namelist) column(spec) cstat(stat) export(filename)]", "Create a table of estimation results."],
  ["collect", "", "reporting", "collect [get|style|layout|export|preview|label|dims|levelsof|clear] ...", "Collect and customize results from Stata commands into tables."],
  ["correlate", "cor", "reporting", "correlate [varlist] [if] [in] [weight] [, means covariance]", "Correlations (covariances) of variables."],
  ["pwcorr", "", "reporting", "pwcorr [varlist] [if] [in] [weight] [, obs sig star(#) bonferroni]", "Pairwise correlation coefficients."],
  ["spearman", "", "reporting", "spearman [varlist] [if] [in] [, stats(list)]", "Spearman rank correlation."],
  ["ttest", "", "reporting", "ttest varname == # [if] [in] | ttest varname [if] [in], by(groupvar) [unequal]", "Mean-comparison t tests."],
  ["prtest", "", "reporting", "prtest varname == #p [if] [in] [, level(#)]", "Tests of proportions."],
  ["ranksum", "", "reporting", "ranksum varname [if] [in], by(groupvar)", "Wilcoxon rank-sum (Mann-Whitney) test."],
  ["signrank", "", "reporting", "signrank varname = exp [if] [in]", "Wilcoxon matched-pairs signed-rank test."],
  ["kwallis", "", "reporting", "kwallis varname [if] [in], by(groupvar)", "Kruskal-Wallis equality-of-populations rank test."],
  ["ci", "", "reporting", "ci {means|proportions|variances} [varlist] [if] [in] [, level(#)]", "Confidence intervals."],
  ["mean", "", "reporting", "mean varlist [if] [in] [weight] [, over(varlist) vce(vcetype)]", "Estimate means with standard errors."],
  ["proportion", "", "reporting", "proportion varlist [if] [in] [weight] [, over(varlist)]", "Estimate proportions."],
  ["total", "", "reporting", "total varlist [if] [in] [weight] [, over(varlist)]", "Estimate totals."],
  ["centile", "", "reporting", "centile [varlist] [if] [in] [, centile(numlist)]", "Report centile and confidence interval."],
  ["pctile", "", "reporting", "pctile [type] newvar = exp [if] [in] [weight] [, nquantiles(#) genp(newvar)]", "Create variable containing percentiles."],
  ["xtile", "", "reporting", "xtile newvar = exp [if] [in] [weight] [, nquantiles(#) cutpoints(varname)]", "Create variable containing quantile categories."],
  ["histogram", "hist", "graphics", "histogram varname [if] [in] [weight] [, bin(#) width(#) discrete percent frequency normal kdensity]", "Histograms for continuous and categorical variables."],
  // ---- Estimation --------------------------------------------------------
  ["regress", "reg", "estimation", "regress depvar [indepvars] [if] [in] [weight] [, noconstant vce(robust|cluster clustvar) level(#) beta]", "Linear regression (OLS)."],
  ["areg", "", "estimation", "areg depvar [indepvars] [if] [in] [weight], absorb(varname) [vce(vcetype)]", "Linear regression with a large dummy-variable set."],
  ["ivregress", "", "estimation", "ivregress {2sls|liml|gmm} depvar [varlist1] (varlist2 = varlist_iv) [if] [in] [weight] [, vce(vcetype) first]", "Single-equation instrumental-variables regression."],
  ["logit", "", "estimation", "logit depvar [indepvars] [if] [in] [weight] [, or vce(vcetype)]", "Logistic regression, reporting coefficients."],
  ["logistic", "", "estimation", "logistic depvar indepvars [if] [in] [weight] [, vce(vcetype)]", "Logistic regression, reporting odds ratios."],
  ["probit", "", "estimation", "probit depvar [indepvars] [if] [in] [weight] [, vce(vcetype)]", "Probit regression."],
  ["mlogit", "", "estimation", "mlogit depvar [indepvars] [if] [in] [weight] [, baseoutcome(#) rrr]", "Multinomial (polytomous) logistic regression."],
  ["ologit", "", "estimation", "ologit depvar [indepvars] [if] [in] [weight] [, or]", "Ordered logistic regression."],
  ["oprobit", "", "estimation", "oprobit depvar [indepvars] [if] [in] [weight]", "Ordered probit regression."],
  ["clogit", "", "estimation", "clogit depvar [indepvars] [if] [in] [weight], group(varname) [or]", "Conditional (fixed-effects) logistic regression."],
  ["poisson", "", "estimation", "poisson depvar [indepvars] [if] [in] [weight] [, exposure(varname) offset(varname) irr]", "Poisson regression."],
  ["nbreg", "", "estimation", "nbreg depvar [indepvars] [if] [in] [weight] [, exposure(varname) irr]", "Negative binomial regression."],
  ["zip", "", "estimation", "zip depvar [indepvars] [if] [in] [weight], inflate(varlist[, offset(varname)]|_cons)", "Zero-inflated Poisson regression."],
  ["tobit", "", "estimation", "tobit depvar [indepvars] [if] [in] [weight] [, ll[(#)] ul[(#)]]", "Tobit regression."],
  ["truncreg", "", "estimation", "truncreg depvar [indepvars] [if] [in] [weight] [, ll(varname|#) ul(varname|#)]", "Truncated regression."],
  ["heckman", "", "estimation", "heckman depvar [indepvars], select([depvar_s =] varlist_s) [twostep]", "Heckman selection model."],
  ["glm", "", "estimation", "glm depvar [indepvars] [if] [in] [weight] [, family(familyname) link(linkname) vce(vcetype)]", "Generalized linear models."],
  ["qreg", "", "estimation", "qreg depvar [indepvars] [if] [in] [weight] [, quantile(#) vce(vcetype)]", "Quantile regression."],
  ["sqreg", "", "estimation", "sqreg depvar [indepvars] [if] [in] [, quantiles(#[#...]) reps(#)]", "Simultaneous-quantile regression."],
  ["rreg", "", "estimation", "rreg depvar [indepvars] [if] [in] [, genwt(newvar)]", "Robust regression."],
  ["nl", "", "estimation", "nl (depvar = <sexp>) [if] [in] [weight] [, options]", "Nonlinear least-squares estimation."],
  ["ml", "", "estimation", "ml model method progname (eq) ... | ml maximize", "Maximum likelihood estimation."],
  ["gmm", "", "estimation", "gmm (eqname: <mexp>) [if] [in] [weight], instruments(varlist) [options]", "Generalized method of moments estimation."],
  ["sureg", "", "estimation", "sureg (depvar1 varlist1) (depvar2 varlist2) ... [if] [in] [weight]", "Zellner's seemingly unrelated regression."],
  ["reg3", "", "estimation", "reg3 (depvar1 varlist1) (depvar2 varlist2) ... [if] [in] [weight]", "Three-stage estimation for systems of simultaneous equations."],
  ["mvreg", "", "estimation", "mvreg depvars = indepvars [if] [in] [weight]", "Multivariate regression."],
  ["anova", "", "estimation", "anova varname [termlist] [if] [in] [weight] [, repeated(varlist)]", "Analysis of variance and covariance."],
  ["oneway", "", "estimation", "oneway response_var factor_var [if] [in] [weight] [, bonferroni tabulate]", "One-way analysis of variance."],
  ["manova", "", "estimation", "manova depvarlist = termlist [if] [in] [weight]", "Multivariate analysis of variance and covariance."],
  ["newey", "", "estimation", "newey depvar [indepvars] [if] [in] [weight], lag(#) [noconstant]", "Regression with Newey-West standard errors."],
  ["prais", "", "estimation", "prais depvar [indepvars] [if] [in] [, corc twostep rhotype(rhomethod)]", "Prais-Winsten and Cochrane-Orcutt regression."],
  ["arima", "", "estimation", "arima depvar [indepvars] [if] [in] [weight] [, arima(#p,#d,#q) ar(numlist) ma(numlist)]", "ARIMA, ARMAX, and other dynamic regression models."],
  ["arch", "", "estimation", "arch depvar [indepvars] [if] [in] [weight] [, arch(numlist) garch(numlist)]", "Autoregressive conditional heteroskedasticity family of estimators."],
  ["var", "", "estimation", "var depvarlist [if] [in] [, lags(numlist) exog(varlist)]", "Vector autoregressive models."],
  ["vec", "", "estimation", "vec varlist [if] [in] [, rank(#) lags(#) trend(trend)]", "Vector error-correction models."],
  ["xtreg", "", "panel", "xtreg depvar [indepvars] [if] [in] [weight] [, fe | re | be | mle | pa] [vce(vcetype)]", "Fixed-, between-, and random-effects linear panel models."],
  ["xtlogit", "", "panel", "xtlogit depvar [indepvars] [if] [in] [weight] [, fe | re | pa]", "Panel-data logit models."],
  ["xtprobit", "", "panel", "xtprobit depvar [indepvars] [if] [in] [weight] [, re | pa]", "Panel-data probit models."],
  ["xtpoisson", "", "panel", "xtpoisson depvar [indepvars] [if] [in] [weight] [, fe | re | pa]", "Panel-data Poisson models."],
  ["xtivreg", "", "panel", "xtivreg depvar [varlist1] (varlist2 = varlist_iv) [if] [in] [, fe | re | be | fd]", "Instrumental variables panel-data models."],
  ["xtabond", "", "panel", "xtabond depvar [indepvars] [if] [in] [, lags(#) maxldep(#) twostep vce(robust)]", "Arellano-Bond linear dynamic panel-data estimation."],
  ["xtgls", "", "panel", "xtgls depvar [indepvars] [if] [in] [weight] [, panels(iid|heteroskedastic|correlated) corr(independent|ar1|psar1)]", "Panel-data models using GLS."],
  ["xtmixed", "", "panel", "xtmixed depvar fe_eqn [|| re_eqn] [, options]", "Multilevel mixed-effects linear regression (old name for `mixed`)."],
  ["xtdidregress", "", "panel", "xtdidregress (ovar omvarlist) (tvar) [if] [in] [weight], group(gvar) time(tmvar)", "Difference-in-differences estimation for panel data."],
  ["didregress", "", "estimation", "didregress (ovar omvarlist) (tvar) [if] [in] [weight], group(gvar) time(tmvar)", "Difference-in-differences estimation for repeated cross-sections."],
  ["mixed", "", "estimation", "mixed depvar fe_eqn [|| re_eqn] [|| re_eqn] [if] [in] [weight] [, options]", "Multilevel mixed-effects linear regression."],
  ["melogit", "", "estimation", "melogit depvar fe_eqn [|| re_eqn] [, options]", "Multilevel mixed-effects logistic regression."],
  ["meglm", "", "estimation", "meglm depvar fe_eqn [|| re_eqn] [, family(family) link(link)]", "Multilevel mixed-effects generalized linear model."],
  ["sem", "", "estimation", "sem paths [if] [in] [weight] [, options]", "Structural equation model estimation."],
  ["gsem", "", "estimation", "gsem paths [if] [in] [weight] [, options]", "Generalized structural equation model estimation."],
  ["factor", "", "estimation", "factor varlist [if] [in] [weight] [, pf | pcf | ipf | ml] [factors(#)]", "Factor analysis."],
  ["pca", "", "estimation", "pca varlist [if] [in] [weight] [, components(#) mineigen(#)]", "Principal component analysis."],
  ["cluster", "", "estimation", "cluster {kmeans|kmedians|singlelinkage|...} [varlist] [, k(#) name(clname)]", "Cluster analysis of a dataset."],
  ["teffects", "", "estimation", "teffects {ra|ipw|ipwra|aipw|nnmatch|psmatch} (ovar omvarlist) (tvar tmvarlist) [, ate atet]", "Treatment-effects estimation for observational data."],
  ["stteffects", "", "survival", "stteffects {ra|ipw|ipwra|wra} (omvarlist) (tvar tmvarlist) [, options]", "Treatment-effects estimation for survival-time data."],
  ["lasso", "", "estimation", "lasso {linear|logit|probit|poisson} depvar [(alwaysvars)] othervars [if] [in] [, selection(cv|adaptive|plugin)]", "Lasso for prediction and model selection."],
  ["dsregress", "", "estimation", "dsregress depvar varsofinterest [if] [in], controls([(alwaysvars)] othervars)", "Double-selection lasso linear regression."],
  ["bayes", "", "prefix", "bayes [, bayesopts] : estimation_command", "Bayesian regression models using the `bayes` prefix."],
  ["stset", "", "survival", "stset timevar [if] [weight] [, failure(failvar[==numlist]) id(idvar) origin() enter() exit()]", "Declare data to be survival-time data."],
  ["stcox", "", "survival", "stcox [varlist] [if] [in] [, nohr strata(varnames) vce(vcetype)]", "Cox proportional hazards model."],
  ["streg", "", "survival", "streg [varlist] [if] [in] [, distribution(exponential|weibull|gompertz|...) nohr]", "Parametric survival models."],
  ["sts", "", "survival", "sts {graph|list|test|generate} [varlist] [if] [in] [, by(varlist)]", "Kaplan-Meier survivor function: graph, list, test, generate."],
  ["stsplit", "", "survival", "stsplit newvar [if], {at(numlist)|every(#)}", "Split and join time-span records."],
  ["svyset", "", "estimation", "svyset [psu] [weight] [, strata(varname) fpc(varname) vce(linearized|brr|jackknife)]", "Declare survey design for dataset."],
  // ---- Postestimation ----------------------------------------------------
  ["predict", "", "postestimation", "predict [type] newvar [if] [in] [, xb stdp residuals pr]", "Obtain predictions, residuals, etc., after estimation."],
  ["margins", "", "postestimation", "margins [marginlist] [if] [in] [weight] [, dydx(varlist) at(atspec) atmeans post]", "Marginal means, predictive margins, and marginal effects."],
  ["marginsplot", "", "postestimation", "marginsplot [, recast(plottype) xdimension(dimlist) noci]", "Graph results from margins."],
  ["test", "", "postestimation", "test coeflist | test exp = exp [= ...] [, accumulate notest]", "Wald tests of simple and composite linear hypotheses."],
  ["testparm", "", "postestimation", "testparm varlist [, equal equation(eqname)]", "Test that coefficients of listed variables are zero."],
  ["testnl", "", "postestimation", "testnl exp = exp [= exp ...]", "Test nonlinear hypotheses after estimation."],
  ["lincom", "", "postestimation", "lincom exp [, level(#) eform]", "Linear combinations of parameters."],
  ["nlcom", "", "postestimation", "nlcom [name:]exp [, level(#) post]", "Nonlinear combinations of estimators."],
  ["contrast", "", "postestimation", "contrast termlist [, overall effects]", "Contrasts and linear hypothesis tests after estimation."],
  ["pwcompare", "", "postestimation", "pwcompare marginlist [, mcompare(method) effects]", "Pairwise comparisons."],
  ["estat", "", "postestimation", "estat subcommand [, options]", "Postestimation statistics (ic, vce, summarize, hettest, ovtest, firststage, ...)."],
  ["estimates", "est", "postestimation", "estimates {store|restore|table|stats|dir|drop|save|use|replay} [namelist] [, options]", "Save and manipulate estimation results."],
  ["hausman", "", "postestimation", "hausman name-consistent [name-efficient] [, sigmamore constant]", "Hausman specification test."],
  ["lrtest", "", "postestimation", "lrtest modelspec1 [modelspec2] [, stats force]", "Likelihood-ratio test after estimation."],
  ["suest", "", "postestimation", "suest namelist [, vce(vcetype)]", "Seemingly unrelated estimation."],
  ["linktest", "", "postestimation", "linktest [if] [in]", "Specification link test for single-equation models."],
  ["rvfplot", "", "postestimation", "rvfplot [, options]", "Residual-versus-fitted plot."],
  ["avplot", "", "postestimation", "avplot indepvar [, options]", "Added-variable plot."],
  ["bootstrap", "", "prefix", "bootstrap exp_list [, reps(#) seed(#) cluster(varlist)] : command", "Bootstrap sampling and estimation."],
  ["jackknife", "", "prefix", "jackknife exp_list [, cluster(varlist)] : command", "Jackknife estimation."],
  ["permute", "", "prefix", "permute permvar exp_list [, reps(#) seed(#)] : command", "Monte Carlo permutation tests."],
  ["simulate", "", "prefix", "simulate [exp_list], reps(#) [seed(#) saving(filename)] : command", "Monte Carlo simulations."],
  ["statsby", "", "prefix", "statsby [exp_list] [, by(varlist) clear saving(filename)] : command", "Collect statistics for a command across a by list."],
  ["rolling", "", "prefix", "rolling [exp_list] [if] [in], window(#) [recursive saving(filename)] : command", "Rolling-window and recursive estimation."],
  ["svy", "", "prefix", "svy [vcetype] [, svy_options] : command", "Survey data analysis prefix."],
  ["xi", "", "prefix", "xi [, prefix(string)] : command ... i.varname ...", "Interaction expansion (largely superseded by factor variables)."],
  ["nestreg", "", "prefix", "nestreg [, lr waldtable] : command_name depvar (varlist) (varlist) ...", "Nested model statistics."],
  ["stepwise", "", "prefix", "stepwise [, pr(#) pe(#)] : command", "Stepwise estimation."],
  ["fvset", "", "utility", "fvset {base|design|clear|report} ...", "Declare factor-variable settings."],
  // ---- Graphics ----------------------------------------------------------
  ["graph", "gr", "graphics", "graph {twoway|bar|box|pie|matrix|dot|combine|export|save|use|display|drop} ...", "Draw, combine, and export graphs."],
  ["twoway", "tw", "graphics", "twoway (plottype varlist [if] [in] [, options]) (...) [, twoway_options]", "Two-way graphs (scatter, line, area, bar, lfit, ...)."],
  ["scatter", "sc", "graphics", "scatter varlist [if] [in] [weight] [, marker_options twoway_options]", "Two-way scatterplot."],
  ["line", "", "graphics", "line varlist [if] [in] [, connect_options twoway_options]", "Two-way line plot."],
  ["connected", "", "graphics", "twoway connected varlist [if] [in] [, options]", "Two-way connected plot."],
  ["lfit", "", "graphics", "twoway lfit yvar xvar [if] [in] [weight] [, options]", "Two-way linear prediction plot."],
  ["qfit", "", "graphics", "twoway qfit yvar xvar [if] [in] [weight] [, options]", "Two-way quadratic prediction plot."],
  ["kdensity", "", "graphics", "kdensity varname [if] [in] [weight] [, kernel(kernel) bwidth(#) normal]", "Univariate kernel density estimation."],
  ["lowess", "", "graphics", "lowess yvar xvar [if] [in] [, bwidth(#) generate(newvar)]", "Lowess smoothing."],
  ["tsline", "", "graphics", "tsline varlist [if] [in] [, tsline_options]", "Time-series line plots."],
  ["qnorm", "", "graphics", "qnorm varname [if] [in] [, grid]", "Quantile-normal plot."],
  ["pnorm", "", "graphics", "pnorm varname [if] [in] [, grid]", "Standardized normal probability plot."],
  ["binscatter", "", "community", "binscatter y_var x_var [if] [in] [weight] [, by(varname) nquantiles(#) controls(varlist) absorb(varname) linetype(lfit|qfit|connect|none)]", "Binned scatterplots (SSC: `ssc install binscatter`)."],
  ["binsreg", "", "community", "binsreg depvar indvar [othercovs] [if] [in] [weight] [, by(varname) nbins(#) ci() cb()]", "Data-driven binscatter estimation and inference (SSC)."],
  ["coefplot", "", "community", "coefplot [modellist] [, keep(coeflist) drop(coeflist) vertical xline(0) ci(spec)]", "Plot regression coefficients (SSC: `ssc install coefplot`)."],
  ["grstyle", "", "community", "grstyle {init|set|clear} ...", "Customize graph scheme settings on the fly (SSC)."],
  // ---- Community-contributed estimation & reporting ----------------------
  ["reghdfe", "", "community", "reghdfe depvar [indepvars] [if] [in] [weight], absorb(absvars) [vce(robust|cluster clustervars) residuals(newvar)]", "Linear regression absorbing multiple levels of fixed effects (SSC: `ssc install reghdfe`)."],
  ["ivreghdfe", "", "community", "ivreghdfe depvar [varlist1] (varlist2 = instlist) [if] [in] [weight], absorb(absvars) [cluster(vars) first]", "IV/2SLS/GMM with multiple fixed effects (ivreg2 + reghdfe)."],
  ["ppmlhdfe", "", "community", "ppmlhdfe depvar [indepvars] [if] [in] [weight], absorb(absvars) [exposure(varname) vce(cluster clustvar) d(newvar)]", "Poisson pseudo-maximum likelihood with multiple fixed effects (SSC)."],
  ["ivreg2", "", "community", "ivreg2 depvar [varlist1] (varlist2 = varlist_iv) [if] [in] [weight] [, gmm2s liml robust cluster(varlist) first endog()]", "Extended IV/2SLS, GMM and AC/HAC, LIML and k-class regression (SSC)."],
  ["xtivreg2", "", "community", "xtivreg2 depvar [varlist1] (varlist2 = varlist_iv) [if] [in] [weight], fe|fd [options]", "Extended IV/GMM for panel-data models (SSC)."],
  ["xtabond2", "", "community", "xtabond2 depvar varlist [if] [in] [weight] [, gmmstyle(varlist) ivstyle(varlist) twostep robust]", "Arellano-Bond/Blundell-Bond dynamic panel GMM (SSC)."],
  ["boottest", "", "community", "boottest [indeplist] [, reps(#) cluster(varlist) weighttype(rademacher|webb)]", "Wild (cluster) bootstrap tests after estimation (SSC)."],
  ["csdid", "", "community", "csdid depvar [indepvars] [if] [in] [weight], ivar(varname) time(varname) gvar(varname) [notyet method()]", "Callaway & Sant'Anna (2021) difference-in-differences (SSC)."],
  ["did_multiplegt", "", "community", "did_multiplegt Y G T D [if] [in] [, robust_dynamic dynamic(#) placebo(#) breps(#) cluster(varname)]", "de Chaisemartin & D'Haultfoeuille DID estimators (SSC)."],
  ["did_imputation", "", "community", "did_imputation Y i t Ei [if] [in] [weight] [, horizons(numlist) pretrends(#) fe(list)]", "Borusyak, Jaravel & Spiess imputation DID estimator (SSC)."],
  ["eventstudyinteract", "", "community", "eventstudyinteract y rel_time_list [if] [in] [weight], cohort(variable) control_cohort(variable) [absorb(varlist) vce(vcetype)]", "Sun & Abraham interaction-weighted event-study estimator (SSC)."],
  ["jwdid", "", "community", "jwdid depvar [indepvars] [if] [in] [weight], ivar(varname) tvar(varname) gvar(varname)", "Wooldridge extended two-way fixed-effects DID (SSC)."],
  ["rdrobust", "", "community", "rdrobust depvar runvar [if] [in] [, c(#) p(#) h(#) kernel(kernelfn) bwselect(bwmethod) vce(vcemethod)]", "Robust regression-discontinuity estimation (SSC)."],
  ["rdplot", "", "community", "rdplot depvar runvar [if] [in] [, c(#) p(#) nbins(# #) binselect(binmethod)]", "Data-driven regression-discontinuity plots (SSC)."],
  ["synth", "", "community", "synth depvar predictorvars, trunit(#) trperiod(#) [counit(numlist) fig]", "Synthetic control method (SSC)."],
  ["psmatch2", "", "community", "psmatch2 depvar [indepvars] [if] [in], [outcome(varlist) neighbor(#) caliper(#) common]", "Propensity score matching (SSC)."],
  ["winsor2", "", "community", "winsor2 varlist [if] [in] [, suffix(str) replace cuts(# #) trim by(groupvar)]", "Winsorize or trim variables (SSC)."],
  ["esttab", "", "community", "esttab [namelist] [using filename] [, replace b(fmt) se star(* 0.10 ** 0.05 *** 0.01) keep() drop() label booktabs csv rtf tex]", "Publication-quality regression tables (estout package, SSC)."],
  ["estout", "", "community", "estout [namelist] [using filename] [, cells(array) stats(scalarlist) style(style) replace]", "Make tables from stored estimates (SSC)."],
  ["eststo", "", "community", "eststo [name] [, title(string) addscalars(...)] [: estimation_command]", "Store estimates for use with esttab/estout (SSC)."],
  ["estadd", "", "community", "estadd subcommand [, options] [: namelist]", 'Add results to stored estimates (e.g. `estadd local FE "Yes"`).'],
  ["estpost", "", "community", "estpost {summarize|tabstat|ttest|tabulate|correlate} ...", "Post results from non-estimation commands for esttab (SSC)."],
  ["outreg2", "", "community", "outreg2 [varlist] [estlist] using filename [, replace append excel word tex label keep() drop() ctitle()]", "Arrange regression outputs into an illustrative table (SSC)."],
  ["asdoc", "", "community", "asdoc command [, save(filename) replace append title(text)]", "Send Stata output to MS Word (SSC)."],
  ["gtools", "", "community", "gtools, {install|upgrade|replace}", "Faster Stata for big data (gcollapse, gegen, gisid, glevelsof, ...) (SSC)."],
  ["gcollapse", "", "community", "gcollapse clist [if] [in] [weight] [, by(varlist) cw fast merge]", "Fast collapse from gtools (SSC)."],
  ["gegen", "", "community", "gegen [type] newvar = fcn(arguments) [if] [in] [, by(varlist)]", "Fast egen from gtools (SSC)."],
  ["fcollapse", "", "community", "fcollapse clist [if] [in] [weight] [, by(varlist) fast]", "Fast collapse from ftools (SSC)."],
  ["ftools", "", "community", "ftools, compile", "Fast data manipulation tools required by reghdfe (SSC)."],
  ["distinct", "", "community", "distinct [varlist] [if] [in] [, missing abbrev(#) joint]", "Display number of distinct values of variables (SSC)."],
  ["unique", "", "community", "unique varlist [if] [in] [, by(varname) generate(newvar)]", "Report number of unique values (SSC)."],
  ["fre", "", "community", "fre varlist [if] [in] [weight] [, all nomissing]", "One-way frequency tables with values and labels (SSC)."],
  ["carryforward", "", "community", "carryforward varlist [if] [in], {generate(newvarlist)|replace}", "Carry values forward to fill missings (SSC)."],
  // ---- Programming -------------------------------------------------------
  ["display", "di", "programming", "display [display_directive [display_directive [...]]]", "Display strings and values of scalar expressions."],
  ["local", "loc", "programming", 'local lclname [=exp | :macro_fcn | "[`]text["\']"]', "Define a local macro; reference it as `` `name' ``."],
  ["global", "gl", "programming", 'global mname [=exp | :macro_fcn | "[`]text["\']"]', "Define a global macro; reference it as `$name`."],
  ["macro", "ma", "programming", "macro {dir|list|drop|shift} [...]", "Macro definition and manipulation."],
  ["scalar", "sca", "programming", "scalar [define] scalar_name = exp", "Define and manipulate scalars."],
  ["matrix", "mat", "programming", "matrix [define] matname = matrix_expression | matrix list matname", "Matrix commands."],
  ["tempvar", "", "programming", "tempvar lclname [lclname ...]", "Assign names to temporary variables."],
  ["tempname", "", "programming", "tempname lclname [lclname ...]", "Assign names to temporary scalars and matrices."],
  ["tempfile", "", "programming", "tempfile lclname [lclname ...]", "Assign names to temporary files."],
  ["foreach", "", "programming", "foreach lname {in|of listtype} list {\n    commands referring to `lname'\n}", "Loop over items."],
  ["forvalues", "forv", "programming", "forvalues lname = range {\n    commands referring to `lname'\n}", "Loop over consecutive values."],
  ["while", "", "programming", "while exp {\n    stata_commands\n}", "Looping while an expression is true."],
  ["if", "", "programming", "if exp {\n    commands\n}\nelse {\n    commands\n}", "Programming `if` command (evaluated once, not per observation)."],
  ["else", "", "programming", "else {\n    commands\n}", "Alternative branch of an `if` block."],
  ["continue", "", "programming", "continue [, break]", "Break out of loops."],
  ["program", "pr", "programming", "program [define] pgmname [, nclass rclass eclass sclass byable(recall) properties() sortpreserve]\n    ...\nend", "Define and manipulate programs."],
  ["end", "", "programming", "end", "Terminate a `program`, `mata`, `python`, or `input` block."],
  ["syntax", "", "programming", "syntax [varlist] [if] [in] [using/] [weight] [, options]", "Parse Stata syntax into local macros."],
  ["args", "", "programming", "args macroname1 [macroname2 ...]", "Assign positional arguments to local macros."],
  ["gettoken", "", "programming", 'gettoken emname1 [emname2] : emname3 [, parse("pchars") quotes match(lmacname)]', "Obtain the next token from a macro."],
  ["tokenize", "", "programming", 'tokenize [[`]"][string]["[\']] [, parse("pchars")]', "Divide a string into tokens stored in `1', `2', ..."],
  ["marksample", "", "programming", "marksample lmacname [, novarlist strok zeroweight noby]", "Create a marker variable for the estimation sample."],
  ["markout", "", "programming", "markout marker_var [varlist] [, strok sysmissok]", "Set marker to 0 where variables are missing."],
  ["confirm", "conf", "programming", "confirm {existence|file|number|variable|new variable|...} ...", "Argument verification."],
  ["return", "ret", "programming", "return {list|scalar|local|matrix|clear} ...", "Return (or list) r-class results."],
  ["ereturn", "eret", "programming", "ereturn {list|post|scalar|local|matrix|clear} ...", "Return (or list) e-class results."],
  ["sreturn", "sret", "programming", "sreturn {list|local|clear} ...", "Return (or list) s-class results."],
  ["exit", "", "programming", "exit [[=]exp] [, clear STATA]", "Exit from a program or do-file, optionally with a return code."],
  ["error", "", "programming", "error exp", "Display a standard error message and exit with a return code."],
  ["version", "vers", "programming", "version # [, born(ddMONyyyy)] [: command]", "Set Stata version interpretation."],
  ["mata", "", "programming", "mata [:]\n    mata statements\nend", "Enter the Mata matrix programming language."],
  ["python", "", "programming", "python [:]\n    python statements\nend", "Run embedded Python code (Stata 16+)."],
  ["timer", "", "programming", "timer {on|off|list|clear} [#]", "Time sections of code."],
  ["file", "", "programming", "file {open|write|read|close|seek} handle ...", "Read and write text and binary files."],
  ["include", "", "programming", "include filename", "Include a do-file inline, sharing local macros."],
  ["do", "", "programming", "do filename [arguments] [, nostop]", "Execute commands from a file."],
  ["run", "", "programming", "run filename [arguments] [, nostop]", "Execute commands from a file silently."],
  ["which", "", "utility", "which fname[.ftype] [, all]", "Display location and version of an ado-file."],
  ["findfile", "", "utility", "findfile filename [, path(path) nodescend all]", "Find a file along the ado-path."],
  ["adopath", "", "utility", "adopath [+|++|-] path_or_codeword", "Manipulate the ado-file search path."],
  ["creturn", "", "programming", "creturn list", "List system constants and settings (`c()`)."],
  ["putexcel", "", "reporting", "putexcel set filename [, sheet(name) replace modify] | putexcel cell = exp", "Export results and formatting to Excel."],
  ["putdocx", "", "reporting", "putdocx {begin|paragraph|text|table|image|save} ...", "Create Word (.docx) documents."],
  ["putpdf", "", "reporting", "putpdf {begin|paragraph|text|table|image|save} ...", "Create PDF documents."],
  ["dyndoc", "", "reporting", "dyndoc srcfile [arguments] [, saving(targetfile) replace]", "Convert dynamic Markdown document to HTML or Word."],
  ["log", "", "utility", "log using filename [, append replace text smcl name(logname)] | log close [logname]", "Echo copy of session to a file."],
  ["cmdlog", "", "utility", "cmdlog using filename [, append replace]", "Log commands only."],
  ["sleep", "", "utility", "sleep #", "Pause for a specified number of milliseconds."],
  ["beep", "", "utility", "beep", "Sound a bell."],
  // ---- Prefixes ----------------------------------------------------------
  ["quietly", "qui", "prefix", "quietly [:] command | quietly { ... }", "Suppress output of a command or block."],
  ["noisily", "n", "prefix", "noisily [:] command", "Display output (inside a `quietly` block)."],
  ["capture", "cap", "prefix", "capture [:] command | capture { ... }", "Run a command and suppress errors; return code in `_rc`."],
  ["by", "", "prefix", "by varlist [, sort rc0] : stata_cmd", "Repeat a command on subsets of the data."],
  ["bysort", "bys", "prefix", "bysort varlist [(varlist)] [, rc0] : stata_cmd", "Sort and repeat a command on subsets of the data."],
  ["frame", "", "frames", "frame {create|change|copy|rename|drop|put|dir|pwf} ... | frame framename: command", "Manage data frames or run a command in another frame."],
  ["frames", "", "frames", "frames {dir|reset|describe|save|use}", "Data frames: list, reset, save, and use sets of frames."],
  ["cwf", "", "frames", "cwf framename", "Change the current (working) frame."],
  ["pwf", "", "frames", "pwf", "Display the name of the current frame."],
  ["frlink", "", "frames", "frlink {1:1|m:1} varlist, frame(framename [varlist2]) [generate(linkvar)]", "Link frames."],
  ["frget", "", "frames", "frget varlist, from(linkvar) [prefix(str) suffix(str)]", "Copy variables from a linked frame."],
  ["fralias", "", "frames", "fralias add varlist, from(linkvar)", "Create alias variables from a linked frame (Stata 18+)."],
  // ---- Files, system, packages -------------------------------------------
  ["cd", "", "files", 'cd ["]directory_name["]', "Change working directory."],
  ["pwd", "", "files", "pwd", "Display working directory."],
  ["dir", "", "files", 'dir ["][filespec]["] [, wide]', "Display directory contents."],
  ["ls", "", "files", 'ls ["][filespec]["] [, wide]', "Display directory contents."],
  ["mkdir", "", "files", "mkdir directory_name [, public]", "Create a directory."],
  ["rmdir", "", "files", "rmdir directory_name", "Remove an empty directory."],
  ["erase", "", "files", 'erase ["]filename["]', "Erase a disk file."],
  ["rm", "", "files", 'rm ["]filename["]', "Erase a disk file (Unix-style alias of `erase`)."],
  ["copy", "", "files", "copy filename1 filename2 [, public text replace]", "Copy a file from disk or URL."],
  ["type", "", "files", 'type ["]filename["] [, asis smcl]', "Display the contents of a file."],
  ["shell", "", "files", "shell [operating_system_command]", "Temporarily invoke the operating system."],
  ["zipfile", "", "files", "zipfile file_list, saving(zipfilename [, replace])", "Compress files to a zip archive."],
  ["unzipfile", "", "files", "unzipfile zipfilename [, replace]", "Extract files from a zip archive."],
  ["ssc", "", "utility", "ssc {install|uninstall|describe|new|hot|type} pkgname [, replace all]", "Install and uninstall packages from SSC."],
  ["net", "", "utility", "net {install|from|describe|get|search} ...", "Install and manage community-contributed additions from the Internet."],
  ["ado", "", "utility", "ado {dir|describe|update|uninstall} ...", "List, update, and uninstall installed packages."],
  ["help", "h", "utility", "help [command_or_topic_name] [, nonew name(viewername)]", "Display help information."],
  ["search", "", "utility", "search word [word ...] [, all local net sj faq]", "Search Stata documentation and other resources."],
  ["query", "", "utility", "query [output|interface|graphics|efficiency|network|update|trace|mata|other]", "Display system parameters."],
  ["about", "", "utility", "about", "Display information about your version of Stata."],
  ["update", "", "utility", "update [query|all] [, from(location)]", "Check for and install official updates."],
  ["window", "win", "utility", "window {manage|menu|stopbox|...} ...", "Programming menus and windows."],
  ["discard", "", "utility", "discard", "Drop automatically loaded programs."],
  ["more", "", "utility", "more", "Pause until a key is pressed."],
  ["pause", "", "utility", "pause [on|off|message]", "Program debugging command."],
  ["numlist", "", "programming", 'numlist "numlist" [, ascending integer min(#) max(#) sort]', "Parse numeric lists into `r(numlist)`."],
  ["mark", "", "programming", "mark newmarkvar [if] [in] [weight] [, zeroweight noby]", "Create a marker variable."],
  ["unab", "", "programming", "unab lmacname : [varlist] [, min(#) max(#) name(string)]", "Unabbreviate variable list."],
  ["fvexpand", "", "programming", "fvexpand [varlist] [if] [in]", "Expand factor varlists into `r(varlist)`."]
];
var STATA_COMMANDS = COMMAND_ROWS.map(([name, abbrev, category, signature, doc]) => ({ name, minAbbrev: abbrev || name, category, signature, doc }));
var COMMAND_BY_NAME = new Map(STATA_COMMANDS.map((c) => [c.name, c]));
function resolveCommand(word) {
  const w = word.trim().toLowerCase();
  if (!w) {
    return void 0;
  }
  const exact = COMMAND_BY_NAME.get(w);
  if (exact) {
    return exact;
  }
  let best;
  for (const cmd of STATA_COMMANDS) {
    if (cmd.name.startsWith(w) && w.length >= cmd.minAbbrev.length && cmd.minAbbrev !== cmd.name) {
      if (!best || cmd.minAbbrev.length > best.minAbbrev.length) {
        best = cmd;
      }
    }
  }
  return best;
}
function abbreviationLabel(cmd) {
  return cmd.minAbbrev !== cmd.name ? cmd.minAbbrev : void 0;
}
var PREFIX_WORDS = /^(?:qui|quie|quiet|quietl|quietly|n|no|noi|nois|noisi|noisil|noisily|cap|capt|captu|captur|capture)$/i;
function isCommandPosition(linePrefix) {
  let text = linePrefix;
  const colon = text.lastIndexOf(":");
  if (colon >= 0) {
    text = text.slice(colon + 1);
  }
  const brace = text.lastIndexOf("{");
  if (brace >= 0) {
    text = text.slice(brace + 1);
  }
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.every((w) => PREFIX_WORDS.test(w));
}
var FUNCTION_ROWS = [
  // Math
  ["abs", "abs(x)", "Absolute value of x."],
  ["ceil", "ceil(x)", "Smallest integer >= x."],
  ["floor", "floor(x)", "Largest integer <= x."],
  ["int", "int(x)", "Integer obtained by truncating x toward 0."],
  ["round", "round(x[, y])", "x rounded to units of y (default 1)."],
  ["exp", "exp(x)", "Exponential e^x."],
  ["ln", "ln(x)", "Natural logarithm."],
  ["log", "log(x)", "Natural logarithm (synonym for ln)."],
  ["log10", "log10(x)", "Base-10 logarithm."],
  ["sqrt", "sqrt(x)", "Square root."],
  ["mod", "mod(x, y)", "Modulus of x with respect to y."],
  ["max", "max(x1, x2, ..., xn)", "Maximum value, ignoring missing."],
  ["min", "min(x1, x2, ..., xn)", "Minimum value, ignoring missing."],
  ["sum", "sum(x)", "Running sum of x (missing treated as 0)."],
  ["sign", "sign(x)", "Sign of x: -1, 0, or 1."],
  ["logit", "logit(x)", "Log of the odds ratio: ln(x/(1-x))."],
  ["invlogit", "invlogit(x)", "Inverse logit: exp(x)/(1+exp(x))."],
  ["comb", "comb(n, k)", "Combinatorial function n!/(k!(n-k)!)."],
  ["lnfactorial", "lnfactorial(n)", "Natural log of n factorial."],
  // Statistical / random
  ["normal", "normal(z)", "Cumulative standard normal distribution."],
  ["normalden", "normalden(z[, mu, sigma])", "Normal density."],
  ["invnormal", "invnormal(p)", "Inverse cumulative standard normal."],
  ["ttail", "ttail(df, t)", "Reverse cumulative Student's t distribution."],
  ["invttail", "invttail(df, p)", "Inverse reverse cumulative Student's t."],
  ["chi2tail", "chi2tail(df, x)", "Reverse cumulative chi-squared distribution."],
  ["Ftail", "Ftail(df1, df2, f)", "Reverse cumulative F distribution."],
  ["runiform", "runiform([a, b])", "Uniform random variates on (a, b); default (0, 1)."],
  ["runiformint", "runiformint(a, b)", "Uniform random integers in [a, b]."],
  ["rnormal", "rnormal([m, s])", "Normal random variates with mean m and s.d. s."],
  ["rbinomial", "rbinomial(n, p)", "Binomial random variates."],
  ["rpoisson", "rpoisson(m)", "Poisson random variates with mean m."],
  // Programming
  ["cond", "cond(x, a, b[, c])", "a if x is true and nonmissing, b if false, c if x is missing."],
  ["inlist", "inlist(z, a, b, ...)", "1 if z equals any of the remaining arguments."],
  ["inrange", "inrange(z, a, b)", "1 if a <= z <= b."],
  ["missing", "missing(x1, x2, ..., xn)", "1 if any argument is missing."],
  ["mi", "mi(x1, x2, ..., xn)", "Synonym for missing()."],
  ["autocode", "autocode(x, n, x0, x1)", "Partition (x0, x1] into n intervals and return the upper bound."],
  ["recode", "recode(x, x1, x2, ..., xn)", "Return the first xi such that x <= xi."],
  ["clip", "clip(x, a, b)", "x clipped to the range [a, b]."],
  ["float", "float(x)", "x rounded to float precision."],
  ["byteorder", "byteorder()", "1 if big-endian, 2 if little-endian."],
  ["c", "c(name)", "Value of system constant/setting (e.g. c(N), c(pwd), c(current_date))."],
  ["r", "r(name)", "Value of an r-class stored result."],
  ["e", "e(name)", "Value of an e-class stored result."],
  ["_b", "_b[coef]", "Coefficient from the last estimation."],
  ["_se", "_se[coef]", "Standard error from the last estimation."],
  // Strings
  ["strlen", "strlen(s)", "Number of characters (bytes) in s."],
  ["ustrlen", "ustrlen(s)", "Number of Unicode characters in s."],
  ["strtrim", "strtrim(s)", "s without leading and trailing blanks."],
  ["strltrim", "strltrim(s)", "s without leading blanks."],
  ["strrtrim", "strrtrim(s)", "s without trailing blanks."],
  ["stritrim", "stritrim(s)", "s with multiple internal blanks collapsed to one."],
  ["strupper", "strupper(s)", "Uppercase s."],
  ["strlower", "strlower(s)", "Lowercase s."],
  ["strproper", "strproper(s)", "Title-case s."],
  ["substr", "substr(s, n1, n2)", "Substring of s starting at n1 for length n2."],
  ["usubstr", "usubstr(s, n1, n2)", "Unicode substring of s starting at n1 for length n2."],
  ["strpos", "strpos(s1, s2)", "Position of s2 in s1, or 0."],
  ["strrpos", "strrpos(s1, s2)", "Position of the last occurrence of s2 in s1."],
  ["subinstr", "subinstr(s1, s2, s3, n)", "Replace first n occurrences of s2 in s1 with s3 (n = . for all)."],
  ["subinword", "subinword(s1, s2, s3, n)", "Replace first n whole-word occurrences of s2 in s1 with s3."],
  ["word", "word(s, n)", "The nth word of s."],
  ["wordcount", "wordcount(s)", "Number of words in s."],
  ["strofreal", "strofreal(n[, s])", "n converted to string using format s."],
  ["string", "string(n[, s])", "Synonym for strofreal()."],
  ["real", "real(s)", "s converted to numeric, or missing."],
  ["strmatch", "strmatch(s1, s2)", "1 if s1 matches the pattern s2 (* and ? wildcards)."],
  ["regexm", "regexm(s, re)", "1 if regular expression re matches s."],
  ["regexr", "regexr(s1, re, s2)", "Replace the first match of re in s1 with s2."],
  ["regexs", "regexs(n)", "Subexpression n from a previous regexm() match."],
  ["ustrregexm", "ustrregexm(s, re[, noc])", "Unicode regex match."],
  ["ustrregexra", "ustrregexra(s1, re, s2[, noc])", "Replace all Unicode regex matches of re in s1 with s2."],
  ["ustrregexs", "ustrregexs(n)", "Subexpression n from a previous ustrregexm() match."],
  ["strreverse", "strreverse(s)", "Reverse of s."],
  ["char", "char(n)", "Character corresponding to ASCII code n."],
  ["uchar", "uchar(n)", "Unicode character for code point n."],
  ["plural", "plural(n, s[, s2])", "Plural of s if n != 1."],
  ["abbrev", "abbrev(s, n)", "Name s abbreviated to n characters."],
  ["indexnot", "indexnot(s1, s2)", "Position of first character of s1 not found in s2."],
  ["strtoname", "strtoname(s[, p])", "s converted to a valid Stata name."],
  ["fileexists", "fileexists(f)", "1 if file f exists."],
  // Date & time
  ["date", "date(s, mask[, topyear])", 'Daily date (%td) from string s, e.g. date(s, "YMD").'],
  ["mdy", "mdy(M, D, Y)", "Daily date from month, day, and year."],
  ["year", "year(d)", "Calendar year of daily date d."],
  ["month", "month(d)", "Month (1-12) of daily date d."],
  ["day", "day(d)", "Day of month of daily date d."],
  ["dow", "dow(d)", "Day of week (0 = Sunday) of daily date d."],
  ["doy", "doy(d)", "Day of year of daily date d."],
  ["week", "week(d)", "Week of year of daily date d."],
  ["quarter", "quarter(d)", "Quarter of daily date d."],
  ["halfyear", "halfyear(d)", "Half-year of daily date d."],
  ["ym", "ym(Y, M)", "Monthly date (%tm) from year and month."],
  ["yq", "yq(Y, Q)", "Quarterly date (%tq) from year and quarter."],
  ["yw", "yw(Y, W)", "Weekly date (%tw) from year and week."],
  ["mofd", "mofd(d)", "Monthly date from daily date."],
  ["qofd", "qofd(d)", "Quarterly date from daily date."],
  ["dofm", "dofm(m)", "Daily date of the first day of monthly date m."],
  ["dofq", "dofq(q)", "Daily date of the first day of quarterly date q."],
  ["dofc", "dofc(c)", "Daily date from datetime c (%tc)."],
  ["clock", "clock(s, mask[, topyear])", 'Datetime (%tc) from string s, e.g. clock(s, "YMDhms").'],
  ["monthly", "monthly(s, mask[, topyear])", "Monthly date from string s."],
  ["quarterly", "quarterly(s, mask[, topyear])", "Quarterly date from string s."]
];
var STATA_FUNCTIONS = FUNCTION_ROWS.map(([name, signature, doc]) => ({ name, signature, doc }));
var FUNCTION_BY_NAME = new Map(STATA_FUNCTIONS.map((f) => [f.name, f]));
function resolveFunction(name) {
  return FUNCTION_BY_NAME.get(name);
}
var STATA_SNIPPETS = [
  { label: "foreach", description: "foreach loop", body: "foreach ${1:v} ${2|of varlist,in,of local,of global,of numlist|} ${3:list} {\n	$0\n}" },
  { label: "forvalues", description: "forvalues loop", body: "forvalues ${1:i} = ${2:1}/${3:10} {\n	$0\n}" },
  { label: "while", description: "while loop", body: "while ${1:condition} {\n	$0\n}" },
  { label: "if", description: "if block", body: "if ${1:condition} {\n	$0\n}" },
  { label: "ifelse", description: "if / else block", body: "if ${1:condition} {\n	$2\n}\nelse {\n	$0\n}" },
  {
    label: "program",
    description: "program define ... end",
    body: "capture program drop ${1:name}\nprogram define ${1:name}, ${2|rclass,eclass,sclass,nclass|}\n	version ${3:18}\n	syntax ${4:varlist} [if] [in] [, ${5:options}]\n	marksample touse\n	$0\nend"
  },
  { label: "preserve", description: "preserve ... restore", body: "preserve\n	$0\nrestore" },
  { label: "capture noisily", description: "capture noisily block with error handling", body: 'capture noisily {\n	$1\n}\nif _rc {\n	di as error "Failed with error " _rc\n	${0:exit _rc}\n}' },
  { label: "quietly", description: "quietly block", body: "quietly {\n	$0\n}" },
  { label: "mata", description: "mata ... end block", body: "mata:\n$0\nend" },
  { label: "python", description: "python ... end block", body: "python:\n$0\nend" },
  { label: "section", description: "Section heading (Stata 18+ bookmark)", body: "**# ${1:Section title}\n$0" },
  { label: "cell", description: "Code cell marker", body: "* %% ${1:Cell title}\n$0" },
  {
    label: "eststo-esttab",
    description: "Store regressions and export a table",
    body: 'eststo clear\neststo: ${1:reghdfe y x}, absorb(${2:id year}) vce(cluster ${3:id})\nesttab using "${4:table.tex}", replace se star(* 0.10 ** 0.05 *** 0.01) label booktabs$0'
  }
];

// src/cellParser.ts
var CELL_MARKER = /^\s*(?:\*|\/\/)\s*%%/;
var SECTION_HEADING = /^\s*\*\*(#{1,6})(?!#)\s*(.*?)\s*$/;
function isCellMarker(line) {
  return CELL_MARKER.test(line);
}
function hasCellMarkers(lines) {
  return lines.some(isCellMarker);
}
function cellTitle(line) {
  return line.replace(CELL_MARKER, "").trim();
}
function findCells(lines) {
  const markers = [];
  lines.forEach((l, i) => {
    if (isCellMarker(l)) {
      markers.push(i);
    }
  });
  const last = Math.max(lines.length - 1, 0);
  if (markers.length === 0) {
    return [{ title: "", start: 0, end: last }];
  }
  const cells = [];
  if (markers[0] > 0 && lines.slice(0, markers[0]).some((l) => l.trim() !== "")) {
    cells.push({ title: "", start: 0, end: markers[0] - 1 });
  }
  markers.forEach((m, i) => {
    const end = i + 1 < markers.length ? markers[i + 1] - 1 : last;
    cells.push({ markerLine: m, title: cellTitle(lines[m]), start: m, end });
  });
  return cells;
}
function cellIndexAt(cells, line) {
  for (let i = cells.length - 1; i >= 0; i--) {
    if (line >= cells[i].start) {
      return i;
    }
  }
  return cells.length ? 0 : -1;
}
function cellCode(lines, cell) {
  const from = cell.markerLine !== void 0 ? cell.markerLine + 1 : cell.start;
  return trimBlankLines(lines.slice(from, cell.end + 1)).join("\n");
}
function rangeCode(lines, start, end) {
  return start > end ? "" : trimBlankLines(lines.slice(Math.max(start, 0), end + 1)).join("\n");
}
function sectionCode(lines, sections, index) {
  const r = sectionRange(sections, index, lines.length);
  return rangeCode(lines, r.start + 1, r.end);
}
function trimBlankLines(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === "") {
    a++;
  }
  while (b > a && lines[b - 1].trim() === "") {
    b--;
  }
  return lines.slice(a, b);
}
function findSections(lines) {
  const sections = [];
  lines.forEach((l, i) => {
    const m = SECTION_HEADING.exec(l);
    if (m) {
      sections.push({ line: i, level: m[1].length, title: m[2] });
    }
  });
  return sections;
}
function sectionRange(sections, index, lineCount) {
  const s = sections[index];
  let end = Math.max(lineCount - 1, s.line);
  for (let j = index + 1; j < sections.length; j++) {
    if (sections[j].level <= s.level) {
      end = sections[j].line - 1;
      break;
    }
  }
  return { start: s.line, end };
}
function sectionIndexAt(sections, line) {
  for (let i = sections.length - 1; i >= 0; i--) {
    if (sections[i].line <= line) {
      return i;
    }
  }
  return -1;
}
var PROGRAM_START = /^\s*(?:(?:cap|capt|captu|captur|capture)\s+)?(?:pr|pro|prog|progr|progra|program)\s+(?:(?:de|def|defi|defin|define)\s+)?([A-Za-z_][\w.]*)\s*(?:,.*)?(?:\/\/.*)?$/;
var PROGRAM_SUBCOMMANDS = /* @__PURE__ */ new Set(["drop", "dir", "list"]);
var MATA_START = /^\s*(?:(?:cap|capture)\s+)?mata\s*(?::\s*)?(?:\/\/.*)?$/;
var PYTHON_START = /^\s*(?:(?:cap|capture)\s+)?python\s*(?::\s*)?(?:\/\/.*)?$/;
var INPUT_START = /^\s*input\b/;
var BLOCK_END = /^\s*end\b/;
function programName(line) {
  const m = PROGRAM_START.exec(line);
  if (!m || PROGRAM_SUBCOMMANDS.has(m[1])) {
    return void 0;
  }
  return m[1];
}
function findBlocks(lines) {
  const blocks = [];
  const stack = [];
  lines.forEach((l, i) => {
    const top = stack[stack.length - 1];
    if (top?.kind !== "python" && top?.kind !== "input") {
      if (top?.kind !== "mata" && INPUT_START.test(l)) {
        stack.push({ kind: "input", name: "input", start: i });
        return;
      }
      const name = programName(l);
      if (name) {
        stack.push({ kind: "program", name, start: i });
        return;
      }
      if (MATA_START.test(l)) {
        stack.push({ kind: "mata", name: "mata", start: i });
        return;
      }
      if (PYTHON_START.test(l)) {
        stack.push({ kind: "python", name: "python", start: i });
        return;
      }
    }
    if (BLOCK_END.test(l) && stack.length) {
      const open = stack.pop();
      blocks.push({ kind: open.kind, name: open.name, start: open.start, end: i });
    }
  });
  return blocks.sort((a, b) => a.start - b.start);
}
var REGION_START = /^\s*\/\/\s*#?region\b/;
var REGION_END = /^\s*\/\/\s*#?endregion\b/;
function scanCommentsAndBraces(lines) {
  const comments = [];
  const braces = [];
  const braceStack = [];
  let commentDepth = 0;
  let commentStart = -1;
  lines.forEach((line, i) => {
    if (commentDepth === 0 && /^\s*\*/.test(line)) {
      return;
    }
    let inString = false;
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      const next = line[k + 1];
      if (commentDepth > 0) {
        if (ch === "/" && next === "*") {
          commentDepth++;
          k++;
        } else if (ch === "*" && next === "/") {
          commentDepth--;
          k++;
          if (commentDepth === 0 && i > commentStart) {
            comments.push({ start: commentStart, end: i });
          }
        }
        continue;
      }
      if (inString) {
        if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === "/" && next === "*") {
        commentDepth = 1;
        commentStart = i;
        k++;
      } else if (ch === "/" && next === "/" && (k === 0 || /\s/.test(line[k - 1]))) {
        break;
      } else if (ch === "{") {
        braceStack.push(i);
      } else if (ch === "}") {
        const open = braceStack.pop();
        if (open !== void 0 && i > open) {
          braces.push({ start: open, end: i });
        }
      }
    }
  });
  return { comments, braces };
}
function computeFoldingRanges(lines) {
  const ranges = [];
  const lastNonBlank = (from, to) => {
    let e = to;
    while (e > from && lines[e].trim() === "") {
      e--;
    }
    return e;
  };
  const sections = findSections(lines);
  sections.forEach((_, i) => {
    const r = sectionRange(sections, i, lines.length);
    const end = lastNonBlank(r.start, r.end);
    if (end > r.start) {
      ranges.push({ start: r.start, end, kind: "region" });
    }
  });
  if (hasCellMarkers(lines)) {
    for (const cell of findCells(lines)) {
      const end = lastNonBlank(cell.start, cell.end);
      if (cell.markerLine !== void 0 && end > cell.start) {
        ranges.push({ start: cell.start, end, kind: "region" });
      }
    }
  }
  for (const b of findBlocks(lines)) {
    if (b.end > b.start) {
      ranges.push({ start: b.start, end: b.end });
    }
  }
  const { comments, braces } = scanCommentsAndBraces(lines);
  comments.forEach((c) => ranges.push({ ...c, kind: "comment" }));
  braces.forEach((b) => {
    if (b.end - 1 > b.start) {
      ranges.push({ start: b.start, end: b.end - 1 });
    }
  });
  const regionStack = [];
  lines.forEach((l, i) => {
    if (REGION_START.test(l)) {
      regionStack.push(i);
    } else if (REGION_END.test(l)) {
      const s = regionStack.pop();
      if (s !== void 0) {
        ranges.push({ start: s, end: i, kind: "region" });
      }
    }
  });
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}
function buildOutline(lines) {
  const sections = findSections(lines);
  const items = sections.map((s, i) => {
    const r = sectionRange(sections, i, lines.length);
    return { name: s.title || `Section ${"#".repeat(s.level)}`, kind: "section", line: s.line, level: s.level, ...r, children: [] };
  });
  if (hasCellMarkers(lines)) {
    for (const c of findCells(lines)) {
      if (c.markerLine !== void 0) {
        items.push({ name: c.title || `Cell (line ${c.markerLine + 1})`, kind: "cell", line: c.markerLine, level: 99, start: c.start, end: c.end, children: [] });
      }
    }
  }
  for (const b of findBlocks(lines)) {
    if (b.kind === "program") {
      items.push({ name: b.name, kind: "program", line: b.start, level: 100, start: b.start, end: b.end, children: [] });
    }
  }
  items.sort((a, b) => a.line - b.line || a.level - b.level);
  const roots = [];
  const stack = [];
  for (const item of items) {
    while (stack.length) {
      const top = stack[stack.length - 1];
      const contains = item.line >= top.start && item.line <= top.end;
      const canParent = top.kind === "section" && (item.kind !== "section" || item.level > top.level);
      if (contains && canParent) {
        break;
      }
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    (parent ? parent.children : roots).push(item);
    if (parent && item.end > parent.end) {
      item.end = parent.end;
    }
    stack.push(item);
  }
  return roots;
}
var IDENT = "[A-Za-z_][A-Za-z0-9_]*";
var LOCAL_DEF = new RegExp(`\\b(?:loc|loca|local)\\s+(?:\\+\\+|--)?(${IDENT})`, "g");
var TEMP_DEF = /\b(?:tempvar|tempname|tempfile)\s+([^\/\n]*)/g;
var FOREACH_DEF = new RegExp(`\\bforeach\\s+(${IDENT})\\s+(?:in|of)\\b`, "g");
var FORVALUES_DEF = new RegExp(`\\bforv(?:a|al|alu|alue|alues)?\\s+(${IDENT})\\s*=`, "g");
var ARGS_DEF = /^\s*args\s+([^\/\n]*)/;
var GETTOKEN_DEF = new RegExp(`\\bgettoken\\s+(${IDENT})(?:\\s+(${IDENT}))?\\s*:`, "g");
var LOCAL_OPTION = new RegExp(`\\blocal\\(\\s*(${IDENT})\\s*\\)`, "g");
var SYNTAX_LINE = /^\s*syntax\b(.*)$/;
var GLOBAL_DEF = new RegExp(`\\b(?:gl|glo|glob|globa|global)\\s+(${IDENT})`, "g");
function addAll(target, re, text, groups = [1]) {
  re.lastIndex = 0;
  let m;
  while (m = re.exec(text)) {
    for (const g of groups) {
      if (m[g]) {
        target.add(m[g]);
      }
    }
  }
}
function identifiersIn(text) {
  return text.split(/\s+/).filter((w) => new RegExp(`^${IDENT}$`).test(w));
}
function codeOf(line) {
  if (/^\s*\*/.test(line)) {
    return "";
  }
  const idx = line.search(/(^|\s)\/\//);
  return idx >= 0 ? line.slice(0, idx) : line;
}
function extractLocalMacros(lines) {
  const names = /* @__PURE__ */ new Set();
  for (const raw of lines) {
    const line = codeOf(raw);
    if (!line.trim()) {
      continue;
    }
    addAll(names, LOCAL_DEF, line);
    addAll(names, FOREACH_DEF, line);
    addAll(names, FORVALUES_DEF, line);
    addAll(names, GETTOKEN_DEF, line, [1, 2]);
    addAll(names, LOCAL_OPTION, line);
    TEMP_DEF.lastIndex = 0;
    let m;
    while (m = TEMP_DEF.exec(line)) {
      identifiersIn(m[1]).forEach((n) => names.add(n));
    }
    const args = ARGS_DEF.exec(line);
    if (args) {
      identifiersIn(args[1]).forEach((n) => names.add(n));
    }
    const syntax = SYNTAX_LINE.exec(line);
    if (syntax) {
      const spec = syntax[1];
      for (const kw of ["varlist", "newvarlist", "varname", "newvarname", "namelist", "name", "anything", "if", "in", "using", "exp"]) {
        if (new RegExp(`(^|[\\s\\[(])${kw}\\b`).test(spec)) {
          names.add(kw === "newvarlist" ? "varlist" : kw === "newvarname" ? "varname" : kw);
        }
      }
      if (/\[\s*[a-z]*weight/.test(spec)) {
        names.add("weight");
        names.add("exp");
      }
      const comma = spec.indexOf(",");
      if (comma >= 0) {
        const optRe = /([A-Za-z][A-Za-z0-9_]*)(?=\s*(?:\(|\]|\s|$))/g;
        let o;
        while (o = optRe.exec(spec.slice(comma + 1))) {
          const opt = /^no[A-Z]/.test(o[1]) ? o[1].slice(2) : o[1];
          names.add(opt.toLowerCase());
        }
      }
    }
  }
  return [...names].sort();
}
function extractGlobalMacros(lines) {
  const names = /* @__PURE__ */ new Set();
  for (const raw of lines) {
    addAll(names, GLOBAL_DEF, codeOf(raw));
  }
  return [...names].sort();
}
var STATEMENT_PREFIX = String.raw`(?:(?:qui(?:e|et|etl|etly)?|n(?:o|oi|ois|oisi|oisil|oisily)?|cap(?:t|tu|tur|ture)?)\s*:?\s*|by(?:s|so|sor|sort)?\s[^:]*:\s*)*`;
var GENERATE_DEF = new RegExp(
  `^\\s*${STATEMENT_PREFIX}(?:g|ge|gen|gene|gener|genera|generat|generate|egen|clonevar|gegen)\\s+(?:(?:byte|int|long|float|double|strL|str\\d+)\\s+)?(${IDENT})`
);
var RENAME_DEF = new RegExp(`^\\s*${STATEMENT_PREFIX}ren(?:a|am|ame)?\\s+(${IDENT})\\s+(${IDENT})\\s*$`);
var GEN_OPTION = new RegExp(`\\bgen(?:e|er|era|erat|erate)?\\(\\s*(${IDENT})\\s*\\)`, "g");
function extractDocumentVariables(lines) {
  const names = /* @__PURE__ */ new Set();
  for (const raw of lines) {
    const line = codeOf(raw);
    const g = GENERATE_DEF.exec(line);
    if (g) {
      names.add(g[1]);
    }
    const r = RENAME_DEF.exec(line);
    if (r) {
      names.add(r[2]);
    }
    addAll(names, GEN_OPTION, line);
  }
  return [...names].sort();
}

// src/completion.ts
var SELECTOR = { language: "stata" };
var IDENT_BEFORE_CURSOR = /[A-Za-z_][A-Za-z0-9_]*$/;
var SESSION_CACHE_MS = 4e3;
var SESSION_TIMEOUT_MS = 1500;
var sessionCache;
function withTimeout(p, ms, fallback) {
  return new Promise((resolve2) => {
    const timer = setTimeout(() => resolve2(fallback), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(timer);
        resolve2(v);
      },
      () => {
        clearTimeout(timer);
        resolve2(fallback);
      }
    );
  });
}
async function fetchSessionVariables() {
  try {
    const runtime4 = positron3?.runtime;
    if (!runtime4?.getSessionVariables) {
      return [];
    }
    let session = await runtime4.getForegroundSession?.();
    if (session?.runtimeMetadata?.languageId !== "stata") {
      const sessions = await runtime4.getActiveSessions?.() ?? [];
      session = sessions.find((s) => s.runtimeMetadata?.languageId === "stata");
    }
    if (!session) {
      return [];
    }
    const groups = await runtime4.getSessionVariables(session.metadata.sessionId, [["current_dataset"]]);
    const out = [];
    for (const v of (groups ?? []).flat()) {
      if (v && typeof v.display_name === "string" && !v.has_children) {
        out.push({ name: v.display_name, type: v.display_type ?? "", label: v.display_value ?? "" });
      }
    }
    return out;
  } catch {
    return [];
  }
}
function getSessionVariables() {
  const now = Date.now();
  if (!sessionCache || now - sessionCache.time > SESSION_CACHE_MS) {
    sessionCache = { time: now, value: withTimeout(fetchSessionVariables(), SESSION_TIMEOUT_MS, []) };
  }
  return sessionCache.value;
}
function commandMarkdown(cmd) {
  const md = new vscode4.MarkdownString();
  md.appendCodeblock(cmd.signature, "stata");
  md.appendMarkdown(cmd.doc);
  const abbrev = abbreviationLabel(cmd);
  if (abbrev) {
    md.appendMarkdown(`

Minimum abbreviation: \`${abbrev}\``);
  }
  return md;
}
function commandKind(cmd) {
  return cmd.category === "prefix" || cmd.category === "programming" ? vscode4.CompletionItemKind.Keyword : vscode4.CompletionItemKind.Function;
}
function isInComment(linePrefix) {
  return /^\s*\*/.test(linePrefix) || /(^|\s)\/\//.test(linePrefix) || /\/\*(?!.*\*\/)/.test(linePrefix);
}
var StataCompletionProvider = class {
  async provideCompletionItems(document, position, _token, context) {
    try {
      const lineText = document.lineAt(position.line).text;
      const linePrefix = lineText.slice(0, position.character);
      const nextChar = lineText.charAt(position.character);
      const localMatch = /`([A-Za-z0-9_]*)$/.exec(linePrefix);
      if (localMatch) {
        return this.macroItems(document, position, localMatch[1], "local", nextChar === "'" ? "" : "'");
      }
      const globalMatch = /\$(\{)?([A-Za-z_][A-Za-z0-9_]*)?$/.exec(linePrefix);
      if (globalMatch) {
        const suffix = globalMatch[1] && nextChar !== "}" ? "}" : "";
        return this.macroItems(document, position, globalMatch[2] ?? "", "global", suffix);
      }
      if (context.triggerKind === vscode4.CompletionTriggerKind.TriggerCharacter || isInComment(linePrefix)) {
        return void 0;
      }
      const word = IDENT_BEFORE_CURSOR.exec(linePrefix)?.[0] ?? "";
      const before = linePrefix.slice(0, linePrefix.length - word.length);
      const commandPos = isCommandPosition(before);
      const items = [];
      const rank = commandPos ? { cmd: "0", var: "1", fn: "2" } : { cmd: "2", var: "0", fn: "1" };
      for (const cmd of STATA_COMMANDS) {
        const abbrev = abbreviationLabel(cmd);
        const item = new vscode4.CompletionItem(
          { label: cmd.name, detail: abbrev ? ` (${abbrev})` : void 0, description: cmd.category },
          commandKind(cmd)
        );
        item.detail = cmd.signature.split("\n")[0];
        item.documentation = commandMarkdown(cmd);
        item.sortText = `${rank.cmd}_${cmd.name}`;
        items.push(item);
      }
      if (commandPos) {
        for (const snip of STATA_SNIPPETS) {
          const item = new vscode4.CompletionItem({ label: snip.label, description: "snippet" }, vscode4.CompletionItemKind.Snippet);
          item.insertText = new vscode4.SnippetString(snip.body);
          item.detail = snip.description;
          const md = new vscode4.MarkdownString();
          md.appendCodeblock(snip.body.replace(/\$\{\d+(?::([^}]*)|\|([^,|}]*)[^}]*)\}/g, "$1$2").replace(/\$\d+/g, ""), "stata");
          item.documentation = md;
          item.sortText = `${rank.cmd}_${snip.label}~`;
          items.push(item);
        }
      }
      for (const fn of STATA_FUNCTIONS) {
        const item = new vscode4.CompletionItem({ label: fn.name, description: "function" }, vscode4.CompletionItemKind.Function);
        item.detail = fn.signature;
        item.documentation = new vscode4.MarkdownString(fn.doc);
        item.insertText = fn.signature.includes("(") ? new vscode4.SnippetString(`${fn.name}($0)`) : fn.name;
        item.sortText = `${rank.fn}_${fn.name}`;
        items.push(item);
      }
      const seen = /* @__PURE__ */ new Set();
      for (const v of await getSessionVariables()) {
        if (seen.has(v.name)) {
          continue;
        }
        seen.add(v.name);
        const item = new vscode4.CompletionItem({ label: v.name, description: v.type }, vscode4.CompletionItemKind.Field);
        item.detail = v.label ? `${v.type} \u2014 ${v.label}` : v.type;
        item.sortText = `${rank.var}_${v.name}`;
        items.push(item);
      }
      for (const name of extractDocumentVariables(documentLines(document))) {
        if (seen.has(name)) {
          continue;
        }
        seen.add(name);
        const item = new vscode4.CompletionItem({ label: name, description: "variable (do-file)" }, vscode4.CompletionItemKind.Variable);
        item.sortText = `${rank.var}_${name}`;
        items.push(item);
      }
      return items;
    } catch (err) {
      console.error("Stata completion failed:", err);
      return void 0;
    }
  }
  macroItems(document, position, partial, scope, suffix) {
    const lines = documentLines(document);
    const names = scope === "local" ? extractLocalMacros(lines) : extractGlobalMacros(lines);
    const range = new vscode4.Range(position.translate(0, -partial.length), position);
    return names.map((name) => {
      const item = new vscode4.CompletionItem({ label: name, description: `${scope} macro` }, vscode4.CompletionItemKind.Variable);
      item.insertText = name + suffix;
      item.range = range;
      item.sortText = `0_${name}`;
      return item;
    });
  }
};
function documentLines(document) {
  return document.getText().split(/\r?\n/);
}
var StataHoverProvider = class {
  provideHover(document, position) {
    try {
      const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
      if (!range) {
        return void 0;
      }
      const lineText = document.lineAt(position.line).text;
      const before = lineText.slice(0, range.start.character);
      if (isInComment(before) || /[`$]\{?$/.test(before)) {
        return void 0;
      }
      const word = document.getText(range);
      const after = lineText.slice(range.end.character);
      if (/^\s*\(/.test(after)) {
        const fn = resolveFunction(word);
        if (fn) {
          const md = new vscode4.MarkdownString();
          md.appendCodeblock(fn.signature, "stata");
          md.appendMarkdown(fn.doc);
          return new vscode4.Hover(md, range);
        }
      }
      if (isCommandPosition(before) || /(\(|\|\|)\s*$/.test(before)) {
        const cmd = resolveCommand(word);
        if (cmd) {
          return new vscode4.Hover(commandMarkdown(cmd), range);
        }
      }
      return void 0;
    } catch {
      return void 0;
    }
  }
};
function registerLanguageFeatures(context) {
  context.subscriptions.push(
    vscode4.languages.registerCompletionItemProvider(SELECTOR, new StataCompletionProvider(), "`", "$"),
    vscode4.languages.registerHoverProvider(SELECTOR, new StataHoverProvider())
  );
}

// src/outline.ts
var vscode5 = __toESM(require("vscode"));
var SELECTOR2 = { language: "stata" };
var SYMBOL_KINDS = {
  section: vscode5.SymbolKind.Namespace,
  cell: vscode5.SymbolKind.Module,
  program: vscode5.SymbolKind.Function
};
function toSymbol(document, node) {
  const last = Math.min(node.end, document.lineCount - 1);
  const range = new vscode5.Range(node.start, 0, last, document.lineAt(last).text.length);
  const selection = document.lineAt(node.line).range;
  const detail = node.kind === "section" ? "#".repeat(node.level) : node.kind;
  const symbol = new vscode5.DocumentSymbol(node.name, detail, SYMBOL_KINDS[node.kind], range, selection);
  symbol.children = node.children.map((c) => toSymbol(document, c));
  return symbol;
}
var StataSymbolProvider = class {
  provideDocumentSymbols(document) {
    try {
      return buildOutline(document.getText().split(/\r?\n/)).map((n) => toSymbol(document, n));
    } catch (err) {
      console.error("Stata outline failed:", err);
      return [];
    }
  }
};
var StataFoldingProvider = class {
  provideFoldingRanges(document) {
    try {
      return computeFoldingRanges(document.getText().split(/\r?\n/)).map((r) => {
        const kind = r.kind === "comment" ? vscode5.FoldingRangeKind.Comment : r.kind === "region" ? vscode5.FoldingRangeKind.Region : void 0;
        return new vscode5.FoldingRange(r.start, r.end, kind);
      });
    } catch (err) {
      console.error("Stata folding failed:", err);
      return [];
    }
  }
};
function registerOutline(context) {
  context.subscriptions.push(
    vscode5.languages.registerDocumentSymbolProvider(SELECTOR2, new StataSymbolProvider(), { label: "Stata" }),
    vscode5.languages.registerFoldingRangeProvider(SELECTOR2, new StataFoldingProvider())
  );
}

// src/cells.ts
var vscode6 = __toESM(require("vscode"));
var positron4 = __toESM(require("positron"));
var CODELENS_SETTING = "positron-stata.codeLens.enabled";
function linesOf(document) {
  return document.getText().split(/\r?\n/);
}
async function execute(code) {
  if (!code.trim()) {
    vscode6.window.setStatusBarMessage("Stata: nothing to run", 2e3);
    return;
  }
  try {
    await positron4.runtime.executeCode("stata", code, false, true);
  } catch (err) {
    vscode6.window.showErrorMessage(`Stata: failed to execute code: ${err instanceof Error ? err.message : String(err)}`);
  }
}
async function resolveTarget(uri, line) {
  if (uri instanceof vscode6.Uri && typeof line === "number") {
    const editor2 = vscode6.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
    const document = editor2?.document ?? await vscode6.workspace.openTextDocument(uri);
    return { document, editor: editor2, line };
  }
  const editor = vscode6.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "stata") {
    vscode6.window.showWarningMessage("Open a Stata do-file to run code.");
    return void 0;
  }
  return { document: editor.document, editor, line: editor.selection.active.line };
}
function moveCursor(editor, line) {
  const doc = editor.document;
  const target = Math.min(line, doc.lineCount - 1);
  const pos = line >= doc.lineCount ? doc.lineAt(target).range.end : new vscode6.Position(target, 0);
  editor.selection = new vscode6.Selection(pos, pos);
  editor.revealRange(new vscode6.Range(pos, pos), vscode6.TextEditorRevealType.InCenterIfOutsideViewport);
}
function firstBodyLine(cell) {
  return cell.markerLine !== void 0 ? cell.markerLine + 1 : cell.start;
}
async function runCell(uri, line) {
  const t = await resolveTarget(uri, line);
  if (!t) {
    return;
  }
  const lines = linesOf(t.document);
  const cells = findCells(lines);
  await execute(cellCode(lines, cells[cellIndexAt(cells, t.line)]));
}
async function runCellAndAdvance() {
  const t = await resolveTarget();
  if (!t?.editor) {
    return;
  }
  const lines = linesOf(t.document);
  const cells = findCells(lines);
  const i = cellIndexAt(cells, t.line);
  await execute(cellCode(lines, cells[i]));
  moveCursor(t.editor, i + 1 < cells.length ? firstBodyLine(cells[i + 1]) : t.document.lineCount);
}
async function runCellsAbove(uri, line) {
  const t = await resolveTarget(uri, line);
  if (!t) {
    return;
  }
  const lines = linesOf(t.document);
  const cells = findCells(lines);
  await execute(rangeCode(lines, 0, cells[cellIndexAt(cells, t.line)].start - 1));
}
async function runNextCell(uri, line) {
  const t = await resolveTarget(uri, line);
  if (!t) {
    return;
  }
  const lines = linesOf(t.document);
  const cells = findCells(lines);
  const next = cellIndexAt(cells, t.line) + 1;
  if (next >= cells.length) {
    vscode6.window.setStatusBarMessage("Stata: no next cell", 2e3);
    return;
  }
  await execute(cellCode(lines, cells[next]));
  if (t.editor && t.editor === vscode6.window.activeTextEditor) {
    moveCursor(t.editor, firstBodyLine(cells[next]));
  }
}
async function runSection(uri, line) {
  const t = await resolveTarget(uri, line);
  if (!t) {
    return;
  }
  const lines = linesOf(t.document);
  const sections = findSections(lines);
  const i = sectionIndexAt(sections, t.line);
  if (i < 0) {
    vscode6.window.setStatusBarMessage("Stata: cursor is not inside a **# section", 2500);
    return;
  }
  await execute(sectionCode(lines, sections, i));
}
async function runToCursor() {
  const t = await resolveTarget();
  if (t) {
    await execute(rangeCode(linesOf(t.document), 0, t.line));
  }
}
async function runFromCursor() {
  const t = await resolveTarget();
  if (t) {
    const lines = linesOf(t.document);
    await execute(rangeCode(lines, t.line, lines.length - 1));
  }
}
var StataCellCodeLensProvider = class {
  changed = new vscode6.EventEmitter();
  onDidChangeCodeLenses = this.changed.event;
  refresh() {
    this.changed.fire();
  }
  provideCodeLenses(document) {
    if (!vscode6.workspace.getConfiguration().get(CODELENS_SETTING, true)) {
      return [];
    }
    try {
      const lines = linesOf(document);
      const lenses = [];
      const uri = document.uri;
      if (hasCellMarkers(lines)) {
        const cells = findCells(lines);
        cells.forEach((cell, i) => {
          if (cell.markerLine === void 0) {
            return;
          }
          const range = new vscode6.Range(cell.markerLine, 0, cell.markerLine, 0);
          const args = [uri, cell.markerLine];
          lenses.push(new vscode6.CodeLens(range, { title: "$(play) Run Cell", command: "stata.runCurrentCell", arguments: args }));
          if (i > 0) {
            lenses.push(new vscode6.CodeLens(range, { title: "Run Above", command: "stata.runCellsAbove", arguments: args }));
          }
          if (i + 1 < cells.length) {
            lenses.push(new vscode6.CodeLens(range, { title: "Run Next Cell", command: "stata.runNextCell", arguments: args }));
          }
        });
      }
      const sections = findSections(lines);
      sections.forEach((s, i) => {
        const r = sectionRange(sections, i, lines.length);
        if (r.end <= r.start) {
          return;
        }
        lenses.push(
          new vscode6.CodeLens(new vscode6.Range(s.line, 0, s.line, 0), {
            title: "$(play) Run Section",
            command: "stata.runSection",
            arguments: [uri, s.line]
          })
        );
      });
      return lenses;
    } catch (err) {
      console.error("Stata code lens failed:", err);
      return [];
    }
  }
};
function trackContextKeys(context) {
  let timer;
  let last = { cells: false, sections: false };
  const update = () => {
    const doc = vscode6.window.activeTextEditor?.document;
    const lines = doc?.languageId === "stata" ? linesOf(doc) : [];
    const next = { cells: hasCellMarkers(lines), sections: findSections(lines).length > 0 };
    if (next.cells !== last.cells) {
      vscode6.commands.executeCommand("setContext", "stata.hasCodeCells", next.cells);
    }
    if (next.sections !== last.sections) {
      vscode6.commands.executeCommand("setContext", "stata.hasSections", next.sections);
    }
    last = next;
  };
  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(update, 200);
  };
  context.subscriptions.push(
    vscode6.window.onDidChangeActiveTextEditor(update),
    vscode6.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode6.window.activeTextEditor?.document) {
        schedule();
      }
    }),
    { dispose: () => timer && clearTimeout(timer) }
  );
  update();
}
function registerCells(context) {
  const lensProvider = new StataCellCodeLensProvider();
  context.subscriptions.push(
    vscode6.languages.registerCodeLensProvider({ language: "stata" }, lensProvider),
    vscode6.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CODELENS_SETTING)) {
        lensProvider.refresh();
      }
    }),
    vscode6.commands.registerCommand("stata.runCurrentCell", runCell),
    vscode6.commands.registerCommand("stata.runCurrentCellAndAdvance", runCellAndAdvance),
    vscode6.commands.registerCommand("stata.runCellsAbove", runCellsAbove),
    vscode6.commands.registerCommand("stata.runNextCell", runNextCell),
    vscode6.commands.registerCommand("stata.runSection", runSection),
    vscode6.commands.registerCommand("stata.runToCursor", runToCursor),
    vscode6.commands.registerCommand("stata.runFromCursor", runFromCursor)
  );
  trackContextKeys(context);
}

// src/statementRange.ts
var vscode7 = __toESM(require("vscode"));
var positron5 = __toESM(require("positron"));

// src/statementParser.ts
var PREFIX = "(?:(?:cap|capt|captu|captur|capture|qui|quie|quiet|quietl|quietly|n|no|noi|nois|noisi|noisil|noisily)\\s+)*";
var MATA_BLOCK = new RegExp(`^${PREFIX}mata\\s*:?$`);
var PYTHON_BLOCK = new RegExp(`^${PREFIX}python\\s*:?$`);
var INPUT_BLOCK = /^input\b/;
var END_LINE = /^\s*end\b/;
var END_STATEMENT = /^end\b/;
var IF_START = new RegExp(`^${PREFIX}if\\b`);
var ELSE_START = /^else\b/;
var DELIMIT = /^#d(?:e(?:l(?:i(?:m(?:i(?:t)?)?)?)?)?)?(?![A-Za-z0-9_])(.*)$/;
var isWs = (ch) => ch !== void 0 && /\s/.test(ch);
var startsLineComment = (line, k) => line[k] === "/" && line[k + 1] === "/" && (k === 0 || isWs(line[k - 1]));
var CONTINUATION = /(?:^|\s)\/\/\//;
function stripComments(text) {
  return text.replace(/\/\*.*?\*\//g, " ").replace(/(?:^|\s)\/\/.*$/, "");
}
function comparePos(a, b) {
  return a.line - b.line || a.character - b.character;
}
function lexStatements(lines) {
  const out = [];
  const n = lines.length;
  let semi = false;
  let l = 0;
  let c = 0;
  const skipGap = () => {
    let depth = 0;
    while (l < n) {
      const line = lines[l];
      if (c >= line.length) {
        l++;
        c = 0;
        continue;
      }
      const ch = line[c];
      const next = line[c + 1];
      if (depth > 0) {
        if (ch === "/" && next === "*") {
          depth++;
          c += 2;
        } else if (ch === "*" && next === "/") {
          depth--;
          c += 2;
        } else {
          c++;
        }
        continue;
      }
      if (isWs(ch)) {
        c++;
      } else if (ch === "/" && next === "*") {
        depth = 1;
        c += 2;
      } else if (startsLineComment(line, c)) {
        c = line.length;
      } else if (ch === "*") {
        if (semi) {
          for (; ; ) {
            const idx = lines[l].indexOf(";", c);
            if (idx >= 0) {
              c = idx + 1;
              break;
            }
            l++;
            c = 0;
            if (l >= n) {
              return false;
            }
          }
        } else {
          let cont = CONTINUATION.test(line.slice(c + 1));
          l++;
          c = 0;
          while (cont && l < n) {
            cont = CONTINUATION.test(lines[l]);
            l++;
          }
        }
      } else {
        return true;
      }
    }
    return false;
  };
  while (skipGap()) {
    const start = { line: l, character: c };
    const directive = DELIMIT.exec(stripComments(lines[l].slice(c)).trim());
    if (directive) {
      out.push({ start, end: { line: l, character: lines[l].length }, code: lines[l].slice(c).trim(), braceDelta: 0, semicolon: semi, directive: true });
      semi = directive[1].trim() !== "cr";
      l++;
      c = 0;
      continue;
    }
    let code = "";
    let braces = 0;
    let depth = 0;
    let inString = false;
    let compound = 0;
    let continued = false;
    let end;
    outer: while (l < n) {
      const line = lines[l];
      while (c < line.length) {
        const ch = line[c];
        const next = line[c + 1];
        if (depth > 0) {
          if (ch === "/" && next === "*") {
            depth++;
            c += 2;
          } else if (ch === "*" && next === "/") {
            depth--;
            c += 2;
          } else {
            c++;
          }
          continue;
        }
        if (compound > 0) {
          if (ch === "`" && next === '"') {
            compound++;
            c += 2;
          } else if (ch === '"' && next === "'") {
            compound--;
            c += 2;
            if (compound === 0) {
              code += '"';
            }
          } else {
            c++;
          }
          continue;
        }
        if (inString) {
          if (ch === '"') {
            inString = false;
            code += '"';
          }
          c++;
          continue;
        }
        if (ch === "`" && next === '"') {
          compound = 1;
          code += '"';
          c += 2;
        } else if (ch === '"') {
          inString = true;
          code += '"';
          c++;
        } else if (ch === "/" && next === "*") {
          depth = 1;
          code += " ";
          c += 2;
        } else if (startsLineComment(line, c)) {
          continued = line[c + 2] === "/";
          c = line.length;
        } else if (semi && ch === ";") {
          c++;
          end = { line: l, character: c };
          break outer;
        } else if (ch === "$" && next === "{") {
          const close = line.indexOf("}", c);
          const stop = close < 0 ? line.length : close + 1;
          code += line.slice(c, stop);
          c = stop;
        } else {
          if (ch === "{") {
            braces++;
          } else if (ch === "}") {
            braces--;
          }
          code += ch;
          c++;
        }
      }
      inString = false;
      compound = 0;
      if (!semi && depth === 0 && !continued) {
        end = { line: l, character: line.length };
        l++;
        c = 0;
        break;
      }
      continued = false;
      code += " ";
      l++;
      c = 0;
    }
    end ??= { line: n - 1, character: lines[n - 1].length };
    code = code.replace(/\s+/g, " ").trim();
    if (!code) {
      continue;
    }
    const raw = { start, end, code, braceDelta: braces, semicolon: semi };
    const block = MATA_BLOCK.test(code) ? "mata" : PYTHON_BLOCK.test(code) ? "python" : INPUT_BLOCK.test(code) ? "input" : void 0;
    if (block) {
      let e = end.line + 1;
      while (e < n && !END_LINE.test(lines[e])) {
        e++;
      }
      if (e < n) {
        raw.end = { line: e, character: lines[e].length };
        raw.block = block;
        raw.braceDelta = 0;
        l = e + 1;
        c = 0;
      }
    }
    out.push(raw);
  }
  return out;
}
function braceBlockEnd(raws, from) {
  let depth = 0;
  for (let j = from; j < raws.length; j++) {
    depth += raws[j].braceDelta;
    if (depth <= 0) {
      return j;
    }
  }
  return -1;
}
function parseStatements(lines) {
  const raws = lexStatements(lines);
  const out = [];
  let i = 0;
  while (i < raws.length) {
    const r = raws[i];
    let last = i;
    let complete = true;
    if (!r.directive && !r.block && programName(r.code)) {
      const j = raws.findIndex((x, k) => k > i && END_STATEMENT.test(x.code));
      if (j >= 0) {
        last = j;
      }
    } else if (r.braceDelta > 0) {
      const j = braceBlockEnd(raws, i);
      if (j >= 0) {
        last = j;
      } else {
        complete = false;
      }
    }
    if (complete && !r.directive && IF_START.test(r.code)) {
      while (last + 1 < raws.length && ELSE_START.test(raws[last + 1].code)) {
        if (raws[last + 1].braceDelta > 0) {
          const j = braceBlockEnd(raws, last + 1);
          if (j < 0) {
            break;
          }
          last = j;
        } else {
          last++;
        }
      }
    }
    out.push({ start: r.start, end: raws[last].end, semicolon: r.semicolon && !r.directive });
    i = last + 1;
  }
  return out;
}
function statementAt(lines, pos) {
  const statements = parseStatements(lines);
  const p = { line: pos.line, character: Math.min(pos.character, lines[pos.line]?.length ?? 0) };
  const inside = statements.find((s) => comparePos(s.start, p) <= 0 && comparePos(p, s.end) < 0) ?? statements.find((s) => comparePos(p, s.end) === 0);
  if (inside) {
    return inside;
  }
  const laterOnLine = statements.find((s) => s.start.line === p.line && comparePos(s.start, p) > 0);
  if (laterOnLine) {
    return laterOnLine;
  }
  const earlierOnLine = statements.filter((s) => s.end.line === p.line && comparePos(s.end, p) < 0).pop();
  return earlierOnLine ?? statements.find((s) => comparePos(s.start, p) > 0);
}
function sliceText(lines, start, end) {
  if (start.line === end.line) {
    return lines[start.line].slice(start.character, end.character);
  }
  const parts = [lines[start.line].slice(start.character)];
  for (let i = start.line + 1; i < end.line; i++) {
    parts.push(lines[i]);
  }
  parts.push(lines[end.line].slice(0, end.character));
  return parts.join("\n");
}
function statementCode(lines, statement) {
  if (!statement.semicolon) {
    return void 0;
  }
  return `#delimit ;
${sliceText(lines, statement.start, statement.end)}
#delimit cr`;
}
function maskText(text) {
  const out = [];
  const kinds = [];
  const push = (ch, kind) => {
    out.push(ch);
    kinds.push(kind);
  };
  let depth = 0;
  let inString = false;
  let compound = 0;
  let lineComment = false;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    const next = text[k + 1];
    if (ch === "\n") {
      lineComment = inString = false;
      compound = 0;
      push("\n", 0 /* Code */);
    } else if (lineComment) {
      push(" ", 2 /* Comment */);
    } else if (depth > 0) {
      if (ch === "/" && next === "*" || ch === "*" && next === "/") {
        depth += ch === "/" ? 1 : -1;
        push(" ", 2 /* Comment */);
        k++;
      }
      push(" ", 2 /* Comment */);
    } else if (compound > 0) {
      if (ch === "`" && next === '"') {
        compound++;
        push(" ", 1 /* String */);
        push(" ", 1 /* String */);
        k++;
      } else if (ch === '"' && next === "'") {
        compound--;
        push(compound ? " " : '"', 1 /* String */);
        push(" ", 1 /* String */);
        k++;
      } else {
        push(" ", 1 /* String */);
      }
    } else if (inString) {
      inString = ch !== '"';
      push(inString ? " " : '"', 1 /* String */);
    } else if (ch === "`" && next === '"') {
      compound = 1;
      push('"', 1 /* String */);
      push(" ", 1 /* String */);
      k++;
    } else if (ch === '"') {
      inString = true;
      push('"', 1 /* String */);
    } else if (ch === "/" && next === "*") {
      depth = 1;
      push(" ", 2 /* Comment */);
      push(" ", 2 /* Comment */);
      k++;
    } else if (ch === "/" && next === "/" && (k === 0 || isWs(text[k - 1]))) {
      lineComment = true;
      push(" ", 2 /* Comment */);
    } else {
      push(ch, 0 /* Code */);
    }
  }
  return { masked: out.join(""), kinds };
}
var PREFIX_WORD = new RegExp(`^(?:qui|quie|quiet|quietl|quietly|n|no|noi|nois|noisi|noisil|noisily|cap|capt|captu|captur|capture|else)$`);
var COLON_PREFIXES = /* @__PURE__ */ new Set(["frame", "version", "mi", "eststo", "estpost", "collect", "timeit"]);
var FV_OP = /^(?:i|c|o|b|bn|ib|io|ibn|i\d+|b\d+|o\d+|ib\d+|io\d+)$/;
var TS_OP = /^(?:[LFDS]\d*)+$/i;
var FILE_EXTENSION = /^(?:dta|do|ado|csv|txt|log|smcl|xlsx?|gph|png|pdf|svg|tex|rtf|docx?|sthlp|json|parquet)$/i;
var WEIGHTS = /^(?:aw|fw|pw|iw|aweight|fweight|pweight|iweight)$/;
var RESULT_FUNCTIONS = { r: "return", e: "ereturn", c: "creturn", s: "return" };
var TOPIC = /^[A-Za-z0-9_.]+$/;
function topLevelIndexOf(masked, ch, from) {
  let depth = 0;
  for (let k = from; k < masked.length; k++) {
    const x = masked[k];
    if (x === "(" || x === "[") {
      depth++;
    } else if (x === ")" || x === "]") {
      depth = Math.max(0, depth - 1);
    } else if (x === ch && depth === 0) {
      return k;
    }
  }
  return -1;
}
function isOption(masked, from, to) {
  let depth = 0;
  let comma = false;
  for (let k = from; k < to; k++) {
    const x = masked[k];
    if (x === "(" || x === "[") {
      depth++;
    } else if (x === ")" || x === "]") {
      depth = Math.max(0, depth - 1);
    } else if (x === "," && depth === 0) {
      comma = true;
    }
  }
  return comma && depth === 0;
}
function commandWords(masked) {
  const words = [];
  const wordRe = /[A-Za-z_]\w*/y;
  let i = 0;
  for (; ; ) {
    while (i < masked.length && /[\s{}]/.test(masked[i])) {
      i++;
    }
    wordRe.lastIndex = i;
    const m = wordRe.exec(masked);
    if (!m) {
      break;
    }
    const word = m[0];
    const start = i;
    const end = i + word.length;
    if (PREFIX_WORD.test(word)) {
      i = end;
      while (i < masked.length && isWs(masked[i])) {
        i++;
      }
      if (masked[i] === ":") {
        i++;
      }
      words.push({ word, start, end, segEnd: i, isPrefix: true });
      continue;
    }
    const cmd = resolveCommand(word);
    if (cmd?.category === "prefix" || COLON_PREFIXES.has(word)) {
      const colon = topLevelIndexOf(masked, ":", end);
      if (colon >= 0) {
        words.push({ word, start, end, segEnd: colon, isPrefix: true });
        i = colon + 1;
        continue;
      }
    }
    words.push({ word, start, end, segEnd: masked.length, isPrefix: false });
    break;
  }
  return words;
}
function commandTopic(word) {
  const name = resolveCommand(word)?.name ?? word;
  switch (name) {
    case "bysort":
      return "by";
    case "if":
    case "else":
      return "ifcmd";
    case "end":
      return "program";
    default:
      return name;
  }
}
function wordAt(text, offset) {
  const isWord = (ch) => ch !== void 0 && /\w/.test(ch);
  let s = offset;
  if (!isWord(text[s])) {
    if (!isWord(text[s - 1])) {
      return void 0;
    }
    s--;
  }
  let e = s;
  while (s > 0 && isWord(text[s - 1])) {
    s--;
  }
  while (isWord(text[e])) {
    e++;
  }
  return { start: s, end: e };
}
function helpTopicAt(lines, pos) {
  const raws = lexStatements(lines);
  const lineText = lines[pos.line] ?? "";
  const p = { line: pos.line, character: Math.min(pos.character, lineText.length) };
  const raw = raws.find((r) => comparePos(r.start, p) <= 0 && comparePos(p, r.end) <= 0) ?? raws.find((r) => r.start.line === p.line && r.start.character >= p.character && lineText.slice(p.character, r.start.character).trim() === "");
  if (!raw) {
    return "";
  }
  if (raw.directive) {
    return "delimit";
  }
  if (raw.block && p.line > raw.start.line) {
    if (raw.block !== "mata") {
      return raw.block;
    }
    const w = wordAt(lineText, p.character);
    const name = w && lineText.slice(w.start, w.end);
    return name && lineText[w.end] === "(" && /^[A-Za-z_]\w*$/.test(name) ? `mf_${name}` : "mata";
  }
  const end = raw.block ? { line: raw.start.line, character: lines[raw.start.line].length } : raw.end;
  const text = sliceText(lines, raw.start, end);
  const offset = comparePos(p, raw.start) <= 0 ? 0 : p.line === raw.start.line ? p.character - raw.start.character : lines.slice(raw.start.line, p.line).reduce((acc, l, idx) => acc + (idx === 0 ? l.length - raw.start.character : l.length) + 1, 0) + p.character;
  const { masked, kinds } = maskText(text);
  const kind = kinds[offset] ?? kinds[offset - 1];
  if (kind === 2 /* Comment */) {
    return "";
  }
  const words = commandWords(masked);
  const segment = words.find((w) => offset >= w.start && offset <= w.segEnd) ?? words[words.length - 1];
  const fallback = segment ? commandTopic(segment.word) : "";
  const sanitize = (topic) => TOPIC.test(topic) ? topic : "";
  const tok = kind === 1 /* String */ ? void 0 : wordAt(masked, offset);
  if (!tok) {
    return sanitize(fallback);
  }
  const token = masked.slice(tok.start, tok.end);
  const before = masked[tok.start - 1];
  if (before === "`" || before === "$" || before === "{" && masked[tok.start - 2] === "$") {
    return "macro";
  }
  let ts = tok.start;
  let te = tok.end;
  while (ts > 0 && /[\w.#]/.test(masked[ts - 1])) {
    ts--;
  }
  while (te < masked.length && /[\w.#]/.test(masked[te])) {
    te++;
  }
  const term = masked.slice(ts, te);
  if (/\w#|#\w|##/.test(term)) {
    return "fvvarlist";
  }
  const parts = term.split(".");
  if (parts.length >= 2 && parts[1] !== "" && !FILE_EXTENSION.test(parts[parts.length - 1])) {
    if (FV_OP.test(parts[0])) {
      return "fvvarlist";
    }
    if (TS_OP.test(parts[0])) {
      return "tsvarlist";
    }
  }
  const commandWord = words.find((w) => w.start === tok.start);
  if (commandWord) {
    return sanitize(commandTopic(commandWord.word));
  }
  const mataContext = raw.block === "mata" || words.some((w) => w.word === "mata");
  if (masked[tok.end] === "(") {
    if (RESULT_FUNCTIONS[token]) {
      return RESULT_FUNCTIONS[token];
    }
    if (mataContext) {
      return sanitize(`mf_${token}`);
    }
    if (!isOption(masked, segment ? segment.end : 0, tok.start) && fallback !== "egen" && (resolveFunction(token) || /^[A-Za-z_]\w*$/.test(token))) {
      return sanitize(`f_${token}`);
    }
    return sanitize(fallback);
  }
  if (mataContext) {
    return "mata";
  }
  if (token === "if" && fallback !== "ifcmd") {
    return "if";
  }
  if (token === "in" && fallback !== "foreach") {
    return "in";
  }
  if (WEIGHTS.test(token) && masked.slice(0, tok.start).trimEnd().endsWith("[")) {
    return "weight";
  }
  return sanitize(fallback);
}

// src/statementRange.ts
function registerStatementRangeProvider(context) {
  context.subscriptions.push(
    positron5.languages.registerStatementRangeProvider({ language: "stata" }, {
      provideStatementRange(document, position) {
        const lines = document.getText().split(/\r?\n/);
        const statement = statementAt(lines, { line: position.line, character: position.character });
        if (!statement) {
          return void 0;
        }
        const range = new vscode7.Range(
          statement.start.line,
          statement.start.character,
          statement.end.line,
          statement.end.character
        );
        const code = statementCode(lines, statement);
        return code === void 0 ? { range } : { range, code };
      }
    })
  );
}

// src/helpTopic.ts
var positron6 = __toESM(require("positron"));
function registerHelpTopicProvider(context) {
  context.subscriptions.push(
    positron6.languages.registerHelpTopicProvider({ language: "stata" }, {
      provideHelpTopic(document, position) {
        return helpTopicAt(document.getText().split(/\r?\n/), { line: position.line, character: position.character });
      }
    })
  );
}

// src/sampleDoFile.ts
var SAMPLE_DO_FILE = `**# Welcome to Stata in Positron
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

// src/extension.ts
var runtimeManager;
var WALKTHROUGH_SHOWN_KEY = "walkthroughShown.v1";
function activate(context) {
  console.log("Activating Positron Stata Extension...");
  const stataEnv = new StataEnvironment(context);
  context.subscriptions.push(stataEnv);
  runtimeManager = new StataRuntimeManager(context, stataEnv);
  const runtimeRegistration = positron7.runtime.registerLanguageRuntimeManager("stata", runtimeManager);
  context.subscriptions.push(runtimeRegistration);
  (async () => {
    try {
      for await (const runtime4 of runtimeManager.discoverAllRuntimes()) {
        console.log(`Discovered Stata runtime: ${runtime4.runtimeName} (${runtime4.runtimeId})`);
      }
    } catch (err) {
      console.error("Error during initial Stata runtime discovery:", err);
    }
  })();
  const dtaEditorRegistration = DtaCustomEditorProvider.register(context);
  context.subscriptions.push(dtaEditorRegistration);
  context.subscriptions.push(
    vscode8.commands.registerCommand("stata.runLineOrSelection", async () => {
      await vscode8.commands.executeCommand("workbench.action.positronConsole.executeCode");
    })
  );
  context.subscriptions.push(
    vscode8.commands.registerCommand("stata.doFile", async () => {
      const editor = vscode8.window.activeTextEditor;
      if (!editor) {
        vscode8.window.showWarningMessage("No active Stata do-file open.");
        return;
      }
      let filePath;
      if (editor.document.isUntitled) {
        const tempDir = path7.join(os3.tmpdir(), "positron-stata");
        if (!fs6.existsSync(tempDir)) {
          fs6.mkdirSync(tempDir, { recursive: true });
        }
        const tempFile = path7.join(tempDir, `untitled_${Date.now()}.do`);
        fs6.writeFileSync(tempFile, editor.document.getText(), "utf8");
        filePath = tempFile.replace(/\\/g, "/");
      } else {
        if (editor.document.isDirty && !await editor.document.save()) {
          vscode8.window.showWarningMessage("Save the do-file before running it.");
          return;
        }
        filePath = editor.document.uri.fsPath.replace(/\\/g, "/");
      }
      const doCmd = `do \`"${filePath}"'
`;
      await positron7.runtime.executeCode("stata", doCmd, true, true);
    })
  );
  context.subscriptions.push(
    vscode8.commands.registerCommand("stata.openDataExplorer", async () => {
      await positron7.runtime.executeCode("stata", "browse\n", false, true);
    })
  );
  context.subscriptions.push(
    vscode8.commands.registerCommand("stata.openDtaInDataExplorer", async (uri) => {
      const targetUri = uri || vscode8.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        vscode8.window.showWarningMessage("No .dta file selected.");
        return;
      }
      await openDtaInNativeDataExplorer(targetUri, context);
    })
  );
  registerLanguageFeatures(context);
  registerOutline(context);
  registerCells(context);
  registerStatementRangeProvider(context);
  registerHelpTopicProvider(context);
  const walkthroughId = `${context.extension.id}#stata.gettingStarted`;
  context.subscriptions.push(
    vscode8.commands.registerCommand("stata.setupEnvironment", () => stataEnv.setupEnvironment()),
    vscode8.commands.registerCommand("stata.diagnose", () => stataEnv.diagnose()),
    vscode8.commands.registerCommand("stata.chooseInterpreter", () => stataEnv.chooseInterpreter()),
    vscode8.commands.registerCommand("stata.connect", async () => {
      const { selected } = await stataEnv.selectPython();
      if (!findInstallations().length) {
        await stataEnv.diagnose();
      } else if (!selected) {
        await stataEnv.setupEnvironment();
      } else {
        await stataEnv.startStata();
      }
    }),
    vscode8.commands.registerCommand("stata.openSampleDoFile", async () => {
      const doc = await vscode8.workspace.openTextDocument({ language: "stata", content: SAMPLE_DO_FILE });
      await vscode8.window.showTextDocument(doc);
    }),
    vscode8.commands.registerCommand(
      "stata.openWalkthrough",
      () => vscode8.commands.executeCommand("workbench.action.openWalkthrough", walkthroughId, false)
    ),
    stataEnv.onDidSetup((python) => void stataEnv.refreshKernelspec(python)),
    vscode8.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("positron-stata.stataHome") || e.affectsConfiguration("positron-stata.stataEdition")) {
        runtimeManager?.rediscover();
        void stataEnv.refreshKernelspec();
      }
      if (e.affectsConfiguration("positron-stata.pythonPath")) {
        void stataEnv.selectPython({ force: true }).then(() => stataEnv.refreshKernelspec());
      } else if (e.affectsConfiguration("positron-stata.dataExplorer.showValueLabels") || e.affectsConfiguration("positron-stata.jupyterKernelspec.enabled")) {
        void stataEnv.refreshKernelspec();
      }
    })
  );
  void (async () => {
    try {
      const installs = findInstallations();
      if (!installs.length) {
        return;
      }
      if (!context.globalState.get(WALKTHROUGH_SHOWN_KEY)) {
        await context.globalState.update(WALKTHROUGH_SHOWN_KEY, true);
        void vscode8.commands.executeCommand("workbench.action.openWalkthrough", walkthroughId, false);
      }
      const { selected } = await stataEnv.selectPython();
      if (selected) {
        await stataEnv.refreshKernelspec(selected.result.executable || selected.candidate.path);
      } else if (installs.some((i) => i.hasPyStata !== false)) {
        stataEnv.promptSetup();
      }
    } catch (err) {
      stataEnv.log(`Startup check failed: ${err.message}`);
    }
  })();
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
