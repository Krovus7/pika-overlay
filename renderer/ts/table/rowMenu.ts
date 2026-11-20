/** The row context menu, drawn in the overlay's own look. Main decides the content and runs the pick. */

import type { MenuItemView, MenuView } from '../../../src/shared/menu';
import { showToast } from '../ui/toast';
import { esc } from './format';
import { placeMenu, stepIndex } from './menuPlacement';

const MARGIN = 6;
const api = window.pikaOverlay;

let menu: HTMLElement | null = null;
let current: MenuView | null = null;
let level: MenuItemView[] = [];
let inSubmenu = false;
let active = -1;
let anchor = { x: 0, y: 0 };

const isPickable = (item: MenuItemView): boolean => item.kind === 'action' || item.kind === 'submenu';

function itemHtml(item: MenuItemView, index: number): string {
    if (item.kind === 'separator') return '<div class="rm-sep" role="separator"></div>';
    if (item.kind === 'info') return `<div class="rm-info">${esc(item.label)}</div>`;
    const tone = item.tone ? ` rm-${item.tone}` : '';
    const dot = item.tone && item.tone !== 'danger' ? '<span class="rm-dot"></span>' : '';
    const tail = item.kind === 'submenu' ? '<span class="rm-tail">›</span>' : item.checked ? '<span class="rm-tail rm-check">✓</span>' : '';
    return `<button type="button" class="rm-item${tone}" role="menuitem" data-i="${index}">${dot}<span class="rm-label">${esc(item.label)}</span>${tail}</button>`;
}

function contentHtml(): string {
    const back = inSubmenu ? '<button type="button" class="rm-item rm-back" role="menuitem" data-back="1"><span class="rm-label">‹ Back</span></button><div class="rm-sep" role="separator"></div>' : '';
    return `<div class="rm-title" title="${esc(current?.title)}">${esc(current?.title)}</div>${back}${level.map(itemHtml).join('')}`;
}

function buttons(): HTMLElement[] {
    return menu ? [...menu.querySelectorAll<HTMLElement>('.rm-item')] : [];
}

function highlight(index: number): void {
    const list = buttons();
    active = index;
    list.forEach((b, i) => b.classList.toggle('is-active', i === index));
    list[index]?.scrollIntoView({ block: 'nearest' });
}

function position(): void {
    if (!menu) return;
    menu.style.maxHeight = '';
    const spot = placeMenu({
        ...anchor, width: menu.offsetWidth, height: menu.scrollHeight,
        viewWidth: window.innerWidth, viewHeight: window.innerHeight, margin: MARGIN,
    });
    menu.style.left = `${spot.left}px`;
    menu.style.top = `${spot.top}px`;
    menu.style.maxHeight = `${spot.maxHeight}px`;
}

function draw(): void {
    if (!menu) return;
    menu.innerHTML = contentHtml();
    active = -1;
    position();
}

export function closeRowMenu(): void {
    menu?.remove();
    menu = null;
    current = null;
}

function pick(item: MenuItemView): void {
    if (item.kind === 'submenu') {
        level = item.items ?? [];
        inSubmenu = true;
        draw();
        return;
    }
    const token = current?.token;
    closeRowMenu();
    if (!token || !item.id) return;
    api.pickWatchMenu(token, item.id)
        .catch(err => {
            console.error('[Overlay] Row menu action failed:', String(err));
            showToast('Menu action failed', 2500);
        });
}

function back(): void {
    if (!inSubmenu || !current) return;
    level = current.items;
    inSubmenu = false;
    draw();
}

function onClick(e: MouseEvent): void {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.rm-item');
    if (!btn) return;
    if (btn.dataset.back) back();
    else {
        const item = level[Number(btn.dataset.i)];
        if (item) pick(item);
    }
}

function onKey(e: KeyboardEvent): void {
    if (!menu) return;
    const list = buttons();
    const enabled = list.map(() => true);
    const key = e.key;
    if (key === 'Escape') closeRowMenu();
    else if (key === 'ArrowDown' || key === 'ArrowUp') highlight(stepIndex(enabled, active, key === 'ArrowDown' ? 1 : -1));
    else if (key === 'Enter') list[active]?.click();
    else if ((key === 'ArrowLeft' || key === 'Backspace') && inSubmenu) back();
    else return;
    e.preventDefault();
    e.stopPropagation();
}

function onOutside(e: Event): void {
    if (menu && !menu.contains(e.target as Node)) closeRowMenu();
}

let wired = false;
function wire(): void {
    if (wired) return;
    wired = true;
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('blur', closeRowMenu);
    window.addEventListener('resize', closeRowMenu);
    document.querySelector('.table-wrapper')?.addEventListener('scroll', closeRowMenu, { passive: true });
}

let requestSeq = 0;

/** Asks main for the menu of a row and shows it at the cursor. */
export function openRowMenu(name: string, nicked: boolean, x: number, y: number): void {
    wire();
    const seq = ++requestSeq;
    api.showWatchMenu(name, nicked).then(view => {
        if (!view || seq !== requestSeq) return;
        closeRowMenu();
        current = view;
        level = view.items;
        inSubmenu = false;
        anchor = { x, y };
        menu = document.createElement('div');
        menu.className = 'row-menu';
        menu.setAttribute('role', 'menu');
        menu.addEventListener('click', onClick);
        menu.addEventListener('contextmenu', e => e.preventDefault());
        document.body.appendChild(menu);
        draw();
        menu.classList.add('is-open');
    }).catch(err => {
        console.error('[Overlay] Row menu failed:', String(err));
        showToast('Could not open the menu', 2500);
    });
}
