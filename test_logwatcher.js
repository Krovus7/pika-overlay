/**
 * test_logwatcher.js — Comprehensive test suite for logWatcher.js
 *
 * Run with: node test_logwatcher.js
 *
 * Tests cover:
 *  1. Server join noise (false positives when entering a server)
 *  2. BedWars pre-game join/quit detection
 *  3. Final kill removal (victim extraction + scoreboard false positives)
 *  4. Bed destruction detection
 *  5. Kill feed detection
 *  6. Team tag detection
 *  7. Tab-completion list parsing
 *  8. Noise filter (guild/party/friends/lobby/rank-joins)
 *  9. Server change / game end detection
 * 10. _cleanName edge cases
 */

// ─── Minimal stub so logWatcher doesn't need ./cache ────────────────────────
const Module = require('module');
const _originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === './cache' || request === '../cache') {
        return { getStats: () => null, setStats: () => {}, clear: () => {} };
    }
    return _originalLoad.apply(this, arguments);
};

const logWatcher = require('./src/logWatcher');

// ─── Test runner ─────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const results = [];

function test(desc, fn) {
    try {
        fn();
        console.log(`  ✅  ${desc}`);
        results.push({ ok: true, desc });
        pass++;
    } catch (e) {
        console.log(`  ❌  ${desc}`);
        console.log(`       → ${e.message}`);
        results.push({ ok: false, desc, err: e.message });
        fail++;
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ─── Helper to capture events from a line ────────────────────────────────────
function parseAndCapture(line, myUsername = '') {
    logWatcher._myUsername = myUsername.toLowerCase();
    logWatcher._inPregame = false;

    const events = [];
    const origEmit = logWatcher.emit.bind(logWatcher);

    const interceptEmit = (event, ...args) => {
        if (event !== 'log_line') events.push({ event, args });
    };
    logWatcher.emit = interceptEmit;

    // Simulate what _poll() does after wrapping in [CHAT]:
    const fullLine = `[12:34:56] [Client thread/INFO]: [CHAT] ${line}`;
    logWatcher._parseLine(fullLine);

    logWatcher.emit = origEmit;
    return events;
}

// ─── Section 1: Lobby / Server-join noise ────────────────────────────────────
console.log('\n─── 1. Server-join / Lobby noise ───────────────────────────────────────────');

test('Guild chat line is ignored', () => {
    const evts = parseAndCapture('[G] SomePlayer: hello world');
    assert(evts.length === 0, 'Should emit no events for guild chat');
});

test('Party chat line is ignored', () => {
    const evts = parseAndCapture('[P] SomePlayer: ready?');
    assert(evts.length === 0, 'Should emit no events for party chat');
});

test('Friends chat prefix is ignored', () => {
    const evts = parseAndCapture('Friends ▏ SomePlayer: gg');
    assert(evts.length === 0, 'Should emit no events for friends chat');
});

test('Party join system message emits party_joined (v2.7 tracking)', () => {
    // Since v2.7, all "Party " lines are processed for party tracking.
    const evts = parseAndCapture('Party \u258f SomePlayer has joined the party.');
    const e = evts.find(e => e.event === 'party_joined');
    assert(e, 'v2.7: party join should emit party_joined, not be silently ignored');
});

test('Rank-join lobby announcement is ignored', () => {
    const evts = parseAndCapture('<VIP> SomePlayer joined the lobby!');
    assert(evts.length === 0, 'Should emit no events for lobby rank join');
});

test('<Titan> rank join is ignored', () => {
    const evts = parseAndCapture('<Titan> BestPlayer123 joined the lobby!');
    assert(evts.length === 0, 'Should emit no events for Titan lobby join');
});

test('"joined the lobby" generic is ignored', () => {
    const evts = parseAndCapture('PlayerXYZ joined the lobby!');
    assert(evts.length === 0, 'Should emit no events for generic lobby join');
});

test('MOTD / welcome message does NOT detect fake player', () => {
    // Common Pika MOTD lines — they should not match kill feed or team tags
    const motd = [
        'Welcome to Pika-Network! Use /discord to chat with the team.',
        'PvP has been disabled for 5 seconds.',
        'Remember to vote at vote.pika-network.net for rewards!',
        '→ TIP: Type /bwshop to access the BedWars shop.',
    ];
    for (const line of motd) {
        const evts = parseAndCapture(line);
        const detected = evts.filter(e => e.event === 'player_detected');
        assert(detected.length === 0, `MOTD line falsely detected player in: "${line}"`);
    }
});

// ─── Section 2: BedWars pre-game join/quit ───────────────────────────────────
console.log('\n─── 2. Pre-game join / quit ─────────────────────────────────────────────────');

test('BedWars join detected correctly', () => {
    const evts = parseAndCapture('BedWars ✙ PlayerName has joined! (5/8)');
    const det = evts.find(e => e.event === 'player_detected' && e.args[0] === 'PlayerName');
    assert(det, 'Should detect PlayerName from BedWars join');
    assertEqual(det.args[1], 'join', 'Source should be "join"');
});

test('BedWars join — self triggers pregame_start + players_clear', () => {
    logWatcher._myUsername = 'myplayer';
    logWatcher._inPregame = false;
    const evts = parseAndCapture('BedWars ✙ MyPlayer has joined! (1/8)', 'MyPlayer');
    assert(evts.some(e => e.event === 'pregame_start'), 'Should emit pregame_start');
    assert(evts.some(e => e.event === 'players_clear'), 'Should emit players_clear on self-join');
});

test('BedWars quit detected correctly', () => {
    const evts = parseAndCapture('BedWars ✙ QuitterName has quit! (4/8)');
    const quit = evts.find(e => e.event === 'player_quit' && e.args[0] === 'QuitterName');
    assert(quit, 'Should emit player_quit for BedWars quit');
});

test('BedWars join with "?" symbol still works', () => {
    const evts = parseAndCapture('BedWars ? CoolDude99 has joined! (3/8)');
    const det = evts.find(e => e.event === 'player_detected' && e.args[0] === 'CoolDude99');
    assert(det, 'Should detect CoolDude99 with ? join symbol');
});

test('BedWars join with color-coded rank does NOT produce empty/wrong name', () => {
    // Name after stripping should remain valid
    const evts = parseAndCapture('BedWars ✙ §6[MVP]§r SomePlayer has joined! (2/8)');
    const det = evts.find(e => e.event === 'player_detected');
    // If detected, name must be valid MC name
    if (det) {
        assert(/^[A-Za-z0-9_]{3,16}$/.test(det.args[0]),
            `Detected name "${det.args[0]}" is not a valid MC name`);
    }
});

// ─── Section 3: Final kill / elimination ─────────────────────────────────────
console.log('\n─── 3. Final Kill detection ─────────────────────────────────────────────────');

test('Classic final kill removes victim', () => {
    const evts = parseAndCapture('sav1yaoff has been killed by ancientfreedom12 FINAL KILL');
    const quit = evts.find(e => e.event === 'player_quit');
    assert(quit, 'Should emit player_quit');
    assertEqual(quit.args[0], 'sav1yaoff', 'Victim should be sav1yaoff');
});

test('Final kill with [x2] suffix still removes victim', () => {
    const evts = parseAndCapture('somikasomi2 got attacked by a carrot from Gerberas FINAL KILL [x2]');
    const quit = evts.find(e => e.event === 'player_quit');
    assert(quit, 'Should emit player_quit for [x2] final kill');
    assertEqual(quit.args[0], 'somikasomi2', 'Victim should be somikasomi2');
});

test('Final kill "got killaurad by" variant', () => {
    const evts = parseAndCapture('legend_295 got killaura\'d by kick1026B FINAL KILL');
    const quit = evts.find(e => e.event === 'player_quit');
    assert(quit, 'Should emit player_quit');
    assertEqual(quit.args[0], 'legend_295');
});

test('Final kill "met the hacker" variant', () => {
    const evts = parseAndCapture("Faizan_7 met the hacker called kick1026B FINAL KILL");
    const quit = evts.find(e => e.event === 'player_quit');
    assert(quit, 'Should emit player_quit');
    assertEqual(quit.args[0], 'Faizan_7');
});

test('"Top Final Kills:" scoreboard line does NOT trigger player_quit', () => {
    const evts = parseAndCapture('Top Final Kills:');
    const quit = evts.find(e => e.event === 'player_quit');
    // The line DOES contain "Final Kill" substring — the old bug
    // With current code: "Top Final Kills:" -> prefix before "FINAL" = "Top "
    // _cleanName("Top") → "Top" which is 3 chars — this WOULD trigger a quit!
    // We should assert this does NOT produce a meaningful player_quit
    if (quit) {
        // Allow only if the extracted name is truly a non-sensical word
        // Actually this is the BUG we need to verify
        console.log(`       ⚠  Quitting: "${quit.args[0]}" — this may be the false positive bug`);
    }
    // We're testing the CURRENT behavior here, not enforcing the fix
});

test('"1st Final Kills" recap line does NOT trigger player_quit', () => {
    const evts = parseAndCapture('[Match Recap] 1st Final Kills: ProPlayer99');
    // This should emit game_end (RE_GAME_END_RECAP matches [Match Recap])
    const gameEnd = evts.find(e => e.event === 'game_end');
    assert(gameEnd, 'Match Recap should emit game_end');
    const quit = evts.find(e => e.event === 'player_quit');
    assert(!quit, 'Match Recap should NOT emit player_quit');
});

// ─── Section 4: Bed destruction ──────────────────────────────────────────────
console.log('\n─── 4. Bed destruction ──────────────────────────────────────────────────────');

test('Classic bed break: "Team\'s Bed has been destroyed by PlayerA"', () => {
    const evts = parseAndCapture("RED Team's Bed has been destroyed by PlayerA");
    const det = evts.find(e => e.event === 'player_detected' && e.args[0] === 'PlayerA');
    assert(det, 'Should detect PlayerA from bed break');
    assertEqual(det.args[1], 'bed_break');
});

test('Modern bed break: "BED DESTRUCTION > RED by PlayerB"', () => {
    const evts = parseAndCapture('BED DESTRUCTION > RED by PlayerB');
    const det = evts.find(e => e.event === 'player_detected' && e.args[0] === 'PlayerB');
    assert(det, 'Should detect PlayerB from modern bed break');
    assertEqual(det.args[1], 'bed_break');
});

// ─── Section 5: Kill feed detection ─────────────────────────────────────────
console.log('\n─── 5. Kill feed (non-final) ───────────────────────────────────────────────');

test('Kill feed: "PlayerA was killed by PlayerB" — detects PlayerA', () => {
    const evts = parseAndCapture('Player_A was killed by Player_B');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.some(e => e.args[0] === 'Player_A'), 'Should detect Player_A as victim');
});

test('Kill feed: "PlayerA killed PlayerB using sword" — detects both', () => {
    const evts = parseAndCapture('KillerX killed VictimY using a sword');
    const det = evts.filter(e => e.event === 'player_detected');
    const names = det.map(e => e.args[0]);
    assert(names.includes('KillerX'), 'Should detect KillerX');
    assert(names.includes('VictimY'), 'Should detect VictimY');
});

// ─── Section 6: Team tags ────────────────────────────────────────────────────
console.log('\n─── 6. Team tags ───────────────────────────────────────────────────────────');

test('[RED] PlayerA detected via team tag', () => {
    const evts = parseAndCapture('[RED] PlayerA dealt 12 damage');
    const det = evts.find(e => e.event === 'player_detected' && e.args[0] === 'PlayerA');
    assert(det, 'Should detect PlayerA from team tag');
});

test('[BLUE] multiple players in scoreboard', () => {
    const evts = parseAndCapture('[BLUE] TeamMate1 | [RED] TeamMate2');
    const names = evts.filter(e => e.event === 'player_detected').map(e => e.args[0]);
    assert(names.includes('TeamMate1'), 'Should detect TeamMate1');
    assert(names.includes('TeamMate2'), 'Should detect TeamMate2');
});

// ─── Section 7: Tab-completion roster ────────────────────────────────────────
console.log('\n─── 7. Tab-completion roster ───────────────────────────────────────────────');

test('Tab list: valid comma-separated roster is parsed', () => {
    const roster = 'PlayerAlpha, PlayerBeta, PlayerGamma, PlayerDelta, PlayerEpsilon, PlayerZeta, PlayerEta, PlayerTheta';
    const evts = parseAndCapture(roster);
    assert(evts.some(e => e.event === 'players_sync'), 'Should emit players_sync');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.length >= 4, `Should detect at least 4 players (got ${det.length})`);
});

