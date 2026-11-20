import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SETTINGS_TAB_IDS, isSettingsTab } from '../src/shared/ipc-contract';
import { affectsPopup, popupVersion } from '../renderer/ts/ui/updateRule';

describe('popupVersion', () => {
    it('shows an available version that was not dismissed', () => {
        assert.equal(popupVersion({ kind: 'available', version: '5.3.0' }, null), '5.3.0');
    });

    it('stays hidden for the dismissed version, shows a newer one', () => {
        assert.equal(popupVersion({ kind: 'available', version: '5.3.0' }, '5.3.0'), null);
        assert.equal(popupVersion({ kind: 'available', version: '5.3.1' }, '5.3.0'), '5.3.1');
    });

    it('hides for every other state', () => {
        for (const s of [
            { kind: 'idle' }, { kind: 'uptodate' }, { kind: 'downloading', progress: 10 },
            { kind: 'ready', version: '5.3.0' }, { kind: 'error', message: 'x' }, { kind: 'disabled', message: 'x' },
        ] as const) assert.equal(popupVersion(s, null), null, s.kind);
    });
});

describe('affectsPopup', () => {
    it('ignores only the transient checking state', () => {
        assert.equal(affectsPopup({ kind: 'checking' }), false);
        assert.equal(affectsPopup({ kind: 'uptodate' }), true);
        assert.equal(affectsPopup({ kind: 'available', version: '5.3.0' }), true);
    });
});

describe('isSettingsTab', () => {
    it('accepts every tab id, including updates', () => {
        for (const id of SETTINGS_TAB_IDS) assert.equal(isSettingsTab(id), true, id);
        assert.equal(isSettingsTab('updates'), true);
    });

    it('rejects unknown ids and non-strings', () => {
        for (const v of ['', 'Updates', 'admin', undefined, null, 3, {}]) assert.equal(isSettingsTab(v), false);
    });
});
