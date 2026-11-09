// KO doğal hava (CGameServer UpdateWeather + istemci CN3Rain / CN3Snow / şimşek): her oyun saatinde açık / yağmur / kar.
// Herkes aynı havayı görür (oyun saatinden türetilir; sunucuya yük yok).
// Yağmurda gökyüzü ve sis kararır, bulutlar kapanır, ara ara şimşek çakar; kar yalnız kış aylarında (Kasım–Şubat) ya da karlı bölgelerde.
// Kral havası (kral.js, state.kralHava) varken doğal hava durur. Test: window.KO_HAVA = 'yagmur' | 'kar' | 'acik'.
import * as THREE from '../vendor/three.module.min.js';
import { gmHava, KO_HIZ } from './oyun-saati.js';

const KAPALI = /^(arena|in_dungeon|dungeon|clanfight|bossmode|itemzone|ms\d|klanq_|_gizli|kapali|star_neo|dragon|chaos)/;   // kapalı mekânlar: hava yok
const KARLI = /xmas|snow|kar_|winter/;

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function doğalHava(zone, ms = Date.now()) {
  if (window.KO_HAVA) return { tur: window.KO_HAVA, yogun: 1 };
  if (!zone || KAPALI.test(zone)) return { tur: 'acik', yogun: 0 };
  // KO CGameServerDlg::UpdateWeather — her oyun saatinde (oyun 10× hızlı: 6 gerçek dakika) tüm sunucu için yeniden:
  //   rnd < 2 → kar, < 7 → yağmur, değilse açık; miktar 0–100 (açıkta > 70 ise yarısı kadar sis, değilse 0)
  const saat = Math.floor(((ms / 1000 + 3 * 3600) * KO_HIZ) / 3600);
  const rnd = hash('ko-hava:' + saat) % 100, miktar = hash('ko-miktar:' + saat) % 101;
  if (rnd < 2) return { tur: 'kar', yogun: Math.max(0.25, miktar / 100) };
  if (rnd < 7) return { tur: 'yagmur', yogun: Math.max(0.25, miktar / 100) };
  return { tur: 'acik', yogun: 0, sis: miktar > 70 ? miktar / 2 / 100 : 0 };
}

