/**
 * Optional user actions (--actions): seeded, one roughly every 3-8 virtual
 * minutes, calling the same functions the IPC handlers call.
 */

import { mulberry32 } from './util.mjs';

const INTERVALS = ['total', 'weekly', 'monthly', 'yearly'];
const MODES = ['ALL_MODES', 'SOLO', 'DOUBLES', 'TRIPLES', 'QUAD'];
const MIN_GAP = 3 * 60_000;
const MAX_GAP = 8 * 60_000;

export class Actions {
    constructor({ cache, seed, start, store, service, queue, registry, party, send, oracle, metrics, clearPlayers, afterClear, seen }) {
        Object.assign(this, { cache, store, service, queue, registry, party, send, oracle, metrics, clearPlayers, afterClear, seen });
        this.rand = mulberry32(seed * 104729 + 5);
        this.nextAt = start + this.gap();
        this.counts = { period: 0, mode: 0, clear: 0, lookup: 0, retry: 0, refresh: 0 };
    }

    gap() { return MIN_GAP + this.rand() * (MAX_GAP - MIN_GAP); }
    pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }

    due(now) { return now >= this.nextAt; }

    run(now, rows) {
        this.nextAt = now + this.gap();
        const r = this.rand();
        const { store, service, queue } = this;
        if (r < 0.28) {
            const next = this.pick(INTERVALS.filter(i => i !== store.get('statsInterval')));
            this.refetch(next, null);
            this.counts.period++;
        } else if (r < 0.5) {
            const next = this.pick(MODES.filter(m => m !== store.get('statsMode')));
            this.refetch(store.get('statsInterval'), next);
            this.counts.mode++;
        } else if (r < 0.65) {
            this.clearPlayers({ registry: this.registry, party: this.party, queue, send: this.send });
            this.oracle.manualClear();
            this.afterClear();
            this.counts.clear++;
        } else if (r < 0.88) {
            const real = this.seen.size > 0 && this.rand() < 0.5;
            const name = real ? this.pick([...this.seen]) : `Sim${Math.floor(this.rand() * 90000) + 10000}`;
            // A name already shown is a no-op lookup: no result to time
            if (!rows.has(name.toLowerCase())) this.metrics.manualAt(name, now);
            void service.lookup(name, 'manual', null, null);
            this.oracle.manualAdd(name);
            this.counts.lookup++;
        } else if (r < 0.94) {
            // players:refresh handler: nothing cached is trusted, every row fetched again
            this.cache.cache.clear();
            service.refreshAll(queue, null, null);
            this.counts.refresh++;
        } else {
            const keys = [...rows.entries()].filter(([, row]) => row.status === 'error' || row.status === 'rate_limited').map(([k]) => k);
            const all = keys.length ? keys : [...rows.keys()];
            if (all.length) { void service.retry(this.pick(all)); this.counts.retry++; }
        }
    }

    /** STATS_REFETCH_ALL handler: persist the choice, refresh every row */
    refetch(interval, mode) {
        this.store.set('statsInterval', interval);
        if (mode) this.store.set('statsMode', mode);
        this.service.refreshAll(this.queue, this.store.get('statsInterval'), this.store.get('statsMode'));
    }
}
