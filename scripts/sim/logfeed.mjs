/**
 * Log replay schedule: each original line gets a virtual time from its
 * [HH:MM:SS] stamp (midnight wrap handled; lines without a stamp inherit the
 * previous one; gaps longer than MAX_GAP_MS are shortened to MAX_GAP_MS so cache
 * expiry is exercised without simulating hours of idling). spreadMs > 0 (diagnostic)
 * puts at least spreadMs between consecutive lines, i.e. one line per poll
 * (distorts the timeline; isolates same-poll batching effects).
 */

import * as fs from 'node:fs';

export const MAX_GAP_MS = 15 * 60 * 1000;
const DAY = 86_400_000;
const d = b => b - 48;
const isDigit = b => b >= 48 && b <= 57;

function todOf(buf, s) {
    if (buf[s] !== 0x5b || buf[s + 3] !== 0x3a || buf[s + 6] !== 0x3a || buf[s + 9] !== 0x5d) return null;
    for (const o of [1, 2, 4, 5, 7, 8]) if (!isDigit(buf[s + o])) return null;
    return ((d(buf[s + 1]) * 10 + d(buf[s + 2])) * 3600 + (d(buf[s + 4]) * 10 + d(buf[s + 5])) * 60
        + d(buf[s + 7]) * 10 + d(buf[s + 8])) * 1000;
}

/** Returns { items: [{ no, t, bytes }], firstTod, nonEmptyNo: number[] } */
export function buildSchedule(buf, spreadMs = 0) {
    const items = [];
    const nonEmptyNo = [];
    let prevTod = null;
    let t = 0;
    let firstTod = 0;
    let start = 0;
    let no = 0;
    let lastNat = -1;
    let lastEff = 0;
    while (start < buf.length) {
        let end = buf.indexOf(0x0a, start);
        if (end === -1) end = buf.length;
        no++;
        const tod = todOf(buf, start);
        if (tod !== null) {
            if (prevTod === null) firstTod = tod;
            else {
                let delta = (tod - prevTod + DAY) % DAY;
                if (delta > DAY / 2) delta = 0; // small backwards step
                t += Math.min(delta, MAX_GAP_MS);
            }
            prevTod = tod;
        }
        const eff = spreadMs > 0 ? Math.max(t, lastEff + spreadMs) : t;
        lastNat = t;
        lastEff = eff;
        const body = buf.subarray(start, end);
        let nonEmpty = false;
        for (const b of body) if (b > 0x20) { nonEmpty = true; break; }
        if (nonEmpty) nonEmptyNo.push(no);
        // raw bytes, newline always terminated (the watcher only parses complete lines)
        items.push({ no, t: eff, bytes: Buffer.concat([body, Buffer.from('\n')]) });
        start = end + 1;
    }
    return { items, firstTod, nonEmptyNo };
}

export class Feeder {
    constructor(livePath, schedule, t0) {
        this.path = livePath;
        this.items = schedule.items;
        this.t0 = t0;
        this.i = 0;
        fs.writeFileSync(livePath, '');
    }

    get done() { return this.i >= this.items.length; }

    nextTime() { return this.done ? Infinity : this.t0 + this.items[this.i].t; }

    /** Appends every line whose virtual time has come; returns how many */
    feedDue(now) {
        const parts = [];
        while (this.i < this.items.length && this.t0 + this.items[this.i].t <= now) {
            parts.push(this.items[this.i++].bytes);
        }
        if (parts.length) fs.appendFileSync(this.path, Buffer.concat(parts));
        return parts.length;
    }
}
