/** Mutations of the player map. Each one schedules a keyed re-render. */

import type { StatsPayload } from '../../../src/shared/ipc-contract';
import { renderNow, scheduleRender } from '../table/render';
import * as store from './playerStore';
import { state } from './state';

export function addLoadingRow(username: string, source: string): void {
    store.addLoading(state, username, source);
    scheduleRender();
}

/** Results for names no longer in the table (player left, table cleared) are dropped. */
export function applyResult(data: StatsPayload): void {
    if (store.applyResult(state, data)) scheduleRender();
}

/** Main decides what leaves the table (it never removes a pinned party member); no second guess here. */
export function removeRow(username: string): void {
    if (store.removeRow(state, username)) scheduleRender();
}

export function clearTable(keepParty = false): void {
    store.clearTable(state, keepParty);
    renderNow();
}

export function setParty(members: Iterable<string>): void {
    store.setParty(state, members);
    scheduleRender();
}
