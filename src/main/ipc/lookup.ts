/**
 * Player lookup service. `lookup` registers a new player (registry dedupe);
 * `refresh` re-runs an already registered one with its original name and
 * source. Both send player:loading, then exactly one player:stats carrying
 * the status. Race guards: a player removed while the request was in flight,
 * or a run superseded by a newer one for the same player, is discarded.
 */

import type { BrowserWindow } from 'electron';

import { IPC_EVENTS, type StatsPayload } from '../../shared/ipc-contract';
import { USER_TYPED_SOURCES, type PlayerResult } from '../../shared/types';
import { getPlayerStats } from '../api/apiClient';
import { getHealth, health } from '../api/health';
import type { ConfigStore } from '../config';
import type { LookupQueue, PlayerRegistry } from '../state';
import { AutoRetry } from './autoRetry';

export interface LookupDeps {
    store: ConfigStore;
    registry: PlayerRegistry;
    getOverlayWin: () => BrowserWindow | null;
}

/** The client only says not_found; a name seen live in a game is a nick. */
export function applySource(result: PlayerResult, source: string): PlayerResult {
    if (result.status === 'not_found' && !USER_TYPED_SOURCES.includes(source)) {
        return { username: result.username, status: 'nicked' };
    }
    return result;
}

export class LookupService {
    private readonly runs = new Map<string, number>();
    readonly autoRetry: AutoRetry;

    constructor(private readonly deps: LookupDeps, retryDelaysMs?: number[]) {
        this.autoRetry = new AutoRetry({
            delaysMs: retryDelaysMs,
            isEligible: key => deps.registry.has(key) && !health.isAuthBlocked(),
            run: key => { void this.refresh(key); },
            retryAt: () => {
                const h = getHealth();
                return h.kind === 'rate_limited' ? h.retryAt : null;
            },
        });
    }

    async lookup(
        username: string,
        source: string,
        interval: string | null,
        mode: string | null,
    ): Promise<PlayerResult | null> {
        const name = username?.trim();
        if (!name) return null;
        if (!this.deps.registry.add(name, source)) return null;
        this.autoRetry.reset(name.toLowerCase());
        return this.run(name, source, interval, mode);
    }

    /** Re-fetches a registered player; null when it is no longer registered */
    async refresh(
        username: string,
        interval: string | null = null,
        mode: string | null = null,
    ): Promise<PlayerResult | null> {
        const entry = this.deps.registry.get(username);
        if (!entry) return null;
        return this.run(entry.name, entry.source, interval, mode);
    }

    /** User-initiated retry: the automatic-retry budget starts over */
    retry(username: string): Promise<PlayerResult | null> {
        this.autoRetry.reset(username.toLowerCase());
        return this.refresh(username);
    }

    /** Queues a refresh of every registered player, sources preserved */
    refreshAll(queue: LookupQueue, interval: string | null, mode: string | null): void {
        for (const { name, source } of this.deps.registry.entries()) {
            this.autoRetry.reset(name.toLowerCase());
            queue.enqueue({ username: name, source, interval, mode, refresh: true });
        }
    }

    private async run(
        name: string,
        source: string,
        interval: string | null,
        mode: string | null,
    ): Promise<PlayerResult | null> {
        const { store, registry, getOverlayWin } = this.deps;
        const key = name.toLowerCase();
        const token = (this.runs.get(key) ?? 0) + 1;
        this.runs.set(key, token);

        getOverlayWin()?.webContents.send(IPC_EVENTS.PLAYER_LOADING, { username: name, source });

        const raw = await getPlayerStats(
            name,
            interval || store.get('statsInterval') || 'total',
            mode || store.get('statsMode') || 'ALL_MODES',
        );

        if (this.runs.get(key) !== token) return null;
        this.runs.delete(key);

        if (!registry.has(key)) {
            console.log(`[lookup] ${name} left before stats arrived — discarding`);
            return null;
        }
        if (!raw) return null;

        const result = applySource(raw, source);
        const payload: StatsPayload = { ...result, source };
        getOverlayWin()?.webContents.send(IPC_EVENTS.PLAYER_STATS, payload);
        this.autoRetry.onResult(key, result.status);
        return result;
    }
}
