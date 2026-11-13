/**
 * Log event → table rules (ADR-0012): the table follows the lobby, the match
 * start keeps it, a tab roster is additive for missing players, prunes absent
 * ones, keeps the party and never brings back an eliminated player. The own
 * row and the party are fetched fresh at every new lobby.
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
    jobs: LookupJob[];
    settle: () => Promise<void>;
}

/** Bindings wired like main.ts, with a worker that registers the player at once. */
function rig(): Rig {
    const log = new EventEmitter();
    const registry = new PlayerRegistry();
    const party = new PartyState();
    const game = new GameState();
    const sent: string[] = [];
    const jobs: LookupJob[] = [];
    const queue = new LookupQueue(async (job: LookupJob) => {
        jobs.push(job);
        if (!job.refresh) registry.add(job.username, job.source);
    });
    bindWatcherEvents({
        logWatcher: log as unknown as LogWatcher, queue, registry, party, game,
        send: (channel, ...args) => { sent.push([channel, ...args].join(' ')); },
        isSelf: name => name.toLowerCase() === 'me',
    });
    return { log, registry, party, game, sent, jobs, settle: () => new Promise(resolve => setImmediate(resolve)) };
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

    it('a player already shown who joins the party gets the party source', async () => {
        const r = rig();
        r.log.emit('player_detected', 'Friend', 'kill_feed');
        await r.settle();
        r.jobs.length = 0;

        r.log.emit('party_joined', 'Friend');
        await r.settle();
        assert.equal(r.registry.get('friend')?.source, 'party');
        assert.deepEqual(r.jobs.map(j => `${j.username}:${j.refresh ? 'refresh' : 'lookup'}`), ['Friend:refresh']);
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

describe('watcher bindings — fresh stats for the own side', () => {
    const fresh = (r: Rig): string[] => r.jobs.filter(j => j.fresh).map(j => `${j.username}:${j.refresh ? 'refresh' : 'lookup'}`);

    it('a party member is looked up fresh, other players through the cache', async () => {
        const r = rig();
        r.log.emit('party_joined', 'Friend');
        r.log.emit('player_detected', 'Alpha', 'join');
        await r.settle();
        assert.deepEqual(fresh(r), ['Friend:lookup']);
        assert.equal(r.jobs.find(j => j.username === 'Alpha')?.fresh, undefined);
    });

    it('joining a lobby refreshes the party rows in place and looks the own row up fresh', async () => {
        const r = rig();
        r.log.emit('party_joined', 'Friend');
        await r.settle();
        r.jobs.length = 0;

        r.log.emit('players_clear');
        r.log.emit('player_detected', 'Me', 'join');
        await r.settle();
        assert.deepEqual(fresh(r), ['friend:refresh', 'Me:lookup']);
        assert.deepEqual(shown(r), ['friend', 'me']);
    });

    it('a join line repeated right away does not refresh twice', async () => {
        const r = rig();
        r.log.emit('party_joined', 'Friend');
        r.log.emit('player_detected', 'Me', 'join');
        await r.settle();
        r.jobs.length = 0;
        r.log.emit('player_detected', 'Me', 'join');
        await r.settle();
        assert.deepEqual(fresh(r), []);
    });

    it('when the user is in the party list, one refresh covers the own row', async () => {
        const r = rig();
        r.log.emit('party_members', ['Me', 'Friend']);
        await r.settle();
        r.jobs.length = 0;
        r.log.emit('players_clear');
        r.log.emit('player_detected', 'Me', 'join');
        await r.settle();
        assert.deepEqual(fresh(r).sort(), ['friend:refresh', 'me:refresh']);
    });
});

describe('watcher bindings — events in the same batch of log lines', () => {
    it('a player who joins and quits at once gets no row', async () => {
        const r = rig();
        r.log.emit('player_detected', 'Ghost', 'join');
        r.log.emit('player_quit', 'Ghost');
        await r.settle();
        assert.deepEqual(shown(r), []);
    });

    it('a lobby change right after a detection does not keep the old player', async () => {
        const r = rig();
        r.log.emit('player_detected', 'Old', 'join');
        r.log.emit('players_clear');
        r.log.emit('player_detected', 'New', 'join');
        await r.settle();
        assert.deepEqual(shown(r), ['new']);
    });

    it('a roster that does not list a player detected just before prunes them', async () => {
        const r = rig();
        r.log.emit('player_detected', 'Stray', 'chat');
        r.log.emit('players_sync', ['Alpha']);
        r.log.emit('player_detected', 'Alpha', 'tab_list');
        await r.settle();
        assert.deepEqual(shown(r), ['alpha']);
    });
});
