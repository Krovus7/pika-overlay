/**
 * Replays real Minecraft logs through BOTH the v4 parser (LineParser) and the
 * v3 parser (pika-overlay-v3 logWatcher singleton) and reports:
 *   - events per file (detected by source, quit, party, lifecycle, sync)
 *   - unique detected names
 *   - anti-false-positive violations (invalid MC names, grammar blocklist)
 *   - v3 vs v4 divergence (same input → same event stream expected)
 *
 * Usage:
 *   node scripts/replay-logs.mjs [file...] [--username NAME]
 * Default corpus: pika-overlay-v3/logs/*.log + blclient *.log.gz +
 * blclient/minecraft/latest.log. .gz files are decompressed to COPIES in
 * artifacts/logs/ (originals untouched).
 *
 * Output: artifacts/replay/<name>.json per file + artifacts/replay/report.md
 * Exit 1 when any v3/v4 divergence is found (exit 0 otherwise).
 */

import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(import.meta.dirname, '..');
const V3_LOGS = path.join(ROOT, '..', 'pika-overlay-v3', 'logs');
const BL_DIR = path.join(process.env.APPDATA, '.minecraft', 'logs', 'blclient', 'minecraft');

let myUsername = 'AcquaPanna';
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const userIdx = process.argv.indexOf('--username');
if (userIdx >= 0 && process.argv[userIdx + 1]) myUsername = process.argv[userIdx + 1];

const v4 = require(path.join(ROOT, 'dist', 'src', 'main', 'log', 'lineParser.js'));
const v4Names = require(path.join(ROOT, 'dist', 'src', 'main', 'log', 'nameCleaner.js'));
const v3 = require(path.join(ROOT, '..', 'pika-overlay-v3', 'src', 'logWatcher.js'));

const v4LineParser = v4.LineParser;
const { isCommonWord } = v4Names;
const RE_MC_NAME = /^[A-Za-z0-9_]{3,16}$/;

function collectCorpus() {
    if (args.length > 0) return args.map(p => path.resolve(process.cwd(), p));
    const files = [];
    if (existsSync(V3_LOGS)) {
        for (const f of require('node:fs').readdirSync(V3_LOGS)) {
            if (f.endsWith('.log')) files.push(path.join(V3_LOGS, f));
        }
    }
    if (existsSync(BL_DIR)) {
        for (const f of require('node:fs').readdirSync(BL_DIR)) {
            if (f.endsWith('.log.gz') || f === 'latest.log') files.push(path.join(BL_DIR, f));
        }
    }
    return files.sort();
}

function materialize(file) {
    if (!file.endsWith('.gz')) return { path: file, text: readFileSync(file, 'utf8') };
    const outDir = path.join(ROOT, 'artifacts', 'logs');
    mkdirSync(outDir, { recursive: true });
    const name = path.basename(file, '.gz') + '.decompressed.log';
    const out = path.join(outDir, name);
    if (!existsSync(out)) {
        writeFileSync(out, gunzipSync(readFileSync(file)));
    }
    return { path: out, text: readFileSync(out, 'utf8') };
}

function replay(text) {
    const events = [];
    const emit = (ev, ...more) => events.push({ ev, args: more });
    const p4 = new v4LineParser(emit);
    p4.setMyUsername(myUsername);

    const v3Events = [];
    const v3Emit = (ev, ...more) => v3Events.push({ ev, args: more });
    v3._myUsername = myUsername.toLowerCase();
    v3._inPregame = false;
    const origEmit = v3.emit.bind(v3);
    v3.emit = v3Emit;
    const origLog = console.log;
    console.log = () => {};

    const lines = text.split('\n');
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        p4.parseLine(line);
        v3._parseLine(line);
    }
    console.log = origLog;
    v3.emit = origEmit;
    return { events, v3Events, lines: lines.filter(l => l.trim() && l.includes('[CHAT]')).length };
}

