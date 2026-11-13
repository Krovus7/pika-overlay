/** Small DOM builders shared by every settings tab. */

let uidCounter = 0;
export const uid = (prefix = 's'): string => `${prefix}-${++uidCounter}`;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
}

export function svgIcon(name: string, cls = ''): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', `ic ${cls}`.trim());
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.appendChild(use);
    return svg;
}

/** A titled group of rows. */
export function group(title: string, intro = ''): { root: HTMLElement; list: HTMLElement } {
    const root = h('section', 's-group');
    root.appendChild(h('h2', 's-group-title', title));
    if (intro) root.appendChild(h('p', 's-group-intro', intro));
    const list = h('div', 's-list');
    root.appendChild(list);
    return { root, list };
}

/** Label + optional hint on the left, control on the right. */
export function row(label: string, hint: string | null, control: HTMLElement, forId?: string): HTMLElement {
    const el = h('div', 's-row');
    const text = h('div', 's-row-text');
    const lab = h('label', 's-label', label);
    if (forId) lab.htmlFor = forId;
    text.appendChild(lab);
    if (hint) text.appendChild(h('p', 's-hint', hint));
    const ctl = h('div', 's-row-control');
    ctl.appendChild(control);
    el.append(text, ctl);
    return el;
}

export function block(...children: HTMLElement[]): HTMLElement {
    const el = h('div', 's-block');
    el.append(...children);
    return el;
}

export interface ButtonOpts { icon?: string; variant?: 'primary' | 'ghost'; title?: string }

export function button(label: string, opts: ButtonOpts = {}): HTMLButtonElement {
    const btn = h('button', `s-btn${opts.variant ? ` s-btn-${opts.variant}` : ''}`);
    btn.type = 'button';
    if (opts.icon) btn.appendChild(svgIcon(opts.icon));
    if (label) btn.appendChild(h('span', 's-btn-label', label));
    if (opts.title) btn.title = opts.title;
    return btn;
}

export function textInput(placeholder = '', mono = false): HTMLInputElement {
    const input = h('input', `s-input${mono ? ' s-mono' : ''}`);
    input.type = 'text';
    input.id = uid('in');
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    return input;
}

/** Commit-on-pause text binding: debounced while typing, flushed on blur/Enter. */
export function bindText(input: HTMLInputElement, soon: (v: string) => void, now: (v: string) => void): void {
    input.addEventListener('input', () => soon(input.value.trim()));
    input.addEventListener('blur', () => now(input.value.trim()));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') now(input.value.trim()); });
}

export interface Switch { root: HTMLLabelElement; input: HTMLInputElement }

export function toggle(onChange: (on: boolean) => void): Switch {
    const root = h('label', 's-switch');
    const input = h('input');
    input.type = 'checkbox';
    input.id = uid('sw');
    input.setAttribute('role', 'switch');
    root.append(input, h('span', 's-switch-track'));
    input.addEventListener('change', () => onChange(input.checked));
    return { root, input };
}

export interface Segmented { root: HTMLElement; set(value: string): void }

export function segmented(
    label: string,
    options: Array<{ value: string; label: string; icon?: string }>,
    onChange: (value: string) => void,
): Segmented {
    const root = h('div', 's-segmented');
    root.setAttribute('role', 'radiogroup');
    root.setAttribute('aria-label', label);
    const buttons = options.map(opt => {
        const btn = h('button', 's-seg-btn');
        btn.type = 'button';
        btn.setAttribute('role', 'radio');
        btn.dataset.value = opt.value;
        if (opt.icon) btn.appendChild(svgIcon(opt.icon));
        btn.appendChild(h('span', '', opt.label));
        btn.addEventListener('click', () => { set(opt.value); onChange(opt.value); });
        root.appendChild(btn);
        return btn;
    });
    function set(value: string): void {
        for (const b of buttons) {
            const on = b.dataset.value === value;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-checked', String(on));
        }
    }
    return { root, set };
}

export interface Slider { root: HTMLElement; input: HTMLInputElement; set(v: number): void }

export function slider(min: number, max: number, step: number, format: (v: number) => string,
    onInput: (v: number) => void): Slider {
    const root = h('div', 's-slider');
    const input = h('input');
    input.type = 'range';
    input.id = uid('rg');
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const out = h('output', 's-slider-value');
    out.htmlFor = input.id;
    const set = (v: number): void => { input.value = String(v); out.textContent = format(v); };
    input.addEventListener('input', () => { out.textContent = format(Number(input.value)); onInput(Number(input.value)); });
    root.append(input, out);
    return { root, input, set };
}

export type Tone = 'ok' | 'warn' | 'bad' | 'info';

/** An inline status line: tone-colored icon + plain wording. */
export function setStatus(el: HTMLElement, tone: Tone, icon: string, text: string): void {
    el.className = `s-status tone-${tone}`;
    el.replaceChildren(svgIcon(icon), h('span', '', text));
}
