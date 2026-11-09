// KO Power-Up Store (KO'da web sayfası olarak açılan mağaza; kullanıcının verdiği KO PUS görünümü örnek alındı):
// üstte Knight Cash / Bonus Cash, ortada MineKO logosu, sağda "Item Ad" araması + Ara / Kod Yukle / Bayiler;
// 7 sekme (All Items + sunucudaki 6 başlık), 5×4 eşya kutusu (ikon, ad, Price, Quantity, Purchase), altta sayfa okları.
// Satın alma Knight Cash ile (sunucu pus_al), eşya çantaya gelir. Başlıklar / fiyatlar sunucu pus_kategori + pus_esya.
import { loadMeta, fromDb, iconHtml, tooltipHtml } from './esya.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const SAYFA = 20;
const V = (u) => (window.KO_V ? window.KO_V(u) : u);

let win = null, veri = null, IT = new Map(), sekme = 0, sayfa = 0, arama = '', tip = null, ctx = null, sepet = [];

// KO re_powerup_store çerçevesi (deadsoft UI): 1062×767, içerik alanı (46,28) 981×703
const CW = 1062, CH = 767, ATL = { w: 760, h: 269 };
const SP = [[695, 242, 64, 16], [623, 242, 70, 16], [1, 1, 146, 151], [245, 242, 124, 16], [371, 242, 124, 16], [149, 1, 146, 151], [497, 242, 124, 16], [328, 1, 26, 105], [1, 154, 151, 86], [117, 242, 126, 25], [154, 154, 151, 85], [297, 1, 29, 105]];
const CERCEVE = [[601, 9, 79, 16, 0], [402, 9, 76, 16, 1], [913, 5, 146, 151, 2], [478, 9, 124, 16, 3], [284, 9, 124, 16, 4], [790, 9, 124, 16, 4], [21, 4, 146, 151, 5], [672, 9, 124, 16, 4], [167, 9, 124, 16, 4], [167, 20, 754, 16, 6],
  [27, 155, 26, 105, 7], [27, 260, 26, 105, 7], [27, 365, 26, 105, 7], [27, 470, 26, 105, 7], [908, 670, 151, 87, 8], [167, 726, 150, 25, 9], [316, 726, 150, 25, 9], [466, 726, 150, 25, 9], [616, 726, 150, 25, 9], [765, 726, 150, 25, 9],
  [18, 671, 151, 85, 10], [27, 575, 26, 105, 7], [1021, 575, 29, 105, 11], [1021, 155, 29, 105, 11], [1021, 260, 29, 105, 11], [1021, 365, 29, 105, 11], [1021, 470, 29, 105, 11], [1021, 575, 29, 105, 11]];
const cerceveHtml = () => CERCEVE.map(([x, y, w, h, i]) => { const [sx, sy, sw, sh] = SP[i], kx = w / sw, ky = (h + 2) / sh;
  return `<i style="left:${x}px;top:${y + 2}px;width:${w}px;height:${h}px;background-size:${ATL.w * kx}px ${ATL.h * ky}px;background-position:${-sx * kx}px ${-sy * ky}px"></i>`; }).join('');

const sepetAnahtar = () => 'ko-pus-sepet-' + (ctx?.character?.id ?? '');
function sepetYukle() { try { const v = JSON.parse(localStorage.getItem(sepetAnahtar()) || '[]'); sepet = Array.isArray(v) ? v.filter((x) => x && x.id && x.adet > 0).slice(0, 20) : []; } catch { sepet = []; } }
function sepetKaydet() { try { localStorage.setItem(sepetAnahtar(), JSON.stringify(sepet)); } catch {} sepetRozet(); }
const ic = () => win.querySelector('.pus-ic');

export async function pusAc(c) {
  ctx = c;
  if (win && !win.hidden) return kapat();
  await loadMeta().catch(() => {});
  {   // her açılışta güncel liste (GM beta kipini açıp kapatmış olabilir)
    const { data, error } = await c.sb.rpc('pus_liste');
    if (error || !data) { c.hud.notice?.(error?.message || 'Could not load the store list.', 'hata'); return; }
    veri = data;
    const nums = [...new Set((veri.esyalar || []).map((x) => x.num))];
    for (let i = 0; i < nums.length; i += 150) {
      const { data: rows } = await c.sb.from('items').select('*').in('num', nums.slice(i, i + 150));
      for (const r of rows || []) IT.set(Number(r.num), { ...fromDb(r), _db: r });
    }
  }
  sepetYukle();
  if (!win) kur();
  modal(true);
  win.hidden = false; win.style.zIndex = 9500; olcekle(); ciz();
}

