/** Reads and repairs watchlist.json; a damaged file is set aside, never fatal. */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ImportedList, WatchlistFile } from '../../shared/watchlist';
import { normalizeEntry } from './validate';

export function emptyFile(): WatchlistFile {
    return { version: 1, entries: [], lists: [] };
}

function repairLists(raw: unknown): ImportedList[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((l): ImportedList[] => {
        const r = l as Record<string, unknown> | null;
        if (!r || typeof r.id !== 'string' || typeof r.label !== 'string') return [];
        const importedAt = typeof r.importedAt === 'number' ? r.importedAt : 0;
        return [{ id: r.id, label: r.label, importedAt, count: 0 }];
    });
}

/** Nick links found in an old file are ignored: links live in memory only. Throws on anything that is not a version-1 watchlist document. */
export function repairFile(doc: unknown, now: number): WatchlistFile {
    const d = doc as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || d.version !== 1 || !Array.isArray(d.entries)) {
        throw new Error('not a version 1 watchlist');
    }
    const lists = repairLists(d.lists);
    const listIds = new Set(lists.map(l => l.id));
    const entries = d.entries.flatMap(raw => {
        const entry = normalizeEntry(raw, now);
        const source = (raw as Record<string, unknown>).source;
        if (!entry || typeof source !== 'string' || (source !== 'me' && !listIds.has(source))) return [];
        return [{ ...entry, source }];
    });
    for (const list of lists) list.count = entries.filter(e => e.source === list.id).length;
    return { version: 1, entries, lists };
}

export interface FileIo {
    readFile: (filePath: string) => string;
    rename: (from: string, to: string) => void;
}

const realIo: FileIo = { readFile: p => fs.readFileSync(p, 'utf8'), rename: (a, b) => fs.renameSync(a, b) };

export interface LoadResult {
    file: WatchlistFile;
    /** False when an existing file could not be read or set aside: saving would destroy it. */
    writable: boolean;
}

/**
 * Missing file: empty list. Damaged file: renamed to `<file>.bad-<timestamp>`, empty list.
 * A file that cannot be read, or cannot be moved aside, is left alone and the result is not writable.
 */
export function loadFile(filePath: string, now: number, io: FileIo = realIo): LoadResult {
    if (!fs.existsSync(filePath)) return { file: emptyFile(), writable: true };
    let text: string;
    try {
        text = io.readFile(filePath);
    } catch (e) {
        console.error(`[Watchlist] Cannot read ${filePath} (${(e as Error).message}); changes will not be saved this session so the file is not overwritten.`);
        return { file: emptyFile(), writable: false };
    }
    try {
        return { file: repairFile(JSON.parse(text), now), writable: true };
    } catch (e) {
        const backup = `${filePath}.bad-${now}`;
        console.warn(`[Watchlist] ${filePath} is damaged (${(e as Error).message}); moving it to ${backup}`);
        try {
            io.rename(filePath, backup);
        } catch (renameError) {
            console.error(`[Watchlist] Could not move the damaged file (${(renameError as Error).message}); changes will not be saved this session so the file is not overwritten.`);
            return { file: emptyFile(), writable: false };
        }
        return { file: emptyFile(), writable: true };
    }
}

/** Write-then-rename, as config.ts: a crash mid-write must not truncate the list. */
export function saveFile(filePath: string, data: WatchlistFile): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath);
}
