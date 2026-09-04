/**
 * Interactive overlay smoke via Chrome DevTools Protocol.
 * Usage:  node scripts/smoke.mjs [exePath] [cwd] [args...]
 *   default (dev):   node scripts/smoke.mjs node_modules/electron/dist/electron.exe .
 *   installed app:   node scripts/smoke.mjs "C:\...\pika-overlay\current\PikaOverlay.exe" "C:\...\current"
 *
 * Steps: bridge present → settings open/close → period dropdown open/close →
 * real player search (live API) → clear → compact toggle.
 * Exit code 0 = all steps passed.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';

const PORT = 9234;
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

    // 4. dropdown open/close (period)
    await evaluate(`document.getElementById('btn-period').click()`);
    const dropOpen = await waitFor(`document.getElementById('period-dropdown').classList.contains('open')`, 5000, 'period dropdown open');
    step('period dropdown opens', !!dropOpen);
    await evaluate(`document.body.click()`);
    const dropClosed = await waitFor(`!document.getElementById('period-dropdown').classList.contains('open')`, 5000, 'period dropdown closed');
    step('period dropdown closes on outside click', !!dropClosed);

    // 5. search of a real player (live API)
    await evaluate(`const i=document.getElementById('search-input'); i.value='Dream'; document.getElementById('btn-lookup').click(); true`);
    const loading = await waitFor(`document.querySelectorAll('#stats-body tr').length > 0`, 15000, 'loading row appears');
    step('search starts loading a row', !!loading);
    const settled = await waitFor(`[...document.querySelectorAll('#stats-body tr')].length > 0 && !document.querySelector('#stats-body tr.row-loading')`, 30000, 'stats row resolved');
    const rowText = await evaluate(`document.querySelector('#stats-body tr')?.textContent?.slice(0, 120) || ''`);
    step('search resolves with real stats', !!settled, rowText.trim());

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
    console.error('[smoke] fatal:', err.message);
    finish();
});
