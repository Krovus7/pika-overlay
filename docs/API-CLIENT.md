# API-CLIENT.md

`src/main/api/` — client for `https://stats.pika-network.net/api`, ported 1:1
from v3 `src/apiClient.js` (same endpoints, same retry behavior, same
nicked/api-off semantics).

## Endpoints

- `GET /profile/{username}` — profile (rank, level, clan).
- `GET /profile/{username}/leaderboard?type=bedwars&interval={ivl}&mode={modeKey}`
  — BedWars leaderboard entries.

Valid intervals: `total | weekly | monthly | yearly` (default `total`).
Valid modes: `ALL_MODES | SOLO | DOUBLES | QUAD` (default `ALL_MODES`).

## Result semantics (critical — do not blur these)

| Condition | Result |
|---|---|
| Profile HTTP 404 | `{ notFound: true, nicked: true }` → 🎭 NICKED |
| Profile 429/503 after retries | `{ error: true, rateLimited: true }` → ⚠ (NEVER nicked/notFound) |
| Profile body invalid/empty | `{ error: true }` → ⚠ transient |
| Leaderboard 429/503 after retries | `{ error: true, rateLimited: true }` → ⚠ |
| Valid profile, no BedWars data (`null` body or all entries empty) | `{ notFound: true, nicked: false, apiOff: true }` → 🔒 API Off |
| Valid data | full `PlayerStats` |

Why: Pika's nick system requires a name that has NEVER played on Pika — a
200 profile can never be a nick. Only a 404 means nicked.

## Retry (`fetch.ts`)

`fetchWithRetry(url, { maxRetries = 3, baseDelayMs = 600, timeoutMs = 10_000 })`:

- Retries on HTTP 429/503 and `AbortError` (10 s timeout).
- Delay = `retry-after` header (seconds) when present, else
  `baseDelayMs * 2^attempt` (600 ms / 1.2 s / 2.4 s).
- After retries exhausted, 429/503 responses are RETURNED (callers map them
  to transient errors); timeouts throw.
- `safeJson` returns `null` for non-ok responses, empty bodies and parse
  failures.

## Cache (`cache.ts`)

In-memory, key `username:interval:mode`, TTL 10 minutes, cleared on
`game_start` / `players_clear` / manual clear. The renderer period/mode
switches call `stats:refetchAll`, which clears the registry and re-fetches.

## Rank display (`rankDisplay.ts`)

Donor ranks (TITAN/LEGEND/LORD/MVP/VIP/PRO/ULTRA) come from
`profile.rank.rankDisplay` (substring match); staff ranks (OWNER…MEDIA) from
`profile.ranks`, normalized to accept both `[{name}]` objects and plain
strings. See `tests/log-parser.test.ts` section 12 for the contract.

## Testing

`tests/api.test.ts` mocks `globalThis.fetch` and covers 404/429/503/timeout/
200/api-off/cache keys. `retryOptions` (4th `getPlayerStats` arg) shrinks
retry delays in tests; default behavior is identical to v3. The old
`test_api.js` live-script behavior (real names against the real API) is
intentionally not part of the automated suite.
