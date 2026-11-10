// KO Web Client — v0: bölge yükleme, arazi, yürüme, kamera, mini harita
import { emoYaz } from './emoticon.js';
import { kurOyunSaati, gmSaat, oyunSaatiDegisti, koSaat } from './oyun-saati.js';
import './arkaplan.js';   // gizli sekmede oyun sürer (worker zamanlayıcı) — ilk yüklenmeli
import './tarayici-kilidi.js';
import * as THREE from '../vendor/three.module.min.js';
import { loadZone, buildTerrain, makeHeightFn, makeNormalFn, yuzeyYukle } from './terrain.js';
import { Collision, moveStep } from './collision.js';
import { loadObjects } from './objects.js';
import { loadWater } from './water.js';
import { loadSky, buildSky } from './sky.js';
import { hud, relayout } from './hud.js';
import { createPost } from './post.js';
import { initSettings, loadSettings } from './ayarlar.js';
import { loadCharacterMeta, createCharacter } from './character.js';
import { pelerinUygula } from './pelerin.js';
import { sesDinleyici, sesAdim, sesCal, sesFxVar } from './ses.js';
import { createGolgeler } from './golge.js';
import { boyutUygula, donusumGorsel, initDonusum, DONUSUM_ESYA, donusumGorunur, donusumFxAyarla, donusumGiydir } from './donusum.js';
// (2.11) sohbet sıralama sembolü atlası oyun açılırken önceden iner (ilk sohbet satırında sembol geç belirmesin)
{ const im = new Image(); im.src = './assets/ui/rutbe-orj.webp'; im.decode?.().catch(() => {}); window.__koRutbeAtlas = im; }
donusumFxAyarla(() => state.fx);

const params = new URLSearchParams(location.search);
// Netlify/Supabase sürümünde oyun.html → boot.js oturumu ve karakteri hazırlar
const BOOT = window.KO_BOOT ? await window.KO_BOOT : null;
if (BOOT?.sb) import('./mob-drop.js').then((m) => m.mobDropKur(BOOT.sb)).catch(() => {});
if (BOOT?.sb) Promise.resolve(BOOT.sb.from('items').select('num').eq('category', 'beta')).then(({ data }) => (data || []).map((r) => r.num), () => [])
  .then((l) => import('./esya.js').then((m) => m.betaEsyaAyarla(l)));   // BETA eşyaları (ayrı eşyalar, category 'beta'): ipucunda [BETA EŞYASI]; normal eşyalar etkilenmez
if (BOOT?.sb) BOOT.sb.from('kostum_bonus').select('*').then(({ data }) => import('./esya.js').then((m) => m.kostumBonusAyarla(data)), () => {});   // kostüm efektleri ipucunda
if (BOOT?.character) hud.nation(BOOT.character.nation);
if (BOOT?.character?.name) import('./esya.js').then((m) => m.kendiAdAyarla(BOOT.character.name));   // <selfname>'s eşyalarda kendi adın
// kask gizleme (envanter tikleri): normal kask (yuva 1) / kostüm kaskı (yuva 42) görünümden çıkarılır — diğer oyuncular da öyle görür
const kaskGizle = () => { try { return JSON.parse(localStorage.getItem('ko-kask-gizle') || '{}'); } catch { return {}; } };
const kaskFiltre = (eq) => { const g = kaskGizle(); return eq.filter((e) => { const sl = Number(e.slot); return !(g.kask && sl === 1) && !(g.kostum && sl === 42) && !(g.peri && sl === 48) && !(g.tilsim && sl === 91) && !(g.kanat && sl === 47) && !(g.amblem && sl === 92); }); };   // + peri / tılsım / kanat / amblem gizleme tikleri
addEventListener('ko-kask-gizle', async () => {
  await state.gearReady; const D = state.donanim; if (!D || !state.sonEq || !state.avatar) return;
  state.gear = D.gearCodes(kaskFiltre(state.sonEq)); const race = BOOT?.character?.race;
  Promise.resolve(D.applyGear(state.avatar, race, state.gear)).then(() => donusumGiydir(state.avatar, state.gear)); if (inv?.api) D.applyGear(inv.api, race, state.gear);
  state.net?.setGear?.(state.gear);
});
// tek oturum: aynı hesap iki sekmede / iki tarayıcıda aynı anda oynayamaz
const SESSION = BOOT?.sb && BOOT.character ? await (async () => {
  const token = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const kick = (msg) => {
    if (window.__koKopuk || window.__koKicked) return;   // bağlantı kopma penceresi zaten açık: ikinci (yanıltıcı) uyarı çıkmaz
    try { window.__koKicked = true; } catch {}
    try { state?.net?.halt?.(); state?.baglanti?.dur?.(); } catch {}
    const k = hud?.koKutu?.({ baslik: 'Session', metin: msg, buton: 'OK', onButon: () => { location.href = 'index.html'; } });
    if (k) return;
    const d = document.createElement('div'); d.id = 'oturum-uyari';
    d.innerHTML = `<div class="ko-panel"><div class="ou-baslik">Session</div><p>${msg}</p><button class="ko-btn">OK</button></div>`;
    document.body.append(d); d.querySelector('button').onclick = () => { location.href = 'index.html'; };
    try { state?.net?.halt?.(); } catch {}
  };
  let kanal = 1; try { kanal = Math.max(1, Number(sessionStorage.getItem('ko-kanal') || localStorage.getItem('ko-kanal')) || 1); } catch {}
  if (['freezone_a', 'freezone_b', 'freezone_c'].includes(BOOT.character.zone)) kanal = 1;   // Ardream / RL / RLB tek kanal
  const { error } = await BOOT.sb.rpc('session_claim', { p_char: BOOT.character.id, p_token: token, p_kanal: kanal, p_zorla: true });   // yeni giriş eski oturumu atar
  if (error) { kick(error.message); await new Promise(() => {}); }   // oyun yüklenmez
  const uid = (await BOOT.sb.auth.getUser()).data?.user?.id;
  // oturum yoklaması: 5 sn'de bir; GM /dc ya da başka yerden giriş → sunucu nedeni döner, oyun kapanır
  let pingBitti = false;
  const pingYap = async () => {
    if (pingBitti) return;
    let data = null, e = null;
    try { ({ data, error: e } = await BOOT.sb.rpc('session_ping2', { p_token: token })); } catch (x) { return; }   // ağ hatası: bir sonraki yoklamada tekrar
    if (!e && data && data.ok === false && data.sebep === 'yok' && !pingBitti) {
      // oturum kaydı internet kesintisi yüzünden silinmiş (başka giriş yok): aynı oturumla sessizce yeniden bağlan
      const { error: e2 } = await BOOT.sb.rpc('session_claim', { p_char: BOOT.character.id, p_token: token, p_kanal: kanal, p_zorla: false }).then((r) => r, (x) => ({ error: x }));
      if (!e2) return;
      if (/fetch|network|load failed|timeout/i.test(String(e2?.message || e2))) return;   // hâlâ ağ yok: bir sonraki yoklamada tekrar
      pingBitti = true; clearInterval(ping); kick(/başka bir yerde/i.test(String(e2.message)) ? 'Your account has been logged in from another location. Your character has been disconnected.' : 'The connection to the server has been lost. Please check your internet connection.'); return;
    }
    if (!e && data && data.ok === false && !pingBitti) { pingBitti = true; clearInterval(ping); kick(data.mesaj || 'You have been disconnected from the game.'); }
  };
  const ping = setInterval(pingYap, 5000);
  // aynı tarayıcının başka sekmesinde başka hesaba geçilir ya da çıkış yapılırsa bu sekme de kapanır
  BOOT.sb.auth.onAuthStateChange((ev, sess) => {
    if (ev === 'SIGNED_OUT' || (sess?.user?.id && uid && sess.user.id !== uid)) { clearInterval(ping); kick('Another account was signed in or you signed out in this browser. The game has been closed.'); }
  });
  // sekme/pencere kapanınca oturum hemen silinir: sayfa kapanırken de tamamlanan (keepalive) istek → diğer oyuncularda ve sunucu listesinde oyuncu kalmaz
  let erisim = null;
  BOOT.sb.auth.getSession().then(({ data }) => { erisim = data?.session?.access_token || null; }).catch(() => {});
  BOOT.sb.auth.onAuthStateChange((_ev, sess) => { if (sess?.access_token) erisim = sess.access_token; });
  let birakildi = false;
  const birak = () => {
    if (birakildi) return; birakildi = true;
    try { state?.net?.ayril?.(); } catch {}
    const url = BOOT.sb.supabaseUrl || BOOT.sb.restUrl?.replace(/\/rest\/v1$/, ''), key = BOOT.sb.supabaseKey;
    if (url && key && erisim) {
      try { fetch(`${url}/rest/v1/rpc/session_release`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + erisim }, body: JSON.stringify({ p_token: token }) }); return; } catch {}
    }
    BOOT.sb.rpc('session_release', { p_token: token });
  };
  addEventListener('pagehide', (e) => { if (!e.persisted) birak(); });
  addEventListener('beforeunload', birak);
  return { token, pingYap };
})() : null;
// GM listesi (isim üstünde <GM> etiketi için; sunucu tablosu — istemci bildirimine güvenilmez)
const GMS = new Set();
if (BOOT?.sb) { try { const { data } = await BOOT.sb.from('gms').select('char_id'); data?.forEach((r) => GMS.add(Number(r.char_id))); } catch {} }
const ZONE = (BOOT?.character?.zone || params.get('bolge') || 'moradon').replace(/[^a-z0-9_]/gi, '');
// KO klan görev arenaları (deadsoft Zones.tbl 54 / 93 / 94): her klana ayrı örnek "klanq_<boss>_<klan>"; harita dosyası ortak
const KLAN_ARENA = { caitharos: ['clanfight_b', 'Caitharos Arena'], isiloon: ['dungeon_b2th', 'Isiloon Arena'], felankor: ['dragon_a', 'Felankor Arena'] };
// Monster Stone yuvaları: her oyuncuya ayrı örnek "ms<harita>_<aile>_<karakter>"; harita dosyası In_dungeon01/02/03
const MS_YUVA = /^ms([1-3])_(\d+)_/.exec(ZONE);
const ARENA = ZONE.startsWith('klanq_') ? KLAN_ARENA[ZONE.split('_')[1]] || null : MS_YUVA ? ['in_dungeon0' + MS_YUVA[1], 'Monster Stone'] : null;
const HARITA = ARENA ? ARENA[0] : ZONE;
if (ARENA) hud.zone(ARENA[1], ZONE); else if (ZONE !== 'moradon') hud.zone(ZONE, ZONE);
// bölge bilgisi: ad + GM'in belirlediği başlangıç (ışınlanma) noktası
const PVP_BOLGE = /^(freezone|battlezone|bat_|war_|clanfight|eslant|ronark|cz|delos|bifrost|juraid)/i.test(ZONE);
const ZONE_INFO = BOOT?.sb ? BOOT.sb.from('zones').select('name,start_x,start_z').eq('id', ZONE).maybeSingle().then(({ data }) => { if (data?.name && ZONE !== 'moradon' && !ARENA) hud.zone(data.name, ZONE); return data; }, () => null) : Promise.resolve(null);
// Eslant: meydanın batısındaki taş kapıya (portal 441 / 556) 5 m yaklaşan oyuncu kendi kalesine ışınlanır (Karus → Luferson, El Morad → El Morad Castle)
let eslantKapiMesgul = false, eslantKapiSon = 0;
function eslantKapi() {
  if (ZONE !== 'eslantzone' || eslantKapiMesgul || !BOOT?.sb || !BOOT?.character) return;
  const p = player.position; if (Math.hypot(p.x - 445, p.z - 556) > 5) return;   // kapının önü (portal 441 / 556, kapı ağzı ~445)
  if (performance.now() - eslantKapiSon < 3000) return;
  eslantKapiMesgul = true; eslantKapiSon = performance.now();
  BOOT.sb.rpc('eslant_kapi', { p_char: BOOT.character.id, p_x: p.x, p_z: p.z }).then(({ data: d, error }) => {
    if (error || !d?.ok) { hud.notice?.(d?.mesaj || error?.message || 'Teleport failed.', 'hata'); eslantKapiMesgul = false; return; }
    hud.info?.(`Teleporting to ${d.ad}…`, 'beceri');
    try { state.efekt?.(Number(BOOT.character?.nation) === 2 ? 10047 : 10046, p, { follow: () => p }); } catch {}   // (5.11) KO warp efekti + warp_zone sesi
    state.net?.halt?.(); const u = new URL(location.href); for (const k of ['x', 'z', 'bolge']) u.searchParams.delete(k); u.searchParams.set('karakter', BOOT.character.id);
    setTimeout(() => location.replace(u.toString()), 500);
  }, () => { eslantKapiMesgul = false; });
}
// Moradon sitenin içinde gelir; diğer haritalar Supabase Storage'daki "zones" kovasından yüklenir
const LOCAL_ZONES = new Set();   // Moradon da Storage'da (yeni KO 2369 Moradon haritası, 2026-10)
const REMOTE_ZONES = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? './zones' : (window.KO_DEMO ? './zones' : 'https://vnlevnlsyyqkofnplzdm.supabase.co/storage/v1/object/public/zones'));   // yerel kurulum (localhost): harita dosyaları site/zones klasöründen
const ASSETS = params.get('assets') || (LOCAL_ZONES.has(HARITA) ? './assets/zones' : REMOTE_ZONES);
const CHR_ASSETS = params.get('chr') || './assets/chr';

