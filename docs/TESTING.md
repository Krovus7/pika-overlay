# TESTING.md

Framework: `node:test` (built-in, zero deps — ADR-0006). Tests are
TypeScript, compiled by `tsc` into `dist/tests/`.

```
npm test          # build + node --test "dist/tests/*.test.js"
npm run typecheck # tsc main + tsc renderer + tsc preload (noEmit)
```

Last run (2026-11-20, branch `feat/watchlist-login-age`): `npm test` → 340 tests, 80 suites, 340 pass, 0 fail.

## Automated suites (`tests/`)

| Suite | Tests | Covers |
|---|---|---|
| `log-parser.test.ts` | 94 | 17 sections ported from v3 plus the Pika match-start line (the countdown is not a start): lobby noise, pre-game join/quit, final kills, bed breaks, kill feed, team tags, tab roster, game lifecycle, `cleanName`, MOTD false positives, `getRankDisplay`, party tracking, BLC / ✦ `/p info` formats, "not in a party" reset. Non-regression contract for the parser. |
| `api.test.ts` | 29 | `getPlayerStats` with a mocked fetch: key handling (`X-Api-Key`, no key → `auth` without a request), every row of the decision table, ratios and zero-division guards, caching and de-duplication of concurrent requests |
| `decision.test.ts` | 11 | the pure decision table (`decidePlayerResult`, `decideFromTotal`) |
| `rate-limiter.test.ts` | 17 | `RateLimiter` with an injected clock (budget, reset, 429 pause, `reset()`, header parsing), `HealthTracker` precedence, cache TTLs, `testApiKey` mapping |
| `lookup.test.ts` | 20 | `applySource` (nicked vs not_found by source), `LookupService` (events, dedupe, refresh keeps source, race guards, `refreshAll`, retry flows), `AutoRetry` (delays, cap, rate-limit wait, eligibility) |
| `state.test.ts` | 16 | `PlayerRegistry` (case keys, sources, `setSource`, `clearExcept`), `PartyState`, `GameState` (match start/end, eliminations), `LookupQueue` (concurrency bound, priority, `dropPending`, worker errors) |
| `config.test.ts` | 31 | defaults, clamps, enums, v5 keys (`apiKey`, `uiScale`, `rowDensity`, `theme`, …), column merge (`tags` inserted after `player` in an old order and compact set), `loginAge*`, `freshMinutes`, `watchlistOnTop`, `watchlistSound`, v3 legacy migration, file store, `.bak`, corrupt file |
| `log-watcher.test.ts` | 4 | partial-line handling: split lines, split multi-byte characters, trailing fragment, rotated file |
| `watcher-bindings.test.ts` | 15 | log event → table rules (ADR-0012) on the real bindings, queue, registry, party and game state: match start keeps the roster, a roster in a match adds missing players but not eliminated ones, lobby change, party pinned and relabelled, fresh own row and party at every lobby, events in the same batch of lines (join + quit, detection + lobby change, detection + roster) |
| `fresh-lookups.test.ts` | 5 | `ApiCache.forget`; `LookupService` fresh lookups: cache skipped, quiet in-place refresh, a failed quiet refresh leaves the row |
| `fit.test.ts` | 5 | `fitColumns` (`renderer/ts/table/fit.ts`): everything fits, rightmost dropped first, Player never dropped, exact fit |
| `windowBounds.test.ts` | 14 | `scaleBounds` (ratio, clamping, no drift), `overlayMinSize`, `placeBeside` (right / left / centered / vertical clamp), `isInsideAny` |
| `tags-column.test.ts` | 8 | Tags column: chip order, titles, escaping, signature; status rows keep the tags cell before the pill (identical across column sets); colspan |
| `login-age.test.ts` | 11 | `profileInfo.lastSeen` validation, `formatAge` / `loginAgeView` boundaries (level threshold, fresh threshold, off / low level / all, null), row signature changes when only the age chip changes |
| `watchlist-format.test.ts` | 14 | names, kinds, note cleaning, HTML in notes stays text after `esc()`, size and count caps, duplicates, text format with comments and bare names, JSON with wrong `format` / `version` rejected, BOM |
| `watchlist-store.test.ts` | 14 | own entry beats imported, removing a list removes only its entries, re-import with the same label replaces, corrupt file → backup + empty, atomic write, failed writes leave memory unchanged, nick links |
| `watchlist-table.test.ts` | 11 | resolved view, watch chip and row class, sorting with `watchlistOnTop`, alerts (once per lobby, excluded sources), linked nicks ignored by lookup |
| `watchlist-actions.test.ts` | 7 | row menu content (`buildMenuSpec`): marks keep the note, imported source line, nick link submenu, `&` escaped |
| `watchlist-settings-text.test.ts` | 6 | pure Watchlist-tab helpers: search, dates, preview lines, nick link labels, `noteNeedsSave` |
| `review-fixes.test.ts` | 8 | regressions from the v5 review: late 401 of a replaced key, re-arming a key after a passing test, timeout covering the response body, manual clear (party kept, backlog dropped), API-key redaction in debug log lines, config written through a temp file |

