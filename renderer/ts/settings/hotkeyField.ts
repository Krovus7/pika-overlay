/**
 * "Press a key" capture field. Produces strings that the main process
 * normalises into Electron accelerators (hotkeyManager.normalizeKey).
 */

import { button, h } from './controls';

const NAMED_KEYS: Record<string, string> = {
    Space: 'Space', Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
    Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    NumpadMultiply: 'nummult', NumpadAdd: 'numadd', NumpadSubtract: 'numsub',
    NumpadDecimal: 'numdec', NumpadDivide: 'numdiv',
    Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    Semicolon: ';', Quote: '\'', Backquote: '`', BracketLeft: '[', BracketRight: ']',
};

function keyName(code: string): string | null {
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter) return letter[1]!;
    const digit = /^Digit(\d)$/.exec(code);
    if (digit) return digit[1]!;
    if (/^F\d{1,2}$/.test(code)) return code;
    const pad = /^Numpad(\d)$/.exec(code);
    if (pad) return `num${pad[1]}`;
    return NAMED_KEYS[code] ?? null;
}

interface Captured { accelerator: string; hasModifier: boolean; isFunctionKey: boolean }

/** Null while only modifiers (or an unsupported key) are held. */
export function captureFromEvent(e: KeyboardEvent): Captured | null {
    const key = keyName(e.code);
    if (!key) return null;
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta']
        .filter((m): m is string => !!m);
    return {
        accelerator: [...mods, key].join('+'),
        hasModifier: mods.length > 0,
        isFunctionKey: /^F\d{1,2}$/.test(key),
    };
}

export interface HotkeyField { root: HTMLElement; set(value: string): void }

export interface HotkeyOpts {
    defaultValue: string;
    /** Returns an error message to refuse the key, or null once applied. */
    onCommit: (accelerator: string) => string | null;
}

export function buildHotkeyField({ defaultValue, onCommit }: HotkeyOpts): HotkeyField {
    const root = h('div', 's-hotkey');
    const capture = h('button', 's-key-capture');
    capture.type = 'button';
    const reset = button('', { icon: 'reset', variant: 'ghost', title: `Reset to ${defaultValue}` });
    reset.setAttribute('aria-label', `Reset to ${defaultValue}`);
    const message = h('p', 's-hotkey-msg');
    message.setAttribute('role', 'status');
    const line = h('div', 's-hotkey-line');
    line.append(capture, reset);
    root.append(line, message);

    let value = defaultValue;
    let recording = false;

    function paint(): void {
        capture.classList.toggle('is-recording', recording);
        capture.replaceChildren();
        if (recording) {
            capture.append(h('span', 's-rec-dot'), h('span', 's-key-prompt', 'Press a key… (Esc to cancel)'));
            return;
        }
        value.split('+').forEach((part, i) => {
            if (i) capture.append(h('span', 's-key-plus', '+'));
            capture.append(h('kbd', 's-kbd', part));
        });
        reset.disabled = value === defaultValue;
    }

    function report(error: string | null): void {
        message.textContent = error ?? '';
        message.classList.toggle('is-error', !!error);
    }

    function stop(): void {
        recording = false;
        paint();
    }

    function apply(accelerator: string): void {
        const error = onCommit(accelerator);
        report(error);
        if (error) return;
        value = accelerator;
        stop();
    }

    capture.addEventListener('click', () => { recording = true; report(null); paint(); });
    capture.addEventListener('blur', () => { if (recording) stop(); });
    capture.addEventListener('keydown', e => {
        if (!recording) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') { stop(); return; }
        const got = captureFromEvent(e);
        if (!got) return;
        if (!got.hasModifier && !got.isFunctionKey) {
            report('Add Ctrl, Alt or Shift, or use an F key.');
            return;
        }
        apply(got.accelerator);
    });
    reset.addEventListener('click', () => apply(defaultValue));

    paint();
    return {
        root,
        set(v) {
            value = v || defaultValue;
            if (!recording) { report(null); paint(); }
        },
    };
}
