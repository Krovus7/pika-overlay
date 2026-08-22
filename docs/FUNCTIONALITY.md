# FUNCTIONALITY.md

Functional catalog of Pika Overlay v4 — parity with v3, nothing removed.
UI text is English; the overlay graphics are identical to v3 (ADR-0005).

## Player detection (from log)

| Source | Trigger | Event |
|---|---|---|
| Pre-game join | `BedWars <icon> Name has joined! (n/8)` | `player_detected(name, 'join')`; self-join → `players_clear` + `pregame_start` |
| Pre-game quit | `BedWars <icon> Name has quit! (n/8)` | `player_quit(name)` |
| Kill feed | `Name was killed by X`, `Killer killed Victim …` | detection only (never removal) |
| Bed break | `Team's Bed has been destroyed by Name`, `BED DESTRUCTION > RED by Name` | `player_detected(name, 'bed_break')` |
| Team tag | `[RED] Name dealt 12 damage` (scoreboard) | `player_detected(name, 'team_announce')` |
| Tab roster | comma-separated names, ≥ 3 items and > 60 % valid | `players_sync` (blocked in-game) + detections |
| Manual search | search box (single or bulk paste) | `lookup:player` / `lookup:bulk` |

## Removal

- Final kill → victim removed (`player_quit`), party members pinned.
- BedWars quit, `players_sync` diff (outside game).
- `game_end` / `players_clear` → non-party rows cleared.

## Game lifecycle

`pregame_start` → queue status · `game_start` → in-game lock (tab sources
blocked, non-party rows cleared, party pinned) · `game_end` / `players_clear`
→ lock released.

## Stats & API

- 12 columns (rank, player, guild, fkdr, finals, kdr, wlr, wins, beds,
  winstreak, kills, deaths, bowkills, source); 4 periods × 4 modes;
  cache key `user:interval:mode`, TTL 10 min.
- Status resolution: 404 profile → 🎭 NICKED (red, top) · 200 profile without
  BedWars data → 🔒 API Off · transient errors (429/503/timeout) → ⚠ error
  (never 🔒). See API-CLIENT.md.

## Party

Join/leave/kick/disband, `/p info` (owner buffered + members; BLC and ✦
formats), auto-lookup, pinned rows with ♦ badge sorted on top, visual removal
on exit/disband.

## UI (overlay)

Column show/hide + drag&drop reorder, detailed/compact layouts with compact
picker, shared tier colors with per-ratio thresholds (FKDR/KDR/WLR),
background-only opacity, 🌙/☀ switcher below 15 % opacity (localStorage),
remappable F4/F5 hotkeys (normalized accelerators), tray, status badge,
footer, per-row source badge, suspect highlighting (level ≤ 1, zero stats),
self pinning + nicked-self display (nick in log, real name shown).

## Settings panel (inline, redesigned in v4)

- **General** — log path (browse/test), identity (username, pin top, nicked),
  overlay (always-on-top, opacity, hotkeys).
- **Columns** — detailed mode list (drag & drop + arrows), compact picker.
- **Stats** — tier colors + per-ratio thresholds.
- **Updates** — Velopack state, manual check, download & restart, progress
  bar, "check on startup" toggle (`updateAutoCheck`).
- **Debug** — last 100 raw log lines.
- Save action shows inline status (Saving… / ✓ Saved / ✗ Failed).

## Auto-update

Silent check at startup (opt-out `updateAutoCheck`), explicit download/apply
from Settings → Updates, feed = GitHub Releases of Krovus7/pika-overlay,
delta support. Disabled in dev mode (not packaged).
