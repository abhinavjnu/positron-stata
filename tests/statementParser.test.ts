import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helpTopicAt, lexStatements, parseStatements, sliceText, statementAt, statementCode } from '../src/statementParser.ts';

const CURSOR = '‸';

function locate(src: string): { lines: string[]; pos: { line: number; character: number } } {
    const lines = src.split('\n');
    const line = lines.findIndex(l => l.includes(CURSOR));
    assert.ok(line >= 0, 'test source needs a cursor marker');
    const character = lines[line].indexOf(CURSOR);
    lines[line] = lines[line].replace(CURSOR, '');
    return { lines, pos: { line, character } };
}

/** Text of the statement selected at the cursor marker, or undefined. */
function run(src: string): string | undefined {
    const { lines, pos } = locate(src);
    const s = statementAt(lines, pos);
    return s && sliceText(lines, s.start, s.end);
}

function help(src: string): string {
    const { lines, pos } = locate(src);
    return helpTopicAt(lines, pos);
}

function all(src: string): string[] {
    const lines = src.split('\n');
    return parseStatements(lines).map(s => sliceText(lines, s.start, s.end));
}

// ---- Basics -----------------------------------------------------------------

test('single-line statements', () => {
    assert.equal(run('sysuse auto\nsu‸m price\nreg price mpg'), 'sum price');
    assert.equal(run('sysuse auto\n‸sum price'), 'sum price');
    assert.equal(run('sysuse auto\nsum price‸'), 'sum price');
    assert.deepEqual(all('sysuse auto\n\nsum price\nreg price mpg'), ['sysuse auto', 'sum price', 'reg price mpg']);
});

test('indentation: range starts at the code, cursor in the indent selects it', () => {
    assert.equal(run('    ‸    sum price'), 'sum price');
    assert.equal(run('‸    sum price'), 'sum price');
});

test('/// continuation across many lines', () => {
    const src = 'sysuse auto\nregress price ///\n    mpg ///\n  ‸  weight ///\n    , robust\nsum price';
    assert.equal(run(src), 'regress price ///\n    mpg ///\n    weight ///\n    , robust');
    assert.equal(run('reg‸ress price /// comment after continuation\n  mpg\nsum'), 'regress price /// comment after continuation\n  mpg');
    assert.equal(run('///\n‸sum price'), 'sum price');
});

test('/// only continues when preceded by whitespace or at line start, never inside strings', () => {
    assert.deepEqual(all('di "a ///"\ndi "b"'), ['di "a ///"', 'di "b"']);
    assert.deepEqual(all('copy http:///x.com/a.dta b.dta\nsum'), ['copy http:///x.com/a.dta b.dta', 'sum']);
    assert.deepEqual(all('di 1 // comment ///\ndi 2'), ['di 1 // comment ///', 'di 2']);
    assert.deepEqual(all('local s `"compound ///"\'\ndi 2'), ['local s `"compound ///"\'', 'di 2']);
});

test('// comments: trailing comment kept on the statement line, comment lines skipped', () => {
    assert.equal(run('su‸m price // note\nreg'), 'sum price // note');
    assert.equal(run('// heading‸\nsum price'), 'sum price');
    assert.equal(run('* star comment‸\n\n  sum price'), 'sum price');
});

test('cursor on blank/comment line returns the next statement; none at end of document', () => {
    assert.equal(run('sum price\n‸\n\nreg price mpg'), 'reg price mpg');
    assert.equal(run('sum price\n* comment ‸\nreg price mpg'), 'reg price mpg');
    assert.equal(run('sum price\n\n‸'), undefined);
    assert.equal(run('sum price\n// trailing comment‸'), undefined);
    assert.equal(run('‸'), undefined);
});

test('**# section headings and * %% cell markers are comments', () => {
    assert.equal(run('**# Section 1‸\nsum price'), 'sum price');
    assert.equal(run('* %% cell‸\nsum price'), 'sum price');
    assert.equal(run('// %% cell‸\nsum price'), 'sum price');
});

