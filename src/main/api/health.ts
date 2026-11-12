/**
 * Global API health — one signal for the whole overlay instead of one error
 * per row. Combines key state, rate-limit pause and reachability.
 */

import type { ApiHealth } from '../../shared/types';
import { rateLimiter } from './rateLimiter';

type KeyStatus = 'ok' | 'key_missing' | 'key_invalid';
type Listener = (health: ApiHealth) => void;

export class HealthTracker {
    private keyStatus: KeyStatus = 'key_missing';
    private pausedUntil: number | null = null;
    private unreachable = false;
    private current: ApiHealth = { kind: 'key_missing' };
    private readonly listeners = new Set<Listener>();

    get(): ApiHealth {
        return this.current;
    }

    onChange(cb: Listener): () => void {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    }

    setKeyStatus(status: KeyStatus): void {
        this.keyStatus = status;
        this.update();
    }

    setPausedUntil(retryAt: number | null): void {
        this.pausedUntil = retryAt;
        this.update();
    }

    setUnreachable(value: boolean): void {
        this.unreachable = value;
        this.update();
    }

    isAuthBlocked(): boolean {
        return this.keyStatus !== 'ok';
    }

    private compute(): ApiHealth {
        if (this.keyStatus !== 'ok') return { kind: this.keyStatus };
        if (this.pausedUntil !== null) return { kind: 'rate_limited', retryAt: this.pausedUntil };
        if (this.unreachable) return { kind: 'unreachable' };
        return { kind: 'ok' };
    }

    private update(): void {
        const next = this.compute();
        if (JSON.stringify(next) === JSON.stringify(this.current)) return;
        this.current = next;
        for (const cb of this.listeners) cb(next);
    }
}

export const health = new HealthTracker();
rateLimiter.onPauseChange(retryAt => health.setPausedUntil(retryAt));

export const getHealth = (): ApiHealth => health.get();
export const onHealthChange = (cb: Listener): (() => void) => health.onChange(cb);
