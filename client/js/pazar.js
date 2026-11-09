// KO kişisel pazar (Merchant): çantadan en fazla 12 eşya, her birine fiyat (ve sayılabilirse adet) → pazar kurulur, karakter oturur.
// Diğer oyuncular satıcının başının üstündeki KO eşya tabelasına (co_tradeitemdisplay) tıklayıp satın alma penceresini açar (co_tradebuyinventory).
// Pencereler deadsoft (yeni nesil) arayüzlerinden: re_trademessage (pazar mesajı), re_tradeinventory (kurma ve alma), re_tradeprice (fiyat),
// re_tradecount (adet), re_trademessagebox (onay), re_tradeitemdisplay / re_tradeitemdisplayspecial (tabela). Yoksa eski co_trade* yerleşimleri.
// Pazardaki eşyaların üstünde fiyat yerine yükseltme derecesi (+9) yazar; Rebirth eşyalarda kırmızı. Fiyat, eşyanın üzerine gelince görünür.
// Sunucu: merchant_stalls / merchant_items (eşyalar emanette), pazar_ac / pazar_kapat / pazar_al. Satıcı oyundan çıksa da pazar açık kalır.
import * as THREE from '../vendor/three.module.min.js';
import { hasLayout, buildLayout, draggable, ekUI } from './kui.js';
import { initAlim } from './alim.js';
import { iconHtml, noahHtml, fromDb, tooltipHtml, hakli, RARITY, rebUnik, REB_UNIK_RENK, kiyasBul, ctrlBasili, ctrlIzle } from './esya.js';