test('* comment ending in /// swallows the next line', () => {
    assert.deepEqual(all('* comment ///\nsum price\nreg y x'), ['reg y x']);
});

test('/* */ comments: multi-line, nested, embedded, and cursor inside -> next statement', () => {
    const src = 'sum price\n/* a long\n  comment ‸ here\n*/\nreg price mpg';
    assert.equal(run(src), 'reg price mpg');
    // Comment closing on a line with code: the statement starts after `*/`.
    assert.equal(run('/* note\n*/ reg‸ price mpg'), 'reg price mpg');
    assert.equal(run('/* note\n‸*/ reg price mpg'), 'reg price mpg');
    // A comment inside a statement joins the lines (Stata does the same).
    assert.equal(run('reg‸ price /* spanning\n comment */ mpg\nsum'), 'reg price /* spanning\n comment */ mpg');
    // Nested comments.
    assert.equal(run('/* outer /* inner */ still comment\nsum x */\nreg‸ y x'), 'reg y x');
    assert.deepEqual(all('/* outer /* inner */ still comment\nsum x */\nreg y x'), ['reg y x']);
    // `*/` inside a string does not close anything; `/*` inside a string opens nothing.
    assert.deepEqual(all('di "/*"\ndi "b"'), ['di "/*"', 'di "b"']);
});

// ---- Brace blocks -------------------------------------------------------------

test('foreach/forvalues/while blocks: cursor anywhere selects the whole block', () => {
    const src = ['sysuse auto', 'foreach v of varlist price mpg {', '    sum `v‸\'', '}', 'reg price mpg'].join('\n');
    const block = 'foreach v of varlist price mpg {\n    sum `v\'\n}';
    assert.equal(run(src), block);
    assert.equal(run(src.replace('‸', '').replace('foreach', 'fore‸ach')), block);
    assert.equal(run(src.replace('‸', '').replace(/}$/m, '}‸')), block);
    assert.equal(run('forvalues i = 1/3 {\n  di `i‸\'\n}'), 'forvalues i = 1/3 {\n  di `i\'\n}');
    assert.equal(run('local i 0\nwhile `i\' < 3 {\n  local ++i‸\n}\ndi `i\''), 'while `i\' < 3 {\n  local ++i\n}');
});

test('nested blocks: the outermost block is selected', () => {
    const src = ['foreach a in 1 2 {', '    forvalues b = 1/2 {', '        if `a\' == `b\' {', '            di "‸same"', '        }', '    }', '}', 'di "after"'].join('\n');
    const lines = src.replace('‸', '').split('\n');
    assert.equal(run(src), lines.slice(0, 7).join('\n'));
});

test('if/else chains are one statement', () => {
    const src = ['if `x\' > 1 {', '    di "big"', '}', 'else if `x\' < 0 {', '    di "neg"', '}', 'else {', '    di "‸small"', '}', 'di "after"'].join('\n');
    const chain = src.replace('‸', '').split('\n').slice(0, 9).join('\n');
    assert.equal(run(src), chain);
    assert.equal(run(src.replace('‸', '').replace('if `x\' > 1', 'i‸f `x\' > 1')), chain);
    // Same-line `} else {`.
    assert.equal(run('if 1 {\n  di 1\n} else {\n  di ‸2\n}\ndi 3'), 'if 1 {\n  di 1\n} else {\n  di 2\n}');
    // Single-line if/else.
    assert.equal(run('if `c\' di "‸a"\nelse di "b"\ndi "c"'), 'if `c\' di "a"\nelse di "b"');
    // Comment lines between `}` and `else` are skipped.
    assert.equal(run('if 1 {\n  di 1\n}\n// note\nelse {\n  di 2‸\n}'), 'if 1 {\n  di 1\n}\n// note\nelse {\n  di 2\n}');
    // An `else` after a non-`if` block is not chained.
    assert.deepEqual(all('foreach x in a {\n}\nelse {\n}'), ['foreach x in a {\n}', 'else {\n}']);
});

