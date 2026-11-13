/**
 * Background opacity -> CSS variables. --bg-alpha is the user's setting;
 * --lo is "how much legibility help is needed" (0 = none, 1 = maximum) and
 * drives the row scrims, the text halo and the row tint boost continuously.
 */

const LO_FULL_HELP_ALPHA = 0.05;
const LO_NO_HELP_ALPHA = 0.75;

export function legibilityNeed(alpha: number): number {
    const t = (LO_NO_HELP_ALPHA - alpha) / (LO_NO_HELP_ALPHA - LO_FULL_HELP_ALPHA);
    return Math.min(1, Math.max(0, t));
}

export function applyOpacity(alpha: number): void {
    const style = document.documentElement.style;
    style.setProperty('--bg-alpha', String(alpha));
    style.setProperty('--lo', legibilityNeed(alpha).toFixed(3));
}
