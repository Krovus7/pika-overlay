import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import type { UpdateState } from '../../../src/shared/types';
import { block, button, group, h, row, setStatus, toggle, type Tone } from './controls';
import { saveNow } from './saveQueue';
import { cfgBool } from './store';
import type { TabView } from './types';

interface UpdateView { tone: Tone; icon: string; text: string }

function describe(s: UpdateState): UpdateView {
    switch (s.kind) {
        case 'disabled': return { tone: 'warn', icon: 'alert', text: s.message };
        case 'idle': return { tone: 'info', icon: 'clock', text: 'No update check yet.' };
        case 'checking': return { tone: 'info', icon: 'retry', text: 'Checking for updates…' };
        case 'available': return { tone: 'ok', icon: 'download', text: `Version ${s.version} is available.` };
        case 'uptodate': return { tone: 'ok', icon: 'circle-check', text: 'You are on the latest version.' };
        case 'downloading': return { tone: 'info', icon: 'download', text: `Downloading… ${Math.round(s.progress)}%` };
        case 'ready': return { tone: 'ok', icon: 'circle-check', text: `Version ${s.version} downloaded. Restarting…` };
        case 'error': return { tone: 'bad', icon: 'circle-alert', text: `Update failed: ${s.message}` };
    }
}

export interface UpdatesView extends TabView { render(s: UpdateState): void }

export function buildUpdates(api: PikaOverlayApi): UpdatesView {
    const root = h('div', 's-tab-content');
    const status = group('Version');
    status.list.appendChild(row('Installed version', null, h('span', 's-value s-mono', `v${__APP_VERSION__}`)));

    const line = h('div', 's-status');
    line.setAttribute('role', 'status');
    const check = button('Check for updates', { icon: 'retry' });
    const apply = button('Update and restart', { icon: 'download', variant: 'primary' });
    apply.hidden = true;
    const actions = h('div', 's-inline s-actions');
    actions.append(check, apply);
    const bar = h('div', 's-progress');
    const fill = h('div', 's-progress-fill');
    bar.hidden = true;
    bar.appendChild(fill);
    status.list.appendChild(block(line, bar, actions));

    const options = group('Options');
    const auto = toggle(on => void saveNow({ updateAutoCheck: on }));
    options.list.appendChild(row('Check on startup',
        'Looks for a new version when the app starts. It never downloads anything without your click.',
        auto.root, auto.input.id));

    function render(s: UpdateState): void {
        const v = describe(s);
        setStatus(line, v.tone, v.icon, v.text);
        const downloading = s.kind === 'downloading';
        bar.hidden = !downloading;
        if (downloading) fill.style.width = `${s.progress}%`;
        apply.hidden = !(s.kind === 'available' || s.kind === 'ready');
        apply.disabled = downloading;
    }

    async function guarded(job: () => Promise<UpdateState>): Promise<void> {
        try {
            render(await job());
        } catch (err) {
            console.error('[Settings] Update action failed:', String(err));
            setStatus(line, 'bad', 'circle-alert', 'The update action failed. Try again.');
        }
    }

    check.addEventListener('click', async () => {
        check.disabled = true;
        await guarded(() => api.checkForUpdates());
        check.disabled = false;
    });
    apply.addEventListener('click', () => { apply.disabled = true; void guarded(() => api.downloadAndApply()); });

    root.append(status.root, options.root);

    return {
        id: 'updates',
        root,
        render,
        sync(cfg) { auto.input.checked = cfgBool(cfg, 'updateAutoCheck', true); },
        show() { void guarded(() => api.getUpdateState()); },
    };
}
