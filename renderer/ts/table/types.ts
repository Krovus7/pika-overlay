/**
 * Renderer table types — row shape and the render context shared by the
 * sorting comparator and the row builder.
 */

import type { RatioColors, RatioThresholds } from '../../../src/shared/types';
import type { PlayerStats } from '../../../src/shared/types';

export type PlayerRow = Partial<PlayerStats> & {
    username: string;
    source: string;
    loading?: boolean;
    error?: boolean;
    rankSortValue?: number;
};

export interface RenderContext {
    partyMembers: ReadonlySet<string>;
    pinSelf: boolean;
    myUsername: string;
    myNickName: string;
    isNicked: boolean;
    ratioThresholds: RatioThresholds;
    ratioColors: RatioColors;
}