function kur() {
  win = document.createElement('div'); win.id = 'pus-pencere'; win.className = 'ko-pencere';
  win.innerHTML = `
    <div class="pus-ic">
      <div class="pus-ust">
        <div class="pus-cash">
          <div><span>Knight Cash</span><b class="pus-kc">0</b></div>
          <div><span>Bonus Cash</span><b class="pus-bc">0</b></div>
        </div>
        <img class="pus-logo" src="${V('./assets/ui/pus/mineko_logo.webp')}" alt="MineKO" draggable="false">
        <div class="pus-ara">
          <div class="pus-ara-sat"><span>Item Ad:</span><input class="pus-ara-kutu" maxlength="40" placeholder="eşya adı..."><button class="pus-btn" data-k="ara">Ara</button><button class="pus-btn" data-k="kod">Kod Yükle</button></div>
          <div class="pus-ara-sat"><span class="pus-ipucu">Aramak istediğiniz eşyada geçen bir kelime...</span><button class="pus-btn" data-k="bayi">Bayiler</button></div>
        </div>
      </div>
      <div class="pus-sekmeler"></div>
      <button class="pus-sepet-btn" data-k="sepet" title="Sepet"><span class="pus-sepet-ikon"></span>Sepet<b class="pus-rozet">0</b></button>
      <div class="pus-izgara"></div>
      <div class="pus-sayfa"><button class="pus-ok" data-p="-1">◀</button><span class="pus-no">1 / 1</span><button class="pus-ok" data-p="1">▶</button></div>
      ${gmMi() ? `<div class="pus-gm-cubuk"><span>GM</span><button class="pus-btn" data-g="ekle">Eşya Ekle</button><button class="pus-btn" data-g="baslik">Başlık Adı</button><button class="pus-btn" data-g="standart" title="Mağazayı kaydedilmiş standart eşya ve dizilime döndür">Standart Görünüm</button><button class="pus-btn" data-g="beta" title="Beta kipi: tüm eşyalar 1 KC (ayrı beta eşya listesi; normal eşyalar değişmez)">Beta Modu</button><button class="pus-btn pus-btn-altin" data-g="panel">GM Paneli</button></div>` : ''}
    </div>
    <div class="pus-cerceve">${cerceveHtml()}</div>
    <button class="pus-kapat" title="Kapat"></button>`;
  document.body.append(win);   // tüm oyun arayüzünün (#kohud) üstünde
  win.style.pointerEvents = 'auto';
  // pencere üst bölümünden / çerçeveden sürüklenir
  { let d = null; const tut = (e) => { if (e.target.closest('input,button,.pus-onay')) return; if (!e.target.closest('.pus-ust') && e.target !== win) return; d = { x: e.clientX - win.offsetLeft, y: e.clientY - win.offsetTop }; win.setPointerCapture(e.pointerId); };
    win.addEventListener('pointerdown', tut);
    win.addEventListener('pointermove', (e) => { if (d) { win.style.left = (e.clientX - d.x) + 'px'; win.style.top = (e.clientY - d.y) + 'px'; } });
    win.addEventListener('pointerup', () => { d = null; }); }
  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  win.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') kapat(); if (e.key === 'Enter' && e.target.classList.contains('pus-ara-kutu')) { arama = e.target.value.trim(); sekme = 0; sayfa = 0; ciz(); } });
  win.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    e.stopPropagation();
    if (t.classList.contains('pus-kapat')) return kapat();
    if (t.dataset.s != null) { sekme = Number(t.dataset.s); sayfa = 0; arama = ''; win.querySelector('.pus-ara-kutu').value = ''; return ciz(); }
    if (t.dataset.p) { sayfa = Math.max(0, sayfa + Number(t.dataset.p)); return ciz(); }
    if (t.dataset.al) return al(Number(t.dataset.al));
    if (t.dataset.sp) return sepeteEkle(Number(t.dataset.sp), 1, t);
    if (t.dataset.gd) return gmDuzenle(Number(t.dataset.gd));
    if (t.dataset.gk) return gmKaldir(Number(t.dataset.gk));
    if (t.dataset.g === 'ekle') return gmDuzenle(null);
    if (t.dataset.g === 'baslik') return gmBaslik();
    if (t.dataset.g === 'panel') return gmPanel();
    if (t.dataset.g === 'standart') return gmStandart();
    if (t.dataset.g === 'beta') return gmBeta();
    if (t.dataset.k === 'sepet') return sepetAc();
    if (t.dataset.k === 'ara') { arama = win.querySelector('.pus-ara-kutu').value.trim(); sekme = 0; sayfa = 0; return ciz(); }
    if (t.dataset.k === 'kod') return kodYukle();
    if (t.dataset.k === 'bayi') return ctx.hud.notice?.('Knight Cash resellers will be added soon.', 'beceri');
  });
  win.addEventListener('pointermove', (e) => {
    const k = e.target.closest('.pus-ikon'); const it = k && IT.get(Number(k.dataset.num));
    if (!it) { tip?.remove(); tip = null; return; }
    tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu' });
    if (!tip.isConnected) document.body.append(tip);
    const xe = (veri.esyalar || []).find((y) => Number(y.num) === Number(k.dataset.num));
    tip.innerHTML = tooltipHtml(xe?.aciklama ? { ...it, Aciklama: xe.aciklama } : it, { satisGizle: true });
    Object.assign(tip.style, { position: 'fixed', zIndex: 9999, pointerEvents: 'none', left: Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16) + 'px', top: Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, e.clientY - 10)) + 'px' });
  });
  win.addEventListener('pointerleave', () => { tip?.remove(); tip = null; });
  addEventListener('ko-cash', () => { if (win && !win.hidden) kcYaz(); });
  addEventListener('resize', () => { if (win && !win.hidden) olcekle(); });
}

