// Pure do-file parsing helpers (cells, sections, folding, outline, macros). No `vscode` imports.
import { findBlocks, stripComments } from './statementParser';

/** Cell marker: `* %%` or `// %%` (optionally followed by a title). */
const CELL_MARKER = /^\s*(?:\*|\/\/)\s*%%/;
/** Stata 18+ bookmark heading: `**#` .. `**######` followed by an optional title. */
const SECTION_HEADING = /^\s*\*\*(#{1,6})(?!#)\s*(.*?)\s*$/;

export interface Cell {
    /** Line of the `%%` marker, or undefined for the implicit cell before the first marker / whole file. */
    markerLine?: number;
    title: string;
    /** First line of the cell (the marker line when present). */
    start: number;
    /** Last line of the cell (inclusive). */
    end: number;
}

export interface Section {
    line: number;
    level: number;
    title: string;
}

export interface LineRange {
    start: number;
    end: number;
}

export function isCellMarker(line: string): boolean {
    return CELL_MARKER.test(line);
}

export function hasCellMarkers(lines: readonly string[]): boolean {
    return lines.some(isCellMarker);
}

function cellTitle(line: string): string {
    return line.replace(CELL_MARKER, '').trim();
}

/**
 * Split a document into cells. Without markers the whole document is a single cell. Content before
 * the first marker becomes an implicit leading cell only if it contains something other than blank lines.
 */
export function findCells(lines: readonly string[]): Cell[] {
    const markers: number[] = [];
    lines.forEach((l, i) => {
        if (isCellMarker(l)) {
            markers.push(i);
        }
    });
    const last = Math.max(lines.length - 1, 0);
    if (markers.length === 0) {
        return [{ title: '', start: 0, end: last }];
    }
    const cells: Cell[] = [];
    if (markers[0] > 0 && lines.slice(0, markers[0]).some(l => l.trim() !== '')) {
        cells.push({ title: '', start: 0, end: markers[0] - 1 });
    }
    markers.forEach((m, i) => {
        const end = i + 1 < markers.length ? markers[i + 1] - 1 : last;
        cells.push({ markerLine: m, title: cellTitle(lines[m]), start: m, end });
    });
    return cells;
}

export function cellIndexAt(cells: readonly Cell[], line: number): number {
    for (let i = cells.length - 1; i >= 0; i--) {
        if (line >= cells[i].start) {
            return i;
        }
    }
    return cells.length ? 0 : -1;
}

/** Code of a cell, excluding its marker line and surrounding blank lines. */
export function cellCode(lines: readonly string[], cell: Cell): string {
    const from = cell.markerLine !== undefined ? cell.markerLine + 1 : cell.start;
    return trimBlankLines(lines.slice(from, cell.end + 1)).join('\n');
}

/** Code for lines `start..end` (inclusive), with surrounding blank lines removed. */
export function rangeCode(lines: readonly string[], start: number, end: number): string {
    return start > end ? '' : trimBlankLines(lines.slice(Math.max(start, 0), end + 1)).join('\n');
}

/** Code of a section body (heading line excluded). */
export function sectionCode(lines: readonly string[], sections: readonly Section[], index: number): string {
    const r = sectionRange(sections, index, lines.length);
    return rangeCode(lines, r.start + 1, r.end);
}

function trimBlankLines(lines: readonly string[]): string[] {
    let a = 0;
    let b = lines.length;
    while (a < b && lines[a].trim() === '') {
        a++;
    }
    while (b > a && lines[b - 1].trim() === '') {
        b--;
    }
    return lines.slice(a, b);
}

export function findSections(lines: readonly string[]): Section[] {
    const sections: Section[] = [];
    lines.forEach((l, i) => {
        const m = SECTION_HEADING.exec(l);
        if (m) {
            sections.push({ line: i, level: m[1].length, title: m[2] });
        }
    });
    return sections;
}

/** Range from a section heading to the line before the next heading of the same or higher level (fewer #s). */
export function sectionRange(sections: readonly Section[], index: number, lineCount: number): LineRange {
    const s = sections[index];
    let end = Math.max(lineCount - 1, s.line);
    for (let j = index + 1; j < sections.length; j++) {
        if (sections[j].level <= s.level) {
            end = sections[j].line - 1;
            break;
        }
    }
    return { start: s.line, end };
}

/** Index of the innermost section heading at or above `line`, or -1. */
export function sectionIndexAt(sections: readonly Section[], line: number): number {
    for (let i = sections.length - 1; i >= 0; i--) {
        if (sections[i].line <= line) {
            return i;
        }
    }
    return -1;
}

// ---- Folding ---------------------------------------------------------------

export interface FoldRange extends LineRange {
    kind?: 'comment' | 'region';
}

const REGION_START = /^\s*\/\/\s*#?region\b/;
const REGION_END = /^\s*\/\/\s*#?endregion\b/;

/** Multi-line `/* ... *\/` comments and `{ ... }` blocks, ignoring braces in strings and comments. */
function scanCommentsAndBraces(lines: readonly string[]): { comments: LineRange[]; braces: LineRange[] } {
    const comments: LineRange[] = [];
    const braces: LineRange[] = [];
    const braceStack: number[] = [];
    let commentDepth = 0;
    let commentStart = -1;
    lines.forEach((line, i) => {
        if (commentDepth === 0 && /^\s*\*/.test(line)) {
            return; // `*` comment line
        }
        let inString = false;
        for (let k = 0; k < line.length; k++) {
            const ch = line[k];
            const next = line[k + 1];
            if (commentDepth > 0) {
                if (ch === '/' && next === '*') {
                    commentDepth++;
                    k++;
                } else if (ch === '*' && next === '/') {
                    commentDepth--;
                    k++;
                    if (commentDepth === 0 && i > commentStart) {
                        comments.push({ start: commentStart, end: i });
                    }
                }
                continue;
            }
            if (inString) {
                if (ch === '"') {
                    inString = false;
                }
                continue;
            }
            if (ch === '"') {
                inString = true;
            } else if (ch === '/' && next === '*') {
                commentDepth = 1;
                commentStart = i;
                k++;
            } else if (ch === '/' && next === '/' && (k === 0 || /\s/.test(line[k - 1]))) {
                break; // `//` line comment
            } else if (ch === '{') {
                braceStack.push(i);
            } else if (ch === '}') {
                const open = braceStack.pop();
                if (open !== undefined && i > open) {
                    braces.push({ start: open, end: i });
                }
            }
        }
    });
    return { comments, braces };
}

export function computeFoldingRanges(lines: readonly string[]): FoldRange[] {
    const ranges: FoldRange[] = [];
    const lastNonBlank = (from: number, to: number) => {
        let e = to;
        while (e > from && lines[e].trim() === '') {
            e--;
        }
        return e;
    };

    const sections = findSections(lines);
    sections.forEach((_, i) => {
        const r = sectionRange(sections, i, lines.length);
        const end = lastNonBlank(r.start, r.end);
        if (end > r.start) {
            ranges.push({ start: r.start, end, kind: 'region' });
        }
    });

    for (const cell of findCells(lines)) {
        const end = lastNonBlank(cell.start, cell.end);
        if (cell.markerLine !== undefined && end > cell.start) {
            ranges.push({ start: cell.start, end, kind: 'region' });
        }
    }

    for (const b of findBlocks(lines)) {
        if (b.end > b.start) {
            ranges.push({ start: b.start, end: b.end });
        }
    }

    const { comments, braces } = scanCommentsAndBraces(lines);
    comments.forEach(c => ranges.push({ ...c, kind: 'comment' }));
    // Fold `{ ... }` so the closing brace stays visible, matching VS Code's default indentation folding.
    braces.forEach(b => {
        if (b.end - 1 > b.start) {
            ranges.push({ start: b.start, end: b.end - 1 });
        }
    });

    const regionStack: number[] = [];
    lines.forEach((l, i) => {
        if (REGION_START.test(l)) {
            regionStack.push(i);
        } else if (REGION_END.test(l)) {
            const s = regionStack.pop();
            if (s !== undefined) {
                ranges.push({ start: s, end: i, kind: 'region' });
            }
        }
    });

    return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

// ---- Outline ---------------------------------------------------------------

export type OutlineKind = 'section' | 'cell' | 'program';

export interface OutlineNode extends LineRange {
    name: string;
    kind: OutlineKind;
    /** Line holding the heading/marker/definition. */
    line: number;
    level: number;
    children: OutlineNode[];
}

/** Hierarchical outline: sections nest by level; cells and programs nest under the enclosing section. */
export function buildOutline(lines: readonly string[]): OutlineNode[] {
    const sections = findSections(lines);
    const items: OutlineNode[] = sections.map((s, i) => {
        const r = sectionRange(sections, i, lines.length);
        return { name: s.title || `Section ${'#'.repeat(s.level)}`, kind: 'section', line: s.line, level: s.level, ...r, children: [] };
    });
    for (const c of findCells(lines)) {
        if (c.markerLine !== undefined) {
            items.push({ name: c.title || `Cell (line ${c.markerLine + 1})`, kind: 'cell', line: c.markerLine, level: 99, start: c.start, end: c.end, children: [] });
        }
    }
    for (const b of findBlocks(lines)) {
        if (b.kind === 'program') {
            items.push({ name: b.name, kind: 'program', line: b.start, level: 100, start: b.start, end: b.end, children: [] });
        }
    }
    items.sort((a, b) => a.line - b.line || a.level - b.level);

    const roots: OutlineNode[] = [];
    const stack: OutlineNode[] = [];
    for (const item of items) {
        // Pop parents that don't contain this item or that aren't sections of a strictly lower level.
        while (stack.length) {
            const top = stack[stack.length - 1];
            const contains = item.line >= top.start && item.line <= top.end;
            const canParent = top.kind === 'section' && (item.kind !== 'section' || item.level > top.level);
            if (contains && canParent) {
                break;
            }
            stack.pop();
        }
        const parent = stack[stack.length - 1];
        (parent ? parent.children : roots).push(item);
        // Clamp cells to their parent section so the symbol range stays inside it.
        if (parent && item.end > parent.end) {
            item.end = parent.end;
        }
        stack.push(item);
    }
    return roots;
}

// ---- Macros and variables ----------------------------------------------------

const IDENT = '[A-Za-z_][A-Za-z0-9_]*';
const LOCAL_DEF = new RegExp(`\\b(?:loc|loca|local)\\s+(?:\\+\\+|--)?(${IDENT})`, 'g');
const TEMP_DEF = /\b(?:tempvar|tempname|tempfile)\s+([^\/\n]*)/g;
const FOREACH_DEF = new RegExp(`\\bforeach\\s+(${IDENT})\\s+(?:in|of)\\b`, 'g');
const FORVALUES_DEF = new RegExp(`\\bforv(?:a|al|alu|alue|alues)?\\s+(${IDENT})\\s*=`, 'g');
const ARGS_DEF = /^\s*args\s+([^\/\n]*)/;
const GETTOKEN_DEF = new RegExp(`\\bgettoken\\s+(${IDENT})(?:\\s+(${IDENT}))?\\s*:`, 'g');
const LOCAL_OPTION = new RegExp(`\\blocal\\(\\s*(${IDENT})\\s*\\)`, 'g');
const SYNTAX_LINE = /^\s*syntax\b(.*)$/;
const GLOBAL_DEF = new RegExp(`\\b(?:gl|glo|glob|globa|global)\\s+(${IDENT})`, 'g');

function addAll(target: Set<string>, re: RegExp, text: string, groups = [1]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        for (const g of groups) {
            if (m[g]) {
                target.add(m[g]);
            }
        }
    }
}

function identifiersIn(text: string): string[] {
    return text.split(/\s+/).filter(w => new RegExp(`^${IDENT}$`).test(w));
}

/** Strip comments and skip `*` comment lines (approximate; ignores `//` inside strings). */
function codeOf(line: string): string {
    return /^\s*\*/.test(line) ? '' : stripComments(line);
}

/** Local macro names defined in the document (local, tempvar/tempname/tempfile, loop variables, args, syntax, ...). */
export function extractLocalMacros(lines: readonly string[]): string[] {
    const names = new Set<string>();
    for (const raw of lines) {
        const line = codeOf(raw);
        if (!line.trim()) {
            continue;
        }
        addAll(names, LOCAL_DEF, line);
        addAll(names, FOREACH_DEF, line);
        addAll(names, FORVALUES_DEF, line);
        addAll(names, GETTOKEN_DEF, line, [1, 2]);
        addAll(names, LOCAL_OPTION, line);
        TEMP_DEF.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = TEMP_DEF.exec(line))) {
            identifiersIn(m[1]).forEach(n => names.add(n));
        }
        const args = ARGS_DEF.exec(line);
        if (args) {
            identifiersIn(args[1]).forEach(n => names.add(n));
        }
        const syntax = SYNTAX_LINE.exec(line);
        if (syntax) {
            const spec = syntax[1];
            for (const kw of ['varlist', 'newvarlist', 'varname', 'newvarname', 'namelist', 'name', 'anything', 'if', 'in', 'using', 'exp']) {
                if (new RegExp(`(^|[\\s\\[(])${kw}\\b`).test(spec)) {
                    names.add(kw === 'newvarlist' ? 'varlist' : kw === 'newvarname' ? 'varname' : kw);
                }
            }
            if (/\[\s*[a-z]*weight/.test(spec)) {
                names.add('weight');
                names.add('exp');
            }
            // Options after the comma: uppercase prefix is the minimum abbreviation; the macro is the lowercased name.
            const comma = spec.indexOf(',');
            if (comma >= 0) {
                const optRe = /([A-Za-z][A-Za-z0-9_]*)(?=\s*(?:\(|\]|\s|$))/g;
                let o: RegExpExecArray | null;
                while ((o = optRe.exec(spec.slice(comma + 1)))) {
                    // `noCONStant` stores into `constant`.
                    const opt = /^no[A-Z]/.test(o[1]) ? o[1].slice(2) : o[1];
                    names.add(opt.toLowerCase());
                }
            }
        }
    }
    return [...names].sort();
}

