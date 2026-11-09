// KO NPC menüsü (re_npcmenu / CUINPCEvent): NPC adı, konuşma metni ve 7 satırlık seçenek listesi.
// KO arayüz dokusu yüklüyse orijinal yerleşim (kui), değilse aynı yerleşimde KO renklerinde çizim.
import * as THREE from '../vendor/three.module.min.js';
import { hasLayout, buildLayout, draggable } from './kui.js';
import { hasNpc, createNpc } from './character.js';
import { bindScroll } from './hud.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let win = null;

// ---- NPC portresi: yuvarlak çerçevede kafa + omuzlar, siyah zemin (ayrı küçük WebGL tuvali, açıkken nefes animasyonu).
// Her NPC aynı sabit açıdan (tam önden, hafif yukarıdan) ve aynı oranda çerçevelenir: çerçeve kafa ekleminden ölçülür (şapka, asa,
// kanat gibi uzun parçalar çerçeveyi bozmaz) ve kamera her karede kafa eklemini izler — nefes/boşta animasyonu kafayı kadrajdan çıkaramaz.
// Her pencerenin (NPC menüsü, görev penceresi) kendi tuvali vardır; biri açılınca diğerinin portresi kaybolmaz.
const PS = new Map();
function portreKur(yer) {
  if (PS.has(yer)) return PS.get(yer);
  const cv = document.createElement('canvas'); cv.className = 'npm-portre-tuval'; cv.width = cv.height = 196;
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, preserveDrawingBuffer: true });
  r.setClearColor(0x000000, 1); r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  sc.add(new THREE.AmbientLight(0xffffff, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(0.6, 1.2, -1.5); sc.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const P = { cv, r, sc, cam, api: null, key: null, model: null, run: false };
  PS.set(yer, P);
  return P;
}
// menü kapanınca portre sahnesi boşaltılır; her açılışta NPC yeniden kurulur (önceki model üst üste binmez)
function portreTemizle(P) {
  for (const p of P === undefined ? PS.values() : P ? [P] : []) {
    p.key = null; p.run = false; p.api = null; p.model = null;
    if (p.g) { p.sc.remove(p.g); p.g = null; }
    p.r.clear();
  }
}
const _k = new THREE.Vector3();
/** kafa eklemi: adı head/bip01 head olan; yoksa boyun; yoksa en yüksekteki eklem */
function kafaEklemi(api) {
  const ad = api.eklemAdlari || [];
  let i = ad.findIndex((n) => /(^|[\s_])head$/i.test(n.trim()) && !/horse/i.test(n));
  if (i < 0) i = ad.findIndex((n) => /head/i.test(n) && !/nub|end|hair|top|horse/i.test(n));
  if (i < 0) i = ad.findIndex((n) => /neck/i.test(n));
  if (i < 0) { let y = -1e9; ad.forEach((_, j) => { const m = api.joint(j); if (m && m[13] > y) { y = m[13]; i = j; } }); }
  return i;
}
// kafa ekleminin derisine bağlı köşelerin kutusu (KO: kafa + saç + miğfer); yoksa null
function kafaKutusu(api, ki) {
  const v = new THREE.Vector3(), xs = [], ys = [], zs = [];
  api.group.updateMatrixWorld(true);
  for (const m of api.group.children) {
    if (!m.isSkinnedMesh || !m.visible) continue;
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight; if (!si || !sw) continue;
    for (let i = 0; i < si.count; i++) {
      let w = 0; for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === ki) w += sw.getComponent(i, c);
      if (w < 0.5) continue;
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); xs.push(v.x); ys.push(v.y); zs.push(v.z);
    }
  }
  if (ys.length < 4) return null;
  // uçlar (miğfer sorgucu, boynuz, uzun saç ucu) kadrajı büyütmesin: köşelerin %4–%90 aralığı
  const yuzde = (a, q) => { const b = Float32Array.from(a).sort(); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
  return new THREE.Box3(new THREE.Vector3(yuzde(xs, 0.04), yuzde(ys, 0.04), yuzde(zs, 0.04)), new THREE.Vector3(yuzde(xs, 0.96), yuzde(ys, 0.9), yuzde(zs, 0.96)));
}
// eklemin portre sahnesindeki konumu (model grubu z'de aynalı)
const kafaKonum = (api, i, out) => { const m = api.joint(i); return m ? out.set(m[12], m[13], -m[14]) : null; };

