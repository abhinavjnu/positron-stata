// Creates the dedicated Python environment that hosts the Stata kernel. No `vscode` imports: the UI layer
// (setup.ts) supplies logging/consent callbacks, and tests can drive the real flow into a temp directory.
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import {
    OPTIONAL_PACKAGES, REQUIRED_PACKAGES, SETUP_PYTHON_VERSION, ProbeResult, evaluateProbe, probePython, uvAsset, uvCandidates, venvPython
} from './pythonEnv';

export interface CancelToken {
    readonly isCancellationRequested: boolean;
    onCancellationRequested?: (listener: () => void) => { dispose(): void };
}

export interface SetupOptions {
    platform: NodeJS.Platform;
    arch: string;
    env: NodeJS.ProcessEnv;
    /** Folder holding `venv/` (and uv-managed Pythons under `python/`). */
    dataDir: string;
    /** Where a downloaded uv is kept (the extension's global storage). */
    uvStorageDir: string;
    log: (line: string) => void;
    /** Asked before anything is downloaded from the internet. */
    confirmDownload: (message: string) => Promise<boolean>;
    report?: (message: string) => void;
    token?: CancelToken;
}

export interface SetupResult {
    python: string;
    strategy: string;
    probe: ProbeResult;
    warnings: string[];
}

export class SetupCancelled extends Error {
    constructor() {
        super('Setup was cancelled.');
    }
}

function exeName(platform: NodeJS.Platform, name: string): string {
    return platform === 'win32' ? `${name}.exe` : name;
}

/** Runs a command, streaming its output to the log. Rejects with the tail of stderr on failure. */
function run(cmd: string, args: string[], o: Pick<SetupOptions, 'log' | 'token'> & { env?: NodeJS.ProcessEnv; cwd?: string }): Promise<void> {
    return new Promise((resolve, reject) => {
        if (o.token?.isCancellationRequested) return reject(new SetupCancelled());
        o.log(`$ ${[cmd, ...args].map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
        const child = spawn(cmd, args, { env: o.env, cwd: o.cwd, windowsHide: true });
        const tail: string[] = [];
        const onData = (buf: Buffer) => {
            for (const line of buf.toString().split(/\r?\n/)) {
                if (!line.trim()) continue;
                o.log(`  ${line}`);
                tail.push(line);
                if (tail.length > 8) tail.shift();
            }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        const sub = o.token?.onCancellationRequested?.(() => child.kill());
        child.on('error', err => {
            sub?.dispose();
            reject(err);
        });
        child.on('close', code => {
            sub?.dispose();
            if (o.token?.isCancellationRequested) reject(new SetupCancelled());
            else if (code === 0) resolve();
            else reject(new Error(`${path.basename(cmd)} exited with code ${code}: ${tail.slice(-3).join(' | ')}`));
        });
    });
}

async function findUv(o: SetupOptions): Promise<string | undefined> {
    for (const c of [...uvCandidates(o.platform, o.env), path.join(o.uvStorageDir, exeName(o.platform, 'uv'))]) {
        if (!fs.existsSync(c)) continue;
        try {
            await run(c, ['--version'], { log: () => undefined });
            return c;
        } catch {
            // not a working uv; keep looking
        }
    }
    return undefined;
}

function isMusl(): boolean {
    try {
        const report = (process as any).report?.getReport?.();
        return !report?.header?.glibcVersionRuntime;
    } catch {
        return false;
    }
}

function findFile(dir: string, name: string): string | undefined {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === name) return full;
        if (entry.isDirectory()) {
            const hit = findFile(full, name);
            if (hit) return hit;
        }
    }
    return undefined;
}

/** Downloads the official uv release for this machine into `uvStorageDir`. */
async function downloadUv(o: SetupOptions): Promise<string> {
    const asset = uvAsset(o.platform, o.arch, o.platform === 'linux' && isMusl());
    if (!asset) throw new Error(`uv has no prebuilt download for ${o.platform}/${o.arch}.`);
    fs.mkdirSync(o.uvStorageDir, { recursive: true });
    const archive = path.join(o.uvStorageDir, `uv-download.${asset.ext}`);
    const extractDir = path.join(o.uvStorageDir, 'extract');
    o.log(`Downloading ${asset.url}`);
    o.report?.('Downloading uv…');
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} ${response.statusText} (${asset.url})`);
    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    if (o.token?.isCancellationRequested) throw new SetupCancelled();
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });
    // bsdtar ships with Windows 10+ and handles .zip as well as .tar.gz.
    await run('tar', ['-xf', archive, '-C', extractDir], o);
    const binary = findFile(extractDir, exeName(o.platform, 'uv'));
    if (!binary) throw new Error('The uv archive did not contain a uv executable.');
    const dest = path.join(o.uvStorageDir, exeName(o.platform, 'uv'));
    fs.copyFileSync(binary, dest);
    if (o.platform !== 'win32') fs.chmodSync(dest, 0o755);
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.rmSync(archive, { force: true });
    o.log(`uv installed at ${dest}`);
    return dest;
}

