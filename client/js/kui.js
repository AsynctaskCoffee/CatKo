// KO arayüz çizicisi — CN3UIBase ağaçlarını (ui.json) DOM'a çevirir.
// Kurallar orijinal istemciden:
//  - bölgeler (rect) kök pencereye göre piksel; ölçek 1:1 (1024x768 tasarım)
//  - çocuklar dosya sırasıyla çizilir (AddChild başa ekler, Render tersten dolaşır)  CN3UIBase
//  - düğme: reserved 0 normal, 1 basılı, 2 üzerinde, 3 pasif     CN3UIButton
//  - ilerleme: 0 arka, 1 ön (yüzdeye göre kırpılır)              CN3UIProgress
//  - gösterge (v2038 tip 17): 0 arka, 2 boş zemin, 1 dolgu        hedef çubuğu
let UI = null, BASE = '';
// KO fare imleci: basılıyken koyu ok (client.css html.basili)
addEventListener('pointerdown', () => document.documentElement.classList.add('basili'), true);
addEventListener('pointerup', () => document.documentElement.classList.remove('basili'), true);
addEventListener('blur', () => document.documentElement.classList.remove('basili'));
const ver = (u) => (window.KO_V ? window.KO_V(u) : u);   // sürüm eki: yeni yayında eski önbellek kullanılmaz

export async function loadUI(base) {
  if (UI) return UI;
  BASE = base;
  const r = await fetch(`${base}/ui.json`);
  if (!r.ok) throw new Error('ui.json ' + r.status);
  UI = await r.json();
  // atlasları önceden yükle (ilk çizimde boş kare görünmesin)
  await Promise.all(UI.atlases.map((a) => new Promise((res) => { const i = new Image(); i.onload = i.onerror = res; i.src = ver(`${base}/${a.f}`); })));
  return UI;
}
export const hasLayout = (name) => !!UI?.layouts?.[name];
/** Ek arayüz paketi (ör. assets/ui/mail): yerleşimleri, parçaları ve atlasları ana pakete katar (parça numaraları kaydırılır) */
const ekler = new Map();
export function ekUI(alt, onYukle = () => true) {   // onYukle(atlas): önceden indirilecek atlaslar (diğerleri ilk görünüşte iner)
  if (ekler.has(alt)) return ekler.get(alt);
  const p = (async () => {
    if (!UI) return false;
    const r = await fetch(ver(`${BASE}/${alt}/ui.json`)); if (!r.ok) return false;
    const E = await r.json();
    const offA = UI.atlases.length, offB = (UI.big ||= []).length, offS = UI.sprites.length;
    for (const a of E.atlases || []) UI.atlases.push({ ...a, f: `${alt}/${a.f}` });
    for (const b of E.big || []) UI.big.push({ ...b, f: `${alt}/${b.f}` });
    for (const s of E.sprites || []) UI.sprites.push(s[0] < 0 ? [-1, s[1] + offB, s[2], s[3], s[4]] : [s[0] + offA, s[1], s[2], s[3], s[4]]);
    const kaydir = (n) => { if (n.sp != null) n.sp += offS; for (const c of n.ch || []) kaydir(c); };
    for (const [k, L] of Object.entries(E.layouts || {})) { kaydir(L); UI.layouts[k] = L; }
    await Promise.all((E.atlases || []).filter(onYukle).map((a) => new Promise((res) => { const i = new Image(); i.onload = i.onerror = res; i.src = ver(`${BASE}/${alt}/${a.f}`); })));
    return true;
  })().catch(() => false).then((ok) => { if (!ok) ekler.delete(alt); return ok; });   // başarısızsa (arayüz henüz yüklenmemiş) önbelleğe alınmaz, sonra yeniden denenir
  ekler.set(alt, p); return p;
}

const STY = { ALIGNLEFT: 0x200000, ALIGNRIGHT: 0x400000, ALIGNCENTER: 0x800000, ALIGNTOP: 0x1000000, ALIGNBOTTOM: 0x2000000, ALIGNVCENTER: 0x4000000, SINGLE: 0x100000,
  R2L: 0x20000000, T2B: 0x40000000, B2T: 0x80000000 };