test('quietly/capture brace blocks', () => {
    assert.equal(run('quietly {\n  sum price‸\n  reg price mpg\n}\ndi 1'), 'quietly {\n  sum price\n  reg price mpg\n}');
    assert.equal(run('capture noisily {\n  reg‸ y x\n}'), 'capture noisily {\n  reg y x\n}');
});

test('braces inside strings, comments, and ${} globals do not count', () => {
    const src = 'foreach v in a b {\n    di "{‸ not a block"\n    di "}}}"\n    // {\n    /* } */\n    di "${path}/x"\n}\nsum';
    assert.equal(run(src), src.replace('‸', '').replace(/\nsum$/, ''));
    assert.deepEqual(all('di "{"\ndi `"}"\'\nsum'), ['di "{"', 'di `"}"\'', 'sum']);
});

test('unbalanced braces fall back to the current statement, no exception', () => {
    assert.equal(run('foreach v in a b {\n    di "`v‸\'"\nsum price'), 'di "`v\'"');
    assert.equal(run('forea‸ch v in a b {\n    di "`v\'"'), 'foreach v in a b {');
    // A stray `}` is its own statement.
    assert.equal(run('}\nsum‸ price'), 'sum price');
    // Complete inner blocks still group inside an incomplete outer one.
    assert.equal(run('if 1 {\n  foreach v in a {\n    di "‸x"\n  }\n'), '  foreach v in a {\n    di "x"\n  }'.trim());
});

// ---- program / mata / python / input ----------------------------------------------

test('program define ... end', () => {
    const src = ['capture program drop hello', 'program define hello, rclass', '    syntax [varlist]', '    di "hi‸"', 'end', 'hello'].join('\n');
    assert.equal(run(src), 'program define hello, rclass\n    syntax [varlist]\n    di "hi"\nend');
    assert.equal(run(src.replace('‸', '').replace('capture', 'cap‸ture')), 'capture program drop hello');
    assert.equal(run('pr myprog\n  foreach x in a {\n    di "end"\n  }\n  di 1‸\nend\nmyprog'), 'pr myprog\n  foreach x in a {\n    di "end"\n  }\n  di 1\nend');
    // No `end` yet: the current line only.
    assert.equal(run('program foo\n  di 1‸'), 'di 1');
});

test('mata / python / input blocks are opaque until `end`', () => {
    assert.equal(run('mata:\n  x = "}"  // {\n  y‸ = 1\nend\nsum'), 'mata:\n  x = "}"  // {\n  y = 1\nend');
    assert.equal(run('mata\n  for (i=1; i<=3; i++) {\n    i‸\n  }\nend'), 'mata\n  for (i=1; i<=3; i++) {\n    i\n  }\nend');
    // Single-line mata is a normal statement.
    assert.deepEqual(all('mata: x = 1\nsum'), ['mata: x = 1', 'sum']);
    const py = 'python:\nimport os\nx = "unterminated\nd = {"a": 1  # {\nprint(1 // 2)‸\nend\ndi 1';
    assert.equal(run(py), 'python:\nimport os\nx = "unterminated\nd = {"a": 1  # {\nprint(1 // 2)\nend');
    assert.equal(run('input x str5 name‸\n1 "a{"\n2 "end"\nend\nlist'), 'input x str5 name\n1 "a{"\n2 "end"\nend');
    assert.equal(run('input x\n1\n2‸\nend\nlist'), 'input x\n1\n2\nend');
    // `endpoint` is not `end`.
    assert.equal(run('python:\nendpoint = 1‸\nend'), 'python:\nendpoint = 1\nend');
});

// ---- #delimit ----------------------------------------------------------------------

