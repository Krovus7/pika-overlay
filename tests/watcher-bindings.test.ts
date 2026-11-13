/**
 * Log event → table rules (ADR-0012): the table follows the lobby, the match
 * start keeps it, a tab roster is additive for missing players, prunes absent
 * ones, keeps the party and never brings back an eliminated player.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import type { LogWatcher } from '../src/main/log/logWatcher';
import { GameState, LookupQueue, PartyState, PlayerRegistry, type LookupJob } from '../src/main/state';
import { bindWatcherEvents } from '../src/main/watcherBindings';
import { IPC_EVENTS } from '../src/shared/ipc-contract';

interface Rig {
    log: EventEmitter;
    registry: PlayerRegistry;
    party: PartyState;
    game: GameState;
    sent: string[];
    settle: () => Promise<void>;
}

/** Bindings wired like main.ts, with a worker that registers the player at once. */
function rig(): Rig {
    const log = new EventEmitter();
    const registry = new PlayerRegistry();
    const party = new PartyState();
    const game = new GameState();
    const sent: string[] = [];
    const queue = new LookupQueue(async (job: LookupJob) => { registry.add(job.username, job.source); });
    bindWatcherEvents({
        logWatcher: log as unknown as LogWatcher, queue, registry, party, game,
        send: (channel, ...args) => { sent.push([channel, ...args].join(' ')); },
    });
    return { log, registry, party, game, sent, settle: () => new Promise(resolve => setImmediate(resolve)) };
}

const shown = (r: Rig): string[] => r.registry.snapshot().sort();

describe('watcher bindings — match lifecycle', () => {
    let r: Rig;
    beforeEach(async () => {
        r = rig();
        for (const name of ['Alpha', 'Bravo', 'Charlie']) r.log.emit('player_detected', name, 'join');
        await r.settle();
    });

    it('match start keeps the lobby roster and only flips the status', () => {
        r.log.emit('game_start');
        assert.deepEqual(shown(r), ['alpha', 'bravo', 'charlie']);
        assert.equal(r.game.isInGame(), true);
        assert.ok(r.sent.includes(IPC_EVENTS.GAME_START));
        assert.ok(!r.sent.some(s => s.startsWith(IPC_EVENTS.PLAYER_REMOVE)));
    });

    it('a roster during the match adds missing players but not eliminated ones', async () => {
        r.log.emit('game_start');
        r.log.emit('player_quit', 'Bravo'); // final kill
        assert.deepEqual(shown(r), ['alpha', 'charlie']);

        const roster = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
        r.log.emit('players_sync', roster);
        for (const name of roster) r.log.emit('player_detected', name, 'tab_list');
        await r.settle();
        assert.deepEqual(shown(r), ['alpha', 'charlie', 'delta'], 'Bravo is a spectator, Delta was missing');
    });

    it('a pre-game quit is not an elimination: the player can come back through a roster', async () => {
        r.log.emit('player_quit', 'Bravo');
        r.log.emit('players_sync', ['Alpha', 'Bravo', 'Charlie']);
        r.log.emit('player_detected', 'Bravo', 'tab_list');
        await r.settle();
        assert.deepEqual(shown(r), ['alpha', 'bravo', 'charlie']);
    });

    it('lobby change empties the table and forgets the match', async () => {
        r.log.emit('game_start');
        r.log.emit('player_quit', 'Bravo');
        r.log.emit('players_clear');
        assert.deepEqual(shown(r), []);
        assert.equal(r.game.isInGame(), false);
        r.log.emit('player_detected', 'Bravo', 'tab_list');
        await r.settle();
        assert.deepEqual(shown(r), ['bravo'], 'eliminations of the previous match no longer apply');
    });
});

describe('watcher bindings — party pinned', () => {
    it('a roster that does not list a party member keeps their row', async () => {
        const r = rig();
        r.log.emit('party_joined', 'Friend');
        r.log.emit('player_detected', 'Alpha', 'join');
        r.log.emit('player_detected', 'Bravo', 'join');
        await r.settle();

        r.log.emit('players_sync', ['Alpha', 'Zulu', 'Yankee']);
        assert.deepEqual(shown(r), ['alpha', 'friend'], 'Bravo pruned, Friend pinned');
    });

    it('match start, lobby change and a final kill keep party members', async () => {
        const r = rig();
        r.log.emit('party_joined', 'Friend');
        r.log.emit('player_detected', 'Alpha', 'join');
        await r.settle();
        r.log.emit('game_start');
        r.log.emit('player_quit', 'Friend');
        assert.deepEqual(shown(r), ['alpha', 'friend']);
        r.log.emit('players_clear');
        assert.deepEqual(shown(r), ['friend']);
    });

    it('leaving the party removes the row', async () => {
        const r = rig();
        r.log.emit('party_joined', 'Friend');
        await r.settle();
        r.log.emit('party_left', 'Friend');
        assert.deepEqual(shown(r), []);
        assert.ok(r.sent.includes(`${IPC_EVENTS.PLAYER_REMOVE} friend`));
    });
});
