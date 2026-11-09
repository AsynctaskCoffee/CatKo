// KO başarımları (Achievement): Karakter Bilgisi → "Başarım" sekmesi.
// Veri: deadsoft ACHIEVE_MAIN/TITLE/MON/WAR/NORMAL/COM (455 başarım, 134 unvan) + kobugda.com/achievements'ta olup deadsoft'ta olmayanlar
// (assets/basarim/basarimlar.json, tools/basarim-uret.py). İlerleme sunucuda: char_basarim (canavar/oyuncu öldürme, seviye,
// ulus puanı, klan, görev, birleşik başarımlar). Tamamlanan başarımın unvanı takılabilir (stat bonusu _recalc'ta), eşya ödülü alınabilir.
const VERI = new URL('../assets/basarim/basarimlar.json', import.meta.url).href;
const ver = (u) => (window.KO_V ? window.KO_V(u) : u);
const ANA = ['Genel', 'Görev', 'Savaş', 'Macera', 'Meydan Okuma'];
const BONUS_AD = {
  str: 'Güç', sta: 'Sağlık', dex: 'Çeviklik', int: 'Zeka', cha: 'Büyü Gücü', ap: 'Saldırı', ac: 'Savunma', exp: 'EXP %', np: 'Ulus puanı %',
  d_hancer: 'Hançer savunması', d_jamadar: 'Jamadar savunması', d_kilic: 'Kılıç savunması', d_topuz: 'Topuz savunması', d_balta: 'Balta savunması',
  d_mizrak: 'Mızrak savunması', d_ok: 'Ok savunması', b_ates: 'Ateş hasarı', b_buz: 'Buz hasarı', b_simsek: 'Şimşek hasarı',
  r_ates: 'Ateş direnci', r_buz: 'Buz direnci', r_simsek: 'Şimşek direnci', r_buyu: 'Büyü direnci', r_lanet: 'Lanet direnci', r_zehir: 'Zehir direnci',
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
export const bonusYazi = (b) => Object.entries(b || {}).map(([k, v]) => `${BONUS_AD[k] || k} ${v > 0 ? '+' : ''}${v}`).join(', ');

export function initBasarim({ sb, character, hud, state }) {
  let V = null, yukleniyor = null, ilerleme = new Map(), unvan = null, kapak = null, kapakAd = null, ana = 'Genel', alt = 'Tümü', gizle = false;
  try { const t = JSON.parse(localStorage.getItem('ko-basarim-sekme') || 'null'); if (t?.ana) { ana = t.ana; alt = t.alt || 'Tümü'; gizle = !!t.gizle; } } catch {}
  const kaydet = () => { try { localStorage.setItem('ko-basarim-sekme', JSON.stringify({ ana, alt, gizle })); } catch {} };
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { console.warn(fn, error); return null; } return data; };

  // ödül eşyaları (Monster Stone / Battle Hero Wing Exchange Coupon): KO ikon atlası
  const ODUL_ES = new Map(); let esyaMod = null;
  async function odulEsya() {
    try {
      esyaMod = await import('./esya.js'); await esyaMod.loadMeta();
      const nums = Object.values(V.odul).map((o) => o[1]);
      const { data } = await sb.from('items').select('*').in('num', nums);
      for (const r of data || []) ODUL_ES.set(Number(r.num), esyaMod.fromDb(r));
    } catch (e) { console.warn('basarim ikon', e); }
  }
  async function veri() {
    if (V) return V;
    if (!yukleniyor) yukleniyor = fetch(ver(VERI)).then((r) => r.json()).then((d) => {
      // koşul türlerini sunucu tanımıyla eşle (war/normal alt türü: üretici kosul'dan)
      for (const b of d.liste) { b.ana = (d.sekme[b.s] || ['Genel', 'Etkinlik'])[0]; b.alt = (d.sekme[b.s] || ['Genel', 'Etkinlik'])[1]; }
      return (V = d);
    });
    return yukleniyor;
  }
  // sunucuda sayılan koşullar (diğerleri ilgili savaş/etkinlik açıldığında sayılır): canavar, birleşik/görev, oyuncu öldürme (t1),
  // bölge/ölümsüz canavar sayacı (t20), ulus puanı (n2), seviye (n3), klan katkısı (n5), klan üyeliği (n10)
  const izleniyor = (b) => b.k === 'mob' || (b.k === 'com' && !(b.rt === 1 && b.r.some((q) => q >= 1000))) || (b.k === 'war' && [1, 20].includes(b.t)) || (b.k === 'normal' && [2, 3, 5, 10].includes(b.t));

  async function yenile() {
    const d = await rpc('basarim_liste');
    if (!d) return;
    ilerleme = new Map((d.ilerleme || []).map(([id, s1, s2, bitti, alindi]) => [id, { s1, s2, bitti: !!bitti, alindi: !!alindi }]));
    unvan = d.unvan ?? null; kapak = d.kapak ?? null; kapakAd = d.kapak_ad || null; etiket();
    for (const y of d.yeni || []) bildir(y, false);
  }

  // KO: takılı başarımın adı isim etiketinde "[Başarım] İsim" (NPC yazı renginde); diğer oyunculara presence ile gider
  function etiket() { state.unvanEtiketi?.(state.nameSp, kapakAd); state.net?.setUnvan?.(kapakAd); }
  function bildir(y, yenidenCiz = true) {
    const ek = y.unvan ? ` · Unvan: ${y.unvan}` : '';
    hud.notice?.(`[${y.ad}] Achievement Success (+${y.puan} points)${ek}`, 'seviye');
    if (y.odul) hud.info?.(`${y.ad}: you can claim your reward in the Achievement window (Character Info → Achievement).`, 'gorev');
    const p = ilerleme.get(y.basarim) || { s1: 0, s2: 0, alindi: false }; p.bitti = true; ilerleme.set(y.basarim, p);
    if (yenidenCiz && acikMi()) ciz();
  }
  const L = () => hud.basarimL?.();
  const acikMi = () => { const l = L(); return !!l && !l.el.hidden; };

  function ciz() {
    const l = L(); if (!l || !V) return;
    const g = l.govde;
    const hepsi = V.liste;
    const toplamPuan = hepsi.reduce((t, b) => t + (ilerleme.get(b.i)?.bitti ? b.p : 0), 0);
    const biten = hepsi.filter((b) => ilerleme.get(b.i)?.bitti).length;
    const altlar = ['Tümü', ...new Set(hepsi.filter((b) => b.ana === ana).map((b) => b.alt))];
    if (!altlar.includes(alt)) alt = 'Tümü';
    let liste = hepsi.filter((b) => b.ana === ana && (alt === 'Tümü' || b.alt === alt));
    const anaSay = (a) => { const x = hepsi.filter((b) => b.ana === a); return `${x.filter((b) => ilerleme.get(b.i)?.bitti).length}/${x.length}`; };
    if (gizle) liste = liste.filter((b) => !ilerleme.get(b.i)?.bitti);
    // tamamlanıp ödülü alınmamışlar başta, sonra ilerleyenler, sonra diğerleri
    const sira = (b) => { const p = ilerleme.get(b.i); if (p?.bitti && !p.alindi && V.odul[b.o]) return 0; if (p && !p.bitti && (p.s1 || p.s2)) return 1; if (!p?.bitti) return 2; return 3; };
    liste.sort((a, b) => sira(a) - sira(b) || a.i - b.i);
    const u = unvan != null ? V.unvan[unvan] : null;
    const oran = biten / hepsi.length;
    g.innerHTML = `
      <div class="bs-ust">
        <div class="bs-buyuk" title="Toplam başarım puanı"><b>${fmt(toplamPuan)}</b><small>puan</small></div>
        <div class="bs-genel"><div class="bs-genel-ad">Başarımlar<span><b>${biten}</b> / ${hepsi.length}</span></div>${cubuk(oran, `%${(oran * 100).toFixed(1)}`)}</div>
      </div>
      <div class="bs-ana">${ANA.map((a) => `<button class="bs-ab${a === ana ? ' on' : ''}" data-ana="${a}" title="${a}: ${anaSay(a)} tamamlandı">${a === 'Meydan Okuma' ? 'Meydan' : a}</button>`).join('')}</div>
      <div class="bs-alt">${altlar.map((a) => `<button class="bs-alb${a === alt ? ' on' : ''}" data-alt="${esc(a)}">${esc(a)}</button>`).join('')}</div>
      <div class="bs-ozet"><span>${esc(ana)}${alt !== 'Tümü' ? ' › ' + esc(alt) : ''}: <b>${anaSay(ana)}</b></span>
        <label class="bs-gizle"><input type="checkbox" ${gizle ? 'checked' : ''}><i></i> Bitenleri gizle</label></div>
      <div class="bs-liste">${liste.length ? liste.map(satir).join('') : '<p class="bs-bos">Bu bölümde gösterilecek başarım yok.</p>'}</div>
      <div class="bs-unvan">${kapak != null ? `<span>Takılı</span><b>[${esc(kapakAd || V.liste.find((x) => x.i === kapak)?.a || '')}]</b><i title="${esc(u ? u[0] + ': ' + bonusYazi(u[1]) : '')}">${u ? esc(u[0]) + (Object.keys(u[1] || {}).length ? ' · ' + esc(bonusYazi(u[1])) : '') : ''}</i><button class="bs-btn" data-kaldir="1">Kaldır</button>` : '<span class="bs-gri">Takılı başarım yok — tamamladığın bir başarımı "Tak" ile isminin yanında göster.</span>'}</div>`;
    g.querySelectorAll('[data-ana]').forEach((e) => (e.onclick = () => { ana = e.dataset.ana; alt = 'Tümü'; kaydet(); ciz(); }));
    g.querySelectorAll('[data-alt]').forEach((e) => (e.onclick = () => { alt = e.dataset.alt; kaydet(); ciz(); }));
    g.querySelector('.bs-gizle input').onchange = (e) => { gizle = e.target.checked; kaydet(); ciz(); };
    g.querySelectorAll('[data-tak]').forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); tak(Number(e.dataset.tak)); }));
    g.querySelectorAll('[data-al]').forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); odulAl(Number(e.dataset.al)); }));
    const k = g.querySelector('[data-kaldir]'); if (k) k.onclick = (ev) => { ev.stopPropagation(); cikar(); };
    g.querySelectorAll('.bs-liste, .bs-alt').forEach((e) => e.addEventListener('wheel', (ev) => ev.stopPropagation(), { passive: true }));
  }

  // KO çubuğu (oran 0..1)
  const cubuk = (o, yazi, bitti = false) => `<div class="bs-bar${bitti ? ' bitti' : ''}"><i style="clip-path:inset(0 ${(100 - Math.min(1, Math.max(0, o)) * 100).toFixed(1)}% 0 0)"></i><span>${yazi}</span></div>`;
  const madalya = (p) => (p >= 50 ? 'm-altin' : p >= 30 ? 'm-gumus' : 'm-bronz');
  function satir(b) {
    const p = ilerleme.get(b.i) || { s1: 0, s2: 0, bitti: false, alindi: false };
    const [n1, n2] = b.n;
    const bar = (s, n) => cubuk((s || 0) / (n || 1), `${fmt(Math.min(s || 0, n))} / ${fmt(n)}`);
    let ilerle = '';
    if (p.bitti) ilerle = cubuk(1, 'Tamamlandı', true);
    else if (!izleniyor(b)) ilerle = `<div class="bs-not">${b.k === 'yok' ? 'Etkinlik başarımı' : 'İlgili savaş / etkinlik açıldığında sayılır'}</div>`;
    else if (b.k === 'mob' && n2) ilerle = bar(p.s1, n1) + bar(p.s2, n2);
    else ilerle = bar(p.s1, n1);
    const un = b.u && V.unvan[b.u];
    const od = V.odul[b.o];
    const takili = kapak != null && Number(kapak) === b.i;
    const odulVar = p.bitti && od && !p.alindi;
    const es = od && ODUL_ES.get(od[1]);
    const ikon = es && esyaMod ? esyaMod.iconHtml(es, 22) : '';
    const bonus = un && Object.keys(un[1] || {}).length ? bonusYazi(un[1]) : '';
    return `<div class="bs-satir${p.bitti ? ' bitti' : ''}${odulVar ? ' odul-var' : ''}" title="${esc(b.e)}">
      <div class="bs-madalya ${madalya(b.p)}" title="${b.p} başarım puanı"><span>${b.p}</span></div>
      <div class="bs-ic">
        <div class="bs-bas"><b>${esc(b.a)}</b>${b.z ? `<span class="bs-etiket">${b.z >= 60 ? b.z / 60 + ' dk' : b.z + ' sn'}</span>` : ''}${p.bitti ? '<span class="bs-etiket tamam">✔</span>' : ''}</div>
        <div class="bs-ac">${esc(b.d)}</div>
        ${ilerle}
        ${un || od || p.bitti ? `<div class="bs-odul">
          ${un ? `<span class="bs-un" title="${esc(bonus || 'Unvan')}"><b>${esc(un[0])}</b></span>` : ''}
          ${od ? `<span class="bs-es" title="${esc(od[0])}">${ikon}${ikon ? '' : esc(od[0])}</span>` : ''}
          ${p.bitti ? (takili ? '<span class="bs-takili">Takılı</span>' : `<button class="bs-btn" data-tak="${b.i}" title="Başarımın adı isminin yanında görünür${un ? '; unvan bonusu da takılır' : ''}">Tak</button>`) : ''}
          ${p.bitti && od ? (p.alindi ? '<span class="bs-gri">Alındı</span>' : `<button class="bs-btn al" data-al="${b.i}">Al</button>`) : ''}
          ${bonus ? `<div class="bs-bonus">${esc(bonus)}</div>` : ''}
        </div>` : ''}
      </div>
    </div>`;
  }

  async function tak(id) {
    const d = await rpc('basarim_tak', { p_id: id });
    if (!d?.ok) { hud.info?.(d?.mesaj || 'The achievement could not be equipped.', 'hata'); return; }
    kapak = d.kapak; kapakAd = d.kapak_ad; unvan = d.unvan ?? unvan; etiket();
    hud.info?.(`Achievement equipped: [${kapakAd}]`, 'gorev');
    state.inv?.stats?.(); ciz();
  }
  // unvan penceresi: etki / yazı kutuları ayrı (sunucu basarim_unvan_sec / basarim_unvan_kaldir)
  async function unvanSec(id, tur) {
    const d = await rpc('basarim_unvan_sec', { p_id: id, p_tur: tur });
    if (!d?.ok) { hud.info?.(d?.mesaj || 'The title could not be selected.', 'hata'); return; }
    kapak = d.kapak; kapakAd = d.kapak_ad; unvan = d.unvan; etiket();
    hud.info?.(tur === 'etki' ? `Title effect: ${V?.unvan[unvan]?.[0] || ''}` : `Shown next to your name: [${kapakAd}]`, 'gorev');
    if (tur === 'etki') state.inv?.stats?.();
  }
  async function unvanKaldir(tur) {
    const d = await rpc('basarim_unvan_kaldir', { p_tur: tur });
    if (!d?.ok) return;
    kapak = d.kapak; kapakAd = d.kapak_ad; unvan = d.unvan; etiket();
    if (tur === 'etki') state.inv?.stats?.();
  }
  async function cikar() {
    const d = await rpc('basarim_cikar');
    if (!d?.ok) return;
    kapak = null; kapakAd = null; unvan = null; etiket();
    hud.info?.('Achievement removed.', 'gorev');
    state.inv?.stats?.(); ciz();
  }
  async function odulAl(id) {
    const d = await rpc('basarim_odul', { p_id: id });
    if (!d?.ok) { hud.info?.(d?.mesaj || 'The reward could not be received.', 'hata'); return; }
    const p = ilerleme.get(id); if (p) p.alindi = true;
    hud.info?.(`Achievement reward: you've received the ${d.ad || 'item'} item.`, 'gorev');
    await state.inv?.reload?.(); ciz();
  }

  // ---- KO unvan penceresi (deadsoft 2369 re_title_window: Karakter Bilgisi → Achieve sekmesi) — İngilizce
  // Title List: tamamlanmış ve unvanı olan başarımlar (5'li sayfalar); 1. kutu Cover title (isim etiketi), 2. kutu Skill title (stat bonusu).
  // Satıra tıkla → seç, Apply → tak; Cover / Skill Title Reset → çıkar. Effect Description: unvanın bonusları, altta koşulu.
  const BONUS_EN = { str: 'STR', sta: 'HP', dex: 'DEX', int: 'INT', cha: 'MP', ap: 'Attack', ac: 'Defence', exp: 'EXP %', np: 'National Point %',
    d_hancer: 'Dagger Defence', d_jamadar: 'Jamadar Defence', d_kilic: 'Sword Defence', d_topuz: 'Club Defence', d_balta: 'Axe Defence', d_mizrak: 'Spear Defence', d_ok: 'Bow Defence',
    b_ates: 'Fire Damage', b_buz: 'Ice Damage', b_simsek: 'Lightning Damage', r_ates: 'Fire Resistance', r_buz: 'Ice Resistance', r_simsek: 'Lightning Resistance',
    r_buyu: 'Magic Resistance', r_lanet: 'Curse Resistance', r_zehir: 'Poison Resistance' };
  let uSayfa = 0, uSecili = null;
  const UL = () => hud.unvanL?.();
  function unvanCiz() {
    const l = UL(); if (!l || !V) return;
    // KO: Title List tüm unvanları alfabetik gösterir; kazanılmamışlar gri ve kutusuz, kazanılanlar sarı + iki kutu
    // (aynı unvanı veren birden çok başarım varsa tamamlanmış olan temsil eder)
    const bitti = (b) => !!ilerleme.get(b.i)?.bitti, adOf = (b) => V.unvan[b.u]?.[0] || b.a, tekil = new Map();
    for (const b of V.liste) { if (!b.u) continue; const k = adOf(b), o = tekil.get(k); if (!o || (!bitti(o) && bitti(b))) tekil.set(k, b); }
    const liste = [...tekil.values()].sort((a, c) => adOf(a).localeCompare(adOf(c), 'en'));
    const sayfaSay = Math.max(1, Math.ceil(liste.length / 5)); uSayfa = Math.min(uSayfa, sayfaSay - 1);
    for (let i = 0; i < 5; i++) {
      const g = l.get('group_title_' + i); if (!g) continue;
      const b = liste[uSayfa * 5 + i]; g.hidden = !b; if (!b) continue;
      g.dataset.bi = b.i;
      const q = (id) => g.querySelector(`[data-id="${id}"]`);
      q('str_title').textContent = V.unvan[b.u]?.[0] || b.a;
      // KO: 1. kutu = etki (unvanın bonusu karaktere işler), 2. kutu = yazı (isminin yanında görünen unvan) — ayrı ayrı seçilir
      const etki = unvan != null && Number(unvan) === Number(b.u), yazi = kapak != null && Number(kapak) === b.i;
      q('Img_Open_0').hidden = !etki; q('Img_None_0').hidden = etki; q('Img_Open_1').hidden = !yazi; q('Img_None_1').hidden = yazi;
      q('Img_select').hidden = uSecili !== b.i;
      const acik = bitti(b); g.classList.toggle('unvan-kilitli', !acik);
      if (!acik) for (const id of ['Img_Open_0', 'Img_None_0', 'Img_Open_1', 'Img_None_1']) q(id).hidden = true;
    }
    l.text('str_page', `${uSayfa + 1}/${sayfaSay}`);
    l.text('str_title_0', kapakAd ? `[${kapakAd}]` : ''); l.text('str_title_1', unvan != null ? V.unvan[unvan]?.[0] || '' : '');
    const b = uSecili != null ? V.liste.find((x) => x.i === uSecili) : null, un = b && V.unvan[b.u];
    l.text('str_title_explain', un ? Object.entries(un[1] || {}).map(([k, v]) => `${BONUS_EN[k] || k} ${v > 0 ? '+' : ''}${v}`).join('\n') || 'No effect' : '');
    l.text('str_title_condition', b ? b.e || b.d : '');
  }
  hud.onUnvanAc = async () => { if (V) unvanCiz(); await veri(); await yenile(); unvanCiz(); };   // önbellekteki liste hemen, sunucudan gelince yenilenir
  // ---- KO başarım penceresi (deadsoft 2369 re_achieve, İngilizce): Summary (toplam puan, 6 çubuk, son 3 başarım) ·
  // Normal / Quest / War / Adventure / Challenge: solda alt kategoriler, sağda 5'li sayfa başarım satırları (ad, ödül / ilerleme, açıklama, puan, "complete" rozeti).
  // Satıra çift tık: tamamlanmışsa tak (isim etiketi + unvan); sağ tık: ödülü al.
  const AL = () => hud.achieveL?.();
  const BOLUM = ['Genel', 'Görev', 'Savaş', 'Macera', 'Meydan Okuma'];   // btn_Section_0–4
  const ALT_EN = { Karakter: 'Character', Klan: 'Clan', Etkinlik: 'Event', Moradon: 'Moradon', Ortak: 'Common', Kale: 'Castle', 'Öncü Bölge': 'Frontier Zone', Lunar: 'Lunar War',
    Chaos: 'Chaos', Juraid: 'Juraid', 'Sınır Savunma': 'Border Defence War', 'Kale Kuşatması': 'Castle Siege War', Zindan: 'Dungeon', Alan: 'Field' };
  let aBolum = -1, aAlt = null, aSayfa = 0;
  const ROW = 5;
  const rozet = (g) => [...g.querySelectorAll('.kui-img')].find((e) => parseFloat(e.style.width) > 60);
  function satirYaz(g, b) {
    const q = (id) => g.querySelector(`[data-id="${id}"]`);
    g.hidden = !b; if (!b) return;
    const p = ilerleme.get(b.i) || { s1: 0, s2: 0, bitti: false, alindi: false }, un = b.u && V.unvan[b.u], od = V.odul[b.o];
    g.dataset.bi = b.i;
    q('str_Title').textContent = b.a;
    // KO: 2. satır yeşil köşeli parantezde ödül unvanı / eşyası ([Sprout]); ödülsüz tamamlanmışta boş; tamamlanmamışta ilerleme
    const ilerleme_ = `${Math.min(p.s1 || 0, b.n[0] || 0).toLocaleString('en-US')} / ${(b.n[0] || 0).toLocaleString('en-US')}${b.n[1] ? ` · ${Math.min(p.s2 || 0, b.n[1]).toLocaleString('en-US')} / ${b.n[1].toLocaleString('en-US')}` : ''}`;
    const odulYazi = un ? `[${un[0]}]` : od ? `[${od[0]}]` : '';
    const rt = q('str_RewardTitle'); rt.textContent = p.bitti ? odulYazi : (odulYazi || ilerleme_); rt.classList.toggle('ac-ilerleme', !p.bitti && !odulYazi);
    q('str_Title').title = p.bitti ? '' : `Progress: ${ilerleme_}`;
    q('str_Content').textContent = b.e || b.d;
    q('str_Score').textContent = String(b.p);
    const r = rozet(g); if (r) r.hidden = !p.bitti;
    g.classList.toggle('bitti', !!p.bitti);
    const es = od && ODUL_ES.get(od[1]), ic = q('area_icon');
    ic.innerHTML = es && esyaMod ? esyaMod.iconHtml(es, 41) : `<span class="ac-madalya ${madalya(b.p)}">${b.p}</span>`;
  }
  function achieveCiz() {
    const l = AL(); if (!l || !V) return;
    const hepsi = V.liste, bit = (x) => ilerleme.get(x.i)?.bitti;
    for (let i = 0; i <= 5; i++) l.get('btn_Section_' + i)?.classList.toggle('secili', (i === 5 && aBolum < 0) || i === aBolum);
    l.show('Base_Summary', aBolum < 0); l.show('Base_Achieve', aBolum >= 0);
    if (aBolum < 0) {
      l.text('str_Score', String(hepsi.reduce((t, b) => t + (bit(b) ? b.p : 0), 0)));
      const graf = { 5: hepsi, 0: hepsi.filter((b) => b.ana === 'Genel'), 1: hepsi.filter((b) => b.ana === 'Görev'), 2: hepsi.filter((b) => b.ana === 'Savaş'), 3: hepsi.filter((b) => b.ana === 'Macera'), 4: hepsi.filter((b) => b.ana === 'Meydan Okuma') };
      for (const [i, x] of Object.entries(graf)) { const n = x.filter(bit).length; l.text('str_GraphValue_' + i, `${n}/${x.length}`); l.progress('Progress_GraphImage_' + i, x.length ? n / x.length : 0); }
      const st = state.combat?.stats || {};
      { const dk = Math.floor((Number(st.oyun_sure ?? st.playtime ?? 0) || 0) / 60); l.text('str_Time', `${Math.floor(dk / 60)}hour ${dk % 60}minute`); }   // KO: "1hour 0minute"
      l.text('str_Hunt', String(st.mob_kill ?? 0)); l.text('str_Kill', String(st.user_kill ?? 0)); l.text('str_Dead', String(st.olum ?? 0));
      const son = hepsi.filter(bit).sort((a, b) => b.i - a.i).slice(0, 3);
      for (let i = 0; i < 3; i++) { const g = l.get('Base_Inform_' + i); if (g) satirYaz(g, son[i]); }
      return;
    }
    const ana = BOLUM[aBolum], kume = hepsi.filter((b) => b.ana === ana), altlar = [...new Set(kume.map((b) => b.alt))];
    if (!altlar.includes(aAlt)) aAlt = altlar[0] || null;
    for (let i = 0; i < 10; i++) { const e = l.get('str_Category_' + i); if (!e) continue; const a = altlar[i]; e.textContent = a ? ALT_EN[a] || a : ''; e.dataset.alt = a || ''; e.classList.toggle('secili', !!a && a === aAlt); }
    const L2 = kume.filter((b) => b.alt === aAlt).sort((a, b) => (bit(a) ? 1 : 0) - (bit(b) ? 1 : 0) || a.i - b.i);
    const sayfaSay = Math.max(1, Math.ceil(L2.length / ROW)); aSayfa = Math.max(0, Math.min(aSayfa, sayfaSay - 1));
    l.text('str_page', `${aSayfa + 1}/${sayfaSay}`);
    (l.satirlar || []).forEach((g, i) => satirYaz(g, L2[aSayfa * ROW + i]));
  }
  hud.onAchieveAc = async () => { await veri(); if (!esyaMod) await odulEsya(); await yenile(); achieveCiz(); };
  hud.achieveBagla = (l) => {
    // liste satırları: Base_Inform_0 kopyaları area_region içinde
    const kalip = l.get('Base_Inform_0'), ba = l.get('Base_Achieve'), ar = l.get('area_region');
    l.satirlar = [];
    if (kalip && ba && ar) for (let i = 0; i < ROW; i++) {
      const g = kalip.cloneNode(true); g.removeAttribute('data-id'); g.classList.add('ac-satir');
      const w0 = parseFloat(kalip.style.width), w1 = parseFloat(ar.style.width) - 16, d = w1 - w0;
      g.style.left = (parseFloat(ar.style.left) + 8) + 'px'; g.style.width = w1 + 'px';
      for (const c of g.children) {   // satırı bölge genişliğine yay: sağdaki rozet / puan kayar, yazılar uzar
        const cl = parseFloat(c.style.left) || 0, cw = parseFloat(c.style.width) || 0;
        if (cl > w0 * 0.6) c.style.left = (cl + d) + 'px'; else if (cl + cw > w0 * 0.6) c.style.width = (cw + d) + 'px';
      }
      g.style.top = (parseFloat(ar.style.top) + 3 + i * 83) + 'px';
      ba.append(g); l.satirlar.push(g);
    }
    for (let i = 0; i < 3; i++) l.get('Base_Inform_' + i)?.classList.add('ac-satir');
    const satirOlay = (g) => {
      g.style.pointerEvents = 'auto';
      g.addEventListener('dblclick', (e) => { e.stopPropagation(); const bi = Number(g.dataset.bi); if (bi && ilerleme.get(bi)?.bitti) tak(bi).then(achieveCiz); });
      g.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); const bi = Number(g.dataset.bi), b = V?.liste.find((x) => x.i === bi), p = ilerleme.get(bi); if (b && p?.bitti && V.odul[b.o] && !p.alindi) odulAl(bi).then(achieveCiz); });
      g.title = 'Çift tık: tak (isim etiketi / unvan) · Sağ tık: ödülü al';
    };
    for (const g of l.satirlar) satirOlay(g);
    for (let i = 0; i < 3; i++) { const g = l.get('Base_Inform_' + i); if (g) satirOlay(g); }
    for (let i = 0; i <= 5; i++) l.click('btn_Section_' + i, () => { aBolum = i === 5 ? -1 : i; aAlt = null; aSayfa = 0; achieveCiz(); });
    for (let i = 0; i < 10; i++) { const e = l.get('str_Category_' + i); if (!e) continue; e.style.pointerEvents = 'auto'; e.classList.add('kui-tik', 'ac-kategori'); e.addEventListener('click', (ev) => { ev.stopPropagation(); if (!e.dataset.alt) return; aAlt = e.dataset.alt; aSayfa = 0; achieveCiz(); }); }
    l.click('btn_left', () => { aSayfa--; achieveCiz(); }); l.click('btn_right', () => { aSayfa++; achieveCiz(); });
    const sayfaIn = l.input('edit_page', { placeholder: '' });
    const git = () => { const n = parseInt(sayfaIn?.value, 10); if (n > 0) { aSayfa = n - 1; achieveCiz(); } };
    l.click('btn_page', git); sayfaIn?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') git(); });
  };
  hud.unvanBagla = (l) => {
    for (let i = 0; i < 5; i++) {
      const g = l.get('group_title_' + i); if (!g) continue;
      g.style.pointerEvents = 'auto'; g.classList.add('kui-tik');
      g.addEventListener('click', async (e) => {
        e.stopPropagation(); const bi = Number(g.dataset.bi); if (!bi) return;
        // kutulara tıklama: 1. kutu etki, 2. kutu yazı (seçiliyse kaldırır)
        const r = g.getBoundingClientRect(), k = (r.width / 180) || 1, x = (e.clientX - r.left) / k;
        const kutu = x >= 2 && x < 20 ? 'etki' : x >= 20 && x < 38 ? 'yazi' : null;
        if (kutu && !ilerleme.get(bi)?.bitti) { uSecili = bi; unvanCiz(); return; }   // kazanılmamış unvan: yalnız açıklaması görünür
        if (kutu) {
          const b = V.liste.find((v) => v.i === bi), acik = kutu === 'etki' ? unvan != null && Number(unvan) === Number(b?.u) : Number(kapak) === bi;
          await (acik ? unvanKaldir(kutu) : unvanSec(bi, kutu)); uSecili = bi; unvanCiz(); return;
        }
        uSecili = uSecili === bi ? null : bi; unvanCiz();
      });
      g.addEventListener('dblclick', (e) => { e.stopPropagation(); });
    }
    l.click('btn_left', () => { uSayfa = Math.max(0, uSayfa - 1); unvanCiz(); });
    l.click('btn_right', () => { uSayfa++; unvanCiz(); });
    // Apply: seçili unvanın hem etkisini hem yazısını takar; Cover Title Reset → yazı, Skill Title Reset → etki kaldırılır
    l.click('btn_apply', async () => { if (uSecili == null) { hud.info?.('Select a title from the list first.', 'hata'); return; }
      if (!ilerleme.get(uSecili)?.bitti) { hud.info?.('You have not earned this title yet.', 'hata'); return; }
      const b = V.liste.find((v) => v.i === uSecili); if (b?.u) await unvanSec(uSecili, 'etki'); await unvanSec(uSecili, 'yazi'); unvanCiz(); });
    l.click('btn_cover_init', async () => { await unvanKaldir('yazi'); unvanCiz(); });
    l.click('btn_ability_init', async () => { await unvanKaldir('etki'); unvanCiz(); });
  };
  hud.onBasarimAc = async () => {
    const l = L(); if (!l) return;
    if (!V) l.govde.innerHTML = '<p class="bs-bos">Yükleniyor…</p>';
    await veri(); if (!esyaMod) await odulEsya(); await yenile(); ciz();
  };
  // sunucudan gelen anlık bildirimler (canavar / oyuncu öldürme: gorev.js → 'ko-basarim')
  addEventListener('ko-basarim', (ev) => bildir(ev.detail));
  // seviye / ulus puanı / klan / görev başarımları: seviye atlayınca ve 2 dakikada bir denetlenir
  const kontrol = async () => { const d = await rpc('basarim_kontrol'); for (const y of d || []) bildir(y); };
  addEventListener('ko-seviye', () => setTimeout(kontrol, 500));
  setTimeout(() => { yenile(); veri().catch(() => {}); }, 4000); setInterval(kontrol, 120000);   // + başarım tablosu önceden (Achieve sekmesi beklemeden açılır)   // açılışta takılı başarım etiketi + yeni tamamlananlar
  return { yenile, ac: () => hud.panel?.('basarim') };
}
