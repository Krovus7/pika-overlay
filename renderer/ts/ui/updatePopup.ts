/**
 * "Update available" card (bottom-right, above the footer). Shown when the
 * update state is `available` (also the state read at load, since the startup
 * check may finish before this page subscribes). Dismissal is remembered per
 * version for the session; clicking the card opens Settings → Updates.
 */

import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import type { UpdateState } from '../../../src/shared/types';
import { affectsPopup, popupVersion } from './updateRule';

let dismissed: string | null = null;
let current: UpdateState = { kind: 'idle' };

const card = (): HTMLElement | null => document.getElementById('update-popup');

function render(): void {
    const el = card();
    if (!el) return;
    const version = popupVersion(current, dismissed);
    const text = el.querySelector('.up-sub');
    if (version && text) text.textContent = `Version ${version} · click to update`;
    el.classList.toggle('is-visible', version !== null);
}

export function setUpdateState(state: UpdateState): void {
    if (!affectsPopup(state)) return;
    current = state;
    render();
}

/** Demo hook: shows the card with a fake version (null hides it). Touches no state in main. */
export function demoUpdatePopup(version: string | null): void {
    dismissed = null;
    setUpdateState(version ? { kind: 'available', version } : { kind: 'idle' });
}

export function initUpdatePopup(api: PikaOverlayApi): void {
    const el = card();
    if (!el) return;
    const fail = (what: string) => (err: unknown) => console.error(`[Overlay] ${what} failed:`, String(err));

    el.querySelector('.up-main')?.addEventListener('click', () => {
        const version = current.kind === 'available' ? current.version : null;
        // Hide only once Settings opened: on failure the card stays so the update is not lost
        api.openSettings('updates')
            .then(() => { dismissed = version; render(); })
            .catch(fail('Opening settings'));
    });
    el.querySelector('.up-close')?.addEventListener('click', () => {
        if (current.kind === 'available') dismissed = current.version;
        render();
    });
    api.onUpdateState(setUpdateState);
    api.getUpdateState().then(setUpdateState).catch(fail('Update state'));
}
