/**
 * Settings-panel part of the dev screenshot driver (PIKA_SHOTS=1). Opens the
 * inline settings panel and captures every tab. DOM only — never saves config.
 */

import type { BrowserWindow } from 'electron';

export interface SettingsShotTools {
    js: (expr: string) => Promise<unknown>;
    shot: (name: string) => Promise<void>;
    win: BrowserWindow;
}

export async function captureSettingsShots({ js, shot }: SettingsShotTools): Promise<void> {
    await js(`document.getElementById('btn-settings').click()`);
    await shot('v5-20-settings.png');
    await js(`document.getElementById('btn-settings-close-x').click()`);
}
