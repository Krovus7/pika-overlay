/**
 * Dev replay driver — activated by the PIKA_REPLAY env var (path to a log
 * file). Consumed only for offline verification (plan task 6): feeds the
 * overlay with real log data from offset 0, drives UI states via
 * executeJavaScript and captures screenshots into artifacts/screens/.
 * Never active in normal use.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import type { BrowserWindow } from 'electron';
import { setTimeout as sleep } from 'node:timers/promises';

export interface ReplayDeps {
    getOverlayWin: () => BrowserWindow | null;
    rootDir: string;
}

export function replayFilePath(): string | null {
    const p = process.env.PIKA_REPLAY;
    if (!p) return null;
    return path.resolve(p);
}

export async function driveReplay(deps: ReplayDeps): Promise<void> {
    const win = deps.getOverlayWin();
    if (!win) {
        console.error('[replay] overlay window not available');
        return;
    }

    const shotsDir = path.join(deps.rootDir, 'artifacts', 'screens');
    mkdirSync(shotsDir, { recursive: true });

    const js = (expr: string) => win.webContents.executeJavaScript(expr, true);
    const shot = async (name: string) => {
        const img = await win.webContents.capturePage();
        writeFileSync(path.join(shotsDir, name), img.toPNG());
        console.log(`[replay] screenshot: ${name}`);
    };

    console.log('[replay] feeding log to overlay…');
    await sleep(45000); // replay consumption + first API lookups settle

    await js(`document.getElementById('status-badge')?.textContent || ''; true;`);
    await shot('01-base-table.png');

    // Search a known nicked / api-off set to surface those row states
    await js(`const i=document.getElementById('search-input'); i.value='Jeb_, Sky, xXzRandomNick9182Xx, FakeTestNick99zz, AmNoOne1337'; document.getElementById('btn-lookup').click(); true`);
    await sleep(30000);
    await shot('02-search-mixed-states.png');

    // Dropdowns
    await js(`document.getElementById('btn-period').click(); true`);
    await sleep(800);
    await shot('03-dropdown-period.png');
    await js(`document.body.click(); document.getElementById('btn-mode').click(); true`);
    await sleep(800);
    await shot('04-dropdown-mode.png');
    await js(`document.body.click(); true`);

    // Settings tabs
    await js(`document.getElementById('btn-settings').click(); true`);
    await sleep(800);
    await shot('05-settings-general.png');
    await js(`document.querySelector('.settings-tab-btn[data-tab="columns"]').click(); true`);
    await sleep(600);
    await shot('06-settings-columns.png');
    await js(`document.querySelector('.settings-tab-btn[data-tab="stats"]').click(); true`);
    await sleep(600);
    await shot('07-settings-stats.png');
    await js(`document.querySelector('.settings-tab-btn[data-tab="updates"]').click(); true`);
    await sleep(2500);
    await shot('08-settings-updates.png');
    await js(`document.querySelector('.settings-tab-btn[data-tab="debug"]').click(); true`);
    await sleep(600);
    await shot('09-settings-debug.png');
    await js(`document.getElementById('btn-settings-close-x').click(); true`);

    // Compact layout
    await js(`document.getElementById('btn-toggle-view').click(); true`);
    await sleep(800);
    await shot('10-compact.png');
    await js(`document.getElementById('btn-toggle-view').click(); true`);

    // Low opacity + contrast switcher (visual only, no config change)
    await js(`document.documentElement.style.setProperty('--bg-alpha','0.08');
        document.getElementById('lo-switcher').classList.add('visible');
        document.body.classList.add('lo-dark'); true`);
    await sleep(800);
    await shot('11-low-opacity-dark.png');
    await js(`document.body.classList.remove('lo-dark'); document.body.classList.add('lo-light'); true`);
    await sleep(800);
    await shot('12-low-opacity-light.png');

    console.log('[replay] done — screenshots in artifacts/screens/');
    process.exit(0);
}
