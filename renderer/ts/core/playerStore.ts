/**
 * Pure mutations of the overlay's player table. No DOM, no rendering: the
 * state is passed in, so the headless simulator can bundle and drive this
 * exact code. players.ts wraps these with render scheduling.
 */

import type { StatsPayload } from '../../../src/shared/ipc-contract';
import type { RowData } from '../table/types';

/** The slice of the overlay state the player table touches. */
export interface PlayerTableState {
    players: Map<string, RowData>; // key = username.toLowerCase()
    party: Set<string>;
}

export function addLoading(state: PlayerTableState, username: string, source: string): void {
    state.players.set(username.toLowerCase(), { username, source, status: 'loading' });
}

/** Results for names no longer in the table (player left, table cleared) are dropped. Returns true when applied. */
export function applyResult(state: PlayerTableState, data: StatsPayload): boolean {
    const key = data.username.toLowerCase();
    if (!state.players.has(key)) return false;
    state.players.set(key, data);
    return true;
}

/** Main decides what leaves the table (it never removes a pinned party member); no second guess here. */
export function removeRow(state: PlayerTableState, username: string): boolean {
    return state.players.delete(username.toLowerCase());
}

export function clearTable(state: PlayerTableState, keepParty: boolean): void {
    if (keepParty && state.party.size > 0) {
        for (const key of state.players.keys()) {
            if (!state.party.has(key)) state.players.delete(key);
        }
    } else {
        state.players.clear();
    }
}

export function setParty(state: PlayerTableState, members: Iterable<string>): void {
    state.party = new Set(members);
}
