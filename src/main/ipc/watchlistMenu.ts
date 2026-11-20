/** watchlist:menu — the native row context menu, built in main and popped up over the calling window. */

import { BrowserWindow, Menu, ipcMain, type MenuItemConstructorOptions } from 'electron';

import { IPC_CHANNELS } from '../../shared/ipc-contract';
import type { PartyState } from '../state';
import { buildMenuSpec } from '../watchlist/menuSpec';
import { notifyWatchlist } from '../watchlist/notify';
import type { WatchlistStore } from '../watchlist/store';

export interface WatchlistMenuDeps {
    store: WatchlistStore;
    party: PartyState;
    linkNick: (nick: string, friend: string | null) => boolean;
}

export function registerWatchlistMenu({ store, party, linkNick }: WatchlistMenuDeps): void {
    ipcMain.handle(IPC_CHANNELS.WATCHLIST_MENU, (e, name: unknown, nicked: unknown) => {
        if (typeof name !== 'string' || !name) return;
        const change = (change: Parameters<WatchlistStore['setOwn']>[1]): void => {
            if (store.setOwn(name, change)) notifyWatchlist(store);
        };
        const spec = buildMenuSpec({
            name,
            nicked: nicked === true,
            resolved: store.view().resolved[name.toLowerCase()],
            partyMembers: party.snapshot(),
            mark: (kind, note) => change({ kind, note }),
            unmark: () => change(null),
            link: friend => { if (linkNick(name, friend)) notifyWatchlist(store); },
        });
        const window = BrowserWindow.fromWebContents(e.sender) ?? undefined;
        Menu.buildFromTemplate(spec as MenuItemConstructorOptions[]).popup({ window });
    });
}
