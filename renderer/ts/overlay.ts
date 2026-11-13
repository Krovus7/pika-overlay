/**
 * Overlay entry point: wires the IPC events and UI controls to the modules
 * in core/, table/, ui/ and demo/. The settings panel initialises itself.
 */

import { applyConfigToState } from './core/config';
import { addLoadingRow, applyResult, clearTable, removeRow, setParty } from './core/players';
import { state } from './core/state';
import { registerDemo } from './demo/demo';
import { initSettingsPanel, notifySettingsConfig } from './settingsPanel';
import { initRowActions } from './table/actions';
import { createDropdowns } from './table/dropdown';
import { buildHeaders, initHeader } from './table/header';
import { renderNow, scheduleRender } from './table/render';
import { applyAppearance, applyLayoutClass } from './ui/appearance';
import { setHealth } from './ui/banner';
import { setGameStatus, showFatal } from './ui/gameStatus';
import { initSearch } from './ui/search';
import { initThemeToggle } from './ui/theme';

const api = window.pikaOverlay;

function logFailure(what: string): (err: unknown) => void {
    return err => console.error(`[Overlay] ${what} failed:`, String(err));
}

function applyConfig(cfg: Record<string, unknown>): void {
    notifySettingsConfig(cfg);
    applyConfigToState(cfg);
    applyAppearance(cfg, api);
    dropdowns.applyConfig(cfg);
    buildHeaders();
    scheduleRender();
}

/** Period/mode changed: the main process re-sends loading + results for every row. */
function filtersChanged(persistWhenEmpty: () => Promise<void>, refetch: () => Promise<void>): void {
    scheduleRender();
    const job = state.players.size === 0 ? persistWhenEmpty() : refetch();
    job.catch(logFailure('Period/mode change'));
}

const dropdowns = createDropdowns({
    onPeriodChange: period => {
        if (period === state.interval) return;
        state.interval = period;
        filtersChanged(() => api.setStatsInterval(period), () => api.refetchAll(period, state.mode));
    },
    onModeChange: mode => {
        if (mode === state.mode) return;
        state.mode = mode;
        filtersChanged(() => api.setStatsMode(mode), () => api.refetchAll(state.interval, mode));
    },
});

function bindControls(): void {
    const click = (id: string, fn: () => void): void =>
        document.getElementById(id)?.addEventListener('click', fn);

    click('btn-clear', () => void api.clearPlayers().catch(logFailure('Clear')));
    click('btn-minimize', () => void api.minimizeOverlay().catch(logFailure('Minimize')));
    click('btn-close', () => void api.closeOverlay().catch(logFailure('Close')));
    click('btn-toggle-view', () => {
        state.layout = state.layout === 'compact' ? 'detailed' : 'compact';
        applyLayoutClass();
        buildHeaders();
        scheduleRender();
        api.setConfig('overlayMode', state.layout).catch(logFailure('Saving layout'));
    });
}

function bindIpc(): void {
    api.onPlayerLoading(({ username, source }) => addLoadingRow(username, source));
    api.onPlayerStats(data => applyResult(data));
    api.onPlayerRemove(removeRow);
    api.onPlayersClear(() => clearTable(true));
    api.onGamePregame(() => setGameStatus('queue', 'In queue'));
    // The pre-game lobby's players are the match's players: the table stays (ADR-0012)
    api.onGameStart(() => setGameStatus('game', 'In game'));
    api.onGameEnd(() => setGameStatus('idle', 'Idle'));
    api.onPartyUpdate(setParty);
    api.onConfigUpdate(applyConfig);
    api.onApiHealth(setHealth);
}

function start(): void {
    initHeader(scheduleRender);
    initRowActions();
    initSearch();
    bindControls();
    initThemeToggle(api);
    bindIpc();
    initSettingsPanel(api);
    registerDemo();

    api.getAllConfig().then(applyConfig).catch(err => {
        logFailure('Config load')(err);
        showFatal('Config load failed');
    });
    api.getApiHealth().then(setHealth).catch(logFailure('Health check'));
    buildHeaders();
    renderNow();
}

// A sandboxed preload that failed to load leaves window.pikaOverlay undefined.
if (!api) showFatal('Preload failed — check DevTools');
else start();