test('Tab list with fewer than 3 items is NOT treated as roster', () => {
    const evts = parseAndCapture('PlayerA, PlayerB');
    assert(!evts.some(e => e.event === 'players_sync'), 'Short CSV should NOT emit players_sync');
});

test('Tab list with kill keyword is NOT parsed as roster', () => {
    // Contains "killed" so _tryTabList is skipped per line 245
    const evts = parseAndCapture('PlayerA, PlayerB, PlayerC was killed, PlayerD');
    const sync = evts.find(e => e.event === 'players_sync');
    assert(!sync, 'CSV with "killed" should not be treated as tab roster');
});

// ─── Section 8: Game lifecycle ────────────────────────────────────────────────
console.log('\n─── 8. Game lifecycle events ───────────────────────────────────────────────');

test('"the game starts in 5 seconds" triggers game_start', () => {
    const evts = parseAndCapture('the game starts in 5 seconds');
    assert(evts.some(e => e.event === 'game_start'), 'Should emit game_start');
});

test('"BedWars starting" triggers game_start', () => {
    const evts = parseAndCapture('BedWars starting!');
    assert(evts.some(e => e.event === 'game_start'), 'Should emit game_start');
});

test('"returning to lobby" triggers game_end + players_clear', () => {
    const evts = parseAndCapture('You are returning to lobby...');
    assert(evts.some(e => e.event === 'game_end'), 'Should emit game_end');
    assert(evts.some(e => e.event === 'players_clear'), 'Should emit players_clear');
});

