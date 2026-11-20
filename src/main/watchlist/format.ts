/** Pure export/import formats: JSON file and the one-per-line text for Discord. */

import type { WatchKind } from '../../shared/watchlist';
import { MAX_ENTRIES, MAX_FILE_BYTES, dedupeByName, isValidName, normalizeEntry, normalizeKind, cleanNote, type ParsedEntry } from './validate';

export const FILE_FORMAT = 'pika-overlay-watchlist';

export class FormatError extends Error {}

export interface ParseResult {
    entries: ParsedEntry[];
    invalid: number;
}

/** Windows editors prepend a BOM that JSON.parse rejects. */
const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

export function defaultFileName(now: Date): string {
    return `pika-watchlist-${now.toISOString().slice(0, 10)}.json`;
}

export function exportJson(entries: ParsedEntry[], now: number): string {
    const records = entries.map(({ name, kind, note, addedAt }) => ({ name, kind, note, addedAt }));
    return JSON.stringify({ format: FILE_FORMAT, version: 1, exportedAt: now, entries: records }, null, 2);
}

/** '#' starts a comment in the text format, so it cannot be part of an exported note. */
export function exportText(entries: ParsedEntry[]): string {
    return entries.map(e => {
        const note = e.note.replace(/#/g, '').trim();
        return note ? `${e.name}, ${e.kind}, ${note}` : `${e.name}, ${e.kind}`;
    }).join('\n');
}

function finish(entries: ParsedEntry[], invalid: number): ParseResult {
    if (entries.length > MAX_ENTRIES) throw new FormatError(`Too many entries (the limit is ${MAX_ENTRIES}).`);
    return { entries: dedupeByName(entries), invalid };
}

export function parseJson(text: string, now: number): ParseResult {
    let doc: unknown;
    try {
        doc = JSON.parse(stripBom(text));
    } catch {
        throw new FormatError('The file is not valid JSON.');
    }
    const d = doc as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || d.format !== FILE_FORMAT) {
        throw new FormatError('This is not a PikaOverlay watchlist file.');
    }
    if (d.version !== 1) throw new FormatError(`Unsupported watchlist version: ${String(d.version)}.`);
    if (!Array.isArray(d.entries)) throw new FormatError('The watchlist file has no entries list.');
    const entries: ParsedEntry[] = [];
    let invalid = 0;
    for (const raw of d.entries) {
        const entry = normalizeEntry(raw, now);
        if (entry) entries.push(entry); else invalid++;
    }
    return finish(entries, invalid);
}

/** Lines are `name`, `name, kind` or `name, kind, note`; the note may contain commas. */
export function parseText(text: string, defaultKind: WatchKind, now: number): ParseResult {
    const entries: ParsedEntry[] = [];
    let invalid = 0;
    for (const rawLine of stripBom(text).split(/\r?\n/)) {
        const line = rawLine.split('#')[0]?.trim() ?? '';
        if (!line) continue;
        const [name = '', kindPart = '', ...noteParts] = line.split(',');
        const kindText = kindPart.trim().toLowerCase();
        if (!isValidName(name.trim())) { invalid++; continue; }
        const kind = kindText === '' ? defaultKind : normalizeKind(kindText);
        entries.push({ name: name.trim(), kind, note: cleanNote(noteParts.join(',')), addedAt: now });
    }
    return finish(entries, invalid);
}

/** A document starting with '{' is the JSON file; anything else is the text format. */
export function parseAny(text: string, defaultKind: WatchKind, now: number): ParseResult {
    if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) throw new FormatError('The list is larger than 1 MB.');
    return stripBom(text).trimStart().startsWith('{') ? parseJson(text, now) : parseText(text, defaultKind, now);
}
