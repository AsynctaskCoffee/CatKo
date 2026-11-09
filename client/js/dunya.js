// GM dünya editörü — haritaya sonradan konan objeler (dunya_objeleri): NPC_Looks modelleri (yapılar, objeler, NPC / mob görünümleri)
// ve "duvar modülü" (taş duvar kutusu). Harita nesnelerine (opd) dokunulmaz; bu objeler ayrı bir katmanda çizilir.
// Her obje: konum (KO koordinatı), yön, ölçek; "duvar" açıksa çarpışma kutusu oyuncunun geçişini engeller (collision.js engeller).
// Sunucu değişiklikleri realtime ile tüm oyunculara anında yansır. GM paneli → Dünya editörü bu modülü kullanır.
import * as THREE from '../vendor/three.module.min.js';
import { createNpc } from './character.js';
import { sekilKur } from './kutuphane.js';

const TAS = (() => {   // duvar modülü dokusu: yontma taş blok deseni (canvas)
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#8a8172'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = ((y / 32) % 2) * 32; x < 256 + 64; x += 64) {
    const t = 118 + Math.random() * 40 | 0; g.fillStyle = `rgb(${t},${t - 8},${t - 22})`; g.fillRect(x - 64 + 2, y + 2, 60, 28);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x - 64 + 2, y + 26, 60, 4);
  }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
})();

