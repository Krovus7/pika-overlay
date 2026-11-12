/**
 * Single mutable state object shared by the overlay modules. Modules read it
 * directly and call the render/update functions after changing it.
 */

import { COLUMN_DEFS } from '../../../src/shared/columns';
import type { ApiHealth, RatioColors, RatioThresholds } from '../../../src/shared/types';
import type { RowData } from '../table/types';

export type Layout = 'detailed' | 'compact';

export const DEFAULT_THRESHOLDS: RatioThresholds = {
    fkdr: { hacker: 20, godlike: 10, good: 3, medium: 1 },
    kdr:  { hacker: 5, godlike: 2.5, good: 1.5, medium: 0.75 },
    wlr:  { hacker: 5, godlike: 2.5, good: 1.5, medium: 0.75 },
};

export const DEFAULT_COLORS: RatioColors = {
    hacker: '#f43f5e', godlike: '#d946ef', good: '#22c55e', medium: '#f59e0b', bad: '#ef4444',
};

export interface OverlayState {
    players: Map<string, RowData>; // key = username.toLowerCase()
    sortCol: string;
    sortDir: -1 | 1; // -1 = descending
    interval: string;
    mode: string;
    party: Set<string>;
    layout: Layout;
    compactColumns: Set<string>;
    columnOrder: string[];
    columnEnabled: Record<string, boolean>;
    pinSelf: boolean;
    isNicked: boolean;
    myUsername: string;
    myNickName: string;
    nickedOnTop: boolean;
    highlightSuspects: boolean;
    thresholds: RatioThresholds;
    colors: RatioColors;
    health: ApiHealth;
}

export const state: OverlayState = {
    players: new Map(),
    sortCol: 'fkdr',
    sortDir: -1,
    interval: 'total',
    mode: 'ALL_MODES',
    party: new Set(),
    layout: 'detailed',
    compactColumns: new Set(['rank', 'player', 'fkdr', 'winstreak', 'source']),
    columnOrder: COLUMN_DEFS.map(c => c.id),
    columnEnabled: Object.fromEntries(COLUMN_DEFS.map(c => [c.id, true])),
    pinSelf: false,
    isNicked: false,
    myUsername: '',
    myNickName: '',
    nickedOnTop: true,
    highlightSuspects: true,
    thresholds: DEFAULT_THRESHOLDS,
    colors: DEFAULT_COLORS,
    health: { kind: 'ok' },
};
