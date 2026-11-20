/** HTML of the row menu: pure string builders, all player-controlled text escaped. */

import type { MenuItemView } from '../../../src/shared/menu';
import { esc } from './format';

export function itemHtml(item: MenuItemView, index: number): string {
    if (item.kind === 'separator') return '<div class="rm-sep" role="separator"></div>';
    if (item.kind === 'info') return `<div class="rm-info" role="presentation">${esc(item.label)}</div>`;
    const tone = item.tone ? ` rm-${item.tone}` : '';
    const dot = item.tone && item.tone !== 'danger' ? '<span class="rm-dot"></span>' : '';
    const tail = item.kind === 'submenu' ? '<span class="rm-tail">›</span>' : item.checked ? '<span class="rm-tail rm-check">✓</span>' : '';
    return `<button type="button" class="rm-item${tone}" role="menuitem" data-i="${index}">${dot}<span class="rm-label">${esc(item.label)}</span>${tail}</button>`;
}

const BACK_HTML = '<button type="button" class="rm-item rm-back" role="menuitem" data-back="1"><span class="rm-label">‹ Back</span></button><div class="rm-sep" role="separator"></div>';

export function contentHtml(title: string | undefined, level: readonly MenuItemView[], inSubmenu: boolean): string {
    if (title === undefined) return '';
    return `<div class="rm-title" role="presentation" title="${esc(title)}">${esc(title)}</div>${inSubmenu ? BACK_HTML : ''}${level.map(itemHtml).join('')}`;
}
