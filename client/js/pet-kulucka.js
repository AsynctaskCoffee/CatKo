// KO [Familiar Tamer] Kate → "Familiar Hatching and transform": orijinal re_pet_quest.uif penceresi (assets/ui/petkulucka, tools/uif2kui.py).
// Ekranın sağından kayarak gelir. Sol yuva (area_upgrade): Kaul yumurtası (Kind 150) ya da pet (Kind 151); ortadaki yuvalar (area_item0-2):
// dönüşüm parşömeni (Kind 171). Yumurta konunca "Name your Familiar please" + ad kutusu açılır → Confirm: pet_kulucka. Pet + parşömen → pet_gorunum_degis.
// Alttaki 7×4 ızgara çantanın kopyası (yuva 14-41): tıkla / sağ tık / sürükle → uygun yuvaya; yuvadaki eşyaya tıklayınca çantaya döner.
import { ekUI, hasLayout, buildLayout } from './kui.js';
import { iconHtml, tooltipHtml, fromDb } from './esya.js';
import { toFront } from './ko-pencere.js';
import { yanAcildi } from './yan-pencere.js';

let W = null;
export async function petKuluckaAc({ sb, character, hud, state }) {
  if (!(await ekUI('petkulucka').catch(() => false)) || !hasLayout('re_pet_quest')) { hud.notice?.('Could not load the Familiar window.', 'hata'); return false; }
  W?.kapat?.();
  const L = buildLayout('re_pet_quest', { className: 'ko-pet-kulucka kui-dokulu' });
  const kok = document.getElementById('kohud') || document.body; kok.append(L.el);
  L.el.style.pointerEvents = 'auto';
  L.show('group_fx', false); L.text('str_finname', '');
  const etiket = L.get('str_label'), adKutu = L.get('edit_name');
  const inp = L.input('edit_name', { maxLength: 15, placeholder: '' }); adKutu?.querySelectorAll(':scope > .kui-tx').forEach((t) => t.remove());   // orijinal Korece örnek yazı
  const bag = () => state.inv?.items || new Map();
  const S = { sol: null, orta: null, sonuc: null };   // { slot, e } · sonuc: { it, ad } (onaydan sonra sonuç yuvasında çıkan pet)
  const tur = (e) => Number(e?.it?.Kind) || 0;
  const rpc = async (ad, arg) => { const { data, error } = await sb.rpc(ad, { p_char: character.id, ...arg }); if (error) throw new Error(error.message); return data; };
  const kapat = () => { L.el.classList.remove('pk-acik'); ipucuKapat(); setTimeout(() => L.el.remove(), 230); if (W?.L === L) W = null; };
  W = { L, kapat };
  let tip = null; const ipucuKapat = () => { tip?.remove(); tip = null; };
  const ciz = () => {
    for (let i = 0; i < 28; i++) {
      const a = L.get('a_slot_' + i); if (!a) continue; const sl = 14 + i, e = bag().get(sl);
      const kullanildi = (S.sol?.slot === sl) || (S.orta?.slot === sl);
      a.innerHTML = e?.it && !kullanildi ? iconHtml(e.it, 43) : ''; a.dataset.sl = sl;
      const n = Number(e?.row?.count) || 0; L.text('s_count_' + i, e?.it && !kullanildi && n > 1 ? String(n) : '');
    }
    const yuva = (id, x) => { const a = L.get(id); if (a) a.innerHTML = x?.e?.it ? iconHtml(x.e.it, 43) : ''; };
    yuva('area_upgrade', S.sol); yuva('area_item1', S.orta); yuva('area_item0', null); yuva('area_item2', null);
    { const a = L.get('area_result'); if (a) a.innerHTML = S.sonuc?.it ? iconHtml(S.sonuc.it, 43) : ''; L.text('str_finname', S.sonuc?.ad || ''); }
    const yumurta = tur(S.sol?.e) === 150;
    if (etiket) etiket.hidden = !yumurta; if (adKutu) adKutu.hidden = !yumurta;
    if (yumurta) setTimeout(() => inp?.focus(), 30); else if (inp) inp.value = '';
    L.text('text_gold', Number(state.combat?.stats?.gold ?? character.gold ?? 0).toLocaleString('en-US'));
  };
  const koy = (sl) => {
    const e = bag().get(sl); if (!e?.it) return;
    const k = tur(e);
    S.sonuc = null;
    if (k === 150 || k === 151) { S.sol = { slot: sl, e }; if (k === 150) S.orta = null; }
    else if (k === 171) { if (tur(S.sol?.e) !== 151) return hud.notice?.('Place your Familiar first, then the transformation scroll.', 'hata'); S.orta = { slot: sl, e }; }
    else return hud.notice?.('Only a Familiar egg, a Familiar or a transformation scroll can be placed here.', 'hata');
    ciz();
  };
  // çanta ızgarası: tıkla / sağ tık → yuvaya; sürükle-bırak da desteklenir
  L.el.addEventListener('contextmenu', (e) => e.preventDefault());
  L.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(L.el); });
  L.el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-id^="a_slot_"]'); if (a) { koy(Number(a.dataset.sl)); return; }
    if (e.target.closest('[data-id="area_upgrade"]')) { S.sol = null; S.orta = null; ciz(); return; }
    if (e.target.closest('[data-id="area_item1"]')) { S.orta = null; ciz(); }
  });
  L.el.addEventListener('contextmenu', (e) => { const a = e.target.closest('[data-id^="a_slot_"]'); if (a) koy(Number(a.dataset.sl)); });
  // ana çantadan sürüklenip bırakılan eşya
  L.el.dataset.esyaBirak = '1';
  L.el.addEventListener('ko-esya-birak', (ev) => { const d = ev.detail || {}; if (d.slot >= 14 && d.slot <= 41) koy(d.slot); });
  L.el.addEventListener('pointermove', (e) => {
    const a = e.target.closest('[data-id^="a_slot_"], [data-id="area_upgrade"], [data-id="area_item1"]');
    const x = !a ? null : a.dataset.id === 'area_upgrade' ? S.sol?.e : a.dataset.id === 'area_item1' ? S.orta?.e : bag().get(Number(a.dataset.sl));
    if (!x?.it) return ipucuKapat();
    tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu' }); if (!tip.isConnected) document.body.append(tip);
    tip.innerHTML = tooltipHtml(x.it, { satisGizle: true });
    Object.assign(tip.style, { position: 'fixed', zIndex: 9999, pointerEvents: 'none', left: Math.max(4, e.clientX - tip.offsetWidth - 16) + 'px', top: Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, e.clientY - 10)) + 'px' });
  });
  L.el.addEventListener('pointerleave', ipucuKapat);
  inp?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') onayla(); if (e.key === 'Escape') kapat(); });
  // (31.10) KO: onaydan sonra eşya güçlendirmedeki (örs) ilerleme animasyonunun aynısı (group_img_load_0..30), sonra sonuç yuvasında pet
  function animasyon() {
    return new Promise((res) => {
      const kareler = []; for (let i = 0; i < 31; i++) { const k = L.get('group_img_load_' + i); if (k) kareler.push(k); }
      if (!kareler.length) return setTimeout(res, 800);
      L.show('group_fx', true); kareler.forEach((k) => (k.hidden = true));
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
  const sonucGoster = async (num, ad) => {
    let it = null; try { const { data } = await sb.from('items').select('*').eq('num', Number(num)).maybeSingle(); if (data) it = fromDb(data); } catch {}
    S.sonuc = { it, ad };
  };
  let mesgul = false;
  async function onayla() {
    if (mesgul) return;
    const k = tur(S.sol?.e);
    try {
      mesgul = true; try { await state.net?.save?.(); } catch {}
      if (k === 150) {
        const isim = (inp?.value || '').trim();
        if (!isim) { hud.notice?.('Enter a name for your Familiar.', 'hata'); inp?.focus(); return; }
        // KO: onay kutusu "Would you like to incubate the egg?" (Confirm / Cancel)
        if (!(await new Promise((r) => { if (!hud.soru?.('Familiar', 'Would you like to incubate the egg?', () => r(true), () => r(false), ['Confirm', 'Cancel'])) r(true); }))) return;
        const d = await rpc('pet_kulucka', { p_slot: S.sol.slot, p_ad: isim }); if (!d?.ok) return hud.notice?.(d?.reason || 'Hatching failed.', 'hata');
        L.el.classList.add('pk-mesgul'); await animasyon(); L.el.classList.remove('pk-mesgul');
        await sonucGoster(d.pet?.gorunum || 610001000, d.pet?.ad || isim);
        hud.info?.(`The egg has hatched: ${d.pet.ad}! Equip it in the shoulder slot and call it with Familiar Summon.`, 'seviye');
      } else if (k === 151 && S.orta) {
        const d = await rpc('pet_gorunum_degis', { p_pet_slot: S.sol.slot, p_scroll_slot: S.orta.slot }); if (!d?.ok) return hud.notice?.(d?.reason || 'Transformation failed.', 'hata');
        L.el.classList.add('pk-mesgul'); await animasyon(); L.el.classList.remove('pk-mesgul');
        await sonucGoster(d.pet?.gorunum || d.num || 610001000, d.pet?.ad || '');
        hud.info?.(`${d.pet.ad} has taken on a new appearance: ${d.ad}.`, 'seviye');
      } else { hud.notice?.(k === 151 ? 'Place a transformation scroll in the middle slot.' : 'Place a Familiar egg in the left slot.', 'hata'); return; }
      S.sol = null; S.orta = null; await state.inv?.reload?.(); ciz();
    } catch (er) { hud.notice?.(er.message, 'hata'); } finally { mesgul = false; }
  }
  L.click('btn_ok', onayla); L.click('btn_cancel', kapat); L.click('btn_close', kapat);
  const degisti = () => { if (!L.el.isConnected) return removeEventListener('ko-envanter-degisti', degisti); ciz(); };
  addEventListener('ko-envanter-degisti', degisti);
  try { await state.inv?.reload?.(); } catch {}
  ciz();
  // KO: ekranın sağından kayarak gelir (sağ kenara yaslı); sağdaki diğer pencereler kapanır
  yanAcildi(L.el, 'sag', kapat);
  requestAnimationFrame(() => L.el.classList.add('pk-acik'));
  return true;
}
