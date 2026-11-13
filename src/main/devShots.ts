/**
 * Dev screenshot driver — activated only by PIKA_SHOTS=1. Renders the demo
 * rows (no network, no log) and captures every UI state into
 * artifacts/screens/ for visual verification. States are applied through the
 * renderer's window.__pikaDemo* helpers (DOM only); the user's config is never
 * written. Never active in normal use.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { BrowserWindow } from 'electron';

import { captureSettingsShots } from './devShotsSettings';

export interface ShotsDeps {
    getOverlayWin: () => BrowserWindow | null;
    rootDir: string;
}

export function shotsRequested(): boolean {
    return process.env.PIKA_SHOTS === '1';
}

const SETTLE_MS = 450;
const NARROW_WIDTH = 520;

async function waitForPage(win: BrowserWindow): Promise<void> {
    if (win.webContents.isLoading()) {
        await new Promise<void>(resolve => win.webContents.once('did-finish-load', () => resolve()));
    }
    await sleep(1500); // config + health round trips, fonts
}

const THEMES = ['dark', 'light'] as const;

type Js = (expr: string) => Promise<unknown>;
type Shot = (name: string) => Promise<void>;

/** Applies each state once, then captures it in both themes: v5-NN-name-dark/light.png */
async function captureBothThemes(js: Js, shot: Shot, steps: Array<[string, string, () => Promise<unknown>]>): Promise<void> {
    for (const [n, name, apply] of steps) {
        await apply();
        for (const theme of THEMES) {
            await js(`window.__pikaDemoTheme('${theme}')`);
            await shot(`v5-${n}-${name}-${theme}.png`);
        }
    }
}

export async function driveShots(deps: ShotsDeps): Promise<void> {
    const win = deps.getOverlayWin();
    if (!win) {
        console.error('[shots] overlay window not available');
        return;
    }

    const shotsDir = path.join(deps.rootDir, 'artifacts', 'screens');
    mkdirSync(shotsDir, { recursive: true });

    const js = (expr: string) => win.webContents.executeJavaScript(`${expr}; true`, true);
    const shot = async (name: string): Promise<void> => {
        await sleep(SETTLE_MS);
        const img = await win.webContents.capturePage();
        writeFileSync(path.join(shotsDir, name), img.toPNG());
        console.log(`[shots] ${name}`);
    };

    try {
        await waitForPage(win);
        await js('window.__pikaDemo()');
        await captureBothThemes(js, shot, [
            ['01', 'base', async () => undefined],
            ['03', 'dense', () => js('window.__pikaDemoDensity(true)')],
        ]);
        await js('window.__pikaDemoDensity(false)');

        await captureBothThemes(js, shot, [
            ['04', 'banner-rate-limited', () => js(`window.__pikaDemoHealth('rate_limited')`)],
        ]);
        for (const [n, kind] of [['05', 'key_missing'], ['06', 'key_invalid'], ['07', 'unreachable']] as const) {
            await js(`window.__pikaDemoHealth('${kind}')`);
            await shot(`v5-${n}-banner-${kind}.png`);
        }
        await js(`window.__pikaDemoHealth('ok')`);

        await captureBothThemes(js, shot, [['08', 'dropdown-period', () => js(`document.getElementById('btn-period').click()`)]]);
        await js(`document.body.click()`);

        const original = win.getBounds();
        await captureBothThemes(js, shot, [['09', 'compact', () => js(`window.__pikaDemoLayout('compact')`)]]);
        win.setBounds({ ...original, width: NARROW_WIDTH });
        await shot('v5-10-narrow-compact.png');
        win.setBounds(original);
        await js(`window.__pikaDemoLayout('detailed')`);
        win.setBounds({ ...original, width: NARROW_WIDTH });
        await shot('v5-11-narrow.png');
        win.setBounds(original);

        // Opacity ladder, plain (transparent window) in both themes
        let n = 12;
        for (const theme of THEMES) {
            await js(`window.__pikaDemoTheme('${theme}')`);
            for (const alpha of [1, 0.5, 0.2, 0.05]) {
                await js(`window.__pikaDemoOpacity(${alpha})`);
                await shot(`v5-${n++}-${theme}-opacity-${Math.round(alpha * 100)}.png`);
            }
        }

        // Low opacity over a bright and a dark game scene, all four theme/scene pairs
        n = 21;
        for (const [theme, scene] of [['dark', 'dark'], ['dark', 'bright'], ['light', 'bright'], ['light', 'dark']] as const) {
            await js(`window.__pikaDemoTheme('${theme}'); window.__pikaDemoBackdrop('${scene}')`);
            for (const alpha of [0.2, 0.05]) {
                await js(`window.__pikaDemoOpacity(${alpha})`);
                await shot(`v5-${n++}-${theme}-over-${scene}-${Math.round(alpha * 100)}.png`);
            }
        }
        await js(`window.__pikaDemoBackdrop('none'); window.__pikaDemoTheme('dark'); window.__pikaDemoOpacity(0.92)`);

        await captureSettingsShots({ js, shot, win });

        await js('window.__pikaDemoClear()');
        await captureBothThemes(js, shot, [['30', 'empty', async () => undefined]]);
        await js(`window.__pikaDemoHealth('key_missing')`);
        await captureBothThemes(js, shot, [['32', 'empty-key-missing', async () => undefined]]);
        await js(`window.__pikaDemoTheme('dark')`);

        console.log('[shots] done — screenshots in artifacts/screens/');
    } catch (err) {
        console.error('[shots] failed:', String(err));
    }
    process.exit(0);
}
