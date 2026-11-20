/**
 * Interactive overlay smoke via Chrome DevTools Protocol.
 * Usage:  node scripts/smoke.mjs [exePath] [cwd] [args...]
 *   default (dev):   node scripts/smoke.mjs node_modules/electron/dist/electron.exe .
 *   installed app:   node scripts/smoke.mjs "C:\...\pika-overlay\current\PikaOverlay.exe" "C:\...\current"
 *
 * Steps: bridge present → settings open/close (its own window) → API key saved
 * through Settings → API in that window (only when PIKA_API_KEY is set) → period dropdown open/close →
 * real lookups (live API): a known player and a made-up name → period switch →
 * watchlist (sniper chip via IPC, text export → clear → import → chip back,
 * list removal) → clear → compact toggle. Screenshots land in
 * artifacts/screens/v5-live-*.png.
 *
 * The watchlist steps use the app's real watchlist.json (userData is fixed, no
 * override exists): the file is backed up before the launch and restored on
 * every exit path. The native export/import file dialogs cannot be driven over
 * CDP, so the export/import round trip goes through the text format.
 *
 * Env: PIKA_API_KEY   key to enter in Settings → API (it is saved in the app's
 *                     own config, exactly as a user would; never printed)
 *      SMOKE_PLAYER   a real Pika player name (default: Dream)
 * Exit code 0 = all steps passed.
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { launchAndAttach } from './lib/cdp.mjs';

const API_KEY = process.env.PIKA_API_KEY ?? '';
const KNOWN_PLAYER = process.env.SMOKE_PLAYER ?? 'Dream';
const UNKNOWN_NAME = 'zqNoSuchName9182'; // valid shape (3-16 chars), never registered
const SHOTS_DIR = path.join(process.cwd(), 'artifacts', 'screens');
const exe = process.argv[2] ?? 'node_modules/electron/dist/electron.exe';
const cwd = process.argv[3] ?? process.cwd();
const args = process.argv.slice(4);
if (process.argv[2] === undefined) args.unshift('.');

if (!existsSync(exe)) {
    console.error(`[smoke] exe not found: ${exe}`);
    process.exit(2);
}

const USER_DATA = path.join(process.env.APPDATA ?? '', 'pika-overlay');
const isWatchlistFile = name => name === 'watchlist.json' || name.startsWith('watchlist.json.');
const listWatchlistFiles = () => (existsSync(USER_DATA) ? readdirSync(USER_DATA).filter(isWatchlistFile) : []);
const watchlistBackup = new Map(listWatchlistFiles().map(name => [name, readFileSync(path.join(USER_DATA, name))]));

/** Puts the watchlist files back exactly as they were; files the run created are removed. */
function restoreWatchlist() {
    for (const name of listWatchlistFiles()) if (!watchlistBackup.has(name)) rmSync(path.join(USER_DATA, name), { force: true });
    for (const [name, content] of watchlistBackup) writeFileSync(path.join(USER_DATA, name), content);
}
process.on('exit', restoreWatchlist);

/** Stops the app and waits (at most 5 s) for the process to end, so no quit-time write can follow the restore. */
async function stopApp() {
    if (!app) return;
    app.close();
    await Promise.race([app.exited, sleep(5000)]);
}
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        stopApp().finally(() => {
            restoreWatchlist();
            process.exit(130);
        });
    });
}

let app = null;
const evaluate = expression => app.evaluate(expression);
const waitFor = (condition, timeoutMs, label) => app.waitFor(condition, timeoutMs, label);
const screenshot = name => app.screenshot(SHOTS_DIR, name);

const rowClass = name => `[...document.querySelectorAll('#stats-body tr')].find(r => r.textContent.toLowerCase().includes('${name.toLowerCase()}'))?.className ?? ''`;
const NO_ROW_LOADING = `document.querySelectorAll('#stats-body tr').length > 0 && !document.querySelector('#stats-body tr.row-loading')`;

const results = [];
function step(desc, ok, extra = '') {
    results.push({ desc, ok });
    console.log(`${ok ? '  ✔' : '  ✖'} ${desc}${extra ? ' — ' + extra : ''}`);
}

async function waitUntilGone(urlPart) {
    for (let i = 0; i < 20; i++) {
        if (!(await app.pageExists(urlPart))) return true;
        await sleep(250);
    }
    return false;
}

const watchChips = name => `[...document.querySelectorAll('#stats-body tr')].find(r => r.textContent.toLowerCase().includes('${name.toLowerCase()}'))?.querySelector('.tag-watch')?.className ?? ''`;
const hasChip = (name, kind) => `(${watchChips(name)}).includes('tag-${kind}')`;
const noChip = name => `(${watchChips(name)}) === ''`;

