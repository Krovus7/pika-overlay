/** Row context menu as plain data (no Electron types), so the content is testable. */

import type { MenuTone } from '../../shared/menu';
import { WATCH_KINDS, type WatchKind, type WatchResolved } from '../../shared/watchlist';

export interface MenuSpec {
    label: string;
    kind: 'action' | 'info' | 'separator' | 'submenu';
    tone?: MenuTone;
    checked?: boolean;
    /** True when the action worked; the overlay tells the user when it did not. */
    click?: () => boolean;
    items?: MenuSpec[];
}

export interface MenuInput {
    name: string;
    nicked: boolean;
    resolved: WatchResolved | undefined;
    partyMembers: readonly string[];
    mark: (kind: WatchKind, note: string) => boolean;
    unmark: () => boolean;
    editNote: () => boolean;
    link: (friend: string | null) => boolean;
}

const KIND_ITEM: Record<WatchKind, string> = {
    sniper: 'Mark as sniper', cheater: 'Mark as cheater', other: 'Mark as other',
};

const SEPARATOR: MenuSpec = { label: '', kind: 'separator' };

export function buildMenuSpec(input: MenuInput): MenuSpec[] {
    const { nicked, resolved } = input;
    const items: MenuSpec[] = [];
    if (nicked) {
        items.push({ label: 'This is a nick: the tag follows the nick, not the player', kind: 'info' }, SEPARATOR);
    }
    // Changing the kind keeps the note of an own entry; an imported note stays with its list.
    const keptNote = resolved && !resolved.imported ? resolved.note : '';
    const ownKind = resolved && !resolved.imported ? resolved.kind : undefined;
    for (const kind of WATCH_KINDS) {
        items.push({
            label: KIND_ITEM[kind], kind: 'action', tone: kind, checked: ownKind === kind, click: () => input.mark(kind, keptNote),
        });
    }
    items.push(SEPARATOR, { label: 'Edit note in Settings', kind: 'action', click: input.editNote });
    if (resolved) {
        if (!resolved.imported) items.push({ label: 'Remove from watchlist', kind: 'action', tone: 'danger', click: input.unmark });
        else items.push({ label: `From list: ${resolved.sourceLabel}`, kind: 'info' });
    }
    if (nicked) {
        const members: MenuSpec[] = input.partyMembers.map(m => ({ label: m, kind: 'action', click: () => input.link(m) }));
        items.push(SEPARATOR, {
            label: 'This is my teammate',
            kind: 'submenu',
            items: [...members, { label: 'Someone else', kind: 'action', click: () => input.link(null) }],
        });
    }
    return items;
}
