/** Footer: live summary of what is on screen (only non-zero parts). */

import { state } from '../core/state';

const footerCount = document.getElementById('footer-count') as HTMLElement;
let lastHtml = '';

export function updateFooter(): void {
    let players = 0, nicked = 0, apiOff = 0, fresh = 0;
    for (const p of state.players.values()) {
        players++;
        if (p.status === 'nicked') nicked++;
        else if (p.status === 'api_off') apiOff++;
        else if (p.status === 'never_played') fresh++;
    }
    const parts = [`<span>${players} player${players === 1 ? '' : 's'}</span>`];
    if (nicked) parts.push(`<span class="sum-nicked">${nicked} nicked</span>`);
    if (apiOff) parts.push(`<span>${apiOff} API off</span>`);
    if (fresh) parts.push(`<span class="sum-new">${fresh} new</span>`);

    const html = parts.join('');
    if (html === lastHtml) return;
    lastHtml = html;
    footerCount.innerHTML = html;
}
