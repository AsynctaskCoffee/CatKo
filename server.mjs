// KO Web sunucusu — bağımlılıksız statik sunucu (Node >= 18).
//   node server.mjs          → dist/ klasörünü sunar (önce `npm run build`)
//   node server.mjs --dev    → client/ klasörünü doğrudan sunar (build gerekmez; sürüm yer tutucusu "__SURUM__" kalır)
// Ortam: PORT (varsayılan 8080), HOST (varsayılan 0.0.0.0)
// Oyun verisi/kimlik doğrulama Supabase'dedir (istemci doğrudan bağlanır); bu sunucu yalnızca siteyi servis eder.
import http from 'node:http';
import { createReadStream, statSync, existsSync, readFileSync } from 'node:fs';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { createHash } from 'node:crypto';

const kok = dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const ROOT = join(kok, dev ? 'client' : 'dist');
const PORT = +process.env.PORT || 8080, HOST = process.env.HOST || '0.0.0.0';
if (!existsSync(ROOT)) { console.error(`Klasör yok: ${ROOT}${dev ? '' : '\nÖnce: npm run build'}`); process.exit(1); }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
};
const SIKISTIR = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.wasm']);
const onbellek = new Map();   // sıkıştırılmış çıktı önbelleği: yol → {mtime, br, gz}

function gonder(req, res, dosya, st) {
  const ext = extname(dosya).toLowerCase();
  const tur = MIME[ext] || 'application/octet-stream';
  const etag = 'W/"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
  const baslik = { 'Content-Type': tur, ETag: etag, 'Last-Modified': st.mtime.toUTCString(), 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
  // oyun dosyaları her açılışta doğrulanır (değişmediyse 304); sw.js + html asla önbelleğe takılmaz
  baslik['Cache-Control'] = ext === '.html' || dosya.endsWith('sw.js') || dosya.endsWith('ko-manifest.json') ? 'no-cache' : 'no-cache, must-revalidate';
  if (dosya.endsWith('sw.js')) baslik['Service-Worker-Allowed'] = '/';
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, baslik); return res.end(); }

  const ae = String(req.headers['accept-encoding'] || '');
  if (SIKISTIR.has(ext) && st.size > 1024 && !req.headers.range && /\b(br|gzip)\b/.test(ae)) {
    let c = onbellek.get(dosya);
    if (!c || c.mtime !== st.mtimeMs) { c = { mtime: st.mtimeMs, br: null, gz: null, ham: readFileSync(dosya) }; onbellek.set(dosya, c); }
    const br = /\bbr\b/.test(ae);
    const cikti = br ? (c.br ||= brotliCompressSync(c.ham, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })) : (c.gz ||= gzipSync(c.ham, { level: 6 }));
    res.writeHead(200, { ...baslik, 'Content-Encoding': br ? 'br' : 'gzip', Vary: 'Accept-Encoding', 'Content-Length': cikti.length });
    return req.method === 'HEAD' ? res.end() : res.end(cikti);
  }
  let bas = 0, son = st.size - 1, kod = 200;
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (r && (r[1] || r[2])) {
    if (r[1]) { bas = +r[1]; if (r[2]) son = Math.min(+r[2], son); } else { bas = Math.max(0, st.size - +r[2]); }
    if (bas > son || bas >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    kod = 206; baslik['Content-Range'] = `bytes ${bas}-${son}/${st.size}`;
  }
  res.writeHead(kod, { ...baslik, 'Content-Length': son - bas + 1 });
  if (req.method === 'HEAD') return res.end();
  createReadStream(dosya, { start: bas, end: son }).on('error', () => res.destroy()).pipe(res);
}

http.createServer((req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    let yol = decodeURIComponent(req.url.split('?')[0].split('#')[0].replace(/^\/+/, '/'));
    if (yol.includes('\0')) throw new Error('bad');
    if (yol.endsWith('/')) yol += 'index.html';
    const dosya = normalize(join(ROOT, yol));
    if (dosya !== ROOT && !dosya.startsWith(ROOT + sep)) { res.writeHead(403); return res.end('403'); }
    let st; try { st = statSync(dosya); } catch { st = null; }
    if (st?.isDirectory()) { res.writeHead(301, { Location: yol.replace(/\/?$/, '/') }); return res.end(); }
    if (!st) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Bulunamadı'); }
    gonder(req, res, dosya, st);
  } catch { res.writeHead(400); res.end('400'); }
}).listen(PORT, HOST, () => console.log(`KO Web ${dev ? '(dev: client/)' : '(dist/)'} → http://localhost:${PORT}`));
