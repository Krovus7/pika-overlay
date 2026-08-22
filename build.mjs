import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('.', import.meta.url).pathname.replace(/\/$/, '').replace(/^\/([A-Za-z]:)/, '$1');

function run(cmd) {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function readVersion() {
    return JSON.parse(readFileSync(ROOT + '/package.json', 'utf8')).version;
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

const PACK_ID = 'pika-overlay';
const REPO_URL = 'https://github.com/Krovus7/pika-overlay';

/** Build + win-unpacked (electron-builder --dir) + vpk pack (Setup + Portable) */
async function packCmd() {
    await buildAll();
    console.log('[pack] electron-builder --dir…');
    run('npx electron-builder --dir');
    const version = readVersion();
    console.log(`[pack] vpk pack v${version}…`);
    run(`vpk pack -u ${PACK_ID} -v ${version} -p release/win-unpacked -o release -c win -e PikaOverlay.exe -i assets/icon.ico --packTitle "Pika Overlay" --packAuthors "AcquaPanna"`);
    console.log('[pack] Done. Artifacts in release/: Setup.exe + portable.zip');
}

/** pack + vpk upload github (feed for auto-update). Needs GITHUB_TOKEN env. */
async function releaseCmd() {
    await packCmd();
    const version = readVersion();
    console.log(`[release] vpk upload github v${version}…`);
    run(`vpk upload github -o release -c win --repoUrl ${REPO_URL} --publish --tag v${version}`);
    console.log('[release] Done.');
}

const cmd = process.argv[2] ?? 'build';
if (cmd === 'build') {
    await buildAll();
} else if (cmd === 'pack') {
    await packCmd();
} else if (cmd === 'release') {
    await releaseCmd();
} else {
    console.error(`[build] Unknown command: ${cmd}`);
    process.exit(1);
}
