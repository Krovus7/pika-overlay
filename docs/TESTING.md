# TESTING.md

Framework: `node:test` (built-in, zero deps — ADR-0006). Tests are
TypeScript, compiled by `tsc` into `dist/tests/`.

```
npm test          # build + node --test "dist/tests/*.test.js"
npm run typecheck # tsc main + tsc renderer + tsc preload (noEmit)
```

Last run (2026-11-13): `npm test` → 218 tests, 43 suites, 218 pass, 0 fail.

## Automated suites (`tests/`)

| Suite | Tests | Covers |
|---|---|---|
| `log-parser.test.ts` | 92 | 17 sections ported from v3: lobby noise, pre-game join/quit, final kills, bed breaks, kill feed, team tags, tab roster, game lifecycle, `cleanName`, MOTD false positives, `getRankDisplay`, party tracking, BLC / ✦ `/p info` formats, "not in a party" reset. Non-regression contract for the parser. |
| `api.test.ts` | 29 | `getPlayerStats` with a mocked fetch: key handling (`X-Api-Key`, no key → `auth` without a request), every row of the decision table, ratios and zero-division guards, caching and de-duplication of concurrent requests |
| `decision.test.ts` | 11 | the pure decision table (`decidePlayerResult`, `decideFromTotal`) |
| `rate-limiter.test.ts` | 17 | `RateLimiter` with an injected clock (budget, reset, 429 pause, `reset()`, header parsing), `HealthTracker` precedence, cache TTLs, `testApiKey` mapping |
| `lookup.test.ts` | 20 | `applySource` (nicked vs not_found by source), `LookupService` (events, dedupe, refresh keeps source, race guards, `refreshAll`, retry flows), `AutoRetry` (delays, cap, rate-limit wait, eligibility) |
| `state.test.ts` | 14 | `PlayerRegistry` (case keys, sources, `clearExcept`), `PartyState`, `GameState`, `LookupQueue` (concurrency bound, priority, `dropPending`, worker errors) |
| `config.test.ts` | 23 | defaults, clamps, enums, v5 keys (`apiKey`, `uiScale`, `rowDensity`, `theme`, …), column merge, v3 legacy migration, file store, `.bak`, corrupt file |
| `log-watcher.test.ts` | 4 | partial-line handling: split lines, split multi-byte characters, trailing fragment, rotated file |
| `review-fixes.test.ts` | 8 | regressions from the v5 review: late 401 of a replaced key, re-arming a key after a passing test, timeout covering the response body, manual clear (party kept, backlog dropped), API-key redaction in debug log lines, config written through a temp file |

`tests/apiMock.ts` is the shared helper (fetch mock that records calls,
canned payloads, clean API session). The renderer and the Electron main
process (windows, hotkeys, IPC registration) have no unit tests; they are
covered by the scripts below.

## Scripts (not part of `npm test`)

| Script | Needs | Purpose |
|---|---|---|
| `node scripts/smoke.mjs [exe] [cwd]` | built app (`npm run build`), `PIKA_API_KEY` for live steps, optional `SMOKE_PLAYER` (default Dream) | CDP smoke test of the dev app (or an installed one): bridge, settings, key entry through Settings → API, dropdown, live lookups of a known and a made-up name, period switch, clear, compact toggle. Screenshots in `artifacts/screens/v5-live-*.png`. Exit 0 = all steps passed. |
| `node scripts/live-api-check.mjs` | `PIKA_API_KEY`, network, `dist/` built | real client against the real API; asserts the classification of unknown names, never-played, ok and empty-period lookups; ~20 requests |
| `node scripts/replay-logs.mjs [file…] [--username NAME]` | local log corpus (`artifacts/corpus-v3/`, Badlion logs, not in git) | runs real logs through `LineParser` and the frozen v3 parser `scripts/reference/v3-logWatcher.js`; reports violations and divergences; exit 1 on divergence |
| `PIKA_SHOTS=1 npm start` | built app | screenshot driver (`src/main/devShots.ts`, `devShotsSettings.ts`): demo rows through `window.__pikaDemo*` (`renderer/ts/demo/`), no network, no log watcher, config never written; PNGs in `artifacts/screens/` |
| `PIKA_REPLAY=<log> npm start` | built app | replay driver (`src/main/replay.ts`): feeds the overlay from a real log |
| `node scripts/update-check.mjs <exe> <cwd>` / `update-cycle.mjs <exe> <cwd> <installDir> [version]` | installed app | Updates tab and full update cycle against the live feed |
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
