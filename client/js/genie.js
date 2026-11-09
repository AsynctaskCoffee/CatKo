// KO Genie (otomatik av yardımcısı, re_genie + re_genie_sub). Sağ üstteki Genie çubuğu: başlat / durdur / ayarlar.
// Sekmeler: Açıklama · Saldırı (otomatik saldırı, 4 saldırı + 4 iyileşme yeteneği, iyileşme oranı, saldırı / etkinlik menzili)
// · İyileşme (HP / MP iksiri ve pet yuvası, oranları) · Destek (12 güçlendirme yuvası, parti işaretleri) · Diğer (durma koşulları).
// Yetenekler Yetenekler penceresinden, iksirler çantadan sürüklenip yuvalara bırakılır; sağ tık yuvayı boşaltır. Ayarlar karakter başına tarayıcıda saklanır.
// Çalışırken: başlangıç noktası (etkinlik merkezi) çevresinde en yakın canavarı seçer, saldırır, yetenekleri sırayla kullanır,
// can / mana düşünce iksir içer, güçlendirmeleri yeniler (KO'daki gibi eşya toplamaz). Elle yürüyünce birkaç saniye bekler.
import * as THREE from '../vendor/three.module.min.js';
import { hasLayout, buildLayout, draggable } from './kui.js';
import { yetenekVerisi, loadYetenekler } from './yetenek.js';
import { iconHtml, fromDb, hakli } from './esya.js';
import { fxEkle } from './fx.js';

const VARSAYILAN = {
  saldiri: true, iyiles: true, iyilesOran: 50, saldiriMenzil: 20, alanMenzil: 60,
  hpAcik: true, hpOran: 50, mpAcik: true, mpOran: 60, petAcik: false, petOran: 50,
  destek: true, duz: true, slot: {}, parti: {}, etc: { 1: false, 2: false, 3: true, 4: false, 5: true, 6: true, 7: true, 8: true, 9: true }, hpAdet: 10, mpAdet: 10,
  // orijinal KO (KnightOnlineEn re_genie) "Other" sekmesi: 11 seçenek; Attack: Combo, Hide attack range; Support: Auto Curse Removal, dönüşüm
  o: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: true, 9: false, 10: false, 11: false },
  combo: false, menzilGizle: false, basaDon: false, lanet: false, donusumAcik: false, donusumNum: null,
};
const KAYDIRAC = {   // id → [ayar, en az, en çok, adım, yazı, birim]
  scr_autorecovery_rate: ['iyilesOran', 10, 90, 5, 'Attack_autorecovery_str', '%'],
  scr_att_range: ['saldiriMenzil', 5, 50, 1, 'Attack_range_str', 'm'],
  scr_act_range: ['alanMenzil', 0, 150, 5, 'Attack_actrange_str', 'm'],
  scr_hp_recovery_rate: ['hpOran', 10, 90, 5, 'RecoveryHp_str', '%'],
  scr_mp_recovery_rate: ['mpOran', 10, 90, 5, 'RecoveryMp_str', '%'],
  scr_pet_recovery_rate: ['petOran', 10, 90, 5, 'RecoveryPet_str', '%'],
};
const donusumEsyasi = (it) => [379090000, 379093000, 381001000].includes(Number(it?.Num)) || /transform/i.test(it?.strName || '');
const LISTE_DONUSUM = new Set([379090000, 379093000, 381001000]);   // kullanınca canavar listesi açan totem / parşömen
const ACMA = { btn_auto_attack: 'saldiri', btn_auto_recovery: 'iyiles', btn_hp_recovery: 'hpAcik', btn_mp_recovery: 'mpAcik', btn_pet_recovery: 'petAcik', btn_assist: 'destek' };
const ETC = {   // orijinal KO "Set Others" (KnightOnlineEn)
  1: 'When the HP recovery item falls below the set value, return to the village', 2: 'When the  MP recovery item falls below the set value, return to the village',
  3: "When there's not enough arrows you will be returned to town. (only for Rogues)", 4: 'When the party breaks up you will be returned to town.',
  5: "When you are the only survivor of the party, you'll be moved to town.", 6: "When the weapon durability is 0 you'll be moved to town.",
  7: 'With the genie hammer, you will be able to repair weapons and armor with the durability of 100',
  8: 'When Knight Genie point is 1, automatically use the Genie Spirit. (When Genie Spirit is present)',
  9: "Automatically feed when Familiar's hunger level is 5", 10: 'When Dark Knight Mace is equipped, HP Recovery skill will be casted on yourself.',
  11: 'Automatically send a party invitation to players who whisper (PM) you this message:',   // (8.11) eski 11 (zırh onarımı) 7 ile birleşti
};
const ACIKLAMA = `Knight Genie is an automatic helper that hunts for you. Start it (▶) and stop it (■) from the Genie bar at the top right; the gear button opens this window.

The place where you start Genie becomes the center of activity: Genie finds the nearest monster around this point (Activity range), attacks it and moves on to the next one after killing it. If the activity range is 0 m, your character does not move at all and only attacks monsters within reach.

Genie time: Spirit of Genie is a 10-use pack; each use gives 2 hours of Genie time. Time is only spent while Genie is running. If you have no time left when you press Start, a Spirit of Genie in your inventory is used automatically. Right-click a Voucher of Genie to exchange it for a Spirit of Genie. Genie Hammer (right-click) restores the durability of all equipped items.

• Attack: Turns automatic attack on / off. Drag attack skills from the Skills window to the top row (1-4) and self-healing skills to the bottom row (5-8). When your HP drops below the "Recovery rate", the bottom-row skills are used. For mages, if there is a spell in the attack row the character does not run to the monster; spells are cast from range (area spells can also be placed in the top row).
• Recover: Drag HP and MP potions from your inventory to the slots. A potion is used when HP / MP drops below the set rate. You can put a pet potion in the pet slot.
• Support: Drag buff skills (12 slots); Genie recasts them when they wear off.
• Other: Return to town when potions drop below the set amount, when arrows run out (Rogue), when the party breaks up / you are the only survivor, or when weapon durability is 0; repair weapons / armor with the Genie Hammer (durability 100); automatic Genie Spirit in the last minute of Genie time; automatic feeding when the Familiar's hunger is 5; healing skill while a Dark Knight Mace is equipped.
• Attack: Combo (basic attacks and skills back to back), Hide attack range (hides the range circle). Support: Auto Curse Removal (Cure Curse), transformation item.

Right-click a slot to clear it. If you move manually, Genie waits for a few seconds. Genie turns off automatically when you die.`;

// KO 3B Genie yazısı (genie_alllll.fxb): genie_a01 (kenarlar) + genie_a02 (yüz) birlikte, yalnız ön yüzler (arka yüz ters yazı olarak
// görünmesin); başın 3,35 m üstünde kendi ekseninde yavaşça döner, yıldız parçacıkları çevresinde. Kendi karakterimiz ve uzak oyuncular için ortak.
let genieFxP = null;
export const genieFxHazir = () => (genieFxP ||= fxEkle('./assets/fxgenie').then(() => true, () => { genieFxP = null; return false; }));
export function genieFx(fxm, konum) {
  const v = new THREE.Vector3(), t0 = performance.now(), Y = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  const b = fxm.play('genie_alllll.fxb', { loop: true,
    follow: () => { const p = konum(); return p ? v.set(p.x, p.y + 3.35, p.z) : null; },
    yon: () => q.setFromAxisAngle(Y, ((performance.now() - t0) / 1000) * 0.6) });
  // yalnız 3B yazı modelleri (genie_a01/a02) tek yüzlü; pembe halka / yıldız parçacıkları ve başlangıç ışığı çift yüzlü kalır (yoksa hiç görünmezler)
  for (const p of b?.parts || []) if (p.shape) p.obj.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material || [])) { m.side = THREE.FrontSide; m.needsUpdate = true; } });
  return b;
}

