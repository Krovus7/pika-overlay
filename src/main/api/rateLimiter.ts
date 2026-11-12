/**
 * Rate budget for the Pika API (120 req/min per key). Pure and clock-injectable:
 * observes x-ratelimit-* headers, makes requests wait instead of being sent when
 * the window budget is spent, and pauses everything after a 429/503.
 */

export interface Clock {
    now(): number;
    sleep(ms: number): Promise<void>;
    /** Fire-and-forget timer that must not keep the process alive */
    after(ms: number, cb: () => void): void;
}

export const systemClock: Clock = {
    now: () => Date.now(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    after: (ms, cb) => { setTimeout(cb, ms).unref(); },
};

export interface RateHeaders {
    limit?: number;
    remaining?: number;
    resetSec?: number;
    retryAfterSec?: number;
}

const RESERVE = 1;
const MAX_PAUSE_MS = 120_000;

function headerNumber(headers: Headers, name: string): number | undefined {
    const raw = headers.get(name);
    if (raw === null || raw.trim() === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function readRateHeaders(headers: Headers): RateHeaders {
    return {
        limit: headerNumber(headers, 'x-ratelimit-limit'),
        remaining: headerNumber(headers, 'x-ratelimit-remaining'),
        resetSec: headerNumber(headers, 'x-ratelimit-reset'),
        retryAfterSec: headerNumber(headers, 'retry-after'),
    };
}

type PauseListener = (retryAt: number | null) => void;

export class RateLimiter {
    private limit: number | null = null;
    private remaining: number | null = null;
    private windowEnd = 0;
    private pausedUntil = 0;
    private inFlight = 0;
    private waiters = 0;
    private lastNotified: number | null = null;
    private readonly listeners = new Set<PauseListener>();

    constructor(private readonly clock: Clock = systemClock) {}

    onPauseChange(cb: PauseListener): void {
        this.listeners.add(cb);
    }

    observe(h: RateHeaders): void {
        const now = this.clock.now();
        if (h.limit !== undefined) this.limit = h.limit;
        if (h.remaining === undefined) return;
        const sameWindow = now < this.windowEnd;
        this.remaining = sameWindow && this.remaining !== null
            ? Math.min(this.remaining, h.remaining)
            : h.remaining;
        if (h.resetSec !== undefined && (!sameWindow || h.resetSec > 0)) {
            this.windowEnd = now + h.resetSec * 1000;
        }
    }

    pauseFor(ms: number): void {
        const until = this.clock.now() + Math.min(Math.max(ms, 0), MAX_PAUSE_MS);
        if (until <= this.pausedUntil) return;
        this.pausedUntil = until;
        this.notify(until);
        this.clock.after(until - this.clock.now(), () => this.settle());
    }

    /** Resolves when a request may be sent; the returned function marks it finished. */
    async acquire(): Promise<() => void> {
        let waiting = false;
        for (;;) {
            const now = this.clock.now();
            const wait = this.waitMs(now);
            if (wait <= 0) break;
            if (!waiting) { waiting = true; this.waiters++; }
            this.notify(now + wait);
            await this.clock.sleep(wait);
        }
        if (waiting) {
            this.waiters--;
            this.settle();
        }
        this.inFlight++;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.inFlight--;
        };
    }

    reset(): void {
        this.limit = null;
        this.remaining = null;
        this.windowEnd = 0;
        this.pausedUntil = 0;
        this.notify(null);
    }

    private waitMs(now: number): number {
        let wait = Math.max(0, this.pausedUntil - now);
        if (this.remaining !== null) {
            if (now >= this.windowEnd) {
                this.remaining = this.limit;
            } else if (this.remaining - this.inFlight <= RESERVE) {
                wait = Math.max(wait, this.windowEnd - now);
            }
        }
        return wait;
    }

    private settle(): void {
        if (this.waiters === 0 && this.clock.now() >= this.pausedUntil) this.notify(null);
    }

    private notify(retryAt: number | null): void {
        if (retryAt === this.lastNotified) return;
        this.lastNotified = retryAt;
        for (const cb of this.listeners) cb(retryAt);
    }
}

export const rateLimiter = new RateLimiter();