// KO pazar tezgâhı (Misc\obj_counter.n3shape → object\obj_counter.n3pmesh + orijinal object\counter.dxt): satıcının önünde durur
// (6.11) Buying Merchant: KO object\buyer.n3pmesh (mavi alıcı tezgâhı) → assets/pazar/alici.json + alici.png
const TEZGAH = {};
export function tezgahModeli(ad = 'tezgah') {
  return (TEZGAH[ad] ||= Promise.all([fetch(`./assets/pazar/${ad}.json`).then((r) => r.json()), new THREE.TextureLoader().loadAsync((window.KO_V || ((u) => u))(`./assets/pazar/${ad}.png`))]).then(([m, tx]) => {
    tx.colorSpace = THREE.SRGBColorSpace; tx.flipY = false;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(m.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
    g.setIndex(m.idx);
    return { g, mat: new THREE.MeshLambertMaterial({ map: tx, side: THREE.DoubleSide, alphaTest: 0.3 }) };
  }));
}
const fmt = (n) => Number(n || 0).toLocaleString('en-US');   // KO: 1,000,000
// (2.11) KO Texts_us: 7703 'Item Sold: %dh %dm ; Buyer: %s ; Item: %s', 16600 'Item Purchased: %dh %dm ; From: %s ; Item: %s',
// 7704 / 7705 fiyat onayları, 7706 / 7707 vendor mode başlangıç / bitiş, 7700 '(Location:%d,%d)'
const saatKO = () => { const d = new Date(); return `${d.getHours()}h ${d.getMinutes()}m`; };
const saatKO2 = () => { const d = new Date(); return `${d.getHours()}hour ${d.getMinutes()}minute`; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// yükseltme derecesi: eşya adındaki (+N); Rebirth (ItemType 12) kırmızı
const arti = () => '';   // (2.11) +N zaten eşya ikonunda (iconHtml); pazar ikinci kez eklemez
const yer = (yeni, eski) => (hasLayout(yeni) ? yeni : eski);   // deadsoft yerleşimi yoksa eski KO yerleşimi

export function initPazar({ sb, character, state, hud }) {
  const IT = new Map();   // eşya numarası → eşya kaydı
  const ESYA_YOLDA = new Map();   // (6.11) aynı eşya için süren istek paylaşılır (Item Search ön yükleme)
  async function esyalar(nums) {
    const tum = [...new Set(nums.map(Number))].filter((n) => !IT.has(n)); if (!tum.length) return;
    const bekle = tum.filter((n) => ESYA_YOLDA.has(n)).map((n) => ESYA_YOLDA.get(n)), eksik = tum.filter((n) => !ESYA_YOLDA.has(n));
    if (eksik.length) {
      const p = sb.from('items').select('*').in('num', eksik).then(({ data }) => { for (const r of data || []) IT.set(Number(r.num), fromDb(r)); }, () => {}).finally(() => eksik.forEach((n) => ESYA_YOLDA.delete(n)));
      eksik.forEach((n) => ESYA_YOLDA.set(n, p)); bekle.push(p);
    }
    await Promise.all(bekle);
  }
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); return null; } return data; };
  const kat = () => document.getElementById('kohud') || document.body;
  const pencere = (ad, cls) => { const L = buildLayout(ad, { className: 'ko-pazar ko-pencere ' + cls }); kat().append(L.el); L.el.addEventListener('pointerdown', (e) => e.stopPropagation()); draggable(L, 22); return L; };
  const ortala = (el, w, h) => { el.style.left = Math.max(8, (innerWidth - w) / 2) + 'px'; el.style.top = Math.max(8, (innerHeight - h) / 2) + 'px'; };
  // ipucu
  let tip = null;
  // (5.11) KO: pazardaki eşya ipucu en üstte "Sell Merchant"; silah / zırhta kuşanılmış karşılığı varsa Ctrl ile karşılaştırma (solda "Equipment")
  let tip2 = null, ipSon = null;
  // KO pazar fiyat rengi: basamak sayısı mod 5 → 0 camgöbeği (35,000), 1 beyaz (150,000), 2 yeşil (33 / 3,000,000), 3 turuncu (55,555,555), 4 eflatun (2,000 / 900,000,000)
  const fiyatRengi = (f) => ['#32c8e6', '#ffffff', '#32d232', '#f0961e', '#e632e6'][String(Math.floor(Math.abs(Number(f) || 0))).length % 5];
  const ipucu = (it, ek, ev, fiyat = null, adet = 1, kc = false, yer = '') => {
    void adet; ipSon = [it, ek, { clientX: ev.clientX, clientY: ev.clientY }, fiyat, adet, kc, yer];
    const pb = kc ? 'Knight Cash' : 'Noah'; void pb;
    tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu' }); if (!tip.isConnected) document.body.append(tip);
    const q = yer ? kiyasBul(it, state.inv?.items) : null, kiy = q && ctrlBasili();
    // (5.11) KO: fiyat ipucunda dayanıklılıktan sonra ortalı "Purchasing Price : n" (rengi basamak sayısına göre); 7+ basamakta ipucu çerçevesi de o renk
    const fRenk = fiyat != null ? fiyatRengi(fiyat) : null;
    tip.innerHTML = tooltipHtml(it, { ...ek, yer, kiyas: kiy ? q.it : null, kiyasNot: !!q, fiyatSatir: fiyat != null ? { metin: `${yer === 'Buy Merchant' ? 'Selling Price' : 'Purchasing Price'} : ${fmt(fiyat)}${kc ? ' KC' : ''}`, renk: fRenk } : null });
    tip.style.outline = fiyat != null && String(Math.floor(Math.abs(Number(fiyat)))).length >= 7 ? `3px solid ${fRenk}` : ''; tip.style.outlineOffset = '0';
    tip.style.position = 'fixed'; tip.style.zIndex = 9999; tip.style.pointerEvents = 'none';
    let x = Math.min(innerWidth - tip.offsetWidth - 8, ev.clientX + 16);
    if (kiy) {
      tip2 ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu ko-ipucu-kiyas' }); if (!tip2.isConnected) document.body.append(tip2);
      tip2.innerHTML = tooltipHtml(q.it, { count: q.row.count, sure: q.row, yer: 'Equipment' });
      const w2 = tip2.getBoundingClientRect().width; x = Math.max(8 + w2, x);   // ana ipucu sağda, karşılaştırılan hemen bitişiğinde (aşağıda gerçek konuma göre yeniden)
    } else tip2?.remove();
    tip.style.left = x + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, ev.clientY - 10)) + 'px';
    if (kiy && tip2) { const r = tip.getBoundingClientRect(), r2 = tip2.getBoundingClientRect(); tip2.style.left = Math.max(4, r.left - r2.width) + 'px'; tip2.style.top = r.top + 'px'; }   // (5.11) bitişik, üst kenarı hizalı
  };
  ctrlIzle(() => { if (ipSon && tip?.isConnected) ipucu(...ipSon); });
  const ipucuKapat = () => { tip?.remove(); tip2?.remove(); ipSon = null; };
  const yuvaCiz = (L, id, it, adet, olcu = 45, ust = false, kc = false) => {
    const a = L.get(id); if (!a) return null;
    a.innerHTML = it ? `${iconHtml(it, olcu)}${adet > 1 ? `<b class="pz-adet">${adet}</b>` : ''}${ust ? arti(it) : ''}${kc ? '<b class="pz-kc">KC</b>' : ''}` : '';
    a.classList.add('pz-yuva'); return a;
  };

  const dugmeYazi = (L, ok, iptal) => { for (const t of L.el.querySelectorAll('.kui-tx')) { const s = t.textContent.trim(); if (/^(O K|OK|Confirm)$/i.test(s)) t.textContent = ok; if (/^Cancel$/i.test(s)) t.textContent = iptal; } };
  // onay kutusu (re_trademessagebox): "Pazarı bozmak istiyor musunuz?", satın alma onayı
  function onay(metin) {
    return new Promise((r) => {
      const ad = yer('re_trademessagebox', 'co_trademessagebox');
      if (!hasLayout(ad)) { if (!hud.soru?.('Merchant', metin, () => r(true), () => r(false))) r(confirm(metin)); return; }
      document.querySelector('.ko-pazar.pz-onay')?.remove();
      const L = pencere(ad, 'pz-sor pz-onay'); ortala(L.el, 266, 130);
      L.text('text_message', metin); dugmeYazi(L, 'Yes', 'No');
      const bitir = (v) => { L.el.remove(); removeEventListener('keydown', tus, true); r(v); };
      const tus = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); bitir(true); } else if (e.key === 'Escape') { e.stopImmediatePropagation(); bitir(false); } };
      addEventListener('keydown', tus, true);
      L.click('btn_ok', () => bitir(true)); L.click('btn_cancel', () => bitir(false));
    });
  }
  // pazar mesajı (re_trademessage): başının üstündeki tabelada görünür
  function mesajSor(varsayilan) {
    return new Promise((r) => {
      if (!hasLayout('re_trademessage')) return r(varsayilan);
      const L = pencere('re_trademessage', 'pz-sor pz-mesaj'); ortala(L.el, 375, 146);
      for (const t of L.el.querySelectorAll('.kui-tx')) if (/Private shop message/i.test(t.textContent)) t.textContent = 'Shop message';
      dugmeYazi(L, 'OK', 'Cancel');
      const inp = L.input('edit_message', { maxLength: 40, value: varsayilan });
      const bitir = (v) => { L.el.remove(); r(v); };
      L.click('btn_ok', () => bitir((inp?.value || '').trim() || varsayilan)); L.click('btn_cancel', () => bitir(null));
      inp?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') bitir((inp.value || '').trim() || varsayilan); if (e.key === 'Escape') bitir(null); });
      setTimeout(() => { inp?.focus(); inp?.select?.(); }, 30);
    });
  }

  // ---------------- küçük giriş pencereleri (fiyat / adet)
  let sorAcik = null;
  function sorGir(ad, { baslik, varsayilan = '', en = 1, enCok = 2100000000, kcSec = false }) {
    sorAcik?.();   // aynı anda tek soru penceresi: öncekini iptal et
    return new Promise((r0) => {
      let kcAl = () => false;
      const r = (v) => r0(kcSec ? (v == null ? null : { v, kc: kcAl() }) : v);
      const fiyat = /price/.test(ad); ad = fiyat ? (hasLayout('price') ? 'price' : yer('re_tradeprice', 'co_tradeprice')) : yer('re_tradecount', 'co_tradecount');
      if (!hasLayout(ad)) { const v = prompt(baslik, varsayilan); r(v == null ? null : Number(v)); return; }
      const L = pencere(ad, 'pz-sor'); ortala(L.el, 266, 130);
      // başlıklar: üstteki ana başlık, alttaki (fiyat penceresinde) açıklama
      if (ad === 'price') {
        // deadsoft fiyat penceresi: NOAH / &KC seçimi → yalnız Noah
        for (const t of L.el.querySelectorAll('.kui-tx')) { const x = t.textContent.trim(); if (baslik && /^Enter the price/i.test(x)) t.textContent = baslik; else if (x === '&KC') t.textContent = ''; else if (x === 'NOAH') t.textContent = 'Noah'; }
        // Knight Cash kutusu: işaretliyse fiyat Knight Cash (yoksa Noah)
        const kutu = L.get('btn_coin2'); let kc = false;
        const kcCiz = () => { kutu?.classList.toggle('pz-kc-acik', kc); for (const t of L.el.querySelectorAll('.kui-tx')) if (t.dataset.pb) { t.textContent = kc ? 'KC' : 'Noah'; t.style.color = kc ? '#7fe3ff' : ''; } L.el.querySelector('.kui-input')?.focus(); };
        for (const t of L.el.querySelectorAll('.kui-tx')) if (t.textContent === 'Noah') t.dataset.pb = '1';
        if (kutu && kcSec) { L.click('btn_coin2', () => { kc = !kc; kcCiz(); }); kutu.title = 'Knight Cash'; } else L.show('btn_coin2', false);
        kcAl = () => kc;
        L.click('btn_cancel2', () => bitir(null));
      }
      const bas = [...L.el.querySelectorAll('[data-id="Text_Title"],[data-id="text_title"]')].sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
      bas.forEach((t, i) => { if (baslik) t.textContent = i === 0 ? baslik : ''; t.classList.add('pz-sor-baslik'); t.title = t.textContent; });   // (31.10) başlık verilmezse KO'nun kendi yazısı
      L.show('btn_iskc', false); L.text('text_money', '');   // Knight Cash ile satış yok: yalnız Noah
      L.text('text_price', '');
      const inp = L.input(ad === 'price' ? 'edit_price' : fiyat ? 'edit_money' : 'edit_count', { type: 'number', min: en, max: enCok, value: varsayilan });
      dugmeYazi(L, 'OK', 'Cancel');
      const bitir = (v) => { if (sorAcik === iptal) sorAcik = null; L.el.remove(); r(v); };
      const iptal = () => bitir(null); sorAcik = iptal;
      const tamam = () => { const v = Math.floor(Number(inp.value)); if (!(v >= en && v <= enCok)) { inp.focus(); return; } bitir(v); };
      L.click('btn_ok', tamam); L.click('btn_cancel', () => bitir(null));
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') tamam(); if (e.key === 'Escape') bitir(null); });
      setTimeout(() => { inp.focus(); inp.select?.(); }, 30);
    });
  }

  // ---------------- pazar kurma (co_tradeinventory)
  let kur = null;
  // (5.11) KO re_store_select: H → Merchant önce seçim penceresi — Selling Merchant (kurma), Buying Merchant, Market Price + Merchant Union Fund bilgisi
  let secim = null;
  async function secimAc() {
    if (kurBekliyor()) return;
    if (benimPazar()) return hud.notice?.('Your shop is already open. To close it, choose "Close shop" from the H menu.', 'hata');
    if (secim?.el.isConnected) { secim.el.remove(); secim = null; return; }
    if (!(await ekUI('storesel').catch(() => false)) || !hasLayout('re_store_select')) return kurmaAc();
    const L = secim = pencere('re_store_select', 'pz-secim'); ortala(L.el, 310, 396);
    const kapa = () => { L.el.remove(); if (secim === L) secim = null; };
    L.click('btn_close', kapa);
    L.click('btn_sell', () => { kapa(); kurmaAc(); });
    L.click('btn_buy', () => { kapa(); alim?.ac(); });   // (5.11) KO Buying Merchant: önce Item Wish List
    L.click('btn_dayprice', () => hud.notice?.('Market Price is not available yet.', 'hata'));
  }
  async function kurmaAc() {
    if (kurBekliyor()) return;
    if (benimPazar()) return hud.notice?.('Your shop is already open. To close it, choose "Close shop" from the H menu.', 'hata');
    if (state.combat?.genie?.oldum?.()) return;
    if ((character.zone || 'moradon') !== 'moradon') return hud.mesaj?.('Merchant', 'A shop can only be opened in Moradon.') || hud.notice?.('A shop can only be opened in Moradon.', 'hata');
    const AD = yer('re_tradeinventory', 'co_tradeinventory');
    if (!hasLayout(AD)) return hud.notice?.('Failed to load the merchant interface.', 'hata');
    if (kur) { kur.L.el.remove(); kur = null; }
    // (31.10) KO: merchant basınca doğrudan envanter / kurma penceresi — pazar mesajı bu pencerenin mesaj kutusunda düzenlenir (ayrı mesaj sorusu yok)
    let msj = ''; try { msj = localStorage.getItem('ko-pazar-mesaj-' + character.id) || ''; } catch {}
    const L = pencere(AD, 'pz-kur'); ortala(L.el, 396, 516);
    L.show('btn_ok1', false); dugmeYazi(L, 'Open', 'Cancel');
    const mesaj = L.input('edit_message', { maxLength: 40, placeholder: 'Private shop message' });
    if (mesaj) { mesaj.onkeydown = (e) => e.stopPropagation(); mesaj.value = msj; }
    L.click('close', () => kurIptal());
    kur = { L, sec: new Map() };
    const ciz = () => {
      const kullanilan = new Map(); for (const v of kur.sec.values()) kullanilan.set(v.slot, (kullanilan.get(v.slot) || 0) + v.count);
      L.text('text_money', fmt(state.combat?.stats?.gold));   // (5.11) KO: yalnız tutar (beyaz, ince); Noah simgesi solda
      let top = 0, topKc = 0; for (const v of kur.sec.values()) if (v.kc) topKc += v.price * v.count; else top += v.price * v.count;
      L.text('text_sell_money', fmt(top)); L.text('text_sell_KnightCash', 'Total Selling Price'); void topKc;
      for (let i = 0; i < 28; i++) {
        const e = state.inv?.items?.get(14 + i); const kalan = e ? (e.row.count || 1) - (kullanilan.get(14 + i) || 0) : 0;
        const a = yuvaCiz(L, 'a' + i, e && kalan > 0 ? e.it : null, e && hakli(e.it) ? Number(e.row.durability) : kalan);   // 5000'lik premium iksir: kullanım hakkı
        if (a) { a.onclick = () => { if (a._suruklendi) { a._suruklendi = false; return; } if (e && kalan > 0) ekle(14 + i); }; a.onmousemove = (ev) => e && !surukle && ipucu(e.it, { count: e.row.count, sure: e.row }, ev); a.onmouseleave = ipucuKapat;
          a.onpointerdown = (ev) => { if (ev.button === 0 && e && kalan > 0) surukleBasla(ev, a, 14 + i, e.it); }; }
      }
      for (let i = 0; i < 12; i++) {
        const v = kur.sec.get(i), e = v && state.inv?.items?.get(v.slot);
        const a = yuvaCiz(L, 'at' + i, e?.it, e && hakli(e.it) ? Number(e.row.durability) : v?.count, 45, true, !!v?.kc);
        L.text('st' + i, '');
        if (a) a.setAttribute('data-esya-birak', '1');   // ana çantadan sürükle-bırak
        if (a) { a.onclick = () => { if (a._suruklendi) { a._suruklendi = false; return; } if (v) { kur.sec.delete(i); ciz(); } }; a.onmousemove = (ev) => e && !surukle && ipucu(e.it, { count: v.count, sure: e.row }, ev, v.price, v.count, v.kc); a.onmouseleave = ipucuKapat; a.title = v ? 'Drag: move to another shop slot · drag out / click: remove from shop' : '';
          a.onpointerdown = (ev) => { if (ev.button === 0 && v && e && !v.gecici) yuvaSurukle(ev, a, i, e.it); }; }
      }
    };
    // hedef: sürüklenip bırakılan pazar yuvası (0-11); yoksa ilk boş yuva. Eşya önce yuvaya oturur, sonra adet / fiyat sorulur
    const ekle = async (slot, hedef = null) => {
      const e = state.inv?.items?.get(slot); if (!e) return;
      if (e.it?.bound > 0 || e.row.bitis) return hud.notice?.(`${e.it.strName} cannot be sold.`, 'hata');
      if (e.row.kilit) return hud.notice?.(`${e.it.strName} is sealed; sealed items cannot be sold in a shop. Unseal it first.`, 'hata');
      let bos = -1; for (let i = 0; i < 12; i++) if (!kur.sec.has(i)) { bos = i; break; }
      if (hedef != null && hedef >= 0 && hedef < 12) { if (kur.sec.has(hedef) && !kur.sec.get(hedef).gecici) return hud.notice?.('This shop slot is occupied; remove the item in it first (click).', 'hata'); bos = hedef; }
      if (bos < 0) return hud.notice?.('You can register up to 12 items in a shop.', 'hata');
      let kalan = e.row.count || 1; for (const v of kur.sec.values()) if (v.slot === slot) kalan -= v.count;
      if (kalan <= 0) return;
      let count = 1;
      kur.sec.set(bos, { slot, count: Math.min(kalan, Number(e.it.Countable) > 0 ? kalan : 1), price: 0, gecici: true }); ciz();   // önce yuvada görünsün
      const geriAl = () => { if (kur?.sec.get(bos)?.gecici) { kur.sec.delete(bos); ciz(); } };
      if (Number(e.it.Countable) > 0 && kalan > 1) { count = await sorGir('co_tradecount', { varsayilan: kalan, enCok: kalan }); if (!count) return geriAl(); }
      const f = await sorGir('co_tradeprice', { varsayilan: Math.max(1, Number(e.it.BuyPrice) || 1), en: 1, kcSec: true });
      if (!f?.v || !kur) return geriAl();
      if (!(await onay(`[Price: ${fmt(f.v)} ] Have you entered the right price? Please double check the price!`)) || !kur) return geriAl();
      kur.sec.set(bos, { slot, count, price: f.v, kc: !!f.kc }); ciz();
    };
    // sürükle-bırak: pazar penceresinin çanta kısmından üstteki istenen pazar yuvasına
    let surukle = null;
    const yuvaAlti = (x, y) => { for (const el of document.elementsFromPoint(x, y)) { const y2 = el.closest?.('[data-id^="at"]'); if (y2 && L.el.contains(y2)) return Number(y2.dataset.id.slice(2)); } return null; };
    function surukleBasla(ev, a, slot, it) {
      const x0 = ev.clientX, y0 = ev.clientY; let hayalet = null;
      const hareket = (e2) => {
        if (!hayalet && Math.hypot(e2.clientX - x0, e2.clientY - y0) < 5) return;
        if (!hayalet) { ipucuKapat(); surukle = slot; hayalet = document.createElement('div'); hayalet.className = 'pz-hayalet'; hayalet.innerHTML = iconHtml(it, 40); document.body.append(hayalet); }
        hayalet.style.left = e2.clientX - 20 + 'px'; hayalet.style.top = e2.clientY - 20 + 'px';
        const h = yuvaAlti(e2.clientX, e2.clientY); L.el.querySelectorAll('.pz-hedef').forEach((x) => x.classList.remove('pz-hedef')); if (h != null) L.get('at' + h)?.classList.add('pz-hedef');
      };
      const birak = (e2) => {
        removeEventListener('pointermove', hareket, true); removeEventListener('pointerup', birak, true);
        L.el.querySelectorAll('.pz-hedef').forEach((x) => x.classList.remove('pz-hedef'));
        if (!hayalet) return; hayalet.remove(); surukle = null; a._suruklendi = true; setTimeout(() => { a._suruklendi = false; }, 50);
        const h = yuvaAlti(e2.clientX, e2.clientY); if (h != null) ekle(slot, h);
      };
      addEventListener('pointermove', hareket, true); addEventListener('pointerup', birak, true);
    }
    // (4.11) pazar yuvaları arasında sürükle-bırak: oyuncu eşyanın yerini kendisi seçer (dolu yuvaya bırakınca yer değiştirir);
    //   pencerenin dışına / alttaki çantaya bırakılırsa pazardan çıkar
    function yuvaSurukle(ev, a, i, it) {
      const x0 = ev.clientX, y0 = ev.clientY; let hayalet = null;
      const hareket = (e2) => {
        if (!hayalet && Math.hypot(e2.clientX - x0, e2.clientY - y0) < 5) return;
        if (!hayalet) { ipucuKapat(); surukle = 'yuva'; hayalet = document.createElement('div'); hayalet.className = 'pz-hayalet'; hayalet.innerHTML = a.innerHTML; hayalet.style.width = hayalet.style.height = '45px'; document.body.append(hayalet); a.style.opacity = '0.35'; }
        hayalet.style.left = e2.clientX - 22 + 'px'; hayalet.style.top = e2.clientY - 22 + 'px';
        const h = yuvaAlti(e2.clientX, e2.clientY); L.el.querySelectorAll('.pz-hedef').forEach((x) => x.classList.remove('pz-hedef')); if (h != null && h !== i) L.get('at' + h)?.classList.add('pz-hedef');
      };
      const birak = (e2) => {
        removeEventListener('pointermove', hareket, true); removeEventListener('pointerup', birak, true);
        L.el.querySelectorAll('.pz-hedef').forEach((x) => x.classList.remove('pz-hedef')); a.style.opacity = '';
        if (!hayalet || !kur) return; hayalet.remove(); surukle = null; a._suruklendi = true; setTimeout(() => { a._suruklendi = false; }, 50);
        const h = yuvaAlti(e2.clientX, e2.clientY), v = kur.sec.get(i); if (!v) return;
        if (h != null) { if (h === i) return; const w = kur.sec.get(h); if (w?.gecici) return; kur.sec.set(h, v); if (w) kur.sec.set(i, w); else kur.sec.delete(i); ciz(); return; }
        const icinde = document.elementsFromPoint(e2.clientX, e2.clientY).some((el) => L.el.contains(el) && el !== L.el && /^a\d+$/.test(el.closest?.('[data-id]')?.dataset.id || ''));
        if (icinde || !L.el.contains(document.elementFromPoint(e2.clientX, e2.clientY))) { kur.sec.delete(i); ciz(); }   // çantaya ya da pencere dışına: pazardan çıkar
      };
      addEventListener('pointermove', hareket, true); addEventListener('pointerup', birak, true);
    }
    // ana çanta penceresinden (I) sürüklenen eşya da pazar yuvasına bırakılabilir (envanter.js 'ko-esya-birak')
    L.el.addEventListener('ko-esya-birak', (ev) => { const d = ev.detail || {}; if (!(d.slot >= 14 && d.slot <= 41)) return; const y2 = ev.target.closest?.('[data-id^="at"]'); ekle(d.slot, y2 ? Number(y2.dataset.id.slice(2)) : null); });
    L.click('btn_cancel', () => kurIptal());
    L.click('btn_ok', async () => {
      for (const [k, v] of kur.sec) if (v.gecici) kur.sec.delete(k);
      if (!kur.sec.size) return hud.notice?.('First select the items to sell from your inventory below.', 'hata');
      // KO: "Pazarı Aç"a basınca karakter olduğu yerde durur (yürüme hedefi silinir, tuşlar kilitlenir) → tezgâh tam önüne kurulur
      const pl = window.__ko?.player; state.target = null; state.keys?.clear?.(); const donmus = state.frozen; state.frozen = true;
      const p = pl?.position ? { x: pl.position.x, z: pl.position.z } : state.combat?.genie?.ben?.();
      const yaw = state.yaw ?? pl?.rotation?.y ?? 0;
      const esya = [...kur.sec].map(([idx, v]) => ({ idx, slot: v.slot, count: v.count, price: v.price, kc: !!v.kc }));
      try { localStorage.setItem('ko-pazar-mesaj-' + character.id, mesaj?.value || ''); } catch {}
      const d = await rpc('pazar_ac', { p_baslik: mesaj?.value || '', p_esyalar: esya, p_x: p?.x ?? null, p_z: p?.z ?? null });
      if (!d || !d.ok) { state.frozen = donmus; if (d) hud.notice?.(d.reason, 'hata'); return; }
      kurmaKapat(); await state.inv?.reload?.();
      hud.info?.(`Initiated vendor mode at ${saatKO2()}. `, 'esya');
      await rpc('pazar_yon', { p_yaw: yaw });
      oturt(true); await yukle().catch((e) => console.warn('pazar yukle', e));   // (2.11) önce otur (pazar modu); liste yüklenemese de kapatılabilir
    });
    ciz();
    kur.ciz = ciz;
  }
  const kurmaKapat = () => { kur?.L.el.remove(); kur = null; ipucuKapat(); };
  // (5.11) KO: kurma penceresi pazar açılmadan kapanırsa "Ended vendor mode at Xhour Yminute." (turuncu) + 60 sn bekleme;
  // beklerken Merchant'a basınca "You can use it after N seconds." (kırmızı)
  let kurBekle = 0;
  const kurIptal = () => {
    if (!kur) return; kurmaKapat();
    const d = new Date(); hud.info?.([[`Ended vendor mode at ${d.getHours()}hour ${d.getMinutes()}minute.`, '#ff6600']], 'pazar-bitti');
    kurBekle = Date.now() + 60000;
  };
  const kurBekliyor = () => { const k = Math.ceil((kurBekle - Date.now()) / 1000); if (k <= 0) return false; hud.info?.([[`You can use it after ${k} seconds.`, '#ff3b3b']], 'pazar-bekle'); return true; };

  // ---------------- pazarlar (aynı sunucu + bölge)
  const PAZAR = new Map();   // char_id → {st, items: [], el}
  let alim = null;   // (5.11) Buying Merchant (alim.js)
  const benimPazar = () => PAZAR.get(Number(character.id));
  async function yukle() {
    const { data: st } = await sb.from('merchant_stalls').select('*').eq('zone', character.zone || 'moradon');
    const stl = (st || []).filter((s) => s.server_id == null || character.server_id == null || Number(s.server_id) === Number(character.server_id));
    const ids = stl.map((s) => s.char_id);
    const { data: its } = ids.length ? await sb.from('merchant_items').select('*').in('char_id', ids) : { data: [] };
    const alIds = stl.filter((s) => s.tur === 'al').map((s) => s.char_id);   // (5.11) Buying Merchant: istek listesi
    const { data: ali } = alIds.length ? await sb.from('alim_items').select('*').in('char_id', alIds) : { data: [] };
    await esyalar([...(its || []), ...(ali || [])].map((m) => m.item_num));
    const yeni = new Set();
    for (const s of stl) {
      const k = Number(s.char_id); yeni.add(k);
      const p = PAZAR.get(k) || {}; p.st = s; p.items = (s.tur === 'al' ? ali || [] : its || []).filter((m) => Number(m.char_id) === k).sort((a, b) => a.idx - b.idx);
      PAZAR.set(k, p); tabela(p);
    }
    for (const [k, p] of PAZAR) if (!yeni.has(k)) {
      p.el?.remove(); p.tz?.removeFromParent(); PAZAR.delete(k);
      // KO: tüm eşyalar satılınca pazar kendiliğinden kapanır → satıcı ayağa kalkar
      if (k === Number(character.id) && state.pazarAcik && !kapaniyor) {
        oturt(false);
        // (6.11) Buying Merchant: istenen eşyaların hepsi alınınca pazar kapanır → KO Texts_us 7707 "Ended vendor mode at %dhour %dminute." (turuncu)
        if (p.st?.tur === 'al') { const d = new Date(); hud.info?.([[`Ended vendor mode at ${d.getHours()}hour ${d.getMinutes()}minute.`, '#ff6600']], 'pazar-bitti'); }
        else hud.info?.('All items in your shop have been sold; the shop has been closed.', 'esya');
      }
    }
    for (const p of PAZAR.values()) tezgahKoy(p).catch(() => {});
    if (alis && !PAZAR.has(alis.satici)) alisKapat(); else if (alis) alis.ciz();
    alim?.yenile?.();
    if (liste) tumunuYukle().then(() => liste?.ciz?.()).catch(() => {});
  }
  let yT = 0; const yukleGec = () => { clearTimeout(yT); yT = setTimeout(() => yukle().catch(() => {}), 250); };
  sb.channel('pazar-' + character.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_stalls' }, () => yukleGec())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alim_items' }, (p) => {   // (5.11) Buying Merchant
      const r = p.old?.char_id != null ? p.old : p.new;
      if (Number(r?.char_id) === Number(character.id) && p.eventType !== 'INSERT') {
        state.inv?.reload?.(); state.inv?.stats?.();
        // (6.11) KO Texts_us 16600: alım pazarı sahibine "Item Purchased: %dh %dm ; From: %s ; Item: %s" (From = eşyayı satan)
        const n = p.eventType === 'DELETE' ? Number(p.old?.count) : Number(p.old?.count) - Number(p.new?.count);
        if (n > 0 && !kapaniyor && state.pazarAcik) {
          const it = IT.get(Number(r.item_num)), bid = benimPazar()?.st?.bakan, t = saatKO();
          const yaz = (ad) => hud.info?.(`Item Purchased: ${t} ; From: ${ad || '-'} ; Item: ${it?.strName || r.item_num}${n > 1 ? ' x' + n : ''}`, 'pazar-satis');
          // (6.11) satanın adı sunucudan satırla gelir (alim_sat → son_satan); eski satırlarda pazara bakan kişi
          const satan = (p.eventType === 'DELETE' ? p.old : p.new)?.son_satan;
          const rm = !satan && bid != null && (state.remotes?.get(String(bid)) || state.remotes?.get(Number(bid)));
          if (satan) yaz(satan); else if (rm?.meta?.name) yaz(rm.meta.name); else if (bid != null) sb.from('characters').select('name').eq('id', bid).maybeSingle().then(({ data }) => yaz(data?.name), () => yaz()); else yaz();
          sb.from('characters').select('gold').eq('id', character.id).single().then(({ data }) => { if (data) state.combat?.applyStats?.({ gold: data.gold }); });
        }
      }
      yukleGec();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_items' }, (p) => {
      const r = p.old?.char_id != null ? p.old : p.new;
      if (Number(r?.char_id) === Number(character.id) && (p.eventType === 'DELETE' || (p.eventType === 'UPDATE' && p.new.count < p.old.count)) && benimPazar()) {
        const it = IT.get(Number(r.item_num)); const n = p.eventType === 'DELETE' ? p.old.count : p.old.count - p.new.count;
        if (it && !kapaniyor) {
          const bid = benimPazar()?.st?.bakan, yaz = (ad) => hud.info?.(`Item Sold: ${saatKO()} ; Buyer: ${ad || '-'} ; Item: ${it.strName}${n > 1 ? ' x' + n : ''}`, 'pazar-satis');
          const rm = bid != null && (state.remotes?.get(String(bid)) || state.remotes?.get(Number(bid)));
          if (rm?.meta?.name) yaz(rm.meta.name); else if (bid != null) sb.from('characters').select('name').eq('id', bid).maybeSingle().then(({ data }) => yaz(data?.name), () => yaz()); else yaz(); sb.from('characters').select('gold,cash').eq('id', character.id).single().then(({ data }) => { if (!data) return; state.combat?.applyStats?.({ gold: data.gold }); if (data.cash != null) { character.cash = data.cash; dispatchEvent(new CustomEvent('ko-cash', { detail: data.cash })); } }); }
      }
      yukleGec();
    })
    .subscribe();

  // ---------------- KO tezgâhı: satıcının önünde (yönü pazar açılırken kaydedilir)
  async function tezgahKoy(p) {
    const w = window.__ko?.world;
    if (!w || !state.heightAt) { clearTimeout(p.tzT); p.tzT = setTimeout(() => { if (PAZAR.get(Number(p.st.char_id)) === p) tezgahKoy(p).catch(() => {}); }, 700); return; }   // oyun dünyası henüz hazır değil (girişte yüklenen pazarlar)
    const ad = p.st.tur === 'al' ? 'alici' : 'tezgah';
    const { g, mat } = await tezgahModeli(ad);
    if (p.tz && p.tzAd !== ad) { p.tz.removeFromParent(); p.tz = null; }
    if (!p.tz) { p.tz = new THREE.Mesh(g, mat); p.tz.castShadow = false; w.add(p.tz); p.tzAd = ad; }
    const yaw = Number(p.st.yaw) || 0, x = p.st.x + Math.sin(yaw) * 0.9, z = p.st.z + Math.cos(yaw) * 0.9;
    p.tz.position.set(x, state.heightAt?.(x, z) ?? 0, z); p.tz.rotation.y = yaw;
  }

  // ---------------- başın üstündeki tabela (co_tradeitemdisplay)
  function tabela(p) {
    if (!p.el) {
      const el = document.createElement('div'); el.className = 'ko-pazar-tabela';
      el.append(Object.assign(document.createElement('div'), { className: 'pz-tb-yer' }));
      const ad = document.createElement('div'); ad.className = 'pz-tb-ad'; el.append(ad);
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.onclick = () => { const id = Number(p.st.char_id); if (id !== Number(character?.id)) { state.seciliOyuncu = { id: String(id), meta: state.seciliOyuncu?.id === String(id) ? state.seciliOyuncu.meta : null }; state.npcs?.select?.(null); } alisAc(id); };   // (2.11) tabela tıklaması da pazarı yeşil halkayla seçer
      kat().append(el); p.el = el;
    }
    p.el.querySelector('.pz-tb-ad').textContent = '';   // (31.10) mesaj tabelada değil, sohbette / satıcının altında
    // KO tabelası: 4 eşyaya kadar re_tradeitemdisplay, daha fazlasında 8 yuvalı re_tradeitemdisplayspecial
    const ad = p.items.length > 4 && hasLayout('re_tradeitemdisplayspecial') ? 're_tradeitemdisplayspecial' : yer('re_tradeitemdisplay', 'co_tradeitemdisplay');
    if (hasLayout(ad) && p.Lad !== ad) { p.L?.el.remove(); p.L = buildLayout(ad, { className: 'pz-tb ' + ad }); p.L.show('img_buy', false); p.el.querySelector('.pz-tb-yer').replaceChildren(p.L.el); p.Lad = ad; }
    p.L?.show('img_buy', p.st.tur === 'al');   // (5.11) KO: alım pazarı tabelasında "Buy" işareti
    const n = ad === 're_tradeitemdisplayspecial' ? 8 : 4;
    // KO: tabeladaki eşya simgesinin üstüne gelince pazar açılmadan yalnız eşya bilgisi (fiyat pazara girince)
    if (p.L) for (let i = 0; i < n; i++) {
      const m = p.items[i], it = m && IT.get(Number(m.item_num)), a = p.L.get(String(i)); if (!a) continue;
      a.innerHTML = it ? iconHtml(it, 32) + arti(it) : '';
      a.style.pointerEvents = 'auto';
      a.onmousemove = it ? (ev) => ipucu(it, { count: m.count, sure: m }, ev, null, m.count, !!m.kc, p.st.tur === 'al' ? 'Buy Merchant' : 'Sell Merchant') : null;   // (5.11) pazara girmeden fiyat görünmez; (6.11) alım pazarında 'Buy Merchant'
      a.onmouseleave = ipucuKapat;
    }
    p.el.title = '';
    p.el.querySelector('.pz-tb-ad').title = `${p.st.name} — shop (click)`;
    if (!p.el._ipKapat) { p.el._ipKapat = 1; p.el.addEventListener('mouseleave', ipucuKapat); }
  }
  // (31.10) KO: pazar mesajı tabelada yazmaz — açık pazar 5 dk'da bir genel sohbete ve satıcının altına "Ad [Merchant] : mesaj" (60 m içindekiler)
  const duyurulan = new Map();
  setInterval(() => {
    const ben = window.__ko?.player?.position; if (!ben) return;
    const simdi = performance.now();
    for (const [id, p] of PAZAR) {
      if (!p.st?.baslik) continue;
      if (Math.hypot(p.st.x - ben.x, p.st.z - ben.z) > 60) continue;
      if (simdi - (duyurulan.get(id) || 0) < 5 * 60 * 1000) continue;   // (2.11) 5 dakikada bir
      duyurulan.set(id, simdi); state.pazarDuyur?.(id, p.st.name, `${p.st.baslik} (Location:${Math.round(Number(p.st.x) || 0)},${Math.round(Number(p.st.z) || 0)})`);   // sonunda KO Texts 7700 '(Location:%d,%d)'
    }
  }, 2000);
  // (2.11) bölgede görünmeyen satıcılar tezgâhın başında oturur (main.js pazarHayaletleri)
  setInterval(() => { state.pazarHayaletleri?.([...PAZAR].filter(([id]) => id !== Number(character.id)).map(([id, p]) => ({ id, x: Number(p.st.x), z: Number(p.st.z), yaw: Number(p.st.yaw) || 0 }))); }, 3000);
  // (5.11) KO: satıcının eşya tabelası yalnız yakına gelince (5 m) görünür
  const TABELA_MESAFE = 5;
  // her karede tabelaları satıcının başının üstüne taşı
  const v3 = new THREE.Vector3();
  (function dongu() {
    requestAnimationFrame(dongu);
    const K = window.__ko; if (!K?.camera || !PAZAR.size) return;
    const cam = K.camera, W = innerWidth, H = innerHeight, ben = K.player?.position;
    for (const [id, p] of PAZAR) {
      if (!p.el) continue;
      const r = id === Number(character.id) ? (benimYerde() ? K.player : null) : state.remotes?.get(String(id));
      if (r?.obj || r?.isObject3D) { (r.obj || r).getWorldPosition(v3); v3.y += 2.35; }   // tabela ve pazar duyurusu başın biraz üstünde
      else { const h = state.heightAt?.(p.st.x, p.st.z) ?? 0; v3.set(p.st.x, h + 2.35, p.st.z); K.world?.localToWorld?.(v3); }
      const d = ben ? Math.hypot(p.st.x - ben.x, p.st.z - ben.z) : 0;
      v3.project(cam);
      const gor = !liste && v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2 && d < TABELA_MESAFE;   // Pazar Listesi açıkken tabelalar gizli
      p.el.hidden = !gor; if (!gor) continue;
      p.el.style.transform = `translate(${((v3.x + 1) / 2) * W}px, ${((1 - v3.y) / 2) * H}px) translate(-50%, -100%) scale(${Math.max(0.6, Math.min(1, 14 / Math.max(1, d)))})`;
    }
  })();
  const benimYerde = () => { const b = benimPazar(), p = window.__ko?.player?.position; return !!(b && p && Math.hypot(b.st.x - p.x, b.st.z - p.z) < 3); };

  // ---------------- satın alma (co_tradebuyinventory)
  let alis = null, alisAciliyor = false;
  // (2.11) art arda tıklamada tek pencere: açılış sürerken yeni istek yok sayılır; aynı satıcının penceresi zaten açıksa yenisi açılmaz
  async function alisAc(satici) {
    if (PAZAR.get(Number(satici))?.st?.tur === 'al') return alim?.bak(Number(satici));   // (5.11) Buying Merchant
    if (alisAciliyor) return;
    if (alis && alis.satici === satici && alis.L.el.isConnected) return;
    alisAciliyor = true;
    try { await alisAc0(satici); } finally { alisAciliyor = false; }
  }
  async function alisAc0(satici) {
    const p = PAZAR.get(satici); if (!p) return;
    const kendi = satici === Number(character.id);
    const ben = window.__ko?.player?.position; if (!kendi && ben && Math.hypot(p.st.x - ben.x, p.st.z - ben.z) > 12) return hud.notice?.('You are too far away from the merchant.', 'hata');
    if (alis) alisKapat();
    // KO: bir pazara aynı anda yalnız bir oyuncu bakabilir
    if (!kendi) {
      const d = await rpc('pazar_bak', { p_satici: satici, p_ac: true }); if (!d) return;
      if (!d.ok) return hud.mesaj?.('Merchant', d.reason) || hud.notice?.(d.reason, 'hata');
    }
    const AD = hasLayout('re_tradeinventory') ? 're_tradeinventory' : 'co_tradebuyinventory';
    const L = pencere(AD, 'pz-al ' + AD); ortala(L.el, 396, 516);
    const bas = document.createElement('div'); bas.className = 'pz-baslik'; bas.hidden = true; L.el.append(bas);   // (2.11) en üstte "Ad — Pazar" yazısı yok
    // (31.10) pazara bakarken: "Current Balance" yerine yalnız "Noah"; "Total Selling Price" bölümü (base_mid) yok
    // (5.11) KO: "Current Balance" + Noah simgesi + tutar (orta bölümdeki Noah simgesi base_bot satırına kopyalanır)
    { const bm = L.get('base_mid'), bb = L.get('base_bot'), sim = bm?.querySelectorAll(':scope > .kui-img')[1];
      if (sim && bb) { const k = sim.cloneNode(true); k.removeAttribute('data-id'); Object.assign(k.style, { left: '178px', top: '11px' }); k.classList.add('pz-bakiye-noah'); bb.append(k); } }
    // bölüm boşluk bırakmadan kalkar: alt kısım (Noah + çanta + mesaj + düğme) 35 px yukarı kayar, pencere kısalır (eksik görünmez)
    L.show('base_mid', false); L.show('text_sell_money', false); L.show('text_sell_KnightCash', false);
    { const bb = L.get('base_bot'); if (bb) bb.style.transform = 'translateY(-35px)'; L.el.style.height = (parseFloat(L.el.style.height) || 578) - 35 + 'px'; }
    if (AD === 're_tradeinventory') {
      // alma: satıcının mesajı mesaj alanında; yalnız ortadaki "Kapat" düğmesi
      L.show('btn_ok', false); L.show('btn_cancel', false); dugmeYazi(L, 'Close', 'Cancel');
      L.text('edit_message', ''); const m = L.get('edit_message'); if (m) { m.classList.add('pz-msj'); m.textContent = p.st.baslik || `${p.st.name}'s Shop`; }
      L.click('btn_ok1', () => alisKapat()); L.click('close', () => alisKapat());
    } else { dugmeYazi(L, 'Close', 'Cancel'); L.click('btn_ok', () => alisKapat()); }
    const ciz = () => {
      const pp = PAZAR.get(satici); if (!pp) return alisKapat();
      for (let i = 0; i < 12; i++) {
        const m = pp.items.find((x) => x.idx === i), it = m && IT.get(Number(m.item_num));
        const a = yuvaCiz(L, 'at' + i, it, m && hakli(it) && m.durability != null ? Number(m.durability) : m?.count, 45, true, !!m?.kc);
        L.text('st' + i, '');
        if (a) { a.onclick = () => { if (Date.now() - (alis?.surukSon || 0) < 300) return; m && !alis?.kendi && al(satici, m); };
          a.onpointerdown = (ev) => { if (m && it && !alis?.kendi && ev.button === 0) surukleAl(ev, satici, m, it, a); }; a.onmousemove = (ev) => it && ipucu(it, { count: m.count, sure: m }, ev, Number(m.price), m.count, !!m.kc, 'Sell Merchant'); a.onmouseleave = ipucuKapat; }
      }
      for (let i = 0; i < 28; i++) { const e = state.inv?.items?.get(14 + i); yuvaCiz(L, 'a' + i, e?.it, hakli(e?.it) ? Number(e.row.durability) : e?.row.count); L.text(String(200 + i), ''); }
      L.text('text_money', fmt(state.combat?.stats?.gold));   // (5.11) KO: yalnız tutar (beyaz, ince); Noah simgesi solda
      L.text('text_sell_money', fmt(state.combat?.stats?.gold) + ' Noah'); L.text('text_sell_KnightCash', fmt(character.cash) + ' KC');   // alıcının Noah / Knight Cash'i
    };
    alis = { L, satici, ciz, kendi, nabiz: kendi ? 0 : setInterval(() => rpc('pazar_bak', { p_satici: satici, p_ac: true }), 20000) };
    // (2.11) kendi pazarında üstte açıklama yazısı yok
    ciz();
  }
  // pazardaki eşyayı sürükleyip çantaya (alış penceresinin alt yuvaları ya da I çanta penceresi) bırakınca satın al
  function surukleAl(ev, satici, m, it, a) {
    const bas = { x: ev.clientX, y: ev.clientY }; let hay = null;
    const move = (e) => {
      if (!hay && Math.hypot(e.clientX - bas.x, e.clientY - bas.y) < 6) return;
      if (!hay) { hay = document.createElement('div'); hay.className = 'pz-hayalet'; hay.innerHTML = a.innerHTML; hay.style.cssText = 'position:fixed;width:45px;height:45px;pointer-events:none;z-index:99999;opacity:.85'; document.body.append(hay); ipucuKapat(); }
      hay.style.left = e.clientX - 22 + 'px'; hay.style.top = e.clientY - 22 + 'px';
    };
    const up = (e) => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true);
      if (!hay) return;
      hay.remove(); if (alis) alis.surukSon = Date.now();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cantaYuva = el?.closest?.('[data-id]') && /^a\d+$/.test(el.closest('[data-id]').dataset.id) && alis?.L.el.contains(el);
      if (cantaYuva || el?.closest?.('.ko-inv')) al(satici, m);
    };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
  }
  const alisKapat = () => {
    if (alis && !alis.kendi) { clearInterval(alis.nabiz); rpc('pazar_bak', { p_satici: alis.satici, p_ac: false }); }
    alis?.L.el.remove(); alis = null; ipucuKapat();
    document.querySelectorAll('.ko-pazar.pz-al').forEach((e) => e.remove());   // takılı kalmış eski pencereler de kapanır
  };
  addEventListener('beforeunload', () => { if (alis && !alis.kendi) sb.rpc('pazar_bak', { p_char: character.id, p_satici: alis.satici, p_ac: false }); });
  let alSurer = false;
  async function al(satici, m) {
    if (alSurer) return;   // aynı eşyaya art arda tıklamada adet penceresi tekrar tekrar açılmasın
    alSurer = true;
    try { await al0(satici, m); } finally { alSurer = false; }
  }
  async function al0(satici, m) {
    const it = IT.get(Number(m.item_num)); if (!it) return;
    let n = 1;
    if (m.count > 1) { n = await sorGir('co_tradecount', { baslik: `Quantity (max ${m.count})`, varsayilan: 1, enCok: m.count }); if (!n) return; }
    const tutar = Number(m.price) * n, kc = !!m.kc;
    if (kc ? tutar > Number(character.cash || 0) : tutar > Number(state.combat?.stats?.gold || 0)) return hud.notice?.(kc ? 'Not enough Knight Cash.' : 'Not enough coins.', 'hata');
    const evet = await onay(`[Price: ${fmt(tutar)} ] Will you buy this item? Please double check the price!`);
    if (!evet) return;
    const p = window.__ko?.player?.position;
    const d = await rpc('pazar_al', { p_satici: satici, p_idx: m.idx, p_count: n, p_x: p?.x ?? 0, p_z: p?.z ?? 0 }); if (!d) return;
    if (!d.ok) return hud.notice?.(d.reason, 'hata');
    if (d.kc) { character.cash = d.cash; dispatchEvent(new CustomEvent('ko-cash', { detail: d.cash })); } else state.combat?.applyStats?.({ gold: d.gold });
    await state.inv?.reload?.();
    hud.info?.(`Item Purchased: ${saatKO()} ; From: ${PAZAR.get(satici)?.st?.name || '-'} ; Item: ${d.ad}${d.adet > 1 ? ' x' + d.adet : ''}`, 'pazar-satis');
    await yukle(); alis?.ciz();
  }

  // ---------------- Pazar Listesi (deadsoft re_merchant): bölgedeki tüm pazarların eşyaları — ara, fiyata göre sırala, Git, Mesaj
  let liste = null;
  const BOLGE = (z) => ({ moradon: 'Moradon', elmorad: 'El Morad', karus: 'Karus' }[z] || z || '?');
  const DERECE = (it) => ([11, 12].includes(Number(it?.ItemType)) ? 'Reverse' : RARITY[it?.ItemType]?.[0] || 'Normal');
  // Slave Merchant Scroll / Merchant's Eye (çantada ya da kısayol çubuğunda kullanılır): sunucudaki tüm pazarlar
  const GOZ = [751730000, 810168000];
  const gozVar = () => [...(state.inv?.items?.values() || [])].some((e) => GOZ.includes(Number(e.row.item_num)));
  addEventListener('ko-pazar-goz', () => listeAc('', { goz: true }));
  let TUM = [];   // [{st, items}] — sunucudaki tüm bölgelerin pazarları
  async function tumunuYukle() {
    const { data: st } = await sb.from('merchant_stalls').select('*');
    const stl = (st || []).filter((s) => s.server_id == null || character.server_id == null || Number(s.server_id) === Number(character.server_id));
    const ids = stl.map((s) => s.char_id);
    const { data: its } = ids.length ? await sb.from('merchant_items').select('*').in('char_id', ids) : { data: [] };
    await esyalar((its || []).map((m) => m.item_num));
    TUM = stl.map((s) => ({ st: s, items: (its || []).filter((m) => Number(m.char_id) === Number(s.char_id)).sort((a, b) => a.idx - b.idx) }));
  }
  async function listeAc(arama = '', { goz = false } = {}) {
    if (!hasLayout('re_merchant')) return hud.notice?.('Failed to load the merchant list interface.', 'hata');
    if (!goz && !gozVar()) return hud.notice?.("You need a Slave Merchant Scroll (or Merchant's Eye) in your inventory to view all shops. You can place it on the shortcut bar and use it.", 'hata');
    await tumunuYukle().catch(() => {});
    if (liste) liste.L.el.remove();
    const L = pencere('re_merchant', 'pz-liste'); ortala(L.el, 1000, 540);
    // düğme yazıları bazı satırlarda gizli durum resminin içinde: yazıyı düğmenin kendisine taşı (her durumda görünsün)
    for (const b of L.el.querySelectorAll('[data-id="btn_go"],[data-id="btn_pm"],[data-id="btn_search"],[data-id="btn_sort_price"]')) {
      const tx = [...b.querySelectorAll('.kui-tx')]; if (!tx.length) continue;
      const t = tx[0]; tx.slice(1).forEach((x) => x.remove()); b.append(t);
    }
    const yaz = { txt_title: 'Merchant List', col1: 'Seller', col3: 'Grade', col4: 'Type', col5: 'Count', col6: 'Price', co7: 'Action' };
    for (const [k, v] of Object.entries(yaz)) L.text(k, v);
    for (const t of L.el.querySelectorAll('.kui-tx')) { const x = t.textContent.trim(); void x; }
    const inp = L.input('edit_itemname', { maxLength: 30, placeholder: 'Item name', value: arama });
    if (inp) inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { liste.arama = inp.value.trim(); liste.sayfa = 0; ciz(); } if (e.key === 'Escape') listeKapat(); });
    liste = { L, arama, sayfa: 0, sirala: 0 };
    const satirlar = () => {
      const r = []; const q = liste.arama.toLocaleLowerCase('tr');
      for (const p of TUM) for (const m of p.items) { const it = IT.get(Number(m.item_num)); if (!it) continue; if (q && !String(it.strName || '').toLocaleLowerCase('tr').includes(q)) continue; r.push({ p, m, it }); }
      if (liste.sirala) r.sort((a, b) => (Number(a.m.price) - Number(b.m.price)) * liste.sirala);
      return r;
    };
    const ROW = 14;
    function ciz() {
      const r = satirlar(), sayfaSay = Math.max(1, Math.ceil(r.length / ROW)); liste.sayfa = Math.min(liste.sayfa, sayfaSay - 1);
      L.text('txt_page', `${liste.sayfa + 1}/${sayfaSay}`);
      const gruplar = [...L.el.querySelectorAll('[data-id^="row_"]')].sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
      gruplar.forEach((g, i) => {
        const x = r[liste.sayfa * ROW + i]; g.hidden = !x; if (!x) return;
        const t = (id, v) => { const e = g.querySelector(`[data-id="${id}"]`); if (e) e.textContent = v; return e; };
        t('txt_seller', x.p.st.name || '?');
        const ie = t('txt_item', x.it.strName); if (ie) { ie.style.color = rebUnik(x.it) ? REB_UNIK_RENK : [11, 12].includes(Number(x.it.ItemType)) ? '#e98ba6' : ''; ie.onmousemove = (ev) => ipucu(x.it, { count: x.m.count, sure: x.m }, ev, Number(x.m.price), x.m.count, !!x.m.kc, 'Sell Merchant'); ie.onmouseleave = ipucuKapat; ie.style.pointerEvents = 'auto'; }
        t('txt_grade', DERECE(x.it)); t('txt_type', 'Sell'); t('txt_count', String(hakli(x.it) && x.m.durability != null ? x.m.durability : x.m.count));
        const pe = t('txt_price', fmt(x.m.price) + (x.m.kc ? ' KC' : ' Noah')); if (pe) { pe.classList.toggle('pz-kc-fiyat', !!x.m.kc); if (!x.m.kc) pe.innerHTML = noahHtml(x.m.price, 14); }
        const se = g.querySelector('[data-id="txt_seller"]'); if (se) se.title = `${x.p.st.baslik || ''} · ${BOLGE(x.p.st.zone)}`;
        const go = g.querySelector('[data-id="btn_go"]'), pm = g.querySelector('[data-id="btn_pm"]');
        if (go) { go.classList.add('kui-tik'); go.onclick = (e) => { e.stopPropagation(); git(x.p); }; }
        if (pm) { pm.classList.add('kui-tik'); pm.onclick = (e) => { e.stopPropagation(); if (Number(x.p.st.char_id) === Number(character.id)) return; state.pm?.ac?.(Number(x.p.st.char_id), x.p.st.name); }; }
      });
    }
    liste.ciz = ciz;
    L.click('btn_search', () => { liste.arama = (inp?.value || '').trim(); liste.sayfa = 0; ciz(); });
    L.click('btn_sort_price', () => { liste.sirala = liste.sirala === 1 ? -1 : 1; ciz(); hud.info?.(liste.sirala === 1 ? 'Merchant list: lowest price first.' : 'Merchant list: highest price first.', 'soluk'); });
    L.click('btn_previous', () => { if (liste.sayfa > 0) { liste.sayfa--; ciz(); } });
    L.click('btn_next', () => { liste.sayfa++; ciz(); });
    L.click('btn_close', () => listeKapat());
    ciz();
  }
  const listeKapat = () => { liste?.L.el.remove(); liste = null; ipucuKapat(); };
  // KO: pazar pencereleri açıkken boş yere (oyun sahnesine) tıklanınca kapanır
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target?.id !== 'sahne') return;
    if (alis) alisKapat();
    if (liste) listeKapat();
    if (kur) kurmaKapat();
  }, true);
  // Git: aynı haritadaysa satıcının pazarının önüne ışınlan
  function git(p) {
    if (state.pazarAcik) return hud.notice?.('You cannot teleport while your shop is open.', 'hata');
    if (Number(p.st.char_id) === Number(character.id)) return hud.info?.('This is your shop.', 'soluk');
    if ((p.st.zone || 'moradon') !== (character.zone || 'moradon')) return hud.notice?.(`${p.st.name}'s shop is in ${BOLGE(p.st.zone)}; you can only teleport to shops on the same map.`, 'hata');
    if (state.combat?.genie?.oldum?.()) return;
    const yaw = Number(p.st.yaw) || 0, x = p.st.x + Math.sin(yaw) * 2.4, z = p.st.z + Math.cos(yaw) * 2.4;
    const pl = window.__ko?.player; if (!pl) return;
    state.combat?.cancelAttack?.(); state.target = null;
    pl.position.set(x, state.heightAt?.(x, z) ?? pl.position.y, z);
    state.yaw = yaw + Math.PI; pl.rotation.y = state.yaw;   // satıcıya dön
    state.net?.kick?.();
    hud.info?.(`You have teleported to ${p.st.name}'s shop.`, 'beceri'); listeKapat();
  }
  // Pazar eşyası ara (deadsoft re_merchant_eye): eşya adını yaz → Pazar Listesi o aramayla açılır
  function araAc() {
    if (!gozVar()) return hud.notice?.("You need a Slave Merchant Scroll (or Merchant's Eye) in your inventory to search shops.", 'hata');
    if (!hasLayout('re_merchant_eye')) return listeAc('', { goz: true });
    document.querySelector('.ko-pazar.pz-ara')?.remove();
    const L = pencere('re_merchant_eye', 'pz-sor pz-ara'); ortala(L.el, 260, 130);
    for (const t of L.el.querySelectorAll('.kui-tx')) { const x = t.textContent.trim(); if (/Merchant Item Search/i.test(x)) void t; }
    const inp = L.input('search_merchant', { maxLength: 30, placeholder: 'Item name → Enter' });
    const bitir = () => L.el.remove();
    inp?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const q = inp.value.trim(); bitir(); listeAc(q, { goz: true }); } if (e.key === 'Escape') bitir(); });
    L.click('btn_cancel', bitir);
    setTimeout(() => inp?.focus(), 30);
  }

  // ---------------- oturma / kapatma
  let kapaniyor = false;
  let oturuyor = false;
  function oturt(on) {
    state.pazarAcik = on; oturuyor = on; state.pazarOturuyor = on;
    // (4.11) kanatlı oyuncu pazar kurunca oturmaz: kanatlarıyla havada durur (main.js model / yayın yüksekliği state.pazarUcus)
    // (5.11) kanat takılıysa KO gibi uçarak oturur: wing_S (iniş) → wing_B (havada oturuş, döngü) → kalkarken wing_E (main.js klip: state.pazarKanat)
    const kanatli = !!state.avatar?.plugObj?.('kanatModel') && !!state.avatar?.has?.('wing_s');
    state.pazarUcus = 0;
    if (on) { state.target = null; state.frozen = true; if (kanatli) { oturuyor = false; state.pazarOturuyor = false; state.avatar?.stopOnce?.(); kanatOtur(true); } else { kanatOtur(false, true); state.avatar?.playOnce?.('sit', { hold: true }); } }
    else { state.frozen = false; state.avatar?.stopOnce?.(); kanatOtur(false); }
  }
  let kanatZ = 0;
  const kSure = (c) => Math.max(0.2, state.avatar?.sure?.(c) || 0.8) * 1000;
  function kanatOtur(on, aninda = false) {
    clearTimeout(kanatZ);
    if (on) { state.pazarKanat = { asama: 'iniyor' }; kanatZ = setTimeout(() => { if (state.pazarKanat) state.pazarKanat.asama = 'oturuyor'; }, kSure('wing_s')); return; }
    if (!state.pazarKanat) return;
    if (aninda) { state.pazarKanat = null; return; }
    state.pazarKanat = { asama: 'kalkiyor' }; kanatZ = setTimeout(() => { state.pazarKanat = null; }, kSure('wing_e'));
  }
  // pazar kurulu iken C: otur / kalk (pazar açık kalır, karakter yerinden kıpırdamaz)
  addEventListener('keydown', (e) => {
    if (!state.pazarAcik || e.code !== 'KeyC' || e.ctrlKey || e.altKey || e.metaKey || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (state.avatar?.plugObj?.('kanatModel') && state.avatar?.has?.('wing_s')) { const ot = state.pazarKanat && state.pazarKanat.asama !== 'kalkiyor'; state.avatar?.stopOnce?.(); kanatOtur(!ot); oturuyor = false; state.pazarOturuyor = false; return; }   // (5.11) kanatlı: uçarak otur / kalk
    oturuyor = !oturuyor; state.pazarOturuyor = oturuyor;   // (6.11) yayın: ayağa kalkınca diğerleri de ayakta görür
    if (oturuyor) state.avatar?.playOnce?.('sit', { hold: true }); else state.avatar?.stopOnce?.();
  }, true);
  // pazar kurulu iken yürümek istenirse (yere tıklama / yön tuşları): "Pazarı bozmak istiyor musunuz?"
  let soruAcik = false;
  const bozSor = () => {
    if (!state.pazarAcik || soruAcik) return;
    soruAcik = true;
    const bitti = () => { soruAcik = false; };
    onay('Do you want to quit vendor mode?').then((e) => { bitti(); if (e) kapat(); });
  };
  // (5.11) pazar kuruluyken oyunculara tıklama ve sağ tık serbest (seçim, oyuncu menüsü); karakter yerinden kıpırdamaz (state.frozen). Yön tuşları ve boş yere tıklama (main.js) bozmayı sorar.
  addEventListener('keydown', (e) => { if (state.pazarAcik && e.target.tagName !== 'INPUT' && /^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.code)) bozSor(); }, true);

  async function kapat() {
    // (31.10) yerel listede görünmese de (bölge / mesafe) sunucudaki açık pazar kapatılır
    kapaniyor = true;
    const d = await rpc('pazar_kapat'); kapaniyor = false; if (!d) return;
    if (!d.ok) { if (state.pazarAcik) oturt(false); return hud.notice?.(d.reason, 'hata'); }
    await state.inv?.reload?.(); oturt(false); await yukle();
    hud.info?.(`Ended vendor mode at ${saatKO2()}. `, 'esya');
    if (d.posta) hud.info?.(`${d.posta} item(s) were sent by mail because your inventory is full.`, 'esya');
  }
  // açılışta: önceki oturumdan açık kalan pazar kendiliğinden kapanır (oyundan çıkınca sunucu da 45 sn içinde kapatır: pazar_cevrimdisi_kapat)
  (async () => {
    const d = await rpc('pazar_oto_kapat');
    if (d?.kapandi) { await state.inv?.reload?.(); hud.info?.(d.posta ? `Your previous shop has been closed; ${d.posta} item(s) were sent by mail because your inventory is full.` : 'Your previous shop has been closed; unsold items were returned to your inventory.', 'esya'); }
    await yukle();
  })().catch(() => {});
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.target.tagName === 'INPUT') return;
    if (document.querySelector('.ko-pazar.pz-sor')) return;
    if (alis) { alisKapat(); e.stopImmediatePropagation(); } else if (kur) { kurIptal(); e.stopImmediatePropagation(); } else if (liste) { listeKapat(); e.stopImmediatePropagation(); }
  }, true);
  // çanta değişince açık pencereleri tazele
  setInterval(() => { kur?.ciz?.(); }, 1500);

  alim = initAlim({ sb, character, state, hud, IT, esyalar, pencere, ortala, ipucu, ipucuKapat, onay, fmt, rpc, oturt, yukle, PAZAR, benimPazar, kurBekliyor });
  return { bozSor: () => bozSor(), duzenle: () => alisAc(Number(character.id)), kur: secimAc, satisKur: kurmaAc, kapat, liste: listeAc, ara: araAc, get acik() { return !!(benimPazar() || state.pazarAcik); }, yukle, saticiMi: (id) => PAZAR.has(Number(id)) && Number(id) !== Number(character.id), bak: (id) => alisAc(Number(id)) };
}
