/** Reads and repairs watchlist.json; a damaged file is set aside, never fatal. */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ImportedList, NickLink, WatchlistFile } from '../../shared/watchlist';
import { dedupeByName, isValidName, normalizeEntry } from './validate';

export function emptyFile(): WatchlistFile {
    return { version: 1, entries: [], lists: [], nickLinks: [] };
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

function repairNickLinks(raw: unknown, now: number): NickLink[] {
    if (!Array.isArray(raw)) return [];
    const links = raw.flatMap((l): { name: string; friend: string; addedAt: number }[] => {
        const r = l as Record<string, unknown> | null;
        if (!r || !isValidName(r.nick)) return [];
        const friend = typeof r.friend === 'string' && isValidName(r.friend) ? r.friend : '';
        const addedAt = typeof r.addedAt === 'number' ? r.addedAt : now;
        return [{ name: r.nick, friend, addedAt }];
    });
    return dedupeByName(links).map(l => ({ nick: l.name, friend: l.friend, addedAt: l.addedAt }));
}

/** Throws on anything that is not a version-1 watchlist document. */
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
    return { version: 1, entries, lists, nickLinks: repairNickLinks(d.nickLinks, now) };
}

/** Missing file: empty list. Corrupt file: renamed to `<file>.bad-<timestamp>`, empty list. */
export function loadFile(filePath: string, now: number): WatchlistFile {
    if (!fs.existsSync(filePath)) return emptyFile();
    try {
        return repairFile(JSON.parse(fs.readFileSync(filePath, 'utf8')), now);
    } catch (e) {
        const backup = `${filePath}.bad-${now}`;
        console.warn(`[Watchlist] ${filePath} is unreadable (${(e as Error).message}); moving it to ${backup}`);
        try {
            fs.renameSync(filePath, backup);
        } catch (renameError) {
            console.error('[Watchlist] Could not move the damaged file:', (renameError as Error).message);
        }
        return emptyFile();
    }
}

/** Write-then-rename, as config.ts: a crash mid-write must not truncate the list. */
export function saveFile(filePath: string, data: WatchlistFile): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath);
}
