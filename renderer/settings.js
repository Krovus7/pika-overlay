/* global pikaOverlay */
'use strict';
const api = window.pikaOverlay;
const ALL_COLUMNS = window.COLUMN_DEFS;

// ─── State ──────────────────────────────────────────────────────────────────
let columnOrder   = ALL_COLUMNS.map(c => c.id);
let columnEnabled = {};
ALL_COLUMNS.forEach(c => { columnEnabled[c.id] = c.locked || false; });

// ─── DOM refs ────────────────────────────────────────────────────────────────
const logPathInput      = document.getElementById('logPath');
const myUsernameInput   = document.getElementById('myUsername');
const alwaysOnTopCb     = document.getElementById('alwaysOnTop');
const toggleHotkeyInput = document.getElementById('toggleHotkey');
const clearHotkeyInput  = document.getElementById('clearHotkey');
const opacitySlider     = document.getElementById('opacity');
const opacityVal        = document.getElementById('opacityVal');
const debugLog          = document.getElementById('debugLog');
const logStatus         = document.getElementById('logStatus');
const columnListEl      = document.getElementById('columnList');

const btnBrowse  = document.getElementById('btnBrowse');
const btnTestLog = document.getElementById('btnTestLog');
const btnRefresh = document.getElementById('btnRefreshLog');
const btnSave    = document.getElementById('btnSave');
const btnCancel  = document.getElementById('btnCancel');

// Colors
const colorHacker  = document.getElementById('colorHacker');
const colorGodlike = document.getElementById('colorGodlike');
const colorGood    = document.getElementById('colorGood');
const colorMedium  = document.getElementById('colorMedium');
const colorBad     = document.getElementById('colorBad');

const DEFAULT_COLORS = {
    hacker:  '#f43f5e',
    godlike: '#d946ef',
    good:    '#22c55e',
    medium:  '#f59e0b',
    bad:     '#ef4444',
};

// Map each color input to its tier CSS class name
const COLOR_INPUTS = [
    { input: colorHacker,  cls: 'tier-hacker',  key: 'hacker'  },
    { input: colorGodlike, cls: 'tier-godlike', key: 'godlike' },
    { input: colorGood,    cls: 'tier-good',    key: 'good'    },
    { input: colorMedium,  cls: 'tier-medium',  key: 'medium'  },
    { input: colorBad,     cls: 'tier-bad',     key: 'bad'     },
];

function updateDot(cls, color) {
    document.querySelectorAll('.' + cls).forEach(dot => {
        dot.style.background  = color;
        dot.style.boxShadow   = `0 0 6px ${color}99`;
    });
}

function syncAllDots() {
    COLOR_INPUTS.forEach(({ input, cls }) => updateDot(cls, input.value));
}

// Live update: dot color changes as user picks
COLOR_INPUTS.forEach(({ input, cls }) => {
    input.addEventListener('input', () => updateDot(cls, input.value));
});

// Reset defaults
document.getElementById('btnResetColors')?.addEventListener('click', () => {
    COLOR_INPUTS.forEach(({ input, key, cls }) => {
        input.value = DEFAULT_COLORS[key];
        updateDot(cls, DEFAULT_COLORS[key]);
    });
});

// Per-ratio threshold inputs
const RATIOS = ['fkdr', 'kdr', 'wlr'];
const TIERS  = ['hacker', 'godlike', 'good', 'medium'];

function threshEl(ratio, tier) {
    return document.getElementById(`thresh-${ratio}-${tier}`);
}

// ─── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
        if (btn.dataset.tab === 'debug') loadDebugLog();
    });
});

// ─── Ratio sub-tab switching ──────────────────────────────────────────────────
document.querySelectorAll('.ratio-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.ratio-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.ratio-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`panel-${btn.dataset.ratio}`)?.classList.add('active');
    });
});

