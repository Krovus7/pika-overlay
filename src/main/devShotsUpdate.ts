/** Dev screenshots of the "update available" card: demo hook only, nothing is checked or written. */

type Js = (expr: string) => Promise<unknown>;
type Shot = (name: string) => Promise<void>;

export async function captureUpdateShots(js: Js, shot: Shot, resize: (compactNarrow: boolean) => void): Promise<void> {
    await js(`window.__pikaDemoUpdate('5.3.0')`);
    for (const layout of ['detailed', 'compact'] as const) {
        await js(`window.__pikaDemoLayout('${layout}')`);
        for (const theme of ['dark', 'light'] as const) {
            await js(`window.__pikaDemoTheme('${theme}')`);
            await shot(`v5-43-update-popup-${layout}-${theme}.png`);
        }
    }
    await js(`window.__pikaDemoLayout('detailed')`);
    await js(`window.__pikaDemoTheme('dark')`);
    resize(true);
    await shot('v5-43-update-popup-narrow.png');
    resize(false);
    await js(`window.__pikaDemoUpdate(null)`);
}
