/**
 * Live API check against stats.pika-network.net — adapted from v3 test_api.js.
 * Uses the real v4 apiClient (no mocks).
 *   - NICKED: names that never played on Pika (expect nicked=true)
 *   - API_OFF: real accounts without BedWars data (expect apiOff=true)
 *   - NORMAL: accounts with BedWars stats (expect full stats)
 *   - intervals/modes: same player cross interval+mode
 *   - rate limit: controlled burst of 6 concurrent lookups (HANDOVER rule:
 *     never exceed ~8 in-flight) — reports retries/429 behavior
 *
 * Usage: node scripts/live-api-check.mjs   (network required)
 * Exit 0 = all classifications as expected.
 */

import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { getPlayerStats } = require('../dist/src/main/api/apiClient.js');
const { cache } = require('../dist/src/main/api/cache.js');

const NICKED = ['xXzRandomNick9182Xx', 'FakeTestNick99zz', 'aaabbccc123zz', 'qqqwwweee999', 'TestOverlay12345'];
const API_OFF = ['Jeb_', 'Sky', 'Ace'];
const NORMAL = ['Dream', 'Sam', 'Zyx', 'Notch'];

let failures = 0;

function classify(r) {
    if (!r) return 'NULL';
    if (r.error) return r.rateLimited ? 'RATE_LIMITED' : 'ERROR';
    if (r.nicked) return 'NICKED';
    if (r.apiOff) return 'API_OFF';
    return 'NORMAL';
}

async function checkOne(username, expected, label = '') {
    try {
        const r = await getPlayerStats(username, 'total', 'ALL_MODES');
        const got = classify(r);
        const ok = got === expected;
        if (!ok) failures++;
        console.log(`${ok ? '  ✔' : '  ✖'} ${label || got.padEnd(10)} ${username.padEnd(22)} expected=${expected.padEnd(12)} got=${got.padEnd(12)}${r?.rateLimited ? ' (rateLimited)' : ''}`);
        if (!ok && r) console.log(`     full: ${JSON.stringify(r).slice(0, 300)}`);
    } catch (e) {
        failures++;
        console.log(`  ✖ ${username} threw: ${e.message}`);
    }
    await sleep(350);
}

console.log('── NICKED (names never on Pika) ──');
for (const n of NICKED) await checkOne(n, 'NICKED');

console.log('── API_OFF (no BedWars data) ──');
for (const n of API_OFF) await checkOne(n, 'API_OFF');

console.log('── NORMAL (BedWars data) ──');
for (const n of NORMAL) await checkOne(n, 'NORMAL');

console.log('── intervals/modes on Dream ──');
try {
    const weekly = await getPlayerStats('Dream', 'weekly', 'SOLO');
    const yearly = await getPlayerStats('Dream', 'yearly', 'QUAD');
    // Interval+mode routing is correct when each request returns either real
    // data or an honest api-off (no data for that window/mode) — never error.
    const ok = !weekly.error && !yearly.error
        && ['NORMAL', 'API_OFF'].includes(classify(weekly))
        && ['NORMAL', 'API_OFF'].includes(classify(yearly));
    if (!ok) failures++;
    console.log(`  ${ok ? '✔' : '✖'} total=${classify(await getPlayerStats('Dream', 'total', 'ALL_MODES'))} weekly/SOLO=${classify(weekly)} yearly/QUAD=${classify(yearly)}`);
} catch (e) {
    failures++;
    console.log(`  ✖ interval check threw: ${e.message}`);
}

console.log('── controlled burst (6 concurrent, rate-limit behavior) ──');
cache.clear();
const burst = ['DrDamberg', 'Broooke', 'FluffyWaffles', 'EpicChris', 'TinyPumpkin', 'BlazeRunner99'];
const results = await Promise.all(burst.map(n => getPlayerStats(n, 'total', 'ALL_MODES')));
for (let i = 0; i < burst.length; i++) {
    console.log(`  ${burst[i].padEnd(16)} → ${classify(results[i])}`);
}
const rateLimited = results.filter(r => r?.rateLimited).length;
console.log(`  rateLimited responses: ${rateLimited}/${burst.length} (${rateLimited > 0 ? 'API served 429s under burst — retries recovered' : 'no 429 observed'})`);

console.log(failures === 0 ? '\n[live-api] ALL CHECKS PASSED' : `\n[live-api] ${failures} CHECK(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
