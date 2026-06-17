/* global pikaOverlay, window */
'use strict';

const api = window.pikaOverlay;
const ALL_COLUMNS = window.COLUMN_DEFS; // Loaded from shared/columns.js

// ─── Rank sort priority (higher = better) ─────────────────────────────────────
const RANK_PRIORITY = {
    OWNER: 20, ADMIN: 19, MANAGER: 18,
    SR_MOD: 17, MOD: 16, JR_MOD: 15, HELPER: 14,
    YOUTUBER: 13, MEDIA: 12, BUILDER: 11,
    TITAN: 10, LEGEND: 9, LORD: 8, MVP: 7,
    VIP: 6, PRO: 5, ULTRA: 4,
};

// ─── State ────────────────────────────────────────────────────────────────────
/** @type {Map<string, object>} key = username.toLowerCase() */
const players = new Map();
let sortCol    = 'fkdr';
let sortDir    = -1;          // -1 = desc, 1 = asc
let renderPending = false;
let currentInterval = 'total';   // stat period: total | weekly | monthly | yearly
let currentMode     = 'ALL_MODES'; // game mode: ALL_MODES | SOLO | DOUBLES | QUAD
let partyMembers    = new Set();  // lowercased usernames in the party
let currentLayout   = 'detailed'; // detailed | compact
let compactColumns  = new Set(['rank', 'player', 'fkdr', 'winstreak', 'source']); // configurable compact cols
let pinSelf         = false;      // pin own row to the very top
let isNicked        = false;      // user is playing nicked
let myUsername      = '';         // real username (lowercase)
let myNickName      = '';         // nicked name (lowercase)

// Config-driven state (loaded from settings)
let columnOrder   = ALL_COLUMNS.map(c => c.id);
let columnEnabled = {};
ALL_COLUMNS.forEach(c => { columnEnabled[c.id] = true; });

// Per-ratio thresholds — each ratio has independent tier values
let ratioThresholds = {
    fkdr: { hacker: 20.0, godlike: 10.0, good: 3.0, medium: 1.0 },
    kdr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5, medium: 0.75 },
    wlr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5, medium: 0.75 },
};
let ratioColors = { hacker: '#f43f5e', godlike: '#d946ef', good: '#22c55e', medium: '#f59e0b', bad: '#ef4444' };

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const theadRow      = document.getElementById('stats-thead-row');
const tbody         = document.getElementById('stats-body');
const emptyState    = document.getElementById('empty-state');
const statusBadge   = document.getElementById('status-badge');
const footerCount   = document.getElementById('footer-count');
const searchInput   = document.getElementById('search-input');
const btnLookup     = document.getElementById('btn-lookup');
const btnClear      = document.getElementById('btn-clear');
const btnMinimize   = document.getElementById('btn-minimize');
const btnClose      = document.getElementById('btn-close');
const btnToggleView = document.getElementById('btn-toggle-view');

// Filter dropdown refs
const btnPeriod      = document.getElementById('btn-period');
const btnMode        = document.getElementById('btn-mode');
const periodDropdown = document.getElementById('period-dropdown');
const modeDropdown   = document.getElementById('mode-dropdown');
const periodLabel    = document.getElementById('period-label');
const modeLabelEl    = document.getElementById('mode-label');

// Low-opacity contrast switcher
const loSwitcher  = document.getElementById('lo-switcher');
const loBtnDark   = document.getElementById('lo-btn-dark');
const loBtnLight  = document.getElementById('lo-btn-light');

/** Below this opacity level the lo-mode switcher appears and body gets lo-* class */
const LO_OPACITY_THRESHOLD = 0.15;

const PERIOD_LABELS = {
    total:   'All Time',
    weekly:  'Weekly',
    monthly: 'Monthly',
    yearly:  'Yearly',
};

const MODE_LABELS = {
    ALL_MODES: 'Overall',
    SOLO:      'Solo',
    DOUBLES:   'Duo',
    QUAD:      'Quad',
};

