import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runSetup } from '../src/envSetup.ts';

// Real end-to-end setup (network + ~100 MB). Opt in with
//   POSITRON_STATA_SETUP_E2E=uv|download-uv npm test
// `download-uv` hides any installed uv so the download path is exercised.
const mode = process.env.POSITRON_STATA_SETUP_E2E;

test('runSetup creates a working environment', { skip: !mode && 'set POSITRON_STATA_SETUP_E2E', timeout: 15 * 60 * 1000 }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'positron-stata-setup-'));
    const result = await runSetup({
        platform: process.platform,
        arch: process.arch,
        env: mode === 'download-uv' ? { ...process.env, PATH: '/usr/bin:/bin', HOME: root } : process.env,
        dataDir: path.join(root, 'data'),
        uvStorageDir: path.join(root, 'uv'),
        log: l => console.log(l),
        confirmDownload: async () => true
    });
    assert.ok(result.python.startsWith(root), result.python);
    assert.match(result.probe.version!, /^3\.12\./);
    assert.ok(result.probe.pandas && result.probe.numpy);
    console.log(JSON.stringify({ root, python: result.python, strategy: result.strategy, probe: result.probe, warnings: result.warnings }));
});
