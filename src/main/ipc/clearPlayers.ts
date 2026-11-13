/**
 * Manual clear (button and hotkey share it): party members stay pinned, every
 * lookup still waiting for a removed player is dropped so it cannot bring the
 * row back, and the stats cache is emptied (the user asked for fresh data).
 */

import { IPC_EVENTS } from '../../shared/ipc-contract';
import { cache } from '../api/cache';
import type { LookupQueue, PartyState, PlayerRegistry } from '../state';

export interface ClearDeps {
    registry: PlayerRegistry;
    party: PartyState;
    queue: LookupQueue;
    send: (channel: string, ...args: unknown[]) => void;
}

export function clearPlayers({ registry, party, queue, send }: ClearDeps): void {
    queue.dropPending(job => !party.has(job.username.toLowerCase()));
    const removed = registry.clearExcept(new Set(party.snapshot()));
    cache.clear();
    for (const key of removed) send(IPC_EVENTS.PLAYER_REMOVE, key);
    send(IPC_EVENTS.PLAYERS_CLEAR);
}
