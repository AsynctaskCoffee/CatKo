// KO oyuncu karakterleri — CN3Chr/CN3Joint/CN3Skin karşılığı (iskelet animasyonu + deri).
// Eklem matrisleri Direct3D satır-vektör düzeninde hesaplanır (v' = v * M):
//   M = R(q) * S, satır 4 = konum, M *= ebeveyn;  son = ters(bağ pozu, kare 0) * M(t)
// Satır-düzenli D3D dizisi Three.js'in sütun-düzenli elements dizisine doğrudan yazılınca
// tam olarak gereken transpoz elde edilir.
import { sesAnim } from './ses.js';
import * as THREE from '../vendor/three.module.min.js';
import { decodeDXT, joinDXT } from './dxt.js';
import { mipChain } from './mips.js';
import { PART_RF } from './npc-rf.js';
// Storage/CDN önbelleği yüklemeden sonra eski meta dosyasını döndürmesin: 10 dakikalık sürüm parametresi
const tazele = () => `?t=${Math.floor(Date.now() / 600000)}`;

// ırk kodu (veritabanı) → model
export const RACE_MODEL = { 1: 'ka_at', 2: 'ka_tu', 3: 'ka_wt', 4: 'ka_pu', 6: 'ka_kurian', 11: 'el_ba', 12: 'el_rm', 13: 'el_rf', 14: 'el_kurian' };
const RACE_FALLBACK = { ka_pu: 'ka_tu', ka_kurian: 'ka_at', el_kurian: 'el_rm' };
const CLIP_FPS = 30;

