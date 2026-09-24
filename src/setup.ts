// First-run experience: pick a Python that can host the Stata kernel, offer to create one, diagnose problems,
// and keep the Jupyter kernelspec (for Quarto/notebooks) in sync.
import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StataInstallation, findStataInstallations, parseEdition } from './discovery';
import {
    PythonCandidate, ProbeResult, Verdict, dataDirectory, describeCandidate, enumeratePythonCandidates,
    evaluateProbe, minorFromName, probePython, MIN_PYTHON_MINOR, MAX_PYTHON_MINOR
} from './pythonEnv';
import { SetupCancelled, runSetup } from './envSetup';
import {
    KERNELSPEC_NAME, ProvisionResult, buildKernelEnv, buildKernelSpec, kernelDisplayName, kernelspecDir,
    kernelspecOwnership, provisionKernelspec, KernelSpecJson
} from './kernelspec';

const CONFIG = 'positron-stata';
const PROBE_CACHE_KEY = 'pythonProbeCache.v1';
const SELECTED_KEY = 'selectedPython.v1';
const README_TROUBLESHOOTING = 'https://github.com/abhinavjnu/positron-stata#troubleshooting';

export function findInstallations(): StataInstallation[] {
    const config = vscode.workspace.getConfiguration(CONFIG);
    return findStataInstallations({
        env: process.env,
        exists: fs.existsSync,
        listDir: fs.readdirSync,
        configHome: config.get<string>('stataHome') || undefined,
        configEdition: parseEdition(config.get<string>('stataEdition'))
    });
}

/** `<appRoot>/extensions/positron-python/python_files/posit`, which also tells the kernel where ipykernel lives. */
function getPositronPythonFilesPath(): string | undefined {
    const candidates = [
        vscode.env.appRoot && path.join(vscode.env.appRoot, 'extensions', 'positron-python', 'python_files', 'posit'),
        '/usr/share/positron/resources/app/extensions/positron-python/python_files/posit',
        '/Applications/Positron.app/Contents/Resources/app/extensions/positron-python/python_files/posit',
        path.join(process.env['LOCALAPPDATA'] || '', 'Programs', 'Positron', 'resources', 'app', 'extensions', 'positron-python', 'python_files', 'posit'),
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Positron', 'resources', 'app', 'extensions', 'positron-python', 'python_files', 'posit')
    ];
    return candidates.find((c): c is string => !!c && fs.existsSync(c));
}

/** Positron's bundled ipykernel builds (py3 + `<arch>/cpXY`) must cover the chosen Python. */
function ipykernelSupport(pythonFiles: string | undefined, version: string | undefined): string {
    if (!pythonFiles) return 'Positron python_files not found';
    const base = path.join(path.dirname(pythonFiles), 'lib', 'ipykernel');
    if (!fs.existsSync(path.join(base, 'py3'))) return `missing ${path.join(base, 'py3')}`;
    const m = version?.match(/^3\.(\d+)/);
    if (!m) return `found ${base}`;
    const cp = `cp3${m[1]}`;
    let archDirs: string[] = [];
    try {
        archDirs = fs.readdirSync(base).filter(d => d !== 'py3' && fs.statSync(path.join(base, d)).isDirectory());
    } catch {
        // ignore
    }
    const hit = archDirs.find(d => fs.existsSync(path.join(base, d, cp)));
    return hit ? `ok (${path.join(base, hit, cp)})` : `no ${cp} build under ${base}/{${archDirs.join(',')}}`;
}

interface CacheEntry {
    result: ProbeResult;
    stamps: Record<string, number>;
}

interface EvaluatedCandidate {
    candidate: PythonCandidate;
    result: ProbeResult;
    verdict: Verdict;
    cached: boolean;
}

interface Selection {
    selected?: EvaluatedCandidate;
    evaluated: EvaluatedCandidate[];
}

function mtime(p: string): number {
    try {
        return fs.statSync(p).mtimeMs;
    } catch {
        return -1;
    }
}

let current: StataEnvironment | undefined;
export function getStataEnvironment(): StataEnvironment | undefined {
    return current;
}