export function initHava({ scene, state, camera, player, zone, fogColor }) {
  const R = 38, H = 28;
  // yağmur: uzun ince çizgiler (CN3Rain), kar: yumuşak noktalar (CN3Snow)
  const NY = 5200, yp = new Float32Array(NY * 6), yh = new Float32Array(NY);
  for (let i = 0; i < NY; i++) { const x = (Math.random() - 0.5) * R * 2, y = Math.random() * H, z = (Math.random() - 0.5) * R * 2; yp.set([x, y, z, x - 0.04, y - 0.75, z + 0.03], i * 6); yh[i] = 20 + Math.random() * 9; }
  const yg = new THREE.BufferGeometry(); yg.setAttribute('position', new THREE.BufferAttribute(yp, 3));
  const yagmur = new THREE.LineSegments(yg, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0, depthWrite: false, fog: true }));
  yagmur.frustumCulled = false; yagmur.renderOrder = 5; yagmur.visible = false; scene.add(yagmur);
  const NK = 3200, kp = new Float32Array(NK * 3), kh = new Float32Array(NK);
  for (let i = 0; i < NK; i++) { kp.set([(Math.random() - 0.5) * R * 2, Math.random() * H, (Math.random() - 0.5) * R * 2], i * 3); kh[i] = 1.1 + Math.random() * 1.3; }
  const kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.BufferAttribute(kp, 3));
  const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d'); const gr = c.createRadialGradient(16, 16, 0, 16, 16, 14); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32);
  const kar = new THREE.Points(kg, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 0.33, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, fog: true }));
  kar.frustumCulled = false; kar.renderOrder = 5; kar.visible = false; scene.add(kar);
  // şimşek: kısa süreli ekran aydınlanması
  const flas = document.createElement('div'); flas.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:#dfe8ff;opacity:0;z-index:2;mix-blend-mode:screen;transition:opacity .08s'; document.body.append(flas);
  let hedef = { tur: 'acik', yogun: 0 }, gucY = 0, gucK = 0, sonSimsek = 0, t = performance.now(), hizli = 0, yuzde = 0;
  const guncelle = (anlik = false) => {
    const kral = state.kralHava && state.kralHava !== 'acik', z = String(state.zone || zone || ''), gm = gmHava(z);
    hedef = gm ? { tur: gm, yogun: gm === 'acik' ? 0 : 0.85 } : kral ? { tur: 'acik', yogun: 0 } : doğalHava(z);   // GM havası her şeyin üstünde
    if (anlik === true) hizli = performance.now() + 4000;   // GM değişikliği: ~1 sn geçiş
    // KO CN3SkyMng::SetWeather: yağış yüzdesine göre bulut dokuları (10 sn'de geçer)
    yuzde = hedef.tur === 'acik' ? 0 : Math.round(Math.min(1, hedef.yogun || 0) * 100);
    const [t1, t2] = !yuzde ? ['wisps', 'puffs'] : yuzde > 80 ? ['overcast', 'dense'] : yuzde > 60 ? ['dense', 'streaks'] : yuzde > 40 ? ['streaks', 'tatters'] : ['tatters', 'puffs'];
    state.sky?.userData?.bulutTex?.(t1, t2, anlik === true ? 2 : 10);
    state.hava = hedef.tur;
  };
  guncelle(); setInterval(() => guncelle(), 15000);
  (function kare() {
    (window.__koKareRaf || requestAnimationFrame)(kare);
    const now = performance.now(), dt = Math.min(0.1, (now - t) / 1000); t = now;
    const hy = hedef.tur === 'yagmur' ? Math.min(1, hedef.yogun) : 0, hk = hedef.tur === 'kar' ? Math.min(1, hedef.yogun) : 0;
    const hz = now < hizli ? 3 : 0.25; gucY += (hy - gucY) * Math.min(1, dt * hz); gucK += (hk - gucK) * Math.min(1, dt * hz);   // ~10 sn geçiş
    const p = player?.position || camera?.position; if (!p) return;
    yagmur.visible = gucY > 0.02; kar.visible = gucK > 0.02;
    if (yagmur.visible) {
      yagmur.position.set(p.x, p.y - 4, p.z); yagmur.material.opacity = 0.45 * gucY;
      const a = yg.attributes.position.array, n = Math.floor(NY * gucY);
      for (let i = 0; i < NY; i++) { const o = i * 6; if (i >= n) { a[o + 1] = a[o + 4] = -999; continue; } if (a[o + 1] < -100) { a[o + 1] = Math.random() * H; a[o + 4] = a[o + 1] - 0.75; } const d = yh[i] * dt; a[o + 1] -= d; a[o + 4] -= d; if (a[o + 4] < 0) { a[o + 1] += H; a[o + 4] += H; } }
      yg.attributes.position.needsUpdate = true;
      // şimşek (yoğun yağmurda ara ara)
      if (gucY > 0.7 && now - sonSimsek > 9000 && Math.random() < dt * 0.06) { sonSimsek = now; flas.style.opacity = '0.55'; setTimeout(() => (flas.style.opacity = '0'), 90); setTimeout(() => { flas.style.opacity = '0.35'; setTimeout(() => (flas.style.opacity = '0'), 70); }, 220); }
    }
    if (kar.visible) {
      kar.position.set(p.x, p.y - 4, p.z); kar.material.opacity = 0.95 * gucK;
      const a = kg.attributes.position.array;
      for (let i = 0; i < NK; i++) { a[i * 3 + 1] -= kh[i] * dt; a[i * 3] += Math.sin(now / 900 + i) * 0.3 * dt; if (a[i * 3 + 1] < 0) a[i * 3 + 1] += H; }
      kg.attributes.position.needsUpdate = true;
    }
    // kapalı hava: gök / sis grileşir ve kararır (gün döngüsü renklerinin üstüne)
    const kapali = Math.max(gucY, gucK * 0.7);
    state.havaKapali = kapali;
    // yağışta bulut renkleri koyulaşır: cloud1 × fDelta·0.75, cloud2 × fDelta·0.5 (fDelta = 0.5 + 0.3·(100 − yüzde)/100)
    { const fd = 0.5 + 0.3 * (100 - (yuzde || 80)) / 100, u = state.sky?.userData; if (u) u.bulutCarp = [1 + (fd * 0.75 - 1) * kapali, 1 + (fd * 0.5 - 1) * kapali]; }
  })();
  return { guncelle, durum: () => ({ ...hedef, gucY, gucK }) };
}
