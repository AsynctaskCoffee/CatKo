// KO klan pelerinleri (Knight Clerk 11610 / 21610): kısa pelerin (Knight 3+, ilk alım 75.000.000 Noah, sonra Cloak.tbl fiyatı),
// uzun pelerin (Royal Knight, ücretsiz), renk + desen (Cloak.tbl: 0-9 renk, P01-P09 = desen P), klan sembolü pelerinin sırtında.
// Model: Item\cloak_<0 kısa|1 uzun><ırk>.n3cplug + .n3mesh (tools/convert/pelerin.js → assets/pelerin), sırt eklemine (13, Kurian 44) bağlı.
// Diğer oyuncular: presence meta 'pel' {k: klan, n: pelerin no, u: uzun, v: sembol sürümü}.
import * as THREE from '../vendor/three.module.min.js';
import { koWindow, toFront } from './ko-pencere.js';

const BASE = './assets/pelerin';
let META = null;
const metaYukle = () => (META ||= Promise.all([fetch(`${BASE}/pelerin.json`).then((r) => r.json()), fetch(`${BASE}/pelerin.bin`).then((r) => r.arrayBuffer())])
  .then(([m, b]) => ({ m, b })).catch(() => null));
const resimler = new Map();
const resim = (src) => {
  if (!resimler.has(src)) resimler.set(src, new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }));
  return resimler.get(src);
};
const p2 = (n) => String(n).padStart(2, '0');
export const desenOf = (no) => Math.floor((Number(no) || 0) / 100);
export const renkOf = (no) => (Number(no) || 0) % 100;
/** KO Cloak.tbl türü → model: 0 kısa (cloak_0<ırk>), 1 uzun (cloak_1<ırk>), 2 özel (cloak_2<ırk>: kral 97–99, yılbaşı 95–96, kale 65–80) */
export const pelerinModel = (no, uzun) => { const r = renkOf(no); if (r >= 95 || (r >= 65 && r <= 80)) return 2; if ((r >= 10 && r <= 18) || (r >= 29 && r <= 33) || (r >= 40 && r <= 48) || (r >= 60 && r <= 64)) return 1; return uzun ? 1 : 0; };

/** pelerin dokusu (128×128): renk + desen çerçevesi + klan sembolü (sırtın ortası) */
export const boyanir = (no) => { const r = renkOf(no); return (r >= 29 && r <= 33) || (r >= 60 && r <= 80); };   // KO: klan rengiyle (R,G,B) boyanan pelerinler
export const rgbHex = (v) => '#' + (Number(v) >>> 0 & 0xffffff).toString(16).padStart(6, '0');
// (7.11) sembol: 32 px KO sembolü keskin (yumuşatmasız), büyük (logo) sembol yumuşak küçültülür
export async function pelerinTuval(no, sembol, boyut = 128, rgb = null) {
  const cv = document.createElement('canvas'); cv.width = cv.height = boyut;
  const g = cv.getContext('2d');
  // KO Cloak.tbl: doku cloak_c_<no % 100> (renk / desenli uzun / Imperial / kale / kral / yılbaşı; yırtık kenarlılar alfa), çerçeve cloak_m_<no / 100> (1–16)
  const r = (await resim(`${BASE}/cloak_c_${p2(renkOf(no))}.webp`)) || (await resim(`${BASE}/cloak_c_00.webp`)); if (r) g.drawImage(r, 0, 0, boyut, boyut); else { g.fillStyle = '#555'; g.fillRect(0, 0, boyut, boyut); }
  // KO: pelerin rengi (D3D malzeme rengi × doku) — gri desenli dokular klanın seçtiği renge boyanır, doku alfası (yırtık kenar) korunur
  if (rgb != null && r && boyanir(no) && (Number(rgb) & 0xffffff) !== 0xffffff) {
    g.globalCompositeOperation = 'multiply'; g.fillStyle = rgbHex(rgb); g.fillRect(0, 0, boyut, boyut);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(r, 0, 0, boyut, boyut); g.globalCompositeOperation = 'source-over';
  }
  // kral pelerinleri tek renk: kırmızı pelerindeki mavi süsler kırmızıya (98), mavi pelerindeki kırmızı süsler maviye (97) — R ↔ B takası
  if (r && (renkOf(no) === 97 || renkOf(no) === 98)) {
    const id = g.getImageData(0, 0, boyut, boyut), a = id.data, kirmiziya = renkOf(no) === 98;
    for (let i = 0; i < a.length; i += 4) { const R = a[i], B = a[i + 2]; if (kirmiziya ? B > R + 30 && B > 70 : R > B + 50 && R > 120 && a[i + 1] < 110) { a[i] = B; a[i + 2] = R; } }
    g.putImageData(id, 0, 0);
  }
  const d = desenOf(no); if (d >= 1 && d <= 16) { const m = await resim(`${BASE}/cloak_m_${p2(d)}.webp`); if (m) { g.globalCompositeOperation = 'source-atop'; g.drawImage(m, 0, 0, boyut, boyut); g.globalCompositeOperation = 'source-over'; } }
  if (sembol) { const s = await resim(sembol); if (s) { const w = boyut * 0.34; g.imageSmoothingEnabled = (s.naturalWidth || s.width) > 32; g.drawImage(s, (boyut - w) / 2, boyut * 0.24, w, w); } }
  return cv;
}

