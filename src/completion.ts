import * as vscode from 'vscode';
import * as positron from 'positron';
import {
    STATA_COMMANDS,
    STATA_FUNCTIONS,
    STATA_SNIPPETS,
    StataCommand,
    abbreviationLabel,
    isCommandPosition,
    resolveCommand,
    resolveFunction
} from './stataCommands';
import { extractDocumentVariables, extractGlobalMacros, extractLocalMacros } from './cellParser';

const SELECTOR: vscode.DocumentSelector = { language: 'stata' };
const IDENT_BEFORE_CURSOR = /[A-Za-z_][A-Za-z0-9_]*$/;

interface SessionVariable {
    name: string;
    type: string;
    label: string;
}

// ---- Session variables (Positron Variables pane via the kernel's variables comm) ----------------

const SESSION_CACHE_MS = 4000;
const SESSION_TIMEOUT_MS = 1500;
let sessionCache: { time: number; value: Promise<SessionVariable[]> } | undefined;

function withTimeout<T>(p: Thenable<T>, ms: number, fallback: T): Promise<T> {
    return new Promise<T>(resolve => {
        const timer = setTimeout(() => resolve(fallback), ms);
        Promise.resolve(p).then(
            v => {
                clearTimeout(timer);
                resolve(v);
            },
            () => {
                clearTimeout(timer);
                resolve(fallback);
            }
        );
    });
}

async function fetchSessionVariables(): Promise<SessionVariable[]> {
    try {
        const runtime = positron?.runtime;
        if (!runtime?.getSessionVariables) {
            return [];
        }
        let session = await runtime.getForegroundSession?.();
        if (session?.runtimeMetadata?.languageId !== 'stata') {
            const sessions = (await runtime.getActiveSessions?.()) ?? [];
            session = sessions.find(s => s.runtimeMetadata?.languageId === 'stata');
        }
        if (!session) {
            return [];
        }
        // The Stata kernel exposes the dataset as a single `current_dataset` entry whose children are its variables.
        const groups = await runtime.getSessionVariables(session.metadata.sessionId, [['current_dataset']]);
        const out: SessionVariable[] = [];
        for (const v of (groups ?? []).flat()) {
            if (v && typeof v.display_name === 'string' && !v.has_children) {
                out.push({ name: v.display_name, type: v.display_type ?? '', label: v.display_value ?? '' });
            }
        }
        return out;
    } catch {
        return [];
    }
}

function getSessionVariables(): Promise<SessionVariable[]> {
    const now = Date.now();
    if (!sessionCache || now - sessionCache.time > SESSION_CACHE_MS) {
        sessionCache = { time: now, value: withTimeout(fetchSessionVariables(), SESSION_TIMEOUT_MS, []) };
    }
    return sessionCache.value;
}

// ---- Static items ---------------------------------------------------------------------------------

function commandMarkdown(cmd: StataCommand): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendCodeblock(cmd.signature, 'stata');
    md.appendMarkdown(cmd.doc);
    const abbrev = abbreviationLabel(cmd);
    if (abbrev) {
        md.appendMarkdown(`\n\nMinimum abbreviation: \`${abbrev}\``);
    }
    return md;
}

function commandKind(cmd: StataCommand): vscode.CompletionItemKind {
    return cmd.category === 'prefix' || cmd.category === 'programming'
        ? vscode.CompletionItemKind.Keyword
        : vscode.CompletionItemKind.Function;
}

function isInComment(linePrefix: string): boolean {
    return /^\s*\*/.test(linePrefix) || /(^|\s)\/\//.test(linePrefix) || /\/\*(?!.*\*\/)/.test(linePrefix);
}