export function initDunya({ sb, world, zone, state }) {
  const kok = new THREE.Group(); kok.name = 'dunya-objeleri'; world.add(kok);
  const objeler = new Map();   // id → { r, g (holder), api, kutu }
  const col = () => state.col;
  let secili = null, secKutu = null, onizleme = null;

  function engelKur(o) {
    const C = col(); if (!C) return;
    (C.engeller ||= new Map());
    for (let i = 0; i < 4; i++) C.engeller.delete(`dunya${o.r.id}_${i}`);
    if (!o.r.duvar || !o.r.aktif) return;
    // obje ayak izi (yerel kutu → dünya): 4 kenar çizgi engeli
    o.g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o.g);
    if (b.isEmpty()) return;
    // yerel eksenlerde ölçmek için: dönüşü kaldırıp kutuyu al, sonra köşeleri döndür
    const yaw = o.g.rotation.y; o.g.rotation.y = 0; o.g.updateMatrixWorld(true);
    const bl = new THREE.Box3().setFromObject(o.g); o.g.rotation.y = yaw; o.g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(kok.matrixWorld).invert();
    const min = bl.min.clone().applyMatrix4(inv), max = bl.max.clone().applyMatrix4(inv);
    const cx = o.r.x, cz = o.r.z, c = Math.cos(yaw), s = Math.sin(yaw);
    const nok = [[min.x, min.z], [max.x, min.z], [max.x, max.z], [min.x, max.z]].map(([x, z]) => { const dx = x - cx, dz = z - cz; return [cx + dx * c + dz * s, cz - dx * s + dz * c]; });
    for (let i = 0; i < 4; i++) { const a = nok[i], b2 = nok[(i + 1) % 4]; C.engeller.set(`dunya${o.r.id}_${i}`, { ax: a[0], az: a[1], bx: b2[0], bz: b2[1], aktif: () => objeler.get(o.r.id) === o && !!o.r.duvar }); }
  }

  async function modelKur(r) {
    if (r.model === 'duvar') {
      const gen = Number(r.gen) || 4, yuk = Number(r.yuk) || 3, der = Number(r.der) || 0.8;
      const tex = TAS.clone(); tex.needsUpdate = true; tex.repeat.set(gen / 2, yuk / 2);
      const m = new THREE.Mesh(new THREE.BoxGeometry(gen, yuk, der), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
      m.position.y = yuk / 2; const g = new THREE.Group(); g.add(m); return { group: g, update() {} };
    }
    if (String(r.model).startsWith('k:')) { const g = await sekilKur(r.model.slice(2)).catch(() => null); return g ? { group: g, update() {} } : null; }
    return createNpc(r.model).catch(() => null);
  }
  function yerlestir(o) {
    const r = o.r;
    o.g.position.set(Number(r.x), Number(r.y), Number(r.z));
    o.g.rotation.y = Number(r.yaw) || 0;
    const s = Number(r.olcek) || 1; o.g.scale.set(s, s, s);
    engelKur(o);
    if (secili === r.id) secCiz();
  }
  // ---- obje efektleri (haritadaki gibi: meşale ateşi, ışık, şelale…): şeklin .fxb'leri objeyle birlikte döner / ölçeklenir
  const _v = new THREE.Vector3();
  let fxKutupP = null;
  const fxKutup = () => (fxKutupP ||= import('./fx.js').then(async (F) => { for (const b of state.fxBolgeKutup || ['./assets/fxzone2', './assets/fxzone3', './assets/fxzone4']) await F.fxEkle(b).catch(() => {}); }).catch(() => {}));
  async function fxBagla(o) {
    const L = o.api?.group?.userData?.fx; if (!L?.length) return;
    for (let n = 0; n < 60 && !state.fx; n++) await new Promise((q) => setTimeout(q, 500));
    if (!state.fx || objeler.get(o.r.id) !== o) return;
    if (L.some(([fx]) => !state.fx.var?.(fx))) await fxKutup();
    if (objeler.get(o.r.id) !== o) return;
    fxSil(o); o.fx = [];
    for (const [fx, x, y, z, qx, qy, qz, qw, sc] of L) {
      if (!state.fx.var?.(fx)) continue;
      const yerel = new THREE.Vector3(x, y, z), q = new THREE.Quaternion(qx, qy, qz, qw), qd = new THREE.Quaternion();
      const at = () => { o.g.updateMatrix(); return _v.copy(yerel).applyMatrix4(o.g.matrix).clone(); };
      const b = state.fx.play(fx, { pos: at(), follow: at, loop: true, scale: (sc || 1) * (Number(o.r.olcek) || 1) });
      if (!b) continue;
      b.yon = () => qd.copy(o.g.quaternion).multiply(q);
      o.fx.push(b);
    }
  }
  function fxSil(o) { for (const b of o.fx || []) b?.dispose?.(); o.fx = null; }
  // uzaktaki obje efektleri çizilmez (90 m; izleyici modunda kamerasına göre)
  setInterval(() => {
    const K = state.izleyici?.aktif ? state.izleyici.konum : state.player?.position; if (!K) return;
    for (const o of objeler.values()) if (o.fx) { const uz = Math.hypot(o.r.x - K.x, o.r.z - K.z) > 90; for (const b of o.fx) if (b) b.gizli = uz; }
  }, 500);
  async function ekle(r) {
    const o = { r, g: new THREE.Group(), api: null }; o.g.userData.dunyaId = r.id;
    objeler.set(r.id, o); kok.add(o.g); yerlestir(o);
    const api = await modelKur(r);
    if (objeler.get(r.id) !== o) return;
    if (api) { o.api = api; o.g.add(api.group); api.setClip?.('breath'); fxBagla(o); }
    else { const k = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true })); k.position.y = 0.5; o.g.add(k); }
    engelKur(o); if (secili === r.id) secCiz();
  }
  function kaldir(id) {
    const o = objeler.get(id); if (!o) return;
    kok.remove(o.g); objeler.delete(id); fxSil(o);
    const C = col(); for (let i = 0; i < 4; i++) C?.engeller?.delete(`dunya${id}_${i}`);
    if (secili === id) sec(null);
  }
  function uygula(r) {
    if (!r) return;
    if (r.zone !== zone || !r.aktif) return kaldir(r.id);
    const o = objeler.get(r.id);
    if (!o) return ekle(r);
    const modelDegisti = o.r.model !== r.model || (r.model === 'duvar' && (o.r.gen !== r.gen || o.r.yuk !== r.yuk || o.r.der !== r.der));
    if (modelDegisti) { kaldir(r.id); return ekle(r); }
    const olcDegisti = Number(o.r.olcek) !== Number(r.olcek);
    o.r = r; yerlestir(o);
    if (olcDegisti && o.fx) fxBagla(o);   // efekt ölçeği objeyle
  }
  async function yukle() {
    const { data } = await sb.from('dunya_objeleri').select('*').eq('zone', zone).eq('aktif', true);
    for (const r of data || []) uygula(r);
  }
  yukle().catch(() => {});
  try { sb.channel('dunya-' + zone).on('postgres_changes', { event: '*', schema: 'public', table: 'dunya_objeleri', filter: `zone=eq.${zone}` }, (p) => uygula(p.new)).subscribe(); } catch {}
  // çarpışma verisi geç yüklenirse engelleri yeniden kur
  const t = setInterval(() => { if (col()) { for (const o of objeler.values()) engelKur(o); clearInterval(t); } }, 1500);

  // seçim kutusu (GM)
  function secCiz() {
    if (secKutu) { kok.remove(secKutu); secKutu = null; }
    // tek obje ya da çoklu seçim (grup): tümünü saran kutu
    const ids = Array.isArray(secili) ? secili : secili != null ? [secili] : [];
    const b = new THREE.Box3(); for (const id of ids) { const o = objeler.get(id); if (o) b.expandByObject(o.g); }
    if (b.isEmpty()) return;
    const inv = new THREE.Matrix4().copy(kok.matrixWorld).invert(); b.applyMatrix4(inv);
    secKutu = new THREE.Box3Helper(b, 0x33aaff); secKutu.raycast = () => {}; kok.add(secKutu);
  }
  function sec(id) { secili = id; secCiz(); }
  // önizleme hayaleti: kütüphaneden seçilen model oyuncunun önünde yarı saydam
  let onizSira = 0;
  async function onizle(model, konum) {
    const n = ++onizSira;
    if (onizleme) { kok.remove(onizleme); onizleme = null; }
    if (!model) return;
    const api = await modelKur({ model, gen: 4, yuk: 3, der: 0.8 }); if (!api || n !== onizSira) return;
    api.group.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.5; m.material.depthWrite = false; } });
    if (onizleme) kok.remove(onizleme);
    onizleme = new THREE.Group(); onizleme.add(api.group); onizleme.position.set(konum.x, konum.y, konum.z); onizleme.rotation.y = konum.yaw || 0; { const s = konum.olcek || 1; onizleme.scale.set(s, s, s); } kok.add(onizleme);
    onizleme.traverse((m) => { m.raycast = () => {}; });
  }
  let son = performance.now();
  const dongu = () => {
    (window.__koKareRaf || requestAnimationFrame)(dongu);
    const n = performance.now(), dt = Math.min(0.05, (n - son) / 1000); son = n;
    for (const o of objeler.values()) o.api?.update?.(dt);
  };
  requestAnimationFrame(dongu);
  return {
    get liste() { return [...objeler.values()].map((o) => o.r); },
    get secili() { return secili; },
    sec, onizle, yenile: yukle, uygula,
    onizleKonum(k) { if (onizleme) { onizleme.position.set(k.x, k.y, k.z); onizleme.rotation.y = k.yaw || 0; const s = k.olcek || 1; onizleme.scale.set(s, s, s); onizleme.visible = k.gorunur !== false; } },
    kok,
    /** three.js ışını ile eklenmiş obje seç: id ya da null */
    sec3(raycaster) { const h = raycaster.intersectObject(kok, true).find((x) => { let o = x.object; while (o && o.userData.dunyaId == null) o = o.parent; return !!o; }); if (!h) return null; let o = h.object; while (o.userData.dunyaId == null) o = o.parent; const p = h.point; return { id: o.userData.dunyaId, mesafe: h.distance, nokta: { x: p.x, y: p.y, z: -p.z } }; },
  };
}
