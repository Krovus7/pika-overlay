/** One simulated session: virtual-time loop over the wired pipeline. */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Actions } from './actions.mjs';
import { Feeder } from './logfeed.mjs';
import { flush } from './util.mjs';
import { wire } from './wiring.mjs';

const SMALL_STEP = 100;
const BIG_STEP = 5000;
const UNREAD_MS = 700;
const DRAIN_MAX_MS = 180_000;

function captureErrors(w) {
    const distinct = new Map();
    let expectedFaultLogs = 0;
    const saved = { log: console.log, warn: console.warn, error: console.error };
    console.log = () => {};
    console.warn = () => {};
    console.error = (...a) => {
        const msg = a.map(x => (x instanceof Error ? x.message : String(x))).join(' ');
        const m = /Request failed for .*\/profile\/([^/?\s]+)/.exec(msg);
        if (m && w.api.faultNames.has(decodeURIComponent(m[1]).toLowerCase())) { expectedFaultLogs++; return; }
        distinct.set(msg, (distinct.get(msg) ?? 0) + 1);
        w.vio.add('ERRORS', `console.error: ${msg.slice(0, 200)}`);
    };
    const onRej = e => { const msg = `unhandledRejection: ${String(e)}`; distinct.set(msg, 1); w.vio.add('ERRORS', msg); };
    const onExc = e => { const msg = `uncaughtException: ${String(e?.stack ?? e)}`; distinct.set(msg, 1); w.vio.add('ERRORS', msg.slice(0, 300)); };
    process.on('unhandledRejection', onRej);
    process.on('uncaughtException', onExc);
    return {
        distinct, get expectedFaultLogs() { return expectedFaultLogs; },
        restore() {
            Object.assign(console, saved);
            process.off('unhandledRejection', onRej);
            process.off('uncaughtException', onExc);
        },
    };
}

export async function runSession(o) {
    const { mock, schedule, name, seed, actions, simDir } = o;
    const wall0 = performance.now();
    const w = wire({ ...o });
    const errs = captureErrors(w);
    const t0 = Date.now() + 3000;
    const livePath = path.join(simDir, `${name.replace(/[^\w.-]/g, '_')}.live.log`);
    const feeder = new Feeder(livePath, schedule, t0);
    w.logWatcher.start(livePath, o.username);
    const { checker, metrics, model, queue, service, api } = w;
    const act = actions ? new Actions({
        seed, start: t0, store: w.store, service, queue, registry: w.registry, party: w.party, send: w.send,
        oracle: w.oracle, metrics, clearPlayers: o.dist.clearPlayers.clearPlayers, cache: o.dist.cache, seen: w.seen,
        afterClear: () => checker.afterEvent('players_clear', []),
    }) : null;

    const isPending = () => queue.activeCount > 0 || queue.pendingCount > 0 || api.inflight > 0
        || service.autoRetry.timers.size > 0;
    let unreadUntil = 0;
    let steps = 0;
    let doneAt = null;
    let drained = true;
    for (;;) {
        const now = Date.now();
        if (feeder.feedDue(now) > 0) unreadUntil = now + UNREAD_MS;
        if (act && !feeder.done && act.due(now)) { act.run(now, model.players); checker.touch(); }
        const pending = isPending() || now < unreadUntil;
        if (feeder.done && doneAt === null) doneAt = now;
        if (feeder.done && !pending) break;
        if (doneAt !== null && now - doneAt > DRAIN_MAX_MS) { drained = false; break; }
        let step = pending ? SMALL_STEP : Math.min(BIG_STEP, Math.max(1, feeder.nextTime() - now));
        if (act && !pending && !feeder.done) step = Math.min(step, Math.max(1, Math.ceil(act.nextAt - now)));
        mock.timers.tick(Math.ceil(step));
        await flush();
        steps++;
        checker.step();
        metrics.step(Date.now(), model);
        if (!isPending()) checker.quiescent();
    }
    checker.step();
    checker.final(drained);
    w.logWatcher.stop();
    const { distinct, expectedFaultLogs } = errs;
    errs.restore();
    fs.rmSync(livePath, { force: true });
    const apiStats = api.stats();
    const m = metrics.result();
    return {
        file: name, username: o.username, seed, actions: !!actions, steps,
        lines: schedule.items.length, virtualMs: Date.now() - (t0 - 3000), wallMs: Math.round(performance.now() - wall0),
        ...m, api: apiStats,
        requestsPerLookup: m.lookupsStarted ? +(apiStats.total / m.lookupsStarted).toFixed(2) : null,
        finalStatus: checker.finalStatus, errorRows: checker.errorRows,
        actionCounts: act?.counts ?? null, sentCounts: model.sentCounts,
        errors: { distinct: [...distinct].map(([msg, n]) => ({ msg: msg.slice(0, 300), n })), expectedFaultLogs },
        violationCounts: w.vio.counts, violations: w.vio.stored,
    };
}
