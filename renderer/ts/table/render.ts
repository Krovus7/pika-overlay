/** Render pipeline: state -> sorted rows -> keyed DOM reconciliation. */

import { state } from '../core/state';
import { refreshEmptyState } from '../ui/emptyState';
import { updateFooter } from '../ui/footer';
import { noGamesNote } from './format';
import { getVisibleCols } from './header';
import { clearRows, reconcile } from './reconcile';
import { selfKey } from './rowBuilder';
import { comparePlayers } from './sorting';
import type { RenderContext } from './types';

const tbody = document.getElementById('stats-body') as HTMLElement;
let renderPending = false;

function buildContext(): RenderContext {
    return {
        partyMembers: state.party,
        myUsername: state.myUsername,
        myNickName: state.myNickName,
        isNicked: state.isNicked,
        thresholds: state.thresholds,
        colors: state.colors,
        highlightSuspects: state.highlightSuspects,
        periodNote: noGamesNote(state.interval, state.mode),
    };
}

export function renderNow(): void {
    const ctx = buildContext();
    const cols = getVisibleCols();
    const sortState = {
        col: state.sortCol,
        dir: state.sortDir,
        pinSelf: state.pinSelf,
        selfKey: selfKey(ctx),
        nickedOnTop: state.nickedOnTop,
        partyMembers: state.party,
    };
    const sorted = [...state.players.values()].sort((a, b) => comparePlayers(a, b, sortState));
    const ctxSig = JSON.stringify([cols.map(c => c.id), ctx.thresholds, ctx.colors, ctx.highlightSuspects, ctx.periodNote]);

    if (sorted.length) reconcile(tbody, sorted, cols, ctx, ctxSig);
    else clearRows(tbody);
    refreshEmptyState();
    updateFooter();
}

export function scheduleRender(): void {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
        renderPending = false;
        renderNow();
    });
}
