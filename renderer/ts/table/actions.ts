/** Row actions via one delegated listener on the table body. */

import { state } from '../core/state';
import { showToast } from '../ui/toast';

const api = window.pikaOverlay;

function retry(btn: HTMLElement): void {
    const username = btn.dataset.user;
    if (!username) return;
    btn.classList.add('is-busy');
    api.retryPlayer(username).catch(err => {
        btn.classList.remove('is-busy');
        console.error('[Overlay] Retry failed:', String(err));
    });
}

function copyName(el: HTMLElement): void {
    const name = el.dataset.name;
    if (!name) return;
    api.copyText(name)
        .then(() => showToast(`Copied ${name}`))
        .catch(err => console.error('[Overlay] Copy failed:', String(err)));
}

function openWatchMenu(e: MouseEvent): void {
    const key = (e.target as HTMLElement).closest<HTMLElement>('tr[data-key]')?.dataset.key;
    const row = key ? state.players.get(key) : undefined;
    if (!row) return;
    e.preventDefault();
    api.showWatchMenu(row.username, row.status === 'nicked')
        .catch(err => console.error('[Overlay] Row menu failed:', String(err)));
}

export function initRowActions(): void {
    const tbody = document.getElementById('stats-body') as HTMLElement;
    tbody.addEventListener('contextmenu', openWatchMenu);
    tbody.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (!el) return;
        if (el.dataset.action === 'retry') retry(el);
        else if (el.dataset.action === 'copy') copyName(el);
    });
}
