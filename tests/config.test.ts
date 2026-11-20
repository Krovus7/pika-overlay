/**
 * Config store tests — schema normalization, v3 legacy migration (flat
 * thresholds + fkdrThresholds), validation clamps, backup, corrupt file.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ConfigStore, defaultConfig, normalizeConfig } from '../src/main/config';

describe('normalizeConfig — defaults', () => {
    it('returns full defaults for empty input', () => {
        const cfg = normalizeConfig(null);
        assert.equal(cfg.statsInterval, 'total');
        assert.equal(cfg.statsMode, 'ALL_MODES');
        assert.equal(cfg.opacity, 0.92);
        assert.equal(cfg.overlayMode, 'detailed');
        assert.deepEqual(cfg.ratioThresholds.fkdr, { hacker: 20.0, godlike: 10.0, good: 3.0, medium: 1.0 });
        assert.equal(cfg.columnOrder[0], 'rank');
        assert.equal(cfg.columnEnabled.player, true);
    });

    it('clamps opacity into [0.05, 1]', () => {
        assert.equal(normalizeConfig({ opacity: 0 }).opacity, 0.05);
        assert.equal(normalizeConfig({ opacity: 99 }).opacity, 1);
        assert.equal(normalizeConfig({ opacity: 'x' }).opacity, 0.92);
    });

    it('invalid interval/mode fall back to defaults', () => {
        assert.equal(normalizeConfig({ statsInterval: 'hourly' }).statsInterval, 'total');
        assert.equal(normalizeConfig({ statsMode: 'SQUADS' }).statsMode, 'ALL_MODES');
    });

    it('columnOrder merges known ids and appends missing ones', () => {
        const cfg = normalizeConfig({ columnOrder: ['fkdr', 'player'] });
        assert.deepEqual(cfg.columnOrder, ['fkdr', 'player', 'tags', ...defaultConfig().columnOrder.filter(id => !['fkdr', 'player', 'tags'].includes(id))]);
    });

    it('an old columnOrder without tags gets it right after player', () => {
        const old = ['rank', 'player', 'guild', 'fkdr', 'finals', 'kdr', 'wlr', 'wins', 'beds', 'winstreak', 'kills', 'deaths', 'bowkills', 'source'];
        const cfg = normalizeConfig({ columnOrder: old });
        assert.deepEqual(cfg.columnOrder.slice(0, 4), ['rank', 'player', 'tags', 'guild']);
        assert.equal(cfg.columnOrder.length, old.length + 1);
    });

    it('tags joins a saved compact set only when the config predates the column', () => {
        const oldOrder = ['rank', 'player', 'guild', 'fkdr', 'source'];
        const compact = ['rank', 'player', 'fkdr'];
        assert.ok(normalizeConfig({ columnOrder: oldOrder, compactColumns: compact }).compactColumns.includes('tags'));
        const deliberate = normalizeConfig({ columnOrder: ['rank', 'player', 'tags', 'fkdr'], compactColumns: compact });
        assert.ok(!deliberate.compactColumns.includes('tags'));
    });

    it('tags is enabled by default, also for configs saved before it existed', () => {
        assert.equal(defaultConfig().columnEnabled.tags, true);
        assert.equal(normalizeConfig({ columnEnabled: { rank: true, player: true } }).columnEnabled.tags, true);
        assert.equal(normalizeConfig({ columnEnabled: { tags: false } }).columnEnabled.tags, false);
        assert.ok(defaultConfig().compactColumns.includes('tags'));
    });

    it('columnEnabled keeps player locked on', () => {
        const cfg = normalizeConfig({ columnEnabled: { player: false, fkdr: false } });
        assert.equal(cfg.columnEnabled.player, true);
        assert.equal(cfg.columnEnabled.fkdr, false);
    });

    it('compactColumns always includes player', () => {
        const cfg = normalizeConfig({ compactColumns: ['fkdr'] });
        assert.ok(cfg.compactColumns.includes('player'));
    });
});

describe('normalizeConfig — v5 keys', () => {
    it('defaults', () => {
        const cfg = normalizeConfig(null);
        assert.equal(cfg.apiKey, '');
        assert.equal(cfg.uiScale, 1);
        assert.equal(cfg.rowDensity, 'comfortable');
        assert.equal(cfg.nickedOnTop, true);
        assert.equal(cfg.watchlistOnTop, true);
        assert.equal(cfg.watchlistSound, false);
        assert.equal(cfg.highlightSuspects, true);
    });

    it('apiKey is trimmed and must be a string', () => {
        assert.equal(normalizeConfig({ apiKey: '  abc123  ' }).apiKey, 'abc123');
        assert.equal(normalizeConfig({ apiKey: 42 }).apiKey, '');
    });

    it('uiScale is clamped to [0.8, 1.5]', () => {
        assert.equal(normalizeConfig({ uiScale: 0.1 }).uiScale, 0.8);
        assert.equal(normalizeConfig({ uiScale: 9 }).uiScale, 1.5);
        assert.equal(normalizeConfig({ uiScale: 1.25 }).uiScale, 1.25);
        assert.equal(normalizeConfig({ uiScale: 'big' }).uiScale, 1);
    });

    it('rowDensity accepts only the two modes; booleans fall back when mistyped', () => {
        assert.equal(normalizeConfig({ rowDensity: 'dense' }).rowDensity, 'dense');
        assert.equal(normalizeConfig({ rowDensity: 'tiny' }).rowDensity, 'comfortable');
        assert.equal(normalizeConfig({}).theme, 'dark');
        assert.equal(normalizeConfig({ theme: 'light' }).theme, 'light');
        assert.equal(normalizeConfig({ theme: 'sepia' }).theme, 'dark');
        assert.equal(normalizeConfig({ nickedOnTop: false }).nickedOnTop, false);
        assert.equal(normalizeConfig({ nickedOnTop: 'no' }).nickedOnTop, true);
        assert.equal(normalizeConfig({ watchlistOnTop: false }).watchlistOnTop, false);
        assert.equal(normalizeConfig({ watchlistOnTop: 'no' }).watchlistOnTop, true);
        assert.equal(normalizeConfig({ watchlistSound: true }).watchlistSound, true);
        assert.equal(normalizeConfig({ watchlistSound: 1 }).watchlistSound, false);
        assert.equal(normalizeConfig({ highlightSuspects: false }).highlightSuspects, false);
    });

    it('TRIPLES is a valid stats mode', () => {
        assert.equal(normalizeConfig({ statsMode: 'TRIPLES' }).statsMode, 'TRIPLES');
    });
});

describe('normalizeConfig — v3 legacy migration', () => {
    it('flat ratioThresholds + fkdrThresholds migrate to per-ratio (flat wins, v3 precedence)', () => {
        const cfg = normalizeConfig({
            ratioThresholds: { hacker: 25, godlike: 12, good: 4, medium: 2 },
            fkdrThresholds: { good: 5, medium: 1.5 },
        });
        assert.deepEqual(cfg.ratioThresholds.fkdr, { hacker: 25, godlike: 12, good: 4, medium: 2 });
        // KDR/WLR fall back to defaults in flat format (v3 behavior)
        assert.deepEqual(cfg.ratioThresholds.kdr, { hacker: 5.0, godlike: 2.5, good: 1.5, medium: 0.75 });
        assert.deepEqual(cfg.ratioThresholds.wlr, { hacker: 5.0, godlike: 2.5, good: 1.5, medium: 0.75 });
    });

    it('legacy fkdrThresholds fills tiers missing from flat ratioThresholds (v3 precedence)', () => {
        const cfg = normalizeConfig({
            ratioThresholds: { hacker: 25, godlike: 12 },
            fkdrThresholds: { good: 5, medium: 1.5 },
        });
        assert.deepEqual(cfg.ratioThresholds.fkdr, { hacker: 25, godlike: 12, good: 5, medium: 1.5 });
    });

    it('flat format without fkdrThresholds uses ratioThresholds good/medium', () => {
        const cfg = normalizeConfig({
            ratioThresholds: { hacker: 30, godlike: 15, good: 6, medium: 2.5 },
        });
        assert.deepEqual(cfg.ratioThresholds.fkdr, { hacker: 30, godlike: 15, good: 6, medium: 2.5 });
    });

    it('per-ratio format is preserved with defaults for missing tiers', () => {
        const cfg = normalizeConfig({
            ratioThresholds: {
                fkdr: { hacker: 50, good: 3.5 },
                kdr: { hacker: 8 },
            },
        });
        assert.deepEqual(cfg.ratioThresholds.fkdr, { hacker: 50, godlike: 10.0, good: 3.5, medium: 1.0 });
        assert.deepEqual(cfg.ratioThresholds.kdr, { hacker: 8, godlike: 2.5, good: 1.5, medium: 0.75 });
    });

    it('legacy fkdrThresholds key survives migration (not dropped)', () => {
        const cfg = normalizeConfig({ fkdrThresholds: { good: 4.5, medium: 2 } });
        assert.deepEqual(cfg.fkdrThresholds, { good: 4.5, medium: 2 });
    });

    it('config with ONLY fkdrThresholds (no ratioThresholds) still applies its values', () => {
        const cfg = normalizeConfig({ fkdrThresholds: { good: 4.5, medium: 2 } });
        assert.deepEqual(cfg.ratioThresholds.fkdr, { hacker: 20.0, godlike: 10.0, good: 4.5, medium: 2 });
        assert.deepEqual(cfg.ratioThresholds.kdr, { hacker: 5.0, godlike: 2.5, good: 1.5, medium: 0.75 });
    });
});

describe('ConfigStore — file behavior', () => {
    let dir: string;

    it('loads saved config and writes a .bak backup on first v4 load', () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-cfg-'));
        const configPath = path.join(dir, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify({ myUsername: 'AcquaPanna', opacity: 0.5 }));

        const store = new ConfigStore(configPath);
        assert.equal(store.get('myUsername'), 'AcquaPanna');
        assert.equal(store.get('opacity'), 0.5);
        assert.ok(fs.existsSync(`${configPath}.bak`), 'backup file should be created');
        assert.deepEqual(JSON.parse(fs.readFileSync(`${configPath}.bak`, 'utf8')), { myUsername: 'AcquaPanna', opacity: 0.5 });
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('missing file starts with defaults without creating a backup', () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-cfg-'));
        const configPath = path.join(dir, 'config.json');
        const store = new ConfigStore(configPath);
        assert.equal(store.get('statsMode'), 'ALL_MODES');
        assert.ok(!fs.existsSync(`${configPath}.bak`));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('corrupt config file falls back to defaults', () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-cfg-'));
        const configPath = path.join(dir, 'config.json');
        fs.writeFileSync(configPath, '{ not json !!!');
        const store = new ConfigStore(configPath);
        assert.equal(store.get('logPath'), '');
        assert.equal(store.get('alwaysOnTop'), true);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('set / setMany persist to disk', () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-cfg-'));
        const configPath = path.join(dir, 'config.json');
        const store = new ConfigStore(configPath);
        store.set('pinSelf', true);
        store.setMany({ statsInterval: 'weekly', statsMode: 'SOLO' });
        const reloaded = new ConfigStore(configPath);
        assert.equal(reloaded.get('pinSelf'), true);
        assert.equal(reloaded.get('statsInterval'), 'weekly');
        assert.equal(reloaded.get('statsMode'), 'SOLO');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('set / setMany validate: clamps and enums always hold', () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-cfg-'));
        const configPath = path.join(dir, 'config.json');
        const store = new ConfigStore(configPath);
        store.set('uiScale', 99);
        store.set('statsInterval', 'hourly');
        store.set('apiKey', '  key  ');
        assert.equal(store.get('uiScale'), 1.5);
        assert.equal(store.get('statsInterval'), 'total');
        assert.equal(store.get('apiKey'), 'key');

        store.setMany({ opacity: 5, rowDensity: 'nope', statsMode: 'SOLO' });
        assert.equal(store.get('opacity'), 1);
        assert.equal(store.get('rowDensity'), 'comfortable');
        assert.equal(store.get('statsMode'), 'SOLO');

        const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        assert.equal(onDisk.uiScale, 1.5);
        assert.equal(onDisk.apiKey, 'key');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('set keeps legacy fkdrThresholds and unrelated keys intact', () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-cfg-'));
        const store = new ConfigStore(path.join(dir, 'config.json'));
        store.setMany({ ratioThresholds: { fkdr: { hacker: 50 } } });
        store.set('pinSelf', true);
        assert.equal(store.get('ratioThresholds').fkdr.hacker, 50);
        assert.equal(store.get('ratioThresholds').fkdr.good, 3.0);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('normalizeConfig — settingsBounds', () => {
    it('defaults to null', () => {
        assert.equal(normalizeConfig(null).settingsBounds, null);
    });

    it('keeps valid bounds and drops malformed ones', () => {
        const good = { x: 10, y: 20, width: 760, height: 680 };
        assert.deepEqual(normalizeConfig({ settingsBounds: good }).settingsBounds, good);
        assert.equal(normalizeConfig({ settingsBounds: { x: 1, y: 2, width: 'wide', height: 4 } }).settingsBounds, null);
        assert.equal(normalizeConfig({ settingsBounds: 'nope' }).settingsBounds, null);
    });
});

describe('normalizeConfig — login age', () => {
    it('defaults to off with level 10 and 5 fresh minutes', () => {
        const cfg = normalizeConfig({});
        assert.deepEqual([cfg.loginAge, cfg.loginAgeMaxLevel, cfg.freshMinutes], ['off', 10, 5]);
    });

    it('accepts the three modes and rejects anything else', () => {
        assert.equal(normalizeConfig({ loginAge: 'all' }).loginAge, 'all');
        assert.equal(normalizeConfig({ loginAge: 'lowLevel' }).loginAge, 'lowLevel');
        assert.equal(normalizeConfig({ loginAge: 'sometimes' }).loginAge, 'off');
        assert.equal(normalizeConfig({ loginAge: true }).loginAge, 'off');
    });

    it('clamps and rounds the numeric keys, falling back when mistyped', () => {
        const cfg = normalizeConfig({ loginAgeMaxLevel: 0, freshMinutes: 99999 });
        assert.deepEqual([cfg.loginAgeMaxLevel, cfg.freshMinutes], [1, 1440]);
        assert.equal(normalizeConfig({ loginAgeMaxLevel: 12.6 }).loginAgeMaxLevel, 13);
        const bad = normalizeConfig({ loginAgeMaxLevel: '20', freshMinutes: NaN });
        assert.deepEqual([bad.loginAgeMaxLevel, bad.freshMinutes], [10, 5]);
    });
});
