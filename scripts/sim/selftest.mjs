/** --self-test: deliberately broken wirings must be caught by the checks. */

import * as path from 'node:path';

import { runPool } from './pool.mjs';

const CASES = [
    { breakage: 'model_ignores_remove', expect: 'SYNC' },
    { breakage: 'skip_quit_listener', expect: 'MEMBERSHIP' },
    { breakage: 'api_204', expect: 'CLASSIFICATION' },
];

export async function selfTest(base, corpus, explicit) {
    const pick = explicit ?? corpus.find(f => f.includes('2026-03-26-2')) ?? corpus[0];
    const mk = (breakage) => ({
        ...base, actions: false, file: pick, breakage,
        name: breakage ? `${path.basename(pick)}#${breakage}` : path.basename(pick),
    });
    const [ctl] = await runPool([mk(undefined)], 1, () => {});
    const base0 = c => (ctl.ok ? ctl.result.violationCounts[c] : 0);
    const results = await runPool(CASES.map(c => mk(c.breakage)), 3, () => {});
    let pass = true;
    results.forEach((r, i) => {
        const n = r.ok ? r.result.violationCounts[CASES[i].expect] : -1;
        const good = n > base0(CASES[i].expect);
        pass &&= good;
        console.log(`${good ? 'PASS' : 'FAIL'} ${CASES[i].breakage}: ${CASES[i].expect} violations = ${n} (control ${base0(CASES[i].expect)})${r.ok ? '' : ` (${r.error})`}`);
    });
    console.log(`control (no breakage) on ${path.basename(pick)}: ${ctl.ok ? JSON.stringify(ctl.result.violationCounts) : ctl.error}`);
    return pass;
}
