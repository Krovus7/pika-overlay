import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { profileInfo } from '../src/main/api/statsExtractor';
import { decideFromTotal } from '../src/main/api/decision';
import { formatAge, loginAgeView, type LoginAgeSettings } from '../renderer/ts/table/loginAge';
import { viewSignature } from '../renderer/ts/table/rowView';
import { viewChips } from '../renderer/ts/table/tagsCell';
import type { RowView } from '../renderer/ts/table/types';
import type { PlayerResult } from '../src/shared/types';

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const MIN = 60_000;
const ago = (ms: number): number => NOW - ms;

describe('profileInfo.lastSeen', () => {
    const seen = (v: unknown): number | null => profileInfo({ lastSeen: v }, NOW).lastSeen;

    it('keeps a plausible epoch-ms number', () => {
        assert.equal(seen(ago(4 * MIN)), ago(4 * MIN));
        assert.equal(seen(NOW + 4 * MIN), NOW + 4 * MIN);
    });

    it('rejects missing, non-number, non-finite, too old and future values', () => {
        for (const v of [undefined, null, '1700000000000', NaN, Infinity, 0, -5]) assert.equal(seen(v), null);
        assert.equal(seen(Date.UTC(2014, 11, 31)), null);
        assert.equal(seen(Date.UTC(2015, 0, 1)), Date.UTC(2015, 0, 1));
        assert.equal(seen(NOW + 5 * MIN + 1), null);
        assert.equal(seen(1_700_000_000), null, 'seconds instead of milliseconds');
    });

    it('survives the no_data conversion', () => {
        const total = { username: 'a', status: 'ok', lastSeen: 123 } as unknown as PlayerResult;
        assert.equal((decideFromTotal(total) as { lastSeen: number }).lastSeen, 123);
    });
});

describe('formatAge', () => {
    it('picks the unit at the boundaries', () => {
        assert.equal(formatAge(0), '<1m');
        assert.equal(formatAge(MIN - 1), '<1m');
        assert.equal(formatAge(MIN), '1m');
        assert.equal(formatAge(7 * MIN), '7m');
        assert.equal(formatAge(60 * MIN - 1), '59m');
        assert.equal(formatAge(60 * MIN), '1h');
        assert.equal(formatAge(3 * 60 * MIN), '3h');
        assert.equal(formatAge(24 * 60 * MIN - 1), '23h');
        assert.equal(formatAge(24 * 60 * MIN), '1d');
        assert.equal(formatAge(2 * 24 * 60 * MIN), '2d');
    });
});

describe('loginAgeView', () => {
    const low: LoginAgeSettings = { loginAge: 'lowLevel', loginAgeMaxLevel: 10, freshMinutes: 5 };
    const view = (lastSeen: number | null, level: number | null, s: LoginAgeSettings = low) =>
        loginAgeView(lastSeen, level, NOW, s);

    it('is null when off or without lastSeen', () => {
        assert.equal(view(ago(MIN), 1, { ...low, loginAge: 'off' }), null);
        assert.equal(view(null, 1), null);
        assert.equal(view(null, 1, { ...low, loginAge: 'all' }), null);
    });

    it('lowLevel: shown at the max level, hidden above it and for unknown level', () => {
        assert.ok(view(ago(MIN), 10));
        assert.equal(view(ago(MIN), 11), null);
        assert.equal(view(ago(MIN), null), null);
    });

    it('all: ignores the level', () => {
        assert.ok(view(ago(MIN), 500, { ...low, loginAge: 'all' }));
        assert.ok(view(ago(MIN), null, { ...low, loginAge: 'all' }));
    });

    it('fresh at exactly freshMinutes, dim just after', () => {
        const fresh = view(ago(5 * MIN), 1)!;
        assert.deepEqual([fresh.fresh, fresh.text], [true, 'FRESH 5m']);
        const dim = view(ago(5 * MIN + 1), 1)!;
        assert.deepEqual([dim.fresh, dim.text], [false, '5m']);
        assert.equal(view(ago(MIN), 1)!.text, 'FRESH 1m');
        assert.equal(view(ago(7 * MIN), 1)!.text, '7m');
        assert.equal(view(ago(3 * 60 * MIN), 1)!.text, '3h');
    });

    it('clamps a slightly future lastSeen to zero age and words the title neutrally', () => {
        assert.equal(view(NOW + 2 * MIN, 1)!.text, 'FRESH <1m');
        assert.equal(view(ago(3 * MIN), 1)!.title, 'Last seen on Pika 3 minutes ago (Pika profile)');
        assert.equal(view(ago(60 * MIN), 1)!.title, 'Last seen on Pika 1 hour ago (Pika profile)');
    });
});

describe('age chip in the row signature', () => {
    const base: RowView = {
        data: { username: 'x', source: 'log', status: 'loading' },
        name: 'x', isParty: false, isSelf: false, isSuspect: false, age: null,
    };
    const aged = (text: string, fresh = false): RowView =>
        ({ ...base, age: { text, fresh, title: `Last seen ${text}` } });

    it('changes when only the age chip changes', () => {
        assert.notEqual(viewSignature(base), viewSignature(aged('7m')));
        assert.notEqual(viewSignature(aged('7m')), viewSignature(aged('8m')));
        assert.equal(viewSignature(aged('7m')), viewSignature(aged('7m')));
    });

    it('turns the age into an age chip, fresh or dim', () => {
        const [dim] = viewChips(aged('7m'));
        assert.deepEqual([dim!.kind, dim!.label, dim!.cls], ['age', '7m', 'tag-age']);
        assert.equal(viewChips(aged('FRESH 1m', true))[0]!.cls, 'tag-age tag-age-fresh');
    });
});
