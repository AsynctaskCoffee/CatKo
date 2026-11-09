// KO PK sembolleri (deadsoft re_loyalty_mark / re_mini_loyalty_mark): oyuncu isminin solunda iki sembol.
//  NP: toplam ulus puanı sıralaması (günlük yenilenir), LP: ladder = aylık ulus puanı sıralaması (her ay sıfırlanır).
//  Her ulusta ilk 200; 6 kademe: 1 Gold Dragon · 2-4 Silver H · 5-10 Mirage · 11-40 Shadow · 41-100 Mist · 101-200 Brown K.
//  Sunucu: rutbe_sembol() → { "<char id>": { n: NP kademesi, l: LP kademesi } } (günün anlık görüntüsü).
//  Klan derece simgeleri (assets/ui/klan) ayrıdır; bunlar kişisel sıralama sembolleridir.
import { hasLayout, buildLayout } from './kui.js';

export const KADEME = [
  { ad: 'Gold Dragon', aralik: '1.', renk: '#ffd34d', harf: '龍' },
  { ad: 'Silver H', aralik: '2-4.', renk: '#e8e8e8', harf: 'H' },
  { ad: 'Mirage', aralik: '5-10.', renk: '#ff8a3d', harf: 'M' },
  { ad: 'Shadow', aralik: '11-40.', renk: '#6aa8ff', harf: 'S' },
  { ad: 'Mist', aralik: '41-100.', renk: '#7bff6b', harf: 'M' },
  { ad: 'Brown K', aralik: '101-200.', renk: '#c98a4a', harf: 'K' },
];

// deadsoft dokusu yüklendiyse (yerleşimde sprite var) KO sembolü, yoksa renkli yedek rozet
function dokuVar(ad) {
  if (!hasLayout(ad)) return false;
  try { const L = buildLayout(ad); return !!L.el.querySelector('[style*="background-image"]'); } catch { return false; }
}
let ANIM = null, MINI = null;
const kareler = new Set();   // canlandırılan semboller: { kareler: [el…], i }
setInterval(() => { for (const a of kareler) { if (!a.kok.isConnected) { kareler.delete(a); continue; } a.k[a.i].hidden = true; a.i = (a.i + 1) % a.k.length; a.k[a.i].hidden = false; } }, 110);

// (31.10) KO orijinal sıralama sembolleri (symbol_us/s_0_40..45_0.dxt, 56×14): 1 altın · 2-4 gümüş · 5-10 kızıl · 11-40 mavi · 41-100 yeşil · 101-200 kahve.
// İlk üç kademe canlı: ani_0_40..42_0..9 (10 karelik parlama). Atlas: assets/ui/rutbe-orj.webp (satır = kademe; sütun 0 sabit, 1-10 kareler)
const ATLAS = new URL('../assets/ui/rutbe-orj.webp', import.meta.url).href;
// (2.11) atlas modül yüklenirken indirilip çözülür → sohbet satırındaki sembol satırla aynı anda görünür (sonradan belirmez)
const ATLAS_IMG = new Image(); ATLAS_IMG.src = ATLAS; ATLAS_IMG.decode?.().catch(() => {});
const canli = new Set();
let kareNo = 0;
setInterval(() => { kareNo = (kareNo + 1) % 10; for (const e of canli) { if (!e.isConnected) { if (e._bagli) canli.delete(e); continue; } e._bagli = 1; e.style.setProperty('--rx', `${-(kareNo + 1) * 56}px`); } }, 100);
// eski görünüm (karakterin üstündeki isim yazısı ve tablolar): re_mini_loyalty_mark, yoksa renkli rozet
function sembol(k, tur) {
  const d = document.createElement('span'); d.className = `rutbe rutbe-${tur} rutbe-k${k}`; d.title = `${tur === 'np' ? 'NP' : 'LP'} sembolü: ${KADEME[k].ad} (${KADEME[k].aralik} sıra)`;
  if (!MINI) MINI = dokuVar('re_mini_loyalty_mark');
  if (MINI) {
    const L = buildLayout('re_mini_loyalty_mark', { className: 'rutbe-kui' });
    for (const e of L.el.children) e.hidden = e.dataset.id !== 'loyalty_0' + k;
    d.append(L.el); d.classList.add('rutbe-doku', 'rutbe-mini'); return d;
  }
  d.textContent = KADEME[k].harf; d.style.setProperty('--rr', KADEME[k].renk); return d;
}
// (31.10) KO orijinal canlı sembol — yalnız sohbette
function sembolOrj(k, tur) {
  const d = document.createElement('span'); d.className = `rutbe rutbe-${tur} rutbe-k${k} rutbe-doku rutbe-orj`; d.title = `${tur === 'np' ? 'NP' : 'LP'}: ${KADEME[k].ad} (${KADEME[k].aralik})`;
  d.style.setProperty('--ra', `url(${ATLAS})`); d.style.setProperty('--rx', '0px'); d.style.setProperty('--ry', `${-k * 14}px`);   // (31.10) arka plan CSS değişkenleriyle (orta ikon ::after aynı kareyi büyütür)
  if (k < 3) { d._k = k; canli.add(d); }
  return d;
}
// KO isim plakası (re_loyalty_mark): NP kademesine göre ismin arkasında çerçeveli plaka; altın (1.) ve gümüş / kızıl canlandırılmış
function plaka(k) {
  if (!ANIM) ANIM = dokuVar('re_loyalty_mark'); if (!ANIM) return null;
  const id = 'loyalty_0' + k;
  const L = buildLayout('re_loyalty_mark', { className: 'rutbe-plaka' });
  for (const e of L.el.children) e.hidden = e.dataset.id !== id;
  const kok = L.get(id); const k2 = kok ? [...kok.children] : [];
  if (k2.length > 1) { k2.forEach((e, i) => { e.hidden = i !== 0; }); kareler.add({ kok: L.el, k: k2, i: 0 }); }
  return L.el;
}

