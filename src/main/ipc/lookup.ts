/**
 * Player lookup worker — ported from pika-overlay-v3/src/ipcHandlers.js
 * `lookup()`. Deduplicates via the registry, sends loading/stats/error events
 * to the overlay, and keeps the race-condition guard: a player who quit while
 * the API call was in flight is discarded.
 */

import type { BrowserWindow } from 'electron';

import type { PlayerStats } from '../../shared/types';
import { getPlayerStats } from '../api/apiClient';
import type { ConfigStore } from '../config';
import type { PlayerRegistry } from '../state';

export interface LookupDeps {
    store: ConfigStore;
    registry: PlayerRegistry;
    getOverlayWin: () => BrowserWindow | null;
}

export async function lookup(
    username: string,
    source: string,
    interval: string | null,
    mode: string | null,
    deps: LookupDeps,
): Promise<PlayerStats | null> {
    if (!username) return null;
    const key = username.toLowerCase();
    if (deps.registry.has(key)) return null;
    deps.registry.add(key);

    const overlayWin = deps.getOverlayWin();
    overlayWin?.webContents.send('player:loading', { username, source });

    const ivl = interval || deps.store.get('statsInterval') || 'total';
    const mod = mode || deps.store.get('statsMode') || 'ALL_MODES';
    const stats = await getPlayerStats(username, ivl, mod);

    // Race-condition guard: player quit while API call was in flight
    if (!deps.registry.has(key)) {
        console.log(`[lookup] ${username} left before stats arrived — discarding`);
        return null;
    }

    if (!overlayWin) return stats;

    if (!stats || stats.error) {
        overlayWin.webContents.send('player:error', { username, source });
    } else {
        overlayWin.webContents.send('player:stats', { ...stats, source });
    }

    return stats;
}
