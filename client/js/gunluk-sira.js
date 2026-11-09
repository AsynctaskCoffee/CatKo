// KO Daily Rank (orijinal re_dailyoverallrank, sol alttaki "R"): üstte seçili sıralamanın açıklaması (DailyRank_us.tbl), sağda açılır liste,
// solda 1–3 madalyalı ilk üç, sağda sıra + ad (kaydırılır, 8 satır), altta "My Rank:", en altta "Daily Rank updates everyday and resets every month".
// Sunucu: gunluk_sira_liste(p_char, p_tur) — 1 aylık ulus puanı, 8 klan toplamı, diğerleri gunluk_sira sayaçları (pazar alım/satım, güçlendirme başarısı …).
import { ekUI, hasLayout, buildLayout, draggable } from './kui.js';
import { bindScroll } from './hud.js';

const TURLER = [   // [id, ad, açıklama 1, açıklama 2, alt yazı]
  [0, 'Honor of Grand Merchant', 'A legendary figure who contributed to Adonis Merchant Union', '', '(Buying/Selling Merchant)'],
  [1, 'Knight of Adonis', 'An endless war between two nations', 'Who is going to lead this war to a victory?', '(Monthly Ladder Point)'],
  [2, 'Hero of Chaos', 'The last stander who wiped out entire foes', 'who expresses  the hostility against their God', '(Chaos Rank Point)'],
  [4, 'Apprentice of Shozin', 'The new hero who was  credited by Shozin', '', '(Crafting from Shozin)'],
  [5, 'Conqueror of Draki', 'The hero who is going to save the world from Drakis', '', '(Draki Tower Job Rank)'],
  [6, 'Disciple of Charon', 'Blessed Disciple of Charon', '', '(Item Upgrade Success using Blessed Item Upgrade Scroll)'],
  [8, 'Knights of Felankor', 'The Clan with Blessing of Ares', '', '(Total of Ladder points from Each Clan)'],
];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let L = null, tur = 0, veri = null, listeAcik = false;

export async function gunlukSiraAc({ sb, character, hud }) {
  if (!(await ekUI('rank').catch(() => false)) || !hasLayout('re_dailyoverallrank')) return hud?.notice?.('Daily Rank could not be loaded.', 'hata');
  if (L && !L.el.hidden) { L.el.hidden = true; return; }
  if (!L) {
    L = buildLayout('re_dailyoverallrank', { className: 'ko-gunluk-sira ko-pencere kui-dokulu' });
    (document.getElementById('kohud') || document.body).append(L.el); draggable(L, 50);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    L.click('btn_close', () => { L.el.hidden = true; });
    L.text('default_0', 'Daily Rank'); L.text('default_1', 'My Rank:'); L.text('default_2', 'Daily Rank updates everyday and resets every month');
    // sağ liste (sıra 1–100): rank_0..7 / str_userid_0..7 yerine kaydırılan HTML liste
    const alan = document.createElement('div'); alan.className = 'gs-liste'; L.el.append(alan); L._alan = alan;
    for (let i = 0; i < 8; i++) { L.show('rank_' + i, false); L.show('str_userid_' + i, false); }
    bindScroll(L.get('main_scroll'), alan);
    // açılır başlık listesi
    const bl = L.get('base_title_list'), ls = L.get('list_title_list');
    const kutu = document.createElement('div'); kutu.className = 'gs-baslik-liste'; ls?.prepend(kutu); L._bl = kutu;
    bindScroll(ls?.querySelector('[data-id="list_scroll"]'), kutu);
    const ac = () => { listeAcik = !listeAcik; if (bl) bl.hidden = !listeAcik; };
    L.click('btn_open_title', ac); L.get('cur_title')?.addEventListener('click', (e) => { e.stopPropagation(); ac(); });
    kutu.innerHTML = TURLER.map(([id, ad]) => `<div class="gs-baslik" data-t="${id}">${esc(ad)}</div>`).join('');
    kutu.querySelectorAll('.gs-baslik').forEach((d) => (d.onclick = (e) => { e.stopPropagation(); tur = Number(d.dataset.t); listeAcik = false; if (bl) bl.hidden = true; yukle(); }));
    if (bl) bl.hidden = true;
    L.show('base_fluctuation', false); L.show('str_fluctuation', false);
  }
  async function yukle() {
    const T = TURLER.find((t) => t[0] === tur) || TURLER[0];
    L.text('cur_title', T[1]); L.text('information_0', T[2]); L.text('information_1', T[3]); L.text('information_2', '');
    const i2 = L.get('information_2'); if (i2) i2.innerHTML = `<span class="gs-mavi">${esc(T[4])}</span>`;
    L._bl?.querySelectorAll('.gs-baslik').forEach((d) => d.classList.toggle('secili', Number(d.dataset.t) === tur));
    const { data, error } = await sb.rpc('gunluk_sira_liste', { p_char: character.id, p_tur: tur });
    veri = error ? { liste: [], ben: null } : data;
    ciz();
  }
  function ciz() {
    const l = veri?.liste || [];
    for (let i = 0; i < 3; i++) L.text('rank_top_' + (i + 1), l[i]?.ad || '');
    L._alan.innerHTML = l.map((r) => `<div class="gs-satir"><span class="gs-no">${r.sira}</span><span class="gs-ad">${esc(r.ad)}</span></div>`).join('') || '<div class="gs-bos">No ranking yet.</div>';
    L._alan.scrollTop = 0;
    L.text('myrank', veri?.ben ? `${veri.ben.sira}` : '-');
  }
  L.el.hidden = false; L.el.style.zIndex = 4200;
  if (!L.el.style.left) { L.el.style.left = Math.max(10, (innerWidth - 583) / 2) + 'px'; L.el.style.top = Math.max(10, (innerHeight - 495) / 2) + 'px'; }
  await yukle();
}
