/**
 * Shared state singletons (ADR-0003) — the single source of truth consumed by
 * the log watcher bindings and the IPC handlers. Classes are exported for
 * unit tests; these instances are the app-level wiring.
 */

import { GameState } from './gameState';
import { PartyState } from './partyState';
import { PlayerRegistry } from './playerRegistry';
import { LookupQueue } from './lookupQueue';

export { GameState } from './gameState';
export { PartyState } from './partyState';
export { PlayerRegistry } from './playerRegistry';
export { LookupQueue, LOOKUP_CONCURRENCY, type LookupJob } from './lookupQueue';

export const gameState = new GameState();
export const partyState = new PartyState();
export const playerRegistry = new PlayerRegistry();
