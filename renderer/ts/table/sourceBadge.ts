import { icon, type IconName } from '../ui/icons';

const SOURCES: Record<string, { cls: string; label: string; icon: IconName }> = {
    manual:    { cls: 'src-manual', label: 'Search', icon: 'search' },
    bulk:      { cls: 'src-bulk',   label: 'Paste',  icon: 'clipboard' },
    tab_list:  { cls: 'src-log',    label: 'Tab',    icon: 'list' },
    join:      { cls: 'src-log',    label: 'Join',   icon: 'log-in' },
    kill_feed: { cls: 'src-log',    label: 'Kill',   icon: 'sword' },
    bed_break: { cls: 'src-log',    label: 'Bed',    icon: 'bed' },
    team_announce: { cls: 'src-log', label: 'Team',  icon: 'list' },
    party:     { cls: 'src-party',  label: 'Party',  icon: 'diamond' },
};

export function srcBadge(src: string): string {
    if (!src) return '';
    const s = SOURCES[src] ?? { cls: 'src-log', label: 'Auto', icon: 'spark' as IconName };
    return `<span class="src-badge ${s.cls}" title="${s.label}">${icon(s.icon)}<span>${s.label}</span></span>`;
}
