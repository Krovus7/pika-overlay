/**
 * Overlay UI — ported from pika-overlay-v3/renderer/overlay.js (743 lines),
 * split into table/ modules (sorting, rowBuilder, dropdown) + settingsPanel.
 * Visual behavior identical to v3.
 */

import { COLUMN_DEFS, type ColumnDef } from '../../src/shared/columns';
import type { RatioColors, RatioThresholds } from '../../src/shared/types';
import type { PlayerStats } from '../../src/shared/types';
import { initSettingsPanel } from './settingsPanel';
import { createDropdowns } from './table/dropdown';
import { buildRow } from './table/rowBuilder';
import { comparePlayers, RANK_PRIORITY } from './table/sorting';
import type { PlayerRow, RenderContext } from './table/types';

const api = window.pikaOverlay;

// ─── State ────────────────────────────────────────────────────────────────────
const players = new Map<string, PlayerRow>(); // key = username.toLowerCase()
let sortCol = 'fkdr';
let sortDir = -1;          // -1 = desc, 1 = asc
let renderPending = false;
let currentInterval = 'total';
let currentMode = 'ALL_MODES';
let partyMembers = new Set<string>(); // lowercased usernames in the party
let currentLayout: 'detailed' | 'compact' = 'detailed';
let compactColumns = new Set<string>(['rank', 'player', 'fkdr', 'winstreak', 'source']);
let pinSelf = false;
let isNicked = false;
let myUsername = '';
let myNickName = '';

let columnOrder = COLUMN_DEFS.map(c => c.id);
let columnEnabled: Record<string, boolean> = {};
COLUMN_DEFS.forEach(c => { columnEnabled[c.id] = true; });

let ratioThresholds: RatioThresholds = {
    fkdr: { hacker: 20.0, godlike: 10.0, good: 3.0, medium: 1.0 },
    kdr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5, medium: 0.75 },
    wlr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5, medium: 0.75 },
};
let ratioColors: RatioColors = { hacker: '#f43f5e', godlike: '#d946ef', good: '#22c55e', medium: '#f59e0b', bad: '#ef4444' };

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const theadRow = document.getElementById('stats-thead-row') as HTMLElement;
const tbody = document.getElementById('stats-body') as HTMLElement;
const emptyState = document.getElementById('empty-state') as HTMLElement;
const statusBadge = document.getElementById('status-badge') as HTMLElement;
const footerCount = document.getElementById('footer-count') as HTMLElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const btnLookup = document.getElementById('btn-lookup') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnMinimize = document.getElementById('btn-minimize') as HTMLButtonElement;
const btnClose = document.getElementById('btn-close') as HTMLButtonElement;
const btnToggleView = document.getElementById('btn-toggle-view') as HTMLButtonElement;

// Low-opacity contrast switcher
const loSwitcher = document.getElementById('lo-switcher') as HTMLElement;
const loBtnDark = document.getElementById('lo-btn-dark') as HTMLButtonElement;
const loBtnLight = document.getElementById('lo-btn-light') as HTMLButtonElement;

const LO_OPACITY_THRESHOLD = 0.15;

// ─── Defensive guard ─────────────────────────────────────────────────────────
// If the preload bridge failed (sandboxed preload without bundling), the UI
// would silently die on the first api call. Show it in the badge instead.
if (!window.pikaOverlay) {
    statusBadge.textContent = 'Preload failed — check DevTools';
    statusBadge.className = 'badge badge-loading';
} else {
    start();
}

