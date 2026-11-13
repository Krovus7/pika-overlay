/**
 * Full update cycle test against the live feed — installed app only.
 * Usage: node scripts/update-cycle.mjs <exePath> <cwd>
 * Steps: open Updates tab → wait for "Update available" → click apply →
 *        process exits → disk sq.version becomes the new version.
 * Exit 0 = cycle verified through the install step.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const PORT = 9238;
const exe = process.argv[2];
const cwd = process.argv[3];
const installDir = process.argv[4];
const expectedVersion = process.argv[5] ?? '4.1.0';

// The Updates tab of v4 has element ids; the v5 one is built in code, so its
// controls are found by their text inside #tab-updates.
const UPDATES_UI = `(() => {
    const scope = document.getElementById('tab-updates') ?? document;
    const byText = re => [...scope.querySelectorAll('button')].find(b => re.test(b.textContent));
    return {
        check: document.getElementById('btnUpdateCheck') ?? byText(/Check for updates/),
        apply: document.getElementById('btnUpdateApply') ?? byText(/Update (and|&) restart/),
        status: (document.getElementById('updateStatus') ?? scope.querySelector('.s-status'))?.textContent ?? '',
    };
})()`;

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

async function waitFor(cond, timeoutMs = 30000, label = 'condition') {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const v = await evaluate(cond);
        if (v) return v;
        await sleep(300);
    }
    throw new Error(`timeout waiting for ${label}`);
}

function currentSqVersion() {
    try {
        const xml = readFileSync(path.join(installDir, 'current', 'sq.version'), 'utf8');
        return /<version>([^<]+)</.exec(xml)?.[1] ?? '?';
    } catch {
        return '?';
    }
}

async function main() {
    console.log(`[update-cycle] installed: ${currentSqVersion()} — target: ${expectedVersion}`);

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
        console.log('[update-cycle] window target not found');
        process.exit(1);
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

    // The click handler is attached a moment after the page loads: click until the panel opens
    await waitFor(`(() => {
        const panel = document.getElementById('settings-panel');
        if (!panel.classList.contains('visible')) document.getElementById('btn-settings').click();
        return panel.classList.contains('visible');
    })()`, 15000, 'settings visible');
    await evaluate(`document.querySelector('.settings-tab-btn[data-tab="updates"]').click(); true`);
    await evaluate(`${UPDATES_UI}.check.click(); true`);

    const available = await waitFor(
        `/Update available|is available/.test(${UPDATES_UI}.status)`,
        60000, 'update available',
    );
    const status = await evaluate(`${UPDATES_UI}.status`);
    console.log(`[update-cycle] status: ${status}`);
    if (!available) process.exit(1);

    // Fire the apply without awaiting (the page context dies with the app)
    ws.send(JSON.stringify({
        id: ++msgId,
        method: 'Runtime.evaluate',
        params: { expression: `${UPDATES_UI}.apply.click(); true` },
    }));

    console.log('[update-cycle] apply clicked — waiting for app exit + install…');
    for (let i = 0; i < 120; i++) {
        await sleep(1000);
        if (child.exitCode !== null || child.signalCode) break;
    }
    console.log(`[update-cycle] app exited (code=${child.exitCode})`);

    let newVersion = '';
    for (let i = 0; i < 120; i++) {
        await sleep(1000);
        newVersion = currentSqVersion();
        if (newVersion === expectedVersion) break;
    }
    console.log(`[update-cycle] installed version now: ${newVersion}`);
    console.log(newVersion === expectedVersion
        ? '[update-cycle] UPDATE CYCLE PASSED (download delta → apply → installed)'
        : '[update-cycle] UPDATE CYCLE FAILED');
    process.exit(newVersion === expectedVersion ? 0 : 1);
}

main().catch(err => {
    console.error('[update-cycle] fatal:', err.message);
    process.exit(1);
});