async function watchlistSteps() {
    const smokeNote = 'smoke test';
    const setOwn = kind => evaluate(`window.pikaOverlay.setWatchEntry(${JSON.stringify(UNKNOWN_NAME)}, ${kind ? `{ kind: '${kind}', note: '${smokeNote}' }` : 'null'})`);

    const saved = await setOwn('sniper');
    const chip = await waitFor(hasChip(UNKNOWN_NAME, 'sniper'), 8000, 'sniper chip').catch(() => false);
    step('marking a row as sniper through IPC shows the SNIPER chip', saved === true && !!chip);
    await screenshot('v5-live-watchlist-chip.png');

    // Same text the "Copy as text" button produces for this entry
    const snapshot = await evaluate(`window.pikaOverlay.getWatchlist()`);
    const mine = snapshot.entries.filter(e => e.source === 'me' && e.name.toLowerCase() === UNKNOWN_NAME.toLowerCase());
    const text = mine.map(e => `${e.name}, ${e.kind}, ${e.note}`).join('\n');
    const copied = await evaluate(`window.pikaOverlay.copyWatchlistText().then(() => true, () => false)`);
    step('copy as text works and the entry is in the snapshot', copied === true && mine.length === 1);

    await setOwn(null);
    const cleared = await waitFor(noChip(UNKNOWN_NAME), 8000, 'chip gone after remove').catch(() => false);
    step('removing the entry removes the chip', !!cleared);

    const attempt = await evaluate(`window.pikaOverlay.importWatchlistText(${JSON.stringify(text)}, 'other')`);
    const confirmed = attempt?.token ? await evaluate(`window.pikaOverlay.confirmWatchImport(${JSON.stringify(attempt.token)})`) : false;
    const back = await waitFor(hasChip(UNKNOWN_NAME, 'sniper'), 8000, 'chip back after import').catch(() => false);
    const imported = await waitFor(hasChip(UNKNOWN_NAME, 'imported'), 3000, 'imported style').catch(() => false);
    step('import (preview, confirm) brings the chip back as an imported one', attempt?.count === 1 && confirmed === true && !!back && !!imported);

    const after = await evaluate(`window.pikaOverlay.getWatchlist()`);
    const list = after.lists.find(l => l.label === attempt?.label);
    const removed = list ? await evaluate(`window.pikaOverlay.removeWatchList(${JSON.stringify(list.id)})`) : false;
    const gone = await waitFor(noChip(UNKNOWN_NAME), 8000, 'chip gone after list removal').catch(() => false);
    const final = await evaluate(`window.pikaOverlay.getWatchlist()`);
    const leftover = final.entries.some(e => e.name.toLowerCase() === UNKNOWN_NAME.toLowerCase());
    step('removing the list removes its chip and entries', removed === true && !!gone && !leftover);
}

