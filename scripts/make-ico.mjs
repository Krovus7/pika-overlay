import { readFileSync, writeFileSync } from 'node:fs';

// Wraps a PNG into an ICO container (PNG-in-ICO is supported by Windows Vista+).
const png = readFileSync(new URL('../assets/icon.png', import.meta.url));
const size = Math.min(256, Math.floor(Math.sqrt(png.length)));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry.writeUInt8(size >= 256 ? 0 : size, 0);
entry.writeUInt8(size >= 256 ? 0 : size, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12);

const ico = Buffer.concat([header, entry, png]);
const out = new URL('../assets/icon.ico', import.meta.url);
writeFileSync(out, ico);
console.log(`[make-ico] Wrote ${out.pathname} (${ico.length} bytes)`);
