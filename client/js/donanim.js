// Kuşanılan eşyaları karakter modelinde gösterir: silah/kalkan elde (CN3CPlug), zırh parçaları gövdede (ırka göre CN3CPart).
// Kaynak adı: Item_Org dwIDResrc → "A_BBBB_CC_D" (silah), zırhta CC = ırk, D = parça yeri (1 üst, 2 alt, 4 eldiven, 5 çizme, 6 kask).
import * as THREE from '../vendor/three.module.min.js';
import { fxParlak, fxYuzey, fxEkle } from './fx.js';
import { loadGearMeta, gearMeta, createPlug, createGearPart, loadKanatMeta, kanatFor, silahFor, createKanat, retargetPart } from './character.js';

let KAYNAK = null, EFEKT = {}, UZAK = '', ORG_FX = {};
export async function loadDonanim(remoteBase) {
  UZAK = remoteBase || '';
  if (FXM && UZAK) fxEkle(`${UZAK}/fxperi`).catch(() => {});
  const [k] = await Promise.all([
    fetch('./assets/esya/kaynak.json').then((r) => r.json()).catch(() => ({})),
    fetch('./assets/esya/kaynak-ext.json').then((r) => r.json()).then((e) => (KEXT = e)).catch(() => ({})),
    fetch('./assets/esya/efekt.json').then((r) => r.json()).then((e) => (EFEKT = e)).catch(() => ({})),
    fetch('./assets/esya/org-efekt.json').then((r) => r.json()).then((e) => (ORG_FX = e)).catch(() => ({})),
    loadGearMeta(`${remoteBase}/esya`).catch(() => null),
    loadKanatMeta(`${remoteBase}/esya`).catch(() => null),
  ]);
  KAYNAK = k; return !!gearMeta();
}
const fn = (id, cc, d) => `${Math.floor(id / 1e7)}_${String(Math.floor(id / 1e3) % 1e4).padStart(4, '0')}_${String(cc ?? Math.floor(id / 10) % 100).padStart(2, '0')}_${d ?? id % 10}`;
const KURIAN = new Set([6, 14]);
// ırk → eklem (UPC_DefaultLooks: sağ el, sol el, sol kol/kalkan)
const joints = (race) => ({ rh: KURIAN.has(race) ? 23 : 12, lh: 7, lh2: 5, re: KURIAN.has(race) ? 21 : 10 });
// görünüm yerleri: kostüm (42-48) aynı yerdeki zırhın önüne geçer. P = eski adlandırmadaki parça yeri
// kostüm iki parçadır: kask (42) + kask hariç tam set (43: üst, alt, eldiven, çizme; kaynak kodunun CC'si parçaya göre değişir)
const LOOK = [
  { key: 'ust', src: [[43], [4]], P: 1, hide: ['upper'] },
  { key: 'alt', src: [[44], [43, 20], [10]], P: 2, hide: ['lower'] },
  { key: 'eldiven', src: [[45], [43, 40], [12]], P: 4, hide: ['hands', 'hand'] },
  { key: 'cizme', src: [[46], [43, 50], [13]], P: 5, hide: ['feet'] },
  { key: 'kask', src: [[42], [1]], P: 6, hide: ['hair*'] },
  { key: 'kanat', src: [[47]], P: 0, hide: [] },
  { key: 'peri', src: [[48]], P: 0, hide: [] },
];
// yakın ırk yedekleri (aynı ulus/iskelet)
const KOST_ALT = { 1: [2, 3, 4], 2: [1, 3, 4], 3: [2, 1, 4], 4: [2, 3, 1], 6: [1, 2, 3], 11: [12, 13], 12: [11, 13], 13: [12, 11], 14: [12, 11] };
// özel kostüm kaynakları: balkabağı maskeleri ırksız tek parça (5_0822_30_0)
const KOST_PLUG = { 50822000: '5_0822_90_0' };
const KOST_OZEL = { 22000300: '5_0822_30_0', 22200300: '5_0822_30_0' };
const RACE_ALT = { 1: [2, 3], 2: [1, 3], 3: [2, 1], 4: [13, 2], 6: [1, 2], 11: [12], 12: [11], 13: [4, 12], 14: [12, 11] };
const p2 = (n) => String(n).padStart(2, '0');
// kask geometrisi normaller boyunca d metre dışa itilir (kopya geometri; özgün paylaşılan geometri bozulmaz)
function kaskSisir(m, d) {
  const g = m?.geometry; if (!g || g.userData?.sisik || !g.attributes?.normal) return;
  const y = g.clone(); const P = y.attributes.position, N = y.attributes.normal;
  for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) + N.getX(i) * d, P.getY(i) + N.getY(i) * d, P.getZ(i) + N.getZ(i) * d);
  P.needsUpdate = true; y.computeBoundingSphere(); y.userData = { ...(y.userData || {}), sisik: true }; m.geometry = y;
}
let PREFIX = null;
const PART_IRK = new Map();   // parça adı → derildiği ırk
/** dwIDResrc → ırka uygun parça adı. Yeni adlandırma: A_[BB][ırk]_CC_D (ör. 2_4513_10_0); eski: A_BBBB_[ırk]_P */
function partName(id, race, P, ccOver) {
  const G = gearMeta(); if (!G) return null;
  const A = Math.floor(id / 1e7), B = Math.floor(id / 1e3) % 1e4, CC = p2(ccOver ?? Math.floor(id / 10) % 100), D = id % 10, B4 = String(B).padStart(4, '0');
  // kostümlerde yedek ırk aynı ulustan (Karus kostümü El Morad modeline düşmez); parça iskelete uyarlanır
  const races = [race, ...((A === 5 ? KOST_ALT : RACE_ALT)[race] || [])];
  const ozel = KOST_OZEL[id]; if (ozel) { if (G.parts[ozel]) { PART_IRK.set(ozel, null); return ozel; } return null; }
  const c = [], irk = [];   // irk: adaydaki parçanın derilendiği ırk (başka ırksa iskelete uyarlanır)
  const ekle = (n, r) => { c.push(n); irk.push(r); };
  // kostümler: kaynak B'nin son iki hanesi seti belirtir (Gryphon 0847 → 5_47<ırk>); set 00 ise ilk iki hane (Valkyrie 0800 → 5_08<ırk>)
  // KO 2369 istemcisi (Item\\%.2d_%.1d_%.4d_%.2d_%.1d): Gryphon (0847) parçaları 47_5_08<47+ırk>_CC_D (ırk 1→0848 … 13→0860)
  if (A === 5 && B === 847) for (const r of races) ekle(`47_5_08${p2(47 + r)}_${CC}_${D}`, r);
  if (A === 5 && B % 100) for (const r of races) ekle(`${A}_${p2(B % 100)}${p2(r)}_${CC}_${D}`, r);
  // kostüm seti B%100 ise başka sete (ör. Valkyrie/Bahamut 08) düşmez: modeli yoksa kostüm görünmez, zırh görünür (Transparent Minerva, maskeler)
  if (!(A === 5 && B % 100)) for (const r of races) ekle(`${A}_${p2(Math.floor(B / 100))}${p2(r)}_${CC}_${D}`, r);
  // KO 2369 yeni setleri (Item\\XX_A_BBRR_CC_D, RR = XX + ırk): Holy Knight 2_3151 → 51_2_31<51+ırk>, Rosetta 5_2151 → 51_5_21<51+ırk>
  if (B % 100) for (const r of races) ekle(`${p2(B % 100)}_${A}_${p2(Math.floor(B / 100))}${p2(B % 100 + r)}_${CC}_${D}`, r);
  ekle(`${A}_${B4}_${CC}_${D}`, null);
  if (P) for (const r of races) ekle(`${A}_${B4}_${p2(r)}_${P}`, r);
  const hi = c.findIndex((n) => G.parts[n]); if (hi >= 0) { PART_IRK.set(c[hi], irk[hi]); return c[hi]; }
  // son çare: aynı kaynağın herhangi bir parçası (ör. kanatlar: 9_0045_50_0)
  if (!PREFIX) { PREFIX = new Map(); for (const n of Object.keys(G.parts)) { const k = n.split('_').slice(0, 2).join('_'); if (!PREFIX.has(k)) PREFIX.set(k, []); PREFIX.get(k).push(n); } }
  const onek = A === 5 && B % 100 ? races.map((r) => `${A}_${p2(B % 100)}${p2(r)}`) : [`${A}_${p2(Math.floor(B / 100))}${p2(race)}`, `${A}_${B4}`];   // kostüm seti başka setin parçasına düşmesin
  for (const k of onek) { const l = PREFIX.get(k); if (l?.length) { const m = l.find((n) => n.split('_')[2] === CC && (A !== 5 || n.split('_')[3] === String(D))); if (m || (ccOver == null && A !== 5)) { const sec = m || l[0]; PART_IRK.set(sec, Number(sec.split('_')[1].slice(2)) || null); return sec; } } }
  return null;
}

