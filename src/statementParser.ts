// Pure (vscode-free) Stata statement parsing: statement ranges for "run statement and advance"
// and help-topic lookup. Both need the same lexical model (strings, comments, `///`, `#delimit`).
import { resolveCommand, resolveFunction } from './stataCommands';

export interface Pos {
    line: number;
    character: number;
}

export type OpaqueBlockKind = 'mata' | 'python' | 'input';

/** One lexical statement (a `cr` logical line or a `;`-terminated statement). */
export interface RawStatement {
    /** First code character (leading comments/whitespace excluded). */
    start: Pos;
    /** Exclusive end: end of the last physical line in `cr` mode, just past the `;` in `;` mode. */
    end: Pos;
    /** Code with comments removed, string contents dropped, whitespace collapsed. */
    code: string;
    /** `{` minus `}` outside strings, comments, and `${...}`. */
    braceDelta: number;
    /** Parsed under `#delimit ;`. */
    semicolon: boolean;
    /** A `#delimit` directive line. */
    directive?: boolean;
    /** `mata[:]` / `python[:]` / `input` block whose body (up to `end`) is included opaquely. */
    block?: OpaqueBlockKind;
}

/** A runnable statement: a raw statement or a whole block (braces, program, mata, ...). */
export interface Statement {
    start: Pos;
    end: Pos;
    /** Parsed under `#delimit ;` (so it needs that delimiter to run). */
    semicolon: boolean;
}

const PREFIX = '(?:(?:cap|capt|captu|captur|capture|qui|quie|quiet|quietl|quietly|n|no|noi|nois|noisi|noisil|noisily)\\s+)*';
const MATA_BLOCK = new RegExp(`^${PREFIX}mata\\s*:?$`);
const PYTHON_BLOCK = new RegExp(`^${PREFIX}python\\s*:?$`);
const INPUT_BLOCK = /^input\b/;
const END_LINE = /^\s*end\b/;
const END_STATEMENT = /^end\b/;
const IF_START = new RegExp(`^${PREFIX}if\\b`);
const ELSE_START = /^else\b/;
/** Same rule as the kernel: `#d` .. `#delimit`, any argument other than exactly `cr` means `;`. */
const DELIMIT = /^#d(?:e(?:l(?:i(?:m(?:i(?:t)?)?)?)?)?)?(?![A-Za-z0-9_])(.*)$/;
const PROGRAM_START =
    /^\s*(?:(?:cap|capt|captu|captur|capture)\s+)?(?:pr|pro|prog|progr|progra|program)\s+(?:(?:de|def|defi|defin|define)\s+)?([A-Za-z_][\w.]*)\s*(?:,.*)?(?:\/\/.*)?$/;
const PROGRAM_SUBCOMMANDS = new Set(['drop', 'dir', 'list']);

/** Name of the program defined by this code (`program [define] NAME`), if any. */
export function programName(code: string): string | undefined {
    const m = PROGRAM_START.exec(code);
    return m && !PROGRAM_SUBCOMMANDS.has(m[1]) ? m[1] : undefined;
}

const isWs = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);
/** `//` and `///` only count at line start or after whitespace. */
const startsLineComment = (line: string, k: number) => line[k] === '/' && line[k + 1] === '/' && (k === 0 || isWs(line[k - 1]));
const CONTINUATION = /(?:^|\s)\/\/\//;

