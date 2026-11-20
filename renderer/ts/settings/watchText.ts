/** Pure helpers for the Watchlist tab: search, dates and wording (no DOM). */

import type { ImportPreview, NickLink, WatchEntry } from '../../../src/shared/watchlist';

/** Own entries whose name or note contains the query (case-insensitive), sorted by name. */
export function filterEntries(entries: readonly WatchEntry[], query: string): WatchEntry[] {
    const q = query.trim().toLowerCase();
    return entries
        .filter(e => e.source === 'me' && (!q || e.name.toLowerCase().includes(q) || e.note.toLowerCase().includes(q)))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/** Local calendar date, YYYY-MM-DD, independent of the OS locale. */
export function formatAddedDate(epochMs: number): string {
    const d = new Date(epochMs);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The lines shown in the import preview step before Confirm. */
export function previewLines(p: ImportPreview): string[] {
    const lines = [`${plural(p.count, 'name')} in "${p.label}".`];
    if (p.conflicts > 0) lines.push(`${plural(p.conflicts, 'name')} already in your own list (your entry wins).`);
    if (p.invalid > 0) lines.push(`${plural(p.invalid, 'line')} skipped as not valid names.`);
    if (p.replacesExisting) lines.push(`This will replace the existing list "${p.label}".`);
    return lines;
}

export function friendLabel(link: NickLink): string {
    return link.friend || 'Someone else';
}

export function nickLinksSorted(links: readonly NickLink[]): NickLink[] {
    return [...links].sort((a, b) => a.nick.toLowerCase().localeCompare(b.nick.toLowerCase()));
}
