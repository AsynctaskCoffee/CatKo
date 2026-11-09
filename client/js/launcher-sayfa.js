// launcher.html: web sitesindeki "Oyna" buraya gelir. Oyunun tüm dosyalarını (site: ko-manifest.json; Supabase Storage: npc / esya /
// muzik paketleri — launcher_dosyalar RPC) tarayıcının kalıcı önbelleğine (Cache Storage, sw.js) indirir, eskiyenleri tazeler,
// yüklenecek boyutu / hızı / kalan süreyi gösterir. Bitince START GAME → oyun.html. Haritalar oyunda yalnız harita geçişinde yüklenir
// (ilk ziyaretten sonra o da önbellekten).
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { launcherKur, sunucuIzle } from './launcher-ui.js';

const CACHE = 'ko-dosyalar-v1';
const DEPO = SUPABASE_URL + '/storage/v1/object/public/zones/';
const AYAR_KEY = 'ko-launcher-ayar';
let ayar = { modeller: true, muzik: true }; try { Object.assign(ayar, JSON.parse(localStorage.getItem(AYAR_KEY) || '{}')); } catch {}
const ayarKaydet = () => { try { localStorage.setItem(AYAR_KEY, JSON.stringify(ayar)); } catch {} };
const MB = (b) => (b / 1048576).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB';
const sure = (s) => (s >= 60 ? `${Math.floor(s / 60)} dk ${Math.round(s % 60)} sn` : `${Math.max(1, Math.round(s))} sn`);
const ADIMLAR = ['Preparing game files...', 'Loading map data...', 'Starting game...'];

const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
// OPTION ekranı (launcher-ui.js): önindirme seçimleri, önbellek boyutu, doğrula / temizle
const SECENEK = {
  durum: () => ({ modeller: ayar.modeller, muzik: ayar.muzik, onbellek: toplamOnbellek }),
  kaydet: (y) => { const degisti = y.modeller !== ayar.modeller || y.muzik !== ayar.muzik; Object.assign(ayar, y); ayarKaydet(); if (degisti) calis(true); },
  dogrula: () => calis(true),
  temizle: async () => { await caches.delete(CACHE).catch(() => {}); calis(true); },
};
const L = launcherKur({ ayarlar: SECENEK, dogrula: () => calis(true) });
L.surum('v1.0.0');
L.adim(ADIMLAR, 0); L.ilerleme(0);
sunucuIzle(sb, L);

let toplamOnbellek = 0;

let calisiyor = null;
async function calis(zorla = false) {
  if (calisiyor && !zorla) return calisiyor;
  const benim = {}; calisiyor = benim;
  if (zorla) { L.yenidenBasla?.(); L.dogrulaniyor?.(true); L.ilerleme(0); }
  try {
    await indir(benim);
  } catch (e) {
    console.warn('launcher', e);
    L.baslik('Dosyalar indirilemedi'); L.adim(`Connection problem: ${e?.message || e}. You can still start the game; files will load in game.`);
    L.hazir('Game ready (online loading)');
  }
}

