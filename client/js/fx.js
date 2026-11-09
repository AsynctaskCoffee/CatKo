// KO efekt motoru (CN3FXBundle karşılığı): billboard, parçacık, mesh ve zemin parçaları.
// Veri: assets/fx/fx.json (tools/convert/fx.js), dokular kare şeritleri (webp), şekil meshleri fx_mesh.bin.
// Kaynak davranışı: ko4life-net/ko N3FXBundle / N3FXPart* Tick() fonksiyonları.
import { sesFx } from './ses.js';
import * as THREE from '../vendor/three.module.min.js';

const BLEND = [null, THREE.ZeroFactor, THREE.OneFactor, THREE.SrcColorFactor, THREE.OneMinusSrcColorFactor, THREE.SrcAlphaFactor,
  THREE.OneMinusSrcAlphaFactor, THREE.DstAlphaFactor, THREE.OneMinusDstAlphaFactor, THREE.DstColorFactor, THREE.OneMinusDstColorFactor];
const RF = { ALPHA: 0x1, DOUBLE: 0x4, BOARD_Y: 0x8, NOZWRITE: 0x100, NOZBUF: 0x400 };

let LIB = null, BASE = '', MESH = null;
const texCache = new Map();
// tek yükleme: eşzamanlı çağrılar aynı sözü bekler (yoksa sonradan biten yükleme, fxEkle ile eklenmiş kütüphaneleri — pet/mob/peri/pathos — silerdi)
let LIB_P = null;
export function loadFX(base = './assets/fx') {
  if (LIB) return Promise.resolve(LIB);
  return (LIB_P ||= (async () => {
    BASE = base;
    const [j, m] = await Promise.all([fetch(`${base}/fx.json`).then((r) => r.json()), fetch(`${base}/fx_mesh.bin`).then((r) => r.arrayBuffer()).catch(() => null)]);
    LIB = j; MESH = m; return LIB;
  })().catch((e) => { LIB_P = null; throw e; }));
}
export const fxReady = () => !!LIB;
/** ek efekt kütüphanesi (ör. mob/NPC efektleri: assets/fxmob): bundle, doku ve şekiller ana kütüphaneye eklenir; mesh verisi ana tamponun sonuna */
const ekler = new Map();
/** ust: true → aynı adlı bundle / doku / şekil / kimlikler bu kütüphaneyle değiştirilir (ör. orijinal KO eşya efektleri: assets/fxesyaorj) */
export function fxEkle(base, { ust = false } = {}) {
  if (!ekler.has(base)) ekler.set(base, (async () => {
    if (!LIB) await loadFX();
    const q = /^https?:/.test(base) ? `?t=${Math.floor(Date.now() / 600000)}` : '';   // uzak (Storage) efektler: CDN önbelleği
    const [j, m] = await Promise.all([fetch(`${base}/fx.json${q}`).then((r) => r.json()), fetch(`${base}/fx_mesh.bin${q}`).then((r) => r.arrayBuffer()).catch(() => null)]);
    let off = 0;
    if (m && m.byteLength) {
      const a = MESH ? MESH.byteLength : 0; off = Math.ceil(a / 4) * 4;
      const yeni = new Uint8Array(off + m.byteLength); if (MESH) yeni.set(new Uint8Array(MESH), 0); yeni.set(new Uint8Array(m), off); MESH = yeni.buffer;
    }
    LIB.shapes ||= {}; LIB.ids ||= {};
    for (const [k, sh] of Object.entries(j.shapes || {})) if (ust || !(k in (LIB.shapes ||= {}))) LIB.shapes[k] = sh && { ...sh, parts: sh.parts.map((sp) => ({ ...sp, pos: sp.pos + off, uv: sp.uv + off, idx: sp.idx + off })) };
    for (const [k, t] of Object.entries(j.tex || {})) if (ust || !LIB.tex[k]) LIB.tex[k] = { ...t, f: `${base}/${t.f}` };
    for (const [k, b] of Object.entries(j.bundles || {})) if (ust || !LIB.bundles[k]) LIB.bundles[k] = b;
    for (const [k, v] of Object.entries(j.ids || {})) if (ust || !((LIB.ids ||= {})[k])) LIB.ids[k] = v;   // fx.tbl kimlikleri (ör. guidefx 13062)
    return true;
  })());
  return ekler.get(base);
}
export const hasFX = (id) => !!LIB?.ids?.[id];
/** efektin kendi parçalarındaki en yüksek y ofseti (ör. eski NPC simgeleri y=3 ile gelir; 2009 sonrası olanlar 0 → başın üstüne konur) */
export const fxEnDusuk = (id) => { const b = LIB?.bundles?.[LIB?.ids?.[id] ?? id]; return b ? Math.min(...b.parts.map((q) => q.pos?.[1] || 0)) : 0; };
export const fxEnYuksek = (id) => { const b = LIB?.bundles?.[LIB?.ids?.[id] ?? id]; return b ? Math.max(0, ...b.parts.map((q) => q.pos?.[1] || 0)) : 0; };
/** eklemeli (src*, dst ONE) parlak billboard efekti mi (uniq_ice, uniq_lightning…): kartı doku tamamen doldurur, aynı boyda daha iri görünür */
/** demet yalnız kameraya bakan kartlardan (billboard) mı oluşuyor (ör. eski KO NPC simgeleri npc_effect_old_*) — bunlar döndürülmez */
export const fxSadeceKart = (id) => { const b = LIB?.bundles?.[LIB?.ids?.[id] ?? id]; return !!b && b.parts.length > 0 && b.parts.every((q) => q.type === 2); };
export const fxParlak = (id) => { const b = LIB?.bundles?.[LIB?.ids?.[id]]; const p = b?.parts?.find((x) => x.type === 2); return !!p && p.dst === 2; };

