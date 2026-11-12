/**
 * Live API check against stats.pika-network.net using the real v5 apiClient
 * (no mocks). Requires a key: PIKA_API_KEY=<key> (get it in-game with /apikey).
 *
 *   - NOT_FOUND:     names that never played on Pika (client says not_found;
 *                    "nicked" is decided by the lookup layer from the source)
 *   - NEVER_PLAYED:  public accounts with no BedWars data (entries null)
 *   - OK:            accounts with BedWars stats
 *   - no_data:       weekly/SOLO for a player with lifetime data but (hopefully)
 *                    no recent solo games — must never come back as api_off
 *   - PRIVATE:       result is printed, not asserted (depends on the account)
 *
 * Budget: ~20 requests total (the limit is 120/min per key).
 * Usage: PIKA_API_KEY=... node scripts/live-api-check.mjs   (network required)
 * Exit 0 = all classifications as expected.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getPlayerStats } = require('../dist/src/main/api/apiClient.js');
const { setApiKey } = require('../dist/src/main/api/apiSession.js');
const { getHealth } = require('../dist/src/main/api/health.js');

const key = process.env.PIKA_API_KEY;
if (!key) {
    console.error('PIKA_API_KEY is not set. Run /apikey in-game and pass it, e.g.:');
    console.error('  PIKA_API_KEY=<key> node scripts/live-api-check.mjs');
    process.exit(2);
}
setApiKey(key);

const NOT_FOUND = ['xXzRandomNick9182Xx', 'FakeTestNick99zz'];
const NEVER_PLAYED = ['Jeb_', 'Sky', 'Ace'];
const OK = ['Dream', 'Notch'];
const MAYBE_PRIVATE = ['Sam'];

let failures = 0;
const STATUS_OF_INTEREST = { not_found: 'not_found', never_played: 'never_played', ok: 'ok' };

async function expectStatus(username, expected, interval = 'total', mode = 'ALL_MODES') {
    try {
        const r = await getPlayerStats(username, interval, mode);
        const got = r?.status ?? 'null';
        const pass = got === expected;
        if (!pass) failures++;
        console.log(`${pass ? '  ok  ' : '  FAIL'} ${username.padEnd(22)} ${interval}/${mode}  expected=${expected} got=${got}`);
        if (!pass && r) console.log(`        full: ${JSON.stringify(r).slice(0, 300)}`);
    } catch (e) {
        failures++;
        console.log(`  FAIL ${username} threw: ${e.message}`);
    }
}

console.log('── not_found (names never on Pika) ──');
for (const n of NOT_FOUND) await expectStatus(n, STATUS_OF_INTEREST.not_found);

console.log('── never_played (public profile, no BedWars data) ──');
for (const n of NEVER_PLAYED) await expectStatus(n, STATUS_OF_INTEREST.never_played);

console.log('── ok (BedWars data) ──');
for (const n of OK) await expectStatus(n, STATUS_OF_INTEREST.ok);

console.log('── weekly/SOLO for a player with lifetime data → no_data, never api_off ──');
// Notch has lifetime data (checked above) and is very unlikely to have played
// SOLO this week. If he did, the result is ok and the check is inconclusive.
const weekly = await getPlayerStats('Notch', 'weekly', 'SOLO');
const weeklyStatus = weekly?.status ?? 'null';
if (weeklyStatus === 'no_data') {
    console.log('  ok   Notch weekly/SOLO → no_data');
} else if (weeklyStatus === 'ok') {
    console.log('  note Notch played SOLO this week → ok (check inconclusive, not a failure)');
} else {
    failures++;
    console.log(`  FAIL Notch weekly/SOLO → ${weeklyStatus} (expected no_data)`);
}

console.log('── possibly private account (printed, not asserted) ──');
for (const n of MAYBE_PRIVATE) {
    const r = await getPlayerStats(n, 'total', 'ALL_MODES');
    console.log(`  info ${n.padEnd(22)} → ${r?.status ?? 'null'}`);
}

const health = getHealth();
console.log(`\n── API health after run: ${JSON.stringify(health)}`);
console.log('── observed rate-limit budget (x-ratelimit-* on the last response) ──');
const probe = await fetch('https://stats.pika-network.net/api/profile/Notch', { headers: { 'X-Api-Key': key } });
for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']) {
    console.log(`  ${h}: ${probe.headers.get(h) ?? '(absent)'}`);
}

console.log(failures === 0 ? '\n[live-api] ALL CHECKS PASSED' : `\n[live-api] ${failures} CHECK(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
