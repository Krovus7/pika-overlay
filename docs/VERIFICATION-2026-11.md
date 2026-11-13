# VERIFICATION-2026-11

Verification record of Pika Overlay v5.0.0 (`package.json`). Observations were
made by the lead engineer on the dates shown; this document records them and
does not repeat them. **Gate A (Code-Verified) is complete. Gate B
(Field-Verified) is open.** Previous record: `docs/VERIFICATION-2026-09.md`
(v4.0.2).

## 1. Live API check — 2026-11-12 (Code-Verified)

`scripts/live-api-check.mjs` run against the real API with a real personal key
(read from `PIKA_API_KEY`): all checks passed. The observed API behavior is the
table "Verified facts" in `docs/API-CLIENT.md`; the status classification
derived from it is the table "Classification" in the same file and in
`docs/adr/0010-status-model-and-api-key.md`.

## 2. Parser replay on real logs — 2026-11-12 (Code-Verified)

`scripts/replay-logs.mjs` over the local corpus (56 real log files, not in
git): 0 anti-false-positive violations, 0 divergences between the current
parser and the frozen v3 reference parser (`scripts/reference/v3-logWatcher.js`).

Run again on 2026-11-13 after the match-start change (section 5c): 56 files,
0 violations, 0 divergences. The one intended difference from v3 is reported
separately: 174 `Goodluck with your BedWars Game` lines are now a match start
(`pikaMatchStarts`); v3 and v4 never recognised a Pika match start.

## 3. Typecheck and unit tests — 2026-11-13 (Code-Verified)

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 242 tests, 50 suites, all passing |

Suites and what they cover: `docs/TESTING.md`.

## 4. Screenshot review — 2026-11-13 (Code-Verified)

`PIKA_SHOTS=1` run (`src/main/devShots.ts`, demo rows, no network): 48
screenshots reviewed by eye. Covered states:

- both themes (dark, light), base and dense rows;
- API health banners;
- period/mode dropdown, compact layout, narrow window;
- opacity ladder 100 / 50 / 20 / 5 %;
- low opacity over a bright and a dark synthetic backdrop, for both themes;
- every Settings tab;
- empty states.

The backdrops are synthetic gradients (`renderer/ts/demo/backdrops.ts`), not
the game. Mechanism under review: `docs/adr/0011-themes-and-legibility.md`.

## 5. Smoke test against the live API — 2026-11-13 (Code-Verified)

`scripts/smoke.mjs` against the dev build and the live API: 16/16 steps.

| Run | Observation |
|---|---|
| 1 | health `key_missing` at start; key entered through Settings → API → Save key; health became `ok` |
| 2 | key persisted across restart (health `ok` at start) |
| steps | a known player resolved with stats (lifetime); the same player on Weekly showed `no_data` ("NO GAMES"), not API OFF; a typed unknown name showed `not_found`, not NICKED; clear and compact toggle worked |

Both `scripts/smoke.mjs` (16/16) and `scripts/live-api-check.mjs` (all checks
passed) were run again on 2026-11-13 after the review fixes below, and the
smoke test once more (16/16) after the changes of section 5c.

## 5b. Independent review — 2026-11-13

A fresh reviewer that had not written the code screened the whole v4 → v5 diff
(first D10 round). Findings confirmed in code and fixed, each with a regression
test in `tests/review-fixes.test.ts` unless noted:

| Finding | Fix |
|---|---|
| Raw log lines in the Debug tab could show the API key (`/apikey` answers in chat) | `src/main/log/redact.ts` |
| Clear hotkey emptied the registry, party included, unlike the clear button | one shared `src/main/ipc/clearPlayers.ts`; it also drops queued lookups of removed players |
| A late 401 for a replaced key blocked the new key until restart | `src/main/api/fetch.ts` flags only the key the request was sent with; a passing key test re-arms the key in use |
| Request timeout did not cover the response body | `fetchWithTimeout` reads the body under the same timeout |
| Queued lookup of a player who quit brought the row back | `watcherBindings.ts` drops it on `player_quit` (no dedicated test) |
| Config written in place (truncated file on a crash) | temp file + rename in `config.ts` |
| IPC handlers trusted argument types | type checks in `ipc/handlers.ts` (no dedicated test) |
| Row of a member who left the party stayed in the table (found while documenting) | `renderer/ts/core/players.ts` removes every row main asks for (renderer has no unit tests; not yet seen in a live party) |

