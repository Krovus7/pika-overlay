const cache = require('./cache');

const BASE_URL = 'https://stats.pika-network.net/api';

// ─── Valid stat intervals ─────────────────────────────────────────────────────
const VALID_INTERVALS = ['total', 'weekly', 'monthly', 'yearly'];
const VALID_MODES     = ['ALL_MODES', 'SOLO', 'DOUBLES', 'QUAD'];

// ─── Rank display mapping ─────────────────────────────────────────────────────
const DONOR_RANKS = [
    ['TITAN',  '#ff5555'],
    ['LEGEND', '#ffaa00'],
    ['LORD',   '#55ffff'],
    ['MVP',    '#55ffff'],
    ['VIP',    '#55ff55'],
    ['PRO',    '#ff5555'],
    ['ULTRA',  '#ffff55'],
];

const STAFF_RANKS = [
    ['OWNER',    '#ff5555'],
    ['ADMIN',    '#ff5555'],
    ['MANAGER',  '#ff5555'],
    ['SR_MOD',   { text: 'Sr.Mod', color: '#00aa00' }],
    ['MOD',      '#00aa00'],
    ['JR_MOD',   { text: 'Jr.Mod', color: '#00aa00' }],
    ['HELPER',   '#5555ff'],
    ['BUILDER',  '#ffaa00'],
    ['YOUTUBER', { text: 'YT', color: '#ff5555' }],
    ['MEDIA',    '#ff5555'],
];

function getRankDisplay(profile) {
    if (!profile) return { text: '', color: '#aaaaaa' };

    const rawDisplay = profile.rank?.rankDisplay || '';
    for (const [tag, val] of DONOR_RANKS) {
        if (rawDisplay.includes(tag))
            return typeof val === 'string' ? { text: tag, color: val } : val;
    }

    // API returns ranks as [{name, displayName}] objects OR plain strings — handle both
    const rawRanks = profile.ranks || [];
    const rankNames = rawRanks.map(r => (typeof r === 'object' ? r.name : r)).filter(Boolean);
    for (const [id, val] of STAFF_RANKS) {
        if (rankNames.includes(id))
            return typeof val === 'string' ? { text: id, color: val } : val;
    }

    return { text: '', color: '#aaaaaa' };
}

// ─── Fetch with timeout ───────────────────────────────────────────────────────
function fetchWithTimeout(url, ms = 10_000) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
}

