/** Dev screenshots of the row context menu: opened on a demo row, never picked (nothing is written). */

type Js = (expr: string) => Promise<unknown>;
type Shot = (name: string) => Promise<void>;

/** Right-clicks the row of `key` at a point inside its player cell. */
function openOn(key: string): string {
    return `(() => {
        const cell = document.querySelector('tr[data-key="${key}"] td:nth-child(2)');
        if (!cell) throw new Error('demo row ${key} missing');
        const r = cell.getBoundingClientRect();
        cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + r.height / 2 }));
    })()`;
}

const CLOSE = `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`;

export async function captureMenuShots(js: Js, shot: Shot): Promise<void> {
    for (const theme of ['dark', 'light'] as const) {
        await js(`window.__pikaDemoTheme('${theme}')`);
        await js(openOn('sweatlord99'));
        await shot(`v5-40-row-menu-${theme}.png`);
        await js(CLOSE);
        await js(openOn('silentfox88'));
        await shot(`v5-41-row-menu-nicked-${theme}.png`);
        await js(`[...document.querySelectorAll('.row-menu .rm-item')].find(b => b.textContent.includes('teammate'))?.click()`);
        await shot(`v5-42-row-menu-teammate-${theme}.png`);
        await js(CLOSE);
    }
    await js(`window.__pikaDemoTheme('dark')`);
}
