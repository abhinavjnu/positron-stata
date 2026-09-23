import * as vscode from 'vscode';
import * as positron from 'positron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StataRuntimeManager } from './runtimeManager';
import { DtaCustomEditorProvider, openDtaInNativeDataExplorer } from './dtaEditorProvider';

let runtimeManager: StataRuntimeManager | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Activating Positron Stata Extension...');

    // 1. Register Stata Language Runtime Manager with Positron
    runtimeManager = new StataRuntimeManager(context);
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

    console.log('Positron Stata Extension successfully activated.');
}

export function deactivate() {
    runtimeManager = undefined;
}
