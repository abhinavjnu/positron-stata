import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import * as path from 'path';

interface SupervisorApi {
    createSession(
        runtimeMetadata: positron.LanguageRuntimeMetadata,
        sessionMetadata: positron.RuntimeSessionMetadata,
        kernel: any,
        dynState: any,
        extra?: any
    ): Promise<positron.LanguageRuntimeSession>;
    validateSession?(sessionId: string): Promise<boolean>;
    restoreSession?(
        runtimeMetadata: positron.LanguageRuntimeMetadata,
        sessionMetadata: positron.RuntimeSessionMetadata,
        dynState: positron.LanguageRuntimeDynState
    ): Promise<positron.LanguageRuntimeSession>;
}

interface StataInstallation {
    homeDir: string;
    executable: string;
    version: string;
    edition: 'mp' | 'se' | 'be';
    displayName: string;
    shortName: string;
    source: string;
}

function getPythonExecutable(): string {
    // 1. User configured python
    const configPython = vscode.workspace.getConfiguration('positron-stata').get<string>('pythonPath');
    if (configPython && fs.existsSync(configPython)) {
        return configPython;
    }

    // 2. Standard system locations
    const candidates = [
        '/home/linuxbrew/.linuxbrew/bin/python3',
        '/usr/local/bin/python3',
        '/opt/homebrew/bin/python3',
        '/usr/bin/python3',
        'python3'
    ];
    for (const p of candidates) {
        if (p === 'python3' || fs.existsSync(p)) {
            return p;
        }
    }
    return 'python3';
}

