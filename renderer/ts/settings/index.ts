/**
 * Settings panel shell: open/close, tab switching, the "Saved" indicator and
 * wiring of the per-tab modules. Every control saves itself (see saveQueue).
 */

import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import { buildApi } from './tabApi';
import { buildAppearance } from './tabAppearance';
import { buildColors } from './tabColors';
import { buildColumns } from './tabColumns';
import { buildDebug } from './tabDebug';
import { buildGeneral } from './tabGeneral';
import { buildUpdates } from './tabUpdates';
import { initSaveQueue, flushSaves, type SaveStatus } from './saveQueue';
import { notifySettingsConfig, subscribeConfig } from './store';
import { svgIcon } from './controls';
import type { TabView } from './types';

function showVersion(): void {
    const label = `v${__APP_VERSION__}`;
    const titleBar = document.querySelector('.logo-version');
    if (titleBar) titleBar.textContent = label;
    const header = document.getElementById('settings-version');
    if (header) header.textContent = label;
}

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

export function initSettingsPanel(api: PikaOverlayApi): void {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;
    const openBtn = document.getElementById('btn-settings') as HTMLElement;
    const closeBtn = document.getElementById('btn-settings-close-x') as HTMLElement;
    const tabButtons = [...panel.querySelectorAll<HTMLElement>('.settings-tab-btn')];

    showVersion();
    initSaveQueue(api, createSaveIndicator(document.getElementById('settings-save-status') as HTMLElement));

    const updates = buildUpdates(api);
    const tabs: TabView[] = [
        buildGeneral(api), buildApi(api), buildAppearance(), buildColumns(), buildColors(), updates, buildDebug(api),
    ];
    for (const tab of tabs) document.getElementById(`tab-${tab.id}`)?.appendChild(tab.root);
    subscribeConfig(cfg => tabs.forEach(t => t.sync(cfg)));
    api.onUpdateState(s => updates.render(s));

    let isOpen = false;
    let current = tabs[0]!;

    function select(id: string): void {
        const next = tabs.find(t => t.id === id);
        if (!next) return;
        current.hide?.();
        current = next;
        for (const btn of tabButtons) {
            const on = btn.dataset.tab === id;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', String(on));
            btn.tabIndex = on ? 0 : -1;
        }
        panel!.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${id}`));
        (document.getElementById('settings-body') as HTMLElement).scrollTop = 0;
        if (isOpen) current.show?.();
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

    async function open(): Promise<void> {
        if (isOpen) return;
        isOpen = true;
        try {
            notifySettingsConfig(await api.getAllConfig());
        } catch (err) {
            console.error('[Settings] Loading config failed:', String(err));
        }
        panel!.classList.add('visible');
        current.show?.();
        panel!.querySelector<HTMLElement>('.settings-tab-btn.active')?.focus();
    }

    function close(): void {
        if (!isOpen) return;
        isOpen = false;
        panel!.classList.remove('visible');
        current.hide?.();
        void flushSaves();
        openBtn.focus();
    }

    openBtn.addEventListener('click', () => void open());
    closeBtn.addEventListener('click', close);
    api.onSettingsShow(() => void open());
    document.addEventListener('keydown', e => { if (isOpen && e.key === 'Escape') close(); });
    select('general');
}
