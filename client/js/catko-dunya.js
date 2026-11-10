// CatKo — prosedürel yapılar: şehir surları, kale, kule, ev, çeşme, ağaç, kaya, harabe, anıt. Çarpışmalı (js/collision.js'e üçgen verir).
// Düzen js/catko-plan.js'ten gelir (arazi/doku ile aynı kaynak). Botlar için window.KO_WORLD.solids (AABB listesi) yayınlanır.
import { PLAN, rng, fbm, distSeg, roadDist, onStone, waterDist, WORLD } from './catko-plan.js';

const KARUS = 0xb5342b, ELMO = 0x2f5fb8;

export async function dunyaKur({ THREE, zone, world, state, Collision, base }) {
  const P = PLAN[zone]; if (!P) return null;
  const R = rng(P.seed * 977 + 5);
  const H = (x, z) => state.heightAt(x, z);
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
      const k = 1 + (R() - 0.5) * 2 * jit; tmpC.set(color);
      for (let v = 0; v < 3; v++) { buf.p.push(pos[i + v * 3], pos[i + v * 3 + 1], pos[i + v * 3 + 2]); buf.n.push(nor[i + v * 3], nor[i + v * 3 + 1], nor[i + v * 3 + 2]); buf.c.push(tmpC.r * k, tmpC.g * k, tmpC.b * k); }
      if (solid) for (let v = 0; v < 9; v++) soup.push(pos[i + v]);
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

  // sabit mimari
  function tower(x, z, s, h, color, roofColor) {
    const g = ground(x - s / 2, z - s / 2, x + s / 2, z + s / 2);
    box(x, g - 3, z, s, h + 3, s, color);
    box(x, g + h, z, s + 1.6, 1.2, s + 1.6, color, false);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(x + dx * (s / 2 + 0.2), g + h + 1.2, z + dz * (s / 2 + 0.2), 1.4, 1.4, 1.4, color, false);
    addGeo(PYR, x, g + h + 1.2 + 3.2, z, { ry: Math.PI / 4, sx: s * 0.78, sy: 6.4, sz: s * 0.78, color: roofColor });
  }
  function wallLine(ax, az, bx, bz, h, t, color) {   // yalnız eksen hizalı
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
    wallRect(kx0, kz0, kx1, kz1, 11, 3, STONE, { s: [[K.x - 7, K.x + 7]] });
    for (const [x, z] of [[kx0, kz0], [kx1, kz0], [kx1, kz1], [kx0, kz1]]) tower(x, z, 8, 19, STONE, ELMO);
    box(K.x, ground(K.x - 12, K.z - 10, K.x + 12, K.z + 10) - 2, K.z - 8, 24, 24, 18, 0xb9b2a3); addGeo(PYR, K.x, H(K.x, K.z) + 22 + 4, K.z - 8, { ry: Math.PI / 4, sx: 20, sy: 8, sz: 20, color: KARUS });
    banner(K.x - 14, kz1 + 4, KARUS); banner(K.x + 14, kz1 + 4, ELMO);
    // ışınlanma kapıları
    for (const g of P.gates) {
      const y = H(g.x, g.z), c = g.nation === 1 ? KARUS : ELMO;
      box(g.x - 4.5, y, g.z, 2, 10, 2, STONE); box(g.x + 4.5, y, g.z, 2, 10, 2, STONE); box(g.x, y + 10, g.z, 11, 2, 2, c, false);
    }
    // çeşme
    { const f = P.fountain, y = H(f.x, f.z); cyl(f.x, y, f.z, 5, 1.2, STONE, true); addGeo(CYL, f.x, y + 1.15, f.z, { sx: 4.3, sy: 0.2, sz: 4.3, color: 0x4aa0d8, jit: 0 }); cyl(f.x, y, f.z, 0.9, 4, STONE); addGeo(ICO, f.x, y + 4.4, f.z, { sx: 1, sy: 1, sz: 1, color: 0x7ac0e8 }); }
    // arena çemberleri (alçak taş kenar, 4 yönde boşluk)
    for (const r of P.arenas) {
      const gx = { n: [[(r[0] + r[2]) / 2 - 6, (r[0] + r[2]) / 2 + 6]], s: [[(r[0] + r[2]) / 2 - 6, (r[0] + r[2]) / 2 + 6]], e: [[(r[1] + r[3]) / 2 - 6, (r[1] + r[3]) / 2 + 6]], w: [[(r[1] + r[3]) / 2 - 6, (r[1] + r[3]) / 2 + 6]] };
      wallRect(r[0] - 3, r[1] - 3, r[2] + 3, r[3] + 3, 2.2, 1.6, 0xb0a898, gx);
      for (const [x, z] of [[r[0] - 3, r[1] - 3], [r[2] + 3, r[1] - 3], [r[2] + 3, r[3] + 3], [r[0] - 3, r[3] + 3]]) { cyl(x, H(x, z) - 1, z, 1.4, 9, 0xc8c0b0, true); addGeo(ICO, x, H(x, z) + 8.6, z, { sx: 1.1, sy: 1.1, sz: 1.1, color: 0xffb040 }); }
    }
    // evler
    let hc = 0;
    for (const rc of P.houseRects) for (let x = rc[0] + 8; x < rc[2] - 4; x += 17) for (let z = rc[1] + 8; z < rc[3] - 4; z += 17) {
      if (R() < 0.18) continue; const w = 8 + R() * 3, d = 7 + R() * 2, h = 4 + R() * 1.5;
      const px = x + (R() - 0.5) * 3, pz = z + (R() - 0.5) * 3, kc = P.keep;
      if (px > kc.x - kc.w / 2 - 12 && px < kc.x + kc.w / 2 + 12 && pz > kc.z - kc.d / 2 - 12 && pz < kc.z + kc.d / 2 + 12) continue;
      if (!free(px, pz, 6, { road: 7 + w / 2 })) continue;
      house(px, pz, w, d, h, stucco[(R() * stucco.length) | 0], roofs[(R() * roofs.length) | 0], R() < 0.5 ? 0 : 0); hc++;
    }
    // gerçek NPC konumlarına göre: han, demirci, dükkânlar (NPC'nin arkasında), kahramanlar heykeli
    for (const [x, z, w, dd, h] of P.landmarks || []) if (free(x, z, 3, { road: 3, stone: false, npc: 4 })) house(x, z, w, dd, h, 0xd9c7a0, 0x8b3a2e, 0);
    for (const [x, z] of P.statues || []) { const y = H(x, z); cyl(x, y, z, 2.2, 1.2, STONE, true); cyl(x, y + 1.2, z, 0.9, 5, 0xb8b2a4); addGeo(ICO, x, y + 6.6, z, { sx: 1.3, sy: 1.6, sz: 1.3, color: x < 817 ? KARUS : ELMO }); }
    // pazar tezgâhları (meydanın kenarları; NPC'lerden uzak)
    { const awn = [0xb5342b, 0x2f5fb8, 0xd8a030, 0x3a8a4a]; let ti = 0;
      for (const [x, z] of [[748, 566], [748, 586], [866, 566], [866, 586], [800, 600], [834, 600], [748, 606], [866, 606]]) {
        if (!free(x, z, 1, { road: 1, stone: false, npc: 3 })) continue; const y = H(x, z), c = awn[ti++ % 4];
        box(x, y, z, 4, 1.2, 2, 0x7a5a3a, true); box(x - 1.8, y + 1.2, z - 0.9, 0.2, 2, 0.2, 0x5a3f28, false); box(x + 1.8, y + 1.2, z - 0.9, 0.2, 2, 0.2, 0x5a3f28, false);
        box(x, y + 3.2, z - 0.3, 4.6, 0.25, 2.8, c, false, 0.03); box(x, y + 1.2, z, 3, 0.5, 1.4, 0xd9b870, false);
      } }
    // sokak fenerleri (yollar boyunca)
    for (const rd of P.roads.slice(0, 4)) for (let i = 0; i + 1 < rd.length; i++) { const [a, b] = [rd[i], rd[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 8; t < L; t += 16) { const x = a[0] + (b[0] - a[0]) * t / L + 3.5, z = a[1] + (b[1] - a[1]) * t / L; if (!free(x, z, 2, { road: 2, stone: false })) continue; const y = H(x, z); cyl(x, y, z, 0.18, 4, 0x3a3a3a); addGeo(ICO, x, y + 4.3, z, { sx: 0.45, sy: 0.45, sz: 0.45, color: 0xffd070, jit: 0 }); } }
    console.info('[CatKo] Moradon: ' + hc + ' ev');
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
      box(bx, ground(bx - 9, bz - 9, bx + 9, bz + 9) - 2, bz, 18, 16, 18, 0xb0a99a); addGeo(PYR, bx, H(bx, bz) + 14 + 4, bz, { ry: Math.PI / 4, sx: 15, sy: 8, sz: 15, color: c });
      banner(f.x + (f.nation === 2 ? 10 : -10), f.z + (f.nation === 2 ? -10 : 10), c, 14);
    }
    // merkez anıt: 8 sütun + dikilitaş + meşaleler
    { const m = P.monument, y = H(m.x, m.z); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, x = m.x + Math.cos(a) * m.r, z = m.z + Math.sin(a) * m.r; cyl(x, y - 1, z, 1.3, 10, 0xc8c0b0, true); box(x, y + 9, z, 3.2, 1.2, 3.2, 0xb0a898, false); }
      addGeo(new THREE.CylinderGeometry(0.5, 2.4, 1, 4), m.x, y + 9, m.z, { sy: 18, ry: Math.PI / 4, color: 0x8a8a92 }); solids.push([m.x - 2, m.z - 2, m.x + 2, m.z + 2]); soup.push(...aabbTris(m.x - 2, y, m.z - 2, m.x + 2, y + 18, m.z + 2));
      addGeo(ICO, m.x, y + 19, m.z, { sx: 1.5, sy: 1.5, sz: 1.5, color: 0xff9a40, jit: 0 }); }
    // gözetleme kuleleri
    for (const [x, z] of P.watch) if (free(x, z, 4, { road: 6 })) tower(x, z, 7, 16, DARK, 0x555566);
    // harabeler
    for (let i = 0, ok = 0; ok < P.ruins && i < 400; i++) {
      const x = 80 + R() * (WORLD - 160), z = 80 + R() * (WORLD - 160); if (nearFlatCore(x, z, 1.4) || !free(x, z, 6, { road: 8 })) continue; ok++;
      for (let k = 0; k < 4; k++) { const l = 5 + R() * 6, h = 2 + R() * 5, horiz = R() < 0.5, px = x + (R() - 0.5) * 14, pz = z + (R() - 0.5) * 14; if (!free(px, pz, 1, { road: 3 })) continue; box(px, ground(px - 3, pz - 3, px + 3, pz + 3) - 1, pz, horiz ? l : 1.6, h + 1, horiz ? 1.6 : l, 0x7d776c); }
    }
  }

  // ======================= ORTAK: ağaç + kaya =======================
  { let n = 0; const T = P.trees;
    for (let x = 14; x < WORLD - 10 && n < 1100; x += 11) for (let z = 14; z < WORLD - 10 && n < 1100; z += 11) {
      const px = x + (R() - 0.5) * 9, pz = z + (R() - 0.5) * 9, forest = fbm(px / 70, pz / 70, P.seed + 3);
      const e = Math.min(px, pz, WORLD - px, WORLD - pz), h = H(px, pz);
      if (h > 52) continue;
      if (R() > T.density * (forest > 0.5 ? 0.95 : 0.1) * (e < 220 ? 1.2 : 1)) continue;
      if (nearFlatCore(px, pz, 1.0) || !free(px, pz, 2, { road: 5 })) continue;
      if (P.walls && px > P.walls.x0 - 10 && px < P.walls.x1 + 10 && pz > P.walls.z0 - 10 && pz < P.walls.z1 + 10) continue;
      const s = 0.8 + R() * 0.9; (h > 20 || R() < 0.55) ? pine(px, pz, s) : roundTree(px, pz, s); n++;
    }
    for (let i = 0, k = 0; k < P.rocks && i < 3000; i++) {
      const x = 20 + R() * (WORLD - 40), z = 20 + R() * (WORLD - 40); if (nearFlatCore(x, z, 1.0) || !free(x, z, 1, { road: 3 })) continue; k++;
      const s = 0.8 + R() * 2.4; addGeo(ICO, x, H(x, z) + s * 0.35, z, { rx: R() * 3, ry: R() * 3, sx: s * 1.3, sy: s * 0.8, sz: s, color: 0x7d7a74 });
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
  // çarpışma
  if (soup.length) { const f = new Float32Array(soup); if (!state.col) state.col = new Collision(f, state.world); }
  window.KO_WORLD = { zone, solids, blocked: (x, z, m = 0.8) => solids.some((s) => x > s[0] - m && x < s[2] + m && z > s[1] - m && z < s[3] + m) };
  console.info('%c[CatKo] dünya kuruldu: ' + zone + ' — ' + (buf.p.length / 9 | 0) + ' üçgen, ' + solids.length + ' çarpışma kutusu', 'color:#e8a25c');
  return mesh;
}