let META = null, BASE = '';
const cache = new Map();
/** yüklenmekte olan tüm modeller (launcher bunlar bitene dek bekler); yükleme sürerken yeni eklenenler de beklenir */
export async function modellerHazir() { let n = -1; while (n !== cache.size) { n = cache.size; await Promise.allSettled([...cache.values()]); await new Promise((r) => setTimeout(r, 200)); } }
let S3TC = null;
const hasS3TC = () => { if (S3TC === null) { try { S3TC = !!document.createElement('canvas').getContext('webgl2')?.getExtension('WEBGL_compressed_texture_s3tc'); } catch { S3TC = false; } } return S3TC; };
function dxtTexture(bin, t, alpha) {
  let tex;
  const lv = (o, l) => t.split ? joinDXT(new Uint8Array(bin, o, l), t.fmt) : new Uint8Array(bin, o, l);
  if (hasS3TC()) {
    const fmt = t.fmt === 'dxt1' ? (alpha ? THREE.RGBA_S3TC_DXT1_Format : THREE.RGB_S3TC_DXT1_Format) : t.fmt === 'dxt3' ? THREE.RGBA_S3TC_DXT3_Format : THREE.RGBA_S3TC_DXT5_Format;
    tex = new THREE.CompressedTexture(t.levels.map(([o, l, w, h]) => ({ data: lv(o, l), width: w, height: h })), t.w, t.h, fmt);
    tex.minFilter = t.levels.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    if (t.rt) {   // mip zinciri arka planda üretilir, hazır olunca doku güncellenir
      const [o, l] = t.levels[0];
      mipChain(new Uint8Array(bin, o, l), t.fmt, t.w, t.h, { split: t.split, punch: t.fmt === 'dxt1' && alpha, cutoff: alpha ? 128 : 0 })
        .then((mips) => { tex.mipmaps = mips; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true; });
    }
  } else {
    const [o, l, w, h] = t.levels[0];
    tex = new THREE.DataTexture(decodeDXT(lv(o, l), t.fmt, w, h), w, h, THREE.RGBAFormat);
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;   // KO (D3D) varsayılanı WRAP: aynalı parçalar (Kurian/Portu) u<0 kullanır
  tex.needsUpdate = true;
  return tex;
}   // ırk -> Promise<{race, bin, textures}>

export async function loadCharacterMeta(base) {
  BASE = base;
  const r = await fetch(`${base}/meta.json`);
  if (!r.ok) return null;
  META = await r.json();
  return META;
}

function loadRace(race) { return loadRig(META.races[race], BASE, race); }

// KO karakter seçim animasyonları (ChrSelect, tools/convert/chrsecim.js): ırk başına sec0 (bekleme), sec1 (seçilince), sec2 (oyuna girerken ekrana yürüyüş)
let SECIM = null;
async function secimRig(race) {
  SECIM ||= fetch(`${BASE}/secim.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const m = await SECIM; if (!m?.races?.[race]) return null;
  return loadRig(m.races[race], BASE, 'sec_' + race);
}

let MON = null, MON_BASE = '';
export async function loadMonsterMeta(base) {
  MON_BASE = base;
  const r = await fetch(`${base}/meta.json`).catch(() => null);
  MON = r?.ok ? await r.json() : null;
  return MON;
}
export const hasMonster = (key) => !!MON?.models?.[key];
/** Canavar modeli (CN3Chr); oyuncu karakteriyle aynı iskelet/deri/animasyon sistemi */
export async function createMonster(key) {
  if (!hasMonster(key)) return null;
  const rig = await loadRig(MON.models[key], MON_BASE, key);
  const api = instantiate(rig, key, {});
  const pid = Number(String(key).replace(/^npc_/, ''));
  if (pid) api.sesPid = pid;
  return api;
}

// NPC modelleri (NPC_Looks.tbl → tools/convert/npcs.js): Storage'daki npc/modeller.json + npc_<pid>.bin
let NPC = null, NPC_BASE = '';
export async function loadNpcMeta(base) {
  NPC_BASE = base;
  const r = await fetch(`${base}/modeller.json${tazele()}`, { cache: 'no-cache' }).catch(() => null);   // Storage 1 sa önbellekler; her girişte doğrula
  NPC = r?.ok ? await r.json() : null;
  // deadsoft modelleri (Storage zones/npcds: NPC-MODEL-PAKETI ile yüklenir) eski Storage kaydının yerine geçer
  const ds = await fetch(`${base}ds/modeller.json${tazele()}`, { cache: 'no-cache' }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (ds?.models) { NPC ||= { version: 1, models: {} }; for (const [k, m] of Object.entries(ds.models)) NPC.models[k] = { ...m, _base: `${base}ds`, _ver: ds.stamp }; }
  // sitedeki düzeltilmiş modeller (assets/npcek: oyuncu görünümlü NPC'ler — upc_* animasyonları) Storage kaydının yerine geçer
  const e = await fetch(window.KO_V ? window.KO_V(`${NPC_EK}/modeller.json`) : `${NPC_EK}/modeller.json`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (e?.models) { NPC ||= { version: 1, models: {} }; for (const [k, m] of Object.entries(e.models)) NPC.models[k] = { ...m, _base: NPC_EK, _ver: e.stamp }; }
  return NPC;
}
const NPC_EK = new URL('../assets/npcek', import.meta.url).href.replace(/\/$/, '');
export const hasNpc = (key) => !!NPC?.models?.[key];
/** yüklü NPC/mob model anahtarları (npc_<pid>) — NPC editörünün model listesi */
export const npcModelAnahtarlari = () => Object.keys(NPC?.models || {});
export async function createNpc(key) {
  if (!hasNpc(key)) return null;
  const m = NPC.models[key]; const rig = await loadRig(m, m._base || NPC_BASE, key, m._ver || NPC.stamp);
  const api = instantiate(rig, key, {});
  const pid = Number(String(key).replace(/^npc_/, ''));
  if (pid) api.sesPid = pid;
  return api;
}

function loadRig(info, BASE, race, ver) {
  if (!cache.has(race)) cache.set(race, (async () => {
    const bin = await (await fetch(`${BASE}/${race}.bin${ver ? '?v=' + ver : ''}`)).arrayBuffer();
    const loader = new THREE.TextureLoader();
    const textures = await Promise.all(info.parts.map((p) => {
      if (!p.tex) return null;
      if (typeof p.tex === 'object') return dxtTexture(bin, p.tex, p.alpha);
      return loader.loadAsync(window.KO_V ? window.KO_V(`${BASE}/${p.tex}`) : `${BASE}/${p.tex}`).then((t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }).catch(() => null);
    }));
    // eklem anahtarları
    const joints = info.joints.map((j) => {
      const key = (k, comp) => {
        if (!k) return null;
        if (k.q === 16) { let q = new Int16Array(bin, k.off, k.n * comp); if (k.dq) { q = Int16Array.from(q); for (let i = comp; i < q.length; i++) q[i] += q[i - comp]; } const d = new Float32Array(q.length); for (let i = 0; i < q.length; i++) d[i] = q[i] / 32767; return { rate: k.rate, n: k.n, d }; }
        return { rate: k.rate, n: k.n, d: new Float32Array(bin, k.off, k.n * comp) };
      };
      return { name: j.name || "", parent: j.parent, pos: j.pos, rot: j.rot, scale: j.scale,
        kPos: key(j.kPos, 3), kRot: key(j.kRot, 4), kScale: key(j.kScale, 3), kOrient: key(j.kOrient, 4) };
    });
    // geometri
    const geos = info.parts.map((p) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, p.pos, p.vc * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(bin, p.nrm, p.vc * 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, p.uv, p.vc * 2), 2));
      g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(bin, p.si, p.vc * 4), 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(bin, p.sw, p.vc * 4), 4));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, p.idx, p.ic), 1));
      return g;
    });
    const rig = { info, joints, geos, textures };
    rig.inverse = evalPose(rig, 0).map(invert);
    return rig;
  })());
  return cache.get(race);
}

// ---------------- D3D matematiği (satır-düzenli 4x4)
function keyVec(k, frm, out, comp) {
  if (!k) return false;
  let t = frm * (k.rate / 30); let i = Math.floor(t);
  if (i < 0) i = 0;
  if (i >= k.n - 1) { i = k.n - 1; t = i; }
  const f = t - i, a = i * comp, b = Math.min(i + 1, k.n - 1) * comp, d = k.d;
  if (comp === 3) { for (let c = 0; c < 3; c++) out[c] = d[a + c] + (d[b + c] - d[a + c]) * f; return true; }
  // slerp
  let ax = d[a], ay = d[a + 1], az = d[a + 2], aw = d[a + 3], bx = d[b], by = d[b + 1], bz = d[b + 2], bw = d[b + 3];
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let s0 = 1 - f, s1 = f;
  if (cos < 0.9995) { const th = Math.acos(cos), sn = Math.sin(th); s0 = Math.sin((1 - f) * th) / sn; s1 = Math.sin(f * th) / sn; }
  out[0] = ax * s0 + bx * s1; out[1] = ay * s0 + by * s1; out[2] = az * s0 + bz * s1; out[3] = aw * s0 + bw * s1;
  return true;
}
// D3DXQuaternionMultiply(q1, q2) = q1 döndürmesinden sonra q2
function qmul(q1, q2) {
  const [x1, y1, z1, w1] = q1, [x2, y2, z2, w2] = q2;
  return [w2 * x1 + x2 * w1 + y2 * z1 - z2 * y1, w2 * y1 - x2 * z1 + y2 * w1 + z2 * x1,
    w2 * z1 + x2 * y1 - y2 * x1 + z2 * w1, w2 * w1 - x2 * x1 - y2 * y1 - z2 * z1];
}
function mulRow(a, b, o = new Float32Array(16)) {   // a * b (o: çıktı; a/b ile aynı olmamalı)
  for (let r = 0; r < 4; r++) {
    const a0 = a[r * 4], a1 = a[r * 4 + 1], a2 = a[r * 4 + 2], a3 = a[r * 4 + 3];
    for (let c = 0; c < 4; c++) o[r * 4 + c] = a0 * b[c] + a1 * b[4 + c] + a2 * b[8 + c] + a3 * b[12 + c];
  }
  return o;
}
function invert(m) { const t = new THREE.Matrix4().fromArray(m).invert(); return Float32Array.from(t.elements); }

const tv = [0, 0, 0], tq = [0, 0, 0, 1], ts = [1, 1, 1], to = [0, 0, 0, 1];
// performans: her karede yeni dizi üretilmez (çöp toplayıcı takılması yok) — out ve tmp örneğe özel tamponlar
const _qo = [0, 0, 0, 1];
function evalPose(rig, frm, out = rig.joints.map(() => new Float32Array(16)), m = new Float32Array(16)) {
  rig.joints.forEach((j, i) => {
    const p = keyVec(j.kPos, frm, tv, 3) ? tv : j.pos;
    let q = keyVec(j.kRot, frm, tq, 4) ? tq : j.rot;
    const s = keyVec(j.kScale, frm, ts, 3) ? ts : j.scale;
    if (keyVec(j.kOrient, frm, to, 4)) { const r = qmul(q, to); _qo[0] = r[0]; _qo[1] = r[1]; _qo[2] = r[2]; _qo[3] = r[3]; q = _qo; }
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const o = j.parent >= 0 ? m : out[i];
    o[0] = (1 - 2 * (y * y + z * z)) * s[0]; o[1] = 2 * (x * y + z * w) * s[1]; o[2] = 2 * (x * z - y * w) * s[2]; o[3] = 0;
    o[4] = 2 * (x * y - z * w) * s[0]; o[5] = (1 - 2 * (x * x + z * z)) * s[1]; o[6] = 2 * (y * z + x * w) * s[2]; o[7] = 0;
    o[8] = 2 * (x * z + y * w) * s[0]; o[9] = 2 * (y * z - x * w) * s[1]; o[10] = (1 - 2 * (x * x + y * y)) * s[2]; o[11] = 0;
    o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1;
    if (j.parent >= 0) mulRow(m, out[j.parent], out[i]);
  });
  return out;
}

/** ırk kodu → iskelet modeli anahtarı (yedeğiyle) */
export function raceKey(raceCode) {
  if (!META) return null; let r = RACE_MODEL[raceCode]; if (!r) return null;
  if (!META.races[r]) r = META.races[RACE_FALLBACK[r]] ? RACE_FALLBACK[r] : null;
  return r;
}
/** başka ırkın iskeletine derilenmiş zırh/kostüm parçasını karakterin iskeletine uyarlar (KO CN3CPart derileri eklem-yerel olduğundan
 *  aynı parça her ırkta o ırkın ölçüsüne oturur): p' = Σ w · p · Bkaynak⁻¹ · Bhedef. Önbellekteki ortak veri bozulmasın diye kopyalanır. */
export async function retargetPart(mesh, srcRaceCode, api) {
  const sk = raceKey(srcRaceCode); if (!sk || sk === api.race || !api.rigInv) return false;
  const src = await loadRace(sk).catch(() => null); if (!src || src.inverse.length !== api.rigInv.length) return false;
  const M = src.inverse.map((inv, j) => new THREE.Matrix4().fromArray(mulRow(inv, invert(api.rigInv[j]))));
  const N = M.map((m) => new THREE.Matrix3().setFromMatrix4(m));
  const g = mesh.geometry;
  const pos = g.attributes.position.clone(), nrm = g.attributes.normal.clone(), si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const v = new THREE.Vector3(), t = new THREE.Vector3(), acc = new THREE.Vector3(), n = new THREE.Vector3(), nacc = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(g.attributes.position, i); n.fromBufferAttribute(g.attributes.normal, i);
    acc.set(0, 0, 0); nacc.set(0, 0, 0); let ws = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (!(w > 0)) continue; const j = si.getComponent(i, k); if (!M[j]) continue;
      acc.addScaledVector(t.copy(v).applyMatrix4(M[j]), w); nacc.addScaledVector(t.copy(n).applyMatrix3(N[j]), w); ws += w;
    }
    if (ws > 0) { pos.setXYZ(i, acc.x / ws, acc.y / ws, acc.z / ws); nacc.normalize(); nrm.setXYZ(i, nacc.x, nacc.y, nacc.z); }
  }
  g.setAttribute('position', pos); g.setAttribute('normal', nrm); g.computeBoundingSphere();
  return true;
}

/** Yeni karakter örneği. group KO yerel koordinatlarında (dünya grubunun içine eklenir). */
/** Irkın seçilebilir yüz/saç sayıları */
export function appearanceOptions(raceCode) {
  const want = RACE_MODEL[raceCode]; const race = META && (META.races[want] ? want : META.races[RACE_FALLBACK[want]] ? RACE_FALLBACK[want] : Object.keys(META.races)[0]);
  const parts = race ? META.races[race].parts.map((p) => p.part) : [];
  return { faces: parts.filter((p) => /^face\d\d$/.test(p)).length || 1, hairs: parts.filter((p) => /^hair\d\d$/.test(p)).length || 1 };
}

export async function createCharacter(raceCode, look = {}) {
  if (!META) return null;
  let race = RACE_MODEL[raceCode] || 'ka_at';
  if (!META.races[race]) race = META.races[RACE_FALLBACK[race]] ? RACE_FALLBACK[race] : Object.keys(META.races)[0];
  if (!race) return null;
  const rig = await loadRace(race);
  const api = instantiate(rig, race, look);
  api.sesIrk = Number(raceCode);
  if (look.secim) { const sr = await secimRig(race).catch(() => null); if (sr && sr.joints.length === rig.joints.length) api.animKaynak(sr); }
  return api;
}

function instantiate(rig, race, look) {  const bones = rig.joints.map(() => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; return b; });
  const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
  const group = new THREE.Group();
  rig.info.parts.forEach((p, i) => {
    // KO malzeme bayrakları (CN3CPart::Render): saydam karışım / çift yüz / ışıksız; alfa testi D3DCMP_GREATER 0 (yalnız tam saydam pikseller atılır)
    const rf = PART_RF[p.part];
    const mat = rf == null
      ? new THREE.MeshLambertMaterial({ map: rig.textures[i], alphaTest: p.alpha ? 0.5 : 0, alphaToCoverage: !!p.alpha, side: THREE.FrontSide })
      : new (rf & 64 ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial)({ map: rig.textures[i], alphaTest: rf & 1 ? 0.01 : (p.alpha ? 0.04 : 0), transparent: !!(rf & 1), depthWrite: !(rf & 1), side: rf & 4 ? THREE.DoubleSide : THREE.FrontSide });
    const mesh = new THREE.SkinnedMesh(rig.geos[i], mat);
    if (rf & 1) mesh.renderOrder = 3;
    mesh.bindMode = THREE.DetachedBindMode;
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false; mesh.name = p.part;
    group.add(mesh);
  });
  // (5.11) KO saç rengi birebir: doku × renk koyu saçta rengi kaybettiriyordu → dokunun parlaklığı (detay) korunup renk seçilen renge çekilir
  const sacBoya = (mat, renk) => {
    if (!mat.userData.sacU) {
      const U = mat.userData.sacU = { uSacRenk: { value: new THREE.Color(1, 1, 1) }, uSacAcik: { value: 0 } };
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.fragmentShader = 'uniform vec3 uSacRenk;\nuniform float uSacAcik;\n' + sh.fragmentShader.replace('#include <map_fragment>',
          '#include <map_fragment>\n#ifdef USE_MAP\nif (uSacAcik > 0.5) { float sacL = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = uSacRenk * clamp(sacL * 2.6, 0.0, 1.35); }\n#endif');
      };
      mat.customProgramCacheKey = () => 'sacRenk';
      mat.needsUpdate = true;
    }
    mat.color?.setHex(0xffffff);
    if (renk != null) { mat.userData.sacU.uSacRenk.value.setHex(Number(renk) & 0xffffff); mat.userData.sacU.uSacAcik.value = 1; }
    else mat.userData.sacU.uSacAcik.value = 0;
  };
  const hasFaceNN = rig.info.parts.some((p) => /^face\d\d$/.test(p.part));
  let sacRenk = look?.sacRenk ?? null;   // KO "Change Hair Color": saç parçalarının malzeme rengi (doku × renk); null = özgün
  const setLook = ({ face = 0, hair = 0, sacRenk: sr } = {}) => {
    if (sr !== undefined) sacRenk = sr;
    const fn = 'face' + String(face).padStart(2, '0'), hn = 'hair' + String(hair).padStart(2, '0');
    const faces = group.children.filter((m) => /^face\d\d$/.test(m.name)), hairs = group.children.filter((m) => /^hair\d\d$/.test(m.name));
    const fOk = faces.some((m) => m.name === fn), hOk = hairs.some((m) => m.name === hn);
    for (const m of group.children) {
      if (m.userData.hidBy) { m.userData.wasVisible = /^face\d\d$/.test(m.name) ? m.name === (fOk ? fn : 'face00') : /^hair\d\d$/.test(m.name) ? m.name === (hOk ? hn : 'hair00') : m.userData.wasVisible; continue; }
      if (/^face\d\d$/.test(m.name)) m.visible = m.name === (fOk ? fn : 'face00');
      else if (/^hair\d\d$/.test(m.name)) m.visible = m.name === (hOk ? hn : 'hair00');
      else if (m.name === 'face') m.visible = !hasFaceNN;
    }
    for (const m of group.children) if (/^hair\d\d$/.test(m.name) && m.material) sacBoya(m.material, sacRenk);
  };
  setLook(look);
  // klipler: {s, e, fps, loop, strike} (kare) — eski biçim [a, b] anahtar aralığı da desteklenir
  const C = {};
  for (const [k, v] of Object.entries(rig.info.clips)) C[k] = Array.isArray(v) ? { s: v[0] * 2, e: v[1] * 2, fps: 30, loop: true, blend: 0.2 } : v;
  let clip = C.breath ? 'breath' : Object.keys(C)[0], t = 0;
  let once = null;                 // {name, t, strike, onStrike, onDone, hold, struck}
  let fromPose = null, blendT = 0, blendLen = 0;
  const frameOf = (c, tt) => {
    const len = Math.max(0.001, c.e - c.s);
    return c.loop ? c.s + (tt % len) : c.s + Math.min(tt, len);
  };
  // tamponlar: poz (her kare yeniden yazılır), geçiş başlangıç pozu (kopya), kemik/plug matris geçicisi
  const poseBuf = rig.joints.map(() => new Float32Array(16)), fromBuf = rig.joints.map(() => new Float32Array(16)), tmpM = new Float32Array(16), tmpB = new Float32Array(16);
  const startBlend = (to) => { if (lastPose) { for (let i = 0; i < fromBuf.length; i++) fromBuf[i].set(lastPose[i]); fromPose = fromBuf; } else fromPose = null; blendLen = Math.max(0.05, C[to]?.blend || 0.15); blendT = 0; };
  let lastPose = null, animRig = null;
  // (3.11) KO CN3Chr silah izi (궤적): klibin fFrmPlugTraceStart…End aralığında, plug'ın (0,t0,0)-(0,t1,0) çizgisi
  // şimdiki kareden geriye 0,2'şer kare aralıklarla n kez (iskelet o karelerde yeniden hesaplanır) — grup yerel konumlar
  const izDurum = { c: null, frame: 0, rig: null }, izPoz = rig.joints.map(() => new Float32Array(16)), izM = new Float32Array(16), izT = new Float32Array(16);
  const plugs = new Map();   // anahtar → {obj, joint, M}  (silahlar: eklem matrisine bağlı)
  const extras = new Set();  // bağlı canlı modeller (kanat vb.): her karede güncellenir
  const api = {
    group, race, setLook, skeleton, rigInv: rig.inverse, eklemAdlari: rig.joints.map((j) => j.name || ''),
    /** KO eklem dünya matrisi (satır düzenli, grup yerel) */
    joint: (i) => lastPose?.[i],
    /** bağ pozunda eklem konumu (grup yerel) */
    bind: (i) => { const m = new THREE.Matrix4().fromArray(rig.inverse[i]).invert().elements; return [m[12], m[13], m[14]]; },
    plugObj: (key) => plugs.get(key)?.obj || null,
    plugM: (key) => plugs.get(key)?.M || null,
    /** silah izi: klip iz aralığındaysa out'a (Float32Array n*2*3) [alt, üst] noktaları yazar ve true döner */
    // (4.11) fBas verilirse yalnız fBas → şimdiki kare arası örneklenir (dünyada kalan iz için); dönüş: şimdiki kare (iz dışında false)
    izNoktalar(key, t0, t1, n, out, fBas = null) {
      const p = plugs.get(key), c = izDurum.c; if (!p || !c || !(c.te > c.ts) || !izDurum.rig) return false;
      const f = izDurum.frame; if (f < c.ts || f > c.te) return false;
      const bas = fBas != null && fBas >= c.ts && fBas <= f ? fBas : c.ts;
      for (let j = 0; j < n; j++) {
        const fr = f - (f - bas) * j / Math.max(1, n - 1);   // (4.11) KO CN3Chr: iz, başlangıç karesinden şimdiki kareye n adıma bölünür
        const pose = evalPose(izDurum.rig, fr, izPoz, izM);
        const m = mulRow(p.M, pose[p.joint], izT);
        for (let k = 0; k < 2; k++) { const y = k ? t1 : t0, o = (j * 2 + k) * 3; out[o] = y * m[4] + m[12]; out[o + 1] = y * m[5] + m[13]; out[o + 2] = y * m[6] + m[14]; }
      }
      return f || 1e-6;
    },   // eklem → takı matrisi (GM dönüşümünde silahı canavarın eline taşımak için)
    addExtra(fn) { extras.add(fn); return () => extras.delete(fn); },
    setPlug(key, obj, joint, M) {
      const old = plugs.get(key); if (old) { old.obj.removeFromParent(); plugs.delete(key); }
      if (!obj || !(joint >= 0) || joint >= rig.joints.length) return;
      obj.matrixAutoUpdate = false; obj.userData.plugKey = key; group.add(obj); plugs.set(key, { obj, joint, M: Float32Array.from(M) });
      if (lastPose) obj.matrix.fromArray(mulRow(plugs.get(key).M, lastPose[joint]));
    },
    /** zırh parçası: aynı ada sahip çıplak parçayı gizler (null → geri getirir). hide: ek gizlenecek adlar (kask → saç) */
    setPart(key, mesh, hide = []) {
      const old = group.children.find((m) => m.userData.gear === key); if (old) old.removeFromParent();
      for (const m of group.children) if (m.userData.hidBy === key) { m.visible = m.userData.wasVisible; delete m.userData.hidBy; }
      if (!mesh) return;
      for (const m of group.children) if (!m.userData.gear && (hide.includes(m.name) || hide.some((h) => h.endsWith('*') && m.name.startsWith(h.slice(0, -1))))) {
        if (m.userData.hidBy) continue; m.userData.wasVisible = m.visible; m.userData.hidBy = key; m.visible = false;
      }
      mesh.userData.gear = key; mesh.bindMode = THREE.DetachedBindMode; mesh.bind(skeleton, new THREE.Matrix4()); mesh.frustumCulled = false; group.add(mesh);
    },
    /** başka bir eklem dosyasının kliplerini oynat (seçim ekranı): bağ pozu bu modelden, anahtarlar o dosyadan */
    animKaynak(r) { animRig = r; if (r) { for (const [k, v] of Object.entries(r.info.clips)) C[k] = v; if (C.sec0) { clip = 'sec0'; t = Math.random() * 20; } } },
    has: (name) => !!C[name],
    sure: (name) => (C[name] ? (C[name].e - C[name].s) / C[name].fps : 0),
    setClip(name) { if (name !== clip && C[name]) { startBlend(name); clip = name; t = 0; } },
    get clip() { return once ? once.name : clip; },
    get busy() { return !!once && !once.hold; },

    /** tek seferlik klip (saldırı, darbe, ölüm); vuruş anında onStrike, bitince onDone */
    playOnce(name, { onStrike, onDone, hold = false, speed = 1, bas = 0 } = {}) {
      const sv = sesAnim(api, name);   // KO sesi: saldırıda vuruş karesinde, darbe / ölümde hemen
      if (!C[name]) { sv?.(); onStrike?.(); onDone?.(); return false; }
      // bas: klibin baştan atlanacak kısmı (kare; ör. okçu atışında sadağa uzanma bölümü atlanır)
      startBlend(name); once = { name, t: Math.max(0, Math.min(Number(bas) || 0, C[name].e - C[name].s - 1)), onStrike: sv ? () => { sv(); onStrike?.(); } : onStrike, onDone, hold, speed, struck: false }; return true;
    },
    /** klip kare bilgisi: başlangıç / bitiş / vuruş karesi, fps */
    klipBilgi(name) { const c = C[name]; return c ? { s: c.s, e: c.e, strike: c.strike, fps: c.fps } : null; },
    /** oynayan tek seferlik klibin hızını değiştir (ör. madencilikte kazma inerken hızlanır) */
    setOnceSpeed(sp) { if (once) once.speed = sp; },
    // tek seferlik animasyonun anlık durumu (envanterdeki karakter önizlemesi oyundakiyle aynı kareyi oynatsın: madencilik, beceri vb.)
    onceBilgi() { return once ? { name: once.name, t: once.t, speed: once.speed } : null; },
    onceEsitle(b) {
      if (!b || !C[b.name]) { if (once) this.stopOnce(); return; }
      if (!once || once.name !== b.name) { startBlend(b.name); once = { name: b.name, t: b.t, speed: b.speed, hold: true, struck: true }; }
      else { once.t = b.t; once.speed = b.speed; }
    },
    /** tek seferlik klibi bitir; anlik: geçişsiz (dirilince yerdeki ölü pozu hemen kalkar) */
    stopOnce(anlik = false) { if (once) { if (anlik) { fromPose = null; blendT = 1e9; } else startBlend(clip); once = null; } },
    /** (7.11) geçişi iptal: sonraki kare doğrudan şimdiki klipten (yeniden doğan mob ölü pozundan kalkıyormuş gibi görünmesin) */
    blendIptal() { fromPose = null; blendT = 1e9; },
    update(dt, speedMul = 1) {
      let frame;
      if (once) {
        const c = C[once.name];
        once.t += dt * c.fps * once.speed;
        frame = frameOf(c, once.t);
        if (!once.struck && c.strike && frame >= c.strike) { once.struck = true; once.onStrike?.(); }
        if (once.t >= c.e - c.s) {
          if (!once.struck) { once.struck = true; once.onStrike?.(); }
          const done = once.onDone; if (!once.hold) { startBlend(clip); once = null; } else frame = c.e;
          done?.(); if (once) once.onDone = null;
        }
      }
      if (!once) { const c = C[clip]; t += dt * c.fps * speedMul; frame = frameOf(c, t); }
      const pozRig = animRig && /^sec/.test(once ? once.name : clip) ? animRig : rig;
      const pose = evalPose(pozRig, frame, poseBuf, tmpM);
      izDurum.c = once ? C[once.name] : C[clip]; izDurum.frame = frame; izDurum.rig = pozRig;
      if (fromPose && blendT < blendLen) {
        blendT += dt; const w = Math.min(1, blendT / blendLen);
        for (let i = 0; i < pose.length; i++) { const a = fromPose[i], m = pose[i]; for (let k = 0; k < 16; k++) m[k] = a[k] + (m[k] - a[k]) * w; }
      }
      lastPose = pose;
      for (let i = 0; i < bones.length; i++) bones[i].matrixWorld.fromArray(mulRow(rig.inverse[i], pose[i], tmpB));
      for (const p of plugs.values()) p.obj.matrix.fromArray(mulRow(p.M, pose[p.joint], tmpB));
      for (const f of extras) f(dt);
    },
  };
  api.update(0);
  return api;
}

// ---------------- eşya modelleri (silah/kalkan: CN3CPlug, zırh: oyuncu iskeletine derili CN3CPart)
let GEAR = null, GEAR_BASE = '';
const gearBins = new Map();
export async function loadGearMeta(base) {
  GEAR_BASE = base;
  const r = await fetch(`${base}/esya.json${tazele()}`, { cache: 'no-cache' }).catch(() => null);
  GEAR = r?.ok ? await r.json() : null;
  return GEAR;
}
export const gearMeta = () => GEAR;
// ek plug paketleri (ör. assets/kolluk — KO klan derece kollukları): GEAR'dan bağımsız, kendi klasöründen
const EK_PLUG = new Map();
export function ekPlugYukle(base) {
  return fetch(`${base}/esya.json`).then((r) => r.json()).then((j) => { for (const [k, v] of Object.entries(j.plugs || {})) EK_PLUG.set(k, { info: v, base, stamp: j.stamp }); return true; });
}
function gearBin(file, ek = null) {
  if (!gearBins.has(file)) gearBins.set(file, fetch(ek ? `${ek.base}/${file}.bin?v=${ek.stamp || ''}` : `${GEAR_BASE}/${file}.bin?v=${GEAR?.stamp || ''}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).catch((e) => { gearBins.delete(file); throw e; }));
  return gearBins.get(file);
}
async function gearTexture(bin, p) {
  if (!p.tex) return null;
  if (typeof p.tex === 'object') return dxtTexture(bin, p.tex, p.alpha);
  const t = await new THREE.TextureLoader().loadAsync(`${GEAR_BASE}/${p.tex}`).catch(() => null);
  if (t) { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
// önbellek: aynı eşya (oyuncuda, envanter önizlemesinde, diğer oyuncularda) bir kez indirilir/çözülür ve GPU'ya bir kez yüklenir.
// Her örnek kendi BufferGeometry + malzemesini alır (reb parlaması, kanat/ırk uyarlaması örneğe özel), köşe verisi ve doku ortaktır.
const gearTex = new Map(), gearAttr = new Map();
function texOnce(key, bin, p) { if (!gearTex.has(key)) gearTex.set(key, gearTexture(bin, p)); return gearTex.get(key); }
function attrsOf(key, bin, p, skinned) {
  if (!gearAttr.has(key)) {
    const a = {
      position: new THREE.BufferAttribute(new Float32Array(bin, p.pos, p.vc * 3), 3),
      normal: new THREE.BufferAttribute(new Float32Array(bin, p.nrm, p.vc * 3), 3),
      uv: new THREE.BufferAttribute(new Float32Array(bin, p.uv, p.vc * 2), 2),
      index: new THREE.BufferAttribute(new Uint16Array(bin, p.idx, p.ic), 1),
    };
    if (skinned) { a.skinIndex = new THREE.Uint8BufferAttribute(new Uint8Array(bin, p.si, p.vc * 4), 4); a.skinWeight = new THREE.BufferAttribute(new Float32Array(bin, p.sw, p.vc * 4), 4); }
    gearAttr.set(key, a);
  }
  const a = gearAttr.get(key), geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) if (a[k]) geo.setAttribute(k, a[k]);
  geo.setIndex(a.index);
  return geo;
}
/** silah modeli: {obj, info} */
export async function createPlug(name) {
  const ek = GEAR?.plugs?.[name] ? null : EK_PLUG.get(name) || null;
  const info = GEAR?.plugs?.[name] || ek?.info; if (!info) return null;
  const bin = await gearBin('p_' + name, ek);
  const g = new THREE.Group();
  const texs = await Promise.all(info.parts.map((p, i) => texOnce('p_' + name + ':' + i, bin, p)));
  info.parts.forEach((p, i) => {
    const mat = new THREE.MeshLambertMaterial({ map: texs[i], alphaTest: p.alpha ? 0.5 : 0, side: THREE.DoubleSide });
    const m = new THREE.Mesh(attrsOf('p_' + name + ':' + i, bin, p, false), mat); m.frustumCulled = false; g.add(m);
  });
  return { obj: g, info };
}
/** zırh parçası (derili) */
export async function createGearPart(name) {
  const p = GEAR?.parts?.[name]; if (!p) return null;
  const bin = await gearBin('z_' + name);
  const mat = new THREE.MeshLambertMaterial({ map: await texOnce('z_' + name, bin, p), alphaTest: p.alpha ? 0.5 : 0, alphaToCoverage: !!p.alpha });
  return new THREE.SkinnedMesh(attrsOf('z_' + name, bin, p, true), mat);
}
/** eşya dosyalarını önceden indir (oyuna girişte kuşanılı eşyalar beklemeden görünsün) */
export function preloadGear(names) { for (const n of names) { if (GEAR?.plugs?.[n]) gearBin('p_' + n).catch(() => {}); else if (GEAR?.parts?.[n]) gearBin('z_' + n).catch(() => {}); } }

// ---------------- kanat / arkalık modelleri (Wing.tbl → chr\*.n3chr, kendi iskeleti ve animasyonu var)
let KANAT = null, KANAT_BASE = '';
export async function loadKanatMeta(base) {
  KANAT_BASE = base;
  const r = await fetch(`${base}/kanat.json${tazele()}`, { cache: 'no-cache' }).catch(() => null);
  KANAT = r?.ok ? await r.json() : null;
  return KANAT;
}
export const kanatFor = (org) => KANAT?.items?.[org] || null;
/** KO 2369 animasyonlu silah (Item\\*.n3chrplug → chr\\*.n3chr): plug adı → [model, eklem, matris16] */
export const silahFor = (n) => KANAT?.silah?.[n] || null;
export async function createKanat(name) {
  const info = KANAT?.models?.[name]; if (!info) return null;
  const rig = await loadRig(info, KANAT_BASE, 'w_' + name, KANAT.stamp);
  const w = await instantiate(rig, 'w_' + name, {});
  // kanatlar tek katman: iç yüzey de görünsün
  w?.group?.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) { m.side = THREE.DoubleSide; m.needsUpdate = true; } });
  return w;
}
