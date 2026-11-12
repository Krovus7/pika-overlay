/**
 * Log watcher event bindings. Called ONCE from main.ts (HANDOVER v2.1 rule:
 * never rebind on config saves). The stats cache is deliberately NOT cleared
 * on game_start / players_clear: TTL keeps data fresh and pre-game lobby
 * players are re-detected in-game, so clearing would double the requests.
 */

import { IPC_EVENTS } from '../shared/ipc-contract';
import { pushLogLine } from './ipc/handlers';
import type { LogWatcher } from './log/logWatcher';
import { USER_TYPED_SOURCES } from '../shared/types';
import type { GameState, LookupQueue, PartyState, PlayerRegistry } from './state';

export interface WatcherBindingDeps {
    logWatcher: LogWatcher;
    queue: LookupQueue;
    registry: PlayerRegistry;
    party: PartyState;
    game: GameState;
    send: (channel: string, ...args: unknown[]) => void;
}

export function bindWatcherEvents(deps: WatcherBindingDeps): void {
    const { logWatcher, queue, registry, party, game, send } = deps;

    const removeShownExcept = (keep: ReadonlySet<string>): void => {
        for (const key of registry.clearExcept(keep)) send(IPC_EVENTS.PLAYER_REMOVE, key);
    };
    const removeShown = (key: string): void => {
        if (!registry.delete(key)) return;
        send(IPC_EVENTS.PLAYER_REMOVE, key);
    };
    const enqueue = (username: string, source: string): void =>
        queue.enqueue({ username, source, interval: null, mode: null });
    // The lobby changed: lookups still waiting for players of the old one would
    // bring them back on screen and spend API budget for nothing.
    const dropStaleLookups = (): void => {
        queue.dropPending(job =>
            !job.refresh && !USER_TYPED_SOURCES.includes(job.source) && !party.has(job.username.toLowerCase()));
    };

    logWatcher.on('log_line', (line: string) => pushLogLine(line));

    logWatcher.on('players_sync', (detectedNames: string[]) => {
        // Block tab updates mid-game
        if (game.isInGame()) return;
        removeShownExcept(new Set(detectedNames.map(n => n.toLowerCase())));
    });

    logWatcher.on('pregame_start', () => send(IPC_EVENTS.GAME_PREGAME));

    logWatcher.on('game_start', () => {
        game.setInGame(true);
        // Pin party members, clear other players from tracking
        dropStaleLookups();
        removeShownExcept(new Set(party.snapshot()));
        send(IPC_EVENTS.GAME_START);
    });

    logWatcher.on('game_end', () => {
        game.setInGame(false);
        send(IPC_EVENTS.GAME_END);
    });

    logWatcher.on('players_clear', () => {
        game.setInGame(false);
        dropStaleLookups();
        removeShownExcept(new Set(party.snapshot()));
        send(IPC_EVENTS.PLAYERS_CLEAR);
    });

    logWatcher.on('player_detected', (username: string, source: string) => {
        // Block tab detections mid-game
        if (game.isInGame() && source === 'tab_list') return;
        enqueue(username, source);
    });

    logWatcher.on('player_quit', (username: string) => {
        const key = username.toLowerCase();
        // Pin party members — never remove them via kill feed
        if (party.has(key)) return;
        removeShown(key);
    });

    logWatcher.on('party_members', (names: string[]) => {
        const newSet = new Set(names.map(n => n.toLowerCase()));

        // Remove players no longer in the party from overlay
        for (const key of party.snapshot()) {
            if (!newSet.has(key)) removeShown(key);
        }

        party.clear();
        names.forEach(n => party.add(n));
        send(IPC_EVENTS.PARTY_UPDATE, party.snapshot());
        console.log(`[Party] Sync: ${party.snapshot().join(', ')}`);

        for (const name of names) enqueue(name, 'party');
    });

    logWatcher.on('party_joined', (username: string) => {
        party.add(username.toLowerCase());
        send(IPC_EVENTS.PARTY_UPDATE, party.snapshot());
        console.log(`[Party] Joined: ${username}`);
        enqueue(username, 'party');
    });

    logWatcher.on('party_left', (username: string) => {
        const key = username.toLowerCase();
        party.delete(key);
        removeShown(key);
        send(IPC_EVENTS.PARTY_UPDATE, party.snapshot());
        console.log(`[Party] Left: ${username} — removed from overlay`);
    });

    logWatcher.on('party_clear', () => {
        for (const key of party.snapshot()) removeShown(key);
        party.clear();
        send(IPC_EVENTS.PARTY_UPDATE, []);
        console.log('[Party] Cleared — all pins and party players removed from overlay');
    });
}