const $ = (id) => document.getElementById(id);
let koYukleme = null;
const status = (t, p) => {
  $('yukleniyor-yazi').textContent = t;
  if (koYukleme) { koYukleme.L.text('Text_Info', t); koYukleme.hedef = Math.min(0.97, p != null ? Math.max(koYukleme.hedef, p) : koYukleme.hedef + 0.06); }
};
if (BOOT?.character) $('yukleniyor').classList.add('ko-yukle');   // genel "Knight Online" kutusu hiç görünmez; doğrudan ulus yükleme ekranı
// Yeni nesil yükleme ekranı (KO 2369 / deadsoft yükleme resimleri: 16th Anniversary, Lost, Kurian, Orc): tam ekran resim
// (oran korunur, boşluklar aynı resmin bulanık hâliyle dolar), altta KO kırmızı yükleme çubuğu (loadingbar.dxt), yüzde ve durum yazısı.
// (Launcher görünümü yalnız oyunu ilk başlatırken: launcher.html)
if (BOOT?.character) (() => {
  try {
    const y = $('yukleniyor'); if (y.classList.contains('bitti')) { y.classList.remove('ko-yukle'); return; }
    const n = Math.floor(Math.random() * 14), src = (window.KO_V || ((u) => u))(`./assets/ui/yukleme/yukleme2022_${String(n).padStart(2, '0')}.jpg`);   // orijinal KO re_loadingscreen2022 (loadingscreen2022_00…13, rastgele biri)
    const el = document.createElement('div'); el.className = 'ko-yeni-yukleme';
    el.innerHTML = `<div class="yy-arka" style="background-image:url(${src})"></div><img class="yy-resim" src="${src}" alt="">
      <div class="yy-alt"><div class="yy-yazi"></div><div class="yy-cubuk"><i class="yy-dolu"></i></div><div class="yy-yuzde">0%</div></div>`;
    // (3.11) arka planda ufak efektler: yükselen kıvılcımlar ve yavaş ışık süzmesi
    { const k = document.createElement('div'); k.className = 'yy-kivilcim'; for (let i = 0; i < 28; i++) { const p = document.createElement('i'); p.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;--s:${(0.6 + Math.random() * 1.4).toFixed(2)};--d:${(5 + Math.random() * 7).toFixed(1)}s;--g:${(-Math.random() * 10).toFixed(1)}s;--x:${(Math.random() * 80 - 40).toFixed(0)}px`; k.append(p); } el.querySelector('.yy-resim')?.after(k);
      const isik = document.createElement('div'); isik.className = 'yy-isik'; k.after(isik); }
    y.classList.add('ko-yukle'); y.append(el);
    const yazi = el.querySelector('.yy-yazi'), dolu = el.querySelector('.yy-dolu'), yuzde = el.querySelector('.yy-yuzde');
    yazi.textContent = $('yukleniyor-yazi').textContent || 'Loading…';
    const L = { text: (id, t) => { if (id === 'Text_Info') yazi.textContent = t; }, progress: (id, v) => { const p = Math.max(0, Math.min(1, v)); dolu.style.clipPath = `inset(0 ${(100 - p * 100).toFixed(2)}% 0 0)`; yuzde.textContent = Math.round(p * 100) + '%'; } };
    koYukleme = { L, hedef: 0.04, deger: 0 };
    const adim = () => {
      if (!koYukleme) return;
      koYukleme.deger += (koYukleme.hedef - koYukleme.deger) * 0.06;
      L.progress('Progress_Loading', koYukleme.deger);
      if (!y.classList.contains('bitti')) requestAnimationFrame(adim);
      else { L.progress('Progress_Loading', 1); el.remove(); y.classList.remove('ko-yukle'); koYukleme = null; }   // (8.11) bitince hemen kalkar
    };
    adim();
  } catch (e) { console.warn('yükleme ekranı', e); $('yukleniyor').classList.remove('ko-yukle'); }
})();

// ---------------- sahne
// (7.11) ısınma: yüksek DPI ekranda (oran ≥ 1,5) MSAA kenar yumuşatma kapalı — pikseller zaten küçük, 4× örnekleme × 4× piksel GPU'yu çok ısıtıyordu;
//   'high-performance' çift GPU'lu dizüstünde her zaman harici ekran kartını açtırıyordu → tarayıcı seçsin (çoğunlukla tümleşik, serin)
const renderer = new THREE.WebGLRenderer({ canvas: $('sahne'), antialias: (devicePixelRatio || 1) < 1.5, powerPreference: 'default' });
// (7.11) pil ile çalışırken (şarj olmuyor): en çok 30 FPS ve çizim oranı en çok 1,5
window.__koPil = false;
try { navigator.getBattery?.().then((b) => { const f = () => { window.__koPil = !b.charging; }; f(); b.addEventListener('chargingchange', f); }).catch(() => {}); } catch {}
if (!renderer.capabilities.isWebGL2) { status('This browser does not support WebGL2.'); throw new Error('WebGL2 yok'); }
// Ekran kararması: GPU sürücüsü/bellek sıkışınca tarayıcı WebGL bağlamını düşürür (tuval siyah kalır, oyun donar gibi görünür).
// preventDefault ile geri yüklemeye izin verilir; three.js bağlam dönünce tüm dokuları/modelleri yeniden yükler.
// 6 sn içinde geri gelmezse sayfa kendiliğinden yenilenir (oturum korunur).
{
  const cv = $('sahne'); let zam = 0;
  const uyari = (acik) => {
    let d = document.getElementById('gl-kayip');
    if (!acik) { d?.remove(); return; }
    if (!d) { d = Object.assign(document.createElement('div'), { id: 'gl-kayip', textContent: 'Reloading graphics…' }); document.body.append(d); }
  };
  cv.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); console.warn('[KO] WebGL bağlamı kaybedildi'); uyari(true);
    clearTimeout(zam); zam = setTimeout(() => location.reload(), 6000);
  });
  cv.addEventListener('webglcontextrestored', () => { console.warn('[KO] WebGL bağlamı geri geldi'); clearTimeout(zam); uyari(false); });
}
// (7.11) siyah ekran yanıp sönmesi: tuvalin çizim tamponu boyutu (canvas.width / height) her atandığında — aynı değer bile olsa —
//   tampon silinir ve bir sonraki çizime dek ekran SİYAH görünür. resize olayları (GM paneli / kısayol çubuğu / sohbet klavyesi
//   kendi resize olayını yayar), uyarlamalı çözünürlük ve kalite ayarı bunu çizimden bağımsız anlarda yapıyordu; kare sınırı
//   (30 FPS, AFK) varken siyah kare görünür kalıyordu. Artık boyut / oran istekleri biriktirilir, yalnız GERÇEKTEN değiştiyse ve
//   hemen ardından çizim yapılacak anda (tickIc, render'dan hemen önce) uygulanır.
const tuval = { pr: null, w: 0, h: 0, uygula: () => {} };
{
  const R = renderer, sp = R.setPixelRatio.bind(R), ss = R.setSize.bind(R), gp = R.getPixelRatio.bind(R);
  const tavan = (v) => (document.documentElement.classList.contains('ko-tablet') || window.__koPil ? Math.min(v, 1.5) : v);   // tablet: GPU belleği sıkışıp bağlam düşmesin
  R.setPixelRatio = (v) => { tuval.pr = Number(v) || 1; };
  R.getPixelRatio = () => tuval.pr ?? gp();
  // DİKKAT: three'nin setPixelRatio'su içeride this.setSize(eski genişlik, eski yükseklik) çağırır — bu iç çağrı istenen boyutun
  //   üzerine yazmamalı (yazınca tuval eski / varsayılan 300×150 boyutta kalıp tüm ekrana gerilerek BULANIK çiziliyordu: ilk giriş)
  let ic = false;
  R.setSize = (w, h) => { if (ic) return; tuval.w = w; tuval.h = h; };
  tuval.uygula = () => {
    const w = tuval.w || innerWidth, h = tuval.h || innerHeight; if (!w || !h) return;
    const pr = tavan(tuval.pr ?? gp()), cv = R.domElement;
    if (cv.width === Math.floor(w * pr) && cv.height === Math.floor(h * pr) && Math.abs(gp() - pr) < 1e-6) return;
    ic = true; try { sp(pr); } finally { ic = false; }
    ss(w, h, false);
  };
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
{ const R = renderer; try { const gl = R.getContext(); let k = null; try { k = localStorage.getItem('ko-canli-renk'); } catch {} if (k !== '0' && !/Edg\//.test(navigator.userAgent) && 'drawingBufferColorSpace' in gl) gl.drawingBufferColorSpace = 'display-p3'; } catch {} }   // (5.11) Chrome'da Edge'deki canlı renkler: çizim tamponu Display-P3 sayılır (sRGB değerleri geniş gamda yorumlanır, Edge'in renk yönetimsiz görüntüsü gibi); kapatmak: localStorage ko-canli-renk = 0
const scene = new THREE.Scene();
// KO Option.ini [ViewPort] Distance 512; burada çizim 420 m, sis 30 m'den başlar (KO'daki uzak mavi pus)
const VIEW_DIST = 150;   // görüş mesafesi (herkes için sabit): küçük nesneler (ağaç, çit, eşya…) bu mesafede kaybolur
const WORLD_DIST = 420;  // çizim sınırı: arazi, binalar ve büyük yapılar; bunun ötesi tamamen siste kalır, çizilmez (hız)
// KO mesafe sisi: oyuncunun ~30 m ötesinden başlayan hafif sis (renk: bölgenin n3sky FogColor'u, öğlen açık mavi-turkuaz) — çizim sınırında tam
const FOG_NEAR = 30;
// sis yoğunluğu: tam sise ulaşma mesafesi kısaltılır (×1,18 daha yoğun) → sis 30 m'den başlar, ~380 m'de tam
const FOG_YOGUN = 1.357;   // 1,18 × 1,15 (genel çevre sisi %15 arttırıldı)
const FOG_FAR = FOG_NEAR + (WORLD_DIST - FOG_NEAR) / FOG_YOGUN;
const FX = { ...loadSettings().fx };
const fogColor = new THREE.Color().setHex(0x70cdba, THREE.SRGBColorSpace);
// KO oyun saati (gün döngüsü): sunucu saati — Türkiye (UTC+3) gerçek saati; test/GM için window.KO_SAAT (sn) veya ?saat=SS:DD
const _saatQ = /^(\d{1,2})(?::(\d{2}))?$/.exec(new URLSearchParams(location.search).get('saat') || '');
function oyunSaati() {
  if (window.KO_SAAT != null) return Number(window.KO_SAAT);
  if (window.KO_SAAT_ONIZLE != null) return Number(window.KO_SAAT_ONIZLE);   // GM paneli kaydırıcısı sürüklenirken
  { const g = gmSaat(ZONE); if (g != null) return g; }   // GM saat ayarı (oyun_saati)
  if (_saatQ) return (+_saatQ[1]) * 3600 + (+(_saatQ[2] || 0)) * 60 + (performance.now() / 1000) % 60;
  return koSaat();   // KO: oyun saati gerçek saatten 10 kat hızlı (oyun-saati.js)
}
scene.background = new THREE.Color().setHex(0x184a70, THREE.SRGBColorSpace);
scene.fog = new THREE.Fog(fogColor, FOG_NEAR, FOG_FAR);
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, WORLD_DIST + 64);
// KO/Direct3D sol-el koordinat sistemi kullanır; WebGL sağ-el. Tüm dünya z ekseninde aynalanır,
// böylece oyun mantığı orijinal KO koordinatlarıyla (x, y, z) çalışır ve görüntü ayna olmaz.
const world = new THREE.Group(); world.scale.z = -1; scene.add(world);
const toThree = (x, y, z) => new THREE.Vector3(x, y, -z);


// ---------------- oyuncu (geçici gövde; karakter modelleri sonraki aşamada)
const player = new THREE.Group();
sesDinleyici(() => player.position);   // konumlu KO sesleri oyuncuya uzaklığa göre kısılır
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.1, 4, 12), new THREE.MeshLambertMaterial({ color: 0xb03a2e }));
  body.position.y = 1.0; player.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0xf0c56a }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.4, 0.55); player.add(nose);
}
world.add(player);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x445533, 1.2); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 1.5); sun.position.set(0.4, 0.8, 0.3); scene.add(sun);

const NATION_COLOR = { 1: 0xb03a2e, 2: 0x2e6fb0 };
// İsim etiketleri, <GM>, NPC kimlikleri ve sohbet balonları: 3B dünyaya bağlı HTML etiketleri (#etiketler).
// Tuvale çizilmediği için her zaman keskin; ekranda sabit boyut, tam piksele hizalı. Nesne (ya da atası) gizliyse görünmez.
const gmTags = [], labels = new Set();
const labelLayer = document.createElement('div'); labelLayer.id = 'etiketler'; $('sahne').after(labelLayer);   // arayüzün altında, sahnenin üstünde
function domLabel(cls) {
  const o = new THREE.Object3D(); const el = document.createElement('div'); el.className = 'etiket ' + (cls || ''); el.style.display = 'none';   // ilk konumlanana kadar gizli (sol üstte yığılmasın)
  o.userData.el = el; o.userData.dy = 0; labelLayer.append(el); labels.add(o);
  return o;
}
function labelScale() {}
// eski arayüz uyumu: textSprite(text, {color}) → tek satırlık etiket
function textSprite(text, { color = '#ffffff', cls = '' } = {}) {
  const o = domLabel(cls); o.userData.el.textContent = text; if (color) o.userData.el.style.color = color;
  o.center = { set: (x, y) => { o.userData.dy = y < 0 ? Math.round(-y * 16) : 0; } };   // yukarı kaydırma (px)
  return o;
}
// KO: klan adı isim etiketinde, ismin hemen üstünde
function klanEtiketi(tag, ad, lider = false) {
  const el = tag?.userData?.el; if (!el) return;
  let k = el.querySelector('.klan-ad');
  if (!ad) { k?.remove(); return; }
  if (!k) { k = document.createElement('div'); k.className = 'klan-ad'; const a = el.querySelector('.ad'); if (a) a.before(k); else el.prepend(k); }   // KO: klan adı ismin hemen üstünde, kırmızı
  if (k.textContent !== ad) k.textContent = ad;
  k.classList.toggle('baskan', !!lider);   // KO: klan başkanının klan adının altı yeşil çizgili
  el._h = null;
}
// KO başarım (CoverTitle): isimden önce NPC yazı renginde "[Başarım adı] "
function unvanEtiketi(tag, ad) {
  const a = tag?.userData?.el?.querySelector('.ad'); if (!a) return;
  let u = a.querySelector('.unvan-on');
  if (!ad) { if (u) { u.remove(); tag.userData.el._h = null; } return; }
  if (!u) { u = document.createElement('span'); u.className = 'unvan-on'; const t = [...a.childNodes].find((n) => n.nodeType === 3); a.insertBefore(u, t || null); }
  const y = `[${String(ad).replace(/^\s*\[[^\]]*\]\s*/, '') || ad}] `; if (u.textContent !== y) u.textContent = y;   // "[Level 10] Piece of Cake" → [Piece of Cake]
  tag.userData.el._h = null;
}
// KO: ulusun kralı kral pelerinini giyer (cloak_2<ırk> modeli) — Cloak.tbl'deki gibi: Karus 97 (karus_king, mavi · anka amblemi),
// El Morad 98 (elmo_king, kırmızı · güneş amblemi); süsler pelerinin kendi rengine boyanır (tek renk); klan kolluğu (g) korunur
function kralPel(id, nation, pel) {
  const D = state.kral?.durum; const kid = D && Number(D[String(nation)]?.id);
  if (!kid || kid !== Number(id)) return pel;
  return { k: 0, n: Number(nation) === 2 ? 98 : 97, u: 0, v: 0, ...(pel?.g !== undefined ? { g: pel.g } : {}) };
}
const AD_RENK = { ben: '#5cf2ff', dost: '#8080ff', dusman: '#ff6464' };   // (31.10) düşman ulus adı orijinal KO ekranındaki gibi açık kırmızı   // oyuncu isim renkleri
function nameSprite(text, color = '#ffffff', { gm = false, kind = 'oyuncu' } = {}) {
  const o = domLabel('isim ' + kind); const el = o.userData.el;
  // <GM> yazısı isim üstünde gösterilmez (GM'ler aurasıyla ayırt edilir)
  const n = document.createElement('div'); n.className = 'ad'; n.textContent = text; if (color && color !== '#ffffff') n.style.color = color; el.append(n);
  o.userData.kind = kind; o.userData.gm = gm; o.visible = kind === 'canavar' ? FX.monsterNames : FX.names;
  o.position.y = 2.3;
  return o;
}
const _lp = new THREE.Vector3();
function shown(o) { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; } return false; }
// etiket yüksekliği ResizeObserver ile önbellekte (her karede offsetHeight okumak tüm sayfayı yeniden yerleştirir → FPS düşer)
const _etiketRO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => { for (const e of es) e.target._h = e.target.offsetHeight; }) : null;
// (4.11) isim etiketi başı izler: oturma / kalkma / kanatla havada durma animasyonunda yazılar karakterle birlikte iner-kalkar.
// Baş ekleminin (adında 'head') o anki yüksekliği − bağ pozundaki yüksekliği (+ model kaydırması) etiketin taban yüksekliğine eklenir;
// fitName etiketi yeniden konumlarsa yeni taban alınır.
function etiketBasIzle(tag, api) {
  if (!tag || !api?.joint || !api.group) return;
  if (api._basI === undefined) { const i = (api.eklemAdlari || []).findIndex((n) => /head/i.test(n) && !/nub|end/i.test(n)); api._basI = i; api._basY0 = i >= 0 ? api.bind(i)[1] : 0; }
  const J = api._basI >= 0 ? api.joint(api._basI) : null;
  const yuru = /^(walk|run|walk_back|swim)/i.test(api.clip || '');   // (5.11) yürürken / koşarken baş sallanması etiketi oynatmasın: sabit yükseklik
  const kay = api.group.position.y + (J && !yuru ? (J[13] - api._basY0) * api.group.scale.y : 0);
  const u = tag.userData;
  if (u.izY === undefined || Math.abs(tag.position.y - u.izY) > 1e-4) u.tabanY = tag.position.y;   // ilk kez ya da fitName değiştirdi
  u.izY = u.tabanY + Math.max(-1.6, Math.min(2.5, kay)); tag.position.y = u.izY;
}
function updateLabels() {
  const W = innerWidth, H = innerHeight;
  for (const o of labels) {
    const el = o.userData.el;
    if (!o.parent && !o.userData.keep) { _etiketRO?.unobserve(el); el.remove(); labels.delete(o); continue; }
    if (!shown(o) || (o.userData.menzil && Math.hypot(o.position.x - player.position.x, o.position.z - player.position.z) > o.userData.menzil)) { if (el._gz !== 1) { el.style.display = 'none'; el._gz = 1; } continue; }
    o.getWorldPosition(_lp); _lp.project(camera);
    // kameranın arkası ya da yanlarda ekran dışı → gizle; yalnızca üstten taşıyorsa (yakın kamera) ekranın üst kenarında tut
    if (_lp.z > 1 || _lp.x < -1.2 || _lp.x > 1.2 || _lp.y < -1.2) { if (el._gz !== 1) { el.style.display = 'none'; el._gz = 1; } continue; }
    if (el._gz !== 0) { el.style.display = ''; el._gz = 0; if (_etiketRO && !el._ro) { el._ro = 1; _etiketRO.observe(el); } }
    if (el._h == null || !_etiketRO) el._h = el.offsetHeight;
    const x = Math.round((_lp.x + 1) / 2 * W);
    const y = o.userData.altYazi ? Math.round((1 - _lp.y) / 2 * H) : Math.max(el._h + 4, Math.round((1 - _lp.y) / 2 * H) - o.userData.dy);
    if (el._x !== x || el._y !== y) { el._x = x; el._y = y; el.style.transform = `translate(${x}px, ${y}px) ${el._npcBalon ??= el.classList.contains('balon-npc') ? 'translate(-18px, -100%)' : el.classList.contains('alt-yazi') ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'}`; }
    const zi = 1000 - Math.round(_lp.z * 1000);
    if (el._z !== zi) { el._z = zi; el.style.zIndex = String(zi); }
  }
}
// sohbet balonu: yazan oyuncunun isminin üstünde; 7 sn sonra söner
const bubbles = new Set();
function chatBubble(root, nameTag, text, gm, npc = false, ad = null, ekSinif = '') {
  if (root.userData.bubble) { root.userData.bubble.removeFromParent(); bubbles.delete(root.userData.bubble); }
  if (!npc) {   // (2.11) KO: oyuncu yazısı balonsuz, başın üstünde: isim etiketinin içinde ismin altına eklenir → isim gerektiği kadar yukarı kayar
    const el = nameTag.userData?.el; if (!el) return;
    el.querySelector(':scope > .isim-yazi')?.remove();
    const d = document.createElement('div'); d.className = 'isim-yazi' + (ekSinif ? ' ' + ekSinif : '');
    if (ad) d.append(document.createTextNode(`${ad} : `));
    const m = document.createElement('span'); emoYaz(m, String(text).slice(0, 200)); d.append(m);
    el.append(d); el._h = null;
    clearTimeout(nameTag.userData.yaziT); nameTag.userData.yaziT = setTimeout(() => { d.remove(); el._h = null; }, 7000);
    return;
  }
  // KO NPC konuşması: koyu saydam kutu, açık bej çerçeve, kalın gri yazı (kuyruk yok)
  const o = domLabel(npc ? 'balon balon-npc' : 'balon'); if (npc) o.userData.el.textContent = String(text).slice(0, 200); else emoYaz(o.userData.el, String(text).slice(0, 200));
  o.userData.dy = 22;                       // ismin üstünde
  o.position.y = nameTag.position.y; o.userData.until = clock.elapsedTime + 7;
  root.add(o); root.userData.bubble = o; bubbles.add(o);
}
function tickBubbles(t) {
  for (const b of bubbles) {
    const left = b.userData.until - t;
    if (left <= 0) { if (b.parent?.userData.bubble === b) b.parent.userData.bubble = null; b.removeFromParent(); bubbles.delete(b); continue; }
    // KO: sohbet balonu en fazla 30 m öteden görünür
    const uzak = b.parent && b.parent !== player && b.parent.getWorldPosition(_bv).distanceTo(player.getWorldPosition(_bp)) > 30;
    b.userData.el.style.opacity = uzak ? '0' : String(Math.min(1, left / 0.6));
    b.userData.el.style.visibility = uzak ? 'hidden' : '';
  }
}
const _bv = new THREE.Vector3(), _bp = new THREE.Vector3();
// isim etiketi yüksekliği: modelin başının hemen üstü (ırka göre boy farklı)
const _box = new THREE.Box3(), _v = new THREE.Vector3();
function fitName(root, model, tag) {
  if (!model || !tag) return;
  root.updateMatrixWorld(true);
  // yalnız gövde / zırh parçaları: takılar (peri, kanat, silah, pathos küresi, efektler) ismi yukarı itmesin
  _box.makeEmpty();
  for (const c of model.children) if (c.isMesh && c.visible && !c.userData.plugKey) _box.expandByObject(c, true);
  if (_box.isEmpty()) _box.setFromObject(model, true);
  if (_box.isEmpty()) return;
  const top = _box.max.y - root.getWorldPosition(_v).y;
  if (top > 0.3 && top < 40) tag.position.y = top + 0.04;   // isim + klan yazısı başa daha yakın (istek: biraz aşağı)
}
function makeAvatar(nation, race, look, gear) {
  const g = new THREE.Group();
  g.userData.gear = gear || [];
  if (race != null) createCharacter(race, look || {}).then((c) => {
    if (!c) return;
    g.children.filter((o) => o.isMesh).forEach((o) => (o.visible = false));
    g.add(c.group); g.userData.chr = c;
    donanimIzle(state.gearReady?.then(() => state.donanim?.applyGear(c, race, g.userData.gear)));
    if (g.userData.pel) pelerinUygula(BOOT.sb, c, race, g.userData.pel).catch(() => {});   // klan pelerini
    fitName(g, c.group, g.userData.nameTag);
    const fit = (m) => fitName(g, m, g.userData.nameTag);
    if ((g.userData.bo || 100) !== 100) boyutUygula(c, g.userData.bo, fit);   // GM boyutu
    if (g.userData.don) donusumGorsel(c, g.userData.don, fit, g.userData.gear);   // dönüşüm (Transformation)
  }).catch((e) => console.warn('karakter', e));
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.1, 4, 12), new THREE.MeshLambertMaterial({ color: NATION_COLOR[nation] ?? 0x999999 }));
  body.position.y = 1.0; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0xf0c56a }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.4, 0.55); g.add(nose);
  return g;
}
// (4.11) uzak oyuncuların eşya yüklemeleri: yükleme ekranı bunlar bitene dek (sınırlı süre) kalır → oyuncular eşyalarıyla birlikte görünür
const DONANIM_BEKLEYEN = new Set();
function donanimIzle(p) { if (!p?.then) return p; const q = Promise.resolve(p).catch(() => {}).finally(() => DONANIM_BEKLEYEN.delete(q)); DONANIM_BEKLEYEN.add(q); return p; }
const remotes = new Map();   // id -> { obj, target:{x,y,z,yaw} }
const _frus = new THREE.Frustum(), _frusM = new THREE.Matrix4(), _rwp = new THREE.Vector3(), _rsf = new THREE.Sphere(new THREE.Vector3(), 2.2);   // (6.11) uzak oyuncu animasyon LOD
const golgeler = createGolgeler({ world, player, remotes });   // hafif karakter gölgeleri (Seçenekler → DirectX)
// GM'lerin ayaklarının altında sürekli KO efekti (GM Paneli → Genel'den kapatılabilir)
const GM_FX = 32160;   // USKO GM efekti (jojo_mwsh_aaaallll22.fxb: dönen GM yazısı, yeşil ışık sütunu, yıldızlar, zemin halkası)
function gmAura(obj, on) {
  if (!state.fx || !obj) return;
  if (obj.userData.gmFx) { obj.userData.gmFx.stop(); obj.userData.gmFx.dispose?.(); obj.userData.gmFx = null; }
  if (!on) return;
  const v = new THREE.Vector3();
  obj.userData.gmFx = state.fx.play(GM_FX, { loop: true, opak: true, meshDy: 1.35, parcacik: [{ re: /ja_toy|sparks_f_green|sparks_light_green/, k: 0.5 }], zeminAyna: [/gr_ruard/], follow: () => v.set(obj.position.x, obj.position.y, obj.position.z) });
}
const gmFxAcik = () => { try { return localStorage.getItem('ko-gm-efekt') !== '0'; } catch { return true; } };
// GM Paneli → "GM efekti": kendi ekranında ve diğer tüm oyuncularda aynı anda açılır/kapanır (presence gmfx)
// GM periler / GM yardımcısı (GM Paneli → GM yönetimi → GM karakterim): kendi ekranında ve tüm oyuncularda (presence gp / yd)
window.__gmPeriAyarla = (on) => { try { localStorage.setItem('ko-gm-peri', on ? '1' : '0'); } catch {} window.__gmPeri = !!on && !!state.ghost; state.donanim?.gmPeriler?.(state.avatar, window.__gmPeri); state.net?.izle?.(); };
window.__gmYdAyarla = (cfg) => { window.__gmYd = cfg && cfg.aktif && state.ghost ? { m: cfg.m, a: cfg.a, r: cfg.r, s: cfg.s } : null; state.yardimci?.ayarla('ben', player, window.__gmYd); state.net?.izle?.(); };
function gmEkUzak(id, r) {   // uzak GM'in perileri ve yardımcısı
  const gm = GMS.has(Number(id)), chr = r?.obj?.userData?.chr;
  if (chr) state.donanim?.gmPeriler?.(chr, gm && !!r.meta?.gp);
  state.yardimci?.ayarla(String(id), r.obj, gm ? r.meta?.yd || null : null);
}
window.__gmAura = (on) => { try { localStorage.setItem('ko-gm-efekt', on ? '1' : '0'); } catch {} gmAura(player, state.ghost && on); state.net?.izle?.(); };

// uzak oyuncunun Genie efekti (presence "gn"): başının üstünde dönen KO GENIE yazısı
function genieUzak(obj, on) {
  if (!obj) return;
  if (obj.userData.genieFx) { obj.userData.genieFx.stop?.(); obj.userData.genieFx.dispose?.(); obj.userData.genieFx = null; }
  obj.userData.genieIst = !!on;
  if (!on || !state.fx) return;
  import('./genie.js').then(async (G) => { if (!(await G.genieFxHazir()) || !obj.userData.genieIst || obj.userData.genieFx || !obj.parent) return; obj.userData.genieFx = G.genieFx(state.fx, () => obj.position); }).catch(() => {});
}
// hedef işareti (tıklanan nokta)
const marker = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.6, 24), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false }));
marker.rotation.x = -Math.PI / 2; marker.visible = false; world.add(marker);
marker.material.visible = false;   // KO: yere tıklayınca deadsoft target_pointer.fxb (fx-secim.js)
const yurIsaret = import('./fx-secim.js').then(({ secimTakip }) => secimTakip(state, 'target_pointer.fxb'));
let yurIsaretPos = null;
function yurIsaretGuncelle() {
  if (!marker.visible) { if (yurIsaretPos) { yurIsaretPos = null; yurIsaret.then((h) => h.gizle()); } return; }
  const p = marker.position, yeni = !yurIsaretPos || yurIsaretPos.distanceToSquared(p) > 0.04;
  if (yeni) { yurIsaretPos = p.clone(); const sabit = yurIsaretPos.clone(); yurIsaret.then((h) => h.goster(() => sabit, 1, { yeniden: true })); }
}

// ---------------- durum
const state = {
  heightAt: () => 0, world: 1024, terrain: null,
  yaw: 0,                 // oyuncunun baktığı yön
  camYaw: Math.PI, camPitch: 0.4, camDist: 10.8,   // varsayılan bakış: hafif yukarıdan (en uzak 12 m)
  target: null, speed: 5.25, run: true,   // KO'dan %30 yavaş (istek)
  keys: new Set(),
};
silahGizleKur(state);
hud.gmMi = () => !!state.ghost;   // (8.11) Türkçe yedek çeviri GM'de uygulanmaz
state.hedefTemizle = () => { state.target = null; marker.visible = false; };   // yürüme işaretini kaldır (ölüm/diriliş)

// ---------------- girişler
const canvas = renderer.domElement;
addEventListener('keydown', (e) => {
  const chatIn = $('sohbet-giris');
  if (e.target === chatIn) {
    if (e.key === 'Enter') {
      const v = chatIn.value.trim();
      const sus = state.sustur && (!state.sustur.bitis || Date.parse(state.sustur.bitis) > Date.now());   // web panelden GM susturması
      if (v && sus && (!/^\.?\//.test(v) || /^\.?\/(pm|w|ozel)\b/i.test(v) || ['ozel'].includes(hud.sohbetKanal))) hud.info(`You are banned from chatting${state.sustur.bitis ? ` (until ${new Date(state.sustur.bitis).toLocaleString('en-US')})` : ' (permanently)'}. Reason: ${state.sustur.neden || 'not specified'}`, 'hata');
      else if (v.startsWith('/')) runCommand(v);
      else if (v.startsWith('./')) runCommand(v.slice(1));
      else if (v && hud.sohbetKanal === 'klan' && state.klanApi) state.klanApi.sohbet(v);
      else if (v && hud.sohbetKanal === 'birlik' && state.klanApi) state.klanApi.birlikSohbet(v);
      else if (v && hud.sohbetKanal === 'bagir' && state.net) {   // bağırma: oyuncu başına 20 sn'de bir (GM sınırsız)
        const kalan = Math.ceil(((state.bagirSon || 0) + 20000 - Date.now()) / 1000);
        if (kalan > 0 && !GMS.has(Number(BOOT?.character?.id))) hud.info(`You must wait ${kalan} seconds before shouting again.`, 'hata');
        else { state.bagirSon = Date.now(); state.net.chat(v, true); }
      }
      else if (v && hud.sohbetKanal === 'parti' && state.parti) state.parti.sohbet(v);
      else if (v && ['parti', 'klan', 'birlik', 'oda'].includes(hud.sohbetKanal)) hud.info(`${{ parti: 'Party', klan: 'Clan', birlik: 'Alliance', oda: 'Chat room' }[hud.sohbetKanal]} chat is not available yet. You can write in the All tab.`, 'hata');
      else if (v && hud.sohbetKanal === 'ozel') runCommand('/pm ' + v.replace(/^\/?(pm|w|ozel)\s+/i, ''));
      else if (v && state.net) state.net.chat(v);
      chatIn.value = ''; chatIn.blur();
    }
    if (e.key === 'Escape') chatIn.blur();
    return;
  }
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Enter' && chatIn) { e.preventDefault(); chatIn.focus(); return; }
  state.keys.add(e.code);
  if (e.code === 'KeyV' && state.ghost) { state.hizli = !state.hizli; hud.notice(state.hizli ? 'GM speed: 300%' : 'GM speed: normal'); }
  if (e.code === 'KeyT' || (e.code === 'KeyY' && window.koSecenek?.yYuru !== false && !e.repeat)) { state.run = !state.run; hud.notice(state.run ? 'Run' : 'Walk'); }   // KO: Turn on Y-key Walking Mode
  // M: KO dünya haritası (solda harita adları, ortada harita, sağda Mob / NPC arama); mini harita sol üstte sabit kalır
  // N: mini haritayı aç / kapat (açılınca konum şeridinin hemen altına yerleşir)
  if (e.code === 'KeyN' && !e.repeat) { const m = document.getElementById('mini'); if (m) { m.classList.toggle('gizli'); m.hidden = false; requestAnimationFrame(() => hud.miniYerlestir?.()); } }
  if (e.code === 'KeyM' && !e.repeat) state.haritaAc();
});
// KO dünya haritası aç / kapat (M; Seçenekler → Find.M → See Map)
state.haritaAc = (npcId) => {
  {
    (state.dunyaHarita ||= import('./dunya-harita.js').then(({ initDunyaHarita }) => initDunyaHarita({ sb: BOOT?.sb, state, hud, player,
      zoneBase: (z) => `${LOCAL_ZONES.has(z) ? './assets/zones' : REMOTE_ZONES}/${z}`, aktifZone: HARITA,
      git: (x, z) => { state.target = new THREE.Vector3(x, state.heightAt(x, z), z); marker.position.copy(state.target).add(new THREE.Vector3(0, 0.08, 0)); marker.visible = true; } })))
      .then((h) => (npcId ? (h.acik ? null : h.ac()) : h.toggle())).catch((err) => console.warn('dünya haritası', err));
  }
};
addEventListener('keyup', (e) => state.keys.delete(e.code));
addEventListener('blur', () => state.keys.clear());

let drag = null;
state.fareYurut = () => !!(drag && drag.yurut && drag.btn === 0);   // (4.11) fareyi basılı tutarak yürüme: menzildeki hedefe yetenek durmadan / dönmeden atılır
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });   // tekerlek tıklaması tarayıcının otomatik kaydırmasını açmasın
canvas.addEventListener('pointerdown', (e) => {
  // fare tekerleği tıklaması: yalnız kamera açısı 180° döner (karakter dönmez) — ~0,4 sn'de kayarak (döngüde state.donus)
  if (e.button === 1) { e.preventDefault(); state.donus = (state.donus || 0) + Math.PI; return; }   // kamera dönüşü: otururken de (kalkma sorusu yok)
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  drag = { x: e.clientX, y: e.clientY, btn: e.button, moved: 0, yurut: false, t: 0 };
  // KO: sol tık anında yürür; basılı tutunca imleci izler. NPC / mob / sandık tıklaması önceliklidir.
  if (e.button === 0) {
    const op = pickRemote(e);
    // (2.11) arenada / Ardream'de düşmana tek tık → yalnız hedef seçilir; aynı oyuncuya çift tık → otomatik R saldırısı
    if (op && state.arena?.saldirabilir(op.id)) {
      state.towers?.anitBirak?.();
      const t = performance.now(), cift = state._sonOyuncuTik?.id === String(op.id) && t - state._sonOyuncuTik.t < 450;
      state._sonOyuncuTik = { id: String(op.id), t };
      if (cift) state.arena.hedefle(op.id); else state.arena.oyuncuSec?.(op.id);
      return;
    }
    // KO: saldırılamayan oyuncuya sol tık → seç (hedef çubuğunda adı; klan daveti vb. için)
    if (op && state.pazar?.saticiMi?.(op.id)) { state.seciliOyuncu = { id: String(op.id), meta: op.r.meta }; state.combat?.clearTarget?.(); state.npcs?.select?.(null); state.pazar.bak(op.id); return; }   // (2.11) pazar da yeşil halkayla seçilir   // KO: pazar kurmuş oyuncuya tıklayınca pazarı açılır
    if (op) { state.seciliOyuncu = { id: String(op.id), meta: op.r.meta }; state.combat?.clearTarget?.(); hud.target?.({ name: op.r.meta?.name || 'Oyuncu', level: op.r.meta?.level, hp: op.r.hp ?? 1, max_hp: op.r.max_hp ?? 1, enemy: Number(op.r.meta?.nation) > 0 && Number(op.r.meta?.nation) !== Number(BOOT?.character?.nation), oyuncu: true, id: String(op.id), nation: op.r.meta?.nation }); drag.surukle = true; return; }
    if (state.towers?.anitTikla?.(e, camera, canvas)) { state.combat?.cancel(); state.towers.anitSaldir?.(); state.arena?.birak(); return; }   // anıt: sol tık → hedef al ve vur
    state.towers?.anitBirak?.();
    if (state.loot?.onClick(e)) { state.npcs?.select?.(null); state.arena?.birak(); return; }
    if (state.npcUi?.click(e)) { state.arena?.birak(); drag.surukle = true; return; }
    state.npcs?.select?.(null); state.npcUi?.vazgec?.();   // başka yere tıklanınca seçili NPC bırakılır (yeşil halka kalkar)
    if (state.combat?.onClick(e)) { state.arena?.birak(); drag.surukle = true; return; }   // KO: moba tıklamak hedef alır; basılı tutup sürüklenirse karakter imlece yürür (hedef kalır)
    if (state.ors?.click(e) || state.kapi?.click(e)) { state.arena?.birak(); return; }
    if (state.seciliOyuncu) { state.seciliOyuncu = null; if (!state.combat?.target) hud.target?.(null); }
    const aHedef = state.arena?.hedef; state.combat?.cancel(); state.arena?.birak();
    // KO: boş alana tıklayınca (Z ile alınmış olsa bile) hedef bırakılır
    if (state.combat?.target) state.combat.clearTarget?.();
    if (state.arena?.secili || aHedef) { state.arena?.birakSecim?.(); hud.target?.(null); }   // arenada tıklanarak alınmış oyuncu hedefi de bırakılır
    if (state.pazarAcik) { state.pazar?.bozSor?.(); return; }   // (6.11) pazar kuruluyken (Selling / Buying Merchant) boş yere tıklama: "Do you want to quit vendor mode?"
    clickMove(e); drag.yurut = true; drag.t = performance.now();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.btn === 2) {   // sol tuşla sürükleme kamerayı döndürmez (KO: sağ tuş); kenar kaydırması aşağıda
    state.camYaw += dx * 0.005 * Math.max(0.2, (Number(window.koSecenek?.fareHiz) || 5) / 5);   // Mouse Turn Sensitivity (1–10, 5 = normal)
    state.camPitch = THREE.MathUtils.clamp(state.camPitch + dy * 0.004, 0.05, 1.4);
  }
  if (drag.surukle && !drag.yurut && drag.btn === 0 && drag.moved > 14 && !state.otur) { state.combat?.cancel(); drag.yurut = true; drag.t = 0; }   // hedefe / NPC'ye tıklayıp basılı tutarak sürükleme: yürümeye başla
  if (drag.yurut && performance.now() - drag.t > 70) { drag.t = performance.now(); clickMove(e, true); }   // basılı tutarken imleci izle
});
const birak = () => { drag = null; };
canvas.addEventListener('pointerup', (e) => {
  // KO: sağ tık yeteneği (kısayolda mavi parlayan) — moba sağ tıklayınca hedefle ve kullan
  // KO: PvP bölgelerinde (Ardream, Ronark Land, Eslant, savaş / klan savaşı haritaları, arena) oyuncu sağ tık menüsü açılmaz
  if (drag && drag.btn === 2 && drag.moved <= 6 && state.takas && !PVP_BOLGE && !state.arena?.icinde?.()) {   // oyuncuya sağ tık → menü (ticaret, bilgi, arenada saldır)
    const op = pickRemote(e); if (op) {
      // KO: oyuncu menüsü 7 m içinde açılır; uzaksa oyuncuya 7 m'ye kadar yaklaşılır, varınca açılır
      const o = op.r.obj.position, dx = player.position.x - o.x, dz = player.position.z - o.z, L = Math.hypot(dx, dz);
      if (L <= 7) state.takas.oyuncuMenu(op.id, op.r.meta, e.clientX + 4, e.clientY + 4);
      else if (!state.otur || !state.dinlen?.engelle()) { state.target = new THREE.Vector3(o.x + dx / L * 6.5, 0, o.z + dz / L * 6.5); state.oyuncuMenuBekle = { id: op.id, x: e.clientX + 4, y: e.clientY + 4 }; }
      drag = null; return;
    }
  }
  // KO: sağ tık yeteneği (kısayolda mavi parlayan) — sağ tıklayınca kısayola basmadan kullan; moba tıklandıysa önce hedefle
  if (drag && drag.btn === 2 && drag.moved <= 6 && state.kisayol?.sagTikId?.() != null) {
    const mob = state.combat?.onClick(e);
    if (mob || !state.npcUi?.context(e)) { state.kisayol.sagTikKullan(); drag = null; try { canvas.releasePointerCapture(e.pointerId); } catch {} return; }
    drag = null; return;
  }
  if (drag && drag.btn === 2 && drag.moved <= 6 && !state.npcUi?.context(e) && state.ghost && state.gmWin) {   // NPC menüsü; GM: kuleye sağ tık → kule düzenleme
    const t = state.towers?.pick(e, camera, canvas); if (t) state.gmWin.open('kule', t.t.id);
  }
  drag = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
});
canvas.addEventListener('pointercancel', birak);
canvas.addEventListener('lostpointercapture', birak);
canvas.addEventListener('dblclick', (e) => state.npcUi?.dblclick(e));
// fare ekranın sol/sağ kenarına değince kamera o yöne döner
const kenar = { x: -1, icerde: false };
addEventListener('pointermove', (e) => { kenar.x = e.clientX; kenar.icerde = true; state.sonImlec = { clientX: e.clientX, clientY: e.clientY }; });
document.addEventListener('pointerleave', () => { kenar.icerde = false; });
addEventListener('blur', () => { kenar.icerde = false; });
function kenarKaydir(dt) {
  if (!kenar.icerde || !document.hasFocus() || drag) return;
  const E = 6;
  if (kenar.x <= E) state.camYaw -= 1.8 * dt;
  else if (kenar.x >= innerWidth - 1 - E) state.camYaw += 1.8 * dt;
}
canvas.addEventListener('wheel', (e) => { state.camDist = THREE.MathUtils.clamp(state.camDist * (1 + Math.sign(e.deltaY) * 0.1), 3, 12); e.preventDefault(); }, { passive: false });   // uzaklık en fazla 12 m (14 → 2 m yakın)

