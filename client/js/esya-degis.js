// KO "Item Exchange" penceresi (vendor / peddler sertifika ve kupon kırdırma): üstte mor şeritte kayıtlı kupon / sertifika
// (çantadan sürükle-bırak ya da NPC menüsünden gelen), altında değiştirilebilecek eşyalar (onay kutusu + simge + seçenek yazısı),
// en altta Exchange. Sunucu: sertifika_kir(p_char, p_slot, p_secim).
import { koWindow, toFront } from './ko-pencere.js';
import { loadMeta, iconHtml, tooltipHtml, fromDb, etiketEn } from './esya.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let acik = null;

/** SER: Map(kupon num → sertifika satırı {ad, hedefler, hedefler2, etiketler, gun}), BON: Map(num → kostum_bonus) */
export async function itemExchange({ sb, character, hud, state, SER, BON, slot = null }) {
  acik?.kapat();
  await loadMeta().catch(() => {});
  const IT = new Map();
  const esyalar = async (nums) => {
    const eksik = [...new Set(nums.map(Number))].filter((n) => n && !IT.has(n)); if (!eksik.length) return;
    const { data } = await sb.from('items').select('*').in('num', eksik);
    for (const r of data || []) IT.set(Number(r.num), fromDb(r));
  };
  const el = document.createElement('div');
  el.className = 'ko-panel ko-pencere ie-pen';
  el.dataset.esyaBirak = '1';
  el.innerHTML = `<div class="ay-baslik ie-baslik"><i>◆</i> Item Exchange <i>◆</i></div><button class="ko-kapat" title="Kapat"></button>
    <div class="ie-alt">Değiştirmek istediğin kuponu / sertifikayı çantandan buraya kaydet.</div>
    <div class="ie-kayit"><div class="ie-cerceve ie-kayit-yuva"></div><div class="ie-kayit-yazi"><b></b><span></span></div></div>
    <div class="ie-liste"></div>
    <div class="ie-alt-sira"><button class="ie-degis">Exchange</button></div>`;
  (document.getElementById('kohud') || document.body).append(el);
  el.style.pointerEvents = 'auto';
  koWindow(el); toFront(el);
  let kayit = null, secim = 0, mesgul = false;
  let tip = null;
  const ipucu = (it, e) => { tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu', id: 'ko-ipucu-yuzen' }); if (!tip.isConnected) document.body.append(tip); tip.innerHTML = tooltipHtml(it); tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, e.clientY - 10)) + 'px'; };
  const ipucuKapat = () => { tip?.remove(); };
  const kapat = () => { el.remove(); ipucuKapat(); if (acik === api) acik = null; };
  const api = { kapat, el };
  acik = api;
  el.querySelector('.ko-kapat').addEventListener('click', kapat);
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(el); });
  const hedefNum = (s, i) => Number((Number(character.nation) === 2 && s.hedefler2 ? s.hedefler2 : s.hedefler)?.[i]) || 0;

  async function ciz() {
    const yuva = el.querySelector('.ie-kayit-yuva'), b = el.querySelector('.ie-kayit-yazi b'), sp = el.querySelector('.ie-kayit-yazi span'), L = el.querySelector('.ie-liste');
    if (!kayit) {
      yuva.innerHTML = '<i class="ie-soru">?</i>'; b.textContent = 'Kupon / sertifika kayıtlı değil';
      sp.textContent = 'Çantandan bir kuponu buraya sürükle.'; L.innerHTML = '<div class="ie-bos">Önce değiştirmek istediğin eşyayı kaydet.</div>';
      el.querySelector('.ie-degis').disabled = true; return;
    }
    const s = kayit.s, n = (s.hedefler || []).length;
    await esyalar([kayit.num, ...Array.from({ length: n }, (_, i) => hedefNum(s, i))]);
    const kit = IT.get(kayit.num) || kayit.it;
    yuva.innerHTML = kit ? iconHtml(kit, 48) : '';
    b.textContent = kit?.strName || s.ad || 'Kupon';
    sp.textContent = `Değiştirilebilecek eşya türleri (Adet ${n})${kayit.count > 1 ? ` · çantada ${kayit.count}` : ''}`;
    L.innerHTML = Array.from({ length: n }, (_, i) => {
      const h = hedefNum(s, i), it = IT.get(h), et = etiketEn(s.etiketler?.[i] || BON.get(h)?.etiket || '') || it?.strName || `Option ${i + 1}`;
      return `<label class="ie-satir${secim === i + 1 ? ' secili' : ''}" data-i="${i + 1}" data-h="${h}"><span class="ie-kutu"><input type="checkbox"${secim === i + 1 ? ' checked' : ''}></span>
        <span class="ie-cerceve">${it ? iconHtml(it, 40) : ''}</span><span class="ie-yazi">Kostüm seçeneği : ${esc(et)}</span></label>`;
    }).join('');
    el.querySelector('.ie-degis').disabled = !secim;
  }
  const kaydet = (sl) => {
    const e = state.inv?.items?.get?.(sl); const num = Number(e?.row?.item_num);
    if (!e || !SER.has(num)) { hud.notice?.('This item cannot be exchanged here.', 'hata'); return false; }
    if (sl < 14 || sl > 41) { hud.notice?.('The coupon must be in your inventory.', 'hata'); return false; }
    kayit = { slot: sl, num, s: SER.get(num), it: e.it, count: Number(e.row.count) || 1 }; secim = 0; ciz(); return true;
  };
  el.addEventListener('ko-esya-birak', (ev) => { const d = ev.detail || {}; if (d.slot != null) kaydet(d.slot); });
  // kayıtlı kupona sağ tık: kaydı kaldır
  el.querySelector('.ie-kayit-yuva').addEventListener('contextmenu', (e) => { e.preventDefault(); kayit = null; secim = 0; ciz(); });
  el.querySelector('.ie-kayit-yuva').addEventListener('pointermove', (e) => { const it = kayit && (IT.get(kayit.num) || kayit.it); if (it) ipucu(it, e); });
  el.querySelector('.ie-kayit-yuva').addEventListener('pointerleave', ipucuKapat);
  const L = el.querySelector('.ie-liste');
  L.addEventListener('click', (e) => { const r = e.target.closest('.ie-satir'); if (!r) return; e.preventDefault(); const i = Number(r.dataset.i); secim = secim === i ? 0 : i; ciz(); });
  L.addEventListener('pointermove', (e) => { const c = e.target.closest('.ie-cerceve'); const r = c?.closest('.ie-satir'); const it = r && IT.get(Number(r.dataset.h)); if (it) ipucu(it, e); else ipucuKapat(); });
  L.addEventListener('pointerleave', ipucuKapat);
  el.querySelector('.ie-degis').addEventListener('click', async () => {
    if (!kayit || !secim || mesgul) return;
    mesgul = true;
    try {
      const { data: d, error } = await sb.rpc('sertifika_kir', { p_char: character.id, p_slot: kayit.slot, p_secim: secim });
      if (error) return hud.notice?.(error.message, 'hata');
      if (!d?.ok) return hud.notice?.(d?.reason || 'The exchange failed.', 'hata');
      await state.inv?.reload?.();
      hud.info?.(`You've received the ${d.ad} item (${d.gun || 60} days; the period starts when first equipped).`, 'esya');
      // aynı türden başka kupon varsa onu kaydet, yoksa kaydı boşalt
      const num = kayit.num; kayit = null; secim = 0;
      for (const [sl, e] of state.inv?.items || []) if (sl >= 14 && sl <= 41 && Number(e?.row?.item_num) === num) { kaydet(sl); break; }
      if (!kayit) ciz();
    } finally { mesgul = false; }
  });
  if (slot != null) kaydet(slot); else ciz();
  return api;
}