// doku şeridi: resim bir kez yüklenir, her parça kendi Texture nesnesini (kendi kare ofsetiyle) kullanır
const imgCache = new Map();
function atlas(key) {
  const t = LIB?.tex?.[key]; if (!t) return null;
  if (!imgCache.has(key)) {
    const e = { img: null, wait: [] }; imgCache.set(key, e);
    new THREE.ImageLoader().load(t.f.includes('/') ? t.f : `${BASE}/${t.f}`, (img) => { e.img = img; for (const tx of e.wait) { tx.image = img; tx.needsUpdate = true; } e.wait.length = 0; });
  }
  const e = imgCache.get(key);
  return { n: t.n, cols: t.cols, rows: t.rows, make() {
    const tx = new THREE.Texture(); tx.flipY = false; tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
    if (e.img) { tx.image = e.img; tx.needsUpdate = true; } else e.wait.push(tx);
    return tx;
  } };
}
function material(p, a, vertexColors = false) {
  const m = new THREE.MeshBasicMaterial({ map: a ? a.make() : null, transparent: true, depthWrite: !(p.flags & RF.NOZWRITE) && !p.alpha, depthTest: !(p.flags & RF.NOZBUF),
    side: THREE.DoubleSide, vertexColors, fog: false, toneMapped: false });
  if (p.alpha || true) {
    m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
    m.blendSrc = BLEND[p.src] ?? THREE.SrcAlphaFactor; m.blendDst = BLEND[p.dst] ?? THREE.OneFactor;
  }
  return m;
}
/** KO CN3CPlug::RenderFX: ana efektin (bundle'ın ilk billboard parçası) dokusu ve karışımı, silahın FX meshinin üstüne çizilir.
 *  Dönüş: { malzeme(), kare(tex, i), fps, n } — kare sayısı dokunun karesi; fps texFPS */
export function fxYuzey(id) {
  const key = typeof id === 'number' ? LIB?.ids?.[id] : id; const d = key && LIB?.bundles?.[key];
  const p = d?.parts?.find((x) => x.type === 2); if (!p) return null;
  const a = atlas(p.tex); if (!a) return null;
  return { p, n: a.n, fps: p.texFPS || 10,
    malzeme: () => { const m = material(p, a); m.side = THREE.DoubleSide; m.depthWrite = false; return m; },
    kare: (tex, i) => setFrame(tex, a, ((i % a.n) + a.n) % a.n) };
}
// D3D düzeninde (v aşağı) dörtgen
function quadGeo() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0.5, 0, 0.5, 0.5, 0, 0.5, -0.5, 0, -0.5, -0.5, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]); return g;
}
// (4.11) çeyrek zemin dokusu: 3×3 köşe ızgarası, uv kenarlarda 0, ortada 1 → doku köşesi (u=1, v=1) merkezde, dört yöne aynalanır; XZ düzleminde
function ceyrekGeo() {
  const g = new THREE.BufferGeometry(), P = [], U = [], I = [];
  const E = 0.012, M = 0.988;   // kenar / merkez içe çekilir: atlas komşu karesinden ve doku kenarından sızma (aynalama birleşiminde çizgi) olmaz
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { P.push(-0.5 + c * 0.5, 0, -0.5 + r * 0.5); U.push(c === 1 ? M : E, r === 1 ? M : E); }
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { const a = r * 3 + c; I.push(a, a + 3, a + 1, a + 1, a + 3, a + 4); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2)); g.setIndex(I); return g;
}
function setFrame(tex, a, i) {
  const c = i % a.cols, r = Math.floor(i / a.cols);
  tex.repeat.set(1 / a.cols, 1 / a.rows); tex.offset.set(c / a.cols, r / a.rows);
}
const alphaAt = (p, life, dying) => {
  const total = p.fadeIn + p.life + p.fadeOut;
  if (dying) return life >= total ? 0 : p.fadeOut > 0 ? Math.min(1, (total - life) / p.fadeOut) : 0;
  if (life <= p.fadeIn && p.fadeIn > 0) return life / p.fadeIn;
  return 1;
};
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const _v2 = new THREE.Vector3(), _q2 = new THREE.Quaternion();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _emQ = new THREE.Quaternion(), _emP = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);
// KO dünyası sol elli (oyunda world.scale.z = -1); efektler sahneye eklenir → z aynalanır
const S = (v) => { v.z = -v.z; return v; };
const mirrorQ = (q) => q.set(-q.x, -q.y, q.z, q.w);

