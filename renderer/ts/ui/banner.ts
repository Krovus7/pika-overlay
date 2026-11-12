/**
 * API health banner between the search bar and the table. Visible only when
 * health is not ok. The rate-limit countdown ticks only while it is shown.
 */

import type { ApiHealth } from '../../../src/shared/types';
import { state } from '../core/state';
import { refreshEmptyState } from './emptyState';
import { setUseIcon, type IconName } from './icons';

const banner = document.getElementById('api-banner') as HTMLElement;
const text = document.getElementById('banner-text') as HTMLElement;
const iconUse = document.getElementById('banner-icon') as Element;
const settingsBtn = document.getElementById('banner-settings') as HTMLButtonElement;

let timer: number | null = null;

function stopTimer(): void {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
}

function show(tone: 'info' | 'warn' | 'error', ic: IconName, message: string, withSettings: boolean): void {
    banner.hidden = false;
    banner.className = `api-banner tone-${tone}`;
    setUseIcon(iconUse, ic);
    text.textContent = message;
    settingsBtn.hidden = !withSettings;
}

function countdownText(retryAt: number): string {
    const secs = Math.ceil((retryAt - Date.now()) / 1000);
    return secs > 0 ? `Rate limit reached — resuming in ${secs}s` : 'Rate limit reached — resuming…';
}

function render(h: ApiHealth): void {
    stopTimer();
    switch (h.kind) {
        case 'ok':
            banner.hidden = true;
            break;
        case 'key_missing':
            show('info', 'key', 'Pika API key required. Run /apikey in-game, then paste it in Settings.', true);
            break;
        case 'key_invalid':
            show('error', 'circle-alert', 'API key rejected. Check it in-game with /apikey.', true);
            break;
        case 'rate_limited': {
            show('warn', 'clock', countdownText(h.retryAt), false);
            timer = window.setInterval(() => { text.textContent = countdownText(h.retryAt); }, 1000);
            break;
        }
        case 'unreachable':
            show('warn', 'alert', 'Pika API unreachable — retrying', false);
            break;
    }
}

export function setHealth(h: ApiHealth): void {
    state.health = h;
    render(h);
    refreshEmptyState();
}

settingsBtn.addEventListener('click', () => document.getElementById('btn-settings')?.click());
