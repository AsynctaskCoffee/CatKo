// Moradon büyülü örsü (KO: obj_co_itemup, olay 5001 / NPC "Magic anvil").
// Örse tıklayınca KO seçim menüsü (co_upgradeselect): Eşya güçlendirme · Takı güçlendirme · Menüyü kapat.
// Eşya güçlendirme penceresi KO'nun re_itemupgrade yerleşimi: yükseltilecek eşya yuvası, 9 malzeme yuvası, sonuç yuvası,
// pencere içinde çanta (28 yuva), Noah, Onayla / İptal / Konuşma / Önizleme; onayda KO ilerleme animasyonu (group_img_load_0..30).
// Kurallar sunucuda (ors_yukselt): parşömen sınıfı, başarı şansı, Trina (+%20 oran), Karivdis (reb %50), Rebirth (reb) ve Reverse (reb güçlendirme).
import * as THREE from '../vendor/three.module.min.js';
import { hasLayout, buildLayout, draggable, ekUI } from './kui.js';
import { loadMeta, iconHtml, tooltipHtml, fromDb, nameColor } from './esya.js';

export const ORS = { zone: 'moradon', x: 816.14, y: 13.65, z: 607.17 };
let META_P = null;
const MALZEME = new Set([379229000, 379214000, 379020000, 379025000, 379221000, 379255000, 379205000, 379152000, 379016000, 379021000, 379256000, 379257000, 700002000, 379258000,
  379222000, 379223000, 379224000, 379225000, 379226000, 379206000, 379208000, 379209000, 379210000, 379211000,   // (3.11) Enchant Scroll (Low / Middle Class item)
  379017000, 379026000, 379027000, 379028000, 379029000, 379022000, 379030000, 379031000, 379032000, 379033000]);   // Enchant Scroll / Blessed Enchant Scroll (STR HP DEX INT MAGIC)
