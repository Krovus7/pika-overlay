import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isInsideAny, overlayMinSize, placeBeside, scaleBounds } from '../src/main/windowBounds';

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

describe('placeBeside', () => {
    const size = { width: 760, height: 680 };

    it('goes to the right of the overlay when it fits', () => {
        const next = placeBeside({ x: 20, y: 60, width: 960, height: 600 }, size, WORK);
        assert.deepEqual(next, { x: 988, y: 60, width: 760, height: 680 });
    });

    it('goes to the left when the right side is too narrow', () => {
        const next = placeBeside({ x: 1000, y: 60, width: 900, height: 600 }, size, WORK);
        assert.deepEqual(next, { x: 232, y: 60, width: 760, height: 680 });
    });

    it('is centered in the work area when neither side fits', () => {
        const next = placeBeside({ x: 20, y: 60, width: 1880, height: 600 }, size, WORK);
        assert.deepEqual(next, { x: 580, y: 180, width: 760, height: 680 });
    });

    it('keeps the window inside the work area vertically', () => {
        const next = placeBeside({ x: 20, y: 800, width: 400, height: 200 }, size, WORK);
        assert.equal(next.y, 360);
    });

    it('shrinks to a small work area', () => {
        const next = placeBeside({ x: 0, y: 0, width: 300, height: 300 }, size, { x: 0, y: 0, width: 640, height: 400 });
        assert.deepEqual(next, { x: 0, y: 0, width: 640, height: 400 });
    });
});

describe('isInsideAny', () => {
    const areas = [WORK, { x: 1920, y: 0, width: 1280, height: 1000 }];

    it('accepts a rectangle inside one display', () => {
        assert.equal(isInsideAny({ x: 2000, y: 50, width: 700, height: 600 }, areas), true);
    });

    it('rejects a rectangle that sticks out or sits on a removed display', () => {
        assert.equal(isInsideAny({ x: 1700, y: 50, width: 700, height: 600 }, areas), false);
        assert.equal(isInsideAny({ x: 4000, y: 50, width: 700, height: 600 }, areas), false);
    });
});
