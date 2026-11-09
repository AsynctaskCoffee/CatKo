// GM paneli → Başlangıç eşyaları: her sınıfın yeni karakterle başladığı envanter.
// Pencere KO envanteri (re_inventory) yerleşimiyle açılır: yuva 0-13 donanım, 14-41 çanta. GM kendi çantasından eşya sürükler,
// pencere içinde yuvalar arası taşır, sağ tıkla kaldırır. Kayıt sunucuda start_items (gm_start_item_set); create_character bunları verir.
import { hasLayout, buildLayout, draggable } from './kui.js';
import { loadMeta, iconHtml, tooltipHtml, fromDb, sureMetni, sureCoz } from './esya.js';
import * as THREE from '../vendor/three.module.min.js';
import { toFront } from './ko-pencere.js';
import { createCharacter } from './character.js';

// sınıfın örnek ırkı (GM'in ulusuna göre): Karus / El Morad
const IRK = { 1: { 1: 1, 2: 2, 3: 3, 4: 4, 13: 6 }, 2: { 1: 11, 2: 12, 3: 12, 4: 13, 13: 14 } };
export const SINIFLAR = [[1, 'Savaşçı'], [2, 'Okçu / Suikastçı'], [3, 'Büyücü'], [4, 'Rahip'], [13, 'Kurian / Portu']];

