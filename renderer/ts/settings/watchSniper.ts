/** Watchlist tab, "Sniper detection" (login age) and "Alerts". Config-backed, so it syncs from the config. */

import { group, h, row, segmented, toggle, uid } from './controls';
import { saveNow, saveSoon } from './saveQueue';
import { cfgBool, cfgNum, cfgStr, type Cfg } from './store';

function numberInput(label: string, min: number, max: number, onCommit: (v: number) => void): HTMLInputElement {
    const input = h('input', 's-input s-number');
    input.type = 'number';
    input.id = uid('in');
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.setAttribute('aria-label', label);
    const commit = (): void => {
        const v = Math.round(Number(input.value));
        if (input.value.trim() !== '' && Number.isFinite(v)) onCommit(Math.min(max, Math.max(min, v)));
    };
    input.addEventListener('input', () => { if (input.validity.valid) commit(); });
    input.addEventListener('blur', commit);
    return input;
}

export interface ConfigSection {
    roots: HTMLElement[];
    sync(cfg: Cfg): void;
}

export function buildSniper(): ConfigSection {
    const g = group('Sniper detection',
        'Shows how long ago a player logged in, to spot fresh accounts. Experimental: it stays off by default until the meaning of the API field is verified.');
    const mode = segmented('Login age', [
        { value: 'off', label: 'Off' }, { value: 'lowLevel', label: 'Low level' }, { value: 'all', label: 'All players' },
    ], v => void saveNow({ loginAge: v }));
    g.list.appendChild(row('Login age', 'Low level limits it to players at or below the level below.', mode.root));
    const maxLevel = numberInput('Highest level for low level mode', 1, 1000, v => saveSoon({ loginAgeMaxLevel: v }));
    g.list.appendChild(row('Highest level', 'Used by Low level mode.', maxLevel, maxLevel.id));
    const fresh = numberInput('Minutes that count as just logged in', 1, 1440, v => saveSoon({ freshMinutes: v }));
    g.list.appendChild(row('Fresh login (minutes)', 'A login this recent is highlighted.', fresh, fresh.id));

    const a = group('Alerts', 'When a marked player enters your lobby.');
    const sound = toggle(on => void saveNow({ watchlistSound: on }));
    a.list.appendChild(row('Play a beep', null, sound.root, sound.input.id));
    const top = toggle(on => void saveNow({ watchlistOnTop: on }));
    a.list.appendChild(row('Show marked players first', 'Right after your party, above nicked players.', top.root, top.input.id));

    return {
        roots: [g.root, a.root],
        sync(cfg) {
            mode.set(cfgStr(cfg, 'loginAge', 'off'));
            if (document.activeElement !== maxLevel) maxLevel.value = String(cfgNum(cfg, 'loginAgeMaxLevel', 10));
            if (document.activeElement !== fresh) fresh.value = String(cfgNum(cfg, 'freshMinutes', 5));
            sound.input.checked = cfgBool(cfg, 'watchlistSound', false);
            top.input.checked = cfgBool(cfg, 'watchlistOnTop', true);
        },
    };
}
