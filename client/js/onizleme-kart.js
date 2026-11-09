// Taslak görünüm penceresi (GM paneli): üzerine gelinen öğenin yanında dönen 3B önizleme + bilgi satırları.
// Dünya editörü (kütüphane objeleri) ve Dönüşüm (mob / NPC modelleri) aynı kartı kullanır.
//   goster(el, { anahtar, bilgiHtml, yap: () => Promise<Object3D | { group, update(dt) }> })   gizle()
// Model KO koordinatında gelir (dünya grubundaki gibi z ters kapta). Animasyonlu modellerde update(dt) her karede çağrılır.
import * as THREE from '../vendor/three.module.min.js';
import { hideModel } from './model-onizleme.js';

let on = null;
function kur() {
  const d = document.createElement('div'); d.className = 'de2-onizle'; d.hidden = true;
  d.innerHTML = '<canvas width="300" height="230"></canvas><div class="de2-on-bilgi"></div>';
  document.body.append(d);
  const r = new THREE.WebGLRenderer({ canvas: d.querySelector('canvas'), antialias: true, alpha: true });
  r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0, 0); r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff6e8, 0x5a5040, 2.2)); const gl = new THREE.DirectionalLight(0xffffff, 1.6); gl.position.set(-3, 6, 4); sc.add(gl);
  const kap = new THREE.Group(); kap.scale.z = -1; sc.add(kap);
  on = { d, r, sc, kap, cam: new THREE.PerspectiveCamera(30, 300 / 230, 0.1, 5000), o: null, api: null, key: null, raf: 0, aci: Math.PI, c: new THREE.Vector3(), uz: 10, son: 0 };
}
export function goster(el, { anahtar, bilgiHtml = '', yap, yan = null }) {
  if (!on) kur();
  hideModel();   // eski küçük önizleme penceresi açık kalmasın (iki önizleme üst üste binmez)
  const yr = (yan || el).getBoundingClientRect(), er = el.getBoundingClientRect(), rr = { right: yr.right, left: yr.left, top: er.top }, w = 304, h = on.d.offsetHeight || 330;
  const sag = rr.right + 10 + w < innerWidth - 8;
  on.d.style.left = (sag ? rr.right + 10 : Math.max(8, rr.left - w - 10)) + 'px';
  on.d.style.top = Math.max(8, Math.min(innerHeight - h - 8, rr.top - 60)) + 'px';
  on.d.hidden = false; on.el = el; on.yan = yan; on.hov = performance.now();
  if (on.key === anahtar && on.o) return;
  on.key = anahtar;
  on.d.querySelector('.de2-on-bilgi').innerHTML = bilgiHtml;
  temizle(); on.d.classList.add('yukleniyor');
  Promise.resolve(yap?.()).then((x) => {
    if (!x || on.key !== anahtar) return;
    const o = x.isObject3D ? x : x.group; if (!o) return;
    on.api = x.isObject3D ? null : x; on.api?.setClip?.('breath'); on.api?.update?.(0.016);
    on.d.classList.remove('yukleniyor'); on.aci = Math.PI;
    on.kap.clear(); on.o = o; on.kap.add(o); sigdir();   // kapta yalnızca bu model
    // animasyonlu modellerde duruş değişir: kısa süre sonra yeniden sığdır (büyüyen kutu küçülmez → titreme yok)
    setTimeout(() => { if (on.o === o) sigdir(true); }, 300); setTimeout(() => { if (on.o === o) sigdir(true); }, 1200);
  }).catch(() => {});
  if (!on.raf) {
    on.son = performance.now();
    const dongu = () => {
      if (!on || on.d.hidden) { if (on) on.raf = 0; return; }
      // kaynak öğe kalktıysa / gizlendiyse ya da fare üstünden ayrıldıysa kart sıfırlanır (yeniden çizilen listeler, sekme değişimi, kapanan panel)
      const el = on.el, n0 = performance.now();
      if (el && (el.matches(':hover') || on.yan?.matches?.(':hover'))) on.hov = n0;
      if (!el || !el.isConnected || el.offsetParent === null || n0 - on.hov > 600) { gizle(); on.raf = 0; return; }
      on.raf = requestAnimationFrame(dongu);
      const n = performance.now(), dt = Math.min(0.05, (n - on.son) / 1000); on.son = n;
      on.aci += 0.012; on.api?.update?.(dt);
      const c = on.c, d = on.uz;
      on.cam.position.set(c.x + Math.sin(on.aci) * d * 0.8, c.y + d * 0.45, c.z + Math.cos(on.aci) * d * 0.8); on.cam.lookAt(c);
      on.cam.near = d / 100; on.cam.far = d * 5; on.cam.updateProjectionMatrix();
      on.r.render(on.sc, on.cam);
    };
    on.raf = requestAnimationFrame(dongu);
  }
}
/** modeli kareye sığdır: iskeletli modellerde gerçek köşelerle (setFromObject precise); modelin tamamı kartta görünür */
function sigdir(buyut = false) {
  on.kap.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(on.o, true); if (b.isEmpty()) return;
  const c = b.getCenter(new THREE.Vector3()), r = Math.max(0.3, b.getSize(new THREE.Vector3()).length() / 2);
  // dikey alan 30°, yatay daha geniş: kürenin tamamı + %8 pay
  const uz = r / Math.sin(THREE.MathUtils.degToRad(15)) * 1.2;
  if (buyut && uz < on.uz) return;
  on.c.copy(c); on.uz = uz;
}
/** sahnedeki modeli kaldırır, kamerayı ve tuvali sıfırlar (eski görüntü yeni modelin yüklenmesi sırasında kalmaz) */
function temizle() {
  on.kap.clear(); on.o = null;
  on.api = null; on.c.set(0, 0, 0); on.uz = 10; on.aci = Math.PI;
  on.r.clear();
}
export function gizle() { if (!on) return; on.d.hidden = true; on.key = null; on.el = null; on.yan = null; on.d.classList.remove('yukleniyor'); temizle(); }
