import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COLUMN_DEFS } from '../src/shared/columns';
import { viewSignature } from '../renderer/ts/table/rowView';
import { buildStatusCells } from '../renderer/ts/table/statusRow';
import { chipsSignature, tagsCell, viewChips, type Chip } from '../renderer/ts/table/tagsCell';
import type { RenderContext, RowView } from '../renderer/ts/table/types';

const ctx = { periodNote: '' } as RenderContext;
const col = (id: string) => COLUMN_DEFS.find(c => c.id === id)!;
const watch: Chip = { kind: 'watchlist', label: 'SNIPER', title: 'Sniper', cls: 'tag-sniper' };
const age: Chip = { kind: 'age', label: '1m', title: 'Logged in 1m ago', cls: 'tag-age' };

describe('tags cell', () => {
    const view = { isSelf: true, isSuspect: true };

    it('derives YOU and BOT? from the row view', () => {
        assert.deepEqual(viewChips(view).map(c => c.label), ['YOU', 'BOT?']);
        assert.deepEqual(viewChips({ isSelf: false, isSuspect: false }), []);
    });

    it('renders chips in the fixed order whatever order they arrive in', () => {
        const html = tagsCell([...viewChips(view), age, watch].reverse());
        const labels = [...html.matchAll(/>([A-Z?0-9 a-z]+)<\/span>/g)].map(m => m[1]);
        assert.deepEqual(labels, ['YOU', 'SNIPER', '1m', 'BOT?']);
    });

    it('puts the full list in the cell title and escapes it', () => {
        const html = tagsCell([{ ...watch, title: '<b>"x"</b>' }, ...viewChips(view)]);
        assert.match(html, /^<td class="col-tags tags-cell" title="YOU: You\nSNIPER: &lt;b&gt;/);
        assert.ok(!html.includes('<b>'));
    });

    it('renders an empty cell without a title', () => {
        assert.equal(tagsCell([]), '<td class="col-tags tags-cell"></td>');
    });

    it('signature changes when a chip is added or changes text', () => {
        assert.notEqual(chipsSignature([]), chipsSignature([watch]));
        assert.notEqual(chipsSignature([age]), chipsSignature([{ ...age, label: '7m' }]));
        assert.equal(chipsSignature([watch, age]), chipsSignature([age, watch]));
    });
});

describe('status row with the tags column', () => {
    const nicked: RowView = {
        data: { username: 'x', source: 'log', status: 'nicked' } as RowView['data'],
        name: 'x', isParty: false, isSelf: false, isSuspect: false, age: null,
    };
    const cellsBeforePill = (ids: string[]): string[] => {
        const html = buildStatusCells(nicked, ids.map(col), ctx);
        const before = html.slice(0, html.indexOf('<td colspan'));
        return [...before.matchAll(/<td class="([^"]*)"/g)].map(m => m[1]!);
    };

    it('keeps tags before the pill, so the pill start does not depend on later columns', () => {
        const wide = cellsBeforePill(['rank', 'player', 'tags', 'guild', 'fkdr', 'wlr', 'source']);
        const compact = cellsBeforePill(['rank', 'player', 'tags', 'guild', 'fkdr', 'source']);
        assert.deepEqual(wide, ['col-rank', 'player-name', 'col-tags tags-cell', 'guild-cell']);
        assert.deepEqual(compact, wide);
    });

    it('spans only the remaining stat columns with the pill', () => {
        const html = buildStatusCells(nicked, ['rank', 'player', 'tags', 'guild', 'fkdr', 'wlr'].map(col), ctx);
        assert.match(html, /<td colspan="2">/);
    });
});

describe('row signature', () => {
    const base: RowView = {
        data: { username: 'x', source: 'log', status: 'loading' },
        name: 'x', isParty: false, isSelf: false, isSuspect: false, age: null,
    };

    it('differs when the chips differ', () => {
        assert.notEqual(viewSignature(base), viewSignature({ ...base, isSuspect: true }));
        assert.notEqual(viewSignature({ ...base, isSelf: true }), viewSignature({ ...base, isSuspect: true }));
        assert.equal(viewSignature(base), viewSignature({ ...base }));
    });
});
