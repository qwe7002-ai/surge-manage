// Generates build/icon.png (1024x1024) with no image dependencies — a dark
// zinc panel with rounded corners and an emerald "throughput" emblem (three
// ascending bars). Run: `node build/make-icon.mjs`. Replace with real artwork
// any time; electron-builder derives the .icns/.ico from this PNG.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SIZE = 1024;
const RADIUS = 184; // rounded-corner radius

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// Background vertical gradient (zinc-900 → near-black) and emerald emblem.
const TOP = [24, 24, 27];
const BOTTOM = [9, 9, 11];
const ACCENT = [52, 211, 153];
const ACCENT_DIM = [16, 122, 87];

function inRoundedRect(x, y) {
  const r = RADIUS;
  const minX = r;
  const maxX = SIZE - r;
  const minY = r;
  const maxY = SIZE - r;
  let cx = x;
  let cy = y;
  if (x < minX) cx = minX;
  else if (x > maxX) cx = maxX;
  if (y < minY) cy = minY;
  else if (y > maxY) cy = maxY;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// Three ascending bars, centered.
const bars = (() => {
  const count = 3;
  const barW = 150;
  const gap = 60;
  const totalW = count * barW + (count - 1) * gap;
  const startX = (SIZE - totalW) / 2;
  const baseY = 700;
  const heights = [220, 330, 440];
  return heights.map((h, i) => ({
    x0: startX + i * (barW + gap),
    x1: startX + i * (barW + gap) + barW,
    y0: baseY - h,
    y1: baseY,
  }));
})();

function inBar(x, y) {
  for (const b of bars) {
    if (x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1) return true;
  }
  return false;
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filter: none
  const t = y / (SIZE - 1);
  for (let x = 0; x < SIZE; x++) {
    if (!inRoundedRect(x, y)) {
      raw[p++] = 0;
      raw[p++] = 0;
      raw[p++] = 0;
      raw[p++] = 0; // transparent outside the rounded panel
      continue;
    }
    let r;
    let g;
    let b;
    if (inBar(x, y)) {
      // Slight vertical shade within the emblem.
      const tb = y / SIZE;
      r = lerp(ACCENT[0], ACCENT_DIM[0], tb);
      g = lerp(ACCENT[1], ACCENT_DIM[1], tb);
      b = lerp(ACCENT[2], ACCENT_DIM[2], tb);
    } else {
      r = lerp(TOP[0], BOTTOM[0], t);
      g = lerp(TOP[1], BOTTOM[1], t);
      b = lerp(TOP[2], BOTTOM[2], t);
    }
    raw[p++] = r;
    raw[p++] = g;
    raw[p++] = b;
    raw[p++] = 255;
  }
}

// --- PNG container ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), "icon.png");
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
