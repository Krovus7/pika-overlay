import { COLUMN_DEFS } from '../../../src/shared/columns';
import { button, group, h, svgIcon, toggle } from './controls';
import { saveNow } from './saveQueue';
import type { Cfg } from './store';
import type { TabView } from './types';

const KNOWN = COLUMN_DEFS.map(c => c.id);
const DEFAULT_COMPACT = ['rank', 'player', 'fkdr', 'winstreak', 'source'];

function mergedOrder(raw: unknown): string[] {
    const saved = Array.isArray(raw) ? raw.filter((id): id is string => KNOWN.includes(id)) : [];
    return [...saved, ...KNOWN.filter(id => !saved.includes(id))];
}

export function buildColumns(): TabView {
    const root = h('div', 's-tab-content');
    let order: string[] = [...KNOWN];
    let enabled: Record<string, boolean> = {};
    let compact = new Set<string>(DEFAULT_COMPACT);
    let dragId: string | null = null;

    const detailed = group('Detailed layout',
        'Choose which columns show and in what order. Drag a row, or use the arrows.');
    const compactGroup = group('Compact layout', 'Pick the columns shown when the overlay is in compact layout.');
    const chips = h('div', 's-chips');
    compactGroup.list.appendChild(chips);

    const saveColumns = (): void => void saveNow({ columnOrder: [...order], columnEnabled: { ...enabled } });

    function move(id: string, to: number): void {
        const from = order.indexOf(id);
        if (from < 0 || to < 0 || to >= order.length || from === to) return;
        order.splice(from, 1);
        order.splice(to, 0, id);
        saveColumns();
        renderDetailed();
    }

    function renderDetailed(): void {
        detailed.list.replaceChildren();
        order.forEach((id, idx) => {
            const def = COLUMN_DEFS.find(c => c.id === id);
            if (!def) return;
            const item = h('div', 's-col-row');
            item.dataset.id = id;
            item.draggable = !def.locked;
            const grip = h('span', `s-grip${def.locked ? ' is-locked' : ''}`);
            grip.append(svgIcon(def.locked ? 'lock' : 'grip'));
            grip.title = def.locked ? 'Always visible' : 'Drag to reorder';
            const sw = toggle(on => { enabled[id] = on; saveColumns(); });
            sw.input.checked = enabled[id] !== false;
            sw.input.disabled = !!def.locked;
            sw.input.setAttribute('aria-label', `Show ${def.settingsLabel}`);
            const name = h('label', 's-col-name', def.settingsLabel);
            name.htmlFor = sw.input.id;
            if (def.locked) name.append(h('span', 's-col-note', 'always shown'));
            const up = button('', { icon: 'arrow-up', variant: 'ghost', title: 'Move up' });
            const down = button('', { icon: 'arrow-down', variant: 'ghost', title: 'Move down' });
            up.setAttribute('aria-label', `Move ${def.settingsLabel} up`);
            down.setAttribute('aria-label', `Move ${def.settingsLabel} down`);
            up.disabled = idx === 0;
            down.disabled = idx === order.length - 1;
            up.addEventListener('click', () => { move(id, idx - 1); focusBtn(id, 'up'); });
            down.addEventListener('click', () => { move(id, idx + 1); focusBtn(id, 'down'); });
            const arrows = h('div', 's-col-arrows');
            arrows.append(up, down);
            item.append(grip, sw.root, name, arrows);
            wireDrag(item, id);
            detailed.list.appendChild(item);
        });
    }

    function focusBtn(id: string, dir: string): void {
        const rowEl = detailed.list.querySelector<HTMLElement>(`[data-id="${id}"]`);
        const buttons = rowEl?.querySelectorAll<HTMLButtonElement>('.s-col-arrows button');
        const target = dir === 'up' ? buttons?.[0] : buttons?.[1];
        (target && !target.disabled ? target : buttons?.[dir === 'up' ? 1 : 0])?.focus();
    }

    function wireDrag(item: HTMLElement, id: string): void {
        if (!item.draggable) return;
        item.addEventListener('dragstart', e => {
            dragId = id;
            e.dataTransfer!.effectAllowed = 'move';
            item.classList.add('is-dragging');
        });
        item.addEventListener('dragend', () => {
            dragId = null;
            detailed.list.querySelectorAll('.is-over, .is-dragging').forEach(n => n.classList.remove('is-over', 'is-dragging'));
        });
        item.addEventListener('dragover', e => {
            if (!dragId) return;
            e.preventDefault();
            if (dragId !== id) item.classList.add('is-over');
        });
        item.addEventListener('dragleave', () => item.classList.remove('is-over'));
        item.addEventListener('drop', e => {
            e.preventDefault();
            if (dragId && dragId !== id) move(dragId, order.indexOf(id));
        });
    }

    function renderChips(): void {
        chips.replaceChildren();
        for (const def of COLUMN_DEFS) {
            const locked = def.id === 'player';
            const chip = h('label', `s-chip${compact.has(def.id) ? ' is-on' : ''}${locked ? ' is-locked' : ''}`);
            const box = h('input');
            box.type = 'checkbox';
            box.checked = compact.has(def.id);
            box.disabled = locked;
            box.addEventListener('change', () => {
                if (box.checked) compact.add(def.id); else compact.delete(def.id);
                chip.classList.toggle('is-on', box.checked);
                void saveNow({ compactColumns: [...compact] });
            });
            chip.append(box, svgIcon('check'), h('span', '', def.settingsLabel));
            chips.appendChild(chip);
        }
    }

    root.append(detailed.root, compactGroup.root);

    return {
        id: 'columns',
        root,
        sync(cfg: Cfg) {
            if (dragId) return;
            order = mergedOrder(cfg.columnOrder);
            const saved = (cfg.columnEnabled ?? {}) as Record<string, boolean>;
            enabled = { ...Object.fromEntries(KNOWN.map(id => [id, id === 'player'])), ...saved, player: true };
            compact = new Set(Array.isArray(cfg.compactColumns) ? cfg.compactColumns as string[] : DEFAULT_COMPACT);
            compact.add('player');
            const active = document.activeElement;
            if (!(active && detailed.list.contains(active))) renderDetailed();
            if (!(active && chips.contains(active))) renderChips();
        },
    };
}