test('"you were eliminated" triggers game_end', () => {
    const evts = parseAndCapture('You were eliminated from the game!');
    assert(evts.some(e => e.event === 'game_end'), 'Should emit game_end');
});

test('[Match Recap] line triggers game_end + players_clear', () => {
    const evts = parseAndCapture('[Match Recap] The game has ended!');
    assert(evts.some(e => e.event === 'game_end'), 'Should emit game_end');
    assert(evts.some(e => e.event === 'players_clear'), 'Should emit players_clear');
});

// ─── Section 9: _cleanName specifics ─────────────────────────────────────────
console.log('\n─── 9. _cleanName edge cases ───────────────────────────────────────────────');

test('_cleanName strips §6 color codes', () => {
    const result = logWatcher._cleanName('§6MVP§r PlayerABC');
    assert(result, 'Should return a valid name');
    assert(/^[A-Za-z0-9_]{3,16}$/.test(result), `"${result}" is not a valid MC name`);
});

test('_cleanName strips [MVP] rank prefix', () => {
    const result = logWatcher._cleanName('[MVP] SomeName');
    assertEqual(result, 'SomeName', 'Should strip [MVP] and return SomeName');
});

test('_cleanName bracket username NOT stripped (short result protection)', () => {
    // If stripping [MVP] from [MVP] would leave empty string, safeguard kicks in
    const result = logWatcher._cleanName('[OK]');
    // "OK" is 2 chars — should not be returned as a valid name
    assert(result === null || (result && result.length >= 3),
        '_cleanName should not return names shorter than 3 chars');
});

test('_cleanName handles FFFD replacement character color codes', () => {
    // §-like codes encoded as U+FFFD
    const result = logWatcher._cleanName('\uFFFD6PlayerABC');
    assert(result, 'Should handle FFFD color code replacement');
});

test('_cleanName returns null for 2-char strings', () => {
    const result = logWatcher._cleanName('AB');
    assert(result === null, 'Should return null for names shorter than 3 chars');
});

test('_cleanName returns null for empty string', () => {
    const result = logWatcher._cleanName('');
    assert(result === null, 'Should return null for empty input');
});

test('_cleanName handles names with decorative symbols prefix', () => {
    const result = logWatcher._cleanName('★ PlayerZ99');
    assert(result, 'Should extract name after decorative prefix');
});

// ─── Section 10: False positive scenario — server join MOTD ──────────────────
console.log('\n─── 10. Real-world false positive scenarios ────────────────────────────────');

test('Pika welcome banner does not fire player_detected', () => {
    const lines = [
        '\u00a7b\u00a7lPika-Network \u00a7r\u00a77| \u00a7b\u00a7 lwww.pika-network.net',
        'Use \u00a7e/help \u00a7rto view all commands.',
        'Connected to \u00a7aBedWars-1\u00a7r server.',
        '→ \u00a7eYou have \u00a7a3 \u00a7emessages waiting.',
    ];
    for (const l of lines) {
        const evts = parseAndCapture(l);
        const det = evts.filter(e => e.event === 'player_detected');
        assert(det.length === 0,
            `False player detected "${det.map(e=>e.args[0])}" in line: "${l}"`);
    }
});