// ---------------- parçalar
class Part {
  constructor(b, p) { this.b = b; this.p = p; this.state = 'ready'; this.life = 0; this.pos = new THREE.Vector3(...p.pos); this.vel = new THREE.Vector3(...p.vel); }
  start() { this.state = 'live'; }
  stop() { if (this.state === 'live') { this.state = 'dying'; this.life = this.p.life + this.p.fadeIn; } }
  isDead() { return this.life >= this.p.fadeIn + this.p.life + this.p.fadeOut; }
  tick(dt) {
    if (this.state === 'dead' || this.state === 'ready') return false;
    this.life += dt;
    if (this.p.life > 0 && this.state === 'live' && this.life >= this.p.life + this.p.fadeIn) this.stop();
    if (this.state === 'dying' && this.isDead()) { this.state = 'dead'; this.hide(); return false; }
    this.vel.addScaledVector(_v.set(...this.p.acc), dt); this.pos.addScaledVector(this.vel, dt);
    return true;
  }
  abs(out) {
    const k = (this.b.dependScale ? this.b.scale : 1) * this.b.boyut; out.copy(this.pos).multiplyScalar(k);
    if (this.b.boardIleri && this.p.type === 2) out.z += this.b.boardIleri;   // (7.11) yalnız kart (billboard) parçaları ileri (ör. emme dökümünün yıldızı karakterin önünde; halka içinde kalır)
    return out.applyQuaternion(this.b.dirQ).add(this.b.pos);
  }
  hide() { if (this.obj) this.obj.visible = false; }
  dispose() { this.obj?.removeFromParent(); this.obj?.geometry?.dispose(); this.obj?.material?.dispose(); }
}

class Board extends Part {
  constructor(b, p) {
    super(b, p); this.a = atlas(p.tex);
    const mat = material(p, this.a);
    this.obj = new THREE.Mesh(quadGeo(), mat); this.obj.frustumCulled = false; this.obj.visible = false; this.obj.renderOrder = 10;
    this.sx = p.sizeX; this.sy = p.sizeY; this.svx = p.scaleVel?.[0] || 0; this.svy = p.scaleVel?.[1] || 0;
  }
  tick(dt, cam) {
    if (!super.tick(dt)) return false;
    const p = this.p, a = this.a;
    let idx = Math.floor(this.life * p.texFPS); if (p.texLoop && a) idx %= a.n;
    if (!a || idx >= a.n) { this.obj.visible = false; return true; }
    setFrame(this.obj.material.map, a, idx);
    this.svx += (p.scaleAcc?.[0] || 0) * dt; this.svy += (p.scaleAcc?.[1] || 0) * dt;
    this.sx += this.svx * dt; this.sy += this.svy * dt;
    const k = (this.b.dependScale ? this.b.scale : 1) * this.b.boyut;
    let w = Math.max(0, this.sx * k), h = Math.max(0, this.sy * k);
    if (this.b.enFazla) { const f = Math.min(1, this.b.enFazla / Math.max(w, h, 1e-6)); w *= f; h *= f; }   // üst sınır (m)
    const at = S(this.abs(_v));
    // yarıçap kadar kameraya doğru
    const toCam = new THREE.Vector3().subVectors(cam.position, at);
    if (p.rotOnlyY) toCam.y = 0;
    const d = toCam.length(); if (d > 0 && p.radius) at.addScaledVector(toCam, Math.min(p.radius * k, d * 0.9) / d);
    const o = this.obj; o.position.copy(at);
    if (p.rotOnlyY) { o.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(cam.position.x - at.x, cam.position.z - at.z)); }
    else o.quaternion.copy(cam.quaternion);
    const ek = this.b.eksen?.();
    if (ek && ek.lengthSq() > 1e-8) {
      // silah boyunca hizala: ekrandaki bıçak yönü = kartın dikey ekseni, enine daralt
      const dc = _v2.copy(ek).applyQuaternion(_q2.copy(cam.quaternion).invert());
      o.quaternion.multiply(_q.setFromAxisAngle(Z, Math.atan2(dc.y, dc.x) - Math.PI / 2));
      const m = Math.max(w, h); w = this.b.genislik ? this.b.genislik : m * (this.b.enOran || 1); h = m;
    } else {
      const rz = this.life * p.rotVel[0] + (p.mtx ? Math.atan2(p.mtx[1], p.mtx[0]) : 0);   // m_mtxRot (sürüm 5+) düzlem içi dönüş
      if (rz) o.quaternion.multiply(_q.setFromAxisAngle(Z, rz));
    }
    o.scale.set(w, h, 1);
    if (p.onGround) o.position.y = this.b.ground(at.x, -at.z) + h / 2;
    o.material.opacity = alphaAt(p, this.life, this.state === 'dying') * (p.opaklik ?? 1);   // opaklik: kart ek saydamlığı (Shozin halkası)
    o.visible = w > 0 && h > 0;
    return true;
  }
}

