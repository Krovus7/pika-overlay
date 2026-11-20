/** Watchlist tab, "Nick links": a nick marked as a teammate is hidden from the table; remove a link here. */

import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import type { NickLink } from '../../../src/shared/watchlist';
import { block, button, group, h } from './controls';
import { runAction } from './watchAction';
import { formatAddedDate, friendLabel, nickLinksSorted } from './watchText';

export interface NickLinksSection {
    root: HTMLElement;
    render(links: readonly NickLink[]): void;
}

export function buildNickLinks(api: PikaOverlayApi): NickLinksSection {
    const g = group('Nick links', 'Nicks you marked as a teammate are hidden from the table. Remove a link to see that nick again.');
    const items = h('div', 's-watch-items');
    const status = h('div', 's-status');
    status.setAttribute('role', 'status');
    g.list.append(items, block(status));

    function render(links: readonly NickLink[]): void {
        const rows = nickLinksSorted(links).map(l => {
            const item = h('div', 's-watch-row s-watch-list');
            const nick = h('span', 's-watch-name', `${l.nick}  →  ${friendLabel(l)}`);
            nick.title = nick.textContent ?? '';
            const date = h('span', 's-watch-date', formatAddedDate(l.addedAt));
            const remove = button('Remove', { icon: 'trash', variant: 'ghost' });
            remove.setAttribute('aria-label', `Remove link for ${l.nick}`);
            remove.addEventListener('click', () => void runAction(status, () => api.unlinkNick(l.nick), `Could not remove the link for ${l.nick}.`));
            item.append(nick, date, remove);
            return item;
        });
        items.replaceChildren(...rows);
        if (rows.length === 0) items.appendChild(h('p', 's-empty', 'No nick links. Right-click a NICKED row in the table to add one.'));
    }
    return { root: g.root, render };
}
