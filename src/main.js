const { app, Tray, Menu } = require('electron');
const path = require('path');
const os = require('os');

const ConfigStore   = require('./config');
const logWatcher    = require('./logWatcher');
const cache         = require('./cache');
const windowManager = require('./windowManager');
const hotkeyManager = require('./hotkeyManager');
const ipcHandlers   = require('./ipcHandlers');

const rootDir = path.join(__dirname, '..');
let store;
let tray = null;

// ─── Default log paths ────────────────────────────────────────────────────────
function defaultLogPath() {
    const base = process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft')
        : process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support', 'minecraft')
            : path.join(os.homedir(), '.minecraft');
    return path.join(base, 'logs', 'blclient', 'minecraft', 'latest.log');
}

const CONFIG_DEFAULTS = {
    logPath:       defaultLogPath(),
    myUsername:    '',
    overlayBounds: { x: 20, y: 60, width: 960, height: 600 },
    alwaysOnTop:   true,
    toggleHotkey:  'F4',
    clearHotkey:   'F5',
    opacity:       0.92,
    statsInterval: 'total',
    statsMode:     'ALL_MODES',
    overlayMode:   'detailed', // Starts in detailed, then remembers user choice
    ratioThresholds: {
        fkdr: { hacker: 20.0, godlike: 10.0, good: 3.0,  medium: 1.0  },
        kdr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5,  medium: 0.75 },
        wlr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5,  medium: 0.75 },
    },
    ratioColors: { hacker: '#f43f5e', godlike: '#d946ef', good: '#22c55e', medium: '#f59e0b', bad: '#ef4444' },
    columnOrder:   ['rank','player','fkdr','finals','kdr','wlr','wins','beds','winstreak','kills','deaths','bowkills','guild','source'],
    columnEnabled: { rank:true, player:true, fkdr:true, finals:true, kdr:true, wlr:true, wins:true, beds:true, winstreak:true, kills:false, deaths:false, bowkills:false, guild:false, source:true },
    compactColumns: ['rank', 'player', 'fkdr', 'winstreak', 'source'],
    fkdrThresholds: { good: 3.0, medium: 1.0 }, // Legacy
};

// ─── Tray Icon ────────────────────────────────────────────────────────────────
function createTray() {
    const iconPath = path.join(rootDir, 'icon.png');
    tray = new Tray(iconPath);
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Pika Overlay v3.1.0', enabled: false },
        { type: 'separator' },
        { label: 'Show Overlay', click: () => windowManager.getOverlayWin()?.show() },
        { label: 'Settings',    click: () => {
            const win = windowManager.getOverlayWin();
            if (win) {
                win.show();
                win.webContents.send('settings:show');
            }
        } },
        { type: 'separator' },
        { label: 'Quit',        click: () => app.quit() },
    ]));
    tray.setToolTip('Pika-Network BedWars Overlay v3.1.0');
    tray.on('click', () => windowManager.getOverlayWin()?.show());
}

