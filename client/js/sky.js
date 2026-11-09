// Gökyüzü — CN3SkyMng karşılığı (n3sky gün döngüsü olayları).
//  - arka plan: SkyColor
//  - ufuk: FogColor bandı (CN3Sky ön billboard: 3.8°'ye kadar dolu, 18.4°'de saydam)
//  - bulutlar: CN3Cloud birebir — orijinal KO Misc\Sky dokuları (wisps, puffs, tatters, streaks, dense, overcast; assets/bulut),
//    iki katlı kesik piramit (alt kare ±24 / y 5 saydam kenar, üst kare ±8 / y 9.62 opak, uv 0..4), iki katman ayrı hızla kayar,
//    hava değişince dokular 10 sn'de geçer (SetWeather: yağış yoğunluğuna göre overcast/dense … tatters/puffs)
//  - sis: FogColor, başlangıç = görüş * 0.75, bitiş = görüş (CN3Camera)
import * as THREE from '../vendor/three.module.min.js';

const hexColor = (h) => new THREE.Color().setHex(h, THREE.SRGBColorSpace);

/** Belirli saniyedeki (0..86400) olay değerlerini — en son geçen olayı — döndür */
function stateAt(events, sec) {
  const out = {};
  const types = [...new Set(events.map((e) => e.type))];
  for (const t of types) {
    const list = events.filter((e) => e.type === t).sort((a, b) => a.time - b.time);
    let cur = list[list.length - 1];
    for (const e of list) if (e.time <= sec) cur = e;
    out[t] = cur;
  }
  return out;
}

export const BULUT_TUR = ['wisps', 'puffs', 'tatters', 'streaks', 'dense', 'overcast'];   // CN3Cloud e_CLOUDTEX sırası
let bulutP = null;
function bulutDokulari() {
  return (bulutP ||= (async () => {
    const loader = new THREE.TextureLoader(), o = {};
    await Promise.all(BULUT_TUR.map(async (n) => {
      const u = `./assets/bulut/${n}.webp`;
      const t = await loader.loadAsync(window.KO_V ? window.KO_V(u) : u).catch(() => null);
      if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.flipY = false; o[n] = t; }
    }));
    return o;
  })());
}

export async function loadSky(base) {
  const r = await fetch(`${base}/sky.json`);
  if (!r.ok) return null;
  const def = await r.json();
  const loader = new THREE.TextureLoader();
  const tex = async (name) => {
    if (!name) return null;
    const t = await loader.loadAsync(window.KO_V ? window.KO_V(`${base}/${name}`) : `${base}/${name}`).catch(() => null);
    if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.flipY = false; }
    return t;
  };
  const byName = (n) => def.textures.find((f) => f && f.startsWith(n));
  // bulut dokuları: orijinal KO istemcisinin Misc\Sky klasöründen (tüm haritalar için ortak); yoksa bölgenin kendi dokusu
  const bulut = await bulutDokulari();
  const [wisps, puffs] = bulut.wisps && bulut.puffs ? [bulut.wisps, bulut.puffs] : await Promise.all([tex(byName('wisps')), tex(byName('puffs'))]);
  // KO güneşi (CN3Sun): disk + ışıma + parlama dokuları — yalnız güneş açık bölgelerde kullanılır
  const sunTex = async (n) => { const t = await tex(byName(n)); if (t) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; } return t; };
  const [sundisk, sunglow, sunflare] = await Promise.all([sunTex('sundisk'), sunTex('sunglow'), sunTex('sunflare')]);
  return { def, wisps, puffs, bulut: { ...bulut, wisps, puffs }, sundisk, sunglow, sunflare };
}

