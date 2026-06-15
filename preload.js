const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to renderer processes
contextBridge.exposeInMainWorld('pikaOverlay', {
    // === Overlay ===
    onPlayerStats: (cb) => {
        ipcRenderer.removeAllListeners('player:stats');
        ipcRenderer.on('player:stats', (_e, data) => cb(data));
    },
    onPlayerLoading: (cb) => {
        ipcRenderer.removeAllListeners('player:loading');
        ipcRenderer.on('player:loading', (_e, data) => cb(data));
    },
    onPlayerError: (cb) => {
        ipcRenderer.removeAllListeners('player:error');
        ipcRenderer.on('player:error', (_e, data) => cb(data));
    },
    onPlayerRemove: (cb) => {
        ipcRenderer.removeAllListeners('player:remove');
        ipcRenderer.on('player:remove', (_e, username) => cb(username));
    },
    onPlayersClear: (cb) => {
        ipcRenderer.removeAllListeners('players:clear');
        ipcRenderer.on('players:clear', () => cb());
    },
    onGamePregame: (cb) => {
        ipcRenderer.removeAllListeners('game:pregame');
        ipcRenderer.on('game:pregame', () => cb());
    },
    onGameStart: (cb) => {
        ipcRenderer.removeAllListeners('game:start');
        ipcRenderer.on('game:start', () => cb());
    },
    onGameEnd: (cb) => {
        ipcRenderer.removeAllListeners('game:end');
        ipcRenderer.on('game:end', () => cb());
    },
    onPartyUpdate: (cb) => {
        ipcRenderer.removeAllListeners('party:update');
        ipcRenderer.on('party:update', (_e, members) => cb(members));
    },
    onSettingsShow: (cb) => {
        ipcRenderer.removeAllListeners('settings:show');
        ipcRenderer.on('settings:show', () => cb());
    },

    // === Actions from renderer ===
    lookupPlayer: (username, interval, mode) => ipcRenderer.invoke('lookup:player', username, interval, mode),
    lookupBulk: (names, interval, mode) => ipcRenderer.invoke('lookup:bulk', names, interval, mode),
    clearPlayers: () => ipcRenderer.invoke('players:clear'),
    openSettings: () => ipcRenderer.invoke('settings:open'),
    closeOverlay: () => ipcRenderer.invoke('overlay:close'),
    minimizeOverlay: () => ipcRenderer.invoke('overlay:minimize'),

    // === Stats interval and mode ===
    setStatsInterval: (interval) => ipcRenderer.invoke('stats:setInterval', interval),
    setStatsMode: (mode) => ipcRenderer.invoke('stats:setMode', mode),
    refetchAll: (names, interval, mode) => ipcRenderer.invoke('stats:refetchAll', names, interval, mode),

    // === Config ===
    getConfig: (key) => ipcRenderer.invoke('config:get', key),
    setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
    getAllConfig: () => ipcRenderer.invoke('config:getAll'),

    // === Settings window ===
    onConfigUpdate: (cb) => {
        ipcRenderer.on('config:updated', (_e, cfg) => cb(cfg));
    },
    saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
    browseLogFile: () => ipcRenderer.invoke('browse:logFile'),
    testLogPath: (logPath) => ipcRenderer.invoke('test:logPath', logPath),
    closeSettings: () => ipcRenderer.invoke('settings:close'),
    getLogLines: () => ipcRenderer.invoke('debug:logLines'),
});
