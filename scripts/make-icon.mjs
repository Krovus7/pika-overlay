/**
 * Renders assets/icon.svg (and the simplified assets/icon-small.svg for tiny
 * sizes) into assets/icon.png and a multi-size assets/icon.ico.
 *
 * Runs inside Electron, which is already a dev dependency, so no image library
 * is needed:  electron scripts/make-icon.mjs
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { app, BrowserWindow } from 'electron';

const ASSETS = new URL('../assets/', import.meta.url);
const RENDER_SIZE = 1024;
const PNG_SIZE = 512;
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const SMALL_UP_TO = 32;
const PAINT_WAIT_MS = 1200;

/** Offscreen window: the first complete frame arrives on 'paint', no visible window needed. */
async function renderSvg(fileName) {
    const win = new BrowserWindow({
        width: RENDER_SIZE, height: RENDER_SIZE, useContentSize: true,
        show: false, frame: false, transparent: true,
        webPreferences: { offscreen: true },
    });
    let latest = null;
    win.webContents.on('paint', (_event, _dirty, image) => { latest = image; });
    await win.loadFile(fileURLToPath(new URL(fileName, ASSETS)));
    win.webContents.invalidate();
    await sleep(PAINT_WAIT_MS);
    win.destroy();
    if (!latest || latest.isEmpty()) throw new Error(`no frame painted for ${fileName}`);
    return centredSquare(latest);
}

/** The OS may clamp the window to the screen; the SVG stays centred, so crop to the short side. */
function centredSquare(image) {
    const { width, height } = image.getSize();
    const side = Math.min(width, height);
    if (side < PNG_SIZE) throw new Error(`frame too small: ${width}x${height}`);
    return image.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side });
}

function pngAt(image, size) {
    return image.resize({ width: size, height: size, quality: 'best' }).toPNG();
}

/** ICO container holding one PNG per size (PNG-in-ICO, Windows Vista+). */
function buildIco(entries) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(entries.length, 4);

    const directory = Buffer.alloc(16 * entries.length);
    let offset = header.length + directory.length;
    entries.forEach(({ size, png }, i) => {
        const at = i * 16;
        directory.writeUInt8(size >= 256 ? 0 : size, at);
        directory.writeUInt8(size >= 256 ? 0 : size, at + 1);
        directory.writeUInt16LE(1, at + 4);
        directory.writeUInt16LE(32, at + 6);
        directory.writeUInt32LE(png.length, at + 8);
        directory.writeUInt32LE(offset, at + 12);
        offset += png.length;
    });
    return Buffer.concat([header, directory, ...entries.map(e => e.png)]);
}

async function main() {
    const full = await renderSvg('icon.svg');
    const small = await renderSvg('icon-small.svg');

    writeFileSync(new URL('icon.png', ASSETS), pngAt(full, PNG_SIZE));
    const entries = ICO_SIZES.map(size => ({ size, png: pngAt(size <= SMALL_UP_TO ? small : full, size) }));
    writeFileSync(new URL('icon.ico', ASSETS), buildIco(entries));
    console.log(`[make-icon] icon.png ${PNG_SIZE}px, icon.ico ${ICO_SIZES.join('/')}px`);

    if (process.env.ICON_PREVIEW_DIR) {
        for (const { size, png } of entries) writeFileSync(`${process.env.ICON_PREVIEW_DIR}/icon-${size}.png`, png);
    }
}

// Closing a render window must not end the run before the next one opens.
app.on('window-all-closed', () => undefined);

// Not a top-level await: Electron holds 'ready' back until the ESM entry has finished loading.
app.whenReady()
    .then(main)
    .then(() => app.exit(0))
    .catch(err => {
        console.error('[make-icon] failed:', String(err));
        app.exit(1);
    });
