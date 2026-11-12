/** Builds one <tr> from a RowView. Pure DOM construction, no global state. */

import type { ColumnDef } from '../../../src/shared/columns';
import { guildCell, playerCell, rankCell, sourceCell, statCell } from './cells';
import { buildStatusCells } from './statusRow';
import type { RenderContext, RowData, RowView } from './types';

/** Level 0/1 with zero stats: likely a bot or a fresh alt. */
function isSuspect(d: RowData): boolean {
    return d.status === 'ok'
        && (d.level === 0 || d.level === 1)
        && d.finalKills === 0 && d.kills === 0 && d.wins === 0;
}

export function selfKey(ctx: Pick<RenderContext, 'isNicked' | 'myNickName' | 'myUsername'>): string {
    return ctx.isNicked && ctx.myNickName ? ctx.myNickName : ctx.myUsername;
}

/** When the user is nicked, the overlay shows their real name instead of the nick. */
function displayName(d: RowData, ctx: RenderContext): string {
    if (ctx.isNicked && ctx.myNickName && ctx.myUsername && d.username.toLowerCase() === ctx.myNickName) {
        return ctx.myUsername.charAt(0).toUpperCase() + ctx.myUsername.slice(1);
    }
    return d.username;
}

export function viewOf(d: RowData, ctx: RenderContext): RowView {
    const key = d.username.toLowerCase();
    const self = selfKey(ctx);
    return {
        data: d,
        name: displayName(d, ctx),
        isParty: ctx.partyMembers.has(key),
        isSelf: !!self && key === self,
        isSuspect: ctx.highlightSuspects && isSuspect(d),
    };
}

/** Fingerprint of everything besides the data object that changes a row's markup. */
export function viewSignature(v: RowView): string {
    return `${v.name}|${+v.isParty}${+v.isSelf}${+v.isSuspect}`;
}

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