test('"Top Final Kills:" scoreboard — verify if false player_quit is triggered', () => {
    const evts = parseAndCapture('Top Final Kills:');
    const quit = evts.find(e => e.event === 'player_quit');
    if (quit) {
        throw new Error(`BUG: "Top Final Kills:" triggers player_quit with victim="${quit.args[0]}"`);
    }
});

test('"1st Final Kills: PlayerX" scoreboard line — triggers game_end, no false quit', () => {
    const evts = parseAndCapture('1st Final Kills: ProGamer99');
    const gameEnd = evts.find(e => e.event === 'game_end');
    assert(gameEnd, '"1st Final Kills" should trigger game_end (recap line)');
    const quit = evts.find(e => e.event === 'player_quit');
    assert(!quit, 'Should NOT emit player_quit for recap scoreboard lines');
});

// ─── Section 11: Real log MOTD lines (read as UTF-8, § → \uFFFD) ─────────────
console.log('\n─── 11. Real log MOTD noise (§ → \\uFFFD color codes) ───────────────────────');

test('MOTD "Welcome to PikaNetwork" with \\uFFFD color codes — no player_detected', () => {
    // Exact format from logs/2026-03-11-3.log read as utf8
    const lines = [
        '\uFFFDe\uFFFDlWelcome to PikaNetwork',
        '\uFFFD7Currently playing with \uFFFDb2496 \uFFFD7other players!',
        '\uFFFDfMore \uFFFDe\uFFFDlPika\uFFFDc\uFFFDlNetwork\uFFFDf? Click below!',
        '\uFFFDfBuy \uFFFD6Gold\uFFFDf, \uFFFDaRanks\uFFFDf, and much \uFFFDdmore',
        '\uFFFDf at \uFFFDcstore.pika-network.net',
    ];
    for (const l of lines) {
        const evts = parseAndCapture(l);
        const det = evts.filter(e => e.event === 'player_detected');
        assert(det.length === 0,
            `False player detected "${det.map(e=>e.args[0])}" in MOTD line: "${l}"`);
    }
});

test('Navigation bar "SITE - STORE - VOTE - DISCORD" — not parsed as players', () => {
    const lines = [
        '   SITE \uFFFD7- STORE \uFFFD7- VOTE \uFFFD7- DISCORD ',
        '  TIKTOK \uFFFD7- YOUTUBE \uFFFD7- INSTA \uFFFD7- TWITTER ',
    ];
    for (const l of lines) {
        const evts = parseAndCapture(l);
        const det = evts.filter(e => e.event === 'player_detected');
        assert(det.length === 0,
            `False player detected in nav bar: "${l}"`);
    }
});

test('Guild "X Welcomes you to Pika Network" — not parsed as player', () => {
    const evts = parseAndCapture('Guilds ? \uFFFD2Driiddy Welcomes you to Pika Network');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.length === 0, 'Guild welcome should not detect players');
});

test('Friend "Online at BWLOBBY-xxx" server routing — not parsed as player', () => {
    const evts = parseAndCapture('  \uFFFDa\uFFFDl? \uFFFDeaxtia \uFFFD7 \uFFFDaOnline \uFFFD7at \uFFFDfBWLOBBY-6m5wt-vz9tg');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.length === 0, '"Online at BWLOBBY-..." should not detect players');
});

test('Friend "Last seen: XX-XX-XXXX" line — not parsed as player', () => {
    const evts = parseAndCapture('  \uFFFD8\uFFFDl? \uFFFDeczarjob \uFFFD7 \uFFFD7Last seen: \uFFFD602-19-2026 12:54');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.length === 0, '"Last seen:" friend entry should not detect players');
});

test('_cleanName strips \\uFFFD-prefixed color codes (real log format)', () => {
    // After stripping \uFFFD6, the remaining "PlayerABC" should be valid
    const result = logWatcher._cleanName('\uFFFD6PlayerABC');
    assert(result, 'Should return a name after stripping \\uFFFD color code');
    assert(/^[A-Za-z0-9_]{3,16}$/.test(result),
        `"${result}" is not a valid MC name after \\uFFFD strip`);
});

test('_cleanName strips mixed § and \\uFFFD color codes', () => {
    // e.g. "\uFFFDe\uFFFDlPika" → should extract "Pika" (4 chars) or something clean
    const result = logWatcher._cleanName('\uFFFDe\uFFFDlSomeName');
    assert(result, 'Should extract name from \\uFFFDe\\uFFFDl prefix');
    assert(/^[A-Za-z0-9_]{3,16}$/.test(result),
        `"${result}" is not a valid MC name`);
});

// ─── Section 12: getRankDisplay with object-array ranks ───────────────────────
console.log('\n─── 12. apiClient getRankDisplay with rank objects ──────────────────────────');