// 1062×767 pencere (KO çerçevesiyle) ekrana sığsın (ortalanır)
function olcekle() {
  const W = innerWidth, H = innerHeight, k = Math.min(1, (W - 8) / CW, (H - 8) / CH);
  Object.assign(win.style, { transformOrigin: '0 0', transform: k < 1 ? `scale(${k})` : '', left: Math.round((W - CW * k) / 2) + 'px', top: Math.round((H - CH * k) / 2) + 'px' });
}
function kcYaz() {
  win.querySelector('.pus-kc').textContent = fmt(ctx?.character?.cash);
  win.querySelector('.pus-bc').textContent = fmt(ctx?.character?.bonus_cash);
}
function sepetRozet() {
  const r = win?.querySelector('.pus-rozet'); if (!r) return;
  const n = sepet.reduce((a, x) => a + x.adet, 0); r.textContent = String(n); r.hidden = !n;
}

const gmMi = () => !!ctx?.gm;
function sekmeCiz() {
  const sekmeler = [{ id: 0, ad: 'All Items' }, ...(veri.kategoriler || [])].slice(0, 7);
  win.querySelector('.pus-sekmeler').innerHTML = sekmeler.map((k) => `<button class="pus-sekme" data-s="${k.id}">${esc(k.ad)}</button>`).join('');
}
function ciz() {
  win?.classList.toggle('pus-beta', !!veri?.beta);   // beta kipi rozeti
  { const b = win?.querySelector('[data-g="beta"]'); if (b) b.textContent = veri?.beta ? 'Beta Modu: Açık' : 'Beta Modu'; }
  kcYaz(); sekmeCiz(); sepetRozet();
  win.querySelectorAll('.pus-sekme').forEach((b) => b.classList.toggle('secili', !arama && Number(b.dataset.s) === sekme));
  const kucuk = arama.toLocaleLowerCase('tr');
  const liste = (veri.esyalar || []).filter((x) => (arama ? String(x.ad).toLocaleLowerCase('tr').includes(kucuk) : (sekme === 0 || x.k === sekme)));
  const top = Math.max(1, Math.ceil(liste.length / SAYFA)); sayfa = Math.min(sayfa, top - 1);
  const parca = liste.slice(sayfa * SAYFA, sayfa * SAYFA + SAYFA);
  win.querySelector('.pus-izgara').innerHTML = parca.map((x) => { const it = IT.get(Number(x.num)); return `<div class="pus-kutu">
      <div class="pus-ikon" data-num="${x.num}">${it ? iconHtml(it, 46) : ''}</div>
      <div class="pus-bilgi"><div class="pus-ad" title="${esc(x.ad)}">${esc(x.ad)}</div><div class="pus-fiyat">${fmt(x.fiyat)} <i>KC</i></div><div class="pus-adet">Quantity: ${fmt(x.adet)}</div></div>
      <div class="pus-kutu-alt"><button class="pus-satin" data-al="${x.id}">Purchase</button><button class="pus-sepete" data-sp="${x.id}" title="Sepete Ekle"><span class="pus-sepet-ikon"></span>Sepete</button></div>${gmMi() ? `<div class="pus-gm-k"><button data-gd="${x.id}" title="Düzenle">✎</button><button data-gk="${x.id}" title="Kaldır">✕</button></div>` : ''}</div>`; }).join('') || `<div class="pus-bos">${arama ? 'Aradığınız eşya bulunamadı.' : 'Bu başlıkta eşya yok.'}</div>`;
  win.querySelector('.pus-no').textContent = `${sayfa + 1} / ${top}`;
  const [g, i] = win.querySelectorAll('.pus-ok'); g.disabled = sayfa <= 0; i.disabled = sayfa >= top - 1;
}

