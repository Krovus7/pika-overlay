import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const ROOT = new URL('.', import.meta.url).pathname.replace(/\/$/, '').replace(/^\/([A-Za-z]:)/, '$1');

function run(cmd) {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

async function bundleRenderer() {
    const entry = ROOT + '/renderer/ts/overlay.ts';
    if (!existsSync(entry)) {
        console.log('[build] renderer/ts/overlay.ts missing — skipping renderer bundle');
        return;
    }
    console.log('[build] Bundling renderer (esbuild)...');
    await build({
        entryPoints: [entry],
        bundle: true,
        format: 'iife',
        outfile: ROOT + '/renderer/bundle/overlay.js',
        target: ['chrome120'],
        logLevel: 'info',
    });
}

function compileMain() {
    console.log('[build] Compiling main process + tests (tsc)...');
    run('npx tsc -p tsconfig.json');
}

async function buildAll() {
    await bundleRenderer();
    compileMain();
    console.log('[build] Done.');
}

const cmd = process.argv[2] ?? 'build';
if (cmd === 'build') {
    await buildAll();
} else {
    console.error(`[build] Unknown command: ${cmd}`);
    process.exit(1);
}
