// Nesne çarpışması — CN3ShapeMgr::CheckCollision / GetHeightNearstPos ve
// CPlayerMySelf::CheckCollision hareket kurallarının karşılığı.
// Aynı üçgen kümesi hem engel (dik yüzler) hem de üstünde yürünen zemin (köprü, merdiven, platform) olarak kullanılır.

const CELL = 4;                       // CELL_SUB_SIZE (m)
export const MAX_INCLINE_CLIMB = 0.6430; // 40 derece

export class Collision {
  constructor(faces, worldSize) {
    this.f = faces; this.n = worldSize / CELL | 0;
    const buckets = new Map();
    const tris = faces.length / 9;
    for (let t = 0; t < tris; t++) {
      const o = t * 9;
      const x0 = Math.min(faces[o], faces[o + 3], faces[o + 6]), x1 = Math.max(faces[o], faces[o + 3], faces[o + 6]);
      const z0 = Math.min(faces[o + 2], faces[o + 5], faces[o + 8]), z1 = Math.max(faces[o + 2], faces[o + 5], faces[o + 8]);
      const cx0 = Math.max(0, Math.floor(x0 / CELL)), cx1 = Math.min(this.n - 1, Math.floor(x1 / CELL));
      const cz0 = Math.max(0, Math.floor(z0 / CELL)), cz1 = Math.min(this.n - 1, Math.floor(z1 / CELL));
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx * this.n + cz; let a = buckets.get(k); if (!a) buckets.set(k, (a = [])); a.push(t);
      }
    }
    this.cells = buckets;
    this.stamp = new Uint32Array(tris); this.gen = 1;
  }

  // Möller–Trumbore (çift yüzlü). t döner ya da -1
  ray(t, ox, oy, oz, dx, dy, dz) {
    const f = this.f, o = t * 9;
    const e1x = f[o + 3] - f[o], e1y = f[o + 4] - f[o + 1], e1z = f[o + 5] - f[o + 2];
    const e2x = f[o + 6] - f[o], e2y = f[o + 7] - f[o + 1], e2z = f[o + 8] - f[o + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-8) return -1;
    const inv = 1 / det;
    const tx = ox - f[o], ty = oy - f[o + 1], tz = oz - f[o + 2];
    const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) return -1;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) return -1;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return tt >= 0 ? tt : -1;
  }

  *trisNear(x0, z0, x1, z1) {
    const g = ++this.gen;
    const cx0 = Math.max(0, Math.floor(Math.min(x0, x1) / CELL)), cx1 = Math.min(this.n - 1, Math.floor(Math.max(x0, x1) / CELL));
    const cz0 = Math.max(0, Math.floor(Math.min(z0, z1) / CELL)), cz1 = Math.min(this.n - 1, Math.floor(Math.max(z0, z1) / CELL));
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const a = this.cells.get(cx * this.n + cz); if (!a) continue;
      for (const t of a) { if (this.stamp[t] === g) continue; this.stamp[t] = g; yield t; }
    }
  }

  /** p'den dir yönünde len mesafe içinde bir yüzey var mı? En yakın mesafe ya da -1 */
  segment(px, py, pz, dx, dy, dz, len) {
    let best = -1;
    for (const t of this.trisNear(px, pz, px + dx * len, pz + dz * len)) {
      const d = this.ray(t, px, py, pz, dx, dy, dz);
      if (d >= 0 && d <= len && (best < 0 || d < best)) best = d;
    }
    return best;
  }

  /** (x,z) üzerindeki yüzeylerden y'ye en yakın olanın yüksekliği (yoksa -Infinity) + normal */
  heightNear(x, y, z, outNormal) {
    let best = Infinity, h = -Infinity;
    for (const t of this.trisNear(x, z, x, z)) {
      const d = this.ray(t, x, 5000, z, 0, -1, 0);
      if (d < 0) continue;
      const hy = 5000 - d;
      if (Math.abs(hy - y) < best) {
        best = Math.abs(hy - y); h = hy;
        if (outNormal) {
          const f = this.f, o = t * 9;
          const ax = f[o + 3] - f[o], ay = f[o + 4] - f[o + 1], az = f[o + 5] - f[o + 2];
          const bx = f[o + 6] - f[o], by = f[o + 7] - f[o + 1], bz = f[o + 8] - f[o + 2];
          let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1;
          if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
          outNormal.x = nx / l; outNormal.y = ny / l; outNormal.z = nz / l;
        }
      }
    }
    return h;
  }

  /** (x,z) üzerinde yMax'ı aşmayan en yüksek yüzey (adım yüksekliği içindeki rampa/basamak önceliklidir; yoksa -Infinity) */
  heightBelow(x, yMax, z, outNormal) {
    let h = -Infinity, bt = -1;
    for (const t of this.trisNear(x, z, x, z)) {
      const d = this.ray(t, x, 5000, z, 0, -1, 0);
      if (d < 0) continue;
      const hy = 5000 - d;
      if (hy <= yMax && hy > h) { h = hy; bt = t; }
    }
    if (outNormal && bt >= 0) {
      const f = this.f, o = bt * 9;
      const ax = f[o + 3] - f[o], ay = f[o + 4] - f[o + 1], az = f[o + 5] - f[o + 2];
      const bx = f[o + 6] - f[o], by = f[o + 7] - f[o + 1], bz = f[o + 8] - f[o + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      outNormal.x = nx / l; outNormal.y = ny / l; outNormal.z = nz / l;
    }
    return h;
  }
}

