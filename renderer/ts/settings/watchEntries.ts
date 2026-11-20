/** Watchlist tab, "Your list": add by name, search, edit kind and note, remove. */

import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import { WATCH_KINDS, type WatchEntry, type WatchKind } from '../../../src/shared/watchlist';
import { block, button, group, h, setStatus, textInput } from './controls';
import { runAction } from './watchAction';
import { filterEntries, formatAddedDate } from './watchText';

export interface Section {
    root: HTMLElement;
    render(entries: readonly WatchEntry[]): void;
}

export function kindSelect(value: WatchKind, label: string, onChange: (k: WatchKind) => void): HTMLSelectElement {
    const sel = h('select', 's-input s-select');
    sel.setAttribute('aria-label', label);
    for (const k of WATCH_KINDS) {
        const opt = h('option', '', k.charAt(0).toUpperCase() + k.slice(1));
        opt.value = k;
        sel.appendChild(opt);
    }
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value as WatchKind));
    return sel;
}

function buildAddForm(api: PikaOverlayApi): HTMLElement {
    const name = textInput('Player name');
    name.setAttribute('aria-label', 'Player name to add');
    const note = textInput('Note (optional)');
    note.maxLength = 120;
    note.setAttribute('aria-label', 'Note');
    let kind: WatchKind = 'sniper';
    const select = kindSelect(kind, 'Kind', k => { kind = k; });
    const add = button('Add', { icon: 'check', variant: 'primary' });
    const status = h('div', 's-status');
    const submit = async (): Promise<void> => {
        const value = name.value.trim();
        if (!value) return;
        try {
            if (await api.setWatchEntry(value, { kind, note: note.value.trim() })) {
                name.value = '';
                note.value = '';
                status.className = 's-status';
                status.replaceChildren();
            } else {
                setStatus(status, 'bad', 'circle-alert', 'Not added. Check the name and the 5000 entry limit.');
            }
        } catch (err) {
            console.error('[Settings] Add watch entry failed:', String(err));
            setStatus(status, 'bad', 'circle-alert', 'Could not add this name.');
        }
    };
    add.addEventListener('click', () => void submit());
    name.addEventListener('keydown', e => { if (e.key === 'Enter') void submit(); });
    const line = h('div', 's-inline');
    line.append(name, select, note, add);
    const wrap = h('div', 's-block');
    wrap.append(line, status);
    return wrap;
}

function buildEntryRow(api: PikaOverlayApi, e: WatchEntry, status: HTMLElement): HTMLElement {
    const item = h('div', 's-watch-row');
    item.dataset.name = e.name.toLowerCase();
    const who = h('span', 's-watch-name', e.name);
    who.title = e.name;
    // Both controls save the current values of both, so one edit never overwrites the other
    const save = (): void => void runAction(status, () => api.setWatchEntry(e.name, { kind: select.value as WatchKind, note: note.value.trim() }), `Could not save ${e.name}.`);
    const select = kindSelect(e.kind, `Kind of ${e.name}`, save);
    const note = textInput('Note');
    note.maxLength = 120;
    note.value = e.note;
    note.setAttribute('aria-label', `Note for ${e.name}`);
    const saveNote = (): void => { if (note.value.trim() !== e.note) save(); };
    note.addEventListener('blur', saveNote);
    note.addEventListener('keydown', ev => { if (ev.key === 'Enter') saveNote(); });
    const date = h('span', 's-watch-date', formatAddedDate(e.addedAt));
    date.title = 'Date added';
    const remove = button('', { icon: 'trash', variant: 'ghost', title: 'Remove' });
    remove.setAttribute('aria-label', `Remove ${e.name}`);
    remove.addEventListener('click', () => void runAction(status, () => api.setWatchEntry(e.name, null), `Could not remove ${e.name}.`));
    item.append(who, select, note, date, remove);
    return item;
}

export function buildEntries(api: PikaOverlayApi): Section {
    const g = group('Your list', 'Players you marked. The tag shows as a chip in the overlay table.');
    g.list.appendChild(buildAddForm(api));
    const search = textInput('Search names and notes');
    search.setAttribute('aria-label', 'Search your list');
    const searchWrap = h('div', 's-block');
    searchWrap.appendChild(search);
    g.list.appendChild(searchWrap);
    const items = h('div', 's-watch-items');
    const status = h('div', 's-status');
    status.setAttribute('role', 'status');
    g.list.append(items, block(status));
    let all: readonly WatchEntry[] = [];

    function render(entries: readonly WatchEntry[]): void {
        all = entries;
        // A broadcast must not wipe a note the user is typing
        const active = document.activeElement;
        if ((active instanceof HTMLInputElement || active instanceof HTMLSelectElement) && items.contains(active)) return;
        const shown = filterEntries(entries, search.value);
        items.replaceChildren(...shown.map(e => buildEntryRow(api, e, status)));
        if (shown.length === 0) {
            const hasOwn = entries.some(e => e.source === 'me');
            items.appendChild(h('p', 's-empty', hasOwn ? 'No match.' : 'Nothing here yet. Add a name above or right-click a player in the table.'));
        }
    }
    search.addEventListener('input', () => render(all));
    return { root: g.root, render };
}
