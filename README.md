<div align="center">
  <img src="icon.png" width="96" height="96" alt="Pika Overlay Icon" />

  <h1>Pika-Network BedWars Overlay</h1>
  <p>Real-time stat tracker and transparent HUD for Minecraft BedWars on Pika-Network</p>

  <p>
    <img src="https://img.shields.io/badge/version-3.1.0-brightgreen?style=flat-square" alt="v3.1.0"/>
    <img src="https://img.shields.io/badge/platform-Windows-blue?style=flat-square" alt="Windows"/>
    <img src="https://img.shields.io/badge/game-Pika--Network-orange?style=flat-square" alt="Pika-Network"/>
    <img src="https://img.shields.io/badge/built%20with-Electron-47848f?style=flat-square&logo=electron" alt="Electron"/>
  </p>
</div>

---

## ✨ Features

### 🎯 Automatic Player Detection
The overlay monitors your Minecraft `latest.log` file in real time — no manual input required. Players are detected the moment they appear in the tab list, join/leave the lobby, destroy a bed, or appear in the kill feed.

### 📊 Full BedWars Statistics
For every detected player, the overlay fetches and displays:

| Column | Description |
|--------|-------------|
| **LV** | Account level + donor or staff rank badge |
| **Player** | Username — party members show a `♦` badge |
| **Guild** | Clan / guild tag |
| **FKDR** | Final Kill / Death ratio |
| **Finals** | Total final kills |
| **KDR** | Kill / Death ratio |
| **WLR** | Win / Loss ratio |
| **Wins** | Total wins |
| **Beds** | Beds destroyed |
| **WS** | Best win streak |
| **Kills** | Total kills |
| **Deaths** | Total deaths |
| **Bow K.** | Bow kills |

All stats support **four time intervals** — All Time · Weekly · Monthly · Yearly — and **four game modes** — Overall · Solo · Duo · Quad — switchable from dropdown menus inside the overlay.

### 🎭 Nicked Player Detection
The overlay can distinguish between **nicked players** and players with **API off**:

- **Nicked** — The nick belongs to a Minecraft account that has never played on Pika-Network (no general activity on the profile). These are highlighted in **red** with a 🎭 `NICKED` badge and sorted to the top of the list (below party members).
- **API Off** — The player has played on Pika (has general profile activity like XP, ranks, friends) but BedWars stats are hidden. Shown as 🔒 `API Off`.

### 💎 Party Member Tracking
Join or create a party and your teammates are **automatically added to the overlay** with full stats and a pink `♦` badge.

- Detects join / leave / kick / disband events from chat in real time
- Running `/p info` adds all listed members to the overlay instantly
- Party members are **pinned**: they survive `F5` clears, game starts, and kill-feed removals
- Party members are always **sorted to the top** of the list, regardless of the active sort column
- When a player leaves the party they lose the pin and are treated as normal players

### 🔒 In-Game List Lock
Once a BedWars game starts the player list is **frozen**. Pressing Tab mid-game (name autocomplete) will no longer accidentally clear your roster — the list stays exactly as it was at game start.

### ⚡ Resilient API Calls
Crowded lobbies (~50 players) used to cause a burst of simultaneous requests that hit Pika's rate limit and showed everyone as 🔒. This is fixed with:
- **Exponential backoff retry** — up to 3 attempts on HTTP 429 / 503 / timeout (600 ms → 1.2 s → 2.4 s)
- **Concurrency cap** — max 6 simultaneous lookups (≈ 12 HTTP connections), queued FIFO

Rate-limited players show `⚠` (temporary API error) instead of `🔒` (truly private profile).

### ⚙️ Customisable Interface
- **Drag-and-drop** column reordering with show/hide toggles per column
- **Compact / Detailed** layout toggle — switch between a minimal view and full stats
- **Ratio color tiers** — configurable per-ratio thresholds (FKDR / KDR / WLR have independent values) and shared colors per tier (Hacker / Sweat / Excellent / Average / Poor)
- **Overlay opacity** slider — with automatic light/dark contrast mode at low opacity
- **Hotkeys** — default `F4` (toggle) and `F5` (clear), fully remappable
- **System tray** — minimises out of the way while gaming

---

## 📂 Log File Path

The overlay reads your Minecraft client's `latest.log`. The path depends on your launcher:

| Client | Path |
|--------|------|
| **Badlion Client** | `%AppData%\.minecraft\logs\blclient\minecraft\latest.log` |
| **Lunar Client** | `%UserProfile%\.lunarclient\offline\multiver\logs\latest.log` |
| **Vanilla / Official** | `%AppData%\.minecraft\logs\latest.log` |
| **Other clients** | Look for a `logs\latest.log` inside the client's own folder |

> **Tip:** Open your client, join a lobby, then check the file — if you see timestamps from a few seconds ago, you've found the right one.
> Set the path in **Settings → Log File Path** and click *Test* to confirm the overlay can read it.

---

## 🚀 Installation

1. Download `PikaOverlay Setup 3.1.0.exe` from the [**Releases**](../../releases) page
2. Run the installer (takes a few seconds, no admin rights needed)
3. Launch **PikaOverlay** from the Start Menu or desktop shortcut
4. Open **Settings** (⚙️) and set your Minecraft log path (see table above)
5. Join a BedWars lobby — the overlay populates automatically

---

## ⌨️ Hotkeys

| Hotkey | Action |
|--------|--------|
| `F4` | Toggle overlay visibility |
| `F5` | Clear the player list (party members are kept) |

Both hotkeys can be remapped from the Settings page.

---

## 🛠 Building from Source

```bash
# Install dependencies
npm install

# Run in development mode (live reload)
npm start

# Build the Windows installer
.\build.bat
```

The compiled `.exe` is placed in `dist/`.

---

## 📜 Credits

Made by **AcquaPanna**
