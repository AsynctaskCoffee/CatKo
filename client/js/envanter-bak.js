// KO "View Inventory" (oyuncuya sağ tık): karşı oyuncunun I penceresinin birebir aynısı — kendi re_inventory penceremizin kopyası,
// yuvalar hedefin envanteriyle (donanım 0-13, çanta 14-41, kostüm / Magic Bag) dolar; perdede hedefin karakteri kuşandıklarıyla döner.
// Anlık: açıkken 2 sn'de bir sunucudan yenilenir. Açık kalma süresi 1 dk. Bakanın çantasında Equipment Confirmation Item olmalı (sunucu).
import * as THREE from '../vendor/three.module.min.js';
import { loadMeta, fromDb, iconHtml, tooltipHtml, hakli } from './esya.js';
import { kusanilanlar } from './envanter.js';
import { toFront } from './ko-pencere.js';

const SURE = 60000;
let W = null;
const COS = { '81,25': 42, '81,77': 43, '81,129': 47, '29,77': 50, '57,206': 52, '111,206': 53, '133,25': 48, '133,77': 51,
  '33,82': 49, '91,82': 42, '151,82': 48, '33,141': 50, '91,141': 43, '151,141': 51, '91,200': 47, '33,200': 91, '151,200': 92, '7,8': 52, '65,8': 53, '125,8': 78 };
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

