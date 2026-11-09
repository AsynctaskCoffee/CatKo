// KO komutları (H → Command penceresi ve sohbette "/Komut"): KO 2369 Texts_us 8000–9511 adları.
// Her komut ya doğrudan çalışır ya da sohbete "/Komut " yazılır (argüman isteyenler). Büyük/küçük harf duyarsız.
// Karşılığı olmayan sistemler (parti, klan savaşı, kale kuşatması, koruyucu canavar…) KO uyarısıyla yanıt verir.
export function koKomutKur({ sb, character, state, hud, player, say }) {
  const me = Number(character.id);
  const bilgi = (t, c) => (say ? say(t, c) : hud.info?.(t, c));
  const secili = () => state.seciliOyuncu || null;   // { id, meta }
  const sohbeteYaz = (s) => { const i = document.getElementById('sohbet-giris'); if (!i) return; i.value = s; i.focus(); i.setSelectionRange(s.length, s.length); };
  const yok = (ad) => hud.notice?.(`${ad}: this feature is not available on this server yet.`, 'hata');
  const oyuncuBul = async (ad) => { if (!ad) return null; const { data } = await sb.from('characters').select('id, name, nation').ilike('name', ad).maybeSingle(); return data || null; };
  // KO duygu animasyonları (e_Ani: ANI_GREETING0–2 = 105–107, ANI_WAR_CRY0–2 = 108–110)
  const duygu = (k) => {
    const a = state.avatar; if (!a?.playOnce) return;
    if (state.dead || state.combat?.stats?.dead) return;
    if (state.dinlen?.aktif) { hud.notice?.('You cannot do that while sitting.', 'hata'); return; }
    state.hedefTemizle?.(); a.playOnce(k);
  };
  // takas / parti istek engeli (KO Block_Trade_Request / Allow_Trade_Request)
  state.takasEngel = state.takasEngel ?? false;
  state.engelli ||= new Set();
  try { for (const n of JSON.parse(localStorage.getItem('ko-chatblock-' + me) || '[]')) state.engelli.add(n); } catch {}
  const engelKaydet = () => { try { localStorage.setItem('ko-chatblock-' + me, JSON.stringify([...state.engelli])); } catch {} };
  const sekme = (id) => document.querySelector(`#kohud [data-id="${id}"]`)?.click();

  const K = {
    // ---- Private
    pm: async (arg) => {
      const m = /^(\S+)\s*(.*)$/.exec(arg || '');
      if (m) return state.pm?.adIle(m[1], m[2]);
      const o = secili(); if (o) return state.pm?.ac(o.id, o.meta?.name);
      sohbeteYaz('/pm ');
    },
    town: () => hud.onTown?.(),
    exit: () => hud.oyundanCik?.(),
    greeting: () => duygu('a105'), greeting2: () => duygu('a106'), greeting3: () => duygu('a107'),
    provoke: () => duygu('a108'), provoke2: () => duygu('a109'), provoke3: () => duygu('a110'),
    save: async () => {
      const p = player.position;
      await sb.from('characters').update({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +(state.yaw || 0).toFixed(3) }).eq('id', me);
      bilgi('Saving Game Data...', 'tamam');
    },
    recommend: () => { const o = secili(); if (!o) return hud.notice?.('Click on the character you want to recommend first.', 'hata'); bilgi(`You have recommended ${o.meta?.name || ''}.`, 'tamam'); },
    individual_battle: () => yok('Individual Battle'),
    'sit/stand': () => state.dinlen?.toggle?.(),
    'walk/run': () => { state.run = !state.run; hud.notice?.(state.run ? 'Run' : 'Walk'); },
    location: () => { const p = player.position; bilgi(`(Location:${Math.round(p.x)},${Math.round(p.z)})`); },
    add_friend: async (arg) => { const ad = arg || secili()?.meta?.name; if (!ad) return sohbeteYaz('/Add_Friend '); await state.arkadas?.ekle?.(ad); },
    chat_room: () => sekme('btn_chatroom'),
    macro: () => hud.panel?.('ayar'),
    chatblock: (arg) => {
      const ad = (arg || secili()?.meta?.name || '').trim(); if (!ad) return sohbeteYaz('/chatblock ');
      const k = ad.toLowerCase();
      if (state.engelli.has(k)) { state.engelli.delete(k); bilgi(`${ad}: chat block removed.`); } else { state.engelli.add(k); bilgi(`${ad}: chat blocked.`); }
      engelKaydet();
    },
    nation_chat: () => sekme('btn_shout'),
    vault: () => (state.depo?.ac ? state.depo.ac() : yok('Vault')),
    achieve: () => hud.panel?.('basarim'),
    imir: () => yok('IMIR'),
    // ---- Trade
    trade: async (arg) => {
      let o = secili(); if (arg) { const c = await oyuncuBul(arg); if (c) o = { id: c.id, meta: { name: c.name, nation: c.nation } }; }
      if (!o) return hud.notice?.('Click on the character you want to trade with first.', 'hata');
      if (state.pazar?.acik) return hud.notice?.('You cannot trade while your merchant stall is open.', 'hata');
      return state.takas?.takasIste?.(o.id, o.meta);
    },
    block_trade_request: () => { state.takasEngel = true; bilgi('Trade requests are now blocked.'); },
    allow_trade_request: () => { state.takasEngel = false; bilgi('Trade requests are now allowed.'); },
    merchant: () => (state.pazar?.acik ? state.pazar.kapat() : state.pazar?.kur?.()),
    price: () => hud.notice?.('Market Price is not available yet.', 'hata'),   // (5.11) KO H → Trade → Price (Market Price)
    edit_merchant: () => (state.pazar?.acik ? state.pazar.duzenle?.() : hud.notice?.('Your shop is not open.', 'hata')),   // (5.11) açık pazarın penceresi
    // ---- Party (KO H menüsü → Party: /Party · /Quit_party · /Seeking_Party · /Block_Party · /Allow_Party)
    party: () => {
      const s = secili() || (state.combat?.target?.oyuncu ? { id: state.combat.target.id, meta: { name: state.combat.target.t?.name } } : null);
      if (!s) return bilgi('Click on the character you want to form a party with and type /Party.');
      if (!state.parti) return bilgi('The party system is loading.');
      state.parti.davetEt(s.id, s.meta?.name);
    },
    quit_party: () => { if (!state.parti?.partide) return bilgi('You are not in a party.'); state.parti.ayril(); },
    seeking_party: () => { if (!state.partiBoard) return bilgi('The Party Board is loading.'); state.partiBoard.ac(true); return state.partiBoard.ac_kapa(); },   // (3.11) Party Board da açılır
    block_party: () => { state.partiEngel = true; try { localStorage.setItem('ko-parti-engel', '1'); } catch {} bilgi('Party requests are now blocked.'); },
    allow_party: () => { state.partiEngel = false; try { localStorage.removeItem('ko-parti-engel'); } catch {} bilgi('Party requests are now allowed.'); },
    // ---- Clan
    join_clan: async (arg) => {
      let id = secili()?.id; if (arg) id = (await oyuncuBul(arg))?.id;
      if (!id) return sohbeteYaz('/Join_Clan ');
      return state.klanApi?.davetEt?.(id);
    },
    quit_clan: () => state.klanAyril?.(),
    ban_from_clan: async (arg) => klanIslem('klan_at', arg, '/Ban_from_Clan '),
    kick: async (arg) => klanIslem('klan_at', arg, '/Kick '),
    appoint_as_assistant_clan_leader: async (arg) => klanIslem('klan_yetki', arg, '/Appoint_as_Assistant_Clan_Leader ', { p_rutbe: 2 }),
    command: () => yok('Clan command (Lunar War)'),
    clan_war: () => yok('Clan War'), surrender: () => yok('Clan War'), clan_battle: () => yok('Clan Battle'),
    clan_chat: (arg) => { if (arg) return state.klanApi?.sohbet?.(arg); sekme('btn_knights'); },
    clannotice: () => { if (!state.klan) return hud.notice?.('You are not in a clan.', 'hata'); hud.panel?.('klan'); },
    // ---- Knights (ittifak)
    confederacy: async () => {
      const o = secili(); if (!o) return hud.notice?.('Click on the leader of the Knights you wish to form confederacy with.', 'hata');
      const kad = o.meta?.klan; if (!kad) return hud.notice?.('That character is not in a clan.', 'hata');
      const { data, error } = await sb.rpc('ittifak_davet', { p_char: me, p_klan_ad: kad });
      if (error || data?.ok === false) return hud.notice?.(data?.mesaj || error?.message, 'hata'); bilgi(`An alliance request has been sent to ${kad}.`, 'tamam');
    },
    ban_knights: () => hud.panel?.('klan'),
    quit_knights: async () => {
      const k = state.klan; if (!k) return hud.notice?.('You are not in a clan.', 'hata');
      const { data, error } = await sb.rpc('ittifak_ayril', { p_char: me, p_klan: k.id });
      if (error || data?.ok === false) return hud.notice?.(data?.mesaj || error?.message, 'hata'); bilgi('You have left the alliance.', 'tamam');
    },
    report: () => yok('Report'), base: () => yok('Castle Siege War Base'), declaration: () => yok('Castle Siege War'),
    // ---- Guardian Monster
    hide: () => yok('Guardian Monster'), guard: () => yok('Guardian Monster'), defend: () => yok('Guardian Monster'), 'look out': () => yok('Guardian Monster'),
    'strategic formation': () => yok('Guardian Monster'), rest: () => yok('Guardian Monster'), destroy: () => yok('Guardian Monster'),
  };
  async function klanIslem(fn, arg, yaz, ek = {}) {
    const ad = (arg || secili()?.meta?.name || '').trim(); if (!ad) return sohbeteYaz(yaz);
    const c = await oyuncuBul(ad); if (!c) return hud.notice?.(`${ad}: character not found.`, 'hata');
    const { data, error } = await sb.rpc(fn, { p_char: me, p_hedef: c.id, ...ek });
    if (error || data?.ok === false) return hud.notice?.(data?.mesaj || error?.message, 'hata');
    bilgi(fn === 'klan_at' ? `${c.name} has been banned from the clan.` : `${c.name} has been appointed as assistant clan leader.`, 'tamam');
    state.klanApi?.yukle?.();
  }
  // King komutları (kral.js) KO adlarıyla
  const KRAL = { royalorder: 'RoyalOrder', prize: 'Price', experiencepoint: 'EXPERIENCE_POINT', droprate: 'DROP_RATE', rain: 'RAIN', snow: 'SNOW', clear: 'CLEAR' };

  /** "/Komut arg" → işlendi mi */
  async function calistir(satir) {
    const m = /^\/?\s*([^\s]+(?:\s(?:out|formation))?)\s*(.*)$/i.exec(String(satir || '').trim()); if (!m) return false;
    const ad = m[1].toLowerCase(), arg = m[2].trim();
    if (KRAL[ad]) { if (!arg && !['rain', 'snow', 'clear'].includes(ad)) { sohbeteYaz(`/${m[1]} `); return true; } return !!(await state.kral?.komut?.(`/${KRAL[ad]}${arg ? ' ' + arg : ''}`)); }
    const f = K[ad]; if (!f) return false;
    await f(arg); return true;
  }
  return { calistir, komutlar: Object.keys(K) };
}
