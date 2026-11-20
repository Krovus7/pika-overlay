/** Runs a watchlist IPC call and shows a visible message when it throws or reports failure. */

import { setStatus } from './controls';

export async function runAction(status: HTMLElement, job: () => Promise<unknown>, failure: string): Promise<void> {
    try {
        if ((await job()) === false) setStatus(status, 'bad', 'circle-alert', failure);
        else if (status.classList.contains('tone-bad')) { status.className = 's-status'; status.replaceChildren(); }
    } catch (err) {
        console.error('[Settings] Watchlist action failed:', String(err));
        setStatus(status, 'bad', 'circle-alert', failure);
    }
}
