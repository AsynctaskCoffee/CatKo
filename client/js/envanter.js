// Envanter (I): KO re_inventory yuvalarında eşyalar. Yuva 0-13 donanım (area_wepone 3x5), 14-41 çanta (7x4).
// Sürükle-bırak → inv_move (kuşanma kuralları sunucuda), üzerine gelince KO ipucu, Realtime ile güncellenir.
import { DONUSUM_ESYA } from './donusum.js';
import { sesUi } from './ses.js';
// çöp kutusu aç/kapa (tarayıcıda saklanır; varsayılan açık)
const copAcik = () => { try { return localStorage.getItem('ko-cop-kapali') !== '1'; } catch { return true; } };
// (3.11) KO envanter içi onay kutusu (re_inventory base_inven_notice): metin + Confirm / Cancel; envanterin ortasında, KO konumunda
let onayBekleyen = null;
function invOnay(root, metin) {
  const b = root?.querySelector('[data-id="base_inven_notice"]'); if (!b) return Promise.resolve(window.confirm(metin));
  if (onayBekleyen) onayBekleyen(false);
  const t = b.querySelector('[data-id="string_inven_notice"]'); if (t) t.textContent = metin;
  b.hidden = false; b.style.display = ''; b.style.pointerEvents = 'auto'; b.style.zIndex = '30';
  return new Promise((res) => {
    const bitir = (v) => { onayBekleyen = null; b.hidden = true; res(v); };
    onayBekleyen = bitir;
    const bag = (id, v) => { const x = b.querySelector(`[data-id="${id}"]`); if (!x) return; x.classList.add('kui-tik', 'inv-onay-dug'); x.dataset.metin = v ? 'Confirm' : 'Cancel'; x.style.pointerEvents = 'auto';
      x.onpointerdown = (e) => { e.stopPropagation(); e.preventDefault(); }; x.onclick = (e) => { e.stopPropagation(); e.preventDefault(); sesUi('tik'); bitir(v); }; };
    bag('btn_inven_notice_ok', true); bag('btn_inven_notice_cancel', false);
  });
}
// KO çöp kilidi (btn_trashlock, çöp sepetinin sağ üstü): işaretli (✔) = çöp kilitli (eşya atılamaz), boş = açık
function copTik(cop, root) {
  const btn = root?.querySelector('[data-id="btn_trashlock"]'); if (!btn || btn.dataset.bagli) return;
  btn.dataset.bagli = '1'; btn.style.pointerEvents = 'auto'; btn.style.cursor = 'pointer'; btn.style.zIndex = '5';
  const ciz = () => {
    const a = copAcik(); cop.classList.toggle('kapali', !a);
    root.querySelector('[data-id="img_TrashLock"]')?.classList.toggle('cop-acik', a);   // çöp açıkken kapağı açık çöp kutusu simgesi
    for (const im of btn.children) im.style.display = im.classList.contains(a ? 'st0' : 'st1') ? 'block' : 'none';   // tik = kilitli
    btn.title = a ? 'Çöp kutusu açık (kilitlemek için tıkla)' : 'Çöp kutusu kilitli (açmak için tiki kaldır)';
  };
  btn.addEventListener('pointerdown', async (e) => {
    e.stopPropagation(); e.preventDefault(); sesUi('tik');
    // (3.11) KO: çöpü kapatırken (kilitlerken) onay sorulur
    if (copAcik() && !(await invOnay(root, 'Do you want to close the trashbin?'))) return;
    try { localStorage.setItem('ko-cop-kapali', copAcik() ? '1' : '0'); } catch {} ciz();
  });
  btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); });
  ciz();
}
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
import { loadMeta, loadDesc, iconHtml, tooltipHtml, fromDb, sureMetni, hakli, kiyasBul, ctrlIzle, kusaniliSetAyarla } from './esya.js';

const KOS_AD = { 91: 'Talisman', 92: 'Emblem', 52: 'Magic Bag (1. çanta)', 53: 'Magic Bag (2. çanta)', 78: 'Magic Bag (3. çanta)', 42: 'Kostüm kask', 43: 'Kostüm omuzluk', 44: 'Kostüm alt', 45: 'Kostüm eldiven', 46: 'Kostüm çizme', 47: 'Kanat', 48: 'Peri', 49: 'Dövme', 50: 'Pathos eldiveni (sol el)', 51: 'Pathos eldiveni (sağ el)' };
export const kusanili = (s) => s <= 13 || (s >= 42 && s <= 53) || s === 78 || s === 91 || s === 92;   // 91 tılsım, 92 amblem (KO kostüm paneli alt satır sol / sağ)   // 52/53/78 Magic Bag yuvaları; 54–65 / 66–77 / 79–90 çanta içleri (kuşanılı değil)
// KO: element hasarı ≥ 64 ya da eşsiz (ItemType 4) ve > 0 → silah efekti
// KO: eşsiz (ItemType 4) silahlar yalnız +6 ve üstünde parlar; Scorpion Bow +3'ten itibaren
export const essizParlar = (ad) => { const n = Number(/\(\+(\d+)\)/.exec(ad || '')?.[1] || 0); return n >= (/scorpion bow/i.test(ad || '') ? 3 : 6); };
const elementOf = (it) => { const u = Number(it.ItemType) === 4; if (u && !essizParlar(it.strName)) return 0; const ok = (v) => (v = Number(v) || 0) >= 64 || (u && v > 0);
  return ok(it.FireDamage) ? 1 : ok(it.IceDamage) ? 2 : ok(it.LightningDamage) ? 3 : ok(it.PoisonDamage) ? 4 : 0; };
