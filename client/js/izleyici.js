// GM izleyici modu (dünya editörü): ana sahne, oyuncu kamerasından bağımsız serbest bir kamerayla GM panelindeki bir tuvale çizilir.
// Her karede ana çizimden ÖNCE: ana tuvalin sol alt köşesine izleyici görüntüsü çizilir → panel tuvaline kopyalanır → ardından ana çizim
// tuvali tamamen yeniler (oyuncu görüntüsü bozulmaz). Kontroller (tuval odaktayken): W A S D ileri / yan, Q E alçal / yüksel, Shift hızlı,
// sağ tuş basılı sürükle bak, tekerlek hız. Sol tık / üzerine gelme olayları editöre KO koordinatıyla (zemin ya da bina yüzeyi) bildirilir.
import * as THREE from '../vendor/three.module.min.js';

export function initIzleyici({ renderer, scene, world, camera, state }) {
  const cam = new THREE.PerspectiveCamera(60, 1.6, 0.3, 6000);
  const K = { x: 0, y: 0, z: 0, yaw: 0, pitch: -0.35 };   // KO koordinatı; yaw: KO'da +z ileri (sin, cos)
  let boyama = false, cv = null, ctx = null, aktif = false, hiz = 18, tus = new Set(), bak = null, son = { x: -1, y: -1 }, olay = {};
  const rc = new THREE.Raycaster(), ndc = new THREE.Vector2(), v2 = new THREE.Vector2(), v2b = new THREE.Vector2();
  const ileri = () => [Math.sin(K.yaw) * Math.cos(K.pitch), Math.sin(K.pitch), Math.cos(K.yaw) * Math.cos(K.pitch)];
  const kamUygula = () => {
    cam.position.set(K.x, K.y, -K.z);
    const f = ileri(); cam.lookAt(K.x + f[0], K.y + f[1], -(K.z + f[2]));
  };
  const _m = new THREE.Matrix4(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
  const gorunur = (o) => { for (let x = o; x; x = x.parent) if (x.visible === false) return false; return true; };
  /** isabet edilen üçgenin dünya normali → KO koordinatı {x, y, z} (birim) */
  function dunyaNormal(h) {
    if (!h.face) return null;
    _m.copy(h.object.matrixWorld);
    if (h.instanceId != null && h.object.isInstancedMesh) { const im = new THREE.Matrix4(); h.object.getMatrixAt(h.instanceId, im); _m.multiply(im); }
    _n.copy(h.face.normal).applyMatrix3(_nm.getNormalMatrix(_m)).normalize();
    if (_n.dot(rc.ray.direction) > 0) _n.negate();   // kameraya bakan yüz
    return { x: _n.x, y: _n.y, z: -_n.z };
  }
  function araziNormal(H, x, z) { const e = 0.5, hx = H(x + e, z) - H(x - e, z), hz = H(x, z + e) - H(x, z - e), l = Math.hypot(hx, 2 * e, hz) || 1; return { x: -hx / l, y: 2 * e / l, z: -hz / l }; }
  /** (x, z) noktasında ustY'nin altındaki ilk yüzey (arazi, kale duvarı / bina üstü, eklenmiş obje); haric: taşınan objenin kimliği.
   * döner { y, yuzey, normal } — klavyeyle taşıma, "Önüme", yapıştırma ve "Yüzeye indir" için */
  const _rcA = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3(0, -1, 0);
  function asagi(x, z, ustY, haric = null) {
    const H = state.heightAt?.(x, z) ?? 0, bas = Math.max(ustY ?? H + 60, H + 0.5);
    let en = { y: H, yuzey: 'arazi', normal: { x: 0, y: 1, z: 0 } };
    _rcA.set(_o.set(x, bas, -z), _d); _rcA.far = bas - H + 0.01;
    const adaylar = [];
    if (state.objects) adaylar.push(..._rcA.intersectObject(state.objects, true).filter((h) => gorunur(h.object)).map((h) => ({ h, yuzey: 'nesne' })));
    const kok = state.dunya?.kok;
    if (kok) adaylar.push(..._rcA.intersectObject(kok, true).filter((h) => { let o = h.object; while (o && o.userData.dunyaId == null) o = o.parent; return o && o.userData.dunyaId !== haric && gorunur(h.object); }).map((h) => ({ h, yuzey: 'obje' })));
    adaylar.sort((a, b) => a.h.distance - b.h.distance);
    const ilk = adaylar[0];
    if (ilk && bas - ilk.h.distance > H) { const nr = dunyaNormalR(ilk.h, _rcA); en = { y: bas - ilk.h.distance, yuzey: ilk.yuzey, normal: nr }; }
    return en;
  }
  function dunyaNormalR(h, r) {
    if (!h.face) return null;
    const m = new THREE.Matrix4().copy(h.object.matrixWorld);
    if (h.instanceId != null && h.object.isInstancedMesh) { const im = new THREE.Matrix4(); h.object.getMatrixAt(h.instanceId, im); m.multiply(im); }
    const n = h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(m)).normalize(); if (n.dot(r.ray.direction) > 0) n.negate();
    return { x: n.x, y: n.y, z: -n.z };
  }
  /** ekran noktasından ışın: KO'da zemin / bina yüzeyi isabeti + eklenmiş obje */
  function isin(px, py) {
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    ndc.set(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    kamUygula(); cam.updateMatrixWorld(); rc.setFromCamera(ndc, cam);
    const o = rc.ray.origin, d = rc.ray.direction;
    const ox = o.x, oy = o.y, oz = -o.z, dx = d.x, dy = d.y, dz = -d.z;   // three → KO (z ters)
    let t = -1;
    // arazi: adım adım ilerle, geçince ikiye bölerek incelt
    const H = (x, z) => state.heightAt?.(x, z) ?? 0;
    let onceki = 0, adim = 1;
    for (let s = 0.5; s < 2500; s += adim) {
      const x = ox + dx * s, y = oy + dy * s, z = oz + dz * s;
      if (y <= H(x, z)) { let a = onceki, b = s; for (let k = 0; k < 18; k++) { const m = (a + b) / 2; if (oy + dy * m <= H(ox + dx * m, oz + dz * m)) b = m; else a = m; } t = b; break; }
      onceki = s; adim = s < 60 ? 0.5 : s < 400 ? 2 : 6;
    }
    let yuzey = t >= 0 ? 'arazi' : null, normal = t >= 0 ? araziNormal(H, ox + dx * t, oz + dz * t) : null;
    // bina / nesne çarpışma yüzeyi
    if (state.col?.segment) { const L = t > 0 ? t : 2500; const h = state.col.segment(ox, oy, oz, dx, dy, dz, L); if (h >= 0 && (t < 0 || h < t)) { t = h; yuzey = 'bina'; normal = null; } }
    // haritanın görünen nesneleri (kale duvarı, bina, köprü…): gerçek üçgenlere ışın → yüzey noktası ve yüzey normali
    if (state.objects) {
      rc.far = (t > 0 ? t : 2500) + 0.01;
      const h = rc.intersectObject(state.objects, true).find((x) => gorunur(x.object));
      rc.far = Infinity;
      if (h && (t < 0 || h.distance < t)) { t = h.distance; yuzey = 'nesne'; normal = dunyaNormal(h); }
    }
    // editörde eklenmiş objeler (üst üste koyma)
    const obje = state.dunya?.sec3?.(rc) || null;
    if (obje && obje.nokta && (t < 0 || obje.mesafe < t)) { t = obje.mesafe; yuzey = 'obje'; normal = obje.normal || null; }
    if (t < 0 && !obje) return { obje: null, nokta: null };
    const nokta = t >= 0 ? { x: ox + dx * t, y: oy + dy * t, z: oz + dz * t } : null;
    return { obje: obje && (t < 0 || obje.mesafe <= t + 0.5) ? obje : null, nokta, yuzey, normal };
  }
  const tusBas = (e) => {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', 'shift', ' '].includes(k)) { tus.add(k); e.preventDefault(); }
    olay.tus?.(e);
  };
  const tusBirak = (e) => tus.delete(e.key.toLowerCase());
  const odakKayip = () => tus.clear();
  const pDown = (e) => {
    cv.focus({ preventScroll: true });
    if (e.button === 2 || e.button === 1) { bak = { x: e.clientX, y: e.clientY, yaw: K.yaw, pitch: K.pitch }; cv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if (e.button === 0) {
      // fırça modu (arazi): sol tuş basılıyken sürekli uygulanır (editör her karede imlecin altını boyar)
      if (olay.basla && olay.basla(isin(e.clientX, e.clientY), e) === true) { boyama = true; cv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      olay.tik?.(isin(e.clientX, e.clientY), e);
    }
  };
  const pMove = (e) => {
    son = { x: e.clientX, y: e.clientY };
    if (bak) { K.yaw = bak.yaw + (e.clientX - bak.x) * 0.005; K.pitch = Math.max(-1.5, Math.min(1.5, bak.pitch - (e.clientY - bak.y) * 0.005)); return; }   // sağa sürükle → sağa dön
    olay.uzerinde?.(e);
  };
  const pUp = () => { bak = null; if (boyama) { boyama = false; olay.bitir?.(); } };
  const teker = (e) => { e.preventDefault(); if (e.ctrlKey || e.altKey) { olay.teker?.(e); return; } hiz = Math.max(2, Math.min(200, hiz * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); olay.hiz?.(hiz); };
  const menu = (e) => e.preventDefault();

  function bagla(tuval, o = {}) {
    if (cv === tuval) { olay = o; aktif = true; return; }
    birak();
    cv = tuval; ctx = cv.getContext('2d'); olay = o; aktif = true;
    if (!Number.isFinite(K.x) || (K.x === 0 && K.z === 0)) karakteraDon();
    cv.tabIndex = 0;
    cv.addEventListener('keydown', tusBas); cv.addEventListener('keyup', tusBirak); cv.addEventListener('blur', odakKayip);
    cv.addEventListener('pointerdown', pDown); cv.addEventListener('pointermove', pMove); cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pUp);
    cv.addEventListener('wheel', teker, { passive: false }); cv.addEventListener('contextmenu', menu);
  }
  function birak() {
    if (!cv) { aktif = false; return; }
    cv.removeEventListener('keydown', tusBas); cv.removeEventListener('keyup', tusBirak); cv.removeEventListener('blur', odakKayip);
    cv.removeEventListener('pointerdown', pDown); cv.removeEventListener('pointermove', pMove); cv.removeEventListener('pointerup', pUp); cv.removeEventListener('pointercancel', pUp);
    cv.removeEventListener('wheel', teker); cv.removeEventListener('contextmenu', menu);
    cv = null; ctx = null; aktif = false; tus.clear(); bak = null;
  }
  function karakteraDon() {
    const p = state.player?.position || { x: 0, y: 0, z: 0 };
    const yaw = state.yaw || 0;
    K.x = p.x - Math.sin(yaw) * 14; K.z = p.z - Math.cos(yaw) * 14; K.y = Math.max((state.heightAt?.(K.x, K.z) ?? p.y) + 3, p.y + 9); K.yaw = yaw; K.pitch = -0.42;
  }
  function git(x, y, z, uzak = 12) {   // bir noktaya bak (seçili objeye odaklan)
    K.x = x - Math.sin(K.yaw) * uzak * Math.cos(0.5); K.z = z - Math.cos(K.yaw) * uzak * Math.cos(0.5); K.y = y + uzak * Math.sin(0.5) + 1; K.pitch = -0.5;
  }
  /** ana döngü: ana çizimden hemen önce çağrılır */
  function kare(dt, t) {
    if (!aktif || !cv || !cv.isConnected || cv.offsetParent === null) return;
    // hareket
    const h = hiz * (tus.has('shift') ? 3 : 1) * dt, f = ileri(), yx = Math.sin(K.yaw), yz = Math.cos(K.yaw);
    if (tus.has('w')) { K.x += f[0] * h; K.y += f[1] * h; K.z += f[2] * h; }
    if (tus.has('s')) { K.x -= f[0] * h; K.y -= f[1] * h; K.z -= f[2] * h; }
    if (tus.has('d')) { K.x += yz * h; K.z -= yx * h; }   // sağa kay (KO z ters)
    if (tus.has('a')) { K.x -= yz * h; K.z += yx * h; }   // sola kay
    if (tus.has('e') || tus.has(' ')) K.y += h;
    if (tus.has('q')) K.y -= h;
    const zemin = (state.heightAt?.(K.x, K.z) ?? -1e9) + 0.6; if (K.y < zemin) K.y = zemin;
    const W = state.world || 4096; K.x = Math.max(0, Math.min(W, K.x)); K.z = Math.max(0, Math.min(W, K.z));
    // çizim boyutu: panel tuvali ile ana tuvalin küçüğü
    renderer.getDrawingBufferSize(v2); renderer.getSize(v2b);
    const pr = v2.x / v2b.x, cw = cv.clientWidth, ch = cv.clientHeight; if (cw < 8 || ch < 8) return;
    const w = Math.min(Math.round(cw * Math.min(pr, 1.5)), v2.x), hh = Math.min(Math.round(ch * Math.min(pr, 1.5)), v2.y);
    if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
    cam.aspect = w / hh; cam.far = Math.max(camera.far, 3000); cam.updateProjectionMatrix(); kamUygula();
    olay.kare?.(dt);
    if (state.sky?.userData?.tick) state.sky.userData.tick(t, cam.position);
    renderer.setScissorTest(true); renderer.setViewport(0, 0, w / pr, hh / pr); renderer.setScissor(0, 0, w / pr, hh / pr);
    // izleyici görüntüsünde sis yok (GM haritayı uzaktan da net görür); ana çizimden önce eski değerler geri konur
    const sis = scene.fog, sn = sis?.near, sf = sis?.far; if (sis) { sis.near = 1e6; sis.far = 2e6; }
    const sm = [state.terrain?.userData?.material, ...(state.water ? state.water.children.map((m) => m.material) : [])].filter((m) => m?.uniforms?.uFogNear);
    const eski = sm.map((m) => [m.uniforms.uFogNear.value, m.uniforms.uFogFar.value]); for (const m of sm) { m.uniforms.uFogNear.value = 1e6; m.uniforms.uFogFar.value = 2e6; }
    renderer.render(scene, cam);
    if (sis) { sis.near = sn; sis.far = sf; }
    sm.forEach((m, i) => { m.uniforms.uFogNear.value = eski[i][0]; m.uniforms.uFogFar.value = eski[i][1]; });
    ctx.drawImage(renderer.domElement, 0, v2.y - hh, w, hh, 0, 0, w, hh);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, v2b.x, v2b.y);
    if (state.sky?.userData?.tick) state.sky.userData.tick(t, camera.position);
  }
  return {
    bagla, birak, kare, karakteraDon, git, isin, asagi,
    get aktif() { return aktif && !!cv && cv.isConnected && cv.offsetParent !== null; },
    get konum() { return K; },
    get hiz() { return hiz; }, set hiz(v) { hiz = v; },
    get fare() { return son; },
    get boyama() { return boyama; },
  };
}
