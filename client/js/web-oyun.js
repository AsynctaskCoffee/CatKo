// Web Yönetici paneli → "Oyun Yönetimi": oyun içi GM panelindeki tüm araçlar + Monster Stone, kutu kırma, gem / fragment tabloları.
// Oyun içi gm_* fonksiyonları GM karakterinin kimliğiyle (web_gm_karakter) çağrılır; yetki sunucuda gm_check ile denetlenir.
const NATION = { 1: 'Karus', 2: 'El Morad' };
const SINIFLAR = [[1, 'Savaşçı'], [2, 'Okçu'], [3, 'Büyücü'], [4, 'Rahip'], [13, 'Kurian / Porutu']];
const KAZMA = ['Mattock', 'Golden Mattock', 'Mysterious Ore', 'Mysterious Gold Ore'];
const KUTULAR = [[379154000, 'Red Treasure Chest'], [379155000, 'Green Treasure Chest'], [379156000, 'Blue Treasure Chest'],
  // [Trader] Julia değişimleri
  [814048000, 'Gold Rimmed Blue Treasure Chest (Julia)'], [814050000, 'Cursed Weapon Box (Julia)'], [814049000, 'Cursed Weapon Material Box (Julia)'],
  [931683000, "Dason's Glorious Gift (Julia)"], [931684000, "Dason's Shining Gift (Julia)"], [931685000, "Dason's Delicate Gift (Julia)"], [978026000, "Manes' Orb (Julia)"],
  // Moira → Exchanging accessory box
  [810347000, 'Accessory Box (Moira)'], [508194000, 'Accessory box (Moira, eski)'], [900823000, 'Forgotten Accessory Box (Moira)'], [900824000, 'Advanced Forgotten Accessory Box (Moira)']];
const GEMLER = [[389196000, 'Silvery Gem'], [389197000, 'Red Gem'], [389198000, 'Yellow Gem'], [389199000, 'Blue Gem'], [389201000, 'Green Gem'], [389205000, 'Black Gem']];
const FRAGMENTLER = [[389160000, 'Fragment of Arrogance'], [389161000, 'Fragment of Gluttony'], [389162000, 'Fragment of Rage'], [389163000, 'Fragment of Sloth'], [389164000, 'Fragment of Lechery'], [389165000, 'Fragment of Jealousy'], [389166000, 'Fragment of Avarice']];
const ABYSS = 379106000;

