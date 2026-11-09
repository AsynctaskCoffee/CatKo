// Seçenekler penceresi (O / görev çubuğu → Seçenekler). Ayarlar tarayıcıda saklanır (localStorage "ko-ayar").
import { MODES } from './post.js';
import { koWindow, toFront } from './ko-pencere.js';
import { KO_VARSAYILAN } from './secenek-ko.js';

export const DEFAULTS = {
  ui: 100,            // arayüz ölçeği % (50–150): tüm arayüz tek parça (çubuklar, sohbet, işlem bilgileri, pencereler)
  quality: 'yuksek',  // görüntü kalitesi
  mode: 'klasik',     // görünüm modu (varsayılan Klasik KO: oyunun kendi canlı renkleri)
  bright: 100, blur: 0, sharp: 0, clarity: 0, r: 100, g: 100, b: 100,   // r/g/b: renk kanalı kazancı %
  muzik: 60, muzikAcik: true,   // KO bölge müziği (muzik.js)
  efektSes: 80, efektSesAcik: true,   // KO ses efektleri (ses.js: vuruş, yetenek, iksir, ayak sesi)
  // DirectX (KO Option: DX-9 / DX-11). DX-11: HDR ton eşleme, ışık parlaması, atmosferik pus, yumuşak gölge
  dx: 'dx9', dxTone: true, dxBloom: 45, dxHaze: 40,   // (7.11) herkes DX-9 ile başlar (sunucu standardı ayar_standart da dx9, bulanıklık 0)
  golge: true, golgeGuc: 45, aniso: 8, mesafe: 'yakin',   // görüş mesafesi: ayardan kaldırıldı, her zaman yakın
  fx: { water: true, wind: true, yaprak: true, clouds: true, fog: true, names: true, monsterNames: true, gmGlow: true },
  ...KO_VARSAYILAN,   // KO Seçenekler (re_seed_helper) — KnightOnlineEn Option.ini varsayılanları
};
// görüntü ayarları: pencerede yok, herkes için standart (sunucu ayar_standart — AugusteRodin'in görüntü ayarı)
export const STANDART_ANAHTAR = ['quality', 'mode', 'bright', 'blur', 'sharp', 'clarity', 'r', 'g', 'b', 'dx', 'dxTone', 'dxBloom', 'dxHaze', 'golge', 'golgeGuc', 'aniso'];
const STANDART_FX = ['water', 'wind', 'yaprak', 'clouds', 'fog', 'gmGlow'];
let STANDART = null;
try { STANDART = JSON.parse(localStorage.getItem('ko-ayar-standart2') || 'null'); } catch {}