export async function portre(model, yer, aktif = () => win && !win.el.hidden) {
  const p = portreKur(yer);
  if (yer && p.cv.parentElement !== yer) yer.append(p.cv);
  if (model && p.model === model && p.api) { p.aktif = aktif; if (!p.run) dongu(p); return; }   // aynı NPC: yeniden kurma (titreme/kaybolma yok)
  portreTemizle(p);
  const anahtar = p.key = model + ':' + performance.now(); p.model = model; p.aktif = aktif;
  if (!model || !hasNpc(model)) return;
  const api = await createNpc(model).catch(() => null); if (!api || p.key !== anahtar) return;
  api.update(0);
  const g = new THREE.Group(); g.add(api.group); api.group.scale.z = -1; p.sc.add(g); p.g = g;   // KO modeli aynalı
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(api.group, true);
  const ki = kafaEklemi(api), kafa = (ki >= 0 && kafaKonum(api, ki, new THREE.Vector3())) || null;
  const kk = ki >= 0 ? kafaKutusu(api, ki) : null;
  // kadraj (her NPC'de aynı oran): kafanın tepesi üstte %10 boşlukla, kafa yüksekliğinin ~2,25 katı (kafa + omuzlar)
  let ust, kafaBoy, cx, cz;
  if (kk && kk.max.y - kk.min.y > 0.05) {
    // kafa boyu: dikey ölçü, kafanın enine göre sınırlanır (boyun/omuz köşeleri ya da sorguç kafayı uzatmasın)
    const en = Math.max(kk.max.x - kk.min.x, 0.05);
    kafaBoy = Math.min(Math.max(kk.max.y - kk.min.y, en * 1.1), en * 1.6); ust = kk.min.y + kafaBoy;
    cx = (kk.min.x + kk.max.x) / 2; cz = (kk.min.z + kk.max.z) / 2;
  } else { const h = Math.max(0.5, box.max.y - box.min.y); ust = box.max.y; kafaBoy = h * 0.13; cx = (box.min.x + box.max.x) / 2; cz = (box.min.z + box.max.z) / 2; }
  const gorus = kafaBoy * 2.7, merkezY = ust + kafaBoy * 0.3 - gorus / 2;
  const dist = (gorus / 2) / Math.tan(THREE.MathUtils.degToRad(p.cam.fov / 2));
  const yuk = Math.tan(THREE.MathUtils.degToRad(6)) * dist;   // sabit açı: tam önden, 6° yukarıdan
  // kamera kafa eklemini izler: ofsetler eklemin ilk konumuna göre
  const tut = kafa ? kafa.clone() : new THREE.Vector3(cx, merkezY, cz);
  p.ofs = { hedef: new THREE.Vector3(cx - tut.x, merkezY - tut.y, cz - tut.z) };
  p.ofs.kam = p.ofs.hedef.clone().add(new THREE.Vector3(0, yuk, -dist));
  p.ki = kafa ? ki : -1; p.izle = tut.clone();
  p.api = api; kadrajla(p); p.r.render(p.sc, p.cam);
  dongu(p);
}
// kamera kafayı izler (yumuşak), açı ve uzaklık hep aynı
function kadrajla(p, k = 1) {
  if (p.ki >= 0 && kafaKonum(p.api, p.ki, _k)) p.izle.lerp(_k, k);
  const h = p.izle;
  p.cam.position.set(h.x + p.ofs.kam.x, h.y + p.ofs.kam.y, h.z + p.ofs.kam.z);
  p.cam.lookAt(h.x + p.ofs.hedef.x, h.y + p.ofs.hedef.y, h.z + p.ofs.hedef.z);
}
function dongu(p) {
  if (p.run) return;
  p.run = true; const anahtar = p.key; let son = performance.now();
  const adim = (now) => {
    if (!p.aktif?.() || !p.api || p.key !== anahtar) { if (p.key === anahtar) p.run = false; return; }
    if (now - son > 33) { p.api.update(Math.min(0.1, (now - son) / 1000)); son = now; kadrajla(p, 0.35); p.r.render(p.sc, p.cam); }
    requestAnimationFrame(adim);
  };
  requestAnimationFrame(adim);
}