// ─── Bootstrap: load config then build UI ────────────────────────────────────
api.getAllConfig().then(cfg => {
    applyConfig(cfg);
    buildHeaders();
    scheduleRender();
});

// ─── IPC listeners ───────────────────────────────────────────────────────────
api.onPlayerLoading(({ username, source }) => addLoadingRow(username, source));
api.onPlayerStats(data => updateRow(data));
api.onPlayerError(({ username, source }) => setErrorRow(username, source));
api.onPlayerRemove(username => removeRow(username));
api.onPlayersClear(() => { clearTable(true); setStatus('idle', 'Cleared'); });
api.onGamePregame(() => setStatus('live', 'In queue'));
api.onGameStart(() => { clearTable(true);  setStatus('live', 'Game in progress'); });
api.onGameEnd(()   => setStatus('idle', 'Game ended'));

// Party member tracking
if (api.onPartyUpdate) {
    api.onPartyUpdate(members => {
        partyMembers = new Set(members);
        scheduleRender(); // re-render to show/hide party highlights
    });
}

// Live-update when settings are saved
if (api.onConfigUpdate) {
    api.onConfigUpdate(cfg => {
        applyConfig(cfg);
        buildHeaders();
        scheduleRender();
    });
}

// ─── Low-opacity contrast mode ────────────────────────────────────────────────
let _loMode = localStorage.getItem('loMode') || 'dark'; // 'dark' | 'light'

function applyLoClass() {
    document.body.classList.remove('lo-dark', 'lo-light');
    document.body.classList.add(`lo-${_loMode}`);
    loBtnDark.classList.toggle('active',  _loMode === 'dark');
    loBtnLight.classList.toggle('active', _loMode === 'light');
}

function updateLoMode(alpha) {
    const isLow = alpha < LO_OPACITY_THRESHOLD;
    loSwitcher.classList.toggle('visible', isLow);
    if (isLow) {
        applyLoClass();
    } else {
        document.body.classList.remove('lo-dark', 'lo-light');
    }
}

loBtnDark.addEventListener('click', () => {
    _loMode = 'dark';
    localStorage.setItem('loMode', _loMode);
    applyLoClass();
});

loBtnLight.addEventListener('click', () => {
    _loMode = 'light';
    localStorage.setItem('loMode', _loMode);
    applyLoClass();
});