export function initGenie({ sb, character, state, hud, world = null }) {
  const KEY = 'ko-genie-' + character.id;
  const V = structuredClone(VARSAYILAN);
  try { const k = JSON.parse(localStorage.getItem(KEY) || '{}'); Object.assign(V, k, { etc: { ...VARSAYILAN.etc, ...(k.etc || {}) }, o: { ...VARSAYILAN.o, ...(k.o || {}) } });
    if (!k.o && k.etc) { V.o[1] = !!k.etc[1]; V.o[2] = !!k.etc[2]; V.o[8] = k.etc[3] !== false; V.o[7] = V.o[11] = k.etc[8] !== false; V.basaDon = k.etc[6] !== false; } } catch {}
  const kaydet = () => { try { localStorage.setItem(KEY, JSON.stringify(V)); } catch {} };
  // (8.11) Other 11: Genie çalışırken bana özel mesajla (PM) ayarlanan mesajı yazan oyuncuya otomatik parti daveti (aynı oyuncuya en çok 15 sn'de bir)
  const ptSon = new Map();
  addEventListener('ko-pm-gelen', (e) => {   // (8.11) yalnız özel mesaj (PM) — genel sohbetteki yazı davet göndermez
    const { id, ad, metin } = e.detail || {}; const m = String(V.ptMesaj || '').trim().toLowerCase();
    if (!acik || !V.o[11] || !m || !id || String(id) === String(character.id)) return;
    if (String(metin || '').trim().toLowerCase() !== m) return;
    const t = performance.now(); if (t - (ptSon.get(String(id)) || 0) < 15000) return; ptSon.set(String(id), t);
    if (state.parti?.davetEt) { state.parti.davetEt(id, ad); mesaj(`Party invitation sent to ${ad}.`); }
  });
  if (V.ptSurum !== 1) { V.o[7] = !!(V.o[7] || V.o[11]); V.o[11] = false; V.ptSurum = 1; kaydet(); }   // (8.11) 11 artık otomatik parti daveti (zırh onarımı 7'ye katıldı)
  loadYetenekler().catch(() => {});

  const KAY = { ...KAYDIRAC }, TIK = [];   // kaydıraçlar (orijinal yerleşimde bazıları onay kutusu) / onay kutuları
  let L = null, SUB = null, sekme = 'explain', acik = false, merkez = null, bekleT = 0;
  const IT = new Map();   // eşya numarası → eşya kaydı (ikon)
  const yet = (id) => yetenekVerisi()?.yetenekler?.[id] || null;
  const ikonCss = (s, px) => {
    const A = yetenekVerisi()?.atlas; if (!A) return '';
    const i = s.ikon < 0 ? 0 : s.ikon, k = px / A.boyut;
    return `background:url(./assets/yetenek/${A.dosya}) ${-(i % A.kolon) * px}px ${-Math.floor(i / A.kolon) * px}px / ${A.kolon * A.boyut * k}px auto no-repeat`;
  };
  const mesaj = (t, tur = 'beceri') => hud.info?.('[Genie] ' + t, tur);

  // ---------------- pencere
  // (8.11) yuva alanı kendi sekmesinden alınır: orijinal KO yerleşiminde (orj) Attack sekmesinde 9-16 numaralı ikinci bir yuva katmanı var,
  //   iksir yuvaları Recover'da 17-19, destek yuvaları Support'ta 21-32 → iksir (9-11) Attack'taki 1-3'ün üstüne çiziliyor, sol altta "0" görünüyordu
  const alan = (n) => {
    if (!L) return null; const t = yuvaTuru(Number(n)), sek = t === 'saldiri' || t === 'iyiles' ? 'attack' : t === 'destek' ? 'assist' : 'recovery';
    for (const id of [n, Number(n) + 8]) { const e = L.all(String(id)).find((x) => x.classList.contains('kui-ar') && x.closest(`[data-id="${sek}"]`)); if (e) return e; }
    return L.all(String(n)).find((e) => e.classList.contains('kui-ar') && !e.closest('[data-id="attack"]')) || null;
  };
  function yuvaCiz(n) {
    const e = alan(n); if (!e) return;
    let v = V.slot[n]; e.innerHTML = ''; e.title = ''; e.classList.remove('bos-esya');
    // (5.11) yuva türü dışı kayıt (eski sürümden kalan: saldırı / iyileşme / destek yuvasında iksir, iksir yuvasında yetenek) temizlenir
    if (v != null && String(v).startsWith('e:') !== ['iksir', 'pet'].includes(yuvaTuru(Number(n)))) { delete V.slot[n]; kaydet(); v = null; }
    e.classList.toggle('gn-dolu', v != null);
    if (v == null) return;
    if (typeof v === 'string' && v.startsWith('e:')) {
      const num = Number(v.slice(2)), it = IT.get(num) || esyaIt(num);
      if (it) { const n = iksirSay(num); e.innerHTML = iconHtml(it, 32) + `<b class="ks-adet gn-adet">${n}</b>`; e.classList.toggle('bos-esya', !n); e.title = `${it.strName} · ${n} left`; }
      else { e.textContent = '?'; esyaYukle([num]); }
      return;
    }
    const s = yet(v); if (!s) return;
    const i = document.createElement('i'); i.style.cssText = `position:absolute;inset:0;${ikonCss(s, 32)}`; e.append(i); e.title = s.ad;
  }
  const esyaIt = (num) => { for (const [, x] of state.inv?.items || []) if (Number(x.row.item_num) === num) { IT.set(num, x.it); return x.it; } return null; };
  async function esyaYukle(nums) {
    const eksik = nums.filter((n) => !IT.has(n)); if (!eksik.length) return;
    const { data } = await sb.from('items').select('*').in('num', eksik);
    for (const r of data || []) IT.set(r.num, fromDb(r));
    for (const k of Object.keys(V.slot)) yuvaCiz(k);
  }
  const hepsiniCiz = () => { for (let n = 1; n <= 24; n++) yuvaCiz(n); };

  function dugmeCiz() {
    if (!L) return;
    for (const [b, k] of Object.entries(ACMA)) {
      L.get(b + '_on')?.classList.toggle('gn-on', !!V[k]); L.get(b + '_off')?.classList.toggle('gn-on', !V[k]);
    }
    for (let i = 1; i <= 11; i++) L.get('btn_etc_' + i)?.classList.toggle('gn-tik', !!V.o[i]);   // KO: işaretli kutu = basılı durum görüntüsü (tik)
    for (let i = 1; i <= 12; i++) L.get('btn_party_' + i)?.classList.toggle('gn-tik', !!V.parti[i]);
    for (const t of ['explan', 'attack', 'recovery', 'assist', 'etc']) L.get('btn_' + t)?.classList.toggle('secili', (t === 'explan' ? 'explain' : t) === sekme);
    for (const b of ['explain', 'attack', 'recovery', 'assist', 'etc']) L.show(b, b === sekme);
    for (const id of Object.keys(KAY)) kaydiracCiz(id);
    for (const [b, al] of TIK) b.classList.toggle('gn-tik', !!al());
  }
  function kaydiracCiz(id) {
    const [k, a, b, , yazi, birim] = KAYDIRAC[id]; const sc = L.get(id); if (!sc) return;
    const tr = sc.querySelector(':scope > .kui-tr'), th = tr?.children[1];
    if (th) th.style.left = Math.round((V[k] - a) / (b - a) * (tr.clientWidth - th.clientWidth)) + 'px';
    L.text(yazi, V[k] + birim);
  }
  function kaydiracBagla(id) {
    const [k, a, b, adim] = KAYDIRAC[id]; const sc = L.get(id); if (!sc) return;
    const ayarla = (v) => { V[k] = Math.max(a, Math.min(b, Math.round(v / adim) * adim)); kaydet(); kaydiracCiz(id); if (k === 'saldiriMenzil') onizleBit = performance.now() + 3000; };   // (5.11) menzil değişince halka 3 sn önizlenir
    const [sol, sag] = sc.querySelectorAll(':scope > .kui-btn');
    if (sol) { sol.classList.add('kui-tik'); sol.onclick = (e) => { e.stopPropagation(); ayarla(V[k] - adim); }; }
    if (sag) { sag.classList.add('kui-tik'); sag.onclick = (e) => { e.stopPropagation(); ayarla(V[k] + adim); }; }
    const tr = sc.querySelector(':scope > .kui-tr'); if (!tr) return;
    tr.style.pointerEvents = 'auto'; tr.style.cursor = 'pointer';
    const git = (ev) => { const r = tr.getBoundingClientRect(); ayarla(a + Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (b - a)); };
    tr.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); tr.setPointerCapture(ev.pointerId); git(ev); tr.onpointermove = git; });
    tr.addEventListener('pointerup', () => (tr.onpointermove = null));
  }
  const yuvaTuru = (n) => (n <= 4 ? 'saldiri' : n <= 8 ? 'iyiles' : n === 9 || n === 11 ? 'iksir' : n === 10 ? 'pet' : 'destek');
  function yetenekKoy(n, id) {
    const s = yet(id); if (!s) return;
    const tur = yuvaTuru(n);
    if (tur === 'iksir' || tur === 'pet') return hud.notice?.('You must drag a potion from your inventory to this slot.', 'hata');
    const dusman = [1, 2, 3].includes(s.tip1) && ![1, 2, 3, 4, 6, 11].includes(Number(s.hedef));   // hedef 10: düşmana alan büyüsü (Inferno, Supernova, Fire burst…) — saldırı sırasına konur
    if (tur === 'saldiri' && !dusman) return hud.notice?.('Only attack skills can be placed in the top row.', 'hata');
    if (tur !== 'saldiri' && dusman) return hud.notice?.('Attack skills cannot be placed in this row; drag a healing / buff skill.', 'hata');
    V.slot[n] = id; kaydet(); yuvaCiz(n);
  }
  // Kaishan yetenek sıfırlama: Genie'ye konan tüm yetenekler (saldırı 1-4, iyileşme 5-8, destek 13-24) kaldırılır; iksir / pet yuvaları kalır
  addEventListener('ko-yetenek-sifirlandi', () => {
    let n0 = 0;
    for (const k of Object.keys(V.slot || {})) { const n = Number(k); if (V.slot[k] != null && !['iksir', 'pet'].includes(yuvaTuru(n))) { delete V.slot[k]; n0++; yuvaCiz(n); } }
    if (n0) { kaydet(); hud.info?.('The skills registered in Genie have also been removed.', 'beceri'); }
  });
  function kur() {
    if (L || !hasLayout('re_genie')) return L;
    L = buildLayout('re_genie', { className: 'ko-genie ko-pencere' });
    L.el.hidden = true;
    (document.getElementById('kohud') || document.body).append(L.el);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    draggable(L, 9999, { tam: true });   // pencerenin boş her yerinden sürüklenir (düğme / giriş / yuva / kaydıraç hariç)
    // yazılar
    // orijinal KO (EN) yazıları — ekran görüntüleriyle birebir
    const T = {
      str_genie_name: 'Knight Genie', str_explain_title: 'Knight Genie', str_att_mode: 'Attack mode', str_rc_mode: 'Recovery mode',
      str_add_skill: 'Skills register', str_skill_rate: 'Use recovery skill at %', str_att_range: 'Attack range', str_act_range: 'Range of activities',
      str_hp_recovery: 'HP recovery', str_hp_rate: 'Use HP recovery item at %', str_mp_recovery: 'MP recovery', str_mp_rate: 'Use MP recovery item at %',
      str_pet_recovery: 'Familiar recovery', str_pet_rate: "Use Familiar's recovery item at %",
      str_hp: '', str_mp: '', str_pet: '', 8: '', 9: '', 10: '', str_ass_use_set: 'Set the automatic use of 2nd skill', str_party_set: 'Set skills to be applied',
      str_etc_title: 'Set Others', str_etc_war: '',
    };
    for (const [id, t] of Object.entries(T)) for (const e of L.all(String(id))) if (e.classList.contains('kui-tx')) e.textContent = t;
    for (let i = 1; i <= 12; i++) L.text('str_' + String(i).padStart(2, '0'), 'Party');
    L.el.querySelectorAll('.kui-tx').forEach((e) => { if (e.textContent.trim() === 'Recovery') e.textContent = 'Recover'; });
    for (let i = 1; i <= 11; i++) { const e = L.get('str_etc_' + String(i).padStart(2, '0')); if (e) { e.textContent = ETC[i]; e.classList.add('gn-etc'); } }
    // (8.11) 11: otomatik parti daveti — sohbette bu mesajı yazan oyuncuya davet; satır sonunda siyah metin kutusu (HP / MP adet kutularıyla aynı tema)
    { const t11 = L.get('str_etc_11'), b11 = L.get('btn_etc_11');
      if (t11 && b11) { t11.style.width = '221px';
        for (const e of [b11, t11]) e.style.top = (parseFloat(e.style.top) + 14) + 'px';   // (8.11) 10. maddeyle arasında boşluk (iki satırlık yazı tam okunur)
        t11.style.height = '34px'; t11.style.top = (parseFloat(t11.style.top) - 3) + 'px';
        const kutu = document.createElement('div'); kutu.className = 'kui gn-pt-kutu';
        kutu.style.cssText = `left:301px;top:${parseFloat(b11.style.top) + 5}px;width:57px;height:24px`;
        const inp = document.createElement('input'); inp.className = 'kui-input gn-pt-mesaj'; inp.maxLength = 30; inp.value = V.ptMesaj || ''; inp.placeholder = 'party'; inp.title = 'Message that triggers the party invitation';
        inp.onchange = inp.oninput = () => { V.ptMesaj = inp.value.slice(0, 30); kaydet(); };
        for (const ev of ['keydown', 'keyup', 'keypress']) inp.addEventListener(ev, (e) => e.stopPropagation());
        inp.addEventListener('pointerdown', (e) => e.stopPropagation()); inp.onclick = (e) => e.stopPropagation();
        kutu.append(inp); b11.parentElement.append(kutu); } }
    // (8.11) Other sekmesi kaydırma: satırlar 137–512 px penceresinde kayar (fare tekeri, ok düğmeleri, kaydırma çubuğu)
    { const etc = L.get('etc'), sc = L.get('scr_etc_height');
      if (etc && sc) {
        const UST = 140, ALT = 512;
        const ogeler = [...etc.children].filter((c) => c !== sc && parseFloat(c.style.top) >= UST - 1);
        for (const c of ogeler) c.dataset.y0 = parseFloat(c.style.top);
        const icerik = Math.max(...ogeler.map((c) => Number(c.dataset.y0) + parseFloat(c.style.height || 0)));
        const enFazla = Math.max(0, icerik - ALT + 6);
        const [yuk, asa] = sc.querySelectorAll(':scope > .kui-btn'), tr = sc.querySelector(':scope > .kui-tr'), tut = tr?.querySelector(':scope > .st1, :scope > .kui-img:nth-child(2)');
        let ofs = 0;
        const ciz = () => {
          for (const c of ogeler) { const y = Number(c.dataset.y0) - ofs, h = parseFloat(c.style.height || 0); c.style.top = y + 'px';
            const ust = Math.max(0, UST - y), alt = Math.max(0, y + h - ALT); c.style.clipPath = ust || alt ? `inset(${ust}px 0 ${alt}px 0)` : ''; c.style.visibility = ust >= h || alt >= h ? 'hidden' : ''; }
          if (tut && tr) { const th = parseFloat(tr.style.height) || 335, bh = parseFloat(tut.style.height) || 25; tut.style.top = ((enFazla ? ofs / enFazla : 0) * (th - bh)) + 'px'; }
        };
        const kay = (d) => { ofs = Math.max(0, Math.min(enFazla, ofs + d)); ciz(); };
        etc.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); kay(Math.sign(e.deltaY) * 35); }, { passive: false });
        if (yuk) { yuk.classList.add('kui-tik'); yuk.style.pointerEvents = 'auto'; yuk.onclick = (e) => { e.stopPropagation(); kay(-35); }; }
        if (asa) { asa.classList.add('kui-tik'); asa.style.pointerEvents = 'auto'; asa.onclick = (e) => { e.stopPropagation(); kay(35); }; }
        if (tr) { tr.style.pointerEvents = 'auto'; tr.style.cursor = 'pointer';
          const git = (ev) => { const r = tr.getBoundingClientRect(); ofs = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)) * enFazla; ciz(); };
          tr.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); tr.setPointerCapture(ev.pointerId); git(ev); tr.onpointermove = git; });
          tr.addEventListener('pointerup', () => (tr.onpointermove = null)); }
        ciz(); } }
    for (const [ed, k] of [['edit_hp_count', 'hpAdet'], ['edit_mp_count', 'mpAdet']]) {
      const inp = L.input(ed, { type: 'number', min: 0, max: 9999, value: V[k] });
      if (inp) { inp.onchange = () => { V[k] = Math.max(0, Number(inp.value) || 0); inp.value = V[k]; kaydet(); }; inp.onkeydown = (ev) => ev.stopPropagation(); inp.onclick = (ev) => ev.stopPropagation(); }
    }
    // açıklama: kaydırılabilir metin
    const ex = L.get('str_explain'); if (ex) { ex.textContent = ACIKLAMA; ex.classList.add('gn-metin'); }
    L.show('scr_act_height', false);
    // düğmeler
    L.click('btn_close', () => kapat());
    // Attack sekmesi kompakt: "Range of activities" ve kaydıracı pencerenin alt çerçevesine sığmıyordu → 110 px altındaki tüm öğeler
    // dikeyde %92 oranında sıkıştırılıp 6 px yukarı alınır (bölüm başlıkları, yuvalar, kaydıraçlar aynı düzende kalır)
    { const at = L.get('attack');
      if (at && !at.dataset.sikisti) { at.dataset.sikisti = '1';
        for (const c of at.children) { const t = parseFloat(c.style.top); if (!(t >= 105)) continue; c.style.top = Math.round(104 + (t - 110) * 0.92) + 'px'; }
        // "Range of activities" altındaki onay kutuları (Hunting in place, Hide attack range, başlangıca dön) başlık şeridinin altına iner
        for (const id of ['scr_act_range', 'Attack_actrange_str', 'btn_hide_attack_range', 'str_hide_attack_range', 'btn_no_enemy_stay_in_place', 'str_no_enemy_stay_in_place']) {
          for (const e of at.querySelectorAll(`:scope > [data-id="${id}"]`)) { const t = parseFloat(e.style.top); if (t > 400) e.style.top = (t + 12) + 'px'; } } } }
    for (const [t, s] of [['explan', 'explain'], ['attack', 'attack'], ['recovery', 'recovery'], ['assist', 'assist'], ['etc', 'etc']]) L.click('btn_' + t, () => { sekme = s; dugmeCiz(); });
    for (const [b, k] of Object.entries(ACMA)) { L.click(b + '_on', () => { V[k] = true; kaydet(); dugmeCiz(); }); L.click(b + '_off', () => { V[k] = false; kaydet(); dugmeCiz(); }); }
    for (let i = 1; i <= 11; i++) L.click('btn_etc_' + i, () => { V.o[i] = !V.o[i]; kaydet(); dugmeCiz(); });
    for (let i = 1; i <= 12; i++) L.click('btn_party_' + i, () => { V.parti[i] = !V.parti[i]; kaydet(); dugmeCiz(); });
    L.click('btn_attack_style', () => {}); L.click('btn_recovery_style', () => {});
    // orijinal KO onay kutuları: Attack (Basic Attack Off, Combo, Hunting in place, Hide attack range, no monsters → start), Support (Auto Curse Removal, dönüşüm)
    const tikBag = (id, yaziId, yazi, al, ver) => { const b = L.get(id); if (!b) return; b.classList.add('kui-tik', 'gn-kutu'); b.style.pointerEvents = 'auto';
      if (yaziId) L.text(yaziId, yazi); b.onclick = (ev) => { ev.stopPropagation(); ver(!al()); kaydet(); dugmeCiz(); }; TIK.push([b, al]); };
    if (L.get('scr_act_range')?.classList.contains('kui-btn')) {
      delete KAY.scr_act_range;
      tikBag('scr_act_range', 'Attack_actrange_str', 'Hunting in place', () => V.alanMenzil === 0, (v) => { if (v) { V.alanEski = V.alanMenzil || 60; V.alanMenzil = 0; } else V.alanMenzil = V.alanEski || 60; });
    }
    tikBag('btn_not_attack', 'str_not_attack', 'Basic Attack Off', () => V.duz === false, (v) => { V.duz = !v; });
    tikBag('btn_rapid_hit', 'str_rapid_hit', 'Combo', () => !!V.combo, (v) => { V.combo = v; });
    tikBag('btn_hide_attack_range', 'str_hide_attack_range', 'Hide attack range', () => !!V.menzilGizle, (v) => { V.menzilGizle = v; });
    tikBag('btn_no_enemy_stay_in_place', 'str_no_enemy_stay_in_place', 'When no monsters are in the attack range, move to Genie starting location.', () => !!V.basaDon, (v) => { V.basaDon = v; });
    tikBag('btn_removecurse_onoff', 'str_removecurse_onoff', 'Auto Curse Removal', () => !!V.lanet, (v) => { V.lanet = v; });
    tikBag('btn_transform_onoff', null, null, () => !!V.donusumAcik, (v) => { V.donusumAcik = v; if (v && !V.donusumNum) mesaj('Select a transformation item from the list.'); });
    // dönüşüm listesi (çantadaki dönüşüm parşömenleri / totemleri): ok düğmesi listeyi açar; seçilen eşya Genie çalışırken dönüşüm yokken kullanılır
    { const lb = L.get('list_transform'), grp = L.get('grp_transform_list'); L.show('grp_transform_list', false);
      const adYaz = () => L.text('str_transform', V.donusumNum ? (IT.get(V.donusumNum)?.strName || esyaIt(V.donusumNum)?.strName || 'Transformation') : '');
      const listeCiz = () => {
        if (!lb) return; lb.innerHTML = ''; lb.classList.add('gn-dn-liste');
        const gor = new Set(), satir = [];
        for (const [sl, x] of state.inv?.items || []) { const n = Number(x.row.item_num); if (sl < 14 || sl > 41 || gor.has(n) || !donusumEsyasi(x.it)) continue; gor.add(n); IT.set(n, x.it); satir.push([n, x.it.strName]); }
        if (!satir.length) { const d = document.createElement('div'); d.className = 'gn-dn-bos'; d.textContent = 'No transformation item in your inventory'; lb.append(d); }
        for (const [n, ad] of satir) { const d = document.createElement('div'); d.className = 'gn-dn-satir' + (n === V.donusumNum ? ' secili' : ''); d.textContent = ad;
          d.onclick = (ev) => { ev.stopPropagation(); V.donusumNum = n; kaydet(); adYaz(); L.show('grp_transform_list', false); }; lb.append(d); }
      };
      L.click('btn_transform_list', () => { const ac = !grp || grp.hidden; if (ac) listeCiz(); L.show('grp_transform_list', ac); });
      adYaz(); }
    L.get('btn_attack_style')?.classList.add('gn-on'); L.get('btn_recovery_style')?.classList.add('gn-on');
    for (const id of Object.keys(KAY)) kaydiracBagla(id);
    // yuvalar
    for (let n = 1; n <= 24; n++) {
      const e = alan(n); if (!e) continue;
      e.classList.add('gn-yuva'); e.dataset.gn = n;
      if (n === 9 || n === 10 || n === 11) e.dataset.esyaBirak = '1';
      e.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); delete V.slot[n]; kaydet(); yuvaCiz(n); });
      // yuvadaki yetenek / iksir tutulup sürüklenir: boşa bırakılırsa yuvadan kalkar, başka yuvaya bırakılırsa oraya taşınır
      e.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0 || V.slot[n] == null) return;
        ev.preventDefault(); ev.stopPropagation();
        const v = V.slot[n], x0 = ev.clientX, y0 = ev.clientY; let hayalet = null;
        const tasi = (m) => {
          if (!hayalet && Math.hypot(m.clientX - x0, m.clientY - y0) < 6) return;
          if (!hayalet) {
            hayalet = document.createElement('div'); hayalet.className = 'gn-hayalet';
            hayalet.style.cssText = 'position:fixed;width:32px;height:32px;pointer-events:none;z-index:99999;opacity:.85;filter:drop-shadow(0 0 6px #000)';
            hayalet.innerHTML = e.innerHTML; document.body.append(hayalet); e.classList.add('gn-tasiniyor');
          }
          hayalet.style.left = m.clientX - 16 + 'px'; hayalet.style.top = m.clientY - 16 + 'px';
        };
        const birak = (m) => {
          removeEventListener('pointermove', tasi, true); removeEventListener('pointerup', birak, true);
          e.classList.remove('gn-tasiniyor');
          if (!hayalet) return; hayalet.remove();
          const h = document.elementsFromPoint(m.clientX, m.clientY).find((q) => q.dataset?.gn);
          const n2 = h ? Number(h.dataset.gn) : null;
          if (n2 === n) return;
          if (n2 == null) { delete V.slot[n]; kaydet(); yuvaCiz(n); mesaj('Slot cleared.'); return; }   // boşa bırakıldı
          const esya = String(v).startsWith('e:'), hedefEsya = ['iksir', 'pet'].includes(yuvaTuru(n2));
          if (esya !== hedefEsya) return hud.notice?.(esya ? 'Potions can only be placed in potion / pet slots.' : 'Skills cannot be placed in this slot.', 'hata');
          if (esya) { V.slot[n2] = v; delete V.slot[n]; kaydet(); yuvaCiz(n); yuvaCiz(n2); return; }
          const once = V.slot[n2]; yetenekKoy(n2, v);
          if (V.slot[n2] === v && once !== v) { delete V.slot[n]; kaydet(); yuvaCiz(n); }
        };
        addEventListener('pointermove', tasi, true); addEventListener('pointerup', birak, true);
      });
      e.addEventListener('ko-esya-birak', (ev) => {
        const d = ev.detail || {};
        if (!(n === 9 || n === 10 || n === 11)) return hud.notice?.('You must drag a skill to this slot.', 'hata');
        if (!state.inv?.kullanilir?.(d.it)) return hud.notice?.('Only usable items (potions) can be placed here.', 'hata');
        IT.set(Number(d.num), d.it); V.slot[n] = 'e:' + d.num; kaydet(); yuvaCiz(n);
      });
    }
    addEventListener('ko-yetenek-birak', (ev) => {
      if (!L || L.el.hidden) return;
      const { id, x, y } = ev.detail || {};
      const e = document.elementsFromPoint(x, y).find((q) => q.dataset?.gn); if (e) yetenekKoy(Number(e.dataset.gn), id);
    });
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && L && !L.el.hidden && e.target.tagName !== 'INPUT') { e.stopImmediatePropagation(); kapat(); } }, true);
    esyaYukle(Object.values(V.slot).filter((v) => String(v).startsWith('e:')).map((v) => Number(String(v).slice(2))));
    return L;
  }
  function ac() {
    if (!kur()) return hud.notice?.('Failed to load the Genie interface.', 'hata');
    if (!L.el.hidden) return kapat();
    L.el.hidden = false;
    if (!L.el.style.left) { L.el.style.left = Math.max(10, (innerWidth - 426) / 2) + 'px'; L.el.style.top = Math.max(10, (innerHeight - 557) / 2) + 'px'; }
    sigdir();
    dugmeCiz(); hepsiniCiz();
  }
  // Genie penceresi her zaman ekranın içinde (açılışta ve pencere boyutu değişince)
  function sigdir() {
    if (!L || L.el.hidden) return; const r = L.el.getBoundingClientRect(), z = r.width / (L.el.offsetWidth || r.width) || 1;
    const x = Math.max(0, Math.min(innerWidth - r.width, r.left)), y = Math.max(0, Math.min(innerHeight - r.height, r.top));
    if (x !== r.left || y !== r.top) { L.el.style.left = x / z + 'px'; L.el.style.top = y / z + 'px'; }
  }
  addEventListener('resize', () => sigdir());
  const kapat = () => { if (L) L.el.hidden = true; };

  // ---------------- sağ üst çubuk (re_genie_sub)
  function cubuk() {
    if (SUB || !hasLayout('re_genie_sub')) return;
    SUB = buildLayout('re_genie_sub', { className: 'ko-genie-sub' });
    document.body.append(SUB.el);
    SUB.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    hedefKur();
    // çubuk her zaman sürüklenebilir (düğmeler dışından tut); konum hatırlanır, çift tıkla sağ üst köşeye döner
    { const K = 'ko-genie-sub-konum', el = SUB.el; let d = null;
      const yer = (x, y) => { const r = el.getBoundingClientRect(); x = Math.max(0, Math.min(innerWidth - r.width, x)); y = Math.max(0, Math.min(innerHeight - r.height, y));   // her zaman tamamen ekranda
        el.style.setProperty('left', x + 'px', 'important'); el.style.setProperty('top', y + 'px', 'important'); el.style.setProperty('right', 'auto', 'important'); el.classList.add('gn-tasindi'); };
      try { const k = JSON.parse(localStorage.getItem(K) || 'null'); if (k) yer(k.x, k.y); } catch {}
      el.style.cursor = 'move'; el.style.pointerEvents = 'auto';
      el.addEventListener('pointerdown', (e) => { if (e.button !== 0 || e.target.closest('.kui-btn')) return; const r = el.getBoundingClientRect(); d = { x: e.clientX - r.left, y: e.clientY - r.top, m: false }; el.setPointerCapture(e.pointerId); e.preventDefault(); });
      el.addEventListener('pointermove', (e) => { if (!d) return; d.m = true; yer(e.clientX - d.x, e.clientY - d.y); });
      el.addEventListener('pointerup', () => { if (d?.m) { const r = el.getBoundingClientRect(); try { localStorage.setItem(K, JSON.stringify({ x: r.left, y: r.top })); } catch {} } d = null; });
      el.addEventListener('dblclick', (e) => { if (e.target.closest('.kui-btn')) return; for (const p of ['left', 'top', 'right']) el.style.removeProperty(p); el.classList.remove('gn-tasindi'); try { localStorage.removeItem(K); } catch {} });
      addEventListener('resize', () => { if (el.classList.contains('gn-tasindi')) { const r = el.getBoundingClientRect(); yer(r.left, r.top); } }); }
    SUB.click('btn_genie_start', () => baslat()); SUB.click('btn_genie_stop', () => durdur('Knight Genie has been stopped.'));
    SUB.click('btn_genie_open', () => ac());
    SUB.get('btn_genie_start').title = 'Start Genie'; SUB.get('btn_genie_stop').title = 'Stop Genie'; SUB.get('btn_genie_open').title = 'Genie settings';
    subCiz();
  }
  // ---- KO hedef süzgeci (re_genie_sub TargetOne / Two / Sam): onay kutusu işaretlenince seçili canavarın adı siyah alana yazılır;
  // işaretli kaldıkça Genie yalnız o adlı canavarlara saldırır. "+" bir satır daha açar, "−" son satırı kapatır.
  const HK = 'ko-genie-hedef-' + character.id, SATIR = ['One', 'Two', 'Sam'];
  let HF = { n: 1, r: [{ ad: '', on: false }, { ad: '', on: false }, { ad: '', on: false }] };
  try { const k = JSON.parse(localStorage.getItem(HK) || 'null'); if (k?.r) HF = k; } catch {}
  const hfKaydet = () => { try { localStorage.setItem(HK, JSON.stringify(HF)); } catch {} };
  const izinliAdlar = () => HF.r.slice(0, HF.n).filter((x) => x.on && x.ad).map((x) => x.ad);
  function hedefKur() {
    SATIR.forEach((S, i) => {
      const kutu = SUB.get(`btn_Target${S}On`);
      if (kutu) { kutu.classList.add('kui-tik'); kutu.onclick = (e) => {
        e.stopPropagation(); const r = HF.r[i];
        if (!r.on) { const t = state.combat?.target, ad = t?.t?.name && !state.combat?.genie?.olu?.(t) ? t.t.name : ''; if (ad) r.ad = ad;
          if (!r.ad) { hud.notice?.('Select a monster first, then tick the box.', 'hata'); return; } r.on = true; }
        else r.on = false;
        hfKaydet(); hedefCiz(); }; kutu.title = 'Attack only this monster'; }
      SUB.click(`btn_Target${S}Add`, () => { HF.n = Math.min(3, HF.n + 1); hfKaydet(); hedefCiz(); });
      SUB.click(`btn_Target${S}Return`, () => { HF.n = Math.max(1, HF.n - 1); HF.r[HF.n].on = false; hfKaydet(); hedefCiz(); });
    });
    hedefCiz();
  }
  function hedefCiz() {
    SATIR.forEach((S, i) => {
      const gor = i < HF.n; SUB.show(`Target${S}`, gor);
      SUB.get(`btn_Target${S}On`)?.classList.toggle('secili', !!HF.r[i].on);
      SUB.text(`str_Name${S}`, HF.r[i].ad || '');
      SUB.show(`btn_Target${S}Add`, gor && i === HF.n - 1 && HF.n < 3);   // son satır: "+"
      SUB.show(`btn_Target${S}Return`, gor && i === HF.n - 2);            // sondan bir önceki: "−" (son satırı kapatır)
    });
    SUB.el.style.setProperty('height', (45 + HF.n * 24) + 'px', 'important');
  }
  function subCiz() {
    if (!SUB) return;
    // orijinal KO: başlat ve durdur düğmeleri aynı yerde üst üste — çalışırken yalnız durdur (■), dururken yalnız başlat (▶) görünür
    SUB.show('btn_genie_start', !acik); SUB.show('btn_genie_stop', acik);
    SUB.progress('progress_sprits', Math.min(1, kalan / 7200)); SUB.text('str_progress', `${Math.ceil(kalan / 60)}min`);
    SUB.el.title = `Genie time: ${sureYazi(kalan)}`;
    SUB.el.classList.toggle('gn-calisiyor', acik);
  }

  // ---------------- çalışma
  const ben = () => state.combat?.genie?.ben?.();
  const uzak = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // ---- Genie süresi (sunucu: characters.genie_kalan sn; yalnız çalışırken düşer)
  const SPIRIT = [810305000, 810306000, 810378000, 900772000], KUPON = [700091000, 700092000, 700093000, 700094000, 700095000, 700191000, 900560000], HAMMER = [810227000, 810935000, 900819000];
  let kalan = 0;
  const sureYazi = (sn) => { const h = Math.floor(sn / 3600), m = Math.floor((sn % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); return null; } return data; };
  const sureTik = async (cal) => { const d = await rpc('genie_tik', { p_calisiyor: cal }); if (d?.ok) { kalan = d.kalan; subCiz(); } return d; };
  const esyaSlot = (nums) => { for (const [sl, x] of state.inv?.items || []) if (sl >= 14 && sl <= 41 && nums.includes(Number(x.row.item_num))) return sl; return null; };
  async function spiritKullan(slot) {
    const d = await rpc('genie_spirit', { p_slot: slot }); if (!d?.ok) { if (d) hud.notice?.(d.reason, 'hata'); return false; }
    kalan = d.kalan; subCiz(); await state.inv?.reload?.();
    hud.info?.(`Spirit of Genie used: Genie time ${sureYazi(kalan)} (${d.hak} uses left in the pack).`, 'beceri');
    return true;
  }
  async function hammerKullan(slot, sessiz = false) {
    const d = await rpc('genie_hammer', { p_slot: slot }); if (!d?.ok) { if (d && !sessiz) hud.notice?.(d.reason, 'hata'); return false; }
    await state.inv?.reload?.(); state.inv?.stats?.();
    hud.info?.(`Genie Hammer: durability of ${d.adet} item(s) has recovered (${d.hak} uses left).`, 'beceri');
    return true;
  }
  // dinlenmeden kazanılan Genie süresi (dinlen.js)
  addEventListener('ko-genie-sure', (ev) => { if (ev.detail?.kalan != null) { kalan = Number(ev.detail.kalan); subCiz(); } });
  // çantada sağ tık (envanter.js 'ko-genie-esya')
  addEventListener('ko-genie-esya', async (ev) => {
    const { slot, num } = ev.detail || {};
    if (KUPON.includes(num)) { const d = await rpc('genie_kupon', { p_slot: slot }); if (d?.ok) { await state.inv?.reload?.(); hud.info?.('Genie voucher exchanged: Spirit of Genie (10 uses, 2 hours each) has been added to your inventory.', 'esya'); } else if (d) hud.notice?.(d.reason, 'hata'); return; }
    if (SPIRIT.includes(num)) return void spiritKullan(slot);
    if (HAMMER.includes(num)) return void hammerKullan(slot);
  });
  sureTik(false).catch(() => {});

  // ---- Genie efekti (KO genie_alllll.fxb): çalışırken karakterin üstünde döner (diğer oyuncular da görür: presence "gn")
  let fxB = null, fxNo = 0, fxBekle = false;
  async function efekt(on) {
    const no = ++fxNo;
    if (fxB) { fxB.stop?.(); fxB.dispose?.(); fxB = null; }
    state.net?.setGenie?.(on);
    if (!on) { fxBekle = false; return; }
    // efekt motoru / kütüphane henüz hazır değilse (oyuna giriş, bölge yükleniyor) hazır olana kadar bekle
    fxBekle = true;
    for (let i = 0; i < 120 && acik && no === fxNo && !(state.fx && (await genieFxHazir()) && state.fx.var('genie_alllll.fxb')); i++) await new Promise((r) => setTimeout(r, 500));
    if (no === fxNo) fxBekle = false;
    if (!acik || no !== fxNo || !state.fx) return;
    fxB = genieFx(state.fx, () => ben());
  }
  // kendi efektimiz kaybolduysa (sahne / efekt temizliği, ölüm-diriliş, dönüşüm) yeniden kurulur
  setInterval(() => { if (acik && !fxBekle && (!fxB || fxB.dead) && state.fx) efekt(true); }, 2000);

  async function baslat() {
    const p = ben(); if (!p || !state.combat?.genie) return hud.notice?.('Knight Genie cannot be started right now.', 'hata');
    if (acik) return;
    if (state.combat.genie.oldum()) return hud.notice?.('Knight Genie cannot be started while you are dead.', 'hata');
    if (state.arena?.icinde?.()) return hud.notice?.('Knight Genie cannot be used in the arena.', 'hata');
    if (state.maden) return hud.notice?.('Knight Genie cannot be started while mining. Stop mining first.', 'hata');
    await sureTik(false);
    if (kalan <= 0) {
      const sl = esyaSlot(SPIRIT);
      if (sl == null) return hud.notice?.('Not enough Knight Genie time. Put a Spirit of Genie in your inventory (right-click a Voucher of Genie to exchange it).', 'hata');
      // (7.11) KO: çantada Spirit of Genie var ama kullanılmamış → başlatmadan önce onay sorulur (Confirm: iksir kullanılır ve Genie başlar)
      const metin = "Not enough Knight Genie Point. Would you like to use\n' Genie Spirit Potion?";
      const ok = hud.soru?.('', metin, async () => { if (await spiritKullan(sl)) baslat(); }, null, { evet: 'Confirm', hayir: 'Cancel', kompakt: true });
      if (!ok) hud.notice?.('Not enough Knight Genie Point. Right-click a Spirit of Genie in your inventory first.', 'hata');
      return;
    }
    if (state.maden || acik) return;   // beklerken madencilik başlamış olabilir
    merkez = { x: p.x, z: p.z }; acik = true; bekleT = 0; bekleme.set('hedefYok', performance.now() + 8000); subCiz(); efekt(true);
    await sureTik(true);
    hud.info?.(`Knight Genie has been summoned (time left ${sureYazi(kalan)}). ${V.alanMenzil ? `This is the center of activity, range ${V.alanMenzil} m.` : 'Activity range 0 m: your character will not move.'}`, 'beceri');
  }
  function durdur(neden) {
    if (!acik) return;
    acik = false; subCiz(); state.combat?.cancelAttack?.(); efekt(false); sureTik(false).catch(() => {});
    if (neden) hud.info?.(neden, 'beceri');
  }
  setInterval(() => { if (acik && kalan > 0) { kalan--; if (kalan % 60 === 0) subCiz(); } }, 1000);   // ekrandaki dakika (sunucu 30 sn'de bir düzeltir)
  // süre: çalışırken 30 sn'de bir sunucuya yazılır; bitince (seçiliyse) Spirit of Genie kullanılır
  setInterval(async () => {
    if (!acik) return;
    await sureTik(true);
    if (!acik) return;
    // KO: "When Knight Genie point is 1, automatically use the Genie Spirit" — son dakikada (ya da bitince) çantadaki Spirit of Genie kullanılır
    if (kalan > 0) return;   // (7.11) Genie en çok 120 dk: yeni Spirit of Genie ancak süre bitince kullanılabilir (sunucu genie_spirit)
    const sl = V.o[8] ? esyaSlot(SPIRIT) : null;
    if (sl != null && (await spiritKullan(sl))) { await sureTik(true); return; }
    durdur('Knight Genie time has run out; Genie stopped.');
  }, 30000);
  // ölünce: (seçiliyse) otomatik kalk; Genie durur
  addEventListener('ko-oldum', () => {
    if (!acik) return;
    durdur('You died; Genie stopped.');
  });
  const bekleme = new Map();   // yetenek / iksir → hazır olma zamanı (ms)
  const hazir = (k) => (bekleme.get(k) || 0) <= performance.now();
  // kısayol çubuğuyla aynı sayım: premium iksir / 30'luk scroll gibi kullanım haklı eşyalarda kalan hak, diğerlerinde adet
  const iksirSay = (num) => { let n = 0; for (const [sl, x] of state.inv?.items || []) if (sl >= 14 && sl <= 41 && Number(x.row.item_num) === num) n += hakli(x.it) ? Number(x.row.durability ?? x.it.Duration) || 0 : x.row.count || 1; return n; };
  // iksir yuvalarındaki adetler içtikçe / çanta değiştikçe güncellenir
  const adetYenile = () => { if (!L || L.el.hidden) return; for (const [k, v] of Object.entries(V.slot)) if (typeof v === 'string' && v.startsWith('e:')) yuvaCiz(k); };
  addEventListener('ko-esya-kullanildi', () => setTimeout(adetYenile, 60)); setInterval(adetYenile, 1000);
  const iksirSlot = (num) => { for (const [sl, x] of state.inv?.items || []) if (sl >= 14 && sl <= 41 && Number(x.row.item_num) === num) return sl; return null; };
  async function iksirIc(n) {
    const v = V.slot[n]; if (!v || !String(v).startsWith('e:')) return false;
    const num = Number(String(v).slice(2)), k = 'e' + n; if (!hazir(k)) return false;
    const sl = iksirSlot(num); if (sl == null) { bekleme.set(k, performance.now() + 10000); mesaj(`Out of ${IT.get(num)?.strName || 'potions'}.`, 'hata'); return false; }
    bekleme.set(k, performance.now() + 2200);
    await state.inv?.kullan?.(sl); return true;
  }
  let yetenekMesgul = false;
  async function yetenekKullan(id, hizli = false) {
    const s = yet(id); if (!s || yetenekMesgul || !hazir('y' + id)) return false;
    const g = state.genelBekleme; if (g && g.bit > performance.now()) return false;
    if (state.combat.genie.mesgul()) return false;
    const S = state.combat.stats; if (S && s.mp && S.mp < s.mp) return false;
    yetenekMesgul = true;
    try {
      state.genieYetHiz = hizli ? 1.15 : 0;   // saldırı (1-4) ve iyileşme (5-8) yuvaları %15 hızlı
      const d = await state.combat.useSkill(s);
      if (d?.ok) { bekleme.set('y' + id, performance.now() + Math.max(hizli ? 0.85 : 1, d.bekleme || 1) * 1000); dispatchEvent(new CustomEvent('ko-yetenek-kullanildi', { detail: { id, bekleme: d.bekleme } })); return true; }
      bekleme.set('y' + id, performance.now() + (d?.hazir ? Math.max(1000, d.hazir * 1000 - Date.now()) : 3000));
      return false;
    } finally { yetenekMesgul = false; }
  }
  const buffAktif = (id) => (state.etkiler?.liste || []).some((e) => Number(e.id) === Number(id) && e.bitis > Date.now() + 2000);
  const cantaDolu = () => { let n = 0; for (const [sl] of state.inv?.items || []) if (sl >= 14 && sl <= 41) n++; return n >= 28; };
  const git = (x, z) => { state.target = new THREE.Vector3(x, 0, z); };

  // köye dön (KO "return to the village / moved to town"): Genie durur, karakter town atar
  const koyeDon = (neden) => { durdur(neden); try { hud.onTown?.(); } catch {} };
  // saldırı menzili halkası — KO orijinal Misc\genie_circle_03.dxt (512², yeşil rünlü daire, kenarlara değer): karakter merkezli,
  // çapı 2 × saldırı menzili, araziye oturan ızgara (her güncellemede yükseklik örneklenir). Genie çalışırken ya da menzil
  // kaydıracı değişince 3 sn önizleme; "Hide attack range" ile gizlenir.
  let halka = null, onizleBit = 0;
  const HN = 40;
  const capR = () => (V.alanMenzil === 0 ? Math.max(2, V.saldiriMenzil) : V.saldiriMenzil);   // (8.11) Genie çapı: başlatılan yer merkez, yarıçap = saldırı menzili (sabit)
  const halkaCiz = () => {
    const p0 = ben(), p = acik && merkez && V.alanMenzil !== 0 ? { x: merkez.x, z: merkez.z, y: p0?.y } : p0, gor = ((acik && !V.menzilGizle) || performance.now() < onizleBit) && p && world;
    if (!gor) { if (halka) halka.visible = false; return; }
    if (!halka) {
      const g = new THREE.PlaneGeometry(1, 1, HN, HN);
      const tex = new THREE.TextureLoader().load('./assets/genie/halka.webp'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      halka = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      halka.renderOrder = 4; halka.frustumCulled = false; world.add(halka);
    }
    const r = capR(), a = halka.geometry.attributes.position.array, h = state.heightAt || (() => p.y || 0);
    for (let j = 0, i = 0; j <= HN; j++) for (let k = 0; k <= HN; k++, i += 3) {
      const x = p.x + (k / HN * 2 - 1) * r, z = p.z + (j / HN * 2 - 1) * r;
      a[i] = x; a[i + 1] = (h(x, z) || 0) + 0.12; a[i + 2] = z;
    }
    halka.geometry.attributes.position.needsUpdate = true; halka.visible = true;
  };
  setInterval(halkaCiz, 120);
  let partiVardi = false;
  let son = 0, toplaniyor = null, siraYet = 1, uzakHedef = null;
  async function tik() {
    if (!acik) return;
    const C = state.combat, G = C?.genie; if (!G) return;
    if (G.oldum()) return durdur('You died; Genie stopped.');
    const now = performance.now();
    const k = state.keys; if (k && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((c) => k.has(c))) { bekleT = now + 3000; C.cancelAttack?.(); return; }
    if (now < bekleT || state.otur || state.frozen) return;
    const S = C.stats || {}, p = ben(); if (!p || !merkez) return;
    const hpY = S.max_hp ? (S.hp / S.max_hp) * 100 : 100, mpY = S.max_mp ? (S.mp / S.max_mp) * 100 : 100;
    // durma koşulları
    for (const [i, n, a] of [[1, 9, 'hpAdet'], [2, 11, 'mpAdet']]) {
      const v = V.slot[n]; if (!V.o[i] || !v) continue;
      if (iksirSay(Number(String(v).slice(2))) < V[a]) return koyeDon(`Fewer than ${V[a]} ${i === 1 ? 'HP' : 'MP'} recovery items left; returning to the village.`);
    }
    // ok bitince (yalnız rogue / okçu, yay kuşanılıysa)
    const sinif = Number(character.class) % 100;
    if (V.o[3] && [2, 7, 8].includes(sinif) && C.takiliYay?.()) { let ok = 0; for (const [sl, x] of state.inv?.items || []) if (sl >= 14 && sl <= 41 && Number(x.it?.Kind) === 120) ok += Number(x.row?.count) || 0; if (ok < 1) return koyeDon('Not enough arrows; returning to town.'); }
    // parti dağılınca / partide tek sağ kalan sen olunca
    { const P = state.parti, uy = P?.uyeler || P?.members || null;
      if (uy && uy.length > 1) { partiVardi = true; if (V.o[5] && uy.filter((u) => Number(u.id) !== Number(character.id) && !(u.olu || u.dead || u.hp <= 0)).length === 0) return koyeDon('You are the only survivor of the party; moving to town.'); }
      else if (partiVardi) { partiVardi = false; if (V.o[4]) return koyeDon('The party has broken up; returning to town.'); } }
    // Familiar açlığı (tokluk ≤ 5/10): çantadaki yemi ver
    if (V.o[9] && hazir('yem')) { const pt = state.pet?.pet; if (pt?.cagrili && Number(pt.tokluk) <= 5000) { bekleme.set('yem', now + 15000); for (const [sl, x] of state.inv?.items || []) if (sl >= 14 && sl <= 41 && Number(x.it?.Kind) === 152) { await state.pet?.kullan?.(sl, x.it); state.inv?.reload?.(); break; } } }
    // dönüşüm (Support): seçili dönüşüm eşyası, dönüşüm yokken kullanılır
    if (V.donusumAcik && V.donusumNum && !state.donusum && hazir('donusum')) {
      bekleme.set('donusum', now + 30000);
      const sl = iksirSlot(V.donusumNum);
      if (sl == null) mesaj('The selected transformation item is not in your inventory.', 'hata');
      else if (LISTE_DONUSUM.has(Number(V.donusumNum))) { if (hazir('donusumUyari')) { bekleme.set('donusumUyari', now + 600000); mesaj('This transformation item opens a monster list; use it manually.', 'hata'); } }
      else { await state.inv?.kullan?.(sl); return; }
    }
    // dayanıklılık (KO "Other"): 7 = Genie Hammer ile silah onarımı (dayanıklılık ≤ 100), 11 = zırh onarımı (≤ 100), 6 = silah 0 olunca köye
    {
      const dur = (x) => (x && Number(x.it?.Duration) > 1 && !(Number(x.it?.Countable) > 0) && x.row.durability != null ? Number(x.row.durability) : null);
      const silahlar = [6, 8].map((sl) => state.inv?.items?.get?.(sl)).filter((x) => dur(x) != null);
      const zirhlar = [...(state.inv?.items || [])].filter(([sl, x]) => sl <= 13 && sl !== 6 && sl !== 8 && dur(x) != null).map(([, x]) => x);
      const tamir = async (liste) => { if (!liste.some((x) => dur(x) <= 100) || !hazir('hammer')) return false; bekleme.set('hammer', now + 10000); const hs = esyaSlot(HAMMER); if (hs != null) return hammerKullan(hs, true); if (hazir('hammerUyari')) { bekleme.set('hammerUyari', now + 120000); mesaj('You have no Genie Hammer in your inventory.', 'hata'); } return false; };
      if (V.o[7] && (await tamir(silahlar))) return;
      if (V.o[7] && (await tamir(zirhlar))) return;   // (8.11) 7 = silah + zırh onarımı
      const kirik = silahlar.find((x) => dur(x) <= 0);
      if (kirik) {
        if (V.o[6]) return koyeDon(`The durability of ${kirik.it?.strName || 'your weapon'} is 0; moving to town.`);
        if (hazir('kirik')) { bekleme.set('kirik', now + 30000); mesaj(`The durability of ${kirik.it?.strName || 'your weapon'} is 0: it deals no damage. Have it repaired at a blacksmith or use a Genie Hammer.`, 'hata'); }
      }
    }
    const yerinde = V.alanMenzil === 0;   // 0 m: yerinden kıpırdamadan vur
    // büyücü + "Düz vuruş" kapalı: KO'daki gibi yakına koşmaz, büyüleri menzilden atar (menzil: saldırı yuvalarındaki en kısa büyü menzili)
    const sinifNo = Number(character.class) % 100;
    const yuvaYet = [1, 2, 3, 4].map((x) => yet(V.slot[x])).filter(Boolean);
    // KO büyücü Genie'si: saldırı yuvasında büyü varsa (Düz vuruş açık da olsa) canavara koşmaz, büyüleri menzilden atar
    const uzakBuyu = [3, 9, 10].includes(sinifNo) && yuvaYet.some((s) => s.tip1 === 3);
    const buyuMenzil = uzakBuyu ? Math.max(4, Math.min(...yuvaYet.map((s) => (s.tip1 === 1 ? 3 : Math.max(10, Number(s.menzil) || 20)))) - 1.5) : 0;
    const erisim = (n) => (uzakBuyu ? buyuMenzil : C.takiliYay?.() ? C.yayMenzili?.() || 20 : (n.t.attack_range || 2) + 1.2);
    // iksirler
    if (V.hpAcik && hpY < V.hpOran) await iksirIc(9);
    if (V.mpAcik && mpY < V.mpOran) await iksirIc(11);
    if (V.petAcik) { const pt = state.pet?.pet; if (pt?.cagrili && pt.max_hp && (pt.hp / pt.max_hp) * 100 < V.petOran) await iksirIc(10); }
    // iyileşme yetenekleri
    // kullanılamayan yetenek (MP yetmiyor, genel bekleme, sınıf / koşul…) kısa süre atlanır ve saldırıya geçilir — yoksa Genie her turda
    // aynı yeteneği deneyip hiç saldırmıyordu (sunucuya bile gitmeden false dönen büyücü güçlendirmeleri)
    const atla = (id, ms = 2500) => bekleme.set('y' + id, Math.max(bekleme.get('y' + id) || 0, performance.now() + ms));
    // Auto Curse Removal: lanet türü zayıflatma varsa Cure Curse
    if (V.lanet && hazir('lanet') && !G.mesgul()) {
      const lanetli = (state.etkiler?.liste || []).some((e) => e.tip === 'debuff' && e.bitis > Date.now() && /curse|malice|torment|parasite/i.test(e.ad || ''));
      if (lanetli) { bekleme.set('lanet', now + 3000); const Y = yetenekVerisi()?.yetenekler || {}; const id = Object.keys(Y).find((k) => /^cure curse/i.test(Y[k]?.ad || '') && hazir('y' + k)); if (id && (await yetenekKullan(Number(id) || id))) return; if (id) atla(id, 15000); }
    }
    // Dark Knight Mace kuşanılıysa iyileşme yetenekleri (5-8) "Recovery mode" kapalı olsa da kendine atılır
    const dkMace = V.o[10] && [6, 8].some((sl) => /dark knight mace/i.test(state.inv?.items?.get?.(sl)?.it?.strName || ''));
    if ((V.iyiles || dkMace) && hpY < V.iyilesOran && !G.mesgul()) { const n = [5, 6, 7, 8].find((x) => V.slot[x] && hazir('y' + V.slot[x])); if (n) { if (await yetenekKullan(V.slot[n], true)) return; atla(V.slot[n]); } }   // tek tek, sırayla
    // güçlendirmeler
    if (V.destek && !G.saldiriyor() && !G.mesgul()) { const n = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].find((x) => { const id = V.slot[x]; return id && !buffAktif(id) && hazir('y' + id); }); if (n) { const id = V.slot[n]; if (await yetenekKullan(id)) { bekleme.set('y' + id, Math.max(bekleme.get('y' + id) || 0, performance.now() + 20000)); return; } atla(id, 4000); } }   // güçlendirmeler de tek tek
    // KO Genie'de eşya toplama yok: mob ölünce sandığa koşmaz, bir sonraki moba geçer
    if (!V.saldiri) return;
    // hedef
    const hedef = C.target;
    { const izin = izinliAdlar(); if (izin.length && hedef && hedef.t && !izin.includes(hedef.t.name)) { if (G.saldiriyor()) C.cancelAttack?.(); C.clearTarget?.(); uzakHedef = null; return; } }
    if (uzakBuyu && hedef && !G.olu(hedef) && hedef === uzakHedef) {
      const d = uzak(hedef.pos, p);
      if (yerinde && d > erisim(hedef) + 0.5) { C.clearTarget?.(); uzakHedef = null; return; }   // menzilden çıktı: kovalamaz
      if (!yerinde && uzak(hedef.pos, merkez) > capR() + 2) { C.clearTarget?.(); uzakHedef = null; return; }
      if (d > erisim(hedef)) { if (!G.mesgul()) { const k = (d - erisim(hedef) + 1) / d; git(p.x + (hedef.pos.x - p.x) * k, p.z + (hedef.pos.z - p.z) * k); } return; }   // büyü menziline yaklaş
      if (now - son > 340 && !G.mesgul()) {
        son = now; state.target = null;
        const dolu = [1, 2, 3, 4].filter((n) => V.slot[n] && hazir('y' + V.slot[n]));
        if (dolu.length) { const n = dolu.find((x) => x >= siraYet) ?? dolu[0]; siraYet = n + 1 > 4 ? 1 : n + 1; if (!(await yetenekKullan(V.slot[n], true))) atla(V.slot[n], 1500); }
      }
      return;
    }
    if (yerinde && G.saldiriyor() && hedef && uzak(hedef.pos, p) > erisim(hedef) + 0.5) { C.cancelAttack?.(); state.target = null; }   // hedef uzaklaştı: kovalamaz
    else if (G.saldiriyor() && hedef && (yerinde || uzak(hedef.pos, merkez) <= capR() + 2)) {
      // saldırı yetenekleri sırayla
      // KO Genie: yetenekler SIRAYLA — her turda yalnız sıradaki tek yetenek denenir (hazır olmayan / bekleyen atlanır, sunucuya gitmez);
      // önceki yeteneğin animasyonu, oku ve görsel vuruşu bitmeden (combat genie.mesgul) yenisi başlamaz → efektler üst üste binmez
      // sırada hazır yetenek varken R vuruşu kısa süre bekletilir: hızlı silahlarda (asa) R aralıksız sürünce yeteneğe boşluk kalmıyordu
      if (V.duz !== false && !V.combo && [1, 2, 3, 4].some((n) => V.slot[n] && hazir('y' + V.slot[n]))) state.genieRBekle = now + 700;   // Combo: düz vuruş ile yetenekler arka arkaya (R beklemez)
      if (now - son > 340 && !G.mesgul() && (V.duz !== false || uzak(hedef.pos, p) <= erisim(hedef) + 0.5)) {
        son = now;
        const dolu = [1, 2, 3, 4].filter((n) => V.slot[n] && hazir('y' + V.slot[n]));
        if (dolu.length) {
          const n = dolu.find((x) => x >= siraYet) ?? dolu[0];
          siraYet = n + 1 > 4 ? 1 : n + 1;
          if (!(await yetenekKullan(V.slot[n], true))) atla(V.slot[n], 1500);
        }
      }
      return;
    }
    let en = null, ed = Infinity, enYakin = Infinity, sv = 0, uzakta = 0;
    const arama = uzakBuyu ? Math.max(V.saldiriMenzil, buyuMenzil) : V.saldiriMenzil;   // büyücü: büyü menzilindeki canavarlar da aranır
    const izin = izinliAdlar();
    for (const n of C.mobs?.values?.() || []) {
      if (G.olu(n) || !n.pos || !n.t) continue;
      if (izin.length && !izin.includes(n.t.name)) continue;   // hedef süzgeci: yalnız işaretli adlar
      const d = uzak(n.pos, p); enYakin = Math.min(enYakin, d);
      if (yerinde) { if (d > erisim(n)) continue; }
      else { if (uzak(n.pos, merkez) > capR() + (n.aggro ? 2 : 0)) { uzakta++; continue; } }   // (8.11) yalnız başlangıç merkezli sabit çapın içindeki canavarlar; karakter çap içinde gidip gelir
      const pd = d - (n.aggro ? 100 : 0);   // bana saldıranlar önce
      if (pd < ed) { ed = pd; en = n; }
    }
    if (en) bekleme.set('hedefYok', now + 8000);
    if (en) { if (uzakBuyu) { C.cancelAttack?.(); G.sec(en); uzakHedef = en; } else G.saldir(en); mesaj(`Target: ${en.t.name}`); return; }
    if (!yerinde && V.basaDon && uzak(p, merkez) > 3 && !state.target) git(merkez.x, merkez.z);
    if (hazir('hedefYok')) {
      bekleme.set('hedefYok', now + 15000);
      const ek = sv ? ` ${sv} monster(s) skipped: more than 10 levels above you (Other tab).` : uzakta ? ` ${uzakta} monster(s) are farther than the attack range (${Math.round(arama)} m).` : Number.isFinite(enYakin) ? ` Nearest monster: ${Math.round(enYakin)} m.` : '';
      mesaj(`No monster to attack within ${yerinde ? 'attack' : 'activity'} range (${yerinde ? Math.round(erisim({ t: {} })) : V.alanMenzil} m).${ek}`);
    }
  }
  let calisiyor = false;
  setInterval(async () => { if (calisiyor) return; calisiyor = true; try { await tik(); } catch (e) { console.warn('genie', e); } finally { calisiyor = false; } }, 300);

  cubuk();
  return { ac, kapat, baslat, durdur, get acik() { return acik; }, duzKapali: () => acik && V.duz === false };
}
