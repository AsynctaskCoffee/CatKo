// Hedef (canavar) can çubuğunun başındaki küçük sandık simgesi → canavarın düşürebileceği eşyalar (yalnız liste; oranlar yazmaz).
// Veri: monster_drops (sid, item_num, chance > 0). Görünüm Chaotic Generator "Possible Rewards" penceresiyle aynı (cg-drop).
import { loadMeta, fromDb, iconHtml, tooltipHtml } from './esya.js';
import { toFront } from './ko-pencere.js';

export const SANDIK_IKON = 810636000;
const IT = new Map(), DROP = new Map();
let sbRef = null, pen = null, tip = null, acikSid = null;
export const mobDropKur = (sb) => { sbRef = sb; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function esyalar(nums) {
  const eksik = [...new Set(nums.map(Number))].filter((n) => n && !IT.has(n)); if (!eksik.length || !sbRef) return;
  await loadMeta().catch(() => {});
  const { data } = await sbRef.from('items').select('*').in('num', eksik);
  for (const r of data || []) IT.set(Number(r.num), { ...fromDb(r), _db: r });
}
/** sandık simgesi (hud hedef çerçevesi için) — ikon yüklenince içi dolar */
export function sandikEl() {
  const d = document.createElement('div'); d.className = 'hd-sandik'; d.title = 'Drop list';
  esyalar([SANDIK_IKON]).then(() => { const it = IT.get(SANDIK_IKON); if (it) d.innerHTML = iconHtml(it, 22); }).catch(() => {});
  return d;
}
const ipucuKapat = () => { tip?.remove(); tip = null; };
export function dropKapat() { ipucuKapat(); pen?.remove(); pen = null; acikSid = null; }
// (8.11) hızlı açılış: liste (drop + eşya bilgisi) hedef seçilir seçilmez arka planda yüklenir; pencere tıklamada anında açılır,
//   liste henüz gelmediyse "Loading…" ile açılır ve gelince dolar. Aynı istek iki kez gitmez.
const YUK = new Map();
export function dropOnYukle(sid) {
  if (!sbRef || !sid) return Promise.resolve([]);
  if (!YUK.has(sid)) YUK.set(sid, (async () => {
    if (!DROP.has(sid)) {
      const { data } = await sbRef.from('monster_drops').select('item_num,chance').eq('sid', sid).gt('chance', 0).order('chance', { ascending: false });
      DROP.set(sid, [...new Set((data || []).map((r) => Number(r.item_num)).filter(Boolean))]);
    }
    const l = DROP.get(sid); await esyalar(l); return l.filter((n) => IT.has(n));
  })().catch((e) => { YUK.delete(sid); throw e; }));
  return YUK.get(sid);
}
const renk = (it) => ([4, 12].includes(Number(it?.ItemType)) ? 'cg-u' : '');
function izgaraHtml(liste) {
  const kol = Math.max(1, Math.min(liste.length, liste.length > 40 ? 10 : liste.length > 24 ? 8 : 6));
  return `<div class="cg-drop-izgara" style="grid-template-columns:repeat(${kol}, 36px)">${liste.map((n) => `<div class="cg-drop-oge ${renk(IT.get(n))}" data-num="${n}">${iconHtml(IT.get(n), 34)}</div>`).join('') || '<p class="hd-drop-bos">No drops.</p>'}</div>`;
}
export function dropAc(sid, ad, yer) {
  if (!sbRef || !sid) return;
  if (pen && acikSid === sid) { dropKapat(); return; }   // aynı canavarda tekrar basınca kapanır
  dropKapat(); acikSid = sid;
  pen = document.createElement('div'); pen.className = 'ko-panel ko-pencere cg-drop hd-drop';
  const hazir = YUK.get(sid), benimPen = pen;
  pen.innerHTML = `<div class="ay-baslik">Drop List</div><button class="ko-kapat" title="Close"></button><div class="hd-drop-ic"><p class="hd-drop-bos">Loading…</p></div>`;
  (document.getElementById('kohud') || document.body).append(pen);
  pen.style.pointerEvents = 'auto'; toFront(pen);
  pen.querySelector('.ko-kapat').onclick = dropKapat;
  pen.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(pen); });
  pen.addEventListener('pointermove', (e) => {
    const o = e.target.closest('.cg-drop-oge'); const it = o && IT.get(Number(o.dataset.num));
    if (!it) return ipucuKapat();
    tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu' }); if (!tip.isConnected) document.body.append(tip);
    tip.innerHTML = tooltipHtml(it, { satisGizle: true });
    Object.assign(tip.style, { position: 'fixed', zIndex: 9999, pointerEvents: 'none', left: Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16) + 'px', top: Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, e.clientY - 10)) + 'px' });
  });
  pen.addEventListener('pointerleave', ipucuKapat);
  requestAnimationFrame(() => { const r = yer?.getBoundingClientRect?.(); const w = pen.offsetWidth;
    pen.style.left = Math.max(4, Math.min(innerWidth - w - 4, r ? r.left : innerWidth / 2 - w / 2)) + 'px'; pen.style.top = ((r ? r.bottom : 90) + 8) + 'px'; });
  dropOnYukle(sid).then((liste) => {
    if (pen !== benimPen || acikSid !== sid) return;
    pen.querySelector('.hd-drop-ic').innerHTML = izgaraHtml(liste);
    const r = yer?.getBoundingClientRect?.(), w = pen.offsetWidth; pen.style.left = Math.max(4, Math.min(innerWidth - w - 4, r ? r.left : innerWidth / 2 - w / 2)) + 'px';
  }).catch(() => { if (pen === benimPen) pen.querySelector('.hd-drop-ic').innerHTML = '<p class="hd-drop-bos">Could not load the drop list.</p>'; });
  void hazir;
}