test('#delimit ; regions: statements end at `;` and may span lines', () => {
    const src = ['sum price', '#delimit ;', 'regress price', '   mpg‸ weight', '   , robust;', 'sum mpg;', '#delimit cr', 'sum weight'].join('\n');
    assert.equal(run(src), 'regress price\n   mpg weight\n   , robust;');
    assert.deepEqual(all(src.replace('‸', '')), ['sum price', '#delimit ;', 'regress price\n   mpg weight\n   , robust;', 'sum mpg;', '#delimit cr', 'sum weight']);
    assert.equal(run(src.replace('‸', '').replace('#delimit ;', '#del‸imit ;')), '#delimit ;');
});

test('#delimit ;: several statements per line, the one at the cursor wins', () => {
    const src = '#delimit ;\nsum a; sum‸ b;  sum c;\n#delimit cr';
    assert.equal(run(src), 'sum b;');
    assert.equal(run('#delimit ;\n‸sum a; sum b;'), 'sum a;');
    assert.equal(run('#delimit ;\nsum a;‸ sum b;'), 'sum a;');
    assert.equal(run('#delimit ;\nsum a; ‸ sum b;'), 'sum b;');
    assert.equal(run('#delimit ;\nsum a;sum b;  ‸'), 'sum b;');
    assert.equal(run('#delimit ;\nsum a; sum b; // tail‸\nsum c;'), 'sum b;');
    assert.equal(run('#delimit ;\nsum a; /* x */ ‸ sum b;'), 'sum b;');
});

test('#delimit ;: newlines, // and /* */ comments, * comments, strings with ;', () => {
    const src = '#delimit ;\ndi "a;b" // not ; here\n  "c‸";\n* star comment ; sum x;\ndi `"q;"\';';
    assert.equal(run(src), 'di "a;b" // not ; here\n  "c";');
    assert.deepEqual(all(src.replace('‸', '')), ['#delimit ;', 'di "a;b" // not ; here\n  "c";', 'sum x;', 'di `"q;"\';']);
    // `///` is just a comment under `;`.
    assert.equal(run('#delimit ;\nreg y ///\n x‸;\n'), 'reg y ///\n x;');
});

test('#delimit ; blocks: braces and program ... end', () => {
    const src = '#delimit ;\nforeach v in a b {;\n  di "`v‸\'";\n};\nsum x;\n#delimit cr';
    assert.equal(run(src), 'foreach v in a b {;\n  di "`v\'";\n};');
    const prog = '#d ;\nprogram define foo;\n  di "hi";‸\nend;\nfoo;';
    assert.equal(run(prog), 'program define foo;\n  di "hi";\nend;');
});

test('#delimit state is tracked from the top; directive variants', () => {
    // Abbreviations, no space, trailing comment; anything but `cr` means `;` (as in the kernel).
    assert.deepEqual(all('#d;\nsum a\n;\n#delimit cr // back\nsum b'), ['#d;', 'sum a\n;', '#delimit cr // back', 'sum b']);
    assert.deepEqual(all('#delimit\nsum a;sum b;'), ['#delimit', 'sum a;', 'sum b;']);
    // `#define` is not a directive; `#delimit` inside a string/comment does not switch.
    assert.deepEqual(all('di "#delimit ;"\n/* #delimit ; */\nsum a\nsum b'), ['di "#delimit ;"', 'sum a', 'sum b']);
    // A directive after `;` on the same line.
    assert.deepEqual(all('#delimit ;\nsum a; #delimit cr\nsum b\nsum c'), ['#delimit ;', 'sum a;', '#delimit cr', 'sum b', 'sum c']);
    // Unterminated statement at end of document.
    assert.equal(run('#delimit ;\nsum a‸'), 'sum a');
});

test('statementCode wraps #delimit ; statements so they run in any console state', () => {
    const lines = '#delimit ;\nreg y\n x;\n#delimit cr\nsum'.split('\n');
    const stmts = parseStatements(lines);
    assert.equal(statementCode(lines, stmts[0]), undefined);
    assert.equal(statementCode(lines, stmts[1]), '#delimit ;\nreg y\n x;\n#delimit cr');
    assert.equal(statementCode(lines, stmts[2]), undefined);
    assert.equal(statementCode(lines, stmts[3]), undefined);
});

