// KO Skill Preset: yetenek penceresindeki "Preset" düğmesi. Stat Preset ile aynı pencere (re_stat_preset):
// base_slot: Save 1–4 + özet ("Archery:10 Assassinate:5 Search:0 Master:0" / "No Info"), Apply · Edit.
// base_stat (Edit): "Skill Preset N", 3 uzmanlık sekmesi + Master − / + (sekme başına en çok seviye, Master en çok 23), Point (kalan), Save · Cancel.
// Sunucu: skill_preset tablosu; skill_preset_liste / skill_preset_kaydet / skill_preset_uygula (ücretsiz).
import { hasLayout, buildLayout, draggable, ekUI } from './kui.js';

const K = ['5', '6', '7', '8'];
let L = null, V = null, sec = 0, duz = null, AD = ['', '', '', 'Master'], CTX = null;

export async function skillPresetAc({ sb, character, hud, adlar, yanina, onUygula }) {
  if (!(await ekUI('secek').catch(() => false)) || !hasLayout('re_stat_preset')) return hud?.notice?.('Skill Preset could not be loaded.', 'hata');
  CTX = { sb, character, hud, onUygula };
  if (adlar) AD = [...adlar.slice(0, 3), 'Master'];
  const rpc = async (fn, a = {}) => { const { data, error } = await CTX.sb.rpc(fn, { p_char: CTX.character.id, ...a }); if (error) { CTX.hud?.notice?.(error.message, 'hata'); return null; } return data; };
  if (!L) {
    L = buildLayout('re_stat_preset', { className: 'ko-stat-preset ko-skill-preset ko-pencere kui-dokulu' });
    (document.getElementById('kohud') || document.body).append(L.el); draggable(L, 40);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    addEventListener('ko-yetenek-sifirlandi', () => { duz = null; if (!L.el.hidden) L._yukle?.(); else V = null; });   // (6.11) sunucu skill_reset presetleri siler
    const q = (g, id) => L.get(g)?.querySelector(`[data-id="${id}"]`);
    L._q = q;
    q('base_slot', 'str_Title').textContent = 'Save Skill Preset';
    q('base_slot', 'btn_close')?.classList.add('kui-tik');
    q('base_slot', 'btn_close').onclick = (e) => { e.stopPropagation(); L.el.hidden = true; L._bagli = false; };
    for (let i = 0; i < 4; i++) { const b = q('base_slot', 'Btn_slot_' + i); if (b) { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); sec = i; ciz(); }; } }
    const ap = q('base_slot', 'Btn_Load'), ed = q('base_slot', 'Btn_Revise');
    ap.classList.add('kui-tik'); ap.onclick = (e) => {
      e.stopPropagation(); const y = V?.yuvalar?.find((x) => x.slot === sec); if (!y) return CTX.hud?.notice?.('There is no saved skill preset in this slot.', 'hata');
      CTX.hud?.soru?.('Skill Preset', `Apply Save ${sec + 1}?\n${ozet(y)}`, async () => {
        const d = await rpc('skill_preset_uygula', { p_slot: sec }); if (!d) return;
        if (!d.ok) return CTX.hud?.notice?.(d.mesaj, 'hata');
        CTX.hud?.info?.(d.mesaj, 'beceri'); CTX.onUygula?.(d.yetenek); await yukle();
      });
    };
    ed.classList.add('kui-tik'); ed.onclick = (e) => { e.stopPropagation(); duzenle(); };
    // Edit görünümü: 4 satır (3 uzmanlık sekmesi + Master); 5. satır (INT) gizli
    for (const id of ['str_4', 'str_val_4', 'btn_4_0', 'btn_4_1', 'img_bg_4']) { const n = q('base_stat', id); if (n) n.hidden = true; }
    for (let i = 0; i < 4; i++) {
      for (const [j, d] of [[0, -1], [1, 1]]) { const b = q('base_stat', `btn_${i}_${j}`); if (!b) continue; b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); ayarla(i, d, e.shiftKey ? 10 : 1); }; }
    }
    q('base_stat', 'btn_save').classList.add('kui-tik');
    q('base_stat', 'btn_save').onclick = async (e) => {
      e.stopPropagation(); if (!duz) return;
      const d = await rpc('skill_preset_kaydet', { p_slot: sec, p5: duz['5'], p6: duz['6'], p7: duz['7'], p8: duz['8'] }); if (!d) return;
      if (!d.ok) return CTX.hud?.notice?.(d.mesaj, 'hata');
      CTX.hud?.info?.(d.mesaj, 'beceri'); duz = null; await yukle();
    };
    q('base_stat', 'btn_statclose').classList.add('kui-tik');
    q('base_stat', 'btn_statclose').onclick = (e) => { e.stopPropagation(); duz = null; ciz(); };
  }
  async function yukle() { V = await rpc('skill_preset_liste'); ciz(); }
  L._yukle = yukle;
  duz = null; ciz();
  const yerles = () => { const r = yanina?.getBoundingClientRect?.(); if (!r || !r.width) return; const z = L.el.offsetWidth ? L.el.getBoundingClientRect().width / L.el.offsetWidth || 1 : 1; const g = L.el.getBoundingClientRect().width || 360 * z; L.el.style.left = (r.right + 4 + g > innerWidth ? Math.max(0, r.left - g - 4) : r.right + 4) / z + 'px'; L.el.style.top = Math.max(0, r.top) / z + 'px'; };
  L.el.hidden = false; L.el.style.zIndex = 4200; yerles();
  // yetenek penceresiyle birlikte kapanır / açılır, taşınınca yanında kalır
  if (yanina && L._yanina !== yanina) {
    L._gozcu?.disconnect(); L._yanina = yanina;
    L._gozcu = new MutationObserver(() => {
      if (yanina.hidden) { if (!L.el.hidden) { L.el.hidden = true; L._bagli = true; } }
      else if (L._bagli && L.el.hidden) { L.el.hidden = false; duz = null; ciz(); yerles(); yukle(); }
      else if (!L.el.hidden) yerles();
    });
    L._gozcu.observe(yanina, { attributes: true, attributeFilter: ['hidden', 'style'] });
  }
  L._bagli = true;
  await yukle();
}