function getPositronPythonFilesPath(): string | undefined {
    // Try resolving via vscode.env.appRoot
    if (vscode.env.appRoot) {
        const candidate = path.join(vscode.env.appRoot, 'extensions', 'positron-python', 'python_files', 'posit');
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    // Standard platform fallback locations
    const fallbacks = [
        '/usr/share/positron/resources/app/extensions/positron-python/python_files/posit',
        '/Applications/Positron.app/Contents/Resources/app/extensions/positron-python/python_files/posit',
        path.join(process.env['LOCALAPPDATA'] || '', 'Programs', 'Positron', 'resources', 'app', 'extensions', 'positron-python', 'python_files', 'posit')
    ];
    for (const fb of fallbacks) {
        if (fb && fs.existsSync(fb)) {
            return fb;
        }
    }
    return undefined;
}

function findStataInstallations(): StataInstallation[] {
    const installations: StataInstallation[] = [];
    const seen = new Set<string>();

    const addInstallation = (homeDir: string, exePath: string, versionHint?: string, editionHint?: 'mp' | 'se' | 'be') => {
        const key = `${homeDir}:${exePath}`;
        if (seen.has(key)) return;
        seen.add(key);

        const exeLower = path.basename(exePath).toLowerCase();
        let edition: 'mp' | 'se' | 'be' = editionHint || 'be';
        if (exeLower.includes('mp')) {
            edition = 'mp';
        } else if (exeLower.includes('se')) {
            edition = 'se';
        }

        let editionStr = 'BE';
        if (edition === 'mp') editionStr = 'MP (Parallel Edition)';
        else if (edition === 'se') editionStr = 'SE';

        // Extract version from path or hint
        let version = versionHint || '19';
        const match = homeDir.match(/stata(?:now)?\s*(\d+)/i) || exePath.match(/stata(?:now)?\s*(\d+)/i);
        if (match) {
            version = match[1];
        }

        const isStataNow = homeDir.toLowerCase().includes('statanow') || exePath.toLowerCase().includes('statanow');
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

    // 1. User configuration override (positron-stata.stataHome)
    const configHome = vscode.workspace.getConfiguration('positron-stata').get<string>('stataHome');
    const configEdition = vscode.workspace.getConfiguration('positron-stata').get<string>('stataEdition') as 'mp' | 'se' | 'be' | undefined;
    if (configHome && fs.existsSync(configHome)) {
        // Look for binaries inside configHome
        const candidateBins = [
            'stata-mp', 'stata-se', 'stata',
            'StataMP-64.exe', 'StataSE-64.exe', 'Stata-64.exe',
            'StataMP.app/Contents/MacOS/stata-mp', 'StataSE.app/Contents/MacOS/stata-se', 'Stata.app/Contents/MacOS/stata'
        ];
        let foundBin: string | undefined;
        for (const b of candidateBins) {
            const full = path.join(configHome, b);
            if (fs.existsSync(full)) {
                foundBin = full;
                break;
            }
        }
        addInstallation(configHome, foundBin || configHome, undefined, configEdition);
    }

    // 2. Linux Candidate Directories
    const linuxDirs = [
        '/usr/local/stata19', '/usr/local/stata18', '/usr/local/stata17', '/usr/local/stata',
        '/opt/stata19', '/opt/stata18', '/opt/stata17', '/opt/stata'
    ];
    for (const dir of linuxDirs) {
        if (!fs.existsSync(dir)) continue;
        const bins = ['stata-mp', 'stata-se', 'stata'];
        for (const b of bins) {
            const p = path.join(dir, b);
            if (fs.existsSync(p)) {
                addInstallation(dir, p);
                break; // Take the highest edition found in this directory
            }
        }
    }

    // 3. macOS Candidate Directories
    const macBaseDirs = [
        '/Applications/StataNow 19', '/Applications/StataNow19', '/Applications/StataNow',
        '/Applications/Stata 19', '/Applications/Stata19',
        '/Applications/Stata 18', '/Applications/Stata18',
        '/Applications/Stata 17', '/Applications/Stata17',
        '/Applications/Stata'
    ];
    for (const base of macBaseDirs) {
        if (!fs.existsSync(base)) continue;
        const appEditions: [string, 'mp' | 'se' | 'be'][] = [
            ['StataMP.app', 'mp'],
            ['StataSE.app', 'se'],
            ['Stata.app', 'be']
        ];
        for (const [app, ed] of appEditions) {
            const cliPath = path.join(base, app, 'Contents', 'MacOS', `stata-${ed}`);
            const guiPath = path.join(base, app, 'Contents', 'MacOS', app.replace('.app', ''));
            if (fs.existsSync(cliPath)) {
                addInstallation(base, cliPath, undefined, ed);
                break;
            } else if (fs.existsSync(guiPath)) {
                addInstallation(base, guiPath, undefined, ed);
                break;
            }
        }
    }

    // 4. Windows Candidate Directories
    const progFiles = [
        process.env['ProgramFiles'],
        process.env['ProgramFiles(x86)'],
        'C:\\Program Files',
        'C:\\Program Files (x86)'
    ].filter(Boolean) as string[];

    for (const pf of progFiles) {
        const winDirs = ['StataNow19', 'Stata19', 'Stata18', 'Stata17', 'Stata'];
        for (const wd of winDirs) {
            const dir = path.join(pf, wd);
            if (!fs.existsSync(dir)) continue;
            const bins: [string, 'mp' | 'se' | 'be'][] = [
                ['StataMP-64.exe', 'mp'],
                ['StataSE-64.exe', 'se'],
                ['Stata-64.exe', 'be'],
                ['StataMP.exe', 'mp'],
                ['StataSE.exe', 'se'],
                ['Stata.exe', 'be']
            ];
            for (const [b, ed] of bins) {
                const full = path.join(dir, b);
                if (fs.existsSync(full)) {
                    addInstallation(dir, full, undefined, ed);
                    break;
                }
            }
        }
    }

    // 5. PATH Search
    const envPath = process.env['PATH'] || '';
    const pathBins = ['stata-mp', 'stata-se', 'stata'];
    for (const dir of envPath.split(path.delimiter)) {
        if (!dir) continue;
        for (const b of pathBins) {
            const full = path.join(dir, b);
            if (fs.existsSync(full)) {
                const homeDir = path.dirname(dir); // e.g. /usr/local/stata19/bin -> /usr/local/stata19
                addInstallation(homeDir, full);
            }
        }
    }

    return installations;
}

export class StataRuntimeManager implements positron.LanguageRuntimeManager {
    private _discoveredRuntimes: Map<string, positron.LanguageRuntimeMetadata> = new Map();
    public onDidDiscoverRuntime?: vscode.Event<positron.LanguageRuntimeMetadata>;
    private _discoverEmitter = new vscode.EventEmitter<positron.LanguageRuntimeMetadata>();
    public onDidCompleteDiscovery?: vscode.Event<void>;
    private _completeEmitter = new vscode.EventEmitter<void>();
    private _discoveryComplete: boolean = false;
    private _discoveredRuntimeCount: number = 0;
    public readonly alwaysRediscover: boolean = true;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.onDidDiscoverRuntime = this._discoverEmitter.event;
        this.onDidCompleteDiscovery = this._completeEmitter.event;
    }

    get isDiscoveryComplete(): boolean {
        return this._discoveryComplete;
    }

    get discoveredRuntimeCount(): number {
        return this._discoveredRuntimeCount;
    }

    public buildRuntimeMetadata(
        inst: StataInstallation,
        startupBehavior: positron.LanguageRuntimeStartupBehavior = positron.LanguageRuntimeStartupBehavior.Implicit
    ): positron.LanguageRuntimeMetadata {
        const pythonBin = getPythonExecutable();
        const kernelPythonPath = path.join(this.context.extensionPath, 'kernel');
        const positronPythonFiles = getPositronPythonFilesPath();

        const runtimeId = `stata-${inst.version}-${inst.edition}-official`;
        const envVars: Record<string, string> = {
            PYTHONPATH: kernelPythonPath,
            POSITRON_STATA_ENGINE: 'stata',
            STATA_HOME: inst.homeDir,
            STATA_EDITION: inst.edition,
            STATA_VERSION: inst.version
        };
        if (positronPythonFiles) {
            envVars['POSITRON_PYTHON_FILES'] = positronPythonFiles;
        }

        return {
            runtimeId,
            runtimeName: inst.displayName,
            runtimeShortName: inst.shortName,
            runtimeVersion: `${inst.version}.0`,
            runtimeSource: inst.source,
            languageName: 'Stata',
            languageId: 'stata',
            languageVersion: inst.version,
            runtimePath: inst.executable,
            base64EncodedIconSvg: undefined,
            startupBehavior: startupBehavior,
            sessionLocation: positron.LanguageRuntimeSessionLocation.Workspace,
            cacheable: true,
            extraRuntimeData: {
                engine: 'stata',
                kernelSpec: {
                    argv: [
                        pythonBin,
                        '-m',
                        'positron_stata_kernel',
                        '-f',
                        '{connection_file}'
                    ],
                    display_name: inst.displayName,
                    language: 'stata',
                    interrupt_mode: 'message',
                    kernel_protocol_version: '5.3',
                    env: envVars
                }
            }
        };
    }

    async *discoverAllRuntimes(): AsyncGenerator<positron.LanguageRuntimeMetadata> {
        try {
            const stataInstalls = findStataInstallations();

            for (let i = 0; i < stataInstalls.length; i++) {
                const inst = stataInstalls[i];
                const behavior = i === 0
                    ? positron.LanguageRuntimeStartupBehavior.Immediate
                    : positron.LanguageRuntimeStartupBehavior.Implicit;
                const metadata = this.buildRuntimeMetadata(inst, behavior);
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

    async recommendedWorkspaceRuntime(): Promise<positron.LanguageRuntimeMetadata | undefined> {
        // Positron calls recommendedWorkspaceRuntime() before discoverAllRuntimes() during startup
        if (this._discoveredRuntimes.size === 0) {
            const stataInstalls = findStataInstallations();
            for (let i = 0; i < stataInstalls.length; i++) {
                const inst = stataInstalls[i];
                const behavior = i === 0
                    ? positron.LanguageRuntimeStartupBehavior.Immediate
                    : positron.LanguageRuntimeStartupBehavior.Implicit;
                const meta = this.buildRuntimeMetadata(inst, behavior);
                this._discoveredRuntimes.set(meta.runtimeId, meta);
            }
        }

        for (const meta of this._discoveredRuntimes.values()) {
            return meta;
        }
        return undefined;
    }

    async validateSession(sessionId: string): Promise<boolean> {
        try {
            const supervisorExt = vscode.extensions.getExtension('positron.positron-supervisor');
            if (supervisorExt && supervisorExt.isActive) {
                const supervisorApi = supervisorExt.exports as SupervisorApi;
                if (supervisorApi && typeof supervisorApi.validateSession === 'function') {
                    return await supervisorApi.validateSession(sessionId);
                }
            }
        } catch {
            // fallback
        }
        return true;
    }

    async restoreSession(
        runtimeMetadata: positron.LanguageRuntimeMetadata,
        sessionMetadata: positron.RuntimeSessionMetadata,
        dynState?: positron.LanguageRuntimeDynState
    ): Promise<positron.LanguageRuntimeSession> {
        const supervisorExt = vscode.extensions.getExtension('positron.positron-supervisor');
        if (!supervisorExt) {
            throw new Error('positron-supervisor extension is required to restore Stata sessions.');
        }

        if (!supervisorExt.isActive) {
            await supervisorExt.activate();
        }

        const supervisorApi = supervisorExt.exports as SupervisorApi;
        const initialDynState: positron.LanguageRuntimeDynState = dynState || {
            sessionName: sessionMetadata.sessionName || runtimeMetadata.runtimeName || 'Stata',
            inputPrompt: '. ',
            continuationPrompt: '> '
        };

        if (supervisorApi && typeof supervisorApi.restoreSession === 'function') {
            return await supervisorApi.restoreSession(
                runtimeMetadata,
                sessionMetadata,
                initialDynState
            );
        }

        return await this.createSession(runtimeMetadata, sessionMetadata);
    }

    async createSession(
        runtimeMetadata: positron.LanguageRuntimeMetadata,
        sessionMetadata: positron.RuntimeSessionMetadata
    ): Promise<positron.LanguageRuntimeSession> {
        const supervisorExt = vscode.extensions.getExtension('positron.positron-supervisor');
        if (!supervisorExt) {
            throw new Error('positron-supervisor extension is required to launch Stata sessions.');
        }

        if (!supervisorExt.isActive) {
            await supervisorExt.activate();
        }

        const supervisorApi = supervisorExt.exports as SupervisorApi;
        if (!supervisorApi || typeof supervisorApi.createSession !== 'function') {
            throw new Error('Supervisor API createSession method not found.');
        }

        const extraData = runtimeMetadata.extraRuntimeData || {};
        const kernelSpec = extraData.kernelSpec;
        if (!kernelSpec) {
            throw new Error(`No kernelSpec configured for runtime: ${runtimeMetadata.runtimeName}`);
        }

        const sessionName = sessionMetadata.sessionName || runtimeMetadata.runtimeName || 'Stata';
        const dynState: positron.LanguageRuntimeDynState = {
            sessionName: sessionName,
            inputPrompt: '. ',
            continuationPrompt: '> '
        };

        return await supervisorApi.createSession(
            runtimeMetadata,
            sessionMetadata,
            kernelSpec,
            dynState
        );
    }
}

