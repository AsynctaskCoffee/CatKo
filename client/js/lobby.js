// Oyun öncesi ekranlar — v2038 akışı, orijinal arayüz dosyalarıyla (assets/ui, re_* yerleşimleri):
//   re_login_intro (giriş → duyuru → sunucu listesi) → re_nation_select (sunucuda karakter yoksa)
//   → re_characterselect (3B kaideler) ⇄ re_charactercreate → oyun
// Karakter seçildiğinde çözülür; main.js o karakterle dünyayı yükler.
import * as THREE from '../vendor/three.module.min.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { loadCharacterMeta, createCharacter, appearanceOptions } from './character.js';
import { loadUI, buildLayout, translateLayout, UI_BASE, findSprite, paintSprite, hasLayout, ekUI } from './kui.js';
import { loadZone, buildTerrain, makeHeightFn } from './terrain.js';
import { loadObjects } from './objects.js';
import { loadWater } from './water.js';
import { loadSky, buildSky } from './sky.js';

// Karakter seçimi arka planı — KO'daki gibi ulusun giriş haritası (CGameProcCharacterSelect):
//   Karus → karus_intro, El Morad → elmorad_intro (KO 2369: ordugâh ve ulus geçidi önü)
//   at: karakterlerin durduğu nokta (KO x,z), cam: karakterlerden kameraya yön (KO x,z)
const INTRO = {
  // KO 2369 (deadsoft) giriş haritaları: iki ulusta da aynı yerleşim — ordugâh, ulus geçidi (X 142, Z 122) ve arkada kale.
  // Karakterler geçidin doğusunda (X 148, Z 122,5), kamera doğuda: geçit, çadırlar ve kale sancakları karakterlerin arkasında.
  1: { zone: 'karus_intro', at: [148, 122.5], cam: [1, 0], fly: [[10, 26, 34], [0, 1, -8]] },
  2: { zone: 'elmorad_intro', at: [148, 122.5], cam: [1, 0], fly: [[10, 26, 34], [0, 1, -8]] },
};
// KO CGameProcCharacterSelect yerleşimi (yerel: orta karakter orijinde, kamera +z'de)
// Karus: göz (0,-0.2,7.4) bakış (0,-0.4,0), karakterler y -1.16: orta (0,2.72) 0°, sol (1.86,2.1) 42°, sağ (-1.9,2.1) -42°; kamera sola 0.75 / sağa 0.77 nokta çarpımına kadar döner
// El Morad: göz (0,-0.2,7.0), karakterler y -1.20: orta (0,2.74), sol (1.86,2.0) 42°, sağ (-1.9,2.0) -46°; 0.74 / 0.73. FOV 0.96 rad.
const KO_SECIM = {
  1: { yer: [[0, 0, 0], [-1.86, -0.62, -42], [1.9, -0.62, 42]], pivot: [0, 0.76, -2.72], r: 7.4, aci: [0, -Math.acos(0.75), Math.acos(0.77)] },
  2: { yer: [[0, 0, 0], [-1.86, -0.74, -42], [1.9, -0.74, 46]], pivot: [0, 0.8, -2.74], r: 7.0, aci: [0, -Math.acos(0.74), Math.acos(0.73)] },
};
const KAM = { pivot: new THREE.Vector3(0, 0.76, -2.72), r: 7.4, h: 0.2, aci: [0, -0.7227, 0.6929], fov: 0.96 * 180 / Math.PI };
let KO_YER = KO_SECIM[1].yer;
const kamUlus = (n) => { const k = KO_SECIM[n] || KO_SECIM[1]; KO_YER = k.yer; KAM.pivot.set(...k.pivot); KAM.r = k.r; KAM.aci = k.aci; };
const REMOTE_ZONES = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? './zones' : (window.KO_DEMO ? './zones' : 'https://vnlevnlsyyqkofnplzdm.supabase.co/storage/v1/object/public/zones'));   // yerel kurulum (localhost): harita dosyaları site/zones klasöründen

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const NATION = { 1: 'Karus', 2: 'El Morad' };
export const CLASS = { 1: 'Warrior', 2: 'Rogue', 3: 'Magician', 4: 'Priest', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Enchanter', 11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Berserker Kurian', 15: 'Guardian Kurian' };
const RACE = {
  1: { name: 'Arch Tuarek', nation: 1, classes: [1], btn: 'btn_race_ka_at', desc: 'The mightiest warriors of Karus. High strength and stamina; can only be a Warrior.' },
  2: { name: 'Tuarek', nation: 1, classes: [2, 4], btn: 'btn_race_ka_tu', desc: 'Agile and versatile; can be a Rogue or a Priest.' },
  3: { name: 'Wrinkle Tuarek', nation: 1, classes: [3], btn: 'btn_race_ka_wt', desc: 'Keepers of ancient magic. Can only be a Magician.' },
  4: { name: 'Puri Tuarek', nation: 1, classes: [4, 3], btn: 'btn_race_ka_pt', desc: 'The graceful healers of Karus; can be a Priest or a Magician.' },
  6: { name: 'Kurian', nation: 1, classes: [13], btn: 'btn_race_ka_ku', desc: 'The holy warriors of Karus. Kurian class only.' },
  11: { name: 'Barbarian', nation: 2, classes: [1], btn: 'btn_race_el_ba', desc: 'The giant warriors of El Morad. Can only be a Warrior.' },
  12: { name: 'Male El Moradian', nation: 2, classes: [1, 2, 3, 4], btn: 'btn_race_el_rm', desc: 'A balanced human race; open to all classes.' },
  13: { name: 'Female El Moradian', nation: 2, classes: [1, 2, 3, 4], btn: 'btn_race_el_rf', desc: 'Graceful and agile; open to all classes.' },
  14: { name: 'Porutu', nation: 2, classes: [13], btn: 'btn_race_el_ku', desc: 'The holy warriors of El Morad. Porutu class only.' },
};
// KO 2369 karakter oluşturma meslek açıklamaları (Texts_us.tbl 3205–3217; Karus / El Morad meslek adlarıyla)
// KO meslek adları (ulusa göre): Karus Berserker / Guardian, Hunter / Penetrator, Sorcerer / Necromancer, Shaman / Dark Priest;
// El Morad Blade / Protector, Ranger / Assassin, Mage / Enchanter, Cleric / Druid
const JOB_EN = {
  1: { 1: 'Warrior', 2: 'Rogue', 3: 'Magician', 4: 'Priest', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Necromancer', 11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Berserker Kurian', 15: 'Guardian Kurian' },
  2: { 1: 'Warrior', 2: 'Rogue', 3: 'Magician', 4: 'Priest', 5: 'Blade', 6: 'Protector', 7: 'Ranger', 8: 'Assassin', 9: 'Mage', 10: 'Enchanter', 11: 'Cleric', 12: 'Druid', 13: 'Porutu', 14: 'Berserker Porutu', 15: 'Guardian Porutu' },
};
const KO_MESLEK = {
  1: { 1: "Warriors can become a Berserker that uses variety of weapons to inflict critical damage, or they can become a Guardian with high defense ability to protect ally's magicians and priests.",
    2: 'Rogues can become an Assassin to sneak up to the enemy and inflict a critical damage, or they can become a Hunter that can attack enemies from far away with bows and spears.',
    3: 'Magicians can become a Sorcerer which uses 4 basic elements to perform attack magic or they can become a Necromancer, the master of the dead.',
    4: 'Priests can become a Shaman that heals its ally or become a Dark Priest that can use cursing skills.',
    13: 'Kurians are holy warriors who fight with spears and a shield, protecting their allies with divine power.' },
  2: { 1: "Warriors can become a Blade that uses variety of weapons to inflict critical damage, or they can become a Protector with high defense ability to protect ally's magicians and priests.",
    2: 'Rogues can become an Assassin to sneak up to the enemy and inflict a critical damage, or they can become a Ranger that can attack enemies from far away with bows and spears.',
    3: 'Magicians can become a Mage which uses 4 basic elements to perform attack magic or they can become an Enchanter, the master of mind control.',
    4: "Priests can become a Cleric to heal friends or become a Druid to cast a curse on the enemy or increase ally's stats.",
    13: 'Porutus are holy warriors who fight with spears and a shield, protecting their allies with divine power.' },
};
const CLASS_BTN = { 1: 'btn_class_warrior', 2: 'btn_class_rogue', 3: 'btn_class_mage', 4: 'btn_class_priest' };
const STAT_UI = [['str', 'str'], ['dex', 'dex'], ['sta', 'sta'], ['intel', 'int'], ['cha', 'map']];   // [veritabanı, arayüz]
const FREE_POINTS = 10;

const TR = {   // (3.11) giriş ekranları İngilizce (KO orijinal metinleri); yalnız düğme adları sadeleştirilir
  ID: 'E-mail', Homepage: 'Register', 'Premium Service': '',
};

function trErr(e) {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'Invalid ID or password.';
  if (/Email not confirmed/i.test(m)) return 'Your e-mail address has not been verified yet. Please check your inbox.';
  if (/geçersiz isim/.test(m)) return 'The name must be 3-20 characters; only letters, numbers and _ are allowed.';
  if (/isim ya da yuva|duplicate|characters_name_lower/.test(m)) return 'This name is already in use.';
  return m.replace(/^.*?:\s*/, '');
}

// KO saç rengi paleti (co_palette): renk ızgarası + serbest renk seçici; Default = özgün saç dokusu
const SAC_RENKLER = [0x2a1a10, 0x3d2614, 0x5a3820, 0x7a4e2a, 0x9a6a3a, 0xc08a50, 0xe0b878, 0xf0dca0,
  0x101010, 0x3a3a3a, 0x6a6a6a, 0x9a9a9a, 0xd8d8d8, 0xffffff, 0x8a1a12, 0xc0301e,
  0xe05a28, 0xf08a30, 0xd8b040, 0x6a8a2a, 0x2a7a4a, 0x2a6a8a, 0x2a4ab0, 0x5a3ab0, 0x8a3aa0, 0xc04a8a, 0xf07ab0, 0x9ad0f0];