// kuşanılı eşya listesi (karakter modeli için) — envanter penceresi kurulmadan önce de kullanılır
// BETA eşyası (KaynakNum): model / efekt kaynak eşyanın numarasıyla
const girisOf = (slot, row, it) => ({ slot, org: it.org, num: Number(it.KaynakNum) || row.item_num, el: elementOf(it), sonuk: Number(it.ItemType) === 4 && !essizParlar(it.strName), res: it.ModelRes || 0, efekt: it.Efekt ?? null, reb: rebOf(it), toz: tozOf(row, it) });
// reb parlaklığı: yalnız rebirth eşyası (ItemType 12), kendi (+N) seviyesiyle
function rebOf(it) { const n = Number(/\(\+(\d+)\)/.exec(it?.strName || '')?.[1] || 0); return [11, 12].includes(Number(it?.ItemType)) ? n : 0; }
// KO CPlayerBase::DurabilitySet: dayanıklılık %70 ve altı → Misc\\Dust_Soft, %30 ve altı → Misc\\Dust_Hard (modelin dokusuyla çarpılır)
function tozOf(row, it) { const max = Number(it?.Duration) || 0, d = row?.durability; if (Number(it?.Countable) || max <= 1 || d == null) return 0; const y = Math.floor(Number(d) * 100 / max); return y <= 30 ? 2 : y <= 70 ? 1 : 0; }
export const kusanilanlar = (rows) => (rows || []).filter((r) => r.slot >= 0 && kusanili(r.slot)).map((r) => girisOf(r.slot, r, fromDb(r.items || {})));
export async function initInventory({ sb, character, hud, onStats, onEquip, onUse, onceden = null, gmMi = () => false, onDonusum = null, onPet = null }) {
  await loadMeta(); loadDesc().catch(() => {});
  const areas = new Map();   // yuva → alan öğesi
  let items = new Map();     // yuva → { row, it }
  let tip = null;

  function mapAreas() {
    const root = hud.invEl(); if (!root) return false;
    if (areas.size) return true;
    for (const a of root.querySelectorAll(':scope > .kui-ar')) {
      if (!/^\d+$/.test(a.dataset.id || '')) continue;
      const x = parseFloat(a.style.left), y = parseFloat(a.style.top);
      let slot = null;
      if (x >= 420 && y < 360) { const col = Math.round((x - 425) / 52), row = Math.round((y - 100) / 52); const i = row * 3 + col; if (i >= 0 && i <= 13) slot = i; }
      else if (y >= 365 && y < 570) { const col = Math.round((x - 236) / 49), row = Math.round((y - 373) / 49); if (col >= 0 && col < 7 && row >= 0 && row < 4) slot = 14 + row * 7 + col; }
      if (slot == null || areas.has(slot)) continue;
      a.classList.add('inv-yuva'); a.dataset.slot = slot; a.style.pointerEvents = 'auto';
      areas.set(slot, a);
    }
    // kostüm bölümü (base_cos): KO kostüm yuvaları → 42 kask, 43 omuzluk, 44 alt, 45 eldiven, 46 çizme, 47 kanat, 48 peri, 49 dövme
    const cos = root.querySelector('[data-id="base_cos"]');
    // deadsoft yerleşimi (2 Magic Bag) + orijinal KO yerleşimi (3x3 kostüm: dövme, kask, peri / pathos sol, kostüm, pathos sağ / tılsım, kanat, amblem;
    // altında base_magicbag içinde 3 Magic Bag yuvası 52 / 53 / 78)
    const COS = { '81,25': 42, '81,77': 43, '81,129': 47, '29,77': 50, '57,206': 52, '111,206': 53, '133,25': 48, '133,77': 51,
      '33,82': 49, '91,82': 42, '151,82': 48, '33,141': 50, '91,141': 43, '151,141': 51, '91,200': 47, '33,200': 91, '151,200': 92, '7,8': 52, '65,8': 53, '125,8': 78 };   // base_magicbag (26,252) içindeki yuvalar üst öğeye göre
    if (cos) for (const a of cos.querySelectorAll('.kui-ar')) {
      const slot = COS[`${parseFloat(a.style.left)},${parseFloat(a.style.top)}`]; if (slot == null || areas.has(slot)) continue;
      a.classList.add('inv-yuva'); a.dataset.slot = slot; a.style.pointerEvents = 'auto'; a.title = KOS_AD[slot];
      areas.set(slot, a);
    }
    // KO Magic Bag: çanta sekmeleri (btn_bag1-3) seçili çantanın (52 / 53 / 78) içini gösterir;
    // altındaki 3x4 alan seçili çantanın 12 yuvası (54–65 / 66–77 / 79–90). Çanta yoksa alan img_hide ile kapalı.
    if (cos && !mbag.alanlar.length) {
      mbag.alanlar = [...cos.querySelectorAll(':scope > .kui-ar')].filter((a) => parseFloat(a.style.top) >= 290 && /^\d+$/.test(a.dataset.id || ''))
        .sort((x, y) => parseFloat(x.style.top) - parseFloat(y.style.top) || parseFloat(x.style.left) - parseFloat(y.style.left));
      mbag.ort = cos.querySelector('[data-id="img_hide"]');
      [['btn_bag1', 1], ['btn_bag2', 2], ['btn_bag3', 3]].forEach(([id, n]) => {
        const b = cos.querySelector(`[data-id="${id}"]`); if (!b) return;
        b.style.pointerEvents = 'auto'; b.classList.add('mbag-sekme'); b.dataset.mbag = n; b.title = `${n}. Magic Bag'in yuvalarını göster`;
        b.addEventListener('click', (e) => { e.stopPropagation(); mbag.sekme = n; mbagBagla(); render(); });
      });
      mbagBagla();
    }
    // KO: büyüteç (Btn_search) → "Search Item" kutusu; çantada adı aranan eşyalar parlar, diğerleri soluklaşır (boş arama = temizle)
    const bz = root.querySelector('[data-id="Btn_search"]');
    if (bz && !bz.dataset.bagli) { bz.dataset.bagli = '1'; bz.style.pointerEvents = 'auto'; bz.classList.add('kui-tik'); bz.title = 'Search Item';
      bz.addEventListener('click', (e) => { e.stopPropagation(); hud.girdi?.('Search Item', 'Enter search terms', { max: 30, deger: arama, evet: 'Confirm', hayir: 'Cancel' }, (t) => {
        arama = t; render(); if (!t) return;
        const n = [...items.entries()].filter(([sl, x]) => sl >= 14 && aramaUyar(x)).length;
        hud.info?.(n ? `${n} item(s) found for "${t}".` : `No item matching "${t}" was found.`, n ? 'gorev' : 'hata');
      }); }); }
    // KO: Noah'ın yanındaki "eşyaları düzenle" düğmesi (btn_item_arrangement) — çanta 14-41 sunucuda sıralanır (inv_sirala)
    const dz = root.querySelector('[data-id="btn_item_arrangement"]');
    if (dz && !dz.dataset.bagli) { dz.dataset.bagli = '1'; dz.style.pointerEvents = 'auto'; dz.classList.add('kui-tik'); dz.title = 'Eşyaları otomatik düzenle'; dz.addEventListener('click', async (e) => { e.stopPropagation(); if (await invOnay(root, 'Do you want to arrange it?')) duzenle(); }); }   // (3.11) KO onay kutusu
    const cop = root.querySelector('[data-id="area_samma"]'); if (cop) { cop.style.pointerEvents = 'auto'; cop.classList.add('inv-cop'); cop.title = 'Çöp sepeti: eşyayı buraya sürükle'; copTik(cop, root); }
    return areas.size > 0;
  }
  // seçili Magic Bag sekmesinin 12 alanını yuva numaralarına bağla
  const mbag = { alanlar: [], sekme: 1, ort: null };
  function mbagBagla() {
    for (let s2 = 54; s2 <= 90; s2++) if (s2 !== 78) areas.delete(s2);
    const taban = { 1: 54, 2: 66, 3: 79 }[mbag.sekme] || 54;
    mbag.alanlar.forEach((a, i) => { a.classList.add('inv-yuva'); a.dataset.slot = taban + i; a.style.pointerEvents = 'auto'; areas.set(taban + i, a); });
  }
  let arama = '';
  const aramaUyar = (x) => !!arama && String(x?.it?.strName || '').toLowerCase().includes(arama.toLowerCase());
  function render() {
    kusaniliSetAyarla([...items].filter(([s]) => s >= 0 && s <= 13).map(([, e]) => e.it?.org));   // (5.11) set parçaları (ipucu: takılı sarı / eksik gri)
    if (!mapAreas()) return;
    { const cs = { 1: 52, 2: 53, 3: 78 }[mbag.sekme] || 52, e = items.get(cs), acik = !!e && !(e.row.bitis && new Date(e.row.bitis).getTime() <= Date.now());
      if (mbag.ort) mbag.ort.style.display = acik ? 'none' : '';
      for (const a of mbag.alanlar) a.style.visibility = acik ? '' : 'hidden';
      document.querySelectorAll('.mbag-sekme').forEach((b) => b.classList.toggle('mbag-secili', Number(b.dataset.mbag) === mbag.sekme)); }
    for (const [slot, a] of areas) {
      const e = items.get(slot);
      const sz = Math.max(30, Math.floor(Math.min(parseFloat(a.style.width) || a.clientWidth || 45, parseFloat(a.style.height) || a.clientHeight || 45)) - 1);
      a.innerHTML = e ? `<div class="inv-esya" data-slot="${slot}">${iconHtml(e.it, sz)}${e.row.kilit ? '<i class="inv-kilit" title="[Locked]"></i>' : ''}${(() => { const n = hakli(e.it) ? Number(e.row.durability ?? e.it.Duration) : e.row.count; return n > 1 ? `<b class="inv-adet">${n}</b>` : ''; })()}</div>` : '';
      a.classList.toggle('inv-bulundu', !!arama && slot >= 14 && aramaUyar(e)); a.classList.toggle('inv-soluk', !!arama && slot >= 14 && !!e && !aramaUyar(e));
    }
  }
  async function load() {
    const ilk = onceden; onceden = null;   // oyuna girişte önceden çekilen satırlar (bir kez)
    let yan = ilk ? await ilk : null;
    if (!yan || yan.error) yan = await sb.from('inventory').select('slot,item_num,count,durability,sure_sn,bitis,kiralik,kilit:kilit_hash,items(*)').eq('char_id', character.id);
    const { data, error } = yan;
    if (error) { console.warn('envanter', error.message); return; }
    items = new Map((data || []).filter((r) => r.slot >= 0).map((r) => [r.slot, { row: r, it: fromDb(r.items || {}) }]));
    // (2.11) kuşanılanlar değişmediyse karakter modeli yeniden giydirilmez (depo / ticaret işlemlerinde takılma olmasın)
    const imza = [...items].filter(([sl]) => kusanili(sl)).map(([sl, e]) => `${sl}:${e.row.item_num}:${e.row.durability > 0 ? 1 : 0}`).sort().join('|');
    render(); if (imza !== giyimImza) { giyimImza = imza; equip(); }
  }
  let giyimImza = null;
  // kuşanılanlar (yuva 0-13) → karakter modeli
  const equip = () => onEquip?.([...items].filter(([s]) => kusanili(s)).map(([slot, e]) => girisOf(slot, e.row, e.it)));
  async function stats() {
    const { data } = await sb.rpc('char_stats', { p_char: character.id });
    if (data) { hud.setCharStats(data); onStats?.(data); }
    return data;
  }

  // ipucu
  let tipSon = null;   // son ipucu (yuva + fare konumu): dayanıklılık değişince anında yeniden çizilir
  // (5.11) KO karşılaştırma: çantadaki silah / zırhın kuşanılmış aynı türden (Kind) karşılığı — Ctrl basılıyken solunda "Equipment" ipucu
  let tip2 = null, ctrl = false;
  const karsilik = (slot, e) => (kusanili(slot) ? null : kiyasBul(e.it, items));   // KO: silah → eldeki silah, zırh → aynı parça
  const showTip = (slot, ev) => {
    tipSon = { slot, ev: { clientX: ev.clientX, clientY: ev.clientY } };
    const e = items.get(slot); if (!e) return hideTip();
    tip ||= Object.assign(document.createElement('div'), { id: 'ko-ipucu-yuzen', className: 'ko-ipucu' });
    if (!tip.isConnected) document.body.append(tip);
    const q = karsilik(slot, e), kiy = q && ctrl;
    tip.innerHTML = tooltipHtml(e.it, { count: e.row.count, sure: e.row, yer: kusanili(slot) ? 'Equipment' : 'Inventory', kiyas: kiy ? q.it : null, kiyasNot: !!q }) + (window.__koTamir ? tamirSatir(e) : '');   // (5.11) KO başlığı
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = Math.min(innerWidth - w - 8, ev.clientX + 16);
    if (kiy) {
      tip2 ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu ko-ipucu-kiyas' });
      if (!tip2.isConnected) document.body.append(tip2);
      tip2.innerHTML = tooltipHtml(q.it, { count: q.row.count, sure: q.row, yer: 'Equipment' });
      const w2 = tip2.getBoundingClientRect().width; x = Math.max(8 + w2, x);   // ana ipucu sağda, karşılaştırılan hemen bitişiğinde (aşağıda gerçek konuma göre yeniden)
    } else tip2?.remove();
    tip.style.left = x + 'px';
    tip.style.top = Math.max(8, Math.min(innerHeight - h - 8, ev.clientY - 10)) + 'px';
    if (kiy && tip2) { const r = tip.getBoundingClientRect(), r2 = tip2.getBoundingClientRect(); tip2.style.left = Math.max(4, r.left - r2.width) + 'px'; tip2.style.top = r.top + 'px'; }   // (5.11) bitişik, üst kenarı hizalı
  };
  const hideTip = () => { tip?.remove(); tip2?.remove(); tipSon = null; };
  const ctrlDegis = (on) => { if (ctrl === on) return; ctrl = on; if (tipSon && tip?.isConnected) showTip(tipSon.slot, tipSon.ev); };
  ctrlIzle(ctrlDegis);
  const tipYenile = () => { if (tipSon && tip?.isConnected) showTip(tipSon.slot, tipSon.ev); };
  // RPR modunda ipucunun en altında tamir ücreti (sunucu npc_repair_slot ile aynı hesap)
  const tamirSatir = (e) => {
    const max = Number(e.it?.Duration) || 0, dur = e.row?.durability;
    if (Number(e.it?.Countable) || max <= 1 || dur == null) return '<div class="ti-tamir yok">Bu eşya tamir edilemez.</div>';
    if (Number(dur) >= max) return '<div class="ti-tamir yok">Dayanıklılık tam — tamir gerekmez.</div>';
    const ucret = Math.ceil((max - Number(dur)) * Math.max(Number(e.it?.BuyPrice) || 0, 1) / Math.max(max, 1) / 10);
    return `<div class="ti-tamir">Tamir ücreti: ${ucret.toLocaleString('tr-TR')} Noah</div>`;
  };

  // sürükle-bırak (fare/dokunmatik)
  let drag = null, sessiz = 0;
  // (7.11) dokunmatik (tablet): bir dokunuş → eşya bilgi penceresi (yeniden dokununca kapanır), basılı tutup sürükleme → taşıma,
  //   kıpırdamadan basılı tutma (0,55 sn) → sağ tık (kuşan / çıkar / kullan)
  let dokun = null, uzunT = 0;
  function onDown(ev) {
    const it = ev.target.closest?.('.inv-esya');
    if (ev.pointerType === 'touch' && !it && tip?.isConnected && !ev.target.closest?.('.ko-ipucu')) hideTip();   // boş yere dokununca bilgi kapanır
    if (window.__koTamir) return;   // RPR (tamir) modunda sürükleme yok: tıklama tamir eder (ticaret.js)
    if (!it || ev.button !== 0 || it.closest('.ko-drop')) return;   // sandık penceresindeki eşyalar loot.js'te sürüklenir
    ev.stopPropagation(); ev.preventDefault();
    const slot = Number(it.dataset.slot);
    if (ev.pointerType === 'touch') {
      clearTimeout(uzunT);
      dokun = { slot, el: it, x: ev.clientX, y: ev.clientY, id: ev.pointerId, acik: tipSon?.slot === slot && tip?.isConnected };
      uzunT = setTimeout(() => { const d = dokun; if (!d || drag) return; dokun = null; hideTip(); navigator.vibrate?.(15);
        d.el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: d.x, clientY: d.y, button: 2 })); }, 550);
      return;
    }
    dragBasla(slot, it, ev);
  }
  function dragBasla(slot, it, ev) {
    const ghost = it.cloneNode(true); ghost.className = 'inv-esya inv-hayalet'; document.body.append(ghost);
    drag = { slot, ghost, el: it, moved: false };
    it.classList.add('inv-surukleniyor'); hideTip();
    moveGhost(ev);
  }
  const moveGhost = (ev) => { if (!drag) return; drag.moved = true; drag.ghost.style.left = ev.clientX - 22 + 'px'; drag.ghost.style.top = ev.clientY - 22 + 'px'; };
  async function onUp(ev) {
    if (dokun && ev.pointerId === dokun.id) {   // dokunuş (sürüklenmedi): bilgi penceresi aç / kapat
      const d = dokun; dokun = null; clearTimeout(uzunT);
      if (d.acik) hideTip(); else if (d.el.isConnected) showTip(d.slot, { clientX: d.x + 24, clientY: d.y });
      ev.stopPropagation(); return;
    }
    if (!drag) return;
    const d = drag; drag = null;
    d.ghost.remove(); d.el.classList.remove('inv-surukleniyor');
    const hit = document.elementFromPoint(ev.clientX, ev.clientY);
    // çanta dışındaki bırakma hedefleri (ör. GM mob editörü → düşen eşyalar)
    const hedef = hit?.closest?.('[data-esya-birak]') || document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest?.('[data-esya-birak]')).find(Boolean);
    if (hedef) { const e = items.get(d.slot); if (e) hedef.dispatchEvent(new CustomEvent('ko-esya-birak', { bubbles: true, detail: { num: e.row.item_num, name: e.it.strName, it: e.it, slot: d.slot, count: e.row.count, row: e.row, x: ev.clientX, y: ev.clientY }, bubbles: true })); return; }
    // çöp sepeti (area_samma): sorup yok eder (sağ üstteki tik kaldırılırsa kapalı: yanlışlıkla eşya silinmez)
    if (hit?.closest?.('[data-id="area_samma"]') && !copAcik()) { hud.notice?.('The trash can is locked. Uncheck the box at its top right to destroy items.', 'hata'); return; }
    if (hit?.closest?.('[data-id="area_samma"]')) {
      const e = items.get(d.slot); if (!e) return;
      const ok = hud.soru?.('Destroy Item', `Do you want to destroy ${e.it.strName}${e.row.count > 1 ? ` (${e.row.count})` : ''}?\nA destroyed item cannot be recovered.`, async () => {
        items.delete(d.slot); render(); if (kusanili(d.slot)) equip();
        sessiz = performance.now() + 2500;
        const { data, error } = await sb.rpc('inv_destroy', { p_char: character.id, p_slot: d.slot });
        if (error) { hud.notice?.(error.message, 'hata'); await load(); return; }
        hud.info?.(`${e.it.strName} has been destroyed.`, 'hata');
        if (data) { hud.setCharStats(data); onStats?.(data); }
      });
      if (!ok) hud.notice?.('Could not open the confirmation window.', 'hata');
      return;
    }
    const under = hit?.closest?.('.inv-yuva');
    if (!under) return;
    const to = Number(under.dataset.slot);
    if (to === d.slot) return;
    await tasi(d.slot, to);
  }
  let duzenleniyor = false;
  async function duzenle() {
    if (duzenleniyor) return; duzenleniyor = true; sessiz = performance.now() + 2500;
    try {
      const { data, error } = await sb.rpc('inv_sirala', { p_char: character.id });
      if (error) { hud.notice?.(error.message, 'hata'); return; }
      await load(); if (data) { hud.setCharStats(data); onStats?.(data); }
    } finally { duzenleniyor = false; }
  }
  addEventListener('ko-envanter-yenile', () => load());
  setInterval(() => {
    let bitti = false;
    for (const [slot, e] of items) if (e.row.bitis && new Date(e.row.bitis).getTime() <= Date.now()) {
      items.delete(slot); bitti = true; hud.info?.(`${e.it.strName} has expired and was deleted.`, 'hata');
    }
    if (bitti) { render(); equip(); setTimeout(() => { load(); stats(); }, 65000); }
  }, 15000);
  async function tasi(from, to) {
    if (globalThis.koTakasAcik) { hud?.notice?.('You cannot move items while trading.', 'hata'); return; }   // (3.11) takas sırasında çantada yer değiştirme kapalı
    // iyimser: hemen yer değiştir, sunucu reddederse geri yükle
    const a = items.get(from), b = items.get(to);
    if (a) sesUi(Number(a.it?.Damage) > 0 ? 'silah' : kusanili(from) || kusanili(to) ? 'zirh' : 'buton');   // KO: eşya bırakma sesi (silah / zırh / diğer)
    // (3.11) kuşanma: sunucu onayı beklenir (statü / seviye yetmeyen eşya hiç giyilmez, karakterde takılı görünmez); çanta içi taşıma iyimser
    const kusanma = kusanili(from) || kusanili(to);
    if (!kusanma) { items.delete(from); items.delete(to); if (a) items.set(to, a); if (b) items.set(from, b); render(); }
    sessiz = performance.now() + 2500;
    const { data, error } = await sb.rpc('inv_move', { p_char: character.id, p_from: from, p_to: to });
    if (kusanma && !error) { items.delete(from); items.delete(to); if (a) items.set(to, a); if (b) items.set(from, b); render(); equip(); }
    // KO süreli eşya: ilk kuşanışta onay → süre başlar ve bir daha durmaz
    if (error && /^SURE_ONAY:(\d+)/.test(error.message || '')) {
      const ss = Number(/^SURE_ONAY:(\d+)/.exec(error.message)[1]);
      await load();
      const e = items.get(ss); const sn = Number(e?.row?.sure_sn) || 0;
      hud.soru?.('Timed Item', `${e?.it?.strName || 'This item'} is a timed item (${sureMetni(sn)}).\nDo you want to equip it and start its timer?\nOnce started, the timer cannot be stopped.`, async () => {
        const { data: d, error: er } = await sb.rpc('sure_baslat', { p_char: character.id, p_slot: ss });
        if (er || !d?.ok) { hud.notice?.(er?.message || d?.mesaj || 'Could not start the timer.', 'hata'); return; }
        const r = items.get(ss); if (r) r.row.bitis = d.bitis;
        hud.info?.(`${e?.it?.strName || 'Item'}: timer started (${sureMetni(sn)}).`, 'beceri');
        await tasi(from, to);
      });
      return;
    }
    if (error) { const m = /kuşanılamaz|yer değiştiremez/.test(error.message || '') ? 'You cannot equip this item. (Level / stat / class requirement)' : error.message; hud.info?.(m, 'hata'); await load(); equip(); return; }
    if (data) { hud.setCharStats(data); onStats?.(data); }
  }
  // tüketilen eşya (iksir, pirinç keki, parşömen): sunucu etkisini uygular, adet düşer
  const canManaIksiri = (it) => /^(holy water|water of |potion of (life|spirit|intelligence|sagacity|wisdom|soul)|premium potion (hp|mp))/i.test(String(it?.strName || '').trim());
  const MS_ESYA = new Set([900144023, 300144036, 300145037, 300145039]);   // Monster Stone (yetenek çubuğundan kullanılır)
  const IRK_ESYA = new Set([810096000, 800016000]);   // Nation Transfer → ulus değiştirme (irk-degistir.js)
  const kullanilir = (it) => IRK_ESYA.has(Number(it?.Num)) || DONUSUM_ESYA.has(Number(it?.Num)) || MS_ESYA.has(Number(it?.Num)) || Number(it?.Num) === 389191000 || ((Number(it?.Countable) > 0 || Number(it?.Kind) === 255) && Number(it?.Effect1) >= 490000);   // 255: premium iksir / 30'luk scroll (dayanıklılık = kullanım hakkı)
  const bekleyen = new Set();
  // Slave Merchant Scroll (deadsoft 751730000) / Merchant's Eye: tüm pazarların listesi (harcanmaz). Knight Cash sertifikaları: sağ tık → cash
  const PAZAR_GOZ = new Set([751730000, 810168000]);
  const MERCHANT_KUPON = new Set([810163000, 810167000]);
  const CASH_SERTIFIKA = new Set([700079000, 700082000, 700083000, 700084000, 700085000, 700086000, 700089000]);
  async function cashSertifika(slot) {
    if (bekleyen.has(slot)) return; bekleyen.add(slot);
    try {
      const { data: d, error } = await sb.rpc('cash_sertifika', { p_char: character.id, p_slot: slot });
      if (error) return hud.notice?.(error.message, 'hata');
      if (!d?.ok) return hud.notice?.(d?.reason || 'You cannot use the item.', 'hata');
      character.cash = d.cash; await load(); await stats();
      hud.info?.(`${fmt(d.miktar)} Knight Cash has been added to your account (total ${fmt(d.cash)} KC).`, 'drop');
      dispatchEvent(new CustomEvent('ko-cash', { detail: d.cash }));
    } finally { bekleyen.delete(slot); }
  }
  addEventListener('ko-cash', (e) => { if (e.detail != null) character.cash = e.detail; stats(); });   // karakter penceresindeki Cash
  const GENIE_ESYA = new Set([700091000, 700092000, 700093000, 700094000, 700095000, 700191000, 900560000, 810305000, 810306000, 810378000, 900772000, 810227000, 810935000, 900819000]);
  async function kullan(slot) {
    const e = items.get(slot); if (!e || bekleyen.has(slot)) return false;
    if (DONUSUM_ESYA.has(Number(e.row.item_num))) { onDonusum?.(Number(e.row.item_num)); return true; }
    if (IRK_ESYA.has(Number(e.row.item_num))) { dispatchEvent(new CustomEvent('ko-irk-degistir', { detail: { slot } })); return true; }
    if (MS_ESYA.has(Number(e.row.item_num))) { dispatchEvent(new CustomEvent('ko-monster-stone', { detail: { slot, num: Number(e.row.item_num) } })); return true; }
    if (PAZAR_GOZ.has(Number(e.row.item_num))) { dispatchEvent(new CustomEvent('ko-pazar-goz', { detail: { num: Number(e.row.item_num) } })); return true; }
    if (CASH_SERTIFIKA.has(Number(e.row.item_num))) { await cashSertifika(slot); return true; }
    if (onPet?.esyaMi?.(e.it)) { await onPet.kullan(slot, e.it); return true; }   // Familiar Summon (kısayol çubuğundan)   // KO: totem/parşömen → dönüşüm listesi
    bekleyen.add(slot); sessiz = performance.now() + 2500;
    try {
      const { data, error } = await sb.rpc('esya_kullan', { p_char: character.id, p_slot: slot });
      if (error) { hud.notice?.(error.message, 'hata'); return false; }
      if (!data?.ok) { hud.notice?.(data?.reason || 'You cannot use the item.', 'hata'); return false; }
      if (data.kalan > 0) { e.row.count = data.kalan; if (data.hak != null) e.row.durability = data.hak; } else items.delete(slot);
      if (data.hak != null) hud.info?.(`${data.ad}: ${data.hak} uses left.`, 'soluk');
      render();
      onUse?.(data, e.it);
      dispatchEvent(new CustomEvent('ko-esya-kullanildi', { detail: { num: Number(e.row.item_num) } }));   // (5.11) kısayol çubuğu: tüm sayfalarda aynı eşyanın beklemesi
      return true;
    } finally { bekleyen.delete(slot); }
  }
  // KO: sağ tık → kuşanılı eşyayı çantaya çıkar, çantadaki eşyayı uygun yuvaya kuşan
  const YUVA = { 0: [6, 8], 1: [6], 2: [8], 3: [6, 8], 4: [8, 6], 5: [4], 6: [10], 7: [1], 8: [12], 9: [13], 10: [0, 2], 11: [3], 12: [9, 11], 13: [5], 14: [7], 20: [5],
    107: [42], 105: [43], 106: [44], 108: [45], 109: [46], 110: [47], 111: [48], 112: [49], 100: [50, 51], 113: [91], 114: [92], 25: [52, 53, 78] };
  addEventListener('contextmenu', (ev) => {
    const el = ev.target.closest?.('.inv-esya'); if (!el || !hud.invOpen) return;
    ev.preventDefault(); ev.stopPropagation(); hideTip();
    const from = Number(el.dataset.slot), e = items.get(from); if (!e) return;
    if (kusanili(from)) {
      let to = null; for (let i = 14; i <= 41; i++) if (!items.has(i)) { to = i; break; }
      if (to == null) return hud.notice?.('Insufficient space in your inventory.', 'hata');
      return tasi(from, to);
    }
    // Familiar Summon: sağ tık kısayol çubuğuna yerleştirir (zaten oradaysa çağırır)
    // (31.10) Familiar Summon: sağ tık yalnız kısayol çubuğuna koyar — sağ tıkla çağırmaz; yalnız kısayoldan kullanılır
    if (Number(e.row.item_num) === 389191000) { const K = onPet?.kisayol?.(); if (K?.esyaVar?.(389191000)) hud.info?.(`${e.it.strName} is already on the shortcut bar.`, 'soluk'); else K?.esyaEkle?.(389191000, e.it.strName); return; }
    if (onPet?.esyaMi?.(e.it)) return onPet.kullan(from, e.it);   // KO pet: yumurta, pet (çağır/gönder), yem, paketler, görünüm parşömenleri, Oreads kuponu
    // can / mana iksirleri, güçlendirme parşömenleri (Scroll of Armor / Attack / HP Up, Spell of Lion's Strength…) ve dönüşüm
    // parşömenleri sağ tıkla kullanılmaz: kısayol çubuğuna yerleşir (oradan tuşla / tıkla kullanılır)
    if (canManaIksiri(e.it) || (kullanilir(e.it) && (DONUSUM_ESYA.has(Number(e.row.item_num)) || MS_ESYA.has(Number(e.row.item_num)) || /\b(scroll|spell)\b/i.test(String(e.it?.strName || ''))))) {
      const K = onPet?.kisayol?.(); const num = Number(e.row.item_num);
      if (!K?.esyaEkle) return hud.notice?.('The shortcut bar is not ready.', 'hata');
      if ((K.esyaGorunur || K.esyaVar)?.(num)) return hud.info?.(`${e.it.strName} is already on the shortcut bar.`, 'soluk');
      return void K.esyaEkle(num, e.it.strName);
    }
    if (CASH_SERTIFIKA.has(Number(e.row.item_num))) return void cashSertifika(from);
    // Merchant's Eye / Slave Merchant Scroll sağ tıkla açılmaz: kısayol çubuğuna yerleşir, oradan basılarak kullanılır
    if (PAZAR_GOZ.has(Number(e.row.item_num))) {
      const K = onPet?.kisayol?.(), num = Number(e.row.item_num);
      if (K?.esyaVar?.(num)) return hud.info?.(`${e.it.strName} is on the shortcut bar; press its key to use it.`, 'soluk');
      if (K?.esyaEkle) { K.esyaEkle(num, e.it.strName); return; }
      return hud.notice?.(`Drag ${e.it.strName} to the shortcut bar and use it from there.`, 'hata');
    }
    // Voucher of Merchant's Eye: Moradon'daki [Vendor] Kayra'da 7 günlük Merchant's Eye ile takas edilir
    if (MERCHANT_KUPON.has(Number(e.row.item_num))) return hud.notice?.("Take the Voucher of Merchant's Eye to [Vendor] Kayra in Moradon to exchange it for a 7-day Merchant's Eye.", 'hata');
    if (GENIE_ESYA.has(Number(e.row.item_num))) return void dispatchEvent(new CustomEvent('ko-genie-esya', { detail: { slot: from, num: Number(e.row.item_num) } }));   // Genie kuponu / Spirit of Genie / Genie Hammer (genie.js)
    if (kullanilir(e.it)) return kullan(from);   // KO: iksir/parşömen sağ tıkla kullanılır
    const aday = gmMi() && Number(e.it.Slot) >= 0 && Number(e.it.Slot) <= 4 ? [6, 8] : YUVA[Number(e.it.Slot)];   // GM: silah/kalkan istediği ele
    if (!aday) return hud.notice?.(`${e.it.strName} cannot be equipped.`, 'hata');
    if (aday.includes(6) || aday.includes(8)) return elKusan(from, e, aday);
    tasi(from, aday.find((s) => !items.has(s)) ?? aday[0]);
  }, true);
  // KO: çift el silah (Slot 3/4) iki eli birden kullanır → kuşanırken ellerdeki diğer silahlar çantaya çıkarılır;
  // tek el silah kuşanırken diğer elde çift el silah varsa o çıkarılır. Çantada yer yoksa kırmızı hata.
  const ciftEl = (it) => [3, 4].includes(Number(it?.Slot));
  async function elKusan(from, e, aday) {
    const iki = ciftEl(e.it);
    let hedef = aday.find((s) => !items.has(s)) ?? aday[0];
    if (gmMi()) return tasi(from, hedef);   // GM: iki ele de çift el silah aynı anda takılabilir
    let cikar = [];
    if (iki) cikar = [6, 8].filter((h) => h !== hedef && items.has(h));
    else {
      const dig = [6, 8].find((h) => items.has(h) && ciftEl(items.get(h).it));
      if (dig != null) { if (aday.includes(dig)) hedef = dig; else cikar = [dig]; }   // çift el silahla yer değiştir ya da önce çıkar
    }
    const bos = []; for (let i = 14; i <= 41 && bos.length < cikar.length; i++) if (!items.has(i) && i !== from) bos.push(i);
    if (bos.length < cikar.length) {
      const m = `Insufficient space in your inventory: cannot unequip your ${cikar.length > 1 ? 'weapons' : 'weapon'} to equip ${e.it.strName}.`;
      return hud.notice?.(m, 'hata');
    }
    for (let k = 0; k < cikar.length; k++) { await tasi(cikar[k], bos[k]); }
    await tasi(from, hedef);
  }
  addEventListener('pointerdown', onDown, true);
  addEventListener('pointermove', (ev) => {
    if (dokun && ev.pointerId === dokun.id) {   // dokunmatik: parmak 10 px kayınca sürükleme başlar
      if (Math.hypot(ev.clientX - dokun.x, ev.clientY - dokun.y) < 10) return;
      const d = dokun; dokun = null; clearTimeout(uzunT); if (d.el.isConnected) dragBasla(d.slot, d.el, ev);
    }
    if (drag) return moveGhost(ev);
    if (ev.pointerType === 'touch') return;   // dokunmatikte ipucu üzerine gelmeyle değil dokunuşla açılır
    const it = ev.target.closest?.('.inv-esya');
    if (it && hud.invOpen) showTip(Number(it.dataset.slot), ev); else if (tip?.isConnected) hideTip();
  });
  addEventListener('pointerup', onUp, true);

  // Realtime: GM eşya verince / başka sekmede değişince
  sb.channel('envanter-' + character.id).on('postgres_changes', { event: '*', schema: 'public', table: 'inventory', filter: `char_id=eq.${character.id}` }, (pl) => {
    // yalnız dayanıklılık değiştiyse (savaşta silah / zırh aşınması): yeniden yükleme yok, satır yerinde güncellenir
    const y = pl?.new, e = y && pl.eventType === 'UPDATE' ? items.get(Number(y.slot)) : null;
    if (e && Number(e.row.item_num) === Number(y.item_num) && Number(e.row.count) === Number(y.count) && y.durability != null && Number(y.durability) !== Number(e.row.durability)) {
      const once = Number(e.row.durability), max = Number(e.it?.Duration) || 0; e.row.durability = Number(y.durability); tipYenile();
      if (Number(y.durability) === 0 && once > 0) hud.notice?.(`The durability on ${e.it?.strName || 'the item'} is all gone. Have it repaired!`, 'hata');
      else if (max > 1 && once > max * 0.1 && Number(y.durability) <= max * 0.1) hud.info?.(`The durability of ${e.it?.strName || 'the item'} is low (${y.durability} / ${max}).`, 'hata');
      return;
    }
    if (performance.now() < sessiz) return; clearTimeout(rt); rt = setTimeout(() => { load(); stats(); }, 150); }).subscribe();
  // kendi taşıma/silme işlemlerimizin Realtime yankısı yok sayılır (yerel durum zaten güncel, yeniden yükleme titretmesin)
  let rt = 0;

  // çanta açılınca yuvaları eşle ve çiz
  let wasOpen = false;
  setInterval(() => { const o = hud.invOpen; if (!o) hideTip(); if (o && !wasOpen) { render(); stats(); } wasOpen = o; }, 300);
  addEventListener('keydown', () => { if (!hud.invOpen) hideTip(); }, true);

  await Promise.all([load(), stats()]);
  // dışarıdan (tamir): yuvanın dayanıklılığını anında güncelle, açık ipucunu yenile
  const dayanikYaz = (slot, d) => { const e = items.get(Number(slot)); if (e) { e.row.durability = Number(d); tipYenile(); } };
  return { tasi, reload: () => Promise.all([load(), stats()]).then((r) => { tipYenile(); return r; }), stats, kullan, kullanilir, dayanikYaz, tipYenile, get items() { return items; } };
}