/**
 * Bir hareket adımı (orijinal kurallar). Başarılıysa {x,y,z}, engellenirse null.
 *  1) ayaktan 0.5 m yukarıdan hareket yönünde yüzey → engel
 *  2) hedefte, mevcut yüksekliğe yakın bir yüzey araziden yüksekse ve adım sınırı içindeyse üstüne çık
 *  3) değilse arazi eğimi 40°'den dikse ve yokuş yukarı gidiliyorsa engel
 */
export function moveStep(col, terrainH, terrainN, p, dx, dz, dist, worldSize, ghost = false) {
  // ghost (GM): duvarlar ve dik yokuşlar engellemez; köprü/zemin yüzeyleri yine takip edilir
  const nx = p.x + dx * dist, nz = p.z + dz * dist;
  if (nx < 1 || nz < 1 || nx > worldSize - 1 || nz > worldSize - 1) return null;
  if (col && !ghost && col.segment(p.x, p.y + 0.5, p.z, dx, 0, dz, dist) >= 0) return null;
  if (col?.engeller?.size && !ghost && engelKeser(col.engeller, p.x, p.z, nx, nz)) return null;   // kapalı kapılar (Monster Stone Gate)
  const yT = terrainH(nx, nz);
  const nrm = { x: 0, y: 1, z: 0 };
  const yC = col ? col.heightBelow(nx, p.y + 0.5, nz, nrm) : -Infinity;   // merdiven/rampa: adım içindeki en yüksek yüzey
  if (yC > yT && yC < p.y + 0.5) {
    const hx = nrm.x, hz = nrm.z;
    if (!ghost && Math.hypot(hx, hz) > MAX_INCLINE_CLIMB && hx * dx + hz * dz <= 0) return null;
    return { x: nx, y: yC, z: nz };
  }
  const tn = terrainN(nx, nz);
  if (!ghost && Math.hypot(tn.x, tn.z) > MAX_INCLINE_CLIMB && tn.x * dx + tn.z * dz <= 0) return null;
  return { x: nx, y: yT, z: nz };
}

// hareket çizgisi (p → n) bir engel çizgisini (0,4 m pay ile) keser mi
function engelKeser(engeller, px, pz, nx, nz) {
  for (const e of engeller.values()) {
    if (!e.aktif()) continue;
    const ex = e.bx - e.ax, ez = e.bz - e.az, L = Math.hypot(ex, ez) || 1;
    const yan = (x, z) => ((x - e.ax) * ez - (z - e.az) * ex) / L;   // engel çizgisine işaretli uzaklık
    const s1 = yan(px, pz), s2 = yan(nx, nz);
    const t = ((nx - e.ax) * ex + (nz - e.az) * ez) / (L * L);
    if (t < -0.05 || t > 1.05) continue;
    if (Math.abs(s2) < 0.4 && Math.abs(s2) <= Math.abs(s1) + 1e-6) return true;   // kapıya yaklaşırken dur
    if (s1 * s2 < 0) return true;   // çizginin öbür yanına geçiş
  }
  return false;
}