/** eşya kataloğu (kaynak.json + esya meta) yüklendi mi — canavar silahları (mob-silah.js) bunu bekler */
export const donanimHazir = () => !!KAYNAK && !!gearMeta();
/** dwIDResrc → silah modeli (plug) adı; yoksa null */
export const plugAdi = (id) => { const G = gearMeta(); if (!G || !id) return null; const n = `${Math.floor(id / 1e7)}_${String(Math.floor(id / 1e3) % 1e4).padStart(4, '0')}_${p2(Math.floor(id / 10) % 100)}_${id % 10}`; return G.plugs[n] ? n : null; };
/** equip: [{slot, org, el}] → [yuva, kaynak, element] (ağ için); element: 1 ateş, 2 buz, 3 yıldırım, 4 zehir */
// kaynak.json: org → [dwIDResrc, byExtIndex]; efekt.json: Item_Ext_<ext> satırı (num - org) → efekt kimliği (dwEffectID)
export function gearCodes(equip) {
  return equip.map((e) => {
    // KO Item_Ext_N: unik / özel satırların kendi dwIDResrc'si var (Gigantic Axe, Scorpion Shield, Chitin Bow…) → num bazlı model önce
    const k = KAYNAK?.[e.org]; const res = Number(e.res) || Number(KEXT?.[e.num]) || (Array.isArray(k) ? k[0] : k || 0), ext = Array.isArray(k) ? k[1] : null;   // e.res: GM özel eşyası (items.model_res)
    let fx = !e.sonuk && ext != null && e.num && e.org ? EFEKT[ext]?.[e.num - e.org] || 0 : 0;
    // (6.11) özgün reverse (ItemType 11) silahlar: Item_Ext'teki genel element efekti (12031 hançer zehri…) yerine silahın kendi Item_Org efekti (Raptor → 12070 uniq_poison)
    if (Number(e.reb) > 0 && !e.sonuk && ORG_FX[e.org]) fx = ORG_FX[e.org];
    // (3.11) KO Item_Org'un kendi efekti (eşsiz silahlar: Raptor → 12070 uniq_poison + 12071 uniq_poisonp, Deep Scar → uniq_ice …):
    // eşyanın Item_Ext efekti yoksa orijinal tablodaki efekt kimliği (org-efekt.json, Item_Org sütun 25 / 1000)
    if (!fx && !e.sonuk && ORG_FX[e.org]) fx = ORG_FX[e.org];
    // (3.11) rebirth (reb) silahlar: Item_Ext'te kendi efekti yok → aynı silahın elementli (+40…) satırının KO efekti (ör. Raptor → zehir 12031)
    if (!fx && Number(e.reb) > 0 && ext != null && EFEKT[ext]) for (let k = 40; k < 100; k++) { const v = EFEKT[ext][k]; if (v) { fx = v; break; } }   // sonuk: eşsiz silah +6 altı (Scorpion Bow +3 altı) parlamaz
    // GM özel eşyası: efekt null = otomatik (element), 0 = yok, 1-4 element parıltısı, diğer = KO eşya efekti (fx kimliği)
    const ef = e.efekt == null ? null : Number(e.efekt);
    if (ef != null) return [e.slot, res, ef >= 1 && ef <= 4 ? ef : 0, ef > 4 ? ef : 0, Number(e.org) || 0, Number(e.reb) || 0, Number(e.toz) || 0];
    return [e.slot, res, e.el || 0, fx, Number(e.org) || 0, Number(e.reb) || 0, Number(e.toz) || 0];
  }).filter((e) => e[1] || [47, 48, 50, 51, 91, 92].includes(Number(e[0])));   // peri / pathos / tılsım / amblem: modeli olmasa da görünür efekti var
}
let FXM = null, KEXT = null;
// Pathos eldiveni (Attack/Defense Aurora): sınıfa göre renk — saldırı koyu, savunma açık ton (KO rehberi)
export const PATHOS = {
  502: { ad: 'Savaşçı', tur: 'saldiri', renk: 0xc80a0a }, 503: { ad: 'Rogue', tur: 'saldiri', renk: 0x0a9a24 },
  504: { ad: 'Büyücü', tur: 'saldiri', renk: 0xc414a8 }, 505: { ad: 'Rahip', tur: 'saldiri', renk: 0x1438f0 },
  511: { ad: 'Savaşçı', tur: 'savunma', renk: 0xff7a7a }, 512: { ad: 'Rogue', tur: 'savunma', renk: 0x8cff8c },
  513: { ad: 'Büyücü', tur: 'savunma', renk: 0xff9ae8 }, 514: { ad: 'Rahip', tur: 'savunma', renk: 0x8cb8ff },
};
export const pathosOf = (org) => { let c = Math.floor((Number(org) || 0) / 1e6); if (c >= 800) c -= 300; return PATHOS[c] || null; };
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// her el ayrı: yuva 50 sol el, 51 sağ el — eldiven hangi eldeyse küre o elde
// KO görünümü (oyun içi görüntüye göre): her elde kameraya dönük, bulutsu/dumanlı yumuşak kenarlı büyük bir ışıma diski
// (dolu, parlak merkez + daha saydam dış hale, iç içe yavaşça zıt yönlere döner) ve eli/zırhı sınıf rengine boyayan nokta ışık.
let PATHOS_TEX = null;
function pathosDoku() {
  if (PATHOS_TEX) return PATHOS_TEX;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N);
  // değer gürültüsü (fbm) → duman deseni
  const G = 32, rnd = new Float32Array((G + 1) * (G + 1)); let sd = 1337; for (let i = 0; i < rnd.length; i++) { sd = (sd * 16807) % 2147483647; rnd[i] = sd / 2147483647; }
  const v = (x, y) => { x = ((x % G) + G) % G; y = ((y % G) + G) % G; const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), r = (a, b) => rnd[(b % G) * (G + 1) + (a % G)];
    return (r(xi, yi) * (1 - sx) + r(xi + 1, yi) * sx) * (1 - sy) + (r(xi, yi + 1) * (1 - sx) + r(xi + 1, yi + 1) * sx) * sy; };
  const fbm = (x, y) => v(x, y) * 0.5 + v(x * 2, y * 2) * 0.25 + v(x * 4, y * 4) * 0.15 + v(x * 8, y * 8) * 0.1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x - N / 2) / (N / 2), dy = (y - N / 2) / (N / 2), r = Math.hypot(dx, dy), aci = Math.atan2(dy, dx);
    const n = fbm(x / N * 6 + Math.cos(aci) * 1.5, y / N * 6 + Math.sin(aci) * 1.5);
    const kenar = 0.78 + (n - 0.5) * 0.45;                         // dumanlı, düzensiz dış kenar
    let a = Math.max(0, 1 - Math.pow(r / kenar, 2.2));
    a *= 0.55 + 0.75 * n;                                            // bulut dokusu
    a *= 1 - 0.35 * Math.exp(-Math.pow((r - 0.5) / 0.08, 2)) * (n > 0.5 ? 1 : 0.4);   // içte daha koyu halka izleri
    const cek = Math.exp(-Math.pow(r / 0.22, 2));                   // parlak merkez
    const i4 = (y * N + x) * 4, k = Math.min(1, a + cek * 0.6);
    im.data[i4] = im.data[i4 + 1] = im.data[i4 + 2] = Math.round(255 * Math.min(1, 0.55 + 0.45 * n + cek * 0.5));
    im.data[i4 + 3] = Math.round(255 * Math.min(1, k));
  }
  g.putImageData(im, 0, 0);
  PATHOS_TEX = new THREE.CanvasTexture(c); PATHOS_TEX.colorSpace = THREE.SRGBColorSpace;
  return PATHOS_TEX;
}
const gorunurMu = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
function pathosKure(renk) {
  const g = new THREE.Group(), c = new THREE.Color(renk);
  const parlak = c.clone().lerp(new THREE.Color(0xffffee), 0.35);   // KO'da merkez beyaza/sarıya kayar
  const sp = (col, op, s, ek = true) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: pathosDoku(), color: col, transparent: true, opacity: op, blending: ek ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, fog: false })); m.scale.setScalar(s); m.frustumCulled = false; g.add(m); return m; };
  const dis = sp(c, 0.68, 0.644, false), hale = sp(c, 0.4, 0.672), ic = sp(parlak, 0.64, 0.347), cek = sp(parlak.clone().lerp(new THREE.Color(0xffffff), 0.3), 0.44, 0.123);   // boyut ve opaklık: kullanıcı ayarı (%30, sonra %20 küçük; %20 daha saydam)
  dis.renderOrder = 11; hale.renderOrder = 11; ic.renderOrder = 12; cek.renderOrder = 13;
  g.userData.nabiz = (t) => { dis.material.rotation = t * 0.45; hale.material.rotation = -t * 0.3 + 2.1; ic.material.rotation = -t * 0.8 + 1.3; const k = 1 + Math.sin(t * 2.6) * 0.05; dis.scale.setScalar(0.644 * k); ic.material.opacity = 0.62 + Math.sin(t * 4.1) * 0.06; };
  g.userData.renk = c;
  g.userData.birak = () => { for (const m of [dis, hale, ic, cek]) m.material.dispose(); };
  PATHOS_KURE.add(g);
  return g;
}
// ── Pathos bekçisi (saniyede bir): sahibinin şu anki donanımında Pathos eldiveni yoksa (api._pathosAktif false) ya da sahibi artık
// sahnede değilse, hangi yoldan kalmış olursa olsun tüm pathos efektleri ve ışıma küreleri kaldırılır — eldiven çıkınca elde efekt kalamaz.
const PATHOS_KURE = new Set();
const sahnedeMi = (o) => { let x = o; while (x?.parent) x = x.parent; return !!x?.isScene; };
setInterval(() => {
  for (const g of PATHOS_KURE) {
    const sahip = g.userData.sahip;
    if (!g.parent || (sahip && (!sahip._pathosAktif || sahip._silindi))) { g.userData.birak?.(); g.removeFromParent(); PATHOS_KURE.delete(g); }
  }
  for (const m of FXM_HEPSI) for (const b of m.list || []) {
    if (!PATHOS_FX_ADI.test(b.key || '') && !b._pathosSahip) continue;
    const s2 = b._pathosSahip;
    if (!s2 || !s2._pathosAktif || s2._silindi || !sahnedeMi(s2.group) || (b._pathosFxm && b._pathosFxm !== m)) { b.dispose(); m.list.delete(b); }
  }
}, 1000);
// KO Pathos eldiveni: Item_Org dxt 5086000N (N = 0..7: saldırı savaşçı/rogue/büyücü/rahip, savunma aynı sıra) →
// Chr\5_0860_00_N_1.n3fxplug (sağ el, eklem 12; Kurian _1_1 → eklem 23) ve _N_2 (sol el, eklem 7); her plug 3 KO efekti (döngü).
const PATHOS_FXB = (v, el) => {
  const renk = ['red', 'green', 'violet'][v];
  if (v <= 2) return ['70413_meny_' + renk + '_attack.fxb', ...(el === 1 ? ['meny_07_', 'meny_08_'] : ['meny_08_', 'meny_09_']).map((x) => x + renk + '_object.fxb')];
  if (v === 3) return ['70413_meny_blue_attack.fxb', '20070402_mine_attack_fx08_o.fxb', el === 1 ? '20070402_mine_attack_fx07_o.fxb' : '20070402_mine_attack_fx09_o.fxb'];
  return ['70302_new_myne_all' + ['', 'g', 'v', 'x'][v - 4] + '.fxb', '70302_new_myne_allplus.fxb', el === 1 ? '70302_new_myne_allplusss.fxb' : '70302_new_myne_allpluss.fxb'];
};
const PATHOS_FX_ADI = /^(70413_meny_|meny_0[789]_|20070402_mine_attack_fx0|70302_new_myne_all)/i;
const pathosVaryant = (org) => { let c = Math.floor((Number(org) || 0) / 1e6); if (c >= 800) c -= 300; return c >= 502 && c <= 505 ? c - 502 : c >= 511 && c <= 514 ? c - 507 : -1; };
let PATHOS_FX_HAZIR = false;
function pathosGlow(api, orgs, J) {
  const eller = [['pathosL', J.lh, orgs[0], 2], ['pathosR', J.rh, orgs[1], 1]];
  const ok = api.fxOk !== false;
  const key = ok ? eller.map((e) => pathosVaryant(e[2])).join(':') : null;
  const yok = eller.every((e) => pathosVaryant(e[2]) < 0);
  api._pathosAktif = ok && !yok;   // bekçi bunu okur: false iken bu karaktere ait hiçbir pathos efekti / ışıması yaşayamaz
  if (api._pathosKey === key && !yok && (key || !api._pathos?.length)) return;
  if (yok) for (const m of FXM_HEPSI) for (const b of m.list || []) if (PATHOS_FX_ADI.test(b.key || '') && (!b._pathosSahip || b._pathosSahip === api)) { b.dispose(); m.list.delete(b); }   // eldiven yok: bu karaktere kalmış pathos efekti olamaz
  if (yok && api._pathosKey === key && !api._pathos?.length && !api.plugObj?.('pathosR') && !api.plugObj?.('pathosL')) return;
  api._pathosKey = key;
  for (const b of api._pathos || []) b.dispose(); api._pathos = [];
  // güvenlik ağı: bu karaktere etiketli tüm pathos efektleri (eski kurulumlardan, başka yöneticide kalmış olsa da) silinir
  for (const m of FXM_HEPSI) for (const b of m.list || []) if (b._pathosSahip === api) { b.dispose(); m.list.delete(b); }
  // ikinci güvenlik ağı: sahibi belirsiz ya da artık pathos eldiveni takmayan bir karaktere ait tüm pathos efektleri (adından) silinir
  for (const m of FXM_HEPSI) for (const b of m.list || []) if (PATHOS_FX_ADI.test(b.key || '') && (!b._pathosSahip || b._pathosSahip === api || !b._pathosSahip._pathos?.length)) { b.dispose(); m.list.delete(b); }
  api.setPlug('pathosR', null); api.setPlug('pathosL', null);
  { const art = []; api.group?.traverse?.((x) => { if (x.userData?.nabiz && x.userData?.birak) art.push(x); }); for (const x of art) { x.userData.birak(); x.removeFromParent(); } }   // artık yedek ışıma küresi
  if (!ok) return;
  const _w = new THREE.Vector3(), M0 = FXM;   // bu kurulumun efekt yöneticisi: seçim ekranındaki karakterin bekleyen efekti oyun sahnesine düşemez
  for (const [k, j, org, el] of eller) {
    const v = pathosVaryant(org); if (v < 0) continue;
    const o = new THREE.Object3D(); api.setPlug(k, o, j, IDENT);
    const kayit = { fx: [], yedek: null, bitti: false, off: null };
    // KO efektleri (uzak fxpathos paketi) gelene kadar renkli ışıma yedeği görünür
    const yedek = () => { const p = pathosOf(org); if (!p || kayit.yedek) return; const kure = pathosKure(p.renk); kure.userData.sahip = api; o.add(kure); let t = Math.random() * 6; kayit.yedek = kure; kayit.off = api.addExtra?.((dt) => { t += dt; kure.userData.nabiz(t); }); };
    const yedekKaldir = () => { if (!kayit.yedek) return; kayit.off?.(); kayit.yedek.userData.birak(); kayit.yedek.removeFromParent(); kayit.yedek = null; };
    // bekçi: eldiven çıkarıldı / karakter kaldırıldı / plug söküldü / kayıt listeden düştüyse efekt kendini hemen kapatır
    // (hiçbir yol açıkta pathos efekti bırakamaz — eldiven çıkınca efektin elde kalması)
    let giris = null;
    const sahnede = () => { let x = api.group; while (x?.parent) x = x.parent; return !!x?.isScene; };
    const gecerli = () => !kayit.bitti && FXM === M0 && !api._silindi && !!o.parent && api._pathosKey === key && (!giris || api._pathos?.includes(giris)) && sahnede();
    const kapatBunu = () => { kayit.bitti = true; yedekKaldir(); for (const b of kayit.fx) b?.dispose?.(); kayit.fx = []; };
    const at = () => { if (!gecerli()) { kapatBunu(); return null; } o.updateWorldMatrix(true, false); _w.setFromMatrixPosition(o.matrixWorld); return new THREE.Vector3(_w.x, _w.y, -_w.z); };
    const yon = () => { if (!gecerli()) return null; o.updateWorldMatrix(true, false); _pm.copy(o.matrixWorld).premultiply(_SZ); if (_pm.determinant() < 0) _pm.multiply(_SZ); _pm.decompose(_pp, _pq, _ps); return _pq; };
    const liste = PATHOS_FXB(v, el); let n = 0;
    const dene = () => {
      if (kayit.bitti) return;
      if (giris && !gecerli()) return kapatBunu();
      if (!FXM || !PATHOS_FX_HAZIR || !liste.every((f) => FXM.var?.(f))) { if (n === 8) yedek(); n++; setTimeout(dene, n < 20 ? 250 : 1500); return; }
      if (!gecerli()) return kapatBunu();
      const deneme = liste.map((f) => FXM.play(f, { loop: true, boyut: 1, follow: at }));
      for (const b of deneme) if (b) { b._pathosSahip = api; b._pathosFxm = M0; }
      if (kayit.bitti || !gecerli()) { for (const b of deneme) b?.dispose?.(); kapatBunu(); return; }   // oynatırken geçersizleşti: hiçbiri sahnede kalmaz
      if (deneme.some((b) => !b)) { for (const b of deneme) b?.dispose?.(); n++; setTimeout(dene, 500); return; }   // çizilemedi: kısa süre sonra yeniden
      yedekKaldir();
      for (const b of deneme) { b.yon = () => { const q = yon(); b.boyut = (Math.abs(_ps.x) + Math.abs(_ps.y) + Math.abs(_ps.z)) / 3; return q; }; kayit.fx.push(b); }
    };
    dene();
    giris = { dispose() { kapatBunu(); }, set gizli(g) { for (const b of kayit.fx) if (b) b.gizli = g; if (kayit.yedek) kayit.yedek.visible = !g; } };
    api._pathos.push(giris);
  }
}
// KO peri (yuva 48): chrtypepartitem.tbl → chr\tinker_bell_2010_jojo_all22 (Driads, yeşil), _all333 (Oreads, mor), _all (Alsaydes, altın),
// tinker_bell_2018_jo_all44 (Nereids). Model (kendi iskeleti + uçuş animasyonu) göğüs eklemine bağlanır; n3fxplug: modelin 2. eklemine
// tinkerbal_2010_jojo_<renk>.fxb ışıltısı. Model paketi henüz yüklenmediyse yalnız KO ışıltı efekti sahibinin çevresinde döner.
// n3fxplug: [fxb, eklem] — Nereids (tinker_bell_2018_jo_all44.n3fxplug): kırmızı-mavi kanat a/b + ışıltı, üçü de 8. eklemde
// deadsoft 2369 efekt kanatları: org → [[fxb, karakter eklemi]] (Chr\fd_bon_fxwingsss_2015a.n3fxplug — Wings of Hellfire Dragon)
const FX_KANAT = { 810638000: [['fd_fxwing_2015_g001q.fxb', 2], ['fd_fxwing_2015_g002gg.fxb', 3], ['fd_fxwing_2015_pafllall.fxb', 3], ['fd_fxwing_2015_pafllall.fxb', 2]] };
const _w2 = new THREE.Vector3();
const PERI_FX = {
  700038000: [['tinkerbal_2010_jojo_green.fxb', 2]], 700039000: [['tinkerbal_2010_jojo_violet.fxb', 2]], 700042000: [['tinkerbal_2010_jojo_gold.fxb', 2]], 900386900: [['tinkerbal_2010_jojo_violet.fxb', 2]],
  700047000: [['tinker_2018_redblue_wing0a.fxb', 8], ['tinkerbal_2018_jojo_bq.fxb', 8], ['tinker_2018_redblue_wing0b.fxb', 8]],
};
const _pq = new THREE.Quaternion(), _pp = new THREE.Vector3(), _ps = new THREE.Vector3();
const _pm = new THREE.Matrix4(), _SZ = new THREE.Matrix4().makeScale(1, 1, -1);
let PERI_FX_HAZIR = false;
// Chr\*.n3fxplug (orijinal KO): model adı → [[fxb, modelin eklemi]] — tılsım, amblem, özel peri, kanat efektleri (assets/fxtaki)
let FXPLUG = null;
fetch('./assets/fxtaki/plug.json').then((r) => r.ok ? r.json() : null).then((j) => { FXPLUG = j; }).catch(() => {});
// KO tılsım (yuva 91, Item slot 113) / amblem (yuva 92, slot 114): chrtypepartitem.tbl → chr\<model>.n3chr (kendi iskeleti + breath
// animasyonu) karakterin 2. eklemine (göğüs) bağlanır; n3fxplug efektleri modelin kendi eklemlerinde, eklem yönüyle döner.
function modelFxTak(api, w, liste, onEk, durum) {
  const fxler = [];
  liste.forEach(([fx, j], i) => {
    const o = new THREE.Object3D(); w.setPlug(onEk + i, o, j, IDENT);
    const at = () => { o.updateWorldMatrix(true, false); _w2.setFromMatrixPosition(o.matrixWorld); return new THREE.Vector3(_w2.x, _w2.y, -_w2.z); };
    const yon = () => { o.updateWorldMatrix(true, false); _pm.copy(o.matrixWorld).premultiply(_SZ); if (_pm.determinant() < 0) _pm.multiply(_SZ); _pm.decompose(_pp, _pq, _ps); return _pq.clone(); };
    let n = 0;
    const dene = () => {
      if (durum.bitti) return;
      if (!FXM || !FXM.var?.(fx)) { n++; if (n < 120) setTimeout(dene, n < 20 ? 250 : 1000); return; }
      const b = FXM.play(fx, { loop: true, boyut: 1, follow: at }); if (!b) { n++; setTimeout(dene, 500); return; }
      b.yon = () => { const q = yon(); b.boyut = (Math.abs(_ps.x) + Math.abs(_ps.y) + Math.abs(_ps.z)) / 3; return q; };
      fxler.push(b);
    };
    dene();
  });
  return () => { durum.bitti = true; for (const b of fxler) b?.dispose?.(); };
}
function takiGorsel(api, ad, org, jobs) {
  org = Number(org) || 0; const kn = org ? kanatFor(org) : null;
  const key = kn ? kn[0] + ':' + kn[1] + (FXPLUG ? ':p' : '') : null;
  const g0 = api._gear.get(ad); if (g0 === key) return;
  api._gear.set(ad, key);
  api._taki?.[ad]?.(); if (api._taki) api._taki[ad] = null;
  api.setPlug(ad, null);
  if (!kn) return;
  jobs.push(createKanat(kn[0]).then((w) => {
    if (!w || api._gear.get(ad) !== key) return;
    const g = new THREE.Group(); g.add(w.group);
    api.setPlug(ad, g, kn[1] >= 0 ? kn[1] : 2, IDENT);
    const durum = { bitti: false };
    const off = api.addExtra((dt) => { w.setClip('breath'); w.update(dt); });
    const fxOff = api.fxOk !== false ? modelFxTak(api, w, FXPLUG?.[kn[0].toLowerCase()] || [], ad + 'Fx', durum) : () => { durum.bitti = true; };
    (api._taki ||= {})[ad] = () => { off?.(); fxOff(); };
  }).catch(() => {}));
}
function periGorsel(api, org) {
  org = Number(org) || 0; const kn0 = kanatFor(org); const fxList = PERI_FX[org] || (kn0 && FXPLUG?.[kn0[0].toLowerCase()]) || (kn0 ? [] : null);   // özel periler: orijinal n3fxplug
  const key = fxList ? String(org) + (kn0 ? ':m' : '') + (FXPLUG ? ':p' : '') : null;   // model meta sonradan yüklenirse yeniden kurulur
  if ((api._peri?.key || null) === key) return;
  if (api._peri) { api._peri.off?.(); for (const b of api._peri.fx) b?.dispose?.(); api.setPlug('periModel', null); api._peri.anchor?.removeFromParent(); api._peri = null; }
  if (!key) return;
  const st = { key, fx: [], off: null, anchor: null }; api._peri = st;
  const _w = new THREE.Vector3();
  const fxBaslat = (obj, fxAd, yonlu = false) => {   // KO efekti verilen nesnenin konumunu (yonlu: yönünü de) izler
    const at = () => { obj.updateWorldMatrix(true, false); _w.setFromMatrixPosition(obj.matrixWorld); return new THREE.Vector3(_w.x, _w.y, -_w.z); };
    // KO uzayına (z aynalı) çevrilmiş dünya dönüşü; model aynalı (ölçek z<0) olabilir → decompose x'i çevirir, z aynası ile düzeltilir
    // KO uzayındaki eklem dönüşü: R = Sz·M (model z-aynalıysa det<0) ya da Sz·M·Sz (aynasız)
    const yon = () => { obj.updateWorldMatrix(true, false); _pm.copy(obj.matrixWorld).premultiply(_SZ); if (_pm.determinant() < 0) _pm.multiply(_SZ); _pm.decompose(_pp, _pq, _ps); return _pq; };
    let n = 0;
    const dene = () => {
      if (api._peri !== st) return;
      // giriş: efekt kütüphanesi / peri efektleri yüklenene kadar bekler (sınırsız; peri çıkarılınca durur) — tak-çıkar gerekmez
      if (!FXM || !PERI_FX_HAZIR || !FXM.var?.(fxAd)) { n++; setTimeout(dene, n < 20 ? 250 : 1000); return; }
      const b = FXM.play(fxAd, { loop: true, boyut: yonlu ? 1 : 0.6, follow: at }); if (!b) return; st.fx.push(b);
      // eklemin dünya ölçeği efekt boyutu olur (peri modeli küçültülmüş olabilir)
      if (yonlu) b.yon = () => { const q = yon(); b.boyut = (Math.abs(_ps.x) + Math.abs(_ps.y) + Math.abs(_ps.z)) / 3; return q; };
    };
    dene();
  };
  const kn = kanatFor(org);
  if (kn) {
    createKanat(kn[0]).then((w) => {
      if (!w || api._peri !== st) return;
      const g = new THREE.Group(); g.add(w.group);
      api.setPlug('periModel', g, kn[1] >= 0 ? kn[1] : 2, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      st.off = api.addExtra((dt) => { w.setClip('breath'); w.update(dt); });
      // n3fxplug: her efekt kendi eklemine (Nereids kanatları eklemin yönüyle döner)
      fxList.forEach(([fx, j], i) => { const o = new THREE.Object3D(); w.setPlug('periFx' + i, o, j, IDENT); fxBaslat(o, fx, /wing/.test(fx)); });
    }).catch(() => {});
    return;
  }
  if (!fxList.length) return;
  const anchor = new THREE.Object3D(); api.group.add(anchor); st.anchor = anchor;
  let t = Math.random() * 10;
  st.off = api.addExtra((dt) => { t += dt; const a = t * 0.55; anchor.position.set(Math.cos(a) * 0.75, 1.62 + Math.sin(t * 2.1) * 0.07, Math.sin(a) * 0.75); });
  fxBaslat(anchor, fxList.find(([f]) => f.startsWith('tinkerbal'))?.[0] || fxList[0][0]);
}
let PERI_P = null;
// GM periler (GM Paneli → GM karakterim → "Periler"): oyundaki tüm perilerin (yuva 48 peri eşyaları) modelleri GM'in omuzları ve
// başı çevresinde doğal biçimde uçar: her biri kendi hızında yörünge + yukarı-aşağı süzülme + yana salınım, uçuş yönüne döner,
// uçuş animasyonu oynar ve KO ışıltı efektini (tinkerbal) arkasında bırakır. Diğer oyuncular da görür (presence 'gp').
export function gmPeriler(api, on) {
  if (!api || !!api._gmPeri === !!on) return;
  if (api._gmPeri) { api._gmPeri.dispose(); api._gmPeri = null; }
  if (!on) return;
  const st = { bitti: false, fx: [], gruplar: [], off: null };
  const orgs = Object.keys(PERI_FX).map(Number);
  const W = new THREE.Vector3();
  orgs.forEach((org, i) => {
    const g = new THREE.Group(); g.name = 'gmPeri' + i; api.group.add(g); st.gruplar.push(g);
    const p = { g, w: null, faz: i * (Math.PI * 2 / orgs.length) + Math.random() * 0.4, hiz: 0.55 + i * 0.09 * (i % 2 ? -1 : 1), r: 0.62 + (i % 3) * 0.1, y: 1.45 + (i % 2) * 0.28, yal: 0.6 + Math.random() * 0.5 };
    g.userData.p = p;
    const kn = kanatFor(org);
    if (kn) createKanat(kn[0]).then((w) => { if (st.bitti || !w) return; p.w = w; w.group.scale.multiplyScalar(0.85); g.add(w.group); }).catch(() => {});
    // ışıltı: perinin konumunu izleyen KO efekti (efekt kütüphanesi yüklenince)
    const fxAd = (PERI_FX[org].find(([f]) => f.startsWith('tinkerbal')) || PERI_FX[org][0])[0];
    let n = 0;
    const dene = () => {
      if (st.bitti) return;
      if (!FXM || !PERI_FX_HAZIR || !FXM.var?.(fxAd)) { if (n++ < 60) setTimeout(dene, n < 20 ? 300 : 1500); return; }
      const b = FXM.play(fxAd, { loop: true, boyut: 0.5, follow: () => { g.updateWorldMatrix(true, false); W.setFromMatrixPosition(g.matrixWorld); return new THREE.Vector3(W.x, W.y + 0.05, -W.z); } });
      if (b) st.fx.push(b);
    };
    dene();
  });
  let t = Math.random() * 20;
  st.off = api.addExtra((dt) => {
    t += dt;
    for (const g of st.gruplar) {
      const p = g.userData.p, a = p.faz + t * p.hiz;
      // yörünge (eliptik, omuz hizası) + süzülme + yana salınım (8 çizer gibi)
      const r = p.r + Math.sin(t * 0.8 + p.faz) * 0.12;
      const x = Math.cos(a) * r + Math.sin(t * 1.7 + p.faz * 2) * 0.08 * p.yal;
      const z = Math.sin(a) * r * 0.85;
      const y = p.y + Math.sin(t * 2.3 + p.faz) * 0.12 + Math.sin(t * 0.9 + p.faz) * 0.08;
      const ox = g.position.x, oz = g.position.z;
      g.position.set(x, y, z);
      const dx = x - ox, dz = z - oz; if (Math.abs(dx) + Math.abs(dz) > 1e-5) g.rotation.y = Math.atan2(dx, dz);
      g.rotation.z = Math.sin(t * 2.3 + p.faz) * 0.15;   // süzülürken hafif yatış
      if (p.w) { p.w.setClip?.('breath'); p.w.update?.(dt); }
    }
  });
  api._gmPeri = {
    dispose() { st.bitti = true; st.off?.(); for (const b of st.fx) b?.dispose?.(); for (const g of st.gruplar) g.removeFromParent(); st.fx = []; },
    set gizli(v) { for (const b of st.fx) if (b) b.gizli = v; for (const g of st.gruplar) g.visible = !v; },
  };
}
// KO: her ulusun ilk 3 klanının üyeleri parlayan bilezik takar (deadsoft fx.tbl 10041 = fx\\clan_rank_1.fxb, 6 kare altın ışıltı);
// iki bileğe (sol / sağ el eklemi) bağlı döngü efekti. on=false kaldırır.
let KLAN_FX_P = null;
// KO klan derece kolluğu parıltısı: derece 1-2 kollukları orijinalde ışıltılı (clan_fx_ka_1/2 — clan_0819 / clan_0613), derece 3 hafif.
// Kolluğun arkasında (kolluk nesnesine bağlı, kolun dışına doğru hafif geride) KO klan ışıltısı (fx.tbl 10041 clan_rank_1.fxb);
// boyut / yoğunluk dereceye göre: 1 → tam, 2 → %80, 3 → %60; 4-5 → yok. obj = null → kaldır.
export function kollukParilti(api, obj, derece) {
  // Parlayan klan kolluğu (derece 1-3): kolluğun arka yüzeyinin çok hafif önünde, kolluk boyunca halka şeklinde ışıltı.
  //  1) yüzey: dokunun parlak yerleri sarı-beyaz (toplamalı), kolluğun tüm boyunca;
  //  2) kabuk: aynı geometri normaller boyunca hafif dışarı itilmiş (yüzeyin önünde), kenarlarda (fresnel) parlayan, kolluk boyunca
  //     elden dirseğe doğru akan ışık halkaları;
  //  3) KO klan ışıltısı (clan_rank_1.fxb) kolluk ekseni boyunca 3 noktada, küçük boy — halkalarla karışır.
  if (!api) return;
  api._kollukFx?.dispose?.(); api._kollukFx = null;
  const d = Number(derece); if (!obj || !(d >= 1 && d <= 3)) return;
  const guc = [1, 0.75, 0.5][d - 1];
  const bb = new THREE.Box3();
  obj.children.forEach((m) => { if (m.isMesh && !m.userData.kolluk) { m.geometry.computeBoundingBox?.(); bb.union(m.geometry.boundingBox); } });
  const boy = (bb.max.y - bb.min.y) || 1, kal = Math.max(0.012, Math.min(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.07);
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;   // kolluk ekseni (kolun geçtiği yer)
  const U = { uT: { value: 0 }, uGuc: { value: guc }, uY0: { value: bb.min.y }, uBoy: { value: boy }, uKal: { value: kal }, uEks: { value: new THREE.Vector2(cx, cz) } };
  const VS = (it) => `varying vec2 vUv; varying float vY; varying vec3 vN; varying vec3 vV; varying float vDis; uniform float uKal; uniform vec2 uEks; void main(){ vUv=uv; vY=position.y; vec2 rd=position.xz-uEks; vDis=dot(normalize(normal).xz, rd)/max(length(rd),1e-4); vec3 p=position${it ? '+normalize(normal)*uKal' : ''}; vec4 mv=modelViewMatrix*vec4(p,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`;
  const ORT = 'uniform sampler2D map; uniform float uT,uGuc,uY0,uBoy; varying vec2 vUv; varying float vY; varying vec3 vN; varying vec3 vV; varying float vDis; float yy(){ return clamp((vY-uY0)/uBoy,0.,1.); } float halka(float y){ return pow(.5+.5*sin((y*3.0-uT*.9)*6.2832),6.0); } float uc(float y){ return smoothstep(0.,.08,y)*(1.-smoothstep(.92,1.,y)); }';
  const YUZEY = ORT + ' void main(){ if(vDis<.05||!gl_FrontFacing) discard; float y=yy(); vec3 c=texture2D(map,vUv).rgb; float l=dot(c,vec3(.3,.59,.11)); float n=.8+.2*sin(uT*3.2); float a=uGuc*uc(y)*n*(.08+.5*l*l)*(.3+1.1*halka(y)); gl_FragColor=vec4(vec3(1.,.8,.32)*a,1.); }';
  const KABUK = ORT + ' void main(){ if(vDis<.05) discard; float y=yy(); float r=pow(1.-abs(dot(normalize(vN),vV)),1.6); float h=halka(y); float a=uGuc*uc(y)*(.04+.3*r+.85*h*(.25+r)); vec3 k=mix(vec3(1.,.66,.15),vec3(1.,.96,.72),h); gl_FragColor=vec4(k*a,1.); }';
  const ekler = [];
  for (const m of [...obj.children]) {
    if (!m.isMesh || m.userData.kolluk) continue;
    for (const [it, fs] of [[false, YUZEY], [true, KABUK]]) {
      const mat = new THREE.ShaderMaterial({ uniforms: { ...U, map: { value: m.material.map } }, vertexShader: VS(it), fragmentShader: fs,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, polygonOffset: !it, polygonOffsetFactor: -1 });
      const k = new THREE.Mesh(m.geometry, mat); k.frustumCulled = false; k.renderOrder = 3; k.userData.kolluk = true; obj.add(k); ekler.push(k);
    }
  }
  // KO klan ışıltısı: kolluk ekseni boyunca (yerel y) 3 nokta, merkez çizgisinin hafif önünde
  const st = { fx: [], bitti: false, gizli: false };
  // fx noktaları kolluğun DIŞINDA: her yükseklik bandında eksenden en uzak köşenin %12 ötesi (kol ile kolluk arasına girmez)
  const noktalar = [0.18, 0.5, 0.82].map((f) => {
    const y0 = bb.min.y + boy * f, w = boy * 0.12; let en = null, enR = -1;
    for (const m of obj.children) { if (!m.isMesh || m.userData.kolluk) continue; const P = m.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (Math.abs(y - y0) > w) continue; const dx = P.getX(i) - cx, dz = P.getZ(i) - cz, r = dx * dx + dz * dz; if (r > enR) { enR = r; en = [dx, dz]; } } }
    if (!en) return new THREE.Vector3(cx, y0, cz);
    return new THREE.Vector3(cx + en[0] * 1.12, y0, cz + en[1] * 1.12);
  });
  KLAN_FX_P ||= fxEkle('./assets/fxklan').then(() => true, () => { KLAN_FX_P = null; return false; });
  const dene = (n = 0) => KLAN_FX_P?.then((ok) => {
    if (st.bitti) return;
    if (!ok || !FXM || !FXM.var?.('clan_rank_1.fxb')) { if (n < 30) setTimeout(() => dene(n + 1), 1000); return; }
    for (const yer of noktalar) {
      const w = new THREE.Vector3();
      const at = () => { if (st.bitti || !obj.parent) return null; obj.updateWorldMatrix(true, false); w.copy(yer).applyMatrix4(obj.matrixWorld); return new THREE.Vector3(w.x, w.y, -w.z); };
      const b = FXM.play('clan_rank_1.fxb', { loop: true, boyut: 0.32 * guc, follow: at }); if (b) { b.gizli = st.gizli; st.fx.push(b); }
    }
  });
  dene();
  let bitti = false;
  const off = api.addExtra?.((dt) => { U.uT.value += dt || 1 / 60; });
  api._kollukFx = {
    dispose() { if (bitti) return; bitti = true; st.bitti = true; off?.(); for (const k of ekler) { k.removeFromParent(); k.material.dispose(); } for (const b of st.fx) b?.dispose?.(); st.fx = []; },
    set gizli(g) { st.gizli = g; for (const k of ekler) k.visible = !g; for (const b of st.fx) if (b) b.gizli = g; },
  };
}
export function klanBilezik(api, on) {
  on = false;   // istek: karakterlerin ellerindeki yeşil-altın klan bileziği ışıltısı hiç gösterilmez (varsa kaldırılır)
  if (!api || !!api._bilezik === !!on) return;
  if (api._bilezik) { api._bilezik.dispose(); api._bilezik = null; }
  if (!on) return;
  const J = joints(api.race), st = { fx: [], bitti: false };
  api._bilezik = { dispose() { st.bitti = true; for (const b of st.fx) b?.dispose?.(); st.fx = []; api.setPlug('bilezikL', null); api.setPlug('bilezikR', null); }, set gizli(g) { for (const b of st.fx) if (b) b.gizli = g; } };
  KLAN_FX_P ||= fxEkle('./assets/fxklan').then(() => true, () => { KLAN_FX_P = null; return false; });
  const dene = (n = 0) => KLAN_FX_P?.then((ok) => {
    if (st.bitti) return;
    if (!ok || !FXM || !FXM.var?.('clan_rank_1.fxb')) { if (n < 30) setTimeout(() => dene(n + 1), 1000); return; }
    for (const [k, j] of [['bilezikL', J.lh], ['bilezikR', J.rh]]) {
      const o = new THREE.Object3D(); api.setPlug(k, o, j, IDENT);
      const w = new THREE.Vector3(), at = () => { o.updateWorldMatrix(true, false); w.setFromMatrixPosition(o.matrixWorld); return new THREE.Vector3(w.x, w.y, -w.z); };
      const b = FXM.play('clan_rank_1.fxb', { loop: true, boyut: 1, follow: at }); if (b) st.fx.push(b);
    }
  });
  dene();
}
export const periHazir = () => PERI_P || Promise.resolve();
let ESYA_FX_P = null; export const esyaFxHazir = () => ESYA_FX_P || Promise.resolve();   // yükleme ekranı peri efektlerini bekler
const FXM_HEPSI = new Set();   // görülen tüm efekt yöneticileri (seçim ekranı + oyun): artık pathos efekti hiçbirinde kalamaz
export function setFx(m, eski) { if (eski !== undefined && FXM !== eski) return; if (FXM !== m) for (const x of FXM_HEPSI) for (const b of x.list || []) if (PATHOS_FX_ADI.test(b.key || '')) { b.dispose(); x.list.delete(b); }   /* yönetici değişti (seçim ekranı → oyun): eski pathos efektlerinin hepsi gider, kuşananlar yeniden kurar */ FXM = m; if (!m) return; FXM_HEPSI.add(m); ESYA_FX_P = Promise.all([fxEkle('./assets/fxesyaorj', { ust: true }).catch(() => {}), fxEkle('./assets/fxesya').catch(() => {})]);   /* (6.11) seçim ekranı silah efektleri orijinal paket yüklenince kurulsun (önce deadsoft sürümü çıkıyordu) */ fxEkle('./assets/fxskillorj', { ust: true }).catch(() => {}); /* orijinal KO yetenek efektleri (R kombo / yakın dövüş, Sprint / Swift / Light feet, büyücü temel sekme): tools/fxb_orj.py */ /* orijinal KO (KnightOnlineEn fx) eşya efektleri: deadsoft sürümlerinin yerine */ fxEkle('./assets/fxesya').catch(() => {}); fxEkle('./assets/fxseviye').catch(() => {}); fxEkle('./assets/fxbuyu').catch(() => {});   /* büyücü: Pillar of fire hedefi (113, deadsoft fire_target1_3) */ fxEkle('./assets/fxkanat').catch(() => {}); fxEkle('./assets/fxtaki').catch(() => {}); /* tılsım / amblem / özel peri / kanat n3fxplug efektleri (orijinal KO fx) */ const a = fxEkle('./assets/fxmob').catch(() => {}).finally(() => { PATHOS_HAZIR = true; }); const b = fxEkle('./assets/fxperi').catch(() => {}).finally(() => { PERI_FX_HAZIR = true; }); const c = UZAK ? fxEkle(`${UZAK}/fxpathos`).catch(() => {}).finally(() => { PATHOS_FX_HAZIR = true; }) : (PATHOS_FX_HAZIR = true, null); PERI_P = Promise.all([a, b, c, UZAK ? fxEkle(`${UZAK}/fxperi`).catch(() => {}) : null]); }
let PATHOS_HAZIR = false;
// Reb eşyaları: yalnız eşya modelinin parlaklığı değişir (efektler etkilenmez).
//   reb 1-4: beyaz yanıp söner · 5-10: sürekli biraz daha parlak · 11-20: buz renginde yanıp söner · 21+: buz renginde sürekli parlar
const REB_BUZ = new THREE.Color(0.45, 0.8, 1.0), REB_BEYAZ = new THREE.Color(1, 1, 1);
// KO dayanıklılık çatlakları (CN3CPart/CN3CPlug::TexOverlapSet + CN3IMesh::RenderTwoUV): ikinci doku aşaması
// D3DTOP_MODULATE (renk × Misc\\Dust_Soft|Hard.dxt), ikinci UV = birinci UV. Malzeme kopyalanır (aynı eşyayı giyen başkasına geçmez).
const TOZ_DOKU = {};
function tozDoku(n) {
  return (TOZ_DOKU[n] ||= (() => { const t = new THREE.TextureLoader().load(new URL(`../assets/misc/${n === 2 ? 'dust_hard' : 'dust_soft'}.webp`, import.meta.url).href); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t; })());
}
function tozUygula(obj, toz, guc = 1) {   // guc: çatlak belirginliği (silahlar 1,2 = %20 daha belirgin)
  if (!obj || !toz) return;
  const doku = tozDoku(toz);
  obj.traverse((m) => {
    if (!m.material) return;
    const tek = (mt) => {
      if (!mt?.map) return mt;
      const k = mt.clone(), once = mt.onBeforeCompile;
      k.onBeforeCompile = (sh, r) => {
        once?.call(k, sh, r);
        sh.uniforms.tozMap = { value: doku }; sh.uniforms.tozGuc = { value: guc };
        sh.fragmentShader = 'uniform sampler2D tozMap; uniform float tozGuc;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          #ifdef USE_MAP
            diffuseColor.rgb *= clamp(vec3(1.0) - (vec3(1.0) - texture2D(tozMap, vMapUv).rgb) * tozGuc, 0.0, 1.0);
          #endif`);
      };
      const eskiAnahtar = mt.customProgramCacheKey?.bind(mt);
      k.customProgramCacheKey = () => (eskiAnahtar ? eskiAnahtar() : '') + '|toz' + toz + '|' + guc;
      return k;
    };
    m.material = Array.isArray(m.material) ? m.material.map(tek) : tek(m.material);
  });
}
export function rebUygula(api, key, obj, reb) {
  api._reb ||= {};
  api._reb[key]?.(); delete api._reb[key];
  if (!reb || !obj) return;
  const mats = []; obj.traverse((m) => { if (m.material) for (const mt of [].concat(m.material)) mats.push(mt); });
  const kat = reb >= 21 ? 4 : reb >= 11 ? 3 : reb >= 5 ? 2 : 1;
  const eski = mats.map((mt) => mt.color?.clone());
  for (const mt of mats) {
    mt.emissive = (kat >= 3 ? REB_BUZ : REB_BEYAZ).clone(); if (mt.map) mt.emissiveMap = mt.map; mt.emissiveIntensity = 0;
    if (kat >= 3 && mt.color) mt.color.multiply(new THREE.Color(0.78, 0.9, 1.0));   // buz tonu
    mt.needsUpdate = true;
  }
  // ortak saat: giyilen tüm parçalar (ve tüm karakterler) aynı anda yanıp söner
  // model parlaklığı %100 güçlü (×2). Yanıp sönme belirgin: ~1,2 sn'de bir, en düşükte neredeyse sönük
  const off = api.addExtra((dt) => {
    const t = performance.now() / 1000; const s = Math.sin(t * 2.0), nabiz = Math.pow(0.5 + 0.5 * s, 1.6);   // yavaş yanıp sönme (~3,1 sn döngü)
    const k = kat === 1 ? nabiz * 0.4 * 1.25 : kat === 2 ? 0.56 : kat === 3 ? (0.08 + nabiz * 1.9) * 2 * 1.25 : 3.0;   // +1 yanıp söner, +5 sürekli, +11 buz yanıp söner, +21 sürekli buz; yanıp sönenler %25 güçlü   // reb 11 / 21: parlaklık ×2
    for (const mt of mats) mt.emissiveIntensity = k;
  });
  api._reb[key] = () => { off?.(); mats.forEach((mt, i) => { mt.emissiveIntensity = 0; if (eski[i]) mt.color.copy(eski[i]); }); };
}
// KO: CPlayerBase — silahın element hasarı ≥ 64 (ya da eşsiz ve > 0) ise ana + kuyruk efekti (FXID_SWORD_*_MAIN / _TAIL)
const GLOW = { 1: [10021, 10022], 2: [10023, 10024], 3: [10025, 10026], 4: [10027, 10028] };
// KO silah efekt meshleri (tools/convert/silah-fx.js: .n3cplug içindeki CN3CPlug::m_PMeshInstFX)
let FXMESH = null;
const FX_HIZ = {};
const BOY_ORAN = { '11_1061_00_0': 0.62 };   // Double Dragon Claw Jamadar: efekt bıçak ucunu çok az geçer   // silaha özel efekt hızı (boş: tüm silahlar KO'daki gibi)
const FX_SICRAMA = {};   // kuyruk parçacığı konum değişim sıklığı (boş: KO gibi her kare)
// sol elde ters duran silahlar (Weapon Breaker): model kendi bıçak (Y) ekseni etrafında 180° çevrilir →
// uç yine aşağı bakar, yalnız yüzü/ağzı sağ eldekinin tersine döner (D3D satır düzeni: X ve Z satırları eksi)
// (5.11) tüm jamadarlar (Item_Org Kind 140): sol ele takılınca ters çevrilir
const SOL_TERS = new Set(['11_1011_00_0', '11_1031_00_0', '11_1051_00_0', '11_1061_00_0', '11_1071_00_0', '11_1091_00_0', '11_1111_00_0', '11_1131_00_0',
  '11_1146_70_0', '11_1151_00_0', '11_1171_00_0', '11_1191_00_0', '11_1331_30_0', '11_1334_70_0', '11_1336_10_0', '1_3681_00_0']);
// her iki elde de ters duran silahlar (Moonlight / <selfname>'s Moonlight): bıçak ekseninde 180° çevrilir (yüz dışa bakar)
const HER_TERS = new Set(['11_1042_30_0', '11_1043_00_0']);
const tersM = (m) => m.map((v, i) => ((i < 3 || (i >= 8 && i < 11)) ? -v : v));
// (5.11) sol el jamadarı: sağ eldekinin ayna görüntüsü (yalnız X satırı eksi → bıçak yönü ve yüzü aynı, kıvrım simetrik; negatif determinantı three.js yüz yönüyle karşılar)
const aynaM = (m) => m.map((v, i) => (i < 3 ? -v : v));
// kazma (Mattock / Golden Mattock): sap ekseni (Y) etrafında 90° — kazmanın ucu yatay değil dik (salınım düzleminde) durur
const KAZMA = new Set(['3_8913_20_0', '3_8913_50_0']);
// Kazma başı model Z ekseninde, sap Y'de. Ölçüm (a151 boyunca sağ el eklemi): orijinal plug matrisinde baş sallama düzlemine ~45° yan duruyor
// (90° döndürme de öbür yana ~45° kaçıyordu). Sap ekseni etrafında +45°: baş tam sallanma düzleminde, sivri ucu kalkışta öne, vuruşta yere bakar.
const KAZMA_ACI = Math.PI / 4;
const dik90 = (m) => { const c = Math.cos(KAZMA_ACI), s = Math.sin(KAZMA_ACI), r = m.slice(); for (let k = 0; k < 3; k++) { r[k] = c * m[k] - s * m[8 + k]; r[8 + k] = s * m[k] + c * m[8 + k]; } return r; };
const fxMeshYukle = () => (FXMESH ||= Promise.all([fetch('./assets/esya/fxmesh.json').then((r) => r.json()), fetch('./assets/esya/fxmesh.bin').then((r) => r.arrayBuffer())])
  .then(([m, b]) => ({ m, b })).catch(() => ({ m: {}, b: null })));
fxMeshYukle();
const _fw = new THREE.Vector3(), _fq = new THREE.Quaternion(), _fs = new THREE.Vector3();
/** KO CN3CPlug::RenderFX birebir: ana efektin dokusu silahın FX meshine 3 geçişte çizilir (doku karesi idx, idx+1, idx+2;
 *  2. ve 3. geçiş Y ekseninde ±5° döndürülmüş ve ilk köşe normali yönünde ±0,035 titreşimli). Kuyruk: 2 kuyruk efekti meshin
 *  kutusunun orta yarısında her karede rastgele noktada; parçacıkları silahla birlikte taşınır (yürürken geride kalmaz). */
// KO Seçenekler: Use Weapon Effects (silahFx) → silah efekt kabukları; Item Glow Effect (esyaFx) → artı parıltıları
const FX_SILAH = new Set(), FX_PARILTI = new Set();
setInterval(() => {
  const S = globalThis.koSecenek || {}, sv = S.silahFx !== false, pv = S.esyaFx !== false;
  for (const g of FX_SILAH) { if (!g.parent) { FX_SILAH.delete(g); continue; } g.visible = sv; }
  for (const b of FX_PARILTI) { if (b.dead || !b.group?.parent) { FX_PARILTI.delete(b); continue; } b.gizli = !pv; }
}, 300);
function koSilahFx(api, slot, ids, plug, ad, F) {
  const yz = fxYuzey(ids[0]); if (!yz) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(F.b, F.m[ad].pos, F.m[ad].vc * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(F.b, F.m[ad].uv, F.m[ad].vc * 2), 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(F.b, F.m[ad].idx, F.m[ad].ic), 1));
  const d = F.m[ad], grp = new THREE.Group(); grp.name = 'silahFx';
  const gecis = [0, 1, 2].map((k) => { const m = new THREE.Mesh(geo, yz.malzeme()); m.renderOrder = 12; m.frustumCulled = false; grp.add(m); return m; });
  plug.add(grp); FX_SILAH.add(grp);
  const n0 = new THREE.Vector3(...d.n0), R5 = Math.PI / 36;
  let life = Math.random() * 10, gizli = false;
  const hz = FX_HIZ[ad] ?? 1;   // silaha özel efekt hızı (varsayılan 1 = KO)
  const off = api.addExtra((dt) => {
    life += (dt || 1 / 60) * hz;
    const idx = Math.floor(life * yz.fps);
    gecis.forEach((m, k) => yz.kare(m.material.map, idx + k));
    const f = life * 1.2, j = 0.07 * (f - Math.floor(f)) - 0.035;
    gecis[1].rotation.y = -R5; gecis[1].position.copy(n0).multiplyScalar(j);
    gecis[2].rotation.y = R5; gecis[2].position.copy(n0).multiplyScalar(-j);
  });
  // kuyruk efektleri
  const mn = d.min, mx = d.max, ara = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  const v = new THREE.Vector3(), c = new THREE.Vector3(), t = new THREE.Vector3();
  // kuyruk parçacıkları her karede bıçak kutusunda rastgele bir noktaya sıçrar (KO). Silaha özel hızda (FX_SICRAMA) bu nokta
  // daha seyrek değişir: Weapon Breaker'da 10 karede bir (%90 yavaş) — parçacık yine silahla birlikte taşınır
  const sicrama = FX_SICRAMA[ad] ?? 1, yerel = new THREE.Vector3(); let sonDegisim = -1e9;
  const rastgele = () => {
    const simdi = performance.now();
    if (sicrama >= 1 || simdi - sonDegisim >= 1000 / 60 / sicrama) { sonDegisim = simdi; yerel.set(mn[0] + ara[0] * (0.25 + Math.random() * 0.5), mn[1] + ara[1] * (0.25 + Math.random() * 0.5), mn[2] + ara[2] * (0.25 + Math.random() * 0.5)); }
    v.copy(yerel); plug.updateWorldMatrix(true, false); v.applyMatrix4(plug.matrixWorld); return c.set(v.x, v.y, -v.z);
  };
  const tasiyici = () => { plug.updateWorldMatrix(true, false); t.setFromMatrixPosition(plug.matrixWorld); return t.set(t.x, t.y, -t.z); };
  plug.updateWorldMatrix(true, false); plug.matrixWorld.decompose(_fw, _fq, _fs);
  const olcek = Math.max(0.05, (ara[2] + ara[1]) * 0.7);   // (3.11) KO CN3CPlug::InitFX birebir: m_fTargetScale = (aralık.z + aralık.y) × 0,7 (mesh birimi; dünya ölçeği çarpılmaz)
  const kuyruk = FXM && ids[1] ? [1, 2].map(() => FXM.play(ids[1], { loop: true, hiz: hz, scale: olcek, follow: rastgele, tasiyici })).filter(Boolean) : [];
  const yuzey = { set gizli(g) { gizli = g; grp.visible = !g; }, get gizli() { return gizli; }, dispose() { off?.(); grp.removeFromParent(); for (const m of gecis) m.material.dispose(); geo.dispose(); } };
  return [yuzey, ...kuyruk];
}
// kalkan eklentileri (Item_Org Kind 60 → dwIDResrc): FX meshi olmayan kalkanlarda efekt kalkanın kendi yüzeyine çizilir
const KALKAN = new Set(["11_1042_80_0", "11_1043_50_0", "11_1044_70_0", "11_1058_70_0", "11_1075_00_0", "11_1147_20_0", "11_1331_80_0", "11_1335_20_0", "11_9131_10_0", "1_1250_10_0", "1_4954_00_0", "1_5953_90_0", "1_7011_00_0", "1_7015_00_0", "1_7021_00_0", "1_7025_00_0", "1_7031_00_0", "1_7041_00_0", "1_7051_00_0", "1_7061_00_0", "1_7111_00_0", "1_7121_00_0", "1_7151_00_0", "1_7153_00_0", "1_7910_20_0", "1_7920_10_0", "1_7920_20_0", "1_9131_10_0", "1_9133_60_0", "1_9741_00_0"]);
// KO CN3CPlug::RenderFX: efekt dokusu (bundle'ın ilk billboard parçası, kare animasyonlu) eşyanın meshinin üstüne eklemeli karışımla
// çizilir. FX meshi olmayan kalkanlarda bu mesh kalkanın kendisi: tüm yüzey + kenarlar parlar (bıçak kartları kalkana uymaz);
// kuyruk parçacıkları kalkanın kutusu içinde sıçrar. Animasyonlu (iskeletli) kalkanlarda katman aynı iskelete bağlanır.
function kalkanFx(api, slot, ids, plug) {
  const yz = fxYuzey(ids[0]); if (!yz) return null;
  const katman = [], gruplar = [];
  plug.updateWorldMatrix(true, true);
  plug.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.uv || o.userData?.kalkanFx) return;
    [1, 1.012, 1.026].forEach((k, i) => {
      const mat = yz.malzeme(); mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -2 - i * 2;
      let m;
      if (o.isSkinnedMesh) { m = new THREE.SkinnedMesh(o.geometry, mat); m.bind(o.skeleton, o.bindMatrix); m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale).multiplyScalar(k); o.parent.add(m); }
      else { m = new THREE.Mesh(o.geometry, mat); m.scale.setScalar(k); o.add(m); }
      m.userData.kalkanFx = true; m.renderOrder = 12; m.frustumCulled = false; m.name = 'kalkanFx';
      katman.push(m); gruplar.push(m);
    });
  });
  if (!katman.length) return null;
  for (const m of katman) FX_SILAH.add(m);
  let life = Math.random() * 10, gizli = false;
  const off = api.addExtra((dt) => { life += dt || 1 / 60; const idx = Math.floor(life * yz.fps); katman.forEach((m, k) => yz.kare(m.material.map, idx + (k % 3))); });
  // kuyruk parçacıkları: kalkanın yerel kutusunda rastgele noktalar
  const inv = new THREE.Matrix4().copy(plug.matrixWorld).invert(), lb = new THREE.Box3(), tb = new THREE.Box3(), m4 = new THREE.Matrix4();
  plug.traverse((o) => { if (!o.geometry || o.userData?.kalkanFx) return; o.geometry.boundingBox || o.geometry.computeBoundingBox(); tb.copy(o.geometry.boundingBox).applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld)); lb.union(tb); });
  const v = new THREE.Vector3(), c = new THREE.Vector3(), t = new THREE.Vector3(), sz = lb.isEmpty() ? new THREE.Vector3(0.3, 0.3, 0.3) : lb.getSize(new THREE.Vector3());
  const rastgele = () => { v.set(lb.min.x + sz.x * Math.random(), lb.min.y + sz.y * Math.random(), lb.min.z + sz.z * Math.random()); plug.updateWorldMatrix(true, false); v.applyMatrix4(plug.matrixWorld); return c.set(v.x, v.y, -v.z); };
  const tasiyici = () => { plug.updateWorldMatrix(true, false); t.setFromMatrixPosition(plug.matrixWorld); return t.set(t.x, t.y, -t.z); };
  plug.matrixWorld.decompose(_fw, _fq, _fs);
  const olcek = Math.max(0.05, (sz.x + sz.y + sz.z) / 3 * 0.9 * ((Math.abs(_fs.x) + Math.abs(_fs.y) + Math.abs(_fs.z)) / 3));
  const kuyruk = FXM && ids[1] ? [1, 2, 3].map(() => FXM.play(ids[1], { loop: true, hiz: 0.7, scale: olcek, follow: rastgele, tasiyici })).filter(Boolean) : [];
  const yuzey = { set gizli(g) { gizli = g; for (const m of katman) m.visible = !g; }, get gizli() { return gizli; },
    dispose() { off?.(); for (const m of katman) { m.removeFromParent(); m.material.map?.dispose?.(); m.material.dispose(); FX_SILAH.delete(m); } } };
  return [yuzey, ...kuyruk];
}
// (3.11) KO CN3Chr silah izi (궤적, 검기): plug dosyasındaki iz (adım sayısı, renk, t0/t1) + animasyonun iz kareleri.
// Renk: element efekti varsa KO CPlayerBase::PlugSet'teki TraceCR (ateş sarı, buz mavi, yıldırım beyaz, zehir mor), yoksa plug'ın kendi rengi.
// Çizim: üçgen şerit, doku yok, köşe rengi (en yeni kare tam renk → en eski siyaha), alt kenar üst rengin 1/4'ü; karışım SRCCOLOR + ONE.
const IZ_RENK = { 1: 0xffffff00, 2: 0xff0000ff, 3: 0xffffffff, 4: 0xffff00ff };
const izRengi = (el, fx) => { if (IZ_RENK[el]) return IZ_RENK[el]; if (fx >= 12000 && fx < 12040) return IZ_RENK[Math.floor((fx % 100) / 10) + 1] ?? null; if (fx >= 10021 && fx <= 10028) return IZ_RENK[Math.floor((fx - 10021) / 2) + 1] ?? null; return null; };
const _izC = new THREE.Color();
let IZ_JSON = null;
const izYukle = () => (IZ_JSON ||= fetch('./assets/esya/iz.json').then((r) => r.json()).catch(() => ({})));
function silahIz(api, slot, ad, renk) {
  api._iz ||= {}; api._izNo ||= {}; const no = (api._izNo[slot] = (api._izNo[slot] || 0) + 1);
  const old = api._iz[slot]; if (old) { old(); delete api._iz[slot]; }
  if (!ad || !api.izNoktalar || !api.group) return;
  Promise.all([fxMeshYukle(), izYukle()]).then(([F, IZ]) => {
    if (api._izNo[slot] !== no) return;
    // (4.11) FX meshi olmayan silahlar: orijinal Item\*.n3cplug iz verisi (iz.json, 252 silah)
    const iz = F.m?.[ad]?.iz || IZ?.[String(ad).toLowerCase()];
    if (!iz || !(iz.n > 1) || !(iz.t1 !== iz.t0)) return;
    // (4.11) KO birebir: iz rengi silahın kendi .n3cplug kaydındaki m_crTrace (çoğu beyaz); element / kombo rengi uygulanmaz
    if (!((iz.renk >>> 0) & 0xffffff)) return; void renk;   // KO: siyah = iz yok
    // (4.11) KO görüntüsü (kullanıcı görselleri): çok ince, hafif bej, birkaç paralel çizik; hat boyunca kesik kesik (her yerde iz yok).
    // Bıçak üzerinde 3 ayrı ince şerit (uçta, %22 ve %45 içeride), her biri ~1,2 cm; boyunca sabit bir boşluk deseni; eskiye doğru söner.
    // (4.11) iz dünyada kalır: her karede bıçağın yeni konumu (önceki kareden bu yana 4 ara örnek) dünya koordinatında kaydedilir;
    // çizilen şerit karakterle taşınmaz, olduğu yerde ÖMUR içinde söner (KO: savuruş havada çizik bırakır, sonra silinir).
    const CIZ = [[0, 0.04], [0.22, 0.25], [0.45, 0.47]], L = CIZ.length, MAX = 96, OMUR = 260, ARA = 4;
    const span = iz.t1 - iz.t0, sg = Math.sign(span) || 1, boy = Math.abs(span);
    const araliklar = CIZ.map(([a, b]) => [iz.t1 - sg * Math.max(b * boy, a * boy + 0.012), iz.t1 - sg * (a * boy)]);
    const pos = new Float32Array(L * MAX * 6), col = new Float32Array(L * MAX * 6), idx = [];
    for (let l = 0; l < L; l++) for (let j = 0; j < MAX - 1; j++) { const a = (l * MAX + j) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry(), pa = new THREE.BufferAttribute(pos, 3), cl = new THREE.BufferAttribute(col, 3); pa.setUsage(THREE.DynamicDrawUsage); cl.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pa); geo.setAttribute('color', cl); geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcColorFactor, blendDst: THREE.OneFactor });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 13; mesh.visible = false; mesh.name = 'silahIz'; mesh.matrixAutoUpdate = false;
    let kok = api.group; while (kok.parent) kok = kok.parent; kok.add(mesh);
    const R0 = 0.86, G0 = 0.80, B0 = 0.64, PARL = [0.55, 0.38, 0.28];
    const gecmis = []; let sonF = null, sayac = 0;   // gecmis: { t, no, p: Float32Array(L*6) } — dünya koordinatı
    const tmp = Array.from({ length: L }, () => new Float32Array(ARA * 6)), _v = new THREE.Vector3();
    const desen = (l, no) => { const x = Math.sin((no + 1) * (12.9898 + l * 7.31)) * 43758.5453, r = x - Math.floor(x); return (no % (5 + l) < 3 + (l === 0 ? 1 : 0)) && r > 0.18 ? 1 : 0; };
    const off = api.addExtra(() => {
      const now = performance.now();
      let f = false;
      for (let l = 0; l < L; l++) { const r = api.izNoktalar('yuva' + slot, araliklar[l][0], araliklar[l][1], ARA, tmp[l], sonF); if (l === 0) f = r; }
      if (f) {
        if (sonF != null && f < sonF) sonF = null;
        api.group.updateWorldMatrix(true, false); const M = api.group.matrixWorld;
        // tmp[*] j=0 şimdiki kare, j=ARA-1 önceki kare: eskiden yeniye eklenir (önceki karenin örneği zaten kayıtlıysa atlanır)
        for (let j = ARA - 1 - (sonF != null ? 1 : 0); j >= 0; j--) {
          const p = new Float32Array(L * 6);
          for (let l = 0; l < L; l++) for (let k = 0; k < 2; k++) { const o = (j * 2 + k) * 3; _v.set(tmp[l][o], tmp[l][o + 1], tmp[l][o + 2]).applyMatrix4(M); p.set([_v.x, _v.y, _v.z], (l * 2 + k) * 3); }
          gecmis.push({ t: now - j * 4, no: sayac++, p });
        }
        sonF = f;
      } else sonF = null;
      while (gecmis.length && (now - gecmis[0].t > OMUR || gecmis.length > MAX)) gecmis.shift();
      const N = gecmis.length; mesh.visible = N > 1; if (N < 2) return;
      for (let l = 0; l < L; l++) for (let j = 0; j < MAX; j++) {
        const g = gecmis[Math.max(0, N - 1 - j)], o = (l * MAX + j) * 6;
        pos.set(g.p.subarray(l * 6, l * 6 + 6), o);
        const yas = j < N ? Math.max(0, 1 - (now - g.t) / OMUR) : 0, m = j < N ? desen(l, g.no) * yas * PARL[l] : 0;
        _izC.setRGB(R0 * m, G0 * m, B0 * m, THREE.SRGBColorSpace); col.set([_izC.r, _izC.g, _izC.b], o); col.set([_izC.r, _izC.g, _izC.b], o + 3);
      }
      pa.needsUpdate = true; cl.needsUpdate = true;
    });
    api._iz[slot] = () => { off?.(); mesh.removeFromParent(); geo.dispose(); mat.dispose(); };
  });
}
export function weaponGlow(api, slot, el, fx, plugM, ad) {
  api._glow ||= {};
  const old = api._glow[slot]; if (old) { for (const b of old.b) b.dispose(); delete api._glow[slot]; }
  silahIz(api, slot, ad, izRengi(el, fx));
  // öncelik: eşyanın kendi efekti (Item_Ext dwEffectID: ana + bir sonraki kimlik kuyruk), yoksa element kuralı
  const ids = fx ? [fx, fx + 1] : GLOW[el];
  if (!ids) return;
  // efekt yöneticisi (FXM) ya da silah eklentisi henüz hazır değilse (ör. Ardream'e girerken orada olan oyuncular hemen
  // kurulur) efekt sonra yeniden denenir; eskiden sessizce atlanıyor ve o oyuncunun silah efekti hiç görünmüyordu
  if (!FXM || !api.plugObj?.('yuva' + slot)) {
    const d = (api._glowDene ||= {}); const n = (d[slot] = (d[slot] || 0) + 1);
    const k0 = api._gear?.get('el' + slot); if (n <= 40) setTimeout(() => { if (!api._glow?.[slot] && d[slot] === n && api._gear?.get('el' + slot) === k0) weaponGlow(api, slot, el, fx, plugM, ad); }, 500);
    return;
  }
  if (api._glowDene) api._glowDene[slot] = 0;
  const plug = api.plugObj('yuva' + slot);
  // KO yöntemi: silahın kendi FX meshi varsa (tüm hançerler ve efektli silahların çoğu)
  if (ad) {
    const istek = (api._glowIstek ||= {}); const no = (istek[slot] = (istek[slot] || 0) + 1);
    fxMeshYukle().then((F) => {
      if (istek[slot] !== no || api.plugObj?.('yuva' + slot) !== plug) return;
      const b = F.b && F.m[ad] ? koSilahFx(api, slot, ids, plug, ad, F) : KALKAN.has(ad) ? kalkanFx(api, slot, ids, plug) : null;
      if (b) { const o2 = api._glow[slot]; if (o2) for (const x of o2.b) x.dispose(); api._glow[slot] = { b, el }; }
      else eskiGlow(api, slot, el, ids, plug, plugM, ad);
    });
    return;
  }
  eskiGlow(api, slot, el, ids, plug, plugM, ad);
}
// FX meshi olmayan silahlar: bıçak boyunca kartlarla yaklaşık efekt
function eskiGlow(api, slot, el, ids, plug, plugM, ad) {
  // silahın yerel kutusu → en uzun eksen = namlu; tutma noktası (yerel orijin) tarafı sap, öbür uç bıçak ucu
  plug.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(plug.matrixWorld).invert(), lb = new THREE.Box3(), tb = new THREE.Box3(), m4 = new THREE.Matrix4();
  plug.traverse((o) => { if (!o.geometry) return; o.geometry.boundingBox || o.geometry.computeBoundingBox(); tb.copy(o.geometry.boundingBox).applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld)); lb.union(tb); });
  if (lb.isEmpty()) return;
  const sz = lb.getSize(new THREE.Vector3()), ctr = lb.getCenter(new THREE.Vector3());
  const ax = sz.x >= sz.y && sz.x >= sz.z ? 'x' : sz.y >= sz.z ? 'y' : 'z';
  // el (bağlandığı eklemin merkezi) silahın yerel uzayında: M⁻¹ · 0; uç = elden uzak olan taraf
  const el0 = plugM ? new THREE.Vector3().applyMatrix4(new THREE.Matrix4().fromArray(plugM).invert()) : new THREE.Vector3();
  const lo = lb.min[ax], hi = lb.max[ax], uc0 = Math.abs(hi - el0[ax]) >= Math.abs(lo - el0[ax]) ? hi : lo, sap = uc0 === hi ? lo : hi;
  // animasyonlu silahların kutusu (bağlanma pozu) bıçaktan uzun çıkabilir → silaha özel boy oranı (efekt bıçağı çok az geçsin)
  const uc = sap + (uc0 - sap) * (BOY_ORAN[ad] ?? 1);
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  // bıçak: sap ucundan itibaren %35–%100 arası
  // bıçak boyu (dünya ölçüsünde) → efekt en fazla bu kadar büyür
  const p0 = ctr.clone(), p1 = ctr.clone(); p0[ax] = sap; p1[ax] = uc;
  const boy = p0.applyMatrix4(plug.matrixWorld).distanceTo(p1.applyMatrix4(plug.matrixWorld)) || 1;
  const at = (t0, t1) => () => {
    const t = t0 + Math.random() * (t1 - t0);
    v.copy(ctr); v[ax] = sap + (uc - sap) * t;
    plug.updateWorldMatrix(true, false); v.applyMatrix4(plug.matrixWorld);   // bu karenin konumu (gecikmesiz)
    return c.set(v.x, v.y, -v.z);   // sahne → KO koordinatı
  };
  const sabit = (t) => at(t, t);
  const e0 = new THREE.Vector3(), e1 = new THREE.Vector3(), ed = new THREE.Vector3();
  const eksen = () => { e0.copy(ctr); e0[ax] = sap; e1.copy(ctr); e1[ax] = uc; e0.applyMatrix4(plug.matrixWorld); return ed.copy(e1.applyMatrix4(plug.matrixWorld)).sub(e0); };
  // eşyanın gövde profili: namlu boyunca dilimlerdeki köşe noktalarının ortası ve eni (yay kavisli → efekt düz çizgide değil kolların üstünde)
  const K = 24, top = Array.from({ length: K }, () => ({ n: 0, p: new THREE.Vector3(), mn: new THREE.Vector3(1e9, 1e9, 1e9), mx: new THREE.Vector3(-1e9, -1e9, -1e9) }));
  { const q = new THREE.Vector3(); plug.traverse((o) => { const pa = o.geometry?.attributes?.position; if (!pa) return; m4.multiplyMatrices(inv, o.matrixWorld);
      const adim = Math.max(1, Math.floor(pa.count / 4000));
      for (let i = 0; i < pa.count; i += adim) { q.fromBufferAttribute(pa, i).applyMatrix4(m4); const k = Math.min(K - 1, Math.max(0, Math.floor(((q[ax] - sap) / ((uc - sap) || 1)) * K))); const d = top[k]; d.n++; d.p.add(q); d.mn.min(q); d.mx.max(q); } }); }
  let son = null; for (const d of top) { if (d.n) { d.p.divideScalar(d.n); son = d; } else if (son) { d.p.copy(son.p); d.mn.copy(son.mn); d.mx.copy(son.mx); d.bos = true; } }
  for (let k = K - 1; k >= 0; k--) if (!top[k].n && !top[k].bos) { const s2 = top[k + 1] || top[k]; top[k].p.copy(s2.p); top[k].mn.copy(s2.mn); top[k].mx.copy(s2.mx); }
  const profil = (t) => { const f = Math.min(K - 1.001, Math.max(0, t * K - 0.5)), k = Math.floor(f), w = f - k; return top[k].p.clone().lerp(top[Math.min(K - 1, k + 1)].p, w); };
  const pv = new THREE.Vector3(), pt0 = new THREE.Vector3(), pt1 = new THREE.Vector3();
  const atP = (t0, t1) => () => { plug.updateWorldMatrix(true, false); const t = t0 + Math.random() * (t1 - t0); pv.copy(profil(t)); pv[ax] = sap + (uc - sap) * t; pv.applyMatrix4(plug.matrixWorld); return c.set(pv.x, pv.y, -pv.z); };
  const eksenP = (t, dt) => () => { pt0.copy(profil(t - dt)); pt0[ax] = sap + (uc - sap) * (t - dt); pt1.copy(profil(t + dt)); pt1[ax] = sap + (uc - sap) * (t + dt); pt0.applyMatrix4(plug.matrixWorld); pt1.applyMatrix4(plug.matrixWorld); return ed.copy(pt1).sub(pt0).normalize().multiplyScalar(boy); };
  const dilimEni = (t) => { const d = top[Math.min(K - 1, Math.max(0, Math.floor(t * K)))]; const e = ['x', 'y', 'z'].filter((q) => q !== ax).map((q) => d.mx[q] - d.mn[q]).sort((p, q) => q - p); return Math.max(0.04, e[0] * (boy / (Math.abs(uc - sap) || 1))); };
  // zehir dokusu (0913poison_sword) kartın tamamını kaplar → sapa taşmasın diye bıçağın uç tarafına toplanır
  const Z = ids[0] === 10027 || el === 4;
  // tutma noktası (yerel orijin = el) → sapın ucu biraz ötesi; kartlar tamamen [zBas, 1] içinde kalır, ele taşmaz
  const tEl = Math.min(0.6, Math.max(0, (el0[ax] - sap) / ((uc - sap) || 1)));
  const zBas = Math.min(0.7, tEl + 0.2), zN = Math.max(2, Math.min(5, Math.round((1 - zBas) * boy / 0.22))), zL = Math.min(1 - zBas, ((1 - zBas) / zN) * 2.4);   // kısa bıçakta (hançer) az ve iç içe kart → kesintisiz
  // bıçağın eni (dünya ölçüsünde): yerel kutunun ikinci büyük boyutu × ölçek
  const eksenler = ['x', 'y', 'z'].filter((q) => q !== ax).map((q) => sz[q]).sort((p, q) => q - p);
  const eksenler2 = ['x', 'y', 'z'].filter((q) => q !== ax);
  const bicakEni = Math.max(0.04, eksenler[0] * (boy / (Math.abs(uc - sap) || 1)));
  const zehirHatti = () => Array.from({ length: zN }, (_, i) => zBas + zL / 2 + (i * (1 - zBas - zL)) / (zN - 1));
  // efekt eşyanın tüm boyunca: bıçaklı silahta sapın bittiği yerden uca, yayda (tutma yeri ortada) iki uç arası.
  // kartlar hat boyunca sıralanır, her biri bir aralık uzunluğunda (enFazla) → eşya ne kadar uzunsa efekt o kadar uzun (Eagle Eye, Cold Hearted…)
  const yay = tEl > 0.3 && tEl < 0.7;
  // bıçağın başladığı yer: tutma yerinden uca doğru dilim eni sapın eninin ~1,7 katını geçtiği ilk nokta (Sherion gibi uzun saplı
  // kancalı silahlarda efekt sapı kaplamaz, yalnız ağızda yanar; kılıçta siper/bıçak başı)
  let bicakBas = 0;
  if (!yay && !Z) {
    const k0 = Math.max(0, Math.floor((tEl + 0.02) * K)), sapEn = [];
    for (let k = k0; k < Math.min(K, k0 + 3); k++) if (top[k].n) sapEn.push(Math.min(top[k].mx[eksenler2[0]] - top[k].mn[eksenler2[0]], top[k].mx[eksenler2[1]] - top[k].mn[eksenler2[1]]) + Math.max(top[k].mx[eksenler2[0]] - top[k].mn[eksenler2[0]], top[k].mx[eksenler2[1]] - top[k].mn[eksenler2[1]]));
    const sapE = sapEn.length ? sapEn.sort((a, b) => a - b)[0] : 0;
    if (sapE > 0) for (let k = k0 + 1; k < K; k++) { const d = top[k]; if (!d.n) continue; const e = (d.mx[eksenler2[0]] - d.mn[eksenler2[0]]) + (d.mx[eksenler2[1]] - d.mn[eksenler2[1]]); if (e > sapE * 1.7) { bicakBas = k / K; break; } }
  }
  const tBas0 = yay ? 0.03 : Z ? zBas : Math.min(0.85, Math.max(tEl + 0.12, bicakBas)), tSon0 = yay ? 0.97 : 1;
  // efekt eşyanın şeklinden %20 büyük: boyca iki uçtan %10'ar taşar, en %20 geniş (Azagai, Eagle's Eye… dahil)
  const uzat = (tSon0 - tBas0) * 0.1, tBas = tBas0 - uzat, tSon = tSon0 + uzat, GEN = 1.2;
  const n = Math.max(3, Math.min(9, Math.round((tSon - tBas) * boy / 0.2))), aralik = (tSon - tBas) / n, L = Math.min(tSon - tBas, aralik * 2.2);
  const hat = Array.from({ length: n }, (_, i) => tBas + aralik * (i + 0.5));
  // bıçaklı silahlar: en, kartın bulunduğu dilimin kalınlığı (boyun en fazla %16'sı) → kancalı/dikenli silahlarda (Sherion) bulut gibi yayılmaz
  // yay: kartlar kolların kavisini izler (konum + yön dilim profilinden), en kolun o noktadaki kalınlığı → diğer silahlar gibi gövdeyi sarar
  // KO görünümü: eklemeli parlak efektler (uniq_ice, uniq_lightning… — Sherion, Dark Vane) kartı doldurur → aynı ebatta görünsün diye
  // Shard'daki (poison_sword) ince çizgili efekt kadar dar ve kısa tutulur; kuyruk parçacıkları da küçülür
  const tw = new THREE.Vector3(), tasiyici = () => { plug.updateWorldMatrix(true, false); tw.setFromMatrixPosition(plug.matrixWorld); return tw.set(tw.x, tw.y, -tw.z); };   // parçacıklar silahla taşınır
  const P = !Z && fxParlak(ids[0]), KE = P ? 0.75 : 1, KB = P ? 0.9 : 1;
  const b = hat.map((t) => FXM.play(ids[0], { loop: true, hiz: 0.7, boyut: Z ? 0.8 : 1.4, enFazla: boy * L * KB, eksen: yay ? eksenP(t, aralik / 2) : eksen, genislik: (yay ? Math.min(dilimEni(t), boy * 0.14) * 2.2 : Z ? bicakEni * 1.6 : Math.min(dilimEni(t), bicakEni, boy * 0.16) * 2.2) * GEN * KE, follow: yay ? atP(t, t) : sabit(t) }))
    .concat(Array.from({ length: Math.max(2, Math.round(n / 2)) }, () => FXM.play(ids[1], { loop: true, hiz: 0.7, boyut: P ? 0.4 : 0.6, enFazla: boy * Math.min(0.3, L * 1.5) * GEN * (P ? 0.6 : 1), follow: yay ? atP(tBas, tSon) : at(tBas, tSon), tasiyici })))
    .filter(Boolean);
  api._glow[slot] = { b, el }; for (const x of b) FX_PARILTI.add(x);
  if (globalThis.__glowDebug) (globalThis.__glowLog ||= []).push({ slot, boy: +boy.toFixed(3), bicakEni: +bicakEni.toFixed(3), n, L: +L.toFixed(3), kart: +(boy * L).toFixed(3), en: hat.map((t) => +(Math.min(dilimEni(t), bicakEni, boy * 0.16) * 2.2 * GEN).toFixed(3)), tBas: +tBas.toFixed(2), tSon: +tSon.toFixed(2), ids });
}

