/** Aggregation across files and the human-readable report. */

import * as fs from 'node:fs';

import { CHECKS } from './violations.mjs';
import { summarize } from './util.mjs';

const sumInto = (acc, o) => { for (const [k, v] of Object.entries(o ?? {})) acc[k] = (acc[k] ?? 0) + v; };
const avg = xs => (xs.length ? +(xs.reduce((x, y) => x + y, 0) / xs.length).toFixed(3) : null);

export function aggregate(results, meta) {
    const ok = results.filter(r => r.ok).map(r => r.result);
    const a = {
        ...meta, files: results.length, crashed: results.length - ok.length,
        counts: Object.fromEntries(CHECKS.map(c => [c, 0])), detections: {}, finalStatus: {}, api: {},
        lines: 0, virtualMs: 0, games: 0, partyEvents: 0, lookupsStarted: 0, lookupsDropped: 0, freshJobs: 0, freshRequests: 0, uniquePlayers: 0,
        maxTable: 0, errorRows: 0, expectedFaultLogs: 0,
    };
    const lat = [], latPost = [], resolvedFrac = [], tableAtStart = [], lobbyMs = [];
    for (const r of ok) {
        sumInto(a.counts, r.violationCounts);
        sumInto(a.detections, r.detections);
        sumInto(a.finalStatus, r.finalStatus);
        for (const [k, v] of Object.entries(r.api)) a.api[k] = k.startsWith('max') ? Math.max(a.api[k] ?? 0, v) : (a.api[k] ?? 0) + v;
        for (const k of ['lines', 'virtualMs', 'games', 'partyEvents', 'lookupsStarted', 'lookupsDropped', 'freshJobs', 'freshRequests', 'uniquePlayers', 'errorRows']) a[k] += r[k];
        a.maxTable = Math.max(a.maxTable, r.maxTable);
        a.expectedFaultLogs += r.errors.expectedFaultLogs;
        lat.push(...r.latencySamples);
        latPost.push(...r.latencyPostStartSamples);
        for (const m of r.matches) {
            tableAtStart.push(m.tableSize);
            if (m.tableSize > 0) resolvedFrac.push(m.resolvedAtStart / m.tableSize);
            if (m.lobbyToResolvedMs !== null) lobbyMs.push(m.lobbyToResolvedMs);
        }
    }
    a.totalViolations = Object.values(a.counts).reduce((x, y) => x + y, 0);
    a.latency = summarize(lat);
    a.latencyPostStart = summarize(latPost);
    a.lobbyToResolved = summarize(lobbyMs);
    a.matches = { n: tableAtStart.length, avgTableAtStart: avg(tableAtStart), avgResolvedFracAtStart: avg(resolvedFrac) };
    a.requestsPerLookup = a.lookupsStarted ? +(a.api.total / a.lookupsStarted).toFixed(2) : null;
    a.slowest = [...ok].sort((x, y) => y.wallMs - x.wallMs).slice(0, 5).map(r => `${r.file} ${(r.wallMs / 1000).toFixed(1)}s`);
    return a;
}

const sec = ms => (ms === null || ms === undefined ? '-' : `${(ms / 1000).toFixed(1)}s`);
const sm = s => `n=${s.n} p50=${sec(s.p50)} p95=${sec(s.p95)} max=${sec(s.max)}`;

export function writeReports(file, results, a) {
    const L = ['# PikaOverlay session simulation', ''];
    L.push(`Files: ${a.files} (crashed: ${a.crashed}) | seed ${a.seed} | actions: ${a.actions} | username ${a.username ?? 'auto (per log)'}`);
    L.push(`Virtual time ${(a.virtualMs / 3.6e6).toFixed(1)} h, ${a.lines} log lines. Total violations: **${a.totalViolations}**`, '');
    L.push('## Violations per check', '', '| check | count |', '|---|---|');
    for (const [c, n] of Object.entries(a.counts)) L.push(`| ${c} | ${n} |`);
    L.push('', 'State-comparison checks (SYNC, MEMBERSHIP, PARTY_PINNED) count episodes (diff changes), not steps.', '');
    L.push('## First violations of each kind', '');
    const all = results.filter(r => r.ok).flatMap(r => r.result.violations);
    for (const c of CHECKS) {
        const mine = all.filter(v => v.check === c).slice(0, 6);
        if (!mine.length) continue;
        L.push(`### ${c}`, '');
        for (const v of mine) L.push(`- ${v.file} @${v.time} line ${v.line}: \`${v.text.slice(0, 140)}\` -- ${v.detail}`);
        L.push('');
    }
    const crashed = results.filter(r => !r.ok);
    if (crashed.length) { L.push('## Crashed workers', ''); for (const r of crashed) L.push(`- ${r.file}: ${r.error.split('\n')[0]}`); L.push(''); }
    const errs = new Map();
    for (const r of results.filter(x => x.ok)) for (const e of r.result.errors.distinct) errs.set(e.msg, (errs.get(e.msg) ?? 0) + e.n);
    if (errs.size) { L.push('## Distinct console.error / exceptions', ''); for (const [m, n] of errs) L.push(`- (${n}x) ${m}`); L.push(''); }
    L.push('## Metrics', '', '| metric | value |', '|---|---|');
    const row = (k, v) => L.push(`| ${k} | ${v} |`);
    row('games (game_start)', a.games); row('unique players (sum per file)', a.uniquePlayers);
    row('detections by source', Object.entries(a.detections).map(([k, v]) => `${k}:${v}`).join(' '));
    row('party events', a.partyEvents); row('lookups started / dropped', `${a.lookupsStarted} / ${a.lookupsDropped}`);
    row('fresh refreshes (party / own row) / requests spent on them', `${a.freshJobs} / ${a.freshRequests}`);
    row('rows by final status', Object.entries(a.finalStatus).map(([k, v]) => `${k}:${v}`).join(' '));
    row('detection -> resolved (virtual)', sm(a.latency)); row('... within 60 s after game_start', sm(a.latencyPostStart));
    row('max table size', a.maxTable);
    row('matches: avg rows at game_start / avg share resolved', `${a.matches.avgTableAtStart} / ${a.matches.avgResolvedFracAtStart} (n=${a.matches.n})`);
    row('first lobby detection -> all rows resolved', sm(a.lobbyToResolved));
    row('requests total', a.api.total); row('requests per lookup started', a.requestsPerLookup);
    row('max requests in a sliding 60 s span', a.api.maxSliding60s);
    row('401 / 429 / 500 / hung / aborted', [a.api.s401, a.api.s429, a.api.s500, a.api.hung, a.api.aborted].join(' / '));
    row('error/rate_limited rows (injected faults only)', a.errorRows); row('expected fault console.error logs', a.expectedFaultLogs);
    L.push('', `Slowest files (wall): ${a.slowest.join('; ')}`, '');
    fs.writeFileSync(file, L.join('\n'));
}
