// KO H menüsü = "Command" penceresi (deadsoft 2369 re_cmdlist): üstte komut grupları (Private / Trade / Party / Clan / Knights / Guardian Monster / King [/ GM]),
// altta seçili grubun komutları. Adlar ve açıklamalar KO Texts_us (7800–9511). Komuta çift tıklanınca çalışır; doğrudan karşılığı yoksa sohbete "/Komut " yazılır.
import { ekUI, hasLayout, buildLayout, draggable } from './kui.js';

const GRUP = [   // [ad, açıklama, [[komut, açıklama], …]]
  ['Private', 'Character related commands.', [
    ['PM', '[Private Message] : Type /%s Character ID'], ['Town', '[Return to Town] : Type /%s'], ['Exit', '[Exit Game] : Type /%s'],
    ['Greeting', '[Greeting] : Type /%s'], ['Greeting2', '[Greeting2] : Type /%s'], ['Greeting3', '[Greeting3] : Type /%s'],
    ['Provoke', '[Provoke] : Type /%s'], ['Provoke2', '[Provoke2] : Type /%s'], ['Provoke3', '[Provoke3] : Type /%s'],
    ['Recommend', '[Recommend] : Click on the character you want to recommend and type /%s'],
    ['Individual_Battle', '[Individual Battle]: Click on the opponent or /%s character'], ['Sit/Stand', 'Sit or stand. (C)'], ['Walk/Run', 'Walk or run. (Y)'],
    ['Location', 'Indicates character location /%s'], ['Add_Friend', '[Add friend] : /%s Character ID'], ['Chat_Room', ''], ['Macro', ''],
    ['chatblock', '/chatblock Character ID'], ['nation_chat', '[nation_chat] : /%s'], ['Vault', '[Vault] : /vault'], ['Achieve', '[Achieve]:/%s'], ['IMIR', '[IMIR]: /%s'],
  ]],
  ['Trade', 'Trade related commands.', [
    ['Trade', '[Trade with other users] : Click on the character you want to trade with and type /%s.'], ['Block_Trade_Request', '[Block Trade Request] : Type /%s'],
    ['Allow_Trade_Request', '[Allow Trade Request] : Type /%s'], ['Merchant', '[Become a Trader] : Type /%s'],
    ['Price', '[Market Price] : Type /%s'], ['Edit_Merchant', '[Edit Merchant] : Type /%s while your shop is open'],
  ]],
  ['Party', 'Party related commands.', [
    ['Party', '[Form Party] : Click on the character you want to form a party with and type /%s'], ['Quit_party', '[Quit Party] : Type /%s'],
    ['Seeking_Party', '[Seeking Party] : Type /%s'], ['Block_Party', '[Block Party Request] : Type /%s'], ['Allow_Party', '[Allow Party Request] : Type /%s'],
  ]],
  ['Clan', 'Clan related commands.', [
    ['Join_Clan', '[Invite into a clan] : Click the character you want to invite and /%s'], ['Quit_Clan', '[Quit Clan] : Type /%s'],
    ['Ban_from_Clan', '[Ban Clan Member] : Type /%s Character ID'], ['Command', '[Clan Leader giving commands during Lunar War] : Type /%s'],
    ['Clan_War', '[Challenge Clan War] : Click on the clan leader and type /%s'], ['Surrender', '[Surrender Clan War] : /%s'],
    ['Appoint_as_Assistant_Clan_Leader', '[Appoint Assistant Clan Leader] : Type /%s Character ID'],
    ['Clan_Chat', '[Clan Chat or Knights Chat] : Type /%s and type in the message you want to send to users in your Clan or Knights.'],
    ['Clan_Battle', '[Clan Battle]: Click on the opposing clan leader or /%s clan leader'], ['ClanNotice', ''], ['Kick', ''],
  ]],
  ['Knights', 'Knights related commands.', [
    ['Confederacy', '[Form Knights Confederacy] : Click on the leader of the Knights you wish to form confederacy with and type /%s.'],
    ['Ban_Knights', '[Ban a Knights from Confederacy] : Click on Leader of a Knights and type /%s'], ['Quit_Knights', '[Quit Knights Confederacy] : Type /%s'],
    ['Report', '[Lock a macro tool user]: To send a macro user to a prison, click the user and type /%s'], ['Base', '[Build Castle Siege War Base] : Type /%s'],
    ['Declaration', '[Set Main Artifact for a Castle Siege War] : Type /%s at the spot where you want to set the main artifact.'],
  ]],
  ['King', 'Commands for King.', [
    ['RoyalOrder', '[Message to All(Same Nation)] /%s Message'], ['Prize', '[Reward Coins to a certain User] /%s User ID Amount of Coins'],
    ['ExperiencePoint', '[Start Experience Point Event 10%, 30%, 50%] /%s Increase Rate'], ['DropRate', '[Start Coin Event 1~3] /%s Increase Rate'],
    ['Rain', '[Rain 1~100] /%s Rate'], ['Snow', '[Snow 1~100] /%s Rate'], ['Clear', '[Clear Sky 1~100] /%s Rate'],
    ['Report', '[Detaining macro user in prison] : After clicking on the user you would like to detain in prison/%s'],
    ['Join_Investigation_Team', '[Join investigation team] click on user you like to invite /%s'],
    ['Ban_from_Investigation_Team', '[Ban from investigation team]ban user from investigation team /%s'],
    ['Leave_Investigation_Team', '[Quit Investigation team] Quit investigation team /%s'], ['Reward', '[Put a reward on a person-Message to all] /%s User ID and Reward Amount'],
  ]],
];
// KO 2369 Command listesi: Guardian Monster grubu yok; en altta "Merchant Block" (Texts 8206: tüccar tezgâhlarını gizle / göster)
GRUP.push(['Merchant Block', 'Hide or show merchant stalls.', [['Merchant Block', '[Merchant Block] : Hides other users\' merchant stalls. Select again to show them.']]]);
const GM_GRUP = ['GM', 'GM related commands.', ['VISIBLE', 'INVISIBLE', 'CLEAN', 'RAINING', 'SNOWING', 'TIME', 'COUNT', 'NOTICE', 'ARREST', 'FORBIDCONNECT', 'FORBIDCHAT', 'PERMITCHAT',
  'NOTICEALL', 'CUTOFF', 'VIEW', 'UNVIEW', 'FORBIDUSER', 'SUMMONUSER', 'ATTACKDISABLE', 'ATTAKCENABLE', 'PLC', 'GOOUT', 'FORBIDUSER2', 'FORBIDUSER3', 'CHECKBUFF', 'MON_UNDEAD', 'MON_NODROP'].map((k) => [k, ''])];

