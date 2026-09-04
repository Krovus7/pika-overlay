/**
 * Verifies the installed app's Updates tab against the live GitHub feed.
 * Usage: node scripts/update-check.mjs <exePath> <cwd>
 * Expects: after "Check for updates" the status shows either up-to-date or
 * a version. Exit 0 = feed loop works end-to-end.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 9237;
const exe = process.argv[2];
const cwd = process.argv[3];

const child = spawn(exe, [`--remote-debugging-port=${PORT}`], { cwd, stdio: 'ignore' });

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
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return res.result?.result?.value;
}

async function waitFor(cond, timeoutMs = 20000, label = 'condition') {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const v = await evaluate(cond);
        if (v) return v;
        await sleep(300);
    }
    throw new Error(`timeout waiting for ${label}`);
}

async function main() {
    let targets = null;
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
            targets = await res.json();
            if (targets.some(t => t.url.includes('overlay.html'))) break;
        } catch { /* retry */ }
        await sleep(500);
    }
    const page = targets?.find(t => t.url.includes('overlay.html'));
    if (!page) {
        console.log('[update-check] window target not found');
        return finish(1);
    }

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
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

    // Open the Updates tab in the settings panel
    await evaluate(`document.getElementById('btn-settings').click()`);
    await waitFor(`document.getElementById('settings-panel').classList.contains('visible')`, 8000, 'settings visible');
    await evaluate(`document.querySelector('.settings-tab-btn[data-tab="updates"]').click()`);

    // Trigger a manual check and wait for a terminal state
    await evaluate(`document.getElementById('btnUpdateCheck').click()`);
    const status = await waitFor(
        `(document.getElementById('updateStatus')?.textContent || '').includes('up to date')
         || (document.getElementById('updateStatus')?.textContent || '').includes('Update available')
         || (document.getElementById('updateStatus')?.textContent || '').includes('error')`,
        60000, 'update status terminal state',
    );
    const text = await evaluate(`document.getElementById('updateStatus').textContent`);
    console.log(`[update-check] status: ${text}`);

    const ok = text.toLowerCase().includes('up to date') || text.toLowerCase().includes('update available');
    await finish(ok ? 0 : 1);
}

async function finish(code) {
    try { ws?.close(); } catch { /* ignore */ }
    child.kill('SIGKILL');
    setTimeout(() => process.exit(code), 300);
}

main().catch(err => {
    console.error('[update-check] fatal:', err.message);
    finish(1);
});
