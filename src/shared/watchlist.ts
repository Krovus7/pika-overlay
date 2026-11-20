/** Watchlist model shared by main, preload and renderer (Task 3). */

export type WatchKind = 'sniper' | 'cheater' | 'other';

export const WATCH_KINDS: readonly WatchKind[] = ['sniper', 'cheater', 'other'];

export interface WatchEntry {
    /** As entered/detected; the key is name.toLowerCase() */
    name: string;
    kind: WatchKind;
    /** At most 120 characters, control characters stripped */
    note: string;
    /** Epoch ms */
    addedAt: number;
    /** 'me' or the id of an imported list */
    source: 'me' | string;
}

export interface ImportedList {
    id: string;
    label: string;
    importedAt: number;
    count: number;
}

export interface NickLink {
    /** The nick as seen in the log; the key is nick.toLowerCase() */
    nick: string;
    /** Real name of the teammate, '' when not given */
    friend: string;
    addedAt: number;
}

export interface WatchlistFile {
    version: 1;
    entries: WatchEntry[];
    lists: ImportedList[];
    nickLinks: NickLink[];
}

/** What watchlist:get returns and watchlist:updated broadcasts. */
export type WatchlistSnapshot = Omit<WatchlistFile, 'version'>;

export interface ImportPreview {
    /** Single-use, expires after 5 minutes */
    token: string;
    label: string;
    count: number;
    /** Names that already have an own entry (the own entry keeps winning) */
    conflicts: number;
    /** Lines or records that were not valid names */
    invalid: number;
    /** A list with this label already exists and the import will replace it */
    replacesExisting: boolean;
}

/** Result of an import attempt: a preview, an error to show, or null when the dialog was cancelled. */
export type ImportAttempt = ImportPreview | { error: string } | null;
