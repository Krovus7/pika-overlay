/**
 * Settings-panel part of the dev screenshot driver (PIKA_SHOTS=1). Opens the
 * inline settings panel and captures every tab. DOM only: it never clicks a
 * control that persists, so the owner's config is left untouched.
 */

import type { BrowserWindow } from 'electron';

export interface SettingsShotTools {
    js: (expr: string) => Promise<unknown>;
    shot: (name: string) => Promise<void>;
    win: BrowserWindow;
}

const NARROW_WIDTH = 520;
const TABS = [
    ['general', 'general'], ['api', 'api'], ['appearance', 'appearance'],
    ['columns', 'columns'], ['stats', 'colors'], ['updates', 'updates'], ['debug', 'debug'],
] as const;

const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export async function captureSettingsShots({ js, shot, win }: SettingsShotTools): Promise<void> {
    const openTab = async (tab: string): Promise<void> => {
        await js(`document.querySelector('.settings-tab-btn[data-tab="${tab}"]').click()`);
        await pause(400);
    };

    await js(`document.getElementById('btn-settings').click()`);
    await pause(500);
    await js(`document.activeElement?.blur()`);
    for (const [tab, name] of TABS) {
        await openTab(tab);
        await shot(`v5-20-settings-${name}.png`);
    }

    const original = win.getBounds();
    win.setBounds({ ...original, width: NARROW_WIDTH });
    await pause(300);
    await openTab('api');
    await shot('v5-20-settings-api-narrow.png');
    await openTab('general');
    await shot('v5-20-settings-general-narrow.png');
    win.setBounds(original);
    await pause(300);

    const previousTheme = await js(`document.documentElement.dataset.theme ?? ''`);
    await js(`document.documentElement.dataset.theme = 'light'`);
    for (const tab of ['general', 'api', 'appearance', 'stats'] as const) {
        await openTab(tab);
        await shot(`v5-20-settings-${tab === 'stats' ? 'colors' : tab}-light.png`);
    }
    await js(previousTheme
        ? `document.documentElement.dataset.theme = ${JSON.stringify(previousTheme)}`
        : `delete document.documentElement.dataset.theme`);

    await openTab('general');
    await js(`document.getElementById('btn-settings-close-x').click()`);
}
