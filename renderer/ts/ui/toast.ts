/** One transient message ("Copied <name>") in a fixed element of overlay.html. */

const TOAST_MS = 1200;
let timer: number | undefined;

export function showToast(text: string, durationMs = TOAST_MS): void {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('is-visible');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => el.classList.remove('is-visible'), durationMs);
}
