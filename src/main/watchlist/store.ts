/** In-memory watchlist backed by watchlist.json; the path is injected so tests use a temp dir. */

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

    /** Adds, changes (keeping addedAt) or, with null, removes the own entry. False when refused. */
    setOwn(name: string, change: { kind: WatchKind; note: string } | null): boolean {
        if (!isValidName(name)) return false;
        const key = name.toLowerCase();
        const existing = this.ownEntries().find(e => e.name.toLowerCase() === key);
        const others = this.data.entries.filter(e => e !== existing);
        if (!change) {
            if (!existing) return true;
            this.data.entries = others;
        } else {
            if (!existing && this.ownEntries().length >= MAX_ENTRIES) return false;
            const entry: WatchEntry = {
                name: existing?.name ?? name, kind: normalizeKind(change.kind), note: cleanNote(change.note),
                addedAt: existing?.addedAt ?? this.now(), source: 'me',
            };
            this.data.entries = [...others, entry];
        }
        return this.persist();
    }

    removeList(id: string): boolean {
        if (!this.data.lists.some(l => l.id === id)) return false;
        this.data.lists = this.data.lists.filter(l => l.id !== id);
        this.data.entries = this.data.entries.filter(e => e.source !== id);
        return this.persist();
    }

    /** Own entries are never touched; a list with the same label is replaced. */
    applyImport(label: string, parsed: ParsedEntry[]): ImportedList {
        const old = this.data.lists.find(l => l.label === label);
        if (old) {
            this.data.lists = this.data.lists.filter(l => l !== old);
            this.data.entries = this.data.entries.filter(e => e.source !== old.id);
        }
        const list: ImportedList = { id: crypto.randomUUID(), label, importedAt: this.now(), count: parsed.length };
        this.data.lists = [...this.data.lists, list];
        this.data.entries = [...this.data.entries, ...parsed.map(p => ({ ...p, source: list.id }))];
        this.persist();
        return list;
    }

    countOwnConflicts(parsed: ParsedEntry[]): number {
        const own = new Set(this.ownEntries().map(e => e.name.toLowerCase()));
        return parsed.filter(p => own.has(p.name.toLowerCase())).length;
    }

    isLinkedNick(name: string): boolean {
        const key = name.toLowerCase();
        return this.data.nickLinks.some(l => l.nick.toLowerCase() === key);
    }

    /** Adds or replaces a nick link; friend null or '' means "not given". False when a name is invalid. */
    linkNick(nick: string, friend: string | null): boolean {
        if (!isValidName(nick) || (friend && !isValidName(friend))) return false;
        const key = nick.toLowerCase();
        const link: NickLink = { nick, friend: friend ?? '', addedAt: this.now() };
        this.data.nickLinks = [...this.data.nickLinks.filter((l: NickLink) => l.nick.toLowerCase() !== key), link];
        return this.persist();
    }

    unlinkNick(nick: string): boolean {
        const key = nick.toLowerCase();
        if (!this.data.nickLinks.some(l => l.nick.toLowerCase() === key)) return false;
        this.data.nickLinks = this.data.nickLinks.filter(l => l.nick.toLowerCase() !== key);
        return this.persist();
    }

    private persist(): boolean {
        try {
            saveFile(this.filePath, this.data);
            return true;
        } catch (e) {
            console.error('[Watchlist] Failed to write watchlist:', (e as Error).message);
            return false;
        }
    }
}
