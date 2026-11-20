/**
 * Task 0 of docs/plans/2026-11-watchlist-and-login-age.md: find out what the
 * `lastSeen` field of /api/profile/{name} means (last login or last logout).
 *
 * Polls one profile at a fixed interval and prints local time, raw lastSeen,
 * its ISO time, its age and whether it changed since the previous poll.
 * One request per interval (default 60 s), far under the 120/min budget.
 *
 * Usage: PIKA_API_KEY=<key> node scripts/last-seen-probe.mjs <name> [--every 60] [--minutes 20]
 * While it runs: stay offline 3 min, log in to Pika and stay 10 min, log out,
 * wait 3 min. Then read where the value jumped.
 */

const BASE_URL = 'https://stats.pika-network.net/api';

function readFlag(args, flag, fallback) {
    const at = args.indexOf(flag);
    if (at === -1) return fallback;
    const value = Number(args[at + 1]);
    if (!Number.isFinite(value) || value <= 0) {
        console.error(`${flag} needs a positive number`);
        process.exit(2);
    }
    return value;
}

function formatAge(ms) {
    if (ms < 0) return `in the future by ${Math.round(-ms / 1000)}s`;
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return `${Math.round(ms / 1000)}s`;
    if (minutes < 60) return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
    const hours = Math.floor(minutes / 60);
    return hours < 48 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

const args = process.argv.slice(2);
const name = args[0];
const key = process.env.PIKA_API_KEY;
if (!name || name.startsWith('--')) {
    console.error('Usage: PIKA_API_KEY=<key> node scripts/last-seen-probe.mjs <name> [--every 60] [--minutes 20]');
    process.exit(2);
}
if (!key) {
    console.error('PIKA_API_KEY is not set (run /apikey in-game to get one).');
    process.exit(2);
}
const everySec = readFlag(args, '--every', 60);
const totalMin = readFlag(args, '--minutes', 20);
const polls = Math.max(1, Math.floor((totalMin * 60) / everySec) + 1);

let previous;

async function pollOnce() {
    const now = Date.now();
    const time = new Date(now).toLocaleTimeString();
    try {
        const res = await fetch(`${BASE_URL}/profile/${encodeURIComponent(name)}`, {
            headers: { 'X-Api-Key': key },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            console.log(`${time}  HTTP ${res.status}`);
            return;
        }
        const body = await res.json();
        const lastSeen = body?.lastSeen;
        if (typeof lastSeen !== 'number' || !Number.isFinite(lastSeen)) {
            console.log(`${time}  lastSeen missing or not a number: ${JSON.stringify(lastSeen)}`);
            return;
        }
        const changed = previous !== undefined && lastSeen !== previous ? '  << CHANGED' : '';
        console.log(`${time}  raw=${lastSeen}  iso=${new Date(lastSeen).toISOString()}  age=${formatAge(now - lastSeen)}${changed}`);
        previous = lastSeen;
    } catch (err) {
        console.log(`${time}  request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

console.log(`Polling ${name} every ${everySec}s, ${polls} polls (about ${totalMin} min).`);
for (let i = 0; i < polls; i++) {
    await pollOnce();
    if (i < polls - 1) await new Promise((resolve) => setTimeout(resolve, everySec * 1000));
}
