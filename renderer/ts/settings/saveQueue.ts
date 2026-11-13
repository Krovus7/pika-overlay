/**
 * Applies every change immediately: patches are merged, written one at a time
 * through api.saveConfig and reported to the header ("Saved" / error).
 */

import type { PikaOverlayApi } from '../../../src/shared/preload-api';

export type SaveStatus = { kind: 'saved' } | { kind: 'error'; message: string };

const DEBOUNCE_MS = 400;

let api: PikaOverlayApi;
let listener: (s: SaveStatus) => void = () => undefined;
let pending: Record<string, unknown> = {};
let timer: number | null = null;
let chain: Promise<unknown> = Promise.resolve();

export function initSaveQueue(pikaApi: PikaOverlayApi, onStatus: (s: SaveStatus) => void): void {
    api = pikaApi;
    listener = onStatus;
}

function clearTimer(): void {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
}

/** Writes everything pending now. Resolves true when the write succeeded. */
export function flushSaves(): Promise<boolean> {
    clearTimer();
    const patch = pending;
    pending = {};
    if (Object.keys(patch).length === 0) return Promise.resolve(true);
    const job = chain.then(async () => {
        try {
            await api.saveConfig(patch);
            listener({ kind: 'saved' });
            return true;
        } catch (err) {
            console.error('[Settings] Save failed:', String(err));
            listener({ kind: 'error', message: 'Could not save. Your change was not applied.' });
            return false;
        }
    });
    chain = job;
    return job;
}

export function saveNow(patch: Record<string, unknown>): Promise<boolean> {
    Object.assign(pending, patch);
    return flushSaves();
}

/** For text inputs and sliders: waits for a pause in typing, flushed on blur/Enter/close. */
export function saveSoon(patch: Record<string, unknown>): void {
    Object.assign(pending, patch);
    clearTimer();
    timer = window.setTimeout(() => void flushSaves(), DEBOUNCE_MS);
}
