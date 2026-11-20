import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import type { WatchlistView } from '../../../src/shared/watchlist';
import { h } from './controls';
import type { TabView } from './types';
import { buildEntries } from './watchEntries';
import { buildLists } from './watchLists';
import { buildNickLinks } from './watchNickLinks';
import { buildSniper } from './watchSniper';
import { buildTransfer } from './watchTransfer';

/** Watchlist tab: the lists come from watchlist:get / watchlist:updated, the two settings groups from the config. */
export function buildWatchlist(api: PikaOverlayApi): TabView {
    const root = h('div', 's-tab-content');
    const entries = buildEntries(api);
    const lists = buildLists(api);
    const nickLinks = buildNickLinks(api);
    const sniper = buildSniper();
    root.append(entries.root, lists.root, buildTransfer(api), nickLinks.root, ...sniper.roots);

    const render = (view: WatchlistView): void => {
        entries.render(view.entries);
        lists.render(view.lists);
        nickLinks.render(view.nickLinks);
    };
    api.onWatchlistUpdate(render);
    api.getWatchlist().then(render).catch(err => console.error('[Settings] Loading watchlist failed:', String(err)));

    return { id: 'watchlist', root, sync: sniper.sync };
}
