import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import type { RGBA } from '../drawing';

/** Minimal PNG reader for tests (8-bit grey/RGB/RGBA/palette, not interlaced). The app itself uses a canvas. */
export function readPng(path: string): RGBA {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0, height = 0, type = 0, depth = 0;
  let palette: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error('only 8-bit PNG');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]!;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= ch ? px[y * stride + x - ch] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      px[y * stride + x] = (v + pred) & 255;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = px.subarray(i * ch, i * ch + ch);
    const [r, g, b, a] =
      type === 3 ? [...palette!.subarray(s[0] * 3, s[0] * 3 + 3), 255] : ch === 1 ? [s[0], s[0], s[0], 255] : ch === 2 ? [s[0], s[0], s[0], s[1]] : ch === 3 ? [s[0], s[1], s[2], 255] : [...s];
    data.set([r, g, b, a], i * 4);
  }
  return { width, height, data };
}