/** api: createCharacter sonucu; race: ırk kodu; codes: [[yuva, dwIDResrc]] */
export async function applyGear(api, race, codes, force = false) {
  if (!api || !gearMeta()) return;
  const G = gearMeta(), J = joints(race);
  const want = new Map(codes.map((c) => [c[0], c[1]]));
  const els = new Map(codes.map((c) => [c[0], c[2] || 0])), fxs = new Map(codes.map((c) => [c[0], c[3] || 0])), rebs = new Map(codes.map((c) => [c[0], c[5] || 0]));
  const tozs = new Map(codes.map((c) => [c[0], c[6] || 0]));   // dayanıklılık çatlakları (0 yok, 1 Dust_Soft, 2 Dust_Hard)
  api._gear ||= new Map();
  if (force) { api._gear.clear(); api._pathosKey = undefined; if (api._peri) api._peri.key = null; }   // efekt yöneticisi değişti (seçim ekranı → oyun): peri / pathos efektleri yeniden kurulur
  const jobs = [];
  for (const slot of [6, 8]) {
    const id = want.get(slot) || 0;
    const el = els.get(slot) || 0, fxi = fxs.get(slot) || 0, rb = rebs.get(slot) || 0, tz = tozs.get(slot) || 0;
    if (api._gear.get('el' + slot) === id + ':' + el + ':' + fxi + ':' + rb + ':' + tz) continue;
    api._gear.set('el' + slot, id + ':' + el + ':' + fxi + ':' + rb + ':' + tz);
    rebUygula(api, 'yuva' + slot, null, 0);
    const key = 'yuva' + slot;
    const name = id ? `${Math.floor(id / 1e7)}_${String(Math.floor(id / 1e3) % 1e4).padStart(4, '0')}_${p2(Math.floor(id / 10) % 100)}_${id % 10}` : null;
    api._silahOff?.[slot]?.(); if (api._silahOff) api._silahOff[slot] = null;
    // KO 2369 animasyonlu silah (Dark Knight, Sinsu…): kendi iskeleti ve animasyonu olan model, elin eklemine
    const ani = name && !G.plugs[name] ? silahFor(name) : null;
    if (ani) {
      jobs.push(createKanat(ani[0]).then((w) => {
        if (!w || api._gear.get('el' + slot) !== id + ':' + el + ':' + fxi + ':' + rb + ':' + tz) return;
        const g = new THREE.Group(); g.add(w.group);
        const pj = ani[1];
        const j = slot === 6 ? (pj === 12 || pj === 23 ? J.rh : pj === J.lh ? J.rh : pj === J.lh2 ? J.re : pj) : (pj === 12 || pj === 23 ? J.lh : pj);
        const am = slot !== 6 && SOL_TERS.has(name) && Array.isArray(ani[2]) ? aynaM(ani[2]) : ani[2];
        api.setPlug(key, g, j, am);
        rebUygula(api, key, w.group, rb);   // KO: rebirth eşsiz silahlar (Dark Knight, Garges…) da reb kademesine göre yanıp söner
        tozUygula(w.group, tz, 1.2);
        (api._silahOff ||= {})[slot] = api.addExtra((dt) => { w.setClip('breath'); w.update(dt); });
        if (api.fxOk !== false) weaponGlow(api, slot, el, fxi, am, name);
      }).catch(() => {}));
      continue;
    }
    if (!name || !G.plugs[name]) { api.setPlug(key, null); weaponGlow(api, slot, 0, 0); if (api._glowIstek) api._glowIstek[slot] = (api._glowIstek[slot] || 0) + 1; continue; }
    jobs.push(createPlug(name).then((p) => {
      if (!p || api._gear.get('el' + slot) !== id + ':' + el + ':' + fxi + ':' + rb + ':' + tz) return;
      tozUygula(p.obj, tz, 1.2);   // silah çatlakları %20 daha belirgin
      rebUygula(api, 'yuva' + slot, p.obj, rb);
      const pj = p.info.joint;
      // sol ele ait eşya (yay → sol dirsek 5, kalkan → sol el 7) sağ yuvaya takılırsa sağ kolun aynı eklemine (GM çift yay: iki yay da görünür)
      const j = slot === 6 ? (pj === 12 || pj === 23 ? J.rh : pj === J.lh ? J.rh : pj === J.lh2 ? J.re : pj) : (pj === 12 || pj === 23 ? J.lh : pj);
      const pm = KAZMA.has(name) ? dik90(p.info.m) : HER_TERS.has(name) ? tersM(p.info.m) : slot !== 6 && SOL_TERS.has(name) ? aynaM(p.info.m) : p.info.m;
      api.setPlug(key, p.obj, j, pm);
      if (api.fxOk !== false) weaponGlow(api, slot, el, fxi, pm, name);
    }).catch(() => {}));
  }
  // KO kanatları: kendi iskeleti ve kanat çırpma animasyonu olan ayrı model (Wing.tbl), göğüs eklemine bağlı
  const orgs = new Map(codes.map((c) => [c[0], c[4] || 0]));
  // pathos eldiveni efektleri en başta güncellenir: aşağıdaki kanat / kostüm / takı kurulumunda bir hata çıksa da eldiven çıkınca efekt kalmaz
  try { pathosGlow(api, [orgs.get(50) || 0, orgs.get(51) || 0], J); } catch (e) { console.warn('pathos', e); }
  const kn = kanatFor(orgs.get(47));
  const kKey = kn ? kn[0] + ':' + kn[1] + (FXPLUG ? ':p' : '') : null;   // n3fxplug sonradan yüklenirse efektleriyle yeniden kurulur
  if (api._gear.get('kanatModel') !== kKey) {
    api._gear.set('kanatModel', kKey);
    api._kanatOff?.(); api._kanatOff = null; api.setPlug('kanatModel', null);
    if (kn) jobs.push(createKanat(kn[0]).then((w) => {
      if (!w || api._gear.get('kanatModel') !== kKey) return;
      const g = new THREE.Group(); g.add(w.group);
      api.setPlug('kanatModel', g, kn[1] >= 0 ? kn[1] : 2, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const off = api.addExtra((dt) => { const c = api.clip; w.setClip(/walk|run|^wing_/.test(c || '') && w.has('walk') ? 'walk' : 'breath'); w.update(dt * 0.35); });   // kanat çırpma: önce %30, sonra %50 daha yavaş
      const durum = { bitti: false };   // kanadın n3fxplug efektleri (Wings of Snow, Heart Attack…) kanat modelinin eklemlerinde
      const fxOff = api.fxOk !== false ? modelFxTak(api, w, FXPLUG?.[kn[0].toLowerCase()] || [], 'kanatFx', durum) : () => { durum.bitti = true; };
      api._kanatOff = () => { off?.(); fxOff(); };
    }).catch(() => {}));
  }
  // KO efekt kanatları (deadsoft chrtypepartitem → Chr\*.n3fxplug, modelsiz): her .fxb karakterin kendi ekleminde, eklem yönüyle döner
  { const org = Number(orgs.get(47)) || 0, liste = !kn ? FX_KANAT[org] : null, fk = liste ? String(org) : null;
    if (api._gear.get('fxKanat') !== fk) {
      api._gear.set('fxKanat', fk); api._fxKanat?.(); api._fxKanat = null; api._fxKanatFx = null;
      if (liste) {
        let bitti = false; const fxler = [], objler = [];
        liste.forEach(([fx, j], i) => {
          const o = new THREE.Object3D(); api.setPlug('fxKanat' + i, o, j, IDENT); objler.push(i);
          const at = () => { o.updateWorldMatrix(true, false); _w2.setFromMatrixPosition(o.matrixWorld); return new THREE.Vector3(_w2.x, _w2.y, -_w2.z); };
          const yon = () => { o.updateWorldMatrix(true, false); _pm.copy(o.matrixWorld).premultiply(_SZ); if (_pm.determinant() < 0) _pm.multiply(_SZ); _pm.decompose(_pp, _pq, _ps); return _pq.clone(); };
          let n = 0;
          const dene = () => {
            if (bitti) return;
            if (!FXM || !FXM.var?.(fx)) { n++; setTimeout(dene, n < 20 ? 250 : 1000); return; }
            const b = FXM.play(fx, { loop: true, boyut: 1, follow: at }); if (!b) { n++; setTimeout(dene, 500); return; }
            b.yon = yon; fxler.push(b);
          };
          dene();
        });
        api._fxKanat = () => { bitti = true; for (const b of fxler) b?.dispose?.(); for (const i of objler) api.setPlug('fxKanat' + i, null); };
        api._fxKanatFx = fxler;
      }
    }
  }
  // kanat yuvasındaki kostüm eşyası kendi plug modeliyle (Cupid's Wing → 5_0822_90_0)
  { const kp = !kn ? KOST_PLUG[want.get(47)] : null;
    if (api._gear.get('kostumPlug') !== (kp || null)) {
      api._gear.set('kostumPlug', kp || null); api.setPlug('kostumPlug', null);
      if (kp && G.plugs[kp]) jobs.push(createPlug(kp).then((p) => { if (!p || api._gear.get('kostumPlug') !== kp) return; api.setPlug('kostumPlug', p.obj, p.info.joint === 12 || p.info.joint === 23 ? 2 : p.info.joint, p.info.m); }).catch(() => {}));
    } }
  periGorsel(api, orgs.get(48) || 0);
  takiGorsel(api, 'tilsim', orgs.get(91) || 0, jobs);
  takiGorsel(api, 'amblem', orgs.get(92) || 0, jobs);
  for (const L of LOOK) {
    if (L.key === 'kanat' && kn) { if (api._gear.get('kanat')) { api._gear.set('kanat', null); api.setPart('kanat', null); } continue; }   // gerçek kanat modeli varsa eski yama parçayı kullanma
    // kostüm varsa o, yoksa zırh; model bulunamazsa sıradakine düş
    let name = null, kaynakYuva = 0;
    for (const [s, cc] of L.src) { const id = want.get(s); if (id) { name = partName(id, race, cc == null ? L.P : 0, cc); if (name) { kaynakYuva = s; break; } } }
    const rb = kaynakYuva && kaynakYuva < 42 ? rebs.get(kaynakYuva) || 0 : 0;   // reb parlaklığı yalnız zırh parçasında (kostümde değil)
    const tz = kaynakYuva && kaynakYuva < 42 ? tozs.get(kaynakYuva) || 0 : 0;   // kostüm dayanıklılığı çatlak göstermez
    const gk = name ? name + '|' + rb + '|' + tz : null;
    if (api._gear.get(L.key) === gk) continue;
    api._gear.set(L.key, gk);
    rebUygula(api, 'parca:' + L.key, null, 0);
    if (!name) { api.setPart(L.key, null); continue; }
    jobs.push(createGearPart(name).then(async (m) => {
      if (!m || api._gear.get(L.key) !== gk) return;
      // başka ırkın parçası (ör. Gryphon kostümünün yalnız Tuarek modeli var): karakterin iskeletine uyarlanır → kafa/kol kaymaz
      const ir = PART_IRK.get(name); if (ir && ir !== race && L.key !== 'kanat') await retargetPart(m, ir, api).catch(() => {});
      if (api._gear.get(L.key) !== gk) return;
      if (L.key === 'kanat') sirtaTak(api, m);
      tozUygula(m, tz);
      // (5.11) kask kafayı tam sarmıyorsa (Mythril 5_47xx, başka ırktan uyarlanan kasklar) yüz gizlenmez; kask yüzeyi normaller boyunca
      //   biraz dışa itilir → kafa kaskın içinde kalır, içinden taşmaz
      if (L.key === 'kask' && (/^5_47\d\d_/.test(name) || (ir && ir !== race))) kaskSisir(m, 0.018);
      api.setPart(L.key, m, L.hide);
      rebUygula(api, 'parca:' + L.key, m, rb);
    }).catch(() => {}));
  }
  await Promise.all(jobs);
}

// Kanatlar yeni KO iskeleti için (eklem 15 = sırt) derilenmiş; bu client'ın 24 eklemli iskeletinde 15 = baş ucu.
// Kanadı göğüs eklemine (Chest2) bağlayıp sırta yerleştir.
function sirtaTak(api, mesh) {
  const g = mesh.geometry;
  for (const k of ['position', 'skinIndex', 'skinWeight']) g.setAttribute(k, g.attributes[k].clone());   // önbellekteki ortak veri bozulmasın
  const pos = g.attributes.position, n = pos.count;
  let y0 = Infinity, y1 = -Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < n; i++) { const y = pos.getY(i), z = pos.getZ(i), x = pos.getX(i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z1 = Math.max(z1, z); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const c2 = api.bind(2), nk = api.bind(13);
  const dx = c2[0] - (x0 + x1) / 2, dy = (c2[1] + nk[1]) / 2 - (y0 + y1) / 2 + 0.05, dz = c2[2] - 0.06 - z1;
  for (let i = 0; i < n; i++) pos.setXYZ(i, pos.getX(i) + dx, pos.getY(i) + dy, pos.getZ(i) + dz);
  pos.needsUpdate = true;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  for (let i = 0; i < n; i++) { si.setXYZW(i, 2, 0, 0, 0); sw.setXYZW(i, 1, 0, 0, 0); }
  si.needsUpdate = sw.needsUpdate = true;
  mesh.material.side = 2;   // çift yüz
}
