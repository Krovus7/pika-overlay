/** Per-file metrics. Latency = player detection event -> first resolved row. */

import { summarize } from './util.mjs';

const POST_START_MS = 60_000;
const DETECTION_EVENTS = new Set(['player_detected', 'party_joined', 'party_members']);

export class Metrics {
    constructor() {
        this.detections = {};
        this.unique = new Set();
        this.games = 0;
        this.partyEvents = 0;
        this.lookupsStarted = 0;
        this.lookupsDropped = 0;
        this.freshJobs = 0;
        this.freshRequests = 0;
        this.maxTable = 0;
        this.detectedAt = new Map();
        this.lat = [];
        this.latPostStart = [];
        this.lastStartT = -Infinity;
        this.matches = [];
        this.cur = null;
        this.lobbyFirst = null;
        this.resolvedSince = null;
    }

    onEvent(ev, args, now, oracle, model) {
        if (ev === 'player_detected') {
            this.detections[args[1]] = (this.detections[args[1]] ?? 0) + 1;
            this.unique.add(args[0].toLowerCase());
        }
        if (ev.startsWith('party_')) this.partyEvents++;
        if (ev === 'game_start') {
            this.games++;
            this.lastStartT = now;
            this.cur = { startT: now, tableSize: model.size, resolvedAtStart: 0, lobbyToResolvedMs: null, lobbyFirst: this.lobbyFirst };
            for (const row of model.players.values()) if (row.status !== 'loading') this.cur.resolvedAtStart++;
            this.matches.push(this.cur);
            if (this.resolvedSince !== null) this.settle(this.resolvedSince);
        }
        if (ev === 'players_clear') { this.cur = null; this.lobbyFirst = null; }
        if (DETECTION_EVENTS.has(ev)) {
            const names = ev === 'party_members' ? args[0] : [args[0]];
            for (const n of names) {
                const k = n.toLowerCase();
                if (this.lobbyFirst === null) this.lobbyFirst = now;
                if (oracle.expected.has(k) && !model.has(k) && !this.detectedAt.has(k)) this.detectedAt.set(k, now);
            }
        }
        for (const k of this.detectedAt.keys()) if (!oracle.expected.has(k)) this.detectedAt.delete(k);
    }

    manualAt(name, now) { this.detectedAt.set(name.toLowerCase(), now); }

    onSend(channel, args, now, model) {
        if (channel === 'player:loading') this.lookupsStarted++;
        if (channel !== 'player:stats') return;
        const k = args[0].username.toLowerCase();
        const t = this.detectedAt.get(k);
        if (t === undefined || !model.has(k)) return;
        this.detectedAt.delete(k);
        this.lat.push(now - t);
        if (now - this.lastStartT <= POST_START_MS) this.latPostStart.push(now - t);
    }

    settle(at) {
        const m = this.cur;
        if (m && m.lobbyToResolvedMs === null) m.lobbyToResolvedMs = at - (m.lobbyFirst ?? m.startT);
    }

    step(now, model) {
        this.maxTable = Math.max(this.maxTable, model.size);
        let loading = 0;
        for (const row of model.players.values()) if (row.status === 'loading') loading++;
        if (loading === 0 && model.size > 0) {
            if (this.resolvedSince === null) { this.resolvedSince = now; this.settle(now); }
        } else this.resolvedSince = null;
    }

    result() {
        return {
            detections: this.detections, uniquePlayers: this.unique.size, games: this.games,
            partyEvents: this.partyEvents, lookupsStarted: this.lookupsStarted, lookupsDropped: this.lookupsDropped,
            freshJobs: this.freshJobs, freshRequests: this.freshRequests,
            maxTable: this.maxTable, latency: summarize(this.lat), latencyPostStart: summarize(this.latPostStart),
            latencySamples: this.lat, latencyPostStartSamples: this.latPostStart,
            matches: this.matches.map(({ startT, tableSize, resolvedAtStart, lobbyToResolvedMs }) =>
                ({ startT, tableSize, resolvedAtStart, lobbyToResolvedMs })),
        };
    }
}
