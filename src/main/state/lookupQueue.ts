/**
 * Lookup queue — bounded concurrency (v3 rule: max 6 lookups, ~12 HTTP
 * in-flight; never raise above 8 without load tests — HANDOVER v2.7).
 * The API budget is 120 requests/minute, so order matters when a backlog
 * builds: party members and names the user typed go ahead of the backlog
 * (FIFO within each class), and pending jobs can be dropped when the lobby
 * they belong to is gone. Worker errors are logged and never break the queue.
 */

export interface LookupJob {
    username: string;
    source: string;
    interval: string | null;
    mode: string | null;
    /** Re-run an already registered player (keeps registry entry and source) */
    refresh?: boolean;
    /** Ignore what is cached about this player (own row, party members) */
    fresh?: boolean;
}

export const LOOKUP_CONCURRENCY = 6;

const PRIORITY_SOURCES: ReadonlySet<string> = new Set(['party', 'manual']);

export class LookupQueue {
    private active = 0;
    private jobs: LookupJob[] = [];

    constructor(
        private readonly worker: (job: LookupJob) => Promise<void>,
        private readonly concurrency = LOOKUP_CONCURRENCY,
    ) {}

    enqueue(job: LookupJob): void {
        if (PRIORITY_SOURCES.has(job.source)) {
            const firstBacklog = this.jobs.findIndex(j => !PRIORITY_SOURCES.has(j.source));
            this.jobs.splice(firstBacklog === -1 ? this.jobs.length : firstBacklog, 0, job);
        } else {
            this.jobs.push(job);
        }
        this.drain();
    }

    /** Drops jobs that have not started yet. Returns how many were dropped. */
    dropPending(shouldDrop: (job: LookupJob) => boolean): number {
        const before = this.jobs.length;
        this.jobs = this.jobs.filter(job => !shouldDrop(job));
        return before - this.jobs.length;
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
