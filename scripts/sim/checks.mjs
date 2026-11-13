/**
 * Invariant checker. State-comparison checks (SYNC, MEMBERSHIP, PARTY_PINNED)
 * count EPISODES: a violation is recorded when the diff signature changes, not
 * once per step. Everything else is counted per occurrence.
 */

import { classOf, nullForInterval } from './fakeApi.mjs';

const STUCK_MS = 45_000;
const USER_TYPED = ['manual', 'bulk'];
const diff = (a, b) => ({
    missing: [...b].filter(k => !a.has(k)).sort(),
    extra: [...a].filter(k => !b.has(k)).sort(),
});
const fmt = d => `missing=[${d.missing.slice(0, 6)}${d.missing.length > 6 ? ',…' : ''}] extra=[${d.extra.slice(0, 6)}${d.extra.length > 6 ? ',…' : ''}]`;

export class Checker {
    constructor({ vio, model, registry, oracle, api, startSel, seed }) {
        Object.assign(this, { vio, model, registry, oracle, api, startSel, seed });
        this.dirty = true;
        this.dirtyQ = true;
        this.sig = {};
        this.loadingSince = new Map();
        this.flagged = new Set();
        this.rlNow = false;
        this.lastRL = 0;
        this.removals = [];
        this.partyPresent = new Set();
        this.beforeStart = null;
        this.finalStatus = {};
        this.errorRows = 0;
        model.hooks = {
            loading: (k, prev, source) => {
                if (this.relabelled(k, prev, source)) this.vio.add('SOURCE_STABILITY', `${k}: row source ${prev.source} -> loading event source ${source}`);
                this.loadingSince.set(k, Date.now());
                this.touch();
            },
            stats: (k, data, applied, prev) => {
                if (!applied) return;
                if (this.relabelled(k, prev, data.source)) this.vio.add('SOURCE_STABILITY', `${k}: row source ${prev.source} -> stats source ${data.source}`);
                this.loadingSince.delete(k);
                this.classify(data);
                this.touch();
            },
            removed: keys => {
                for (const k of keys) { this.removals.push(k); this.loadingSince.delete(k); }
                this.touch();
            },
        };
    }

    /** A row keeps its source; the one allowed change is to 'party' when the player joins the party */
    relabelled(k, prev, source) {
        return !!prev && prev.source !== source && !(source === 'party' && this.oracle.party.has(k));
    }

    touch() { this.dirty = true; this.dirtyQ = true; }

    episode(check, signature, detail) {
        if (this.sig[check] === signature) return;
        this.sig[check] = signature;
        if (signature !== '') this.vio.add(check, detail);
    }

    onHealth(kind) {
        this.rlNow = kind === 'rate_limited';
        this.lastRL = Date.now();
    }

    classify({ username, status, source }) {
        const lower = username.toLowerCase();
        if (status === 'auth') return this.vio.add('CLASSIFICATION', `${username}: auth row`);
        if (status === 'error' || status === 'rate_limited') {
            if (this.api.faultNames.has(lower)) { this.errorRows++; return; }
            return this.vio.add('CLASSIFICATION', `${username}: ${status} row without an injected fault (source ${source})`);
        }
        const cls = classOf(username, this.seed, this.api.alwaysOk);
        const sel = this.startSel.get(lower) ?? { interval: 'total' };
        let want;
        if (cls === 'ok') want = nullForInterval(username, sel.interval, this.seed) ? 'no_data' : 'ok';
        else if (cls === 'unknown') want = USER_TYPED.includes(source) ? 'not_found' : 'nicked';
        else want = cls === 'private' ? 'api_off' : 'never_played';
        if (status !== want) {
            this.vio.add('CLASSIFICATION', `${username} (truth ${cls}, interval ${sel.interval}, source ${source}): expected ${want}, got ${status}`);
        }
    }

    beforeEvent(ev) {
        if (ev === 'game_start') {
            this.beforeStart = { reg: new Set(this.registry.snapshot()), model: new Set(this.model.players.keys()) };
        }
    }

    flushRemovals() {
        for (const k of this.removals.splice(0)) {
            if (this.oracle.party.has(k)) this.vio.add('PARTY_PINNED', `party member ${k} lost its row while still in the party`);
        }
    }

