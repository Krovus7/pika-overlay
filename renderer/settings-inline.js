/* ─── Inline Settings Panel Logic ─────────────────────────────────────────────
 * Runs inside overlay.html alongside overlay.js.
 * Manages open/close, tab switching, column manager, color/threshold editors,
 * debug log viewer, and save/cancel actions.
 * ───────────────────────────────────────────────────────────────────────────── */
/* global pikaOverlay, window, COLUMN_DEFS */
'use strict';

(function () {
    const api = window.pikaOverlay;
    const ALL_COLUMNS = window.COLUMN_DEFS;

    // ─── State (local copy while settings are open) ──────────────────────────
    let _colOrder   = [];
    let _colEnabled = {};
    let _compactCols = new Set(['rank', 'player', 'fkdr', 'winstreak', 'source']);

    // ─── DOM refs ────────────────────────────────────────────────────────────
    const panel           = document.getElementById('settings-panel');
    const logPathInput    = document.getElementById('logPath');
    const myUsernameInput = document.getElementById('myUsername');
    const pinSelfCb       = document.getElementById('pinSelf');
    const isNickedCb      = document.getElementById('isNicked');
    const myNickNameInput = document.getElementById('myNickName');
    const nickNameRow     = document.getElementById('nickNameRow');
    const nickDesc        = document.getElementById('nickDesc');
    const alwaysOnTopCb   = document.getElementById('alwaysOnTop');
    const toggleHotkeyIn  = document.getElementById('toggleHotkey');
    const clearHotkeyIn   = document.getElementById('clearHotkey');
    const opacitySlider   = document.getElementById('opacity');
    const opacityVal      = document.getElementById('opacityVal');
    const debugLog        = document.getElementById('debugLog');
    const logStatus       = document.getElementById('logStatus');
    const columnListEl    = document.getElementById('columnList');
    const compactListEl   = document.getElementById('compactColumnList');

    const btnBrowse     = document.getElementById('btnBrowse');
    const btnTestLog    = document.getElementById('btnTestLog');
    const btnRefreshLog = document.getElementById('btnRefreshLog');
    const btnSave       = document.getElementById('btn-settings-save');
    const btnCancel     = document.getElementById('btn-settings-cancel');
    const btnCloseX     = document.getElementById('btn-settings-close-x');
    const btnSettings   = document.getElementById('btn-settings');

    // Colors
    const colorHacker  = document.getElementById('colorHacker');
    const colorGodlike = document.getElementById('colorGodlike');
    const colorGood    = document.getElementById('colorGood');
    const colorMedium  = document.getElementById('colorMedium');
    const colorBad     = document.getElementById('colorBad');

    const DEFAULT_COLORS = {
        hacker: '#f43f5e', godlike: '#d946ef', good: '#22c55e',
        medium: '#f59e0b', bad:    '#ef4444',
    };

    const COLOR_INPUTS = [
        { input: colorHacker,  cls: 'tier-hacker',  key: 'hacker'  },
        { input: colorGodlike, cls: 'tier-godlike', key: 'godlike' },
        { input: colorGood,    cls: 'tier-good',    key: 'good'    },
        { input: colorMedium,  cls: 'tier-medium',  key: 'medium'  },
        { input: colorBad,     cls: 'tier-bad',     key: 'bad'     },
    ];

    // Per-ratio threshold helpers
    const RATIOS = ['fkdr', 'kdr', 'wlr'];
    const TIERS  = ['hacker', 'godlike', 'good', 'medium'];
    function threshEl(ratio, tier) { return document.getElementById(`thresh-${ratio}-${tier}`); }

    // ─── Public: open / close ────────────────────────────────────────────────
    window._settingsOpen = false;

    window._openSettings = async function () {
        if (window._settingsOpen) return;
        window._settingsOpen = true;
        await loadConfig();
        panel.classList.add('visible');
    };

    window._closeSettings = function () {
        window._settingsOpen = false;
        panel.classList.remove('visible');
    };

    // Wire ⚙ button and IPC event
    btnSettings.addEventListener('click', () => window._openSettings());
    if (api.onSettingsShow) {
        api.onSettingsShow(() => window._openSettings());
    }

    btnCloseX.addEventListener('click',  () => window._closeSettings());
    btnCancel.addEventListener('click',  () => window._closeSettings());

    // ─── Nicked toggle ───────────────────────────────────────────────────────
    isNickedCb.addEventListener('change', () => {
        const show = isNickedCb.checked;
        nickNameRow.style.display = show ? '' : 'none';
        nickDesc.style.display   = show ? '' : 'none';
    });

    // ─── Tab switching ───────────────────────────────────────────────────────
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
            if (btn.dataset.tab === 'debug') loadDebugLog();
        });
    });

    // ─── Ratio sub-tab switching ─────────────────────────────────────────────
    document.querySelectorAll('.settings-ratio-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.settings-ratio-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.settings-ratio-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`panel-${btn.dataset.ratio}`)?.classList.add('active');
        });
    });

    // ─── Color dot sync ──────────────────────────────────────────────────────
    function updateDot(cls, color) {
        document.querySelectorAll('.' + cls).forEach(dot => {
            dot.style.background = color;
            dot.style.boxShadow  = `0 0 6px ${color}99`;
        });
    }

    function syncAllDots() {
        COLOR_INPUTS.forEach(({ input, cls }) => updateDot(cls, input.value));
    }

    COLOR_INPUTS.forEach(({ input, cls }) => {
        input.addEventListener('input', () => updateDot(cls, input.value));
    });

    document.getElementById('btnResetColors')?.addEventListener('click', () => {
        COLOR_INPUTS.forEach(({ input, key, cls }) => {
            input.value = DEFAULT_COLORS[key];
            updateDot(cls, DEFAULT_COLORS[key]);
        });
    });

    // ─── Opacity live preview ────────────────────────────────────────────────
    opacitySlider.addEventListener('input', () => {
        opacityVal.textContent = Math.round(opacitySlider.value * 100) + '%';
    });

    // ─── Browse & Test log path ──────────────────────────────────────────────
    btnBrowse.addEventListener('click', async () => {
        const p = await api.browseLogFile();
        if (p) { logPathInput.value = p; testLogPath(p); }
    });

    btnTestLog.addEventListener('click', () => testLogPath(logPathInput.value.trim()));

    async function testLogPath(p) {
        if (!p) return;
        const ok = await api.testLogPath(p);
        logStatus.textContent = ok ? '✓ File found!' : '✗ File not found. Check the path.';
        logStatus.className   = `settings-status-line ${ok ? 'status-ok' : 'status-err'}`;
    }

    // ─── Debug log viewer ────────────────────────────────────────────────────
    btnRefreshLog?.addEventListener('click', loadDebugLog);

    async function loadDebugLog() {
        const lines = await api.getLogLines();
        if (!lines?.length) {
            debugLog.textContent = '(No lines read yet — check the log path)';
            return;
        }
        debugLog.textContent = lines.slice(-40).join('\n');
        debugLog.scrollTop   = debugLog.scrollHeight;
    }

    // ─── Load config into form ───────────────────────────────────────────────
    async function loadConfig() {
        const cfg = await api.getAllConfig();

        logPathInput.value      = cfg.logPath || '';
        myUsernameInput.value   = cfg.myUsername || '';
        pinSelfCb.checked       = !!cfg.pinSelf;
        isNickedCb.checked      = !!cfg.isNicked;
        myNickNameInput.value   = cfg.myNickName || '';
        // Show/hide nick fields based on saved state
        nickNameRow.style.display = cfg.isNicked ? '' : 'none';
        nickDesc.style.display   = cfg.isNicked ? '' : 'none';
        alwaysOnTopCb.checked   = cfg.alwaysOnTop !== false;
        toggleHotkeyIn.value    = cfg.toggleHotkey || 'F4';
        clearHotkeyIn.value     = cfg.clearHotkey  || '';
        opacitySlider.value     = cfg.opacity ?? 0.92;
        opacityVal.textContent  = Math.round((cfg.opacity ?? 0.92) * 100) + '%';

        // Colors
        const rc = cfg.ratioColors || {};
        colorHacker.value  = rc.hacker  || '#f43f5e';
        colorGodlike.value = rc.godlike || '#d946ef';
        colorGood.value    = rc.good    || '#22c55e';
        colorMedium.value  = rc.medium  || '#f59e0b';
        colorBad.value     = rc.bad     || '#ef4444';
        syncAllDots();

        // Per-ratio thresholds
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
                hacker: rt.hacker ?? 20.0, godlike: rt.godlike ?? 10.0,
                good:   rt.good ?? ft.good ?? 3.0, medium: rt.medium ?? ft.medium ?? 1.0,
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
        const savedOrder   = cfg.columnOrder   || ALL_COLUMNS.map(c => c.id);
        const savedEnabled = cfg.columnEnabled || {};
        const knownIds     = ALL_COLUMNS.map(c => c.id);
        const merged       = savedOrder.filter(id => knownIds.includes(id));
        knownIds.forEach(id => { if (!merged.includes(id)) merged.push(id); });
        _colOrder   = merged;
        _colEnabled = {};
        ALL_COLUMNS.forEach(c => { _colEnabled[c.id] = c.locked || false; });
        _colEnabled = { ..._colEnabled, ...savedEnabled };
        _colEnabled.player = true;

        // Compact columns
        const savedCompact = cfg.compactColumns || ['rank', 'player', 'fkdr', 'winstreak', 'source'];
        _compactCols = new Set(savedCompact);

        renderColumnList();
        renderCompactPicker();
    }

    // ─── Column list (Detailed Mode) ─────────────────────────────────────────
    function renderColumnList() {
        columnListEl.innerHTML = '';
        for (const id of _colOrder) {
            const meta    = ALL_COLUMNS.find(c => c.id === id);
            if (!meta) continue;
            const enabled = _colEnabled[id] !== false;

            const row = document.createElement('div');
            row.className  = 'settings-col-row';
            row.dataset.id = id;
            row.draggable  = !meta.locked;

            row.innerHTML = `
                <span class="settings-col-drag-handle ${meta.locked ? 'settings-col-drag-disabled' : ''}" title="${meta.locked ? 'Always visible' : 'Drag to reorder'}">⠿</span>
                <label class="settings-toggle settings-col-toggle">
                    <input type="checkbox" data-col="${id}" ${enabled ? 'checked' : ''} ${meta.locked ? 'disabled' : ''} />
                    <span class="settings-toggle-knob"></span>
                </label>
                <span class="settings-col-label ${meta.locked ? 'settings-col-label-locked' : ''}">${meta.settingsLabel || meta.label}${meta.locked ? ' <small>(always on)</small>' : ''}</span>
                <div class="settings-col-arrows">
                    <button class="settings-col-btn col-up" data-id="${id}" title="Move up">▲</button>
                    <button class="settings-col-btn col-dn" data-id="${id}" title="Move down">▼</button>
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
            cb.addEventListener('change', () => { _colEnabled[cb.dataset.col] = cb.checked; })
        );

        setupDnD();
    }

    function moveColumn(id, dir) {
        const idx    = _colOrder.indexOf(id);
        if (idx < 0) return;
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= _colOrder.length) return;
        _colOrder.splice(idx, 1);
        _colOrder.splice(newIdx, 0, id);
        renderColumnList();
    }

    // ─── Drag and Drop ───────────────────────────────────────────────────────
    let dragSrc = null;

    function setupDnD() {
        const rows = columnListEl.querySelectorAll('.settings-col-row[draggable="true"]');
        rows.forEach(row => {
            row.addEventListener('dragstart', e => {
                dragSrc = row;
                e.dataTransfer.effectAllowed = 'move';
                row.classList.add('col-dragging');
            });
            row.addEventListener('dragend', () => {
                row.classList.remove('col-dragging');
                columnListEl.querySelectorAll('.settings-col-row').forEach(r => r.classList.remove('col-drag-over'));
            });
            row.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (row !== dragSrc) {
                    columnListEl.querySelectorAll('.settings-col-row').forEach(r => r.classList.remove('col-drag-over'));
                    row.classList.add('col-drag-over');
                }
            });
            row.addEventListener('drop', e => {
                e.preventDefault();
                if (!dragSrc || dragSrc === row) return;
                const srcIdx = _colOrder.indexOf(dragSrc.dataset.id);
                const tgtIdx = _colOrder.indexOf(row.dataset.id);
                _colOrder.splice(srcIdx, 1);
                _colOrder.splice(tgtIdx, 0, dragSrc.dataset.id);
                renderColumnList();
            });
        });
    }

    // ─── Compact Column Picker ───────────────────────────────────────────────
    function renderCompactPicker() {
        if (!compactListEl) return;
        compactListEl.innerHTML = '';

        for (const col of ALL_COLUMNS) {
            const isOn = _compactCols.has(col.id);
            const isLocked = col.id === 'player'; // Player is always visible

            const chip = document.createElement('label');
            chip.className = `settings-compact-chip ${isOn ? 'active' : ''} ${isLocked ? 'locked' : ''}`;
            chip.innerHTML = `
                <input type="checkbox" data-compact-col="${col.id}"
                    ${isOn ? 'checked' : ''} ${isLocked ? 'disabled' : ''} />
                <span class="settings-compact-chip-text">${col.settingsLabel || col.label}</span>
            `;
            compactListEl.appendChild(chip);

            const cb = chip.querySelector('input');
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    _compactCols.add(col.id);
                    chip.classList.add('active');
                } else {
                    _compactCols.delete(col.id);
                    chip.classList.remove('active');
                }
            });
        }
    }

    // ─── Save ────────────────────────────────────────────────────────────────
    btnSave.addEventListener('click', async () => {
        // Read column toggles
        columnListEl.querySelectorAll('input[data-col]').forEach(cb => {
            _colEnabled[cb.dataset.col] = cb.checked;
        });
        _colEnabled.player = true;

        // Read compact column checkboxes
        if (compactListEl) {
            _compactCols = new Set();
            _compactCols.add('player'); // always
            compactListEl.querySelectorAll('input[data-compact-col]').forEach(cb => {
                if (cb.checked) _compactCols.add(cb.dataset.compactCol);
            });
        }

        // Build per-ratio thresholds
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
            myUsername:    myUsernameInput.value.trim(),
            pinSelf:       pinSelfCb.checked,
            isNicked:      isNickedCb.checked,
            myNickName:    myNickNameInput.value.trim(),
            alwaysOnTop:  alwaysOnTopCb.checked,
            toggleHotkey: toggleHotkeyIn.value.trim() || 'F4',
            clearHotkey:  clearHotkeyIn.value.trim()  || '',
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
            columnOrder:    [..._colOrder],
            columnEnabled:  { ..._colEnabled },
            compactColumns: [..._compactCols],
        };

        await api.saveConfig(cfg);
        window._closeSettings();
    });
})();
