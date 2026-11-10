// KO Web derleme: client/ → dist/
//  - __SURUM__ yer tutucusunu yeni sürüm damgasıyla değiştirir (HTML'lerde ?v= ve window.KO_SURUM)
//  - assets/, js/, vendor/, client.css için ko-manifest.json üretir  { v, files: { yol: [boyut, md5(12)] } }
//    (sw.js ve launcher bu dosyayı önbellek tazeliği için kullanır)
import { createHash } from 'node:crypto';
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = dirname(fileURLToPath(import.meta.url));
const SRC = join(kok, 'client'), OUT = join(kok, 'dist');
const surum = Date.now().toString(36);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true });

const yürü = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? yürü(p) : [p]; });

// 1) sürüm damgası
let damgali = 0;
for (const f of yürü(OUT)) {
  if (!/\.(html|js|css)$/.test(f)) continue;
  const s = readFileSync(f, 'utf8');
  if (s.includes('__SURUM__')) { writeFileSync(f, s.replaceAll('__SURUM__', surum)); damgali++; }
}

// 1b) demo: eksik haritalar için düz yedek (gerçek harita dosyası client/zones/<bölge>/ altına konursa o kullanılır)
import { duzHarita } from './tools-duz-harita.mjs';
for (const b of ['moradon', 'freezone_a', 'karus2004', 'elmo2004']) if (duzHarita(join(OUT, 'zones'), b)) console.log(`  düz demo haritası: zones/${b}`);

// 2) manifest
const files = {};
const izle = [...yürü(join(OUT, 'assets')), ...yürü(join(OUT, 'js')), ...yürü(join(OUT, 'vendor')), join(OUT, 'client.css')];
// assets/dunya-kutup/ (harita parçaları, ~100 MB) launcher'ın ön-indirme listesine girmez; oyun bunları gerektikçe çeker
const HARIC = /^assets\/dunya-kutup\//;
for (const f of izle.sort()) {
  if (HARIC.test(relative(OUT, f).split('\\').join('/'))) continue;
  const b = readFileSync(f);
  files[relative(OUT, f).split('\\').join('/')] = [b.length, createHash('md5').update(b).digest('hex').slice(0, 12)];
}
writeFileSync(join(OUT, 'ko-manifest.json'), JSON.stringify({ v: surum, files }));

console.log(`✔ build tamam → dist/  (sürüm ${surum}, ${damgali} dosyada damga, ${Object.keys(files).length} dosya manifestte)`);