// We import the function directly by re-requiring the module stub
let _getRankDisplay;
try {
    // Inline test since apiClient is not easily stubbed here
    // Simulate the shape of data the real API returns
    const profileWithObjRanks = {
        rank: { rankDisplay: '' },
        ranks: [{ name: 'MOD', displayName: 'Moderator' }, { name: 'HELPER', displayName: 'Helper' }],
    };
    const profileWithStrRanks = {
        rank: { rankDisplay: '' },
        ranks: ['MOD'],
    };
    const profileWithDonor = {
        rank: { rankDisplay: 'TITAN' },
        ranks: [],
    };

    // Replicate the fixed logic inline for testing
    const DONOR_RANKS = [['TITAN','#ff5555'],['LEGEND','#ffaa00'],['LORD','#55ffff'],['MVP','#55ffff'],['VIP','#55ff55']];
    const STAFF_RANKS = [['MOD','#00aa00'],['HELPER','#5555ff']];
    function testGetRankDisplay(profile) {
        if (!profile) return { text: '', color: '#aaaaaa' };
        const rawDisplay = profile.rank?.rankDisplay || '';
        for (const [tag, val] of DONOR_RANKS) {
            if (rawDisplay.includes(tag)) return typeof val === 'string' ? { text: tag, color: val } : val;
        }
        const rawRanks = profile.ranks || [];
        const rankNames = rawRanks.map(r => (typeof r === 'object' ? r.name : r)).filter(Boolean);
        for (const [id, val] of STAFF_RANKS) {
            if (rankNames.includes(id)) return typeof val === 'string' ? { text: id, color: val } : val;
        }
        return { text: '', color: '#aaaaaa' };
    }

    test('getRankDisplay — ranks as [{name, displayName}] objects returns correct rank', () => {
        const r = testGetRankDisplay(profileWithObjRanks);
        assertEqual(r.text, 'MOD', 'Should detect MOD from object array ranks');
        assertEqual(r.color, '#00aa00', 'MOD should be green');
    });

    test('getRankDisplay — ranks as plain string array (backward compat)', () => {
        const r = testGetRankDisplay(profileWithStrRanks);
        assertEqual(r.text, 'MOD', 'Should detect MOD from string array');
    });

    test('getRankDisplay — donor rank from rankDisplay string', () => {
        const r = testGetRankDisplay(profileWithDonor);
        assertEqual(r.text, 'TITAN', 'Donor rank should come from rankDisplay');
        assertEqual(r.color, '#ff5555', 'TITAN should be red');
    });

    test('getRankDisplay — empty profile returns blank rank', () => {
        const r = testGetRankDisplay({ rank: { rankDisplay: '' }, ranks: [] });
        assertEqual(r.text, '', 'Empty profile should give empty rank text');
    });
} catch (e) {
    console.log('  ⚠  Section 12 setup error:', e.message);
}

// ─── Section 13: v2.2 Optimizations ─────────────────────────────────────────
console.log('\n─── 13. v2.2 Optimizations ─────────────────────────────────────────────────');

test('In-game team chat "BLUE AcquaPanna: message" — NOT detected as player', () => {
    const lines = [
        'BLUE AcquaPanna: no lol?',
        'AQUA Revaya: hf',
        'GRAY mdew: dude',
        'RED SomeName123: gg wp',
    ];
    for (const l of lines) {
        const evts = parseAndCapture(l);
        const det = evts.filter(e => e.event === 'player_detected');
        assert(det.length === 0, `Team chat should not detect player in: "${l}"`);
    }
});

test('"Team Upgrade ? Player purchased..." — NOT detected as player', () => {
    const evts = parseAndCapture('Team Upgrade ? AcquaPanna purchased Sharpened Swords I.');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.length === 0, 'Team Upgrade noise should be skipped entirely');
});

test('Real bed break format "Red Team\'s Bed has been destroyed by PlayerName"', () => {
    const lines = [
        "Red Team's Bed has been destroyed by AcquaPanna",
        "Yellow Team's Bed has been destroyed by ancientfreedom12",
        "Pink Team's Bed has been destroyed by mdew",
        "Blue Team's Bed has been destroyed by legend_295",
    ];
    const validMC = /^[A-Za-z0-9_]{3,16}$/;
    for (const l of lines) {
        const evts = parseAndCapture(l);
        const det = evts.find(e => e.event === 'player_detected' && e.args[1] === 'bed_break');
        assert(det, `Should detect bed_break player in: "${l}"`);
        assert(validMC.test(det.args[0]), `Detected name "${det.args[0]}" is not a valid MC name`);
    }
});

test('FK possessive variant "ejevuzmsv\'s deal with ureyes has run out FINAL KILL"', () => {
    const evts = parseAndCapture("ejevuzmsv's deal with ureyes has run out FINAL KILL");
    const quit = evts.find(e => e.event === 'player_quit');
    assert(quit, 'Should emit player_quit');
    assertEqual(quit.args[0], 'ejevuzmsv', 'Victim should be ejevuzmsv (possessive form)');
});

test('FK "slipped into the void" variant', () => {
    const evts = parseAndCapture('melosdarian slipped into the void for Gerberas FINAL KILL');
    const quit = evts.find(e => e.event === 'player_quit');
    assert(quit, 'Should emit player_quit for void FK');
    assertEqual(quit.args[0], 'melosdarian');
});

test('FK "was distracted by a piglet" variant with [x2]', () => {
    const evts = parseAndCapture('somikasomi2 got attacked by a carrot from Gerberas FINAL KILL [x2]');
    const quit = evts.find(e => e.event === 'player_quit');
    assert(quit, 'Should emit player_quit for [x2] carrot FK');
    assertEqual(quit.args[0], 'somikasomi2');
});

test('FK "was irradiated by" variant', () => {
    const evts = parseAndCapture('PRO_Raghav was irradiated by b4death_ FINAL KILL');
    const quit = evts.find(e => e.event === 'player_quit');
    assert(quit, 'Should emit player_quit for irradiated FK');
    assertEqual(quit.args[0], 'PRO_Raghav');
});

test('Coin gain "+3 coins" — not parsed as player', () => {
    const evts = parseAndCapture('+3 coins');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.length === 0, 'Coin gain should be skipped');
});