// ---------- Sepet ----------
function sepeteEkle(id, n = 1, btn = null) {
  const x = (veri.esyalar || []).find((y) => y.id === id); if (!x) return;
  const v = sepet.find((y) => y.id === id);
  if (v) v.adet = Math.min(99, v.adet + n);
  else { if (sepet.length >= 20) return ctx.hud.notice?.('The cart can hold at most 20 different items.', 'hata'); sepet.push({ id, adet: n }); }
  sepetKaydet();
  const r = win.querySelector('.pus-sepet-btn'); r.classList.remove('vurgu'); void r.offsetWidth; r.classList.add('vurgu');
  if (btn) { btn.classList.add('eklendi'); setTimeout(() => btn.classList.remove('eklendi'), 600); }
  ctx.hud.info?.(`${x.ad} has been added to the cart.`, 'beceri');
}
function sepetAc() {
  win.querySelector('.pus-onay')?.remove();
  const o = document.createElement('div'); o.className = 'pus-onay';
  ic().append(o);
  let mesgul = false;
  const ciz2 = () => {
    sepet = sepet.filter((s) => (veri.esyalar || []).some((y) => y.id === s.id));
    const satirlar = sepet.map((s) => ({ s, x: (veri.esyalar || []).find((y) => y.id === s.id) }));
    const toplam = satirlar.reduce((a, { s, x }) => a + x.fiyat * s.adet, 0), kc = Number(ctx.character.cash || 0);
    o.innerHTML = `<div class="pus-onay-kutu pus-sepet-kutu"><div class="pus-onay-baslik"><span>Alışveriş Sepeti</span></div>
      ${satirlar.length ? `<div class="pus-sepet-bas"><span></span><span>Eşya</span><span>Birim</span><span>Miktar</span><span>Tutar</span><span></span></div>
      <div class="pus-sepet-liste">${satirlar.map(({ s, x }) => { const it = IT.get(Number(x.num)); return `<div class="pus-sepet-satir" data-id="${s.id}">
          <div class="pus-ikon" data-num="${x.num}">${it ? iconHtml(it, 34) : ''}</div>
          <div class="pus-sepet-ad">${esc(x.ad)}${x.adet > 1 ? ` <i>(×${fmt(x.adet)})</i>` : ''}</div>
          <div class="pus-sepet-birim">${fmt(x.fiyat)}</div>
          <div class="pus-sepet-mk"><button data-m="-1">−</button><input type="number" min="1" max="99" value="${s.adet}"><button data-m="1">+</button></div>
          <div class="pus-sepet-tutar">${fmt(x.fiyat * s.adet)}</div>
          <button class="pus-sepet-sil" data-sil="${s.id}" title="Sepetten çıkar">✕</button></div>`; }).join('')}</div>
      <div class="pus-sepet-ozet">
        <div><span>Sepet Toplamı:</span><b class="pus-kirmizi">${fmt(toplam)} KC</b></div>
        <div><span>Knight Cash:</span><b>${fmt(kc)} KC</b></div>
        <div><span>Ödeme Sonrası:</span><b class="${kc - toplam < 0 ? 'pus-kirmizi' : 'pus-yesil'}">${kc - toplam < 0 ? 'Yetersiz bakiye' : fmt(kc - toplam) + ' KC'}</b></div>
      </div>
      <div class="pus-onay-dugmeler pus-sepet-dugmeler"><button class="pus-btn pus-btn-altin" data-o="ode"${kc < toplam ? ' disabled' : ''}>Ödeme Yap</button><button class="pus-btn" data-o="bosalt">Sepeti Boşalt</button><button class="pus-btn" data-o="iptal">Alışverişe Dön</button></div>`
      : `<div class="pus-sepet-bos"><span class="pus-sepet-ikon buyuk"></span><div>Sepetiniz boş.</div><div class="pus-ipucu">Eşyaların altındaki "Sepete" düğmesiyle ekleyebilirsiniz.</div></div>
      <div class="pus-onay-dugmeler pus-sepet-dugmeler"><button class="pus-btn" data-o="iptal">Alışverişe Dön</button></div>`}</div>`;
  };
  const ode = async () => {
    if (mesgul || !sepet.length) return; mesgul = true;
    const { sb, character, hud, state } = ctx;
    const { data: r, error } = await sb.rpc(ctx.web ? 'web_pus_al' : 'pus_sepet_al', { p_char: character.id, p_sepet: sepet.map((s) => ({ id: s.id, adet: s.adet })) });   // web: eşyalar hesabın posta kutusuna
    mesgul = false;
    if (error || !r?.ok) { hud.notice?.(r?.mesaj || error?.message || 'Payment failed.', 'hata'); return; }
    character.cash = r.cash; dispatchEvent(new CustomEvent('ko-cash', { detail: r.cash }));
    hud.info?.(`Power-Up Store: ${(r.esyalar || []).map((e) => e.ad + (e.adet > 1 ? ' x' + e.adet : '')).join(', ')} purchased (-${fmt(r.harcanan)} Knight Cash).${ctx.web ? ' The items have been sent to your in-game mailbox.' : ''}`, 'seviye');
    sepet = []; sepetKaydet(); o.remove(); kcYaz(); await state?.inv?.reload?.();
  };
  o.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === o) return o.remove();
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.o === 'iptal') return o.remove();
    if (b.dataset.o === 'ode') return ode();
    if (b.dataset.o === 'bosalt') { sepet = []; sepetKaydet(); return ciz2(); }
    if (b.dataset.sil) { sepet = sepet.filter((s) => s.id !== Number(b.dataset.sil)); sepetKaydet(); return ciz2(); }
    if (b.dataset.m) { const s = sepet.find((y) => y.id === Number(b.closest('[data-id]').dataset.id)); if (s) { s.adet = Math.max(1, Math.min(99, s.adet + Number(b.dataset.m))); sepetKaydet(); ciz2(); } }
  });
  o.addEventListener('change', (e) => { const inp = e.target.closest('.pus-sepet-mk input'); if (!inp) return; const s = sepet.find((y) => y.id === Number(inp.closest('[data-id]').dataset.id)); if (s) { s.adet = Math.max(1, Math.min(99, Math.floor(Number(inp.value) || 1))); sepetKaydet(); ciz2(); } });
  o.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); o.remove(); } });
  ciz2(); sepetKaydet();
}

