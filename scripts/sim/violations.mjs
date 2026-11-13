/** Violation store: counts everything, keeps the first MAX_STORED per check. */

import { hms } from './util.mjs';

export const CHECKS = [
    'SYNC', 'MEMBERSHIP', 'IMMEDIATE_REMOVAL', 'GAME_START_UNCHANGED', 'NO_SPECTATOR', 'PARTY_PINNED',
    'STUCK_LOADING', 'CLASSIFICATION', 'BUDGET', 'ERRORS', 'SOURCE_STABILITY',
];
const MAX_STORED = 20;

export class Violations {
    constructor(file) {
        this.file = file;
        this.cursor = { no: 0, text: '', count: 0 };
        this.counts = Object.fromEntries(CHECKS.map(c => [c, 0]));
        this.stored = [];
        this.storedPer = {};
    }

    add(check, detail) {
        this.counts[check]++;
        const n = this.storedPer[check] ?? 0;
        if (n >= MAX_STORED) return;
        this.storedPer[check] = n + 1;
        this.stored.push({
            check, file: this.file, time: hms(Date.now()),
            line: this.cursor.no, text: this.cursor.text, detail,
        });
    }

    get total() { return Object.values(this.counts).reduce((a, b) => a + b, 0); }
}