// ─── Load config ──────────────────────────────────────────────────────────────
async function loadConfig() {
    const cfg = await api.getAllConfig();

    logPathInput.value         = cfg.logPath || '';
    myUsernameInput.value      = cfg.myUsername || '';
    alwaysOnTopCb.checked      = cfg.alwaysOnTop !== false;
    toggleHotkeyInput.value    = cfg.toggleHotkey || 'F4';
    clearHotkeyInput.value     = cfg.clearHotkey  || '';
    opacitySlider.value        = cfg.opacity ?? 0.92;
    opacityVal.textContent     = Math.round((cfg.opacity ?? 0.92) * 100) + '%';

    // Colors
    const rc = cfg.ratioColors || {};
    colorHacker.value  = rc.hacker  || '#f43f5e';
    colorGodlike.value = rc.godlike || '#d946ef';
    colorGood.value    = rc.good    || '#22c55e';
    colorMedium.value  = rc.medium  || '#f59e0b';
    colorBad.value     = rc.bad     || '#ef4444';
    syncAllDots(); // update dots to match loaded colors

    // Per-ratio thresholds — support both new per-ratio format and old flat format
    const rt = cfg.ratioThresholds || {};
    const ft = cfg.fkdrThresholds  || {};
    const isPerRatio = rt.fkdr && typeof rt.fkdr === 'object';

    const defaults = {
        fkdr: { hacker: 20.0, godlike: 10.0, good: 3.0,  medium: 1.0  },
        kdr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5,  medium: 0.75 },
        wlr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5,  medium: 0.75 },
    };

    if (isPerRatio) {
        for (const ratio of RATIOS) {
            for (const tier of TIERS) {
                const el = threshEl(ratio, tier);
                if (el) el.value = rt[ratio]?.[tier] ?? defaults[ratio][tier];
            }
        }
    } else {
        const oldVals = {
            hacker:  rt.hacker  ?? 20.0,
            godlike: rt.godlike ?? 10.0,
            good:    rt.good    ?? ft.good   ?? 3.0,
            medium:  rt.medium  ?? ft.medium ?? 1.0,
        };
        for (const tier of TIERS) {
            const el = threshEl('fkdr', tier);
            if (el) el.value = oldVals[tier];
        }
        for (const ratio of ['kdr', 'wlr']) {
            for (const tier of TIERS) {
                const el = threshEl(ratio, tier);
                if (el) el.value = defaults[ratio][tier];
            }
        }
    }

    // Columns
    const savedOrder   = cfg.columnOrder   || columnOrder;
    const savedEnabled = cfg.columnEnabled || columnEnabled;
    const knownIds  = ALL_COLUMNS.map(c => c.id);
    const merged    = savedOrder.filter(id => knownIds.includes(id));
    knownIds.forEach(id => { if (!merged.includes(id)) merged.push(id); });
    columnOrder   = merged;
    columnEnabled = { ...columnEnabled, ...savedEnabled };
    columnEnabled.player = true;

    renderColumnList();
}

loadConfig();

// ─── Opacity live preview ─────────────────────────────────────────────────────
opacitySlider.addEventListener('input', () => {
    opacityVal.textContent = Math.round(opacitySlider.value * 100) + '%';
});

// ─── Browse log file ──────────────────────────────────────────────────────────
btnBrowse.addEventListener('click', async () => {
    const p = await api.browseLogFile();
    if (p) { logPathInput.value = p; testLogPath(p); }
});

// ─── Test log path ────────────────────────────────────────────────────────────
btnTestLog.addEventListener('click', () => testLogPath(logPathInput.value.trim()));

async function testLogPath(p) {
    if (!p) return;
    const ok = await api.testLogPath(p);
    logStatus.textContent = ok ? '✓ File found!' : '✗ File not found. Check the path.';
    logStatus.className   = `status-line ${ok ? 'status-ok' : 'status-err'}`;
}

// ─── Debug log ────────────────────────────────────────────────────────────────
btnRefresh?.addEventListener('click', loadDebugLog);

async function loadDebugLog() {
    const lines = await api.getLogLines();
    if (!lines?.length) {
        debugLog.textContent = '(No lines read yet — check the log path)';
        return;
    }
    debugLog.textContent = lines.slice(-40).join('\n');
    debugLog.scrollTop   = debugLog.scrollHeight;
}

