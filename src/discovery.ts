import * as path from 'path';

export type StataEdition = 'mp' | 'se' | 'be';

export interface StataInstallation {
    homeDir: string;
    executable: string;
    version: string;
    edition: StataEdition;
    displayName: string;
    shortName: string;
    source: string;
}

export interface DiscoveryOptions {
    env: NodeJS.ProcessEnv;
    exists: (p: string) => boolean;
    configHome?: string;
    configEdition?: StataEdition;
}

export interface PythonResolveOptions {
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
    exists: (p: string) => boolean;
    listDir: (p: string) => string[];
    configured?: string;
}

const EDITIONS: readonly StataEdition[] = ['mp', 'se', 'be'];

export function parseEdition(value: string | undefined): StataEdition | undefined {
    const v = value?.toLowerCase();
    return v && (EDITIONS as readonly string[]).includes(v) ? (v as StataEdition) : undefined;
}

export function describeInstallation(
    homeDir: string,
    exePath: string,
    editionHint?: StataEdition
): StataInstallation {
    const exeLower = path.basename(exePath).toLowerCase();
    let edition: StataEdition = 'be';
    if (editionHint) {
        edition = editionHint;
    } else if (exeLower.includes('mp')) {
        edition = 'mp';
    } else if (exeLower.includes('se')) {
        edition = 'se';
    }

    const editionStr = edition === 'mp' ? 'MP (Parallel Edition)' : edition.toUpperCase();

    let version = '19';
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

const WINDOWS_BINARIES: [string, StataEdition][] = [
    ['StataMP-64.exe', 'mp'],
    ['StataSE-64.exe', 'se'],
    ['StataBE-64.exe', 'be'],
    ['Stata-64.exe', 'be'],
    ['StataMP.exe', 'mp'],
    ['StataSE.exe', 'se'],
    ['StataBE.exe', 'be'],
    ['Stata.exe', 'be']
];

const MAC_APPS: [string, StataEdition][] = [
    ['StataMP.app', 'mp'],
    ['StataSE.app', 'se'],
    ['StataBE.app', 'be'],
    ['Stata.app', 'be']
];

export function findStataInstallations(opts: DiscoveryOptions): StataInstallation[] {
    const { env, exists } = opts;
    const installations: StataInstallation[] = [];
    const seen = new Set<string>();

    const add = (homeDir: string, exePath: string, editionHint?: StataEdition) => {
        const key = `${homeDir}:${exePath}`;
        if (seen.has(key)) return;
        seen.add(key);
        installations.push(describeInstallation(homeDir, exePath, editionHint));
    };

    if (opts.configHome && exists(opts.configHome)) {
        const candidates = [
            'stata-mp', 'stata-se', 'stata',
            ...WINDOWS_BINARIES.map(([b]) => b),
            'StataMP.app/Contents/MacOS/stata-mp',
            'StataSE.app/Contents/MacOS/stata-se',
            'StataBE.app/Contents/MacOS/stata-be',
            'Stata.app/Contents/MacOS/stata'
        ];
        const found = candidates.map(b => path.join(opts.configHome!, b)).find(exists);
        add(opts.configHome, found || opts.configHome, opts.configEdition);
    }

    const linuxDirs = [
        '/usr/local/stata20', '/usr/local/stata19', '/usr/local/stata18', '/usr/local/stata17', '/usr/local/stata',
        '/opt/stata20', '/opt/stata19', '/opt/stata18', '/opt/stata17', '/opt/stata'
    ];
    for (const dir of linuxDirs) {
        if (!exists(dir)) continue;
        const bin = ['stata-mp', 'stata-se', 'stata'].map(b => path.join(dir, b)).find(exists);
        if (bin) add(dir, bin);
    }

    const macBaseDirs = [
        '/Applications/StataNow 20', '/Applications/StataNow20',
        '/Applications/Stata 20', '/Applications/Stata20',
        '/Applications/StataNow 19', '/Applications/StataNow19', '/Applications/StataNow',
        '/Applications/Stata 19', '/Applications/Stata19',
        '/Applications/Stata 18', '/Applications/Stata18',
        '/Applications/Stata 17', '/Applications/Stata17',
        '/Applications/Stata'
    ];
    for (const base of macBaseDirs) {
        if (!exists(base)) continue;
        for (const [app, ed] of MAC_APPS) {
            const cliPath = path.join(base, app, 'Contents', 'MacOS', `stata-${ed}`);
            const guiPath = path.join(base, app, 'Contents', 'MacOS', app.replace('.app', ''));
            const bin = [cliPath, guiPath].find(exists);
            if (bin) {
                add(base, bin, ed);
                break;
            }
        }
    }

    const programFiles = [
        env['ProgramFiles'],
        env['ProgramFiles(x86)'],
        'C:\\Program Files',
        'C:\\Program Files (x86)'
    ].filter((p): p is string => !!p);
    const winDirs = ['StataNow20', 'Stata20', 'StataNow19', 'Stata19', 'StataNow18', 'Stata18', 'Stata17', 'Stata'];
    for (const pf of programFiles) {
        for (const wd of winDirs) {
            const dir = path.join(pf, wd);
            if (!exists(dir)) continue;
            const hit = WINDOWS_BINARIES.find(([b]) => exists(path.join(dir, b)));
            if (hit) add(dir, path.join(dir, hit[0]), hit[1]);
        }
    }

    const envPath = env['PATH'] || env['Path'] || '';
    for (const dir of envPath.split(path.delimiter)) {
        if (!dir) continue;
        for (const b of ['stata-mp', 'stata-se', 'stata']) {
            const full = path.join(dir, b);
            if (exists(full)) {
                add(path.dirname(dir), full);
            }
        }
    }

    return installations;
}

// Microsoft Store "App Execution Alias" stubs live here; running one without the
// Store package installed prints "Python was not found" instead of starting Python.
function isWindowsAppsDir(dir: string): boolean {
    return /[\\/]Microsoft[\\/]WindowsApps[\\/]?$/i.test(dir);
}

function newestPythonDirs(entries: string[], pattern: RegExp): string[] {
    const version = (name: string) => {
        const m = name.match(/(\d+)\.?(\d+)?/);
        if (!m) return 0;
        const [maj, min] = m[2] !== undefined ? [+m[1], +m[2]] : [3, +m[1].replace(/^3/, '')];
        return maj === 3 && min >= 14 ? -1 : maj * 1000 + min;
    };
    return entries.filter(e => pattern.test(e)).sort((a, b) => version(b) - version(a));
}

export function resolvePythonExecutable(opts: PythonResolveOptions): string {
    const { platform, env, exists, listDir } = opts;
    const win = platform === 'win32';
    const p = win ? path.win32 : path.posix;

    if (opts.configured && exists(opts.configured)) {
        return opts.configured;
    }

    const userHome = env.HOME || env.USERPROFILE || '';
    if (userHome) {
        const dedicatedVenv = win
            ? p.join(userHome, '.local', 'share', 'positron-stata', 'venv', 'Scripts', 'python.exe')
            : p.join(userHome, '.local', 'share', 'positron-stata', 'venv', 'bin', 'python');
        if (exists(dedicatedVenv)) return dedicatedVenv;
    }

    const envRoots: [string | undefined, string[]][] = [
        [env.VIRTUAL_ENV, win ? ['Scripts', 'python.exe'] : ['bin', 'python3']],
        [env.CONDA_PREFIX, win ? ['python.exe'] : ['bin', 'python3']]
    ];
    for (const [root, rel] of envRoots) {
        if (!root) continue;
        const candidate = p.join(root, ...rel);
        if (exists(candidate)) return candidate;
    }

    const pathDirs = (env.PATH || env.Path || '').split(win ? ';' : ':').filter(Boolean);
    const names = win
        ? ['python.exe', 'python3.exe']
        : ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3.9', 'python3', 'python'];
    for (const name of names) {
        for (const dir of pathDirs) {
            if (win && isWindowsAppsDir(dir)) continue;
            const candidate = p.join(dir, name);
            if (exists(candidate)) return candidate;
        }
    }

    if (win) {
        const localAppData = env.LOCALAPPDATA;
        if (localAppData) {
            const base = p.join(localAppData, 'Programs', 'Python');
            for (const dir of newestPythonDirs(safeList(listDir, base), /^Python3\d+$/i)) {
                const candidate = p.join(base, dir, 'python.exe');
                if (exists(candidate)) return candidate;
            }
            const storeBase = p.join(localAppData, 'Microsoft', 'WindowsApps');
            for (const dir of newestPythonDirs(safeList(listDir, storeBase), /^PythonSoftwareFoundation\.Python\.3\./i)) {
                const candidate = p.join(storeBase, dir, 'python.exe');
                if (exists(candidate)) return candidate;
            }
        }
        return 'python';
    }

    const candidates = [
        ...['13', '12', '11', '10', '9'].flatMap(v => [
            `/opt/homebrew/bin/python3.${v}`,
            `/Library/Frameworks/Python.framework/Versions/3.${v}/bin/python3`,
            `/usr/local/bin/python3.${v}`
        ]),
        '/usr/bin/python3',
        '/home/linuxbrew/.linuxbrew/bin/python3',
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3'
    ];
    for (const candidate of candidates) {
        if (exists(candidate)) return candidate;
    }
    return 'python3';
}

function safeList(listDir: (p: string) => string[], dir: string): string[] {
    try {
        return listDir(dir);
    } catch {
        return [];
    }
}
