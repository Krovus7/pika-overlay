import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { boundsForLayout, normalizeOverlaySizes, scaleSizes, withSize } from '../src/main/layoutSizes';

const WORK = { x: 0, y: 0, width: 1920, height: 1040 };
const CUR = { x: 100, y: 50, width: 900, height: 500 };

describe('normalizeOverlaySizes', () => {
    it('defaults to null for missing or invalid entries', () => {
        assert.deepEqual(normalizeOverlaySizes(undefined), { detailed: null, compact: null });
        assert.deepEqual(
            normalizeOverlaySizes({ detailed: { width: -1, height: 5 }, compact: { width: 'x', height: 5 } }),
            { detailed: null, compact: null });
        assert.deepEqual(normalizeOverlaySizes({ compact: { width: NaN, height: 5 } }).compact, null);
    });
    it('keeps valid sizes and drops extra fields', () => {
        const s = normalizeOverlaySizes({ detailed: { width: 800, height: 400, x: 3 } });
        assert.deepEqual(s, { detailed: { width: 800, height: 400 }, compact: null });
    });
});

describe('withSize / scaleSizes', () => {
    it('stores only width and height under the mode', () => {
        const s = withSize({ detailed: null, compact: null }, 'compact', { ...CUR });
        assert.deepEqual(s, { detailed: null, compact: { width: 900, height: 500 } });
    });
    it('scales both sizes and leaves null alone', () => {
        const s = scaleSizes({ detailed: { width: 800, height: 400 }, compact: null }, 1, 1.25);
        assert.deepEqual(s, { detailed: { width: 1000, height: 500 }, compact: null });
    });
});

describe('boundsForLayout', () => {
    it('returns null without a saved size', () => {
        assert.equal(boundsForLayout(CUR, null, 1, WORK), null);
    });
    it('keeps the top-left and takes the saved size', () => {
        assert.deepEqual(boundsForLayout(CUR, { width: 600, height: 300 }, 1, WORK),
            { x: 100, y: 50, width: 600, height: 300 });
    });
    it('shifts into the work area when the size would overflow', () => {
        const b = boundsForLayout({ ...CUR, x: 1500 }, { width: 800, height: 300 }, 1, WORK);
        assert.deepEqual(b, { x: 1120, y: 50, width: 800, height: 300 });
    });
    it('shrinks to the work area and respects the minimum size', () => {
        assert.deepEqual(boundsForLayout(CUR, { width: 5000, height: 5000 }, 1, WORK),
            { x: 0, y: 0, width: 1920, height: 1040 });
        const small = boundsForLayout(CUR, { width: 10, height: 10 }, 1.5, WORK);
        assert.equal(small?.width, 540);
        assert.equal(small?.height, 300);
    });
});
