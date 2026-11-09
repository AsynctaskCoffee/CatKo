// Küçük 3B model önizleme penceresi (GM paneli: kule modelleri). Tek WebGL bağlamı; model örnekleri önbellekte.
import * as THREE from '../vendor/three.module.min.js';
import { createNpc } from './character.js';
import { gizle as kartGizle } from './onizleme-kart.js';

let R = null;
function setup() {
  if (R) return R;
  const el = document.createElement('div'); el.id = 'model-onizleme'; el.hidden = true;
  el.innerHTML = '<canvas width="220" height="240"></canvas><div class="mo-ad"></div><div class="mo-ipucu">Tekerlek: diğer modeller</div>';
  document.body.append(el);
  const canvas = el.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(220, 240, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x3a3020, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 6, 5); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 220 / 240, 0.1, 500);
  const pivot = new THREE.Group(); scene.add(pivot);
  const inst = new Map();   // model → Promise<api>
  R = { el, renderer, scene, camera, pivot, inst, cur: null, key: null, raf: 0, t: performance.now() };
  return R;
}
function loop() {
  const r = R; if (!r || r.el.hidden) { if (r) r.raf = 0; return; }
  const now = performance.now(), dt = Math.min(0.1, (now - r.t) / 1000); r.t = now;
  r.pivot.rotation.y += dt * 0.6;
  r.cur?.update?.(dt);
  r.renderer.render(r.scene, r.camera);
  r.raf = requestAnimationFrame(loop);
}
/** key: npc_<pid> (ya da loader ile özel anahtar); name: başlık; at: {x, y} ekran konumu; loader: () => Promise<{group, update?}> */
export async function showModel(key, name, at, loader = null) {
  const r = setup();
  kartGizle();   // ortak önizleme kartıyla üst üste binmesin
  r.el.hidden = false;
  r.el.querySelector('.mo-ad').textContent = name || key;
  if (at) {
    const x = Math.min(Math.max(8, at.x), innerWidth - 236), y = Math.min(Math.max(8, at.y), innerHeight - 290);
    r.el.style.left = x + 'px'; r.el.style.top = y + 'px';
  }
  if (!r.raf) { r.t = performance.now(); r.raf = requestAnimationFrame(loop); }
  if (r.key === key) return;
  r.key = key;
  r.pivot.clear(); r.cur = null; r.renderer.clear();   // eski model yenisi yüklenirken görünmesin
  if (!r.inst.has(key)) r.inst.set(key, (loader ? loader() : createNpc(key)).catch(() => null));
  r.el.classList.add('yukleniyor');
  const api = await r.inst.get(key);
  if (r.key !== key) return;
  r.el.classList.remove('yukleniyor');
  r.pivot.clear(); r.cur = null;
  if (!api) { r.el.querySelector('.mo-ad').textContent = (name || key) + ' (model yok)'; return; }
  r.pivot.add(api.group); r.cur = api;
  api.update?.(0.016);
  // kameraya sığdır
  api.group.position.set(0, 0, 0); r.pivot.rotation.y = 0.6;
  r.pivot.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(api.group, true);
  if (b.isEmpty()) return;
  const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  api.group.position.set(-c.x, -b.min.y, -c.z);
  const h = Math.max(s.y, Math.max(s.x, s.z) * 0.9);
  const d = h / (2 * Math.tan(THREE.MathUtils.degToRad(35 / 2))) * 1.25;
  r.camera.position.set(0, s.y * 0.55 + h * 0.15, d); r.camera.lookAt(0, s.y * 0.45, 0);
  r.camera.near = d / 50; r.camera.far = d * 10; r.camera.updateProjectionMatrix();
}
export function hideModel() { if (!R) return; R.el.hidden = true; R.key = null; R.pivot.clear(); R.cur = null; R.el.classList.remove('yukleniyor'); R.renderer.clear(); }

