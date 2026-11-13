/**
 * Headless session simulator: replays real Minecraft logs, with their real
 * timing in virtual time, through the real main-process pipeline and the real
 * overlay-table store, checking invariants against an independent oracle.
 *
 * Usage: node scripts/simulate-session.mjs [file...] [--seed N] [--actions]
 *        [--username NAME (default: "Setting user:" of each log, else AcquaPanna)] [--parallel N] [--spread-ms N] [--verbose] [--self-test]
 * Default corpus: artifacts/corpus-v3/*.log + artifacts/logs/*.log
 * Needs a built dist/ (npm run build). Output: artifacts/sim/report.md and
 * artifacts/sim/<name>.json. Exit 1 when any violation exists.
 *
 * Idle gaps between log lines are capped at 15 virtual minutes.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { bundleStore } from './sim/model.mjs';
import { runPool } from './sim/pool.mjs';
import { writeReports, aggregate } from './sim/report.mjs';
import { selfTest } from './sim/selftest.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIM = path.join(ROOT, 'artifacts', 'sim');
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const valueFlags = new Set(['--seed', '--username', '--parallel', '--spread-ms']);
const files = argv.filter((a, i) => !a.startsWith('--') && !valueFlags.has(argv[i - 1]));

const seed = Number(opt('--seed', 1));
const username = opt('--username', null);
const parallel = Number(opt('--parallel', Math.max(1, Math.min(6, os.cpus().length - 2))));

function corpus() {
    if (files.length) return files.map(f => path.resolve(process.cwd(), f));
    const out = [];
    for (const dir of ['corpus-v3', 'logs']) {
        const d = path.join(ROOT, 'artifacts', dir);
        if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith('.log')) out.push(path.join(d, f));
    }
    return out.sort();
}

fs.mkdirSync(SIM, { recursive: true });
const storeBundle = path.join(SIM, 'playerStore.bundle.mjs');
await bundleStore(ROOT, storeBundle);
const spreadMs = Number(opt('--spread-ms', 0));
const base = { spreadMs, root: ROOT, simDir: SIM, storeBundle, username, seed, actions: flag('--actions') };

if (flag('--self-test')) {
    process.exit(await selfTest(base, corpus(), files[0]) ? 0 : 1);
}

const jobs = corpus().map(file => ({ ...base, file, name: path.basename(file) }));
const t0 = Date.now();
const line = (r, job) => {
    if (!r.ok) return console.log(`ERROR ${job.name}: ${r.error.split('\n')[0]}`);
    const x = r.result;
    const v = Object.values(x.violationCounts).reduce((a, b) => a + b, 0);
    console.log(`${v ? 'FAIL' : 'ok  '} ${job.name.padEnd(44)} lines=${x.lines} games=${x.games} players=${x.uniquePlayers} req=${x.api.total} virt=${Math.round(x.virtualMs / 60000)}min wall=${(x.wallMs / 1000).toFixed(1)}s violations=${v}`);
    if (flag('--verbose')) for (const e of x.violations.slice(0, 5)) console.log(`      ${e.check} ${e.time} L${e.line}: ${e.detail}`);
};
const results = await runPool(jobs, parallel, line);
for (const r of results) {
    if (r.ok) fs.writeFileSync(path.join(SIM, `${r.result.file.replace(/[^\w.-]/g, '_')}.json`), JSON.stringify(r.result));
}
const agg = aggregate(results, { seed, actions: base.actions, username });
writeReports(path.join(SIM, 'report.md'), results, agg);
console.log(`\n${results.length} files, ${agg.totalViolations} violations, ${agg.crashed} crashed, wall ${((Date.now() - t0) / 1000).toFixed(0)}s -> artifacts/sim/report.md`);
for (const [c, n] of Object.entries(agg.counts)) if (n) console.log(`  ${c}: ${n}`);
process.exit(agg.totalViolations > 0 || agg.crashed > 0 ? 1 : 0);
