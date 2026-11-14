import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { overlayMinSize, scaleBounds } from '../src/main/windowBounds';

const WORK = { x: 0, y: 0, width: 1920, height: 1040 };

describe('scaleBounds', () => {
    it('scales by the ratio with the top-left corner fixed', () => {
        const next = scaleBounds({ x: 100, y: 50, width: 800, height: 400 }, 1, 1.25, WORK);
        assert.deepEqual(next, { x: 100, y: 50, width: 1000, height: 500 });
    });

    it('is relative to the old scale, not to 1', () => {
        const next = scaleBounds({ x: 0, y: 0, width: 1200, height: 600 }, 1.5, 1, WORK);
        assert.deepEqual(next, { x: 0, y: 0, width: 800, height: 400 });
    });

    it('does not drift when scaling up and back down inside the work area', () => {
        const start = { x: 40, y: 60, width: 960, height: 600 };
        let b = start;
        let scale = 1;
        for (const next of [1.2, 1.45, 0.9, 1]) {
            b = scaleBounds(b, scale, next, WORK);
            scale = next;
        }
        assert.deepEqual(b, start);
    });

    it('shrinks to the work area when the scaled size does not fit', () => {
        const next = scaleBounds({ x: 0, y: 0, width: 1500, height: 900 }, 1, 1.5, WORK);
        assert.equal(next.width, 1920);
        assert.equal(next.height, 1040);
    });

    it('moves the window back inside when it would overflow the right or bottom edge', () => {
        const next = scaleBounds({ x: 1500, y: 800, width: 400, height: 200 }, 1, 1.5, WORK);
        assert.deepEqual(next, { x: 1320, y: 740, width: 600, height: 300 });
    });

    it('respects a work area that does not start at the origin', () => {
        const work = { x: -1920, y: 0, width: 1920, height: 1040 };
        const next = scaleBounds({ x: -1950, y: 10, width: 400, height: 200 }, 1, 1, work);
        assert.equal(next.x, -1920);
    });
});

describe('overlayMinSize', () => {
    it('scales the base minimum', () => {
        assert.deepEqual(overlayMinSize(1), { width: 360, height: 200 });
        assert.deepEqual(overlayMinSize(1.5), { width: 540, height: 300 });
    });
});
