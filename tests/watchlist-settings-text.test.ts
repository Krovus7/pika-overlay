import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filterEntries, formatAddedDate, friendLabel, nickLinksSorted, previewLines } from '../renderer/ts/settings/watchText';
import type { WatchEntry } from '../src/shared/watchlist';

const entry = (name: string, note: string, source = 'me'): WatchEntry => ({ name, kind: 'sniper', note, addedAt: 0, source });

describe('watchlist tab text helpers', () => {
    it('filterEntries: own entries only, matches name or note case-insensitively, sorted by name', () => {
        const all = [entry('Zed', 'camps'), entry('alpha', 'Bed breaker'), entry('Imported', 'camps', 'list-1')];
        assert.deepEqual(filterEntries(all, '').map(e => e.name), ['alpha', 'Zed']);
        assert.deepEqual(filterEntries(all, ' CAMP ').map(e => e.name), ['Zed']);
        assert.deepEqual(filterEntries(all, 'bed').map(e => e.name), ['alpha']);
        assert.deepEqual(filterEntries(all, 'nomatch'), []);
    });

    it('formatAddedDate: local YYYY-MM-DD with zero padding', () => {
        assert.equal(formatAddedDate(new Date(2026, 0, 5, 12).getTime()), '2026-01-05');
        assert.equal(formatAddedDate(new Date(2026, 10, 20, 23, 59).getTime()), '2026-11-20');
    });

    it('previewLines: counts, conflicts, invalid, and the replace warning only when it applies', () => {
        const base = { token: 't', label: 'Friends', count: 1, conflicts: 0, invalid: 0, replacesExisting: false };
        assert.deepEqual(previewLines(base), ['1 name in "Friends".']);
        assert.deepEqual(previewLines({ ...base, count: 3, conflicts: 2, invalid: 1, replacesExisting: true }), [
            '3 names in "Friends".',
            '2 names already in your own list (your entry wins).',
            '1 line skipped as not valid names.',
            'This will replace the existing list "Friends".',
        ]);
    });

    it('nick links: friend label and sorting', () => {
        const a = { nick: 'b_nick', friend: '', addedAt: 0 };
        const b = { nick: 'A_nick', friend: 'Pal', addedAt: 0 };
        assert.equal(friendLabel(a), 'Someone else');
        assert.equal(friendLabel(b), 'Pal');
        assert.deepEqual(nickLinksSorted([a, b]).map(l => l.nick), ['A_nick', 'b_nick']);
    });
});