// KO çeyrek daire zemin dokuları (2008–2012 efektleri: koruma halkaları, Fire/Ice/Lightning Armor, şövalye çekiç izi…): doku dairenin yalnız bir çeyreği
// (merkez sağ alt köşe); KO aynalayarak (uv 0..2, MIRROR) tam çember çizer — dokular görüntü analiziyle belirlendi
const CEYREK_ZEMIN = new Set(["ground\\gumgang_gaho_2009\\gr_ruard_#1", "ground\\20071005_marseu_mob_all\\marseu_carfvainder_sss_a01_#1", "ground\\gumgang_gaho_2009\\gaho_gumkang_b03_#1", "ground\\gumgang_gaho_2009\\gaho_fire_fin_#1", "ground\\gumgang_gaho_2009\\gaho_gumkang_a03_#1", "ground\\gumgang_gaho_2009\\curse_all_gound_el_#2", "ground\\gumgang_gaho_2009\\curse_all_gound_#2", "ground\\fx_final_plus_galll\\dfance_up_silbon_g01_#2", "ground\\0000magic\\sasin_down_gro_green_#1", "ground\\0000magic\\sasin_down_gro_a_#1", "ground\\knight_axe_2008\\knight_ham_gro_a01_#2", "ground\\knight_axe_2008\\knight_ham_gro_a0111_#1", "ground\\knight_axe_2008\\z_helll_gro_htht01_#1", "ground\\knight_axe_2008\\knight_ham_gro_ee0111_#1", "ground\\knight_axe_2008\\z_helll_gro_htht033_#1", "ground\\knight_axe_2008\\z_helll_gro_htht044_#1", "ground\\fx_final_plus_galll\\fx_final_plus_blod_g_#2", "ground\\gumgang_gaho_2009\\curse_all_gound_fireb_#2", "ground\\knight_axe_2008\\z_up_aa0011_2009_gro_#1", "ground\\bossmode_gro_a011\\boss_casting_g02_#1", "ground\\bossmode_gro_a011\\boss_casting_g01_g_#1", "ground\\bossmode_gro_a011\\draki_groung_red_y01_#1", "ground\\knight_axe_2008\\knight_ham_gro_a01_#2", "ground\\knight_axe_2008\\knight_ham_gro_a0111_#1", "ground\\knight_axe_2008\\z_helll_gro_htht01_#1", "ground\\knight_axe_2008\\knight_ham_gro_ee0111_#1", "ground\\knight_axe_2008\\z_helll_gro_htht033_#1", "ground\\knight_axe_2008\\z_helll_gro_htht044_#1", "ground\\knight_axe_2008\\knight_destro_ground_#1", "ground\\knight_axe_2008\\knight_ham_gro_a01_hdr_#2", "ground\\k_spirit_04_g\\k_ground_07_#1", "ground\\0000magic\\sasin_down_gro_green2_#1", "ground\\0000magic\\sasin_down_gro_b_#1", "ground\\k_destruct_03_g\\boomboss_firering_03_#1", "ground\\hm_boomboss_g01\\boomboss_firering_03_#1", "ground\\k_spirit_03_g\\k_ground_06_#2", "ground\\k_onestep_01_g\\k_ground_09_#1", "ground\\k_destruct_03_g\\k_light_a01_#1", "ground\\hm_bigboom_a01\\bigboom_firering_03_#1"]);   // + [Event Manager] Aset (npc_dk_2020_a001) zemin halkaları
// hiçbir efektte çizilmeyen parçalar: Fire / Ice / Lightning Armor'daki 70–80 m'lik dönen ışık huzmesi (z_2009_reup\warer10 / warer07_i, boyY ≥ 60) — kullanıcı isteği
const HEP_HARIC = /z_2009_reup\\warer(10|07_i)_/i;
class Bottom extends Part {
  constructor(b, p) {
    super(b, p); this.a = atlas(p.tex);
    const mat = material(p, this.a);
    const g = quadGeo(); g.rotateX(-Math.PI / 2);
    // çeyrek daire dokusu (ör. GM efekti gr_ruard): KO'daki gibi aynalanarak tam çember olur (uv 0..2, MirroredRepeat)
    if (CEYREK_ZEMIN.has(p.tex) || (b.zeminAyna || []).some((re) => re.test(p.tex || ''))) {
      g.dispose(); this._g = ceyrekGeo(); mat.side = THREE.DoubleSide; if (mat.map) { mat.map.wrapS = mat.map.wrapT = THREE.ClampToEdgeWrapping; mat.map.generateMipmaps = false; mat.map.minFilter = THREE.LinearFilter; mat.map.needsUpdate = true; }   // (4.11) 2×2 aynalı dörtlü: her çeyrekte uv 0→1→0 — kare animasyonlu (atlas) dokularda da doğru (wrap aynalaması atlasta iki yarım kare gösteriyordu)
    }
    this.obj = new THREE.Mesh(this._g || g, mat); this.obj.frustumCulled = false; this.obj.visible = false; this.obj.renderOrder = 9;
    this.sx = p.sizeX; this.sz = p.sizeZ;
  }
  tick(dt) {
    if (!super.tick(dt)) return false;
    const p = this.p, a = this.a;
    let idx = Math.floor(this.life * p.texFPS); if (p.texLoop && a) idx %= a.n;
    if (!a || idx >= a.n) { this.obj.visible = false; return true; }
    setFrame(this.obj.material.map, a, idx);
    this.sx = Math.max(0, this.sx + p.scaleVel[0] * dt); this.sz = Math.max(0, this.sz + p.scaleVel[1] * dt);
    const k = (this.b.dependScale ? this.b.scale : 1) * this.b.boyut;
    const o = this.obj; const x = this.b.pos.x + this.pos.x, z = this.b.pos.z + this.pos.z;
    o.position.set(x, this.b.ground(x, z) + (p.gap || 0.05), -z);   // KO m_fGap: zeminden yükseklik (Battle Cry halkası 1 m)
    o.rotation.set(0, -this.life * p.rotVel[1], 0);
    o.scale.set(this.sx * k, 1, this.sz * k);
    o.material.opacity = alphaAt(p, this.life, this.state === 'dying');
    o.visible = true;
    return true;
  }
}

