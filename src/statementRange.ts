import * as vscode from 'vscode';
import * as positron from 'positron';
import { statementAt, statementCode } from './statementParser';

/**
 * Ctrl/Cmd+Enter ("run statement and advance") support: returns the whole multi-line Stata statement
 * at the cursor (`///` continuations, brace blocks, program/mata/python/input blocks, `#delimit ;`).
 */
export function registerStatementRangeProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        positron.languages.registerStatementRangeProvider({ language: 'stata' }, {
            provideStatementRange(document, position) {
                const lines = document.getText().split(/\r?\n/);
                const statement = statementAt(lines, { line: position.line, character: position.character });
                if (!statement) {
                    return undefined;
                }
                const range = new vscode.Range(
                    statement.start.line, statement.start.character,
                    statement.end.line, statement.end.character,
                );
                const code = statementCode(lines, statement);
                return code === undefined ? { range } : { range, code };
            },
        }),
    );
}
