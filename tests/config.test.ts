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
        const cfg = normalizeConfig({ columnOrder: ['player', 'fkdr'] });
        assert.deepEqual(cfg.columnOrder, ['player', 'fkdr', ...defaultConfig().columnOrder.filter(id => !['player', 'fkdr'].includes(id))]);
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
});