// ─── Watcher Event Mapping ────────────────────────────────────────────────────
function bindWatcherEvents() {
    logWatcher.on('log_line', line => {
        ipcHandlers.recentLogLines.push(line);
        if (ipcHandlers.recentLogLines.length > ipcHandlers.MAX_LOG_LINES) {
            ipcHandlers.recentLogLines.shift();
        }
    });

    logWatcher.on('players_sync', detectedNames => {
        // Block tab updates mid-game
        if (ipcHandlers.getInGame()) return;

        const detectedSet = new Set(detectedNames.map(n => n.toLowerCase()));
        for (const key of ipcHandlers.shownPlayers) {
            if (!detectedSet.has(key)) {
                ipcHandlers.shownPlayers.delete(key);
                windowManager.getOverlayWin()?.webContents.send('player:remove', key);
            }
        }
    });

    logWatcher.on('pregame_start', () => {
        windowManager.getOverlayWin()?.webContents.send('game:pregame');
    });

    logWatcher.on('game_start', () => {
        ipcHandlers.setInGame(true);
        // Pin party members, clear other players from tracking
        for (const key of ipcHandlers.shownPlayers) {
            if (!ipcHandlers._partyMembers.has(key)) ipcHandlers.shownPlayers.delete(key);
        }
        cache.clear();
        windowManager.getOverlayWin()?.webContents.send('game:start');
    });

    logWatcher.on('game_end', () => {
        ipcHandlers.setInGame(false);
        windowManager.getOverlayWin()?.webContents.send('game:end');
    });

    logWatcher.on('players_clear', () => {
        ipcHandlers.setInGame(false);
        // Pin party members, clear rest
        for (const key of ipcHandlers.shownPlayers) {
            if (!ipcHandlers._partyMembers.has(key)) ipcHandlers.shownPlayers.delete(key);
        }
        cache.clear();
        windowManager.getOverlayWin()?.webContents.send('players:clear');
    });

    logWatcher.on('player_detected', (username, source) => {
        // Block tab detections mid-game
        if (ipcHandlers.getInGame() && source === 'tab_list') return;
        ipcHandlers.enqueueLookup(username, source, null, null, windowManager.getOverlayWin);
    });

    logWatcher.on('player_quit', username => {
        const key = username.toLowerCase();
        // Pin party members — never remove them via kill feed
        if (ipcHandlers._partyMembers.has(key)) return;
        if (!ipcHandlers.shownPlayers.has(key)) return;
        ipcHandlers.shownPlayers.delete(key);
        windowManager.getOverlayWin()?.webContents.send('player:remove', key);
    });

    logWatcher.on('party_members', names => {
        const newSet = new Set(names.map(n => n.toLowerCase()));
        
        // Remove players no longer in the party from overlay
        for (const key of ipcHandlers._partyMembers) {
            if (!newSet.has(key)) {
                if (ipcHandlers.shownPlayers.has(key)) {
                    ipcHandlers.shownPlayers.delete(key);
                    windowManager.getOverlayWin()?.webContents.send('player:remove', key);
                }
            }
        }

        ipcHandlers._partyMembers.clear();
        names.forEach(n => ipcHandlers._partyMembers.add(n.toLowerCase()));
        windowManager.getOverlayWin()?.webContents.send('party:update', [...ipcHandlers._partyMembers]);
        console.log(`[Party] Sync: ${[...ipcHandlers._partyMembers].join(', ')}`);
        
        // Auto-lookup party members
        for (const name of names) {
            ipcHandlers.enqueueLookup(name, 'party', null, null, windowManager.getOverlayWin);
        }
    });

    logWatcher.on('party_joined', username => {
        ipcHandlers._partyMembers.add(username.toLowerCase());
        windowManager.getOverlayWin()?.webContents.send('party:update', [...ipcHandlers._partyMembers]);
        console.log(`[Party] Joined: ${username}`);
        ipcHandlers.enqueueLookup(username, 'party', null, null, windowManager.getOverlayWin);
    });

    logWatcher.on('party_left', username => {
        const key = username.toLowerCase();
        ipcHandlers._partyMembers.delete(key);
        
        if (ipcHandlers.shownPlayers.has(key)) {
            ipcHandlers.shownPlayers.delete(key);
            windowManager.getOverlayWin()?.webContents.send('player:remove', key);
        }

        windowManager.getOverlayWin()?.webContents.send('party:update', [...ipcHandlers._partyMembers]);
        console.log(`[Party] Left: ${username} — removed from overlay`);
    });

    logWatcher.on('party_clear', () => {
        for (const key of ipcHandlers._partyMembers) {
            if (ipcHandlers.shownPlayers.has(key)) {
                ipcHandlers.shownPlayers.delete(key);
                windowManager.getOverlayWin()?.webContents.send('player:remove', key);
            }
        }
        
        ipcHandlers._partyMembers.clear();
        windowManager.getOverlayWin()?.webContents.send('party:update', []);
        console.log('[Party] Cleared — all pins and party players removed from overlay');
    });
}

// ─── App Bootstrapping ────────────────────────────────────────────────────────
app.whenReady().then(() => {
    store = new ConfigStore(app, CONFIG_DEFAULTS);
    
    // Create overlay
    windowManager.createOverlay(store, rootDir);
    createTray();

    // Hotkey registration helper wrapper
    const registerHotkeys = () => {
        hotkeyManager.registerHotkeys({
            store,
            getOverlayWin: windowManager.getOverlayWin,
            onClear: () => {
                ipcHandlers.shownPlayers.clear();
                cache.clear();
                windowManager.getOverlayWin()?.webContents.send('players:clear');
            }
        });
    };

    // Register IPC Handlers
    ipcHandlers.registerIpcHandlers({
        store,
        rootDir,
        getOverlayWin: windowManager.getOverlayWin,
        getSettingsWin: () => null,
        createSettings: () => {
            windowManager.getOverlayWin()?.show();
            windowManager.getOverlayWin()?.webContents.send('settings:show');
        },
        updateAlwaysOnTop: windowManager.updateAlwaysOnTop,
        registerHotkeys,
    });

    bindWatcherEvents();
    
    // Start watcher
    logWatcher.start(store.get('logPath'), store.get('myUsername'));
    
    // Register hotkeys
    registerHotkeys();
});

app.on('window-all-closed', e => e.preventDefault()); // prevent quit on window close
app.on('before-quit', () => {
    logWatcher.stop();
    hotkeyManager.unregisterAll();
});