/** Drop `/* *\/` and `//` comments from a single line. */
export function stripComments(text: string): string {
    return text.replace(/\/\*.*?\*\//g, ' ').replace(/(?:^|\s)\/\/.*$/, '');
}

function comparePos(a: Pos, b: Pos): number {
    return a.line - b.line || a.character - b.character;
}

/** Lex the document into statements, tracking `#delimit` state from the top. */
export function lexStatements(lines: readonly string[]): RawStatement[] {
    const out: RawStatement[] = [];
    const n = lines.length;
    let semi = false;
    let l = 0;
    let c = 0;

    /** Skip whitespace and comments between statements; false at end of document. */
    const skipGap = (): boolean => {
        let depth = 0;
        while (l < n) {
            const line = lines[l];
            if (c >= line.length) {
                l++;
                c = 0;
                continue;
            }
            const ch = line[c];
            const next = line[c + 1];
            if (depth > 0) {
                if (ch === '/' && next === '*') {
                    depth++;
                    c += 2;
                } else if (ch === '*' && next === '/') {
                    depth--;
                    c += 2;
                } else {
                    c++;
                }
                continue;
            }
            if (isWs(ch)) {
                c++;
            } else if (ch === '/' && next === '*') {
                depth = 1;
                c += 2;
            } else if (startsLineComment(line, c)) {
                c = line.length;
            } else if (ch === '*') {
                if (semi) {
                    // Under `#delimit ;` a `*` comment runs to the next `;`.
                    for (;;) {
                        const idx = lines[l].indexOf(';', c);
                        if (idx >= 0) {
                            c = idx + 1;
                            break;
                        }
                        l++;
                        c = 0;
                        if (l >= n) {
                            return false;
                        }
                    }
                } else {
                    // `* comment ///` continues the comment onto the next line.
                    let cont = CONTINUATION.test(line.slice(c + 1));
                    l++;
                    c = 0;
                    while (cont && l < n) {
                        cont = CONTINUATION.test(lines[l]);
                        l++;
                    }
                }
            } else {
                return true;
            }
        }
        return false;
    };

    while (skipGap()) {
        const start: Pos = { line: l, character: c };
        const directive = DELIMIT.exec(stripComments(lines[l].slice(c)).trim());
        if (directive) {
            // Even under `;`, a directive ends at the end of its line.
            out.push({ start, end: { line: l, character: lines[l].length }, code: lines[l].slice(c).trim(), braceDelta: 0, semicolon: semi, directive: true });
            semi = directive[1].trim() !== 'cr';
            l++;
            c = 0;
            continue;
        }

        let code = '';
        let braces = 0;
        let depth = 0; // nested /* */ comment depth
        let inString = false;
        let compound = 0; // `" ... "' nesting depth
        let continued = false;
        let end: Pos | undefined;
        outer: while (l < n) {
            const line = lines[l];
            while (c < line.length) {
                const ch = line[c];
                const next = line[c + 1];
                if (depth > 0) {
                    if (ch === '/' && next === '*') {
                        depth++;
                        c += 2;
                    } else if (ch === '*' && next === '/') {
                        depth--;
                        c += 2;
                    } else {
                        c++;
                    }
                    continue;
                }
                if (compound > 0) {
                    if (ch === '`' && next === '"') {
                        compound++;
                        c += 2;
                    } else if (ch === '"' && next === "'") {
                        compound--;
                        c += 2;
                        if (compound === 0) {
                            code += '"';
                        }
                    } else {
                        c++;
                    }
                    continue;
                }
                if (inString) {
                    if (ch === '"') {
                        inString = false;
                        code += '"';
                    }
                    c++;
                    continue;
                }
                if (ch === '`' && next === '"') {
                    compound = 1;
                    code += '"';
                    c += 2;
                } else if (ch === '"') {
                    inString = true;
                    code += '"';
                    c++;
                } else if (ch === '/' && next === '*') {
                    depth = 1;
                    code += ' ';
                    c += 2;
                } else if (startsLineComment(line, c)) {
                    continued = line[c + 2] === '/';
                    c = line.length;
                } else if (semi && ch === ';') {
                    c++;
                    end = { line: l, character: c };
                    break outer;
                } else if (ch === '$' && next === '{') {
                    const close = line.indexOf('}', c);
                    const stop = close < 0 ? line.length : close + 1;
                    code += line.slice(c, stop);
                    c = stop;
                } else {
                    if (ch === '{') {
                        braces++;
                    } else if (ch === '}') {
                        braces--;
                    }
                    code += ch;
                    c++;
                }
            }
            // Physical end of line: strings never span lines.
            inString = false;
            compound = 0;
            if (!semi && depth === 0 && !continued) {
                end = { line: l, character: line.length };
                l++;
                c = 0;
                break;
            }
            continued = false;
            code += ' ';
            l++;
            c = 0;
        }
        end ??= { line: n - 1, character: lines[n - 1].length };
        code = code.replace(/\s+/g, ' ').trim();
        if (!code) {
            continue; // e.g. a stray `;`
        }
        const raw: RawStatement = { start, end, code, braceDelta: braces, semicolon: semi };
        const block: OpaqueBlockKind | undefined = MATA_BLOCK.test(code) ? 'mata' : PYTHON_BLOCK.test(code) ? 'python' : INPUT_BLOCK.test(code) ? 'input' : undefined;
        if (block) {
            // The body is not Stata code: only a line starting with `end` closes it.
            let e = end.line + 1;
            while (e < n && !END_LINE.test(lines[e])) {
                e++;
            }
            if (e < n) {
                raw.end = { line: e, character: lines[e].length };
                raw.block = block;
                raw.braceDelta = 0;
                l = e + 1;
                c = 0;
            }
        }
        out.push(raw);
    }
    return out;
}

/** Index of the raw statement closing the brace block opened at `from`, or -1 if unbalanced. */
function braceBlockEnd(raws: readonly RawStatement[], from: number): number {
    let depth = 0;
    for (let j = from; j < raws.length; j++) {
        depth += raws[j].braceDelta;
        if (depth <= 0) {
            return j;
        }
    }
    return -1;
}

/**
 * Group raw statements into top-level runnable statements: brace blocks (with `if`/`else` chains),
 * `program ... end`, and opaque `mata`/`python`/`input` blocks. Incomplete blocks (unbalanced braces,
 * missing `end`) fall back to their first statement alone.
 */
export function parseStatements(lines: readonly string[]): Statement[] {
    const raws = lexStatements(lines);
    const out: Statement[] = [];
    let i = 0;
    while (i < raws.length) {
        const r = raws[i];
        let last = i;
        let complete = true;
        if (!r.directive && !r.block && programName(r.code)) {
            const j = raws.findIndex((x, k) => k > i && END_STATEMENT.test(x.code));
            if (j >= 0) {
                last = j;
            }
        } else if (r.braceDelta > 0) {
            const j = braceBlockEnd(raws, i);
            if (j >= 0) {
                last = j;
            } else {
                complete = false;
            }
        }
        if (complete && !r.directive && IF_START.test(r.code)) {
            while (last + 1 < raws.length && ELSE_START.test(raws[last + 1].code)) {
                if (raws[last + 1].braceDelta > 0) {
                    const j = braceBlockEnd(raws, last + 1);
                    if (j < 0) {
                        break;
                    }
                    last = j;
                } else {
                    last++;
                }
            }
        }
        out.push({ start: r.start, end: raws[last].end, semicolon: r.semicolon && !r.directive });
        i = last + 1;
    }
    return out;
}

export interface Block {
    kind: 'program' | OpaqueBlockKind;
    name: string;
    start: number;
    end: number;
}

/** Line ranges of `program ... end` and opaque `mata`/`python`/`input ... end` blocks. */
export function findBlocks(lines: readonly string[]): Block[] {
    const blocks: Block[] = [];
    let program: { name: string; start: number } | undefined;
    for (const r of lexStatements(lines)) {
        if (r.block) {
            blocks.push({ kind: r.block, name: r.block, start: r.start.line, end: r.end.line });
        } else if (program && END_STATEMENT.test(r.code)) {
            blocks.push({ kind: 'program', ...program, end: r.end.line });
            program = undefined;
        } else if (!program) {
            const name = programName(r.code);
            if (name) program = { name, start: r.start.line };
        }
    }
    return blocks.sort((a, b) => a.start - b.start);
}

/**
 * The statement at `pos` per Positron's StatementRangeProvider contract: the statement containing
 * the cursor, else (blank/comment position) the next statement. Under `#delimit ;` with several
 * statements on a line, whitespace before a statement selects it, and trailing whitespace/comments
 * after the line's last `;` select that last statement. Undefined when nothing follows.
 */
export function statementAt(lines: readonly string[], pos: Pos): Statement | undefined {
    const statements = parseStatements(lines);
    const p: Pos = { line: pos.line, character: Math.min(pos.character, lines[pos.line]?.length ?? 0) };
    const inside = statements.find(s => comparePos(s.start, p) <= 0 && comparePos(p, s.end) < 0)
        ?? statements.find(s => comparePos(p, s.end) === 0);
    if (inside) {
        return inside;
    }
    const laterOnLine = statements.find(s => s.start.line === p.line && comparePos(s.start, p) > 0);
    if (laterOnLine) {
        return laterOnLine;
    }
    const earlierOnLine = statements.filter(s => s.end.line === p.line && comparePos(s.end, p) < 0).pop();
    return earlierOnLine ?? statements.find(s => comparePos(s.start, p) > 0);
}

/** Text of lines between two positions (joined with `\n`). */
export function sliceText(lines: readonly string[], start: Pos, end: Pos): string {
    if (start.line === end.line) {
        return lines[start.line].slice(start.character, end.character);
    }
    const parts = [lines[start.line].slice(start.character)];
    for (let i = start.line + 1; i < end.line; i++) {
        parts.push(lines[i]);
    }
    parts.push(lines[end.line].slice(0, end.character));
    return parts.join('\n');
}

/**
 * Code to execute for a statement, when it differs from the document text. Statements inside a
 * `#delimit ;` region are wrapped so they run whatever the console's current delimiter is, and
 * leave the console in `cr` (Stata's own per-run default).
 */
export function statementCode(lines: readonly string[], statement: Statement): string | undefined {
    if (!statement.semicolon) {
        return undefined;
    }
    return `#delimit ;\n${sliceText(lines, statement.start, statement.end)}\n#delimit cr`;
}

// ---- Help topics ------------------------------------------------------------

const enum CharKind { Code, String, Comment }

/** Blank out string contents and comments (same length, newlines kept) and classify each char. */
function maskText(text: string): { masked: string; kinds: CharKind[] } {
    const out: string[] = [];
    const kinds: CharKind[] = [];
    const push = (ch: string, kind: CharKind) => {
        out.push(ch);
        kinds.push(kind);
    };
    let depth = 0;
    let inString = false;
    let compound = 0;
    let lineComment = false;
    for (let k = 0; k < text.length; k++) {
        const ch = text[k];
        const next = text[k + 1];
        if (ch === '\n') {
            lineComment = inString = false;
            compound = 0;
            push('\n', CharKind.Code);
        } else if (lineComment) {
            push(' ', CharKind.Comment);
        } else if (depth > 0) {
            if ((ch === '/' && next === '*') || (ch === '*' && next === '/')) {
                depth += ch === '/' ? 1 : -1;
                push(' ', CharKind.Comment);
                k++;
            }
            push(' ', CharKind.Comment);
        } else if (compound > 0) {
            if (ch === '`' && next === '"') {
                compound++;
                push(' ', CharKind.String);
                push(' ', CharKind.String);
                k++;
            } else if (ch === '"' && next === "'") {
                compound--;
                push(compound ? ' ' : '"', CharKind.String);
                push(' ', CharKind.String);
                k++;
            } else {
                push(' ', CharKind.String);
            }
        } else if (inString) {
            inString = ch !== '"';
            push(inString ? ' ' : '"', CharKind.String);
        } else if (ch === '`' && next === '"') {
            compound = 1;
            push('"', CharKind.String);
            push(' ', CharKind.String);
            k++;
        } else if (ch === '"') {
            inString = true;
            push('"', CharKind.String);
        } else if (ch === '/' && next === '*') {
            depth = 1;
            push(' ', CharKind.Comment);
            push(' ', CharKind.Comment);
            k++;
        } else if (ch === '/' && next === '/' && (k === 0 || isWs(text[k - 1]))) {
            lineComment = true;
            push(' ', CharKind.Comment);
        } else {
            push(ch, CharKind.Code);
        }
    }
    return { masked: out.join(''), kinds };
}

const PREFIX_WORD = new RegExp(`^(?:qui|quie|quiet|quietl|quietly|n|no|noi|nois|noisi|noisil|noisily|cap|capt|captu|captur|capture|else)$`);
/** Prefix commands that are followed by `:` (besides table entries with category `prefix`). */
const COLON_PREFIXES = new Set(['frame', 'version', 'mi', 'eststo', 'estpost', 'collect', 'timeit']);
const FV_OP = /^(?:i|c|o|b|bn|ib|io|ibn|i\d+|b\d+|o\d+|ib\d+|io\d+)$/;
const TS_OP = /^(?:[LFDS]\d*)+$/i;
const FILE_EXTENSION = /^(?:dta|do|ado|csv|txt|log|smcl|xlsx?|gph|png|pdf|svg|tex|rtf|docx?|sthlp|json|parquet)$/i;
const WEIGHTS = /^(?:aw|fw|pw|iw|aweight|fweight|pweight|iweight)$/;
const RESULT_FUNCTIONS: Record<string, string> = { r: 'return', e: 'ereturn', c: 'creturn', s: 'return' };
const TOPIC = /^[A-Za-z0-9_.]+$/;

interface CommandWord {
    word: string;
    start: number;
    end: number;
    /** Text offset where this word's segment ends (its prefix colon, or end of statement). */
    segEnd: number;
    isPrefix: boolean;
}

/** Index of `ch` at parenthesis depth 0 at or after `from`, or -1. */
function topLevelIndexOf(masked: string, ch: string, from: number): number {
    let depth = 0;
    for (let k = from; k < masked.length; k++) {
        const x = masked[k];
        if (x === '(' || x === '[') {
            depth++;
        } else if (x === ')' || x === ']') {
            depth = Math.max(0, depth - 1);
        } else if (x === ch && depth === 0) {
            return k;
        }
    }
    return -1;
}

/** True when `to` is at parenthesis depth 0 after a depth-0 comma, i.e. an option name. */
function isOption(masked: string, from: number, to: number): boolean {
    let depth = 0;
    let comma = false;
    for (let k = from; k < to; k++) {
        const x = masked[k];
        if (x === '(' || x === '[') {
            depth++;
        } else if (x === ')' || x === ']') {
            depth = Math.max(0, depth - 1);
        } else if (x === ',' && depth === 0) {
            comma = true;
        }
    }
    return comma && depth === 0;
}

/** Prefix words (`quietly`, `by x:`, `frame f:` ...) and the command word of a statement. */
function commandWords(masked: string): CommandWord[] {
    const words: CommandWord[] = [];
    const wordRe = /[A-Za-z_]\w*/y;
    let i = 0;
    for (;;) {
        while (i < masked.length && /[\s{}]/.test(masked[i])) {
            i++;
        }
        wordRe.lastIndex = i;
        const m = wordRe.exec(masked);
        if (!m) {
            break;
        }
        const word = m[0];
        const start = i;
        const end = i + word.length;
        if (PREFIX_WORD.test(word)) {
            i = end;
            while (i < masked.length && isWs(masked[i])) {
                i++;
            }
            if (masked[i] === ':') {
                i++;
            }
            words.push({ word, start, end, segEnd: i, isPrefix: true });
            continue;
        }
        const cmd = resolveCommand(word);
        if (cmd?.category === 'prefix' || COLON_PREFIXES.has(word)) {
            const colon = topLevelIndexOf(masked, ':', end);
            if (colon >= 0) {
                words.push({ word, start, end, segEnd: colon, isPrefix: true });
                i = colon + 1;
                continue;
            }
        }
        words.push({ word, start, end, segEnd: masked.length, isPrefix: false });
        break;
    }
    return words;
}

function commandTopic(word: string): string {
    const name = resolveCommand(word)?.name ?? word;
    switch (name) {
        case 'bysort':
            return 'by';
        case 'if':
        case 'else':
            return 'ifcmd';
        case 'end':
            return 'program';
        default:
            return name;
    }
}

function wordAt(text: string, offset: number): { start: number; end: number } | undefined {
    const isWord = (ch: string | undefined) => ch !== undefined && /\w/.test(ch);
    let s = offset;
    if (!isWord(text[s])) {
        if (!isWord(text[s - 1])) {
            return undefined;
        }
        s--;
    }
    let e = s;
    while (s > 0 && isWord(text[s - 1])) {
        s--;
    }
    while (isWord(text[e])) {
        e++;
    }
    return { start: s, end: e };
}

/**
 * The Stata help topic for the cursor position, or '' when none applies (comments, blank lines).
 * Commands resolve abbreviations (`reg` -> `regress`), prefixes map to their help (`bysort` -> `by`),
 * functions map to `f_name` (Stata's help aliases cover variants, e.g. `f_log` -> `f_ln`), Mata
 * functions to `mf_name`, macros to `macro`, factor/time-series operators to `fvvarlist`/`tsvarlist`.
 * Anything else (variables, options, arguments) falls back to the statement's command.
 */
export function helpTopicAt(lines: readonly string[], pos: Pos): string {
    const raws = lexStatements(lines);
    const lineText = lines[pos.line] ?? '';
    const p: Pos = { line: pos.line, character: Math.min(pos.character, lineText.length) };
    const raw = raws.find(r => comparePos(r.start, p) <= 0 && comparePos(p, r.end) <= 0)
        ?? raws.find(r => r.start.line === p.line && r.start.character >= p.character && lineText.slice(p.character, r.start.character).trim() === '');
    if (!raw) {
        return '';
    }
    if (raw.directive) {
        return 'delimit';
    }

    if (raw.block && p.line > raw.start.line) {
        if (raw.block !== 'mata') {
            return raw.block;
        }
        const w = wordAt(lineText, p.character);
        const name = w && lineText.slice(w.start, w.end);
        return name && lineText[w.end] === '(' && /^[A-Za-z_]\w*$/.test(name) ? `mf_${name}` : 'mata';
    }

    const end = raw.block ? { line: raw.start.line, character: lines[raw.start.line].length } : raw.end;
    const text = sliceText(lines, raw.start, end);
    const offset = comparePos(p, raw.start) <= 0 ? 0
        : p.line === raw.start.line ? p.character - raw.start.character
            : lines.slice(raw.start.line, p.line).reduce((acc, l, idx) => acc + (idx === 0 ? l.length - raw.start.character : l.length) + 1, 0) + p.character;
    const { masked, kinds } = maskText(text);
    const kind = kinds[offset] ?? kinds[offset - 1];
    if (kind === CharKind.Comment) {
        return '';
    }

    const words = commandWords(masked);
    const segment = words.find(w => offset >= w.start && offset <= w.segEnd) ?? words[words.length - 1];
    const fallback = segment ? commandTopic(segment.word) : '';
    const sanitize = (topic: string) => (TOPIC.test(topic) ? topic : '');
    const tok = kind === CharKind.String ? undefined : wordAt(masked, offset);
    if (!tok) {
        return sanitize(fallback);
    }
    const token = masked.slice(tok.start, tok.end);
    const before = masked[tok.start - 1];

    // Macro references: `name', $name, ${name}.
    if (before === '`' || before === '$' || (before === '{' && masked[tok.start - 2] === '$')) {
        return 'macro';
    }

    // Factor-variable / time-series terms: i.x, c.x##c.y, ib2.x, L.x, L2D.x.
    let ts = tok.start;
    let te = tok.end;
    while (ts > 0 && /[\w.#]/.test(masked[ts - 1])) {
        ts--;
    }
    while (te < masked.length && /[\w.#]/.test(masked[te])) {
        te++;
    }
    const term = masked.slice(ts, te);
    if (/\w#|#\w|##/.test(term)) {
        return 'fvvarlist';
    }
    const parts = term.split('.');
    if (parts.length >= 2 && parts[1] !== '' && !FILE_EXTENSION.test(parts[parts.length - 1])) {
        if (FV_OP.test(parts[0])) {
            return 'fvvarlist';
        }
        if (TS_OP.test(parts[0])) {
            return 'tsvarlist';
        }
    }

    const commandWord = words.find(w => w.start === tok.start);
    if (commandWord) {
        return sanitize(commandTopic(commandWord.word));
    }

    const mataContext = raw.block === 'mata' || words.some(w => w.word === 'mata');
    if (masked[tok.end] === '(') {
        if (RESULT_FUNCTIONS[token]) {
            return RESULT_FUNCTIONS[token];
        }
        if (mataContext) {
            return sanitize(`mf_${token}`);
        }
        if (!isOption(masked, segment ? segment.end : 0, tok.start) && fallback !== 'egen' && (resolveFunction(token) || /^[A-Za-z_]\w*$/.test(token))) {
            return sanitize(`f_${token}`);
        }
        return sanitize(fallback);
    }
    if (mataContext) {
        return 'mata';
    }

    if (token === 'if' && fallback !== 'ifcmd') {
        return 'if';
    }
    if (token === 'in' && fallback !== 'foreach') {
        return 'in';
    }
    if (WEIGHTS.test(token) && masked.slice(0, tok.start).trimEnd().endsWith('[')) {
        return 'weight';
    }
    return sanitize(fallback);
}
