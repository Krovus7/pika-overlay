/**
 * Renderer table types. Every row is either a loading placeholder or a
 * lookup outcome exactly as the main process sent it (discriminated on status).
 */

import type { StatsPayload } from '../../../src/shared/ipc-contract';
import type { RatioColors, RatioThresholds } from '../../../src/shared/types';

export interface LoadingRow {
    username: string;
    source: string;
    status: 'loading';
}

export type RowData = StatsPayload | LoadingRow;

/** Render-wide inputs that change how any row looks. */
export interface RenderContext {
    partyMembers: ReadonlySet<string>;
    myUsername: string;
    myNickName: string;
    isNicked: boolean;
    thresholds: RatioThresholds;
    colors: RatioColors;
    highlightSuspects: boolean;
    /** Wording for "no games" rows, e.g. "this week in Solo" */
    periodNote: string;
}

/** Per-row facts derived from data + context. */
export interface RowView {
    data: RowData;
    name: string;
    isParty: boolean;
    isSelf: boolean;
    isSuspect: boolean;
}