// ─── Fetch with exponential backoff retry ────────────────────────────────────
// Retries only on transient errors: 429 (rate limit), 503 (unavailable), AbortError (timeout).
// Returns the Response on success, or throws after all retries are exhausted.
async function fetchWithRetry(url, { maxRetries = 3, baseDelayMs = 600, timeoutMs = 10_000 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetchWithTimeout(url, timeoutMs);
            // Transient HTTP errors — back off and retry
            if (res.status === 429 || res.status === 503) {
                const retryAfterMs = parseInt(res.headers.get('retry-after') || '0', 10) * 1000;
                const delay = retryAfterMs || baseDelayMs * Math.pow(2, attempt);
                console.warn(`[PikaAPI] HTTP ${res.status} for ${url} — retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                if (attempt < maxRetries) {
                    await sleep(delay);
                    continue;
                }
                // All retries exhausted — return the last failing Response so callers can inspect
                return res;
            }
            return res; // 200, 404, 500, etc. — return as-is
        } catch (err) {
            lastErr = err;
            const isAbort = err.name === 'AbortError';
            if (isAbort && attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                console.warn(`[PikaAPI] Timeout for ${url} — retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                await sleep(delay);
            } else {
                throw err; // non-transient error or out of retries
            }
        }
    }
    throw lastErr;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Safe JSON parser ─────────────────────────────────────────────────────────
async function safeJson(res) {
    if (!res.ok) return null;
    const text = await res.text();
    if (!text?.trim()) return null;
    try { return JSON.parse(text); } catch { return null; }
}

// ─── Main stats fetcher ───────────────────────────────────────────────────────
// interval: 'total' | 'weekly' | 'monthly' | 'yearly'  (default: 'total')
// mode:     'ALL_MODES' | 'SOLO' | 'DOUBLES' | 'QUAD'  (default: 'ALL_MODES')
async function getPlayerStats(username, interval = 'total', mode = 'ALL_MODES') {
    if (!username?.trim()) return null;

    const uname    = username.trim();
    const ivl      = VALID_INTERVALS.includes(interval) ? interval : 'total';
    const modeKey  = VALID_MODES.includes(mode) ? mode : 'ALL_MODES';
    const cacheKey = `${uname}:${ivl}:${modeKey}`;

    const cached = cache.getStats(cacheKey);
    if (cached) return cached;

    try {
        // 1) Profile — rank, level, clan/guild
        const profileRes = await fetchWithRetry(`${BASE_URL}/profile/${encodeURIComponent(uname)}`);

        // 404 = player name does not exist on Pika at all → nicked
        if (profileRes.status === 404) return { username: uname, notFound: true, nicked: true };

        // 429/503 still failing after retries = API is overloaded, treat as transient error
        if (profileRes.status === 429 || profileRes.status === 503) {
            console.warn(`[PikaAPI] Rate-limited for profile ${uname} — returning error (not notFound)`);
            return { username: uname, error: true, rateLimited: true };
        }

        const profile       = await safeJson(profileRes);
        if (!profile) {
            // Unexpected empty/invalid response body — transient, not a permanent notFound
            return { username: uname, error: true };
        }

        const exactUsername = profile?.username || uname;
        const guild         = profile?.clan?.name || null;
        const rankInfo      = getRankDisplay(profile);
        const level         = profile?.rank?.level ?? null;

        // 2) BedWars leaderboard stats with chosen interval and mode
        const statsUrl = `${BASE_URL}/profile/${encodeURIComponent(exactUsername)}/leaderboard` +
                         `?type=bedwars&interval=${ivl}&mode=${modeKey}`;
        const statsRes = await fetchWithRetry(statsUrl);

        // 429/503 on leaderboard = rate limited — transient error, not notFound
        if (statsRes.status === 429 || statsRes.status === 503) {
            console.warn(`[PikaAPI] Rate-limited for leaderboard ${exactUsername} — returning error (not notFound)`);
            return { username: exactUsername, error: true, rateLimited: true };
        }

        const rawStats = await safeJson(statsRes);

        // ── Nicked vs API-off detection ──────────────────────────────────────
        // Check whether the profile shows any general Pika activity (exp, level,
        // game-mode ranks, friends).  A real player who turned off their API will
        // still have general activity;  a nicked player's borrowed name usually
        // has zero activity because it belongs to someone who never played Pika.
        const _exp        = profile?.rank?.experience ?? 0;
        const _lvl        = profile?.rank?.level ?? 0;
        const _gameRanks  = (profile?.ranks || []).length;
        const _friends    = (profile?.friends || []).length;
        const _hasClan    = !!profile?.clan;
        const hasGeneralActivity = _exp > 0 || _lvl > 1 || _gameRanks > 0 || _friends > 0 || _hasClan;

        // null stats but valid profile = no BedWars data at all
        if (!rawStats) {
            if (hasGeneralActivity) {
                return { username: exactUsername, notFound: true, nicked: false, apiOff: true };
            }
            return { username: exactUsername, notFound: true, nicked: true, apiOff: false };
        }

        // Helper — extract integer from leaderboard entry
        const stat = key => {
            const e = rawStats[key];
            if (!e?.entries?.length) return 0;
            return parseInt(e.entries[0].value, 10) || 0;
        };

        const finalKills    = stat('Final kills');
        const finalDeaths   = stat('Final deaths');
        const wins          = stat('Wins');
        const losses        = stat('Losses');
        const kills         = stat('Kills');
        const deaths        = stat('Deaths');
        const bedsDestroyed = stat('Beds destroyed');
        const winstreak     = stat('Highest winstreak reached');
        const gamesPlayed   = stat('Games played');
        const bowKills      = stat('Bow kills');     // confirmed key from API
        const meleeKills    = stat('Melee kills');
        const voidKills     = stat('Void kills');
        const arrowsShot    = stat('Arrows shot');
        const arrowsHit     = stat('Arrows hit');

        // All BedWars entries are null → treat same as no stats
        const allEntriesNull = Object.values(rawStats).every(v => !v?.entries?.length);
        if (allEntriesNull) {
            if (hasGeneralActivity) {
                return { username: exactUsername, notFound: true, nicked: false, apiOff: true };
            }
            return { username: exactUsername, notFound: true, nicked: true, apiOff: false };
        }

        const fkdr = finalDeaths === 0 ? finalKills : finalKills / finalDeaths;
        const wlr  = losses      === 0 ? wins       : wins / losses;
        const kdr  = deaths      === 0 ? kills      : kills / deaths;

        const result = {
            username: exactUsername,
            notFound: false,
            nicked: false,
            apiOff: false,
            rank: rankInfo,
            level,
            guild,
            finalKills,
            finalDeaths,
            fkdr:         Math.round(fkdr * 100) / 100,
            wins,
            losses,
            wlr:          Math.round(wlr * 100) / 100,
            kills,
            deaths,
            kdr:          Math.round(kdr * 100) / 100,
            bedsDestroyed,
            winstreak,
            gamesPlayed,
            bowKills,
            meleeKills,
            voidKills,
            arrowsShot,
            arrowsHit,
        };

        cache.setStats(cacheKey, result);
        return result;

    } catch (err) {
        console.error(`[PikaAPI] Error for ${uname}:`, err.message);
        return { username: uname, error: true };
    }
}

module.exports = { getPlayerStats, VALID_MODES };
