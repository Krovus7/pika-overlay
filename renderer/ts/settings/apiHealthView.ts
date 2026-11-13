/** Live connection status line, fed by the overlay's shared health signal. */

import type { ApiHealth, ApiKeyTestResult } from '../../../src/shared/types';
import { setStatus, type Tone } from './controls';

interface View { tone: Tone; icon: string; text: string }

export function describeHealth(h: ApiHealth, now = Date.now()): View {
    switch (h.kind) {
        case 'ok':
            return { tone: 'ok', icon: 'circle-check', text: 'Connected. Stats load normally.' };
        case 'key_missing':
            return { tone: 'info', icon: 'key', text: 'No key yet. Lookups are paused until you add one.' };
        case 'key_invalid':
            return { tone: 'bad', icon: 'circle-alert', text: 'Pika rejected the saved key. Check it with /apikey in game.' };
        case 'rate_limited': {
            const secs = Math.max(0, Math.ceil((h.retryAt - now) / 1000));
            return { tone: 'warn', icon: 'clock', text: `Request limit reached. Resuming in ${secs}s.` };
        }
        case 'unreachable':
            return { tone: 'warn', icon: 'alert', text: 'Pika\'s stats server cannot be reached. Retrying automatically.' };
    }
}

export function renderHealth(el: HTMLElement, h: ApiHealth): void {
    const v = describeHealth(h);
    setStatus(el, v.tone, v.icon, v.text);
}

export function renderKeyTest(el: HTMLElement, r: ApiKeyTestResult): void {
    switch (r.reason) {
        case 'ok': setStatus(el, 'ok', 'circle-check', 'This key works.'); break;
        case 'invalid': setStatus(el, 'bad', 'circle-alert', 'Pika rejected this key. Copy it again from /apikey.'); break;
        case 'rate_limited':
            setStatus(el, 'warn', 'clock', 'Request limit hit while testing. The key was not rejected. Try again in a moment.');
            break;
        case 'unreachable': setStatus(el, 'warn', 'alert', 'Could not reach Pika. Check your connection.'); break;
        case 'missing': setStatus(el, 'info', 'key', 'Paste a key first.'); break;
    }
}
