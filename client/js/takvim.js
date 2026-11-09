// KO (KnightOnlineEn) sağ üst simgeler ve etkinlik takvimi:
//  • re_requesthelpbutton: yeşil "?" (btn_quest → Seed'in Mission sekmesi) + küçük onay kutusu (btn_visible → Quest tips aç / kapa)
//  • re_schedulerbutton: kum saati (btn_normal). Üzerine gelince bugünün etkinlik saatleri (group_list, 9 satır, kaydırılır);
//    tıklayınca co_scheduler "Schedule" penceresi: All Schedules (gün ◀▶, liste, resim + açıklama) · Register Schedule (kişisel takvim)
//    · Settings (bildirim aç / kapa, 3 / 5 / 10 dk önce, ses).
// Veri: Data\scheduler_us.tbl → assets/gorev/takvim.json [id, ad, saat, dakika, resim, açıklama, gün]. Saatler UTC; yerel saate çevrilir
// (KO istemcisi de bilgisayarın saat dilimiyle gösterir). Resimler ui\scheduler_*.dxt → assets/ui/sched/img/*.webp.
import { ekUI, hasLayout, buildLayout, draggable } from './kui.js';

const GUN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const iki = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RESIMLER = new Set(['scheduler_default', 'scheduler_losttemple', 'scheduler_indun', 'scheduler_runa', 'scheduler_gangwar', 'scheduler_biforst', 'scheduler_event', 'scheduler_underthecastle', 'scheduler_krowaz', 'scheduler_pathos']);
const oku = (k, v) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? v; } catch { return v; } };
const yaz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export async function initTakvim({ hud, state, character, sb }) {
  if (!(await ekUI('sched').catch(() => false)) || !hasLayout('re_schedulerbutton')) return null;
  const VERI = await fetch('./assets/gorev/takvim.json').then((r) => r.json()).catch(() => []);
  const KEY = 'ko-takvim-' + (character?.id || 0);
  let AYAR = { savas: true, kisisel: true, ses: true, once: 3, kapali: [], ...oku(KEY + '-ayar', {}) };
  let KISI = oku(KEY + '-kisisel', []);   // [{gun (yerel 0=Paz), s, d, ad, metin, on}]

  // ---- bir yerel günün etkinlikleri (UTC haftası → yerel)
  function gunListe(gun, { kisisel = AYAR.kisisel, savas = AYAR.savas } = {}) {
    const off = -new Date().getTimezoneOffset(), out = [];
    if (savas) for (const r of VERI) {
      const ud = GUN.indexOf(r[6]); if (ud < 0) continue;
      const m = ((ud * 1440 + r[2] * 60 + r[3] + off) % 10080 + 10080) % 10080;
      if (Math.floor(m / 1440) === gun) out.push({ id: r[0], dk: m % 1440, ad: r[1], resim: r[4], metin: r[5] });
    }
    if (kisisel) KISI.forEach((k, i) => { if (k.gun === gun) out.push({ kisi: i, dk: k.s * 60 + k.d, ad: k.ad || '-', metin: k.metin || '', resim: 'scheduler_default', on: k.on !== false }); });
    return out.sort((a, b) => a.dk - b.dk || (a.id || 0) - (b.id || 0));
  }
  const saat = (dk) => `${iki(Math.floor(dk / 60))}:${iki(dk % 60)}`;
  const satirHtml = (e) => `<span class="tk-saat">${saat(e.dk)}</span><span class="tk-ad">${esc(e.ad)}</span>`;

  // ---- sağ üst: "?" + kum saati
  const kap = document.createElement('div'); kap.className = 'ko-ust-simge';
  kap.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.append(kap);
  let R = null;
  if (hasLayout('re_requesthelpbutton')) {
    R = buildLayout('re_requesthelpbutton', { className: 'tk-yardim' }); kap.append(R.el);
    for (const id of ['img_cooltime_quest', 'img_cooltime_newquest', 'img_cooltime_request', 'btn_request', 'btn_newquest']) R.show(id, false);
    R.click('btn_quest', () => soruAc());
    R.get('btn_quest').title = 'Request a question'; R.get('btn_visible').title = 'Show / hide the question button';
    // KO: sağ alttaki onay kutusu yalnız "?" düğmesini gösterir / gizler (işaretli = görünür)
    R.click('btn_visible', () => { AYAR.soruGizli = !AYAR.soruGizli; yaz(KEY + '-ayar', AYAR); kutuCiz(); });
  }
  const kutuCiz = () => { if (!R) return; R.show('btn_quest', !AYAR.soruGizli); R.get('btn_visible')?.classList.toggle('secili', !AYAR.soruGizli); };
  kutuCiz();

  // ---- "?" → KO re_requesthelp (base_Quest): soru yaz (128 bayt) → GM panelindeki destek taleplerine düşer; 3 dakikada bir
  const bayt = (t) => new TextEncoder().encode(t).length;
  let SQ = null;
  function soruKur() {
    SQ = buildLayout('re_requesthelp', { className: 'ko-soru ko-pencere kui-dokulu' });
    (document.getElementById('kohud') || document.body).append(SQ.el); draggable(SQ, 40);
    SQ.el.addEventListener('pointerdown', (e) => e.stopPropagation()); SQ.el.addEventListener('keydown', (e) => e.stopPropagation());
    const q = (grp, id) => SQ.get(grp)?.querySelector(`[data-id="${id}"]`);
    SQ._q = q;
    const ed = q('base_Quest', 'edit_text');
    if (ed) { ed.querySelectorAll('.kui-tx').forEach((t) => (t.textContent = '')); const ta = document.createElement('textarea'); ta.className = 'kui-input sq-metin'; ta.spellcheck = false; ed.append(ta); SQ._ta = ta;
      ta.addEventListener('input', () => { while (bayt(ta.value) > 128) ta.value = ta.value.slice(0, -1); soruSay(); });
      ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') soruKapat(); }); }
    const ok = q('base_Quest', 'btn_ok'), ex = q('base_Quest', 'btn_exit');
    if (ok) { ok.classList.add('kui-tik'); ok.onclick = (e) => { e.stopPropagation(); soruGonder(); }; }
    if (ex) { ex.classList.add('kui-tik'); ex.onclick = (e) => { e.stopPropagation(); soruKapat(); }; }
    // cevap görünümü (base_Request): başlık = cevaplayan GM, metin = soru + cevap, sayfa ◀ 1 ▶, Whisper / OK / Exit
    for (const id of ['btn_ok', 'btn_exit', 'btn_cancle']) { const b = q('base_Request', id); if (b) { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); cevapSonraki(); }; } }
    const fs = q('base_Request', 'btn_whisper'); if (fs) { fs.classList.add('kui-tik'); fs.onclick = (e) => { e.stopPropagation(); const c = CEVAP[cSira]; if (c?.cevaplayan) state.pm?.adIle?.(c.cevaplayan, ''); }; }
    for (const [id, d] of [['btn_prev', -1], ['btn_next', 1]]) { const b = q('base_Request', id); if (b) { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); cSira = Math.max(0, Math.min(CEVAP.length - 1, cSira + d)); cevapCiz(); }; } }
    SQ.show('base_RequestEdit', false);
  }
  function soruSay() {
    const t = SQ._ta?.value || '', q = SQ._q;
    const sz = q('base_Quest', 'str_textsize'); if (sz) sz.textContent = `${bayt(t)}/128 byte`;
    const w = q('base_Quest', 'str_warning'); if (w) w.hidden = !!t;
  }
  function soruAc() {
    if (!sb) return hud.notice?.('You must be logged in to ask a question.', 'hata');
    SQ ||= (soruKur(), SQ);
    SQ.show('base_Quest', true); SQ.show('base_Request', false);
    const id = SQ._q('base_Quest', 'str_id'); if (id) id.textContent = character?.name || '';
    if (SQ._ta) SQ._ta.value = ''; soruSay();
    SQ.el.hidden = false; SQ.el.style.zIndex = 4300;
    if (!SQ.el.dataset.yer) { SQ.el.dataset.yer = 1; SQ.el.style.left = Math.max(10, (innerWidth - 289) / 2) + 'px'; SQ.el.style.top = Math.max(10, (innerHeight - 256) / 2 - 60) + 'px'; }
    setTimeout(() => SQ._ta?.focus(), 30);
  }
  const soruKapat = () => { if (SQ) SQ.el.hidden = true; };
  let gonderiyor = false;
  async function soruGonder() {
    const m = (SQ._ta?.value || '').trim(); if (!m) return hud.notice?.('Please enter your question.', 'hata');
    if (gonderiyor) return; gonderiyor = true;
    try {
      const { data, error } = await sb.rpc('destek_gonder', { p_char: character.id, p_metin: m });
      if (error) return hud.notice?.(error.message, 'hata');
      if (!data?.ok) return hud.notice?.(data?.reason || 'Your question could not be sent.', 'hata');
      hud.info?.('Your question has been sent to the GMs. Please wait for an answer.', 'gorev'); soruKapat();
    } finally { gonderiyor = false; }
  }
  // GM cevapları: periyodik kontrol, gelince base_Request görünümünde gösterilir
  let CEVAP = [], cSira = 0;
  function cevapCiz() {
    const c = CEVAP[cSira]; if (!c) return soruKapat();
    SQ ||= (soruKur(), SQ);
    SQ.show('base_Quest', false); SQ.show('base_Request', true);
    const q = SQ._q;
    const id = q('base_Request', 'str_id'); if (id) id.textContent = c.cevaplayan || 'GM';
    const tx = q('base_Request', 'str_text'); if (tx) { tx.classList.add('sq-cevap'); tx.textContent = `Q. ${c.metin}\n\nA. ${c.cevap}`; tx.scrollTop = 0; }
    const pg = q('base_Request', 'str_page'); if (pg) pg.textContent = String(cSira + 1);
    for (const b of ['btn_prev', 'btn_next', 'str_page']) { const e = q('base_Request', b); if (e) e.hidden = CEVAP.length < 2; }
    SQ.el.hidden = false; SQ.el.style.zIndex = 4300;
    if (!SQ.el.dataset.yer) { SQ.el.dataset.yer = 1; SQ.el.style.left = Math.max(10, (innerWidth - 289) / 2) + 'px'; SQ.el.style.top = Math.max(10, (innerHeight - 270) / 2 - 60) + 'px'; }
  }
  function cevapSonraki() { CEVAP.splice(cSira, 1); cSira = Math.min(cSira, CEVAP.length - 1); if (CEVAP.length) cevapCiz(); else soruKapat(); }
  async function cevapKontrol() {
    if (!sb || !character?.id) return;
    const { data } = await Promise.resolve(sb.rpc('destek_cevaplar', { p_char: character.id })).catch(() => ({}));
    if (Array.isArray(data) && data.length) { CEVAP.push(...data); hud.notice?.(`${data[0].cevaplayan || 'GM'} has answered your question.`, 'gorev'); cevapCiz(); }
  }
  setTimeout(cevapKontrol, 8000); setInterval(cevapKontrol, 45000);

  const B = buildLayout('re_schedulerbutton', { className: 'tk-kum' }); kap.append(B.el);
  B.show('group_img', false); B.show('group_list', false);
  const kum = B.get('btn_normal'); kum.title = '';
  let lUst = 0, lListe = [], gizleT = 0;
  const liste = B.get('group_list');
  function listeCiz() {
    const n = lListe.length; lUst = Math.max(0, Math.min(lUst, n - 9));
    for (let i = 0; i < 9; i++) { const e = lListe[lUst + i], t = B.get('str_title_' + i); if (t) t.innerHTML = e ? satirHtml(e) : ''; }
    kaydirCiz(liste.querySelector('[data-id="scroll_schedule"]'), n > 9 ? lUst / (n - 9) : 0);
  }
  function listeAc() { clearTimeout(gizleT); lListe = gunListe(new Date().getDay()).filter((e) => e.on !== false); const simdi = new Date().getHours() * 60 + new Date().getMinutes(); const i = lListe.findIndex((e) => e.dk >= simdi); lUst = i < 0 ? 0 : Math.max(0, i - 2); listeCiz(); liste.hidden = false; }
  const listeKapa = () => { clearTimeout(gizleT); gizleT = setTimeout(() => { liste.hidden = true; }, 180); };
  kum.addEventListener('pointerenter', listeAc); kum.addEventListener('pointerleave', listeKapa);
  liste.addEventListener('pointerenter', () => clearTimeout(gizleT)); liste.addEventListener('pointerleave', listeKapa);
  liste.addEventListener('wheel', (e) => { e.preventDefault(); lUst += e.deltaY > 0 ? 1 : -1; listeCiz(); }, { passive: false });
  kaydirBagla(liste.querySelector('[data-id="scroll_schedule"]'), (d) => { lUst += d; listeCiz(); });
  B.click('btn_normal', () => { liste.hidden = true; toggle(); });

  // ---- kaydırma çubuğu yardımcıları (KO sc: [▲, ▼, tr]) — ▲ ilk, ▼ ikinci düğme
  function kaydirBagla(sc, f) {
    if (!sc) return;
    const d = [...sc.querySelectorAll(':scope > .kui-btn')];
    d.forEach((b, i) => { b.classList.add('kui-tik'); b.style.pointerEvents = 'auto'; b.onclick = (e) => { e.stopPropagation(); f(i === 0 ? -1 : 1); }; });
  }
  function kaydirCiz(sc, oran) {
    const tr = sc?.querySelector(':scope > .kui-tr, :scope > [class*="kui-tr"]') || [...(sc?.children || [])].find((e) => !e.classList.contains('kui-btn'));
    const th = tr?.children?.[1]; if (!th) return;
    const H = (parseFloat(tr.style.height) || tr.offsetHeight) - (parseFloat(th.style.height) || th.offsetHeight); th.style.top = Math.round(Math.max(0, Math.min(1, oran)) * H) + 'px';
  }

  // ---- Schedule penceresi
  let W = null, sekme = 'btn_main_schedule', gun = new Date().getDay(), wUst = 0, wSec = 0, wListe = [];
  const g = (grp, id) => W.get(grp)?.querySelector(`[data-id="${id}"]`);
  function kur() {
    W = buildLayout('co_scheduler', { className: 'ko-takvim ko-pencere kui-dokulu' });
    (document.getElementById('kohud') || document.body).append(W.el); draggable(W, 44);
    W.el.addEventListener('pointerdown', (e) => e.stopPropagation()); W.el.addEventListener('keydown', (e) => e.stopPropagation());
    W.click('btn_close', kapat);
    for (const b of ['btn_main_schedule', 'btn_reg_schedule', 'btn_option_schedule']) W.click(b, () => sekmeSec(b));
    // All Schedules
    const M = 'group_main_schedule';
    const gs = (grp) => W.get(grp)?.querySelector('[data-id="group_day_select"]');
    for (const grp of [M, 'group_reg_schedule']) {
      const ds = gs(grp); if (!ds) continue;
      for (const [id, d] of [['btn_prev', -1], ['btn_next', 1]]) { const b = ds.querySelector(`[data-id="${id}"]`); if (b) { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); gun = (gun + d + 7) % 7; wUst = 0; wSec = 0; ciz(); }; } }
    }
    const ml = W.get(M).querySelector('[data-id="group_schedule_list"]');
    for (let i = 0; i < 9; i++) { const r = ml.querySelector(`[data-id="group_schedule_contents_${i}"]`); if (r) { r.style.pointerEvents = 'auto'; r.style.cursor = 'pointer'; r.onclick = (e) => { e.stopPropagation(); wSec = wUst + i; anaCiz(); }; } }
    ml.addEventListener('wheel', (e) => { e.preventDefault(); wUst += e.deltaY > 0 ? 1 : -1; anaCiz(); }, { passive: false });
    kaydirBagla(ml.querySelector('[data-id="scroll_contents_title"]'), (d) => { wUst += d; anaCiz(); });
    const ac = W.get(M).querySelector('[data-id="str_explain"]'); if (ac) ac.classList.add('tk-aciklama');
    // açıklama kaydırma çubuğu (sağ alt): ▲▼ satır satır, tekerlek, başparmağı sürükleme / iz çubuğuna tıklama; başparmak metnin konumunu izler
    const se = W.get(M).querySelector('[data-id="scroll_explain"]');
    if (ac && se) {
      const ciz2 = () => { const m = ac.scrollHeight - ac.clientHeight; kaydirCiz(se, m > 0 ? ac.scrollTop / m : 0); };
      kaydirBagla(se, (d) => { ac.scrollTop += d * 16; ciz2(); });
      ac.addEventListener('scroll', ciz2);
      se.style.pointerEvents = 'auto';
      se.addEventListener('wheel', (e) => { e.preventDefault(); ac.scrollTop += e.deltaY > 0 ? 16 : -16; ciz2(); }, { passive: false });
      const tr = [...se.children].find((e) => !e.classList.contains('kui-btn'));
      if (tr) {
        tr.style.pointerEvents = 'auto'; tr.style.cursor = 'pointer';
        const git = (e) => { const r = tr.getBoundingClientRect(), th = tr.children[1], h = th ? th.getBoundingClientRect().height : 0; const o = Math.max(0, Math.min(1, (e.clientY - r.top - h / 2) / Math.max(1, r.height - h))); ac.scrollTop = o * (ac.scrollHeight - ac.clientHeight); ciz2(); };
        tr.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); tr.setPointerCapture(e.pointerId); git(e); tr.onpointermove = git; });
        tr.addEventListener('pointerup', () => { tr.onpointermove = null; });
      }
      W._aciklamaCiz = ciz2;
    }
    // Register Schedule
    const RG = 'group_reg_schedule';
    for (let i = 0; i < 7; i++) { const b = g(RG, 'btn_day_' + i); if (b) { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); gun = (i + 1) % 7; regCiz(); }; } }   // btn_day_0 = Pazartesi
    const inp = (id, o) => W.input(id, o);
    const saatI = inp('edit_schedule_hour', { type: 'text', maxLength: 2 }), dkI = inp('edit_schedule_minute', { type: 'text', maxLength: 2 });
    const adI = inp('edit_schedule_title', { type: 'text', maxLength: 32 });
    const mt = W.get('edit_schedule_contents'); let metinI = null;
    if (mt) { mt.querySelectorAll('.kui-tx').forEach((t) => (t.textContent = '')); metinI = document.createElement('textarea'); metinI.className = 'kui-input tk-metin'; metinI.maxLength = 128; mt.append(metinI); }
    const say = () => { const t = W.get('static_textsize')?.querySelector('.kui-tx') || W.get('static_textsize'); if (t) t.textContent = `${(metinI?.value || '').length}/128`; };
    metinI?.addEventListener('input', say);
    for (const i of [saatI, dkI, adI, metinI]) i?.addEventListener('keydown', (e) => e.stopPropagation());
    let kSec = -1;
    const alan = () => ({ gun, s: Math.max(0, Math.min(23, Number(saatI?.value) || 0)), d: Math.max(0, Math.min(59, Number(dkI?.value) || 0)), ad: (adI?.value || '').trim(), metin: (metinI?.value || '').trim(), on: true });
    const temizle = () => { if (saatI) saatI.value = iki(new Date().getHours()); if (dkI) dkI.value = '00'; if (adI) adI.value = ''; if (metinI) metinI.value = ''; kSec = -1; say(); };
    W.click('btn_reg', () => { const a = alan(); if (!a.ad) return hud.notice?.('Enter a schedule title.', 'hata'); if (KISI.length >= 20) return hud.notice?.('You cannot register more schedules.', 'hata'); KISI.push(a); yaz(KEY + '-kisisel', KISI); temizle(); regCiz(); hud.info?.(`Schedule registered: ${GUN[a.gun]} ${iki(a.s)}:${iki(a.d)} ${a.ad}`, 'gorev'); });
    W.click('btn_modify', () => { if (kSec < 0 || !KISI[kSec]) return hud.notice?.('Select a personal schedule to adjust.', 'hata'); const a = alan(); if (!a.ad) return; KISI[kSec] = a; yaz(KEY + '-kisisel', KISI); regCiz(); });
    W.click('btn_default', temizle);
    W.click('btn_clear', () => { KISI = []; yaz(KEY + '-kisisel', KISI); temizle(); regCiz(); });
    for (let i = 0; i < 4; i++) {
      const r = g(RG, 'group_indiv_' + i); if (!r) continue;
      const ch = r.querySelector('[data-id="btn_check"]'), del = r.querySelector('[data-id="btn_delete"]'), tx = r.querySelector('[data-id="str_contents"]');
      if (ch) { ch.classList.add('kui-tik'); ch.onclick = (e) => { e.stopPropagation(); const k = KISI[Number(r.dataset.k)]; if (k) { k.on = k.on === false; yaz(KEY + '-kisisel', KISI); regCiz(); } }; }
      if (del) { del.classList.add('kui-tik'); del.onclick = (e) => { e.stopPropagation(); const k = Number(r.dataset.k); if (KISI[k]) { KISI.splice(k, 1); yaz(KEY + '-kisisel', KISI); regCiz(); } }; }
      if (tx) { tx.style.pointerEvents = 'auto'; tx.style.cursor = 'pointer'; tx.onclick = (e) => { e.stopPropagation(); const k = KISI[Number(r.dataset.k)]; if (!k) return; kSec = Number(r.dataset.k); if (saatI) saatI.value = iki(k.s); if (dkI) dkI.value = iki(k.d); if (adI) adI.value = k.ad; if (metinI) metinI.value = k.metin; say(); }; }
    }
    for (let i = 0; i < 4; i++) {
      const r = g(RG, 'group_warfare_' + i); const ch = r?.querySelector('[data-id="btn_check"]');
      if (ch) { ch.classList.add('kui-tik'); ch.onclick = (e) => { e.stopPropagation(); const id = Number(r.dataset.id); if (!id) return; const s = new Set(AYAR.kapali); if (s.has(id)) s.delete(id); else s.add(id); AYAR.kapali = [...s]; yaz(KEY + '-ayar', AYAR); regCiz(); }; }
    }
    let savasUst = 0, kisiUst = 0;
    kaydirBagla(g(RG, 'scroll_warfare'), (d) => { savasUst += d; regCiz.su = savasUst = Math.max(0, savasUst); regCiz(); });
    kaydirBagla(g(RG, 'scroll_indiv'), (d) => { kisiUst = Math.max(0, kisiUst + d); regCiz.ku = kisiUst; regCiz(); });
    W._temizle = temizle;
    // Settings
    const O = 'group_option_schedule'; let gecici = null;
    const onay = (id, f) => { const b = g(O, id); if (b) { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); f(); ayarCiz(); }; } };
    onay('btn_check_warfare', () => (gecici.savas = !gecici.savas)); onay('btn_check_indiv', () => (gecici.kisisel = !gecici.kisisel));
    onay('btn_check_sound', () => (gecici.ses = !gecici.ses));
    onay('btn_check_3minute', () => (gecici.once = 3)); onay('btn_check_5minute', () => (gecici.once = 5)); onay('btn_check_10minute', () => (gecici.once = 10));
    function ayarCiz() {
      gecici ||= { ...AYAR };
      const t = (id, v) => g(O, id)?.classList.toggle('secili', !!v);
      t('btn_check_warfare', gecici.savas); t('btn_check_indiv', gecici.kisisel); t('btn_check_sound', gecici.ses);
      t('btn_check_3minute', gecici.once === 3); t('btn_check_5minute', gecici.once === 5); t('btn_check_10minute', gecici.once === 10);
    }
    W._ayarCiz = () => { gecici = { ...AYAR }; ayarCiz(); };
    W.click('btn_save', () => { AYAR = { ...AYAR, ...gecici }; yaz(KEY + '-ayar', AYAR); hud.info?.('Schedule settings have been saved.', 'gorev'); sekmeSec('btn_main_schedule'); });
    W.click('btn_cancel', () => { W._ayarCiz(); sekmeSec('btn_main_schedule'); });
    temizle();
  }
  function sekmeSec(b) {
    sekme = b;
    for (const x of ['btn_main_schedule', 'btn_reg_schedule', 'btn_option_schedule']) W.get(x)?.classList.toggle('secili', x === b);
    W.show('group_main_schedule', b === 'btn_main_schedule'); W.show('group_reg_schedule', b === 'btn_reg_schedule'); W.show('group_option_schedule', b === 'btn_option_schedule');
    if (b === 'btn_option_schedule') W._ayarCiz();
    ciz();
  }
  function ciz() { if (sekme === 'btn_main_schedule') anaCiz(); else if (sekme === 'btn_reg_schedule') regCiz(); }
  function anaCiz() {
    const M = W.get('group_main_schedule');
    M.querySelectorAll('[data-id="group_day_select"] [data-id="str_day"]').forEach((t) => (t.textContent = GUN[gun]));
    wListe = gunListe(gun); const n = wListe.length;
    wUst = Math.max(0, Math.min(wUst, n - 9)); wSec = Math.max(0, Math.min(wSec, n - 1));
    const ml = M.querySelector('[data-id="group_schedule_list"]');
    for (let i = 0; i < 9; i++) {
      const r = ml.querySelector(`[data-id="group_schedule_contents_${i}"]`), e = wListe[wUst + i];
      const t = r?.querySelector('[data-id="str_contents_title"]'); if (t) t.innerHTML = e ? satirHtml(e) : '';
      r?.classList.toggle('tk-kapali', !!e && (e.on === false || AYAR.kapali.includes(e.id)));
    }
    const ck = ml.querySelector('[data-id="img_check"]'), sr = ml.querySelector(`[data-id="group_schedule_contents_${wSec - wUst}"]`);
    if (ck) { ck.hidden = !(n && sr); if (sr) ck.style.top = sr.style.top; }
    kaydirCiz(ml.querySelector('[data-id="scroll_contents_title"]'), n > 9 ? wUst / (n - 9) : 0);
    const e = wListe[wSec], img = M.querySelector('[data-id="img_explain"]'), ac = M.querySelector('[data-id="str_explain"]');
    if (img) { const r = e && RESIMLER.has(e.resim) ? e.resim : 'scheduler_default'; img.style.backgroundImage = `url(./assets/ui/sched/img/${r}.webp)`; img.classList.add('tk-resim'); img.hidden = false; }
    if (ac) { ac.textContent = e ? e.metin || e.ad : ''; ac.scrollTop = 0; W._aciklamaCiz?.(); }
  }
  function regCiz() {
    const RG = W.get('group_reg_schedule');
    RG.querySelectorAll('[data-id="group_day_select"] [data-id="str_day"]').forEach((t) => (t.textContent = GUN[gun]));
    for (let i = 0; i < 7; i++) g('group_reg_schedule', 'btn_day_' + i)?.classList.toggle('secili', (i + 1) % 7 === gun);
    const sv = gunListe(gun, { kisisel: false, savas: true }), su = Math.max(0, Math.min(regCiz.su || 0, sv.length - 4));
    for (let i = 0; i < 4; i++) {
      const r = RG.querySelector(`[data-id="group_warfare_${i}"]`), e = sv[su + i]; if (!r) continue;
      r.hidden = !e; if (!e) continue; r.dataset.id = e.id;
      r.querySelector('[data-id="str_contents"]').innerHTML = satirHtml(e);
      r.querySelector('[data-id="btn_check"]')?.classList.toggle('secili', !AYAR.kapali.includes(e.id));
    }
    kaydirCiz(RG.querySelector('[data-id="scroll_warfare"]'), sv.length > 4 ? su / (sv.length - 4) : 0);
    const kl = KISI.map((k, i) => ({ ...k, i })).sort((a, b) => a.gun - b.gun || a.s * 60 + a.d - (b.s * 60 + b.d)), ku = Math.max(0, Math.min(regCiz.ku || 0, kl.length - 4));
    for (let i = 0; i < 4; i++) {
      const r = RG.querySelector(`[data-id="group_indiv_${i}"]`), k = kl[ku + i]; if (!r) continue;
      r.hidden = !k; if (!k) continue; r.dataset.k = k.i;
      r.querySelector('[data-id="str_contents"]').innerHTML = `<span class="tk-saat">${GUN[k.gun]} ${iki(k.s)}:${iki(k.d)}</span><span class="tk-ad">${esc(k.ad)}</span>`;
      r.querySelector('[data-id="btn_check"]')?.classList.toggle('secili', k.on !== false);
    }
    kaydirCiz(RG.querySelector('[data-id="scroll_indiv"]'), kl.length > 4 ? ku / (kl.length - 4) : 0);
  }
  function ac() {
    if (!W) kur();
    gun = new Date().getDay(); wUst = 0;
    const simdi = new Date().getHours() * 60 + new Date().getMinutes(); const l = gunListe(gun); const i = l.findIndex((e) => e.dk >= simdi); wSec = i < 0 ? 0 : i; wUst = Math.max(0, wSec - 4);
    sekmeSec('btn_main_schedule');
    W.el.hidden = false; W.el.style.zIndex = 4300;
    if (!W.el.style.left) { W.el.style.left = Math.max(10, (innerWidth - 487) / 2) + 'px'; W.el.style.top = Math.max(10, (innerHeight - 393) / 2) + 'px'; }
  }
  function kapat() { if (W) W.el.hidden = true; }
  function toggle() { if (W && !W.el.hidden) kapat(); else ac(); }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && W && !W.el.hidden) kapat(); });

  // ---- bildirim: etkinlikten N dk önce (Settings), ses (kısa çan)
  const bildirildi = new Set();
  function cal() {
    try { const A = new (window.AudioContext || window.webkitAudioContext)(); const o = A.createOscillator(), gn = A.createGain(); o.type = 'sine'; o.frequency.value = 880; gn.gain.setValueAtTime(0.12, A.currentTime); gn.gain.exponentialRampToValueAtTime(0.001, A.currentTime + 0.8); o.connect(gn).connect(A.destination); o.start(); o.stop(A.currentTime + 0.8); } catch {}
  }
  setInterval(() => {
    const d = new Date(), bugun = d.getDay(), simdi = d.getHours() * 60 + d.getMinutes();
    for (const e of gunListe(bugun)) {
      if (e.on === false || (e.id && AYAR.kapali.includes(e.id))) continue;
      const kalan = e.dk - simdi; if (kalan !== AYAR.once) continue;
      const k = `${d.toDateString()}-${e.id || 'k' + e.kisi}-${e.dk}`; if (bildirildi.has(k)) continue; bildirildi.add(k);
      hud.notice?.(`${e.ad} will start in ${AYAR.once} minutes. (${saat(e.dk)})`, 'gorev');
      if (AYAR.ses) cal();
    }
  }, 15000);

  return { ac, kapat, toggle };
}
