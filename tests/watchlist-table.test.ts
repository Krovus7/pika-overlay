import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WatchAlerts } from '../src/main/watchlist/alerts';
import { resolveAll } from '../src/main/watchlist/resolve';
import type { WatchEntry, WatchResolved } from '../src/shared/watchlist';
import { comparePlayers, type SortState } from '../renderer/ts/table/sorting';
import { tagsCell, viewChips } from '../renderer/ts/table/tagsCell';
import type { RowData } from '../renderer/ts/table/types';
import { alertText, watchChip } from '../renderer/ts/table/watchView';

const own: WatchResolved = { kind: 'sniper', note: 'camps beds', sourceLabel: 'me', imported: false };
const imported: WatchResolved = { kind: 'cheater', note: '<img src=x onerror=alert(1)>', sourceLabel: 'list <b>A</b>', imported: true };

describe('watchlist chips', () => {
    it('own entry: kind label, note as title, kind class, no outline', () => {
        const chip = watchChip(own);
        assert.deepEqual([chip.kind, chip.label, chip.title], ['watchlist', 'SNIPER', 'camps beds']);
        assert.equal(chip.cls, 'tag-watch tag-sniper');
        assert.equal(watchChip({ ...own, note: '' }).title, 'Sniper (your watchlist)');
        assert.equal(watchChip({ ...own, kind: 'other' }).label, 'OTHER');
    });

    it('imported entry: outlined and titled "From <list>: <note>"', () => {
        const chip = watchChip({ ...imported, sourceLabel: 'Friends', note: 'uses reach' });
        assert.equal(chip.cls, 'tag-watch tag-cheater tag-imported');
        assert.equal(chip.title, 'From Friends: uses reach');
        assert.equal(watchChip({ ...imported, sourceLabel: 'Friends', note: '' }).title, 'From Friends');
    });

    it('an imported note and list label stay text in the cell markup', () => {
        const html = tagsCell(viewChips({ isSelf: false, isSuspect: false, watch: imported }));
        assert.ok(!html.includes('<img'));
        assert.ok(!html.includes('<b>A'));
        assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    });

    it('sits between YOU and BOT? in the fixed order', () => {
        const chips = viewChips({ isSelf: true, isSuspect: true, watch: own });
        assert.deepEqual(chips.map(c => c.kind), ['you', 'watchlist', 'bot']);
    });

    it('alert wording', () => {
        assert.equal(alertText('sniper', 'Xx_Name'), 'SNIPER Xx_Name is in your lobby');
    });
});

describe('sorting with watchlistOnTop', () => {
    const ok = (username: string, fkdr: number): RowData =>
        ({ username, status: 'ok', fkdr, source: 'join' }) as unknown as RowData;
    const nicked = (username: string): RowData => ({ username, status: 'nicked', source: 'join' }) as RowData;
    const base: SortState = {
        col: 'fkdr', dir: -1, pinSelf: false, selfKey: '', nickedOnTop: true, partyMembers: new Set(['pal']),
        watched: new Set(['snipe']),
    };
    const order = (rows: RowData[], s: SortState) => rows.sort((a, b) => comparePlayers(a, b, s)).map(r => r.username);
    const rows = () => [ok('top', 9), nicked('ghost'), ok('snipe', 0.1), ok('pal', 1)];

    it('party, then watched, then nicked, then the rest', () => {
        assert.deepEqual(order(rows(), { ...base, watchlistOnTop: true }), ['pal', 'snipe', 'ghost', 'top']);
    });

    it('off: the watched player sorts like anyone else', () => {
        assert.deepEqual(order(rows(), { ...base, watchlistOnTop: false }), ['pal', 'ghost', 'top', 'snipe']);
    });
});

describe('WatchAlerts', () => {
    const SELF_OR_PARTY = new Set(['me', 'pal']);
    const entry = { name: 'Snipe', kind: 'sniper', note: '', addedAt: 1, source: 'me' } as WatchEntry;
    const alerts = () => new WatchAlerts(n => (n.toLowerCase() === 'snipe' ? entry : undefined));

    it('fires once per player per lobby, case-insensitive, and again after reset', () => {
        const a = alerts();
        assert.equal(a.check('Snipe', 'join'), entry);
        assert.equal(a.check('SNIPE', 'join'), undefined);
        a.reset();
        assert.equal(a.check('snipe', 'join'), entry);
    });

    it('ignores typed lookups, party sources, self and party members', () => {
        const a = new WatchAlerts(() => entry, n => SELF_OR_PARTY.has(n.toLowerCase()));
        assert.equal(a.check('Snipe', 'manual'), undefined);
        assert.equal(a.check('Snipe', 'bulk'), undefined);
        assert.equal(a.check('Snipe', 'party'), undefined);
        assert.equal(a.check('Me', 'join'), undefined);
        assert.equal(a.check('Pal', 'tab_list'), undefined);
        assert.equal(a.check('Snipe', 'tab_list'), entry);
    });

    it('ignores players that are not watched', () => {
        const a = alerts();
        assert.equal(a.check('Nobody', 'join'), undefined);
        assert.equal(a.check('Nobody', 'join'), undefined);
    });
});

describe('resolved view', () => {
    it('own entry beats imported; the newest list wins otherwise; label and flag are set', () => {
        const lists = [
            { id: 'a', label: 'Old', importedAt: 1, count: 1 },
            { id: 'b', label: 'New', importedAt: 2, count: 1 },
        ];
        const e = (name: string, source: string, kind: WatchEntry['kind']): WatchEntry => ({ name, kind, note: '', addedAt: 1, source });
        const r = resolveAll([e('X', 'a', 'sniper'), e('x', 'b', 'cheater'), e('Y', 'a', 'other'), e('y', 'me', 'sniper')], lists);
        assert.deepEqual(r['x'], { kind: 'cheater', note: '', sourceLabel: 'New', imported: true });
        assert.deepEqual(r['y'], { kind: 'sniper', note: '', sourceLabel: 'me', imported: false });
    });
});
