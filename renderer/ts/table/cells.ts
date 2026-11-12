/** Cell builders shared by ok rows and status rows. Return `<td>` markup. */

import type { PlayerProfileInfo, PlayerStats } from '../../../src/shared/types';
import { icon } from '../ui/icons';
import { esc, fmt, fmtInt, hexWithAlpha, ratioColor } from './format';
import { srcBadge } from './sourceBadge';
import type { RenderContext, RowView } from './types';

export function rankCell(info: PlayerProfileInfo | null): string {
    const parts: string[] = [];
    if (info?.level != null && info.level > 0) parts.push(`<span class="level-tag">Lv.${info.level}</span>`);
    if (info?.rank?.text) {
        const { text, color } = info.rank;
        parts.push(`<span class="rank-tag" style="background:${hexWithAlpha(color, 0.22)};color:${color}">${esc(text)}</span>`);
    }
    return `<td class="col-rank">${parts.length ? parts.join('') : '<span class="val-dim">—</span>'}</td>`;
}

export function playerCell(view: RowView, leadingIcon = ''): string {
    const badge = view.isParty ? icon('diamond', 'party-ic') : '';
    const you = view.isSelf ? '<span class="tag tag-you" title="You">YOU</span>' : '';
    const bot = view.isSuspect
        ? '<span class="tag tag-bot" title="Level 1 with no stats: possible bot or fresh alt">BOT?</span>' : '';
    return `<td class="player-name" title="${esc(view.name)}">${leadingIcon}${badge}${esc(view.name)}${you}${bot}</td>`;
}

export function guildCell(guild: string | null | undefined): string {
    return `<td class="guild-cell" title="${esc(guild)}">${esc(guild || '—')}</td>`;
}

export function sourceCell(source: string): string {
    return `<td>${srcBadge(source)}</td>`;
}

function dimNum(v: number | undefined): string {
    return `<td class="val-dim num">${fmtInt(v)}</td>`;
}

function ratioCell(v: number | undefined, key: 'fkdr' | 'kdr' | 'wlr', ctx: RenderContext): string {
    return `<td class="num" style="color:${ratioColor(v, key, ctx)};font-weight:600">${fmt(v)}</td>`;
}

export function statCell(colId: string, p: PlayerStats, ctx: RenderContext): string {
    switch (colId) {
        case 'fkdr': return ratioCell(p.fkdr, 'fkdr', ctx);
        case 'kdr': return ratioCell(p.kdr, 'kdr', ctx);
        case 'wlr': return ratioCell(p.wlr, 'wlr', ctx);
        case 'finals': return dimNum(p.finalKills);
        case 'wins': return dimNum(p.wins);
        case 'beds': return dimNum(p.bedsDestroyed);
        case 'winstreak': return dimNum(p.winstreak);
        case 'kills': return dimNum(p.kills);
        case 'deaths': return dimNum(p.deaths);
        case 'bowkills': return dimNum(p.bowKills);
        default: return '<td class="val-dim">—</td>';
    }
}