// satın alma onayı: mağazanın ortasında KO tarzı pencere — solda ikon, ad, fiyat, miktar, Satın Al / İptal; sağda eşya açıklaması
function al(id) {
  const x = (veri.esyalar || []).find((y) => y.id === id); if (!x || !ctx) return;
  const { sb, character, hud, state } = ctx;
  const it = IT.get(Number(x.num));
  win.querySelector('.pus-onay')?.remove();
  const o = document.createElement('div'); o.className = 'pus-onay';
  o.innerHTML = `<div class="pus-onay-kutu">
      <div class="pus-onay-baslik"><span>Satın Alma</span></div>
      <div class="pus-onay-sol">
        <div class="pus-ikon pus-onay-ikon" data-num="${x.num}">${it ? iconHtml(it, 42) : ''}</div>
        <div class="pus-onay-ad">${esc(x.ad)}</div>
        <div class="pus-onay-satir"><span>Fiyat:</span><b class="pus-onay-fiyat">${fmt(x.fiyat)}</b> <i>Knight Cash</i></div>
        <div class="pus-onay-satir"><span>Miktar:</span><input class="pus-onay-miktar" type="number" min="1" max="99" value="1">${x.adet > 1 ? `<i>× ${fmt(x.adet)} adet</i>` : ''}</div>
        <div class="pus-onay-satir"><span>Toplam:</span><b class="pus-onay-toplam">${fmt(x.fiyat)}</b> <i>Knight Cash</i></div>
        <div class="pus-onay-dugmeler"><button class="pus-btn pus-btn-altin" data-o="al">Satın Al</button><button class="pus-btn" data-o="sepet">Sepete Ekle</button><button class="pus-btn" data-o="iptal">İptal</button></div>
      </div>
      <div class="pus-onay-sag ko-ipucu">${it ? tooltipHtml(x.aciklama ? { ...it, Aciklama: x.aciklama } : it, { satisGizle: true }) : `<b>${esc(x.ad)}</b><br>${esc(x.aciklama || '')}`}</div>
    </div>`;
  ic().append(o);
  const mk = o.querySelector('.pus-onay-miktar');
  const miktar = () => Math.max(1, Math.min(99, Math.floor(Number(mk.value) || 1)));
  mk.addEventListener('input', () => { o.querySelector('.pus-onay-toplam').textContent = fmt(x.fiyat * miktar()); });
  mk.focus(); mk.select();
  let mesgul = false;
  const yap = async () => {
    if (mesgul) return; mesgul = true;
    const n = miktar();
    let { data: r, error } = ctx.web ? await sb.rpc('web_pus_al', { p_char: character.id, p_sepet: [{ id, adet: n }] }) : await sb.rpc('pus_al', { p_char: character.id, p_id: id, p_adet: n });
    if (ctx.web && r?.ok) r = { ...r, ad: r.esyalar?.[0]?.ad, adet: r.esyalar?.[0]?.adet };
    mesgul = false;
    if (error || !r?.ok) { hud.notice?.(r?.mesaj || error?.message || 'Purchase failed.', 'hata'); o.querySelector('.pus-onay-ad').dataset.hata = '1'; return; }
    character.cash = r.cash; dispatchEvent(new CustomEvent('ko-cash', { detail: r.cash }));
    hud.info?.(`Power-Up Store: ${r.ad}${r.adet > 1 ? ' x' + r.adet : ''} purchased (-${fmt(r.harcanan)} Knight Cash).${ctx.web ? ' The item has been sent to your in-game mailbox.' : ''}`, 'seviye');
    o.remove(); await state?.inv?.reload?.(); kcYaz();
  };
  o.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('[data-o]'); if (!b) { if (e.target === o) o.remove(); return; } if (b.dataset.o === 'al') yap(); else if (b.dataset.o === 'sepet') { sepeteEkle(id, miktar()); o.remove(); } else o.remove(); });
  o.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); yap(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); o.remove(); } });
}

// KO: mağaza açıkken başka pencere / ticaret / pazar / davet kullanılamaz; çalışan Genie durur
let perde = null;
const tusKes = (e) => { if (!win || win.hidden) return; if (win.contains(e.target)) return; e.stopImmediatePropagation(); if (e.key === 'Escape') { e.preventDefault(); kapat(); } };
function modal(ac) {
  window.__koPusAcik = ac;
  if (ac) {
    const { hud, state } = ctx || {};
    try { hud?.closeAll?.(); } catch {}
    try { state?.genie?.durdur?.(); state?.genie?.kapat?.(); } catch {}
    try { state?.takas?.kapat?.(); state?.pazar?.kapat?.(); state?.ticaret?.kapatHepsi?.(); } catch {}
    document.querySelectorAll('.ko-tic, #takas-pencere, .ko-pazar, #kira-pencere').forEach((e) => { if (e.id === 'kira-pencere') e.remove(); else e.hidden = true; });
    if (!perde) { perde = document.createElement('div'); perde.id = 'pus-perde'; for (const ev of ['pointerdown', 'pointerup', 'click', 'contextmenu', 'wheel', 'dblclick']) perde.addEventListener(ev, (e) => { e.stopPropagation(); e.preventDefault(); }, { passive: false }); }
    document.body.append(perde);
    addEventListener('keydown', tusKes, true); addEventListener('keyup', tusKes, true);
    dispatchEvent(new Event('ko-pus-ac'));
  } else {
    perde?.remove();
    removeEventListener('keydown', tusKes, true); removeEventListener('keyup', tusKes, true);
    dispatchEvent(new Event('ko-pus-kapat'));
  }
}

