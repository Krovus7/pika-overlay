/**
 * Replays a real session log into the REAL app (dev Electron window, real
 * renderer, live Pika API with the key saved in the app's config) at a
 * compressed pace, watching the table through the DevTools protocol.
 *
 * Usage: node scripts/replay-live.mjs <log> [--speed 10] [--max-gap 4]
 *                                     [--from LINE] [--to LINE] [--tag NAME]
 *   --speed    time compression (10 = a 10 minute game takes 1 minute)
 *   --max-gap  idle gaps in the log longer than this many seconds are cut
 *
 * The app is started with PIKA_REPLAY pointing at a temp file that this script
 * appends to, so the log watcher, queue, API client and overlay all run
 * unmodified. Checks: no row stuck on loading, no KEY REQUIRED row, no page
 * error. Output: artifacts/sim/replay-live-<tag>.json and screenshots in
 * artifacts/screens/v5-replay-<tag>-*.png. Exit 1 on a failed check.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { launchAndAttach } from './lib/cdp.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const logFile = argv.find(a => !a.startsWith('--') && existsSync(a));
if (!logFile) {
    console.error('usage: node scripts/replay-live.mjs <log> [--speed 10] [--max-gap 4] [--from LINE] [--to LINE] [--tag NAME]');
    process.exit(2);
}
const SPEED = Number(flag('speed', 10));
const MAX_GAP_S = Number(flag('max-gap', 4));
const FROM = Number(flag('from', 1));
const TO = Number(flag('to', Infinity));
const TAG = flag('tag', path.basename(logFile).replace(/\..*$/, ''));
const STUCK_LOADING_MS = 30_000;
const MAX_SHOTS = 14;

const SIM_DIR = path.join(ROOT, 'artifacts', 'sim');
const SHOTS_DIR = path.join(ROOT, 'artifacts', 'screens');
const livePath = path.join(SIM_DIR, `replay-live-${TAG}.log`);
mkdirSync(SIM_DIR, { recursive: true });
writeFileSync(livePath, '');

const RE_TIME = /^\[(\d\d):(\d\d):(\d\d)\]/;
const lines = readFileSync(logFile, 'latin1').split(/\r?\n/).slice(FROM - 1, TO === Infinity ? undefined : TO);

const SAMPLE = `(() => ({
    badge: document.getElementById('status-badge')?.textContent ?? '',
    banner: document.getElementById('api-banner').hidden ? '' : (document.getElementById('banner-text')?.textContent ?? 'visible'),
    rows: [...document.querySelectorAll('#stats-body tr')].map(r => ({
        name: r.querySelector('[data-user]')?.getAttribute('data-user') ?? r.cells[1]?.textContent?.trim() ?? '',
        cls: r.className,
    })),
}))()`;

function statusOf(cls) {
    if (cls.includes('row-loading')) return 'loading';
    const hit = /row-(nicked|not-found|api-off|never-played|no-data|error|rate-limited|auth)/.exec(cls);
    return hit ? hit[1] : 'ok';
}

const app = await launchAndAttach({
    exe: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: ['.'],
    cwd: ROOT,
    env: { PIKA_REPLAY: livePath, PIKA_REPLAY_DRIVE: '0', ELECTRON_RUN_AS_NODE: undefined },
});
await sleep(3000);

const report = {
    log: path.basename(logFile), speed: SPEED, maxGapSec: MAX_GAP_S, lines: lines.length,
    samples: 0, maxRows: 0, badgeChanges: [], finalStatus: {}, everSeen: 0,
    maxLoadingMs: 0, stuckLoading: [], bannerSamples: {}, authRows: [], failures: [],
};
const loadingSince = new Map();
const lastStatus = new Map();
let lastBadge = '';
let shots = 0;
let feeding = true;

async function shot(label) {
    if (shots >= MAX_SHOTS) return;
    shots++;
    await app.screenshot(SHOTS_DIR, `v5-replay-${TAG}-${String(shots).padStart(2, '0')}-${label}.png`);
}

async function sample() {
    const s = await app.evaluate(SAMPLE);
    const now = Date.now();
    report.samples++;
    report.maxRows = Math.max(report.maxRows, s.rows.length);
    if (s.banner) report.bannerSamples[s.banner.slice(0, 60)] = (report.bannerSamples[s.banner.slice(0, 60)] ?? 0) + 1;
    if (s.badge !== lastBadge) {
        report.badgeChanges.push(s.badge);
        lastBadge = s.badge;
        if (/in game/i.test(s.badge)) setTimeout(() => void shot('in-game').catch(() => undefined), 2500);
        if (/idle/i.test(s.badge) && report.samples > 1) void shot('game-end').catch(() => undefined);
    }
    const present = new Set();
    for (const row of s.rows) {
        const status = statusOf(row.cls);
        present.add(row.name);
        lastStatus.set(row.name, status);
        if (status === 'auth' && !report.authRows.includes(row.name)) report.authRows.push(row.name);
        if (status !== 'loading') { loadingSince.delete(row.name); continue; }
        if (!loadingSince.has(row.name)) loadingSince.set(row.name, now);
        const waited = now - loadingSince.get(row.name);
        report.maxLoadingMs = Math.max(report.maxLoadingMs, waited);
        if (waited > STUCK_LOADING_MS && !s.banner && !report.stuckLoading.includes(row.name)) report.stuckLoading.push(row.name);
    }
    for (const name of [...loadingSince.keys()]) if (!present.has(name)) loadingSince.delete(name);
    return s;
}

const sampler = (async () => {
    while (feeding) {
        await sample().catch(err => report.failures.push(`sample failed: ${err.message}`));
        await sleep(400);
    }
})();

let previous = null;
let batch = '';
for (const line of lines) {
    const m = RE_TIME.exec(line);
    const t = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : previous;
    if (previous !== null && t !== previous) {
        appendFileSync(livePath, batch, 'latin1');
        batch = '';
        let gap = t - previous;
        if (gap < 0) gap += 86_400; // midnight
        await sleep((Math.min(gap, MAX_GAP_S) * 1000) / SPEED);
    }
    previous = t;
    batch += `${line}\n`;
}
appendFileSync(livePath, batch, 'latin1');

// Let the last lookups finish, then take the final picture
for (let i = 0; i < 150 && [...lastStatus.values()].includes('loading') && loadingSince.size > 0; i++) await sleep(400);
await sleep(1500);
feeding = false;
await sampler;
const last = await sample();
await shot('final');

for (const status of lastStatus.values()) report.finalStatus[status] = (report.finalStatus[status] ?? 0) + 1;
report.everSeen = lastStatus.size;
report.rowsAtEnd = last.rows.length;
report.loadingAtEnd = last.rows.filter(r => statusOf(r.cls) === 'loading').map(r => r.name);
report.pageErrors = app.pageErrors.slice(0, 20);

if (report.stuckLoading.length) report.failures.push(`rows stuck on loading > ${STUCK_LOADING_MS / 1000}s: ${report.stuckLoading.join(', ')}`);
if (report.loadingAtEnd.length) report.failures.push(`rows still loading at the end: ${report.loadingAtEnd.join(', ')}`);
if (report.authRows.length) report.failures.push(`KEY REQUIRED rows: ${report.authRows.join(', ')}`);
if (report.pageErrors.length) report.failures.push(`${report.pageErrors.length} page error(s)`);

writeFileSync(path.join(SIM_DIR, `replay-live-${TAG}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(report.failures.length ? `\n[replay-live] FAILED: ${report.failures.length} check(s)` : '\n[replay-live] all checks passed');
app.close();
process.exit(report.failures.length ? 1 : 0);
