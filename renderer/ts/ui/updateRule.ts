/** When the "update available" card is shown: pure rule, no DOM. */

import type { UpdateState } from '../../../src/shared/types';

/** A re-check (every 6 h) must not hide or flash a card that is already up. */
export function affectsPopup(state: UpdateState): boolean {
    return state.kind !== 'checking';
}

/** The version to announce, or null when the card must be hidden. */
export function popupVersion(state: UpdateState, dismissed: string | null): string | null {
    if (state.kind !== 'available') return null;
    return state.version === dismissed ? null : state.version;
}
