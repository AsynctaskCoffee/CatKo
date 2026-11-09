// KO özel mesaj (PM): oyuncuya sağ tık → "Mesaj gönder" ya da gelen mesajla açılan küçük sohbet penceresi.
// Gelen mesaj: alıcının ekranına mesaj kutusu düşer (pencere kapalıysa sol altta yanıp sönen "✉ Ad" sekmesi; tıklayınca açılır).
// Pencere: "_" gizle (sekmeye küçült), "×" kapat (sekme de kalkar). Sunucu: pm_mesaj tablosu (Realtime), pm_gonder / pm_ad.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const saat = (t) => { const d = new Date(t || Date.now()); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

import { ekUI, hasLayout, buildLayout } from './kui.js';

export function initPm({ sb, character, hud }) {
  // (31.10) KO orijinal PM pencereleri: re_whisper_open (açık) / re_whisper_close (küçültülmüş satır) — assets/ui/pmorj
  let orj = false; const orjP = ekUI('pmorj').then((ok) => { orj = !!ok && hasLayout('re_whisper_open') && hasLayout('re_whisper_close'); }).catch(() => {});
  const kareGoster = (grup, ad) => { if (grup) for (const e of grup.children) e.hidden = e.dataset.id !== ad; };
  // (1.11) KO: yeni mesajda şerit tek renkte yavaşça yanıp söner — normal (img_6) şeridin üstünde aynı renk temasının parlak şeridi (on img_6) yavaşça belirip kaybolur
  const durumCiz = (L, onId, normalId, yeni) => {
    const on = L.get(onId), nr = L.get(normalId); if (!on || !nr) return;
    kareGoster(nr, 'img_6'); kareGoster(on, 'img_6'); nr.hidden = false;
    if (nr.nextElementSibling !== on) nr.after(on);   // parlak şerit normal şeridin hemen üstünde (yazı ve düğmelerin altında)
    on.hidden = !yeni; on.classList.toggle('pm-yanip', !!yeni);
  };
  const engelli = () => (window.__koEngelliAl?.() || (window.__koEngelli ||= new Set()));
  // adın solundaki kutu (btn_block): sohbetteki kutu gibi — işaretlenince o oyuncunun sohbeti (PM dahil) kapanır
  function kutuKur(L, k) {
    const b = L.get('btn_block'); if (!b) return;
    b.classList.add('pmo-kutu'); b.title = 'Block chat';
    const ciz = () => b.classList.toggle('secili', engelli().has(String(k.ad).toLowerCase()));
    ciz(); b._ciz = ciz;
    b.addEventListener('click', (e) => {
      e.stopPropagation(); const ad = String(k.ad).toLowerCase(), E = engelli();
      const kapat = !E.has(ad); if (kapat) E.add(ad); else E.delete(ad);
      try { localStorage.setItem('ko-chatblock-' + me, JSON.stringify([...E])); } catch {}
      document.querySelectorAll('.pmo-kutu').forEach((x) => x._ciz?.());
      document.querySelectorAll('#sohbet-mesajlar .sohbet-kutu').forEach((x) => { if (x.dataset.ad === ad) x.classList.toggle('secili', kapat); });
      hud.info?.(`[${k.ad}] ${kapat ? 'The chatting will be disabled.' : 'The chatting will be enabled.'}`, 'soluk');
    });
  }
  const me = Number(character.id);
  const kisiler = new Map();   // id → { id, ad, el (pencere), sekme, okunmamis, yuklendi }
  const kat = () => document.getElementById('kohud') || document.body;
  let sekmeler = null;
  function sekmeKutusu() {
    if (sekmeler?.isConnected) return sekmeler;
    sekmeler = document.createElement('div'); sekmeler.className = 'ko-pm-sekmeler';
    sekmeler.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.append(sekmeler); yerlestir(); return sekmeler;
  }
  // KO: PM listesi sohbet panelinin hemen üstünde; her yeni kişi üst üste yapışık satır olarak yukarı doğru eklenir,
  // 20 satır dolunca yanında yeni sütun başlar (en fazla 10 sütun = 200 kişi). Açık konuşma penceresi listenin sağında.
  const SATIR = 20, SUTUN = 10;
  const PMZ = 0.8;   // (1.11) KO PM penceresi ve küçültülmüş satır %20 küçük (CSS zoom .8)
  function yerlestir() {
    const ch = document.querySelector('.ko-chat'); const r = ch?.getBoundingClientRect();
    const alt = r && r.height ? Math.max(0, innerHeight - r.top) + 3 : 214;
    // ilk PM 2. sütun 4. satırdan başlar (bir sütun sağda, üç satır yukarıda), oradan yukarı doğru dizilir
    if (sekmeler) sekmeler.style.bottom = (alt + 3 * 22) + 'px';
    let sag = 0; if (sekmeler?.isConnected) for (const c of sekmeler.children) if (!c.hidden) sag = Math.max(sag, c.getBoundingClientRect().right);
    const sol = sag ? sag + 4 : 4;
    for (const k of kisiler.values()) if (k.el?.isConnected && !k.tasindi) { const z = k.L ? PMZ : 1; k.el.style.left = sol / z + 'px'; k.el.style.bottom = alt / z + 'px'; k.el.style.top = 'auto'; }   // KO pencere %80 (zoom): konum zoom'a bölünür
  }
  addEventListener('resize', yerlestir); setInterval(yerlestir, 1000);
  const silKey = (id) => `ko-pm-sil-${me}-${id}`;
  const silinen = (id) => { try { return Number(localStorage.getItem(silKey(id))) || 0; } catch { return 0; } };
  async function gecmisiSil(k) {
    let son = 0; try { const { data } = await sb.from('pm_mesaj').select('id').or(`and(from_char.eq.${me},to_char.eq.${k.id}),and(from_char.eq.${k.id},to_char.eq.${me})`).order('id', { ascending: false }).limit(1); son = Number(data?.[0]?.id) || 0; } catch {}
    try { localStorage.setItem(silKey(k.id), String(Math.max(son, k.sonId || 0))); } catch {}
  }
  function kisi(id, ad) {
    id = Number(id);
    let k = kisiler.get(id);
    if (!k) { k = { id, ad: ad || 'Oyuncu', el: null, sekme: null, okunmamis: 0, yuklendi: false }; kisiler.set(id, k); }
    if (ad) k.ad = ad;
    return k;
  }
  function sekmeGuncelle(k) {
    if (!k.sekme && orj) {
      const C = buildLayout('re_whisper_close', { className: 'ko-pmo-sekme kui-dokulu' });
      k.sekme = C.el; k.sekmeL = C;
      C.text('exit_id', k.ad); C.get('exit_id')?.classList.add('pmo-ad');
      C.click('btn_open', () => ac(k.id));
      C.click('btn_close', () => kapatK(k));
      kutuKur(C, k);
      C.el.addEventListener('dblclick', (e) => { if (!e.target.closest('.kui-btn')) ac(k.id); });
      sekmeKutusu().append(C.el);
      while (sekmeler.children.length > SATIR * SUTUN) { const ilk = [...kisiler.values()].find((x) => x.sekme === sekmeler.firstElementChild); if (ilk) { ilk.sekme.remove(); ilk.sekme = null; } else sekmeler.firstElementChild.remove(); }
      yerlestir();
    }
    if (k.sekmeL) {
      durumCiz(k.sekmeL, 'base_on', 'base_normal', k.okunmamis > 0);
      const acik = !!(k.el?.isConnected && !k.el.hidden); k.sekme.hidden = acik; yerlestir(); return;
    }
    if (!k.sekme) {
      k.sekme = document.createElement('button'); k.sekme.className = 'ko-pm-sekme';
      k.sekme.addEventListener('click', () => { if (k.el?.isConnected && !k.el.hidden) { k.el.hidden = true; sekmeGuncelle(k); } else ac(k.id); });
      sekmeKutusu().append(k.sekme);
      // en fazla 10 sütun × 20 satır: taşarsa en eski (açık olmayan) satır düşer
      while (sekmeler.children.length > SATIR * SUTUN) { const ilk = [...kisiler.values()].find((x) => x.sekme === sekmeler.firstElementChild); if (ilk) { ilk.sekme.remove(); ilk.sekme = null; } else sekmeler.firstElementChild.remove(); }
      yerlestir();
    }
    k.sekme.innerHTML = `<span class="pm-zarf">✉</span> ${esc(k.ad)}${k.okunmamis ? ` <b>(${k.okunmamis})</b>` : ''}`;
    k.sekme.classList.toggle('pm-yeni', k.okunmamis > 0);
    const acik = !!(k.el?.isConnected && !k.el.hidden);
    k.sekme.hidden = acik;   // pencere açıkken PM ikonu listeden kalkar; gizlenince geri gelir
    k.sekme.classList.toggle('pm-acik', acik);
    yerlestir();
  }
  // KO PM balonları: kendi mesajın sağda (mavi-gri balon, açık mavi yazı), karşı taraf solda (kahverengi balon, sarı yazı); dakika değişince saat
  const saatKO = (t) => { const d = new Date(t || Date.now()); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${ap} ${h}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function satir(k, m) {
    const log = k.el?.querySelector('.pm-log'); if (!log) return;
    const ben = Number(m.from_char) === me, s = saatKO(m.created_at);
    if (m.id) k.sonId = Math.max(k.sonId || 0, Number(m.id));
    const d = document.createElement('div'); d.className = 'pm-satir' + (ben ? ' pm-ben' : ' pm-o');
    const saatGoster = k.sonSaat !== s + ben; k.sonSaat = s + ben;
    d.innerHTML = `<span class="pm-balon">${esc(m.metin)}</span>${saatGoster ? `<span class="pm-saat">${s}</span>` : ''}`;
    log.append(d); while (log.children.length > 200) log.firstChild.remove();
    log.scrollTop = log.scrollHeight; k.guncel?.();
  }
  async function gecmis(k) {
    if (k.yuklendi) return; k.yuklendi = true;
    const { data } = await sb.from('pm_mesaj').select('*').or(`and(from_char.eq.${me},to_char.eq.${k.id}),and(from_char.eq.${k.id},to_char.eq.${me})`).order('id', { ascending: false }).limit(30);
    const log = k.el?.querySelector('.pm-log'); if (log) log.innerHTML = '';
    const sinir = silinen(k.id);   // pencere kapatılınca geçmiş silinir: o andan önceki mesajlar bir daha gösterilmez
    for (const m of (data || []).reverse()) if (!(Number(m.id) <= sinir)) satir(k, m);
  }
  // KO PM penceresi: ekranın solunda, sohbetin üstünde sabit ve kompakt (görev takip penceresi gibi); tek seferde bir konuşma, diğerleri sekmede
  const EMO = ['😊', '😂', '😉', '😎', '😢', '😡', '👍', '❤️', '🙏', '😮'];
  let saydam = 4;   // 1-5 (◀ ▶)
  function pencere(k) {
    if (k.el?.isConnected) return k.el;
    if (orj) return pencereOrj(k);
    const el = document.createElement('div'); el.className = 'ko-pm';
    el.innerHTML = `<div class="pm-bas"><span class="pm-avatar"></span><span class="pm-ad">${esc(k.ad)}</span>
        <span class="pm-saydam"><button class="pm-ok" data-k="az" title="Daha saydam">◀</button><span class="pm-cubuk"><i></i></span><button class="pm-ok" data-k="cok" title="Daha koyu">▶</button></span>
        <button class="pm-yuv" data-k="gizle" title="Gizle">−</button><button class="pm-yuv pm-x" data-k="kapat" title="Kapat">X</button></div>
      <div class="pm-log"></div>
      <div class="pm-alt"><input class="pm-yazi" maxlength="200"><button class="pm-emo" data-k="emo" title="İfade">😊</button><div class="pm-emolar" hidden>${EMO.map((e) => `<span>${e}</span>`).join('')}</div></div>`;
    document.body.append(el);
    // oyuncunun adı başlığa tam sığsın: taşarsa yazı küçülür (12 → 9 px), yine sığmazsa saydamlık çubuğu daralır
    requestAnimationFrame(() => { const a = el.querySelector('.pm-ad'); if (!a) return; a.title = k.ad; let f = 12; while (a.scrollWidth > a.clientWidth + 1 && f > 9) { f -= 0.5; a.style.fontSize = f + 'px'; }
      if (a.scrollWidth > a.clientWidth + 1) { const c = el.querySelector('.pm-cubuk'); if (c) c.style.width = '18px'; } });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    // başlıktan tutup sürükle (taşınan pencere listenin yanına geri dönmez; çift tık = yerine koy)
    { const bas = el.querySelector('.pm-bas'); let d = null;
      bas.style.cursor = 'move';
      bas.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; const r = el.getBoundingClientRect(); d = { dx: e.clientX - r.left, dy: e.clientY - r.top }; bas.setPointerCapture(e.pointerId); e.preventDefault(); });
      bas.addEventListener('pointermove', (e) => { if (!d) return; k.tasindi = true;
        el.style.left = Math.min(innerWidth - 60, Math.max(0, e.clientX - d.dx)) + 'px'; el.style.top = Math.min(innerHeight - 30, Math.max(0, e.clientY - d.dy)) + 'px'; el.style.bottom = 'auto'; });
      const bit = () => (d = null); bas.addEventListener('pointerup', bit); bas.addEventListener('pointercancel', bit);
      bas.addEventListener('dblclick', (e) => { if (e.target.closest('button')) return; k.tasindi = false; yerlestir(); }); }
    el.addEventListener('keydown', (e) => e.stopPropagation()); el.addEventListener('keyup', (e) => e.stopPropagation());
    const saydamUygula = () => { el.style.setProperty('--pm-a', String(0.35 + saydam * 0.13)); el.querySelector('.pm-cubuk i').style.width = (saydam * 20) + '%'; };
    saydamUygula();
    const inp = el.querySelector('.pm-yazi');
    const gonder = async () => {
      const t = inp.value.trim(); if (!t) return;
      inp.value = '';
      const { data: d, error } = await sb.rpc('pm_gonder', { p_char: me, p_hedef: k.id, p_metin: t });
      if (error || !d?.ok) { hud.notice?.(error?.message || d?.reason || 'The message could not be sent.', 'hata'); return; }
      satir(k, { from_char: me, metin: d.metin, created_at: d.at });
    };
    el.addEventListener('click', (e) => {
      const em = e.target.closest('.pm-emolar span'); if (em) { inp.value += em.textContent; el.querySelector('.pm-emolar').hidden = true; inp.focus(); return; }
      const b = e.target.closest('button')?.dataset.k;
      if (b === 'az') { saydam = Math.max(1, saydam - 1); saydamUygula(); }
      if (b === 'cok') { saydam = Math.min(5, saydam + 1); saydamUygula(); }
      if (b === 'emo') { const p = el.querySelector('.pm-emolar'); p.hidden = !p.hidden; }
      if (b === 'gizle') { el.hidden = true; sekmeGuncelle(k); }
      if (b === 'kapat') { gecmisiSil(k); el.remove(); k.el = null; k.yuklendi = false; k.sonSaat = null; k.sekme?.remove(); k.sekme = null; k.okunmamis = 0; yerlestir(); }   // kapatma: geçmiş silinir
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') gonder(); if (e.key === 'Escape') { el.hidden = true; sekmeGuncelle(k); } });
    k.el = el;
    return el;
  }
  function kapatK(k) { gecmisiSil(k); k.el?.remove(); k.el = null; k.L = null; k.yuklendi = false; k.sonSaat = null; k.sekme?.remove(); k.sekme = null; k.sekmeL = null; k.okunmamis = 0; yerlestir(); }
  // KO re_whisper_open: [kutu] (X) Ad ··· (+) seçenek (−) küçült; mesaj alanı + kaydırma; yazı kutusu + ifade düğmesi
  function pencereOrj(k) {
    const L = buildLayout('re_whisper_open', { className: 'ko-pmo kui-dokulu' });
    const el = L.el; k.L = L;
    L.show('base_option', false); durumCiz(L, 'top_bar_on', 'top_bar_normal', false);
    for (const id of ['exit_chat', 'exit_myself', 'exit_opponent']) L.show(id, false);
    L.text('exit_id', k.ad); L.get('exit_id')?.classList.add('pmo-ad');
    const log = document.createElement('div'); log.className = 'pm-log pmo-log'; el.append(log);
    const inp = L.input('edit_chat', { maxLength: 200 }); if (inp) inp.classList.add('pm-yazi');
    kutuKur(L, k);
    document.body.append(el);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('keydown', (e) => e.stopPropagation()); el.addEventListener('keyup', (e) => e.stopPropagation());
    // kaydırma çubuğu: ▲ / ▼, tekerlek, tutamak
    const sc = L.get('scroll'), [bu, bd] = sc ? sc.querySelectorAll(':scope > .kui-btn') : [], tr = sc?.querySelector(':scope > .kui-tr'), tut = tr?.lastElementChild;
    const TH = tr ? tr.offsetHeight || 245 : 245;
    const guncel = () => { if (!tut) return; const m = log.scrollHeight - log.clientHeight; tut.hidden = m <= 0; const th = tut.offsetHeight || 20; tut.style.top = (m > 0 ? (TH - th) * log.scrollTop / m : 0) + 'px'; };
    bu?.addEventListener('click', () => { log.scrollTop -= 16; guncel(); }); bd?.addEventListener('click', () => { log.scrollTop += 16; guncel(); });
    log.addEventListener('scroll', guncel); new MutationObserver(guncel).observe(log, { childList: true }); k.guncel = guncel;
    el.addEventListener('wheel', (e) => { log.scrollTop += e.deltaY > 0 ? 32 : -32; guncel(); e.stopPropagation(); }, { passive: true });
    // başlıktan sürükle (çift tık: yerine koy)
    { const bar = document.createElement('div'); bar.className = 'pmo-tutma'; el.append(bar); let d = null;
      bar.addEventListener('pointerdown', (e) => { const r = el.getBoundingClientRect(); d = { dx: e.clientX - r.left, dy: e.clientY - r.top }; bar.setPointerCapture(e.pointerId); e.preventDefault(); });
      bar.addEventListener('pointermove', (e) => { if (!d) return; k.tasindi = true; el.style.left = Math.min(innerWidth - 60, Math.max(0, e.clientX - d.dx)) / PMZ + 'px'; el.style.top = Math.min(innerHeight - 30, Math.max(0, e.clientY - d.dy)) / PMZ + 'px'; el.style.bottom = 'auto'; });
      const bit = () => (d = null); bar.addEventListener('pointerup', bit); bar.addEventListener('pointercancel', bit);
      bar.addEventListener('dblclick', () => { k.tasindi = false; yerlestir(); }); }
    // (+) seçenek: yazı boyu (Small / Medium / Large) + saydamlık (◀ ▶) + Store
    const op = L.get('base_option'); let boy = Number(localStorage.getItem('ko-pm-boy') || 12), alfa = Number(localStorage.getItem('ko-pm-alfa') || 100);
    const opCiz = () => { log.style.fontSize = boy + 'px'; el.style.setProperty('--pmo-a', String(alfa / 100));
      [['btn_small', 10], ['btn_middle', 12], ['btn_high', 15]].forEach(([id, v]) => L.get(id)?.classList.toggle('secili', v === boy));
      const at = L.get('scroll_alpha')?.querySelector('.kui-tr'); const ti = at?.lastElementChild; if (ti) ti.style.left = Math.round(((alfa - 30) / 70) * Math.max(0, (at.offsetWidth || 70) - (ti.offsetWidth || 10))) + 'px'; };
    L.click('btn_option', () => { if (op) op.hidden = !op.hidden; opCiz(); });
    L.click('btn_small', () => { boy = 10; opCiz(); }); L.click('btn_middle', () => { boy = 12; opCiz(); }); L.click('btn_high', () => { boy = 15; opCiz(); });
    { const ab = L.get('scroll_alpha')?.querySelectorAll(':scope > .kui-btn') || []; ab[0]?.addEventListener('click', () => { alfa = Math.max(30, alfa - 10); opCiz(); }); ab[1]?.addEventListener('click', () => { alfa = Math.min(100, alfa + 10); opCiz(); }); }
    L.click('btn_save', () => { try { localStorage.setItem('ko-pm-boy', String(boy)); localStorage.setItem('ko-pm-alfa', String(alfa)); } catch {} if (op) op.hidden = true; });
    opCiz();
    L.click('btn_hide', () => { el.hidden = true; sekmeGuncelle(k); });
    L.click('btn_close', () => kapatK(k));
    L.click('btn_emoticon', () => { if (inp) import('./emoticon.js').then(({ emoSecici }) => emoSecici(inp, L.get('btn_emoticon'))); });
    const gonder = async () => {
      const t = inp.value.trim(); if (!t) return;
      inp.value = '';
      const { data: d, error } = await sb.rpc('pm_gonder', { p_char: me, p_hedef: k.id, p_metin: t });
      if (error || !d?.ok) { hud.notice?.(error?.message || d?.reason || 'The message could not be sent.', 'hata'); return; }
      satir(k, { from_char: me, metin: d.metin, created_at: d.at });
    };
    inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') gonder(); if (e.key === 'Escape') { el.hidden = true; sekmeGuncelle(k); } });
    k.el = el; k.gonder = gonder;
    return el;
  }
  // aynı anda tek konuşma görünür: diğer açık pencereler sekmeye küçülür
  function digerleriniGizle(k) { for (const x of kisiler.values()) if (x !== k && x.el?.isConnected && !x.el.hidden) { x.el.hidden = true; sekmeGuncelle(x); } }
  async function ac(id, ad) {
    await orjP;
    const k = kisi(id, ad);
    digerleriniGizle(k);
    const el = pencere(k); el.hidden = false;
    k.okunmamis = 0; sekmeGuncelle(k); yerlestir();
    await gecmis(k);
    el.querySelector('.pm-yazi')?.focus();
  }
  // gelen mesaj
  function gelen(m) {
    if (Number(m.to_char) !== me) return;
    // KO Whisper Mode Settings: PM · Common / Clan/Union / Friend — kapalı türden gelen mesaj gösterilmez
    { const S = window.koSecenek || {}, gonderen = Number(m.from_char);
      const arkadas = (window.koArkadasIdleri?.() || []).includes(gonderen), klan = (window.koKlanUyeIdleri?.() || []).includes(gonderen);
      const izin = arkadas ? S.fisiltiArkadas !== false : klan ? S.fisiltiKlan !== false : S.fisiltiGenel !== false;
      if (!izin) return; }
    if (engelli().has(String(m.from_name || '').toLowerCase())) return;   // kutusu işaretli (susturulmuş) oyuncu
    dispatchEvent(new CustomEvent('ko-pm-gelen', { detail: { id: Number(m.from_char), ad: m.from_name, metin: m.metin ?? m.text ?? m.mesaj ?? '' } }));   // (8.11) Genie otomatik parti daveti (yalnız özel mesaj)
    const k = kisi(m.from_char, m.from_name);
    if (k.el?.isConnected && k.yuklendi) satir(k, m);
    if (!k.el?.isConnected || k.el.hidden) { k.okunmamis++; hud.info?.(`${m.from_name} has sent you a private message.`, 'ozel'); }
    sekmeGuncelle(k);
  }
  sb.channel('pm-' + me).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pm_mesaj', filter: `to_char=eq.${me}` }, ({ new: m }) => { if (m) gelen(m); }).subscribe();
  // sohbetten: /pm Ad mesaj
  async function adIle(ad, metin) {
    const { data: d } = await sb.rpc('pm_ad', { p_char: me, p_ad: ad });
    if (!d?.ok) { hud.notice?.(d?.reason || 'The player could not be found.', 'hata'); return; }
    await ac(d.id, d.name);
    if (metin) { const k = kisiler.get(Number(d.id)); const inp = k?.el?.querySelector('.pm-yazi'); if (inp) { inp.value = metin; k.gonder ? k.gonder() : k.el.querySelector('.pm-gonder')?.click(); } }
  }
  return { ac, adIle };
}