const ray = new THREE.Raycaster();
const camLocal = new THREE.Vector3();
// ekrandaki en yakın oyuncu (gövde ortası 45 px içinde)
const _pv = new THREE.Vector3();
// (4.11) kendi karakterimin adının biraz üstü (ekran px): süzülen yetenek simgeleri buradan başlar (secenek-etki.js)
const _bev = new THREE.Vector3();
window.__koBenEkran = () => { if (!player.visible) return null; player.getWorldPosition(_bev); _bev.y += 2.75; _bev.project(camera); if (_bev.z > 1) return null; return { x: (_bev.x + 1) / 2 * innerWidth, y: (1 - _bev.y) / 2 * innerHeight }; };
function pickRemote(e) {
  let best = null, bd = 45;
  for (const [id, r] of remotes) {
    if (!r.obj.visible) continue;
    for (const h of [0.5, 1.1, 1.7]) {
      r.obj.getWorldPosition(_pv); _pv.y += h; _pv.project(camera); if (_pv.z > 1) continue;
      const d = Math.hypot((_pv.x + 1) / 2 * innerWidth - e.clientX, (1 - _pv.y) / 2 * innerHeight - e.clientY);
      if (d < bd) { bd = d; best = { id, r }; }
    }
  }
  return best;
}
function clickMove(e, sessiz = false) {
  if (!state.terrain) return;
  if (state.otur && (sessiz || state.dinlen?.engelle())) return;   // Move immediately işaretliyse hemen kalkıp yürür
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = ray.intersectObject(state.terrain, true)[0];   // nesneler tıklamayı engellemez (sonraki aşama: çarpışma)
  if (hit) { const lp = world.worldToLocal(hit.point.clone()); state.target = lp; marker.position.copy(lp).add(new THREE.Vector3(0, 0.08, 0)); marker.visible = window.koSecenek?.hedefFx !== false; }   // Use Target Positioning Effect
}