const QUALITY = {
  // (6.11) düşük / orta: ekran çözünürlüğünde (1 CSS pikseli = 1 çizim pikseli) — önceden 0,6 / 0,8 ölçekle çizilip büyütülüyordu → Lowest Spec Mode'da ekran bulanıktı.
  //   Kazanç kenar yumuşatma (AA) kapanmasından ve yüksek DPI ekranlarda fazladan piksel çizilmemesinden gelir; KO'daki gibi düşük ayar keskin kalır.
  dusuk: { label: 'Düşük', ratio: () => Math.min(devicePixelRatio || 1, 2), aa: false },   // (7.11) her kalitede ekranın kendi çözünürlüğü: bulanıklık yok
  orta: { label: 'Orta', ratio: () => Math.min(devicePixelRatio || 1, 2), aa: false },
  yuksek: { label: 'Yüksek', ratio: () => Math.min(devicePixelRatio || 1, 2), aa: true },
  ultra: { label: 'Çok yüksek', ratio: () => Math.min(devicePixelRatio || 1, 2), aa: true },
};
const FX = [
  ['water', 'Su dalgaları'], ['wind', 'Bitki ve ağaç salınımı'], ['yaprak', 'Düşen yapraklar'], ['clouds', 'Bulutlar'], ['fog', 'Sis'],
  ['names', 'Oyuncu isimleri'], ['monsterNames', 'Canavar isimleri'], ['gmGlow', '<GM> parıltısı'],
];
const KEY = 'ko-ayar';
const ANISO = { dx9: [1, 2, 4], dx11: [1, 2, 4, 8, 16] };

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  if (s.mode && !MODES[s.mode]) s.mode = 'normal';   // kaldırılan mod (8K) → Normal
  s.mesafe = 'yakin';   // görüş mesafesi sabit: yakın (eski kayıtlı değerler yok sayılır)
  // (5.11) yeni Sub HP Bar (re_uisubhpbar_2020): eski kayıtlarda kalan Classic Mode bir kez kapatılır (tüm karakter / tarayıcılarda yeni sürüm)
  // (5.11) Font option1 herkes için standart: Clan L (14), ID M (12), yazı boyu 13 — eski kayıtlar bir kez bu değerlere çekilir
  if (s.fontSurum !== 1) { s.klanBoy = 14; s.idBoy = 12; s.ipucuBoy = 13; s.fontSurum = 1; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
  if (s.hpSurum !== 2) { s.hpOrijinal = false; s.hpSurum = 2; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
  const o = { ...DEFAULTS, ...s, fx: { ...DEFAULTS.fx, ...(s.fx || {}) } };
  standartUygula(o);
  return o;
}
function standartUygula(o) {
  if (!STANDART) return o;
  for (const k of STANDART_ANAHTAR) if (STANDART[k] !== undefined) o[k] = STANDART[k];
  for (const k of STANDART_FX) if (STANDART.fx?.[k] !== undefined) o.fx[k] = STANDART.fx[k];
  return o;
}
const standartOf = (o) => { const r = { fx: {} }; for (const k of STANDART_ANAHTAR) r[k] = o[k]; for (const k of STANDART_FX) r.fx[k] = o.fx?.[k]; return r; };
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

/** ctx: { renderer, post, applyWorld(s) } — applyWorld görüş mesafesi, sis, efekt ve isimleri uygular */
export function initSettings(ctx) {
  let s = loadSettings();
  const apply = () => {
    const q = QUALITY[s.quality] || QUALITY.yuksek;
    // arayüz ölçeği: tüm KO arayüz katmanı (#kohud) tek parça büyür/küçülür; 100'de ekran boyutuna göre otomatik (CSS)
    s.ui = Math.max(50, Math.min(150, Number(s.ui) || 100));
    document.documentElement.style.setProperty('--ui', '1');
    { const kh = document.getElementById('kohud'); if (kh) kh.style.zoom = s.ui !== 100 ? String(s.ui / 100) : ''; }
    ctx.relayout?.();
    window.__koPR = q.ratio(); ctx.renderer.setPixelRatio(window.__koPR);   // uyarlamalı çözünürlüğün tavanı
    ctx.post.set({ ...s, aa: q.aa });
    ctx.applyWorld?.(s, q);
    dispatchEvent(new Event('resize'));
  };
  apply();
  // KO seçeneklerinin etkileri: sohbet / bilgi penceresi gizleme, canavar adları, müzik
  const koUygula = () => {
    const r = document.documentElement;
    r.classList.toggle('ko-sohbet-gizli', !!s.sohbetGizle); r.classList.toggle('ko-bilgi-gizli', !!s.bilgiGizle);
    r.style.setProperty('--ko-sohbet-boy', (s.sohbetBoy || 10) + 'pt'); r.style.setProperty('--ko-mesaj-boy', (s.mesajBoy || 10) + 'pt');
    window.koSecenek = s;
    import('./secenek-etki.js').then((M) => M.uygula(s)).catch(() => {});   // Seçenekler → oyundaki etkiler (sınıflar, CSS değişkenleri)
  };
  koUygula();
  // standart görüntü ayarı (sunucu): AugusteRodin'in mevcut ayarı ilk kez yüklenir; herkes onu kullanır
  (async () => {
    const sb = ctx.sb; if (!sb) return;
    const { data } = await sb.from('ayar_standart').select('ayar').eq('id', 1).maybeSingle();
    if (data?.ayar) {
      STANDART = data.ayar; try { localStorage.setItem('ko-ayar-standart2', JSON.stringify(STANDART)); } catch {}
      standartUygula(s); apply();
    } else if (ctx.character?.name === 'AugusteRodin') {
      const st = standartOf(s); const r = await sb.rpc('ayar_standart_kaydet', { p_char: ctx.character.id, p_ayar: st });
      if (r.data?.ok) { STANDART = st; try { localStorage.setItem('ko-ayar-standart2', JSON.stringify(st)); } catch {} }
    }
  })().catch(() => {});
  // KO seçenek penceresi (re_seed_helper); yerleşim yoksa eski pencere
  let koPen = null;
  const koPencere = () => (koPen ||= import('./secenek-ko.js').then(async (M) => {
    if (!(await M.secenekHazir())) return null;
    return M.secenekKO({ ayar: () => s, sb: ctx.sb, character: ctx.character, state: ctx.state, hud: ctx.hud,
      kaydet: (patch) => { const eskiMz = [s.muzik, s.muzikAcik]; Object.assign(s, patch);
        // grafik ayarları sunucu standardıdır: AugusteRodin değiştirince standart güncellenir (herkes aynı görüntüyü kullanır)
        if (ctx.character?.name === 'AugusteRodin' && Object.keys(patch || {}).some((k) => STANDART_ANAHTAR.includes(k))) { STANDART = standartOf(s); try { localStorage.setItem('ko-ayar-standart2', JSON.stringify(STANDART)); } catch {} ctx.sb?.rpc('ayar_standart_kaydet', { p_char: ctx.character.id, p_ayar: STANDART }).then(() => {}, () => {}); }
        standartUygula(s); save(s); apply(); koUygula();
        if (eskiMz[0] !== s.muzik || eskiMz[1] !== s.muzikAcik) import('./muzik.js').then((Mz) => Mz.muzikAyarla()).catch(() => {});
        if ('pencere' in patch) { if (!s.pencere) document.documentElement.requestFullscreen?.().catch(() => {}); else if (document.fullscreenElement) document.exitFullscreen?.(); }
        if ('mobBalon' in patch) { s.fx.monsterNames = !!s.mobBalon; save(s); apply(); } } });
  }).catch(() => null));

  // ---- pencere
  const el = document.createElement('div'); el.id = 'ayarlar'; el.className = 'ko-panel ko-pencere'; el.hidden = true;
  el.innerHTML = `
    <div class="ay-baslik">Seçenekler</div><button class="ko-kapat ay-kapat" title="Kapat"></button>
    <div class="ay-sekmeler"><button data-s="arayuz" class="secili">Arayüz</button><button data-s="goruntu">Görüntü</button><button data-s="efekt">Efektler</button><button data-s="ses">Ses</button></div>
    <section data-s="arayuz">
      <label>Arayüz ölçeği <b data-v="ui"></b><input type="range" min="50" max="150" step="5" data-k="ui"></label>
      <p class="ay-not">Tüm arayüz (çubuklar, sohbet, işlem bilgileri ve pencereler) birlikte büyür/küçülür (en fazla %150).</p>
      <button class="ay-dugme" data-yap="kisayol">Kısayol çubuğunu yerine koy</button>
    </section>
    <section data-s="goruntu" hidden>
      <label>Görüntü modu (DirectX)<select data-k="dx"><option value="dx11">DirectX 11 (gerçekçi, atmosferik)</option><option value="dx9">DirectX 9 (klasik KO)</option></select></label>
      <p class="ay-not" data-dxnot></p>
      <label class="ay-onay"><input type="checkbox" data-b="golge"> Karakter gölgeleri</label>
      <label>Gölge yoğunluğu <b data-v="golgeGuc"></b><input type="range" min="10" max="100" step="5" data-k="golgeGuc"></label>
      <label>Anizotropik doku süzme<select data-k="aniso" data-sayi></select></label>
      <div data-dx11>
        <label class="ay-onay"><input type="checkbox" data-b="dxTone"> HDR ton eşleme (film eğrisi)</label>
        <label>Işık parlaması (bloom) <b data-v="dxBloom"></b><input type="range" min="0" max="100" step="5" data-k="dxBloom"></label>
        <label>Atmosferik pus <b data-v="dxHaze"></b><input type="range" min="0" max="100" step="5" data-k="dxHaze"></label>
      </div>
      <label>Görüntü kalitesi<select data-k="quality">${Object.entries(QUALITY).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      <label>Görünüm modu<select data-k="mode">${Object.entries(MODES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      <label>Parlaklık <b data-v="bright"></b><input type="range" min="60" max="140" step="5" data-k="bright"></label>
      <label>Keskinlik <b data-v="sharp"></b><input type="range" min="0" max="100" step="5" data-k="sharp"></label>
      <label>Netlik <b data-v="clarity"></b><input type="range" min="0" max="100" step="5" data-k="clarity"></label>
      <label>Bulanıklık (blur) <b data-v="blur"></b><input type="range" min="0" max="100" step="5" data-k="blur"></label>
      <div class="ay-rgb"><span>Renk ayarı (R-G-B)</span><label class="ay-renk" title="Renk tonunu seç (orta gri = normal)"><input type="color" data-rgb></label><b class="ay-rgb-deger"></b><button class="ay-dugme" data-yap="rgb">Sıfırla</button></div>
      <button class="ay-dugme" data-yap="tamekran">Tam ekran aç / kapat</button>
    </section>
    <section data-s="ses" hidden>
      <label class="ay-onay"><input type="checkbox" data-mz> Müzik açık</label>
      <label>Müzik sesi <b data-v="muzik"></b><input type="range" min="0" max="100" step="5" data-k="muzik"></label>
      <p class="ay-not">Bulunduğun bölgenin KO müziği çalar (Moradon, Ardream, kaleler…).</p>
      <label class="ay-onay"><input type="checkbox" data-b="efektSesAcik"> Efekt sesleri açık</label>
      <label>Efekt sesi <b data-v="efektSes"></b><input type="range" min="0" max="100" step="5" data-k="efektSes"></label>
      <p class="ay-not">KO vuruş, darbe, ölüm, yetenek, iksir, ayak ve arayüz sesleri.</p>
    </section>
    <section data-s="efekt" hidden>
      ${FX.map(([k, t]) => `<label class="ay-onay"><input type="checkbox" data-fx="${k}"> ${t.replace('<', '&lt;').replace('>', '&gt;')}</label>`).join('')}
    </section>
    <div class="ay-alt"><button class="ay-dugme" data-yap="standart">Standart</button><button class="ay-dugme" data-yap="kapat">Tamam</button></div>`;
  (document.getElementById('kohud') || document.getElementById('hud') || document.body).append(el);
  koWindow(el);   // KO çerçevesi, altın başlık plakası, KO kapat düğmesi

  const fmt = { golgeGuc: (v) => v + '%', dxBloom: (v) => v + '%', dxHaze: (v) => v + '%', muzik: (v) => v + '%', efektSes: (v) => v + '%', r: (v) => v + '%', g: (v) => v + '%', b: (v) => v + '%', ui: (v) => v + '%', bright: (v) => v + '%', sharp: (v) => v + '%', clarity: (v) => v + '%', blur: (v) => v + '%' };
  // tek renk seçici → R/G/B kazancı: her kanal 0-255 → %50-150 (orta gri #808080 = %100)
  const hex2 = (v) => Math.round((Math.max(50, Math.min(150, v)) - 50) / 100 * 255).toString(16).padStart(2, '0');
  const fill = () => {
    const dx11 = s.dx !== 'dx9', an = el.querySelector('[data-k="aniso"]');
    if (an) { const L = ANISO[dx11 ? 'dx11' : 'dx9']; if (!dx11 && s.aniso > 4) s.aniso = 4; an.innerHTML = L.map((v) => `<option value="${v}">${v === 1 ? 'Kapalı' : v + 'x'}</option>`).join(''); }
    el.querySelectorAll('[data-dx11]').forEach((d) => (d.hidden = !dx11 || s.mode === 'klasik'));   // Klasik KO: DX-11 ekran efektleri kullanılmaz
    const dn = el.querySelector('[data-dxnot]'); if (dn) dn.textContent = dx11
      ? 'DirectX 11: HDR ton eşleme, ışık parlaması, atmosferik mavi pus, yumuşak ve güneşe göre uzayan karakter gölgeleri, 16x doku süzme.'
      : 'DirectX 9: klasik KO görüntüsü — ek ekran efekti yok, yuvarlak karakter gölgeleri, en fazla 4x doku süzme (daha hızlı).';
    el.querySelectorAll('[data-b]').forEach((i) => { i.checked = s[i.dataset.b] !== false; });
    el.querySelectorAll('[data-k]').forEach((i) => { i.value = s[i.dataset.k]; });
    el.querySelectorAll('[data-v]').forEach((b) => { b.textContent = fmt[b.dataset.v]?.(s[b.dataset.v]) ?? s[b.dataset.v]; });
    el.querySelectorAll('[data-fx]').forEach((i) => { i.checked = !!s.fx[i.dataset.fx]; });
    el.querySelectorAll('[data-mz]').forEach((i) => { i.checked = s.muzikAcik !== false; });
    const rc = el.querySelector('[data-rgb]'); if (rc && document.activeElement !== rc) rc.value = '#' + hex2(s.r ?? 100) + hex2(s.g ?? 100) + hex2(s.b ?? 100); if (rc) rc.parentElement.style.background = rc.value;
    const rd = el.querySelector('.ay-rgb-deger'); if (rd) rd.textContent = `R ${s.r ?? 100}% · G ${s.g ?? 100}% · B ${s.b ?? 100}%`;
  };
  fill();
  const changed = () => { save(s); apply(); fill(); };
  el.addEventListener('input', (e) => {
    const k = e.target.dataset.k, f = e.target.dataset.fx;
    if (k) s[k] = e.target.type === 'range' || e.target.dataset.sayi != null ? Number(e.target.value) : e.target.value;
    if (e.target.dataset.b) { s[e.target.dataset.b] = e.target.checked; changed(); return; }
    if (f) s.fx[f] = e.target.checked;
    if (e.target.dataset.rgb != null) { const h = e.target.value.replace('#', ''); const ch = (i) => Math.round(50 + parseInt(h.slice(i, i + 2), 16) / 255 * 100); s.r = ch(0); s.g = ch(2); s.b = ch(4); e.target.parentElement.style.background = e.target.value; changed(); return; }
    if (e.target.dataset.mz != null) s.muzikAcik = e.target.checked;
    if (k || f || e.target.dataset.mz != null) changed();
    if (k === 'muzik' || e.target.dataset.mz != null) import('./muzik.js').then((M) => M.muzikAyarla()).catch(() => {});
  });
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.classList.contains('ay-kapat') || t.dataset.yap === 'kapat') el.hidden = true;
    if (t.dataset.s) {
      el.querySelectorAll('.ay-sekmeler button').forEach((b) => b.classList.toggle('secili', b === t));
      el.querySelectorAll('section').forEach((sec) => (sec.hidden = sec.dataset.s !== t.dataset.s));
    }
    if (t.dataset.yap === 'standart') { s = structuredClone(DEFAULTS); changed(); import('./muzik.js').then((M) => M.muzikAyarla()).catch(() => {}); }
    if (t.dataset.yap === 'rgb') { s.r = s.g = s.b = 100; changed(); }
    if (t.dataset.yap === 'tamekran') { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
    if (t.dataset.yap === 'kisayol') { try { localStorage.removeItem('ko-kisayol'); } catch {} ctx.resetHotkey?.(); }
  });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('keydown', (e) => e.stopPropagation());
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Escape' && !el.hidden) { el.hidden = true; e.stopImmediatePropagation(); }
  }, true);
  const ac = () => { el.hidden = false; koWindow(el); toFront(el); el.style.zIndex = Math.max(Number(el.style.zIndex) || 0, 4100); };
  const eskiAc = ac;
  const koAc = (gecis) => koPencere().then((p) => { if (!p) { if (gecis) { if (el.hidden) eskiAc(); else el.hidden = true; } else eskiAc(); return; } if (gecis) p.toggle(); else p.ac(); });
  // KO: görev menüsü (Q / sol alttaki Seed simgesi) aynı pencerenin Mission sekmesi
  const gorevAc = () => koPencere().then((p) => { if (p) p.toggle('btn_questlist'); return !!p; });
  window.koSeedGorev = () => koPencere().then((p) => p?.ac('btn_questlist'));   // Quest tips ● düğmesi
  return { open() { koAc(false); return true; }, toggle() { koPencere().then((p) => { if (p) p.toggle('btn_option'); else koAc(true); }); return true; }, gorev: gorevAc, get: () => s };
}
