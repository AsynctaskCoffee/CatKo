// Web sitesi: tek "Sıralamalar" sayfası (filtreli) + GM Yönetici paneli (kullanıcı yönetimi + KC kodları).
// Sunucu: web_siralama (herkese açık), web_gm_* (yalnızca GM; web_gm_mi kontrolü sunucuda).
let C = null;   // panel.js bağlamı: sb, $, esc, fmt, flash, go, hashParam, oturum, loading
export const panelBagla = (c) => { C = c; };

const NATION = { 1: 'Karus', 2: 'El Morad' };
const SINIF = { 1: 'Savaşçı', 2: 'Okçu', 3: 'Büyücü', 4: 'Rahip', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Enchanter', 11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Uzman Kurian', 15: 'Usta Kurian' };
const SINIF_GRUP = [['', 'Tüm sınıflar'], [1, 'Savaşçı (Berserker / Guardian)'], [2, 'Okçu (Hunter / Penetrator)'], [3, 'Büyücü (Sorcerer / Enchanter)'], [4, 'Rahip (Shaman / Dark Priest)'], [13, 'Kurian / Porutu']];
const tarih = (t) => (t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const secenek = (liste, sec) => liste.map(([v, t]) => `<option value="${v}"${String(v) === String(sec ?? '') ? ' selected' : ''}>${t}</option>`).join('');

// ═════════════ SIRALAMALAR
export async function siralamaSayfa(el) {
  const { esc, fmt, hashParam } = C;
  const hp = hashParam();
  const f = { tur: hp.get('tur') === 'klan' ? 'klan' : 'oyuncu', ulus: hp.get('ulus') || '', sinif: hp.get('sinif') || '', olcut: hp.get('olcut') || 'seviye', ara: '', limit: 100 };
  el.innerHTML = `<div class="baslik-yazi">Sıralamalar</div>
    <div class="sr-sekme"><button data-tur="oyuncu">Oyuncu Sıralaması</button><button data-tur="klan">Clan Sıralaması</button></div>
    <form class="sr-filtre" onsubmit="return false">
      <label>Ulus<select name="ulus">${secenek([['', 'Tüm uluslar'], [1, 'Karus'], [2, 'El Morad (Human)']], f.ulus)}</select></label>
      <label class="sr-oyuncu">Sınıf<select name="sinif">${secenek(SINIF_GRUP, f.sinif)}</select></label>
      <label class="sr-oyuncu">Ölçüt<select name="olcut">${secenek([['seviye', 'Seviye / EXP'], ['np', 'Ulus Puanı (toplam)'], ['np_ay', 'Aylık Ulus Puanı']], f.olcut)}</select></label>
      <label>Göster<select name="limit">${secenek([[25, 'İlk 25'], [50, 'İlk 50'], [100, 'İlk 100'], [250, 'İlk 250']], f.limit)}</select></label>
      <label class="sr-ara">Ara<input name="ara" placeholder="Karakter ya da clan adı…" autocomplete="off"></label>
    </form>
    <div id="sr-ozet" class="soluk"></div><div id="sr-tablo">${C.loading}</div>`;
  const form = el.querySelector('.sr-filtre');
  let zam = 0, sira = 0;
  const yukle = async () => {
    const n = ++sira;
    el.querySelectorAll('.sr-sekme button').forEach((b) => b.classList.toggle('secili', b.dataset.tur === f.tur));
    el.querySelectorAll('.sr-oyuncu').forEach((x) => (x.hidden = f.tur === 'klan'));
    const { data, error } = await C.sb.rpc('web_siralama', { p_tur: f.tur, p_ulus: f.ulus ? Number(f.ulus) : null, p_sinif: f.sinif ? Number(f.sinif) : null, p_olcut: f.olcut, p_ara: f.ara || null, p_limit: Number(f.limit) });
    if (n !== sira) return;
    const t = el.querySelector('#sr-tablo');
    if (error) { t.innerHTML = '<p class="soluk">Sıralama yüklenemedi.</p>'; return; }
    const rows = data || [];
    const filtre = [f.ulus && NATION[f.ulus], f.tur === 'oyuncu' && f.sinif && SINIF_GRUP.find(([v]) => String(v) === f.sinif)?.[1].split(' (')[0], f.ara && `“${f.ara}”`].filter(Boolean).join(' · ');
    el.querySelector('#sr-ozet').textContent = `${rows.length} kayıt${filtre ? ' · ' + filtre : ''}`;
    if (f.tur === 'klan') {
      t.innerHTML = `<table class="liste"><thead><tr><th class="no">#</th><th>Clan</th><th>Ulus</th><th>Lider</th><th class="sag">Üye</th><th class="sag">Ort. Sv</th><th class="sag">Ulus Puanı</th><th class="sag">Clan Puanı</th></tr></thead><tbody>${
        rows.length ? rows.map((r) => `<tr class="${r.sira <= 3 ? 'ilk' : ''}"><td class="no">${r.sira}</td><td><b>${esc(r.ad)}</b></td><td class="ulus-${r.ulus}">${esc(NATION[r.ulus] || '')}</td><td>${esc(r.lider || '—')}</td><td class="sag">${r.uye}</td><td class="sag">${r.ort ?? '—'}</td><td class="sag">${fmt(r.np)}</td><td class="sag"><b>${fmt(r.puan)}</b></td></tr>`).join('')
        : '<tr><td colspan="8" class="bos">Bu filtreye uyan clan yok.</td></tr>'}</tbody></table>`;
    } else {
      const vurgu = (k) => (f.olcut === k ? ' sr-vurgu' : '');
      t.innerHTML = `<table class="liste"><thead><tr><th class="no">#</th><th>Karakter</th><th>Clan</th><th>Ulus</th><th>Sınıf</th><th class="sag${vurgu('seviye')}">Seviye</th><th class="sag${vurgu('np')}">Ulus Puanı</th><th class="sag${vurgu('np_ay')}">Aylık NP</th></tr></thead><tbody>${
        rows.length ? rows.map((r) => `<tr class="${r.sira <= 3 ? 'ilk' : ''}"><td class="no">${r.sira}</td><td><b>${esc(r.ad)}</b>${r.kral ? ' <span class="sr-kral" title="Kral">Kral</span>' : ''}</td><td>${esc(r.klan || '—')}</td><td class="ulus-${r.ulus}">${esc(NATION[r.ulus] || '')}</td><td>${esc(SINIF[r.sinif] || '')}</td><td class="sag${vurgu('seviye')}">${r.seviye}</td><td class="sag${vurgu('np')}">${fmt(r.np)}</td><td class="sag${vurgu('np_ay')}">${fmt(r.np_ay)}</td></tr>`).join('')
        : '<tr><td colspan="8" class="bos">Bu filtreye uyan karakter yok.</td></tr>'}</tbody></table>`;
    }
  };
  form.addEventListener('change', () => { Object.assign(f, Object.fromEntries(new FormData(form))); yukle(); });
  form.ara.addEventListener('input', () => { f.ara = form.ara.value.trim(); clearTimeout(zam); zam = setTimeout(yukle, 300); });
  el.querySelectorAll('.sr-sekme button').forEach((b) => b.addEventListener('click', () => { f.tur = b.dataset.tur; yukle(); }));
  await yukle();
}

// ═════════════ YÖNETİCİ PANELİ
export async function yoneticiSayfa(el) {
  const { sb, esc, fmt, flash } = C;
  if (!C.oturum()) return C.go('giris');
  el.innerHTML = `<div class="baslik-yazi">Yönetici paneli</div>
    <div class="sr-sekme gm-sekme"><button data-s="kullanici" class="secili">Kullanıcı Yönetimi</button><button data-s="oyun">Oyun Yönetimi</button><button data-s="kc">KC Kod Yönetimi</button></div>
    <div id="gm-kullanici"><div class="sr-filtre gm-ara">
      <label class="sr-ara">Ara<input id="gm-q" placeholder="Hesap, e-posta ya da karakter…" autocomplete="off"></label>
      <label>Durum<select id="gm-f">${secenek([['', 'Tümü'], ['oyunda', 'Oyunda'], ['ban', 'Banlı'], ['sustur', 'Susturulmuş'], ['gm', 'GM']], '')}</select></label>
      <button class="dugme gm-yenile" type="button">Yenile</button></div>
      <div id="gm-say" class="soluk"></div><div id="gm-liste">${C.loading}</div></div>
    <div id="gm-oyun" hidden></div><div id="gm-kc" hidden></div>`;
  let kcYuklendi = false, oyunYuklendi = false;
  el.querySelectorAll('.gm-sekme button').forEach((b) => b.addEventListener('click', async () => {
    el.querySelectorAll('.gm-sekme button').forEach((x) => x.classList.toggle('secili', x === b));
    el.querySelector('#gm-kullanici').hidden = b.dataset.s !== 'kullanici'; el.querySelector('#gm-kc').hidden = b.dataset.s !== 'kc'; el.querySelector('#gm-oyun').hidden = b.dataset.s !== 'oyun';
    if (b.dataset.s === 'oyun' && !oyunYuklendi) {
      oyunYuklendi = true; const { oyunYonetimi } = await import('./web-oyun.js');
      await oyunYonetimi(el.querySelector('#gm-oyun'), { sb, esc, fmt, flash });
    }
    if (b.dataset.s === 'kc' && !kcYuklendi) {
      kcYuklendi = true; const k = el.querySelector('#gm-kc');
      k.innerHTML = `<p class="soluk">Oyuncular kodları oyunda Power-Up Store → <b>Kod Yükle</b> ile kullanır; her hesap bir kodu bir kez kullanabilir.</p><div id="kc-alan">${C.loading}</div>`;
      const { kcKodYonetim } = await import('./kc-kod.js');
      await kcKodYonetim(k.querySelector('#kc-alan'), sb, { tema: 'acik', bildir: (m, t) => flash(m, t === 'hata' ? 'hata' : 'tamam') });
    }
  }));

  let data = [], haritalar = null, acik = null;
  const yukle = async () => {
    const { data: d, error } = await sb.rpc('web_gm_kullanicilar');
    if (error) { el.querySelector('#gm-liste').innerHTML = `<p class="soluk">${/GM/.test(error.message) ? 'Bu bölüm yalnızca GM\'ler içindir.' : 'Kullanıcılar yüklenemedi.'}</p>`; return false; }
    data = d || []; ciz(); if (acik) { const u = data.find((x) => x.id === acik.id); if (u) detay(u, acik.kar); else kapat(); }
    return true;
  };
  const rozet = (u) => [u.gm && '<span class="gm-rozet gm">GM</span>', u.cezalar.some((z) => z.tur === 'ban') && '<span class="gm-rozet ban">Banlı</span>',
    u.cezalar.some((z) => z.tur === 'sustur') && '<span class="gm-rozet sus">Susturuldu</span>', u.karakterler.some((c) => c.oyunda) && '<span class="gm-rozet on">Oyunda</span>'].filter(Boolean).join(' ');
  function ciz() {
    const q = el.querySelector('#gm-q').value.trim().toLocaleLowerCase('tr'), fl = el.querySelector('#gm-f').value;
    const rows = data.filter((u) => (!q || [u.hesap, u.eposta, ...u.karakterler.map((c) => c.ad)].some((s) => String(s || '').toLocaleLowerCase('tr').includes(q)))
      && (!fl || (fl === 'oyunda' ? u.karakterler.some((c) => c.oyunda) : fl === 'gm' ? u.gm : u.cezalar.some((z) => z.tur === fl))));
    el.querySelector('#gm-say').textContent = `${rows.length} / ${data.length} kullanıcı · ${data.reduce((a, u) => a + u.karakterler.length, 0)} karakter · ${data.filter((u) => u.karakterler.some((c) => c.oyunda)).length} oyunda`;
    el.querySelector('#gm-liste').innerHTML = `<table class="liste gm-tablo"><thead><tr><th class="no">#</th><th>Hesap</th><th>Karakterler</th><th>Durum</th><th>Son giriş</th><th></th></tr></thead><tbody>${
      rows.length ? rows.map((u, i) => `<tr data-id="${u.id}"><td class="no">${i + 1}</td><td><b>${esc(u.hesap)}</b><br><span class="soluk">${esc(u.eposta || '')}</span></td>
        <td>${u.karakterler.length ? u.karakterler.map((c) => `<span class="ulus-${c.ulus}">${c.oyunda ? '● ' : ''}${esc(c.ad)}</span> <span class="soluk">${c.seviye} ${esc(SINIF[c.sinif] || '')}</span>`).join('<br>') : '<span class="soluk">—</span>'}</td>
        <td>${rozet(u) || '<span class="soluk">—</span>'}</td><td>${tarih(u.son_giris)}</td><td><button class="dugme kucuk gm-yonet" type="button">Yönet</button></td></tr>`).join('')
      : '<tr><td colspan="6" class="bos">Kullanıcı bulunamadı.</td></tr>'}</tbody></table>`;
  }
  el.querySelector('#gm-q').addEventListener('input', ciz);
  el.querySelector('#gm-f').addEventListener('change', ciz);
  el.querySelector('.gm-yenile').addEventListener('click', () => yukle().then((ok) => ok && flash('Liste yenilendi.', 'tamam')));
  el.querySelector('#gm-liste').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; const u = data.find((x) => x.id === tr.dataset.id); if (u) detay(u); });

  // ── kullanıcı detayı (pencere)
  const kutu = document.createElement('div'); kutu.className = 'gm-modal'; kutu.hidden = true; document.body.append(kutu);
  const kapat = () => { kutu.hidden = true; kutu.innerHTML = ''; acik = null; };
  kutu.addEventListener('click', (e) => { if (e.target === kutu) kapat(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !kutu.hidden) kapat(); });
  addEventListener('hashchange', () => { kapat(); kutu.remove(); }, { once: true });

  const rpc = async (ad, args, basari) => {
    const { data: r, error } = await sb.rpc(ad, args);
    if (error) { flash(error.message.replace(/^.*?ERROR:\s*/, '')); return null; }
    if (basari) flash(typeof basari === 'function' ? basari(r) : basari, 'tamam');
    await yukle(); return r;
  };

  async function detay(u, karId = null) {
    if (!haritalar) { const { data: h } = await sb.rpc('web_gm_haritalar'); haritalar = h || []; }
    const kar = u.karakterler.find((c) => c.id === karId) || u.karakterler[0] || null;
    acik = { id: u.id, kar: kar?.id ?? null };
    const SURE = [[30, '30 dakika'], [60, '1 saat'], [360, '6 saat'], [1440, '1 gün'], [4320, '3 gün'], [10080, '7 gün'], [43200, '30 gün'], [0, 'Kalıcı']];
    kutu.innerHTML = `<div class="gm-pencere" role="dialog" aria-label="Kullanıcı yönetimi">
      <button class="gm-x" type="button" aria-label="Kapat">×</button>
      <h3>${esc(u.hesap)} ${rozet(u)}</h3>
      <p class="soluk">${esc(u.eposta || '')} · Kayıt: ${tarih(u.kayit)} · Son giriş: ${tarih(u.son_giris)}</p>

      <div class="gm-bolum"><h4>Cezalar</h4>
        ${u.cezalar.length ? `<table class="liste"><thead><tr><th>Tür</th><th>Neden</th><th>Bitiş</th><th>Veren</th><th></th></tr></thead><tbody>${u.cezalar.map((z) => `<tr><td>${z.tur === 'ban' ? '<b class="kirmizi">Ban</b>' : '<b>Susturma</b>'}</td><td>${esc(z.neden || '—')}</td><td>${z.bitis ? tarih(z.bitis) : 'Kalıcı'}</td><td>${esc(z.gm || '')}</td><td><button class="dugme kucuk" data-kaldir="${z.id}" type="button">Kaldır</button></td></tr>`).join('')}</tbody></table>` : '<p class="soluk">Aktif ceza yok.</p>'}
        ${u.gm ? '<p class="soluk">GM hesaplarına ceza verilemez.</p>' : `<form class="gm-form" id="gm-ceza">
          <select name="tur">${secenek([['sustur', 'Sohbetten sustur'], ['ban', 'Hesabı banla']], 'sustur')}</select>
          <select name="sure">${secenek(SURE, 1440)}</select>
          <input name="neden" required maxlength="300" placeholder="Neden (oyuncuya gösterilir)">
          <button class="dugme">Uygula</button></form>`}
      </div>

      <div class="gm-bolum"><h4>Karakterler</h4>
        ${u.karakterler.length ? `<div class="gm-kar-sekme">${u.karakterler.map((c) => `<button type="button" data-kar="${c.id}" class="${c.id === kar?.id ? 'secili' : ''} ulus-${c.ulus}">${c.oyunda ? '● ' : ''}${esc(c.ad)}</button>`).join('')}</div>` : '<p class="soluk">Bu hesabın karakteri yok.</p>'}
        ${kar ? `<div class="gm-kar">
          <p><b class="ulus-${kar.ulus}">${esc(kar.ad)}</b> · ${esc(NATION[kar.ulus])} · Lv ${kar.seviye} ${esc(SINIF[kar.sinif] || '')} ${kar.gm ? '· <b class="gm-yazi">GM</b>' : ''}<br>
          Konum: <b>${esc(kar.bolge)}</b> (${kar.x}, ${kar.z}) · Noah: <b>${fmt(kar.gold)}</b> · KC: <b>${fmt(kar.cash)}</b> · ${kar.oyunda ? '<b class="gm-on">Oyunda</b>' : `Son: ${tarih(kar.son)}`}</p>
          <div class="gm-islemler">
            <form class="gm-form" id="gm-isinla"><b>Işınla</b>
              <select name="zone">${haritalar.map((h) => `<option value="${esc(h.id)}" data-x="${h.x ?? ''}" data-z="${h.z ?? ''}"${h.id === kar.bolge ? ' selected' : ''}>${esc(h.ad || h.id)}</option>`).join('')}</select>
              <input name="x" type="number" step="any" required placeholder="X" value="${kar.x}"><input name="z" type="number" step="any" required placeholder="Z" value="${kar.z}">
              <button class="dugme">Işınla</button></form>
            <form class="gm-form" id="gm-noah"><b>Noah</b><input name="m" type="number" required placeholder="Miktar (eksi = düş)"><button class="dugme">Gönder</button></form>
            <form class="gm-form" id="gm-kc"><b>Knight Cash</b><input name="m" type="number" required placeholder="Miktar (eksi = düş)"><button class="dugme">Gönder</button></form>
          </div>
          <div class="gm-env-baslik"><h4>Envanter</h4><span class="soluk">Oyundaki çanta penceresi · 2 dakikada bir kendiliğinden yenilenir</span> <button class="dugme kucuk" type="button" id="gm-env-yenile">Şimdi yenile</button></div>
          <iframe class="gm-env" src="envanter.html?c=${kar.id}" title="${esc(kar.ad)} envanteri" loading="lazy"></iframe>
          ${kar.gm ? '' : `<form class="gm-form gm-tehlike" id="gm-kar-sil"><b>Karakteri sil</b><input name="onay" required placeholder="Onay için karakter adını yaz: ${esc(kar.ad)}"><button class="dugme">Karakteri sil</button></form>`}
        </div>` : ''}
      </div>
      ${u.gm ? '' : `<div class="gm-bolum gm-tehlike"><h4>Hesabı sil</h4><p class="soluk">Hesap kapatılır, tüm karakterleri silinir ve hesap kalıcı olarak yasaklanır.</p>
        <form class="gm-form" id="gm-hesap-sil"><input name="neden" maxlength="300" placeholder="Neden"><input name="onay" required placeholder="Onay için hesap adını yaz: ${esc(u.hesap)}"><button class="dugme">Hesabı sil</button></form></div>`}
    </div>`;
    kutu.hidden = false;
    const $k = (s) => kutu.querySelector(s);
    $k('.gm-x').onclick = kapat;
    kutu.querySelectorAll('[data-kar]').forEach((b) => (b.onclick = () => detay(u, Number(b.dataset.kar))));
    kutu.querySelectorAll('[data-kaldir]').forEach((b) => (b.onclick = () => rpc('web_gm_ceza_kaldir', { p_id: Number(b.dataset.kaldir) }, 'Ceza kaldırıldı.')));
    const form = (id, fn) => { const f = $k(id); if (f) f.onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(f)); f.querySelectorAll('button,input,select').forEach((x) => (x.disabled = true)); try { await fn(d); } finally { f.querySelectorAll('button,input,select').forEach((x) => (x.disabled = false)); } }; };
    form('#gm-ceza', (d) => rpc('web_gm_ceza_ver', { p_owner: u.id, p_tur: d.tur, p_dakika: Number(d.sure) || null, p_neden: d.neden }, d.tur === 'ban' ? 'Hesap banlandı; oyundaysa oyundan atıldı.' : 'Oyuncu susturuldu.'));
    if (kar) {
      const z = $k('#gm-isinla [name=zone]');
      z.onchange = () => { const o = z.selectedOptions[0]; if (o?.dataset.x) { $k('#gm-isinla [name=x]').value = Math.round(o.dataset.x); $k('#gm-isinla [name=z]').value = Math.round(o.dataset.z); } };
      form('#gm-isinla', (d) => rpc('web_gm_isinla', { p_char: kar.id, p_zone: d.zone, p_x: Number(d.x), p_z: Number(d.z) }, `${kar.ad} ışınlandı${kar.oyunda ? ' (oyunda yeni konuma taşınıyor)' : ''}.`));
      form('#gm-noah', (d) => rpc('web_gm_noah', { p_char: kar.id, p_miktar: Number(d.m) }, (r) => `${r.ad}: Noah ${fmt(r.gold)} oldu.`));
      form('#gm-kc', (d) => rpc('web_gm_kc', { p_char: kar.id, p_miktar: Number(d.m) }, (r) => `${r.ad}: Knight Cash ${fmt(r.cash)} oldu.`));
      form('#gm-kar-sil', (d) => { if (d.onay.trim() !== kar.ad) return flash('Onay için karakter adını aynen yazmalısın.'); return rpc('web_gm_karakter_sil', { p_char: kar.id }, (r) => `${r.ad} silindi.`); });
      const fr = $k('.gm-env');
      $k('#gm-env-yenile').onclick = () => fr.contentWindow?.envanterYenile?.();
      addEventListener('message', function boy(e) { if (!fr.isConnected) return removeEventListener('message', boy); if (e.source === fr.contentWindow && e.data?.tur === 'envanter-boy') fr.style.height = e.data.h + 'px'; });
    }
    form('#gm-hesap-sil', (d) => { if (d.onay.trim() !== u.hesap) return flash('Onay için hesap adını aynen yazmalısın.'); return rpc('web_gm_hesap_sil', { p_owner: u.id, p_neden: d.neden }, (r) => `Hesap silindi (${r.karakter} karakter).`); });
  }
  await yukle();
}