const IRK = new Set([1, 2, 3, 4, 6, 11, 12, 13, 14]);
const bilgiCache = new Map();
/** klanın pelerin/sembol bilgisi (diğer oyuncular için) */
export const klanSembol = async (sb, kid, v) => (await klanBilgi(sb, kid, v || 0))?.sembol || null;   // (5.11) sohbet oyuncu listesi klan sütunu
async function klanBilgi(sb, kid, v) {
  const key = kid + ':' + v;
  if (!bilgiCache.has(key)) bilgiCache.set(key, sb.rpc('klan_pelerin_bilgi', { p_klan: kid }).then(({ data }) => data || null, () => null));
  return bilgiCache.get(key);
}

// KO klan derece kolluğu (Item\\clanaddon_<ırk>_<derece>.n3cplug; derece 1 en yüksek … 5) — assets/kolluk (tools/convert/klan-kolluk.js).
// Karus 001-004, El Morad 011-013; Kurian ırklarının kolluğu yok (KO 2369'da da yok).
let KOLLUK = null;
const kollukMeta = () => (KOLLUK ||= import('./character.js').then((C) => C.ekPlugYukle('./assets/kolluk').then(() => C)).catch(() => { KOLLUK = null; return null; }));
export async function kollukUygula(api, race, g) {
  if (!api?.setPlug) return;
  const r = Number(race), d = Number(g);
  const ad = d >= 1 && d <= 5 && [1, 2, 3, 4, 11, 12, 13].includes(r) ? `clanaddon_${String(r).padStart(3, '0')}_${d}` : null;   // KO: dosya numarası = derece (1 en yüksek)
  if (api._kollukAd === ad) return;
  api._kollukAd = ad; api.setPlug('kolluk', null);
  const D = await import('./donanim.js').catch(() => null);
  D?.kollukParilti?.(api, null);
  if (!ad) return;
  const C = await kollukMeta(); if (!C || api._kollukAd !== ad) return;
  const p = await C.createPlug(ad).catch(() => null); if (!p || api._kollukAd !== ad) return;
  // KO: kolluk ön kolda (eklem 10) — plug ofseti eli kaplıyordu: bileğe (ön kolun el tarafı ucu) oturacak kadar dirseğe doğru çekilir
  const m = [...p.info.m]; m[12] *= 0.76; m[13] *= 0.74; m[14] *= 0.76;   // (31.10) bilekten çok hafif yukarı
  api.setPlug('kolluk', p.obj, p.info.joint, m);
  if (api.fxOk !== false) D?.kollukParilti?.(api, p.obj, d);   // derece 1-3: kolluğun arkasında KO klan ışıltısı
}

