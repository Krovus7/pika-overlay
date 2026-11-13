/**
 * Interactive overlay smoke via Chrome DevTools Protocol.
 * Usage:  node scripts/smoke.mjs [exePath] [cwd] [args...]
 *   default (dev):   node scripts/smoke.mjs node_modules/electron/dist/electron.exe .
 *   installed app:   node scripts/smoke.mjs "C:\...\pika-overlay\current\PikaOverlay.exe" "C:\...\current"
 *
 * Steps: bridge present → settings open/close → API key saved through the
 * Settings UI (only when PIKA_API_KEY is set) → period dropdown open/close →
 * real lookups (live API): a known player and a made-up name → period switch →
 * clear → compact toggle. Screenshots land in artifacts/screens/v5-live-*.png.
 *
 * Env: PIKA_API_KEY   key to enter in Settings → API (it is saved in the app's
 *                     own config, exactly as a user would; never printed)
 *      SMOKE_PLAYER   a real Pika player name (default: Dream)
 * Exit code 0 = all steps passed.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const PORT = 9234;
const API_KEY = process.env.PIKA_API_KEY ?? '';
const KNOWN_PLAYER = process.env.SMOKE_PLAYER ?? 'Dream';
const UNKNOWN_NAME = 'zqNoSuchName9182'; // valid shape (3-16 chars), never registered
const SHOTS_DIR = path.join(process.cwd(), 'artifacts', 'screens');
const exe = process.argv[2] ?? 'node_modules/electron/dist/electron.exe';
const cwd = process.argv[3] ?? process.cwd();
const appArgs = process.argv.slice(4);
const args = [...appArgs];
if (process.argv[2] === undefined) args.unshift('.');
args.unshift(`--remote-debugging-port=${PORT}`);

if (!existsSync(exe)) {
    console.error(`[smoke] exe not found: ${exe}`);
    process.exit(2);
}

const child = spawn(exe, args, { cwd, stdio: 'ignore' });

let ws = null;
const pending = new Map();
let msgId = 0;

function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = ++msgId;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`CDP timeout: ${method}`));
        }, 30000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });
    if (res.result?.exceptionDetails) {
        throw new Error(`eval exception: ${JSON.stringify(res.result.exceptionDetails).slice(0, 300)}`);
    }
    return res.result?.result?.value;
}

async function screenshot(name) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(SHOTS_DIR, { recursive: true });
    writeFileSync(path.join(SHOTS_DIR, name), Buffer.from(res.result.data, 'base64'));
}

const rowClass = name => `[...document.querySelectorAll('#stats-body tr')].find(r => r.textContent.toLowerCase().includes('${name.toLowerCase()}'))?.className ?? ''`;
const NO_ROW_LOADING = `document.querySelectorAll('#stats-body tr').length > 0 && !document.querySelector('#stats-body tr.row-loading')`;

async function waitFor(cond, timeoutMs = 15000, label = 'condition') {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const v = await evaluate(cond);
        if (v) return v;
        await sleep(250);
    }
    throw new Error(`timeout waiting for ${label}`);
}

const results = [];
function step(desc, ok, extra = '') {
    results.push({ desc, ok });
    console.log(`${ok ? '  ✔' : '  ✖'} ${desc}${extra ? ' — ' + extra : ''}`);
}

async function main() {
    // 1. wait for the CDP endpoint
    let targets = null;
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
            targets = await res.json();
            if (targets.some(t => t.url.includes('overlay.html') || t.url.includes('index.html'))) break;
        } catch { /* retry */ }
        await sleep(500);
    }
    const page = targets?.find(t => t.url.includes('overlay.html'));
    if (!page) {
        step('app window target found', false, 'overlay.html not found in CDP targets');
        return finish();
    }
    step('app window target found', true);

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = ev => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
            const entry = pending.get(msg.id);
            clearTimeout(entry.timer);
            entry.resolve(msg);
            pending.delete(msg.id);
        }
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await sleep(3000); // let the preload/late page settles fully

    // 2. bridge present
    const bridge = await evaluate('typeof window.pikaOverlay');
    step('window.pikaOverlay bridge present', bridge === 'object', `typeof=${bridge}`);
    if (bridge !== 'object') return finish();

    // 3. settings open/close
    await evaluate(`document.getElementById('btn-settings').click()`);
    const panelOpen = await waitFor(`document.getElementById('settings-panel').classList.contains('visible')`, 5000, 'settings panel visible');
    step('settings panel opens (⚙)', !!panelOpen);
    await waitFor(`document.getElementById('settings-panel').classList.contains('visible')`);
    await evaluate(`document.getElementById('btn-settings-close-x').click()`);
    const panelClosed = await waitFor(`!document.getElementById('settings-panel').classList.contains('visible')`, 5000, 'settings panel closed');
    step('settings panel closes', !!panelClosed);

    // 3b. API key entered and saved through Settings → API
    const healthBefore = (await evaluate('window.pikaOverlay.getApiHealth()'))?.kind;
    console.log(`    health at start: ${healthBefore}`);
    if (API_KEY) {
        await evaluate(`document.getElementById('btn-settings').click(); document.getElementById('tabbtn-api').click()`);
        await waitFor(`!!document.querySelector('.s-key-input')`, 5000, 'key field');
        await evaluate(`(() => { const i = document.querySelector('.s-key-input'); i.value = ${JSON.stringify(API_KEY)}; i.dispatchEvent(new Event('input', { bubbles: true })); const b = [...document.querySelectorAll('#tab-api button')].find(x => x.textContent.trim() === 'Save key'); if (!b.disabled) b.click(); })()`);
        const healthy = await waitFor(`window.pikaOverlay.getApiHealth().then(h => h.kind === 'ok')`, 15000, 'health ok after saving the key').catch(() => false);
        step('API key saved in Settings → health ok', !!healthy);
        await sleep(600);
        await screenshot('v5-live-settings-api.png');
        await evaluate(`document.getElementById('btn-settings-close-x').click()`);
    } else {
        step('API key configured', healthBefore === 'ok', `health=${healthBefore} (set PIKA_API_KEY to enter one)`);
    }
    const bannerHidden = await evaluate(`document.getElementById('api-banner').hidden`);
    step('no health banner with a working key', !!bannerHidden);

    // 4. dropdown open/close (period)
    await evaluate(`document.getElementById('btn-period').click()`);
    const dropOpen = await waitFor(`document.getElementById('period-dropdown').classList.contains('open')`, 5000, 'period dropdown open');
    step('period dropdown opens', !!dropOpen);
    await evaluate(`document.body.click()`);
    const dropClosed = await waitFor(`!document.getElementById('period-dropdown').classList.contains('open')`, 5000, 'period dropdown closed');
    step('period dropdown closes on outside click', !!dropClosed);

    // 5. real lookups (live API): a known player and a name that cannot exist
    await evaluate(`const i=document.getElementById('search-input'); i.value='${KNOWN_PLAYER}, ${UNKNOWN_NAME}'; document.getElementById('btn-lookup').click(); true`);
    const loading = await waitFor(`document.querySelectorAll('#stats-body tr').length >= 2`, 15000, 'rows appear');
    step('search adds one row per name', !!loading);
    const settled = await waitFor(NO_ROW_LOADING, 30000, 'rows resolved').catch(() => false);
    const knownClass = await evaluate(rowClass(KNOWN_PLAYER));
    const unknownClass = await evaluate(rowClass(UNKNOWN_NAME));
    const rowText = await evaluate(`document.querySelector('#stats-body tr')?.textContent?.replace(/\s+/g, ' ').slice(0, 140) || ''`);
    step('known player resolves with stats', !!settled && !knownClass.includes('row-status'), `class="${knownClass}" ${rowText.trim()}`);
    step('typed unknown name is NOT FOUND, not NICKED', unknownClass.includes('row-not-found') && !unknownClass.includes('row-nicked'), `class="${unknownClass}"`);
    await screenshot('v5-live-lookup.png');

    // 5b. period switch re-fetches rows and keeps the classification sane
    await evaluate(`document.getElementById('btn-period').click()`);
    await evaluate(`[...document.querySelectorAll('#period-dropdown [data-value], #period-dropdown button, #period-dropdown li')].find(o => /week/i.test(o.textContent))?.click()`);
    await sleep(500);
    const weekly = await waitFor(NO_ROW_LOADING, 30000, 'weekly rows resolved').catch(() => false);
    const weeklyKnown = await evaluate(rowClass(KNOWN_PLAYER));
    const weeklyUnknown = await evaluate(rowClass(UNKNOWN_NAME));
    step('weekly: known player is stats or NO DATA, never API OFF/NICKED',
        !!weekly && !/row-api-off|row-nicked|row-error|row-auth/.test(weeklyKnown), `class="${weeklyKnown}"`);
    step('weekly: unknown name still NOT FOUND', weeklyUnknown.includes('row-not-found'), `class="${weeklyUnknown}"`);
    await screenshot('v5-live-weekly.png');
    await evaluate(`document.getElementById('btn-period').click()`);
    await evaluate(`[...document.querySelectorAll('#period-dropdown [data-value], #period-dropdown button, #period-dropdown li')].find(o => /life|total|all time/i.test(o.textContent))?.click()`);
    await sleep(500);
    await waitFor(NO_ROW_LOADING, 30000, 'lifetime rows resolved').catch(() => false);

    // 6. clear
    await evaluate(`document.getElementById('btn-clear').click()`);
    const cleared = await waitFor(`document.querySelectorAll('#stats-body tr').length === 0`, 10000, 'table cleared');
    step('clear empties the table', !!cleared);

    // 7. compact toggle
    await evaluate(`document.getElementById('btn-toggle-view').click()`);
    const compact = await waitFor(`document.body.classList.contains('layout-compact')`, 5000, 'compact layout');
    step('compact layout toggles', !!compact);
    await evaluate(`document.getElementById('btn-toggle-view').click()`);
    await waitFor(`!document.body.classList.contains('layout-compact')`, 5000, 'detailed restored');
    step('detailed layout restores', true);

    await finish();
}

async function finish() {
    let pass = results.filter(r => r.ok).length;
    let fail = results.length - pass;
    if (results.length === 0) fail = 1; // no steps executed = failure, never a silent pass
    console.log(`\n[smoke] ${pass} passed, ${fail} failed`);
    try { ws?.close(); } catch { /* ignore */ }
    child.kill('SIGKILL');
    process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
    step('run completed without a fatal error', false, err.message);
    finish();
});
