import * as vscode from 'vscode';
import * as positron from 'positron';
import { helpTopicAt } from './statementParser';

/** F1 / "Show help at cursor": the Stata help topic for the word under the cursor. */
export function registerHelpTopicProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        positron.languages.registerHelpTopicProvider({ language: 'stata' }, {
            provideHelpTopic(document, position) {
                return helpTopicAt(document.getText().split(/\r?\n/), { line: position.line, character: position.character });
            },
        }),
    );
}
