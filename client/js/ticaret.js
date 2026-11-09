// NPC hizmetleri (KO): Ticaret (al/sat), Depo, Tamir, İyileştirme, Eşya yükseltme.
// Tüccar listeleri sunucuda (npc_shop; KO itemsell_table + NPC iSellingGroup). GM, çantadan tezgâha eşya sürükleyince
// fiyat penceresi açılır ve eşyayı o fiyatla tezgâha koyar. Oyuncu çantadan sürükleyince satış onayı sorulur.
import { loadMeta, iconHtml, noahHtml, tooltipHtml, fromDb, hakli, nameColor } from './esya.js';
import { koWindow, toFront } from './ko-pencere.js';
import { sesUi } from './ses.js';
import { findSprite, paintSprite, hasLayout, buildLayout } from './kui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const noah = (n) => Number(n || 0).toLocaleString('tr-TR');
const SAYFA = 24;

export function initTicaret({ sb, character, hud, state, isGm, konum = null }) {
  const IT = new Map();   // num → eşya (esya.js biçimi)
  async function esyalar(nums) {
    const eksik = [...new Set(nums)].filter((n) => !IT.has(n));
    for (let i = 0; i < eksik.length; i += 150) {
      const { data } = await sb.from('items').select('*').in('num', eksik.slice(i, i + 150));
      for (const r of data || []) IT.set(r.num, { ...fromDb(r), _db: r });
    }
    return nums.map((n) => IT.get(n)).filter(Boolean);
  }
  // sunucu NPC yakınlığını kayıtlı konumdan denetler → işlemden önce güncel konum yazılır (5 sn'lik kayıt gecikmesi olmasın)
  let sonKonum = 0, sonYer = null;
  const konumYaz = async () => {
    const p = konum?.(); if (!p || performance.now() - sonKonum < 1500) return;
    // (2.11) karakter yerinden oynamadıysa (NPC başında duruyorsa) yeniden yazılmaz → her depo / dükkân işleminde fazladan istek yok
    if (sonYer && Math.hypot(p.x - sonYer.x, p.z - sonYer.z) < 1.5 && performance.now() - sonKonum < 120000) return;
    sonKonum = performance.now(); sonYer = { x: p.x, z: p.z };
    try { await sb.from('characters').update({ x: p.x, y: p.y, z: p.z }).eq('id', character.id); } catch {}
  };
  const rpc = async (fn, args) => {
    if (fn !== 'shop_list' && fn !== 'depo_list') await konumYaz();
    const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args });
    if (error) { hud.notice?.(error.message, 'hata'); return null; }
    if (data && data.ok === false) { hud.notice?.(data.reason || 'The request could not be processed.', 'hata'); return null; }
    return data;
  };
  const yenile = () => { try { state.inv?.reload?.(); } catch {} };
  const satisFiyati = (it) => {   // çanta eşyasında _db olmayabilir (KO alan adları BuyPrice / SellPrice): ikisine de bakılır; yoksa önbellekteki kayıt
    const r = it?._db || IT.get(Number(it?.Num ?? it?.num))?._db || {};
    const al = Number(r.buy_price ?? it?.BuyPrice ?? it?.buy_price) || 0, sp = Number(r.sell_price ?? it?.SellPrice ?? it?.sell_price) || 0;
    return sp === 1 ? al : Math.floor(al / 6);
  };   // KO SellPrice: 1 = alış fiyatına (Bronze/Silver/Gold Coin, Silver/Gold Bar), diğerleri alış/6
  async function altin() { const { data } = await sb.from('characters').select('gold').eq('id', character.id).maybeSingle(); return data?.gold ?? character.gold ?? 0; }

  // ---- ipucu
  let tip = null;
  const ipucu = (it, ev, ek = '', row = null, fiyatsiz = false) => {
    tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu ko-tic-ipucu' });
    if (!tip.isConnected) document.body.append(tip);
    tip.innerHTML = tooltipHtml(it, { satisGizle: !!ek || fiyatsiz, sure: row?.kilit ? { kilit: true } : null }) + ek;   // NPC tezgâhı: yalnız alış fiyatı
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(innerWidth - w - 8, ev.clientX + 16) + 'px';
    tip.style.top = Math.max(8, Math.min(innerHeight - h - 8, ev.clientY - 10)) + 'px';
  };
  const ipucuKapat = () => tip?.remove();

  const adK = (n) => String(n || '').replace(/\s*\(\+0\)\s*$/, '').replace(/\s{2,}/g, ' ');   // mesajlarda "(+0)" görünmesin
  // ---- ortak pencere
  const acik = new Set();
  function pencere(cls, baslik, govde) {
    const el = document.createElement('div');
    el.className = `ko-panel ko-pencere ko-tic ${cls}`;
    el.innerHTML = `<div class="ay-baslik">${esc(baslik)}</div><button class="ko-kapat" title="Kapat"></button>${govde}`;
    el.querySelectorAll('.tic-dugme, .tic-sayfa button').forEach((b) => b.classList.add('ay-dugme'));
    (document.getElementById('kohud') || document.body).append(el);   // KO onay kutusuyla aynı katman → onay kutusu hep önde
    el.style.pointerEvents = 'auto';
    koWindow(el, { center: false }); toFront(el);
    const kapat = () => { el.remove(); acik.delete(api); ipucuKapat(); };
    const api = { el, kapat };
    acik.add(api);
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(el); });
    el.addEventListener('keydown', (e) => e.stopPropagation());
    el.querySelector('.ko-kapat').addEventListener('click', kapat);
    // KO çanta Noah simgesi (re_inventory btn_gold)
    el.querySelectorAll('.dn-ikon').forEach((ik) => { const sp = findSprite('re_inventory', 'btn_gold'); if (sp != null) paintSprite(ik, sp, 20, 22); else ik.classList.add('dn-ikon-yedek'); });
    el.style.visibility = 'hidden';
    requestAnimationFrame(() => { const r = el.getBoundingClientRect(); el.style.left = Math.max(8, innerWidth / 2 - r.width - 70) + 'px'; el.style.top = Math.max(46, (innerHeight - r.height) / 2) + 'px'; el.style.visibility = ''; });
    return api;
  }
  const kapatHepsi = () => { for (const p of [...acik]) p.kapat(); };
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && acik.size) { kapatHepsi(); } }, true);
  // dükkân / depo / tamir… pencereleri açıkken başka yere (dünya, NPC, başka arayüz) tıklanınca kapanır.
  // Kapanmaz: pencerenin kendisi, çanta (sürükle-bırak alışverişi), adet / fiyat pencereleri, KO mesaj kutusu (onay), ipucu.
  addEventListener('pointerdown', (e) => {
    if (!acik.size) return;
    const t = e.target; if (!(t instanceof Element)) return;
    if (t.closest('.ko-tic, .ko-tic2, .ko-depo, .ko-sismenu, .ko-inv, .tic-al-pen, .tic-adet, .tic-fiyat-pen, .ko-ipucu, .inv-hayalet, .ors-hayalet')) return;   // .ko-depo: KO depo penceresi (re_warehouse) — içine tıklayınca kapanmaz
    const kok = t.closest('.kui-root'); if (kok && kok.querySelector('[data-id="Btn_Yes"], [data-id="Btn_Ok"]')) return;   // KO mesaj kutusu
    kapatHepsi();
  }, true);

  const izgara = (liste, secili, fiyat, adet = SAYFA) => Array.from({ length: adet }, (_, i) => {
    const x = liste[i]; if (!x) return '<div class="tic-yuva"></div>';
    return `<div class="tic-yuva dolu${secili === x ? ' secili' : ''}" data-i="${i}">${iconHtml(x.it, 40)}${x.kilit ? '<i class="inv-kilit" title="Kilitli"></i>' : ''}${(() => { const n = x.count > 1 ? x.count : hakli(x.it) ? Number(x.it.Duration) : 0; return n > 1 ? `<b class="inv-adet">${n}</b>` : ''; })()}${fiyat ? '' : ''}</div>`;
  }).join('');

  // İksir tezgâhı (KO): tüm can iksirleri bir satırda, tüm mana iksirleri bir satırda; diğer eşyalar alttan devam eder.
  // Boş yuvalar null olarak tutulur (ızgarada boş kare).
  const SUTUN = 6;
  const iksirTur = (x) => { const n = String(x.it?.strName || '').replace(/\s*\(\+\d+\)\s*$/, '').trim().toLowerCase();
    if (/^(holy water|water of )/.test(n)) return 'hp';
    if (/^potion of (spirit|intelligence|sagacity|wisdom|soul)$/.test(n)) return 'mp';
    return ''; };
  function satirla(l) {
    const hp = l.filter((x) => iksirTur(x) === 'hp'), mp = l.filter((x) => iksirTur(x) === 'mp');
    if (!hp.length || !mp.length) return l;
    const doldur = (a) => { const r = [...a]; while (r.length % SUTUN) r.push(null); return r; };
    return [...doldur(hp), ...doldur(mp), ...l.filter((x) => !iksirTur(x))];
  }

  // =============== TİCARET
  // KO tüccar penceresi (deadsoft 2369 re_transaction): üstte tezgâh 6×4 (sayfalı), Purchase Item / Sell Item sekmeleri,
  // ortada 7×2 alışveriş listesi + Noah, Weight, Total cost, Purchase / Sell, yenile; altta pencere içi çanta 7×4.
  // KO akışı: eşyalara tıklayınca listeye eklenir, sonra Purchase / Sell. Listeden sağ tık: çıkar. Yazılar İngilizce (KO).
  async function ticaretKO(npc) {
    hud.kapatPanel?.('envanter');   // (3.11) tüccar açılırken envanter hızla kapanır
    const { ekUI, hasLayout, buildLayout, draggable } = await import('./kui.js');
    if (!(await ekUI('yeniui').catch(() => false)) || !hasLayout('re_transaction')) return null;
    kapatHepsi(); await loadMeta().catch(() => {});
    hud.kapatPanel?.('envanter');
    const L = buildLayout('re_transaction', { className: 'ko-tic2 ko-pencere kui-dokulu' });
    const kok = document.getElementById('kohud') || document.body; kok.append(L.el); draggable(L, 44);
    L.el.style.left = Math.max(8, innerWidth / 2 - 211) + 'px'; L.el.style.top = Math.max(20, (innerHeight - 746) / 2) + 'px';
    L.el.style.pointerEvents = 'auto'; toFront(L.el); L.el.dataset.esyaBirak = '1';
    const kapat = () => { L.el.remove(); acik.delete(api); ipucuKapat(); };
    const api = { el: L.el, kapat }; acik.add(api);
    L.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(L.el); });
    L.el.addEventListener('contextmenu', (e) => e.preventDefault());
    L.el.addEventListener('keydown', (e) => e.stopPropagation());
    L.click('btn_close', kapat);
    L.text('text_title', npc.ad || 'Merchant');
    L.show('img_title_realmpoint', false); L.show('img_realmpoint', false);   // Noah simgesinin arkasındaki madalyon da gizli   // başlığın iki yanındaki madalyonlar gösterilmez
    // yuvalar: tezgâh (üst, 0-23), liste (orta, 0-13), çanta (alt, 0-27)
    const tY = [], lY = [], cY = [];
    for (let i = 0; i < 28; i++) for (const a of L.all(String(i)).filter((e) => e.classList.contains('kui-ar'))) {
      const y = parseFloat(a.style.top) + (a.parentElement?.dataset.id?.startsWith('base_') ? parseFloat(a.parentElement.style.top) : 0);
      a.classList.add('dp-yuva');
      if (y < 280 && i < 24) { a.dataset.ty = i; tY[i] = a; } else if (y < 500 && i < 14) { a.dataset.ly = i; lY[i] = a; } else if (y >= 500) { a.dataset.cy = 14 + i; cY[i] = a; }
    }
    for (let i = 0; i < 28; i++) for (const t of L.all(String(i))) if (t.classList.contains('kui-tx')) t.textContent = '';
    for (let i = 100; i < 124; i++) L.text(String(i), '');
    const SAY = 24;
    let liste = [], sayfa = 0, sekme = 'al', sepet = [], gold = 0, agirlik = null;
    const bag = () => state.inv?.items || new Map();
    const cantaGet = (sl) => bag().get(sl);   // (2.11) eksikti → KO penceresi hata verip eski HTML pencereye düşüyordu
    const yuvaHtml = (it, n) => `${iconHtml(it, 41)}${n > 1 ? `<b class="inv-adet">${n}</b>` : ''}`;
    const MSJ = { al: 'You may purchase many items at a time.', sat: 'You may sell many items at a time.' };   // (2.11) KO metni birebir
    const sekmeYap = (k) => {
      sekme = k; sepet = [];
      L.show('base_tab_itembuy', k === 'al'); L.show('base_tab_itemsell', k === 'sat');
      if (k === 'sat') { const nums = [...bag().values()].map((b) => Number(b?.it?.Num ?? b?.row?.item_num)).filter(Boolean); esyalar(nums).then(() => ciz()).catch(() => {}); }   // satış fiyatları için eşya kayıtları
      ciz();
    };
    L.click('btn_tab_item_sell', () => sekmeYap('sat')); L.click('btn_tab_item_buy', () => sekmeYap('al'));
    async function yukle() {
      const { data } = await sb.rpc('shop_list', { p_npc: npc.id });
      const satir = Array.isArray(data) ? data : [];
      await esyalar(satir.map((r) => r.num));
      const ham = satir.map((r) => ({ num: r.num, price: Number(r.price), sira: Number(r.sira) || 0, it: IT.get(r.num) })).filter((x) => x.it);
      const enCok = Math.max(0, ...ham.map((x) => x.sira));
      if (ham.length && ham.every((x) => x.sira > 0) && enCok > ham.length && enCok <= ham.length * 3) {
        liste = new Array(Math.ceil(enCok / SUTUN) * SUTUN).fill(null);
        for (const x of ham) if (!liste[x.sira - 1]) liste[x.sira - 1] = x; else liste.push(x);
      } else liste = satirla(ham);
      gold = Number(await altin()) || 0;
      try { const { data: st } = await sb.rpc('char_stats', { p_char: character.id }); agirlik = st || agirlik; } catch {}
      ciz();
    }
    const toplam = () => sepet.reduce((t, x) => t + (sekme === 'al' ? x.price : satisFiyati(x.it)) * x.n, 0);
    function ciz() {
      const sayfaSay = Math.max(12, Math.ceil(liste.length / SAY)); sayfa = Math.min(sayfa, sayfaSay - 1);   // (2.11) KO: tüm tüccarlar 12 sayfa
      for (let i = 0; i < 24; i++) { const e = tY[i]; if (!e) continue; const x = liste[sayfa * SAY + i]; e.innerHTML = x?.it ? `${iconHtml(x.it, 41)}${Number(x.it._db?.countable) > 0 ? '<b class="inv-adet">1</b>' : ''}` : ''; e.classList.toggle('dolu', !!x?.it); }
      for (let i = 0; i < 14; i++) { const e = lY[i]; if (!e) continue; const x = sepet[i]; e.innerHTML = x ? yuvaHtml(x.it, x.n) : ''; e.classList.toggle('dolu', !!x); }
      const sepetSlot = new Set(sepet.map((x) => x.slot));
      for (let i = 0; i < 28; i++) {
        const e = cY[i]; if (!e) continue; const b = cantaGet(14 + i);
        e.innerHTML = b?.it ? yuvaHtml(b.it, b.row.count > 1 ? b.row.count : hakli(b.it) ? Number(b.row.durability ?? b.it.Duration) : 0) : '';
        e.classList.toggle('dolu', !!b?.it); e.classList.toggle('tic2-secili', sekme === 'sat' && sepetSlot.has(14 + i));
      }
      L.text('string_page', String(sayfa + 1)); L.text('string_max_page', String(sayfaSay));
      const en = (n) => Number(n || 0).toLocaleString('en-US');   // KO: 47,000
      L.text('text_mypoint', en(gold)); L.text('text_totalpoint', en(toplam()));
      L.text('text_totalmsg', 'Total Amount'); L.text('text_information', MSJ[sekme]);   // KO: 'Total Amount' kutuya sığmayıp 'Total Amou' görünür
      const ag = agirlik?.ability || agirlik || {}, w = Number(ag.weight) || 0, mx = Number(ag.max_weight) || 0;
      L.text('text_weight', `${(w / 10).toFixed(1)}/${(mx / 10).toFixed(1)}`);
    }
    L.click('btn_page_up', () => { sayfa = Math.max(0, sayfa - 1); ciz(); });
    L.click('btn_page_down', () => { sayfa++; ciz(); });
    L.click('btn_refresh', () => { sepet = []; ciz(); });
    const ogeOf = (el) => {
      const y = el?.closest?.('.ko-tic2 .dp-yuva'); if (!y) return null;
      if (y.dataset.ty != null) { const x = liste[sayfa * SAY + Number(y.dataset.ty)]; return x?.it ? { tur: 't', x, it: x.it } : null; }
      if (y.dataset.ly != null) { const x = sepet[Number(y.dataset.ly)]; return x ? { tur: 'l', x, it: x.it, i: Number(y.dataset.ly) } : null; }
      const b = cantaGet(Number(y.dataset.cy)); return b?.it ? { tur: 'c', b, it: b.it, slot: Number(y.dataset.cy) } : null;
    };
    L.el.addEventListener('pointermove', (e) => {
      const o = ogeOf(e.target); if (!o) return ipucuKapat();
      const fiyat = o.tur === 't' ? `<div class="tic-fiyat">${noahHtml(o.x.price)}</div>` : o.tur === 'c' && sekme === 'sat' ? `<div class="tic-fiyat">${noahHtml(satisFiyati(o.it))}</div>`
        : o.tur === 'l' ? `<div class="tic-fiyat">${noahHtml((sekme === 'al' ? o.x.price : satisFiyati(o.it)) * o.x.n)}${o.x.n > 1 ? ` <span class="tic-kat">(×${o.x.n})</span>` : ''}</div>` : '';
      ipucu(o.tur === 'c' ? (IT.get(Number(o.it.Num)) || o.it) : o.it, e, fiyat, o.b?.row);
    });
    L.el.addEventListener('pointerleave', ipucuKapat);
    const sepeteEkle = (oge, n) => {
      if (sepet.length >= 14) return hud.notice?.('The list is full.', 'hata');
      const no = Number(oge.it?.Num ?? oge.it?.num); if (sekme === 'sat' && no && !oge.it?._db && !IT.get(no)?._db) esyalar([no]).then(() => ciz()).catch(() => {});
      const ayni = sepet.find((x) => (sekme === 'al' ? x.num === oge.num : x.slot === oge.slot));
      // (7.11) KO: sayılamayan eşya (silah, zırh…) her alımda listeye ayrı bir yuva olarak eklenir — aynı silahtan birden fazla alınabilir
      if (sekme === 'al') { if (ayni && Number(oge.it._db?.countable) > 0) ayni.n = Math.min(9999, ayni.n + n); else sepet.push({ ...oge, n }); }
      else if (!ayni) sepet.push({ ...oge, n });
      ciz();
    };
    L.el.addEventListener('click', (e) => {
      if (performance.now() - Number(L.el.dataset.surBitti || 0) < 300) return;   // sürükleme bitti, tıklama sayılmaz
      const o = ogeOf(e.target); if (!o) return;
      if (o.tur === 't' && sekme === 'al') {
        const sayilir = Number(o.it._db?.countable) > 0 && !hakli(o.it);
        if (sayilir) adetSor(e.clientX, e.clientY, 9999, (n) => sepeteEkle({ num: o.x.num, price: o.x.price, it: o.it }, n));
        else sepeteEkle({ num: o.x.num, price: o.x.price, it: o.it }, 1);
      } else if (o.tur === 'c' && sekme === 'sat') {
        const n = Number(o.b.row.count) || 1;
        if (sepet.some((x) => x.slot === o.slot)) { sepet = sepet.filter((x) => x.slot !== o.slot); ciz(); return; }
        if (o.slot < 14 || o.slot > 41) return;
        if (n > 1) adetSor(e.clientX, e.clientY, n, (k) => sepeteEkle({ slot: o.slot, it: o.it }, k)); else sepeteEkle({ slot: o.slot, it: o.it }, 1);
      }
    });
    L.el.addEventListener('contextmenu', (e) => {
      const o = ogeOf(e.target); if (!o) return;
      if (o.tur === 'l') { sepet.splice(o.i, 1); ciz(); return; }
      if (o.tur === 't' && isGm()) hud.soru?.('Remove from Shop', `Remove ${o.it.strName} from this merchant's shop?`, async () => {
        if (await rpc('gm_shop_del', { p_npc: npc.id, p_item: o.x.num })) { await yukle(); hud.info?.(`${o.it.strName} has been removed from the shop.`, 'beceri'); }
      });
    });
    // (2.11) sürükle-bırak: tezgâhtan (alış) / çantadan (satış) eşya alışveriş listesine (Purchase / Sell Item alanı) sürüklenir
    {
      let sur = null;
      L.el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; const o = ogeOf(e.target); if (!o || !((o.tur === 't' && sekme === 'al') || (o.tur === 'c' && sekme === 'sat'))) return;
        const x0 = e.clientX, y0 = e.clientY; let g = null;
        const mv = (ev) => {
          if (!g) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return; ipucuKapat(); g = document.createElement('div'); g.className = 'inv-esya inv-hayalet'; g.innerHTML = iconHtml(o.it, 41); document.body.append(g); sur = o; }
          g.style.left = ev.clientX - 21 + 'px'; g.style.top = ev.clientY - 21 + 'px';
        };
        const up = (ev) => {
          removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true);
          if (!g) return; g.remove(); sur = null;
          L.el.dataset.surBitti = String(performance.now());   // bırakma sonrası tıklama (listeye ekleme) iki kez çalışmasın
          const h = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => el.closest?.('.ko-tic2 [data-ly]') || el.closest?.('.ko-tic2 [data-id="base_tab_itembuy"], .ko-tic2 [data-id="base_tab_itemsell"]'));
          if (!h) return;
          if (o.tur === 't') {
            const sayilir = Number(o.it._db?.countable) > 0 && !hakli(o.it);
            if (sayilir) adetSor(ev.clientX, ev.clientY, 9999, (n) => sepeteEkle({ num: o.x.num, price: o.x.price, it: o.it }, n));
            else sepeteEkle({ num: o.x.num, price: o.x.price, it: o.it }, 1);
          } else {
            if (o.slot < 14 || o.slot > 41 || sepet.some((x) => x.slot === o.slot)) return;
            const n = Number(o.b.row.count) || 1;
            if (n > 1) adetSor(ev.clientX, ev.clientY, n, (k) => sepeteEkle({ slot: o.slot, it: o.it }, k)); else sepeteEkle({ slot: o.slot, it: o.it }, 1);
          }
        };
        addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
      });
    }
    let mesgul = false;
    const islem = async () => {
      if (mesgul || !sepet.length) return; mesgul = true;
      try {
        for (const x of [...sepet]) {
          const d = sekme === 'al' ? await rpc('shop_buy', { p_npc: npc.id, p_item: x.num, p_count: x.n }) : await rpc('shop_sell', { p_npc: npc.id, p_slot: x.slot, p_count: x.n });
          if (!d) break;
          sepet = sepet.filter((y) => y !== x);
          hud.info?.(sekme === 'al' ? `Purchased ${adK(d.name)}${d.count > 1 ? ` ×${d.count}` : ''} (−${noah(d.tutar)} Noah).` : `Sold ${adK(d.name)}${d.count > 1 ? ` ×${d.count}` : ''} (+${noah(d.tutar)} Noah).`, 'beceri');
          if (d.gold != null) gold = Number(d.gold);
        }
      } finally { mesgul = false; yenile(); setTimeout(yukle, 200); }
    };
    L.click('btn_buy', islem); L.click('btn_sell', islem);
    // ana çantadan bırakma: satış sekmesinde listeye ekler; GM → fiyat penceresi
    L.el.addEventListener('ko-esya-birak', async (ev) => {
      const d = ev.detail || {}; if (d.slot == null) return;
      const [it] = await esyalar([d.num]); if (!it) return;
      if (isGm() && sekme === 'al') return fiyatPenceresi(npc, it, d, liste.find((x) => x?.num === d.num)?.price, async () => { await yukle(); });
      if (sekme !== 'sat') sekmeYap('sat');
      sepeteEkle({ slot: d.slot, it }, d.count || 1);
    });
    const cantaDegisti = () => { if (L.el.isConnected) ciz(); else removeEventListener('ko-envanter-degisti', cantaDegisti); };
    addEventListener('ko-envanter-degisti', cantaDegisti);
    const tik = setInterval(() => { if (!L.el.isConnected) return clearInterval(tik); ciz(); }, 1500);
    sekmeYap('al'); await yukle();
    return api;
  }
  async function ticaret(npc) {
    { const w = await ticaretKO(npc).catch((e) => { console.warn('KO tüccar penceresi', e); return null; }); if (w) return w; }
    kapatHepsi(); await loadMeta().catch(() => {});
    // KO standart tezgâh: 6 sütun × 4 satır (24 yuva), fazlası sonraki sayfalarda (Beta NPC tezgâhları dahil)
    const sut = SUTUN, say = SAYFA;
    hud.acPanel?.('envanter');
    const w = pencere('tic-ticaret', npc.ad.replace(/^\[[^\]]+\]\s*/, '') + ' — Ticaret', `
      <div class="tic-izgara"></div>
      <div class="tic-sayfa"><button data-k="geri">◀</button><span></span><button data-k="ileri">▶</button></div>
      <div class="tic-alt"><label>Adet <input type="number" min="1" max="9999" value="1" class="tic-adet"></label><button class="tic-dugme" data-k="al">Satın al</button></div>
      <div class="tic-noah tic-depo-noah"><i class="dn-ikon"></i><span class="dn-yazi">Noah</span><b>…</b></div>
      <p class="tic-not">${isGm() ? 'GM: çantadan eşya sürükle → fiyat belirle. Sağ tık → tezgâhtan kaldır, Shift + sağ tık → satın al.' : 'Satmak için çantandan eşyayı buraya sürükle. Sağ tık: hızlı satın al (onaylı). Çift tık: hemen satın al.'}</p>`);
    w.el.dataset.esyaBirak = '1';
    if (sut !== SUTUN) w.el.querySelector('.tic-izgara').style.gridTemplateColumns = `repeat(${sut}, 46px)`;
    let liste = [], sayfa = 0, secili = null;
    const noahYaz = async (g) => { w.el.querySelector('.tic-noah b').textContent = noah(g ?? await altin()); };
    async function yukle() {
      const { data } = await sb.rpc('shop_list', { p_npc: npc.id });
      const satir = Array.isArray(data) ? data : [];
      const its = await esyalar(satir.map((r) => r.num));
      const ham = satir.map((r) => ({ num: r.num, price: Number(r.price), sira: Number(r.sira) || 0, it: IT.get(r.num) })).filter((x) => x.it);
      // tezgâh düzeni: sıra numaralarında boşluk varsa (ör. Charon: her satır bir parşömen türü) eşyalar o yuvalara yerleşir
      const enCok = Math.max(0, ...ham.map((x) => x.sira));
      if (ham.length && ham.every((x) => x.sira > 0) && enCok > ham.length && enCok <= ham.length * 3) {
        liste = new Array(Math.ceil(enCok / sut) * sut).fill(null);
        for (const x of ham) if (!liste[x.sira - 1]) liste[x.sira - 1] = x; else liste.push(x);
      } else liste = satirla(ham);
      ciz();
    }
    function ciz() {
      const sayfaSay = Math.max(1, Math.ceil(liste.length / say)); sayfa = Math.min(sayfa, sayfaSay - 1);
      const parca = liste.slice(sayfa * say, sayfa * say + say);
      w.el.querySelector('.tic-izgara').innerHTML = liste.length ? izgara(parca, secili, undefined, say) : '<div class="tic-bos">Bu tüccarın tezgâhı boş.</div>';
      w.el.querySelector('.tic-sayfa span').textContent = `${sayfa + 1} / ${sayfaSay}`;
      w.el.querySelector('.tic-adet').disabled = !(secili && Number(secili.it._db?.countable) > 0);
    }
    const ogeAl = (e) => { const y = e.target.closest('.tic-yuva.dolu'); return y ? liste[sayfa * say + Number(y.dataset.i)] : null; };
    const izg = w.el.querySelector('.tic-izgara');
    izg.addEventListener('pointermove', (e) => { const x = ogeAl(e); if (x) ipucu(x.it, e, `<div class="tic-fiyat">${noahHtml(x.price)}</div>`); else ipucuKapat(); });
    izg.addEventListener('pointerleave', ipucuKapat);
    izg.addEventListener('click', (e) => { const x = ogeAl(e); if (x) { secili = x; ciz(); } });
    izg.addEventListener('dblclick', (e) => { const x = ogeAl(e); if (x) { secili = x; satinAl(1); } });
    // KO: tezgâhtan çantaya sürükle → küçük adet penceresi (Enter / Onayla) → satın al
    izg.addEventListener('pointerdown', (e) => {
      const x = ogeAl(e); if (!x || e.button !== 0) return;
      const sx = e.clientX, sy = e.clientY; let g = null;
      const mv = (ev) => {
        if (!g && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        if (!g) { ipucuKapat(); g = document.createElement('div'); g.className = 'inv-esya inv-hayalet'; g.innerHTML = iconHtml(x.it, 40); document.body.append(g); }
        g.style.left = ev.clientX - 22 + 'px'; g.style.top = ev.clientY - 22 + 'px';
      };
      const up = (ev) => {
        removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true);
        if (!g) return; g.remove();
        const canta = document.elementsFromPoint(ev.clientX, ev.clientY).some((el) => el.closest?.('.inv-yuva, .ko-inv'));
        if (!canta) return;
        secili = x; ciz();
        const sayilir = Number(x.it._db?.countable) > 0;
        // sayılamayan eşya (5000'lik premium iksir gibi hak/süreli eşyalar dahil): adet sorulmaz, doğrudan 1 adet alınır
        if (!sayilir || hakli(x.it)) return satinAl(1);
        alAdet(ev.clientX, ev.clientY, x, sayilir, (n) => satinAl(n));
      };
      addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
    });
    izg.addEventListener('contextmenu', (e) => {
      e.preventDefault(); const x = ogeAl(e); if (!x) return;
      // oyuncu: sağ tık = hızlı satın alma (KO onay penceresiyle, 1 adet); GM: Shift + sağ tık da satın alır, düz sağ tık tezgâhtan kaldırır
      if (!isGm() || e.shiftKey) {
        ipucuKapat(); secili = x; ciz();
        const ad = String(x.it.strName || '').replace(/\s*\(\+0\)$/, '');
        if (!hud.soru?.('Purchase', `${ad}\nPrice: ${noah(x.price)} Noah\nDo you want to purchase this item?`, () => satinAl(1))) { if (confirm(`${ad} — ${noah(x.price)} Noah. Purchase?`)) satinAl(1); }
        return;
      }
      hud.soru?.('Remove from Shop', `Remove ${x.it.strName} from this merchant's shop?`, async () => {
        if (await rpc('gm_shop_del', { p_npc: npc.id, p_item: x.num })) { liste = satirla(liste.filter((y) => y && y !== x)); if (secili === x) secili = null; ciz(); hud.info?.(`${x.it.strName} has been removed from the shop.`, 'beceri'); }
      });
    });
    async function satinAl(adet) {
      if (!secili) return hud.notice?.('Select an item first.', 'hata');
      const n = Number(secili.it._db?.countable) > 0 ? Math.max(1, Math.min(9999, Number(adet) || 1)) : 1;
      const d = await rpc('shop_buy', { p_npc: npc.id, p_item: secili.num, p_count: n }); if (!d) return;
      hud.info?.(`Purchased ${adK(d.name)}${d.count > 1 ? ` ×${d.count}` : ''} (−${noah(d.tutar)} Noah${Number(d.vergi) > 0 ? `, including ${noah(d.vergi)} Noah royal tax` : ''}).`, 'beceri');
      noahYaz(d.gold); yenile();
    }
    w.el.querySelector('[data-k=al]').addEventListener('click', () => satinAl(w.el.querySelector('.tic-adet').value));
    w.el.querySelector('[data-k=geri]').addEventListener('click', () => { sayfa = Math.max(0, sayfa - 1); ciz(); });
    w.el.querySelector('[data-k=ileri]').addEventListener('click', () => { sayfa++; ciz(); });
    // çantadan bırakma: GM → fiyat penceresi; oyuncu → satış onayı
    w.el.addEventListener('ko-esya-birak', async (ev) => {
      const d = ev.detail || {}; if (d.slot == null) return;
      const [it] = await esyalar([d.num]); if (!it) return;
      if (isGm()) return fiyatPenceresi(npc, it, d, liste.find((x) => x?.num === d.num)?.price, async () => { await yukle(); noahYaz(); });
      satisSor(npc, it, d, (g) => noahYaz(g));
    });
    noahYaz(); await yukle();
    return w;
  }

  // satın alma adet penceresi (çantaya sürükleyince): adet + toplam fiyat, Enter = onayla, Esc = iptal
  function alAdet(x, y, oge, sayilir, onay) {
    document.querySelector('.tic-al-pen')?.remove();
    const p = document.createElement('div'); p.className = 'ko-panel tic-al-pen';
    p.innerHTML = `<div class="ta-baslik">${esc(oge.it.strName)}</div>
      <div class="tap-satir">${iconHtml(oge.it, 34)}<label>Adet <input type="number" min="1" max="9999" value="1" ${sayilir ? '' : 'disabled'}></label></div>
      <div class="tap-toplam">Toplam: <b></b> Noah</div>
      <div class="ta-alt"><button class="ay-dugme" data-k="ok">Onayla</button><button class="ay-dugme" data-k="iptal">İptal</button></div>`;
    document.body.append(p);
    p.style.left = Math.max(8, Math.min(innerWidth - 220, x + 18)) + 'px'; p.style.top = Math.max(8, Math.min(innerHeight - 160, y - 30)) + 'px';
    const inp = p.querySelector('input'), top = p.querySelector('.tap-toplam b');
    const adet = () => (sayilir ? Math.max(1, Math.min(9999, Math.floor(Number(inp.value) || 1))) : 1);
    const yaz = () => { top.textContent = noah(oge.price * adet()); };
    yaz(); inp.addEventListener('input', yaz);
    const kapat = () => { p.remove(); removeEventListener('keydown', tus, true); };
    const tamam = () => { const n = adet(); kapat(); onay(n); };
    const tus = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); tamam(); } else if (e.key === 'Escape') { e.stopPropagation(); kapat(); } };
    addEventListener('keydown', tus, true);
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
    p.querySelector('[data-k=ok]').addEventListener('click', tamam);
    p.querySelector('[data-k=iptal]').addEventListener('click', kapat);
    requestAnimationFrame(() => { if (sayilir) { inp.focus(); inp.select(); } });
  }

  function satisSor(npc, it, d, sonra) {
    if (d.slot < 14 || d.slot > 41) return hud.notice?.('Equipped items cannot be sold; move it to your inventory first.', 'hata');
    const n = d.count || 1, t = satisFiyati(it) * n;
    hud.soru?.('Sell Item', `Will you sell ${it.strName}${n > 1 ? ` (${n})` : ''} for ${noah(t)} Noah?`, async () => {
      const r = await rpc('shop_sell', { p_npc: npc.id, p_slot: d.slot, p_count: n }); if (!r) return;
      hud.info?.(`Sold ${adK(r.name)}${r.count > 1 ? ` ×${r.count}` : ''} (+${noah(r.tutar)} Noah).`, 'beceri');
      sonra?.(r.gold); yenile();
    });
  }

  // GM: eşyanın tezgâhta kaç Noah'a satılacağını belirleme penceresi
  function fiyatPenceresi(npc, it, d, mevcut, sonra) {
    document.querySelector('.tic-fiyat-pen')?.remove();
    const varsayilan = mevcut ?? (Number(it._db?.buy_price) || 1);
    const w = pencere('tic-fiyat-pen', 'Tezgâh fiyatı', `
      <div class="tf-esya">${iconHtml(it, 44)}<div><b>${esc(it.strName)}</b><small>#${it._db?.num ?? d.num} · KO alış fiyatı ${noah(it._db?.buy_price)} · satış ${noah(satisFiyati(it))}</small></div></div>
      <label class="tf-fiyat">Satış fiyatı (Noah) <input type="number" min="0" step="1" value="${varsayilan}"></label>
      <div class="tf-onizleme"></div>
      <div class="tf-dugmeler"><button class="tic-dugme" data-k="koy">${mevcut != null ? 'Fiyatı güncelle' : 'Tezgâha koy'}</button><button class="tic-dugme" data-k="sat">Tüccara sat</button><button class="tic-dugme" data-k="iptal">İptal</button></div>`);
    const inp = w.el.querySelector('input'), on = w.el.querySelector('.tf-onizleme');
    const guncelle = () => { on.innerHTML = `Oyuncular bu eşyayı <b>${noah(Math.max(0, Math.floor(Number(inp.value) || 0)))}</b> Noah'a satın alacak.`; };
    inp.addEventListener('input', guncelle); guncelle();
    requestAnimationFrame(() => { const r = w.el.getBoundingClientRect(); w.el.style.left = (innerWidth - r.width) / 2 + 'px'; w.el.style.top = (innerHeight - r.height) / 2 + 'px'; inp.focus(); inp.select(); });
    w.el.addEventListener('click', async (e) => {
      const k = e.target.closest('button')?.dataset.k; if (!k) return;
      if (k === 'iptal') return w.kapat();
      if (k === 'sat') { w.kapat(); return satisSor(npc, it, d); }
      const p = Math.floor(Number(inp.value)); if (!(p >= 0)) return hud.notice?.('Enter a valid price.', 'hata');
      const r = await rpc('gm_shop_set', { p_npc: npc.id, p_item: d.num, p_price: p }); if (!r) return;
      hud.info?.(`${r.name} is now on sale in the shop for ${noah(r.price)} Noah.`, 'beceri');
      w.kapat(); sonra?.();
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') w.el.querySelector('[data-k=koy]').click(); });
  }

  // =============== DEPO
  // KO: çantadan depoda istenen yuvaya, depodan çantada istenen yuvaya sürükle-bırak; depo içinde yer değiştirme.
  // Birden çok adetli eşyada bırakılan yuvanın yanında küçük adet penceresi açılır (Enter: onay, Esc: iptal).
  function adetSor(x, y, max, onay) { return adetSorPencere(x, y, max, onay); }
  // KO depo penceresi (deadsoft 2369 re_warehouse): üstte depo 6×4 (sayfa 1-8, ◀ ▶), Search Item, depo Noah'ı; altta pencere içi çanta
  // 7×4 (yuva 14-41), Weight, çanta Noah'ı. Sürükle-bırak: çanta ↔ depo (istenen yuvaya), depo içinde yer değiştirme; sağ / çift tık: depodan
  // çantaya. Noah simgeleri: üstteki → depodan çek, alttaki → depoya yatır (miktar kutusu). Arama: adı geçen ilk eşyanın sayfasına gider, eşleşenler parlar.
  // (2.11) depo ön yükleme: Inn Hostess menüsü açılınca arayüz dokusu, depo listesi, eşya bilgileri ve Noah paralel alınır →
  // "Use storage" seçilince pencere eşyalarıyla birlikte anında açılır
  let onDepo = null;
  function depoOnYukle() {
    if (onDepo && performance.now() - onDepo.t < 8000) return onDepo;
    const ui = import('./kui.js').then((K) => K.ekUI('depo')).catch(() => false);
    const meta = loadMeta().catch(() => {});
    const liste = sb.rpc('depo_list', { p_char: character.id }).then(({ data }) => data).catch(() => null)
      .then(async (d) => { if (d?.items) await esyalar(d.items.map((r) => r.num)).catch(() => {}); return d; });
    const al = altin().catch(() => 0);
    const st = Promise.resolve(sb.rpc('char_stats', { p_char: character.id })).then(({ data }) => data).catch(() => null);
    onDepo = { t: performance.now(), ui, meta, liste, al, st };
    return onDepo;
  }
  async function depoKO(npc) {
    const on = depoOnYukle(); onDepo = null;   // bu açılışta kullanılır; sonraki açılış taze alır
    const { ekUI, hasLayout, buildLayout, draggable } = await import('./kui.js');
    if (!(await on.ui) || !hasLayout('re_warehouse')) return null;
    kapatHepsi(); await on.meta;
    hud.kapatPanel?.('envanter');
    const DS = 24, SAY = 8;
    const L = buildLayout('re_warehouse', { className: 'ko-depo ko-pencere kui-dokulu' });
    const kok = document.getElementById('kohud') || document.body; kok.append(L.el); draggable(L, 44);
    L.el.style.left = Math.max(8, innerWidth / 2 - 216) + 'px'; L.el.style.top = Math.max(40, (innerHeight - 626) / 2) + 'px';
    L.el.style.pointerEvents = 'auto'; toFront(L.el);
    L.el.dataset.esyaBirak = '1';
    const kapat = () => { L.el.remove(); acik.delete(api); ipucuKapat(); };
    const api = { el: L.el, kapat }; acik.add(api);
    L.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(L.el); });
    L.el.addEventListener('contextmenu', (e) => e.preventDefault());
    L.el.addEventListener('keydown', (e) => e.stopPropagation());
    L.click('btn_close', kapat);
    // yuvalar: aynı kimlikli alanlar — depo (üst, 0-23) ve çanta (alt, 0-27)
    const dY = [], cY = [];
    for (let i = 0; i < 28; i++) {
      const a = L.all(String(i)).filter((e) => e.classList.contains('kui-ar'));
      const ust = a.filter((e) => parseFloat(e.style.top) < 300), alt = a.filter((e) => parseFloat(e.style.top) >= 300);
      if (i < DS && ust[0]) { ust[0].dataset.dy = i; ust[0].classList.add('dp-yuva'); dY[i] = ust[0]; }
      if (alt[0]) { alt[0].dataset.cy = 14 + i; alt[0].classList.add('dp-yuva'); cY[i] = alt[0]; }
    }
    for (let i = 100; i < 124; i++) L.text(String(i), '');   // KO adet yazıları: adet yuvanın içinde çizilir
    // "Weight" yazısı çerçeveye yapışık durmasın: ağırlık kutusunun hemen soluna, sağa yaslı
    for (const t of L.el.querySelectorAll('.kui-tx')) if (t.textContent.trim() === 'Weight') { t.style.left = (parseFloat(t.style.left) + 3) + 'px'; t.style.width = '36px'; t.style.textAlign = 'right'; t.style.whiteSpace = 'nowrap'; }
    const ara = L.input('Edt_search', { placeholder: 'Search Item' }); ara?.parentElement?.querySelector('.kui-tx')?.remove();
    let yuvalar = [], sayfa = 0, gold = 0, depoGold = 0, aranan = '', agirlik = null;
    const bag = () => state.inv?.items || new Map();
    // (31.10) anlık sürükle-bırak: sunucu yanıtı beklenmeden pencere hemen güncellenir (iyimser); yanıt gelince / hata olursa sunucudan yeniden okunur
    const cOver = new Map();   // çanta yuvası → null (boş) | { it, row } (geçici görünüm)
    const cantaGet = (sl) => (cOver.has(sl) ? cOver.get(sl) : bag().get(sl));
    const yuvaHtml = (it, n, kilit) => `${iconHtml(it, 41)}${kilit ? '<i class="inv-kilit" title="Kilitli"></i>' : ''}${n > 1 ? `<b class="inv-adet">${n}</b>` : ''}`;
    const adetOf = (x) => (x.count > 1 ? x.count : hakli(x.it) ? Number(x.it.Duration) : 0);
    // (2.11) liste / Noah / ağırlık paralel alınır; ilk açılışta ön yüklemedeki istekler kullanılır
    const listeUygula = (d) => { if (!d) return; yuvalar = []; for (const r of d.items || []) yuvalar[r.slot] = { ...r, it: IT.get(r.num) }; depoGold = Number(d.gold) || 0; };
    async function yukle(ilk = null) {
      const lP = ilk ? ilk.liste : rpc('depo_list', {}).then(async (d) => { if (d?.items) await esyalar(d.items.map((r) => r.num)); return d; });
      const aP = ilk ? ilk.al : altin().catch(() => gold), sP = ilk ? ilk.st : Promise.resolve(sb.rpc('char_stats', { p_char: character.id })).then(({ data }) => data).catch(() => null);
      let d = await lP; if (!d && ilk) d = await rpc('depo_list', {});   // ön yükleme başarısızsa yeniden
      if (d?.items?.some((r) => !IT.has(r.num))) await esyalar(d.items.map((r) => r.num)).catch(() => {});
      listeUygula(d); ciz();
      const [g2, st] = await Promise.all([aP, sP]); gold = Number(g2) || 0; agirlik = st || agirlik; ciz();
    }
    // işlemden sonra: iyimser görünüm zaten güncel; sunucu listesi kısa bir beklemeyle tek seferde (art arda taşımalar birleşir)
    // (2.11) art arda işlemler birleşir: son işlemden 0,6 sn sonra tek seferde depo listesi + çanta (iyimser görünüm o ana dek korunur)
    let tazeT = 0, cantaDa = false, bekleyen = 0;
    const tazele = (canta = false) => {
      cantaDa ||= canta; clearTimeout(tazeT);
      tazeT = setTimeout(async () => {
        if (!L.el.isConnected) return; if (sur || bekleyen > 0) return tazele();
        const c = cantaDa; cantaDa = false;
        const [d, st] = await Promise.all([
          rpc('depo_list', {}).then(async (x) => { if (x?.items?.some((r) => !IT.has(r.num))) await esyalar(x.items.map((r) => r.num)); return x; }),
          c ? Promise.resolve(state.inv?.reload?.()).then((r) => r?.[1]).catch(() => null) : null,
        ]);
        if (sur || bekleyen > 0 || cantaDa) return tazele();   // bu arada yeni işlem başladı
        listeUygula(d); if (st) agirlik = st; if (c) cOver.clear(); ciz();
      }, 600);
    };
    function ciz() {
      const q = aranan.trim().toLowerCase();
      for (let i = 0; i < DS; i++) {
        const e = dY[i]; if (!e) continue; const x = yuvalar[sayfa * DS + i];
        e.innerHTML = x?.it ? yuvaHtml(x.it, adetOf(x), x.kilit) : '';
        e.classList.toggle('dolu', !!x?.it); e.classList.toggle('dp-bulundu', !!(q && x?.it && String(x.it.strName || '').toLowerCase().includes(q)));
      }
      for (let i = 0; i < 28; i++) {
        const e = cY[i]; if (!e) continue; const b = bag().get(14 + i);
        e.innerHTML = b?.it ? yuvaHtml(b.it, b.row.count > 1 ? b.row.count : hakli(b.it) ? Number(b.row.durability ?? b.it.Duration) : 0, b.row.kilit) : '';
        e.classList.toggle('dolu', !!b?.it);
      }
      L.text('string_page', String(sayfa + 1));
      L.text('string_wareitem_name', noah(depoGold)); L.text('string_item_name', noah(gold));
      const ag = agirlik?.ability || agirlik || {}, w = Number(ag.weight) || 0, mx = Number(ag.max_weight) || 0;   // KO: Weight 63.3/905.0
      L.text('text_weight', `${(w / 10).toFixed(1)}/${(mx / 10).toFixed(1)}`);
    }
    const sayfaYap = (n) => { sayfa = Math.max(0, Math.min(SAY - 1, n)); ciz(); };
    L.click('btn_page_up', () => sayfaYap(sayfa - 1)); L.click('btn_page_down', () => sayfaYap(sayfa + 1));
    const aramaYap = () => {
      aranan = ara?.value || ''; const q = aranan.trim().toLowerCase();
      if (q) { const i = yuvalar.findIndex((x) => x?.it && String(x.it.strName || '').toLowerCase().includes(q)); if (i >= 0) sayfa = Math.floor(i / DS); else hud.notice?.('There is no item with that name in the storage.', 'hata'); }
      ciz();
    };
    L.click('Btn_search', aramaYap); ara?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') aramaYap(); });
    // Noah: üstteki simge depodan çek, alttaki depoya yatır
    const noahIs = (isaret, ev) => adetSor(ev.clientX, ev.clientY, Math.max(1, isaret > 0 ? gold : depoGold), async (m) => {
      const r = await rpc('depo_noah', { p_miktar: isaret * m }); if (!r) return;
      hud.info?.(isaret > 0 ? `Deposited ${noah(m)} Noah into the storage.` : `Withdrew ${noah(m)} Noah from the storage.`, 'beceri');
      yenile(); state.inv?.stats?.(); yukle();
    });
    L.click('btn_gold_warehouse', (ev) => noahIs(-1, ev)); L.click('btn_gold', (ev) => noahIs(1, ev));
    // ipucu
    const ogeOf = (el) => { const y = el?.closest?.('.dp-yuva'); if (!y) return null; if (y.dataset.dy != null) { const x = yuvalar[sayfa * DS + Number(y.dataset.dy)]; return x?.it ? { tur: 'd', x, it: x.it, slot: x.slot } : null; } const b = bag().get(Number(y.dataset.cy)); return b?.it ? { tur: 'c', b, it: b.it, slot: Number(y.dataset.cy) } : null; };
    L.el.addEventListener('pointermove', (e) => { if (sur) return; const o = ogeOf(e.target); if (o) ipucu(o.it, e, '', o.x || o.b?.row, true); else ipucuKapat(); });   // (2.11) depoda Noah fiyatı yazmaz
    L.el.addEventListener('pointerleave', ipucuKapat);
    const bosCanta = () => { for (let s = 14; s < 42; s++) if (!cantaGet(s)?.it) return s; return null; };
    const depoAl = async (x, n, hedef = null) => {
      const adet = Number(x.count) || 1, m = Math.min(adet, n || adet), cs = hedef ?? bosCanta();
      if (cs != null && !cantaGet(cs)?.it) { cOver.set(cs, { it: x.it, row: { count: m, durability: x.durability, kilit: x.kilit } }); }
      yuvalar[x.slot] = m >= adet ? undefined : { ...x, count: adet - m }; ciz();
      bekleyen++; const r = await (hedef == null ? rpc('depo_al', { p_dslot: x.slot }) : rpc('depo_al2', { p_dslot: x.slot, p_count: n, p_hedef: hedef })).finally(() => bekleyen--); if (!r) { cOver.clear(); yukle(); return; }
      hud.info?.(`${adK(r.name)}${r.count > 1 ? ` ×${r.count}` : ''} moved to your inventory.`, 'beceri'); tazele(true);
    };
    const depoKoy = async (slot, n, ds) => {
      const b = cantaGet(slot);
      if (b?.it) {
        const adet = Number(b.row?.count) || 1, m = Math.min(adet, n || adet);
        cOver.set(slot, m >= adet ? null : { ...b, row: { ...b.row, count: adet - m } });
        const hedef = ds ?? yuvalar.findIndex((y, i) => i < DS * SAY && !y);
        if (hedef != null && hedef >= 0 && !yuvalar[hedef]) yuvalar[hedef] = { slot: hedef, num: Number(b.it.Num ?? b.row?.item_num), count: m, durability: b.row?.durability, kilit: b.row?.kilit, it: b.it };
        ciz();
      }
      bekleyen++; const r = await rpc('depo_koy2', { p_slot: slot, p_count: n, p_dslot: ds }).finally(() => bekleyen--); if (!r) { cOver.clear(); yukle(); return; }
      hud.info?.(`${adK(r.name)}${r.count > 1 ? ` ×${r.count}` : ''} moved to the storage.`, 'beceri'); tazele(true);
    };
    L.el.addEventListener('dblclick', (e) => { const o = ogeOf(e.target); if (o?.tur === 'd') depoAl(o.x); });
    L.el.addEventListener('contextmenu', (e) => {
      const o = ogeOf(e.target); if (!o) return;
      if (o.tur === 'd') { const n = Number(o.x.count) || 1; return n > 1 ? adetSor(e.clientX, e.clientY, n, (k) => { if (k >= n) return depoAl(o.x); const cs = bosCanta(); if (cs == null) return hud.notice?.('Your inventory is full.', 'hata'); depoAl(o.x, k, cs); }) : depoAl(o.x); }   // (2.11) miktarlı: adet sorulur
      // (2.11) çantadaki eşyaya sağ tık: depoda ilk boş yuvaya (aynı sayılabilir eşya varsa üstüne) otomatik konur — tüm adet
      if (o.tur === 'c') {
        if (o.slot < 14 || o.slot > 41) return;
        const no = Number(o.it?.Num ?? o.b?.row?.item_num), sayilir = Number((IT.get(no) || o.it)?._db?.countable ?? o.it?.countable) > 0;
        const ayni = sayilir ? yuvalar.findIndex((y) => y?.it && Number(y.num) === no && (Number(y.count) || 1) + (Number(o.b?.row?.count) || 1) <= 9999) : -1;
        const bos = yuvalar.findIndex((y, i) => i < DS * SAY && !y); const hedef = ayni >= 0 ? ayni : (bos >= 0 ? bos : (yuvalar.length < DS * SAY ? yuvalar.length : -1));
        if (hedef < 0) return hud.notice?.('The storage is full.', 'hata');
        const n = Number(o.b?.row?.count) || 1;
        if (n > 1) adetSor(e.clientX, e.clientY, n, (k) => depoKoy(o.slot, k, hedef)); else depoKoy(o.slot, 1, hedef);   // (2.11) miktarlı: adet sorulur
      }
    });
    // sürükle-bırak (pencere içi iki ızgara arasında)
    let sur = null;
    const hedefYuva = (x, y) => document.elementsFromPoint(x, y).map((e) => e.closest?.('.ko-depo .dp-yuva')).find(Boolean) || null;
    L.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; const o = ogeOf(e.target); if (!o) return;
      e.preventDefault(); ipucuKapat();
      const kaynak = e.target.closest('.dp-yuva');
      const g = document.createElement('div'); g.className = 'inv-esya inv-hayalet'; g.innerHTML = iconHtml(o.it, 41); document.body.append(g);
      sur = { o, g, kaynak };
      const mv = (ev) => { g.style.left = ev.clientX - 21 + 'px'; g.style.top = ev.clientY - 21 + 'px'; }; mv(e); kaynak.classList.add('inv-surukleniyor');
      const up = (ev) => {
        removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true);
        const s0 = sur; sur = null; g.remove(); kaynak.classList.remove('inv-surukleniyor');
        const h = hedefYuva(ev.clientX, ev.clientY); if (!h || h === kaynak) return;
        const adet = s0.o.tur === 'd' ? Number(s0.o.x.count) || 1 : Number(s0.o.b.row.count) || 1;
        if (s0.o.tur === 'd' && h.dataset.dy != null) {   // depo içinde taşı
          const ds = sayfa * DS + Number(h.dataset.dy), tasi = async (n) => { const x = s0.o.x, eski = yuvalar[ds]; if (!eski && n >= (Number(x.count) || 1)) { yuvalar[ds] = { ...x, slot: ds }; yuvalar[x.slot] = undefined; ciz(); } else if (eski && n >= (Number(x.count) || 1)) { yuvalar[ds] = { ...x, slot: ds }; yuvalar[x.slot] = { ...eski, slot: x.slot }; ciz(); } bekleyen++; const r = await rpc('depo_tasi', { p_from: x.slot, p_to: ds, p_count: n }).finally(() => bekleyen--); if (!r) yukle(); else tazele(); };
          if (adet > 1 && !yuvalar[ds]) adetSor(ev.clientX, ev.clientY, adet, tasi); else tasi(adet);
        } else if (s0.o.tur === 'd' && h.dataset.cy != null) {   // depodan çantaya
          const cs = Number(h.dataset.cy); if (adet > 1) adetSor(ev.clientX, ev.clientY, adet, (n) => depoAl(s0.o.x, n, cs)); else depoAl(s0.o.x, 1, cs);
        } else if (s0.o.tur === 'c' && h.dataset.dy != null) {   // çantadan depoya
          const ds = sayfa * DS + Number(h.dataset.dy); if (adet > 1) adetSor(ev.clientX, ev.clientY, adet, (n) => depoKoy(s0.o.slot, n, ds)); else depoKoy(s0.o.slot, 1, ds);
        } else if (s0.o.tur === 'c' && h.dataset.cy != null) {   // çanta içinde yer değiştir
          const pr = state.inv?.tasi?.(s0.o.slot, Number(h.dataset.cy)); ciz(); pr?.then?.(() => ciz());   // (2.11) iyimser: çanta anında güncellenir
        }
      };
      addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
    });
    // ana çantadan (açıksa) bırakılan eşya: bırakılan depo yuvasına
    L.el.addEventListener('ko-esya-birak', (ev) => {
      const d = ev.detail || {}; if (d.slot == null) return;
      if (d.slot < 14 || d.slot > 41) return hud.notice?.('Equipped items cannot be stored; move it to your inventory first.', 'hata');
      const h = d.x != null ? hedefYuva(d.x, d.y) : null, ds = h?.dataset.dy != null ? sayfa * DS + Number(h.dataset.dy) : null;
      if ((d.count || 1) > 1) adetSor(d.x ?? innerWidth / 2, d.y ?? innerHeight / 2, d.count, (n) => depoKoy(d.slot, n, ds)); else depoKoy(d.slot, 1, ds);
    });
    const cantaDegisti = () => { if (L.el.isConnected) ciz(); else removeEventListener('ko-envanter-degisti', cantaDegisti); };
    addEventListener('ko-envanter-degisti', cantaDegisti);
    const tik = setInterval(() => { if (!L.el.isConnected) return clearInterval(tik); if (!sur) ciz(); }, 1500);   // çanta sunucudan yenilenince
    await yukle(on);
    return api;
  }
  async function depo(npc) {
    // KO'nun kendi depo arayüzü (deadsoft re_warehouse: çerçeve, perçinler, düğmeler birebir); yüklenemezse aşağıdaki HTML yedek
    try { const k = await depoKO(npc); if (k) return k; } catch (e) { console.warn('re_warehouse', e); }
    const DS = 24;   // KO (deadsoft re_warehouse.uif): sayfa başı 24 yuva = 6 sütun × 4 satır, 8 sayfa (192)
    kapatHepsi(); await loadMeta().catch(() => {});
    // KO Inn Hostess depo penceresi: üstte depo (6×4), sayfa · eşya arama · depodaki Noah; altta kendi çantası (7×4), ağırlık ve üzerindeki Noah
    const w = pencere('tic-depo dp-pen', 'Warehouse', `
      <div class="dp-kutu"><div class="tic-izgara dp-depo"></div></div>
      <div class="dp-nav"><button data-k="geri" class="dp-ok" title="Önceki sayfa">◀</button><b class="dp-sayfa">1</b><button data-k="ileri" class="dp-ok" title="Sonraki sayfa">▶</button>
        <input class="dp-ara" placeholder="Eşya ara" spellcheck="false"><button class="dp-ara-btn" title="Ara">Q</button>
        <i class="dn-ikon dp-coin" data-k="cek" title="Depodaki Noah — tıkla: çantaya çek"></i><b class="dn dp-noah">0</b></div>
      <div class="dp-kutu dp-canta-kutu"><div class="tic-izgara dp-canta"></div></div>
      <div class="dp-alt"><span>Ağırlık</span><b class="dp-agir">0/0</b><i class="dn-ikon dp-coin" data-k="yatir" title="Üzerindeki Noah — tıkla: depoya yatır"></i><b class="dp-cnoah">0</b></div>`);
    w.el.dataset.esyaBirak = '1';
    let yuvalar = [], sayfa = 0, ara = '', depoAltin = 0, benAltin = 0;
    const SAY = 192 / DS;
    const yaz = async () => {
      const d = await state.inv?.stats?.().catch?.(() => null) ?? null;
      const ab = d?.ability || {}; benAltin = Number(d?.gold ?? (await altin())) || 0;
      w.el.querySelector('.dp-cnoah').textContent = noah(benAltin);
      if (ab.max_weight != null) w.el.querySelector('.dp-agir').textContent = `${(Number(ab.weight || 0) / 10).toFixed(1)}/${(Number(ab.max_weight) / 10).toFixed(1)}`;
    };
    async function yukle() {
      const d = await rpc('depo_list', {}); if (!d) return;
      await esyalar((d.items || []).map((r) => r.num));
      yuvalar = []; for (const r of d.items || []) yuvalar[r.slot] = { ...r, it: IT.get(r.num) };
      depoAltin = Number(d.gold) || 0; w.el.querySelector('.dp-noah').textContent = noah(depoAltin);
      ciz();
    }
    const eslesir = (x) => !ara || String(x?.it?.strName || '').toLocaleLowerCase('tr').includes(ara);
    function ciz() {
      const parca = Array.from({ length: DS }, (_, i) => yuvalar[sayfa * DS + i]).map((x) => (x?.it ? x : null));
      const izg = w.el.querySelector('.dp-depo');
      izg.innerHTML = izgara(parca, null, false, DS);
      izg.querySelectorAll('.tic-yuva').forEach((e, i) => { e.dataset.i = i; if (ara && parca[i]) e.classList.toggle('dp-soluk', !eslesir(parca[i])); });
      w.el.querySelector('.dp-sayfa').textContent = String(sayfa + 1);
      cantaCiz();
    }
    // alttaki çanta: çanta yuvaları 14–41 (7 sütun × 4 satır)
    function cantaCiz() {
      const its = state.inv?.items, c = w.el.querySelector('.dp-canta');
      c.innerHTML = Array.from({ length: 28 }, (_, i) => {
        const e = its?.get?.(14 + i); if (!e) return `<div class="tic-yuva dp-cy" data-slot="${14 + i}"></div>`;
        const n = Number(e.row.count) > 1 ? Number(e.row.count) : hakli(e.it) ? Number(e.row.durability ?? e.it.Duration) : 0;
        return `<div class="tic-yuva dolu dp-cy" data-slot="${14 + i}">${iconHtml(e.it, 40)}${e.row.kilit ? '<i class="inv-kilit" title="Kilitli"></i>' : ''}${n > 1 ? `<b class="inv-adet">${n}</b>` : ''}</div>`;
      }).join('');
    }
    const cantaEsya = (sl) => state.inv?.items?.get?.(sl) || null;
    const ogeAl = (e) => { const y = e.target.closest('.dp-depo .tic-yuva.dolu'); return y ? yuvalar[sayfa * DS + Number(y.dataset.i)] : null; };
    const depoYuvasi = (x, y) => { const el = document.elementsFromPoint(x, y).map((e) => e.closest?.('.dp-depo .tic-yuva')).find(Boolean); return el && w.el.contains(el) ? sayfa * DS + Number(el.dataset.i) : null; };
    const cantaYuvasi = (x, y) => {
      const pts = document.elementsFromPoint(x, y);
      const ic = pts.map((e) => e.closest?.('.dp-cy')).find(Boolean); if (ic && w.el.contains(ic)) return Number(ic.dataset.slot);
      const el = pts.map((e) => e.closest?.('.inv-yuva')).find(Boolean); const s = el ? Number(el.dataset.slot) : NaN; return s >= 14 && s <= 41 ? s : s >= 0 ? -1 : null;
    };
    const izg = w.el.querySelector('.dp-depo'), cnt = w.el.querySelector('.dp-canta');
    izg.addEventListener('pointermove', (e) => { if (sur) return; const x = ogeAl(e); if (x) ipucu(x.it, e, '', x); else ipucuKapat(); });
    izg.addEventListener('pointerleave', ipucuKapat);
    cnt.addEventListener('pointermove', (e) => { if (sur) return; const y = e.target.closest('.dp-cy.dolu'); const ce = y && cantaEsya(Number(y.dataset.slot)); if (ce) ipucu(ce.it, e, '', { ...ce.row, count: ce.row.count }); else ipucuKapat(); });
    cnt.addEventListener('pointerleave', ipucuKapat);
    const al = async (dslot, n, hedef = null) => {
      const r = hedef == null ? await rpc('depo_al', { p_dslot: dslot }) : await rpc('depo_al2', { p_dslot: dslot, p_count: n, p_hedef: hedef }); if (!r) return;
      hud.info?.(`${adK(r.name)}${r.count > 1 ? ` ×${r.count}` : ''} moved to your inventory.`, 'beceri'); await state.inv?.reload?.(); yukle(); yaz();
    };
    const koy = async (slot, n, ds = null) => {
      const r = await rpc('depo_koy2', { p_slot: slot, p_count: n, p_dslot: ds }); if (!r) return;
      hud.info?.(`${adK(r.name)}${r.count > 1 ? ` ×${r.count}` : ''} moved to the storage.`, 'beceri'); await state.inv?.reload?.(); yukle(); yaz();
    };
    // sağ tık (KO) ya da çift tık: depodaki eşya çantaya, çantadaki eşya depoya (ilk uygun yuva)
    izg.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); const x = ogeAl(e); if (x) al(x.slot, x.count); });
    izg.addEventListener('dblclick', (e) => { const x = ogeAl(e); if (x) al(x.slot, x.count); });
    const cantaHizli = (e) => { const y = e.target.closest('.dp-cy.dolu'); if (!y) return; const sl = Number(y.dataset.slot), ce = cantaEsya(sl); if (!ce) return;
      const n = Number(ce.row.count) || 1; if (n > 1) adetSor(e.clientX, e.clientY, n, (k) => koy(sl, k)); else koy(sl, 1); };
    cnt.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); cantaHizli(e); });
    cnt.addEventListener('dblclick', cantaHizli);
    // sürükle-bırak: depo → depo (taşı) / çanta (al); çanta (bu pencere) → depo (koy) / çanta (yer değiştir: KO çantası)
    let sur = null;
    const surukle = (e, kaynak, it, bitince) => {
      e.preventDefault(); e.stopPropagation(); ipucuKapat();
      const g = document.createElement('div'); g.className = 'inv-esya inv-hayalet'; g.innerHTML = iconHtml(it, 40); document.body.append(g);
      sur = { g }; const mv = (ev) => { g.style.left = ev.clientX - 22 + 'px'; g.style.top = ev.clientY - 22 + 'px'; };
      mv(e); kaynak.classList.add('inv-surukleniyor');
      const up = (ev) => { removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); sur = null; g.remove(); kaynak.classList.remove('inv-surukleniyor'); bitince(ev); };
      addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
    };
    izg.addEventListener('pointerdown', (e) => {
      const x = ogeAl(e); if (!x || e.button !== 0) return;
      surukle(e, e.target.closest('.tic-yuva'), x.it, (ev) => {
        const ds = depoYuvasi(ev.clientX, ev.clientY), cs = ds == null ? cantaYuvasi(ev.clientX, ev.clientY) : null;
        if (ds != null && ds !== x.slot) {
          const tasi = async (n) => { if (await rpc('depo_tasi', { p_from: x.slot, p_to: ds, p_count: n })) yukle(); };
          if (x.count > 1 && !yuvalar[ds]) adetSor(ev.clientX, ev.clientY, x.count, tasi); else tasi(x.count);
        } else if (cs === -1) hud.notice?.('You must drop the item into your inventory.', 'hata');
        else if (cs != null) { if (x.count > 1) adetSor(ev.clientX, ev.clientY, x.count, (n) => al(x.slot, n, cs)); else al(x.slot, 1, cs); }
      });
    });
    cnt.addEventListener('pointerdown', (e) => {
      const y = e.target.closest('.dp-cy.dolu'); if (!y || e.button !== 0) return;
      const sl = Number(y.dataset.slot), ce = cantaEsya(sl); if (!ce) return;
      surukle(e, y, ce.it, (ev) => {
        const ds = depoYuvasi(ev.clientX, ev.clientY); if (ds == null) return;
        const n = Number(ce.row.count) || 1;
        if (n > 1) adetSor(ev.clientX, ev.clientY, n, (k) => koy(sl, k, ds)); else koy(sl, 1, ds);
      });
    });
    w.el.querySelector('[data-k=geri]').addEventListener('click', () => { sayfa = Math.max(0, sayfa - 1); ciz(); });
    w.el.querySelector('[data-k=ileri]').addEventListener('click', () => { sayfa = Math.min(SAY - 1, sayfa + 1); ciz(); });
    // eşya arama: eşleşmeyenler soluklaşır, ilk eşleşmenin sayfasına gidilir
    const araYap = () => {
      ara = w.el.querySelector('.dp-ara').value.trim().toLocaleLowerCase('tr');
      if (ara) { const i = yuvalar.findIndex((x) => x?.it && eslesir(x)); if (i >= 0) sayfa = Math.floor(i / DS); else hud.notice?.('There is no item with that name in the storage.', 'hata'); }
      ciz();
    };
    w.el.querySelector('.dp-ara').addEventListener('keydown', (e) => { if (e.key === 'Enter') araYap(); });
    w.el.querySelector('.dp-ara').addEventListener('input', (e) => { if (!e.target.value) araYap(); });
    w.el.querySelector('.dp-ara-btn').addEventListener('click', araYap);
    // Noah: üstteki para (depo) → çek, alttaki para (üzerindeki) → yatır; KO adet kutusu
    const noahIs = async (isaret, m) => {
      if (!(m > 0)) return;
      const r = await rpc('depo_noah', { p_miktar: isaret * m }); if (!r) return;
      hud.info?.(isaret > 0 ? `Deposited ${noah(m)} Noah into the storage.` : `Withdrew ${noah(m)} Noah from the storage.`, 'beceri');
      depoAltin = Number(r.depo) || 0; w.el.querySelector('.dp-noah').textContent = noah(depoAltin); yenile(); yaz();
    };
    w.el.querySelectorAll('.dp-coin').forEach((c) => c.addEventListener('click', (e) => {
      const yat = c.dataset.k === 'yatir', max = yat ? benAltin : depoAltin;
      if (!(max > 0)) return hud.notice?.(yat ? 'Not enough coins.' : 'There are no coins in the storage.', 'hata');
      adetSor(e.clientX, e.clientY, max, (n) => noahIs(yat ? 1 : -1, n));
    }));
    // KO çantasından (envanter penceresi) sürüklenen eşya: bırakılan depo yuvasına
    w.el.addEventListener('ko-esya-birak', async (ev) => {
      const d = ev.detail || {}; if (d.slot == null) return;
      if (d.slot < 14 || d.slot > 41) return hud.notice?.('Equipped items cannot be stored; move it to your inventory first.', 'hata');
      const ds = d.x != null ? depoYuvasi(d.x, d.y) : null;
      if ((d.count || 1) > 1) adetSor(d.x ?? innerWidth / 2, d.y ?? innerHeight / 2, d.count, (n) => koy(d.slot, n, ds)); else koy(d.slot, 1, ds);
    });
    // çanta değişince (başka yerden) alt ızgara güncellenir
    const tik = setInterval(() => { if (!w.el.isConnected) return clearInterval(tik); if (!sur) cantaCiz(); }, 1500);
    await yukle(); yaz();
    return w;
  }

  // =============== EŞYA YÜKSELTME (demirci)
  async function yukselt(npc) {
    kapatHepsi(); await loadMeta().catch(() => {});
    hud.acPanel?.('envanter');
    const w = pencere('tic-yukselt', 'Eşya Yükseltme', `
      <div class="ty-yuvalar"><div class="ty-yuva" data-t="esya" data-esya-birak="1"><span>Eşya</span></div><b>+</b><div class="ty-yuva" data-t="parsomen" data-esya-birak="1"><span>Parşömen</span></div></div>
      <div class="ty-bilgi">Çantandan yükseltilecek eşyayı ve bir Yükseltme Parşömeni'ni yuvalara sürükle.</div>
      <div class="tic-alt"><button class="tic-dugme" data-k="yukselt">Yükselt</button></div>
      <p class="tic-not">+1…+3 kesin, sonrası şansa bağlı. Başarısız yükseltmede eşya yok olur. Kutsanmış parşömen şansı %10 artırır.</p>`);
    const sec = { esya: null, parsomen: null };
    const SANS = [100, 100, 100, 90, 75, 55, 35, 20, 10];
    const bilgi = () => {
      const e = sec.esya, a = e ? e.num % 10 : 0, k = sec.parsomen?.num === 379021000;
      w.el.querySelector('.ty-bilgi').innerHTML = e ? (a >= 9 ? 'Eşya en yüksek seviyede.' : `${esc(e.it.strName)} → +${a + 1} · başarı şansı <b>%${Math.min(100, SANS[a] + (k ? 10 : 0))}</b>`) : 'Çantandan yükseltilecek eşyayı ve bir Yükseltme Parşömeni\'ni yuvalara sürükle.';
    };
    const ciz = (t) => { const y = w.el.querySelector(`.ty-yuva[data-t=${t}]`), x = sec[t]; y.innerHTML = x ? iconHtml(x.it, 44) : `<span>${t === 'esya' ? 'Eşya' : 'Parşömen'}</span>`; bilgi(); };
    w.el.addEventListener('ko-esya-birak', async (ev) => {
      const d = ev.detail || {}; const y = ev.target.closest?.('.ty-yuva'); if (d.slot == null) return;
      if (d.slot < 14 || d.slot > 41) return hud.notice?.('The item must be in your inventory.', 'hata');
      const [it] = await esyalar([d.num]); if (!it) return;
      const parsomen = [379016000, 379021000, 379205000, 379221000].includes(d.num);
      const t = y?.dataset.t || (parsomen ? 'parsomen' : 'esya');
      if (t === 'parsomen' && !parsomen) return hud.notice?.('Only an upgrade scroll can be placed in this slot.', 'hata');
      if (t === 'esya' && parsomen) { sec.parsomen = { ...d, it }; return ciz('parsomen'); }
      sec[t] = { ...d, it }; ciz(t);
    });
    w.el.querySelector('[data-k=yukselt]').addEventListener('click', () => {
      if (!sec.esya || !sec.parsomen) return hud.notice?.('The items required for upgrade does not match.', 'hata');
      hud.soru?.('Upgrade Item', `Upgrade ${sec.esya.it.strName}?\nThe item might be destroyed while performing the upgrade. Will you continue?`, async () => {
        const r = await rpc('npc_upgrade', { p_npc: npc.id, p_slot: sec.esya.slot, p_scroll: sec.parsomen.slot }); if (!r) return;
        if (r.basari) hud.info?.(`Item upgrade succeeded. ${r.name}`, 'seviye'); else hud.info?.(['Item upgrade failed. ', [String(r.name ?? ''), nameColor(sec.esya.it)], ' has been destroyed.'], 'hata');
        hud.notice?.(r.basari ? `Item upgrade succeeded: ${r.name}` : 'Item upgrade failed.', r.basari ? 'seviye' : 'hata');
        sec.esya = null; if ((sec.parsomen.count || 1) <= 1) sec.parsomen = null; else sec.parsomen.count--;
        ciz('esya'); ciz('parsomen'); yenile();
      });
    });
    return w;
  }

  // =============== EŞYA KİLİTLEME (Inn Hostess) — eşya + Sealed Item + parola, 10.000.000 Noah
  // yalnız silah, kalkan, zırh, takı (sunucu _kilitlenebilir). Kilitli eşya takas, satış, pazar, posta ve yok etmede kullanılamaz.
  const SEALED_ITEM = 810890000;
  const KILIT_KIND = new Set([11, 21, 22, 31, 32, 41, 42, 51, 52, 60, 63, 70, 71, 110, 140, 181, 91, 92, 93, 94, 200, 210, 220, 230, 240]);
  async function kilitPencere(npc, ac) {
    kapatHepsi(); await loadMeta().catch(() => {});
    hud.acPanel?.('envanter');
    // KO Item Seal penceresi: üstte eşya yuvası, solda "Seal gerekli" (Sealed Item ikonu + adet) ve seal yuvası, altta ücret,
    // tek parola satırı, Onayla / İptal
    const [sealIt] = ac ? [null] : await esyalar([SEALED_ITEM]).catch(() => [null]);
    const w = pencere('tic-kilit', ac ? 'Eşya Kilidi Aç' : 'Eşya Kilitleme', `
      <div class="tk-alan${ac ? ' tk-ac' : ''}">
        <div class="tk-yuva tk-esya" data-t="esya" data-esya-birak="1" title="Eşya"></div>
        ${ac ? '' : `<div class="tk-gerek"><div class="tk-gerek-ikon">${sealIt ? iconHtml(sealIt, 34) : ''}</div><div class="tk-gerek-yazi">Seal gerekli<span>Adet <b>1</b></span></div></div>
        <div class="tk-yuva tk-seal" data-t="seal" data-esya-birak="1" title="Sealed Item"></div>
        <div class="tk-ucret"><i class="dn-ikon"></i><b>10.000.000</b></div>`}
      </div>
      <div class="tk-bilgi"></div>
      <div class="tk-parola"><div>Kilit parolasını gir</div><input type="password" maxlength="12" autocomplete="new-password" data-k="p1" placeholder="4–12 karakter"></div>
      <div class="tk-dugmeler"><button class="ay-dugme tk-onay" data-k="tamam">Onayla</button><button class="ay-dugme tk-iptal" data-k="iptal">İptal</button></div>`);
    w.el.querySelector('[data-k=iptal]').addEventListener('click', () => w.kapat());
    requestAnimationFrame(() => requestAnimationFrame(() => { w.el.style.left = '60px'; }));   // çanta + karakter paneliyle çakışmasın (solda)
    w.el.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    const sec = { esya: null, seal: null };
    const bilgi = () => { const e = sec.esya; w.el.querySelector('.tk-bilgi').innerHTML = e ? esc(adK(e.it.strName)) + (e.kilit ? ' <b class="tk-kilitli">(kilitli)</b>' : '') : (ac ? 'Kilitli eşyayı yuvaya sürükle.' : 'Eşyayı ve Sealed Item\'ı yuvalara sürükle.'); };
    const ciz = (t) => { const y = w.el.querySelector(`.tk-yuva[data-t=${t}]`); if (!y) return; const x = sec[t]; y.innerHTML = x ? iconHtml(x.it, 44) : ''; y.classList.toggle('dolu', !!x); bilgi(); };
    bilgi();
    w.el.addEventListener('ko-esya-birak', async (ev) => {
      const d = ev.detail || {}; const y = ev.target.closest?.('.tk-yuva'); if (d.slot == null) return;
      if (d.slot < 14 || d.slot > 41) return hud.notice?.('The item must be in your inventory.', 'hata');
      const [it] = await esyalar([d.num]); if (!it) return;
      const sealMi = Number(d.num) === SEALED_ITEM;
      const t = ac ? 'esya' : (y?.dataset.t || (sealMi ? 'seal' : 'esya'));
      const kilit = !!state.inv?.items?.get?.(d.slot)?.row?.kilit;
      if (t === 'seal') { if (!sealMi) return hud.notice?.('Only a Sealed Item can be placed in the seal slot.', 'hata'); sec.seal = { ...d, it }; return ciz('seal'); }
      if (sealMi && !ac) { sec.seal = { ...d, it }; return ciz('seal'); }
      if (ac && !kilit) return hud.notice?.('This item is not sealed.', 'hata');
      if (!ac) {
        if (kilit) return hud.notice?.('This item is already sealed.', 'hata');
        if (!KILIT_KIND.has(Number(it.Kind)) || Number(it.Countable) > 0) return hud.notice?.('Only weapons, shields, armor and accessories can be sealed.', 'hata');
      }
      sec.esya = { ...d, it, kilit }; ciz('esya');
    });
    w.el.querySelector('[data-k=tamam]').addEventListener('click', async () => {
      const p1 = w.el.querySelector('[data-k=p1]').value;
      if (!sec.esya) return hud.notice?.('Place an item in the item slot.', 'hata');
      if (!ac && !sec.seal) return hud.notice?.('Place a Sealed Item in the seal slot.', 'hata');
      if (p1.length < 4 || p1.length > 12) return hud.notice?.('The password must be 4–12 characters.', 'hata');
      if (ac) {
        const r = await rpc('esya_kilit_ac', { p_npc: npc.id, p_slot: sec.esya.slot, p_parola: p1 }); if (!r) return;
        hud.info?.(`${adK(r.ad)} has been unsealed.`, 'beceri');
      } else {
        const r = await rpc('esya_kilitle', { p_npc: npc.id, p_slot: sec.esya.slot, p_seal_slot: sec.seal.slot, p_parola: p1 }); if (!r) return;
        hud.info?.(`${adK(r.ad)} has been sealed (−${noah(r.ucret)} Noah). Do not forget your password; the item can only be unsealed with it.`, 'seviye');
        try { state.combat?.applyStats?.({ gold: r.gold }); state.inv?.stats?.(); } catch {}
        if ((sec.seal.count || 1) <= 1) sec.seal = null; else sec.seal.count--;
      }
      sec.esya = null; w.el.querySelectorAll('input').forEach((i) => (i.value = ''));
      ciz('esya'); ciz('seal'); yenile();
    });
    return w;
  }
  // KO Item Seal penceresi (deadsoft re_item_seal); arayüz paketi yüklenemezse sade HTML pencere
  let SEAL = null;
  const sealAc = async (npc, ac) => {
    kapatHepsi();
    try { SEAL ||= (await import('./seal.js')).initSeal({ sb, character, hud, state }); if (await (ac ? SEAL.kilitAc(npc) : SEAL.kilitle(npc))) return; } catch (e) { console.warn('item seal', e); }
    return kilitPencere(npc, ac);
  };
  const kilitle = (npc) => sealAc(npc, false);
  const kilitAc = (npc) => sealAc(npc, true);

  // =============== TAMİR / İYİLEŞTİR
  async function tamir(npc) {
    const d = await rpc('npc_repair', { p_npc: npc.id, p_onay: false }); if (!d) return;
    if (!d.adet) return hud.info?.('There are no items to repair.', 'beceri');
    hud.soru?.('Repair', `Repair ${d.adet} equipped item(s) for ${noah(d.tutar)} Noah?`, async () => {
      const r = await rpc('npc_repair', { p_npc: npc.id, p_onay: true }); if (!r) return;
      hud.info?.(`${r.adet} item(s) repaired (−${noah(r.tutar)} Noah).`, 'beceri');
      for (const [sl, e] of state.inv?.items || []) if (sl <= 13 && !Number(e.it?.Countable) && Number(e.it?.Duration) > 1) state.inv?.dayanikYaz?.(sl, Number(e.it.Duration));   // anında
      yenile();
    });
  }
  async function iyilestir(npc) {
    const d = await rpc('npc_heal', { p_npc: npc.id }); if (!d) return;
    hud.info?.('The priest has healed you. HP and MP fully recovered.', 'beceri');
    try { state.combat?.applyStats?.({ hp: d.hp, mp: d.mp, max_hp: d.max_hp, max_mp: d.max_mp }); } catch {}
    try { state.inv?.stats?.(); } catch {}
  }

  // RPR modu (KO [Sundries] "Eşya tamir et"): imleç tamir çekici olur; çantada / kuşanılmış yuvada dayanıklılığı azalmış
  // eşyaya tıklayınca o eşya tamir edilir (ücret ipucunun en altında yazar). Başka yere tıklanınca, sağ tık ya da Esc ile moddan çıkılır.
  let rprCikis = null;
  function rpr(npc) {
    rprCikis?.();
    kapatHepsi();
    hud.acPanel?.('envanter');
    document.documentElement.classList.add('imlec-tamir');
    window.__koTamir = { npc };
    let mesgul = false;
    const down = async (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('.kui-root') && t.closest('.kui-root').querySelector('[data-id="Btn_Yes"], [data-id="Btn_Ok"]')) return;   // KO mesaj kutusu
      const y = e.button === 0 ? t?.closest('.inv-yuva') : null;
      if (!y) {
        if (e.button === 0 && t?.closest('.ko-inv, #ko-ipucu-yuzen')) { e.stopPropagation(); e.preventDefault(); return; }   // çantanın boş yeri: mod sürer
        cik(); return;   // çanta dışına tıklandı: tamir modundan çık (tıklama normal işler)
      }
      e.stopPropagation(); e.preventDefault();
      if (mesgul) return;
      const slot = Number(y.dataset.slot), E = state.inv?.items?.get(slot);
      if (!E) return;
      const max = Number(E.it?.Duration) || 0, dur = E.row?.durability;
      if (Number(E.it?.Countable) || max <= 1 || dur == null) { hud.notice?.('You cannot repair this item.', 'hata'); return; }
      if (Number(dur) >= max) { hud.notice?.('The durability of this item is already full.', 'hata'); return; }
      mesgul = true;
      const r = await rpc('npc_repair_slot', { p_npc: npc.id, p_slot: slot });
      mesgul = false;
      if (!r) return;
      sesUi?.('tamir');
      hud.info?.(`Durability of ${E.it?.strName || r.name} has recovered (−${noah(r.tutar)} Noah).`, 'beceri');
      if (r.gold != null) state.combat?.applyStats?.({ gold: r.gold });
      state.inv?.dayanikYaz?.(slot, r.durability ?? max);   // ipucu anında tam dayanıklılığı gösterir
      yenile();
    };
    const tus = (e) => { if (e.key === 'Escape') cik(); };
    const sag = (e) => { e.preventDefault(); cik(); };
    function cik() {
      removeEventListener('pointerdown', down, true); removeEventListener('keydown', tus, true); removeEventListener('contextmenu', sag, true);
      document.documentElement.classList.remove('imlec-tamir'); window.__koTamir = null; rprCikis = null;
      document.getElementById('ko-ipucu-yuzen')?.remove();
    }
    addEventListener('pointerdown', down, true); addEventListener('keydown', tus, true); addEventListener('contextmenu', sag, true);
    rprCikis = cik;
    hud.info?.('Repair mode: click an item with reduced durability. Click elsewhere to exit.', 'beceri');
  }

  return { ticaret, depo, depoOnYukle, yukselt, tamir, rpr, iyilestir, kilitle, kilitAc, kapatHepsi, get acik() { return acik.size > 0; } };
}

