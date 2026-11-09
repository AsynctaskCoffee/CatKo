// (5.11) KO Buying Merchant — orijinal KnightOnlineEn arayüzleri (assets/ui/buystore):
//  re_buystoreindex "Item Wish List": 12 istek yuvası + mesaj; boş yuvaya tıklayınca Item Search açılır; O K → onay listesi (list) → alim_ac
//  re_buystorefind "Item Search": ad araması (esya_ara) → Item Select listesi → sürümler (esya_varyant) Basic / Property / Reverse / Favorites
//    sekmeleri ve Upgrade süzgeci; Quantity + Wish Noah Amount to Purchase → Registration (istek listesine)
//  re_buystoreinven: başka oyuncu alıcının tabelasına tıklayınca — üstte istenen eşyalar, altta kendi çantası; çantadan eşya seçip
//    istenen yuvaya tıklayarak satar (alim_sat; adet sorusu msg_count)
// Sunucu: merchant_stalls.tur = 'al', alim_items (char_id, idx, item_num, count, price). Noah alıcıda kalır, satışta aktarılır.
import { hasLayout, ekUI } from './kui.js';
import { iconHtml } from './esya.js';

export function initAlim(ctx) {
  const { sb, character, state, hud, IT, esyalar, pencere, ortala, ipucu, ipucuKapat, onay, fmt, rpc, oturt, yukle, PAZAR, benimPazar, kurBekliyor } = ctx;
  const FAV = 'ko-alim-favori';
  const favOku = () => { try { return JSON.parse(localStorage.getItem(FAV) || '[]').map(Number); } catch { return []; } };
  const favYaz = (l) => { try { localStorage.setItem(FAV, JSON.stringify(l)); } catch {} };
  const etiket = (L, id, metin) => {   // düğme yazısı (KO düğmesinin üstünde ortalı)
    for (const b of L.all(id)) { let s = b.querySelector(':scope > .alm-et'); if (!s) { s = document.createElement('span'); s.className = 'alm-et'; b.append(s); } s.textContent = metin; }
  };
  const baslik = (L, rx, metin) => { for (const t of L.el.querySelectorAll('.kui-tx')) if (rx.test(t.textContent.trim()) || t.dataset.id === 'text_name') { t.textContent = metin; t.classList.add('baslik-ince', 'alm-baslik'); return; } };
  const yuklenir = () => ekUI('buystore').catch(() => false);
  // (6.11) KO kaydırma çubuğu (CN3UIScrollBar 'sc': ▲ düğmesi, iz 'tr' + sarı tutamak, ▼ düğmesi). o: { max(), al(), ver(v), adim }
  //   tutamak sürüklenir, ize tıklayınca oraya atlar, ▲ / ▼ adım adım; guncelle() tutamağı değere göre yerleştirir
  function kaydirma(sc, o) {
    if (!sc) return { guncelle() {} };
    const [yukari, asagi] = [...sc.querySelectorAll(':scope > .kui-btn')];
    const iz = sc.querySelector(':scope > .kui-tr'), tut = iz?.querySelectorAll(':scope > .kui-img')[1];
    const izH = () => iz.offsetHeight, tutH = () => tut.offsetHeight;
    const oran = () => (iz.getBoundingClientRect().height / (izH() || 1)) || 1;
    const ver = (v) => { const m = Math.max(0, o.max()); o.ver(Math.max(0, Math.min(m, v))); guncelle(); };
    function guncelle() {
      if (!iz || !tut) return; const m = Math.max(0, o.max()), bos = Math.max(0, izH() - tutH());
      tut.style.top = (m > 0 ? Math.round((Math.min(o.al(), m) / m) * bos) : 0) + 'px'; tut.style.pointerEvents = 'auto'; tut.style.cursor = 'pointer';
    }
    for (const [b, d] of [[yukari, -1], [asagi, 1]]) if (b) { b.style.pointerEvents = 'auto'; b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); ver(o.al() + d * (o.adim || 1)); }; }
    if (iz && tut) {
      iz.style.pointerEvents = 'auto';
      iz.onpointerdown = (e) => {
        e.stopPropagation(); e.preventDefault();
        const r = iz.getBoundingClientRect(), k = oran(), bos = Math.max(1, izH() - tutH()), m = Math.max(0, o.max());
        if (e.target !== tut) { ver(Math.round((((e.clientY - r.top) / k - tutH() / 2) / bos) * m)); return; }
        const t0 = parseFloat(tut.style.top) || 0, y0 = e.clientY;
        const hareket = (ev) => { const t = Math.max(0, Math.min(bos, t0 + (ev.clientY - y0) / k)); ver(Math.round((t / bos) * m)); };
        const birak = () => { removeEventListener('pointermove', hareket); removeEventListener('pointerup', birak); };
        addEventListener('pointermove', hareket); addEventListener('pointerup', birak);
      };
    }
    guncelle();
    return { guncelle };
  }

  // ---------------- Item Wish List
  let W = null;   // { L, liste: Array(12), ara }
  function kapat() { if (W?.ara) W.ara.L.el.remove(); W?.L.el.remove(); W = null; ipucuKapat(); }
  async function ac() {
    if (kurBekliyor()) return;
    if (benimPazar()) return hud.notice?.('Your shop is already open. To close it, choose "Close shop" from the H menu.', 'hata');
    if ((character.zone || 'moradon') !== 'moradon') return hud.mesaj?.('Merchant', 'A shop can only be opened in Moradon.') || hud.notice?.('A shop can only be opened in Moradon.', 'hata');
    if (!(await yuklenir()) || !hasLayout('re_buystoreindex')) return hud.notice?.('Failed to load the Buying Merchant interface.', 'hata');
    kapat();
    const L = pencere('re_buystoreindex', 'pz-alim'); ortala(L.el, 418, 327);
    W = { L, liste: Array(12).fill(null), ara: null, kay: 0 };
    L.show('list', false);
    { const g = L.get('list'); if (g) { g.style.zIndex = 50; g.style.pointerEvents = 'auto'; } }   // (6.11) onay listesi DOM'da 'main'den önce: üstte kalsın (O K sonrası liste görünmüyordu → pazar kurulamıyordu)
    for (let i = 0; i < 12; i++) { L.show('img_X' + i, false); L.text('str' + i, ''); }
    baslik(L, /^Item Wish List$/i, 'Item Wish List');
    etiket(L, 'btn_ok', 'O K');   // Cancel yazısı dokuda
    const msj = L.input('edit_text', { maxLength: 40 }); if (msj) { msj.onkeydown = (e) => e.stopPropagation(); try { msj.value = localStorage.getItem('ko-alim-mesaj-' + character.id) || ''; } catch {} }
    W.msj = msj;
    L.click('btn_cancle', kapat); L.click('btn_close', kapat);
    L.click('btn_ok', onayAc);
    for (let i = 0; i < 12; i++) {
      const a = L.get('area' + i); if (!a) continue;
      a.classList.add('pz-yuva', 'kui-tik'); a.style.pointerEvents = 'auto';
      a.onclick = (e) => { e.stopPropagation(); araAc(i); };
      a.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); if (W.liste[i]) { W.liste[i] = null; ciz(); ipucuKapat(); } };
      a.onmousemove = (ev) => { const x = W?.liste[i], it = x && IT.get(x.num); if (it) ipucu(it, { count: x.count }, ev, x.price, x.count, false, 'Buy Merchant'); };
      a.onmouseleave = ipucuKapat;
    }
    // onay listesi (list): istenen eşyalar ve toplam tutar
    etiket(L, 'btn_msg_ok', 'Confirm');   // (6.11) onay listesinin düğmesinde yazı yoktu
    L.click('btn_msg_ok', gonder); L.click('btn_msg_cancle', () => L.show('list', false)); L.click('btn_msg_close', () => L.show('list', false));
    L.get('list')?.addEventListener('wheel', (e) => { e.preventDefault(); W.kay = Math.max(0, Math.min(Math.max(0, W.liste.filter(Boolean).length - 4), W.kay + Math.sign(e.deltaY))); listeCiz(); }, { passive: false });
    ciz();
  }
  function ciz() {
    if (!W) return;
    for (let i = 0; i < 12; i++) {
      const a = W.L.get('area' + i), x = W.liste[i], it = x && IT.get(x.num); if (!a) continue;
      a.innerHTML = it ? iconHtml(it, 45) : '';
      W.L.text('str' + i, x && x.count > 1 ? String(x.count) : '');
    }
  }
  const toplam = (haric = -1) => W.liste.reduce((t, x, i) => t + (x && i !== haric ? x.price * x.count : 0), 0);
  function listeCiz() {
    const l = W.liste.filter(Boolean);
    for (let k = 0; k < 4; k++) { const x = l[W.kay + k], it = x && IT.get(x.num); W.L.text('text' + k, it ? it.strName : ''); W.L.text('text' + (k + 4), x ? `${fmt(x.count)} x ${fmt(x.price)} = ${fmt(x.count * x.price)}` : ''); }
    W.L.text('str_TotalPrice', fmt(toplam()));
  }
  function onayAc() {
    if (!W.liste.some(Boolean)) return hud.notice?.('Add the items you want to buy to the wish list.', 'hata');
    { const i = W.liste.findIndex((x) => x && !(x.price >= 1)); if (i >= 0) { hud.notice?.('Enter the Noah amount you wish to pay.', 'hata'); araAc(i); return; } }   // (6.11) fiyatı girilmemiş yuva
    if (toplam() > Number(state.combat?.stats?.gold ?? 0)) return hud.notice?.('The total purchase amount exceeds your Noah.', 'hata');
    W.kay = 0; listeCiz(); W.L.show('list', true);
  }
  async function gonder() {
    const p = window.__ko?.player?.position;
    const liste = W.liste.map((x, i) => x && { idx: i, num: x.num, count: x.count, price: x.price }).filter(Boolean);
    const baslikMetni = W.msj?.value || '';
    try { localStorage.setItem('ko-alim-mesaj-' + character.id, baslikMetni); } catch {}
    // (6.11) KO: alım pazarı da oyuncunun baktığı yöne kurulur (Selling Merchant gibi: durur, tezgâh önüne)
    const pl = window.__ko?.player; state.target = null; state.keys?.clear?.(); const donmus = state.frozen; state.frozen = true;
    const yaw = state.yaw ?? pl?.rotation?.y ?? 0;
    const d = await rpc('alim_ac', { p_baslik: baslikMetni, p_liste: liste, p_x: p?.x ?? null, p_z: p?.z ?? null });
    if (!d || !d.ok) { state.frozen = donmus; if (d) hud.notice?.(d.reason, 'hata'); return; }
    await rpc('pazar_yon', { p_yaw: yaw });
    kapat(); document.querySelectorAll('.ko-pazar.pz-alim, .ko-pazar.pz-alim-ara, .ko-pazar.pz-onay, .ko-pazar.pz-sor').forEach((e) => e.remove()); state.keys?.clear?.();   // (6.11) arta kalan pencere tıklamaları kapatmasın
    oturt(true); await yukle();
    hud.info?.(`Initiated vendor mode at ${new Date().getHours()}hour ${new Date().getMinutes()}minute. `, 'esya');   // (6.11) KO Texts_us 7706 (Selling Merchant ile aynı satır)
  }

  // ---------------- Item Search
  async function araAc(idx) {
    if (!W) return;
    if (W.ara) { W.ara.idx = idx; W.ara.doldur?.(); W.ara.ciz(); return; }
    const L = pencere('re_buystorefind', 'pz-alim-ara');
    // (6.11) KO: Item Search, Item Wish List penceresinin tam önünde (ortası ortasına)
    { const r = W.L.el.getBoundingClientRect(), b = L.el.getBoundingClientRect(), wr = b.width || 423, hr = b.height || 723;
      L.el.style.left = Math.max(0, Math.min(innerWidth - wr, r.left + (r.width - wr) / 2)) + 'px'; L.el.style.top = Math.max(0, Math.min(innerHeight - hr, r.top + (r.height - hr) / 2)) + 'px'; L.el.style.zIndex = Number(getComputedStyle(W.L.el).zIndex || 0) + 1 || ''; }
    const A = W.ara = { L, idx, sonuc: [], ad: null, varyant: [], arti: null, sekme: 'temel', secili: null, kay: 0, ciz: null };
    // KO başlık ve yazılar (uif'teki Korece yer tutucular İngilizceye)
    { const tn = L.get('text_name'); if (tn) { tn.textContent = 'Item Search'; tn.classList.add('baslik-ince', 'alm-baslik'); } }
    // (6.11) alt bölüm parça birleşimleri atlasta düzeltildi (tools/buystore_kenar.py: saydam kenar doldurma + opak)
    const Y = { text_find: 'Item Select', text_upgrade: 'Upgrade', text_num: 'Quantity', text_price: 'Wish Noah Amount to Purchase', text_weighttext: 'Possession Amount', text_total: 'Current Possession of Noah', str_Tooltip: 'Are you sure you want to delete it?' };
    for (const [k, v] of Object.entries(Y)) L.text(k, v);
    for (const t of L.all('str_string')) t.textContent = '';
    etiket(L, 'btn_nomal', 'Basic'); etiket(L, 'btn_affect', 'Property'); etiket(L, 'btn_reverse', 'Reverse'); etiket(L, 'btn_favorite', 'Favorites');
    for (const t of L.el.querySelectorAll('[data-id="title"], [data-id="title0"], [data-id="title1"]')) t.textContent = '';
    etiket(L, 'btn_addfavorite', 'Add Favorites'); etiket(L, 'btn_delfavorite', 'Delete Favorites');
    etiket(L, 'btn_ok', 'Registration'); etiket(L, 'btn_cancle', 'Cancel'); etiket(L, 'btn_delok', 'OK'); etiket(L, 'btn_delcancel', 'Cancel');
    for (const id of ['base_upgrade', 'base_find', 'base_favorite_box', 'img_select', 'btn_delfavorite']) L.show(id, false);
    const kapa = () => { L.el.remove(); if (W) W.ara = null; ipucuKapat(); };
    L.click('btn_close', kapa); L.click('btn_cancle', kapa);
    const ad = L.input('edit_name', { maxLength: 30 }), adet = L.input('edit_num', { type: 'number', min: 1, max: 9999, value: 1 }), fiyat = L.input('edit_noah', { type: 'number', min: 1, max: 2100000000 });
    for (const i of [ad, adet, fiyat]) if (i) { i.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && i === ad) ara(); }; i.oninput = () => ozet(); }
    const liste = (id, satirlar, sec) => {   // KO liste kutusu (CN3UIList)
      const ls = L.get(id); if (!ls) return;
      let k = ls.querySelector(':scope > .alm-liste');
      if (!k) {
        k = document.createElement('div'); k.className = 'alm-liste'; ls.prepend(k); k.addEventListener('wheel', (e) => { e.preventDefault(); k.scrollTop += Math.sign(e.deltaY) * 18; }, { passive: false });
        k._kay = kaydirma(ls.querySelector(':scope > .kui-sc'), { max: () => k.scrollHeight - k.clientHeight, al: () => k.scrollTop, ver: (v) => { k.scrollTop = v; }, adim: 18 });
        k.addEventListener('scroll', () => k._kay.guncelle());
      }
      k.innerHTML = ''; satirlar.forEach((s, i) => { const d = document.createElement('div'); d.className = 'alm-satir'; d.textContent = s; d.onclick = (e) => { e.stopPropagation(); k.querySelectorAll('.alm-satir').forEach((x) => x.classList.remove('secili')); d.classList.add('secili'); sec(i); }; k.append(d); });
      k.scrollTop = 0; requestAnimationFrame(() => k._kay?.guncelle());
    };
    async function ara() {
      const q = (ad?.value || '').trim(); if (q.length < 2) return hud.notice?.('Enter at least 2 characters.', 'hata');
      const { data } = await sb.rpc('esya_ara', { p_q: q }); A.sonuc = Array.isArray(data) ? data : [];
      if (!A.sonuc.length) { hud.notice?.('No items found.', 'hata'); return; }
      liste('list_find', A.sonuc, (i) => adSec(A.sonuc[i])); L.show('base_find', true); L.show('base_upgrade', false);
    }
    L.click('btn_name', ara);
    L.click('btn_find_list', () => { if (!A.sonuc.length) return ara(); const ac2 = L.get('base_find')?.hidden; L.show('base_find', !!ac2); L.show('base_upgrade', false); });
    L.click('btn_upgrade_list', () => {
      if (!A.varyant.length) return;
      // (6.11) Upgrade listesi: seçili adın tüm sekmelerdeki (Basic / Property / Reverse) seviyeleri
      const seviyeler = [...new Set(A.varyant.filter((v) => sekmeUygun(v, 'temel') || sekmeUygun(v, 'ozel') || sekmeUygun(v, 'reb')).map((v) => v.arti))].sort((a, b) => a - b);
      liste('list_upgrade', seviyeler.map((n) => '+' + n), (i) => { A.arti = seviyeler[i]; L.text('text_upgrade', '+' + A.arti); L.show('base_upgrade', false); A.kay = 0; A.secili = null; A.ciz();
        esyalar(A.varyant.filter((v) => v.arti === A.arti && sekmeUygun(v, 'ozel')).map((v) => v.num)).catch(() => {}); });   // Property sekmesi de hazır
      const ac2 = L.get('base_upgrade')?.hidden; L.show('base_upgrade', !!ac2); L.show('base_find', false);
    });
    async function adSec(s) {
      A.ad = s; L.text('text_find', s); L.show('base_find', false); A.arti = null; L.text('text_upgrade', 'Upgrade'); A.secili = null; A.kay = 0;
      const { data } = await sb.rpc('esya_varyant', { p_ad: s }); A.varyant = Array.isArray(data) ? data : [];
      A.ciz();   // (6.11) yalnız görünen 35 yuvanın eşya bilgisi indirilir (ciz)
      // (6.11) Upgrade seçilince eşya beklemeden düşsün: tüm seviyelerin Basic (seviye başına tek) ve Reverse sürümleri önceden indirilir
      { const b = new Map(); for (const v of [...A.varyant].sort((x, y) => Number(x.num) - Number(y.num))) if (sekmeUygun(v, 'temel') && !b.has(v.arti)) b.set(v.arti, v.num);
        esyalar([...b.values(), ...A.varyant.filter((v) => sekmeUygun(v, 'reb')).map((v) => v.num)]).catch(() => {}); }
    }
    const sekme = (k) => { A.sekme = k; A.kay = 0; A.secili = null; A.ciz(); };
    L.click('btn_nomal', () => sekme('temel')); L.click('btn_affect', () => sekme('ozel')); L.click('btn_reverse', () => sekme('reb')); L.click('btn_favorite', () => sekme('fav'));
    L.click('btn_addfavorite', () => { if (!A.secili) return hud.notice?.('Select an item first.', 'hata'); const f = favOku(); if (!f.includes(A.secili)) { f.push(A.secili); favYaz(f); } hud.info?.('Added to favorites.', 'soluk'); });
    L.click('btn_delfavorite', () => { if (!A.secili) return hud.notice?.('Select an item first.', 'hata'); L.show('base_favorite_box', true); });
    L.click('btn_delok', () => { favYaz(favOku().filter((n) => n !== A.secili)); A.secili = null; L.show('base_favorite_box', false); A.ciz(); });
    L.click('btn_delcancel', () => L.show('base_favorite_box', false));
    const sekmeUygun = (v, k) => {
      const n = Number(v.num), t = Number(v.tip); if (n >= 900000000) return false;   // özel / etkinlik numaraları
      // (6.11) Reverse: KO tablolarındaki özgün reverse eşyalar (ItemType 11; zırhta STR / HP / DEX / INT / MP / Saint / Light / Special Defense, +1…+30)
      //   ve rebirth (ItemType 12); goster() özgünü varsa yalnız onları gösterir
      if (k === 'reb') return !!v.reb || t === 11;
      if (v.reb || t === 11) return false;
      // (6.11) Property: aynı yükseltme eşyasının scroll ile basılmış hali — silahta Blessed Elemental (ateş / buz / şimşek / zehir),
      //   zırhta tek stat scroll'u (STR / HP / DEX / INT / MP). Basic: hiç bonusu olmayan düz hâli.
      if (k === 'ozel') return (t === 5 || (t === 0 && !v.arti)) && (v.silah ? !!v.el : !!v.st && !v.el);
      return !v.ozel && [0, 5].includes(t);
    };
    const goster = () => {
      if (A.sekme === 'fav') return favOku();
      // (6.11) KO: ad + Upgrade seçilince eşya ızgaraya düşer. Basic: o seviyenin düz eşyası (tek); Property: özellikli (Magic / Rare) sürümler;
      //   Reverse: aynı seviyenin reverse (rebirth, ItemType 12) sürümü. Upgrade seçilmeden ızgara boş.
      if (A.arti == null) return [];
      // (6.11) Reverse'te de: düz reverse, sonra STR / HP / DEX / INT / MP (zırh) ya da element sırası
      const SIRA = { str: 1, hp: 2, dex: 3, int: 4, mp: 5, f: 1, i: 2, l: 3, p: 4 }, sira = (v) => (v.el || v.st ? SIRA[v.el || v.st] || 9 : Number(v.tip) === 11 ? 9 : 0);   // özgün reverse: Saint / Light / Special Defense sonda
      let l0 = A.varyant.filter((v) => v.arti === A.arti && sekmeUygun(v, A.sekme));
      if (A.sekme === 'reb' && l0.some((v) => Number(v.tip) === 11)) l0 = l0.filter((v) => Number(v.tip) === 11);
      const l = l0.sort((a, b) => (A.sekme !== 'temel' ? sira(a) - sira(b) : 0) || Number(a.num) - Number(b.num));
      const tekil = A.sekme !== 'temel' ? l.filter((v, i) => l.findIndex((x) => (x.el || x.st || x.num) === (v.el || v.st || v.num)) === i) : l;   // her scroll türünden bir tane
      return (A.sekme === 'temel' ? l.slice(0, 1) : tekil).map((v) => v.num);
    };
    const grid = L.get('area0')?.parentElement;
    const kayMax = () => Math.max(0, Math.ceil(goster().length / 5) - 7);
    grid?.addEventListener('wheel', (e) => { e.preventDefault(); A.kay = Math.max(0, Math.min(kayMax(), A.kay + Math.sign(e.deltaY))); A.ciz(); }, { passive: false });
    const izgaraKay = kaydirma(L.get('scroll_inven'), { max: kayMax, al: () => A.kay, ver: (v) => { if (v !== A.kay) { A.kay = v; A.ciz(); } } });
    A.ciz = async function ciz() {
      const nums = goster(); izgaraKay.guncelle(); await esyalar(nums.slice(A.kay * 5, A.kay * 5 + 35));
      if (A.sekme !== 'fav' && !nums.map(Number).includes(A.secili) && !(A.arti == null && Number(W.liste[A.idx]?.num) === A.secili)) A.secili = nums.length === 1 ? Number(nums[0]) : null;   // tek eşya: kendiliğinden seçili
      const fav = A.sekme === 'fav'; L.show('btn_addfavorite', !fav); L.show('btn_delfavorite', fav);
      for (const [id, k] of [['btn_nomal', 'temel'], ['btn_affect', 'ozel'], ['btn_reverse', 'reb'], ['btn_favorite', 'fav']]) L.get(id)?.classList.toggle('secili', A.sekme === k);
      let sec = null;
      for (let i = 0; i < 35; i++) {
        const a = L.get('area' + i); if (!a) continue;
        const num = nums[A.kay * 5 + i], it = num && IT.get(Number(num));
        a.innerHTML = it ? iconHtml(it, 45) : ''; a.style.pointerEvents = 'auto'; a.style.zIndex = 2; a.classList.add('pz-yuva');   // (6.11) seçim çerçevesi (img_select) ikonun altında: seçili eşya soluk görünmesin
        a.onclick = it ? (e) => { e.stopPropagation(); A.secili = Number(num); ciz(); ozet(); } : null;
        a.onmousemove = it ? (ev) => ipucu(it, {}, ev, null, 1, false, '') : null; a.onmouseleave = ipucuKapat;
        if (it && Number(num) === A.secili) sec = a;
      }
      const im = L.get('img_select');
      if (im) { im.hidden = !sec; if (sec) { im.style.left = sec.style.left; im.style.top = sec.style.top; im.style.width = sec.style.width; im.style.height = sec.style.height; im.style.zIndex = 3; im.style.pointerEvents = 'none'; im.classList.add('alm-secim'); } }   // (6.11) çerçeve ikonla birebir aynı kutuda, ortası boş (CSS maske)
      ozet();
    };
    function ozet() {
      const ab = state.combat?.stats?.ability || {}, w = Number(ab.weight ?? 0), mw = Number(ab.max_weight ?? 0);
      L.text('text_weight', `${(w / 10).toFixed(1)} / ${(mw / 10).toFixed(1)}`);
      const bu = (Number(adet?.value) || 0) * (Number(fiyat?.value) || 0);
      L.text('text_noah', `${fmt(toplam(A.idx) + bu)}/${fmt(state.combat?.stats?.gold ?? 0)}`);
    }
    L.click('btn_ok', () => {
      const it = A.secili && IT.get(A.secili); if (!it) return hud.notice?.('Select the item you want to buy.', 'hata');
      // (6.11) KO: seçili eşya onaylanınca Wish List'teki seçili yuvaya yerleşir; adet boşsa 1; Wish Noah Amount girilmeden eklenmez
      const n = Math.max(1, Math.min(9999, Math.floor(Number(adet?.value) || 1))), f = Math.floor(Number(fiyat?.value) || 0);
      if (!(f >= 1 && f <= 2100000000)) { fiyat?.focus(); return hud.notice?.('Enter the Noah amount you wish to pay.', 'hata'); }
      if (toplam(A.idx) + n * f > Number(state.combat?.stats?.gold ?? 0)) return hud.notice?.('The total purchase amount exceeds your Noah.', 'hata');
      W.liste[A.idx] = { num: A.secili, count: n, price: f }; ciz(); kapa();
    });
    // (6.11) dolu yuva açılınca: eşya seçili, adet / fiyat dolu (fiyat düzenlenip yeniden Registration)
    A.doldur = () => { const x = W.liste[A.idx]; if (!x) return; A.secili = Number(x.num); if (adet) adet.value = x.count; if (fiyat) fiyat.value = x.price || '';  };
    A.doldur(); ozet(); A.ciz();
  }

  // ---------------- başkasının alım pazarı (re_buystoreinven): çantadan eşya satma
  let B = null;
  function bakKapat() { document.querySelectorAll('.pz-alimbak').forEach((e) => e.remove()); B?.L.el.remove(); if (B?.satici != null && B.satici !== Number(character.id)) sb.rpc('pazar_bak', { p_char: character.id, p_satici: B.satici, p_ac: false }).then(() => {}, () => {}); B = null; ipucuKapat(); }
  // (6.11) art arda tıklamada tek pencere (eskiden her tıklama ayrı pencere açıyor, kapat düğmesi yalnız sonuncuyu kapatıyordu)
  let bakAciliyor = false;
  async function bak(satici) {
    if (bakAciliyor) return;
    if (B && B.satici === Number(satici) && B.L.el.isConnected) return;
    bakAciliyor = true;
    try { await bak0(satici); } finally { bakAciliyor = false; }
  }
  async function bak0(satici) {
    if (!(await yuklenir()) || !hasLayout('re_buystoreinven')) return hud.notice?.('Failed to load the Buying Merchant interface.', 'hata');
    if (B) bakKapat();
    const kendi = Number(satici) === Number(character.id);
    if (!kendi) { const d = await rpc('pazar_bak', { p_satici: satici, p_ac: true }); if (!d) return; if (!d.ok) return hud.mesaj?.('Merchant', d.reason) || hud.notice?.(d.reason, 'hata'); }
    const L = pencere('re_buystoreinven', 'pz-alimbak'); ortala(L.el, 401, 524);
    B = { L, satici: Number(satici), kendi, sec: null };
    for (const id of ['msg_ok', 'msg_count']) L.show(id, false);
    for (let i = 0; i < 12; i++) L.text('str_ext' + i, '');
    L.click('btn_close', bakKapat); L.click('btn_ok', bakKapat);
    L.click('btn_msg_count_cancle', () => L.show('msg_count', false));
    B.adetInp = L.input('edit_count', { type: 'number', min: 1 }); if (B.adetInp) B.adetInp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') L.get('btn_msg_count_ok')?.click(); };
    B.ciz = () => {
      const p = PAZAR.get(B.satici); if (!p) return bakKapat();
      for (let i = 0; i < 12; i++) {
        const m = p.items.find((x) => x.idx === i), it = m && IT.get(Number(m.item_num)), a = L.get('u' + i);
        L.text('stru' + i, m && m.count > 1 ? String(m.count) : '');
        if (!a) continue;
        a.innerHTML = it ? iconHtml(it, 45) : ''; a.classList.add('pz-yuva'); a.style.pointerEvents = 'auto';
        a.onmousemove = it ? (ev) => ipucu(it, { count: m.count }, ev, Number(m.price), m.count, false, 'Buy Merchant') : null; a.onmouseleave = ipucuKapat;
        a.onclick = (e) => { e.stopPropagation(); if (m && !B.kendi) satisBasla(m, it); };
      }
      for (let i = 0; i < 28; i++) {
        const e = state.inv?.items?.get(14 + i), a = L.get('area' + i);
        L.text('str' + i, e && (e.row.count || 1) > 1 ? String(e.row.count) : '');
        if (!a) continue;
        a.innerHTML = e?.it ? iconHtml(e.it, 45) : ''; a.classList.add('pz-yuva'); a.style.pointerEvents = 'auto';
        a.classList.toggle('alm-secili', B.sec === 14 + i && !!e);
        a.onmousemove = e?.it ? (ev) => ipucu(e.it, { count: e.row.count, sure: e.row }, ev, null, e.row.count, false, 'Inventory') : null; a.onmouseleave = ipucuKapat;
        a.onclick = (ev) => { ev.stopPropagation(); if (B.kendi || !e) return; B.sec = B.sec === 14 + i ? null : 14 + i; B.ciz(); };
        a.onpointerdown = (ev) => { if (ev.button !== 0 || B.kendi || !e?.it) return; ev.stopPropagation(); surukle(ev, 14 + i, e); };
      }
      L.text('text_gold', fmt(state.combat?.stats?.gold ?? 0));
    };
    // (6.11) KO: çantadaki eşyayı istenen yuvaya sürükleyip bırakınca satış (yalnız aynı eşya)
    function surukle(ev0, slot, e) {
      let g = null; const x0 = ev0.clientX, y0 = ev0.clientY;
      const hareket = (ev) => {
        if (!g && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
        if (!g) { g = document.createElement('div'); g.className = 'pz-hayalet'; g.innerHTML = iconHtml(e.it, 40); document.body.append(g); ipucuKapat(); }
        g.style.left = ev.clientX - 20 + 'px'; g.style.top = ev.clientY - 20 + 'px';
      };
      const birak = (ev) => {
        removeEventListener('pointermove', hareket); removeEventListener('pointerup', birak);
        if (!g) return; g.remove();
        const hedef = document.elementsFromPoint(ev.clientX, ev.clientY).map((n) => n.closest?.('[data-id]')).find((n) => n && /^u([0-9]|1[01])$/.test(n.dataset.id) && L.el.contains(n));
        if (!hedef) return;
        const p = PAZAR.get(B.satici), m = p?.items.find((x) => x.idx === Number(hedef.dataset.id.slice(1)));
        if (!m) return;
        if (Number(e.row.item_num) !== Number(m.item_num)) return hud.notice?.('This is not the item the buyer wants.', 'hata');
        B.sec = slot; B.ciz(); satisBasla(m, IT.get(Number(m.item_num)));
      };
      addEventListener('pointermove', hareket); addEventListener('pointerup', birak);
    }
    function satisBasla(m, it) {
      const e = B.sec != null ? state.inv?.items?.get(B.sec) : null;
      if (!e) return hud.notice?.('Select the item to sell from your inventory first.', 'hata');
      if (Number(e.row.item_num) !== Number(m.item_num)) return hud.notice?.('This is not the item the buyer wants.', 'hata');
      const enCok = Math.min(m.count, Number(it?.Countable) > 0 ? Number(e.row.count) || 1 : 1);
      const sat = async (n) => {
        const p = window.__ko?.player?.position;
        const d = await rpc('alim_sat', { p_alici: B.satici, p_idx: m.idx, p_slot: B.sec, p_count: n, p_x: p?.x ?? 0, p_z: p?.z ?? 0 });
        if (!d) return; if (!d.ok) return hud.notice?.(d.reason, 'hata');
        // (6.11) KO Texts_us 7703: "Item Sold: %dh %dm ; Buyer: %s ; Item: %s" (alıcı = alım pazarını kuran)
        { const t = new Date(), rm = state.remotes?.get(String(B.satici)) || state.remotes?.get(Number(B.satici));
          const yaz = (ad) => hud.info?.(`Item Sold: ${t.getHours()}h ${t.getMinutes()}m ; Buyer: ${ad || '-'} ; Item: ${d.ad}${d.adet > 1 ? ' x' + d.adet : ''}`, 'pazar-satis');
          if (rm?.meta?.name) yaz(rm.meta.name); else sb.from('characters').select('name').eq('id', B.satici).maybeSingle().then(({ data }) => yaz(data?.name), () => yaz()); }
        if (d.gold != null) state.combat?.applyStats?.({ gold: d.gold });
        B.sec = null; await state.inv?.reload?.(); await yukle(); B?.ciz?.();
      };
      if (enCok <= 1) return onay(`Do you want to sell ${it?.strName || 'this item'} for ${fmt(m.price)} Noah?`).then((ok) => ok && sat(1));
      if (B.adetInp) { B.adetInp.max = enCok; B.adetInp.value = enCok; }
      L.show('msg_count', true); setTimeout(() => { B.adetInp?.focus(); B.adetInp?.select?.(); }, 30);
      L.click('btn_msg_count_ok', () => { const n = Math.floor(Number(B.adetInp?.value) || 0); if (!(n >= 1 && n <= enCok)) return B.adetInp?.focus(); L.show('msg_count', false); onay(`Do you want to sell ${n} ${it?.strName || 'item'} for ${fmt(m.price * n)} Noah?`).then((ok) => ok && sat(n)); });   // (6.11) adetli satışta da onay
    }
    B.ciz();
  }
  return { ac, bak, yenile: () => B?.ciz?.(), kapat: () => { kapat(); bakKapat(); } };
}
