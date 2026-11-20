/**
 * Minimal Chrome DevTools Protocol client for driving the overlay window of a
 * running app (dev Electron or installed build). Used by smoke.mjs and
 * replay-live.mjs. A second window (the settings window) is reached with
 * app.page('settings.html'), which returns the same helpers for that page.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Starts `exe` with remote debugging and attaches to the overlay page.
 * `env` entries set to undefined are removed from the child's environment.
 * The result has the overlay page's helpers plus `page(urlPart)` for others.
 */
export async function launchAndAttach({ exe, args = [], cwd = process.cwd(), port = 9234, env = {} }) {
    const childEnv = { ...process.env, ...env };
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete childEnv[key];
    const child = spawn(exe, [`--remote-debugging-port=${port}`, ...args], { cwd, stdio: 'ignore', env: childEnv });

    const findTarget = async (urlPart, attempts) => {
        for (let i = 0; i < attempts; i++) {
            try {
                const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
                const hit = targets.find(t => t.type === 'page' && t.url.includes(urlPart));
                if (hit) return hit;
            } catch { /* endpoint not up yet */ }
            await sleep(500);
        }
        return null;
    };

    const overlayTarget = await findTarget('overlay.html', 60);
    if (!overlayTarget) {
        child.kill('SIGKILL');
        throw new Error('overlay.html not found among the CDP targets');
    }

    const openPages = [];
    const overlay = await attachPage(overlayTarget.webSocketDebuggerUrl);
    openPages.push(overlay);

    /** Attaches to another window by a part of its URL, e.g. 'settings.html'. */
    async function page(urlPart, attempts = 20) {
        const target = await findTarget(urlPart, attempts);
        if (!target) throw new Error(`${urlPart} not found among the CDP targets`);
        const attached = await attachPage(target.webSocketDebuggerUrl);
        openPages.push(attached);
        return attached;
    }

    /** True while a page whose URL contains `urlPart` is open. */
    async function pageExists(urlPart) {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        return targets.some(t => t.type === 'page' && t.url.includes(urlPart));
    }

    function close() {
        for (const p of openPages) p.detach();
        child.kill('SIGKILL');
    }

    /** Resolves once the app process has ended, so callers can wait before touching its files. */
    const exited = new Promise(resolve => child.once('exit', resolve));

    return { ...overlay, page, pageExists, close, exited };
}

/** CDP session on one page target: evaluate / waitFor / screenshot. */
async function attachPage(webSocketDebuggerUrl) {
    const ws = new WebSocket(webSocketDebuggerUrl);
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

    function detach() {
        try { ws.close(); } catch { /* already closed */ }
    }

    await send('Runtime.enable');
    await send('Page.enable');
    return { evaluate, waitFor, screenshot, detach, pageErrors };
}
