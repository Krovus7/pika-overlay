import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import { state } from '../core/state';
import { block, button, group, h, row } from './controls';
import { cfgStr, getCfg } from './store';
import type { TabView } from './types';

const SHOWN_LINES = 60;

export function buildDebug(api: PikaOverlayApi): TabView {
    const root = h('div', 's-tab-content');

    const diag = group('Diagnostics');
    const version = h('span', 's-value s-mono');
    const health = h('span', 's-value s-mono');
    const logFound = h('span', 's-value s-mono');
    diag.list.append(
        row('App version', null, version),
        row('API connection', null, health),
        row('Log file', null, logFound),
    );

    const logs = group('Recent log lines', 'The last lines the overlay read from your Minecraft log.');
    const box = h('pre', 's-log');
    box.tabIndex = 0;
    box.setAttribute('aria-label', 'Recent log lines');
    const refresh = button('Refresh', { icon: 'retry' });
    const copy = button('Copy', { icon: 'copy' });
    const note = h('span', 's-inline-note');
    note.setAttribute('role', 'status');
    const actions = h('div', 's-inline s-actions');
    actions.append(refresh, copy, note);
    logs.list.appendChild(block(box, actions));

    async function load(): Promise<void> {
        try {
            const lines = await api.getLogLines();
            box.textContent = lines.length
                ? lines.slice(-SHOWN_LINES).join('\n')
                : 'No lines read yet. Check the log file path in General.';
            box.scrollTop = box.scrollHeight;
        } catch (err) {
            console.error('[Settings] Reading log lines failed:', String(err));
            box.textContent = 'Could not read the log lines.';
        }
    }

    async function diagnostics(): Promise<void> {
        version.textContent = `v${__APP_VERSION__}`;
        health.textContent = state.health.kind;
        const path = cfgStr(getCfg(), 'logPath');
        try {
            logFound.textContent = !path ? 'not set' : (await api.testLogPath(path)) ? 'found' : 'not found';
        } catch (err) {
            console.error('[Settings] Log path check failed:', String(err));
            logFound.textContent = 'check failed';
        }
    }

    function say(text: string): void {
        note.textContent = text;
        window.setTimeout(() => { note.textContent = ''; }, 2000);
    }

    refresh.addEventListener('click', () => void load());
    copy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(box.textContent ?? '');
            say('Copied');
        } catch (err) {
            console.error('[Settings] Copy failed:', String(err));
            say('Could not copy');
        }
    });

    root.append(diag.root, logs.root);

    return {
        id: 'debug',
        root,
        sync() { /* nothing is config-driven here */ },
        show() { void load(); void diagnostics(); },
    };
}
