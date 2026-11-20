/** Re-renders every 30 s while at least one visible row shows a login age; no timer otherwise. */

const TICK_MS = 30_000;
let handle: ReturnType<typeof setInterval> | null = null;

export function syncAgeTimer(active: boolean, tick: () => void): void {
    if (active && handle === null) handle = setInterval(tick, TICK_MS);
    else if (!active && handle !== null) {
        clearInterval(handle);
        handle = null;
    }
}
