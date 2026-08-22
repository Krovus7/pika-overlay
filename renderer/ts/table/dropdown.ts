/**
 * Period/Mode filter dropdowns — ported from
 * pika-overlay-v3/renderer/overlay.js (positionDropdown, openFilter,
 * closeFilters + option handlers). One dropdown open at a time; click outside
 * closes.
 */

const PERIOD_LABELS: Record<string, string> = {
    total: 'All Time',
    weekly: 'Weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
};

const MODE_LABELS: Record<string, string> = {
    ALL_MODES: 'Overall',
    SOLO: 'Solo',
    DOUBLES: 'Duo',
    QUAD: 'Quad',
};

export interface DropdownHandlers {
    onPeriodChange: (period: string) => void;
    onModeChange: (mode: string) => void;
}

export interface Dropdowns {
    applyConfig: (cfg: Record<string, unknown>) => void;
    close: () => void;
}

export function createDropdowns(handlers: DropdownHandlers): Dropdowns {
    const btnPeriod = document.getElementById('btn-period') as HTMLButtonElement;
    const btnMode = document.getElementById('btn-mode') as HTMLButtonElement;
    const periodDropdown = document.getElementById('period-dropdown') as HTMLElement;
    const modeDropdown = document.getElementById('mode-dropdown') as HTMLElement;
    const periodLabel = document.getElementById('period-label') as HTMLElement;
    const modeLabelEl = document.getElementById('mode-label') as HTMLElement;

    let openDropdown: 'period' | 'mode' | null = null;

    function positionDropdown(btn: HTMLElement, dropdown: HTMLElement): void {
        const rect = btn.getBoundingClientRect();
        const w = dropdown.offsetWidth || 108;
        dropdown.style.top = `${rect.bottom + 5}px`;
        dropdown.style.left = `${rect.right - w}px`;
    }

    function openFilter(which: 'period' | 'mode'): void {
        if (openDropdown === which) { close(); return; }
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

    function close(): void {
        openDropdown = null;
        btnPeriod.classList.remove('open');
        btnMode.classList.remove('open');
        periodDropdown.classList.remove('open');
        modeDropdown.classList.remove('open');
    }

    btnPeriod.addEventListener('click', e => { e.stopPropagation(); openFilter('period'); });
    btnMode.addEventListener('click', e => { e.stopPropagation(); openFilter('mode'); });
    document.addEventListener('click', close);

    periodDropdown.addEventListener('click', e => {
        const opt = (e.target as HTMLElement).closest('.filter-option') as HTMLElement | null;
        if (!opt) return;
        const period = opt.dataset.value!;
        close();
        periodLabel.textContent = PERIOD_LABELS[period] || period;
        periodDropdown.querySelectorAll('.filter-option').forEach(o =>
            o.classList.toggle('selected', (o as HTMLElement).dataset.value === period)
        );
        handlers.onPeriodChange(period);
    });

    modeDropdown.addEventListener('click', e => {
        const opt = (e.target as HTMLElement).closest('.filter-option') as HTMLElement | null;
        if (!opt) return;
        const mode = opt.dataset.value!;
        close();
        modeLabelEl.textContent = MODE_LABELS[mode] || mode;
        modeDropdown.querySelectorAll('.filter-option').forEach(o =>
            o.classList.toggle('selected', (o as HTMLElement).dataset.value === mode)
        );
        handlers.onModeChange(mode);
    });

    function applyConfig(cfg: Record<string, unknown>): void {
        if (typeof cfg.statsInterval === 'string') {
            const interval = cfg.statsInterval;
            periodLabel.textContent = PERIOD_LABELS[interval] || interval;
            periodDropdown.querySelectorAll('.filter-option').forEach(o =>
                o.classList.toggle('selected', (o as HTMLElement).dataset.value === interval)
            );
        }
        if (typeof cfg.statsMode === 'string') {
            const mode = cfg.statsMode;
            modeLabelEl.textContent = MODE_LABELS[mode] || mode;
            modeDropdown.querySelectorAll('.filter-option').forEach(o =>
                o.classList.toggle('selected', (o as HTMLElement).dataset.value === mode)
            );
        }
    }

    return { applyConfig, close };
}
