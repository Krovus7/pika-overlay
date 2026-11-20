import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { WatchlistStore } from '../src/main/watchlist/store';
import type { ParsedEntry } from '../src/main/watchlist/validate';

let dir: string;
let file: string;
let clock: number;
const open = () => new WatchlistStore(file, () => ++clock);
const parsed = (name: string, kind: ParsedEntry['kind'] = 'other'): ParsedEntry => ({ name, kind, note: '', addedAt: 1 });

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-watchlist-'));
    file = path.join(dir, 'watchlist.json');
    clock = 1000;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('watchlist store', () => {
    it('adds, changes (keeping addedAt) and removes an own entry, looked up by lowercase name', () => {
        const s = open();
        assert.equal(s.setOwn('Steve', { kind: 'sniper', note: 'a' }), true);
        const first = s.lookup('STEVE');
        assert.equal(first?.kind, 'sniper');
        s.setOwn('Steve', { kind: 'cheater', note: 'b' });
        assert.equal(s.lookup('steve')?.addedAt, first?.addedAt);
        assert.equal(s.lookup('steve')?.note, 'b');
        s.setOwn('steve', null);
        assert.equal(s.lookup('Steve'), undefined);
    });

    it('refuses an invalid name', () => {
        assert.equal(open().setOwn('x', { kind: 'other', note: '' }), false);
    });

    it('the own entry beats imports; otherwise the most recent import wins', () => {
        const s = open();
        s.applyImport('old', [parsed('Steve', 'sniper')]);
        s.applyImport('new', [parsed('steve', 'cheater')]);
        assert.equal(s.lookup('Steve')?.kind, 'cheater');
        s.setOwn('Steve', { kind: 'other', note: 'mine' });
        assert.equal(s.lookup('Steve')?.note, 'mine');
        assert.equal(s.countOwnConflicts([parsed('STEVE'), parsed('Alex')]), 1);
    });

    it('removing a list removes only its entries', () => {
        const s = open();
        s.setOwn('Steve', { kind: 'other', note: '' });
        const a = s.applyImport('a', [parsed('Alex')]);
        s.applyImport('b', [parsed('Bobby')]);
        assert.equal(s.removeList(a?.id ?? ''), true);
        assert.deepEqual(s.snapshot().entries.map(e => e.name).sort(), ['Bobby', 'Steve']);
        assert.equal(s.removeList('missing'), false);
    });

    it('re-importing the same label replaces that list', () => {
        const s = open();
        s.applyImport('list.json', [parsed('Alex'), parsed('Bobby')]);
        const again = s.applyImport('list.json', [parsed('Carl')]);
        assert.equal(s.snapshot().lists.length, 1);
        assert.deepEqual(s.snapshot().entries.map(e => [e.name, e.source]), [['Carl', again?.id]]);
    });

    it('exports own entries only unless imported ones are included', () => {
        const s = open();
        s.setOwn('Steve', { kind: 'other', note: '' });
        s.applyImport('a', [parsed('Alex')]);
        assert.equal(s.entriesForExport(false).length, 1);
        assert.equal(s.entriesForExport(true).length, 2);
    });

    it('persists atomically (no temp file left) and reloads', () => {
        const s = open();
        s.setOwn('Steve', { kind: 'sniper', note: 'n' });
        s.applyImport('a', [parsed('Alex')]);
        s.linkNick('Nicky', 'Friend');
        assert.deepEqual(fs.readdirSync(dir), ['watchlist.json']);
        const back = open();
        assert.deepEqual(back.snapshot(), s.snapshot());
        assert.equal(back.snapshot().lists[0]?.count, 1);
    });

    it('moves a corrupt file aside and starts empty', () => {
        fs.writeFileSync(file, '{broken');
        const warn = console.warn;
        console.warn = () => {};
        try {
            assert.deepEqual(open().snapshot(), { entries: [], lists: [], nickLinks: [] });
        } finally {
            console.warn = warn;
        }
        const names = fs.readdirSync(dir);
        assert.equal(names.length, 1);
        assert.match(names[0] ?? '', /^watchlist\.json\.bad-\d+$/);
        assert.equal(fs.readFileSync(path.join(dir, names[0] ?? ''), 'utf8'), '{broken');
    });

    it('loads an older file without nickLinks and drops entries of unknown lists', () => {
        const entry = { name: 'Steve', kind: 'sniper', note: '', addedAt: 1 };
        const ghost = { ...entry, name: 'Ghost', source: 'gone' };
        fs.writeFileSync(file, JSON.stringify({ version: 1, lists: [], entries: [{ ...entry, source: 'me' }, ghost] }));
        const s = open();
        assert.deepEqual(s.snapshot().entries.map(e => e.name), ['Steve']);
        assert.deepEqual(s.snapshot().nickLinks, []);
    });
});

describe('failed writes', () => {
    // The parent of the list file is a regular file, so every save fails
    const failing = () => {
        const blocker = path.join(dir, 'blocker');
        fs.writeFileSync(blocker, 'x');
        return new WatchlistStore(path.join(blocker, 'watchlist.json'), () => ++clock);
    };
    const quiet = <T>(run: () => T): T => {
        const err = console.error;
        console.error = () => {};
        try { return run(); } finally { console.error = err; }
    };

    it('leave memory unchanged and report failure', () => {
        const s = failing();
        quiet(() => {
            assert.equal(s.setOwn('Steve', { kind: 'other', note: '' }), false);
            assert.equal(s.applyImport('a', [parsed('Alex')]), null);
            assert.equal(s.linkNick('Nicky', null), false);
        });
        assert.deepEqual(s.snapshot(), { entries: [], lists: [], nickLinks: [] });
    });

    it('keep an existing list and entries when a re-import cannot be saved', () => {
        const s = open();
        s.applyImport('a', [parsed('Alex')]);
        s.setOwn('Steve', { kind: 'other', note: '' });
        fs.rmSync(file);
        fs.mkdirSync(file);
        const before = s.snapshot();
        quiet(() => assert.equal(s.applyImport('a', [parsed('Carl')]), null));
        assert.deepEqual(s.snapshot(), before);
    });
});

describe('import labels', () => {
    it('reports whether a list with the label exists', () => {
        const s = open();
        assert.equal(s.hasListLabel('a'), false);
        s.applyImport('a', [parsed('Alex')]);
        assert.equal(s.hasListLabel('a'), true);
    });
});

describe('nick links', () => {
    it('adds, replaces, looks up case-insensitively and removes', () => {
        const s = open();
        assert.equal(s.linkNick('Nicky', 'Friend'), true);
        assert.equal(s.linkNick('nicky', null), true);
        assert.deepEqual(s.snapshot().nickLinks.map(l => [l.nick, l.friend]), [['nicky', '']]);
        assert.equal(s.isLinkedNick('NICKY'), true);
        assert.equal(s.unlinkNick('Nicky'), true);
        assert.equal(s.isLinkedNick('nicky'), false);
        assert.equal(s.unlinkNick('nicky'), false);
    });

    it('validates both names', () => {
        const s = open();
        assert.equal(s.linkNick('x', null), false);
        assert.equal(s.linkNick('Nicky', 'bad name'), false);
        assert.equal(s.snapshot().nickLinks.length, 0);
    });
});
