/** Watchlist tab, "Share": import (file or pasted, with a preview step), export, copy as text. */

import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import type { ImportAttempt, ImportPreview, WatchKind } from '../../../src/shared/watchlist';
import { block, button, group, h, setStatus, toggle } from './controls';
import { kindSelect } from './watchEntries';
import { previewLines } from './watchText';

export function buildTransfer(api: PikaOverlayApi): HTMLElement {
    const g = group('Share', "Import another person's list, or export yours. Imported lists stay separate from your own entries.");
    const importFile = button('Import file', { icon: 'download' });
    const pasteList = button('Paste list', { icon: 'clipboard' });
    const exportFile = button('Export file', { icon: 'arrow-up' });
    const copyText = button('Copy as text', { icon: 'copy' });
    const buttons = h('div', 's-inline');
    buttons.append(importFile, pasteList, exportFile, copyText);

    const withImported = toggle(() => undefined);
    withImported.input.setAttribute('aria-label', 'Include imported lists in the export');
    const optionLabel = h('label', 's-watch-option');
    optionLabel.htmlFor = withImported.input.id;
    optionLabel.append(withImported.root, h('span', '', 'Include imported lists in the export'));

    const status = h('div', 's-status');
    status.setAttribute('role', 'status');

    // Paste area (hidden until "Paste list")
    const paste = h('div', 's-watch-paste');
    paste.hidden = true;
    const area = h('textarea', 's-input s-mono');
    area.rows = 6;
    area.placeholder = 'One name per line, or name, kind, note. Lines after # are comments.';
    area.setAttribute('aria-label', 'Pasted list');
    let defaultKind: WatchKind = 'sniper';
    const kind = kindSelect(defaultKind, 'Kind for names without one', k => { defaultKind = k; });
    const preview = button('Preview', { variant: 'primary' });
    const pasteLine = h('div', 's-inline');
    pasteLine.append(h('span', 's-hint', 'Kind for names without one'), kind, preview);
    paste.append(area, pasteLine);

    // Preview step
    const confirmBox = h('div', 's-watch-preview');
    confirmBox.hidden = true;
    const summary = h('div', 's-watch-preview-lines');
    const confirm = button('Confirm', { icon: 'check', variant: 'primary' });
    const cancel = button('Cancel', { variant: 'ghost' });
    const confirmLine = h('div', 's-inline');
    confirmLine.append(confirm, cancel);
    confirmBox.append(summary, confirmLine);
    let pending: ImportPreview | null = null;

    function closePreview(): void {
        pending = null;
        confirmBox.hidden = true;
        summary.replaceChildren();
    }

    function handle(attempt: ImportAttempt): void {
        if (!attempt) return;
        if ('error' in attempt) {
            closePreview();
            setStatus(status, 'bad', 'circle-alert', attempt.error);
            return;
        }
        pending = attempt;
        status.className = 's-status';
        status.replaceChildren();
        summary.replaceChildren(...previewLines(attempt).map(line => h('p', 's-watch-preview-line', line)));
        confirmBox.hidden = false;
    }

    async function run(job: () => Promise<void>, failure: string): Promise<void> {
        try {
            await job();
        } catch (err) {
            console.error('[Settings] Watchlist transfer failed:', String(err));
            setStatus(status, 'bad', 'circle-alert', failure);
        }
    }

    importFile.addEventListener('click', () => void run(async () => handle(await api.importWatchlistFile()), 'Could not import this file.'));
    pasteList.addEventListener('click', () => { paste.hidden = !paste.hidden; if (!paste.hidden) area.focus(); });
    preview.addEventListener('click', () => void run(async () => {
        if (!area.value.trim()) {
            setStatus(status, 'warn', 'alert', 'Paste a list first.');
            return;
        }
        handle(await api.importWatchlistText(area.value, defaultKind));
    }, 'Could not read this list.'));
    confirm.addEventListener('click', () => void run(async () => {
        const token = pending?.token;
        if (!token) return;
        const ok = await api.confirmWatchImport(token);
        closePreview();
        if (ok) {
            area.value = '';
            paste.hidden = true;
            setStatus(status, 'ok', 'circle-check', 'List imported.');
        } else setStatus(status, 'bad', 'circle-alert', 'The preview expired or the list could not be saved. Try again.');
    }, 'Could not import this list.'));
    cancel.addEventListener('click', closePreview);
    exportFile.addEventListener('click', () => void run(async () => {
        const saved = await api.exportWatchlist({ includeImported: withImported.input.checked });
        if (saved) setStatus(status, 'ok', 'circle-check', 'List exported.');
    }, 'Could not export the list.'));
    copyText.addEventListener('click', () => void run(async () => {
        await api.copyWatchlistText();
        setStatus(status, 'ok', 'circle-check', 'Copied your list as text.');
    }, 'Could not copy the list.'));

    g.list.append(block(buttons, optionLabel, paste, confirmBox, status));
    return g.root;
}
