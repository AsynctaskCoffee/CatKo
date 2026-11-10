// CatKo — prosedürel yapılar: şehir surları, kale, kule, ev, çeşme, ağaç, kaya, harabe, anıt. Çarpışmalı (js/collision.js'e üçgen verir).
// Düzen js/catko-plan.js'ten gelir (arazi/doku ile aynı kaynak). Botlar için window.KO_WORLD.solids (AABB listesi) yayınlanır.
import { orjAc } from './catko-orj.js';
import { PLAN, rng, fbm, distSeg, roadDist, onStone, waterDist, WORLD } from './catko-plan.js';

const KARUS = 0xb5342b, ELMO = 0x2f5fb8;

export async function dunyaKur({ THREE, zone, world, state, Collision, base }) {
  const P = PLAN[zone]; if (!P) return null;
  const R = rng(P.seed * 977 + 5);
  const H = (x, z) => state.heightAt(x, z);
  const O = new URLSearchParams(location.search).get('orj') === '0' ? null : await orjAc().catch(() => null);   // orijinal şekil kütüphanesi (yoksa prosedürel)
  let noVis = false;          // true iken yalnız çarpışma üretilir (görünüm orijinal şekilden gelir)
  const solids = [];          // [x0, z0, x1, z1]
  const soup = [];            // çarpışma üçgenleri
  const buf = { p: [], n: [], c: [] };
  const tmpC = new THREE.Color();

  // ---------- geometri yardımcıları ----------
  function addGeo(geo, x, y, z, { rx = 0, ry = 0, sx = 1, sy = 1, sz = 1, color = 0x999999, jit = 0.06, solid = false } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m);
    const pos = g.attributes.position.array, nor = g.attributes.normal.array;
    for (let i = 0; i < pos.length; i += 9) {   // üçgen başına renk sapması
      if (solid) for (let v = 0; v < 9; v++) soup.push(pos[i + v]);
      if (noVis) continue;
      const k = 1 + (R() - 0.5) * 2 * jit; tmpC.set(color);
      for (let v = 0; v < 3; v++) { buf.p.push(pos[i + v * 3], pos[i + v * 3 + 1], pos[i + v * 3 + 2]); buf.n.push(nor[i + v * 3], nor[i + v * 3 + 1], nor[i + v * 3 + 2]); buf.c.push(tmpC.r * k, tmpC.g * k, tmpC.b * k); }
    }
    g.dispose();
  }
  const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 8), CONE = new THREE.ConeGeometry(1, 1, 7), ICO = new THREE.IcosahedronGeometry(1, 0), PYR = new THREE.ConeGeometry(1, 1, 4), PL = new THREE.PlaneGeometry(1, 1);
  // kutu: merkez (x,z), taban yüksekliği y0, boyut (w,h,d); eksen hizalı (çarpışma AABB)
  function box(x, y0, z, w, h, d, color, solid = true, jit) {
    addGeo(BOX, x, y0 + h / 2, z, { sx: w, sy: h, sz: d, color, solid, jit });
    if (solid) solids.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);
  }
  function cyl(x, y0, z, r, h, color, solid = false) { addGeo(CYL, x, y0 + h / 2, z, { sx: r, sy: h, sz: r, color }); if (solid) { soup.push(...aabbTris(x - r, y0, z - r, x + r, y0 + h, z + r)); solids.push([x - r, z - r, x + r, z + r]); } }
  function aabbTris(x0, y0, z0, x1, y1, z1) {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], f = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]], o = [];
    for (const t of f) for (const i of t) o.push(...v[i]); return o;
  }
  const ground = (x0, z0, x1, z1) => Math.min(H(x0, z0), H(x1, z0), H(x0, z1), H(x1, z1), H((x0 + x1) / 2, (z0 + z1) / 2));

  // orijinal şekil yerleştir: kutu merkezi (x,z); zemin = ayak izi alt noktası; çarpışma = ayak izi kutusu
  function orj(ad, x, z, { ry = 0, s = 1, sx = 1, solid = true, sink = 0.2, collH = null } = {}) {
    if (!O) return null;
    const k0 = O.boyut(ad, ry, s, sx); if (!k0) return null;
    const y = ground(x - k0.w / 2, z - k0.d / 2, x + k0.w / 2, z + k0.d / 2) - sink;
    const k = O.put(ad, x, z, { ry, s, sx, y }); if (!k) return null;
    if (solid) { const a = k.aabb; solids.push(a); soup.push(...aabbTris(a[0], y, a[1], a[2], y + (collH ?? Math.min(k.h, 30)), a[3])); }
    return k;
  }

  // sabit mimari
  function tower(x, z, s, h, color, roofColor) {
    if (O && O.var('obj_mora_post_wall_2007') && orj('obj_mora_post_wall_2007', x, z, { s: Math.max(0.55, s / 11), sink: 2.2 })) return;
    const g = ground(x - s / 2, z - s / 2, x + s / 2, z + s / 2);
    box(x, g - 3, z, s, h + 3, s, color);
    box(x, g + h, z, s + 1.6, 1.2, s + 1.6, color, false);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(x + dx * (s / 2 + 0.2), g + h + 1.2, z + dz * (s / 2 + 0.2), 1.4, 1.4, 1.4, color, false);
    addGeo(PYR, x, g + h + 1.2 + 3.2, z, { ry: Math.PI / 4, sx: s * 0.78, sy: 6.4, sz: s * 0.78, color: roofColor });
  }
  const WALLSHAPE = 'obj_turkey_bigwall';   // 52 × 20 × 11
  function wallLine(ax, az, bx, bz, h, t, color) {   // yalnız eksen hizalı
    if (O && O.var(WALLSHAPE) && !(window.__noOrjWall)) {
      const horiz = Math.abs(bz - az) < 0.01, len = horiz ? Math.abs(bx - ax) : Math.abs(bz - az), n = Math.max(1, Math.round(len / 52)), step = len / n;
      for (let i = 0; i < n; i++) {
        const c0 = i * step + step / 2, x = horiz ? Math.min(ax, bx) + c0 : ax, z = horiz ? az : Math.min(az, bz) + c0;
        orj(WALLSHAPE, x, z, { ry: horiz ? 0 : Math.PI / 2, sx: step / 52, sink: 0.6 });
      }
      return;
    }
    const horiz = Math.abs(bz - az) < 0.01, len = horiz ? Math.abs(bx - ax) : Math.abs(bz - az), n = Math.max(1, Math.round(len / 4)), step = len / n;
    for (let i = 0; i < n; i++) {
      const c0 = i * step + step / 2, x = horiz ? Math.min(ax, bx) + c0 : ax, z = horiz ? az : Math.min(az, bz) + c0;
      const w = horiz ? step : t, d = horiz ? t : step, g = ground(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
      box(x, g - 3, z, w, h + 3, d, color);
      if (i % 2 === 0) box(x, g + h, z, horiz ? step * 0.55 : t * 0.9, 1.5, horiz ? t * 0.9 : step * 0.55, color, false);
    }
  }
  function wallRect(x0, z0, x1, z1, h, t, color, gaps = {}) {   // gaps: {n,s,e,w:[[a,b]...]}; n = z0 kenarı, s = z1 kenarı, w = x0, e = x1
    const side = (fixed, a, b, horiz, key) => {
      let segs = [[a, b]];
      for (const [ga, gb] of gaps[key] || []) { const nx = []; for (const [sa, sb] of segs) { if (gb <= sa || ga >= sb) nx.push([sa, sb]); else { if (ga > sa) nx.push([sa, ga]); if (gb < sb) nx.push([gb, sb]); } } segs = nx; }
      for (const [sa, sb] of segs) horiz ? wallLine(sa, fixed, sb, fixed, h, t, color) : wallLine(fixed, sa, fixed, sb, h, t, color);
    };
    side(z0, x0, x1, true, 'n'); side(z1, x0, x1, true, 's'); side(x0, z0, z1, false, 'w'); side(x1, z0, z1, false, 'e');
  }
  function banner(x, z, color, h = 12) {
    if (O && orj(color === KARUS ? 'flagpole_ka_01_2006' : 'flagpole_el_01_2006', x, z, { solid: false })) return;
    const g = H(x, z); box(x, g, z, 0.5, h, 0.5, 0x4a3a2a, false); box(x + 1.6, g + h - 3.2, z, 3, 3.4, 0.2, color, false, 0.02);
  }
  function house(x, z, w, d, h, wallC, roofC, faceX) {
    const g = ground(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    box(x, g - 2, z, w, h + 2, d, wallC);
    // beşik çatı: uzun eksen boyunca; PYR yerine iki eğik düzlem yerine basit piramit çatı
    addGeo(PYR, x, g + h + 1.6, z, { ry: Math.PI / 4, sx: Math.max(w, d) * 0.78, sy: 3.4, sz: Math.max(w, d) * 0.78, color: roofC, solid: false });
    box(faceX ? x + (w / 2 + 0.05) * Math.sign(faceX) : x, g, faceX ? z : z + d / 2 + 0.05, faceX ? 0.2 : 1.6, 2.4, faceX ? 1.6 : 0.2, 0x3b2a1a, false);   // kapı
    // pencereler (ön/arka/yan), ahşap kirişler, baca
    for (const sx of [-1, 1]) for (const k of [-0.28, 0.28]) {
      box(x + k * w, g + h * 0.55, z + sx * (d / 2 + 0.06), 1.1, 1.1, 0.14, 0xf0c060, false, 0.02);
      box(x + k * w, g + h * 0.55, z + sx * (d / 2 + 0.03), 1.5, 1.5, 0.1, 0x4a3422, false, 0);
    }
    for (const sx of [-1, 1]) box(x + sx * (w / 2 + 0.06), g + h * 0.55, z, 0.14, 1.1, 1.1, 0xf0c060, false, 0.02);
    box(x, g + h - 0.35, z, w + 0.3, 0.5, d + 0.3, 0x5a3f28, false, 0);   // üst kiriş
    box(x + w * 0.28, g + h + 2.2, z - d * 0.2, 1.1, 3, 1.1, 0x7a6a5a, false);   // baca
  }
  function pine(x, z, s) {
    const g = H(x, z); cyl(x, g - 0.5, z, 0.35 * s, 3 * s, 0x5a3b22);
    const c = [0x2f6a3a, 0x2a5e35, 0x37753f][(R() * 3) | 0];
    for (let i = 0; i < 3; i++) addGeo(CONE, x, g + (2.2 + i * 1.9) * s, z, { sx: (2.4 - i * 0.5) * s, sy: 3.4 * s, sz: (2.4 - i * 0.5) * s, color: c });
  }
  function roundTree(x, z, s) {
    const g = H(x, z); cyl(x, g - 0.5, z, 0.4 * s, 3.2 * s, 0x6a4a2a);
    addGeo(ICO, x, g + 4.4 * s, z, { sx: 2.4 * s, sy: 2.1 * s, sz: 2.4 * s, color: [0x4c8a3a, 0x5a9a42, 0x6aa04a][(R() * 3) | 0] });
  }

  // ---------- yerleşim denetimi ----------
  let npcs = [];
  try { const r = await fetch((base || '') + 'assets/npc_moradon.json'); if (r.ok && zone === 'moradon') { const j = await r.json(); npcs = (Array.isArray(j) ? j : j.npcs || Object.values(j)[0] || []).map((n) => [n.x, n.z]); } } catch {}
  const inSolid = (x, z, m = 0) => solids.some((s) => x > s[0] - m && x < s[2] + m && z > s[1] - m && z < s[3] + m);
  const nearFlatCore = (x, z, k = 0.98) => P.flats.some((f) => Math.hypot(x - f.x, z - f.z) < f.r * k);
  const free = (x, z, m = 3, { road = 4, stone = true, npc = 6 } = {}) => {
    if (x < 6 || z < 6 || x > WORLD - 6 || z > WORLD - 6) return false;
    if (waterDist(P, x, z) < 7) return false;
    if (roadDist(P, x, z) < road) return false;
    if (stone && onStone(P, x, z)) return false;
    if (P.sands?.some((r) => x > r[0] - 6 && x < r[2] + 6 && z > r[1] - 6 && z < r[3] + 6)) return false;
    if (P.gates?.some((g) => Math.hypot(x - g.x, z - g.z) < 14)) return false;
    if (inSolid(x, z, m)) return false;
    if (npcs.some((n) => Math.hypot(x - n[0], z - n[1]) < npc)) return false;
    return true;
  };

  const WALL = 0xb4aa98, STONE = 0xc2baa8, DARK = 0x8a8478;
  const stucco = [0xe6d9b8, 0xd8c9a2, 0xcfd6c0, 0xe0c9b0, 0xdcdcd0], roofs = [0x8b3a2e, 0x6a4a3a, 0x3f5f8a, 0x7a3a3a, 0x4a6a4a];

  // ======================= MORADON =======================
  if (zone === 'moradon') {
    const W = P.walls;
    wallRect(W.x0, W.z0, W.x1, W.z1, W.h, W.t, WALL, W.gaps);
    for (const [x, z] of [[W.x0, W.z0], [W.x1, W.z0], [W.x1, W.z1], [W.x0, W.z1]]) tower(x, z, 9, 17, STONE, 0x5a3a6a);
    for (const [key, list] of Object.entries(W.gaps)) for (const [a, b] of list) for (const e of [a, b]) {   // kapı kuleleri
      const x = key === 'n' ? e : key === 's' ? e : key === 'w' ? W.x0 : W.x1, z = key === 'n' ? W.z0 : key === 's' ? W.z1 : e;
      tower(x + (key === 'w' ? 0 : 0), z, 6, 13, STONE, 0x8b3a2e);
    }
    // kale (keep): avlu surları + ana bina + 4 kule
    const K = P.keep, kx0 = K.x - K.w / 2, kx1 = K.x + K.w / 2, kz0 = K.z - K.d / 2, kz1 = K.z + K.d / 2;
    if (!orj('obj_mora_pok_bill_01_2007', K.x, K.z, { ry: Math.PI })) {
      wallRect(kx0, kz0, kx1, kz1, 11, 3, STONE, { s: [[K.x - 7, K.x + 7]] });
      for (const [x, z] of [[kx0, kz0], [kx1, kz0], [kx1, kz1], [kx0, kz1]]) tower(x, z, 8, 19, STONE, ELMO);
      box(K.x, ground(K.x - 12, K.z - 10, K.x + 12, K.z + 10) - 2, K.z - 8, 24, 24, 18, 0xb9b2a3); addGeo(PYR, K.x, H(K.x, K.z) + 22 + 4, K.z - 8, { ry: Math.PI / 4, sx: 20, sy: 8, sz: 20, color: KARUS });
    }
    banner(K.x - 14, kz1 + 4, KARUS); banner(K.x + 14, kz1 + 4, ELMO);
    // ışınlanma kapıları
    for (const g of P.gates) {
      const y = H(g.x, g.z), c = g.nation === 1 ? KARUS : ELMO;
      box(g.x - 4.5, y, g.z, 2, 10, 2, STONE); box(g.x + 4.5, y, g.z, 2, 10, 2, STONE); box(g.x, y + 10, g.z, 11, 2, 2, c, false);
    }
    // çeşme
    if (!orj('obj_turkey_fountain', P.fountain.x, P.fountain.z, { sink: 0.1 })) { const f = P.fountain, y = H(f.x, f.z); cyl(f.x, y, f.z, 5, 1.2, STONE, true); addGeo(CYL, f.x, y + 1.15, f.z, { sx: 4.3, sy: 0.2, sz: 4.3, color: 0x4aa0d8, jit: 0 }); cyl(f.x, y, f.z, 0.9, 4, STONE); addGeo(ICO, f.x, y + 4.4, f.z, { sx: 1, sy: 1, sz: 1, color: 0x7ac0e8 }); }
    // arena çemberleri (alçak taş kenar, 4 yönde boşluk)
    for (const r of P.arenas) {
      const gx = { n: [[(r[0] + r[2]) / 2 - 6, (r[0] + r[2]) / 2 + 6]], s: [[(r[0] + r[2]) / 2 - 6, (r[0] + r[2]) / 2 + 6]], e: [[(r[1] + r[3]) / 2 - 6, (r[1] + r[3]) / 2 + 6]], w: [[(r[1] + r[3]) / 2 - 6, (r[1] + r[3]) / 2 + 6]] };
      wallRect(r[0] - 3, r[1] - 3, r[2] + 3, r[3] + 3, 2.2, 1.6, 0xb0a898, gx);
      for (const [x, z] of [[r[0] - 3, r[1] - 3], [r[2] + 3, r[1] - 3], [r[2] + 3, r[3] + 3], [r[0] - 3, r[3] + 3]]) { cyl(x, H(x, z) - 1, z, 1.4, 9, 0xc8c0b0, true); addGeo(ICO, x, H(x, z) + 8.6, z, { sx: 1.1, sy: 1.1, sz: 1.1, color: 0xffb040 }); }
    }
    // evler
    let hc = 0;
    const BINA = ['obj_ka_house03', 'obj_ka_house04', 'obj_mora_bill_004_2007', 'obj_mora_bill_001_2007', 'obj_mora_pok_bill_03_2007', 'obj_mora_pok_bill_04_2007', 'obj_el_warehouse02', 'obj_mora_bill_005_2007'].filter((a) => O?.var(a));
    if (BINA.length) {
      for (const rc of P.houseRects) for (let x = rc[0] + 14; x < rc[2]; x += 34) for (let z = rc[1] + 14; z < rc[3]; z += 34) {
        if (R() < 0.15) continue; const ad = BINA[(R() * BINA.length) | 0], ry = ((R() * 4) | 0) * Math.PI / 2, px = x + (R() - 0.5) * 6, pz = z + (R() - 0.5) * 6, kc = P.keep, b = O.boyut(ad, ry); const r = Math.max(b.w, b.d) / 2;
        if (px > kc.x - kc.w / 2 - r - 6 && px < kc.x + kc.w / 2 + r + 6 && pz > kc.z - kc.d / 2 - r - 6 && pz < kc.z + kc.d / 2 + r + 6) continue;
        if (![[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => free(px + dx, pz + dz, 2, { road: 6, npc: 5 }))) continue;
        if (orj(ad, px, pz, { ry })) hc++;
      }
    } else for (const rc of P.houseRects) for (let x = rc[0] + 8; x < rc[2] - 4; x += 17) for (let z = rc[1] + 8; z < rc[3] - 4; z += 17) {
      if (R() < 0.18) continue; const w = 8 + R() * 3, d = 7 + R() * 2, h = 4 + R() * 1.5;
      const px = x + (R() - 0.5) * 3, pz = z + (R() - 0.5) * 3, kc = P.keep;
      if (px > kc.x - kc.w / 2 - 12 && px < kc.x + kc.w / 2 + 12 && pz > kc.z - kc.d / 2 - 12 && pz < kc.z + kc.d / 2 + 12) continue;
      if (!free(px, pz, 6, { road: 7 + w / 2 })) continue;
      house(px, pz, w, d, h, stucco[(R() * stucco.length) | 0], roofs[(R() * roofs.length) | 0], R() < 0.5 ? 0 : 0); hc++;
    }
    // gerçek NPC konumlarına göre: han, demirci, dükkânlar (NPC'nin arkasında), kahramanlar heykeli
    const LM = ['obj_zq_mora_smithy', 'obj_ka_house04', 'obj_el_warehouse02', 'obj_ka_house03', 'obj_mora_bill_004_2007', 'obj_mora_tent_b', 'obj_mora_tent_b'];
    (P.landmarks || []).forEach(([x, z, w, dd, h], i) => {
      const ad = LM[i % LM.length], b = O?.boyut(ad, 0), r = b ? Math.max(b.w, b.d) / 2 : 0;
      if (b && [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => free(x + dx, z + dz, 2, { road: 3, stone: false, npc: 3 })) && orj(ad, x, z)) return;
      if (!O && free(x, z, 3, { road: 3, stone: false, npc: 4 })) house(x, z, w, dd, h, 0xd9c7a0, 0x8b3a2e, 0);
    });
    for (const [x, z] of P.statues || []) { const y = H(x, z); cyl(x, y, z, 2.2, 1.2, STONE, true); cyl(x, y + 1.2, z, 0.9, 5, 0xb8b2a4); addGeo(ICO, x, y + 6.6, z, { sx: 1.3, sy: 1.6, sz: 1.3, color: x < 817 ? KARUS : ELMO }); }
    // pazar tezgâhları (meydanın kenarları; NPC'lerden uzak)
    { const awn = [0xb5342b, 0x2f5fb8, 0xd8a030, 0x3a8a4a]; let ti = 0;
      for (const [x, z] of [[748, 566], [748, 586], [866, 566], [866, 586], [800, 600], [834, 600], [748, 606], [866, 606]]) {
        if (!free(x, z, 1, { road: 1, stone: false, npc: 3 })) continue;
        if (O && orj(ti++ % 2 ? 'obj_04ka_gisatent01' : 'obj_04el_gisatent01', x, z, { ry: x < 817 ? Math.PI / 2 : -Math.PI / 2, s: 0.55 })) { orj(R() < 0.5 ? 'obj_turkey_box22' : 'cw_fort_barrel02', x + (x < 817 ? 4 : -4), z + 3, { solid: false }); continue; }
        const y = H(x, z), c = awn[ti % 4];
        box(x, y, z, 4, 1.2, 2, 0x7a5a3a, true); box(x - 1.8, y + 1.2, z - 0.9, 0.2, 2, 0.2, 0x5a3f28, false); box(x + 1.8, y + 1.2, z - 0.9, 0.2, 2, 0.2, 0x5a3f28, false);
        box(x, y + 3.2, z - 0.3, 4.6, 0.25, 2.8, c, false, 0.03); box(x, y + 1.2, z, 3, 0.5, 1.4, 0xd9b870, false);
      } }
    if (O) {
      for (const g of P.gates) orj('obj_mora_potal_day_2007', g.x, g.z + 4, { solid: false, sink: -0.05, s: 0.6 });
      const CIM = ['obj_mora_gass_puls_01_2007', 'obj_mora_grass_a03', 'obj_mora_grass_a01', 'obj_mora_grass001_2007'].filter((a) => O.var(a));
      for (let i = 0, k = 0; k < 260 && i < 4000 && CIM.length; i++) { const x = P.walls.x0 + 8 + R() * (P.walls.x1 - P.walls.x0 - 16), z = P.walls.z0 + 8 + R() * (P.walls.z1 - P.walls.z0 - 16); if (!free(x, z, 2, { road: 4, npc: 2 })) continue; O.put(CIM[(R() * CIM.length) | 0], x, z, { ry: R() * 6.28, y: H(x, z) - 0.05 }); k++; }
      const ESYA = ['obj_turkey_box11', 'obj_turkey_box22', 'cw_fort_barrel01', 'cw_fort_barrel02', 'obj_mora_big_soil_box_yellow_2007'].filter((a) => O.var(a));
      for (let i = 0, k = 0; k < 70 && i < 2000 && ESYA.length; i++) { const x = P.walls.x0 + 8 + R() * (P.walls.x1 - P.walls.x0 - 16), z = P.walls.z0 + 8 + R() * (P.walls.z1 - P.walls.z0 - 16); if (!free(x, z, 2, { road: 3, npc: 3 }) || !inSolid(x, z, 9)) continue; orj(ESYA[(R() * ESYA.length) | 0], x, z, { ry: ((R() * 4) | 0) * Math.PI / 2 }); k++; }   // bina kenarlarına
      for (let i = 0, k = 0; k < 90 && i < 2000; i++) { const x = P.walls.x0 + 6 + R() * (P.walls.x1 - P.walls.x0 - 12), z = P.walls.z0 + 6 + R() * (P.walls.z1 - P.walls.z0 - 12); if (!free(x, z, 1, { road: 2, npc: 2 }) || inSolid(x, z, 6) || !inSolid(x, z, 14)) continue; O.put('obj_mora_fence', x, z, { ry: ((R() * 4) | 0) * Math.PI / 2, y: H(x, z) - 0.05 }); k++; }   // bahçe çitleri
    }
    // sokak fenerleri (yollar boyunca)
    for (const rd of P.roads.slice(0, 4)) for (let i = 0; i + 1 < rd.length; i++) { const [a, b] = [rd[i], rd[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 8; t < L; t += 16) { const x = a[0] + (b[0] - a[0]) * t / L + 3.5, z = a[1] + (b[1] - a[1]) * t / L; if (!free(x, z, 2, { road: 2, stone: false })) continue; if (O && orj('obj_mora_light', x, z, { solid: false })) continue; const y = H(x, z); cyl(x, y, z, 0.18, 4, 0x3a3a3a); addGeo(ICO, x, y + 4.3, z, { sx: 0.45, sy: 0.45, sz: 0.45, color: 0xffd070, jit: 0 }); } }
    console.info('[CatKo] Moradon: ' + hc + ' ev');
  }

  // ======================= ULUS KALELERİ (Luferson / El Morad) =======================
  if (P.castle) {
    const W = P.walls, kar = zone === 'karus2004', C = kar ? KARUS : ELMO;
    wallRect(W.x0, W.z0, W.x1, W.z1, W.h, W.t, WALL, W.gaps);
    for (const [x, z] of [[W.x0, W.z0], [W.x1, W.z0], [W.x1, W.z1], [W.x0, W.z1]]) tower(x, z, 11, 20, STONE, C);
    for (const [key, list] of Object.entries(W.gaps)) for (const [a, b] of list) for (const e of [a, b]) {
      const x = key === 's' || key === 'n' ? e : key === 'w' ? W.x0 : W.x1, z = key === 'n' ? W.z0 : key === 's' ? W.z1 : e;
      tower(x, z, 7, 14, STONE, C); banner(x + (key === 's' || key === 'n' ? 0 : key === 'w' ? 5 : -5), z + (key === 's' ? -5 : key === 'n' ? 5 : 0), C, 13);
    }
    // ana kale
    if (!orj('obj_turkey_castle_t3', P.keep.x, P.keep.z, { ry: Math.PI })) box(P.keep.x, ground(P.keep.x - 30, P.keep.z - 25, P.keep.x + 30, P.keep.z + 25) - 2, P.keep.z, 60, 28, 50, 0xb9b2a3);
    // ışınlanma kapısı (kale içi): orijinal portal kapısı
    { const g = P.gates[0]; if (!orj('obj_el_potal_gate_2005', g.x, g.z, { s: 1.4, solid: false })) { const y = H(g.x, g.z); box(g.x - 4.5, y, g.z, 2, 10, 2, STONE); box(g.x + 4.5, y, g.z, 2, 10, 2, STONE); box(g.x, y + 10, g.z, 11, 2, 2, C, false, 0.02); } orj('obj_mora_potal_day_2007', g.x, g.z + 2, { solid: false, sink: -0.05, s: 0.6 }); }
    if (!orj('obj_turkey_fountain', P.fountain.x, P.fountain.z, { sink: 0.1 })) cyl(P.fountain.x, H(P.fountain.x, P.fountain.z), P.fountain.z, 5, 1.2, STONE, true);
    // evler
    const BK = (kar ? ['obj_ka_panhouse01', 'obj_ka_panhouse02', 'obj_ka_panhouse03', 'obj_ka_house03', 'obj_ka_house04', 'obj_mora_bill_004_2007'] : ['obj_el_tonghouse_02', 'obj_el_tonghouse_01', 'obj_el_warehouse02', 'obj_mora_bill_004_2007', 'obj_mora_bill_001_2007', 'obj_mora_pok_bill_03_2007']).filter((a) => O?.var(a));
    let hc = 0;
    for (const rc of P.houseRects) for (let x = rc[0] + 16; x < rc[2]; x += 36) for (let z = rc[1] + 16; z < rc[3]; z += 36) {
      if (!BK.length || R() < 0.12) continue; const ad = BK[(R() * BK.length) | 0], ry = ((R() * 4) | 0) * Math.PI / 2, px = x + (R() - 0.5) * 5, pz = z + (R() - 0.5) * 5, b = O.boyut(ad, ry), r = Math.max(b.w, b.d) / 2;
      if (![[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => free(px + dx, pz + dz, 2, { road: 6, npc: 0 }))) continue;
      if (Math.abs(px - P.keep.x) < 85 && Math.abs(pz - P.keep.z) < 70) continue;
      if (orj(ad, px, pz, { ry })) hc++;
    }
    // süs: fener, sandık, çit
    if (O) for (const rd of P.roads.slice(0, 2)) for (let i = 0; i + 1 < rd.length; i++) { const [a, b] = [rd[i], rd[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 12; t < L; t += 24) { const x = a[0] + (b[0] - a[0]) * t / L + 4, z = a[1] + (b[1] - a[1]) * t / L; if (free(x, z, 2, { road: 2, stone: false, npc: 0 })) orj(kar ? 'obj_ka_01_lamp' : 'etc_obj_b_el_lamp', x, z, { solid: false }); } }
    console.info('[CatKo] ' + zone + ': ' + hc + ' ev');
  }

  // ======================= ARDREAM / CZ =======================
  if (zone === 'freezone_a') {
    for (const f of P.forts) {
      const c = f.nation === 1 ? KARUS : ELMO, x0 = f.x - f.half, x1 = f.x + f.half, z0 = f.z - f.half, z1 = f.z + f.half, gaps = {};
      const mid = (a, b) => [[(a + b) / 2 - 8, (a + b) / 2 + 8]];
      for (const s of f.gaps) gaps[s] = (s === 'n' || s === 's') ? mid(x0, x1) : mid(z0, z1);
      wallRect(x0, z0, x1, z1, 10, 3, WALL, gaps);
      for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) tower(x, z, 9, 18, STONE, c);
      for (const s of f.gaps) for (const k of [-1, 1]) {
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const [gx, gz] = s === 'n' ? [mx + k * 9, z0] : s === 's' ? [mx + k * 9, z1] : s === 'e' ? [x1, mz + k * 9] : [x0, mz + k * 9];
        tower(gx, gz, 6, 14, STONE, c); banner(gx + (s === 'e' || s === 'w' ? 0 : 0), gz + (s === 'n' ? 5 : s === 's' ? -5 : 0), c, 13);
      }
      const bx = f.nation === 2 ? x0 + 16 : x1 - 16, bz = f.nation === 2 ? z1 - 16 : z0 + 16;   // kale arka köşe
      const FB = f.nation === 1 ? 'bat_ka_housetop01' : 'bat_ka_housetop2', ok2 = orj(O?.var(FB) ? FB : 'obj_ka_panhouse01', bx, bz, { ry: f.nation === 2 ? 0 : Math.PI });
      if (!ok2) { box(bx, ground(bx - 9, bz - 9, bx + 9, bz + 9) - 2, bz, 18, 16, 18, 0xb0a99a); addGeo(PYR, bx, H(bx, bz) + 14 + 4, bz, { ry: Math.PI / 4, sx: 15, sy: 8, sz: 15, color: c }); }
      if (O) for (const [dx, dz, ad] of [[-14, 8, 'obj_ka_panhouse02'], [10, -14, 'obj_el_tonghouse_02'], [-6, -16, 'obj_el_tonghouse_01']]) orj(ad, f.x + (f.nation === 2 ? dx : -dx), f.z + (f.nation === 2 ? dz : -dz), { ry: ((dx + dz) & 3) * Math.PI / 2 });
      banner(f.x + (f.nation === 2 ? 10 : -10), f.z + (f.nation === 2 ? -10 : 10), c, 14);
    }
    // merkez anıt: orijinal taş halkası (yoksa sütun + dikilitaş)
    if (O && O.var('obj_el_trans_stone8s') && O.var('obj_el_trans_stone5b')) { const m = P.monument; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; orj('obj_el_trans_stone8s', m.x + Math.cos(a) * m.r, m.z + Math.sin(a) * m.r, { ry: -a }); } orj('obj_el_trans_stone5b', m.x, m.z); orj('fire_a_big', m.x + 12, m.z, { solid: false }); orj('fire_a_big', m.x - 12, m.z, { solid: false }); }
    else { const m = P.monument, y = H(m.x, m.z); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, x = m.x + Math.cos(a) * m.r, z = m.z + Math.sin(a) * m.r; cyl(x, y - 1, z, 1.3, 10, 0xc8c0b0, true); box(x, y + 9, z, 3.2, 1.2, 3.2, 0xb0a898, false); }
      addGeo(new THREE.CylinderGeometry(0.5, 2.4, 1, 4), m.x, y + 9, m.z, { sy: 18, ry: Math.PI / 4, color: 0x8a8a92 }); solids.push([m.x - 2, m.z - 2, m.x + 2, m.z + 2]); soup.push(...aabbTris(m.x - 2, y, m.z - 2, m.x + 2, y + 18, m.z + 2));
      addGeo(ICO, m.x, y + 19, m.z, { sx: 1.5, sy: 1.5, sz: 1.5, color: 0xff9a40, jit: 0 }); }
    // gözetleme kuleleri
    for (const [x, z] of P.watch) if (free(x, z, 4, { road: 6 })) tower(x, z, 7, 16, DARK, 0x555566);
    if (O) {
      const CAL = ['obj_co_bush02', 'obj_co_bush01', 'obj_co_bush04', 'obj_co_dumbul02y', 'obj_co_dumbul07y', 'obj_co_ip03y'].filter((a) => O.var(a));
      for (let i = 0, k = 0; k < 900 && i < 6000 && CAL.length; i++) { const x = 30 + R() * (WORLD - 60), z = 30 + R() * (WORLD - 60); if (H(x, z) > 50 || !free(x, z, 1, { road: 3 })) continue; O.put(CAL[(R() * CAL.length) | 0], x, z, { ry: R() * 6.28, s: 0.8 + R() * 0.8, y: H(x, z) - 0.1 }); k++; }
      const KEM = ['obj_ka_bone01_big', 'obj_ka_bone02_head', 'obj_ka_bone05', 'obj_ka_bone03'].filter((a) => O.var(a));
      for (let i = 0, k = 0; k < 40 && i < 2000 && KEM.length; i++) { const x = 60 + R() * (WORLD - 120), z = 60 + R() * (WORLD - 120); if (nearFlatCore(x, z, 1.2) || !free(x, z, 6, { road: 6 })) continue; orj(KEM[(R() * KEM.length) | 0], x, z, { ry: R() * 6.28, solid: k % 3 === 0 }); k++; }
      for (const rd of P.roads) for (let i = 0; i + 1 < rd.length; i++) { const [a, b] = [rd[i], rd[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 20; t < L; t += 45) { const x = a[0] + (b[0] - a[0]) * t / L + 5, z = a[1] + (b[1] - a[1]) * t / L; if (free(x, z, 2, { road: 3 })) orj('obj_ka_01_lamp', x, z, { solid: false }); } }
      for (const f of P.forts) { for (const k of [-1, 1]) { orj('fire_a_big', f.x + k * 12, f.z + k * 4, { solid: false }); orj(R() < 0.5 ? 'obj_el_box00' : 'obj_el_box01', f.x + k * 20, f.z - k * 18); } }
    }
    // harabeler
    const RU = ['obj_ka_panhouse01', 'obj_ka_panhouse02', 'obj_ka_panhouse03', 'obj_el_tonghouse_02', 'obj_el_tonghouse_01', 'obj_el_tonghouse_side01', 'bat_ka_housetop01'].filter((a) => O?.var(a));
    for (let i = 0, ok = 0; ok < P.ruins && i < 400; i++) {
      const x = 80 + R() * (WORLD - 160), z = 80 + R() * (WORLD - 160); if (nearFlatCore(x, z, 1.4) || !free(x, z, 12, { road: 14 })) continue;
      if (RU.length && orj(RU[(R() * RU.length) | 0], x, z, { ry: ((R() * 4) | 0) * Math.PI / 2 })) { ok++; continue; }
      ok++;
      for (let k = 0; k < 4; k++) { const l = 5 + R() * 6, h = 2 + R() * 5, horiz = R() < 0.5, px = x + (R() - 0.5) * 14, pz = z + (R() - 0.5) * 14; if (!free(px, pz, 1, { road: 3 })) continue; box(px, ground(px - 3, pz - 3, px + 3, pz + 3) - 1, pz, horiz ? l : 1.6, h + 1, horiz ? 1.6 : l, 0x7d776c); }
    }
  }

  // ======================= ORTAK: ağaç + kaya =======================
  { let n = 0; const T = P.trees;
    const AG = (zone === 'karus2004' ? ['obj_ka_treea', 'obj_ka_treeb', 'obj_ka_treec', 'obj_ka_treed', 'obj_ka_treee', 'obj_ka_tree_bra', 'obj_ka_tree_brb'] : zone === 'elmo2004' ? ['obj_el_treec', 'obj_el_tree_bra', 'obj_el_tree_fla', 'obj_war_tree_out02', 'obj_tree3_yelotree02_s'] : zone === 'moradon' ? ['obj_ka_treea', 'obj_ka_treeb', 'obj_ka_treec', 'obj_ka_treed', 'obj_ka_treee', 'obj_war_tree_out02', 'obj_tree3_yelotree02_s', 'obj_tree3_bud01', 'obj_el_tree_bra']
      : ['obj_el_treec', 'obj_ka_tree_bra', 'obj_ka_treed', 'obj_ka_treee', 'obj_tree3_smoltree04', 'obj_el_tree_fla', 'obj_ka_tree_brb']).filter((a) => O?.var(a));
    const AR = (zone === 'moradon' || P.castle ? ['obj_mora_ston_a', 'obj_war_ston03', 'obj_war_ston02', 'obj_04co_ston_b02'] : ['obj_el_trans_stone2', 'obj_el_trans_stone9', 'obj_el_trans_stone8', 'obj_el_trans_stone6', 'obj_el_trans_stone3']).filter((a) => O?.var(a));
    const NMAX = AG.length ? 650 : 1100, STEP = AG.length ? 16 : 11;
    for (let x = 14; x < WORLD - 10 && n < NMAX; x += STEP) for (let z = 14; z < WORLD - 10 && n < NMAX; z += STEP) {
      const px = x + (R() - 0.5) * 9, pz = z + (R() - 0.5) * 9, forest = fbm(px / 70, pz / 70, P.seed + 3);
      const e = Math.min(px, pz, WORLD - px, WORLD - pz), h = H(px, pz);
      if (h > 52) continue;
      if (R() > T.density * (forest > 0.5 ? 0.95 : 0.1) * (e < 220 ? 1.2 : 1)) continue;
      if (nearFlatCore(px, pz, 1.0) || !free(px, pz, 2, { road: 5 })) continue;
      if (P.walls && px > P.walls.x0 - 10 && px < P.walls.x1 + 10 && pz > P.walls.z0 - 10 && pz < P.walls.z1 + 10) continue;
      const s = 0.8 + R() * 0.9;
      if (AG.length) { const ad = AG[(R() * AG.length) | 0], t = O.boyut(ad, 0, s), r = Math.max(0.8, Math.min(t.w, t.d) * 0.12); if (!free(px, pz, 1, { road: 5 })) continue; const y = H(px, pz) - 0.2; O.put(ad, px, pz, { ry: R() * 6.28, s: s * (0.85 + R() * 0.4), y }); solids.push([px - r, pz - r, px + r, pz + r]); soup.push(...aabbTris(px - r, y, pz - r, px + r, y + 6, pz + r)); n++; continue; }
      (h > 20 || R() < 0.55) ? pine(px, pz, s) : roundTree(px, pz, s); n++;
    }
    for (let i = 0, k = 0; k < P.rocks && i < 3000; i++) {
      const x = 20 + R() * (WORLD - 40), z = 20 + R() * (WORLD - 40); if (nearFlatCore(x, z, 1.0) || !free(x, z, 1, { road: 3 })) continue; k++;
      const s = 0.8 + R() * 2.4;
      if (AR.length) { const ad = AR[(R() * AR.length) | 0], sc = 0.7 + R() * 0.9, y = H(x, z) - 0.4; O.put(ad, x, z, { ry: R() * 6.28, s: sc, y }); continue; }
      addGeo(ICO, x, H(x, z) + s * 0.35, z, { rx: R() * 3, ry: R() * 3, sx: s * 1.3, sy: s * 0.8, sz: s, color: 0x7d7a74 });
    }
    console.info('[CatKo] ' + zone + ': ' + n + ' ağaç');
  }

  // ---------- mesh ----------
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'catko-dunya'; mesh.frustumCulled = false; world.add(mesh);
  // ışınlanma kapısı parıltısı (yarı saydam)
  for (const g of P.gates || []) {
    const c = g.nation === 1 ? KARUS : ELMO, m = new THREE.Mesh(new THREE.PlaneGeometry(7, 9), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(g.x, H(g.x, g.z) + 5, g.z); world.add(m);
  }
  if (O) await O.build(world).catch((e) => console.warn('orijinal şekiller', e));
  // çarpışma
  if (soup.length) { const f = new Float32Array(soup); if (!state.col) state.col = new Collision(f, state.world); }
  window.KO_WORLD = { zone, solids, blocked: (x, z, m = 0.8) => solids.some((s) => x > s[0] - m && x < s[2] + m && z > s[1] - m && z < s[3] + m) };
  console.info('%c[CatKo] dünya kuruldu: ' + zone + ' — ' + (buf.p.length / 9 | 0) + ' üçgen, ' + solids.length + ' çarpışma kutusu', 'color:#e8a25c');
  return mesh;
}