async function main() {
    // 1. start the app and attach to its overlay window
    try {
        // ELECTRON_RUN_AS_NODE would make the dev binary run as plain Node
        app = await launchAndAttach({ exe, args, cwd, env: { ELECTRON_RUN_AS_NODE: undefined } });
    } catch (err) {
        step('app window target found', false, err.message);
        return finish();
    }
    step('app window target found', true);
    await sleep(3000); // let the preload and the first config round trip settle

    // 2. bridge present
    const bridge = await evaluate('typeof window.pikaOverlay');
    step('window.pikaOverlay bridge present', bridge === 'object', `typeof=${bridge}`);
    if (bridge !== 'object') return finish();

    // 3. settings open/close: a separate window, the overlay stays where it is
    await evaluate(`document.getElementById('btn-settings').click()`);
    const settings = await app.page('settings.html').catch(() => null);
    step('settings opens as its own window (⚙)', !!settings);
    if (!settings) return finish();
    const panelReady = await settings.waitFor(`!!document.querySelector('#settings-panel .settings-tab-btn.active')`, 5000, 'settings panel').catch(() => false);
    const overlayKept = await evaluate(`!!document.getElementById('stats-table')`);
    step('settings window renders, overlay page untouched', !!panelReady && !!overlayKept);
    await settings.evaluate(`document.getElementById('btn-settings-close-x').click()`);
    const gone = await waitUntilGone('settings.html');
    step('settings window closes', gone);

    // 3b. API key entered and saved through Settings → API
    const healthBefore = (await evaluate('window.pikaOverlay.getApiHealth()'))?.kind;
    console.log(`    health at start: ${healthBefore}`);
    if (API_KEY) {
        await evaluate(`window.pikaOverlay.openSettings('api')`);
        const keyWin = await app.page('settings.html');
        await keyWin.waitFor(`!!document.querySelector('.s-key-input')`, 5000, 'key field');
        await keyWin.evaluate(`(() => { const i = document.querySelector('.s-key-input'); i.value = ${JSON.stringify(API_KEY)}; i.dispatchEvent(new Event('input', { bubbles: true })); const b = [...document.querySelectorAll('#tab-api button')].find(x => x.textContent.trim() === 'Save key'); if (!b.disabled) b.click(); })()`);
        const healthy = await waitFor(`window.pikaOverlay.getApiHealth().then(h => h.kind === 'ok')`, 15000, 'health ok after saving the key').catch(() => false);
        step('API key saved in Settings → health ok', !!healthy);
        await sleep(600);
        await keyWin.screenshot(SHOTS_DIR, 'v5-live-settings-api.png');
        await keyWin.evaluate(`document.getElementById('btn-settings-close-x').click()`);
        await waitUntilGone('settings.html');
    } else {
        step('API key configured', healthBefore === 'ok', `health=${healthBefore} (set PIKA_API_KEY to enter one)`);
    }
    const bannerHidden = await evaluate(`document.getElementById('api-banner').hidden`);
    step('no health banner with a working key', !!bannerHidden);

    // 4. dropdown open/close (period)
    await evaluate(`document.getElementById('btn-period').click()`);
    const dropOpen = await waitFor(`document.getElementById('period-dropdown').classList.contains('open')`, 5000, 'period dropdown open');
    step('period dropdown opens', !!dropOpen);
    await evaluate(`document.body.click()`);
    const dropClosed = await waitFor(`!document.getElementById('period-dropdown').classList.contains('open')`, 5000, 'period dropdown closed');
    step('period dropdown closes on outside click', !!dropClosed);

    // 5. real lookups (live API): a known player and a name that cannot exist
    await evaluate(`const i=document.getElementById('search-input'); i.value='${KNOWN_PLAYER}, ${UNKNOWN_NAME}'; document.getElementById('btn-lookup').click(); true`);
    const loading = await waitFor(`document.querySelectorAll('#stats-body tr').length >= 2`, 15000, 'rows appear');
    step('search adds one row per name', !!loading);
    const settled = await waitFor(NO_ROW_LOADING, 30000, 'rows resolved').catch(() => false);
    const knownClass = await evaluate(rowClass(KNOWN_PLAYER));
    const unknownClass = await evaluate(rowClass(UNKNOWN_NAME));
    const rowText = await evaluate(`document.querySelector('#stats-body tr')?.textContent?.replace(/\s+/g, ' ').slice(0, 140) || ''`);
    step('known player resolves with stats', !!settled && !knownClass.includes('row-status'), `class="${knownClass}" ${rowText.trim()}`);
    step('typed unknown name is NOT FOUND, not NICKED', unknownClass.includes('row-not-found') && !unknownClass.includes('row-nicked'), `class="${unknownClass}"`);
    await screenshot('v5-live-lookup.png');

    // 5b. period switch re-fetches rows and keeps the classification sane
    await evaluate(`document.getElementById('btn-period').click()`);
    await evaluate(`[...document.querySelectorAll('#period-dropdown [data-value], #period-dropdown button, #period-dropdown li')].find(o => /week/i.test(o.textContent))?.click()`);
    await sleep(500);
    const weekly = await waitFor(NO_ROW_LOADING, 30000, 'weekly rows resolved').catch(() => false);
    const weeklyKnown = await evaluate(rowClass(KNOWN_PLAYER));
    const weeklyUnknown = await evaluate(rowClass(UNKNOWN_NAME));
    step('weekly: known player is stats or NO DATA, never API OFF/NICKED',
        !!weekly && !/row-api-off|row-nicked|row-error|row-auth/.test(weeklyKnown), `class="${weeklyKnown}"`);
    step('weekly: unknown name still NOT FOUND', weeklyUnknown.includes('row-not-found'), `class="${weeklyUnknown}"`);
    await screenshot('v5-live-weekly.png');
    await evaluate(`document.getElementById('btn-period').click()`);
    await evaluate(`[...document.querySelectorAll('#period-dropdown [data-value], #period-dropdown button, #period-dropdown li')].find(o => /life|total|all time/i.test(o.textContent))?.click()`);
    await sleep(500);
    await waitFor(NO_ROW_LOADING, 30000, 'lifetime rows resolved').catch(() => false);

    // 5c. watchlist: chip through IPC, text export → clear → import → chip back, list removal
    await watchlistSteps();

    // 6. clear
    await evaluate(`document.getElementById('btn-clear').click()`);
    const cleared = await waitFor(`document.querySelectorAll('#stats-body tr').length === 0`, 10000, 'table cleared');
    step('clear empties the table', !!cleared);

    // 7. compact toggle
    await evaluate(`document.getElementById('btn-toggle-view').click()`);
    const compact = await waitFor(`document.body.classList.contains('layout-compact')`, 5000, 'compact layout');
    step('compact layout toggles', !!compact);
    await evaluate(`document.getElementById('btn-toggle-view').click()`);
    await waitFor(`!document.body.classList.contains('layout-compact')`, 5000, 'detailed restored');
    step('detailed layout restores', true);

    await finish();
}

async function finish() {
    let pass = results.filter(r => r.ok).length;
    let fail = results.length - pass;
    if (results.length === 0) fail = 1; // no steps executed = failure, never a silent pass
    console.log(`\n[smoke] ${pass} passed, ${fail} failed`);
    await stopApp();
    restoreWatchlist();
    process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
    step('run completed without a fatal error', false, err.message);
    finish();
});
