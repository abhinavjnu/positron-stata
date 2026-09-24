import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describeInstallation } from '../src/discovery.ts';
import { buildKernelEnv, buildKernelSpec, jupyterDataDir, kernelDisplayName, kernelspecOwnership, provisionKernelspec } from '../src/kernelspec.ts';

const inst = describeInstallation('/usr/local/stata19', '/usr/local/stata19/stata-mp', undefined, ['isstata.195']);

test('kernel env: Positron session vs standalone Jupyter file', () => {
    const base = { PATH: '/usr/bin', PYTHONPATH: '/x', LD_LIBRARY_PATH: '/lib' };
    const session = buildKernelEnv({ inst, kernelDir: '/ext/kernel', platform: 'linux', baseEnv: base, valueLabels: true, positronPythonFiles: '/pf/posit' });
    assert.equal(session.PATH, '/usr/local/stata19:/usr/bin');
    assert.equal(session.PYTHONPATH, '/ext/kernel:/x');
    assert.equal(session.LD_LIBRARY_PATH, '/usr/local/stata19:/lib');
    assert.equal(session.POSITRON_STATA_VALUE_LABELS, '1');
    assert.equal(session.POSITRON_PYTHON_FILES, '/pf/posit');
    const standalone = buildKernelEnv({ inst, kernelDir: '/ext/kernel', platform: 'linux', baseEnv: base, valueLabels: false, standalone: true });
    assert.equal(standalone.PATH, undefined);
    assert.equal(standalone.PYTHONPATH, '/ext/kernel');
    assert.equal(standalone.POSITRON_STATA_VALUE_LABELS, '0');
    const win = buildKernelEnv({ inst, kernelDir: 'C:\\k', platform: 'win32', baseEnv: {}, valueLabels: true });
    assert.equal(win.LD_LIBRARY_PATH, undefined);
});

test('kernelspec uses message interrupts and a short display name', () => {
    const spec = buildKernelSpec('/py', '/ext/kernel/launcher.py', kernelDisplayName(inst), {});
    assert.equal(spec.interrupt_mode, 'message');
    assert.deepEqual(spec.argv, ['/py', '/ext/kernel/launcher.py', '-f', '{connection_file}']);
    assert.equal(spec.display_name, 'StataNow 19 MP');
});

test('jupyter data dir per platform', () => {
    assert.equal(jupyterDataDir('linux', { HOME: '/h' }), '/h/.local/share/jupyter');
    assert.equal(jupyterDataDir('darwin', { HOME: '/h' }), '/h/Library/Jupyter');
    assert.equal(jupyterDataDir('win32', { APPDATA: 'C:\\A' }), 'C:\\A\\jupyter');
});

test('provisioning writes, skips unchanged, replaces legacy, never touches foreign specs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-'));
    const spec = buildKernelSpec('/py', '/ext/kernel/launcher.py', 'Stata 19 MP', { A: '1' });
    assert.equal(provisionKernelspec(dir, spec).status, 'written');
    assert.equal(provisionKernelspec(dir, spec).status, 'unchanged');
    const file = path.join(dir, 'kernel.json');
    assert.equal(kernelspecOwnership(fs.readFileSync(file, 'utf8')), 'managed');
    assert.equal(provisionKernelspec(dir, { ...spec, argv: ['/py2', ...spec.argv.slice(1)] }).status, 'written');

    fs.writeFileSync(file, JSON.stringify({ argv: ['/usr/bin/python3.12', '/home/a/.positron/extensions/abhinavjnu.positron-stata-0.1.6/kernel/launcher.py', '-f', '{connection_file}'] }));
    const legacy = provisionKernelspec(dir, spec);
    assert.equal(legacy.status, 'written');
    assert.match(legacy.reason!, /stale/);

    const foreign = JSON.stringify({ argv: ['python', '-m', 'stata_kernel'] });
    fs.writeFileSync(file, foreign);
    assert.equal(provisionKernelspec(dir, spec).status, 'skipped');
    assert.equal(fs.readFileSync(file, 'utf8'), foreign);
    fs.rmSync(dir, { recursive: true });
});
