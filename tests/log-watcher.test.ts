/**
 * LogWatcher tail carry-over: a read that ends mid-line must not emit the
 * fragment as a line (nor its tail as another one).
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { LogWatcher } from '../src/main/log/logWatcher';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('LogWatcher — partial line handling', () => {
    let dir = '';
    let watcher: LogWatcher | null = null;

    afterEach(() => {
        watcher?.stop();
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    function open(initial = ''): { file: string; lines: string[] } {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-log-'));
        const file = path.join(dir, 'latest.log');
        fs.writeFileSync(file, initial);
        const lines: string[] = [];
        watcher = new LogWatcher();
        watcher.on('log_line', (l: string) => lines.push(l));
        watcher.start(file, 'me', { pollMs: 10 });
        return { file, lines };
    }

    it('joins a line split across two reads into one line', async () => {
        const { file, lines } = open();
        fs.appendFileSync(file, '[12:00:00] [Render thread/INFO]: [CHAT] Hel');
        await wait(60);
        assert.deepEqual(lines, [], 'unfinished line is held back');
        fs.appendFileSync(file, 'lo world\n[12:00:01] [Render thread/INFO]: [CHAT] second\n');
        await wait(60);
        assert.deepEqual(lines, [
            '[12:00:00] [Render thread/INFO]: [CHAT] Hello world',
            '[12:00:01] [Render thread/INFO]: [CHAT] second',
        ]);
    });

    it('a multi-byte character split across reads is decoded intact', async () => {
        const { file, lines } = open();
        const bytes = Buffer.from('café ok\n', 'utf8');
        fs.appendFileSync(file, bytes.subarray(0, 4)); // cuts the two-byte "é" in half
        await wait(60);
        fs.appendFileSync(file, bytes.subarray(4));
        await wait(60);
        assert.deepEqual(lines, ['café ok']);
    });

    it('complete lines are emitted immediately and the trailing fragment waits', async () => {
        const { file, lines } = open();
        fs.appendFileSync(file, 'one\ntwo\nthr');
        await wait(60);
        assert.deepEqual(lines, ['one', 'two']);
        fs.appendFileSync(file, 'ee\n');
        await wait(60);
        assert.deepEqual(lines, ['one', 'two', 'three']);
    });

    it('a rotated (truncated) file drops the stale fragment', async () => {
        const { file, lines } = open();
        fs.appendFileSync(file, 'stale fragmen');
        await wait(60);
        fs.writeFileSync(file, 'x\n');
        await wait(60);
        assert.deepEqual(lines, ['x']);
    });
});
