/**
 * Child process: runs ONE log in isolation (the API modules are singletons).
 * Virtual time is enabled BEFORE any dist/ module is loaded.
 */

import { mock } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { buildSchedule } from './logfeed.mjs';
import { runSession } from './session.mjs';

const BASE_DAY = Date.UTC(2026, 5, 1);

async function run(job) {
    const buf = fs.readFileSync(job.file);
    const schedule = buildSchedule(buf, job.spreadMs ?? 0);
    // Default: the player whose log it is ("Setting user:"), else AcquaPanna
    const username = job.username ?? /Setting user: ([A-Za-z0-9_]+)/.exec(buf.subarray(0, 20000).toString('latin1'))?.[1] ?? 'AcquaPanna';
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: BASE_DAY + schedule.firstTod - 3000 });
    const require = createRequire(import.meta.url);
    const d = p => require(path.join(job.root, 'dist', 'src', 'main', p));
    const dist = {
        config: d('config.js'), state: d('state/index.js'), apiSession: d('api/apiSession.js'),
        lookup: d('ipc/lookup.js'), logWatcher: d('log/logWatcher.js'), watcherBindings: d('watcherBindings.js'),
        health: d('api/health.js'), clearPlayers: d('ipc/clearPlayers.js'), cache: d('api/cache.js'),
    };
    const Store = await import(pathToFileURL(job.storeBundle).href);
    return runSession({
        dist, Store, mock, schedule, simDir: job.simDir, name: job.name, username,
        seed: job.seed, actions: job.actions, breakage: job.breakage,
    });
}

process.on('message', async job => {
    let msg;
    try { msg = { ok: true, result: await run(job) }; }
    catch (e) { msg = { ok: false, error: String(e?.stack ?? e), file: job.file }; }
    process.send(msg, () => process.exit(0));
});