function kur() {
  if (win) return win;
  const layer = document.getElementById('kohud') || document.body;
  if (hasLayout('re_npcmenu')) {
    const L = buildLayout('re_npcmenu', { className: 'ko-npcmenu ko-pencere kui-dokulu' });
    layer.append(L.el); draggable(L, 30);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    // portresiz görünüm (KO: portresi olmayan NPC'ler, ör. [Disciple of Hepa] Shozin): çerçevedeki portre halkası, parşömenin
    // sola doğru gerilmiş kopyasıyla örtülür; konuşma metni tüm genişliğe yayılır
    const cerceve = [...L.el.children].find((c) => c.classList.contains('kui-img') && parseFloat(c.style.width) > 380 && parseFloat(c.style.height) > 150);
    let ortu = null;
    // uzat (px): konuşma alanı (parşömen) aşağı doğru uzar — KO'da az seçenekli uzun konuşmalar (ör. Shozin "Chatting")
    let gov = null, alt = null;
    // KO: portresiz NPC çerçevesi (re_quest_npc_menu01 çerçevesinden: portre halkası yerine sağ kenarın aynası, parşömen kutusu sola uzar)
    const PORTRESIZ = new URL('../assets/ui/npm_portresiz.webp', import.meta.url).href;
    const zemin = (el, on) => { if (!el) return; if (el.dataset.bg0 == null) { el.dataset.bg0 = el.style.backgroundImage; el.dataset.bs0 = el.style.backgroundSize; el.dataset.bp0 = el.style.backgroundPosition; }
      el.style.backgroundImage = on ? `url(${PORTRESIZ})` : el.dataset.bg0; el.style.backgroundSize = on ? '100% 100%' : el.dataset.bs0; el.style.backgroundPosition = on ? '0 0' : el.dataset.bp0; };
    const portresiz = (on, uzat = 0) => {
      const E = on ? Math.max(0, uzat) : 0;
      zemin(cerceve, on);
      if (on && !ortu && cerceve) {
        // gövde: çerçevenin orta bandı (y 60–140: yan tahtalar + zemin) dikeyde gerilir; alt şerit (y 140–173) uzatma kadar aşağı iner
        gov = document.createElement('div'); gov.style.cssText = 'position:absolute;left:0;top:60px;width:390px;overflow:hidden;pointer-events:none;z-index:0';
        const g1 = cerceve.cloneNode(true); g1.removeAttribute('data-id'); g1.style.transformOrigin = '0 0'; gov.append(g1);
        alt = document.createElement('div'); alt.style.cssText = 'position:absolute;left:0;width:390px;height:34px;overflow:hidden;pointer-events:none;z-index:0';
        const a1 = cerceve.cloneNode(true); a1.removeAttribute('data-id'); a1.style.top = '-140px'; a1.style.left = cerceve.style.left; alt.append(a1);
        ortu = document.createElement('div'); ortu.className = 'npm-portresiz';
        ortu.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none;z-index:1';
        const kopya = cerceve.cloneNode(true); kopya.removeAttribute('data-id'); kopya.style.transformOrigin = '0 0'; ortu.append(kopya);
        cerceve.after(gov, alt, ortu);
      }
      if (ortu) {
        gov.hidden = alt.hidden = !on; ortu.hidden = true;   // eski gerilmiş parşömen örtüsü yerine hazır portresiz çerçeve
        zemin(gov.firstChild, on); zemin(alt.firstChild, on);
        const SX = 112, SW = 242, DX = 14, DW = 342, Y0 = 44, H = 114 + E, k = DW / SW, ky = H / 114;
        Object.assign(ortu.style, { left: DX + 'px', top: Y0 + 'px', width: DW + 'px', height: H + 'px' });
        const kp = ortu.firstChild; kp.style.left = (-SX * k) + 'px'; kp.style.top = (-Y0 * ky + parseFloat(cerceve.style.top || 0)) + 'px'; kp.style.transform = `scale(${k}, ${ky})`;
        const gy = (80 + E) / 80; gov.style.height = (80 + E) + 'px'; gov.firstChild.style.top = (-60 * gy) + 'px'; gov.firstChild.style.transform = `scaleY(${gy})`;
        alt.style.top = (140 + E) + 'px';
      }
      const t = L.get('Text_Title'); if (t) { if (!t.dataset.l0) { t.dataset.l0 = t.style.left; t.dataset.w0 = t.style.width; t.dataset.h0 = t.style.height; }
        t.style.left = on ? '58px' : t.dataset.l0; t.style.width = on ? '272px' : t.dataset.w0; t.classList.toggle('npm-portresiz-metin', on); t.style.height = on ? (parseFloat(t.dataset.h0) + E) + 'px' : t.dataset.h0; t.style.zIndex = '2'; }
      const sc = L.get('scroll');
      if (sc) { sc.style.zIndex = '3'; if (!sc.dataset.h0) sc.dataset.h0 = sc.style.height; sc.style.height = (parseFloat(sc.dataset.h0) + E) + 'px';
        for (const c of sc.children) { if (c.dataset.t0 == null) { c.dataset.t0 = c.style.top; c.dataset.hh0 = c.style.height; }
          const t0 = parseFloat(c.dataset.t0), h0 = parseFloat(c.dataset.hh0);
          if (c.classList.contains('kui-tr')) c.style.height = (h0 + E) + 'px'; else if (t0 > 20) c.style.top = (t0 + E) + 'px'; } }
      const im = L.get('img_npc'); if (im) im.style.visibility = on ? 'hidden' : '';
      // çerçevenin alt çizgisi (y 171, 7 px) uzatma kadar aşağı
      for (const c of L.el.children) { if (!c.classList.contains('kui-img') || c.dataset.ust0 === undefined && !(parseFloat(c.style.top) === 171 && parseFloat(c.style.height) === 7)) continue; c.dataset.ust0 ??= '171'; c.style.top = (171 + E) + 'px'; }
      win.uzatma = E; win.pAcik = on;
      if (sc && !on) sc.style.visibility = '';
    };
    // portresiz görünümde (KO Shozin) metin sığıyorsa kaydırma çubuğu gösterilmez
    const kaydirmaBak = () => requestAnimationFrame(() => { const t = L.get('Text_Title'), sc = L.get('scroll'); if (!t || !sc) return; sc.style.visibility = win.pAcik && t.scrollHeight <= t.clientHeight + 2 ? 'hidden' : ''; });
    win = { el: L.el, portresiz, ad: (t) => L.text('Text_NpcName', t), metin: (t) => { L.text('Text_Title', t); kaydirmaBak(); },
      satir: (i, t, fn) => {
        if (i < 7) { L.show(`group_menu_${i}`, !!t); L.text(`str_menu${i}`, t || ''); L.click(`Btn_menu${i}`, () => fn?.()); return; }
        // KO: 7'den fazla seçenek (ör. Kaishan 10 satır) — 7. satırın kopyası, 32 px aralıkla alta eklenir
        let g = L.el.querySelector(`:scope > [data-id="group_menu_${i}"]`);
        if (!g && !t) return;
        if (!g) {
          const g0 = L.get('group_menu_6'); g = g0.cloneNode(true); g.dataset.id = `group_menu_${i}`; g.style.top = (178 + 32 * i) + 'px';
          g.querySelector('[data-id="Btn_menu6"]')?.setAttribute('data-id', `Btn_menu${i}`); g.querySelector('[data-id="str_menu6"]')?.setAttribute('data-id', `str_menu${i}`);
          g.querySelector(`[data-id="Btn_menu${i}"]`)?.addEventListener('click', (e) => { e.stopPropagation(); g._fn?.(); });
          L.el.querySelector('[data-id="group_bottom"]')?.before(g);
        }
        g.hidden = !t; g._fn = fn; const sx = g.querySelector(`[data-id="str_menu${i}"]`); if (sx) sx.textContent = t || '';
      },
      html: (i, h) => { if (i >= 7) { const sx = L.el.querySelector(`[data-id="str_menu${i}"]`); if (sx) sx.innerHTML = h; return; } for (const e of L.all?.(`str_menu${i}`) || [L.get(`str_menu${i}`)]) if (e) e.innerHTML = h; },
      kapat: () => { L.el.hidden = true; portreTemizle(PS.get(L.get('img_npc') || L.el.querySelector('.npm-portre'))); } };
    L.click('btn_close', () => win.kapat());
    // konuşma metni uzunsa: sağdaki KO kaydırma çubuğu (oklar, tutamak, tekerlek) metni kaydırır
    { const t = L.get('Text_Title'); if (t) { t.classList.add('npm-kaydir'); t.style.pointerEvents = 'auto'; bindScroll(L.get('scroll'), t); win.basaSar = () => { t.scrollTop = 0; t.dispatchEvent(new Event('scroll')); }; } }
    return win;
  }
  // doku yoksa: re_npcmenu ölçülerinde (389×435) KO görünümlü pencere
  const el = document.createElement('div'); el.className = 'ko-npcmenu ko-npcmenu-yedek ko-pencere';
  el.innerHTML = `<div class="npm-baslik"><span class="npm-ad"></span><b class="npm-kapat" title="Close">×</b></div>
    <div class="npm-ust"><div class="npm-portre"></div><div class="npm-metin"></div></div>
    <div class="npm-satirlar">${Array.from({ length: 7 }, (_, i) => `<button class="npm-satir" data-i="${i}"></button>`).join('')}</div>
    <div class="npm-alt"></div>`;
  layer.append(el);
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  // başlıktan sürükle
  const bas = el.querySelector('.npm-baslik');
  bas.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.npm-kapat')) return;
    const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top; bas.setPointerCapture(e.pointerId);
    const mv = (ev) => { el.style.left = ev.clientX - ox + 'px'; el.style.top = ev.clientY - oy + 'px'; el.style.transform = 'none'; };
    const up = () => { bas.removeEventListener('pointermove', mv); bas.removeEventListener('pointerup', up); };
    bas.addEventListener('pointermove', mv); bas.addEventListener('pointerup', up);
  });
  const fns = [];
  el.querySelectorAll('.npm-satir').forEach((b) => b.addEventListener('click', () => fns[b.dataset.i]?.()));
  win = { el, ad: (t) => (el.querySelector('.npm-ad').textContent = t), metin: (t) => (el.querySelector('.npm-metin').textContent = t),
    satir: (i, t, fn) => { let b = el.querySelector(`.npm-satir[data-i="${i}"]`); if (!b) { if (!t) return; b = document.createElement('button'); b.className = 'npm-satir'; b.dataset.i = i; b.addEventListener('click', () => fns[b.dataset.i]?.()); el.querySelector('.npm-satirlar').append(b); } b.hidden = !t; b.textContent = t || ''; fns[i] = fn; },
    html: (i, h) => { el.querySelector(`.npm-satir[data-i="${i}"]`).innerHTML = h; },
    kapat: () => { el.hidden = true; portreTemizle(PS.get(el.querySelector('.npm-portre'))); } };
  el.querySelector('.npm-kapat').addEventListener('click', () => win.kapat());
  return win;
}