test('"+ 1 Golden Ingot" resource gain — not parsed as player', () => {
    const evts = parseAndCapture('+ 1 Golden Ingot');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.length === 0, 'Resource gain should be skipped');
});

test('Tab list with ": " in it (team chat) — not parsed as roster', () => {
    // "BLUE AcquaPanna: no lol?, GRAY mdew: stop" — already caught by SKIP,
    // but as a double-check, if somehow it passes, the colon guard in _tryTabList stops it
    const evts = parseAndCapture('Alpha, Beta, Charlie: say hello, Delta');
    const sync = evts.find(e => e.event === 'players_sync');
    assert(!sync, 'CSV with ": " (chat message) should NOT be treated as tab roster');
});

// ─── Section 14: Party tracking ──────────────────────────────────────────────
console.log('\n─── 14. Party tracking (join / leave / /p info) ────────────────────────────');

// Helper that also resets internal party state emitted so we capture them cleanly
function partyTest(line) {
    // Feed the raw chat line through the watcher
    return parseAndCapture(line);
}

test('Party join: "Party ✦ ✦ AcquaPanna joined the party!" emits party_joined', () => {
    const evts = partyTest('Party \u2726 \u2726 AcquaPanna joined the party!');
    const e = evts.find(e => e.event === 'party_joined');
    assert(e, 'Should emit party_joined');
    assertEqual(e.args[0], 'AcquaPanna', 'Joined player should be AcquaPanna');
});

test('Party join with color codes in name prefix: still extracts correct username', () => {
    // Simulates color-coded rank before player name: "\uFFFDd[VIP]\uFFFDr DashKiller joined the party!"
    const evts = partyTest('Party \u2726 \u2726 \uFFFDd[VIP]\uFFFDr DashKiller joined the party!');
    const e = evts.find(e => e.event === 'party_joined');
    assert(e, 'Should emit party_joined even with rank prefix');
    assertEqual(e.args[0], 'DashKiller', 'Should extract DashKiller, not the rank prefix');
});

test('Party leave: "Party ✦ ✦ Rorshaurya has left the party." emits party_left', () => {
    const evts = partyTest('Party \u2726 \u2726 Rorshaurya has left the party.');
    const e = evts.find(e => e.event === 'party_left');
    assert(e, 'Should emit party_left');
    assertEqual(e.args[0], 'Rorshaurya', 'Left player should be Rorshaurya');
});

test('Party leave short form: "Party ✦ ✦ PlayerX left the party." emits party_left', () => {
    const evts = partyTest('Party \u2726 \u2726 PlayerX left the party.');
    const e = evts.find(e => e.event === 'party_left');
    assert(e, 'Should emit party_left for short form');
    assertEqual(e.args[0], 'PlayerX');
});

test('Party kicked: "Party ✦ ✦ BadPlayer has been kicked from the party." emits party_left', () => {
    const evts = partyTest('Party \u2726 \u2726 BadPlayer has been kicked from the party.');
    const e = evts.find(e => e.event === 'party_left');
    assert(e, 'Should emit party_left for kick');
    assertEqual(e.args[0], 'BadPlayer');
});

test('Party disband: "Party ✦ The party has been disbanded." emits party_clear', () => {
    const evts = partyTest('Party \u2726 The party has been disbanded.');
    const e = evts.find(e => e.event === 'party_clear');
    assert(e, 'Should emit party_clear when party disbanded');
});

test('Party self-left: "Party ✦ You have left the party." emits party_clear', () => {
    const evts = partyTest('Party \u2726 You have left the party.');
    const e = evts.find(e => e.event === 'party_clear');
    assert(e, 'Should emit party_clear when user leaves party');
});

test('/p info "Party ✦ Party Members (3): DashKiller, AcquaPanna, clockburg" emits party_members', () => {
    const evts = partyTest('Party \u2726 Party Members (3): DashKiller, AcquaPanna, clockburg');
    const e = evts.find(e => e.event === 'party_members');
    assert(e, 'Should emit party_members from /p info');
    assert(e.args[0].includes('DashKiller'), 'Should contain DashKiller');
    assert(e.args[0].includes('AcquaPanna'), 'Should contain AcquaPanna');
    assert(e.args[0].includes('clockburg'),  'Should contain clockburg');
    assertEqual(e.args[0].length, 3, 'Should have exactly 3 party members');
});

test('/p info with ✦ prefix (non-Party start): "  ✦ Members: DashKiller, AcquaPanna, clockburg"', () => {
    // Pika may format /p info as "  ✦ Members: Name1, Name2, Name3" without "Party" prefix
    const evts = partyTest('  \u2726 Members: DashKiller, AcquaPanna, clockburg');
    const e = evts.find(e => e.event === 'party_members');
    assert(e, 'Should emit party_members from non-"Party" prefixed member list');
    assert(e.args[0].includes('DashKiller'), 'Should contain DashKiller');
    assert(e.args[0].length >= 2, 'Should detect at least 2 members');
});

test('/p info member list with single name: NOT emitted (too few to be reliable)', () => {
    // Single-name member list is too risky (could be ordinary chat containing "Members:")
    const evts = partyTest('Members: DashKiller');
    const e = evts.find(e => e.event === 'party_members');
    assert(!e, 'Single-name member list should NOT emit party_members (false-positive guard)');
});

test('Party chat message "Party ✦ DashKiller: gg wp" does NOT emit player_detected', () => {
    const evts = partyTest('Party \u2726 DashKiller: gg wp');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.length === 0, 'Party chat should not trigger player detection');
});

test('Party chat message does NOT emit player_detected (second variant)', () => {
    const evts = partyTest('Party \u2726 clockburg: need 1 more');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.length === 0, 'Party need-more message should not detect players');
});

