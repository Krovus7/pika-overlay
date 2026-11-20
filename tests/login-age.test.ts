import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { profileInfo } from '../src/main/api/statsExtractor';
import { decideFromTotal } from '../src/main/api/decision';
import { BOT_SESSION_MS, formatAge, loginAgeView, type LoginAgeSettings, type LoginAgeView } from '../renderer/ts/table/loginAge';
import { viewSignature } from '../renderer/ts/table/rowView';
import { viewChips } from '../renderer/ts/table/tagsCell';
import type { RowView } from '../renderer/ts/table/types';
import type { PlayerResult } from '../src/shared/types';

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number): number => NOW - ms;
const clock = (ms: number): string => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

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
        assert.deepEqual([fresh.fresh, fresh.text], [true, '5m']);
        const dim = view(ago(5 * MIN + 1), 1)!;
        assert.deepEqual([dim.fresh, dim.text], [false, '5m']);
        assert.equal(view(ago(MIN), 1)!.text, '1m');
        assert.equal(view(ago(MIN), 1)!.fresh, true);
        assert.equal(view(ago(7 * MIN), 1)!.text, '7m');
        assert.equal(view(ago(3 * 60 * MIN), 1)!.text, '3h');
    });

    it('clamps a slightly future lastSeen to zero age and words the title neutrally', () => {
        assert.equal(view(NOW + 2 * MIN, 1)!.text, '<1m');
        assert.equal(view(ago(60 * MIN), 1)!.title, `Logged in to Pika 1 hour ago (at ${clock(ago(60 * MIN))})`);
    });

    it('words the title as a login time, adding "fresh login" only for fresh ones', () => {
        const fresh = view(ago(3 * MIN), 1)!.title;
        assert.equal(fresh, `Logged in to Pika 3 minutes ago (at ${clock(ago(3 * MIN))}) \u2014 fresh login`);
        assert.equal(view(ago(3 * HOUR), 1)!.title, `Logged in to Pika 3 hours ago (at ${clock(ago(3 * HOUR))})`);
        assert.match(fresh, /\(at \d\d:\d\d\)/);
    });
});

describe('bot chip for long sessions without stats', () => {
    const all: LoginAgeSettings = { loginAge: 'all', loginAgeMaxLevel: 10, freshMinutes: 5 };
    const view = (age: number, status?: string) => loginAgeView(ago(age), 1, NOW, all, status);

    it('turns on at exactly 12h, not just under it', () => {
        assert.equal(view(BOT_SESSION_MS - 1, 'never_played')!.bot, false);
        assert.equal(view(BOT_SESSION_MS - 1, 'never_played')!.text, '11h');
        const bot = view(BOT_SESSION_MS, 'never_played')!;
        assert.deepEqual([bot.bot, bot.text, bot.fresh], [true, 'BOT? 12h', false]);
    });

    it('uses the age in days and a wording that explains it', () => {
        const bot = view(2 * DAY + HOUR, 'never_played')!;
        assert.equal(bot.text, 'BOT? 2d');
        assert.equal(bot.title, 'Connected for 2 days without logging out and no BedWars stats: likely a bot or AFK account');
    });

    it('only for never_played: other statuses keep the plain age', () => {
        for (const status of ['ok', 'api_off', 'no_data', undefined]) {
            const v = view(30 * HOUR, status)!;
            assert.deepEqual([v.bot, v.text], [false, '1d'], String(status));
        }
        assert.equal(view(14 * HOUR, 'ok')!.text, '14h');
    });

    it('still respects the off and level settings', () => {
        assert.equal(loginAgeView(ago(DAY), 1, NOW, { ...all, loginAge: 'off' }, 'never_played'), null);
        assert.equal(loginAgeView(ago(DAY), 50, NOW, { ...all, loginAge: 'lowLevel' }, 'never_played'), null);
    });

    it('renders one BOT? chip: the age chip, without the separate suspect chip', () => {
        const row = (age: LoginAgeView | null, isSuspect: boolean): RowView => ({
            data: { username: 'x', source: 'log', status: 'loading' },
            name: 'x', isParty: false, isSelf: false, isSuspect, age,
        });
        const bot = view(2 * DAY, 'never_played')!;
        const chips = viewChips(row(bot, true));
        assert.deepEqual(chips.map(c => [c.kind, c.cls]), [['age', 'tag-bot']]);
        assert.equal(chips.filter(c => c.label.startsWith('BOT?')).length, 1);
        assert.deepEqual(viewChips(row(null, true)).map(c => c.label), ['BOT?']);
        assert.notEqual(viewSignature(row(bot, true)), viewSignature(row(view(2 * HOUR, 'never_played'), true)));
        assert.notEqual(viewSignature(row(bot, true)), viewSignature(row(view(2 * DAY, 'ok'), true)));
    });
});

describe('age chip in the row signature', () => {
    const base: RowView = {
        data: { username: 'x', source: 'log', status: 'loading' },
        name: 'x', isParty: false, isSelf: false, isSuspect: false, age: null,
    };
    const aged = (text: string, fresh = false): RowView =>
        ({ ...base, age: { text, fresh, bot: false, title: `Logged in ${text}` } });

    it('changes when only the age chip changes', () => {
        assert.notEqual(viewSignature(base), viewSignature(aged('7m')));
        assert.notEqual(viewSignature(aged('7m')), viewSignature(aged('8m')));
        assert.equal(viewSignature(aged('7m')), viewSignature(aged('7m')));
    });

    it('turns the age into an age chip, fresh or dim', () => {
        const [dim] = viewChips(aged('7m'));
        assert.deepEqual([dim!.kind, dim!.label, dim!.cls], ['age', '7m', 'tag-age']);
        assert.equal(viewChips(aged('1m', true))[0]!.cls, 'tag-age tag-age-fresh');
    });
});