// ─── Column list ──────────────────────────────────────────────────────────────
function renderColumnList() {
    columnListEl.innerHTML = '';
    for (const id of columnOrder) {
        const meta    = ALL_COLUMNS.find(c => c.id === id);
        if (!meta) continue;
        const enabled = columnEnabled[id] !== false;

        const row = document.createElement('div');
        row.className  = 'col-row';
        row.dataset.id = id;
        row.draggable  = !meta.locked;

        row.innerHTML = `
            <span class="col-drag-handle ${meta.locked ? 'col-drag-disabled' : ''}" title="${meta.locked ? 'Always visible' : 'Drag to reorder'}">⠿</span>
            <label class="toggle col-toggle">
                <input type="checkbox" data-col="${id}" ${enabled ? 'checked' : ''} ${meta.locked ? 'disabled' : ''} />
                <span class="toggle-knob"></span>
            </label>
            <span class="col-label ${meta.locked ? 'col-label-locked' : ''}">${meta.label}${meta.locked ? ' <small>(always on)</small>' : ''}</span>
            <div class="col-arrows">
                <button class="col-btn col-up" data-id="${id}" title="Move up">▲</button>
                <button class="col-btn col-dn" data-id="${id}" title="Move down">▼</button>
            </div>
        `;
        columnListEl.appendChild(row);
    }

    columnListEl.querySelectorAll('.col-up').forEach(btn =>
        btn.addEventListener('click', () => moveColumn(btn.dataset.id, -1))
    );
    columnListEl.querySelectorAll('.col-dn').forEach(btn =>
        btn.addEventListener('click', () => moveColumn(btn.dataset.id, 1))
    );
    columnListEl.querySelectorAll('input[data-col]').forEach(cb =>
        cb.addEventListener('change', () => { columnEnabled[cb.dataset.col] = cb.checked; })
    );

    setupDnD();
}

function moveColumn(id, dir) {
    const idx    = columnOrder.indexOf(id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= columnOrder.length) return;
    columnOrder.splice(idx, 1);
    columnOrder.splice(newIdx, 0, id);
    renderColumnList();
}

// ─── Drag-and-drop ────────────────────────────────────────────────────────────
let dragSrc = null;

function setupDnD() {
    const rows = columnListEl.querySelectorAll('.col-row[draggable="true"]');
    rows.forEach(row => {
        row.addEventListener('dragstart', e => {
            dragSrc = row;
            e.dataTransfer.effectAllowed = 'move';
            row.classList.add('col-dragging');
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('col-dragging');
            columnListEl.querySelectorAll('.col-row').forEach(r => r.classList.remove('col-drag-over'));
        });
        row.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (row !== dragSrc) {
                columnListEl.querySelectorAll('.col-row').forEach(r => r.classList.remove('col-drag-over'));
                row.classList.add('col-drag-over');
            }
        });
        row.addEventListener('drop', e => {
            e.preventDefault();
            if (!dragSrc || dragSrc === row) return;
            const srcIdx = columnOrder.indexOf(dragSrc.dataset.id);
            const tgtIdx = columnOrder.indexOf(row.dataset.id);
            columnOrder.splice(srcIdx, 1);
            columnOrder.splice(tgtIdx, 0, dragSrc.dataset.id);
            renderColumnList();
        });
    });
}

// ─── Save ─────────────────────────────────────────────────────────────────────
btnSave.addEventListener('click', async () => {
    columnListEl.querySelectorAll('input[data-col]').forEach(cb => {
        columnEnabled[cb.dataset.col] = cb.checked;
    });
    columnEnabled.player = true;

    const ratioThresholds = {};
    for (const ratio of RATIOS) {
        ratioThresholds[ratio] = {};
        for (const tier of TIERS) {
            const el = threshEl(ratio, tier);
            ratioThresholds[ratio][tier] = parseFloat(el?.value) || 0;
        }
    }

    const cfg = {
        logPath:      logPathInput.value.trim(),
        myUsername:   myUsernameInput.value.trim(),
        alwaysOnTop:  alwaysOnTopCb.checked,
        toggleHotkey: toggleHotkeyInput.value.trim() || 'F4',
        clearHotkey:  clearHotkeyInput.value.trim()  || '',
        opacity:      parseFloat(opacitySlider.value),
        fkdrThresholds: {
            good:   ratioThresholds.fkdr.good,
            medium: ratioThresholds.fkdr.medium,
        },
        ratioThresholds,
        ratioColors: {
            hacker:  colorHacker.value  || '#f43f5e',
            godlike: colorGodlike.value || '#d946ef',
            good:    colorGood.value    || '#22c55e',
            medium:  colorMedium.value  || '#f59e0b',
            bad:     colorBad.value     || '#ef4444',
        },
        columnOrder:   [...columnOrder],
        columnEnabled: { ...columnEnabled },
    };

    await api.saveConfig(cfg);
    api.closeSettings();
});

// ─── Cancel ───────────────────────────────────────────────────────────────────
btnCancel.addEventListener('click', () => api.closeSettings());
document.getElementById('btn-close-settings')?.addEventListener('click', () => api.closeSettings());
