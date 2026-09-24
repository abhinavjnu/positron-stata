import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import { StataInstallation, resolvePythonExecutable } from './discovery';
import { StataEnvironment, findInstallations, getStataEnvironment } from './setup';

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

/** Best known interpreter: the last probe-verified one, else a static guess. */
export function getPythonExecutable(): string {
    return getStataEnvironment()?.cachedPython() ?? resolvePythonExecutable({
        platform: process.platform,
        env: process.env,
        exists: fs.existsSync,
        listDir: fs.readdirSync,
        configured: vscode.workspace.getConfiguration('positron-stata').get<string>('pythonPath')
    });
}

export function runtimeIdFor(inst: StataInstallation): string {
    return `stata-${inst.version}-${inst.edition}-official`;
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

// Exits that mean the user (or Positron) ended the session on purpose.
const INTENTIONAL_EXITS = new Set<string>([
    positron.RuntimeExitReason.Shutdown,
    positron.RuntimeExitReason.ForcedQuit,
    positron.RuntimeExitReason.Restart,
    positron.RuntimeExitReason.SwitchRuntime,
    positron.RuntimeExitReason.Transferred,
    positron.RuntimeExitReason.ExtensionHost
]);

export class StataRuntimeManager implements positron.LanguageRuntimeManager {
    private _discoveredRuntimes: Map<string, positron.LanguageRuntimeMetadata> = new Map();
    public onDidDiscoverRuntime?: vscode.Event<positron.LanguageRuntimeMetadata>;
    private _discoverEmitter = new vscode.EventEmitter<positron.LanguageRuntimeMetadata>();
    public onDidCompleteDiscovery?: vscode.Event<void>;
    private _completeEmitter = new vscode.EventEmitter<void>();
    private _discoveryComplete: boolean = false;
    private _discoveredRuntimeCount: number = 0;
    public readonly alwaysRediscover: boolean = true;

    constructor(private readonly context: vscode.ExtensionContext, private readonly env: StataEnvironment) {
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
        return {
            runtimeId: runtimeIdFor(inst),
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
                installation: inst,
                // Rebuilt in createSession with a verified interpreter and current settings.
                kernelSpec: this.env.buildKernelSpec(inst, getPythonExecutable())
            }
        };
    }

    async *discoverAllRuntimes(): AsyncGenerator<positron.LanguageRuntimeMetadata> {
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
    rediscover(): void {
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
    async recommendedWorkspaceRuntime(): Promise<positron.LanguageRuntimeMetadata | undefined> {
        if (!(await workspaceHasStataFiles())) {
            return undefined;
        }
        const [preferred] = findInstallations();
        return preferred
            ? this.buildRuntimeMetadata(preferred, positron.LanguageRuntimeStartupBehavior.Immediate)
            : undefined;
    }

    /** Stored metadata from an older session/extension version is refreshed from current discovery. */
    async validateMetadata(metadata: positron.LanguageRuntimeMetadata): Promise<positron.LanguageRuntimeMetadata> {
        const inst = findInstallations().find(i => runtimeIdFor(i) === metadata.runtimeId);
        if (!inst) {
            throw new Error(`${metadata.runtimeName} is no longer installed. Set positron-stata.stataHome if Stata moved.`);
        }
        return this.buildRuntimeMetadata(inst, metadata.startupBehavior);
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
        const supervisorApi = await this.supervisor();
        if (typeof supervisorApi.restoreSession === 'function') {
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
        const supervisorApi = await this.supervisor();
        const extraData = runtimeMetadata.extraRuntimeData || {};
        const inst: StataInstallation | undefined =
            extraData.installation ?? findInstallations().find(i => runtimeIdFor(i) === runtimeMetadata.runtimeId);

        if (inst && inst.hasPyStata === false) {
            throw new Error(
                `PyStata was not found in ${inst.homeDir}/utilities. Positron needs Stata 17 or newer; ` +
                'if Stata is installed elsewhere, set positron-stata.stataHome.'
            );
        }

        // Preflight: fail with an actionable message instead of a kernel crash.
        const python = await this.env.requirePython();
        const kernelSpec = inst
            ? this.env.buildKernelSpec(inst, python)
            : extraData.kernelSpec && { ...extraData.kernelSpec, argv: [python, ...extraData.kernelSpec.argv.slice(1)] };
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

    private watchForStartupFailure(session: positron.LanguageRuntimeSession) {
        let ready = false;
        const subs: vscode.Disposable[] = [];
        subs.push(session.onDidChangeRuntimeState(state => {
            if (state === positron.RuntimeState.Ready || state === positron.RuntimeState.Idle) ready = true;
        }));
        subs.push(session.onDidEndSession(exit => {
            subs.forEach(s => s.dispose());
            const failed = exit.reason === positron.RuntimeExitReason.StartupFailed || (!ready && !INTENTIONAL_EXITS.has(exit.reason));
            if (!failed) return;
            this.env.log(`Stata session failed to start (${exit.reason}, exit code ${exit.exit_code}): ${exit.message}`);
            void vscode.window
                .showErrorMessage(`Stata failed to start${exit.message ? `: ${exit.message}` : '.'}`, 'Diagnose', 'Set Up Python Environment')
                .then(choice => {
                    if (choice === 'Diagnose') void this.env.diagnose();
                    else if (choice === 'Set Up Python Environment') void this.env.setupEnvironment();
                });
        }));
        this.context.subscriptions.push(...subs);
    }

    private async supervisor(): Promise<SupervisorApi> {
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
        return supervisorApi;
    }
}

function initialDynState(sessionName: string | undefined): positron.LanguageRuntimeDynState {
    return {
        sessionName: sessionName || 'Stata',
        inputPrompt: '. ',
        continuationPrompt: '> '
    };
}