/** secenekler: [{ad, fn}] (KO: 7 satır; fazlası için pencere aşağı uzar, en çok 12) */
/** ust: konuşma metni ile seçenekler arasına KO temalı ek panel (ör. görev ödülleri) — { html, yukseklik, bagla(el) } */
export function npcMenuAc({ ad, metin, secenekler, model = null, ust = null, resim = null, portresiz = false, uzat = 0, enAz = 7 }) {
  const w = kur(); w.portresiz?.(!!portresiz, uzat); const ilk = w.el.hidden !== false || !w.acildi; w.el.hidden = false;
  w.ad(ad); w.metin(metin); w.basaSar?.();
  const N = Math.min(12, Math.max(enAz, secenekler.length));   // enAz: KO'daki gibi yalnız seçenek sayısı kadar satır (ör. Royal National Enchanter 5)
  for (let i = 0; i < 12; i++) { const s = i < N ? secenekler[i] : null; w.satir(i, s?.ad, s && !s.kapali && (() => { if (!s.kalsin) w.kapat(); s.fn?.(); })); }
  // kapalı (KO'da gri) satırlar: tıklanmaz
  for (let i = 0; i < N; i++) { const g = w.el.querySelector(`[data-id="group_menu_${i}"]`) || w.el.querySelector(`.npm-satir[data-i="${i}"]`); g?.classList.toggle('npm-kapali', !!secenekler[i]?.kapali); }
  secenekler.forEach((s, i) => { if (s?.html && i < N) w.html(i, s.html); });   // renkli satır (ör. yeşil "(Tamamlandı)")
  // uzun satırlar: tek satırda kalsın, sığmazsa yazı küçülür (en az 8 px)
  requestAnimationFrame(() => {
    for (const e of w.el.querySelectorAll('[data-id^="str_menu"], .npm-satir')) {
      if (e.hidden || !e.textContent) continue;
      e.style.fontSize = ''; e.style.letterSpacing = ''; e.style.whiteSpace = 'nowrap'; e.style.overflow = 'hidden';
      let fs = parseFloat(getComputedStyle(e).fontSize) || 12;
      while (e.scrollWidth > e.clientWidth + 1 && fs > 8) { fs -= 0.5; e.style.fontSize = fs + 'px'; e.style.letterSpacing = '-0.2px'; }
    }
  });
  // KO: alt süs son satırın hemen altına oturur (boş satır bırakılmaz)
  // ek panel: seçenekler ve alt süs panel yüksekliği kadar aşağı kayar
  const H = (ust ? (ust.yukseklik || 70) : 0) + (w.uzatma || 0);   // ek panel + uzatılmış konuşma alanı
  let pan = w.el.querySelector(':scope > .npm-ust-panel');
  if (ust) {
    if (!pan) { pan = document.createElement('div'); pan.className = 'npm-ust-panel'; w.el.append(pan); }
    pan.style.height = H + 'px'; pan.innerHTML = ust.html; pan.hidden = false; ust.bagla?.(pan);
  } else if (pan) pan.hidden = true;
  for (let i = 0; i < N; i++) { const g = w.el.querySelector(`[data-id="group_menu_${i}"]`) || w.el.querySelector(`.npm-satir[data-i="${i}"]`); if (g) g.style.transform = H ? `translateY(${H}px)` : ''; }
  const alt = w.el.querySelector('[data-id="group_bottom"]');
  if (alt) { const n = Math.min(N, secenekler.length); alt.style.top = (178 + 32 * n + H) + 'px'; }
  // her açılışta ekranın ortası
  requestAnimationFrame(() => {
    const r = w.el.getBoundingClientRect(), z = r.width / (w.el.offsetWidth || r.width) || 1;
    w.el.style.transform = 'none';
    w.el.style.left = Math.max(0, (innerWidth - r.width) / 2 / z) + 'px'; w.el.style.top = Math.max(0, (innerHeight - r.height) / 2 / z) + 'px';
  });
  // KO npcimg portresi (ör. Inn Hostess: buysellinn sandık) varsa 3B model yerine yuvarlak resim
  const yer = w.el.querySelector('[data-id="img_npc"]') || w.el.querySelector('.npm-portre');
  let ri = yer?.querySelector(':scope > .npm-resim');
  if (resim) { if (!ri) { ri = document.createElement('i'); ri.className = 'npm-resim'; yer?.append(ri); } ri.style.backgroundImage = `url(${resim})`; ri.hidden = false; portre(null, yer); }
  else { if (ri) ri.hidden = true; portre(portresiz ? null : model, yer); }
  w.acildi = true;
  w.el.style.zIndex = 60;
  return w;
}
export const npcMenuMetin = (t) => win?.metin(t);
export const npcMenuKapat = () => win?.kapat();
// KO: menü dışına tıklayınca ya da yürümeye başlayınca kapanır
addEventListener('pointerdown', (e) => { if (win && !win.el.hidden && !win.el.contains(e.target) && !e.target.closest?.('.ko-mesaj, [data-id="Btn_Yes"], [data-id="Btn_No"]')) win.kapat(); }, true);
addEventListener('keydown', (e) => { if (win && !win.el.hidden && e.target.tagName !== 'INPUT' && /^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Escape)$/.test(e.code)) win.kapat(); }, true);

