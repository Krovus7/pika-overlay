/** Row actions via one delegated listener on the table body. */

const api = window.pikaOverlay;

export function initRowActions(): void {
    const tbody = document.getElementById('stats-body') as HTMLElement;
    tbody.addEventListener('click', e => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action="retry"]');
        const username = btn?.dataset.user;
        if (!btn || !username) return;
        btn.classList.add('is-busy');
        api.retryPlayer(username).catch(err => {
            btn.classList.remove('is-busy');
            console.error('[Overlay] Retry failed:', String(err));
        });
    });
}
