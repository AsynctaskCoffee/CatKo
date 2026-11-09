// KO Web dosya önbelleği (launcher ile birlikte). Oyun dosyaları (assets/, js/, vendor/, client.css) ve Supabase Storage'daki
// paketler (npc/, esya/, muzik/, haritalar) Cache Storage'dan anında verilir; launcher bunları önceden indirir ve tazeler.
// Tazelik: site dosyaları ko-manifest.json'daki içerik özetiyle (x-ko-h başlığı), Storage dosyaları güncellenme zamanıyla.
// HTML sayfaları, Supabase REST / RPC / Realtime ve .json Storage dosyaları hiç önbelleğe alınmaz (her zaman ağ).
const CACHE = 'ko-dosyalar-v1';
const DEPO = 'https://vnlevnlsyyqkofnplzdm.supabase.co/storage/v1/object/public/zones/';
let MAN = null, manV = '', manT = 0, manP = null;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Alt dizinde (GitHub Pages: /depo-adi/) da çalışsın: yollar sw.js'nin bulunduğu dizine göre
const BASE = new URL('./', self.location).pathname;
const goreli = (u) => (u.pathname.startsWith(BASE) ? u.pathname.slice(BASE.length) : '');
const siteDosyasi = (u) => u.origin === self.location.origin && /^(assets|js|vendor)\/|^client\.css$/.test(goreli(u));
const depoDosyasi = (u) => u.href.startsWith(DEPO) && !/\.json$/i.test(u.pathname);

async function manifest(v) {
  const eski = !MAN || (v && v !== manV) || Date.now() - manT > 300000;
  if (!eski) return MAN;
  manP ||= fetch(BASE + 'ko-manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((m) => { if (m) { MAN = m; manV = m.v; manT = Date.now(); } return MAN; }).catch(() => MAN).finally(() => { manP = null; });
  return manP;
}

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range') || r.mode === 'navigate') return;
  let u; try { u = new URL(r.url); } catch { return; }
  const site = siteDosyasi(u), depo = !site && depoDosyasi(u);
  if (!site && !depo) return;
  e.respondWith((async () => {
    const anahtar = u.origin + u.pathname;
    try {
      const c = await caches.open(CACHE);
      const hit = await c.match(anahtar);
      let ozet = '';
      if (site) {
        const m = await manifest(u.searchParams.get('v'));
        const f = m?.files?.[goreli(u)];
        ozet = f ? f[1] : '';
        if (hit && (!m || !f || hit.headers.get('x-ko-h') === ozet)) return hit;   // çevrimdışı / güncel
      } else if (hit) return hit;   // Storage: tazeliği launcher denetler
      const res = await fetch(r.mode === 'no-cors' ? r : new Request(u.href, { mode: 'cors', credentials: 'omit', cache: 'no-store' }));
      if (res.ok && res.status === 200 && res.type !== 'opaque') {
        const h = new Headers(res.headers);
        h.set('x-ko-h', site ? ozet : String(Math.floor(Date.parse(res.headers.get('last-modified') || '') / 1000) || 0));
        const kopya = res.clone();
        e.waitUntil(kopya.blob().then((b) => c.put(anahtar, new Response(b, { status: 200, headers: h }))).catch(() => {}));
      }
      return res;
    } catch (err) {
      return fetch(r);
    }
  })());
});
