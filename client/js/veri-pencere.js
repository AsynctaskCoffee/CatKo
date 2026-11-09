// GM Paneli → Veri Tabanı: oyundaki tüm eşyalar (sunucu ITEM tablosu, 150 bin+ kayıt) tekli kategorilerde (hançer, tek el kılıç …);
// süzgeçler: eşya artısı, reb durumu, reb artısı, zırh parçası.
// Veriler sitede assets/esya/<kategori>.tsv (sıfırlar boş), ikonlar assets/esya/ikonlar.webp atlasında.
// Veritabanı (Supabase items) site yayınlanınca sunucuda otomatik güncellenir (pg_cron → auto_import_items). GM seçtiği eşyayı envanterine alabilir.
import { koWindow, toFront } from './ko-pencere.js';
import { BASE, loadMeta as loadEsyaMeta, loadDesc, iconHtml as esyaIcon, tooltipHtml, fromTsv, fromDb, nameColor, kendiAdli, KIND as KINDS, LABEL as LABELS } from './esya.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROW = 38;

const KIND = KINDS, LABEL = LABELS;
// Tekli kategoriler: sitedeki dosya grubu (kilic.tsv …) içinden eşya türüne (Kind) göre süzülür
const TEKLI = [
  ['hancer', 'Hançer', 'kilic', [11]], ['kilic1', 'Tek el kılıç', 'kilic', [21]], ['kilic2', 'Çift el kılıç', 'kilic', [22]],
  ['balta1', 'Tek el balta', 'balta', [31]], ['balta2', 'Çift el balta', 'balta', [32]], ['topuz1', 'Tek el topuz', 'balta', [41]], ['topuz2', 'Çift el topuz', 'balta', [42]],
  ['rtopuz', 'Rahip topuzu', 'balta', [181]], ['pence', 'Pençe', 'diger', [43, 140]],
  ['mizrak1', 'Mızrak', 'mizrak', [51]], ['mizrak2', 'Uzun mızrak', 'mizrak', [52]],
  ['yay', 'Yay', 'yay', [70]], ['arbalet', 'Arbalet', 'yay', [71]], ['ok', 'Ok / atma mızrağı', 'yay', [120, 130]],
  ['asa', 'Asa', 'asa', [110]], ['kalkan', 'Kalkan', 'kalkan', [60]],
  ['zsavasci', 'Savaşçı zırhı', 'zirh', [210]], ['zokcu', 'Okçu zırhı', 'zirh', [220]], ['zbuyucu', 'Büyücü zırhı', 'zirh', [230]], ['zrahip', 'Rahip zırhı', 'zirh', [240]], ['zkurian', 'Kurian zırhı', 'zirh', [200]],
  ['kupe', 'Küpe', 'taki', [91]], ['kolye', 'Kolye', 'taki', [92]], ['yuzuk', 'Yüzük', 'taki', [93, 160]], ['kemer', 'Kemer', 'taki', [94]],
  ['iksir', 'İksir / parşömen', 'iksir', [97]], ['yparsomen', 'Yükseltme parşömeni', 'iksir', [98]], ['premium', 'Premium / özel', 'iksir', [255]], ['yiyecek', 'Yiyecek', 'iksir', [175, 176]],
  ['gorev', 'Görev eşyası', 'diger', [95]], ['beceri', 'Beceri eşyası', 'diger', [252, 254]], ['evcil', 'Evcil hayvan', 'diger', [101, 150, 151, 152]], ['gorunum', 'Görünüm', 'diger', [171]],
  ['beta', 'BETA', null, null], ['diger', 'Diğer', null, null], ['ozel', 'GM özel eşyaları', null, null],
].map(([id, ad, dosya, kind]) => ({ id, ad, dosya, kind }));
const BILINEN = new Set(TEKLI.flatMap((c) => c.kind || []));
// GM özel eşyaları (items.custom): sunucudan okunur, kategorisine eklenir; editör kaydedince önbellek temizlenir
let OZEL = null;
export const ozelYenile = () => { OZEL = null; window.dispatchEvent(new CustomEvent('ko-ozel-esya')); };
const PARCA = { 5: 'Omuzluk', 6: 'Pantolon', 7: 'Kask', 8: 'Eldiven', 9: 'Ayakkabı' };
// (+N): N ≤ 10 eşya artısı, N > 10 reb (reb +N−10)
const norm = (t) => String(t || '').toLocaleLowerCase('tr').replace(/[ıİ]/g, 'i').replace(/\s+/g, ' ').trim();
const artiOf = (ad) => { const m = /\(\+(\d+)\)\s*$/.exec(ad || ''); return m ? Number(m[1]) : null; };

