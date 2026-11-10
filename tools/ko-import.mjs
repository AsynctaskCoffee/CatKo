#!/usr/bin/env node
// CatKo — YEREL orijinal arazi içe aktarıcı (GTD → terrain.bin + meta.json).
// Kendi bilgisayarındaki, kendi sahip olduğun istemci dosyalarını okur; çıktı client/zones/<bölge>/ altına yazılır.
// client/zones/ .gitignore'dadır: orijinal veri repoya / GitHub Pages'e GİRMEZ. Sadece yerel denemeler içindir.
//
// Kullanım:  node tools/ko-import.mjs <dosya.gtd> <bölge: moradon|freezone_a> [--tiles N]
// Yalnızca arazi yüksekliği ve karo indeksleri okunur. Nesneler (bina/sur) ve karo dokuları (DXT) dönüştürülmez:
// karo dokuları için CatKo'nun kendi atlası kullanılır (indeks % karo sayısı), nesneler için prosedürel yapılar.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { duzHarita } from '../tools-duz-harita.mjs';

const [, , src, zone, ...rest] = process.argv;
if (!src || !zone) { console.error('Kullanım: node tools/ko-import.mjs <dosya.gtd> <moradon|freezone_a>'); process.exit(1); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buf = readFileSync(src), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

function dene(off, adlı) {
  let p = off;
  if (adlı) { const ver = dv.getInt32(p, true); p += 4; if (ver < 0 || ver > 2) return null; const nl = dv.getInt32(p, true); p += 4; if (nl < 0 || nl > 30) return null; p += nl; }
  const N = dv.getInt32(p, true); p += 4;
  if (N <= 4 || N > 4097 || (N - 1) % 4) return null;
  if (p + N * N * 8 > buf.length) return null;
  // yükseklikler makul mü?
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < N * N; i += 97) { const h = dv.getFloat32(p + i * 8, true); if (!Number.isFinite(h)) return null; mn = Math.min(mn, h); mx = Math.max(mx, h); }
  if (mx - mn > 3000 || mn < -2000) return null;
  return { N, p };
}
const r = dene(0, true) || dene(0, false);
if (!r) { console.error('GTD başlığı tanınmadı (desteklenen: 1264 / 1098).'); process.exit(2); }
const { N, p } = r;
const heights = new Float32Array(N * N), bits = new Uint32Array(N * N);
// dosyada sıra [x*N+z]; istemci terrain.bin düzeni de aynı MAPDATA dizilimi (x*N+z)
for (let i = 0; i < N * N; i++) { heights[i] = dv.getFloat32(p + i * 8, true); bits[i] = dv.getUint32(p + i * 8 + 4, true); }
const tileCount = Number((rest[rest.indexOf('--tiles') + 1]) || 8);
for (let i = 0; i < N * N; i++) {   // karo indekslerini CatKo atlasına indir (10 bit alanlar: t1 = bit 11, t2 = bit 21)
  const b = bits[i], t1 = (b >>> 11) & 1023, t2 = (b >>> 21) & 1023;
  const m = (t) => (t >= 1023 ? tileCount : t % tileCount);
  bits[i] = (b & 0x7ff) | (m(t1) << 11) | (m(t2) << 21);
}
const dir = join(root, 'client', 'zones', zone);
mkdirSync(dir, { recursive: true });
// CatKo'nun düz harita üreticisinden doku atlasını al, sonra arazi + meta'yı orijinalle değiştir
const tmp = join(root, '.tmp-zones'); duzHarita(tmp, zone);
copyFileSync(join(tmp, zone, 'tiles.png'), join(dir, 'tiles.png'));
const out = Buffer.alloc(N * N * 8); Buffer.from(heights.buffer).copy(out, 0); Buffer.from(bits.buffer).copy(out, N * N * 4);
writeFileSync(join(dir, 'terrain.bin'), out);
const meta = JSON.parse(readFileSync(join(tmp, zone, 'meta.json'), 'utf8'));
Object.assign(meta, { size: N, tileSize: 4, worldSize: (N - 1) * 4, demo: false, catko: false, yerelOrijinal: true });
writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
console.log(`✔ ${zone}: ${N}×${N} arazi yazıldı → client/zones/${zone}/ (yükseklik ${Math.min(...heights).toFixed(1)}…${Math.max(...heights).toFixed(1)} m)`);
console.log('  Sonra: node build.mjs && PORT=8099 node server.mjs  (bu klasör .gitignore\'da, yayına gitmez)');
