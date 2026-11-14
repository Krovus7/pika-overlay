import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fitColumns } from '../renderer/ts/table/fit';

const cols = ['rank', 'player', 'fkdr', 'wlr', 'wins', 'source'].map(id => ({ id }));
const WIDTHS: Record<string, number> = { rank: 100, fkdr: 60, wlr: 50, wins: 50, source: 70 };
const widthOf = (c: { id: string }): number => WIDTHS[c.id] ?? 0;
const ids = (r: { shown: { id: string }[] }): string[] => r.shown.map(c => c.id);

describe('fitColumns', () => {
    it('keeps everything when it fits', () => {
        const r = fitColumns(cols, 1000, widthOf, 120);
        assert.equal(r.hiddenCount, 0);
        assert.deepEqual(ids(r), ['rank', 'player', 'fkdr', 'wlr', 'wins', 'source']);
    });

    it('drops the rightmost columns first', () => {
        const r = fitColumns(cols, 310, widthOf, 120);
        assert.deepEqual(ids(r), ['rank', 'player', 'fkdr']);
        assert.equal(r.hiddenCount, 3);
    });

    it('never drops the player column, even when it is not last', () => {
        const r = fitColumns(cols, 130, widthOf, 120);
        assert.deepEqual(ids(r), ['player']);
        assert.equal(r.hiddenCount, 5);
    });

    it('keeps the player alone when nothing else fits', () => {
        assert.deepEqual(ids(fitColumns(cols, 10, widthOf, 120)), ['player']);
    });

    it('accepts an exact fit', () => {
        assert.deepEqual(ids(fitColumns(cols, 220, widthOf, 120)), ['rank', 'player']);
    });
});
