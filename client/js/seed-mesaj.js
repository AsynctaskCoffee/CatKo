// KO Seed yardımcısı (sağ altta kız) — orijinal KnightOnlineEn Data\Seed_Msg_us.tbl (assets/seed/mesaj.json, 204 mesaj; tip 2 = familiar
// konuşmaları hariç). Pencere re_quest_seed; portre npcimg\seed_<duygu>_01/_02 (iki kare, KO gibi kıpırdar).
// Sütunlar: t 0 = kendiliğinden çıkan mesaj / 1 = yalnız bir cevabın devamı, u ulus (0 hepsi), z KO bölge no (0 hepsi), l1 / l2 seviye aralıkları
// (255 = yok), h saat [başlangıç, bitiş / etkinlik saati], g haftanın günü (7 = her gün, 1 = Pazar), m duygu (portre), x metin, a1 / n1 ve
// a2 / n2 cevaplar ve devam mesajı, k tür: 1 selamlaşma (saate göre, girişte), 11 ölüm teselli, 12 savaş / etkinlik duyurusu,
// 13 yeni mektup, 14 bölge bilgisi (bölgeye girince), 15 ipucu (ara ara).
// Seçenekler → Decline Seed's Help (koSecenek.seed) açıksa hiç görünmez.
import { hasLayout, buildLayout, ekUI } from './kui.js';

const BOLGE_NO = { moradon: 21, karus2004: 1, elmo2004: 2, eslantzone: 0, freezone_b: 71, freezone_a: 72, freezone_c: 73, delos: 30, napies: 61 };
let M = null, L = null, aktif = null, kareT = 0, kapatT = 0;
const veri = () => (M ||= fetch('./assets/seed/mesaj.json').then((r) => r.json()).catch(() => []));
const katman = () => document.getElementById('kohud') || document.body;

function pencere() {
  if (L) return L;
  L = buildLayout('re_quest_seed', { className: 'ko-seed-bildirim ko-seed-mesaj kui-dokulu' });
  katman().append(L.el); L.el.hidden = true;
  L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const p = L.get('img_npc'); if (p) { p.classList.add('sm-portre'); p.replaceChildren(); }
  L.show('txt_talk_ext', false);
  const cevap = (i) => { const m = aktif; if (!m) return; const n = i === 0 ? m.n1 : m.n2; kapat(); if (n) veri().then((A) => { const s = A.find((x) => x.id === n); if (s) goster(s); }); };
  L.click('btn_0', () => cevap(0)); L.get('str_0')?.addEventListener('click', () => cevap(0));
  L.click('btn_1', () => cevap(1)); L.get('str_1')?.addEventListener('click', () => cevap(1));
  return L;
}
// portreler önbellekte: aynı görsel bir kez indirilip çözülür
const PORTRE = new Map();
const portreYukle = (u) => { if (!PORTRE.has(u)) PORTRE.set(u, new Promise((r) => { const im = new Image(); im.decoding = 'async'; im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => r(im)); im.onerror = () => r(null); im.src = u; })); return PORTRE.get(u); };
// (2.11) pencere sağda ekran kenarına, altta sağ alt simgelerin (görev çubuğu düğmeleri) üstüne kadar büyür
function yerlestir() {
  if (!L || L.el.hidden) return;
  const el = L.el; el.style.zoom = ''; el.style.right = '12px'; el.style.bottom = '70px';
  const r = el.getBoundingClientRect(); if (!r.width) return;
  const tb = document.querySelector('.ko-task [data-id="base_TaskBar"]'), tr = tb?.getBoundingClientRect();
  const alt = tr && tr.height ? tr.top : innerHeight - 70;
  const z = Math.max(1, Math.min((innerWidth - r.left) / r.width, (alt - r.top) / r.height));
  el.style.zoom = String(z); el.style.right = '0px'; el.style.bottom = (innerHeight - alt) / z + 'px';
}
addEventListener('resize', yerlestir);
function kapat() { if (L) L.el.hidden = true; aktif = null; clearInterval(kareT); clearTimeout(kapatT); }
function goster(m) {
  if (window.koSecenek?.seed || !hasLayout('re_quest_seed')) return false;
  const W = pencere(); aktif = m;
  W.text('txt_talk', m.x);
  const c1 = m.a1 || 'Ok.';
  W.text('str_0', c1); W.show('btn_0', true); W.show('str_0', true);
  W.show('btn_1', !!m.a2); W.show('str_1', !!m.a2); if (m.a2) W.text('str_1', m.a2);
  // portre: iki karelik KO duygu animasyonu — (2.11) iki kare de inip çözülmeden pencere görünmez: kız ve yazılar aynı anda çıkar
  const p = W.get('img_npc'), duygu = m.m || 'basic'; let k = 0;
  const url = (i) => `./assets/seed/seed_${duygu}_0${i}.webp`;
  const ciz = () => { if (p) p.style.backgroundImage = `url(${url((k % 2) + 1)})`; k++; };
  clearInterval(kareT); W.el.hidden = true;
  const ben = m;
  Promise.all([1, 2].map((i) => portreYukle(url(i)))).then(() => {
    if (aktif !== ben) return;
    ciz(); kareT = setInterval(ciz, 450);
    W.el.hidden = false; yerlestir();
  });
  clearTimeout(kapatT); kapatT = setTimeout(kapat, 30000);   // cevaplanmazsa 30 sn sonra kapanır
  return true;
}

