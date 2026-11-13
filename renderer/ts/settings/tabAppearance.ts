import { block, button, group, h, row, segmented, slider, toggle } from './controls';
import { saveNow, saveSoon } from './saveQueue';
import { cfgBool, cfgNum, cfgStr } from './store';
import type { TabView } from './types';

const pct = (v: number): string => `${Math.round(v)}%`;

function buildPreviewButton(): HTMLElement {
    const btn = button('Preview with sample players', { icon: 'list' });
    let on = false;
    btn.addEventListener('click', () => {
        on = !on;
        if (on) window.__pikaDemo(); else window.__pikaDemoClear();
        const label = btn.querySelector('.s-btn-label');
        if (label) label.textContent = on ? 'Remove sample players' : 'Preview with sample players';
        btn.setAttribute('aria-pressed', String(on));
    });
    return block(btn,
        h('p', 's-hint', 'Fills the table with demo rows so you can tune colors, density and theme without being in a game.'));
}

export function buildAppearance(): TabView {
    const root = h('div', 's-tab-content');

    const look = group('Look');
    const theme = segmented('Theme', [
        { value: 'dark', label: 'Dark', icon: 'moon' },
        { value: 'light', label: 'Light', icon: 'sun' },
    ], v => void saveNow({ theme: v }));
    look.list.appendChild(row('Theme', 'Dark suits dark game scenes and texture packs, light suits bright ones.', theme.root));

    const opacity = slider(5, 100, 5, pct, v => saveSoon({ opacity: v / 100 }));
    opacity.input.addEventListener('change', () => void saveNow({ opacity: Number(opacity.input.value) / 100 }));
    look.list.appendChild(row('Background opacity', 'Only the background fades. Text always stays fully opaque.',
        opacity.root, opacity.input.id));

    const scale = slider(80, 150, 5, pct, v => saveSoon({ uiScale: v / 100 }));
    scale.input.addEventListener('change', () => void saveNow({ uiScale: Number(scale.input.value) / 100 }));
    const resetScale = button('', { icon: 'reset', variant: 'ghost', title: 'Reset to 100%' });
    resetScale.setAttribute('aria-label', 'Reset interface scale to 100%');
    resetScale.addEventListener('click', () => { scale.set(100); void saveNow({ uiScale: 1 }); });
    const scaleWrap = h('div', 's-inline');
    scaleWrap.append(scale.root, resetScale);
    look.list.appendChild(row('Interface scale', 'Makes everything in the overlay bigger or smaller.', scaleWrap, scale.input.id));

    const top = toggle(on => void saveNow({ alwaysOnTop: on }));
    look.list.appendChild(row('Always on top', 'Keeps the overlay above the game window.', top.root, top.input.id));

    const layout = group('Table');
    const mode = segmented('Layout', [
        { value: 'detailed', label: 'Detailed' }, { value: 'compact', label: 'Compact' },
    ], v => void saveNow({ overlayMode: v }));
    layout.list.appendChild(row('Layout', 'Compact shows only the columns you pick in the Columns tab.', mode.root));
    const density = segmented('Row density', [
        { value: 'comfortable', label: 'Comfortable' }, { value: 'dense', label: 'Dense' },
    ], v => void saveNow({ rowDensity: v }));
    layout.list.appendChild(row('Row density', 'Dense fits more players in the same height.', density.root));

    const nickedFirst = toggle(on => void saveNow({ nickedOnTop: on }));
    layout.list.appendChild(row('Show nicked players first', 'Puts them above the sorted rows so they are never missed.',
        nickedFirst.root, nickedFirst.input.id));
    const suspects = toggle(on => void saveNow({ highlightSuspects: on }));
    layout.list.appendChild(row('Highlight suspected bots and alts',
        'Marks players at level 1 or below who have no stats.', suspects.root, suspects.input.id));

    const preview = group('Preview');
    preview.list.appendChild(buildPreviewButton());

    root.append(look.root, layout.root, preview.root);

    return {
        id: 'appearance',
        root,
        sync(cfg) {
            theme.set(cfgStr(cfg, 'theme', 'dark'));
            mode.set(cfgStr(cfg, 'overlayMode', 'detailed'));
            density.set(cfgStr(cfg, 'rowDensity', 'comfortable'));
            if (document.activeElement !== opacity.input) opacity.set(Math.round(cfgNum(cfg, 'opacity', 0.92) * 100));
            if (document.activeElement !== scale.input) scale.set(Math.round(cfgNum(cfg, 'uiScale', 1) * 100));
            top.input.checked = cfgBool(cfg, 'alwaysOnTop', true);
            nickedFirst.input.checked = cfgBool(cfg, 'nickedOnTop', true);
            suspects.input.checked = cfgBool(cfg, 'highlightSuspects', true);
        },
    };
}
