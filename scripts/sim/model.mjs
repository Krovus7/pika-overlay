/**
 * Model of the overlay table: the real renderer/ts/core/playerStore.ts (bundled
 * with esbuild), driven with the same event mapping as renderer/ts/overlay.ts
 * bindIpc. Note: game:start does NOT touch the table (ADR-0012).
 */

import { build } from 'esbuild';
import * as path from 'node:path';

export async function bundleStore(root, outFile) {
    await build({
        entryPoints: [path.join(root, 'renderer', 'ts', 'core', 'playerStore.ts')],
        bundle: true, format: 'esm', platform: 'node', outfile: outFile, logLevel: 'silent',
    });
}

export class TableModel {
    constructor(store, { ignoreRemove = false } = {}) {
        this.store = store;
        this.ignoreRemove = ignoreRemove;
        this.s = { players: new Map(), party: new Set() };
        this.hooks = {};
        this.sentCounts = {};
    }

    get players() { return this.s.players; }
    get size() { return this.s.players.size; }
    has(k) { return this.s.players.has(k); }

    apply(channel, args) {
        const { store, s, hooks } = this;
        this.sentCounts[channel] = (this.sentCounts[channel] ?? 0) + 1;
        switch (channel) {
            case 'player:loading': {
                const [{ username, source }] = args;
                const key = username.toLowerCase();
                const prev = s.players.get(key);
                hooks.loading?.(key, prev, source);
                store.addLoading(s, username, source);
                break;
            }
            case 'player:stats': {
                const [data] = args;
                const key = data.username.toLowerCase();
                const prev = s.players.get(key);
                const applied = store.applyResult(s, data);
                hooks.stats?.(key, data, applied, prev);
                break;
            }
            case 'player:remove': {
                if (this.ignoreRemove) break;
                const key = String(args[0]).toLowerCase();
                if (store.removeRow(s, args[0])) hooks.removed?.([key]);
                break;
            }
            case 'players:clear': {
                const before = [...s.players.keys()];
                store.clearTable(s, true);
                hooks.removed?.(before.filter(k => !s.players.has(k)));
                break;
            }
            case 'party:update':
                store.setParty(s, args[0]);
                break;
            default: // game:start, game:end, api:health ... do not touch the table
        }
    }
}