// (5.11) KO "Change Hair Color" → re_palette.uif (orijinal çerçeve / düğme dokuları, assets/ui/palet): renk paleti (yatay renk tonu, aşağı doğru griye),
// "Input Color Manually" R / G / B kutuları, Confirm. Palete tıklama / sürükleme ve kutular rengi anında saça uygular.
async function sacPalet(btn, secili, sec) {
  document.getElementById('ko-sac-palet')?.remove();
  if (!(await ekUI('palet').catch(() => false)) || !hasLayout('re_palette')) return;
  const L = buildLayout('re_palette', { className: 'ko-palet' }); const w = L.el; w.id = 'ko-sac-palet';
  Object.assign(w.style, { position: 'fixed', zIndex: 9000, left: '8px', top: Math.max(8, (innerHeight - 452) / 2) + 'px' });
  // (5.11) sabit yer: "Detailing Settings" (Group_class) panelinin hemen solunda, üst kenarı hizalı
  const yerles = () => { const pn = btn?.closest?.('[data-id="Group_class"]') || btn; const r = pn?.getBoundingClientRect?.(); if (!r || !r.width) return;
    w.style.left = Math.max(4, r.left - 281 - 6) + 'px'; w.style.top = Math.max(4, Math.min(innerHeight - 456, r.top)) + 'px'; };
  addEventListener('resize', yerles);
  L.show('notice', false);
  L.text('notice2', 'Input Color Manually');
  const ap = L.get('apply'); ap?.querySelectorAll('.kui-tx').forEach((t) => { t.textContent = 'Confirm'; });
  for (const t of w.querySelectorAll('.kui-tx')) { const x = t.textContent.trim(); if (x === 'R' || x === 'G' || x === 'B') t.classList.add('pl-' + x.toLowerCase()); }
  const v = Number(secili ?? 0) >>> 0;
  let rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  const kutu = ['edit_r', 'edit_g', 'edit_b'].map((id, i) => L.input(id, { type: 'text', value: String(rgb[i]), maxLength: 3, inputMode: 'numeric' }));
  const uygula = () => sec((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]);
  const yaz = () => kutu.forEach((k, i) => { if (k && document.activeElement !== k) k.value = String(rgb[i]); });
  kutu.forEach((k, i) => k?.addEventListener('input', () => { const n = Math.max(0, Math.min(255, parseInt(k.value.replace(/\D/g, ''), 10) || 0)); k.value = k.value.replace(/\D/g, '').slice(0, 3); rgb[i] = n; uygula(); }));
  // palet: x = renk tonu (kırmızı → … → kırmızı), y = aşağı indikçe griye karışır
  const pal = L.get('img_palette');
  if (pal) {
    const cv = document.createElement('canvas'); cv.width = 255; cv.height = 255; cv.className = 'pl-tuval';
    const c = cv.getContext('2d'), gx = c.createLinearGradient(0, 0, 255, 0);
    ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'].forEach((r, i) => gx.addColorStop(i / 6, r));
    c.fillStyle = gx; c.fillRect(0, 0, 255, 255);
    const gy = c.createLinearGradient(0, 0, 0, 255); gy.addColorStop(0, 'rgba(136,136,144,0)'); gy.addColorStop(1, 'rgba(136,136,144,1)');
    c.fillStyle = gy; c.fillRect(0, 0, 255, 255);
    pal.append(cv);
    let surukle = false;
    const al = (e) => { const r = cv.getBoundingClientRect(); const x = Math.max(0, Math.min(254, (e.clientX - r.left) * 255 / r.width)), y = Math.max(0, Math.min(254, (e.clientY - r.top) * 255 / r.height));
      const d = c.getImageData(x | 0, y | 0, 1, 1).data; rgb = [d[0], d[1], d[2]]; yaz(); uygula(); };
    // (5.11) palet üstündeki şeffaf alan (ar) ve kui-img'nin pointer-events:none'ı tıklamayı yutuyordu → olaylar palet grubunda dinlenir
    const pg = L.get('palette') || pal; pg.style.pointerEvents = 'auto'; pg.querySelectorAll('*').forEach((x) => { x.style.pointerEvents = 'auto'; });
    pg.style.cursor = 'crosshair';
    pg.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); surukle = true; try { pg.setPointerCapture(e.pointerId); } catch {} al(e); });
    pg.addEventListener('pointermove', (e) => { if (surukle) al(e); });
    pg.addEventListener('pointerup', () => { surukle = false; });
    pg.addEventListener('pointercancel', () => { surukle = false; });
  }
  L.click('apply', () => { uygula(); w.remove(); });
  document.body.append(w); yerles();
  w.addEventListener('pointerdown', (e) => e.stopPropagation());
  setTimeout(() => addEventListener('pointerdown', function kapa(e) { if (!w.isConnected) return removeEventListener('pointerdown', kapa); if (!w.contains(e.target)) { w.remove(); removeEventListener('pointerdown', kapa); } }), 0);
}
export async function runLobby({ sb, session, chrBase = './assets/chr' }) {
  const root = document.createElement('div'); root.id = 'lobi'; document.body.append(root);
  const canvas = document.createElement('canvas'); canvas.id = 'lobi-sahne'; root.append(canvas);
  const ui = document.createElement('div'); ui.className = 'lobi-ui'; root.append(ui);
  const bg = document.createElement('div'); bg.className = 'lobi-arka'; root.insertBefore(bg, canvas);

  // ---- 3B sahne (karakter seçimi / oluşturma)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  { const R = renderer; try { const gl = R.getContext(); let k = null; try { k = localStorage.getItem('ko-canli-renk'); } catch {} if (k !== '0' && !/Edg\//.test(navigator.userAgent) && 'drawingBufferColorSpace' in gl) gl.drawingBufferColorSpace = 'display-p3'; } catch {} }   // (5.11) Chrome'da Edge'deki canlı renkler: çizim tamponu Display-P3 sayılır (sRGB değerleri geniş gamda yorumlanır, Edge'in renk yönetimsiz görüntüsü gibi); kapatmak: localStorage ko-canli-renk = 0
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0a09);
  scene.fog = new THREE.Fog(0x0b0a09, 12, 34);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const hemi = new THREE.HemisphereLight(0xd8d0c0, 0x201810, 0.9); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0d8, 1.6); key.position.set(3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8090ff, 0.6); rim.position.set(-4, 3, -5); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshLambertMaterial({ color: 0x2b2620 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const SLOT_POS = [[0, 0], [-5.2, -2.8], [5.2, -2.8]];   // orta (seçili), sol, sağ
  const pedestals = SLOT_POS.map(([x, z]) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 0.28, 40), new THREE.MeshLambertMaterial({ color: 0x5b5246 }));
    base.position.y = 0.14; g.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.035, 8, 48), new THREE.MeshBasicMaterial({ color: 0xc9a24a }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.29; g.add(ring);
    g.position.set(x, 0, z); scene.add(g); return g;
  });
  const torches = [[-4.5, -3], [4.5, -3]].map(([x, z]) => {
    const l = new THREE.PointLight(0xff9a40, 18, 9, 2); l.position.set(x, 2.4, z); scene.add(l);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb060 })); f.position.copy(l.position); scene.add(f);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.3, 8), new THREE.MeshLambertMaterial({ color: 0x3a2e22 })); post.position.set(x, 1.15, z); scene.add(post);
    return l;
  });
  // ---- giriş haritası sahnesi (yüklenemezse kaideli karanlık sahne kalır)
  const decor = [floor, ...pedestals, ...torches, ...scene.children.filter((o) => o.isMesh && o !== floor && !pedestals.includes(o))];
  const stage = { group: null, nation: 0, loading: null, heightAt: null, h0: 0, fly: null };
  const ZONE_BASE = new URLSearchParams(location.search).get('assets') || REMOTE_ZONES;
  const koPos = new THREE.Vector3();
  function stageHeight(lx, lz) {   // sahne yerel (x,z) → zemin yüksekliği (karakter orijinine göre)
    if (!stage.group) return 0.28;
    koPos.set(lx, 0, lz); stage.group.worldToLocal(koPos);
    return stage.heightAt(koPos.x, koPos.z) - stage.h0;
  }
  async function loadStage(nation) {
    const cfg = INTRO[nation]; if (!cfg || stage.nation === nation) return stage.loading;
    stage.nation = nation; document.documentElement.classList.toggle('ulus-2', nation === 2);
    const run = (async () => {
      const base = `${ZONE_BASE}/${cfg.zone}`;
      const z = await loadZone(base);
      const g = new THREE.Group(); g.scale.z = -1;   // KO sol-el → aynala (main.js ile aynı)
      const terrain = buildTerrain(z, renderer); g.add(terrain);
      const heightAt = makeHeightFn(z);
      let water = null, sky = null, objs = null;
      try { water = await loadWater(base, z.meta); if (water) g.add(water); } catch {}
      try { objs = await loadObjects(base, renderer); if (objs) g.add(objs); } catch (e) { console.warn('giriş haritası nesneleri', e); }
      try { const sk = await loadSky(`${base}/sky`); if (sk) sky = buildSky(sk, { scene, bulutlu: true }); } catch {}
      if (stage.nation !== nation) return;   // bu arada ulus değişti
      // yerleşim: karakter noktası orijine, kamera yönü yerel +z'ye
      const [px, pz] = cfg.at, [dx, dz] = cfg.cam, h0 = heightAt(px, pz);
      g.rotation.y = Math.atan2(-dx, -dz); g.updateMatrix();
      const o = new THREE.Vector3(px, h0, pz).applyMatrix4(g.matrix); g.position.copy(o).negate();
      g.updateMatrixWorld(true);
      const fogCol = sky?.userData.fogColor || new THREE.Color(0x8a9aa8);
      for (const m of [terrain.userData.material, ...(water ? water.children.map((c) => c.material) : [])]) {
        if (!m?.uniforms?.uFogColor) continue; m.uniforms.uFogColor.value = fogCol; m.uniforms.uFogNear.value = 160; m.uniforms.uFogFar.value = 420;
      }
      if (stage.group) { scene.remove(stage.group); if (stage.sky) scene.remove(stage.sky); }
      Object.assign(stage, { group: g, heightAt, h0, terrain, objs, water, sky });
      scene.add(g); if (sky) scene.add(sky);
      decor.forEach((d) => (d.visible = false));
      scene.fog = new THREE.Fog(fogCol, 160, 420); scene.background = fogCol.clone();
      // bulutlu hava: güneş bulut arkasında — yumuşak, serin ve dağınık ışık
      hemi.color.set(0xc4ccd4); hemi.groundColor.set(0x3a3630); hemi.intensity = 1.35; key.color.set(0xe6e9ec); key.intensity = 0.8; rim.intensity = 0.3;
      camera.far = 700; camera.updateProjectionMatrix();
      arrangeHeights?.();
    })().catch((e) => { console.warn('giriş haritası yüklenemedi', e); if (stage.nation === nation) stage.nation = 0; });
    return (stage.loading = run);
  }
  let arrangeHeights = null, stepActor = () => {}, lastDir = 0;
  // KO girişi gibi: kamera yukarıdan ve uzaktan karakterlere süzülür
  function startFly() {
    if (!stage.group) return;
    if (kyAktif()) { const hedef = kyDurak; kyOyna(KYOL.giris); if (hedef > 0 && kyol) kyol.sonra = KYOL.gecis[`0-${hedef}`]; return; }   // seçili karakter ilk değilse uçuştan sonra ona geçer   // KO: camera1 — uzaktan ilk karakterin önüne süzülür
    const c = INTRO[stage.nation] || {}, [f, l] = c.fly || [[6, 42, 24], [0, 0, -18]];   // ulusa göre engelsiz başlangıç
    stage.fly = { t0: clock.elapsedTime, dur: 4.5, orbit: c.orbit, from: new THREE.Vector3(...f), look: new THREE.Vector3(...l) };
    flyPose(stage.fly, 0);
  }
  function flyPose(f, k) {
    const e = k * k * (3 - 2 * k);
    if (f.orbit) {   // karakterlerin çevresinde dönerek yaklaş
      const o = f.orbit, a = (1 - e) * o.ang * Math.PI / 180, T = camTarget.pos, r0 = Math.hypot(T.x, T.z + 1.2);
      const r = o.r + (r0 - o.r) * e, y = o.h + (T.y - o.h) * e;
      camera.position.set(Math.sin(a) * r, y, -1.2 + Math.cos(a) * r);
      lookTmp.copy(camTarget.look); lookTmp.y += (1 - e) * 0.8;
    } else {
      camera.position.lerpVectors(f.from, camTarget.pos, e);
      lookTmp.lerpVectors(f.look, camTarget.look, e);
    }
    camera.lookAt(lookTmp);
  }
  window.__lobi = { kam: () => ({ kamAci, kamHedef, kamKo, pos: camera.position.toArray(), fly: !!stage.fly }), flyAt(k) { if (stage.group) { const c = INTRO[stage.nation]; flyPose(c.orbit ? { orbit: c.orbit } : { from: new THREE.Vector3(...c.fly[0]), look: new THREE.Vector3(...c.fly[1]) }, k); renderer.render(scene, camera); stage.fly = null; show3D = false; } }, resume() { show3D = true; } };
  let show3D = false;
  const fit = [];   // 1024x768 tasarımları ekrana sığdır
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    for (const f of fit) f();
  };
  addEventListener('resize', resize); resize();
  let camTarget = { pos: new THREE.Vector3(0, 1.7, 6.2), look: new THREE.Vector3(0, 1.1, -0.4) };
  let sabitKam = false;   // (5.11) karakter oluşturmada kamera sabit
  let kamAci = 0, kamHedef = 0, kamKo = false;   // KO seçim kamerası: pivot çevresinde açı (rad)
  // KO 2369 (deadsoft ChrSelect\Data\cameraN.n3camera): seçim kamerası kayıtlı yollarla hareket eder — giriş uçuşu (camera1) ve
  // karakterler arası geçişler (camera2–13), 30 kare/sn; göz / bakış noktaları KO dünya koordinatlarında. Karakterler her duraktan bakılan doğrultuda durur.
  let KYOL = null; fetch('./assets/secim-kamera.json').then((r) => (r.ok ? r.json() : null)).then((j) => { KYOL = j; }).catch(() => {});
  const KY_YAKLAS = 0.8;   // (7.11) kamera bakış yönünde bu kadar öne alınır (karakterler ekrana daha yakın)
  const KY_UZAK = 4.7;   // duraktan karaktere uzaklık (KO 1.298 seçim çerçevesi: göz → karakter 4,7 m)
  let kyol = null, kyDurak = 0;   // oynayan yol { k: kamera, t0 } ve kameranın durduğu durak
  const kyAktif = () => !!(KYOL && stage.group && kamKo);
  const _kyA = new THREE.Vector3(), _kyB = new THREE.Vector3();
  const koDunya = (v, out) => stage.group.localToWorld(out.set(v[0], v[1], v[2]));
  function kyPoz(kam, f) {   // kare f (kesirli) → kamera
    const G = kam.g, B = kam.b, n = G.length - 1, i = Math.max(0, Math.min(n, Math.floor(f))), j = Math.min(n, i + 1), u = Math.max(0, Math.min(1, f - i));
    const g = [0, 1, 2].map((k) => G[i][k] + (G[j][k] - G[i][k]) * u), b = [0, 1, 2].map((k) => B[i][k] + (B[j][k] - B[i][k]) * u);
    camera.position.copy(koDunya(g, _kyA)); camera.lookAt(koDunya(b, _kyB));
    camera.translateZ(-KY_YAKLAS);   // (7.11) seçim / oluşturma: kamera bakış doğrultusunda karaktere biraz daha yakın (4,7 → ~3,9 m)
  }
  const kyDurakKam = (d) => KYOL.kam[String(d === 0 ? KYOL.giris : KYOL.gecis[`0-${d}`])];   // durağa varan bir yolun son karesi = durak
  function kyDurakPoz(d) { const k = kyDurakKam(d); kyPoz(k, k.g.length - 1); }
  // kamera karaktere varınca KO'daki gibi karakter zafer / seçildi hareketini (sec1) yapar
  function kyVardi() { const a = actors.find((x) => x.slot === kyDurak); if (a?.api.has('sec1') && !kyVardi.yuru) a.api.playOnce('sec1'); }
  function kyOyna(no) { const k = KYOL?.kam[String(no)]; if (!k) return false; kyol = { k, t0: clock.elapsedTime }; return true; }
  // durağın karakter noktası (KO yerel): göz + bakış doğrultusu × 4,7 m, zeminde
  function kyKarakter(d) {
    const kam = kyDurakKam(d);
    const g = kam.g[kam.g.length - 1], b = kam.b[kam.b.length - 1], dx = b[0] - g[0], dz = b[2] - g[2], l = Math.hypot(dx, dz) || 1;
    const x = g[0] + dx / l * KY_UZAK, z = g[2] + dz / l * KY_UZAK;
    return { p: [x, stage.heightAt(x, z), z], goz: g };
  }
  camera.position.copy(camTarget.pos);
  const clock = new THREE.Clock();
  const lookTmp = new THREE.Vector3();
  const actors = [];
  let preview = null, running = true, lobiFx = null;
  (function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    if (show3D) {
      if (sabitKam) { camera.position.copy(camTarget.pos); camera.lookAt(camTarget.look); }   // (5.11) karakter oluşturma: kamera açısı hiç değişmez (kayma / nefes / uçuş yok)
      else if (stage.fly) {
        const f = stage.fly, k = Math.min(1, (t - f.t0) / f.dur);
        flyPose(f, k);
        if (k >= 1) stage.fly = null;
      } else {
        if (kyAktif()) {
          if (kyol) { const f = (t - kyol.t0) * (KYOL.fps || 30); kyPoz(kyol.k, f); if (f >= kyol.k.g.length - 1) { const s2 = kyol.sonra; kyol = null; if (s2) kyOyna(s2); else kyVardi(); } }
          else kyDurakPoz(kyDurak);
          lookTmp.copy(camTarget.look);
        } else if (kamKo) {   // KO: kamera bakış noktası çevresinde saniyede 1,2 rad döner (CGameProcCharacterSelect RotationY(s_fSecPerFrm*1.2))
          const d = kamHedef - kamAci; kamAci += Math.sign(d) * Math.min(Math.abs(d), dt * 1.2);
          camTarget.pos.set(KAM.pivot.x + Math.sin(kamAci) * KAM.r, KAM.pivot.y + KAM.h, KAM.pivot.z + Math.cos(kamAci) * KAM.r);
          camTarget.look.copy(KAM.pivot);
        }
        if (!kyAktif()) {
        camera.position.lerp(camTarget.pos, Math.min(1, dt * 4));
        lookTmp.copy(camTarget.look);
        if (stage.group && !kamKo) { camera.position.x += Math.sin(t * 0.23) * 0.004; lookTmp.x += Math.sin(t * 0.23) * 0.25; lookTmp.y += Math.sin(t * 0.31) * 0.05; }   // hafif nefes alan kamera
        camera.lookAt(lookTmp);
        }
      }
      if (stage.group) {
        koPos.copy(camera.position); stage.group.worldToLocal(koPos);
        stage.objs?.userData.tick(t); stage.objs?.userData.cull(koPos, 400);
        stage.terrain.userData.cull?.(koPos.x, koPos.z, 400);
        stage.water?.userData.tick?.(t);
        stage.sky?.userData.tick(t, camera.position);
        key.intensity = 0.8 + Math.sin(t * 0.11) * 0.12 + Math.sin(t * 0.047 + 1.3) * 0.1;   // geçen bulutlarla ışık hafifçe açılıp kapanır
      }
      for (const a of actors) { a.api.update(dt); stepActor(a, t); }
      lobiFx?.update(dt);
      if (preview) { preview.api.update(dt); preview.api.group.rotation.y += dt * preview.spin; }
      torches.forEach((l, i) => (l.intensity = 16 + Math.sin(t * 9 + i * 2) * 2 + Math.sin(t * 23 + i) * 1.2));
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
  })();
  const set3D = (on) => { show3D = on; canvas.style.visibility = on ? 'visible' : 'hidden'; bg.hidden = on; };

  await Promise.all([loadCharacterMeta(chrBase).catch(() => null), loadUI(UI_BASE)]);
  await ekUI('orj').catch(() => false);   // orijinal KO giriş / karakter seçim / oluşturma yerleşimleri (atlaslar ilk görünüşte iner)
  document.getElementById('yukleniyor')?.classList.add('bitti');

  let onKey = null;
  const L = (name, cls) => { const l = buildLayout(name, { className: cls }); translateLayout(l, TR); return l; };
  const clear = () => { sabitKam = false; ui.innerHTML = ''; fit.length = 0; onKey = null; if (kamKo) { kamKo = false; camera.fov = 38; camera.updateProjectionMatrix(); } canvas.onclick = canvas.oncontextmenu = canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = null; };
  // 1024x768 tasarımı ortala; ölçek = sığdır (en fazla 1.25)
  const center = (el, w = 1024, h = 768, max = 1.25) => {
    const f = () => { const s = Math.min(max, innerWidth / w, innerHeight / h); el.style.transform = `scale(${s})`; el.style.left = (innerWidth - w * s) / 2 + 'px'; el.style.top = (innerHeight - h * s) / 2 + 'px'; };
    el.style.transformOrigin = '0 0'; fit.push(f); f();
  };

  // ---- ileti kutusu (re_messagebox): tamam / evet-hayır / giriş kutulu
  function message({ title = '', text = '', yes, no, ok, input, bekle = false }) {
    const mb = L('re_messagebox', 'ko-msg ko-lobi-modal');
    mb.text('Text_title', title); mb.text('Text_Message', text);
    for (const id of ['Btn_Yes', 'Btn_No', 'Btn_Ok', 'Btn_Cancel', 'Edit_Common', 'base_item', 'Btn_ban', 'img_icon', 'progress_durationtime', 'str_crash_tooltip', 'str_itemname']) mb.show(id, false);   // orijinal KO kutusundaki örnek eşya (hançer ikonu + "aaaa") / süre çubuğu gösterilmez
    // orijinal KO kutusu (296 px) eşya parçalama alanıyla uzun: giriş kutularında orta bant kısaltılır (kompakt)
    { const H = parseFloat(mb.el.style.height) || mb.el.offsetHeight;
      if (H > 250) {
        const K = input ? 70 : 100;
        for (const c of mb.el.children) {
          const t = parseFloat(c.style.top), h = parseFloat(c.style.height);
          if (c.classList.contains('kui-img') && t >= 90 && t < 110 && h > 100) c.style.height = (h - K) + 'px';   // orta bant
          else if (c.dataset.id === 'Text_Message') c.style.height = Math.max(40, h - K) + 'px';
          else if (t >= 190) c.style.top = (t - K) + 'px';   // alt şerit, düğmeler, giriş kutusu
        }
        mb.el.style.height = (H - K) + 'px';
      } }
    const close = () => mb.el.remove();
    let inp = null;
    if (input) { mb.show('Edit_Common', true); inp = mb.input('Edit_Common', { maxLength: 20 }); }
    const label = (id, t) => mb.get(id)?.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = t));
    if (yes) {
      mb.show('Btn_Yes', true); mb.show('Btn_No', true); label('Btn_Yes', yes.label || 'Yes'); label('Btn_No', 'No');
      mb.click('Btn_Yes', async () => { if ((await yes.fn(inp?.value ?? '')) !== false) close(); });
      mb.click('Btn_No', () => { close(); no?.(); });
    } else if (bekle) { mb.el.classList.add('ko-msg-bekle'); }   // düğmesiz bekleme kutusu (oto giriş)
    else { mb.show('Btn_Ok', true); label('Btn_Ok', 'OK'); mb.click('Btn_Ok', () => { close(); ok?.(); }); }
    mb.el.tabIndex = -1;
    mb.el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (mb.get(yes ? 'Btn_Yes' : 'Btn_Ok'))?.onclick?.(e); } if (e.key === 'Escape') { close(); no?.(); } e.stopPropagation(); });
    root.append(mb.el); (inp || mb.el).focus();
    return { el: mb.el, close, set text(t) { mb.text('Text_Message', t); } };
  }

  let account = '';
  const loadAccount = async () => { account = (await sb.from('profiles').select('account').eq('id', session.user.id).maybeSingle()).data?.account || session.user.email; };

  return new Promise((resolve) => {
    const finish = (character) => {
      running = false; removeEventListener('resize', resize);
      try { sessionStorage.setItem('ko-ilk-giris', String(character?.id ?? '1')); } catch {}   // (8.11) karakter seçiminden oyuna giriş: Temporary Item List yalnız bu girişte açılır
      { const lf = lobiFx; import('./donanim.js').then((D) => D.setFx(null, lf)).catch(() => {}); }   // seçim ekranının efekt yöneticisi oyunda kullanılmasın (peri/pathos efektleri boş sahneye düşüyordu)
      renderer.dispose(); root.remove();
      { const y = document.getElementById('yukleniyor'); y?.classList.add('ko-yukle'); y?.classList.remove('bitti'); }   // doğrudan KO ulus yükleme ekranı (genel kutu yok)
      resolve(character);
    };

    // arka plan animasyonu (re_login_intro bg_ground0-9): kareler 1 kare/sn ileri-geri, çapraz geçişle
    let arkaKareler = null, arkaT = 0;
    function arkaAnim(resimler) {
      if (!resimler.length) return;
      if (!arkaKareler) {
        bg.style.backgroundImage = '';
        arkaKareler = resimler.map((im) => { const d = document.createElement('div'); d.className = 'lobi-arka-kare'; d.style.backgroundImage = im; bg.append(d); return d; });
        let i = 0, yon = 1;
        arkaKareler[0].classList.add('on');
        clearInterval(arkaT);
        arkaT = setInterval(() => {
          if (bg.hidden) return;
          const n = arkaKareler.length; let j = i + yon; if (j >= n || j < 0) { yon = -yon; j = i + yon; }
          arkaKareler[j].classList.add('on'); const eski = arkaKareler[i]; setTimeout(() => eski.classList.remove('on'), 900); i = j;
        }, 1000);   // %90 yavaş: saniyede 1 kare, yumuşak geçiş
      }
    }

    // ================= GİRİŞ / DUYURU / SUNUCU LİSTESİ (re_login_intro) =================
    let intro = null;
    function introLayout() {
      arkaKareler?.forEach((d) => { d.hidden = false; });   // (7.11) ulus seçiminde gizlenen arka plan geri gelir
      // giriş → (oto giriş) → duyuru → sunucu listesi aynı pencerede: varsa yeniden kurulmaz (pencere iki kez açılıyormuş gibi
      // yanıp sönmesin, arka plan animasyonu / müzik baştan başlamasın); yalnız gruplar gizlenip yeni ekran gösterilir
      if (intro && intro.el.isConnected) {
        onKey = null;
        for (const id of ['Group_ServerList_01', 'Group_Notice_1', 'Group_Notice_2', 'Group_Notice_3', 'Group_Login']) intro.show(id, false);
        intro.show('Group_introduction_ka', false); intro.show('Group_introduction_el', false);
        intro.el.querySelectorAll('.ko-altsunucu').forEach((e) => e.remove());
        intro.el.querySelectorAll('.ko-pus-pano').forEach((e) => { e.hidden = true; });
        return intro;
      }
      clear(); set3D(false); clearActors();
      intro = L('re_login_intro', 'ko-giris');
      import('./muzik.js').then((M) => M.muzikCal('21_moradon')).catch(() => {});   // giriş ekranı: klasik KO Moradon müziği (bgm_login yerine)
      // arka plan: KO'daki gibi bg_ground0-9 kareleri sırayla oynar (şimşek/ateş animasyonu), ekranı kaplar
      const grounds = [...intro.el.querySelectorAll('[data-id^="bg_ground"]')].sort((a, b) => a.dataset.id.localeCompare(b.dataset.id, 'en', { numeric: true }));
      arkaAnim(grounds.map((g) => g.style.backgroundImage)); grounds.forEach((g) => g.remove());
      for (const id of ['Group_ServerList_01', 'Group_Notice_1', 'Group_Notice_2', 'Group_Notice_3', 'Group_Login']) intro.show(id, false);
      intro.text('Premium', '');
      // KO: ulus tanıtım / kral panelleri yalnız sunucu seçilince açılır (seçilen sunucunun kralları — sunucu kral_sunucu)
      intro.show('Group_introduction_ka', false); intro.show('Group_introduction_el', false);
      intro.text('text_ka_introduction', 'Karus, the nation of darkness, seeks to rule Ronark Land with strength and courage. The Tuarek races and the Kurians fight under the banner of Karus.');
      intro.text('text_el_introduction', 'El Morad, the nation of light, defends the continent with honor and justice. Humans, Barbarians and Porutus fight for El Morad.');
      intro.el.querySelectorAll('[data-id="text_ka_introduction"], [data-id="text_el_introduction"]').forEach((e) => e.classList.add('ko-cok-satir'));
      ui.append(intro.el); center(intro.el);
      return intro;
    }

    function loginScreen() {
      const g = introLayout(); g.show('Group_Login', true);
      const id = g.input('Edit_ID', { type: 'text', placeholder: 'ID', maxLength: 32 });   // KO: ID = kullanıcı adı (profiles.account)
      const pw = g.input('Edit_PW', { type: 'password' });
      const go = async () => {
        if (!id.value.trim() || !pw.value) return message({ title: 'Login', text: 'ID and password are required.' });
        const wait = message({ title: 'Login', text: 'Connecting…', bekle: true });
        // KO gibi kullanıcı adıyla giriş: sunucu (giris_eposta) şifre doğruysa hesabın e-postasını verir, oturum onunla açılır.
        // Eski hesaplar: ID@koweb.local; e-posta yazılırsa doğrudan
        const giris = id.value.trim();
        let email = giris.includes('@') ? giris : null;
        if (!email) {
          const r = await sb.rpc('giris_eposta', { p_id: giris, p_sifre: pw.value });
          if (r.error) { wait.close(); return message({ title: 'Login', text: r.error.message, ok: () => pw.focus() }); }
          email = r.data || `${giris.toLowerCase()}@koweb.local`;
        }
        // (6.11) giriş önce kalıcı olmayan geçici istemciyle: hesap GM ise oturum yalnız bu sekmeye yazılır (aynı tarayıcıda birden çok GM hesabı),
        //   değilse eskisi gibi ortak oturuma (site + diğer sekmeler)
        const gecici = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'ko-gecici-giris' } });
        const { data: gd, error } = await gecici.auth.signInWithPassword({ email, password: pw.value });
        if (error) { wait.close(); return message({ title: 'Login', text: trErr(error), ok: () => pw.focus() }); }
        let gmHesap = false;
        try {
          const [{ data: kr }, { data: gl }] = await Promise.all([gecici.from('characters').select('id').eq('owner', gd.user.id), gecici.from('gms').select('char_id')]);
          const g = new Set((gl || []).map((x) => Number(x.char_id))); gmHesap = (kr || []).some((c) => g.has(Number(c.id)));
        } catch {}
        if (gmHesap) {
          let anahtar = null; try { anahtar = sessionStorage.getItem('ko-ayrik'); } catch {}
          if (!anahtar) {   // sekmeye özel istemciye geçiş: oturumu sekmeye yazıp sayfa yeniden açılır (oto giriş → sunucu listesi)
            anahtar = 'sb-ko-gm-' + crypto.getRandomValues(new Uint32Array(2)).join('');
            const ozel = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: anahtar, storage: window.sessionStorage, autoRefreshToken: false } });
            await ozel.auth.setSession({ access_token: gd.session.access_token, refresh_token: gd.session.refresh_token });
            try { sessionStorage.setItem('ko-ayrik', anahtar); sessionStorage.setItem('ko-gm-yeni-giris', '1'); } catch {}   // (8.11) yeniden açılışta şifre bir kez daha sorulmaz (az önce girildi)
            wait.close(); location.replace('oyun.html'); return;
          }
        }
        const { data, error: e2 } = await sb.auth.setSession({ access_token: gd.session.access_token, refresh_token: gd.session.refresh_token });
        wait.close();
        if (e2) return message({ title: 'Login', text: trErr(e2), ok: () => pw.focus() });
        session = data?.session || (await sb.auth.getSession()).data.session; await loadAccount(); oturumDenetle(noticeScreen);
      };
      g.click('btn_ok', go);
      g.click('btn_cancel', () => (location.href = 'index.html'));
      g.click('btn_homepage', () => (location.href = 'index.html#kayit'));
      g.click('btn_option', () => message({ title: 'Option', text: 'Graphics and sound settings are in the in-game Options menu.' }));
      onKey = (e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') location.href = 'index.html'; };
      id.focus();
    }

    // (8.11) GM girişinde sekmeye özel oturum için sayfa bir kez yeniden açılır: giriş penceresi / "Logging in automatically" gösterilmeden doğrudan sunucu listesine geçilir
    async function girisDevam() {
      introLayout();
      await Promise.all([fetchServers(), dolulukAl(), bakimAl(), duyuruAl()]).catch(() => {});
      oturumDenetle(noticeScreen);
    }
    // siteden oturumla gelindi (Oyna): KO giriş penceresi hesap adıyla dolu açılır → "Oto giriş yapılıyor" → sunucu listesi
    async function otoGiris() {
      const g = introLayout(); g.show('Group_Login', true);
      const id = g.input('Edit_ID', { type: 'text', value: account || '', readOnly: true });
      const pw = g.input('Edit_PW', { type: 'password', value: '••••••••', readOnly: true });
      const iptal = () => { iptalEdildi = true; w?.close(); loginScreen(); };
      let iptalEdildi = false, w = null;
      g.click('btn_ok', () => {}); g.click('btn_cancel', () => (location.href = 'index.html'));
      g.click('btn_homepage', () => (location.href = 'index.html'));
      onKey = (e) => { if (e.key === 'Escape') iptal(); };
      id.blur(); pw.blur();
      await new Promise((r) => setTimeout(r, 250));
      if (iptalEdildi) return;
      w = message({ title: 'Login', text: 'Logging in automatically…', bekle: true });
      await Promise.all([fetchServers(), dolulukAl(), bakimAl(), duyuruAl(), new Promise((r) => setTimeout(r, 450))]);
      if (iptalEdildi) return;
      w.close(); oturumDenetle(noticeScreen);
    }

    // KO: hesap zaten oyundaysa uyarı girişten hemen sonra (sunucu listesinden önce) çıkar; Connect → devam (karakter seçince yeniden sorulmaz), Cancel → giriş ekranı
    let oturumOnay = false;
    async function oturumDenetle(devam) {
      let d = null;
      try { d = (await sb.rpc('session_durum')).data; } catch {}
      if (!d?.aktif) return devam();
      message({ title: 'Session', text: `This account is already in the game${d.ad ? ` (${d.ad})` : ''}. That character will be disconnected. Continue?`,
        yes: { label: 'Connect', fn: () => { oturumOnay = true; devam(); } }, no: () => { oturumOnay = false; loginScreen(); } });
    }

    // KO: girişten (elle ya da oto giriş) sonra, sunucu listesinden önce "Notice" penceresi (re_login_intro Group_Notice_1/2/3:
    // duyuru sayısına göre 1-3 kutu; her kutuda turuncu başlık + metin, altta Confirm). Duyurular: giris_duyuru (GM panelinden düzenlenir).
    let duyuruP = null;
    const duyuruAl = () => (duyuruP ||= Promise.resolve(sb.from('giris_duyuru').select('baslik,metin').order('sira').limit(3)).then(({ data }) => data || [], () => []));
    duyuruAl();
    async function noticeScreen() {
      const l = (await duyuruAl()).filter((d) => (d.baslik || d.metin));
      if (!l.length) return serverScreen();
      const g = introLayout(), grp = `Group_Notice_${l.length}`; g.show(grp, true);
      const n = g.get(grp); n.classList.add('ko-giris-notice');
      l.forEach((d, i) => {
        const k = String(i + 1).padStart(2, '0');
        const b = n.querySelector(`[data-id="text_notice_name_${k}"]`); if (b) b.textContent = d.baslik || '';
        const t = n.querySelector(`[data-id="text_notice_${k}"]`); if (t) { t.classList.add('ko-cok-satir'); t.textContent = d.metin || ''; }
      });
      const tamam = () => { onKey = null; serverScreen(); };
      g.click('btn_ok', tamam);
      onKey = (e) => { if (e.key === 'Enter' || e.key === 'Escape') tamam(); };
    }

    // sunucu listesi önceden alınır (liste açılırken beklemesin); ekranda yalnızca var olan sunucular
    let serversP = null;
    const fetchServers = () => (serversP ||= Promise.resolve(sb.from('servers').select('*').order('sort')).then(({ data, error }) => (error ? null : data), () => null));
    fetchServers();
    let dolulukP = null, bakimP = null;
    const dolulukAl = () => (dolulukP ||= Promise.resolve(sb.rpc('server_doluluk')).then(({ data }) => data || [], () => []));
    // GM bakım modu (/bakim ac): GM karakteri olmayan hesaplar sunucuya giremez (sunucu session_claim'de de denetler)
    const bakimAl = () => (bakimP ||= Promise.resolve(sb.rpc('bakim_durum')).then(({ data }) => !!data, () => false));
    dolulukAl(); bakimAl();   // sunucu listesi açılınca beklemesin: liste, doluluk ve bakım durumu girişle birlikte alınır
    // alt sunucu kutusu / doluluk çubuğu görselleri önceden yüklenir ve çözülür: sunucuya ilk tıklamada kutular görsel inene dek boş / geç görünmesin
    /* alt sunucu / sunucu satırı görselleri client.css içinde gömülü (data URI): yazı ve kutu aynı anda çizilir */
    const gmHesap = () => Promise.resolve(sb.rpc('bakim_giris')).then(({ data }) => !!data?.gm, () => false);
    // seçilen sunucunun kralları: sol Karus, sağ El Morad paneli
    let kralIstek = 0;
    const KA_TANITIM = 'Karus, the nation of darkness, seeks to rule Ronark Land with strength and courage. The Tuarek races and the Kurians fight under the banner of Karus.';
    const EL_TANITIM = 'El Morad, the nation of light, defends the continent with honor and justice. Humans, Barbarians and Porutus fight for El Morad.';
    // seçilen sunucunun kralları ve panoları: aynı sunucu yeniden seçilince (Enter / tık) yazılar sıfırlanıp yeniden yüklenmez;
    // sunucu verisi önbellekte tutulur → yazılar titremez / değişmez
    const kralOnbellek = new Map(); let kralGosterilen = null;
    function kralYaz(g, data) {
      g.text('text_ka_king', `King of Karus: ${data?.['1'] || '—'}`); g.text('text_el_king', `King of El Morad: ${data?.['2'] || '—'}`);
      // kralın duyuru panosu (Grand Chamberlain → Duyuru panosu): varsa ulus tanıtımının yerine
      g.text('text_ka_introduction', data?.pano?.['1'] || KA_TANITIM); g.text('text_el_introduction', data?.pano?.['2'] || EL_TANITIM);
    }
    // KO: panolar yalnız o sunucunun verisi gelince açılır — önce varsayılan metin gösterilip sonra değişmesin
    const kralAl = (id) => { if (!kralOnbellek.has(id)) kralOnbellek.set(id, Promise.resolve(sb.rpc('kral_sunucu', { p_server: id })).then(({ data }) => data || {}, () => ({})).then((d) => { kralOnbellek.set(id, d); return d; })); return kralOnbellek.get(id); };
    function kralPanel(g, s) {
      if (kralGosterilen?.g === g && kralGosterilen.id === s.id) { g.show('Group_introduction_ka', true); g.show('Group_introduction_el', true); return; }   // zaten bu sunucu gösteriliyor
      kralGosterilen = { g, id: s.id };
      const no = ++kralIstek, v = kralOnbellek.get(s.id);
      const yaz = (d) => { if (no !== kralIstek) return; kralYaz(g, d); g.show('Group_introduction_ka', true); g.show('Group_introduction_el', true); };
      if (v && !(v instanceof Promise)) return yaz(v);
      g.show('Group_introduction_ka', false); g.show('Group_introduction_el', false);
      g.text('text_ka_king', ''); g.text('text_el_king', ''); g.text('text_ka_introduction', ''); g.text('text_el_introduction', '');   // önceki sunucunun yazısı kalmasın
      kralAl(s.id).then(yaz);
    }
    // (5.11) KO PowerUp Store panosu (re_cashprboard.uif + Data\powerupprboard.tbl 61 eşya): 3'erli sayfa, ◀ ▶, ikon + kısaltılmış ad, üzerine gelince açıklama
    let pusL = null, pusSayfa = 0, pusListe = null;
    // (5.11) PowerUp Store panosu verisi girişte önceden hazırlanır (yerleşim, liste, eşya kayıtları, ikon atlası) → sunucu listesinde anında görünür
    const pusVeri = (async () => {
      const [, liste, E] = await Promise.all([ekUI('pusboard').catch(() => false), fetch(`${UI_BASE}/pusboard/liste.json`).then((r) => r.json()).catch(() => []), import('./esya.js')]);
      await E.loadMeta().catch(() => {});
      const { data } = await sb.from('items').select('*').in('num', liste.map((x) => x[0]));
      const IT = new Map((data || []).map((r) => [Number(r.num), E.fromDb(r)]));
      // ikon atlas(lar)ı indirilip çözülür (ilk çizimde boş kutu görünmesin)
      const urls = new Set(); const tmp = document.createElement('div');
      for (const it of IT.values()) { tmp.innerHTML = E.iconHtml(it, 45); tmp.querySelectorAll('[style*="url("]').forEach((x) => { const m = /url\(["']?([^"')]+)/.exec(x.getAttribute('style') || ''); if (m) urls.add(m[1]); }); }
      await Promise.all([...urls].map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = u; i.decode?.().then(r, r); })));
      return { liste, E, IT };
    })().catch((e) => { console.warn('PUS ön yükleme', e); return null; });
    let pusTip = null;
    function pusIpucu(x, ev) {
      if (!x) { if (pusTip) pusTip.hidden = true; return; }
      if (!pusTip) { pusTip = document.createElement('div'); pusTip.className = 'ko-pus-ipucu'; document.body.append(pusTip); addEventListener('pointerdown', () => { pusTip.hidden = true; }, true); }
      const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const ic = `<b>${esc(x[1])}</b><div>${esc(x[2]).replace(/\|/g, '<br>')}</div>`;
      if (pusTip.innerHTML !== ic) pusTip.innerHTML = ic;
      pusTip.hidden = false;
      const r = pusTip.getBoundingClientRect();
      pusTip.style.left = Math.max(4, Math.min(innerWidth - r.width - 4, ev.clientX + 14)) + 'px';
      pusTip.style.top = Math.max(4, Math.min(innerHeight - r.height - 4, ev.clientY + 18)) + 'px';
    }
    async function pusPano(g) {
      try {
        if (!pusL || !pusL.el.isConnected) {
          const V = await pusVeri; if (!V) return;
          if (!hasLayout('re_cashprboard') && !(await ekUI('pusboard').catch(() => false))) return;
          pusListe = V.liste; const E = V.E, IT = V.IT;
          pusL = buildLayout('re_cashprboard', { className: 'ko-pus-pano' });
          Object.assign(pusL.el.style, { position: 'absolute', left: '369px', top: '486px', zIndex: 5 });   // (5.11) sunucu listesi zeminine (358..664) ortalı
          g.el.append(pusL.el);
          const ciz = () => {
            const N = Math.max(1, Math.ceil(pusListe.length / 3));
            pusSayfa = ((pusSayfa % N) + N) % N;
            for (let i = 0; i < 3; i++) {
              const x = pusListe[pusSayfa * 3 + i], im = pusL.get('img_icon' + i), ad = pusL.get('str_name' + i);
              if (ad) ad.textContent = x ? (x[1].length > 10 ? x[1].slice(0, 10) + '...' : x[1]) : '';
              if (im) { const it = x && IT.get(Number(x[0])); im.innerHTML = it ? E.iconHtml(it, 45) : ''; im.title = ''; im._pus = x || null;
                if (!im._pusBagli) { im._pusBagli = true;   // (5.11) KO: simgenin üstüne gelince koyu yarı saydam kutuda kalın ad + açıklama
                  im.addEventListener('mousemove', (ev) => pusIpucu(im._pus, ev)); im.addEventListener('mouseleave', () => pusIpucu(null)); } }
            }
          };
          pusL.click('btn_left', () => { pusSayfa--; ciz(); });
          pusL.click('btn_right', () => { pusSayfa++; ciz(); });
          ciz();
        }
        pusL.el.hidden = false;
      } catch (e) { console.warn('PowerUp Store panosu', e); }
    }
    // (7.11) GM hesabı: sunucu listesinin sağ üstünde tam ekran ve tablet modu düğmeleri (tablet modu oyunda da sürer: GM paneli → Ayarlar)
    async function gmUstDugmeler() {
      if (root.querySelector('#ko-gm-ust')) return;
      let gm = false; try { gm = !!sessionStorage.getItem('ko-ayrik'); } catch {}
      if (!gm) gm = await gmHesap();
      if (!gm || !root.isConnected || root.querySelector('#ko-gm-ust')) return;
      const T = await import('./tablet.js');
      if (T.tabletAcik()) T.tabletUygula();
      const bar = document.createElement('div'); bar.id = 'ko-gm-ust';
      bar.innerHTML = '<button data-k="tablet" title="Tablet mode"><svg viewBox="0 0 24 24"><rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg></button>'
        + '<button data-k="tam" title="Fullscreen"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>';
      const durum = () => { bar.querySelector('[data-k=tablet]').classList.toggle('acik', T.tabletAcik()); bar.querySelector('[data-k=tam]').classList.toggle('acik', T.tamEkranda()); };
      bar.addEventListener('pointerdown', (e) => e.stopPropagation());
      bar.addEventListener('click', (e) => {
        const k = e.target.closest('[data-k]')?.dataset.k;
        if (k === 'tam') T.tamEkranDegis();
        if (k === 'tablet') { const ac = !T.tabletAcik(); T.tabletUygula({ acik: ac }); if (ac && !T.tamEkranda()) T.tamEkranDegis(); }
        durum();
      });
      const fs = () => { if (!bar.isConnected) { document.removeEventListener('fullscreenchange', fs); document.removeEventListener('webkitfullscreenchange', fs); return; } durum(); };
      document.addEventListener('fullscreenchange', fs); document.addEventListener('webkitfullscreenchange', fs);
      durum(); root.append(bar);
    }
    async function serverScreen() {
      const g = introLayout();
      gmUstDugmeler().catch(() => {});
      // orijinal düzendeki örnek adlar (Geronique, Skei…) görünmesin: önce tüm satırlar gizli
      for (let i = 1; i <= 20; i++) { g.show(`Btn_list_${i}`, false); const t = g.get(`server_${i}`); if (t) t.textContent = ''; }
      g.show('Group_ServerList_01', true);
      pusPano(g);   // (5.11) KO re_cashprboard: sunucu listesinin altında PowerUp Store panosu
      // liste çerçevesi / seçim vurgusu (Img_selected) gibi düz görseller satır düğmelerinin üstünde kalıp tıklamayı yutuyordu → yalnız düğmeler tıklanır
      g.show('Img_selected', false);   // şablonun sabit seçim vurgusu (hep 1. satırda) — seçim çerçevesi satırın kendisinde
      { const grp = g.get('Group_ServerList_01'); grp?.querySelectorAll('.kui-img').forEach((e) => { if (!e.closest('.kui-btn')) e.style.pointerEvents = 'none'; }); }
      // liste hemen çizilir (yalnız sunucu listesi beklenir); doluluk ve bakım durumu gelince satırlar / alt sunucu çubukları güncellenir
      const servers = await fetchServers();
      // (2.11) her açılışta tüm sunucuların kral / pano verisi taze alınır (önbellek boşaltılır) → tıklayınca anında doğru yazı;
      // eski veri gösterilip sonra yenisiyle değişmez
      kralOnbellek.clear(); kralGosterilen = null; g.show('Group_introduction_ka', false); g.show('Group_introduction_el', false);
      for (const sv of servers || []) kralAl(sv.id);
      let doluluk = [], bakim = false;
      const dP = dolulukAl(), bP = bakimAl();
      serversP = null; dolulukP = null; bakimP = null;   // bir sonraki açılışta taze liste
      if (!servers?.length) message({ title: 'Server', text: 'Could not get the server list.' });
      let selected = null, kanal = 1, anaSecildi = false;   // ana sunucu oyuncu tarafından seçilmeden (tık) krallık panoları hiç gösterilmez
      const rows = [];
      // alt sunucu paneli (KO: sunucuya tıklayınca sağda yeşil Ares 1-2-3-4, doluluk çubuğu)
      const panel = document.createElement('div'); panel.className = 'ko-altsunucu'; panel.hidden = true; g.el.append(panel);
      const oyuncu = (sid, k) => doluluk.filter((d) => d.server === sid && d.kanal === k).reduce((t, d) => t + (d.oyuncu || 1), 0);
      function altPanel(s, row) {
        const n = Math.max(1, s.kanal_sayisi || 4), kap = Math.max(1, Math.round((s.max_users || 3000) / n));
        // KO (orijinal ui_login_01 sunucu kutusu): siyah, altın çerçeveli kutular; ad büyük harf, boşluksuz (ARES1); seçili yeşil
        // KO co_login_intro_sub: ad + 12 kademeli doluluk çubuğu (ui_login_01, genişlikler 3…58 px)
        const KADEME = [0, 3, 8, 13, 18, 23, 28, 33, 38, 43, 49, 53, 58];
        const cubuk = (k) => { const o = oyuncu(s.id, k), lv = o <= 0 ? 1 : Math.max(1, Math.min(12, Math.ceil((o / kap) * 12))); return `<span class="as-bar"><i style="width:${KADEME[lv]}px"></i></span>`; };   // üzerine gelince oyuncu / kapasite yazmaz
        panel.innerHTML = Array.from({ length: n }, (_, i) => `<div class="as-satir" data-k="${i + 1}"><span class="as-ad">${esc(String(s.name).toUpperCase())}${i + 1}</span>${cubuk(i + 1)}</div>`).join('');
        if (panel.parentElement !== row.parentElement) row.parentElement.append(panel);   // satırla aynı koordinat düzlemi
        const n0 = row.querySelector('.ko-satir-hit');   // satırın görünen dikdörtgeni: alt kutular hemen sağında, aynı hizada (KO)
        panel.style.left = (parseFloat(row.style.left) + (n0 ? parseFloat(n0.style.left) + parseFloat(n0.style.width) + 2 : parseFloat(row.style.width) + 30)) + 'px';
        panel.style.top = (parseFloat(row.style.top) + (n0 ? parseFloat(n0.style.top) : 2)) + 'px';
        panel.hidden = false;
        // KO: her satır sunucu listesi düğmesinin kendi görüntüsü (Btn_list: 332 normal, 334 üzerinde, 333 seçili)
        const sec = (k) => { kanal = k; panel.querySelectorAll('.as-satir').forEach((e) => e.classList.toggle('secili', Number(e.dataset.k) === k)); };
        // varsayılan: dolu olmayan ilk kanal (Ares 1) → oyuncular aynı dünyada buluşur; başka kanal yalnız tıklanınca
        kanal = 1; for (let k = 1; k <= n; k++) { if (oyuncu(s.id, k) < kap * 0.95) { kanal = k; break; } }
        sec(kanal);   // KO: varsayılan alt sunucu yeşil
        panel._tik = null;   // panel her açılışta: henüz oyuncu tıklamadı
        panel.querySelectorAll('.as-satir').forEach((e) => {
          // alt sunucu iki tıklamayla: ilk tık seçer (yeşil), seçili alt sunucuya ikinci tık bağlanır (Connect / Enter de bağlar)
          e.onclick = () => { const k = Number(e.dataset.k); if (panel._tik === k) { connect(); return; } panel._tik = k; sec(k); };
        });
      }
      for (let i = 1; i <= 20; i++) {
        const s = servers?.[i - 1], b = g.get(`Btn_list_${i}`), txt = g.get(`server_${i}`);
        if (!s) continue;
        g.show(`Btn_list_${i}`, true);
        txt.textContent = `${s.name}${s.is_open && !bakim ? '' : '  (maintenance)'}`; txt.classList.toggle('kapali', !s.is_open || bakim);
        rows.push(b); txt.classList.add('ko-sunucu-ad');
        g.click(`Btn_list_${i}`, () => { anaSecildi = true; rows.forEach((r) => r.classList.remove('secili')); b.classList.add('secili');
          g.el.querySelectorAll('.ko-sunucu-ad.aktif').forEach((t) => t.classList.remove('aktif')); txt.classList.add('aktif'); selected = s; if (s.is_open) altPanel(s, b); else panel.hidden = true;
          kralPanel(g, s); });   // (2.11) aynı karede: önceki sunucunun yazıları bir kare bile görünmez
        // KO düğme durum görselleri (seçili parıltı 84 px) satırdan büyük: düğme kutusu (88 px) alttaki satırın üstüne taşıp tıklamayı
        // yanlış sunucuya veriyordu → yalnız satırın kendi normal görseli boyutunda bir tıklama alanı
        if (!b.querySelector('.ko-satir-hit')) {
          const n0 = b.children[0], hit = document.createElement('div'); hit.className = 'ko-satir-hit';
          for (const k of ['left', 'top', 'width', 'height']) hit.style[k] = n0?.style[k] || '';
          Object.assign(hit.style, { position: 'absolute', pointerEvents: 'auto', cursor: 'pointer', zIndex: 3 });
          b.style.pointerEvents = 'none'; b.querySelectorAll('*').forEach((e) => { e.style.pointerEvents = 'none'; });
          // basıldığı an (pointerdown) açılır — tıklamanın bırakılması beklenmez
          hit.onpointerdown = (ev) => { if (ev.button === 0) b.onclick?.(ev); };
          hit.ondblclick = () => { if (selected?.is_open) connect(); };   // ana sunucuya çift tık: varsayılan (en boş) alt sunucuya doğrudan bağlanır
          b.append(hit);
          // KO sunucu satırı: etikete göre şerit (EVENT pembe / Recommend mavi orijinal game_server_event_02; NEW kırmızı) — düğmenin
          // kendi durum görselleri yerine; seçili satırda parıltılı beyaz çerçeve (secim2), üzerinde altın çerçeve (secim1)
          for (const c of b.children) if (c !== hit) c.style.visibility = 'hidden';
          const et = s.etiket === 'yok' ? null : (s.etiket || 'new');
          const ser = document.createElement('div'); ser.className = 'ko-sunucu-serit' + (et ? ' et-' + et : '');
          for (const k of ['left', 'top']) ser.style[k] = n0?.style[k] || '';
          const cer = document.createElement('div'); cer.className = 'ko-sunucu-cerceve';
          cer.style.left = (parseFloat(n0?.style.left) || 0) - 34 + 'px'; cer.style.top = (parseFloat(n0?.style.top) || 0) - 28 + 'px';
          b.prepend(ser, cer);
          hit.onmouseenter = () => b.classList.add('ust'); hit.onmouseleave = () => b.classList.remove('ust');
        }
        txt.textContent = txt.textContent.toUpperCase();
        if (!selected && s.is_open) { b.classList.add('secili'); selected = s; }   // yan menü yalnızca sunucuya tıklanınca açılır
      }
      for (const sv of servers || []) if (sv?.id != null) kralAl(sv.id);
      dP.then((d) => { doluluk = d || []; if (!panel.hidden && selected) { const i = (servers || []).indexOf(selected); const b = i >= 0 ? g.get(`Btn_list_${i + 1}`) : null; if (b) { const kk = kanal; altPanel(selected, b); panel.querySelectorAll('.as-satir').forEach((e) => e.classList.toggle('secili', Number(e.dataset.k) === kk)); kanal = kk; } } });
      bP.then((bk) => { bakim = !!bk; if (!bakim) return; (servers || []).forEach((sv, i) => { const t = g.get(`server_${i + 1}`); if (t) { t.textContent = `${sv.name}  (maintenance)`.toUpperCase(); t.classList.add('kapali'); } }); });   // tüm sunucuların kral / pano verisi önceden
      let bakimOk = false;
      // tek giriş: alt sunucuya hızlı art arda tıklamalar (bakım denetimi beklenirken) birden çok enterServer çağırıp karakter seçme ekranını
      // tekrar tekrar yeniliyordu → istek sürerken ve sunucuya girildikten sonra yeni tıklamalar yok sayılır
      let baglaniyor = false;
      const connect = async () => {
        if (baglaniyor) return;
        baglaniyor = true;
        let girdi = false;
        try {
          if (!selected?.is_open) { if (selected) message({ title: 'Server', text: 'This server is under maintenance.' }); return; }
          if (!bakimOk && await bakimAl()) {
            if (!(await gmHesap())) { message({ title: 'Maintenance', text: 'The server is currently under maintenance. Please try again later.' }); return; }
            bakimOk = true;   // GM hesabı bakımda da girebilir
          }
          if (panel.hidden) { const i = servers.indexOf(selected); const row = g.get(`Btn_list_${i + 1}`); if (row) { g.get(`server_${i + 1}`)?.classList.add('aktif'); altPanel(selected, row); return; } }   // KO: önce alt sunucu seçilir
          try { sessionStorage.setItem('ko-kanal', String(kanal)); localStorage.setItem('ko-kanal', String(kanal)); localStorage.setItem('ko-kanal-' + selected.id, String(kanal)); } catch {}
          girdi = true;
          panel.style.pointerEvents = 'none';
          enterServer({ ...selected, kanal, gorunen: `${selected.name} ${kanal}` });
        } finally { if (!girdi) baglaniyor = false; }
      };
      g.click('Btn_Connect', connect);
      // Enter: seçili sunucunun alt sunucularını açar; açıksa seçili alt sunucuya bağlanır (Bağlan / çift tık ile aynı)
      onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (!anaSecildi || e.repeat) return;   // önce ana sunucuya tıklanmalı (girişteki Enter sunucu açıp krallık yazılarını göstermesin)
          if (!panel.hidden && selected?.is_open) { connect(); return; }   // alt sunucular açıksa Enter seçili alt sunucuya bağlanır
          const i = servers?.indexOf(selected); const b = i >= 0 ? g.get(`Btn_list_${i + 1}`) : null; if (b && selected?.is_open) { b.onclick?.(e); } return; }
        if (e.key === 'Escape') location.href = 'index.html';
      };
    }

    // ================= ULUS SEÇİMİ (re_nation_select) =================
    let server = null, chars = [], cur = 0, pickedNation = null;
    let girisSuruyor = false;   // aynı anda tek enterServer (art arda çağrılar karakter seçme ekranını yeniden kuruyordu)
    async function enterServer(srv, fly = true) {
      if (girisSuruyor) return;
      girisSuruyor = true;
      try { await enterServer0(srv, fly); } finally { girisSuruyor = false; }
    }
    async function enterServer0(srv, fly) {
      server = srv;
      try { if (srv.gorunen) { sessionStorage.setItem('ko-sunucu', srv.gorunen); localStorage.setItem('ko-sunucu', srv.gorunen); } sessionStorage.setItem('ko-sunucu-id', String(srv.id)); } catch {}
      const wait = message({ title: srv.name, text: 'Loading characters…', bekle: true });
      const { data, error } = await sb.from('characters').select('*').eq('owner', session.user.id).eq('server_id', srv.id).order('slot');
      wait.close();
      if (error) return message({ title: srv.name, text: trErr(error) });
      chars = [null, null, null];
      for (const c of data) if (c.slot >= 0 && c.slot < 3 && !chars[c.slot]) chars[c.slot] = c; else if (!chars.includes(c)) { const f = chars.indexOf(null); if (f >= 0) chars[f] = c; }
      pickedNation = chars.find(Boolean)?.nation || null;
      if (!pickedNation) nationScreen(); else selectScreen({ fly });
    }

    function nationScreen() {
      clear(); set3D(false); bg.style.backgroundImage = 'none';
      const g = L('re_nation_select', 'ko-ulus');
      g.text('text_karus_notice', 'Karus: the nation of strength and courage. Arch Tuarek, Tuarek, Wrinkle Tuarek, Puri Tuarek and Kurian races.');
      g.text('text_elmo_notice', 'El Morad: the nation of honor and justice. Barbarian, Male and Female El Moradian and Porutu races.');
      g.el.querySelectorAll('[data-id$="_notice"]').forEach((e) => e.classList.add('ko-cok-satir'));
      // (7.11) düğme yazıları: KO yerleşiminde her yazı açık + koyu iki kopya (1 px kaymalı) — üst üste binip siyah / gölgeli bulanık görünüyordu;
      //   yalnız koyu kopya kalır, düz ve net (açık zemin düğmede okunur)
      for (const im of g.el.querySelectorAll('.kui-btn > .kui-img')) {
        const tx = [...im.querySelectorAll(':scope > .kui-tx')];
        const parlak = (e) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(e.style.color || getComputedStyle(e).color); return m ? (+m[1] + +m[2] + +m[3]) / 3 > 128 : false; };
        tx.forEach((e) => { if (tx.length > 1 && parlak(e)) e.style.display = 'none'; else e.classList.add('ko-ulus-dt'); });
      }
      arkaKareler?.forEach((d) => { d.hidden = true; });   // (7.11) sunucu listesinin arka plan animasyonu bu ekranın yanlarında görünmesin
      // (7.11) ulus seçimi onayı (KO: seçilen ulus o sunucudaki tüm karakterler için geçerlidir)
      const ulusSor = (n) => { if (document.querySelector('.ko-lobi-modal')) return; const ad = n === 1 ? 'Karus' : 'El Morad';
        message({ title: 'Select Nation', text: `Do you want to select ${ad}?\nAll characters on this server will belong to the ${ad} nation.`, yes: { label: 'Yes', fn: () => { pickedNation = n; selectScreen({ fly: true }); } } }); };
      g.click('btn_karus_selection', () => ulusSor(1));
      g.click('btn_elmo_selection', () => ulusSor(2));
      g.click('btn_back', serverScreen);
      ui.append(g.el); center(g.el);
      onKey = (e) => { if (e.key === 'Escape') serverScreen(); };
    }

    // ================= KARAKTER SEÇİMİ (re_characterselect) =================
    async function selectScreen({ fly = false } = {}) {
      clear();
      // önce giriş haritası ve karakterler hazırlanır (siyah ara ekran yok), sonra sahne kamerayla açılır
      const nation = pickedNation || chars.find(Boolean)?.nation || 1;
      const needLoad = stage.nation !== nation || !stage.group;
      const wait = needLoad || !actors.length ? message({ title: server?.name || 'MineKO', text: 'Loading…', bekle: true }) : null;
      await Promise.all([
        Promise.race([loadStage(nation), new Promise((r) => setTimeout(r, 30000))]),
        placeActors(),
      ]);
      wait?.close();
      set3D(true);
      cur = Math.max(0, chars.findIndex(Boolean));
      lastDir = 0;
      kamUlus(nation); kamKo = true; kamAci = kamHedef = KAM.aci[cur]; kyDurak = cur; kyol = null;
      camera.fov = KAM.fov; camera.updateProjectionMatrix();
      camTarget = { pos: new THREE.Vector3(KAM.pivot.x + Math.sin(kamAci) * KAM.r, KAM.pivot.y + KAM.h, KAM.pivot.z + Math.cos(kamAci) * KAM.r), look: KAM.pivot.clone() };   // iki kat aralıklı üç karakter kadraja sığar (soldaki seçim penceresinin arkasında kalmaz)
      if (fly) startFly();
      // KO 2369 (deadsoft co_characterselect): altta tek şerit — Seviye / Ad / Sınıf, ◀ ▶, Karakter Oluştur · Oyuna Başla · Karakter Sil · Geri · Çıkış
      const yeni = hasLayout('co_characterselect');
      const g = L(yeni ? 'co_characterselect' : 're_characterselect', yeni ? 'ko-secim-co' : 'ko-secim');
      ui.append(g.el);
      if (yeni) {
        translateLayout(g, { 'Level :': 'Seviye :', 'I D :': 'Ad :', 'Class :': 'Class :', 'Create Character': 'Create Character', Start: 'Start Game', 'Delete Character': 'Karakter Sil', Back: 'Geri', Exit: 'Exit' });
        const fb = () => { const k = Math.min(1.3, (innerWidth - 16) / 1024); g.el.style.transform = `translateX(-50%) scale(${k})`; }; fit.push(fb); fb();
      } else {
        const band = g.get('Group_Bottom_Img');   // alt bant: 1024x252 tasarım ekran genişliğine ölçeklenir
        const fb = () => { band.style.transform = `scale(${innerWidth / 1024}, ${Math.min(1, innerHeight / 1100)})`; }; fit.push(fb); fb();
      }
      const refresh = () => {
        const c = chars[cur];
        g.text('str_id', c ? c.name : '');
        g.text('str_lev', c ? String(c.level) : '');
        g.text('str_job', c ? `${(JOB_EN[c.nation] || JOB_EN[1])[c.class] || CLASS[c.class] || ''}` : '');
        g.get('btn_start').classList.toggle('kui-pasif', !c);
        g.get('btn_delete')?.classList.toggle('kui-pasif', !c);
        g.get('btn_create').classList.toggle('kui-pasif', !!c);
        arrange();
      };
      let basliyor = false;   // oyuna giriş başladı: hiçbir tuş / tık işlenmez (sağ-sol, sil, geri…)
      // KO: ◀ orta→sol, sağ→orta; ▶ orta→sağ, sol→orta (karakterler yer değiştirmez, kamera döner)
      // kamera hazır mı: giriş uçuşu bitmiş ve kamera seçili karaktere dönmüş olmalı (o zamana kadar karakter değiştirilmez)
      const kamHazir = () => (kyAktif() ? !kyol : !stage.fly && Math.abs(kamAci - kamHedef) < 0.03);
      // giriş uçuşunu atla: kamera hemen öndeki karakterin karşısına geçer (karakter seçilmez / oyun başlamaz)
      const ucusAtla = () => { if (kyAktif()) { if (!kyol) return false; kyol = null; kyVardi(); return true; }   // kayıtlı yol: son kareye (durağa) atla
        if (!stage.fly) return false; stage.fly = null; kamAci = kamHedef; camera.position.copy(camTarget.pos); camera.lookAt(camTarget.look); return true; };
      const rotate = (d) => {
        if (basliyor || !kamHazir()) return;
        if (kyAktif()) {   // KO 2369: karakterler sırayla dizili; ◀ ▶ bir önceki / sonraki karaktere, kamera kayıtlı geçiş yoluyla gider
          const n = Math.max(0, Math.min(2, cur + (d < 0 ? 1 : -1))); if (n === cur) return;   // KO: ◀ sıradaki, ▶ önceki karakter (kamera yolu yönü)
          const no = KYOL.gecis[`${cur}-${n}`]; lastDir = 0; cur = n; kyDurak = n; if (no) kyOyna(no); else kyVardi(); refresh(); return;
        }
        const n = d < 0 ? (cur === 0 ? 1 : cur === 2 ? 0 : 1) : (cur === 0 ? 2 : cur === 1 ? 0 : 2); if (n === cur) return; lastDir = d; cur = n; refresh(); };
      // KO: hesap zaten oyundaysa uyarı — devam edilirse mevcut karakter oyundan atılır
      const start = async () => {
        if (!chars[cur] || basliyor) return;
        // ulus değiştirmiş karakter (Nation Transfer): oyuna girmeden önce yeni ulusta ırk / yüz / saç seçilir
        if (chars[cur].irk_ayar) { createScreen(cur, { duzenle: chars[cur] }); return; }
        basliyor = true;
        try {
          const { data } = oturumOnay ? { data: null } : await sb.rpc('session_durum');
          if (data?.aktif) {
            message({ title: 'Session', text: `This account is already in the game${data.ad ? ` (${data.ad})` : ''}. That character will be disconnected. Continue?`,
              yes: { label: 'Connect', fn: () => { yuru().then(() => finish({ ...chars[cur] })); } }, no: () => { basliyor = false; } });
            return;
          }
        } catch {}
        await yuru();
        finish({ ...chars[cur] });
      };
      // KO: oyuna girerken seçili karakter ekrana doğru yürür (ChrSelect animasyonu 2)
      let yuruAtla = null;   // yürürken ikinci Enter: animasyon atlanır, hemen yükleme ekranına geçilir
      const yuru = () => new Promise((r0) => {
        let bitti0 = false; const r = () => { if (bitti0) return; bitti0 = true; yuruAtla = null; r0(); };
        yuruAtla = r;
        const a = actors.find((x) => x.slot === cur);
        if (!a?.api.has('sec2')) return r();
        g.el.style.pointerEvents = 'none'; g.el.style.opacity = '0.4';
        // ekranın tam ortasına yürüsün: kamera karakterin tam arkasındaki eksene döner (pivot → karakter doğrultusu),
        // karakter de bu eksen boyunca kameraya döner; yürüyüş bu doğru üzerinde kalır (ekran ortası)
        stage.fly = null;   // giriş uçuşu sürerken Enter: uçuş bırakılır, kamera öndeki karakterin arkasına yumuşakça döner
        const ky = kyAktif();
        if (ky) kyol = null;   // kayıtlı yol: kamera durağında; karakter zaten kameraya bakıyor
        const hp = a.holder.position, ang = Math.atan2(hp.x - KAM.pivot.x, hp.z - KAM.pivot.z);
        if (!ky) { kamHedef = ang; a.holder.rotation.y = Math.PI + ang; }
        const t0 = performance.now();
        const bekle = () => {
          const hazir = ky || (Math.abs(kamAci - kamHedef) < 0.005 && camera.position.distanceTo(camTarget.pos) < 0.05);
          if (!hazir && performance.now() - t0 < 4000) return requestAnimationFrame(bekle);
          if (!ky) { kamAci = kamHedef; camera.position.copy(camTarget.pos); }
          // (7.11) KO: karakter ekrana doğru yürürken ekran yavaşça kararır (yürüyüşün ikinci yarısında siyaha iner), sonra oyuna geçilir
          const sure = a.api.sure('sec2') || 3;
          const karar = document.createElement('div'); karar.className = 'ko-secim-karar'; root.append(karar);
          setTimeout(() => { karar.style.transition = `opacity ${Math.max(0.6, sure * 0.55).toFixed(2)}s linear`; karar.style.opacity = '1'; }, sure * 450);
          const karart = (sonra) => { karar.style.transition = 'opacity .35s linear'; karar.style.opacity = '1'; setTimeout(sonra, 380); };
          const bitti = () => { clearTimeout(zt); karart(r); };
          const zt = setTimeout(() => karart(r), sure * 1000 + 800);
          yuruAtla = () => karart(r);   // yürürken ikinci Enter: hızlı kararıp geçer
          a.api.playOnce('sec2', { hold: true, onDone: bitti });
        };
        bekle();
      });
      g.click('btn_left', () => rotate(-1)); g.click('btn_right', () => rotate(1));
      g.click('btn_start', start);
      g.click('btn_create', () => { if (!basliyor && !chars[cur]) createScreen(cur); });
      g.click('btn_delete', () => { if (!basliyor) deleteDialog(chars[cur]); });
      g.click('btn_back', () => { if (!basliyor) serverScreen(); });
      g.click('btn_exit', () => { if (!basliyor) location.href = 'index.html'; });
      onKey = (e) => { if (basliyor) { e.preventDefault(); e.stopPropagation(); if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.repeat && yuruAtla) yuruAtla(); return; } if (e.key === 'ArrowLeft') { if (!e.repeat) rotate(-1); } else if (e.key === 'ArrowRight') { if (!e.repeat) rotate(1); } else if (e.key === 'Enter') { e.preventDefault(); if (e.repeat) return; if (ucusAtla() || !kamHazir()) return; start(); } else if (e.key === 'Escape') serverScreen(); else if (e.key === 'Delete' && chars[cur]) deleteDialog(chars[cur]); };   // KO: oyuna Enter ya da Start Game ile girilir; deadsoft şablonunda silme düğmesi yok → Delete tuşu
      canvas.oncontextmenu = (e) => { e.preventDefault(); if (!basliyor && chars[cur]) deleteDialog(chars[cur]); };   // sağ tık: karakteri sil
      canvas.onclick = (e) => {   // karaktere tıklamak yalnızca seçer (oyunu başlatmaz)
        if (basliyor) return;
        const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
        for (const a of actors) if (ray.intersectObject(a.hit, false).length) { if (a.slot !== cur) { lastDir = ((a.slot - cur + 3) % 3) === 1 ? 1 : -1; cur = a.slot; refresh(); } }
      };
      refresh();
    }

    async function placeActors() {
      clearActors();
      for (let s = 0; s < 3; s++) {
        const c = chars[s]; if (!c) continue;
        const api = await createCharacter(c.race, { face: c.face, hair: c.hair, sacRenk: c.sac_renk ?? null, secim: true }).catch(() => null);
        if (!api) continue;
        const holder = new THREE.Group(); holder.add(api.group); holder.visible = false; scene.add(holder);   // (7.11) donanım takılana dek gizli (önce çıplak görünmesin)
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1.1; holder.add(hit);
        api.group.scale.z = -1;   // KO modeli sol-el → görüntü aynalanmasın
        actors.push({ api, slot: s, holder, hit });
      }
      // (7.11) karakterler donanımları (zırh, silah, efekt) takılmış olarak görünür: yükleme ekranı bunu bekler (en çok 15 sn)
      await Promise.race([giydir().catch((e) => console.warn('seçim ekranı donanım', e)), new Promise((r) => setTimeout(r, 15000))]);
      for (const a of actors) a.holder.visible = true;
    }
    // seçim ekranı: yalnızca zırh ve silahlar (yuva 0-13) — kostüm, kanat, pathos gösterilmez
    let donanimP = null, lobiFxP = null;
    const _elOk = (v, u) => (v = Number(v) || 0) >= 64 || (u && v > 0);
    const esyaEl = (it = {}) => { const u = Number(it.item_type) === 4; if (u) { const n = Number(/\(\+(\d+)\)/.exec(it.name || '')?.[1] || 0); if (n < (/scorpion bow/i.test(it.name || '') ? 3 : 6)) return 0; } return _elOk(it.fire_damage, u) ? 1 : _elOk(it.ice_damage, u) ? 2 : _elOk(it.lightning_damage, u) ? 3 : _elOk(it.poison_damage, u) ? 4 : 0; };
    const esyaSatir = (slot, num, it) => ({ slot, org: it?.org_num, num: Number(it?.kaynak_num) || num, el: esyaEl(it), sonuk: Number(it?.item_type) === 4 && Number(/\(\+(\d+)\)/.exec(it?.name || '')?.[1] || 0) < (/scorpion bow/i.test(it?.name || '') ? 3 : 6), res: it?.model_res || 0, efekt: it?.efekt ?? null, reb: [11, 12].includes(Number(it?.item_type)) ? Number(/\(\+(\d+)\)/.exec(it?.name || '')?.[1] || 0) : 0 });
    // (7.11) sahneden kaldırılan / gizlenen modelin silah, reverse ve kanat efektleri bırakılır (efekt yöneticisi son konumda havada bırakıyordu)
    const efektBirak = (api, race) => { if (!api) return; api._fxKanat?.(); for (const k of Object.keys(api._glow || {})) { for (const b of api._glow[k]?.b || []) b?.dispose?.(); delete api._glow[k]; } donanimP?.then((D) => D.applyGear(api, race || 1, [], false)).catch(() => {}); };
    const donanimYukle = () => {
      donanimP ||= import('./donanim.js').then(async (D) => { await D.loadDonanim(new URLSearchParams(location.search).get('npcassets') || REMOTE_ZONES); return D; });
      lobiFxP ||= import('./fx.js').then(async (F) => { await F.loadFX('./assets/fx'); lobiFx = new F.FXManager(scene, camera, (x, z) => stageHeight(x, -z)); return lobiFx; }).catch((e) => { console.warn('seçim efektleri', e); return null; });
      return Promise.all([donanimP, lobiFxP]);
    };
    // (7.11) karakter oluşturma önizlemesi (vitrin): her sınıf Chitin Shell (+7, reverse değil) set — büyücüde aynı kademe Complete Robe —
    //   ve sınıfın reverse (+1) silahları. Kurian / Porutu: Spear of Murky Waters + Hanguk Sword (kendi zırh setleri yok → zırhsız)
    const VITRIN_SET = { 1: 206, 2: 246, 3: 266, 4: 286 };   // yuva ← parça: 4 omuzluk, 10 pantolon, 1 miğfer, 12 eldiven, 13 çizme
    const VITRIN_SILAH = { 1: [[6, 156211001]], 2: [[6, 111211001], [8, 111211001]], 3: [[6, 189411001]], 4: [[6, 190251061], [8, 179112001]], 13: [[6, 159312001], [8, 129111001]] };
    async function vitrinGiydir(api, race, cls, gecerli = () => true, { kaskYok = false } = {}) {
      const set = VITRIN_SET[cls];
      const liste = [...(set ? [[4, 1], [10, 2], ...(kaskYok ? [] : [[1, 3]]), [12, 4], [13, 5]].map(([y, p]) => [y, set * 1e6 + p * 1000 + 7]) : []), ...(VITRIN_SILAH[cls] || [])];
      if (!liste.length) return;
      const [[D, fxm], rows] = await Promise.all([donanimYukle(), Promise.resolve(sb.from('items').select('num,name,org_num,item_type,fire_damage,ice_damage,lightning_damage,poison_damage,model_res,efekt,kaynak_num').in('num', [...new Set(liste.map((x) => x[1]))])).then((r) => r.data || [], () => [])]);
      if (!gecerli()) return;
      if (fxm) { D.setFx(fxm); await D.esyaFxHazir?.(); }
      const by = new Map(rows.map((r) => [Number(r.num), r]));
      const eq = liste.filter(([, n]) => by.has(n)).map(([y, n]) => esyaSatir(y, n, by.get(n)));
      api.fxOk = !!fxm;
      if (gecerli()) await D.applyGear(api, race, D.gearCodes(eq)).catch(() => {});
    }
    async function giydir() {
      const ids = actors.map((a) => chars[a.slot]?.id).filter(Boolean); if (!ids.length) return;
      donanimP ||= import('./donanim.js').then(async (D) => { await D.loadDonanim(new URLSearchParams(location.search).get('npcassets') || REMOTE_ZONES); return D; });
      // eşya efektleri (silah parlaması): KO FX motoru seçim sahnesine de kurulur
      lobiFxP ||= import('./fx.js').then(async (F) => { await F.loadFX('./assets/fx'); lobiFx = new F.FXManager(scene, camera, (x, z) => stageHeight(x, -z)); return lobiFx; }).catch((e) => { console.warn('seçim efektleri', e); return null; });
      const [D, inv, fxm] = await Promise.all([donanimP, Promise.resolve(sb.from('inventory').select('char_id,slot,item_num,items(name,org_num,item_type,fire_damage,ice_damage,lightning_damage,poison_damage,model_res,efekt,kaynak_num)').in('char_id', ids).lte('slot', 13).gte('slot', 0)).then((r) => r.data || [], () => []), lobiFxP]);
      if (fxm) { D.setFx(fxm); await D.esyaFxHazir?.(); }
      const ok = (v, u) => (v = Number(v) || 0) >= 64 || (u && v > 0);
      const elOf = (it = {}) => { const u = Number(it.item_type) === 4; if (u) { const n = Number(/\(\+(\d+)\)/.exec(it.name || '')?.[1] || 0); if (n < (/scorpion bow/i.test(it.name || '') ? 3 : 6)) return 0; } return ok(it.fire_damage, u) ? 1 : ok(it.ice_damage, u) ? 2 : ok(it.lightning_damage, u) ? 3 : ok(it.poison_damage, u) ? 4 : 0; };
      for (const a of actors) {
        const c = chars[a.slot]; if (!c) continue;
        const eq = inv.filter((r) => r.char_id === c.id).map((r) => ({ slot: r.slot, org: r.items?.org_num, num: Number(r.items?.kaynak_num) || r.item_num, el: elOf(r.items), sonuk: Number(r.items?.item_type) === 4 && Number(/\(\+(\d+)\)/.exec(r.items?.name || '')?.[1] || 0) < (/scorpion bow/i.test(r.items?.name || '') ? 3 : 6), res: r.items?.model_res || 0, efekt: r.items?.efekt ?? null, reb: [11, 12].includes(Number(r.items?.item_type)) ? Number(/\(\+(\d+)\)/.exec(r.items?.name || '')?.[1] || 0) : 0 }));
        a.api.fxOk = !!fxm;
        await D.applyGear(a.api, c.race, D.gearCodes(eq)).catch(() => {});
        a.shade = null; arrange();   // yeni parçalara da gölge tonu
      }
    }
    // KO CGameProcCharacterSelect: karakterler sabit yerlerde durur, kamera seçilen karaktere döner.
    // KO koordinatları (kamera +z'de, göz (0,-0.2,7.4), bakış (0,-0.4,0)): orta (0, 2.72) 0°, sol (+1.86, 2.1) 42°, sağ (-1.9, 2.1) -42°
    // → yerel (orta karakter orijinde, kamera +z'de; KO +x ekranın solu): sol (-1.86, -0.62), sağ (1.9, -0.62)
    function arrange() {
      for (const a of actors) {
        if (kyAktif()) {   // KO 2369: her karakter kendi durağının bakış doğrultusunda, kameraya dönük
          const k = kyKarakter(a.slot), w = koDunya(k.p, new THREE.Vector3()), e = koDunya(k.goz, new THREE.Vector3());
          a.holder.position.copy(w); a.holder.rotation.y = Math.PI + Math.atan2(e.x - w.x, e.z - w.z);
        } else {
        const [x, z, d] = KO_YER[a.slot];
        a.holder.position.set(x, stageHeight(x, z), z);
        a.holder.rotation.y = Math.PI + d * Math.PI / 180;   // KO modeli +z'ye bakar (grup aynalı)
        }
        const secili = a.slot === cur, shade = secili ? 1 : 0.62;
        if (a.shade !== shade) { a.shade = shade; a.api.group.traverse((m) => { if (m.material) m.material.color?.setScalar(shade); }); }
        // KO: seçilen karakter "seçildi" hareketini yapar (sec1), sonra bekler (sec0)
        if (secili && a.secAktif !== true && a.api.has('sec1') && lastDir) a.api.playOnce('sec1');
        a.secAktif = secili;
      }
      kamHedef = KAM.aci[cur];
      pedestals.forEach((p, i) => (p.children[1].material.color.setHex(i === 0 ? 0xf0c860 : 0x6a5530)));
    }
    function placeActor() {}
    stepActor = () => {};
    arrangeHeights = () => { if (actors.length) arrange(); if (preview && !preview.yerinde) preview.holder.position.y = stageHeight(0, 0); };
    function clearActors() { lastDir = 0; for (const a of actors) { a.api?._fxKanat?.(); scene.remove(a.holder); } actors.length = 0;
      if (lobiFx?.list) { for (const b of [...lobiFx.list]) b?.dispose?.(); lobiFx.list.clear(); }   // seçim karakterlerinin silah / peri / kanat efektleri de kalksın (oluşturma ekranında görünmesin)
      if (preview) { efektBirak(preview.api, preview.race); scene.remove(preview.holder); preview = null; } }

    function deleteDialog(c) {
      if (!c) return;
      message({
        title: 'Delete Character', text: `${c.name} will be deleted permanently. Type the character name to confirm.`, input: true,
        yes: { label: 'Delete', fn: async (v) => {
          if (v !== c.name) { message({ title: 'Delete Character', text: 'The name does not match.' }); return false; }
          const { error } = await sb.from('characters').delete().eq('id', c.id);
          if (error) { message({ title: 'Delete Character', text: trErr(error) }); return false; }
          await enterServer(server, false);
        } },
      });
    }

    // ================= KARAKTER OLUŞTURMA (re_charactercreate) =================
    async function createScreen(slot, { duzenle = null } = {}) {
      // (7.11) karakter oluşturma seçim ekranının kamerasıyla, olduğu yerde: kamera açısı / görüş alanı değişmez, önizleme karakteri o yuvanın
      //   durduğu yerde ve diğer karakterler gibi kameraya dönük kurulur (eskiden kamera geriye, sahnenin ortasına gidiyordu)
      const yerinde = !!stage.group && show3D;
      let yer = null;
      if (yerinde) {
        if (kyAktif()) { const k = kyKarakter(slot), w = koDunya(k.p, new THREE.Vector3()), e = koDunya(k.goz, new THREE.Vector3()); yer = { p: w, ry: Math.PI + Math.atan2(e.x - w.x, e.z - w.z) }; }
        else { const [x, z, d] = KO_YER[slot]; yer = { p: new THREE.Vector3(x, stageHeight(x, z), z), ry: Math.PI + d * Math.PI / 180 }; }
      }
      const kamPoz = camera.position.clone(), kamBak = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10)), kamFov = camera.fov;
      clear(); set3D(true);
      if (yerinde) {
        if (preview) { efektBirak(preview.api, preview.race); scene.remove(preview.holder); preview = null; }
        for (const a of actors) if (a.slot === slot) { a.holder.visible = false; efektBirak(a.api, chars[slot]?.race); }   // (ırk / görünüm düzenleme) yuvadaki eski görünüm gizlenir
        camera.fov = kamFov; camera.updateProjectionMatrix();
      } else clearActors();
      // (7.11) kamera hemen sabitlenir: aşağıdaki sunucu sorguları beklenirken döngü kamerayı serbest bırakıp kaydırıyordu (kayıp geri gelme)
      camTarget = yerinde ? { pos: kamPoz, look: kamBak } : { pos: new THREE.Vector3(0, 1.45, 4.3), look: new THREE.Vector3(0, 1.05, 0) };
      stage.fly = null; kyol = null; sabitKam = true; camera.position.copy(camTarget.pos); camera.lookAt(camTarget.look);
      const nation = duzenle ? Number(duzenle.nation) : pickedNation || 1;
      const races = Object.entries(RACE).filter(([, r]) => r.nation === nation).map(([id]) => +id);
      // ulus değişikliği sonrası görünüm: sınıf sabit (meslek → taban sınıf), yalnız o sınıfa izinli ırklar; statlar karakterinkiler
      const TABAN = { 5: 1, 6: 1, 7: 2, 8: 2, 9: 3, 10: 3, 11: 4, 12: 4, 14: 13, 15: 13 };
      const dSinif = duzenle ? (TABAN[duzenle.class] || Number(duzenle.class)) : 0;
      // GM hesapları her ırkta tüm sınıfları seçebilir (Karus kadın asas, Karus / El Morad her ırkta savaşçı…); sunucu create_character da GM'de kuralı atlar
      const gmMi = await gmHesap().catch(() => false);
      // KO NewChrValue.tbl (ırk·10000 + ulus·100 + meslek): yalnız tablodaki ırk / meslek eşleşmeleri — GM dahil herkes için aynı
      void gmMi; const sinifOk = (r, c) => RACE[r].classes.includes(Number(c));
      const st = { race: races[0], cls: RACE[races[0]].classes[0], face: 0, hair: 0, sacRenk: null, add: { str: 0, sta: 0, dex: 0, intel: 0, cha: 0 } };
      if (duzenle) { st.sacRenk = duzenle.sac_renk ?? null; st.cls = dSinif; st.race = races.includes(Number(duzenle.race)) ? Number(duzenle.race) : races.find((r) => sinifOk(r, dSinif)) || races[0]; }
      const { data: bases } = await sb.from('race_bases').select('*');
      const baseOf = (r) => bases?.find((b) => b.race === r) || { str: 60, sta: 60, dex: 60, intel: 60, cha: 50 };
      const g = L('re_charactercreate', 'ko-olustur');
      ui.append(g.el);
      const race = g.get('Group_race'), cls = g.get('Group_class'), nm = g.get('Group_name');
      race.classList.add('ko-irk'); cls.classList.add('ko-sinif'); nm.classList.add('ko-isim');
      // KO re_charactercreate birebir: ırk düğmeleri (Kurian / Porutu dahil) orijinal yerleşimdeki yerinde ve yazısıyla; yalnız seçilen ulusunkiler görünür
      for (const r of Object.values(RACE)) if (r.btn) g.show(r.btn, r.nation === nation);
      const raceBtn = {};
      for (const r of races) if (RACE[r].btn && g.get(RACE[r].btn)) raceBtn[r] = g.get(RACE[r].btn);
      // meslek düğmeleri: Kurian / Porutu ırkında yalnız kendi düğmesi (btn_class_kurian / btn_class_porutu), diğer ırklarda 4 meslek düğmesi
      const KUR_BTN = nation === 1 ? 'btn_class_kurian' : 'btn_class_porutu';
      g.show('btn_class_kurian', false); g.show('btn_class_porutu', false);
      g.click(KUR_BTN, () => { if (!duzenle && sinifOk(st.race, 13)) { st.cls = 13; render(); } });
      for (const [r, b] of Object.entries(raceBtn)) { b.classList.add('kui-tik'); b.onclick = () => { if (duzenle && !sinifOk(+r, dSinif)) return; st.race = +r; if (!sinifOk(st.race, st.cls)) st.cls = RACE[st.race].classes[0]; st.face = st.hair = 0; resetStats(); render(); rebuildModel(); }; }
      for (const [c, id] of Object.entries(CLASS_BTN)) g.click(id, () => { if (!duzenle && sinifOk(st.race, +c)) { st.cls = +c; render(); } });
      const nameIn = g.input('edit_name', { maxLength: 20 });
      if (duzenle) { nameIn.value = duzenle.name; nameIn.readOnly = true; }
      let token = 0;
      const rebuildModel = async () => {
        const my = ++token;
        const api = await createCharacter(st.race, { face: st.face, hair: st.hair, sacRenk: st.sacRenk }).catch(() => null);
        if (my !== token || !api) return;
        const eski = preview;
        const holder = new THREE.Group(); holder.add(api.group); api.group.scale.z = -1; holder.visible = false;   // (7.11) önce çıplak görünmesin
        if (yer) { holder.position.copy(yer.p); holder.rotation.y = yer.ry; } else { holder.position.y = stageHeight(0, 0); holder.rotation.y = Math.PI; }
        scene.add(holder);
        preview = { api, holder, spin: 0, yerinde: !!yer, cls: st.cls, race: st.race };
        await Promise.race([vitrinGiydir(api, st.race, st.cls, () => my === token, { kaskYok: st.kaskYok }).catch((e) => console.warn('önizleme donanımı', e)), new Promise((r) => setTimeout(r, 15000))]);
        if (my !== token) { efektBirak(api, st.race); scene.remove(holder); return; }
        if (eski) { efektBirak(eski.api, eski.race); scene.remove(eski.holder); }   // (7.11) eski önizlemenin silah efektleri havada kalmasın
        holder.visible = true;   // KO: karakter önden, dönmeden durur (◀ ▶ ile çevrilir)
      };
      const pts = () => FREE_POINTS - Object.values(st.add).reduce((a, b) => a + b, 0);
      const statEtiket = {}; for (const e of cls.querySelectorAll('.kui-tx')) { const t = e.textContent.trim().toUpperCase(); const u = { STR: 'str', DEX: 'dex', HP: 'sta', INT: 'int', MP: 'map' }[t]; if (u && !statEtiket[u]) statEtiket[u] = e; }
      const resetStats = () => { for (const k in st.add) st.add[k] = 0; };
      const faceTxt = [...cls.querySelectorAll('.kui-tx')].filter((e) => ['Face', 'Hair'].includes(e.textContent.trim()));
      faceTxt.forEach((e) => (e.dataset.tur = e.textContent.trim()));
      const render = () => {
        if (preview && preview.cls !== st.cls) { preview.cls = st.cls; rebuildModel(); }   // (7.11) sınıf değişince önizleme o sınıfın vitrin donanımıyla yeniden kurulur
        for (const [r, b] of Object.entries(raceBtn)) { b.classList.toggle('secili', +r === st.race); if (duzenle) b.classList.toggle('kui-pasif', !sinifOk(+r, dSinif)); }
        const kurIrk = RACE[st.race].classes.includes(13);
        g.show(KUR_BTN, kurIrk); g.get(KUR_BTN)?.classList.toggle('secili', kurIrk && st.cls === 13);
        for (const [c, id] of Object.entries(CLASS_BTN)) {
          const b = g.get(id), ok = duzenle ? +c === st.cls : sinifOk(st.race, +c);
          g.show(id, !kurIrk);
          b.classList.toggle('kui-pasif', !ok); b.classList.toggle('secili', ok && st.cls === +c);
        }
        const d = g.get('text_desc'); d.classList.add('ko-cok-satir');
        d.textContent = (KO_MESLEK[nation] || KO_MESLEK[1])[st.cls] || RACE[st.race].desc;   // KO Texts_us 3205–3217: meslek açıklaması
        const base = baseOf(st.race);
        for (const [k, u] of STAT_UI) g.text(`text_${u}`, String(duzenle ? duzenle[k] : base[k] + st.add[k]));
        g.text('text_bonus', duzenle ? '0' : String(pts()));
        // KO 2369: sınıfın öne çıkan statlarının etiketi mavi, serbest puanla artırılan değer yeşil
        const ONE = { 1: ['str', 'sta'], 2: ['dex', 'sta'], 3: ['intel', 'cha'], 4: ['intel', 'sta'], 13: ['str', 'sta'] }[st.cls] || [];
        for (const [k, u] of STAT_UI) {
          g.get(`text_${u}`)?.classList.toggle('ko-stat-art', !duzenle && st.add[k] > 0);
          const et = statEtiket[u]; if (et) et.classList.toggle('ko-stat-one', ONE.includes(k));
        }
        const ao = appearanceOptions(st.race);
        void ao;   // KO: "Face" / "Hair" yazıları sabit (sayı yok)
      };
      for (const [k, u] of STAT_UI) {
        g.click(`btn_${u}_right`, () => { if (!duzenle && pts() > 0) { st.add[k]++; render(); } });
        g.click(`btn_${u}_left`, () => { if (st.add[k] > 0) { st.add[k]--; render(); } });
      }
      // (7.11) saç değiştirilince (Hair ◀ ▶ / Change Hair Color) önizlemenin miğferi çıkarılır, saç görünsün; sınıf / ırk değişince de çıkarılmış kalır
      const kaskCikar = () => { if (st.kaskYok) return; st.kaskYok = true; const p = preview; if (p) vitrinGiydir(p.api, p.race, p.cls, () => preview === p, { kaskYok: true }).catch(() => {}); };
      const look = (face, d) => {
        const ao = appearanceOptions(st.race);
        if (face) st.face = (st.face + d + ao.faces) % ao.faces; else st.hair = (st.hair + d + ao.hairs) % ao.hairs;
        if (!face) kaskCikar();
        preview?.api.setLook({ face: st.face, hair: st.hair }); render();
      };
      // KO "Change Hair Color": renk paleti — seçilen renk saç parçalarına uygulanır (doku × renk), oluştururken kaydedilir
      g.click('btn_hair_color', () => kaskCikar() ?? sacPalet(g.get('btn_hair_color'), st.sacRenk, (rgb) => { st.sacRenk = rgb; preview?.api.setLook({ face: st.face, hair: st.hair, sacRenk: rgb }); }));
      g.click('btn_face_left', () => look(true, -1)); g.click('btn_face_right', () => look(true, 1));
      g.click('btn_hair_left', () => look(false, -1)); g.click('btn_hair_right', () => look(false, 1));
      g.click('btn_rot_left', () => { if (preview) { preview.spin = 0; preview.holder.rotation.y -= 0.4; } });
      g.click('btn_rot_right', () => { if (preview) { preview.spin = 0; preview.holder.rotation.y += 0.4; } });
      g.click('btn_cancel', () => { clearActors(); selectScreen(); });
      const create = async () => {
        if (duzenle) {
          const wait = message({ title: 'Nation Transfer', text: 'Saving…', bekle: true });
          const { data, error } = await sb.rpc('irk_gorunum', { p_char: duzenle.id, p_race: st.race, p_face: st.face, p_hair: st.hair });
          wait.close();
          if (error || !data?.ok) return message({ title: 'Nation Transfer', text: error ? trErr(error) : data?.reason || 'Kaydedilemedi.' });
          await sb.rpc('sac_renk_ayarla', { p_char: duzenle.id, p_rgb: st.sacRenk ?? -1 }).then(() => {}, () => {});
          clearActors(); await enterServer(server, false);
          const i = chars.findIndex((c) => c && c.id === duzenle.id); if (i >= 0) { cur = i; arrange(); }
          return;
        }
        if (pts() > 0) return message({ title: 'Create Character', text: `Distribute your ${pts()} free points first.` });
        if (!nameIn.value.trim()) return message({ title: 'Create Character', text: 'Enter a character name.', ok: () => nameIn.focus() });
        const base = baseOf(st.race), v = (k) => base[k] + st.add[k];
        const wait = message({ title: 'Create Character', text: 'Creating…', bekle: true });
        const { data: id, error } = await sb.rpc('create_character', {
          p_server: server.id, p_slot: slot, p_name: nameIn.value.trim(), p_race: st.race, p_class: st.cls,
          p_face: st.face, p_hair: st.hair, p_str: v('str'), p_sta: v('sta'), p_dex: v('dex'), p_int: v('intel'), p_cha: v('cha') });
        wait.close();
        if (error) return message({ title: 'Create Character', text: trErr(error) });
        if (st.sacRenk != null && id) await sb.rpc('sac_renk_ayarla', { p_char: id, p_rgb: st.sacRenk }).then(() => {}, () => {});
        clearActors(); await enterServer(server, false);
        const i = chars.findIndex((c) => c && c.id === id); if (i >= 0) { cur = i; arrange(); }
      };
      g.click('btn_create', create);
      onKey = (e) => { if (e.key === 'Enter' && document.activeElement === nameIn) create(); if (e.key === 'Escape') { clearActors(); selectScreen(); } };
      let drag = null;   // modeli fareyle döndür
      canvas.onpointerdown = (e) => { drag = e.clientX; if (preview) preview.spin = 0; };
      canvas.onpointermove = (e) => { if (drag != null && preview) { preview.holder.rotation.y += (e.clientX - drag) * 0.01; drag = e.clientX; } };
      canvas.onpointerup = () => (drag = null);
      render(); rebuildModel(); if (!duzenle) nameIn.focus();
      if (duzenle) message({ title: 'Nation Transfer', text: `${duzenle.name} is now in the ${nation === 2 ? 'El Morad' : 'Karus'} nation. Choose a new race, face and hair before entering the game, then save with Create.` });
    }

    addEventListener('keydown', (e) => { if (running && onKey && !document.querySelector('.ko-lobi-modal')) onKey(e); });
    // siteden oturumla gelindiyse doğrudan sunucu listesi; yeni girişte önce duyuru
    // oyundan tarayıcının geri / ileri tuşuyla çıkıldı (oyun.html → ?cikis=1): oturum kapatılır, giriş penceresi
    if (new URLSearchParams(location.search).has('cikis')) {
      history.replaceState(null, '', location.pathname);
      if (session) { session = null; sb.auth.signOut().catch(() => {}).finally(() => loginScreen()); return; }
    }
    // oyundan ESC → Karakter Seç: oyuncunun bulunduğu sunucu / kanalın karakter seçimine doğrudan, kamera uçuş animasyonuyla dönülür
    let secimeDon = null;
    try { if (sessionStorage.getItem('ko-secime-don')) { sessionStorage.removeItem('ko-secime-don'); secimeDon = { id: Number(sessionStorage.getItem('ko-sunucu-id')), kanal: Number(sessionStorage.getItem('ko-kanal')) || 1 }; } } catch {}
    if (session && secimeDon?.id) {
      loadAccount().then(async () => {
        const servers = await fetchServers(); serversP = null;
        const s = servers?.find((x) => x.id === secimeDon.id);
        if (!s?.is_open) return loginScreen();
        enterServer({ ...s, kanal: secimeDon.kanal, gorunen: `${s.name} ${secimeDon.kanal}` }, true);
      }, () => loginScreen());
      return;
    }
    // (8.11) otomatik giriş kaldırıldı: launcher'da Play'den sonra her zaman KO giriş penceresi (hesap + şifre) açılır
    let yeniGiris = false; try { yeniGiris = !!sessionStorage.getItem('ko-gm-yeni-giris'); sessionStorage.removeItem('ko-gm-yeni-giris'); } catch {}
    if (session && yeniGiris) loadAccount().then(girisDevam); else loginScreen();
  });
}
