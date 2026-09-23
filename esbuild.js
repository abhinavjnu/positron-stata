#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const baseDir = __dirname;
const entry = path.join(baseDir, 'src', 'extension.ts');
const outfile = path.join(baseDir, 'dist', 'extension.js');

const args = [
    entry,
    '--bundle',
    `--outfile=${outfile}`,
    '--external:vscode',
    '--external:positron',
    '--format=cjs',
    '--platform=node'
];

if (process.argv.includes('--watch')) {
    args.push('--watch');
}

function findEsbuild() {
    if (process.env.ESBUILD_BINARY && fs.existsSync(process.env.ESBUILD_BINARY)) {
        return process.env.ESBUILD_BINARY;
    }

    const candidates = [
        path.join(baseDir, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild'),
        '/usr/share/positron/resources/app/quarto/bin/tools/x86_64/esbuild',
        '/usr/share/positron/resources/app/quarto/bin/tools/aarch64/esbuild',
        '/Applications/Positron.app/Contents/Resources/app/quarto/bin/tools/aarch64/esbuild',
        '/Applications/Positron.app/Contents/Resources/app/quarto/bin/tools/x86_64/esbuild',
    ];

    for (const c of candidates) {
        if (c && fs.existsSync(c)) {
            return c;
        }
    }

    try {
        const which = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['esbuild'], { encoding: 'utf-8' }).trim();
        if (which && fs.existsSync(which.split('\n')[0])) {
            return which.split('\n')[0];
        }
    } catch (e) {}

    return null;
}

try {
    const esbuild = require('esbuild');
    console.log('Building positron-stata with esbuild node module...');
    esbuild.buildSync({
        entryPoints: [entry],
        bundle: true,
        outfile: outfile,
        external: ['vscode', 'positron'],
        format: 'cjs',
        platform: 'node',
    });
    console.log(`Build successful: ${outfile}`);
} catch (e) {
    const bin = findEsbuild();
    if (!bin) {
        console.error('Error: esbuild not found. Please install esbuild (npm install -D esbuild) or set ESBUILD_BINARY.');
        process.exit(1);
    }
    console.log(`Building positron-stata with ${bin}...`);
    execFileSync(bin, args, { stdio: 'inherit' });
    console.log(`Build successful: ${outfile}`);
}