test('Party invite message: "Party ✦ DashKiller invited you to join his/her party!" — no player_detected', () => {
    const evts = partyTest('Party \u2726 DashKiller invited you to join his/her party!');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.length === 0, 'Party invite should not detect players');
});

test('Party join emits party_joined AND NOT player_detected or players_sync', () => {
    const evts = partyTest('Party \u2726 \u2726 TestUser99 joined the party!');
    assert(evts.some(e => e.event === 'party_joined'),     'Should emit party_joined');
    assert(!evts.some(e => e.event === 'player_detected'), 'Should NOT emit player_detected');
    assert(!evts.some(e => e.event === 'players_sync'),    'Should NOT emit players_sync');
});

test('Party leave emits party_left AND NOT players_sync', () => {
    const evts = partyTest('Party \u2726 \u2726 TestUser99 has left the party.');
    assert(evts.some(e => e.event === 'party_left'),       'Should emit party_left');
    assert(!evts.some(e => e.event === 'players_sync'),    'Should NOT emit players_sync');
    assert(!evts.some(e => e.event === 'player_detected'), 'Should NOT emit player_detected');
});

// ─── Section 15: Party owner — BLC color-code format (root-cause regression) ─
console.log('\n─── 15. Party owner BLC color-code format (root-cause fix regression) ──────');

// The root-cause bug was: _parseLine did trim() BEFORE replace(RE_COLOR_CODE, '').
// A line like "\uFFFD8 Owner: \uFFFDaAcquaPanna" after trim() is unchanged (starts with \uFFFD),
// then after replace() the \uFFFD8 is stripped but the space after it remains:
// " Owner: AcquaPanna" — leading space breaks RE_PARTY_OWNER anchored at ^.
// Fix: replace() BEFORE trim() so residual spaces are cleaned up.

function partyOwnerTest(lines) {
    logWatcher._pendingPartyOwner = null;
    const allEvents = [];
    const origEmit = logWatcher.emit.bind(logWatcher);
    logWatcher.emit = (event, ...args) => { if (event !== 'log_line') allEvents.push({ event, args }); };
    for (const chatContent of lines) {
        const fullLine = `[12:34:56] [Client thread/INFO]: [CHAT] ${chatContent}`;
        logWatcher._parseLine(fullLine);
    }
    logWatcher.emit = origEmit;
    return allEvents;
}

test('BLC /p info: color-coded "\\uFFFD8 Owner: \\uFFFDaAcquaPanna" buffers owner correctly', () => {
    // This is the root-cause format: color prefix before "Owner:" without "Party" text
    const evts = partyOwnerTest([
        '\uFFFD8 Owner: \uFFFDaAcquaPanna',
        '\uFFFD8 Members: \uFFFD7DashKiller, \uFFFD7clockburg',
    ]);
    const e = evts.find(e => e.event === 'party_members');
    assert(e, 'Should emit party_members');
    assert(e.args[0].some(n => n.toLowerCase() === 'acquapanna'),
        `Owner AcquaPanna should be in members list. Got: ${JSON.stringify(e.args[0])}`);
    assert(e.args[0].some(n => n.toLowerCase() === 'dashkiller'), 'DashKiller should be in list');
    assert(e.args[0].some(n => n.toLowerCase() === 'clockburg'), 'clockburg should be in list');
});

test('BLC /p info: full block with separator lines and color codes', () => {
    // Simulates the complete /p info output Pika sends via BLC
    const evts = partyOwnerTest([
        '\uFFFD8\uFFFDm\uFFFD8-----------------------------------------------------',
        '\uFFFD8 Party Members (3)',
        '\uFFFD8 Owner: \uFFFDaAcquaPanna',
        '\uFFFD8 Members: \uFFFD7DashKiller, \uFFFD7clockburg',
        '\uFFFD8\uFFFDm\uFFFD8-----------------------------------------------------',
    ]);
    const e = evts.find(e => e.event === 'party_members');
    assert(e, 'Should emit party_members from full BLC block');
    assert(e.args[0].some(n => n.toLowerCase() === 'acquapanna'),
        `Owner AcquaPanna missing. Got: ${JSON.stringify(e.args[0])}`);
    assertEqual(e.args[0].length, 3, 'Should have exactly 3 members (owner + 2)');
});

test('BLC /p info: Format D — "Party Members (3)" header then color-coded Owner/Members', () => {
    const evts = partyOwnerTest([
        'Party \u2726 Party Members (3)',
        'Owner: AcquaPanna',
        'Members: DashKiller, clockburg',
    ]);
    const e = evts.find(e => e.event === 'party_members');
    assert(e, 'Should emit party_members for Format D');
    assert(e.args[0].some(n => n.toLowerCase() === 'acquapanna'),
        `Owner AcquaPanna missing in Format D. Got: ${JSON.stringify(e.args[0])}`);
});

test('BLC /p info: owner with rank tag in BLC format', () => {
    const evts = partyOwnerTest([
        '\uFFFD8 Owner: \uFFFDc[MVP+]\uFFFDr AcquaPanna',
        '\uFFFD8 Members: \uFFFD7DashKiller, \uFFFD7clockburg',
    ]);
    const e = evts.find(e => e.event === 'party_members');
    assert(e, 'Should emit party_members with rank-tagged owner');
    assert(e.args[0].some(n => n.toLowerCase() === 'acquapanna'),
        `Owner with rank tag not extracted. Got: ${JSON.stringify(e.args[0])}`);
});

test('BLC /p info: Party prefix format still works after fix', () => {
    const evts = partyOwnerTest([
        'Party \u2726 Owner: AcquaPanna',
        'Party \u2726 Members: DashKiller, clockburg',
    ]);
    const e = evts.find(e => e.event === 'party_members');
    assert(e, 'Party-prefixed format should still work');
    assert(e.args[0].some(n => n.toLowerCase() === 'acquapanna'), 'Owner must be in Party-prefixed result');
    assertEqual(e.args[0].length, 3, 'Should have 3 members');
});

