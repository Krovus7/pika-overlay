import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import { bindText, block, button, group, h, row, setStatus, textInput, toggle } from './controls';
import { buildHotkeyField } from './hotkeyField';
import { saveNow, saveSoon } from './saveQueue';
import { cfgBool, cfgStr, type Cfg } from './store';
import type { TabView } from './types';

export function buildGeneral(api: PikaOverlayApi): TabView {
    const root = h('div', 's-tab-content');

    // ── Log file ──
    const log = group('Minecraft log file',
        'Pika Overlay reads this file to see who joins your game. Pick the latest.log of the launcher you play with.');
    const path = textInput('C:\\Users\\you\\AppData\\Roaming\\.minecraft\\logs\\latest.log', true);
    path.setAttribute('aria-label', 'Minecraft log file path');
    const browse = button('Browse', { icon: 'folder' });
    const pathLine = h('div', 's-inline');
    pathLine.append(path, browse);
    const pathStatus = h('div', 's-status');
    log.list.appendChild(block(pathLine, pathStatus));

    let checkSeq = 0;
    let checkTimer: number | null = null;
    let lastChecked: string | null = null;
    async function check(value: string): Promise<void> {
        const seq = ++checkSeq;
        lastChecked = value;
        if (!value) {
            setStatus(pathStatus, 'warn', 'alert', 'No file selected. The overlay cannot see your game yet.');
            return;
        }
        try {
            const ok = await api.testLogPath(value);
            if (seq !== checkSeq) return;
            if (ok) setStatus(pathStatus, 'ok', 'circle-check', 'File found.');
            else setStatus(pathStatus, 'bad', 'circle-alert', 'File not found. Check the path or use Browse.');
        } catch (err) {
            console.error('[Settings] Log path check failed:', String(err));
            if (seq === checkSeq) setStatus(pathStatus, 'bad', 'circle-alert', 'Could not check this path.');
        }
    }
    path.addEventListener('input', () => {
        if (checkTimer !== null) window.clearTimeout(checkTimer);
        checkTimer = window.setTimeout(() => void check(path.value.trim()), 450);
    });
    bindText(path, v => saveSoon({ logPath: v }), v => void saveNow({ logPath: v }));
    browse.addEventListener('click', async () => {
        try {
            const picked = await api.browseLogFile();
            if (!picked) return;
            path.value = picked;
            void saveNow({ logPath: picked });
            void check(picked);
        } catch (err) {
            console.error('[Settings] Browse failed:', String(err));
            setStatus(pathStatus, 'bad', 'circle-alert', 'The file picker could not open.');
        }
    });

    // ── Identity ──
    const identity = group('Identity');
    const username = textInput('Your Minecraft name');
    bindText(username, v => saveSoon({ myUsername: v }), v => void saveNow({ myUsername: v }));
    identity.list.appendChild(row('My username', 'Used to find your row and your party.', username, username.id));

    const pin = toggle(on => void saveNow({ pinSelf: on }));
    identity.list.appendChild(row('Pin my row to the top', null, pin.root, pin.input.id));

    const nick = textInput('Your nick');
    const nickRow = row('My nick', 'The game log shows your nick, but the overlay shows your real name on your row.',
        nick, nick.id);
    nickRow.hidden = true;
    const nicked = toggle(on => { nickRow.hidden = !on; void saveNow({ isNicked: on }); });
    bindText(nick, v => saveSoon({ myNickName: v }), v => void saveNow({ myNickName: v }));
    identity.list.append(row('I am nicked', 'Turn this on if you play under a nick.', nicked.root, nicked.input.id), nickRow);

    // ── Hotkeys ──
    const keys = group('Hotkeys',
        'Global shortcuts that work while Minecraft is in focus. Click a field, then press the keys.');
    let shown: Cfg = {};
    function commitKey(key: string, otherKey: string, value: string): string | null {
        if (cfgStr(shown, otherKey).toLowerCase() === value.toLowerCase()) return 'Already used by the other hotkey.';
        shown = { ...shown, [key]: value };
        void saveNow({ [key]: value });
        return null;
    }
    const toggleKey = buildHotkeyField({ defaultValue: 'F4', onCommit: v => commitKey('toggleHotkey', 'clearHotkey', v) });
    const clearKey = buildHotkeyField({ defaultValue: 'F5', onCommit: v => commitKey('clearHotkey', 'toggleHotkey', v) });
    keys.list.append(row('Show / hide overlay', null, toggleKey.root), row('Clear player list', null, clearKey.root));

    root.append(log.root, identity.root, keys.root);

    return {
        id: 'general',
        root,
        sync(cfg) {
            shown = cfg;
            const active = document.activeElement;
            if (active !== path) path.value = cfgStr(cfg, 'logPath');
            if (active !== username) username.value = cfgStr(cfg, 'myUsername');
            if (active !== nick) nick.value = cfgStr(cfg, 'myNickName');
            pin.input.checked = cfgBool(cfg, 'pinSelf', false);
            nicked.input.checked = cfgBool(cfg, 'isNicked', false);
            nickRow.hidden = !nicked.input.checked;
            toggleKey.set(cfgStr(cfg, 'toggleHotkey', 'F4'));
            clearKey.set(cfgStr(cfg, 'clearHotkey', 'F5'));
            if (path.value.trim() !== lastChecked) void check(path.value.trim());
        },
    };
}