class Particles extends Part {
  constructor(b, p) {
    super(b, p); this.a = atlas(p.tex);
    // parçacık küçültme (opts.parcacik: [{re, k}]) — ör. GM efektinde bacaklara çıkan ışıltı %90 küçük
    this.olcek = (b.parcacik || []).find((x) => x.re.test(p.tex || ''))?.k ?? 1;
    const n = Math.max(1, Math.min(400, p.num));
    this.n = n; this.alive = []; this.free = []; this.delay = p.delay; this.emitDir = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < n; i++) this.free.push({ i });
    const g = new THREE.BufferGeometry();
    this.posA = new Float32Array(n * 12); this.uvA = new Float32Array(n * 8); this.colA = new Float32Array(n * 16);
    g.setAttribute('position', new THREE.BufferAttribute(this.posA, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uvA, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.colA, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < n; i++) { const o = i * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3); } g.setIndex(idx);
    const mat = material(p, this.a, true); mat.transparent = true;
    this.obj = new THREE.Mesh(g, mat); this.obj.frustumCulled = false; this.obj.visible = false; this.obj.renderOrder = 11;
    // m_bAnimKey: parçacıklar canlandırılmış yayıcı şeklin köşelerinden çıkar (N3FXPartParticles, ör. Evade/Safety/Scaled Skin)
    const es = p.animKey && LIB.shapes?.[p.shape];
    if (es && MESH) {
      this.em = { s: es, frm: 0, v: [] };
      for (const sp of es.parts) { const a = new Float32Array(MESH, sp.pos, sp.vc * 3); for (let i = 0; i < sp.vc; i++) this.em.v.push(new THREE.Vector3(a[i * 3] + sp.pivot[0], a[i * 3 + 1] + sp.pivot[1], a[i * 3 + 2] + sp.pivot[2])); }
    }
  }
  /** yayıcı şeklin o anki dönüşü/konumu (CN3AnimKey: kareler 30 fps birimi, anahtarlar 'rate' hızında) */
  emTransform() {
    const s = this.em.s, K = s.keys || {}, f = this.em.frm;
    const at = (k, out, q) => {
      if (!k) return false; const n = k.d.length / k.w; if (n < 1) return false;
      const x = (f * k.rate / 30) % n, i = Math.floor(x), j = (i + 1) % n, t = x - i;
      if (q) { _qa.fromArray(k.d, i * 4); _qb.fromArray(k.d, j * 4); out.copy(_qa).slerp(_qb, t); }
      else { _va.fromArray(k.d, i * 3); _vb.fromArray(k.d, j * 3); out.copy(_va).lerp(_vb, t); }
      return true;
    };
    if (!at(K.rot, _emQ, true)) _emQ.set(...(s.rot || [0, 0, 0, 1]));
    if (!at(K.pos, _emP, false)) _emP.set(...(s.pos || [0, 0, 0]));
  }
  emit() {
    const p = this.p, b = this.b, k = (b.dependScale ? b.scale : 1) * b.boyut;
    const axis = new THREE.Vector3(...p.emitDir); if (axis.lengthSq() === 0) axis.set(0, 1, 0); axis.normalize().applyQuaternion(b.dirQ);
    const toAxis = new THREE.Quaternion().setFromUnitVectors(Z, axis);
    let ems = null;
    if (this.em) { this.emTransform(); ems = this.em.v.map((v) => v.clone().applyQuaternion(_emQ).add(_emP).multiplyScalar(k).applyQuaternion(b.dirQ)); }
    const adet = ems ? p.numCreate * ems.length : p.numCreate;
    for (let c = 0; c < adet && this.free.length; c++) {
      const q = this.free.pop();
      let dir;
      if (p.emit === 1) {   // yayılma: koni içinde rastgele
        const ang = THREE.MathUtils.degToRad((Math.random() - 0.5) * (p.emitAngle || 0)), spin = Math.random() * Math.PI * 2;
        dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)).applyAxisAngle(Z, spin).applyQuaternion(toAxis);
      } else dir = axis.clone();
      const lc = new THREE.Vector3(...[0, 1, 2].map((j) => p.minRange[j] + (p.maxRange[j] - p.minRange[j]) * Math.random())).multiplyScalar(k).applyQuaternion(toAxis);
      if (ems) lc.add(ems[c % ems.length]);
      if (p.emit === 2 && p.gather) dir = new THREE.Vector3(...p.gather).multiplyScalar(k).sub(lc).normalize();
      Object.assign(q, {
        life: 0, plife: p.ptLife[0] + (p.ptLife[1] - p.ptLife[0]) * Math.random(), size: (p.size[0] + (p.size[1] - p.size[0]) * Math.random()) * k * this.olcek,
        origin: this.abs(new THREE.Vector3()), anc: b.tasiyici ? b.tasiyici().clone() : null, lc, vel: dir.clone().multiplyScalar(p.ptVel * k), acc: dir.clone().multiplyScalar(p.ptAcc * k),
        axis, rot: 0, dropV: 0, dropY: 0,
      });
      this.alive.push(q);
    }
  }
  tick(dt, cam) {
    if (!super.tick(dt)) { if (this.state === 'dead') this.alive.length = 0; return false; }
    const p = this.p;
    this.delay += dt; if (this.em) this.em.frm += (p.meshFPS || 30) * dt;
    if (this.delay >= p.delay && this.state === 'live') { this.delay = 0; this.emit(); }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const a = this.a; let w = 0;
    for (let i = this.alive.length - 1; i >= 0; i--) {
      const q = this.alive[i];
      const total = p.changeColor ? q.plife : p.fadeIn + q.plife + p.fadeOut;
      if (q.life >= total) { this.alive.splice(i, 1); this.free.push(q); continue; }
      const wp = q.lc.clone().applyAxisAngle(q.axis, q.rot).add(q.origin); wp.y -= q.dropY;
      if (q.anc) wp.add(_va.copy(this.b.tasiyici()).sub(q.anc));   // silah efekti: yürürken geride kalmaz
      S(wp);
      let col = [1, 1, 1, 1];
      if (p.changeColor && p.colors?.length) {
        const c = p.colors[Math.min(p.colors.length - 1, Math.floor(q.life * p.colors.length / q.plife))];
        col = [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, ((c >>> 24) & 255) / 255];
      } else if (q.life <= p.fadeIn && p.fadeIn > 0) col[3] = q.life / p.fadeIn;
      else if (q.life > p.fadeIn + q.plife && p.fadeOut > 0) col[3] = Math.max(0, (total - q.life) / p.fadeOut);
      const kk = (this.b.dependScale ? this.b.scale : 1) * this.b.boyut, mx = this.b.enFazla ? this.b.enFazla / 2 : Infinity;
      const sx = Math.min(mx, Math.max(0, q.size + (p.scaleVel?.[0] || 0) * kk * q.life) / 2), sy = Math.min(mx, Math.max(0, q.size + (p.scaleVel?.[1] || 0) * kk * q.life) / 2);
      if (this.b.enFazla && q.lc.length() > mx) q.lc.setLength(mx);
      const yk = this.b.yukselme ? this.b.yukselme / 2 : Infinity, sxK = Math.min(sx, yk), syK = Math.min(sy, yk);   // kapı ışığı: kart boyu da sınırlı (KO'da Y ölçek hızı 88 → 100 m'lik sütun)
      const rz = (p.texRotVel || 0) * q.life, cs = Math.cos(rz), sn = Math.sin(rz);
      const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
      const fi = a ? Math.floor(q.life * p.texFPS) % a.n : 0;
      const u0 = a ? (fi % a.cols) / a.cols : 0, v0 = a ? Math.floor(fi / a.cols) / a.rows : 0, du = a ? 1 / a.cols : 1, dv = a ? 1 / a.rows : 1;
      corners.forEach(([cx, cy], k) => {
        const x = (cx * cs - cy * sn) * sxK, y = (cx * sn + cy * cs) * syK;
        const o = (w * 4 + k) * 3;
        this.posA[o] = wp.x + right.x * x + up.x * y; this.posA[o + 1] = wp.y + right.y * x + up.y * y; this.posA[o + 2] = wp.z + right.z * x + up.z * y;
        const uo = (w * 4 + k) * 2; this.uvA[uo] = u0 + (cx > 0 ? du : 0); this.uvA[uo + 1] = v0 + (cy < 0 ? dv : 0);
        this.colA.set(col, (w * 4 + k) * 4);
      });
      w++;
      q.lc.addScaledVector(q.vel, dt); q.vel.addScaledVector(q.acc, dt);
      q.rot += dt * p.ptRotVel; q.dropV += p.gravity * dt; q.dropY += q.dropV * dt; if (this.b.yukselme && q.dropY < -this.b.yukselme) { q.dropY = -this.b.yukselme; q.dropV = 0; } q.life += dt;
    }
    const g = this.obj.geometry; g.setDrawRange(0, w * 6);
    g.attributes.position.needsUpdate = g.attributes.uv.needsUpdate = g.attributes.color.needsUpdate = true;
    this.obj.material.opacity = 1; this.obj.visible = w > 0;
    return true;
  }
  isDead() { return super.isDead() && this.alive.length === 0; }
}