function analyze(events) {
    const byEvent = {};
    const bySource = {};
    const names = new Set();
    const violations = [];
    let lineNo = 0;
    for (const { ev, args } of events) {
        byEvent[ev] = (byEvent[ev] ?? 0) + 1;
        if (ev === 'player_detected') {
            const [name, source] = args;
            bySource[source] = (bySource[source] ?? 0) + 1;
            names.add(name);
            if (!RE_MC_NAME.test(name) || isCommonWord(name)) {
                violations.push({ ev, name, source });
            }
        }
    }
    return { byEvent, bySource, names: [...names].sort(), violations };
}

function diffStream(a, b) {
    const diffs = [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const x = a[i] ? `${a[i].ev}:${JSON.stringify(a[i].args)}` : '(missing)';
        const y = b[i] ? `${b[i].ev}:${JSON.stringify(b[i].args)}` : '(missing)';
        if (x !== y) {
            diffs.push({ index: i, v4: x.slice(0, 120), v3: y.slice(0, 120) });
            if (diffs.length >= 20) break;
        }
    }
    return diffs;
}

const files = collectCorpus();
mkdirSync(path.join(ROOT, 'artifacts', 'replay'), { recursive: true });

const summary = [];
let totalDiffs = 0;
let totalViolations = 0;

for (const file of files) {
    const { text, path: realPath } = materialize(file);
    const { events, v3Events, lines } = replay(text);
    const a = analyze(events);
    const diffs = diffStream(events, v3Events);
    totalDiffs += diffs.length;
    totalViolations += a.violations.length;

    const rec = {
        file: path.basename(file),
        chatLines: lines,
        byEvent: a.byEvent,
        bySource: a.bySource,
        names: a.names,
        nameCount: a.names.length,
        violations: a.violations.slice(0, 20),
        violationCount: a.violations.length,
        v3_v4_divergences: diffs,
    };
    writeFileSync(path.join(ROOT, 'artifacts', 'replay', path.basename(file) + '.json'), JSON.stringify(rec, null, 1));

    const src = Object.entries(a.bySource).map(([k, v]) => `${k}=${v}`).join(' ');
    summary.push({
        file: path.basename(file),
        chat: lines,
        detected: a.names.length,
        sources: src,
        party: (a.byEvent.party_joined ?? 0) + (a.byEvent.party_members ?? 0),
        games: (a.byEvent.game_start ?? 0) + (a.byEvent.game_end ?? 0),
        violations: a.violations.length,
        diffs: diffs.length,
    });
    console.log(`  ${path.basename(file).padEnd(42)} chat=${String(lines).padStart(5)} names=${String(a.names.length).padStart(3)} viol=${a.violations.length} diff=${diffs.length}`);
}

let md = '# Replay report — real logs against v3 vs v4 parsers\n\n';
md += `Corpus: ${files.length} files, username: ${myUsername}, parser: dist (v4) vs pika-overlay-v3/src/logWatcher.js\n\n`;
md += '| File | Chat lines | Detected | Sources | Party | Game lifecycle | Violations | v3/v4 diff |\n';
md += '|---|---|---|---|---|---|---|---|\n';
for (const s of summary) {
    md += `| ${s.file} | ${s.chat} | ${s.detected} | ${s.sources || '—'} | ${s.party} | ${s.games} | ${s.violations} | ${s.diffs} |\n`;
}
md += `\n**Totals:** ${totalViolations} violations, ${totalDiffs} v3/v4 divergences\n`;

const allDiffs = collectAllDiffs();
if (allDiffs.length) {
    md += '\n## Divergences (v4 ≠ v3)\n\n';
    for (const d of allDiffs) md += `- ${d.file} [${d.index}] v4: ${d.v4} | v3: ${d.v3}\n`;
}
writeFileSync(path.join(ROOT, 'artifacts', 'replay', 'report.md'), md);
console.log(`\n[replay] ${files.length} files — ${totalViolations} violations, ${totalDiffs} divergences → artifacts/replay/report.md`);
process.exit(totalDiffs > 0 ? 1 : 0);

function collectAllDiffs() {
    const out = [];
    for (const file of files) {
        const jp = path.join(ROOT, 'artifacts', 'replay', path.basename(file) + '.json');
        if (!existsSync(jp)) continue;
        const rec = JSON.parse(readFileSync(jp, 'utf8'));
        for (const d of rec.v3_v4_divergences ?? []) out.push({ file: rec.file, ...d });
    }
    return out;
}
