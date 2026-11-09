// Yetenekler penceresi (KO re_skill / CUISkillTreeDlg): sınıfın tüm yetenekleri sekme sekme, 6'lı sayfalar.
// Veri: assets/yetenek/yetenekler.json (client Skill_Magic_Main + sunucu MAGIC; ad, Türkçe açıklama, ikon, gereksinim, MP, bekleme…)
// Sekmeler (KO iNeedSkill % 10): 0 temel, 5/6/7 uzmanlık, 8 usta. Temel yetenek karakter seviyesiyle, uzmanlık o sekmeye verilen puanla açılır.
// Yeteneklerin kullanımı (hasar, buff, kısayol çubuğu) sonraki aşamada — burada altyapı: veri, pencere, ipucu, seçim olayı.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let DATA = null, loading = null;
let BAG = null, BILGI = null;   // {sb, character}; sunucudaki yetenek puanları (skill_info)
export function setYetenekBaglam(b) { BAG = b; yenileBilgi().catch(() => {}); }
export async function yenileBilgi() {
  if (!BAG?.sb) return null;
  // supabase sorgusu then'lenebilir ama .catch'i yok → try/await
  let data = null; try { ({ data } = await BAG.sb.rpc('skill_info', { p_char: BAG.character.id })); } catch { data = null; }
  if (data) { BILGI = data; if (data.sinif && BAG.character) BAG.character.class = data.sinif; dispatchEvent(new CustomEvent('ko-yetenek-bilgi', { detail: data })); }
  return data;
}
export const yetenekVerisi = () => DATA;
// Temel yetenekler Dribble / Shoot (futbol topu efektleri 32088 / 32086): yalnız futbol maçı etkinliğinde kullanılır, diğer zamanlarda gri ve kapalı
// pasif yetenekler (tip1 0: Valor, Absoluteness, Matchless…): kendiliğinden etkin, kısayol çubuğuna konamaz
export const pasifYet = (s) => !!s && Number(s.tip1) === 0;
export const futbolYet = (s) => !!s && Number(s.tip1) === 8 && [32086, 32088].includes(Number(s.fx?.[2]));
let FUTBOL = false;
export const futbolAcik = () => FUTBOL;
export function futbolAyarla(v) { FUTBOL = !!v; dispatchEvent(new Event('ko-futbol')); }
export function loadYetenekler() {
  return (loading ||= fetch('./assets/yetenek/yetenekler.json').then((r) => r.json()).then((d) => (DATA = d)).catch((e) => { loading = null; throw e; }));
}
export const sinifKodu = (me) => (Number(me?.nation) === 2 ? 200 : 100) + (Number(me?.class) || 1);
const BTN = { savasci: 'blade', rogue: 'ranger', buyucu: 'mage', rahip: 'cleric', kurian: 'blade' };
const SEKME_BTN = (g) => ({ 0: 'btn_public', 5: `btn_${BTN[g]}0`, 6: `btn_${BTN[g]}1`, 7: g === 'kurian' ? 'btn_reaper2' : `btn_${BTN[g]}2`, 8: 'btn_master' });   // (7.11) Kurian 3. sekme: Devil (btn_reaper2)
const TUM_SEKME = ['blade0', 'blade1', 'blade2', 'ranger0', 'ranger1', 'ranger2', 'mage0', 'mage1', 'mage2', 'cleric0', 'cleric1', 'cleric2', 'reaper2'].map((x) => 'btn_' + x);
const HEDEF = { 1: 'Kendin', 2: 'Dost', 3: 'Grup', 4: 'Tüm grup', 5: 'Düşman', 6: 'Tüm düşmanlar', 7: 'Düşman', 8: 'Alan', 9: 'Alan', 10: 'Grup', 11: 'Ölü dost' };
const TIP = { 1: 'Yakın dövüş', 2: 'Ok', 3: 'Büyü', 4: 'Güçlendirme', 5: 'Diriltme', 6: 'Dönüşüm', 7: 'Canavar büyüsü', 8: 'Işınlanma', 9: 'Görünmezlik / işaret' };

