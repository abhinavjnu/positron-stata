// Pure helpers for finding and vetting the Python interpreter that hosts the Stata kernel.
// No `vscode` imports so this module can be unit-tested with node:test.
import * as path from 'path';
import { execFile } from 'child_process';

/** PyStata supports Python 3.9 through 3.13 (it refuses to load on 3.14+). */
export const MIN_PYTHON_MINOR = 9;
export const MAX_PYTHON_MINOR = 13;
const SUPPORTED_MINORS: readonly number[] = [13, 12, 11, 10, 9];
export const SETUP_PYTHON_VERSION = '3.12';
export const REQUIRED_PACKAGES = ['numpy', 'pandas'] as const;
export const OPTIONAL_PACKAGES = ['pyarrow', 'pyreadstat'] as const;

export interface PythonCandidate {
    /** Executable (or launcher such as `py`) to run. */
    path: string;
    /** Extra launcher arguments, e.g. `['-3.12']` for the Windows `py` launcher. */
    args?: string[];
    /** Human-readable origin, shown in diagnostics. */
    source: string;
}

interface CandidateOptions {
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
    exists: (p: string) => boolean;
    listDir: (p: string) => string[];
    configured?: string;
    /** Interpreters Positron already knows about (already filtered/sorted by the caller). */
    registered?: PythonCandidate[];
}

function pathApi(platform: NodeJS.Platform) {
    return platform === 'win32' ? path.win32 : path.posix;
}

function homeDir(env: NodeJS.ProcessEnv): string {
    return env.HOME || env.USERPROFILE || '';
}

/**
 * Where the dedicated helper environment lives. `POSITRON_STATA_DATA_DIR` overrides it (useful for tests).
 * Windows uses `%LOCALAPPDATA%\positron-stata`; elsewhere `~/.local/share/positron-stata`.
 */
export function dataDirectory(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
    const p = pathApi(platform);
    if (env.POSITRON_STATA_DATA_DIR) {
        return env.POSITRON_STATA_DATA_DIR;
    }
    if (platform === 'win32' && env.LOCALAPPDATA) {
        return p.join(env.LOCALAPPDATA, 'positron-stata');
    }
    return p.join(homeDir(env), '.local', 'share', 'positron-stata');
}


export function venvPython(venvDir: string, platform: NodeJS.Platform): string {
    const p = pathApi(platform);
    return platform === 'win32' ? p.join(venvDir, 'Scripts', 'python.exe') : p.join(venvDir, 'bin', 'python');
}

/** Microsoft Store "App Execution Alias" stubs print "Python was not found" instead of starting Python. */
function isWindowsAppsDir(dir: string): boolean {
    return /[\\/]Microsoft[\\/]WindowsApps[\\/]?$/i.test(dir);
}

/** Parses "3.12", "Python312", "PythonSoftwareFoundation.Python.3.12_..." into a minor version (3.x). */
export function minorFromName(name: string): number | undefined {
    const dotted = name.match(/3\.(\d+)/);
    if (dotted) return +dotted[1];
    const compact = name.match(/3(\d{1,2})(?!\d)/);
    return compact ? +compact[1] : undefined;
}

function isSupportedMinor(minor: number | undefined): boolean {
    return minor !== undefined && minor >= MIN_PYTHON_MINOR && minor <= MAX_PYTHON_MINOR;
}

function safeList(listDir: (p: string) => string[], dir: string): string[] {
    try {
        return listDir(dir);
    } catch {
        return [];
    }
}

/**
 * Ordered, de-duplicated list of interpreters worth probing. Version-specific names in the supported range
 * always come before generic `python3`/`python`, which may well be an unsupported 3.14+.
 */
