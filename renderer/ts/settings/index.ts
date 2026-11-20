/**
 * Settings shell: tab switching, the "Saved" indicator, the version label and
 * wiring of the per-tab modules. Every control saves itself (see saveQueue).
 * The window around it lives in ../settingsWindow.ts.
 */

import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import { buildApi } from './tabApi';
import { buildAppearance } from './tabAppearance';
import { buildColors } from './tabColors';
import { buildColumns } from './tabColumns';
import { buildDebug } from './tabDebug';
import { buildGeneral } from './tabGeneral';
import { buildUpdates } from './tabUpdates';
import { buildWatchlist } from './tabWatchlist';
import { initSaveQueue, type SaveStatus } from './saveQueue';
import { subscribeConfig } from './store';
import { svgIcon } from './controls';
import type { TabView } from './types';

function createSaveIndicator(el: HTMLElement): (s: SaveStatus) => void {
    let timer: number | null = null;
    return status => {
        if (timer !== null) window.clearTimeout(timer);
        const ok = status.kind === 'saved';
        el.className = `settings-save-status show ${ok ? 'is-ok' : 'is-error'}`;
        el.replaceChildren(svgIcon(ok ? 'check' : 'circle-alert'), document.createTextNode(ok ? 'Saved' : status.message));
        if (ok) timer = window.setTimeout(() => el.classList.remove('show'), 1800);
    };
}

export interface SettingsShell {
    /** Switches to a tab by id; unknown ids are ignored. */
    select(id: string): void;
}

export function initSettingsShell(api: PikaOverlayApi, initialTab: string): SettingsShell {
    const panel = document.getElementById('settings-panel') as HTMLElement;
    const tabButtons = [...panel.querySelectorAll<HTMLElement>('.settings-tab-btn')];

    const version = document.getElementById('settings-version');
    if (version) version.textContent = `v${__APP_VERSION__}`;
    initSaveQueue(api, createSaveIndicator(document.getElementById('settings-save-status') as HTMLElement));

    const updates = buildUpdates(api);
    const tabs: TabView[] = [
        buildGeneral(api), buildApi(api), buildAppearance(api), buildColumns(), buildColors(), buildWatchlist(api),
        updates, buildDebug(api),
    ];
    for (const tab of tabs) document.getElementById(`tab-${tab.id}`)?.appendChild(tab.root);
    subscribeConfig(cfg => tabs.forEach(t => t.sync(cfg)));
    api.onUpdateState(s => updates.render(s));

    let current: TabView | null = null;

    function select(id: string): void {
        const next = tabs.find(t => t.id === id);
        if (!next || next === current) return;
        current?.hide?.();
        current = next;
        for (const btn of tabButtons) {
            const on = btn.dataset.tab === id;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', String(on));
            btn.tabIndex = on ? 0 : -1;
        }
        panel.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${id}`));
        (document.getElementById('settings-body') as HTMLElement).scrollTop = 0;
        next.show?.();
    }

    tabButtons.forEach((btn, i) => {
        btn.addEventListener('click', () => select(btn.dataset.tab!));
        btn.addEventListener('keydown', e => {
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            const target = tabButtons[(i + step + tabButtons.length) % tabButtons.length]!;
            select(target.dataset.tab!);
            target.focus();
        });
    });

    select(tabs.some(t => t.id === initialTab) ? initialTab : 'general');
    return { select };
}
