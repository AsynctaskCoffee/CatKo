// KO arayüzü: durum çubuğu (can/mana), hedef çubuğu, kısayol çubuğu, görev çubuğu + EXP, sohbet, mini harita.
// assets/ui (orijinal .uif + ui\*.dxt dönüştürülmüş) varsa orijinal yerleşim ve grafikler kullanılır (applyKO);
// yoksa aşağıdaki sade HTML düzeni yedek olarak kalır. Öğe kimlikleri iki durumda da aynıdır.
import { yanAcildi } from './yan-pencere.js';
import { sandikEl, dropAc, dropKapat, dropOnYukle } from './mob-drop.js';
import { initYetenekPenceresi } from './yetenek.js';
import { sesUi } from './ses.js';
import { loadUI, buildLayout, hasLayout, draggable, paintSprite, findSprite, ekUI } from './kui.js';
import { enMesaj, trYedek } from './sunucu-mesaj.js';
const MARKUP = `<div id="hud" hidden>
  <div id="durum" class="ko-hud">
    <div class="durum-ust"><span id="d-ad"></span><span id="d-sv"></span></div>
    <div class="bar can"><i></i><span></span></div>
    <div class="bar mana"><i></i><span></span></div>
  </div>
  <div id="hedef" class="ko-hud" hidden>
    <div class="hedef-ad"><span id="h-ad"></span><span id="h-sv"></span></div>
    <div class="bar can"><i></i><span></span></div>
  </div>
  <div id="ust" hidden style="display:none">
    <a href="oyun.html" class="geri" title="Karakter seçimine dön">⟵</a>
    <span id="cevrimici">bağlanıyor…</span>
    <span id="fps"></span>
  </div>
  <div id="mini">
    <img id="mini-img" alt="">
    <canvas id="mini-dot" width="200" height="200" title="Tıkla: oraya git"></canvas>
    <div id="konum"></div>
  </div>
  <div id="sohbet">
    <div class="sohbet-sekme"><button class="on">Tümü</button><button>Genel</button><button>Parti</button><button>Klan</button></div>
    <div id="sohbet-mesajlar"></div>
    <input id="sohbet-giris" maxlength="200" placeholder="" autocomplete="off">
  </div>
  <div id="alt">
    <div id="kisayol">
      <button class="sayfa" data-a="sayfa-">▲</button><b id="sayfa-no">1</b><button class="sayfa" data-a="sayfa+">▼</button>
      <div class="slotlar"></div>
    </div>
    <div id="menu">
      <button data-m="karakter" title="Karakter (U)">U</button>
      <button data-m="envanter" title="Envanter (I)">I</button>
      <button data-m="beceri" title="Beceriler (K)">K</button>
      <button data-m="parti" title="Parti (P)">P</button>
      <button data-m="klan" title="Klan (G)">G</button>
      <button data-m="gorev" title="Görevler (Q)">Q</button>
      <button data-m="ayar" title="Ayarlar (O)">O</button>
    </div>
  </div>
  <div id="exp"><i></i><span></span></div>
  <div id="bildirim"></div>
  <div id="olum" class="ko-panel" hidden><div class="ko-baslik">Öldün</div><p>Moradon'da dirilmek için tıkla.</p><div class="ko-dugmeler"><button class="ko-btn" id="dir">Diril</button></div></div>
  <div id="pencere" class="ko-panel" hidden></div>
  <div id="yardim">
    <b>Sol tık</b> yürü / hedef seç · <b>Çift tık</b> saldır · <b>Z</b> en yakın canavar · <b>R</b> saldır · <b>T</b> koş/yürü · <b>W/S A/D</b> hareket · <b>C</b> otur/kalk · <b>U</b> karakter · <b>L</b> posta · <b>M</b> harita · <b>Enter</b> sohbet
  </div>
</div>`;

const $ = (id) => document.getElementById(id);
export function ensureHud() {
  if ($('hud')) return;
  const t = document.createElement('template'); t.innerHTML = MARKUP; document.body.append(t.content);
  const slots = document.querySelector('#kisayol .slotlar');
  for (let i = 1; i <= 10; i++) slots.insertAdjacentHTML('beforeend', `<div class="slot" data-i="${i}"><span class="tus">${i % 10}</span><span class="ikon"></span><i class="bekleme"></i></div>`);
}
ensureHud();

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
function setBar(el, v, max, txt = true) {
  const p = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
  el.querySelector('i').style.width = (p * 100).toFixed(1) + '%';
  if (txt) el.querySelector('span').textContent = `${fmt(v)} / ${fmt(max)}`;
}

// ── orijinal KO arayüzü (v2038 "re_" seti)
const UI_BASE = new URL('../assets/ui', import.meta.url).href.replace(/\/$/, '');
// Karakter Bilgisi penceresine "Başarım" sekmesi (KO: Klan'ın yanı). Görüntü: btn_friends sekmesinin yazısız hali (assets/basarim/sekme.png, 4 durum)
const SEKME_PNG = new URL('../assets/basarim/sekme.png', import.meta.url).href;
function basarimSekmesi(L, x, y, secili, fn) {
  // orijinal KO çerçevesinde (re_various_frame / re_clan_window …) Achieve sekmesi kendi düğmesi: btn_title
  const kendi = L.get?.('btn_title');
  if (kendi && !kendi.closest('.ko-bs-sekme2')) {
    kendi.hidden = false; kendi.title = 'Achieve'; kendi.classList.add('kui-tik', 'ko-bs-sekme2'); if (secili) kendi.classList.add('secili');
    kendi.onclick = (ev) => { ev.stopPropagation(); fn(); };
    return kendi;
  }
  // KO 2369: unvan penceresindeki (re_title_window) "Achieve" sekmesinin kendisi — diğer sekmelerle aynı yazılı görsel ve durumlar
  if (hasLayout('re_title_window')) {
    const tw = buildLayout('re_title_window'), k = tw.get('btn_title');
    if (k) {
      const b = k.cloneNode(true); b.dataset.id = 'btn_basarim'; b.hidden = false; b.title = 'Achieve';
      b.style.left = x + 'px'; b.style.top = y + 'px'; b.classList.add('kui-tik', 'ko-bs-sekme2'); if (secili) b.classList.add('secili');
      b.onclick = (ev) => { ev.stopPropagation(); fn(); };
      L.el.append(b); return b;
    }
  }
  const b = document.createElement('div'); b.className = 'kui kui-btn kui-tik ko-bs-sekme' + (secili ? ' secili' : ''); b.dataset.id = 'btn_basarim';
  b.style.cssText = `left:${x}px;top:${y}px;width:63px;height:30px;`; b.title = 'Achieve';
  for (let i = 0; i < 4; i++) { const im = document.createElement('div'); im.className = 'kui kui-img st' + i; im.style.cssText = `left:0;top:0;width:63px;height:30px;background:url(${SEKME_PNG}) 0 ${-30 * i}px / 63px 120px no-repeat;`; b.append(im); }
  const t = document.createElement('div'); t.className = 'kui kui-tx'; t.textContent = 'Achieve'; t.style.cssText = 'left:0;top:0;width:63px;height:30px;justify-content:center;align-items:center;'; b.append(t);
  b.onclick = (ev) => { ev.stopPropagation(); fn(); };
  L.el.append(b); return b;
}
let charStats = null;
/** Karakter Bilgisi sekmeleri arasında geçiş: yeni pencere aynı yerde açılır */
// sekme geçişi: yeni pencere eskisinin ekrandaki yerinde açılır (stil boşsa da — CSS ile konumlu ilk açılış: offsetLeft/Top)
const yerKopya = (from, to) => { if (!from?.el || !to?.el) return; to.el.style.left = (from.el.offsetLeft || parseFloat(from.el.style.left) || 0) + 'px'; to.el.style.top = (from.el.offsetTop || parseFloat(from.el.style.top) || 0) + 'px'; };
// Karakter Bilgisi pencerelerinin başlığı: re_various_frame'in kalın "Character Info" yazısı, Klan / Achieve pencerelerinin dokusundaki ince "Character info" ile aynı tip
// Klan / Achieve pencerelerinin dokuya gömülü "Character info" başlık resmi (86×17, üstte) gizlenir; yerine Friend / Karakter Bilgisi
// sekmesindeki başlıkla aynı yazı (HTML, .baslik-ince) konur
function baslikGomulu(w) {
  for (const e of w.el.querySelectorAll('.kui-img')) {
    const st = e.style; if (st.width !== '86px' || st.height !== '17px' || (parseFloat(st.top) || 0) > 32 || e.dataset.baslik) continue;
    e.dataset.baslik = '1'; e.style.visibility = 'hidden';
    const b = document.createElement('div'); b.className = 'kui kui-tx baslik-ince'; b.textContent = 'Character info';
    b.style.cssText = `position:absolute;left:${parseFloat(st.left) - 30}px;top:${parseFloat(st.top) - 1}px;width:146px;height:19px;justify-content:center;align-items:center;pointer-events:none;`;
    e.after(b);
  }
}
function baslikInce(w) { for (const t of w.el.querySelectorAll('.kui-tx')) if (/^Character Info$/i.test(t.textContent.trim())) { t.textContent = 'Character info'; t.classList.add('baslik-ince'); } }
function sekmeGec(from, hedef) {
  const ad = { karakter: 'state', klan: 'klan', basarim: 'basarim', arkadas: 'arkadas', unvan: 'unvan' }[hedef], to = KO?.[ad]; if (!to || to === from) return;
  yerKopya(from, to); from.el.hidden = true;
  if (to.el.hidden) hud.panel(hedef);
}
// KO: kasaba / kale / Ardream haritalarında yaratık seviyesi hedef çerçevesinde yazmaz
const SEVIYESIZ = new Set(['moradon', 'freezone_a', 'freezone_b', 'freezone_c', 'elmo2004', 'karus2004']);
// oyuncular birbirinin seviyesini hedef çerçevesinde (can çubuğunun yanında) görmez: seviye yalnız canavarlarda yazar
const seviyeGizli = (t) => !t?.mob || SEVIYESIZ.has(String(zoneId || '').toLowerCase());
let KO = null, nation = 1, koReady = null, lastStats = null, lastTarget = null, bound = null, miniZoom = 1, zoneName = 'Moradon', zoneId = 'moradon';

const TR = {
  Normal: 'Genel', Private: 'Özel', Shout: 'Bağır', Party: 'Parti', Clan: 'Klan', Ally: 'Birlik', Chat: 'Sohbet', Knights: 'Şövalye',
  Level: 'Seviye', Nation: 'Ulus', EXP: 'EXP', Manner: 'Nezaket', Attack: 'Saldırı', Defence: 'Savunma', 'Stat Point': 'Stat Puanı', Resistance: 'Direnç',
  Fire: 'Ateş', Ice: 'Buz', Lightning: 'Şimşek', Magic: 'Büyü', Dark: 'Karanlık', Poison: 'Zehir',
  Weight: 'Ağırlık', Information: 'Bilgi', Character: 'Karakter', Page: 'Sayfa', 'Skill Point': 'Beceri Puanı', 'Contribut      iveness': 'Ulus Puanı',
};
const translate = (L) => L.el.querySelectorAll('.kui-tx').forEach((e) => { const t = e.textContent.trim(); if (TR[t] != null) e.textContent = TR[t]; });
const menuClick = (m) => document.querySelector(`#menu [data-m="${m}"]`)?.click();
// (7.11) KO meslek adları (Texts_us 1401–1426, 3610–3611), ulusa göre (klan.js sinifAdi ile aynı)
const CLS_U = { 1: { 1: 'Warrior', 5: 'Berserker', 6: 'Berserker Hero', 2: 'Rogue', 7: 'Hunter', 8: 'Shadow Vain', 3: 'Magician', 9: 'Sorcerer', 10: 'Elemental Lord', 4: 'Priest', 11: 'Shaman', 12: 'Shadow Knight', 13: 'Kurian', 14: 'Dafne', 15: 'Dafne Hero' },
  2: { 1: 'Warrior', 5: 'Blade', 6: 'Blade Master', 2: 'Rogue', 7: 'Ranger', 8: 'Kasar Hood', 3: 'Magician', 9: 'Mage', 10: 'Arch Mage', 4: 'Priest', 11: 'Cleric', 12: 'Paladin', 13: 'Porutu', 14: 'Bureka', 15: 'Bureka Master' } };
const CLS = CLS_U[1];

