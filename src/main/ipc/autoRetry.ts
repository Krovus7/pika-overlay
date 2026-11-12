/**
 * Automatic retry of rows that ended in `error` / `rate_limited`: at most
 * `delaysMs.length` extra attempts per player. A rate-limited retry never
 * fires before the API said requests resume.
 */

import type { PlayerStatus } from '../../shared/types';

export const DEFAULT_RETRY_DELAYS_MS = [4_000, 12_000];

export interface AutoRetryOptions {
    /** Still registered and API health not key-related */
    isEligible: (key: string) => boolean;
    /** Re-runs the lookup of `key` */
    run: (key: string) => void;
    /** Epoch ms at which requests resume, when paused */
    retryAt?: () => number | null;
    delaysMs?: number[];
    now?: () => number;
}

export class AutoRetry {
    private readonly attempts = new Map<string, number>();
    private readonly timers = new Map<string, NodeJS.Timeout>();
    private readonly delaysMs: number[];

    constructor(private readonly opts: AutoRetryOptions) {
        this.delaysMs = opts.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    }

    /** Call with every lookup outcome; schedules the next attempt when due */
    onResult(key: string, status: PlayerStatus): void {
        this.cancelTimer(key);
        if (status !== 'error' && status !== 'rate_limited') {
            this.attempts.delete(key);
            return;
        }
        const done = this.attempts.get(key) ?? 0;
        if (done >= this.delaysMs.length) return;
        this.attempts.set(key, done + 1);

        let delay = this.delaysMs[done]!;
        if (status === 'rate_limited') {
            const resumeAt = this.opts.retryAt?.() ?? null;
            if (resumeAt !== null) delay = Math.max(delay, resumeAt - (this.opts.now ?? Date.now)());
        }

        const timer = setTimeout(() => {
            this.timers.delete(key);
            if (this.opts.isEligible(key)) this.opts.run(key);
        }, delay);
        timer.unref?.();
        this.timers.set(key, timer);
    }

    /** Forget a player (manual retry, removal, re-detection): counter back to zero */
    reset(key: string): void {
        this.cancelTimer(key);
        this.attempts.delete(key);
    }

    private cancelTimer(key: string): void {
        const timer = this.timers.get(key);
        if (timer) clearTimeout(timer);
        this.timers.delete(key);
    }
}