// ─── Apply config values ──────────────────────────────────────────────────────
function applyConfig(cfg) {
    if (!cfg) return;

    // Layout layout-compact vs detailed
    if (cfg.overlayMode) {
        currentLayout = cfg.overlayMode;
        document.body.classList.toggle('layout-compact', currentLayout === 'compact');
        if (btnToggleView) {
            btnToggleView.title = currentLayout === 'compact' ? 'Switch to Detailed layout' : 'Switch to Compact layout';
        }
    }

    // Identity / nick mode
    myUsername  = (cfg.myUsername  || '').toLowerCase();
    pinSelf    = !!cfg.pinSelf;
    isNicked   = !!cfg.isNicked;
    myNickName = (cfg.myNickName || '').toLowerCase();

    // Background opacity — only the background changes, text/stats stay fully opaque
    if (cfg.opacity != null) {
        document.documentElement.style.setProperty('--bg-alpha', cfg.opacity);
        updateLoMode(cfg.opacity);
    }

    // Stats interval
    if (cfg.statsInterval) {
        currentInterval = cfg.statsInterval;
        if (periodLabel) periodLabel.textContent = PERIOD_LABELS[currentInterval] || currentInterval;
        if (periodDropdown) {
            periodDropdown.querySelectorAll('.filter-option').forEach(o =>
                o.classList.toggle('selected', o.dataset.value === currentInterval)
            );
        }
    }

    // Stats mode
    if (cfg.statsMode) {
        currentMode = cfg.statsMode;
        if (modeLabelEl) modeLabelEl.textContent = MODE_LABELS[currentMode] || currentMode;
        if (modeDropdown) {
            modeDropdown.querySelectorAll('.filter-option').forEach(o =>
                o.classList.toggle('selected', o.dataset.value === currentMode)
            );
        }
    }

    // Per-ratio thresholds
    const rt = cfg.ratioThresholds || {};
    const ft = cfg.fkdrThresholds  || {};
    const isPerRatio = rt.fkdr && typeof rt.fkdr === 'object';
    if (isPerRatio) {
        ratioThresholds = {
            fkdr: { hacker: rt.fkdr.hacker ?? 20.0, godlike: rt.fkdr.godlike ?? 10.0, good: rt.fkdr.good ?? 3.0,  medium: rt.fkdr.medium ?? 1.0  },
            kdr:  { hacker: rt.kdr?.hacker  ?? 5.0,  godlike: rt.kdr?.godlike  ?? 2.5,  good: rt.kdr?.good  ?? 1.5, medium: rt.kdr?.medium  ?? 0.75 },
            wlr:  { hacker: rt.wlr?.hacker  ?? 5.0,  godlike: rt.wlr?.godlike  ?? 2.5,  good: rt.wlr?.good  ?? 1.5, medium: rt.wlr?.medium  ?? 0.75 },
        };
    } else {
        const h = rt.hacker  ?? 20.0, g = rt.godlike ?? 10.0,
              gd = rt.good   ?? ft.good   ?? 3.0, m = rt.medium ?? ft.medium ?? 1.0;
        ratioThresholds = {
            fkdr: { hacker: h, godlike: g, good: gd, medium: m },
            kdr:  { hacker: 5.0, godlike: 2.5, good: 1.5, medium: 0.75 },
            wlr:  { hacker: 5.0, godlike: 2.5, good: 1.5, medium: 0.75 },
        };
    }

    const rc = cfg.ratioColors || {};
    ratioColors = {
        hacker:  rc.hacker  || '#f43f5e',
        godlike: rc.godlike || '#d946ef',
        good:    rc.good    || '#22c55e',
        medium:  rc.medium  || '#f59e0b',
        bad:     rc.bad     || '#ef4444',
    };

    // Columns
    const savedOrder   = cfg.columnOrder   || columnOrder;
    const savedEnabled = cfg.columnEnabled || columnEnabled;
    const knownIds     = ALL_COLUMNS.map(c => c.id);
    const merged       = savedOrder.filter(id => knownIds.includes(id));
    knownIds.forEach(id => { if (!merged.includes(id)) merged.push(id); });
    columnOrder   = merged;
    columnEnabled = { ...columnEnabled, ...savedEnabled };
    columnEnabled.player = true;

    // Compact columns
    if (cfg.compactColumns && Array.isArray(cfg.compactColumns)) {
        compactColumns = new Set(cfg.compactColumns);
        compactColumns.add('player'); // always include player
    }
}

// ─── UI actions ───────────────────────────────────────────────────────────────
btnLookup.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

btnClear.addEventListener('click', async () => {
    await api.clearPlayers();
});

btnMinimize.addEventListener('click', () => api.minimizeOverlay());
btnClose.addEventListener('click', () => api.closeOverlay());

btnToggleView.addEventListener('click', async () => {
    currentLayout = currentLayout === 'compact' ? 'detailed' : 'compact';
    document.body.classList.toggle('layout-compact', currentLayout === 'compact');
    btnToggleView.title = currentLayout === 'compact' ? 'Switch to Detailed layout' : 'Switch to Compact layout';
    await api.setConfig('overlayMode', currentLayout);
    buildHeaders();
    scheduleRender();
});

// ─── Filter dropdowns (Period + Mode) ────────────────────────────────────────
let openDropdown = null; // 'period' | 'mode' | null

function positionDropdown(btn, dropdown) {
    const rect = btn.getBoundingClientRect();
    const w = dropdown.offsetWidth || 108;
    dropdown.style.top  = `${rect.bottom + 5}px`;
    dropdown.style.left = `${rect.right - w}px`;
}

