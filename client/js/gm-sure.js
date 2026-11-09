// GM /sure: süreli eşya penceresi. GM kendi çantasından eşyayı tek yuvaya sürükler, gün / saat / dakika girer, Tamam → eşya süreli olur
// (gm_sure_ver). Süre, eşya ilk kuşanıldığında onayla başlar ve bir daha durmaz; süresi biten eşya nerede olursa olsun silinir.
import { iconHtml, sureMetni } from './esya.js';
import { toFront } from './ko-pencere.js';

let W = null;
export function sureAc({ sb, character, say }) {
  if (W) { W.el.hidden = false; toFront(W.el); return; }
  const el = document.createElement('div'); el.id = 'gm-sure'; el.className = 'ko-panel ko-pencere';
  el.innerHTML = `<div class="ay-baslik">Süreli Eşya</div><button class="ko-kapat" title="Kapat"></button>
    <div class="gs-govde">
      <div class="gs-yuva" data-esya-birak="1" title="Çantandan eşyayı buraya sürükle"></div>
      <div class="gs-ad">Çantandan eşyayı yuvaya sürükle.</div>
      <div class="gs-sure">
        <label>Gün <input type="number" min="0" max="3650" value="30" data-k="g"></label>
        <label>Saat <input type="number" min="0" max="23" value="0" data-k="s"></label>
        <label>Dk <input type="number" min="0" max="59" value="0" data-k="d"></label>
      </div>
      <div class="gs-not">Süre, oyuncu eşyayı ilk kuşandığında (onayla) başlar.</div>
      <div class="gs-dugmeler"><button class="ay-dugme" data-k="tamam">Tamam</button><button class="ay-dugme" data-k="iptal">İptal</button></div>
    </div>`;
  (document.getElementById('kohud') || document.body).append(el);
  W = { el, slot: null };
  const yuva = el.querySelector('.gs-yuva'), ad = el.querySelector('.gs-ad');
  const temizle = () => { W.slot = null; yuva.innerHTML = ''; ad.textContent = 'Çantandan eşyayı yuvaya sürükle.'; };
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(el); });
  el.addEventListener('keydown', (e) => e.stopPropagation());
  el.querySelector('.ko-kapat').onclick = () => { el.hidden = true; temizle(); };
  el.addEventListener('ko-esya-birak', (ev) => {
    const d = ev.detail || {}; if (d.slot == null) return;
    if (d.slot < 14 || d.slot > 41) { say('Drag the item from your bag (unequip worn items to your bag first).', 'hata'); return; }
    if (Number(d.it?.Countable) > 0) { say('Countable (stackable) items cannot be made timed.', 'hata'); return; }
    W.slot = d.slot; yuva.innerHTML = iconHtml(d.it, 44);
    ad.textContent = d.name + (d.row?.sure_sn ? ` (şu an: ${sureMetni(d.row.sure_sn)})` : '');
  });
  el.querySelector('[data-k="iptal"]').onclick = () => { el.hidden = true; temizle(); };
  el.querySelector('[data-k="tamam"]').onclick = async () => {
    if (W.slot == null) { say('Drag an item into the slot first.', 'hata'); return; }
    const v = (k) => Math.max(0, Number(el.querySelector(`[data-k="${k}"]`).value) || 0);
    const sn = v('g') * 86400 + v('s') * 3600 + v('d') * 60;
    if (sn < 60) { say('Duration must be at least 1 minute.', 'hata'); return; }
    const { data, error } = await sb.rpc('gm_sure_ver', { p_char: character.id, p_slot: W.slot, p_sn: sn });
    if (error || !data?.ok) { say(error?.message || data?.mesaj || 'Could not set the duration.', 'hata'); return; }
    say(`${data.ad}: made into a timed item (${sureMetni(sn)}).`, 'tamam');
    dispatchEvent(new CustomEvent('ko-envanter-yenile'));
    temizle();
  };
  toFront(el);
}
