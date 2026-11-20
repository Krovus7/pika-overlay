/** In-memory import previews: parsed, not yet saved, valid for five minutes. */

import * as crypto from 'node:crypto';

import type { ImportPreview } from '../../shared/watchlist';
import type { ParsedEntry } from './validate';

export const PREVIEW_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 5;

interface Pending {
    label: string;
    entries: ParsedEntry[];
    expiresAt: number;
}

export class ImportPreviews {
    private pending = new Map<string, Pending>();

    constructor(private readonly now: () => number = Date.now) {}

    create(label: string, entries: ParsedEntry[], conflicts: number, invalid: number): ImportPreview {
        this.purge();
        while (this.pending.size >= MAX_PENDING) {
            const oldest = this.pending.keys().next().value;
            if (oldest === undefined) break;
            this.pending.delete(oldest);
        }
        const token = crypto.randomUUID();
        this.pending.set(token, { label, entries, expiresAt: this.now() + PREVIEW_TTL_MS });
        return { token, label, count: entries.length, conflicts, invalid };
    }

    /** Single use: the token is gone afterwards. Null when unknown or expired. */
    take(token: string): { label: string; entries: ParsedEntry[] } | null {
        this.purge();
        const found = this.pending.get(token);
        this.pending.delete(token);
        return found ? { label: found.label, entries: found.entries } : null;
    }

    private purge(): void {
        const t = this.now();
        for (const [token, p] of this.pending) if (p.expiresAt <= t) this.pending.delete(token);
    }
}
