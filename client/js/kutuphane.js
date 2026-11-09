// Dünya editörü obje kütüphanesi (tools/convert/kutuphane.mjs çıktısı): tüm haritalardaki benzersiz nesneler.
// Yalnız GM kullanır, tembel yüklenir: kutup.json (dizin) + şekil başına mesh dosyası + doku başına dosya.
// sekilKur(ad) → KO koordinatında (dünya grubunun içine konacak) THREE.Group; aynı şeklin geometri / malzemesi paylaşılır.
import * as THREE from '../vendor/three.module.min.js';
import { decodeDXT } from './dxt.js';
import { addWind, addShine, loadFrames, kapiKareleri } from './objects.js';

export const KUTUP_TABAN = './assets/dunya-kutup';
const V = (u) => (window.KO_V ? window.KO_V(u) : u);
const RF = { ALPHA: 0x1, NOFOG: 0x2, DOUBLE: 0x4, NOLIGHT: 0x40 };
/** ikon atlası: 1024 ikon / dosya (32 × 32, 64 px) */
export const ikonAtlas = (id) => ({ dosya: `${KUTUP_TABAN}/ikonlar-${Math.floor(id / 1024)}.webp`, i: id % 1024 });
export const KATEGORI = [['yapi', 'Yapı'], ['cit', 'Duvar, çit, kapı'], ['bitki', 'Bitki & ağaç'], ['tas', 'Taş & kaya'], ['isik', 'Işık & ateş'], ['esya', 'Eşya & süs'], ['diger', 'Diğer']];

