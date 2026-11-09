// KO Seçenekler (Seed → Option) ayarlarının oyundaki etkileri. ayarlar.js her kayıtta uygula(s) çağırır; anlık okunan
// ayarlar window.koSecenek'ten (oyun döngüsü, sohbet, takas, PM…) okunur. Buradaki işler: sayfa sınıfları / CSS değişkenleri ve
// beceri simgesi izleyicisi (View Option).
import { yetenekVerisi } from './yetenek.js';

let s = {};
export function uygula(ayar) {
  s = ayar || {};
  const r = document.documentElement, c = (k, v) => r.classList.toggle(k, !!v), v = (k, x) => r.style.setProperty(k, x);
  // Game option1
  c('ko-maden-gizli', s.madenGizle);                 // Hide mine menu
  c('ko-gorev-yardim-ret', s.gorevYardim);           // Decline Quest Help → Quest tips ve görev ipuçları gizli
  v('--ko-buff-satir', String(Math.max(5, Math.min(40, Number(s.buffSatir) || 20))));   // Burfline Numbers: bir satırdaki güçlendirme simgesi
  // Game option2
  c('ko-skor-gizli', s.skorUI === false);            // Use Score UI (hasar / iyileşme yazıları)
  c('ko-skor-kalin', s.skorKalin !== false);
  v('--ko-skor-boy', (Number(s.skorBoy) || 20) + 'px');
  c('ko-tampon-kilit', s.tamponKilit2 === true);     // Lock / Unlock Buff Icon Bar
  c('ko-esya-seviye', s.ekTakas !== false);          // Preview Item Level (+N simge üstünde)
  // Effect option
  c('ko-klavye-ipucu-yok', s.klavyeIpucu === false); // Display Keyboard Tool-tip
  // Familiar
  c('ko-pet-balon-yok', !s.petBalon);
  v('--ko-pet-balon-alfa', String(1 - Math.max(0, Math.min(100, Number(s.petSaydam) || 0)) / 100));
  // Font option1 / 2
  v('--ko-id-boy', (Number(s.idBoy) || 12) + 'px'); c('ko-id-kalin', s.idKalin);
  v('--ko-klan-boy', (Number(s.klanBoy) || 12) + 'px'); c('ko-klan-kalin', s.klanKalin);
  v('--ko-ipucu-boy', (Number(s.ipucuBoy) || 11) + 'px'); c('ko-ipucu-kalin', s.ipucuKalin); c('ko-ipucu-saydam', s.ipucuArka);
  v('--ko-fisilti-boy', Math.max(9, Math.min(20, Number(s.fisiltiBoy) || 12)) + 'px');
  v('--ko-simge-boy', Math.max(8, Math.min(20, Number(s.simgeBoy) || 9)) + 'px');
  // HUD option
  c('ko-hud-gizli', s.hpAcik === false); c('ko-ana-hp-gizli', s.hpAna === false); c('ko-hud-ipucu-yok', s.hpIpucu === false);
  if (typeof hudCiz === 'function') setTimeout(hudCiz, 0);
}

// ---- View Option: kullanılan beceri simgesi ekranda süzülür (Size px, Moving Speed, Deleting Speed / Ratio)
let kap = null;
addEventListener('ko-yetenek-simge', (e) => {   // (4.11) tüm yetenekler (combat useSkill başarılı olunca)
  if (s.beceriSimge === false) return;
  const id = e.detail?.id; const Y = yetenekVerisi(); const sk = Y?.yetenekler?.[id]; const A = Y?.atlas; if (!sk || !A) return;
  const V = { boy: 40, hiz: 20, silHiz: 1, silOran: 7, ...(s.skVw || {}) };
  if (!kap?.isConnected) { kap = document.createElement('div'); kap.className = 'ko-beceri-izle'; document.body.append(kap); }
  const px = Math.max(16, Math.min(100, V.boy)), i = sk.ikon < 0 ? 0 : sk.ikon, k = px / A.boyut;
  const d = document.createElement('div'); d.className = 'kbi-simge';
  d.style.cssText = `width:${px}px;height:${px}px;background:url(./assets/yetenek/${A.dosya}) ${-(i % A.kolon) * px}px ${-Math.floor(i / A.kolon) * px}px / ${A.kolon * A.boyut * k}px auto no-repeat`;
  kap.append(d);
  { const b = window.__koBenEkran?.(); if (b) { kap.style.left = b.x + 'px'; kap.style.top = (b.y - px) + 'px'; } }
  // Moving Speed: yükselme hızı (px/sn) · Deleting Ratio: yolun hangi oranında silinmeye başlar (1–10 → %10–100) · Deleting Speed: sönme hızı
  const yol = 160, hiz = Math.max(5, V.hiz * 3), sure = yol / hiz * 1000, silBas = Math.min(0.95, V.silOran / 10), solma = Math.max(150, 1200 / Math.max(1, V.silHiz));
  const t0 = performance.now();
  const adim = (t) => {
    const p = (t - t0) / sure; if (!d.isConnected) return;
    { const b = window.__koBenEkran?.(); if (b) { kap.style.left = b.x + 'px'; kap.style.top = (b.y - px) + 'px'; } }   // (4.11) adın biraz üstünden başlar, karakteri izler
    d.style.transform = `translateY(${-p * yol}px)`;
    d.style.opacity = p < silBas ? '1' : String(Math.max(0, 1 - ((t - t0) - silBas * sure) / solma));
    if (p >= 1 || d.style.opacity === '0') { d.remove(); return; }
    requestAnimationFrame(adim);
  };
  requestAnimationFrame(adim);
  while (kap.children.length > 8) kap.firstChild.remove();
});

