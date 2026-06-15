const { BrowserWindow } = require('electron');
const path = require('path');

let overlayWin  = null;
let settingsWin = null;

function getOverlayWin() {
    return overlayWin;
}

function getSettingsWin() {
    return settingsWin;
}

function createOverlay(store, rootDir) {
    if (overlayWin) return overlayWin;

    const bounds = store.get('overlayBounds') || { x: 20, y: 60, width: 960, height: 600 };
    const iconPath = path.join(rootDir, 'icon.png');
    const preloadPath = path.join(rootDir, 'preload.js');
    const htmlPath = path.join(rootDir, 'renderer', 'overlay.html');

    overlayWin = new BrowserWindow({
        ...bounds,
        transparent:   true,
        frame:         false,
        icon:          iconPath,
        alwaysOnTop:   store.get('alwaysOnTop'),
        type:          'toolbar',
        skipTaskbar:   false,
        resizable:     true,
        webPreferences: {
            preload:          preloadPath,
            contextIsolation: true,
            nodeIntegration:  false,
        },
    });

    overlayWin.loadFile(htmlPath);

    if (store.get('alwaysOnTop')) {
        overlayWin.setAlwaysOnTop(true, 'screen-saver');
        overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    const saveBounds = () => {
        if (!overlayWin) return;
        store.set('overlayBounds', overlayWin.getBounds());
    };

    overlayWin.on('moved', saveBounds);
    overlayWin.on('resized', saveBounds);
    overlayWin.on('closed', () => { overlayWin = null; });

    return overlayWin;
}

function createSettings(store, rootDir, onCloseCallback) {
    if (settingsWin) {
        settingsWin.focus();
        return settingsWin;
    }

    const iconPath = path.join(rootDir, 'icon.png');
    const preloadPath = path.join(rootDir, 'preload.js');
    const htmlPath = path.join(rootDir, 'renderer', 'settings.html');

    settingsWin = new BrowserWindow({
        width: 640,
        height: 860,
        title:     'Pika Overlay — Settings',
        frame:     false,
        transparent: true,
        icon:      iconPath,
        resizable:  false,
        webPreferences: {
            preload:          preloadPath,
            contextIsolation: true,
            nodeIntegration:  false,
        },
    });

    settingsWin.setMenuBarVisibility(false);
    settingsWin.loadFile(htmlPath);
    
    settingsWin.on('closed', () => {
        settingsWin = null;
        if (onCloseCallback) onCloseCallback();
    });

    return settingsWin;
}

function updateAlwaysOnTop(store) {
    if (!overlayWin) return;
    const aot = store.get('alwaysOnTop');
    if (aot) {
        overlayWin.setAlwaysOnTop(true, 'screen-saver');
        overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
        overlayWin.setAlwaysOnTop(false);
        overlayWin.setVisibleOnAllWorkspaces(false);
    }
}

module.exports = {
    getOverlayWin,
    getSettingsWin,
    createOverlay,
    createSettings,
    updateAlwaysOnTop,
};
