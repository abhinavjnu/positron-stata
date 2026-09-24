import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    dataDirectory, enumeratePythonCandidates, evaluateProbe, parseProbeOutput, probePython, uvAsset, venvPython
} from '../src/pythonEnv.ts';

const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
const existsIn = (paths: string[]) => {
    const known = new Set(paths.map(norm));
    return (p: string) => known.has(norm(p));
};

test('evaluateProbe accepts 3.9–3.13 64-bit with numpy+pandas only', () => {
    const good = { version: '3.12.3', bits: 64, numpy: '2.0', pandas: '2.2', pyarrow: true };
    assert.equal(evaluateProbe(good).ok, true);
    const v314 = evaluateProbe({ ...good, version: '3.14.0' });
    assert.equal(v314.ok, false);
    assert.equal(v314.baseOk, false);
    assert.match(v314.problems[0], /not supported by PyStata/);
    const noPandas = evaluateProbe({ ...good, pandas: false });
    assert.equal(noPandas.ok, false);
    assert.equal(noPandas.baseOk, true);
    assert.deepEqual(noPandas.problems, ['pandas is not installed']);
    assert.equal(evaluateProbe({ ...good, bits: 32 }).ok, false);
    assert.equal(evaluateProbe({ ...good, pyarrow: false }).warnings.length, 1);
    assert.equal(evaluateProbe({ error: 'could not run' }).ok, false);
});

test('parseProbeOutput takes the last JSON line', () => {
    assert.equal(parseProbeOutput('warning\n{"version":"3.11.2","bits":64}\n').version, '3.11.2');
    assert.ok(parseProbeOutput('Python was not found').error);
});

test('candidate order: setting, helper venv, VIRTUAL_ENV, Positron, versioned, generic', () => {
    const c = enumeratePythonCandidates({
        platform: 'linux',
        env: { HOME: '/h', PATH: '/usr/local/bin:/usr/bin', VIRTUAL_ENV: '/proj/.venv' },
        exists: existsIn(['/cfg/python', '/h/.local/share/positron-stata/venv/bin/python', '/proj/.venv/bin/python3',
            '/pos/python', '/usr/local/bin/python3', '/usr/bin/python3.11', '/usr/local/bin/python3.14']),
        listDir: () => [],
        configured: '/cfg/python',
        registered: [{ path: '/pos/python', source: 'Positron' }]
    }).map(x => x.path);
    assert.deepEqual(c, ['/cfg/python', '/h/.local/share/positron-stata/venv/bin/python', '/proj/.venv/bin/python3',
        '/pos/python', '/usr/bin/python3.11', '/usr/local/bin/python3']);
});

test('Windows: new LOCALAPPDATA helper venv, legacy venv, py launcher', () => {
    const env = { USERPROFILE: 'C:\\Users\\u', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', SystemRoot: 'C:\\Windows', PATH: '' };
    assert.equal(dataDirectory('win32', env), 'C:\\Users\\u\\AppData\\Local\\positron-stata');
    const c = enumeratePythonCandidates({
        platform: 'win32', env, listDir: () => [],
        exists: existsIn(['C:\\Users\\u\\AppData\\Local\\positron-stata\\venv\\Scripts\\python.exe',
            'C:\\Users\\u\\.local\\share\\positron-stata\\venv\\Scripts\\python.exe', 'C:\\Windows\\py.exe'])
    });
    assert.equal(norm(c[0].path), norm('C:\\Users\\u\\AppData\\Local\\positron-stata\\venv\\Scripts\\python.exe'));
    assert.equal(norm(c[1].path), norm('C:\\Users\\u\\.local\\share\\positron-stata\\venv\\Scripts\\python.exe'));
    assert.deepEqual(c[2].args, ['-3.13']);
    assert.deepEqual(c.at(-1)!.args, ['-3.9']);
    assert.equal(dataDirectory('linux', { HOME: '/h', POSITRON_STATA_DATA_DIR: '/tmp/x' }), '/tmp/x');
    assert.equal(venvPython('/d/venv', 'linux'), '/d/venv/bin/python');
});

test('uv release asset per platform', () => {
    assert.equal(uvAsset('linux', 'x64')!.url, 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-unknown-linux-gnu.tar.gz');
    assert.equal(uvAsset('linux', 'arm64', true)!.target, 'aarch64-unknown-linux-musl');
    assert.equal(uvAsset('darwin', 'arm64')!.target, 'aarch64-apple-darwin');
    assert.equal(uvAsset('win32', 'x64')!.url.endsWith('uv-x86_64-pc-windows-msvc.zip'), true);
    assert.equal(uvAsset('linux', 'ia32'), undefined);
});

test('probePython reports interpreters that cannot run', async () => {
    const r = await probePython({ path: '/nonexistent/python', source: 't' });
    assert.ok(r.error);
});

test('probePython runs a real interpreter', { skip: !process.env.PROBE_PYTHON && 'set PROBE_PYTHON=/path/to/python' }, async () => {
    const r = await probePython({ path: process.env.PROBE_PYTHON!, source: 't' });
    assert.ok(r.version, JSON.stringify(r));
    assert.equal(r.bits, 64);
});
