// [Discipline of Heppa] Shozin — Item Combination (KO re_combinateitem.uif) ve Pathos kitabı (co_combinationmethod_us.uif).
// Dokular orijinal KnightOnlineEn UI\ui.src'den (assets/ui/komb). Pencere ekranın sağından gelir; 11 malzeme yuvası, sonuç yuvası,
// pencere içi çanta (28 yuva), Noah. Formula → Pathos kitabı (kapak → liste → tarif ayrıntısı). Kurallar sunucuda:
// uretim_liste() (tarifler), uretim_yap(p_char, p_mats [{slot, adet}]) — malzemeler bir tarifle birebir eşleşmeli; şansa göre başarı.
// Tarifler Web panel → Oyun yönetimi → Üretim'den tanımlanır.
import { yanAcildi } from './yan-pencere.js';
import { hasLayout, buildLayout, draggable, ekUI } from './kui.js';
import { loadMeta, iconHtml, tooltipHtml, fromDb } from './esya.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const noah = (n) => Number(n || 0).toLocaleString('en-US');
const katman = () => document.getElementById('kohud') || document.body;
let META_P = null, K = null, B = null, ctx = null;
const IT = new Map();
async function esyalar(nums) {
  const eksik = [...new Set(nums.map(Number))].filter((n) => n && !IT.has(n));
  if (eksik.length) { const { data } = await ctx.sb.from('items').select('*').in('num', eksik); for (const r of data || []) IT.set(Number(r.num), fromDb(r)); }
  return nums.map((n) => IT.get(Number(n)) || null);
}
let tip = null;
const ipucu = (html, ev) => {
  tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu ko-tic-ipucu' });
  if (!tip.isConnected) document.body.append(tip);
  tip.innerHTML = html;
  tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, ev.clientX + 16) + 'px';
  tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, ev.clientY - 10)) + 'px';
};
const ipucuKapat = () => tip?.remove();
const hazirla = async (o) => {
  ctx = o;
  await (META_P ||= loadMeta().catch(() => {}));
  return (await ekUI('komb').catch(() => false)) && hasLayout('re_combinateitem');
};

// ───────────────────────── Item Combination
const sec = { mats: Array(11).fill(null), sonuc: null };   // mats[i] = { slot, adet }
let gold = 0, mesgul = false;
const bag = () => ctx.state.inv?.items || new Map();
const yerlesen = (slot) => sec.mats.reduce((t, m) => t + (m?.slot === slot ? m.adet : 0), 0);
const envanterKapat = () => { try { if (ctx.hud.invOpen) ctx.hud.panel?.('envanter'); } catch {} };

