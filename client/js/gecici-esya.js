// (3.11) KO "Temporary Item List" (orijinal re_itemlist) + sağ üstteki kum saatinin yanındaki parşömen düğmesi (re_timeitembtn).
// Envanterdeki ve Magic Bag'deki süreli eşyalar: ikon, ad, yer (Inventory / Magic Bag), kalan süre. 24 saatten azı kırmızı şeritte.
// "Do not show today." işaretliyse oyuna girişte o gün otomatik açılmaz.
import { ekUI, hasLayout, buildLayout, draggable } from './kui.js';
import { iconHtml, kalanSure, loadMeta } from './esya.js';

const GUN_KEY = 'ko-gecici-esya-gizle';
const bugun = () => new Date().toISOString().slice(0, 10);
const oku = () => { try { return localStorage.getItem(GUN_KEY); } catch { return null; } };
const yaz = (v) => { try { v ? localStorage.setItem(GUN_KEY, v) : localStorage.removeItem(GUN_KEY); } catch {} };
const sureYazi = (sn) => {
  if (sn >= 86400) { const g = Math.floor(sn / 86400); return `${g} day${g > 1 ? 's' : ''}`; }
  if (sn >= 3600) { const s = Math.floor(sn / 3600); return `${s} hour${s > 1 ? 's' : ''}`; }
  const d = Math.max(1, Math.ceil(sn / 60)); return `${d} minute${d > 1 ? 's' : ''}`;
};

export async function initGeciciEsya({ state }) {
  if (!(await ekUI('tempitem').catch(() => false)) || !hasLayout('re_itemlist') || !hasLayout('re_timeitembtn')) return null;
  await loadMeta().catch(() => {});
  let W = null, off = 0, liste = [];
  const topla = () => {
    const out = [];
    for (const [slot, e] of state.inv?.items || []) {
      if (!(slot >= 14) || !e?.it) continue;
      const kalan = kalanSure(e.row); if (!(kalan > 0)) continue;
      out.push({ slot, it: e.it, kalan, yer: slot <= 41 ? 'Inventory' : 'Magic Bag' });
    }
    return out.sort((a, b) => a.kalan - b.kalan);
  };
  const ciz = () => {
    if (!W) return;
    liste = topla(); off = Math.max(0, Math.min(off, liste.length - 3));
    for (let i = 0; i < 3; i++) {
      const e = liste[off + i], grp = W.get('ItemInfo_' + i); if (!grp) continue;
      grp.hidden = !e; if (!e) continue;
      const kirmizi = e.kalan < 86400;
      W.show('redbar_' + i, kirmizi); W.show('normalbar_' + i, !kirmizi);
      W.text('str_name_' + i, e.it.strName || ''); W.text('str_pos_' + i, e.yer); W.text('str_time_' + i, sureYazi(e.kalan));
      for (const t of W.all('str_time_' + i)) t.classList.toggle('gi-kirmizi', kirmizi);
      const a = W.get('area_icon_' + i); if (a) a.innerHTML = iconHtml(e.it, 45);
    }
    W.el.classList.toggle('gi-bos', !liste.length);
    W.show('scrollbar', liste.length > 3);   // KO: 3 ya da daha az eşyada kaydırma çubuğu görünmez
  };
  const kur = () => {
    W = buildLayout('re_itemlist', { className: 'ko-gecici ko-pencere kui-dokulu' });
    (document.getElementById('kohud') || document.body).append(W.el); draggable(W, 90);
    W.el.style.pointerEvents = 'auto'; W.el.style.zIndex = 4300; W.el.hidden = true;
    W.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    W.el.addEventListener('contextmenu', (e) => e.preventDefault());
    W.text('title_notice', 'Show all temporary items in the inventory and Magic Bag');
    W.text('title_notice2', 'Do not show today.');
    W.click('close', () => { W.el.hidden = true; });
    const kutu = () => W.get('btn_today')?.classList.toggle('gi-secili', oku() === bugun());
    W.click('btn_today', () => { yaz(oku() === bugun() ? null : bugun()); kutu(); }); kutu();
    W.el.addEventListener('wheel', (e) => { e.preventDefault(); off += e.deltaY > 0 ? 1 : -1; ciz(); }, { passive: false });
    // kaydırma oku düğmeleri (scrollbar içindeki ilk / ikinci düğme)
    const sc = W.get('scroll'); const dug = sc ? [...sc.querySelectorAll(':scope > .kui-btn')] : [];
    dug[0]?.addEventListener('pointerdown', (e) => { e.stopPropagation(); off--; ciz(); });
    dug[1]?.addEventListener('pointerdown', (e) => { e.stopPropagation(); off++; ciz(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && W && !W.el.hidden) W.el.hidden = true; });
    W.el.style.left = Math.max(8, Math.round((innerWidth - 556) / 2)) + 'px'; W.el.style.top = Math.max(8, Math.round((innerHeight - 544) / 2)) + 'px';
  };
  const ac = (zorla = true) => { if (!W) kur(); if (!zorla && W.el.hidden === false) return; off = 0; ciz(); W.el.hidden = false; };
  // kum saatinin yanındaki düğme
  const kap = document.querySelector('.ko-ust-simge');
  if (kap) {
    const B = buildLayout('re_timeitembtn', { className: 'gi-dugme' }); kap.append(B.el);
    B.click('btn_timelist', () => (W && !W.el.hidden ? (W.el.hidden = true) : ac()));
    const b = B.get('btn_timelist'); if (b) b.title = 'Open Temporary Item List.';
  }
  setInterval(() => { if (W && !W.el.hidden) ciz(); }, 30000);
  // oyuna girişte: süreli eşya varsa ve bugün gizlenmediyse bir kez aç
  const bekle = setInterval(() => {
    if (!state.inv?.items) return; clearInterval(bekle);
    let ilk = false; try { ilk = !!sessionStorage.getItem('ko-ilk-giris'); sessionStorage.removeItem('ko-ilk-giris'); } catch {}
    if (ilk && oku() !== bugun() && topla().length) ac();   // (8.11) yalnız oyuna ilk girişte (karakter seçiminden); bölge değişimi / ışınlanma sonrası açılmaz
  }, 1000);
  return { ac };
}
