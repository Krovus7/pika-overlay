/** Mutations of the player map. Each one schedules a keyed re-render. */

import type { StatsPayload } from '../../../src/shared/ipc-contract';
import { renderNow, scheduleRender } from '../table/render';
import { state } from './state';

export function addLoadingRow(username: string, source: string): void {
    state.players.set(username.toLowerCase(), { username, source, status: 'loading' });
    scheduleRender();
}

/** Results for names no longer in the table (player left, table cleared) are dropped. */
export function applyResult(data: StatsPayload): void {
    const key = data.username.toLowerCase();
    if (!state.players.has(key)) return;
    state.players.set(key, data);
    scheduleRender();
}

export function removeRow(username: string): void {
    const key = username.toLowerCase();
    if (state.party.has(key) || !state.players.delete(key)) return;
    scheduleRender();
}

export function clearTable(keepParty = false): void {
    if (keepParty && state.party.size > 0) {
        for (const key of state.players.keys()) {
            if (!state.party.has(key)) state.players.delete(key);
        }
    } else {
        state.players.clear();
    }
    renderNow();
}