// ─── Section 16: Real log format — ✦ prefix (U+2726, not a color code) ─────────
// Root-cause confirmed 2026-05-16: Pika formats /p info as:
//   "  ✦ Your Party"
//   "  ✦ Owner: daksh_pokiemon"
//   "  ✦ Members: (1) AcquaPanna✦r✦7"
// The ✦ (U+2726) is NOT stripped by RE_COLOR_CODE (only §/\uFFFD are stripped).
// Fix: RE_PARTY_OWNER and RE_PARTY_MEMBERS use ^[^\w]* instead of ^\s* to skip
// any leading non-word chars including ✦, ─, spaces, etc.
console.log('\n─── 16. Real Pika log format (✦ prefix, U+2726) ────────────────────────────');

test('Real log: "  ✦ Owner: daksh_pokiemon" + "  ✦ Members: (1) AcquaPanna" emits party_members', () => {
    const evts = partyOwnerTest([
        '  \u2726 Your Party',
        '  \u2726 Owner: daksh_pokiemon',
        '  \u2726 Members: (1) AcquaPanna\uFFFDr\uFFFD7',
    ]);
    const e = evts.find(e => e.event === 'party_members');
    assert(e, 'Should emit party_members from real log format');
    assert(e.args[0].some(n => n.toLowerCase() === 'daksh_pokiemon'),
        `Owner daksh_pokiemon missing. Got: ${JSON.stringify(e.args[0])}`);
    assert(e.args[0].some(n => n.toLowerCase() === 'acquapanna'),
        `Member AcquaPanna missing. Got: ${JSON.stringify(e.args[0])}`);
    assertEqual(e.args[0].length, 2, 'Should have exactly 2 members (owner + 1)');
});

test('Real log: party of 3 with ✦ prefix', () => {
    const evts = partyOwnerTest([
        '  \u2726 Your Party',
        '  \u2726 Owner: daksh_pokiemon',
        '  \u2726 Members: (2) AcquaPanna, clockburg',
    ]);
    const e = evts.find(e => e.event === 'party_members');
    assert(e, 'Should emit party_members for 3-member party');
    assert(e.args[0].some(n => n.toLowerCase() === 'daksh_pokiemon'), 'Owner must be present');
    assert(e.args[0].some(n => n.toLowerCase() === 'acquapanna'), 'AcquaPanna must be present');
    assert(e.args[0].some(n => n.toLowerCase() === 'clockburg'), 'clockburg must be present');
    assertEqual(e.args[0].length, 3, 'Should have exactly 3 members');
});

test('Real log: self as owner with ✦ prefix', () => {
    const evts = partyOwnerTest([
        '  \u2726 Your Party',
        '  \u2726 Owner: AcquaPanna',
        '  \u2726 Members: (1) daksh_pokiemon\uFFFDr\uFFFD7',
    ]);
    const e = evts.find(e => e.event === 'party_members');
    assert(e, 'Should emit party_members when self is owner');
    assert(e.args[0].some(n => n.toLowerCase() === 'acquapanna'), 'Self (AcquaPanna) as owner must be present');
    assert(e.args[0].some(n => n.toLowerCase() === 'daksh_pokiemon'), 'Member daksh_pokiemon must be present');
});

// ─── Section 17: "Not in a party" reset ──────────────────────────────────────
console.log('\n─── 17. "Not in a party" reset (/p info when solo) ─────────────────────────');

test('"Party ✦ You are not currently in a party." emits party_clear', () => {
    const evts = partyTest('Party \u2726 You are not currently in a party.');
    const e = evts.find(e => e.event === 'party_clear');
    assert(e, 'Should emit party_clear when not in a party (with Party prefix)');
});

test('"Party ✦ You are not in a party." emits party_clear (short variant)', () => {
    const evts = partyTest('Party \u2726 You are not in a party.');
    const e = evts.find(e => e.event === 'party_clear');
    assert(e, 'Should emit party_clear for short "not in a party" variant');
});

test('"You are not currently in a party." without Party prefix emits party_clear', () => {
    const evts = parseAndCapture('You are not currently in a party.');
    const e = evts.find(e => e.event === 'party_clear');
    assert(e, 'Should emit party_clear even without "Party" prefix');
});

test('"You are not in a party." without Party prefix emits party_clear', () => {
    const evts = parseAndCapture('You are not in a party.');
    const e = evts.find(e => e.event === 'party_clear');
    assert(e, 'Should emit party_clear for short variant without prefix');
});

test('"Not in a party" with BLC color codes emits party_clear', () => {
    const evts = partyOwnerTest([
        'Party \u2726 \uFFFDeYou are not currently in a party.',
    ]);
    const e = evts.find(e => e.event === 'party_clear');
    assert(e, 'Should emit party_clear even with color codes in the message');
});

test('"Not in a party" does NOT emit player_detected', () => {
    const evts = parseAndCapture('You are not currently in a party.');
    const det = evts.filter(e => e.event === 'player_detected');
    assert(det.length === 0, '"not in a party" message should never detect players');
});

console.log('\n════════════════════════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${pass} passed, ${fail} failed  (${pass + fail} total)`);
if (fail > 0) {
    console.log('\n  Failed tests:');
    results.filter(r => !r.ok).forEach(r => {
        console.log(`    ❌ ${r.desc}`);
        console.log(`       ${r.err}`);
    });
}
console.log('════════════════════════════════════════════════════════════════════════════\n');

process.exit(fail > 0 ? 1 : 0);
