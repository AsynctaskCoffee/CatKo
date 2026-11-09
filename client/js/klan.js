// KO klan (Knights) sistemi — istemci.
//  - Klan penceresi: KO re_clan_window (Karakter Bilgisi → Klan sekmesi, G). Bilgi, duyuru, üye listesi (5 satır, kaydırılır),
//    seçili üyeye fısıltı / atma / yetki / liderlik devri, kendi notun, duyuru yazma.
//  - Moradon'daki [Knight Clerk] (Delaga / Charel): klan kurma (Sv 20, 500.000 Noah), şövalye grubu onayı (20 üye), ayrılma, dağıtma.
//  - Davet: oyuncuya sağ tık → "Klana davet et" ya da penceredeki Davet düğmesi (ad ile). Hedef oyuncuya evet/hayır sorusu gelir.
//  - Klan sohbeti (sohbetin Klan sekmesi), isim etiketinin üstünde kırmızı klan adı, Clan Point ile ulus puanı bağışı (geri alınamaz) → klan derecesi.
// Sunucu: klan_* RPC'leri (klanlar tablosu, characters.klan_id / klan_rutbe / klan_not). Değişiklikler 'klan:<id>' kanalından duyurulur.
import { koWindow, toFront } from './ko-pencere.js';
const RUTBE = { 1: 'Leader', 2: 'Assistant Leader', 4: 'Member' };   // KO Texts_us 2714 / 2720 / 2715
// (7.11) KO re_clan_window img_class_0..7: 0 Warrior · 1 Rogue · 2 Magician · 3 Priest (Karus, kırmızı zemin), 4..7 aynısı El Morad (mavi zemin).
//   Meslek grubu: 1/5/6 savaşçı, 2/7/8 rogue, 3/9/10 büyücü, 4/11/12 rahip, 13/14/15 Kurian / Porutu (KO'da ayrı simgesi yok → savaşçı simgesi)
const SINIF_GRUP = (c) => ({ 1: 0, 5: 0, 6: 0, 2: 1, 7: 1, 8: 1, 3: 2, 9: 2, 10: 2, 4: 3, 11: 3, 12: 3, 13: 0, 14: 0, 15: 0 }[Number(c)] ?? 0);
const SINIF_IKON = (c, ulus) => SINIF_GRUP(c) + (Number(ulus) === 2 ? 4 : 0);
// (7.11) KO meslek adları (Texts_us 1401–1426, 3610–3611), ulusa göre
export const sinifAdi = (c, ulus) => (Number(ulus) === 2
  ? { 1: 'Warrior', 5: 'Blade', 6: 'Blade Master', 2: 'Rogue', 7: 'Ranger', 8: 'Kasar Hood', 3: 'Magician', 9: 'Mage', 10: 'Arch Mage', 4: 'Priest', 11: 'Cleric', 12: 'Paladin', 13: 'Porutu', 14: 'Bureka', 15: 'Bureka Master' }
  : { 1: 'Warrior', 5: 'Berserker', 6: 'Berserker Hero', 2: 'Rogue', 7: 'Hunter', 8: 'Shadow Vain', 3: 'Magician', 9: 'Sorcerer', 10: 'Elemental Lord', 4: 'Priest', 11: 'Shaman', 12: 'Shadow Knight', 13: 'Kurian', 14: 'Dafne', 15: 'Dafne Hero' })[Number(c)] || '';
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const once = (t) => {
  if (!t) return '-';
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
};
// KO klan dereceleri (kobugda.com/grades, sunucu _klan_sv):
//  Knight 5→1: üyelerin toplam ulus puanı 72.000 / 144.000 / 360.000 / 720.000 (kalıcı değil; üye ayrılırsa düşer)
//  Accredited 5: Knight 1 + Emblem of Honor (Isiloon) + 10M Noah; A4→A1: 7.000 / 10.000 / 15.000 / 20.000 Clan Point
//  Royal 5: Accredited 1 + Royal Emblem (Felankor) + 100M Noah + 25.000 CP; R4→R1: 30.000 / 35.000 / 40.000 / 45.000 CP
//  Clan Point (CP): 36 NP = 1 CP; ayrılan / atılan üyeye bağışının %30'u döner (Clan Contribution Certificate ile %100)
const ROMA = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
const TUR_AD = { mavi: 'Knight', akredite: 'Accredited Knight', royal: 'Royal Knight' };
// KO CheckClanGrade / m_byGrade: klan türünden bağımsız, ulus puanına (üyeler + bağış) göre 1–5 (GameServer GRADE1–4: 720000 / 360000 / 144000 / 72000)
const puanDerece = (k) => { const np = Number(k?.seviye?.np ?? 0); return np >= 720000 ? 1 : np >= 360000 ? 2 : np >= 144000 ? 3 : np >= 72000 ? 4 : 5; };
const seviyeOf = (k) => k?.seviye || { tur: 'mavi', derece: k?.derece || 5 };
export const dereceAdi = (k) => { const v = seviyeOf(k); return `${TUR_AD[v.tur] || 'Knight'} ${ROMA[v.derece] || v.derece}`; };
/** klan arması (derece simgesi): assets/ui/klan/<tur><derece>.webp */
export const armaUrl = (k) => { const v = seviyeOf(k); return `assets/ui/klan/${v.tur}${v.derece}.webp`; };   // Knight: iki ulusta da mavi, Accredited: kırmızı (yıldızlı), Royal: altın