export function initBaslangic({ sb, character, hud }) {
  let L = null, noah = 0, sinif = 1, items = new Map(), kayitli = new Map(), tip = null, kirli = false, kr = null;
  const areas = new Map();
  // (4.11) pencere içi yazılar İngilizce (GM panelindeki düğmeler Türkçe kalır)
  const SINIF_EN = { 1: 'Warrior', 2: 'Rogue', 3: 'Magician', 4: 'Priest', 13: 'Kurian / Porutu' };
  const ad = () => SINIF_EN[sinif] || SINIFLAR.find((x) => x[0] === sinif)?.[1] || sinif;
  const rpc = async (fn, a) => {
    const { data, error } = await sb.rpc(fn, { p_char: character.id, p_class: sinif, ...a });
    if (error) { hud.notice?.(error.message, 'hata'); throw error; }
    return data;
  };
  const yukle = (rows) => { items = new Map((rows || []).map((r) => [r.slot, { num: r.item_num, count: r.count, sure: r.sure || null, it: fromDb(r.items || {}) }])); kayitli = new Map([...items].map(([k, v]) => [k, { ...v }])); kirli = false; ciz(); };
  const degisti = () => { kirli = true; ciz(); };

  function kur() {
    L = buildLayout('re_inventory', { className: 'ko-inv ko-pencere gm-baslangic' });
    for (const id of ['base_bag', 'base_inven_notice', 'img_Destroy_bottom', 'img_Destroy_middle', 'img_Destroy_top', 'btn_Destroy_ok', 'btn_Destroy_cancel', 'string_Destroy', 'string_Destroy2', 'img_hide', 'elmo_ecli666', 'base_LockImg', 'area_samma']) L.show(id, false);
    L.el.querySelectorAll('.kui-tx').forEach((e) => { if (/^\d+$/.test(e.dataset.id || '')) e.textContent = ''; });
    const t = [...L.el.querySelectorAll(':scope > .kui-img')].find((e) => e.style.left === '379px' && e.style.top === '50px'); if (t) t.style.visibility = 'hidden';
    const tt = document.createElement('div'); tt.className = 'kui kui-tx ko-canta-baslik gm-bs-baslik';
    tt.style.cssText = 'left:283px;top:49px;width:240px;height:18px;justify-content:center;align-items:center;'; L.el.append(tt);
    const not = document.createElement('div'); not.className = 'kui kui-tx gm-bs-not';
    not.style.cssText = 'left:236px;top:572px;width:345px;height:34px;align-items:flex-start;';
    not.textContent = 'Drag items from your bag · move between slots · right-click: remove'; L.el.append(not);
    const kb = document.createElement('button'); kb.className = 'ay-dugme gm-bs-kaydet'; kb.textContent = 'Save';
    kb.style.cssText = 'position:absolute;left:241px;top:302px;width:84px;height:23px;pointer-events:auto;z-index:3;';
    kb.addEventListener('click', (e) => { e.stopPropagation(); kaydet(); }); L.el.append(kb);
    const gb = document.createElement('button'); gb.className = 'ay-dugme gm-bs-geri'; gb.textContent = 'Undo';
    gb.style.cssText = 'position:absolute;left:329px;top:302px;width:72px;height:23px;pointer-events:auto;z-index:3;';
    gb.addEventListener('click', (e) => { e.stopPropagation(); items = new Map([...kayitli].map(([k, v]) => [k, { ...v }])); kirli = false; ciz(); }); L.el.append(gb);
    // ağırlık satırı ve düzenle düğmesi burada anlamsız: yerine Kaydet / Geri al (Noah satırının hemen üstü)
    L.show('text_weight', false); L.show('btn_item_arrangement', false);
    L.el.querySelectorAll(':scope > .kui-tx, :scope > .kui-img').forEach((e) => {
      if ((e.textContent || '').trim() === 'Weight' || (e.classList.contains('kui-img') && e.style.left === '271px' && e.style.top === '310px')) e.style.visibility = 'hidden';
    });
    // başlangıç Noah'ı: Noah simgesine (btn_gold) tıkla → miktar gir (sınıf başına, gm_start_noah)
    L.get('btn_gold')?.style.setProperty('pointer-events', 'auto');
    L.get('btn_gold')?.setAttribute('title', 'Set starting Noah');
    L.click('btn_gold', () => {
      hud.girdi?.('Starting Noah', `How much Noah should a new ${ad()} character start with?`, { max: 13, deger: String(noah) }, async (t) => {
        const n = Math.round(Number(String(t).replace(/[.\s]/g, '')));
        if (!Number.isFinite(n) || n < 0 || n > 2100000000) { hud.notice?.('Noah must be between 0 and 2,100,000,000.', 'hata'); return; }
        try { const d = await rpc('gm_start_noah', { p_miktar: n }); noah = Number(d?.noah) || 0; noahYaz(); hud.info?.(`${ad()} starting Noah: ${noah.toLocaleString('en-US')}.`, 'tamam'); } catch {}
      });
    });
    L.click('btn_close', kapat); draggable(L, 70);
    // yuvalar: envanterle aynı eşleme (donanım 3x5 alanı, çanta 7x4)
    for (const a of L.el.querySelectorAll(':scope > .kui-ar')) {
      if (!/^\d+$/.test(a.dataset.id || '')) continue;
      const x = parseFloat(a.style.left), y = parseFloat(a.style.top);
      let slot = null;
      if (x >= 420 && y < 360) { const col = Math.round((x - 425) / 52), row = Math.round((y - 100) / 52); const i = row * 3 + col; if (i >= 0 && i <= 13) slot = i; }
      else if (y >= 365 && y < 570) { const col = Math.round((x - 236) / 49), row = Math.round((y - 373) / 49); if (col >= 0 && col < 7 && row >= 0 && row < 4) slot = 14 + row * 7 + col; }
      if (slot == null || areas.has(slot)) continue;
      a.classList.add('gm-bs-yuva'); a.dataset.bs = slot; a.dataset.esyaBirak = '1'; a.style.pointerEvents = 'auto';
      areas.set(slot, a);
    }
    // (4.11) kostüm bölümü (base_cos): envanterle aynı eşleme — kask 42, omuzluk 43, kanat 47, peri 48, dövme 49, pathos 50 / 51, tılsım 91, amblem 92 (Magic Bag yuvaları kapalı)
    const cos = L.get('base_cos');
    if (cos) {
      const COS = { '81,25': 42, '81,77': 43, '81,129': 47, '29,77': 50, '133,25': 48, '133,77': 51,
        '33,82': 49, '91,82': 42, '151,82': 48, '33,141': 50, '91,141': 43, '151,141': 51, '91,200': 47, '33,200': 91, '151,200': 92 };
      for (const a of cos.querySelectorAll('.kui-ar')) {
        const slot = COS[`${parseFloat(a.style.left)},${parseFloat(a.style.top)}`];
        if (slot == null || areas.has(slot)) { if (/^\d+$/.test(a.dataset.id || '') && slot == null) a.style.pointerEvents = 'none'; continue; }
        a.classList.add('gm-bs-yuva'); a.dataset.bs = slot; a.dataset.esyaBirak = '1'; a.style.pointerEvents = 'auto';
        areas.set(slot, a);
      }
      for (const id of ['btn_bag1', 'btn_bag2', 'btn_bag3']) { const b = cos.querySelector(`[data-id="${id}"]`); if (b) b.style.pointerEvents = 'none'; }
    }
    L.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(L.el); });
    L.el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); const a = e.target.closest('.gm-bs-yuva'); if (!a || !items.has(Number(a.dataset.bs))) return;
      kaldir(Number(a.dataset.bs));
    });
    // GM çantasından bırakılan eşya
    L.el.addEventListener('ko-esya-birak', async (ev) => {
      const a = ev.target.closest?.('.gm-bs-yuva'); const d = ev.detail || {}; if (!a || !d.num) return;
      const slot = Number(a.dataset.bs);
      const yeni = { num: d.num, count: d.count || 1, sure: null, it: d.it || { strName: d.name } };
      items.set(slot, yeni); degisti();
      // KO süreli eşya: süreli olsun mu? (oyuncu karakteri oluşturunca süre otomatik başlar)
      if (Number(yeni.it?.Countable) > 0) return;
      hud.soru?.('Timed Item', `Make ${yeni.it?.strName || 'this item'} timed?\nIf timed, the timer starts when the player creates their character.`, () => {
        hud.girdi?.('Item Duration', 'Enter duration: days hours minutes\n(e.g. 20 10 4 → 20 days 10 hours 4 min)', { max: 14, deger: '30 0 0' }, (t) => {
          const sn = sureCoz(t); if (sn < 60) { hud.notice?.('Duration must be at least 1 minute.', 'hata'); return; }
          if (items.get(slot) === yeni) { yeni.sure = sn; degisti(); hud.info?.(`${yeni.it?.strName}: timed (${sureMetni(sn)}). Don't forget to press Save.`, 'beceri'); }
        });
      });
    });
    // pencere içi taşıma
    let sur = null;
    L.el.addEventListener('pointerdown', (ev) => {
      const a = ev.target.closest('.gm-bs-yuva'); if (!a || ev.button !== 0) return;
      const s = Number(a.dataset.bs); if (!items.has(s)) return;
      sur = { s, g: null, x: ev.clientX, y: ev.clientY };
    });
    addEventListener('pointermove', (ev) => {
      if (sur) {
        if (!sur.g && Math.hypot(ev.clientX - sur.x, ev.clientY - sur.y) > 5) { sur.g = document.createElement('div'); sur.g.className = 'ors-hayalet'; sur.g.innerHTML = iconHtml(items.get(sur.s).it, 40); document.body.append(sur.g); }
        if (sur.g) { sur.g.style.left = ev.clientX - 20 + 'px'; sur.g.style.top = ev.clientY - 20 + 'px'; }
        return;
      }
      if (!L || L.el.hidden) return;
      const a = ev.target.closest?.('.gm-bs-yuva'); const e = a && items.get(Number(a.dataset.bs));
      if (!e) { tip?.remove(); return; }
      tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu ko-tic-ipucu' });
      if (!tip.isConnected) document.body.append(tip);
      tip.innerHTML = tooltipHtml(e.it, { count: e.count, sure: e.sure ? { sure_sn: e.sure } : null });
      tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, ev.clientX + 16) + 'px';
      tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, ev.clientY - 10)) + 'px';
    });
    addEventListener('pointerup', async (ev) => {
      if (!sur) return; const d = sur; sur = null; if (!d.g) return; d.g.remove();
      const h = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest?.('.gm-bs-yuva')).find(Boolean);
      if (!h) return;
      const to = Number(h.dataset.bs); if (to === d.s) return;
      const a = items.get(d.s), b = items.get(to);
      items.set(to, a); if (b) items.set(d.s, b); else items.delete(d.s); degisti();
    });
    return L;
  }
  const noahYaz = () => L?.text('text_gold', noah.toLocaleString('en-US'));
  function kaldir(slot) { items.delete(slot); degisti(); }
  // Kaydet: değişen yuvalar sunucuya (gm_start_item_set; boşalan yuva → p_item null)
  async function kaydet() {
    const yuvalar = new Set([...items.keys(), ...kayitli.keys()]); let n = 0, son = null;
    try {
      for (const sl of yuvalar) {
        const a = items.get(sl), b = kayitli.get(sl);
        if (a?.num === b?.num && a?.count === b?.count && (a?.sure || null) === (b?.sure || null)) continue;
        son = await rpc('gm_start_item_set', { p_slot: sl, p_item: a ? a.num : null, p_count: a ? a.count : 1 }); n++;
        if (a?.sure) son = await rpc('gm_start_item_sure', { p_slot: sl, p_sn: a.sure });
      }
      if (son) yukle(son); else { kirli = false; ciz(); }
      hud.info?.(n ? `${ad()} starting items saved (${n} slots).` : `${ad()}: no changes.`, 'tamam');
    } catch {}
  }
  // perdeli bölümde (area_char) sınıfın örnek karakteri, başlangıç donanımıyla canlı
  async function karakterKur() {
    const area = L.get('area_char'); if (!area) return;
    if (!kr) {
      const cv = document.createElement('canvas'); cv.className = 'ko-env-karakter'; cv.style.pointerEvents = 'auto';
      const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0, 0);
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x445533, 1.25));
      const l = new THREE.DirectionalLight(0xfff4e0, 1.5); l.position.set(0.5, 1, 1.2); sc.add(l);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50), holder = new THREE.Group(); holder.rotation.y = Math.PI; sc.add(holder);
      kr = { cv, r, sc, cam, holder, api: null, irk: null, yaw: 0, t: performance.now(), raf: 0, imza: '' };
      let dx = null;
      cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); dx = e.clientX; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', (e) => { if (dx != null) { kr.yaw += (e.clientX - dx) * 0.012; dx = e.clientX; } });
      cv.addEventListener('pointerup', () => (dx = null));
      area.style.pointerEvents = 'auto'; area.append(cv);
    }
    const irk = IRK[Number(character.nation) === 2 ? 2 : 1][sinif] || 1;
    if (kr.irk !== irk) {
      kr.irk = irk; kr.imza = '';
      if (kr.api) { kr.holder.remove(kr.api.group); kr.api = null; }
      const api = await createCharacter(irk, { face: 0, hair: 0 }).catch(() => null);
      if (!api || kr.irk !== irk) return;
      api.fxOk = false; api.group.scale.z = -1; kr.holder.add(api.group); kr.api = api; kr.fit = false;
    }
    giydir();
    if (!kr.raf) { kr.t = performance.now(); kr.raf = requestAnimationFrame(dongu); }
  }
  async function giydir() {
    if (!kr?.api) return;
    const eq = [...items].filter(([s]) => s <= 13).map(([slot, e]) => ({ slot, org: e.it.org, num: e.num, el: 0, res: e.it.ModelRes || 0, efekt: e.it.Efekt ?? null }));
    const imza = kr.irk + ':' + JSON.stringify(eq); if (imza === kr.imza) return; kr.imza = imza;
    try { const D = await import('./donanim.js'); await D.applyGear(kr.api, kr.irk, D.gearCodes(eq), true); } catch {}
  }
  function dongu() {
    if (!kr || !L || L.el.hidden) { if (kr) kr.raf = 0; return; }
    const now = performance.now(), dt = Math.min(0.1, (now - kr.t) / 1000); kr.t = now;
    const area = L.get('area_char'), w = area.offsetWidth, h = area.offsetHeight, pr = Math.min(devicePixelRatio || 1, 2);
    if (w && h && (kr.cv.width !== Math.round(w * pr) || kr.cv.height !== Math.round(h * pr))) { kr.r.setPixelRatio(pr); kr.r.setSize(w, h, false); kr.cam.aspect = w / h; kr.cam.updateProjectionMatrix(); }
    if (kr.api) {
      kr.api.setClip?.('breath'); kr.api.update(dt);
      if (!kr.fit) { const b = new THREE.Box3().setFromObject(kr.api.group, true); if (!b.isEmpty()) { const H = b.max.y - b.min.y, cy = (b.max.y + b.min.y) / 2; kr.cam.position.set(0, cy, H * 2.05); kr.cam.lookAt(0, cy, 0); kr.fit = true; } }
    }
    kr.holder.rotation.y = Math.PI + kr.yaw;
    kr.r.render(kr.sc, kr.cam);
    kr.raf = requestAnimationFrame(dongu);
  }
  function ciz() {
    if (!L) return;
    L.el.querySelector('.gm-bs-baslik').textContent = `Starting Items — ${ad()}${kirli ? ' *' : ''}`;
    L.el.querySelector('.gm-bs-kaydet')?.classList.toggle('kirli', kirli);
    giydir();
    for (const [slot, a] of areas) {
      const e = items.get(slot);
      const sz = Math.max(30, Math.floor(Math.min(parseFloat(a.style.width) || 45, parseFloat(a.style.height) || 45)) - 1);
      a.innerHTML = e ? `<div class="gm-bs-esya">${iconHtml(e.it, sz)}${e.count > 1 ? `<b class="inv-adet">${e.count}</b>` : ''}${e.sure ? '<i class="esya-sureli" title="Timed">⏱</i>' : ''}</div>` : '';
    }
  }
  async function ac(k) {
    if (!hasLayout('re_inventory')) return hud.notice?.('Failed to load the inventory UI.', 'hata');
    await loadMeta();
    sinif = k; L ||= kur();
    (document.getElementById('kohud') || document.body).append(L.el);
    L.el.hidden = false; L.el.style.zIndex = 70; toFront(L.el);
    items = new Map(); ciz();
    karakterKur();
    noah = 0; noahYaz();
    try { yukle(await rpc('gm_start_items', {})); } catch {}
    try { const d = await rpc('gm_start_noah', {}); noah = Number(d?.noah) || 0; noahYaz(); } catch {}
  }
  function kapat() { if (kirli) hud.info?.(`${ad()}: unsaved changes (window closed, not saved).`, 'hata'); if (L) L.el.hidden = true; tip?.remove(); }
  return { ac, kapat };
}
