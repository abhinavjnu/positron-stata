// Kernel launch configuration shared by Positron sessions and the Jupyter kernelspec used by Quarto/notebooks.
// No `vscode` imports so this module can be unit-tested with node:test.
import * as fs from 'fs';
import * as path from 'path';
import type { StataInstallation } from './discovery';

export const KERNELSPEC_NAME = 'positron-stata';
const MANAGED_KEY = 'positron-stata';

export interface KernelEnvOptions {
    inst: StataInstallation;
    /** `<extensionPath>/kernel` */
    kernelDir: string;
    positronPythonFiles?: string;
    platform: NodeJS.Platform;
    /** Environment of the extension host, used to extend PATH/PYTHONPATH/LD_LIBRARY_PATH for Positron sessions. */
    baseEnv: NodeJS.ProcessEnv;
    valueLabels: boolean;
    /**
     * Jupyter kernelspecs are static files: jupyter_client overlays `env` on the launching process's
     * environment, so we must not freeze the host's PATH/PYTHONPATH into them.
     */
    standalone?: boolean;
}

export function buildKernelEnv(o: KernelEnvOptions): Record<string, string> {
    const { inst, platform, baseEnv } = o;
    const delimiter = platform === 'win32' ? ';' : ':';
    const prepend = (value: string, existing: string | undefined) =>
        !existing ? value : existing.split(delimiter).includes(value) ? existing : `${value}${delimiter}${existing}`;

    const env: Record<string, string> = {
        PYTHONPATH: o.standalone ? o.kernelDir : prepend(o.kernelDir, baseEnv.PYTHONPATH),
        POSITRON_STATA_ENGINE: 'stata',
        STATA_HOME: inst.homeDir,
        STATA_EDITION: inst.edition,
        STATA_VERSION: inst.version,
        POSITRON_STATA_VALUE_LABELS: o.valueLabels ? '1' : '0'
    };
    if (!o.standalone) {
        env.PATH = prepend(inst.homeDir, baseEnv.PATH ?? baseEnv.Path);
    }
    if (o.positronPythonFiles) {
        env.POSITRON_PYTHON_FILES = o.positronPythonFiles;
    }
    if (platform === 'linux') {
        env.LD_LIBRARY_PATH = o.standalone ? inst.homeDir : prepend(inst.homeDir, baseEnv.LD_LIBRARY_PATH);
    }
    return env;
}

export interface KernelSpecJson {
    argv: string[];
    display_name: string;
    language: string;
    interrupt_mode: 'message' | 'signal';
    env: Record<string, string>;
    kernel_protocol_version?: string;
    metadata?: Record<string, unknown>;
}

/** "Stata 19 MP" / "StataNow 19 SE" — short enough for Quarto/Jupyter kernel pickers. */
export function kernelDisplayName(inst: StataInstallation): string {
    return `${inst.isStataNow ? 'StataNow' : 'Stata'} ${inst.version} ${inst.edition.toUpperCase()}`;
}

export function buildKernelSpec(python: string, launcherScript: string, displayName: string, env: Record<string, string>): KernelSpecJson {
    return {
        argv: [python, launcherScript, '-f', '{connection_file}'],
        display_name: displayName,
        language: 'stata',
        // Message-based interrupts work on every platform (signals do not exist on Windows) and let the
        // kernel stop Stata cleanly between commands.
        interrupt_mode: 'message',
        env
    };
}

/** The Jupyter file variant: marked as ours and without Positron-only keys. */
export function jupyterKernelSpec(spec: KernelSpecJson): KernelSpecJson {
    const { kernel_protocol_version: _unused, ...rest } = spec;
    return { ...rest, metadata: { [MANAGED_KEY]: { managed: true } } };
}

/** User-level Jupyter data dir (same rules as `jupyter --data-dir`, minus the rarely-used overrides). */
export function jupyterDataDir(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
    const p = platform === 'win32' ? path.win32 : path.posix;
    if (env.JUPYTER_DATA_DIR) return env.JUPYTER_DATA_DIR;
    const home = env.HOME || env.USERPROFILE || '';
    if (platform === 'win32') return p.join(env.APPDATA || p.join(home, 'AppData', 'Roaming'), 'jupyter');
    if (platform === 'darwin') return p.join(home, 'Library', 'Jupyter');
    return p.join(env.XDG_DATA_HOME || p.join(home, '.local', 'share'), 'jupyter');
}

export function kernelspecDir(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
    const p = platform === 'win32' ? path.win32 : path.posix;
    return p.join(jupyterDataDir(platform, env), 'kernels', KERNELSPEC_NAME);
}

/** Hand-made kernelspecs from earlier releases point into an installed `abhinavjnu.positron-stata-x.y.z` folder. */
const LEGACY_LAUNCHER = /abhinavjnu\.positron-stata-[^\\/]*[\\/]kernel[\\/]launcher\.py$/i;

export type KernelspecOwnership = 'missing' | 'managed' | 'legacy' | 'foreign' | 'unreadable';

export function kernelspecOwnership(existing: string | undefined): KernelspecOwnership {
    if (existing === undefined) return 'missing';
    let json: any;
    try {
        json = JSON.parse(existing);
    } catch {
        return 'unreadable';
    }
    if (json?.metadata?.[MANAGED_KEY]?.managed === true) return 'managed';
    if (Array.isArray(json?.argv) && json.argv.some((a: unknown) => typeof a === 'string' && LEGACY_LAUNCHER.test(a))) return 'legacy';
    return 'foreign';
}

export interface ProvisionResult {
    status: 'written' | 'unchanged' | 'skipped';
    path: string;
    reason?: string;
}

export interface FsLike {
    readFileSync(p: string, enc: 'utf8'): string;
    writeFileSync(p: string, data: string, enc: 'utf8'): void;
    mkdirSync(p: string, opts: { recursive: true }): unknown;
}

/** Writes `kernel.json` only if it changed, and never replaces a kernelspec someone else created. */
export function provisionKernelspec(dir: string, spec: KernelSpecJson, fsImpl: FsLike = fs): ProvisionResult {
    const file = path.join(dir, 'kernel.json');
    let existing: string | undefined;
    try {
        existing = fsImpl.readFileSync(file, 'utf8');
    } catch {
        existing = undefined;
    }
    const content = JSON.stringify(jupyterKernelSpec(spec), null, 2) + '\n';
    const owner = kernelspecOwnership(existing);
    if (owner === 'foreign' || owner === 'unreadable') {
        return { status: 'skipped', path: file, reason: `a kernelspec not created by this extension already exists (${owner})` };
    }
    if (existing === content) {
        return { status: 'unchanged', path: file };
    }
    fsImpl.mkdirSync(dir, { recursive: true });
    fsImpl.writeFileSync(file, content, 'utf8');
    return { status: 'written', path: file, reason: owner === 'legacy' ? 'replaced a stale kernelspec from an older release' : undefined };
}
