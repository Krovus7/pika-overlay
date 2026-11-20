import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { placeMenu, stepIndex } from '../renderer/ts/table/menuPlacement';
import { MenuSession } from '../src/main/watchlist/menuSession';
import type { MenuSpec } from '../src/main/watchlist/menuSpec';

const base = { width: 200, height: 150, viewWidth: 800, viewHeight: 600, margin: 6 };

describe('placeMenu', () => {
    it('opens at the cursor when it fits', () => {
        assert.deepEqual(placeMenu({ ...base, x: 100, y: 120 }), { left: 100, top: 120, maxHeight: 588 });
    });

    it('flips left and up when the cursor is near the right and bottom edges', () => {
        const p = placeMenu({ ...base, x: 700, y: 550 });
        assert.equal(p.left, 500);
        assert.equal(p.top, 400);
    });

    it('clamps inside the margin when flipping would not fit either', () => {
        const p = placeMenu({ ...base, viewWidth: 220, x: 100, y: 0 });
        assert.equal(p.left, 14);
        assert.equal(p.top, 6);
    });

    it('limits the height of a menu taller than the window', () => {
        const p = placeMenu({ ...base, height: 900, x: 10, y: 300 });
        assert.equal(p.maxHeight, 588);
        assert.equal(p.top, 6);
    });

    it('never goes past the margin on any side', () => {
        for (const [x, y] of [[-50, -50], [9999, 9999], [0, 9999], [9999, 0]] as const) {
            const p = placeMenu({ ...base, x, y });
            assert.ok(p.left >= 6 && p.left + 200 <= 794, `left ${p.left}`);
            assert.ok(p.top >= 6 && p.top + 150 <= 594, `top ${p.top}`);
        }
    });
});

describe('stepIndex', () => {
    it('moves over the items and wraps', () => {
        assert.equal(stepIndex(3, -1, 1), 0);
        assert.equal(stepIndex(3, 0, 1), 1);
        assert.equal(stepIndex(3, 2, 1), 0);
        assert.equal(stepIndex(3, 0, -1), 2);
        assert.equal(stepIndex(3, -1, -1), 2);
        assert.equal(stepIndex(0, -1, 1), -1);
    });
});

describe('MenuSession', () => {
    const calls: string[] = [];
    const specs: MenuSpec[] = [
        { label: 'A', kind: 'action', tone: 'sniper', checked: true, click: () => { calls.push('A'); return true; } },
        { label: '', kind: 'separator' },
        { label: 'Info', kind: 'info' },
        { label: 'Sub', kind: 'submenu', items: [{ label: 'B', kind: 'action', click: () => { calls.push('B'); return true; } }] },
    ];

    it('serializes without closures and gives ids only to pickable items', () => {
        const view = new MenuSession().open('Steve', specs);
        assert.equal(view.title, 'Steve');
        assert.deepEqual(JSON.parse(JSON.stringify(view.items)), view.items);
        assert.deepEqual(view.items.map(i => i.id !== undefined), [true, false, false, false]);
        assert.equal(view.items[0]!.checked, true);
        assert.equal(view.items[3]!.items![0]!.id !== undefined, true);
    });

    it('runs the pick once for the current token', () => {
        calls.length = 0;
        const s = new MenuSession();
        const view = s.open('x', specs);
        assert.equal(s.pick(view.token, view.items[3]!.items![0]!.id), true);
        assert.equal(s.pick(view.token, view.items[0]!.id), false);
        assert.deepEqual(calls, ['B']);
    });

    it('returns the result of the action, so a failed one can be reported', () => {
        const s = new MenuSession();
        const view = s.open('x', [{ label: 'Bad', kind: 'action', click: () => false }]);
        assert.equal(s.pick(view.token, view.items[0]!.id), false);
        assert.equal(s.pick(view.token, view.items[0]!.id), false);
    });

    it('a newer menu invalidates older tokens, and bad input is ignored', () => {
        calls.length = 0;
        const s = new MenuSession();
        const old = s.open('x', specs);
        const fresh = s.open('y', specs);
        assert.equal(s.pick(old.token, old.items[0]!.id), false);
        assert.equal(s.pick(5, 'a0'), false);
        assert.equal(s.pick(fresh.token, 'nope'), false);
        assert.deepEqual(calls, []);
    });
});