export function initRutbe({ sb, hud }) {
  let VERI = {};
  const etiketler = new Map();   // char id → isim etiketi öğesi
  function ciz(id, el) {
    if (!el) return;
    el.querySelector('.rutbe-kutu')?.remove();
    if (!VERI[String(id)]) { el.querySelector('.rutbe-plaka')?.remove(); el.classList.remove('rutbe-plakali'); }
    const hedef = el.querySelector('.ad') || el;
    const v = VERI[String(id)]; if (!v || (v.n == null && v.l == null)) return;
    // tek sembol: NP ve LP'den en yüksek kademe (küçük numara); eşitse NP. İsmin arkasında plaka yok
    const kutu = document.createElement('span'); kutu.className = 'rutbe-kutu';
    const tur = v.l != null && (v.n == null || v.l < v.n) ? 'lp' : 'np';
    kutu.append(sembol(tur === 'np' ? v.n : v.l, tur));
    hedef.prepend(kutu);
    el.querySelector('.rutbe-plaka')?.remove(); el.classList.remove('rutbe-plakali');
  }
  async function yukle() {
    const { data, error } = await sb.rpc('rutbe_sembol');
    if (error || !data) return;
    VERI = data; api.hazir = true;
    // veri gelmeden yazılmış sohbet satırları: sembol eklenir (ismin önüne, satırdaki yerine)
    document.querySelectorAll('[data-rutbe-bekle]').forEach((d) => { const id = d.dataset.rutbeBekle; delete d.dataset.rutbeBekle; const r = api.sembolEl(id, { orj: true }); if (!r) return; r.classList.add('sohbet-rutbe'); const b = d.querySelector(':scope > b'); if (b) b.before(r); else d.append(r); });
    for (const [id, el] of etiketler) { if (el._rutbeBagli && !el.isConnected) { etiketler.delete(id); continue; } if (el.isConnected) el._rutbeBagli = 1; ciz(id, el); }
  }
  setTimeout(yukle, 0); setInterval(yukle, 10 * 60 * 1000);
  for (const t of [3000, 10000]) setTimeout(() => { for (const [id, el] of etiketler) ciz(id, el); }, t);   // arayüz dokuları geç yüklenirse yedek rozet KO sembolüyle değişsin   // günlük anlık görüntü; gün dönünce yenisi
  const api = {
    hazir: false,
    /** isim etiketinin (domLabel öğesi) soluna sembolleri koy */
    isaretle(el, id) { if (!el || id == null) return; etiketler.set(String(id), el); ciz(id, el); },
    kademe: (id) => VERI[String(id)] || null,
    /** sıralama tabloları için: oyuncunun NP/LP sembolü (yoksa null) */
    sembolEl: (id, { orj = false } = {}) => { const v = VERI[String(id)]; if (!v || (v.n == null && v.l == null)) return null; const tur = v.l != null && (v.n == null || v.l < v.n) ? 'lp' : 'np'; const k = document.createElement('span'); k.className = 'rutbe-kutu'; k.append((orj ? sembolOrj : sembol)(tur === 'np' ? v.n : v.l, tur)); return k; },
    /** sıralama tablosu Arma sütunu: NP ve LP sembollerinin ikisi de (varsa) */
    sembolTam: (id) => { const v = VERI[String(id)]; if (!v || (v.n == null && v.l == null)) return null; const k = document.createElement('span'); k.className = 'rutbe-kutu rutbe-tam'; if (v.n != null) k.append(sembol(v.n, 'np')); if (v.l != null) k.append(sembol(v.l, 'lp')); return k; },
    yukle,
  };
  return api;
}
