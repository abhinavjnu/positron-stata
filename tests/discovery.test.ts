import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeInstallation, findStataInstallations, resolvePythonExecutable } from '../src/discovery.ts';

const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
const existsIn = (paths: string[]) => {
    const known = new Set(paths.map(norm));
    return (p: string) => known.has(norm(p));
};
const noDirs = () => [];

test('describes installations from paths', () => {
    const cases: [string, string, string, string, string][] = [
        ['/usr/local/stata19', '/usr/local/stata19/stata-mp', '19', 'mp', 'Stata 19 MP (Parallel Edition)'],
        ['/Applications/StataNow 19', '/Applications/StataNow 19/StataMP.app/Contents/MacOS/stata-mp', '19', 'mp', 'StataNow 19 MP (Parallel Edition)'],
        ['/Applications/Stata18', '/Applications/Stata18/StataSE.app/Contents/MacOS/stata-se', '18', 'se', 'Stata 18 SE'],
        ['C:\\Program Files\\Stata19', 'C:\\Program Files\\Stata19\\StataMP-64.exe', '19', 'mp', 'Stata 19 MP (Parallel Edition)'],
        ['C:\\Program Files\\Stata17', 'C:\\Program Files\\Stata17\\Stata-64.exe', '17', 'be', 'Stata 17 BE'],
        ['/usr/local/stata20', '/usr/local/stata20/stata-mp', '20', 'mp', 'Stata 20 MP (Parallel Edition)']
    ];
    for (const [home, exe, version, edition, display] of cases) {
        const inst = describeInstallation(home, exe);
        assert.equal(inst.version, version, exe);
        assert.equal(inst.edition, edition, exe);
        assert.equal(inst.displayName, display, exe);
    }
});

test('finds Stata/BE on Windows', () => {
    const found = findStataInstallations({
        env: { ProgramFiles: 'C:\\Program Files' },
        exists: existsIn(['C:\\Program Files\\Stata18', 'C:\\Program Files\\Stata18\\StataBE-64.exe'])
    });
    assert.equal(found.length, 1);
    assert.equal(found[0].edition, 'be');
    assert.equal(found[0].version, '18');
});

test('configured Stata home and edition take precedence', () => {
    const found = findStataInstallations({
        env: {},
        exists: existsIn(['/opt/custom/stata', '/opt/custom/stata/stata-se']),
        configHome: '/opt/custom/stata',
        configEdition: 'mp'
    });
    assert.equal(found[0].homeDir, '/opt/custom/stata');
    assert.equal(found[0].edition, 'mp');
});

test('Windows Python resolution skips Microsoft Store aliases', () => {
    const python = resolvePythonExecutable({
        platform: 'win32',
        env: { PATH: 'C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps;C:\\Python312' },
        exists: existsIn(['C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe', 'C:\\Python312\\python.exe']),
        listDir: noDirs
    });
    assert.equal(norm(python), norm('C:\\Python312\\python.exe'));
});

test('Windows Python resolution falls back to the newest per-user install', () => {
    const base = 'C:\\Users\\u\\AppData\\Local\\Programs\\Python';
    const python = resolvePythonExecutable({
        platform: 'win32',
        env: { PATH: '', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' },
        exists: existsIn([`${base}\\Python39\\python.exe`, `${base}\\Python314\\python.exe`, `${base}\\Python312\\python.exe`, `${base}\\Python310\\python.exe`]),
        listDir: dir => (norm(dir) === norm(base) ? ['Python39', 'Python314', 'Python312', 'Python310'] : [])
    });
    assert.equal(norm(python), norm(`${base}\\Python312\\python.exe`));
});

test('Windows Python resolution never returns the python3 alias', () => {
    const python = resolvePythonExecutable({ platform: 'win32', env: {}, exists: () => false, listDir: noDirs });
    assert.equal(python, 'python');
});

test('configured Python and active virtualenv are preferred', () => {
    assert.equal(
        resolvePythonExecutable({ platform: 'linux', env: {}, exists: () => true, listDir: noDirs, configured: '/custom/python' }),
        '/custom/python'
    );
    assert.equal(
        resolvePythonExecutable({
            platform: 'linux',
            env: { VIRTUAL_ENV: '/proj/.venv', PATH: '/usr/bin' },
            exists: existsIn(['/proj/.venv/bin/python3', '/usr/bin/python3']),
            listDir: noDirs
        }),
        '/proj/.venv/bin/python3'
    );
});

test('POSIX Python resolution searches PATH', () => {
    const python = resolvePythonExecutable({
        platform: 'linux',
        env: { PATH: '/opt/conda/bin:/usr/bin' },
        exists: existsIn(['/opt/conda/bin/python3', '/usr/bin/python3']),
        listDir: noDirs
    });
    assert.equal(python, '/opt/conda/bin/python3');
});

test('dedicated positron-stata venv is discovered', () => {
    const python = resolvePythonExecutable({
        platform: 'darwin',
        env: { HOME: '/Users/test', PATH: '/usr/local/bin:/usr/bin' },
        exists: existsIn([
            '/Users/test/.local/share/positron-stata/venv/bin/python',
            '/usr/local/bin/python3'
        ]),
        listDir: noDirs
    });
    assert.equal(python, '/Users/test/.local/share/positron-stata/venv/bin/python');
});

test('prefers version-specific python over generic python3 in PATH', () => {
    const python = resolvePythonExecutable({
        platform: 'darwin',
        env: { PATH: '/usr/local/bin' },
        exists: existsIn([
            '/usr/local/bin/python3.12',
            '/usr/local/bin/python3'
        ]),
        listDir: noDirs
    });
    assert.equal(python, '/usr/local/bin/python3.12');
});
