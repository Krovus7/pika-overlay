/**
 * In-memory watchlist backed by watchlist.json; the path is injected so tests use a temp dir.
 * Every mutator builds the next state, saves it, and only then keeps it: a failed
 * write leaves memory and disk as they were.
 */

import * as crypto from 'node:crypto';
import * as path from 'node:path';

import type { ImportedList, NickLink, WatchEntry, WatchKind, WatchlistFile, WatchlistSnapshot, WatchlistView } from '../../shared/watchlist';
import { loadFile, saveFile, type FileIo } from './fileLoad';
import { pickEntry, resolveAll } from './resolve';
import { MAX_ENTRIES, cleanNote, isValidName, normalizeKind, type ParsedEntry } from './validate';

export class WatchlistStore {
    private data: WatchlistFile;
    /** Session-only: never saved, see pruneNickLinks. */
    private nickLinks: NickLink[] = [];
    private readonly writable: boolean;

    constructor(private readonly filePath: string, private readonly now: () => number = Date.now, io?: FileIo) {
        const loaded = loadFile(filePath, now(), io);
        this.data = loaded.file;
        this.writable = loaded.writable;
    }

    static userDataPath(userDataDir: string): string {
        return path.join(userDataDir, 'watchlist.json');
    }

    snapshot(): WatchlistSnapshot {
        const { entries, lists } = this.data;
        return { entries: [...entries], lists: [...lists], nickLinks: [...this.nickLinks] };
    }

    /** Snapshot plus the resolved view the table uses. */
    view(): WatchlistView {
        return { ...this.snapshot(), resolved: resolveAll(this.data.entries, this.data.lists) };
    }

    /** The owner's own entry wins; otherwise the entry of the most recently imported list. */
    lookup(name: string): WatchEntry | undefined {
        const key = name.toLowerCase();
        return pickEntry(this.data.entries.filter(e => e.name.toLowerCase() === key), this.data.lists);
    }

    ownEntries(): WatchEntry[] {
        return this.data.entries.filter(e => e.source === 'me');
    }

    /** One entry per name, chosen with the usual precedence, so the receiver never sees an imported copy first. */
    entriesForExport(includeImported: boolean): WatchEntry[] {
        if (!includeImported) return this.ownEntries();
        const byName = new Map<string, WatchEntry[]>();
        for (const e of this.data.entries) {
            const key = e.name.toLowerCase();
            byName.set(key, [...(byName.get(key) ?? []), e]);
        }
        return [...byName.values()].flatMap(matches => pickEntry(matches, this.data.lists) ?? []);
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

    /** `label`, or `label (2)`, `label (3)`, ... : the first one no list uses. */
    freeLabel(label: string): string {
        if (!this.hasListLabel(label)) return label;
        for (let n = 2; ; n++) if (!this.hasListLabel(`${label} (${n})`)) return `${label} (${n})`;
    }

    /**
     * Own entries are never touched; a list with the same label is replaced, unless keepBoth,
     * which imports under the first free numbered label. Null when not saved.
     */
    applyImport(wanted: string, parsed: ParsedEntry[], keepBoth = false): ImportedList | null {
        const label = keepBoth ? this.freeLabel(wanted) : wanted;
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
        return this.nickLinks.some(l => l.nick.toLowerCase() === key);
    }

    /**
     * Adds or replaces a nick link in memory; friend null or '' means "not given".
     * A teammate has one nick: linking F removes F's other links. False when a name is invalid.
     */
    linkNick(nick: string, friend: string | null): boolean {
        if (!isValidName(nick) || (friend && !isValidName(friend))) return false;
        const key = nick.toLowerCase();
        const friendKey = friend?.toLowerCase();
        const link: NickLink = { nick, friend: friend ?? '', addedAt: this.now() };
        const kept = this.nickLinks.filter(l => l.nick.toLowerCase() !== key && !(friendKey && l.friend.toLowerCase() === friendKey));
        this.nickLinks = [...kept, link];
        return true;
    }

    unlinkNick(nick: string): boolean {
        const key = nick.toLowerCase();
        if (!this.nickLinks.some(l => l.nick.toLowerCase() === key)) return false;
        this.nickLinks = this.nickLinks.filter(l => l.nick.toLowerCase() !== key);
        return true;
    }

    /**
     * Drops links whose friend left the party; "someone else" links go when the party went
     * from non-empty to empty. True when something was removed.
     */
    pruneNickLinks(partyMembers: readonly string[], wasNonEmpty: boolean): boolean {
        const inParty = new Set(partyMembers.map(m => m.toLowerCase()));
        const kept = this.nickLinks.filter(l =>
            l.friend ? inParty.has(l.friend.toLowerCase()) : !(wasNonEmpty && inParty.size === 0));
        const changed = kept.length !== this.nickLinks.length;
        this.nickLinks = kept;
        return changed;
    }

    private commit(change: Partial<WatchlistFile>): boolean {
        if (!this.writable) {
            console.error('[Watchlist] Change refused: the existing watchlist file could not be read or set aside.');
            return false;
        }
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
