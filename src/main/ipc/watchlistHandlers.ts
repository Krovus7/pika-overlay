/**
 * Watchlist IPC (Task 3): thin Electron layer over WatchlistStore, format and
 * ImportPreviews. Every argument is type-checked; a malformed call is ignored.
 * The row context menu (watchlist:menu) is added with the table UI.
 */

import { BrowserWindow, clipboard, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { IPC_CHANNELS, IPC_EVENTS } from '../../shared/ipc-contract';
import type { ImportAttempt } from '../../shared/watchlist';
import { broadcast } from '../broadcast';
import { FormatError, defaultFileName, exportJson, exportText, parseAny, type ParseResult } from '../watchlist/format';
import { ImportPreviews } from '../watchlist/importPreview';
import type { WatchlistStore } from '../watchlist/store';
import { MAX_FILE_BYTES, normalizeKind } from '../watchlist/validate';

const parentOf = (e: IpcMainInvokeEvent): BrowserWindow | undefined => BrowserWindow.fromWebContents(e.sender) ?? undefined;

function readImportFile(filePath: string): string {
    if (fs.statSync(filePath).size > MAX_FILE_BYTES) throw new FormatError('The file is larger than 1 MB.');
    return fs.readFileSync(filePath, 'utf8');
}

export function registerWatchlistHandlers(store: WatchlistStore): void {
    const previews = new ImportPreviews();
    const notify = (): void => broadcast(IPC_EVENTS.WATCHLIST_UPDATED, store.snapshot());

    const preview = (label: string, parse: () => ParseResult): ImportAttempt => {
        try {
            const { entries, invalid } = parse();
            return previews.create(label, entries, store.countOwnConflicts(entries), invalid);
        } catch (e) {
            if (e instanceof FormatError) return { error: e.message };
            console.error('[Watchlist] Import failed:', (e as Error).message);
            return { error: 'The list could not be read.' };
        }
    };

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_GET, () => store.snapshot());

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_SET, (_e, name: unknown, change: unknown) => {
        if (typeof name !== 'string') return false;
        let ok: boolean;
        if (change === null) {
            ok = store.setOwn(name, null);
        } else if (change && typeof change === 'object' && typeof (change as { note?: unknown }).note === 'string') {
            const c = change as { kind?: unknown; note: string };
            ok = store.setOwn(name, { kind: normalizeKind(c.kind), note: c.note });
        } else {
            return false;
        }
        if (ok) notify();
        return ok;
    });

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_REMOVE_LIST, (_e, id: unknown) => {
        const ok = typeof id === 'string' && store.removeList(id);
        if (ok) notify();
        return ok;
    });

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_EXPORT, async (e, opts: unknown) => {
        const includeImported = !!opts && typeof opts === 'object' && (opts as { includeImported?: unknown }).includeImported === true;
        const options = {
            title: 'Export watchlist', defaultPath: defaultFileName(new Date()),
            filters: [{ name: 'Watchlist', extensions: ['json'] }],
        };
        const parent = parentOf(e);
        const { canceled, filePath } = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
        if (canceled || !filePath) return null;
        try {
            fs.writeFileSync(filePath, exportJson(store.entriesForExport(includeImported), Date.now()));
            return filePath;
        } catch (err) {
            dialog.showErrorBox('Export failed', (err as Error).message);
            return null;
        }
    });

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_COPY_TEXT, () => {
        clipboard.writeText(exportText(store.ownEntries()));
    });

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_IMPORT_FILE, async (e): Promise<ImportAttempt> => {
        const options = { title: 'Import watchlist', properties: ['openFile' as const], filters: [{ name: 'Watchlist', extensions: ['json', 'txt'] }] };
        const parent = parentOf(e);
        const { canceled, filePaths } = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
        const filePath = filePaths[0];
        if (canceled || !filePath) return null;
        return preview(path.basename(filePath), () => parseAny(readImportFile(filePath), 'other', Date.now()));
    });

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_IMPORT_TEXT, (_e, text: unknown, defaultKind: unknown): ImportAttempt => {
        if (typeof text !== 'string') return { error: 'Nothing to import.' };
        const kind = normalizeKind(defaultKind);
        return preview(`Pasted list ${new Date().toISOString().slice(0, 10)}`, () => parseAny(text, kind, Date.now()));
    });

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_CONFIRM_IMPORT, (_e, token: unknown) => {
        const pending = typeof token === 'string' ? previews.take(token) : null;
        if (!pending) return false;
        store.applyImport(pending.label, pending.entries);
        notify();
        return true;
    });

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_LINK_NICK, (_e, nick: unknown, friend: unknown) => {
        if (typeof nick !== 'string' || (friend !== null && typeof friend !== 'string')) return false;
        const ok = store.linkNick(nick, friend);
        if (ok) notify();
        return ok;
    });

    ipcMain.handle(IPC_CHANNELS.WATCHLIST_UNLINK_NICK, (_e, nick: unknown) => {
        const ok = typeof nick === 'string' && store.unlinkNick(nick);
        if (ok) notify();
        return ok;
    });
}
