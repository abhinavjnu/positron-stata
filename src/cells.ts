import * as vscode from 'vscode';
import * as positron from 'positron';
import {
    Cell,
    cellCode,
    cellIndexAt,
    findCells,
    findSections,
    hasCellMarkers,
    rangeCode,
    sectionCode,
    sectionIndexAt,
    sectionRange
} from './cellParser';

const CODELENS_SETTING = 'positron-stata.codeLens.enabled';

function linesOf(document: vscode.TextDocument): string[] {
    return document.getText().split(/\r?\n/);
}

async function execute(code: string): Promise<void> {
    if (!code.trim()) {
        vscode.window.setStatusBarMessage('Stata: nothing to run', 2000);
        return;
    }
    try {
        // focus=false keeps the cursor in the editor (important for run-and-advance).
        await positron.runtime.executeCode('stata', code, false, true);
    } catch (err) {
        vscode.window.showErrorMessage(`Stata: failed to execute code: ${err instanceof Error ? err.message : String(err)}`);
    }
}

interface Target {
    document: vscode.TextDocument;
    editor?: vscode.TextEditor;
    line: number;
}

/** Resolve the document/line a command applies to: explicit CodeLens arguments, else the active editor's cursor. */
async function resolveTarget(uri?: unknown, line?: unknown): Promise<Target | undefined> {
    if (uri instanceof vscode.Uri && typeof line === 'number') {
        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
        const document = editor?.document ?? (await vscode.workspace.openTextDocument(uri));
        return { document, editor, line };
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'stata') {
        vscode.window.showWarningMessage('Open a Stata do-file to run code.');
        return undefined;
    }
    return { document: editor.document, editor, line: editor.selection.active.line };
}