const noah = (n) => Number(n || 0).toLocaleString('tr-TR');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initOrs({ sb, character, hud, state, player, camera, canvas, world }) {
  if (character?.zone && character.zone !== ORS.zone) return null;
  const layer = () => document.getElementById('kohud') || document.body;
  const merkez = new THREE.Vector3(ORS.x, ORS.y + 1.0, ORS.z);
  const uzaklik = () => Math.hypot(player.position.x - ORS.x, player.position.z - ORS.z);
  let bekleyen = false, menu = null, pen = null;

  // ---- ekranda örse tıklama (küre: 1.4 m)
  const ekran = (v) => { const p = v.clone(); world.localToWorld(p); p.project(camera); const r = canvas.getBoundingClientRect(); return { x: (p.x + 1) / 2 * r.width + r.left, y: (1 - p.y) / 2 * r.height + r.top, z: p.z }; };
  function click(e) {
    const a = ekran(merkez); if (a.z > 1) return false;
    const b = ekran(merkez.clone().add(new THREE.Vector3(0, 1.4, 0)));
    const R = Math.max(14, Math.abs(b.y - a.y));
    if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > R) return false;
    if (uzaklik() <= 6) acMenu();
    else {   // KO: örse yürür, varınca menü açılır
      const dx = player.position.x - ORS.x, dz = player.position.z - ORS.z, L = Math.hypot(dx, dz) || 1;
      state.target = new THREE.Vector3(ORS.x + dx / L * 3, 0, ORS.z + dz / L * 3); bekleyen = true;
    }
    return true;
  }
  function update() {
    if (((pen && !pen.el.hidden) || (menu && !menu.el.hidden)) && hud.invOpen) envanterKapat();   // örs açıkken envanter açılmaz
    if (bekleyen && uzaklik() <= 6) { bekleyen = false; acMenu(); }
    if (bekleyen && !state.target) bekleyen = false;
    if (pen && !pen.el.hidden && uzaklik() > 10) { kapat(); hud.info?.('You are too far away from the anvil.', 'ors-uyari'); }
    if (menu && !menu.el.hidden && uzaklik() > 10) menu.el.hidden = true;
  }

  // ---- KO konumlandırma: ekranın ortası (ölçekli #kohud içinde)
  const ortala = (el) => requestAnimationFrame(() => {
    const r = el.getBoundingClientRect(), z = r.width / (el.offsetWidth || r.width) || 1;
    el.style.left = Math.max(0, (innerWidth - r.width) / 2 / z) + 'px'; el.style.top = Math.max(0, (innerHeight - r.height) / 2 / z) + 'px';
  });

  // ---- seçim menüsü (co_upgradeselect)
  // KO: örs menüsü ve güçlendirme penceresi açılırken oyuncu envanteri kapalı kalır (pencere kendi çantasını gösterir)
  const envanterKapat = () => { try { if (hud.invOpen) hud.panel?.('envanter'); } catch {} };
  async function acMenu() {
    if (pen && !pen.el.hidden) return;
    envanterKapat();
    if (!menu) {
      // KO (KnightOnlineEn re_upgradeselect.uif): "Magic Anvil" — Upgrade Item · Accessory Disassembling · Compound Accessory · Help
      if (!(await ekUI('anvil').catch(() => false)) || !hasLayout('re_upgradeselect')) { hud.notice?.('Could not load the anvil interface.', 'ors-uyari'); return; }
      if (menu) { menu.el.hidden = false; return; }
      const L = buildLayout('re_upgradeselect', { className: 'ko-ors-menu ko-ors-secim ko-pencere kui-dokulu' });
      layer().append(L.el); draggable(L, 30);
      L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
      L.click('upgrade_1', () => { L.el.hidden = true; acPencere(); });
      L.click('upgrade_3', () => { hud.notice?.('Accessory Disassembling is not available yet.', 'ors-uyari'); });
      L.click('upgrade_2', () => { hud.notice?.('Compound Accessory is not available yet.', 'ors-uyari'); });
      L.click('btn_help', () => { hud.info?.('Magic Anvil: put the item and an upgrade scroll in the window and press Confirm. Upgrades can fail and destroy the item; Trina\'s Piece raises the success rate.', 'gorev'); });
      L.click('btn_close', () => { L.el.hidden = true; });
      menu = L;
    }
    menu.el.hidden = false; menu.el.style.zIndex = 60; ortala(menu.el);
  }

  // ---- eşya güçlendirme penceresi (re_itemupgrade)
  const IT = new Map();
  const esyaAl = async (num) => {
    if (IT.has(num)) return IT.get(num);
    const { data } = await sb.from('items').select('*').eq('num', num).maybeSingle();
    const it = data ? fromDb(data) : null; IT.set(num, it); return it;
  };
  const sec = { esya: null, mats: Array(9).fill(null), sonuc: null };   // sonuc: güçlendirilen eşyanın çanta yuvası (sonuç yuvasında bekler)   // çanta yuvaları
  let onizleme = null, mesgul = false, gold = 0, sonucIt = null, sonucT = 0;
  const kullanilan = (s) => sec.esya === s || sec.mats.includes(s) || sec.sonuc === s;
  const bag = () => state.inv?.items || new Map();

  let tip = null;
  const ipucu = (html, ev) => {
    tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu ko-tic-ipucu' });
    if (!tip.isConnected) document.body.append(tip);
    tip.innerHTML = html;
    tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, ev.clientX + 16) + 'px';
    tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, ev.clientY - 10)) + 'px';
  };
  const ipucuKapat = () => tip?.remove();

  function kur() {
    const L = buildLayout('re_itemupgrade', { className: 'ko-ors ko-pencere kui-dokulu' });
    layer().append(L.el);   // KO: eşya güçlendirme penceresi envanter gibi sabit (solda), sürüklenmez
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    L.el.addEventListener('contextmenu', (e) => e.preventDefault());
    L.show('group_fx', false);
    for (let i = 0; i < 28; i++) { const a = L.get('a_slot_' + i); if (a) { a.dataset.cs = 14 + i; a.classList.add('ors-yuva'); } }
    for (let i = 0; i < 9; i++) { const a = L.get('a_m_' + i); if (a) { a.dataset.m = i; a.dataset.esyaBirak = '1'; a.classList.add('ors-yuva'); } }
    L.get('a_upgrade')?.setAttribute('data-esya-birak', '1'); L.get('a_upgrade')?.classList.add('ors-yuva');
    L.get('a_result')?.classList.add('ors-yuva');
    L.click('btn_close', kapat);
    // İptal: pencere açık kalır; eşya yuvası ve 9 malzeme yuvasındakiler çantaya geri döner
    L.click('btn_cancel', () => { if (mesgul) return; sec.sonuc = null; sec.esya = null; sec.mats.fill(null); onizleme = null; sonucIt = null; clearTimeout(onT); ipucuKapat(); ciz(); });
    L.click('btn_conversation', () => { kapat(); acMenu(); });
    L.click('btn_review', () => { if (!mesgul) onizle(true); });
    L.click('btn_ok', onayla);
    // pencere içi sürükle-bırak: çanta yuvasından istenen malzeme yuvasına (9 yuvanın herhangi biri) ya da eşya yuvasına
    let sur = null, surukledi = false;
    L.el.addEventListener('pointerdown', (ev) => {
      const a = ev.target.closest('.ors-yuva[data-cs]'); if (!a || mesgul || ev.button !== 0) return;
      const sl = Number(a.dataset.cs); if (!bag().get(sl) || kullanilan(sl)) return;
      sur = { sl, x: ev.clientX, y: ev.clientY, g: null }; surukledi = false;
    });
    addEventListener('pointermove', (ev) => {
      if (!sur) return;
      if (!sur.g && Math.hypot(ev.clientX - sur.x, ev.clientY - sur.y) > 5) {
        sur.g = document.createElement('div'); sur.g.className = 'ors-hayalet'; sur.g.innerHTML = iconHtml(bag().get(sur.sl).it, 40); document.body.append(sur.g);
      }
      if (sur.g) { sur.g.style.left = ev.clientX - 20 + 'px'; sur.g.style.top = ev.clientY - 20 + 'px'; }
    });
    addEventListener('pointerup', (ev) => {
      if (!sur) return; const d = sur; sur = null;
      if (!d.g) return;
      d.g.remove(); surukledi = true; setTimeout(() => (surukledi = false), 0);
      const h = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest?.('.ors-yuva')).find((x) => x && !x.dataset.cs);
      if (h && (h.dataset.m != null || h.dataset.id === 'a_upgrade')) koy(d.sl, h);
    });
    // tık: çantadan yuvaya / yuvadan çantaya
    L.el.addEventListener('click', (ev) => {
      if (mesgul || surukledi) return;
      const a = ev.target.closest('.ors-yuva'); if (!a) return;
      if (a.dataset.cs) { koy(Number(a.dataset.cs)); return; }
      if (a.dataset.m != null) { sec.mats[a.dataset.m] = null; degisti(); return; }
      if (a.dataset.id === 'a_upgrade') { sec.esya = null; degisti(); }
      if (a.dataset.id === 'a_result' && sec.sonuc != null) { sonucAl(); }
    });
    // sağ tık da KO'daki gibi koyar/geri alır
    L.el.addEventListener('contextmenu', (ev) => { const a = ev.target.closest('.ors-yuva'); if (a) a.click(); });
    // ana envanterden sürükle-bırak
    L.el.addEventListener('ko-esya-birak', (ev) => { const d = ev.detail || {}; if (d.slot >= 14 && d.slot <= 41) koy(d.slot, ev.target.closest?.('.ors-yuva')); });
    L.el.addEventListener('pointermove', (ev) => {
      const a = ev.target.closest('.ors-yuva'); if (!a) return ipucuKapat();
      const s = a.dataset.cs ? Number(a.dataset.cs) : a.dataset.m != null ? sec.mats[a.dataset.m] : a.dataset.id === 'a_upgrade' ? sec.esya : null;
      if (a.dataset.id === 'a_result') {
        if (sonucIt || sec.sonuc != null) { const e = sec.sonuc != null ? bag().get(sec.sonuc) : null; return ipucu(e ? tooltipHtml(e.it, { count: e.row.count }) + '<div class="ti-s">Almak için tıkla</div>' : tooltipHtml(sonucIt), ev); }
        if (onizleme) return ipucu(onizleme.it ? tooltipHtml(onizleme.it) : `<div class="ti-ad">${esc(onizleme.name)}</div>`, ev);
        return ipucuKapat();
      }
      const e = s != null && !(a.dataset.cs && kullanilan(s) && !((bag().get(s)?.row.count || 1) > 1 && sec.esya !== s)) ? bag().get(s) : null;
      if (!e) return ipucuKapat();
      const adet = a.dataset.cs ? (e.row.count || 1) - (sec.mats.includes(s) ? 1 : 0) : 1;
      ipucu(tooltipHtml(e.it, { count: adet }), ev);
    });
    L.el.addEventListener('pointerleave', ipucuKapat);
    return L;
  }

  function koy(slot, hedef = null) {
    const e = bag().get(slot); if (!e) return;
    if (sec.mats.includes(slot)) return hud.notice?.('This material has already been placed.', 'ors-uyari');
    if (kullanilan(slot)) return;
    const num = e.row.item_num;
    if (MALZEME.has(num)) {
      if (hedef?.dataset.id === 'a_upgrade') return hud.notice?.('Upgrade materials cannot be placed in the item slot.', 'ors-uyari');
      let i = hedef?.dataset.m != null ? Number(hedef.dataset.m) : sec.mats.indexOf(null);
      if (i < 0) return hud.notice?.('The material slots are full.', 'ors-uyari');
      sec.mats[i] = slot;
    } else {
      const it = e.it;
      if (Number(it.Countable) > 0 || !(Number(it.Damage) > 0 || Number(it.Ac) > 0)) return hud.notice?.('This item cannot be upgraded.', 'ors-uyari');
      if ([1, 2].includes(Number(it.ItemType))) return hud.notice?.('Rare and magic items cannot be upgraded.', 'ors-uyari');
      sonucAl(); sec.esya = slot;
    }
    degisti();
  }

  function sonucAl() { if (sec.sonuc == null) return; sec.sonuc = null; sonucIt = null; ipucuKapat(); ciz(); }
  const yuvaCiz = (el, it, soluk = false) => { if (!el) return; el.innerHTML = it ? iconHtml(it, el.offsetWidth || 43) : ''; el.classList.toggle('ors-soluk', !!soluk); };
  function ciz() {
    const L = pen; if (!L) return;
    const b = bag();
    for (let i = 0; i < 28; i++) {
      const s = 14 + i, e = b.get(s), a = L.get('a_slot_' + i);
      // yığın (ör. 50 parşömen): malzeme yuvasına 1 adet geçer, kalan çantada görünür
      const kalan = e ? (e.row.count || 1) - (sec.mats.includes(s) ? 1 : 0) : 0;
      const gizli = !e || sec.esya === s || sec.sonuc === s || kalan <= 0;
      yuvaCiz(a, gizli ? null : e.it);
      L.text('s_count_' + i, !gizli && Number(e.it.Countable) > 0 && kalan > 1 ? String(kalan) : '');
    }
    yuvaCiz(L.get('a_upgrade'), sec.esya != null ? b.get(sec.esya)?.it : null);
    for (let i = 0; i < 9; i++) yuvaCiz(L.get('a_m_' + i), sec.mats[i] != null ? b.get(sec.mats[i])?.it : null);
    if (sec.sonuc != null && !b.get(sec.sonuc)) { sec.sonuc = null; sonucIt = null; }
    const sonucE = sec.sonuc != null ? b.get(sec.sonuc)?.it : null;
    yuvaCiz(L.get('a_result'), sonucE || sonucIt || onizleme?.it || null, !sonucE && !sonucIt && !!onizleme?.it);
    L.text('text_gold', noah(gold));
  }
  let onT = 0;
  function degisti() {
    // çantada artık olmayan seçimleri temizle
    const b = bag();
    if (sec.esya != null && !b.get(sec.esya)) sec.esya = null;
    sec.mats = sec.mats.map((s) => (s != null && b.get(s) ? s : null));
    onizleme = null; ciz();   // önizleme yalnız "Önizleme" düğmesiyle (animasyonlu) gösterilir
  }
  let sonKonum = 0;
  const konumYaz = async () => { if (performance.now() - sonKonum < 1500) return; sonKonum = performance.now(); const p = player.position; try { await sb.from('characters').update({ x: p.x, y: p.y, z: p.z }).eq('id', character.id); } catch {} };
  const matlar = () => sec.mats.filter((s) => s != null);
  async function onizle(yaz) {
    if (sec.esya == null || !matlar().length) { if (yaz) hud.notice?.('Place the item to upgrade and the scroll in the slots.', 'ors-uyari'); return; }
    const imza = sec.esya + ':' + matlar().join(',');
    await konumYaz();
    const { data, error } = await sb.rpc('ors_yukselt', { p_char: character.id, p_slot: sec.esya, p_mats: matlar(), p_onizle: true });
    if (imza !== sec.esya + ':' + matlar().join(',') || pen?.el.hidden) return;
    if (error || !data?.ok) { onizleme = null; ciz(); if (yaz) { const m = error?.message || data?.reason; hud.notice?.(m, /(Beta eşyalarına|Kiralık eşyalara) \+ basılamaz/.test(String(m)) ? 'ors-kirmizi' : 'ors-uyari'); } return; }
    const pit = await esyaAl(data.num);
    // KO: önizleme de güçlendirme animasyonuyla gelir (yalnız sonuç yuvasında soluk gösterilir, eşya değişmez)
    mesgul = true; pen.el.classList.add('ors-mesgul'); onizleme = null; sec.sonuc = null; sonucIt = null; ciz();
    try { await animasyon(); } finally { mesgul = false; pen?.el.classList.remove('ors-mesgul'); }
    if (imza !== sec.esya + ':' + matlar().join(',') || pen?.el.hidden) return;
    onizleme = { ...data, it: pit }; ciz();
    if (yaz) hud.info?.(`Preview: ${data.name}${data.elem ? ` · poison damage +${data.zehir}` : ''} (success rate ${data.sans}%)`, 'ors');
  }
  function onayla() {
    if (mesgul) return;
    if (sec.esya == null || !matlar().length) return hud.notice?.('Place the item to upgrade and the scroll in the slots.', 'ors-uyari');
    const e = bag().get(sec.esya); if (!e) return;
    const soru = `Upgrade ${e.it.strName}?\nThe item might be destroyed while performing the upgrade. Will you continue?`;
    const git = () => yukselt();
    if (hud.soru?.('Upgrade Item', soru, git) === false) { if (confirm(soru)) git(); }
  }
  // KO ilerleme animasyonu: çizgi yükseltme yuvasından malzemelere, oradan sonuç yuvasına ilerler (31 kare)
  function animasyon() {
    return new Promise((res) => {
      const L = pen, kareler = []; for (let i = 0; i < 31; i++) { const k = L.get('group_img_load_' + i); if (k) kareler.push(k); }
      if (!kareler.length) return setTimeout(res, 800);
      L.show('group_fx', true); kareler.forEach((k) => (k.hidden = true));
      // 72 ms/kare (önceki 60 ms'den %20 yavaş); sondaki "?" bölümü (kare 18-28) tüm kareleriyle, kare başı %30 daha uzun (94 ms)
      const KARE = 72, SORU = Math.round(KARE * 1.3);
      let i = 0, onceki = null;
      const adim = () => {
        if (onceki) onceki.hidden = true;
        if (i >= kareler.length) { L.show('group_fx', false); res(); return; }
        onceki = kareler[i]; onceki.hidden = false;
        const sure = i >= 18 && i <= 28 ? SORU : KARE; i++;
        setTimeout(adim, sure);
      };
      adim();
    });
  }
  async function yukselt() {
    sonucAl(); mesgul = true; pen.el.classList.add('ors-mesgul');
    try {
      await konumYaz();
      const it0 = state.inv?.items?.get(sec.esya)?.it || null;   // (3.11) yanma yazısında eşya adı kendi renginde
      const { data, error } = await sb.rpc('ors_yukselt', { p_char: character.id, p_slot: sec.esya, p_mats: matlar(), p_onizle: false });
      if (error || !data?.ok) { { const m = error?.message || data?.reason || 'Cannot perform item upgrade.'; hud.notice?.(m, /(Beta eşyalarına|Kiralık eşyalara) \+ basılamaz/.test(String(m)) ? 'ors-kirmizi' : 'ors-uyari'); } return; }
      await animasyon();
      // KO örs efekti örsün üstünde: geçme 10101 item_success.fxb, yanma 10100 item_fail.fxb
      state.efekt?.(data.basari ? 10101 : 10100, { x: ORS.x, y: ORS.y, z: ORS.z });
      state.net?.fx?.({ k: 'ors', id: data.basari ? 10101 : 10100, x: ORS.x, y: ORS.y, z: ORS.z });   // (4.11) bölgedeki tüm oyuncular da görür
      if (data.gold != null) gold = data.gold;
      if (data.basari) {
        sonucIt = await esyaAl(data.num);
        hud.info?.(`Item upgrade succeeded: ${data.eski} → ${data.name}`, 'ors');
      } else {
        sonucIt = null;
        const adP = [String(data.name ?? ''), nameColor(it0)];
        hud.info?.(data.korundu ? ['Item upgrade failed: Tears of Karivdis protected ', adP, '.'] : ['Item upgrade failed: ', adP, ' was destroyed.'], 'ors-yok');   // başarısızlık her zaman kırmızı
      }
      // işlem bitince yuvalar boşalır; başarılı eşya sonuç yuvasında kalır (tıklayınca ya da pencere kapanınca çantaya geçer)
      sec.sonuc = data.basari ? sec.esya : null;
      sec.esya = null; sec.mats.fill(null); onizleme = null; ciz();
      await state.inv?.reload?.();
      ciz();
    } finally { mesgul = false; pen?.el.classList.remove('ors-mesgul'); }
  }
  async function acPencere() {
    await (META_P ||= loadMeta().catch(() => {}));
    if (!hasLayout('re_itemupgrade')) return hud.notice?.('Could not load the upgrade interface.', 'ors-uyari');
    pen ||= kur();
    envanterKapat();
    sec.sonuc = null; sec.esya = null; sec.mats.fill(null); onizleme = null; sonucIt = null;
    ciz();   // önce boş (temiz) hâl, sonra veriler paralel gelir
    pen.el.hidden = false; pen.el.style.zIndex = 60; pen.el.classList.add('ors-sabit'); pen.el.style.left = ''; pen.el.style.top = '';
    const [g] = await Promise.all([sb.from('characters').select('gold').eq('id', character.id).maybeSingle(), state.inv?.reload?.()]);
    gold = g?.data?.gold ?? gold;
    ciz();
  }
  function kapat() {
    if (pen) { sec.sonuc = null; sec.esya = null; sec.mats.fill(null); onizleme = null; sonucIt = null; clearTimeout(onT); ciz(); pen.el.hidden = true; }
    ipucuKapat(); if (menu) menu.el.hidden = true;
  }
  const acik = () => (pen && !pen.el.hidden) || (menu && !menu.el.hidden);
  addEventListener('keydown', (e) => { if (e.code === 'KeyI' && acik() && e.target.tagName !== 'INPUT') { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  // görev çubuğundaki envanter düğmesi de örs açıkken çalışmaz
  addEventListener('click', (e) => { if (acik() && e.target.closest?.('[data-id="btn_06"]')) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && ((pen && !pen.el.hidden) || (menu && !menu.el.hidden)) && !mesgul) kapat(); });
  // pencere dışına (dünyaya, başka bir NPC'ye ya da başka bir arayüze) tıklanınca örs penceresi / menüsü kapanır.
  // Onay kutusu (Evet / Hayır), ipucu ve güçlendirme sürerken (animasyon) kapanmaz.
  addEventListener('pointerdown', (e) => {
    if (!acik() || mesgul) return;
    const t = e.target; if (!(t instanceof Element)) return;
    if (pen?.el.contains(t) || menu?.el.contains(t) || t.closest('.ko-ipucu, .ors-hayalet')) return;
    const kok = t.closest('.kui-root'); if (kok && kok.querySelector('[data-id="Btn_Yes"], [data-id="Btn_Ok"]')) return;   // KO mesaj kutusu
    kapat();
  }, true);

  return { click, update, acMenu, acPencere, kapat };
}
