// KO Stat Preset (orijinal re_stat_preset): statü penceresindeki "Stat Preset" düğmesi.
// base_slot: Save 1–4 (seçilebilir) + her yuvanın özeti ("STR:60 HP:62 DEX:105 MP:50 INT:50" / "No Info"), Apply · Edit.
// base_stat (Edit): "Save N Slot", STR / HP / DEX / MP / INT − / + (en az ırk tabanı, en çok 255), Point (kalan), Save · Cancel.
// Sunucu: stat_preset tablosu; stat_preset_liste / stat_preset_kaydet / stat_preset_uygula (giyili eşya yokken; ücretsiz).
import { hasLayout, buildLayout, draggable, ekUI } from './kui.js';

const K = ['str', 'sta', 'dex', 'cha', 'intel'], AD = ['STR', 'HP', 'DEX', 'MP', 'INT'];
let L = null, V = null, sec = 0, duz = null;

export async function statPresetAc({ sb, character, hud, onStats, yanina }) {
  if (!(await ekUI('secek').catch(() => false)) || !hasLayout('re_stat_preset')) return hud.notice?.('Stat Preset could not be loaded.', 'hata');
  const rpc = async (fn, a = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...a }); if (error) { hud.notice?.(error.message, 'hata'); return null; } return data; };
  if (!L) {
    L = buildLayout('re_stat_preset', { className: 'ko-stat-preset ko-pencere kui-dokulu' });
    (document.getElementById('kohud') || document.body).append(L.el); draggable(L, 40);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    addEventListener('ko-stat-sifirlandi', () => { duz = null; if (!L.el.hidden) L._yukle?.(); else V = null; });   // (6.11) sunucu stat_reset presetleri siler
    const q = (g, id) => L.get(g)?.querySelector(`[data-id="${id}"]`);
    L._q = q;
    q('base_slot', 'str_Title').textContent = 'Save Stat Preset';
    q('base_slot', 'btn_close')?.classList.add('kui-tik');
    q('base_slot', 'btn_close').onclick = (e) => { e.stopPropagation(); L.el.hidden = true; L._bagli = false; };   // elle kapatıldı: statü penceresi yeniden açılınca kendiliğinden açılmaz
    for (let i = 0; i < 4; i++) { const b = q('base_slot', 'Btn_slot_' + i); if (b) { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); sec = i; ciz(); }; } }
    const ap = q('base_slot', 'Btn_Load'), ed = q('base_slot', 'Btn_Revise');
    ap.classList.add('kui-tik'); ap.onclick = async (e) => {
      e.stopPropagation(); const y = V?.yuvalar?.find((x) => x.slot === sec); if (!y) return hud.notice?.('There is no saved stat preset in this slot.', 'hata');
      hud.soru?.('Stat Preset', `Apply Save ${sec + 1}?\n${ozet(y)}`, async () => {
        const d = await rpc('stat_preset_uygula', { p_slot: sec }); if (!d) return;
        if (!d.ok) return hud.notice?.(d.mesaj, 'hata');
        hud.info?.(d.mesaj, 'beceri'); if (d.stats) onStats?.(d.stats); await yukle();
      });
    };
    ed.classList.add('kui-tik'); ed.onclick = (e) => { e.stopPropagation(); duzenle(); };
    // Edit görünümü
    for (let i = 0; i < 5; i++) {
      q('base_stat', 'str_val_' + i).textContent = AD[i];
      for (const [j, d] of [[0, -1], [1, 1]]) { const b = q('base_stat', `btn_${i}_${j}`); if (!b) continue; b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); ayarla(i, d, e.shiftKey ? 10 : 1); }; }
    }
    q('base_stat', 'btn_save').classList.add('kui-tik');
    q('base_stat', 'btn_save').onclick = async (e) => {
      e.stopPropagation(); if (!duz) return;
      const d = await rpc('stat_preset_kaydet', { p_slot: sec, p_str: duz.str, p_sta: duz.sta, p_dex: duz.dex, p_intel: duz.intel, p_cha: duz.cha }); if (!d) return;
      if (!d.ok) return hud.notice?.(d.mesaj, 'hata');
      hud.info?.(d.mesaj, 'beceri'); duz = null; await yukle();
    };
    q('base_stat', 'btn_statclose').classList.add('kui-tik');
    q('base_stat', 'btn_statclose').onclick = (e) => { e.stopPropagation(); duz = null; ciz(); };
  }
  async function yukle() { V = await rpc('stat_preset_liste'); ciz(); }
  L._yukle = yukle;
  const ozet = (y) => K.map((k, i) => `${AD[i]}:${y[k]}`).join(' ');
  const kalan = () => V.toplam - K.reduce((t, k) => t + (duz[k] - V.taban[k]), 0);
  function ayarla(i, d, n) {
    if (!duz) return; const k = K[i];
    for (let s = 0; s < n; s++) { if (d > 0 && (kalan() <= 0 || duz[k] >= 255)) break; if (d < 0 && duz[k] <= V.taban[k]) break; duz[k] += d; }
    ciz();
  }
  function duzenle() { if (!V) return; const y = V.yuvalar.find((x) => x.slot === sec); duz = { ...(y || V.simdi) }; for (const k of K) duz[k] = Math.max(V.taban[k], duz[k]); ciz(); }
  function ciz() {
    const q = L._q; L.show('base_slot', !duz); L.show('base_stat', !!duz);
    for (let i = 0; i < 4; i++) {
      q('base_slot', 'Btn_slot_' + i)?.classList.toggle('secili', i === sec);
      const y = V?.yuvalar?.find((x) => x.slot === i); q('base_slot', 'str_slot_' + i).textContent = y ? ozet(y) : 'No Info';
    }
    if (duz) {
      q('base_stat', 'str_Title').textContent = `Save ${sec + 1} Slot`;
      K.forEach((k, i) => (q('base_stat', 'str_' + i).textContent = String(duz[k])));
      q('base_stat', 'str_point').textContent = String(kalan());
    }
  }
  duz = null; ciz();   // önce yalnız kayıt listesi (base_slot): düzenleme görünümü (base_stat) aynı anda açılmasın
  const yerles = () => { const r = yanina?.getBoundingClientRect?.(); if (!r || !r.width) return; const z = L.el.offsetWidth ? L.el.getBoundingClientRect().width / L.el.offsetWidth || 1 : 1; L.el.style.left = Math.min(innerWidth - 360 * z, r.right + 4) / z + 'px'; L.el.style.top = Math.max(0, r.top) / z + 'px'; };
  L.el.hidden = false; L.el.style.zIndex = 4200; yerles();
  // statü penceresiyle birlikte: o kapanınca Save Stat Preset de kapanır, yeniden açılınca (preset açıktıysa) birlikte açılır; taşınınca yanında kalır
  if (yanina && L._yanina !== yanina) {
    L._gozcu?.disconnect(); L._yanina = yanina; L._bagli = true;
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
