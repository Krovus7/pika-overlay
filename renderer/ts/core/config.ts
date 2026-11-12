/**
 * Config -> state. Reads the loosely typed config object delivered by the
 * main process and falls back to sensible defaults for anything missing.
 */

import { COLUMN_DEFS } from '../../../src/shared/columns';
import type { RatioThresholds } from '../../../src/shared/types';
import { DEFAULT_COLORS, DEFAULT_THRESHOLDS, state } from './state';

function asNum(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function strOr(v: unknown, fallback: string): string {
    return typeof v === 'string' && v ? v : fallback;
}

function asRecord(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function parseTiers(src: Record<string, unknown>, def: RatioThresholds['fkdr']): RatioThresholds['fkdr'] {
    return {
        hacker: asNum(src.hacker, def.hacker),
        godlike: asNum(src.godlike, def.godlike),
        good: asNum(src.good, def.good),
        medium: asNum(src.medium, def.medium),
    };
}

function parseThresholds(cfg: Record<string, unknown>): RatioThresholds {
    const rt = asRecord(cfg.ratioThresholds);
    if (rt.fkdr && typeof rt.fkdr === 'object') {
        return {
            fkdr: parseTiers(asRecord(rt.fkdr), DEFAULT_THRESHOLDS.fkdr),
            kdr: parseTiers(asRecord(rt.kdr), DEFAULT_THRESHOLDS.kdr),
            wlr: parseTiers(asRecord(rt.wlr), DEFAULT_THRESHOLDS.wlr),
        };
    }
    // Legacy flat format applied to FKDR only
    const legacy = asRecord(cfg.fkdrThresholds);
    return {
        ...DEFAULT_THRESHOLDS,
        fkdr: parseTiers({ ...legacy, ...rt }, DEFAULT_THRESHOLDS.fkdr),
    };
}

function applyColumns(cfg: Record<string, unknown>): void {
    const knownIds = COLUMN_DEFS.map(c => c.id);
    const savedOrder = Array.isArray(cfg.columnOrder) ? (cfg.columnOrder as string[]) : state.columnOrder;
    const merged = savedOrder.filter(id => knownIds.includes(id));
    knownIds.forEach(id => { if (!merged.includes(id)) merged.push(id); });
    state.columnOrder = merged;
    state.columnEnabled = { ...state.columnEnabled, ...asRecord(cfg.columnEnabled) as Record<string, boolean> };
    state.columnEnabled.player = true;

    if (Array.isArray(cfg.compactColumns)) {
        state.compactColumns = new Set(cfg.compactColumns as string[]);
        state.compactColumns.add('player');
    }
}

export function applyConfigToState(cfg: Record<string, unknown>): void {
    if (!cfg) return;

    if (cfg.overlayMode === 'compact' || cfg.overlayMode === 'detailed') state.layout = cfg.overlayMode;

    state.myUsername = String(cfg.myUsername || '').toLowerCase();
    state.pinSelf = !!cfg.pinSelf;
    state.isNicked = !!cfg.isNicked;
    state.myNickName = String(cfg.myNickName || '').toLowerCase();
    state.nickedOnTop = cfg.nickedOnTop !== false;
    state.highlightSuspects = cfg.highlightSuspects !== false;

    if (typeof cfg.statsInterval === 'string') state.interval = cfg.statsInterval;
    if (typeof cfg.statsMode === 'string') state.mode = cfg.statsMode;

    state.thresholds = parseThresholds(cfg);
    const rc = asRecord(cfg.ratioColors);
    state.colors = {
        hacker: strOr(rc.hacker, DEFAULT_COLORS.hacker),
        godlike: strOr(rc.godlike, DEFAULT_COLORS.godlike),
        good: strOr(rc.good, DEFAULT_COLORS.good),
        medium: strOr(rc.medium, DEFAULT_COLORS.medium),
        bad: strOr(rc.bad, DEFAULT_COLORS.bad),
    };

    applyColumns(cfg);
}
