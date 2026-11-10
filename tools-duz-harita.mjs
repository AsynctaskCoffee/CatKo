// Demo modu için düz yedek harita üretir (gerçek harita dosyaları Supabase Storage'da, pakette yok).
// Çıktı: <klasör>/<bölge>/{meta.json, terrain.bin, tiles.png}. Gerçek harita varsa (client/zones/<bölge>) dokunulmaz.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function crc32(buf) { let c, t = crc32.t || (crc32.t = Array.from({ length: 256 }, (_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; })); let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; }
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const [r, g, b] = rgb(x, y); raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3); } }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function duzHarita(kok, bolge) {
  const dir = join(kok, bolge);
  if (existsSync(join(dir, 'meta.json'))) return false;
  mkdirSync(dir, { recursive: true });
  const N = 257, T = 4;
  const heights = new Float32Array(N * N), bits = new Uint32Array(N * N);
  const full = 1 | (0 << 1) | (0 << 6) | (0 << 11) | (1023 << 21);   // dolu karo, yön 0, karo 0, 2. karo yok
  for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
    heights[x * N + z] = Math.max(0, 1.2 * Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.6 * Math.sin((x + z) * 0.23));
    bits[x * N + z] = full >>> 0;
  }
  const buf = Buffer.alloc(N * N * 8); Buffer.from(heights.buffer).copy(buf, 0); Buffer.from(bits.buffer).copy(buf, N * N * 4);
  writeFileSync(join(dir, 'terrain.bin'), buf);
  writeFileSync(join(dir, 'tiles.png'), png(64, 64, (x, y) => { const n = ((x * 7 + y * 13) % 11) - 5; return [64 + n, 122 + n * 2, 52 + n]; }));
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ size: N, tileSize: T, worldSize: (N - 1) * T, tileCount: 1, atlas: { cols: 1, tilePx: 64 }, images: 'png', start: [760, 560], demo: true }));
  return true;
}