const ozet = (y) => K.map((k, i) => `${AD[i]}:${y[k] ?? 0}`).join(' ');
const kalan = () => (V?.toplam || 0) - K.reduce((t, k) => t + (duz[k] || 0), 0);
const sinir = (k) => (k === '8' ? (V?.usta ? Math.min(23, V.level || 0) : 0) : V?.level || 0);
function ayarla(i, d, n) {
  if (!duz || !V) return; const k = K[i];
  if (d > 0 && !V.meslek) return CTX?.hud?.notice?.('You must change your class first.', 'hata');
  if (d > 0 && k === '8' && !V.usta) return CTX?.hud?.notice?.('The Master tab requires a master class.', 'hata');
  for (let s = 0; s < n; s++) { if (d > 0 && (kalan() <= 0 || duz[k] >= sinir(k))) break; if (d < 0 && duz[k] <= 0) break; duz[k] += d; }
  ciz();
}
function duzenle() {
  if (!V) return; const y = V.yuvalar.find((x) => x.slot === sec);
  duz = {}; for (const k of K) duz[k] = Math.max(0, Math.min(sinir(k), Number((y || V)[k]) || 0));
  ciz();
}
function ciz() {
  if (!L) return; const q = L._q; L.show('base_slot', !duz); L.show('base_stat', !!duz);
  for (let i = 0; i < 4; i++) {
    q('base_slot', 'Btn_slot_' + i)?.classList.toggle('secili', i === sec);
    const y = V?.yuvalar?.find((x) => x.slot === i); q('base_slot', 'str_slot_' + i).textContent = y ? ozet(y) : 'No Info';
  }
  if (duz) {
    q('base_stat', 'str_Title').textContent = `Skill Preset ${sec + 1}`;
    K.forEach((k, i) => { q('base_stat', 'str_val_' + i).textContent = AD[i]; q('base_stat', 'str_' + i).textContent = String(duz[k]); });
    q('base_stat', 'str_point').textContent = String(kalan());
  }
}
