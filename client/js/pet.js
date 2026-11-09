import { ekUI, hasLayout, buildLayout } from './kui.js';
// KO pet sistemi (24xx: PET_DATA / Kaul). Kaul yumurtası → Kaul (çantadaki pet eşyası). Sağ tık: çağır / geri gönder.
// Pet sahibini takip eder; komutlar: Takip, Bekle, Saldırı (Attack Packet), Savunma (Defense Packet), Toplama (Automatic Looting).
// Seviye 1–60 (öldürülen mob EXP'sinin %30'u), tokluk 0–10000 (çağrılıyken dakikada 10 azalır, yemle dolar).
// Görünüm: Image Change (L/M/H) ve adlı dönüşüm parşömenleri KO pet görünümlerini verir (mob modelleri).
// Sunucu: pets tablosu + pet_* RPC'leri; diğer oyuncular petleri presence 'pt' bilgisiyle görür.
// Peri (Oreads/Driads/Alsaydes, yuva 48) ve pet Toplama komutu: kendi sandıklarını loot_oto ile otomatik toplar.
import * as THREE from '../vendor/three.module.min.js';
import { hasNpc, createNpc } from './character.js';
import { koWindow, toFront } from './ko-pencere.js';
import { mobFxTak } from './mobfx.js';
import { fxEkle } from './fx.js';

// pet görünümü (eşya no) → NPC modeli (NPC_Looks; Moradon'daki Kaul ağılı npc_25500)
export const PET_MODEL = {
  610001000: 'npc_25500', 610002000: 'npc_25500', 610003000: 'npc_25500',
  610004000: 'npc_200', 610005000: 'npc_800', 610006000: 'npc_4300', 610007000: 'npc_100', 610008000: 'npc_2010',
  610009000: 'npc_4100', 610010000: 'npc_600', 610011000: 'npc_2400', 610012000: 'npc_2200', 610013000: 'npc_1102',
  610014000: 'npc_2000', 610015000: 'npc_25500', 610016000: 'npc_31171', 610017000: 'npc_5812', 610018000: 'npc_31172',
  610019000: 'npc_5829', 508088000: 'npc_5875', 508089000: 'npc_5872',   // Sexy Santa (미녀산타), Magpie, Dream Girl (꿈꾸는 소녀 카루)
};
const PERI = new Set([700038000, 700039000, 700042000, 700047000, 900386900]);   // Driads, Oreads, Alsaydes, Nereids
// KO pet komutları (PetMainHandler: MODE_ATTACK / MODE_DEFENCE / MODE_LOOTING)
const KOMUT = [['saldiri', 'Attack'], ['savunma', 'Defense'], ['toplama', 'Looting']];
// KO pet becerileri (Skill_Magic_Main 301001–301006): ad, gereken seviye, bekleme (sn)
// pet envanteri (KO): 5 yuva — [css sınıfı, etiket, açıklama]
const PET_YUVA = [['yem', 'Food', 'Familiar food (Leaf, Bread, Milk) — eaten automatically when Satiation drops'], ['can', 'HP Potion', 'HP potion'], ['mana', 'MP Potion', 'MP potion'], ['paket', 'Package', 'Package: Automatic Looting, Attack/Defense/Loyal Packet'], ['paket', 'Package', 'Package: Automatic Looting, Attack/Defense/Loyal Packet']];
// [id, ad, seviye, bekleme sn, hasar çarpanı, ek hasar] — sunucu pet_beceri ile aynı; ikonlar assets/yetenek/pet-beceri.webp (skillicon_0N_3010)
const BECERI = [[301001, 'Slap', 10, 4, 1.2, 0], [301002, 'Razorsharp toenail', 20, 5, 1.2, 50], [301003, 'Heavy attack', 30, 6, 1.0, 50], [301004, 'Leg Bite', 40, 10, 1.0, 0], [301005, 'Strong fang', 50, 8, 2.0, 0], [301006, 'Fatal Attack', 60, 10, 1.5, 200]];
const PET_TUS = 'KeyJ';
const PET_PORTAL = 'ds_pet_potal.fxb';   // KO pet doğma ışığı (fx.tbl 30403 20060103_pet_potal_01.fxb; deadsoft fx arşivinden — assets/fxpet)
// Toplama düğmesinin sağ üstündeki sandık simgesi
const SANDIK_SVG = '<svg viewBox="0 0 16 14" width="14" height="12"><path d="M1.5 5.5 Q8 -1 14.5 5.5 V7 H1.5Z" fill="#b5651d" stroke="#3a1f08"/><rect x="1.5" y="7" width="13" height="6" fill="#8b4a14" stroke="#3a1f08"/><rect x="1.5" y="6.2" width="13" height="1.6" fill="#e8c25a"/><rect x="6.6" y="6" width="2.8" height="3.6" rx=".6" fill="#ffe27a" stroke="#6a4a10" stroke-width=".6"/></svg>';   // pet penceresi kısayolu
const KATE = new Set([13016, 13017, 13018]), KUPON_NPC = new Set([29056, 25177]);
const FAMILIAR_SUMMON = 389191000;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const modelAnahtar = (g) => { const k = PET_MODEL[Number(g)] || 'npc_25500'; return hasNpc(k) ? k : 'npc_25500'; };
const _b = new THREE.Box3();

// model: yükseklik ~1 m olacak şekilde ölçeklenir (mob görünümleri pet boyutunda)
// KO pet efekt takıları (NPC_Looks n3fxplug): Magpie npc_2009k_girl_elmo_.n3fxplug, Dream Girl (pet 5876) npc_daughter2009_karus.n3fxplug → marseu_pet_g_all.fxb
const PET_FXKEY = { npc_5872: 'npc_5876', npc_5875: 'npc_5875' };
let FXM_AL = () => null;
async function petModeli(gorunum, efektli = true) {
  const key = modelAnahtar(gorunum);
  const m = await createNpc(key).catch(() => null); if (!m) return null;
  m.setClip('breath'); m.update(0);
  m.group.updateMatrixWorld(true); _b.setFromObject(m.group, true);
  const h = _b.isEmpty() ? 1 : _b.max.y - _b.min.y;
  const hedef = key === 'npc_5829' || key === 'npc_5872' || key === 'npc_31166' ? 1.25 : key === 'npc_25500' ? 0.95 : 1.05;
  const sc = Math.max(0.15, Math.min(1.3, hedef / Math.max(0.2, h))); m.group.scale.setScalar(sc);
  if (efektli) mobFxTak(m, PET_FXKEY[key] || key, FXM_AL, sc).catch(() => {});
  return { m, key, boy: Math.min(2.2, hedef) };
}

