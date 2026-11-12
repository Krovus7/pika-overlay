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
        await shot('v5-01-base.png');

        await js('window.__pikaDemoDensity(true)');
        await shot('v5-02-dense.png');
        await js('window.__pikaDemoDensity(false)');

        for (const [n, kind] of [['03', 'key_missing'], ['04', 'key_invalid'], ['05', 'rate_limited'], ['06', 'unreachable']] as const) {
            await js(`window.__pikaDemoHealth('${kind}')`);
            await shot(`v5-${n}-banner-${kind}.png`);
        }
        await js(`window.__pikaDemoHealth('ok')`);

        await js(`document.getElementById('btn-period').click()`);
        await shot('v5-07-dropdown-period.png');
        await js(`document.body.click()`);

        const original = win.getBounds();
        win.setBounds({ ...original, width: NARROW_WIDTH });
        await shot('v5-08-narrow.png');
        await js(`window.__pikaDemoLayout('compact')`);
        await shot('v5-09-narrow-compact.png');
        win.setBounds(original);
        await shot('v5-10-compact.png');
        await js(`window.__pikaDemoLayout('detailed')`);

        await js(`window.__pikaDemoOpacity(0.08, 'dark')`);
        await shot('v5-11-low-opacity-dark.png');
        await js(`window.__pikaDemoOpacity(0.08, 'light')`);
        await shot('v5-12-low-opacity-light.png');
        await js(`window.__pikaDemoOpacity(0.92)`);

        await captureSettingsShots({ js, shot, win });

        await js('window.__pikaDemoClear()');
        await shot('v5-14-empty.png');
        await js(`window.__pikaDemoHealth('key_missing')`);
        await shot('v5-15-empty-key-missing.png');

        console.log('[shots] done — screenshots in artifacts/screens/');
    } catch (err) {
        console.error('[shots] failed:', String(err));
    }
    process.exit(0);
}
