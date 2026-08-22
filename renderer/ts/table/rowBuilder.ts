/**
 * Row builder — ported from pika-overlay-v3/renderer/overlay.js `buildRow`,
 * `buildRankCell`, `isSuspect`, `displayName` and the small helpers
 * (ratioColor, fmt, esc, srcBadge, hexWithAlpha).
 */

import type { ColumnDef } from '../../../src/shared/columns';
import type { RatioKey } from '../../../src/shared/types';
import type { RenderContext, PlayerRow } from './types';

// ─── Suspect detection (bot/alt): level ≤ 1 and zero stats ───────────────────
export function isSuspect(p: PlayerRow): boolean {
    if (p.loading || p.error || p.notFound) return false;
    return (
        (p.level === 1 || p.level === 0) &&
        (p.finalKills ?? 0) === 0 &&
        (p.kills ?? 0) === 0 &&
        (p.wins ?? 0) === 0
    );
}

// ─── Display name resolver ────────────────────────────────────────────────────
// When the user is nicked, replace their nick with their real name in the overlay
export function displayName(p: PlayerRow, ctx: RenderContext): string {
    if (ctx.isNicked && ctx.myNickName && ctx.myUsername && p.username.toLowerCase() === ctx.myNickName) {
        return ctx.myUsername.charAt(0).toUpperCase() + ctx.myUsername.slice(1);
    }
    return p.username;
}

export function buildRow(p: PlayerRow, visCols: ColumnDef[], ctx: RenderContext): HTMLTableRowElement {
    const tr = document.createElement('tr');
    const vis = visCols;
    const colSpan = vis.length;
    const dName = displayName(p, ctx);
    const isPartyRow = ctx.partyMembers.size > 0 && ctx.partyMembers.has(p.username.toLowerCase());

    if (p.loading) {
        tr.className = 'row-loading';
        const cells = vis.map((col, i) => {
            if (i === 0) return `<td>—</td>`;
            if (col.id === 'player') return `<td><span class="spinner"></span>${esc(dName)}</td>`;
            if (i === 2 || (colSpan <= 2 && i === colSpan - 1)) {
                return `<td colspan="${Math.max(1, colSpan - 2)}" class="muted-italic">Loading…</td>`;
            }
            return null;
        }).filter(Boolean);
        tr.innerHTML = cells.join('');
        return tr;
    }

    if (p.notFound) {
        const playerIsNicked = !!p.nicked;
        const isApiOff = !!p.apiOff;

        tr.className = playerIsNicked ? 'row-nicked' : 'row-notfound';
        if (isPartyRow) tr.classList.add('row-party');

        const hasSource = vis.some(c => c.id === 'source');
        const innerSpan = vis.length - 2 - (hasSource ? 1 : 0);

        let statusMsg: string;
        let statusIcon: string;
        if (playerIsNicked) {
            statusIcon = '🎭';
            statusMsg = '<span class="nicked-alert">NICKED</span>';
        } else if (isApiOff) {
            statusIcon = '🔒';
            statusMsg = 'API Off';
        } else {
            statusIcon = '🔒';
            statusMsg = 'Private / no data';
        }

        const nameBadge = isPartyRow ? '<span class="party-badge" title="Party member">♦</span>'
            : playerIsNicked ? `<span class="nicked-badge" title="Likely nicked">${statusIcon}</span>`
                : '';

        const cells = [
            '<td>—</td>',
            `<td class="player-name">${nameBadge}${esc(dName)}</td>`,
            ...(innerSpan > 0 ? [`<td colspan="${innerSpan}" class="${playerIsNicked ? 'nicked-msg' : 'notfound-msg'}">${playerIsNicked ? '' : statusIcon + ' '}${statusMsg}</td>`] : []),
            ...(hasSource ? [`<td>${srcBadge(p.source)}</td>`] : []),
        ];
        tr.innerHTML = cells.join('');
        return tr;
    }

    if (p.error) {
        tr.className = 'row-error';
        if (isPartyRow) tr.classList.add('row-party');

        const hasSource = vis.some(c => c.id === 'source');
        const innerSpan = vis.length - 2 - (hasSource ? 1 : 0);
        const cells = [
            '<td>—</td>',
            `<td>${isPartyRow ? '<span class="party-badge" title="Party member">♦</span>' : ''}${esc(dName)}</td>`,
            ...(innerSpan > 0 ? [`<td colspan="${innerSpan}" class="error-msg">⚠ API blocked/err</td>`] : []),
            ...(hasSource ? [`<td>${srcBadge(p.source)}</td>`] : []),
        ];
        tr.innerHTML = cells.join('');
        return tr;
    }

    if (isSuspect(p)) tr.classList.add('row-suspect');
    if (isPartyRow) tr.classList.add('row-party');

    const cells = vis.map(col => {
        switch (col.id) {
            case 'rank':
                return `<td class="col-rank">${buildRankCell(p)}</td>`;
            case 'player':
                return `<td class="player-name">${isPartyRow ? '<span class="party-badge" title="Party member">♦</span>' : ''}${esc(dName)}</td>`;
            case 'guild':
                return `<td class="val-dim guild-cell" title="${esc(p.guild || '')}">${esc(p.guild || '—')}</td>`;
            case 'fkdr':
                return `<td style="color:${ratioColor(p.fkdr, 'fkdr', ctx)};font-weight:600">${fmt(p.fkdr)}</td>`;
            case 'finals':
                return `<td class="val-dim">${p.finalKills ?? '—'}</td>`;
            case 'kdr':
                return `<td style="color:${ratioColor(p.kdr, 'kdr', ctx)};font-weight:600">${fmt(p.kdr)}</td>`;
            case 'wlr':
                return `<td style="color:${ratioColor(p.wlr, 'wlr', ctx)};font-weight:600">${fmt(p.wlr)}</td>`;
            case 'wins':
                return `<td class="val-dim">${p.wins ?? '—'}</td>`;
            case 'beds':
                return `<td class="val-dim">${p.bedsDestroyed ?? '—'}</td>`;
            case 'winstreak':
                return `<td class="val-dim">${p.winstreak ?? '—'}</td>`;
            case 'kills':
                return `<td class="val-dim">${p.kills ?? '—'}</td>`;
            case 'deaths':
                return `<td class="val-dim">${p.deaths ?? '—'}</td>`;
            case 'bowkills':
                return `<td class="val-dim">${p.bowKills ?? '—'}</td>`;
            case 'source':
                return `<td>${srcBadge(p.source)}</td>`;
            default:
                return '<td class="val-dim">—</td>';
        }
    });

    tr.innerHTML = cells.join('');
    return tr;
}