function moveCursor(editor: vscode.TextEditor, line: number) {
    const doc = editor.document;
    const target = Math.min(line, doc.lineCount - 1);
    const pos = line >= doc.lineCount ? doc.lineAt(target).range.end : new vscode.Position(target, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function firstBodyLine(cell: Cell): number {
    return cell.markerLine !== undefined ? cell.markerLine + 1 : cell.start;
}

async function runCell(uri?: unknown, line?: unknown) {
    const t = await resolveTarget(uri, line);
    if (!t) {
        return;
    }
    const lines = linesOf(t.document);
    const cells = findCells(lines);
    await execute(cellCode(lines, cells[cellIndexAt(cells, t.line)]));
}

async function runCellAndAdvance() {
    const t = await resolveTarget();
    if (!t?.editor) {
        return;
    }
    const lines = linesOf(t.document);
    const cells = findCells(lines);
    const i = cellIndexAt(cells, t.line);
    await execute(cellCode(lines, cells[i]));
    moveCursor(t.editor, i + 1 < cells.length ? firstBodyLine(cells[i + 1]) : t.document.lineCount);
}

async function runCellsAbove(uri?: unknown, line?: unknown) {
    const t = await resolveTarget(uri, line);
    if (!t) {
        return;
    }
    const lines = linesOf(t.document);
    const cells = findCells(lines);
    await execute(rangeCode(lines, 0, cells[cellIndexAt(cells, t.line)].start - 1));
}

async function runNextCell(uri?: unknown, line?: unknown) {
    const t = await resolveTarget(uri, line);
    if (!t) {
        return;
    }
    const lines = linesOf(t.document);
    const cells = findCells(lines);
    const next = cellIndexAt(cells, t.line) + 1;
    if (next >= cells.length) {
        vscode.window.setStatusBarMessage('Stata: no next cell', 2000);
        return;
    }
    await execute(cellCode(lines, cells[next]));
    if (t.editor && t.editor === vscode.window.activeTextEditor) {
        moveCursor(t.editor, firstBodyLine(cells[next]));
    }
}

async function runSection(uri?: unknown, line?: unknown) {
    const t = await resolveTarget(uri, line);
    if (!t) {
        return;
    }
    const lines = linesOf(t.document);
    const sections = findSections(lines);
    const i = sectionIndexAt(sections, t.line);
    if (i < 0) {
        vscode.window.setStatusBarMessage('Stata: cursor is not inside a **# section', 2500);
        return;
    }
    await execute(sectionCode(lines, sections, i));
}

async function runToCursor() {
    const t = await resolveTarget();
    if (t) {
        await execute(rangeCode(linesOf(t.document), 0, t.line));
    }
}

async function runFromCursor() {
    const t = await resolveTarget();
    if (t) {
        const lines = linesOf(t.document);
        await execute(rangeCode(lines, t.line, lines.length - 1));
    }
}

class StataCellCodeLensProvider implements vscode.CodeLensProvider {
    private readonly changed = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this.changed.event;

    refresh() {
        this.changed.fire();
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (!vscode.workspace.getConfiguration().get<boolean>(CODELENS_SETTING, true)) {
            return [];
        }
        try {
            const lines = linesOf(document);
            const lenses: vscode.CodeLens[] = [];
            const uri = document.uri;

            if (hasCellMarkers(lines)) {
                const cells = findCells(lines);
                cells.forEach((cell, i) => {
                    if (cell.markerLine === undefined) {
                        return;
                    }
                    const range = new vscode.Range(cell.markerLine, 0, cell.markerLine, 0);
                    const args = [uri, cell.markerLine];
                    lenses.push(new vscode.CodeLens(range, { title: '$(play) Run Cell', command: 'stata.runCurrentCell', arguments: args }));
                    if (i > 0) {
                        lenses.push(new vscode.CodeLens(range, { title: 'Run Above', command: 'stata.runCellsAbove', arguments: args }));
                    }
                    if (i + 1 < cells.length) {
                        lenses.push(new vscode.CodeLens(range, { title: 'Run Next Cell', command: 'stata.runNextCell', arguments: args }));
                    }
                });
            }

            const sections = findSections(lines);
            sections.forEach((s, i) => {
                const r = sectionRange(sections, i, lines.length);
                if (r.end <= r.start) {
                    return;
                }
                lenses.push(
                    new vscode.CodeLens(new vscode.Range(s.line, 0, s.line, 0), {
                        title: '$(play) Run Section',
                        command: 'stata.runSection',
                        arguments: [uri, s.line]
                    })
                );
            });
            return lenses;
        } catch (err) {
            console.error('Stata code lens failed:', err);
            return [];
        }
    }
}

/** Keep `stata.hasCodeCells` / `stata.hasSections` in sync with the active editor (drives keybindings and menus). */
function trackContextKeys(context: vscode.ExtensionContext) {
    let timer: NodeJS.Timeout | undefined;
    let last = { cells: false, sections: false };
    const update = () => {
        const doc = vscode.window.activeTextEditor?.document;
        const lines = doc?.languageId === 'stata' ? linesOf(doc) : [];
        const next = { cells: hasCellMarkers(lines), sections: findSections(lines).length > 0 };
        if (next.cells !== last.cells) {
            vscode.commands.executeCommand('setContext', 'stata.hasCodeCells', next.cells);
        }
        if (next.sections !== last.sections) {
            vscode.commands.executeCommand('setContext', 'stata.hasSections', next.sections);
        }
        last = next;
    };
    const schedule = () => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(update, 200);
    };
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(update),
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document === vscode.window.activeTextEditor?.document) {
                schedule();
            }
        }),
        { dispose: () => timer && clearTimeout(timer) }
    );
    update();
}

export function registerCells(context: vscode.ExtensionContext): void {
    const lensProvider = new StataCellCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ language: 'stata' }, lensProvider),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(CODELENS_SETTING)) {
                lensProvider.refresh();
            }
        }),
        vscode.commands.registerCommand('stata.runCurrentCell', runCell),
        vscode.commands.registerCommand('stata.runCurrentCellAndAdvance', runCellAndAdvance),
        vscode.commands.registerCommand('stata.runCellsAbove', runCellsAbove),
        vscode.commands.registerCommand('stata.runNextCell', runNextCell),
        vscode.commands.registerCommand('stata.runSection', runSection),
        vscode.commands.registerCommand('stata.runToCursor', runToCursor),
        vscode.commands.registerCommand('stata.runFromCursor', runFromCursor)
    );
    trackContextKeys(context);
}