function openFilter(which) {
    if (openDropdown === which) { closeFilters(); return; }
    btnPeriod.classList.remove('open');
    btnMode.classList.remove('open');
    periodDropdown.classList.remove('open');
    modeDropdown.classList.remove('open');
    openDropdown = which;
    if (which === 'period') {
        btnPeriod.classList.add('open');
        positionDropdown(btnPeriod, periodDropdown);
        periodDropdown.classList.add('open');
    } else {
        btnMode.classList.add('open');
        positionDropdown(btnMode, modeDropdown);
        modeDropdown.classList.add('open');
    }
}

function closeFilters() {
    openDropdown = null;
    btnPeriod.classList.remove('open');
    btnMode.classList.remove('open');
    periodDropdown.classList.remove('open');
    modeDropdown.classList.remove('open');
}

btnPeriod.addEventListener('click', e => { e.stopPropagation(); openFilter('period'); });
btnMode.addEventListener('click',   e => { e.stopPropagation(); openFilter('mode'); });
document.addEventListener('click', () => closeFilters());

// ─── Period options ───────────────────────────────────────────────────────────
periodDropdown.addEventListener('click', async e => {
    const opt = e.target.closest('.filter-option');
    if (!opt) return;
    const period = opt.dataset.value;
    closeFilters();
    if (period === currentInterval) return;

    currentInterval = period;
    periodLabel.textContent = PERIOD_LABELS[period] || period;
    periodDropdown.querySelectorAll('.filter-option').forEach(o =>
        o.classList.toggle('selected', o.dataset.value === period)
    );

    const names = [...players.keys()];
    if (names.length === 0) {
        await api.setStatsInterval(period);
        return;
    }
    clearTable();
    setStatus('loading', 'Updating…');
    await api.refetchAll(names, period, currentMode);
});

// ─── Mode options ─────────────────────────────────────────────────────────────
modeDropdown.addEventListener('click', async e => {
    const opt = e.target.closest('.filter-option');
    if (!opt) return;
    const mode = opt.dataset.value;
    closeFilters();
    if (mode === currentMode) return;

    currentMode = mode;
    modeLabelEl.textContent = MODE_LABELS[mode] || mode;
    modeDropdown.querySelectorAll('.filter-option').forEach(o =>
        o.classList.toggle('selected', o.dataset.value === mode)
    );

    const names = [...players.keys()];
    if (names.length === 0) {
        await api.setStatsMode(mode);
        return;
    }
    clearTable();
    setStatus('loading', 'Updating…');
    await api.refetchAll(names, currentInterval, mode);
});

// ─── Search ───────────────────────────────────────────────────────────────────
async function doSearch() {
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
        await api.lookupPlayer(names[0], currentInterval, currentMode);
    } else {
        await api.lookupBulk(names, currentInterval, currentMode);
    }
}

