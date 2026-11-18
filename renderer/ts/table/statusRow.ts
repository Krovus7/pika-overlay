/**
 * Status rows: every non-ok outcome gets a pill + a short dim note.
 * The pill spans the stat columns; rank/level and guild always keep their own
 * cells (empty when the profile is unknown), as does tags, so all pills share one left edge.
 */

import type { ColumnDef } from '../../../src/shared/columns';
import type { PlayerProfileInfo } from '../../../src/shared/types';
import { icon, type IconName } from '../ui/icons';
import { guildCell, playerCell, rankCell, sourceCell } from './cells';
import { esc } from './format';
import { tagsCell, viewChips } from './tagsCell';
import type { RenderContext, RowView } from './types';

interface StatusStyle {
    tone: string;
    icon: IconName;
    label: string;
    note: (ctx: RenderContext, view: RowView) => string;
}

/** Up to this profile level a stat-less public profile is most likely a brand-new account. */
const NEW_ACCOUNT_MAX_LEVEL = 5;

function noStatsNote(view: RowView): string {
    const level = profileOf(view)?.level;
    return level != null && level <= NEW_ACCOUNT_MAX_LEVEL
        ? 'new account, no BedWars games'
        : 'no public BedWars stats';
}

export const STATUS_STYLES: Record<string, StatusStyle> = {
    nicked:       { tone: 'nicked',  icon: 'alert', label: 'NICKED', note: () => 'name not on Pika' },
    not_found:    { tone: 'neutral', icon: 'help',  label: 'NOT FOUND', note: () => 'typo or nicked' },
    api_off:      { tone: 'muted',   icon: 'lock',  label: 'API OFF', note: () => 'stats set to private' },
    never_played: { tone: 'new',     icon: 'spark', label: 'NO STATS', note: (_ctx, view) => noStatsNote(view) },
    no_data:      { tone: 'muted',   icon: 'clock', label: 'NO GAMES', note: ctx => ctx.periodNote },
    error:        { tone: 'warn',    icon: 'circle-alert', label: 'ERROR', note: () => 'lookup failed' },
    rate_limited: { tone: 'warn',    icon: 'clock', label: 'RATE LIMITED', note: () => 'retrying automatically' },
    auth:         { tone: 'key',     icon: 'key',   label: 'KEY REQUIRED', note: () => 'add your API key in Settings' },
};

function profileOf(view: RowView): PlayerProfileInfo | null {
    const d = view.data;
    return 'rank' in d ? d : null;
}

function statusInner(view: RowView, style: StatusStyle, ctx: RenderContext): string {
    const status = view.data.status;
    const retry = status === 'error'
        ? `<button class="retry-btn" data-action="retry" data-user="${esc(view.data.username)}" title="Retry lookup">${icon('retry')}<span>Retry</span></button>`
        : '';
    return `<div class="status-wrap"><span class="pill pill-${style.tone}${style.label.length > 8 ? ' pill-long' : ''}" title="${esc(style.label)}">${icon(style.icon)}<span class="pill-label">${style.label}</span></span>`
        + `<span class="status-note">${esc(style.note(ctx, view))}</span>${retry}</div>`;
}

function leadCell(col: ColumnDef, view: RowView, info: PlayerProfileInfo | null): string {
    switch (col.id) {
        case 'rank': return rankCell(info);
        case 'player': return playerCell(view, view.data.status === 'nicked' ? icon('alert') : '');
        case 'tags': return tagsCell(viewChips(view));
        case 'guild': return guildCell(info?.guild);
        case 'source': return sourceCell(view.data.source);
        default: return '<td></td>';
    }
}

export function buildStatusCells(view: RowView, cols: ColumnDef[], ctx: RenderContext): string {
    const style = STATUS_STYLES[view.data.status];
    if (!style) return '';
    const info = profileOf(view);
    const playerIdx = Math.max(0, cols.findIndex(c => c.id === 'player'));
    const cells = cols.slice(0, playerIdx + 1).map(c => leadCell(c, view, info));

    const tail = cols.slice(playerIdx + 1);
    const source = tail.length && tail[tail.length - 1]!.id === 'source' ? tail.pop() : undefined;
    // Tags keeps its own cell too: a nicked player can carry chips
    if (tail[0]?.id === 'tags') {
        cells.push(tagsCell(viewChips(view)));
        tail.shift();
    }
    // Always keep the Guild cell (a dash when unknown) so every pill starts at the same x
    if (tail[0]?.id === 'guild') {
        cells.push(guildCell(info?.guild));
        tail.shift();
    }

    if (tail.length) cells.push(`<td colspan="${tail.length}">${statusInner(view, style, ctx)}</td>`);
    if (source) cells.push(leadCell(source, view, info));
    return cells.join('');
}