    afterEvent(ev, args) {
        this.touch();
        this.flushRemovals();
        const { oracle, registry, model, vio } = this;
        const gone = (what, k) => {
            if (registry.has(k) || model.has(k)) vio.add('IMMEDIATE_REMOVAL', `${what}: ${k} still in ${registry.has(k) ? 'registry' : ''}${model.has(k) ? ' table' : ''}`);
        };
        if (ev === 'player_quit') { const k = args[0].toLowerCase(); if (!oracle.party.has(k)) gone(ev, k); }
        else if (ev === 'party_left') gone(ev, args[0].toLowerCase());
        else if (ev === 'players_clear') {
            for (const k of new Set([...registry.snapshot(), ...model.players.keys()])) {
                if (!oracle.party.has(k)) gone(ev, k);
            }
        } else if (ev === 'game_start' && this.beforeStart) {
            const r = diff(new Set(registry.snapshot()), this.beforeStart.reg);
            const m = diff(new Set(model.players.keys()), this.beforeStart.model);
            if (r.missing.length || r.extra.length) vio.add('GAME_START_UNCHANGED', `registry changed at game_start: ${fmt(r)}`);
            if (m.missing.length || m.extra.length) vio.add('GAME_START_UNCHANGED', `table changed at game_start: ${fmt(m)}`);
        } else if (ev === 'players_sync') {
            for (const k of oracle.spectators) {
                if (model.has(k) && !oracle.party.has(k)) vio.add('NO_SPECTATOR', `${k} was eliminated in this match but is in the table after a tab roster`);
            }
        }
    }

    /** After every tick step */
    step() {
        const now = Date.now();
        const { model, registry, oracle } = this;
        if (this.dirty || registry.size !== model.size) {
            const d = diff(new Set(model.players.keys()), new Set(registry.snapshot()));
            this.episode('SYNC', d.missing.length || d.extra.length ? fmt(d) : '', `registry vs table: ${fmt(d)} (missing = in registry only)`);
            this.flushRemovals();
            for (const k of this.partyPresent) {
                if (oracle.party.has(k) && !model.has(k)) this.episode('PARTY_PINNED', `gone:${k}`, `party member ${k} had a row and it is gone`);
            }
            this.partyPresent = new Set([...oracle.party].filter(k => model.has(k)));
            this.dirty = false;
        }
        if (this.rlNow) this.lastRL = now;
        for (const [k, since] of this.loadingSince) {
            const eff = Math.max(since, this.lastRL);
            const id = `${k}@${since}`;
            if (now - eff > STUCK_MS && !this.flagged.has(id)) {
                this.flagged.add(id);
                this.vio.add('STUCK_LOADING', `${k} loading for ${Math.round((now - eff) / 1000)}s (since ${new Date(since).toISOString().slice(11, 19)})`);
            }
        }
    }

    quiescent() {
        if (!this.dirtyQ) return;
        this.dirtyQ = false;
        const { model, oracle } = this;
        const d = diff(new Set(model.players.keys()), oracle.expected);
        this.episode('MEMBERSHIP', d.missing.length || d.extra.length ? fmt(d) : '', `table vs oracle: ${fmt(d)}`);
        const lost = [...oracle.party].filter(k => !model.has(k));
        this.episode('PARTY_PINNED', lost.length ? `q:${lost}` : '', `party members without a row while quiet: ${lost.join(',')}`);
    }

    final(drained) {
        this.dirtyQ = true;
        this.sig.MEMBERSHIP = undefined;
        if (!drained) this.vio.add('STUCK_LOADING', 'did not become quiescent within 3 virtual minutes after the last line');
        else this.quiescent();
        for (const [k, row] of this.model.players) {
            this.finalStatus[row.status] = (this.finalStatus[row.status] ?? 0) + 1;
            if (row.status === 'loading') this.vio.add('STUCK_LOADING', `${k} still loading after drain`);
        }
        const s = this.api.stats();
        if (s.s429 > 0) this.vio.add('BUDGET', `server answered 429 ${s.s429} times`);
        // The client follows the server's own x-ratelimit-remaining/reset, so the
        // invariant is "never refused". With the fake's fixed windows a sliding
        // 60 s span can legitimately hold more than 120 (end of one window plus
        // start of the next); that figure is reported as a metric only.
    }
}
