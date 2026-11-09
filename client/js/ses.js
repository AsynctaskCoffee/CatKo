// KO ses efektleri (deadsoft / KO istemcisi Snd klasörü + sound.tbl, fx.tbl, NPC_Looks.tbl, UPC_DefaultLooks.tbl, Item_Org.tbl).
// openko CPlayerBase davranışı: saldırı klibinin vuruş karesinde silahın dwSoundID0 sesi (silahsız: ırkın Attack0/1 sesi),
// darbe alınca Temp_Blow (100) + hedefin Struck0 sesi, ölümde Dead0/Dead1, efektler (yetenek, iksir, seviye) fx.tbl'deki ses kimliğiyle.
// Sesler konumludur (oyuncuya uzaklıkla kısılır, 45 m ötesi duyulmaz). Ses düzeyi: Seçenekler → Ses → Efekt sesi.
const BASE = new URL('../assets/ses/', import.meta.url).href;
const ver = (u) => (window.KO_V ? window.KO_V(u) : u);
let D = null, ONEK = null;
const hazir = fetch(ver(BASE + 'ses.json')).then((r) => (r.ok ? r.json() : null)).then((d) => {
  D = d; if (!d) return;
  // ek/yükseltme sürümleri (Item_Ext) için: aynı silah türünün (ilk 6 hane) en yaygın sesi
  const say = {}; for (const [n, s] of Object.entries(d.item)) { const k = Math.floor(Number(n) / 1000); (say[k] ||= {})[s] = (say[k][s] || 0) + 1; }
  const tur = {}; for (const [n, s] of Object.entries(d.item)) { const k = Math.floor(Number(n) / 1e6); (tur[k] ||= {})[s] = (tur[k][s] || 0) + 1; }
  const enCok = (o) => Number(Object.entries(o).sort((a, b) => b[1] - a[1])[0][0]);
  ONEK = { k: Object.fromEntries(Object.entries(say).map(([k, v]) => [k, enCok(v)])), t: Object.fromEntries(Object.entries(tur).map(([k, v]) => [k, enCok(v)])) };
}).catch(() => null);

const ayar = () => { try { const s = JSON.parse(localStorage.getItem('ko-ayar') || '{}'); return { acik: s.efektSesAcik !== false, ses: (s.efektSes ?? 80) / 100 }; } catch { return { acik: true, ses: 0.8 }; } };
let ctx = null, ana = null;
function baglam() {
  if (ctx) return ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); ana = ctx.createGain(); ana.connect(ctx.destination); } catch { ctx = null; }
  if (ctx && ctx.state !== 'running') {
    const ac = () => { ctx.resume().catch(() => {}); removeEventListener('pointerdown', ac, true); removeEventListener('keydown', ac, true); };
    addEventListener('pointerdown', ac, true); addEventListener('keydown', ac, true);
  }
  return ctx;
}
const tamponlar = new Map();
function tampon(ad) {
  if (!tamponlar.has(ad)) tamponlar.set(ad, fetch(ver(BASE + ad + '.ogg')).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new Promise((ok) => baglam().decodeAudioData(b, ok, () => ok(null))) : null)).catch(() => null));
  return tamponlar.get(ad);
}

let dinleyici = null;   // () => THREE.Vector3 (oyuncunun dünya konumu)
export function sesDinleyici(fn) { dinleyici = fn; }
const ERIM = 45;
const son = new Map();   // aynı ses üst üste binmesin (60 ms)

