import type { RatioColors, RatioKey, RatioThresholds, TierKey } from '../../../src/shared/types';
import { DEFAULT_COLORS, DEFAULT_THRESHOLDS } from '../core/state';
import { block, button, group, h, svgIcon } from './controls';
import { flushSaves, saveNow, saveSoon } from './saveQueue';
import { cfgObj, type Cfg } from './store';
import type { TabView } from './types';

type ColorKey = keyof RatioColors;

const TIERS: Array<{ key: ColorKey; label: string }> = [
    { key: 'hacker', label: 'Hacker' }, { key: 'godlike', label: 'Sweat' }, { key: 'good', label: 'Excellent' },
    { key: 'medium', label: 'Average' }, { key: 'bad', label: 'Poor' },
];
const RATIOS: Array<{ key: RatioKey; label: string; step: number }> = [
    { key: 'fkdr', label: 'FKDR', step: 0.5 }, { key: 'kdr', label: 'KD', step: 0.25 }, { key: 'wlr', label: 'WLR', step: 0.25 },
];
const THRESHOLD_TIERS = TIERS.slice(0, 4) as Array<{ key: TierKey; label: string }>;

/** First rule broken by a ratio's thresholds, in plain words, or null. */
export function thresholdError(label: string, v: Record<TierKey, number>): string | null {
    for (let i = 0; i < THRESHOLD_TIERS.length; i++) {
        const t = THRESHOLD_TIERS[i]!;
        if (!Number.isFinite(v[t.key]) || v[t.key] < 0) return `${label}: ${t.label} needs a number of 0 or more.`;
        const next = THRESHOLD_TIERS[i + 1];
        if (next && v[t.key] <= v[next.key]) return `${label}: ${t.label} must be higher than ${next.label}.`;
    }
    return null;
}

