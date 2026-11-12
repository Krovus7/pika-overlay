/**
 * Keyed reconciliation: one <tr> per player. A row is rebuilt only when its
 * data object or the context that affects it changed; DOM nodes move only when
 * the order differs from what is already on screen.
 */

import type { ColumnDef } from '../../../src/shared/columns';
import { buildRow, viewOf, viewSignature } from './rowBuilder';
import type { RenderContext, RowData } from './types';

interface Entry {
    tr: HTMLTableRowElement;
    data: RowData;
    sig: string;
}

const entries = new Map<string, Entry>();

function createEntry(d: RowData, sig: string, cols: ColumnDef[], ctx: RenderContext): Entry {
    const tr = buildRow(viewOf(d, ctx), cols, ctx);
    tr.classList.add('row-enter');
    tr.addEventListener('animationend', () => tr.classList.remove('row-enter'), { once: true });
    return { tr, data: d, sig };
}

export function reconcile(
    tbody: HTMLElement,
    sorted: RowData[],
    cols: ColumnDef[],
    ctx: RenderContext,
    ctxSig: string,
): void {
    const live = new Set<string>();
    const ordered: HTMLTableRowElement[] = [];

    for (const d of sorted) {
        const key = d.username.toLowerCase();
        live.add(key);
        const view = viewOf(d, ctx);
        const sig = `${ctxSig}|${viewSignature(view)}`;
        let entry = entries.get(key);
        if (!entry) {
            entry = createEntry(d, sig, cols, ctx);
        } else if (entry.data !== d || entry.sig !== sig) {
            const tr = buildRow(view, cols, ctx);
            entry.tr.replaceWith(tr);
            entry = { tr, data: d, sig };
        }
        entries.set(key, entry);
        ordered.push(entry.tr);
    }

    for (const [key, entry] of entries) {
        if (live.has(key)) continue;
        entry.tr.remove();
        entries.delete(key);
    }

    let cursor = tbody.firstElementChild;
    for (const tr of ordered) {
        if (tr === cursor) cursor = cursor.nextElementSibling;
        else tbody.insertBefore(tr, cursor);
    }
}

export function clearRows(tbody: HTMLElement): void {
    entries.clear();
    tbody.replaceChildren();
}