function buildRankCell(p: PlayerRow): string {
    const parts: string[] = [];
    if (p.level != null && p.level > 0) {
        parts.push(`<span class="level-tag">Lv.${p.level}</span>`);
    }
    if (p.rank?.text) {
        const bg = hexWithAlpha(p.rank.color, 0.22);
        const col = p.rank.color;
        parts.push(`<span class="rank-tag" style="background:${bg};color:${col}">${esc(p.rank.text)}</span>`);
    }
    return parts.length ? parts.join('') : '<span class="val-dim">—</span>';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function ratioColor(v: number | undefined, ratioKey: string, ctx: RenderContext): string {
    if (v == null) return ctx.ratioColors.bad;
    const t = ctx.ratioThresholds[ratioKey as RatioKey] ?? ctx.ratioThresholds.fkdr;
    if (v >= t.hacker)  return ctx.ratioColors.hacker;
    if (v >= t.godlike) return ctx.ratioColors.godlike;
    if (v >= t.good)    return ctx.ratioColors.good;
    if (v >= t.medium)  return ctx.ratioColors.medium;
    return ctx.ratioColors.bad;
}

export function fmt(v: number | undefined): string {
    if (v == null) return '—';
    return Number(v).toFixed(2);
}

const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(str: string | null | undefined): string {
    return String(str ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]!);
}

export function srcBadge(src: string): string {
    if (!src) return '';
    let cls: string; let label: string; let icon: string;
    switch (src) {
        case 'manual':    cls = 'src-manual';  label = 'Search'; icon = '🔍'; break;
        case 'bulk':      cls = 'src-bulk';    label = 'Paste';  icon = '📋'; break;
        case 'tab_list':  cls = 'src-log';     label = 'Tab';    icon = '📋'; break;
        case 'join':      cls = 'src-log';     label = 'Join';   icon = '📥'; break;
        case 'kill_feed': cls = 'src-log';     label = 'Kill';   icon = '⚔';  break;
        case 'bed_break': cls = 'src-log';     label = 'Bed';    icon = '🛏';  break;
        case 'party':     cls = 'src-party';   label = 'Party';  icon = '♦';  break;
        default:          cls = 'src-log';     label = 'Auto';   icon = '🤖'; break;
    }
    return `<span class="src-badge ${cls}" title="${label}">${icon} ${label}</span>`;
}

export function hexWithAlpha(hex: string, alpha: number): string {
    if (!hex || hex.length < 7) return `rgba(170,170,170,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}
