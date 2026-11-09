// Ardream "Nation Point Ranking" (KO: Alt basılı tutulduğu sürece açık, bırakınca kapanır).
// Solda Karus (mavi), sağda El Morad (kırmızı): ulus başına ilk 10 + en altta oyuncunun kendi sırası.
// Puan: Ardream'de öldürülen rakibin seviyesine göre kazanılan ulus puanı (NP); (+x) son öldürmenin kazancı.
// Dönem 12:00 ve 00:00'da (İstanbul) sıfırlanır. Veri: RPC ardream_np (ardream_skor tablosu, _pvp_oldurme yazar).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initSkor({ sb, character, state = null }) {
  let el = null, t = 0, t2 = 0, son = null, acikMi = false;
  const satir = (o, ben) => `<tr${ben ? ' class="np-ben"' : ''}${o?.id != null ? ` data-cid="${o.id}"` : ''}><td>${o?.sira ?? '-'}</td><td class="np-arma"></td><td class="np-ad"><span class="np-ad-y">${esc(o?.ad || '')}</span></td><td class="np-klan">${esc(o?.klan || '')}</td>`
    + `<td class="np-puan">${o ? `${o.np ?? 0}${o.son ? ` <i>(+${o.son})</i>` : ''}` : ''}</td></tr>`;
  const panel = (ad, cls, liste, ben) => {
    const r = []; for (let i = 0; i < 10; i++) r.push(satir(liste[i] ? liste[i] : null, liste[i] && liste[i].ad === character.name));
    return `<div class="np-panel ${cls}"><div class="np-ulus">${ad}</div>
      <table><thead><tr><th>Sıra</th><th>Arma</th><th>Karakter</th><th>Klan</th><th>Ulus Puanı</th></tr></thead>
      <tbody>${r.join('')}</tbody><tfoot>${ben ? satir({ sira: ben.sira ?? '-', id: ben.id, ad: ben.ad, klan: ben.klan, np: ben.np, son: ben.son }, true) : '<tr><td colspan="5">&nbsp;</td></tr>'}</tfoot></table></div>`;
  };
  const ciz = () => {
    if (!el) return;
    const d = son || { karus: [], elmo: [], ben: null };
    const ben = d.ben, benKa = ben && Number(ben.ulus) === 1 ? ben : null, benEl = ben && Number(ben.ulus) === 2 ? ben : null;
    el.querySelector('.np-govde').innerHTML = panel('KARUS', 'np-ka', d.karus || [], benKa) + panel('EL MORAD', 'np-el', d.elmo || [], benEl);
    // KO PK sembolleri (rutbe.js) kendi sütununda
    for (const tr of el.querySelectorAll('tr[data-cid]')) { const k = state?.rutbe?.sembolEl?.(tr.dataset.cid); if (k) tr.querySelector('.np-arma')?.replaceChildren(k); }   // Arma sütunu: KO gibi tek sembol (NP ya da LP sıralamasından iyi olanı)
  };
  // orta yazı: Ulus Anıtı — ayakta mı / yeniden çıkmasına kalan süre + şu anki sahibi (anıtı son yıkan ulus, +%10 NP)
  const ULUS = { 1: '<b class="np-ka-y">Karus</b>', 2: '<b class="np-el-y">El Morad</b>' };
  let fark = 0;   // sunucu saati - yerel saat
  const anitYaz = () => {
    const a = son?.anit, el2 = el?.querySelector('.np-anit'); if (!el2) return;
    if (!a) { el2.innerHTML = ''; return; }
    const sahip = ULUS[a.sahip] ? `Mevcut sahibi: ${ULUS[a.sahip]}` : 'Mevcut sahibi: <b>Yok</b>';
    let durum;
    if (Number(a.hp) > 0) durum = '<b class="np-anit-var">Ulus Anıtı ayakta</b>';
    else if (a.dogus_at) {
      const k = Math.max(0, Math.round((Date.parse(a.dogus_at) - (Date.now() + fark)) / 1000));
      durum = k > 0 ? `Ulus Anıtı tekrar çıkmasına: <b class="np-anit-sure">${String(Math.floor(k / 60)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}</b>` : '<b class="np-anit-var">Ulus Anıtı birazdan çıkıyor</b>';
    } else durum = 'Ulus Anıtı yıkıldı';
    el2.innerHTML = `${durum}<span class="np-anit-ayrac">|</span>${sahip}`;
  };
  const yukle = async () => { const { data, error } = await sb.rpc('ardream_np', { p_char: character.id }); if (!error && data) { son = data; if (data.anit?.simdi) fark = Date.parse(data.anit.simdi) - Date.now(); ciz(); koCiz(); anitYaz(); } };
  const kur = () => {
    el = document.createElement('div'); el.id = 'ardream-np';
    el.innerHTML = `<div class="np-baslik">Ulus Puanı Sıralaması</div><div class="np-anit"></div><div class="np-govde"></div>
      <div class="np-not"><b>${({ freezone_b: 'Ronark Land', freezone_c: 'Ronark Land Base' })[character.zone] || 'Ardream'}</b> Mevcut kullanıcı sayısına göre hesaplanır; her gün 12:00 ve 00:00'da sıfırlanır.</div>`;
    el.hidden = true; document.body.append(el);
  };
  // (3.11) KO orijinal "Today's Rank" penceresi (re_monthly_radder): Karus solda, El Morad sağda, ulus başına 11 satır (son satır kendi sıran)
  let KO = null, koDeneme = null;
  const koKur = async () => {
    const K = await import('./kui.js');
    if (!(await K.ekUI('rank3').catch(() => false)) || !K.hasLayout('re_monthly_radder')) return false;
    const L = K.buildLayout('re_monthly_radder', { className: 'ko-rank3 ko-pencere kui-dokulu' });
    const w = L.el; w.id = 'ardream-np-ko'; w.hidden = true; w.style.zIndex = 70;
    (document.getElementById('kohud') || document.body).append(w);
    // KO "Today's Rank": sayfa düğmeleri / sayfa kutusu / geri sayım bu pencerede gizli
    for (const id of ['btn_pagedown', 'btn_pageup', 'edit_page', 'text_page', 'text_cooltime']) for (const e of L.all(id)) e.style.display = 'none';
    L.text('title', "Today's Rank");
    for (const u of ['ka', 'el']) { L.text(`${u}_title_rank`, 'Rank'); L.text(`${u}_title_mark`, 'Mark'); L.text(`${u}_title_name`, 'Character'); L.text(`${u}_title_clan`, 'Clan'); L.text(`${u}_title_point`, 'Nation Point R'); }
    for (const id of ['title', ...['ka', 'el'].flatMap((u) => ['rank', 'mark', 'name', 'clan', 'point'].map((k) => `${u}_title_${k}`))]) for (const e of L.all(id)) e.classList.add('baslik-ince');   // statü penceresi başlığıyla aynı
    L.text('st_notice', '[Potential EXP Gain] For Victory : 0  /  For Defeat : 0');
    L.click('btn_close', () => kapat());
    const satirlar = {};
    for (const u of ['KA', 'EL']) {
      const r = []; for (let i = 0; i <= 10; i++) r.push({ num: L.get(`${u}_num_${i}`), id: L.get(`${u}_id_${i}`), clan: L.get(`${u}_clan_${i}`), np: L.get(`${u}_ladder_${i}`), mark: L.get(`${u}_mark_${i}`) });
      satirlar[u] = r;
    }
    for (const m of w.querySelectorAll('[data-id*="_mark_"]')) m.style.background = 'none';
    w.addEventListener('pointerdown', (e) => e.stopPropagation());
    w.addEventListener('contextmenu', (e) => e.preventDefault());
    KO = { L, w, satirlar };
    return true;
  };
  const koYaz = (hucre, o) => {
    const t = (e, v) => { if (e) e.textContent = v; };
    t(hucre.num, o ? String(o.sira ?? '-') : ''); t(hucre.id, o?.ad || ''); t(hucre.clan, o?.klan || '');
    t(hucre.np, o ? `${o.np ?? 0}${o.son ? ` (+${o.son})` : ''}` : '');
    if (hucre.mark) { hucre.mark.replaceChildren(); const k = o?.id != null ? state?.rutbe?.sembolEl?.(o.id) : null; if (k) hucre.mark.append(k); }
    for (const e of Object.values(hucre)) e?.classList.toggle('rk2-sen', !!o && o.ad === character.name);
  };
  const koCiz = () => {
    if (!KO) return;
    const d = son || { karus: [], elmo: [], ben: null }, ben = d.ben;
    for (const [u, liste, ulus] of [['KA', d.karus || [], 1], ['EL', d.elmo || [], 2]]) {
      const r = KO.satirlar[u], benim = ben && Number(ben.ulus) === ulus && !liste.slice(0, 10).some((o) => o.ad === ben.ad) ? ben : null;
      for (let i = 0; i < 11; i++) koYaz(r[i], i < 10 ? (liste[i] || null) : (benim || liste[10] || null));
    }
    KO.w.style.left = Math.max(0, Math.round((innerWidth - 1027) / 2)) + 'px'; KO.w.style.top = Math.max(0, Math.round((innerHeight - 505) / 2 - 30)) + 'px';
  };
  const ac = () => {
    if (acikMi) return; acikMi = true;
    if (koDeneme == null) koDeneme = koKur().catch(() => false);
    koDeneme.then((ok) => {
      if (!acikMi) return;
      if (ok) { koCiz(); KO.w.hidden = false; return; }
      if (!el) kur(); ciz(); anitYaz(); el.hidden = false;
    });
    yukle().catch(() => {}); clearInterval(t); t = setInterval(() => yukle().catch(() => {}), 1500); clearInterval(t2); t2 = setInterval(anitYaz, 1000);
  };
  const kapat = () => { if (!acikMi) return; acikMi = false; clearInterval(t); clearInterval(t2); if (el) el.hidden = true; if (KO) KO.w.hidden = true; };
  const yazi = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
  // Alt: tarayıcının menü çubuğuna odaklanması (Windows) ve Alt+tık davranışları engellenir
  addEventListener('keydown', (e) => {
    if (e.key !== 'Alt') return;
    e.preventDefault(); if (yazi(e)) return;
    ac();
  }, true);
  addEventListener('keyup', (e) => { if (e.key === 'Alt') { e.preventDefault(); kapat(); } }, true);
  addEventListener('blur', kapat);
  document.addEventListener('visibilitychange', () => { if (document.hidden) kapat(); });
  // öldürme olunca sıralama anında yenilenir (sunucu kaydı için kısa gecikme)
  addEventListener('ko-pvp-oldurme', () => { setTimeout(() => yukle().catch(() => {}), 400); setTimeout(() => yukle().catch(() => {}), 1500); });
  yukle().catch(() => {});   // ilk açılışta tablo dolu gelsin
  return { ac, kapat };
}