function argb(c) {   // "#aarrggbb" → css
  if (!c || c.length !== 9) return '#fff';
  const a = parseInt(c.slice(1, 3), 16) / 255;
  return `rgba(${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${parseInt(c.slice(7, 9), 16)},${a > 0 ? a.toFixed(3) : 1})`;
}

function spriteStyle(el, sp, w, h) {
  const [ai, x, y, sw, sh] = UI.sprites[sp];
  if (ai < 0) {   // tam ekran görüntü: ayrı dosya
    el.style.backgroundImage = `url(${ver(`${BASE}/${UI.big[x].f}`)})`; el.style.backgroundSize = '100% 100%'; return;
  }
  const a = UI.atlases[ai];
  const kx = w / sw, ky = h / sh;
  el.style.backgroundImage = `url(${ver(`${BASE}/${a.f}`)})`;
  el.style.backgroundSize = `${a.w * kx}px ${a.h * ky}px`;
  el.style.backgroundPosition = `${-x * kx}px ${-y * ky}px`;
}

/**
 * Yerleşimi kur. Dönen nesne:
 *   el        kök öğe
 *   get(id)   kimliğe göre öğe (ilk eşleşen)
 *   all(id)   aynı kimlikli tüm öğeler
 *   progress(id, oran)  text(id, s)  show(id, bool)  click(id, fn)
 */
export function buildLayout(name, { className = '' } = {}) {
  const L = UI.layouts[name]; if (!L) throw new Error('yerleşim yok: ' + name);
  const byId = new Map();
  const make = (n, px, py, parentType, sira = 0, adet = 1) => {
    const el = document.createElement('div');
    // (4.11) yeni KO uif ilerleme çubuğu (tür 17, ör. re_target_framebar grpg_level_*): çocuklar [zemin, gri, dolgu] → st0 / st2 / st1
    const st17 = parentType === '17' && n.t === 'img' ? (sira === 0 ? 0 : sira === adet - 1 ? 1 : 2) : null;
    el.className = 'kui kui-' + n.t + ((parentType === 'btn' || parentType === 'pr' || parentType === 'g') && n.t === 'img' ? ' st' + (n.v || 0) : st17 != null ? ' st' + st17 : '');
    const [x, y, w, h] = n.r;
    el.style.cssText = `left:${x - px}px;top:${y - py}px;width:${w}px;height:${h}px`;
    if (n.hid) el.hidden = true;
    if (n.id) { el.dataset.id = n.id; if (!byId.has(n.id)) byId.set(n.id, []); byId.get(n.id).push(el); }
    if (n.sp != null) spriteStyle(el, n.sp, w, h);
    if (n.t === 'tx') {
      const s = n.s || 0, fs = n.f ? Math.round(n.f[0] * 1.3) : 12;
      el.style.font = `${n.f?.[1] ? 'bold ' : ''}${fs}px Arial, 'Segoe UI', sans-serif`;
      el.style.color = argb(n.c);
      el.style.justifyContent = s & STY.ALIGNCENTER ? 'center' : s & STY.ALIGNRIGHT ? 'flex-end' : 'flex-start';
      el.style.alignItems = s & STY.ALIGNVCENTER ? 'center' : s & STY.ALIGNBOTTOM ? 'flex-end' : 'flex-start';
      if (n.tx && /[ㄱ-힝]/.test(n.tx)) el.textContent = '';   // Korece yer tutucu metinleri gösterme
      else el.textContent = n.tx || '';
    }
    if (n.t === 'pr' || n.t === 'g' || n.t === '17') { el._dir = n.s & STY.R2L ? 'r' : n.s & STY.B2T ? 'b' : n.s & STY.T2B ? 't' : 'l'; }
    if (n.ch) n.ch.forEach((c, i) => el.append(make(c, x, y, n.t, i, n.ch.length)));
    if (n.t === 'pr' || n.t === 'g') { const f = el.querySelector(':scope > .st1'); if (f) f.style.clipPath = 'inset(0 100% 0 0)'; }
    return el;
  };
  const root = make(L, 0, 0, null);
  root.classList.add('kui-root'); if (className) root.className += ' ' + className;
  root.style.left = root.style.top = '';
  const all = (id) => byId.get(id) || [];
  const get = (id) => all(id)[0] || null;
  return {
    el: root, get, all,
    progress(id, v, el = get(id)) {
      if (!el) return;
      const p = Math.max(0, Math.min(1, v || 0)) * 100, fore = el.querySelector(':scope > .st1');
      if (!fore) return;
      const cut = (100 - p).toFixed(2) + '%';
      fore.style.clipPath = el._dir === 'r' ? `inset(0 0 0 ${cut})` : el._dir === 'b' ? `inset(${cut} 0 0 0)` : el._dir === 't' ? `inset(0 0 ${cut} 0)` : `inset(0 ${cut} 0 0)`;
    },
    text(id, s) { for (const e of all(id)) e.textContent = s; },
    /** düzenleme kutusuna (CN3UIEdit) gerçek <input> yerleştir */
    input(id, attrs = {}) {
      const e = get(id); if (!e) return null;
      e.textContent = '';
      const inp = document.createElement('input'); inp.className = 'kui-input'; inp.autocomplete = 'off'; inp.spellcheck = false;
      Object.assign(inp, attrs); e.append(inp); return inp;
    },
    show(id, on) { for (const e of all(id)) e.hidden = !on; },
    click(id, fn) { for (const e of all(id)) { e.classList.add('kui-tik'); e.onclick = (ev) => { ev.stopPropagation(); fn(ev); }; } },
  };
}

