const { globalShortcut } = require('electron');

/**
 * Registers global keyboard shortcuts for the overlay.
 * Handles normalization and prevents duplicate locks.
 */
function registerHotkeys({ store, getOverlayWin, onClear }) {
    globalShortcut.unregisterAll();

    _tryRegister(store.get('toggleHotkey'), () => {
        const overlayWin = getOverlayWin();
        if (!overlayWin) return;
        if (overlayWin.isVisible()) {
            overlayWin.hide();
        } else {
            overlayWin.showInactive();
            // Re-apply always-on-top so it floats above fullscreen games
            if (store.get('alwaysOnTop')) {
                overlayWin.setAlwaysOnTop(true, 'screen-saver');
                overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            }
            // Blur overlay so Minecraft keeps keyboard focus
            setTimeout(() => {
                if (overlayWin && !overlayWin.isDestroyed()) {
                    overlayWin.blur();
                }
            }, 80);
        }
    });

    _tryRegister(store.get('clearHotkey'), () => {
        if (onClear) onClear();
    });
}

function unregisterAll() {
    globalShortcut.unregisterAll();
}

/**
 * Normalize a user-typed key string to a valid Electron accelerator.
 */
function _normalizeKey(raw) {
    if (!raw || /^(none|disabled|-)$/i.test(raw.trim())) return null;
    const parts   = raw.trim().split('+').map(p => p.trim());
    const mods    = parts.slice(0, -1);
    let   keyPart = parts[parts.length - 1];

    // Normalize modifiers
    const normMods = mods.map(m => {
        if (/^ctrl$/i.test(m))           return 'Ctrl';
        if (/^shift$/i.test(m))          return 'Shift';
        if (/^alt$/i.test(m))            return 'Alt';
        if (/^(cmd|meta|win)$/i.test(m)) return 'Meta';
        return m;
    });

    // Function keys: f1-f24 → F1-F24
    if (/^f(\d{1,2})$/i.test(keyPart))              keyPart = keyPart.toUpperCase();
    // Numpad
    else if (/^(num(pad)?\s*0|0\/ins)$/i.test(keyPart))  keyPart = 'num0';
    else if (/^num(pad)?\s*(\d)$/i.test(keyPart))         keyPart = 'num' + keyPart.replace(/\D/g, '');
    else if (/^(numpad)?\*$/i.test(keyPart))              keyPart = 'nummult';
    else if (/^(numpad)?\+$/i.test(keyPart))              keyPart = 'numadd';
    else if (/^(numpad)?-$/.test(keyPart))                keyPart = 'numsub';
    else if (/^(numpad)?\.$/i.test(keyPart))              keyPart = 'numdec';
    else if (/^(numpad)?\/$/i.test(keyPart))              keyPart = 'numdiv';
    // Named keys
    else if (/^ins(ert)?$/i.test(keyPart))                keyPart = 'Insert';
    else if (/^del(ete)?$/i.test(keyPart))                keyPart = 'Delete';
    else if (/^(pgup|pageup)$/i.test(keyPart))            keyPart = 'PageUp';
    else if (/^(pgdn|pagedown|pgdown)$/i.test(keyPart))  keyPart = 'PageDown';
    else if (/^home$/i.test(keyPart))                     keyPart = 'Home';
    else if (/^end$/i.test(keyPart))                      keyPart = 'End';
    else if (/^esc(ape)?$/i.test(keyPart))                keyPart = 'Escape';
    else if (/^(space|spacebar)$/i.test(keyPart))         keyPart = 'Space';
    else if (/^tab$/i.test(keyPart))                      keyPart = 'Tab';
    else if (/^(back|backspace)$/i.test(keyPart))         keyPart = 'Backspace';
    else if (/^(enter|return)$/i.test(keyPart))           keyPart = 'Return';
    else if (/^up$/i.test(keyPart))                       keyPart = 'Up';
    else if (/^down$/i.test(keyPart))                     keyPart = 'Down';
    else if (/^left$/i.test(keyPart))                     keyPart = 'Left';
    else if (/^right$/i.test(keyPart))                    keyPart = 'Right';
    // Single letter → uppercase
    else if (/^[a-z]$/.test(keyPart))                    keyPart = keyPart.toUpperCase();

    return [...normMods, keyPart].join('+');
}

function _tryRegister(rawKey, fn) {
    const key = _normalizeKey(rawKey);
    if (!key) return;
    const ok = globalShortcut.register(key, fn);
    if (ok) {
        console.log(`[Hotkey] Registered: ${key}${rawKey !== key ? ` (normalized from "${rawKey}")` : ''}`);
    } else {
        console.error(`[Hotkey] ⚠ Failed to register "${key}" — already in use by another app or invalid format.`);
    }
}

module.exports = {
    registerHotkeys,
    unregisterAll,
    _normalizeKey,
};
