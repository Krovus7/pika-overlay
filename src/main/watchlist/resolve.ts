/** Precedence between watchlist entries of the same name, and the resolved view for the renderer. Pure. */

import type { ImportedList, WatchEntry, WatchResolved } from '../../shared/watchlist';

/** The own entry wins; otherwise the entry of the most recently imported list. */
export function pickEntry(matches: readonly WatchEntry[], lists: readonly ImportedList[]): WatchEntry | undefined {
    const own = matches.find(e => e.source === 'me');
    if (own) return own;
    const importedAt = (e: WatchEntry): number => lists.find(l => l.id === e.source)?.importedAt ?? 0;
    return [...matches].sort((a, b) => importedAt(b) - importedAt(a))[0];
}

export function toResolved(entry: WatchEntry, lists: readonly ImportedList[]): WatchResolved {
    const imported = entry.source !== 'me';
    const sourceLabel = imported ? (lists.find(l => l.id === entry.source)?.label ?? 'imported list') : 'me';
    return { kind: entry.kind, note: entry.note, sourceLabel, imported };
}

/** One resolved record per lowercase name. */
export function resolveAll(entries: readonly WatchEntry[], lists: readonly ImportedList[]): Record<string, WatchResolved> {
    const byName = new Map<string, WatchEntry[]>();
    for (const e of entries) {
        const key = e.name.toLowerCase();
        byName.set(key, [...(byName.get(key) ?? []), e]);
    }
    const out: [string, WatchResolved][] = [];
    for (const [key, matches] of byName) {
        const picked = pickEntry(matches, lists);
        if (picked) out.push([key, toResolved(picked, lists)]);
    }
    return Object.fromEntries(out);
}
