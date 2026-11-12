/** Small formatting helpers shared by the row builders. */

import type { RatioKey } from '../../../src/shared/types';
import type { RenderContext } from './types';

const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes player-controlled text (names, guilds) for innerHTML. */
export function esc(str: string | null | undefined): string {
    return String(str ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]!);
}

export function fmt(v: number | undefined): string {
    return v == null ? '—' : Number(v).toFixed(2);
}

/** Whole numbers; 10k and above are shortened (21.4k) to fit narrow columns. */
export function fmtInt(v: number | undefined): string {
    if (v == null) return '—';
    if (v < 10_000) return String(v);
    return v < 100_000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v / 1000)}k`;
}

export function ratioColor(v: number | undefined, key: RatioKey, ctx: RenderContext): string {
    if (v == null) return ctx.colors.bad;
    const t = ctx.thresholds[key];
    if (v >= t.hacker) return ctx.colors.hacker;
    if (v >= t.godlike) return ctx.colors.godlike;
    if (v >= t.good) return ctx.colors.good;
    if (v >= t.medium) return ctx.colors.medium;
    return ctx.colors.bad;
}

export function hexWithAlpha(hex: string, alpha: number): string {
    if (!hex || hex.length < 7) return `rgba(170,170,170,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

const PERIOD_WORDS: Record<string, string> = { weekly: 'this week', monthly: 'this month', yearly: 'this year' };
const MODE_WORDS: Record<string, string> = { SOLO: 'in Solo', DOUBLES: 'in Duo', TRIPLES: 'in Triples', QUAD: 'in Quad' };

/** "no games this week in Solo" — wording for the no_data row. */
export function noGamesNote(interval: string, mode: string): string {
    const parts = [PERIOD_WORDS[interval], MODE_WORDS[mode]].filter(Boolean);
    return parts.length ? `no games ${parts.join(' ')}` : 'no games played';
}