/** api: karakter (createCharacter), pel: {k, n, u, v, s?, g?} ya da null → pelerini kaldır (g: klan derecesi → kolluk) */
export async function pelerinUygula(sb, api, race, pel) {
  if (!api) return;
  if (!pel || pel.g !== undefined) kollukUygula(api, race, pel?.g).catch(() => {});
  const imza = pel && pel.n != null ? `${pel.k}:${pel.n}:${pel.u ? 1 : 0}:${pel.v || 0}:${race}:${pel.r ?? ''}` : null;
  if (api._pelerinImza === imza) return;
  api._pelerinImza = imza;
  api._pelerinOff?.(); api._pelerinOff = null; api.setPlug('pelerin', null);
  if (!imza) return;
  const M = await metaYukle(); if (!M || api._pelerinImza !== imza) return;
  const r = IRK.has(Number(race)) ? Number(race) : 1;
  const md = M.m.modeller[`cloak_${pelerinModel(pel.n, pel.u)}${p2(r)}`] || M.m.modeller[`cloak_${pel.u ? 1 : 0}${p2(r)}`] || M.m.modeller['cloak_001']; if (!md) return;
  let sembol = pel.s || null;
  if (!sembol && pel.k && pel.v) sembol = (await klanBilgi(sb, pel.k, pel.v))?.sembol || null;
  const tuval = await pelerinTuval(pel.n, sembol, 128, pel.r ?? null);
  if (api._pelerinImza !== imza) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M.b, md.pos, md.vc * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(M.b, md.nrm, md.vc * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(M.b, md.uv, md.vc * 2), 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(M.b, md.idx, md.ic), 1));
  const tex = new THREE.CanvasTexture(tuval); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: 0.5 }));   // yırtık pelerin kenarları (doku alfası)
  mesh.frustumCulled = false;
  const tut = new THREE.Group(), salla = new THREE.Group(); salla.add(mesh); tut.add(salla); tut.name = 'pelerin';
  api.setPlug('pelerin', tut, md.joint, md.m);
  // koşarken / yürürken pelerin geriye savrulur ve dalgalanır
  let aci = 0, t = Math.random() * 10;
  const off = api.addExtra?.((dt) => {
    dt = dt || 1 / 60; t += dt;
    const c = api.clip || '', kos = /run/.test(c) ? 1 : /walk/.test(c) ? 0.55 : 0;
    aci += ((kos ? 0.42 * kos : 0.04) - aci) * Math.min(1, dt * 3);
    salla.rotation.x = aci + Math.sin(t * (kos ? 9 : 1.6)) * (kos ? 0.05 : 0.015);
  });
  api._pelerinOff = () => { off?.(); geo.dispose(); mesh.material.dispose(); tex.dispose(); };
}

