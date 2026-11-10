// Demo modu için prosedürel yedek harita üretir (tepeler, göl, yol, taş/kum/kaya dokuları; kale ve binalar istemcide js/catko-dunya.js) (gerçek harita dosyaları Supabase Storage'da, pakette yok).
// Çıktı: <klasör>/<bölge>/{meta.json, terrain.bin, tiles.png}. Gerçek harita varsa (client/zones/<bölge>) dokunulmaz.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { joinDXT, decodeDXT } from './client/js/dxt.js';

// orijinal zemin karoları (client/assets/yuzey, DXT1 dizi): CatKo karo türü → yüzey katmanı
// sıra: çim, koyu çim, toprak, taş döşeme, kum, kaya, su (null = prosedürel), kar
const ORJ_KARO = {
  moradon: [1420, 1432, 1299, 1399, 1478, 1444, null, 738],
  freezone_a: [1749, 1766, 1737, 1414, 1772, 785, null, 738],
  karus2004: [1420, 1432, 1299, 1399, 1478, 785, null, 738],
  elmo2004: [1036, 1420, 1299, 1414, 1478, 1444, null, 738],
};
let YZ = null;
function yuzeyKaro(i) {
  try {
    if (!YZ) { const kok = join(dirname(fileURLToPath(import.meta.url)), 'client', 'assets', 'yuzey'); YZ = { j: JSON.parse(readFileSync(join(kok, 'yuzey.json'), 'utf8')), b: readFileSync(join(kok, 'yuzey.bin')) }; }
    const [off, len, w, h] = YZ.j.levels[0], per = len / YZ.j.layers;
    let raw = new Uint8Array(YZ.b.buffer, YZ.b.byteOffset + off + i * per, per);
    if (YZ.j.split) raw = joinDXT(raw, YZ.j.fmt);
    return { w, h, rgba: decodeDXT(raw, YZ.j.fmt, w, h) };
  } catch (e) { console.warn('  yüzey karosu okunamadı', i, e.message); return null; }
}

function crc32(buf) { let c, t = crc32.t || (crc32.t = Array.from({ length: 256 }, (_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; })); let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; }
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const [r, g, b] = rgb(x, y); raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3); } }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

import { PLAN, heightAt, tileAt, fbm, TILE } from './client/js/catko-plan.js';

const TEX = [
  (x, y, f) => { const n = f(x, y, 3) * 26 - 13; return [66 + n, 126 + n * 1.6, 50 + n]; },              // çim
  (x, y, f) => { const n = f(x, y, 5) * 22 - 11; return [48 + n, 100 + n * 1.5, 42 + n]; },              // koyu çim
  (x, y, f) => { const n = f(x, y, 4) * 30 - 15; return [142 + n, 110 + n, 72 + n * 0.6]; },             // toprak yol
  (x, y, f) => { const br = (y % 16 < 1 || (x + ((y >> 4) % 2) * 16) % 32 < 1) ? -34 : 0, n = f(x, y, 6) * 14 - 7; return [150 + n + br, 148 + n + br, 154 + n + br]; },   // taş döşeme
  (x, y, f) => { const n = f(x, y, 7) * 18 - 9; return [216 + n, 192 + n, 132 + n]; },                  // kum
  (x, y, f) => { const n = f(x, y, 2) * 40 - 20; return [112 + n, 106 + n, 102 + n]; },                 // kaya
  (x, y, f) => { const n = Math.sin((x + y * 0.5) * Math.PI / 8) * 8 + f(x, y, 3) * 10; return [46 + n * 0.6, 112 + n, 176 + n]; },  // su
  (x, y, f) => { const n = f(x, y, 4) * 12; return [232 + n * 0.5, 238 + n * 0.5, 246]; },              // kar
];
// periyodik (kenarları dikişsiz) basit gürültü: tamsayı döngülü sinüsler
const per = (x, y, k) => { const t = Math.PI * 2 / 64; return (Math.sin(x * t * k + Math.cos(y * t * 2) * 2) * Math.sin(y * t * (k + 1) + Math.sin(x * t) * 2) + Math.sin((x + y) * t * (k + 2)) * 0.5) * 0.5 + 0.5; };

export function duzHarita(kok, bolge) {
  const P = PLAN[bolge];
  const dir = join(kok, bolge);
  if (existsSync(join(dir, 'meta.json'))) return false;
  mkdirSync(dir, { recursive: true });
  const N = 257, T = 4;
  const heights = new Float32Array(N * N), bits = new Uint32Array(N * N);
  if (P) { for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) heights[x * N + z] = heightAt(bolge, x * T, z * T); }
  else for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) heights[x * N + z] = Math.max(0, 1.2 * Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.6 * Math.sin((x + z) * 0.23));
  for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
    const h = heights[x * N + z], hx = heights[Math.min(N - 1, x + 1) * N + z], hz = heights[x * N + Math.min(N - 1, z + 1)];
    const slope = Math.hypot(hx - h, hz - h) / T * 1.0;
    const t = P ? tileAt(bolge, (x + 0.5) * T, (z + 0.5) * T, h, slope) : 0;
    const d = ((x * 7 + z * 13) >> 2) & 3;   // yön çeşitliliği: tekrar eden desen belli olmasın
    bits[x * N + z] = (1 | (d << 1) | (0 << 6) | (t << 11) | (1023 << 21)) >>> 0;
  }
  const buf = Buffer.alloc(N * N * 8); Buffer.from(heights.buffer).copy(buf, 0); Buffer.from(bits.buffer).copy(buf, N * N * 4);
  writeFileSync(join(dir, 'terrain.bin'), buf);
  const cols = 4, rows = 2, orj = (ORJ_KARO[bolge] || []).map((i) => (i == null ? null : yuzeyKaro(i)));
  const px = orj.some(Boolean) ? 128 : 64;
  writeFileSync(join(dir, 'tiles.png'), png(cols * px, rows * px, (X, Y) => {
    const i = Math.floor(Y / px) * cols + Math.floor(X / px), o = orj[i], x = X % px, y = Y % px;
    if (o) { const k = ((y % o.h) * o.w + (x % o.w)) * 4; return [o.rgba[k], o.rgba[k + 1], o.rgba[k + 2]]; }
    const f = 64 / px; return TEX[i](Math.floor(x * f * 2) % 64, Math.floor(y * f * 2) % 64, per).map((v) => Math.max(0, Math.min(255, Math.round(v))));
  }));
  const start = P?.start || [760, 560];
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ size: N, tileSize: T, worldSize: (N - 1) * T, tileCount: cols * rows, atlas: { cols, tilePx: px }, images: 'png', start, demo: true, catko: true }));
  return true;
}
