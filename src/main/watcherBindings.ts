/**
 * Log watcher event bindings. Called ONCE from main.ts (HANDOVER v2.1 rule:
 * never rebind on config saves).
 *
 * The table follows the lobby (ADR-0012): it is emptied when the lobby changes
 * (players_clear), NOT when the match starts — the players of the pre-game
 * lobby are the players of the match. Party members are pinned throughout.
 * The stats cache is never cleared here: TTL keeps it fresh. The own row and
 * the party are the exception — their stats change with every match played
 * together, so they are fetched fresh at every new lobby.
 */

import { IPC_EVENTS } from '../shared/ipc-contract';
import { pushLogLine } from './log/debugLines';
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
    /** True for the name the user plays under (username, or nick when nicked) */
    isSelf: (username: string) => boolean;
}

/** One lobby join is one refresh, however many times the join line repeats */
const LOBBY_REFRESH_MIN_GAP_MS = 20_000;

export function bindWatcherEvents(deps: WatcherBindingDeps): void {
    const { logWatcher, queue, registry, party, game, send, isSelf } = deps;
    let lastLobbyRefresh = 0;

    const removeShownExcept = (keep: ReadonlySet<string>): void => {
        for (const key of registry.clearExcept(keep)) send(IPC_EVENTS.PLAYER_REMOVE, key);
    };
    const removeShown = (key: string): void => {
        if (!registry.delete(key)) return;
        send(IPC_EVENTS.PLAYER_REMOVE, key);
    };
    const enqueue = (username: string, source: string): void =>
        queue.enqueue({ username, source, interval: null, mode: null });
    // Skips the cache; a row that is already shown is updated in place
    const enqueueFresh = (username: string, source: string): void =>
        queue.enqueue({ username, source, interval: null, mode: null, fresh: true, refresh: registry.has(username) });
    const refreshOwnSide = (self: string, source: string): void => {
        const now = Date.now();
        if (now - lastLobbyRefresh < LOBBY_REFRESH_MIN_GAP_MS) {
            enqueue(self, source);
            return;
        }
        lastLobbyRefresh = now;
        for (const member of party.snapshot()) enqueueFresh(member, 'party');
        if (!party.has(self.toLowerCase())) enqueueFresh(self, source);
    };
    // The lobby changed: lookups still waiting for players of the old one would
    // bring them back on screen and spend API budget for nothing.
    const dropStaleLookups = (): void => {
        queue.dropPending(job =>
            !job.refresh && !USER_TYPED_SOURCES.includes(job.source) && !party.has(job.username.toLowerCase()));
    };

    logWatcher.on('log_line', (line: string) => pushLogLine(line));

    logWatcher.on('players_sync', (detectedNames: string[]) => {
        // A tab roster is the truth about who is on the server; party members stay pinned.
        removeShownExcept(new Set([...detectedNames.map(n => n.toLowerCase()), ...party.snapshot()]));
    });

    logWatcher.on('pregame_start', () => send(IPC_EVENTS.GAME_PREGAME));

    logWatcher.on('game_start', () => {
        game.startGame();
        send(IPC_EVENTS.GAME_START);
    });

    logWatcher.on('game_end', () => {
        game.endGame();
        send(IPC_EVENTS.GAME_END);
    });

    logWatcher.on('players_clear', () => {
        game.reset();
        dropStaleLookups();
        removeShownExcept(new Set(party.snapshot()));
        send(IPC_EVENTS.PLAYERS_CLEAR);
    });

    logWatcher.on('player_detected', (username: string, source: string) => {
        // A roster lists spectators too: do not bring back someone eliminated in this match
        if (source === 'tab_list' && game.isEliminated(username)) return;
        // Own pre-game join = a new lobby
        if (source === 'join' && isSelf(username)) refreshOwnSide(username, source);
        else enqueue(username, source);
    });

    logWatcher.on('player_quit', (username: string) => {
        const key = username.toLowerCase();
        // Pin party members — never remove them via kill feed
        game.markEliminated(key);
        if (party.has(key)) return;
        queue.dropPending(job => !job.refresh && job.username.toLowerCase() === key);
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

        for (const name of names) enqueueFresh(name, 'party');
    });

    logWatcher.on('party_joined', (username: string) => {
        party.add(username.toLowerCase());
        send(IPC_EVENTS.PARTY_UPDATE, party.snapshot());
        console.log(`[Party] Joined: ${username}`);
        enqueueFresh(username, 'party');
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
