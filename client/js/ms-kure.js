// Monster Stone ulus kapıları: kapı ağzını dolduran küre ışık (El Morad mavi, Karus kırmızı).
// Küre kapı çapı kadar (geçidin iki duvarı arası, çarpışma yüzeylerinden ölçülür), yere oturur; ışık şeritleri yerden yukarı doğru akar
// (eski efektin %20 hızında).
import * as THREE from '../vendor/three.module.min.js';

const VS = `varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `uniform float t; uniform vec3 renk; uniform float r; varying vec3 vP; varying vec3 vN; varying vec3 vV;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float y = (vP.y / r) * 0.5 + 0.5;                       // 0 yer … 1 tepe
  float a = atan(vP.z, vP.x);
  float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);   // kenar parlaması
  float akis = n2(vec2(a * 3.0, y * 6.0 - t * 0.6)) * 0.65 + n2(vec2(a * 7.0, y * 13.0 - t * 1.1)) * 0.35;   // yukarı akan şeritler
  float serit = smoothstep(0.55, 0.95, akis);
  float alt = smoothstep(0.0, 0.25, y) * (1.0 - smoothstep(0.85, 1.0, y) * 0.5);
  float al = (0.10 + fr * 0.75 + serit * 0.45) * alt;
  gl_FragColor = vec4(renk * (0.6 + serit * 0.9 + fr * 0.8), clamp(al, 0.0, 0.9));
}`;

/** kapılar: [{ x, z, ulus }] */
export function msKureler({ scene, state, kapilar }) {
  const liste = [];
  for (const k of kapilar) {
    const yer = state.heightAt(k.x, k.z), col = state.col;
    let gen = 5;
    if (col) {
      let en = Infinity;
      for (let a = 0; a < 180; a += 5) {
        const rr = a * Math.PI / 180, dx = Math.cos(rr), dz = Math.sin(rr);
        const d1 = col.segment(k.x, yer + 1.5, k.z, dx, 0, dz, 7), d2 = col.segment(k.x, yer + 1.5, k.z, -dx, 0, -dz, 7);
        if (d1 >= 0 && d2 >= 0) en = Math.min(en, d1 + d2);
      }
      if (en < Infinity) gen = en;
    }
    const r = Math.max(1.4, Math.min(4, gen / 2));
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { t: { value: 0 }, r: { value: r }, renk: { value: new THREE.Color(k.ulus === 2 ? 0x3d8bff : 0xff3a2a) } } });
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), mat);
    m.position.set(k.x, yer + r * 0.92, k.z); m.renderOrder = 5;
    scene.add(m); liste.push(m);
  }
  let son = performance.now();
  const dongu = (now) => { const dt = (now - son) / 1000; son = now; for (const m of liste) m.material.uniforms.t.value += dt * 0.2 * 5; requestAnimationFrame(dongu); };   // ×0,2 hız
  requestAnimationFrame(dongu);
  return liste;
}