/** Yerleşimdeki İngilizce etiketleri çevir (tam eşleşme, boşluklar kırpılır) */
export function translateLayout(L, map) {
  L.el.querySelectorAll('.kui-tx').forEach((e) => { const t = e.textContent.trim(); if (map[t] != null) e.textContent = map[t]; });
}
export const UI_BASE = new URL('../assets/ui', import.meta.url).href.replace(/\/$/, '');

/** Pencereyi sürüklenebilir yap (başlık bandı: üstten h piksel) */
export function draggable(L, h = 40, { tam = false } = {}) {   // tam: pencere hiçbir zaman ekran dışına taşmaz
  const el = L.el; let d = null;
  el.addEventListener('pointerdown', (e) => {
    const r = el.getBoundingClientRect();
    if (el.dataset.sabit || e.clientY - r.top > h || e.target.closest('.kui-btn, input')) return;   // ekran kenarına yaslı pencereler (envanter, karakter bilgisi) taşınmaz
    d = { x: e.clientX - r.left, y: e.clientY - r.top }; el.setPointerCapture(e.pointerId); e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (!d) return;
    if (tam) {
      const r = el.getBoundingClientRect(), z = r.width / (el.offsetWidth || r.width) || 1;
      el.style.left = Math.max(0, Math.min((innerWidth - r.width) / z, (e.clientX - d.x) / z)) + 'px';
      el.style.top = Math.max(0, Math.min((innerHeight - r.height) / z, (e.clientY - d.y) / z)) + 'px';
    } else {
    el.style.left = Math.max(-el.offsetWidth + 60, Math.min(innerWidth - 60, e.clientX - d.x)) + 'px';
    el.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - d.y)) + 'px';
    }
    el.style.right = el.style.bottom = 'auto'; el.style.margin = '0';
  });
  el.addEventListener('pointerup', () => (d = null));
}

/** Yerleşim JSON'unda bir düğmenin (ya da görüntünün) durum görüntüsünün parça numarası */
export function findSprite(layout, id, v = 0) {
  const walk = (n) => {
    if (n.id === id) { if (n.sp != null) return n.sp; const c = (n.ch || []).find((x) => x.t === 'img' && (x.v || 0) === v && x.sp != null); if (c) return c.sp; }
    for (const c of n.ch || []) { const r = walk(c); if (r != null) return r; }
    return null;
  };
  return UI?.layouts?.[layout] ? walk(UI.layouts[layout]) : null;
}
/** Öğeye parçayı verilen boyutta çiz */
export function paintSprite(el, sp, w, h) { spriteStyle(el, sp, w, h); el.style.backgroundRepeat = 'no-repeat'; }
