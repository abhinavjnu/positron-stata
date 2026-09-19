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
}

function getPythonExecutable(): string {
    const candidates = [
        '/home/linuxbrew/.linuxbrew/bin/python3',
        '/usr/local/bin/python3',
        '/usr/bin/python3',
        'python3'
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return 'python3';
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

    async *discoverAllRuntimes(): AsyncGenerator<positron.LanguageRuntimeMetadata> {
        try {
            const pythonBin = getPythonExecutable();
            const kernelPythonPath = path.join(this.context.extensionPath, 'kernel');

            // 1. Check for Licensed Stata 19
            const stata19Paths = [
                '/usr/local/stata19/stata-mp',
                '/usr/local/stata19/stata-se',
                '/usr/local/stata19/stata',
                '/usr/local/stata/stata-mp',
                '/usr/local/stata/stata'
            ];

            let foundStata19: string | undefined;
            for (const p of stata19Paths) {
                if (fs.existsSync(p)) {
                    foundStata19 = p;
                    break;
                }
            }

            if (foundStata19) {
                const isMP = foundStata19.includes('mp');
                const editionStr = isMP ? 'MP (Parallel Edition)' : 'SE';
                const metadata: positron.LanguageRuntimeMetadata = {
                    runtimeId: 'stata-19-mp-official',
                    runtimeName: `StataNow 19.5 ${editionStr}`,
                    runtimeShortName: isMP ? '19.5 MP' : '19.5 SE',
                    runtimeVersion: '19.5',
                    runtimeSource: 'System (/usr/local/stata19)',
                    languageName: 'Stata',
                    languageId: 'stata',
                    languageVersion: '19.5',
                    runtimePath: foundStata19,
                    base64EncodedIconSvg: undefined,
                    startupBehavior: positron.LanguageRuntimeStartupBehavior.StartOnDemand,
                    sessionLocation: positron.LanguageRuntimeSessionLocation.Local,
                    extraRuntimeData: {
                        engine: 'stata19',
                        kernelSpec: {
                            argv: [
                                pythonBin,
                                '-m',
                                'positron_stata_kernel',
                                '-f',
                                '{connection_file}'
                            ],
                            display_name: `StataNow 19.5 ${editionStr}`,
                            language: 'stata',
                            interrupt_mode: 'message',
                            kernel_protocol_version: '5.3',
                            env: {
                                PYTHONPATH: kernelPythonPath,
                                POSITRON_STATA_ENGINE: 'stata19',
                                STATA_HOME: '/usr/local/stata19',
                                STATA_EDITION: isMP ? 'mp' : 'se'
                            }
                        }
                    }
                };
                this._discoveredRuntimes.set(metadata.runtimeId, metadata);
                this._discoveredRuntimeCount++;
                yield metadata;
            }

            // 2. Check for OpenStata (Rust Engine)
            const openStataPaths = [
                '/media/abhinav/WorkData/.cargo_target/release/open-stata',
                '/media/abhinav/WorkData/.cargo_target/debug/open-stata',
                '/home/abhinav/.cargo/bin/open-stata',
                '/usr/local/bin/open-stata'
            ];

            let foundOpenStata: string | undefined;
            for (const p of openStataPaths) {
                if (fs.existsSync(p)) {
                    foundOpenStata = p;
                    break;
                }
            }

            if (foundOpenStata) {
                const metadata: positron.LanguageRuntimeMetadata = {
                    runtimeId: 'open-stata-rust',
                    runtimeName: 'OpenStata (Rust Engine)',
                    runtimeShortName: 'OpenStata',
                    runtimeVersion: '0.1.0',
                    runtimeSource: 'Rust Local Target',
                    languageName: 'Stata',
                    languageId: 'stata',
                    languageVersion: '19.5',
                    runtimePath: foundOpenStata,
                    base64EncodedIconSvg: undefined,
                    startupBehavior: positron.LanguageRuntimeStartupBehavior.StartOnDemand,
                    sessionLocation: positron.LanguageRuntimeSessionLocation.Local,
                    extraRuntimeData: {
                        engine: 'openstata',
                        kernelSpec: {
                            argv: [
                                pythonBin,
                                '-m',
                                'positron_stata_kernel',
                                '-f',
                                '{connection_file}'
                            ],
                            display_name: 'OpenStata (Rust Engine)',
                            language: 'stata',
                            interrupt_mode: 'message',
                            kernel_protocol_version: '5.3',
                            env: {
                                PYTHONPATH: kernelPythonPath,
                                POSITRON_STATA_ENGINE: 'openstata',
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

    async recommendedWorkspaceRuntime(): Promise<positron.LanguageRuntimeMetadata | undefined> {
        // Prefer official Stata 19 MP if installed, otherwise OpenStata
        if (this._discoveredRuntimes.has('stata-19-mp-official')) {
            return this._discoveredRuntimes.get('stata-19-mp-official');
        }
        if (this._discoveredRuntimes.has('open-stata-rust')) {
            return this._discoveredRuntimes.get('open-stata-rust');
        }
        return undefined;
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

