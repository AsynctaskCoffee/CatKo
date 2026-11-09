// KO seçenekler penceresi — orijinal KnightOnlineEn re_seed_helper.uif (Seed yardımcısı): solda seçenek kategorileri
// (Game option1 / Game option2 / Graphic / Effect / Sound / Familiar / Looting / Language / HUD / Font option1-2), üstte Seed portresi
// (npcimg\seed_base.dxt) ve konuşma metni, altta Mission / Help / Story / Find.M / Option sekmeleri ve "Save Settings".
// Varsayılanlar KnightOnlineEn Option.ini'den. Yalnız KO'daki ayarlar gösterilir; görüntü ayarları (DX, renk, gölge …) herkes için
// standart (ayar_standart: AugusteRodin'in görüntü ayarı) ve pencerede yer almaz.
import { hasLayout, buildLayout, draggable, ekUI } from './kui.js';
import { bindScroll } from './hud.js';

export async function secenekHazir() { await ekUI('secek').catch(() => false); return (await ekUI('seed')) && hasLayout('re_seed_helper'); }

// Option.ini (KnightOnlineEn) varsayılanları
export const KO_VARSAYILAN = {
  seed: false, gorevYardim: false, takasRet: false, partiRet: false, sohbetGizle: false, bilgiGizle: false, madenGizle: false, cpu: true,
  buffSatir: 20, hedefTip: 0, beceriSimge: true, skorKalin: true, ekTakas: true,
  silahFx: true, esyaFx: true, pencere: true, film: true, odak: 50, kare: 60,
  fareHiz: 5, zoomKilit: true, hedefFx: true, mobBalon: true, klavyeIpucu: true, yerelFx: true, npcFx: true, deprem: true,
  petBalon: false, petSaydam: 0, petSayLoot: false,
  dil: 'en',
  hpAcik: true, hpKilit: true, hpIpucu: true, hpKomutan: false, hpOrijinal: false, hpAna: true, hpYon: 'v',
  idBoy: 12, klanBoy: 14, idKalin: false, klanKalin: false, ipucuBoy: 13, ipucuKalin: false, ipucuArka: false,
  sohbetBoy: 10, mesajBoy: 10, fisiltiBoy: 17, simgeBoy: 9,
  skorUI: true, skorBoy: 20, yYuru: true, tamponKilit2: false,
  fisiltiGenel: true, fisiltiKlan: true, fisiltiArkadas: true,   // Whisper Mode Settings (filter_whisper_detail): PM Common / Clan/Union / Friend
  skVw: { boy: 40, hiz: 20, silHiz: 1, silOran: 7 },
  ganimet: { acik: true, aralik: 4, blur: 0, boy: 20, detay: false, gHiz: 10, gOran: 10, yHiz: 10, yOran: 10, ySil: 5 },   // Looting Effect (re_new_looting_option)
  petLootFiyat: 0, araziGorus: 'yuksek', zeminDoku: false, suYansima: true, renkFiltre: 0,   // DirectX option (re_dxtypeoptioin)   // View Option (re_skilliconvieweroption): beceriSimge = ON/OFF
};

const KATEGORI = [
  ['Game option1', 'group_option_game'], ['Game option2', 'group_option_game2'], ['Narration', 'group_option_narration'], ['Graphic option', 'group_option_grapic'],
  ['Effect option', 'group_option_effect'], ['Sound option', 'group_option_sound'], ['Voice Chatting', 'group_option_voice'], ['Familiar option', 'group_option_pet'],
  ['Looting option', 'group_option_Looting'], ['Language', 'group_option_language'], ['HUD option', 'group_option_subhp'],
  ['Font option1', 'group_option_font'], ['Font option2', 'group_option_font2'],
];
const GRUPLAR = KATEGORI.map((k) => k[1]);   // group_option altındaki tüm alt gruplar (seçili kategori dışındakiler gizli)
const SEKME = { btn_questlist: 'group_questlist', btn_help: 'group_help_content', btn_story: null, btn_questguide: 'group_questguide', btn_option: 'group_option' };   // Story: KO'da "Under construction", boş panel

// onay kutusu düğmeleri (KO CN3UIButton, check): id → [ayar, etiket]
const ONAY = {
  btn_state_seed: ['seed', 'Seed Help declined'], btn_state_quest: ['gorevYardim', 'Decline Quest Help'], btn_state_trade: ['takasRet', 'Refuse trade'],
  btn_state_party: ['partiRet', 'Refuse party'], btn_state_chat: ['sohbetGizle', 'Hide Chat Window'], btn_state_infomation: ['bilgiGizle', 'Hide Info Window'],
  btn_state_minimenu: ['madenGizle', 'Hide mine menu'], btn_state_cpu: ['cpu', 'Multi Core'],
  btn_state_weaponeffect: ['silahFx', 'Weapon Effect'], btn_state_equipmenteffect: ['esyaFx', ''], btn_state_windowmode: ['pencere', 'Window Mode'], btn_state_movie: ['film', 'Movie'],
  btn_zoom_lock: ['zoomKilit', 'Zoom Lock'], btn_target_fx: ['hedefFx', 'Target Effect'], btn_mopballoon: ['mobBalon', 'Monster Name'], btn_keyboard_tip: ['klavyeIpucu', 'Keyboard Tip'],
  btn_local_effect: ['yerelFx', 'Local Effect'], btn_fxnpc_view: ['npcFx', 'NPC Effect'], btn_fx_earthquake: ['deprem', 'Earthquake'],
  btn_state_bgm: ['muzikAcik', 'Use Background Sound'], btn_state_effectsound: ['efektSesAcik', 'Use Effect Sound'],
  btn_pet_balloon: ['petBalon', "Familiar's Chat Balloon"], btn_pet_count_loot: ['petSayLoot', 'Count Looting'],
  btn_onoff: ['hpAcik', 'Sub HP Bar'], btn_lock: ['hpKilit', 'Position Lock'], btn_tooltip: ['hpIpucu', 'Tooltip'], btn_commander_lock: ['hpKomutan', 'Commander Skill Lock'],
  btn_original: ['hpOrijinal', 'Original'], btn_mainhponoff: ['hpAna', 'Main HP Bar'],
  Btn_MyHighScore: ['skorUI', 'Use Score UI'], btn_walktogle: ['yYuru', 'Turn on Y-key Walking Mode'], Btn_Add_trade_dis: ['ekTakas', ''], btn_score_fontbold: ['skorKalin', ''],
  btn_id_bold: ['idKalin', ''], btn_clan_bold: ['klanKalin', ''], btn_tool_bold: ['ipucuKalin', ''], btn_tool_back: ['ipucuArka', ''],
};
const KALITE = [['dusuk', '800 * 600'], ['orta', '1024 * 768'], ['yuksek', '1366 * 768'], ['ultra', '1920 * 1080']];

