// ─── Shared Column Definitions ───────────────────────────────────────────────
// Loaded by both overlay.html and settings.html via <script> tag.
// Sets the global window.COLUMN_DEFS array used by both pages.

window.COLUMN_DEFS = [
    { id: 'rank',      label: 'LV',        sortKey: 'rankSortValue',  cls: 'col-rank',    settingsLabel: 'LV'        },
    { id: 'player',    label: 'Player',    sortKey: null,             cls: 'col-player',  settingsLabel: 'Player',    locked: true },
    { id: 'guild',     label: 'Guild',     sortKey: null,             cls: 'col-guild',   settingsLabel: 'Guild'     },
    { id: 'fkdr',      label: 'FKDR',      sortKey: 'fkdr',           cls: 'col-fkdr',    settingsLabel: 'FKDR'      },
    { id: 'finals',    label: 'Finals',    sortKey: 'finalKills',     cls: 'col-fk',      settingsLabel: 'Finals'    },
    { id: 'kdr',       label: 'KD',        sortKey: 'kdr',            cls: 'col-kdr',     settingsLabel: 'KD'        },
    { id: 'wlr',       label: 'WLR',       sortKey: 'wlr',            cls: 'col-wlr',     settingsLabel: 'WLR'       },
    { id: 'wins',      label: 'Wins',      sortKey: 'wins',           cls: 'col-wins',    settingsLabel: 'Wins'      },
    { id: 'beds',      label: 'Beds',      sortKey: 'bedsDestroyed',  cls: 'col-beds',    settingsLabel: 'Beds'      },
    { id: 'winstreak', label: 'WS',        sortKey: 'winstreak',      cls: 'col-ws',      settingsLabel: 'Winstreak' },
    { id: 'kills',     label: 'Kills',     sortKey: 'kills',          cls: 'col-kills',   settingsLabel: 'Kills'     },
    { id: 'deaths',    label: 'Deaths',    sortKey: 'deaths',         cls: 'col-deaths',  settingsLabel: 'Deaths'    },
    { id: 'bowkills',  label: 'Bow',       sortKey: 'bowKills',       cls: 'col-bow',     settingsLabel: 'Bow Kills' },
    { id: 'source',    label: 'Source',    sortKey: null,             cls: 'col-src',     settingsLabel: 'Source'    },
];
