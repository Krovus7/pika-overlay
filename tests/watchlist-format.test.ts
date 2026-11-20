import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { esc } from '../renderer/ts/table/format';
import { FormatError, defaultFileName, exportJson, exportText, parseAny, parseJson, parseText } from '../src/main/watchlist/format';
import { ImportPreviews, PREVIEW_TTL_MS } from '../src/main/watchlist/importPreview';
import { cleanNote, dedupeByName, isValidName, normalizeEntry } from '../src/main/watchlist/validate';

const NOW = 1_700_000_000_000;
const doc = (over: Record<string, unknown> = {}) => JSON.stringify({ format: 'pika-overlay-watchlist', version: 1, exportedAt: NOW, entries: [], ...over });

describe('watchlist validate', () => {
    it('accepts 3-16 character names of letters, digits and underscore only', () => {
        for (const ok of ['abc', 'Steve_01', 'a'.repeat(16)]) assert.equal(isValidName(ok), true, ok);
        for (const bad of ['ab', 'a'.repeat(17), 'bad name', 'bad-name', '<b>', '', 5, null]) assert.equal(isValidName(bad), false, String(bad));
    });

    it('cleans notes: trims, strips control characters, cuts at 120', () => {
        assert.equal(cleanNote('  hi\u0000 there\n\u007f '), 'hi there');
        assert.equal(cleanNote('x'.repeat(200)).length, 120);
        assert.equal(cleanNote(42), '');
    });

    it('turns an unknown kind into other and rejects a bad name', () => {
        assert.equal(normalizeEntry({ name: 'Steve', kind: 'wizard', note: 'n' }, NOW)?.kind, 'other');
        assert.equal(normalizeEntry({ name: 'x', kind: 'sniper' }, NOW), null);
        assert.equal(normalizeEntry({ name: 'Steve', addedAt: 'x' }, NOW)?.addedAt, NOW);
    });

    it('collapses duplicates case-insensitively, first wins', () => {
        assert.deepEqual(dedupeByName([{ name: 'Abc' }, { name: 'abc' }, { name: 'Def' }]).map(e => e.name), ['Abc', 'Def']);
    });

    it('keeps HTML in a note as text after esc()', () => {
        const html = esc(cleanNote('<img src=x onerror=alert(1)>'));
        assert.ok(!html.includes('<'));
        assert.ok(html.includes('&lt;img'));
    });
});

describe('watchlist formats', () => {
    it('round-trips the JSON file', () => {
        const entries = [{ name: 'Steve', kind: 'sniper' as const, note: 'camps', addedAt: 5 }];
        assert.deepEqual(parseJson(exportJson(entries, NOW), NOW), { entries, invalid: 0 });
    });

    it('rejects a wrong format, version, broken JSON and missing entries with a clear error', () => {
        assert.throws(() => parseJson(doc({ format: 'other' }), NOW), FormatError);
        assert.throws(() => parseJson(doc({ version: 2 }), NOW), /version/);
        assert.throws(() => parseJson('{nope', NOW), /not valid JSON/);
        assert.throws(() => parseJson(doc({ entries: 'x' }), NOW), /entries/);
        assert.throws(() => parseJson('null', NOW), FormatError);
    });

    it('counts invalid records and drops duplicates', () => {
        const r = parseJson(doc({ entries: [{ name: 'Steve' }, { name: 'steve' }, { name: 'no' }, 7] }), NOW);
        assert.deepEqual(r.entries.map(e => e.name), ['Steve']);
        assert.equal(r.invalid, 2);
    });

    it('enforces the 5000 entry and 1 MB caps', () => {
        const many = Array.from({ length: 5001 }, (_, i) => ({ name: `p${String(i).padStart(5, '0')}` }));
        assert.throws(() => parseJson(doc({ entries: many }), NOW), /Too many/);
        assert.throws(() => parseAny('a'.repeat(1024 * 1024 + 1), 'other', NOW), /1 MB/);
    });

    it('parses text lines with comments, bare names, kinds and notes with commas', () => {
        const text = ['# my list', 'Steve', 'Alex, cheater', 'Bob_x, sniper, snipes, a lot # trailing', 'bad name', '', 'Zed, banana'].join('\r\n');
        const r = parseText(text, 'sniper', NOW);
        assert.deepEqual(r.entries.map(e => [e.name, e.kind, e.note]), [
            ['Steve', 'sniper', ''], ['Alex', 'cheater', ''], ['Bob_x', 'sniper', 'snipes, a lot'], ['Zed', 'other', ''],
        ]);
        assert.equal(r.invalid, 1);
    });

    it('detects JSON by the leading brace and exports text without # in notes', () => {
        assert.equal(parseAny(doc({ entries: [{ name: 'Steve' }] }), 'other', NOW).entries.length, 1);
        assert.equal(parseAny('Steve\nAlex', 'cheater', NOW).entries[1]?.kind, 'cheater');
        const e = { name: 'Steve', kind: 'other' as const, note: '#1 camper', addedAt: 1 };
        assert.equal(exportText([e, { ...e, name: 'Alex', note: '' }]), 'Steve, other, 1 camper\nAlex, other');
    });

    it('accepts a UTF-8 BOM in JSON and text files', () => {
        assert.equal(parseAny('\ufeff' + doc({ entries: [{ name: 'Steve' }] }), 'other', NOW).entries.length, 1);
        assert.deepEqual(parseAny('\ufeffSteve\nAlex', 'other', NOW).entries.map(e => e.name), ['Steve', 'Alex']);
    });

    it('names the export file by date', () => {
        assert.equal(defaultFileName(new Date('2026-11-20T10:00:00Z')), 'pika-watchlist-2026-11-20.json');
    });
});

describe('import previews', () => {
    it('are single use and expire after five minutes', () => {
        let t = NOW;
        const previews = new ImportPreviews(() => t);
        const p = previews.create('list', [], 2, 3, true);
        assert.deepEqual([p.count, p.conflicts, p.invalid, p.label, p.replacesExisting], [0, 2, 3, 'list', true]);
        assert.equal(previews.take(p.token)?.label, 'list');
        assert.equal(previews.take(p.token), null);
        const q = previews.create('l2', [], 0, 0, false);
        t += PREVIEW_TTL_MS;
        assert.equal(previews.take(q.token), null);
        assert.equal(previews.take('unknown'), null);
    });
});
