/** Pure validation of watchlist data coming from files, pasted text and the renderer. */

import { WATCH_KINDS, type WatchKind } from '../../shared/watchlist';

export const MAX_ENTRIES = 5000;
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_NOTE_LENGTH = 120;

const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

export function isValidName(name: unknown): name is string {
    return typeof name === 'string' && NAME_PATTERN.test(name);
}

export function normalizeKind(kind: unknown): WatchKind {
    return WATCH_KINDS.find(k => k === kind) ?? 'other';
}

export function cleanNote(note: unknown): string {
    if (typeof note !== 'string') return '';
    return note.replace(CONTROL_CHARS, '').trim().slice(0, MAX_NOTE_LENGTH);
}

export interface ParsedEntry {
    name: string;
    kind: WatchKind;
    note: string;
    addedAt: number;
}

/** Returns null when the name is not valid; everything else is repaired. */
export function normalizeEntry(raw: unknown, now: number): ParsedEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!isValidName(r.name)) return null;
    const addedAt = typeof r.addedAt === 'number' && Number.isFinite(r.addedAt) && r.addedAt > 0 ? r.addedAt : now;
    return { name: r.name, kind: normalizeKind(r.kind), note: cleanNote(r.note), addedAt };
}

/** Keeps the first entry of each case-insensitive name. */
export function dedupeByName<T extends { name: string }>(entries: T[]): T[] {
    const seen = new Set<string>();
    return entries.filter(e => {
        const key = e.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