export function buildSky(sky, { scene, time = 21600, gunes = null, bulutlu = false, dongu = false }) {
  const st = stateAt(sky.def.events, time);
  const skyCol = hexColor(st.sky?.color ?? 0x184a70);
  const fogCol = hexColor(st.fog?.color ?? 0x70cdba);
  const c1 = st.cloud1 ? { c: hexColor(st.cloud1.color), a: st.cloud1.alpha / 255 } : { c: new THREE.Color(1, 1, 1), a: 1 };
  const c2 = st.cloud2 ? { c: hexColor(st.cloud2.color), a: st.cloud2.alpha / 255 } : { c: new THREE.Color(1, 1, 1), a: 1 };
  // bulutlu hava (karakter seçimi): gri-mavi kapalı gökyüzü, puslu ufuk, yoğun ve koyu alt yüzlü bulutlar
  if (bulutlu) {
    skyCol.lerp(hexColor(0x5d6873), 0.75); fogCol.lerp(hexColor(0x8f989f), 0.7);
    c1.c.lerp(hexColor(0xd9dde0), 0.7); c1.a = Math.max(c1.a, 0.95);
    c2.c.lerp(hexColor(0xb4bbc1), 0.75); c2.a = 1;
  }
  scene.background = skyCol.clone();

  const group = new THREE.Group(); group.name = 'sky';
  // ufuk bandı: kamera merkezli küre, yüksekliğe göre sis renginden gökyüzüne
  const toG = (c) => c.clone().convertLinearToSRGB();
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,   // opak listede, önce çizilir
    uniforms: { uFog: { value: toG(fogCol) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uFog; varying vec3 vP;
      void main(){ float e = asin(clamp(normalize(vP).y, -1.0, 1.0));
        float a = 1.0 - smoothstep(0.0664, 0.3218, e);   // 3.8° .. 18.4°
        gl_FragColor = vec4(uFog, a); }`,
  }));
  horizon.renderOrder = -10; group.add(horizon);

  // bulutlar: CN3Cloud::Init "2단" geometrisi — alt kare ±24 (y 5, kenar saydam), üst kare ±8 (y 5 + 8/√3, opak), uv 0..4
  const BIG = 24, SMALL = 8, H0 = 5, H1 = H0 + (16 - SMALL) / Math.sqrt(3), UVM = 4, off = (1 - SMALL / BIG) * UVM / 2;
  const P = [[-BIG, H0, -BIG], [BIG, H0, -BIG], [BIG, H0, BIG], [-BIG, H0, BIG], [-SMALL, H1, -SMALL], [SMALL, H1, -SMALL], [SMALL, H1, SMALL], [-SMALL, H1, SMALL]];
  const UV = [[0, 0], [UVM, 0], [UVM, UVM], [0, UVM], [off, off], [UVM - off, off], [UVM - off, UVM - off], [off, UVM - off]];
  const A = [0, 0, 0, 0, 1, 1, 1, 1];
  const IDX = [0, 1, 4, 1, 2, 5, 2, 3, 6, 3, 0, 7, 5, 4, 1, 6, 5, 2, 7, 6, 3, 4, 7, 0, 4, 5, 7, 5, 6, 7];   // CN3Cloud CloudIndex
  const cloudLayer = (map, col, speed, order, olcek = 1) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV.flat(), 2));
    g.setAttribute('va', new THREE.Float32BufferAttribute(A, 1));
    g.setIndex(IDX);
    const uOff = { value: new THREE.Vector2() };
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      side: THREE.DoubleSide, depthWrite: false, depthTest: false, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { uMap: { value: map }, uMap2: { value: map }, uMix: { value: 0 }, uCol: { value: toG(col.c) }, uA: { value: col.a }, uOff, uS: { value: olcek } },
      vertexShader: 'attribute float va; varying float vA; varying vec2 vUv; uniform vec2 uOff; uniform float uS; void main(){ vA = va; vUv = uv * uS + uOff; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      // doku geçişi (CN3Cloud cloud2 → cloud3): eski doku (1 - mix), yeni doku mix
      fragmentShader: 'uniform sampler2D uMap; uniform sampler2D uMap2; uniform float uMix; uniform vec3 uCol; uniform float uA; varying float vA; varying vec2 vUv; void main(){ vec4 t = mix(texture2D(uMap, vUv), texture2D(uMap2, vUv), uMix); gl_FragColor = vec4(t.rgb * uCol, t.a * vA * uA); }',
    }));
    m.renderOrder = order; m.userData.speed = speed; m.userData.off = uOff; m.frustumCulled = false;
    return m;
  };
  const layers = [];
  if (sky.wisps) layers.push(cloudLayer(sky.wisps, c1, [0.005, 0.015], -9));
  if (sky.puffs) layers.push(cloudLayer(sky.puffs, c2, [0.015, 0.025], -8));
  if (bulutlu) {
    // kapalı hava örtüsü: ufuktan tepeye gri katman (gökyüzü rengini bastırır), üstüne iki ek bulut katmanı (farklı ölçek/hız → derinlik)
    const ort = new THREE.Mesh(new THREE.SphereGeometry(9.5, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { uUst: { value: toG(hexColor(0x5a636c)) }, uAlt: { value: toG(fogCol) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uUst; uniform vec3 uAlt; varying vec3 vP;
        void main(){ float y = clamp(normalize(vP).y, 0.0, 1.0); vec3 c = mix(uAlt, uUst, smoothstep(0.02, 0.6, y));
          gl_FragColor = vec4(c, 0.8 * smoothstep(-0.05, 0.08, y)); }`,
    }));
    ort.renderOrder = -9.8; group.add(ort);
    const koyu = { c: c2.c.clone().multiplyScalar(0.72), a: 0.85 }, acik = { c: c1.c.clone(), a: 0.7 };
    if (sky.puffs) layers.push(cloudLayer(sky.puffs, koyu, [0.008, 0.011], -8.5, 0.55));   // büyük, ağır yağmur bulutu kütleleri
    if (sky.puffs) layers.push(cloudLayer(sky.puffs, acik, [0.022, 0.03], -7.5, 1.7));     // önde hızlı süzülen ince parçalar
    if (sky.wisps) layers.push(cloudLayer(sky.wisps, { c: c1.c.clone(), a: 0.6 }, [0.012, 0.004], -7, 1.3));
  }
  layers.forEach((l) => group.add(l));
  // hava değişince bulut dokuları (CN3SkyMng::SetWeather → CN3Cloud::SetCloud, 10 sn geçiş)
  const gecis = [];   // [katman, başlangıç, süre]
  group.userData.bulutTex = (t1, t2, sure = 10) => {
    const D = sky.bulut || {};
    [[layers[0], D[t1]], [layers[1], D[t2]]].forEach(([l, tx]) => {
      if (!l || !tx) return; const u = l.material.uniforms;
      const hedef = u.uMix.value >= 0.5 ? u.uMap2.value : u.uMap.value; if (hedef === tx) return;
      u.uMap.value = hedef; u.uMap2.value = tx; u.uMix.value = 0; gecis.push([l, performance.now(), sure * 1000]);
    });
  };
  group.userData.bulutCarp = [1, 1];   // yağışta bulut renkleri koyulaşır (cloud1 × fDelta·0.75, cloud2 × fDelta·0.5)

  group.userData.fogColor = fogCol;
  // güneş: gunes = yön (dünya, birim vektör). KO renkleri: sun / glow / flare olayları; bulutların arkasında, ufkun önünde
  let gun = null;
  if (gunes && (sky.sundisk || sky.sunglow)) {
    const renk = (e, d) => (e ? hexColor(e.color) : new THREE.Color(d));
    const sp = (map, col, olc, op, order) => {
      if (!map) return null;
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
      m.scale.setScalar(olc); m.renderOrder = order; m.frustumCulled = false; group.add(m); return m;
    };
    const R = 9;
    const glow = sp(sky.sunglow, renk(st.glow, 0xffe9b0), 3.6, 0.85, -9.6), disk = sp(sky.sundisk, renk(st.sun, 0xfff6dc).lerp(new THREE.Color(1, 1, 1), 0.35), 0.7, 1, -9.5);
    const flare = sp(sky.sunflare, renk(st.flare, 0xffd9a0), 2.4, 0.5, -9.4);
    for (const m of [glow, disk, flare]) m?.position.copy(gunes).multiplyScalar(R);
    gun = { glow, flare, disk, dir: gunes.clone().normalize() };
  }
  const _bak = new THREE.Vector3();
  group.userData.gunes = (cam) => {   // kamera güneşe baktıkça ışıma/parlama güçlenir (göz kamaşması)
    if (!gun || !cam) return;
    cam.getWorldDirection(_bak); const k = Math.max(0, _bak.dot(gun.dir));
    const gd = group.userData.isik ? group.userData.isik.gunduz : 1;
    if (gun.glow) gun.glow.material.opacity = (0.55 + 0.45 * k * k) * gd;
    if (gun.flare) { gun.flare.material.opacity = (0.15 + 0.6 * Math.pow(k, 6)) * gd; gun.flare.material.rotation += 0.0006; }
  };
  // ---- KO gün döngüsü (CN3SkyMng): n3sky olayları (SunRise 05:00, Noon 06:00, SunSet 17:00, MidNight 21:00 …) — her tür kendi
  // önceki değerinden olayın süresi boyunca geçer; güneş doğudan doğar batıdan batar, gece ay ve yıldızlar çıkar
  if (dongu && !bulutlu) {
    const tur = {}; for (const e of sky.def.events) (tur[e.type] ||= []).push(e); for (const L of Object.values(tur)) L.sort((a, b) => a.time - b.time);
    const GECIS = 10;   // KO CN3SkyMng: fHowLong gerçek saniye; oyun 10× hızlı (TIME_REAL_PER_GAME) → 150–180 sn = 25–30 oyun dakikası geçiş
    const deger = (tip, sec) => {
      const L = tur[tip]; if (!L?.length) return null; const n = L.length;
      let i = -1; for (let k = 0; k < n; k++) if (L[k].time <= sec) i = k;
      const cur = i >= 0 ? L[i] : L[n - 1], prev = L[((i >= 0 ? i : n - 1) - 1 + n) % n];
      const gecen = (sec - cur.time + 86400) % 86400, k = n < 2 ? 1 : Math.min(1, gecen / Math.max(1, (cur.dur || 0) * GECIS));
      const c = tonYumusat(hexColor(prev.color).lerp(hexColor(cur.color), k));
      return { c, a: (prev.alpha + (cur.alpha - prev.alpha) * k) / 255, p: prev.param + (cur.param - prev.param) * k, cur, k };
    };
    // yıldızlar (CN3Stars): gece görünür
    const NY = 900, yp = new Float32Array(NY * 3);
    for (let i = 0; i < NY; i++) { const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05, r = Math.sqrt(1 - y * y); yp[i * 3] = r * Math.cos(th) * 8.8; yp[i * 3 + 1] = y * 8.8; yp[i * 3 + 2] = r * Math.sin(th) * 8.8; }
    const yg = new THREE.BufferGeometry(); yg.setAttribute('position', new THREE.BufferAttribute(yp, 3));
    const yildiz = new THREE.Points(yg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
    yildiz.renderOrder = -9.7; group.add(yildiz);
    // güneş ve ay sprite'ları (dokular varsa)
    const spr = (map, col, olc, order, toplam = THREE.AdditiveBlending) => { if (!map) return null; const m = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: col, transparent: true, blending: toplam, depthWrite: false, depthTest: false, fog: false })); m.scale.setScalar(olc); m.renderOrder = order; m.frustumCulled = false; group.add(m); return m; };
    const dGlow = gun?.glow || spr(sky.sunglow, 0xffe9b0, 3.6, -9.6), dDisk = gun?.disk || spr(sky.sundisk, 0xfff6dc, 0.7, -9.5), dFlare = gun?.flare || spr(sky.sunflare, 0xffd9a0, 2.4, -9.4);
    if (gun) gun.disk = dDisk;
    const ay = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 10, 32, 32, 31); gr.addColorStop(0, 'rgba(255,252,235,1)'); gr.addColorStop(0.62, 'rgba(240,238,225,0.95)'); gr.addColorStop(0.7, 'rgba(200,210,255,0.25)'); gr.addColorStop(1, 'rgba(200,210,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return spr(t, 0xffffff, 0.75, -9.55, THREE.NormalBlending); })();
    const isik = { light0: new THREE.Color(1, 1, 1), light1: new THREE.Color(1, 1, 1), light2: new THREE.Color(0.12, 0.12, 0.12), gunesYon: new THREE.Vector3(0.4, 0.8, 0.3).normalize(), gunduz: 1 };
    const horMat = horizon.material, c1L = layers[0], c2L = layers[1];
    group.userData.isik = isik;
    group.userData.zaman = (sec) => {
      sec = ((sec % 86400) + 86400) % 86400;
      const sk = deger('sky', sec), fg = deger('fog', sec);
      if (sk) scene.background = sk.c.clone();
      if (fg) { fogCol.copy(fg.c); horMat.uniforms.uFog.value.copy(toG(fg.c)); }
      const a1 = deger('cloud1', sec), a2 = deger('cloud2', sec);
      const [k1, k2] = group.userData.bulutCarp || [1, 1];
      if (a1 && c1L) { c1L.material.uniforms.uCol.value.copy(toG(a1.c.clone().multiplyScalar(k1))); c1L.material.uniforms.uA.value = a1.a; }
      if (a2 && c2L) { c2L.material.uniforms.uCol.value.copy(toG(a2.c.clone().multiplyScalar(k2))); c2L.material.uniforms.uA.value = a2.a; }
      for (const [k, t] of [['light0', 'light0'], ['light1', 'light1'], ['light2', 'light2']]) { const d = deger(t, sec); if (d) isik[k].copy(d.c); }
      // güneş yayı (KO CN3SkyMng: açı = saat / 24 × 360 + 270): 06:00 doğu ufku → 12:00 tepe → 18:00 batı ufku
      const DOG = 6 * 3600, BAT = 18 * 3600, f = (sec - DOG) / (BAT - DOG);
      const aci = f * Math.PI, yuk = Math.sin(aci);
      isik.gunesYon.set(Math.cos(aci) * 0.85, Math.max(-0.4, yuk) * 0.9 + 0.02, 0.38).normalize();
      isik.gunduz = Math.max(0, Math.min(1, yuk * 4));
      const sg = deger('sun', sec), gl = deger('glow', sec), fl = deger('flare', sec);
      for (const [m, d, op] of [[dDisk, sg, 1], [dGlow, gl, 0.85], [dFlare, fl, 0.5]]) { if (!m) continue; m.position.copy(isik.gunesYon).multiplyScalar(9); if (d) m.material.color.copy(d.c); m.material.opacity = op * isik.gunduz; m.visible = isik.gunduz > 0.01; }
      if (gun) gun.dir.copy(isik.gunesYon);
      const gece = 1 - Math.max(0, Math.min(1, (yuk + 0.08) * 6));
      const st = deger('stars', sec); const yogun = st ? Math.min(1, (st.c.r + st.c.g + st.c.b) > 0 || st.cur.color > 0 ? 1 : 0) : 1;
      yildiz.material.opacity = 0.85 * gece * yogun; yildiz.visible = yildiz.material.opacity > 0.01;
      if (ay) { ay.position.set(-isik.gunesYon.x, Math.max(0.12, -isik.gunesYon.y), -isik.gunesYon.z * 0.6).normalize().multiplyScalar(9); ay.material.opacity = gece; ay.visible = gece > 0.01; }
      return isik;
    };
    group.userData.zaman(time);
  }
  // gökyüzünün tüm parçaları (ufuk, bulutlar, güneş, ay, yıldızlar) derinlik testiyle en uzak düzlemde çizilir:
  // binalar / ağaçlar önüne geçince güneş ve bulutlar onların içinden görünmez (önceden depthTest kapalıydı ve saydam liste opaklardan sonra çiziliyordu)
  group.traverse((o) => { for (const m of [].concat(o.material || [])) uzakDuzlem(m); });
  group.userData.tick = (t, camPos) => {
    group.position.copy(camPos);
    for (const l of layers) l.userData.off.value.set((t * l.userData.speed[0]) % 10, (t * l.userData.speed[1]) % 10);
    const now = performance.now();
    for (let i = gecis.length - 1; i >= 0; i--) { const [l, t0, d] = gecis[i], k = Math.min(1, (now - t0) / d); l.material.uniforms.uMix.value = k; if (k >= 1) { const u = l.material.uniforms; u.uMap.value = u.uMap2.value; u.uMix.value = 0; gecis.splice(i, 1); } }
  };
  return group;
}
// kullanıcı isteği: gün döngüsündeki turuncu (gün doğumu / batımı) ve mor (gece sisi) tonların yoğunluğu %70 azaltılır —
// renk doygunluğu bu ton aralıklarında (turuncu 10°–55°, mor/eflatun 250°–335°) %30'a iner, parlaklık korunur
const _hsl = { h: 0, s: 0, l: 0 };
function tonYumusat(c) {
  c.getHSL(_hsl); const h = _hsl.h * 360;
  if (h >= 10 && h <= 55) c.setHSL(_hsl.h, _hsl.s * 0.3, _hsl.l + (1 - _hsl.l) * 0.4);   // turuncu: ayrıca %40 daha açık (kullanıcı isteği)
  else if (h >= 250 && h <= 335) c.setHSL(_hsl.h, _hsl.s * 0.3, _hsl.l);
  return c;
}
function uzakDuzlem(m) {
  if (!m || m.userData.uzak) return; m.userData.uzak = true;
  m.depthTest = true; m.depthWrite = false;
  const eski = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { eski?.call(m, sh, r); const i = sh.vertexShader.lastIndexOf('}'); sh.vertexShader = sh.vertexShader.slice(0, i) + '  gl_Position.z = gl_Position.w * 0.999995;\n' + sh.vertexShader.slice(i); };
  m.customProgramCacheKey = () => 'gok-uzak';
  m.needsUpdate = true;
}