class MeshPart extends Part {
  constructor(b, p) {
    super(b, p);
    this.obj = new THREE.Group(); this.obj.visible = false;
    const s = LIB.shapes?.[p.shape];
    this.shape = s; this.mats = [];
    if (s && MESH) for (const sp of s.parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MESH, sp.pos, sp.vc * 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(MESH, sp.uv, sp.vc * 2).slice(), 2));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(MESH, sp.idx, sp.ic), 1));
      const a = atlas(sp.tex);
      const mat = material(p, a); if (mat.map) mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
      // KO: alfa harmanlaması kapalı parça (RF_ALPHABLENDING yok) opak çizilir — GM yazısının dolu ön yüzü (bonjojo2)
      if (!p.alpha && (b.opak || /mora_forge_wing/i.test(p.shape || ''))) {   // + Moradon yel değirmeni kanatları (70119_mora_forge_wing*: alfa kapalı → opak, KO'da dokulu ahşap)
        mat.blending = THREE.NormalBlending; mat.transparent = false; mat.depthWrite = true;
        if (/mora_forge_wing/i.test(p.shape || '')) { mat.fog = true; mat.toneMapped = true; mat.color.setScalar(0.82); mat.needsUpdate = true; } }   // (7.11) değirmen kanatları dünya nesnesi gibi sise / pusa girer (efektler sissiz; kanatlar hep canlı görünüyordu)
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 10; m.position.set(...sp.pivot);
      this.obj.add(m); this.mats.push({ mat, a, fps: sp.fps || p.texFPS });
    }
    this.sv = new THREE.Vector3(...(p.scaleVel || [0, 0, 0]));
    this.unit = new THREE.Vector3(...(p.unitScale || s?.scale || [1, 1, 1]));
    for (const [re, k] of b.parcaOlcek || []) if (re.test(p.shape || '')) this.unit.multiplyScalar(k);   // tek bir şekil parçasını büyüt (ör. Manes of fire kayası ×2)
  }
  tick(dt) {
    if (!super.tick(dt)) return false;
    if (!this.shape) return true;
    const p = this.p, op = alphaAt(p, this.life, this.state === 'dying');
    for (const m of this.mats) {
      m.mat.opacity = op * (p.opaklik ?? 1);   // opaklik: parça ek saydamlığı (ör. Shozin çekici %70)
      if (m.a && m.mat.map) {
        const i = m.a.n > 1 ? Math.floor(this.life * (m.fps || 0)) % m.a.n : 0;
        const c = i % m.a.cols, r = Math.floor(i / m.a.cols);
        m.mat.map.repeat.set(1 / m.a.cols, 1 / m.a.rows);
        m.mat.map.offset.set(c / m.a.cols + (p.texMoveDir > 0 ? p.fu * this.life : 0), r / m.a.rows + (p.texMoveDir > 0 ? p.fv * this.life : 0));
      }
    }
    if (p.scaleAcc) this.sv.addScaledVector(_v.set(...p.scaleAcc), this.life);
    const sc = this.sv.clone().multiplyScalar(this.life).add(this.unit); if (this.b.dependScale) sc.multiplyScalar(this.b.scale); sc.multiplyScalar(this.b.boyut);
    // şeklin kendi konum / ölçek anahtarları (CN3Shape Tick: ör. görev işaretlerinin yukarı-aşağı süzülmesi ve nabız gibi büyüyüp küçülmesi)
    const K = this.shape.keys || {}, kare = (k) => { if (!k?.d?.length) return null; const w = k.w || 3, n = k.d.length / w; if (n < 2) return k.d.slice(0, w); const x = (this.life * (p.meshFPS || 30) * k.rate / 30) % n, i = Math.floor(x), j = (i + 1) % n, f = x - i; const r = []; for (let c = 0; c < w; c++) r.push(k.d[i * w + c] * (1 - f) + k.d[j * w + c] * f); return r; };
    const sk = kare(K.scale); if (sk) { const b0 = this.shape.scale || [1, 1, 1]; sc.multiply(_v.set(sk[0] / (b0[0] || 1), sk[1] / (b0[1] || 1), sk[2] / (b0[2] || 1))); }   // anahtar şeklin ölçeğinin yerine geçer
    const pk = kare(K.pos);
    const o = this.obj;
    o.scale.set(Math.max(0, sc.x), Math.max(0, sc.y), -Math.max(0, sc.z));
    o.quaternion.setFromEuler(_e.set(this.life * p.rotVel[0], this.life * p.rotVel[1], this.life * p.rotVel[2]));
    // şeklin kendi dönüş anahtarları (CN3AnimKey; ör. GM efektindeki dönen "GM" yazısı)
    const rk = this.shape.keys?.rot;
    if (rk) { const n = rk.d.length / 4, x = (this.life * (p.meshFPS || 30) * rk.rate / 30) % n, i = Math.floor(x), j = (i + 1) % n; _qa.fromArray(rk.d, i * 4); _qb.fromArray(rk.d, j * 4); o.quaternion.multiply(_qa.slerp(_qb, x - i)); }
    o.quaternion.premultiply(this.b.dirQ);
    mirrorQ(o.quaternion);
    S(this.abs(o.position)); o.position.y += this.b.meshDy || 0;
    if (pk) { _v.set(pk[0], pk[1], pk[2]).applyQuaternion(this.b.dirQ); _v.z = -_v.z; o.position.add(_v); }   // meshDy: yalnız mesh parçalarını yükselt (GM yazısı ismin üstünde)
    o.visible = true;
    return true;
  }
}