function start(): void {
// ─── Bootstrap: load config then build UI ────────────────────────────────────
void api.getAllConfig().then(cfg => {
    applyConfig(cfg);
    dropdowns.applyConfig(cfg);
    buildHeaders();
    scheduleRender();
}).catch(err => {
    console.error('[Overlay] Config load failed:', String(err));
    statusBadge.textContent = 'Config load failed';
    statusBadge.className = 'badge badge-loading';
});

// ─── IPC listeners ───────────────────────────────────────────────────────────
api.onPlayerLoading(({ username, source }) => addLoadingRow(username, source));
api.onPlayerStats(data => updateRow(data));
api.onPlayerError(({ username, source }) => setErrorRow(username, source));
api.onPlayerRemove(username => removeRow(username));
api.onPlayersClear(() => { clearTable(true); setStatus('idle', 'Cleared'); });
api.onGamePregame(() => setStatus('live', 'In queue'));
api.onGameStart(() => { clearTable(true); setStatus('live', 'Game in progress'); });
api.onGameEnd(() => setStatus('idle', 'Game ended'));

api.onPartyUpdate(members => {
    partyMembers = new Set(members);
    scheduleRender();
});

api.onConfigUpdate(cfg => {
    applyConfig(cfg);
    dropdowns.applyConfig(cfg);
    buildHeaders();
    scheduleRender();
});

// ─── Low-opacity contrast mode ────────────────────────────────────────────────
let loMode = localStorage.getItem('loMode') || 'dark';

function applyLoClass(): void {
    document.body.classList.remove('lo-dark', 'lo-light');
    document.body.classList.add(`lo-${loMode}`);
    loBtnDark.classList.toggle('active', loMode === 'dark');
    loBtnLight.classList.toggle('active', loMode === 'light');
}

function updateLoMode(alpha: number): void {
    const isLow = alpha < LO_OPACITY_THRESHOLD;
    loSwitcher.classList.toggle('visible', isLow);
    if (isLow) {
        applyLoClass();
    } else {
        document.body.classList.remove('lo-dark', 'lo-light');
    }
}

loBtnDark.addEventListener('click', () => {
    loMode = 'dark';
    localStorage.setItem('loMode', loMode);
    applyLoClass();
});

loBtnLight.addEventListener('click', () => {
    loMode = 'light';
    localStorage.setItem('loMode', loMode);
    applyLoClass();
});

// ─── Apply config values ──────────────────────────────────────────────────────
function applyConfig(cfg: Record<string, unknown>): void {
    if (!cfg) return;

    if (cfg.overlayMode === 'compact' || cfg.overlayMode === 'detailed') {
        currentLayout = cfg.overlayMode;
        document.body.classList.toggle('layout-compact', currentLayout === 'compact');
        btnToggleView.title = currentLayout === 'compact' ? 'Switch to Detailed layout' : 'Switch to Compact layout';
    }

    myUsername = String(cfg.myUsername || '').toLowerCase();
    pinSelf = !!cfg.pinSelf;
    isNicked = !!cfg.isNicked;
    myNickName = String(cfg.myNickName || '').toLowerCase();

    if (typeof cfg.opacity === 'number') {
        document.documentElement.style.setProperty('--bg-alpha', String(cfg.opacity));
        updateLoMode(cfg.opacity);
    }

    if (typeof cfg.statsInterval === 'string') currentInterval = cfg.statsInterval;
    if (typeof cfg.statsMode === 'string') currentMode = cfg.statsMode;

    const rt = (cfg.ratioThresholds ?? {}) as Record<string, unknown>;
    const ft = (cfg.fkdrThresholds ?? {}) as Record<string, unknown>;
    const isPerRatio = rt.fkdr && typeof rt.fkdr === 'object';
    if (isPerRatio) {
        const fk = rt.fkdr as Record<string, unknown>;
        const kd = (rt.kdr ?? {}) as Record<string, unknown>;
        const wl = (rt.wlr ?? {}) as Record<string, unknown>;
        ratioThresholds = {
            fkdr: {
                hacker: asNum(fk.hacker, 20.0), godlike: asNum(fk.godlike, 10.0),
                good: asNum(fk.good, 3.0), medium: asNum(fk.medium, 1.0),
            },
            kdr: {
                hacker: asNum(kd.hacker, 5.0), godlike: asNum(kd.godlike, 2.5),
                good: asNum(kd.good, 1.5), medium: asNum(kd.medium, 0.75),
            },
            wlr: {
                hacker: asNum(wl.hacker, 5.0), godlike: asNum(wl.godlike, 2.5),
                good: asNum(wl.good, 1.5), medium: asNum(wl.medium, 0.75),
            },
        };
    } else {
        const h = asNum(rt.hacker, 20.0), g = asNum(rt.godlike, 10.0);
        const gd = asNum(rt.good, asNum(ft.good, 3.0)), m = asNum(rt.medium, asNum(ft.medium, 1.0));
        ratioThresholds = {
            fkdr: { hacker: h, godlike: g, good: gd, medium: m },
            kdr:  { hacker: 5.0, godlike: 2.5, good: 1.5, medium: 0.75 },
            wlr:  { hacker: 5.0, godlike: 2.5, good: 1.5, medium: 0.75 },
        };
    }

    const rc = (cfg.ratioColors ?? {}) as Record<string, unknown>;
    ratioColors = {
        hacker: strOr(rc.hacker, '#f43f5e'),
        godlike: strOr(rc.godlike, '#d946ef'),
        good: strOr(rc.good, '#22c55e'),
        medium: strOr(rc.medium, '#f59e0b'),
        bad: strOr(rc.bad, '#ef4444'),
    };

    const savedOrder = Array.isArray(cfg.columnOrder) ? cfg.columnOrder : columnOrder;
    const savedEnabled = (cfg.columnEnabled ?? {}) as Record<string, boolean>;
    const knownIds = COLUMN_DEFS.map(c => c.id);
    const merged = savedOrder.filter(id => knownIds.includes(id));
    knownIds.forEach(id => { if (!merged.includes(id)) merged.push(id); });
    columnOrder = merged;
    columnEnabled = { ...columnEnabled, ...savedEnabled };
    columnEnabled.player = true;

    if (Array.isArray(cfg.compactColumns)) {
        compactColumns = new Set(cfg.compactColumns);
        compactColumns.add('player');
    }
}

function asNum(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function strOr(v: unknown, fallback: string): string {
    return typeof v === 'string' && v ? v : fallback;
}

// ─── UI actions ───────────────────────────────────────────────────────────────
btnLookup.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

btnClear.addEventListener('click', () => void api.clearPlayers());
btnMinimize.addEventListener('click', () => void api.minimizeOverlay());
btnClose.addEventListener('click', () => void api.closeOverlay());

btnToggleView.addEventListener('click', async () => {
    currentLayout = currentLayout === 'compact' ? 'detailed' : 'compact';
    document.body.classList.toggle('layout-compact', currentLayout === 'compact');
    btnToggleView.title = currentLayout === 'compact' ? 'Switch to Detailed layout' : 'Switch to Compact layout';
    await api.setConfig('overlayMode', currentLayout);
    buildHeaders();
    scheduleRender();
});

// ─── Filter dropdowns (Period + Mode) ────────────────────────────────────────
const dropdowns = createDropdowns({
    onPeriodChange: async period => {
        if (period === currentInterval) return;
        currentInterval = period;
        const names = [...players.keys()];
        if (names.length === 0) {
            await api.setStatsInterval(period);
            return;
        }
        clearTable();
        setStatus('loading', 'Updating…');
        await api.refetchAll(names, period, currentMode);
    },
    onModeChange: async mode => {
        if (mode === currentMode) return;
        currentMode = mode;
        const names = [...players.keys()];
        if (names.length === 0) {
            await api.setStatsMode(mode);
            return;
        }
        clearTable();
        setStatus('loading', 'Updating…');
        await api.refetchAll(names, currentInterval, mode);
    },
});

// ─── Search ───────────────────────────────────────────────────────────────────
async function doSearch(): Promise<void> {
    const raw = searchInput.value.trim();
    if (!raw) return;
    searchInput.value = '';

    const names = raw
        .split(/[\n,\s]+/)
        .map(n => n.trim())
        .filter(n => /^[A-Za-z0-9_]{3,16}$/.test(n));

    if (!names.length) return;
    setStatus('loading', 'Searching…');

    if (names.length === 1) {
        await api.lookupPlayer(names[0]!, currentInterval, currentMode);
    } else {
        await api.lookupBulk(names, currentInterval, currentMode);
    }
}

// ─── Table header ─────────────────────────────────────────────────────────────
function buildHeaders(): void {
    theadRow.innerHTML = '';
    const visibleCols = getVisibleCols();

    for (const col of visibleCols) {
        const th = document.createElement('th');
        th.className = col.cls;
        const sortKey = col.sortKey;

        if (sortKey) {
            th.classList.add('sortable');
            th.dataset.col = sortKey;
            th.innerHTML = `${col.label} <span class="sort-arrow">${sortCol === sortKey ? (sortDir === -1 ? '↓' : '↑') : '↕'}</span>`;
            if (sortCol === sortKey) th.classList.add('sorted');
            th.addEventListener('click', () => {
                if (sortCol === sortKey) {
                    sortDir *= -1;
                } else {
                    sortCol = sortKey;
                    sortDir = -1;
                }
                buildHeaders();
                scheduleRender();
            });
        } else {
            th.textContent = col.label;
        }
        theadRow.appendChild(th);
    }
}

function getVisibleCols(): ColumnDef[] {
    const list = columnOrder
        .map(id => COLUMN_DEFS.find(c => c.id === id))
        .filter((col): col is ColumnDef => !!col && columnEnabled[col.id] !== false);

    if (currentLayout === 'compact') {
        return list.filter(col => compactColumns.has(col.id));
    }
    return list;
}

// ─── Table management ─────────────────────────────────────────────────────────
function addLoadingRow(username: string, source: string): void {
    const key = username.toLowerCase();
    if (players.has(key)) return;
    players.set(key, { username, loading: true, source });
    updateFooterAndStatus();
    scheduleRender();
}

function updateRow(data: PlayerStats & { source: string }): void {
    const key = data.username.toLowerCase();
    if (!players.has(key)) return;
    const rankText = data.rank?.text?.toUpperCase() || '';
    const rankSortValue = RANK_PRIORITY[rankText] ?? 0;
    players.set(key, { ...data, loading: false, rankSortValue });
    updateFooterAndStatus();
    scheduleRender();
}

function setErrorRow(username: string, source: string): void {
    const key = username.toLowerCase();
    if (!players.has(key)) return;
    const existing = players.get(key) || { username, source };
    players.set(key, { ...existing, loading: false, error: true });
    updateFooterAndStatus();
    scheduleRender();
}

function removeRow(username: string): void {
    const key = username.toLowerCase();
    if (partyMembers.has(key)) return;
    if (!players.has(key)) return;
    players.delete(key);
    updateFooterAndStatus();
    scheduleRender();
}

function clearTable(keepParty = false): void {
    if (keepParty && partyMembers.size > 0) {
        for (const key of players.keys()) {
            if (!partyMembers.has(key)) players.delete(key);
        }
    } else {
        players.clear();
    }
    updateFooter();
    renderNow();
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function scheduleRender(): void {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
        renderPending = false;
        renderNow();
    });
}

function currentContext(): RenderContext {
    return {
        partyMembers,
        pinSelf,
        myUsername,
        myNickName,
        isNicked,
        ratioThresholds,
        ratioColors,
    };
}

function renderNow(): void {
    const ctx = currentContext();
    const sortState = {
        col: sortCol,
        dir: sortDir,
        pinSelf,
        myUsername,
        myNickName,
        isNicked,
        partyMembers,
    };
    const sorted = [...players.values()].sort((a, b) => comparePlayers(a, b, sortState));
    tbody.innerHTML = '';

    if (!sorted.length) {
        emptyState.style.display = 'flex';
        return;
    }
    emptyState.style.display = 'none';

    const visCols = getVisibleCols();
    const frag = document.createDocumentFragment();
    for (const p of sorted) frag.appendChild(buildRow(p, visCols, ctx));
    tbody.appendChild(frag);
}

// ─── Status / footer ──────────────────────────────────────────────────────────
function setStatus(type: string, text: string): void {
    statusBadge.textContent = text;
    statusBadge.className = `badge badge-${type}`;
}

function updateFooter(): void {
    const n = players.size;
    footerCount.textContent = `${n} player${n === 1 ? '' : 's'}`;
}

function updateFooterAndStatus(): void {
    const n = players.size;
    footerCount.textContent = `${n} player${n === 1 ? '' : 's'}`;
    if (n === 0) {
        setStatus('idle', '0 players');
    } else {
        setStatus('live', `${n} player${n === 1 ? '' : 's'}`);
    }
}

// ─── Settings panel (inline) ──────────────────────────────────────────────────
initSettingsPanel(api);
}
