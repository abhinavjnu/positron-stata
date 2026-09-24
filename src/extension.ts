import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StataRuntimeManager } from './runtimeManager';
import { DtaCustomEditorProvider, openDtaInNativeDataExplorer } from './dtaEditorProvider';
import { registerLanguageFeatures } from './completion';
import { registerOutline } from './outline';
import { registerCells } from './cells';
import { registerStatementRangeProvider } from './statementRange';
import { registerHelpTopicProvider } from './helpTopic';
import { StataEnvironment, findInstallations } from './setup';
import { SAMPLE_DO_FILE } from './sampleDoFile';

let runtimeManager: StataRuntimeManager | undefined;
const WALKTHROUGH_SHOWN_KEY = 'walkthroughShown.v1';

export function activate(context: vscode.ExtensionContext) {
    console.log('Activating Positron Stata Extension...');

    const stataEnv = new StataEnvironment(context);
    context.subscriptions.push(stataEnv);

    // 1. Register Stata Language Runtime Manager with Positron
    runtimeManager = new StataRuntimeManager(context, stataEnv);
    const runtimeRegistration = positron.runtime.registerLanguageRuntimeManager('stata', runtimeManager);
    context.subscriptions.push(runtimeRegistration);

    // Eagerly trigger discovery so runtime is available in Positron console and runtime registry immediately
    (async () => {
        try {
            for await (const runtime of runtimeManager.discoverAllRuntimes()) {
                console.log(`Discovered Stata runtime: ${runtime.runtimeName} (${runtime.runtimeId})`);
            }
        } catch (err) {
            console.error('Error during initial Stata runtime discovery:', err);
        }
    })();

    // 2. Register DTA Custom Editor for viewing .dta files
    const dtaEditorRegistration = DtaCustomEditorProvider.register(context);
    context.subscriptions.push(dtaEditorRegistration);

    // 3. Register Command: Run Line or Selection
    context.subscriptions.push(
        vscode.commands.registerCommand('stata.runLineOrSelection', async () => {
            await vscode.commands.executeCommand('workbench.action.positronConsole.executeCode');
        })
    );

    // 4. Register Command: Do File (Ctrl+Shift+D)
    context.subscriptions.push(
        vscode.commands.registerCommand('stata.doFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active Stata do-file open.');
                return;
            }

            let filePath: string;
            if (editor.document.isUntitled) {
                const tempDir = path.join(os.tmpdir(), 'positron-stata');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                const tempFile = path.join(tempDir, `untitled_${Date.now()}.do`);
                fs.writeFileSync(tempFile, editor.document.getText(), 'utf8');
                filePath = tempFile.replace(/\\/g, '/');
            } else {
                if (editor.document.isDirty && !(await editor.document.save())) {
                    vscode.window.showWarningMessage('Save the do-file before running it.');
                    return;
                }
                filePath = editor.document.uri.fsPath.replace(/\\/g, '/');
            }

            // Compound quotes let the path itself contain double quotes.
            const doCmd = `do \`"${filePath}"'\n`;
            await positron.runtime.executeCode('stata', doCmd, true, true);
        })
    );

    // 5. Register Command: Open Data Explorer (browse)
    context.subscriptions.push(
        vscode.commands.registerCommand('stata.openDataExplorer', async () => {
            await positron.runtime.executeCode('stata', 'browse\n', false, true);
        })
    );


    // 7. Register Command: Open DTA in Native Data Explorer
    context.subscriptions.push(
        vscode.commands.registerCommand('stata.openDtaInDataExplorer', async (uri?: vscode.Uri) => {
            const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (!targetUri) {
                vscode.window.showWarningMessage('No .dta file selected.');
                return;
            }
            await openDtaInNativeDataExplorer(targetUri, context);
        })
    );

    // 8. Do-file editor features: completion, hover, outline, folding, code cells & sections
    registerLanguageFeatures(context);
    registerOutline(context);
    registerCells(context);
    registerStatementRangeProvider(context);
    registerHelpTopicProvider(context);

    // 9. First-run experience: setup, diagnostics, sample do-file, walkthrough, Jupyter kernelspec
    const walkthroughId = `${context.extension.id}#stata.gettingStarted`;
    context.subscriptions.push(
        vscode.commands.registerCommand('stata.setupEnvironment', () => stataEnv.setupEnvironment()),
        vscode.commands.registerCommand('stata.diagnose', () => stataEnv.diagnose()),
        vscode.commands.registerCommand('stata.chooseInterpreter', () => stataEnv.chooseInterpreter()),
        vscode.commands.registerCommand('stata.connect', async () => {
            const { selected } = await stataEnv.selectPython();
            if (!findInstallations().length) {
                await stataEnv.diagnose();
            } else if (!selected) {
                await stataEnv.setupEnvironment();
            } else {
                await stataEnv.startStata();
            }
        }),
        vscode.commands.registerCommand('stata.openSampleDoFile', async () => {
            const doc = await vscode.workspace.openTextDocument({ language: 'stata', content: SAMPLE_DO_FILE });
            await vscode.window.showTextDocument(doc);
        }),
        vscode.commands.registerCommand('stata.openWalkthrough', () =>
            vscode.commands.executeCommand('workbench.action.openWalkthrough', walkthroughId, false)
        ),
        stataEnv.onDidSetup(python => void stataEnv.refreshKernelspec(python)),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('positron-stata.stataHome') || e.affectsConfiguration('positron-stata.stataEdition')) {
                runtimeManager?.rediscover();
                void stataEnv.refreshKernelspec();
            }
            if (e.affectsConfiguration('positron-stata.pythonPath')) {
                void stataEnv.selectPython({ force: true }).then(() => stataEnv.refreshKernelspec());
            } else if (e.affectsConfiguration('positron-stata.dataExplorer.showValueLabels') || e.affectsConfiguration('positron-stata.jupyterKernelspec.enabled')) {
                void stataEnv.refreshKernelspec();
            }
        })
    );

    // Background preflight: never blocks activation.
    void (async () => {
        try {
            const installs = findInstallations();
            if (!installs.length) {
                return;
            }
            if (!context.globalState.get<boolean>(WALKTHROUGH_SHOWN_KEY)) {
                await context.globalState.update(WALKTHROUGH_SHOWN_KEY, true);
                void vscode.commands.executeCommand('workbench.action.openWalkthrough', walkthroughId, false);
            }
            const { selected } = await stataEnv.selectPython();
            if (selected) {
                await stataEnv.refreshKernelspec(selected.result.executable || selected.candidate.path);
            } else if (installs.some(i => i.hasPyStata !== false)) {
                stataEnv.promptSetup();
            }
        } catch (err) {
            stataEnv.log(`Startup check failed: ${(err as Error).message}`);
        }
    })();

    console.log('Positron Stata Extension successfully activated.');
}

export function deactivate() {
    runtimeManager = undefined;
}
