/** Renderer-side copy of the config plus a tiny pub-sub fed by overlay.ts. */

export type Cfg = Record<string, unknown>;

let current: Cfg = {};
const subscribers = new Set<(cfg: Cfg) => void>();

export function getCfg(): Cfg {
    return current;
}

export function subscribeConfig(cb: (cfg: Cfg) => void): void {
    subscribers.add(cb);
}

/** The one function overlay.ts calls on every `config:updated` event. */
export function notifySettingsConfig(cfg: Cfg): void {
    current = cfg;
    subscribers.forEach(cb => cb(cfg));
}

export function cfgNum(cfg: Cfg, key: string, fallback: number): number {
    const v = cfg[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function cfgBool(cfg: Cfg, key: string, fallback: boolean): boolean {
    const v = cfg[key];
    return typeof v === 'boolean' ? v : fallback;
}

export function cfgStr(cfg: Cfg, key: string, fallback = ''): string {
    const v = cfg[key];
    return typeof v === 'string' ? v : fallback;
}

export function cfgObj<T extends object>(cfg: Cfg, key: string, fallback: T): T {
    const v = cfg[key];
    return v && typeof v === 'object' ? { ...fallback, ...(v as T) } : fallback;
}