// takipçi: sahibin sağ arka çaprazında durur, uzaklaşınca yürür/koşar, çok uzaksa yanına ışınlanır
function takipci(world, nameSprite) {
  const kok = new THREE.Group(); kok.name = 'pet'; world.add(kok);
  const o = { kok, model: null, pos: new THREE.Vector3(), yaw: 0, moving: false, run: false, atk: 0, tag: null, gorunum: 0, yukNo: 0 };
  o.yukle = async (gorunum, ad, renk = '#c4c4ff', sahip = '') => {
    if (sahip) o.sahip = sahip;
    if (o.gorunum === gorunum && o.model) { o.ad(ad); return; }
    o.gorunum = gorunum; const no = ++o.yukNo;
    const r = await petModeli(gorunum); if (!r || no !== o.yukNo) return;
    if (o.model) { o.model._mobFx?.dur(); o.model.group.removeFromParent(); }
    o.model = r.m; kok.add(r.m.group);
    if (!o.tag) { o.tag = nameSprite(ad, renk, { kind: 'pet' }); kok.add(o.tag); }
    o.tag.position.y = r.boy + 0.25; o.ad(ad);
  };
  // KO: pet adı iki satır — "<pet adı>" / "of <sahibi>" (lavanta)
  o.ad = (ad) => { const e = o.tag?.userData?.el?.querySelector('.ad'); if (!e) return; const k = ad + '|' + (o.sahip || ''); if (e.dataset.k === k) return; e.dataset.k = k; e.textContent = ad; if (o.sahip) { e.append(document.createElement('br'), document.createTextNode('of ' + o.sahip)); } };
  o.kaldir = () => { o.yukNo++; o.model?._mobFx?.dur(); kok.removeFromParent(); };
  o.git = (tx, tz, dt, hiz) => {
    const dx = tx - o.pos.x, dz = tz - o.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { o.moving = false; return d; }
    const s = Math.min(d, hiz * dt); o.pos.x += dx / d * s; o.pos.z += dz / d * s;
    const hy = Math.atan2(dx, dz); let df = ((hy - o.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; o.yaw += df * Math.min(1, dt * 10);
    o.moving = s > 0.2 * dt; return d;
  };
  o.kare = (dt, yer) => {
    o.pos.y = yer(o.pos.x, o.pos.z);
    kok.position.copy(o.pos); kok.rotation.y = o.yaw;
    if (o.model) { if (!(o.atk > performance.now())) o.model.setClip(o.moving ? (o.run ? 'run' : 'walk') : 'breath'); o.model.update(dt); }
  };
  return o;
}

export function initPet({ sb, character, state, hud, world, player, nameSprite }) {
  fxEkle('./assets/fxpet').catch(() => {});   // deadsoft pet doğma efekti
  const PVP_BOLGE = new Set(['freezone_a', 'freezone_b', 'freezone_c', 'ronark_land', 'ronark', 'battle', 'arena', 'bifrost', 'krowaz', 'juraid', 'border_defence', 'chaos']);
  const pvpBolge = () => { const z = String(state.zone || character.zone || '').toLowerCase(); return PVP_BOLGE.has(z) || !!state.arena?.icinde?.(); };
  FXM_AL = () => state.fx;
  const me = character;
  let pet = null;            // sunucudaki çağrılı pet (_pet_json)
  let ben = null;            // kendi petimizin takipçisi
  let takili = null;   // omuz yuvasında takılı ama çağrılı olmayan pet (aç kalıp döndü): J ile envanteri açılıp beslenebilir
  const PW = () => pet || takili;
  let win = null, acik = true, gizli = false, gorev = null, sonVurus = 0, vuruyor = false, olumAni = 0, cagiriliyor = false, cagirKol = null;
  // çağırma kol animasyonu: KO e_Ani 18 (yoksa büyü duruşu), %50 yavaş; döküm efekti 2701 (Ability_cast0_1) — süre (ms) döner
  function cagirAnim() {
    const av = state.avatar, dolu = (c) => av?.has?.(c) && (av?.sure?.(c) || 0) >= 0.3;
    const c = dolu('a18') ? 'a18' : 'cast';
    av?.playOnce?.(c, { speed: 0.5 });
    const ms = Math.max(700, (av?.sure?.(c) || 1) * 2000);   // %50 hızda klibin tam süresi
    cagirKol = { av, x: player.position.x, z: player.position.z, bit: performance.now() + ms + 200, iptal: false };   // yürürse kol animasyonu ve çağırma iptal (update)
    state.efekt?.(2701, player.position, { follow: () => player.position, boyut: 0.8, enFazla: 2.5 });
    state.net?.fx?.({ k: 'b', id: 2701, b: 0.8, e: 2.5 });
    return { ms, kol: cagirKol };
  }
  const uzaklar = new Map();   // oyuncu id → {t: takipçi, pt}
  const rpc = async (ad, arg) => { const { data, error } = await sb.rpc(ad, { p_char: me.id, ...arg }); if (error) throw new Error(error.message); return data; };
  const bilgi = (m, t = 'beceri') => hud.info?.(m, t);
  const hata = (m) => hud.notice?.(m, 'hata');

  // ---- pencere (KO pet bilgi paneli): solda canlı pet görüntüsü, sağda HP/MP/EXP/tokluk; komutlar, beceriler; altta 5 yuvalı pet envanteri (Yem / Can İksiri / Mana İksiri / Paket / Paket)
  const ESYA = new Map();   // num → eşya (fromDb)
  async function esyaBilgi(nums) {
    const eksik = [...new Set(nums.filter((n) => n && !ESYA.has(n)))]; if (!eksik.length) return;
    const { data } = await sb.from('items').select('*').in('num', eksik);
    const { fromDb } = await import('./esya.js'); for (const r of data || []) ESYA.set(Number(r.num), fromDb(r));
  }
  let onizleme = null;   // {cv, r, sc, cam, holder, m, g, yaw}
  function onizlemeKur() {
    const cv = document.createElement('canvas'); cv.className = 'pt-onizleme';
    const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0);
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x445533, 1.25));
    const l = new THREE.DirectionalLight(0xfff4e0, 1.5); l.position.set(0.5, 1, 1.2); sc.add(l);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50), holder = new THREE.Group(); sc.add(holder);
    onizleme = { cv, r, sc, cam, holder, m: null, g: 0, yaw: 0.6 };
    let dx = null;
    cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); dx = e.clientX; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (dx != null) { onizleme.yaw += (e.clientX - dx) * 0.012; dx = e.clientX; } });
    cv.addEventListener('pointerup', () => (dx = null));
  }
  async function onizlemeModel(g) {
    if (!onizleme || onizleme.g === g) return; onizleme.g = g;
    const m = await createNpc(modelAnahtar(g)).catch(() => null); if (!m || onizleme.g !== g) return;
    if (onizleme.m) onizleme.m.group.removeFromParent();
    onizleme.m = m; m.group.scale.z = -1; onizleme.holder.add(m.group); m.setClip('breath'); m.update(0);
    m.group.updateMatrixWorld(true); _b.setFromObject(m.group, true);
    const H = Math.max(0.3, _b.max.y - _b.min.y), W = Math.max(_b.max.x - _b.min.x, _b.max.z - _b.min.z), cy = (_b.max.y + _b.min.y) / 2, D = Math.max(H, W * 0.8) * 2.3;
    onizleme.cam.position.set(0, cy, D); onizleme.cam.lookAt(0, cy, 0);
  }
  function onizlemeKare(dt) {
    const o = onizleme; if (!o || !o.cv.isConnected) return;
    const w = o.cv.clientWidth, h = o.cv.clientHeight; if (!w || !h) return;
    const pr = Math.min(devicePixelRatio || 1, 2);
    if (o.cv.width !== Math.round(w * pr) || o.cv.height !== Math.round(h * pr)) { o.r.setPixelRatio(pr); o.r.setSize(w, h, false); o.cam.aspect = w / h; o.cam.updateProjectionMatrix(); }
    if (o.m) { o.m.setClip(ben?.model?.clip || 'breath'); o.m.update(dt); }
    o.holder.rotation.y = Math.PI + o.yaw; o.r.render(o.sc, o.cam);
  }
  // pet uyanıkken (çağrılı) pencere kapalıysa: can çubuğunun sağında mini HP / MP / EXP / tokluk çubukları (posta zarfıyla çakışmaz)
  // (31.10) KO orijinal pet can çubuğu (re_pet_hpbar, assets/ui/pethp): pet çağrılıyken oyuncunun can çubuğunun altında —
  // ad · LV · HP · MP · tokluk (x/100) · EXP ince çizgi. Tıklayınca KO pet menüsü (P).
  let mini = null, miniL = null; ekUI('pethp').catch(() => {});
  let miniKonum = null; try { miniKonum = JSON.parse(localStorage.getItem('ko-pet-hp-yer') || 'null'); } catch {}
  function miniCiz() {
    const goster = !!(pet && pet.cagrili && ben && !olumAni);
    if (!goster) { if (mini) mini.hidden = true; return; }
    if (!mini) {
      if (!hasLayout('re_pet_hpbar')) { ekUI('pethp').then(() => miniCiz()).catch(() => {}); return; }
      miniL = buildLayout('re_pet_hpbar', { className: 'ko-pet-hp kui-dokulu' }); mini = miniL.el; mini.id = 'pet-mini'; mini.title = 'Familiar (P)';
      for (const id of ['Progress_HP_slow', 'Progress_HP_drop', 'Progress_HP_lasting']) miniL.show(id, false);
      // (31.10) her zaman sürüklenebilir (yer tarayıcıda saklanır; çift tık: varsayılan yer); sürüklemeden tıklama → pet menüsü
      let d = null, tasindi = false;
      mini.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.button !== 0) return; const z = parseFloat(getComputedStyle(mini.parentElement || document.body).zoom) || 1; d = { x: e.clientX, y: e.clientY, l: parseFloat(mini.style.left) || 0, t: parseFloat(mini.style.top) || 0, z }; tasindi = false; mini.setPointerCapture(e.pointerId); });
      mini.addEventListener('pointermove', (e) => { if (!d) return; const dx = (e.clientX - d.x) / d.z, dy = (e.clientY - d.y) / d.z; if (!tasindi && Math.hypot(dx, dy) < 4) return; tasindi = true;
        miniKonum = { x: Math.round(Math.max(0, Math.min(innerWidth / d.z - 40, d.l + dx))), y: Math.round(Math.max(0, Math.min(innerHeight / d.z - 30, d.t + dy))) }; mini.style.left = miniKonum.x + 'px'; mini.style.top = miniKonum.y + 'px'; });
      mini.addEventListener('pointerup', () => { if (!d) return; d = null; if (tasindi) { try { localStorage.setItem('ko-pet-hp-yer', JSON.stringify(miniKonum)); } catch {} } else menuAc(); });
      mini.addEventListener('dblclick', () => { miniKonum = null; try { localStorage.removeItem('ko-pet-hp-yer'); } catch {} miniYer(); });
      (document.getElementById('kohud') || document.body).append(mini);
    }
    const st = pet.stat?.saldiri != null ? pet.stat : { hp: 300 + pet.seviye * 80, mp: 150 + pet.seviye * 30 };
    const o = (a, b) => Math.max(0, Math.min(1, (Number(a) || 0) / (Number(b) || 1)));
    const hp = pet.hp ?? st.hp, mhp = pet.max_hp ?? st.hp, mp = pet.mp ?? st.mp, mmp = pet.max_mp ?? st.mp, tok = Math.round((Number(pet.tokluk) || 0) / 100);
    miniL.text('text_id', pet.ad); miniL.text('text_level', String(pet.seviye));
    miniL.text('Text_HP', `${hp}/${mhp}`); miniL.text('Text_MSP', `${mp}/${mmp}`); miniL.text('Text_Stomach', `${tok}/100`);
    miniL.progress('Progress_HP', o(hp, mhp)); miniL.progress('Progress_msp', o(mp, mmp)); miniL.progress('Progress_Stomach', tok / 100); miniL.progress('Progress_EXP', o(pet.exp, pet.gerek));
    mini.hidden = false; miniYer();
  }
  function miniYer() {
    if (!mini || mini.hidden) return;
    if (miniKonum) { mini.style.left = miniKonum.x + 'px'; mini.style.top = miniKonum.y + 'px'; return; }
    const hpEl = document.querySelector('.ko-hp'); if (!hpEl) return;
    const r = hpEl.getBoundingClientRect(), z = parseFloat(getComputedStyle(mini.parentElement || document.body).zoom) || 1;
    mini.style.left = Math.round(r.left / z + 4) + 'px'; mini.style.top = Math.round(r.bottom / z + 2) + 'px';
  }
  setInterval(miniYer, 1000); addEventListener('resize', miniYer);
  function ciz() {
    miniCiz();
    if (win) { win.remove(); win = null; }
    return;   // (31.10) KO'da olmayan pet penceresi (#pet-pencere) kaldırıldı — pet yalnız KO menüsüyle (P: Status / Item / Skill)
    if (!PW()) { if (win) { win.remove(); win = null; } return; }
    if (!win) {
      win = document.createElement('div'); win.id = 'pet-pencere'; win.className = 'ko-panel ko-pencere';
      // oyuncu envanteriyle aynı katmanda (#kohud) — öne gelme sırası envanterle paylaşılır
      (document.getElementById('kohud') || document.body).append(win); koWindow(win, { center: false }); win.style.left = '12px'; win.style.top = '170px';
      win.classList.add('onde');
      win.addEventListener('pointerdown', (e) => { if (!e.target.closest('.pt-yuva')) e.stopPropagation(); });
      // pencerenin boş bir yerinden tutup ekran içinde istenen yere sürükle
      let d = null, tasindi = false;
      const zm = () => parseFloat(getComputedStyle(win.parentElement || document.body).zoom) || 1;
      win.addEventListener('pointerdown', (e) => {
        tasindi = false;
        if (e.button !== 0 || e.target.closest('button, .pt-yuva, canvas, .pt-x')) return;
        const z = zm(); d = { dx: e.clientX / z - (parseFloat(win.style.left) || 0), dy: e.clientY / z - (parseFloat(win.style.top) || 0), x0: e.clientX, y0: e.clientY };
        win.setPointerCapture(e.pointerId);
      });
      win.addEventListener('pointermove', (e) => {
        if (!d) return;
        if (!tasindi && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
        tasindi = true; win.classList.add('suruklen');
        const z = zm(), W = innerWidth / z, H = innerHeight / z;
        win.style.left = Math.round(Math.min(Math.max(0, e.clientX / z - d.dx), W - win.offsetWidth)) + 'px';
        win.style.top = Math.round(Math.min(Math.max(0, e.clientY / z - d.dy), H - win.offsetHeight)) + 'px';
      });
      const birak = () => { d = null; win?.classList.remove('suruklen'); };
      win.addEventListener('pointerup', birak); win.addEventListener('pointercancel', birak);
      win.addEventListener('click', (e) => { if (tasindi) { e.stopPropagation(); e.preventDefault(); tasindi = false; } }, true);
      win.addEventListener('keydown', (e) => e.stopPropagation());
      win.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-k]'); if (!b) return;
        const k = b.dataset.k;
        if (k === 'kucult') { acik = !acik; ciz(); return; }
        if (k === 'toplama-ayar') { e.stopPropagation(); return ayarAc('pet'); }
        if (k === 'kapat') { gizli = true; win.hidden = true; ipucu?.remove(); miniCiz(); return; }
        if (k === 'gonder') return gonder();
        // KO: komut düğmesi aç / kapa — bir kez basınca etkin olur, tekrar basınca kapanır (pasif: PW() yalnız takip eder)
        if (k.startsWith('m:')) {
          const ist = k.slice(2), yeni = PW().mod === ist ? 'pasif' : ist;
          try {
            const d = await rpc('pet_mod', { p_mod: yeni }); if (!d.ok) return hata(d.reason); guncelle(d.pet);
            if (PW().mod === 'toplama') kuyrukDoldur();
            if (PW().mod === 'pasif') bilgi(`${PW().ad}: Familiar ${({ saldiri: 'Attack', savunma: 'Defense', toplama: 'Looting' })[ist] ?? ''} Mode disabled.`);
            else bilgi(`${PW().ad}: Familiar ${({ saldiri: 'Attack', savunma: 'Defense', toplama: 'Looting' })[PW().mod] ?? ''} Mode enabled.${PW().mod === 'saldiri' ? ' It attacks the target you select with Z.' : PW().mod === 'savunma' ? ' It does not attack and follows you.' : ' It loots the chests of the monsters you kill.'}`);
          } catch (er) { hata(er.message); }
        }
      });
      // çantadan sürüklenen eşya PW() yuvasına bırakılır (envanter.js 'ko-esya-birak')
      win.addEventListener('ko-esya-birak', async (ev) => {
        const y = ev.target.closest?.('[data-pet-yuva]'); const ps = y ? Number(y.dataset.petYuva) : -1; if (ps < 0) return;
        try { const d = await rpc('pet_esya_koy', { p_bag_slot: ev.detail.slot, p_pet_slot: ps }); if (!d.ok) return hata(d.reason); guncelle(d.pet); state.inv?.reload?.(); } catch (er) { hata(er.message); }
      });
      // PW() yuvasından çantaya: sağ tık ya da sürükleyip çanta yuvasına bırak
      const al = async (ps, bag = null) => { try { const d = await rpc('pet_esya_al', { p_pet_slot: ps, p_bag_slot: bag }); if (!d.ok) return hata(d.reason); guncelle(d.pet); state.inv?.reload?.(); } catch (er) { hata(er.message); } };
      win.addEventListener('contextmenu', (e) => { const y = e.target.closest('[data-pet-yuva]'); if (!y) return; e.preventDefault(); e.stopPropagation(); if (PW()?.envanter?.[Number(y.dataset.petYuva)]) al(Number(y.dataset.petYuva)); });
      let surukle = null;
      win.addEventListener('pointerdown', (e) => { const y = e.target.closest('[data-pet-yuva]'); if (!y || e.button !== 0 || !PW()?.envanter?.[Number(y.dataset.petYuva)]) return; e.stopPropagation(); surukle = Number(y.dataset.petYuva); });
      addEventListener('pointerup', (e) => { if (surukle == null) return; const ps = surukle; surukle = null; const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.inv-yuva'); if (hit && Number(hit.dataset.slot) >= 14) al(ps, Number(hit.dataset.slot)); });
      win.addEventListener('pointermove', (e) => {
        const y = e.target.closest('[data-pet-yuva]'), x = y && PW()?.envanter?.[Number(y.dataset.petYuva)];
        if (!x) { ipucu?.remove(); return; }
        const it = ESYA.get(Number(x.num)); if (!it) return;
        import('./esya.js').then(({ tooltipHtml }) => { ipucu ||= Object.assign(document.createElement('div'), { id: 'pet-ipucu', className: 'ko-ipucu' }); /* pencerelerin üstünde (z 6000) */ if (!ipucu.isConnected) document.body.append(ipucu); ipucu.innerHTML = tooltipHtml(it); ipucu.style.left = Math.min(innerWidth - ipucu.offsetWidth - 8, e.clientX + 16) + 'px'; ipucu.style.top = Math.max(8, e.clientY - 10) + 'px'; });
      });
      win.addEventListener('pointerleave', () => ipucu?.remove());
    }
    const p = PW(), yuz = (a, b) => Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100)).toFixed(1);
    const st = p.stat?.saldiri != null ? p.stat : { hp: 300 + p.seviye * 80, mp: 150 + p.seviye * 30, saldiri: 15 + p.seviye * 8, savunma: 20 + p.seviye * 6 }, simdi = Date.now() / 1000, env = Array.from({ length: 5 }, (_, i) => p.envanter?.[i] || null);
    esyaBilgi(env.filter(Boolean).map((x) => Number(x.num))).then(() => { if (win && acik) yuvalariCiz(env); });
    const atkCarp = p.atk || Number(p.cd?.atk) > simdi ? 1.2 : 1, defCarp = p.def || Number(p.cd?.def) > simdi ? 1.2 : 1;
    const hasar = Math.round((st.saldiri || 0) * atkCarp), savunma = Math.round((st.savunma || 0) * defCarp);
    win.hidden = gizli;
    win.innerHTML = `<div class="pt-baslik" data-k="kucult" title="Click: minimize / expand · drag: move · shortcut: J">${esc(p.ad)} <span>Lv. ${p.seviye}</span></div><button class="pt-x" data-k="kapat" title="Hide (open again with J)">×</button>` + (acik ? `
      <div class="pt-govde">
        <div class="pt-ust"><div class="pt-sol"></div><div class="pt-sag">
          <div class="pt-satir"><label>HP</label><div class="pt-cubuk"><i class="pt-hp" style="width:${yuz(p.hp ?? st.hp, p.max_hp ?? st.hp)}%"></i><b>${p.hp ?? st.hp ?? '-'} / ${p.max_hp ?? st.hp ?? '-'}</b></div></div>
          <div class="pt-satir"><label>MP</label><div class="pt-cubuk"><i class="pt-mp" style="width:${yuz(p.mp ?? st.mp, p.max_mp ?? st.mp)}%"></i><b>${p.mp ?? st.mp ?? '-'} / ${p.max_mp ?? st.mp ?? '-'}</b></div></div>
          <div class="pt-satir"><label>EXP</label><div class="pt-cubuk"><i class="pt-exp" style="width:${yuz(p.exp, p.gerek)}%"></i><b>${yuz(p.exp, p.gerek)}%</b></div></div>
          <div class="pt-satir"><label>Satiation</label><div class="pt-cubuk"><i class="pt-tok${p.tokluk < 2000 ? ' az' : ''}" style="width:${yuz(p.tokluk, 10000)}%"></i><b>${p.tokluk} / 10000</b></div></div>
          <div class="pt-deger"><span>Attack</span><b>${hasar}${atkCarp > 1 ? ' <em>+%20</em>' : ''}</b><span>Defense</span><b>${savunma}${defCarp > 1 ? ' <em>+%20</em>' : ''}</b></div>
        </div></div>
        <div class="pt-komut">${KOMUT.map(([k, a]) => `<button class="ay-dugme${p.mod === k ? ' secili' : ''}${k === 'toplama' && !p.toplama ? ' kilitli' : ''}${k === 'toplama' ? ' pt-toplama' : ''}" data-k="m:${k}" title="${k === 'toplama' ? (p.toplama ? 'Looting: goes to the chests of monsters you kill, picks up the drops, then returns to you' : 'Looting: put Automatic Looting into a Package slot of the Familiar inventory') : k === 'saldiri' ? 'Attack: runs to the target you select with Z and attacks it' : 'Defense: does not attack, follows you'}">${a}${k === 'toplama' ? `<span class="pt-sandik" data-k="toplama-ayar" title="Toplama seçenekleri">${SANDIK_SVG}</span>` : ''}</button>`).join('')}<button class="ay-dugme" data-k="gonder">Gönder</button></div>
        <div class="pt-beceri">${BECERI.map(([id, ad, sv, cd, carp, ek], i) => { const bh = Math.round(((st.saldiri || 0) * carp + ek) * atkCarp), kalan = Math.max(0, Math.ceil(Number(p.cd?.[id] || 0) - simdi));
          return `<span class="${p.seviye >= sv ? 'acik' : ''}" title="${ad}\nRequired level: ${sv}\nDamage: ${bh}\nMP: ${(id - 301000) * 10}\nCooldown: ${cd} sec${p.seviye >= sv ? '' : '\n(locked)'}"><em class="pt-bik" style="background-position:${-i * 26}px 0"></em><u>${ad}</u><i>${kalan ? kalan + 's' : 'Lv.' + sv}</i></span>`; }).join('')}</div>
        <div class="pt-env-baslik">Familiar Inventory</div>
        <div class="pt-env">${env.map((_, i) => `<div class="pt-hucre"><div class="pt-yuva ${PET_YUVA[i][0]}" data-pet-yuva="${i}" data-esya-birak="1"></div><span title="${PET_YUVA[i][2]}">${PET_YUVA[i][1]}</span></div>`).join('')}</div>
      </div>` : '');
    if (acik) {
      if (!onizleme) onizlemeKur();
      win.querySelector('.pt-sol').append(onizleme.cv); onizlemeModel(p.gorunum);
      yuvalariCiz(env);
    }
  }
  let ipucu = null;
  function yuvalariCiz(env) {
    import('./esya.js').then(({ iconHtml }) => {
      win?.querySelectorAll('[data-pet-yuva]').forEach((el) => {
        const x = env[Number(el.dataset.petYuva)], it = x && ESYA.get(Number(x.num));
        el.innerHTML = it ? `${iconHtml(it, 30)}${Number(x.count) > 1 ? `<b>${x.count}</b>` : ''}` : '';
      });
    });
  }

  function guncelle(p) {
    if (!p) return;
    const eskiG = pet?.gorunum, eskiAd = pet?.ad, eskiSv = pet?.seviye;
    if (!p.cagrili) { const t = { ...(pet || takili || {}), ...p }; if (pet) kaldir(); takili = t; ciz(); return; }   // çağrılı değil: yalnız pencere (besleme)
    takili = null;
    pet = { ...(pet || {}), ...p };
    if (!ben) { ben = takipci(world, nameSprite); const a = player.position; ben.pos.set(a.x - 1.2, a.y, a.z - 1.2); }
    if (eskiG !== pet.gorunum || eskiAd !== pet.ad || !ben.model) ben.yukle(pet.gorunum, pet.ad, '#c4c4ff', me.name);
    if (eskiSv && pet.seviye > eskiSv) { bilgi(`${pet.ad} leveled up! Level ${pet.seviye}`, 'seviye'); const v = ben.pos; state.efekt?.(10018, v, { follow: () => ben?.pos || v }); }
    state.net?.setPet?.([pet.gorunum, pet.ad, pet.seviye]);
    ciz();
  }
  function kaldir() {
    if (mini) mini.hidden = true;
    olumAni = 0;
    if (ben) { ben.kaldir(); ben = null; }
    pet = null; gorev = null; gizli = true; if (win) win.hidden = true; ipucu?.remove?.(); ciz(); state.net?.setPet?.(null);
  }
  async function gonder() { try { await rpc('pet_gonder', {}); } catch {} if (pet) bilgi(`${pet.ad} has been dismissed.`); kaldir(); state.inv?.reload?.(); }

  // ---- çanta: pet eşyaları (sağ tık)
  const PET_KIND = new Set([150, 152, 170, 171, 172, 173, 174, 176]);
  const KUPON = new Set([900386000, 900385000, 814038000, 930521000, 814039000, 810465000, 814661000, 931782000, 931783000, 931784000, 931785000, 999700042,
    800500000, 810630000, 900773000, 910080000, 910088000, 998015000, 810072000, 810471000, 910947000]);   // + Magic Bag kuponları (Kayra, 30 gün)
  const IRUTA_KUPON = new Set([810465000, 931782000, 931783000, 931784000, 931785000]);
  function esyaMi(it) { const n = Number(it?.Num); return PET_KIND.has(Number(it?.Kind)) || n === FAMILIAR_SUMMON || KUPON.has(n); }
  async function kullan(slot, it) {
    const kind = Number(it?.Kind), num = Number(it?.Num);
    try {
      if (KUPON.has(num)) return hata(IRUTA_KUPON.has(num) ? 'Exchange this voucher with [Peddler] Iruta in Moradon.' : 'Exchange this voucher with [Vendor] Kaira in Moradon.');
      if (kind === 150) return hata('[Trainer] Kate in Moradon hatches the egg (when you give it a name).');
      if (kind === 171) return hata('Use the appearance scroll with your pet at [Trainer] Kate.');
      if (kind === 170) return bilgi('Drag Automatic Looting into the Package slot of the pet window to unlock Looting Mode.', 'esya');
      if (num === FAMILIAR_SUMMON) {
        if (state.combat?.dead) return hata('You cannot summon a Familiar while dead.');
        if (pvpBolge() && !(pet && pet.cagrili)) return hata('You cannot summon a Familiar in PvP zones.');
        if (cagiriliyor) return;
        // KO Pat summon (Skill_Magic_Main 500117): kol animasyonu (iSelfAnimID 18, %50 yavaş) + döküm efekti 2701; pet animasyonun sonunda
        // 20060103_pet_potal_01.fxb (fx.tbl 30403) ışığıyla ortaya çıkar. Çağrılı pet varsa aynı eşya geri gönderir.
        const cagir = !(pet && pet.cagrili && !olumAni);
        cagiriliyor = true;
        try {
          // KO: pet, kol animasyonu tamamen bittikten sonra çağrılır; karakter bu sırada yürürse çağırma iptal olur
          if (cagir) {
            // karakter yürürken çağırırsa: önce durur ve 1 sn bekler (bu sürede yürüyemez), sonra kol animasyonu başlar
            const x0 = player.position.x, z0 = player.position.z;
            await new Promise((r) => setTimeout(r, 80));
            const yuruyor = !!state.target || Math.hypot(player.position.x - x0, player.position.z - z0) > 0.02;
            if (yuruyor) {
              state.target = null; state.okKilit = Math.max(state.okKilit || 0, performance.now() + 1000);
              await new Promise((r) => setTimeout(r, 1000));
              if (state.combat?.dead) return;
            }
            const { ms, kol } = cagirAnim(), t0 = performance.now();
            while (performance.now() - t0 < ms && !kol.iptal && !state.combat?.dead) await new Promise((r) => setTimeout(r, 50));
            if (kol.iptal || state.combat?.dead) return bilgi('Familiar summon has been cancelled.', 'hata');
          }
          const d = await rpc('pet_cagir', { p_slot: 5 }); if (!d.ok) { state.avatar?.stopOnce?.(); if (d.pet) pet = null; return hata(d.reason); }
          if (d.gonderildi) { bilgi(`${d.pet.ad} has been dismissed.`); kaldir(); }
          else {
            if (ben && pet && pet.id !== d.pet.id) kaldir();
            if (olumAni) kaldir();
            acik = true; gizli = false; guncelle(d.pet); bilgi(`${d.pet.ad} has been summoned (Lv. ${d.pet.seviye}).`);
            if (ben) { const v = ben.pos.clone(); state.fx?.play?.(PET_PORTAL, { pos: v, follow: () => ben?.pos || v, enFazla: 12 }); }
          }
        } finally { cagiriliyor = false; }
      } else {
        const d = await rpc('pet_esya', { p_slot: slot }); if (!d.ok) return hata(d.reason); bilgi(d.mesaj, 'esya'); guncelle(d.pet);
        // KO 301009 / 301010 Atk / Def Packet: döküm 2701 + hedef 702 petin üstünde
        if ((kind === 172 || kind === 173) && ben) { const v = ben.pos.clone(); state.efekt?.(2701, v, { follow: () => ben?.pos || v, boyut: 0.7, enFazla: 2 }); state.efekt?.(702, v, { follow: () => ben?.pos || v, boyut: 0.7, enFazla: 2.5 }); }
      }
      state.inv?.reload?.();
    } catch (e) { hata(e.message); }
  }

  // ---- otomatik toplama (peri ya da pet Toplama komutu)
  const periVar = () => { const e = state.inv?.items?.get?.(48); if (!e) return false; const o = Number(e.it?.org ?? e.row?.items?.org_num ?? e.row?.item_num); const n = Number(e.row?.item_num); return PERI.has(o) || PERI.has(Math.floor(n / 1000) * 1000) || n === 900386900; };
  const petTopla = () => pet && pet.mod === 'toplama' && pet.toplama && pet.tokluk > 0;   // Automatic Looting paket yuvasında
  // Toplama: oyuncunun öldürdüğü mobların sandıkları sıraya girer; pet sırayla gidip toplar, bitince oyuncunun yanına döner
  const kuyruk = [];
  function kutuDustu(id, x, z) {
    if (!petTopla() || !ben) return;
    if (gorev?.id === id || kuyruk.some((k) => k.id === id)) return;
    kuyruk.push({ id, x, z });
  }
  function kuyrukDoldur() {   // Toplama komutu verilince yakındaki kendi sandıkları da sıraya girer
    for (const b of state.loot?.kutular?.() || []) if (Number(b.owner) === Number(me.id) && Math.hypot(b.x - player.position.x, b.z - player.position.z) < 30) kutuDustu(b.id, b.x, b.z);
  }
  async function topla(id, kim) {
    try {
      const d = await rpc('pet_topla', { p_box: id, p_x: player.position.x, p_z: player.position.z, p_filtre: petFiltre });
      if (!d?.ok) return;
      if (d.gold > 0) { bilgi(`${kim}: Picked up ${Number(d.gold).toLocaleString('en-US')} Coins.`, 'drop'); state.combat?.applyStats?.({ gold: d.total_gold }); }
      for (const a of d.alinan || []) bilgi(`${kim}: Picked up ${a.name || 'an item'}`, 'drop');
      if (d.kalan > 0) { if (/n/.test(petFiltre) && /m/.test(petFiltre) && /r/.test(petFiltre) && /c/.test(petFiltre) && /u/.test(petFiltre) && /y/.test(petFiltre)) hata(`${kim}: your inventory is full; ${d.kalan} items were left in the chest.`); }   // seçili olmayan türler sandıkta kalır
      else state.loot?.kaldir?.(id);
      if (d.alinan?.length) state.inv?.reload?.();
    } catch {}
  }

  // ---- savaş: Saldırı → seçili hedef; Savunma → sana saldıran mob
  function hedefBul() {
    if (!pet || !ben) return null;
    // yeniden doğan mobun canı sunucuda ilk vuruşa kadar 0 kalır → yalnız dead_until'e bakılır
    const canli = (n) => n && !(n.dead_until && new Date(n.dead_until) > new Date());   // deneme korkulukları da (oyuncu gibi pet de vurabilir)
    // KO: Saldırı → pet, oyuncunun Z ile seçtiği hedefe koşar ve saldırır. Savunma ve Toplama komutlarında pet hasar vurmaz.
    if (pet.mod === 'saldiri') { const n = state.combat?.target; if (canli(n) && n.pos && Math.hypot(n.pos.x - player.position.x, n.pos.z - player.position.z) < 30) return n; }
    return null;
  }
  const yerelCd = new Map();
  let istekBeceri = 0;
  // pet kısayol çubuğu (pet-bar.js): Saldırı modu aç/kapa, hedefe saldır komutu, beceri isteği
  async function modSec(ist, kapatabilir = true) {
    if (!pet?.cagrili) return false;
    const yeni = pet.mod === ist ? (kapatabilir ? 'pasif' : ist) : ist;
    if (yeni === pet.mod) return true;
    try {
      const d = await rpc('pet_mod', { p_mod: yeni }); if (!d.ok) { hata(d.reason); return false; } guncelle(d.pet);
      const ad = ({ saldiri: 'Attack', savunma: 'Defense', toplama: 'Looting' })[ist] ?? '';
      bilgi(`${pet.ad}: Familiar ${ad} Mode ${yeni === 'pasif' ? 'disabled' : 'enabled'}.`);
      return true;
    } catch (er) { hata(er.message); return false; }
  }
  async function saldirKomut() {
    if (!pet?.cagrili) return;
    const n = state.combat?.target;
    if (!n || n.dead_until && new Date(n.dead_until) > new Date()) return hata('Select a target first.');
    if (pet.mod !== 'saldiri' && !(await modSec('saldiri', false))) return;
    sonVurus = 0;
  }
  async function beceriIste(id) {
    const b = BECERI.find((x) => x[0] === Number(id)); if (!b || !pet?.cagrili) return;
    if (pet.seviye < b[2]) return hata(`${b[1]}: requires familiar level ${b[2]}.`);
    const simdi = Date.now() / 1000;
    if (Number(pet.cd?.[b[0]]) > simdi || (yerelCd.get(b[0]) || 0) > simdi) return;
    if ((pet.mp ?? 1e9) < (b[0] - 301000) * 10) return hata('Not enough familiar MP.');
    if (!state.combat?.target) return hata('Select a target first.');
    if (pet.mod !== 'saldiri' && !(await modSec('saldiri', false))) return;
    istekBeceri = b[0]; sonVurus = 0;
  }
  const beceriKalan = (id) => { const simdi = Date.now() / 1000; return Math.max(0, Number(pet?.cd?.[id] || 0) - simdi, (yerelCd.get(id) || 0) - simdi); };
  async function vur(n) {
    if (vuruyor || performance.now() - sonVurus < 1400) return;
    vuruyor = true; sonVurus = performance.now();
    if (ben.model?.playOnce('attack', { speed: 0.9 })) ben.atk = performance.now() + 900;
    try {
      const simdi = Date.now() / 1000;
      const uygun = ([id, , sv]) => pet.seviye >= sv && !(Number(pet.cd?.[id]) > simdi) && !((yerelCd.get(id) || 0) > simdi) && pet.tokluk > 10 && (pet.mp ?? 1e9) >= (id - 301000) * 10;
      const ist = istekBeceri && BECERI.find((b) => b[0] === istekBeceri); istekBeceri = 0;   // pet kısayol çubuğundan (Alt+N) istenen beceri önce
      const bc = (ist && uygun(ist) ? ist : null) || [...BECERI].reverse().find(([id, , sv]) => pet.seviye >= sv && !(Number(pet.cd?.[id]) > simdi) && !((yerelCd.get(id) || 0) > simdi) && pet.tokluk > 10 && (pet.mp ?? 1e9) >= (id - 301000) * 10);   // beceri MP'si: (sıra) × 10
      const arg = { p_mob: n.id, p_x: player.position.x, p_z: player.position.z, p_mx: n.pos.x, p_mz: n.pos.z };
      if (bc) yerelCd.set(bc[0], simdi + bc[3]);
      let d = bc ? await rpc('pet_beceri', { ...arg, p_beceri: bc[0] }) : await rpc('pet_vur', arg);
      if (bc && d?.reason === 'mp') { if (d.pet) guncelle(d.pet); d = await rpc('pet_vur', arg); }   // MP yetmedi: normal vuruş
      if (bc && d?.ok && d.beceri) {
        bilgi(`${pet?.ad || 'Pet'}: ${bc[1]}`, 'beceri');
        // KO Skill_Magic_Main 301001–301006: petin üstünde döküm efekti 2601 (heal_cast), hedefte vuruş efekti 10002 (damage0_1)
        const bp = ben?.pos; if (bp) state.efekt?.(2601, bp, { follow: () => ben?.pos || bp, boyut: 0.7, enFazla: 2 });
        state.efekt?.(10002, new THREE.Vector3(n.pos.x, n.pos.y + 1, n.pos.z), { boyut: 0.8, enFazla: 2.5 });
      }
      if (d?.ok) { state.combat?.petVurus?.(n, d, pet?.ad || 'Pet'); if (d.pet) guncelle(d.pet); }
      else if (d?.reason === 'aç') { bilgi(`${pet?.ad || 'Pet'} became too hungry and returned.`, 'hata'); kaldir(); }
    } catch {} finally { vuruyor = false; }
  }

  // ---- kare güncellemesi
  const yer = (x, z) => state.heightAt?.(x, z) ?? 0;
  function update(dt) {
    // çağırma kol animasyonu: karakter yürümeye başlarsa (0,3 m) hemen kesilir
    if (cagirKol) {
      const k = cagirKol;
      if (performance.now() > k.bit || state.avatar !== k.av) cagirKol = null;
      else if (Math.hypot(player.position.x - k.x, player.position.z - k.z) > 0.3) { cagirKol = null; k.iptal = true; k.av?.stopOnce?.(); }
    }
    onizlemeKare(dt);
    if (ben && pet && olumAni) { ben.moving = false; ben.kare(dt, yer); }   // ölüm animasyonu: yerinde yatar
    else if (ben && pet) {
      const a = player.position, y = state.yaw || 0;
      const hx = a.x - Math.sin(y) * 1.5 + Math.cos(y) * 1.1, hz = a.z - Math.cos(y) * 1.5 - Math.sin(y) * 1.1;
      const uz = Math.hypot(a.x - ben.pos.x, a.z - ben.pos.z);
      if (uz > 35 || state.combat?.dead) { ben.pos.set(hx, 0, hz); gorev = null; }
      const n = hedefBul();
      if (gorev && performance.now() - gorev.t > 8000) gorev = null;
      if (!gorev && petTopla()) {
        while (kuyruk.length && !(state.loot?.kutular?.() || []).some((b) => b.id === kuyruk[0].id)) kuyruk.shift();   // açılmış / silinmiş sandık
        const k = kuyruk.shift(); if (k) gorev = { ...k, t: performance.now() };
      } else if (!petTopla()) kuyruk.length = 0;
      if (gorev) {
        ben.run = true; const d = ben.git(gorev.x, gorev.z, dt, 7.5);
        if (d < 1.4) { const g = gorev; gorev = null; topla(g.id, pet.ad); }
      } else if (n) {
        const r = 1.2 + (n.t?.size || 100) / 100 * 0.6;
        const dx = n.pos.x - ben.pos.x, dz = n.pos.z - ben.pos.z, d = Math.hypot(dx, dz);
        if (d > r) { ben.run = true; ben.git(n.pos.x - dx / d * r * 0.9, n.pos.z - dz / d * r * 0.9, dt, 7.5); }
        else { ben.moving = false; ben.yaw = Math.atan2(dx, dz); vur(n); }
      } else { const d = Math.hypot(hx - ben.pos.x, hz - ben.pos.z); ben.run = d > 4; if (d > 0.6 || ben.moving) ben.git(hx, hz, dt, ben.run ? 7.5 : 3.6); }
      ben.kare(dt, yer);
    }
    for (const [id, u] of uzaklar) {
      const r = state.remotes?.get?.(id) || state.remotes?.get?.(Number(id));
      if (!r?.obj) continue;
      u.t.kok.visible = r.obj.visible;
      const a = r.obj.position, y = r.obj.rotation.y;
      const hx = a.x - Math.sin(y) * 1.5 + Math.cos(y) * 1.1, hz = a.z - Math.cos(y) * 1.5 - Math.sin(y) * 1.1;
      const d = Math.hypot(hx - u.t.pos.x, hz - u.t.pos.z);
      if (d > 35) u.t.pos.set(hx, 0, hz);
      u.t.run = d > 4; if (d > 0.6 || u.t.moving) u.t.git(hx, hz, dt, u.t.run ? 7.5 : 3.6);
      u.t.kare(dt, yer);
    }
  }
  // diğer oyuncuların petleri (presence 'pt': [görünüm, ad, seviye])
  function uzak(id, pt) {
    id = String(id); const u = uzaklar.get(id);
    if (!pt) { if (u) { u.t.kaldir(); uzaklar.delete(id); } return; }
    const [g, ad] = pt;
    const sahipAd = () => { const r0 = state.remotes?.get?.(id) || state.remotes?.get?.(Number(id)); return r0?.meta?.name || r0?.meta?.ad || ''; };
    if (u) { u.t.yukle(g, ad, '#c4c4ff', sahipAd()); return; }
    const t = takipci(world, nameSprite);
    const r = state.remotes?.get?.(id) || state.remotes?.get?.(Number(id)); if (r?.obj) t.pos.set(r.obj.position.x - 1.2, 0, r.obj.position.z - 1.2);
    uzaklar.set(id, { t, pt }); t.yukle(g, ad, '#c4c4ff', sahipAd());
    if (r?.obj?.visible !== false) { const v = t.pos.clone(); v.y = state.heightAt?.(v.x, v.z) ?? 0; state.fx?.play?.(PET_PORTAL, { pos: v, follow: () => t.pos, enFazla: 12 }); }   // KO pet doğma ışığı
  }

  // ---- KO Oreads: 5 m çevredeki kendi sandıklarını seçili türlere göre toplar (re_new_looting_option)
  const periOrg = () => { const e = state.inv?.items?.get?.(48); return e ? Number(e.it?.org ?? Math.floor(Number(e.row?.item_num) / 1000) * 1000) : 0; };
  const TURLER = [['g', 'Noah'], ['n', 'Normal'], ['m', 'Magic'], ['r', 'Rare'], ['c', 'Craft'], ['u', 'Unique'], ['y', 'Upgrade']];
  let filtre = 'gnmrcuy'; try { filtre = localStorage.getItem('ko-oreads-filtre') ?? filtre; } catch {}
  let petFiltre = 'gnmrcuy'; try { petFiltre = localStorage.getItem('ko-pet-filtre') ?? petFiltre; } catch {}
  const denendi = new Map();
  setInterval(async () => {
    if (periOrg() !== 700039000 || state.combat?.dead) return;
    const p = player.position, now = performance.now();
    for (const b of state.loot?.kutular?.() || []) {
      if (Number(b.owner) !== Number(me.id) || Math.hypot(b.x - p.x, b.z - p.z) > 5) continue;
      if ((denendi.get(b.id) || 0) > now) continue;
      denendi.set(b.id, now + 4000);
      try {
        const d = await rpc('peri_topla', { p_box: b.id, p_x: p.x, p_z: p.z, p_filtre: filtre });
        if (!d?.ok) continue;
        if (d.gold > 0) { bilgi(`Oreads: Picked up ${Number(d.gold).toLocaleString('en-US')} Coins.`, 'drop'); state.combat?.applyStats?.({ gold: d.total_gold }); }
        for (const a of d.alinan || []) bilgi(`Oreads: Picked up ${a.name || 'an item'}`, 'drop');
        if (d.kalan > 0) denendi.set(b.id, now + 1e9); else state.loot?.kaldir?.(b.id);   // seçili olmayan / sığmayan eşyalar sandıkta kalır
        if (d.alinan?.length) state.inv?.reload?.();
      } catch {}
    }
  }, 400);
  // toplama seçenekleri penceresi: Oreads için çantadaki takılı periye çift tık, pet için Toplama düğmesindeki sandık
  let ayarWin = null;
  // tur 'peri': Oreads (5 m) · tur 'pet': pet Toplama komutu (pet penceresindeki Toplama düğmesinin sandık simgesi)
  let ayarTur = null;
  function ayarAc(tur = 'peri') {
    tur = tur === 'pet' ? 'pet' : 'peri';
    if (tur === 'peri' && periOrg() !== 700039000) { bilgi('This fairy cannot loot (only Oreads can).', 'hata'); return; }
    if (ayarWin) { const ayni = ayarTur === tur; ayarWin.remove(); ayarWin = null; ayarTur = null; if (ayni) return; }
    ayarTur = tur;
    const al = () => (tur === 'pet' ? petFiltre : filtre);
    const yaz = (f) => { if (tur === 'pet') { petFiltre = f; try { localStorage.setItem('ko-pet-filtre', f); } catch {} } else { filtre = f; try { localStorage.setItem('ko-oreads-filtre', f); } catch {} denendi.clear(); } };
    ayarWin = document.createElement('div'); ayarWin.id = 'peri-ayar'; ayarWin.className = 'ko-panel ko-pencere' + (tur === 'pet' ? ' pet-ayar' : '');
    const baslik = tur === 'pet' ? `${esc(pet?.ad || 'Familiar')} — Looting Options` : 'Oreads — Looting Options';
    const not = tur === 'pet' ? 'In Looting mode your Familiar picks up only the selected types from dropped chests.' : 'Only the selected types are looted from chests within 5 meters.';
    const ciz2 = () => { ayarWin.innerHTML = `<div class="pt-baslik">${baslik}</div><div class="pa-not">${not}</div><div class="pa-liste">${TURLER.map(([k, a]) => `<label><input type="checkbox" data-t="${k}" ${al().includes(k) ? 'checked' : ''}> ${a}</label>`).join('')}</div><div class="pt-alt"><button class="ay-dugme" data-k="hepsi">Hepsi</button><button class="ay-dugme" data-k="kapat">Kapat</button></div>`; };
    ciz2(); document.body.append(ayarWin); koWindow(ayarWin); toFront(ayarWin);
    ayarWin.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(ayarWin); });
    ayarWin.addEventListener('change', () => yaz([...ayarWin.querySelectorAll('input:checked')].map((i) => i.dataset.t).join('')));
    ayarWin.addEventListener('click', (e) => { const k = e.target.closest('[data-k]')?.dataset.k; if (k === 'kapat') { ayarWin.remove(); ayarWin = null; ayarTur = null; } if (k === 'hepsi') { yaz('gnmrcuy'); ciz2(); } });
  }
  addEventListener('ko-peri-ayar', () => ayarAc('peri'));

  // peri sol üstteki etki çubuğunda gösterilmez (istek üzerine); eski oturumdan kalan simge silinir.
  // Oreads toplama ayarları: çantadaki takılı periye (yuva 48) çift tıkla.
  dispatchEvent(new CustomEvent('ko-etki-sil', { detail: 'peri' }));
  addEventListener('dblclick', (e) => {
    const el = e.target.closest?.('.inv-esya[data-slot="48"], .inv-yuva[data-slot="48"]'); if (!el || !periVar()) return;
    e.preventDefault(); e.stopPropagation(); dispatchEvent(new CustomEvent('ko-peri-ayar'));
  }, true);

  // açılışta çağrılı pet varsa geri gelir; tokluk dakikada bir sunucudan
  const yenile = async () => { try { const d = await rpc('pet_bilgi', {}); takili = d?.pet ? null : (d?.takili || null); if (d?.pet) guncelle(d.pet); else if (pet) { bilgi(`${pet.ad} became too hungry and returned. Feed it with pet food.`, 'hata'); kaldir(); } } catch {} };
  // oyuna girişte pet her zaman çağrılmamış başlar (yükleme ekranında doğmaz, pet penceresi açılmaz); sunucuda çağrılı kaldıysa geri gönderilir
  (async () => { try {
    let d = await rpc('pet_bilgi', {});
    if (d?.pet) { try { await rpc('pet_gonder', {}); } catch {} d = await rpc('pet_bilgi', {}).catch(() => null); }
    takili = d?.pet ? null : (d?.takili || null);
  } catch {} })();
  setInterval(() => { if (pet) yenile(); }, 60000);

  // ---- KO NPC'leri: [Trainer] Kate (yumurta, görünüm, ad, ticaret) · [Vendor] Kayra / [Peddler] Iruta (peri kuponları)
  const cantadan = (f) => { const L = []; for (const [s, e] of state.inv?.items || []) if (s >= 14 && s <= 41 && f(e)) L.push({ slot: s, e }); return L; };
  const ad_ = (e) => e?.it?.strName || e?.row?.items?.name || 'Item';
  async function konumKaydet() { try { await state.net?.save?.(); } catch {} }
  async function npcMenu({ npc, ad, model, ticaret }) {
    const { npcMenuAc, npcMenuKapat } = await import('./npc-menu.js');
    // menü satırları her zaman görünür; seçince çanta sunucudan tazelenip bakılır (yoksa bu adımda söylenir)
    const sec = async (baslik, liste, fn) => {
      if (typeof liste === 'function') { try { await state.inv?.reload?.(); } catch {} liste = liste(); }
      if (!liste.length) { npcMenuAc({ ad, model, metin: baslik + '\n\nYou have no suitable item in your inventory.', secenekler: [{ ad: 'Back', kalsin: true, fn: () => ana() }] }); return; }
      npcMenuAc({ ad, model, metin: baslik, secenekler: [...liste.slice(0, 10).map((x) => ({ ad: x.etiket || ad_(x.e), fn: () => fn(x) })), { ad: 'Back', kalsin: true, fn: () => ana() }] });
    };
    // KO [Familiar Tamer] Kate menüsü (görsel birebir): Hatching and transform · Name Change · Shop · [Use Arrange Line] · [Event] … · I'll just go.
    const KATE_AD = '[Familiar Tamer] Kate';
    const yumurta = { ad: 'Hatch a Kaul egg', kalsin: true, fn: () => sec('Which egg shall we hatch?', () => cantadan((e) => Number(e.it?.Kind) === 150), (x) => {
        npcMenuKapat(); hud.girdi?.('Name Your Pet', 'Name of your new pet (1–15 letters/digits):', { max: 15 }, async (isim) => {
          if (!isim) return; await konumKaydet();
          try { const d = await rpc('pet_kulucka', { p_slot: x.slot, p_ad: isim }); if (!d.ok) return hata(d.reason); bilgi(`The egg has hatched: ${d.pet.ad}! Equip it in the shoulder slot and call it with Familiar Summon.`, 'seviye'); state.inv?.reload?.(); } catch (er) { hata(er.message); }
        });
      }) };
    const gorunum = { ad: 'Change pet appearance', kalsin: true, fn: () => sec('Which pet\'s appearance should change?', () => [...cantadan((e) => Number(e.it?.Kind) === 151), ...(state.inv?.items?.get?.(5) && Number(state.inv.items.get(5).it?.Kind) === 151 ? [{ slot: 5, e: state.inv.items.get(5) }] : [])], (p) => {
        sec('Which scroll shall we use?', () => cantadan((e) => Number(e.it?.Kind) === 171), async (s) => {
          npcMenuKapat(); await konumKaydet();
          try { const d = await rpc('pet_gorunum_degis', { p_pet_slot: p.slot, p_scroll_slot: s.slot }); if (!d.ok) return hata(d.reason); bilgi(`${d.pet.ad} has taken on a new appearance: ${d.ad}.`, 'seviye'); state.inv?.reload?.(); } catch (er) { hata(er.message); }
        });
      }) };
    const isimDegis = { ad: 'Change pet name', kalsin: true, fn: () => sec('Which pet\'s name should change? (Requires a Certificate of Familiar Name Change)', () => [...cantadan((e) => Number(e.it?.Kind) === 151), ...(state.inv?.items?.get?.(5) && Number(state.inv.items.get(5).it?.Kind) === 151 ? [{ slot: 5, e: state.inv.items.get(5) }] : [])], (p) => {
        npcMenuKapat(); hud.girdi?.('Pet Name', 'New name (1–15 letters/digits):', { max: 15 }, async (isim) => {
          if (!isim) return; await konumKaydet();
          try { const d = await rpc('pet_ad_degis', { p_pet_slot: p.slot, p_ad: isim }); if (!d.ok) return hata(d.reason); bilgi(`Your Familiar's new name: ${d.pet.ad}`, 'seviye'); if (pet && pet.id === d.pet.id) guncelle(d.pet); state.inv?.reload?.(); } catch (er) { hata(er.message); }
        });
      }) };
    const kate = () => npcMenuAc({ ad: KATE_AD, model, metin: "I'm [Trainer] Kate. I'm in charge of all things related to Familiar You can hatch Familiar eggs or change names with the [Familiar Name Change Scroll]. I also sell everything your Familiar needs.", secenekler: [
      // KO: ilk menü orijinal re_pet_quest penceresini sağdan açar (yumurtayı yuvaya koy → ad yaz → Confirm)
      { ad: 'Familiar Hatching and transform', fn: () => import('./pet-kulucka.js').then(({ petKuluckaAc }) => petKuluckaAc({ sb, character: me, hud, state })).catch((er) => hata(er.message)) },
      { ...isimDegis, ad: 'Familiar Name Change' },
      { ad: 'Familiar Shop', fn: () => ticaret?.() },
      { ad: '[Use Arrange Line]', kalsin: true, fn: () => npcMenuAc({ ad: KATE_AD, model, metin: "You need a [Familiar Arrange Line] to use this service. You can purchase it from Power Up Store (PUS).", secenekler: [{ ad: 'Previous Page', kalsin: true, fn: () => kate() }] }) },
      { ad: '[Event] World Championship Pet reward', kalsin: true, fn: () => npcMenuAc({ ad: KATE_AD, model, metin: 'The World Championship event is not in progress. There is no reward for you right now.', secenekler: [{ ad: 'Previous Page', kalsin: true, fn: () => kate() }] }) },
      { ad: "I'll just go.", fn: () => {} },
    ] });
    const kupon = async () => {
      const { data } = await sb.from('kupon_takas').select('*').eq('npc', npc);
      const K = new Map((data || []).map((r) => [Number(r.kupon), r]));
      const fisTakas = () => sec('Which voucher shall we exchange?', () => cantadan((e) => K.has(Number(e.row?.item_num))).map((x) => ({ ...x, etiket: `${ad_(x.e)} → ${K.get(Number(x.e.row.item_num)).gun} days` })), async (x) => {
        npcMenuKapat(); await konumKaydet();
        try { const d = await rpc('kupon_takas_yap', { p_slot: x.slot, p_npc: npc }); if (!d.ok) return hata(d.reason); bilgi(d.hemen ? `You've received the ${d.ad} (${d.gun} days) item; its period has started. Put it on the hotkey bar and press its key to use it.` : `You've received the ${d.ad} (${d.gun} days) item. Its period starts when you use it.`, 'seviye'); state.inv?.reload?.(); } catch (er) { hata(er.message); }
      });
      const yok = (es) => npcMenuAc({ ad, model, metin: `You don't have a [${es}]. You can purchase it from Power Up Store (PUS).`, secenekler: [{ ad: 'Confirm', kalsin: true, fn: () => ana() }] });
      const varMi = (re) => cantadan((e) => re.test(ad_(e) || '')).length > 0;
      // KO [Vendor] Iruta (Quest_Talk 11804): bakım ödülü fişi — tek "Confirm"
      if (npc === 25177) {
        npcMenuAc({ ad, model, metin: "Welcome. We're exchanging cash item for the reward of the maintenance. The item will only be valid for one day. Select the menu to exchange the item.", secenekler: [{ ad: 'Confirm', kalsin: true, fn: fisTakas }] });
        return;
      }
      // KO [Vendor] Kaira (Quest_Talk 3018 "May the gods bless you...", Quest_Menu 45573 / 40882 / 40873 / 40102 / 7796 / 8229 / 45297 / 40887 / 7228)
      npcMenuAc({ ad, model, metin: 'May the gods bless you...', secenekler: [
        { ad: 'Ticket Exchange Use', kalsin: true, fn: fisTakas },
        { ad: '[Gold Dragon Egg] Exchanging items', kalsin: true, fn: () => yok('Gold Dragon Egg') },
        { ad: "Exchange [Pandora's Box]", kalsin: true, fn: async () => { try { await state.inv?.reload?.(); } catch {}
          if (!varMi(/pandora/i)) return npcMenuAc({ ad, model, metin: "You don't have a [Pandora's Box]. You can purchase it from Power Up Store (PUS).", secenekler: [{ ad: 'Confirm', kalsin: true, fn: () => ana() }] });
          npcMenuAc({ ad, model, metin: "Welcome. I see you have a [Pandora's Box]. Do you wish to exchange?", secenekler: [{ ad: 'Confirm', kalsin: true, fn: () => hata("The [Pandora's Box] exchange is not available yet.") }, { ad: 'Back', kalsin: true, fn: () => ana() }] }); } },
        { ad: 'Exchanging items', kalsin: true, fn: () => npcMenuAc({ ad, model, metin: 'Which item will you exchange?', secenekler: [
          { ad: 'Open Pathos Gloves Package', kalsin: true, fn: () => sec('Which package shall we open?', () => cantadan((e) => [508070000, 508074000, 508114000].includes(Number(e.row?.item_num))), async (x) => {
            npcMenuKapat(); await konumKaydet();
            try { const d = await rpc('pathos_paket_kir', { p_slot: x.slot }); if (!d.ok) return hata(d.reason); bilgi(`You've received ${d.adet} x ${d.ad}.`, 'seviye'); state.inv?.reload?.(); } catch (er) { hata(er.message); }
          }) },
          { ad: 'Exchange Wing of Dragon coupon', kalsin: true, fn: () => import('./npc-hizmet.js').then(({ sertifikaMenu }) => sertifikaMenu({ sb, character, hud, state, ad, model, npc: 29056, geri: kupon })) },
          { ad: 'Back', kalsin: true, fn: () => ana() },
        ] }) },
        { ad: '[Monster Staff] Exchanging items', kalsin: true, fn: () => yok('Monster Staff') },
        { ad: '[Dragon Box]Exchanging items', kalsin: true, fn: () => yok('Dragon Box') },
        { ad: 'Premium Use & Exchange Voucher', kalsin: true, fn: fisTakas },
        { ad: '[Exchange] Minerva Costumes', kalsin: true, fn: () => yok('Minerva Costume Voucher') },
        { ad: '[Seal Exchange Coupon ]', kalsin: true, fn: () => npcMenuAc({ ad, model, metin: "You can get [Seal Item]. If you have purchased the [Seal Exchange Coupon] from the Power Up Store, you'll be able to receive the item.", secenekler: [
          { ad: 'Confirm', kalsin: true, fn: () => sec('Which voucher shall we exchange? (Gives 1 Sealed Item)', () => cantadan((e) => Number(e.row?.item_num) === 810520000), async (x) => {
            npcMenuKapat(); await konumKaydet();
            try { const d = await rpc('seal_kupon_kir', { p_slot: x.slot }); if (!d.ok) return hata(d.reason); bilgi(`You've received ${d.adet} x ${d.ad}.`, 'seviye'); state.inv?.reload?.(); } catch (er) { hata(er.message); }
          }) },
          { ad: 'Back', kalsin: true, fn: () => ana() },
        ] }) },
      ] });
    };
    const ana = () => (KATE.has(npc) ? kate() : kupon());
    ana();
  }

  // pet penceresi kısayolu (J): gizle / göster
  async function penceregiAc(ac) {
    if (ac !== false) return menuAc();   // (31.10) eski pencere yerine KO pet menüsü
    if (!pet && (ac !== false && (gizli || !win))) { try { const d = await rpc('pet_bilgi', {}); if (d?.pet) { guncelle(d.pet); } else takili = d?.takili || null; } catch {} }
    if (!PW()) { bilgi('You have no Familiar equipped. Equip your Familiar in the shoulder slot (right-click).', 'hata'); return; }
    gizli = ac == null ? !gizli : !ac; if (!win) ciz(); if (win) { win.hidden = gizli; if (!gizli) { win.classList.add('onde'); ciz(); } else ipucu?.remove(); } miniCiz();
  }
  // KO: P → pet menüsü (re_pet_various_frame: Status / Item / Skill), pet doğmuşsa (çağrılı ya da omuz yuvasında)
  const menuApi = {
    veri: () => PW(), esya: ESYA, esyaBilgi, beceriler: BECERI,
    kullan: (slot, it) => kullan(slot, it),
    esyaKoy: async (bag, ps) => { try { const d = await rpc('pet_esya_koy', { p_bag_slot: bag, p_pet_slot: ps ?? null }); if (!d.ok) return hata(d.reason); guncelle(d.pet); state.inv?.reload?.(); } catch (er) { hata(er.message); } },
    esyaAl: async (ps, bag = null) => { try { const d = await rpc('pet_esya_al', { p_pet_slot: ps, p_bag_slot: bag }); if (!d.ok) return hata(d.reason); guncelle(d.pet); state.inv?.reload?.(); } catch (er) { hata(er.message); } },
    onizleme: (g) => { if (!onizleme) onizlemeKur(); onizlemeModel(g); return onizleme.cv; },
  };
  async function menuAc() {
    if (!PW()) { try { const d = await rpc('pet_bilgi', {}); if (d?.pet) guncelle(d.pet); else takili = d?.takili || null; } catch {} }
    if (!PW()) return bilgi('You have no Familiar. Hatch an egg at [Familiar Tamer] Kate and equip it in the shoulder slot.', 'hata');
    const { petMenuAc } = await import('./pet-menu.js'); petMenuAc(menuApi, { hud, state });
  }
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyP' || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const env = state.inv?.items; const omuz = env && Number(env.get?.(5)?.it?.Kind) === 151;
    if (!PW() && !omuz) return;   // pet yoksa P eski işlevinde (parti) kalır
    e.preventDefault(); e.stopImmediatePropagation(); menuAc();
  }, true);
  addEventListener('keydown', (e) => {
    if (e.code !== PET_TUS || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    penceregiAc();
  });
  // envanterle aynı öncelik: hangisine tıklanırsa o öne gelir
  addEventListener('pointerdown', (e) => {
    if (!win) return;
    if (e.target.closest?.('#pet-pencere')) win.classList.add('onde');
    else if (e.target.closest?.('.ko-inv')) win.classList.remove('onde');
  }, true);
  addEventListener('keydown', (e) => { if (win && e.code === 'KeyI' && e.target?.tagName !== 'INPUT') win.classList.remove('onde'); });

  // PvP bölgeleri (Ardream, arenalar, savaş bölgeleri): pet çıkarmak yasak — çağrılı pet otomatik geri gönderilir
  setInterval(() => { if (pet?.cagrili && ben && !olumAni && pvpBolge()) { rpc('pet_gonder', {}).catch(() => {}); bilgi(`PvP zone: ${pet.ad} has been dismissed.`, 'hata'); kaldir(); pet = { ...pet, cagrili: false }; } }, 1000);
  setInterval(() => { if (takili && !pet && state.inv?.items && Number(state.inv.items.get(5)?.it?.Kind) !== 151) { takili = null; ciz(); } }, 1500);
  // pet omuz yuvasından çıkarılırsa geri gönderilir (KO)
  setInterval(() => { if (pet && state.inv?.items && Number(state.inv.items.get(5)?.it?.Kind) !== 151) { rpc('pet_gonder', {}).catch(() => {}); bilgi(`${pet.ad} has been dismissed.`); kaldir(); } }, 1500);

  return {
    menuAc,
    esyaMi, kullan, update, uzak, kutuDustu, npcMenu, npcVarMi: (id) => KATE.has(Number(id)) || KUPON_NPC.has(Number(id)),
    /** öldürmede sunucudan gelen pet bilgisi (_mob_hit → pet) */
    oldurmeBilgisi(p) { if (p && pet && p.id === pet.id) guncelle(p); },
    get pet() { return pet; },
    canli: () => !!(pet?.cagrili && ben && !olumAni),
    modSec, saldirKomut, beceriIste, beceriKalan, BECERI,
    /** pete saldıran mobların hedefi (ölürken / yokken null) */
    konum() { return ben && pet && !olumAni && pet.cagrili ? ben.pos : null; },
    /** mob_pet_strike sonucu: can, darbe animasyonu, otomatik iksir, ölüm */
    hasarAl(n, d) {
      if (!d?.pet || !pet || olumAni) return;
      if (d.iksir > 0) bilgi(`${pet.ad} drank an HP potion (+${d.iksir} HP).`, 'noah');
      if (d.pet.olu) {
        pet = { ...pet, ...d.pet, cagrili: true }; olumAni = performance.now(); ciz();
        state.combat?.petOldu?.(); gorev = null;
        ben?.model?.playOnce?.('dead', { hold: true });
        bilgi(`${pet.ad} has died. You can summon it again with Familiar Summon.`, 'hata');
        state.net?.setPet?.(null);
        setTimeout(() => { if (olumAni) { pet = { ...pet, cagrili: false }; kaldir(); state.inv?.reload?.(); } }, 2600);
        return;
      }
      if (d.back > 0 && ben?.model?.playOnce?.('struck', { speed: 1 })) ben.atk = performance.now() + 450;
      guncelle(d.pet);
    },
    gonder, pencere: penceregiAc,
  };
}