`tests/apiMock.ts` is the shared helper (fetch mock that records calls,
canned payloads, clean API session). The renderer and the Electron main
process (windows, hotkeys, IPC registration) have no unit tests; they are
covered by the scripts below. The Tags column, the age timer, the watchlist
menu, the alert delivery and the Watchlist tab DOM have no unit test beyond
their pure parts (typecheck, smoke and screenshots only).

## Scripts (not part of `npm test`)

| Script | Needs | Purpose |
|---|---|---|
| `node scripts/smoke.mjs [exe] [cwd]` | built app (`npm run build`), `PIKA_API_KEY` for live steps, optional `SMOKE_PLAYER` (default Dream) | CDP smoke test of the dev app (or an installed one): bridge, settings window (a second page target), key entry through Settings → API in that window, dropdown, live lookups of a known and a made-up name, period switch, watchlist (sniper chip through IPC, text export → remove → import → chip back as an imported one, list removal), clear, compact toggle. Screenshots in `artifacts/screens/v5-live-*.png`. The watchlist steps use the real `%APPDATA%\pika-overlay\watchlist.json` (userData cannot be redirected): the script backs the file up first and restores it on every exit path. The native export/import file dialogs cannot be driven over CDP, so that round trip uses the text format. Exit 0 = all steps passed. |
| `node scripts/live-api-check.mjs` | `PIKA_API_KEY`, network, `dist/` built | real client against the real API; asserts the classification of unknown names, never-played, ok and empty-period lookups; ~20 requests |
| `node scripts/replay-logs.mjs [file…] [--username NAME]` | local log corpus (`artifacts/corpus-v3/`, Badlion logs, not in git) | runs real logs through `LineParser` and the frozen v3 parser `scripts/reference/v3-logWatcher.js`; reports violations and divergences; exit 1 on divergence |
| `PIKA_SHOTS=1 npm start` | built app | screenshot driver (`src/main/devShots.ts`, `devShotsSettings.ts`; the settings shots capture the settings window): demo rows through `window.__pikaDemo*` (`renderer/ts/demo/`), no network, no log watcher, config and watchlist never written; the demo adds login ages (one fresh, two older, the rest none; shown in the demo only, the real default stays off) and watchlist chips (own sniper, own cheater, imported other); PNGs in `artifacts/screens/`, including the Settings → Watchlist tab (`v5-20-settings-watchlist*.png`, dark and light) |
| `PIKA_REPLAY=<log> npm start` | built app | replay driver (`src/main/replay.ts`): feeds the overlay from a real log |
| `node scripts/simulate-session.mjs [file…] [--actions] [--seed N] [--self-test] [--verbose]` | `dist/` built, local log corpus (`artifacts/corpus-v3/`, `artifacts/logs/`, not in git) | headless session simulator (`scripts/sim/`): replays real logs with their real timing in virtual time through the real `LogWatcher`, bindings, queue, `LookupService`, API client and the renderer's table store (`renderer/ts/core/playerStore.ts`) against a seeded fake API with injected faults; an independent oracle says who should be in the table. Checks: registry vs table, membership, immediate removal, match start keeps the table, no spectators back, party pinned, stuck loading, classification, never refused by the rate limit, unexpected errors, source stability. `--actions` adds seeded user actions (period/mode switch, clear, manual lookup, retry, refresh button). `--self-test` breaks the wiring in three ways and requires the checks to notice. Report in `artifacts/sim/report.md`; exit 1 on any violation |
| `node scripts/replay-live.mjs <log> [--speed N] [--max-gap S] [--from LINE] [--to LINE] [--tag NAME]` | built app, a saved API key, network | feeds a real log, line by line with scaled timing, to the real Electron app through its real log watcher and the live API; samples the DOM over CDP (`scripts/lib/cdp.mjs`) and fails on a stuck loading row, an `auth` row or a page error; screenshots at match start/end in `artifacts/screens/` |
| `node scripts/update-check.mjs <exe> <cwd>` / `update-cycle.mjs <exe> <cwd> <installDir> [version]` | installed app | Updates tab and full update cycle against the live feed; handles v4, the 5.0.x inline panel and the 5.1 settings window |
| `npm run icon` | Electron | regenerates `assets/icon.png` and `assets/icon.ico` from the SVGs |

The scripts read the key only from `PIKA_API_KEY`; never commit a key.
If `ELECTRON_RUN_AS_NODE=1` is set globally, unset it before launching the
app or the smoke test.

## Contract rules for contributors

1. Never change parser semantics without the ported suite green.
2. Mock the fetch (or pass `retryOptions`); never hit the real API in tests.
3. New behavior → new test in the matching suite; config schema changes →
   migration tests with the legacy shapes.
4. A mock that fakes the real behavior is not coverage (R7).

## Gates

- **Code-Verified:** `npm run typecheck` + `npm test` green, plus the scripts
  above run offline or against the live API.
- **Field-Verified:** a real BedWars session on the real game (checklist in
  `docs/VERIFICATION-2026-11.md`, "Not verified"). The two must never be
  conflated (R5).