export async function envanterBak({ sb, character, hud, state, hedef }) {
  const kaynak = hud.invEl?.(); if (!kaynak) return hud.notice?.('The inventory window is not ready.', 'hata');
  const al = async () => { const { data, error } = await sb.rpc('oyuncu_envanter', { p_char: character.id, p_hedef: Number(hedef) }); if (error) { hud.notice?.(error.message, 'hata'); return null; } if (!data?.ok) { hud.notice?.(data?.reason || 'Failed.', 'hata'); return null; } return data; };
  const d0 = await al(); if (!d0) return;
  await loadMeta().catch(() => {});
  W?.kapat?.();
  const el = kaynak.cloneNode(true);
  el.hidden = false; el.classList.add('ko-inv-bak'); el.removeAttribute('id');
  el.querySelectorAll('canvas, .inv-esya, .ko-ipucu').forEach((e) => e.remove());
  el.querySelectorAll('.inv-bulundu, .inv-soluk').forEach((e) => e.classList.remove('inv-bulundu', 'inv-soluk'));
  (document.getElementById('kohud') || document.body).append(el);
  el.style.pointerEvents = 'auto'; el.style.zIndex = '4300';
  el.style.left = Math.max(8, (innerWidth - (kaynak.offsetWidth || 520)) / 2 - 120) + 'px'; el.style.top = Math.max(8, (innerHeight - (kaynak.offsetHeight || 600)) / 2) + 'px';
  // başlık: hedefin adı
  const bas = el.querySelector('.ko-canta-baslik'); if (bas) bas.textContent = d0.name;
  // salt okunur: düzenle / arama / çöp / kostüm aç-kapa çalışmaz
  for (const id of ['Btn_search', 'btn_item_arrangement', 'area_samma']) el.querySelectorAll(`[data-id="${id}"]`).forEach((e) => (e.style.pointerEvents = 'none'));
  // yuva eşlemesi (envanter.js mapAreas ile aynı)
  const alan = new Map();
  for (const a of el.querySelectorAll(':scope > .kui-ar')) {
    if (!/^\d+$/.test(a.dataset.id || '')) continue;
    const x = parseFloat(a.style.left), y = parseFloat(a.style.top); let s = null;
    if (x >= 420 && y < 360) { const i = Math.round((y - 100) / 52) * 3 + Math.round((x - 425) / 52); if (i >= 0 && i <= 13) s = i; }
    else if (y >= 365 && y < 570) { const col = Math.round((x - 236) / 49), row = Math.round((y - 373) / 49); if (col >= 0 && col < 7 && row >= 0 && row < 4) s = 14 + row * 7 + col; }
    if (s != null && !alan.has(s)) { alan.set(s, a); a.dataset.bs = s; a.style.pointerEvents = 'auto'; }
  }
  const cos = el.querySelector('[data-id="base_cos"]');
  if (cos) for (const a of cos.querySelectorAll('.kui-ar')) { const s = COS[`${parseFloat(a.style.left)},${parseFloat(a.style.top)}`]; if (s != null && !alan.has(s)) { alan.set(s, a); a.dataset.bs = s; a.style.pointerEvents = 'auto'; } }
  const mbagAlan = cos ? [...cos.querySelectorAll(':scope > .kui-ar')].filter((a) => parseFloat(a.style.top) >= 290 && /^\d+$/.test(a.dataset.id || '')).sort((x, y) => parseFloat(x.style.top) - parseFloat(y.style.top) || parseFloat(x.style.left) - parseFloat(y.style.left)) : [];
  let mbag = 1;
  cos?.querySelectorAll('[data-id^="btn_bag"]').forEach((b) => { const n = Number(b.dataset.id.slice(7)); b.style.pointerEvents = 'auto'; b.onclick = (e) => { e.stopPropagation(); mbag = n; ciz(); }; });
  let E = new Map(), d = d0;
  const yukle = (dd) => { d = dd; E = new Map((dd.esyalar || []).map((r) => [Number(r.slot), { row: r, it: fromDb(r.items || {}) }])); };
  yukle(d0);
  function ciz() {
    const taban = { 1: 54, 2: 66, 3: 79 }[mbag] || 54;
    mbagAlan.forEach((a, i) => { a.dataset.bs = taban + i; a.style.pointerEvents = 'auto'; });
    const yuvalar = [...alan.entries(), ...mbagAlan.map((a, i) => [taban + i, a])];
    for (const [s, a] of yuvalar) {
      const e = E.get(s), sz = Math.max(30, Math.floor(Math.min(parseFloat(a.style.width) || 45, parseFloat(a.style.height) || 45)) - 1);
      const n = e ? (hakli(e.it) ? Number(e.row.durability ?? e.it.Duration) : Number(e.row.count)) : 0;
      a.innerHTML = e ? `<div class="inv-esya">${iconHtml(e.it, sz)}${n > 1 ? `<b class="inv-adet">${n}</b>` : ''}</div>` : '';
    }
    const ct = { 1: 52, 2: 53, 3: 78 }[mbag]; const acik = E.has(ct);
    const ort = cos?.querySelector('[data-id="img_hide"]'); if (ort) ort.style.display = acik ? 'none' : '';
    for (const a of mbagAlan) a.style.visibility = acik ? '' : 'hidden';
    const g = el.querySelector('[data-id="text_gold"]'); if (g) g.textContent = fmt(d.gold);
  }
  ciz();
  // ipucu
  let tip = null; const ipKapat = () => { tip?.remove(); tip = null; };
  el.addEventListener('pointermove', (e) => { const a = e.target.closest('[data-bs]'); const x = a && E.get(Number(a.dataset.bs)); if (!x) return ipKapat();
    tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu' }); if (!tip.isConnected) document.body.append(tip);
    tip.innerHTML = tooltipHtml(x.it, { count: x.row.count, sure: x.row, satisGizle: true });
    tip.style.position = 'fixed'; tip.style.zIndex = 9999; tip.style.pointerEvents = 'none';
    tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, e.clientY - 10)) + 'px'; });
  el.addEventListener('pointerleave', ipKapat);
  // sürükle (üst şerit)
  { let s = null; el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(el); if (e.target.closest('[data-bs], canvas, .kui-btn') || e.clientY - el.getBoundingClientRect().top > 70) return; s = { x: e.clientX - el.offsetLeft, y: e.clientY - el.offsetTop }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => { if (s) { el.style.left = (e.clientX - s.x) + 'px'; el.style.top = (e.clientY - s.y) + 'px'; } }); el.addEventListener('pointerup', () => (s = null)); }
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  // perde: hedefin karakteri (kuşandıklarıyla)
  const area = el.querySelector('[data-id="area_char"]');
  let gor = null;
  if (area) {
    const cv = document.createElement('canvas'); cv.className = 'ko-env-karakter'; area.append(cv);
    const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0, 0);
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x445533, 1.25)); const l = new THREE.DirectionalLight(0xfff4e0, 1.5); l.position.set(0.5, 1, 1.2); sc.add(l);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50), holder = new THREE.Group(); sc.add(holder);
    gor = { cv, r, sc, cam, holder, api: null, yaw: 0, fit: false, gear: '' };
    import('./character.js').then(({ createCharacter }) => createCharacter(d0.race, { face: d0.face ?? 0, hair: d0.hair ?? 0, sacRenk: d0.sac_renk ?? null })).then((api) => {
      if (!api || !gor) return; api.fxOk = false; api.group.scale.z = -1; holder.add(api.group); gor.api = api; giydir();
    }).catch(() => {});
    let dx = null;
    cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); dx = e.clientX; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (dx != null) { gor.yaw += (e.clientX - dx) * 0.012; dx = e.clientX; } });
    cv.addEventListener('pointerup', () => (dx = null));
  }
  function giydir() {
    if (!gor?.api) return; const g = kusanilanlar(d.esyalar || []); const k = JSON.stringify(g); if (k === gor.gear) return; gor.gear = k;
    Promise.resolve(state.gearReady).then(() => state.donanim?.applyGear(gor.api, d.race, g)).catch(() => {});
  }
  const box = new THREE.Box3(); let son = performance.now(), raf = 0;
  const kare = (t) => {
    raf = requestAnimationFrame(kare); if (!gor || !el.isConnected) return;
    const dt = Math.min(0.1, (t - son) / 1000); son = t;
    const w = area.offsetWidth, h = area.offsetHeight; if (!w || !h) return; const pr = Math.min(devicePixelRatio || 1, 2);
    if (gor.cv.width !== Math.round(w * pr) || gor.cv.height !== Math.round(h * pr)) { gor.r.setPixelRatio(pr); gor.r.setSize(w, h, false); gor.cam.aspect = w / h; gor.cam.updateProjectionMatrix(); }
    if (gor.api) { gor.api.setClip?.('breath'); gor.api.update(dt); if (!gor.fit) { box.setFromObject(gor.api.group, true); if (!box.isEmpty()) { const H = box.max.y - box.min.y, cy = (box.max.y + box.min.y) / 2; gor.cam.position.set(0, cy, H * 2.05); gor.cam.lookAt(0, cy, 0); gor.fit = true; } } }
    gor.holder.rotation.y = Math.PI + gor.yaw; gor.r.render(gor.sc, gor.cam);
  };
  raf = requestAnimationFrame(kare);
  // anlık yenileme + 1 dk sonra kapanma
  const yen = setInterval(async () => { if (!el.isConnected) return; const dd = await al(); if (!dd) return kapat(); yukle(dd); ciz(); giydir(); }, 2000);
  const zaman = setTimeout(() => kapat(), SURE);
  function kapat() { clearInterval(yen); clearTimeout(zaman); cancelAnimationFrame(raf); ipKapat(); try { gor?.r.dispose(); gor?.r.forceContextLoss?.(); } catch {} gor = null; el.remove(); if (W?.el === el) W = null; }
  el.querySelectorAll('[data-id="btn_close"]').forEach((b) => { b.style.pointerEvents = 'auto'; b.onclick = (e) => { e.stopPropagation(); kapat(); }; });
  const esc = (e) => { if (e.key === 'Escape' && el.isConnected) { kapat(); removeEventListener('keydown', esc, true); } }; addEventListener('keydown', esc, true);
  W = { el, kapat };
}
