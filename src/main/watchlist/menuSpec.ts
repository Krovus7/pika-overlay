/** Row context menu as plain data (no Electron types), so the content is testable. */

import { WATCH_KINDS, type WatchKind, type WatchResolved } from '../../shared/watchlist';

export interface MenuSpec {
    label?: string;
    type?: 'separator';
    enabled?: boolean;
    click?: () => void;
    submenu?: MenuSpec[];
}

export interface MenuInput {
    name: string;
    nicked: boolean;
    resolved: WatchResolved | undefined;
    partyMembers: readonly string[];
    mark: (kind: WatchKind, note: string) => void;
    unmark: () => void;
    link: (friend: string | null) => void;
}

const KIND_ITEM: Record<WatchKind, string> = {
    sniper: 'Mark as sniper', cheater: 'Mark as cheater', other: 'Mark as other',
};

/** A native menu reads `&` as a mnemonic marker; user and imported text must show it literally. */
export const menuText = (text: string): string => text.replace(/&/g, '&&');

const SEPARATOR: MenuSpec = { type: 'separator' };

export function buildMenuSpec(input: MenuInput): MenuSpec[] {
    const { nicked, resolved } = input;
    const items: MenuSpec[] = [];
    if (nicked) {
        items.push({ label: 'This is a nick: the tag follows the nick, not the player', enabled: false }, SEPARATOR);
    }
    // Changing the kind keeps the note of an own entry; an imported note stays with its list.
    const keptNote = resolved && !resolved.imported ? resolved.note : '';
    for (const kind of WATCH_KINDS) {
        items.push({ label: KIND_ITEM[kind], click: () => input.mark(kind, keptNote) });
    }
    if (resolved) {
        items.push(SEPARATOR);
        if (!resolved.imported) items.push({ label: 'Remove from watchlist', click: input.unmark });
        else items.push({ label: menuText(`From list: ${resolved.sourceLabel}`), enabled: false });
    }
    if (nicked) {
        const members: MenuSpec[] = input.partyMembers.map(m => ({ label: menuText(m), click: () => input.link(m) }));
        items.push(SEPARATOR, {
            label: 'This is my teammate',
            submenu: [...members, { label: 'Someone else', click: () => input.link(null) }],
        });
    }
    return items;
}