/** sound.tbl kimliğiyle sesi çal. pos: dünya konumu (yoksa arayüz sesi, tam düzey) */
export function sesCal(id, pos = null, { duzey = 1 } = {}) {
  if (!D) { hazir.then(() => D && sesCal(id, pos, { duzey })); return; }
  const ad = typeof id === 'string' ? id : D.snd[id]; if (!ad) return;
  const a = ayar(); if (!a.acik || a.ses <= 0) return;
  let g = duzey * a.ses;
  if (pos && dinleyici) { const p = dinleyici(); if (p) { const d = Math.hypot(pos.x - p.x, pos.z - p.z); if (d > ERIM) return; g *= Math.max(0, 1 - d / ERIM) ** 1.5; } }
  if (g < 0.01) return;
  const t = performance.now(), k = ad + (pos ? Math.round(pos.x) + ',' + Math.round(pos.z) : '');
  if (t - (son.get(k) || 0) < 60) return; son.set(k, t);
  const c = baglam(); if (!c) return;
  tampon(ad).then((b) => {
    if (!b || c.state === 'closed') return;
    const s = c.createBufferSource(), v = c.createGain(); s.buffer = b; v.gain.value = g; s.connect(v); v.connect(ana); s.start();
  });
}
export const sesFxVar = (fx) => !!D?.fx?.[fx];
/** fx.tbl efektinin sesi (yetenek dökümü, uçuş, hedef, iksir, seviye atlama…) */
export function sesFx(fx, pos) { if (!D) { hazir.then(() => D?.fx?.[fx] && sesCal(D.fx[fx], pos)); return; } const s = D.fx[fx]; if (s) sesCal(s, pos); }
export function sesUi(ad) { const id = { ac: 'ui_invenopen', kapa: 'ui_invenclose', tik: 'ui_button', buton: 2000, tamir: 2001, silah: 2002, zirh: 2003, para: 3000, pencere: 40, cevir: 2501 }[ad]; if (id) sesCal(id, null, { duzey: 0.7 }); }

// silahın vuruş sesi (Item_Org dwSoundID0); yükseltme/ek sürümü ise aynı türün sesi
function silahSesi(num, org) {
  if (!D || !num) return 0;
  for (const n of [num, org]) { if (!n) continue; const v = D.item[n] || D.item[Math.floor(n / 1000) * 1000]; if (v) return v; }
  const n = Number(org || num);
  return ONEK?.k[Math.floor(n / 1000)] || ONEK?.t[Math.floor(n / 1e6)] || 0;
}
const SIRA = { yuru: 0, sald0: 1, sald1: 2, darbe0: 3, darbe1: 4, olum0: 5, olum1: 6, nefes0: 7, nefes1: 8 };
const _p = { x: 0, y: 0, z: 0 };
function konum(api) { const g = api?.group; if (!g) return null; g.updateWorldMatrix?.(true, false); const e = g.matrixWorld.elements; _p.x = e[12]; _p.y = e[13]; _p.z = -e[14]; return _p; }   // sahne → KO koordinatı (dünya grubu z aynalı)
function sesler(api) { if (!D || !api) return null; if (api.sesPid != null) return D.look[api.sesPid] || null; if (api.sesIrk != null) return D.upc[api.sesIrk] || D.upc[1]; return null; }
const saldiriKlibi = (n) => n === 'attack' || /^(atk|atkb|attack)_/.test(n) || n === 'a26' || n === 'a28' || /^atk\d|^attack\d/.test(n);

/** character.js playOnce kancası: klibe göre ses; saldırıda vuruş karesinde çalacak işlev döner */
export function sesAnim(api, ad) {
  const L = sesler(api); if (!L) return null;
  if (saldiriKlibi(ad)) {
    return () => {
      let id = 0;
      if (api.sesSilah) { const w = api.sesSilah(); id = silahSesi(w?.num, w?.org); }
      if (!id) id = L[(api._sesSira = (api._sesSira || 0) + 1) % 2 ? SIRA.sald0 : SIRA.sald1] || L[SIRA.sald0];
      if (id) sesCal(id, konum(api));
    };
  }
  if (ad === 'struck') { const p = konum(api); sesCal(100, p, { duzey: 0.8 }); const s = L[SIRA.darbe0] || L[SIRA.darbe1]; if (s) sesCal(s, p); return null; }
  if (ad === 'dead') { const s = (Math.random() < 0.5 ? L[SIRA.olum0] : L[SIRA.olum1]) || L[SIRA.olum0] || L[SIRA.olum1]; if (s) sesCal(s, konum(api)); return null; }
  return null;
}
/** kendi ayak sesim (Player_walk_0, sound.tbl 22) */
export function sesAdim(pos) { sesCal(22, pos, { duzey: 0.45 }); }