// ---------------- döngü
function resize() {
  const w = innerWidth, h = innerHeight; if (!w || !h) return;
  if (w === tuval.w && h === tuval.h) return;   // yapay / değişmeyen resize olayları tuvale dokunmaz
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
// (sekme değiştirince çıkan "Oyundan çık" sorusu kaldırıldı — oyun arkada sürer, arkaplan.js)

let post = null;
const clock = new THREE.Clock();
let fpsT = 0, fpsN = 0;
const KOSU_ANIM = 1;   // koşu/yürüme klibi normal hızda (yalnız hareket hızı düşük)
// ana döngü: bir karede hata olsa bile döngü durmaz (önceden tek bir hata oyunu tamamen donduruyordu)
let tickHata = 0;
let sonKare = 0;
// (6.11) ısınma / güç: pencere odakta değilken (başka program önde) ya da 60 sn hiç fare / klavye kullanılmazken (AFK) en çok 30 FPS;
//   ilk dokunuşta hemen eski hıza döner
let sonGirdi = performance.now();
for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel']) addEventListener(ev, () => { sonGirdi = performance.now(); }, { passive: true, capture: true });
// (6.11) diğer sürekli döngüler (dünya nesneleri, hava, yapraklar) kendi rAF'ları yerine ana karede çalışır → FPS sınırına uyar
//   (önceden 144 Hz ekranda FPS 60'a sınırlıyken bile bu döngüler saniyede 144 kez dönüyordu)
const _kareIsleri = [];
window.__koKareRaf = (fn) => { _kareIsleri.push(fn); return 0; };
function tick(t = performance.now()) {
  requestAnimationFrame(tick);
  // KO Graphic option → FPS (30 ~ 120): kare sınırı (120 = sınırsız)
  // sınır karenin %90'ı ile denetlenir ve hedef zamana göre ilerler: ekran tazeleme hızı sınıra eşitken (60 Hz / 60 FPS) rAF zamanlamasındaki
  // küçük sapmalar kare atlatıp anlık 30 FPS'e düşürmesin
  let k = Number(window.koSecenek?.kare) || 0;
  if (!document.hidden && (!document.hasFocus() || t - sonGirdi > 15000 || window.__koPil)) k = k >= 30 && k < 120 ? Math.min(k, 30) : 30;   // (7.11) odak yok / 15 sn girdi yok / pil: 30 FPS
  if (k >= 30 && k < 120) { const ar = 1000 / k; if (t - sonKare < ar * 0.9) return; sonKare = Math.max(sonKare + ar, t - ar); }
  else sonKare = t;
  if (_kareIsleri.length) { const l = _kareIsleri.splice(0); for (const f of l) { try { f(t); } catch (e) { if (tickHata++ < 5) console.error('[KO] kare işi', e); } } }
  try { tickIc(); } catch (e) { if (tickHata++ < 5) console.error('[KO] kare hatası', e); }
}
function tickIc() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const k = state.keys;
  const speed = state.speed * (state.run ? 1 : 0.45) * (state.ghost && state.hizli ? 3 : 1);   // GM: V → +%200
  const bh = state.buffHiz && performance.now() < state.buffHiz.until ? state.buffHiz.k : 1;   // güçlendirme (Sprint vb.)
  const speedB = speed * bh;

  // klavye: W/S ileri-geri (kameraya göre), A/D dönüş (KO gibi), Q/E yana adım
  let fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  let side = 0;   // Q-E ile yana kayma kapalı
  let turn = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  // (7.11) tablet joystick (tablet.js): yön kameraya göre (yukarı = kameradan ileri); karakter o yöne döner ve W gibi ilerler
  if (state.joy && !fwd && !turn) {
    const J = state.joy, sy = Math.sin(state.camYaw), cy0 = Math.cos(state.camYaw);
    const wx = -sy * J.y - cy0 * J.x, wz = -cy0 * J.y + sy * J.x;   // ekran sağı oyun koordinatında (-cos, sin): sahne z ekseni ters (toThree)
    if (Math.hypot(wx, wz) > 0.05) {
      const want = Math.atan2(wx, wz), diff = ((want - state.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (!state.otur && !state.frozen) state.yaw += diff * Math.min(1, dt * 14);
      fwd = 1;
    }
  }
  // KO dinlenme: otururken hareket yok; hareket isteğinde "dinlenme modundan çık?" sorulur
  if (state.otur && (fwd || turn || state.target) && state.dinlen?.engelle()) { fwd = 0; turn = 0; state.target = null; marker.visible = false; }
  if (turn) { state.yaw += turn * 2.4 * dt; state.camYaw += turn * 2.4 * dt; }
  if (state.donus > 0) { const a = Math.min(state.donus, dt * Math.PI / 0.4); state.camYaw += a; state.donus -= a; if (state.donus <= 1e-4) state.donus = 0; }   // (3.11) yalnız kamera döner; karakter yönü değişmez
  const p = player.position;
  const before = p.clone();
  // orijinal hareket: adım adım (en fazla 0.5 m), engelle karşılaşınca durur
  const walk = (dx, dz, dist) => {
    let moved = false;
    while (dist > 1e-4) {
      const d = Math.min(dist, 0.5); dist -= d;
      const n = moveStep(state.col, state.heightAt, state.normalAt, p, dx, dz, d, state.world, state.ghost);
      if (!n) return moved ? 'kısmi' : false;
      p.set(n.x, n.y, n.z); moved = true;
    }
    return true;
  };
  if (state.frozen) { fwd = side = 0; state.target = null; marker.visible = false; }
  // KO: ok atarken (R ya da ok yeteneği) yay gerilirken (ok çıkana dek) kıpırdayamaz; ok çıkınca hemen yürünür
  const okKilidi = performance.now() < (state.okKilit || 0);
  if (okKilidi) { if (fwd || side) state.okWIstek = performance.now(); fwd = side = 0; }
  if (!state.target && marker.visible && !(fwd || side)) marker.visible = false;   // yürüme hedefi iptal edildi (saldırı / yetenek): işaret kalkar   // yay gerilirken W: ok çıkınca animasyon kesilir (kombo)
  // (4.11) KO: W basılıyken R'ye basılıyorsa (son 1,5 sn) saldırı kesilmez; karakter hedefe dönüp ona doğru yürür, vuruş menzilinde durur
  let wSaldiri = false; state.wSaldiri = false;
  if (fwd > 0 && !side && performance.now() - (state.sonR || 0) < 1500) {
    const ct = state.combat?.target, ah = state.arena?.hedef;
    const hp = ct && !(ct.dead_until && new Date(ct.dead_until) > new Date()) ? ct.pos : ah ? state.arena?.konum?.(ah) : null;
    if (hp) {
      wSaldiri = true; state.wSaldiri = true; state.target = null; marker.visible = false;
      const dx = hp.x - p.x, dz = hp.z - p.z, uz = Math.hypot(dx, dz), menzil = ct ? (Number(ct.t?.attack_range) || 2) + 0.6 : 2.6;
      // hedefe dönerek koşar; menzile girince de durmaz — hedefin içine kadar geldiyse baktığı yöne koşmaya devam eder (R menzildeyse vurur)
      if (uz > 0.8) state.yaw = Math.atan2(dx, dz);
      walk(Math.sin(state.yaw), Math.cos(state.yaw), speedB * dt);
      void menzil;
    }
  }
  if (wSaldiri) { /* yukarıda işlendi */ }
  else if (fwd || side) {
    state.combat?.cancel();
    state.target = null; marker.visible = false;
    const dir = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    const right = new THREE.Vector3(dir.z, 0, -dir.x);
    const mv = dir.multiplyScalar(fwd).add(right.multiplyScalar(side)).normalize();
    walk(mv.x, mv.z, speedB * dt * (fwd < 0 ? 0.6 : 1));
  } else if (state.target && !okKilidi) {
    const d = new THREE.Vector3(state.target.x - p.x, 0, state.target.z - p.z);
    const len = d.length();
    if (len < 0.3) { state.target = null; marker.visible = false; }
    else {
      const want = Math.atan2(d.x, d.z);
      let diff = ((want - state.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      state.yaw += diff * Math.min(1, dt * 10);
      d.divideScalar(len);
      if (walk(d.x, d.z, Math.min(len, speedB * dt)) !== true) { state.target = null; marker.visible = false; }
    }
  }
  player.rotation.y = state.yaw;
  // kilit bittikten sonra yürümeye başlanırsa ok atma animasyonu hızla kesilir
  if (p.x !== before.x || p.z !== before.z) state.sonHareket = performance.now();   // "hareket hâlinde" denetimi (Cat's / Lupine Eyes, Cure Curse)
  // KO ok kombosu (ör. 3'lü ok → W → 5'li ok): ok çıktıktan sonra yürünürse yay animasyonu kesilir ve sıradaki ok yeteneği beklemeden atılabilir
  if (state.avatar && !okKilidi && (p.x !== before.x || p.z !== before.z) && !(performance.now() < (state.yurYetBit || 0)) && (['a26', 'atk_bow', 'a28'].includes(state.avatar.clip) || (!state.wSaldiri && (state.avatar.clip === 'attack' || /^atkb?_/.test(state.avatar.clip || ''))))) { state.avatar.stopOnce?.(); state.yetenekKlipBit = Math.min(state.yetenekKlipBit || 0, performance.now()); }   // (4.11) düz R vuruşu animasyonu da: bitmeden yürünürse kesilir
  if (state.avatar) {
    const moved = Math.hypot(p.x - before.x, p.z - before.z) / Math.max(dt, 1e-3);
    const back = (k.has('KeyS') || k.has('ArrowDown')) && !(k.has('KeyW') || k.has('ArrowUp'));
    state.moveHold = moved > 0.5 ? 0.15 : Math.max(0, (state.moveHold || 0) - dt);   // kare atlamalarında titremesin
    const clipName = state.dinlen?.klipAdi?.() || (state.pazarKanat ? (state.pazarKanat.asama === 'iniyor' ? 'wing_s' : state.pazarKanat.asama === 'oturuyor' ? 'wing_b' : 'wing_e') : null) || (state.moveHold > 0 ? (back && state.avatar.has('walk_back') ? 'walk_back' : state.run ? 'run' : 'walk') : (state.savasDurus || 'breath'));
    state.avatar.setClip(clipName);
    // KO ayak sesi (Player_walk_0): adım başına bir kez
    if (state.moveHold > 0 && !state.ucuyor) { state.adimYol = (state.adimYol || 0) + Math.hypot(p.x - before.x, p.z - before.z); if (state.adimYol > (state.run ? 2.4 : 1.5)) { state.adimYol = 0; sesAdim(p); } } else state.adimYol = 0;
    { const g = state.avatar.group; if (g) g.position.y = state.pazarUcus ? state.pazarUcus + Math.sin(performance.now() / 650) * 0.12 : 0;   // (4.11) kanatlı pazar: havada süzülme
      const nc = state.pazarAcik && state.pazarOturuyor && !state.pazarUcus && !state.pazarKanat ? 'sit' : clipName;   // (6.11) yalnız gerçekten oturuyorsa (kanatlı / C ile kalkmış satıcı ayakta yayınlanır)   // (5.11) kanatlı pazar: wing_S / wing_B yayınlanır   // (2.11) pazar kurulu: diğerleri yere oturmuş görür (sit_breath)
      if (nc !== state.clipNow) { state.clipNow = nc; state.net?.kick?.(); } }   // diğer oyunculara hemen bildir
    state.avatar.update(dt, clipName === 'run' || clipName === 'walk' || clipName === 'walk_back' ? KOSU_ANIM : 1);
    etiketBasIzle(state.nameSp, state.avatar);
  }

  kenarKaydir(dt);
  // üçüncü şahıs kamera (araziye girmez)
  let cx = p.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * state.camDist;
  let cz = p.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * state.camDist;
  let cy = p.y + 1.6 + Math.sin(state.camPitch) * state.camDist;
  cy = Math.max(cy, state.heightAt(cx, cz) + 0.8);
  if (state.col) {
    const hx = p.x, hy = p.y + 1.6, hz = p.z;
    let vx = cx - hx, vy = cy - hy, vz = cz - hz; const L = Math.hypot(vx, vy, vz); vx /= L; vy /= L; vz /= L;
    const hit = state.col.segment(hx, hy, hz, vx, vy, vz, L);
    if (hit >= 0 && hit > 0.6) { const k = hit - 0.3; cx = hx + vx * k; cy = hy + vy * k; cz = hz + vz * k; }
  }
  camera.position.copy(toThree(cx, cy, cz));
  if (state.nameSp) state.nameSp.visible = FX.names;   // kamera yakınken de isim görünür
  camera.lookAt(toThree(p.x, p.y + 1.6, p.z));
  // izleyici modu açıkken görüş kırpması izleyici kamerasına göre (GM haritada uzaklara bakarken nesneler kaybolmasın)
  const izK = state.izleyici?.aktif ? state.izleyici.konum : null, kx = izK ? izK.x : cx, ky = izK ? izK.y : cy, kz = izK ? izK.z : cz;
  const izUzak = izK ? 1400 : WORLD_DIST;   // izleyicide sis yok: uzaklar da çizilir
  if (state.objects) { state.objects.userData.tick(clock.elapsedTime, FX.wind); state.objects.userData.cull(camLocal.set(kx, ky, kz), izK ? 600 : VIEW_DIST, izUzak); }
  state.terrain?.userData.cull?.(kx, kz, izUzak);
  state.combat?.update(dt, clock.elapsedTime);
  state.arena?.update(dt);
  state.ors?.update?.(); state.kapi?.update?.(); state.madenMod?.update?.();
  if (state.oyuncuMenuBekle) {   // sağ tıklanan oyuncuya yaklaşınca menü
    const b = state.oyuncuMenuBekle, r = remotes.get(b.id) || remotes.get(String(b.id));
    if (!r) state.oyuncuMenuBekle = null;
    else if (Math.hypot(player.position.x - r.obj.position.x, player.position.z - r.obj.position.z) <= 7) { state.oyuncuMenuBekle = null; state.target = null; state.takas?.oyuncuMenu(b.id, r.meta, b.x, b.y); }
    else if (!state.target) state.oyuncuMenuBekle = null;
  }
  state.loot?.update(dt); state.bayrak?.update(dt); state.pet?.update(dt);
  state.gorunmez?.update(dt);
  yurIsaretGuncelle();
  state.fx?.update(dt);
  golgeler.update(camLocal);
  oyuncuSecimIsaret();
  state.npcs?.update(dt, camLocal); state.npcUi?.update(); state.towers?.update(dt, camLocal); state.gmWin?.update();
  eslantKapi();
  if (state.water && FX.water) state.water.userData.tick(clock.elapsedTime);
  // diğer oyuncular: 120 ms gecikmeli ara değerleme (anlık paket dalgalanmasını yutar), paket gelmezse kısa süre hızla ileri kestirim
  const simdi = performance.now();
  _frus.setFromProjectionMatrix(_frusM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  for (const r of remotes.values()) {
    const buf = r.buf; if (!buf?.length) continue;
    const rNow = simdi - (r._gec || 120);
    const o = r.obj.position;
    let i = buf.length - 1; while (i > 0 && buf[i - 1].t > rNow) i--;
    const b = buf[i], a = i > 0 ? buf[i - 1] : null;
    let x, y, z, yaw, snap;
    if (a && rNow <= b.t && rNow >= a.t) {
      const k = (rNow - a.t) / Math.max(1, b.t - a.t);
      x = a.x + (b.x - a.x) * k; y = a.y + (b.y - a.y) * k; z = a.z + (b.z - a.z) * k;
      const dy = ((b.yaw - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; yaw = a.yaw + dy * k; snap = a;
    } else {
      const last = buf.at(-1), ex = Math.min(0.25, Math.max(0, (rNow - last.t) / 1000));
      x = last.x + last.vx * ex; y = last.y; z = last.z + last.vz * ex; yaw = last.yaw; snap = last;
    }
    // çok uzaksa (ışınlanma) doğrudan atla, değilse hafif yumuşat
    if (Math.hypot(x - o.x, z - o.z) > 15) o.set(x, y, z);
    else { const k2 = Math.min(1, dt * 20); o.x += (x - o.x) * k2; o.y += (y - o.y) * k2; o.z += (z - o.z) * k2; }
    const dYaw = ((yaw - r.obj.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI; r.obj.rotation.y += dYaw * Math.min(1, dt * 20);
    // optimizasyon: 70 m ötesindeki oyuncuların hiçbir şeyi (model, kanat, silah/GM/pathos efektleri) çizilmez ve güncellenmez;
    // isimler yalnız 45 m içinde
    const mesafe = Math.hypot(o.x - player.position.x, o.z - player.position.z);
    // görünmez (Stealth/Hide) ve Cat's/Lupine Eyes'ım yoksa: hiçbir şeyi çizilmez (uzak gibi)
    // GM gizlenme (gg): oyuncular gizli GM'i hiç görmez (GM'ler görür)
    const uzak = mesafe > 70 || (r.meta?.gg && !state.ghost) || (r.gz && state.gorunmez ? !state.gorunmez.uzakGuncelle(r) : false);
    if (!r.gz && ((r._alfa != null && r._alfa < 1) || (r.korumaBit && performance.now() < r.korumaBit))) state.gorunmez?.uzakGuncelle(r);   // giriş/doğma koruması: yanıp sönme
    r.obj.visible = !uzak;
    if (r.obj.userData.nameTag) r.obj.userData.nameTag.visible = mesafe <= 45;
    { const ch = r.obj.userData.chr; if (r.obj.userData.gmFx) r.obj.userData.gmFx.gizli = uzak; if (r.obj.userData.chr?._gmPeri) r.obj.userData.chr._gmPeri.gizli = uzak; if (r.obj.userData.genieFx) r.obj.userData.genieFx.gizli = uzak || !r.obj.visible;   // sonradan oluşan efektler de her karede işaretlenir
      const fxGizli = uzak || (!!ch?._don && !ch?._donGiy);   // canavara dönüşmüş oyuncunun silah/pathos efektleri görünmez (insan dönüşümlerinde görünür)
      for (const g of Object.values(ch?._glow || {})) for (const b of g.b || []) b.gizli = fxGizli;
      for (const b of ch?._pathos || []) if (b) b.gizli = fxGizli; }
    if (uzak) continue;
    const c = r.obj.userData.chr;
    if (c) {
      if (r.pendingAnim) { const pa = r.pendingAnim; r.pendingAnim = null; if (pa.n !== 'stop') c.playOnce(pa.n, { hold: !!pa.h }); }
      const sc = snap.c === 'sit' && c.has('sit_breath') ? 'sit_breath' : snap.c;   // (2.11) oturan (pazar / dinlenme) uzak oyuncu: oturma hareketi döngüde tekrar etmez, oturuş nefesi
      const want = sc && c.has(sc) ? sc : (Math.hypot(snap.vx, snap.vz) > 0.5 ? (Math.hypot(snap.vx, snap.vz) > 3.6 ? 'run' : 'walk') : 'breath');
      c.setClip(want);
      // (6.11) animasyon ayrıntı düzeyi: kemik pozu (JS'te hesaplanıyor) ekranda ve yakında her karede; 30 m ötesi 30 Hz, 50 m ötesi 15 Hz,
      //   ekran dışında 4 Hz (vuruş / bitiş olayları birikmiş süreyle yine zamanında tetiklenir)
      r._adt = (r._adt || 0) + dt;
      r.obj.getWorldPosition(_rwp); _rsf.center.copy(_rwp); _rsf.center.y += 1;
      const ekranda = _frus.intersectsSphere(_rsf);
      const aralik = !ekranda ? 0.25 : mesafe > 50 ? 1 / 15 : mesafe > 30 ? 1 / 30 : 0;
      if (r._adt >= aralik || (ekranda && c.onceBilgi?.())) {
        c.update(r._adt, ['run', 'walk', 'walk_back'].includes(want) ? KOSU_ANIM : 1); r._adt = 0;
        if (ekranda) etiketBasIzle(r.obj.userData.nameTag, c);
      }
    }
  }
  if (state.sky) state.sky.userData.tick(clock.elapsedTime, camera.position);
  state.sky?.userData.gunes?.(camera);

  // gizli sekme: çizim yok (görünmüyor), oyun mantığı ve ağ sürer — arkaplan.js rAF'ı 20 Hz worker adımına çevirir
  if (!document.hidden) {
    state.yardimci?.update(dt);   // GM yardımcıları (sahiplerini izler)
    tuval.uygula();   // (7.11) bekleyen tuval boyutu / oranı yalnız burada (çizimden hemen önce) — siyah kare yok
    if (state.izleyici?.aktif) state.izleyici.kare(dt, clock.elapsedTime);   // GM izleyici görüntüsü (panel tuvaline), ana çizimden önce
    if (post) post.render(scene, camera); else renderer.render(scene, camera);
    invPreview(dt); if (bubbles.size) tickBubbles(clock.elapsedTime);
    updateLabels();
  }
  updateHud(dt);
}

// ---------------- envanter: perdeli bölümde karakter canlı (oyundaki animasyonun aynısı), fareyle döndürülür
let inv = null;
function invPreview(dt) {
  const area = hud.invArea();
  if (!area || !state.avatar || !BOOT?.character) { if (inv) inv.cv.style.display = 'none'; return; }
  if (!inv) {
    const cv = document.createElement('canvas'); cv.className = 'ko-env-karakter';
    const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
    r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x445533, 1.25));
    const l = new THREE.DirectionalLight(0xfff4e0, 1.5); l.position.set(0.5, 1, 1.2); sc.add(l);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const holder = new THREE.Group(); holder.rotation.y = Math.PI; sc.add(holder);
    inv = { cv, r, sc, cam, holder, api: null, yaw: 0, fit: false };
    const c = BOOT.character;
    createCharacter(c.race, { face: c.face ?? 0, hair: c.hair ?? 0, sacRenk: c.sac_renk ?? null }).then((api) => {
      if (!api) return; api.fxOk = false; api.group.scale.z = -1; holder.add(api.group); inv.api = api;
      state.gearReady?.then(() => state.donanim?.applyGear(api, c.race, state.gear || []));
    }).catch(() => {});
    let dx = null;
    cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); dx = e.clientX; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (dx != null) { inv.yaw += (e.clientX - dx) * 0.012; dx = e.clientX; } });
    cv.addEventListener('pointerup', () => (dx = null));
  }
  if (inv.cv.parentElement !== area) area.append(inv.cv);
  inv.cv.style.display = 'block';
  const w = area.offsetWidth, h = area.offsetHeight, pr = Math.min(devicePixelRatio || 1, 2);
  if (inv.cv.width !== Math.round(w * pr) || inv.cv.height !== Math.round(h * pr)) { inv.r.setPixelRatio(pr); inv.r.setSize(w, h, false); inv.cam.aspect = w / h; inv.cam.updateProjectionMatrix(); }
  // (6.11) envanterdeki karakter önizlemesi (ikinci WebGL tuvali) en çok 30 FPS
  inv._acc = (inv._acc || 0) + dt; if (inv._acc < 1 / 30) return; dt = inv._acc; inv._acc = 0;
  if (inv.api) {
    const a = state.avatar;
    // tek seferlik animasyonlar (madencilik a151, beceriler…) envanterde de aynı karede oynar
    const ob = a.onceBilgi?.();
    if (ob) { inv.api.onceEsitle?.(ob); inv.api.update(dt); }
    else { inv.api.onceEsitle?.(null); inv.api.setClip(a.clip); inv.api.update(dt); }
    if (!inv.fit) {   // kamerayı modelin boyuna göre ayarla
      _box.setFromObject(inv.api.group, true);
      if (!_box.isEmpty()) { const H = _box.max.y - _box.min.y, cy = (_box.max.y + _box.min.y) / 2; inv.cam.position.set(0, cy, H * 2.05); inv.cam.lookAt(0, cy, 0); inv.fit = true; }
    }
  }
  inv.holder.rotation.y = Math.PI + inv.yaw;
  inv.r.render(inv.sc, inv.cam);
}

// ---------------- HUD
const miniCtx = $('mini-dot').getContext('2d');
const hudSon = { k: '', m: '' };
// uyarlamalı çözünürlük: FPS çok düşerse (< 30) çizim çözünürlüğü kademeli azalır (seçilen kalitenin en az %80'i, ama ekran çözünürlüğünün altına asla — (6.11) bulanıklık), FPS toparlanınca (> 50) geri yükselir
const _prO = { ort: 60, son: 0 };
function uyarlaCozunurluk(f, now) {
  if (document.hidden || window.__koPrSabit || true) return;   // (7.11) kapalı: FPS düşünce (ilk girişte yükleme sırasında) çözünürlüğü düşürüp görüntüyü bulanıklaştırıyordu; çizim her zaman ekranın kendi çözünürlüğünde
  _prO.ort = _prO.ort * 0.6 + f * 0.4;
  if (now - _prO.son < 1500) return;
  // modeller bulanıklaşmasın: çözünürlük en çok %20 düşer (eskiden %45 → düşük FPS'te karakter / NPC dokuları belirgin şekilde bulanıklaşıyordu)
  const tavan = window.__koPR || renderer.getPixelRatio(), taban = tavan > 1 ? Math.max(1, tavan * 0.8) : tavan, cur = renderer.getPixelRatio();
  let yeni = cur;
  if (_prO.ort < 30 && cur > taban + 0.01) yeni = Math.max(taban, cur - 0.05);
  else if (_prO.ort > 50 && cur < tavan - 0.01) yeni = Math.min(tavan, cur + 0.05);
  if (yeni !== cur) { renderer.setPixelRatio(yeni); _prO.son = now; }
}
function updateHud(dt) {
  const now = performance.now(); fpsN++;
  if (!fpsT) fpsT = now;
  if (now - fpsT > 500) { const f = fpsN * 1000 / (now - fpsT); $('fps').textContent = Math.round(f) + ' FPS'; fpsT = now; fpsN = 0; uyarlaCozunurluk(f, now); }
  const p = player.position;
  // yalnız değişince yaz/çiz (her karede DOM ve tuval yazmak gereksiz yük)
  const kt = `X ${p.x.toFixed(0)}  Z ${p.z.toFixed(0)}`;
  if (kt !== hudSon.k) { hudSon.k = kt; $('konum').textContent = kt; }
  const mk = p.x.toFixed(1) + ',' + p.z.toFixed(1) + ',' + state.yaw.toFixed(2) + ',' + miniCtx.canvas.width;
  if (mk === hudSon.m) return; hudSon.m = mk;
  // mini harita: görüntünün üstü = kuzey (z büyük)
  const s = miniCtx.canvas.width;
  miniCtx.clearRect(0, 0, s, s);
  const mx = (p.x / state.world) * s, my = (1 - p.z / state.world) * s;
  hud.miniFocus?.(p.x / state.world, 1 - p.z / state.world);
  miniCtx.save(); miniCtx.translate(mx, my); miniCtx.rotate(state.yaw);
  miniCtx.fillStyle = '#ffd35a'; miniCtx.strokeStyle = '#000'; miniCtx.lineWidth = 1.5;
  miniCtx.beginPath(); miniCtx.moveTo(0, -7); miniCtx.lineTo(5, 5); miniCtx.lineTo(-5, 5); miniCtx.closePath(); miniCtx.fill(); miniCtx.stroke();
  miniCtx.restore();
}

// mini haritaya tıkla → oraya git
$('mini-dot').addEventListener('click', (e) => {
  const r = e.target.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * state.world, z = (1 - (e.clientY - r.top) / r.height) * state.world;
  state.target = new THREE.Vector3(x, state.heightAt(x, z), z);
  marker.position.copy(state.target).add(new THREE.Vector3(0, 0.08, 0)); marker.visible = true;
});

// ---------------- başlat
(async () => {
  try {
    status(`Loading ${hud.zoneName || ZONE}…`, 0.05);
    const base = `${ASSETS}/${HARITA}`;
    // harita yüklenirken paralel: karakter modeli, eşya modelleri (meta + kuşanılı eşyaların dosyaları) ve envanter satırları
    // → oyun açıldığında karakter eşyalarıyla birlikte görünür (önce çıplak görünüp sonra eşya "atlamaz")
    const AVATAR_P = loadCharacterMeta(CHR_ASSETS).then((m) => m ? createCharacter(BOOT?.character?.race ?? Number(params.get('irk') || 1), { face: BOOT?.character?.face ?? 0, hair: BOOT?.character?.hair ?? 0, sacRenk: BOOT?.character?.sac_renk ?? null }) : null).catch((e) => { console.warn('karakter modeli', e); return null; });
    state.gearReady = import('./donanim.js').then((m) => { state.donanim = m; if (state.fx) m.setFx(state.fx); return m.loadDonanim(params.get('npcassets') || REMOTE_ZONES); }).catch((e) => console.warn('eşya modelleri', e));
    const INV_ON = BOOT?.sb && BOOT.character ? BOOT.sb.from('inventory').select('slot,item_num,count,durability,sure_sn,bitis,kiralik,kilit:kilit_hash,items(*)').eq('char_id', BOOT.character.id).then((r) => r, () => null) : null;
    const ILK_DONANIM = INV_ON ? Promise.all([AVATAR_P, state.gearReady, INV_ON, import('./envanter.js')]).then(async ([c, , r, E]) => {
      if (!c || !state.donanim || !r?.data) return;
      const eq = E.kusanilanlar(r.data); state.sonEq = eq; state.gear = state.donanim.gearCodes(kaskFiltre(eq));
      state.weaponEl = (state.gear.find((g) => g[0] === 6) || [])[2] || 0;
      await state.donanim.applyGear(c, BOOT.character.race, state.gear);
    }).catch((e) => console.warn('ilk donanım', e)) : null;
    import('./muzik.js').then((M) => M.muzikCal(M.bolgeMuzigi(HARITA))).catch(() => {});   // KO bölge müziği
    // GM'in dünya editöründe oluşturduğu özel harita (ozel_*): zemin dokuları ve gökyüzü şablon haritadan, arazi tohumdan üretilir
    let OZEL = null;
    if (/^ozel_/.test(HARITA) && BOOT?.sb) { try { ({ data: OZEL } = await BOOT.sb.from('ozel_harita').select('*').eq('id', HARITA).maybeSingle()); } catch {} }
    const zeminBase = OZEL ? `${LOCAL_ZONES.has(OZEL.sablon) ? './assets/zones' : REMOTE_ZONES}/${OZEL.sablon}` : base;
    const z = await loadZone(zeminBase);
    const AR = await import('./arazi.js').catch(() => null);
    if (OZEL && AR) AR.sekilUret(z, OZEL);
    if (AR && BOOT?.sb) { try { await AR.araziYukle(BOOT.sb, HARITA, z); } catch (e) { console.warn('arazi düzenlemeleri', e); } }   // dünya editörü fırça düzenlemeleri
    state.zemin = z;
    status('Building terrain…', 0.25);
    await new Promise((r) => setTimeout(r, 0));
    const terrain = buildTerrain(z, renderer);
    world.add(terrain);
    state.terrain = terrain; state.world = z.meta.worldSize; state.heightAt = makeHeightFn(z); state.normalAt = makeNormalFn(z);
    // yüzey kütüphanesi (GM yüzey boyası): boyanmış karo varsa doku dizisi yüklenir (tek sefer)
    let yuzeyIstendi = false, yuzeyP = null;   // (8.11) yükleme ekranı yüzey dokuları bitene dek kalkmaz
    const yuzeyGerekli = () => { if (yuzeyIstendi) return; yuzeyIstendi = true; yuzeyP = yuzeyYukle(renderer).then((y) => terrain.userData.yuzeyAyarla?.(y.tex)).catch((e) => { yuzeyIstendi = false; console.warn('yüzey kütüphanesi', e); }); };
    if (z.yuzeyGerek) yuzeyGerekli();
    if (AR) state.arazi = AR.initArazi({ sb: BOOT?.sb, zone: HARITA, state, z, terrain, character: BOOT?.character, hud, yuzeyGerekli });   // gerçek zamanlı arazi eşitleme (+ GM fırçası)
    // mini harita: minimap.jpg yoksa arazinin renk haritası (siyah kutu kalmasın)
    if (OZEL) { /* özel haritanın mini harita resmi yok */ }
    else if (z.meta.hasMinimap) $('mini-img').src = `${base}/minimap.jpg`;
    else if (z.meta.colormapPx) $('mini-img').src = `${base}/colormap.${z.meta.images || 'jpg'}`;
    try { const w = await loadWater(base, z.meta); if (w) { world.add(w); state.water = w; } } catch (e) { console.warn('su yüklenemedi', e); }
    let GUNES = null;
    try {
      const sk = await loadSky(`${zeminBase}/sky`);
      // Ardream: gökyüzünde KO güneşi; ışığı araziye (yamaç aydınlatması), nesnelere ve karakterlere aynı yönden düşer
      GUNES = { freezone_a: new THREE.Vector3(-0.6, 0.36, -0.7).normalize() }[ZONE] || null;
      if (sk) { state.sky = buildSky(sk, { scene, gunes: GUNES, dongu: true, time: oyunSaati() }); scene.add(state.sky); fogColor.copy(state.sky.userData.fogColor); }
      if (GUNES) {
        sun.position.copy(GUNES); sun.color.setHex(0xfff0d2); sun.intensity = 2.1; hemi.intensity = 0.95; hemi.color.setHex(0xcfe0ff);
        const tm = terrain.userData.material; terrain.updateMatrixWorld(true);
        const yerel = GUNES.clone().transformDirection(new THREE.Matrix4().copy(terrain.matrixWorld).invert());
        if (tm?.uniforms?.uSunAmt) { tm.uniforms.uSunAmt.value = 1; tm.uniforms.uSunDir.value.copy(yerel); tm.uniforms.uSun.value.setRGB(1.0, 0.93, 0.8); }
      }
    } catch (e) { console.warn('gökyüzü yüklenemedi', e); }
    // KO gün döngüsü: gök / sis / bulut renkleri, güneş-ay konumu ve ışıklar (n3sky Light0/1) saniyede bir güncellenir
    if (state.sky?.userData.zaman) {
      const t0 = terrain.userData.material, gunesBaz = sun.color.clone(), hemiBaz = hemi.color.clone(), hemiYer = hemi.groundColor.clone();
      const _y = new THREE.Vector3(), _m = new THREE.Matrix4();
      const gunUygula = () => {
        const I = state.sky?.userData.zaman?.(oyunSaati()); if (!I) return;
        fogColor.copy(state.sky.userData.fogColor);
        if (t0?.uniforms?.uLight) t0.uniforms.uLight.value.copy(I.light0);
        sun.color.copy(gunesBaz).multiply(I.light0); hemi.color.copy(hemiBaz).multiply(I.light1).lerp(hemiBaz.clone().multiply(I.light0), 0.5); hemi.groundColor.copy(hemiYer).multiply(I.light0);
        sun.intensity = (GUNES ? 2.1 : 1.5) * (0.55 + 0.45 * I.gunduz);
        if (GUNES) { sun.position.copy(I.gunesYon); if (t0?.uniforms?.uSunDir) { _y.copy(I.gunesYon).transformDirection(_m.copy(terrain.matrixWorld).invert()); t0.uniforms.uSunDir.value.copy(_y); t0.uniforms.uSunAmt.value = Math.max(0.15, I.gunduz); } }
        // yağmur / kar (hava.js): gök, sis ve ışık grileşip kararır
        const k = state.havaKapali || 0;
        if (k > 0.01) { const gri = new THREE.Color(0x6f7880); fogColor.lerp(gri, k * 0.55); scene.background?.isColor && scene.background.lerp(gri, k * 0.6); sun.intensity *= 1 - 0.45 * k; if (t0?.uniforms?.uLight) t0.uniforms.uLight.value.multiplyScalar(1 - 0.25 * k); }
        try { post?.sisRengi?.(fogColor); } catch {}
      };
      gunUygula(); setInterval(gunUygula, 1000); state.gunUygula = gunUygula;
      kurOyunSaati(BOOT?.sb); oyunSaatiDegisti(() => { gunUygula(); state.havaMod?.guncelle?.(true); });   // GM saat / hava değişince anında
      import('./hava.js').then(({ initHava }) => { state.havaMod = initHava({ scene, state, camera, player, zone: ZONE, fogColor }); }).catch((e) => console.warn('hava', e));
    }
    // sis: tüm özel shader'lar aynı değerleri kullanır
    const fogMats = [terrain.userData.material, ...(state.water ? state.water.children.map((m) => m.material) : [])];
    for (const m of fogMats) { m.uniforms.uFogColor.value = fogColor; m.uniforms.uFogNear.value = FOG_NEAR; m.uniforms.uFogFar.value = FOG_FAR; }
    try {
      const objs = await loadObjects(base, renderer, (t) => { const m = /\((\d+)\/(\d+)\)/.exec(t); status(t, m ? 0.3 + 0.45 * (m[1] / m[2]) : 0.3); });
      if (objs) { world.add(objs); state.objects = objs; }
      const cr = await fetch(`${base}/objects/collision.bin`);
      if (cr.ok) {
        const raw = await cr.arrayBuffer();
        let f;
        if (objs?.userData.collision?.fmt === 'i16') { const q = new Int16Array(raw), k = objs.userData.collision.scale; f = new Float32Array(q.length); for (let i = 0; i < q.length; i++) f[i] = q[i] * k; }
        else f = new Float32Array(raw);
        state.col = new Collision(f, state.world);
      }
    } catch (e) { console.warn('nesneler yüklenemedi', e); }
    // karakter modelleri (dönüştürülmüşse)
    try {
      status('Loading character…', 0.8);
      {
        const c = await AVATAR_P;
        if (c) {
          player.children.forEach((o) => (o.visible = false)); player.add(c.group); state.avatar = c;
          c.sesSilah = () => { const it = state.inv?.items; const w = [6, 8].map((y) => it?.get?.(y)?.it).find((x) => x && Number(x.Damage) > 0); return w ? { num: Number(w.Num), org: Number(w.org) || 0 } : null; };   // KO: silahın vuruş sesi
          if (state.benimPel) pelerinUygula(BOOT.sb, c, BOOT?.character?.race, state.benimPel).catch(() => {});
          state.fitKendi = (m) => { if (state.nameSp) fitName(player, m, state.nameSp); };
          if ((Number(BOOT?.character?.boyut) || 100) !== 100) boyutUygula(c, BOOT.character.boyut, state.fitKendi);
          { const bb = BOOT?.character?.buffs?.['3'], kalan = bb ? Number(bb.until) - Date.now() / 1000 : 0;   // oyuna girişte süren Bezoar / Rice Cake boyutu
            if (kalan > 1) setTimeout(() => state.boyutEtki?.(Number(bb.esya) === 389035000 ? 490035 : 490034, kalan), 0); }
          if (state.donusum && donusumGorunur(state.donusum, BOOT?.character?.zone)) donusumGorsel(c, { pid: state.donusum.pid, b: state.donusum.b, bit: state.donusum.bit, gm: !!state.donusum.gm }, state.fitKendi, state.gear);
          // tek seferlik animasyonlar (saldırı, darbe, ölüm…) diğer oyunculara da gitsin
          const po = c.playOnce.bind(c), so = c.stopOnce.bind(c);
          c.playOnce = (n, o = {}) => { const r = po(n, o); if (r !== false && !(o.r && performance.now() < (state.yetenekYayinBit || 0))) state.net?.anim?.(n, !!o.hold, o.speed); return r; };   // Z-R-yetenek kombosunda diğer oyuncular yeteneğin animasyonunu görür (araya giren R kolu yayınlanmaz)
          c.stopOnce = (anlik) => { so(anlik); if (!state.yayinSustur) state.net?.anim?.(anlik ? 'stopx' : 'stop'); };
        }
      }
    } catch (e) { console.warn('karakter modeli yüklenemedi', e); }
    // (3.11) GM ırk / meslek değişimi oyundan çıkmadan: model yeniden kurulur, statlar / yetenekler / kısayol çubuğu sıfırlanır
    state.karakterDegisti = async (d) => {
      const c = BOOT.character; if (!c || !d) return;
      Object.assign(c, { race: Number(d.race), class: Number(d.class), nation: Number(d.nation), face: 0, hair: 0 });
      try {
        const yeni = await createCharacter(c.race, { face: 0, hair: 0, sacRenk: c.sac_renk ?? null });
        if (yeni) {
          const eski = state.avatar;
          await state.gearReady; if (state.gear) await state.donanim?.applyGear(yeni, c.race, state.gear);
          if (eski?.group) { eski.group.removeFromParent(); try { eski.dispose?.(); } catch {} }
          player.add(yeni.group); state.avatar = yeni;
          yeni.sesSilah = eski?.sesSilah;
          const po = yeni.playOnce.bind(yeni), so = yeni.stopOnce.bind(yeni);
          yeni.playOnce = (n, o = {}) => { const r = po(n, o); if (r !== false && !(o.r && performance.now() < (state.yetenekYayinBit || 0))) state.net?.anim?.(n, !!o.hold, o.speed); return r; };
          yeni.stopOnce = (anlik) => { so(anlik); if (!state.yayinSustur) state.net?.anim?.(anlik ? 'stopx' : 'stop'); };
          if (state.benimPel) pelerinUygula(BOOT.sb, yeni, c.race, state.benimPel).catch(() => {});
          state.fitKendi?.(yeni.group);
          if (inv?.api) { inv.api.group.removeFromParent(); inv.api = null; createCharacter(c.race, { face: 0, hair: 0 }).then((api) => { if (!api || !inv) return; api.fxOk = false; api.group.scale.z = -1; inv.holder.add(api.group); inv.api = api; state.donanim?.applyGear(api, c.race, state.gear || []); }).catch(() => {}); }
        }
      } catch (e) { console.warn('karakter değişimi', e); }
      dispatchEvent(new CustomEvent('ko-yetenek-sifirlandi'));   // kısayol çubuğunun 8 sayfası boşalır
      dispatchEvent(new CustomEvent('ko-stat-sifirlandi'));   // (6.11) ırk / meslek değişimi: stat presetleri de silindi (sunucu)
      import('./yetenek.js').then((Y) => Y.yenileBilgi()).catch(() => {});
      try { await state.inv?.reload?.(); } catch {}
      if (d.stats) { try { state.combat?.applyStats?.(d.stats.ability ? { hp: d.stats.hp, max_hp: d.stats.max_hp, mp: d.stats.mp, max_mp: d.stats.max_mp } : d.stats); } catch {} }
      state.net?.izle?.();   // diğer oyuncular yeni modeli görür (meta değişti → yeniden kurulur)
      hud.info?.('Your race / class has been changed. Stats, skills and the shortcut bar have been reset.', 'seviye');
    };
    // başlangıç: URL ?x=&z= ya da bölgeye özgü nokta
    const zi = await ZONE_INFO;
    const start = (zi?.start_x > 0 && zi?.start_z > 0 ? [zi.start_x, zi.start_z] : null) || { moradon: [760, 560] }[ZONE] || z.meta.start || [state.world / 2, state.world / 2];
    let sx = Number(params.get('x')) || start[0], sz = Number(params.get('z')) || start[1];
    if (BOOT?.character) {
      const c = BOOT.character;
      if (c.x > 0 && c.z > 0 && c.x < state.world && c.z < state.world) { sx = c.x; sz = c.z; state.yaw = c.yaw || 0; state.camYaw = state.yaw + Math.PI; }
      player.children[0].material.color.setHex(NATION_COLOR[c.nation] ?? 0xb03a2e);
      state.ghost = GMS.has(Number(c.id));   // GM'ler binaların içinden geçebilir
      state.gmOlumsuz = !!c.gm_olumsuz;   // GM paneli: hasar yemez
      state.nameSp = nameSprite(c.name, AD_RENK.ben, { gm: state.ghost }); player.add(state.nameSp);
      // KO PK sembolleri (NP / LP sıralaması): isimlerin solunda
      // Seed (kız) seçenek / yardımcı penceresi önceden hazırlanır: yerleşim + doku atlasları oyun açıldıktan kısa süre sonra iner, pencere açılınca her şey aynı anda görünür
      setTimeout(() => { import('./secenek-ko.js').then((m) => m.secenekHazir()).catch(() => {}); for (const u of ['./assets/ui/seed/atlas_0.webp', './assets/ui/secek/atlas_0.webp', './assets/ui/secek/big_0.png']) { const im = new Image(); im.src = (window.KO_V || ((x) => x))(u); im.decode?.().catch(() => {}); } }, 4000);
      if (false && BOOT?.sb) import('./bilezik.js').then(({ initBilezik }) => { state.bilezik = initBilezik({ sb: BOOT.sb, state, benId: c.id, remotes }); }).catch((e) => console.warn('bilezik', e));   // KO ilk 3 klan bileziği
      if (BOOT?.sb) import('./rutbe.js').then(({ initRutbe }) => { state.rutbe = initRutbe({ sb: BOOT.sb, hud }); state.rutbe.isaretle(state.nameSp.userData.el, c.id); for (const [rid, r] of remotes) state.rutbe.isaretle(r.obj.userData.nameTag?.userData.el, rid); }).catch((e) => console.warn('rütbe', e));
      if (state.avatar) fitName(player, state.avatar.group, state.nameSp);
    }
    let sy = state.heightAt(sx, sz);
    if (state.col) {   // platform/köprü üstündeyse onun yüzeyine koy
      const ref = BOOT?.character?.y || sy + 2;
      const yc = state.col.heightNear(sx, ref, sz);
      if (yc > sy && yc < sy + 3) sy = yc;
    }
    player.position.set(sx, sy, sz);
    // NPC'ler (yerleşim sitede, modeller Storage'da) — yüklenmeleri oyunu bekletmez
    state.npcBase = params.get('npcassets') || REMOTE_ZONES;
    const NPC_P = import('./npcs.js').then(({ spawnNpcs }) => spawnNpcs({ zone: ZONE, world, state, nameSprite, textSprite, remoteBase: params.get('npcassets') || REMOTE_ZONES, showIds: !!state.ghost, namesOn: () => FX.names, sb: BOOT?.sb || null }))
      .then(async (n) => {
        if (!n) return;
        state.npcs = n;
        import('./logos.js').then(({ logosKur }) => logosKur({ npcs: n, sb: BOOT?.sb || null, zone: ZONE })).catch((e) => console.warn('logos', e));   // Spirit of Logos: 4 saatte bir tek yerde
        const { initNpcUi } = await import('./npc-pencere.js');
        state.npcUi = initNpcUi({ npcs: n, state, player, camera, canvas, sb: BOOT?.sb || null, character: BOOT?.character || null, zone: ZONE, hud,
          say: (t, cls) => addLine(null, t, 0, cls), bubble: (root, tag, text) => chatBubble(root, tag, text, false, true) });
        setTimeout(() => import('./notice.js').then(({ noticeGoster }) => noticeGoster({ sb: BOOT?.sb || null, character: BOOT?.character || null })).catch((e) => console.warn('notice', e)), 2500);   // KO Notice: etkinlik varsa ilk girişte sağdan
        import('./oto-sohbet.js').then(({ initOtoSohbet }) => initOtoSohbet({ state, player, sb: BOOT?.sb || null, character: BOOT?.character || null, say: (t, cls) => addLine(null, t, 0, cls), bubble: (root, tag, text) => chatBubble(root, tag, text, false, true) })).catch((e) => console.warn('oto sohbet', e));   // NPC bağırmaları + otomatik duyurular
        // (3.11) KO parti sistemi (davet, parti penceresi, Party War Board, parti sohbeti)
        if (BOOT?.sb && BOOT?.character?.id) import('./parti.js').then(({ initParti }) => { state.parti = initParti({ sb: BOOT.sb, character: BOOT.character, hud, state, say: (ad, t, ulus, cls, id) => addLine(ad, t, ulus, cls, id) }); }).catch((e) => console.warn('parti', e));
        // (3.11) KO Party Board (görev çubuğu parti düğmesi) + isim üstü "Seeking Party : Level a ~ b"
        state.isimEl = (id) => (String(id) === String(BOOT?.character?.id) ? state.nameSp?.userData?.el : (remotes.get(String(id)) || remotes.get(Number(id)))?.obj?.userData?.nameTag?.userData?.el) || null;
        if (BOOT?.sb && BOOT?.character?.id) import('./parti-board.js').then(({ initPartiBoard }) => { state.partiBoard = initPartiBoard({ sb: BOOT.sb, character: BOOT.character, hud, state }); hud.onParti = () => { state.partiBoard.ac(true); state.partiBoard.ac_kapa(); }; }).catch((e) => console.warn('parti board', e));
        // (3.11) KO Tiptable: seviyeye göre sohbette sarı yardım mesajları (orijinal Tiptable_us.tbl)
        if (BOOT?.character?.id) import('./ipucu-tablo.js').then(({ initIpucuTablo }) => initIpucuTablo({ say: (t) => addLine(null, t, 0, 'ipucu-yesil'), seviye: () => state.combat?.stats?.level ?? BOOT.character.level, charId: BOOT.character.id })).catch((e) => console.warn('ipucu', e));
        // kuleler + GM paneli (mini haritadaki GM düğmesi)
        if (BOOT?.sb) {
          const { startTowers } = await import('./towers.js');
          state.towers = await startTowers({ zone: ZONE, world, state, player, sb: BOOT.sb, character: BOOT.character, nameSprite, remoteBase: params.get('npcassets') || REMOTE_ZONES, hud, onChange: () => state.gmWin?.refresh() }).catch((e) => { console.warn('kuleler', e); return null; });
          if (state.ghost) {
            const { initGmWindow } = await import('./gm-pencere.js');
            state.gmWin = initGmWindow({ state, player, sb: BOOT.sb, character: BOOT.character, zone: ZONE, zoneName: () => hud.zoneName || ZONE, hud, say: (t, cls) => addLine(null, t, 0, cls), towers: () => state.towers });
            ustDugmeler();
            { const T = await import('./tablet.js'); if (T.tabletAcik()) T.tabletUygula({ state }); }   // (7.11) GM tablet modu (sunucu listesi / GM paneli ayarlarından açılır)
          }
        }
      }).catch((e) => console.warn('NPC', e));
    // Oyuna girişte yüklenen her şey (savaş, çok oyunculu, NPC, pet, efektler, envanter…) yükleme ekranı açıkken hazırlanır;
    // yükleme ekranı ancak bunlar bitince (ya da en geç YUKLEME_SURE sonra) kalkar → oyuna girince sonradan beliren bir şey kalmaz.
    const YUKLE = [NPC_P];
    if (BOOT?.sb) watchAnnouncements(BOOT.sb);
    // Ardream seviye sınırı 59: 60+ oyuncu (GM hariç) Ardream'de kalamaz — girişte ve seviye atlayınca Moradon'a gönderilir
    if (BOOT?.sb && ZONE === 'freezone_a') {
      const ardKontrol = async () => {
        try {
          const { data } = await BOOT.sb.rpc('ardream_seviye_kontrol', { p_char: BOOT.character.id });
          if (!data?.cikti) return;
          clearInterval(ardT); hud.notice?.('The Ardream level limit is 59 (characters that have ever reached level 60 cannot enter). You are being sent to Moradon…', 'hata');
          state.net?.halt?.(); const u = new URL(location.href); for (const k of ['x', 'z', 'bolge']) u.searchParams.delete(k); u.searchParams.set('karakter', BOOT.character.id); setTimeout(() => location.replace(u.toString()), 1500);
        } catch {}
      };
      const ardT = setInterval(ardKontrol, 10000); ardKontrol();
    }
    if (BOOT?.sb && BOOT.character) {
      status('Connecting players…', 0.62);
      YUKLE.push(startMultiplayer(BOOT).catch((e) => console.warn('çok oyunculu', e)));
      try {
        status('Loading combat system…', 0.68);
        const { startCombat } = await import('./combat.js');
        state.combat = await startCombat({ sb: BOOT.sb, character: BOOT.character, world, camera, canvas, state, player, hud, nameSprite, namesOn: () => FX.monsterNames !== false });
        // KO özel mesaj (PM) ve posta kutusu (can çubuğunun yanındaki zarf)
        import('./pm.js').then(({ initPm }) => { state.pm = initPm({ sb: BOOT.sb, character: BOOT.character, hud }); }).catch((e) => console.warn('pm', e));
        hud.onWhisper = () => { const s = state.seciliOyuncu; if (s?.id && String(s.id) !== String(BOOT.character.id)) state.pm?.ac?.(Number(s.id), s.meta?.name || ''); };   // (8.11) oyuncu seçiliyken sohbet Whisper sekmesi → o oyuncuyla PM penceresi
        import('./mail.js').then(({ initMail }) => { state.mail = initMail({ sb: BOOT.sb, character: BOOT.character, hud, state }); }).catch((e) => console.warn('mail', e));
        // KO dinlenme (oturma): görev çubuğu otur/kalk düğmesi, otururken EXP
        import('./dinlen.js').then(({ initDinlen }) => { state.dinlen = initDinlen({ sb: BOOT.sb, character: BOOT.character, hud, state }); }).catch((e) => console.warn('dinlenme', e));
        import('./secenek-etki.js').catch(() => {});   // can / mana HUD (Sub HP Bar) her durumda kurulur
        import('./seed-mesaj.js').then(({ seedMesajKur }) => seedMesajKur({ state: { ...state, hud, me: BOOT.character }, zone: ZONE, level: () => state.combat?.stats?.level ?? BOOT.character.level })).catch((e) => console.warn('seed', e));   // KO Seed yardımcısı mesajları (sağ alt)
        import('./maden.js').then(({ initMaden }) => { state.madenMod = initMaden({ sb: BOOT.sb, character: BOOT.character, hud, state, player, zone: ZONE }); }).catch((e) => console.warn('madencilik', e));
        // KO görevleri: NPC görev menüsü + mini haritanın altında görev takip penceresi
        import('./gorev.js').then(({ initGorev }) => initGorev({ sb: BOOT.sb, character: BOOT.character, hud, seviye: () => state.combat?.stats?.level ?? BOOT.character.level,
          onOdul: (d) => { state.combat?.odulUygula?.(d); return state.inv?.reload?.(); }, onEsya: () => state.inv?.reload?.(),
          sinif: () => BOOT.character.class,
          esyaSay: (num) => { let n = 0; for (const [slot, e] of state.inv?.items || []) if (slot >= 14 && slot <= 41 && e.row.item_num === num) n += e.row.count || 1; return n; } }))
          .then((g) => { state.gorev = g; hud.onGorev = () => { state.ayarlar?.gorev?.().then((ok) => { if (!ok) g.seedAc(); }); }; let imza = ''; setInterval(() => { const it = state.inv?.items; if (!it) return; const s = [...it].map(([k, e]) => k + ':' + e.row.item_num + ':' + e.row.count).join(','); if (s !== imza) { imza = s; g.ciz(); } }, 1500); })
          .catch((e) => console.warn('görevler', e));
        // yetenekler: sunucu puan bilgisi + kısayol çubuğu (sürükle-bırak, 1-0 tuşları)
        import('./yetenek.js').then((Y) => Y.setYetenekBaglam({ sb: BOOT.sb, character: BOOT.character, hud })).catch(() => {});
        // GM bildirimleri (seviye/statü/Noah/usta değişti → durumu yenile; eşya veritabanı izni → pencereyi aç)
        BOOT.sb.channel('gm-bildirim-' + BOOT.character.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gm_bildirim', filter: `char_id=eq.${BOOT.character.id}` }, ({ new: b }) => {
          if (!b) return;
          if (b.veri?.mesaj) hud.notice?.(b.veri.mesaj, 'seviye');   // notice zaten aksiyon sohbetine de yazar (tek satır)
          if (b.veri?.class) { BOOT.character.class = b.veri.class; import('./yetenek.js').then((Y) => Y.yenileBilgi()).catch(() => {}); }
          if (b.tur === 'yenile') state.inv?.reload?.();
          if (b.tur === 'mineguard') state.mineguard?.uyari?.(b.veri || {});
          // web yönetici paneli: KC / susturma / ışınlama
          if (b.tur === 'cash' && b.veri?.cash != null) { BOOT.character.cash = b.veri.cash; dispatchEvent(new CustomEvent('ko-cash', { detail: b.veri.cash })); }
          if (b.tur === 'sustur') state.sustur = b.veri?.kaldir ? null : { bitis: b.veri?.bitis || null, neden: b.veri?.neden || '' };
          // GM dönüşümü: anında uygula (kaldır = eski görünüm)
          if (b.tur === 'donusum') { const v = b.veri || {}; if (v.kaldir) { state.donusumApi?.uygula?.(null); hud.info?.('The GM has removed your transformation.', 'seviye'); } else { state.donusumApi?.uygula?.({ ...v, bit: Number(v.bit) }); hud.info?.(`The GM has transformed you into ${v.ad}.`, 'seviye'); } }
          if (b.tur === 'isinla' && b.veri?.zone) {
            state.net?.halt?.(); const u = new URL(location.href); for (const k of ['x', 'z', 'bolge']) u.searchParams.delete(k); u.searchParams.set('karakter', BOOT.character.id);
            // halt öncesi son konum kaydı GM'in yazdığı konumu ezmiş olabilir → hedefi tekrar yaz
            const git = () => location.replace(u.toString());
            setTimeout(() => BOOT.sb.from('characters').update({ zone: b.veri.zone, x: b.veri.x, z: b.veri.z }).eq('id', BOOT.character.id).then(git, git), 600);
          }
          if (b.tur === 'esyadb') import('./veri-pencere.js').then(({ initVeriWindow }) => { (state.oyuncuVeri ||= initVeriWindow({ sb: BOOT.sb, character: BOOT.character, hud, say: (t, c) => addLine(null, t, 0, c), onGive: () => state.inv?.reload(), oyuncu: true })).open(); });
        }).subscribe();
        import('./muhafiz.js').then(({ initMuhafiz }) => { state.muhafiz = initMuhafiz({ sb: BOOT.sb, character: BOOT.character, state, player, zone: ZONE }); }).catch((e) => console.warn('muhafız', e));   // kasaba muhafızları
        import('./mineguard.js').then(({ initMineGuard }) => { state.mineguard = initMineGuard({ sb: BOOT.sb, character: BOOT.character, hud, addLine }); }).catch((e) => console.warn('mineguard', e));   // MineGuard gözcüsü
        import('./dunya.js').then(({ initDunya }) => { state.dunya = initDunya({ sb: BOOT.sb, world, zone: ZONE, state }); }).catch((e) => console.warn('dünya objeleri', e));
        import('./gm-yardimci.js').then(({ initYardimci }) => { state.yardimci = initYardimci({ world, nameSprite, heightAt: (x, z) => state.heightAt(x, z), fx: () => state.fx }); if (window.__gmYd) state.yardimci.ayarla('ben', player, window.__gmYd); for (const [id, r] of remotes) gmEkUzak(id, r); }).catch((e) => console.warn('gm yardımcısı', e));
        import('./izleyici.js').then(({ initIzleyici }) => { state.player = player; state.izleyici = initIzleyici({ renderer, scene, world, camera, state }); }).catch((e) => console.warn('izleyici', e));   // GM dünya editörü izleyici kamerası   // GM dünya editörü objeleri
        import('./reklam.js').then(({ initReklam }) => { state.reklam = initReklam({ sb: BOOT.sb, world, zone: ZONE }); }).catch((e) => console.warn('reklam', e));   // reklam alanları (Moradon bayrakları)
        import('./irk-degistir.js').then(({ initIrkDegistir }) => initIrkDegistir({ sb: BOOT.sb, character: BOOT.character, hud })).catch((e) => console.warn('ulus değiştirme', e));   // Nation Transfer
        import('./ms.js').then(({ initMs }) => { state.ms = initMs({ sb: BOOT.sb, character: BOOT.character, hud, state, zone: ZONE }); }).catch((e) => console.warn('monster stone', e));   // Monster Stone
        BOOT.sb.rpc('ceza_durum').then(({ data }) => { if (data?.sustur) state.sustur = { bitis: data.bitis, neden: data.neden }; }, () => {});
        if (['freezone_a', 'freezone_b', 'freezone_c'].includes(ZONE)) import('./skor.js').then(({ initSkor }) => { state.skor = initSkor({ sb: BOOT.sb, character: BOOT.character, state }); }).catch((e) => console.warn('skor', e));   // Ardream Ulus Puanı Sıralaması (Alt basılı)
        import('./arena.js').then(({ initArena }) => { state.arena = initArena({ sb: BOOT.sb, character: BOOT.character, state, hud, player, remotes }); }).catch((e) => console.warn('arena', e));
        if (['moradon', 'freezone_a', 'freezone_b', 'freezone_c', 'elmo2004', 'karus2004'].includes(ZONE)) import('./kapi.js').then(({ initKapi }) => { state.kapi = initKapi({ sb: BOOT.sb, character: BOOT.character, hud, state, player, camera, canvas, world });
          // (31.10) Moradon base'deki iki ışınlanma kapısının üstünde adı: El Morad kırmızı, Karus mavi
          if (ZONE === 'moradon') for (const [ad, renk, x, z] of [['El Morad Warp Gate', '#ff4a3a', 837.4, 526.8], ['Karus Warp Gate', '#4aa8ff', 797.7, 526.9]]) {
            const t = textSprite(ad, { color: renk, cls: 'kapi-ad' }); const y = (state.heightAt?.(x, z) ?? 5) + 7.2; t.position.set(x, y, z); t.userData.menzil = 70; world.add(t);
          } }).catch((e) => console.warn('kapı', e));
        // kale klan bayrakları: ulusun ilk 5 klanı bayrak direklerinde
        if (ZONE === 'elmo2004' || ZONE === 'karus2004' || ZONE === 'moradon') import('./bayrak.js').then(({ startBayraklar }) => { state.bayrak = startBayraklar({ sb: BOOT.sb, zone: ZONE, world }); }).catch((e) => console.warn('bayraklar', e));
        if (ZONE === 'moradon' && BOOT?.sb) import('./heykel.js').then(({ heykeller }) => { state.heykel = heykeller({ sb: BOOT.sb, world, state, serverId: BOOT.character?.server_id }); }).catch((e) => console.warn('heykel', e));   // KO sıralama heykelleri
        if (ZONE === 'moradon') import('./ors.js').then(({ initOrs }) => { state.ors = initOrs({ sb: BOOT.sb, character: BOOT.character, hud, state, player, camera, canvas, world }); }).catch((e) => console.warn('örs', e));
        import('./duello.js').then(({ initDuello }) => { state.duello = initDuello({ sb: BOOT.sb, character: BOOT.character, hud, state }); }).catch((e) => console.warn('duello', e));   // (3.11) KO Duel
        import('./takas.js').then(({ initTakas }) => { state.takas = initTakas({ sb: BOOT.sb, character: BOOT.character, hud, state, pvp: { saldirabilir: (id) => state.arena?.saldirabilir(id), hedefle: (id) => state.arena?.hedefle(id) },
          adOf: (id) => remotes.get(String(id))?.meta?.name || remotes.get(Number(id))?.meta?.name, konum: () => player.position,
          posOf: (id) => (remotes.get(String(id)) || remotes.get(Number(id)))?.obj?.position || null }); }).catch((e) => console.warn('takas', e));
        import('./etkiler.js').then(({ initEtkiler }) => { state.etkiler = initEtkiler({ sb: BOOT.sb, character: BOOT.character, hud, state }); }).catch((e) => console.warn('etkiler', e));
        import('./kisayol.js').then(({ initKisayol }) => { state.kisayol = initKisayol({ character: BOOT.character, state, hud }); }).catch((e) => console.warn('kısayol', e));
        import('./genie.js').then(({ initGenie }) => { state.genie = initGenie({ sb: BOOT.sb, character: BOOT.character, state, hud, world }); }).catch((e) => console.warn('genie', e));
        if (!state.takvim) import('./takvim.js').then(async ({ initTakvim }) => { state.takvim = await initTakvim({ hud, state, character: BOOT.character, sb: BOOT.sb }); state.geciciEsya = await import('./gecici-esya.js').then(({ initGeciciEsya }) => initGeciciEsya({ state })).catch((e) => console.warn('gecici-esya', e)); }).catch((e) => console.warn('takvim', e));   // KO sağ üst: ? + kum saati (Schedule)
        import('./pazar.js').then(({ initPazar }) => { state.pazar = initPazar({ sb: BOOT.sb, character: BOOT.character, state, hud }); }).catch((e) => console.warn('pazar', e));
        import('./ko-komut.js').then(({ koKomutKur }) => { state.koKomut = koKomutKur({ sb: BOOT.sb, character: BOOT.character, state, hud, player, say: (t, c) => addLine(null, t, 0, c) }); hud.onTakas = () => state.koKomut.calistir('/trade'); }).catch((e) => console.warn('ko komut', e));
        import('./hmenu.js').then(({ initHMenu }) => { state.hmenu = initHMenu({ state, hud }); }).catch((e) => console.warn('h menü', e));
        addEventListener('ko-yetenek-hata', (e) => hud.notice(e.detail, 'hata'));
        // KO efektleri (vuruş, seviye, sandık, silah parlaması, GM)
        YUKLE.push(import('./fx.js').then(async (F) => {
          await F.loadFX('./assets/fx');
          state.fx = new F.FXManager(scene, camera, (x, z) => state.heightAt(x, z));
          state.fxBolgeKutup = [`${params.get('npcassets') || REMOTE_ZONES}/fxzone`, './assets/fxzone2', './assets/fxzone3', './assets/fxzone4'];   // dünya editörü objelerinin efektleri için (bölge efekt kütüphaneleri)
          state.efekt = (id, p, o = {}) => state.fx?.play(id, { pos: new THREE.Vector3(p.x, p.y, p.z), ...o });
          state.donanim?.setFx?.(state.fx);
          if (state.gear && state.avatar) state.donanim?.applyGear(state.avatar, BOOT.character.race, state.gear, true);
          gmAura(player, state.ghost && gmFxAcik());
          if (state.ghost) { let pe = false; try { pe = localStorage.getItem('ko-gm-peri') === '1'; } catch {} window.__gmPeriAyarla(pe); import('./gm-yardimci.js').then(({ yardimciAyar }) => window.__gmYdAyarla(yardimciAyar())).catch(() => {}); }
          for (const [id, r] of remotes) gmEkUzak(id, r);
          for (const [id, r] of remotes) { gmAura(r.obj, GMS.has(Number(id)) && r.meta?.gmfx !== false); if (r.meta?.gn) genieUzak(r.obj, true); }
          // KO bölge efektleri (<zone>.opdsub): şelale / çeşme suyu, fenerler, ocaklar… nesneye bağlı döngü efektleri
          try {
            // Storage'da yoksa sitedeki deadsoft yerleşimi (assets/fxyer: kaleler, Eslant, Ronark Land, zindanlar…) + ek efekt kütüphanesi fxzone2
            let yr = await fetch(`${base}/fxyer.json`, { cache: 'no-cache' }).catch(() => null);
            if (!yr?.ok) yr = await fetch(`./assets/fxyer/${HARITA}.json`).catch(() => null);
            if (yr?.ok) {
              const yer = await yr.json();
              // orijinal KO Moradon örsü (obj_co_itemup) çevresinde dönen yeşil efekt (moru_parti_2.fxb, orijinal opdsub; kütüphane fxzone4) —
              // Storage'daki eski yerleşimde yoksa eklenir
              // Moradon yel değirmeni (obj_mora_bill_004_2007, 766,351, 90° dönük): opdsub'daki efekt ofseti dünya ekseninde — nesnenin dönüşüyle
              // çevrilince kanatlar binanın sokak tarafında havada kalıyordu. Doğrusu: ofset (0,1; 23,6; −11,2) döndürülmeden, efekt dönüşü kimlik →
              // kanatlar binanın deniz tarafındaki duvarına yapışık (diğer değirmenlerdeki +x yuvası ile aynı duvar)
              for (const r of yer) if (r[0] === '70119_mora_forge_wing.fxb' && Math.abs(r[1] - 755.26) < 0.5 && Math.abs(r[3] - 351) < 0.5) { r[1] = 766.56; r[2] = 23.14; r[3] = 340.02; r[4] = 0; r[5] = 0; r[6] = 0; r[7] = 1; }
              if (ZONE === 'moradon' && !yer.some((r) => r[0] === 'moru_parti_2.fxb')) yer.push(['moru_parti_2.fxb', 816.14, 16, 607.18, 0, 0, 0, 1, 1]);
              // sırayla: aynı adlı efektte önce eklenen kütüphane geçerli (Storage fxzone asıl kaynak; fxzone2/3 yalnız eksikleri tamamlar — paralel yüklemede fxzone3'ün eksik dokulu kopyası öne geçip beyaz kareler çıkarıyordu)
              for (const b of [`${params.get('npcassets') || REMOTE_ZONES}/fxzone`, './assets/fxzone2', './assets/fxzone3', './assets/fxzone4']) await F.fxEkle(b).catch(() => {});   // fxzone3: meşale/ateş (2010_fire_ground), fener ışıkları, şelale…
              const liste = []; let msKapilar = null;
              // Moradon ulus kapıları (corea_soccer_post_*): El Morad kapısı mavi, Karus kapısı kırmızı (dosyada ters) ve %51 yavaş dönüş (0,7 × 0,7)
              const KAPI_FX = ZONE === 'moradon' ? { 'corea_soccer_post_alll.fxb': 'corea_soccer_post_blue.fxb', 'corea_soccer_post_blue.fxb': 'corea_soccer_post_alll.fxb' } : {};
              // El Morad / Luferson Castle ışınlanma kapıları (war_*cenpost*): model boyunca yükselen mor-mavi parça (sparks_nf_blue) çizilmez; yalnız içte dönen sarı ışık kalır
              const KALE_KAPI = ZONE === 'elmo2004' || ZONE === 'karus2004' || /^(elmo|karus)/.test(HARITA);
              for (let [fx, x, y, z, qx, qy, qz, qw, sc] of yer) {
                const kapi = !!KAPI_FX[fx]; if (kapi) fx = KAPI_FX[fx];
                // Monster Stone (in_dungeon01-03) başlangıç kapıları: efekt yerine kapı çapında küre (ms-kure.js) — üstteki El Morad mavi, alttaki Karus kırmızı
                if (MS_YUVA && /cenpost|obj_dunfx_[br]l01/i.test(fx) && x > 195 && x < 212) { (msKapilar ||= []).push({ x, z, ulus: z > 198 ? 2 : 1 }); continue; }
                if (!state.fx.var?.(fx) || x < 0 || z < 0 || x > (state.world || 4096) || z > (state.world || 4096)) continue;   // haritanın dışındaki (bozuk) yerleşimler atlanır
                const q = new THREE.Quaternion(qx, qy, qz, qw), p = new THREE.Vector3(x, y, z);
                const b = state.fx.play(fx, { pos: p, loop: true, scale: sc || 1, hiz: kapi ? 0.49 : 1, ...(KALE_KAPI && /cenpost/i.test(fx) ? { haric: /blue/i } : {}), ...(/cenpost|soccer_post|gate|bind|potal|portal/i.test(fx) ? { yukselme: 5 } : {}) }); if (!b) continue;   // kapı ışıkları kapının içinde kalır (gökyüzüne uzamaz)
                if (qw !== 1) b.yon = () => q;
                b.gizli = true; liste.push([b, p, /mora_light|itemzone_2007_bill|sunshain|gg_all|forge_wing|wf_all|waterwal/i.test(fx) ? 220 : 90]);   // KO: şehir süs ışıkları / ışık huzmeleri / değirmen / şelale uzaktan da görünür
              }
              if (msKapilar) import('./ms-kure.js').then(({ msKureler }) => msKureler({ scene, state, kapilar: msKapilar })).catch((e) => console.warn('ms küre', e));
              // uzaktakiler çizilmez (90 m; süs ışıkları / huzmeler / değirmen / şelale 220 m)
              setInterval(() => { const pp = player.position, kap = window.koSecenek?.yerelFx === false; for (const [b, p, m] of liste) b.gizli = kap || Math.hypot(p.x - pp.x, p.z - pp.z) > m; }, 400);   // Use Zone Effect
              for (const [b, p, m] of liste) b.gizli = Math.hypot(p.x - player.position.x, p.z - player.position.z) > m;
            }
          } catch (e) { console.warn('bölge efektleri', e); }
          // KO düşen yapraklar (deadsoft obj_dunfx_gl03.fxb: 30920leaf a–f, 10–15 m yükseklikten süzülür) — Moradon ağaçlarının üstünde
          // (moradon.opd: k_bigtree_2017 / war_tree / ka_tree…, 28 m ızgarada bir); 45 m ötesi çizilmez; Seçenekler → Efektler → Düşen yapraklar
          // KO Moradon: bölge geneli süzülen beyaz kiraz çiçeği yaprakları (orijinal Misc\fx_but_flower_01..03) — kiraz-yaprak.js
          if (ZONE === 'moradon') import('./kiraz-yaprak.js').then(({ kirazYaprakKur }) => kirazYaprakKur({ scene: world, player, zemin: (x, z) => state.heightAt?.(x, z), acik: () => FX.yaprak !== false && window.koSecenek?.yerelFx !== false })).catch((e) => console.warn('kiraz yaprakları', e));
          if (ZONE === 'moradon') try {
            await F.fxEkle('./assets/fxyaprak');
            const ly = await fetch('./assets/fxyaprak/moradon.json').then((r) => r.json());
            const yl = [];
            for (const [fx, x, y, z, , , , , sc] of ly) {
              if (!state.fx.var?.(fx) || x < 0 || z < 0 || x > (state.world || 4096) || z > (state.world || 4096)) continue;
              const p = new THREE.Vector3(x, state.heightAt?.(x, z) ?? y, z); const b = state.fx.play(fx, { pos: p, loop: true, scale: sc || 1 }); if (!b) continue;
              b.gizli = true; yl.push([b, p]);
            }
            const yk = () => { const pp = player.position, ac = FX.yaprak !== false && window.koSecenek?.yerelFx !== false; for (const [b, p] of yl) b.gizli = !ac || Math.hypot(p.x - pp.x, p.z - pp.z) > 45; };
            yk(); setInterval(yk, 500);
          } catch (e) { console.warn('yapraklar', e); }
        }).catch((e) => console.warn('efektler', e)));
        YUKLE.push(import('./loot.js').then(({ startLoot }) => startLoot({ sb: BOOT.sb, character: BOOT.character, world, state, player, hud, camera, canvas, inv: () => state.inv }))
          .then((l) => { state.loot = l; }).catch((e) => console.warn('sandıklar', e)));
        // envanter (KO çanta yuvaları) + KO statü sistemi
        YUKLE.push(import('./envanter.js').then(({ initInventory }) => initInventory({ sb: BOOT.sb, character: BOOT.character, hud, onceden: INV_ON, gmMi: () => !!state.ghost, onDonusum: (num) => state.donusumApi?.ac(num), onPet: { esyaMi: (it) => state.pet?.esyaMi(it), kullan: (s, it) => state.pet?.kullan(s, it), kisayol: () => state.kisayol }, onStats: (d) => state.combat?.applyStats?.(d),
          onUse: (d, it) => {   // iksir / parşömen kullanıldı
            if (d.miktar || d.heal) state.gorunmez?.boz?.('iksir kullandın');   // KO: iksir görünmezliği kaldırır (hız parşömeni gibi güçlendirmeler kaldırmaz)
            state.combat?.applyStats?.({ hp: d.hp, mp: d.mp, max_hp: d.max_hp, max_mp: d.max_mp });
            if (!d.fx || !sesFxVar(d.fx)) sesCal(110, player.position);   // KO itemeat.ogg (efektin kendi sesi yoksa)
            if (d.fx) { state.efekt?.(d.fx, player.position, { follow: () => player.position, boyut: 0.8, enFazla: 2.5 }); state.net?.fx?.({ k: 'b', id: d.fx, b: 0.8, e: 2.5 }); }   // iksir efekti herkeste
            if (d.miktar) state.combat?.floatText?.(player.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '+' + d.miktar, d.heal === 2 ? 'mp' : 'iyi');
            // parşömen etkisi anında: simge (süre yoksa sunucu varsayılanı 60 sn) + statlar (savunma/saldırı/can) hemen yenilenir
            if (d.buff != null) dispatchEvent(new CustomEvent('ko-etki', { detail: { id: null, esyaIt: it, ad: it.strName, sure: Number(d.sure) || 60, anahtar: 'buff:' + d.buff, hiz: !!(d.hiz && d.hiz !== 100) } }));
            if (d.hiz && d.hiz !== 100) state.buffHiz = { k: d.hiz / 100, until: performance.now() + (Number(d.sure) || 60) * 1000 };
            if (d.buff != null) state.inv?.stats?.();
            if (d.donusum) { state.donusumApi?.uygula?.({ ...d.donusum, bit: Number(d.donusum.bit) }); hud.info?.(`You have transformed into ${d.donusum.ad} (${Math.round((Number(d.donusum.sure) || 0) / 60)} min).`, 'tamam'); }   // KO dönüşüm parşömenleri (10 kullanımlık)
            if (String(d.buff) === '3') state.boyutEtki?.(Number(it?.Effect1), Number(d.sure) || 60);   // KO BUFF_TYPE_SIZE: Bezoar → dev, Glutinous Rice Cake → cüce
            dispatchEvent(new CustomEvent('ko-esya-kullanildi', { detail: d }));
          }, onEquip: async (eq) => {
          await state.gearReady; const D = state.donanim; if (!D) return;
          state.sonEq = eq; state.gear = D.gearCodes(kaskFiltre(eq)); const race = BOOT.character.race;
          state.weaponEl = (state.gear.find((g) => g[0] === 6) || [])[2] || 0;
          Promise.resolve(D.applyGear(state.avatar, race, state.gear)).then(() => donusumGiydir(state.avatar, state.gear)); if (inv?.api) D.applyGear(inv.api, race, state.gear);
          state.net?.setGear?.(state.gear);
        } }))
          .then((inv) => { state.inv = inv; }).catch((e) => console.warn('envanter', e)));
        // statü penceresindeki Reset Stat: KO stat sıfırlama (ücret seviyeye göre, giyili eşya olmamalı) — sunucu stat_reset
        hud.onGunlukSira = () => import('./gunluk-sira.js').then((M) => M.gunlukSiraAc({ sb: BOOT.sb, character: BOOT.character, hud })).catch((e) => console.warn('daily rank', e));
        hud.onStatPreset = (yanina) => import('./stat-preset.js').then((M) => M.statPresetAc({ sb: BOOT.sb, character: BOOT.character, hud, yanina, onStats: (st) => { hud.setCharStats(st); state.combat?.odulUygula?.(st); state.inv?.stats?.(); } })).catch((e) => console.warn('stat preset', e));
        hud.onStatReset = async () => {
          const { data: u } = await BOOT.sb.rpc('reset_ucret_bilgi', { p_char: BOOT.character.id }).then((r) => r, () => ({ data: null }));
          const ucret = u?.restat != null ? `\nCost (level ${u.level}): ${Number(u.restat).toLocaleString('en-US')} Noah` : '';
          hud.soru?.('Reset Stat', `Your stats will return to your race's starting values and all distributed points will be refunded.\nYou must not have any items equipped.${ucret}`, async () => {
            const { data: d, error } = await BOOT.sb.rpc('stat_reset', { p_char: BOOT.character.id });
            if (error || d?.ok === false) { hud.notice(error?.message || d?.mesaj || 'Failed to reset stats.', 'hata'); return; }
            hud.info?.(d?.mesaj || 'Your stats have been reset.', 'beceri');
            if (d?.stats) { hud.setCharStats(d.stats); state.combat?.odulUygula?.(d.stats); }
            dispatchEvent(new CustomEvent('ko-stat-sifirlandi'));
            state.inv?.stats?.(); state.inv?.reload?.();
          });
        };
        // yetenek penceresindeki Reset skill: KO yetenek puanı sıfırlama (ücret seviyeye göre) — sunucu skill_reset
        addEventListener('ko-yetenek-sifirla-iste', async () => {
          const { data: u } = await BOOT.sb.rpc('reset_ucret_bilgi', { p_char: BOOT.character.id }).then((r) => r, () => ({ data: null }));
          const ucret = u?.reskill != null ? `\nCost (level ${u.level}): ${Number(u.reskill).toLocaleString('en-US')} Noah` : '';
          hud.soru?.('Reset skill', `Do you want to reset all your distributed skill points?${ucret}`, async () => {
            const { data: d, error } = await BOOT.sb.rpc('skill_reset', { p_char: BOOT.character.id });
            if (error || d?.ok === false) { hud.notice(error?.message || d?.mesaj || 'Failed to reset skills.', 'hata'); return; }
            hud.info?.(d?.mesaj || 'Your skill points have been reset.', 'beceri');
            if (d?.gold != null) state.combat?.odulUygula?.({ gold: d.gold });
            dispatchEvent(new CustomEvent('ko-yetenek-sifirlandi')); state.inv?.reload?.();
          });
        });
        hud.onAddStat = async (k) => {
          const { data, error } = await BOOT.sb.rpc('add_stat', { p_char: BOOT.character.id, p_stat: k, p_n: 1 });
          if (error) { hud.notice(error.message, 'hata'); return; }
          hud.setCharStats(data); state.combat?.applyStats?.(data);
        };
      } catch (e) { console.warn('savaş başlatılamadı', e); }
    } else hud.show();
    const yukleBekle = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
    status('Preparing the world…', 0.78);
    await yukleBekle(Promise.allSettled(YUKLE), 120000);   // (8.11) 45 → 120 sn: yavaş bağlantıda da harita tamamen yüklenmeden karakter haritaya inmez
    if (yuzeyP) { status('Loading map…', 0.86); await yukleBekle(yuzeyP, 30000); }   // (5.11) yavaş bağlantıda harita / modeller bitmeden giriş yapılmasın
    // kuşanılı eşyalar (silah/zırh/peri modelleri ve efektleri) hazır olana kadar (en fazla 6 sn) yükleme ekranı kalır
    if (ILK_DONANIM) { status('Loading items…', 0.88); await yukleBekle(ILK_DONANIM, 15000); }
    if (DONANIM_BEKLEYEN.size) { status('Loading items…', 0.9); await yukleBekle(Promise.allSettled([...DONANIM_BEKLEYEN]), 10000); }
    if (state.petP) { status('Loading pet…', 0.92); await yukleBekle(state.petP, 3000); }
    if (state.donanim?.periHazir) { await yukleBekle(state.donanim.periHazir(), 4000); await new Promise((r) => setTimeout(r, 300)); }
    // launcher: görüş alanındaki mob / NPC / oyuncu modellerinin hepsi indirilip kurulana dek bekler (oyunda sonradan belirmesin)
    { const { modellerHazir } = await import('./character.js'); status('Loading models…', 0.95); await yukleBekle(modellerHazir(), 20000); }
    // anizotropik doku süzme (Seçenekler → DirectX): sahnedeki dokulara uygulanır; sonradan yüklenenler 8 sn'de bir
    let anisoAyar = 1; const anisoGorulen = new WeakMap();
    const anisoDoku = (t) => { if (t?.isTexture && anisoGorulen.get(t) !== anisoAyar) { anisoGorulen.set(t, anisoAyar); if (t.anisotropy !== anisoAyar && t.image && !t.isDataTexture && !t.isDataArrayTexture && !t.isCompressedArrayTexture && !t.isFramebufferTexture && !t.isRenderTargetTexture && !t.isVideoTexture && t.minFilter !== THREE.NearestFilter && t.minFilter !== THREE.LinearFilter) { t.anisotropy = anisoAyar; t.needsUpdate = true; } } };
    const anisoUygula = () => scene.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : null; if (!ms) return;
      for (const m of ms) { anisoDoku(m.map); if (m.uniforms) for (const u of Object.values(m.uniforms)) anisoDoku(u?.value); }
    });
    setInterval(() => anisoUygula(), 8000);
    // Seçenekler: ekran sonrası işlem + dünya ayarları
    post = createPost(renderer);
    const fogMatsAll = () => [state.terrain?.userData.material, ...(state.water ? state.water.children.map((m) => m.material) : [])].filter((m) => m?.uniforms?.uFogNear);
    const settings = initSettings({
      renderer, post, relayout, sb: BOOT?.sb, character: BOOT?.character, state, hud,
      resetHotkey: () => location.replace(location.href),
      applyWorld(s) {
        Object.assign(FX, s.fx);
        // görüş mesafesi: Seçenekler'den kaldırıldı, her zaman yakın (çizim ~231 m, tam sis ~200 m)
        const MK = { yakin: 0.55, orta: 0.78, uzak: 1 }[s.mesafe] || 1, dx11 = s.dx !== 'dx9';
        const uzak = WORLD_DIST * MK * (0.5 + Math.max(0, Math.min(100, Number(window.koSecenek?.odak ?? 50))) / 100) * ({ dusuk: 0.75, orta: 0.88, yuksek: 1 }[window.koSecenek?.araziGorus] || 1), pus = 1;   // + DirectX option → Terrain View   // KO Adjust Focus Distance (0–100, 50 = normal)   // sis her modda oyuncunun 30 m ötesinden başlar (DX-11 pusu ekran sonrası)
        const near0 = FOG_NEAR * pus,   /* sis başlangıcı her zaman 30 m; görüş mesafesi yalnız çizim/tam sis sınırını kısaltır */ far = FX.fog ? near0 + (uzak - near0) / FOG_YOGUN : 1e6, near = FX.fog ? near0 : 1e6 - 1;
        scene.fog.near = near; scene.fog.far = far;
        for (const m of fogMatsAll()) { m.uniforms.uFogNear.value = near; m.uniforms.uFogFar.value = far; }
        camera.far = uzak + 64; camera.updateProjectionMatrix();
        golgeler.ayarla(s); golgeler.gunes(sun.position.clone().normalize());
        post.sisRengi(fogColor);
        anisoAyar = Math.min(s.aniso || 1, s.dx === 'dx9' ? 4 : 16, renderer.capabilities.getMaxAnisotropy?.() || 1); anisoUygula(true);
        state.sky?.children.forEach((c) => { if (c.userData.off) c.visible = FX.clouds; });
        for (const sp of labels) { const k = sp.userData.kind; if (k) sp.visible = k === 'canavar' ? FX.monsterNames : FX.names; }
        document.documentElement.classList.toggle('gm-sabit', !FX.gmGlow);
      },
    });
    hud.onOptions = () => settings.toggle(); state.ayarlar = settings;
    // KO görev çubuğu: sağ alttaki ilk düğme (btn_07) → bulunduğun haritanın ulus base'ine / kasabasına ışınlan (RPC town)
    let townMesgul = false;
    hud.onTown = async () => {
      if (townMesgul || !BOOT?.sb || !BOOT.character) return;
      if (state.pazarAcik) { hud.mesaj?.('Merchant', 'You cannot return to town while your shop is open. Close the shop first (H menu).') || hud.notice?.('You cannot return to town while your shop is open.', 'hata'); return; }
      townMesgul = true;
      try {
        const { data, error } = await BOOT.sb.rpc('town', { p_char: BOOT.character.id });
        if (error) { hud.notice?.(error.message, 'hata'); return; }
        if (!data?.ok) { hud.notice?.(data?.reason || 'Teleport failed.', 'hata'); return; }
        try { state.genie?.durdur?.('You returned to town; Knight Genie has been disabled.'); } catch {}   // KO: town atınca çalışan Genie durur
        const x = Number(data.x), z = Number(data.z);
        if (data.bolge_degisti) { hud.notice?.('Leaving the arena and returning to Moradon…', 'seviye'); state.net?.halt?.(); const u = new URL(location.href); for (const k of ['x', 'z', 'bolge']) u.searchParams.delete(k); u.searchParams.set('karakter', BOOT.character.id); setTimeout(() => location.replace(u.toString()), 600); return; }
        player.position.set(x, state.heightAt(x, z), z); state.target = null; marker.visible = false; state.net?.kick?.();
        dispatchEvent(new CustomEvent('ko-isinlandi'));   // Spirit of Logos güçlendirmesi kalkar (sunucu trg_logos_sil)
        state.combat?.clearTarget?.();   // KO: town atınca seçili mob hedeften çıkar, saldırı durur
        // KO: town ışınlanma efekti (fx.tbl 10046 Warp_ka / 10047 Warp_el) varış noktasında, herkese yayın
        const wfx = Number(BOOT.character.nation) === 2 ? 10047 : 10046;
        state.efekt?.(wfx, player.position, { follow: () => player.position });
        setTimeout(() => state.net?.fx?.({ k: 'b', id: wfx }), 150);   // konum yayını yeni yere ulaştıktan sonra
      } finally { setTimeout(() => (townMesgul = false), 1500); }
    };
    clock.getDelta();
    requestAnimationFrame(tick);
    // ilk kareler yükleme ekranının arkasında çizilir (gölgelendirici derlemesi takılma yapmasın)
    status('Entering the game…', 0.97);
    // (5.11) harita tam hazır olmadan karakter / dünya görünmesin: tüm dokular GPU'ya yüklenir, gölgelendiriciler derlenir,
    // sonra yükleme ekranının arkasında birkaç kare çizilir (ilk görüntüde arazi / bina / su dokuları sonradan belirmez)
    try {
      const dokular = new Set();
      scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { for (const v of Object.values(m)) if (v?.isTexture) dokular.add(v); if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) dokular.add(u.value); } });
      let i = 0; for (const t of dokular) { try { renderer.initTexture(t); } catch {} if (++i % 40 === 0) await new Promise((r) => setTimeout(r, 0)); }
      if (renderer.compileAsync) await yukleBekle(renderer.compileAsync(scene, camera), 15000);
    } catch (e) { console.warn('ön yükleme', e); }
    // (8.11) harita tamamen yüklendikten sonra karakter zemine (köprü / platform dahil) yeniden oturtulur: havadan düşmez, zeminin altına girmez
    try { const px = player.position.x, pz = player.position.z; let yy = state.heightAt(px, pz); if (state.col) { const yc = state.col.heightNear(px, player.position.y + 0.5, pz); if (yc > yy && yc < yy + 3) yy = yc; } if (Number.isFinite(yy)) player.position.y = yy; } catch {}
    for (let k = 0; k < 6; k++) await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));
    // KO launcher: her şey yüklendi → START GAME etkin; basılana dek karakter kıpırdamaz, moblar/kuleler saldırmaz
    if (koYukleme) { koYukleme.hedef = koYukleme.deger = 1; koYukleme.L.progress('Progress_Loading', 1); koYukleme.L.text('Text_Info', 'Oyuna giriliyor…'); await new Promise((r) => setTimeout(r, 250)); }
    if (koYukleme?.hazir) {
      const donmus = state.frozen; state.frozen = true; state.baslamadi = true;
      koYukleme.hedef = koYukleme.deger = 1; koYukleme.hazir();
      await koYukleme.bekle;
      state.frozen = donmus; state.baslamadi = false;
      for (const n of state.combat?.mobs?.values?.() || []) n.tetik = 0;
    }
    $('yukleniyor').classList.add('bitti');
    state.net?.yuklendi?.();   // (8.11) artık diğer oyuncular beni görür
    try { sessionStorage.removeItem('ko-yukleniyor'); } catch {}   // yükleme bitti: artık F5 girişe atmaz (oyun içi F5 normal)
    ustDugmeler();
    // KO giriş koruması: 5 sn hafif saydam, hasar yemez (sunucu koruma_baslat — oturum başına bir kez)
    BOOT?.sb?.rpc('koruma_baslat', { p_char: BOOT.character.id }).then(({ data }) => {
      if (!data?.ok) return; const sn = Number(data.sure) || 5;
      state.gorunmez?.koruma?.(sn); hud.info?.(`Login protection: you are immune to damage for ${sn} seconds.`, 'beceri');
    }).catch(() => {});
    { // bölgeye giriş yazısı: maden alanı girişi gibi ekranın ortasında süzülen yazı (1 sn belirir, 4 sn kalır, 1 sn'de silinir)
      const t = `Welcome to ${ZONE === 'moradon' ? 'Moradon' : (hud.zoneName || ZONE)}!`;
      const el = document.createElement('div'); el.className = 'maden-orta-yazi bolge-giris-yazi'; el.textContent = t; document.body.append(el);
      void el.offsetWidth; el.classList.add('gor'); setTimeout(() => el.classList.remove('gor'), 5000); setTimeout(() => el.remove(), 6500); }
    window.__ko = { THREE, scene, camera, player, state, renderer, world, remotes, sb: BOOT?.sb, character: BOOT?.character, hud };   // hata ayıklama/test
  } catch (e) {
    console.error(e);
    status('Error: ' + e.message);
  }
})();


