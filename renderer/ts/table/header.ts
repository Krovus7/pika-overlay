/** Table header: built from config, sorted via one delegated click listener. */

import { COLUMN_DEFS, type ColumnDef } from '../../../src/shared/columns';
import { state } from '../core/state';
import { icon } from '../ui/icons';

const COL_WIDTH: Record<string, number> = {
    rank: 108, guild: 80, fkdr: 58, finals: 60, kdr: 50, wlr: 50, wins: 56,
    beds: 52, winstreak: 42, kills: 58, deaths: 66, bowkills: 50, source: 72,
};
const PLAYER_MIN_WIDTH = 120;
const NUMERIC = new Set(['fkdr', 'finals', 'kdr', 'wlr', 'wins', 'beds', 'winstreak', 'kills', 'deaths', 'bowkills']);

const theadRow = document.getElementById('stats-thead-row') as HTMLElement;
const table = document.getElementById('stats-table') as HTMLElement;

export function getVisibleCols(): ColumnDef[] {
    const list = state.columnOrder
        .map(id => COLUMN_DEFS.find(c => c.id === id))
        .filter((col): col is ColumnDef => !!col && state.columnEnabled[col.id] !== false);
    return state.layout === 'compact' ? list.filter(col => state.compactColumns.has(col.id)) : list;
}

export function buildHeaders(): void {
    const cols = getVisibleCols();
    let minWidth = PLAYER_MIN_WIDTH;
    const ths = cols.map(col => {
        const th = document.createElement('th');
        th.className = col.cls;
        const width = COL_WIDTH[col.id];
        if (width) {
            th.style.width = `${width}px`;
            minWidth += width;
        }
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
    table.style.minWidth = `${minWidth}px`;
}

export function initHeader(onSortChange: () => void): void {
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