function kurK() {
  const L = buildLayout('re_combinateitem', { className: 'ko-komb ko-ors ko-pencere kui-dokulu' });
  katman().append(L.el);   // KO: örs gibi sağda sabit, sürüklenmez
  L.show('Input_count', false);
  L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  L.el.addEventListener('contextmenu', (e) => e.preventDefault());
  L.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  for (let i = 0; i < 28; i++) { const a = L.get('a_slot_' + i); if (a) { a.dataset.cs = 14 + i; a.classList.add('ors-yuva'); } }
  for (let i = 0; i < 11; i++) { const a = L.get('area_m_' + i); if (a) { a.dataset.m = i; a.classList.add('ors-yuva'); } }
  L.get('area_m_result')?.classList.add('ors-yuva');
  L.click('btn_close', kapatK);
  L.click('btn_cancel', () => { if (mesgul) return; temizle(); ciz(); });
  L.click('btn_method', () => uretimKitabi({ ...ctx, uretim: false }));
  L.click('btn_ok', birlestir);
  // adet penceresi (KO Input_count): yığından kaç tane konacağı
  const inp = L.input('edit_input', { type: 'text', inputMode: 'numeric', maxLength: 4 });
  inp?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') adetOnay(); if (e.key === 'Escape') L.show('Input_count', false); });
  L.all('btn_ok').forEach((b) => { if (b.closest('[data-id="Input_count"]')) { b.classList.add('kui-tik'); b.onclick = (ev) => { ev.stopPropagation(); adetOnay(); }; } });
  L.get('btn_ok') && (L.all('btn_ok')[0].onclick = (ev) => { ev.stopPropagation(); birlestir(); });
  L.el.addEventListener('click', (ev) => {
    if (mesgul) return;
    const a = ev.target.closest('.ors-yuva'); if (!a) return;
    if (a.dataset.cs) return koy(Number(a.dataset.cs));
    if (a.dataset.m != null) { sec.mats[a.dataset.m] = null; sec.sonuc = null; return ciz(); }
    if (a.dataset.id === 'area_m_result') { sec.sonuc = null; ciz(); }
  });
  L.el.addEventListener('contextmenu', (ev) => { const a = ev.target.closest('.ors-yuva'); if (a) a.click(); });
  L.el.addEventListener('ko-esya-birak', (ev) => { const d = ev.detail || {}; if (d.slot >= 14 && d.slot <= 41) koy(d.slot); });
  L.el.addEventListener('pointermove', (ev) => {
    const a = ev.target.closest('.ors-yuva'); if (!a) return ipucuKapat();
    if (a.dataset.id === 'area_m_result') return sec.sonuc?.it ? ipucu(tooltipHtml(sec.sonuc.it, { count: sec.sonuc.adet }), ev) : ipucuKapat();
    const m = a.dataset.m != null ? sec.mats[a.dataset.m] : null;
    const s = a.dataset.cs ? Number(a.dataset.cs) : m?.slot;
    const e = s != null ? bag().get(s) : null; if (!e) return ipucuKapat();
    ipucu(tooltipHtml(e.it, { count: m ? m.adet : (e.row.count || 1) - yerlesen(s) }), ev);
  });
  L.el.addEventListener('pointerleave', ipucuKapat);
  return L;
}
let bekleyenAdet = null;
// yalnız Pathos kitabındaki tariflerin malzemeleri konabilir
let MALZ = new Set();
const malzemeMi = (e) => MALZ.has(Number(e.row?.item_num ?? e.it?.Num));   // sunucu (uretim_yap) da birebir numara eşleştirir
async function malzemeYukle() {
  try { const { data } = await ctx.sb.rpc('uretim_liste'); const t = Array.isArray(data?.tarifler) ? data.tarifler : []; tarifler = t; if (Array.isArray(data?.siniflar)) siniflar = data.siniflar; MALZ = new Set(t.flatMap((x) => (x.malzeme || []).map((m) => Number(m.num)))); } catch {}
}
function koy(slot) {
  if (bekleyenAdet) return;   // adet penceresi açıkken (KO: kipli)
  const e = bag().get(slot); if (!e) return;
  if (!malzemeMi(e)) return ctx.hud.notice?.("This item can't be used for combination.", 'ors-uyari');
  const kalan = (Number(e.row.count) || 1) - yerlesen(slot); if (kalan <= 0) return;
  const i = sec.mats.indexOf(null);
  if (i < 0) return ctx.hud.notice?.('The combination slots are full.', 'ors-uyari');
  sec.sonuc = null;
  if (Number(e.it.Countable) > 0 && kalan > 1) {   // KO: yığın için adet sorulur
    bekleyenAdet = { slot, i, kalan };
    K.text('text_title', e.it.strName || ''); K.text('text_msg', 'Enter the desired count');
    K.get('area_icon').innerHTML = iconHtml(e.it, 43);
    K.show('Input_count', true);
    const inp = K.get('edit_input')?.querySelector('input'); if (inp) { inp.value = String(kalan); setTimeout(() => { inp.focus(); inp.select(); }, 0); }
    return;
  }
  sec.mats[i] = { slot, adet: 1 }; ciz();
}
function adetOnay() {
  const b = bekleyenAdet; K.show('Input_count', false); bekleyenAdet = null; if (!b) return;
  const n = Math.min(b.kalan, Math.max(0, parseInt(K.get('edit_input')?.querySelector('input')?.value, 10) || 0));
  if (n > 0 && sec.mats[b.i] == null) { sec.mats[b.i] = { slot: b.slot, adet: n }; ciz(); }
}
const temizle = () => { sec.mats.fill(null); sec.sonuc = null; bekleyenAdet = null; K?.show('Input_count', false); ipucuKapat(); };
const yuva = (el, it) => { if (el) el.innerHTML = it ? iconHtml(it, el.offsetWidth || 43) : ''; };
function ciz() {
  const L = K; if (!L) return; const b = bag();
  sec.mats = sec.mats.map((m) => (m && b.get(m.slot) ? m : null));
  for (let i = 0; i < 28; i++) {
    const s = 14 + i, e = b.get(s), kalan = e ? (Number(e.row.count) || 1) - yerlesen(s) : 0;
    yuva(L.get('a_slot_' + i), e && kalan > 0 ? e.it : null);
    L.get('a_slot_' + i)?.classList.toggle('komb-disi', !!e && kalan > 0 && !malzemeMi(e));   // tariflerde olmayan eşya soluk
    L.text('s_count_' + i, e && kalan > 0 && Number(e.it.Countable) > 0 && kalan > 1 ? String(kalan) : '');
  }
  for (let i = 0; i < 11; i++) {
    const m = sec.mats[i], e = m ? b.get(m.slot) : null;
    yuva(L.get('area_m_' + i), e?.it);
    L.text('m_count_' + i, e && Number(e.it.Countable) > 0 ? String(m.adet) : '');
  }
  yuva(L.get('area_m_result'), sec.sonuc?.it);
  L.text('m_count_result', sec.sonuc && sec.sonuc.adet > 1 ? String(sec.sonuc.adet) : '');
  L.text('text_gold', noah(gold));
}
async function birlestir() {
  if (mesgul) return;
  const mats = sec.mats.filter(Boolean);
  if (!mats.length) return ctx.hud.notice?.('Please select the type of combination item', 'ors-uyari');
  const git = async () => {
    mesgul = true; K.el.classList.add('ors-mesgul');
    try {
      const { data, error } = await ctx.sb.rpc('uretim_yap', { p_char: ctx.character.id, p_mats: mats });
      if (error || !data?.ok) return ctx.hud.notice?.(error?.message || data?.mesaj || 'Combination failed.', 'ors-uyari');
      gold = data.gold ?? gold; ctx.state.combat?.odulUygula?.({ gold });
      ctx.state.efekt?.(data.basari ? 10101 : 10100, ctx.state.player?.position);
      sec.mats.fill(null);
      if (data.basari) { const [it] = await esyalar([data.num]); sec.sonuc = { it, adet: data.adet || 1 }; ctx.hud.info?.(data.mesaj, 'ors'); }
      else { sec.sonuc = null; ctx.hud.info?.(data.mesaj, 'ors-yok'); }
      await ctx.state.inv?.reload?.();
    } finally { mesgul = false; K?.el.classList.remove('ors-mesgul'); ciz(); }
  };
  const soru = 'Do you want to combine the items?\nThe materials will be lost if the combination fails.';
  if (ctx.hud.soru?.('Item Combination', soru, git) === false) { if (confirm(soru)) git(); }
}
function kapatK() { if (!K) return; temizle(); K.el.hidden = true; K.el.classList.remove('komb-acik'); }
const acikK = () => K && !K.el.hidden;

