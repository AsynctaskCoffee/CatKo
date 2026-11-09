// KO Save Quickslot (orijinal re_hotkeypreset): yetenek penceresindeki "Save Quickslot" düğmesi.
// Base_SlotPage: sayfa başına 4 kayıt (Empty Slot N + 10 yuva 1…0), ◀ sayfa ▶, "Please select a slot." · kısayol sayfası (▲ 1 ▼) · Apply · Edit,
//   "Number of quick slots to use." (− 10 +; 0 → kısayol çubuğu gizlenir).
// Base_LinePage (Edit): kayıt adı + Name Change, 10 yuva (yetenek penceresinden sürükle-bırak, sağ tık siler), Save · Cancel · Reset.
// KO: "*Quickslot is saved on the personal PC." → localStorage (karakter başına).
import { hasLayout, buildLayout, draggable, ekUI } from './kui.js';
import { yetenekVerisi, pasifYet } from './yetenek.js';

const SAYFA = 3, KAYIT = SAYFA * 4;
let L = null, C = null, V = null, sayfa = 0, sec = null, hedefSayfa = 1, duz = null;

const anahtar = () => 'ko-hkpreset-' + C.character.id;
const oku = () => { let v = null; try { v = JSON.parse(localStorage.getItem(anahtar()) || 'null'); } catch {} v ||= {}; v.kayit = Array.from({ length: KAYIT }, (_, i) => v.kayit?.[i] || null); v.adet = Number.isFinite(v.adet) ? Math.max(0, Math.min(3, v.adet)) : 3; return v; };
const yaz = () => { try { localStorage.setItem(anahtar(), JSON.stringify(V)); } catch {} };
const ad = (i) => V.kayit[i]?.ad || `Empty Slot ${i + 1}`;
const ikon = (id, px = 33) => {
  const Y = yetenekVerisi(), s = Y?.yetenekler?.[id], A = Y?.atlas; if (!s || !A) return '';
  const i = s.ikon < 0 ? 0 : s.ikon, k = px / A.boyut;
  return `<div class="hkp-ikon" style="width:${px}px;height:${px}px;background:url(./assets/yetenek/${A.dosya}) ${-(i % A.kolon) * px}px ${-Math.floor(i / A.kolon) * px}px / ${A.kolon * A.boyut * k}px auto"></div>`;
};
const q = (g, id) => (typeof g === 'string' ? L.get(g) : g)?.querySelector(`[data-id="${id}"]`);
const yuvalar = (g) => Array.from({ length: 10 }, (_, k) => [...g.querySelectorAll(':scope > .kui-ar')].find((a) => a.dataset.id === String(k)));

/** (6.11) "Number of quick slots to use" = açılabilecek en çok kısayol çubuğu (0–3; 0 → çubuklar gizli) */
export function kisayolAdetUygula(state, n) { state?.kisayol?.cubukSiniri?.(n); }

export async function hotkeyPresetAc({ character, state, hud, yanina }) {
  C = { character, state, hud };
  if (!(await ekUI('hkpreset').catch(() => false)) || !hasLayout('re_hotkeypreset')) return hud?.notice?.('Save Quickslot could not be loaded.', 'hata');
  V = oku();
  if (!L) kur();
  sec = null; duz = null; ciz();
  L.el.hidden = false; L.el.style.zIndex = 4200;
  const r = yanina?.getBoundingClientRect?.();
  if (r?.width) { const g = L.el.getBoundingClientRect().width || 459; L.el.style.left = (r.right + 4 + g > innerWidth ? Math.max(0, r.left - g - 4) : r.right + 4) + 'px'; L.el.style.top = Math.max(0, r.top) + 'px'; }
}