function applyKO() {
  if (koReady) return koReady;
  koReady = (async () => {
    await loadUI(UI_BASE);
    await ekUI('arkadas').catch(() => false);
    await ekUI('yeniui').catch(() => false);
    await ekUI('orj').catch(() => false);
    await ekUI('hedeforj').catch(() => false);   // (31.10) KO orijinal hedef can çubuğu (re_target_framebar, frame_4: sembol kutusu + ok ucu)   // orijinal KO (NTTGame KnightOnlineEn) yerleşimleri — aynı adlı v2038 yerleşimlerinin üstüne yazar (uyumsuz olanlar: hpbar, hotkey, chatting_box, target_framebar, genie, tradeprice/inventory hariç)   // DeaFSoft 2369 özel yerleşimleri (.dfsoft çözülmüş: re_taskbar_main, re_inventory …) — aynı adlı v2038 yerleşimlerinin üstüne yazar   // deadsoft 2369 yeni pencereler: re_page_state (statü), re_taskbar_sub, re_transaction, re_quest_npc_menu, re_title_window, re_skill   // deadsoft re_page_friends + re_minimenu (arkadaş listesi, oyuncu sağ tık menüsü)
    const pre = nation === 2 ? 'el' : 'ka';
    const need = ['re_hpbar', 're_hotkey', 're_taskbar_main', `${pre}_chat_us`, 're_target_framebar', 're_minimap', 're_resurrection', 're_exitmenu', 're_messagebox'];
    if (!need.every(hasLayout)) throw new Error('eksik yerleşim');
    const root = $('hud'); root.classList.add('ko-orijinal');
    const layer = document.createElement('div'); layer.id = 'kohud'; root.prepend(layer);
    const L = {};
    const add = (key, name, cls) => { const l = buildLayout(name, { className: cls }); translate(l); layer.append(l.el); return (L[key] = l); };

    // can / mana (sol üst)                                                      re_hpbar
    const hp = add('hp', 're_hpbar', 'ko-hp');
    for (const id of ['progress_HP_slow', 'progress_HP_drop', 'progress_HP_undead', 'progress_HP_lasting', 'img_mail_on', 'img_mail_normal', 'img_Reporter']) hp.show(id, false);
    // KO posta kutusu: can çubuğunun yanındaki zarf (okunmamış mail varsa img_mail_on yanar)
    for (const id of ['img_mail_normal', 'img_mail_on']) hp.all(id).forEach((e) => { e.style.pointerEvents = 'auto'; e.style.cursor = 'pointer'; e.title = 'Posta kutusu (L)'; e.classList.add('ko-mail-zarf'); e.addEventListener('click', (ev) => { ev.stopPropagation(); hud._mail?.(); }); e.addEventListener('pointerdown', (ev) => ev.stopPropagation()); });
    for (const id of ['Text_HP', 'Text_MSP', 'text_level_id', 'Text_rest']) hp.text(id, '');
    // mananın altındaki ince çubuk (Progress_rest) → yeşil EXP çubuğu, yazı ortada
    // mananın altındaki ince çubuk (Progress_rest) kaldırıldı; yerinde konum (X / Z) yazısı — mini haritadan taşındı
    hp.show('Progress_rest', false);
    hp.text('Text_rest', '');
    // orijinal KO re_hpbar: mananın altında Vitality (progress_VP / Text_VP) — bizde karşılığı yok, gizli
    hp.show('progress_VP', false); hp.text('Text_VP', '');
    // hedef (üst orta)                                                          re_target_framebar
    const tg = add('target', hasLayout('re_target_framebar_orj') ? 're_target_framebar_orj' : 're_target_framebar', 'ko-target');
    if (tg.get('frame_0')) {
      // orijinal KO: çerçeveler frame_0..11 (canavar türüne göre), can çubuğu base_mon_hp_level, ad 'name'
      tg.el.classList.add('ko-target-orj');
      const FR = tg.get('frame_4') ? 4 : 0;   // KO: oyuncu / canavar hedefi — solda sembol kutusu, sağda ok ucu (frame_4)
      for (let i = 0; i < 12; i++) if (i !== FR) tg.show('frame_' + i, false);
      tg.markEl = tg.get('frame_' + FR)?.querySelector('[data-id="mark_pos"]') || null;
      if (tg.markEl) { const m = document.createElement('div'); m.className = 'hd-isaret'; tg.el.append(m); tg.isaret = m; }
      // (31.10) çerçeve seçimi: oyuncunun rütbesine göre iyiden kötüye frame_10 … frame_5, kral frame_11 (K), rütbesiz / canavar frame_4
      tg.cerceve = (fr) => {
        if (tg._fr === fr) return; tg._fr = fr;
        for (let i = 0; i < 12; i++) tg.show('frame_' + i, i === fr);
        const F = tg.get('frame_' + fr), mk = F?.querySelector('[data-id="mark_pos"]');
        if (mk && tg.isaret) { tg.isaret.style.left = (parseFloat(mk.style.left) + parseFloat(F.style.left || 0) - 1) + 'px'; tg.isaret.style.top = (parseFloat(mk.style.top) + parseFloat(F.style.top || 0) - 1) + 'px'; }
      };
      tg.cerceve(FR);
      for (const g of ['base_mon_hp_level_long', 'base_player_hp_state', 'base_cover', 'base_EventDropList', 'Button_Board']) tg.show(g, false);
      tg.get('base_mon_hp_level')?.querySelectorAll('[data-id^="grpg_level_"]').forEach((e) => (e.hidden = e.dataset.id !== 'grpg_level_0'));
      tg.adEl = tg.el.querySelector(':scope > [data-id="name"]') || tg.get('name');
      tg.barEl = tg.get('base_mon_hp_level')?.querySelector('[data-id="grpg_level_0"]');
    } else {
      for (const g of ['group_type1', 'group_type2', 'group_type3', 'group_type4', 'group_type5', 'Button_Board']) tg.show(g, false);
      const t0 = tg.get('group_type0');
      t0.querySelectorAll('[data-id^="grpg_level_"]').forEach((e) => (e.hidden = e.dataset.id !== 'grpg_level_0'));
      tg.adEl = t0.querySelector('[data-id="str_mobname"]'); tg.barEl = t0.querySelector('[data-id="grpg_level_0"]');
    }
    tg.el.hidden = true;
    // hedef çerçevesi gizli başlar → tarayıcı dokusunu ilk seçimde indirir/çözer ve can çubuğu bir süre siyah görünür: dokuları önceden yükle
    { const urls = new Set(); tg.el.querySelectorAll('.kui-img').forEach((e) => { const m = /url\("?([^")]+)"?\)/.exec(e.style.backgroundImage || ''); if (m) urls.add(m[1]); });
      for (const u of urls) { const im = new Image(); im.decoding = 'async'; im.src = u; im.decode?.().catch(() => {}); } }
    // mini harita (sağ üst)                                                     re_minimap
    const mm = add('mini', 're_minimap', 'ko-mini');
    for (const id of ['Group_WarMap', 'Group_Mark', 'Group_Note', 'Group_Toggle', 'Group_Battle', 'Group_NpcList', 'btn_battle_p', 'btn_battle_n', 'btn_NpcListopen', 'Btn_WarMap', 'area_note']) mm.show(id, false);   // (31.10) A düğmesi ve alttaki saydamlık çarkı orijinaldeki gibi görünür
    const host = mm.get('Img_MiniMap');
    const zoomer = document.createElement('div'); zoomer.className = 'mini-zoom'; zoomer.append($('mini-img'), $('mini-dot')); host.append(zoomer);
    // harita adı + konum şeridi (çerçevesiyle) mini haritanın üstünden alınıp mananın altına taşınır
    { const sb = mm.get('btn_StateBar'), tp = mm.get('Text_Position'), zn = mm.get('str_zoneid');
      if (sb && tp && zn) {
        const serit = document.createElement('div'); serit.className = 'kui ko-konum-serit'; serit.style.cssText = 'left:1px;top:64px;width:240px;height:24px;';
        const cer = sb.cloneNode(true); cer.removeAttribute('data-id'); cer.style.left = '0px'; cer.style.top = '0px'; cer.style.pointerEvents = 'none'; cer.classList.remove('kui-tik');
        serit.append(cer);
        zn.style.left = '10px'; zn.style.top = '2px'; zn.style.width = '132px'; zn.style.height = '20px'; tp.style.left = '142px'; tp.style.top = '2px'; tp.style.width = '90px'; tp.style.height = '20px';
        // uzun harita adları (Luferson Castle (Karus) vb.) alana sığana kadar yazı küçülür
        const sigdir = (el, en = 11, enAz = 7) => {
          if (!el) return; const rg = document.createRange(); let f = en;
          const tasar = () => { rg.selectNodeContents(el); return rg.getBoundingClientRect().width > el.getBoundingClientRect().width - 2; };
          el.style.setProperty('font-size', f + 'px', 'important');
          while (f > enAz && tasar()) { f -= 0.5; el.style.setProperty('font-size', f + 'px', 'important'); }
        };
        new MutationObserver(() => sigdir(zn)).observe(zn, { childList: true, characterData: true, subtree: true });
        new MutationObserver(() => sigdir(tp)).observe(tp, { childList: true, characterData: true, subtree: true });
        requestAnimationFrame(() => { sigdir(zn); sigdir(tp); });
        tp.textContent = ''; tp.append($('konum')); serit.append(zn, tp);
        hp.el.append(serit); sb.hidden = true; mm.el.classList.add('serit-tasindi');
        // konum şeridine tıklayınca mini harita (N) açılır / kapanır
        serit.style.pointerEvents = 'auto'; serit.style.cursor = 'pointer'; serit.title = 'Mini harita (N)';
        serit.addEventListener('pointerdown', (e) => e.stopPropagation());
        serit.addEventListener('click', (e) => { e.stopPropagation(); const m = document.getElementById('mini'); if (!m) return; m.classList.toggle('gizli'); m.hidden = false; requestAnimationFrame(() => hud.miniYerlestir?.()); });
      } else if (tp) { tp.textContent = ''; tp.append($('konum')); } }
    mm.text('str_zoneid', zoneName);
    const setZoom = (z) => { miniZoom = Math.max(1, Math.min(4, z)); zoomer.style.transform = `scale(${miniZoom})`; };
    mm.click('Btn_ZoomIn', () => setZoom(miniZoom * 2)); mm.click('Btn_ZoomOut', () => setZoom(miniZoom / 2)); mm.click('Btn_globalmap', () => setZoom(1));
    mm.click('btn_StateBar', () => { const g = mm.get('Group_MiniMap'); g.hidden = !g.hidden; for (const id of ['Btn_ZoomIn', 'Btn_ZoomOut', 'Btn_globalmap', 'scroll_Alpah_line']) mm.show(id, !g.hidden); });
    // (31.10) KO re_minimap: btn_battle_a / _p / _n (A → P → N: haritada gösterilen oyuncular — hepsi / parti / hiçbiri) ve
    // scroll_Alpah_line (mini harita saydamlığı: − / + düğmeleri, sürüklenebilir tutamak). Ayar tarayıcıda saklanır.
    { const AY = 'ko-mini-ayar'; let ay = {}; try { ay = JSON.parse(localStorage.getItem(AY) || '{}'); } catch {}
      const kaydet = () => { try { localStorage.setItem(AY, JSON.stringify(ay)); } catch {} };
      const MOD = ['a', 'p', 'n'], MOD_AD = { a: 'Show all players', p: 'Show party members only', n: 'Hide players' };
      const modCiz = () => { const m = MOD.includes(ay.mod) ? ay.mod : 'a'; for (const k of MOD) { mm.show('btn_battle_' + k, k === m); const b = mm.get('btn_battle_' + k); if (b) b.title = MOD_AD[k]; } document.documentElement.dataset.miniOyuncu = m; };
      for (const k of MOD) mm.click('btn_battle_' + k, () => { ay.mod = MOD[(MOD.indexOf(k) + 1) % 3]; kaydet(); modCiz(); });
      modCiz();
      const sc = mm.get('scroll_Alpah_line'), tr = sc?.querySelector(':scope > .kui-tr'), tut = tr?.querySelectorAll(':scope > .kui-img')[1], [eksi, arti] = sc ? sc.querySelectorAll(':scope > .kui-btn') : [];
      const ALAN = 53 - 8, imgEl = mm.get('Img_MiniMap');
      const alfaCiz = () => { const a = Math.max(0.2, Math.min(1, ay.alfa ?? 1)); if (tut) tut.style.left = Math.round((a - 0.2) / 0.8 * ALAN) + 'px'; if (imgEl) imgEl.style.opacity = String(a); };
      const alfa = (v) => { ay.alfa = Math.round(Math.max(0.2, Math.min(1, v)) * 100) / 100; kaydet(); alfaCiz(); };
      if (sc) {
        sc.title = 'Mini map transparency'; sc.style.pointerEvents = 'auto';
        eksi?.addEventListener('click', (e) => { e.stopPropagation(); alfa((ay.alfa ?? 1) - 0.1); });
        arti?.addEventListener('click', (e) => { e.stopPropagation(); alfa((ay.alfa ?? 1) + 0.1); });
        eksi?.classList.add('kui-tik'); arti?.classList.add('kui-tik');
        const tasi = (e) => { const r = tr.getBoundingClientRect(), k = r.width / 53 || 1; alfa(0.2 + Math.max(0, Math.min(1, (e.clientX - r.left - 4 * k) / (ALAN * k))) * 0.8); };
        tr?.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); tr.setPointerCapture(e.pointerId); tasi(e); const mv = (ev) => tasi(ev), up = () => { tr.removeEventListener('pointermove', mv); tr.removeEventListener('pointerup', up); }; tr.addEventListener('pointermove', mv); tr.addEventListener('pointerup', up); });
        if (tr) tr.style.cursor = 'pointer';
      }
      alfaCiz(); }
    mm.get('Btn_ZoomIn').title = 'Zoom in'; mm.get('Btn_ZoomOut').title = 'Zoom out'; mm.get('Btn_globalmap').title = 'Whole map';
    const old = $('mini'); old.id = 'mini-eski'; old.hidden = true; mm.el.id = 'mini';   // M tuşu #mini'yi gizler/gösterir
    // mini harita kalıcı olarak sol üstte: can/mana çerçevesindeki konum (X / Z) şeridinin hemen altı (pencere boyutu / ölçek değişince yeniden)
    const miniYerlestir = () => {
      // #mini position:fixed → offsetParent yok; konum, görünen çerçevenin (img_bord) ölçülen yerinden farkla düzeltilir
      if (mm.el.classList.contains('gizli') || mm.el.hidden) return;
      const be = mm.get('img_bord'), bord = be?.getBoundingClientRect(); if (!bord?.width) return;
      let sr = document.querySelector('.ko-konum-serit')?.getBoundingClientRect();
      // konum şeridi yoksa / gizliyse can-mana çerçevesinin altı; o da yoksa sol üst köşe — hiçbir durumda sağda kalmaz
      if (!sr?.width) { const hb = document.querySelector('.ko-hp')?.getBoundingClientRect(); sr = hb?.width ? { left: hb.left, width: bord.width, bottom: hb.bottom } : { left: 0, width: bord.width, bottom: 70 }; }
      const k = be.offsetWidth ? bord.width / be.offsetWidth : 1;
      const dx = (sr.left + sr.width / 2) - (bord.left + bord.width / 2), dy = sr.bottom - bord.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      const cs = getComputedStyle(mm.el), l = parseFloat(cs.left) || 0, t = parseFloat(cs.top) || 0;
      mm.el.style.setProperty('right', 'auto', 'important');
      mm.el.style.setProperty('left', Math.round(l + dx / k) + 'px', 'important');
      mm.el.style.setProperty('top', Math.round(t + dy / k) + 'px', 'important');
    };
    hud.miniYerlestir = miniYerlestir;
    requestAnimationFrame(miniYerlestir); setTimeout(miniYerlestir, 500); addEventListener('resize', () => requestAnimationFrame(miniYerlestir)); setInterval(miniYerlestir, 2000);
    // görev çubuğu + EXP (alt)                                                  re_taskbar_main
    const tb = add('task', 're_taskbar_main', 'ko-task');
    for (const id of ['base_uimenu', 'btn_seed_elmo', 'btn_seed_karu', 'btn_option1', 'btn_option2', 'base_Exp']) tb.show(id, false);
    tb.show('str_usernotice', false);
    const MENU = {
      btn_02: ['parti', 'Party'], btn_03: ['takas', 'Trade'],   // (3.11) kullanıcı isteği: eski parti düğmesi → Trade, arkadaşlar düğmesi → Party
      btn_04: ['beceri', 'Beceriler (K)'],
      btn_05: ['karakter', 'Karakter bilgisi (U)'], btn_06: ['envanter', 'Envanter (I)'], btn_07: ['ev', 'Kasabaya dön (ulus base\'i)'], btn_option: ['ayar', 'Seçenekler (O)'],
      btn_menu: ['sismenu', 'Menü'], btn_powerup: ['magaza', 'Güçlendirme mağazası'], btn_event: ['etkinlik', 'Etkinlikler'], btn_question: ['gorev', 'Tohum yardımcısı: görevler'],
      btn_clanadvence: ['klan', 'Klan tanıtımı'], btn_ppcard: ['magaza', 'Kart'],
      // DeaFSoft taskbar (sol dizi): günlük görev, sıralama, canavar arama, çark
      btn_daily_quest: ['gorev', 'Günlük görevler'], btn_rank: ['basarim', 'Sıralama / Başarımlar'], btn_mobsearch: ['etkinlik', 'Canavar arama'], btn_wof: ['etkinlik', 'Wheel of Fortune'],
    };
    for (const [id, [m, t]] of Object.entries(MENU)) { tb.click(id, () => (hud.panel(m) || menuClick(m))); tb.all(id).forEach((e) => (e.title = t)); }
    // KO R (btn_rank): Daily Rank penceresi (gunluk-sira.js)
    tb.click('btn_rank', () => hud.onGunlukSira?.()); tb.all('btn_rank').forEach((e) => (e.title = 'Daily Rank'));
    // KO otur / kalk düğmesi: btn_00 (ayakta) ↔ btn_01 (oturuyor); dinlen.js bağlar
    tb.click('btn_00', () => hud._otur?.()); tb.click('btn_01', () => hud._otur?.());
    tb.all('btn_00').forEach((e) => (e.title = 'Otur (C)')); tb.all('btn_01').forEach((e) => (e.title = 'Kalk (C)'));
    tb.show('btn_01', false);
    // kısayol çubuğu (10 yuva) — yatay/dikey (btn_change), tutamaktan sürüklenir, konum hatırlanır     re_hotkey
    const hk = add('hotkey', 're_hotkey', 'ko-hotkey');
    const hGroup = hk.get('Hotkey_Horizontal'), vGroup = hk.get('Hotkey_vertical');
    const inG = (g, id, sel = '') => g.querySelectorAll(`${sel}[data-id="${id}"]`);
    const slotEls = []; for (let i = 1; i <= 10; i++) slotEls.push(document.querySelector(`.slot[data-i="${i}"]`));
    for (let i = 0; i < 10; i++) { hk.text(String(20 + i), ''); inG(vGroup, String(i), '.kui-tx').forEach((e) => (e.textContent = '')); }
    let page = 1;
    const setPage = (d) => { page = ((page - 1 + d + 8) % 8) + 1; hk.text('strpage1', String(page)); hk.text('strpage0', String(page)); dispatchEvent(new CustomEvent('ko-kisayol-sayfa', { detail: page })); };
    setPage(0);
    // KO: F1–F8 ana kısayol çubuğunu o sayfaya geçirir (tarayıcının F1 yardım / F3 bul / F5 yenile işlevleri engellenir)
    addEventListener('keydown', (e) => {
      const m = /^F([1-8])$/.exec(e.key); if (!m) return;
      e.preventDefault();
      if (e.target.tagName === 'INPUT' || e.repeat) return;
      setPage(Number(m[1]) - page);
    }, true);
    const HK_KEY = 'ko-kisayol';
    let hs = { v: false, x: null, y: null }; try { hs = { ...hs, ...JSON.parse(localStorage.getItem(HK_KEY) || '{}') }; } catch {}
    const saveHs = () => { try { localStorage.setItem(HK_KEY, JSON.stringify(hs)); } catch {} };
    // (7.11) oyuna her girişte kısayol çubuğu dikey, ekranın sol kenarında ve dikeyde ortada açılır (oyun içinde taşınabilir; kilit ayarı korunur)
    hs = { ...hs, v: true, x: -1e6, y: 0, ortala: true };
    const place = () => {
      hk.el.classList.toggle('dikey', hs.v); hk.el.classList.toggle('serbest', hs.x != null);
      if (hs.x != null) {
        // görünen çerçevenin (KO görüntüleri) kenarları ekran kenarına yapışabilsin: kök kutu ile görünen kısım arasındaki boşluk hesaba katılır
        const R = hk.el.getBoundingClientRect(), g = hs.v ? vGroup : hGroup; let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
        for (const e of g.querySelectorAll('.kui-img')) { if (!e.offsetParent) continue; const q = e.getBoundingClientRect(); if (!q.width) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); }
        const k = uiScale() * 0.96;
        if (l < 1e9 && R.width) {
          const oL = (l - R.left), oT = (t - R.top), vw = r - l, vh = b - t;
          const lz = parseFloat(getComputedStyle(layer).zoom) || 1;   // --x / --y katman (kohud) biriminde
          if (hs.ortala) { hs.ortala = false; hs.y = ((innerHeight - vh) / 2 - oT) / lz; }
          hs.x = Math.max(-oL / lz, Math.min((innerWidth - oL - vw) / lz, hs.x)); hs.y = Math.max(-oT / lz, Math.min((innerHeight - oT - vh) / lz, hs.y));
        } else { const w = (hs.v ? 60 : 470) * k, h = (hs.v ? 460 : 54) * k; hs.x = Math.max(0, Math.min(innerWidth - w, hs.x)); hs.y = Math.max(0, Math.min(innerHeight - h, hs.y)); }
        hk.el.style.setProperty('--x', hs.x + 'px'); hk.el.style.setProperty('--y', hs.y + 'px');
      }
    };
    const setOrient = (v) => {
      hs.v = v; hGroup.hidden = v; vGroup.hidden = !v;
      slotEls.forEach((sl, i) => { const a = v ? vGroup.querySelector(`.kui-ar[data-id="${i}"]`) : hGroup.querySelector(`.kui-ar[data-id="${10 + i}"]`); if (a && sl) a.append(sl); });
      place();
    };
    for (const g of [hGroup, vGroup]) {
      const one = (id, fn) => inG(g, id).forEach((e) => { e.style.pointerEvents = 'auto'; e.classList.add('kui-tik'); e.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); }); });
      one('btn_up', () => setPage(-1)); one('btn_down', () => setPage(1));
      one('btn_change', () => { setOrient(!hs.v); saveHs(); });
      one('btn_lock', () => { hs.kilit = !hs.kilit; hk.el.classList.toggle('kilitli', !!hs.kilit); document.body.classList.toggle('ks-kilitli', !!hs.kilit); saveHs(); });
      inG(g, 'btn_open').forEach((e) => (e.hidden = true));
      // ok düğmesi: yanına ek kısayol çubuğu açar (en fazla 3 çubuk; kisayol.js)
      one('btn_close', () => dispatchEvent(new CustomEvent('ko-kisayol-ek')));
      inG(g, 'btn_close').forEach((e) => (e.title = 'Yeni kısayol çubuğu ekle (en fazla 3)'));
      inG(g, 'btn_change').forEach((e) => (e.title = 'Döndür (yatay / dikey)'));
      inG(g, 'btn_lock').forEach((e) => (e.title = 'Kilit: kapalı kilit = yetenekler sürüklenemez, açık kilit = sürüklenebilir'));
      // tutamak: çerçevenin süslü ucu
      [...inG(g, 'img_front2'), ...(inG(g, 'img_front2').length ? [] : inG(g, 'img_front'))].forEach((grip) => {   // orijinal KO: tutamak img_front
        grip.classList.add('ko-tutamak'); grip.title = 'Sürükle: kısayol çubuğunu taşı';
        // sürükleme pencere düzeyinde izlenir (yakalama kaybolsa / imleç tutamaktan çıksa da takılmaz); bırakma, iptal, odak kaybı ve
        // basılı tuşun bırakıldığı fark edilince (buttons 0) her durumda biter
        grip.addEventListener('pointerdown', (e) => cekBasla(grip, e));
        grip.addEventListener('dblclick', () => { hs.x = hs.y = null; hk.el.style.removeProperty('--x'); hk.el.style.removeProperty('--y'); place(); saveHs(); });
      });
    }
    // çubuğun çerçevesinin boş her yeri (yatay ve dikeyde, sayfa / kaydırma bölümü dahil) tutamak gibi sürükler; yuvalar ve düğmeler hariç
    hk.el.addEventListener('pointerdown', (e) => { if (e.target.closest('.kui-btn, .kui-ar, .slot, .ko-tutamak')) return; cekBasla(hk.el, e); });
    function cekBasla(grip, e) {
          if (e.button !== 0) return;
          // kilit yalnız yuvalardaki yetenek / eşya yerlerini sabitler; çubuk her zaman taşınabilir
          e.preventDefault(); e.stopPropagation(); try { grip.setPointerCapture(e.pointerId); } catch {}
          const r = hk.el.getBoundingClientRect(), z = parseFloat(getComputedStyle(layer).zoom) || 1;
          const ox = e.clientX / z - r.left / z, oy = e.clientY / z - r.top / z;
          hk.el.classList.add('suruklen');
          const move = (ev) => { if (ev.pointerId !== e.pointerId) return; if (!(ev.buttons & 1)) return up(); hs.x = ev.clientX / z - ox; hs.y = ev.clientY / z - oy; place(); };
          let bitti = false;
          const up = () => {
            if (bitti) return; bitti = true; hk.el.classList.remove('suruklen');
            removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); removeEventListener('blur', up);
            grip.removeEventListener('lostpointercapture', up); try { grip.releasePointerCapture(e.pointerId); } catch {}
            saveHs();
          };
          addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true); addEventListener('blur', up);
          grip.addEventListener('lostpointercapture', up);
    }
    hk.el.classList.toggle('kilitli', !!hs.kilit); document.body.classList.toggle('ks-kilitli', !!hs.kilit);
    setOrient(!!hs.v);
    { let n = 0; const ortaBekle = () => { if (!hs.ortala) return saveHs(); place(); if (hs.ortala && ++n < 120) setTimeout(ortaBekle, 250); else saveHs(); }; ortaBekle(); }   // (7.11) HUD görünür olunca ortalanır
    addEventListener('resize', place);
    // sohbet (sol alt): KO re_chatting_box (oyuncu listesi Konum/Bağlı, sohbet sekmeleri) — yoksa ka/el_chat
    const ch = hasLayout('re_chatting_box') ? sohbetRe(add) : null;
    if (!ch) {
      const ch = add('chat', `${pre}_chat_us`, 'ko-chat');
      ch.show('btn_knights', false);
      ch.get('text0').append($('sohbet-mesajlar'));
      const ed = ch.get('edit0'); ed.textContent = ''; ed.append($('sohbet-giris'));
      ch.click('btn_off', () => ch.get('text0').hidden = !ch.get('text0').hidden);
      solidBack(ch.el, 3, 'ko-zemin-sohbet');
      // alt satır: "Sohbet" etiketi (ve gizle düğmesi) kaldırılır, diğer sohbet grupları sola kayar
      for (const e of ch.el.children) {
        const x = parseFloat(e.style.left), y = parseFloat(e.style.top);
        if (!(y >= 122)) continue;
        if (x < 100) e.style.display = 'none'; else e.style.left = (x - 101) + 'px';
      }
      bindScroll(ch.get('scroll'), $('sohbet-mesajlar'));
      // işlem bilgileri (sağ alt)                                                 ka_msgoutput
      if (hasLayout('ka_msgoutput_us')) {
        const inf = add('info', 'ka_msgoutput_us', 'ko-info');
        const box = document.createElement('div'); box.id = 'bilgi-mesajlar';
        inf.get('text_message').textContent = ''; inf.get('text_message').append(box);
        inf.click('btn_off', () => { const t = inf.get('text_message'); t.hidden = !t.hidden; });
        solidBack(inf.el, 3, 'ko-zemin-bilgi');
        bindScroll(inf.get('scroll'), box);
        setTimeout(() => { if (hud._iq) { const q = hud._iq; hud._iq = null; for (const [t, k] of q) hud.info(t, k); } }, 0);
        olcekTutamak(inf.el, 'bilgi', 'sol');
      }
      olcekTutamak(ch.el, 'sohbet', 'sag');
    }
    if (ch) olcekTutamak(ch.el, 'sohbet', 'sag');
    // üst orta duyuru / karşılama şeridi (yeniden doğma penceresi çerçevesi)
    const ban = document.createElement('div'); ban.id = 'duyuru'; ban.className = 'ko-panel'; ban.hidden = true; layer.append(ban);
    // ölüm                                                                      re_resurrection
    const rs = add('dead', 're_resurrection', 'ko-dead ko-pencere'); rs.el.hidden = true;
    rs.text('text_explanation_0', 'Öldün.'); rs.text('text_explanation_1', 'Moradon\'da yeniden doğmak için seç.');
    for (const g of ['group_1', 'group_2', 'group_3']) rs.show(g, false);
    // gizlenen 3 satırın boşluğu kapanır: alt bölüm (Tamam) hemen ilk satırın altına; pencere boyu kısalır
    { const gb = rs.get('group_bottom'); if (gb) gb.style.top = '133px'; rs.el.style.height = (299 - 93) + 'px'; }
    rs.get('group_0').querySelector('[data-id="text_msg"]').textContent = 'Moradon\'da yeniden doğ';
    // çıkış menüsü                                                              re_exitmenu
    // orijinal KnightOnlineEn re_exitmenu (assets/ui/cikis): küçük menü UI_1 (Option / End Game / Cancel); End Game → UI_0 (Character / Exit / Cancel)
    const cikisOrj = await ekUI('cikis').catch(() => false);
    const ex = add('exit', 're_exitmenu', 'ko-exit ko-pencere' + (cikisOrj ? ' ko-exit-orj' : '')); ex.el.hidden = true;
    const leave = async (url) => { try { await Promise.race([hud.beforeExit?.(), new Promise((r) => setTimeout(r, 1500))]); } catch {} location.href = url; };   // çıkmadan önce konum kaydı
    hud.oyundanCik = leave;
    ex.click('btn_chr', () => { try { sessionStorage.setItem('ko-secime-don', '1'); } catch {} leave('oyun.html'); });   // lobi: aynı sunucunun karakter seçimine animasyonla döner
    ex.click('btn_exit', () => leave('index.html'));
    ex.click('btn_option', () => { ex.el.hidden = true; hud.panel('ayar'); });
    ex.click('btn_cancel', () => { ex.el.hidden = true; });
    if (cikisOrj && ex.get('UI_1')) {
      const U0 = ex.get('UI_0'), U1 = ex.get('UI_1');
      const yaz = (kok, id, t) => kok.querySelector(`[data-id="${id}"] [data-id="text"]`)?.replaceChildren(t);
      const tik = (kok, id, fn) => { const b = kok.querySelector(`[data-id="${id}"]`); if (b) { b.classList.add('kui-tik'); b.onclick = (ev) => { ev.stopPropagation(); fn(); }; } };
      yaz(U1, 'btn_chr', 'Option'); yaz(U1, 'btn_exit', 'End Game'); yaz(U1, 'btn_cancel', 'Cancel');
      yaz(U0, 'btn_chr', 'Character'); yaz(U0, 'btn_exit', 'Exit'); yaz(U0, 'btn_cancel', 'Cancel');
      U0.querySelectorAll('[data-id^="ItemInfo_"], [data-id="scrollbar"]').forEach((e) => { e.hidden = true; });
      const tn = U0.querySelector('[data-id="title_notice"]'); if (tn) tn.textContent = 'Do you want to end the game?';
      const goster = (buyuk) => { U0.hidden = !buyuk; U1.hidden = !!buyuk; };
      goster(false);
      tik(U1, 'btn_chr', () => { ex.el.hidden = true; hud.panel('ayar'); });
      // End Game: KO'daki gibi sorusuz doğrudan oyunu bitirir (pencere launcher'dan açıldıysa kapanır, değilse giriş sayfası)
      const oyunuBitir = async () => { try { await Promise.race([hud.beforeExit?.(), new Promise((r) => setTimeout(r, 1500))]); } catch {} try { window.close(); } catch {} setTimeout(() => { location.href = 'index.html'; }, 150); };
      tik(U1, 'btn_exit', oyunuBitir);
      // Change Character: küçük menüye 4. düğme; dört düğme aynı çerçeveye sığacak şekilde sıkıştırılır (Option, Change Character, End Game, Cancel)
      { const b0 = U1.querySelector('[data-id="btn_chr"]');
        if (b0 && !U1.querySelector('[data-id="btn_change_chr"]')) {
          const bc = b0.cloneNode(true); bc.dataset.id = 'btn_change_chr'; b0.after(bc);
          yaz(U1, 'btn_change_chr', 'Change Character');
          tik(U1, 'btn_change_chr', () => { try { sessionStorage.setItem('ko-secime-don', '1'); } catch {} leave('oyun.html'); });
          [['btn_chr', 52], ['btn_change_chr', 100], ['btn_exit', 148], ['btn_cancel', 196]].forEach(([id, y]) => { const e = U1.querySelector(`[data-id="${id}"]`); if (e) e.style.top = y + 'px'; });
        } }
      tik(U1, 'btn_cancel', () => { ex.el.hidden = true; });
      tik(U0, 'btn_chr', () => { try { sessionStorage.setItem('ko-secime-don', '1'); } catch {} leave('oyun.html'); });
      tik(U0, 'btn_exit', () => leave('index.html'));
      tik(U0, 'btn_cancel', () => goster(false));
      new MutationObserver(() => { if (ex.el.hidden) goster(false); }).observe(ex.el, { attributes: true, attributeFilter: ['hidden'] });
    } else translateExit(ex);
    // ileti kutusu                                                              re_messagebox
    const mb = add('msg', 're_messagebox', 'ko-msg ko-pencere'); mb.el.hidden = true;
    // orijinal KO re_messagebox: eşya parçalama (Block düğmesi, eşya ikonu / adı, süre çubuğu, deneme yazısı 'aaaa…') öğeleri — genel kutularda gizli
    for (const id of ['Btn_ban', 'base_item', 'img_icon', 'progress_durationtime', 'str_crash_tooltip', 'str_itemname']) mb.show(id, false);
    // pencereler (C / I / K)
    if (hasLayout('re_various_frame') && hasLayout('re_page_state')) {
      const fr = add('state', 're_various_frame', 'ko-bilgi ko-pencere'); fr.el.hidden = true;
      for (const id of ['btn_knights', 'btn_force']) fr.show(id, false);
      fr.all('btn_friends').forEach((e) => (e.title = 'Arkadaşlar')); fr.click('btn_friends', () => sekmeGec(fr, 'arkadas'));
      // KO: Karakter Bilgisi'nin Klan sekmesi → klan penceresi (re_clan_window) aynı yerde açılır
      fr.get('btn_state')?.classList.add('secili'); fr.all('btn_clan').forEach((e) => (e.title = 'Klan (G)'));
      fr.click('btn_clan', () => { const kw = L.klan; if (!kw) return; yerKopya(fr, kw); fr.el.hidden = true; hud.panel('klan'); });
      basarimSekmesi(fr, 214, 58, false, () => { const bw = L.unvan || L.basarim; if (!bw) return; yerKopya(fr, bw); fr.el.hidden = true; hud.panel(L.unvan ? 'unvan' : 'basarim'); });
      baslikInce(fr);   // KO: Klan / Achieve pencerelerindeki (dokuya gömülü) "Character info" başlığıyla aynı yazı tipi
      const yeni = hasLayout('re_page_state_yeni');
      const ps = buildLayout(yeni ? 're_page_state_yeni' : 're_page_state'); if (!yeni) translate(ps); ps.el.classList.add('ko-ic'); ps.el.style.left = yeni ? '0px' : '-8px'; ps.el.style.top = '1px';   // yeni statü sayfası: boruları üst çerçeveyle (re_various_frame) aynı hizada
      fr.el.append(ps.el); L.page = ps;
      if (yeni) statuYeni(fr, ps);
      // Katkı'nın altı: Cash (madencilik/balıkçılık seviyeleri kapalı; sütunlar sunucuda duruyor)
      { const satir = (id, x, y, w, metin, sinif = '') => { const e = document.createElement('div'); e.className = 'kui kui-tx ' + sinif; e.dataset.id = id; e.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:17px;`; if (metin != null) e.textContent = metin; ps.el.append(e); return e; };
        // Katkı ile aynı dizilim: etiket solda, değer siyah kutuda ortalı
        if (!yeni) { satir('Title_Cash', 41, 219, 50, 'Cash', 'cash-etiket'); satir('Text_Cash', 88, 219, 208, '0', 'meslek-kutu'); } }
      fr.click('btn_close', () => (fr.el.hidden = true)); draggable(fr, 48);
      // stat puanı dağıtma (KO: seviye başına 3 puan) — sunucuda add_stat
      const STAT = { Btn_Strength: 'str', Btn_Stamina: 'sta', Btn_Dexterity: 'dex', Btn_Intelligence: 'intel', Btn_MagicAttack: 'cha' };
      for (const [b, k] of Object.entries(STAT)) { ps.get(b)?.classList.add('kui-pasif'); ps.click(b, () => { if ((charStats?.points || 0) > 0) hud.onAddStat?.(k); }); }
    }
    // klan penceresi (KO re_clan_window: Karakter Bilgisi → Klan sekmesi); içerik klan.js
    if (hasLayout('re_clan_window')) {
      const kw = add('klan', 're_clan_window', 'ko-klan ko-pencere'); kw.el.hidden = true;
      for (const id of ['btn_force', 'group_purge', 'group_notice', 'group_memo']) kw.show(id, false);
      kw.all('btn_friends').forEach((e) => (e.title = 'Arkadaşlar')); kw.click('btn_friends', () => sekmeGec(kw, 'arkadas'));
      kw.get('btn_clan')?.classList.add('secili'); kw.all('btn_state').forEach((e) => (e.title = 'Karakter (U)'));
      // başlık: KO'daki gibi görüntüye gömülü "Character info" kalır (Türkçe başlık kaldırıldı)
      { const g = kw.get('group'); const t = g && [...g.querySelectorAll(':scope > .kui-img')].find((e) => e.style.left === '258px' && e.style.top === '23px');
        if (t && false) { t.style.visibility = 'hidden'; const b = document.createElement('div'); b.className = 'kui kui-tx ko-klan-baslik'; b.textContent = 'Character Info';
          b.style.cssText = 'left:218px;top:22px;width:150px;height:20px;justify-content:center;align-items:center;'; g.append(b); } }
      baslikGomulu(kw);   // başlık: Friend sekmesindeki "Character info" ile aynı yazı tipi
      kw.click('btn_close', () => (kw.el.hidden = true)); draggable(kw, 48);
      kw.click('btn_state', () => { const fr = L.state; if (!fr) return; yerKopya(kw, fr); kw.el.hidden = true; hud.panel('karakter'); });
      basarimSekmesi(kw, 213, 59, false, () => { const bw = L.unvan || L.basarim; if (!bw) return; yerKopya(kw, bw); kw.el.hidden = true; hud.panel(L.unvan ? 'unvan' : 'basarim'); });
    }
    // KO unvan penceresi (deadsoft 2369 re_title_window: Karakter Bilgisi → Achieve sekmesi); içerik basarim.js (unvanCiz)
    if (hasLayout('re_title_window')) {
      const tw = buildLayout('re_title_window', { className: 'ko-unvan ko-pencere' }); layer.append(tw.el); L.unvan = tw; tw.el.hidden = true;
      baslikGomulu(tw);
      tw.show('btn_force', false); tw.get('btn_title')?.classList.add('secili');
      for (let i = 0; i < 5; i++) { const g = tw.get('group_title_' + i); if (g) g.hidden = true; }   // satırlar (seçim çizgileri) veri gelene kadar gizli
      for (const e of tw.el.querySelectorAll('[data-id="str_title"], [data-id="str_title_0"], [data-id="str_title_1"], [data-id="str_page"]')) e.textContent = '';
      tw.click('btn_close', () => (tw.el.hidden = true)); draggable(tw, 48);
      const gec = (k, hedef) => tw.click(k, () => { const to = L[hedef === 'karakter' ? 'state' : hedef]; if (!to) return; yerKopya(tw, to); tw.el.hidden = true; hud.panel(hedef); });
      gec('btn_state', 'karakter'); gec('btn_clan', 'klan'); gec('btn_friends', 'arkadas');
    }
    // KO başarım penceresi (deadsoft 2369 re_achieve, sistem menüsü → Achieve); içerik basarim.js (achieveCiz)
    if (hasLayout('re_achieve')) {
      const aw = buildLayout('re_achieve', { className: 'ko-achieve ko-pencere' }); layer.append(aw.el); L.achieve = aw; aw.el.hidden = true; baslikGomulu(aw);
      for (const e of aw.el.querySelectorAll('[data-id^="str_"]')) e.textContent = '';
      aw.click('btn_exit', () => (aw.el.hidden = true)); draggable(aw, 48);
    }
    // başarım penceresi (Karakter Bilgisi → Başarım sekmesi); içerik basarim.js
    if (hasLayout('re_various_frame')) {
      const bw = add('basarim', 're_various_frame', 'ko-basarim ko-pencere'); bw.el.hidden = true;
      for (const id of ['btn_knights', 'btn_force']) bw.show(id, false);
      bw.all('btn_friends').forEach((e) => (e.title = 'Arkadaşlar')); bw.click('btn_friends', () => sekmeGec(bw, 'arkadas'));
      bw.all('btn_state').forEach((e) => (e.title = 'Karakter (U)')); bw.all('btn_clan').forEach((e) => (e.title = 'Klan (G)'));
      basarimSekmesi(bw, 214, 58, true, () => {});
      const govde = document.createElement('div'); govde.className = 'bs-govde'; bw.el.append(govde); bw.govde = govde;
      { const t = [...bw.el.querySelectorAll('.kui-tx')].find((e) => !e.dataset.id && !e.closest('.kui-btn')); if (t) { t.textContent = 'Başarımlar'; t.classList.add('bs-baslik'); } }
      bw.click('btn_close', () => (bw.el.hidden = true)); draggable(bw, 48);
      bw.click('btn_state', () => { const fr = L.state; if (!fr) return; yerKopya(bw, fr); bw.el.hidden = true; hud.panel('karakter'); });
      bw.click('btn_clan', () => { const kw = L.klan; if (!kw) return; yerKopya(bw, kw); bw.el.hidden = true; hud.panel('klan'); });
    }
    // arkadaş penceresi (KO: Karakter Bilgisi → Friend sekmesi, deadsoft re_page_friends); içerik arkadas.js
    if (hasLayout('re_various_frame') && hasLayout('re_page_friends')) {
      const aw = add('arkadas', 're_various_frame', 'ko-arkadas ko-pencere'); aw.el.hidden = true;
      for (const id of ['btn_knights', 'btn_force']) aw.show(id, false);
      aw.get('btn_friends')?.classList.add('secili');
      aw.all('btn_state').forEach((e) => (e.title = 'Karakter (U)')); aw.all('btn_clan').forEach((e) => (e.title = 'Klan (G)'));
      basarimSekmesi(aw, 214, 58, false, () => sekmeGec(aw, KO?.unvan ? 'unvan' : 'basarim'));
      baslikInce(aw);
      const pf = buildLayout('re_page_friends'); pf.el.classList.add('ko-ic', 'ko-ark-sayfa'); pf.el.style.left = '0px'; pf.el.style.top = '0px';   // borular üst çerçeveyle (re_various_frame) aynı hizada
      aw.el.append(pf.el); aw.sayfa = pf;
      aw.click('btn_close', () => (aw.el.hidden = true)); draggable(aw, 48);
      aw.click('btn_state', () => sekmeGec(aw, 'karakter'));
      aw.click('btn_clan', () => sekmeGec(aw, 'klan'));
    }
    if (hasLayout('re_inventory')) {
      const inv = add('inv', 're_inventory', 'ko-inv ko-pencere'); inv.el.hidden = true;
      for (const id of ['base_bag', 'base_inven_notice', 'img_Destroy_bottom', 'img_Destroy_middle', 'img_Destroy_top', 'btn_Destroy_ok', 'btn_Destroy_cancel', 'string_Destroy', 'string_Destroy2', 'img_hide', 'elmo_ecli666', 'base_LockImg']) inv.show(id, false);
      inv.el.querySelectorAll('.kui-tx').forEach((e) => { if (/^\d+$/.test(e.dataset.id || '')) e.textContent = ''; });
      inv.click('btn_close', () => toggle(inv, false)); draggable(inv, 70);
      // orijinal KO yerleşimindeki Korece yazılar (EN istemcide UIText'ten gelir): çanta sekmeleri Bag 1-3, ağırlık etiketi
      for (const n of [1, 2, 3]) inv.get('btn_bag' + n)?.querySelectorAll('.kui-tx').forEach((e) => { e.textContent = 'Bag ' + n; e.classList.add('ko-canta-sekme'); });
      { const w = inv.get('text_id_weight'); if (w && /[가-힣]/.test(w.textContent)) w.textContent = 'Weight'; }
      // başlık: görüntüye gömülü "Inventory" yazısı yerine "Çanta" (Karakter Bilgisi başlığıyla aynı yazı tipi)
      { const t = [...inv.el.querySelectorAll(':scope > .kui-img')].find((e) => e.style.left === '379px' && e.style.top === '50px');
        if (t) t.style.visibility = 'hidden';
        const tt = document.createElement('div'); tt.className = 'kui kui-tx ko-canta-baslik'; tt.textContent = 'Inventory';
        tt.style.cssText = 'left:343px;top:49px;width:120px;height:18px;justify-content:center;align-items:center;';
        inv.el.append(tt); }
      // kostüm bölümü aç/kapa (btn_open_cos, perdenin solundaki dikey sekme); tercih hatırlanır
      { const cos = inv.get('base_cos'); let on = true; try { on = localStorage.getItem('ko-kostum') !== '0'; } catch {}
        const setCos = (v) => { on = v; if (cos) cos.hidden = !v; inv.el.classList.toggle('kostum-kapali', !v); try { localStorage.setItem('ko-kostum', v ? '1' : '0'); } catch {} };
        const b = inv.get('btn_open_cos'); if (b) { b.style.pointerEvents = 'auto'; b.classList.add('kui-tik'); b.title = 'Kostüm bölümünü aç / kapat'; b.addEventListener('click', (e) => { e.stopPropagation(); setCos(!on); }); }
        setCos(on); }
      // kask gizleme tikleri: btn_helmetview (envanter kask yuvası) = normal kaskı gizle, btn_CosPreView (kostüm bölümü) = kostüm kaskını gizle.
      // KO onay kutusu: parça 285 boş, 283 işaretli. Tercih karaktere göre saklanır; değişince 'ko-kask-gizle' olayı (görünüm + diğer oyuncular).
      { const KEY = 'ko-kask-gizle'; let g = { kask: false, kostum: false }; try { g = { ...g, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
        const tik = (id, k, baslik) => {
          const b = inv.get(id); if (!b) return;
          b.innerHTML = ''; b.style.pointerEvents = 'auto'; b.classList.add('kui-tik'); b.title = baslik;
          const sp0 = findSprite('re_inventory', 'btn_CosPreView', 0), sp2 = findSprite('re_inventory', 'btn_CosPreView', 2);   // aynı KO onay kutusu görüntüsü (boş / işaretli)
          const ciz = () => { const sp = g[k] ? sp2 : sp0; if (sp != null) paintSprite(b, sp, 18, 18); };
          b.addEventListener('click', (e) => { e.stopPropagation(); g[k] = !g[k]; ciz(); try { localStorage.setItem(KEY, JSON.stringify(g)); } catch {} dispatchEvent(new CustomEvent('ko-kask-gizle', { detail: { ...g } })); });
          ciz();
        };
        tik('btn_helmetview', 'kask', 'Kaskı gizle'); tik('btn_CosPreView', 'kostum', 'Kostüm kaskını gizle');
        // KO kostüm bölümü: peri / tılsım / kanat / amblem görünümünü gizle (tüm oyuncular öyle görür)
        tik('btn_FairyView', 'peri', 'Hide fairy'); tik('btn_talisman', 'tilsim', 'Hide talisman'); tik('btn_WingPreView_0', 'kanat', 'Hide wings'); tik('btn_emblePreView', 'amblem', 'Hide emblem');
        for (const id of ['btn_WingPreView_1', 'btn_WingPreView_2']) inv.show(id, false); }
    }
    if (hasLayout('re_skill_yeni') || hasLayout('re_skill')) {
      // deadsoft 2369 yeni yetenek penceresi varsa o (İngilizce, çevrilmez), yoksa eski re_skill
      const sk = hasLayout('re_skill_yeni') ? (() => { const l = buildLayout('re_skill_yeni', { className: 'ko-skill ko-skill2 ko-pencere' }); layer.append(l.el); return (L.skill = l); })() : add('skill', 're_skill', 'ko-skill ko-pencere'); sk.el.hidden = true;
      sk._sagBosluk = 10;   // re_skill(_yeni) arka planı (447 px) sağda ~10 px saydam gölge: çerçevenin dış kenarı ekranın sağ kenarına denk gelsin
      sk.el.querySelectorAll('[data-id^="string_list_"]').forEach((e) => (e.textContent = ''));
      sk.click('btn_close', () => toggle(sk, false)); draggable(sk, 50);
      YP = initYetenekPenceresi(sk, () => { const b = bound?.(); if (!b?.me) return b?.me; const lv = Math.max(Number(b.me.level) || 1, Number(b.S?.level) || 0); if (Number(b.me.level) !== lv) b.me.level = lv; return b.me; });   // (7.11) seviye S'den (görev / avla atlayınca me.level eskide kalıyordu)
    }

    KO = L;
    layout(); addEventListener('resize', layout);
    if (lastStats) hud.stats(lastStats);
    hud.target(lastTarget);
  })().catch((e) => { console.warn('KO arayüzü yüklenemedi, sade arayüz kullanılıyor:', e); KO = null; });
  return koReady;
}

// ---- KO sohbet penceresi (re_chatting_box): solda oyuncu listesi (Konum = bölgedekiler, Bağlı = oyundakiler), ortada sohbet,
// altta sekmeler (Tümü/Fısıltı/Bağır/Parti/Klan/Birlik/Oda). Aynı yerleşimin ikinci kopyası sağ altta işlem bilgileri (Bilgi) penceresi olur.
const SOHBET_TR = { Knight: 'Clan' };   // orijinal KO (EN) sekme yazıları: All, Whisper, Shout, Party, Clan, Alliance, Chatroom, Location, Connect
function sohbetTr(L) { L.el.querySelectorAll('.kui-tx').forEach((e) => { const t = e.textContent.trim(); if (SOHBET_TR[t]) e.textContent = SOHBET_TR[t]; }); }
function sohbetRe(add) {
  const ch = add('chat', 're_chatting_box', 'ko-chat ko-chat-re');
  sohbetTr(ch);
  // orijinal KO sekme yazıları (genel TR çevirisi bu pencerede uygulanmaz)
  for (const [id, t] of [['btn_normal', 'All'], ['btn_private', 'Whisper'], ['btn_shout', 'Shout'], ['btn_party_force', 'Party'], ['btn_knights', 'Clan'], ['btn_union', 'Alliance'], ['btn_chatroom', 'Chatroom'], ['btn_location', 'Location'], ['btn_connect', 'Connect']]) ch.get(id)?.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = t));
  ch.show('base_filter', false); ch.show('img_sizechange', false);
  for (const id of ['btn_clan', 'btn_force', 'btn_noah_knights']) ch.show(id, false);
  ch.el.querySelectorAll('[data-id^="btn_check_user_"]').forEach((e) => (e.hidden = true));
  ch.el.querySelectorAll('[data-id^="base_num"]').forEach((e) => { if (Number(e.dataset.id.slice(8)) > 6) e.hidden = true; });
  const box = $('sohbet-mesajlar'), inp = $('sohbet-giris');
  const t0 = ch.get('text0'); t0.textContent = ''; t0.append(box);
  const ed = ch.get('edit0'); ed.textContent = ''; ed.append(inp);
  // (31.10) KO sohbet ifadeleri: giriş kutusunun sağında gülen yüz → ifade seçici (orijinal re_emoticon)
  // (5.11) kullanıcı isteği: ana sohbet giriş kutusundaki gülen yüz düğmesi kaldırıldı (ifade seçici yalnız PM penceresinde)
  bindScroll(ch.get('scroll'), box);
  // sekmeler: görüntülenen sohbet türü + yazılan mesajın kanalı
  const SEK = { btn_normal: 'hepsi', btn_private: 'ozel', btn_shout: 'bagir', btn_party_force: 'parti', btn_knights: 'klan', btn_union: 'birlik', btn_chatroom: 'oda' };
  const sekSec = (id) => {
    for (const b of Object.keys(SEK)) ch.get(b)?.classList.toggle('secili', b === id);
    box.dataset.sekme = SEK[id]; hud.sohbetKanal = SEK[id];
    inp.placeholder = '';   // orijinal KO: giriş satırında ipucu yazısı yok
    box.scrollTop = box.scrollHeight;
  };
  for (const id of Object.keys(SEK)) ch.click(id, () => { sekSec(id); if (id === 'btn_private') hud.onWhisper?.(); });   // (8.11) Whisper: seçili oyuncu varsa PM penceresi açılır
  sekSec('btn_normal');
  // filtre (sol üstteki mavi balon / seçenek düğmesi): Tümü sekmesinde hangi türler görünsün
  const fl = ch.get('base_filter');
  // KO filtre: All chat · Whisper · Shout · Party chat · Clan chat · Alliance chat · Block chatting · Noah Knights · Chatroom · User information · Merchant
  // (işaretli = görünür; Block chatting işaretliyse oyuncu sohbetlerinin hepsi gizlenir) — seçim hatırlanır
  const FIL = { btn_check_normal: 'genel', btn_check_private: 'ozel', btn_check_shout: 'bagir', btn_check_party_force: 'parti', btn_check_clan: 'klan', btn_check_union: 'birlik',
    btn_check_noah_knights: 'noah', btn_check_chatroom: 'oda', btn_check_userinfo: 'bilgi', btn_check_shop: 'pazar' };
  const FK = 'ko-sohbet-filtre'; let fd = {}; try { fd = JSON.parse(localStorage.getItem(FK) || '{}'); } catch {}
  const fUyg = () => { for (const [id, k] of Object.entries(FIL)) { const on = fd[k] !== false; ch.get(id)?.classList.toggle('secili', on); box.classList.toggle('gizle-' + k, !on); }
    ch.get('btn_check_block')?.classList.toggle('secili', !!fd.blok); box.classList.toggle('gizle-oyuncu', !!fd.blok); };
  for (const [id, k] of Object.entries(FIL)) ch.click(id, () => { fd[k] = fd[k] === false; try { localStorage.setItem(FK, JSON.stringify(fd)); } catch {} fUyg(); });
  ch.click('btn_check_block', () => { fd.blok = !fd.blok; try { localStorage.setItem(FK, JSON.stringify(fd)); } catch {} fUyg(); });
  fUyg();
  const filtreAc = () => { if (fl) fl.hidden = !fl.hidden; };
  ch.click('btn_filter', filtreAc);   // sohbet balonu: hangi mesaj türlerinin engelleneceği (filtre)
  // mavi ikon (btn_option): sohbet zemini saydam / koyu (orijinal KO); tercih hatırlanır
  { const K = 'ko-sohbet-saydam'; let sd = false; try { sd = localStorage.getItem(K) === '1'; } catch {}
    const uyg = () => { ch.el.classList.toggle('sohbet-saydam', sd); const b = ch.get('btn_option'); if (b) b.title = sd ? 'Sohbet zemini: saydam (koyu yapmak için tıkla)' : 'Sohbet zemini: koyu (saydam yapmak için tıkla)'; };
    ch.click('btn_option', () => { sd = !sd; try { localStorage.setItem(K, sd ? '1' : '0'); } catch {} uyg(); }); uyg(); }
  ch.get('btn_filter') && (ch.get('btn_filter').title = 'Engellenecek mesaj türleri');
  ch.get('btn_filter') && (ch.get('btn_filter').title = 'Sohbet filtresi');
  // kilit: pencere ölçeği/konumu sabitlenir
  pencereKilit(ch, 'sohbet');   // alt köşedeki kilit: kilitliyken pencere yerinde sabit, açıkken sürüklenir
  // oyuncu listesi: 7 satır (üstten base_num6 … base_num0), sayfalı
  let tur = 'konum', sayfa = 0;
  const satirlar = [6, 5, 4, 3, 2, 1, 0].map((n) => ch.get('base_num' + n));
  const klanIkon = [6, 5, 4, 3, 2, 1, 0].map((n) => ch.get('img_clan' + n));
  klanIkon.forEach((e) => e && (e.hidden = true));
  ch.el.querySelectorAll('[data-id="img_clan"]').forEach((e) => (e.hidden = true));
  // A (btn_Color): KO Chat Text Color Setting (re_chatcolor) — sohbet-renk.js
  ch.click('btn_Color', () => import('./sohbet-renk.js').then((M) => M.sohbetRenkAc()).catch((e) => console.warn('sohbet renk', e)));
  if (ch.get('btn_Color')) ch.get('btn_Color').title = 'Chat Text Color Setting';
  import('./sohbet-renk.js').catch(() => {});   // kayıtlı sohbet renkleri açılışta uygulanır   // A (btn_Color) orijinaldeki gibi görünür   // orijinal KO: satır başına klan simgesi, sohbet rengi, dükkân onay kutusu
  satirlar.forEach((r) => r?.querySelectorAll(':scope > [data-id="img_1"], :scope > [data-id="img_2"], :scope > [data-id="img_3"]').forEach((e) => (e.hidden = true)));
  function klanSutun(r, pel) {
    let k = r.querySelector(':scope > .ko-liste-klan');
    if (!k) { const yer = r.querySelector(':scope > [data-id="img_clan"]') || r.querySelector(':scope > .kui-ar'); k = document.createElement('img'); k.className = 'ko-liste-klan'; if (yer) { k.style.left = yer.style.left; k.style.top = yer.style.top; } r.append(k); }
    const anahtar = pel ? pel.k + ':' + (pel.v || 0) : '';
    if (k.dataset.k === anahtar) return; k.dataset.k = anahtar; k.hidden = true; k.removeAttribute('src');
    if (!pel) return;
    const sb = window.__ko?.sb; if (!sb) return;
    import('./pelerin.js').then((M) => M.klanSembol(sb, pel.k, pel.v)).then((s) => { if (k.dataset.k === anahtar && s) { k.src = s; k.hidden = false; } }).catch(() => {});
  }
  const turSec = (t) => { tur = t; sayfa = 0; ch.get('btn_location')?.classList.toggle('secili', t === 'konum'); ch.get('btn_connect')?.classList.toggle('secili', t === 'bagli'); listeCiz(); };
  function listeCiz() {
    const L = (hud.oyuncuKaynak?.(tur) || []);
    const top = Math.max(1, Math.ceil(L.length / 7)); sayfa = Math.min(sayfa, top - 1);
    const parca = L.slice(sayfa * 7, sayfa * 7 + 7);
    satirlar.forEach((r, i) => {
      if (!r) return; const o = parca[i]; r.hidden = !o; if (!o) return;
      const ad = r.querySelector('[data-id="str_name"]'); if (ad) { ad.textContent = o.name; ad.style.color = o.ben ? '#ffff00' : o.nation === 2 ? '#8080ff' : '#ff6060'; }   // orijinal KO: kendin sarı, El Morad mavi, Karus kırmızı
      // (5.11) KO: satır ışığı — mavi (img_2) pazar kurmuş, yeşil (img_1) çevrimiçi; seçim zemini (img_userbg) gizli; klan sütununda klanın sembolü (yoksa boş)
      const S = window.__ko?.state, tuccar = o.ben ? !!S?.pazar?.acik : !!S?.pazar?.saticiMi?.(o.id);
      for (const [id, on] of [['img_0', false], ['img_1', !tuccar], ['img_2', tuccar], ['img_3', false]]) { const e = r.querySelector(`:scope > [data-id="${id}"]`); if (e) { e.hidden = !on; e.style.filter = ''; } }
      // (6.11) KO: fare satırın üstündeyken orijinal mavi seçim zemini (img_userbg) görünür
      r.querySelectorAll(':scope > [data-id="img_userbg"]').forEach((e) => { e.hidden = false; e.style.pointerEvents = 'none'; e.classList.add('ko-liste-ust'); });   // görünürlük CSS :hover ile
      klanSutun(r, o.pel?.k ? o.pel : null);
      r.dataset.ad = o.name; r.dataset.oid = o.id ?? ''; r.dataset.ben = o.ben ? '1' : ''; r.title = `${o.name}${o.ben && o.level ? ' · Sv. ' + o.level : ''}${o.zone ? ' · ' + o.zone : ''}`;
    });
    const pn = ch.get('str_pagenum'); if (pn) pn.textContent = String(sayfa + 1);
  }
  satirlar.forEach((r) => r && (r.style.pointerEvents = 'auto', r.style.cursor = 'pointer', r.addEventListener('dblclick', (e) => { e.stopPropagation(); if (r.dataset.ad) { inp.value = `/pm ${r.dataset.ad} `; inp.focus(); } })));
  // KO: listedeki isme sağ tık → küçük menü (özel mesaj)
  let lm = null; const lmKapat = () => { lm?.remove(); lm = null; };
  addEventListener('pointerdown', (e) => { if (lm && !lm.contains(e.target)) lmKapat(); }, true);
  satirlar.forEach((r) => r && r.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation(); lmKapat();
    if (!r.dataset.ad || r.dataset.ben) return;
    if (hud.listeMenu?.(r.dataset.oid, r.dataset.ad, e.clientX, e.clientY)) return;   // (31.10) KO orijinal re_minimenu_userlist (arkadas.js)
    lm = document.createElement('div'); lm.className = 'oyuncu-menu-k ko-liste-menu';
    lm.innerHTML = `<div class="omk-ad"></div><button class="omk-sec" data-k="mesaj">Mesaj gönder</button><button class="omk-sec" data-k="fisilti">Fısıltı (/pm)</button>`;
    lm.querySelector(".omk-ad").textContent = r.dataset.ad;
    lm.style.left = e.clientX + 'px'; lm.style.top = e.clientY + 'px';
    lm.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    lm.addEventListener('click', (ev) => {
      const k = ev.target.closest('button')?.dataset.k; if (!k) return;
      const ad = r.dataset.ad, id = r.dataset.oid; lmKapat();
      if (k === 'mesaj') { if (hud.ozelMesajAc) hud.ozelMesajAc(id, ad); else { inp.value = `/pm ${ad} `; inp.focus(); } }
      if (k === 'fisilti') { inp.value = `/pm ${ad} `; inp.focus(); }
    });
    document.body.append(lm);
    const b = lm.getBoundingClientRect(); if (b.right > innerWidth) lm.style.left = (innerWidth - b.width - 4) + 'px'; if (b.bottom > innerHeight) lm.style.top = (innerHeight - b.height - 4) + 'px';
  }));
  ch.click('btn_location', () => turSec('konum')); ch.click('btn_connect', () => turSec('bagli'));
  ch.click('btn_left', () => { sayfa = Math.max(0, sayfa - 1); listeCiz(); });
  ch.click('btn_right', () => { sayfa++; listeCiz(); });
  turSec('konum'); setInterval(() => { if (!ch.el.hidden) listeCiz(); }, 2000);
  hud.oyuncuListesiYenile = listeCiz;

  // ---- işlem bilgileri (sağ alt): aynı yerleşimden yalnız sohbet alanı + sağda kaydırma sütunu + "Bilgi" sekmesi
  const inf = add('info', 're_chatting_box', 'ko-info ko-info-re');
  sohbetTr(inf);
  for (const id of ['base_mapuserlist', 'base_filter', 'base_button_area', 'base_area', 'img_sizechange', 'img_edit_bg', 'img_edit1', 'img_edit2', 'edit0', 'btn_filter']) inf.show(id, false);
  inf.el.querySelectorAll('[data-id^="btn_check_user_"]').forEach((e) => (e.hidden = true));
  inf.el.querySelectorAll('[data-id="btn_Color"], [data-id="btn_check_shop"]').forEach((e) => (e.hidden = true));
  // (31.10) sağ sütun orijinaldeki gibi eksiksiz: ▲ / kaydırma çubuğu / ▼, mavi düğme (zemin saydam ↔ koyu), kilit (pencere sabit ↔ taşınabilir)
  { const K = 'ko-bilgi-saydam'; let sd = false; try { sd = localStorage.getItem(K) === '1'; } catch {}
    const uyg = () => { inf.el.classList.toggle('sohbet-saydam', sd); const b = inf.get('btn_option'); if (b) b.title = sd ? 'Background: transparent (click for dark)' : 'Background: dark (click for transparent)'; };
    inf.click('btn_option', () => { sd = !sd; try { localStorage.setItem(K, sd ? '1' : '0'); } catch {} uyg(); }); uyg(); }
  for (const id of ['btn_private', 'btn_shout', 'btn_party_force', 'btn_knights', 'btn_union', 'btn_chatroom', 'btn_clan', 'btn_force', 'btn_noah_knights']) inf.show(id, false);
  const IW = 340, bc = inf.get('base_chat'), bs = inf.get('base_scroll'), bt = inf.get('base_chat_top');
  if (bc) bc.style.left = '0px';
  for (const id of ['img_background', 'img_background2']) inf.all(id).forEach((e) => { if (e.parentElement === bc) { e.style.left = '1px'; e.style.height = '161px'; e.style.width = (IW - 27) + 'px'; } });
  if (bs) bs.style.left = (IW - 26) + 'px';
  if (bt) bt.style.left = '0px';
  const ib = inf.get('btn_normal'); if (ib) { ib.style.left = (IW - 82) + 'px'; ib.classList.add('secili'); ib.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = 'Bilgi')); }
  const it0 = inf.get('text0'); const ibox = document.createElement('div'); ibox.id = 'bilgi-mesajlar';
  if (it0) { it0.textContent = ''; it0.append(ibox); Object.assign(it0.style, { left: '8px', top: '6px', width: (IW - 38) + 'px', height: '152px' }); }
  inf.el.style.width = IW + 'px';
  bindScroll(inf.get('scroll'), ibox);
  pencereKilit(inf, 'bilgi');
  // KO re_chatting_box işlem bilgisi: altta All / Status / Item / System sekmeleri (btn_normal'ın kopyaları), seçili sekme süzer
  if (ib) {
    const W = parseFloat(ib.style.width) || 56, L0 = parseFloat(ib.style.left) || (IW - 82), sek = [['All', ''], ['Status', 'durum'], ['Item', 'esya'], ['System', 'sistem']];
    const dugmeler = sek.map(([ad, f], i) => {
      const b = i === 0 ? ib : ib.cloneNode(true);
      if (i) { b.removeAttribute('data-id'); ib.parentElement.append(b); }
      b.style.left = (L0 - (sek.length - 1 - i) * (W + 2)) + 'px';
      b.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = ad)); b.classList.add('bilgi-sekme'); b.style.pointerEvents = 'auto';
      b.onclick = (e) => { e?.stopPropagation?.(); if (f) ibox.dataset.f = f; else delete ibox.dataset.f; dugmeler.forEach((x) => x.classList.toggle('secili', x === b)); if (it0) it0.hidden = false; ibox.scrollTop = ibox.scrollHeight; };
      return b;
    });
    dugmeler.forEach((x, i) => x.classList.toggle('secili', i === 0));
  }
  setTimeout(() => { if (hud._iq) { const q = hud._iq; hud._iq = null; for (const [t, k] of q) hud.info(t, k); } }, 0);
  olcekTutamak(inf.el, 'bilgi', 'sol');
  return ch;
}

function translateExit(ex) {
  const map = { btn_chr: 'Karakter Seç', btn_exit: 'Oyunu Bitir', btn_option: 'Seçenekler', btn_cancel: 'İptal' };
  for (const [id, t] of Object.entries(map)) ex.get(id)?.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = t));
  ex.el.querySelectorAll(':scope > .kui-tx, :scope > .kui-img > .kui-tx').forEach((e) => { if (e.textContent.trim() === 'End') e.textContent = 'Çıkış'; });
}

// Görev çubuğu (CUITaskbarMain): sol düğmeler (base_menu) sol kenara, sağ düğmeler (base_TaskBar) sağ kenara dayanır —
// iki kenarda da aynı boşluk (0). Orta EXP şeridi (base_state01) iki dizinin arasını eşit doldurur; EXP yazısı ortada.
// Sohbet / işlem bilgileri zemini: orijinal parçaların sağ sütunu ve alt satırı saydam → yan yana gelince
// ince açık çizgiler oluşuyordu. İlk n zemin parçası gizlenir, yerine tek parça yarı saydam zemin çizilir.
function solidBack(root, n, cls) {
  [...root.querySelectorAll(':scope > .kui-img')].slice(0, n).forEach((e) => (e.style.visibility = 'hidden'));
  const d = document.createElement('div'); d.className = 'kui ' + cls; root.prepend(d);
}
// KO kaydırma çubuğu (CN3UIScrollBar): ok düğmeleri basılı tutulunca kayar, tutamak (ray üstündeki taş) sürüklenir,
// raya tıklamak sayfa atlatır. İçerik fareyle kaydırılınca tutamak da yer değiştirir.
export function bindScroll(sc, box) {
  if (!sc || !box) return;
  // yukarı/aşağı okları konumlarına göre (bazı KO yerleşimlerinde aşağı ok önce gelir: re_npcmenu)
  const [up, down] = [...sc.querySelectorAll(':scope > .kui-btn')].sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top)), tr = sc.querySelector(':scope > .kui-tr');
  const tekParca = tr && tr.children.length === 1;   // re_chatting_box: rayın kendisi sarı tutamak görüntüsü → tutamak boyu sayfa oranında
  const thumb = tr?.children[1] || tr?.children[0]; if (!up || !down || !tr || !thumb) return;
  const trH0 = tr ? parseFloat(tr.style.height) || tr.offsetHeight : 0;
  if (!tekParca) thumb.style.top = '0px';   // tutamak rayın başından ölçülür (bazı KO yerleşimlerinde ray ortasında duruyordu → kaydırınca rayın altına taşıyordu)
  for (const e of [up, down, tr, thumb]) e.style.pointerEvents = 'auto';
  const LINE = 16;
  const max = () => Math.max(0, box.scrollHeight - box.clientHeight);
  const trackH = () => tr.offsetHeight - thumb.offsetHeight;   // ölçeksiz (arayüz ölçeğinden bağımsız) px
  const sync = () => { if (tekParca) { const k = box.scrollHeight > 0 ? Math.min(1, box.clientHeight / box.scrollHeight) : 1; thumb.style.height = Math.max(10, Math.round(trH0 * k)) + 'px'; }
    const m = max(); thumb.style.transform = `translateY(${m ? Math.max(0, Math.min(1, box.scrollTop / m)) * Math.max(0, trackH()) : (tekParca ? Math.max(0, trackH()) : 0)}px)`; };
  box.addEventListener('scroll', sync); addEventListener('resize', () => requestAnimationFrame(sync));
  // fare tekerleği: içerik her zaman kayar (oyun kamerası yakınlaşmasına gitmez)
  box.addEventListener('wheel', (e) => { if (box.scrollHeight <= box.clientHeight) return; e.preventDefault(); e.stopPropagation(); box.scrollTop += e.deltaY > 0 ? LINE * 3 : -LINE * 3; }, { passive: false }); new MutationObserver(sync).observe(box, { childList: true, subtree: true }); addEventListener('resize', sync);
  const hold = (btn, dir) => {
    let t1 = 0, t2 = 0;
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); btn.setPointerCapture(e.pointerId);
      box.scrollTop += dir * LINE; t1 = setTimeout(() => { t2 = setInterval(() => (box.scrollTop += dir * LINE), 50); }, 300);
    });
    btn.addEventListener('pointerup', stop); btn.addEventListener('pointercancel', stop); btn.addEventListener('lostpointercapture', stop);
  };
  hold(up, -1); hold(down, 1);
  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); thumb.setPointerCapture(e.pointerId);
    const k = tr.getBoundingClientRect().height / tr.offsetHeight || 1;   // ekran px / ölçeksiz px
    const y0 = e.clientY, s0 = box.scrollTop;
    const move = (ev) => { const th = trackH(); if (th > 0) box.scrollTop = s0 + ((ev.clientY - y0) / k / th) * max(); };
    const end = () => { thumb.removeEventListener('pointermove', move); thumb.removeEventListener('pointerup', end); };
    thumb.addEventListener('pointermove', move); thumb.addEventListener('pointerup', end);
  });
  tr.addEventListener('pointerdown', (e) => {
    if (e.target === thumb) return;
    e.preventDefault(); e.stopPropagation();
    const r = thumb.getBoundingClientRect();
    box.scrollTop += (e.clientY < r.top ? -1 : 1) * box.clientHeight * 0.9;
  });
  sync();
}
// atlas parçası yatay uzatılır: arka plan boyutu/konumu genişlikle orantılı ölçeklenir (ilk ölçüler saklanır)
// arayüz ölçeği (Seçenekler → Arayüz ölçeği): kısayol, sohbet, bilgi ve alt menü birlikte büyür/küçülür
export function uiScale() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1; }
export function relayout() { layout(); }
function stretchX(el, w) {
  const d = el.dataset;
  if (!d.w0) { d.w0 = parseFloat(el.style.width) || w; d.bs = el.style.backgroundSize || ''; d.bp = el.style.backgroundPosition || ''; }
  el.style.width = w + 'px';
  if (!d.bs) return;
  const f = w / d.w0, bs = d.bs.split(' '), bp = d.bp.split(' ');
  el.style.backgroundSize = `${parseFloat(bs[0]) * f}px ${bs[1]}`;
  el.style.backgroundPosition = `${parseFloat(bp[0]) * f}px ${bp[1] || '0px'}`;
}
const TB = { menuR: 206, rightW: 303, stripL: 56, side: 168, pL: 48, pR: 51 };
function layout() {
  if (!KO) return;
  // arayüz ölçeği (#kohud zoom: ayarlardaki %50–150 ya da dar ekranda CSS) hesaba katılır → sağ alt düğmeler her ölçekte ekranın sağ kenarında
  const kh = document.getElementById('kohud'), hz = (kh && parseFloat(getComputedStyle(kh).zoom)) || 1;
  const W = innerWidth / (uiScale() * hz), tb = KO.task;
  tb.show('base_state01', true); tb.show('base_state00', false);
  tb.el.style.left = '0px';
  const mv = (id, dx) => { const e = tb.get(id); if (e) e.style.transform = `translateX(${dx}px)`; };
  mv('base_menu', 1);                                       // [-1..206] → [0..207]
  const rightX = Math.max(TB.menuR + 1 + 2 * TB.side + 40, W - TB.rightW);
  mv('base_TaskBar', rightX - 935); mv('base_uimenu', rightX - 935);
  // orta şerit: [menü sonu .. sağ dizi başı]
  const L0 = TB.menuR + 1, S = Math.max(2 * TB.side + 40, rightX - L0), C = S - 2 * TB.side;
  const st = tb.get('base_state01');
  if (st) {
    // şerit yüksekliği yan düğmelerle aynı: [53..107] → [69..107] (alttan ölçekle)
    st.style.transformOrigin = '0 100%'; st.style.transform = `scaleY(${38 / 54})`; st.style.left = (L0 - TB.stripL) + 'px'; st.style.width = (TB.stripL + S) + 'px';
    const q = (id) => st.querySelector(`:scope > [data-id="${id}"]`);
    const set = (el, left, width) => { if (!el) return; el.style.left = left + 'px'; if (width != null) stretchX(el, width); };
    set(q('img_left'), TB.stripL);
    set(q('img_center'), TB.stripL + TB.side, C);
    set(q('img_right'), TB.stripL + TB.side + C);
    set(q('img_left_sub'), TB.stripL + 17);
    set(q('img_right_sub'), TB.stripL + TB.side + C + 99);
    const pr = q('progress_exp'), pw = S - TB.pL - TB.pR;
    set(pr, TB.stripL + TB.pL, pw); pr?.querySelectorAll(':scope > .kui').forEach((e) => stretchX(e, pw));
    const tx = tb.all('str_exp').find((e) => e.parentElement === tb.el);
    if (tx) { tx.style.left = (L0 + TB.pL) + 'px'; tx.style.width = pw + 'px'; tx.style.top = '83px'; tx.style.height = '16px'; tx.style.justifyContent = 'center'; tx.style.alignItems = 'center'; tx.classList.add('ko-exp-yazi'); }
  }
  const bb = tb.get('img_backboard'); if (bb) { bb.style.left = '0px'; bb.style.width = W + 'px'; }
  // kısayol çubuğu: sohbetin sağı ile işlem bilgilerinin solu arasının ortası
  const cr = KO.chat?.el.getBoundingClientRect(), ir = KO.info?.el.getBoundingClientRect();
  if (cr && ir && cr.width && ir.width) document.documentElement.style.setProperty('--hk-cx', ((cr.right + ir.left) / 2) + 'px');
}

// Pencereyi aç/kapat; diğer pencereler kapanır. Döner: işlendiyse true
// KO gibi: karakter, çanta ve beceri pencereleri aynı anda açık kalabilir; yalnızca sistem menüsü diğerlerini kapatır
/** pencere köşesine ölçek tutamağı: sürükle = büyüt/küçült (0.6–2.2), çift tık = varsayılan boyut. Tercih hatırlanır. */
// Sohbet ve işlem bilgileri pencereleri: alt köşedeki kilit (btn_chat_lock). Kilitli (varsayılan) = pencere bulunduğu yerde kalır,
// sürüklenemez ve boyutu değişmez; kilit açıkken pencerenin boş bir yerinden tutup sürüklenir. Konum ve kilit hatırlanır.
function pencereKilit(L, key) {
  const el = L.el, btn = L.get('btn_chat_lock'), KEY = 'ko-pencere-' + key;
  const d = { x: 0, y: 0, kilit: true }; try { Object.assign(d, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  const kaydet = () => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };
  const uygula = () => {
    el.style.translate = `${d.x}px ${d.y}px`; el.classList.toggle('kilitli', !!d.kilit);
    if (btn) { btn.classList.toggle('secili', !!d.kilit); btn.title = d.kilit ? 'Kilitli: pencere yerinde sabit (açmak için tıkla)' : 'Kilit açık: pencereyi boş bir yerinden tutup sürükle (kilitlemek için tıkla)'; }
    relayoutSoon();
  };
  // ekrandan taşmasın: pencerenin en az 60 px'i görünür kalır
  const sinirla = () => {
    const r = el.getBoundingClientRect(), hz = (parseFloat(getComputedStyle(document.getElementById('kohud') || document.body).zoom) || 1);
    let ox = 0, oy = 0;
    if (r.right < 60) ox = 60 - r.right; if (r.left > innerWidth - 60) ox = innerWidth - 60 - r.left;
    if (r.top < 0) oy = -r.top; if (r.top > innerHeight - 40) oy = innerHeight - 40 - r.top;
    if (ox || oy) { d.x += ox / hz; d.y += oy / hz; el.style.translate = `${d.x}px ${d.y}px`; }
  };
  if (btn) L.click('btn_chat_lock', () => { d.kilit = !d.kilit; kaydet(); uygula(); });
  let st = null;
  el.addEventListener('pointerdown', (e) => {
    if (d.kilit || e.button !== 0) return;
    if (e.target.closest?.('input, textarea, .kui-btn, .kui-sc, .kui-tr, .ko-olcek, a, [data-ad]')) return;
    st = { cx: e.clientX, cy: e.clientY, x: d.x, y: d.y, oynadi: false, id: e.pointerId };
  });
  addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.cx, dy = e.clientY - st.cy;
    if (!st.oynadi && Math.hypot(dx, dy) < 5) return;
    if (!st.oynadi) { st.oynadi = true; el.classList.add('suruklen'); try { el.setPointerCapture(e.pointerId); } catch {} }
    const hz = (parseFloat(getComputedStyle(document.getElementById('kohud') || document.body).zoom) || 1);
    d.x = st.x + dx / hz; d.y = st.y + dy / hz; el.style.translate = `${d.x}px ${d.y}px`; e.preventDefault();
  });
  addEventListener('pointerup', (e) => { if (!st || e.pointerId !== st.id) return; const o = st.oynadi; st = null; el.classList.remove('suruklen'); if (o) { sinirla(); kaydet(); relayoutSoon(); } });
  el.addEventListener('dblclick', (e) => { if (d.kilit || e.target.closest?.('input, .kui-btn, .ko-olcek')) return; if (e.target === el || e.target.classList?.contains('kui-img')) { d.x = 0; d.y = 0; kaydet(); uygula(); } });
  uygula(); setTimeout(sinirla, 500);
}
/** KO sohbet / işlem bilgileri genişletme (img_sizechange, noktalı tutamak): pencere alttan sabit, yukarı doğru uzar; yazı boyu / ölçek
 *  değişmez, yalnız gösterilen satır kapasitesi artar. Uygulama: pencerenin içinde bant çizgisini (BANT y) kesen öğeler (arka plan, metin
 *  alanı, kaydırma rayı) H kadar uzar; bandın altında kalanlar H kadar aşağı iner (alt kenar yerinde kalır); üsttekiler yerinde kalır.
 *  kose: 'sag' (sohbet, tutamak sağ üstte) | 'sol' (işlem bilgileri, sol üstte). Çift tık: varsayılan. */
export function olcekTutamak(el, key, kose) {
  // (5.11) KO: tutamak basılı tutulup sürüklenince pencere hem yukarı (H) hem yana (W) uzar: sohbet (sağ üst tutamak) sağa,
  // işlem bilgileri (sol üst tutamak) sola doğru. Yazı boyu değişmez, yalnız görünen satır / sütun kapasitesi artar. Çift tık: varsayılan.
  if (el._kapasite) return; el._kapasite = true;
  const sk = 'ko-kapasite-' + key, skw = 'ko-kapasite-w-' + key, BANT = 60, ENCOK = 420, ENCOKW = 700;
  document.documentElement.style.setProperty(`--k-${key}`, 1);
  try { localStorage.removeItem('ko-olcek-' + key); } catch {}
  let H = 0, W = 0; try { H = Math.max(0, Math.min(ENCOK, Number(localStorage.getItem(sk)) || 0)); W = Math.max(0, Math.min(ENCOKW, Number(localStorage.getItem(skw)) || 0)); } catch {}
  const px = (v) => parseFloat(v) || 0;
  let elH = null, elW = null, BX = 0;
  // y: bant (BANT) çizgisini kesen öğeler uzar, altındakiler iner; x: dikey bant (BX) çizgisini kesen geniş öğeler (pencerenin %35'inden geniş: metin alanı,
  // arka plan şeritleri) uzar, bandın sağındakiler (kaydırma rayı, sağ kenar) sağa kayar; sol kenardakiler yerinde kalır
  const kaydir = (e, ustY, ustX, tasY, tasX) => {
    for (const c of e.children) {
      if (c.classList.contains('ko-olcek')) continue;
      // (5.11) kaydırma rayı (kui-tr): siyah zemin (ilk parça) rayla birlikte uzar; sarı tutamak uzamaz / kaymaz (konumunu bindScroll verir)
      if (e.classList.contains('kui-tr') && c !== e.firstElementChild) continue;
      const st = c.style; if (!st.top && !st.height && !st.left && !st.width) { kaydir(c, ustY, ustX, tasY, tasX); continue; }
      if (c.dataset.kTop == null) { c.dataset.kTop = px(st.top); c.dataset.kH = st.height ? px(st.height) : ''; c.dataset.kLeft = px(st.left); c.dataset.kW = st.width ? px(st.width) : ''; }
      const t = Number(c.dataset.kTop), h = c.dataset.kH === '' ? null : Number(c.dataset.kH), a = ustY + t;
      const l = Number(c.dataset.kLeft), w = c.dataset.kW === '' ? null : Number(c.dataset.kW), b = ustX + l;
      const satir = /^base_num\d/.test(c.dataset.id || '');
      let cy = tasY, cx = tasX;
      // (5.11) uzayan kui görseli: atlas arka planı da aynı oranda ölçeklenir (yoksa atlasın komşu parçaları "çubuk" gibi görünüyordu)
      const bgOlcek = (nw, nh) => {
        if (!c.style.backgroundImage || !/px/.test(c.style.backgroundSize || '')) return;
        if (c.dataset.kBg == null) { c.dataset.kBg = c.style.backgroundSize; c.dataset.kBp = c.style.backgroundPosition; }
        const [bw, bh] = c.dataset.kBg.split(' ').map(px), [bx, by] = (c.dataset.kBp || '0px 0px').split(' ').map(px);
        const fx = w ? nw / w : 1, fy = h ? nh / h : 1;
        c.style.backgroundSize = `${bw * fx}px ${bh * fy}px`; c.style.backgroundPosition = `${bx * fx}px ${by * fy}px`;
      };
      let yeniW = w, yeniH = h;
      if (!tasY) {
        if (!satir && h != null && a < BANT && a + h > BANT) { st.height = (h + H) + 'px'; st.top = t + 'px'; yeniH = h + H; }
        else if (satir || a >= BANT) { st.top = (t + H) + 'px'; cy = true; }
        else st.top = t + 'px';
      }
      if (!tasX) {
        const genis = w != null && w >= elW * 0.35;
        if (genis && b < BX && b + w > BX) { st.width = (w + W) + 'px'; st.left = l + 'px'; yeniW = w + W; }
        else if (b >= BX) { st.left = (l + W) + 'px'; cx = true; }
        else st.left = l + 'px';
      }
      if (c.classList.contains('kui-img') && w != null && h != null) bgOlcek(yeniW, yeniH);
      kaydir(c, a, b, cy, cx);
    }
  };
  const uygula = () => {
    if (elH == null) { elH = px(el.style.height) || el.offsetHeight; elW = px(el.style.width) || el.offsetWidth; BX = kose === 'sol' ? elW * 0.35 : elW * 0.6; }
    kaydir(el, 0, 0, false, false); el.style.height = (elH + H) + 'px'; el.style.width = (elW + W) + 'px';
    const sz = el.querySelector('[data-id="img_sizechange"]');
    // tutamak siyah metin alanının içinde: sohbet → orijinal img_sizechange yeri (sağ üst); işlem bilgileri (img_sizechange gizli / pencere dışı) → metin alanının sol üstü
    const t0 = el.querySelector('[data-id="text0"]');
    if (kose === 'sol' && t0) { let x = 0, y = 0; for (let n = t0; n && n !== el; n = n.parentElement) { x += px(n.style.left); y += px(n.style.top); } hTut.style.left = (x - 4) + 'px'; hTut.style.top = (y - 3) + 'px'; hTut.style.right = 'auto'; }
    else if (sz) { let x = 0, y = 0; for (let n = sz; n && n !== el; n = n.parentElement) { x += px(n.style.left); y += px(n.style.top); } hTut.style.left = x + 'px'; hTut.style.top = y + 'px'; hTut.style.right = 'auto'; }
    // işlem bilgileri sağa yaslı (right: 0): genişlik artınca kendiliğinden sola uzar
    try { localStorage.setItem(sk, String(H)); localStorage.setItem(skw, String(W)); } catch {}
    for (const b of el.querySelectorAll('#sohbet-mesajlar, #bilgi-mesajlar')) b.scrollTop = b.scrollHeight;
    window.dispatchEvent(new Event('resize'));
  };
  const h = document.createElement('div'); h.className = 'ko-olcek ko-olcek-' + kose; const hTut = h;
  h.title = 'Drag: resize · Double-click: default';
  el.querySelectorAll('[data-id="img_sizechange"]').forEach((x) => (x.style.display = 'none'));
  el.append(h);
  setTimeout(uygula, 0);
  let st = null;
  h.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); h.setPointerCapture(e.pointerId); st = { y: e.clientY, x: e.clientX, H, W }; });
  h.addEventListener('pointermove', (e) => {
    if (!st) return;
    const k = (uiScale() || 1) * (parseFloat(getComputedStyle(document.getElementById('kohud') || document.body).zoom) || 1);
    const n = Math.round(Math.max(0, Math.min(ENCOK, st.H + (st.y - e.clientY) / k)));
    const dx = (e.clientX - st.x) / k, m = Math.round(Math.max(0, Math.min(ENCOKW, st.W + (kose === 'sol' ? -dx : dx))));
    if (n !== H || m !== W) { H = n; W = m; uygula(); }
  });
  h.addEventListener('pointerup', () => (st = null));
  h.addEventListener('dblclick', (e) => { e.stopPropagation(); H = 0; W = 0; uygula(); });
}
let _rl = 0; const relayoutSoon = () => { clearTimeout(_rl); _rl = setTimeout(() => { try { layout(); } catch {} }, 30); };
function toggle(L, on) {
  const open = on ?? L.el.hidden;
  const solo = L === KO.exit;
  const grup = ['state', 'klan', 'basarim', 'arkadas', 'unvan'], ayni = grup.some((g) => KO[g] === L);   // Karakter Bilgisi sekmeleri aynı yerde açılır
  for (const k of ['state', 'inv', 'skill', 'exit', 'msg', 'klan', 'basarim', 'arkadas', 'unvan', 'achieve']) if (KO[k] && KO[k] !== L && (solo || k === 'exit' || (ayni && grup.includes(k)))) { if (ayni && grup.includes(k) && !KO[k].el.hidden) sonSolKapanis = performance.now(); KO[k].el.hidden = true; }
  if (L.el.hidden === open) sesUi(open ? 'ac' : 'kapa');   // KO ui_invenopen / ui_invenclose
  const sagKayan = L === KO.inv || L === KO.skill;   // KO: envanter ve beceri (K) penceresi sağdan kayarak gelir, kapanırken sağa kayarak gider
  clearTimeout(L._kapT);
  if (!open && sagKayan && !L.el.hidden && L.el.dataset.sabit) { sagaKaydirKapat(L); return true; }
  L.el.hidden = !open;
  if (open) { const z = (toggle.z = (toggle.z || 20) + 1); L.el.style.zIndex = (ayni || L === KO.achieve) ? 4200 + z : z; }   // Karakter Bilgisi grubu her zaman kısayol (skill) çubuğunun (z 4100) önünde
  // KO: envanter ekranın sağından, Karakter Bilgisi (ve aynı yerdeki Klan / Başarım / Arkadaş / Unvan sekmeleri) solundan kayarak gelir; taşınamaz
  if (open && (L === KO.inv || L === KO.skill)) yanAcildi(L.el, 'sag', () => toggle(L, false), L === KO.inv ? 'inv' : 'skill');   // (31.10) envanter ile beceri (K) aynı anda açık kalmaz: biri açılınca diğeri ve sağdaki başka pencereler (Notice…) kapanır
  else if (open && ayni) yanAcildi(L.el, 'sol', () => toggle(L, false), 'karakter');
  if (open && L === KO.inv) { yanaYasla(L, 'sag'); if (KO.skill && !KO.skill.el.hidden) yanaYasla(KO.skill, 'sag', true, L); }
  else if (open && L === KO.skill) yanaYasla(L, 'sag', false, KO.inv && !KO.inv.el.hidden && !KO.inv._kapaniyor ? KO.inv : null);
  else if (open && ayni) yanaYasla(L, 'sol', kayanAcik());
  return true;
}
let sonSolKapanis = 0;
const kayanAcik = () => performance.now() - sonSolKapanis < 260;   // sekme geçişi (bir pencere kapanıp diğeri hemen açıldı): yeniden kaymaz
setInterval(() => { if (KO && ['state', 'klan', 'basarim', 'arkadas', 'unvan'].some((g) => KO[g] && !KO[g].el.hidden)) sonSolKapanis = performance.now(); }, 100);
/** re_training yazılarını KO ekranındaki gibi diz: hepsi tek boy, kısalmadan; sağdaki kutuda "0 times" / "complete" */
export function egitimDuzen(W) {
  const tx = [...W.el.querySelectorAll('.kui-tx')], bul = (t) => tx.find((e) => e.textContent.trim().toLowerCase() === t);
  const ayar = (e, css) => { if (e) Object.assign(e.style, css); };
  const c = bul('complete'); if (c) c.textContent = 'complete';
  const cnt = W.get('str_count'), tm = bul('times');
  ayar(cnt, { width: '20px', justifyContent: 'flex-end' });
  if (cnt && tm) { tm.style.left = (parseFloat(cnt.style.left) + 22) + 'px'; tm.style.width = '40px'; tm.style.justifyContent = 'flex-start'; }
  if (c && cnt) { c.style.left = (parseFloat(cnt.style.left) - 4) + 'px'; c.style.width = '66px'; c.style.top = (parseFloat(cnt.style.top) + 21) + 'px'; }
}
function sagaKaydirKapat(L) {
  const el = L.el; L._kapaniyor = true;
  let mn = Infinity; for (const c of el.querySelectorAll(':scope > *')) { if (c.hidden || c.offsetParent === null) continue; const r = c.getBoundingClientRect(); if (r.width < 2) continue; mn = Math.min(mn, r.left); }
  const gen = Number.isFinite(mn) ? innerWidth - mn + 24 : 400;
  el.style.transition = 'translate .22s cubic-bezier(.5,0,.8,.4)'; el.style.translate = `${gen}px 0`;
  L._kapT = setTimeout(() => { el.hidden = true; L._kapaniyor = false; el.style.transition = 'none'; el.style.translate = '0 0'; }, 220);
}
/** yan: 'sag' | 'sol'; komsu: sağda açık duran pencere (beceri penceresi envanterin soluna yaslanır) */
function yanaYasla(L, yan, kaymasiz = false, komsu = null) {
  L._kapaniyor = false;
  const el = L.el; el.dataset.sabit = '1';
  el.style.right = el.style.bottom = 'auto'; el.style.margin = '0';
  el.style.transition = 'none'; el.style.translate = '0 0';
  const kutu = () => { let mn = Infinity, mx = -Infinity; for (const c of el.querySelectorAll(':scope > *')) { if (c.hidden || c.offsetParent === null) continue; const r = c.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; mn = Math.min(mn, r.left); mx = Math.max(mx, r.right); } return [mn, mx]; };
  const [mn, mx] = kutu(); if (!Number.isFinite(mn)) return;
  const k = uiScale() || 1, sol = parseFloat(el.style.left);
  const simdi = Number.isFinite(sol) ? sol : el.getBoundingClientRect().left / k;
  let sagSinir = innerWidth;
  if (komsu?.el && !komsu.el.hidden) { let km = Infinity; for (const c of komsu.el.querySelectorAll(':scope > *')) { if (c.hidden || c.offsetParent === null) continue; const r = c.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; km = Math.min(km, r.left); } if (Number.isFinite(km)) sagSinir = km; }
  // L._sagBosluk: arka plan resminin sağındaki saydam gölge payı (px) — çerçeve ekranın tam kenarına oturur
  const dx = yan === 'sag' ? (sagSinir - mx + (sagSinir === innerWidth ? (L._sagBosluk || 0) * k : 0)) : (0 - mn);
  el.style.left = (simdi + dx / k) + 'px';
  if (kaymasiz) return;
  const gen = (mx - mn) + 24;
  el.style.translate = `${yan === 'sag' ? gen : -gen}px 0`;
  void el.offsetWidth;
  el.style.transition = 'translate .24s cubic-bezier(.2,.8,.3,1)'; el.style.translate = '0 0';
}

function message(title, text, onOk) {
  const mb = KO.msg; soruTus = null; mbKompakt(mb, false);
  mb.text('Text_title', title); mb.text('Text_Message', text);
  for (const e of mb.el.querySelectorAll('[data-id="Text_Message"]')) Object.assign(e.style, { whiteSpace: 'pre-line', flexWrap: 'wrap', textAlign: 'center', justifyContent: 'center', alignItems: 'center', font: '12px Arial, sans-serif', lineHeight: '1.35', padding: '0 10px', boxSizing: 'border-box', overflow: 'hidden', height: '' });
  for (const id of ['Btn_Yes', 'Btn_No', 'Btn_Cancel', 'Edit_Common']) mb.show(id, false);
  mb.show('Btn_Ok', true);
  mb.get('Btn_Ok').querySelectorAll('.kui-tx').forEach((e) => (e.textContent = 'OK'));
  mb.click('Btn_Ok', () => { mb.el.hidden = true; onOk?.(); });
  const r = toggle(mb, true); mb.el.style.zIndex = 5000; return r;
}

// evet/hayır sorusu (KO re_messagebox)
// (31.10) kompakt soru kutusu: re_messagebox zemininin ortasından 47 px kesilir (üst + alt parça), düğmeler yukarı kayar
function mbKompakt(mb, on) {
  const el = mb.el;
  if (on && !el._kompaktHazir) {
    const z = [...el.children].find((c) => c.classList.contains('kui-img')); if (z) { z.classList.add('mb-zemin'); for (const k of ['mbk-ust', 'mbk-alt']) { const c = z.cloneNode(true); c.classList.remove('mb-zemin'); c.classList.add(k); z.after(c); } }
    el._kompaktHazir = true;
  }
  el.classList.toggle('mb-kompakt', !!on);
}
// (31.10) kısa onay kutusu (Trade Request, Delete Friend): ortak ileti kutusunu paylaşmaz — kendi kopyası, kendi düğmeleri
// (ortak kutu başka bir pencere / mesaj tarafından aynı anda kullanılınca Yes / No yanıtı kayboluyordu)
function kompaktSoru(title, text, onYes, onNo, ek) {
  const mb = KO.msg, asil = mb.el; if (!asil?.parentNode) return false;
  mbKompakt(mb, true); const el = asil.cloneNode(true); mbKompakt(mb, false);
  document.querySelectorAll('.ko-kutu-soru').forEach((e) => e.remove());
  el.hidden = false; el.classList.add('mb-kompakt', 'ko-kutu-soru'); el.style.zIndex = 9000;
  const q = (id) => [...el.querySelectorAll(`[data-id="${id}"]`)];
  q('Text_title').forEach((e) => (e.textContent = title));
  q('Text_Message').forEach((e) => { e.textContent = text; Object.assign(e.style, { whiteSpace: 'pre-line', flexWrap: 'wrap', textAlign: 'center', justifyContent: 'center', alignItems: 'center', font: '12px Arial, sans-serif', lineHeight: '1.35', padding: '0 10px', boxSizing: 'border-box', overflow: 'hidden', letterSpacing: '0', height: '' }); });
  for (const id of ['Btn_Ok', 'Btn_Cancel', 'Edit_Common']) q(id).forEach((e) => (e.hidden = true));
  let bitti = false;
  const kapat = () => { el.hidden = true; el.remove(); if (soruTus?.mb?.el === el) soruTus = null; };
  const evet = () => { if (bitti) return; bitti = true; kapat(); onYes?.(); }, hayir = () => { if (bitti) return; bitti = true; kapat(); onNo?.(); };
  for (const [id, t, fn] of [['Btn_Yes', ek.evet || 'Yes', evet], ['Btn_No', ek.hayir || 'No', hayir]]) q(id).forEach((b) => {
    b.hidden = false; b.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = t));
    b.onclick = (ev) => { ev.stopPropagation(); fn(); };
  });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  asil.parentNode.append(el); sesUi('ac');
  soruTus = { mb: { el }, evet, hayir };
  return true;
}
function question(title, text, onYes, onNo, etiket = null) {
  const mb = KO.msg;
  const ek = Array.isArray(etiket) ? { evet: etiket[0], hayir: etiket[1] } : (etiket || {});
  if (ek.kompakt) return kompaktSoru(title, text, onYes, onNo, ek);
  mbKompakt(mb, false);
  mb.text('Text_title', title); mb.text('Text_Message', text);
  // uzun metin: sığacak şekilde alt satıra geçer, ortalı ve küçük punto
  for (const e of mb.el.querySelectorAll('[data-id="Text_Message"]')) Object.assign(e.style, { whiteSpace: 'pre-line', flexWrap: 'wrap', textAlign: 'center', justifyContent: 'center', alignItems: 'center', font: '12px Arial, sans-serif', lineHeight: '1.35', padding: '0 10px', boxSizing: 'border-box', overflow: 'hidden', letterSpacing: '0', height: '' });
  for (const id of ['Btn_Ok', 'Btn_Cancel', 'Edit_Common']) mb.show(id, false);
  for (const [id, t] of [['Btn_Yes', ek.evet || 'Yes'], ['Btn_No', ek.hayir || 'No']]) { mb.show(id, true); mb.get(id)?.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = t)); }
  const evet = () => { soruTus = null; mb.el.hidden = true; onYes?.(); }, hayir = () => { soruTus = null; mb.el.hidden = true; onNo?.(); };
  mb.click('Btn_Yes', evet);
  mb.click('Btn_No', hayir);
  soruTus = { mb, evet, hayir };   // Enter = Evet, Esc = Hayır (ör. eşyayı yok et onayı)
  const r = toggle(mb, true); mb.el.style.zIndex = 5000;   // onay kutusu her zaman tüm pencerelerin önünde
  return r;
}
let soruTus = null;
addEventListener('keydown', (e) => {
  const q = soruTus; if (!q) return;
  if (q.mb.el.hidden) { soruTus = null; return; }
  if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
  if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); q.evet(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); q.hayir(); }
}, true);

// metin girişli soru (KO re_messagebox + Edit_Common): klan adı, davet, onay sorusu…
function girdi(title, text, { max = 20, deger = '', evet = 'OK', hayir = 'Cancel' } = {}, onOk, onCancel) {
  const mb = KO.msg; soruTus = null; mbKompakt(mb, false);
  mb.text('Text_title', title); mb.text('Text_Message', text);
  for (const e of mb.el.querySelectorAll('[data-id="Text_Message"]')) Object.assign(e.style, { whiteSpace: 'pre-line', flexWrap: 'wrap', textAlign: 'center', justifyContent: 'center', alignItems: 'center', font: '11.5px Arial, sans-serif', lineHeight: '1.3', padding: '0 10px', boxSizing: 'border-box', overflow: 'hidden', height: '54px' });   // yazı giriş kutusunun (y 103) üstünde kalsın
  for (const id of ['Btn_Ok', 'Btn_Cancel']) mb.show(id, false);
  mb.show('Edit_Common', true);
  const ed = mb.get('Edit_Common'); let inp = ed?.querySelector('input');
  if (ed && !inp) inp = mb.input('Edit_Common', { maxLength: max });
  if (inp) { inp.maxLength = max; inp.value = deger; setTimeout(() => inp.focus(), 30); }
  for (const [id, t] of [['Btn_Yes', evet], ['Btn_No', hayir]]) { mb.show(id, true); mb.get(id)?.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = t)); }
  const bitir = (ok) => { mb.el.hidden = true; mb.show('Edit_Common', false); if (inp) inp.onkeydown = null; ok ? onOk?.(inp?.value.trim() || '') : onCancel?.(); };
  if (inp) inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') bitir(true); if (e.key === 'Escape') bitir(false); };
  mb.click('Btn_Yes', () => bitir(true));
  mb.click('Btn_No', () => bitir(false));
  const r = toggle(mb, true); mb.el.style.zIndex = 5000; return r;
}

// Türkçe etiketler orijinal kutulara sığmıyorsa (Savunma, Karanlık, Nezaket…) yazı küçültülür
function fitTexts(root) {
  requestAnimationFrame(() => root.querySelectorAll('.kui-tx').forEach((e) => {
    if (!e.textContent || e.clientWidth === 0) return;
    let fs = parseFloat(getComputedStyle(e).fontSize);
    while (e.scrollWidth > e.clientWidth + 0.5 && fs > 8) { fs -= 0.5; e.style.fontSize = fs + 'px'; }
    if (e.scrollWidth > e.clientWidth + 0.5) e.style.letterSpacing = '-0.3px';
  }));
}
// deadsoft 2369 statü sayfası (re_page_state 342×611): Reset Stat sağ üstte, KC / TL satırı, altta Anti Defence (silah türüne savunma).
// Yazılar İngilizce (KO'daki gibi), renkler sade (sarı yerine açık bej / beyaz, başlıklar yumuşak altın).
export function statuYeni(fr, ps) {
  fr.el.classList.add('ko-statu2'); ps.el.classList.add('ko-ps2');
  fr.el.style.height = '612px';
  const e = (id, x, y, w, h, metin, sinif) => { const d = document.createElement('div'); d.className = 'kui kui-tx ' + sinif; if (id) d.dataset.id = id; d.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`; if (metin != null) d.textContent = metin; ps.el.append(d); return d; };
  // KC / TL (ilk kutunun 4. satırı)
  e(null, 37, 222, 51, 17, 'KC', 'ps2-etiket'); e('Text_KC', 86, 222, 84, 17, '0', 'ps2-kutu');
  e(null, 167, 222, 51, 17, 'TL', 'ps2-etiket'); e('Text_TL', 214, 222, 84, 17, '0', 'ps2-kutu');
  // Anti Defence (alt kutu): Dagger / Axe, Sword / Spear, Club / Bow
  for (let i = 0; i < 20; i++) ps.show('icon_level_' + i, false);
  const anti = e(null, 106, 492, 130, 17, 'Anti Defence', 'ps2-baslik');
  [['Dagger', 'Axe'], ['Sword', 'Spear'], ['Club', 'Bow']].forEach(([a, b], i) => {
    const y = 513 + i * 22;
    e(null, 44, y, 47, 17, a, 'ps2-etiket'); e('Text_Anti' + a, 91, y, 79, 17, '0', 'ps2-kutu');
    e(null, 169, y, 42, 17, b, 'ps2-etiket'); e('Text_Anti' + b, 211, y, 79, 17, '0', 'ps2-kutu');
  });
  for (const t of ps.el.querySelectorAll('.kui-tx')) { const x = t.textContent.trim(); if (/^(Resistance|Stat Point)$/.test(x)) t.classList.add('ps2-baslik'); if (x === 'Resistance' && anti) { anti.className = t.className; for (const k of ['font', 'fontSize', 'fontFamily', 'fontWeight', 'color', 'letterSpacing', 'textShadow']) anti.style[k] = t.style[k]; } if (/^Contribut/.test(x)) { t.textContent = 'Contribut iveness'; t.classList.add('ps2-iki'); } }
  // KO Stat Preset (sağ üst köşe): orijinal re_stat_preset penceresi (stat-preset.js)
  const b = ps.get('btn_preset');
  if (b) {
    for (const t of b.querySelectorAll('.kui-tx')) t.textContent = '';
    const s = document.createElement('span'); s.className = 'ps2-dugme-yazi'; s.textContent = 'Stat Preset'; b.append(s);
    b.style.left = '228px'; b.style.top = '110px';   // sağ üst köşe (kutuların sağ kenarına hizalı)
    for (const c of b.children) if (c.classList.contains('kui-img')) { c.style.left = '0px'; c.style.top = '0px'; }
    b.title = 'Stat Preset'; ps.click('btn_preset', () => hud.onStatPreset?.(ps.el.closest('.ko-pencere') || ps.el));
  }
}
function fillState() {
  if (!bound || !KO.page) return;
  const { me, S, expNext } = bound(), ps = KO.page;
  const A = charStats, ab = A?.ability || {};
  const lv = A?.level ?? S.level;
  ps.text('Text_Id', me.name); ps.text('Text_Class', (CLS_U[Number(me.nation) === 2 ? 2 : 1])[me.class] || '');
  ps.text('Text_Level', String(lv)); ps.text('Text_Nation', me.nation === 2 ? 'El Morad' : 'Karus');
  ps.text('Text_Exp', `${fmt(A?.exp ?? S.exp)} / ${fmt(A?.exp_next ?? expNext(S.level))}`); ps.text('Text_RealmPoint', `${fmt(A?.np ?? 0)} / ${fmt(A?.np_ay ?? 0)}`);   // KO: ulus puanı / bu ayki ulus puanı
  // uzun değerler kutuya sığsın: yazı küçülür (ulus puanı, EXP)
  requestAnimationFrame(() => { for (const id of ['Text_RealmPoint', 'Text_Exp']) for (const e of ps.el.querySelectorAll(`[data-id="${id}"]`)) { e.style.fontSize = ''; e.style.letterSpacing = ''; e.style.whiteSpace = 'nowrap'; let f = parseFloat(getComputedStyle(e).fontSize) || 12; while (e.scrollWidth > e.clientWidth + 0.5 && f > 7) { f -= 0.5; e.style.fontSize = f + 'px'; } if (e.scrollWidth > e.clientWidth + 0.5) e.style.letterSpacing = '-0.4px'; } });
  ps.text('Text_Cash', fmt(A?.cash ?? me.cash ?? 0)); ps.text('Text_KC', fmt(A?.cash ?? me.cash ?? 0)); ps.text('Text_TL', fmt(A?.tl ?? me.tl ?? 0));
  for (const k of ['Dagger', 'Axe', 'Sword', 'Spear', 'Club', 'Bow']) ps.text('Text_Anti' + k, String(ab[k.toLowerCase() + '_ac'] ?? 0));
  requestAnimationFrame(() => ps.el.querySelectorAll('.meslek-kutu').forEach((e) => { e.style.fontSize = ''; let f = parseFloat(getComputedStyle(e).fontSize) || 12; while (e.scrollWidth > e.clientWidth + 0.5 && f > 7) { f -= 0.5; e.style.fontSize = f + 'px'; } }));
  const st = (k, id) => { const base = A?.[k] ?? me[k], b = ab[k + '_b'] || 0; ps.text(id, b ? `${base} (+${b})` : String(base)); };
  st('str', 'Text_Strength'); st('sta', 'Text_Stamina'); st('dex', 'Text_Dexterity'); st('intel', 'Text_Intelligence'); st('cha', 'Text_MagicAttack');
  ps.text('Text_AP', String(ab.ap ?? Math.round(me.str * 0.6 + S.level * 2))); ps.text('Text_GP', String(ab.ac ?? Math.round(me.sta * 0.4 + S.level)));
  ps.text('Text_Manner', '0'); ps.text('Text_BonusPoint', String(A?.points ?? 0));
  const R = { Fire: 'fire_r', Ice: 'cold_r', LightR: 'lightning_r', Magic: 'magic_r', Curse: 'curse_r', Poison: 'poison_r' };
  for (const [r, k] of Object.entries(R)) ps.text('Text_Regist' + r, String(ab[k] || 0));
  const can = (A?.points || 0) > 0;
  for (const b of ['Btn_Intelligence', 'Btn_MagicAttack', 'Btn_Dexterity', 'Btn_Stamina', 'Btn_Strength']) ps.get(b)?.classList.toggle('kui-pasif', !can);
}
function fillInv() {
  if (!bound || !KO.inv) return;
  const { me, S } = bound(), ab = charStats?.ability;
  KO.inv.text('text_gold', fmt(charStats?.gold ?? S.gold));
  KO.inv.text('text_weight', ab ? `${fmt(Math.round(ab.weight / 10))} / ${fmt(Math.round(ab.max_weight / 10))}` : `0 / ${fmt(Math.round((me.str + 50) * 3))}`);
}
let YP = null;
function fillSkill() {
  if (!bound || !KO.skill) return;
  const { me } = bound(), sk = KO.skill;
  // KO sınıf grubu: 1/5/6 savaşçı, 2/7/8 rogue, 3/9/10 büyücü, 4/11/12 rahip, 13-15 Kurian (savaşçı düğmeleri)
  const c = Number(me.class) || 1, cls = [1, 5, 6, 13, 14, 15].includes(c) ? 'blade' : [2, 7, 8].includes(c) ? 'ranger' : [3, 9, 10].includes(c) ? 'mage' : 'cleric';
  for (const g of ['cleric', 'blade', 'ranger', 'mage']) for (let i = 0; i < 3; i++) sk.show(`btn_${g}${i}`, g === cls);
  YP?.render();
}

export const hud = {
  /** (3.11) tüccar / depo açılınca envanteri hızla kapat (kayma animasyonu kısa) */
  kapatPanel(ad) {
    const L = ad === 'envanter' ? KO.inv : null; if (!L || L.el.hidden) return;
    clearTimeout(L._kapT); const el = L.el; L._kapaniyor = true;
    el.style.transition = 'translate .1s ease-in, opacity .1s ease-in'; el.style.translate = '160px 0'; el.style.opacity = '0';
    L._kapT = setTimeout(() => { el.hidden = true; L._kapaniyor = false; el.style.transition = 'none'; el.style.translate = '0 0'; el.style.opacity = ''; }, 100);
  },
  /** dinlenme: görev çubuğu otur/kalk düğmesi */
  oturBagla(fn) { hud._otur = fn; },
  mailBagla(fn) { hud._mail = fn; },
  mailIkon(n) { const h = KO?.hp; if (!h) return; h.show('img_mail_on', n > 0); h.show('img_mail_normal', false); /* zarf yalnız okunmamış posta varken */ h.all('img_mail_on').forEach((e) => (e.title = n > 0 ? `Posta kutusu (${n} okunmamış)` : 'Posta kutusu')); },
  /** KO dinlenme (re_training) penceresi: oturunca açılır; süre, toplam EXP, tamamlanan tur. null → kapat */
  egitim(d) {
    if (!KO || !hasLayout('re_training')) return;
    let W = KO.egitim;
    if (!W) {
      W = KO.egitim = buildLayout('re_training', { className: 'ko-egitim' });
      // KO: metinler orijinal (İngilizce); "Move immediately." işaretliyken kalkış animasyonu olmadan hemen koşar
      W.text('str_move', 'Move immediately.');
      egitimDuzen(W);
      document.getElementById('kohud').append(W.el);
      let tasi = false; try { tasi = localStorage.getItem('ko-egitim-hemen') === '1'; } catch {}
      const tikCiz = () => { W.tasi = tasi; W.get('btn_move')?.classList.toggle('secili', tasi); };
      tikCiz();
      W.click('btn_move', () => { tasi = !tasi; try { localStorage.setItem('ko-egitim-hemen', tasi ? '1' : '0'); } catch {} tikCiz(); });
      W.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    W.el.hidden = !d; if (!d) return;
    const s = Math.floor(d.sure || 0), hh = String(Math.floor(s / 3600)).padStart(2, '0'), mm = String(Math.floor(s / 60) % 60).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
    W.text('str_time', `${hh}:${mm}:${ss}`); W.text('str_exp', fmt(d.exp || 0)); W.text('str_count', String(d.kez || 0));
  },
  /** dinlenme penceresinde "Taşı" işaretli mi */
  egitimTasi() { return !!KO?.egitim?.tasi; },
  oturDugme(oturuyor) { const tb = KO?.task; if (!tb) return; tb.show('btn_00', !oturuyor); tb.show('btn_01', !!oturuyor); },
  show() {
    // (3.11) KO arayüzü hazır olmadan HUD açılmaz: eski (sade) skill bar / alt menü / durum çubukları ilk girişte bir an görünmesin
    if (koReady && !hud._koBekle) { hud._koBekle = true; const devam = () => hud.show(); koReady.then(devam, devam); return; }
    $('hud').hidden = false; applyKO(); requestAnimationFrame(() => layout());
    // sağ üst mini harita oyuna girişte her zaman açık
    $('mini')?.classList.remove('gizli');
    if (KO?.mini) { const g = KO.mini.get('Group_MiniMap'); if (g) g.hidden = false; for (const id of ['Btn_ZoomIn', 'Btn_ZoomOut', 'Btn_globalmap']) KO.mini.show(id, true); KO.mini.el.hidden = false; }
  },
  /** 1: Karus, 2: El Morad — durum çubuğu ve sohbet penceresinin ırk sürümü */
  nation(n) { nation = n === 2 ? 2 : 1; document.documentElement.classList.toggle('ulus-2', nation === 2); },
  stats(s) {
    lastStats = { ...lastStats, ...s };
    globalThis.koSonDurum = lastStats;   // modül sonradan yüklenirse (secenek-etki.js) son durumu buradan okur
    dispatchEvent(new CustomEvent('ko-durum', { detail: lastStats }));   // KO HUD (alt HP/MP çubuğu, secenek-etki.js)
    if (KO) {
      const S = lastStats, h = KO.hp;
      h.progress('progress_HP', S.hp / S.max_hp); h.text('Text_HP', `${fmt(S.hp)}/${fmt(S.max_hp)}`);
      h.progress('Progress_msp', S.mp / S.max_mp); h.text('Text_MSP', `${fmt(S.mp)}/${fmt(S.max_mp)}`);
      h.text('text_level_id', `Lv.${S.level ?? ''} ${S.name ?? ''}`);
      if (S.expNext) {
        const p = Math.max(0, Math.min(1, S.exp / S.expNext));
        KO.task.all('progress_exp').forEach((e) => KO.task.progress(null, p, e));
        KO.task.text('str_exp', `EXP:${(p * 100).toFixed(2)}%`);
        h.progress('Progress_rest', p);
      }
      if (!KO.state?.el.hidden) fillState();
      if (!KO.inv?.el.hidden) fillInv();
    }
    if (s.name != null) $('d-ad').textContent = s.name;
    if (s.level != null) $('d-sv').textContent = 'Sv. ' + s.level;
    setBar(document.querySelector('#durum .can'), s.hp, s.max_hp);
    setBar(document.querySelector('#durum .mana'), s.mp, s.max_mp);
    if (s.expNext) {
      const p = Math.max(0, Math.min(1, s.exp / s.expNext));
      document.querySelector('#exp i').style.width = (p * 100).toFixed(2) + '%';
      document.querySelector('#exp span').textContent = `EXP ${(p * 100).toFixed(2)}%  (${fmt(s.exp)} / ${fmt(s.expNext)})`;
    }
  },
  target(t) {
    lastTarget = t;
    if (KO) {
      const tg = KO.target; tg.el.hidden = !t; $('hedef').hidden = true;
      // (31.10) can çubuğunun başında sandık simgesi: canavarın drop listesi (oransız)
      if (!tg.sandik) { tg.sandik = sandikEl(); tg.el.append(tg.sandik); tg.sandik.addEventListener('pointerdown', (e) => e.stopPropagation()); tg.sandik.addEventListener('click', (e) => { e.stopPropagation(); const h = tg.sandik._h; if (h) dropAc(h.sid, h.name, tg.sandik); }); }
      tg.sandik._h = t?.mob && t.sid ? t : null; tg.sandik.hidden = !tg.sandik._h;
      if (tg.sandik._h) dropOnYukle(t.sid).catch(() => {});   // (8.11) drop listesi hedef seçilince arka planda hazırlanır → simgeye basınca anında açılır
      if (tg.cerceve && t) {
        let fr = 4;
        if (t.oyuncu) { if (hud.kralMi?.(t.id)) fr = 11; else { const k = hud.rutbeK?.(t.id); if (k != null && k >= 0 && k <= 5) fr = [10, 9, 8, 7, 6, 5][k]; } }
        if (tg.get('frame_' + fr)) tg.cerceve(fr);
      }
      if (tg.isaret) {   // (31.10) sembol kutusu: canavar → drop sandığı; oyuncu → rütbe sembolü (varsa) ya da ulus sembolü (Karus / Human)
        if (tg.sandik.parentElement !== tg.isaret) tg.isaret.append(tg.sandik);
        tg.isaret.querySelector('.hd-ulus, .rutbe-kutu')?.remove();
        if (t?.oyuncu) {
          const r = hud.rutbeEl?.(t.id);
          if (r) tg.isaret.append(r);
          else if (Number(t.nation) === 1 || Number(t.nation) === 2) { const u = document.createElement('i'); u.className = 'hd-ulus hd-ulus-' + (Number(t.nation) === 2 ? 'el' : 'ka'); tg.isaret.append(u); }
        }
        tg.isaret.hidden = !t || (!t.oyuncu && !tg.sandik._h);
      }
      if (tg._sonSid !== (t?.sid ?? null)) { dropKapat(); tg._sonSid = t?.sid ?? null; }
      if (!t) return;
      if (tg.adEl) { tg.adEl.textContent = t.oyuncu ? t.name : `${t.name}${t.level && !seviyeGizli(t) ? '  (Sv. ' + t.level + ')' : ''}`; tg.adEl.style.setProperty('color', t.oyuncu ? ((Number(t.nation) > 0 ? Number(t.nation) !== nation : t.enemy) ? '#ff3c3c' : '#5c8cff') : t.enemy ? '#ffb09a' : '#fff', 'important'); tg.adEl.classList.toggle('hd-oyuncu-ad', !!t.oyuncu); }   // KO: oyuncu adı düşman kırmızı / dost mavi, kalın siyah kenarlı
      const bar = tg.barEl;
      // KO: hedefin kaybettiği can kısmı gri görünür (kırmızının arkasında gri katman)
      const fore = bar?.querySelector(':scope > .st1');
      if (fore && !bar.querySelector(':scope > .ko-hedef-gri')) { const gri = document.createElement('div'); gri.className = 'ko-hedef-gri'; gri.style.cssText = fore.style.cssText; gri.style.background = ''; gri.style.clipPath = ''; fore.before(gri); }
      // can bilinmiyorsa (null) tam kabul edilir; tam canda çubuk tamamen kırmızı, siyah katman hiç görünmez
      const hp = t.hp == null || t.hp === '' ? Number(t.max_hp) : Number(t.hp), mx = Number(t.max_hp) || 0;
      const oran = mx > 0 && Number.isFinite(hp) ? Math.max(0, Math.min(1, hp / mx)) : 1;
      tg.progress(null, oran, bar);
      // (8.11) can çubuğunun tam ortasında beyaz ince yazı: mevcut / toplam can
      if (bar) { let cy = bar.querySelector(':scope > .ko-hedef-can'); if (!cy) { cy = document.createElement('span'); cy.className = 'ko-hedef-can'; bar.append(cy); }
        cy.textContent = mx > 0 && Number.isFinite(hp) ? `${Math.max(0, Math.round(hp))} / ${Math.round(mx)}` : ''; }
      // siyah katman yalnız kaybedilen kısımda (kırmızının dolum yönünün tersinden)
      const gk = bar?.querySelector(':scope > .ko-hedef-gri');
      if (gk) {
        gk.style.display = oran >= 0.999 ? 'none' : '';
        const p = (oran * 100).toFixed(2) + '%';
        gk.style.clipPath = bar._dir === 'r' ? `inset(0 ${p} 0 0)` : bar._dir === 'b' ? `inset(0 0 ${p} 0)` : bar._dir === 't' ? `inset(${p} 0 0 0)` : `inset(0 0 0 ${p})`;
      }
      return;
    }
    const el = $('hedef');
    if (!t) { el.hidden = true; return; }
    el.hidden = false; $('h-ad').textContent = t.name; $('h-sv').textContent = t.level && !seviyeGizli(t) ? 'Sv. ' + t.level : '';
    el.classList.toggle('dusman', !!t.enemy);
    setBar(el.querySelector('.can'), t.hp, t.max_hp, t.showNumbers !== false);
  },
  notice(text, kind = '') {
    // aksiyon bildirimleri yalnızca sağ alttaki işlem bilgileri penceresinde (ekran ortasında gösterilmez)
    if ($('bilgi-mesajlar') || KO) { hud.info(text, kind); return; }
    const d = document.createElement('div'); d.className = 'not ' + kind; d.textContent = text;
    $('bildirim').append(d); setTimeout(() => d.classList.add('git'), 2600); setTimeout(() => d.remove(), 3400);
    hud.info(text, kind);
  },
  /** işlem bilgileri penceresi (sağ alt): hasar, yetenek, düşen Noah/eşya… */
  info(text, kind = '') {
    // sunucu (RPC) mesajları Türkçe gelir → bilinen metinler İngilizceye çevrilir (sunucu-mesaj.js)
    if (typeof text === 'string') { text = enMesaj(text); if (!hud.gmMi?.()) text = trYedek(text); }   // (8.11) oyuncuya Türkçe metin düşmez (GM araç mesajları GM'de Türkçe kalır)
    else if (Array.isArray(text)) text = text.map((p) => (typeof p === 'string' ? enMesaj(p) : Array.isArray(p) && typeof p[0] === 'string' ? [enMesaj(p[0]), ...p.slice(1)] : p));
    // aynı uyarı (hata) kısa sürede iki kez gelirse (ör. aynı anda kullanılamayan yetenek: yerel denetim + sunucu yanıtı) bir kez yazılır
    if (kind === 'hata') { const t = performance.now(); if (hud._sonHata === text && t - (hud._sonHataT || 0) < 1500) return; hud._sonHata = text; hud._sonHataT = t; }
    const box = $('bilgi-mesajlar');
    if (!box) { (hud._iq ||= []).push([text, kind]); return; }
    if (hud._iq) { const q = hud._iq; hud._iq = null; for (const [t, k] of q) hud.info(t, k); }
    const l = document.createElement('div'); l.className = kind;
    // KO işlem bilgisi sekmeleri (All / Status / Item / System): mesajın türüne göre süzme
    l.dataset.k = /^(esya|drop|noah|pazar-satis|bilgi-noah-mavi)$/.test(kind) ? 'esya' : /^(hata|seviye|gorev|tamam|np-kazanc|np-kayip|sistem|duyuru|ors|ors-yok|ors-uyari|ors-kirmizi|soluk)$/.test(kind) ? 'sistem' : 'durum';
    // text dizi olabilir: ['düz yazı', ['renkli parça', 'sınıf'], …] — parçalar ayrı span (ör. mavi Noah tutarı)
    if (Array.isArray(text)) for (const p of text) { if (Array.isArray(p)) { const sp = document.createElement('span'); if (/^(#|rgb)/.test(p[1] || '')) sp.style.setProperty('color', p[1], 'important'); else sp.className = p[1] || ''; sp.textContent = p[0]; l.append(sp); } else l.append(String(p)); }
    else l.textContent = text;
    box.append(l);
    while (box.children.length > 500) box.firstChild.remove(); box.scrollTop = box.scrollHeight;   // (5.11) geçmiş: 500 satır
  },
  /** ekranın üst ortasında duyuru şeridi. kind: 'karsilama' | 'duyuru' */
  banner(text, kind = 'karsilama', sec = kind === 'duyuru' ? 12 : 8) {
    if (kind === 'duyuru') return hud.ticker(text);
    const b = $('duyuru');
    if (!b) { const n = (hud._bw = (hud._bw || 0) + 1); if (n < 40) setTimeout(() => hud.banner(text, kind, sec), 500); return; }
    b.className = 'ko-panel ' + kind; b.innerHTML = '';
    if (kind === 'duyuru') { const h = document.createElement('div'); h.className = 'baslik'; h.textContent = 'DUYURU'; b.append(h); }
    const t = document.createElement('div'); t.className = 'metin'; t.textContent = text; b.append(t);
    b.hidden = false; b.classList.remove('git'); void b.offsetWidth;
    clearTimeout(b._t1); clearTimeout(b._t2);
    b._t1 = setTimeout(() => b.classList.add('git'), sec * 1000); b._t2 = setTimeout(() => (b.hidden = true), sec * 1000 + 900);
  },
  /** GM duyurusu: can çubuğu ile mini harita arasındaki şeritte sağdan sola bir kez kayan sarı yazı (sırayla) */
  ticker(text, { onek = '[Notice] ', renk = '' } = {}) {   // krallık duyuruları: önek yok, pembe
    const q = (hud._tq ||= []); q.push({ t: String(text), onek, renk });
    if (hud._trun) return;
    const next = () => {
      const it = q.shift(); if (it == null) { hud._trun = false; return; }
      const t = it.t;
      hud._trun = true;
      let el = document.getElementById('duyuru-kayan');
      if (!el) { el = document.createElement('div'); el.id = 'duyuru-kayan'; el.innerHTML = '<div class="dk-metin"></div>'; document.body.append(el); }
      // KO: şerit ekranın üst ortasında sabit genişlikte (~680 px); yazı sağdan sola kayar
      el.style.left = ''; el.style.width = '';
      const m = el.firstChild; m.textContent = it.onek + t; m.style.color = it.renk || ''; m.style.textShadow = '';   // duyuru yazısında parıltı yok el.hidden = false;
      const w = el.clientWidth || 680, tw = m.scrollWidth || t.length * 10;
      const dur = Math.max(6, (w + tw) / 120) * 1000;   // ~120 px/sn, tek tur
      m.animate([{ transform: `translateX(${w}px)` }, { transform: `translateX(${-tw - 10}px)` }], { duration: dur, iterations: 1, easing: 'linear' })
        .finished.then(() => { el.hidden = true; next(); }, () => { hud._trun = false; });
    };
    next();
  },
  dead(on, onRevive, arena = false) {
    // oyuna ölü girildiyse KO arayüzü henüz yüklenmemiş olabilir: hazır olunca diriliş penceresi gösterilir
    if (!KO && koReady && !this._koDenendi) { Promise.resolve(koReady).catch(() => {}).then(() => { this._koDenendi = true; this.dead(on, onRevive, arena); }); return; }
    if (KO) {
      toggle(KO.dead, on); if (!on) return;
      // arenada ölünce: onay → iki arenanın arasına (tam canla) dönüş
      // arena: true (Moradon arenası) | 'us' (Ardream: ulusun üssü) | false (Moradon)
      // KO: ölünen haritada doğulur — Luferson / El Morad kalesi: ulusun doğma noktası; diğer haritalar: haritanın doğma noktası
      const yer = (arena && typeof arena === 'object' ? (arena.bolge || 'Moradon') : 'Moradon').replace(/\s*\(.*\)$/, '');
      const ek = (ad) => { const sesli = [...ad.toLowerCase()].reverse().find((h) => 'aeıioöuü'.includes(h)) || 'a'; const s = /[fstkçşhp]$/i.test(ad) ? 't' : 'd'; return /(s[ıiuü])$/i.test(ad) ? `${ad}'n${'aıou'.includes(sesli) ? 'da' : 'de'}` : `${ad}'${s}${'aıou'.includes(sesli) ? 'a' : 'e'}`; };
      const yazi = arena === 'us' ? ['Ulusunun üssünde yeniden doğmak için onayla.', 'Ulus üssünde doğ'] : arena === true ? ['Arenaya dönmek için onayla.', 'Arena girişinde yeniden doğ']
        : arena?.us ? [`${ek(yer)} ulusunun doğma noktasında yeniden doğmak için seç.`, `${ek(yer)} yeniden doğ`] : [`${ek(yer)} yeniden doğmak için seç.`, `${ek(yer)} yeniden doğ`];
      KO.dead.text('text_explanation_1', yazi[0]);
      KO.dead.get('group_0').querySelector('[data-id="text_msg"]').textContent = yazi[1];
      const go = () => { KO.dead.el.hidden = true; onRevive(); };
      KO.dead.get('group_0').querySelector('[data-id="btn"]').onclick = go; KO.dead.click('btn_ok', go);
      return;
    }
    $('olum').hidden = !on; if (on) $('dir').onclick = onRevive;
  },
  window(title, html) {
    const w = $('pencere');
    if (!title) { w.hidden = true; hud.closeAll(); return; }
    w.innerHTML = `<div class="ko-baslik">${title}<button class="kapat" title="Kapat">×</button></div>${html}`;
    w.hidden = false; w.querySelector('.kapat').onclick = () => (w.hidden = true);
  },
  /** envanter açıksa karakter önizleme alanı (area_char, perdeli bölüm) */
  invArea() { return KO?.inv && !KO.inv.el.hidden && $('hud') && !$('hud').hidden ? KO.inv.get('area_char') : null; },
  get windowOpen() { return !$('pencere').hidden || (!!KO && ['state', 'inv', 'skill', 'exit', 'msg'].some((k) => KO[k] && !KO[k].el.hidden)); },
  /** oyuncu verisi kaynağı: () => ({ me, S, expNext }) */
  bind(fn) { bound = fn; },
  /** sunucudan gelen karakter durumu (char_stats): C penceresi ve çanta ağırlığı */
  setCharStats(a) { charStats = a; { const ab = a?.ability || {}, me = bound?.()?.me; import('./esya.js').then((E) => E.oyuncuAyarla({ sinif: Number(me?.class) || null, seviye: Number(a?.level ?? bound?.()?.S?.level) || null, str: ab.str, sta: ab.sta, dex: ab.dex, intel: ab.intel, cha: ab.cha })).catch(() => {}); } if (KO?.page && KO.state && !KO.state.el.hidden) { fillState(); fitTexts(KO.state.el); } if (KO?.inv && !KO.inv.el.hidden) fillInv(); },
  invEl() { return KO?.inv?.el || null; },
  get invOpen() { return !!KO?.inv && !KO.inv.el.hidden; },
  /** bulunulan bölgenin adı (mini harita başlığı + bildirim satırı) */
  get zoneName() { return zoneName; },
  zone(name, id) {
    zoneName = name; zoneId = id;
    if (KO?.mini) KO.mini.text('str_zoneid', name);
  },
  /** mini harita yakınlaştırma merkezi (0..1) */
  miniFocus(u, v) { const z = document.querySelector('.mini-zoom'); if (z) z.style.transformOrigin = `${(u * 100).toFixed(2)}% ${(v * 100).toFixed(2)}%`; },
  /** orijinal pencereyi aç/kapat. İşlendiyse true */
  panel(k) {
    if (!KO) return false;
    const soon = (t) => message(t, 'This feature will be available in a later update.');
    switch (k) {
      case 'karakter': { if (!KO.state) return false; fillState(); const r = toggle(KO.state); fitTexts(KO.state.el); return r; }
      case 'envanter': if (!KO.inv) return false; if (KO.inv.el.hidden && [...document.querySelectorAll('.ko-tic2')].some((e) => e.isConnected && !e.hidden)) return true; fillInv(); return toggle(KO.inv);   // (3.11) tüccar dükkânı (KO re_transaction) açıkken envanter açılmaz
      case 'beceri': if (!KO.skill) return false; fillSkill(); return toggle(KO.skill);
      case 'sistem': case 'sistem_cikis': return toggle(KO.exit);
      case 'sismenu': import('./sistem-menu.js').then(({ sistemMenu }) => sistemMenu(hud, KO.task?.get('btn_menu'))).catch((e) => console.warn('sistem menüsü', e)); return true;
      case 'ev': if (hud.onTown) { hud.onTown(); return true; } return false;
      case 'klan': { if (!KO.klan) return soon('Klan'); const r = toggle(KO.klan); if (!KO.klan.el.hidden) hud.onKlanAc?.(); return r; }
      case 'unvan': { if (!KO.unvan) return false; if (!KO.unvan._bagli && hud.unvanBagla) { hud.unvanBagla(KO.unvan); KO.unvan._bagli = true; } const r = toggle(KO.unvan); if (!KO.unvan.el.hidden) hud.onUnvanAc?.(); return r; }
      case 'basarim': if (KO.achieve) { if (!KO.achieve._bagli && hud.achieveBagla) { hud.achieveBagla(KO.achieve); KO.achieve._bagli = true; } const r = toggle(KO.achieve); if (!KO.achieve.el.hidden) hud.onAchieveAc?.(); return r; }
      // falls through
      case 'basarim_eski': { if (!KO.basarim) return soon('Achievements'); const r = toggle(KO.basarim); if (!KO.basarim.el.hidden) hud.onBasarimAc?.(); return r; }
      case 'takas': if (hud.onTakas) { hud.onTakas(); return true; } return soon('Trade');   // seçili oyuncuya takas isteği (/Trade)
      case 'parti': if (hud.onParti) { hud.onParti(); return true; } return soon('Party');   // (3.11) KO Party Board
      case 'arkadas': { if (!KO.arkadas) return soon('Friends'); const r = toggle(KO.arkadas); if (!KO.arkadas.el.hidden) hud.onArkadasAc?.(); return r; }
      case 'gorev': if (hud.onGorev) { hud.onGorev(); return true; } return soon('Quests'); case 'ayar': return hud.onOptions ? hud.onOptions() : soon('Options'); case 'magaza': if (hud.onMagaza) { hud.onMagaza(); return true; } return soon('Mağaza'); case 'etkinlik': return soon('Etkinlikler');
      default: return false;
    }
  },
  /** açık pencereleri kapat; hiçbiri açık değilse false */
  /** pencereyi aç (açıksa dokunma) */
  acPanel(k) { const L = { beceri: KO?.skill, envanter: KO?.inv, karakter: KO?.state }[k]; if (L && !L.el.hidden) return true; return this.panel(k); },
  soru(title, text, onYes, onNo, etiket) { if (!KO?.msg) return false; return question(title, text, onYes, onNo, etiket); },
  /** açık soru kutusunu yanıtsız kapat (ör. süresi dolan takas isteği) */
  soruKapat() { if (soruTus) { soruTus.mb.el.hidden = true; if (soruTus.mb.el.classList.contains('ko-kutu-soru')) soruTus.mb.el.remove(); soruTus = null; } },
  girdi(title, text, opt, onOk, onCancel) { if (!KO?.msg) return false; return girdi(title, text, opt, onOk, onCancel); },
  mesaj(title, text, onOk) { if (!KO?.msg) return false; return message(title, text, onOk); },
  /** bağımsız KO mesaj kutusu (re_messagebox kopyası; ortak kutuyu meşgul etmez): bağlantı / kopma pencereleri. null → KO arayüzü yok */
  koKutu({ baslik = '', metin = '', buton = null, onButon = null, perde = true } = {}) {
    const asil = KO?.msg?.el; if (!asil?.parentNode) return null;
    const el = asil.cloneNode(true); el.hidden = false; el.classList.add('ko-kutu-bag'); el.style.zIndex = 9001;
    const q = (id) => [...el.querySelectorAll(`[data-id="${id}"]`)];
    q('Text_title').forEach((e) => (e.textContent = baslik));
    const yaz = (t) => q('Text_Message').forEach((e) => { e.textContent = t; Object.assign(e.style, { whiteSpace: 'pre-line', flexWrap: 'wrap', textAlign: 'center', justifyContent: 'center', alignItems: 'center', font: '12px Arial, sans-serif', lineHeight: '1.35', padding: '0 10px', boxSizing: 'border-box', overflow: 'hidden', height: '' }); });
    yaz(metin);
    for (const id of ['Btn_Yes', 'Btn_No', 'Btn_Cancel', 'Edit_Common', 'Btn_Ok']) q(id).forEach((e) => (e.hidden = true));
    if (buton) q('Btn_Ok').forEach((e) => { e.hidden = false; e.querySelectorAll('.kui-tx').forEach((t) => (t.textContent = buton)); e.onclick = (ev) => { ev.stopPropagation(); onButon?.(); }; });
    let pd = null;
    if (perde) { pd = document.createElement('div'); pd.className = 'ko-kutu-perde'; asil.parentNode.append(pd); }
    asil.parentNode.append(el);
    return { el, yaz, kapat() { el.remove(); pd?.remove(); } };
  },
  /** klan penceresi yerleşimi (klan.js doldurur) */
  klanL() { return KO?.klan || null; },
  /** başarım penceresi yerleşimi (basarim.js doldurur) */
  basarimL() { return KO?.basarim || null; },
  unvanL() { return KO?.unvan || null; },
  achieveL() { return KO?.achieve || null; },
  /** arkadaş penceresi yerleşimi (arkadas.js doldurur) */
  arkadasL() { return KO?.arkadas || null; },
  closeAll() { if (!KO) return false; let any = false; for (const k of ['state', 'inv', 'skill', 'exit', 'msg', 'klan', 'basarim', 'arkadas']) if (KO[k] && !KO[k].el.hidden) { KO[k].el.hidden = true; any = true; } return any; },
};
// (4.11) kral krallığı bırakınca / yeni kral gelince hedef çerçevesi anında güncellenir (K çerçevesi → rütbe çerçevesi)
addEventListener('ko-kral-degisti', () => { if (lastTarget) { try { hud.target(lastTarget); } catch {} } });