// ---- KO Looting option → Looting Effect (re_new_looting_option): eşya / Noah alınınca ekranda süzülen yazı.
// Item Looting Effect ON/OFF · Image Highlight Range (bu dereceden itibaren: Normal < Magic < Rare < Craft < Unique < Upgrade)
// · Blur Effect (High / Normal / None: yazı parıltısı) · Text Size
const DERECE = [0, 1, 2, 3, 4, 5];   // ItemType: 0 normal, 1 magic, 2 rare, 3 craft, 4 unique, 5 upgrade
let gkap = null;
addEventListener('ko-ganimet', async (e) => {
  const L = { acik: true, aralik: 0, blur: 1, boy: 20, ...(s.ganimet || {}) }; if (!L.acik) return;
  const d = e.detail || {};
  let metin = '', renk = '#ffb21e';
  if (d.para != null) metin = Number(d.para).toLocaleString('en-US');
  else {
    const tip = Number(d.it?.ItemType) || 0; const sira = tip > 5 ? 4 : DERECE.indexOf(tip) < 0 ? 0 : tip;
    if (sira < L.aralik) return;
    const E = await import('./esya.js'); renk = E.nameColor(d.it); metin = d.it?.strName || d.ad || '';
  }
  if (!metin) return;
  if (!gkap?.isConnected) { gkap = document.createElement('div'); gkap.className = 'ko-ganimet-yazi'; document.body.append(gkap); }
  const y = document.createElement('div'); y.className = 'kgy-satir' + (d.para != null ? ' kgy-para' : '');
  const parilti = [`0 0 10px ${renk}, 0 0 18px ${renk}`, `0 0 6px ${renk}`, 'none'][L.blur] || 'none';
  y.style.cssText = `color:${renk};font-size:${Math.max(10, Math.min(40, L.boy))}px;text-shadow:2px 2px 0 #000,${parilti}`;
  y.textContent = metin; gkap.append(y);
  setTimeout(() => y.classList.add('kgy-git'), 30); setTimeout(() => y.remove(), 2600);
  while (gkap.children.length > 6) gkap.firstChild.remove();
});

