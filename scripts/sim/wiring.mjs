/**
 * Builds the app pipeline exactly like src/main/main.ts (fresh instances, no
 * Electron) plus the model, oracle, checker and metrics hung on its events.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Checker } from './checks.mjs';
import { FakeApi, API_KEY } from './fakeApi.mjs';
import { Metrics } from './metrics.mjs';
import { TableModel } from './model.mjs';
import { ORACLE_EVENTS, Oracle } from './oracle.mjs';
import { Violations } from './violations.mjs';

export function wire({ dist, Store, name, username, seed, breakage, simDir, schedule }) {
    const { ConfigStore } = dist.config;
    const { PlayerRegistry, PartyState, GameState, LookupQueue } = dist.state;
    const vio = new Violations(name);
    const api = new FakeApi({ seed, alwaysOk: [username], breakApi: breakage === 'api_204' });
    api.install();

    const cfgDir = fs.mkdtempSync(path.join(simDir, `cfg-${name.replace(/[^\w.-]/g, '_')}-`));
    const store = new ConfigStore(ConfigStore.userDataPath(cfgDir));
    store.set('apiKey', API_KEY);
    dist.apiSession.setApiKey(store.get('apiKey'));

    const registry = new PlayerRegistry();
    const party = new PartyState();
    const game = new GameState();
    const model = new TableModel(Store, { ignoreRemove: breakage === 'model_ignores_remove' });
    const metrics = new Metrics();
    const oracle = new Oracle();
    const sentRing = [];
    const TRACE = (process.env.SIM_TRACE ?? '').toLowerCase(); // debug: SIM_TRACE=name prints its events/sends
    const trace = (what, text) => { if (TRACE && text.toLowerCase().includes(TRACE)) process.stderr.write(`[trace ${new Date(Date.now()).toISOString().slice(11, 23)}] ${what} ${text}
`); };
    const send = (channel, ...args) => {
        trace('send', channel + JSON.stringify(args));
        sentRing.push(channel);
        if (sentRing.length > 50) sentRing.shift();
        metrics.onSend(channel, args, Date.now(), model);
        model.apply(channel, args);
    };
    const getOverlayWin = () => ({ webContents: { send } });

    const service = new dist.lookup.LookupService({ store, registry, getOverlayWin });
    const startSel = new Map();
    const realRun = service.run.bind(service);
    service.run = (n, source, interval, mode, ...rest) => {
        startSel.set(n.toLowerCase(), {
            interval: interval || store.get('statsInterval') || 'total',
            mode: mode || store.get('statsMode') || 'ALL_MODES',
        });
        return realRun(n, source, interval, mode, ...rest);
    };
    const freshActive = new Map(); // name -> running fresh jobs, to attribute API requests
    api.onRequest = n => { if (freshActive.has(n)) metrics.freshRequests++; };
    const queue = new LookupQueue(async job => {
        const k = job.username.toLowerCase();
        if (job.fresh) { metrics.freshJobs++; freshActive.set(k, (freshActive.get(k) ?? 0) + 1); }
        try {
            if (job.refresh) await service.refresh(job.username, job.interval, job.mode, job.fresh);
            else await service.lookup(job.username, job.source, job.interval, job.mode, job.fresh);
        } finally {
            if (job.fresh) { const c = freshActive.get(k) - 1; if (c <= 0) freshActive.delete(k); else freshActive.set(k, c); }
        }
    });
    const realDrop = queue.dropPending.bind(queue);
    queue.dropPending = pred => { const n = realDrop(pred); metrics.lookupsDropped += n; return n; };

    const logWatcher = new dist.logWatcher.LogWatcher();
    dist.watcherBindings.bindWatcherEvents({
        logWatcher, queue, registry, party, game, send, isSelf: n => n.toLowerCase() === username.toLowerCase(),
    });
    if (breakage === 'skip_quit_listener') logWatcher.removeAllListeners('player_quit');

    const checker = new Checker({ vio, model, registry, oracle, api, startSel, seed });
    dist.health.onHealthChange(h => checker.onHealth(h.kind));

    // Oracle-side listeners are registered AFTER the app's, so they see its reaction
    logWatcher.prependListener('game_start', () => checker.beforeEvent('game_start'));
    logWatcher.on('log_line', line => {
        vio.cursor.count++;
        vio.cursor.no = schedule.nonEmptyNo[vio.cursor.count - 1] ?? 0;
        vio.cursor.text = line;
    });
    for (const ev of ORACLE_EVENTS) {
        logWatcher.on(ev, (...args) => {
            trace('event', ev + JSON.stringify(args));
            oracle.handle(ev, args);
            metrics.onEvent(ev, args, Date.now(), oracle, model);
            checker.afterEvent(ev, args);
        });
    }
    const seen = new Set();
    logWatcher.on('player_detected', n => seen.add(n));

    return { vio, api, store, registry, party, game, model, metrics, oracle, service, queue, logWatcher, checker, send, seen, sentRing };
}