/** oyun içinde kurulur: { state, zone, level() } */
export async function seedMesajKur({ state, zone, level }) {
  if (!(await ekUI('qseed').catch(() => false))) return;
  const A = await veri(); if (!A.length) return;
  const nation = () => Number(state?.me?.nation || state?.character?.nation || 0);
  const bolge = BOLGE_NO[zone] ?? -1;
  const lvOk = (r, lv) => r[0] === 255 || r[0] === 0 || (lv >= r[0] && lv <= r[1]);
  const uygun = (m, lv) => m.t === 0 && (!m.u || m.u === nation()) && lvOk(m.l1, lv) && lvOk(m.l2, lv);
  const sec = (liste) => liste[Math.floor(Math.random() * liste.length)];
  const lv = () => Number(level?.() || 1);
  const bosta = () => !aktif && !document.querySelector('.ko-npcmenu:not([hidden])');
  const goster1 = (f) => { const l = A.filter((m) => uygun(m, lv()) && f(m)); if (l.length && bosta()) return goster(sec(l)); return false; };
  const saat = () => new Date().getHours(), gun = () => new Date().getDay() + 1;
  // 1 — selamlaşma (girişten 8 sn sonra, günün saatine uygun olan)
  setTimeout(() => {
    if (goster1((m) => m.k === 1 && m.h[1] > m.h[0] && saat() >= m.h[0] && saat() < m.h[1])) return;
    // 12 — o gün etkinlik / savaş varsa (etkinlik saatinden önce) duyurusu
    goster1((m) => m.k === 12 && (m.g === 7 || m.g === gun()) && saat() < m.h[1]);
  }, 8000);
  // 14 — bölge bilgisi: bu bölgeye ait mesaj (girişten 20 sn sonra)
  setTimeout(() => goster1((m) => m.k === 14 && m.z === bolge), 20000);
  // 15 — ipucu: 10 dakikada bir
  setInterval(() => goster1((m) => m.k === 15 && (!m.z || m.z === bolge)), 10 * 60 * 1000);
  // 11 — ölünce teselli
  addEventListener('ko-oldum', () => setTimeout(() => goster1((m) => m.k === 11), 2500));
  // 13 — yeni mektup (okunmamış sayısı artınca)
  const hud = state?.hud; let sonMail = null;
  if (hud?.mailIkon) { const asil = hud.mailIkon.bind(hud); hud.mailIkon = (n) => { if (sonMail != null && n > sonMail) goster1((m) => m.k === 13); sonMail = n; return asil(n); }; }
  return { goster, kapat };
}