/** KO re_knightsmantleshop area_char: oyuncunun ırkında karakter + seçili pelerin, döndürülebilir 3B önizleme */
export async function pelerinOnizleme(el, race, gor = {}) {
  const { createCharacter } = await import('./character.js');
  const W = Math.round(el.clientWidth || 165), H = Math.round(el.clientHeight || 195);
  const rnd = new THREE.WebGLRenderer({ antialias: true, alpha: true }); rnd.outputColorSpace = THREE.SRGBColorSpace; rnd.setClearColor(0, 0); rnd.setPixelRatio(Math.min(2, devicePixelRatio || 1)); rnd.setSize(W, H);
  rnd.domElement.className = 'kk-3b'; el.replaceChildren(rnd.domElement);
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, W / H, 0.05, 50);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x3a3428, 1.7)); const g = new THREE.DirectionalLight(0xffffff, 0.8); g.position.set(1, 2, 2); sc.add(g);
  const api = await createCharacter(race, { face: gor.face ?? 0, hair: gor.hair ?? 0 }).catch((e) => { console.warn('pelerin önizleme karakter', e); return null; });
  if (api) { api.fxOk = false; try { if (gor.gear && gor.donanim) await Promise.resolve(gor.gearReady).then(() => gor.donanim.applyGear(api, race, gor.gear)); } catch (e) { console.warn('pelerin önizleme donanım', e); } }
  const kok = new THREE.Group(); sc.add(kok);
  if (api) { api.group.scale.z = -1; kok.add(api.group); }
  cam.position.set(0, 1.05, 4.1); cam.lookAt(0, 0.92, 0);
  let aci = 0, hedef = 0, bitti = false, son = performance.now();   // KO: önizleme sırttan başlar (pelerin + sembol görünür)
  const sbSahte = { rpc: async () => ({ data: null }) };
  const tik = () => { if (bitti || (!rnd.domElement.isConnected && performance.now() - son > 500)) { if (!bitti) { bitti = true; api?._pelerinOff?.(); rnd.dispose(); } return; } const t = performance.now(), dt = Math.min(0.05, (t - son) / 1000); son = t;
    aci += (hedef - aci) * Math.min(1, dt * 8); kok.rotation.y = aci;
    if (kamH) { const k = Math.min(1, dt * 8); cam.position.lerp(kamHedef, k); bak.lerp(bakHedef, k); cam.lookAt(bak); }
    try { api?.update?.(dt); if (!sigdi && api) sigdir(); rnd.render(sc, cam); } catch (e) { if (!hataYaz) { hataYaz = true; console.warn('pelerin önizleme çizim', e); } }
    requestAnimationFrame(tik); };
  let sigdi = false, hataYaz = false; const kutu = new THREE.Box3();
  // (7.11) büyüteç: yakın planda kamera pelerinin ortasına (gövdenin üst yarısı) yaklaşır; geçiş yumuşak
  let yakin = false, kamH = null; const kamHedef = new THREE.Vector3(), bakHedef = new THREE.Vector3(), bak = new THREE.Vector3();
  const sigdir = () => { kutu.setFromObject(api.group, true); if (kutu.isEmpty()) return; const h = kutu.max.y - kutu.min.y; if (!(h > 0.2)) return; kamH = { min: kutu.min.y, h }; konumla(true); sigdi = true; };
  const konumla = (anlik = false) => { if (!kamH) return; const { min, h } = kamH, cy = yakin ? min + h * 0.66 : min + h * 0.5, uz = yakin ? h * 0.95 : h * 2.15;
    kamHedef.set(0, cy, uz); bakHedef.set(0, cy, 0); if (anlik) { cam.position.copy(kamHedef); bak.copy(bakHedef); cam.lookAt(bak); } };
  tik();
  return {
    async guncelle(no, uzun, sembol, rgb = null) { if (api) await pelerinUygula(sbSahte, api, race, { k: 0, n: no, u: uzun ? 1 : 0, v: 0, s: sembol || null, r: rgb }); },
    dondur(d) { hedef += d * Math.PI / 4; },
    yakinlas() { yakin = !yakin; konumla(); return yakin; },
    kapat() { bitti = true; api?._pelerinOff?.(); rnd.dispose(); rnd.forceContextLoss?.(); rnd.domElement.remove(); },
  };
}

// ---------------- Knight Clerk: pelerin dükkânı ve sembol düzenleme (KO temalı pencereler)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const fmtE = (n) => Number(n || 0).toLocaleString('en-US');
let W = null;
function pencere(id, baslik, govde) {
  W?.remove();
  W = document.createElement('div'); W.id = id; W.className = 'ko-panel ko-pencere ko-pelerin';
  W.innerHTML = `<div class="ay-baslik">${esc(baslik)}</div><button class="ko-kapat" title="Kapat"></button>${govde}`;
  (document.getElementById('kohud') || document.body).append(W);
  W.style.pointerEvents = 'auto';
  koWindow(W); toFront(W); W.style.zIndex = 4300;
  const kapat = () => { W?.remove(); W = null; removeEventListener('keydown', esc_, true); };
  const esc_ = (e) => { if (e.key === 'Escape') { e.stopPropagation(); kapat(); } };
  addEventListener('keydown', esc_, true);
  W.querySelector('.ko-kapat').onclick = kapat;
  W.addEventListener('pointerdown', (e) => e.stopPropagation());
  W.addEventListener('keydown', (e) => e.stopPropagation());
  return { el: W, kapat };
}