// ---- Strings --------------------------------------------------------------------------

test('strings with braces, //, ;, end and compound quotes do not confuse the parser', () => {
    const src = [
        'di "{ // ; end"',
        'di `"nested `"inner { "' + "'" + ' // still"' + "'",
        'local x = "http://a.b"',
        'program p',
        '  di "end"',
        '  di `"end"\'',
        'end',
    ].join('\n');
    assert.deepEqual(all(src), [
        'di "{ // ; end"',
        'di `"nested `"inner { "\' // still"\'',
        'local x = "http://a.b"',
        'program p\n  di "end"\n  di `"end"\'\nend',
    ]);
    // An unterminated string ends at the end of its line.
    assert.deepEqual(all('di "oops\nsum x'), ['di "oops', 'sum x']);
});

test('lexer exposes code without comments or string contents', () => {
    const raws = lexStatements(['foreach v in a b { // c', '  di "{x}" /* } */', '}']);
    assert.deepEqual(raws.map(r => [r.code, r.braceDelta]), [['foreach v in a b {', 1], ['di ""', 0], ['}', -1]]);
});

test('advancing: walking through a document visits each statement once', () => {
    const src = ['* header', 'sysuse auto', '', 'reg price ///', '  mpg', 'foreach v in a {', '  di 1', '}', '#delimit ;', 'sum a; sum b;', '#delimit cr', 'mata:', 'x=1', 'end', '// done'];
    const seen: string[] = [];
    let pos = { line: 0, character: 0 };
    for (;;) {
        const s = statementAt(src, pos);
        if (!s) {
            break;
        }
        seen.push(sliceText(src, s.start, s.end));
        pos = { line: s.end.line + 1, character: 0 };
        if (pos.line >= src.length) {
            break;
        }
    }
    // Positron advances to the next line, so the second `;` statement on a line is not revisited.
    assert.deepEqual(seen, ['sysuse auto', 'reg price ///\n  mpg', 'foreach v in a {\n  di 1\n}', '#delimit ;', 'sum a;', '#delimit cr', 'mata:\nx=1\nend']);
});

test('Windows line endings are tolerated by callers splitting on \\r?\\n', () => {
    const lines = 'reg y ///\r\n  x\r\nsum'.split(/\r?\n/);
    assert.deepEqual(parseStatements(lines).map(s => sliceText(lines, s.start, s.end)), ['reg y ///\n  x', 'sum']);
});

// ---- Help topics ----------------------------------------------------------------------

test('help: commands resolve abbreviations', () => {
    assert.equal(help('re‸g price mpg'), 'regress');
    assert.equal(help('su‸ price'), 'summarize');
    assert.equal(help('su‸'), 'summarize');
    assert.equal(help('g‸en x = 1'), 'generate');
    assert.equal(help('    ‸ tab foreign'), 'tabulate');
    assert.equal(help('esttab‸ using x'), 'esttab');
    assert.equal(help('mycustomcmd‸ a b'), 'mycustomcmd');
    assert.equal(help('estat‸ ic'), 'estat');
    assert.equal(help('estat i‸c'), 'estat');
});

test('help: prefixes', () => {
    assert.equal(help('bys‸ort foreign: sum price'), 'by');
    assert.equal(help('bysort fore‸ign (price): sum price'), 'by');
    assert.equal(help('bysort foreign: su‸m price'), 'summarize');
    assert.equal(help('by foreign: sum pri‸ce'), 'summarize');
    assert.equal(help('qui‸ reg y x'), 'quietly');
    assert.equal(help('quietly: re‸g y x'), 'regress');
    assert.equal(help('cap noi bys foreign: re‸g y x'), 'regress');
    assert.equal(help('frame f2: li‸st'), 'list');
    assert.equal(help('svy: me‸an x'), 'mean');
});