// ---- Kaishan (NPC 18004): yetenek açma, KO reskill / restat (seviyeye göre Noah: kobugda.com/reskill, sunucu reset_ucret)
export function kaishanMenu({ sb, character, hud, state, onSinif, model = 'npc_31900' }) {
  const rpc = async (fn) => {
    const { data, error } = await sb.rpc(fn, { p_char: character.id });
    if (error) { hud.notice?.(error.message, 'hata'); return null; }
    return data;
  };
  const noah = (n) => Number(n || 0).toLocaleString('tr-TR');
  const altinGuncelle = (g) => { if (g != null) { state?.combat?.odulUygula?.({ gold: g }); state?.inv?.reload?.(); } };
  const SINIF = { 1: 'Warrior', 2: 'Rogue', 3: 'Magician', 4: 'Priest', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Enchanter',
    11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Skilled Kurian', 15: 'Master Kurian' };
  // KO 2369 Kaishan ana menüsü (orijinal sıra ve metinler: Quest_Talk 102 "What mission do you want?", Quest_Menu 40987 / 40988 …).
  // Redistributions → yetenek açma / reskill / restat alt menüsü. Ulus değiştirme, klan kurtarma, geri satın alma, Chick mezuniyeti,
  // rebirth stat dağıtımı, klan ulus puanı sertifikası ve Kaishan's trust sistemleri sunucuda henüz yok: KO metniyle bilgi verir.
  const temiz = (t) => String(t).replace(/<font[^>]*>|<\/font>/gi, '').replace(/\|/g, '\n').replace(/\s{2,}/g, ' ').trim();
  const bilgi = (t) => () => npcMenuMetin(temiz(t));
  const yeniden = () => ana();
  const dagitim = () => npcMenuAc({
    ad: '[Grand Merchant] Kaishan', model,
    metin: `Welcome, ${character.name}! You have come to the right place to unlock your skills and rearrange your skill points.`,
    secenekler: [
      { ad: 'Unlock my skills', fn: async () => {
        const d = await rpc('skill_open'); if (!d) return;
        hud.notice?.(d.mesaj || '', d.ok ? 'seviye' : 'hata'); hud.info?.(d.mesaj || '', d.ok ? 'beceri' : 'hata');
        if (d.class) { character.class = d.class; onSinif?.(d); }
        if (d.ok) hud.acPanel?.('beceri');   // KO: yetenek penceresi açılır
      } },
      { ad: 'Reset my skill points', kalsin: true, fn: async () => {
        const u = await rpc('reset_ucret_bilgi'); if (!u) return;
        hud.soru?.('Skill reset', `Do you want to take back all the skill points you have distributed?\nFee (level ${u.level}): ${noah(u.reskill)} Noah`, async () => {
          const d = await rpc('skill_reset'); if (!d) return; npcMenuMetin(d.mesaj); hud.info?.(d.mesaj, d.ok === false ? 'hata' : 'beceri');
          if (d.ok !== false) { dispatchEvent(new CustomEvent('ko-yetenek-sifirlandi')); altinGuncelle(d.gold); onSinif?.(d); }
        });
      } },
      { ad: 'Reset my stat points', kalsin: true, fn: async () => {
        const u = await rpc('reset_ucret_bilgi'); if (!u) return;
        hud.soru?.('Stat reset', `Your stats will return to your race's starting values and the points you distributed will be given back.\nYou must not have any items equipped.\nFee (level ${u.level}): ${noah(u.restat)} Noah`, async () => {
          const d = await rpc('stat_reset'); if (!d) return; npcMenuMetin(d.mesaj); hud.info?.(d.mesaj, d.ok === false ? 'hata' : 'beceri');
          if (d.ok === false) { hud.notice?.(d.mesaj, 'hata'); return; }
          dispatchEvent(new CustomEvent('ko-stat-sifirlandi'));
          state?.combat?.odulUygula?.(d.stats); state?.inv?.stats?.(); state?.inv?.reload?.();
        });
      } },
      { ad: 'Reset fees', kalsin: true, fn: async () => {
        const u = await rpc('reset_ucret_bilgi'); if (!u) return;
        npcMenuMetin(`At level ${u.level}, a skill reset costs ${noah(u.reskill)} Noah and a stat reset costs ${noah(u.restat)} Noah. The fee rises with your level. You must take off all your equipment to reset your stats.`);
      } },
      { ad: 'My skill information', kalsin: true, fn: async () => {
        const d = await rpc('skill_info'); if (!d) return;
        npcMenuMetin(`Class: ${SINIF[d.sinif] || d.sinif}. Total skill points: ${d.toplam}, undistributed: ${d.serbest}. ${d.meslek ? 'You can distribute your points in the Skill window (K).' : 'After level 10 you can unlock your skills by changing your job.'}`);
      } },
      { ad: 'Back', fn: yeniden },
    ],
  });
  const yaz = (d) => { if (!d) return; npcMenuMetin(d.mesaj || ''); hud.info?.(d.mesaj || '', d.ok === false ? 'hata' : 'gorev'); if (d.gold != null) altinGuncelle(d.gold); else if (d.ok) state?.inv?.reload?.(); };
  const rpc2 = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); return null; } return data; };
  // Repurchase: son 72 saatte satılan / yok edilen eşyalar (9'ar sayfa); satıra tık → onay → geri al
  const geriAlim = async (sayfa = 0) => {
    const L = await rpc2('kaishan_geri_liste'); if (!L) return;
    const P = 9, parca = L.slice(sayfa * P, sayfa * P + P);
    const secenekler = parca.map((g) => ({ ad: `${g.name}${g.count > 1 ? ' x' + g.count : ''} — ${noah(g.fiyat)} Noah`, kalsin: true, fn: () => hud.soru?.('Repurchase', `Repurchase [${g.name}]${g.count > 1 ? ' x' + g.count : ''} for ${noah(g.fiyat)} Noah?`, async () => { yaz(await rpc2('kaishan_geri_al', { p_id: g.id })); geriAlim(sayfa); }) }));
    if (L.length > (sayfa + 1) * P) secenekler.push({ ad: 'Next page', kalsin: true, fn: () => geriAlim(sayfa + 1) });
    secenekler.push({ ad: sayfa > 0 ? 'Previous page' : 'Back', kalsin: true, fn: () => (sayfa > 0 ? geriAlim(sayfa - 1) : ana()) });
    npcMenuAc({ ad: '[Grand Merchant] Kaishan', model,
      metin: L.length ? 'You can buy back items you sold or destroyed within the last 72 hours. Which item do you want back?' : 'There are no items you sold or destroyed within the last 72 hours.', secenekler });
  };
  const ana = () => npcMenuAc({
    ad: '[Grand Merchant] Kaishan', model,
    metin: 'What mission do you want?',
    secenekler: [
      { ad: 'Redistributions', fn: dagitim },
      { ad: 'Explanation of Nation Transfer', kalsin: true, fn: bilgi('Nation Transfer System|- Buy the Exile Application Form at the Power-up store and bring it to me: I will change it to the Nation Transfer Certificate.|- When transferring, you must withdraw from your clan. A clan leader who is alone in the clan can use Clan Recovery to take the clan along.|- After the transfer, choose your new race and appearance on the character screen.') },
      { ad: 'Submission of the Exile Application Form', kalsin: true, fn: async () => yaz(await rpc2('kaishan_surgun')) },
      { ad: 'Clan Recovery', kalsin: true, fn: async () => yaz(await rpc2('kaishan_klan_kurtarma')) },
      { ad: 'Transferring Nation', kalsin: true, fn: () => hud.soru?.('Transferring Nation', 'Do you really want to transfer your nation? Your Nation Transfer Certificate will be used and you will return to the character screen.', async () => {
        const d = await rpc2('kaishan_ulus_degistir'); yaz(d);
        if (d?.ok) setTimeout(() => { try { sessionStorage.setItem('ko-secime-don', '1'); } catch {} (hud.oyundanCik || ((u) => { location.href = u; }))('oyun.html'); }, 2500);
      }) },
      { ad: 'Repurchase Sold or Destroyed items', kalsin: true, fn: () => geriAlim(0) },
      { ad: 'Chick Graduation', kalsin: true, fn: async () => yaz(await rpc2('kaishan_chick')) },
      { ad: 'Rebirth Stat Redistribution', kalsin: true, fn: async () => yaz(await rpc2('kaishan_reb_stat')) },
      { ad: 'The Submit Clan Nation Point Certificate', kalsin: true, fn: async () => yaz(await rpc2('kaishan_klan_sertifika')) },
      { ad: "Kaishan's trust", kalsin: true, fn: async () => {
        const d = await rpc2('kaishan_guven', { p_takas: false }); if (!d) return; npcMenuMetin(d.mesaj);
        if ((d.sayi || 0) >= 10) hud.soru?.("Kaishan's trust", 'Exchange 10 Tokens that represent Kaishan\'s Trust for a Trade Certificate Exchange Coupon?', async () => yaz(await rpc2('kaishan_guven', { p_takas: true })));
      } },
    ],
  });
  return ana;
}

