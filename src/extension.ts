import * as vscode from 'vscode';
import * as positron from 'positron';
import { StataRuntimeManager } from './runtimeManager';
import { DtaCustomEditorProvider, openDtaInNativeDataExplorer } from './dtaEditorProvider';

let runtimeManager: StataRuntimeManager | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Activating Positron Stata Extension...');

    // 1. Register Stata Language Runtime Manager with Positron
    runtimeManager = new StataRuntimeManager(context);
    const runtimeRegistration = positron.runtime.registerLanguageRuntimeManager('stata', runtimeManager);
    context.subscriptions.push(runtimeRegistration);

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

            // Save file if dirty
            if (editor.document.isDirty) {
                await editor.document.save();
            }

            const filePath = editor.document.uri.fsPath.replace(/\\/g, '/');
            const doCmd = `do "${filePath}"\n`;

            await positron.runtime.executeCode('stata', doCmd, true, true);
        })
    );

    // 5. Register Command: Open Data Explorer (browse)
    context.subscriptions.push(
        vscode.commands.registerCommand('stata.openDataExplorer', async () => {
            await positron.runtime.executeCode('stata', 'browse\n', false, true);
        })
    );

    // 6. Register Command: Select Engine
    context.subscriptions.push(
        vscode.commands.registerCommand('stata.selectEngine', async () => {
            const options: vscode.QuickPickItem[] = [
                {
                    label: 'StataNow 19.5 MP (Official)',
                    description: 'Full licensed Stata 19 MP Parallel Edition via PyStata'
                },
                {
                    label: 'OpenStata (Rust Engine)',
                    description: 'High-performance open-source Rust engine'
                }
            ];

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select active Stata engine for console'
            });

            if (selected) {
                const engine = selected.label.includes('OpenStata') ? 'openstata' : 'stata19';
                await positron.runtime.executeCode('stata', `%engine ${engine}\n`, false, true);
                vscode.window.showInformationMessage(`Switched Stata engine to: ${selected.label}`);
            }
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