/** arayüz paketini ve eşya verisini önceden yükle (Shozin menüsü açılınca) */
export function onYukle(o) { ctx ||= o; return hazirla(o).catch(() => false); }
export async function kombinasyonAc(o) {
  if (!(await hazirla(o))) return o.hud.notice?.('Could not load the combination interface.', 'ors-uyari');
  if (!K) {
    K = kurK();
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && acikK() && !mesgul) { if (B && !B.el.hidden) return; e.stopImmediatePropagation(); kapatK(); }
      if (e.code === 'KeyI' && acikK() && e.target.tagName !== 'INPUT') { e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
  }
  envanterKapat(); temizle();
  // KO: pencere ekranın sağından gelir
  const el = K.el; el.hidden = false; el.style.zIndex = ''; el.style.left = el.style.top = ''; el.style.right = el.style.bottom = '';
  yanAcildi(el, 'sag', kapatK);
  el.classList.remove('komb-acik'); void el.offsetWidth; requestAnimationFrame(() => el.classList.add('komb-acik'));
  ciz();
  const [g] = await Promise.all([ctx.sb.from('characters').select('gold').eq('id', ctx.character.id).maybeSingle(), ctx.state.inv?.reload?.(), malzemeYukle()]);
  gold = g?.data?.gold ?? gold; ciz();
}

