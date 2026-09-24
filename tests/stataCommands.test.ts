import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATA_COMMANDS, STATA_FUNCTIONS, STATA_SNIPPETS, isCommandPosition, resolveCommand, resolveFunction } from '../src/stataCommands.ts';

test('command table is large, unique, and well-formed', () => {
    assert.ok(STATA_COMMANDS.length >= 250, `only ${STATA_COMMANDS.length} commands`);
    const names = STATA_COMMANDS.map(c => c.name);
    assert.equal(new Set(names).size, names.length, 'duplicate command names');
    for (const c of STATA_COMMANDS) {
        assert.ok(c.name.startsWith(c.minAbbrev), `${c.name}: abbreviation ${c.minAbbrev} is not a prefix`);
        assert.ok(c.signature && c.doc, `${c.name}: missing signature/doc`);
    }
    for (const n of ['reghdfe', 'ivreghdfe', 'ppmlhdfe', 'esttab', 'estout', 'outreg2', 'coefplot', 'binscatter', 'frame', 'collect']) {
        assert.ok(names.includes(n), `missing ${n}`);
    }
});

test('resolves standard Stata abbreviations', () => {
    const cases: [string, string][] = [
        ['su', 'summarize'],
        ['sum', 'summarize'],
        ['summ', 'summarize'],
        ['di', 'display'],
        ['dis', 'display'],
        ['g', 'generate'],
        ['gen', 'generate'],
        ['ta', 'tabulate'],
        ['tab', 'tabulate'],
        ['reg', 'regress'],
        ['qui', 'quietly'],
        ['cap', 'capture'],
        ['tw', 'twoway'],
        ['d', 'describe'],
        ['des', 'describe'],
        ['l', 'list'],
        ['la', 'label'],
        ['loc', 'local'],
        ['gl', 'global'],
        ['forv', 'forvalues'],
        ['forval', 'forvalues'],
        ['bys', 'bysort'],
        ['sc', 'scatter'],
        ['sca', 'scalar'],
        ['mat', 'matrix'],
        ['mata', 'mata'],
        ['est', 'estimates'],
        ['noi', 'noisily'],
        ['REG', 'regress'],
        ['reghdfe', 'reghdfe'],
        ['table', 'table'],
        ['tab1', 'tab1']
    ];
    for (const [abbrev, full] of cases) {
        assert.equal(resolveCommand(abbrev)?.name, full, abbrev);
    }
});

test('rejects too-short or unknown abbreviations', () => {
    for (const w of ['', 'lo', 'con', 'regh', 'esta', 'xyzzy', 'dro', 'repl']) {
        assert.equal(resolveCommand(w), undefined, w);
    }
});

test('command position detection', () => {
    assert.ok(isCommandPosition(''));
    assert.ok(isCommandPosition('    '));
    assert.ok(isCommandPosition('quietly '));
    assert.ok(isCommandPosition('cap noi '));
    assert.ok(isCommandPosition('bysort id (year): '));
    assert.ok(isCommandPosition('frame other: '));
    assert.ok(isCommandPosition('foreach v of varlist a b { '));
    assert.ok(!isCommandPosition('regress '));
    assert.ok(!isCommandPosition('gen x = '));
    assert.ok(!isCommandPosition('if inlist('));
});

test('functions and snippets are available', () => {
    for (const f of ['inlist', 'inrange', 'cond', 'missing', 'strtrim', 'substr', 'regexm', 'date', 'mdy', 'year', 'round', 'ln', 'exp']) {
        assert.ok(resolveFunction(f), f);
    }
    assert.ok(STATA_FUNCTIONS.length > 80);
    const labels = STATA_SNIPPETS.map(s => s.label);
    for (const s of ['foreach', 'forvalues', 'program', 'ifelse', 'preserve', 'capture noisily']) {
        assert.ok(labels.includes(s), s);
    }
});
