// (3.11) KO "Character Info" (orijinal re_map_info): oyuncuya sağ tık → User Information.
// Üstte klan (ladder sırası kalkanı, klan sembolü, Clan / Grade / Leader), ortada Character name / Level / Job / Cont/Ladder / Status / Relation,
// altta Daily Rank sıraları (Honor of Grand Merchant … Disciple of Charon), en altta Confirm. Sunucu: oyuncu_bilgi(p_char, p_hedef).
import { ekUI, hasLayout, buildLayout, draggable } from './kui.js';

const JOB = {
  1: { 1: 'Warrior', 2: 'Rogue', 3: 'Magician', 4: 'Priest', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Necromancer', 11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Berserker Kurian', 15: 'Guardian Kurian' },
  2: { 1: 'Warrior', 2: 'Rogue', 3: 'Magician', 4: 'Priest', 5: 'Blade', 6: 'Protector', 7: 'Ranger', 8: 'Assassin', 9: 'Mage', 10: 'Enchanter', 11: 'Cleric', 12: 'Druid', 13: 'Porutu', 14: 'Berserker Porutu', 15: 'Guardian Porutu' },
};
const TUR = [[0, 'Honor of Grand Merchant'], [1, 'Knight of Adonis'], [2, 'Hero of Chaos'], [4, 'Apprentice of Shozin'], [5, 'Conqueror of Draki'], [6, 'Disciple of Charon']];
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
let L = null;

export async function karakterBilgiAc({ sb, character, hud, hedef }) {
  if (!(await ekUI('karinfo').catch(() => false)) || !hasLayout('re_map_info')) return false;
  const { data: d, error } = await sb.rpc('oyuncu_bilgi', { p_char: character.id, p_hedef: Number(hedef) });
  if (error || !d) { hud?.notice?.(error?.message || 'The player could not be found.', 'hata'); return true; }
  if (!d.ok) { hud?.notice?.(d.reason, 'hata'); return true; }
  if (!L) {
    L = buildLayout('re_map_info', { className: 'ko-karinfo ko-pencere kui-dokulu' });
    (document.getElementById('kohud') || document.body).append(L.el); draggable(L, 110);
    L.el.style.pointerEvents = 'auto'; L.el.style.zIndex = 4300;
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    L.el.addEventListener('contextmenu', (e) => e.preventDefault());
    L.click('btn_ok', () => { L.el.hidden = true; });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && L && !L.el.hidden) L.el.hidden = true; });
    for (const t of L.el.querySelectorAll('.kui-tx')) if (/^Character Info$/i.test(t.textContent.trim())) t.classList.add('kb-baslik');
    // madalya yuvalarının (icon_level_*) "1" yer tutucuları ve Friend / Guild etiketleri KO'da boş
    for (const t of L.el.querySelectorAll('[data-id^="icon_level_"]')) { t.textContent = ''; if (/^icon_level_\d_\d$/.test(t.dataset.id)) t.classList.add('kb-madalya'); else t.hidden = true; }
    L.text('str_friend', ''); L.text('str_guild', '');
    // klan ladder sırası kalkanı: ilk dört sıra dışındakiler varsayılan kalkan (img_background_4)
    L.text('rank', '');
    const x = Math.max(8, Math.round((innerWidth - 604) / 2)), y = Math.max(8, Math.round((innerHeight - 694) / 2));
    L.el.style.left = x + 'px'; L.el.style.top = y + 'px';
  }
  const dusman = Number(d.nation) !== Number(character.nation);
  L.text('str_name', d.name || '');
  for (const e of L.all('str_name')) e.style.setProperty('color', dusman ? '#ff5a5a' : '#f5d985', 'important');
  L.text('str_lev', `${d.level} / 0`);
  L.text('str_job', JOB[Number(d.nation) === 2 ? 2 : 1][Number(d.class) % 100] || '-');
  L.text('str_realmpoint', fmt(d.np));
  L.text('str_radder', String(d.sira?.['1'] ?? 0));
  L.text('str_state', 'Online');
  L.text('str_relation', d.iliski || '-');
  L.text('str_clanname', d.klan || '-');
  L.text('str_rank', d.klan ? `Clan ${d.klan_derece} grade.` : '-');
  L.text('str_master', d.klan_lider || '-');
  // klan ladder sırası kalkanı (KO): 1-3 numaralı madalyalı kalkan, diğerleri düz altın kalkan (img_background_0)
  const ks = Number(d.klan_sira) || 0;
  for (let i = 0; i <= 4; i++) for (const e of L.all('img_background_' + i)) e.hidden = i !== (ks >= 1 && ks <= 3 ? ks : 0);
  // klan sembolü (yoksa KO varsayılan kalkanı)
  for (const m of L.all('img_clanmark')) {
    if (d.klan_sembol) { m.dataset.eskiBg ??= m.style.background; m.style.background = `url("${d.klan_sembol}") center / 100% 100% no-repeat`; m.style.imageRendering = /^data:image\/png/.test(d.klan_sembol) ? 'pixelated' : 'auto'; }
    else if (m.dataset.eskiBg != null) m.style.background = m.dataset.eskiBg;
  }
  // Daily Rank satırları: sıra yoksa "-"; ilk 100 mavi, ilk 1000 yeşil
  TUR.forEach(([tur, ad], i) => {
    L.text('title_' + i, ad);
    const s = d.sira?.[String(tur)];
    L.text('rank_' + i, s ? String(s) : '-');
    for (const e of L.all('rank_' + i)) e.style.setProperty('color', !s ? '#ffffff' : s <= 100 ? '#3f8fff' : s <= 1000 ? '#25b33a' : '#ffffff', 'important');
  });
  L.el.hidden = false;
  return true;
}
