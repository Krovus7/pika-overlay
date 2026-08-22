/**
 * Typed config store with v3 migration (ADR-0007).
 * Same path as v3 (%APPDATA%\pika-overlay\config.json — userData is fixed by
 * main.ts), non-destructive: legacy keys are migrated, never dropped, and a
 * config.json.bak backup is written on first v4 load.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────
export type StatsInterval = 'total' | 'weekly' | 'monthly' | 'yearly';
export type StatsMode = 'ALL_MODES' | 'SOLO' | 'DOUBLES' | 'QUAD';
export type RatioKey = 'fkdr' | 'kdr' | 'wlr';
export type TierKey = 'hacker' | 'godlike' | 'good' | 'medium';

export interface RatioThresholds {
    fkdr: Record<TierKey, number>;
    kdr: Record<TierKey, number>;
    wlr: Record<TierKey, number>;
}

export interface RatioColors {
    hacker: string;
    godlike: string;
    good: string;
    medium: string;
    bad: string;
}

export interface AppConfig {
    logPath: string;
    myUsername: string;
    pinSelf: boolean;
    isNicked: boolean;
    myNickName: string;
    overlayBounds: { x: number; y: number; width: number; height: number };
    alwaysOnTop: boolean;
    toggleHotkey: string;
    clearHotkey: string;
    opacity: number;
    statsInterval: StatsInterval;
    statsMode: StatsMode;
    overlayMode: 'detailed' | 'compact';
    ratioThresholds: RatioThresholds;
    ratioColors: RatioColors;
    columnOrder: string[];
    columnEnabled: Record<string, boolean>;
    compactColumns: string[];
    fkdrThresholds: { good: number; medium: number }; // legacy v3 key — kept, migrated
    updateAutoCheck: boolean; // v4: silent update check at startup
}

export type RawConfig = Record<string, unknown>;

const KNOWN_COLUMNS = [
    'rank', 'player', 'guild', 'fkdr', 'finals', 'kdr', 'wlr', 'wins',
    'beds', 'winstreak', 'kills', 'deaths', 'bowkills', 'source',
];
const VALID_INTERVALS: StatsInterval[] = ['total', 'weekly', 'monthly', 'yearly'];
const VALID_MODES: StatsMode[] = ['ALL_MODES', 'SOLO', 'DOUBLES', 'QUAD'];
const VALID_TIERS: TierKey[] = ['hacker', 'godlike', 'good', 'medium'];

const DEFAULT_THRESHOLDS: Record<RatioKey, Record<TierKey, number>> = {
    fkdr: { hacker: 20.0, godlike: 10.0, good: 3.0, medium: 1.0 },
    kdr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5, medium: 0.75 },
    wlr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5, medium: 0.75 },
};

const DEFAULT_COLORS: RatioColors = {
    hacker: '#f43f5e', godlike: '#d946ef', good: '#22c55e',
    medium: '#f59e0b', bad: '#ef4444',
};

export function defaultConfig(): AppConfig {
    return {
        logPath: '',
        myUsername: '',
        pinSelf: false,
        isNicked: false,
        myNickName: '',
        overlayBounds: { x: 20, y: 60, width: 960, height: 600 },
        alwaysOnTop: true,
        toggleHotkey: 'F4',
        clearHotkey: 'F5',
        opacity: 0.92,
        statsInterval: 'total',
        statsMode: 'ALL_MODES',
        overlayMode: 'detailed',
        ratioThresholds: {
            fkdr: { ...DEFAULT_THRESHOLDS.fkdr },
            kdr: { ...DEFAULT_THRESHOLDS.kdr },
            wlr: { ...DEFAULT_THRESHOLDS.wlr },
        },
        ratioColors: { ...DEFAULT_COLORS },
        columnOrder: [...KNOWN_COLUMNS],
        columnEnabled: {
            rank: true, player: true, fkdr: true, finals: true, kdr: true,
            wlr: true, wins: true, beds: true, winstreak: true, kills: false,
            deaths: false, bowkills: false, guild: false, source: true,
        },
        compactColumns: ['rank', 'player', 'fkdr', 'winstreak', 'source'],
        fkdrThresholds: { good: 3.0, medium: 1.0 },
        updateAutoCheck: true,
    };
}

// ─── Migration (pure) ─────────────────────────────────────────────────────────
// v3 could save thresholds in two shapes:
//   per-ratio: ratioThresholds = { fkdr: {...}, kdr: {...}, wlr: {...} }
//   flat:      ratioThresholds = { hacker, godlike, good, medium } +
//              fkdrThresholds = { good, medium } (FKDR-only legacy)
function migrateThresholds(rt: unknown, ft: unknown): RatioThresholds {
    const out = {
        fkdr: { ...DEFAULT_THRESHOLDS.fkdr },
        kdr: { ...DEFAULT_THRESHOLDS.kdr },
        wlr: { ...DEFAULT_THRESHOLDS.wlr },
    };
    const ratio = (rt ?? {}) as RawConfig;
    const legacy = (ft ?? {}) as RawConfig;
    const perRatio = ratio.fkdr && typeof ratio.fkdr === 'object';

    if (perRatio) {
        const fk = ratio.fkdr as RawConfig;
        const kd = (ratio.kdr ?? {}) as RawConfig;
        const wl = (ratio.wlr ?? {}) as RawConfig;
        for (const key of VALID_TIERS) {
            out.fkdr[key] = num(fk[key], DEFAULT_THRESHOLDS.fkdr[key]);
        }
        for (const key of VALID_TIERS) {
            out.kdr[key] = num(kd[key], DEFAULT_THRESHOLDS.kdr[key]);
            out.wlr[key] = num(wl[key], DEFAULT_THRESHOLDS.wlr[key]);
        }
    } else {
        out.fkdr = {
            hacker: num(ratio.hacker, 20.0),
            godlike: num(ratio.godlike, 10.0),
            good: num(ratio.good, num(legacy.good, 3.0)),
            medium: num(ratio.medium, num(legacy.medium, 1.0)),
        };
    }
    return out;
}

function num(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
    return typeof v === 'boolean' ? v : fallback;
}

function str(v: unknown, fallback: string): string {
    return typeof v === 'string' ? v : fallback;
}

function enumOf<T extends string>(v: unknown, valid: T[], fallback: T): T {
    return typeof v === 'string' && (valid as string[]).includes(v) ? (v as T) : fallback;
}

function numArr(v: unknown, fallback: number[]): number[] {
    if (!Array.isArray(v)) return fallback;
    const out = v.map(Number).filter(n => Number.isFinite(n));
    return out.length ? out : fallback;
}

/** Merge raw saved config over defaults and migrate legacy keys (pure) */
export function normalizeConfig(raw: RawConfig | null | undefined, defaults: AppConfig = defaultConfig()): AppConfig {
    const r = raw ?? {};
    const merged = { ...defaults, ...r } as RawConfig;
    const bounds = (merged.overlayBounds ?? {}) as RawConfig;

    return {
        logPath: str(merged.logPath, defaults.logPath),
        myUsername: str(merged.myUsername, defaults.myUsername),
        pinSelf: bool(merged.pinSelf, defaults.pinSelf),
        isNicked: bool(merged.isNicked, defaults.isNicked),
        myNickName: str(merged.myNickName, defaults.myNickName),
        overlayBounds: {
            x: num(bounds.x, defaults.overlayBounds.x),
            y: num(bounds.y, defaults.overlayBounds.y),
            width: num(bounds.width, defaults.overlayBounds.width),
            height: num(bounds.height, defaults.overlayBounds.height),
        },
        alwaysOnTop: bool(merged.alwaysOnTop, defaults.alwaysOnTop),
        toggleHotkey: str(merged.toggleHotkey, defaults.toggleHotkey),
        clearHotkey: str(merged.clearHotkey, defaults.clearHotkey),
        opacity: Math.min(1, Math.max(0.05, num(merged.opacity, defaults.opacity))),
        statsInterval: enumOf(merged.statsInterval, VALID_INTERVALS, defaults.statsInterval),
        statsMode: enumOf(merged.statsMode, VALID_MODES, defaults.statsMode),
        overlayMode: enumOf(merged.overlayMode, ['detailed', 'compact'], defaults.overlayMode),
        ratioThresholds: migrateThresholds(merged.ratioThresholds, merged.fkdrThresholds),
        ratioColors: {
            hacker: str((merged.ratioColors as RawConfig)?.hacker, defaults.ratioColors.hacker),
            godlike: str((merged.ratioColors as RawConfig)?.godlike, defaults.ratioColors.godlike),
            good: str((merged.ratioColors as RawConfig)?.good, defaults.ratioColors.good),
            medium: str((merged.ratioColors as RawConfig)?.medium, defaults.ratioColors.medium),
            bad: str((merged.ratioColors as RawConfig)?.bad, defaults.ratioColors.bad),
        },
        columnOrder: mergeColumnOrder(merged.columnOrder),
        columnEnabled: normalizeColumnEnabled(merged.columnEnabled),
        compactColumns: mergeCompactColumns(merged.compactColumns),
        fkdrThresholds: {
            good: num((merged.fkdrThresholds as RawConfig)?.good, 3.0),
            medium: num((merged.fkdrThresholds as RawConfig)?.medium, 1.0),
        },
        updateAutoCheck: bool(merged.updateAutoCheck, defaults.updateAutoCheck),
    };
}