/** Creates (unless reusing) the venv with uv, installs packages, and verifies the result. */
async function viaUv(o: SetupOptions, uv: string, used: string, venvDir: string, python: string, reuse: boolean): Promise<SetupResult> {
    const runOpts = {
        ...o,
        cwd: o.dataDir,
        env: {
            ...o.env,
            // Keep the interpreter next to the venv so OS/Homebrew Python upgrades can't break it, and ignore
            // any uv.toml/pyproject settings from the user's current folder.
            UV_PYTHON_INSTALL_DIR: path.join(o.dataDir, 'python'),
            UV_PYTHON_PREFERENCE: 'only-managed',
            UV_NO_CONFIG: '1',
            VIRTUAL_ENV: undefined as unknown as string
        }
    };
    const install = (pkgs: string[]) => run(uv, ['pip', 'install', '--python', python, ...pkgs], runOpts);
    if (!reuse) {
        o.report?.(`Creating environment with Python ${SETUP_PYTHON_VERSION} (uv downloads it if needed)…`);
        await run(uv, ['venv', '--python', SETUP_PYTHON_VERSION, venvDir], runOpts);
    }
    const warnings: string[] = [];
    o.report?.(`Installing ${REQUIRED_PACKAGES.join(', ')}…`);
    await install([...REQUIRED_PACKAGES]);
    o.report?.(`Installing ${OPTIONAL_PACKAGES.join(', ')}…`);
    for (const pkg of OPTIONAL_PACKAGES) {
        try {
            await install([pkg]);
        } catch (e) {
            if (e instanceof SetupCancelled) throw e;
            const msg = `Optional package ${pkg} could not be installed (${(e as Error).message}); the related feature will be unavailable.`;
            o.log(`WARNING: ${msg}`);
            warnings.push(msg);
        }
    }
    const probe = await probePython({ path: python, source: 'new environment' });
    const verdict = evaluateProbe(probe);
    if (!verdict.ok) throw new Error(`The new environment is not usable: ${verdict.problems.join('; ')}`);
    o.log(`Done: ${python} (Python ${probe.version}, pandas ${probe.pandas}, numpy ${probe.numpy}) via ${used}.`);
    return { python: probe.executable || python, strategy: used, probe, warnings: [...warnings, ...verdict.warnings] };
}

function removeVenv(venvDir: string, dataDir: string) {
    // Only ever delete our own `<dataDir>/venv`.
    if (path.resolve(path.dirname(venvDir)) === path.resolve(dataDir) && path.basename(venvDir) === 'venv') {
        fs.rmSync(venvDir, { recursive: true, force: true });
    }
}

export async function runSetup(o: SetupOptions): Promise<SetupResult> {
    const venvDir = path.join(o.dataDir, 'venv');
    const python = venvPython(venvDir, o.platform);
    fs.mkdirSync(o.dataDir, { recursive: true });
    o.log(`Setting up the Stata Python environment in ${venvDir}`);

    let reuse = false;
    if (fs.existsSync(python)) {
        const existing = evaluateProbe(await probePython({ path: python, source: 'existing' }));
        reuse = existing.baseOk;
        o.log(reuse ? 'Existing environment has a usable Python; installing/updating packages.' : `Existing environment is unusable (${existing.problems.join('; ')}); recreating it.`);
    }
    if (!reuse) removeVenv(venvDir, o.dataDir);

    const attempts: string[] = [];
    const failed = (what: string, e: unknown) => {
        if (e instanceof SetupCancelled) throw e;
        const msg = `${what} failed: ${(e as Error).message}`;
        o.log(msg);
        attempts.push(msg);
        // A half-created venv would make the next attempt reuse a broken interpreter.
        if (!reuse) removeVenv(venvDir, o.dataDir);
    };

    const found = await findUv(o);
    if (found) {
        o.log(`Using uv at ${found}`);
        try {
            return await viaUv(o, found, 'uv', venvDir, python, reuse);
        } catch (e) {
            failed('uv', e);
        }
    }

    const consent = await o.confirmDownload(
        `Stata needs a private copy of Python. OK to download uv (Astral's Python installer, ~20 MB, from github.com) and Python ${SETUP_PYTHON_VERSION} (~30 MB)? ` +
        `Everything goes into ${o.dataDir} and ${o.uvStorageDir}.`
    );
    if (!consent) {
        throw new Error(['Setup needs to download uv and Python, but the download was declined.', ...attempts].join(' '));
    }
    const uv = await downloadUv(o);
    try {
        return await viaUv(o, uv, 'downloaded uv', venvDir, python, reuse);
    } catch (e) {
        failed('downloaded uv', e);
        throw new Error(`Could not create the Python environment. ${attempts.join(' ')}`);
    }
}