export function initHMenu({ state, hud }) {
  let W = null, grup = 0, komut = 0, sonTik = { id: null, i: -1, t: 0 };
  const sohbeteYaz = (s) => { const i = document.getElementById('sohbet-giris'); if (!i) return; i.value = s; i.focus(); i.setSelectionRange(s.length, s.length); };
  // komutlar ko-komut.js'te (sohbetteki "/Komut" ile aynı); karşılığı yoksa sohbete "/Komut " yazılır
  async function calistir(ad) {
    if (ad === 'Merchant Block') { const on = document.documentElement.classList.toggle('ko-tuccar-gizli'); hud.info?.(on ? 'Merchant stalls of other users are hidden.' : 'Merchant stalls are shown again.', 'gorev'); return; }
    if (state.koKomut && await state.koKomut.calistir('/' + ad)) return; sohbeteYaz(`/${ad.replace(/ /g, '_')} `); }

  const gruplar = () => (state.ghost ? [...GRUP, GM_GRUP] : GRUP);

  // KO liste kutusu: satırlar + kaydırma (ok düğmeleri, tekerlek, sürüklenebilir sarı tutamak)
  function liste(id, satirlar, sec, onSec, onCift, cls) {
    const ls = W.get(id); if (!ls) return;
    let kutu = ls.querySelector(':scope > .cmd-kutu');
    if (!kutu) {
      kutu = document.createElement('div'); kutu.className = 'cmd-kutu ' + cls; ls.prepend(kutu);
      const sc = ls.querySelector(':scope > .kui-sc'), btn = [...(sc?.querySelectorAll(':scope > .kui-btn') || [])].sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
      const tr = sc?.querySelector(':scope > .kui-tr'), tut = [...(tr?.children || [])].find((e) => e.style.height === '25px');
      const SAT = 18, gor = () => Math.floor(kutu.clientHeight / SAT);
      kutu._kay = (d) => { kutu.scrollTop = Math.max(0, Math.min(kutu.scrollHeight - kutu.clientHeight, kutu.scrollTop + d * SAT)); };
      kutu.addEventListener('scroll', () => { if (!tut || !tr) return; const m = kutu.scrollHeight - kutu.clientHeight, a = tr.clientHeight - 25; tut.style.top = (m > 0 ? Math.round(kutu.scrollTop / m * a) : 0) + 'px'; });
      kutu.addEventListener('wheel', (e) => { e.preventDefault(); kutu._kay(Math.sign(e.deltaY) * 3); }, { passive: false });
      btn[0]?.classList.add('kui-tik'); btn[1]?.classList.add('kui-tik');
      if (btn[0]) btn[0].onclick = (e) => { e.stopPropagation(); kutu._kay(-1); };
      if (btn[1]) btn[1].onclick = (e) => { e.stopPropagation(); kutu._kay(1); };
      if (tut && tr) tut.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault(); const y0 = e.clientY, s0 = kutu.scrollTop, m = kutu.scrollHeight - kutu.clientHeight, a = tr.clientHeight - 25;
        const mv = (ev) => { if (a > 0) kutu.scrollTop = s0 + (ev.clientY - y0) / a * m; };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      void gor;
    }
    kutu.innerHTML = satirlar.map(([t, ip], i) => `<div class="cmd-satir${i === sec ? ' secili' : ''}" data-i="${i}" title="${(ip || '').replace(/"/g, '&quot;')}">${t}</div>`).join('');
    kutu.querySelectorAll('.cmd-satir').forEach((d) => {
      // (7.11) çift tık elle algılanır: ilk tık listeyi yeniden çizdiği için (satır öğesi değişir) tarayıcının dblclick olayı hiç gelmiyordu
      //   → H → Party → Party çift tıkla seçili oyuncuya parti daveti gitmiyordu
      d.onclick = (e) => {
        e.stopPropagation(); const i = +d.dataset.i, t = performance.now();
        const cift = onCift && sonTik.id === id && sonTik.i === i && t - sonTik.t < 450;
        sonTik = cift ? { id: null, i: -1, t: 0 } : { id, i, t };
        if (cift) onCift(i); else onSec(i);
      };
    });
    kutu.dispatchEvent(new Event('scroll'));
  }
  function ciz() {
    const G = gruplar(); if (grup >= G.length) grup = 0;
    liste('list_curtailment', G.map(([a, d]) => [a, d]), grup, (i) => { grup = i; komut = 0; ciz(); W.get('list_content')?.querySelector('.cmd-kutu')?.scrollTo(0, 0); }, null, 'cmd-grup');
    liste('list_content', G[grup][2].map(([k, d]) => [k, d.replace('%s', k)]), komut, (i) => { komut = i; ciz(); }, (i) => calistir(G[grup][2][i][0]), 'cmd-komut');
  }

  // yedek: KO arayüzü yüklenemezse basit pencere
  const yedek = document.createElement('div'); yedek.id = 'ko-hmenu'; yedek.hidden = true;
  (document.getElementById('kohud') || document.body).append(yedek);
  yedek.addEventListener('pointerdown', (e) => e.stopPropagation());
  function yedekCiz() {
    yedek.innerHTML = '<div class="hm-baslik">Command<button class="hm-kapat">×</button></div>' + gruplar().map(([g, , l]) => `<div class="hm-grup">${g}</div>` + l.map(([k]) => `<button class="hm-dugme" data-k="${k}">${k}</button>`).join('')).join('');
    yedek.querySelector('.hm-kapat').onclick = () => ac(false);
    yedek.querySelectorAll('.hm-dugme').forEach((b) => (b.onclick = () => calistir(b.dataset.k)));
  }

  const hazir = ekUI('cmdui').then((ok) => {
    if (!ok || !hasLayout('re_cmdlist')) return false;
    W = buildLayout('re_cmdlist', { className: 'ko-cmdlist ko-pencere' }); W.el.hidden = true;
    (document.getElementById('kohud') || document.body).append(W.el);
    W.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    W.click('btn_cancel', () => ac(false));
    W.el.dataset.sabit = '1';   // taşınamaz (sağa yapışık)
    return true;
  }).catch(() => false);

  // (2.11) H menüsü ekranın sağ kenarına yapışık (dikeyde ortalı), taşınamaz
  const sagaYapistir = () => {
    if (!W || W.el.hidden) return;
    const z = parseFloat(getComputedStyle(W.el.parentElement || document.body).zoom) || 1;
    const w = W.el.offsetWidth || 198, h = W.el.offsetHeight || 573;
    W.el.style.left = Math.max(0, innerWidth / z - w) + 'px'; W.el.style.top = Math.max(0, Math.round((innerHeight / z - h) / 2)) + 'px';
  };
  addEventListener('resize', sagaYapistir);
  let acik = false;
  async function ac(on = !acik) {
    acik = on;
    if (await hazir) {
      W.el.hidden = !on;
      if (on) { sagaYapistir(); ciz(); }
    } else { yedek.hidden = !on; if (on) yedekCiz(); }
  }
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'KeyH') { ac(); e.preventDefault(); }
    else if (e.code === 'Escape' && acik) { ac(false); e.stopImmediatePropagation(); }
  }, true);
  return { ac };
}