export function secenekKO({ ayar, kaydet, character, state, hud, sb }) {
  let L = null, kategori = 0, sayfaUst = 0, sekme = 'btn_option';
  const s = () => ayar();
  const ad = () => character?.name || '';
  const konus = (t) => L?.text('txt_talk', t);

  // ---- Whisper Mode Settings (KO filter_whisper_detail): PM · Common / Clan/Union / Friend, X
  let FS = null;
  function fisiltiAc() {
    if (!hasLayout('filter_whisper_detail')) return;
    if (!FS) {
      FS = buildLayout('filter_whisper_detail', { className: 'sk-fisilti kui-dokulu' });
      L.el.append(FS.el); FS.el.addEventListener('pointerdown', (e) => e.stopPropagation());
      FS.el.style.left = '219px'; FS.el.style.top = '300px';
      FS.text('txt_title', 'PM'); FS.text('txt_common', 'Common'); FS.text('txt_clan', 'Clan/Union'); FS.text('txt_friend', 'Friend');
      for (const [id, k] of [['common', 'fisiltiGenel'], ['clan', 'fisiltiKlan'], ['friend', 'fisiltiArkadas']]) FS.click(id, () => degistir(k, s()[k] === false));
      FS.click('close', () => { FS.el.hidden = true; });
      FS.el.hidden = true;
    }
    FS.el.hidden = !FS.el.hidden; fisiltiCiz();
  }
  function fisiltiCiz() { if (!FS) return; for (const [id, k] of [['common', 'fisiltiGenel'], ['clan', 'fisiltiKlan'], ['friend', 'fisiltiArkadas']]) FS.get(id)?.classList.toggle('secili', s()[k] !== false); }
  // ---- View Option (KO re_skilliconvieweroption): Show Skill Icon → Seed penceresinin sağında; ON/OFF, Size, Moving Speed, Deleting Speed, Deleting Ratio
  let GV = null;
  const VW = () => ({ boy: 40, hiz: 20, silHiz: 1, silOran: 7, ...(s().skVw || {}) });
  function gorunumAc() {
    if (!hasLayout('re_skilliconvieweroption')) return;
    if (!GV) {
      GV = buildLayout('re_skilliconvieweroption', { className: 'sk-gorunum ko-pencere kui-dokulu' });
      (document.getElementById('kohud') || document.body).append(GV.el); draggable(GV, 40);
      GV.el.addEventListener('pointerdown', (e) => e.stopPropagation());
      GV.click('btn_close', () => { GV.el.hidden = true; });
      GV.click('btn_onoff', () => degistir('beceriSimge', s().beceriSimge === false));
      const ad = (k, d, en, ek) => () => { const v = VW(); v[k] = Math.max(en, Math.min(ek, v[k] + d)); degistir('skVw', v); };
      GV.click('btn_sizeup', ad('boy', 1, 10, 100)); GV.click('btn_sizedown', ad('boy', -1, 10, 100));
      GV.click('btn_speedup', ad('hiz', 1, 1, 50)); GV.click('btn_speeddown', ad('hiz', -1, 1, 50));
      GV.click('btn_fadeup', ad('silHiz', 1, 1, 10)); GV.click('btn_fadedown', ad('silHiz', -1, 1, 10));
      GV.click('btn_percentup', ad('silOran', 1, 1, 10)); GV.click('btn_percentdown', ad('silOran', -1, 1, 10));
      GV.el.hidden = true;
    }
    if (!GV.el.hidden) { GV.el.hidden = true; return; }
    const r = L.el.getBoundingClientRect(), z = L.el.offsetWidth ? r.width / L.el.offsetWidth : 1;
    GV.el.style.left = Math.min(innerWidth - 300 * z, r.right + 8) / z + 'px'; GV.el.style.top = (r.top + 40 * z) / z + 'px';
    GV.el.hidden = false; GV.el.style.zIndex = 4150; gorunumCiz();
  }
  function gorunumCiz() {
    if (!GV) return; const v = VW(), on = s().beceriSimge !== false;
    GV.text('str_onoff', on ? 'ON' : 'OFF'); GV.get('btn_onoff')?.classList.toggle('secili', !on);   // st0 mavi = ON, st1 gri = OFF
    GV.text('str_size', String(v.boy)); GV.text('str_speed', String(v.hiz)); GV.text('str_fade', String(v.silHiz)); GV.text('str_percent', String(v.silOran));
  }
  // ---- Looting option → Looting Effect (KO re_new_looting_option), Seed penceresinin sağında
  let LT = null;
  const GN = () => ({ ...KO_VARSAYILAN.ganimet, ...(s().ganimet || {}) });
  const gnYaz = (p) => degistir('ganimet', { ...GN(), ...p });
  function ganimetAc() {
    if (!hasLayout('re_new_looting_option')) return;
    if (!LT) {
      LT = buildLayout('re_new_looting_option', { className: 'sk-ganimet ko-pencere kui-dokulu' });
      (document.getElementById('kohud') || document.body).append(LT.el); draggable(LT, 70);
      LT.el.addEventListener('pointerdown', (e) => e.stopPropagation());
      LT.click('btn_close', () => { LT.el.hidden = true; });
      LT.click('btn_on', () => gnYaz({ acik: true })); LT.click('btn_off', () => gnYaz({ acik: false }));
      ['btn_nomal', 'btn_magic', 'btn_rare', 'btn_craft', 'btn_unique', 'btn_upgrade'].forEach((id, i) => LT.click(id, () => gnYaz({ aralik: i })));
      ['btn_looting_soft', 'btn_looting_nomal', 'btn_looting_hard'].forEach((id, i) => LT.click(id, () => gnYaz({ blur: i })));
      LT.click('btn_custommode', () => gnYaz({ detay: !GN().detay }));
      LT.click('btn_fontsize_up', () => gnYaz({ boy: Math.min(40, GN().boy + 1) })); LT.click('btn_fontsize_down', () => gnYaz({ boy: Math.max(10, GN().boy - 1) }));
      for (const [up, dn, k, en, ek] of [['btn_imagemove_up', 'btn_imagemove_down', 'gHiz', 1, 20], ['btn_image_percent_up', 'btn_image_percent_down', 'gOran', 1, 10], ['btn_fontspeed_up', 'btn_fontspeed_down', 'yHiz', 1, 20], ['btn_font_percent_up', 'btn_font_percent_down', 'yOran', 1, 10], ['btn_textmove_up', 'btn_textmove_down', 'ySil', 1, 10]]) {
        LT.click(up, () => gnYaz({ [k]: Math.min(ek, GN()[k] + 1) })); LT.click(dn, () => gnYaz({ [k]: Math.max(en, GN()[k] - 1) }));
      }
      const ornek = LT.get('area_text'); if (ornek) { ornek.classList.add('sk-ganimet-ornek'); ornek.textContent = '0'; }
      LT.show('img_text', false);
      LT.el.hidden = true;
    }
    if (!LT.el.hidden) { LT.el.hidden = true; return; }
    const r = L.el.getBoundingClientRect(), z = L.el.offsetWidth ? r.width / L.el.offsetWidth : 1;
    LT.el.style.left = Math.min(innerWidth - 460 * z, r.right + 6) / z + 'px'; LT.el.style.top = r.top / z + 'px';
    LT.el.hidden = false; LT.el.style.zIndex = 4150; ganimetCiz();
  }
  function ganimetCiz() {
    if (!LT) return; const g = GN();
    // KO yuvarlak düğmeler: st0 mavi = seçili, st3 gri = seçili değil
    const sec = (id, on) => LT.get(id)?.classList.toggle('sk-kapali', !on);   // st0 = mavi (seçili), st3 = gri
    sec('btn_on', g.acik); sec('btn_off', !g.acik); sec('btn_custommode', !g.detay);
    ['btn_nomal', 'btn_magic', 'btn_rare', 'btn_craft', 'btn_unique', 'btn_upgrade'].forEach((id, i) => sec(id, g.aralik === i));
    ['btn_looting_soft', 'btn_looting_nomal', 'btn_looting_hard'].forEach((id, i) => sec(id, g.blur === i));
    LT.show('base_testoption', !!g.detay);
    LT.text('str_fontsize', String(g.boy));
    LT.text('str_imagemove', String(g.gHiz)); LT.text('str_image_percent', `${g.gOran}:${10 - g.gOran}`);
    LT.text('str_fontspeed', String(g.yHiz)); LT.text('str_font_percent', `${g.yOran}:${10 - g.yOran}`); LT.text('str_textmove', (g.ySil / 10).toFixed(1));
    const o = LT.get('area_text'); if (o) { o.style.fontSize = Math.round(g.boy * 2.2) + 'px'; o.style.textShadow = ['0 0 10px #ffb21e, 2px 2px 0 #000', '0 0 5px #ffb21e, 2px 2px 0 #000', '2px 2px 0 #000'][g.blur]; }
  }
  // ---- Graphic option → DirectX option (KO re_dxtypeoptioin): DirectX 11 / 9 ayrıntılı grafik ayarları, Lowest Spec Mode, APPLY
  let DX = null, dxG = null;
  const DX_YAZI = {
    btn_dx11: 'DirectX 11', btn_dx9: 'DirectX 9', str_Dx11Setting: 'Configure DirectX11 Detailed Graphics Settings', str_Dx9Setting: 'Configure DirectX9 Detailed Graphics Settings',
    str_Dx11_bump: 'Enable Texture Enhancement', Str_Dx11_Trr_Bump: 'Terrain Texture Enhancement', str_Dx11_UseShadow: '@ Use Shadows', str_Dx11_Shadow_X: 'X', str_Dx11_Shadow_Low: 'Low',
    str_Dx11_Shadow_Dynamic: 'Use Dynamic Shadows', str_Dx11_Water_Reflect: 'Use water reflection', str_Dx11_TextureFilter: '3D Clarity Improvement', str_Dx11_Light_Control: '@ Brightness',
    str_Dx11_Color_Filter: '@ Color Analysis Filter', Str_Dx11_ColorFilter_Non: 'None', Str_Dx11_ColorFilter_Red: 'Red', Str_Dx11_ColorFilter_Green: 'Green', Str_Dx11_ColorFilter_Blue: 'Blue',
    StrDx9_Shader_Use: 'Use Shader Effect', StrDx9_Shader_Quility: '@ Shadow Quality', StrDx9_Shader_Quility_X: 'X', StrDx9_Shader_Quility_Low: 'Low', StrDx9_Shader_Quility_Mid: 'Mid', StrDx9_Shader_Quility_High: 'High',
    StrDx9_Water_Quility: '@ River, Lake Quality', StrDx9_Water_Quility_Low: 'Low', StrDx9_Water_Quility_Mid: 'Mid', StrDx9_Water_Quility_High: 'High', StrDx9_Trr_Bump: 'Terrain Texture Quality',
    StrDx_Trr_Sight: '@ Terrain View', StrDx_Trr_Sight_Low: 'Low', StrDx_Trr_Sight_Mid: 'Mid', StrDx_Trr_Sight_High: 'High', StrDx_HDR: '@ Blur Effect', StrDx_AllLow: 'Lowest Spec Mode', StrDx_Aply: 'APPLY',
  };
  const RENK = [[100, 100, 100], [118, 94, 94], [94, 118, 94], [94, 94, 118]];
  function dxOku() {
    const a = s(); const golge = a.golge === false ? 0 : (a.golgeGuc ?? 45) < 40 ? 1 : 2;
    return { dx: a.dx === 'dx9' ? 'dx9' : 'dx11', bump: (a.aniso ?? 8) >= 8, bump2: !!a.zeminDoku, golge, su: a.suYansima !== false, filtre: (a.clarity ?? 0) > 0,
      parlak: Math.max(1, Math.min(10, Math.round(((a.bright ?? 100) - 60) / 8))), renk: a.renkFiltre || 0, gorus: a.araziGorus || 'yuksek', blur: (a.dxBloom ?? 45) > 0,
      shader: a.dxTone !== false, su9: a.su9 ?? 2 };
  }
  function dxAc() {
    if (!hasLayout('re_dxtypeoptioin')) return;
    if (!DX) {
      DX = buildLayout('re_dxtypeoptioin', { className: 'sk-dx ko-pencere kui-dokulu' });
      (document.getElementById('kohud') || document.body).append(DX.el); draggable(DX, 40);
      DX.el.addEventListener('pointerdown', (e) => e.stopPropagation());
      for (const [id, t] of Object.entries(DX_YAZI)) { const e = DX.get(id); if (!e) continue; const tx = e.classList.contains('kui-tx') ? e : e.querySelector('.kui-tx'); if (tx) tx.textContent = t; }
      DX.click('btn_close', () => { DX.el.hidden = true; });
      const g = (k, v) => { dxG[k] = v; dxCiz(); };
      DX.click('btn_dx11', () => g('dx', 'dx11')); DX.click('btn_dx9', () => g('dx', 'dx9'));
      DX.click('btn_bump', () => g('bump', !dxG.bump)); DX.click('btn_bump2', () => g('bump2', !dxG.bump2));
      DX.click('btn_shaow_no', () => g('golge', 0)); DX.click('btn_shaow_low', () => g('golge', 1)); DX.click('btn_shaow_high', () => g('golge', 2));
      DX.click('btn_water', () => g('su', !dxG.su)); DX.click('btn_filter', () => g('filtre', !dxG.filtre));
      DX.click('btn_down', () => g('parlak', Math.max(1, dxG.parlak - 1))); DX.click('btn_up', () => g('parlak', Math.min(10, dxG.parlak + 1)));
      for (let i = 0; i < 4; i++) DX.click('btn_cfilter_' + i, () => g('renk', i));
      DX.click('btn_dx9_shader', () => g('shader', !dxG.shader));
      DX.click('btn_dx9_shadow_no', () => g('golge', 0)); DX.click('btn_dx9_shadow_Low', () => g('golge', 1)); DX.click('btn_dx9_shadow_mid', () => g('golge', 1)); DX.click('btn_dx9_shadow_high', () => g('golge', 2));
      DX.click('btn_dx9_water_Low', () => g('su9', 0)); DX.click('btn_dx9_water_mid', () => g('su9', 1)); DX.click('btn_dx9_water_high', () => g('su9', 2));
      DX.click('btn_dx9_bump', () => g('bump2', !dxG.bump2));
      DX.click('btn_dx9_trr_Low', () => g('gorus', 'dusuk')); DX.click('btn_dx9_trr_mid', () => g('gorus', 'orta')); DX.click('btn_dx9_trr_high', () => g('gorus', 'yuksek'));
      DX.click('btn_dx9_bluer', () => g('blur', !dxG.blur));
      DX.click('btn_all_low', () => { Object.assign(dxG, { bump: false, bump2: false, golge: 0, su: false, filtre: false, renk: 0, gorus: 'dusuk', blur: false, shader: false, su9: 0 }); dxCiz(); });
      DX.click('btn_aply', () => {
        const x = dxG, RG = RENK[x.renk] || RENK[0];
        kaydet({ dx: x.dx, aniso: x.bump ? 16 : 1, zeminDoku: x.bump2, golge: x.golge > 0, golgeGuc: x.golge === 1 ? 30 : Math.max(45, s().golgeGuc ?? 45), suYansima: x.su, clarity: x.filtre ? Math.max(40, s().clarity || 0) : 0,
          bright: 60 + x.parlak * 8, renkFiltre: x.renk, r: RG[0], g: RG[1], b: RG[2], araziGorus: x.gorus, dxBloom: x.blur ? Math.max(30, s().dxBloom || 45) : 0, dxTone: x.shader, su9: x.su9,
          quality: x.gorus === 'dusuk' && !x.bump && !x.golge ? 'dusuk' : s().quality });
        onayCiz(); hud?.info?.('Graphic settings have been applied.', 'gorev'); DX.el.hidden = true;
      });
      DX.el.hidden = true;
    }
    if (!DX.el.hidden) { DX.el.hidden = true; return; }
    dxG = dxOku(); dxCiz();
    DX.el.style.left = Math.max(10, (innerWidth - 916) / 2) + 'px'; DX.el.style.top = Math.max(10, (innerHeight - 749) / 2) + 'px';
    DX.el.hidden = false; DX.el.style.zIndex = 4400;
  }
  function dxCiz() {
    const x = dxG, t = (id, v) => DX.get(id)?.classList.toggle('secili', !!v);
    t('btn_dx11', x.dx === 'dx11'); t('btn_dx9', x.dx === 'dx9');
    t('btn_bump', x.bump); t('btn_bump2', x.bump2); t('btn_shaow_no', x.golge === 0); t('btn_shaow_low', x.golge === 1); t('btn_shaow_high', x.golge === 2);
    t('btn_water', x.su); t('btn_filter', x.filtre); for (let i = 0; i < 4; i++) t('btn_cfilter_' + i, x.renk === i);
    t('btn_dx9_shader', x.shader); t('btn_dx9_shadow_no', x.golge === 0); t('btn_dx9_shadow_Low', x.golge === 1); t('btn_dx9_shadow_mid', false); t('btn_dx9_shadow_high', x.golge === 2);
    t('btn_dx9_water_Low', x.su9 === 0); t('btn_dx9_water_mid', x.su9 === 1); t('btn_dx9_water_high', x.su9 === 2); t('btn_dx9_bump', x.bump2);
    t('btn_dx9_trr_Low', x.gorus === 'dusuk'); t('btn_dx9_trr_mid', x.gorus === 'orta'); t('btn_dx9_trr_high', x.gorus === 'yuksek'); t('btn_dx9_bluer', x.blur);
    DX.text('str_bright', String(x.parlak));
    // seçili olmayan DirectX tarafı karartılır (KO base_imgCover)
    DX.el.classList.toggle('sk-dx9', x.dx === 'dx9');
    DX.text('str_tooltip', x.dx === 'dx11' ? 'The game runs with Directx11. Related options are activated. A game restart is required if necessary.' : 'The game runs with Directx9. Related options are activated. A game restart is required if necessary.');
  }
  function onayCiz() {
    for (const [id, [k]] of Object.entries(ONAY)) for (const e of L.all(id)) e.classList.toggle('secili', s()[k] !== false && !!s()[k]);
    const dil = s().dil || 'en';
    L.get('btn_state_lang_usa')?.classList.toggle('secili', dil === 'en'); L.get('btn_state_lang_turkey')?.classList.toggle('secili', dil === 'tr');
    L.text('txt_BuffLine', String(s().buffSatir ?? 20));
    L.text('txt_ScaleRate', `${((s().ui || 100) / 100).toFixed(1)} / 1.0`);
    L.text('text_speed', String(s().fareHiz ?? 5));
    L.text('txt_targettype_num', String((s().hedefTip ?? 0) + 1));
    // Game option2: hedef işareti resmi (Misc\target_symbol_plane / target_hunt_plane), skor yazı boyu, tampon çubuğu kilidi
    { const im = L.get('img_targettype'); if (im) { im.classList.add('sk-hedef'); im.style.backgroundImage = `url(./assets/ui/secek/hedef${(s().hedefTip ?? 0) % 2 + 1}.webp)`; } }
    L.text('txt_score_fontsize', String(s().skorBoy ?? 20));
    L.get('btn_buffer_pos')?.querySelectorAll('.kui-tx').forEach((t) => (t.textContent = s().tamponKilit2 === true ? 'Unlock' : 'Lock'));
    fisiltiCiz(); gorunumCiz(); ganimetCiz();
    const q = KALITE.find(([k]) => k === s().quality) || KALITE[2]; L.text('str_output_resolution', q[1]);
    L.text('chatsize', String(s().sohbetBoy)); L.text('msgsize', String(s().mesajBoy)); L.text('whispersize', String(s().fisiltiBoy)); L.text('iconsize', String(s().simgeBoy));
    L.text('str_tool_size', String(s().ipucuBoy));
    L.show('img_hor', s().hpYon !== 'v'); L.show('img_ver', s().hpYon === 'v');
    for (const [id, k] of [['btn_id_min', 10], ['btn_id_mid', 12], ['btn_id_max', 14]]) L.get(id)?.classList.toggle('secili', s().idBoy === k);
    for (const [id, k] of [['btn_clan_min', 10], ['btn_clan_mid', 12], ['btn_clan_max', 14]]) L.get(id)?.classList.toggle('secili', s().klanBoy === k);
    // kaydırma çubukları: tutamak konumu
    kaydirCiz('scroll_buff_line', (s().buffSatir ?? 20) / 20);
    kaydirCiz('scroll_scale_rate', ((s().ui || 100) - 50) / 100);
    kaydirCiz('btn_state_bgm_vol', (s().muzik ?? 40) / 100);
    kaydirCiz('btn_state_effectsound_vol', (s().efektSes ?? 40) / 100);
    kaydirCiz('scroll_mouse_roate', ((s().fareHiz ?? 5) - 1) / 9);
    kaydirCiz('scroll_pet_alpha', (s().petSaydam ?? 0) / 100);
    kaydirCiz('scroll_sight', (s().odak ?? 50) / 100);
    kaydirCiz('scroll_frame', ((s().kare ?? 60) - 20) / 124);
  }
  // KO kaydırma çubuğu (sc): ilk çocuk "tr" (iz + tutamak), sonra sol / sağ düğmeler
  const SC = {
    scroll_buff_line: ['buffSatir', 0, 20, 1], scroll_scale_rate: ['ui', 50, 150, 10], btn_state_bgm_vol: ['muzik', 0, 100, 5], btn_state_effectsound_vol: ['efektSes', 0, 100, 5],
    scroll_mouse_roate: ['fareHiz', 1, 10, 1], scroll_pet_alpha: ['petSaydam', 0, 100, 5], scroll_sight: ['odak', 0, 100, 5], scroll_frame: ['kare', 20, 144, 4],
  };
  function kaydirCiz(id, oran) {
    const sc = L.get(id); if (!sc) return;
    const tr = sc.querySelector(':scope > .kui-tr'); const tut = tr?.children[1]; if (!tr || !tut) return;
    const w = parseFloat(tr.style.width) - parseFloat(tut.style.width);
    tut.style.left = Math.round(Math.max(0, Math.min(1, oran)) * w) + 'px';
  }
  function degistir(k, v) { kaydet({ [k]: v }); onayCiz(); }
  function kaydirKur(id) {
    const [k, a, b, adim] = SC[id]; const sc = L.get(id); if (!sc) return;
    const btns = sc.querySelectorAll(':scope > .kui-btn'), tr = sc.querySelector(':scope > .kui-tr');
    const deg = (d) => degistir(k, Math.max(a, Math.min(b, (Number(s()[k]) || a) + d * adim)));
    if (btns[0]) { btns[0].classList.add('kui-tik'); btns[0].onclick = (e) => { e.stopPropagation(); deg(-1); }; }
    if (btns[1]) { btns[1].classList.add('kui-tik'); btns[1].onclick = (e) => { e.stopPropagation(); deg(1); }; }
    if (tr) {
      tr.style.pointerEvents = 'auto'; tr.style.cursor = 'pointer';
      const yer = (e) => { const r = tr.getBoundingClientRect(); const o = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); const v = Math.round((a + o * (b - a)) / adim) * adim; degistir(k, Math.max(a, Math.min(b, v))); };
      tr.onpointerdown = (e) => { e.stopPropagation(); tr.setPointerCapture(e.pointerId); yer(e); tr.onpointermove = yer; };
      tr.onpointerup = () => { tr.onpointermove = null; };
    }
  }

  function kategoriCiz() {
    const grp = L.get('group_help_menu'); if (!grp) return;
    grp.querySelectorAll('.sk-kat').forEach((e) => e.remove());
    const sablon = L.get('btn_help_menu_default'); if (!sablon) return;
    sablon.hidden = true;
    const ust = parseFloat(grp.querySelector('[data-id="tree_help_menu"]')?.style.top) || 36, gor = 9, adim = 44.5;   // ▲ (btn_up) altından ▼ (btn_down) üstüne 9 satır
    const yardimda = sekme === 'btn_help';
    const KAL = yardimda ? (YARDIM?.buyuk || []).map((b) => [b[1]]) : KATEGORI, ustI = yardimda ? 0 : sayfaUst;
    KAL.slice(ustI, ustI + gor).forEach(([etiket], i) => {
      const b = sablon.cloneNode(true); b.hidden = false; b.classList.add('sk-kat', 'kui-tik'); b.removeAttribute('data-id');
      b.style.top = (ust + 4 + i * adim) + 'px';
      b.querySelectorAll('.kui-tx').forEach((t) => (t.textContent = etiket));
      const idx = ustI + i; b.classList.toggle('secili', idx === (yardimda ? ySinif : kategori));
      b.onclick = (e) => { e.stopPropagation(); if (yardimda) { ySinif = idx; ySayfa = null; yardimCiz(); } else { kategori = idx; sekmeSec('btn_option'); } kategoriCiz(); };
      grp.append(b);
    });
    grp.querySelectorAll(':scope > .kui-tree, :scope > .kui-tn').forEach((e) => { e.hidden = true; });
  }
  function sekmeSec(id) {
    sekme = id;
    for (const b of Object.keys(SEKME)) L.get(b)?.classList.toggle('secili', b === id);
    for (const g of new Set(Object.values(SEKME))) if (g) L.show(g, false);
    if (SEKME[id]) L.show(SEKME[id], true);
    L.show('group_faq', false);
    L.show('group_help_menu', id === 'btn_option' || id === 'btn_help');   // KO: sol liste yalnız Option ve Help sekmelerinde
    kategoriCiz();
    L.get('group_option')?.querySelectorAll(':scope > [data-id^="group_option_"]').forEach((g) => { g.hidden = !(id === 'btn_option' && g.dataset.id === KATEGORI[kategori][1]); });
    if (id === 'btn_option') konus(`${ad()}, click on Save Settings to change your system settings.`);
    else if (id === 'btn_questguide') { konus(`${ad()} can undertake these missions in training.`); gorevAra(); }
    else if (id === 'btn_questlist') { konus(`${ad()} has accepted these missions.`); gorevListe(); }
    else if (id === 'btn_story') konus('Under construction');
    else if (id === 'btn_help') { konus(`What would you like to know,${ad()}?`); yardimCiz(); }
    else konus('');
  }

  // ---- Mission (KO quest list): "Current quest" · "<n>units", bölgeye göre gruplu (± aç / kapa), satır: ad [Under way] / [Complete],
  // Cancel (görevi bırak), onay kutusu (Quest tips penceresinde göster)
  const BOLGE_AD = { 21: 'Moradon', 1: 'Karus', 2: 'El Morad', 11: 'Karus Eslant', 12: 'El Morad Eslant', 71: 'Ronark Land', 72: 'Ardream', 73: 'Ronark Land Base' };
  let NPCYER = null; const kapali = new Set();
  async function gorevListe() {
    NPCYER ||= await fetch('./assets/gorev/npc_yer.json').then((r) => r.json()).catch(() => ({}));
    const g = L.get('group_questlist'); if (!g) return;
    const liste = state?.gorev?.aktifListe?.() || [];
    L.text('txt_quest_count', `${liste.length}units`);
    L.text('txt_default', '');
    let kutu = g.querySelector('.sk-gorevler');
    if (!kutu) { kutu = document.createElement('div'); kutu.className = 'sk-gorevler'; const t = L.get('tree_list') || g; (t === g ? g : t).append(kutu); bindScroll(g.querySelector(':scope > [data-id="scroll"]'), kutu); }
    const grup = new Map();
    for (const q of liste) { const b = BOLGE_AD[NPCYER[q.npc]?.[0]] || 'Moradon'; if (!grup.has(b)) grup.set(b, []); grup.get(b).push(q); }
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    kutu.innerHTML = [...grup].map(([b, qs]) => `<div class="skg-bolge" data-b="${esc(b)}"><span class="skg-pm">${kapali.has(b) ? '+' : '−'}</span>${esc(b)}</div>`
      + (kapali.has(b) ? '' : qs.map((q) => `<div class="skg-satir"><span class="skg-ad" title="${esc(q.ad)}">${esc(q.ad)}</span><span class="skg-dur">${q.bitti ? '[Complete]' : '[Under way]'}</span>`
        + `<button class="skg-iptal" data-q="${q.id}">Cancel</button><span class="skg-kutu${q.takip ? ' on' : ''}" data-t="${q.id}"></span></div>`).join(''))).join('')
      || '<div class="skg-bos">No quests in progress.</div>';
    kutu.querySelectorAll('.skg-bolge').forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); const b = e.dataset.b; if (kapali.has(b)) kapali.delete(b); else kapali.add(b); gorevListe(); }));
    kutu.querySelectorAll('.skg-iptal').forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); state?.gorev?.birak?.(Number(e.dataset.q)); }));
    kutu.querySelectorAll('.skg-kutu').forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); state?.gorev?.takipDegis?.(Number(e.dataset.t)); gorevListe(); }));
  }
  addEventListener('ko-gorev-degisti', () => { if (L && !L.el.hidden && sekme === 'btn_questlist') gorevListe(); });

  // ---- Help (KO Help_Large / Medium / Small_Class_us, FAQ_us): solda Basic / Middle / FAQ; sağda ± konu ağacı → metin sayfası + Back
  let YARDIM = null, ySinif = 0, ySayfa = null; const yAcik = new Set();
  const esc2 = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function yardimCiz() {
    if (!YARDIM) { YARDIM = await fetch('./assets/gorev/yardim.json').then((r) => r.json()).catch(() => ({ buyuk: [], orta: [], kucuk: [], faq: [] })); kategoriCiz(); }
    const g = L.get('group_help_content'); if (!g) return;
    L.show('img_default', false);
    g.querySelectorAll(':scope > [data-id="txt_default"]').forEach((e) => (e.hidden = true));
    let kutu = g.querySelector('.sk-yardim');
    if (!kutu) {
      kutu = document.createElement('div'); kutu.className = 'sk-yardim sk-gorevler';
      (g.querySelector(':scope > [data-id="tree_help_menu"]') || g).append(kutu);
      bindScroll(g.querySelector(':scope > [data-id="scroll"]'), kutu);   // KO pencerenin kendi kaydırma çubuğu (tarayıcı çubuğu yok)
      const geri = g.querySelector(':scope > [data-id="txt_back"]');
      if (geri) { geri.classList.add('kui-tik', 'sky-geri'); geri.textContent = 'Back'; geri.onclick = (e) => { e.stopPropagation(); ySayfa = null; yardimCiz(); }; }
    }
    const geri = g.querySelector(':scope > [data-id="txt_back"]'); if (geri) geri.hidden = !ySayfa;
    if (ySayfa) {   // metin sayfası: mor başlık + paragraflar
      kutu.innerHTML = `<div class="sky-baslik">${esc2(ySayfa[0])}</div>` + String(ySayfa[1] || '').split('|').map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc2(p)}</p>`).join('');
      kutu.scrollTop = 0; return;
    }
    const b = YARDIM.buyuk[ySinif]; if (!b) { kutu.innerHTML = ''; return; }
    let h = '';
    if (b[2] === 2) h = YARDIM.faq.map((f, i) => `<div class="sky-kucuk sky-faq" data-f="${i}">${esc2(f[0])}</div>`).join('');
    else for (const o of YARDIM.orta.filter((o) => o[1] === b[0])) {
      const ac = yAcik.has(o[0]);
      h += `<div class="skg-bolge" data-o="${o[0]}"><span class="skg-pm">${ac ? '−' : '+'}</span>${esc2(o[2])}</div>`;
      if (ac) h += YARDIM.kucuk.filter((k) => k[1] === o[0]).map((k, i) => `<div class="sky-kucuk${i === 0 ? ' sky-ilk' : ''}" data-k="${k[0]}">${esc2(k[2])}</div>`).join('');
    }
    kutu.innerHTML = h;
    kutu.querySelectorAll('[data-o]').forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); const id = Number(e.dataset.o); if (yAcik.has(id)) yAcik.delete(id); else yAcik.add(id); yardimCiz(); }));
    kutu.querySelectorAll('[data-k]').forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); const k = YARDIM.kucuk.find((x) => x[0] === Number(e.dataset.k)); if (k) { ySayfa = [k[2], k[3]]; yardimCiz(); } }));
    kutu.querySelectorAll('[data-f]').forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); const f = YARDIM.faq[Number(e.dataset.f)]; if (f) { ySayfa = f; yardimCiz(); } }));
  }

  // ---- Find.M (KO quest guide): seviyeye göre yapılabilecek görevler, 3'lü sayfa, See Map
  let GOREV = null, liste = [], sayfa = 0, seviyeGir = null;
  async function gorevYukle() {
    if (GOREV) return GOREV;
    const j = await fetch('./assets/gorev/gorevler.json').then((r) => r.json()).catch(() => []);
    const ulus = Number(character?.nation) || 0;
    GOREV = (Array.isArray(j) ? j : Object.values(j)).filter((g) => g.ad && g.seviye && (!g.ulus || !ulus || g.ulus === ulus));
    return GOREV;
  }
  let LVEXP = null;
  async function gorevAra() {
    await gorevYukle();
    if (!LVEXP && sb) { const { data } = await sb.from('level_up').select('*'); LVEXP = new Map((data || []).map((r) => [r.level, Number(r.exp) || 0])); }
    const lv = Number(seviyeGir?.value) || 0, benim = Number(state?.seviye?.() ?? character?.level) || 1;
    const bitti = (g) => state?.gorev?.bittiMi?.(g.id);
    liste = GOREV.filter((g) => (lv ? g.seviye === lv : g.seviye <= benim && !bitti(g))).sort((a, b) => a.seviye - b.seviye || a.id - b.id);
    sayfa = 0; gorevCiz();
  }
  function gorevCiz() {
    const top = Math.max(1, Math.ceil(liste.length / 3)); sayfa = Math.max(0, Math.min(sayfa, top - 1));
    for (let i = 0; i < 3; i++) {
      const g = liste[sayfa * 3 + i];
      for (const id of [`btn_title${i}`, `btn_select_${i}`, `text_guide${i}`, `text_lvexp_${i}`, `text_title_${i}`]) L.show(id, !!g);
      if (!g) continue;
      const lvExp = LVEXP?.get(g.seviye) || 0, yuzde = lvExp ? Math.round(((g.odul?.exp || 0) / lvExp) * 100) : 0;
      L.text(`text_title_${i}`, g.ad); L.text(`text_lvexp_${i}`, `Lv:${g.seviye}  Exp:${yuzde}%`); L.text(`text_guide${i}`, g.tanim || '');
      L.click(`btn_select_${i}`, () => haritadaGoster(g));
    }
    const pe = L.get('edit_page')?.querySelector('input'); if (pe) pe.value = String(sayfa + 1);
    L.text('text_page', `/${top}`);
  }
  let KATALOG = null;
  async function haritadaGoster(g) {
    KATALOG ||= await fetch('./assets/npc_katalog.json').then((r) => r.json()).then((j) => new Map(j.map((n) => [n.id, n.m]))).catch(() => new Map());
    const ok = await import('./gorev-harita.js').then((M) => M.gorevHaritasi({ npcId: g.npc, npcAd: g.npcAd, model: KATALOG.get(g.npc) })).catch(() => false);
    if (!ok) state?.haritaAc?.(g.npc);   // orijinal pencere yüklenemezse dünya haritası
  }

  function kur() {
    L = buildLayout('re_seed_helper', { className: 'ko-secenek ko-pencere kui-dokulu' });
    (document.getElementById('kohud') || document.body).append(L.el); draggable(L, 40);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    L.el.addEventListener('keydown', (e) => e.stopPropagation());
    L.show('img_misel', false);
    L.get('img_seed')?.classList.add('sk-portre');
    L.click('btn_close', () => kapat());
    for (const b of Object.keys(SEKME)) L.click(b, () => sekmeSec(b));
    // sol liste: yukarı / aşağı
    const hm = L.get('group_help_menu');
    hm?.querySelectorAll(':scope > [data-id="btn_up"], :scope > [data-id="btn_down"]').forEach((b) => {
      b.classList.add('kui-tik');
      b.onclick = (e) => { e.stopPropagation(); sayfaUst = Math.max(0, Math.min(KATEGORI.length - 9, sayfaUst + (b.dataset.id === 'btn_up' ? -1 : 1))); kategoriCiz(); };
    });
    // onay kutuları ve etiketleri
    for (const [id, [k, etiket]] of Object.entries(ONAY)) {
      for (const e of L.all(id)) {
        e.classList.add('kui-tik', 'sk-onay');
        e.onclick = (ev) => { ev.stopPropagation(); degistir(k, !(s()[k] !== false && !!s()[k])); };
      }
    }
    L.click('btn_state_lang_usa', () => degistir('dil', 'en')); L.click('btn_state_lang_turkey', () => degistir('dil', 'tr'));
    for (const id of Object.keys(SC)) kaydirKur(id);
    L.click('btn_left_resolution', () => { const i = KALITE.findIndex(([k]) => k === s().quality); degistir('quality', KALITE[Math.max(0, (i < 0 ? 2 : i) - 1)][0]); });
    L.click('btn_right_resolution', () => { const i = KALITE.findIndex(([k]) => k === s().quality); degistir('quality', KALITE[Math.min(KALITE.length - 1, (i < 0 ? 2 : i) + 1)][0]); });
    L.click('btn_targettype_up', () => degistir('hedefTip', ((s().hedefTip ?? 0) + 1) % 4));
    L.click('btn_targettype_down', () => degistir('hedefTip', ((s().hedefTip ?? 0) + 3) % 4));
    L.click('btn_Left', () => degistir('hpYon', s().hpYon === 'v' ? 'h' : 'v')); L.click('btn_Rihgt', () => degistir('hpYon', s().hpYon === 'v' ? 'h' : 'v'));
    for (const [id, k, d] of [['btn_chatsizeup', 'sohbetBoy', 1], ['btn_chatsizedown', 'sohbetBoy', -1], ['btn_msgsizeup', 'mesajBoy', 1], ['btn_msgsizedown', 'mesajBoy', -1],
      ['btn_whispersizeup', 'fisiltiBoy', 1], ['btn_whispersizedown', 'fisiltiBoy', -1], ['btn_iconsizeup', 'simgeBoy', 1], ['btn_iconsizedown', 'simgeBoy', -1],
      ['btn_tool_up', 'ipucuBoy', 1], ['btn_tool_down', 'ipucuBoy', -1]]) L.click(id, () => degistir(k, Math.max(8, Math.min(20, (s()[k] || 10) + d))));
    for (const [id, k, v] of [['btn_id_min', 'idBoy', 10], ['btn_id_mid', 'idBoy', 12], ['btn_id_max', 'idBoy', 14], ['btn_clan_min', 'klanBoy', 10], ['btn_clan_mid', 'klanBoy', 12], ['btn_clan_max', 'klanBoy', 14]]) L.click(id, () => degistir(k, v));
    L.text('txt_myhighscore_0', 'Use Score UI');
    L.click('btn_score_fontsize_up', () => degistir('skorBoy', Math.min(40, (s().skorBoy ?? 20) + 1)));
    L.click('btn_score_fontsize_down', () => degistir('skorBoy', Math.max(10, (s().skorBoy ?? 20) - 1)));
    L.click('btn_buffer_pos', () => degistir('tamponKilit2', s().tamponKilit2 !== true));
    L.click('btn_state_whisper', () => fisiltiAc());
    L.click('btn_skilloption', () => gorunumAc());
    L.click('btn_newlooting', () => ganimetAc());
    L.click('Btn_Dx', () => dxAc());
    { const pf = L.input('edit_pet_loot_money', { type: 'text', maxLength: 10 }); if (pf) { pf.value = String(s().petLootFiyat || 0); pf.addEventListener('keydown', (e) => e.stopPropagation()); L._petFiyat = pf; } }
    L.click('btn_pet_loot_money', () => { const v = Math.max(0, Math.floor(Number(String(L._petFiyat?.value || '0').replace(/\D/g, '')) || 0)); degistir('petLootFiyat', v); hud?.info?.(`Familiar looting: only items with a shop price of ${v.toLocaleString('en-US')} Noah and above.`, 'gorev'); });
    L.click('btn_save', () => { kaydet({}, true); hud?.info?.('Your system settings have been saved.', 'gorev'); });
    L.text('txt_frame_ver', `Frame ${Math.round(state?.fps?.() || 60)} / Ver 2.630`);
    // Find.M
    seviyeGir = L.input('edit_level', { type: 'text', maxLength: 3, placeholder: '' });
    L.text('str_text', 'Enter Level');
    seviyeGir?.addEventListener('input', () => L.show('str_text', !seviyeGir.value));
    seviyeGir?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') gorevAra(); });
    L.click('btn_check', () => gorevAra());
    L.input('edit_page', { type: 'text', maxLength: 3 })?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { sayfa = (Number(e.target.value) || 1) - 1; gorevCiz(); } });
    const gq = L.get('group_questguide');
    gq?.querySelectorAll(':scope > [data-id="btn_down"], :scope > [data-id="btn_up"]').forEach((b) => {
      b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); sayfa += b.dataset.id === 'btn_up' ? 1 : -1; gorevCiz(); };
    });
    L.show('btn_disable', false); L.show('base_search', false); L.show('base_searchoption', false);
    for (let i = 0; i < 3; i++) L.text(`text_title_${i}`, ''), L.text(`text_guide${i}`, ''), L.text(`text_lvexp_${i}`, '');
    // yalnız Option ve Find.M sekmeleri: diğerleri KO'da web sürümünde içeriksiz
    L.show('group_help_sub_menu', false); L.show('group_faq', false); L.show('group_help_content', false); L.show('group_questlist', false);
    kategoriCiz(); sekmeSec('btn_option'); onayCiz();
  }
  function ac(sk) {
    if (!L) kur();
    if (sk) sekme = sk;
    L.el.hidden = false; onayCiz(); kategoriCiz(); sekmeSec(sekme);
    L.el.style.zIndex = 4100;
  }
  function kapat() { if (L) L.el.hidden = true; for (const w of [GV, LT, DX]) if (w) w.el.hidden = true; }
  return { ac, kapat, toggle(sk) { if (L && !L.el.hidden && (!sk || sk === sekme)) kapat(); else ac(sk); }, get acik() { return !!L && !L.el.hidden; } };
}