export function enumeratePythonCandidates(opts: CandidateOptions): PythonCandidate[] {
    const { platform, env, exists, listDir } = opts;
    const win = platform === 'win32';
    const p = pathApi(platform);
    const out: PythonCandidate[] = [];
    const seen = new Set<string>();
    const add = (file: string, source: string, args?: string[]) => {
        const key = `${win ? file.toLowerCase() : file}\0${(args || []).join(' ')}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(args ? { path: file, args, source } : { path: file, source });
    };
    const addIfExists = (file: string, source: string) => {
        if (file && exists(file)) add(file, source);
    };

    if (opts.configured) addIfExists(opts.configured, 'positron-stata.pythonPath setting');

    addIfExists(venvPython(p.join(dataDirectory(platform, env), 'venv'), platform), 'Stata helper environment');

    if (env.VIRTUAL_ENV) {
        const rels = win ? [['Scripts', 'python.exe']] : [['bin', 'python3'], ['bin', 'python']];
        const hit = rels.map(r => p.join(env.VIRTUAL_ENV!, ...r)).find(exists);
        if (hit) add(hit, 'active virtualenv (VIRTUAL_ENV)');
    }
    if (env.CONDA_PREFIX) {
        const rels = win ? [['python.exe']] : [['bin', 'python3'], ['bin', 'python']];
        const hit = rels.map(r => p.join(env.CONDA_PREFIX!, ...r)).find(exists);
        if (hit) add(hit, 'active conda environment (CONDA_PREFIX)');
    }

    for (const c of opts.registered || []) {
        if (c.args?.length) add(c.path, c.source, c.args);
        else addIfExists(c.path, c.source);
    }

    const pathDirs = (env.PATH || env.Path || '')
        .split(win ? ';' : ':')
        .filter(d => d && !(win && isWindowsAppsDir(d)));

    if (!win) {
        for (const minor of SUPPORTED_MINORS) {
            for (const dir of pathDirs) addIfExists(p.join(dir, `python3.${minor}`), 'PATH');
        }
        for (const minor of SUPPORTED_MINORS) {
            for (const file of [
                `/opt/homebrew/bin/python3.${minor}`,
                `/usr/local/bin/python3.${minor}`,
                `/Library/Frameworks/Python.framework/Versions/3.${minor}/bin/python3`,
                `/home/linuxbrew/.linuxbrew/bin/python3.${minor}`,
                `/usr/bin/python3.${minor}`
            ]) {
                addIfExists(file, 'standard install location');
            }
        }
    } else {
        const localAppData = env.LOCALAPPDATA;
        const bases = [
            localAppData && p.join(localAppData, 'Programs', 'Python'),
            env.ProgramFiles,
            env['ProgramFiles(x86)'],
            'C:\\'
        ].filter((b): b is string => !!b);
        for (const base of bases) {
            const dirs = safeList(listDir, base)
                .filter(d => /^Python3\d+$/i.test(d) && isSupportedMinor(minorFromName(d)))
                .sort((a, b) => (minorFromName(b) ?? 0) - (minorFromName(a) ?? 0));
            for (const dir of dirs) addIfExists(p.join(base, dir, 'python.exe'), 'python.org installer');
        }
        if (localAppData) {
            const storeBase = p.join(localAppData, 'Microsoft', 'WindowsApps');
            const dirs = safeList(listDir, storeBase)
                .filter(d => /^PythonSoftwareFoundation\.Python\.3\./i.test(d) && isSupportedMinor(minorFromName(d)))
                .sort((a, b) => (minorFromName(b) ?? 0) - (minorFromName(a) ?? 0));
            for (const dir of dirs) addIfExists(p.join(storeBase, dir, 'python.exe'), 'Microsoft Store');
        }
        const launcher = [...pathDirs.map(d => p.join(d, 'py.exe')), p.join(env.SystemRoot || env.windir || 'C:\\Windows', 'py.exe')]
            .find(exists);
        if (launcher) {
            for (const minor of SUPPORTED_MINORS) add(launcher, `py launcher (-3.${minor})`, [`-3.${minor}`]);
        }
    }

    const genericNames = win ? ['python.exe', 'python3.exe'] : ['python3', 'python'];
    for (const name of genericNames) {
        for (const dir of pathDirs) addIfExists(p.join(dir, name), 'PATH');
    }
    if (!win) {
        for (const file of ['/usr/bin/python3', '/home/linuxbrew/.linuxbrew/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3']) {
            addIfExists(file, 'standard install location');
        }
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Probing

/** Prints one line of JSON describing the interpreter. Must stay compatible with old Pythons. */
const PROBE_SCRIPT = [
    'import sys, struct, json, os, site',
    'r = {"executable": sys.executable, "version": "%d.%d.%d" % tuple(sys.version_info[:3]),',
    '     "bits": struct.calcsize("P") * 8, "prefix": sys.prefix, "venv": sys.prefix != getattr(sys, "base_prefix", sys.prefix)}',
    'for m in ("numpy", "pandas"):',
    '    try:',
    '        mod = __import__(m); r[m] = getattr(mod, "__version__", True)',
    '    except Exception as e:',
    '        r[m] = False; r[m + "_error"] = "%s: %s" % (type(e).__name__, e)',
    'import importlib.util as u',
    'for m in ("pyarrow", "pyreadstat"):',
    '    try:',
    '        r[m] = u.find_spec(m) is not None',
    '    except Exception:',
    '        r[m] = False',
    'paths = []',
    'try:',
    '    paths = list(site.getsitepackages())',
    'except Exception:',
    '    pass',
    'r["sitePaths"] = [p for p in paths if os.path.isdir(p)]',
    'print(json.dumps(r))'
].join('\n');

export interface ProbeResult {
    executable?: string;
    version?: string;
    bits?: number;
    prefix?: string;
    venv?: boolean;
    /** Version string when importable, false otherwise. */
    numpy?: string | boolean;
    pandas?: string | boolean;
    numpy_error?: string;
    pandas_error?: string;
    pyarrow?: boolean;
    pyreadstat?: boolean;
    sitePaths?: string[];
    /** Set when the interpreter could not be run or produced no JSON. */
    error?: string;
}

export function parseProbeOutput(stdout: string): ProbeResult {
    const line = stdout.split(/\r?\n/).reverse().find(l => l.trim().startsWith('{'));
    if (!line) {
        return { error: `unexpected output: ${stdout.trim().slice(0, 200) || '(none)'}` };
    }
    try {
        return JSON.parse(line) as ProbeResult;
    } catch (e) {
        return { error: `could not parse probe output: ${String(e)}` };
    }
}

export interface Verdict {
    ok: boolean;
    /** Can host the helper venv (right version and 64-bit), ignoring packages. */
    baseOk: boolean;
    problems: string[];
    warnings: string[];
}

export function evaluateProbe(result: ProbeResult): Verdict {
    const problems: string[] = [];
    const warnings: string[] = [];
    if (result.error) {
        return { ok: false, baseOk: false, problems: [result.error], warnings };
    }
    const v = result.version?.match(/^(\d+)\.(\d+)/);
    if (!v) {
        problems.push('could not determine the Python version');
    } else if (v[1] !== '3' || !isSupportedMinor(+v[2])) {
        problems.push(`Python ${result.version} is not supported by PyStata (needs 3.${MIN_PYTHON_MINOR}–3.${MAX_PYTHON_MINOR})`);
    }
    if (result.bits !== 64) {
        problems.push(`${result.bits ?? '?'}-bit Python (Stata needs 64-bit)`);
    }
    const baseOk = problems.length === 0;
    for (const pkg of REQUIRED_PACKAGES) {
        if (!result[pkg]) {
            const err = result[`${pkg}_error`];
            problems.push(err && !/No module named/.test(err) ? `${pkg} failed to import (${err})` : `${pkg} is not installed`);
        }
    }
    if (!result.pyarrow) warnings.push('pyarrow is not installed (needed to open .dta files from the Explorer)');
    return { ok: problems.length === 0, baseOk, problems, warnings };
}

export function probePython(candidate: PythonCandidate): Promise<ProbeResult> {
    return new Promise(resolve => {
        // PYTHONHOME/PYTHONPATH from the host would make the probe lie about the interpreter.
        const env = { ...process.env };
        delete env.PYTHONHOME;
        delete env.PYTHONPATH;
        execFile(candidate.path, [...(candidate.args || []), '-c', PROBE_SCRIPT], { timeout: 20000, windowsHide: true, env }, (err, stdout, stderr) => {
            const parsed = parseProbeOutput(String(stdout || ''));
            if (!parsed.error || !err) return resolve(parsed);
            const detail = String(stderr || '').trim().split(/\r?\n/).slice(-2).join(' ');
            resolve({ error: `could not run: ${detail || err.message}` });
        });
    });
}

export function describeCandidate(c: PythonCandidate): string {
    return c.args?.length ? `${c.path} ${c.args.join(' ')}` : c.path;
}

// ---------------------------------------------------------------------------------------------
// uv

/** Official uv release asset for this platform, or undefined if uv ships no build for it. */
export function uvAsset(platform: NodeJS.Platform, arch: string, musl = false): { target: string; ext: string; url: string } | undefined {
    const cpu = arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'aarch64' : undefined;
    if (!cpu) return undefined;
    let target: string;
    if (platform === 'darwin') target = `${cpu}-apple-darwin`;
    else if (platform === 'win32') target = `${cpu}-pc-windows-msvc`;
    else if (platform === 'linux') target = `${cpu}-unknown-linux-${musl ? 'musl' : 'gnu'}`;
    else return undefined;
    const ext = platform === 'win32' ? 'zip' : 'tar.gz';
    return { target, ext, url: `https://github.com/astral-sh/uv/releases/latest/download/uv-${target}.${ext}` };
}

/** Places a user-installed `uv` usually lives, in preference order. */
export function uvCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
    const p = pathApi(platform);
    const win = platform === 'win32';
    const exe = win ? 'uv.exe' : 'uv';
    const home = homeDir(env);
    const dirs = (env.PATH || env.Path || '').split(win ? ';' : ':').filter(Boolean);
    return [
        ...dirs.map(d => p.join(d, exe)),
        ...(home ? [p.join(home, '.local', 'bin', exe), p.join(home, '.cargo', 'bin', exe)] : [])
    ];
}
