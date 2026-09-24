import * as vscode from 'vscode';
import { OutlineNode, buildOutline, computeFoldingRanges } from './cellParser';

const SELECTOR: vscode.DocumentSelector = { language: 'stata' };

const SYMBOL_KINDS: Record<OutlineNode['kind'], vscode.SymbolKind> = {
    section: vscode.SymbolKind.Namespace,
    cell: vscode.SymbolKind.Module,
    program: vscode.SymbolKind.Function
};

function toSymbol(document: vscode.TextDocument, node: OutlineNode): vscode.DocumentSymbol {
    const last = Math.min(node.end, document.lineCount - 1);
    const range = new vscode.Range(node.start, 0, last, document.lineAt(last).text.length);
    const selection = document.lineAt(node.line).range;
    const detail = node.kind === 'section' ? '#'.repeat(node.level) : node.kind;
    const symbol = new vscode.DocumentSymbol(node.name, detail, SYMBOL_KINDS[node.kind], range, selection);
    symbol.children = node.children.map(c => toSymbol(document, c));
    return symbol;
}

class StataSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        try {
            return buildOutline(document.getText().split(/\r?\n/)).map(n => toSymbol(document, n));
        } catch (err) {
            console.error('Stata outline failed:', err);
            return [];
        }
    }
}

class StataFoldingProvider implements vscode.FoldingRangeProvider {
    provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
        try {
            return computeFoldingRanges(document.getText().split(/\r?\n/)).map(r => {
                const kind =
                    r.kind === 'comment' ? vscode.FoldingRangeKind.Comment : r.kind === 'region' ? vscode.FoldingRangeKind.Region : undefined;
                return new vscode.FoldingRange(r.start, r.end, kind);
            });
        } catch (err) {
            console.error('Stata folding failed:', err);
            return [];
        }
    }
}

export function registerOutline(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(SELECTOR, new StataSymbolProvider(), { label: 'Stata' }),
        vscode.languages.registerFoldingRangeProvider(SELECTOR, new StataFoldingProvider())
    );
}
