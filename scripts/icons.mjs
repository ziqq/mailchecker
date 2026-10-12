/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Renders the original toolbar icons into `src/icons/` without dependencies.
 *
 * A near-black rounded square with a white rounded envelope and a dark flap,
 * supersampled 4× for anti-aliasing and encoded as RGBA PNG.
 *
 * Usage: `node scripts/icons.mjs`.
 */
import {writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';

/** Output directory. */
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/icons');

/** Background, envelope and flap colours. */
const BG = [11, 11, 13];
const ENVELOPE = [250, 250, 250];
const FLAP = [11, 11, 13];

/** CRC-32 lookup table for PNG chunks. */
const table = Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** Returns the CRC-32 of [bytes]. */
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

/** Returns one PNG chunk. */
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Returns the colour of a supersample at (x, y) in a canvas of size [n], or null outside the icon. */
function sample(x, y, n) {
  const r = n * 0.24;
  const cx = Math.min(Math.max(x, r), n - r);
  const cy = Math.min(Math.max(y, r), n - r);
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;
  const left = n * 0.12;
  const right = n * 0.88;
  const top = n * 0.24;
  const bottom = n * 0.76;
  if (x < left || x > right || y < top || y > bottom) return BG;
  // Rounded envelope corners.
  const corner = n * 0.06;
  const ex = Math.min(Math.max(x, left + corner), right - corner);
  const ey = Math.min(Math.max(y, top + corner), bottom - corner);
  if ((x - ex) ** 2 + (y - ey) ** 2 > corner * corner) return BG;
  const u = (x - left) / (right - left);
  const flap = top + (bottom - top) * 0.58 * (1 - Math.abs(u * 2 - 1));
  return Math.abs(y - flap) < Math.max(n * 0.05, 3) ? FLAP : ENVELOPE;
}

/** Renders a PNG of [size] pixels. */
function png(size) {
  const scale = 4;
  const n = size * scale;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 4 + 1);
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy++)
        for (let sx = 0; sx < scale; sx++) {
          const color = sample(x * scale + sx + 0.5, y * scale + sy + 0.5, n);
          if (!color) continue;
          sum[0] += color[0];
          sum[1] += color[1];
          sum[2] += color[2];
          sum[3] += 1;
        }
      const offset = 1 + x * 4;
      if (sum[3]) for (let c = 0; c < 3; c++) row[offset + c] = Math.round(sum[c] / sum[3]);
      row[offset + 3] = Math.round((sum[3] / scale ** 2) * 255);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) writeFileSync(resolve(out, `icon${size}.png`), png(size));
console.log('Rendered src/icons/icon{16,32,48,128}.png.');
