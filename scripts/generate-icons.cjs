/**
 * Generates assets/icon.png (512x512) and assets/icon.ico (256x256)
 * using only Node.js built-ins — no extra dependencies required.
 *
 * Run once before packaging:  node scripts/generate-icons.cjs
 */
'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── PNG helpers ────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf  = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPNG(w, h, drawPixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4);
    row[0] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = drawPixel(x, y, w, h);
      const o = 1 + x * 4;
      row[o] = r; row[o+1] = g; row[o+2] = b; row[o+3] = a;
    }
    rows.push(row);
  }

  const raw        = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── ICO wrapper ────────────────────────────────────────────────────────────────
// Wraps a single PNG inside a Windows .ico container (Vista+ supports PNG-in-ICO)

function createICO(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: ICO
  header.writeUInt16LE(1, 4); // image count: 1

  const entry = Buffer.alloc(16);
  entry[0] = 0;   // width:  0 == 256
  entry[1] = 0;   // height: 0 == 256
  entry[2] = 0;   // color count (0 for 32-bit)
  entry[3] = 0;   // reserved
  entry.writeUInt16LE(1,  4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8); // image data size
  entry.writeUInt32LE(22, 12);        // offset (header=6 + entry=16)

  return Buffer.concat([header, entry, png]);
}

// ── Icon design: military compass rose ────────────────────────────────────────
//
//   • Dark military-green circle background (#1a4d2e)
//   • Gold border ring near the edge
//   • 8-pointed compass star (4 cardinal + 4 diagonal arms) in gold
//   • Brighter center jewel
//   • Sub-pixel anti-aliased circle edge

function drawIconPixel(x, y, w, h) {
  const cx = w / 2, cy = h / 2;
  const dx = x - cx, dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const R = w * 0.47;

  // Outside circle → transparent
  if (dist > R + 0.5) return [0, 0, 0, 0];

  // Anti-alias circle edge
  const alpha = dist > R - 0.5 ? Math.round(255 * (R + 0.5 - dist)) : 255;

  // Gold border ring
  if (dist > R * 0.87) return [0xc8, 0x96, 0x20, alpha];

  if (dist < 1) return [0x1a, 0x4d, 0x2e, alpha]; // avoid zero-dist edge case

  const adx = Math.abs(dx), ady = Math.abs(dy);

  // Arm widths taper toward tips for a sharper star
  const taper   = 1 - (dist / (R * 0.88)) * 0.35;
  const cardW   = R * 0.13 * taper;  // cardinal (N/S/E/W)
  const diagW   = R * 0.09 * taper;  // diagonal  (NE/SE/SW/NW)

  const inCardinal = (adx < cardW || ady < cardW) && dist < R * 0.84;
  const inDiagonal = Math.abs(adx - ady) < diagW  && dist < R * 0.63 && dist > R * 0.04;
  const inCenter   = dist < R * 0.17;
  const inCoreGlow = dist < R * 0.07;

  if (inCardinal || inDiagonal || inCenter) {
    const t  = Math.max(0, 1 - dist / (R * 0.88));
    const gr = Math.min(255, Math.round(0xc8 + t * 37));
    const gg = Math.min(255, Math.round(0x96 + t * 25));
    if (inCoreGlow) return [0xff, 0xe8, 0x70, alpha]; // bright center jewel
    return [gr, gg, 0x20, alpha];
  }

  return [0x1a, 0x4d, 0x2e, alpha]; // dark green background
}

// ── Generate & save ───────────────────────────────────────────────────────────

const assetsDir = path.join(__dirname, '..', 'assets');

const png512 = createPNG(512, 512, drawIconPixel);
const png256 = createPNG(256, 256, drawIconPixel);
const ico    = createICO(png256);

fs.writeFileSync(path.join(assetsDir, 'icon.png'), png512);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);

console.log('Icons written:');
console.log('  assets/icon.png  (512×512 RGBA PNG)');
console.log('  assets/icon.ico  (256×256 in ICO container)');