export function extractGlobalMacros(lines: readonly string[]): string[] {
    const names = new Set<string>();
    for (const raw of lines) {
        addAll(names, GLOBAL_DEF, codeOf(raw));
    }
    return [...names].sort();
}

const STATEMENT_PREFIX = String.raw`(?:(?:qui(?:e|et|etl|etly)?|n(?:o|oi|ois|oisi|oisil|oisily)?|cap(?:t|tu|tur|ture)?)\s*:?\s*|by(?:s|so|sor|sort)?\s[^:]*:\s*)*`;
const GENERATE_DEF = new RegExp(
    `^\\s*${STATEMENT_PREFIX}(?:g|ge|gen|gene|gener|genera|generat|generate|egen|clonevar|gegen)\\s+(?:(?:byte|int|long|float|double|strL|str\\d+)\\s+)?(${IDENT})`
);
const RENAME_DEF = new RegExp(`^\\s*${STATEMENT_PREFIX}ren(?:a|am|ame)?\\s+(${IDENT})\\s+(${IDENT})\\s*$`);
const GEN_OPTION = new RegExp(`\\bgen(?:e|er|era|erat|erate)?\\(\\s*(${IDENT})\\s*\\)`, 'g');

/** Variable names created in the document by generate/egen/clonevar/rename or `generate()` options. */
export function extractDocumentVariables(lines: readonly string[]): string[] {
    const names = new Set<string>();
    for (const raw of lines) {
        const line = codeOf(raw);
        const g = GENERATE_DEF.exec(line);
        if (g) {
            names.add(g[1]);
        }
        const r = RENAME_DEF.exec(line);
        if (r) {
            names.add(r[2]);
        }
        addAll(names, GEN_OPTION, line);
    }
    return [...names].sort();
}