// ─── Table header ─────────────────────────────────────────────────────────────
function buildHeaders() {
    theadRow.innerHTML = '';
    const visibleCols = getVisibleCols();

    for (const col of visibleCols) {
        const th = document.createElement('th');
        th.className = col.cls;

        if (col.sortKey) {
            th.classList.add('sortable');
            th.dataset.col = col.sortKey;
            th.innerHTML = `${col.label} <span class="sort-arrow">${sortCol === col.sortKey ? (sortDir === -1 ? '↓' : '↑') : '↕'}</span>`;
            if (sortCol === col.sortKey) th.classList.add('sorted');
            th.addEventListener('click', () => {
                if (sortCol === col.sortKey) {
                    sortDir *= -1;
                } else {
                    sortCol = col.sortKey;
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

function getVisibleCols() {
    const list = columnOrder
        .map(id => ALL_COLUMNS.find(c => c.id === id))
        .filter(col => col && columnEnabled[col.id] !== false);
    
    if (currentLayout === 'compact') {
        return list.filter(col => compactColumns.has(col.id));
    }
    return list;
}

// ─── Table management ─────────────────────────────────────────────────────────
function addLoadingRow(username, source) {
    const key = username.toLowerCase();
    if (players.has(key)) return;
    players.set(key, { username, loading: true, source });
    updateFooterAndStatus();
    scheduleRender();
}

function updateRow(data) {
    const key = data.username.toLowerCase();
    if (!players.has(key)) return;
    const rankText = data.rank?.text?.toUpperCase() || '';
    const rankSortValue = RANK_PRIORITY[rankText] ?? 0;
    players.set(key, { ...data, loading: false, rankSortValue });
    updateFooterAndStatus();
    scheduleRender();
}

function setErrorRow(username, source) {
    const key = username.toLowerCase();
    if (!players.has(key)) return;
    const existing = players.get(key) || { username, source };
    players.set(key, { ...existing, loading: false, error: true });
    updateFooterAndStatus();
    scheduleRender();
}

function removeRow(username) {
    const key = username.toLowerCase();
    if (partyMembers.has(key)) return;
    if (!players.has(key)) return;
    players.delete(key);
    updateFooterAndStatus();
    scheduleRender();
}

function clearTable(keepParty = false) {
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
function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
        renderPending = false;
        renderNow();
    });
}

function renderNow() {
    const sorted = [...players.values()].sort(comparePlayers);
    tbody.innerHTML = '';

    if (!sorted.length) {
        emptyState.style.display = 'flex';
        return;
    }
    emptyState.style.display = 'none';

    const visCols = getVisibleCols();
    const frag = document.createDocumentFragment();
    for (const p of sorted) frag.appendChild(buildRow(p, visCols));
    tbody.appendChild(frag);
}

function comparePlayers(a, b) {
    // Self pinned to the very top (above party, above everything)
    if (pinSelf && myUsername) {
        const selfKey = isNicked && myNickName ? myNickName : myUsername;
        const aSelf = a.username?.toLowerCase() === selfKey;
        const bSelf = b.username?.toLowerCase() === selfKey;
        if (aSelf && !bSelf) return -1;
        if (!aSelf && bSelf) return 1;
    }

    // Party members always on top
    const aParty = partyMembers.size > 0 && partyMembers.has(a.username?.toLowerCase());
    const bParty = partyMembers.size > 0 && partyMembers.has(b.username?.toLowerCase());
    if (aParty && !bParty) return -1;
    if (!aParty && bParty) return 1;

    // Nicked players next (below party, above everyone else)
    const aNicked = !!a.nicked;
    const bNicked = !!b.nicked;
    if (aNicked && !bNicked) return -1;
    if (!aNicked && bNicked) return 1;

    if (a.loading && !b.loading) return 1;
    if (!a.loading && b.loading) return -1;
    if (a.error && !b.error)   return 1;
    if (!a.error && b.error)   return -1;

    const aVal = a[sortCol] ?? -1;
    const bVal = b[sortCol] ?? -1;
    return sortDir * (bVal - aVal);
}

// ─── Suspect detection ────────────────────────────────────────────────────────
function isSuspect(p) {
    if (p.loading || p.error || p.notFound) return false;
    return (
        (p.level === 1 || p.level === 0) &&
        (p.finalKills  ?? 0) === 0 &&
        (p.kills       ?? 0) === 0 &&
        (p.wins        ?? 0) === 0
    );
}

// ─── Display name resolver ────────────────────────────────────────────────────
// When the user is nicked, replace their nick with their real name in the overlay
function displayName(p) {
    if (isNicked && myNickName && myUsername && p.username.toLowerCase() === myNickName) {
        // Capitalise the real username properly (use stored cfg value)
        return myUsername.charAt(0).toUpperCase() + myUsername.slice(1);
    }
    return p.username;
}

// ─── Row builder ─────────────────────────────────────────────────────────────
function buildRow(p, visCols) {
    const tr  = document.createElement('tr');
    const vis = visCols || getVisibleCols();
    const colSpan = vis.length;
    const dName = displayName(p);

    if (p.loading) {
        tr.className = 'row-loading';
        const cells = vis.map((col, i) => {
            if (i === 0) return `<td>—</td>`;
            if (col.id === 'player') return `<td><span class="spinner"></span>${esc(dName)}</td>`;
            if (i === 2 || (colSpan <= 2 && i === colSpan - 1)) {
                return `<td colspan="${Math.max(1, colSpan - 2)}" class="muted-italic">Loading…</td>`;
            }
            return null;
        }).filter(Boolean);
        tr.innerHTML = cells.join('');
        return tr;
    }

    if (p.notFound) {
        const key = p.username.toLowerCase();
        const isPartyRow = partyMembers.size > 0 && partyMembers.has(key);
        const playerIsNicked   = !!p.nicked;
        const isApiOff   = !!p.apiOff;

        tr.className = playerIsNicked ? 'row-nicked' : 'row-notfound';
        if (isPartyRow) tr.classList.add('row-party');
        
        const hasSource  = vis.some(c => c.id === 'source');
        const innerSpan  = vis.length - 2 - (hasSource ? 1 : 0);

        let statusMsg, statusIcon;
        if (playerIsNicked) {
            statusIcon = '🎭';
            statusMsg  = `<span class="nicked-alert">NICKED</span>`;
        } else if (isApiOff) {
            statusIcon = '🔒';
            statusMsg  = 'API Off';
        } else {
            statusIcon = '🔒';
            statusMsg  = 'Private / no data';
        }

        const nameBadge = isPartyRow ? '<span class="party-badge" title="Party member">♦</span>'
                        : playerIsNicked  ? `<span class="nicked-badge" title="Likely nicked">${statusIcon}</span>`
                        : '';

        const cells = [
            `<td>—</td>`,
            `<td class="player-name">${nameBadge}${esc(dName)}</td>`,
            ...(innerSpan > 0 ? [`<td colspan="${innerSpan}" class="${playerIsNicked ? 'nicked-msg' : 'notfound-msg'}">${playerIsNicked ? '' : statusIcon + ' '}${statusMsg}</td>`] : []),
            ...(hasSource    ? [`<td>${srcBadge(p.source)}</td>`] : []),
        ];
        tr.innerHTML = cells.join('');
        return tr;
    }

    if (p.error) {
        const key = p.username.toLowerCase();
        const isPartyRow = partyMembers.size > 0 && partyMembers.has(key);
        tr.className = 'row-error';
        if (isPartyRow) tr.classList.add('row-party');
        
        const hasSource  = vis.some(c => c.id === 'source');
        const innerSpan  = vis.length - 2 - (hasSource ? 1 : 0);
        const cells = [
            `<td>—</td>`,
            `<td>${isPartyRow ? '<span class="party-badge" title="Party member">♦</span>' : ''}${esc(dName)}</td>`,
            ...(innerSpan > 0 ? [`<td colspan="${innerSpan}" class="error-msg">⚠ API blocked/err</td>`] : []),
            ...(hasSource    ? [`<td>${srcBadge(p.source)}</td>`] : []),
        ];
        tr.innerHTML = cells.join('');
        return tr;
    }

    if (isSuspect(p)) tr.classList.add('row-suspect');

    const isInParty = partyMembers.size > 0 && partyMembers.has(p.username.toLowerCase());
    if (isInParty) tr.classList.add('row-party');

    const cells = vis.map(col => {
        switch (col.id) {
            case 'rank':
                return `<td class="col-rank">${buildRankCell(p)}</td>`;
            case 'player':
                return `<td class="player-name">${isInParty ? '<span class="party-badge" title="Party member">♦</span>' : ''}${esc(dName)}</td>`;
            case 'guild':
                return `<td class="val-dim guild-cell" title="${esc(p.guild || '')}">${esc(p.guild || '—')}</td>`;
            case 'fkdr':
                return `<td style="color:${ratioColor(p.fkdr,'fkdr')};font-weight:600">${fmt(p.fkdr)}</td>`;
            case 'finals':
                return `<td class="val-dim">${p.finalKills ?? '—'}</td>`;
            case 'kdr':
                return `<td style="color:${ratioColor(p.kdr,'kdr')};font-weight:600">${fmt(p.kdr)}</td>`;
            case 'wlr':
                return `<td style="color:${ratioColor(p.wlr,'wlr')};font-weight:600">${fmt(p.wlr)}</td>`;
            case 'wins':
                return `<td class="val-dim">${p.wins ?? '—'}</td>`;
            case 'beds':
                return `<td class="val-dim">${p.bedsDestroyed ?? '—'}</td>`;
            case 'winstreak':
                return `<td class="val-dim">${p.winstreak ?? '—'}</td>`;
            case 'kills':
                return `<td class="val-dim">${p.kills ?? '—'}</td>`;
            case 'deaths':
                return `<td class="val-dim">${p.deaths ?? '—'}</td>`;
            case 'bowkills':
                return `<td class="val-dim">${p.bowKills ?? '—'}</td>`;
            case 'source':
                return `<td>${srcBadge(p.source)}</td>`;
            default:
                return `<td class="val-dim">—</td>`;
        }
    });

    tr.innerHTML = cells.join('');
    return tr;
}

function buildRankCell(p) {
    const parts = [];
    if (p.level != null && p.level > 0) {
        parts.push(`<span class="level-tag">Lv.${p.level}</span>`);
    }
    if (p.rank?.text) {
        const bg  = hexWithAlpha(p.rank.color, 0.22);
        const col = p.rank.color;
        parts.push(`<span class="rank-tag" style="background:${bg};color:${col}">${esc(p.rank.text)}</span>`);
    }
    return parts.length ? parts.join('') : `<span class="val-dim">—</span>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ratioColor(v, ratioKey) {
    if (v == null) return ratioColors.bad;
    const t = (ratioKey && ratioThresholds[ratioKey]) || ratioThresholds.fkdr;
    if (v >= t.hacker)  return ratioColors.hacker;
    if (v >= t.godlike) return ratioColors.godlike;
    if (v >= t.good)    return ratioColors.good;
    if (v >= t.medium)  return ratioColors.medium;
    return ratioColors.bad;
}

function fmt(v) {
    if (v == null) return '—';
    return Number(v).toFixed(2);
}

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]);
}

function srcBadge(src) {
    if (!src) return '';
    let cls, label, icon;
    switch (src) {
        case 'manual':    cls = 'src-manual';  label = 'Search'; icon = '🔍'; break;
        case 'bulk':      cls = 'src-bulk';    label = 'Paste';  icon = '📋'; break;
        case 'tab_list':  cls = 'src-log';     label = 'Tab';    icon = '📋'; break;
        case 'join':      cls = 'src-log';     label = 'Join';   icon = '📥'; break;
        case 'kill_feed': cls = 'src-log';     label = 'Kill';   icon = '⚔';  break;
        case 'bed_break': cls = 'src-log';     label = 'Bed';    icon = '🛏';  break;
        case 'party':     cls = 'src-party';   label = 'Party';  icon = '♦';  break;
        default:          cls = 'src-log';     label = 'Auto';   icon = '🤖'; break;
    }
    return `<span class="src-badge ${cls}" title="${label}">${icon} ${label}</span>`;
}

function hexWithAlpha(hex, alpha) {
    if (!hex || hex.length < 7) return `rgba(170,170,170,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function setStatus(type, text) {
    statusBadge.textContent = text;
    statusBadge.className   = `badge badge-${type}`;
}

function updateFooter() {
    const n = players.size;
    footerCount.textContent = `${n} player${n === 1 ? '' : 's'}`;
}

function updateFooterAndStatus() {
    const n = players.size;
    footerCount.textContent = `${n} player${n === 1 ? '' : 's'}`;
    if (n === 0) {
        setStatus('idle', '0 players');
    } else {
        setStatus('live', `${n} player${n === 1 ? '' : 's'}`);
    }
}
