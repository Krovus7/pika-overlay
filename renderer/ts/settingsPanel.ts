/**
 * Inline settings panel — ported 1:1 from
 * pika-overlay-v3/renderer/settings-inline.js. Runs inside overlay.html.
 * (Markup/behavior redesign is Task 11; this port keeps v3 behavior.)
 */

import { COLUMN_DEFS } from '../../src/shared/columns';
import type { PikaOverlayApi } from '../../src/shared/preload-api';
import type { UpdateState } from '../../src/shared/types';

const DEFAULT_COLORS: Record<string, string> = {
    hacker: '#f43f5e', godlike: '#d946ef', good: '#22c55e',
    medium: '#f59e0b', bad: '#ef4444',
};

const RATIOS = ['fkdr', 'kdr', 'wlr'];
const TIERS = ['hacker', 'godlike', 'good', 'medium'];

export function initSettingsPanel(api: PikaOverlayApi): void {
    const panel = document.getElementById('settings-panel') as HTMLElement;
    if (!panel) return;

    // ─── State (local copy while settings are open) ──────────────────────────
    let colOrder: string[] = [];
    let colEnabled: Record<string, boolean> = {};
    let compactCols = new Set<string>(['rank', 'player', 'fkdr', 'winstreak', 'source']);
    let settingsOpen = false;

    // ─── DOM refs ────────────────────────────────────────────────────────────
    const logPathInput = document.getElementById('logPath') as HTMLInputElement;
    const myUsernameInput = document.getElementById('myUsername') as HTMLInputElement;
    const pinSelfCb = document.getElementById('pinSelf') as HTMLInputElement;
    const isNickedCb = document.getElementById('isNicked') as HTMLInputElement;
    const myNickNameInput = document.getElementById('myNickName') as HTMLInputElement;
    const nickNameRow = document.getElementById('nickNameRow') as HTMLElement;
    const nickDesc = document.getElementById('nickDesc') as HTMLElement;
    const alwaysOnTopCb = document.getElementById('alwaysOnTop') as HTMLInputElement;
    const toggleHotkeyIn = document.getElementById('toggleHotkey') as HTMLInputElement;
    const clearHotkeyIn = document.getElementById('clearHotkey') as HTMLInputElement;
    const opacitySlider = document.getElementById('opacity') as HTMLInputElement;
    const opacityVal = document.getElementById('opacityVal') as HTMLElement;
    const debugLog = document.getElementById('debugLog') as HTMLElement;
    const logStatus = document.getElementById('logStatus') as HTMLElement;
    const columnListEl = document.getElementById('columnList') as HTMLElement;
    const compactListEl = document.getElementById('compactColumnList') as HTMLElement;

    const btnBrowse = document.getElementById('btnBrowse') as HTMLButtonElement;
    const btnTestLog = document.getElementById('btnTestLog') as HTMLButtonElement;
    const btnRefreshLog = document.getElementById('btnRefreshLog') as HTMLButtonElement;
    const btnSave = document.getElementById('btn-settings-save') as HTMLButtonElement;
    const btnCancel = document.getElementById('btn-settings-cancel') as HTMLButtonElement;
    const btnCloseX = document.getElementById('btn-settings-close-x') as HTMLButtonElement;
    const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
    const saveStatus = document.getElementById('settings-save-status') as HTMLElement;

    const colorHacker = document.getElementById('colorHacker') as HTMLInputElement;
    const colorGodlike = document.getElementById('colorGodlike') as HTMLInputElement;
    const colorGood = document.getElementById('colorGood') as HTMLInputElement;
    const colorMedium = document.getElementById('colorMedium') as HTMLInputElement;
    const colorBad = document.getElementById('colorBad') as HTMLInputElement;

    const COLOR_INPUTS = [
        { input: colorHacker,  cls: 'tier-hacker',  key: 'hacker'  },
        { input: colorGodlike, cls: 'tier-godlike', key: 'godlike' },
        { input: colorGood,    cls: 'tier-good',    key: 'good'    },
        { input: colorMedium,  cls: 'tier-medium',  key: 'medium'  },
        { input: colorBad,     cls: 'tier-bad',     key: 'bad'     },
    ];

    const threshEl = (ratio: string, tier: string): HTMLInputElement =>
        document.getElementById(`thresh-${ratio}-${tier}`) as HTMLInputElement;

    // ─── Open / close ────────────────────────────────────────────────────────
    async function openSettings(): Promise<void> {
        if (settingsOpen) return;
        settingsOpen = true;
        await loadConfig();
        panel.classList.add('visible');
    }

    function closeSettings(): void {
        settingsOpen = false;
        panel.classList.remove('visible');
    }

    btnSettings.addEventListener('click', () => void openSettings());
    api.onSettingsShow(() => void openSettings());
    btnCloseX.addEventListener('click', closeSettings);
    btnCancel.addEventListener('click', closeSettings);

    // ─── Nicked toggle ───────────────────────────────────────────────────────
    isNickedCb.addEventListener('change', () => {
        const show = isNickedCb.checked;
        nickNameRow.style.display = show ? '' : 'none';
        nickDesc.style.display = show ? '' : 'none';
    });

    // ─── Tab switching ───────────────────────────────────────────────────────
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${(btn as HTMLElement).dataset.tab}`)?.classList.add('active');
            const tab = (btn as HTMLElement).dataset.tab;
            if (tab === 'debug') void loadDebugLog();
            if (tab === 'updates') void refreshUpdateView();
        });
    });

    // ─── Save status feedback ────────────────────────────────────────────────
    let saveStatusTimer: ReturnType<typeof setTimeout> | null = null;
    function showSaveStatus(text: string, ok: boolean): void {
        if (saveStatusTimer) clearTimeout(saveStatusTimer);
        saveStatus.textContent = text;
        saveStatus.className = `settings-save-status show status-${ok ? 'ok' : 'err'}`;
        saveStatusTimer = setTimeout(() => saveStatus.classList.remove('show'), 2500);
    }

    // ─── Updates tab (Velopack) ──────────────────────────────────────────────
    const updateStatus = document.getElementById('updateStatus') as HTMLElement;
    const btnUpdateCheck = document.getElementById('btnUpdateCheck') as HTMLButtonElement;
    const btnUpdateApply = document.getElementById('btnUpdateApply') as HTMLButtonElement;
    const updateProgressWrap = document.getElementById('updateProgressWrap') as HTMLElement;
    const updateProgressBar = document.getElementById('updateProgressBar') as HTMLElement;
    const updateAutoCheckCb = document.getElementById('updateAutoCheck') as HTMLInputElement;

    function renderUpdateState(s: UpdateState): void {
        updateStatus.className = 'settings-status-line';
        switch (s.kind) {
            case 'disabled':
                updateStatus.textContent = s.message;
                updateStatus.className = 'settings-status-line status-err';
                break;
            case 'idle':
                updateStatus.textContent = 'No update check yet.';
                break;
            case 'checking':
                updateStatus.textContent = 'Checking for updates…';
                break;
            case 'available':
                updateStatus.textContent = `Update available: v${s.version}`;
                updateStatus.className = 'settings-status-line status-ok';
                break;
            case 'uptodate':
                updateStatus.textContent = 'You are up to date.';
                updateStatus.className = 'settings-status-line status-ok';
                break;
            case 'downloading':
                updateStatus.textContent = `Downloading… ${Math.round(s.progress)}%`;
                break;
            case 'ready':
                updateStatus.textContent = `Downloaded v${s.version} — restarting…`;
                updateStatus.className = 'settings-status-line status-ok';
                break;
            case 'error':
                updateStatus.textContent = `Update error: ${s.message}`;
                updateStatus.className = 'settings-status-line status-err';
                break;
        }
        const downloading = s.kind === 'downloading';
        updateProgressWrap.style.display = downloading ? '' : 'none';
        if (downloading) updateProgressBar.style.width = `${s.progress}%`;
        const showApply = s.kind === 'available' || s.kind === 'ready';
        btnUpdateApply.style.display = showApply ? '' : 'none';
        btnUpdateApply.disabled = false;
        btnUpdateApply.textContent = '⬇ Update & restart';
    }

    async function refreshUpdateView(): Promise<void> {
        updateAutoCheckCb.checked = !!(await api.getConfig('updateAutoCheck'));
        renderUpdateState(await api.getUpdateState());
    }

    btnUpdateCheck.addEventListener('click', async () => {
        btnUpdateCheck.disabled = true;
        renderUpdateState(await api.checkForUpdates());
        btnUpdateCheck.disabled = false;
    });

    btnUpdateApply.addEventListener('click', () => {
        btnUpdateApply.disabled = true;
        btnUpdateApply.textContent = '⬇ Downloading…';
        void api.downloadAndApply();
    });

    // Live updates pushed from main while the panel is open
    api.onUpdateState(s => renderUpdateState(s));

    // ─── Ratio sub-tab switching ─────────────────────────────────────────────
    document.querySelectorAll('.settings-ratio-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.settings-ratio-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.settings-ratio-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`panel-${(btn as HTMLElement).dataset.ratio}`)?.classList.add('active');
        });
    });

    // ─── Color dot sync ──────────────────────────────────────────────────────
    function updateDot(cls: string, color: string): void {
        document.querySelectorAll('.' + cls).forEach(dot => {
            (dot as HTMLElement).style.background = color;
            (dot as HTMLElement).style.boxShadow = `0 0 6px ${color}99`;
        });
    }

    function syncAllDots(): void {
        COLOR_INPUTS.forEach(({ input, cls }) => updateDot(cls, input.value));
    }

    COLOR_INPUTS.forEach(({ input, cls }) => {
        input.addEventListener('input', () => updateDot(cls, input.value));
    });

    document.getElementById('btnResetColors')?.addEventListener('click', () => {
        COLOR_INPUTS.forEach(({ input, key, cls }) => {
            input.value = DEFAULT_COLORS[key]!;
            updateDot(cls, DEFAULT_COLORS[key]!);
        });
    });

    // ─── Opacity live preview ────────────────────────────────────────────────
    opacitySlider.addEventListener('input', () => {
        opacityVal.textContent = Math.round(parseFloat(opacitySlider.value) * 100) + '%';
    });

    // ─── Browse & Test log path ──────────────────────────────────────────────
    btnBrowse.addEventListener('click', async () => {
        const p = await api.browseLogFile();
        if (p) { logPathInput.value = p; await testLogPath(p); }
    });

    btnTestLog.addEventListener('click', () => void testLogPath(logPathInput.value.trim()));

    async function testLogPath(p: string): Promise<void> {
        if (!p) return;
        const ok = await api.testLogPath(p);
        logStatus.textContent = ok ? '✓ File found!' : '✗ File not found. Check the path.';
        logStatus.className = `settings-status-line ${ok ? 'status-ok' : 'status-err'}`;
    }

    // ─── Debug log viewer ────────────────────────────────────────────────────
    btnRefreshLog?.addEventListener('click', () => void loadDebugLog());

    async function loadDebugLog(): Promise<void> {
        const lines = await api.getLogLines();
        if (!lines?.length) {
            debugLog.textContent = '(No lines read yet — check the log path)';
            return;
        }
        debugLog.textContent = lines.slice(-40).join('\n');
        debugLog.scrollTop = debugLog.scrollHeight;
    }

    // ─── Load config into form ───────────────────────────────────────────────
    async function loadConfig(): Promise<void> {
        const cfg = await api.getAllConfig();

        logPathInput.value = String(cfg.logPath || '');
        myUsernameInput.value = String(cfg.myUsername || '');
        pinSelfCb.checked = !!cfg.pinSelf;
        isNickedCb.checked = !!cfg.isNicked;
        myNickNameInput.value = String(cfg.myNickName || '');
        nickNameRow.style.display = cfg.isNicked ? '' : 'none';
        nickDesc.style.display = cfg.isNicked ? '' : 'none';
        alwaysOnTopCb.checked = cfg.alwaysOnTop !== false;
        toggleHotkeyIn.value = String(cfg.toggleHotkey || 'F4');
        clearHotkeyIn.value = String(cfg.clearHotkey || '');
        updateAutoCheckCb.checked = !!cfg.updateAutoCheck;
        opacitySlider.value = String(cfg.opacity ?? 0.92);
        opacityVal.textContent = Math.round(Number(cfg.opacity ?? 0.92) * 100) + '%';

        const rc = (cfg.ratioColors ?? {}) as Record<string, unknown>;
        colorHacker.value = String(rc.hacker || '#f43f5e');
        colorGodlike.value = String(rc.godlike || '#d946ef');
        colorGood.value = String(rc.good || '#22c55e');
        colorMedium.value = String(rc.medium || '#f59e0b');
        colorBad.value = String(rc.bad || '#ef4444');
        syncAllDots();

        const rt = (cfg.ratioThresholds ?? {}) as Record<string, unknown>;
        const ft = (cfg.fkdrThresholds ?? {}) as Record<string, unknown>;
        const defaults: Record<string, Record<string, number>> = {
            fkdr: { hacker: 20.0, godlike: 10.0, good: 3.0, medium: 1.0 },
            kdr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5, medium: 0.75 },
            wlr:  { hacker: 5.0,  godlike: 2.5,  good: 1.5, medium: 0.75 },
        };

        if (rt.fkdr && typeof rt.fkdr === 'object') {
            for (const ratio of RATIOS) {
                const panel = (rt[ratio] ?? {}) as Record<string, unknown>;
                for (const tier of TIERS) {
                    const el = threshEl(ratio, tier);
                    if (el) el.value = String(panel[tier] ?? defaults[ratio]![tier]);
                }
            }
        } else {
            const oldVals: Record<string, number> = {
                hacker: numOr(rt.hacker, 20.0), godlike: numOr(rt.godlike, 10.0),
                good: numOr(rt.good, numOr(ft.good, 3.0)), medium: numOr(rt.medium, numOr(ft.medium, 1.0)),
            };
            for (const tier of TIERS) {
                const el = threshEl('fkdr', tier);
                if (el) el.value = String(oldVals[tier]);
            }
            for (const ratio of ['kdr', 'wlr']) {
                for (const tier of TIERS) {
                    const el = threshEl(ratio, tier);
                    if (el) el.value = String(defaults[ratio]![tier]);
                }
            }
        }

        const savedOrder = Array.isArray(cfg.columnOrder) ? cfg.columnOrder : COLUMN_DEFS.map(c => c.id);
        const savedEnabled = (cfg.columnEnabled ?? {}) as Record<string, boolean>;
        const knownIds = COLUMN_DEFS.map(c => c.id);
        const merged = savedOrder.filter(id => knownIds.includes(id));
        knownIds.forEach(id => { if (!merged.includes(id)) merged.push(id); });
        colOrder = merged;
        colEnabled = {};
        COLUMN_DEFS.forEach(c => { colEnabled[c.id] = c.locked || false; });
        colEnabled = { ...colEnabled, ...savedEnabled };
        colEnabled.player = true;

        const savedCompact = Array.isArray(cfg.compactColumns)
            ? cfg.compactColumns
            : ['rank', 'player', 'fkdr', 'winstreak', 'source'];
        compactCols = new Set(savedCompact);

        renderColumnList();
        renderCompactPicker();
    }

    function numOr(v: unknown, fallback: number): number {
        return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    }

    // ─── Column list (Detailed Mode) ─────────────────────────────────────────
    function renderColumnList(): void {
        columnListEl.innerHTML = '';
        for (const id of colOrder) {
            const meta = COLUMN_DEFS.find(c => c.id === id);
            if (!meta) continue;
            const enabled = colEnabled[id] !== false;

            const row = document.createElement('div');
            row.className = 'settings-col-row';
            row.dataset.id = id;
            row.draggable = !meta.locked;

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
            btn.addEventListener('click', () => moveColumn((btn as HTMLElement).dataset.id!, -1))
        );
        columnListEl.querySelectorAll('.col-dn').forEach(btn =>
            btn.addEventListener('click', () => moveColumn((btn as HTMLElement).dataset.id!, 1))
        );
        columnListEl.querySelectorAll('input[data-col]').forEach(cb =>
            cb.addEventListener('change', () => { colEnabled[(cb as HTMLElement).dataset.col!] = (cb as HTMLInputElement).checked; })
        );

        setupDnD();
    }

    function moveColumn(id: string, dir: number): void {
        const idx = colOrder.indexOf(id);
        if (idx < 0) return;
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= colOrder.length) return;
        colOrder.splice(idx, 1);
        colOrder.splice(newIdx, 0, id);
        renderColumnList();
    }

    // ─── Drag and Drop ───────────────────────────────────────────────────────
    let dragSrc: HTMLElement | null = null;

    function setupDnD(): void {
        columnListEl.querySelectorAll<HTMLElement>('.settings-col-row[draggable="true"]').forEach(row => {
            row.addEventListener('dragstart', e => {
                dragSrc = row;
                (e as DragEvent).dataTransfer!.effectAllowed = 'move';
                row.classList.add('col-dragging');
            });
            row.addEventListener('dragend', () => {
                row.classList.remove('col-dragging');
                columnListEl.querySelectorAll('.settings-col-row').forEach(r => r.classList.remove('col-drag-over'));
            });
            row.addEventListener('dragover', e => {
                e.preventDefault();
                (e as DragEvent).dataTransfer!.dropEffect = 'move';
                if (row !== dragSrc) {
                    columnListEl.querySelectorAll('.settings-col-row').forEach(r => r.classList.remove('col-drag-over'));
                    row.classList.add('col-drag-over');
                }
            });
            row.addEventListener('drop', e => {
                e.preventDefault();
                if (!dragSrc || dragSrc === row) return;
                const srcIdx = colOrder.indexOf(dragSrc.dataset.id!);
                const tgtIdx = colOrder.indexOf(row.dataset.id!);
                colOrder.splice(srcIdx, 1);
                colOrder.splice(tgtIdx, 0, dragSrc.dataset.id!);
                renderColumnList();
            });
        });
    }

    // ─── Compact Column Picker ───────────────────────────────────────────────
    function renderCompactPicker(): void {
        if (!compactListEl) return;
        compactListEl.innerHTML = '';

        for (const col of COLUMN_DEFS) {
            const isOn = compactCols.has(col.id);
            const isLocked = col.id === 'player';

            const chip = document.createElement('label');
            chip.className = `settings-compact-chip ${isOn ? 'active' : ''} ${isLocked ? 'locked' : ''}`;
            chip.innerHTML = `
                <input type="checkbox" data-compact-col="${col.id}"
                    ${isOn ? 'checked' : ''} ${isLocked ? 'disabled' : ''} />
                <span class="settings-compact-chip-text">${col.settingsLabel || col.label}</span>
            `;
            compactListEl.appendChild(chip);

            const cb = chip.querySelector('input') as HTMLInputElement;
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    compactCols.add(col.id);
                    chip.classList.add('active');
                } else {
                    compactCols.delete(col.id);
                    chip.classList.remove('active');
                }
            });
        }
    }

    // ─── Save ────────────────────────────────────────────────────────────────
    btnSave.addEventListener('click', async () => {
        showSaveStatus('Saving…', true);
        btnSave.disabled = true;
        try {
            columnListEl.querySelectorAll<HTMLInputElement>('input[data-col]').forEach(cb => {
                colEnabled[cb.dataset.col!] = cb.checked;
            });
            colEnabled.player = true;

            if (compactListEl) {
                compactCols = new Set(['player']);
                compactListEl.querySelectorAll<HTMLInputElement>('input[data-compact-col]').forEach(cb => {
                    if (cb.checked) compactCols.add(cb.dataset.compactCol!);
                });
            }

            const ratioThresholds: Record<string, Record<string, number>> = {};
            for (const ratio of RATIOS) {
                ratioThresholds[ratio] = {};
                for (const tier of TIERS) {
                    const el = threshEl(ratio, tier);
                    ratioThresholds[ratio]![tier] = parseFloat(el?.value) || 0;
                }
            }

            const cfg = {
                logPath: logPathInput.value.trim(),
                myUsername: myUsernameInput.value.trim(),
                pinSelf: pinSelfCb.checked,
                isNicked: isNickedCb.checked,
                myNickName: myNickNameInput.value.trim(),
                alwaysOnTop: alwaysOnTopCb.checked,
                toggleHotkey: toggleHotkeyIn.value.trim() || 'F4',
                clearHotkey: clearHotkeyIn.value.trim() || '',
                opacity: parseFloat(opacitySlider.value),
                updateAutoCheck: updateAutoCheckCb.checked,
                fkdrThresholds: {
                    good: ratioThresholds.fkdr!.good,
                    medium: ratioThresholds.fkdr!.medium,
                },
                ratioThresholds,
                ratioColors: {
                    hacker: colorHacker.value || '#f43f5e',
                    godlike: colorGodlike.value || '#d946ef',
                    good: colorGood.value || '#22c55e',
                    medium: colorMedium.value || '#f59e0b',
                    bad: colorBad.value || '#ef4444',
                },
                columnOrder: [...colOrder],
                columnEnabled: { ...colEnabled },
                compactColumns: [...compactCols],
            };

            await api.saveConfig(cfg);
            showSaveStatus('✓ Saved', true);
            setTimeout(closeSettings, 600);
        } catch (err) {
            console.error('[Settings] Save failed:', (err as Error).message);
            showSaveStatus('✗ Failed to save', false);
        } finally {
            btnSave.disabled = false;
        }
    });
}
