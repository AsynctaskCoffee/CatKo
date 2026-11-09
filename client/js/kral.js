// KO Krallık sistemi (Knight Empire) — istemci.
//  Sunucu: kral_bilgi / kral_adaylar / kral_aday_goster / kral_aday_kayit / kral_vaat_kaydet / kral_oy_ver / kral_sucla_* /
//          kral_vergi_ayarla / kral_pay_al / kral_ver (/Price) / kral_emir (/RoyalOrder) / kral_etkinlik / kral_hava / kral_nobetci / kral_ayril,
//          kral_durum (iki ulusun kralı, hava, etkinlik), kral_aura_yenile (+%3 HP/MP), gm_kral. Duyurular: kral_duyuru tablosu (realtime).
//  Arayüz: deadsoft co_king_* yerleşimleri (assets/ui/kral) — [Election Official] Roben: seçim; [Grand Chamberlain] Laisa / Rina: hazine ve vergi.
import * as THREE from '../vendor/three.module.min.js';
import { buildLayout, draggable, ekUI, hasLayout, paintSprite, findSprite } from './kui.js';
import { toFront } from './ko-pencere.js';

export const ROBEN = new Set([14404, 24404]);
export const LISA = new Set([14405, 24405]);
const ULUS_AD = { 1: 'Karus', 2: 'El Morad' };
const KALE = { 1: 'karus2004', 2: 'elmo2004' };
const noah = (n) => Number(n || 0).toLocaleString('tr-TR');
const tarih = (t) => { if (!t) return '-'; const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ASAMA = { aday: 'Nomination', kayit: 'Nominee registration', oylama: 'Election' };

export function initKral({ sb, character, hud, state, addLine, scene, camera, player }) {
  const me = Number(character.id);
  let DURUM = {};   // kral_durum: { "1": {id, ad, hava, exp, drop, nobetciler}, "2": … }
  const rpc = async (fn, args = {}, sessiz = false) => {
    const { data, error } = await sb.rpc(fn, { p_char: me, ...args });
    if (error) { if (!sessiz) hud.notice?.(error.message, 'hata'); return null; }
    if (data && data.ok === false) { if (!sessiz) hud.notice?.(data.reason || data.mesaj || 'The operation failed.', 'hata'); return null; }
    return data;
  };
  const kat = () => document.getElementById('kohud') || document.body;
  // krallık arayüz paketi: oyun arayüzü (ui.json) yüklenmeden çağrılırsa eklenemez → her pencerede yeniden denenir (başarı önbellekli)
  const hazirAl = async () => { for (let i = 0; i < 40; i++) { if (await ekUI('kral').catch(() => false)) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };
  ekUI('kral').catch(() => {});

  // ---------------- KO pencere yardımcıları
  const etiket = (el, t) => { if (!el) return; const tx = el.querySelectorAll('.kui-tx'); if (tx.length) tx.forEach((e) => (e.textContent = t)); else el.textContent = t; };
  const pencereler = new Map();
  function pencere(ad, cls = '') {
    pencereler.get(ad)?.el.remove();
    // KO: alt pencere (aday göster / kayıt / liste / oy / pano) Roben'in ana penceresinin yerine açılır
    if (/electionboard|electionlist|election_vote|electionregist|memberrecommend/.test(ad)) kapat('co_king_electionmain');
    const L = buildLayout(hasLayout(ad + '_us') ? ad + '_us' : ad, { className: 'ko-pencere ko-kral ' + cls });   // deadsoft güncel (US) yerleşimi varsa o
    kat().append(L.el); draggable(L, 30);
    L.el.style.left = Math.max(8, (innerWidth - L.el.offsetWidth) / 2) + 'px'; L.el.style.top = Math.max(44, (innerHeight - L.el.offsetHeight) / 2 - 30) + 'px';
    // NPC menüsü / görev penceresinin önünde kalsın (KO pencere sırası + 5000)
    const one = () => { toFront(L.el); L.el.style.zIndex = String(5000 + (Number(L.el.style.zIndex) || 0)); };
    L.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); one(); }); one();
    for (const k of ['keydown', 'keyup']) L.el.addEventListener(k, (e) => { e.stopPropagation(); if (e.key === 'Escape') kapat(ad); });
    // İngilizce etiketler: KO yerleşimindeki özgün yazılar olduğu gibi kalır
    L.el.querySelectorAll('[data-id="image_karu"]').forEach((e) => (e.hidden = Number(character.nation) !== 1));
    L.el.querySelectorAll('[data-id="image_elmo"]').forEach((e) => (e.hidden = Number(character.nation) !== 2));
    // KO başlık plakası: re_various_frame'in turuncu başlık levhası (sprite 717 + 716, "Character Info" levhası) + KO kapatma düğmesi (302-305)
    L.el.dataset.ulus = String(character.nation);
    const BASLIK = { co_king_electionmain: 'Election for a King', co_king_memberrecommend: 'Nominate a King', co_king_electionregist: 'Nominee Registration', co_king_electionlist: 'Nominee List',
      co_king_election_vote: 'Election', co_king_electionboard: 'Nominee Board', co_msgboxok_king: 'Kingdom', co_msgboxokcancel_king: 'Impeachment', co_king_election_yesnomsgbox: 'Confirm' };
    L.el.classList.add('kral-dekor', /msgbox/.test(ad) ? 'kral-dekor-kucuk' : 'kral-dekor-buyuk');
    const x = document.createElement('div'); x.className = 'kral-x'; x.title = 'Close';
    const xs = [302, 304, 303].map((sp) => { const e = document.createElement('i'); try { paintSprite(e, sp, 34, 33); } catch {} return e; });
    xs.forEach((e, i) => { e.className = 'kx-' + i; x.append(e); });
    // sürükleme (draggable) basışı yakalamasın: kapatma düğmesi kendi basışını durdurur
    for (const ev of ['pointerdown', 'mousedown']) x.addEventListener(ev, (e) => e.stopPropagation());
    x.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); kapat(ad); });
    L.el.append(x);
    pencereler.set(ad, L);
    return L;
  }
  const kapat = (ad) => { pencereler.get(ad)?.el.remove(); pencereler.delete(ad); };
  const tikla = (L, id, fn) => L.click(id, fn);
  /** bilgi panosu: deadsoft co_king_electionregist çerçevesi (simetrik çift çerçeve, alt düğme yuvaları); içerik edit_board alanına */
  function pano(cls = '') {
    const L = pencere('co_king_electionregist', 'kral-pano2 ' + cls);
    const kutu = L.get('edit_board'); kutu.textContent = ''; kutu.classList.add('kh-icerik');
    L.el.querySelectorAll('.kui-tx').forEach((t) => { if (/^\/ 500$/.test(t.textContent.trim())) t.hidden = true; });
    L.show('str_textsize', false);
    etiket(L.get('btn_ok'), 'OK'); etiket(L.get('btn_close'), 'Close');
    tikla(L, 'btn_ok', () => kapat('co_king_electionregist')); tikla(L, 'btn_close', () => kapat('co_king_electionregist'));
    return { L, kutu };
  }
  /** yazı alanına sığdır: taşarsa yazı küçülür (en az 9 px) */
  const sigdir = (el) => { if (!el || !el.textContent) return; el.style.fontSize = ''; requestAnimationFrame(() => { let f = parseFloat(getComputedStyle(el).fontSize) || 11; while (el.scrollWidth > el.clientWidth + 0.5 && f > 9) el.style.fontSize = (f -= 0.5) + 'px'; }); };
  /** KO bilgi kutusu (co_msgboxok_king) */
  function bilgi(metin, sonra) {
    const L = pencere('co_msgboxok_king', 'kral-mesaj');
    L.text('text_msg', metin); tikla(L, 'btn_ok', () => { kapat('co_msgboxok_king'); sonra?.(); });
  }
  /** KO evet / hayır (co_king_election_yesnomsgbox) */
  function evetHayir(metin, evet, hayir) {
    const L = pencere('co_king_election_yesnomsgbox', 'kral-soru');
    L.text('str_msg', metin);
    tikla(L, 'btn_yes', () => { kapat('co_king_election_yesnomsgbox'); evet?.(); });
    tikla(L, 'btn_no', () => { kapat('co_king_election_yesnomsgbox'); hayir?.(); });
  }

  // ---------------- [Election Official] Roben — co_king_electionmain
  async function roben() {
    if (!(await hazirAl())) { hud.notice?.('Could not load the kingdom interface. Please try again in a moment.', 'hata'); return; }
    const d = await rpc('kral_bilgi'); if (!d) return;
    const L = pencere('co_king_electionmain', 'kral-ana');
    const s = d.secim, sc = d.sucla, k = d.kral;
    for (const id of ['textmain_half', 'textmain_half_down', 'textmain_half_up', 'textsub_full']) L.text(id, '');
    const satir = [`Kingdom of ${ULUS_AD[d.ulus]}`];
    satir.push(k?.ad ? `The current King is ${k.ad}.` : 'There\'s no King at the moment.');
    if (s) satir.push(`${ASAMA[s.asama]} period in progress.`);
    else if (sc) satir.push(sc.asama === 'onay' ? 'Impeachment vote by senators currently in process.' : 'Impeachment vote currently in progress.');
    else satir.push('The election for a King starts on the 15th of every month.');
    if (d.son_secim?.kazanan && !s) satir.push(`Last election: ${d.son_secim.kazanan} (${(d.son_secim.sonuclar || []).map((x) => `${x.ad} ${x.oy}`).join(', ')})`);
    L.text('textmain_full', satir.join('\n'));
    L.get('textmain_full').style.whiteSpace = 'pre-line';
    L.text('textsub_ext', s ? 'Ends:' : sc ? 'Vote:' : 'Treasury:');
    L.text('textsub_half01', s ? tarih(s.bitis) : sc ? tarih(sc.bitis) : `${noah(k?.hazine)} Noah`);
    L.text('textsub_half02', d.senatorler?.length ? `Senators: ${d.senatorler.map((x) => x.ad).join(', ')}` : '');
    // düğmeler: duruma göre
    const dugme = [];
    if (s?.asama === 'aday') dugme.push([d.ilk10_lider ? (s.benim_gosterdigim ? 'Change nominee' : 'Nominate a King') : 'Nominate a King', () => adayGoster(d)]);
    if (s?.asama === 'kayit' || (s?.asama === 'oylama' && s.adayim === 'kayitli')) dugme.push([s.adayim === 'kayitli' ? 'Edit my plan' : 'Register as nominee', () => adayKayit(d)]);
    if (s?.asama === 'oylama') dugme.push([s.oy_verdim ? 'Voted' : 'Vote', () => oyPenceresi(d)]);
    if (s) dugme.push(['Nominee Board', () => adayListesi(d)]);
    if (sc) dugme.push([sc.asama === 'onay' ? 'Impeachment (senate)' : 'Impeachment vote', () => sucla(d)]);
    else if (d.senator && k?.id && !s) dugme.push(['Propose Impeachment (3,000 Noah)', () => sucla(d)]);
    if (!s) dugme.push(['About the kingdom', () => hakkinda()]);
    dugme.push(['Close', () => kapat('co_king_electionmain')]);
    for (let i = 0; i < 5; i++) {
      const b = dugme[i];
      L.show('btn0' + i, !!b); L.show('btnstr0' + i, !!b);
      if (b) {
        L.text('btnstr0' + i, b[0]); tikla(L, 'btn0' + i, b[1]);
        // yazı düğmenin tam üstünde, yatay + dikey ortalı; sığmazsa küçülür
        const t = L.get('btnstr0' + i), bt = L.get('btn0' + i);
        Object.assign(t.style, { pointerEvents: 'none', left: bt.style.left, top: bt.style.top, width: bt.style.width, height: bt.style.height, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '' });
        t.innerHTML = ''; const sp = document.createElement('span'); sp.textContent = b[0]; t.append(sp);
        requestAnimationFrame(() => { let f = 11; while (sp.offsetWidth > t.clientWidth - 10 && f > 8) t.style.fontSize = (--f) + 'px'; });
      }
    }
  }
  function hakkinda() {
    const { kutu } = pano('kral-metin');
    kutu.textContent = ([
      'Kingdom System',
      '• On the 15th of every month a separate election for a King starts for each nation (nomination → nominee registration → election, 24 hours each).',
      '• The leaders of the top 10 clans in the server ranking nominate a user of level 50 or above; a leader who does not nominate becomes a nominee himself.',
      '• Users of level 80 or above can vote; each account can vote only once.',
      '• The losing nominees become senators. A senator can propose an impeachment for 3,000 Noah; if all senators agree, a 2-day public impeachment vote (level 20+) is held.',
      '• The King: land tax 0-10%, royal events (EXP / drop rate), weather, announcements, rewards from the treasury. Users within 20 m of the King receive +3% HP/MP.',
      '• Tax: 20% goes to the King, 80% to the royal treasury (up to 2,100,000,000 Noah). The treasury can be viewed at the [Grand Chamberlain].',
    ].join('\n'));
  }
  // aday gösterme (co_king_memberrecommend)
  function adayGoster(d) {
    if (!d.ilk10_lider) return bilgi('You do not have the authority to nominate. Only the leaders of the top 10 clans in the server ranking can nominate a King.');
    const L = pencere('co_king_memberrecommend');
    L.text('text_main', `Enter the character ID of the user you want to nominate as King.\nThe nominee must be from ${ULUS_AD[d.ulus]} and at least level 50.`);
    L.get('text_main').style.whiteSpace = 'pre-line';
    for (const t of L.el.querySelectorAll('.kui-tx')) if (/Please confirm/i.test(t.textContent)) t.textContent = '- You can change your nominee until the nomination period ends.';
    const inp = L.input('edit_id', { maxLength: 21 }); inp.value = d.secim?.benim_gosterdigim || ''; setTimeout(() => inp.focus(), 50);
    const tamam = async () => {
      const ad = inp.value.trim(); if (!ad) return;
      const r = await rpc('kral_aday_goster', { p_ad: ad }); if (!r) return;
      kapat('co_king_memberrecommend'); bilgi(`${r.aday} has been successfully nominated.`, roben);
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') tamam(); });
    tikla(L, 'btn_ok', tamam); tikla(L, 'btn_cancel', () => kapat('co_king_memberrecommend'));
  }
  // aday kaydı + vaat (co_king_electionregist)
  async function adayKayit(d) {
    const s = d.secim; if (!s?.adayim) return bilgi('Not a nominee. Registration is for nominees only.');
    const L = pencere('co_king_electionregist');
    const kutu = L.get('edit_board'); kutu.textContent = '';
    const ta = document.createElement('textarea'); ta.className = 'kui-input kral-vaat'; ta.maxLength = 500; ta.placeholder = 'Write your election plan (up to 500 characters)…'; kutu.append(ta);
    const liste = await rpc('kral_adaylar', {}, true);
    ta.value = (liste?.adaylar || []).find((a) => Number(a.id) === me)?.vaat || '';
    const say = () => L.text('str_textsize', String(ta.value.length).padStart(3, '0'));
    ta.addEventListener('input', say); say(); setTimeout(() => ta.focus(), 50);
    tikla(L, 'btn_close', () => kapat('co_king_electionregist'));
    tikla(L, 'btn_ok', async () => {
      if (s.adayim !== 'kayitli') { const r = await rpc('kral_aday_kayit', { p_kabul: true }); if (!r) return; }
      const v = await rpc('kral_vaat_kaydet', { p_vaat: ta.value }); if (!v) return;
      kapat('co_king_electionregist'); bilgi(s.adayim === 'kayitli' ? 'Message Posted.' : 'You are now registered as a nominee for King. Good luck!', roben);
    });
  }
  // aday listesi (co_king_electionlist)
  async function adayListesi() {
    const r = await rpc('kral_adaylar'); if (!r) return;
    const L = pencere('co_king_electionlist');
    const A = r.adaylar || []; let secili = -1;
    const ciz = () => { for (let i = 0; i < 10; i++) {
      const a = A[i]; L.text('strid0' + i, a ? a.ad : ''); L.text('strclan0' + i, a?.klan || ''); L.get('strid0' + i)?.classList.toggle('kral-bekliyor', !!a && a.durum !== 'kayitli'); sigdir(L.get('strid0' + i)); sigdir(L.get('strclan0' + i));
      L.show('btn0' + i, !!a); const b = L.get('btn0' + i); if (b) b.classList.toggle('kral-secili', i === secili);
    } };
    for (let i = 0; i < 10; i++) tikla(L, 'btn0' + i, () => { secili = i; ciz(); });
    etiket(L.get('btn_agree'), r.asama === 'oylama' ? 'Vote' : 'Pledge');
    tikla(L, 'btn_agree', () => { const a = A[secili]; if (!a) return hud.notice?.('Select a nominee first.', 'hata'); if (r.asama === 'oylama') oyOnay(a); else vaatGoster(a); });
    tikla(L, 'btn_close', () => kapat('co_king_electionlist'));
    ciz();
  }
  function vaatGoster(a) {
    const { kutu } = pano('kral-metin');
    kutu.textContent = `${a.ad}${a.klan ? ' [' + a.klan + ']' : ''}\n\n${a.vaat || 'There\'s no plans posted.'}`;
  }
  // oylama (co_king_election_vote)
  async function oyPenceresi(d) {
    const r = await rpc('kral_adaylar'); if (!r) return;
    const L = pencere('co_king_election_vote');
    const A = r.adaylar || [];
    for (let i = 0; i < 10; i++) {
      const g = L.el.querySelector(`[data-id="grp_slate_${i}"]`); if (!g) continue;
      const a = A[i]; g.hidden = !a; if (!a) continue;
      g.querySelector('[data-id="str_num"]').textContent = String(a.no);
      g.querySelector('[data-id="str_name"]').textContent = a.ad; sigdir(g.querySelector('[data-id="str_name"]'));
      const bv = g.querySelector('[data-id="btn_vote"]'), bp = g.querySelector('[data-id="btn_pledge"]');
      for (const [b, fn] of [[bv, () => (d.secim?.oy_verdim ? bilgi('You\'ve already voted.') : oyOnay(a))], [bp, () => vaatGoster(a)]]) { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); fn(); }; }
    }
    for (const b of L.all('btn_close')) { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); kapat('co_king_election_vote'); }; }
  }
  function oyOnay(a) {
    evetHayir(`Will you vote for ${a.ad}?\n(You can only vote once per account)`, async () => {
      const r = await rpc('kral_oy_ver', { p_aday: a.id }); if (!r) return;
      kapat('co_king_election_vote'); kapat('co_king_electionlist'); bilgi(`You've voted for ${r.aday}.`, roben);
    });
  }
  // görevden alma (co_msgboxokcancel_king: Evet / Hayır / İptal)
  function sucla(d) {
    const sc = d.sucla;
    if (!sc) return evetHayir(`Will you propose an impeachment of King ${d.kral?.ad}?\nIt costs 3,000 Noah. If all senators agree, a 2-day public vote begins.`, async () => {
      const r = await rpc('kral_sucla_oner'); if (!r) return; state.combat?.applyStats?.({ gold: r.gold }); state.inv?.stats?.(); bilgi('Impeachment proposed.', roben);
    });
    const L = pencere('co_msgboxokcancel_king', 'kral-sucla');
    const senato = sc.asama === 'onay';
    L.text('text_msg', senato ? (d.senator ? (sc.onayladim ? 'You voted in favor of impeachment. Waiting for the other senators.' : `Senator ${sc.senator} has proposed an impeachment of the King. Do you agree?`) : 'Impeachment vote by senators currently in process.')
      : (sc.oy_verdim ? `You've already voted on the impeachment.\nEnds: ${tarih(sc.bitis)}` : `Should King ${d.kral?.ad} be impeached?\n(Level 20+, one vote per account — ends ${tarih(sc.bitis)})`));
    L.get('text_msg').style.whiteSpace = 'pre-line';
    L.text('text_ok', 'In favor'); L.text('text_opposite', 'Against');
    const oyla = async (evet) => {
      const r = senato ? await rpc('kral_sucla_onay', { p_kabul: evet }) : await rpc('kral_sucla_oy', { p_evet: evet }); if (!r) return;
      kapat('co_msgboxokcancel_king'); bilgi(senato ? (r.asama === 'oylama' ? 'All senators agreed: the public impeachment vote has begun.' : r.asama === 'red' ? 'The impeachment was rejected.' : 'Voted in favor of impeachment.') : 'Vote complete.', roben);
    };
    const pasif = senato ? (!d.senator || sc.onayladim) : sc.oy_verdim;
    L.show('btn_ok', !pasif); L.show('btn_opposition', !pasif); L.show('text_ok', !pasif); L.show('text_opposite', !pasif);
    tikla(L, 'btn_ok', () => oyla(true)); tikla(L, 'btn_opposition', () => oyla(false)); tikla(L, 'btn_cancel', () => kapat('co_msgboxokcancel_king'));
  }

  // ---------------- Krallık hazinesi penceresi (co_king_electionboard çerçevesi; KO Noah simgesi re_inventory btn_gold)
  async function hazinePencere() {
    if (!(await hazirAl())) { hud.notice?.('Could not load the kingdom interface. Please try again in a moment.', 'hata'); return; }
    const d = await rpc('kral_bilgi'); if (!d) return;
    const k = d.kral, ENCOK = 2100000000, oran = Math.min(1, Number(k.hazine || 0) / ENCOK);
    const { L, kutu } = pano('kral-hazine');
    const HAVA = { acik: 'Clear', yagmur: 'Rain', kar: 'Snow' };
    const satir = (ad, deger, cls = '') => `<div class="kh-satir ${cls}"><span>${ad}</span><b>${deger}</b></div>`;
    kutu.innerHTML = `<div class="kh-baslik">◆ ${ULUS_AD[d.ulus]} Royal Treasury ◆</div>
      <div class="kh-noah"><i class="kh-ikon"></i><b>${noah(k.hazine)}</b><span>Noah</span></div>
      <div class="kh-cubuk"><i style="width:${(oran * 100).toFixed(1)}%"></i><span>${(oran * 100).toFixed(1)}% · Limit ${noah(ENCOK)}</span></div>
      ${satir('King', k.ad ? esc(k.ad) : 'None')}
      ${satir('Land Tax', `${Number(k.vergi || 0)}% <small>(20% King · 80% treasury)</small>`, 'kh-sari')}
      ${d.kralim ? satir('Royal Tax', noah(k.kral_payi) + ' Noah', 'kh-sari') : ''}
      ${satir('Event', [k.exp ? `EXP +${k.exp.oran}%` : '', k.drop ? `Drop +${k.drop.oran}%` : ''].filter(Boolean).join(' · ') || 'None', k.exp || k.drop ? 'kh-yesil' : '')}
      ${satir('Weather', HAVA[k.hava] || 'Clear')}`;
    const ik = kutu.querySelector('.kh-ikon'); const sp = findSprite('re_inventory', 'btn_gold'); if (sp != null) paintSprite(ik, sp, 20, 22); else ik.classList.add('kh-ikon-yedek');
    void L;
  }
  // kral duyuru panosu: sunucu seçim ekranındaki kral panelinde görünen yazı (günde 1 kez değiştirilebilir, en fazla 300 karakter)
  async function duyuruPanosu() {
    if (!(await hazirAl())) { hud.notice?.('Could not load the kingdom interface. Please try again in a moment.', 'hata'); return; }
    const d = await rpc('kral_bilgi'); if (!d) return;
    if (!d.kralim) return bilgi('Only kings are eligible.');
    const L = pencere('co_king_electionregist', 'kral-duyurupano');
    const kutu = L.get('edit_board'); kutu.textContent = '';
    const ta = document.createElement('textarea'); ta.className = 'kui-input kral-vaat'; ta.maxLength = 300;
    ta.placeholder = 'Write the announcement shown on the King panel of the server selection screen…'; ta.value = d.pano || ''; kutu.append(ta);
    L.el.querySelectorAll('.kui-tx').forEach((t) => { if (/^\/ 500$/.test(t.textContent.trim())) t.textContent = '/ 300'; });
    const say = () => L.text('str_textsize', String(ta.value.length).padStart(3, '0')); ta.addEventListener('input', say); say();
    if (!d.pano_hazir) { ta.readOnly = true; L.show('btn_ok', false); }
    etiket(L.get('btn_ok'), 'Post'); etiket(L.get('btn_close'), 'Close');
    tikla(L, 'btn_close', () => kapat('co_king_electionregist'));
    tikla(L, 'btn_ok', () => evetHayir('The announcement board can be changed only once a day.\nDo you want to post it?', async () => {
      const r = await rpc('kral_pano_yaz', { p_metin: ta.value }); if (!r) return;
      kapat('co_king_electionregist'); bilgi('Message Posted. It will appear on the server selection screen.');
    }));
    if (d.pano_hazir) setTimeout(() => ta.focus(), 50);
    else hud.info?.('You have already changed the notice board today; you can change it again tomorrow.', 'hata');
  }
  // kraliyet komutları penceresi (aynı KO çerçevesi)
  async function komutPencere() {
    if (!(await hazirAl())) { hud.notice?.('Could not load the kingdom interface. Please try again in a moment.', 'hata'); return; }
    const { L, kutu } = pano('kral-hazine kral-komut');
    const K = [['/RoyalOrder <message>', 'Royal announcement to the whole server'], ['/Price <name> <amount>', 'Noah reward from the treasury to a user'],
      ['/EXPERIENCE_POINT 10|30|50', '30 min EXP (300M / 900M / 1.5B)'], ['/DROP_RATE 1|2|3', '30 min drop rate (50M / 100M / 150M)'],
      ['/RAIN · /SNOW', 'Rain · snow (once a day, 100,000)'], ['/CLEAR', 'Clears the weather'],
      ['/JOIN_SENTINEL <name>', 'Appoints a royal sentinel'], ['/QUIT_SENTINEL <name>', 'Dismisses a sentinel']];
    kutu.innerHTML = `<div class="kh-baslik">◆ Commands for King ◆</div>` + K.map(([k, a]) => `<div class="kh-satir kk-satir"><b>${esc(k)}</b><span>${esc(a)}</span></div>`).join('')
      + `<div class="kh-not">An event can be started once a day; fees are paid from the royal treasury.</div>`;
    void L;
  }
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------- [Grand Chamberlain] Laisa / Rina — hazine, vergi, kral payı (KO NPC menüsü)
  // pencere açan menü satırları: NPC menüsü kapanır, pencere öne gelir; hata olursa bildirilir (sessizce kalmasın)
  const guvenli = (fn) => Promise.resolve().then(fn).catch((e) => { console.warn('kral pencere', e); hud.notice?.('The window could not be opened: ' + (e?.message || e), 'hata'); });
  async function lisa(npc) {
    const { npcMenuAc, npcMenuMetin } = await import('./npc-menu.js');
    const ana = async (ek = '') => {
      const d = await rpc('kral_bilgi'); if (!d) return;
      const k = d.kral;
      // KO: krallık hazinesi NPC'sini yalnız kral kullanabilir
      // KO: kral olmayan oyuncular yalnız hazineyi görebilir
      if (!d.kralim) return npcMenuAc({ ad: npc.ad, model: npc.model, metin: ek || `${k.ad ? `I manage the royal treasury on behalf of ${k.ad}, King of ${ULUS_AD[d.ulus]}.` : 'There\'s no King at the moment.'} 20% of the collected tax goes to the King and 80% to the royal treasury.`,
        secenekler: [{ ad: 'I want to see the royal treasury.', fn: () => guvenli(hazinePencere) }, { ad: 'Leave.', fn: () => {} }] });
      const sec = [{ ad: 'I want to see the royal treasury.', fn: () => guvenli(hazinePencere) }];
      if (d.kralim) {
        sec.push({ ad: `I want to collect the royal tax. (${noah(k.kral_payi)} Noah)`, kalsin: true, fn: async () => { const r = await rpc('kral_pay_al'); if (!r) return; state.combat?.applyStats?.({ gold: r.gold }); state.inv?.stats?.(); hud.info?.(`${noah(r.miktar)} Coins of tax were collected.`, 'tamam'); ana(`${noah(r.miktar)} Coins of tax were collected.`); } });
        sec.push({ ad: `I want to adjust the tax rate. (currently ${k.vergi}%)`, kalsin: true, fn: () => vergiMenu(k.vergi) });
        sec.push({ ad: 'Commands for King', fn: () => guvenli(komutPencere) });
        sec.push({ ad: 'Announcement board', fn: () => guvenli(duyuruPanosu) });
        sec.push({ ad: 'I want to abdicate the throne.', html: '<span class="npm-kirmizi">I want to abdicate the throne.</span>', kalsin: true, fn: () => evetHayir('Are you sure you want to abdicate the throne?\nA new election for a King will begin.', async () => { const r = await rpc('kral_ayril'); if (r) { ana('You have abdicated the throne. A new election has begun.'); durumYukle(); } }) });
      }
      sec.push({ ad: 'Leave.', fn: () => {} });
      npcMenuAc({ ad: npc.ad, model: npc.model, secenekler: sec, metin: ek || `${k.ad ? `I manage the royal treasury on behalf of ${k.ad}, King of ${ULUS_AD[d.ulus]}.` : 'There\'s no King at the moment.'} 20% of the collected tax goes to the King and 80% to the royal treasury.` });
    };
    const vergiMenu = (su) => {
      const sec = [];
      for (let o = 0; o <= 10; o++) sec.push({ ad: `${o}%${o === su ? ' (current)' : ''}`, kalsin: true, fn: async () => { const r = await rpc('kral_vergi_ayarla', { p_oran: o }); if (r) ana(`The tax rate has been changed to ${o}%.`); } });
      sec.push({ ad: 'Back', kalsin: true, fn: () => ana() });
      npcMenuAc({ ad: npc.ad, model: npc.model, secenekler: sec, metin: 'You can adjust the tax rate. The land tax is added to NPC purchases in Moradon and in our nation\'s castle (0% – 10%).' });
    };
    void npcMenuMetin;
    ana();
  }

  // ---------------- sohbet komutları (kral + GM)
  async function komut(v) {
    const m = /^\/(\S+)\s*(.*)$/.exec(v.trim()); if (!m) return false;
    const k = m[1].toUpperCase(), arg = m[2].trim();
    const yap = async (fn, a, tamam) => { const r = await rpc(fn, a); if (r && tamam) addLine(null, typeof tamam === 'function' ? tamam(r) : tamam, 0, 'tamam'); return r; };
    switch (k) {
      case 'ROYALORDER': await yap('kral_emir', { p_metin: arg }); return true;
      case 'PRICE': { const a = /^(\S+)\s+(\d+)$/.exec(arg); if (!a) { addLine(null, 'Usage: /Price <character name> <amount>', 0, 'hata'); return true; }
        await yap('kral_ver', { p_ad: a[1], p_miktar: Number(a[2]) }, (r) => `${noah(r.miktar)} Noah from the treasury was given to ${r.hedef} (treasury: ${noah(r.hazine)}).`); return true; }
      case 'EXPERIENCE_POINT': await yap('kral_etkinlik', { p_tur: 'exp', p_oran: Number(arg) || 10 }); return true;
      case 'DROP_RATE': await yap('kral_etkinlik', { p_tur: 'drop', p_oran: Number(arg) || 1 }); return true;
      case 'JOIN_SENTINEL': await yap('kral_nobetci', { p_ad: arg, p_ekle: true }, (r) => `${r.hedef} has become a Royal Sentinel.`); return true;
      case 'QUIT_SENTINEL': await yap('kral_nobetci', { p_ad: arg, p_ekle: false }, (r) => `${r.hedef} has been removed from the Royal Sentinels.`); return true;
      case 'RAIN': await yap('kral_hava', { p_tur: 'yagmur' }, 'It is now raining.'); return true;
      case 'SNOW': await yap('kral_hava', { p_tur: 'kar' }, 'It is now snowing.'); return true;
      case 'CLEAR': await yap('kral_hava', { p_tur: 'acik' }, 'The weather has cleared.'); return true;
      case 'KRAL': case 'KING': {   // GM: /kral baslat|ilerle|iptal|sucla_bitir|kaldir [1|2] · /kral ata <isim> · /kral hazine <miktar> [1|2]
        const p = arg.split(/\s+/); const islem = (p[0] || '').toLowerCase();
        const ulus = Number(p.find((x, i) => i > 0 && /^[12]$/.test(x))) || null;
        const ad = islem === 'ata' ? p[1] : islem === 'hazine' ? p[1] : null;
        if (!islem) { addLine(null, 'GM: /kral baslat | ilerle | iptal | sucla_bitir | kaldir [1|2] · /kral ata <isim> · /kral hazine <miktar> [1|2]', 0, 'sistem'); return true; }
        const r = await rpc('gm_kral', { p_islem: islem, p_ulus: ulus, p_ad: ad }); if (r) addLine(null, 'Kingdom (GM): ' + JSON.stringify(r), 0, 'tamam');
        durumYukle(); return true;
      }
    }
    return false;
  }

  // ---------------- duyurular (kral_duyuru realtime)
  // KO: krallık ve kraliyet duyuruları iki ulusa da, GM duyurusuyla aynı üst duyuru şeridinden (hud.ticker) geçer + sohbette satır
  function duyuru(r) {
    const metin = r.tur === 'emir' ? `${ULUS_AD[r.ulus] || ''} Kralı ${r.ad || ''}: ${r.metin}` : r.metin;
    if (hud.ticker) hud.ticker(metin, { onek: '', renk: '#e563b8' }); else hud.banner?.(metin, 'duyuru');   // KO kraliyet duyurusu: pembe, "[DUYURU]" öneki yok
    addLine(null, metin, 0, 'kral');
    if (r.tur === 'odul' && r.metin.includes(` ${character.name} `)) state.inv?.stats?.();
  }
  const kanal = sb.channel('kral-duyuru')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kral_duyuru' }, ({ new: r }) => { try { duyuru(r); } catch (e) { console.warn('kral duyuru', e); } })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kral' }, () => durumYukle())
    .subscribe();
  void kanal;

  // ---------------- kraliyet durumu: hava, aura
  async function durumYukle() {
    const { data } = await sb.rpc('kral_durum'); if (!data) return;
    DURUM = data; etiketle(); havaUygula();
    dispatchEvent(new CustomEvent('ko-kral-degisti', { detail: data }));
  }
  const kralIdleri = () => new Set(Object.values(DURUM).map((x) => Number(x?.id)).filter(Boolean));
  function etiketle() {
    const K = kralIdleri();
    const el = (id) => (Number(id) === me ? state.nameSp?.userData?.el : state.remotes?.get(String(id))?.obj?.userData?.nameTag?.userData?.el);
    const tum = [me, ...[...(state.remotes?.keys() || [])].map(Number)];
    for (const id of tum) {
      const e = el(id); if (!e) continue;
      const hedef = e.querySelector('.ad') || e, var_ = hedef.querySelector(':scope > .kral-tac');
      if (var_) var_.remove();   // isim başındaki taç kaldırıldı (eski sürümden kalmışsa silinir)
      void K;
    }
  }
  setInterval(etiketle, 2000);

  // hava: kralın ulusunun kalesinde ve Moradon'da (oyuncunun kendi ulus kralının havası)
  let hava = null, havaTur = 'acik';
  function havaUygula() {
    const zone = String(character.zone || '');
    const u = Number(character.nation), x = DURUM[String(u)];
    const tur = x && (zone === KALE[u] || zone.startsWith('moradon')) ? x.hava || 'acik' : 'acik';
    if (state) state.kralHava = tur;   // doğal hava (hava.js) kral havası varken durur
    if (tur === havaTur) return; havaTur = tur;
    if (hava) { scene?.remove(hava.obj); hava.obj.geometry.dispose(); hava.obj.material.dispose(); hava = null; }
    if (tur === 'acik' || !scene) return;
    const kar = tur === 'kar', N = kar ? 2600 : 4200, R = 42, H = 30;
    const g = new THREE.BufferGeometry(), p = new Float32Array(N * 3), hz = new Float32Array(N);
    for (let i = 0; i < N; i++) { p[i * 3] = (Math.random() - 0.5) * R * 2; p[i * 3 + 1] = Math.random() * H; p[i * 3 + 2] = (Math.random() - 0.5) * R * 2; hz[i] = kar ? 1.2 + Math.random() * 1.2 : 18 + Math.random() * 8; }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d');
    if (kar) { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 14); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); }
    else { c.strokeStyle = 'rgba(200,215,235,0.85)'; c.lineWidth = 2; c.beginPath(); c.moveTo(16, 0); c.lineTo(16, 32); c.stroke(); }
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.PointsMaterial({ map: tex, size: kar ? 0.35 : 0.5, transparent: true, depthWrite: false, opacity: kar ? 0.95 : 0.6, sizeAttenuation: true, fog: true });
    const obj = new THREE.Points(g, mat); obj.frustumCulled = false; obj.renderOrder = 5; scene.add(obj);
    hava = { obj, hz, kar, t: performance.now() };
  }
  (function havaKare() {
    requestAnimationFrame(havaKare);
    if (!hava) return;
    const now = performance.now(), dt = Math.min(0.1, (now - hava.t) / 1000); hava.t = now;
    const c = player?.position || camera?.position; if (!c) return;
    hava.obj.position.set(c.x, (c.y || 0) - 2, c.z);
    const a = hava.obj.geometry.attributes.position, p = a.array;
    for (let i = 0; i < hava.hz.length; i++) {
      p[i * 3 + 1] -= hava.hz[i] * dt;
      if (hava.kar) { p[i * 3] += Math.sin(now / 900 + i) * 0.3 * dt; }
      if (p[i * 3 + 1] < 0) p[i * 3 + 1] += 30;
    }
    a.needsUpdate = true;
  })();

  // aura: krala 20 m içinde → sunucu max HP/MP'yi +%3 hesaplar
  let auraVar = null;
  setInterval(async () => {
    const x = DURUM[String(character.nation)], kid = Number(x?.id); let yakin = false;
    if (kid) {
      if (kid === me) yakin = true;
      else { const r = state.remotes?.get(String(kid)); if (r?.obj && player) yakin = Math.hypot(r.obj.position.x - player.position.x, r.obj.position.z - player.position.z) <= 20; }
    }
    if (yakin === auraVar) return; auraVar = yakin;
    const d = await rpc('kral_aura_yenile', {}, true); if (!d) return;
    state.combat?.applyStats?.({ hp: d.hp, mp: d.mp, max_hp: d.max_hp, max_mp: d.max_mp });
    if (d.aura && yakin && kid !== me) hud.info?.('You are near the King: max HP and MP increased by 3%.', 'tamam');
  }, 3000);

  durumYukle();
  return { roben, lisa, hazine: hazinePencere, komutlar: komutPencere, duyuru: duyuruPanosu, komut, durumYukle, get durum() { return DURUM; } };
}