// ───────────────────────── Pathos kitabı (Combination Method)
// KO akışı: kapak (Pathos / Stand Book of Transformation · OPEN) → 1. sayfa: "Pathos' Letter Book of Change" giriş metni →
// 2. sayfa: "Compounding Item Class" sınıf listesi (5 satır görünür, kaydırma çubuğu, seçili satır çerçeveli ve sarı) →
// 3. sayfa: seçili sınıfın tarifleri (sonuç, malzemeler, şans, Noah; oklarla tarifler arasında).
const GIRIS = "Pathos's epic...\n With God of regulration - Logos's will, the world has been created\n every creature has been devoted to God - Logos..\n\nBut time has slipped along, Shamanism was arosen to the creatures\n and the creatures has been against to Logos's rule..\n To being devoted to Pathos - God of Revolution -\narosen by Shamanism, all the creatures try out";
const SILUET = '<svg class="pt-siluet" viewBox="0 0 32 32"><defs><radialGradient id="ptg" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#6a3cc8"/><stop offset="1" stop-color="#1a0a3a"/></radialGradient></defs><rect width="32" height="32" fill="url(#ptg)"/><g fill="#2a0c1a" stroke="#c9a2ff" stroke-width=".9"><circle cx="16" cy="7" r="3.2"/><path d="M11 11h10l5 7-1.6 1.2-4.4-4.4.6 7.2 1.8 8.5h-2.6L16 22.4l-3.8 8.1H9.6l1.8-8.5.6-7.2-4.4 4.4L6 18z"/></g></svg>';
let siniflar = [], tarifler = [], ust = 0, secSinif = null, secTarif = 0;
const GORUNUR = 5;
const sinifTarifleri = () => tarifler.filter((t) => Number(t.sinif) === Number(secSinif?.id) && t.kitap !== false);   // kitapta yalnız KO'da görünen (mixtable 5. sütun) tarifler; gizliler yalnız birleştirmede
function kurB() {
  const L = buildLayout('co_combinationmethod', { className: 'ko-pathos ko-pencere kui-dokulu' });
  katman().append(L.el);   // KO: Item Combination penceresinin solunda sabit (envanter gibi), sürüklenmez
  L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  L.show('img_effect', false);
  const tik = (el, fn) => { if (el) { el.classList.add('kui-tik'); el.style.pointerEvents = 'auto'; el.onclick = (e) => { e.stopPropagation(); fn(); }; } };
  const q = (taban, id) => L.get(taban)?.querySelector(`[data-id="${id}"]`);
  // sayfa başlık şeridi: "Pathos' book   Book of Transformation"
  for (const b of ['base_intro', 'base_list', 'base_extra']) {
    const t = L.get(b); if (!t) continue;
    [...t.querySelectorAll(':scope > .kui-img')].filter((e) => { const y = parseInt(e.style.top); return y > 20 && y < 60; }).forEach((e) => (e.hidden = true));
    t.insertAdjacentHTML('beforeend', `<div class="pt-baslik">Pathos' book&nbsp;&nbsp;&nbsp;Book of Transformation</div>`);
  }
  // kapak
  const kapak = L.get('base_main');
  kapak?.querySelectorAll(':scope > .kui-tx').forEach((t) => { t.textContent = 'Stand Book\nof Transformation'; t.classList.add('pt-alt'); });
  tik(kapak?.querySelector('[data-id="btn_next"]'), () => goster('intro'));
  // 1. sayfa: giriş
  const gi = L.get('base_intro');
  const gm = q('base_intro', 'text_contents'); if (gm) { gm.textContent = GIRIS; gm.classList.add('pt-giris'); }
  const gt = q('base_intro', 'text_title'); if (gt) { gt.textContent = "Pathos' Letter Book of Change"; gt.classList.add('pt-baslik2'); }
  const gp = q('base_intro', 'text_page'); if (gp) { gp.textContent = '1'; gp.classList.add('pt-no'); }
  tik(q('base_intro', 'btn_next'), () => goster('list'));
  void gi;
  // 2. sayfa: sınıf listesi
  const lt = q('base_list', 'text_title'); if (lt) { lt.textContent = 'Compounding Item Class'; lt.classList.add('pt-baslik2'); }
  const lp = q('base_list', 'text_page'); if (lp) { lp.textContent = '2'; lp.classList.add('pt-no'); }
  for (let i = 0; i <= 4; i++) { const m = q('base_list', 'text_uimsg' + i); if (m) m.hidden = true; }
  tik(q('base_list', 'btn_prev'), () => goster('intro'));
  tik(q('base_list', 'btn_next'), () => { if (secSinif) { secTarif = 0; goster('extra'); } });
  for (let i = 0; i < GORUNUR; i++) for (const id of ['area_icon' + i, 'text_name' + i]) {
    const e = q('base_list', id); if (!e) continue; e.classList.add('pt-satir'); e.style.pointerEvents = 'auto';
    e.addEventListener('click', (ev) => { ev.stopPropagation(); const c = siniflar[ust + i]; if (!c) return; secSinif = c; secTarif = 0; goster('extra'); });   // sınıfa basınca o sınıfın eşya listesi
    e.addEventListener('dblclick', (ev) => { ev.stopPropagation(); const c = siniflar[ust + i]; if (c) { secSinif = c; secTarif = 0; goster('extra'); } });
  }
  // kaydırma çubuğu: ▲ ▼ düğmeleri, tekerlek, iz üzerinde tıklama
  const sc = q('base_list', 'scroll');
  if (sc) {
    const [yukari, asagi] = sc.querySelectorAll(':scope > .kui-btn');
    tik(yukari, () => kaydir(-1)); tik(asagi, () => kaydir(1));
    const iz = sc.querySelector(':scope > .kui-tr'); if (iz) { iz.style.pointerEvents = 'auto'; iz.addEventListener('click', (e) => { const r = iz.getBoundingClientRect(); kaydir((e.clientY - r.top) / r.height < 0.5 ? -GORUNUR : GORUNUR); }); }
  }
  L.get('base_list')?.addEventListener('wheel', (e) => { e.preventDefault(); kaydir(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  // 3. sayfa: tarif ayrıntısı (orijinal örnek öğeler gizlenir)
  const ek = L.get('base_extra');
  ek?.querySelectorAll(':scope > .kui-tx, :scope > .kui-ar, :scope > .kui-sc').forEach((e) => (e.hidden = true));
  ek?.querySelectorAll(':scope > .kui-img').forEach((e, i) => { if (i === 0) return; const x = parseInt(e.style.left); if (x === 298) e.hidden = true; if (x === 143) e.hidden = true; });   // tek sonuç çerçevesi yerine eşya listesi
  const [ekSonra, ekOnce] = ek ? [...ek.querySelectorAll(':scope > .kui-btn')] : [];
  tik(ekSonra, () => { const n = sinifTarifleri().length; if (secTarif < n - 1) { secTarif++; ekCiz(); } });
  tik(ekOnce, () => goster('list'));   // önceki sayfa: sınıf listesi
  ek?.insertAdjacentHTML('beforeend', '<div class="pt-sinif2"></div><div class="pt-esyalar"></div><div class="pt-gerek-baslik">Required items</div><div class="pt-gerek"></div><div class="pt-bilgi"></div><div class="pt-no pt-sayfa">3</div>');
  // eşya listesi: satıra basınca o eşyanın gerekenleri altta simge olarak (sırasıyla) görünür
  ek?.querySelector('.pt-esyalar')?.addEventListener('click', (ev) => { const r = ev.target.closest('[data-i]'); if (!r) return; ev.stopPropagation(); secTarif = Number(r.dataset.i); ekCiz(); });
  ek?.querySelector('.pt-esyalar')?.addEventListener('wheel', (ev) => ev.stopPropagation(), { passive: true });
  L.click('btn_close', () => { L.el.hidden = true; ipucuKapat(); });
  L.el.addEventListener('pointermove', (ev) => {
    const s = ev.target.closest('[data-num]'); if (!s) return ipucuKapat();
    const it = IT.get(Number(s.dataset.num)); if (it) ipucu(tooltipHtml(it), ev); else ipucuKapat();
  });
  L.el.addEventListener('pointerleave', ipucuKapat);
  return L;
}
function kaydir(d) { const enCok = Math.max(0, siniflar.length - GORUNUR); const y = Math.max(0, Math.min(enCok, ust + d)); if (y !== ust) { ust = y; listeCiz(); } }
function goster(k) {
  for (const n of ['main', 'intro', 'list', 'extra']) B.show('base_' + n, n === k);
  if (k === 'list') listeCiz();
  if (k === 'extra') ekCiz();
}
async function listeCiz() {
  const liste = B.get('base_list'), lb = (id) => liste.querySelector(`[data-id="${id}"]`);
  await esyalar(siniflar.map((c) => c.ikon).filter(Boolean));
  for (let i = 0; i < GORUNUR; i++) {
    const c = siniflar[ust + i], ic = lb('area_icon' + i), ad = lb('text_name' + i);
    if (ic) { const it = c?.ikon ? IT.get(Number(c.ikon)) : null; ic.innerHTML = c ? (it ? iconHtml(it, 32) : SILUET) : ''; }
    if (ad) { ad.textContent = c ? c.ad : ''; ad.classList.toggle('pt-secili', !!c && c === secSinif); }
  }
  if (!siniflar.length) { const a = lb('text_name0'); if (a) a.textContent = 'There is no compounding item class yet.'; }
  // seçili satır çerçevesi (KO base_line)
  const cer = lb('base_line'), si = secSinif ? siniflar.indexOf(secSinif) - ust : -1;
  if (cer) { cer.hidden = !(si >= 0 && si < GORUNUR); if (!cer.hidden) cer.style.transform = `translateY(${[0, 63, 123, 183, 243][si]}px)`; }
  // kaydırma tutamağı
  const sc = lb('scroll'), iz = sc?.querySelector(':scope > .kui-tr'), tut = iz?.querySelectorAll(':scope > .kui-img')[1];
  if (tut) { const enCok = Math.max(0, siniflar.length - GORUNUR), alan = 277 - 42; tut.style.top = (enCok ? Math.round(ust / enCok * alan) : 0) + 'px'; }
}
async function ekCiz() {
  const ek = B.get('base_extra'); if (!ek) return;
  const L = sinifTarifleri(), t = L[secTarif];
  ek.querySelector('.pt-sinif2').textContent = secSinif?.ad || '';
  const liste = ek.querySelector('.pt-esyalar'), gerek = ek.querySelector('.pt-gerek'), bilgi = ek.querySelector('.pt-bilgi'), gb = ek.querySelector('.pt-gerek-baslik');
  if (!L.length) { liste.innerHTML = '<div class="pt-bos">There is no formula in this class yet.</div>'; gerek.innerHTML = ''; bilgi.textContent = ''; gb.hidden = true; return; }
  gb.hidden = false;
  await esyalar([...L.map((x) => x.sonuc), ...t.malzeme.map((m) => m.num)]);
  // sınıftaki eşyalar: simge + ad, seçili satır vurgulu
  liste.innerHTML = L.map((x, i) => `<div class="pt-es${i === secTarif ? ' pt-es-sec' : ''}" data-i="${i}"><span class="pt-es-ik" data-num="${x.sonuc}">${IT.get(Number(x.sonuc)) ? iconHtml(IT.get(Number(x.sonuc)), 32) : ''}${x.sonuc_adet > 1 ? `<b>${x.sonuc_adet}</b>` : ''}</span><span class="pt-es-ad">${esc(x.ad || IT.get(Number(x.sonuc))?.strName || x.sonuc)}</span></div>`).join('');
  liste.querySelector('.pt-es-sec')?.scrollIntoView({ block: 'nearest' });
  // seçili eşyanın gerekenleri: simgeler sırasıyla, adet sağ altta
  gerek.innerHTML = t.malzeme.map((m) => `<span class="pt-g" data-num="${m.num}">${IT.get(Number(m.num)) ? iconHtml(IT.get(Number(m.num)), 32) : '<span class="ko-yuva"></span>'}${m.adet > 1 ? `<b>${m.adet}</b>` : ''}</span>`).join('');
  bilgi.innerHTML = t.aciklama ? esc(t.aciklama) : '';   // Noah ve başarı oranı kitapta yazmaz (istek)
}
export async function uretimKitabi(o) {
  if (o.uretim) return kombinasyonAc(o);
  if (!(await hazirla(o)) || !hasLayout('co_combinationmethod')) return o.hud.notice?.('Could not load the book.', 'ors-uyari');
  if (!B) {
    B = kurB();
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && B && !B.el.hidden) { e.stopImmediatePropagation(); B.el.hidden = true; ipucuKapat(); } }, true);
  }
  // supabase sorgusu yalnız then'li (catch yok): .catch() çağrısı hata verip kitabın hiç açılmamasına yol açıyordu
  let data = null; try { ({ data } = await o.sb.rpc('uretim_liste')); } catch {}
  siniflar = Array.isArray(data?.siniflar) ? data.siniflar : []; tarifler = Array.isArray(data?.tarifler) ? data.tarifler : [];
  ust = 0; secSinif = null; secTarif = 0;
  goster('main');
  const el = B.el; el.style.zIndex = ''; el.style.left = el.style.top = '';
  const sol = !acikK();
  el.classList.toggle('pt-sol', sol);   // Shozin 5. menüsü (Check Manufacturing recipe): ekranın solunda; Formula: Item Combination penceresinin solunda
  if (sol) return solaYasla(el);
  el.style.translate = ''; el.style.transition = '';
  el.classList.remove('pt-acik'); el.hidden = false; void el.offsetWidth; el.classList.add('pt-acik');   // Item Combination penceresinin solundan kayarak çıkar
}