function kur() {
  L = buildLayout('re_hotkeypreset', { className: 'ko-hkpreset ko-pencere kui-dokulu' });
  (document.getElementById('kohud') || document.body).append(L.el); draggable(L, 40);
  L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  L.show('base_tooltip', false);
  addEventListener('ko-yetenek-sifirlandi', () => setTimeout(() => { if (!C) return; V = oku(); sec = null; duz = null; ciz(); }, 0));   // (6.11) yetenek sıfırlama: kayıtlar silindi
  L.click('Btn_close', () => { if (duz) { duz = null; ciz(); } else L.el.hidden = true; });
  // kayıt listesi
  for (let k = 0; k < 4; k++) {
    const g = L.get('Base_Slot_' + k), b = q(g, 'Btn_Slot');
    if (b) { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); sec = sayfa * 4 + k; ciz(); }; }
    for (const a of yuvalar(g)) if (a) { a.style.pointerEvents = 'auto'; a.onclick = (e) => { e.stopPropagation(); sec = sayfa * 4 + k; ciz(); }; }
  }
  L.click('Btn_pre', () => { sayfa = (sayfa + SAYFA - 1) % SAYFA; ciz(); });
  L.click('Btn_next', () => { sayfa = (sayfa + 1) % SAYFA; ciz(); });
  L.click('Btn_up', () => { hedefSayfa = hedefSayfa >= 8 ? 1 : hedefSayfa + 1; ciz(); });
  L.click('Btn_down', () => { hedefSayfa = hedefSayfa <= 1 ? 8 : hedefSayfa - 1; ciz(); });
  const ip = 'Maximum number of quick slot bars you can open (up to 3). If you set the number of quick slots to 0, the quick slots will be hidden. If you set it to higher than 0, the quick slots will be displayed again.';
  for (const id of ['btn_uslot_up', 'btn_uslot_down', 'str_uslot_num']) { const e = L.get(id); if (e) e.title = ip; }
  const adet = (d) => { V.adet = Math.max(0, Math.min(3, V.adet + d)); yaz(); kisayolAdetUygula(C.state, V.adet); ciz(); };
  L.click('btn_uslot_up', () => adet(1)); L.click('btn_uslot_down', () => adet(-1));
  L.click('Btn_aply', () => {
    if (sec == null) return C.hud?.notice?.('Please select a slot.', 'hata');
    const k = V.kayit[sec]; if (!k?.s?.some(Boolean)) return C.hud?.notice?.('There is no saved quickslot in this slot.', 'hata');
    if (!C.state.kisayol?.sayfaAta) return C.hud?.notice?.('The shortcut bar is not ready.', 'hata');
    C.state.kisayol.sayfaAta(hedefSayfa, k.s);
    C.hud?.info?.(`${ad(sec)} has been applied to quickslot page ${hedefSayfa}.`, 'beceri');
  });
  L.click('Btn_formal', () => {
    if (sec == null) return C.hud?.notice?.('Please select a slot.', 'hata');
    const k = V.kayit[sec]; duz = { ad: k?.ad || `Save ${sec + 1}`, s: Array.from({ length: 10 }, (_, i) => k?.s?.[i] ?? null) }; ciz();
  });
  // düzenleme
  const hat = L.get('Base_Line');
  for (const [k, a] of yuvalar(hat).entries()) if (a) {
    a.style.pointerEvents = 'auto';
    a.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); if (duz) { duz.s[k] = null; ciz(); } };
    a.onpointerdown = (e) => {   // düzenleme satırında yuvalar arası taşıma
      if (e.button !== 0 || !duz?.s[k]) return; e.stopPropagation();
      const id = duz.s[k]; let g = null;
      const m = (ev) => { if (!g) { g = document.createElement('div'); g.className = 'ko-yetenek-hayalet'; g.innerHTML = ikon(id, 32); document.body.append(g); } g.style.left = ev.clientX - 16 + 'px'; g.style.top = ev.clientY - 16 + 'px'; };
      const u = (ev) => {
        removeEventListener('pointermove', m); removeEventListener('pointerup', u); if (!g) return; g.remove();
        const h = hedefYuva(ev.clientX, ev.clientY);
        if (h == null) duz.s[k] = null; else if (h !== k) { const t = duz.s[h]; duz.s[h] = id; duz.s[k] = t; }
        ciz();
      };
      addEventListener('pointermove', m); addEventListener('pointerup', u);
    };
  }
  L.click('Btn_save', () => { if (!duz) return; V.kayit[sec] = { ad: duz.ad, s: duz.s }; yaz(); C.hud?.info?.(`${duz.ad} has been saved.`, 'beceri'); duz = null; ciz(); });
  L.click('Btn_cancel', () => { duz = null; ciz(); });
  L.click('Btn_Clear', () => { if (duz) { duz.s = Array(10).fill(null); ciz(); } });
  L.click('Btn_Change', () => {
    if (!duz) return; const t = L.get('str_slotname'); if (!t || t.querySelector('input')) return;
    const inp = document.createElement('input'); inp.className = 'kui-input hkp-ad'; inp.maxLength = 20; inp.value = duz.ad; t.textContent = ''; t.append(inp); inp.focus(); inp.select();
    const bitir = (ok) => { if (ok && inp.value.trim()) duz.ad = inp.value.trim(); inp.remove(); ciz(); };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') bitir(true); if (e.key === 'Escape') bitir(false); };
    inp.onblur = () => bitir(true);
  });
  // yetenek penceresinden bırakma
  addEventListener('ko-yetenek-birak', (e) => {
    if (!duz || L.el.hidden) return;
    const { id, x, y } = e.detail || {}; const h = hedefYuva(x, y); if (h == null) return;
    if (pasifYet(yetenekVerisi()?.yetenekler?.[id])) return C.hud?.notice?.('Passive skills cannot be placed on the shortcut bar.', 'hata');
    duz.s[h] = id; ciz();
  });
}

function hedefYuva(x, y) {
  const hat = L.get('Base_Line'); if (!hat || hat.offsetParent === null) return null;
  const ys = yuvalar(hat);
  for (const n of document.elementsFromPoint(x, y)) { const i = ys.indexOf(n.closest?.('.kui-ar')); if (i >= 0) return i; }
  return null;
}

function ciz() {
  if (!L) return;
  L.show('Base_SlotPage', !duz); L.show('Base_LinePage', !!duz);
  for (let k = 0; k < 4; k++) {
    const i = sayfa * 4 + k, g = L.get('Base_Slot_' + k); if (!g) continue;
    const t = q(g, 'str_name'); if (t) t.textContent = ad(i);
    q(g, 'Btn_Slot')?.classList.toggle('secili', sec === i);
    yuvalar(g).forEach((a, j) => { if (a) a.innerHTML = ikon(V.kayit[i]?.s?.[j]); });
  }
  L.text('Str_page', String(sayfa + 1)); L.text('str_Num', String(hedefSayfa));
  L.text('Str_select', sec == null ? 'Please select a slot.' : ad(sec));
  L.text('str_uslot_num', String(V.adet));
  if (duz) {
    const t = L.get('str_slotname'); if (t && !t.querySelector('input')) t.textContent = duz.ad;
    yuvalar(L.get('Base_Line')).forEach((a, j) => { if (a) a.innerHTML = ikon(duz.s[j], 34); });
  }
}
