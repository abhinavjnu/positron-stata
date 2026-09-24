import * as path from 'path';
import { enumeratePythonCandidates } from './pythonEnv';

export type StataEdition = 'mp' | 'se' | 'be';

export interface StataInstallation {
    homeDir: string;
    executable: string;
    version: string;
    edition: StataEdition;
    displayName: string;
    shortName: string;
    source: string;
    /** Full version such as "19.5" when it could be read from the installation, else undefined. */
    fullVersion?: string;
    /** How `version` was determined: install marker file (`isstata.195`) or the folder/executable name. */
    versionSource?: 'install files' | 'folder name' | 'default';
    isStataNow?: boolean;
    /** Whether `<home>/utilities/pystata` exists (Stata 17+). Undefined if it was not checked. */
    hasPyStata?: boolean;
}

export interface DiscoveryOptions {
    env: NodeJS.ProcessEnv;
    exists: (p: string) => boolean;
    /** Lists a directory; enables version detection from `isstata.NNN` / `installed.NNN` marker files. */
    listDir?: (p: string) => string[];
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
/** Newest first; covers future releases so a new Stata is found without an extension update. */
const VERSIONS = ['21', '20', '19', '18', '17'];

export function parseEdition(value: string | undefined): StataEdition | undefined {
    const v = value?.toLowerCase();
    return v && (EDITIONS as readonly string[]).includes(v) ? (v as StataEdition) : undefined;
}

function editionFromName(name: string): StataEdition | undefined {
    const n = name.toLowerCase();
    if (/mp/.test(n)) return 'mp';
    if (/se(?:-64)?(?:\.exe|\.app)?$|stata-?se/.test(n)) return 'se';
    if (/be/.test(n)) return 'be';
    return undefined;
}

/**
 * Reads the version from Stata's own marker files: `isstata.195` / `installed.190` mean 19.5 / 19.0.
 * A non-zero minor (x.5) is StataNow, which is verified against `about` on StataNow/MP 19.5.
 */
export function versionFromInstallFiles(entries: string[]): { major: string; minor: string } | undefined {
    let best = -1;
    for (const e of entries) {
        const m = e.match(/^(?:isstata|installed)\.(\d{3})$/i);
        if (m && +m[1] > best) best = +m[1];
    }
    if (best < 0) return undefined;
    return { major: String(Math.floor(best / 10)), minor: String(best % 10) };
}

export function describeInstallation(
    homeDir: string,
    exePath: string,
    editionHint?: StataEdition,
    homeEntries?: string[]
): StataInstallation {
    const edition: StataEdition = editionHint ?? editionFromName(path.basename(exePath)) ?? 'be';
    const editionStr = edition === 'mp' ? 'MP (Parallel Edition)' : edition.toUpperCase();

    let version = '19';
    let fullVersion: string | undefined;
    let versionSource: StataInstallation['versionSource'] = 'default';
    const fromFiles = homeEntries ? versionFromInstallFiles(homeEntries) : undefined;
    if (fromFiles) {
        version = fromFiles.major;
        fullVersion = `${fromFiles.major}.${fromFiles.minor}`;
        versionSource = 'install files';
    } else {
        const match = homeDir.match(/stata(?:now)?\s*(\d+)/i) || exePath.match(/stata(?:now)?\s*(\d+)/i);
        if (match) {
            version = match[1];
            versionSource = 'folder name';
        }
    }

    const isStataNow = /statanow/i.test(homeDir) || /statanow/i.test(exePath) || (!!fromFiles && fromFiles.minor !== '0');
    const prefix = isStataNow ? `StataNow ${version}` : `Stata ${version}`;

    return {
        homeDir,
        executable: exePath,
        version,
        edition,
        displayName: `${prefix} ${editionStr}`,
        shortName: `${version} ${edition.toUpperCase()}`,
        source: `System (${homeDir})`,
        fullVersion,
        versionSource,
        isStataNow
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

const UNIX_BINARIES = ['stata-mp', 'stata-se', 'stata'];

/** Splits a path on either separator so Windows and POSIX paths both work regardless of host. */
function parentOf(p: string): string {
    const trimmed = p.replace(/[\\/]+$/, '');
    const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    return idx > 0 ? trimmed.slice(0, idx) : trimmed;
}

function join(base: string, ...parts: string[]): string {
    const sep = /\\/.test(base) && !/\//.test(base) ? '\\' : '/';
    return [base.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

/**
 * Accepts what users paste into `positron-stata.stataHome`: the install folder, a macOS `.app` bundle, or the
 * Stata executable itself (including `…/StataMP.app/Contents/MacOS/stata-mp`). Returns the folder that PyStata
 * expects (the one containing `utilities/`), the executable, and an edition hint.
 */
export function resolveConfiguredHome(
    configured: string,
    exists: (p: string) => boolean
): { homeDir: string; executable?: string; edition?: StataEdition } {
    const home = configured.replace(/[\\/]+$/, '');
    const appMatch = home.match(/^(.*?)[\\/]([^\\/]+\.app)(?:[\\/]Contents(?:[\\/]MacOS(?:[\\/]([^\\/]+))?)?)?$/i);
    if (appMatch) {
        const [, parent, app, exe] = appMatch;
        const edition = editionFromName(app);
        const appDir = join(parent, app);
        const exeCandidates = exe
            ? [join(appDir, 'Contents', 'MacOS', exe)]
            : [join(appDir, 'Contents', 'MacOS', `stata-${edition ?? 'be'}`), join(appDir, 'Contents', 'MacOS', app.replace(/\.app$/i, '')), join(appDir, 'Contents', 'MacOS', 'stata')];
        return { homeDir: parent, executable: exeCandidates.find(exists) ?? exeCandidates[0], edition };
    }
    const base = home.split(/[\\/]/).pop() || '';
    if (/^x?stata(?:-(?:mp|se|be))?$/i.test(base) || /^stata.*\.exe$/i.test(base)) {
        // Looks like an executable; only treat it as one if it is not also a directory holding Stata.
        if (!exists(join(home, 'utilities')) && !UNIX_BINARIES.some(b => exists(join(home, b)))) {
            return { homeDir: parentOf(home), executable: home, edition: editionFromName(base) };
        }
    }
    return { homeDir: home };
}

export function findStataInstallations(opts: DiscoveryOptions): StataInstallation[] {
    const { env, exists } = opts;
    const installations: StataInstallation[] = [];
    const seen = new Set<string>();
    const list = (dir: string): string[] | undefined => {
        if (!opts.listDir) return undefined;
        try {
            return opts.listDir(dir);
        } catch {
            return undefined;
        }
    };

    // One runtime per installation folder; the first hit (highest edition / configured) wins.
    const add = (homeDir: string, exePath: string, editionHint?: StataEdition) => {
        const key = homeDir.replace(/[\\/]+$/, '').toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const inst = describeInstallation(homeDir, exePath, editionHint, list(homeDir));
        inst.hasPyStata = exists(join(homeDir, 'utilities', 'pystata'));
        installations.push(inst);
    };

    if (opts.configHome && exists(opts.configHome)) {
        const resolved = resolveConfiguredHome(opts.configHome, exists);
        const candidates = [
            ...UNIX_BINARIES,
            ...WINDOWS_BINARIES.map(([b]) => b),
            ...MAC_APPS.flatMap(([app, ed]) => [`${app}/Contents/MacOS/stata-${ed}`, `${app}/Contents/MacOS/${app.replace('.app', '')}`])
        ];
        const found = resolved.executable ?? candidates.map(b => join(resolved.homeDir, ...b.split('/'))).find(exists);
        add(resolved.homeDir, found || resolved.homeDir, opts.configEdition ?? resolved.edition);
    }

    const linuxDirs = [
        ...VERSIONS.flatMap(v => [`/usr/local/statanow${v}`, `/usr/local/stata${v}`]),
        '/usr/local/statanow', '/usr/local/stata',
        ...VERSIONS.flatMap(v => [`/opt/statanow${v}`, `/opt/stata${v}`]),
        '/opt/statanow', '/opt/stata'
    ];
    for (const dir of linuxDirs) {
        if (!exists(dir)) continue;
        const bin = UNIX_BINARIES.map(b => join(dir, b)).find(exists);
        if (bin) add(dir, bin);
    }

    const macBaseDirs = [
        ...VERSIONS.flatMap(v => [`/Applications/StataNow ${v}`, `/Applications/StataNow${v}`, `/Applications/Stata ${v}`, `/Applications/Stata${v}`]),
        '/Applications/StataNow',
        '/Applications/Stata'
    ];
    for (const base of macBaseDirs) {
        if (!exists(base)) continue;
        for (const [app, ed] of MAC_APPS) {
            const cliPath = join(base, app, 'Contents', 'MacOS', `stata-${ed}`);
            const guiPath = join(base, app, 'Contents', 'MacOS', app.replace('.app', ''));
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
    const winDirs = [...VERSIONS.flatMap(v => [`StataNow${v}`, `Stata${v}`]), 'StataNow', 'Stata'];
    for (const pf of programFiles) {
        for (const wd of winDirs) {
            const dir = join(pf, wd);
            if (!exists(dir)) continue;
            const hit = WINDOWS_BINARIES.find(([b]) => exists(join(dir, b)));
            if (hit) add(dir, join(dir, hit[0]), hit[1]);
        }
    }

    // A Stata folder on PATH (e.g. /usr/local/stata19). Symlinks in /usr/local/bin are skipped because the
    // folder they live in is not a Stata installation.
    const envPath = env['PATH'] || env['Path'] || '';
    for (const dir of envPath.split(path.delimiter)) {
        if (!dir) continue;
        const bin = UNIX_BINARIES.map(b => join(dir, b)).find(exists);
        if (bin && exists(join(dir, 'utilities'))) {
            add(dir, bin);
        }
    }

    return installations;
}

/**
 * Best interpreter guess without running anything. The runtime manager verifies candidates by probing them
 * (see `pythonEnv.ts`); this is only the fallback used before a probe result is available.
 */
export function resolvePythonExecutable(opts: PythonResolveOptions): string {
    const [first] = enumeratePythonCandidates(opts).filter(c => !c.args?.length);
    return first?.path ?? (opts.platform === 'win32' ? 'python' : 'python3');
}
