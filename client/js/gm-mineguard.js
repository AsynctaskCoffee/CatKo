// GM paneli → MineGuard: ceza takip ve şüphe sistemi.
//  Genel bakış: son 24 saat / 7 gün olaylar, tür dağılımı, en şüpheli hesaplar (şüphe skoru + ceza puanı)
//  Şüpheli olaylar: süzgeç (durum, tür, ad); her olay için ceza puanı ver / yoksay / incelendi
//  Ceza puanları: hesap bazında toplam, kayıtlar, kaydı kaldır (af), oyuncuya puan ver
//  Kurallar: MineGuard aç/kapat, eşikler (puan → yasak süresi), tür başına otomatik ceza ve puan, ticaret / pazar / gelir eşikleri, küfür listesi
// Sunucu: gm_mg_ozet / gm_mg_olaylar / gm_mg_olay_islem / gm_mg_cezalar / gm_mg_ceza_ver / gm_mg_ceza_kaldir / gm_mg_ayar.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const MG_TUR = {
  otomasyon: ['Otomasyon (bot)', 'navigator.webdriver / başsız tarayıcı'], enjeksiyon: ['Yazılım enjeksiyonu', 'tarayıcıya ait olmayan (güvenilmez) tuş / fare olayları'],
  makro: ['Makro', 'insan olmayacak kadar düzenli tuş / tık aralıkları'], hiz: ['İnsanüstü hız', 'saniyede 25+ eylem'], kufur: ['Küfür / hakaret', 'sohbette yasaklı sözcük'],
  trade: ['Anlamsız ticaret', 'yabancıya karşılıksız büyük Noah aktarımı'], pazar: ['Pazarda fahiş fiyat', 'değersiz eşyaya çok yüksek fiyat'], pazar_al: ['Fahiş fiyatlı alışveriş', 'gizli para aktarımı şüphesi'],
  gelir: ['Olağandışı gelir', 'saatlik Noah artışı eşiği aştı'], gelir_akisi: ['Aynı gelir akışı', 'çok hesaptan tek hesaba karşılıksız aktarım'], dupe: ['Dupe şüphesi', 'bir hesapta aynı eşsiz eşyadan olağandışı çok'],
};
const tarih = (t) => (t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const detayYaz = (d) => Object.entries(d || {}).filter(([k]) => k !== 'zaman').map(([k, v]) => `${esc(k)}: <b>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</b>`).join(' · ');

export function initGmMineGuard({ sb, character, hud, acOyuncu, mod = null }) {
  let pazar = null, pAra = '';
  const akis = { ara: '', kar: '', liste: null, uid: null, detay: null, karakter: null, f: { kat: '', konum: '', bas: '', bit: '', min_sahip: '', tip: '' }, sira: { k: 'son', y: -1 } };
  let kok = null, alt = mod === 'akis' ? 'akis' : 'ozet', ozet = null, olaylar = null, cezalar = null, ayar = null, suz = { durum: 'yeni', tur: '', ara: '' }, acik = null, onay = null;
  const rpc = async (fn, a = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...a }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };
  function kur() {
    kok = document.createElement('div'); kok.className = 'g2-gomulu mg2';
    kok.addEventListener('click', tikla); kok.addEventListener('change', degisti);
    kok.addEventListener('input', (e) => { if (e.target.dataset.s === 'pazar-ara') { pAra = e.target.value.trim(); clearTimeout(kur.p); kur.p = setTimeout(async () => { pazar = await rpc('gm_mg_pazar', { p_ara: pAra || null }).catch(() => null); ciz(); const i = kok.querySelector('[data-s=pazar-ara]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 350); return; } if (e.target.dataset.s === 'ara') { suz.ara = e.target.value.trim(); clearTimeout(kur.t); kur.t = setTimeout(olayYukle, 300); } });
    kok.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && /^iz-/.test(e.target.dataset?.s || '')) kok.querySelector('[data-a="iz-ara"]')?.click(); });
    yukle();
  }
  async function yukle() {
    if (alt === 'ozet') ozet = await rpc('gm_mg_ozet').catch(() => null);
    if (alt === 'olay') return olayYukle();
    if (alt === 'akis') { if (!akis.liste && !akis.karakter) akis.liste = await rpc('gm_iz_ara', { p_ara: '', p_limit: 300, p_filtre: null }).catch(() => []); }
    if (alt === 'ceza') cezalar = await rpc('gm_mg_cezalar', { p_ara: null }).catch(() => null);
    if (alt === 'kural' || alt === 'pazar') ayar = await rpc('gm_mg_ayar', { p_veri: null }).catch(() => null);
    if (alt === 'pazar') pazar = await rpc('gm_mg_pazar', { p_ara: pAra || null }).catch(() => null);
    ciz();
  }
  async function olayYukle() { olaylar = await rpc('gm_mg_olaylar', { p_durum: suz.durum || null, p_tur: suz.tur || null, p_ara: suz.ara || null, p_limit: 300 }).catch(() => null); ciz(); }
  const sekme = () => mod === 'akis' ? `<div class="mg2-bas"><span class="mg2-logo">Eşya takibi</span><span class="mg2-alt-not">MineGuard</span><button data-a="yenile" class="mg2-yenile">↻</button></div>` : `<div class="mg2-bas"><span class="mg2-logo">MineGuard</span><div class="g2-alt">${[['ozet', 'Genel bakış'], ['olay', 'Şüpheli olaylar'], ['ceza', 'Ceza puanları'], ['pazar', 'Pazar koruması'], ['kural', 'Kurallar']].map(([k, a]) => `<button data-alt="${k}" class="${alt === k ? 'secili' : ''}">${a}</button>`).join('')}</div><button data-a="yenile" class="mg2-yenile">↻</button></div>`;
  function ciz() {
    if (!kok) return;
    let h = sekme();
    if (alt === 'ozet') h += ozetHtml(); else if (alt === 'akis') h += akisHtml(); else if (alt === 'olay') h += olayHtml(); else if (alt === 'ceza') h += cezaHtml(); else if (alt === 'pazar') h += pazarHtml(); else h += kuralHtml();
    kok.innerHTML = h;
    if (alt === 'akis') requestAnimationFrame(boyutla);
  }
  // (3.11) eşya akışı listeleri GM penceresinin altına kadar uzanır ve kendi dikey kaydırma çubuğuyla kayar
  function boyutla() {
    if (!kok?.isConnected) return;
    const pen = kok.closest('#gm-pencere, .ko-pencere') || null, alt = Math.min(innerHeight, pen ? pen.getBoundingClientRect().bottom : innerHeight) - 12;
    for (const el of kok.querySelectorAll('.mg2-iz-liste, .mg2-tablo')) { const r = el.getBoundingClientRect(); el.style.maxHeight = Math.max(140, Math.floor(alt - r.top)) + 'px'; el.style.overflowY = 'auto'; }
  }
  addEventListener('resize', () => { if (alt === 'akis') boyutla(); });
  function ozetHtml() {
    const o = ozet; if (!o) return '<div class="g2-bos">Yükleniyor…</div>';
    const kutu = (ad, v, ek = '') => `<div class="mg2-kutu ${ek}"><b>${Number(v || 0).toLocaleString('tr-TR')}</b><span>${ad}</span></div>`;
    const turlar = Object.entries(o.turler || {}).sort((a, b) => b[1] - a[1]);
    return `<div class="mg2-durum ${o.ayar?.aktif === false ? 'kapali' : ''}"><i></i>${o.ayar?.aktif === false ? 'MineGuard kapalı — olaylar kaydedilmiyor.' : 'MineGuard etkin — oyun, sohbet, ticaret, pazar ve gelir akışı izleniyor.'}</div>
      <div class="mg2-kutular">${kutu('İncelenmemiş olay', o.yeni, 'kirmizi')}${kutu('Son 24 saat', o.gun)}${kutu('Son 7 gün', o.hafta)}${kutu('Otomatik ceza (7 gün)', o.otomatik_ceza)}${kutu('MineGuard yasağı (etkin)', o.yasak, 'kirmizi')}</div>
      <div class="mg2-iki"><div class="g2-bolum"><div class="g2-bas">Tür dağılımı (7 gün)</div>${turlar.map(([t, n]) => { const mx = turlar[0][1] || 1; return `<div class="mg2-cubuk"><span>${esc(MG_TUR[t]?.[0] || t)}</span><i style="--w:${Math.round(n / mx * 100)}%"></i><b>${n}</b></div>`; }).join('') || '<p class="ay-not">Kayıt yok.</p>'}</div>
        <div class="g2-bolum"><div class="g2-bas">En şüpheli hesaplar (7 gün)</div>${(o.supheliler || []).map((s) => `<div class="mg2-supheli" data-oy="${s.char_id}"><b>${esc(s.ad)}</b><span>şüphe <em>${s.skor}</em> · ${s.olay} olay · ceza ${s.ceza}</span><i>${tarih(s.son)}</i></div>`).join('') || '<p class="ay-not">Şüpheli hesap yok.</p>'}</div></div>`;
  }
  function olayHtml() {
    const L = olaylar;
    return `<div class="mg2-suz"><select data-s="durum"><option value="">Tüm durumlar</option>${[['yeni', 'İncelenmemiş'], ['cezali', 'Cezalandırıldı'], ['incelendi', 'İncelendi'], ['yoksay', 'Yok sayıldı']].map(([k, a]) => `<option value="${k}" ${suz.durum === k ? 'selected' : ''}>${a}</option>`).join('')}</select>
        <select data-s="tur"><option value="">Tüm türler</option>${Object.entries(MG_TUR).map(([k, [a]]) => `<option value="${k}" ${suz.tur === k ? 'selected' : ''}>${a}</option>`).join('')}</select><input data-s="ara" placeholder="Oyuncu adı…" value="${esc(suz.ara)}"><span>${L ? L.length : '…'} olay</span></div>
      <div class="mg2-tablo">${L ? L.map((o) => `<div class="mg2-olay ${o.durum}${acik === o.id ? ' acik' : ''}" data-olay="${o.id}">
          <span class="mg2-tur t-${o.tur}">${esc(MG_TUR[o.tur]?.[0] || o.tur)}</span><b>${esc(o.ad)}</b><span class="mg2-skor">şüphe ${o.skor}${o.adet > 1 ? ` · ×${o.adet}` : ''}</span><span class="mg2-dur">${{ yeni: 'İncelenmemiş', cezali: `Cezalı (${o.puan})`, incelendi: 'İncelendi', yoksay: 'Yok sayıldı' }[o.durum] || o.durum}${o.otomatik ? ' · oto' : ''}</span><i>${tarih(o.son_at)}</i>
          ${acik === o.id ? `<div class="mg2-olay-detay"><p>${esc(MG_TUR[o.tur]?.[1] || '')}</p><p class="mg2-kv">${detayYaz(o.detay) || '—'}</p>
            <div class="mg2-islem"><input type="number" min="1" max="100" value="3" data-p="${o.id}"><button data-a="cezala" data-id="${o.id}" class="g2-tehlike">${onay === 'c' + o.id ? 'Onayla' : 'Ceza puanı ver'}</button><button data-a="incelendi" data-id="${o.id}">İncelendi</button><button data-a="yoksay" data-id="${o.id}">Yok say</button><button data-oy="${o.char_id}">Oyuncuyu aç</button>${o.detay?.takas ? `<button data-a="takas-gor" data-id="${Number(o.detay.takas)}" class="g2-ana">Takas görseli</button>` : ''}${o.inceleyen ? `<span>inceleyen: ${esc(o.inceleyen)}</span>` : ''}</div></div>` : ''}</div>`).join('') || '<div class="g2-bos">Olay yok.</div>' : '<div class="g2-bos">Yükleniyor…</div>'}</div>`;
  }
  function cezaHtml() {
    const L = cezalar;
    return `<p class="ay-not">Ceza puanları hesap başınadır (tüm karakterler). Toplam eşiklere ulaşınca hesap otomatik yasaklanır ve sohbette "… ceza puanından dolayı sunucudan uzaklaştırıldı." duyurulur. Kayıt kaldırılırsa (af) toplam düşer.</p>
      <div class="mg2-tablo">${L ? L.map((c) => `<div class="mg2-hesap"><div class="mg2-hesap-bas"><b>${esc(c.karakterler || '—')}</b>${c.yasakli ? '<em class="go2-rozet ban">Yasaklı</em>' : ''}<span class="mg2-puan">${c.toplam || 0} puan</span></div>
          ${(c.kayit || []).map((z) => `<div class="mg2-kayit${z.aktif ? '' : ' pasif'}"><b>+${z.puan}</b><span>${esc(z.neden || '')}</span><i>${z.kaynak === 'mineguard' ? 'MineGuard' : esc(z.gm || 'GM')} · ${esc(z.ad || '')} · ${tarih(z.zaman)}</i>${z.aktif ? `<button data-a="kaldir" data-id="${z.id}">${onay === 'k' + z.id ? 'Onayla' : 'Kaldır (af)'}</button>` : '<em>kaldırıldı</em>'}</div>`).join('')}</div>`).join('') || '<div class="g2-bos">Ceza puanı kaydı yok.</div>' : '<div class="g2-bos">Yükleniyor…</div>'}</div>`;
  }
  function pazarHtml() {
    const a = ayar || {}, b = Number(a.pazar_bant) || 10, L = pazar;
    const yaz = (v) => Number(v || 0).toLocaleString('tr-TR');
    return `<div class="mg2-durum ${a.pazar_koruma === false ? 'kapali' : ''}"><i></i>${a.pazar_koruma === false ? 'Pazar koruması kapalı.' : `Pazar koruması etkin: bir eşya, pazarda satılan fiyatlarının ortalamasının ${b} katı üstüne ya da ${b} katı altına (Noah ve KC ayrı) konamaz.`}</div>
      <div class="g2-bolum"><div class="g2-form mg2-form"><label class="g2-tik"><input type="checkbox" data-pk="pazar_koruma" ${a.pazar_koruma !== false ? 'checked' : ''}> Pazar koruması açık</label>
        <label>Bant (kat)<input type="number" data-pk="pazar_bant" min="2" max="1000" value="${b}"></label><label>Ortalama için en az örnek<input type="number" data-pk="pazar_ornek" min="1" max="100" value="${a.pazar_ornek ?? 3}"></label></div>
        <p class="ay-not">Ortalama: son 60 günün pazar satışları (adet ağırlıklı birim fiyat). Satış yetersizse diğer satıcıların açık ilanları da sayılır; örnek sayısı yetmezse eşya serbesttir. GM'ler kısıtlanmaz.</p>
        <div class="g2-dugmeler"><button data-a="pazar-kaydet" class="g2-ana">Kaydet</button></div></div>
      <div class="mg2-suz"><input data-s="pazar-ara" placeholder="Eşya adı ya da numarası…" value="${esc(pAra)}"><span>${L ? L.length : '…'} eşya</span></div>
      <div class="mg2-tablo"><div class="mg2-pz mg2-pz-bas"><span>Eşya</span><span>Para</span><span>Ortalama</span><span>İzin verilen aralık</span><span>Satış</span><span>En az / en çok</span><span>Açık ilan</span></div>
        ${L ? L.map((x) => `<div class="mg2-pz"><span><b>${esc(x.ad || '#' + x.num)}</b><i>#${x.num}</i></span><span>${x.kc ? 'KC' : 'Noah'}</span><span><b>${yaz(x.ort)}</b></span><span>${yaz(Math.ceil(x.ort / b))} – ${yaz(Math.floor(x.ort * b))}</span><span>${x.satis} (${yaz(x.adet)} adet)</span><span>${yaz(x.en_az)} / ${yaz(x.en_cok)}</span><span>${x.ilan}</span></div>`).join('') || '<div class="g2-bos">Son 60 günde pazar satışı yok.</div>' : '<div class="g2-bos">Yükleniyor…</div>'}</div>`;
  }
  // (3.11) Eşya akışı: her eşya örneği (uid) drop / satın alma anından beri izlenir — kime geçti, ne yapıldı (upgrade, yanma, çöp, satış, pazar, takas, banka, posta)
  const KAYNAK = { loot_take: 'Drop sandığından aldı', loot_oto: 'Drop sandığından aldı (oto)', loot_cop: 'Drop sandığından aldı', pet_topla: 'Pet topladı', peri_topla: 'Peri topladı', _esya_dus: 'Drop',
    shop_buy: 'NPC tüccar', shop_sell: 'NPC tüccara sattı', esyadb_al: 'Power-up Store', kira_al: 'Kiralık eşya', pazar_al: 'Pazar', pazar_ac: 'Pazar tezgâhı', _pazar_kapat_ic: 'Pazar kapandı',
    takas_onay: 'Takas', inv_destroy: 'Çöpe attı', npc_upgrade: 'Upgrade', ors_yukselt: 'Örs upgrade', genie_hammer: 'Genie hammer', depo_koy: 'Banka', depo_koy2: 'Banka', depo_al: 'Banka', depo_al2: 'Banka',
    mail_gonder2: 'Posta', mail_esya_al: 'Posta', gm_give_item: 'GM verdi', gorev_teslim: 'Görev', _gorev_teslim_eski: 'Görev', create_character: 'Başlangıç eşyası', chaotic_uret2: 'Chaotic Generator',
    uretim_yap: 'Üretim', donusum_yap: 'Dönüşüm', maden_kaz: 'Madencilik', pitman_cevher: 'Madencilik', pitman_kazma: 'Madencilik', shozin_kazma: 'Madencilik', baslangic: 'Takip başlangıcı', dogrudan: 'Doğrudan', irk_degistir: 'Irk değişimi' };
  function olayAd(e) {
    const k = e.kaynak, gir = e.olay === 'giris' || e.olay === 'artti', cik = e.olay === 'cikis' || e.olay === 'azaldi', kar = e.karsi_ad ? ` <b>${esc(e.karsi_ad)}</b>` : '';
    if (e.olay === 'mevcut') return ['bilgi', 'Takip başladığında mevcuttu'];
    if (e.olay === 'donusum') return ['upg', `${k === 'npc_upgrade' || k === 'ors_yukselt' || k === 'genie_hammer' ? 'Upgrade başarılı' : 'Dönüştü'}: ${esc(e.eski_ad || '#' + e.eski_num)} → ${esc(e.yeni_ad || '#' + e.item_num)}`];
    if (['loot_take', 'loot_oto', 'loot_cop', 'pet_topla', 'peri_topla', '_esya_dus'].includes(k) && gir) return ['drop', KAYNAK[k]];
    if (k === 'shop_buy' && gir) return ['al', 'NPC tüccardan satın aldı'];
    if (k === 'shop_sell' && cik) return ['sat', 'NPC tüccara sattı'];
    if ((k === 'esyadb_al' || k === 'kira_al') && gir) return ['al', KAYNAK[k] + ' — satın aldı'];
    if (k === 'pazar_al') return gir ? ['al', 'Pazardan satın aldı' + (kar ? ' ← satıcı' + kar : '')] : ['sat', 'Pazarda sattı'];
    if (k === 'pazar_ac') return e.tablo === 'merchant_items' ? ['pazar', 'Pazar tezgâhına kondu'] : ['pazar', 'Pazara koydu'];
    if (k === '_pazar_kapat_ic') return ['pazar', e.tablo === 'merchant_items' ? 'Tezgâhtan kalktı' : 'Pazardan geri aldı'];
    if (k === 'takas_onay') return gir ? ['takas', 'Takasla aldı' + (kar ? ' ← ' + kar : '')] : ['takas', 'Takasla verdi'];
    if (k === 'inv_destroy') return ['yok', 'Çöpe attı'];
    if ((k === 'npc_upgrade' || k === 'ors_yukselt' || k === 'genie_hammer') && cik) return ['yok', 'Upgrade başarısız — yandı'];
    if (k?.startsWith('depo_')) return e.tablo === 'depo' ? ['banka', gir ? 'Bankaya kondu' : 'Bankadan çıktı'] : ['banka', gir ? 'Bankadan aldı' : 'Bankaya koydu'];
    if (k === 'mail_gonder2' && cik) return ['takas', 'Posta ile gönderdi'];
    if (k === 'mail_esya_al' && gir) return ['takas', 'Postadan aldı'];
    if (k === 'gm_give_item') return ['gm', 'GM verdi'];
    if (k === 'gm_iz_sil') return ['yok', 'GM kaldırdı'];
    if (k === 'gorev_teslim' || k === '_gorev_teslim_eski') return [gir ? 'al' : 'sat', gir ? 'Görev ödülü' : 'Görev için teslim etti'];
    return [gir ? 'al' : cik ? 'sat' : 'bilgi', `${KAYNAK[k] || k || ''} — ${{ giris: 'eklendi', cikis: 'kaldırıldı', artti: 'arttı', azaldi: 'azaldı', aktarim: 'aktarıldı' }[e.olay] || e.olay}`];
  };
  const konumAd = (k) => (!k ? '—' : k.yer === 'yok' ? '<em class="mg2-iz-yok">Artık yok</em>' : `${{ kusanili: 'Üzerinde', canta: 'Çantada', depo: 'Bankada', pazar: 'Pazar tezgâhında' }[k.yer] || k.yer}: <b>${esc(k.ad || '?')}</b>`);
  const sahip = (e) => (e.ad ? `<a data-kar="${esc(e.ad)}">${esc(e.ad)}</a>` : e.hesap_ad ? `<span title="Banka (hesap)">${esc(e.hesap_ad)}</span>` : '—');
  // (3.11) eşya simgeleri (KO ikonları): görünen eşya numaraları yüklenir, gelince yeniden çizilir
  const IKON = new Map(); let E_MOD = null, ikonBekle = false;
  const ikon = (num, b = 30) => { const it = IKON.get(Number(num)); return it && E_MOD ? `<span class="mg2-ikon">${E_MOD.iconHtml(it, b)}</span>` : '<span class="mg2-ikon bos"></span>'; };
  async function ikonYukle() {
    if (ikonBekle) return; const nums = new Set();
    const ekle = (e) => { if (!e) return; for (const k of ['item_num', 'eski_num']) if (e[k] && !IKON.has(Number(e[k]))) nums.add(Number(e[k])); };
    for (const x of akis.liste || []) { ekle(x.ilk); ekle(x.sonolay); }
    for (const e of akis.detay?.olaylar || []) ekle(e);
    for (const e of akis.karakter?.olaylar || []) ekle(e);
    if (!nums.size) return;
    ikonBekle = true;
    try {
      E_MOD ||= await import('./esya.js');
      const L = [...nums]; for (let i = 0; i < L.length; i += 200) { const { data } = await sb.from('items').select('*').in('num', L.slice(i, i + 200)); for (const r of data || []) IKON.set(Number(r.num), E_MOD.fromDb(r)); }
      for (const n of L) if (!IKON.has(n)) IKON.set(n, { Kind: 0 });
    } catch {} finally { ikonBekle = false; }
    if (alt === 'akis') ciz();
  }
  const IZ_KAT = { drop: 'Drop sandığı', npc: 'NPC tüccar (al / sat)', store: 'Power-up Store / kiralık', pazar: 'Pazar', takas: 'Takas', upgrade: 'Upgrade (başarılı)', yanma: "Upgrade'de yandı", cop: 'Çöpe atıldı', banka: 'Banka', posta: 'Posta', gm: 'GM (verdi / kaldırdı)', gorev: 'Görev', mevcut: 'Takip başlangıcı', diger: 'Diğer' };
  function akisHtml() {
    setTimeout(ikonYukle, 0);
    const F = akis.f, sec = (k, L) => `<select data-f="${k}">${L.map(([v, t]) => `<option value="${v}" ${String(F[k]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    const ust = `<div class="mg2-suz mg2-iz-suz"><input data-s="iz-ara" placeholder="Eşya adı, eşya no ya da UID…" value="${esc(akis.ara)}"><input data-s="iz-kar" placeholder="Karakter adı…" value="${esc(akis.kar)}">
        ${sec('kat', [['', 'Tüm olay türleri'], ...Object.entries(IZ_KAT)])}${sec('konum', [['', 'Her konum'], ['kusanili', 'Üzerinde'], ['canta', 'Çantada'], ['depo', 'Bankada'], ['pazar', 'Pazar tezgâhında'], ['yok', 'Artık yok']])}
        ${sec('tip', [['', 'Her derece'], ['0', 'Normal'], ['1', 'Magic'], ['2', 'Rare'], ['3', 'Craft'], ['4', 'Unique'], ['5', 'Upgrade'], ['12', 'Reverse / Rebirth']])}
        <label>Başlangıç<input type="date" data-f="bas" value="${esc(F.bas)}"></label><label>Bitiş<input type="date" data-f="bit" value="${esc(F.bit)}"></label>
        <label>En az sahip<input type="number" min="0" max="50" data-f="min_sahip" value="${esc(F.min_sahip)}" style="width:52px"></label>
        <button data-a="iz-ara" class="g2-ana">Ara</button><button data-a="iz-temizle">Temizle</button>
        <span>${akis.karakter ? `${esc(akis.karakter.ad)}: ${akis.karakter.olaylar?.length || 0} olay` : akis.liste ? akis.liste.length + ' eşya' : '…'}</span></div>
      <p class="ay-not">Her eşya örneği drop sandığından, tüccardan, pazardan ya da Power-up Store'dan alındığı andan itibaren izlenir: kime geçtiği (takas, pazar, posta, banka), upgrade, yanma, çöp ve satış. Satıra tıklayınca eşyanın tüm geçmişi açılır. Sütun başlıklarına tıklayarak sıralayabilirsin.</p>`;
    if (akis.detay) {
      const d = akis.detay, o = d.olaylar || [], ilk = o[0];
      return ust + `<div class="g2-bolum mg2-iz"><div class="g2-bas"><button data-a="iz-geri">←</button> ${ikon(o[o.length - 1]?.item_num || ilk?.item_num, 34)} Eşya #${d.uid} · ${esc(o[o.length - 1]?.esya || ilk?.esya || '')} <span class="mg2-iz-konum">${konumAd(d.konum)}</span>${d.konum?.yer && d.konum.yer !== 'yok' ? `<button data-a="iz-sil" data-id="${d.uid}" class="g2-tehlike mg2-iz-sil">${onay === 's' + d.uid ? 'Onayla — sil' : 'Eşyayı kaldır'}</button>` : ''}</div>
        <div class="mg2-iz-zincir">${[...new Set(o.map((e) => e.ad || e.hesap_ad).filter(Boolean))].map((a) => `<span>${esc(a)}</span>`).join('<i>→</i>') || '—'}</div>
        <div class="mg2-iz-liste">${o.map((e) => { const [t, ad] = olayAd(e); return `<div class="mg2-iz-satir t-${t}"><i>${tarih(e.zaman)}</i><span class="mg2-iz-rozet">${ad}</span><span>${sahip(e)}</span><span class="mg2-iz-ad">${ikon(e.item_num, 26)}<span>${esc(e.esya || '#' + e.item_num)}${e.adet > 1 ? ' ×' + e.adet : ''}</span></span></div>`; }).join('')}</div></div>`;
    }
    if (akis.karakter) {
      const o = akis.karakter.olaylar || [];
      return ust + `<div class="g2-bolum mg2-iz"><div class="g2-bas"><button data-a="iz-geri">←</button> ${esc(akis.karakter.ad)} — eşya hareketleri</div><div class="mg2-iz-liste">${o.map((e) => { const [t, ad] = olayAd(e);
        return `<div class="mg2-iz-satir t-${t}" data-uid="${e.uid ?? ''}"><i>${tarih(e.zaman)}</i><span class="mg2-iz-rozet">${ad}</span><span>${sahip(e)}${e.karsi_ad && e.karsi_ad !== e.ad ? ' · ' + esc(e.karsi_ad) : ''}</span><span class="mg2-iz-ad">${ikon(e.item_num, 26)}<span>${esc(e.esya || '#' + e.item_num)}${e.adet > 1 ? ' ×' + e.adet : ''}</span></span></div>`; }).join('') || '<div class="g2-bos">Kayıt yok.</div>'}</div></div>`;
    }
    const S = akis.sira, ok = (k) => (S.k === k ? (S.y > 0 ? ' ▲' : ' ▼') : '');
    const deger = (x, k) => (k === 'ad' ? String(x.sonolay?.esya || x.ilk?.esya || '').toLowerCase() : k === 'ilk' ? String(x.ilk?.zaman || '') : k === 'son' ? String(x.son || '') : k === 'konum' ? String(x.konum?.yer || '') + String(x.konum?.ad || '').toLowerCase() : k === 'sahip' ? Number(x.sahip_sayi) || 0 : 0);
    const L = akis.liste ? [...akis.liste].sort((a, b) => { const p = deger(a, S.k), q = deger(b, S.k); return (p < q ? -1 : p > q ? 1 : 0) * S.y; }) : null;
    return ust + `<div class="mg2-tablo"><div class="mg2-iz-esya mg2-iz-bas"><span data-sira="ad">Eşya${ok('ad')}</span><span data-sira="ilk">Kaynak${ok('ilk')}</span><span data-sira="son">Son olay${ok('son')}</span><span data-sira="konum">Şu an${ok('konum')}</span><span data-sira="sahip">Sahip${ok('sahip')}</span><span></span></div>${L ? L.map((x) => { const [, ilkAd] = olayAd(x.ilk || {}), [st, sonAd] = olayAd(x.sonolay || {});
      return `<div class="mg2-iz-esya" data-uid="${x.uid}"><span class="mg2-iz-ad">${ikon(x.sonolay?.item_num || x.ilk?.item_num)}<span><b>${esc(x.sonolay?.esya || x.ilk?.esya || '#' + (x.sonolay?.item_num || ''))}</b><i>UID ${x.uid}</i></span></span><span>${ilkAd}<i>${tarih(x.ilk?.zaman)} · ${esc(x.ilk?.ad || x.ilk?.hesap_ad || '')}</i></span><span class="t-${st}">${sonAd}<i>${tarih(x.son)}</i></span><span>${konumAd(x.konum)}</span><span>${x.sahip_sayi} kişi · ${x.olay_sayi} olay</span><span>${x.konum?.yer && x.konum.yer !== 'yok' ? `<button data-a="iz-sil" data-id="${x.uid}" class="g2-tehlike mg2-iz-sil">${onay === 's' + x.uid ? 'Onayla' : 'Kaldır'}</button>` : ''}</span></div>`; }).join('') || '<div class="g2-bos">Kayıt yok.</div>' : '<div class="g2-bos">Yükleniyor…</div>'}</div>`;
  }
  // (3.11) şüpheli takas görseli: KO takas penceresi (re_personaltrade) kayıttan yeniden çizilir — iki hesap, eşyalar, Noah, zaman
  async function takasGor(id) {
    const d = await rpc('gm_mg_takas', { p_takas: id }); if (!d?.ok) return hud.notice?.(d?.reason || 'Trade record not found.', 'hata');
    const [K, E] = await Promise.all([import('./kui.js'), import('./esya.js')]);
    const nums = [...new Set([...(d.a_esya || []), ...(d.b_esya || [])].map((e) => Number(e.num)))];
    const IT = new Map(); if (nums.length) { const { data } = await sb.from('items').select('*').in('num', nums); for (const r of data || []) IT.set(Number(r.num), E.fromDb(r)); }
    document.querySelector('.mg2-takas-ortu')?.remove();
    const ortu = document.createElement('div'); ortu.className = 'mg2-takas-ortu'; ortu.addEventListener('pointerdown', (e) => e.stopPropagation());
    ortu.innerHTML = `<div class="mg2-takas-kutu"><div class="mg2-takas-bas"><b>Takas #${d.id}</b><span>${tarih(d.zaman)} · ${esc({ bitti: 'Tamamlandı', iptal: 'İptal', acik: 'Açık', istek: 'İstek' }[d.durum] || d.durum)}</span><button data-x="1">✕</button></div><div class="mg2-takas-sahne"></div>
      <div class="mg2-takas-ozet"><div><b>${esc(d.a_ad)}</b> verdi: ${(d.a_esya || []).map((e) => esc(IT.get(Number(e.num))?.strName || '#' + e.num) + (e.count > 1 ? ' ×' + e.count : '')).join(', ') || '—'} · <em>${Number(d.a_noah || 0).toLocaleString('tr-TR')} Noah</em></div>
      <div><b>${esc(d.b_ad)}</b> verdi: ${(d.b_esya || []).map((e) => esc(IT.get(Number(e.num))?.strName || '#' + e.num) + (e.count > 1 ? ' ×' + e.count : '')).join(', ') || '—'} · <em>${Number(d.b_noah || 0).toLocaleString('tr-TR')} Noah</em></div></div></div>`;
    document.body.append(ortu);
    ortu.querySelector('[data-x]').onclick = () => ortu.remove(); ortu.addEventListener('click', (e) => { if (e.target === ortu) ortu.remove(); });
    const sahne = ortu.querySelector('.mg2-takas-sahne');
    if (await K.ekUI('takas2').catch(() => false) && K.hasLayout('re_personaltrade')) {
      const L = K.buildLayout('re_personaltrade', { className: 'ko-takas2 mg2-takas-ko' }); sahne.append(L.el);
      L.el.style.position = 'relative'; L.el.style.left = '0'; L.el.style.top = '0'; L.el.style.pointerEvents = 'none';
      for (const t of L.el.querySelectorAll('.kui-tx')) { if (/^\d+$/.test(t.dataset.id || '')) t.textContent = ''; if (t.textContent.trim() === 'Trade' && t.parentElement === L.el) t.classList.add('tk2-baslik'); }
      L.text('text_id_my', d.a_ad || ''); L.text('text_id_other', d.b_ad || ''); L.text('string_money_my', Number(d.a_noah || 0).toLocaleString('tr-TR')); L.text('string_money_other', Number(d.b_noah || 0).toLocaleString('tr-TR'));
      L.text('string_money_inv', ''); L.get('btn_close')?.remove();
      const my = [], ot = [];
      for (const a of L.el.querySelectorAll('.kui-ar')) { const i = a.dataset.id || ''; if (!/^\d+$/.test(i)) continue; const x = parseFloat(a.style.left), y = parseFloat(a.style.top); if (y < 390) (x < 210 ? my : ot)[Number(i)] = a; }
      const doldur = (arr, liste) => (liste || []).forEach((e, k) => { const i = e.yer != null && e.yer >= 0 && e.yer < 9 && !arr[e.yer]?.firstChild ? e.yer : arr.findIndex((q) => q && !q.firstChild); const a = arr[i]; if (!a) return;
        a.classList.add('tk2-yuva'); a.innerHTML = `${E.iconHtml(IT.get(Number(e.num)) || { Kind: 0 }, 43)}${Number(e.count) > 1 ? `<b class="inv-adet">${e.count}</b>` : ''}`; a.title = IT.get(Number(e.num))?.strName || ''; });
      doldur(my, d.a_esya); doldur(ot, d.b_esya);
      const liste = document.createElement('div'); liste.className = 'tk2-liste'; L.get('list_iteminfo')?.append(liste);
      liste.innerHTML = `<div>${esc(d.a_ad)} → ${esc(d.b_ad)}</div><div style="color:#eed98b">${tarih(d.zaman)}</div>`;
      if (d.durum === 'bitti') { L.get('btn_trade_my')?.classList.add('secili'); L.show('img_trade_other_down', true); L.show('img_trade_other_normal', false); }
    }
  }
  function kuralHtml() {
    const a = ayar; if (!a) return '<div class="g2-bos">Yükleniyor…</div>';
    const n = (k, v, st = 1) => `<input type="number" data-k="${k}" value="${v ?? ''}" step="${st}">`;
    return `<div class="g2-bolum"><div class="g2-bas">Genel</div><label class="g2-tik mg2-ac"><input type="checkbox" data-k="aktif" ${a.aktif !== false ? 'checked' : ''}> MineGuard etkin</label>
        <div class="mg2-esikler"><b>Ceza eşikleri</b>${(a.esikler || []).map((e, i) => `<label>${i + 1}. eşik ${n('esik' + i + 'p', e.puan)} puan → yasak ${n('esik' + i + 'd', e.dk)} dk <i>(0 = kalıcı)</i></label>`).join('')}</div></div>
      <div class="g2-bolum"><div class="g2-bas">Tespit türleri</div><div class="mg2-turler">${Object.entries(MG_TUR).map(([k, [ad, ac]]) => `<div class="mg2-turk"><label class="g2-tik"><input type="checkbox" data-k="oto_${k}" ${a.otomatik?.[k] ? 'checked' : ''}> <b>${ad}</b></label><span>${ac}</span><label>Otomatik ceza ${n('puan_' + k, a.puan?.[k] ?? 0)} puan</label></div>`).join('')}</div>
        <p class="ay-not">İşaretli türlerde MineGuard kesin tespitte puanı kendisi verir; işaretsizlerde yalnız olay kaydeder, karar GM'indir. Makro ve hız tespitinde 30 dakikada 3. tekrar kesin sayılır.</p></div>
      <div class="g2-bolum"><div class="g2-bas">Eşikler</div><div class="g2-form mg2-form">
        <label>Ticaret: karşılıksız Noah aktarımı ≥${n('trade_noah', a.trade_noah, 1000000)}</label><label>Aynı gelir akışı: 24 saatte farklı hesap sayısı ≥${n('akis_kisi', a.akis_kisi)}</label>
        <label>Pazar: fiyat / eşya değeri katı >${n('pazar_kat', a.pazar_kat)}</label><label>Pazar: en az fiyat (Noah)${n('pazar_min', a.pazar_min, 1000000)}</label>
        <label>Pazar: KC fiyatı ≥${n('pazar_kc', a.pazar_kc)}</label><label>Gelir: saatlik Noah artışı >${n('gelir_saat', a.gelir_saat, 1000000)}</label></div></div>
      <div class="g2-bolum"><div class="g2-bas">Küfür / hakaret listesi</div><textarea data-k="kufur" rows="4" placeholder="virgülle ayır">${esc((a.kufur || []).join(', '))}</textarea></div>
      <div class="g2-dugmeler"><button data-a="kural-kaydet" class="g2-ana">Kuralları kaydet</button></div>`;
  }
  async function tikla(e) {
    const s = e.target.closest('[data-alt]'); if (s) { alt = s.dataset.alt; onay = null; ciz(); return yukle(); }
    const oy = e.target.closest('[data-oy]'); if (oy) return acOyuncu?.(Number(oy.dataset.oy));
    const kr = e.target.closest('[data-kar]'); if (kr) { akis.kar = kr.dataset.kar; akis.detay = null; const d = await rpc('gm_iz_karakter', { p_ad: akis.kar, p_limit: 400 }).catch(() => null); akis.karakter = d?.ok ? d : null; if (!d?.ok) hud.notice?.(d?.reason || 'Character not found.', 'hata'); return ciz(); }
    const so = e.target.closest('[data-sira]'); if (so) { const k = so.dataset.sira; akis.sira = { k, y: akis.sira.k === k ? -akis.sira.y : (k === 'ad' || k === 'konum' ? 1 : -1) }; return ciz(); }
    if (e.target.closest('button[data-a="iz-sil"]')) { /* aşağıda */ } else {
    const uidEl0 = e.target.closest('[data-uid]'); if (uidEl0 && uidEl0.dataset.uid && !e.target.closest('select, input, label')) { akis.detay = await rpc('gm_iz_uid', { p_uid: Number(uidEl0.dataset.uid) }).catch(() => null); onay = null; return ciz(); } }
    const uidEl = null; if (uidEl && uidEl.dataset.uid) { akis.detay = await rpc('gm_iz_uid', { p_uid: Number(uidEl.dataset.uid) }).catch(() => null); return ciz(); }
    const b = e.target.closest('button[data-a]');
    const ol = e.target.closest('[data-olay]'); if (ol && !b && !e.target.closest('input')) { acik = acik === Number(ol.dataset.olay) ? null : Number(ol.dataset.olay); return ciz(); }
    if (!b) return;
    const a = b.dataset.a, id = Number(b.dataset.id);
    try {
      if (a === 'yenile') return yukle();
      if (a === 'takas-gor') return takasGor(id);
      if (a === 'iz-sil') {
        if (onay !== 's' + id) { onay = 's' + id; return ciz(); } onay = null;
        const d = await rpc('gm_iz_sil', { p_uid: id }); if (!d?.ok) return hud.notice?.(d?.reason || 'Could not remove the item.', 'hata');
        hud.info?.(`Item removed: ${d.esya || ''} (${d.kimden || ''}).`, 'tamam');
        if (akis.detay) akis.detay = await rpc('gm_iz_uid', { p_uid: id }).catch(() => null);
        akis.liste = await rpc('gm_iz_ara', { p_ara: akis.ara, p_limit: 300, p_filtre: akis.f }).catch(() => akis.liste); return ciz();
      }
      if (a === 'iz-temizle') { akis.ara = ''; akis.kar = ''; akis.f = { kat: '', konum: '', bas: '', bit: '', min_sahip: '', tip: '' }; akis.karakter = null; akis.detay = null; akis.liste = null; ciz(); akis.liste = await rpc('gm_iz_ara', { p_ara: '', p_limit: 300, p_filtre: null }); return ciz(); }
      if (a === 'iz-geri') { if (akis.detay) akis.detay = null; else akis.karakter = null; return ciz(); }
      if (a === 'iz-ara') {
        for (const el of kok.querySelectorAll('[data-f]')) akis.f[el.dataset.f] = el.value;
        akis.ara = kok.querySelector('[data-s="iz-ara"]')?.value.trim() || ''; akis.kar = kok.querySelector('[data-s="iz-kar"]')?.value.trim() || ''; akis.detay = null;
        if (akis.kar && !Object.values(akis.f).some(Boolean)) { const d = await rpc('gm_iz_karakter', { p_ad: akis.kar, p_limit: 400 }); akis.karakter = d?.ok ? d : null; if (!d?.ok) hud.notice?.(d?.reason || 'Character not found.', 'hata'); }
        else { akis.karakter = null; akis.liste = null; ciz(); akis.liste = await rpc('gm_iz_ara', { p_ara: akis.ara, p_limit: 300, p_filtre: { ...akis.f, kar: akis.kar } }); }
        return ciz();
      }
      if (a === 'cezala') {
        if (onay !== 'c' + id) { onay = 'c' + id; return ciz(); } onay = null;
        const p = Number(kok.querySelector(`[data-p="${id}"]`)?.value) || 3;
        const d = await rpc('gm_mg_olay_islem', { p_id: id, p_islem: 'cezala', p_puan: p }); if (!d?.ok) return hud.notice?.(d?.reason || 'Action failed.', 'hata');
        hud.info?.(`Penalty points given. Total: ${d.toplam}${d.ban ? ' — threshold exceeded, account banned.' : ''}`, 'tamam'); return olayYukle();
      }
      if (a === 'incelendi' || a === 'yoksay') { await rpc('gm_mg_olay_islem', { p_id: id, p_islem: a, p_puan: null }); return olayYukle(); }
      if (a === 'kaldir') {
        if (onay !== 'k' + id) { onay = 'k' + id; return ciz(); } onay = null;
        const d = await rpc('gm_mg_ceza_kaldir', { p_id: id }); hud.info?.(`Penalty record removed. New total: ${d?.toplam ?? '?'}`, 'tamam'); return yukle();
      }
      if (a === 'pazar-kaydet') {
        const v = (k) => kok.querySelector(`[data-pk="${k}"]`);
        ayar = await rpc('gm_mg_ayar', { p_veri: { pazar_koruma: v('pazar_koruma').checked, pazar_bant: Math.max(2, Number(v('pazar_bant').value) || 10), pazar_ornek: Math.max(1, Number(v('pazar_ornek').value) || 3) } });
        hud.info?.('Market protection saved.', 'tamam'); return ciz();
      }
      if (a === 'kural-kaydet') {
        const v = (k) => kok.querySelector(`[data-k="${k}"]`), num = (k) => Number(v(k)?.value) || 0;
        const veri = { aktif: v('aktif').checked, esikler: (ayar.esikler || []).map((_, i) => ({ puan: num('esik' + i + 'p'), dk: num('esik' + i + 'd') })).filter((x) => x.puan > 0).sort((x, y) => x.puan - y.puan),
          otomatik: Object.fromEntries(Object.keys(MG_TUR).map((k) => [k, v('oto_' + k).checked])), puan: Object.fromEntries(Object.keys(MG_TUR).map((k) => [k, Math.max(0, Math.min(100, num('puan_' + k)))])),
          trade_noah: num('trade_noah'), akis_kisi: num('akis_kisi'), pazar_kat: num('pazar_kat'), pazar_min: num('pazar_min'), pazar_kc: num('pazar_kc'), gelir_saat: num('gelir_saat'),
          kufur: v('kufur').value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 500) };
        ayar = await rpc('gm_mg_ayar', { p_veri: veri }); hud.info?.('MineGuard rules saved.', 'tamam'); return ciz();
      }
    } catch { /* ileti gösterildi */ }
  }
  function degisti(e) { const k = e.target.dataset.s; if (k === 'durum' || k === 'tur') { suz[k] = e.target.value; olayYukle(); } }
  return { open(host) { if (!kok) kur(); else yukle(); if (host && kok.parentNode !== host) host.append(kok); } };
}