class StataCompletionProvider implements vscode.CompletionItemProvider {
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | undefined> {
        try {
            const lineText = document.lineAt(position.line).text;
            const linePrefix = lineText.slice(0, position.character);
            const nextChar = lineText.charAt(position.character);

            const localMatch = /`([A-Za-z0-9_]*)$/.exec(linePrefix);
            if (localMatch) {
                return this.macroItems(document, position, localMatch[1], 'local', nextChar === "'" ? '' : "'");
            }
            const globalMatch = /\$(\{)?([A-Za-z_][A-Za-z0-9_]*)?$/.exec(linePrefix);
            if (globalMatch) {
                const suffix = globalMatch[1] && nextChar !== '}' ? '}' : '';
                return this.macroItems(document, position, globalMatch[2] ?? '', 'global', suffix);
            }
            if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter || isInComment(linePrefix)) {
                return undefined;
            }

            const word = IDENT_BEFORE_CURSOR.exec(linePrefix)?.[0] ?? '';
            const before = linePrefix.slice(0, linePrefix.length - word.length);
            const commandPos = isCommandPosition(before);
            const items: vscode.CompletionItem[] = [];
            const rank = commandPos ? { cmd: '0', var: '1', fn: '2' } : { cmd: '2', var: '0', fn: '1' };

            for (const cmd of STATA_COMMANDS) {
                const abbrev = abbreviationLabel(cmd);
                const item = new vscode.CompletionItem(
                    { label: cmd.name, detail: abbrev ? ` (${abbrev})` : undefined, description: cmd.category },
                    commandKind(cmd)
                );
                item.detail = cmd.signature.split('\n')[0];
                item.documentation = commandMarkdown(cmd);
                item.sortText = `${rank.cmd}_${cmd.name}`;
                items.push(item);
            }

            if (commandPos) {
                for (const snip of STATA_SNIPPETS) {
                    const item = new vscode.CompletionItem({ label: snip.label, description: 'snippet' }, vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(snip.body);
                    item.detail = snip.description;
                    const md = new vscode.MarkdownString();
                    md.appendCodeblock(snip.body.replace(/\$\{\d+(?::([^}]*)|\|([^,|}]*)[^}]*)\}/g, '$1$2').replace(/\$\d+/g, ''), 'stata');
                    item.documentation = md;
                    item.sortText = `${rank.cmd}_${snip.label}~`;
                    items.push(item);
                }
            }

            for (const fn of STATA_FUNCTIONS) {
                const item = new vscode.CompletionItem({ label: fn.name, description: 'function' }, vscode.CompletionItemKind.Function);
                item.detail = fn.signature;
                item.documentation = new vscode.MarkdownString(fn.doc);
                item.insertText = fn.signature.includes('(') ? new vscode.SnippetString(`${fn.name}($0)`) : fn.name;
                item.sortText = `${rank.fn}_${fn.name}`;
                items.push(item);
            }

            const seen = new Set<string>();
            for (const v of await getSessionVariables()) {
                if (seen.has(v.name)) {
                    continue;
                }
                seen.add(v.name);
                const item = new vscode.CompletionItem({ label: v.name, description: v.type }, vscode.CompletionItemKind.Field);
                item.detail = v.label ? `${v.type} — ${v.label}` : v.type;
                item.sortText = `${rank.var}_${v.name}`;
                items.push(item);
            }
            for (const name of extractDocumentVariables(documentLines(document))) {
                if (seen.has(name)) {
                    continue;
                }
                seen.add(name);
                const item = new vscode.CompletionItem({ label: name, description: 'variable (do-file)' }, vscode.CompletionItemKind.Variable);
                item.sortText = `${rank.var}_${name}`;
                items.push(item);
            }
            return items;
        } catch (err) {
            console.error('Stata completion failed:', err);
            return undefined;
        }
    }

    private macroItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        partial: string,
        scope: 'local' | 'global',
        suffix: string
    ): vscode.CompletionItem[] {
        const lines = documentLines(document);
        const names = scope === 'local' ? extractLocalMacros(lines) : extractGlobalMacros(lines);
        const range = new vscode.Range(position.translate(0, -partial.length), position);
        return names.map(name => {
            const item = new vscode.CompletionItem({ label: name, description: `${scope} macro` }, vscode.CompletionItemKind.Variable);
            item.insertText = name + suffix;
            item.range = range;
            item.sortText = `0_${name}`;
            return item;
        });
    }
}

function documentLines(document: vscode.TextDocument): string[] {
    return document.getText().split(/\r?\n/);
}

// ---- Hover ----------------------------------------------------------------------------------------

class StataHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
        try {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!range) {
                return undefined;
            }
            const lineText = document.lineAt(position.line).text;
            const before = lineText.slice(0, range.start.character);
            if (isInComment(before) || /[`$]\{?$/.test(before)) {
                return undefined;
            }
            const word = document.getText(range);
            const after = lineText.slice(range.end.character);

            if (/^\s*\(/.test(after)) {
                const fn = resolveFunction(word);
                if (fn) {
                    const md = new vscode.MarkdownString();
                    md.appendCodeblock(fn.signature, 'stata');
                    md.appendMarkdown(fn.doc);
                    return new vscode.Hover(md, range);
                }
            }
            // Commands: at statement start, after a prefix, or starting a twoway sub-plot `(scatter ...)` / `|| line ...`.
            if (isCommandPosition(before) || /(\(|\|\|)\s*$/.test(before)) {
                const cmd = resolveCommand(word);
                if (cmd) {
                    return new vscode.Hover(commandMarkdown(cmd), range);
                }
            }
            return undefined;
        } catch {
            return undefined;
        }
    }
}

export function registerLanguageFeatures(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(SELECTOR, new StataCompletionProvider(), '`', '$'),
        vscode.languages.registerHoverProvider(SELECTOR, new StataHoverProvider())
    );
}
