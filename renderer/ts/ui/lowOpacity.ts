/** Low-opacity contrast switcher (dark/light text) shown below 15% opacity. */

const LO_OPACITY_THRESHOLD = 0.15;

const loSwitcher = document.getElementById('lo-switcher') as HTMLElement;
const loBtnDark = document.getElementById('lo-btn-dark') as HTMLButtonElement;
const loBtnLight = document.getElementById('lo-btn-light') as HTMLButtonElement;

type LoMode = 'dark' | 'light';

function readStoredMode(): LoMode {
    try {
        return localStorage.getItem('loMode') === 'light' ? 'light' : 'dark';
    } catch (err) {
        console.warn('[Overlay] localStorage unavailable:', String(err));
        return 'dark';
    }
}

let loMode: LoMode = readStoredMode();
let isLow = false;

function applyClasses(): void {
    document.body.classList.remove('lo-dark', 'lo-light');
    if (isLow) document.body.classList.add(`lo-${loMode}`);
    loBtnDark.classList.toggle('active', loMode === 'dark');
    loBtnLight.classList.toggle('active', loMode === 'light');
}

/** `persist: false` is used by the demo/screenshot driver so it never touches stored settings. */
export function setLoMode(mode: LoMode, persist = true): void {
    loMode = mode;
    if (persist) {
        try {
            localStorage.setItem('loMode', mode);
        } catch (err) {
            console.warn('[Overlay] Could not persist contrast mode:', String(err));
        }
    }
    applyClasses();
}

export function applyOpacity(alpha: number): void {
    document.documentElement.style.setProperty('--bg-alpha', String(alpha));
    isLow = alpha < LO_OPACITY_THRESHOLD;
    loSwitcher.classList.toggle('visible', isLow);
    applyClasses();
}

loBtnDark.addEventListener('click', () => setLoMode('dark'));
loBtnLight.addEventListener('click', () => setLoMode('light'));
