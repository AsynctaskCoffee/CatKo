// KO Item Seal penceresi (deadsoft 2369 re_item_seal): Inn Hostess'te eşya kilitleme / kilit açma.
// Yerleşim: solda "Seal gerekli" yuvası (area_upgrade: Sealed Item), ortada üç yuva (area_item0: eşya, area_item1: Sealed Item,
// area_item2 kullanılmaz: yerinde Noah simgesi + ücret), sağda sonuç yuvası (area_result: kilitli hâli), "Enter Your Secret Answer" parola satırı (str_id),
// Onayla / İptal, pencere içi çanta (a_slot_0..27) ve Noah (text_gold).
// Kurallar sunucuda: esya_kilitle (eşya + Sealed Item + parola, 10.000.000 Noah) / esya_kilit_ac (parola).
import { hasLayout, buildLayout, draggable, ekUI, findSprite, paintSprite } from './kui.js';
import { loadMeta, iconHtml, tooltipHtml, fromDb } from './esya.js';

export const SEALED_ITEM = 810890000;
export const KILIT_KIND = new Set([11, 21, 22, 31, 32, 41, 42, 51, 52, 60, 63, 70, 71, 110, 140, 181, 91, 92, 93, 94, 200, 210, 220, 230, 240]);
export const KILIT_UCRET = 10000000;
const noah = (n) => Number(n || 0).toLocaleString('tr-TR');
const adK = (s) => String(s || '').replace(/\s*\(\+?\d+\)\s*$/, '');

export async function sealHazir() { return (await ekUI('seal')) && hasLayout('re_item_seal'); }

