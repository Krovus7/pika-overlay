/**
 * Lookup queue — FIFO queue with bounded concurrency (v3 rule: max 6 lookups,
 * ~12 HTTP in-flight; never raise above 8 without load tests — HANDOVER v2.7).
 * Worker errors are logged, never silent, and never break the queue.
 */

export interface LookupJob {
    username: string;
    source: string;
    interval: string | null;
    mode: string | null;
}

export const LOOKUP_CONCURRENCY = 6;

export class LookupQueue {
    private active = 0;
    private jobs: LookupJob[] = [];

    constructor(
        private readonly worker: (job: LookupJob) => Promise<void>,
        private readonly concurrency = LOOKUP_CONCURRENCY,
    ) {}

    enqueue(job: LookupJob): void {
        this.jobs.push(job);
        this.drain();
    }

    get activeCount(): number {
        return this.active;
    }

    get pendingCount(): number {
        return this.jobs.length;
    }

    private drain(): void {
        while (this.active < this.concurrency && this.jobs.length > 0) {
            const job = this.jobs.shift()!;
            this.active++;
            Promise.resolve()
                .then(() => this.worker(job))
                .catch(err => console.error('[LookupQueue] Worker error:', String(err)))
                .finally(() => {
                    this.active--;
                    this.drain();
                });
        }
    }
}