/** KO adet penceresi (depo, takas): bırakılan yerin yanında küçük kutu, Enter onay / Esc iptal */
export function adetSorPencere(x, y, max, onay, baslik = 'Amount') {
  document.querySelector('.tic-adet')?.remove();
  const yerlestir = (el, w, h) => { el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 18)) + 'px'; el.style.top = Math.max(8, Math.min(innerHeight - h - 8, y - 20)) + 'px'; };
  // KO miktar penceresi (re_tradecount): başlık "Amount", sayı kutusu, OK / Cancel
  if (hasLayout('re_tradecount')) {
    const L = buildLayout('re_tradecount', { className: 'tic-adet tic-adet-ko kui-dokulu' });
    document.body.append(L.el); yerlestir(L.el, 266, 130);
    L.text('text_title', baslik);
    const inp = L.input('edit_count', { type: 'number', min: 1, max, value: max });
    const kapat = () => L.el.remove();
    const tamam = () => { const n = Math.floor(Number(inp.value)); if (!(n >= 1)) return inp.focus(); kapat(); onay(Math.min(max, n)); };
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    L.click('btn_ok', tamam); L.click('btn_cancel', kapat);
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') tamam(); if (e.key === 'Escape') kapat(); });
    setTimeout(() => { inp.focus(); inp.select?.(); }, 20);
    return;
  }
  const p = document.createElement('div'); p.className = 'ko-panel tic-adet';
  p.innerHTML = `<div class="ta-baslik">${baslik}</div><input type="number" min="1" max="${max}" value="${max}"><div class="ta-alt"><button class="ay-dugme" data-k="ok">OK</button><button class="ay-dugme" data-k="iptal">Cancel</button></div>`;
  document.body.append(p); yerlestir(p, 150, 110);
  const inp = p.querySelector('input'); inp.focus(); inp.select();
  const kapat = () => p.remove();
  const tamam = () => { const n = Math.floor(Number(inp.value)); if (!(n >= 1)) return; kapat(); onay(Math.min(max, n)); };
  p.addEventListener('pointerdown', (e) => e.stopPropagation());
  p.querySelector('[data-k=ok]').addEventListener('click', tamam);
  p.querySelector('[data-k=iptal]').addEventListener('click', kapat);
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') tamam(); if (e.key === 'Escape') kapat(); });
}
