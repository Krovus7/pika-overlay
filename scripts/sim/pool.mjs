/** Runs jobs in child processes (worker.mjs), a few in parallel. */

import { fork } from 'node:child_process';
import * as path from 'node:path';

const WORKER = path.join(import.meta.dirname, 'worker.mjs');

function runOne(job) {
    return new Promise(resolve => {
        const child = fork(WORKER, [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
        let settled = false;
        const finish = r => { if (!settled) { settled = true; resolve(r); } };
        child.on('message', finish);
        child.on('exit', code => finish({ ok: false, error: `worker exited with code ${code}`, file: job.file }));
        child.send(job);
    });
}

export async function runPool(jobs, parallel, onResult) {
    let next = 0;
    const results = new Array(jobs.length);
    const lane = async () => {
        while (next < jobs.length) {
            const i = next++;
            results[i] = await runOne(jobs[i]);
            onResult(results[i], jobs[i]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, lane));
    return results;
}
