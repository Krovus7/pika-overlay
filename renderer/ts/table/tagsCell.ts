/**
 * Tags column: small chips about a player, rendered left-aligned in a fixed
 * order. Callers describe chips; this file owns order, markup and the `title`.
 */

import { esc } from './format';
import type { LoginAgeView } from './loginAge';

export type ChipKind = 'you' | 'watchlist' | 'age' | 'bot';

export interface Chip {
    kind: ChipKind;
    label: string;
    /** Hover text for the chip and its entry in the cell title. */
    title: string;
    /** Extra class for colour, e.g. `tag-you`. */
    cls: string;
}

const CHIP_ORDER: readonly ChipKind[] = ['you', 'watchlist', 'age', 'bot'];

/** Chips for the facts every row view already carries. */
export function viewChips(view: { isSelf: boolean; isSuspect: boolean; age?: LoginAgeView | null }): Chip[] {
    const chips: Chip[] = [];
    if (view.isSelf) chips.push({ kind: 'you', label: 'YOU', title: 'You', cls: 'tag-you' });
    if (view.age) {
        const cls = view.age.fresh ? 'tag-age tag-age-fresh' : 'tag-age';
        chips.push({ kind: 'age', label: view.age.text, title: view.age.title, cls });
    }
    if (view.isSuspect) {
        chips.push({ kind: 'bot', label: 'BOT?', title: 'Level 1 with no stats: possible bot or fresh alt', cls: 'tag-bot' });
    }
    return chips;
}

export function orderChips(chips: readonly Chip[]): Chip[] {
    return [...chips].sort((a, b) => CHIP_ORDER.indexOf(a.kind) - CHIP_ORDER.indexOf(b.kind));
}

/** Everything that changes the cell's markup, for the row signature. */
export function chipsSignature(chips: readonly Chip[]): string {
    return orderChips(chips).map(c => `${c.kind}:${c.label}:${c.title}`).join(',');
}

export function tagsCell(chips: readonly Chip[]): string {
    const ordered = orderChips(chips);
    const title = ordered.map(c => `${c.label}: ${c.title}`).join('\n');
    const body = ordered
        .map(c => `<span class="tag ${esc(c.cls)}" title="${esc(c.title)}">${esc(c.label)}</span>`)
        .join('');
    return `<td class="col-tags tags-cell"${title ? ` title="${esc(title)}"` : ''}>${body}</td>`;
}
