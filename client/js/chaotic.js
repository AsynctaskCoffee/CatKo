// KO Chaotic Generator penceresi (deadsoft 2369 re_piecechange — CUIPieceChangeMgr): üstte parça yuvası (a_piece) ve üç makara
// yuvası (a_m_0..2), Start / Stop / Chat düğmeleri; altta pencere içi çanta (a_slot_0..27) ve Noah (text_gold).
// İşleyiş (KO): çantadan bir gem / günah parçası yuvaya konur → Start: makaralar olası ödüller arasında döner, sunucu sonucu belirler
// (chaotic_uret, ağırlıklı) → Stop (ya da süre dolunca) makaralar soldan sağa durur ve çıkan eşyada kalır. Parça bittiyse yuva boşalır.
import { hasLayout, buildLayout, draggable, ekUI } from './kui.js';
import { loadMeta, iconHtml, tooltipHtml, fromDb } from './esya.js';
import { koWindow, toFront } from './ko-pencere.js';
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const CHAOTIC_PARCA = [389205000, 389201000, 389199000, 389198000, 389197000, 389196000, 389160000, 389162000, 389163000, 389164000, 389165000, 389166000];
const noah = (n) => Number(n || 0).toLocaleString('tr-TR');
const DERECE = { 2: ' (Rare)', 3: ' (Unique)' };

export async function chaoticHazir() { return (await ekUI('chaotic')) && hasLayout('re_piecechange'); }

