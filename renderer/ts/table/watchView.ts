/** Watchlist chip and alert wording from the resolved view main sends. Pure, no DOM. */

import type { WatchKind, WatchResolved } from '../../../src/shared/watchlist';
import type { Chip } from './tagsCell';

const CHIP_LABEL: Record<WatchKind, string> = { sniper: 'SNIPER', cheater: 'CHEATER', other: 'OTHER' };
const KIND_WORD: Record<WatchKind, string> = { sniper: 'Sniper', cheater: 'Cheater', other: 'Watched' };

export function watchChip(w: WatchResolved): Chip {
    const cls = `tag-watch tag-${w.kind}${w.imported ? ' tag-imported' : ''}`;
    const title = w.imported
        ? `From ${w.sourceLabel}${w.note ? `: ${w.note}` : ''}`
        : w.note || `${KIND_WORD[w.kind]} (your watchlist)`;
    return { kind: 'watchlist', label: CHIP_LABEL[w.kind], title, cls };
}

export function alertText(kind: WatchKind, name: string): string {
    return `${CHIP_LABEL[kind]} ${name} is in your lobby`;
}
