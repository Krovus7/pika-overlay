import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import { state } from '../core/state';
import { renderHealth, renderKeyTest } from './apiHealthView';
import { block, button, group, h, row, setStatus, svgIcon, textInput } from './controls';
import { saveNow } from './saveQueue';
import { cfgStr } from './store';
import { buildStatusLegend } from './statusLegend';
import type { TabView } from './types';

function steps(): HTMLElement {
    const ol = h('ol', 's-steps');
    const items: Array<[string, string]> = [
        ['/linkaccount', 'in game. This links your Discord account.'],
        ['/apikey', 'in game. Pika sends you your personal key.'],
        ['', 'Paste the key below and press Save key.'],
    ];
    for (const [cmd, text] of items) {
        const li = h('li');
        if (cmd) li.append(h('code', '', cmd), ' ');
        li.append(text);
        ol.appendChild(li);
    }
    return ol;
}

export function buildApi(api: PikaOverlayApi): TabView {
    const root = h('div', 's-tab-content');

    const connection = group('Connection');
    const health = h('div', 's-status s-status-big');
    health.setAttribute('role', 'status');
    connection.list.appendChild(block(health,
        h('p', 's-hint', 'Pika allows 120 requests per minute. Each player costs two, so about 60 players a minute.')));

    const keyGroup = group('API key',
        'Since autumn 2026 the Pika stats API needs a personal key. It is free and takes a minute:');
    keyGroup.root.insertBefore(steps(), keyGroup.list);

    const input = textInput('Paste your key here', true);
    input.type = 'password';
    input.setAttribute('aria-label', 'Pika API key');
    input.classList.add('s-key-input');
    const reveal = button('', { icon: 'eye', variant: 'ghost', title: 'Show key' });
    reveal.setAttribute('aria-label', 'Show key');
    const keyLine = h('div', 's-inline');
    keyLine.append(input, reveal);

    const test = button('Test', { icon: 'radar' });
    const save = button('Save key', { icon: 'check', variant: 'primary' });
    const actions = h('div', 's-inline s-actions');
    actions.append(test, save);
    const testStatus = h('div', 's-status');
    testStatus.setAttribute('role', 'status');
    keyGroup.list.appendChild(block(keyLine, actions, testStatus,
        h('p', 's-hint', 'The key is stored only on this PC, in the app\'s config file. '
            + 'If it leaks, run /apikey reset in game to get a new one.')));

    let savedKey = '';
    const refreshSave = (): void => { save.disabled = input.value.trim() === savedKey; };

    reveal.addEventListener('click', () => {
        const hidden = input.type === 'password';
        input.type = hidden ? 'text' : 'password';
        reveal.title = hidden ? 'Hide key' : 'Show key';
        reveal.setAttribute('aria-label', reveal.title);
        reveal.replaceChildren(svgIcon(hidden ? 'eye-off' : 'eye'));
    });
    input.addEventListener('input', () => { testStatus.replaceChildren(); testStatus.className = 's-status'; refreshSave(); });

    test.addEventListener('click', async () => {
        test.disabled = true;
        setStatus(testStatus, 'info', 'clock', 'Testing…');
        try {
            renderKeyTest(testStatus, await api.testApiKey(input.value.trim()));
        } catch (err) {
            console.error('[Settings] Key test failed:', String(err));
            setStatus(testStatus, 'bad', 'circle-alert', 'The test could not run.');
        } finally {
            test.disabled = false;
        }
    });

    save.addEventListener('click', async () => {
        const value = input.value.trim();
        save.disabled = true;
        if (await saveNow({ apiKey: value })) {
            savedKey = value;
            setStatus(testStatus, 'ok', 'circle-check', value ? 'Key saved. Rows are refreshing.' : 'Key removed.');
        }
        refreshSave();
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !save.disabled) save.click(); });

    root.append(connection.root, keyGroup.root, buildStatusLegend());

    let timer: number | null = null;
    const paintHealth = (): void => renderHealth(health, state.health);

    return {
        id: 'api',
        root,
        sync(cfg) {
            const previous = savedKey;
            savedKey = cfgStr(cfg, 'apiKey');
            if (input.value.trim() === previous) input.value = savedKey;
            refreshSave();
            paintHealth();
        },
        show() {
            paintHealth();
            timer = window.setInterval(paintHealth, 1000);
        },
        hide() {
            if (timer !== null) window.clearInterval(timer);
            timer = null;
        },
    };
}
