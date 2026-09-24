import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildOutline,
    cellCode,
    cellIndexAt,
    computeFoldingRanges,
    extractDocumentVariables,
    extractGlobalMacros,
    extractLocalMacros,
    findBlocks,
    findCells,
    findSections,
    hasCellMarkers,
    isCellMarker,
    programName,
    rangeCode,
    sectionCode,
    sectionIndexAt,
    sectionRange
} from '../src/cellParser.ts';

const doc = (s: string) => s.replace(/^\n/, '').split('\n');

test('recognizes cell markers', () => {
    for (const l of ['* %%', '*%% Load', '  // %% clean data', '//%%']) {
        assert.ok(isCellMarker(l), l);
    }
    for (const l of ['** %%', '/// %%', 'di "%%"', '* %', '**# %% no']) {
        assert.ok(!isCellMarker(l), l);
    }
});

test('splits document into cells', () => {
    const lines = doc(`
sysuse auto, clear
* %% Summaries
summarize price

// %% Regression
regress price mpg
`);
    assert.ok(hasCellMarkers(lines));
    const cells = findCells(lines);
    assert.equal(cells.length, 3);
    assert.deepEqual(cells.map(c => [c.start, c.end, c.title]), [[0, 0, ''], [1, 3, 'Summaries'], [4, 6, 'Regression']]);
    assert.equal(cellCode(lines, cells[1]), 'summarize price');
    assert.equal(cellCode(lines, cells[2]), 'regress price mpg');
    assert.equal(cellIndexAt(cells, 0), 0);
    assert.equal(cellIndexAt(cells, 3), 1);
    assert.equal(cellIndexAt(cells, 5), 2);
});

test('blank preamble is not a cell; no markers means one cell', () => {
    assert.equal(findCells(doc('\n\n* %%\nx')).length, 1);
    const single = findCells(['a', 'b']);
    assert.deepEqual(single, [{ title: '', start: 0, end: 1 }]);
    assert.equal(cellCode(['', 'a', 'b', ''], findCells(['', 'a', 'b', ''])[0]), 'a\nb');
});

test('finds **# sections and computes hierarchical ranges', () => {
    const lines = doc(`
**# Setup
clear all
**## Paths
global root "."
**### Deep
di 1
**## Data
use x
**# Analysis
reg y x
** not a heading
**####### too deep
`);
    const sections = findSections(lines);
    assert.deepEqual(sections.map(s => [s.line, s.level, s.title]), [
        [0, 1, 'Setup'],
        [2, 2, 'Paths'],
        [4, 3, 'Deep'],
        [6, 2, 'Data'],
        [8, 1, 'Analysis']
    ]);
    assert.deepEqual(sectionRange(sections, 0, lines.length), { start: 0, end: 7 });
    assert.deepEqual(sectionRange(sections, 1, lines.length), { start: 2, end: 5 });
    assert.deepEqual(sectionRange(sections, 2, lines.length), { start: 4, end: 5 });
    assert.deepEqual(sectionRange(sections, 4, lines.length), { start: 8, end: lines.length - 1 });
    assert.equal(sectionIndexAt(sections, 5), 2);
    assert.equal(sectionIndexAt(sections, 7), 3);
    assert.equal(sectionIndexAt(doc('x\n**# A'), 0), -1);
    assert.equal(sectionCode(lines, sections, 3), 'use x');
    assert.equal(sectionCode(lines, sections, 1), 'global root "."\n**### Deep\ndi 1');
});

test('rangeCode trims surrounding blank lines only', () => {
    const lines = ['', 'a', '', 'b', '', 'c'];
    assert.equal(rangeCode(lines, 0, 3), 'a\n\nb');
    assert.equal(rangeCode(lines, 4, 3), '');
});

test('detects programs and blocks', () => {
    assert.equal(programName('program define myprog, rclass'), 'myprog');
    assert.equal(programName('capture program drop myprog'), undefined);
    assert.equal(programName('program myprog'), 'myprog');
    assert.equal(programName('pr de my.prog'), 'my.prog');
    assert.equal(programName('program list'), undefined);
    const lines = doc(`
program define outer
    input x
    1
    end
    mata:
    x = 1
    end
end
python:
def f():
    return 1
end
mata: st_local("a", "1")
`);
    const blocks = findBlocks(lines);
    assert.deepEqual(blocks.map(b => [b.kind, b.name, b.start, b.end]), [
        ['program', 'outer', 0, 7],
        ['input', 'input', 1, 3],
        ['mata', 'mata', 4, 6],
        ['python', 'python', 8, 11]
    ]);
});

test('folding covers sections, cells, blocks, comments, braces, and regions', () => {
    const lines = doc(`
**# Section
/* multi
   line */
foreach v of varlist a b {
    di "{"
    replace \`v' = 1
}
program p
end
// region
x
// endregion
* %% cell
y
`);
    const ranges = computeFoldingRanges(lines);
    const has = (start: number, end: number, kind?: string) =>
        ranges.some(r => r.start === start && r.end === end && r.kind === kind);
    assert.ok(has(0, 13, 'region'), 'section');
    assert.ok(has(1, 2, 'comment'), 'comment');
    assert.ok(has(3, 5), 'braces (closing brace stays visible)');
    assert.ok(has(7, 8), 'program');
    assert.ok(has(9, 11, 'region'), 'region markers');
    assert.ok(has(12, 13, 'region'), 'cell');
});

test('outline nests cells and programs under sections', () => {
    const lines = doc(`
**# Intro
* %% first
di 1
**## Sub
program define foo
end
**# Next
`);
    const outline = buildOutline(lines);
    assert.deepEqual(outline.map(n => n.name), ['Intro', 'Next']);
    const intro = outline[0];
    assert.deepEqual(intro.children.map(c => [c.kind, c.name]), [['cell', 'first'], ['section', 'Sub']]);
    assert.deepEqual(intro.children[1].children.map(c => [c.kind, c.name]), [['program', 'foo']]);
    // The cell runs to EOF but is clamped to its parent section.
    assert.equal(intro.children[0].end, intro.end);
});

test('extracts local macro names', () => {
    const lines = doc(`
local controls "age educ"
loc ++counter
tempvar touse resid
tempname b V
tempfile master
foreach var of varlist price mpg {
forvalues i = 1/10 {
forval j = 1/2 {
args first second
gettoken head rest : 0
levelsof rep78, local(levels)
syntax varlist(numeric) [if] [in] [, Robust noCONStant Level(cilevel)]
* local commented_out 1
di "x" // local trailing_comment 1
`);
    const names = extractLocalMacros(lines);
    for (const n of ['controls', 'counter', 'touse', 'resid', 'b', 'V', 'master', 'var', 'i', 'j', 'first', 'second', 'head', 'rest', 'levels', 'varlist', 'if', 'in', 'robust', 'constant', 'level']) {
        assert.ok(names.includes(n), `missing ${n}`);
    }
    assert.ok(!names.includes('commented_out'));
    assert.ok(!names.includes('trailing_comment'));
    assert.ok(!names.includes('cilevel'));
});

test('extracts globals and document variables', () => {
    const lines = doc(`
global root "/data"
gl out "$root/out"
gen double lnprice = ln(price)
qui g byte high = price > 5000
bysort id: egen total_x = total(x)
cap noi generate str10 name2 = ""
rename mpg miles
encode make, gen(make_id)
clonevar p2 = price
replace price = 1
`);
    assert.deepEqual(extractGlobalMacros(lines), ['out', 'root']);
    assert.deepEqual(extractDocumentVariables(lines), ['high', 'lnprice', 'make_id', 'miles', 'name2', 'p2', 'total_x']);
});