/** pelerin seçimi: klan: klan_bilgi().klan, seviye: _klan_seviye, lider: bool */
export async function pelerinDukkan({ sb, character, hud, klan, lider, yenile, gorunum }) {
  const { data: liste } = await sb.from('pelerin_tbl').select('*').order('no');
  const sv = klan.seviye || {};
  // KO (deadsoft KNIGHTS_CAPE2369): kısa pelerin Knight III (≤80M) / II (≤110M) / I (üstü) — Noah; uzun pelerin Accredited / Royal — Clan Point
  const kisaIzin = (p) => sv.tur !== 'mavi' || (sv.derece <= 3 && (p.fiyat <= 80000000 || sv.derece <= 2) && (p.fiyat <= 110000000 || sv.derece <= 1));
  const kisaGerek = (p) => (p.fiyat > 110000000 ? 'Knight I' : p.fiyat > 80000000 ? 'Knight II' : 'Knight III');
  const kisaOlur = sv.tur !== 'mavi' || sv.derece <= 3, uzunOlur = sv.tur === 'akredite' || sv.tur === 'royal';
  // KO Cloak.tbl: uzun pelerin CP = cp / 36 (36 NP = 1 CP), bayrak = gereken klan sınıfı (3 Accredited 5 … 7 Accredited 1, 8 Royal 5 … 12 Royal 1)
  const uzunCP = (p) => (Number(p.cp) > 0 ? Math.ceil(Number(p.cp) / 36) : 1000);
  const bayrak = sv.tur === 'royal' ? 13 - sv.derece : sv.tur === 'akredite' ? 8 - sv.derece : klan.caitharos ? 2 : 1;
  const SINIF_AD = (b) => (b >= 8 ? `Royal Knight ${['V', 'IV', 'III', 'II', 'I'][b - 8]}` : b >= 3 ? `Accredited Knight ${['V', 'IV', 'III', 'II', 'I'][b - 3]}` : 'Knight');
  let secili = klan.pelerin ?? (liste?.[0]?.no ?? 0), uzun = klan.pelerin_tur === 'uzun' && uzunOlur;
  const bilgi = (await sb.rpc('klan_pelerin_bilgi', { p_klan: klan.id })).data || {};
  // (7.11) KO re_knightsmantleshop + re_palette — tüm Cloak.tbl pelerinleri (NTTGame KnightOnlineEn\Data\Cloak.tbl): kısa (Noah), uzun (Clan CONT),
  //   kale pelerinleri 65–80 (300M Noah + 150,000 Clan CONT, Royal Knight 5, 30 gün), yılbaşı pelerinleri 95 (Karus) / 96 (El Morad), kral pelerinleri (satılmaz)
  try {
    const K = await import('./klan-ko.js');
    const SINIF = (b) => (b >= 8 ? `Royal Knight ${13 - b}` : b >= 3 ? `Accredited Knight ${8 - b}` : b === 2 ? 'Knight' : '');
    const ulus = Number(klan.ulus ?? character.nation);
    const kosul = (p) => {
      const tip = Number(p?.tip), renk = Number(p?.renk), cp = Number(p?.cp) > 0 ? Math.ceil(Number(p.cp) / 36) : 0;
      const derece = tip === 1 ? `Knight ${Number(p.derece) || 3}` : SINIF(Number(p?.bayrak || 0));
      let neden = '';
      if (!lider) neden = 'Only the clan leader or an assistant leader can change the cape.';
      else if (tip === 3 && renk >= 97) neden = 'This cape cannot be purchased.';
      else if (tip === 3 && (renk === 95 || renk === 96)) { if ((renk === 95 ? 1 : 2) !== ulus) neden = 'This cape is for the other nation.'; }
      else if (tip === 3) { if (bayrak < Number(p.bayrak)) neden = `Your clan must be at least ${derece}.`; else if (cp > Number(klan.fon || 0)) neden = 'Not enough Clan Points in the clan fund.'; }
      else if (!klan.caitharos) neden = 'Complete the Caitharos quest first. ([Knight Clerk])';
      else if (tip === 2) { if (bayrak < Number(p.bayrak || 3)) neden = `Your clan must be at least ${derece}.`; else if (cp > Number(klan.fon || 0)) neden = 'Not enough Clan Points in the clan fund.'; }
      else if (!kisaIzin(p)) neden = `Your clan must be at least ${kisaGerek(p)}.`;
      return { uzun: tip === 2, cp, neden, derece: tip === 3 && renk >= 95 ? '' : derece };
    };
    const satinAl = (p, u, rgb = null) => new Promise((ok) => {
      const ayni = Number(p.no) === Number(klan.pelerin) && klan.pelerin_alindi, cp = kosul(p).cp;
      const boyaVar = rgb != null && rgb !== (ayni ? Number(klan.pelerin_rgb ?? 0xffffff) : 0xffffff);
      const satir = [Number(p.fiyat) > 0 && !ayni ? `${fmtE(p.fiyat)} Noah` : '', cp && !ayni ? `${fmtE(cp)} Clan Points` : '', boyaVar ? 'Paint: 1,000 Clan Points' : ''].filter(Boolean).join('\n');
      hud.soru?.('Cape', ayni ? (boyaVar ? `Paint your clan cape?\nPaint costs 1,000 clan points.` : 'This is already your clan cape.') : `Would you like to purchase this cape?${satir ? '\n' + satir : ''}`, async () => {
        if (ayni && !boyaVar) return ok(false);
        const { data, error } = await sb.rpc('klan_pelerin_al', { p_char: character.id, p_no: p.no, p_uzun: u, p_rgb: rgb });
        if (error) { hud.notice?.(error.message, 'hata'); return ok(false); }
        hud.info?.(ayni ? 'The cape has been painted.' : "You've purchased a cape.", 'seviye');
        klan.pelerin = data.pelerin; klan.pelerin_rgb = data.rgb ?? null; klan.pelerin_tur = data.tur; klan.pelerin_alindi = true; if (data.fon != null) klan.fon = data.fon;
        await yenile?.(data); ok(true);
      }, null, ['Confirm', 'Cancel']);
    });
    if (await K.pelerinDukkanKO({ liste: liste || [], klan, lider, sembol: bilgi.sembol, pelerinTuval, satinAl, kosul, onizleme: (el) => pelerinOnizleme(el, Number(character.race) || 1, gorunum || { face: character.face, hair: character.hair }), uzunMu: uzunOlur, hud })) return;
  } catch (e) { console.warn('KO pelerin dükkânı', e); }
  const P = pencere('ko-pelerin', 'Klan Pelerini', `
    <div class="pl-govde">
      <div class="pl-sol"><div class="pl-liste"></div></div>
      <div class="pl-sag">
        <canvas class="pl-onizle" width="128" height="128"></canvas>
        <div class="pl-ad"></div>
        <div class="pl-tur"><label><input type="radio" name="pl-tur" value="kisa"> Kısa pelerin</label><label><input type="radio" name="pl-tur" value="uzun"> Uzun pelerin</label></div>
        <div class="pl-fiyat"></div>
        <div class="pl-durum"></div>
        <button class="ay-dugme pl-al">Pelerini al</button>
      </div>
    </div>
    <p class="pl-not">Kısa pelerin (Noah): Knight III'ten itibaren; pahalı renkler Knight II / I ister.
      Uzun pelerin (Clan Point): Accredited Knight düz renk 1.000 CP, desenli 5.000–24.000 CP; Royal Knight dalgalı düz renk 10.000 CP, desenli 30.000–80.000 CP.
      Pelerini lider ya da yardımcı lider değiştirir; tüm üyeler giyer. Sembol pelerinin sırtında görünür.</p>`);
  const el = P.el;
  const L = el.querySelector('.pl-liste');
  L.innerHTML = (liste || []).map((p) => `<div class="pl-satir" data-no="${p.no}"><i class="pl-renk pl-r${p.renk}"></i>${esc(p.ad)}<b>${p.no === 0 ? '' : fmt(p.fiyat)}</b></div>`).join('');
  const ciz = async () => {
    for (const s of L.querySelectorAll('.pl-satir')) s.classList.toggle('secili', Number(s.dataset.no) === Number(secili));
    const p = (liste || []).find((x) => x.no === Number(secili));
    el.querySelector('.pl-ad').textContent = p ? p.ad : '';
    for (const r of el.querySelectorAll('[name=pl-tur]')) { r.checked = (r.value === 'uzun') === uzun; r.disabled = r.value === 'uzun' ? !uzunOlur : !kisaOlur; }
    el.querySelector('.pl-fiyat').innerHTML = !p ? '' : uzun ? `Bedel: <b>${fmt(uzunCP(p))}</b> Clan Point <span class="pl-gri">(${fmt(uzunCP(p) * 36)} NP · fonda ${fmt(klan.fon)} CP)</span>` : `Fiyat: <b>${fmt(p.fiyat)}</b> Noah <span class="pl-gri">(${kisaGerek(p)}+)</span>`;
    const neden = !lider ? 'Pelerini yalnız klan lideri ya da yardımcı lider değiştirebilir.' : uzun ? (uzunOlur ? (p && uzunCP(p) > Number(klan.fon || 0) ? 'Klan fonunda yeterli Clan Point yok.' : '') : 'Uzun pelerin için klan Accredited ya da Royal Knight olmalı.') : (sv.tur === 'mavi' && !klan.caitharos ? 'Kısa pelerin için önce Caitharos görevini tamamlamalısın ([Knight Clerk]).' : p && !kisaIzin(p) ? `Bu kısa pelerin için klan en az ${kisaGerek(p)} olmalı.` : '');
    el.querySelector('.pl-durum').textContent = neden || (klan.pelerin === Number(secili) && (klan.pelerin_tur === 'uzun') === uzun ? 'Klanın şu an bu pelerini giyiyor.' : '');
    el.querySelector('.pl-al').disabled = !!neden;
    const cv = await pelerinTuval(secili, bilgi.sembol, 128);
    const hedef = el.querySelector('.pl-onizle'); const g = hedef.getContext('2d'); g.clearRect(0, 0, 128, 128); g.drawImage(cv, 0, 0);
  };
  L.addEventListener('click', (e) => { const s = e.target.closest('.pl-satir'); if (s) { secili = Number(s.dataset.no); ciz(); } });
  for (const r of el.querySelectorAll('[name=pl-tur]')) r.addEventListener('change', () => { uzun = r.value === 'uzun' && r.checked; ciz(); });
  el.querySelector('.pl-al').onclick = () => {
    const p = (liste || []).find((x) => x.no === Number(secili)); if (!p) return;
    const bedel = uzun ? `${fmt(uzunCP(p))} Clan Points will be spent from the clan fund.` : `Cost: ${fmt(p.fiyat)} Noah.`;
    hud.soru?.('Clan Cape', `${uzun ? 'Long' : 'Short'} cape: ${p.ad}\n${bedel}\nIs this OK?`, async () => {
      const { data, error } = await sb.rpc('klan_pelerin_al', { p_char: character.id, p_no: p.no, p_uzun: uzun });
      if (error) { hud.notice?.(error.message, 'hata'); return; }
      hud.info?.(`You've purchased a cape: ${data.ad} (${data.tur === 'uzun' ? 'long' : 'short'})${data.fiyat ? ` — paid ${fmt(data.fiyat)} Noah` : ''}${data.cp ? ` — spent ${fmt(data.cp)} CP` : ''}.`, 'seviye');
      klan.pelerin = data.pelerin; klan.pelerin_rgb = data.rgb ?? null; klan.pelerin_tur = data.tur; klan.pelerin_alindi = true; if (data.fon != null) klan.fon = data.fon;
      await yenile?.(data); ciz();
    });
  };
  ciz();
}

