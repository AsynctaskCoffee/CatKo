// CatKo — orijinal şekil kütüphanesi (assets/dunya-kutup) ile yerleştirme katmanı.
// put(ad, x, z, {ry, s, y}) → şekil kütüphanede varsa kuyruğa alır, yerleştirme kutusunu (AABB) döndürür; yoksa null (çağıran yedek çizer).
// build(world) → şekil başına parça InstancedMesh olarak sahneye ekler (aynı şekil = tek çizim çağrısı / parça).
import * as THREE from '../vendor/three.module.min.js';
import { kutup, sekilKur } from './kutuphane.js';

export async function orjAc() {
  let J = null; try { J = await kutup(); } catch { return null; }
  const kuyruk = new Map();   // ad → [{x,y,z,ry,s}]
  const var_ = (ad) => J.adla.has(ad);
  // ry: radyan; 90°'nin katları için kutu tam, diğerlerinde dış kutu
  // merkez tabanlı yerleştirme: (x,z) = şeklin kutu merkezi; sx = yerel x ekseninde ek ölçek (duvarı uzunluğa uydurmak için)
  function kutu(ad, x, z, ry, s, sx = 1) {
    const b = J.adla.get(ad).kutu, c = Math.cos(ry), sn = Math.sin(ry), cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const [px, pz] of [[b[0], b[2]], [b[3], b[2]], [b[3], b[5]], [b[0], b[5]]]) { const lx = (px - cx) * sx * s, lz = (pz - cz) * s, rx = lx * c + lz * sn, rz = -lx * sn + lz * c; x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); z0 = Math.min(z0, rz); z1 = Math.max(z1, rz); }
    const ox = cx * sx * s, oz = cz * s;   // dayanak → merkez farkı (dünya: döndürülmüş)
    return { aabb: [x + x0, z + z0, x + x1, z + z1], h: b[4] * s, w: x1 - x0, d: z1 - z0, pos: [x - (ox * c + oz * sn), z - (-ox * sn + oz * c)] };
  }
  return {
    var: var_, boyut: (ad, ry = 0, s = 1, sx = 1) => (var_(ad) ? kutu(ad, 0, 0, ry, s, sx) : null),
    put(ad, x, z, { ry = 0, s = 1, sx = 1, y = 0 } = {}) {
      if (!var_(ad)) return null;
      const k = kutu(ad, x, z, ry, s, sx);
      (kuyruk.get(ad) || kuyruk.set(ad, []).get(ad)).push({ x: k.pos[0], y, z: k.pos[1], ry, s, sx });
      return k;
    },
    async build(world) {
      const grp = new THREE.Group(); grp.name = 'catko-orj'; let n = 0, hata = 0;
      for (const [ad, L] of kuyruk) {
        let g; try { g = await sekilKur(ad); } catch { g = null; } if (!g) { hata++; continue; }
        const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), M = new THREE.Matrix4();
        for (const part of g.children) {
          if (!part.isMesh) continue;
          const im = new THREE.InstancedMesh(part.geometry, part.material, L.length);
          L.forEach((it, i) => { q.setFromEuler(e.set(0, it.ry, 0)); M.compose(v.set(it.x, it.y, it.z), q, sc.set(it.s * it.sx, it.s, it.s)).multiply(part.matrix); im.setMatrixAt(i, M); });
          im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; grp.add(im);
        }
        n += L.length;
      }
      world.add(grp); console.info(`[CatKo] orijinal şekil: ${kuyruk.size} tür, ${n} örnek` + (hata ? `, ${hata} yüklenemedi` : '')); return grp;
    },
  };
}
