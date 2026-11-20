/**
 * Renderer table types. Every row is either a loading placeholder or a
 * lookup outcome exactly as the main process sent it (discriminated on status).
 */

import type { StatsPayload } from '../../../src/shared/ipc-contract';
import type { LoginAgeSettings, LoginAgeView } from './loginAge';
import type { WatchResolved } from '../../../src/shared/watchlist';
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
    loginAge: LoginAgeSettings;
    /** Watched names (lowercase) with the precedence already applied in main */
    watch?: ReadonlyMap<string, WatchResolved>;
    /** One clock reading per render so every row agrees on ages. */
    now: number;
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
    age: LoginAgeView | null;
    watch?: WatchResolved | null;
}