// ---- KO HUD option → Sub HP Bar (re_uisubhpbar): karakterin yanında dikey (ya da yatay) can / mana çubuğu.
// Show HUD (hpAcik) · Lock HUD (hpKilit: kilitli değilken sürüklenir, yer hatırlanır) · Orientation (hpYon h / v) · Classic Mode (hpOrijinal: ince, başlıksız)
// · Show HUD Tooltip (hpIpucu) · Show Main HP/MP (hpAna: sol üstteki ana çubuk)
let hb = null, sonDurum = null, HL = null, HLK = null, hlYukleniyor = false;
const HBK = 'ko-hud-cubuk-yer';
// KO re_uisubhpbar (Classic Mode: re_uisubhpbar_original) — orijinal dokular (assets/ui/hudbar); dikey group_ver / yatay group_hor,
// pro_*Hp can, pro_*Mp mana, pro_*Hpad can gecikme (azalan can arkada yavaşça iner), pro_*Vp gizli
async function hudKatman(klasik) {
  // (5.11) normal mod: KO re_uisubhpbar (mini_hp_bar_2020_a.dxt — altın uçlu koyu çerçeve, assets/ui/hudbar2); Classic Mode: re_uisubhpbar_original
  const ad = klasik ? 're_uisubhpbar_original' : 're_uisubhpbar_2020', paket = klasik ? 'hudbar' : 'hudbar2';
  if (HL && HLK === ad) return HL;
  if (hlYukleniyor) return null; hlYukleniyor = true;
  try {
    const K = await import('./kui.js');
    if (!(await K.ekUI(paket).catch(() => false)) || !K.hasLayout(ad)) return null;
    HL?.el.remove(); HL = K.buildLayout(ad, { className: 'ko-subhp' }); HLK = ad; hb.replaceChildren(HL.el);
    for (const y of ['ver', 'hor']) HL.show(`pro_${y}Vp`, false);
    return HL;
  } finally { hlYukleniyor = false; }
}
function hudKur() {
  hb = document.createElement('div'); hb.className = 'ko-hud-cubuk';
  // en arkada: oyun tuvalinin hemen ardına (diğer tüm arayüz katmanlarından önce) eklenir, z-index 0
  const cv = document.getElementById('sahne'); if (cv?.parentElement) cv.after(hb); else document.body.prepend(hb);
  let d = null;
  hb.addEventListener('pointerdown', (e) => {
    if (s.hpKilit !== false || e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const cs = getComputedStyle(hb); d = { x: e.clientX - parseFloat(cs.left), y: e.clientY - parseFloat(cs.top) };
    hb.setPointerCapture(e.pointerId);
  });
  hb.addEventListener('pointermove', (e) => { if (!d) return; hb.style.left = Math.max(0, Math.min(innerWidth - 20, e.clientX - d.x)) + 'px'; hb.style.top = Math.max(0, Math.min(innerHeight - 20, e.clientY - d.y)) + 'px'; });
  hb.addEventListener('pointerup', () => { if (!d) return; d = null; try { localStorage.setItem(hbAnahtar(), JSON.stringify({ x: parseFloat(hb.style.left), y: parseFloat(hb.style.top) })); } catch {} hbYon = null; });
  hb.addEventListener('dblclick', () => { if (s.hpKilit !== false) return; try { localStorage.removeItem(hbAnahtar()); } catch {} hbYon = null; });
}
let hpGecik = 1, hbYon = null;
// dikey ve yatay için ayrı kayıtlı yer; kayıt yoksa: dikey karakterin solunda (CSS), yatay karakterin altında ortalı (KO)
const hbAnahtar = () => HBK + (s.hpYon === 'h' ? '-yatay' : '');
function hbYerlestir(yatay) {
  let y = null; try { y = JSON.parse(localStorage.getItem(hbAnahtar()) || 'null'); } catch {}
  if (y && Number.isFinite(y.x) && Number.isFinite(y.y)) { hb.style.left = Math.max(0, Math.min(innerWidth - 30, y.x)) + 'px'; hb.style.top = Math.max(0, Math.min(innerHeight - 30, y.y)) + 'px'; return; }
  if (!yatay) { hb.style.left = ''; hb.style.top = ''; return; }
  const g = HL?.get?.('group_hor'); if (!g) return;
  hb.style.left = '0px'; hb.style.top = '0px';
  const r = g.getBoundingClientRect(), hr = hb.getBoundingClientRect();
  if (!r.width) { hbYon = null; return; }
  hb.style.left = Math.round(innerWidth / 2 - r.width / 2 - (r.left - hr.left)) + 'px';
  hb.style.top = Math.round(innerHeight / 2 + 195 - (r.top - hr.top)) + 'px';   // karakterin ayaklarının ~90 px altı
}
addEventListener('resize', () => { hbYon = null; });
function hudCiz() {
  sonDurum ||= globalThis.koSonDurum || null;   // modül ilk durum olayından sonra yüklendiyse çubuk yine görünür
  if (!hb) { if (s.hpAcik === false || !sonDurum) return; hudKur(); }
  hb.hidden = s.hpAcik === false || !sonDurum;
  const yatay = s.hpYon === 'h';
  hb.classList.toggle('khc-yatay', yatay); hb.classList.toggle('khc-acik', s.hpKilit === false);
  if (!sonDurum) return;
  const S = sonDurum, hp = Math.max(0, Math.min(1, (S.hp || 0) / (S.max_hp || 1))), mp = Math.max(0, Math.min(1, (S.mp || 0) / (S.max_mp || 1)));
  hpGecik = hp >= hpGecik ? hp : Math.max(hp, hpGecik - 0.02);
  hb.title = s.hpIpucu === false ? '' : `HP ${Number(S.hp || 0).toLocaleString('en-US')} / ${Number(S.max_hp || 0).toLocaleString('en-US')}\nMP ${Number(S.mp || 0).toLocaleString('en-US')} / ${Number(S.max_mp || 0).toLocaleString('en-US')}`;
  const L = HL;
  if (!L || HLK !== (s.hpOrijinal ? 're_uisubhpbar_original' : 're_uisubhpbar_2020')) { hudKatman(!!s.hpOrijinal).then((x) => { if (x) { hbYon = null; hudCiz(); } }); if (!L) return; }
  L.show('group_ver', !yatay); L.show('group_hor', yatay);
  const yk = (yatay ? 'h' : 'v') + (s.hpKilit === false ? 'a' : '');
  if (hbYon !== yk && !hb.hidden) { hbYon = yk; hbYerlestir(yatay); }
  const y = yatay ? 'hor' : 'ver';
  L.progress(`pro_${y}Hp`, hp); L.progress(`pro_${y}Hpad`, hpGecik); L.progress(`pro_${y}Mp`, mp);
}
addEventListener('ko-durum', (e) => { sonDurum = e.detail; hudCiz(); });
setInterval(hudCiz, 250);