// ---------- GM: mağaza düzenleme (eşya ekle / düzenle / kaldır, fiyat, başlık adı) ----------
async function listeYenile(liste) {
  veri = liste;
  const eksik = [...new Set((veri.esyalar || []).map((x) => Number(x.num)))].filter((n) => !IT.has(n));
  if (eksik.length) { const { data: rows } = await ctx.sb.from('items').select('*').in('num', eksik); for (const r of rows || []) IT.set(Number(r.num), { ...fromDb(r), _db: r }); }
  ciz();
}
async function gmRpc(ad, args) {
  const { data: r, error } = await ctx.sb.rpc(ad, { p_char: ctx.character.id, ...args });
  if (error || !r?.ok) { ctx.hud.notice?.(r?.mesaj || error?.message || 'The operation failed.', 'hata'); return null; }
  await listeYenile(r.liste); return r;
}
function gmKutu(baslik, govde) {
  win.querySelector('.pus-onay')?.remove();
  const o = document.createElement('div'); o.className = 'pus-onay';
  o.innerHTML = `<div class="pus-onay-kutu pus-gm-kutu"><div class="pus-onay-baslik"><span>${esc(baslik)}</span></div>${govde}</div>`;
  ic().append(o);
  o.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === o || e.target.closest('[data-o="iptal"]')) o.remove(); });
  o.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); o.remove(); } });
  return o;
}
function gmDuzenle(id) {
  const x = id != null ? (veri.esyalar || []).find((y) => y.id === id) : null;
  const katlar = (veri.kategoriler || []);
  const varsayKat = x?.k ?? (sekme || katlar[0]?.id);
  const o = gmKutu(x ? 'Eşyayı Düzenle' : 'Yeni Eşya Ekle', `
    <div class="pus-onay-sol pus-gm-sol">
      <div class="pus-ikon pus-onay-ikon pus-gm-ikon"></div>
      <div class="pus-gm-satir"><span>Eşya No:</span><input class="pus-gm-num" type="number" value="${x?.num ?? ''}"></div>
      <div class="pus-gm-satir"><span>Eşya Ara:</span><input class="pus-gm-ara" maxlength="40" placeholder="ad ya da numara..."><b class="pus-gm-say"></b></div>
      <div class="pus-gm-sonuc"></div>
      <div class="pus-gm-satir"><span>Mağaza Adı:</span><input class="pus-gm-ad" maxlength="60" value="${esc(x?.ad ?? '')}"></div>
      <div class="pus-gm-satir"><span>Başlık:</span><select class="pus-gm-kat">${katlar.map((k) => `<option value="${k.id}"${Number(k.id) === Number(varsayKat) ? ' selected' : ''}>${esc(k.ad)}</option>`).join('')}</select></div>
      <div class="pus-gm-satir"><span>Fiyat (KC):</span><input class="pus-gm-fiyat" type="number" min="0" value="${x?.fiyat ?? 100}"></div>
      <div class="pus-gm-satir"><span>Adet:</span><input class="pus-gm-adet" type="number" min="1" max="9999" value="${x?.adet ?? 1}"></div>
      <div class="pus-onay-dugmeler"><button class="pus-btn" data-o="kaydet">Kaydet</button>${x ? '<button class="pus-btn pus-gm-sil" data-o="kaldir">Kaldır</button>' : ''}<button class="pus-btn" data-o="iptal">İptal</button></div>
    </div>
    <div class="pus-gm-sag"><div class="pus-gm-etiket">Açıklama (Türkçe):</div><textarea class="pus-gm-aciklama" maxlength="600">${esc(x?.aciklama ?? '')}</textarea><div class="pus-onay-sag ko-ipucu pus-gm-onizle"></div></div>`);
  const $ = (c) => o.querySelector(c);
  const onizle = async () => {
    const n = Number($('.pus-gm-num').value);
    let it = IT.get(n);
    if (n && !it) { const { data: rows } = await ctx.sb.from('items').select('*').eq('num', n).limit(1); if (rows?.[0]) { it = { ...fromDb(rows[0]), _db: rows[0] }; IT.set(n, it); } }
    $('.pus-gm-ikon').innerHTML = it ? iconHtml(it, 42) : '';
    $('.pus-gm-ikon').dataset.num = it ? n : '';
    const ac = $('.pus-gm-aciklama').value.trim();
    $('.pus-gm-onizle').innerHTML = it ? tooltipHtml(ac ? { ...it, Aciklama: ac } : it, { satisGizle: true }) : '<i>Geçerli bir eşya numarası girin.</i>';
    if (it && !$('.pus-gm-ad').value.trim()) $('.pus-gm-ad').placeholder = it.strName || '';
  };
  let zam = null;
  $('.pus-gm-num').addEventListener('input', () => { clearTimeout(zam); zam = setTimeout(onizle, 250); });
  $('.pus-gm-aciklama').addEventListener('input', () => { clearTimeout(zam); zam = setTimeout(onizle, 250); });
  // eşya listesi: arama boşken tüm eşyalar; kaydırdıkça 60'ar 60'ar yüklenir (ada ya da numaraya göre süzülür)
  const liste = $('.pus-gm-sonuc');
  let aSorgu = '', aSayfa = 0, aBitti = false, aYukleniyor = false, aNo = 0;
  const PARCA = 60;
  const aYukle = async (bastan) => {
    if (bastan) { aSayfa = 0; aBitti = false; liste.innerHTML = ''; liste.scrollTop = 0; aNo++; }
    if (aBitti || aYukleniyor) return;
    aYukleniyor = true; const no = aNo;
    let q = ctx.sb.from('items').select('*', { count: aSayfa === 0 ? 'exact' : undefined }).order('num').range(aSayfa * PARCA, aSayfa * PARCA + PARCA - 1);
    const t = aSorgu.replace(/[%_,()]/g, '');
    if (t) q = /^\d+$/.test(t) ? q.or(`name.ilike.%${t}%,num.eq.${t}`) : q.ilike('name', `%${t}%`);
    const { data: rows, count, error } = await q;
    aYukleniyor = false;
    if (no !== aNo) return;
    if (error) { liste.insertAdjacentHTML('beforeend', `<em>${esc(error.message)}</em>`); aBitti = true; return; }
    if (aSayfa === 0) $('.pus-gm-say').textContent = count != null ? `${fmt(count)} eşya` : '';
    for (const r of rows || []) { const it = { ...fromDb(r), _db: r }; if (!IT.has(Number(r.num))) IT.set(Number(r.num), it);
      liste.insertAdjacentHTML('beforeend', `<div data-n="${r.num}"${String(r.num) === $('.pus-gm-num').value ? ' class="secili"' : ''}><span class="pus-gm-sonuc-ikon">${iconHtml(it, 24)}</span><span class="pus-gm-sonuc-ad">${esc(r.name)}</span><i>${r.num}</i></div>`); }
    if (!rows?.length && aSayfa === 0) liste.innerHTML = '<em>Bulunamadı</em>';
    aBitti = (rows?.length || 0) < PARCA; aSayfa++;
    if (!aBitti && liste.scrollHeight <= liste.clientHeight + 4) aYukle(false);
  };
  liste.addEventListener('scroll', () => { if (liste.scrollTop + liste.clientHeight >= liste.scrollHeight - 60) aYukle(false); });
  liste.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  $('.pus-gm-ara').addEventListener('input', () => { clearTimeout(zam); zam = setTimeout(() => { aSorgu = $('.pus-gm-ara').value.trim(); aYukle(true); }, 300); });
  liste.addEventListener('click', (e) => { const d = e.target.closest('[data-n]'); if (!d) return; $('.pus-gm-num').value = d.dataset.n; liste.querySelectorAll('.secili').forEach((x) => x.classList.remove('secili')); d.classList.add('secili'); onizle(); });
  aYukle(true);
  let mesgul = false;
  o.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-o]'); if (!b || mesgul) return;
    if (b.dataset.o === 'kaldir') return gmKaldir(id);
    if (b.dataset.o !== 'kaydet') return;
    mesgul = true;
    const v = { num: Number($('.pus-gm-num').value), kategori: Number($('.pus-gm-kat').value), fiyat: Math.floor(Number($('.pus-gm-fiyat').value)), adet: Math.floor(Number($('.pus-gm-adet').value) || 1), ad: $('.pus-gm-ad').value, aciklama: $('.pus-gm-aciklama').value };
    const r = await gmRpc('gm_pus_kaydet', { p_id: id, p_veri: v });
    mesgul = false;
    if (r) { o.remove(); ctx.hud.info?.(`Power-Up Store: item ${id ? 'updated' : 'added'}.`, 'seviye'); }
  });
  onizle(); $(x ? '.pus-gm-fiyat' : '.pus-gm-ara').focus();
}
function gmKaldir(id) {
  const x = (veri.esyalar || []).find((y) => y.id === id); if (!x) return;
  const it = IT.get(Number(x.num));
  const o = gmKutu('Eşyayı Kaldır', `<div class="pus-onay-sol pus-gm-tek">
      <div class="pus-ikon pus-onay-ikon" data-num="${x.num}">${it ? iconHtml(it, 42) : ''}</div>
      <div class="pus-onay-ad">${esc(x.ad)}</div>
      <div>Bu eşya mağazadan kaldırılsın mı?</div>
      <div class="pus-onay-dugmeler"><button class="pus-btn pus-gm-sil" data-o="evet">Kaldır</button><button class="pus-btn" data-o="iptal">İptal</button></div></div>`);
  o.addEventListener('click', async (e) => { const b = e.target.closest('[data-o="evet"]'); if (!b || b.disabled) return; b.disabled = true;
    if (await gmRpc('gm_pus_kaldir', { p_id: id })) { o.remove(); ctx.hud.info?.(`Power-Up Store: ${x.ad} removed.`, 'seviye'); } else b.disabled = false; });
}
function gmBaslik() {
  const k = (veri.kategoriler || []).find((y) => Number(y.id) === sekme);
  if (!k) return ctx.hud.notice?.('Select a category tab to rename first (All Items cannot be renamed).', 'hata');
  const o = gmKutu('Başlık Adı', `<div class="pus-onay-sol pus-gm-tek">
      <div class="pus-gm-satir"><span>Yeni ad:</span><input class="pus-gm-bad" maxlength="24" value="${esc(k.ad)}"></div>
      <div class="pus-onay-dugmeler"><button class="pus-btn" data-o="kaydet">Kaydet</button><button class="pus-btn" data-o="iptal">İptal</button></div></div>`);
  const inp = o.querySelector('.pus-gm-bad'); inp.focus(); inp.select();
  const yap = async () => { if (await gmRpc('gm_pus_kategori', { p_id: k.id, p_ad: inp.value })) o.remove(); };
  o.addEventListener('click', (e) => { if (e.target.closest('[data-o="kaydet"]')) yap(); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); yap(); } });
}