// ---------------- çok oyunculu (Supabase Realtime)
// çanta dolu / yer yok mesajları yalnız aksiyon (işlem bilgileri) sohbetinde
const CANTA_DOLU = /çanta(n|nda|da)?\b[^.]*\b(dolu|yer yok|yeterli yer|boş yer)|çanta dolu/i;
// (31.10) KO: seçili başka oyuncunun ayağında da yeşil seçim çemberi (2009_select_friend.fxb) — NPC seçimindeki gibi
let _osIsaret = {}, _osId = null, _osKaynak = null, _osPlan = null, _osObj = null;
function oyuncuSecimIsaret() {
  const id = state.seciliOyuncu?.id ?? state.arena?.secili ?? state.arena?.hedef ?? null;
  const r = id != null ? (remotes.get(String(id)) || remotes.get(Number(id))) : null;
  const dusman = !!r && Number(r.meta?.nation) > 0 && Number(r.meta?.nation) !== Number(BOOT?.character?.nation);
  const yeni = r?.obj && r.obj.visible !== false ? String(id) + (dusman ? ':d' : ':o') : null;
  // karşı ulus: canavar seçimindeki yeşil hedef halkası (target_symbol_plane); dost: 2009_select_friend.fxb
  if (_osPlan) { if (yeni && _osObj) { _osPlan.visible = true; _osPlan.position.set(_osObj.position.x, _osObj.position.y + 0.08, _osObj.position.z); } else _osPlan.visible = false; }
  if (yeni === _osId) return;
  const tur = (k) => (_osIsaret[k] ||= import('./fx-secim.js').then(({ secimTakip }) => secimTakip(state, k)));
  if (_osId) { tur('2009_select_friend.fxb').then((h) => h.gizle()); tur('2009_select_enemyl.fxb').then((h) => h.gizle()); }
  _osId = yeni;
  if (!yeni) { _osKaynak = null; _osObj = null; return; }
  const o = r.obj; _osObj = o; _osKaynak = () => (o.parent ? o.position : null);
  // (1.11) her oyuncu seçiminde (dost / düşman) yalnız canavardaki gibi yeşil hedef halkası — kırmızı / efekt işareti yok
  if (!_osPlan) {
    const t = new THREE.TextureLoader().load('./assets/ui/secek/hedef1.webp'); t.colorSpace = THREE.SRGBColorSpace;
    _osPlan = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    _osPlan.rotation.x = -Math.PI / 2; _osPlan.renderOrder = 5; _osPlan.visible = false; world.add(_osPlan);   // (2.11) oyuncular world içinde (z ekseni ters) — halka da world'de, canavar halkası gibi
  }
}
const addLine = (name, text, nation, cls, charId = null) => {
  if (!name && CANTA_DOLU.test(String(text || ''))) { hud.info?.(String(text), 'hata'); return; }
  if (name && state.engelli?.has(String(name).toLowerCase())) return;   // KO /chatblock
  const box = $('sohbet-mesajlar');
  if (!box) return;
  const d = document.createElement('div');
  // KO: genel sohbette oyuncunun sıralama (NP/LP) sembolü isminin başında; klan / birlik / parti / bağır kanallarında yok
  // (31.10) KO: satır başında oyuncu kutusu — işaretlenince o oyuncunun sohbeti kapanır (sonraki mesajları görünmez), kaldırınca açılır
  if (name && String(name).toLowerCase() !== String(BOOT?.character?.name || '').toLowerCase()) {
    const k = document.createElement('span'); k.className = 'sohbet-kutu'; k.dataset.ad = String(name).toLowerCase(); k.title = 'Block chat';
    if (state.engelli?.has(k.dataset.ad)) k.classList.add('secili');
    k.addEventListener('pointerdown', (e) => e.stopPropagation());
    k.addEventListener('click', (e) => {
      e.stopPropagation(); const ad = k.dataset.ad; state.engelli ||= new Set();
      const kapat = !state.engelli.has(ad); if (kapat) state.engelli.add(ad); else state.engelli.delete(ad);
      try { localStorage.setItem('ko-chatblock-' + Number(BOOT?.character?.id), JSON.stringify([...state.engelli])); } catch {}
      document.querySelectorAll('#sohbet-mesajlar .sohbet-kutu').forEach((x) => { if (x.dataset.ad === ad) x.classList.toggle('secili', kapat); });
      hud.info?.(`[${name}] ${kapat ? 'The chatting will be disabled.' : 'The chatting will be enabled.'}`, 'soluk');
    });
    d.append(k);
  }
  if (name && charId != null && !['klan', 'birlik', 'parti', 'bagir'].includes(cls)) { const r = state.rutbe?.sembolEl?.(charId, { orj: true }); if (r) { r.classList.add('sohbet-rutbe'); d.append(r); } else if (!state.rutbe?.hazir) d.dataset.rutbeBekle = charId; }   // (2.11) sıralama verisi henüz gelmediyse gelince eklenir
  if (name) { const b = document.createElement('b'); b.textContent = name + ': '; b.className = 'n' + (nation || 0); d.append(b); }
  else d.className = 'sistem';
  if (cls) d.classList.add(cls);
  d.classList.add('k-' + ({ ozel: 'ozel', bagir: 'bagir', parti: 'parti', klan: 'klan', birlik: 'birlik', oda: 'oda', kral: 'kral' }[cls] || (name ? 'genel' : 'sistem')));
  // KO sohbet filtresi / renkleri için ek sınıflar: gönderilen / arkadaştan fısıltı, Noah Knights ulus rengi, tüccar duyurusu, kullanıcı bilgisi
  if (cls === 'ozel' && name) { if (String(name).toLowerCase() === String(BOOT?.character?.name || '').toLowerCase()) d.classList.add('k-ozelgiden'); else if (charId != null && (window.koArkadasIdleri?.() || []).includes(Number(charId))) d.classList.add('k-ozelarkadas'); }
  if (name) d.classList.add('k-oyuncu');
  if (cls === 'pazar' || /merchant|tüccar|pazar/i.test(cls || '')) d.classList.add('k-pazar');
  if (!name && /duyuru|bilgi|seviye/.test(cls || '')) d.classList.add('k-bilgi');
  emoYaz(d, text);   // KO sohbet ifadeleri: (Smile) … simge olur
  box.append(d); while (box.children.length > 500) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
};
// (5.11) duyurudaki eşya adının rengi: önce varsayılan renk görünmesin diye satır, renk çözülünce eklenir (önbellekli, en çok 1,5 sn beklenir)
const ESYA_RENK = new Map();
const esyaRengi = (num) => {
  if (!num || !BOOT?.sb) return Promise.resolve(null);
  if (!ESYA_RENK.has(num)) ESYA_RENK.set(num, Promise.all([import('./esya.js'), BOOT.sb.from('items').select('*').eq('num', num).maybeSingle()]).then(([m, { data }]) => (data ? m.nameColor(m.fromDb(data)) : null), () => null));
  return Promise.race([ESYA_RENK.get(num), new Promise((r) => setTimeout(() => r(null), 1500))]);
};
const duyuruEkle = (d, el, num) => esyaRengi(num).then((renk) => {
  if (renk && el) el.style.setProperty('color', renk, 'important');
  const box = $('sohbet-mesajlar'); if (!box) return;
  box.append(d); while (box.children.length > 500) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
});
// (5.11) KO: duyurudaki oyuncu adı — bakan oyuncuyla aynı ulus #00bfff, farklı ulus #f08080 (ulus: announcements.ulus)
const duyuruAdRenk = (el, a) => { const u = Number(a?.ulus), ben = Number(BOOT?.character?.nation); if (!el || !u || !ben) return; el.style.setProperty('color', u === ben ? '#00bfff' : '#f08080', 'important'); };
// Rebirth duyurusu (tüm oyuncular, sohbet): geçti → tüm satır açık turuncu, yandı → tüm satır kırmızı; kalın, ikonsuz
function rebSatiri(a) {
  const box = $('sohbet-mesajlar'); if (!box) return;
  const gecti = /_gecti$/.test(a.tur), ad = String(a.name || ''), t = String(a.text || '');
  const FIIL = /\s*(başarılı bir şekilde güçlendirdi\.|basarken yaktı\.|rebirth basarken (geçirdi!|yaktı\.))\s*$/;
  const esya = (t.startsWith(ad + ' ') ? t.slice(ad.length + 1) : t).replace(/<selfname>/gi, ad).replace(FIIL, '').replace(/\s*\(\+(\d+)\)\s*$/, ' (+$1)');   // ad ile (+N) arasında boşluk
  // orijinal KO duyurusu: ad turkuaz, eşya mor; başarı "has successfully upgraded to the … item. Please congratulate them." (krem),
  // yanma "failed to upgrade the … item. Please send them your support." (kırmızı); rebirth başarısı pembe
  const d = document.createElement('div'); d.className = 'sistem k-sistem ko-reb ko-reb-orj ' + (gecti ? (a.tur === 'reb_gecti' ? 'reb-gecti reb-pembe' : 'reb-gecti') : 'reb-yandi');
  const s = (cls, x) => { const e = document.createElement('span'); e.className = cls; e.textContent = x; return e; };
  if (gecti) d.append(s('r-ad', ad), s('r-fiil', ' has successfully upgraded to the '), s('r-esya', esya), s('r-fiil', ' item. Please congratulate them.'));
  else d.append(s('r-ad', ad), s('r-fiil', ' failed to upgrade the '), s('r-esya', esya), s('r-fiil', ' item. Please send them your support.'));
  duyuruAdRenk(d.querySelector('.r-ad'), a);
  // eşya adı eşyanın kendi ad renginde: renk hazır olunca satır eklenir (önce pembe görünmez)
  duyuruEkle(d, d.querySelector('.r-esya'), a.item_num);
}
// KO: oyuncu dropta unique eşya aldı → "<ad> has obtained the <eşya> item. Please congratulate them." (ad turkuaz, eşya altın, metin açık lila)
function uniqueSatiri(a) {
  const box = $('sohbet-mesajlar'); if (!box) return;
  const d = document.createElement('div'); d.className = 'sistem k-sistem ko-unique';
  const s = (cls, x) => { const e = document.createElement('span'); e.className = cls; e.textContent = x; return e; };
  d.append(s('u-ad', String(a.name || '')), s('u-fiil', ' has obtained the '), s('u-esya', String(a.text || '')), s('u-fiil', ' item. Please congratulate them.'));
  duyuruAdRenk(d.querySelector('.u-ad'), a);
  duyuruEkle(d, null, null);   // (5.11) KO: unique eşya adı sabit #dcc77c (CSS)
}
// PvP bölgeleri: "Öldüren -> Ölen" satırı, isimler ulus rengiyle (Karus kırmızı, El Morad mavi)
state.oldurmeSatiri = (a, an, v, vn, yer = null) => {
  const box = $('sohbet-mesajlar'); if (!box) return;
  const d = document.createElement('div'); d.className = 'sistem k-sistem ko-oldurme';
  const ad = (t, n) => { const b = document.createElement('b'); b.textContent = t; b.style.setProperty('color', Number(n) === 2 ? '#4fa3ff' : '#ff4a4a', 'important'); return b; };
  const ok = document.createElement('span'); ok.textContent = ' -> '; ok.style.setProperty('color', '#9a9a9a', 'important');   // ok gri
  d.append(ad(a, an), ok, ad(v, vn));
  if (yer && Number.isFinite(Number(yer.x))) { const k = document.createElement('span'); k.textContent = ` (${Math.round(yer.x)},${Math.round(yer.z)})`; k.style.setProperty('color', '#c8c8c8', 'important'); d.append(k); }   // ölenin koordinatı
  box.append(d); while (box.children.length > 500) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
  dispatchEvent(new CustomEvent('ko-pvp-oldurme'));   // Ulus Puanı Sıralaması (Alt) hemen yenilensin
};
// (3.11) KO arena ölüm duyurusu (CUser::SendDeathNotice, isInArena → RANGE_30M): ölenin 30 m çevresindekiler görür.
// "- <öldüren> has defeated <ölen> (x,y: X, Z ) -" sarı sohbet satırı; koordinat ölenin konumu.
state.arenaOldurme = (a, v, yer, benYer) => {
  if (!yer || !Number.isFinite(Number(yer.x))) return;
  if (benYer && Math.hypot(Number(benYer.x) - Number(yer.x), Number(benYer.z) - Number(yer.z)) > 30) return;
  const box = $('sohbet-mesajlar'); if (!box) return;
  const d = document.createElement('div'); d.className = 'sistem k-sistem ko-arena-olum';
  d.textContent = `- ${a} has defeated ${v} (x,y: ${Math.round(yer.x)}, ${Math.round(yer.z)} ) -`;
  box.append(d); while (box.children.length > 500) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
};
// GM duyuruları: tablo eklemeleri Realtime ile gelir, ekranın üst ortasında gösterilir
function watchAnnouncements(sb) {
  sb.channel('duyurular').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, ({ new: a }) => {
    if (!a?.text) return;
    if (a.zone && a.zone !== ZONE) return;   // bölge duyurusu (Chaos Stone, anıt): yalnız o haritadakiler
    if (/^(reb|yuk)_(gecti|yandi)$/.test(a.tur || '')) return rebSatiri(a);
    if (a.tur === 'unique') return uniqueSatiri(a);   // KO: dropta unique eşya — herkese sohbette
    if (a.tur === 'mg_ban') return addLine(null, a.text, 0, 'mg-ban');   // MineGuard: ceza puanından uzaklaştırılan oyuncu (sol alt sohbet, sarı)   // örs güçlendirme sonucu (rebirth hepsi, normal +7 ve üzeri): yalnız sohbette, renkli satır
    hud.banner(a.text, 'duyuru');
    addLine(null, `[Notice] ${a.text}`, 0, 'duyuru');   // GM adı gösterilmez
  }).subscribe();
}
// sağ üst: mini haritanın üstünde KO düğmeleri (Hoşgeldin, Sürüm, Oyuncu/Premium, GM Paneli)
const SURUM = 'BETA-V.1.0';
function ustDugmeler() {
  let bar = document.getElementById('ust-dugmeler');
  if (!bar) { bar = document.createElement('div'); bar.id = 'ust-dugmeler'; document.body.append(bar); }
  const premium = !!BOOT?.character?.premium;
  const btns = [];   // (31.10) sağ üstte yalnız sunucu düğmesi: "ARES - 1" (GM paneli /gm komutuyla açılır)
  // sunucu + kanal düğmesi (KO: "ROSETTA1")
  let sv = ''; try { sv = sessionStorage.getItem('ko-sunucu') || localStorage.getItem('ko-sunucu') || ''; } catch {}
  if (['freezone_a', 'freezone_b', 'freezone_c'].includes(ZONE)) sv = sv.replace(/\d+\s*$/, '1');   // tek kanallı bölgeler
  { const m = /^(.*?)\s*-?\s*(\d+)\s*$/.exec(sv || ''); btns.push(['sunucu', m ? `${m[1].replace(/\s+/g, '').toUpperCase()} - ${m[2]}` : (sv || 'ARES - 1').toUpperCase()]); }
  bar.innerHTML = '';
  import('./kui.js').then(({ hasLayout, buildLayout }) => {
    for (const [k, t] of btns) {
      if (hasLayout('re_eventnotice')) {   // KO re_eventnotice: turkuaz şerit düğme
        const L = buildLayout('re_eventnotice', { className: 'ud-ko ud-' + k }); L.show('btn_extention', false); L.show('btn_reduction', false);
        L.text('txt', t); L.el.dataset.k = k; L.el.title = t; bar.append(L.el);
        // şerit genişliği: uçlar (20 px) bozulmadan kalır, yalnız orta kısım uzar (3 dilim) → doku bozulmaz
        const W = 158, U = 20; L.el.style.width = W + 'px';
        const bn = L.get('btn_notice'); bn.style.width = W + 'px';
        for (const e of bn.querySelectorAll(':scope > .kui-img')) {
          const cs = e.style, img = cs.backgroundImage, [bw, bh] = (cs.backgroundSize || '').split(' ').map(parseFloat), [px, py] = (cs.backgroundPosition || '0px 0px').split(' ').map(parseFloat);
          if (!img || !bw) { cs.width = W + 'px'; continue; }
          const w0 = parseFloat(cs.width) || 140, f = (W - 2 * U) / (w0 - 2 * U);
          const parca = (left, width, bgW, bgX) => { const d = document.createElement('i'); d.style.cssText = `position:absolute;top:0;height:100%;left:${left}px;width:${width}px;background-image:${img};background-repeat:no-repeat;background-size:${bgW}px ${bh}px;background-position:${bgX}px ${py}px;`; return d; };
          e.append(parca(0, U, bw, px), parca(U, W - 2 * U, bw * f, (px - U) * f), parca(W - U, U, bw, px - (w0 - U)));
          cs.backgroundImage = 'none'; cs.width = W + 'px';
        }
        const tx = L.get('txt'); if (tx) tx.style.width = (W - 8) + 'px';
      } else bar.insertAdjacentHTML('beforeend', `<button data-k="${k}" class="ud-${k}">${t}</button>`);
    }
    const h = bar.getBoundingClientRect().bottom; document.documentElement.style.setProperty('--ust-h', Math.ceil(h) + 'px');
  });
  bar.onpointerdown = (e) => e.stopPropagation();
  bar.onclick = (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
    if (k === 'gm') return state.gmWin?.toggle();
    if (k === 'sunucu') {   // (31.10) KO: sunucu düğmesine basınca altında açılan kutu — "Time" + oyun (sunucu) saati, saniyede bir güncellenir
      const d = e.target.closest('[data-k]'); let p = d.querySelector(':scope > .ud-saat');
      if (p) { p.remove(); clearInterval(d._saatT); bar.style.removeProperty('z-index'); return; }
      bar.style.setProperty('z-index', '4500', 'important');   // saat kutusu mini haritanın üstünde görünür
      p = document.createElement('div'); p.className = 'ud-saat'; p.innerHTML = '<b>Time</b><span></span>';
      const sp = p.lastChild, yaz = () => { const t = new Date().toLocaleTimeString('en-US', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }); sp.textContent = t.replace(/:/g, ' : '); };
      yaz(); d._saatT = setInterval(() => { if (!p.isConnected) clearInterval(d._saatT); else yaz(); }, 1000);
      p.addEventListener('click', (ev) => ev.stopPropagation()); d.append(p); return;
    }
    if (k === 'genie') return state.genie?.ac();
    const c = BOOT?.character;
    const msg = {
      hosgeldin: ['Hoşgeldin', `<p><b>Knight Online Web</b>'e hoş geldin${c ? ', <b>' + c.name + '</b>' : ''}!</p><p>Oyun şu anda <b>geliştirme aşamasındadır</b>. Haritalar, NPC'ler, eşyalar, statü sistemi ve çok oyunculu mod çalışıyor; savaş, beceriler, parti ve klan sistemleri geliştiriliyor.</p><p>Sürüm: <b>${SURUM}</b> — bu bir <b>beta</b> sürümüdür; oyun verileri geliştirme sırasında sıfırlanabilir.</p><ul><li>Tarayıcıdan indirmesiz oynanış</li><li>KO haritaları, NPC'ler ve 150 bin+ eşya</li><li>KO EXP / statü tablosu, en yüksek seviye 59</li><li>Çok oyunculu: konum, animasyon, sohbet</li></ul><p>Karşılaştığın hataları GM'lere bildirebilirsin. İyi oyunlar!</p>`],
      sunucu: ['Server', `<p>Server: <b>${sv || '-'}</b></p><p>Zone: <b>${state.zoneName || 'Moradon'}</b></p><p>You can see players on the same server and channel. To change channel, return to character selection and pick another channel from the server list.</p>`],
      bonus: [premium ? 'Premium Hesap Bonusları' : 'Hesap Bonusları', c ? `<p><b>${c.name}</b> · Seviye ${c.level} · ${c.nation === 2 ? 'El Morad' : 'Karus'}</p><p>Hesap türü: <b>${premium ? 'Premium' : 'Normal'}</b></p><p class="ay-not">Hesap bonusları (EXP, düşme şansı, Noah) yakında.</p>` : '<p>Giriş yapılmadı.</p>'],
    }[k];
    if (msg) koMesaj(msg[0], msg[1]);
  };
  const h = bar.getBoundingClientRect().bottom;
  document.documentElement.style.setProperty('--ust-h', Math.ceil(h) + 'px');
}
async function koMesaj(title, html) {
  const { koWindow, toFront } = await import('./ko-pencere.js');
  document.getElementById('ko-mesaj')?.remove();
  const w = document.createElement('div'); w.id = 'ko-mesaj'; w.className = 'ko-panel ko-pencere';
  w.innerHTML = `<div class="ay-baslik">${title}</div><div class="km-govde">${html}</div><div class="nd-dugmeler"><button data-k="tamam" class="ay-dugme">Tamam</button></div>`;
  document.body.append(w); koWindow(w); toFront(w);
  const k = document.createElement('button'); k.className = 'ko-kapat'; k.dataset.k = 'tamam'; k.title = 'Kapat'; w.append(k);
  w.addEventListener('pointerdown', (e) => e.stopPropagation());
  w.addEventListener('click', (e) => { if (e.target.closest('[data-k=tamam]')) w.remove(); });
}
hud.beforeExit = async () => { await state.net?.save(); state.net?.ayril?.(); if (SESSION) await BOOT.sb.rpc('session_release', { p_token: SESSION.token }); };
// sohbet komutları (/tp …)
async function runCommand(line) {
  if (!BOOT?.sb || !BOOT.character) { addLine(null, 'Commands only work while you are logged in.', 0, 'hata'); return; }
  if (state.koKomut && await state.koKomut.calistir(line)) return;   // KO komut listesi (Texts 8000–9511): /town, /greeting, /chatblock …
  if (state.kral && await state.kral.komut(line)) return;   // kraliyet komutları (/RoyalOrder, /Price, /EXPERIENCE_POINT, /DROP_RATE, /RAIN …) ve GM /kral
  // KO özel mesaj: /pm Ad mesaj (ya da /w Ad mesaj); posta: /mail
  { const m = /^\/(pm|w|ozel|özel)\s+(\S+)\s*(.*)$/i.exec(line); if (m && state.pm) { state.pm.adIle(m[2], m[3]); return; } }
  // GM: /cash <oyuncu> <miktar> → Knight Cash ver (eksi değer düşer)
  { const m = /^\/(cash|kc)\s+(\S+)\s+(-?\d+)$/i.exec(line); if (m) {
    if (!state.ghost) { addLine(null, 'This command is for GMs only.', 0, 'hata'); return; }
    BOOT.sb.rpc('gm_cash_ver', { p_char: BOOT.character.id, p_ad: m[2], p_miktar: Number(m[3]) }).then(({ data, error }) => {
      if (error) return addLine(null, 'Cash: ' + error.message, 0, 'hata');
      if (!data?.ok) return addLine(null, 'Cash: ' + (data?.reason || 'failed'), 0, 'hata');
      addLine(null, `${data.ad}: Knight Cash ${Number(m[3]) >= 0 ? '+' : ''}${Number(m[3]).toLocaleString('en-US')} (total ${Number(data.cash).toLocaleString('en-US')} KC).`, 0, 'tamam');
      if (data.ad.toLowerCase() === String(BOOT.character.name).toLowerCase()) { BOOT.character.cash = data.cash; dispatchEvent(new CustomEvent('ko-cash', { detail: data.cash })); }
    });
    return; } }
  if (/^\/(mail|posta)\s*$/i.test(line) && state.mail) { state.mail.ac(); return; }
  const { handleCommand } = await import('./gm.js');
  await handleCommand(line, { sb: BOOT.sb, character: BOOT.character, say: (t, cls) => addLine(null, t, 0, cls), net: state.net, npcUi: state.npcUi, gmWin: state.gmWin, isGm: !!state.ghost, hud,
    konum: () => ({ x: +player.position.x.toFixed(1), z: +player.position.z.toFixed(1) }),
    isinla: (x, z) => { player.position.set(x, state.heightAt(x, z), z); state.target = null; marker.visible = false; state.net?.kick?.(); } });
}
async function startMultiplayer({ sb, character }) {
  if (!document.getElementById('yukleniyor')?.classList.contains('bitti')) window.__koYuklendi = false;
  const { startNet } = await import('./net.js');
  // bağlantı göstergesi + yavaş / kopuk bağlantı penceresi (PvP bölgelerinde 10 sn, diğerlerinde 20 sn sonra sunucu seçimine döner)
  try { const { initBaglanti } = await import('./baglanti.js'); state.baglanti = initBaglanti({ sb, state, hud, pvp: ['freezone_a', 'freezone_b', 'freezone_c'].includes(character.zone) }); } catch (e) { console.warn('bağlantı denetimi', e); }
  { const { initGorunmez } = await import('./gorunmez.js'); state.gorunmez = initGorunmez({ state, player, hud, character: BOOT.character }); }
  state.net = startNet({
    sb, character, gmMi: GMS.has(Number(character.id)), gmIdler: () => GMS,
    // (6.11) 90 m içinde başka oyuncu var mı: yoksa hareket konumu 10 yerine 4 Hz gönderilir
    yakinVar: () => { for (const r of remotes.values()) if (!r.hayalet && Math.hypot(r.obj.position.x - player.position.x, r.obj.position.z - player.position.z) < 90) return true; return false; },
    getLocal: () => ({ x: player.position.x, y: player.position.y + (state.pazarUcus || 0), z: player.position.z, yaw: state.yaw, clip: state.clipNow || 'breath', run: state.run }),
    // GM /tp <oyuncu>: aynı haritadaysa yerinde ışınlan, başka haritadaysa (sunucu konumu güncelledi) o haritayı yükle
    onCagir: (state.cagrildi = (p) => {
      const x = Number(p.x), z = Number(p.z); if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      hud.info?.(p.ad && !p.gm ? `${p.ad} has summoned you.` : `GM ${p.gm || ''} has summoned you.`, 'tamam');
      if (p.zone === character.zone) { player.position.set(x, state.heightAt(x, z), z); state.target = null; if (p.ad && !p.gm) setTimeout(() => { try { state.combat?.benFx?.(401, { eklem: 2, omur: 3000 }); } catch {} }, 60); marker.visible = false; state.net?.kick?.(); return; }
      state.net?.halt?.(); const u = new URL(location.href); u.searchParams.delete('x'); u.searchParams.delete('z'); u.searchParams.delete('bolge'); u.searchParams.set('karakter', character.id);
      setTimeout(() => location.replace(u.toString()), 400);
    }),
    onJoin: (state.uzakKatil = (id, meta) => {
      { const h = remotes.get(id); if (h?.hayalet) state.uzakAyril?.(id, { sebep: 'sessiz' }); }   // (2.11) pazar hayaleti yerine gerçek oyuncu
      const obj = makeAvatar(meta.nation, meta.race, { face: meta.face, hair: meta.hair, sacRenk: meta.sr ?? null }, meta.gear);
      // PvP bölgeleri (Ardream, Ronark Land, Ronark Land Base): düşman ulus isimleri her iki taraf için kırmızı
      const adRenk = Number(meta.nation) === Number(character.nation) ? AD_RENK.dost : AD_RENK.dusman;   // KO: kendi adın açık mavi, aynı ulus mavi, karşı ulus kırmızı
      obj.userData.nameTag = nameSprite(`${meta.name}`, adRenk, { gm: GMS.has(Number(id)) }); obj.add(obj.userData.nameTag); state.rutbe?.isaretle(obj.userData.nameTag.userData.el, id);
      if (meta.klan) klanEtiketi(obj.userData.nameTag, meta.klan, !!meta.kl);
      if (meta.un) unvanEtiketi(obj.userData.nameTag, meta.un);
      obj.userData.pel = kralPel(id, meta.nation, meta.pel || null); obj.userData.pelHam = meta.pel || null; if (obj.userData.chr && obj.userData.pel) pelerinUygula(BOOT.sb, obj.userData.chr, meta.race, obj.userData.pel).catch(() => {});
      obj.userData.bo = meta.bo || 100; obj.userData.don = meta.don || null;
      if (obj.userData.chr) fitName(obj, obj.userData.chr.group, obj.userData.nameTag);
      obj.visible = false; world.add(obj); remotes.set(id, { obj, target: null, meta });
      if (meta.gz) state.gorunmez?.uzakAyarla(remotes.get(id), true, meta.gzs);
      if (GMS.has(Number(id)) && meta.gmfx !== false) setTimeout(() => gmAura(obj, true), 500);
      if (GMS.has(Number(id)) && (meta.gp || meta.yd)) setTimeout(() => { const r = remotes.get(id); if (r) gmEkUzak(id, r); }, 1500);
      if (meta.pt) setTimeout(() => state.pet?.uzak(id, meta.pt), 300);
      if (meta.gn) setTimeout(() => genieUzak(obj, true), 600);
      if (meta.hayalet) remotes.get(id).hayalet = true;   // (2.11) sohbette "has entered the zone" yazılmaz
    }),
    onHp: (id, p) => { const r = remotes.get(id) || remotes.get(Number(id)); if (r) { r.hp = p.hp; r.max_hp = p.max_hp; } state.arena?.canYayini?.(id, p); },
    onMeta: (id, meta) => { const r = remotes.get(id) || remotes.get(Number(id)); if (!r) return; r.meta = { ...r.meta, ...meta }; gmEkUzak(id, r); gmAura(r.obj, GMS.has(Number(id)) && meta.gmfx !== false); if (!!r.obj.userData.genieIst !== !!meta.gn) genieUzak(r.obj, meta.gn); if (!!r.gz !== !!meta.gz) state.gorunmez?.uzakAyarla(r, meta.gz, meta.gzs); klanEtiketi(r.obj.userData.nameTag, meta.klan || null, !!meta.kl); unvanEtiketi(r.obj.userData.nameTag, meta.un || null);
      r.obj.userData.pelHam = meta.pel || null; r.obj.userData.pel = kralPel(id, r.meta.nation, meta.pel || null); if (r.obj.userData.chr) pelerinUygula(BOOT.sb, r.obj.userData.chr, r.meta.race, r.obj.userData.pel).catch(() => {});
      r.obj.userData.bo = meta.bo || 100; r.obj.userData.don = meta.don || null;
      const c = r.obj.userData.chr, fit = (m) => fitName(r.obj, m, r.obj.userData.nameTag);
      if (c) { boyutUygula(c, r.obj.userData.bo, fit); donusumGorsel(c, r.obj.userData.don, fit, r.obj.userData.gear); }
      state.pet?.uzak(id, meta.pt || null); },
    onGear: (id, gear) => {
      const r = remotes.get(id); if (!r) return;
      r.obj.userData.gear = gear;
      const c = r.obj.userData.chr; if (c) donanimIzle(state.gearReady?.then(() => state.donanim?.applyGear(c, r.meta.race, gear)).then(() => donusumGiydir(c, gear)));
    },
    // bağlantısı kopan oyuncu (PvP bölgesi): 10 sn sahada kalır, adının altında "Bağlantı koptu"
    onKopuk: (id, v) => { const r = remotes.get(id); if (!r) return; const el = r.obj.userData.nameTag?.userData?.el; el?.classList.toggle('ad-kopuk', !!v); r.obj.userData.kopuk = !!v;
      if (v) addLine(null, `${r.meta.name} has lost connection.`); },
    onBaglanti: (st) => state.baglanti?.kanal?.(st),
    onLeave: (state.uzakAyril = (id, bilgi = {}) => { const r = remotes.get(id); state.yardimci?.kaldir(String(id)); if (r) { r.obj.userData.chr?._gmPeri?.dispose?.(); r.obj.userData.gmFx?.stop(); genieUzak(r.obj, false); for (const g of Object.values(r.obj.userData.chr?._glow || {})) for (const b of g.b) b.dispose(); for (const b of r.obj.userData.chr?._pathos || []) b.dispose(); r.obj.userData.chr?._pathos?.splice(0); r.obj.userData.chr?._fxKanat?.(); for (const b of r.obj.userData.chr?._peri?.fx || []) b?.dispose?.(); r.obj.userData.chr?._bilezik?.dispose(); r.obj.userData.chr?._kollukFx?.dispose?.(); state.pet?.uzak(id, null); world.remove(r.obj); remotes.delete(id); if (bilgi.sebep === 'pvp_dc') addLine(null, `${r.meta.name} was disconnected from the game due to a lost connection.`); } }),   // (2.11) sohbette "has left." yazılmaz,
    onPos: (state.uzakKonum = (id, p) => {
      const r = remotes.get(id); if (!r) return;
      const now = performance.now();
      if (p.s && r.lastSeq && p.s <= r.lastSeq && r.lastSeq - p.s < 5000) return;   // geç gelen eski paket (çok geride kalan numara = yeniden giriş / eski sürüm: kabul)
      r.lastSeq = p.s || 0;
      const buf = (r.buf ||= []);
      const t = Math.max(now, (buf.at(-1)?.t ?? 0) + 30), son = buf.at(-1);
      // (6.11) uyarlanır ara değerleme gecikmesi: hareket paketlerinin geliş aralığı (ortalama + sapma) — iyi bağlantıda daha az gecikme,
      //   seyrek gönderen (uzaktaki, 4 Hz) / dalgalı bağlantıda takılmadan akış
      const hareketli = !!(p.vx || p.vz);
      if (hareketli && son && r._sonHareket && now - r._sonHareket < 1200) {
        const iv = now - r._sonHareket; r._ort = r._ort ? r._ort * 0.85 + iv * 0.15 : iv; r._sap = (r._sap ?? 15) * 0.85 + Math.abs(iv - r._ort) * 0.15;
        r._gec = Math.min(400, Math.max(70, r._ort + 2 * r._sap + 15));
      }
      if (hareketli) r._sonHareket = now;
      // durgunken (1 Hz) harekete başladı: eski duruş noktası bir aralık öncesine taşınır → hareket gecikmeden ve sıçramadan başlar
      if (hareketli && son && t - son.t > 300 && !(son.vx || son.vz)) buf.push({ ...son, t: t - Math.min(250, r._ort || 100) });
      buf.push({ t, x: p.x, y: p.y, z: p.z, yaw: p.yaw, vx: p.vx || 0, vz: p.vz || 0, c: p.c || 'breath' });
      while (buf.length > 20) buf.shift();
      if (!r.target) { r.obj.position.set(p.x, p.y, p.z); r.obj.rotation.y = p.yaw; r.obj.visible = true; }
      // ölü oyuncu dirilip başka yere ışınlandıysa (ya da yürüyorsa) 'stop' mesajı kaçmış olsa bile ölü pozu hemen kalkar
      if (r.olu && (Math.hypot(p.x - r.olu.x, p.z - r.olu.z) > 3 || /walk|run/.test(p.c || ''))) { r.obj.userData.chr?.stopOnce?.(true); r.olu = null; }
      r.target = p;
    }),
    onPvp: (p) => state.arena?.onPvp(p),
    // diğer oyuncunun efekti: 70 m görüş kuralı (model de o mesafede çizilir)
    onFx: (id, p) => {
      dispatchEvent(new CustomEvent('ko-hedef-etki-yenile', { detail: { id: String(id), from: String(id) } }));   // oyuncu kendine güçlendirme / scroll kullandı → hedef etkileri yenilenir
      const r = remotes.get(id) || remotes.get(Number(id)); if (!r || !state.efekt) return;
      if (p.k === 'koruma') { state.gorunmez?.uzakKoruma?.(r, p.s); return; }
      if (p.k === 'disarm') { const ben = String(p.o) === String(character.id); const api = ben ? state.avatar : (remotes.get(String(p.o)) || remotes.get(Number(p.o)))?.obj?.userData?.chr; state.silahGizle(api, Number(p.ms) || 3000); if (ben) hud.info?.('Your weapon has been disarmed.', 'hata'); return; }   // (8.11) Disarm   // giriş koruması (hafif saydam)
      if (p.k === 'gz') {   // görünmezlik başladı / bitti; göremiyorsam hedefimden de çıkar
        state.gorunmez?.uzakAyarla(r, p.v, p.s);
        if (p.v && !state.gorunmez?.gorurum?.() && state.arena && [state.arena.secili, state.arena.hedef].map(String).includes(String(id))) { state.arena.birak?.(); state.arena.birakSecim?.(); hud.target?.(null); }
        return;
      }
      if (r.meta?.gg && !state.ghost) return;   // gizli GM'in efektleri görünmez
      if (r.gz && !state.gorunmez?.gorurum?.() && p.k !== 'b') return;   // görünmez oyuncu: yalnız üstündeki güçlendirme efektleri (Light Feet, Evade…) görünür
      if (p.k === 'ors') { if ([10100, 10101].includes(Number(p.id)) && Math.hypot(Number(p.x) - player.position.x, Number(p.z) - player.position.z) <= 70) state.efekt(Number(p.id), { x: Number(p.x), y: Number(p.y), z: Number(p.z) }); return; }   // (4.11) başka oyuncunun örs geçme / yanma efekti
      if (Math.hypot(r.obj.position.x - player.position.x, r.obj.position.z - player.position.z) > 70) return;
      if (p.k === 'o') {   // oyuncuya yetenek: hedef ben ya da başka bir oyuncu
        const hedef = String(p.o) === String(character.id) ? player : (remotes.get(String(p.o)) || remotes.get(Number(p.o)))?.obj; if (!hedef) return;
        if (p.cure && state.combat?.cureFx) { const ben = hedef === player; state.combat.cureFx(Number(p.id), () => hedef.position, ben ? state.combat.basYuk() : 1.8, new THREE.Vector3(Math.sin(ben ? state.yaw || 0 : hedef.rotation.y), 0, Math.cos(ben ? state.yaw || 0 : hedef.rotation.y))); return; }   // (8.11) Cure Curse / Disease: kendindekiyle aynı (sarmal zeminde sabit, halka başın üstünde)
        const v = new THREE.Vector3(), dy = Number(p.dy) || 0; state.efekt(Number(p.id), hedef.position, { follow: () => { v.copy(hedef.position); v.y += dy; return v; }, boyut: p.b ?? 0.8, enFazla: p.e ?? 3, ...(p.up ? { dir: new THREE.Vector3(0, 1, 0) } : p.yon ? { dir: new THREE.Vector3(Math.sin(hedef.rotation.y), 0, Math.cos(hedef.rotation.y)) } : {}) }); return;   // dy: başın üstündeki efektler (Eskrima)
      }
      if (p.k === 'kule') { state.towers?.uzakAtes?.(p.t, r.obj); return; }   // kule/muhafız o oyuncuya ateş etti
      state.combat?.uzakFx?.(p, r.obj);
    },
    onAnim: (id, a) => {
      const r = remotes.get(id) || remotes.get(Number(id)); if (!r) return;
      const c = r.obj.userData.chr;
      if (!c) { r.pendingAnim = a; return; }
      if (a.n === 'stop' || a.n === 'stopx') { c.stopOnce(a.n === 'stopx' || r.olu); r.olu = null; }
      else if (c.has?.(a.n) !== false) { c.playOnce(a.n, { hold: !!a.h, speed: Math.min(4, Math.max(0.25, Number(a.s) || 1)) }); r.olu = a.n === 'dead' && a.h ? { x: r.obj.position.x, z: r.obj.position.z } : null; }
    },
    onChat: (name, text, nation, id, cls) => {
      addLine(name, text, nation, cls, id === 'ben' ? BOOT?.character?.id : id);
      if (!name || !id) return;
      const ek = cls === 'bagir' ? 'bagir-yazi' : '';   // (2.11) shout: isim altındaki yazı da sohbetteki shout rengiyle
      if (id === 'ben') { if (state.nameSp) chatBubble(player, state.nameSp, text, state.ghost, false, BOOT?.character?.name || '', ek); return; }
      const r = remotes.get(id) || remotes.get(Number(id)); if (r?.obj.userData.nameTag && !(r.meta?.gg && !state.ghost)) chatBubble(r.obj, r.obj.userData.nameTag, text, GMS.has(Number(id)), false, r.meta?.name || '', ek);
    },
    onCount: (n) => { const el = $('cevrimici'); if (el) el.textContent = n + ' oyuncu'; },
    onKontrol: () => SESSION?.pingYap?.(),
    onDost: (p) => {   // (5.11) başka bir oyuncu bana dost yetenek kullandı: can / güçlendirme simgesi ve hız (değerler sunucuda)
      if (Number(p.heal) > 0) { if (p.hp != null) state.combat?.applyStats?.({ hp: p.hp, max_hp: p.max_hp }); hud.info?.(`${Number(p.heal)} HP Recovered`, 'iyi'); }
      if (p.temizle) { dispatchEvent(new CustomEvent('ko-debuff-temizle')); hud.info?.(`${String(p.ad || 'Cure')}: your curses have been removed.`, 'beceri'); }   // (7.11)
      if (p.buff) {
        const sure = Number(p.sure) || 1, hiz = Number(p.hiz) || 100;
        dispatchEvent(new CustomEvent('ko-etki', { detail: { id: Number(p.skill), ad: String(p.ad || ''), sure, tip: 'buff', anahtar: 'buff:' + p.buff, hiz: hiz !== 100 } }));
        if (hiz !== 100) state.buffHiz = { k: hiz / 100, until: performance.now() + sure * 1000, id: Number(p.skill) };
        state.inv?.stats?.(); setTimeout(() => state.inv?.stats?.(), sure * 1000 + 300);
      }
    },
    onBoyut: (id, v, ben) => state.boyutAyarla?.(id, v, ben),
    onMob: (l) => state.combat?.mobUzak?.(l),   // GM /dc → oturum hemen yoklanır (karar sunucuda)
  });
  // KO klan sistemi (klan penceresi, [Knight Clerk], davet, klan sohbeti, isim altında klan adı)
  // KO Power-Up Store (sol alttaki mağaza düğmesi)
  if (BOOT?.sb && BOOT?.character) hud.onMagaza = () => import('./pus.js').then(({ pusAc }) => pusAc({ sb: BOOT.sb, character: BOOT.character, hud, state, gm: !!state.ghost })).catch((e) => console.warn('mağaza', e));
  // GM boyutu (%) — GM panelinden; kendi karakterimizse presence'a da yazılır
  state.boyutAyarla = (id, v, ben) => {
    if (ben || String(id) === String(character.id)) { character.boyut = v; state.net?.setBoyut?.(v); if (state.avatar) boyutUygula(state.avatar, v, state.fitKendi); return; }
    const r = remotes.get(String(id)) || remotes.get(Number(id)); if (!r) return;
    r.obj.userData.bo = v; const c = r.obj.userData.chr; if (c) boyutUygula(c, v, (m) => fitName(r.obj, m, r.obj.userData.nameTag));
  };
  // KO BUFF_TYPE_SIZE (MAGIC_TYPE4 BuffType 3): 490034 Bezoar → ABNORMAL_GIANT, 490035 Rice cake → ABNORMAL_DWARF; süre bitince eski boyut (presence ile herkeste)
  let boyutT = 0;
  state.boyutEtki = (magic, sure) => {
    const v = magic === 490034 ? 160 : magic === 490035 ? 60 : null; if (!v) return;
    state.boyutTaban ??= Number(character.boyut) || 100;
    state.boyutAyarla(character.id, Math.round(state.boyutTaban * v / 100), true);
    clearTimeout(boyutT); boyutT = setTimeout(() => { state.boyutAyarla(character.id, state.boyutTaban, true); state.boyutTaban = null; }, Math.max(1, sure) * 1000);
  };
  addEventListener('ko-olum', () => { if (state.boyutTaban != null) { clearTimeout(boyutT); state.boyutAyarla(character.id, state.boyutTaban, true); state.boyutTaban = null; } });   // KO: ölünce boyut normale döner
  // dönüşüm (Transformation Totem / Scroll): kısayoldan ya da çantadan kullanılınca liste penceresi
  state.donusumApi = initDonusum({ sb, character, hud, state });
  state.pelerinKendi = (pel) => { state.benimPelHam = pel || null; state.benimPel = kralPel(character.id, character.nation, pel || null); if (state.avatar) pelerinUygula(sb, state.avatar, character.race, state.benimPel).catch(() => {}); };
  // kral değişince: kendi ve bölgedeki oyuncuların pelerini (kral pelerini) yeniden
  addEventListener('ko-kral-degisti', () => {
    state.pelerinKendi?.(state.benimPelHam ?? null);
    for (const [id, r] of remotes) { const yeni = kralPel(id, r.meta?.nation, r.obj.userData.pelHam ?? r.obj.userData.pel ?? null); if (JSON.stringify(yeni) !== JSON.stringify(r.obj.userData.pel)) { r.obj.userData.pel = yeni; if (r.obj.userData.chr) pelerinUygula(sb, r.obj.userData.chr, r.meta.race, yeni).catch(() => {}); } }
  });
  state.remotes = remotes; state.unvanEtiketi = unvanEtiketi;
  state.petP = import('./pet.js').then(({ initPet }) => { state.pet = initPet({ sb, character, state, hud, world, player, nameSprite }); import('./pet-bar.js').then(({ initPetBar }) => { state.petBar = initPetBar({ state }); }).catch((e) => console.warn('pet-bar', e)); }).catch((e) => console.warn('pet', e));
  import('./arkadas.js').then(({ initArkadas }) => { state.arkadas = initArkadas({ sb, character, hud, state }); }).catch((e) => console.warn('arkadas', e));   // KO arkadaş listesi + oyuncu sağ tık menüsü
  import('./basarim.js').then(({ initBasarim }) => { state.basarim = initBasarim({ sb, character, hud, state }); }).catch((e) => console.warn('basarim', e));   // KO başarımları (Karakter Bilgisi → Başarım)
  // aşınmış eşya görünümü: kuşanılmış silah / zırh dayanıklılığı %50 / %25 / 0 → modelde siyah çatlaklar (kostüm takılıysa o parçada yok)
  import('./catlak.js').then(({ catlakAyarla, catlakKademe }) => {
    const PARCA = { 1: ['kask', [42, 43]], 4: ['ust', [43]], 10: ['alt', [44, 43]], 12: ['eldiven', [45, 43]], 13: ['cizme', [46, 43]] };
    // parça anahtarı → kademe; kendi karakterine uygulanır ve diğer oyunculara meta ile gider
    const uygula = (api, harita) => {
      if (!api) return;
      for (const key of ['kask', 'ust', 'alt', 'eldiven', 'cizme']) { const m = api.group.children.find((o) => o.userData.gear === key); if (m) catlakAyarla(m, harita?.[key] || 0); }
      for (const sl of [6, 8]) catlakAyarla(api.plugObj?.('yuva' + sl), harita?.['yuva' + sl] || 0);
    };
    const yenile = () => {
      const I = state.inv?.items;
      if (I) {
        const kad = (sl) => { const e = I.get(sl); return e ? catlakKademe(e.row?.durability, Number(e.it?.Duration) || 0) : 0; };
        const h = {};
        for (const [sl, [key, kost]] of Object.entries(PARCA)) { const k = kost.some((x) => I.has(x)) ? 0 : kad(Number(sl)); if (k) h[key] = k; }
        for (const sl of [6, 8]) { const k = kad(sl); if (k) h['yuva' + sl] = k; }
        uygula(state.avatar, h); state.net?.setCatlak?.(Object.keys(h).length ? h : null);
      }
      for (const r of remotes.values()) uygula(r.obj.userData.chr, r.meta?.ck);
    };
    state.catlakYenile = yenile; setInterval(yenile, 1500);
  }).catch((e) => console.warn('catlak', e));
  // KO Krallık sistemi: kral seçimi, senato, görevden alma, kraliyet komutları, hava, aura
  import('./kral.js').then(({ initKral }) => { state.kral = initKral({ sb, character, hud, state, addLine, scene, camera, player }); }).catch((e) => console.warn('kral', e));
  import('./klan.js').then(({ initKlan }) => { state.klanApi = initKlan({ sb, character, hud, state, addLine, nameTag: (ad, lider) => klanEtiketi(state.nameSp, ad, lider) }); }).catch((e) => console.warn('klan', e));
  // sohbet penceresindeki oyuncu listesi (Konum: yakındakiler önce)
  window.__koEngelliAl = () => (state.engelli ||= new Set());   // susturulan oyuncular (sohbet kutusu, PM kutusu, /chatblock)
  hud.rutbeEl = (id) => state.rutbe?.sembolEl?.(id) || null;
  hud.rutbeK = (id) => { const v = state.rutbe?.kademe?.(id); if (!v) return null; const a = [v.n, v.l].filter((x) => x != null).map(Number); return a.length ? Math.min(...a) : null; };
  hud.kralMi = (id) => Object.values(state.kral?.durum || {}).some((x) => Number(x?.id) === Number(id));   // hedef çubuğundaki sembol kutusu (rütbe)
  // (31.10) KO pazar mesajı: açık pazar belirli aralıkla genel sohbete "Ad [Merchant] : mesaj" yazar ve satıcının altında aynı renkte görünür
  state.pazarDuyur = (id, ad, msj) => {
    if (!msj) return;
    if (state.engelli?.has(String(ad).toLowerCase())) return;
    addLine(null, `${ad} [Merchant] : ${msj}`, 0, 'pazar');
    const ben = Number(id) === Number(BOOT?.character?.id);
    const r = ben ? null : (remotes.get(String(id)) || remotes.get(Number(id)));
    const root = ben ? player : r?.obj, tag = ben ? state.nameSp : r?.obj?.userData?.nameTag;
    if (root && tag) chatBubble(root, tag, msj, false, false, `${ad} [Merchant]`, 'pazar-yazi');
  };
  // (2.11) pazar kurmuş oyuncu bölgede görünmüyorsa (oyundan çıkmış ya da sekmesi arka planda olduğu için sessiz) tezgâhın başında oturan
  // KO karakteri (adı, ırkı, yüzü, saçı, kuşandıkları) sunucudan alınıp gösterilir; gerçek oyuncu gelince onunla değişir, pazar kapanınca kalkar
  const _hayaletIst = new Set();
  state.pazarHayaletleri = async (liste) => {
    if (!state.uzakKatil) return;
    const var_ = new Set(liste.map((x) => String(x.id)));
    for (const [id, r] of [...remotes]) if (r.hayalet && !var_.has(String(id))) state.uzakAyril(id, { sebep: 'sessiz' });
    for (const st of liste) {
      const id = String(st.id); if (remotes.has(id) || remotes.has(Number(id)) || _hayaletIst.has(id)) continue;
      _hayaletIst.add(id);
      try {
        const { data: d } = await BOOT.sb.rpc('oyuncu_ekipman', { p_char: BOOT.character.id, p_hedef: Number(id) });
        if (!d?.ok || remotes.has(id)) continue;
        await state.gearReady; const E = await import('./envanter.js');
        const gear = state.donanim ? state.donanim.gearCodes(kaskFiltre(E.kusanilanlar(d.esyalar || []))) : [];
        state.uzakKatil(id, { name: d.name, nation: d.nation, race: d.race, face: d.face ?? 0, hair: d.hair ?? 0, sr: d.sr ?? null, cls: d.class, level: d.level, gear, hayalet: 1 });
        const y = state.heightAt?.(st.x, st.z) ?? 0;
        state.uzakKonum(id, { x: st.x, y, z: st.z, yaw: Number(st.yaw) || 0, c: 'sit_breath', s: 0 });
      } catch (e) { console.warn('pazar hayalet', e); } finally { _hayaletIst.delete(id); }
    }
  };
  hud.listeMenu = (id, ad, x, y) => !!state.arkadas?.listeMenu?.(id, ad, x, y);   // sohbetin solundaki oyuncu listesinde sağ tık (KO re_minimenu_userlist)
  hud.ozelMesajAc = (id, ad) => (Number(id) ? state.pm?.ac?.(Number(id), ad) : state.pm?.adIle?.(ad));   // oyuncu listesinde sağ tık → özel mesaj penceresi
  hud.oyuncuKaynak = (tur) => {
    const a = state.net?.liste?.(tur) || [];
    if (!a.some((o) => o.ben) && BOOT?.character) a.push({ id: String(BOOT.character.id), name: BOOT.character.name, nation: BOOT.character.nation, level: BOOT.character.level, ben: true });
    if (tur === 'konum') { const d = (o) => { if (o.ben) return 1e10; const r = remotes.get(String(o.id)) || remotes.get(Number(o.id)); return r ? r.obj.position.distanceTo(player.position) : 1e9; }; a.sort((x, y) => d(x) - d(y)); }
    else a.sort((x, y) => (y.ben - x.ben) || String(x.name).localeCompare(String(y.name), 'tr'));
    return a;
  };
}
// KO: seviye atlayınca sağ altta Seed bildirimi (re_quest_seed) — combat.js / görev ödülü 'ko-seviye' olayı
addEventListener('ko-seviye', () => { import('./ko-bildirim.js').then((M) => M.seviyeSeed()).catch(() => {}); });

// (8.11) Disarm: sağ el (yuva6) silahı süre boyunca gizlenir; donanım yenilense de süre bitene dek gizli kalır, sonra yeniden görünür (envanter değişmez)
function silahGizleKur(st) {
  st.silahGizle = (api, ms) => {
    if (!api) return; api._disarmBit = performance.now() + ms;
    if (api._disarmIv) return;
    const uygula = () => { const o = api.plugObj?.('yuva6'); const aktif = performance.now() < api._disarmBit; if (o) o.visible = !aktif; if (!aktif) { clearInterval(api._disarmIv); api._disarmIv = null; } };
    api._disarmIv = setInterval(uygula, 100); uygula();
  };
}
