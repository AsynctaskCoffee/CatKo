// Eşya verisi ortak yardımcıları: ikon atlası (KO itemicon_*.dxt), tür adları, KO tarzı ipucu (tooltip).
// Veriler: assets/esya/index.json (alanlar, kategoriler, ikonlar: anahtar→atlas sırası, surum) + aciklama.json (Item_Org açıklamaları).
export const BASE = './assets/esya';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let META = null, DESC = null;
export async function loadMeta() {
  if (META) return META;
  META = await (await fetch(`${BASE}/index.json`)).json();
  setYukle();
  return META;
}
// (5.11) KO set_item_us.tbl (setler.json): esya {org: [grup, parça biti]}, setler {grup*10000+maske: [ad, ac, hp, mp, str, sta, dex, int, cha, ateş, buz, şimşek, zehir, büyü, lanet]},
// parca {grup: {bit: ad}} — kask 2, üst 16, alt 512, eldiven 2048, çizme 4096
let SETLER = null, SETLER_P = null, KUSANILI_ORG = [];
export const setYukle = () => (SETLER_P ||= fetch(`${BASE}/setler.json`).then((r) => r.json()).then((d) => (SETLER = d)).catch(() => null));
export const kusaniliSetAyarla = (orgs) => { KUSANILI_ORG = (orgs || []).map(Number); };
export async function loadDesc() {
  if (DESC) return DESC;
  DESC = await (await fetch(`${BASE}/aciklama.json`)).json().catch(() => ({}));
  return DESC;
}
export const meta = () => META;
/** Kullanım haklı eşya (Premium Potion 5000, 30'luk scrollar): sayılamaz, dayanıklılık = kalan kullanım hakkı */
export const GENIE_SPIRIT = new Set([810305000, 810378000, 811062000, 900772000]);   // (7.11) Spirit of Genie: hak = dayanıklılık, yığın en çok 10
export const hakli = (it) => GENIE_SPIRIT.has(Number(it?.Num)) || (Number(it?.Kind) === 255 && !(Number(it?.Countable) > 0) && Number(it?.Duration) > 1 && Number(it?.Effect1) >= 490000);
// KO kostüm sertifikası efektleri (kostum_bonus tablosu): eşya adında değil, ipucunda yazılır
const KOSTUM = new Map();
// BETA eşyaları (items.category = 'beta'; Beta NPC ZIRHLAR / SİLAHLAR / TAKILAR tezgâhları): ipucunun en altında ortalı yeşil kalın [BETA EŞYASI] (örste basılamaz)
const BETA = new Set();
/** KO Item_Org açıklamasındaki işaretleme: <b>…</b>, <font color=@#RRGGBB@ / @lime@>…</font>, <selfname> → güvenli HTML (diğer her şey kaçışlanır) */
function koMetin(t) {
  const parca = String(t).split(/(<\/?b>|<font color=@[#\w]+@>|<\/font>|<selfname>)/i);
  let acik = 0;
  const h = parca.map((x) => {
    if (/^<b>$/i.test(x)) return '<b>'; if (/^<\/b>$/i.test(x)) return '</b>';
    const m = /^<font color=@([#\w]+)@>$/i.exec(x); if (m) { acik++; return `<span style="color:${/^#[0-9a-f]{3,6}$/i.test(m[1]) || /^[a-z]+$/i.test(m[1]) ? m[1] : 'inherit'}">`; }
    if (/^<\/font>$/i.test(x)) { if (!acik) return ''; acik--; return '</span>'; }
    if (/^<selfname>$/i.test(x)) return KENDI_AD ? esc(KENDI_AD) : 'karakterin';
    return esc(x).replace(/\s*\|\s*/g, '<br>');   // KO: '|' satır sonu
  }).join('');
  return h + '</span>'.repeat(acik);
}
export function betaEsyaAyarla(nums) { for (const n of nums || []) BETA.add(Number(n)); }
export function kostumBonusAyarla(rows) { for (const r of rows || []) KOSTUM.set(Number(r.num), r); }

export const KIND = {   // KO'nun özgün eşya türü adları (Texts_us.tbl 2501–2540); tabloda olmayanlar KO İngilizcesiyle
  11: 'Dagger', 21: 'One-handed Sword', 22: 'Two-handed Sword', 31: 'Axe', 32: 'Two-handed Axe', 41: 'Club', 42: 'Two-handed Club', 43: 'Jamadar',
  51: 'Spear', 52: 'Long Spear', 60: 'Shield', 61: 'Pickaxe', 62: 'Pitchfork', 63: 'Fishing Rod', 70: 'Bow', 71: 'Crossbow', 91: 'Earring', 92: 'Necklace', 93: 'Ring', 94: 'Belt',
  95: 'Quest Item', 97: 'Potion', 98: 'Upgrade Scroll', 101: 'Familiar', 110: 'Staff', 120: 'Arrow', 130: 'Javelin', 140: 'Light', 150: 'Familiar egg', 151: 'Familiar',
  152: 'Familiar', 160: 'Ring', 170: 'Auto Loot', 171: 'Cospre', 172: 'Package', 173: 'Package', 174: 'Package', 175: 'Food', 176: 'Food', 181: 'Priest Weapon',
  200: 'Kurian Armor', 210: 'Warrior Armor', 220: 'Rogue Armor', 230: 'Magician Armor', 240: 'Priest Armor', 250: 'Scroll', 252: 'Skill', 253: 'Sealed Item', 254: 'Skill Scroll', 255: 'Premium',
};
// KO eşya derecesi (ITEM.ItemType): ad rengi — adlar KO'nun özgün metinleri (Texts_us.tbl 2401–2409)
export const RARITY = { 1: ['Magic', '#6aa8ff'], 2: ['Rare', '#ffe23a'], 3: ['Craft', '#7bff6b'], 4: ['Unique', '#eed98b'], 5: ['Upgrade', '#d48ae6'], 6: ['Event', '#ff9ad8'],
  11: ['Reverse', '#e98ba6'], 12: ['Reverse', '#e98ba6'] };   // (6.11) KO: ItemType 11 = özgün reverse (Item_Ext 24-41)   // yeniden dökme (rebirth) eşya adı pembe
export const LABEL = {
  Damage: 'Attack Power', Delay: 'Attack Speed', Range: 'Effective Range', Weight: 'Weight', Duration: 'Max Durability', BuyPrice: 'Alış fiyatı', SellPrice: 'Satış fiyatı', Ac: 'Defense Ability', Countable: 'Sayılabilir',
  ReqLevel: 'Gerekli seviye', ReqLevelMax: 'En yüksek seviye', ReqRank: 'Gerekli rütbe', ReqTitle: 'Gerekli unvan', ReqStr: 'Gerekli Güç', ReqSta: 'Gerekli Sağlık', ReqDex: 'Gerekli Çeviklik', ReqIntel: 'Gerekli Zeka', ReqCha: 'Gerekli Büyü Gücü',
  ItemType: 'Derece', Hitrate: 'Attack Power %', Evasionrate: 'Dodging Rate %', DaggerAc: 'Defense Ability (Dagger)', SwordAc: 'Defense Ability (Sword)', MaceAc: 'Defense Ability (Club)', AxeAc: 'Defense Ability (Ax)', SpearAc: 'Defense Ability (Spear)', BowAc: 'Defense Ability (Arrow)',
  FireDamage: 'Flame Damage', IceDamage: 'Glacier Damage', LightningDamage: 'Lightning Damage', PoisonDamage: 'Poison Damage', HPDrain: 'HP Recovery', MPDamage: 'MP Damage', MPDrain: 'MP Recovery', MirrorDamage: 'Repel Physical Attack',
  StrB: 'Strength Bonus', StaB: 'Health Bonus', DexB: 'Dexterity Bonus', IntelB: 'Intelligence Bonus', ChaB: 'Magic Power Bonus', MaxHpB: 'HP Bonus', MaxMpB: 'MP Bonus',
  FireR: 'Resistance to Flame', ColdR: 'Resistance to Glacier', LightningR: 'Resistance to Lightning', MagicR: 'Resistance to Magic', PoisonR: 'Resistance to Poison', CurseR: 'Resistance to Curse',
  Effect1: 'Etki 1', Effect2: 'Etki 2', ItemExt: 'Uzantı', ItemClass: 'Eşya sınıfı', SellingGroup: 'Satış grubu', UpgradeNotice: 'Yükseltme duyurusu', NPbuyPrice: 'NP fiyatı', Bound: 'Bağlı',
  Slot: 'Yuva', Race: 'Irk', Class: 'Sınıf',
};
// veritabanı (snake_case) → KO alan adları
const DB2F = { num: 'Num', name: 'strName', kind: 'Kind', slot: 'Slot', race: 'Race', class: 'Class', damage: 'Damage', delay: 'Delay', range: 'Range', weight: 'Weight', duration: 'Duration',
  buy_price: 'BuyPrice', sell_price: 'SellPrice', ac: 'Ac', countable: 'Countable', req_level: 'ReqLevel', req_level_max: 'ReqLevelMax', req_rank: 'ReqRank', req_title: 'ReqTitle',
  req_str: 'ReqStr', req_sta: 'ReqSta', req_dex: 'ReqDex', req_intel: 'ReqIntel', req_cha: 'ReqCha', item_type: 'ItemType', hitrate: 'Hitrate', evasionrate: 'Evasionrate',
  dagger_ac: 'DaggerAc', sword_ac: 'SwordAc', mace_ac: 'MaceAc', axe_ac: 'AxeAc', spear_ac: 'SpearAc', bow_ac: 'BowAc', fire_damage: 'FireDamage', ice_damage: 'IceDamage',
  lightning_damage: 'LightningDamage', poison_damage: 'PoisonDamage', hp_drain: 'HPDrain', mp_damage: 'MPDamage', mp_drain: 'MPDrain', mirror_damage: 'MirrorDamage',
  str_b: 'StrB', sta_b: 'StaB', dex_b: 'DexB', intel_b: 'IntelB', cha_b: 'ChaB', max_hp_b: 'MaxHpB', max_mp_b: 'MaxMpB', fire_r: 'FireR', cold_r: 'ColdR', lightning_r: 'LightningR',
  magic_r: 'MagicR', poison_r: 'PoisonR', curse_r: 'CurseR', effect1: 'Effect1', effect2: 'Effect2', org_num: 'org', icon_key: 'ikon', approx_icon: 'yaklasik', model_res: 'ModelRes', aciklama: 'Aciklama', efekt: 'Efekt', ad_renk: 'AdRenk', custom: 'Ozel', item_class: 'ItemClass', category: 'Kategori', kaynak_num: 'KaynakNum' };
// KO: yükseltilemeyen eşyaların (iksir, parşömen, ok, görev eşyası, sikke…) adında "(+0)" görünmez
const ARTISIZ = new Set([95, 97, 98, 120, 130, 150, 172, 173, 174, 175, 176]);
// <selfname>'s … eşyaları: her oyuncu kendi karakter adını görür
let KENDI_AD = '';
export function kendiAdAyarla(ad) { KENDI_AD = String(ad || ''); }
export const kendiAdli = (t) => (typeof t === 'string' && t.includes('<') ? t.replace(/<selfname>/gi, KENDI_AD || 'Karakter') : t);
function adTemizle(o) {
  if (typeof o.strName === 'string') o.strName = kendiAdli(o.strName);
  if (typeof o.strName === 'string' && /\(\+0\)\s*$/.test(o.strName) && (Number(o.Countable) > 0 || ARTISIZ.has(Number(o.Kind)))) o.strName = o.strName.replace(/\s*\(\+0\)\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  return o;
}
export function fromDb(row) { const o = {}; for (const [k, v] of Object.entries(row)) if (DB2F[k]) o[DB2F[k]] = typeof v === 'boolean' ? (v ? 1 : 0) : v; return adTemizle(o); }
export function fromTsv(r, F) { const o = {}; F.forEach((k, i) => (o[k] = r[i])); return adTemizle(o); }

/** KO envanter yuvası gibi siyah çerçeveli ikon; boyut = yuvanın dış ölçüsü */
/** KO fiyat gösterimi: Noah eşya ikonu (#900000000, 9_0001_00_0) + tutar — "500.000 Noah" */
export function noahHtml(n, size = 20) {
  // (31.10) çerçevesiz: yalnız Noah kesesi (KO 9_0001_00_0 ikonundan, çerçeve ve siyah zemin ayıklanmış — assets/ui/noah-ikon.png)
  return `<span class="noah-fiyat"><i class="noah-ikon" style="width:${size}px;height:${size}px"></i><b>${Number(n || 0).toLocaleString('tr-TR')}</b> Noah</span>`;
}
export function iconHtml(it, size = 34) {
  let i = META?.ikonlar?.[it?.ikon], a = META?.atlas;
  // ek atlas (ikonlar-ek.webp): sonradan eklenen ikonlar (Nereids, Nereids Voucher…)
  if (!(i >= 0) && META?.ek?.ikonlar?.[it?.ikon] >= 0) { i = META.ek.ikonlar[it.ikon]; a = META.ek; }
  // deadsoft 2369 atlası (ikonlar-ds.webp): v2038'de olmayan ikonlar
  if (!(i >= 0) && META?.ds?.ikonlar?.[it?.ikon] >= 0) { i = META.ds.ikonlar[it.ikon]; a = META.ds; }
  // orijinal KO atlası (ikonlar-orj.webp): yeni orijinal eşyaların ikonları
  if (!(i >= 0) && META?.orj?.ikonlar?.[it?.ikon] >= 0) { i = META.orj.ikonlar[it.ikon]; a = META.orj; }
  if (!(i >= 0)) return `<span class="ko-yuva" style="width:${size}px;height:${size}px"><span class="ko-yuva-bos">${esc((KIND[it?.Kind] || '?').slice(0, 1))}</span></span>`;
  // KO ikon dokusu 64x64, resim sol üstteki 45x45 bölgede → o bölge yuvanın iç alanını tam doldursun.
  // (4.11) ölçüler yüzde: yuva CSS ile hangi boyuta getirilirse getirilsin (100%, 32px…) ikon kenarlara birebir oturur;
  //   atlaslarda 45. pikselden sonrası ikonun kenar pikseliyle doldurulmuş — ölçeklemede komşu dolgu (beyaz / renkli) sızmaz
  const ic = a.icerik || 45, olc = a.boyut / ic, satir = a.satir || Math.ceil((a.sayi || 1) / a.kolon) || 1;
  const bw = a.kolon * olc, bh = satir * olc, kx = i % a.kolon, ky = Math.floor(i / a.kolon);
  const px = bw > 1 ? kx * olc / (bw - 1) * 100 : 0, py = bh > 1 ? ky * olc / (bh - 1) * 100 : 0;
  return `<span class="ko-yuva" style="width:${size}px;height:${size}px"><span class="ko-yuva-ikon" style="background-image:url(${BASE}/${a.dosya});background-size:${(bw * 100).toFixed(4)}% ${(bh * 100).toFixed(4)}%;background-position:${px.toFixed(5)}% ${py.toFixed(5)}%"></span>${artiEtiket(it)}</span>`;
}
// KO: simgenin sol üstünde eşyanın artısı (+N) — normal mor, yeniden dökme (rebirth) kırmızı, eşsiz rebirth ad renginde
// (Seçenekler → Game option2 → Preview Item Level kapalıysa CSS ile gizlenir)
function artiEtiket(it) {
  const m = /\(\+(\d+)\)\s*$/.exec(String(it?.strName || '')); const n = m ? Number(m[1]) : 0; if (!n) return '';
  const renk = rebUnik(it) ? REB_UNIK_RENK : [11, 12].includes(Number(it?.ItemType)) ? '#e98ba6' : Number(it?.ItemType) === 4 ? '#fff2a0' : '#e59bff';   // (3.11) unique: açık sarı
  return `<span class="ko-ikon-arti" style="color:${renk}">+${n}</span>`;
}
// KO "Reverse unique item": eşsiz (unique) silahların yeniden dökme (rebirth) sürümleri — Dark Vane, Hell Breaker, Sherion, Raum,
// Ruler of the Legend, Hrunting, Garges, Bloody, Khanjar… Ad turuncu-şeftali, alt satır "(Eşsiz yeniden dökme eşya)".
// Liste: veritabanında item_type 4 (eşsiz) sürümü olan, item_type 12 silah / kalkan / asa adları (aksesuar ve zırh hariç).
const REB_UNIK = new Set(["adaga", "aegis", "angel's hairpin", "ascalon", "avedon", "azagai", "aztec gold faun", "aztec gold fulitol", "aztec gold molok", "bloody bow", "bloody dagger", "bloody mace", "bloody shield", "bloody sword", "bloody two-hand sword", "bombastic giant raum", "book of wisdom (fire)", "book of wisdom (ice)", "book of wisdom (lightning)", "bow of <selfname>", "buju polearm", "castellan¡¯s dignity", "castellan¡¯s teachings", "celestial dragon halberd", "chaos baal", "chaos nebiros", "chaos wirinom", "chaotic staff", "chitin bow", "chitin shield", "cold-hearted dagger", "cut snake tail", "dagger of <selfname>", "dark knight axe", "dark knight crossbow", "dark knight dagger", "dark knight jamadar", "dark knight mace", "dark knight shield", "dark knight spear", "dark vane", "death wing bow", "defender of the lord", "determined decision", "double dragon claw jamadar", "double possession", "dragon horn shield", "dragon tooth hammer", "dread shield", "eagle's eye", "elemental staff", "elixir staff", "elysium", "enion bow", "fire bloody staff", "fire codex gigas", "fire dark knight staff", "fire dragon saddle", "fire garges staff", "fire kerykeion", "gab's adamant", "gab's blessing", "garges bow", "garges dagger", "garges mace", "garges scythe", "garges shield", "garges two-handed sword", "garp", "gigantic axe", "glacier erenion", "glave", "golden dragon crescent blade", "gungnir", "hanguk sword", "helenid", "hell blood", "hell breaker", "holy animor", "hrunting", "ice bloody staff", "ice codex gigas", "ice dark knight staff", "ice dragon saddle", "ice garges staff", "ice kerykeion", "intelligent guardian's ax", "javana axe", "khanjar", "lightning bloody staff", "lightning codex gigas", "lightning dark knight staff", "lightning dragon saddle", "lightning erenion", "lightning garges staff", "lightning kerykeion", "lobo hammer", "lobo staff", "lousy pickpocket raum", "lousy pickpocket windforce", "lugias", "lupus hammer", "lupus staff", "lycaon hammer", "lycaon staff", "mace of <selfname>", "mean leonar", "mirage dagger", "monk's staff of destruction", "moonlight", "nameless white cherry blossom", "nepilim of dimension failure", "nepilim of great chaos", "nepilim of sweet kiss", "nepilim of weak dwarf", "noah mean leonar", "nonflammable shield", "oasis staff", "old bow", "old knife", "pole of <selfname>", "priest impact", "raum on severe diet", "restricted diet raum", "ron's staff", "ruahue", "ruler of the legend - black tortoise", "ruler of the legend - blue dragon", "ruler of the legend - diana's deer", "ruler of the legend - fenrir", "ruler of the legend - pegasus(fire)", "ruler of the legend - pegasus(ice)", "ruler of the legend - pegasus(lightnig)", "ruler of the legend - pegasus(lightning)", "ruler of the legend - phoenix", "ruler of the legend - serpent", "ruler of the legend - white tiger", "sarenga", "scorching staff", "scorpion bow", "scorpion scythe", "scorpion shield", "secular fan", "shard", "shenlong bow", "sherion", "shield of <selfname>", "skull hammer", "smart castellan's sword", "smite hammer", "spear of <selfname>", "spear of murky waters", "staff of <selfname>", "stern castellan's sword", "stone splitter", "sweet kiss baal", "sweet kiss nebiros", "sweet kiss wirinom", "sword of beast", "sword of the dead", "syphioric", "tooth", "trainer kate faun", "trainer kate fulitol", "trainer kate molok", "two-handed sword of <selfname>", "undefeatable baal", "undefeatable faun", "undefeatable fulitol", "undefeatable leonar", "undefeatable molok", "undefeatable nebiros", "undefeatable raum", "undefeatable windforce", "undefeatable wirinom", "warm downpour windforce", "weak dwarf baal", "weak dwarf leonar", "weak dwarf nebiros", "weak dwarf raum", "weak dwarf windforce", "weak dwarf wirinom", "windforce on severe diet", "wrath of erenion", "wrath of the dragon"]);
export const REB_UNIK_RENK = '#f0a868', REB_UNIK_ALT = '#e0957a';
export function rebUnik(it) {
  if (Number(it?.ItemType) !== 12) return false;
  const k = Number(it?.Kind) || 0; if (!(k > 0 && k < 200) || (k >= 91 && k <= 94)) return false;
  let ad = String(it?.strName || '').toLowerCase().replace(/\s*\(\+\d+\)\s*$/, '');
  if (KENDI_AD) ad = ad.split(KENDI_AD.toLowerCase()).join('<selfname>');
  ad = ad.replace(/^<selfname>('s)? /, '');
  return REB_UNIK.has(ad);
}
export const nameColor = (it) => (/^#[0-9a-f]{6}$/i.test(it?.AdRenk || '') ? it.AdRenk : rebUnik(it) ? REB_UNIK_RENK : RARITY[it?.ItemType]?.[1] || '#ffffff');
/** GM açıklaması: [b]kalın[/b] [i]italik[/i] [r=#ff0000]renkli[/r], satır sonları korunur (önce kaçışlanır, yalnız bu etiketler) */
export function zenginMetin(s) {
  let h = esc(s);
  h = h.replace(/\[b\]([\s\S]*?)\[\/b\]/g, '<b>$1</b>').replace(/\[i\]([\s\S]*?)\[\/i\]/g, '<i>$1</i>');
  for (let k = 0; k < 4; k++) h = h.replace(/\[r=(#[0-9a-fA-F]{6})\]([\s\S]*?)\[\/r\]/g, '<span style="color:$1">$2</span>');
  return h.replace(/\r?\n/g, '<br>');
}

/** KO tarzı ipucu: ad (derece rengi), tür, temel değerler, gereksinimler, bonuslar, açıklama */
/** KO süreli eşya: saniye → "20 gün 10 saat 4 dk" */
export function sureMetni(sn) {
  sn = Math.max(0, Math.floor(Number(sn) || 0));
  const g = Math.floor(sn / 86400), sa = Math.floor((sn % 86400) / 3600), dk = Math.floor((sn % 3600) / 60);
  const p = []; if (g) p.push(`${g} gün`); if (sa) p.push(`${sa} saat`); if (dk || !p.length) p.push(`${dk} dk`);
  return p.join(' ');
}
/** İngilizce kalan süre (ipucu "Expired time"): "20 days 10 hours 4 minutes" */
export function sureMetniEn(sn) {
  sn = Math.max(0, Math.floor(Number(sn) || 0));
  const g = Math.floor(sn / 86400), sa = Math.floor((sn % 86400) / 3600), dk = Math.floor((sn % 3600) / 60), b = (n, t) => `${n} ${t}${n === 1 ? '' : 's'}`;
  const p = []; if (g) p.push(b(g, 'day')); if (sa) p.push(b(sa, 'hour')); if (dk || !p.length) p.push(b(dk, 'minute'));
  return p.join(' ');
}
/** "20 10 4" / "20g 10s 4d" → saniye (gün saat dakika) */
export function sureCoz(t) {
  const n = String(t || '').match(/\d+/g)?.map(Number) || [];
  return ((n[0] || 0) * 86400) + ((n[1] || 0) * 3600) + ((n[2] || 0) * 60);
}
/** satırın kalan süresi (sn): başlamışsa bitişe kadar, başlamamışsa toplam süre */
export const kalanSure = (r) => (r?.bitis ? Math.max(0, (new Date(r.bitis).getTime() - Date.now()) / 1000) : Number(r?.sure_sn) || 0);
// peri / pet eşyalarının etkileri (sunucu: _recalc, _pvp_oldurme, peri_topla, pet_esya, _pet_besle, pet_vur)
const PET_ETKI_KIND = new Set([150, 151, 152, 170, 172, 173, 174, 176]);
const PET_ETKI = {
  700039000: ['Otomatik toplama: 5 m (seçili türler)'], 900386900: ['Otomatik toplama: 5 m (seçili türler)'],
  700042000: ['Can: +300', 'Savunma: +50', 'Hasar: +%5'],
  700047000: ['Ağırlık: +200', 'Ulusal puan: +3 (öldürme başına)'],
  700012000: ['Pet Toplama komutu (Paket yuvasında)'],
  700014000: ['Pet hasarı: +%20 (Paket yuvasında)'], 700015000: ['Pet savunması: +%20 (Paket yuvasında)'],
  700016000: ['Pet tokluğu: tam (tokluk %20 altına inince)'],
  389570000: ['Pet tokluğu: +200'], 389580000: ['Pet tokluğu: +1.750'], 389590000: ['Pet tokluğu: +5.000'],
  620001000: ['Pet tokluğu: +2.000'], 620002000: ['Pet tokluğu: +4.000'], 620003000: ['Pet tokluğu: +6.000'],
  630001000: ['Pet tokluğu: +3.000'], 630002000: ['Pet tokluğu: +6.000'], 630003000: ['Pet tokluğu: +10.000'],
};
// KO: satış fiyatı yalnız NPC dükkânı (ticaret penceresi) açıkken çanta eşyalarının ipucunda yazar
const dukkanAcik = () => !!document.querySelector('.ko-tic.tic-ticaret');
const CUBUK = { 4: '#e8963a' };   // KO derece çubuğu: eşsiz turuncu
// KO ipucu: oyuncunun sınıfı / seviyesi / statları — giyilemeyen eşya "(Unable to equip)", yetmeyen gereksinim kırmızı "66 (50)"
let OYUNCU = null;
export const oyuncuAyarla = (o) => { OYUNCU = o ? { ...(OYUNCU || {}), ...o } : null; };
// KO eşya sınıfı (Item Class): 1-4 temel, 5-12 meslekler (Berserker…), 13-15 Kurian; daha yüksek meslek alt meslek eşyasını giyer
const SINIF_GRUP = [[1, 5, 6], [2, 7, 8], [3, 9, 10], [4, 11, 12], [13, 14, 15]];
export const SINIF_EN = { 1: 'Warrior', 2: 'Rogue', 3: 'Mage', 4: 'Priest', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Enchanter', 11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Berserker Kurian', 15: 'Guardian Kurian' };
export function sinifGiyer(itemSinif, oyuncuSinif) {
  const c = Number(itemSinif) || 0, p = Number(oyuncuSinif) || 0; if (!c || c > 15 || !p) return true;
  const g = SINIF_GRUP.find((a) => a.includes(c)); return !!g && g.includes(p) && g.indexOf(p) >= g.indexOf(c);
}
// (5.11) KO karşılaştırma: çantadaki / pazardaki silah veya zırhın kuşanılmış karşılığı (aynı yuva: silah → el, zırh → aynı parça)
const KIYAS_YUVA = { 0: [6, 8], 1: [6], 2: [8], 3: [6, 8], 4: [8, 6], 5: [4], 6: [10], 7: [1], 8: [12], 9: [13] };
export function kiyasBul(it, items) {
  const sl = Number(it?.Slot); if (!items || !(sl >= 0 && sl <= 9)) return null;
  for (const k of KIYAS_YUVA[sl] || []) { const q = items.get(k); if (q?.it) return q; }
  return null;
}
let CTRL = false; const ctrlDinle = new Set();
export const ctrlBasili = () => CTRL;
export const ctrlIzle = (fn) => { ctrlDinle.add(fn); return () => ctrlDinle.delete(fn); };
if (typeof addEventListener === 'function') {
  const deg = (on) => { if (CTRL === on) return; CTRL = on; for (const f of ctrlDinle) { try { f(on); } catch {} } };
  addEventListener('keydown', (e) => { if (e.key === 'Control') deg(true); });
  addEventListener('keyup', (e) => { if (e.key === 'Control') deg(false); });
  addEventListener('blur', () => deg(false));
}
export function tooltipHtml(it, { count = 0, sure = null, satisGizle = !dukkanAcik(), yer = '', kiyas = null, kiyasNot = false, fiyatSatir = null } = {}) {   // kiyas: karşılaştırılan (kuşanılmış) eşya — Ctrl ile   // yer: KO başlığı 'Equipment' (kuşanılmış) / 'Inventory' (çanta)
  // KO (co_iteminfo) düzeni: ikon + ad | sağda "<derece> eşya." + tip + derece çubuğu | dayanıklılık ─ temel değerler, bonuslar (sarı-yeşil),
  // element hasarları (açık yeşil), dirençler (camgöbeği) ─ ağırlık + gereksinimler ─ derece adı (altın) + açıklama (ortalı)
  const v = (k) => Number(it[k]) || 0;
  const koSatis = () => (v('SellPrice') === 1 ? v('BuyPrice') : Math.floor(v('BuyPrice') / 6));   // KO NPC'ye satış: SellPrice 1 = alış fiyatı, diğerleri alış/6
  const line = (t, cls = '') => `<div class="ti-s ${cls}">${t}</div>`;
  const deg = (ad, d) => `${ad} : ${d}`;
  const rar = RARITY[it.ItemType], rarAd = rar && it.ItemType !== 5 ? rar[0] : '';
  const tip = KIND[it.Kind] || 'Others';
  const giyemez = !!OYUNCU?.sinif && !sinifGiyer(it.Class, OYUNCU.sinif);   // KO: başka sınıfın eşyası → tür satırında kırmızı "(Unable to equip)"
  let h = (yer ? `<div class="ti-yer">${esc(yer)}</div>` : '') + `<div class="ti-bas"><div class="ti-ikon">${iconHtml(it, 34)}</div><div class="ti-bas-sag">`
    + `<div class="ti-ad" style="color:${nameColor(it)}">${esc(it.strName)}</div>`   // KO: ad derece renginde (eşsiz = açık sarı)
    + (rebUnik(it) ? `<div class="ti-derece-ad" style="color:${REB_UNIK_ALT}">(Reverse Unique Item)</div>` : rarAd ? `<div class="ti-derece-ad">${it.ItemType === 6 ? 'Event Item' : esc(rarAd) + ' Item'}</div>` : it.ItemType === 5 ? '<div class="ti-derece-ad ti-yukselt">Upgrade item</div>' : '')
    + `<div class="ti-tip${giyemez ? ' ti-giyemez' : ''}">${esc(tip)}${giyemez ? '(Unable to equip)' : ''}</div>`
    + `</div></div>`;
  const cubuk = rar ? `<i class="ti-derece-cubuk" style="background:${CUBUK[it.ItemType] || rar[1]}"></i>` : '';   // KO: derece çubuğu dayanıklılık satırının sağında
  const bolumler = [];
  let b = '';
  if (v('Duration') && !v('Countable')) {
    // çantadaki / kuşanılmış eşya: o anki dayanıklılık / en yüksek (yüzde); düşükse kırmızı
    const d = sure?.durability, mx = Number(v('Duration'));
    if (d != null && mx > 1 && !hakli(it)) h += line(`<span>Durability : ${Number(d)} / ${mx} (${Math.floor(Number(d) / mx * 100)}%)</span>${cubuk}`, 'ti-dayanik' + (Number(d) <= mx * 0.1 ? ' ti-dusuk' : ''));
    else h += line(`<span>Durability : ${mx} / ${mx} (100%)</span>${cubuk}`, 'ti-dayanik');
  } else if (cubuk) h += line(cubuk, 'ti-dayanik ti-cubuk-tek');
  // 1. bölüm: temel değerler + bonuslar
  // (5.11) KO karşılaştırma (Ctrl): farkı olan temel değer yeşil/kırmızı ve parantezde fark — "Defense Ability : 82(+16)"
  const fark = (k, ad) => { const x = v(k); if (!kiyas) return line(deg(ad, x)); const d = x - (Number(kiyas[k]) || 0); return d ? line(deg(ad, `${x}(${d > 0 ? '+' : ''}${d})`), d > 0 ? 'ti-kiyas-iyi' : 'ti-kiyas-kotu') : line(deg(ad, x)); };
  if (v('Damage')) b += fark('Damage', 'Attack Power');
  if (v('Delay')) { const hiz = (d) => (d <= 90 ? 'Very Fast' : d <= 110 ? 'Fast' : d <= 130 ? 'Normal' : d <= 150 ? 'Slow' : 'Very Slow'); const kd = kiyas ? Number(kiyas.Delay) || 0 : 0;
    const ayni = !kiyas || !kd || hiz(kd) === hiz(v('Delay')); b += line(deg('Attack Speed', hiz(v('Delay'))), ayni ? '' : v('Delay') < kd ? 'ti-kiyas-iyi' : 'ti-kiyas-kotu'); }
  if (v('Range') && v('Damage')) b += line(deg('Effective Range', (v('Range') / 10).toFixed(2)));
  if (v('Ac')) b += fark('Ac', 'Defense Ability');
  if (count > 1) b += line(deg('Adet', count));
  // KO'nun özgün (Texts_us.tbl 4508–4555) İngilizce etki adları
  const TB = { DaggerAc: 'Defense Ability (Dagger)', SwordAc: 'Defense Ability (Sword)', MaceAc: 'Defense Ability (Club)', AxeAc: 'Defense Ability (Ax)', SpearAc: 'Defense Ability (Spear)', BowAc: 'Defense Ability (Arrow)',
    FireDamage: 'Flame Damage', IceDamage: 'Glacier Damage', LightningDamage: 'Lightning Damage', PoisonDamage: 'Poison Damage', HPDrain: 'HP Recovery', MPDamage: 'MP Damage', MPDrain: 'MP Recovery', MirrorDamage: 'Repel Physical Attack',
    StrB: 'Strength Bonus', StaB: 'Health Bonus', DexB: 'Dexterity Bonus', IntelB: 'Intelligence Bonus', ChaB: 'Magic Power Bonus', MaxHpB: 'HP Bonus', MaxMpB: 'MP Bonus',
    FireR: 'Resistance to Flame', ColdR: 'Resistance to Glacier', LightningR: 'Resistance to Lightning', MagicR: 'Resistance to Magic', PoisonR: 'Resistance to Poison', CurseR: 'Resistance to Curse' };
  if (v('Hitrate')) b += line(`${v('Hitrate') > 0 ? 'Increase' : 'Decrease'} Attack Power by ${Math.abs(v('Hitrate'))}%`);
  if (v('Evasionrate')) b += line(`${v('Evasionrate') > 0 ? 'Increase' : 'Decrease'} Dodging Rate by ${Math.abs(v('Evasionrate'))}%`);
  for (const k of ['DaggerAc', 'SwordAc', 'MaceAc', 'AxeAc', 'SpearAc', 'BowAc']) if (v(k)) b += line(deg(TB[k], v(k)), 'ti-stat');   // (5.11) silah türüne karşı savunma da etki rengi (yeşil); normal Defense Ability beyaz
  for (const k of ['MaxHpB', 'MaxMpB', 'StrB', 'StaB', 'DexB', 'IntelB', 'ChaB']) if (v(k)) b += line(deg(TB[k], v(k)), 'ti-stat');
  for (const k of ['FireDamage', 'IceDamage', 'LightningDamage', 'PoisonDamage', 'HPDrain', 'MPDamage', 'MPDrain', 'MirrorDamage']) if (v(k)) b += line(deg(TB[k], v(k)), 'ti-element');
  for (const k of ['FireR', 'ColdR', 'LightningR', 'MagicR', 'PoisonR', 'CurseR']) if (v(k)) b += line(deg(TB[k], v(k)), 'ti-direnc');
  // Gryphon / Bahamut / Valkyrie / Yeniçeri kostüm efektleri, Pathos eldiveni, kostüm (HP)(AC)… bonusları
  const kbn = KOSTUM.get(Number(v('Num'))) || KOSTUM.get(Number(it.org));
  if (kbn) { const t = []; if (+kbn.hp) t.push(`HP Bonus : +${kbn.hp}`); if (+kbn.ac) t.push(`Defense Bonus : +${kbn.ac}`); if (+kbn.exp) t.push(`Experience Bonus : +${kbn.exp}%`); if (+kbn.noah) t.push(`Noah Bonus : +${kbn.noah}%`); for (const x of t.length ? t : [etiketEn(kbn.etiket)]) b += line(x, 'ti-bonus'); }
  const pc = Math.floor((Number(it.org) || 0) / 1e6), sn = ['Warrior', 'Rogue', 'Mage', 'Priest'];   // Pathos' Gloves (orijinal İngilizce)
  if (pc >= 502 && pc <= 505) { b += line('Damage to all targets : +2%', 'ti-bonus'); b += line(`Damage to ${sn[pc - 502]} : +3%`, 'ti-bonus'); }
  if (pc >= 511 && pc <= 514) { b += line('Defense : +10', 'ti-bonus'); b += line(`Damage taken from ${sn[pc - 511]} : -3%`, 'ti-bonus'); }
  if (!kbn && v('Slot') >= 105 && v('Slot') <= 112) { const kb = { HP: 'HP Bonus : +250', AC: 'Defense Bonus : +25', EXP: 'Experience Bonus : +10%', Noah: 'Noah Bonus : +10%', NP: 'National Point Bonus : +10%', Attack: 'Attack Bonus : +5%' }[/\(([^()]*)\)\s*$/.exec(it.strName || '')?.[1]]; if (kb) b += line('Kostüm bonusu — ' + kb, 'ti-bonus'); }
  const petPeri = PET_ETKI_KIND.has(v('Kind')) || (v('Kind') === 252 && v('Slot') === 111);
  if (petPeri) { const o = Number(it.org) || v('Num'); for (const t of PET_ETKI[o] || PET_ETKI[v('Num')] || []) b += line(t, 'ti-bonus'); }
  if (b) bolumler.push(b);
  // 2. bölüm: ağırlık + gereksinimler (KO: 45 ve altı stat gereksinimleri yazılmaz)
  b = '';
  if (v('Class') >= 1 && v('Class') <= 15) b += line(` -${SINIF_EN[v('Class')]}`, giyemez ? 'ti-yetmez' : '');   // KO: sınıf satırı (" -Priest")
  if (v('Weight')) b += line(deg('Weight', (v('Weight') / 10).toFixed(2)));
  const sv = Number(OYUNCU?.seviye) || 0;
  if (v('ReqLevel') > 1) { const az = sv && sv < v('ReqLevel'); b += line(deg('Required Level', `${v('ReqLevel')}${v('ReqLevelMax') && v('ReqLevelMax') < 83 ? '–' + v('ReqLevelMax') : ''}${az ? ` (${sv})` : ''}`), az ? 'ti-yetmez' : ''); }
  // KO: yetmeyen stat gereksinimi kırmızı, parantez içinde oyuncunun o anki değeri — "Required Intelligence : 66 (50)"
  for (const [k, n, o] of [['ReqStr', 'Strength', 'str'], ['ReqSta', 'Health', 'sta'], ['ReqDex', 'Dexterity', 'dex'], ['ReqIntel', 'Intelligence', 'intel'], ['ReqCha', 'Magic Power', 'cha']]) if (v(k) > 45) {
    const m = OYUNCU?.[o] != null ? Number(OYUNCU[o]) : null, az = m != null && m < v(k);
    b += line(deg(`Required ${n}`, v(k) + (az ? ` (${m})` : '')), az ? 'ti-yetmez' : '');
  }
  // (5.11) KO set eşyası: set bonusları (takılı parça birleşimine göre; birleşim yoksa tam set — gri), set adı ve parçalar (takılı sarı, eksik koyu gri)
  const setv = SETLER?.esya?.[Number(it.org)];
  if (setv && yer === 'Equipment') {   // (5.11) çantada / pazarda set bonusu, set adı ve parçalar hiç yazılmaz; yalnız kuşanılmış parçada
    const [g] = setv; let maske = 0;
    const takili = yer === 'Equipment';   // (5.11) KO: çantadaki / pazardaki set parçasında tüm set satırları koyu gri; yalnız kuşanılmışta sarı / yeşil
    if (takili) for (const o of KUSANILI_ORG) { const x = SETLER.esya[o]; if (x && x[0] === g) maske |= x[1]; }
    const tam = SETLER.setler[g * 10000 + 6674], aktif = maske ? SETLER.setler[g * 10000 + maske] : null, r = aktif || tam;
    if (r) {
      const AD = [[2, 'HP Bonus'], [3, 'MP Bonus'], [4, 'Strength Bonus'], [5, 'Health Bonus'], [6, 'Dexterity Bonus'], [7, 'Intelligence Bonus'], [8, 'Magic Power Bonus'], [1, 'Defense Bonus'],
        [9, 'Resistance to Flame'], [10, 'Resistance to Glacier'], [11, 'Resistance to Lightning'], [13, 'Resistance to Magic'], [12, 'Resistance to Poison'], [14, 'Resistance to Curse']];
      for (const [i, ad] of AD) if (Number(r[i])) b += line(deg(ad, r[i]), aktif ? 'ti-set-bonus' : 'ti-set-yok');
      b += line(esc((tam || r)[0]), takili ? 'ti-set-ad' : 'ti-set-yok ti-set-baslik');
      const P = SETLER.parca?.[g] || {};
      for (const bit of [16, 512, 2, 2048, 4096]) if (P[bit]) b += line(esc(P[bit]), maske & bit ? 'ti-set-ad' : 'ti-set-yok');
    }
  }
  if (b) bolumler.push(b);
  // 3. bölüm: derece adı + açıklama (ortalı)
  b = '';
  if (rarAd) b += `<div class="ti-derece-alt">Item Grade : ${esc(rarAd)}</div>`;
  if (!petPeri) { const d = DESC?.[it.org] ?? DESC?.[it.num]; if (d) b += `<div class="ti-aciklama">${koMetin(d)}</div>`; else if (it.Aciklama) b += `<div class="ti-aciklama">${zenginMetin(it.Aciklama)}</div>`; }   // KO'nun özgün açıklaması (Item_Org_us.tbl, İngilizce) önce; yoksa oyuna özel açıklama
  if (kiyasNot) b += `<div class="ti-kiyas-not">[Enable Comparison by pressing the 'Ctrl' Key.]</div>`;
  if (b) bolumler.push(b);
  if (fiyatSatir) bolumler.unshift(`<div class="ti-s ti-pz-fiyat" style="color:${fiyatSatir.renk}">${esc(fiyatSatir.metin)}</div>`);   // (5.11) KO pazar: "Purchasing Price" ilk bölüm
  for (const x of bolumler) h += '<div class="ti-ayrac"></div>' + x;
  const sureli = sure && (Number(sure.sure_sn) > 0 || sure.bitis);
  if (!satisGizle && koSatis()) h += `<div class="ti-fiyat">${noahHtml(koSatis())}</div>`;
  // KO süreli eşya: en altta sarı "Eşyanın Kalan Süresi"
  if (sureli) h += line(`Expired time : ${sureMetniEn(kalanSure(sure))}`, 'ti-sure');
  if (sure?.kilit) h += '<div class="ti-kilit">[Locked]</div>';
  // KO Item Rental: kiralık eşya etiketi (beta etiketi yerine)
  if (sure?.kiralik) h += '<div class="ti-beta ti-kiralik">[Rental Item]</div>';
  else if (BETA.has(Number(v('Num'))) || it?.Kategori === 'beta') h += '<div class="ti-beta">[BETA ITEM]</div>';
  return h;
}
/** kostüm (Cospre) seçenek etiketi → orijinal KO İngilizcesi: "Savunma +30" → "Defense +30", "EXP +%4" → "EXP +4%", "Saldırı Aurası — Savaşçı" → "Attack Aura (Warrior)" */
export function etiketEn(t) {
  const SIN = { 'Savaşçı': 'Warrior', 'Büyücü': 'Mage', 'Rahip': 'Priest', 'Rogue': 'Rogue', 'Kurian': 'Kurian' };
  return String(t || '').replace(/\+%(\d+)/g, '+$1%')
    .replace(/^(Saldırı|Savunma) Aurası\s*[—-]\s*(.+)$/, (m, a, c) => `${a === 'Saldırı' ? 'Attack' : 'Defense'} Aura (${SIN[c.trim()] || c.trim()})`)
    .replace(/^Savunma\b/, 'Defense').replace(/^Saldırı\b/, 'Attack');
}
