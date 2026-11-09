// Oyuncular arası takas (KO Trade) + oyuncuya sağ tık menüsü.
// Akış: sağ tık → "Ticaret iste" → karşı tarafa onay kutusu → kabul edilince iki taraflı takas penceresi.
// Eşyalar çantadan pencereye sürüklenir, Noah yazılır; iki taraf da "Onayla" deyince sunucu tek işlemde değiştirir.
// Durum sunucudaki `takas` tablosunda; iki taraf da Realtime ile anında görür.
import { loadMeta, iconHtml, tooltipHtml, fromDb, nameColor } from './esya.js';
import { koWindow, toFront } from './ko-pencere.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const noah = (n) => Number(n || 0).toLocaleString('tr-TR');
const SINIF = { 1: 'Warrior', 2: 'Rogue', 3: 'Magician', 4: 'Priest', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Enchanter', 11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Shadow Vain', 15: 'Shadow Knight' };

export function initTakas({ sb, character, hud, state, adOf, konum, pvp, posOf }) {
  const me = Number(character.id);
  const IT = new Map();
  async function esyalar(nums) {
    const eksik = [...new Set(nums)].filter((n) => !IT.has(n));
    if (eksik.length) { const { data } = await sb.from('items').select('*').in('num', eksik); for (const r of data || []) IT.set(r.num, fromDb(r)); }
  }
  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, { p_char: me, ...args });
    if (error) { hud.notice?.(error.message, 'hata'); return null; }
    if (data?.ok === false) { hud.notice?.(data.reason || 'The operation failed.', 'hata'); return null; }
    return data;
  };

  // ---------- oyuncu sağ tık menüsü
  let menu = null;
  const menuKapat = () => { menu?.remove(); menu = null; };
  addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target)) menuKapat(); }, true);
  // takas isteği: oyuncu menüsünden ya da H menüsünden (seçili oyuncuya)
  // (31.10) KO: takas isteği 10 sn içinde yanıtlanmazsa ya da iki oyuncu birbirinden uzaklaşırsa (> 8 m) kendiliğinden iptal
  const ISTEK_SN = 10000, ISTEK_MESAFE = 8;
  function istekIzle(diger, iptal) {
    const t0 = performance.now();
    const tik = setInterval(() => {
      const p = konum?.(), q = posOf?.(diger);
      const uzak = p && q && Math.hypot(p.x - q.x, p.z - q.z) > ISTEK_MESAFE;
      if (performance.now() - t0 > ISTEK_SN || uzak) { clearInterval(tik); iptal(); }
    }, 250);
    return () => clearInterval(tik);
  }
  let bekleyenIstek = null;
  async function takasIste(id, meta) {
    const p = konum?.(); if (p) { try { await sb.from('characters').update({ x: p.x, y: p.y, z: p.z }).eq('id', me); } catch {} }
    const d = await rpc('takas_iste', { p_hedef: Number(id) });
    if (d) {
      hud.info?.(`A request for a trade has been sent to ${meta?.name || 'the player'}. Please wait for a reply.`, 'beceri');
      bekleyenIstek?.dur?.();
      const tid = d.id ?? d.takas ?? null;
      const k = { tid, dur: null };
      k.dur = istekIzle(id, async () => { if (bekleyenIstek !== k) return; bekleyenIstek = null; let sat = null; try { sat = tid != null ? (await sb.from('takas').select('durum').eq('id', tid).maybeSingle()).data : null; } catch {}
        if (tid != null && (!sat || sat.durum === 'istek')) { rpc('takas_iptal', { p_takas: tid }); hud.info?.('The trade request has been cancelled.', 'hata'); } });
      bekleyenIstek = k;
    }
    return d;
  }
  function oyuncuMenu(id, meta, x, y) {
    menuKapat();
    if (state?.arkadas?.oyuncuMenu?.(id, meta, x, y)) return;   // KO re_minimenu (arkadas.js); yüklenemezse aşağıdaki sade menü
    const ogeler = [...(state?.pazar?.saticiMi?.(id) ? [['pazar', 'Pazarına bak']] : [['takas', 'Takas isteği gönder']]), ['mesaj', 'Mesaj'], ['bilgi', 'Bilgi']];   // KO: pazardaki oyuncuyla takas yapılamaz
    // KO: lider / yardımcı lider, klansız aynı ulus oyuncusunu klana davet eder
    if (state?.klan && [1, 2].includes(Number(state.klan.rutbe)) && Number(meta?.nation) === Number(character.nation) && !meta?.klan) ogeler.push(['klan', 'Klana davet et']);
    // KO sade sağ tık menüsü: küçük koyu kutu, üstte ad, altında tek satırlık seçenekler
    menu = document.createElement('div'); menu.className = 'oyuncu-menu-k';
    menu.innerHTML = `<div class="omk-ad">${esc(meta?.name || 'Oyuncu')}${meta?.level ? ` <i>Sv ${meta.level}</i>` : ''}</div>
      ${ogeler.map(([k, t]) => `<button class="omk-sec${k === 'saldir' ? ' tehlike' : ''}" data-k="${k}">${t}</button>`).join('')}`;
    (document.getElementById('kohud') || document.body).append(menu);
    menu.style.pointerEvents = 'auto'; menu.style.zIndex = 70;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(x + 8, innerWidth - r.width - 4)) + 'px'; menu.style.top = Math.max(4, Math.min(y + 8, innerHeight - r.height - 4)) + 'px';
    menu.addEventListener('pointerdown', (e) => e.stopPropagation());
    menu.addEventListener('click', async (e) => {
      const k = e.target.closest('button')?.dataset.k; if (!k) return;
      menuKapat();
      if (k === 'bilgi') hud.info?.(`${meta?.name}: Level ${meta?.level ?? '?'} ${SINIF[meta?.cls] || ''} (${Number(meta?.nation) === 2 ? 'El Morad' : 'Karus'})`, 'beceri');
      if (k === 'saldir') pvp?.hedefle?.(id);
      if (k === 'mesaj') state?.pm?.ac(id, meta?.name);
      if (k === 'klan') state?.klanApi?.davetEt?.(id);
      if (k === 'takas') await takasIste(id, meta);
      if (k === 'pazar') state?.pazar?.bak?.(id);
    });
  }

  // ---------- takas penceresi
  let T = null, win = null, tip = null;
  const benA = () => T && Number(T.a) === me;
  const benim = () => (benA() ? { esya: T.a_esya, noah: T.a_noah, onay: T.a_onay } : { esya: T.b_esya, noah: T.b_noah, onay: T.b_onay });
  const onun = () => (benA() ? { esya: T.b_esya, noah: T.b_noah, onay: T.b_onay } : { esya: T.a_esya, noah: T.a_noah, onay: T.a_onay });
  const karsiId = () => (benA() ? T.b : T.a);
  const ipucuKapat = () => tip?.remove();
  // ---------- (3.11) KO orijinal takas penceresi (re_personaltrade): üstte iki taraf 3×3, Noah kutuları, kayıt listesi, iki Trade düğmesi; altta 7×4 çanta + Noah
  let KO = null;   // { L, my[], other[], inv[], liste }
  async function pencereKurKO() {
    const K = await import('./kui.js');
    if (!(await K.ekUI('takas2').catch(() => false)) || !K.hasLayout('re_personaltrade')) return false;
    if (win) return true;
    const L = K.buildLayout('re_personaltrade', { className: 'ko-takas2 ko-pencere kui-dokulu' });
    win = L.el; win.id = 'takas-pencere'; win.classList.add('ko-tic'); win.hidden = true;
    (document.getElementById('kohud') || document.body).append(win);
    win.style.pointerEvents = 'auto'; win.style.zIndex = 60;
    // yuvalar konumdan ayrılır (kimlikler yinelenir: '0'…): üst sol = benim, üst sağ = karşı taraf, alt = çanta
    const my = [], other = [], inv = [];
    for (const a of win.querySelectorAll('.kui-ar')) {
      const id = a.dataset.id || ''; if (!/^\d+$/.test(id)) continue;
      const x = parseFloat(a.style.left), y = parseFloat(a.style.top);
      (y >= 390 ? inv : x < 210 ? my : other)[Number(id)] = a;
    }
    for (const t of win.querySelectorAll('.kui-tx')) if (/^\d+$/.test(t.dataset.id || '')) t.textContent = '';   // adet yazıları yuvanın içinde çizilir
    my.forEach((a, i) => { a.classList.add('tk2-yuva', 'tk-my'); a.dataset.yer = i; });
    other.forEach((a) => a.classList.add('tk2-yuva', 'tk-other'));
    inv.forEach((a, i) => { a.classList.add('tk2-yuva', 'tk-inv'); a.dataset.cy = 14 + i; });
    for (const t of win.querySelectorAll(':scope > .kui-tx')) if (t.textContent.trim() === 'Trade') t.classList.add('tk2-baslik');
    for (const id of ['area_my', 'area_other']) { const a = L.get(id); if (a) a.style.pointerEvents = 'none'; }   // (3.11) üstteki alan katmanı yuvalara tıklamayı / bırakmayı engellemesin
    const liste = document.createElement('div'); liste.className = 'tk2-liste'; L.get('list_iteminfo')?.append(liste);
    L.text('text_id_my', character.name || '');
    KO = { L, my, other, inv, liste, kayit: [] };
    // kapat / Trade
    L.click('btn_close', () => T && rpc('takas_iptal', { p_takas: T.id }));
    L.click('btn_trade_my', async () => { if (!T || benim().onay) return; const k = benA() ? 'a_onay' : 'b_onay'; T = { ...T, [k]: true }; cizKO(); yay({ [k]: true }); const d = await rpc('takas_onay', { p_takas: T.id }); yayY(); if (d?.bitti) bitti(true); else tazele(); });
    // Noah: çantadaki Noah simgesi ya da kendi Noah kutusunun simgesi → miktar sor
    const noahSor = (e) => { if (!T || benim().onay) return; const g = Number(state.combat?.stats?.gold ?? 0);
      import('./ticaret.js').then(({ adetSorPencere }) => adetSorPencere(e?.clientX ?? innerWidth / 2, e?.clientY ?? innerHeight / 2, Math.min(21000000000, Math.max(0, g)), (n) => { const m = Math.max(0, Math.floor(Number(n) || 0)), k = benA() ? 'a_noah' : 'b_noah'; T = { ...T, [k]: m, a_onay: false, b_onay: false }; cizKO(); yay({ [k]: m, a_onay: false, b_onay: false }); rpc('takas_noah', { p_takas: T.id, p_miktar: m }).then(degisti); }, 'Noah')); };
    L.click('btn_gold', noahSor); L.click('btn_gold2', noahSor);
    win.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(win); });
    win.addEventListener('contextmenu', (e) => e.preventDefault());
    win.addEventListener('keydown', (e) => e.stopPropagation());
    // çantadan takasa: sağ tık / çift tık ya da benim tarafıma sürükle; benim tarafımda tıklama = geri al
    const koyCanta = (slot, x, y, yer = -1) => {
      if (!T || benim().onay) return; const b = state.inv?.items?.get(slot); if (!b?.it) return;
      if ([...(benim().esya || [])].some((e) => Number(e.slot) === slot)) return;
      const n0 = Number(b.row?.count) || 1;
      const koy = async (n) => {
        if (!T) return;
        // (3.11) anında: eşya seçilen takas yuvasında görünür, çantadan kalkar; sunucu onayı gelince kayıt yenilenir (başarısızsa geri döner)
        const k = benA() ? 'a_esya' : 'b_esya', liste = [...(T[k] || [])], num = Number(b.it.Num ?? b.row?.item_num);
        const dolu = new Set(yerlesik(liste).map((e, i) => (e ? i : -1)).filter((i) => i >= 0));
        const yer2 = yer >= 0 && !dolu.has(yer) ? yer : [...Array(9).keys()].find((i) => !dolu.has(i)); if (yer2 == null) return hud.notice?.('There is no empty slot in the trade window.', 'hata');
        if (!IT.has(num)) IT.set(num, b.it);
        liste.push({ slot, num, count: n, yer: yer2, bekle: 1 }); T = { ...T, [k]: liste, a_onay: false, b_onay: false }; cizKO(); yay({ [k]: liste, a_onay: false, b_onay: false }, { [num]: b.it });
        KO.bekle = (KO.bekle || 0) + 1; await rpc('takas_koy2', { p_takas: T.id, p_slot: slot, p_count: n, p_yer: yer2 }); KO.bekle--; degisti();
      };
      if (n0 > 1) import('./ticaret.js').then(({ adetSorPencere }) => adetSorPencere(x, y, n0, koy)); else koy(1);
    };
    let sur = null;
    win.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const y = e.target.closest('.tk-inv.dolu, .tk-my.dolu'); if (!y || !T) return;
      sur = { y, x: e.clientX, yy: e.clientY, g: null };
    });
    addEventListener('pointermove', (e) => {
      if (!sur) return;
      if (!sur.g && Math.hypot(e.clientX - sur.x, e.clientY - sur.yy) > 5) { sur.g = document.createElement('div'); sur.g.className = 'inv-hayalet'; sur.g.innerHTML = sur.y.innerHTML; document.body.append(sur.g); sur.y.style.opacity = '.35'; }
      if (sur.g) { sur.g.style.left = (e.clientX - 22) + 'px'; sur.g.style.top = (e.clientY - 22) + 'px'; }
    });
    addEventListener('pointerup', (e) => {
      if (!sur) return; const s0 = sur; sur = null; s0.g?.remove(); s0.y.style.opacity = '';
      const hedef = document.elementsFromPoint(e.clientX, e.clientY).map((q) => q.closest?.('.tk-my')).find(Boolean);
      if (s0.y.classList.contains('tk-inv')) { if (s0.g && hedef) koyCanta(Number(s0.y.dataset.cy), e.clientX, e.clientY, Number(hedef.dataset.yer)); return; }
      // benim tarafım: sürüklemeden tıklama → geri al; başka yuvaya sürükle → yer değiştir
      if (!T || benim().onay) return;
      const slot = Number(s0.y.dataset.slot);
      if (!s0.g) { const k = benA() ? 'a_esya' : 'b_esya', liste = (T[k] || []).filter((e) => Number(e.slot) !== slot); T = { ...T, [k]: liste, a_onay: false, b_onay: false }; cizKO(); yay({ [k]: liste, a_onay: false, b_onay: false }); rpc('takas_cikar', { p_takas: T.id, p_slot: slot }).then(degisti); }
      else if (hedef) { const k = benA() ? 'a_esya' : 'b_esya', yr = Number(hedef.dataset.yer), liste = (T[k] || []).map((e) => (Number(e.slot) === slot ? { ...e, yer: yr } : Number(e.yer) === yr ? { ...e, yer: null } : e)); T = { ...T, [k]: liste }; cizKO(); yay({ [k]: liste }); rpc('takas_yer', { p_takas: T.id, p_slot: slot, p_yer: yr }).then(degisti); }
    });
    win.addEventListener('contextmenu', (e) => { const y = e.target.closest('.tk-inv.dolu'); if (y) koyCanta(Number(y.dataset.cy), e.clientX, e.clientY); });
    win.addEventListener('dblclick', (e) => { const y = e.target.closest('.tk-inv.dolu'); if (y) koyCanta(Number(y.dataset.cy), e.clientX, e.clientY); });
    // ana çantadan bırakma (eski akış) da çalışır
    win.addEventListener('ko-esya-birak', (ev) => { const d = ev.detail || {}; if (d.slot == null) return; const h = d.x != null ? document.elementsFromPoint(d.x, d.y).map((q) => q.closest?.('.tk-my')).find(Boolean) : null; koyCanta(Number(d.slot), d.x ?? innerWidth / 2, d.y ?? innerHeight / 2, h ? Number(h.dataset.yer) : -1); });
    win.dataset.esyaBirak = '1';
    // ipucu
    win.addEventListener('pointermove', (e) => {
      const y = e.target.closest('.tk2-yuva.dolu'); if (!y) return ipucuKapat();
      const it = IT.get(Number(y.dataset.num)); if (!it) return;
      tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu ko-tic-ipucu' });
      if (!tip.isConnected) document.body.append(tip);
      tip.innerHTML = tooltipHtml(it, { count: Number(y.dataset.count) });
      tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, e.clientY - 10)) + 'px';
    });
    win.addEventListener('pointerleave', ipucuKapat);
    // çanta değişince (takas sırasında) yeniden çiz
    KO.cantaT = setInterval(() => { if (KO && T) cantaCiz(); }, 700);
    // (3.11) karşı tarafın koyduğu eşya / Noah / onay: realtime kaçarsa da 1 sn'de bir takas kaydı okunur
    KO.yoklaT = setInterval(() => { if (KO && T && !(KO.bekle > 0)) tazele(); }, 1000);
    // ekranın ortası
    requestAnimationFrame(() => { win.hidden = false; const r = win.getBoundingClientRect(); win.style.left = Math.max(8, (innerWidth - r.width) / 2) + 'px'; win.style.top = Math.max(8, (innerHeight - r.height) / 2) + 'px'; toFront(win); });
    return true;
  }
  const yuvaYaz = (a, e, it) => {
    const n = Number(e?.count) || 0;
    const imza = e ? `${e.num}|${n}` : '';
    if (a._imza === imza) return; a._imza = imza;
    a.classList.toggle('dolu', !!e);
    if (!e) { a.innerHTML = ''; delete a.dataset.num; delete a.dataset.slot; return; }
    a.dataset.num = e.num; a.dataset.count = n; if (e.slot != null) a.dataset.slot = e.slot;
    a.innerHTML = `${iconHtml(it || { Kind: 0 }, 43)}${n > 1 ? `<b class="inv-adet">${n}</b>` : ''}`;
  };
  function cantaCiz() {
    if (!KO) return;
    const items = state.inv?.items || new Map(), konan = new Map((benim().esya || []).map((e) => [Number(e.slot), Number(e.count) || 1]));
    KO.inv.forEach((a, i) => {
      const b = items.get(14 + i); if (!b?.it) return yuvaYaz(a, null);
      const n = (Number(b.row?.count) || 1) - (konan.get(14 + i) || 0);
      if (konan.has(14 + i) && n <= 0) return yuvaYaz(a, null);   // takasa konan eşya çantada görünmez
      if (!IT.has(Number(b.it.Num ?? b.row?.item_num))) IT.set(Number(b.it.Num ?? b.row?.item_num), b.it);
      yuvaYaz(a, { num: Number(b.it.Num ?? b.row?.item_num), count: Number(b.row?.count) > 1 ? n : 0 }, b.it);
    });
    KO.L.text('string_money_inv', noah(state.combat?.stats?.gold ?? 0));
  }
  const yerlesik = (liste0, n = 9) => { const liste = []; const bos = []; for (const e of liste0 || []) { if (e.yer != null && e.yer >= 0 && e.yer < n && !liste[e.yer]) liste[e.yer] = e; else bos.push(e); }
    for (const e of bos) { const i = [...Array(n).keys()].find((k) => !liste[k]); if (i != null) liste[i] = e; } return liste; };
  async function cizKO() {
    const b = benim(), o = onun();
    KO.L.text('text_id_other', adOf?.(karsiId()) || '');
    const bl = yerlesik(b.esya), ol = yerlesik(o.esya);
    KO.my.forEach((a, i) => yuvaYaz(a, bl[i] ? { ...bl[i], count: Number(bl[i].count) > 1 ? bl[i].count : 0 } : null, IT.get(Number(bl[i]?.num))));
    KO.other.forEach((a, i) => yuvaYaz(a, ol[i] ? { ...ol[i], count: Number(ol[i].count) > 1 ? ol[i].count : 0 } : null, IT.get(Number(ol[i]?.num))));
    KO.L.text('string_money_my', noah(b.noah)); KO.L.text('string_money_other', noah(o.noah));
    // KO: karşı tarafın koyduğu eşyalar listede "X registered" (ad rengiyle)
    const once = KO.oncekiOther || new Set(), simdi = new Set();
    for (const e of o.esya || []) { const k = `${e.slot}|${e.num}`; simdi.add(k); if (!once.has(k)) { const it = IT.get(Number(e.num)); KO.kayit.push({ t: `${it?.strName || 'Item'} registered`, c: nameColor(it) }); } }
    KO.oncekiOther = simdi;
    KO.liste.innerHTML = KO.kayit.slice(-2).map((x) => `<div style="color:${x.c}">${esc(x.t)}</div>`).join('');
    // Trade düğmeleri: onaylayan taraf basılı görünür
    KO.L.get('btn_trade_my')?.classList.toggle('secili', !!b.onay);
    KO.L.show('img_trade_other_down', !!o.onay); KO.L.show('img_trade_other_normal', !o.onay);
    cantaCiz();
  }
  function pencereKur() {
    if (win) return;
    win = document.createElement('div'); win.id = 'takas-pencere'; win.className = 'ko-panel ko-pencere ko-tic';
    win.innerHTML = `<div class="ay-baslik">Ticaret</div><button class="ko-kapat" title="İptal"></button>
      <div class="tk-taraflar">
        <div class="tk-taraf tk-onun"><div class="tk-ad"></div><div class="tk-izgara"></div><div class="tk-noah">Noah: <b>0</b></div><div class="tk-durum"></div></div>
        <div class="tk-taraf tk-benim" data-esya-birak="1"><div class="tk-ad">Sen</div><div class="tk-izgara"></div>
          <div class="tk-noah">Noah: <input type="number" min="0" class="tk-noah-gir" value="0"></div><div class="tk-durum"></div></div>
      </div>
      <div class="tic-alt"><button class="ay-dugme tic-dugme" data-k="onay">Onayla</button><button class="ay-dugme tic-dugme" data-k="iptal">İptal</button></div>
      <p class="tic-not">Eşyaları çantadan sağdaki bölüme sürükle. Koyduğun eşyaya tıklayınca geri alınır. İki taraf da onaylayınca takas tamamlanır.</p>`;
    (document.getElementById('kohud') || document.body).append(win);
    win.style.pointerEvents = 'auto';
    koWindow(win, { center: false }); toFront(win);
    requestAnimationFrame(() => { const r = win.getBoundingClientRect(); win.style.left = Math.max(8, innerWidth / 2 - r.width - 40) + 'px'; win.style.top = Math.max(46, (innerHeight - r.height) / 2) + 'px'; });
    win.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(win); });
    win.addEventListener('keydown', (e) => e.stopPropagation());
    win.querySelector('.ko-kapat').onclick = () => T && rpc('takas_iptal', { p_takas: T.id });
    win.querySelector('[data-k=iptal]').onclick = () => T && rpc('takas_iptal', { p_takas: T.id });
    win.querySelector('[data-k=onay]').onclick = async () => { if (!T) return; const d = await rpc('takas_onay', { p_takas: T.id }); if (d?.bitti) bitti(true); };
    const inp = win.querySelector('.tk-noah-gir'); let nt = 0;
    inp.addEventListener('input', () => { clearTimeout(nt); nt = setTimeout(() => T && rpc('takas_noah', { p_takas: T.id, p_miktar: Math.max(0, Math.floor(Number(inp.value) || 0)) }).then(tazele), 400); });
    // çantadan bırakılan eşya: bırakıldığı takas yuvasına (doluysa ilk boşa)
    const yerAl = (x, y) => { const el = document.elementsFromPoint(x, y).map((e) => e.closest?.('.tk-benim .tic-yuva')).find(Boolean); return el ? Number(el.dataset.yer) : null; };
    win.addEventListener('ko-esya-birak', (ev) => {
      const d = ev.detail || {}; if (!T || d.slot == null) return;
      const yer = d.x != null ? yerAl(d.x, d.y) ?? -1 : -1;
      // anında göster (iyimser): eşya hemen yuvaya konur, sunucu onayı gelince kayıt yenilenir
      const koy = async (n) => {
        if (!T) return;
        const benA = Number(T.a) === me, k = benA ? 'a_esya' : 'b_esya', liste = [...(T[k] || [])];
        const num = Number(d.num ?? d.row?.item_num); if (num && !liste.some((e) => Number(e.slot) === Number(d.slot))) { if (d.it && !IT.has(num)) IT.set(num, d.it); liste.push({ slot: d.slot, num, count: n, yer: yer >= 0 ? yer : null, bekle: 1 }); T = { ...T, [k]: liste }; ciz(); }
        await rpc('takas_koy2', { p_takas: T.id, p_slot: d.slot, p_count: n, p_yer: yer }); tazele();
      };
      // çok adetli eşya: kaç tanesinin takasa konacağı sorulur
      if ((d.count || 1) > 1) import('./ticaret.js').then(({ adetSorPencere }) => adetSorPencere(d.x ?? innerWidth / 2, d.y ?? innerHeight / 2, d.count, koy)); else koy(1);
    });
    // kendi takas yuvalarında sürükle-bırak ile yer değiştir; sürüklemeden tıklama: eşyayı geri al
    let sur = null;
    win.addEventListener('pointerdown', (e) => {
      const y = e.target.closest('.tk-benim .tic-yuva.dolu'); if (!y || !T || e.button !== 0) return;
      sur = { slot: Number(y.dataset.slot), x: e.clientX, y: e.clientY, g: null, kaynak: y };
    });
    addEventListener('pointermove', (e) => {
      if (!sur) return;
      if (!sur.g && Math.hypot(e.clientX - sur.x, e.clientY - sur.y) > 5) { sur.g = document.createElement('div'); sur.g.className = 'inv-hayalet'; sur.g.innerHTML = sur.kaynak.innerHTML; document.body.append(sur.g); sur.kaynak.style.opacity = '.35'; ipucuKapat(); }
      if (sur.g) { sur.g.style.left = (e.clientX - 22) + 'px'; sur.g.style.top = (e.clientY - 22) + 'px'; }
    });
    addEventListener('pointerup', (e) => {
      if (!sur) return; const s0 = sur; sur = null;
      if (!s0.g) { if (T) rpc('takas_cikar', { p_takas: T.id, p_slot: s0.slot }).then(tazele); return; }
      s0.g.remove(); s0.kaynak.style.opacity = '';
      const yer = yerAl(e.clientX, e.clientY);
      if (T && yer != null) rpc('takas_yer', { p_takas: T.id, p_slot: s0.slot, p_yer: yer }).then(tazele);
    });
    win.addEventListener('pointermove', (e) => {
      const y = e.target.closest('.tic-yuva.dolu'); if (!y) return ipucuKapat();
      const it = IT.get(Number(y.dataset.num)); if (!it) return;
      tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu ko-tic-ipucu' });
      if (!tip.isConnected) document.body.append(tip);
      tip.innerHTML = tooltipHtml(it, { count: Number(y.dataset.count) });
      tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, e.clientY - 10)) + 'px';
    });
    win.addEventListener('pointerleave', ipucuKapat);
    hud.acPanel?.('envanter');
  }
  // eşyalar seçilen yuvada (yer); eski kayıtlarda sırayla ilk boş yuva
  const izgara = (liste0) => { const liste = []; const bos = []; for (const e of liste0) { if (e.yer != null && e.yer >= 0 && e.yer < 12 && !liste[e.yer]) liste[e.yer] = e; else bos.push(e); }
    for (const e of bos) { const i = [...Array(12).keys()].find((k) => !liste[k]); if (i != null) liste[i] = e; }
    return Array.from({ length: 12 }, (_, i) => {
    const e = liste[i]; if (!e) return `<div class="tic-yuva" data-yer="${i}"></div>`;
    const it = IT.get(e.num);
    return `<div class="tic-yuva dolu" data-yer="${i}" data-slot="${e.slot}" data-num="${e.num}" data-count="${e.count}">${iconHtml(it || { Kind: 0 }, 40)}${e.count > 1 ? `<b class="inv-adet">${e.count}</b>` : ''}</div>`;
  }).join(''); };
  async function ciz() {
    if (!T || !win) return;
    await esyalar([...T.a_esya, ...T.b_esya].map((e) => e.num));
    if (KO && win === KO.L.el) return cizKO();
    const b = benim(), o = onun();
    win.querySelector('.tk-onun .tk-ad').textContent = adOf?.(karsiId()) || 'Karşı taraf';
    win.querySelector('.tk-onun .tk-izgara').innerHTML = izgara(o.esya);
    win.querySelector('.tk-benim .tk-izgara').innerHTML = izgara(b.esya);
    win.querySelector('.tk-onun .tk-noah b').textContent = noah(o.noah);
    const inp = win.querySelector('.tk-noah-gir'); if (document.activeElement !== inp) inp.value = b.noah || 0;
    win.querySelector('.tk-onun .tk-durum').textContent = o.onay ? '✔ Onayladı' : 'Onay bekleniyor';
    win.querySelector('.tk-benim .tk-durum').textContent = b.onay ? '✔ Onayladın' : '';
    win.querySelector('.tk-onun').classList.toggle('onayli', !!o.onay);
    win.querySelector('.tk-benim').classList.toggle('onayli', !!b.onay);
  }
  // (3.11) anlık eşitleme: iki taraf arasında yayın kanalı — değişiklik sunucu yanıtı beklenmeden karşı tarafa gider (eşya verisiyle), sonra sunucu kaydı okunur
  let yayin = null, yayinId = null;
  function yayinKur(id) {
    if (yayinId === id) return; if (yayin) { try { sb.removeChannel(yayin); } catch {} }
    yayinId = id; if (id == null) { yayin = null; return; }
    yayin = sb.channel('takas-canli-' + id)
      .on('broadcast', { event: 'd' }, ({ payload: m }) => {
        if (!m || !T || Number(T.id) !== Number(m.id) || Number(m.kim) === me) return;
        for (const [n, it] of Object.entries(m.its || {})) if (it && !IT.has(Number(n))) IT.set(Number(n), it);
        T = { ...T, ...(m.alan || {}) }; ciz();
      })
      .on('broadcast', { event: 'y' }, () => tazele())
      .subscribe();
  }
  const yay = (alan, its = {}) => { try { yayin?.send({ type: 'broadcast', event: 'd', payload: { id: T?.id, kim: me, alan, its } }); } catch {} };
  const yayY = () => { try { yayin?.send({ type: 'broadcast', event: 'y', payload: {} }); } catch {} };
  const degisti = () => { yayY(); tazele(); };
  const bitenler = new Set();   // (3.11) biten / iptal takaslar: geç gelen (eski) kayıtlar pencereyi yeniden açmaz, mesaj iki kez yazılmaz
  function bitti(tamam, mesaj) {
    if (T) { if (bitenler.has(Number(T.id))) return; bitenler.add(Number(T.id)); } else if (!win) return;
    ipucuKapat();
    if (win) { win.remove(); win = null; }
    if (KO) { clearInterval(KO.cantaT); clearInterval(KO.yoklaT); KO = null; }
    globalThis.koTakasAcik = false; yayinKur(null);
    if (tamam) hud.info?.('Trade completed.', 'beceri');   // (3.11) notice da info'ya yazdığı için tek satır
    else if (mesaj) hud.info?.(mesaj, 'hata');
    T = null;
    try { state.inv?.reload?.(); } catch {}
  }

  // KO: oyuncular arası mesafe 10 m'yi geçerse ya da başka bir pencere (NPC, dükkân, depo, görev, ayarlar…) açılırsa takas iptal
  const BASKA = '.ko-npcmenu, .ko-tic:not(#takas-pencere), .ko-gorev-pencere, #ayarlar, .ko-warp, .ko-mail, .ko-ors, .ko-ors-menu, .ko-exit';
  const gorunur = (el) => el.isConnected && !el.hidden && !el.closest('[hidden]') && el.offsetWidth > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  let iptalGitti = false;
  setInterval(() => {
    if (!T || !win || iptalGitti) return;
    let neden = null;
    const p = konum?.(), q = posOf?.(karsiId());
    if (p && q && Math.hypot(p.x - q.x, p.z - q.z) > 10) neden = 'The distance between the players exceeded 10 meters; the trade has been cancelled.';
    else if ([...document.querySelectorAll(BASKA)].some(gorunur)) neden = 'The trade has been cancelled because another window was opened.';
    if (!neden) return;
    iptalGitti = true; const id = T.id;
    rpc('takas_iptal', { p_takas: id }).finally(() => { iptalGitti = false; });
    bitti(false, neden);
  }, 400);

  // işlemden hemen sonra takas kaydını oku (realtime bildirimini beklemeden): eşya / Noah anında görünür
  async function tazele() {
    if (!T) return;
    const { data } = await sb.from('takas').select('*').eq('id', T.id).maybeSingle();
    if (data && T && Number(data.id) === Number(T.id)) isle(data);
  }
  // ---------- (3.11) KO takas isteği kutusu (re_messagebox: başlıkta isteyen, Confirm / Cancel / Block, 10 sn süre çubuğu) — parti davetiyle aynı
  let KUTU = null;
  async function istekKutusu(ad, evet, hayir, engelle) {
    const K = await import('./kui.js');
    if (!K.hasLayout('re_messagebox')) return false;
    KUTU?.kapat?.();
    const L = K.buildLayout('re_messagebox', { className: 'ko-parti-davet ko-takas-istek ko-pencere kui-dokulu' });
    for (const id of ['Btn_Ok', 'Btn_Cancel', 'Edit_Common', 'base_item', 'img_icon', 'str_crash_tooltip', 'str_itemname']) L.show(id, false);
    L.show('Btn_ban', true); L.show('progress_durationtime', true); L.show('Btn_Yes', true); L.show('Btn_No', true);
    L.text('Text_title', ad);
    L.text('Text_Message', `${ad} is requesting to trade. Will you accept?`);
    const yaz = (id, t) => L.get(id)?.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = t));
    yaz('Btn_Yes', 'Confirm'); yaz('Btn_No', 'Cancel'); yaz('Btn_ban', 'Block');
    (document.getElementById('kohud') || document.body).append(L.el);
    L.el.style.pointerEvents = 'auto'; L.el.style.zIndex = 9000;
    L.el.style.left = Math.max(8, innerWidth / 2 - (L.el.offsetWidth || 360) / 2) + 'px'; L.el.style.top = Math.max(8, innerHeight * 0.3) + 'px';
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    let bitti = false; const t0 = performance.now();
    const kapat = () => { if (bitti) return; bitti = true; L.el.remove(); if (KUTU?.L === L) KUTU = null; };
    KUTU = { L, kapat };
    const tik = () => { if (bitti) return; const k = 1 - (performance.now() - t0) / ISTEK_SN; L.progress('progress_durationtime', k); if (k <= 0) return kapat(); requestAnimationFrame(tik); };
    requestAnimationFrame(tik);
    L.click('Btn_Yes', () => { if (bitti) return; kapat(); evet(); });
    L.click('Btn_No', () => { if (bitti) return; kapat(); hayir(); });
    L.click('Btn_ban', () => { if (bitti) return; kapat(); engelle(); });
    return true;
  }
  // ---------- sunucu değişiklikleri
  const soruldu = new Set();
  async function isle(row) {
    if (!row || (Number(row.a) !== me && Number(row.b) !== me)) return;
    if (bitenler.has(Number(row.id))) { if (row.durum === 'bitti' && !T) { try { state.inv?.reload?.(); } catch {} } return; }
    if (row.durum === 'istek') {
      if (Number(row.b) === me && !soruldu.has(row.id)) {
        soruldu.add(row.id);
        if (state?.takasEngel || window.koSecenek?.takasRet) { rpc('takas_iptal', { p_takas: row.id }); return; }   // KO /Block_Trade_Request · Seçenekler → Refuse trade   // KO /Block_Trade_Request
        const ad = adOf?.(row.a) || 'A player';
        let bitti_ = false; const izle = istekIzle(row.a, () => { if (bitti_) return; bitti_ = true; hud.soruKapat?.(); KUTU?.kapat?.(); rpc('takas_iptal', { p_takas: row.id }); hud.info?.('The trade request has been cancelled.', 'hata'); });
        const evet = () => { bitti_ = true; izle(); rpc('takas_cevap', { p_takas: row.id, p_kabul: true }); }, hayir = () => { bitti_ = true; izle(); rpc('takas_cevap', { p_takas: row.id, p_kabul: false }); };
        istekKutusu(ad, evet, hayir, () => { state.takasEngel = true; hud.info?.('Trade requests are now blocked. (/Allow_Trade_Request to allow)', 'soluk'); hayir(); })
          .then((ok) => { if (!ok) hud.soru?.('Trade Request', `${ad} is requesting to trade. Will you accept?`, evet, hayir, { kompakt: true }); });
      }
      return;
    }
    if (row.durum !== 'istek' && Number(row.b) === me) KUTU?.kapat?.();   // istek iptal / yanıtlandı → kutu kapanır
    if (row.durum !== 'istek' && bekleyenIstek && (bekleyenIstek.tid == null || Number(bekleyenIstek.tid) === Number(row.id))) { bekleyenIstek.dur?.(); bekleyenIstek = null; }
    if (row.durum === 'acik') { globalThis.koTakasAcik = true; T = row; yayinKur(Number(row.id)); if (!win && !(await pencereKurKO().catch(() => false))) pencereKur(); await ciz(); return; }
    if (T && Number(T.id) === Number(row.id)) {
      if (row.durum === 'bitti') bitti(true);
      else if (row.durum === 'iptal') bitti(false, row.mesaj === 'reddedildi' ? 'The user has declined the request for a trade.' : 'The trade has been cancelled.');
    } else if (row.durum === 'iptal' && Number(row.a) === me && row.mesaj === 'reddedildi') hud.info?.('The user has declined the request for a trade.', 'hata');
    else if (row.durum === 'bitti') { try { state.inv?.reload?.(); } catch {} }
  }
  for (const k of ['a', 'b']) {
    sb.channel(`takas-${k}-${me}`).on('postgres_changes', { event: '*', schema: 'public', table: 'takas', filter: `${k}=eq.${me}` }, (p) => isle(p.new)).subscribe();
  }
  // açılışta yarım kalmış takas varsa iptal
  sb.from('takas').select('*').or(`a.eq.${me},b.eq.${me}`).in('durum', ['istek', 'acik']).then(({ data }) => { for (const r of data || []) rpc('takas_iptal', { p_takas: r.id }); }, () => {});
  loadMeta().catch(() => {});
  return { oyuncuMenu, menuKapat, takasIste, __isle: isle };
}
