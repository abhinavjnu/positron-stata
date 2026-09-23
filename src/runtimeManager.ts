import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import * as path from 'path';
import { StataInstallation, findStataInstallations as scanForStata, parseEdition, resolvePythonExecutable } from './discovery';

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

export function getPythonExecutable(): string {
    return resolvePythonExecutable({
        platform: process.platform,
        env: process.env,
        exists: fs.existsSync,
        listDir: fs.readdirSync,
        configured: vscode.workspace.getConfiguration('positron-stata').get<string>('pythonPath')
    });
}

function findStataInstallations(): StataInstallation[] {
    const config = vscode.workspace.getConfiguration('positron-stata');
    return scanForStata({
        env: process.env,
        exists: fs.existsSync,
        configHome: config.get<string>('stataHome'),
        configEdition: parseEdition(config.get<string>('stataEdition'))
    });
}

async function workspaceHasStataFiles(): Promise<boolean> {
    if (!vscode.workspace.workspaceFolders?.length) {
        return false;
    }
    const matches = await vscode.workspace.findFiles(
        '**/*.{do,ado,dta,DO,ADO,DTA}',
        '**/{node_modules,.git}/**',
        1
    );
    return matches.length > 0;
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
        const existingPythonPath = process.env.PYTHONPATH;
        const pythonPath = existingPythonPath
            ? `${kernelPythonPath}${path.delimiter}${existingPythonPath}`
            : kernelPythonPath;

        const currentPath = process.env.PATH || '';
        const pathWithStata = currentPath.includes(inst.homeDir)
            ? currentPath
            : `${inst.homeDir}${path.delimiter}${currentPath}`;

        const envVars: Record<string, string> = {
            PYTHONPATH: pythonPath,
            PATH: pathWithStata,
            POSITRON_STATA_ENGINE: 'stata',
            STATA_HOME: inst.homeDir,
            STATA_EDITION: inst.edition,
            STATA_VERSION: inst.version
        };
        if (positronPythonFiles) {
            envVars['POSITRON_PYTHON_FILES'] = positronPythonFiles;
        }
        if (process.platform === 'linux') {
            const currentLd = process.env.LD_LIBRARY_PATH || '';
            if (!currentLd.includes(inst.homeDir)) {
                envVars['LD_LIBRARY_PATH'] = currentLd
                    ? `${inst.homeDir}:${currentLd}`
                    : inst.homeDir;
            }
        }

        const launcherScript = path.join(this.context.extensionPath, 'kernel', 'launcher.py');

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
            cacheable: false,
            extraRuntimeData: {
                engine: 'stata',
                kernelSpec: {
                    argv: [
                        pythonBin,
                        launcherScript,
                        '-f',
                        '{connection_file}'
                    ],
                    display_name: inst.displayName,
                    language: 'stata',
                    interrupt_mode: 'signal',
                    kernel_protocol_version: '5.3',
                    env: envVars
                }
            }
        };
    }

    async *discoverAllRuntimes(): AsyncGenerator<positron.LanguageRuntimeMetadata> {
        try {
            for (const inst of findStataInstallations()) {
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
    async recommendedWorkspaceRuntime(): Promise<positron.LanguageRuntimeMetadata | undefined> {
        if (!(await workspaceHasStataFiles())) {
            return undefined;
        }
        const [preferred] = findStataInstallations();
        return preferred
            ? this.buildRuntimeMetadata(preferred, positron.LanguageRuntimeStartupBehavior.Immediate)
            : undefined;
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
        sessionName: string
    ): Promise<positron.LanguageRuntimeSession> {
        const supervisorExt = vscode.extensions.getExtension('positron.positron-supervisor');
        if (!supervisorExt) {
            throw new Error('positron-supervisor extension is required to restore Stata sessions.');
        }

        if (!supervisorExt.isActive) {
            await supervisorExt.activate();
        }

        const supervisorApi = supervisorExt.exports as SupervisorApi;
        if (supervisorApi && typeof supervisorApi.restoreSession === 'function') {
            return await supervisorApi.restoreSession(
                runtimeMetadata,
                sessionMetadata,
                initialDynState(sessionName || runtimeMetadata.runtimeName)
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

        return await supervisorApi.createSession(
            runtimeMetadata,
            sessionMetadata,
            kernelSpec,
            initialDynState(runtimeMetadata.runtimeName)
        );
    }
}

function initialDynState(sessionName: string | undefined): positron.LanguageRuntimeDynState {
    return {
        sessionName: sessionName || 'Stata',
        inputPrompt: '. ',
        continuationPrompt: '> '
    };
}

