/** Table header: built from config, sorted via one delegated click listener. */

import { COLUMN_DEFS, type ColumnDef } from '../../../src/shared/columns';
import { state } from '../core/state';
import { icon } from '../ui/icons';
import { fitColumns } from './fit';

const COL_WIDTH: Record<string, number> = {
    rank: 108, tags: 172, guild: 80, fkdr: 58, finals: 60, kdr: 58, wlr: 58, wins: 56,
    beds: 52, winstreak: 42, kills: 58, deaths: 66, bowkills: 50, source: 72,
};
const PLAYER_MIN_WIDTH = 120;
const NUMERIC = new Set(['fkdr', 'finals', 'kdr', 'wlr', 'wins', 'beds', 'winstreak', 'kills', 'deaths', 'bowkills']);

const theadRow = document.getElementById('stats-thead-row') as HTMLElement;
const wrapper = document.querySelector('.table-wrapper') as HTMLElement;

let fitted: ColumnDef[] = [];
let hiddenCount = 0;

/** Columns the user wants: their order, enabled flags and the compact subset. */
function wantedCols(): ColumnDef[] {
    const list = state.columnOrder
        .map(id => COLUMN_DEFS.find(c => c.id === id))
        .filter((col): col is ColumnDef => !!col && state.columnEnabled[col.id] !== false);
    return state.layout === 'compact' ? list.filter(col => state.compactColumns.has(col.id)) : list;
}

/** Recomputes which wanted columns fit the window; true when the shown list changed. */
function refit(): boolean {
    const width = wrapper.clientWidth;
    const wanted = wantedCols();
    // Before the first layout the width is 0: show everything rather than nothing
    const result = width > 0
        ? fitColumns(wanted, width, col => COL_WIDTH[col.id] ?? 0, PLAYER_MIN_WIDTH)
        : { shown: wanted, hiddenCount: 0 };
    const changed = result.shown.map(c => c.id).join() !== fitted.map(c => c.id).join();
    fitted = result.shown;
    hiddenCount = result.hiddenCount;
    return changed;
}

/** The columns on screen: wanted columns that fit the current window width. */
export function getVisibleCols(): ColumnDef[] {
    return fitted;
}

export function getHiddenColumnCount(): number {
    return hiddenCount;
}

export function buildHeaders(): void {
    refit();
    const cols = fitted;
    const ths = cols.map(col => {
        const th = document.createElement('th');
        th.className = col.cls;
        const width = COL_WIDTH[col.id];
        if (width) th.style.width = `${width}px`;
        if (NUMERIC.has(col.id)) th.classList.add('num');

        if (col.sortKey) {
            const sorted = state.sortCol === col.sortKey;
            th.classList.add('sortable');
            th.dataset.col = col.sortKey;
            th.innerHTML = `<span class="th-in"><span>${col.label}</span>${icon('arrow-down', 'sort-ic')}</span>`;
            if (sorted) {
                th.classList.add('sorted');
                th.classList.toggle('asc', state.sortDir === 1);
                th.setAttribute('aria-sort', state.sortDir === 1 ? 'ascending' : 'descending');
            }
        } else {
            th.textContent = col.label;
        }
        return th;
    });
    theadRow.replaceChildren(...ths);
}

export function initHeader(onSortChange: () => void): void {
    new ResizeObserver(() => {
        if (!refit()) return;
        buildHeaders();
        onSortChange();
    }).observe(wrapper);

    theadRow.addEventListener('click', e => {
        const th = (e.target as HTMLElement).closest<HTMLElement>('th.sortable');
        const col = th?.dataset.col;
        if (!col) return;
        if (state.sortCol === col) {
            state.sortDir = state.sortDir === 1 ? -1 : 1;
        } else {
            state.sortCol = col;
            state.sortDir = -1;
        }
        buildHeaders();
        onSortChange();
    });
}