// KO Karakter Bilgisi (hud yanaYasla 'sol') ile aynı: görünen içerik ekranın sol kenarına yaslanır, pencere genişliği kadar soldan kayarak gelir
function solaYasla(el) {
  yanAcildi(el, 'sol', () => { el.hidden = true; ipucuKapat(); });
  el.classList.add('pt-acik'); el.style.transition = 'none'; el.style.translate = '0 0'; el.style.setProperty('--pt-sol', '0px'); el.hidden = false;
  const kutu = () => { let mn = Infinity, mx = -Infinity; for (const c of el.querySelectorAll('.kui-img')) { if (c.offsetParent === null) continue; const r = c.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; mn = Math.min(mn, r.left); mx = Math.max(mx, r.right); } return [mn, mx]; };   // görünen dokular (sayfa kutusu kitabın solunda boşluk içerir)
  const [mn, mx] = kutu(); if (!Number.isFinite(mn)) return;
  const k = (el.getBoundingClientRect().width / (el.offsetWidth || 1)) || 1;
  el.style.setProperty('--pt-sol', (-mn / k) + 'px');
  el.style.translate = `${-((mx - mn) / k + 24)}px 0`;
  void el.offsetWidth;
  el.style.transition = 'translate .24s cubic-bezier(.2,.8,.3,1)'; el.style.translate = '0 0';
}