export function initKlan({ sb, character, hud, state, addLine, nameTag }) {
  const me = Number(character.id);
  let B = null;            // klan_bilgi sonucu
  let kanal = null, kanalId = null, sayfa = 0, secili = null;
  let cubukListe = () => {}, cubukDuyuru = () => {};
  let L = null;   // klan penceresi yerleşimi (hud yeniden kurarsa yeniden bağlanır)

  const rpc = async (fn, args = {}) => {
    const { data, error } = await sb.rpc(fn, { p_char: me, ...args });
    if (error) { hud.notice?.(error.message, 'hata'); return null; }
    if (data && data.ok === false) { hud.notice?.(data.mesaj || 'The request could not be processed.', 'hata'); return null; }
    return data;
  };
  const yay = (event, payload = {}) => kanal?.send({ type: 'broadcast', event, payload: { ...payload, from: me } });

  // ---- tüm oyuncuların ortak kanalı: davetler
  const genel = sb.channel('klan:genel', { config: { broadcast: { self: false } } });
  genel.on('broadcast', { event: 'davet' }, ({ payload: p }) => {
    if (!p || Number(p.hedef) !== me) return;
    hud.soru?.('Clan Invitation', `${p.gonderen_ad} has invited you to the "${p.klan_ad}" clan.\nWill you join the clan ${p.klan_ad}?`,
      async () => { const d = await rpc('klan_davet_cevap', { p_kabul: true }); if (d?.kabul) { hud.info?.(`Successfully joined the clan "${d.ad}".`, 'seviye'); await yukle(); yay('degisti', { olay: 'katildi', ad: character.name }); } },
      async () => { await rpc('klan_davet_cevap', { p_kabul: false }); });
  });
  // KO klan ittifakı daveti: hedef klanın liderine
  genel.on('broadcast', { event: 'ittifak' }, ({ payload: p }) => {
    if (!p || Number(p.hedef_lider) !== me) return;
    hud.soru?.('Alliance Invitation', `The Knights "${p.ana_ad}" has sent a request for confederacy.\nAllied clans wear the main clan's cape.\nWill you accept?`,
      async () => { const d = await rpc('ittifak_cevap', { p_kabul: true }); if (d?.kabul) { hud.info?.(`You have joined the "${d.ana_ad}" alliance.`, 'seviye'); yay('degisti', { olay: 'ittifak' }); genel.send({ type: 'broadcast', event: 'ittifak_degisti', payload: { ana: d.ana } }); await yukle(); } },
      async () => { await rpc('ittifak_cevap', { p_kabul: false }); });
  });
  genel.on('broadcast', { event: 'ittifak_degisti' }, ({ payload: p }) => { if (B?.ittifak && (Number(p?.ana) === Number(B.ittifak.ana) || B.ittifak.klanlar?.some((x) => Number(x.id) === Number(p?.klan)))) yukle(); else if (B?.klan && Number(p?.ana) === Number(B.klan.id)) yukle(); });
  genel.subscribe();

  // KO "Birlik" sohbeti: klan + ittifaktaki tüm klanların ortak kanalı (ittifak yoksa yalnız kendi klanı)
  let bKanal = null, bKanalId = null;
  const birlikAd = (klan, ad) => (klan ? `[${String(klan).slice(0, 24)}] ` : '') + ad;   // birlik sohbetinde ismin başında klan adı
  function birlikBaglan(anahtar) {
    if (bKanalId === anahtar) return;
    if (bKanal) { try { sb.removeChannel(bKanal); } catch {} bKanal = null; bKanalId = null; }
    if (!anahtar) return;
    bKanalId = anahtar;
    bKanal = sb.channel('birlik:' + anahtar, { config: { broadcast: { self: false } } });
    bKanal.on('broadcast', { event: 'sohbet' }, ({ payload: p }) => { if (p?.text) addLine?.(birlikAd(p.klan, p.name), String(p.text).slice(0, 200), p.nation, 'birlik'); });
    bKanal.subscribe();
  }
  function birlikSohbet(text) {
    text = String(text || '').trim().slice(0, 200); if (!text) return;
    if (!B?.klan || !bKanal) { hud.info?.('You must be in a clan to use alliance chat.', 'hata'); return; }
    bKanal.send({ type: 'broadcast', event: 'sohbet', payload: { name: character.name, klan: B.klan.ad, nation: character.nation, text, from: me } });
    addLine?.(birlikAd(B.klan.ad, character.name), text, character.nation, 'birlik');
  }

  function kanalaBaglan(id) {
    if (kanalId === id) return;
    if (kanal) { try { sb.removeChannel(kanal); } catch {} kanal = null; kanalId = null; }
    if (!id) return;
    kanalId = id;
    kanal = sb.channel('klan:' + id, { config: { broadcast: { self: false } } });
    kanal.on('broadcast', { event: 'sohbet' }, ({ payload: p }) => { if (p?.text) addLine?.(p.name, String(p.text).slice(0, 200), p.nation, 'klan'); });
    // KO klan görevi: lider başlatınca çevrimiçi üyeler klana özel arenaya (klanq_<boss>_<klan>) ışınlanır (konum sunucuda yazıldı)
    kanal.on('broadcast', { event: 'royal_isinla' }, ({ payload: p }) => {
      if (!(p?.ids || []).map(Number).includes(me)) return;
      hud.notice?.(`Your clan leader has started the ${p.boss || 'Felankor'} quest: you are being teleported to the arena!`, 'seviye');
      setTimeout(() => { state.net?.halt?.(); const u = new URL(location.href); for (const x of ['x', 'z', 'bolge']) u.searchParams.delete(x); u.searchParams.set('karakter', character.id); location.replace(u.toString()); }, 1500);
    });
    kanal.on('broadcast', { event: 'degisti' }, ({ payload: p }) => {
      if (p?.olay === 'katildi' && p.ad) addLine?.(null, `${p.ad} has joined the clan.`, 0, 'klan');
      if (p?.olay === 'ayrildi' && p.ad) addLine?.(null, `${p.ad} has left the clan.`, 0, 'klan');
      if (p?.olay === 'atildi' && p.ad) addLine?.(null, `${p.ad} has been expelled from the clan.`, 0, 'klan');
      if (p?.olay === 'dagitildi') addLine?.(null, 'The clan has been disbanded by the leader.', 0, 'klan');
      if (p?.olay === 'devir' && p.ad) addLine?.(null, `Clan leadership has been transferred to ${p.ad}.`, 0, 'klan');
      yukle();
    });
    kanal.subscribe();
  }

  async function yukle() {
    const d = await rpc('klan_bilgi');
    if (!d) return;
    const once_ = B?.klan?.id ?? null;
    B = d;
    const k = d.klan;
    if (once_ && !k) hud.info?.('You are no longer a member of a clan.', 'hata');
    kanalaBaglan(k?.id || null);
    state.klan = k ? { id: k.id, ad: k.ad, rutbe: d.ben?.rutbe } : null;
    // KO ittifakı: ittifak klanları ana klanın pelerinini giyer (sembol kendi klanının)
    B.ittifak = k ? (await sb.rpc('ittifak_bilgi', { p_klan: k.id })).data || null : null;
    const it = B.ittifak && Number(B.ittifak.ana) !== Number(k?.id) ? B.ittifak : null;
    birlikBaglan(!k ? null : B.ittifak?.ana ? 'i' + B.ittifak.ana : 'k' + k.id);
    const pn = it ? it.pelerin : k?.pelerin, pt = it ? it.pelerin_tur : k?.pelerin_tur;
    const prgb = it ? it.pelerin_rgb : k?.pelerin_rgb;
    const pel = k ? { k: k.id, n: pn ?? null, ...(prgb != null ? { r: Number(prgb) } : {}), u: pt === 'uzun' ? 1 : 0, v: k.sembol_v || 0, g: Number(seviyeOf(k).derece) || 5 } : null;   // g: klanın görünen derecesi (Knight / Accredited / Royal 5→1) → kolluk
    state.net?.setKlan?.(k?.ad || null, pel, Number(d.ben?.rutbe) === 1);
    state.pelerinKendi?.(pel);
    nameTag?.(k?.ad || null, Number(d.ben?.rutbe) === 1);
    ciz();
  }

  // ---- pencere
  const ROW = 5;
  function bagla() {
    // (7.11) KO yazıları İngilizce kalır (orijinal re_clan_window)
    for (let i = 0; i < ROW; i++) for (const g of L.all('grp_member_list_' + i)) g.querySelectorAll('[data-id="edit_title"] .kui-tx').forEach((e) => (e.textContent = ''));
    // orijinal KO yerleşiminde başlık yazıları boş (UIText'ten gelir): sütun başlıkları, duyuru başlığı, rütbe etiketi
    for (const [id, t] of [['class', 'Job'], ['duty', 'Position'], ['name', 'Character name'], ['lv', 'Level'], ['memo', 'Memo'], ['last', 'Last Online'], ['title_notice', 'Announcement'], ['rank', 'Rank :']]) for (const e of L.all(id)) if (e.classList.contains('kui-tx')) { e.textContent = t; e.classList.add('klan-baslik'); }
    const ipucu = { btn_clan_point: 'Clan Points', btn_clan_save: 'Accumulated Contributions', btn_clan_union: 'Alliance', btn_clan_admit: 'Invite to clan', btn_clan_remove: 'Expel the selected member',
      btn_clan_notice: 'Write the notice', btn_clan_refresh: 'Refresh', btn_Clan_party: 'Invite to party', btn_clan_whisper: 'Whisper', btn_clan_memo: 'Write a memo', btn_clan_appoint: 'Appoint / dismiss Assistant Leader', btn_clan_transfer: 'Transfer leadership' };
    for (const [id, t] of Object.entries(ipucu)) L.all(id).forEach((e) => (e.title = t));
    // satırlar: tıkla seç, çift tıkla fısıltı
    for (let i = 0; i < ROW; i++) {
      const sec = () => { const u = uyeler()[sayfa + i]; if (!u) return; secili = u.id; ciz(); };
      L.click('btn_selected' + i, sec);
      L.all('btn_selected' + i).forEach((e) => e.addEventListener('dblclick', () => { const u = uyeler()[sayfa + i]; if (u && u.id !== me) state.pm?.ac?.(String(u.id), u.ad); }));
    }
    // kaydırma: tekerlek (liste alanı) + kaydırma çubuğunun üst / alt yarısı
    const kaydir = (d) => { const n = uyeler().length; sayfa = Math.max(0, Math.min(Math.max(0, n - ROW), sayfa + d)); ciz(); };
    // KO kaydırma çubukları (üye listesi + duyuru): ▲ ▼ düğmeleri, sürüklenebilir tutamak, çubuğa tıklama, fare tekerleği
    const cubuk = (sc, { adim, oranGit, oran }) => {
      if (!sc) return () => {};
      sc.style.pointerEvents = 'auto';
      const [yukari, asagi] = sc.querySelectorAll(':scope > .kui-btn'), iz = sc.querySelector(':scope > .kui-tr');
      const tut = iz?.querySelectorAll(':scope > .kui-img')[1];
      for (const [b, d] of [[yukari, -1], [asagi, 1]]) if (b) { b.classList.add('kui-tik'); b.style.pointerEvents = 'auto'; b.addEventListener('click', (e) => { e.stopPropagation(); adim(d); }); }
      const guncelle = () => {
        if (!iz || !tut) return;
        const H = iz.clientHeight || parseFloat(iz.style.height) || 60, h = tut.clientHeight || parseFloat(tut.style.height) || 35;
        tut.style.top = Math.round(Math.max(0, Math.min(1, oran())) * Math.max(0, H - h)) + 'px';
      };
      if (iz) {
        iz.style.pointerEvents = 'auto';
        let surukle = null;
        iz.addEventListener('pointerdown', (e) => {
          e.stopPropagation(); e.preventDefault();
          const r = iz.getBoundingClientRect(), h = tut?.getBoundingClientRect().height || 20;
          const git = (y) => oranGit(Math.max(0, Math.min(1, (y - r.top - h / 2) / Math.max(1, r.height - h))));
          if (e.target === tut || tut?.contains(e.target)) { surukle = git; iz.setPointerCapture(e.pointerId); } else git(e.clientY);
        });
        iz.addEventListener('pointermove', (e) => { if (surukle) surukle(e.clientY); });
        iz.addEventListener('pointerup', () => (surukle = null));
      }
      return guncelle;
    };
    const listeOran = () => { const n = uyeler().length; return n > ROW ? sayfa / (n - ROW) : 0; };
    cubukListe = cubuk(L.get('scrollbar_list'), { adim: kaydir, oranGit: (o) => { const n = uyeler().length; sayfa = Math.round(o * Math.max(0, n - ROW)); ciz(); }, oran: listeOran });
    const not = L.get('text_notice');
    if (not) { not.style.overflow = 'hidden'; not.style.pointerEvents = 'auto'; }
    const notOran = () => (not && not.scrollHeight > not.clientHeight ? not.scrollTop / (not.scrollHeight - not.clientHeight) : 0);
    cubukDuyuru = cubuk(L.get('scrollbar_notice'), { adim: (d) => { if (not) { not.scrollTop += d * 16; cubukDuyuru(); } }, oranGit: (o) => { if (not) { not.scrollTop = o * (not.scrollHeight - not.clientHeight); cubukDuyuru(); } }, oran: notOran });
    L.el.addEventListener('wheel', (e) => {
      const ic = (el) => { const r = el?.getBoundingClientRect(); return r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
      if (ic(L.get('area_list')) || ic(L.get('scrollbar_list'))) { e.preventDefault(); kaydir(e.deltaY > 0 ? 1 : -1); }
      else if (ic(L.get('area_notice')) || ic(L.get('scrollbar_notice'))) { e.preventDefault(); if (not) { not.scrollTop += e.deltaY > 0 ? 18 : -18; cubukDuyuru(); } }
    }, { passive: false });
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    L.el.addEventListener('keydown', (e) => e.stopPropagation());

    const benimRutbe = () => Number(B?.ben?.rutbe || 0);
    const seciliUye = () => uyeler().find((u) => u.id === secili) || null;
    const gerekSecim = () => { const u = seciliUye(); if (!u) hud.notice?.('Select a member from the list first.', 'hata'); return u; };
    L.click('btn_clan_refresh', () => yukle());
    // KO Clan Point: ulus puanını klana bağışla (geri alınamaz); toplam klan puanı ve kendi bağışın
    L.click('btn_clan_point', () => puanKO());
    // Accumulated Contributions: üyelerin klana bağışladığı ulus puanları
    L.click('btn_clan_save', () => {
      const k = B?.klan; if (!k) return hud.mesaj?.('Contributions', 'Not a clan member.');
      const ilk = [...uyeler()].sort((a, b) => (b.bagis || 0) - (a.bagis || 0)).slice(0, 3);
      hud.mesaj?.('Clan Contributions', `Clan Point fund: ${fmt(k.fon)} CP (total donated ${fmt(k.puan)} NP)\n` + (ilk.some((u) => u.bagis) ? ilk.filter((u) => u.bagis).map((u, i) => `${i + 1}. ${u.ad}: ${fmt(u.bagis)} NP (${fmt(Math.floor(u.bagis / 36))} CP)`).join('\n') : 'No donations yet.'));
    });
    L.click('btn_clan_union', () => ittifakDavet());   // KO: düğme doğrudan ittifak daveti (klan adı) penceresini açar
    L.click('btn_Clan_party', () => hud.mesaj?.('Party', 'The party system is not available yet.'));
    L.click('btn_clan_whisper', () => { const u = gerekSecim(); if (u && u.id !== me) state.pm?.ac?.(String(u.id), u.ad); });
    L.click('btn_clan_admit', () => {
      if (!B?.klan) return hud.notice?.('Not a clan member.', 'hata');
      if (![1, 2].includes(benimRutbe())) return hud.notice?.('Only the clan leader and assistant leaders can invite members.', 'hata');
      // KO: oyunda tıklanarak seçilen oyuncuya doğrudan davet; seçili oyuncu yoksa ad sorulur
      const so = state.seciliOyuncu;
      if (so?.id) {
        if (Number(so.meta?.nation) && Number(so.meta.nation) !== Number(character.nation)) return hud.notice?.('You can only invite players of your own nation.', 'hata');
        if (so.meta?.klan) return hud.notice?.(`${so.meta.name} is already in a clan.`, 'hata');
        return davetEt(so.id);
      }
      hud.girdi?.('Clan Invitation', 'Enter the name of the player you want to invite.', { max: 20 }, async (ad) => {
        if (!ad) return;
        const { data: h } = await sb.from('characters').select('id,name').ilike('name', ad).limit(1).maybeSingle();
        if (!h) return hud.notice?.('Player not found.', 'hata');
        davetEt(h.id);
      });
    });
    L.click('btn_clan_remove', () => {
      const u = gerekSecim(); if (!u) return;
      if (u.id === me) return hud.notice?.('You cannot expel yourself. Talk to the [Knight Clerk] to leave the clan.', 'hata');
      L.text('str_purge', `Do you want to expel ${u.ad} from the clan?`); L.show('group_purge', true);
    });
    L.click('btn_purge_cancle', () => L.show('group_purge', false));
    L.click('btn_purge_ok', async () => {
      L.show('group_purge', false); const u = seciliUye(); if (!u) return;
      const d = await rpc('klan_at', { p_hedef: u.id }); if (!d) return;
      hud.info?.(`${d.ad} has been expelled from the clan.`, 'beceri'); secili = null; yay('degisti', { olay: 'atildi', ad: d.ad }); yukle();
    });
    L.click('btn_clan_appoint', () => {
      const u = gerekSecim(); if (!u) return;
      if (benimRutbe() !== 1) return hud.notice?.('Only the clan leader can appoint assistant leaders.', 'hata');
      if (u.id === me) return;
      const yeni = Number(u.rutbe) === 2 ? 4 : 2;
      hud.soru?.('Appoint', yeni === 2 ? `Appoint ${u.ad} as Assistant Leader?` : `Remove ${u.ad} from Assistant Leader?`, async () => {
        const d = await rpc('klan_yetki', { p_hedef: u.id, p_rutbe: yeni }); if (!d) return;
        hud.info?.(`${d.ad}: ${{ 1: 'Leader', 2: 'Assistant Leader', 4: 'Member' }[d.rutbe] || RUTBE[d.rutbe]}.`, 'beceri'); yay('degisti'); yukle();
      });
    });
    L.click('btn_clan_transfer', () => {
      const u = gerekSecim(); if (!u) return;
      if (benimRutbe() !== 1) return hud.notice?.('Only the clan leader can transfer leadership.', 'hata');
      if (u.id === me) return;
      hud.soru?.('Transfer Leadership', `Transfer clan leadership to ${u.ad}?\nYou will become an Assistant Leader.`, async () => {
        const d = await rpc('klan_devret', { p_hedef: u.id }); if (!d) return;
        hud.info?.(`Clan leadership has been transferred to ${d.ad}.`, 'seviye'); yay('degisti', { olay: 'devir', ad: d.ad }); yukle();
      });
    });
    // duyuru (lider / yardımcı): KO group_notice — 200 karakter
    const metinKutusu = (grup, id, max, sayac, yer = null) => {
      const ed = L.get(id); if (!ed) return null;
      let t = ed.querySelector('textarea');
      if (!t) {
        ed.textContent = ''; t = document.createElement('textarea'); t.className = 'kui-input klan-metin'; t.maxLength = max; t.spellcheck = false; ed.append(t);
        if (yer) Object.assign(t.style, { inset: 'auto', left: yer[0] + 'px', top: yer[1] + 'px', width: yer[2] + 'px', height: yer[3] + 'px', resize: 'none', overflow: 'hidden', lineHeight: '20px' });
        if (yer) t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); L.get('btn_memo_ok')?.click(); } });
        t.addEventListener('keydown', (e) => e.stopPropagation());
        t.addEventListener('input', () => L.text(sayac, String(t.value.length)));
      }
      return t;
    };
    L.click('btn_clan_notice', () => {
      if (!B?.klan) return hud.notice?.('Not a clan member.', 'hata');
      if (![1, 2].includes(benimRutbe())) return hud.notice?.('Only the clan leader and assistant leaders can write the notice.', 'hata');
      const t = metinKutusu('group_notice', 'edit_notice', 200, 'text_byte'); if (!t) return;
      L.show('group_memo', false); L.show('group_notice', true);
      t.value = B.klan.duyuru || ''; L.text('text_byte', String(t.value.length)); L.text('text_warning', ''); setTimeout(() => t.focus(), 30);
    });
    L.click('btn_notice_cancel', () => L.show('group_notice', false));
    L.click('btn_notice_ok', async () => {
      const t = L.get('edit_notice')?.querySelector('textarea'); L.show('group_notice', false);
      const d = await rpc('klan_duyuru', { p_metin: t?.value || '' }); if (!d) return;
      hud.info?.('The clan notice has been updated.', 'beceri'); yay('degisti'); yukle();
    });
    L.click('btn_clan_memo', () => {
      if (!B?.klan) return hud.notice?.('Not a clan member.', 'hata');
      const t = metinKutusu('group_memo', 'edit_memo', 20, 'text_byte', [14, 24, 200, 30]); if (!t) return;   // KO: 'Notunu yaz' başlığının altındaki tek satır
      L.show('group_notice', false); L.show('group_memo', true);
      const ben = uyeler().find((u) => u.id === me); t.value = ben?.not || ''; L.all('text_byte').forEach((e) => (e.textContent = String(t.value.length)));
      L.all('text_warning').forEach((e) => (e.textContent = '')); setTimeout(() => t.focus(), 30);
    });
    L.click('btn_memo_cancel', () => L.show('group_memo', false));
    L.click('btn_memo_ok', async () => {
      const t = L.get('edit_memo')?.querySelector('textarea'); L.show('group_memo', false);
      const d = await rpc('klan_notu', { p_metin: t?.value || '' }); if (!d) return;
      yay('degisti'); yukle();
    });
  }
  const uyeler = () => B?.uyeler || [];
  window.koKlanUyeIdleri = () => uyeler().map((u) => Number(u.id));   // PM süzgeci (Whisper Mode Settings → Clan/Union)

  // ---- KO klan ittifakı (Union): ana klan Knight III+, en fazla 3 klan; pelerinli yalnız bir katılan
  function ittifakDavet() {
    const k = B?.klan; if (!k) return hud.notice?.('Not a clan member.', 'hata');
    const it = B.ittifak;
    if (Number(B?.ben?.rutbe) !== 1) return hud.notice?.('Only the clan leader can send an alliance request.', 'hata');
    if (it && Number(it.ana) !== Number(k.id)) return hud.notice?.('Only the leader of the main clan can send alliance requests.', 'hata');
    hud.girdi?.('Alliance Invitation', 'Name of the clan to invite:', { max: 15 }, async (ad) => {
      if (!ad) return; const d = await rpc('ittifak_davet', { p_klan_ad: ad }); if (!d) return;
      genel.send({ type: 'broadcast', event: 'ittifak', payload: { hedef_lider: d.hedef_lider, ana_ad: d.ana_ad } });
      hud.info?.(`An alliance request has been sent to the "${d.hedef_ad}" clan.`, 'beceri');
    });
  }
  async function ittifakMenu(metin) {
    const k = B?.klan; if (!k) return hud.mesaj?.('Alliance', 'Not a clan member.');
    const { npcMenuAc, npcMenuKapat } = await import('./npc-menu.js');
    const it = B.ittifak, lider = Number(B?.ben?.rutbe) === 1, ana = it && Number(it.ana) === Number(k.id);
    const liste = it ? it.klanlar.map((x) => `${x.ana ? '★ ' : '• '}${x.ad} — ${dereceAdi({ seviye: x.seviye })}${x.ana ? ' (main clan)' : ''}`).join('\n') : '';
    const sec = [];
    if (lider && (!it || ana)) sec.push({ ad: 'Send alliance invitation', fn: () => { npcMenuKapat(); ittifakDavet(); } });
    if (lider && it && ana) for (const x of it.klanlar.filter((y) => !y.ana)) sec.push({ ad: `Remove clan ${x.ad}`, kalsin: true, fn: async () => { const d = await rpc('ittifak_ayril', { p_klan: x.id }); if (!d) return; genel.send({ type: 'broadcast', event: 'ittifak_degisti', payload: { ana: k.id, klan: x.id } }); await yukle(); ittifakMenu(`${x.ad} has been removed from the alliance.`); } });
    if (lider && it) sec.push({ ad: ana ? 'Disband alliance' : 'Leave alliance', html: `<span class="npm-kirmizi">${ana ? 'Disband alliance' : 'Leave alliance'}</span>`, kalsin: true, fn: async () => { const d = await rpc('ittifak_ayril', {}); if (!d) return; genel.send({ type: 'broadcast', event: 'ittifak_degisti', payload: { ana: it.ana, klan: k.id } }); await yukle(); ittifakMenu(ana ? 'The alliance has been disbanded.' : 'You have left the alliance.'); } });
    sec.push({ ad: 'Close', html: '<span class="npm-kirmizi">Close</span>', fn: () => npcMenuKapat() });
    npcMenuAc({ ad: 'Clan Alliance', metin: metin || (it ? `Alliance: ${it.ana_ad}\n${liste}\n\nAllied clans wear the cape of the main clan.` : 'Your clan is not in an alliance.\n• Clans of Knight III or higher can form an alliance; any clan can accept an invitation.\n• Up to 3 clans can join; only one of them may have completed the cape quest (Knight III+), the others must be Knight IV / V.\n• A member clan that is promoted in grade leaves the alliance automatically.'), secenekler: sec });
  }

  // ---- KO Clan Point penceresi: ulus puanını klana bağışla (ikonlu, KO çerçeveli)
  const IKON = {
    kalkan: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z" fill="#c9a24a" stroke="#3a2b17" stroke-width="1.2"/><path d="M12 6l1.8 3.7 4 .5-2.9 2.8.7 4L12 15l-3.6 2 .7-4-2.9-2.8 4-.5z" fill="#fff3c0"/></svg>',
    yildiz: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z" fill="#ffd76a" stroke="#6b4a10" stroke-width="1"/></svg>',
    el: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" fill="#9fd8ff" stroke="#1d3a5a"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="#5aa8e8" stroke="#1d3a5a"/></svg>',
    bayrak: '<svg viewBox="0 0 24 24"><path d="M5 2v20" stroke="#c9a24a" stroke-width="2"/><path d="M6 3h12l-3 4 3 4H6z" fill="#3a74ff" stroke="#0d2266"/></svg>',
  };
  let PP = null;
  // KO 2369 re_clan_clanpoint (Clan point accumulation); yerleşim yoksa eski pencere
  async function puanKO() {
    if (!B?.klan) return hud.notice?.('Not a clan member.', 'hata');
    const K = await import('./klan-ko.js').catch(() => null);
    const ok = await K?.klanPuanKO({ np: B?.ben?.np, onKaydet: async (n) => {
      if (n < 36) { hud.notice?.('You must save at least 36 national points (36 NP = 1 Clan Point).', 'hata'); return false; }
      const d = await rpc('klan_bagis', { p_miktar: n }); if (!d) return false;
      if (d.ok === false) { hud.notice?.(d.mesaj, 'hata'); return false; }
      hud.info?.(`You saved ${fmt(d.harcanan)} national points to the clan (+${fmt(d.cp)} Clan Points). Clan fund: ${fmt(d.fon)} CP.`, 'np-kazanc');
      state.inv?.stats?.(); yay('degisti'); await yukle(); return true;
    } });
    if (!ok) puanPenceresi();
  }
  function puanPenceresi() {
    const k = B?.klan; if (!k) return hud.mesaj?.('Clan Points', 'Not a clan member.');
    if (!PP) {
      PP = document.createElement('div'); PP.id = 'klan-puan'; PP.className = 'ko-panel ko-pencere';
      PP.innerHTML = `<div class="ay-baslik">Clan Points</div><button class="ko-kapat" title="Close"></button>
        <div class="kp-govde">
          <div class="kp-satir"><i>${IKON.kalkan}</i><span>Clan Point fund</span><b data-k="fon"></b></div>
          <div class="kp-satir"><i>${IKON.yildiz}</i><span>Members' national points</span><b data-k="uyenp"></b></div>
          <div class="kp-satir"><i class="kp-arma"></i><span>Grade</span><b data-k="derece"></b></div>
          <div class="kp-cubuk"><div></div><em data-k="sonraki"></em></div>
          <div class="kp-satir"><i>${IKON.el}</i><span>Your donation</span><b data-k="bagis"></b></div>
          <div class="kp-satir"><i>${IKON.bayrak}</i><span>Your national points</span><b data-k="np"></b></div>
          <div class="kp-giris"><label>National points to donate <em data-k="donusum"></em></label><input type="number" min="36" step="36" placeholder="0"></div>
          <div class="kp-hizli"><button class="ay-dugme" data-n="100">+100</button><button class="ay-dugme" data-n="1000">+1,000</button><button class="ay-dugme" data-n="hepsi">All</button></div>
          <div class="kp-uyari">36 national points = 1 Clan Point. If you leave or are expelled from the clan, only 30% of your donation is returned (100% with a Clan Contribution Certificate).</div>
          <div class="kp-dugmeler"><button class="ay-dugme" data-k="bagisla">Donate</button><button class="ay-dugme" data-k="iptal">Cancel</button></div>
        </div>`;
      (document.getElementById('kohud') || document.body).append(PP);
      const inp = PP.querySelector('input');
      const kapat = () => { PP.hidden = true; };
      PP.querySelector('.ko-kapat').onclick = kapat; PP.querySelector('[data-k="iptal"]').onclick = kapat;
      PP.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(PP); });
      // dışarı tıklanınca (yürümek için zemine tıklama dahil) kapanır
      addEventListener('pointerdown', (e) => { if (PP && !PP.hidden && !PP.contains(e.target) && !e.target.closest?.('[data-id="btn_clan_point"]')) kapat(); }, true);
      PP.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') PP.querySelector('[data-k="bagisla"]').click(); if (e.key === 'Escape') kapat(); });
      const donusum = () => { const n = Math.floor(Number(inp.value) || 0); PP.querySelector('[data-k="donusum"]').textContent = n >= 36 ? `→ ${fmt(Math.floor(n / 36))} CP` : ''; };
      inp.addEventListener('input', donusum);
      PP.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { const np = Number(B?.ben?.np) || 0; inp.value = b.dataset.n === 'hepsi' ? np - (np % 36) : Math.min(np, (Number(inp.value) || 0) + Number(b.dataset.n)); donusum(); }));
      PP.querySelector('[data-k="bagisla"]').onclick = async () => {
        const n = Math.floor(Number(inp.value) || 0); if (n < 36) { hud.notice?.('You must donate at least 36 national points (36 NP = 1 CP).', 'hata'); return; }
        const d = await rpc('klan_bagis', { p_miktar: n }); if (!d) return;
        if (d.ok === false) { hud.notice?.(d.mesaj, 'hata'); return; }
        hud.info?.(`You donated ${fmt(d.harcanan)} national points to the clan (+${fmt(d.cp)} Clan Points). Clan fund: ${fmt(d.fon)} CP.`, 'np-kazanc');
        inp.value = ''; state.inv?.stats?.(); yay('degisti'); await yukle(); doldur();
      };
    }
    const doldur = () => {
      const k2 = B?.klan; if (!k2 || !PP) return;
      const sv = seviyeOf(k2), ust = sv.sonraki ? Number(sv.sonraki) : null, cpMi = sv.sonraki_tur === 'cp';
      const deger = cpMi ? Number(k2.fon) || 0 : Number(sv.np ?? k2.np) || 0;
      const ALT = { 4: 72000, 3: 144000, 2: 360000, 1: 720000 }, alt = cpMi ? 0 : (ALT[sv.derece] || 0);
      PP.querySelector('.kp-arma').style.backgroundImage = `url(${armaUrl(k2)})`;
      const q = (x) => PP.querySelector(`[data-k="${x}"]`);
      q('fon').textContent = `${fmt(k2.fon)} CP`; q('uyenp').textContent = fmt(sv.np ?? k2.np); q('derece').textContent = dereceAdi(k2);
      q('bagis').textContent = fmt(B.ben?.bagis); q('np').textContent = fmt(B.ben?.np);
      PP.querySelector('.kp-cubuk > div').style.width = (ust ? Math.min(100, Math.max(0, (deger - alt) / (ust - alt) * 100)) : 100) + '%';
      q('sonraki').textContent = !ust ? (sv.tur === 'mavi' ? 'Knight I — Accredited: Emblem of Honor + 10,000,000 Noah (Knight Clerk)' : 'Highest grade')
        : cpMi ? (sv.tur === 'akredite' && sv.derece === 1 ? `Royal Knight: Royal Emblem + 100,000,000 Noah + ${fmt(ust)} CP` : `Next grade: ${fmt(ust)} CP (promote at the Knight Clerk)`)
        : `Next grade: national points (members + donations) ${fmt(ust)} (${fmt(Math.max(0, ust - deger))} left)`;
    };
    doldur(); PP.hidden = false; koWindow(PP); toFront(PP); PP.style.zIndex = 4300;
    requestAnimationFrame(() => requestAnimationFrame(() => PP.querySelector('input')?.focus()));   // koWindow ortalarken bir kare gizli
  }

  function ciz() {
    { const y = hud.klanL?.(); if (y !== L) { L = y; if (L) bagla(); } }
    if (!L) return;
    const k = B?.klan;
    // KO: klansız oyuncu — klan alanı bulanık, önünde bilgi yazısı (sekmeler ve kapat düğmesi açık kalır)
    let ort = L.el.querySelector('.klan-yok');
    if (!ort) {
      ort = document.createElement('div'); ort.className = 'klan-yok';
      ort.innerHTML = `<div class="ky-kutu"><b>You are not a member of a clan.</b>
        <p>To create a clan, talk to <span>[Knight Clerk] Delaga</span> (Karus) or <span>[Knight Clerk] Charel</span> (El Morad) in Moradon.</p>
        <p class="ky-gri">Required: level 20 and 500,000 Noah</p>
        <p>Join a clan to see this area: the clan leader or an assistant leader can select you in the game and invite you.</p></div>`;
      ort.addEventListener('pointerdown', (e) => e.stopPropagation());
      L.el.append(ort);
    }
    ort.hidden = true;   // KO: klansız oyuncuda pencere boş görünür (bilgi kutusu yok)
    L.show('Base_ClanSkillState', false);   // klan becerisi şeridi (isimsiz mavi düğme)
    for (const id of ['btn_clan_ladder_point', 'btn_clan_point', 'btn_clan_save', 'btn_clan_union', 'btn_clan_admit', 'btn_clan_remove', 'btn_clan_notice', 'btn_clan_appoint', 'btn_clan_transfer']) L.show(id, !!k);
    // KO: üstte klan adı, altında klan derecesi, onun altında oyuncunun rütbesi
    L.text('text_clan_grade', k ? k.ad : '');
    L.text('text_clan_name', k ? dereceAdi(k) : '');
    for (const im of L.all('img_symbol')) { im.style.backgroundImage = k ? `url(${armaUrl(k)})` : ''; im.style.backgroundSize = '100% 100%'; im.style.backgroundPosition = 'center'; im.classList.toggle('klan-arma', !!k); im.title = k ? dereceAdi(k) : ''; }
    L.text('text_clan_duty', k ? (RUTBE[B.ben?.rutbe] || '') : '');
    // "Rütbe :" etiketi KO'nun "Rank :" alanından uzun: etiket kendi genişliğinde, rütbe adı hemen sağında (iç içe binmesin)
    for (const e of L.el.querySelectorAll('.kui-tx')) if (e.dataset.id !== 'duty' && (['Rütbe :', 'Rütbe:', 'Rank :', 'Rank:'].includes(e.textContent.trim()) || e.dataset.rutbeEtiket)) {
      e.dataset.rutbeEtiket = '1'; e.textContent = 'Rank :'; e.style.width = 'auto'; e.style.overflow = 'visible'; e.style.whiteSpace = 'nowrap';
      const d = L.get('text_clan_duty');
      if (d) requestAnimationFrame(() => { const sol = parseFloat(e.style.left) || 0, gen = e.scrollWidth || 34; d.style.left = (sol + gen + 4) + 'px'; d.style.width = Math.max(40, 258 - (sol + gen + 4)) + 'px'; d.style.justifyContent = 'flex-start'; });
    }
    if (!k) L.text('text_clan_duty', '');
    L.text('text_notice', k ? (k.duyuru || '') : '');
    const U = uyeler();
    L.text('text_current_member_count', `Current Online : ${k ? U.filter((u) => u.cevrimici).length : 0}`);   // KO Texts_us 30024
    L.text('text_clan_member_count', k ? `Total : ${U.length}/50` : '');
    L.text('text_siege_point', `Siege Point: ${fmt(k?.kusatma_puan ?? k?.siege ?? 0)}`);   // KO Texts_us 44652
    sayfa = Math.max(0, Math.min(sayfa, Math.max(0, U.length - ROW)));
    for (let i = 0; i < ROW; i++) {
      const u = U[sayfa + i], g = L.get('grp_member_list_' + i); if (!g) continue;
      const q = (id) => g.querySelector(`[data-id="${id}"]`);
      g.hidden = !u;
      L.all('btn_selected' + i).forEach((b) => { b.classList.toggle('secili', !!u && u.id === secili); b.style.visibility = u ? '' : 'hidden'; });
      if (!u) continue;
      const ulus = u.ulus ?? u.nation ?? k?.ulus ?? k?.nation ?? character.nation, ik = SINIF_IKON(u.sinif, ulus);
      // KO düzeninde 4. satırın img_class_2'si yanlış (Priest) simgeyi gösteriyor: her satırda simge atlas karesinden (1051 + ik) değil, sıradaki img_class_<ik> öğesinden
      for (let c = 0; c < 8; c++) { const e = q('img_class_' + c); if (e) e.hidden = c !== ik; }
      const ie = q('img_class_' + ik); if (ie) { ie.title = sinifAdi(u.sinif, ulus); if (i === 3 && ik === 2) { const ref = L.get('grp_member_list_0')?.querySelector('[data-id="img_class_2"]'); if (ref) for (const k of ['backgroundImage', 'backgroundPosition', 'backgroundSize']) ie.style[k] = ref.style[k]; } }
      const set = (id, t, renk) => { const e = q(id); if (e) { e.textContent = t; e.style.color = renk || ''; } };
      set('text_duty', RUTBE[u.rutbe] || '', u.rutbe === 1 ? '#ffd65a' : u.rutbe === 2 ? '#9fd8ff' : '');
      set('text_character', u.ad, u.id === me ? '#fff4a0' : '');
      set('text_level', String(u.sv));
      set('text_memo', u.not || '');
      set('text_last_access', u.cevrimici ? 'Online' : once(u.son), u.cevrimici ? '#7dff7a' : '#b8b0a0');
    }
    // yetkiye göre düğmeler soluk
    const r = Number(B?.ben?.rutbe || 0);
    const pasif = { btn_clan_admit: ![1, 2].includes(r), btn_clan_remove: ![1, 2].includes(r), btn_clan_notice: ![1, 2].includes(r), btn_clan_appoint: r !== 1, btn_clan_transfer: r !== 1, btn_clan_memo: !k, btn_clan_whisper: !k };
    for (const [id, p] of Object.entries(pasif)) L.all(id).forEach((e) => e.classList.toggle('kui-pasif', p));
    cubukListe(); requestAnimationFrame(() => { cubukDuyuru(); sigdir(); });
  }
  // Türkçe başlıklar (ör. "Seviye") ve seviye değerleri KO'nun dar sütununa sığsın: taşan yazının puntosu küçülür, ortalanır
  function sigdir() {
    if (!L) return;
    const hedef = [...L.el.querySelectorAll('.kui-tx')].filter((e) => !e.dataset.id ? ['Seviye', 'Level'].includes(e.textContent.trim()) : e.dataset.id === 'text_level');
    for (const e of hedef) {
      if (e.textContent.trim() === 'Level') e.textContent = 'Seviye';
      e.style.whiteSpace = 'nowrap'; e.style.overflow = 'visible'; e.style.textOverflow = 'clip'; e.style.justifyContent = 'center'; e.style.textAlign = 'center';
      e.style.fontSize = ''; e.style.letterSpacing = '';
      let fs = parseFloat(getComputedStyle(e).fontSize) || 12;
      while (e.scrollWidth > e.clientWidth + 1 && fs > 8) { fs -= 0.5; e.style.fontSize = fs + 'px'; e.style.letterSpacing = '-0.2px'; }
    }
  }

  async function davetEt(hedefId) {
    const d = await rpc('klan_davet_et', { p_hedef: Number(hedefId) }); if (!d) return;
    genel.send({ type: 'broadcast', event: 'davet', payload: { hedef: d.hedef, klan_ad: d.klan_ad, gonderen_ad: character.name } });
    hud.info?.(`A clan invitation has been sent to ${d.hedef_ad}.`, 'beceri');
  }

  // H menüsü → Topluluk → "Klandan ayrıl": Knight Clerk'teki ayrılma ile aynı (lider ayrılamaz, klanı Knight Clerk'te dağıtır)
  state.klanAyril = async () => {
    if (!B?.klan) await yukle().catch(() => {});
    if (!B?.klan) return hud.notice?.('Not a clan member.', 'hata');
    if (Number(B?.ben?.rutbe) === 1) return hud.notice?.('The clan leader cannot leave the clan. Visit the [Knight Clerk] in Moradon to disband it.', 'hata');
    const ad = B.klan.ad;
    hud.soru?.('Leave Clan', `Do you really want to withdraw from the "${ad}" clan? Only 30% of your donation will be returned (100% with a Clan Contribution Certificate).`, async () => {
      const d = await rpc('klan_ayril'); if (!d) return;
      yay('degisti', { olay: 'ayrildi', ad: character.name });
      hud.info?.(`Successfully quitted the clan.${d.iade ? ` ${fmt(d.iade)} national points of your donation were returned${d.tam ? ' (Clan Contribution Certificate: 100%)' : ' (30%)'}.` : ''}`, 'beceri');
      state.inv?.stats?.(); await yukle();
    });
  };

  // ---- [Knight Clerk]: klan kur / onay / ayrıl / dağıt
  /** KO klan kurma: klan adı penceresi (Knight Clerk ve Inn Hostess) → klan_kur */
  function klanKur() {
    if (B?.klan) { hud.notice?.("You can't create a clan because you're already in another clan.", 'hata'); return; }
    const kur = async (isim) => {
      if (!isim) return;
      const d = await rpc('klan_kur', { p_ad: isim }); if (!d) return;
      state.combat?.odulUygula?.({ gold: d.gold }); state.inv?.stats?.();
      hud.info?.('You are now a leader of a clan.  Congratulations!!!', 'seviye');   // KO Texts 6505
      await yukle();
    };
    import('./klan-ko.js').then((K) => K.klanAdiSor(kur)).then((ok) => { if (!ok) hud.girdi?.('Create Clan', 'Tell me, what would you like to name your clan?', { max: 15 }, kur); }).catch(() => hud.girdi?.('Create Clan', 'Tell me, what would you like to name your clan?', { max: 15 }, kur));
  }
  async function clerkMenu({ ad, model, yonetim = false }) {
    const { npcMenuAc, npcMenuKapat } = await import('./npc-menu.js');
    const k = () => B?.klan;
    const lider = () => Number(B?.ben?.rutbe) === 1;
    const soruIslem = async (baslik, metin, fn) => {   // KO re_clan_break: uyarılar → "5 + 5 = ?" onay sorusu
      const K = await import('./klan-ko.js').catch(() => null);
      if (await K?.klanAyrilOnay(fn, { hata: (m) => hud.notice?.(m, 'hata') })) return;
      const a = 2 + Math.floor(Math.random() * 8), b = 2 + Math.floor(Math.random() * 8);
      hud.girdi?.(baslik, `${metin}\nAnswer the question to confirm: ${a} + ${b} = ?`, { max: 3 }, (v) => { if (Number(v) === a + b) fn(); else hud.notice?.('Wrong answer. The action has been canceled.', 'hata'); });
    };
    const yetkili = () => [1, 2].includes(Number(B?.ben?.rutbe));
    // ===== KO Knight Clerk — 24xx sunucu dosyaları Quests/11610_charel.lua (21610_delaga aynı) birebir: metinler Quest_Talk / Quest_Menu
    const SELF = () => character.name;
    const T = (s) => s.replace(/<selfname>/g, SELF()).replace(/\|/g, '\n');
    const KAPAT = { ad: 'Close', fn: () => npcMenuKapat() };                 // Quest_Menu 27
    const ONAY = { ad: 'Confirm', fn: () => npcMenuKapat() };                // Quest_Menu 10
    const GIT = { ad: "No, I'll just go.", fn: () => npcMenuKapat() };       // Quest_Menu 4154
    const konus = (metin, secenekler) => npcMenuAc({ ad, model, metin: T(metin), secenekler });
    // CheckKnight: 0 klansız, 1 klan, 2 Training, 3–7 Accredited 5→1, 8–12 Royal 5→1 · CheckClanGrade: ulus puanına göre 1–5
    const sovalyeTur = () => { const kk = k(); if (!kk) return 0; const sv = seviyeOf(kk); if (sv.tur === 'royal') return 13 - sv.derece; if (sv.tur === 'akredite') return 8 - sv.derece; return kk.caitharos ? 2 : 1; };
    const klanDerece = () => puanDerece(k());
    const isinla = (tur, boss) => { npcMenuKapat();
      (async () => {
        const d = await rpc('klan_gorev_baslat', { p_tur: tur }); if (!d) return;
        yay('royal_isinla', { ids: d.isinlanan || [], tur, boss });
        setTimeout(() => { state.net?.halt?.(); const u = new URL(location.href); for (const x of ['x', 'z', 'bolge']) u.searchParams.delete(x); u.searchParams.set('karakter', character.id); location.replace(u.toString()); }, 1200);
      })(); };
    const sonra = async (d) => { if (d?.gold != null) state.combat?.odulUygula?.({ gold: d.gold }); state.inv?.reload?.(); state.inv?.stats?.(); yay('degisti'); await yukle(); };
    // sınav: [ön koşul] → anlatım (4157 → Next → Next) / teslim (4158) / meydan oku (4159)
    const sinav = ({ giris, hikaye, teslimSoru, isinlaTur, boss, teslim }) => konus(giris, [
      { ad: "I'll listen to your story further.", kalsin: true, fn: () => { const adim = (n) => konus(hikaye[n], n < hikaye.length - 1 ? [{ ad: 'Next ', kalsin: true, fn: () => adim(n + 1) }, KAPAT] : [KAPAT]); adim(0); } },
      { ad: 'I brought what you asked for.', kalsin: true, fn: () => konus(teslimSoru, [{ ad: 'Yes', kalsin: true, fn: teslim }, { ad: 'No', fn: () => npcMenuKapat() }]) },
      { ad: "Yes, I'll level a challenge.", fn: () => isinla(isinlaTur, boss) },
    ]);
    const altin = () => Number(state.combat?.stats?.gold ?? character.gold ?? 0);
    const esyaVar = async (num) => { const { count } = await sb.from('inventory').select('slot', { count: 'exact', head: true }).eq('char_id', me).eq('item_num', num).gte('slot', 14).lte('slot', 41); return (count || 0) > 0; };
    // 280: Training Knight Squad promotion test (Caitharos, 10M Noah + [910045000])
    const egitimSinavi = () => {
      if (sovalyeTur() !== 1) return konus('Sorry, but this test can only be attempted by a 1st  Class training Knight Squad. It\'s a useless test to you, <selfname>.', [ONAY]);
      if (klanDerece() >= 4) return konus('Your clan has to serve your country more. Only clans above class 3 are eligible to become knight squads.', [ONAY]);
      if (!lider()) return konus('Please relay to your clan leader that this mission can only be completed by him...', [ONAY]);
      sinav({ giris: 'The knight squad is a combat unit certified by the emperor. As proof of serving your country, only clans above class 3 are eligible to become knight squads. And you must prove your valor and ability. Caitharos is waiting to test you at the coliseum. After defeating Caitharos bring back the [Key of Honor] and 10 million Noahs. ',
        hikaye: ['The coliseum is home to many trials. The moment you enter the coliseum to undergo the knight squad test, all clan members in the mainland will be transported there. There is no distinction between enemy and friendly forces at the coliseum. Your friend can attack you as well as your opponent. Only the strong will emerge with the [Key of Honor].',
          'You may lose valuable EXP in the coliseum. And you may be detained there. Or you may be defeated by other clan members and lose the [Key of Honor].',
          'And the most important of all is that you, the clan leader, has to personally acquire the [Key of Honor]. Your friends aid in your combat against Caitharos but they cannot help you to acquire the key. Do not forget. I bid you good luck. '],
        teslimSoru: 'Did you bring the ingredients below needed for the knight squad promotion?', isinlaTur: 'caitharos', boss: 'Caitharos',
        teslim: async () => {
          if (altin() < 10000000) return konus('You don`t have enough Noahs. You need 10 million Noahs for the knight squad registration fee. ', [ONAY]);
          if (!(await esyaVar(910045000))) return konus('To be eligible to join the knight squad you must seize the [Key of Honor] from Caitharos.', [{ ad: 'Where can I find it?', fn: () => { npcMenuKapat(); hud.info?.('Caitharos: Knight Clerk → "Yes, I\'ll level a challenge." (Coliseum)'); } }, ONAY]);
          const { data: d, error } = await sb.rpc('klan_caitharos_tamamla', { p_char: me });
          if (error || !d?.ok) return konus(d?.mesaj || error?.message || '', [ONAY]);
          await sonra(d); konus('Congratulations! <selfname>\'s squad is now an approved National Combat Unit. I hope you achieve many honorable things trying for the Formal Knight Squad position in the future.', [ONAY]);
        } });
    };
    // 110: Accredited (Formal) Knight Squad promotion test (Isiloon, 10M Noah + Emblem of Honor)
    const akrediteSinavi = () => {
      if (sovalyeTur() !== 2) return konus('Sorry, but this test can only be attempted by a 1st  Class Formal Knight Squad. It\'s a useless test to you, <selfname>.', [ONAY]);
      if (klanDerece() !== 1) return konus('Your Knight Squad must do more service to the nation. A 1st Class Knight Squad can earn the right to be promoted as a Formal Knight Squad.', [ONAY]);
      if (!lider()) return konus('Please relay to your clan leader that this mission can only be completed by him...', [ONAY]);
      sinav({ giris: 'Come to me for anything related to the Knight Squad. What can I help you with today?',
        hikaye: ['The Abyss of Hell consists of many trials. As soon as you enter for your Knight Squad test,  everyone else in your clan will be summoned to your side. There is no distinction down there between enemy and ally. Anyone can attack anyone else, friend or foe. This is what makes it so challenging. Only the best and strongest combatant will earn the [Emblem of Honor].',
          'Consequences include the loss of EXP, becoming trapped temporarily, or losing the contest to another Knight Squad, in which case the [Emblem of Honor] goes with them, of course.',
          'Despite all of this, you must focus on one thing-|You,  <selfname>, Knight Squad Leader, must physically get  the [Emblem Royal] yourself! By which I mean, your allies can help you to defeat Isiloon in combat, but they won\'t be able to loot the emblem. That\'s up to you. Bear it in mind, anyway. I wish you luck. '],
        teslimSoru: 'Did you bring everything required for promotion to Formal Knight Squad?', isinlaTur: 'isiloon', boss: 'Isiloon',
        teslim: async () => {
          if (altin() < 10000000) return konus('Hmm, you have insufficient Noah. You need 10 million Noah for your Formal Knight Squad registration fee.', [ONAY]);
          if (!(await esyaVar(389221000))) return konus('You need the [Emblem of Honor] from Isiloon to be promoted to Formal Knight Squad.', [ONAY]);
          const { data: d, error } = await sb.rpc('klan_akredite_yap', { p_char: me });
          if (error || !d?.ok) return konus(d?.mesaj || error?.message || '', [ONAY]);
          await sonra(d); konus('Congratulations on your promotion to Formal Knight Squad! I hope you accomplish many honorable deeds for the nation now that you are a Formal Knight Squad.', [ONAY]);
        } });
    };
    // 120: Royal Knight Squad promotion test (Felankor / Red Dragon, 100M Noah + Royal Emblem)
    const royalSinavi = () => {
      if (sovalyeTur() !== 7) return konus('Your Knight Squad must do more service to the nation. A 1st Class Knight Squad can earn the right to be promoted as a Royal Knight Squad.', [ONAY]);
      if (!lider()) return konus('Please relay to your clan leader that this mission can only be completed by him...', [ONAY]);
      sinav({ giris: 'The Imperial Knight Squad is the nation\'s elite Combat Unit. To become a member, you must hold 1st Class qualifications as a Formal Knight Squad. <selfname> must also demonstrate great loyalty to the nation. Right now, Red Dragon is waiting to test you in',
        hikaye: ['There are many trials in the Cave of the Red Dragon. As soon as you enter for your Knight Squad test,  everyone else in your clan will be summoned to your side. There is no distinction down there between enemy and ally. Anyone can attack anyone else, frie',
          'Consequences include the loss of EXP, becoming trapped temporarily, or losing the contest to another Knight Squad, in which case the [Emblem Royal] goes with them, of course.',
          'Despite all of this, you must focus on one thing-|You,  <selfname>, Knight Squad Leader, must physically get  the [Emblem Royal] yourself! By which I mean, your allies can help you to defeat Red Dragon in combat, but they won\'t be able to loot the emblem.'],
        teslimSoru: 'Did you bring everything required for promotion to Royal Knight Squad?', isinlaTur: 'felankor', boss: 'Felankor',
        teslim: async () => {
          if (altin() < 100000000) return konus('Hmm, you have insufficient Noah. You need 100 million Noah for your Formal Night Squad registration fee.', [ONAY]);
          if (!(await esyaVar(389222000))) return konus('You need the [Emblem Royal] from Red Dragon to be promoted to Royal Knight Squad.', [ONAY]);
          const { data: d, error } = await sb.rpc('klan_royal_yap', { p_char: me });
          if (error || !d?.ok) return konus(/Clan Point/i.test(d?.mesaj || '') ? 'Sorry, but your Knight Squad\'s saving points are insufficient. You need 25,000 points to be promoted to Royal Knight Squad.' : (d?.mesaj || error?.message || ''), [ONAY]);
          await sonra(d); konus('Congratulations on your promotion to Royal Knight Squad! Show us you\'re worthy of the title!', [ONAY]);
        } });
    };
    // 350: I'd like to promote the Knight Squad's class. (Clan Point ile Accredited / Royal 5 → 1)
    const SINIF = { 3: [7000, 'Would you like to raise your Knight Squad\'s class?|You need 7,000 Knight Squad saving points to be promoted to 4th Class Formal Knight Squad.', 'Sorry, but your Knight Squad\'s saving points are insufficient. You need 7,000 points to rise to the next class.'],
      4: [10000, 'Would you like to raise your Knight Squad\'s class?|You need 10,000 Knight Squad saving points to be promoted to 3rd Class Formal Knight Squad.', 'Sorry, but your Knight Squad\'s saving points are insufficient. You need 10,000 points to rise to the next class.'],
      5: [15000, 'Would you like to raise your Knight Squad\'s class?|You need 15,000 Knight Squad saving points to be promoted to 2nd Class Formal Knight Squad.', 'Sorry, but your Knight Squad\'s saving points are insufficient. You need 15,000 points to rise to the next class.'],
      6: [20000, 'Would you like to raise your Knight Squad\'s class?|You need 20,000 Knight Squad saving points to be promoted to 1st Class Formal Knight Squad.', 'Sorry, but your Knight Squad\'s saving points are insufficient. You need 20,000 points to rise to the next class.'],
      8: [30000, 'Would you like to raise your Knight Squad\'s class?|You need 30,000 Knight Squad saving points to be promoted to 4th Class Royal Knight Squad.', 'Sorry, but your Knight Squad\'s saving points are insufficient. You need 30,000 points to rise to the next class.'],
      9: [35000, 'Would you like to raise your Knight Squad\'s class?|You need 35,000 Knight Squad saving points to be promoted to 3rd Class Royal Knight Squad.', 'Sorry, but your Knight Squad\'s saving points are insufficient. You need 35,000 points to rise to the next class.'],
      10: [40000, 'Would you like to raise your Knight Squad\'s class?|You need 40,000 Knight Squad saving points to be promoted to 2nd Class Royal Knight Squad.', 'Sorry, but your Knight Squad\'s saving points are insufficient. You need 40,000 points to rise to the next class.'],
      11: [45000, 'Would you like to raise your Knight Squad\'s class?|You need 45,000 Knight Squad saving points to be promoted to 1st Class Royal Knight Squad.', 'Sorry, but your Knight Squad\'s saving points are insufficient. You need 45,000 points to rise to the next class.'] };
    const sinifYukselt = () => {
      const t = sovalyeTur();
      if (t >= 3 && !lider()) return konus('Talk to your Knight Squad Leader. This mission can only be executed by them...', [KAPAT]);
      if (t < 3) return konus(lider() ? 'Your Knight Squad must do more service to the nation. A 1st Class Knight Squad can earn the right to be promoted as a Formal Knight Squad.' : 'Talk to your Knight Squad Leader. This mission can only be executed by them...', [KAPAT]);
      if (t === 7) return konus('Sorry, but to get your Knight Squad to the next class, you must undergo the Royal Knight Squad promotion test. Would you like to give it a shot?', [KAPAT]);
      if (t === 12) return konus('You are already the highest-class Knight Squad.', [KAPAT]);
      const [cp, soru, yetersiz] = SINIF[t];
      konus(soru, [{ ad: "I'll use the Knight's storage.", kalsin: true, fn: async () => {
        if (Number(k()?.fon || 0) < cp) return konus(yetersiz, [KAPAT]);
        const { data: d, error } = await sb.rpc('klan_derece_yukselt', { p_char: me });
        if (error || !d?.ok) return konus(d?.mesaj || error?.message || '', [KAPAT]);
        await sonra(d); konus('Congratulations!|Your Knight Squad class has been raised a level. Well done indeed!', [KAPAT]);
      } }, KAPAT]);
    };
    // 100: I want to earn knight privileges.
    const sovalye = () => konus('Select the challenge <selfname> wants to attempt.', [
      { ad: 'Training Knight Squad promotion test', kalsin: true, fn: egitimSinavi },
      { ad: 'Accredited Knight Squad promotion test', kalsin: true, fn: akrediteSinavi },
      { ad: 'Royal Knight Squad promotion test', kalsin: true, fn: royalSinavi },
      { ad: "I'd like to promote the Knight Squad's class.", kalsin: true, fn: sinifYukselt },
      GIT,
    ]);
    // 360: I want to earn basic country contribution.
    const katki = async () => {
      const { data: up } = await sb.from('characters').select('ulus_puani').eq('id', me).maybeSingle();
      if (Number(up?.ulus_puani ?? 0) > 100) return konus('Thanks to the legacy of the warriors who wage battle against the enemy, our land has remained safe and intact. For a fee, I raise the country CONT of warriors who have country CONT below 100. ', [ONAY]);
      const al = (m) => {
        if (altin() < (m === 500 ? 1500000 : 350000)) return konus(m === 500 ? 'You don`t have enough Noahs. You must pay a fee of 1.5 million Noahs to obtain 500 country CONT.' : 'You don`t have enough Noahs. You must pay a fee of 350,000 Noahs to obtain 100 country CONT.', [ONAY]);
        konus(m === 500 ? 'Do you want to receive 500 country CONT?' : 'Do you want to receive 100 country CONT?', [
          { ad: 'Accepted', kalsin: true, fn: async () => {
            const { data: d, error } = await sb.rpc('klan_cont_al', { p_char: me, p_miktar: m });
            if (error || !d?.ok) return konus(d?.mesaj || error?.message || '', [ONAY]);
            state.combat?.odulUygula?.({ gold: d.gold }); state.inv?.stats?.(); dispatchEvent(new CustomEvent('ko-ulus-puani', { detail: d.np })); npcMenuKapat();
          } },
          { ad: 'Rejected', fn: () => npcMenuKapat() },
        ]);
      };
      konus('The fee for acquiring 500 country CONT is 1.5 million Noahs, and 350, 000 Noahs for 100 country CONT.', [
        { ad: '500 contribution points will be charged. ', kalsin: true, fn: () => al(500) },
        { ad: '100 contribution points will be charged.', kalsin: true, fn: () => al(100) },
        GIT,
      ]);
    };
    // 370 / 380: aylık / ulusal şövalye maaşı (GetRankReward: 0 sıralamada değil, 2 bugün alındı)
    const maas = async (aylik) => {
      const { data: d, error } = await sb.rpc('sovalye_maas_al', { p_char: me, p_aylik: aylik });
      if (error || !d?.ok) return konus(d?.mesaj || error?.message || '', [ONAY]);
      if (d.kod === 0) return konus(aylik ? 'You do not possess the equal of ladder rank No. 100.' : 'You do not possess the equal of knight squad rank No. 50. ', [ONAY]);
      if (d.kod === 2) return konus(aylik ? 'You already collected your monthly stipend.' : 'You already collected your knight stipend for today.', [ONAY]);
      state.combat?.odulUygula?.({ gold: d.gold }); hud.info?.(`You have received ${fmt(d.altin)} Noah.`, 'seviye'); npcMenuKapat();
    };
    // (7.11) KO 24xx Quests/21610_delaga.lua · 11610_charel.lua EVENT 240 (+ yeni sürümde "spoils of war"): Quest_Talk 4150 / 4250,
    //   Quest_Menu 4150 · 4151 · 4155 · 4156 · 4256 · 4154 — birebir bu altı seçenek
    const ganimet = async () => {
      const { data: d, error } = await sb.rpc('savas_ganimeti_al', { p_char: me });
      if (error || !d?.ok) return konus(d?.mesaj || error?.message || '', [ONAY]);
      if (d.kod === 0) return konus("You were not ranked 100th on last month's Ladder rank.", [ONAY]);   // Quest_Talk 4800 / 4802
      if (d.kod === 2) return konus('You have already collected the spoils of war', [ONAY]);            // Quest_Talk 4801 / 4803
      if (d.gold != null) state.combat?.odulUygula?.({ gold: d.gold });
      if (d.item) state.inv?.reload?.();
      if (d.altin) hud.info?.(`You have received ${fmt(d.altin)} Noah.`, 'seviye');
      npcMenuKapat();
    };
    const ana = (metin) => npcMenuAc({ ad, model,
      metin: metin || "I'm in charge of the knight squad and knight ranking. What piques your interest?",
      secenekler: [
        { ad: 'I want to earn knight privileges.', kalsin: true, fn: sovalye },
        { ad: 'I want to earn basic country contribution.', kalsin: true, fn: katki },
        { ad: "I'd like to receive a monthly knight stipend.", kalsin: true, fn: () => maas(true) },
        { ad: "I'd like to receive the national knight stipend.", kalsin: true, fn: () => maas(false) },
        { ad: 'I want to receive the spoils of war.', kalsin: true, fn: ganimet },
        GIT,
      ] });
    // (7.11) KO'nun yeni Knight Clerk menüsünde olmayan klan işlemleri (ittifak, pelerin / sembol, ayrılma, dağıtma) → Inn Hostess "Clan management"
    const yonetimAc = () => npcMenuAc({ ad, model, metin: 'What would you like to do with your clan?', secenekler: [
        ...(!k() ? [{ ad: 'Create clan (500,000 Noah)', fn: () => { npcMenuKapat(); klanKur(); } }] : []),
        ...(k() ? [{ ad: 'Clan alliance', fn: () => ittifakMenu() }] : []),
        ...(false ? [{ ad: 'Clan cape', fn: async () => { if (!B.klan?.caitharos) { hud.notice?.('You must complete the Caitharos quest before you can buy a cape.', 'hata'); return; } npcMenuKapat(); const { pelerinDukkan } = await import('./pelerin.js'); pelerinDukkan({ sb, character, hud, klan: B.klan, lider: yetkili(), yenile: async (d) => { if (d?.gold != null) state.combat?.odulUygula?.({ gold: d.gold }); state.inv?.stats?.(); yay('degisti', { olay: 'pelerin' }); await yukle(); } }); } }] : []),
        ...(false ? [{ ad: 'Edit clan symbol', fn: async () => { npcMenuKapat(); if (!lider()) { hud.notice?.('Only the clan leader can edit the clan symbol.', 'hata'); return; } const { sembolEditor } = await import('./pelerin.js'); sembolEditor({ sb, character, hud, klan: B.klan, yenile: async (d) => { if (d?.gold != null) state.combat?.odulUygula?.({ gold: d.gold }); yay('degisti', { olay: 'sembol' }); await yukle(); } }); } }] : []),
        ...(k() && !lider() ? [{ ad: 'Leave clan', fn: () => { npcMenuKapat(); soruIslem('Leave Clan', `Do you want to leave the "${k().ad}" clan?`, async () => { const d = await rpc('klan_ayril'); if (d) { yay('degisti', { olay: 'ayrildi', ad: character.name }); hud.info?.(`Successfully quitted the clan.${d.iade ? ` ${fmt(d.iade)} national points of your donation were returned${d.tam ? ' (Clan Contribution Certificate: 100%)' : ' (30%)'}.` : ''}`, 'beceri'); state.inv?.stats?.(); await yukle(); } }); } }] : []),
        ...(k() && lider() ? [{ ad: 'Disband clan', html: '<span class="npm-kirmizi">Disband clan</span>', fn: () => { npcMenuKapat(); soruIslem('Disband Clan', `Do you want to disband the "${k().ad}" clan? All members will leave the clan.`, async () => { const d = await rpc('klan_dagit'); if (d) { yay('degisti', { olay: 'dagitildi' }); hud.info?.('Successfully disbanded the clan.', 'beceri'); await yukle(); } }); } }] : []),
        GIT,
      ] });
    if (yonetim) yonetimAc(); else ana();
  }
  document.addEventListener('ko-klan-pelerin', async () => {
    const { npcMenuKapat } = await import('./npc-menu.js'); npcMenuKapat();
    const yetkili = [1, 2].includes(Number(B?.ben?.rutbe));
    if (!B?.klan) return;
    // (7.11) Caitharos şartı pelerin bazında dükkânda (yılbaşı pelerinleri şartsız)
    const { pelerinDukkan } = await import('./pelerin.js');
    pelerinDukkan({ sb, character, hud, klan: B.klan, lider: yetkili, gorunum: { face: character.face, hair: character.hair, gear: state.gear || [], donanim: state.donanim, gearReady: state.gearReady }, yenile: async (d) => { if (d?.gold != null) state.combat?.odulUygula?.({ gold: d.gold }); state.inv?.stats?.(); yay('degisti', { olay: 'pelerin' }); await yukle(); } });
  });
  document.addEventListener('ko-klan-sembol', async () => {
    const { npcMenuKapat } = await import('./npc-menu.js'); npcMenuKapat();
    if (!B?.klan) return;
    if (Number(B?.ben?.rutbe) !== 1) { hud.notice?.('You do not have the authority. ', 'hata'); return; }   // KO Texts 6514
    const ac = async () => { const { sembolEditor } = await import('./pelerin.js'); sembolEditor({ sb, character, hud, klan: B.klan, yenile: async (d) => { if (d?.gold != null) state.combat?.odulUygula?.({ gold: d.gold }); yay('degisti', { olay: 'sembol' }); await yukle(); } }); };
    const K = await import('./klan-ko.js').catch(() => null);
    if (!(await K?.sembolKO(ac))) ac();
  });

  /** klan sohbeti (sohbetin Klan sekmesi) */
  function sohbet(text) {
    text = String(text || '').trim().slice(0, 200); if (!text) return;
    if (!B?.klan || !kanal) { hud.info?.('Not a clan member.', 'hata'); return; }
    yay('sohbet', { name: character.name, nation: character.nation, text });
    addLine?.(character.name, text, character.nation, 'klan');
  }

  hud.onKlanAc = () => { ciz(); yukle(); };
  ciz();   // KO yerleşimindeki örnek satırlar (Rock Crystals Path, Leader…) ilk açılışta görünmesin
  yukle();
  setInterval(() => { if (B?.klan && !document.hidden) yukle(); }, 60000);   // derece (ulus puanı) değişince kolluk / pelerin güncellensin
  return { yukle, davetEt, clerkMenu, klanKur, sohbet, birlikSohbet, get bilgi() { return B; } };
}
