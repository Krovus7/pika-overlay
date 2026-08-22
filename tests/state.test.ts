/**
 * State module tests — playerRegistry, partyState, gameState, lookupQueue.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameState, LookupQueue, PartyState, PlayerRegistry } from '../src/main/state';

describe('PlayerRegistry', () => {
    it('keys are lowercased; add is idempotent', () => {
        const reg = new PlayerRegistry();
        assert.equal(reg.add('AcquaPanna'), true);
        assert.equal(reg.add('acquapanna'), false, 'second add with different case must not duplicate');
        assert.ok(reg.has('ACQUAPANNA'));
        assert.equal(reg.size, 1);
    });

    it('delete removes the player', () => {
        const reg = new PlayerRegistry();
        reg.add('PlayerA');
        assert.equal(reg.delete('playera'), true);
        assert.equal(reg.has('PlayerA'), false);
        assert.equal(reg.delete('nobody'), false);
    });

    it('clearExcept removes only keys not in keep set', () => {
        const reg = new PlayerRegistry();
        reg.add('A');
        reg.add('B');
        reg.add('C');
        const removed = reg.clearExcept(new Set(['a', 'c']));
        assert.deepEqual(removed.sort(), ['b']);
        assert.deepEqual(reg.snapshot().sort(), ['a', 'c']);
    });

    it('clear returns removed keys and empties the registry', () => {
        const reg = new PlayerRegistry();
        reg.add('A');
        reg.add('B');
        assert.deepEqual(reg.clear().sort(), ['a', 'b']);
        assert.equal(reg.size, 0);
    });
});

describe('PartyState', () => {
    it('add/delete/has with case normalization', () => {
        const party = new PartyState();
        party.add('DashKiller');
        assert.ok(party.has('dashkiller'));
        party.add('clockburg');
        assert.deepEqual(party.snapshot(), ['dashkiller', 'clockburg']);
        assert.equal(party.delete('DASHKILLER'), true);
        assert.equal(party.size, 1);
    });

    it('clear empties the party', () => {
        const party = new PartyState();
        party.add('A');
        party.clear();
        assert.equal(party.size, 0);
        assert.deepEqual(party.snapshot(), []);
    });
});

describe('GameState', () => {
    it('tracks in-game flag', () => {
        const gs = new GameState();
        assert.equal(gs.isInGame(), false);
        gs.setInGame(true);
        assert.equal(gs.isInGame(), true);
        gs.setInGame(false);
        assert.equal(gs.isInGame(), false);
    });
});

describe('LookupQueue', () => {
    async function waitFor(cond: () => boolean): Promise<void> {
        for (let i = 0; i < 200 && !cond(); i++) {
            await new Promise(r => setTimeout(r, 5));
        }
        assert.ok(cond(), 'condition not met within timeout');
    }

    it('never exceeds concurrency and processes in FIFO order', async () => {
        let concurrent = 0;
        let maxConcurrent = 0;
        const order: string[] = [];
        const release: Array<() => void> = [];

        const queue = new LookupQueue(async job => {
            concurrent++;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            await new Promise<void>(resolve => release.push(resolve));
            order.push(job.username);
            concurrent--;
        }, 2);

        queue.enqueue({ username: 'A', source: 'join', interval: null, mode: null });
        queue.enqueue({ username: 'B', source: 'join', interval: null, mode: null });
        queue.enqueue({ username: 'C', source: 'join', interval: null, mode: null });
        queue.enqueue({ username: 'D', source: 'join', interval: null, mode: null });

        await waitFor(() => queue.activeCount === 2 && queue.pendingCount === 2);
        while (order.length < 4) {
            release.splice(0).forEach(r => r());
            await new Promise(r => setTimeout(r, 10));
        }
        await waitFor(() => queue.pendingCount === 0 && order.length === 4);

        assert.equal(maxConcurrent, 2, 'concurrency must never exceed the limit');
        assert.deepEqual(order, ['A', 'B', 'C', 'D'], 'must process in FIFO order');
        assert.equal(queue.activeCount, 0);
        assert.equal(queue.pendingCount, 0);
    });

    it('worker errors are swallowed and the queue keeps draining', async () => {
        let calls = 0;
        const queue = new LookupQueue(async job => {
            calls++;
            if (job.username === 'A') throw new Error('boom');
        }, 2);

        queue.enqueue({ username: 'A', source: 'x', interval: null, mode: null });
        queue.enqueue({ username: 'B', source: 'x', interval: null, mode: null });
        await new Promise(r => setTimeout(r, 20));

        assert.equal(calls, 2, 'both jobs must be attempted despite the error');
        assert.equal(queue.activeCount, 0);
        assert.equal(queue.pendingCount, 0);
    });
});