function mergeColumnOrder(v: unknown): string[] {
    const saved = Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string') : [];
    const merged = saved.filter(id => KNOWN_COLUMNS.includes(id));
    for (const id of KNOWN_COLUMNS) {
        if (!merged.includes(id)) merged.push(id);
    }
    return merged;
}

function normalizeColumnEnabled(v: unknown): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const id of KNOWN_COLUMNS) out[id] = id === 'player';
    if (v && typeof v === 'object') {
        for (const id of KNOWN_COLUMNS) {
            const val = (v as RawConfig)[id];
            if (typeof val === 'boolean') out[id] = val;
        }
    }
    out.player = true;
    return out;
}

function mergeCompactColumns(v: unknown): string[] {
    const saved = Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string') : [];
    const merged = saved.filter(id => KNOWN_COLUMNS.includes(id));
    if (!merged.includes('player')) merged.push('player');
    return merged;
}

// ─── Store ────────────────────────────────────────────────────────────────────
export class ConfigStore {
    private data: AppConfig;

    constructor(private readonly configPath: string) {
        this.data = normalizeConfig(readJsonSafe(configPath));
        if (fs.existsSync(configPath) && !fs.existsSync(`${configPath}.bak`)) {
            try { fs.copyFileSync(configPath, `${configPath}.bak`); } catch { /* best effort */ }
        }
    }

    static userDataPath(userDataDir: string): string {
        return path.join(userDataDir, 'config.json');
    }

    get<K extends keyof AppConfig>(key: K): AppConfig[K] {
        return this.data[key];
    }

    getAll(): AppConfig {
        return this.data;
    }

    set(key: keyof AppConfig, value: unknown): void {
        (this.data as unknown as RawConfig)[key] = value;
        this.persist();
    }

    setMany(cfg: RawConfig): void {
        Object.assign(this.data, cfg);
        this.persist();
    }

    persist(): void {
        try {
            fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
            fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error('[Config] Failed to write config:', (e as Error).message);
        }
    }
}

function readJsonSafe(configPath: string): RawConfig | null {
    try {
        if (!fs.existsSync(configPath)) return null;
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        console.warn('[Config] Corrupt config file — starting with defaults');
        return null;
    }
}