/** sk: buildLayout('re_skill') sonucu; getMe: () => karakter satırı */
export function initYetenekPenceresi(sk, getMe) {
  const el = sk.el;
  let sekme = 0, sayfa = 0, secili = null, tip = null;
  el.classList.add('ko-yetenek');
  // deadsoft 2369 yeni yetenek penceresi (re_skill 447×759): 8 yuva, Reset skill, Skill Point, sekme puanı ▲ (btn_4–7), İngilizce (KO)
  const Y8 = !!sk.get('btn_preset') && !!el.querySelector(':scope > .kui-ar[data-id="7"]');
  const SAYFA = Y8 ? 8 : 6;
  if (!Y8) {
    // başlık: görüntüdeki "Skill" yazısı yerine "Yetenekler"
    for (const i of el.querySelectorAll(':scope > .kui-img')) if (i.style.left === '179px' && i.style.top === '23px') i.style.visibility = 'hidden';
    const bas = document.createElement('div'); bas.className = 'kui kui-tx ko-yetenek-baslik'; bas.textContent = 'Yetenekler';
    bas.style.cssText = 'left:120px;top:22px;width:150px;height:20px;justify-content:center;align-items:center;'; el.append(bas);
  }
  // üst üste binen sınıf etiketleri (tüm sınıfların yazıları aynı yerde) gizlenir; yerine oyuncunun sınıfına göre Türkçe etiketler
  for (const t of el.querySelectorAll(':scope > .kui-tx')) {
    const id = t.dataset.id || '', s = t.textContent.trim();
    if (Y8) { if (/^img_/.test(id) || s === 'Master') t.hidden = true; if (s === 'Page') t.hidden = true; if (/^string_skill_|^string_info/.test(id)) t.textContent = ''; continue; }
    if (/^img_/.test(id) || s === 'Master') t.hidden = true;
    const tr = { Command: 'Komuta', Language: 'Dil', Politics: 'Politika', 'Siege weapon': 'Kuşatma', 'Skill Point': 'Yetenek Puanı', 'Beceri Puanı': 'Yetenek Puanı' }[s]; if (tr) t.textContent = tr;
    if (s === 'Page' || s === 'Sayfa') t.hidden = true;
    if (id === 'string_page') Object.assign(t.style, { left: '166px', width: '52px', justifyContent: 'center' });
  }
  const artilar = {};
  const etiket = {}; for (const [k, x, y] of (Y8 ? [[5, 46, 190], [6, 243, 190], [7, 46, 224], [8, 243, 224]] : [[5, 37, 163], [6, 196, 163], [7, 37, 187], [8, 196, 187]])) {
    const d = document.createElement('div'); d.className = 'kui kui-tx ko-yetenek-etiket'; d.style.cssText = `left:${x}px;top:${y}px;width:56px;height:16px;align-items:center;`; el.append(d); etiket[k] = d;
  }
  // 6 yuva: alan 0..5 (KO sırası) + ad yazısı string_list_N
  const yuvalar = [...el.querySelectorAll(':scope > .kui-ar')].filter((a) => (Y8 ? /^[0-7]$/ : /^[0-5]$/).test(a.dataset.id)).sort((a, b) => a.dataset.id - b.dataset.id);
  if (Y8) {
    // Preset düğmesi (orijinal yazı, Save Quickslot ile aynı görünüm): KO Skill Preset penceresi (skill-preset.js)
    const b = sk.get('btn_preset'); if (b) b.title = 'Skill Preset';
    sk.click('btn_preset', () => {
      const c = DATA?.siniflar?.[sinifKodu(me())];
      const adlar = { savasci: ['Attack', 'Defence', 'Passion'], rogue: ['Archery', 'Assassinate', 'Search'], buyucu: ['Fire', 'Ice', 'Lightning'], rahip: ['Heal', 'Aura', 'Spirit'], kurian: ['Attack', 'Defence', 'Devil'] }[c?.grup];
      import('./skill-preset.js').then((M) => M.skillPresetAc({ sb: BAG?.sb, character: BAG?.character, hud: BAG?.hud || window.__ko?.hud, adlar, yanina: el, onUygula: () => yenileBilgi().catch(() => {}) })).catch((e) => console.warn('skill preset', e));
    });
  }
  // (6.11) KO Save Quickslot penceresi (re_hotkeypreset)
  if (sk.get('btn_preset_hotkey')) sk.click('btn_preset_hotkey', () => import('./hotkey-preset.js').then((M) => M.hotkeyPresetAc({ character: BAG?.character || window.__ko?.character, state: window.__ko?.state, hud: BAG?.hud || window.__ko?.hud, yanina: el })).catch((e) => console.warn('save quickslot', e)));
  for (const a of yuvalar) { a.style.pointerEvents = 'auto'; a.classList.add('ko-yetenek-yuva'); }

  const me = () => getMe?.() || {};
  // KO: usta (master) bölümü yalnız usta sınıflarda açılır (Guardian 6, Penetrator 8, Enchanter 10, Dark Priest 12, Usta Kurian 15;
  // usta_ol / GM). Usta sekmesinde karakterin kendi usta sınıfının yetenekleri listelenir. Yetenek sıfırlama ustalığı kapatmaz,
  // yalnız usta sekmesine verilen puanlar da sıfırlanır (sunucu skill_reset).
  const USTA_SINIF = new Set([6, 8, 10, 12, 15]);
  const ustaAcik = () => USTA_SINIF.has(Number(BILGI?.sinif ?? me().class)) || !!me().usta;
  const puanlar = () => { const p = BILGI || me().skill_points || {}; return { serbest: +p.serbest || 0, 5: +p[5] || 0, 6: +p[6] || 0, 7: +p[7] || 0, 8: +p[8] || 0 }; };
  const acik = (s) => !(futbolYet(s) && !FUTBOL) && !(s.sekme > 0 && meslekKilidi()) && (s.sekme === 0 ? (Number(me().level) || 1) >= s.seviye : puanlar()[s.sekme] >= s.seviye);
  // meslek değiştirmemiş karakter: uzmanlık sekmeleri uzman sınıfın, usta sekmesi usta sınıfın yetenekleriyle (kilitli) gösterilir
  const UZMAN = { 1: 5, 2: 7, 3: 9, 4: 11, 13: 14 }, USTA = { 1: 6, 5: 6, 2: 8, 7: 8, 3: 10, 9: 10, 4: 12, 11: 12, 13: 15, 14: 15 };
  const kaynakSinif = () => {
    const k = sinifKodu(me()), n = Math.floor(k / 100) * 100, c = k % 100;
    if (sekme === 8 && USTA[c]) return n + USTA[c];
    if (sekme >= 5 && sekme <= 7 && UZMAN[c]) return n + UZMAN[c];
    return k;
  };
  const meslekKilidi = () => kaynakSinif() !== sinifKodu(me());
  // Rogue usta sayfasında gösterilmeyenler: Ymir's Roar, Logos' Horn, Pathos' Insight, Akara's Blessing, Trina's Wisdom, Power of Logos (x039–x045); kalanlar yukarı kayar
  const GIZLI_USTA = (c, s) => c.grup === 'rogue' && s.sekme === 8 && [39, 40, 42, 43, 44, 45].includes(Number(s.id) % 1000);
  // temel sayfadan şimdilik kaldırılanlar (tüm sınıflar): Anger Explosion, Whipping, Determination, Belief
  const GIZLI_TEMEL = new Set(['anger explosion', 'whipping', 'determination', 'belief']);
  function liste() {
    const c = DATA?.siniflar?.[kaynakSinif()]; if (!c) return [];
    return c.liste.map((i) => DATA.yetenekler[i]).filter((s) => s && s.sekme === sekme && !GIZLI_USTA(c, s) && !(s.sekme === 0 && GIZLI_TEMEL.has(String(s.ad).toLowerCase()))).sort((a, b) => a.ozel - b.ozel || a.seviye - b.seviye || a.id - b.id);
  }
  const ikon = (s, px = 32) => {
    const A = DATA.atlas, k = px / A.boyut, i = s.ikon < 0 ? 0 : s.ikon;
    return `<div class="ko-yetenek-ikon" style="width:${px}px;height:${px}px;background:url(./assets/yetenek/${A.dosya}) ${-(i % A.kolon) * px}px ${-Math.floor(i / A.kolon) * px}px / ${A.kolon * A.boyut * k}px auto"></div>`;
  };
  function bilgiYaz(s) {
    const t = (id, v) => sk.text(id, v ?? '');
    if (!s) { for (const id of ['string_info', 'string_skill_mp', 'string_skill_vp', 'string_skill_level', 'string_skill_point', 'string_skill_item0', 'string_skill_item1', 'string_skill_item2']) t(id, ''); return; }
    if (Y8) {   // KO yeni pencere: İngilizce (deadsoft Skill_Magic_Main açıklaması)
      t('string_info', `${s.ad}: ${s.en || s.aciklama}`);
      t('string_skill_mp', `MP : ${s.mp || 0}`); t('string_skill_vp', s.hp ? `HP : ${s.hp}` : '');
      t('string_skill_point', s.sekme === 0 ? `Required Lv : ${s.seviye}` : `Required Point : ${s.seviye}`);
      t('string_skill_level', s.bekleme ? `Cool time : ${(s.bekleme / 10).toFixed(1)} sec` : '');
      t('string_skill_item0', s.menzil ? `Range : ${s.menzil} m` : ''); t('string_skill_item1', s.dokum ? `Cast time : ${(s.dokum / 10).toFixed(1)} sec` : '');
      t('string_skill_item2', acik(s) ? 'Available' : 'Not learned yet');
      return;
    }
    t('string_info', `${s.ad}: ${s.aciklama}`);
    t('string_skill_mp', `MP: ${s.mp || 0}${s.hp ? ` · HP: ${s.hp}` : ''}${s.bekleme ? ` · Bekleme: ${(s.bekleme / 10).toFixed(1)} sn` : ''}`);
    t('string_skill_point', s.sekme === 0 ? `Gereken seviye: ${s.seviye}` : `Gereken ${DATA.siniflar[sinifKodu(me())]?.sekmeler?.[s.sekme] || ''} puanı: ${s.seviye}`);
    t('string_skill_item0', `${TIP[s.tip1] || 'Yetenek'}${s.tip2 ? ' + ' + (TIP[s.tip2] || s.tip2) : ''} · Hedef: ${HEDEF[s.hedef] || '-'}${s.menzil ? ` · Menzil: ${s.menzil} m` : ''}`);
    t('string_skill_item1', s.dokum ? `Büyü süresi: ${(s.dokum / 10).toFixed(1)} sn` : '');
    t('string_skill_item2', acik(s) ? 'Kullanılabilir' : futbolYet(s) ? 'Yalnız futbol maçı etkinliğinde' : s.sekme > 0 && meslekKilidi() ? 'Meslek değişimi gerekli' : 'Henüz açılmadı');
  }
  function render() {
    if (!DATA) { loadYetenekler().then(render).catch(() => {}); return; }
    if (!BILGI && BAG) yenileBilgi().catch(() => {});
    const c = DATA.siniflar[sinifKodu(me())]; if (!c) return;
    const S = SEKME_BTN(c.grup), p = puanlar();
    for (const [k, id] of Object.entries(S)) sk.get(id)?.classList.toggle('secili', Number(k) === sekme);
    const EN = { savasci: ['Attack', 'Defence', 'Fervor'], rogue: ['Archery', 'Assasinate', 'Explore'], buyucu: ['Fire', 'Ice', 'Lightning'], rahip: ['Heal', 'Aura', 'Spirit'], kurian: ['Attack', 'Defence', 'Devil'] }[c.grup];
    for (const k of [5, 6, 7, 8]) etiket[k].textContent = Y8 ? (k === 8 ? 'Master' : EN?.[k - 5] || c.sekmeler[k] || '') : c.sekmeler[k] || '';
    sk.text('string_4', String(p[5])); sk.text('string_5', String(p[6])); sk.text('string_6', String(p[7])); sk.text('string_7', String(p[8]));
    sk.text('string_skillpoint', String(p.serbest));
    // (5.11) KO: uzmanlık sekmeleri yetenekler açılınca (10. seviye + Kaishan meslek değişimi, sunucu skill_open) görünür;
    //   açılmamışsa yalnız temel (Basic Skill) sekmesi
    { const mes = BILGI ? !!BILGI.meslek : ![1, 2, 3, 4, 13].includes(Number(me().class) % 100);
      const ac = mes && (Number(me().level) || 1) >= 10;
      if (!ac && sekme >= 5) sekme = 0;
      // (7.11) başka sınıfların sekme düğmeleri (aynı yerde üst üste; örn. Kurian'ın "Devil" sekmesi) her zaman gizli — yeni Rogue'da Devil görünüyordu
      const benim = new Set([S[5], S[6], S[7]]);
      for (const id of TUM_SEKME) if (!benim.has(id)) sk.all(id).forEach((b) => (b.hidden = true));
      for (const k of [5, 6, 7]) { sk.all(S[k]).forEach((b) => (b.hidden = !ac)); etiket[k].hidden = !ac; if (artilar[k]) artilar[k].hidden = !ac; }
      for (const id of ['btn_4', 'btn_5', 'btn_6']) if (Y8) sk.all(id).forEach((b) => (b.hidden = !ac));
      for (const n of el.querySelectorAll('[data-id="string_4"],[data-id="string_5"],[data-id="string_6"]')) n.hidden = !ac; }
    { const u = ustaAcik(); if (!u && sekme === 8) sekme = 0;
      for (const id of ['btn_master', 'btn_7']) sk.all(id).forEach((b) => (b.hidden = !u));
      etiket[8].hidden = !u; if (artilar[8]) artilar[8].hidden = !u;
      for (const n of el.querySelectorAll('[data-id="string_7"]')) n.hidden = !u; }
    for (const [k, id] of Object.entries(S)) sk.get(id)?.classList.toggle('secili', Number(k) === sekme);   // (5.11) kilitli sekme sıfırlandıysa vurgu da düzelir
    const L = liste(), sayfalar = Math.max(1, Math.ceil(L.length / SAYFA)); sayfa = Math.min(sayfa, sayfalar - 1);
    sk.text('string_page', Y8 ? `${sayfa + 1} Page` : `${sayfa + 1} / ${sayfalar}`);
    yuvalar.forEach((a, j) => {
      const s = L[sayfa * SAYFA + j];
      a.dataset.yetenek = s ? s.id : '';
      a.innerHTML = s ? ikon(s) : '';
      a.classList.toggle('kapali', !!s && !acik(s)); a.classList.toggle('secili', !!s && secili === s.id);
      sk.text(`string_list_${j}`, s ? s.ad : '');
    });
    for (const n of el.querySelectorAll('[data-id^="string_list_"]')) n.classList.add('ko-yetenek-ad');
    bilgiYaz(secili && DATA.yetenekler[secili]);
  }
  // uzmanlık sekmelerine puan verme (KO: sayının yanındaki ▲)
  const puanVer = async (k) => {
    if (!BAG?.sb) return;
    const { data, error } = await BAG.sb.rpc('skill_point_add', { p_char: BAG.character.id, p_tab: k });
    if (error) { dispatchEvent(new CustomEvent('ko-yetenek-hata', { detail: error.message })); return; }
    BILGI = data; render();
  };
  if (Y8) { [5, 6, 7, 8].forEach((k, i) => { sk.click('btn_' + (4 + i), () => puanVer(k)); artilar[k] = sk.get('btn_' + (4 + i)); }); }
  for (const [k, x, yy] of (Y8 ? [] : [[5, 172, 162], [6, 331, 162], [7, 172, 186], [8, 331, 186]])) {
    const b = document.createElement('div'); b.className = 'kui ko-yetenek-arti'; artilar[k] = b; b.title = 'Bu sekmeye 1 yetenek puanı ver';
    b.style.cssText = `left:${x}px;top:${yy}px;width:16px;height:16px;pointer-events:auto;cursor:pointer;`;
    b.addEventListener('click', async (e) => {
      e.stopPropagation(); if (!BAG?.sb) return;
      const { data, error } = await BAG.sb.rpc('skill_point_add', { p_char: BAG.character.id, p_tab: k });
      if (error) { dispatchEvent(new CustomEvent('ko-yetenek-hata', { detail: error.message })); return; }
      BILGI = data; render();
    });
    el.append(b);
  }
  addEventListener('ko-yetenek-bilgi', () => { if (!el.hidden) render(); });
  addEventListener('ko-seviye', () => setTimeout(() => { if (!el.hidden) render(); }, 50));   // (7.11) seviye atlayınca (ör. Rogue Stab 5. seviye) yetenek hemen açık görünür
  // sağ tık: yeteneği kısayol çubuğundaki ilk boş yuvaya yerleştir
  el.addEventListener('contextmenu', (e) => {
    const a = e.target.closest('.ko-yetenek-yuva'); if (!a?.dataset.yetenek) return;
    e.preventDefault(); e.stopPropagation();
    const s = DATA?.yetenekler?.[Number(a.dataset.yetenek)]; if (!s) return;
    if (!acik(s)) { dispatchEvent(new CustomEvent('ko-yetenek-hata', { detail: 'Bu yetenek henüz açılmadı.' })); return; }   // açılmamış yetenek çubuğa konamaz
    if (pasifYet(s)) { dispatchEvent(new CustomEvent('ko-yetenek-hata', { detail: 'Pasif yetenekler kısayol çubuğuna konamaz; kendiliğinden etkindir.' })); return; }
    dispatchEvent(new CustomEvent('ko-yetenek-yerlestir', { detail: { id: Number(a.dataset.yetenek) } }));
  });
  // yeteneği kısayol çubuğuna sürükle
  el.addEventListener('pointerdown', (e) => {
    const a = e.target.closest('.ko-yetenek-yuva'); if (!a?.dataset.yetenek || e.button !== 0) return;
    const id = Number(a.dataset.yetenek), s = DATA?.yetenekler?.[id]; if (!s || !acik(s)) return;   // açılmamış yetenek sürüklenemez
    if (pasifYet(s)) { dispatchEvent(new CustomEvent('ko-yetenek-hata', { detail: 'Pasif yetenekler kısayol çubuğuna konamaz; kendiliğinden etkindir.' })); return; }
    e.stopPropagation();
    const bas = { x: e.clientX, y: e.clientY }; let hayalet = null;
    const move = (ev) => {
      if (!hayalet && Math.hypot(ev.clientX - bas.x, ev.clientY - bas.y) < 6) return;
      if (!hayalet) { hayalet = document.createElement('div'); hayalet.className = 'ko-yetenek-hayalet'; hayalet.innerHTML = ikon(s); document.body.append(hayalet); tip?.remove(); }
      hayalet.style.left = ev.clientX - 16 + 'px'; hayalet.style.top = ev.clientY - 16 + 'px';
    };
    const up = (ev) => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true);
      if (hayalet) { hayalet.remove(); dispatchEvent(new CustomEvent('ko-yetenek-birak', { detail: { id, x: ev.clientX, y: ev.clientY } })); }
    };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
  });
  // sekme düğmeleri
  for (const [k, id] of Object.entries({ 0: 'btn_public', 8: 'btn_master' })) sk.click(id, () => { sekme = Number(k); sayfa = 0; render(); });
  for (const g of ['blade', 'ranger', 'mage', 'cleric']) for (let i = 0; i < 3; i++) sk.click(`btn_${g}${i}`, () => { sekme = 5 + i; sayfa = 0; render(); });
  if (sk.get('btn_reaper2')) sk.click('btn_reaper2', () => { sekme = 7; sayfa = 0; render(); });
  sk.click('btn_left', () => { sayfa = Math.max(0, sayfa - 1); render(); });
  sk.click('btn_right', () => { const n = Math.ceil(liste().length / SAYFA); sayfa = Math.min(n - 1, sayfa + 1); render(); });
  // seçim + ipucu
  el.addEventListener('click', (e) => { const a = e.target.closest('.ko-yetenek-yuva'); if (!a?.dataset.yetenek) return; secili = Number(a.dataset.yetenek); render(); el.dispatchEvent(new CustomEvent('ko-yetenek-sec', { detail: DATA.yetenekler[secili], bubbles: true })); });
  // (31.10) üzerine gelince açılan siyah ipucu kutusu kaldırıldı — bilgiler zaten pencerenin altındaki açıklama alanında (İngilizce) yazıyor
  return { render, get sekme() { return sekme; } };
}
// yetenek puanı sıfırlanınca (Reset skill / Kaishan) sunucudaki puanlar yeniden okunur
addEventListener('ko-yetenek-sifirlandi', () => { yenileBilgi().catch(() => {}); });
