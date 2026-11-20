/** watchlist:menu and watchlist:menuPick — main decides what the row menu offers and runs the pick; the overlay draws it. */

import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract';
import type { MenuView } from '../../shared/menu';
import type { PartyState } from '../state';
import { buildMenuSpec } from '../watchlist/menuSpec';
import { MenuSession } from '../watchlist/menuSession';
import { openSettings } from '../settingsWindow';
import { toResolved } from '../watchlist/resolve';
import { notifyWatchlist } from '../watchlist/notify';
import type { WatchlistStore } from '../watchlist/store';

export interface WatchlistMenuDeps {
    store: WatchlistStore;
    party: PartyState;
    linkNick: (nick: string, friend: string | null) => boolean;
}

export function registerWatchlistMenu({ store, party, linkNick }: WatchlistMenuDeps): void {
    const session = new MenuSession();

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_MENU, (_e, name: unknown, nicked: unknown): MenuView | null => {
        if (typeof name !== 'string' || !name) return null;
        const change = (change: Parameters<WatchlistStore['setOwn']>[1]): boolean => {
            const ok = store.setOwn(name, change);
            if (ok) notifyWatchlist(store);
            return ok;
        };
        const found = store.lookup(name);
        const spec = buildMenuSpec({
            name,
            nicked: nicked === true,
            resolved: found && toResolved(found, store.snapshot().lists),
            partyMembers: party.snapshot(),
            mark: (kind, note) => change({ kind, note }),
            unmark: () => change(null),
            editNote: () => { openSettings('watchlist'); return true; },
            link: friend => {
                const ok = linkNick(name, friend);
                if (ok) notifyWatchlist(store);
                return ok;
            },
        });
        return session.open(name, spec);
    });

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_MENU_PICK, (_e, token: unknown, id: unknown): boolean => session.pick(token, id));
}