export function buildColors(): TabView {
    const root = h('div', 's-tab-content');
    let colors: RatioColors = { ...DEFAULT_COLORS };
    let thresholds: RatioThresholds = structuredClone(DEFAULT_THRESHOLDS);
    const colorInputs = new Map<ColorKey, HTMLInputElement>();
    const hexLabels = new Map<ColorKey, HTMLElement>();
    const numInputs = new Map<string, HTMLInputElement>();

    // ── Tier colors ──
    const tiers = group('Tier colors', 'The color a stat gets in the table depending on how good it is.');
    const reset = button('Reset colors', { icon: 'reset' });
    const swatches = h('div', 's-swatches');
    for (const tier of TIERS) {
        const id = `color-${tier.key}`;
        const item = h('label', 's-swatch');
        item.htmlFor = id;
        const pick = h('input');
        pick.type = 'color';
        pick.id = id;
        const chip = h('span', 's-swatch-chip');
        const hex = h('span', 's-swatch-hex');
        pick.addEventListener('input', () => {
            colors = { ...colors, [tier.key]: pick.value };
            paintColors();
            saveSoon({ ratioColors: colors });
        });
        pick.addEventListener('change', () => void saveNow({ ratioColors: colors }));
        item.append(pick, chip, h('span', 's-swatch-name', tier.label), hex);
        colorInputs.set(tier.key, pick);
        hexLabels.set(tier.key, hex);
        swatches.appendChild(item);
    }
    tiers.list.appendChild(block(swatches, reset));

    function paintColors(): void {
        for (const tier of TIERS) {
            const c = colors[tier.key];
            const input = colorInputs.get(tier.key)!;
            input.value = c;
            input.parentElement!.style.setProperty('--tier', c);
            root.style.setProperty(`--tier-${tier.key}`, c);
            hexLabels.get(tier.key)!.textContent = c.toUpperCase();
        }
    }
    reset.addEventListener('click', () => { colors = { ...DEFAULT_COLORS }; paintColors(); void saveNow({ ratioColors: colors }); });

    // ── Thresholds ──
    const thr = group('Thresholds',
        'A stat gets a tier when it reaches that number. Anything below Average is Poor.');
    const grid = h('div', 's-thr-grid');
    grid.appendChild(h('span', 's-thr-corner'));
    for (const r of RATIOS) grid.appendChild(h('span', 's-thr-head', r.label));
    for (const tier of THRESHOLD_TIERS) {
        const name = h('span', 's-thr-name');
        const dot = h('span', 's-tier-dot');
        dot.dataset.tier = tier.key;
        name.append(dot, tier.label);
        grid.appendChild(name);
        for (const r of RATIOS) {
            const input = h('input', 's-input s-num');
            input.type = 'number';
            input.min = '0';
            input.step = String(r.step);
            input.setAttribute('aria-label', `${r.label} ${tier.label}`);
            input.addEventListener('input', onThresholdInput);
            input.addEventListener('change', () => { onThresholdInput(); void flushNow(); });
            numInputs.set(`${r.key}.${tier.key}`, input);
            grid.appendChild(input);
        }
    }
    const poor = h('span', 's-thr-name');
    const poorDot = h('span', 's-tier-dot');
    poorDot.dataset.tier = 'bad';
    poor.append(poorDot, 'Poor');
    grid.append(poor, h('span', 's-thr-poor', 'Everything below Average'));
    const error = h('p', 's-form-error');
    error.setAttribute('role', 'alert');
    const resetThr = button('Reset thresholds', { icon: 'reset' });
    thr.list.appendChild(block(grid, error, resetThr));

    function readRatio(key: RatioKey): Record<TierKey, number> {
        const out = {} as Record<TierKey, number>;
        for (const t of THRESHOLD_TIERS) out[t.key] = numInputs.get(`${key}.${t.key}`)!.valueAsNumber;
        return out;
    }

    /** Returns the thresholds to save: only ratios that pass validation. */
    function validated(): RatioThresholds {
        const next = structuredClone(thresholds);
        const messages: string[] = [];
        for (const r of RATIOS) {
            const values = readRatio(r.key);
            const msg = thresholdError(r.label, values);
            const invalid = msg !== null;
            for (const t of THRESHOLD_TIERS) numInputs.get(`${r.key}.${t.key}`)!.setAttribute('aria-invalid', String(invalid));
            if (msg) messages.push(msg); else next[r.key] = values;
        }
        error.replaceChildren();
        if (messages.length) {
            error.append(svgIcon('circle-alert'), h('span', '', `${messages.join(' ')} Not saved yet.`));
        }
        return next;
    }

    function onThresholdInput(): void {
        const next = validated();
        if (JSON.stringify(next) === JSON.stringify(thresholds)) return;
        thresholds = next;
        saveSoon({ ratioThresholds: thresholds });
    }
    const flushNow = flushSaves;

    resetThr.addEventListener('click', () => {
        thresholds = structuredClone(DEFAULT_THRESHOLDS);
        paintThresholds();
        validated();
        void saveNow({ ratioThresholds: thresholds });
    });

    function paintThresholds(): void {
        for (const r of RATIOS) {
            for (const t of THRESHOLD_TIERS) numInputs.get(`${r.key}.${t.key}`)!.value = String(thresholds[r.key][t.key]);
        }
    }

    root.append(tiers.root, thr.root);

    return {
        id: 'stats',
        root,
        sync(cfg: Cfg) {
            colors = { ...DEFAULT_COLORS, ...cfgObj<Partial<RatioColors>>(cfg, 'ratioColors', {}) };
            paintColors();
            const active = document.activeElement;
            if (active instanceof HTMLInputElement && grid.contains(active)) return;
            const saved = cfgObj<Partial<RatioThresholds>>(cfg, 'ratioThresholds', {});
            thresholds = {
                fkdr: { ...DEFAULT_THRESHOLDS.fkdr, ...saved.fkdr },
                kdr: { ...DEFAULT_THRESHOLDS.kdr, ...saved.kdr },
                wlr: { ...DEFAULT_THRESHOLDS.wlr, ...saved.wlr },
            };
            paintThresholds();
            validated();
        },
    };
}
