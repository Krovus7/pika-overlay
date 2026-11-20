/**
 * In-memory watchlist backed by watchlist.json; the path is injected so tests use a temp dir.
 * Every mutator builds the next state, saves it, and only then keeps it: a failed
 * write leaves memory and disk as they were.
 */

import * as crypto from 'node:crypto';
import * as path from 'node:path';

import type { ImportedList, NickLink, WatchEntry, WatchKind, WatchlistFile, WatchlistSnapshot } from '../../shared/watchlist';
import { loadFile, saveFile } from './fileLoad';
import { MAX_ENTRIES, cleanNote, isValidName, normalizeKind, type ParsedEntry } from './validate';

export class WatchlistStore {
    private data: WatchlistFile;

    constructor(private readonly filePath: string, private readonly now: () => number = Date.now) {
        this.data = loadFile(filePath, now());
    }

    static userDataPath(userDataDir: string): string {
        return path.join(userDataDir, 'watchlist.json');
    }

    snapshot(): WatchlistSnapshot {
        const { entries, lists, nickLinks } = this.data;
        return { entries: [...entries], lists: [...lists], nickLinks: [...nickLinks] };
    }

    /** The owner's own entry wins; otherwise the entry of the most recently imported list. */
    lookup(name: string): WatchEntry | undefined {
        const key = name.toLowerCase();
        const matches = this.data.entries.filter(e => e.name.toLowerCase() === key);
        const own = matches.find(e => e.source === 'me');
        if (own) return own;
        const importedAt = (e: WatchEntry) => this.data.lists.find(l => l.id === e.source)?.importedAt ?? 0;
        return matches.sort((a, b) => importedAt(b) - importedAt(a))[0];
    }

    ownEntries(): WatchEntry[] {
        return this.data.entries.filter(e => e.source === 'me');
    }

    entriesForExport(includeImported: boolean): WatchEntry[] {
        return includeImported ? [...this.data.entries] : this.ownEntries();
    }

    /** Adds, changes (keeping addedAt) or, with null, removes the own entry. False when refused or not saved. */
    setOwn(name: string, change: { kind: WatchKind; note: string } | null): boolean {
        if (!isValidName(name)) return false;
        const key = name.toLowerCase();
        const existing = this.ownEntries().find(e => e.name.toLowerCase() === key);
        const others = this.data.entries.filter(e => e !== existing);
        if (!change) {
            return !existing || this.commit({ entries: others });
        }
        if (!existing && this.ownEntries().length >= MAX_ENTRIES) return false;
        const entry: WatchEntry = {
            name: existing?.name ?? name, kind: normalizeKind(change.kind), note: cleanNote(change.note),
            addedAt: existing?.addedAt ?? this.now(), source: 'me',
        };
        return this.commit({ entries: [...others, entry] });
    }

    removeList(id: string): boolean {
        if (!this.data.lists.some(l => l.id === id)) return false;
        return this.commit({
            lists: this.data.lists.filter(l => l.id !== id),
            entries: this.data.entries.filter(e => e.source !== id),
        });
    }

    hasListLabel(label: string): boolean {
        return this.data.lists.some(l => l.label === label);
    }

    /** Own entries are never touched; a list with the same label is replaced. Null when not saved. */
    applyImport(label: string, parsed: ParsedEntry[]): ImportedList | null {
        const old = this.data.lists.find(l => l.label === label);
        const list: ImportedList = { id: crypto.randomUUID(), label, importedAt: this.now(), count: parsed.length };
        const kept = old ? this.data.entries.filter(e => e.source !== old.id) : this.data.entries;
        const saved = this.commit({
            lists: [...this.data.lists.filter(l => l !== old), list],
            entries: [...kept, ...parsed.map(p => ({ ...p, source: list.id }))],
        });
        return saved ? list : null;
    }

    countOwnConflicts(parsed: ParsedEntry[]): number {
        const own = new Set(this.ownEntries().map(e => e.name.toLowerCase()));
        return parsed.filter(p => own.has(p.name.toLowerCase())).length;
    }

    isLinkedNick(name: string): boolean {
        const key = name.toLowerCase();
        return this.data.nickLinks.some(l => l.nick.toLowerCase() === key);
    }

    /** Adds or replaces a nick link; friend null or '' means "not given". False when a name is invalid or not saved. */
    linkNick(nick: string, friend: string | null): boolean {
        if (!isValidName(nick) || (friend && !isValidName(friend))) return false;
        const key = nick.toLowerCase();
        const link: NickLink = { nick, friend: friend ?? '', addedAt: this.now() };
        return this.commit({ nickLinks: [...this.data.nickLinks.filter(l => l.nick.toLowerCase() !== key), link] });
    }

    unlinkNick(nick: string): boolean {
        const key = nick.toLowerCase();
        if (!this.data.nickLinks.some(l => l.nick.toLowerCase() === key)) return false;
        return this.commit({ nickLinks: this.data.nickLinks.filter(l => l.nick.toLowerCase() !== key) });
    }

    private commit(change: Partial<WatchlistFile>): boolean {
        const next: WatchlistFile = { ...this.data, ...change };
        try {
            saveFile(this.filePath, next);
        } catch (e) {
            console.error('[Watchlist] Failed to write watchlist:', (e as Error).message);
            return false;
        }
        this.data = next;
        return true;
    }
}
