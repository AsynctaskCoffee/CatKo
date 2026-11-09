// Aşınmış eşya görünümü: kuşanılmış silah / zırhın dayanıklılığı %50 ve altına inince modelin üstünde siyah çatlaklar.
//  Kademe: %50 ≤ → 1 (ince birkaç çatlak), %25 ≤ → 2 (daha çok), 0 → 3 (en fazla; eşya etkisiz — sunucu _recalc saymaz).
//  Tek doku: R / G / B kanalları 1. / 2. / 3. kademenin çatlakları; malzemeye onBeforeCompile ile eklenir (kademe = uniform).
import * as THREE from '../vendor/three.module.min.js';

const DOKU = {};
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function catlakCiz(c, R, adet, kalin) {
  c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round';
  const dal = (x, y, a, uz, k, d) => {
    c.lineWidth = k; c.beginPath(); c.moveTo(x, y);
    for (let i = 0; i < uz; i++) {
      a += (R() - 0.5) * 0.9; x += Math.cos(a) * 6; y += Math.sin(a) * 6; c.lineTo(x, y);
      if (d < 3 && R() < 0.09) { c.stroke(); dal(x, y, a + (R() < 0.5 ? 1 : -1) * (0.5 + R() * 0.8), uz * 0.5, Math.max(0.6, k * 0.65), d + 1); c.lineWidth = k; c.beginPath(); c.moveTo(x, y); }
    }
    c.stroke();
  };
  for (let i = 0; i < adet; i++) dal(R() * 512, R() * 512, R() * Math.PI * 2, 10 + R() * 22, kalin * (0.7 + R() * 0.6), 0);
}
function doku(kalin = false) {
  if (DOKU[kalin]) return DOKU[kalin];
  // silah / kalkan (ekranda küçük): daha az ama kalın çatlaklar — ince çizgiler küçülünce kayboluyordu
  const N = 512, kanal = (kalin ? [[1, 4, 7], [2, 7, 8.5], [3, 12, 10]] : [[1, 9, 1.4], [2, 16, 1.8], [3, 26, 2.4]]).map(([s, adet, k]) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = N; const c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, N, N); catlakCiz(c, rnd(s * 7919), adet, k);
    return c.getImageData(0, 0, N, N).data;
  });
  const cv = document.createElement('canvas'); cv.width = cv.height = N; const c = cv.getContext('2d'); const img = c.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { img.data[i * 4] = kanal[0][i * 4]; img.data[i * 4 + 1] = kanal[1][i * 4]; img.data[i * 4 + 2] = kanal[2][i * 4]; img.data[i * 4 + 3] = 255; }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return (DOKU[kalin] = t);
}
/** nesnedeki tüm malzemelere çatlak kademesi (0-3) */
export function catlakAyarla(obj, kademe) {
  if (!obj) return;
  const kalin = !!obj.userData?.plugKey;   // silah / kalkan (plug)
  obj.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      if (!m || !m.map) continue;
      if (!m.userData.ck) {
        if (!kademe) continue;   // hiç çatlamamış malzemeye dokunma
        m.userData.ck = { value: 0 };
        const eski = m.onBeforeCompile;
        m.onBeforeCompile = (sh, r) => {
          eski?.call(m, sh, r);
          sh.uniforms.uCatlak = { value: doku(kalin) }; sh.uniforms.uCk = m.userData.ck;
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uCatlak; uniform float uCk;')
            .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
  vec3 ckT = texture2D(uCatlak, vMapUv * ${kalin ? '1.0' : '1.5'}).rgb;
  float ck = max(max(ckT.r * step(0.5, uCk), ckT.g * step(1.5, uCk)), ckT.b * step(2.5, uCk));
  diffuseColor.rgb *= 1.0 - ck * ${kalin ? '0.95' : '0.82'};
#endif`);
        };
        m.customProgramCacheKey = () => (kalin ? 'catlak-k' : 'catlak');
        m.needsUpdate = true;
      }
      m.userData.ck.value = kademe;
    }
  });
}
/** dayanıklılık → kademe */
export const catlakKademe = (dur, max) => {
  if (dur == null || !(max > 1)) return 0;
  const p = Number(dur) / max;
  return Number(dur) <= 0 ? 3 : p <= 0.25 ? 2 : p <= 0.5 ? 1 : 0;
};
