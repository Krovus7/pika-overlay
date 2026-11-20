/** Builds one <tr> from a RowView. Pure DOM construction, no global state. */

import type { ColumnDef } from '../../../src/shared/columns';
import { guildCell, playerCell, rankCell, sourceCell, statCell } from './cells';
import { buildStatusCells } from './statusRow';
import { tagsCell, viewChips } from './tagsCell';
import type { RenderContext, RowView } from './types';

export { selfKey, viewOf, viewSignature } from './rowView';

function rowClasses(v: RowView): string {
    const c: string[] = [];
    const status = v.data.status;
    if (status === 'loading') c.push('row-loading');
    else if (status !== 'ok') c.push('row-status', `row-${status.replace('_', '-')}`);
    if (status === 'nicked') c.push('row-nicked');
    if (v.isSelf) c.push('row-self');
    if (v.isParty) c.push('row-party');
    if (v.isSuspect) c.push('row-suspect');
    return c.join(' ');
}

function loadingCell(col: ColumnDef, v: RowView): string {
    switch (col.id) {
        case 'player': return playerCell(v);
        case 'tags': return tagsCell(viewChips(v));
        case 'source': return sourceCell(v.data.source);
        case 'rank': return '<td class="col-rank"><span class="skel"></span></td>';
        case 'guild': return '<td><span class="skel skel-wide"></span></td>';
        default: return '<td class="num"><span class="skel"></span></td>';
    }
}

function okCell(col: ColumnDef, v: RowView, ctx: RenderContext): string {
    const d = v.data;
    if (d.status !== 'ok') return '<td></td>';
    switch (col.id) {
        case 'rank': return rankCell(d);
        case 'player': return playerCell(v);
        case 'tags': return tagsCell(viewChips(v));
        case 'guild': return guildCell(d.guild);
        case 'source': return sourceCell(d.source);
        default: return statCell(col.id, d, ctx);
    }
}

export function buildRow(v: RowView, cols: ColumnDef[], ctx: RenderContext): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.dataset.key = v.data.username.toLowerCase();
    tr.className = rowClasses(v);
    const status = v.data.status;
    if (status === 'loading') tr.innerHTML = cols.map(c => loadingCell(c, v)).join('');
    else if (status === 'ok') tr.innerHTML = cols.map(c => okCell(c, v, ctx)).join('');
    else tr.innerHTML = buildStatusCells(v, cols, ctx);
    return tr;
}