/** klan sembolü: resim yükle (32×32'ye küçültülür) ya da 16×16 piksel çizim */
export async function sembolEditor({ sb, character, hud, klan, yenile }) {
  const bilgi = (await sb.rpc('klan_pelerin_bilgi', { p_klan: klan.id })).data || {};
  const N = 32;
  const P = pencere('ko-sembol', 'Klan Sembolü', `
    <div class="sb-govde">
      <div class="sb-izgara"></div>
      <div class="sb-sag">
        <canvas class="sb-onizle" width="64" height="64"></canvas>
        <div class="sb-renkler"></div>
        <label class="ay-dugme sb-yukle">Resim yükle<input type="file" accept="image/*" hidden></label>
        <button class="ay-dugme sb-temizle">Temizle</button>
        <button class="ay-dugme sb-kaydet">Kaydet</button>
      </div>
    </div>
    <p class="pl-not">32×32 sembolü renk seçip karelere tıklayarak çiz ya da bir resim (.bmp / .tga / .png) yükle. Klan en az Knight III olmalı; kayıt 5.000.000 Noah. Sembol pelerinin sırtında görünür. Yalnız klan lideri kaydedebilir.</p>`);
  const el = P.el;
  const RENK = ['#000000', '#ffffff', '#c8c8c8', '#808080', '#ff2a2a', '#9a1010', '#ffd23a', '#ff8a1a', '#3adc4a', '#147a24', '#3aa8ff', '#1a3aa8', '#b04aff', '#ff6ad0', '#8a5a2a', '#00000000'];
  let renk = '#ffffff';
  const px = new Array(N * N).fill('#00000000');
  const IZ = el.querySelector('.sb-izgara');
  IZ.innerHTML = Array.from({ length: N * N }, (_, i) => `<i data-i="${i}"></i>`).join('');
  el.querySelector('.sb-renkler').innerHTML = RENK.map((r) => `<i data-r="${r}" style="background:${r === '#00000000' ? 'repeating-conic-gradient(#666 0 25%,#999 0 50%) 0 0/8px 8px' : r}" title="${r === '#00000000' ? 'Silgi' : r}"></i>`).join('');
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ciz = () => {
    const g = cv.getContext('2d'); g.clearRect(0, 0, N, N);
    px.forEach((c, i) => { IZ.children[i].style.background = c; if (c !== '#00000000') { g.fillStyle = c; g.fillRect(i % N, Math.floor(i / N), 1, 1); } });
    const o = el.querySelector('.sb-onizle').getContext('2d'); o.imageSmoothingEnabled = false; o.clearRect(0, 0, 64, 64); o.drawImage(cv, 0, 0, 64, 64);
    for (const r of el.querySelectorAll('.sb-renkler i')) r.classList.toggle('secili', r.dataset.r === renk);
  };
  // mevcut sembolü ızgaraya yükle
  if (bilgi.sembol) { const im = await resim(bilgi.sembol); if (im) { const t = document.createElement('canvas'); t.width = t.height = N; const g = t.getContext('2d'); g.drawImage(im, 0, 0, N, N); const d = g.getImageData(0, 0, N, N).data; for (let i = 0; i < N * N; i++) px[i] = d[i * 4 + 3] < 40 ? '#00000000' : `rgb(${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]})`; } }
  let basili = false;
  const boya = (e) => { const c = e.target.closest('.sb-izgara i'); if (!c) return; px[Number(c.dataset.i)] = renk; ciz(); };
  IZ.addEventListener('pointerdown', (e) => { basili = true; boya(e); });
  IZ.addEventListener('pointerover', (e) => { if (basili) boya(e); });
  addEventListener('pointerup', () => (basili = false));
  el.querySelector('.sb-renkler').addEventListener('click', (e) => { const r = e.target.closest('i'); if (r) { renk = r.dataset.r; ciz(); } });
  el.querySelector('.sb-temizle').onclick = () => { px.fill('#00000000'); ciz(); };
  el.querySelector('.sb-yukle input').onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const url = URL.createObjectURL(f); const im = await resim(url); URL.revokeObjectURL(url); if (!im) return hud.notice?.('The image could not be read.', 'hata');
    const t = document.createElement('canvas'); t.width = t.height = N; const g = t.getContext('2d'); g.drawImage(im, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data; for (let i = 0; i < N * N; i++) px[i] = d[i * 4 + 3] < 40 ? '#00000000' : `rgb(${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]})`;
    ciz();
  };
  el.querySelector('.sb-kaydet').onclick = async () => {
    const bos = px.every((c) => c === '#00000000');
    const t = document.createElement('canvas'); t.width = t.height = 32; const g = t.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(cv, 0, 0, 32, 32);
    const { data, error } = await sb.rpc('klan_sembol_kaydet', { p_char: character.id, p_veri: bos ? null : t.toDataURL('image/png') });
    if (error) { hud.notice?.(error.message, 'hata'); return; }
    hud.info?.(bos ? 'The clan symbol has been removed.' : 'Successfully registered the symbol. (5,000,000 Noah)', 'seviye');
    klan.sembol_v = data.v; await yenile?.(data); P.kapat();
  };
  ciz();
}
