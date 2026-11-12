/** Search box: single lookup or bulk paste. */

import { state } from '../core/state';

const api = window.pikaOverlay;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const btnLookup = document.getElementById('btn-lookup') as HTMLButtonElement;

const VALID_NAME = /^[A-Za-z0-9_]{3,16}$/;

async function doSearch(): Promise<void> {
    const raw = searchInput.value.trim();
    if (!raw) return;
    searchInput.value = '';

    const names = raw.split(/[\n,\s]+/).filter(n => VALID_NAME.test(n));
    if (!names.length) return;

    if (names.length === 1) await api.lookupPlayer(names[0]!, state.interval, state.mode);
    else await api.lookupBulk(names, state.interval, state.mode);
}

export function initSearch(): void {
    const run = (): void => {
        doSearch().catch(err => console.error('[Overlay] Search failed:', String(err)));
    };
    btnLookup.addEventListener('click', run);
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}