export function initSeal({ sb, character, hud, state }) {
  const layer = () => document.getElementById('kohud') || document.body;
  const bag = () => state.inv?.items || new Map();
  const IT = new Map();
  const esyaAl = async (num) => {
    if (IT.has(num)) return IT.get(num);
    const { data } = await sb.from('items').select('*').eq('num', num).maybeSingle();
    const it = data ? fromDb(data) : null; IT.set(num, it); return it;
  };
  let pen = null, npc = null, ac = false, mesgul = false, gold = 0, sealIt = null, parola = null;
  const sec = { esya: null, seal: null };
  const kullanilan = (s) => sec.esya === s || sec.seal === s;
  const kilitli = (s) => !!bag().get(s)?.row?.kilit;

  let tip = null;
  const ipucu = (html, ev) => {
    tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu ko-tic-ipucu' });
    if (!tip.isConnected) document.body.append(tip);
    tip.innerHTML = html;
    tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, ev.clientX + 16) + 'px';
    tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, ev.clientY - 10)) + 'px';
  };
  const ipucuKapat = () => tip?.remove();
  const envanterKapat = () => { try { if (hud.invOpen) hud.panel?.('envanter'); } catch {} };

  function kur() {
    const L = buildLayout('re_item_seal', { className: 'ko-seal ko-pencere kui-dokulu' });
    layer().append(L.el); draggable(L, 44);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    L.el.addEventListener('keydown', (e) => e.stopPropagation());
    L.el.addEventListener('contextmenu', (e) => e.preventDefault());
    L.show('group_fx', false);
    // re_item_seal.dxt bulunamazsa (ör. eski paket) yan sütun örtüleri ve parola çubuğu CSS ile çizilir
    L.el.querySelectorAll(':scope > .kui-img').forEach((e) => {
      if (e.style.backgroundImage) return;
      e.classList.add(e.offsetHeight > 100 || parseInt(e.style.height) > 100 ? 'seal-ortu' : 'seal-cubuk');
    });
    for (let i = 0; i < 28; i++) { const a = L.get('a_slot_' + i); if (a) { a.dataset.cs = 14 + i; a.classList.add('seal-yuva'); } }
    for (const id of ['area_upgrade', 'area_item0', 'area_item1', 'area_item2', 'area_result']) L.get(id)?.classList.add('seal-yuva', 'seal-ust');
    for (const id of ['area_item0', 'area_item1']) L.get(id)?.setAttribute('data-esya-birak', '1');
    // parola satırı
    L.text('str_finname', '');
    parola = L.input('str_id', { type: 'password', maxLength: 12, autocomplete: 'new-password', placeholder: '' });
    parola?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') onayla(); else if (e.key === 'Escape') kapat(); });
    // ücret satırı: Noah simgesi + tutar (KO: parola satırının üstünde)
    const u = document.createElement('div'); u.className = 'seal-ucret'; u.innerHTML = '<i class="seal-noah"></i><b></b>'; u.title = 'Kilitleme ücreti';
    { const sp = findSprite('re_inventory', 'btn_gold'), ik = u.querySelector('.seal-noah'); if (sp != null) paintSprite(ik, sp, 20, 22); else ik.classList.add('seal-noah-yedek'); }
    L.el.append(u);
    L.click('btn_close', kapat);
    L.click('btn_cancel', () => { if (mesgul) return; sec.esya = null; sec.seal = null; if (parola) parola.value = ''; ciz(); });
    L.click('btn_ok', onayla);
    // tık / sağ tık: çantadan yuvaya, yuvadan çantaya
    L.el.addEventListener('click', (ev) => {
      if (mesgul) return;
      const a = ev.target.closest('.seal-yuva'); if (!a) return;
      if (a.dataset.cs) return koy(Number(a.dataset.cs));
      if (a.dataset.id === 'area_item0') { sec.esya = null; ciz(); }
      else if (a.dataset.id === 'area_item1') { sec.seal = null; ciz(); }
    });
    L.el.addEventListener('contextmenu', (ev) => { const a = ev.target.closest('.seal-yuva'); if (a) a.click(); });
    // pencere içi sürükle-bırak
    let sur = null;
    L.el.addEventListener('pointerdown', (ev) => {
      const a = ev.target.closest('.seal-yuva[data-cs]'); if (!a || mesgul || ev.button !== 0) return;
      const sl = Number(a.dataset.cs); if (!bag().get(sl) || kullanilan(sl)) return;
      sur = { sl, x: ev.clientX, y: ev.clientY, g: null };
    });
    addEventListener('pointermove', (ev) => {
      if (!sur) return;
      if (!sur.g && Math.hypot(ev.clientX - sur.x, ev.clientY - sur.y) > 5) { sur.g = document.createElement('div'); sur.g.className = 'ors-hayalet'; sur.g.innerHTML = iconHtml(bag().get(sur.sl).it, 40); document.body.append(sur.g); }
      if (sur.g) { sur.g.style.left = ev.clientX - 20 + 'px'; sur.g.style.top = ev.clientY - 20 + 'px'; }
    });
    addEventListener('pointerup', (ev) => {
      if (!sur) return; const d = sur; sur = null; if (!d.g) return; d.g.remove();
      const h = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest?.('.seal-ust')).find(Boolean);
      if (h) koy(d.sl, h);
    });
    // ana envanterden bırakma
    L.el.addEventListener('ko-esya-birak', (ev) => { const d = ev.detail || {}; if (d.slot >= 14 && d.slot <= 41) koy(d.slot, ev.target.closest?.('.seal-ust')); });
    L.el.addEventListener('pointermove', (ev) => {
      const a = ev.target.closest('.seal-yuva'); if (!a) return ipucuKapat();
      const id = a.dataset.id;
      if (id === 'area_upgrade') return sealIt ? ipucu(tooltipHtml(sealIt) + '<div class="ti-s">Kilitlemek için 1 adet Sealed Item gerekir ([Vendor] Kayra: Seal Exchange Voucher).</div>', ev) : ipucuKapat();
      const s = a.dataset.cs ? Number(a.dataset.cs) : id === 'area_item0' || id === 'area_result' ? sec.esya : id === 'area_item1' ? sec.seal : null;
      const e = s != null && !(a.dataset.cs && kullanilan(s)) ? bag().get(s) : null;
      if (!e) return ipucuKapat();
      ipucu(tooltipHtml(e.it, { count: e.row.count, sure: { kilit: !!e.row.kilit || id === 'area_result' } }), ev);
    });
    L.el.addEventListener('pointerleave', ipucuKapat);
    return L;
  }

  function koy(slot, hedef = null) {
    const e = bag().get(slot); if (!e || kullanilan(slot)) return;
    const sealMi = Number(e.row.item_num) === SEALED_ITEM, hid = hedef?.dataset?.id;
    if (ac) {
      if (sealMi) return hud.notice?.('A Sealed Item is not required to lift the seal.', 'hata');
      if (!kilitli(slot)) return hud.notice?.('This item is not sealed.', 'hata');
      sec.esya = slot; return ciz();
    }
    if (sealMi) { if (hid && hid !== 'area_item1' && hid !== 'area_upgrade') return hud.notice?.('The Sealed Item goes in the seal slot.', 'hata'); sec.seal = slot; return ciz(); }
    if (hid === 'area_item1') return hud.notice?.('Only a Sealed Item can be placed in the seal slot.', 'hata');
    if (kilitli(slot)) return hud.notice?.('This item is already sealed.', 'hata');
    if (!KILIT_KIND.has(Number(e.it.Kind)) || Number(e.it.Countable) > 0) return hud.notice?.('Only weapons, shields, armor and accessories can be sealed.', 'hata');
    sec.esya = slot; ciz();
  }

  const yuvaCiz = (el, it, cls = '') => { if (!el) return; el.innerHTML = it ? iconHtml(it, el.offsetWidth || 43) : ''; el.className = el.className.replace(/\s*seal-(soluk|kirmizi)/g, '') + (it && cls ? ' ' + cls : ''); };
  function ciz() {
    const L = pen; if (!L) return;
    const b = bag();
    if (sec.esya != null && !b.get(sec.esya)) sec.esya = null;
    if (sec.seal != null && !b.get(sec.seal)) sec.seal = null;
    for (let i = 0; i < 28; i++) {
      const s = 14 + i, e = b.get(s), a = L.get('a_slot_' + i);
      const kalan = e ? (e.row.count || 1) - (sec.seal === s ? 1 : 0) : 0;
      const gizli = !e || sec.esya === s || kalan <= 0;
      yuvaCiz(a, gizli ? null : e.it, !gizli && e.row.kilit ? 'seal-kirmizi' : '');
      L.text('s_count_' + i, !gizli && Number(e.it.Countable) > 0 && kalan > 1 ? String(kalan) : '');
    }
    const E = sec.esya != null ? b.get(sec.esya) : null;
    yuvaCiz(L.get('area_item0'), E?.it || null, E?.row.kilit ? 'seal-kirmizi' : '');
    yuvaCiz(L.get('area_item1'), ac ? null : sec.seal != null ? b.get(sec.seal)?.it : null);
    yuvaCiz(L.get('area_upgrade'), ac ? null : sealIt, sec.seal == null ? 'seal-soluk' : '');
    yuvaCiz(L.get('area_result'), E?.it || null, ac ? 'seal-soluk' : 'seal-kirmizi');
    L.show('area_item2', false);   // ücret yuvası yok: yalnız Noah simgesi + tutar (seal-ucret)
    for (const id of ['area_upgrade', 'area_item1']) L.show(id, !ac);
    const u = L.el.querySelector('.seal-ucret'); if (u) { u.hidden = ac; u.querySelector('b').textContent = noah(KILIT_UCRET); u.classList.toggle('yetersiz', gold < KILIT_UCRET); }
    L.text('text_gold', noah(gold));
  }

  async function onayla() {
    if (mesgul) return;
    const p = parola?.value || '';
    if (sec.esya == null) return hud.notice?.('Place an item in the item slot.', 'hata');
    if (!ac && sec.seal == null) return hud.notice?.('Place a Sealed Item in the seal slot.', 'hata');
    if (p.length < 4 || p.length > 12) return hud.notice?.('The password must be 4–12 characters.', 'hata');
    if (!ac && gold < KILIT_UCRET) return hud.notice?.(`You need ${noah(KILIT_UCRET)} Noah to seal an item.`, 'hata');
    mesgul = true; pen.el.classList.add('seal-mesgul');
    try {
      const E = bag().get(sec.esya);
      const { data: r, error } = ac
        ? await sb.rpc('esya_kilit_ac', { p_char: character.id, p_npc: npc.id, p_slot: sec.esya, p_parola: p })
        : await sb.rpc('esya_kilitle', { p_char: character.id, p_npc: npc.id, p_slot: sec.esya, p_seal_slot: sec.seal, p_parola: p });
      if (error || r?.ok === false) return hud.notice?.(error?.message || r?.reason || 'The operation failed.', 'hata');
      if (ac) hud.info?.(`The seal on ${adK(r?.ad || E?.it?.strName)} has been lifted.`, 'beceri');
      else {
        hud.info?.(`${adK(r?.ad || E?.it?.strName)} has been sealed (−${noah(r?.ucret ?? KILIT_UCRET)} Noah). The seal can only be lifted with this password.`, 'seviye');
        if (r?.gold != null) { gold = r.gold; try { state.combat?.applyStats?.({ gold: r.gold }); } catch {} }
      }
      sec.esya = null; sec.seal = null; if (parola) parola.value = '';
      await state.inv?.reload?.(); try { state.inv?.stats?.(); } catch {}
      ciz();
    } finally { mesgul = false; pen?.el.classList.remove('seal-mesgul'); }
  }

  function ortala(el) {
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect(), z = r.width / (el.offsetWidth || r.width) || 1;
      el.style.left = Math.max(0, (innerWidth - r.width) / 2 / z) + 'px'; el.style.top = Math.max(0, (innerHeight - r.height) / 2 / z) + 'px';
    });
  }
  async function ac_(n, acMi) {
    await loadMeta().catch(() => {});
    if (!(await sealHazir())) return false;
    npc = n; ac = !!acMi;
    pen ||= kur();
    envanterKapat();
    sec.esya = null; sec.seal = null; if (parola) parola.value = '';
    const baslik = [...pen.el.querySelectorAll(':scope > .kui-tx')].find((e) => /seal/i.test(e.textContent) || e.dataset.baslik);
    if (baslik) { baslik.dataset.baslik = '1'; baslik.textContent = ac ? 'Eşya Kilidi Aç' : 'Eşya Kilitleme'; }
    pen.text('str_label', 'Kilit parolasını gir');
    for (const b of pen.el.querySelectorAll('[data-id="btn_ok"] .kui-tx')) b.textContent = 'Onayla';
    for (const b of pen.el.querySelectorAll('[data-id="btn_cancel"] .kui-tx')) b.textContent = 'İptal';
    pen.el.hidden = false; pen.el.style.zIndex = 60; ortala(pen.el);
    ciz();
    const [g] = await Promise.all([sb.from('characters').select('gold').eq('id', character.id).maybeSingle(), state.inv?.reload?.(), esyaAl(SEALED_ITEM).then((it) => (sealIt = it))]);
    gold = g?.data?.gold ?? gold;
    ciz(); setTimeout(() => parola?.focus(), 50);
    return true;
  }
  function kapat() { if (pen) { sec.esya = null; sec.seal = null; if (parola) parola.value = ''; pen.el.hidden = true; } ipucuKapat(); }
  const acik = () => !!pen && !pen.el.hidden;
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && acik() && !mesgul) kapat(); });
  // pencere dışına tıklanınca kapanır (KO mesaj kutusu, ipucu ve sürükleme hayaleti hariç)
  addEventListener('pointerdown', (e) => {
    if (!acik() || mesgul) return;
    const t = e.target; if (!(t instanceof Element)) return;
    if (pen.el.contains(t) || t.closest('.ko-ipucu, .ors-hayalet, .inv-hayalet')) return;
    const kok = t.closest('.kui-root'); if (kok && kok.querySelector('[data-id="Btn_Yes"], [data-id="Btn_Ok"]')) return;
    kapat();
  }, true);
  // pencere açıkken oyuncu envanteri açılmaz (pencere kendi çantasını gösterir)
  addEventListener('keydown', (e) => { if (e.code === 'KeyI' && acik() && e.target.tagName !== 'INPUT') { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  return { kilitle: (n) => ac_(n, false), kilitAc: (n) => ac_(n, true), kapat, acik };
}