// KO 2. meslek (usta) NPC'leri — her sınıfın kendi ustası (deadsoft Quest_guide 408-411, Kurian 781/784):
// [Warrior Master] Skaki (14201 / 24201) savaşçı · [Secret Agent] Clarence (14202 / 24202) rogue · [Archmage] Drake (14203 / 24203) büyücü
// [Priest] Minerva (14204 / 24204) rahip · [Elder] Atlas (25017) / MorBor (25003) Kurian.
// 60. seviye + Unstable Kentaraus' Heart (Centaur) + sınıfa göre iki Captain özü. "Gerekenler" penceresi: eşya ikonları, düşüren mobların
// portreleri, şans, bölge ve koordinat.
export const USTA_NPC = new Set([14201, 14202, 14203, 14204, 24201, 24202, 24203, 24204, 25017, 25003]);
const escU = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let ustaWin = null;
async function ustaGerekenler({ sb, b, ad }) {
  const [{ iconHtml, fromDb, loadMeta, tooltipHtml }, { koWindow, toFront }] = await Promise.all([import('./esya.js'), import('./ko-pencere.js')]);
  const hideModel = () => {};
  await loadMeta().catch(() => null);
  const nums = (b.malzeme || []).map((m) => m.num);
  const { data } = await sb.from('items').select('*').in('num', nums);
  const IT = new Map((data || []).map((r) => [r.num, fromDb(r)]));
  if (!ustaWin) {
    ustaWin = document.createElement('div'); ustaWin.id = 'usta-gerek'; ustaWin.className = 'ko-panel ko-pencere';
    ustaWin.innerHTML = '<div class="ay-baslik">Master Requirements</div><div class="ug-govde"></div>';
    document.body.append(ustaWin);
    const k = document.createElement('button'); k.className = 'ko-kapat'; k.title = 'Close'; k.onclick = () => { ustaWin.hidden = true; hideModel(); }; ustaWin.append(k);
    ustaWin.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); toFront(ustaWin); });
    ustaWin.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ustaWin.hidden = true; hideModel(); } });
  }
  const sinif = b.npc_sinif_adi ? `${b.npc_sinif_adi}` : 'Your class';
  const govde = ustaWin.querySelector('.ug-govde');
  govde.innerHTML = `<div class="ug-ust"><b>${escU(ad)}</b><span>2nd job change (master) for ${escU(sinif)}</span></div>
    <div class="ug-kosul${b.level >= 60 ? ' tamam' : ''}"><i>${b.level >= 60 ? '✔' : '✘'}</i> Level 60 or higher <small>(you are level ${b.level})</small></div>
    ${(b.malzeme || []).map((m) => `<div class="ug-esya${m.var ? ' tamam' : ''}">
      <div class="ug-esya-bas" data-num="${m.num}">${IT.get(m.num) ? iconHtml(IT.get(m.num), 38) : ''}<div><b>${escU(m.ad)}</b><span>${m.var ? '✔ In inventory' : '✘ Not in inventory'}</span></div></div>
      <div class="ug-kaynaklar ug-sade">${[...new Set((m.kaynak || []).map((k) => k.ad))].map((n) => `<span class="ug-mobad">${escU(n)}</span>`).join('') || '<span class="ug-yok">No monster drops this item.</span>'}</div></div>`).join('')}`;
  // eşya ipucu
  govde.querySelectorAll('.ug-esya-bas').forEach((e) => { const it = IT.get(Number(e.dataset.num)); if (it) e.title = it.strName; });
  ustaWin.hidden = false; koWindow(ustaWin); toFront(ustaWin); ustaWin.style.zIndex = Math.max(Number(ustaWin.style.zIndex) || 0, 70);
}
export function ustaMenu({ sb, character, hud, state, onSinif, npc, ad = 'Master', model = null }) {
  const rpc = async (fn) => {
    const { data, error } = await sb.rpc(fn, { p_char: character.id, p_npc: Number(npc) });
    if (error) { hud.notice?.(error.message, 'hata'); return null; }
    return data;
  };
  const ozet = (b) => {
    if (!b) return '';
    if (!b.uygun) return `I am the master of the ${b.npc_sinif_adi} class only. To become a master, you must go to the master NPC of your own class.`;
    if (b.durum === 'usta') return 'You are already a master. You can train your master skills in the Skill window (K).';
    if (b.durum === 'acemi') return 'First you must change your job with Kaishan at level 10. To become a master, you must reach level 60.';
    const eks = (b.malzeme || []).filter((m) => !m.var).length;
    return `To become a master, you must be at least level 60 and bring me ${(b.malzeme || []).length} items${eks ? ` (${eks} missing)` : ' (all in your inventory)'}. See "Requirements" for details and where the items drop.`;
  };
  const ana = async () => {
    const b = await rpc('usta_npc_bilgi');
    const sec = [];
    if (b?.uygun && b.durum !== 'usta') sec.push({ ad: 'Become a master (2nd job change)', kalsin: true, fn: async () => {
      const d = await rpc('usta_npc_ol'); if (!d) return;
      hud.notice?.(d.mesaj || '', d.ok ? 'seviye' : 'hata');   // tek aksiyon mesajı
      if (d.ok) { npcMenuMetin(d.mesaj || ''); character.class = d.class; onSinif?.(d); state?.inv?.reload?.(); ustaWin && (ustaWin.hidden = true); }
    } });
    sec.push({ ad: 'Requirements', kalsin: true, fn: async () => { const g = await rpc('usta_npc_bilgi'); if (g) ustaGerekenler({ sb, b: g, ad }); } });
    // [Secret Agent] Clarence (rogue ustası 14202 / 24202): KO Magic Shield görevi
    if ([14202, 24202].includes(Number(npc))) {
      const ms = Number(character.class) === 8 ? await msRpc('bilgi').catch(() => null) : null;
      const ek = ms?.durum === 'aktif' ? (ms.sayac >= (ms.gerek || 7) ? '&nbsp;<span class="npm-tamam">(Complete)</span>' : '&nbsp;<span class="npm-devam">(In progress)</span>') : ms?.durum === 'bitti' ? '&nbsp;<span class="npm-gri">(Finished)</span>' : '';
      sec.push({ ad: 'Magic Shield', html: `<span class="npm-gorev">Magic Shield</span>${ek}`, kalsin: true, fn: () => magicShield() });
    }
    sec.push({ ad: 'Close', fn: () => npcMenuKapat() });
    npcMenuAc({ ad, model, metin: `Welcome, ${character.name}. Those who wish to become a true master must prove their strength.\n\n${ozet(b)}`, secenekler: sec });
  };
  // Magic Shield görevi (sunucu clarence_gorev): usta rogue, savaş bölgelerinde rakip ulustan 7 zafer → Magic Shield Scroll
  const msRpc = async (islem) => { const { data, error } = await sb.rpc('clarence_gorev', { p_char: character.id, p_npc: Number(npc), p_islem: islem }); if (error) { hud.notice?.(error.message, 'hata'); return null; } return data; };
  const MS_SCROLL = 379064000;
  // KO görev penceresi (re_quest_viewer): açıklama, "Toplanacaklar" (7 zafer) ve "Ödül" (Magic Shield Scroll) ikonlu kutular
  const msPencere = async (ek = '') => {
    const G = state?.gorev; if (!G?.ozelGoster) return false;
    const d = await msRpc('bilgi'); if (!d) return true;
    const gerek = d.gerek || 7, sayac = Math.min(gerek, d.sayac || 0);
    const top = [{ adet: gerek, bir: 'Win victories', iki: `Enemy nation ${d.durum === 'aktif' || d.durum === 'bitti' ? `${sayac}/${gerek}` : `0/${gerek}`}`, tamam: d.durum === 'bitti' || (d.durum === 'aktif' && sayac >= gerek) }];
    const odul = [[MS_SCROLL, 1]];
    let metin, dug;
    const geri = () => { G.kapat?.(); ana(); };
    if (d.durum === 'uygun_degil') { metin = d.mesaj || 'Magic Shield is a skill that only master rogues can learn.'; dug = [['Close', geri]]; }
    else if (d.durum === 'aktif') {
      metin = `For me to make the Scroll of Magic Shield, you must prove your ability at the National Combat.\nWin ${gerek} victories against the enemy nation in the war zones (Ardream, Ronark Land…).\n\nVictories: ${sayac} / ${gerek}`;
      dug = d.sayac >= gerek ? [['Complete', async () => {
        const r = await msRpc('teslim'); if (!r) return;
        if (!r.ok) { hud.notice?.(r.mesaj, 'hata'); return msPencere(r.mesaj); }
        state?.inv?.reload?.(); hud.notice?.('Magic Shield completed! Magic Shield Scroll', 'exp'); hud.info?.('Quest reward: Magic Shield Scroll', 'gorev');
        msPencere('You have moved me with your drive. Here is the Magic Shield Scroll. Please don`t lose that rogue`s passion of yours.');
      }], ['Close', geri]] : [['Close', geri], ['Give up', () => hud.soru?.('Give up quest', 'Do you want to give up the "Magic Shield" quest? Your victory count will be reset.', async () => {
        const r = await msRpc('birak'); if (!r) return;
        if (!r.ok) return hud.notice?.(r.mesaj, 'hata');
        hud.info?.('Quest abandoned: Magic Shield', 'gorev'); msPencere();
      })]];
      metin = 'Quest in progress.\n\n' + metin;
    } else if (d.durum === 'bitti') { metin = d.var ? 'You already have the Magic Shield Scroll. Please don`t lose that rogue`s passion of yours.' : 'You have completed this quest.'; dug = [['Close', geri]]; }
    else {
      metin = `For me to make the Scroll of Magic Shield, you must prove your ability at the National Combat. And that can also prove whether you are qualified to use the Magic Shield.\n\nWin ${gerek} victories against the enemy nation in the war zones and come back to me, and I will make the Scroll of Magic Shield for you. (Master rogue, level 61 or higher)`;
      dug = [['Accept', async () => {
        const r = await msRpc('kabul'); if (!r) return;
        if (!r.ok) { hud.notice?.(r.mesaj, 'hata'); return msPencere(r.mesaj); }
        hud.notice?.('Quest accepted: Magic Shield', 'gorev'); hud.info?.(`Quest accepted: Magic Shield — win ${gerek} victories in the war zones.`, 'gorev'); G.kapat?.();
      }], ['Close', geri]];
    }
    return G.ozelGoster({ ad: 'Magic Shield', metin: (ek ? ek + '\n\n' : '') + metin, top, odul, dugmeler: dug, model, npc: Number(npc) });
  };
  const magicShield = async (ek = '') => {
    if (await msPencere(ek)) return;
    const d = await msRpc('bilgi'); if (!d) return;
    const sec = [];
    let metin;
    if (d.durum === 'uygun_degil') metin = d.mesaj || 'Magic Shield is a skill that only master rogues can learn.';
    else if (d.durum === 'aktif') {
      metin = `For me to make the Scroll of Magic Shield, you must prove your ability at the National Combat.\nWin seven victories against the enemy nation in the war zones (Ardream, Ronark Land…).\n\nVictories: ${d.sayac} / ${d.gerek}`;
      if (d.sayac >= d.gerek) sec.push({ ad: 'I have won seven victories.', kalsin: true, fn: async () => {
        const r = await msRpc('teslim'); if (!r) return;
        if (!r.ok) { hud.notice?.(r.mesaj, 'hata'); return magicShield(r.mesaj); }
        state?.inv?.reload?.(); hud.info?.('You\'ve received the Magic Shield Scroll item.', 'seviye');
        magicShield('You have moved me with your drive. Here is the Magic Shield Scroll. Please don`t lose that rogue`s passion of yours.');
      } });
    } else if (d.durum === 'bitti' && d.var) metin = 'You already have the Magic Shield Scroll. Please don`t lose that rogue`s passion of yours.';
    else {
      metin = 'For me to make the Scroll of Magic Shield, you must prove your ability at the National Combat. And that can also prove whether you are qualified to use the Magic Shield.\n\nWin seven victories against the enemy nation in the war zones and come back to me, and I will make the Scroll of Magic Shield for you. (Master rogue, level 61 or higher)';
      sec.push({ ad: 'I accept the quest.', kalsin: true, fn: async () => {
        const r = await msRpc('kabul'); if (!r) return;
        if (!r.ok) { hud.notice?.(r.mesaj, 'hata'); return magicShield(r.mesaj); }
        hud.info?.('Quest accepted: win 7 victories in the war zones.', 'beceri'); magicShield('I`ll be waiting.');
      } });
    }
    sec.push({ ad: 'Back', kalsin: true, fn: () => ana() });
    npcMenuAc({ ad, model, metin: (ek ? ek + '\n\n' : '') + metin, secenekler: sec });
  };
  return ana;
}