The second D10 round (a fresh top-tier reviewer) was not run as a separate
agent: the lead engineer verified each finding and fix. Reported but left as
is: the rate gate can overshoot by the few requests in flight when a window
resets (covered by its reserve).

## 5c. Session simulation on real logs — 2026-11-13 (Code-Verified)

The owner asked for a detailed simulation on the saved logs in place of a
live session. Tools and what they run: `docs/TESTING.md` (scripts table).

**Headless simulator** (`scripts/simulate-session.mjs`), 55 real logs,
420,947 lines, 64 hours of virtual time, 196 match starts, 3,568 player names:

| Run | Result |
|---|---|
| `--self-test` | 3/3 deliberately broken wirings detected, control run clean |
| pure replay, seed 1 | 0 violations in 11 checks; 9,313 fake-API requests, 0 refused (429) |
| `--actions`, seeds 1 and 7 | 0 violations; 16,551 requests with seed 1, 0 refused |

Figures of the pure run: detection → resolved row p50 0.8 s, p95 3.8 s, max
39 s (injected hung requests); 99.8 % of rows resolved at match start; 28
hung and 38 failed requests injected, every affected row recovered or ended
as an error row.

**Live replay in the real app** (`scripts/replay-live.mjs`, real Electron
window, real log watcher, live API, speed ×10):

| Log | Result |
|---|---|
| `2026-07-31-1` (11,595 lines, 9 matches, party of 4) | all checks passed; 111 players shown; no stuck loading, no `auth` row, no page error; badge Idle → In queue → In game for every match |
| `2026-03-11-3` lines 3000–7000 (5 matches) | all checks passed; 90 players shown, 2 nicked, 1 API off |

Screenshots of both replays were reviewed by eye (table at match start and
after the match, party rows pinned, NICKED and API OFF rows).

Defects found by this work and fixed, each with tests:

| Defect | Fix |
|---|---|
| A Pika match start was never detected (the parser knew only other servers' lines): the status never showed "In game" | `RE_GAME_START_PIKA` in `src/main/log/patterns.ts`; the table follows the lobby, not the match start (`docs/adr/0012-table-follows-the-lobby.md`) |
| A player who joined and quit, or was followed by a lobby change or a roster, within one batch of log lines kept a row (93 episodes in the corpus) | the queue starts a job inside `enqueue` (`src/main/state/lookupQueue.ts`) |
| A player already shown who joined the party kept the label of how they were first seen | `PlayerRegistry.setSource`, `src/main/watcherBindings.ts` |

Limits of this evidence: the fake API's ground truth is seeded, not Pika's;
the simulator puts all lines with the same timestamp second into one batch;
the live replays looked up names from old logs against today's API, so a
NICKED row there can be a renamed account. The changes after the first D10
round (sections 5b) were not screened by a separate reviewer.

## 5d. Packaged build — 2026-11-13 (Code-Verified)

`npm run pack` completed: `release/pika-overlay-win-Setup.exe`,
`pika-overlay-win-Portable.zip`, `pika-overlay-5.0.0-full.nupkg` and the feed
files (unsigned, as before). `scripts/smoke.mjs` against the packaged
`release/win-unpacked/PikaOverlay.exe` and the live API: 16/16.

Not run: the installer itself and the portable zip. The machine used keeps an
installed 4.1.0 for the update-cycle check, which needs a published 5.0.0.

## 6. Not verified — Gate B open

None of the following has been done; no claim about it is made anywhere in
the docs.

- A full live BedWars session. The log replays above cover the log → table
  path; they do not cover hotkeys (F4/F5), legibility over the real game and
  real texture packs, the overlay staying on top of the game window, or the
  chat format of Pika today (the newest Pika match in the corpus is from
  August 2026).
- The installer (`Setup.exe`) on a clean machine and the portable zip.
- The in-app update from 4.1.0 to 5.0.0 (the last verified update cycle was
  4.0.2 → 4.1.0, recorded in `docs/RELEASING.md`).

## 7. Conclusion

Gate A: typecheck and tests green, parser replay without divergence, live API
classification, a live smoke run, the session simulation and two live replays
as above. Gate B remains with the owner in
game.
