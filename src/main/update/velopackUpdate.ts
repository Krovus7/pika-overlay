/**
 * Velopack auto-update — check/download/apply against the GitHub Releases
 * feed of Krovus7/pika-overlay (ADR-0004). Check only at startup and on user
 * request; download only on explicit user action; no polling. A busy guard
 * serializes concurrent check/download requests.
 */

import { app } from 'electron';
import { UpdateManager, VelopackApp, type UpdateInfo } from 'velopack';

import type { UpdateState } from '../../shared/types';

export const UPDATE_FEED_URL = 'https://github.com/Krovus7/pika-overlay';

let state: UpdateState = { kind: 'idle' };
let busy = false;
let pendingUpdate: UpdateInfo | null = null;
const listeners: Array<(s: UpdateState) => void> = [];

function setState(next: UpdateState): void {
    state = next;
    for (const l of listeners) l(state);
}

export function onUpdateStateChange(cb: (s: UpdateState) => void): void {
    listeners.push(cb);
}

export function getUpdateState(): UpdateState {
    return state;
}

/** Runs VelopackApp startup hooks (first-run/restart handling). No-op in dev. */
export function runStartupHooks(): void {
    if (!app.isPackaged) return;
    try {
        VelopackApp.build()
            .setLogger((level, msg) => console.log(`[Velopack] ${level}: ${msg}`))
            .run();
    } catch (err) {
        console.error('[Update] Velopack startup hook failed:', String(err));
    }
}

function createManager(): UpdateManager | null {
    if (!app.isPackaged) {
        setState({ kind: 'disabled', message: 'Updates are only available in the installed app.' });
        return null;
    }
    try {
        return new UpdateManager(UPDATE_FEED_URL);
    } catch (err) {
        console.error('[Update] Manager creation failed:', String(err));
        setState({ kind: 'error', message: String(err) });
        return null;
    }
}

/** Silent check — sets available/uptodate/error state, never downloads */
export async function checkForUpdates(): Promise<UpdateState> {
    if (busy) return state;
    const um = createManager();
    if (!um) return state;
    busy = true;
    setState({ kind: 'checking' });
    try {
        const info = await um.checkForUpdatesAsync();
        pendingUpdate = info;
        if (!info) {
            setState({ kind: 'uptodate' });
        } else {
            setState({ kind: 'available', version: info.TargetFullRelease.Version });
        }
    } catch (err) {
        console.error('[Update] Check failed:', String(err));
        setState({ kind: 'error', message: String(err) });
    } finally {
        busy = false;
    }
    return state;
}

/** Downloads the update with progress and applies it (app restarts) */
export async function downloadAndApply(): Promise<UpdateState> {
    if (busy) return state;
    const um = createManager();
    if (!um) return state;
    busy = true;
    try {
        const info = pendingUpdate ?? (await um.checkForUpdatesAsync());
        pendingUpdate = null;
        if (!info) {
            setState({ kind: 'uptodate' });
            return state;
        }
        setState({ kind: 'downloading', progress: 0 });
        await um.downloadUpdateAsync(info, perc => setState({ kind: 'downloading', progress: perc }));
        setState({ kind: 'ready', version: info.TargetFullRelease.Version });
        // Silent updater UI; restart the app after the update is applied
        um.waitExitThenApplyUpdate(info, true, true);
        app.quit();
    } catch (err) {
        console.error('[Update] Download/apply failed:', String(err));
        setState({ kind: 'error', message: String(err) });
    } finally {
        busy = false;
    }
    return state;
}