const GENIE = new Set([810305000, 810378000, 811062000, 900772000]);   // (7.11) Spirit of Genie: hak = dayanıklılık (10'luk paket)
export function initVeriWindow({ sb, character, hud, say, onGive, onEdit = null, oyuncu = false }) {
  let win = null, meta = null, cat = null, all = [], view = [], sel = null, q = '';
  const fil = { arti: '', reb: '', rebArti: '', parca: '', bas: '', sinif: '' };
  let sira = '';   // hasar± / ac± / sv±
  // silah / zırh kategorileri: her tür tek satır (ad + tür); nadir ve büyülü eşyalar gizli. Tıklayınca alt menü: +1..+10, yeniden dökme, örs ayarları
  const GRUP_DOSYA = new Set(['kilic', 'balta', 'mizrak', 'yay', 'asa', 'kalkan', 'zirh', 'taki']);   // (5.11) takılar da gruplu: +1…+5 değerleri görülüp seçilir
  let grupla = true;
  const grupModu = () => { const t = TEKLI.find((c) => c.id === cat); return grupla && !!t && (GRUP_DOSYA.has(t.dosya) || t.id === 'pence'); };   // pençeler (jamadar, diger.tsv kind 140) silah gibi gruplu
  const temelAd = (ad) => String(ad || '').replace(/\s*\(\+\d+\)\s*$/, '');
  let AYAR = null;   // 'ad|kind' → { ors_bas, reb_acik, sinif }
  async function ayarYukle() { if (AYAR || !sb) return AYAR; const { data: d } = await sb.from('esya_ayar').select('*'); AYAR = new Map((d || []).map((x) => [x.ad + '|' + x.kind, x])); return AYAR; }
  const REB_GRUP = new Map();   // 'ad|kind' → yeniden dökme satırları (sunucu)
  const data = new Map();   // kategori → satırlar
  let F = [];
  // silinen eşyalar (items.silindi; satırın kopyası items_yedek'te durur): listelerde gizlenir, GM "Silinen eşyalar" bölümünden geri alır
  let SILINEN = new Map(), silOnay = null;
  // ---- GM özel eşya kategorileri (esya_kategori): oluştur, yeniden adlandır, kaldır; hazır kategorilerin görünen adı değiştirilebilir.
  // Eşya ayrıntısında kategori çipleriyle eşyayı kategoriye ekle / çıkar. Oyuncu görünümünde yok.
  let KAT = [], katDuzen = null;   // katDuzen: { id | 'yeni' | 'sabit:<id>' } satır içi ad düzenleme
  const UYELIK = new Map();   // num → Set(kategori id)
  const katGm = () => !oyuncu && !!sb && !!character;
  async function katYukle() { if (!katGm()) return; const { data: d } = await sb.rpc('gm_esya_kat_liste', { p_char: character.id }); KAT = Array.isArray(d) ? d : []; }
  const sabitAd = (id, ad) => KAT.find((k) => k.sabit === id)?.ad || ad;
  function katCiz() {
    const kutu = win?.querySelector('.vi-kat'); if (!kutu) return;
    const say = meta.tekli || {};
    const duz = (anahtar, ad) => `<div class="vi-kat-duz"><input data-kd="${anahtar}" value="${esc(ad)}" maxlength="40"><button data-ka="kaydet" data-kd="${anahtar}" title="Kaydet (Enter)">✓</button><button data-ka="vazgec" title="Vazgeç (Esc)">✕</button></div>`;
    const sabitB = (id, ad, n, ek = '') => katDuzen === 'sabit:' + id ? duz('sabit:' + id, sabitAd(id, ad))
      : `<button data-c="${id}" class="${cat === id ? 'secili' : ''} ${ek}"><span>${esc(sabitAd(id, ad))}</span><i>${n}</i>${katGm() && id !== 'silinen' ? `<b class="vi-kat-ik" data-ka="adlandir" data-kd="sabit:${id}" title="Görünen adı değiştir">✎</b>` : ''}</button>`;
    let h = sabitB('hepsi', 'Tümü', meta.toplam.toLocaleString('tr-TR')) + TEKLI.map((c) => sabitB(c.id, c.ad, say[c.id] != null ? say[c.id].toLocaleString('tr-TR') : '')).join('');
    if (katGm()) {
      h += `<div class="vi-kat-grup"><span>Özel kategoriler</span><b data-ka="yeni" title="Yeni kategori oluştur">+ Yeni</b></div>`;
      if (katDuzen === 'yeni') h += duz('yeni', '');
      h += KAT.filter((k) => !k.sabit).map((k) => katDuzen === k.id ? duz(k.id, k.ad)
        : `<button data-c="k:${k.id}" class="vi-ozel-kat ${cat === 'k:' + k.id ? 'secili' : ''}"><span>${esc(k.ad)}</span><i>${k.adet}</i><b class="vi-kat-ik" data-ka="adlandir" data-kd="${k.id}" title="Yeniden adlandır">✎</b><b class="vi-kat-ik sil" data-ka="kaldir" data-kd="${k.id}" title="Kategoriyi kaldır (eşyalar silinmez)">✕</b></button>`).join('')
        || (katDuzen === 'yeni' ? '' : '<p class="ay-not vi-kat-bos">Henüz özel kategori yok.</p>');
      h += '<button data-c="silinen" class="vi-silinen-kat"><span>Silinen eşyalar (yedek)</span><i></i></button>';
    } else if (!oyuncu) h += '<button data-c="silinen" class="vi-silinen-kat"><span>Silinen eşyalar (yedek)</span><i></i></button>';
    kutu.innerHTML = h; silSay?.();
    kutu.querySelector('.vi-kat-duz input')?.focus();
  }
  let katSilOnay = null;
  async function katIslem(e) {
    const a = e.target.closest('[data-ka]'); if (!a) return false;
    e.stopPropagation(); e.preventDefault();
    const ka = a.dataset.ka, kd = a.dataset.kd;
    if (ka === 'yeni') { katDuzen = 'yeni'; katCiz(); return true; }
    if (ka === 'adlandir') { katDuzen = /^\d+$/.test(kd) ? Number(kd) : kd; katCiz(); return true; }
    if (ka === 'vazgec') { katDuzen = null; katCiz(); return true; }
    if (ka === 'kaydet') return katKaydet(kd), true;
    if (ka === 'kaldir') {
      const id = Number(kd);
      if (katSilOnay !== id) { katSilOnay = id; a.textContent = 'Emin?'; a.classList.add('onay'); setTimeout(() => { if (katSilOnay === id) { katSilOnay = null; katCiz(); } }, 3000); return true; }
      katSilOnay = null;
      const { data: d, error } = await sb.rpc('gm_esya_kat_kaldir', { p_char: character.id, p_id: id });
      if (error || !d?.ok) { hud.notice?.(error?.message || 'Could not remove.', 'hata'); return true; }
      hud.info?.('Category removed (items were not deleted).', 'tamam'); await katYukle(); if (cat === 'k:' + id) await selectCat('hepsi'); else katCiz(); return true;
    }
    return false;
  }
  async function katKaydet(kd) {
    const inp = win.querySelector(`.vi-kat-duz input`); const ad = (inp?.value || '').trim(); if (!ad) return hud.notice?.('Enter a category name.', 'hata');
    const sabit = String(kd).startsWith('sabit:') ? String(kd).slice(6) : null;
    const { data: d, error } = await sb.rpc('gm_esya_kat_kaydet', { p_char: character.id, p_id: sabit || kd === 'yeni' ? null : Number(kd), p_ad: ad, p_sabit: sabit });
    if (error || !d?.ok) return hud.notice?.(d?.reason || error?.message || 'Could not save.', 'hata');
    hud.info?.(kd === 'yeni' ? `Category "${d.ad}" created.` : `Category name: ${d.ad}`, 'tamam');
    katDuzen = null; await katYukle(); katCiz(); renderDetail();
  }
  /** eşya ayrıntısına kategori çipleri: tıkla → ekle / çıkar */
  async function katEkle(kutu, num) {
    if (!katGm() || !kutu || !num) return;
    num = Number(num);
    let bol = kutu.querySelector(':scope > .vi-katlar'); if (!bol) { bol = document.createElement('div'); bol.className = 'vi-katlar'; kutu.append(bol); }
    bol.dataset.num = num;
    const ciz = () => {
      if (Number(bol.dataset.num) !== num) return;
      const u = UYELIK.get(num) || new Set(), oz = KAT.filter((k) => !k.sabit);
      bol.innerHTML = `<div class="vi-alt-baslik">Kategoriler</div>${oz.length ? `<div class="vi-cipler">${oz.map((k) => `<button data-kc="${k.id}" class="${u.has(k.id) ? 'ekli' : ''}" title="${u.has(k.id) ? 'Kategoriden çıkar' : 'Kategoriye ekle'}">${u.has(k.id) ? '✓ ' : '+ '}${esc(k.ad)}</button>`).join('')}</div>` : '<p class="ay-not">Özel kategori yok. Soldan "+ Yeni" ile oluştur.</p>'}`;
      bol.querySelectorAll('[data-kc]').forEach((b) => b.addEventListener('click', async (e) => {
        e.stopPropagation(); const id = Number(b.dataset.kc), ekle = !u.has(id); b.disabled = true;
        const { data: d, error } = await sb.rpc('gm_esya_kat_uye', { p_char: character.id, p_id: id, p_num: num, p_ekle: ekle });
        if (error || !d?.ok) { b.disabled = false; return hud.notice?.(d?.reason || error?.message || 'Action failed.', 'hata'); }
        if (ekle) u.add(id); else u.delete(id); UYELIK.set(num, u);
        const k = KAT.find((x) => x.id === id); if (k) k.adet = d.adet;
        hud.info?.(`${ekle ? 'Added to category' : 'Removed from category'}: ${k?.ad || ''}`, 'tamam');
        katCiz(); ciz();
        if (!ekle && cat === 'k:' + id) { all = all.filter((r) => Number(r[0]) !== num); filter(); }
      }));
    };
    if (!UYELIK.has(num)) { bol.innerHTML = '<div class="vi-alt-baslik">Kategoriler</div><p class="ay-not">Yükleniyor…</p>'; const { data: d } = await sb.rpc('gm_esya_kat_esya', { p_char: character.id, p_num: num }); UYELIK.set(num, new Set((Array.isArray(d) ? d : []).map(Number))); }
    ciz();
  }
  async function silinenYukle() {
    if (!sb) return;
    const { data: d } = await sb.rpc('esya_silinenler');
    SILINEN = new Map((Array.isArray(d) ? d : []).map((x) => [Number(x.num), x]));
  }

  // (6.11) reverse bloğunun etkisi (sunucu _reb_ozellik ile aynı sıra) — Buy Merchant Reverse sekmesindeki sıralamayla eş
  const rebEtki = (x) => {
    const v = (k) => Number(x?.[k]) || 0;
    const el = [['fire_damage', 'Flame Damage'], ['ice_damage', 'Glacier Damage'], ['lightning_damage', 'Lightning Damage'], ['poison_damage', 'Poison Damage'], ['hp_drain', 'HP Recovery'], ['mp_drain', 'MP Recovery'], ['mp_damage', 'MP Damage'],
      ['str_b', 'Strength Bonus'], ['sta_b', 'Health Bonus'], ['dex_b', 'Dexterity Bonus'], ['intel_b', 'Intelligence Bonus'], ['cha_b', 'Magic Power Bonus'], ['max_hp_b', 'HP Bonus'], ['max_mp_b', 'MP Bonus']].find(([k]) => v(k) > 0);
    if (el) return 'Reverse — ' + el[1];
    if (['fire_r', 'cold_r', 'lightning_r', 'magic_r', 'poison_r', 'curse_r'].some((k) => v(k) > 0)) return 'Reverse — Resistance';
    if (['dagger_ac', 'sword_ac', 'mace_ac', 'axe_ac', 'spear_ac', 'bow_ac'].some((k) => v(k) > 0)) return 'Reverse — Special Defense';
    return 'Reverse — Light';
  };
  async function loadMeta() {
    if (meta) return meta;
    meta = await loadEsyaMeta(); F = meta.alanlar; loadDesc().catch(() => {});
    return meta;
  }
  const ozel = () => (OZEL ||= sb ? Promise.resolve(sb.from('items').select('*').eq('custom', true).order('num')).then((r) => r.data || [], () => []) : Promise.resolve([]));
  const ozelSatir = (row) => { const o = fromDb(row); const r = F.map((k) => (k === 'strName' || k === 'ikon' ? o[k] ?? '' : Number(o[k]) || 0)); r.cat = row.category || 'diger'; r.ozel = row; return r; };
  addEventListener('ko-ozel-esya', () => { data.clear(); if (win && cat) selectCat(cat); });
  async function loadCat(id) {
    if (data.has(id)) return data.get(id);
    if (id === 'ozel') { const rows = (await ozel()).map(ozelSatir); data.set(id, rows); return rows; }
    // BETA eşyaları: normal eşyalardan ayrı, yeni numaralı kopyalar (items.category = 'beta'); envantere BETA eşyası olarak gelir
    if (id === 'beta') { const { data: bd } = sb ? await sb.from('items').select('*').eq('category', 'beta').order('num') : { data: [] }; const rows = (bd || []).map((row) => { const r = ozelSatir(row); r.cat = 'beta'; r.beta = true; return r; }); data.set(id, rows); return rows; }
    const t = await (await fetch(`${BASE}/${id}.tsv`)).text();
    const iName = F.indexOf('strName'), iIk = F.indexOf('ikon');
    const rows = t.split('\n').map((l) => l.split('\t').map((v, i) => (i === iName || i === iIk ? v : v === '' ? 0 : Number(v))));
    for (const r of rows) r.cat = id;
    for (const o of await ozel()) if ((o.category || 'diger') === id) rows.push(ozelSatir(o));
    // parşömen vb. ekipman olmayan eşyalarda "(+0)" eki gösterilmez (ör. Rebirth Scroll (+0) → Rebirth Scroll)
    const iD = F.indexOf('Damage'), iA = F.indexOf('Ac');
    for (const r of rows) if (!(Number(r[iD]) > 0 || Number(r[iA]) > 0) && typeof r[iName] === 'string') r[iName] = r[iName].replace(/\s*\(\+0\)\s*$/, '');
    data.set(id, rows);
    return rows;
  }
  const col = (r, k) => r[F.indexOf(k)];
  const iconHtml = (r, size = 34) => esyaIcon(fromTsv(r, F), size);

  // + basılabilir mi? (sunucudaki ors_yukselt kuralı: aynı org, num+1..+3 içinde bir üst artı; reb: +8…+10 → (+11), (+11+) → bir üst)
  let numIdx = null, numIdxN = -1;
  const basilabilir = (r) => {
    if (numIdxN !== all.length) { numIdx = new Map(all.map((x) => [x[0], x])); numIdxN = all.length; }
    const it = (k) => Number(col(r, k)) || 0;
    if (it('Countable') > 0 || !(it('Damage') > 0 || it('Ac') > 0) || col(r, 'Slot') === '' ) return '';
    if ([1, 2].includes(it('ItemType'))) return '';   // nadir ve büyülü eşyalara + basılamaz
    const a = artiOf(col(r, 'strName')) ?? 0, org = col(r, 'org'), num = r[0];
    const bul = (h) => { for (let d = 1; d <= 3; d++) { const x = numIdx.get(num + d); if (x && col(x, 'org') === org && (artiOf(col(x, 'strName')) ?? 0) === h && (Number(col(x, 'Damage')) || 0) >= it('Damage') && (Number(col(x, 'Ac')) || 0) >= it('Ac')) return true; } return false; };
    if (a < 10 && bul(a + 1)) return 'arti';
    return '';
  };
  // KO: parşömen sınıfı eşya sınıfıyla birebir (ItemClass 1 Low, 2 Middle, diğerleri High) — sunucudaki _ors_sinif
  const orsSinif = (r) => ({ 1: 1, 2: 2 }[Number(col(r, 'ItemClass')) || 0] || 3);
  const SINIF_AD = { 1: 'Low, Middle ya da High Class Upgrade Scroll (alt sınıf eşya her parşömenle basılır)', 2: 'Upgrade Scroll (Middle Class item)', 3: 'Upgrade Scroll (High Class Item) / Blessed Upgrade Scroll' };
  // ---- yeniden dökme (rebirth) eşyaları sunucudan: sitedeki eşya dosyaları eski türleri taşır (kutsal → yeniden dökme dönüşümü,
  // üretilen reb +1..+21 eşyaları yok). Süzgeç seçilince seçili kategorinin item_type 12 eşyaları okunur; listede sunucudaki satırla değiştirilir / eklenir.
  const REB_DB = new Map();   // kategori anahtarı → Set(num)
  const REB_SATIR = new Map();   // kategori anahtarı → sunucu satırları
  // listede sunucudaki satırla değiştir / ekle (kategori her seçildiğinde yeniden uygulanır)
  function rebKat(id, satirlar) {
    const yer = new Map(all.map((r, i) => [Number(r[0]), i]));
    for (const row of satirlar) { if (SILINEN.has(Number(row.num))) continue; const x = ozelSatir(row); x.ozel = null; const i = yer.get(Number(row.num)); if (i != null) all[i] = x; else all.push(x); }
    REB_DB.set(id, new Set(satirlar.map((x) => Number(x.num))));
  }
  const rebAnahtar = () => cat || '';
  let rebYukleniyor = null;
  async function rebYukle() {
    const id = cat, tekli = TEKLI.find((c) => c.id === id);
    if (!sb || !id || id === 'silinen') return;
    if (REB_SATIR.has(id)) { rebKat(id, REB_SATIR.get(id)); return; }
    if (id === 'hepsi') { win.querySelector('.vi-sayi').textContent = 'Yeniden dökme süzgeci için soldan bir kategori seç.'; return; }
    if (rebYukleniyor) return rebYukleniyor;
    rebYukleniyor = (async () => {
      const kinds = tekli?.kind || null, satirlar = [];
      for (let bas = 0; bas < 200000; bas += 1000) {
        let qq = sb.from('items').select('*').eq('item_type', 12).eq('silindi', false).order('num').range(bas, bas + 999);
        qq = kinds ? qq.in('kind', kinds) : id === 'beta' ? qq.eq('category', 'beta') : qq.eq('category', tekli ? 'diger' : id);
        if (win) win.querySelector('.vi-sayi').textContent = `Yeniden dökme eşyaları okunuyor… ${satirlar.length.toLocaleString('tr-TR')}`;
        const { data: d, error } = await qq; if (error || !d?.length) break;
        satirlar.push(...d); if (d.length < 1000) break;
      }
      REB_SATIR.set(id, satirlar);
      if (cat === id) rebKat(id, satirlar);
    })().finally(() => { rebYukleniyor = null; });
    return rebYukleniyor;
  }
  function sifirla() {
    q = ''; sira = ''; for (const k of Object.keys(fil)) fil[k] = '';
    win.querySelectorAll('.vi-ust input, .vi-ust select').forEach((e) => { e.value = ''; });
    filter();
  }
  function filter() {
    if (!win) return;
    const s = norm(q), iName = F.indexOf('strName'), iNum = 0, kelimeler = s.split(' ').filter(Boolean);
    const iSlot = F.indexOf('Slot');
    const nadirGizle = (() => { const t = TEKLI.find((c) => c.id === cat); return !!t && (GRUP_DOSYA.has(t.dosya) || t.id === 'pence'); })(), iTip = F.indexOf('ItemType');
    view = all.filter((r) => {
      if (nadirGizle && [1, 2].includes(Number(r[iTip]) || 0)) return false;   // silah / zırh: nadir ve büyülü eşyalar veri tabanında gösterilmez (mob droplarında ayarlanır)
      // yeniden dökme: sunucudaki güncel tür (item_type 12; kategori yüklenince REB_DB), yoksa ad (+N > 10)
      const a = artiOf(r[iName]), rd = REB_DB.get(rebAnahtar()), reb = Number(r[F.indexOf('ItemType')]) === 11 || (rd ? rd.has(Number(r[iNum])) : (a != null && a > 10));   // (6.11) özgün reverse (ItemType 11) her zaman reb
      if (fil.arti !== '' && (reb || (a ?? 0) !== Number(fil.arti))) return false;
      if (fil.reb === 'reb' && !reb) return false;
      if (fil.reb === 'normal' && reb) return false;
      if (fil.rebArti !== '' && (!reb || (rd ? a : a - 10) !== Number(fil.rebArti))) return false;
      if (fil.parca !== '' && Number(r[iSlot]) !== Number(fil.parca)) return false;
      if (fil.bas !== '') { const b = basilabilir(r); if (fil.bas === 'hepsi' ? !b : fil.bas === 'yok' ? !!b : b !== fil.bas) return false; }
      if (fil.sinif !== '' && (basilabilir(r) !== 'arti' || orsSinif(r) !== Number(fil.sinif))) return false;
      if (!s) return true;
      const ad = norm(r[iName]);
      return kelimeler.every((k) => ad.includes(k)) || String(r[iNum]).startsWith(s);
    });
    // arama / karışık kategoriler: aynı eşyanın +1, +2 … +10 (ve yeniden dökme) sürümleri tek satır — temsilci: en küçük artılı normal sürüm
    // (artı filtresi seçiliyse o artı gösterilir, birleştirme yapılmaz)
    if (!grupModu() && fil.arti === '' && fil.rebArti === '') {
      const iT = F.indexOf('ItemType'), iK = F.indexOf('Kind'), rd = REB_DB.get(rebAnahtar()), tek = new Map();
      const puan = (r) => { const a = artiOf(r[iName]), t = Number(r[iT]) || 0, reb = rd?.has(Number(r[0])) || t === 11 || t === 12 || (a != null && a > 10); return (reb ? 1000 : 0) + (a ?? 0); };
      for (const r of view) { const t0 = Number(r[iT]) || 0, k = temelAd(r[iName]) + '|' + r[iK] + '|' + ([0, 5, 11, 12].includes(t0) ? 0 : t0); const o = tek.get(k); if (!o || puan(r) < puan(o) || (puan(r) === puan(o) && r[0] < o[0])) tek.set(k, r); }
      if (tek.size < view.length) { const ok = new Set(tek.values()); view = view.filter((r) => ok.has(r)); }
    }
    if (grupModu()) {
      const iT = F.indexOf('ItemType'), iK = F.indexOf('Kind'), gruplar = new Map(), rd = REB_DB.get(rebAnahtar());
      for (const r of view) {
        const tip = Number(r[iT]) || 0; if (tip === 1 || tip === 2) continue;   // nadir / büyülü gizli
        const k = temelAd(r[iName]) + '|' + r[iK];
        let g = gruplar.get(k); if (!g) gruplar.set(k, (g = { ad: temelAd(r[iName]), kind: Number(r[iK]), satirlar: [] }));
        g.satirlar.push(r);
      }
      view = [...gruplar.values()].map((g) => {
        const normal = g.satirlar.filter((r) => { const a = artiOf(r[iName]); const t = Number(r[iT]) || 0; return !(rd?.has(Number(r[0]))) && t !== 12 && t !== 11 && (a == null || a <= 10); });
        const temsil = [...(normal.length ? normal : g.satirlar)].sort((x, y) => (artiOf(x[iName]) ?? 0) - (artiOf(y[iName]) ?? 0) || x[0] - y[0])[0];
        const t = Object.assign([...temsil], { cat: temsil.cat, grup: { ...g, normal } });
        return t;
      }).sort((x, y) => x.grup.ad.localeCompare(y.grup.ad, 'tr'));
    }
    // sıralama: hasar / savunma / seviye (tür görünümünde türün en güçlü normal sürümüne göre: genelde +10)
    if (sira) {
      const alan = { hasar: 'Damage', ac: 'Ac', sv: 'ReqLevel' }[sira.slice(0, -1)], yon = sira.endsWith('-') ? -1 : 1, iA = F.indexOf(alan);
      const deger = (r) => r.grup ? Math.max(0, ...(r.grup.normal.length ? r.grup.normal : r.grup.satirlar).map((x) => Number(x[iA]) || 0)) : Number(r[iA]) || 0;
      view = view.map((r) => [deger(r), r]).sort((a, b) => (a[0] - b[0]) * yon || String(a[1][F.indexOf('strName')]).localeCompare(String(b[1][F.indexOf('strName')]), 'tr')).map((x) => x[1]);
    }
    const list = win.querySelector('.vi-liste');
    list.scrollTop = 0;
    win.querySelector('.vi-sayi').textContent = `${view.length.toLocaleString('tr-TR')} eşya` + (view.length !== all.length ? ` (toplam ${all.length.toLocaleString('tr-TR')})` : '');
    renderList();
  }
  // sıralama açıkken satırda değer (tür görünümünde türün en yüksek normal sürümü)
  const siraYazi = (r) => {
    if (!sira) return '';
    const k = sira.slice(0, -1), alan = { hasar: 'Damage', ac: 'Ac', sv: 'ReqLevel' }[k], iA = F.indexOf(alan);
    const v = r.grup ? Math.max(0, ...(r.grup.normal.length ? r.grup.normal : r.grup.satirlar).map((x) => Number(x[iA]) || 0)) : Number(r[iA]) || 0;
    return ` · ${{ hasar: 'Hasar', ac: 'Savunma', sv: 'Sv' }[k]} ${v}`;
  };
  function renderList() {
    if (!win) return;
    const list = win.querySelector('.vi-liste'), inner = list.querySelector('.vi-ic');
    inner.style.height = view.length * ROW + 'px';
    const top = list.scrollTop, h = list.clientHeight;
    const a = Math.max(0, Math.floor(top / ROW) - 5), b = Math.min(view.length, Math.ceil((top + h) / ROW) + 5);
    let html = '';
    for (let i = a; i < b; i++) {
      const r = view[i];
      if (r.grup) { const ay = AYAR?.get(r.grup.ad + '|' + r.grup.kind); html += `<div class="vi-satir vi-grup${sel === r ? ' secili' : ''}" data-i="${i}" style="top:${i * ROW}px">${iconHtml(r)}<span class="vi-ad">${esc(kendiAdli(r.grup.ad))}</span><b>${(() => { const m = Math.max(0, ...r.grup.normal.map((x) => artiOf(x[F.indexOf('strName')]) ?? 0)); return m > 0 ? '+1…+' + m : ''; })()}</b><i>${esc(KIND[r.grup.kind] || r.grup.kind)}${ay ? ' · ' + (ay.ors_bas ? 'örs ✓' : 'örs ✗') + (ay.reb_acik ? ' · reb ✓' : ' · reb ✗') : ''}${siraYazi(r)}</i></div>`; continue; }
      html += `<div class="vi-satir${sel === r ? ' secili' : ''}" data-i="${i}" style="top:${i * ROW}px">${iconHtml(r)}<span class="vi-ad" style="color:${nameColor(r.ozel ? fromDb(r.ozel) : fromTsv(r, F))}">${esc(kendiAdli(col(r, 'strName')))}</span><b>${col(r, 'Num')}</b><i>${esc(KIND[col(r, 'Kind')] || col(r, 'Kind'))}${col(r, 'ReqLevel') ? ' · Sv ' + col(r, 'ReqLevel') : ''}</i></div>`;
    }
    inner.innerHTML = html;
  }
  function renderDetail() {
    if (!win) return;
    const box = win.querySelector('.vi-detay');
    if (!sel) { box.innerHTML = '<p class="ay-not">Ayrıntı için listeden bir eşya seç.</p>'; return; }
    if (sel.grup) return grupDetay(box, sel.grup);
    const it = sel.ozel ? { ...fromTsv(sel, F), ...fromDb(sel.ozel) } : fromTsv(sel, F);
    const rows = F.filter((k) => !['Num', 'strName', 'Kind', 'ikon', 'yaklasik', 'org'].includes(k) && it[k]).map((k) => {
      let v = it[k]; if (typeof v === 'number' && /Price/.test(k)) v = v.toLocaleString('tr-TR');
      return `<tr><td>${esc(LABEL[k] || k)}</td><td>${esc(v)}</td></tr>`;
    }).join('');
    box.innerHTML = `<div class="vi-baslik">${iconHtml(sel, 50)}<div><div class="vi-dad" style="color:${nameColor(it)}">${esc(it.strName)}</div><div class="vi-dno">#${it.Num} · ${esc(KIND[it.Kind] || 'Tür ' + it.Kind)} (${it.Kind})${it.yaklasik ? ' · ikon benzer eşyadan' : ''}</div></div></div>
      ${sel.ozel && onEdit ? `<div class="vi-ver"><button data-k="ozel-duzenle" class="ay-dugme">Özel eşyayı düzenle</button></div>` : ''}
      ${(() => { const sx = SILINEN.get(Number(it.Num)); if (sx) return `<div class="vi-silindi">Bu eşya veritabanından silindi${sx.tarih ? ' · ' + new Date(sx.tarih).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : ''}${sx.silen ? ' · ' + esc(sx.silen) : ''}. Yedekte duruyor.</div>${!oyuncu && character ? '<div class="vi-ver"><button data-k="geri" class="ay-dugme">Geri al</button></div>' : ''}`;
        return `${character ? `<div class="vi-ver"><input type="number" name="adet" min="1" max="9999" value="1"><button data-k="ver" class="ay-dugme">Envanterime ekle</button>${GENIE.has(Number(it.Num)) ? '<span class="vi-genie">1 = pack of 10 (10 uses). Each pack goes to its own slot with 10 uses (amount = durability); it does not stack and only decreases when used.</span>' : ''}</div>` : ''}${!oyuncu && character ? `<div class="vi-ver"><button data-k="sil" class="ay-dugme tehlike">${silOnay === it.Num ? 'Emin misin? Tekrar bas' : 'Veritabanından sil'}</button></div>` : ''}`; })()}
      <div class="ko-ipucu vi-ipucu">${tooltipHtml(it)}</div>
      ${(() => { const b = basilabilir(sel); return b === 'arti' ? `<div class="vi-bas">Örste + basılır: ${esc(SINIF_AD[orsSinif(sel)])}</div>` : ''; })()}
      <div class="vi-alt-baslik">Tüm değerler</div>
      <table>${rows || '<tr><td colspan="2">Ek özellik yok</td></tr>'}</table>`;
    katEkle(box, it.Num);
  }
  // ---- tür alt menüsü: +1..+10 ve yeniden dökme ikonları (üzerine gelince ipucu, tıklayınca ayrıntı), örs ayarları tek seferde
  let altSec = null, ipu = null;
  const ipucuGoster = (it, ev) => { ipu ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu vi-yuzen-ipucu' }); if (!ipu.isConnected) document.body.append(ipu); ipu.innerHTML = tooltipHtml(it); ipu.style.zIndex = 9800;
    ipu.style.left = Math.min(innerWidth - ipu.offsetWidth - 8, ev.clientX + 16) + 'px'; ipu.style.top = Math.max(8, Math.min(innerHeight - ipu.offsetHeight - 8, ev.clientY - 10)) + 'px'; };
  const ipucuKapa = () => ipu?.remove();
  async function grupDetay(box, g) {
    const anahtar = g.ad + '|' + g.kind;
    await ayarYukle();
    const ay = AYAR?.get(anahtar) || { ors_bas: true, reb_acik: true, sinif: null };
    const iN = F.indexOf('strName');
    // normal +1..+10: her artı için bir eşya (öncelik normal derece, en küçük numara)
    const arti = Array.from({ length: 10 }, (_, i) => g.normal.filter((r) => artiOf(r[iN]) === i + 1).sort((x, y) => x[0] - y[0])[0] || null);
    const taban = g.normal.find((r) => artiOf(r[iN]) == null || artiOf(r[iN]) === 0) || null;
    const takiMi = TEKLI.find((c) => c.id === cat)?.dosya === 'taki';
    const artiSay = () => (takiMi ? Math.max(5, ...arti.map((r, i) => (r ? i + 1 : 0))) : 10);
    // (5.11) takı: +1…+N değer tablosu (sunucudaki güncel değerler); sütun başlığına tıklayınca o sürüm seçilir
    const STAT = ['Ac', 'Damage', 'StrB', 'StaB', 'DexB', 'IntelB', 'ChaB', 'MaxHpB', 'MaxMpB', 'FireDamage', 'IceDamage', 'LightningDamage', 'PoisonDamage', 'HPDrain', 'MPDamage', 'MPDrain', 'MirrorDamage', 'FireR', 'ColdR', 'LightningR', 'MagicR', 'PoisonR', 'CurseR', 'Hitrate', 'Evasionrate'];
    const degerTablo = () => {
      if (!takiMi) return '';
      const L = arti.slice(0, artiSay()).map((r, i) => (r ? { i, it: fromTsv(r, F) } : null)).filter(Boolean); if (!L.length) return '';
      const alanlar = STAT.filter((k) => L.some((x) => Number(x.it[k]) || 0));
      return `<table class="vi-arti-tablo"><tr><th></th>${L.map((x) => `<th data-arti-sec="${x.i}" title="Seç">+${x.i + 1}</th>`).join('')}</tr>${alanlar.map((k) => `<tr><td>${esc(LABEL[k] || k)}</td>${L.map((x) => `<td>${Number(x.it[k]) || 0}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="9">Ek özellik yok</td></tr>'}</table>`;
    };
    const ikon = (r, tur, i) => r ? `<span class="vi-mini" data-${tur}="${i}" title="">${iconHtml(r, 30)}<em>+${tur === 'reb' ? i + 1 : i + 1}</em></span>` : `<span class="vi-mini bos"><em>+${i + 1}</em></span>`;
    box.innerHTML = `<div class="vi-baslik">${iconHtml(sel, 50)}<div><div class="vi-dad">${esc(kendiAdli(g.ad))}</div><div class="vi-dno">${esc(KIND[g.kind] || 'Tür ' + g.kind)} (${g.kind}) · ${g.normal.length} normal sürüm</div></div></div>
      ${!oyuncu && sb ? `<div class="vi-ayar">
        <label><input type="checkbox" name="ay-ors" ${ay.ors_bas ? 'checked' : ''}> Örste + basılsın</label>
        <label><input type="checkbox" name="ay-reb" ${ay.reb_acik ? 'checked' : ''}> Yeniden dökme olsun (Rebirth / Reverse Strengthen Scroll)</label>
        <label>Gereken parşömen <select name="ay-sinif"><option value="">Otomatik (eşya sınıfı)</option><option value="1" ${ay.sinif === 1 ? 'selected' : ''}>Low Class (her parşömen)</option><option value="2" ${ay.sinif === 2 ? 'selected' : ''}>Middle Class</option><option value="3" ${ay.sinif === 3 ? 'selected' : ''}>High Class / Blessed</option></select></label>
        <span class="vi-ayar-durum">Değişiklikler bu türün tüm +1…+10 ve yeniden dökme sürümlerine anında uygulanır.</span></div>` : ''}
      ${taban ? `<div class="vi-alt-baslik">Temel</div><div class="vi-serit">${`<span class="vi-mini" data-taban="1">${iconHtml(taban, 30)}<em>+0</em></span>`}</div>` : ''}
      <div class="vi-alt-baslik">Normal +1 … +${artiSay()}</div><div class="vi-serit">${arti.slice(0, artiSay()).map((r, i) => ikon(r, 'arti', i)).join('')}</div><div class="vi-arti-kutu">${degerTablo()}</div>
      <div class="vi-alt-baslik">Yeniden dökme ${ay.reb_acik ? '' : '<span class="vi-kapali">(kapalı)</span>'}</div><div class="vi-serit vi-reb-serit">Yükleniyor…</div>
      <div class="vi-alt-detay"></div>
      ${!oyuncu && sb && character ? `<div class="vi-ver vi-tur-sil"><button data-k="tur-sil" class="ay-dugme tehlike">Bu türü tamamen sil</button></div>` : ''}`;
    // yeniden dökme sürümleri sunucudan (tür başına önbellek)
    let reb = REB_GRUP.get(anahtar);
    if (!reb && sb) {
      const desen = g.ad.replace(/[%_\\]/g, (c) => '\\' + c) + '%(+%';
      // (6.11) Reverse: oyundaki Rebirth / Buy Merchant ile aynı kaynak — özgün KO reverse eşyaları (ItemType 11, Item_Ext 24-41; blok başına +1…+30,
      //   ardışık numaralar; her blok tek etki: Light / element / stat / direnç). Türün ItemType 11 sürümü yoksa eski ItemType 12 satırları.
      const [{ data: d }, { data: d2 }] = await Promise.all([
        sb.from('items').select('*').eq('kind', g.kind).eq('silindi', false).ilike('name', desen).not('item_type', 'in', '(11,12)').order('num').limit(600),
        sb.from('items').select('*').eq('kind', g.kind).eq('silindi', false).ilike('name', desen).in('item_type', [11, 12]).lt('num', 900000000).order('num').limit(1000)]);
      const enIyi = new Map(), normalDb = new Map(), bloklar = new Map();
      for (const row of d || []) {
        if (temelAd(row.name) !== g.ad || row.category === 'beta') continue; const n = artiOf(row.name); if (n == null) continue;
        if (![1, 2].includes(Number(row.item_type)) && n <= 10 && !normalDb.has(n)) normalDb.set(n, row);   // sitedeki eşya dosyasında olmayan normal sürümler (sonradan eklenen)
      }
      const r11 = (d2 || []).filter((row) => temelAd(row.name) === g.ad && row.category !== 'beta' && !row.custom && Number(row.item_type) === 11 && artiOf(row.name) != null);
      for (const row of r11) { const n = artiOf(row.name), bas = Number(row.num) - n + 1; if (!bloklar.has(bas)) bloklar.set(bas, []); bloklar.get(bas).push({ n, satir: ozelSatir(row), row }); }
      if (!r11.length) for (const row of d2 || []) { if (temelAd(row.name) !== g.ad || Number(row.item_type) !== 12) continue; const n = artiOf(row.name); if (n != null && !enIyi.has(n)) enIyi.set(n, row); }
      reb = r11.length
        ? [...bloklar.entries()].map(([b, L]) => [b, L, rebEtki(L.find((x) => x.n === 1)?.row || L[0].row)]).sort((a, b) => (a[2].endsWith('Light') - b[2].endsWith('Light')) || a[0] - b[0]).flatMap(([, L, et]) => { return L.sort((a, b) => a.n - b.n).map((x) => ({ n: x.n, satir: x.satir, blok: et })); })
        : [...enIyi.entries()].sort((a, b) => a[0] - b[0]).map(([n, row]) => ({ n, satir: ozelSatir(row), blok: '' }));
      reb.normalDb = normalDb;
      REB_GRUP.set(anahtar, reb);
    }
    if (sel?.grup !== g) return;
    // normal şeritte boş kalan artıları sunucudaki satırlarla doldur
    if (reb?.normalDb?.size) {
      let degisti = false;
      for (let i = 0; i < 10; i++) if ((!arti[i] || takiMi) && reb.normalDb.has(i + 1)) {   // takı: değerler her zaman sunucudan (+4 / +5 bonusları sonradan dolduruldu)
        const yeni = ozelSatir(reb.normalDb.get(i + 1)), iI = F.indexOf('ikon'); if (arti[i] && iI >= 0 && !yeni[iI]) yeni[iI] = arti[i][iI];
        arti[i] = yeni; degisti = true;
      }
      if (degisti) { box.querySelectorAll('.vi-serit')[taban ? 1 : 0].innerHTML = arti.slice(0, artiSay()).map((r, i) => ikon(r, 'arti', i)).join(''); const k = box.querySelector('.vi-arti-kutu'); if (k) k.innerHTML = degerTablo(); }
    }
    const rs = box.querySelector('.vi-reb-serit');
    rs.classList.toggle('kapali', !ay.reb_acik);
    rs.innerHTML = reb?.length ? reb.map((x, i) => `${x.blok && x.blok !== reb[i - 1]?.blok ? `<div class="vi-reb-blok">${esc(x.blok)}</div>` : ''}<span class="vi-mini reb" data-reb="${i}">${iconHtml(x.satir, 30)}<em>+${x.n}</em></span>`).join('') : (!oyuncu && sb && character ? '<span class="ay-not">Bu türün yeniden dökme sürümü yok.</span> <button class="ay-dugme vi-reb-uret">Yeniden dökme sürümlerini oluştur (+1…+21)</button>' : '<span class="ay-not">Bu türün yeniden dökme sürümü yok.</span>');
    const bul = (el) => el.dataset.arti != null ? arti[Number(el.dataset.arti)] : el.dataset.reb != null ? reb[Number(el.dataset.reb)]?.satir : el.dataset.taban ? taban : null;
    box.querySelectorAll('[data-arti-sec]').forEach((th) => th.addEventListener('click', () => box.querySelector(`.vi-mini[data-arti="${th.dataset.artiSec}"]`)?.click()));
    box.querySelectorAll('.vi-mini').forEach((el) => {
      const r = bul(el); if (!r) return;
      el.addEventListener('pointermove', (ev) => ipucuGoster(fromTsv(r, F), ev));
      el.addEventListener('pointerleave', ipucuKapa);
      el.addEventListener('click', () => { ipucuKapa(); box.querySelectorAll('.vi-mini.secili').forEach((x) => x.classList.remove('secili')); el.classList.add('secili'); altSec = r; altDetay(box.querySelector('.vi-alt-detay'), r); });
    });
    // ayar değişince anında kaydet (alt menü kapanınca ana türün ayarı olarak kalır)
    const kaydet = async () => {
      const yeni = { ors_bas: box.querySelector('[name=ay-ors]').checked, reb_acik: box.querySelector('[name=ay-reb]').checked, sinif: Number(box.querySelector('[name=ay-sinif]').value) || null };
      const dur = box.querySelector('.vi-ayar-durum'); dur.textContent = 'Kaydediliyor…';
      const { data: d, error } = await sb.rpc('gm_esya_ayar_kaydet', { p_char: character.id, p_ad: g.ad, p_kind: g.kind, p_ors_bas: yeni.ors_bas, p_reb_acik: yeni.reb_acik, p_sinif: yeni.sinif });
      if (error || !d?.ok) { dur.textContent = d?.mesaj || error?.message || 'Kaydedilemedi.'; return; }
      AYAR.set(anahtar, { ad: g.ad, kind: g.kind, ...yeni }); dur.textContent = d.uretilen ? `Kaydedildi — ${d.uretilen} yeniden dökme sürümü (+1…+21) oluşturuldu.` : 'Kaydedildi — bu türün tüm sürümlerine uygulandı.'; if (d.uretilen) { REB_GRUP.delete(anahtar); REB_SATIR.clear(); }
      rs.classList.toggle('kapali', !yeni.reb_acik); renderList();
      if (d.uretilen && sel?.grup === g) { const not = dur.textContent; await grupDetay(box, g); const d2 = box.querySelector('.vi-ayar-durum'); if (d2) d2.textContent = not; }   // (3.11) üretilen sürümler şeritte hemen görünsün
    };
    box.querySelectorAll('.vi-ayar input, .vi-ayar select').forEach((e) => e.addEventListener('change', kaydet));
    // (3.11) 'Yeniden dökme olsun' zaten işaretliyken (varsayılan) üretim tek tıkla: kutuyu işaretle + kaydet
    rs.querySelector('.vi-reb-uret')?.addEventListener('click', (e) => { e.currentTarget.disabled = true; const c = box.querySelector('[name=ay-reb]'); if (c) c.checked = true; kaydet(); });
    // türün tüm sürümlerini sil (yedekte kalır; "Silinen eşyalar"dan tek tek geri alınır) — iki kez basarak onay
    const ts = box.querySelector('[data-k="tur-sil"]');
    ts?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!ts.dataset.onay) { ts.dataset.onay = '1'; ts.textContent = `Emin misin? "${g.ad}" türünün tüm sürümleri silinecek — tekrar bas`; return; }
      ts.disabled = true;
      const { data: d, error } = await sb.rpc('gm_esya_tur_sil', { p_char: character.id, p_ad: g.ad, p_kind: g.kind });
      if (error || !d?.ok) { ts.disabled = false; hud.notice?.(d?.mesaj || error?.message || 'Could not delete.', 'hata'); return; }
      hud.info?.(`${g.ad}: ${d.adet} versions deleted from the database (kept in backup).`, 'hata');
      REB_GRUP.delete(anahtar); REB_SATIR.delete(cat); await silinenYukle(); sel = null; await selectCat(cat); silSay();
    });
    katEkle(box, (g.normal[0] || [])[0]);
  }
  function altDetay(kutu, r) {
    const it = fromTsv(r, F);
    kutu.innerHTML = `<div class="vi-alt-baslik">Seçili sürüm</div><div class="vi-baslik">${iconHtml(r, 40)}<div><div class="vi-dad" style="color:${nameColor(it)}">${esc(it.strName)}</div><div class="vi-dno">#${it.Num}</div></div></div>
      ${character ? `<div class="vi-ver"><input type="number" name="adet" min="1" max="9999" value="1"><button data-k="ver-alt" class="ay-dugme">Envanterime ekle</button></div>` : ''}
      ${!oyuncu && sb && character ? `<div class="vi-ver"><button data-k="surum-sil" class="ay-dugme tehlike">Bu sürümü sil</button></div>` : ''}`;
    katEkle(kutu, it.Num);
    const b = kutu.querySelector('[data-k="surum-sil"]');
    b?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!b.dataset.onay) { b.dataset.onay = '1'; b.textContent = 'Emin misin? Tekrar bas'; return; }
      b.disabled = true;
      const { data: d, error } = await sb.rpc('gm_esya_sil', { p_char: character.id, p_num: Number(it.Num) });
      if (error || !d?.ok) { b.disabled = false; hud.notice?.(d?.mesaj || error?.message || 'Could not delete.', 'hata'); return; }
      hud.info?.(`${it.strName} deleted from the database (kept in backup).`, 'hata');
      REB_GRUP.clear(); REB_SATIR.delete(cat); await silinenYukle(); const eski = sel?.grup ? sel.grup.ad + '|' + sel.grup.kind : null; await selectCat(cat); silSay();
      if (eski) { const i = view.findIndex((r) => r.grup && r.grup.ad + '|' + r.grup.kind === eski); if (i >= 0) { sel = view[i]; renderList(); renderDetail(); } }
    });
  }
  const selRef = () => sel;
  async function selectCat(id) {
    if (!win) return;
    cat = id; sel = null; altSec = null; ipucuKapa();
    if (grupModu()) await ayarYukle().catch(() => null);
    win.querySelectorAll('.vi-kat button').forEach((b) => b.classList.toggle('secili', b.dataset.c === id));
    win.querySelector('.vi-sayi').textContent = 'Yükleniyor…';
    const iKind = F.indexOf('Kind');
    const tekli = TEKLI.find((c) => c.id === id);
    if (id === 'silinen') {
      const nums = [...SILINEN.keys()], out = [];
      for (let i = 0; i < nums.length; i += 150) { const { data: rows } = await sb.from('items').select('*').in('num', nums.slice(i, i + 150)); for (const r of rows || []) { const x = ozelSatir(r); x.ozel = r.custom ? r : null; out.push(x); } }
      all = out;
    } else if (String(id).startsWith('k:')) {
      const { data: nums } = await sb.rpc('gm_esya_kat_uyeler', { p_char: character.id, p_id: Number(id.slice(2)) });
      const L = Array.isArray(nums) ? nums : [], out = [];
      for (let i = 0; i < L.length; i += 150) { const { data: rows } = await sb.from('items').select('*').in('num', L.slice(i, i + 150)); for (const r of rows || []) { const x = ozelSatir(r); x.ozel = r.custom ? r : null; out.push(x); } }
      all = out;
    } else if (id === 'ozel') all = await loadCat('ozel');
    else if (id === 'beta') all = await loadCat('beta');
    else if (id === 'hepsi' || (tekli && !tekli.dosya)) {
      let out = [];
      for (const c of meta.kategoriler) { if (!win) return; win.querySelector('.vi-sayi').textContent = `Yükleniyor… ${c.ad}`; out = out.concat(await loadCat(c.id)); }
      all = id === 'hepsi' ? out : out.filter((r) => !BILINEN.has(Number(r[iKind])));
    } else if (tekli) {
      const k = new Set(tekli.kind); all = (await loadCat(tekli.dosya)).filter((r) => k.has(Number(r[iKind])));
    } else all = await loadCat(id);
    if (!win) return;
    if (id !== 'silinen' && SILINEN.size) all = all.filter((r) => !SILINEN.has(Number(r[0])));
    if (fil.reb || fil.rebArti) await rebYukle();
    win.querySelector('.vi-parca').hidden = !(tekli?.dosya === 'zirh');
    if (win.querySelector('.vi-parca').hidden) { fil.parca = ''; win.querySelector('[name=parca]').value = ''; }
    if (cat !== id) return;
    filter(); renderDetail();
  }

  async function give(btn, hedef = null) {
    const sel = hedef || selRef();
    if (!sel || !sb || !character) return;
    const n = Math.max(1, Math.min(9999, Number(win.querySelector('[name=adet]')?.value) || 1));
    btn.disabled = true;
    try {
      const { data, error } = oyuncu ? await sb.rpc('esyadb_al', { p_char: character.id, p_num: col(sel, 'Num'), p_count: n })
        : await sb.rpc('gm_give_item', { p_char: character.id, p_num: col(sel, 'Num'), p_count: n });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.reason);
      hud.notice?.(data?.hak != null ? `${col(sel, 'strName')} added to inventory: ${n} pack(s) of 10 (each in its own slot, 10 uses).` : `${col(sel, 'strName')} added to inventory (slot ${data?.slot ?? '?'}).`);   // (7.11) Genie 10'luk paket: miktar = hak (durability)
      onGive?.();
    } catch (e) { hud.notice?.(e.message, 'hata'); say?.(e.message, 'hata'); } finally { btn.disabled = false; }
  }
  async function silGeri(geri, btn) {
    if (!sel || !sb || !character) return;
    const num = Number(col(sel, 'Num')), ad = col(sel, 'strName');
    if (!geri && silOnay !== num) { silOnay = num; renderDetail(); return; }
    silOnay = null; btn.disabled = true;
    const { data: d, error } = await sb.rpc(geri ? 'gm_esya_geri' : 'gm_esya_sil', { p_char: character.id, p_num: num });
    btn.disabled = false;
    if (error || !d?.ok) { hud.notice?.(d?.mesaj || error?.message || 'Operation failed.', 'hata'); return; }
    await silinenYukle();
    hud.info?.(geri ? `${ad} restored.` : `${ad} deleted from the database (kept in backup).`, geri ? 'seviye' : 'hata');
    sel = null; await selectCat(cat); silSay();
  }
  const silSay = () => { const b = win?.querySelector('[data-c="silinen"] i'); if (b) b.textContent = SILINEN.size ? SILINEN.size.toLocaleString('tr-TR') : ''; };
  async function dbCount() {
    if (!sb) return;
    const { count } = await sb.from('items').select('num', { count: 'exact', head: true }).eq('silindi', false);   // silinen eşyalar sayılmaz
    const st = win?.querySelector('.vi-db'); if (st && count != null) st.textContent = `Veritabanında ${count.toLocaleString('tr-TR')} eşya var · site güncellenince otomatik aktarılır.`;
  }

  async function open(host = null) {
    if (win) { if (host && win.parentNode !== host) host.append(win); win.hidden = false; if (!host) toFront(win); return; }
    await loadMeta();
    const sayilar = meta.tekli || {};
    win = document.createElement('div'); win.id = 'veri-pencere'; win.className = 'ko-panel ko-pencere';
    win.innerHTML = `<div class="ay-baslik">Veri Tabanı — Eşyalar<button class="ay-kapat" data-k="kapat" title="Kapat">✕</button></div>
      <div class="vi-ust"><input name="ara" placeholder="Ara: eşya adı ya da numarası" autocomplete="off"><select name="arti" title="Eşya artısı"><option value="">Artı: tümü</option>${Array.from({ length: 11 }, (_, i) => `<option value="${i}">+${i}</option>`).join('')}</select>
        <select name="reb" title="Normal / yeniden dökme (rebirth) eşyalar"><option value="">Tür: tümü</option><option value="normal">Normal</option><option value="reb">Yeniden dökme</option></select><select name="rebArti" title="Yeniden dökme +N"><option value="">Yeniden dökme +: tümü</option>${Array.from({ length: 30 }, (_, i) => `<option value="${i + 1}">Reb +${i + 1}</option>`).join('')}</select>
        <select name="bas" title="Örste + basılabilir eşyalar"><option value="">Basılabilir: tümü</option><option value="hepsi">+ basılabilir</option><option value="yok">Basılamaz</option></select>
        <select name="sinif" title="Artı basmak için gereken parşömen"><option value="">Parşömen: tümü</option><option value="1">Alt sınıf (her parşömenle basılır)</option><option value="2">Orta sınıf (Middle Class ile)</option><option value="3">Üst sınıf (High Class / Blessed ile)</option></select>
        <select name="sira" title="Sıralama"><option value="">Sırala: ad</option><option value="hasar-">Hasar: yüksek → düşük</option><option value="hasar+">Hasar: düşük → yüksek</option><option value="ac-">Savunma: yüksek → düşük</option><option value="ac+">Savunma: düşük → yüksek</option><option value="sv-">Seviye: yüksek → düşük</option><option value="sv+">Seviye: düşük → yüksek</option></select><button class="ay-dugme vi-grupla secili" data-k="grupla" title="Silah ve zırhlarda her tür tek satır (nadir / büyülü gizli); kapalıyken tüm sürümler tek tek">Türe göre</button><button class="ay-dugme vi-sifirla" data-k="sifirla" title="Aramayı ve tüm süzgeçleri sıfırla">Sıfırla</button>
        <span class="vi-parca" hidden><select name="parca" title="Zırh parçası"><option value="">Parça: tümü</option>${Object.entries(PARCA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></span>
        <span class="vi-sayi"></span></div>
      <div class="vi-govde">
        <div class="vi-kat"><button data-c="hepsi"><span>Tümü</span><i>${meta.toplam.toLocaleString('tr-TR')}</i></button>${TEKLI.map((c) => `<button data-c="${c.id}"><span>${esc(c.ad)}</span><i>${sayilar[c.id] != null ? sayilar[c.id].toLocaleString('tr-TR') : ''}</i></button>`).join('')}${!oyuncu ? '<button data-c="silinen" class="vi-silinen-kat"><span>Silinen eşyalar (yedek)</span><i></i></button>' : ''}</div>
        <div class="vi-liste"><div class="vi-ic"></div></div>
        <div class="vi-detay"></div>
      </div>
      <div class="vi-alt"><span class="vi-db">Veritabanı durumu okunuyor…</span></div>`;
    if (host) { win.className = 'g2-gomulu'; host.append(win); win.querySelector('.ay-baslik')?.remove(); }
    else { document.body.append(win); koWindow(win); toFront(win); const k = document.createElement('button'); k.className = 'ko-kapat'; k.dataset.k = 'kapat'; k.title = 'Kapat'; win.append(k); win.querySelector('.ay-baslik .ay-kapat')?.remove(); }
    win.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(win); });
    win.addEventListener('keydown', (e) => { e.stopPropagation(); const kd = e.target.closest?.('.vi-kat-duz input'); if (kd) { if (e.key === 'Enter') katKaydet(kd.dataset.kd); if (e.key === 'Escape') { katDuzen = null; katCiz(); } return; } if (e.key === 'Escape' && !host) close(); });
    win.addEventListener('wheel', (e) => e.stopPropagation());
    win.querySelector('.vi-liste').addEventListener('scroll', () => requestAnimationFrame(renderList));
    let qt = 0;
    win.addEventListener('input', (e) => {
      if (e.target.name === 'ara') { clearTimeout(qt); qt = setTimeout(async () => { q = e.target.value; if (q.trim() && !cat) await selectCat('hepsi'); else filter(); }, 250); }   // kategori seçiliyse arama o kategorinin içinde
      if (e.target.name === 'sira') { sira = e.target.value; filter(); return; }
      if (e.target.name in fil) { fil[e.target.name] = e.target.value; if ((e.target.name === 'reb' || e.target.name === 'rebArti') && e.target.value) rebYukle().then(() => filter()); else filter(); }
    });
    win.addEventListener('click', async (e) => {
      if (e.target.closest('[data-ka]')) { katIslem(e); return; }
      if (e.target.closest('.vi-kat-duz')) return;
      const c = e.target.closest('[data-c]'); if (c) { katDuzen = null; return selectCat(c.dataset.c); }
      const row = e.target.closest('.vi-satir'); if (row) { sel = view[Number(row.dataset.i)]; silOnay = null; renderList(); renderDetail(); return; }
      const k = e.target.closest('button')?.dataset.k;
      if (k === 'kapat') close();
      if (k === 'ozel-duzenle' && sel?.ozel) onEdit?.(sel.ozel);
      if (k === 'sifirla') sifirla();
      if (k === 'ver') give(e.target.closest('button'));
      if (k === 'ver-alt') give(e.target.closest('button'), altSec);
      if (k === 'grupla') { grupla = !grupla; e.target.closest('button').classList.toggle('secili', grupla); sel = null; filter(); renderDetail(); }
      if (k === 'sil') silGeri(false, e.target.closest('button'));
      if (k === 'geri') silGeri(true, e.target.closest('button'));
    });
    await silinenYukle().catch(() => {}); await katYukle().catch(() => {}); katCiz(); silSay();
    selectCat(oyuncu ? 'hepsi' : TEKLI[0].id);
    dbCount().catch(() => {});
  }
  function close() { win?.remove(); win = null; }
  return { open, close, get isOpen() { return !!win; } };
}
