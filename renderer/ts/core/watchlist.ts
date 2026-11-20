/** Watchlist in the overlay: the resolved view for the table, and the alert when a watched player arrives. */

import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import type { WatchAlert, WatchlistView } from '../../../src/shared/watchlist';
import { scheduleRender } from '../table/render';
import { alertText } from '../table/watchView';
import { playBeep } from '../ui/beep';
import { showToast } from '../ui/toast';
import { state } from './state';

const ALERT_TOAST_MS = 6000;

function applyView(view: WatchlistView): void {
    // A Map: names like "constructor" are valid player names
    state.watch = new Map(Object.entries(view.resolved));
    scheduleRender();
}

function onAlert(alert: WatchAlert): void {
    showToast(alertText(alert.kind, alert.name), ALERT_TOAST_MS);
    if (state.watchlistSound) playBeep();
}

export function initWatchlist(api: PikaOverlayApi): void {
    api.onWatchlistUpdate(applyView);
    api.onWatchlistAlert(onAlert);
    api.getWatchlist().then(applyView).catch(err => console.error('[Overlay] Watchlist load failed:', String(err)));
}
