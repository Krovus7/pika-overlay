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

## 3. Typecheck and unit tests — 2026-11-13 (Code-Verified)

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 218 tests, 43 suites, all passing |

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
passed) were run again on 2026-11-13 after the review fixes below.

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

## 6. Not verified — Gate B open

None of the following has been done; no claim about it is made anywhere in
the docs.

- A full live BedWars session: nick detection on real in-game names, party
  join/leave flow, rate budget in a full lobby, hotkeys (F4/F5), legibility
  over the real game and real texture packs.
- The packaged build and the installer (`npm run pack`).
- The in-app update from 4.1.0 to 5.0.0 (the last verified update cycle was
  4.0.2 → 4.1.0, recorded in `docs/RELEASING.md`).

## 7. Conclusion

Gate A: typecheck and tests green, parser replay without divergence, live API
classification and a live smoke run as above. Gate B remains with the owner in
game.