export function initChaotic({ sb, character, hud, state, player }) {
  const layer = () => document.getElementById('kohud') || document.body;
  const bag = () => state.inv?.items || new Map();
  const IT = new Map();
  async function esyalar(nums) {
    const eksik = [...new Set(nums)].filter((n) => !IT.has(n)); if (!eksik.length) return;
    for (let i = 0; i < eksik.length; i += 200) {
      const { data } = await sb.from('items').select('*').in('num', eksik.slice(i, i + 200));
      for (const r of data || []) IT.set(r.num, fromDb(r));
    }
  }
  const LISTE = new Map();   // parça → olası ödüller
  async function liste(num) {
    if (!LISTE.has(num)) { const { data } = await sb.rpc('chaotic_liste', { p_kaynak: num }); LISTE.set(num, Array.isArray(data) ? data : []); }
    const l = LISTE.get(num); await esyalar(l).catch(() => {}); const v = l.filter((n) => IT.has(n)); return v.length ? v : l;
  }

  const SANDIK_IKON = 810636000;   // küçük altın sandık simgesi ([Event] Black Treasure Chest ikonu)
  // [anahtar, etiket, x, y] — pencere içi konumlar (re_piecechange taş zemininde)
  const AYARLAR = [['banka', 'Auto Bank', 40, 255], ['vip_banka', 'Auto VIP Bank', 40, 273], ['benzersiz_degil', 'Sell non-Unique', 40, 291],
    ['sat_warrior', 'Sell Warrior', 176, 255], ['sat_rogue', 'Sell Rogue', 176, 273], ['sat_priest', 'Sell Priest', 176, 291], ['sat_mage', 'Sell Mage', 282, 255]];
  const AYAR_KEY = 'ko-chaotic-ayar-' + character.id;
  let ayar = {}; try { ayar = JSON.parse(localStorage.getItem(AYAR_KEY) || '{}') || {}; } catch {}
  const ayarKaydet = () => { try { localStorage.setItem(AYAR_KEY, JSON.stringify(ayar)); } catch {} };
  let adetSec = 1;
  const adetSinir = () => Math.max(1, Math.min(100, parca ? adetOf(parca) : 1));
  let pen = null, npc = null, onChat = null, gold = 0, parca = null, durum = 'bos', sonuc = null, makara = [null, null, null];
  let donT = null, durT = null, durIstek = false, sonucR = null;
  const bosYuva = () => { const b = bag(); let n = 0; for (let sl = 14; sl <= 41; sl++) if (!b.get(sl)) n++; return n; };
  const adetOf = (num) => { let n = 0; for (const [sl, x] of bag()) if (sl >= 14 && sl <= 41 && Number(x?.row?.item_num) === num) n += Number(x.row.count) || 1; return n; };

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
    const L = buildLayout('re_piecechange', { className: 'ko-chaotic ko-pencere kui-dokulu' });
    layer().append(L.el); draggable(L, 44);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    L.el.addEventListener('contextmenu', (e) => e.preventDefault());
    for (let i = 0; i < 28; i++) { const a = L.get('a_slot_' + i); if (a) { a.dataset.cs = 14 + i; a.classList.add('cg-yuva'); } }
    for (const id of ['a_piece', 'a_m_0', 'a_m_1', 'a_m_2']) L.get(id)?.classList.add('cg-yuva', 'cg-ust');
    L.get('a_piece')?.setAttribute('data-esya-birak', '1');
    L.text('piece_change_text', 'Place one of the 7 pieces.');
    // yerleşim (sunucu sürümü düzeni): parça yuvası + sandık simgesi (olası ödüller) + üç makara, Start / Stop, ayarlar, adet
    for (const [id, x] of [['btn_start', 52], ['btn_stop', 218]]) { const b = L.get(id); if (b) { b.style.left = x + 'px'; b.style.top = '219px'; b.querySelectorAll(':scope > .kui-img').forEach((im) => { im.style.left = '0px'; im.style.top = '0px'; }); } }
    L.show('btn_conversation', false);
    const sandik = document.createElement('div'); sandik.className = 'cg-sandik'; sandik.title = 'Possible rewards';
    L.el.append(sandik);
    esyalar([SANDIK_IKON]).then(() => { const it = IT.get(SANDIK_IKON); if (it) sandik.innerHTML = iconHtml(it, 30); }).catch(() => {});
    sandik.addEventListener('click', (ev) => { ev.stopPropagation(); if (dp && !dp.hidden) { dp.hidden = true; ipucuKapat(); } else dropAc(); });   // tekrar basınca kapanır
    // ayarlar (karaktere özel, tarayıcıda saklanır)
    const ay = document.createElement('div'); ay.className = 'cg-ayar';
    ay.innerHTML = AYARLAR.map(([k, ad, x, y]) => `<label style="left:${x}px;top:${y}px"><input type="checkbox" data-k="${k}"><i></i><span>${ad}</span></label>`).join('')
      + '<div class="cg-adetsec"><button data-d="-1">−</button><input class="cg-adet-gir" type="number" min="1" step="1" value="1" title="Number of starts"><button data-d="1">+</button></div>';
    L.el.append(ay);
    ay.querySelectorAll('input').forEach((i) => { i.checked = !!ayar[i.dataset.k]; i.addEventListener('change', () => { ayar[i.dataset.k] = i.checked; ayarKaydet(); }); });
    ay.querySelectorAll('.cg-adetsec button').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); if (durum === 'donuyor') return; adetSec = Math.max(1, Math.min(adetSinir(), adetSec + Number(b.dataset.d))); ciz(); }));
    // (31.10) kaç kez start: elle de yazılabilir (sınır: adetSinir)
    const ag = ay.querySelector('.cg-adet-gir');
    const agUygula = () => { const n = Math.floor(Number(ag.value)); adetSec = Math.max(1, Math.min(adetSinir(), Number.isFinite(n) ? n : 1)); ciz(); };
    ag.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    ag.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') { agUygula(); ag.blur(); } });
    ag.addEventListener('change', agUygula); ag.addEventListener('blur', agUygula);
    ag.addEventListener('input', () => { if (durum === 'donuyor') { ag.value = String(adetSec); return; } const n = Math.floor(Number(ag.value)); if (n >= 1) adetSec = Math.min(adetSinir(), n); });
    L.click('btn_close', kapat);
    L.click('btn_start', baslat);
    L.click('btn_stop', () => { if (durum === 'donuyor') durIstek = true; });
    L.click('btn_conversation', () => { if (durum === 'donuyor') return; kapat(); onChat?.(); });
    L.el.addEventListener('click', (ev) => {
      if (durum === 'donuyor') return;
      const a = ev.target.closest('.cg-yuva'); if (!a) return;
      if (a.dataset.cs) return koy(Number(a.dataset.cs));
      if (a.dataset.id === 'a_piece') { parca = null; temizle(); if (dp) dp.hidden = true; ciz(); }
    });
    L.el.addEventListener('contextmenu', (ev) => { const a = ev.target.closest('.cg-yuva'); if (a) a.click(); });
    // ana envanterden / pencere çantasından sürükle-bırak
    L.el.addEventListener('ko-esya-birak', (ev) => { const d = ev.detail || {}; if (d.slot >= 14 && d.slot <= 41) koy(d.slot); });
    let sur = null;
    L.el.addEventListener('pointerdown', (ev) => {
      const a = ev.target.closest('.cg-yuva[data-cs]'); if (!a || durum === 'donuyor' || ev.button !== 0) return;
      const sl = Number(a.dataset.cs); if (!bag().get(sl)) return;
      sur = { sl, x: ev.clientX, y: ev.clientY, g: null };
    });
    addEventListener('pointermove', (ev) => {
      if (!sur) return;
      if (!sur.g && Math.hypot(ev.clientX - sur.x, ev.clientY - sur.y) > 5) { sur.g = document.createElement('div'); sur.g.className = 'ors-hayalet'; sur.g.innerHTML = iconHtml(bag().get(sur.sl).it, 40); document.body.append(sur.g); }
      if (sur.g) { sur.g.style.left = ev.clientX - 20 + 'px'; sur.g.style.top = ev.clientY - 20 + 'px'; }
    });
    addEventListener('pointerup', (ev) => {
      if (!sur) return; const d = sur; sur = null; if (!d.g) return; d.g.remove();
      const alt = document.elementsFromPoint(ev.clientX, ev.clientY);
      if (alt.some((x) => x.closest?.('[data-id="a_piece"]'))) koy(d.sl);
      else if (dp && !dp.hidden && alt.some((x) => dp.contains(x))) { const e = bag().get(d.sl); if (e) gmEkle(Number(e.row.item_num), e.it); }
    });
    L.el.addEventListener('pointermove', (ev) => {
      const a = ev.target.closest('.cg-yuva'); if (!a) return ipucuKapat();
      const id = a.dataset.id;
      if (id === 'a_piece') return parca ? ipucu(tooltipHtml(IT.get(parca) || bag().get([...bag()].find(([, x]) => Number(x.row.item_num) === parca)?.[0])?.it, { count: adetOf(parca) }), ev) : ipucuKapat();
      if (/^a_m_/.test(id)) { const n = makara[Number(id.slice(4))]; return n && durum !== 'donuyor' && IT.get(n) ? ipucu(tooltipHtml(IT.get(n)), ev) : ipucuKapat(); }
      const e = a.dataset.cs ? bag().get(Number(a.dataset.cs)) : null;
      if (!e) return ipucuKapat();
      ipucu(tooltipHtml(e.it, { count: e.row.count }), ev);
    });
    L.el.addEventListener('pointerleave', ipucuKapat);
    return L;
  }

  async function koy(slot) {
    const e = bag().get(slot); if (!e) return;
    const num = Number(e.row.item_num);
    if (!CHAOTIC_PARCA.includes(num)) return hud.notice?.('This item cannot be placed in the Chaotic Generator.', 'hata');
    parca = num; IT.set(num, e.it); temizle(); ciz();
    if (dp && !dp.hidden) dropAc();
    await liste(num).catch(() => {});
  }
  const temizle = () => { makara = [null, null, null]; sonuc = null; pen?.el.querySelectorAll('.cg-sonuc, .cg-kay').forEach((x) => x.classList.remove('cg-sonuc', 'cg-kay')); };

  const yuvaCiz = (el, it) => { if (el) el.innerHTML = it ? iconHtml(it, el.offsetWidth || 43) : ''; };
  function ciz() {
    const L = pen; if (!L) return;
    const b = bag();
    if (parca && adetOf(parca) <= 0 && durum !== 'donuyor') parca = null;
    for (let i = 0; i < 28; i++) {
      const s = 14 + i, e = b.get(s), a = L.get('a_slot_' + i);
      yuvaCiz(a, e?.it || null);
      a?.classList.toggle('cg-uygun', !!e && CHAOTIC_PARCA.includes(Number(e.row.item_num)));
      L.text('s_count_' + i, e && Number(e.it.Countable) > 0 && (e.row.count || 1) > 1 ? String(e.row.count) : '');
    }
    yuvaCiz(L.get('a_piece'), parca ? IT.get(parca) : null);
    let c = L.el.querySelector('.cg-adet'); if (!c) { c = document.createElement('b'); c.className = 'cg-adet'; L.get('a_piece')?.after(c); }
    const n = parca ? adetOf(parca) : 0; c.textContent = n > 1 ? String(n) : '';
    if (durum !== 'donuyor') makara.forEach((m, i) => yuvaCiz(L.get('a_m_' + i), m ? IT.get(m) : null));
    L.el.classList.toggle('cg-donuyor', durum === 'donuyor');
    adetSec = Math.max(1, Math.min(adetSinir(), adetSec));
    const ab = L.el.querySelector('.cg-adet-gir'); if (ab && document.activeElement !== ab) ab.value = String(adetSec); if (ab) ab.disabled = durum === 'donuyor';
    L.el.querySelector('.cg-sandik')?.classList.toggle('cg-pasif', !parca);
    L.text('piece_change_text', durum === 'donuyor' ? (toplamTur > 1 ? `Generating… ${tur} / ${toplamTur}` : 'Generating…') : parca ? 'Press Start.' : 'Place one of the 7 pieces.');
    L.text('text_gold', noah(gold));
  }

  let tur = 0, toplamTur = 1;
  const ISLEM = { satildi: (r) => [`${r.ad} sold (`, [`+${noah(r.tutar)} Noah`, 'bilgi-noah-mavi'], ')'], depo: (r) => `${r.ad} moved to the bank` };
  async function baslat() {
    if (durum === 'donuyor') return;
    if (!parca) return hud.notice?.('Place one of the 7 pieces first.', 'hata');
    if (adetOf(parca) <= 0) { parca = null; ciz(); return hud.notice?.('You have no more of this piece.', 'hata'); }
    const l = await liste(parca); if (!l.length) return hud.notice?.('There is no reward list for this piece.', 'hata');
    const kaynak = parca; toplamTur = Math.min(adetSec, adetOf(kaynak)); tur = 0;
    durum = 'donuyor'; durIstek = false; ciz();
    try { const p = player.position; await sb.from('characters').update({ x: p.x, y: p.y, z: p.z }).eq('id', character.id); } catch {}
    const ozet = { n: 0, satis: 0 };
    try {
      while (tur < toplamTur && !(tur > 0 && durIstek)) {
        // (5.11) envanter doluysa oto durur (makara dönmeye başlamadan)
        if (tur > 0) { try { await state.inv?.reload?.(); } catch {} }
        if (bosYuva() <= 0) { hud.notice?.('Your inventory is full. Chaotic Generator stopped.', 'hata'); break; }
        tur++; temizle(); ciz();
        const r = await birTur(kaynak, l, toplamTur > 1 ? 1200 : Infinity);   // tek üretim: oyuncu Stop'a basana kadar döner
        if (!r) break;
        ozet.n++; if (r.islem === 'satildi') ozet.satis += Number(r.tutar) || 0;
        if (r.gold != null) { gold = Number(r.gold); try { state.combat?.applyStats?.({ gold }); } catch {} }
        { const m = (ISLEM[r.islem] || ((x) => `You obtained ${x.ad}${DERECE[x.derece] || ''}!`))(r); hud.info?.(Array.isArray(m) ? ['Chaotic Generator: ', ...m] : `Chaotic Generator: ${m}`, r.islem === 'satildi' ? 'soluk' : 'seviye'); }
        if (r.kalan != null && Number(r.kalan) <= 0) break;
      }
    } finally {
      clearInterval(donT); durum = 'sonuc';
      await state.inv?.reload?.();
      if (parca && adetOf(parca) <= 0) parca = null;
      ciz();
      if (ozet.n > 1) hud.info?.(ozet.satis ? [`Chaotic Generator: ${ozet.n} items generated, sold for `, [`+${noah(ozet.satis)} Noah`, 'bilgi-noah-mavi'], '.'] : `Chaotic Generator: ${ozet.n} items generated.`, 'seviye');
    }
  }
  // tek üretim (KO): parça makinaya akar, üç makara döner (generator modeli hızlanır), sunucu sonucu belirler (chaotic_uret2);
  // Stop ya da süre dolunca makaralar yavaşlamadan bir anda durur: yandakiler boşalır, eşya yalnız ortadaki makarada kalır.
  const makaraEl = (i) => pen?.get('a_m_' + i);
  function kaydir(i, num) {   // makarada yeni ikon yukarıdan kayarak gelir
    makara[i] = num; const el = makaraEl(i); if (!el) return;
    el.innerHTML = num && IT.get(num) ? iconHtml(IT.get(num), el.offsetWidth || 43) : '';
    el.classList.remove('cg-kay', 'cg-dur'); void el.offsetWidth; el.classList.add('cg-kay');
  }
  const bekle = (ms) => new Promise((res) => setTimeout(res, ms));
  async function birTur(kaynak, l, sure) {
    const rnd = () => l[Math.floor(Math.random() * l.length)];
    const dur = [false, false, false], bas = performance.now();
    const L = pen;
    // parça makinaya girer
    L?.get('a_piece')?.classList.remove('cg-yut'); void L?.get('a_piece')?.offsetWidth; L?.get('a_piece')?.classList.add('cg-yut');
    L?.el.classList.add('cg-calisiyor');
    calisma(true);
    // KO: eşyalar makaralarda sağdan sola hızla akar (her adımda bir yuva sola kayar, sağdan yenisi girer)
    const akit = (yeni = rnd()) => { kaydir(0, makara[1]); kaydir(1, makara[2]); kaydir(2, yeni); };
    clearInterval(donT); donT = setInterval(() => akit(), 55);
    const { data: r, error } = await sb.rpc('chaotic_uret2', { p_char: character.id, p_kaynak: kaynak, p_ayar: ayar }).then((x) => x, (er) => ({ error: er }));
    if (error || !r?.ok) { clearInterval(donT); L?.el.classList.remove('cg-calisiyor'); calisma(false); temizle(); ciz(); hud.notice?.(/boş yer|bag|inventory/i.test(r?.mesaj || '') ? 'Your inventory is full. Chaotic Generator stopped.' : (r?.mesaj || error?.message || 'Generation failed.'), 'hata'); return null; }
    await esyalar([r.num]).catch(() => {});
    await new Promise((res) => { const bak = () => (durIstek || performance.now() - bas > sure ? res() : (durT = setTimeout(bak, 50))); bak(); });
    // (5.11) yavaşlamadan ani duruş: akış aynı hızla sürer, sonuç sağdan girip ortaya gelince makara bir anda kilitlenir (küçük geri tepme)
    clearInterval(donT);
    akit(r.num); await bekle(55); akit(rnd()); await bekle(55);
    for (const k of [0, 1, 2]) { const el = makaraEl(k); if (el) { el.classList.remove('cg-kay', 'cg-dur'); void el.offsetWidth; el.classList.add('cg-dur'); } }
    dur[0] = dur[1] = dur[2] = true;
    makara[1] = r.num; makaraEl(1)?.classList.add('cg-sonuc');
    for (const k of [0, 2]) { makara[k] = null; const el = makaraEl(k); if (el) { el.innerHTML = ''; el.classList.remove('cg-kay'); } }
    L?.el.classList.remove('cg-calisiyor'); calisma(false);
    const it = IT.get(r.num), unique = [4, 12].includes(Number(it?.ItemType)) || Number(r.derece) >= 3;
    sonucEfekt(unique, r);
    if (toplamTur > 1 && !durIstek) await bekle(unique ? 1400 : 450);
    return r;
  }
  // generator modeli (npc_30200) çalışırken: model 4× hızlı oynar, KO takı efektleri (piece_m dönen ışık, piece_mup halkası) hızlanır ve büyür
  const fxBoy = new WeakMap();
  function calisma(ac) {   // (5.11) KO: generator modeli ve takılı efektleri (obj_bifrost_slot.n3fxplug: piece_m j1 y7,5 · piece_mup j10) kendi hızında kalır
    if (!npc) return;
    npc.animHiz = 1;
    for (const b of npc.api?._mobFx?.fx || []) { if (!b) continue; if (fxBoy.has(b)) { b.hiz = 1; b.boyut = fxBoy.get(b); } }
    void ac;
  }

  // efekt konumu: generator gövdesinin ortası / tepesi (model ~7,5 m; efektler zeminde gövdenin içinde kalmasın)
  const govde = (oran = 0.55) => { const h = npc?.holder; if (!h?.position) return null; const t = Number(npc.top) || 6; return { x: h.position.x, y: h.position.y + t * oran, z: h.position.z, t }; };
  // sonuç efekti: normal → KO başarı ışığı (10101) generatorün üstünde; unique → altın patlama + ışık sütunu + pencere parlaması
  function sonucEfekt(unique, r) {
    // KO: başarı efekti (10101 item_success: modelin çevresinde halka hâlinde yerden yukarı yükselen ışık parçacıkları + zemin parıltısı)
    // generatorün tabanında, halka modelin çevresi kadar (efektin yayıcı halkası ~1 m yarıçaplı → model yarıçapına ölçeklenir)
    const h = npc?.holder?.position, R = Math.max(1.5, Number(npc?.yaricap) || (Number(npc?.top) || 6) / 3);
    const k = R;   // (5.11) dünya efektleri yalnız unique çıkınca (normal sonuçta generator çevresinde efekt yok)
    const el = makaraEl(1); if (!el || !pen) return;
    if (!unique) return;
    try { if (h) state.efekt?.(10101, { x: h.x, y: h.y, z: h.z }, { boyut: k * 0.95 }); } catch {}
    try { if (h) { const v = h.clone ? h.clone() : h; state.efekt?.(10018, v, { follow: () => v, boyut: k * 0.8 }); } } catch {}
    try { if (h) setTimeout(() => state.efekt?.(10101, { x: h.x, y: h.y, z: h.z }, { boyut: k * 1.2 }), 600); } catch {}
    const fx = document.createElement('div'); fx.className = 'cg-unique';
    fx.innerHTML = '<i class="cg-isin"></i><i class="cg-isin cg-isin2"></i><i class="cg-halka"></i><b>UNIQUE!</b>' + Array.from({ length: 14 }, (_, i) => `<s style="--a:${i * 360 / 14}deg;--d:${(i % 3) * 0.08}s"></s>`).join('');
    fx.style.left = (el.offsetLeft + el.offsetWidth / 2) + 'px'; fx.style.top = (el.offsetTop + el.offsetHeight / 2) + 'px';
    pen.el.append(fx); setTimeout(() => fx.remove(), 2600);
    pen.el.classList.remove('cg-parla'); void pen.el.offsetWidth; pen.el.classList.add('cg-parla');
    el.classList.add('cg-unique-yuva'); setTimeout(() => el.classList.remove('cg-unique-yuva'), 2600);
    hud.notice?.(`Unique item! ${r.ad}`, 'seviye');
  }

  const gm = () => !!state.ghost;
  function gmEkle(num, it) {
    if (!gm() || !parca) return;
    const ad = String(it?.strName || IT.get(num)?.strName || '#' + num).replace(/\s*\(\+0\)$/, '');
    const parcaAd = String(IT.get(parca)?.strName || 'parça').replace(/\s*\(\+0\)$/, '');
    const tamam = async (t) => {
      const oran = Number(String(t).replace(',', '.').replace('%', ''));
      if (!(oran > 0 && oran < 100)) return hud.notice?.('The rate must be between 0 and 100 (e.g. 2.5).', 'hata');
      const { data: r, error } = await sb.rpc('gm_chaotic_oran', { p_char: character.id, p_kaynak: parca, p_item: num, p_oran: oran });
      if (error || !r?.ok) return hud.notice?.(r?.mesaj || error?.message || 'Could not be added.', 'hata');
      LISTE.delete(parca);
      hud.info?.(`Chaotic Generator (GM): ${r.ad} → ${parcaAd} ${r.yeni ? 'added to rewards' : 'rate updated'} (${Number(r.oran).toLocaleString('en-US')}%).`, 'beceri');
      dropAc();
    };
    if (!hud.girdi?.('Chaotic Reward', `${ad}\nDrop rate for ${parcaAd} (%)`, { max: 6, deger: '1' }, tamam)) {
      const t = prompt(`${ad} — drop rate for ${parcaAd} (%)`, '1'); if (t != null) tamam(t);
    }
  }
  // ---- sandık simgesi: konan parçanın olası ödülleri — KO paneli (ko-pencere), kaydırmasız: sütun sayısı eşya sayısına göre, hepsi sığar
  let dp = null;
  async function dropAc() {
    if (!parca) return hud.notice?.('Place one of the 7 pieces first.', 'hata');
    const { data } = await sb.rpc('chaotic_droplar', { p_kaynak: parca });
    const l = Array.isArray(data) ? data : [];
    // eşya kayıtları sunucudan oranlarla birlikte gelir (ayrı sorgu gerekmez); eksik kalan olursa tablodan tamamlanır
    for (const x of l) if (x.esya && !IT.get(Number(x.num))?.ikon) IT.set(Number(x.num), fromDb(x.esya));
    await Promise.all([loadMeta().catch(() => {}), esyalar([parca, ...l.map((x) => Number(x.num))]).catch(() => {})]);
    if (!dp) {
      dp = document.createElement('div'); dp.className = 'ko-panel ko-pencere cg-drop';
      dp.innerHTML = '<div class="ay-baslik"></div><button class="ko-kapat" title="Kapat"></button><div class="cg-drop-alt"></div><div class="cg-drop-izgara"></div><div class="cg-drop-not"></div>';
      layer().append(dp); dp.style.pointerEvents = 'auto';
      koWindow(dp, { center: false });
      dp.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(dp); });
      dp.querySelector('.ko-kapat').addEventListener('click', () => { dp.hidden = true; ipucuKapat(); });
      dp.addEventListener('pointermove', (ev) => { const k = ev.target.closest('[data-num]'); const it = k && IT.get(Number(k.dataset.num)); if (it) ipucu(tooltipHtml(it), ev); else ipucuKapat(); });
      dp.addEventListener('pointerleave', ipucuKapat);
      // GM: çantadan eşya bırakınca oran sorulur, eşya bu parçanın ödüllerine eklenir (varsa oranı değişir)
      dp.dataset.esyaBirak = '1';
      dp.addEventListener('ko-esya-birak', (ev) => { const d = ev.detail || {}; if (d.num) gmEkle(Number(d.num), d.it); });
      // GM: sol tık → "listeden çıkar" onayı (ağırlık 0; tekrar sürükleyip eklenebilir)
      dp.addEventListener('click', (ev) => {
        const k = ev.target.closest('[data-num]'); if (!k || !gm() || !parca) return;
        const num = Number(k.dataset.num), ad = String(IT.get(num)?.strName || '#' + num).replace(/\s*\(\+0\)$/, '');
        const cikar = async () => {
          const { data: r, error } = await sb.rpc('gm_chaotic_cikar', { p_char: character.id, p_kaynak: parca, p_item: num });
          if (error || !r?.ok) return hud.notice?.(r?.mesaj || error?.message || 'Could not be removed.', 'hata');
          LISTE.delete(parca); hud.info?.(`Chaotic Generator (GM): ${r.ad} removed from possible rewards.`, 'beceri'); dropAc();
        };
        if (!hud.soru?.('Remove Reward', `${ad}\nRemove from the possible rewards list?`, cikar)) { if (confirm(`Remove ${ad} from the list?`)) cikar(); }
      });
      dp.addEventListener('contextmenu', (ev) => { ev.preventDefault(); const k = ev.target.closest('[data-num]'); if (k && gm()) gmEkle(Number(k.dataset.num), IT.get(Number(k.dataset.num))); });
    }
    dp.classList.toggle('cg-gm', gm());
    const ad = String(IT.get(parca)?.strName || 'Parça').replace(/\s*\(\+0\)$/, '');
    dp.querySelector('.ay-baslik').textContent = 'Possible Rewards';
    dp.querySelector('.cg-drop-alt').innerHTML = `${IT.get(parca) ? iconHtml(IT.get(parca), 26) : ''}<em class="cg-drop-ad">${esc(ad)}</em><b>${l.length} items</b>`;
    const kol = Math.max(1, Math.min(l.length, l.length > 40 ? 10 : l.length > 24 ? 8 : 6));
    const iz = dp.querySelector('.cg-drop-izgara'); iz.style.gridTemplateColumns = `repeat(${kol}, 36px)`;
    const renk = (it) => ([4, 12].includes(Number(it?.ItemType)) ? 'cg-u' : Number(it?.ItemType) === 5 ? 'cg-r' : '');
    iz.innerHTML = l.map((x) => { const it = IT.get(Number(x.num));
      return `<div class="cg-drop-oge ${renk(it)}" data-num="${x.num}">${it ? iconHtml(it, 34) : ''}${!gm() ? '' : `<b>${Number(x.oran) < 1 ? Number(x.oran).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : Number(x.oran).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%</b>`}</div>`; }).join('') || '<p>No reward list.</p>';
    { const not = dp.querySelector('.cg-drop-not'); not.textContent = ''; not.hidden = true; }   // (31.10) alt açıklama yazısı kaldırıldı; oyuncuya oranlar gösterilmez (yalnız eşyalar)
    const r = pen.el.getBoundingClientRect();
    dp.hidden = false; toFront(dp);
    requestAnimationFrame(() => {
      const w = dp.offsetWidth, h = dp.offsetHeight;
      dp.style.left = (r.right + w + 6 <= innerWidth ? r.right + 6 : Math.max(4, r.left - w - 6)) + 'px';
      dp.style.top = Math.max(4, Math.min(innerHeight - h - 4, r.top)) + 'px';
    });
  }

  function ortala(el) {
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect(), z = r.width / (el.offsetWidth || r.width) || 1;
      el.style.left = Math.max(0, (innerWidth - r.width) / 2 / z) + 'px'; el.style.top = Math.max(0, (innerHeight - r.height) / 2 / z) + 'px';
    });
  }
  async function ac(n, { chat } = {}) {
    await loadMeta().catch(() => {});
    if (!(await chaoticHazir())) return false;
    npc = n; onChat = chat || null;
    pen ||= kur();
    try { if (hud.invOpen) hud.panel?.('envanter'); } catch {}
    parca = null; temizle(); durum = 'bos';
    pen.el.hidden = false; pen.el.style.zIndex = 60; ortala(pen.el);
    ciz();
    const [g] = await Promise.all([sb.from('characters').select('gold').eq('id', character.id).maybeSingle(), state.inv?.reload?.(), esyalar(CHAOTIC_PARCA).catch(() => {})]);
    gold = g?.data?.gold ?? gold;
    ciz();
    return true;
  }
  function kapat() {
    if (durum === 'donuyor') return;
    clearInterval(donT); clearTimeout(durT);
    if (pen) pen.el.hidden = true; if (dp) dp.hidden = true; ipucuKapat();
  }
  const acik = () => !!pen && !pen.el.hidden;
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && acik()) kapat(); });
  addEventListener('pointerdown', (e) => {
    if (!acik() || durum === 'donuyor') return;
    const t = e.target; if (!(t instanceof Element)) return;
    if (pen.el.contains(t) || dp?.contains(t) || t.closest('.ko-ipucu, .ors-hayalet, .inv-hayalet')) return;
    const kok = t.closest('.kui-root'); if (kok && kok.querySelector('[data-id="Btn_Yes"], [data-id="Btn_Ok"]')) return;   // KO mesaj / girdi kutusu
    kapat();
  }, true);
  addEventListener('keydown', (e) => { if (e.code === 'KeyI' && acik() && e.target.tagName !== 'INPUT') { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  return { ac, kapat, acik };
}