export async function oyunYonetimi(el, { sb, esc, fmt, flash }) {
  const gm = await sb.rpc('web_gm_karakter').then((r) => r.data, () => null);
  if (!gm) { el.innerHTML = '<p class="soluk">Oyun yönetimi için hesabında bir GM karakteri olmalı.</p>'; return; }
  const tarih = (t) => (t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const hata = (e) => String(e?.message || e || 'İşlem yapılamadı.').replace(/^.*?ERROR:\s*/, '');
  // oyun içi GM fonksiyonu (p_char = GM karakteri) ya da web fonksiyonu
  const rpc = async (ad, args = {}, { gmMi = true, basari = null } = {}) => {
    const { data, error } = await sb.rpc(ad, gmMi ? { p_char: gm, ...args } : args);
    if (error) { flash(hata(error)); return null; }
    if (data && typeof data === 'object' && data.ok === false) { flash(data.mesaj || data.reason || 'İşlem yapılamadı.'); return null; }
    if (basari) flash(typeof basari === 'function' ? basari(data) : basari, 'tamam');
    return data ?? true;
  };
  const secenek = (l, s) => l.map(([v, t]) => `<option value="${v}"${String(v) === String(s ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const form = (f, fn) => { f.onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(f)); const x = f.querySelectorAll('button,input,select,textarea'); x.forEach((b) => (b.disabled = true)); try { await fn(d, f); } finally { x.forEach((b) => (b.disabled = false)); } }; };
  const esyaAd = async (num) => (await sb.from('items').select('name').eq('num', num).maybeSingle()).data?.name;

  const SEKMELER = [
    ['sunucu', 'Sunucu'], ['oyuncu', 'Oyuncu Komutları'], ['esya', 'Eşyalar'], ['mob', 'Moblar'], ['ms', 'Monster Stone'],
    ['kutu', 'Kutu Kırma'], ['uretim', 'Üretim (Shozin)'], ['gem', 'Gemler'], ['fragment', 'Fragmentler'], ['maden', 'Madencilik'], ['baslangic', 'Başlangıç'],
    ['dukkan', 'NPC Dükkânları'], ['kule', 'Kuleler'], ['pus', 'Power-Up Store'],
  ];
  el.innerHTML = `<div class="oy-sekmeler">${SEKMELER.map(([k, t], i) => `<button type="button" data-s="${k}" class="${i ? '' : 'secili'}">${t}</button>`).join('')}</div><div class="oy-govde"></div>`;
  const govde = el.querySelector('.oy-govde');
  const ac = async (k) => {
    el.querySelectorAll('.oy-sekmeler button').forEach((b) => b.classList.toggle('secili', b.dataset.s === k));
    govde.innerHTML = '<p class="soluk">Yükleniyor…</p>';
    try { await SAYFA[k](govde); } catch (e) { govde.innerHTML = `<p class="soluk">Yüklenemedi: ${esc(hata(e))}</p>`; }
  };
  el.querySelectorAll('.oy-sekmeler button').forEach((b) => (b.onclick = () => ac(b.dataset.s)));

  const SAYFA = {
    // ───────── sunucu
    async sunucu(g) {
      const [bakim, bas, zones] = await Promise.all([sb.rpc('bakim_durum').then((r) => r.data), rpc('gm_baslangic_ayar', { p_ayar: null }), sb.from('zones').select('id,name,start_x,start_z').order('sort')]);
      g.innerHTML = `
        <div class="gm-bolum"><h4>Bakım modu</h4><p>Durum: <b class="${bakim ? 'kirmizi' : 'gm-on'}">${bakim ? 'Bakımda (oyuncular giremez)' : 'Açık'}</b></p>
          <button class="dugme" data-bakim="${bakim ? '0' : '1'}" type="button">${bakim ? 'Bakımı bitir' : 'Bakıma al'}</button></div>
        <div class="gm-bolum"><h4>Duyuru</h4><form class="gm-form" id="oy-duyuru"><input name="t" required maxlength="200" placeholder="Tüm oyunculara üst duyuru panosunda gösterilir"><button class="dugme">Yayınla</button></form></div>
        <div class="gm-bolum"><h4>Yeni karakter ayarları</h4><form class="gm-form" id="oy-bas">
          <b>Başlangıç seviyesi</b><input name="bas_seviye" type="number" min="1" max="83" value="${bas?.bas_seviye ?? 1}">
          <b>Yetenekler</b><select name="bas_yetenek">${secenek([['kapali', 'Kapalı'], ['acik', 'Açık'], ['usta', 'Usta']], bas?.bas_yetenek)}</select>
          <label><input type="checkbox" name="bas_oto_yetenek" ${bas?.bas_oto_yetenek ? 'checked' : ''}> Oto yetenek puanı</label>
          <label><input type="checkbox" name="bas_oto_stat" ${bas?.bas_oto_stat ? 'checked' : ''}> Oto statü</label>
          <button class="dugme">Kaydet</button></form></div>
        <div class="gm-bolum"><h4>Harita başlangıç (ışınlanma) noktası</h4><form class="gm-form" id="oy-start">
          <select name="zone">${(zones.data || []).map((z) => `<option value="${z.id}" data-x="${z.start_x ?? ''}" data-z="${z.start_z ?? ''}">${esc(z.name)} (${z.id})</option>`).join('')}</select>
          <input name="x" type="number" step="any" required placeholder="X"><input name="z" type="number" step="any" required placeholder="Z"><button class="dugme">Kaydet</button></form></div>
        <div class="gm-bolum"><h4>Krallık</h4><form class="gm-form" id="oy-kral">
          <select name="islem">${secenek([['baslat', 'Seçimi başlat'], ['ilerle', 'Seçimi ilerlet'], ['iptal', 'Seçimi iptal et'], ['sucla_bitir', 'Suçlamayı bitir'], ['kaldir', 'Kralı kaldır'], ['ata', 'Kral ata (isim)'], ['hazine', 'Hazineye ekle (miktar)']], 'baslat')}</select>
          <select name="ulus">${secenek([['', 'Her iki ulus'], [1, 'Karus'], [2, 'El Morad']], '')}</select><input name="ad" placeholder="İsim / miktar (ata, hazine)"><button class="dugme">Uygula</button></form></div>`;
      g.querySelector('[data-bakim]').onclick = async (e) => { if (await rpc('gm_bakim', { p_ac: e.target.dataset.bakim === '1' }, { basari: 'Bakım durumu değişti.' })) ac('sunucu'); };
      form(g.querySelector('#oy-duyuru'), async (d, f) => { if (await rpc('gm_announce', { p_text: d.t }, { basari: 'Duyuru yayınlandı.' })) f.reset(); });
      form(g.querySelector('#oy-bas'), (d) => rpc('gm_baslangic_ayar', { p_ayar: { bas_seviye: String(d.bas_seviye), bas_yetenek: d.bas_yetenek, bas_oto_yetenek: d.bas_oto_yetenek ? '1' : '0', bas_oto_stat: d.bas_oto_stat ? '1' : '0' } }, { basari: 'Başlangıç ayarları kaydedildi.' }));
      const zs = g.querySelector('#oy-start [name=zone]'); const zDol = () => { const o = zs.selectedOptions[0]; g.querySelector('#oy-start [name=x]').value = o?.dataset.x || ''; g.querySelector('#oy-start [name=z]').value = o?.dataset.z || ''; }; zs.onchange = zDol; zDol();
      form(g.querySelector('#oy-start'), (d) => rpc('gm_set_start', { p_zone: d.zone, p_x: Number(d.x), p_z: Number(d.z) }, { basari: 'Başlangıç noktası kaydedildi.' }));
      form(g.querySelector('#oy-kral'), (d) => rpc('gm_kral', { p_islem: d.islem, p_ulus: d.ulus ? Number(d.ulus) : null, p_ad: d.ad || null }, { basari: (r) => 'Krallık: ' + (r?.mesaj || 'işlem yapıldı') }));
    },

    // ───────── oyuncu komutları
    async oyuncu(g) {
      g.innerHTML = `<p class="soluk">Oyuncu adı oyundaki karakter adıdır. Hesap bazlı ceza / ışınlama / envanter için Kullanıcı Yönetimi sekmesini kullan.</p>
        <div class="gm-bolum"><h4>Posta / hediye gönder</h4><form class="gm-form" id="oy-mail">
          <input name="alici" required placeholder="Karakter adı ya da * (herkes)"><input name="konu" maxlength="60" placeholder="Konu (Hediye)">
          <input name="esya" type="number" placeholder="Eşya no (isteğe bağlı)"><input name="adet" type="number" min="1" value="1" placeholder="Adet">
          <input name="metin" maxlength="1000" placeholder="Mesaj"><button class="dugme">Gönder</button></form></div>
        <div class="gm-bolum"><h4>Karakter komutları</h4>
          ${[['np', 'Ulus puanı (NP) ekle / düş', 'Miktar'], ['seviye', 'Seviye ayarla', 'Seviye (1-83)'], ['statu', 'Statü puanı ver', 'Miktar'], ['noah', 'Noah ver / düş', 'Miktar'], ['cash', 'Knight Cash ver / düş', 'Miktar'], ['klan', 'Klan derecesi (klan adı)', 'Derece 1-15']]
            .map(([k, t, p]) => `<form class="gm-form" data-k="${k}"><b>${t}</b><input name="ad" required placeholder="${k === 'klan' ? 'Klan adı' : 'Karakter adı'}"><input name="m" type="number" required placeholder="${p}"><button class="dugme">Uygula</button></form>`).join('')}
          ${[['master', 'Usta (master) yap'], ['esyadb', 'Eşya veritabanı izni (30 dk)'], ['dc', 'Oyundan at (DC)']]
            .map(([k, t]) => `<form class="gm-form" data-k="${k}"><b>${t}</b><input name="ad" required placeholder="Karakter adı"><button class="dugme">Uygula</button></form>`).join('')}
        </div>`;
      form(g.querySelector('#oy-mail'), async (d, f) => {
        if (d.esya && !(await esyaAd(Number(d.esya)))) return flash('Eşya bulunamadı: ' + d.esya);
        if (await rpc('gm_mail', { p_alici: d.alici, p_konu: d.konu || (d.esya ? 'Hediye' : 'Sistem mesajı'), p_metin: d.metin || '', p_esya: d.esya ? Number(d.esya) : null, p_adet: Number(d.adet) || 1 }, { basari: (r) => `${r.gonderilen} posta gönderildi.` })) f.reset();
      });
      const ISLEM = {
        np: (d) => ['gm_np', { p_ad: d.ad, p_miktar: Number(d.m) }, (r) => `${r.ad}: NP ${fmt(r.np)}`],
        seviye: (d) => ['gm_seviye', { p_ad: d.ad, p_seviye: Number(d.m) }, `${d.ad} seviyesi ${d.m} yapıldı.`],
        statu: (d) => ['gm_statu', { p_ad: d.ad, p_miktar: Number(d.m) }, `${d.ad}: statü puanı verildi.`],
        noah: (d) => ['gm_noah', { p_ad: d.ad, p_miktar: Number(d.m) }, (r) => `${d.ad}: Noah ${fmt(r.gold)}`],
        cash: (d) => ['gm_cash_ver', { p_ad: d.ad, p_miktar: Number(d.m) }, (r) => `${r.ad}: KC ${fmt(r.cash)}`],
        klan: (d) => ['gm_klan_derece', { p_ad: d.ad, p_seviye: Number(d.m) }, `${d.ad} klan derecesi ayarlandı.`],
        master: (d) => ['gm_master', { p_ad: d.ad }, `${d.ad} usta yapıldı.`],
        esyadb: (d) => ['gm_esyadb', { p_ad: d.ad }, `${d.ad}: eşya veritabanı izni verildi (30 dk).`],
        dc: (d) => ['gm_dc', { p_ad: d.ad }, (r) => `${r.ad} ${r.oyunda ? 'oyundan atıldı' : 'zaten oyunda değil'}.`],
      };
      g.querySelectorAll('form[data-k]').forEach((f) => form(f, async (d) => { const [ad, args, b] = ISLEM[f.dataset.k](d); if (await rpc(ad, args, { basari: b })) f.reset(); }));
    },

    // ───────── eşyalar
    async esya(g) {
      g.innerHTML = `<div class="sr-filtre"><label class="sr-ara">Eşya ara<input id="oy-eq" placeholder="Ad ya da numara…"></label>
        <label>Göster<select id="oy-ef">${secenek([['hepsi', 'Tümü'], ['ozel', 'Özel eşyalar'], ['silinen', 'Silinenler']], 'hepsi')}</select></label></div>
        <div id="oy-el"></div><div id="oy-ed"></div>`;
      const liste = g.querySelector('#oy-el'), det = g.querySelector('#oy-ed');
      let zam = 0;
      const ara = async () => {
        const q = g.querySelector('#oy-eq').value.trim(), f = g.querySelector('#oy-ef').value;
        if (f === 'silinen') {
          const r = await sb.rpc('esya_silinenler'); const l = r.data || [];
          liste.innerHTML = `<table class="liste"><thead><tr><th>No</th><th>Silinme</th><th>Silen</th><th></th></tr></thead><tbody>${l.map((x) => `<tr><td>${x.num}</td><td>${tarih(x.tarih)}</td><td>${esc(x.silen || '')}</td><td><button class="dugme kucuk" data-geri="${x.num}" type="button">Geri al</button></td></tr>`).join('') || '<tr><td colspan="4" class="bos">Silinen eşya yok.</td></tr>'}</tbody></table>`;
          liste.querySelectorAll('[data-geri]').forEach((b) => (b.onclick = async () => { if (await rpc('gm_esya_geri', { p_num: Number(b.dataset.geri) }, { basari: 'Eşya geri alındı.' })) ara(); }));
          return;
        }
        if (!q && f !== 'ozel') { liste.innerHTML = '<p class="soluk">Aramak için eşya adı ya da numarası yaz.</p>'; return; }
        let s = sb.from('items').select('num,name,kind,item_type,req_level,countable,custom,silindi').order('num').limit(60);
        if (f === 'ozel') s = s.eq('custom', true);
        if (q) s = /^\d+$/.test(q) ? s.eq('num', Number(q)) : s.ilike('name', `%${q}%`);
        const { data } = await s;
        liste.innerHTML = `<table class="liste gm-tablo"><thead><tr><th>No</th><th>Ad</th><th>Tür</th><th>Derece</th><th>Sv</th><th></th></tr></thead><tbody>${(data || []).map((i) => `<tr data-num="${i.num}"><td>${i.num}</td><td><b>${esc(i.name)}</b>${i.custom ? ' <span class="gm-rozet gm">Özel</span>' : ''}${i.silindi ? ' <span class="gm-rozet ban">Silindi</span>' : ''}</td><td>${i.kind}</td><td>${i.item_type}</td><td>${i.req_level ?? ''}</td><td><button class="dugme kucuk" type="button">Seç</button></td></tr>`).join('') || '<tr><td colspan="6" class="bos">Sonuç yok.</td></tr>'}</tbody></table>`;
      };
      const sec = async (num) => {
        const { data: it } = await sb.from('items').select('*').eq('num', num).maybeSingle(); if (!it) return;
        const ALAN = [['name', 'Ad'], ['ad_renk', 'Ad rengi (#hex)'], ['kind', 'Tür (kind)'], ['slot', 'Yuva'], ['item_type', 'Derece'], ['class', 'Sınıf'], ['countable', 'Sayılabilir'], ['damage', 'Saldırı'], ['delay', 'Hız'], ['range', 'Menzil'], ['ac', 'Savunma'],
          ['duration', 'Dayanıklılık'], ['weight', 'Ağırlık'], ['req_level', 'Gerekli sv'], ['str_b', 'STR+'], ['sta_b', 'HP+'], ['dex_b', 'DEX+'], ['intel_b', 'INT+'], ['cha_b', 'MP+'], ['max_hp_b', 'Maks HP+'], ['max_mp_b', 'Maks MP+'],
          ['fire_damage', 'Ateş hasarı'], ['ice_damage', 'Buz hasarı'], ['lightning_damage', 'Yıldırım hasarı'], ['poison_damage', 'Zehir hasarı'], ['fire_r', 'Ateş direnci'], ['cold_r', 'Buz direnci'], ['lightning_r', 'Yıldırım direnci'], ['magic_r', 'Büyü direnci'], ['poison_r', 'Zehir direnci'], ['curse_r', 'Lanet direnci'],
          ['buy_price', 'Alış fiyatı'], ['sell_price', 'Satış fiyatı']];
        det.innerHTML = `<div class="gm-bolum"><h4>${esc(it.name)} <span class="soluk">#${it.num}</span></h4>
          <form class="gm-form" id="oy-ever"><b>Oyuncuya gönder</b><input name="ad" required placeholder="Karakter adı ya da *"><input name="adet" type="number" min="1" value="1"><button class="dugme">Posta ile gönder</button></form>
          ${it.custom ? `<form class="oy-izgara" id="oy-eduz">${ALAN.map(([k, t]) => `<label>${t}<input name="${k}" value="${esc(it[k] ?? '')}"></label>`).join('')}<label class="genis">Açıklama<textarea name="aciklama" rows="2">${esc(it.aciklama || '')}</textarea></label><button class="dugme">Özel eşyayı kaydet</button></form>` : '<p class="soluk">Yalnızca özel (custom) eşyalar düzenlenebilir. Bu eşyayı temel alan yeni bir özel eşya oluşturabilirsin.</p>'}
          <div class="gm-form"><button class="dugme" type="button" data-kopya>Kopyasını özel eşya olarak oluştur</button>${it.silindi ? `<button class="dugme" type="button" data-geri>Geri al</button>` : `<button class="dugme gm-tehlike-d" type="button" data-sil>Eşyayı sil</button>`}</div></div>`;
        form(det.querySelector('#oy-ever'), (d) => rpc('gm_mail', { p_alici: d.ad, p_konu: 'Hediye', p_metin: `${it.name} hediye edildi.`, p_esya: it.num, p_adet: Number(d.adet) || 1 }, { basari: (r) => `${r.gonderilen} postaya eklendi.` }));
        const ed = det.querySelector('#oy-eduz');
        if (ed) form(ed, async (d) => { const v = { ...d, num: it.num }; for (const [k] of ALAN) if (k !== 'name' && k !== 'ad_renk' && v[k] !== '') v[k] = Number(v[k]); if (await rpc('gm_item_save', { p_data: v }, { basari: 'Eşya kaydedildi.' })) sec(it.num); });
        det.querySelector('[data-kopya]').onclick = async () => { const v = { ...it, num: null, custom: true, name: it.name + ' (Özel)' }; delete v.silindi; const r = await rpc('gm_item_save', { p_data: v }, { basari: (x) => `Özel eşya oluşturuldu #${x?.num ?? ''}` }); if (r?.num) sec(r.num); };
        det.querySelector('[data-sil]')?.addEventListener('click', async () => { if (!confirm(`${it.name} silinsin mi? (geri alınabilir)`)) return; if (await rpc('gm_esya_sil', { p_num: it.num }, { basari: 'Eşya silindi.' })) sec(it.num); });
        det.querySelector('[data-geri]')?.addEventListener('click', async () => { if (await rpc('gm_esya_geri', { p_num: it.num }, { basari: 'Eşya geri alındı.' })) sec(it.num); });
        det.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      g.querySelector('#oy-eq').oninput = () => { clearTimeout(zam); zam = setTimeout(ara, 300); };
      g.querySelector('#oy-ef').onchange = ara;
      liste.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-num]'); if (tr) sec(Number(tr.dataset.num)); });
      ara();
    },

    // ───────── moblar
    async mob(g) {
      g.innerHTML = `<div class="sr-filtre"><label class="sr-ara">Mob ara<input id="oy-mq" placeholder="Ad ya da sid…"></label></div><div id="oy-ml"></div><div id="oy-md"></div>`;
      const liste = g.querySelector('#oy-ml'), det = g.querySelector('#oy-md'); let zam = 0;
      const ara = async () => {
        const q = g.querySelector('#oy-mq').value.trim(); if (!q) { liste.innerHTML = '<p class="soluk">Aramak için mob adı ya da sid yaz.</p>'; return; }
        let s = sb.from('monsters').select('sid,name,level,hp,damage,exp,boss,custom').order('level').limit(60);
        s = /^\d+$/.test(q) ? s.eq('sid', Number(q)) : s.ilike('name', `%${q}%`);
        const { data } = await s;
        liste.innerHTML = `<table class="liste gm-tablo"><thead><tr><th>Sid</th><th>Ad</th><th>Sv</th><th class="sag">HP</th><th class="sag">Hasar</th><th class="sag">EXP</th></tr></thead><tbody>${(data || []).map((m) => `<tr data-sid="${m.sid}"><td>${m.sid}</td><td><b>${esc(m.name)}</b>${m.boss ? ' <span class="gm-rozet ban">Boss</span>' : ''}</td><td>${m.level}</td><td class="sag">${fmt(m.hp)}</td><td class="sag">${fmt(m.damage)}</td><td class="sag">${fmt(m.exp)}</td></tr>`).join('') || '<tr><td colspan="6" class="bos">Sonuç yok.</td></tr>'}</tbody></table>`;
      };
      const sec = async (sid) => {
        const [{ data: m }, { data: dr }, { data: sp }] = await Promise.all([sb.from('monsters').select('*').eq('sid', sid).maybeSingle(), sb.from('monster_drops').select('item_num,chance').eq('sid', sid).order('chance', { ascending: false }), sb.from('spawners').select('*').eq('sid', sid).order('zone')]);
        if (!m) return;
        const adlar = new Map(); { const nums = (dr || []).map((d) => d.item_num).filter((n) => n > 0); if (nums.length) (await sb.from('items').select('num,name').in('num', nums)).data?.forEach((i) => adlar.set(i.num, i.name)); }
        const F = ['name', 'level', 'hp', 'damage', 'atk', 'ac', 'hitrate', 'evade', 'exp', 'money', 'attack_range', 'size', 'pid', 'boss'];
        det.innerHTML = `<div class="gm-bolum"><h4>${esc(m.name)} <span class="soluk">sid ${m.sid}</span></h4>
          <form class="oy-izgara" id="oy-mf">${F.map((k) => `<label>${k}<input name="${k}" value="${esc(m[k] ?? '')}"></label>`).join('')}<button class="dugme">Kaydet</button></form></div>
          <div class="gm-bolum"><h4>Düşen eşyalar</h4><table class="liste"><thead><tr><th>Eşya</th><th class="sag">Şans %</th><th></th></tr></thead><tbody>${(dr || []).map((d) => `<tr><td>${d.item_num < 0 ? 'Grup ' + d.item_num : esc(adlar.get(d.item_num) || d.item_num)} <span class="soluk">${d.item_num}</span></td><td class="sag">${d.chance}</td><td><button class="dugme kucuk" data-dkal="${d.item_num}" type="button">Kaldır</button></td></tr>`).join('') || '<tr><td colspan="3" class="bos">Drop yok.</td></tr>'}</tbody></table>
            <form class="gm-form" id="oy-md2"><input name="item" type="number" required placeholder="Eşya no (eksi = grup)"><input name="sans" type="number" step="0.001" min="0.001" max="100" required placeholder="Şans %"><button class="dugme">Ekle / güncelle</button></form></div>
          <div class="gm-bolum"><h4>Doğurucular (${(sp || []).length})</h4><table class="liste"><thead><tr><th>Harita</th><th>X / Z</th><th>Yarıçap</th><th>Adet</th><th>Doğma sn</th><th>Açık</th><th></th></tr></thead><tbody>${(sp || []).map((s) => `<tr data-sp="${s.id}"><td>${esc(s.zone)}</td><td>${Math.round(s.x)} / ${Math.round(s.z)}</td><td><input class="oy-k" name="radius" value="${s.radius}"></td><td><input class="oy-k" name="max_count" value="${s.max_count}"></td><td><input class="oy-k" name="regen_sec" value="${s.regen_sec}"></td><td><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}></td><td><button class="dugme kucuk" data-spk type="button">Kaydet</button> <button class="dugme kucuk" data-sps type="button">Sil</button></td></tr>`).join('') || '<tr><td colspan="7" class="bos">Doğurucu yok.</td></tr>'}</tbody></table>
            <form class="gm-form" id="oy-sp"><b>Yeni doğurucu</b><input name="zone" required placeholder="Harita (ör. moradon)"><input name="x" type="number" step="any" required placeholder="X"><input name="z" type="number" step="any" required placeholder="Z"><input name="radius" type="number" value="10" placeholder="Yarıçap"><input name="max_count" type="number" value="5" placeholder="Adet"><input name="regen_sec" type="number" value="60" placeholder="Doğma sn"><button class="dugme">Ekle</button></form></div>`;
        form(det.querySelector('#oy-mf'), async (d) => { const v = {}; for (const k of F) v[k] = k === 'name' ? d[k] : Number(d[k]); if (await rpc('gm_mob_save', { p_sid: m.sid, p_data: v }, { basari: 'Mob kaydedildi.' })) sec(m.sid); });
        det.querySelectorAll('[data-dkal]').forEach((b) => (b.onclick = async () => { if (await rpc('gm_mob_drop', { p_sid: m.sid, p_item: Number(b.dataset.dkal), p_chance: 0 }, { basari: 'Drop kaldırıldı.' })) sec(m.sid); }));
        form(det.querySelector('#oy-md2'), async (d) => { if (Number(d.item) > 0 && !(await esyaAd(Number(d.item)))) return flash('Eşya bulunamadı.'); if (await rpc('gm_mob_drop', { p_sid: m.sid, p_item: Number(d.item), p_chance: Number(d.sans) }, { basari: 'Drop kaydedildi.' })) sec(m.sid); });
        det.querySelectorAll('tr[data-sp]').forEach((tr) => {
          const id = Number(tr.dataset.sp);
          tr.querySelector('[data-spk]').onclick = async () => { const v = { radius: Number(tr.querySelector('[name=radius]').value), max_count: Number(tr.querySelector('[name=max_count]').value), regen_sec: Number(tr.querySelector('[name=regen_sec]').value), enabled: tr.querySelector('[name=enabled]').checked }; if (await rpc('gm_spawner_save', { p_id: id, p_data: v }, { basari: 'Doğurucu kaydedildi.' })) sec(m.sid); };
          tr.querySelector('[data-sps]').onclick = async () => { if (!confirm('Doğurucu silinsin mi?')) return; if (await rpc('gm_spawner_delete', { p_id: id }, { basari: 'Doğurucu silindi.' })) sec(m.sid); };
        });
        form(det.querySelector('#oy-sp'), async (d) => { const v = { zone: d.zone.trim(), sid: m.sid, x: Number(d.x), z: Number(d.z), radius: Number(d.radius), max_count: Number(d.max_count), regen_sec: Number(d.regen_sec), enabled: true }; if (await rpc('gm_spawner_save', { p_id: null, p_data: v }, { basari: 'Doğurucu eklendi.' })) sec(m.sid); });
        det.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      g.querySelector('#oy-mq').oninput = () => { clearTimeout(zam); zam = setTimeout(ara, 300); };
      liste.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-sid]'); if (tr) sec(Number(tr.dataset.sid)); });
      ara();
    },

    // ───────── Monster Stone
    async ms(g) {
      const v = await rpc('web_gm_ms', {}, { gmMi: false }); if (!v) return;
      g.innerHTML = `<p class="soluk">Oyuncu Monster Stone'u yetenek çubuğundan kullanır; seviyesine uyan ailelerden biri rastgele seçilir ve kendine özel yuvaya ışınlanır. Ailenin tüm canavarları KO konumlarında (deadsoft) doğar; boss ölünce 20 sn sonra, süre bitince ya da kapıdan Moradon'a çıkılır. Toplam ${v.gecmis} giriş · doğurucu havuzu ${v.havuz}.</p>
        <div class="gm-bolum"><h4>Açık yuvalar (${v.ornekler.length})</h4><table class="liste"><thead><tr><th>Oyuncu</th><th>Aile</th><th>Boss</th><th>Canlı</th><th>Başladı</th><th>Bitiş</th><th></th></tr></thead><tbody>${v.ornekler.map((o) => `<tr><td><b>${esc(o.ad)}</b></td><td>${esc(o.aile)}</td><td>${o.boss_oldu ? 'Yenildi' : '—'}</td><td>${o.canli}</td><td>${tarih(o.basladi)}</td><td>${tarih(o.bitis)}</td><td><button class="dugme kucuk" data-kapat="${o.id}" type="button">Kapat</button></td></tr>`).join('') || '<tr><td colspan="7" class="bos">Şu an açık yuva yok.</td></tr>'}</tbody></table></div>
        <div class="gm-bolum"><h4>Harita başlangıç noktaları</h4><p class="soluk">Oyuncu yuvaya bu noktada girer; /town da buraya ışınlar.</p><table class="liste"><thead><tr><th>Harita</th><th>Yuvalar</th><th>X</th><th>Z</th><th></th></tr></thead><tbody>${(v.haritalar || []).map((h) => `<tr data-harita="${h.harita}"><td><b>${esc(h.dosya)}</b></td><td class="soluk">${esc(h.aileler || '')}</td><td><input class="oy-k" name="x" value="${Math.round(h.x * 10) / 10}"></td><td><input class="oy-k" name="z" value="${Math.round(h.z * 10) / 10}"></td><td><button class="dugme kucuk" data-hkay type="button">Kaydet</button></td></tr>`).join('')}</tbody></table></div>
        <div class="gm-bolum"><h4>Aileler (yuvalar)</h4><table class="liste"><thead><tr><th>#</th><th>Ad</th><th>Seviye</th><th>Harita</th><th>Süre dk</th><th>Aktif</th><th>Giriş</th><th></th></tr></thead><tbody>${v.aileler.map((a) => `<tr data-aile="${a.id}"><td>${a.id}</td><td><input class="oy-uz" name="ad" value="${esc(a.ad)}"></td><td><input class="oy-k" name="seviye_min" value="${a.seviye_min}"> – <input class="oy-k" name="seviye_max" value="${a.seviye_max}"></td><td>${esc(a.harita_ad)}</td><td><input class="oy-k" name="sure_dk" value="${a.sure_dk}"></td><td><input type="checkbox" name="aktif" ${a.aktif ? 'checked' : ''}></td><td>${a.toplam}</td><td><button class="dugme kucuk" data-akay type="button">Kaydet</button> <button class="dugme kucuk" data-adrop type="button">Ödül / drop</button></td></tr>`).join('')}</tbody></table></div>
        <div id="oy-msd"></div>`;
      g.querySelectorAll('tr[data-harita]').forEach((tr) => (tr.querySelector('[data-hkay]').onclick = () => rpc('web_gm_ms_harita_kaydet', { p_harita: Number(tr.dataset.harita), p_x: Number(tr.querySelector('[name=x]').value), p_z: Number(tr.querySelector('[name=z]').value) }, { gmMi: false, basari: 'Başlangıç noktası kaydedildi.' })));
      g.querySelectorAll('[data-kapat]').forEach((b) => (b.onclick = async () => { if (!confirm('Yuva kapatılsın mı? Oyuncu önceki yerine ışınlanır.')) return; if (await rpc('web_gm_ms_kapat', { p_ornek: Number(b.dataset.kapat) }, { gmMi: false, basari: 'Yuva kapatıldı.' })) ac('ms'); }));
      g.querySelectorAll('tr[data-aile]').forEach((tr) => {
        const id = Number(tr.dataset.aile);
        tr.querySelector('[data-akay]').onclick = () => rpc('web_gm_ms_aile_kaydet', { p_id: id, p_veri: { ad: tr.querySelector('[name=ad]').value, seviye_min: Number(tr.querySelector('[name=seviye_min]').value), seviye_max: Number(tr.querySelector('[name=seviye_max]').value), sure_dk: Number(tr.querySelector('[name=sure_dk]').value), aktif: tr.querySelector('[name=aktif]').checked } }, { gmMi: false, basari: 'Aile kaydedildi.' });
        tr.querySelector('[data-adrop]').onclick = () => msDrop(id, tr.querySelector('[name=ad]').value);
      });
      const msDrop = async (aile, ad) => {
        const d = await rpc('web_gm_ms_droplar', { p_aile: aile }, { gmMi: false }); if (!d) return;
        const tablo = (l, tur) => `<table class="liste"><thead><tr><th>Eşya</th><th class="sag">Şans %</th>${tur === 'normal' ? '<th class="sag">Mob</th>' : ''}<th></th></tr></thead><tbody>${l.map((x) => `<tr><td>${esc(x.ad)} <span class="soluk">${x.num}</span></td><td class="sag">${x.oran}</td>${tur === 'normal' ? `<td class="sag">${x.mob}</td>` : ''}<td><button class="dugme kucuk" data-tur="${tur}" data-num="${x.num}" type="button">Kaldır</button></td></tr>`).join('') || `<tr><td colspan="4" class="bos">Kayıt yok.</td></tr>`}</tbody></table>
          <form class="gm-form" data-tur="${tur}"><input name="item" type="number" required placeholder="Eşya no (eksi = grup)"><input name="oran" type="number" step="0.001" min="0.001" max="100" required placeholder="Şans %"><button class="dugme">Ekle / güncelle</button></form>`;
        const kutu = g.querySelector('#oy-msd');
        kutu.innerHTML = `<div class="gm-bolum"><h4>${esc(ad)} — Monster Stone ödülleri (boss + hazine sandıkları)</h4>${tablo(d.boss, 'boss')}</div>
          <div class="gm-bolum"><h4>${esc(ad)} — Monster Stone dropları (ailenin tüm canavarları)</h4>${tablo(d.normal, 'normal')}
          <p class="soluk">Canavarlar: ${d.moblar.map((m) => `${esc(m.ad)}${m.boss ? ' (boss)' : ''} sv${m.seviye} ${fmt(m.hp)} HP`).join(' · ')}. İstatistikleri Moblar sekmesinden (sid ile) düzenleyebilirsin.</p></div>`;
        kutu.querySelectorAll('button[data-num]').forEach((b) => (b.onclick = async () => { if (await rpc('web_gm_ms_drop', { p_aile: aile, p_tur: b.dataset.tur, p_item: Number(b.dataset.num), p_oran: 0 }, { gmMi: false, basari: 'Kaldırıldı.' })) msDrop(aile, ad); }));
        kutu.querySelectorAll('form[data-tur]').forEach((f) => form(f, async (x) => { if (Number(x.item) > 0 && !(await esyaAd(Number(x.item)))) return flash('Eşya bulunamadı.'); if (await rpc('web_gm_ms_drop', { p_aile: aile, p_tur: f.dataset.tur, p_item: Number(x.item), p_oran: Number(x.oran) }, { gmMi: false, basari: 'Kaydedildi.' })) msDrop(aile, ad); }));
        kutu.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    },

    // ───────── kutu kırma ([Operator] Moira: hazine sandıkları — KO Item_Exchange)
    // ───────── Shozin Item Combination tarifleri (uretim_tarif). Malzemeler "eşya_no x adet" satırları; oyunda birebir eşleşmeli.
    async uretim(g) {
      const v = await rpc('web_gm_uretim', {}, { gmMi: false }); if (!v) return;
      const l = v.tarifler || [], sn = v.siniflar || [];
      const malzMetin = (m) => (m || []).map((x) => `${x.num} x ${x.adet}`).join('\n');
      const satir = (t) => `<form class="gm-form oy-ur" data-id="${t.id ?? ''}">
        <select name="sinif" title="Kitaptaki sınıf (Compounding Item Class)"><option value="">— Sınıf —</option>${sn.map((c) => `<option value="${c.id}"${Number(c.id) === Number(t.sinif) ? ' selected' : ''}>${esc(c.ad)}</option>`).join('')}</select>
        <input name="ad" placeholder="Ad (boş = sonuç eşyası adı)" value="${esc(t.ad || '')}">
        <input name="sonuc" type="number" required placeholder="Sonuç eşya no" value="${t.sonuc ?? ''}"> <span class="soluk">${esc(t.sonuc_ad || '')}</span>
        <input name="sonuc_adet" type="number" min="1" max="9999" value="${t.sonuc_adet ?? 1}" title="Sonuç adedi">
        <textarea name="malzeme" rows="3" required placeholder="Malzemeler: her satıra eşya_no x adet (en çok 11)">${esc(malzMetin(t.malzeme))}</textarea>
        <input name="sans" type="number" min="0" max="100" value="${t.sans ?? 100}" title="Başarı %">
        <input name="noah" type="number" min="0" value="${t.noah ?? 0}" title="Noah ücreti">
        <input name="sira" type="number" value="${t.sira ?? 0}" title="Sıra">
        <input name="aciklama" placeholder="Kitapta açıklama" value="${esc(t.aciklama || '')}">
        <label><input type="checkbox" name="aktif" ${t.aktif !== false ? 'checked' : ''}> Etkin</label>
        <button class="dugme">${t.id ? 'Kaydet' : 'Ekle'}</button>${t.id ? ' <button class="dugme kucuk" data-sil type="button">Sil</button>' : ''}</form>`;
      g.innerHTML = `<p class="soluk">[Discipline of Heppa] Shozin → Manufacturing → "Yes, please show me your power" ile açılan Item Combination penceresi. Oyuncunun koyduğu malzemeler (eşya ve adet) bir tarifle birebir eşleşirse Noah düşülür, başarı oranına göre sonuç verilir; başarısızlıkta malzemeler gider. Tarifler oyundaki Pathos kitabında (Check Manufacturing recipe / Formula) listelenir.</p>
        <div class="gm-bolum"><h4>Kitap sınıfları (Compounding Item Class)</h4><p class="soluk">Pathos kitabının 2. sayfasındaki liste. İkon: eşya no (boş = KO mor siluet ikonu).</p>
          ${sn.map((c) => `<form class="gm-form oy-us" data-id="${c.id}"><input name="sira" type="number" value="${c.sira}" title="Sıra" style="width:60px"><input name="ad" required value="${esc(c.ad)}"><input name="ikon" type="number" placeholder="İkon eşya no" value="${c.ikon ?? ''}"><button class="dugme kucuk">Kaydet</button> <button class="dugme kucuk" data-sil type="button">Sil</button></form>`).join('')}
          <form class="gm-form oy-us" data-id=""><input name="sira" type="number" value="${sn.length + 1}" style="width:60px"><input name="ad" required placeholder="Yeni sınıf adı"><input name="ikon" type="number" placeholder="İkon eşya no"><button class="dugme kucuk">Ekle</button></form></div>
        ${l.map((t) => `<div class="gm-bolum"><h4>#${t.id} ${esc(t.ad || t.sonuc_ad || '')}</h4>${satir(t)}</div>`).join('') || '<p class="soluk">Tarif yok.</p>'}
        <div class="gm-bolum"><h4>Yeni tarif</h4>${satir({})}</div>`;
      g.querySelectorAll('form.oy-us').forEach((f) => {
        form(f, async (d) => { if (await rpc('web_gm_uretim_sinif', { p_id: f.dataset.id ? Number(f.dataset.id) : null, p_ad: d.ad, p_ikon: d.ikon ? Number(d.ikon) : null, p_sira: Number(d.sira) || 0, p_sil: false }, { gmMi: false, basari: 'Sınıf kaydedildi.' })) ac('uretim'); });
        f.querySelector('[data-sil]')?.addEventListener('click', async () => { if (confirm('Sınıf silinsin mi? (Tarifleri sınıfsız kalır)') && await rpc('web_gm_uretim_sinif', { p_id: Number(f.dataset.id), p_ad: null, p_ikon: null, p_sira: null, p_sil: true }, { gmMi: false, basari: 'Silindi.' })) ac('uretim'); });
      });
      g.querySelectorAll('form.oy-ur').forEach((f) => {
        form(f, async (d) => {
          const malzeme = String(d.malzeme || '').split(/\n+/).map((s) => s.trim()).filter(Boolean).map((s) => { const m = /^(\d+)\s*(?:[x×*]\s*(\d+))?$/i.exec(s); return m ? { num: Number(m[1]), adet: Number(m[2] || 1) } : null; });
          if (!malzeme.length || malzeme.includes(null)) return flash('Malzeme satırları "eşya_no x adet" biçiminde olmalı.');
          if (await rpc('web_gm_uretim_kaydet', { p_id: f.dataset.id ? Number(f.dataset.id) : null, p_ad: d.ad, p_sonuc: Number(d.sonuc), p_sonuc_adet: Number(d.sonuc_adet) || 1, p_malzeme: malzeme,
            p_sans: Number(d.sans), p_noah: Number(d.noah) || 0, p_aciklama: d.aciklama, p_sira: Number(d.sira) || 0, p_aktif: !!d.aktif, p_sinif: d.sinif ? Number(d.sinif) : null }, { gmMi: false, basari: 'Tarif kaydedildi.' })) ac('uretim');
        });
        f.querySelector('[data-sil]')?.addEventListener('click', async () => { if (confirm('Tarif silinsin mi?') && await rpc('web_gm_uretim_sil', { p_id: Number(f.dataset.id) }, { gmMi: false, basari: 'Silindi.' })) ac('uretim'); });
      });
    },
    async kutu(g) { await degisimSayfa(g, KUTULAR, 'Kutu kırma: sandık açılınca önce gruplardan biri rastgele seçilir, sonra grubun içinden oranına göre bir eşya verilir. Oran 0 = pasif.'); },
    // ───────── gemler (Chaotic Generator gemleri + Abyss Gem)
    async gem(g) { await chaoticSayfa(g, GEMLER, true); },
    async fragment(g) { await chaoticSayfa(g, FRAGMENTLER, false); },

    // ───────── madencilik
    async maden(g) {
      const l = await rpc('gm_maden_liste'); if (!l) return;
      g.innerHTML = KAZMA.map((ad, k) => `<div class="gm-bolum"><h4>${ad}</h4><table class="liste"><thead><tr><th>Eşya</th><th class="sag">Adet</th><th class="sag">Şans %</th><th></th></tr></thead><tbody>${l.filter((r) => r.kazma === k).map((r) => `<tr data-id="${r.id}" data-k="${k}" data-num="${r.num}" data-adet="${r.adet}"><td>${esc(r.ad || r.num)} <span class="soluk">${r.num}</span></td><td class="sag">${r.adet}</td><td class="sag"><input class="oy-k" name="oran" value="${Number(r.oran) / 100}"></td><td><button class="dugme kucuk" data-k1 type="button">Kaydet</button> <button class="dugme kucuk" data-k0 type="button">Kaldır</button></td></tr>`).join('') || '<tr><td colspan="4" class="bos">Kayıt yok.</td></tr>'}</tbody></table>
        <form class="gm-form" data-kazma="${k}"><input name="num" type="number" required placeholder="Eşya no"><input name="adet" type="number" value="1" min="1"><input name="yuzde" type="number" step="0.01" min="0.01" max="100" required placeholder="Şans %"><button class="dugme">Ekle</button></form></div>`).join('');
      g.querySelectorAll('tr[data-id]').forEach((tr) => {
        const t = tr.dataset; const kay = (y) => rpc('gm_maden_kaydet', { p_id: Number(t.id), p_kazma: Number(t.k), p_num: Number(t.num), p_yuzde: y, p_adet: Number(t.adet) }, { basari: 'Kaydedildi.' }).then((r) => r && ac('maden'));
        tr.querySelector('[data-k1]').onclick = () => kay(Number(tr.querySelector('[name=oran]').value));
        tr.querySelector('[data-k0]').onclick = () => kay(0);
      });
      g.querySelectorAll('form[data-kazma]').forEach((f) => form(f, async (d) => { if (await rpc('gm_maden_kaydet', { p_id: null, p_kazma: Number(f.dataset.kazma), p_num: Number(d.num), p_yuzde: Number(d.yuzde), p_adet: Number(d.adet) || 1 }, { basari: 'Eklendi.' })) ac('maden'); }));
    },

    // ───────── başlangıç eşyaları / Noah (sınıfa göre)
    async baslangic(g) {
      g.innerHTML = `<div class="sr-filtre"><label>Sınıf<select id="oy-bs">${secenek(SINIFLAR, 1)}</select></label></div><div id="oy-bl"></div>`;
      const ciz = async () => {
        const sinif = Number(g.querySelector('#oy-bs').value);
        const [l, n] = await Promise.all([rpc('gm_start_items', { p_class: sinif }), rpc('gm_start_noah', { p_class: sinif })]);
        const kut = g.querySelector('#oy-bl');
        kut.innerHTML = `<div class="gm-bolum"><form class="gm-form" id="oy-bn"><b>Başlangıç Noah</b><input name="m" type="number" min="0" max="2100000000" value="${n?.noah ?? 0}"><button class="dugme">Kaydet</button></form></div>
          <div class="gm-bolum"><h4>Başlangıç eşyaları</h4><p class="soluk">Yuva 0-13 kuşanılan, 14-41 çanta.</p><table class="liste"><thead><tr><th>Yuva</th><th>Eşya</th><th class="sag">Adet</th><th></th></tr></thead><tbody>${(l || []).map((r) => `<tr><td>${r.slot}</td><td>${esc(r.items?.name || r.item_num)} <span class="soluk">${r.item_num}</span></td><td class="sag">${r.count}</td><td><button class="dugme kucuk" data-temizle="${r.slot}" type="button">Kaldır</button></td></tr>`).join('') || '<tr><td colspan="4" class="bos">Başlangıç eşyası yok.</td></tr>'}</tbody></table>
          <form class="gm-form" id="oy-bi"><input name="slot" type="number" min="0" max="41" required placeholder="Yuva"><input name="item" type="number" required placeholder="Eşya no"><input name="adet" type="number" min="1" value="1"><button class="dugme">Ekle / değiştir</button></form></div>`;
        form(kut.querySelector('#oy-bn'), (d) => rpc('gm_start_noah', { p_class: sinif, p_miktar: Number(d.m) }, { basari: 'Başlangıç Noah kaydedildi.' }));
        kut.querySelectorAll('[data-temizle]').forEach((b) => (b.onclick = async () => { if (await rpc('gm_start_item_set', { p_class: sinif, p_slot: Number(b.dataset.temizle), p_item: null, p_count: 1 }, { basari: 'Kaldırıldı.' })) ciz(); }));
        form(kut.querySelector('#oy-bi'), async (d) => { if (await rpc('gm_start_item_set', { p_class: sinif, p_slot: Number(d.slot), p_item: Number(d.item), p_count: Number(d.adet) || 1 }, { basari: 'Kaydedildi.' })) ciz(); });
      };
      g.querySelector('#oy-bs').onchange = ciz; ciz();
    },

    // ───────── NPC dükkânları
    async dukkan(g) {
      const { data: npcs } = await sb.from('npc_shop').select('npc_id');
      const ids = [...new Set((npcs || []).map((r) => r.npc_id))].sort((a, b) => a - b);
      const { data: ad } = await sb.from('npc_placements').select('npc_id,name').in('npc_id', ids.length ? ids : [0]);
      const adlar = new Map((ad || []).map((r) => [r.npc_id, r.name]));
      g.innerHTML = `<div class="sr-filtre"><label>NPC<select id="oy-dn">${ids.map((i) => `<option value="${i}">${esc(adlar.get(i) || 'NPC')} (${i})</option>`).join('')}</select></label><label>Başka NPC no<input id="oy-dn2" type="number" placeholder="NPC no"></label></div><div id="oy-dl"></div>`;
      const ciz = async () => {
        const npc = Number(g.querySelector('#oy-dn2').value) || Number(g.querySelector('#oy-dn').value); if (!npc) return;
        const { data: l } = await sb.from('npc_shop').select('item_num,price,sira').eq('npc_id', npc).order('sira');
        const nums = (l || []).map((r) => r.item_num); const n2 = new Map(); if (nums.length) (await sb.from('items').select('num,name').in('num', nums)).data?.forEach((i) => n2.set(i.num, i.name));
        const kut = g.querySelector('#oy-dl');
        kut.innerHTML = `<table class="liste"><thead><tr><th>Eşya</th><th class="sag">Fiyat</th><th></th></tr></thead><tbody>${(l || []).map((r) => `<tr data-num="${r.item_num}"><td>${esc(n2.get(r.item_num) || r.item_num)} <span class="soluk">${r.item_num}</span></td><td class="sag"><input class="oy-k" name="fiyat" value="${r.price ?? ''}"></td><td><button class="dugme kucuk" data-dk type="button">Kaydet</button> <button class="dugme kucuk" data-ds type="button">Kaldır</button></td></tr>`).join('') || '<tr><td colspan="3" class="bos">Dükkân boş.</td></tr>'}</tbody></table>
          <form class="gm-form" id="oy-de"><input name="item" type="number" required placeholder="Eşya no"><input name="fiyat" type="number" placeholder="Fiyat (boş = eşyanın fiyatı)"><button class="dugme">Ekle</button></form>`;
        kut.querySelectorAll('tr[data-num]').forEach((tr) => {
          const num = Number(tr.dataset.num);
          tr.querySelector('[data-dk]').onclick = () => rpc('gm_shop_set', { p_npc: npc, p_item: num, p_price: Number(tr.querySelector('[name=fiyat]').value) || null }, { basari: 'Kaydedildi.' });
          tr.querySelector('[data-ds]').onclick = async () => { if (await rpc('gm_shop_del', { p_npc: npc, p_item: num }, { basari: 'Kaldırıldı.' })) ciz(); };
        });
        form(kut.querySelector('#oy-de'), async (d) => { if (await rpc('gm_shop_set', { p_npc: npc, p_item: Number(d.item), p_price: d.fiyat ? Number(d.fiyat) : null }, { basari: 'Eklendi.' })) ciz(); });
      };
      g.querySelector('#oy-dn').onchange = () => { g.querySelector('#oy-dn2').value = ''; ciz(); };
      g.querySelector('#oy-dn2').onchange = ciz; ciz();
    },

    // ───────── kuleler
    async kule(g) {
      const { data: l } = await sb.from('towers').select('*').order('zone').order('id');
      g.innerHTML = `<table class="liste"><thead><tr><th>#</th><th>Harita</th><th>Ulus</th><th>X / Z</th><th>Hasar</th><th>Menzil</th><th></th></tr></thead><tbody>${(l || []).map((t) => `<tr data-id="${t.id}"><td>${t.id}</td><td>${esc(t.zone)}</td><td><select name="ulus">${secenek([[0, 'Tarafsız'], [1, 'Karus'], [2, 'El Morad']], t.nation)}</select></td><td><input class="oy-k" name="x" value="${Math.round(t.x)}"> <input class="oy-k" name="z" value="${Math.round(t.z)}"></td><td><input class="oy-k" name="hasar" value="${t.damage}"></td><td><input class="oy-k" name="menzil" value="${t.range}"></td><td><button class="dugme kucuk" data-tk type="button">Kaydet</button> <button class="dugme kucuk" data-ts type="button">Sil</button></td></tr>`).join('') || '<tr><td colspan="7" class="bos">Kule yok.</td></tr>'}</tbody></table>
        <div class="gm-bolum"><h4>Yeni kule</h4><form class="gm-form" id="oy-ty"><input name="zone" required placeholder="Harita"><select name="ulus">${secenek([[1, 'Karus'], [2, 'El Morad'], [0, 'Tarafsız']], 1)}</select><input name="x" type="number" step="any" required placeholder="X"><input name="z" type="number" step="any" required placeholder="Z"><input name="hasar" type="number" value="500" placeholder="Hasar"><input name="menzil" type="number" value="20" placeholder="Menzil"><button class="dugme">Ekle</button></form></div>`;
      g.querySelectorAll('tr[data-id]').forEach((tr) => {
        const id = Number(tr.dataset.id), v = (n) => tr.querySelector(`[name=${n}]`).value;
        tr.querySelector('[data-tk]').onclick = () => rpc('gm_tower_update', { p_id: id, p_nation: Number(v('ulus')), p_x: Number(v('x')), p_z: Number(v('z')), p_dir: null, p_damage: Number(v('hasar')), p_range: Number(v('menzil')), p_model: null }, { basari: 'Kule kaydedildi.' });
        tr.querySelector('[data-ts]').onclick = async () => { if (!confirm('Kule silinsin mi?')) return; if (await rpc('gm_tower_delete', { p_id: id }, { basari: 'Kule silindi.' })) ac('kule'); };
      });
      form(g.querySelector('#oy-ty'), async (d) => { if (await rpc('gm_tower_create', { p_zone: d.zone.trim(), p_nation: Number(d.ulus), p_x: Number(d.x), p_z: Number(d.z), p_dir: 0, p_damage: Number(d.hasar), p_range: Number(d.menzil), p_model: null }, { basari: 'Kule eklendi.' })) ac('kule'); });
    },

    // ───────── Power-Up Store (oyundaki mağaza; GM düzenleme çubuğuyla)
    async pus(g) {
      g.innerHTML = `<div class="gm-bolum"><h4>Power-Up Store</h4><p>Mağaza oyundakiyle aynı görünümde açılır; GM çubuğundan eşya ekleyebilir, fiyat / başlık düzenleyebilir, standart görünüme döndürebilirsin. Oyuncular aynı mağazayı sitedeki <b>Mağaza</b> sayfasından da kullanır (alınanlar posta kutusuna gider).</p>
        <a class="dugme" href="magaza.html?gm=1" target="_blank" rel="noopener">Mağazayı GM modunda aç</a></div>`;
    },
  };

  // Kutu kırma tablosu (sandik_degisim): grup + sıra + eşya + oran
  async function degisimSayfa(g, liste, aciklama, secili = liste[0][0]) {
    g.innerHTML = `<p class="soluk">${aciklama}</p><div class="sr-filtre"><label>Kutu<select id="oy-ks">${secenek(liste, secili)}</select></label></div><div id="oy-kl"></div>`;
    const ciz = async () => {
      const sandik = Number(g.querySelector('#oy-ks').value);
      const l = await rpc('web_gm_sandik', { p_sandik: sandik }, { gmMi: false }); if (!l) return;
      const gruplar = [...new Set(l.map((r) => r.id))];
      const kut = g.querySelector('#oy-kl');
      kut.innerHTML = `<p class="soluk">${gruplar.length} grup · ${l.length} satır</p>` + gruplar.map((gid) => `<div class="gm-bolum"><h4>Grup ${gid}</h4><table class="liste"><thead><tr><th>Sıra</th><th>Eşya</th><th class="sag">Oran</th><th class="sag">Pay %</th><th></th></tr></thead><tbody>${l.filter((r) => r.id === gid).map((r) => `<tr data-g="${gid}" data-s="${r.sira}"><td>${r.sira}</td><td>${esc(r.ad || r.num)} <span class="soluk">${r.num}</span></td><td class="sag"><input class="oy-k" name="oran" value="${r.oran}"></td><td class="sag">${r.pay ?? '—'}</td><td><button class="dugme kucuk" data-kk type="button">Kaydet</button></td></tr>`).join('')}</tbody></table>
        <form class="gm-form" data-g="${gid}"><input name="item" type="number" required placeholder="Eşya no"><input name="oran" type="number" min="1" required placeholder="Oran (ağırlık)"><button class="dugme">Gruba ekle</button></form></div>`).join('')
        + `<div class="gm-bolum"><h4>Yeni grup</h4><form class="gm-form" data-g=""><input name="item" type="number" required placeholder="Eşya no"><input name="oran" type="number" min="1" required placeholder="Oran (ağırlık)"><button class="dugme">Yeni grup oluştur</button></form></div>`;
      kut.querySelectorAll('tr[data-g]').forEach((tr) => (tr.querySelector('[data-kk]').onclick = async () => { if (await rpc('web_gm_sandik_kaydet', { p_sandik: sandik, p_id: Number(tr.dataset.g), p_sira: Number(tr.dataset.s), p_item: null, p_oran: Number(tr.querySelector('[name=oran]').value) || 0 }, { gmMi: false, basari: 'Kaydedildi.' })) ciz(); }));
      kut.querySelectorAll('form[data-g]').forEach((f) => form(f, async (d) => { if (!(await esyaAd(Number(d.item)))) return flash('Eşya bulunamadı.'); if (await rpc('web_gm_sandik_kaydet', { p_sandik: sandik, p_id: f.dataset.g ? Number(f.dataset.g) : null, p_sira: null, p_item: Number(d.item), p_oran: Number(d.oran) }, { gmMi: false, basari: 'Eklendi.' })) ciz(); }));
    };
    g.querySelector('#oy-ks').onchange = ciz; ciz();
  }

  // Chaotic Generator (gem / fragment): eşya + oran (toplam içindeki pay)
  async function chaoticSayfa(g, liste, gemMi) {
    g.innerHTML = `<p class="soluk">Chaotic Generator: ${gemMi ? 'gem' : 'fragment'} verilince listeden ağırlığına göre bir eşya çıkar. Oran, toplam içindeki paydır (%).${gemMi ? ' Abyss Gem (Moira) ayrıca kutu kırma tablosundadır.' : ''}</p>
      <div class="sr-filtre"><label>${gemMi ? 'Gem' : 'Fragment'}<select id="oy-cs">${secenek(gemMi ? [...liste, [ABYSS, 'Abyss Gem (Moira)']] : liste, liste[0][0])}</select></label></div><div id="oy-cl"></div>`;
    const ciz = async () => {
      const kaynak = Number(g.querySelector('#oy-cs').value), kut = g.querySelector('#oy-cl');
      if (kaynak === ABYSS) { await degisimSayfa(kut, [[ABYSS, 'Abyss Gem']], 'Abyss Gem ([Operator] Moira): önce grup, sonra gruptaki eşya oranına göre seçilir.'); return; }
      const l = await rpc('web_gm_chaotic', { p_kaynak: kaynak }, { gmMi: false }); if (!l) return;
      kut.innerHTML = `<table class="liste"><thead><tr><th>Eşya</th><th>Derece</th><th class="sag">Ağırlık</th><th class="sag">Oran %</th><th></th></tr></thead><tbody>${l.map((r) => `<tr data-num="${r.num}"><td>${esc(r.ad || r.num)} <span class="soluk">${r.num}</span></td><td>${r.derece}</td><td class="sag">${r.agirlik}</td><td class="sag"><input class="oy-k" name="oran" value="${r.oran}"></td><td><button class="dugme kucuk" data-ck type="button">Kaydet</button> <button class="dugme kucuk" data-cs type="button">Kaldır</button></td></tr>`).join('') || '<tr><td colspan="5" class="bos">Liste boş.</td></tr>'}</tbody></table>
        <form class="gm-form" id="oy-ce"><input name="item" type="number" required placeholder="Eşya no"><input name="oran" type="number" step="0.001" min="0.001" max="99.9" required placeholder="Oran %"><button class="dugme">Ekle</button></form>`;
      kut.querySelectorAll('tr[data-num]').forEach((tr) => {
        const num = Number(tr.dataset.num);
        tr.querySelector('[data-ck]').onclick = async () => { if (await rpc('gm_chaotic_oran', { p_kaynak: kaynak, p_item: num, p_oran: Number(tr.querySelector('[name=oran]').value) }, { basari: (r) => `${r.ad}: %${r.oran}` })) ciz(); };
        tr.querySelector('[data-cs]').onclick = async () => { if (await rpc('gm_chaotic_cikar', { p_kaynak: kaynak, p_item: num }, { basari: 'Kaldırıldı.' })) ciz(); };
      });
      form(kut.querySelector('#oy-ce'), async (d) => { if (await rpc('gm_chaotic_oran', { p_kaynak: kaynak, p_item: Number(d.item), p_oran: Number(d.oran) }, { basari: (r) => `${r.ad} eklendi: %${r.oran}` })) ciz(); });
    };
    g.querySelector('#oy-cs').onchange = ciz; ciz();
  }

  void NATION;
  await ac('sunucu');
}
