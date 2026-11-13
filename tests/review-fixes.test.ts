/**
 * Regressions found by the v5 review: stale-key 401, re-arming a key after a
 * passing test, body timeout, manual clear vs party/backlog, key redaction in
 * debug log lines, atomic config write.
 */

import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { getPlayerStats } from '../src/main/api/apiClient';
import { confirmApiKey, setApiKey } from '../src/main/api/apiSession';
import { fetchWithTimeout } from '../src/main/api/fetch';
import { getHealth } from '../src/main/api/health';
import { ConfigStore } from '../src/main/config';
import { clearPlayers } from '../src/main/ipc/clearPlayers';
import { redactSecrets } from '../src/main/log/redact';
import { LookupQueue, PartyState, PlayerRegistry, type LookupJob } from '../src/main/state';
import { IPC_EVENTS } from '../src/shared/ipc-contract';
import { FAST_RETRY, LEADERBOARD_OK, empty, freshSession, json, mockFetch, profileBody, restoreFetch, routes } from './apiMock';

after(() => restoreFetch());

describe('API key session', () => {
    beforeEach(() => freshSession('old-key'));

    it('a 401 answering a request sent with a replaced key does not flag the new key', async () => {
        let answer!: (res: Response) => void;
        const held = new Promise<Response>(resolve => { answer = resolve; });
        mockFetch(() => held.then(res => res.clone()));

        const pending = getPlayerStats('Someone', 'total', 'ALL_MODES', FAST_RETRY);
        await new Promise(resolve => setImmediate(resolve)); // requests are on the wire with old-key
        setApiKey('new-key');
        answer(json({ error: 'invalid api key' }, 401));
        await pending;

        assert.deepEqual(getHealth(), { kind: 'ok' });
    });

    it('a 401 for the key in use flags it, and a passing test of that key re-arms it', async () => {
        mockFetch(() => json({ error: 'invalid api key' }, 401));
        const result = await getPlayerStats('Someone', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(result?.status, 'auth');
        assert.deepEqual(getHealth(), { kind: 'key_invalid' });

        assert.equal(confirmApiKey('another-key'), false, 'a different key must not re-arm the session');
        assert.deepEqual(getHealth(), { kind: 'key_invalid' });
        assert.equal(confirmApiKey(' old-key '), true);
        assert.deepEqual(getHealth(), { kind: 'ok' });
        assert.equal(confirmApiKey('old-key'), false, 'nothing to re-arm when health is ok');

        mockFetch(routes(json(profileBody('Someone')), () => json(LEADERBOARD_OK)));
        assert.equal((await getPlayerStats('Someone', 'total', 'ALL_MODES', FAST_RETRY))?.status, 'ok');
    });
});

describe('fetchWithTimeout', () => {
    it('aborts when the body stalls after the headers arrived', async () => {
        globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
            const stalled = new ReadableStream<Uint8Array>({
                start(controller) {
                    init?.signal?.addEventListener('abort', () => {
                        controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
                    });
                },
            });
            return new Response(stalled, { status: 200 });
        }) as typeof fetch;

        await assert.rejects(fetchWithTimeout('https://example.invalid/x', 30, 'k'), { name: 'AbortError' });
    });

    it('hands back status, headers and body; empty bodies (204) survive', async () => {
        mockFetch(url => (url.endsWith('/empty') ? empty(204) : json({ a: 1 }, 200, { 'x-ratelimit-remaining': '7' })));
        const full = await fetchWithTimeout('https://example.invalid/full', 500, 'k');
        assert.equal(full.status, 200);
        assert.equal(full.headers.get('x-ratelimit-remaining'), '7');
        assert.deepEqual(await full.json(), { a: 1 });
        const none = await fetchWithTimeout('https://example.invalid/empty', 500, 'k');
        assert.equal(none.status, 204);
        assert.equal(await none.text(), '');
    });
});

describe('clearPlayers (button and hotkey)', () => {
    it('keeps party members, drops the backlog of removed players, tells the overlay', async () => {
        const registry = new PlayerRegistry();
        const party = new PartyState();
        const sent: Array<[string, ...unknown[]]> = [];
        const started: string[] = [];
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const queue = new LookupQueue(async (job: LookupJob) => { started.push(job.username); await gate; }, 1);

        party.add('Friend');
        registry.add('Friend', 'party');
        registry.add('Enemy', 'tab_list');
        queue.enqueue({ username: 'Busy', source: 'tab_list', interval: null, mode: null });
        queue.enqueue({ username: 'Enemy2', source: 'tab_list', interval: null, mode: null });
        queue.enqueue({ username: 'Friend', source: 'party', interval: null, mode: null });
        await new Promise(resolve => setImmediate(resolve));

        clearPlayers({ registry, party, queue, send: (channel, ...args) => { sent.push([channel, ...args]); } });

        assert.deepEqual(registry.snapshot(), ['friend']);
        assert.equal(queue.pendingCount, 1, 'only the party lookup stays queued');
        assert.deepEqual(sent, [[IPC_EVENTS.PLAYER_REMOVE, 'enemy'], [IPC_EVENTS.PLAYERS_CLEAR]]);

        release();
        await new Promise(resolve => setTimeout(resolve, 10));
        assert.deepEqual(started, ['Busy', 'Friend']);
    });
});

describe('redactSecrets', () => {
    it('hides a Pika API key wherever it appears in a log line', () => {
        const line = '[12:00:01] [Client thread/INFO]: [CHAT] Your API key: pika_Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56 (keep it private)';
        const out = redactSecrets(line);
        assert.ok(!out.includes('Ab12Cd34'));
        assert.ok(out.includes('pika_<hidden>'));
        assert.ok(out.endsWith('(keep it private)'));
    });

    it('leaves ordinary lines alone', () => {
        const line = '[CHAT] pika_fan joined the game (pika-network.net)';
        assert.equal(redactSecrets(line), line);
    });
});

describe('ConfigStore.persist', () => {
    it('replaces the file through a temp file and leaves none behind', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-cfg-'));
        try {
            const store = new ConfigStore(ConfigStore.userDataPath(dir));
            store.set('apiKey', 'abc');
            store.set('theme', 'light');
            const files = fs.readdirSync(path.dirname(ConfigStore.userDataPath(dir)));
            assert.ok(!files.some(f => f.endsWith('.tmp')), `leftover temp file in ${files.join(', ')}`);
            const reread = new ConfigStore(ConfigStore.userDataPath(dir));
            assert.equal(reread.get('apiKey'), 'abc');
            assert.equal(reread.get('theme'), 'light');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
