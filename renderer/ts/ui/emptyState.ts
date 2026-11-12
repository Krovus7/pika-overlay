/** Empty state: says what the overlay is waiting for, or what blocks it. */

import { state } from '../core/state';
import { setUseIcon } from './icons';

const root = document.getElementById('empty-state') as HTMLElement;
const title = document.getElementById('empty-title') as HTMLElement;
const sub = document.getElementById('empty-sub') as HTMLElement;
const action = document.getElementById('empty-action') as HTMLButtonElement;
const iconUse = document.getElementById('empty-icon-use') as Element;

let lastKey = '';

function content(): { key: string; blocked: boolean; title: string; sub: string } {
    const kind = state.health.kind;
    if (kind === 'key_missing') {
        return { key: kind, blocked: true, title: 'API key required',
            sub: 'Run /apikey in-game, then paste the key in Settings.' };
    }
    if (kind === 'key_invalid') {
        return { key: kind, blocked: true, title: 'API key rejected',
            sub: 'Check your key in-game with /apikey, then update it in Settings.' };
    }
    const hint = state.layout === 'compact' ? '' : ' You can also search a name above.';
    return { key: `waiting${hint}`, blocked: false, title: 'Waiting for players',
        sub: `Players appear automatically when a BedWars game starts.${hint}` };
}

export function refreshEmptyState(): void {
    root.hidden = state.players.size > 0;
    const c = content();
    if (c.key === lastKey) return;
    lastKey = c.key;
    title.textContent = c.title;
    sub.textContent = c.sub;
    action.hidden = !c.blocked;
    root.classList.toggle('is-blocked', c.blocked);
    setUseIcon(iconUse, c.blocked ? 'key' : 'radar');
}

action.addEventListener('click', () => document.getElementById('btn-settings')?.click());