async function indir(benim) {
  if (!('caches' in window) || !('serviceWorker' in navigator)) { L.adim('This browser does not support caching; files will load in game.'); L.hazir(); return; }
  L.baslik('Loading game...'); L.adim(ADIMLAR, 0);
  await navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e));
  // 1) dosya listeleri
  const [man, depo] = await Promise.all([
    fetch('ko-manifest.json', { cache: 'no-store' }).then((r) => r.json()),
    sb ? sb.rpc('launcher_dosyalar').then(({ data, error }) => { if (error) throw error; return Array.isArray(data) ? data : []; }) : [],
  ]);
  if (calisiyor !== benim) return;
  const kok = new URL('./', location.href).href, origin = location.origin;
  const liste = Object.entries(man.files).map(([p, [s, h]]) => ({ url: new URL(p, kok).href, anahtar: origin + new URL(p, kok).pathname, s, h }));
  const depoSurum = new Map();
  for (const [p, s, u] of depo) {
    const url = DEPO + p; depoSurum.set(url, String(u));
    if (/\.json$/i.test(p)) continue;
    const ust = p.split('/')[0];
    if ((ust === 'npc' || ust === 'esya') && ayar.modeller) liste.push({ url, anahtar: url, s, h: String(u), depo: true });
    else if (ust === 'muzik' && ayar.muzik) liste.push({ url, anahtar: url, s, h: String(u), depo: true });
  }
  const toplam = liste.reduce((a, f) => a + f.s, 0);
  // 2) önbellekte olanlar (içerik özeti / güncellenme zamanı aynıysa yeniden indirilmez); eskiyenler ve artık olmayanlar silinir
  L.adim([`Dosyalar denetleniyor... (${liste.length.toLocaleString('tr-TR')} dosya, ${MB(toplam)})`, ADIMLAR[1], ADIMLAR[2]], 0);
  const c = await caches.open(CACHE);
  const kayitli = new Map();
  const keys = await c.keys();
  for (let i = 0; i < keys.length; i += 64) {
    await Promise.all(keys.slice(i, i + 64).map(async (k) => { const r = await c.match(k); kayitli.set(k.url, { h: r?.headers.get('x-ko-h') || '', s: Number(r?.headers.get('content-length')) || 0 }); }));
    L.ilerleme(0.02 * i / Math.max(1, keys.length));
  }
  const siteSet = new Set(liste.filter((f) => !f.depo).map((f) => f.anahtar));
  const sil = [];
  for (const [url, k] of kayitli) {
    if (url.startsWith(DEPO)) { const u = depoSurum.get(url); if (!u || (k.h && k.h !== u && Math.abs(Number(k.h) - Number(u)) > 2)) sil.push(url); }   // Storage: silinmiş ya da güncellenmiş
    else if (url.startsWith(origin) && !siteSet.has(url)) sil.push(url);   // yayından kalkmış site dosyası
  }
  await Promise.all(sil.map((u) => c.delete(u)));
  const ayni = (f) => { const k = kayitli.get(f.anahtar); if (!k || sil.includes(f.anahtar)) return false; return f.depo ? !k.h || k.h === f.h || Math.abs(Number(k.h) - Number(f.h)) <= 2 : k.h === f.h; };
  const gerek = liste.filter((f) => !ayni(f));
  let bitti = toplam - gerek.reduce((a, f) => a + f.s, 0);
  toplamOnbellek = bitti;
  const gerekBoyut = gerek.reduce((a, f) => a + f.s, 0);
  // 3) indirme (6 paralel, akış okunarak bayt bazlı ilerleme, hız ve kalan süre)
  let inen = 0, dosya = 0, hata = 0;
  const t0 = performance.now();
  const ciz = () => {
    const sn = (performance.now() - t0) / 1000, hiz = inen / Math.max(0.5, sn), kalan = (gerekBoyut - inen) / Math.max(1, hiz);
    L.ilerleme(0.02 + 0.96 * (bitti + inen) / Math.max(1, toplam));
    L.adim([gerek.length ? `Downloading: ${MB(bitti + inen)} / ${MB(toplam)}` : ADIMLAR[0],
      gerek.length ? `${dosya.toLocaleString('tr-TR')} / ${gerek.length.toLocaleString('tr-TR')} dosya · ${MB(hiz)}/sn` : ADIMLAR[1],
      gerek.length && inen < gerekBoyut ? `Kalan ~${sure(kalan)}` : ADIMLAR[2]], 0);
  };
  const tik = setInterval(ciz, 250);
  let sira = 0;
  const isci = async () => {
    while (sira < gerek.length && calisiyor === benim) {
      const f = gerek[sira++];
      let alinan = 0;
      try {
        const r = await fetch(f.url, { cache: 'no-store', mode: 'cors', credentials: 'omit' });
        if (!r.ok) throw new Error(r.status);
        const okuyucu = r.body.getReader(), parcalar = [];
        for (;;) { const { done, value } = await okuyucu.read(); if (done) break; parcalar.push(value); alinan += value.length; inen += value.length; }
        const h = new Headers(r.headers); h.set('x-ko-h', f.h); h.set('content-length', String(alinan));
        await c.put(f.anahtar, new Response(new Blob(parcalar, { type: r.headers.get('content-type') || 'application/octet-stream' }), { status: 200, headers: h }));
        if (alinan !== f.s) inen += f.s - alinan;   // boyut farkı (sıkıştırma) ilerlemeyi bozmasın
      } catch (e) { hata++; inen += Math.max(0, f.s - alinan); console.warn('indirilemedi', f.url, e); }
      dosya++;
    }
  };
  await Promise.all(Array.from({ length: 6 }, isci));
  clearInterval(tik);
  if (calisiyor !== benim) return;
  toplamOnbellek = toplam;
  ciz();
  // 4) son adımlar
  L.adim(ADIMLAR, 1); L.ilerleme(0.985);
  await new Promise((r) => setTimeout(r, 250));
  L.adim(ADIMLAR, 2); L.ilerleme(1);
  L.adim(hata ? `${hata} files could not be downloaded (will retry in game) · ${MB(toplam)} hazır` : gerek.length ? `All files are up to date · ${liste.length.toLocaleString('en-US')} files · ${MB(toplam)}` : `Files are up to date · ${liste.length.toLocaleString('en-US')} files · ${MB(toplam)}`);
  L.hazir('Game ready');
}

calis();
L.bekle.then(() => { location.href = 'oyun.html'; });
