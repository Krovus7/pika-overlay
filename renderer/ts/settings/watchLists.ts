/** Watchlist tab, "Imported lists": someone else's notes, with count and remove. */

import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import type { ImportedList } from '../../../src/shared/watchlist';
import { button, group, h } from './controls';
import { formatAddedDate } from './watchText';

export interface ListsSection {
    root: HTMLElement;
    render(lists: readonly ImportedList[]): void;
}

export function buildLists(api: PikaOverlayApi): ListsSection {
    const g = group("Imported lists", "Lists from other people. They are someone else's notes: your own entries always win over them.");
    const items = h('div', 's-watch-items');
    g.list.appendChild(items);

    function render(lists: readonly ImportedList[]): void {
        const rows = lists.map(l => {
            const item = h('div', 's-watch-row s-watch-list');
            const label = h('span', 's-watch-name', l.label);
            label.title = l.label;
            const meta = h('span', 's-watch-date', `${l.count} ${l.count === 1 ? 'name' : 'names'}, ${formatAddedDate(l.importedAt)}`);
            const remove = button('Remove', { icon: 'trash', variant: 'ghost' });
            remove.setAttribute('aria-label', `Remove list ${l.label}`);
            remove.addEventListener('click', () => void api.removeWatchList(l.id));
            item.append(label, meta, remove);
            return item;
        });
        items.replaceChildren(...rows);
        if (rows.length === 0) items.appendChild(h('p', 's-empty', 'No imported lists.'));
    }
    return { root: g.root, render };
}
