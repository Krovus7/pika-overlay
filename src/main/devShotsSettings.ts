/**
 * Settings-window part of the dev screenshot driver (PIKA_SHOTS=1). Opens the
 * settings window and captures every tab. DOM only: it never clicks a
 * control that persists, so the owner's config is left untouched.
 */

import { writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { BrowserWindow } from 'electron';

import { getSettingsWin, openSettings } from './settingsWindow';

export interface SettingsShotTools {
    shotsDir: string;
}

const MIN_WIDTH = 560;
const TABS = [
    ['general', 'general'], ['api', 'api'], ['appearance', 'appearance'],
    ['columns', 'columns'], ['stats', 'colors'], ['watchlist', 'watchlist'], ['updates', 'updates'], ['debug', 'debug'],
] as const;

async function waitForWindow(): Promise<BrowserWindow> {
    openSettings();
    for (let i = 0; i < 40; i++) {
        const win = getSettingsWin();
        if (win && !win.webContents.isLoading()) return win;
        await sleep(250);
    }
    throw new Error('settings window did not open');
}

export async function captureSettingsShots({ shotsDir }: SettingsShotTools): Promise<void> {
    const win = await waitForWindow();
    await sleep(1200); // config round trip, fonts
    const js = (expr: string) => win.webContents.executeJavaScript(`${expr}; true`, true);
    const shot = async (name: string): Promise<void> => {
        await sleep(400);
        const img = await win.webContents.capturePage();
        writeFileSync(path.join(shotsDir, name), img.toPNG());
        console.log(`[shots] ${name}`);
    };
    const openTab = async (tab: string): Promise<void> => {
        await js(`document.querySelector('.settings-tab-btn[data-tab="${tab}"]').click()`);
        await sleep(400);
    };
    const setTheme = (theme: 'dark' | 'light') => js(`document.documentElement.dataset.theme = '${theme}'`);

    await setTheme('dark');
    await js(`document.activeElement?.blur()`);
    for (const [tab, name] of TABS) {
        await openTab(tab);
        await shot(`v5-20-settings-${name}.png`);
    }

    const original = win.getBounds();
    win.setBounds({ ...original, width: MIN_WIDTH });
    await sleep(300);
    for (const tab of ['api', 'general'] as const) {
        await openTab(tab);
        await shot(`v5-20-settings-${tab}-narrow.png`);
    }
    win.setBounds(original);
    await sleep(300);

    await setTheme('light');
    for (const tab of ['general', 'api', 'appearance', 'stats', 'watchlist'] as const) {
        await openTab(tab);
        await shot(`v5-20-settings-${tab === 'stats' ? 'colors' : tab}-light.png`);
    }
    await setTheme('dark');
    await openTab('general');
}
