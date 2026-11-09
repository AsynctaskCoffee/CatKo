// KO posta kutusu: sol üstteki can çubuğunun yanındaki zarf (re_hpbar img_mail_normal / img_mail_on — okunmamış varsa yanar).
// Oyuncular birbirine mail gönderir; sistem (GM) mailleri hediye eşya taşıyabilir (ikon + fareyle ipucu, "Eşyayı al").
// Mailler 7 gün kalır, sonra silinir. Okundu işaretleme ve seçerek silme. Sunucu: mail tablosu (Realtime), mail_listem / mail_gonder / mail_oku / mail_sil / mail_esya_al.
import { koWindow, toFront } from './ko-pencere.js';
import { buildLayout, hasLayout, draggable, ekUI } from './kui.js';
import { iconHtml, fromDb, tooltipHtml, loadMeta } from './esya.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tarih = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const kalanGun = (t) => Math.max(0, Math.ceil((new Date(t) - Date.now()) / 86400000));

export function initMail({ sb, character, hud, state }) {
  const me = Number(character.id);
  let liste = [], el = null, gorunum = 'liste', secili = null, isaretli = new Set();
  const IT = new Map();
  const rpc = async (fn, args = {}) => {
    const { data, error } = await sb.rpc(fn, { p_char: me, ...args });
    if (error) { hud.notice?.(error.message, 'hata'); return null; }
    if (data && data.ok === false) { hud.notice?.(data.reason || 'The operation failed.', 'hata'); return null; }
    return data;
  };
  async function esyalar(nums) {
    const eksik = [...new Set(nums.filter(Boolean))].filter((n) => !IT.has(n)); if (!eksik.length) return;
    await loadMeta().catch(() => {});
    const { data } = await sb.from('items').select('*').in('num', eksik);
    for (const r of data || []) IT.set(r.num, fromDb(r));
  }
  const okunmamis = () => liste.filter((m) => !m.okundu).length;
  const ikonGuncelle = () => hud.mailIkon?.(okunmamis());
  async function yukle() {
    const d = await rpc('mail_listem'); if (!d) return;
    liste = d; await esyalar(liste.map((m) => m.esya));
    ikonGuncelle(); if (el && !el.hidden) ciz(); if (K && !K.el.hidden) koCiz();
  }

  // ---- ipucu
  let tip = null;
  const ipKapat = () => tip?.remove();
  function ipucu(ev, num, adet) {
    const it = IT.get(num); if (!it) return;
    tip ||= Object.assign(document.createElement('div'), { id: 'ko-ipucu-yuzen', className: 'ko-ipucu' });
    if (!tip.isConnected) document.body.append(tip);
    tip.innerHTML = tooltipHtml(it, { count: adet > 1 ? adet : 0 }); tip.style.zIndex = 9000;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(innerWidth - w - 8, ev.clientX + 16) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - h - 8, ev.clientY - 10)) + 'px';
  }

  function pencere() {
    if (el?.isConnected) return el;
    el = document.createElement('div'); el.className = 'ko-panel ko-pencere ko-mail';
    el.innerHTML = `<div class="ay-baslik">Posta Kutusu</div><button class="ko-kapat" title="Kapat"></button><div class="ml-govde"></div>`;
    (document.getElementById('kohud') || document.body).append(el); el.style.pointerEvents = 'auto';
    koWindow(el); toFront(el);
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(el); });
    el.addEventListener('keydown', (e) => e.stopPropagation()); el.addEventListener('keyup', (e) => e.stopPropagation());
    el.querySelector('.ko-kapat').addEventListener('click', () => { el.hidden = true; ipKapat(); });
    el.addEventListener('pointerover', (e) => { const k = e.target.closest('[data-num]'); if (k) ipucu(e, Number(k.dataset.num), Number(k.dataset.adet)); });
    el.addEventListener('pointermove', (e) => { const k = e.target.closest('[data-num]'); if (k) ipucu(e, Number(k.dataset.num), Number(k.dataset.adet)); else ipKapat(); });
    el.addEventListener('pointerleave', ipKapat);
    return el;
  }
  const esyaKutu = (m, boy = 32) => { const it = IT.get(m.esya); return m.esya ? `<span class="ml-esya${m.alindi ? ' ml-alindi' : ''}" data-num="${m.esya}" data-adet="${m.adet}">${it ? iconHtml(it, boy) : ''}${m.adet > 1 ? `<b>${m.adet}</b>` : ''}</span>` : ''; };
  function ciz() {
    const g = el.querySelector('.ml-govde'); ipKapat();
    if (gorunum === 'liste') {
      g.innerHTML = `<div class="ml-ust"><span>${liste.length} mail · ${okunmamis()} unread</span><span class="ml-not">Mails are kept for 7 days.</span></div>
        <div class="ml-liste">${liste.length ? liste.map((m) => `<div class="ml-satir${m.okundu ? '' : ' ml-yeni'}" data-id="${m.id}">
          <input type="checkbox" class="ml-sec" ${isaretli.has(m.id) ? 'checked' : ''}>
          <span class="ml-tur">${m.sistem ? '★' : '✉'}</span>
          <span class="ml-kimden${m.sistem ? ' ml-sistem' : ''}">${esc(m.from)}</span>
          <span class="ml-konu">${esc(m.konu || '(no title)')}</span>
          ${esyaKutu(m, 24)}
          <span class="ml-tarih">${tarih(m.at)}<br><i>${kalanGun(m.bitis)} days</i></span></div>`).join('') : '<div class="ml-bos">Your mailbox is empty.</div>'}</div>
        <div class="ml-dugmeler"><button class="ay-dugme" data-k="yeni">New mail</button><button class="ay-dugme" data-k="okundu">Mark as read</button><button class="ay-dugme tehlike" data-k="sil">Delete</button><button class="ay-dugme" data-k="yenile">Refresh</button></div>`;
    } else if (gorunum === 'oku') {
      const m = liste.find((x) => x.id === secili); if (!m) { gorunum = 'liste'; return ciz(); }
      g.innerHTML = `<div class="ml-oku"><div class="ml-baslik"><b class="${m.sistem ? 'ml-sistem' : ''}">${esc(m.from)}</b> <span class="ml-tarih">${tarih(m.at)} · ${kalanGun(m.bitis)} days left</span></div>
        <div class="ml-konu-b">${esc(m.konu || '(no title)')}</div><div class="ml-metin">${esc(m.metin)}</div>
        ${m.esya ? `<div class="ml-hediye"><span class="ml-hediye-b">Gift</span>${esyaKutu(m, 34)}<span>${esc(IT.get(m.esya)?.strName || '')}${m.adet > 1 ? ' x' + m.adet : ''}</span>${m.alindi ? '<i>Received</i>' : '<button class="ay-dugme" data-k="al">Take item</button>'}</div>` : ''}</div>
        <div class="ml-dugmeler"><button class="ay-dugme" data-k="geri">Back</button>${m.sistem ? '' : '<button class="ay-dugme" data-k="yanitla">Reply</button>'}<button class="ay-dugme tehlike" data-k="sil1">Delete</button></div>`;
    } else {
      g.innerHTML = `<div class="ml-yaz"><label>To<input class="ml-alici" maxlength="30"></label><label>Title<input class="ml-konu-i" maxlength="60"></label>
        <label>Mesaj<textarea class="ml-metin-i" maxlength="1000" rows="7"></textarea></label></div>
        <div class="ml-dugmeler"><button class="ay-dugme" data-k="geri">Cancel</button><button class="ay-dugme" data-k="gonder">Send</button></div>`;
      if (gorunum.alici) g.querySelector('.ml-alici').value = gorunum.alici;
      if (gorunum.konu) g.querySelector('.ml-konu-i').value = gorunum.konu;
    }
  }
  async function tikla(e) {
    const satirEl = e.target.closest('.ml-satir');
    if (e.target.classList.contains('ml-sec') && satirEl) { const id = Number(satirEl.dataset.id); if (e.target.checked) isaretli.add(id); else isaretli.delete(id); return; }
    const k = e.target.closest('button')?.dataset.k;
    if (!k && satirEl) {   // maili aç
      secili = Number(satirEl.dataset.id); gorunum = 'oku'; const m = liste.find((x) => x.id === secili);
      if (m && !m.okundu) { m.okundu = true; ikonGuncelle(); rpc('mail_oku', { p_id: m.id }); }
      return ciz();
    }
    if (k === 'yeni') { gorunum = { alici: '' }; return ciz(); }
    if (k === 'geri') { gorunum = 'liste'; return ciz(); }
    if (k === 'yenile') return yukle();
    if (k === 'okundu') {
      const ids = isaretli.size ? [...isaretli] : liste.filter((m) => !m.okundu).map((m) => m.id);
      for (const id of ids) { const m = liste.find((x) => x.id === id); if (m && !m.okundu) { m.okundu = true; rpc('mail_oku', { p_id: id }); } }
      isaretli.clear(); ikonGuncelle(); return ciz();
    }
    if (k === 'sil' || k === 'sil1') {
      const ids = k === 'sil1' ? [secili] : [...isaretli];
      if (!ids.length) return hud.notice?.('Select the letters to delete.', 'hata');
      const sil = async () => {
        const d = await rpc('mail_sil', { p_ids: ids }); if (!d) return;
        if (d.kalan) hud.notice?.('Letters with unclaimed items cannot be deleted.', 'hata');
        isaretli.clear(); gorunum = 'liste'; await yukle();
      };
      return sil();   // onay penceresi yok
    }
    if (k === 'al') {
      const d = await rpc('mail_esya_al', { p_id: secili }); if (!d) return;
      hud.info?.(`You've received the ${d.name}${d.adet > 1 ? ' x' + d.adet : ''} item.`, 'esya'); state.inv?.reload?.();
      const m = liste.find((x) => x.id === secili); if (m) { m.alindi = true; m.okundu = true; } ikonGuncelle(); return ciz();
    }
    if (k === 'yanitla') { const m = liste.find((x) => x.id === secili); gorunum = { alici: m?.from || '', konu: m?.konu ? 'Ynt: ' + m.konu : '' }; return ciz(); }
    if (k === 'gonder') {
      const g = el.querySelector('.ml-govde');
      const alici = g.querySelector('.ml-alici').value.trim(), konu = g.querySelector('.ml-konu-i').value.trim(), metin = g.querySelector('.ml-metin-i').value;
      if (!alici) return hud.notice?.('Enter the recipient\'s name.', 'hata');
      const d = await rpc('mail_gonder', { p_alici: alici, p_konu: konu, p_metin: metin }); if (!d) return;
      hud.info?.(`Letter sent to ${d.alici}.`, 'beceri'); gorunum = 'liste'; return ciz();
    }
  }
  // ================= KO arayüzü (re_mailsystem / re_mailsystem_read — KO istemcisinin kendi posta penceresi) =================
  const SAYFA = 5, ENCOK = 20;
  let K = null, KR = null, kGrup = 'gelen', kSayfa = 0, kSilSayfa = 0, kSecili = null;
  const kat = () => document.getElementById('kohud') || document.body;
  const gunTarih = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const GRUP = { gelen: 'group_receive_item', sil: 'group_remove_item', yaz: 'group_mailsend' };
  const gq = (g, id) => K.el.querySelector(`[data-id="${GRUP[g]}"] [data-id="${id}"]`);
  const gqa = (g, id) => [...K.el.querySelectorAll(`[data-id="${GRUP[g]}"] [data-id="${id}"]`)];
  const tikla1 = (el, fn) => { if (!el) return; el.classList.add('kui-tik'); el.style.pointerEvents = 'auto'; el.onclick = (ev) => { ev.stopPropagation(); fn(ev); }; };
  const yazi = (el, t) => { if (el) el.textContent = t; };
  // KO onay kutusu düğmesi (btn_check): st1 = işaretli
  const kutuCiz = (b, on) => { if (!b) return; for (const im of b.children) im.style.display = im.classList.contains(on ? 'st1' : 'st0') ? 'block' : 'none'; };
  const ortala = (el, w, h) => { el.style.left = Math.max(8, (innerWidth - w) / 2) + 'px'; el.style.top = Math.max(8, (innerHeight - h) / 2) + 'px'; };
  const ikonYuva = (a, m, boy = 45) => {
    if (!a) return; const it = m?.esya ? IT.get(m.esya) : null;
    a.innerHTML = it ? `<span class="mlk-esya${m.alindi ? ' ml-alindi' : ''}" data-num="${m.esya}" data-adet="${m.adet}">${iconHtml(it, boy)}</span>` : (m ? `<span class="mlk-zarf${m.okundu ? '' : ' mlk-yeni'}"></span>` : '');
    a.style.pointerEvents = 'auto';
  };
  function koKur() {
    if (K?.el.isConnected) return K;
    K = buildLayout('re_mailsystem', { className: 'ko-pencere ko-mail-ko' }); kat().append(K.el); draggable(K, 40);
    ortala(K.el, 385, 502);
    K.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(K.el); });
    K.el.addEventListener('keydown', (e) => e.stopPropagation()); K.el.addEventListener('keyup', (e) => e.stopPropagation());
    K.el.addEventListener('pointermove', (e) => { const k = e.target.closest('[data-num]'); if (k) ipucu(e, Number(k.dataset.num), Number(k.dataset.adet)); else ipKapat(); });
    K.el.addEventListener('pointerleave', ipKapat);
    // başlık ve etiketler
    for (const t of K.el.querySelectorAll('.kui-tx')) { const x = t.textContent.trim();
      if (x === '___') t.textContent = '';
      else if (/^Mail Fee/i.test(x) || x === 'Item') t.textContent = ''; }
    // sekmeler: Gelen posta | Posta sil | Posta yaz (her grubun kendi sekme düğmeleri)
    for (const g of Object.keys(GRUP)) {
      const grp = K.el.querySelector(`[data-id="${GRUP[g]}"]`); if (!grp) continue;
      const sekmeler = [...grp.querySelectorAll(':scope > .kui-btn')].filter((b) => parseFloat(b.style.top) < 70);
      for (const b of sekmeler) { const x = parseFloat(b.style.left); tikla1(b, () => koGoster(x < 100 ? 'gelen' : x < 200 ? 'sil' : 'yaz')); }
      for (const b of [...gqa(g, 'btn_close'), ...gqa(g, 'btn_remove_close')]) tikla1(b, () => koKapat());
    }
    tikla1(gq('gelen', 'btn_pre'), () => { kSayfa = Math.max(0, kSayfa - 1); koCiz(); });
    tikla1(gq('gelen', 'btn_next'), () => { kSayfa = Math.min(Math.max(0, Math.ceil(liste.length / SAYFA) - 1), kSayfa + 1); koCiz(); });
    tikla1(gq('sil', 'btn_remove_pre'), () => { kSilSayfa = Math.max(0, kSilSayfa - 1); koCiz(); });
    tikla1(gq('sil', 'btn_remove_next'), () => { kSilSayfa = Math.min(Math.max(0, Math.ceil(liste.length / SAYFA) - 1), kSilSayfa + 1); koCiz(); });
    for (let i = 0; i < SAYFA; i++) {
      const g = K.el.querySelector(`[data-id="group_mail0${i}"]`);
      tikla1(g?.querySelector('[data-id="area_mail"]'), () => { const m = liste[kSayfa * SAYFA + i]; if (m) koOku(m); });
      const gs = K.el.querySelector(`[data-id="group_remove_mail0${i}"]`);
      const sec = () => { const m = liste[kSilSayfa * SAYFA + i]; if (!m) return; if (isaretli.has(m.id)) isaretli.delete(m.id); else isaretli.add(m.id); koCiz(); };
      tikla1(gs?.querySelector('[data-id="btn_check"]'), sec); tikla1(gs?.querySelector('[data-id="area_remove_mail"]'), sec);
    }
    tikla1(gq('sil', 'btn_remove_check_all'), () => { const hepsi = liste.length && liste.every((m) => isaretli.has(m.id)); isaretli.clear(); if (!hepsi) for (const m of liste) isaretli.add(m.id); koCiz(); });
    tikla1(gq('sil', 'btn_remove_delete'), () => koSil([...isaretli]));
    // yazma
    const yer = (id, attrs, alan = false) => { const e = gq('yaz', id); if (!e) return null; e.textContent = ''; const inp = document.createElement(alan ? 'textarea' : 'input'); inp.className = 'kui-input mlk-girdi'; inp.autocomplete = 'off'; inp.spellcheck = false; Object.assign(inp, attrs); e.append(inp); e.style.pointerEvents = 'auto'; return inp; };
    K.alici = yer('edit_receivername', { maxLength: 30 }); K.konu = yer('edit_subject', { maxLength: 60 }); K.metin = yer('edit_text', { maxLength: 1000 }, true);
    for (const e of [K.alici, K.konu, K.metin]) e?.addEventListener('keydown', (ev) => ev.stopPropagation());
    yazi(gq('yaz', 'str_warning'), ''); yazi(gq('yaz', 'str_count'), ''); yazi(gq('yaz', 'str_mailmoney'), 'Mail Fee : 30,000 Noah');
    // ek eşya: çantadan sürükle-bırak (beta / süreli eşya sunucuda reddedilir); tıklayınca çıkarılır
    const ekAlan = gq('yaz', 'area_item');
    if (ekAlan) {
      ekAlan.dataset.esyaBirak = '1'; ekAlan.style.pointerEvents = 'auto'; ekAlan.classList.add('mlk-ek');
      ekAlan.addEventListener('ko-esya-birak', (ev) => {
        const d = ev.detail || {}; if (d.slot == null || d.slot < 14 || d.slot > 41) { hud.notice?.('Only items in your inventory can be sent.', 'hata'); return; }
        if (d.row?.bitis || Number(d.row?.sure_sn) > 0) { hud.notice?.('Time-limited items cannot be sent by letter.', 'hata'); return; }
        const koy = (n) => { K.ek = { slot: d.slot, num: Number(d.num), adet: n, it: d.it }; IT.set(Number(d.num), d.it); ekCiz(); };
        if (Number(d.it?.Countable) > 0 && (d.count || 1) > 1) import('./ticaret.js').then(({ adetSorPencere }) => adetSorPencere(d.x ?? innerWidth / 2, d.y ?? innerHeight / 2, d.count, koy)); else koy(d.count || 1);
      });
      ekAlan.addEventListener('click', (ev) => { ev.stopPropagation(); if (K.ek) { K.ek = null; ekCiz(); } });
    }
    const adr = gq('yaz', 'btn_address_list'); if (adr) adr.hidden = true;
    gq('yaz', 'scroll') && (gq('yaz', 'scroll').hidden = true);
    tikla1(gq('yaz', 'btn_mailsend'), async () => {
      const alici = K.alici.value.trim(); if (!alici) return hud.notice?.('Enter the recipient\'s name.', 'hata');
      const d = await rpc('mail_gonder2', { p_alici: alici, p_konu: K.konu.value.trim(), p_metin: K.metin.value, p_slot: K.ek?.slot ?? null, p_count: K.ek?.adet ?? null }); if (!d) return;
      if (d.gold != null) state.combat?.applyStats?.({ gold: d.gold });
      if (K.ek) state.inv?.reload?.();
      hud.info?.(`Letter sent to ${d.alici}${d.esya ? ` (${d.esya}${d.adet > 1 ? ' x' + d.adet : ''})` : ''} · postage ${Number(d.ucret || 30000).toLocaleString('en-US')} Noah`, 'beceri');
      K.alici.value = K.konu.value = K.metin.value = ''; K.ek = null; ekCiz(); koGoster('gelen');
    });
    return K;
  }
  function ekCiz() {
    const a = K && gq('yaz', 'area_item'); if (!a) return;
    const e = K.ek; a.innerHTML = e ? `<span class="mlk-esya" data-num="${e.num}" data-adet="${e.adet}">${iconHtml(e.it, 43)}</span>` : '';
    yazi(gq('yaz', 'str_count'), e && e.adet > 1 ? String(e.adet) : '');
    a.title = e ? 'Click to remove the item' : 'Drag the item you want to send here from your inventory';
  }
  function koGoster(g) {
    kGrup = g; for (const [k, id] of Object.entries(GRUP)) K.show(id, k === g);
    if (g !== 'gelen') { KR?.el.remove(); KR = null; }
    if (g === 'yaz') setTimeout(() => (K.alici?.value ? K.konu : K.alici)?.focus(), 30);
    koCiz();
  }
  function koCiz() {
    if (!K) return; ipKapat();
    const sayfalar = Math.max(1, Math.ceil(liste.length / SAYFA));
    kSayfa = Math.min(kSayfa, sayfalar - 1); kSilSayfa = Math.min(kSilSayfa, sayfalar - 1);
    yazi(gq('gelen', 'str_page'), `${kSayfa + 1}/${sayfalar}`); yazi(gq('sil', 'str_remove_page'), `${kSilSayfa + 1}/${sayfalar}`);
    yazi(gq('gelen', 'str_mailcount'), `Mektup ${liste.length}/${ENCOK}`);
    for (let i = 0; i < SAYFA; i++) {
      const m = liste[kSayfa * SAYFA + i], g = K.el.querySelector(`[data-id="group_mail0${i}"]`);
      if (g) {
        const q = (id) => g.querySelector(`[data-id="${id}"]`);
        yazi(q('str_subject'), m ? (m.konu || '(no title)') : ''); yazi(q('str_date'), m ? `Received : ${gunTarih(m.at)}` : '');
        yazi(q('str_sendretext'), m ? `Sent by : ${m.from}` : ''); yazi(q('str_eliminateday'), m ? `${kalanGun(m.bitis)} Days` : '');
        yazi(q('str_count'), m?.esya && m.adet > 1 ? String(m.adet) : '');
        q('str_subject')?.classList.toggle('mlk-okunmadi', !!m && !m.okundu); q('str_subject')?.classList.toggle('mlk-sistem', !!m?.sistem);
        ikonYuva(q('area_item'), m);
      }
      const ms = liste[kSilSayfa * SAYFA + i], gs = K.el.querySelector(`[data-id="group_remove_mail0${i}"]`);
      if (gs) {
        const q = (id) => gs.querySelector(`[data-id="${id}"]`);
        yazi(q('str_remove_subject'), ms ? (ms.konu || '(no title)') : ''); yazi(q('str_remove_date'), ms ? `Received : ${gunTarih(ms.at)}` : '');
        yazi(q('str_remove_sender'), ms ? `Sent by : ${ms.from}` : ''); yazi(q('str_eliminateday'), ms ? `${kalanGun(ms.bitis)} Days` : '');
        yazi(q('str_remove_count'), ms?.esya && ms.adet > 1 ? String(ms.adet) : '');
        ikonYuva(q('area_remove_item'), ms); const b = q('btn_check'); if (b) { b.hidden = !ms; kutuCiz(b, !!ms && isaretli.has(ms.id)); }
      }
    }
    kutuCiz(gq('sil', 'btn_remove_check_all'), liste.length > 0 && liste.every((m) => isaretli.has(m.id)));
  }
  async function koSil(ids) {
    if (!ids.length) return hud.notice?.('Select the letters to delete.', 'hata');
    const sil = async () => {
      const d = await rpc('mail_sil', { p_ids: ids }); if (!d) return;
      if (d.kalan) hud.notice?.('Letters with unclaimed items cannot be deleted.', 'hata');
      isaretli.clear(); KR?.el.remove(); KR = null; await yukle(); koCiz();
    };
    sil();   // onay penceresi yok: doğrudan silinir
  }
  function koOku(m) {
    kSecili = m.id;
    if (!m.okundu) { m.okundu = true; ikonGuncelle(); rpc('mail_oku', { p_id: m.id }); koCiz(); }
    KR?.el.remove();
    KR = buildLayout('re_mailsystem_read', { className: 'ko-pencere ko-mail-ko-oku' }); kat().append(KR.el); draggable(KR, 60);
    const r = K.el.getBoundingClientRect(); KR.el.style.left = (r.right + 390 <= innerWidth ? r.right + 6 : Math.max(0, r.left - 387)) + 'px'; KR.el.style.top = r.top + 'px';
    KR.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(KR.el); }); toFront(KR.el);
    KR.el.addEventListener('pointermove', (e) => { const k = e.target.closest('[data-num]'); if (k) ipucu(e, Number(k.dataset.num), Number(k.dataset.adet)); else ipKapat(); });
    KR.el.addEventListener('pointerleave', ipKapat);
    for (const t of KR.el.querySelectorAll('.kui-tx')) { const x = t.textContent.trim(); if (x === 'Attached item :') t.textContent = m.esya ? 'Attached item :' : ''; }
    KR.text('str_sendername', m.from); KR.text('str_mailsubject', m.konu || '(konu yok)'); KR.text('str_mailtext', m.metin || '');
    const mt = KR.get('str_mailtext'); if (mt) { mt.classList.add('mlk-metin'); mt.style.pointerEvents = 'auto'; }
    KR.show('scroll', false);
    KR.text('str_itemcount', m.esya && m.adet > 1 ? String(m.adet) : '');
    const a = KR.get('area_mailitem'); if (a) { a.innerHTML = ''; if (m.esya) ikonYuva(a, m, 45); }
    const al = m.esya && !m.alindi;
    KR.show('btn_receive_item', !!al); KR.show('btn_remove', !al); KR.show('btn_remail', !m.sistem);
    const kapat = () => { KR?.el.remove(); KR = null; ipKapat(); };
    KR.click('btn_close', kapat);
    KR.click('btn_remove', () => koSil([m.id]));
    KR.click('btn_remail', () => { kapat(); koGoster('yaz'); K.alici.value = m.from || ''; K.konu.value = m.konu ? 'Ynt: ' + m.konu : ''; K.metin.focus(); });
    KR.click('btn_receive_item', async () => {
      const d = await rpc('mail_esya_al', { p_id: m.id }); if (!d) return;
      hud.info?.(`You've received the ${d.name}${d.adet > 1 ? ' x' + d.adet : ''} item.`, 'esya'); state.inv?.reload?.();
      m.alindi = true; ikonGuncelle(); koCiz(); koOku(m);
    });
  }
  const koKapat = () => { if (K) K.el.hidden = true; KR?.el.remove(); KR = null; ipKapat(); };
  const koAcik = () => !!K && !K.el.hidden && K.el.isConnected;
  async function koAc(g = 'gelen') {
    if (!(await ekUI('mail')) || !hasLayout('re_mailsystem')) return false;
    koKur(); K.el.hidden = false; toFront(K.el); koGoster(g);
    await yukle(); koCiz();
    return true;
  }

  async function ac() {
    if (await koAc()) return;
    pencere(); el.hidden = false; toFront(el); gorunum = 'liste';
    el.removeEventListener('click', tikla); el.addEventListener('click', tikla);
    ciz(); await yukle();
  }
  const ackapa = () => (koAcik() ? koKapat() : el && !el.hidden ? (el.hidden = true) : ac());   // L / görev çubuğu: açıksa kapatır
  hud.mailBagla?.(ackapa);
  sb.channel('mail-' + me).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mail', filter: `to_owner=eq.${character.owner}` }, ({ new: m }) => {
    if (!m) return; hud.notice?.(m.from_name === 'MineKO Mağaza' ? 'The item you bought from the web store has arrived in your mailbox!' : m.from_char == null ? 'A new letter has arrived from the system!' : `A new letter has arrived from ${m.from_name}.`, 'esya'); yukle();
  }).subscribe();
  yukle();
  return { ac, ackapa, yukle, yeni: (alici = '') => { koAc('yaz').then((ok) => { if (ok) { K.alici.value = alici; (alici ? K.konu : K.alici)?.focus(); return; } ac().then(() => { gorunum = { alici }; ciz(); }); }); } };
}
