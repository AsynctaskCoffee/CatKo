// CatKo — prosedürel dünya planı. Gerçek harita dosyaları pakette olmadığından Moradon ve Ardream (CZ) buradan üretilir.
// Hem derleme sırasında (tools-duz-harita.mjs: arazi + doku) hem istemcide (js/catko-dunya.js: kale, bina, ağaç) kullanılır → ikisi uyumlu kalır.
// Saf veri + saf fonksiyon (DOM yok).

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(ix, iz, seed) { let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, seed, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f, seed + i * 17); a *= 0.5; f *= 2.03; } return s; }   // ≈ 0..0.94

export function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function distPoly(px, pz, pts) { let d = 1e9; for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, distSeg(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; }

export const WORLD = 1024;

export const PLAN = {
  // ─────────────────────────── Moradon (şehir) ───────────────────────────
  moradon: {
    seed: 11, base: 5, hill: 1.0, start: [760, 560],
    flats: [{ x: 790, z: 490, r: 175, f: 75, h: 5 }],
    lakes: [{ x: 600, z: 705, r: 44 }], rivers: [],
    roads: [
      [[797.7, 528], [797.7, 552], [760, 560]], [[837.4, 528], [837.4, 552], [870, 560]],
      [[760, 560], [722, 545], [710, 500]], [[710, 438], [710, 413]],
      [[870, 560], [935, 560], [1000, 545]], [[817, 556], [817, 640], [790, 720], [800, 800], [830, 900]],
      [[760, 560], [690, 575], [600, 590], [480, 560], [380, 540]], [[790, 430], [790, 340], [770, 260], [740, 150]],
      [[817, 580], [817, 556]],
    ],
    stones: [[770, 512, 865, 548], [785, 548, 870, 582]], stoneCircles: [], sands: [[684, 440, 735, 491], [684, 360, 735, 411]],
    walls: { x0: 640, x1: 940, z0: 330, z1: 640, h: 9, t: 3, gaps: { s: [[790, 845]], n: [[765, 815]], e: [[535, 590]], w: [[535, 590]] } },
    keep: { x: 865, z: 378, w: 60, d: 52, gap: 's' },
    houseRects: [[745, 345, 830, 470], [850, 438, 930, 520], [700, 592, 780, 632], [850, 592, 930, 632], [650, 522, 700, 560]],
    arenas: [[684, 440, 735, 491], [684, 360, 735, 411]],
    gates: [{ x: 797.7, z: 527.5, nation: 1 }, { x: 837.4, z: 527.5, nation: 2 }],
    fountain: { x: 817, z: 538 },
    trees: { density: 0.55, keepOut: 14 }, rocks: 90,
  },
  // ─────────────────────────── Ardream / CZ (serbest PK) ───────────────────────────
  freezone_a: {
    seed: 23, base: 12, hill: 1.7, start: [212, 898],
    flats: [{ x: 204, z: 907, r: 62, f: 45, h: 14 }, { x: 840, z: 125, r: 62, f: 45, h: 14 }, { x: 520, z: 520, r: 55, f: 60, h: 10 }],
    lakes: [{ x: 330, z: 300, r: 38 }, { x: 730, z: 760, r: 34 }],
    rivers: [{ w: 11, pts: [[120, 200], [260, 255], [330, 300]] }, { w: 11, pts: [[730, 760], [800, 820], [900, 900]] }],
    roads: [
      [[840, 125], [800, 190], [700, 300], [600, 430], [520, 520], [430, 610], [330, 730], [250, 840], [204, 907]],
      [[520, 520], [640, 540], [780, 520], [900, 480]], [[520, 520], [400, 470], [250, 400], [120, 380]],
    ],
    stones: [], stoneCircles: [{ x: 520, z: 520, r: 26 }, { x: 204, z: 907, r: 22 }, { x: 840, z: 125, r: 22 }], sands: [],
    forts: [{ x: 204, z: 907, nation: 2, half: 36, gaps: ['n', 'e'] }, { x: 840, z: 125, nation: 1, half: 36, gaps: ['s', 'w'] }],
    monument: { x: 520, z: 520, r: 22 },
    watch: [[330, 330], [720, 720], [560, 260], [480, 780], [700, 360], [350, 640]],
    ruins: 14, trees: { density: 0.6, keepOut: 10 }, rocks: 160,
  },
};

const inRect = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];

// yükseklik (m)
export function heightAt(zone, x, z) {
  const P = PLAN[zone]; if (!P) return 0;
  const e = Math.min(x, z, WORLD - x, WORLD - z);
  const hills = (fbm(x / 120, z / 120, P.seed) - 0.47) * 70 * P.hill;
  const detail = (fbm(x / 26, z / 26, P.seed + 5) - 0.5) * 5;
  const rim = 1 - smooth(30, 240, e);
  let h = P.base + Math.max(0, hills) + Math.min(0, hills) * 0.35 + detail + rim * (44 + 26 * fbm(x / 70, z / 70, P.seed + 9));
  for (const f of P.flats) { const w = 1 - smooth(f.r, f.r + f.f, Math.hypot(x - f.x, z - f.z)); h = lerp(h, f.h, w); }
  const wd = waterDist(P, x, z);
  if (wd < 6) { const k = smooth(-4, 6, wd); h = lerp(1.8, h, k); }
  return Math.max(0, h);
}
// <0 suyun içi; ~0 kıyı
export function waterDist(P, x, z) {
  let d = 1e9;
  for (const l of P.lakes || []) d = Math.min(d, Math.hypot(x - l.x, z - l.z) - l.r);
  for (const r of P.rivers || []) d = Math.min(d, distPoly(x, z, r.pts) - r.w / 2);
  return d;
}
export function roadDist(P, x, z) { let d = 1e9; for (const r of P.roads || []) d = Math.min(d, distPoly(x, z, r)); return d; }
export function onStone(P, x, z) {
  for (const r of P.stones || []) if (inRect(r, x, z)) return true;
  for (const c of P.stoneCircles || []) if (Math.hypot(x - c.x, z - c.z) < c.r) return true;
  if (P.fountain && Math.hypot(x - P.fountain.x, z - P.fountain.z) < 9) return true;
  return false;
}
export function onSand(P, x, z) { for (const r of P.sands || []) if (inRect(r, x, z)) return true; return false; }

// karo (atlas) indeksleri
export const TILE = { GRASS: 0, GRASS2: 1, DIRT: 2, STONE: 3, SAND: 4, ROCK: 5, WATER: 6, SNOW: 7 };
export function tileAt(zone, x, z, h, slope) {
  const P = PLAN[zone], wd = waterDist(P, x, z);
  if (wd < 0) return TILE.WATER;
  if (wd < 4.5) return TILE.SAND;
  if (onSand(P, x, z)) return TILE.SAND;
  if (onStone(P, x, z)) return TILE.STONE;
  if (roadDist(P, x, z) < 3.3) return TILE.DIRT;
  if (h > 82) return TILE.SNOW;
  if (slope > 0.95 || h > 58) return TILE.ROCK;
  return fbm(x / 40, z / 40, P.seed + 31) > 0.5 ? TILE.GRASS2 : TILE.GRASS;
}
