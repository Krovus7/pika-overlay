import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import type { BrowserWindow } from 'electron';

import { LookupService } from '../src/main/ipc/lookup';
import { buildMenuSpec, type MenuInput } from '../src/main/watchlist/menuSpec';
import { linkNickAndHide } from '../src/main/watchlist/nickLink';
import { WatchlistStore } from '../src/main/watchlist/store';
import type { ConfigStore } from '../src/main/config';
import { PlayerRegistry } from '../src/main/state';
import type { WatchResolved } from '../src/shared/watchlist';
import { empty, freshSession, mockFetch, restoreFetch, routes } from './apiMock';

const own: WatchResolved = { kind: 'sniper', note: 'camps beds', sourceLabel: 'me', imported: false };
const imported: WatchResolved = { kind: 'cheater', note: 'x', sourceLabel: 'list', imported: true };

describe('row menu content', () => {
    const calls: string[] = [];
    const input = (over: Partial<MenuInput>): MenuInput => ({
        name: 'Nick', nicked: false, resolved: undefined, partyMembers: [],
        mark: (k, n) => calls.push(`mark:${k}:${n}`), unmark: () => calls.push('unmark'), editNote: () => calls.push('editNote'), link: f => calls.push(`link:${f}`),
        ...over,
    });
    const labels = (items: ReturnType<typeof buildMenuSpec>) => items.map(i => i.label ?? '---');

    beforeEach(() => { calls.length = 0; });

    it('plain row: three marks and Edit note in Settings', () => {
        assert.deepEqual(labels(buildMenuSpec(input({}))), ['Mark as sniper', 'Mark as cheater', 'Mark as other', '---', 'Edit note in Settings']);
        buildMenuSpec(input({}))[4]!.click!();
        assert.deepEqual(calls, ['editNote']);
    });

    it('own entry: remove item, and changing the kind keeps the note', () => {
        const items = buildMenuSpec(input({ resolved: own }));
        assert.deepEqual(labels(items).slice(3), ['---', 'Edit note in Settings', 'Remove from watchlist']);
        items[1]!.click!();
        items[5]!.click!();
        assert.deepEqual(calls, ['mark:cheater:camps beds', 'unmark']);
    });

    it('escapes & in imported labels and party names so the menu shows them literally', () => {
        const items = buildMenuSpec(input({ resolved: { ...imported, sourceLabel: 'A&B' }, nicked: true, partyMembers: ['x&y'] }));
        assert.ok(labels(items).includes('From list: A&&B'));
        assert.deepEqual(labels(items[items.length - 1]!.submenu!), ['x&&y', 'Someone else']);
    });

    it('imported entry: informative disabled line, no remove, note not copied', () => {
        const items = buildMenuSpec(input({ resolved: { ...imported, sourceLabel: 'Friends' } }));
        assert.deepEqual(labels(items).slice(3), ['---', 'Edit note in Settings', 'From list: Friends']);
        assert.equal(items[5]!.enabled, false);
        items[0]!.click!();
        assert.deepEqual(calls, ['mark:sniper:']);
    });

    it('nicked row: disabled first line and a teammate submenu with the party plus "Someone else"', () => {
        const items = buildMenuSpec(input({ nicked: true, partyMembers: ['pal', 'bud'] }));
        assert.match(items[0]!.label!, /^This is a nick/);
        assert.equal(items[0]!.enabled, false);
        const sub = items[items.length - 1]!;
        assert.equal(sub.label, 'This is my teammate');
        assert.deepEqual(labels(sub.submenu!), ['pal', 'bud', 'Someone else']);
        sub.submenu![0]!.click!();
        sub.submenu![2]!.click!();
        assert.deepEqual(calls, ['link:pal', 'link:null']);
    });
});

describe('nick links in the table', () => {
    let dir: string;
    let store: WatchlistStore;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-nicklink-'));
        store = new WatchlistStore(path.join(dir, 'watchlist.json'));
        freshSession();
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
    after(() => restoreFetch());

    it('linking removes the shown row, and an invalid link changes nothing', () => {
        const registry = new PlayerRegistry();
        registry.add('Sneaky', 'join');
        const hidden: string[] = [];
        assert.equal(linkNickAndHide(store, registry, k => hidden.push(k), 'bad name!', null), false);
        assert.equal(registry.has('Sneaky'), true);
        assert.equal(linkNickAndHide(store, registry, k => hidden.push(k), 'Sneaky', 'Pal'), true);
        assert.deepEqual([registry.snapshot(), hidden], [[], ['sneaky']]);
    });

    it('later detections of a linked nick are ignored; a typed lookup still works', async () => {
        mockFetch(routes(() => empty(404), () => empty(400)));
        store.linkNick('Sneaky', null);
        const entered: string[] = [];
        const win = { webContents: { send: () => undefined } } as unknown as BrowserWindow;
        const service = new LookupService({
            store: { get: () => 'total' } as unknown as ConfigStore,
            registry: new PlayerRegistry(),
            getOverlayWin: () => win,
            isLinkedNick: n => store.isLinkedNick(n),
            onPlayerEnter: n => entered.push(n),
        });
        assert.equal(await service.lookup('sneaky', 'tab_list', null, null), null);
        assert.deepEqual(entered, []);
        await service.lookup('Sneaky', 'manual', null, null);
        await service.lookup('Other', 'join', null, null);
        assert.deepEqual(entered, ['Sneaky', 'Other']);
    });
});
