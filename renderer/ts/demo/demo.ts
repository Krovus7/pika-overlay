/**
 * Demo helpers for visual verification (window.__pikaDemo*). They fill and
 * style the table through the normal render path, with no IPC and no network,
 * and never write to the user's config.
 */

import type { ApiHealth } from '../../../src/shared/types';
import { applyLayoutClass } from '../ui/appearance';
import { clearTable } from '../core/players';
import { state } from '../core/state';
import { buildHeaders } from '../table/header';
import { renderNow } from '../table/render';
import { setHealth } from '../ui/banner';
import { applyOpacity } from '../ui/lowOpacity';
import { setThemeDom } from '../ui/theme';
import { setBackdrop } from './backdrops';
import { DEMO_PARTY, DEMO_SELF, demoRows } from './demoRows';

function healthOf(kind: string): ApiHealth {
    switch (kind) {
        case 'key_missing': return { kind: 'key_missing' };
        case 'key_invalid': return { kind: 'key_invalid' };
        case 'rate_limited': return { kind: 'rate_limited', retryAt: Date.now() + 23_000 };
        case 'unreachable': return { kind: 'unreachable' };
        default: return { kind: 'ok' };
    }
}

export function registerDemo(): void {
    window.__pikaDemo = () => {
        state.players.clear();
        for (const row of demoRows()) state.players.set(row.username.toLowerCase(), row);
        state.myUsername = DEMO_SELF.toLowerCase();
        state.isNicked = false;
        state.pinSelf = true;
        state.party = new Set(DEMO_PARTY.map(n => n.toLowerCase()));
        renderNow();
    };
    window.__pikaDemoClear = () => clearTable();
    window.__pikaDemoHealth = kind => setHealth(healthOf(kind));
    window.__pikaDemoLayout = layout => {
        state.layout = layout;
        applyLayoutClass();
        buildHeaders();
        renderNow();
    };
    window.__pikaDemoOpacity = alpha => applyOpacity(alpha);
    window.__pikaDemoTheme = theme => setThemeDom(theme);
    window.__pikaDemoBackdrop = scene => setBackdrop(scene);
    window.__pikaDemoDensity = dense => document.body.classList.toggle('density-dense', dense);
}