// küçük portre simgesi (ör. usta NPC'sinin eşya kaynakları): modeli bir kez çizip resim adresi döner (önbellekli, sırayla)
const IKON = new Map(); let IR = null, sira = Promise.resolve();
function ikonKur() {
  if (IR) return IR;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 112;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(112, 112, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x3a3020, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(2, 5, 6); scene.add(sun);
  IR = { canvas, renderer, scene, camera: new THREE.PerspectiveCamera(30, 1, 0.1, 500) };
  return IR;
}
/** opts.tam: modelin tamamı karede (dönüşüm listesi); opts.yap: özel yükleyici (ör. oyuncu ırkı) */
export function modelIkon(key, opts = {}) {
  const ck = opts.tam ? key + '|tam' : opts.bas ? key + '|bas' : key;
  if (IKON.has(ck)) return IKON.get(ck);
  const p = (sira = sira.then(async () => {
    const api = await (opts.yap ? opts.yap() : createNpc(key)).catch(() => null); if (!api) return null;
    const r = ikonKur();
    api.update?.(0.016);
    const g = api.group; g.rotation.y = 0.45; r.scene.add(g); g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g, true);
    if (b.isEmpty()) { r.scene.remove(g); return null; }
    const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    if (opts.tam) {   // tüm model: sınır küresi kareye sığar
      const rad = Math.max(0.2, Math.max(s.x, s.y, s.z) / 2 * 1.12), d = rad / Math.tan(THREE.MathUtils.degToRad(15));
      r.camera.position.set(c.x + d * 0.25, c.y + d * 0.28, c.z + d * 0.93); r.camera.lookAt(c);
      r.camera.near = d / 50; r.camera.far = d * 10; r.camera.updateProjectionMatrix();
      r.renderer.render(r.scene, r.camera);
      const url = r.canvas.toDataURL('image/png'); r.scene.remove(g); return url;
    }
    if (opts.bas) {   // yalnız baş, karenin tam ortasında (dünya haritası yuvarlak işaretleri): baş kemiği varsa ona, yoksa modelin tepesine göre
      const hc = new THREE.Vector3(c.x, b.max.y - s.y * 0.1, c.z);
      const ai = (api.eklemAdlari || []).findIndex((n) => /head/i.test(n) && !/nub|end|neck/i.test(n)), m = ai >= 0 ? api.joint?.(ai) : null;
      if (m && Number.isFinite(m[12])) {   // KO eklem matrisi (satır düzeni, öteleme 12–14) → model grubunun dünya uzayı
        const v = new THREE.Vector3(m[12], m[13], m[14]).applyMatrix4(g.matrixWorld);
        if (b.containsPoint(v)) hc.copy(v).add(new THREE.Vector3(0, s.y * 0.035, 0));
      }
      const h = Math.max(0.25, s.y * 0.26), d = h / (2 * Math.tan(THREE.MathUtils.degToRad(15)));
      const yon = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));   // modelin baktığı yön: yüz kameraya
      r.camera.position.copy(hc).addScaledVector(yon, d); r.camera.lookAt(hc);
      r.camera.near = d / 50; r.camera.far = d * 10; r.camera.updateProjectionMatrix();
      r.renderer.render(r.scene, r.camera);
      const url = r.canvas.toDataURL('image/png'); r.scene.remove(g); return url;
    }
    // KO portresi gibi: üst gövde ve baş
    const ust = b.max.y - s.y * 0.42, h = s.y * 0.5, d = h / (2 * Math.tan(THREE.MathUtils.degToRad(15))) * 1.15;
    r.camera.position.set(c.x, ust + h * 0.05, c.z + d); r.camera.lookAt(c.x, ust, c.z);
    r.camera.near = d / 50; r.camera.far = d * 10; r.camera.updateProjectionMatrix();
    r.renderer.render(r.scene, r.camera);
    const url = r.canvas.toDataURL('image/png');
    r.scene.remove(g);
    return url;
  }).catch(() => null));
  IKON.set(ck, p);
  return p;
}