// GM: beta kipi — açıkken mağaza ayrı beta listesini gösterir (normal listenin kopyası, tüm fiyatlar 1 KC); normal eşyalar ve adları değişmez
function gmBeta() {
  const acik = !!veri?.beta;
  const o = gmKutu('Beta Modu', `<div class="pus-onay-sol pus-gm-tek">
      <div>Beta modu şu an <b>${acik ? 'AÇIK' : 'KAPALI'}</b>.</div>
      <div class="pus-ipucu">${acik ? 'Kapatılınca mağaza normal eşya listesine ve fiyatlara döner.' : 'Açılınca tüm oyunculara ayrı bir beta eşya listesi gösterilir: tüm eşyalar 1 Knight Cash. Normal eşyalar, adları ve fiyatları değişmez.'}</div>
      <div class="pus-onay-dugmeler"><button class="pus-btn pus-btn-altin" data-o="evet">${acik ? 'Beta Modunu Kapat' : 'Beta Modunu Aç'}</button><button class="pus-btn" data-o="iptal">İptal</button></div></div>`);
  o.addEventListener('click', async (e) => { const b = e.target.closest('[data-o="evet"]'); if (!b || b.disabled) return; b.disabled = true;
    const r = await gmRpc('gm_pus_beta', { p_acik: !acik });
    if (r) { o.remove(); sekme = 0; sayfa = 0; arama = ''; ciz(); ctx.hud.info?.(r.beta ? 'Power-Up Store beta mode enabled: all items cost 1 KC.' : 'Power-Up Store beta mode disabled.', 'seviye'); } else b.disabled = false; });
}
// GM: mağazayı kaydedilmiş standart eşya listesine, fiyatlara, başlıklara ve dizilime döndür (pus_esya_standart)
function gmStandart() {
  const o = gmKutu('Standart Görünüm', `<div class="pus-onay-sol pus-gm-tek">
      <div>Mağaza kaydedilmiş <b>standart</b> eşya listesine, fiyatlara, açıklamalara, başlık adlarına ve dizilime döndürülsün mü?</div>
      <div class="pus-ipucu">Sonradan eklenen eşyalar mağazadan kaldırılır, kaldırılan standart eşyalar geri gelir.</div>
      <div class="pus-onay-dugmeler"><button class="pus-btn pus-btn-altin" data-o="evet">Standarda Dön</button><button class="pus-btn" data-o="iptal">İptal</button></div></div>`);
  o.addEventListener('click', async (e) => { const b = e.target.closest('[data-o="evet"]'); if (!b || b.disabled) return; b.disabled = true;
    const r = await gmRpc('gm_pus_standart', {});
    if (r) { o.remove(); sekme = 0; sayfa = 0; arama = ''; ciz(); ctx.hud.info?.(`Power-Up Store reverted to the standard layout (${r.adet} items).`, 'seviye'); } else b.disabled = false; });
}

