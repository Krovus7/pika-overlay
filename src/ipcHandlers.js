const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getPlayerStats } = require('./apiClient');
const cache = require('./cache');
const logWatcher = require('./logWatcher');

// State
const shownPlayers   = new Set();
const _partyMembers  = new Set();
const recentLogLines = [];
let _inGame          = false;

const MAX_LOG_LINES  = 100;
const LOOKUP_CONCURRENCY = 6;
let _activeLookups   = 0;
const _lookupQueue   = []; // Array<{ username, source, interval, mode }>

function setInGame(val) {
    _inGame = val;
}

function getInGame() {
    return _inGame;
}

// ─── Concurrency Queue ────────────────────────────────────────────────────────
function enqueueLookup(username, source, interval = null, mode = null, getOverlayWin) {
    _lookupQueue.push({ username, source, interval, mode });
    _drainQueue(getOverlayWin);
}

function _drainQueue(getOverlayWin) {
    while (_activeLookups < LOOKUP_CONCURRENCY && _lookupQueue.length > 0) {
        const { username, source, interval, mode } = _lookupQueue.shift();
        _activeLookups++;
        lookup(username, source, interval, mode, getOverlayWin).finally(() => {
            _activeLookups--;
            _drainQueue(getOverlayWin);
        });
    }
}

// ─── Player lookup ────────────────────────────────────────────────────────────
async function lookup(username, source = 'manual', interval = null, mode = null, getOverlayWin) {
    if (!username) return null;
    const key = username.toLowerCase();
    if (shownPlayers.has(key)) return null;
    shownPlayers.add(key);

    const overlayWin = getOverlayWin();
    overlayWin?.webContents.send('player:loading', { username, source });

    const store = global.store; // store is initialized globally
    const ivl = interval || store.get('statsInterval') || 'total';
    const mod = mode     || store.get('statsMode')     || 'ALL_MODES';
    const stats = await getPlayerStats(username, ivl, mod);

    // Race-condition guard: player quit while API call was in flight
    if (!shownPlayers.has(key)) {
        console.log(`[lookup] ${username} left before stats arrived — discarding`);
        return null;
    }

    if (!overlayWin) return stats;

    if (!stats || stats.error) {
        overlayWin.webContents.send('player:error', { username, source });
    } else {
        overlayWin.webContents.send('player:stats', { ...stats, source });
    }

    return stats;
}

// ─── Default log folder helper ────────────────────────────────────────────────
function defaultLogFolder() {
    const base = process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft')
        : process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support', 'minecraft')
            : path.join(os.homedir(), '.minecraft');
    return path.join(base, 'logs');
}

// ─── Register IPC handlers ────────────────────────────────────────────────────
function registerIpcHandlers({
    store,
    rootDir,
    getOverlayWin,
    getSettingsWin,
    createSettings,
    updateAlwaysOnTop,
    registerHotkeys,
}) {
    // Save store to global for easy access in lookup()
    global.store = store;

    ipcMain.handle('lookup:player', (_e, username, interval, mode) => 
        lookup(username, 'manual', interval, mode, getOverlayWin)
    );

    ipcMain.handle('lookup:bulk', async (_e, names, interval, mode) => {
        const results = [];
        for (const name of names) {
            results.push(await lookup(name, 'bulk', interval, mode, getOverlayWin));
        }
        return results;
    });

    ipcMain.handle('stats:setInterval', (_e, interval) => {
        store.set('statsInterval', interval);
        const fullCfg = store.getAll();
        getOverlayWin()?.webContents.send('config:updated', fullCfg);
    });

    ipcMain.handle('stats:setMode', (_e, mode) => {
        store.set('statsMode', mode);
        const fullCfg = store.getAll();
        getOverlayWin()?.webContents.send('config:updated', fullCfg);
    });

    ipcMain.handle('stats:refetchAll', async (_e, names, interval, mode) => {
        store.set('statsInterval', interval);
        if (mode) store.set('statsMode', mode);
        shownPlayers.clear();
        const results = [];
        for (const name of names) {
            results.push(await lookup(name, 'manual', interval, mode, getOverlayWin));
        }
        return results;
    });

    ipcMain.handle('players:clear', () => {
        // Party members are pinned — preserve them across manual clears.
        for (const key of shownPlayers) {
            if (!_partyMembers.has(key)) shownPlayers.delete(key);
        }
        cache.clear();
        getOverlayWin()?.webContents.send('players:clear');
    });

    ipcMain.handle('settings:open',  () => {
        getOverlayWin()?.webContents.send('settings:show');
    });
    ipcMain.handle('settings:close', () => {
        // Handled inline in the overlay window
    });
    ipcMain.handle('overlay:close',   () => getOverlayWin()?.hide());
    ipcMain.handle('overlay:minimize',() => getOverlayWin()?.minimize());

    ipcMain.handle('config:get',    (_e, key) => store.get(key));
    ipcMain.handle('config:getAll', ()         => store.getAll());

    ipcMain.handle('config:set', (_e, key, value) => {
        store.set(key, value);
        const fullCfg = store.getAll();
        getOverlayWin()?.webContents.send('config:updated', fullCfg);
    });

    ipcMain.handle('config:save', (_e, cfg) => {
        store.setMany(cfg);

        // Restart watcher if log path changed
        logWatcher.stop();
        logWatcher.start(store.get('logPath'), store.get('myUsername'));

        // Update overlay window properties
        updateAlwaysOnTop(store);

        // Re-register hotkeys in case they changed
        registerHotkeys();

        // Notify overlay window
        const fullCfg = store.getAll();
        getOverlayWin()?.webContents.send('config:updated', fullCfg);
    });

    ipcMain.handle('browse:logFile', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title:       'Select the Minecraft latest.log file',
            defaultPath: defaultLogFolder(),
            filters:     [{ name: 'Log files', extensions: ['log'] }],
        });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('test:logPath',   (_e, p)  => fs.existsSync(p));
    ipcMain.handle('debug:logLines', ()        => [...recentLogLines]);
}

module.exports = {
    shownPlayers,
    _partyMembers,
    recentLogLines,
    MAX_LOG_LINES,
    setInGame,
    getInGame,
    enqueueLookup,
    lookup,
    registerIpcHandlers,
};
