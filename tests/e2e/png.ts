import { inflateSync } from 'node:zlib'; // typed in ./node-zlib.d.ts

/** Minimal PNG decoder for screenshots (8/16-bit RGB/RGBA/grey, non-interlaced). */
export interface DecodedPng {
  width: number;
  height: number;
  /** Mean of the colour channels at (x, y), 0..255. */
  lum(x: number, y: number): number;
  /** Raw channel values at (x, y). */
  rgb(x: number, y: number): [number, number, number];
}

const readU32 = (bytes: Uint8Array, at: number): number =>
  ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;

export function decodePng(file: Uint8Array): DecodedPng {
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colourType = 6;
  const idat: Uint8Array[] = [];
  while (pos < file.length) {
    const len = readU32(file, pos);
    const type = String.fromCharCode(...file.subarray(pos + 4, pos + 8));
    const data = file.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = readU32(data, 0);
      height = readU32(data, 4);
      bitDepth = data[8]!;
      colourType = data[9]!;
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colourType as 0 | 2 | 4 | 6];
  if (!channels) throw new Error(`unsupported PNG colour type ${colourType}`);
  const bpp = (channels * bitDepth) / 8;
  const stride = width * bpp;
  const total = idat.reduce((n, c) => n + c.length, 0);
  const compressed = new Uint8Array(total);
  let off = 0;
  for (const c of idat) {
    compressed.set(c, off);
    off += c.length;
  }
  const raw = inflateSync(compressed);
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp]! : 0;
      const b = y > 0 ? out[dst - stride + x]! : 0;
      const c = y > 0 && x >= bpp ? out[dst - stride + x - bpp]! : 0;
      let v = raw[src + x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[dst + x] = v & 255;
    }
  }
  const step = bitDepth === 16 ? 2 : 1;
  const colour = Math.min(channels, 3);
  return {
    width,
    height,
    lum(x, y) {
      const i = y * stride + x * bpp;
      let sum = 0;
      for (let k = 0; k < colour; k++) sum += out[i + k * step]!;
      return sum / colour;
    },
    rgb(x, y) {
      const i = y * stride + x * bpp;
      const g = (k: number): number => (colour > k ? out[i + k * step]! : out[i]!);
      return [g(0), g(1), g(2)];
    },
  };
}
