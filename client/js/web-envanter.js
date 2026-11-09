// Web yönetici paneli: oyuncunun envanterini oyundaki KO re_inventory penceresiyle (salt okunur) gösterir.
// Yuva eşlemesi envanter.js mapAreas ile aynı: 0-13 donanım, 14-41 çanta, 42-53 kostüm/Magic Bag, 54-77 Magic Bag içleri.
// Veri: RPC web_gm_envanter (yalnızca GM). 2 dakikada bir kendiliğinden yenilenir.
import { loadUI, buildLayout, hasLayout, UI_BASE } from './kui.js';
import { loadMeta, loadDesc, iconHtml, tooltipHtml, fromDb, hakli } from './esya.js';

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const KOS_AD = { 52: 'Magic Bag (1. çanta)', 53: 'Magic Bag (2. çanta)', 42: 'Kostüm kask', 43: 'Kostüm omuzluk', 44: 'Kostüm alt', 45: 'Kostüm eldiven', 46: 'Kostüm çizme', 47: 'Kanat', 48: 'Peri', 49: 'Dövme', 50: 'Pathos eldiveni (sol el)', 51: 'Pathos eldiveni (sağ el)' };
const NATION = { 1: 'Karus', 2: 'El Morad' };
const SINIF = { 1: 'Savaşçı', 2: 'Okçu', 3: 'Büyücü', 4: 'Rahip', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Enchanter', 11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Uzman Kurian', 15: 'Usta Kurian' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function webEnvanter({ sb, charId, kok, durum, aralik = 120000 }) {
  await Promise.all([loadUI(UI_BASE), loadMeta()]); loadDesc().catch(() => {});
  if (!hasLayout('re_inventory')) throw new Error('re_inventory yerleşimi yok');
  const inv = buildLayout('re_inventory', { className: 'ko-inv ko-pencere web-inv' });
  for (const id of ['base_bag', 'base_inven_notice', 'img_Destroy_bottom', 'img_Destroy_middle', 'img_Destroy_top', 'btn_Destroy_ok', 'btn_Destroy_cancel', 'string_Destroy', 'string_Destroy2', 'elmo_ecli666', 'base_LockImg', 'btn_close', 'btn_item_arrangement', 'btn_trashlock', 'btn_helmetview', 'btn_CosPreView', 'btn_open_cos'])
    inv.show(id, false);
  inv.el.querySelectorAll('.kui-tx').forEach((e) => { if (/^\d+$/.test(e.dataset.id || '')) e.textContent = ''; });  // başlık: "Inventory" yerine oyundaki gibi "Çanta"
  { const t = [...inv.el.querySelectorAll(':scope > .kui-img')].find((e) => e.style.left === '379px' && e.style.top === '50px');
    if (t) t.style.visibility = 'hidden';
    const tt = document.createElement('div'); tt.className = 'kui kui-tx ko-canta-baslik'; tt.textContent = 'Çanta';
    tt.style.cssText = 'left:343px;top:49px;width:120px;height:18px;justify-content:center;align-items:center;';
    inv.el.append(tt); }
  inv.el.style.position = 'relative'; inv.el.style.left = inv.el.style.top = '0';
  kok.replaceChildren(inv.el);

  // ── yuvalar
  const areas = new Map();
  for (const a of inv.el.querySelectorAll(':scope > .kui-ar')) {
    if (!/^\d+$/.test(a.dataset.id || '')) continue;
    const x = parseFloat(a.style.left), y = parseFloat(a.style.top);
    let slot = null;
    if (x >= 420 && y < 360) { const col = Math.round((x - 425) / 52), row = Math.round((y - 100) / 52); const i = row * 3 + col; if (i >= 0 && i <= 13) slot = i; }
    else if (y >= 365 && y < 570) { const col = Math.round((x - 236) / 49), row = Math.round((y - 373) / 49); if (col >= 0 && col < 7 && row >= 0 && row < 4) slot = 14 + row * 7 + col; }
    if (slot == null || areas.has(slot)) continue;
    a.classList.add('inv-yuva'); a.dataset.slot = slot; a.style.pointerEvents = 'auto'; areas.set(slot, a);
  }
  const cos = inv.get('base_cos');
  const COS = { '81,25': 42, '81,77': 43, '81,129': 47, '29,77': 50, '57,206': 52, '111,206': 53, '133,25': 48, '133,77': 51 };
  const mbag = { alanlar: [], sekme: 1, ort: null };
  if (cos) {
    cos.hidden = false;
    for (const a of cos.querySelectorAll(':scope > .kui-ar')) {
      const slot = COS[`${parseFloat(a.style.left)},${parseFloat(a.style.top)}`]; if (slot == null || areas.has(slot)) continue;
      a.classList.add('inv-yuva'); a.dataset.slot = slot; a.style.pointerEvents = 'auto'; a.title = KOS_AD[slot]; areas.set(slot, a);
    }
    mbag.alanlar = [...cos.querySelectorAll(':scope > .kui-ar')].filter((a) => parseFloat(a.style.top) >= 290 && /^\d+$/.test(a.dataset.id || ''))
      .sort((x, y) => parseFloat(x.style.top) - parseFloat(y.style.top) || parseFloat(x.style.left) - parseFloat(y.style.left));
    mbag.ort = cos.querySelector('[data-id="img_hide"]');
    [['btn_bag1', 1], ['btn_bag2', 2]].forEach(([id, n]) => {
      const b = cos.querySelector(`[data-id="${id}"]`); if (!b) return;
      b.style.pointerEvents = 'auto'; b.classList.add('mbag-sekme', 'kui-tik'); b.dataset.mbag = n; b.title = `${n}. Magic Bag'in yuvalarını göster`;
      b.addEventListener('click', (e) => { e.stopPropagation(); mbag.sekme = n; mbagBagla(); ciz(); });
    });
  }
  function mbagBagla() {
    for (let s = 54; s <= 77; s++) areas.delete(s);
    const taban = mbag.sekme === 2 ? 66 : 54;
    mbag.alanlar.forEach((a, i) => { a.classList.add('inv-yuva'); a.dataset.slot = taban + i; a.style.pointerEvents = 'auto'; areas.set(taban + i, a); });
  }
  mbagBagla();
  // karakter alanı (oyunda 3B model): karakter bilgisi
  const kar = inv.get('area_char');
  if (kar) { kar.classList.add('web-inv-kar'); kar.style.pointerEvents = 'none'; }

  let items = new Map(), son = null;
  function ciz() {
    { const cs = mbag.sekme === 2 ? 53 : 52, e = items.get(cs), acik = !!e && !(e.row.bitis && new Date(e.row.bitis).getTime() <= Date.now());
      if (mbag.ort) mbag.ort.style.display = acik ? 'none' : '';
      for (const a of mbag.alanlar) a.style.visibility = acik ? '' : 'hidden';
      inv.el.querySelectorAll('.mbag-sekme').forEach((b) => b.classList.toggle('mbag-secili', Number(b.dataset.mbag) === mbag.sekme)); }
    for (const [slot, a] of areas) {
      const e = items.get(slot);
      const sz = Math.max(30, Math.floor(Math.min(parseFloat(a.style.width) || 45, parseFloat(a.style.height) || 45)) - 1);
      a.innerHTML = e ? `<div class="inv-esya" data-slot="${slot}">${iconHtml(e.it, sz)}${e.row.kilit ? '<i class="inv-kilit" title="Kilitli"></i>' : ''}${(() => { const n = hakli(e.it) ? Number(e.row.durability ?? e.it.Duration) : e.row.count; return n > 1 ? `<b class="inv-adet">${n}</b>` : ''; })()}</div>` : '';
    }
    const k = son?.karakter;
    if (k) {
      inv.text('text_gold', fmt(k.gold));
      let ag = 0; for (const [s, e] of items) if (s >= 14 && s <= 41 || s <= 13) ag += (Number(e.it.Weight) || 0) * (Number(e.it.Countable) > 0 ? Math.max(1, Number(e.row.count) || 1) : 1);
      inv.text('text_weight', `${fmt(Math.round(ag / 10))}`);
      if (kar) kar.innerHTML = `<div class="web-inv-kart"><b class="ulus-${k.ulus}">${esc(k.ad)}</b><span>Lv ${k.seviye} · ${esc(SINIF[k.sinif] || '')}</span><span>${esc(NATION[k.ulus] || '')}</span>
        <span class="${k.oyunda ? 'yesil' : 'gri'}">${k.oyunda ? '● Oyunda' : '○ Çevrimdışı'}</span><span>${esc(k.bolge)} (${Math.round(k.x)}, ${Math.round(k.z)})</span><span>KC: ${fmt(k.cash)}</span></div>`;
    }
  }
  async function yukle() {
    const { data, error } = await sb.rpc('web_gm_envanter', { p_char: charId });
    if (error) { durum?.(`Envanter yüklenemedi: ${error.message}`, true); return; }
    son = data;
    items = new Map((data.esyalar || []).filter((r) => r.slot >= 0).map((r) => [r.slot, { row: r, it: r.it || fromDb(r.items || {}) }]));
    ciz();
    durum?.(`Son güncelleme: ${new Date().toLocaleTimeString('tr-TR')} · 2 dakikada bir yenilenir`, false);
  }

  // ipucu (oyundaki KO eşya bilgi penceresi)
  let tip = null;
  inv.el.addEventListener('pointermove', (ev) => {
    const a = ev.target.closest?.('.inv-esya'); const e = a && items.get(Number(a.dataset.slot));
    if (!e) { tip?.remove(); return; }
    tip ||= Object.assign(document.createElement('div'), { id: 'ko-ipucu-yuzen', className: 'ko-ipucu' });
    if (!tip.isConnected) document.body.append(tip);
    tip.innerHTML = tooltipHtml(e.it, { count: e.row.count, sure: e.row, satisGizle: true });
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(4, Math.min(innerWidth - w - 8, ev.clientX + 16)) + 'px';
    tip.style.top = Math.max(4, Math.min(innerHeight - h - 8, ev.clientY - 10)) + 'px';
  });
  inv.el.addEventListener('pointerleave', () => tip?.remove());

  await yukle();
  const t = setInterval(() => yukle().catch(() => {}), aralik);
  return { yenile: yukle, durdur: () => clearInterval(t), boyut: () => ({ w: inv.el.offsetWidth, h: inv.el.offsetHeight }) };
}
