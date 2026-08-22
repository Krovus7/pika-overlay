/**
 * Log watcher — polls latest.log every 500ms with manual fs.openSync/readSync
 * (deliberately NOT fs.watch: missed-events problem with actively-written log
 * files on Windows, HANDOVER v2.2). Emits raw lines and delegates parsing to
 * LineParser.
 *
 * Events: log_line, player_detected, player_quit, players_sync, players_clear,
 * pregame_start, game_start, game_end, party_joined, party_left, party_clear,
 * party_members.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { LineParser } from './lineParser';

const POLL_MS = 500;

export class LogWatcher extends EventEmitter {
    private logPath: string | null = null;
    private pos = 0;
    private timer: NodeJS.Timeout | null = null;
    private readonly parser = new LineParser((event, ...args) => this.emit(event, ...args));

    start(logPath: string, myUsername = ''): boolean {
        if (this.timer) this.stop();
        this.logPath = logPath;
        this.parser.setMyUsername(myUsername);

        if (!fs.existsSync(logPath)) {
            console.warn(`[LogWatcher] Log not found: ${logPath}`);
            return false;
        }

        try {
            this.pos = fs.statSync(logPath).size;
        } catch {
            this.pos = 0;
        }

        this.timer = setInterval(() => this.poll(), POLL_MS);
        console.log(`[LogWatcher] Watching: ${logPath}`);
        return true;
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private poll(): void {
        if (!this.logPath) return;
        let stat: fs.Stats;
        try { stat = fs.statSync(this.logPath); } catch { return; }

        if (stat.size < this.pos) this.pos = 0;    // file rotated
        if (stat.size === this.pos) return;        // nothing new

        let buf: Buffer;
        const len = stat.size - this.pos;
        try {
            const fd = fs.openSync(this.logPath, 'r');
            buf = Buffer.allocUnsafe(len);
            fs.readSync(fd, buf, 0, len, this.pos);
            fs.closeSync(fd);
            this.pos = stat.size;
        } catch {
            return; // file locked, retry next tick
        }

        const lines = buf.toString('utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            this.emit('log_line', trimmed);
            this.parser.parseLine(trimmed);
        }
    }
}
