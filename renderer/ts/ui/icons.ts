/** Inline-SVG icons: symbols are defined once in overlay.html (#i-<name>). */

export type IconName =
    | 'search' | 'clipboard' | 'list' | 'log-in' | 'sword' | 'bed' | 'diamond' | 'spark'
    | 'lock' | 'key' | 'alert' | 'circle-alert' | 'help' | 'clock' | 'retry'
    | 'arrow-down' | 'radar' | 'moon' | 'sun';

export function icon(name: IconName, extraClass = ''): string {
    return `<svg class="ic ${extraClass}"><use href="#i-${name}"/></svg>`;
}

export function setUseIcon(useEl: Element, name: IconName): void {
    useEl.setAttribute('href', `#i-${name}`);
}