test('help: arguments, options, and variables fall back to the command', () => {
    assert.equal(help('regress price mp‸g, robust'), 'regress');
    assert.equal(help('regress price mpg, vc‸e(robust)'), 'regress');
    assert.equal(help('regress price mpg, rob‸ust'), 'regress');
    assert.equal(help('use "au‸to.dta", clear'), 'use');
    assert.equal(help('reg y ///\n  x‸1 x2'), 'regress');
    assert.equal(help('local n : word‸ count a b'), 'local');
});

test('help: functions map to f_ topics (Stata aliases cover variants)', () => {
    assert.equal(help('keep if inli‸st(rep78, 3, 4)'), 'f_inlist');
    assert.equal(help('gen y = substr‸(make, 1, 3)'), 'f_substr');
    assert.equal(help('gen y = ustrleft‸(make, 3)'), 'f_ustrleft');
    assert.equal(help('gen y = lo‸g(price)'), 'f_log');
    assert.equal(help('twoway scatter y x, title‸("a")'), 'twoway');
    assert.equal(help('egen m = mea‸n(price)'), 'egen');
    assert.equal(help('di r‸(N)'), 'return');
    assert.equal(help('di e‸(r2)'), 'ereturn');
    assert.equal(help('di c‸(current_date)'), 'creturn');
});

test('help: macros, factor variables, time-series operators, qualifiers, weights', () => {
    assert.equal(help('sum `va‸rs\''), 'macro');
    assert.equal(help('sum $co‸ntrols'), 'macro');
    assert.equal(help('sum ${con‸trols}'), 'macro');
    assert.equal(help('reg price i‸.foreign'), 'fvvarlist');
    assert.equal(help('reg price i.forei‸gn'), 'fvvarlist');
    assert.equal(help('reg price c.mpg##c.mp‸g'), 'fvvarlist');
    assert.equal(help('reg price ib3‸.rep78'), 'fvvarlist');
    assert.equal(help('reg gdp L2‸.gdp'), 'tsvarlist');
    assert.equal(help('reg gdp D.gd‸p'), 'tsvarlist');
    assert.equal(help('use d.dt‸a'), 'use');
    assert.equal(help('sum price i‸f foreign'), 'if');
    assert.equal(help('list i‸n 1/5'), 'in');
    assert.equal(help('foreach x i‸n a b {\n}'), 'foreach');
    assert.equal(help('sum price [a‸w=w]'), 'weight');
});

test('help: programming constructs and blocks', () => {
    assert.equal(help('i‸f `x\' {\n di 1\n}'), 'ifcmd');
    assert.equal(help('if 1 {\n}\nel‸se {\n}'), 'ifcmd');
    assert.equal(help('if 1 {\n}\nelse i‸f 2 {\n}'), 'ifcmd');
    assert.equal(help('forv‸ i = 1/3 {\n}'), 'forvalues');
    assert.equal(help('program foo\n  di 1\nen‸d'), 'program');
    assert.equal(help('#del‸imit ;'), 'delimit');
    assert.equal(help('mat‸a:\n x = 1\nend'), 'mata');
    assert.equal(help('mata:\n x = sqr‸t(2)\nend'), 'mf_sqrt');
    assert.equal(help('mata:\n x‸ = 1\nend'), 'mata');
    assert.equal(help('mata: x = sqr‸t(2)'), 'mf_sqrt');
    assert.equal(help('python:\nimport o‸s\nend'), 'python');
    assert.equal(help('input x\n1‸\nend'), 'input');
});

test('help: comments and blank lines give no topic', () => {
    assert.equal(help('* reg‸ress'), '');
    assert.equal(help('sum x // regr‸ess'), '');
    assert.equal(help('/* reg‸ress */'), '');
    assert.equal(help('sum x\n‸\nreg y x'), '');
    assert.equal(help('**# Sec‸tion'), '');
});