// ---------- Kod Yükle (oyuncu) ----------
function kodYukle() {
  win.querySelector('.pus-onay')?.remove();
  const o = document.createElement('div'); o.className = 'pus-onay';
  o.innerHTML = `<div class="pus-onay-kutu pus-kod-kutu"><div class="pus-onay-baslik"><span>Kod Yükle</span></div>
    <div class="pus-kod-govde">
      <div>Elindeki Knight Cash kodunu gir. Kod hesabına bir kez kullanılabilir ve KC bu karaktere yüklenir.</div>
      <input class="pus-kod-gir" maxlength="32" placeholder="MINE-XXXX-XXXX" spellcheck="false" autocomplete="off">
      <div class="pus-onay-dugmeler"><button class="pus-btn pus-btn-altin" data-o="yukle">Kodu Kullan</button><button class="pus-btn" data-o="iptal">İptal</button></div></div></div>`;
  ic().append(o);
  const inp = o.querySelector('.pus-kod-gir'); inp.focus();
  inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); });
  let mesgul = false;
  const yap = async () => {
    if (mesgul || !inp.value.trim()) return; mesgul = true;
    const { kcKodKullan } = await import('./kc-kod.js');
    const r = await kcKodKullan(ctx.sb, ctx.character.id, inp.value.trim());
    mesgul = false;
    if (!r?.ok) { ctx.hud.notice?.(r?.mesaj || 'The code could not be used.', 'hata'); inp.select(); return; }
    ctx.character.cash = r.cash; dispatchEvent(new CustomEvent('ko-cash', { detail: r.cash }));
    ctx.hud.info?.(`Code redeemed: +${fmt(r.miktar)} Knight Cash.`, 'seviye'); kcYaz(); o.remove();
  };
  o.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === o) return o.remove(); const b = e.target.closest('[data-o]'); if (!b) return; if (b.dataset.o === 'yukle') yap(); else o.remove(); });
  o.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); yap(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); o.remove(); } });
}

// ---------- GM Paneli: KC kod yönetimi (web sitesi Yönetici panelindeki ekranla aynı veri) ----------
async function gmPanel() {
  const o = gmKutu('GM Paneli — KC Kod Yönetimi', '<div class="pus-gm-panel"><div class="pus-bos">Yükleniyor…</div></div>');
  o.querySelector('.pus-onay-kutu').classList.add('pus-gm-panel-kutu');
  const kapatB = Object.assign(document.createElement('button'), { className: 'pus-onay-x', textContent: '✕', title: 'Kapat' }); kapatB.dataset.o = 'iptal';
  o.querySelector('.pus-onay-kutu').append(kapatB);
  const { kcKodYonetim } = await import('./kc-kod.js');
  await kcKodYonetim(o.querySelector('.pus-gm-panel'), ctx.sb, { bildir: (m, t) => (t === 'hata' ? ctx.hud.notice?.(m, 'hata') : ctx.hud.info?.(m, 'seviye')) });
}

export function kapat() { tip?.remove(); tip = null; if (win) win.hidden = true; modal(false); }
