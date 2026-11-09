// KO Moradon: havada süzülen beyaz / açık pembe kiraz çiçeği yaprakları (벚꽃 — orijinal KnightOnlineEn\Misc\fx_but_flower_01..03_0000.dxt).
// Hava durumu gibi bütün haritaya yağar: dünya 24 m'lik hücrelere bölünür, her hücrenin yaprakları hücre koordinatından türeyen sabit
// rastgele değerlerle ve ortak saatle (dünya zamanı) hesaplanır — karakter yürüse de yapraklar onunla gelmez, olduğu yerde yağmaya
// devam eder; yalnız oyuncunun çevresindeki 5×5 hücre çizilir. Her yaprak hücresinde yerden ~16 m yükseklikten döne döne düşer,
// rüzgârla yana kayar, yere değince tepeden yeniden başlar. Seçenekler → Düşen yapraklar (fx.yaprak) ve Use Zone Effect kapatır.
import * as THREE from '../vendor/three.module.min.js';

const C = 24, CEVRE = 2, N = 27, YUK = 16;   // hücre (m), çevre hücre sayısı (±2 → 5×5), hücre başına yaprak, düşüş yüksekliği (m)
const RUZGAR = [0.35, 0.18];   // hafif sabit rüzgâr (m/sn)

// hücre + sıra → [0,1) aralığında tekrarlanabilir rastgele sayılar
function rnd(cx, cz, i, k) {
  let h = Math.imul(cx | 0, 374761393) ^ Math.imul(cz | 0, 668265263) ^ Math.imul(i + 1, 2147483647) ^ Math.imul(k + 7, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function kirazYaprakKur({ scene, player, zemin = null, acik = () => true }) {
  const yukle = new THREE.TextureLoader();
  const geo = new THREE.PlaneGeometry(0.32, 0.32);
  const KAP = (2 * CEVRE + 1) ** 2 * N;
  const gruplar = [1, 2, 3].map((i) => {
    const tex = yukle.load(`./assets/yaprak/but_flower_0${i}.webp`); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const m = new THREE.InstancedMesh(geo, mat, KAP);
    m.frustumCulled = false; m.renderOrder = 5; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0;
    scene.add(m);
    return m;
  });
  // hücre önbelleği: yaprakların sabit değerleri + yer yüksekliği (yalnız hücre ilk görüldüğünde)
  const hucre = new Map();
  const hucreAl = (cx, cz) => {
    const k = cx + ',' + cz; let h = hucre.get(k); if (h) return h;
    h = [];
    for (let i = 0; i < N; i++) {
      const R = (j) => rnd(cx, cz, i, j);
      const x = (cx + R(0)) * C, z = (cz + R(1)) * C;
      const v = 0.45 + R(2) * 0.45, T = YUK / v;   // düşüş hızı, bir düşüş süresi
      let y0 = null; try { y0 = zemin ? zemin(x, z) : null; } catch {}
      h.push({ x, z, y0: Number.isFinite(y0) ? y0 : null, v, T, faz: R(3) * T, sw: 0.4 + R(4) * 0.9, sf: 0.6 + R(5) * 1.2, ph: R(6) * 6.28,
        wx: (R(7) - 0.5) * 3, wy: (R(8) - 0.5) * 2, wz: (R(9) - 0.5) * 3, s: 0.8 + R(10) * 0.6, g: i % 3 });
    }
    if (hucre.size > 400) hucre.clear();
    hucre.set(k, h); return h;
  };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
  const sayac = [0, 0, 0];
  const adim = () => {
    (window.__koKareRaf || requestAnimationFrame)(adim);
    const ac = acik();
    for (const m of gruplar) m.visible = ac;
    if (!ac) return;
    const t = performance.now() / 1000, pp = player.position;
    const pcx = Math.floor(pp.x / C), pcz = Math.floor(pp.z / C);
    sayac[0] = sayac[1] = sayac[2] = 0;
    for (let dx = -CEVRE; dx <= CEVRE; dx++) for (let dz = -CEVRE; dz <= CEVRE; dz++) {
      for (const p of hucreAl(pcx + dx, pcz + dz)) {
        const yt = (t + p.faz) % p.T;   // bu düşüşte geçen süre
        const sal = Math.sin(t * p.sf + p.ph) * p.sw;
        const x = p.x + RUZGAR[0] * yt + sal * 0.6, z = p.z + RUZGAR[1] * yt + Math.cos(t * p.sf * 0.8 + p.ph) * p.sw * 0.4;
        const taban = p.y0 ?? pp.y;
        const y = taban + YUK - 1 - p.v * yt;
        E.set(p.wx * t + p.ph, p.wy * t, p.wz * t + p.ph); Q.setFromEuler(E); V.set(x, y, z); S.setScalar(p.s);
        M.compose(V, Q, S); gruplar[p.g].setMatrixAt(sayac[p.g]++, M);
      }
    }
    for (let g = 0; g < 3; g++) { gruplar[g].count = sayac[g]; gruplar[g].instanceMatrix.needsUpdate = true; }
  };
  requestAnimationFrame(adim);
}