export class StataEnvironment implements vscode.Disposable {
    readonly output: vscode.OutputChannel;
    private selecting?: Promise<Selection>;
    private settingUp?: Promise<string | undefined>;
    private lastPromptAt = 0;
    private readonly _onDidSetup = new vscode.EventEmitter<string>();
    /** Fires with the interpreter path after a successful setup. */
    readonly onDidSetup = this._onDidSetup.event;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.output = vscode.window.createOutputChannel('Stata');
        current = this;
    }

    dispose() {
        this.output.dispose();
        this._onDidSetup.dispose();
        if (current === this) current = undefined;
    }

    log(line: string) {
        this.output.appendLine(`[${new Date().toLocaleTimeString()}] ${line}`);
    }

    get dataDir(): string {
        return dataDirectory(process.platform, process.env);
    }

    // ------------------------------------------------------------------ interpreter selection

    private async registeredPythons(): Promise<PythonCandidate[]> {
        try {
            const runtimes = await Promise.race([
                positron.runtime.getRegisteredRuntimes(),
                new Promise<positron.LanguageRuntimeMetadata[]>(resolve => setTimeout(() => resolve([]), 3000))
            ]);
            return runtimes
                .filter(r => r.languageId === 'python' && r.runtimePath)
                .map(r => ({ r, minor: minorFromName(r.languageVersion) }))
                .filter(({ minor }) => minor === undefined || (minor >= MIN_PYTHON_MINOR && minor <= MAX_PYTHON_MINOR))
                .sort((a, b) => (b.minor ?? 0) - (a.minor ?? 0))
                .map(({ r }) => ({ path: r.runtimePath, source: `Positron interpreter: ${r.runtimeName}` }));
        } catch {
            return [];
        }
    }

    private async candidates(): Promise<PythonCandidate[]> {
        return enumeratePythonCandidates({
            platform: process.platform,
            env: process.env,
            exists: fs.existsSync,
            listDir: fs.readdirSync,
            configured: vscode.workspace.getConfiguration(CONFIG).get<string>('pythonPath') || undefined,
            registered: await this.registeredPythons()
        });
    }

    private stamps(candidate: PythonCandidate, result: ProbeResult): Record<string, number> {
        const paths = new Set<string>([...(candidate.args?.length ? [] : [candidate.path]), ...(result.executable ? [result.executable] : []), ...(result.sitePaths || [])]);
        return Object.fromEntries([...paths].map(p => [p, mtime(p)]));
    }

    /** Probe results are cached until the interpreter or its site-packages folders change. */
    private async probe(candidate: PythonCandidate, force = false): Promise<{ result: ProbeResult; cached: boolean }> {
        const key = describeCandidate(candidate);
        const cache = this.context.globalState.get<Record<string, CacheEntry>>(PROBE_CACHE_KEY, {});
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
    selectPython(opts: { all?: boolean; force?: boolean } = {}): Promise<Selection> {
        if (!opts.all && !opts.force && this.selecting) return this.selecting;
        const run = (async (): Promise<Selection> => {
            const evaluated: EvaluatedCandidate[] = [];
            let selected: EvaluatedCandidate | undefined;
            for (const candidate of await this.candidates()) {
                const { result, cached } = await this.probe(candidate, opts.force);
                const e = { candidate, result, verdict: evaluateProbe(result), cached };
                evaluated.push(e);
                if (e.verdict.ok && !selected) {
                    selected = e;
                    if (!opts.all) break;
                }
            }
            const exe = selected ? selected.result.executable || selected.candidate.path : undefined;
            if (exe !== this.context.globalState.get<string>(SELECTED_KEY)) {
                await this.context.globalState.update(SELECTED_KEY, exe);
                this.log(exe ? `Using Python ${selected!.result.version} at ${exe} (${selected!.candidate.source}).` : 'No compatible Python found.');
            }
            const configured = vscode.workspace.getConfiguration(CONFIG).get<string>('pythonPath');
            const configuredEval = configured ? evaluated.find(e => e.candidate.path === configured) : undefined;
            if (configuredEval && !configuredEval.verdict.ok) {
                this.log(`positron-stata.pythonPath (${configured}) is not usable: ${configuredEval.verdict.problems.join('; ')}. Falling back to another interpreter.`);
            }
            return { selected, evaluated };
        })();
        if (!opts.all) {
            this.selecting = run;
            run.finally(() => {
                if (this.selecting === run) this.selecting = undefined;
            });
        }
        return run;
    }

    /** Last verified interpreter, available synchronously (used while building runtime metadata). */
    cachedPython(): string | undefined {
        const exe = this.context.globalState.get<string>(SELECTED_KEY);
        return exe && fs.existsSync(exe) ? exe : undefined;
    }

    /** Resolves to a verified interpreter, or shows the setup prompt and throws a readable error. */
    async requirePython(): Promise<string> {
        const { selected } = await this.selectPython();
        if (selected) return selected.result.executable || selected.candidate.path;
        this.promptSetup();
        throw new Error(
            `Stata needs Python 3.${MIN_PYTHON_MINOR}–3.${MAX_PYTHON_MINOR} (64-bit) with numpy and pandas to run, and none was found. ` +
            'Run "Stata: Set Up Python Environment" (or set positron-stata.pythonPath), then start Stata again. ' +
            '"Stata: Diagnose Setup" shows what was checked.'
        );
    }

    promptSetup() {
        if (Date.now() - this.lastPromptAt < 15000) return;
        this.lastPromptAt = Date.now();
        void vscode.window
            .showWarningMessage(
                `Stata needs a small Python helper (Python 3.${MIN_PYTHON_MINOR}–3.${MAX_PYTHON_MINOR} with pandas). Set it up automatically?`,
                'Set Up Automatically',
                'Choose Interpreter…',
                'Learn More'
            )
            .then(choice => {
                if (choice === 'Set Up Automatically') void this.setupEnvironment();
                else if (choice === 'Choose Interpreter…') void this.chooseInterpreter();
                else if (choice === 'Learn More') void vscode.env.openExternal(vscode.Uri.parse(README_TROUBLESHOOTING));
            });
    }

    async chooseInterpreter(): Promise<void> {
        const picked = await vscode.window.showOpenDialog({
            title: 'Select a Python 3.9–3.13 interpreter with numpy and pandas',
            canSelectMany: false,
            openLabel: 'Use for Stata',
            filters: process.platform === 'win32' ? { Python: ['exe'] } : undefined
        });
        if (!picked?.[0]) return;
        const file = picked[0].fsPath;
        const result = await probePython({ path: file, source: 'chosen' });
        const verdict = evaluateProbe(result);
        if (!verdict.ok) {
            const choice = await vscode.window.showErrorMessage(`That interpreter can't run Stata: ${verdict.problems.join('; ')}.`, 'Set Up Automatically');
            if (choice) void this.setupEnvironment();
            return;
        }
        await vscode.workspace.getConfiguration(CONFIG).update('pythonPath', file, vscode.ConfigurationTarget.Global);
        await this.selectPython({ force: true });
        void vscode.window.showInformationMessage(`Stata will use Python ${result.version} at ${file}.`);
    }

    // ------------------------------------------------------------------ automatic setup

    setupEnvironment(): Promise<string | undefined> {
        if (this.settingUp) return this.settingUp;
        this.settingUp = this.doSetup().finally(() => (this.settingUp = undefined));
        return this.settingUp;
    }

    private async doSetup(): Promise<string | undefined> {
        this.output.show(true);
        try {
            const result = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Stata: setting up Python', cancellable: true },
                (progress, token) =>
                    runSetup({
                        platform: process.platform,
                        arch: process.arch,
                        env: process.env,
                        dataDir: this.dataDir,
                        uvStorageDir: path.join(this.context.globalStorageUri.fsPath, 'uv'),
                        log: line => this.log(line),
                        report: message => progress.report({ message }),
                        token,
                        confirmDownload: async message =>
                            (await vscode.window.showInformationMessage(message, { modal: true }, 'Download and Set Up')) === 'Download and Set Up'
                    })
            );
            await this.selectPython({ force: true });
            this._onDidSetup.fire(result.python);
            for (const w of result.warnings) this.log(`Note: ${w}`);
            const choice = await vscode.window.showInformationMessage(
                `Stata is ready: Python ${result.probe.version} with pandas is set up. Start a Stata console to begin.`,
                'Start Stata'
            );
            if (choice === 'Start Stata') await this.startStata();
            return result.python;
        } catch (e) {
            if (e instanceof SetupCancelled) {
                this.log('Setup cancelled.');
                return undefined;
            }
            const message = (e as Error).message;
            this.log(`Setup failed: ${message}`);
            const choice = await vscode.window.showErrorMessage(`Stata Python setup failed: ${message}`, 'Show Log', 'Diagnose', 'Choose Interpreter…');
            if (choice === 'Show Log') this.output.show();
            else if (choice === 'Diagnose') await this.diagnose();
            else if (choice === 'Choose Interpreter…') await this.chooseInterpreter();
            return undefined;
        }
    }

    async startStata(): Promise<void> {
        const [inst] = findInstallations();
        if (!inst) {
            void vscode.window.showWarningMessage('No Stata installation was found. Set positron-stata.stataHome to your Stata folder.');
            return;
        }
        const runtimeId = `stata-${inst.version}-${inst.edition}-official`;
        try {
            await positron.runtime.selectLanguageRuntime(runtimeId);
        } catch (e) {
            this.log(`Could not start ${runtimeId}: ${(e as Error).message}`);
            await vscode.commands.executeCommand('workbench.action.language.runtime.selectSessionInterpreter');
        }
    }

    // ------------------------------------------------------------------ kernel launch config

    buildKernelSpec(inst: StataInstallation, python: string, standalone = false): KernelSpecJson {
        const config = vscode.workspace.getConfiguration(CONFIG);
        const env = buildKernelEnv({
            inst,
            kernelDir: path.join(this.context.extensionPath, 'kernel'),
            positronPythonFiles: getPositronPythonFilesPath(),
            platform: process.platform,
            baseEnv: process.env,
            valueLabels: config.get<boolean>('dataExplorer.showValueLabels', true),
            standalone
        });
        const spec = buildKernelSpec(python, path.join(this.context.extensionPath, 'kernel', 'launcher.py'), standalone ? kernelDisplayName(inst) : inst.displayName, env);
        return standalone ? spec : { ...spec, kernel_protocol_version: '5.3' };
    }

    /** Writes/refreshes the `positron-stata` Jupyter kernelspec so Quarto and Jupyter can use Stata. */
    async refreshKernelspec(python?: string): Promise<ProvisionResult | undefined> {
        if (!vscode.workspace.getConfiguration(CONFIG).get<boolean>('jupyterKernelspec.enabled', true)) return undefined;
        const [inst] = findInstallations().filter(i => i.hasPyStata !== false);
        if (!inst) return undefined;
        const exe = python ?? (await this.selectPython()).selected?.result.executable;
        if (!exe) return undefined;
        try {
            const result = provisionKernelspec(kernelspecDir(process.platform, process.env), this.buildKernelSpec(inst, exe, true));
            if (result.status !== 'unchanged') this.log(`Jupyter kernelspec ${result.status}: ${result.path}${result.reason ? ` (${result.reason})` : ''}`);
            return result;
        } catch (e) {
            this.log(`Could not write the Jupyter kernelspec: ${(e as Error).message}`);
            return undefined;
        }
    }

    // ------------------------------------------------------------------ diagnostics

    async buildReport(): Promise<string> {
        const lines: string[] = [];
        const add = (s = '') => lines.push(s);
        const ext = this.context.extension;
        add('Stata for Positron — setup report');
        add(`Generated: ${new Date().toISOString()}`);
        add();
        add(`Extension:  ${ext.id} ${ext.packageJSON?.version ?? '?'} (${this.context.extensionPath})`);
        add(`Positron:   ${(positron as any).version ?? '?'} (build ${(positron as any).buildNumber ?? '?'}), VS Code API ${vscode.version}`);
        add(`Platform:   ${process.platform} ${process.arch} (${os.release()})`);
        add();

        const config = vscode.workspace.getConfiguration(CONFIG);
        add('Settings:');
        for (const key of ['stataHome', 'stataEdition', 'pythonPath', 'dataExplorer.showValueLabels', 'jupyterKernelspec.enabled']) {
            add(`  ${CONFIG}.${key} = ${JSON.stringify(config.get(key))}`);
        }
        add();

        const installs = findInstallations();
        add(`Stata installations (${installs.length}):`);
        if (!installs.length) add('  none found — set positron-stata.stataHome to your Stata folder');
        for (const i of installs) {
            add(`  ${i.displayName}`);
            add(`    home:       ${i.homeDir}`);
            add(`    executable: ${i.executable}`);
            add(`    version:    ${i.fullVersion ?? i.version} (from ${i.versionSource ?? '?'}), edition ${i.edition.toUpperCase()}`);
            add(`    PyStata:    ${i.hasPyStata ? `found (${path.join(i.homeDir, 'utilities', 'pystata')})` : 'NOT FOUND — Stata 17 or newer is required'}`);
        }
        add();

        const pythonFiles = getPositronPythonFilesPath();
        const { selected, evaluated } = await this.selectPython({ all: true, force: true });
        add('Python for the Stata kernel:');
        if (selected) {
            const r = selected.result;
            add(`  selected:   ${r.executable} (${selected.candidate.source})`);
            add(`  version:    ${r.version}, ${r.bits}-bit${r.venv ? ', virtual environment' : ''}`);
            add(`  packages:   numpy ${r.numpy}, pandas ${r.pandas}, pyarrow ${r.pyarrow ? 'yes' : 'no'}, pyreadstat ${r.pyreadstat ? 'yes' : 'no'}`);
            for (const w of selected.verdict.warnings) add(`  note:       ${w}`);
        } else {
            add('  selected:   NONE — run "Stata: Set Up Python Environment"');
        }
        add(`  helper env: ${this.dataDir}${fs.existsSync(path.join(this.dataDir, 'venv')) ? '' : ' (not created)'}`);
        add('  candidates:');
        if (!evaluated.length) add('    none found');
        for (const e of evaluated) {
            const status = e.verdict.ok ? 'OK' : `rejected: ${e.verdict.problems.join('; ')}`;
            const ver = e.result.version ? ` [${e.result.version}]` : '';
            add(`    - ${describeCandidate(e.candidate)}${ver} (${e.candidate.source}) — ${status}`);
        }
        add();

        add('Positron integration:');
        add(`  python_files/posit: ${pythonFiles ?? 'NOT FOUND (the kernel borrows Positron\'s bundled ipykernel from here)'}`);
        add(`  bundled ipykernel:  ${ipykernelSupport(pythonFiles, selected?.result.version)}`);
        add();

        const ksDir = kernelspecDir(process.platform, process.env);
        const ksFile = path.join(ksDir, 'kernel.json');
        let ksText: string | undefined;
        try {
            ksText = fs.readFileSync(ksFile, 'utf8');
        } catch {
            ksText = undefined;
        }
        add('Jupyter kernelspec (Quarto / notebooks):');
        add(`  ${ksFile}: ${kernelspecOwnership(ksText)}${config.get<boolean>('jupyterKernelspec.enabled', true) ? '' : ' (provisioning disabled)'}`);
        if (ksText) {
            try {
                add(`  argv: ${JSON.stringify(JSON.parse(ksText).argv)}`);
            } catch {
                // unreadable, already reported
            }
        }
        add(`  use in Quarto with:  jupyter: ${KERNELSPEC_NAME}`);
        return lines.join('\n');
    }

    async diagnose(): Promise<void> {
        const report = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Stata: checking setup…' },
            () => this.buildReport()
        );
        this.output.appendLine('');
        this.output.appendLine(report);
        this.output.show(true);
        const hasPython = !/selected: {3}NONE/.test(report);
        const actions = hasPython ? ['Copy Report'] : ['Set Up Python Environment', 'Copy Report'];
        const choice = await vscode.window.showInformationMessage('Stata setup report written to the "Stata" output channel.', ...actions);
        if (choice === 'Copy Report') {
            await vscode.env.clipboard.writeText(report);
            void vscode.window.showInformationMessage('Setup report copied to the clipboard.');
        } else if (choice === 'Set Up Python Environment') {
            void this.setupEnvironment();
        }
    }
}
