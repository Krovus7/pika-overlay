/**
 * Minimal Chrome DevTools Protocol client for driving the overlay window of a
 * running app (dev Electron or installed build). Used by smoke.mjs and
 * replay-live.mjs.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Starts `exe` with remote debugging and attaches to the overlay page.
 * `env` entries set to undefined are removed from the child's environment.
 */
export async function launchAndAttach({ exe, args = [], cwd = process.cwd(), port = 9234, env = {} }) {
    const childEnv = { ...process.env, ...env };
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete childEnv[key];
    const child = spawn(exe, [`--remote-debugging-port=${port}`, ...args], { cwd, stdio: 'ignore', env: childEnv });

    let page = null;
    for (let i = 0; i < 60 && !page; i++) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            page = targets.find(t => t.url.includes('overlay.html')) ?? null;
        } catch { /* endpoint not up yet */ }
        if (!page) await sleep(500);
    }
    if (!page) {
        child.kill('SIGKILL');
        throw new Error('overlay.html not found among the CDP targets');
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

    const pending = new Map();
    const pageErrors = [];
    let msgId = 0;
    ws.onmessage = ev => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
            const entry = pending.get(msg.id);
            clearTimeout(entry.timer);
            pending.delete(msg.id);
            entry.resolve(msg);
        } else if (msg.method === 'Runtime.exceptionThrown') {
            pageErrors.push(`exception: ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`);
        } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            pageErrors.push(`console.error: ${msg.params.args.map(a => a.value ?? a.description ?? '').join(' ')}`);
        }
    };

    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++msgId;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`CDP timeout: ${method}`));
        }, 30_000);
        pending.set(id, { resolve, timer });
        ws.send(JSON.stringify({ id, method, params }));
    });

    async function evaluate(expression) {
        const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (res.result?.exceptionDetails) {
            throw new Error(`eval exception: ${JSON.stringify(res.result.exceptionDetails).slice(0, 300)}`);
        }
        return res.result?.result?.value;
    }

    async function waitFor(condition, timeoutMs = 15_000, label = 'condition') {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const value = await evaluate(condition);
            if (value) return value;
            await sleep(250);
        }
        throw new Error(`timeout waiting for ${label}`);
    }

    async function screenshot(dir, name) {
        const res = await send('Page.captureScreenshot', { format: 'png' });
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, name), Buffer.from(res.result.data, 'base64'));
    }

    function close() {
        try { ws.close(); } catch { /* already closed */ }
        child.kill('SIGKILL');
    }

    await send('Runtime.enable');
    await send('Page.enable');
    return { evaluate, waitFor, screenshot, close, pageErrors };
}
