// Su yüzeyleri — CN3Pond karşılığı.
// Aşama 0: kostik animasyonu (caust00..31, 15 kare/sn) x köşe rengi; aşama 1: dalga dokusu (uv2) ile MODULATE.
// Harmanlama SRCALPHA / INVSRCALPHA, gama uzayında.
import * as THREE from '../vendor/three.module.min.js';

export async function loadWater(base, meta) {
  const W = meta.water;
  if (!W || !W.ponds?.length) return null;
  const [bin, caustImg, ...waveImgs] = await Promise.all([
    fetch(`${base}/water.bin`).then((r) => r.arrayBuffer()),
    W.caust ? loadImage(`${base}/caustics.png`) : null,
    ...W.ponds.map((p) => (p.tex ? loadImage(`${base}/${p.tex}`) : null)),
  ]);
  const tex = (img, repeat = true) => {
    if (!img) return null;
    const t = new THREE.Texture(img); t.flipY = false; t.colorSpace = THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;   // orijinalde MIPFILTER = NONE
    t.needsUpdate = true; return t;
  };
  // kostik şeridi: 32 kare alt alta → her kare kendi içinde tekrarlanmalı; shader'da fract ile seçilir
  const caust = tex(caustImg, true);
  const frames = W.caust?.frames || 1;
  const time = { value: 0 };
  const group = new THREE.Group(); group.name = 'water';
  const cache = new Map(), ponds = [];
  W.ponds.forEach((p, i) => {
    const f = new Float32Array(bin, p.off, p.vc * 11);
    const u32 = new Uint32Array(bin, p.off, p.vc * 11);
    const pos = new Float32Array(p.vc * 3), col = new Float32Array(p.vc * 4), uv = new Float32Array(p.vc * 2), uv2 = new Float32Array(p.vc * 2);
    for (let v = 0; v < p.vc; v++) {
      const o = v * 11;
      pos.set([f[o], f[o + 1], f[o + 2]], v * 3);
      const c = u32[o + 6];   // D3DCOLOR ARGB
      col.set([((c >>> 16) & 255) / 255, ((c >>> 8) & 255) / 255, (c & 255) / 255, (c >>> 24) / 255], v * 4);
      uv.set([f[o + 7], f[o + 8]], v * 2); uv2.set([f[o + 9], f[o + 10]], v * 2);
    }
    // CN3Pond indeksleri: satır satır iki üçgen (x, x+1, y) (y, x+1, y+1)
    const w = p.width, h = p.vc / w, idx = [];
    for (let r = 0; r < h - 1; r++) for (let k = 0; k < w - 1; k++) {
      const x = r * w + k, y = x + w;
      idx.push(x, x + 1, y, y, x + 1, y + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('uv2w', new THREE.BufferAttribute(uv2, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const wave = waveImgs[i] ? (cache.get(p.tex) || cache.set(p.tex, tex(waveImgs[i])).get(p.tex)) : null;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uCaust: { value: caust }, uWave: { value: wave }, uHasWave: { value: wave ? 1 : 0 }, uFrames: { value: frames }, uTime: time,
        uFogColor: { value: new THREE.Color(0.66, 0.74, 0.82) }, uFogNear: { value: 250 }, uFogFar: { value: 900 } },
      vertexShader: /* glsl */`
        in vec4 color; in vec2 uv2w; uniform float uTime;
        out vec4 vCol; out vec2 vUv; out vec2 vUv2; out float vDist;
        void main() {
          vCol = color; vUv = uv; vUv2 = uv2w;
          vec3 p = position; p.y += sin(uTime * 1.3 + position.x * 0.05 + position.z * 0.07) * 0.04;   // hafif dalgalanma
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D uCaust; uniform sampler2D uWave; uniform int uHasWave; uniform float uFrames; uniform float uTime;
        uniform vec3 uFogColor; uniform float uFogNear, uFogFar;
        in vec4 vCol; in vec2 vUv; in vec2 vUv2; in float vDist; out vec4 fragColor;
        void main() {
          float fr = floor(mod(uTime * 15.0, uFrames));
          vec2 cu = vec2(fract(vUv.x), (fract(vUv.y) + fr) / uFrames);
          vec4 c = texture(uCaust, cu) * vCol;
          if (uHasWave == 1) { vec4 w = texture(uWave, vUv2); c.rgb *= w.rgb; c.a *= w.a; }
          vec3 fogG = mix(uFogColor * 12.92, 1.055 * pow(uFogColor, vec3(1.0/2.4)) - 0.055, step(0.0031308, uFogColor));
          c.rgb = mix(c.rgb, fogG, smoothstep(uFogNear, uFogFar, vDist));
          fragColor = c;
        }`,
    });
    const m = new THREE.Mesh(g, mat); m.renderOrder = 2; group.add(m);
    ponds.push({ pos, col, uv, uv2, mat, y: pos.filter((_, k) => k % 3 === 1).reduce((a, b) => a + b, 0) / p.vc });
  });

  // Açık deniz: harita (0..world) dışını deniz göletinin malzemesiyle çevreleyen halka.
  // Orijinalde kamera hiçbir zaman haritanın kenarını görmez; burada kıyıdan bakınca boşluk yerine deniz ve sis görünür.
  const Wd = meta.worldSize || 1024, E = 4096;
  // kıyı göletleri: harita kenarına 24 m'den yakın olanlar; halka parçası en yakınınınkinin yüksekliğini alır
  for (const p of ponds) {
    const xs = p.pos.filter((_, k) => k % 3 === 0), zs = p.pos.filter((_, k) => k % 3 === 2);
    p.box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    p.edge = p.box[0] < 24 || p.box[2] < 24 || p.box[1] > Wd - 24 || p.box[3] > Wd - 24;
    p.area = (p.box[1] - p.box[0]) * (p.box[3] - p.box[2]);
  }
  const coast = ponds.filter((p) => p.edge);
  const sea = coast.reduce((a, b) => (!a || b.area > a.area ? b : a), null);
  const nearest = (cx, cz) => coast.reduce((a, b) => {
    const d = (p) => Math.hypot(Math.max(p.box[0] - cx, 0, cx - p.box[1]), Math.max(p.box[2] - cz, 0, cz - p.box[3]));
    return d(b) < d(a) ? b : a;
  }, sea);
  if (sea) {
    // gölet köşelerinden metre başına uv ölçeği
    const du = (sea.uv[2] - sea.uv[0]) / ((sea.pos[3] - sea.pos[0]) || 1), dv = (sea.uv[sea.uv.length - 1] - sea.uv[1]) / ((sea.pos[sea.pos.length - 1] - sea.pos[2]) || 1);
    const du2 = (sea.uv2[2] - sea.uv2[0]) / ((sea.pos[3] - sea.pos[0]) || 1), dv2 = (sea.uv2[sea.uv2.length - 1] - sea.uv2[1]) / ((sea.pos[sea.pos.length - 1] - sea.pos[2]) || 1);
    const c = [0, 1, 2, 3].map((k) => sea.col.filter((_, i) => i % 4 === k).reduce((a, b) => a + b, 0) / (sea.col.length / 4));
    const xs = [-E, 0, Wd, Wd + E], pos = [], col = [], uv = [], uv2 = [], idx = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      if (i === 1 && j === 1) continue;   // harita alanı
      const b = pos.length / 3;
      const y = nearest((xs[i] + xs[i + 1]) / 2 + (i === 0 ? E / 2 - 24 : i === 2 ? -E / 2 + 24 : 0), (xs[j] + xs[j + 1]) / 2 + (j === 0 ? E / 2 - 24 : j === 2 ? -E / 2 + 24 : 0)).y - 0.15;
      for (const [x, z] of [[xs[i], xs[j]], [xs[i + 1], xs[j]], [xs[i], xs[j + 1]], [xs[i + 1], xs[j + 1]]]) {
        pos.push(x, y, z); col.push(...c);
        uv.push(x * (du || 1 / 32), z * (dv || 1 / 32)); uv2.push(x * (du2 || 1 / 64), z * (dv2 || 1 / 64));
      }
      idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('uv2w', new THREE.Float32BufferAttribute(uv2, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, sea.mat); m.renderOrder = 1; m.name = 'acik-deniz'; group.add(m);
  }
  group.userData.tick = (t) => { time.value = t; };
  return group;
}

function loadImage(url) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('yüklenemedi: ' + url)); i.src = window.KO_V ? window.KO_V(url) : url; });
}