// ---------------- demet
export class FXBundle {
  /** opts: {pos, dir (Vector3), scale, follow: () => Vector3, ground(x,z), loop} */
  constructor(id, root, opts = {}) {
    const key = typeof id === 'number' ? LIB?.ids?.[id] : id;
    const d = key && LIB?.bundles?.[key];
    this.dead = !d; if (!d) return;
    this.key = key; this.d = d; this.t = 0; this.pos = (opts.pos || new THREE.Vector3()).clone(); this.follow = opts.follow || null;
    this.dirQ = new THREE.Quaternion().setFromUnitVectors(Z, (opts.dir || Z).clone().normalize());
    if (opts.roll) this.dirQ.multiply(new THREE.Quaternion().setFromAxisAngle(Z, opts.roll));   // (4.11) ileri eksen etrafında yatma (R combo hilali: dikey / çapraz)
    this.scale = opts.scale || 1; this.meshDy = opts.meshDy || 0; this.parcacik = opts.parcacik || null; this.zeminAyna = opts.zeminAyna || null; this.boyut = opts.boyut || 1; this.boardIleri = Number(opts.boardIleri) || 0; this.enFazla = opts.enFazla || 0; this.eksen = opts.eksen || null; this.enOran = opts.enOran || 1; this.genislik = opts.genislik || 0; this.tasiyici = opts.tasiyici || null; this.yon = opts.yon || null; this.parcaOlcek = opts.parcaOlcek || null; this.dependScale = d.dependScale; this.loop = !!opts.loop; this.hiz = opts.hiz || 1; this.opak = !!opts.opak; this.alfa = opts.alfa ?? 1; this.yukselme = opts.yukselme ? opts.yukselme * (opts.scale || 1) : 0;   // yukarı süzülen parçacıklar en çok bu kadar yükselir (m)
    this.ground = opts.ground || (() => this.pos.y);
    this.group = new THREE.Group(); root.add(this.group);
    this.parts = d.parts.filter((p) => (!opts.tipler || opts.tipler.includes(p.type)) && !(opts.haric && opts.haric.test(p.shape || p.tex || '')) && !(HEP_HARIC.test(p.tex || '') && (p.sizeY || 0) >= 60) && !(p.type === 2 && (p.sizeX || 0) >= 50 && (p.sizeY || 0) >= 50)).map((p) => {   // ≥50×50 m kartlar (KO tam ekran parlaması, ör. z_spreadmywings_s_): kamerayı kaplayıp ekranı siyah / beyaz yanıp söndürüyordu   // haric: bu şekil/doku adlı parçalar oynatılmaz
      const P = p.type === 2 ? Board : p.type === 4 ? Bottom : p.type === 1 ? Particles : p.type === 3 ? MeshPart : null;
      if (!P) return null;
      try { const x = new P(this, p); x.start0 = p.start; this.group.add(x.obj); return x; } catch (e) { console.warn('efekt parçası', e); return null; }
    }).filter(Boolean);
    // renk tonu (ör. Pathos eldiveni sınıf rengi): dokuyla çarpılır
    if (opts.renk != null) this.group.traverse((o) => { for (const m of [].concat(o.material || [])) m.color?.set(opts.renk); });
  }
  stop() { for (const p of this.parts || []) p.stop(); this.stopping = true; }
  update(dt, cam) {
    if (this.dead) return false;
    // uzak oyuncunun efekti: çizilmez ve hesaplanmaz (optimizasyon)
    if (this.group) this.group.visible = !this.gizli;
    if (this.gizli) return true;
    dt *= this.hiz;   // oynatma hızı (silah parıltısı %30 yavaş)
    if (this.follow) { const f = this.follow(); if (f) this.pos.copy(f); }
    if (this.yon) { const q = this.yon(); if (q) this.dirQ.copy(q); }   // eklem yönünü izle (n3fxplug: peri kanatları)
    this.t += dt;
    const allDead = this.parts.every((p) => p.state === 'dead');
    if ((this.d.life > 0 && this.t > this.d.life && !this.loop) || (allDead && this.t > 0.05)) {
      if (this.loop && !this.stopping) { this.restart(); }
      else { this.dispose(); return false; }
    }
    for (const p of this.parts) {
      if (p.start0 <= this.t && p.state === 'ready') p.start();
      p.tick(dt, cam);
      // genel saydamlık (opts.alfa; ör. görev simgeleri): parçaların her karede yazdığı opaklığın üstüne çarpılır
      if (this.alfa < 1) {
        if (p instanceof Particles) p.obj.material.opacity = this.alfa;
        else if (p.mats) for (const m of p.mats) m.mat.opacity *= this.alfa;
        else if (p.obj?.material) p.obj.material.opacity *= this.alfa;
      }
    }
    return true;
  }
  restart() { this.t = 0; for (const p of this.parts) { p.state = 'ready'; p.life = 0; p.pos.set(...p.p.pos); p.vel.set(...p.p.vel); if (p.alive) { for (const q of p.alive) p.free.push(q); p.alive.length = 0; } } }
  dispose() { this.dead = true; for (const p of this.parts || []) p.dispose(); this.group?.removeFromParent(); }
}

// ---------------- yönetici
export class FXManager {
  constructor(root, camera, ground) { this.root = root; this.camera = camera; this.ground = ground; this.list = new Set(); }
  play(id, opts = {}) {
    if (!LIB || !hasFX(id) && typeof id === 'number') return null;
    const b = new FXBundle(id, this.root, { ground: this.ground, ...opts });
    if (b.dead) return null;
    if (!opts.loop && !opts.sessiz && typeof id === 'number') sesFx(id, opts.follow?.() || b.pos);   // KO: fx.tbl ses kimliği (KO koordinatı)
    this.list.add(b); return b;
  }
  /** demet yüklü mü (dosya adı ya da fx.tbl kimliği) */
  var(id) { return typeof id === 'number' ? hasFX(id) : !!LIB?.bundles?.[id]; }
  update(dt) {
    dt = Math.min(dt, 0.05);   // yavaş karelerde efektler atlamasın
    const cam = this.camera; cam.updateMatrixWorld();
    for (const b of this.list) if (!b.update(dt, cam)) this.list.delete(b);
  }
}