let K = null;
// canlı malzemeler (haritadaki gibi): rüzgârda sallanan bitkiler, parlayan kristaller, doku dizileri (örs halkası, kapı ateşi)
const ZAMAN = { value: 0 }, AKIS = [];
let akisRaf = 0;
function akisBaslat() {
  if (akisRaf) return;
  const d = () => { akisRaf = requestAnimationFrame(d); const t = performance.now() / 1000; ZAMAN.value = t;
    for (const f of AKIS) { const k = f.frames[(Math.floor(t * f.fps) + (f.bas || 0)) % f.frames.length]; if (k?.image && f.mat.map !== k) f.mat.map = k; } };
  akisRaf = requestAnimationFrame(d);
}
const KAPI_KARE = { el_bindpoint01_fire: 17, ka_bindpoint01_fire: 16, el_transgate01_fire: 15 };
function canliMalzeme(mat, f, ad) {
  if (f & 0x20) addWind(mat, ZAMAN);
  if (ad === 'obj_04el_guard_a002.dxt') addShine(mat, ZAMAN);
  const fb = /^(item_sb|item_table)0000\.dxt$/.exec(ad || ''); if (fb) AKIS.push({ mat, frames: loadFrames(fb[1], fb[1] === 'item_sb' ? 5 : 10), fps: 8 });
  const kf = /^(el_bindpoint01_fire|ka_bindpoint01_fire|el_transgate01_fire)(\d\d)\.dxt$/.exec(ad || ''); if (kf) { const n = KAPI_KARE[kf[1]]; AKIS.push({ mat, frames: kapiKareleri(kf[1], n), fps: 12, bas: Number(kf[2]) % n }); }
  if ((f & 0x20) || /^obj_04el_guard_a002|^(item_sb|item_table)0000|bindpoint01_fire|transgate01_fire/.test(ad || '')) akisBaslat();
}
/** dizin: { sekiller: [...], dokular, meshler, ad → şekil } */
export function kutup() {
  return (K ||= fetch(V(`${KUTUP_TABAN}/kutup.json`)).then((r) => { if (!r.ok) throw new Error('Obje kütüphanesi bulunamadı'); return r.json(); }).then((j) => {
    j.adla = new Map(j.sekiller.map((s) => [s.ad, s]));
    j.meshBas = new Map(); j.meshler.forEach((m, i) => { if (!j.meshBas.has(m.sk)) j.meshBas.set(m.sk, i); });
    return j;
  }).catch((e) => { K = null; throw e; }));
}
/** okunur ad: obj_el_treea → El treea; bat_catl_el_wal01 → catl el wal01 */
export function guzelAd(ad) {
  const t = ad.replace(/^(obj|bat\d?|cw|ft)_/, '').replace(/_+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const dokuP = new Map();
function doku(j, i) {
  if (i < 0 || !j.dokular[i]) return Promise.resolve(null);
  if (!dokuP.has(i)) dokuP.set(i, fetch(V(`${KUTUP_TABAN}/doku/${i}.bin`)).then((r) => r.arrayBuffer()).then((b) => {
    const d = j.dokular[i], u8 = new Uint8Array(b);
    const rgba = d.fmt === 'rgba' ? u8 : decodeDXT(u8, d.fmt, d.w, d.h);
    const t = new THREE.DataTexture(rgba, d.w, d.h, THREE.RGBAFormat);
    t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  }).catch(() => null));
  return dokuP.get(i);
}
const al4 = (n) => (n + 3) & ~3;
const sekilP = new Map();
/** şeklin paylaşılan parçaları: [{ geo, mat, matris }]. Ayrı seçilebilir parça (ust + pi): ana şeklin verisinden, kendi ortasına taşınmış */
function parcalar(j, s) {
  if (s.ust != null) {
    if (!sekilP.has(s.id)) sekilP.set(s.id, parcalar(j, j.sekiller[s.ust]).then((ps) => s.pi.map((i) => { const p = ps[i]; const m = p.matris.clone(); m.elements[12] -= s.merk[0]; m.elements[14] -= s.merk[1]; return { geo: p.geo, mat: p.mat, matris: m }; })));
    return sekilP.get(s.id);
  }
  if (!sekilP.has(s.id)) sekilP.set(s.id, (async () => {
    const b = await fetch(V(`${KUTUP_TABAN}/sekil/${s.id}.bin`)).then((r) => r.arrayBuffer());
    const geos = new Map();
    let o = 0;
    for (let mi = j.meshBas.get(s.id); mi != null && mi < j.meshler.length && j.meshler[mi].sk === s.id; mi++) {
      const { n, ni } = j.meshler[mi], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b, o, n * 3), 3)); o += n * 12;
      g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(b, o, n * 3), 3, true)); o += al4(n * 3);
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b, o, n * 2), 2)); o += n * 8;
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(b, o, ni), 1)); o += al4(ni * 2);
      g.computeBoundingSphere(); geos.set(mi, g);
    }
    return Promise.all(s.parca.map(async (p) => {
      const map = await doku(j, p.t), dm = j.dokular[p.t];
      const params = { map, color: new THREE.Color().setRGB(Math.min(1, p.d[0] || 1), Math.min(1, p.d[1] || 1), Math.min(1, p.d[2] || 1), THREE.SRGBColorSpace), side: p.f & RF.DOUBLE ? THREE.DoubleSide : THREE.FrontSide, fog: !(p.f & RF.NOFOG) };
      if (p.f & RF.ALPHA) { params.transparent = true; params.depthWrite = !(p.f & 0x100) && p.dst !== 2; params.alphaTest = 0.05; if (p.src === 2 && p.dst === 2) params.blending = THREE.AdditiveBlending; }   // KO: alfa parçası da Z yazar (RF_NOTZWRITE ve ek karışım hariç) — üst üste binen kubbeler yırtık görünmesin
      else if (dm?.alpha) params.alphaTest = 0.5;
      const mat = p.f & RF.NOLIGHT ? new THREE.MeshBasicMaterial(params) : new THREE.MeshLambertMaterial(params);
      canliMalzeme(mat, p.f, dm?.ad);
      return { geo: geos.get(p.m), mat, matris: new THREE.Matrix4().fromArray(p.mat) };
    }));
  })().catch((e) => { sekilP.delete(s.id); throw e; }));
  return sekilP.get(s.id);
}
/** yeni bir örnek (Group) — KO koordinatında, (0,0,0) şeklin dayanak noktası */
export async function sekilKur(ad) {
  const j = await kutup(); const s = j.adla.get(ad); if (!s) return null;
  const ps = await parcalar(j, s);
  const g = new THREE.Group(); g.name = 'kutup:' + ad; g.userData.kutu = s.kutu;
  if (s.fx?.length) g.userData.fx = s.fx;   // şeklin KO efektleri: [fxb, x, y, z, qx, qy, qz, qw, ölçek] (kütüphane uzayı)
  for (const p of ps) { if (!p.geo) continue; const m = new THREE.Mesh(p.geo, p.mat); m.matrixAutoUpdate = false; m.matrix.copy(p.matris); g.add(m); }
  return g;
}
