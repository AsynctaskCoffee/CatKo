// GM sohbet komutları
//   /tp list        → tüm haritalar (yüklü olanlar yeşil)
//   /tp <harita>    → karakteri o haritaya ışınla (yalnızca GM; sunucu gm_teleport RPC'si denetler)
//   /tp <oyuncu>    → oyuncuyu GM'in yanına ışınla (gm_cagir; oyuncuya oyun:genel kanalından 'cagir' bildirimi)
//   /npc [arama]    → NPC listesi (GM: bulunduğun konuma NPC doğur, haritadakileri düzenle)
//   /town           → bulunduğun haritanın kasabasına (başlangıç noktası) ışınlan (herkes)
//   /seviye <ad> <n> · /statu <ad> <n> · /master <ad> · /noah <ad> <n> · /np <ad> [n] · /esyadb <ad>   (GM; "./" ile de yazılabilir)
//   /dc <oyuncu>    → oyuncuyu oyundan at (GM) · /bakim ac|kapa → bakım modu (GM değilse sunucuya giremez)
//   /sure           → süreli eşya penceresi (GM)
//   /yardim         → komut listesi

let zoneCache = null;
async function zones(sb) {
  if (zoneCache) return zoneCache;
  const { data, error } = await sb.from('zones').select('id,name,aliases,available').order('sort');
  if (error) throw error;
  return (zoneCache = data || []);
}

export async function handleCommand(line, { sb, character, say, net, npcUi, gmWin, isGm, isinla, konum, hud }) {
  const [cmd, ...args] = line.slice(1).trim().split(/\s+/);
  const c = (cmd || '').toLowerCase();
  try {
    // GM sistem maili: /smail <oyuncu|*> [eşya_no adet] mesaj  (eşya hediye olarak posta kutusuna)
    if (c === 'smail' || c === 'sistemmail') {
      if (!isGm) { say('This command is GM only.', 'hata'); return; }
      const [alici, ...r] = args; if (!alici) { say('Usage: /smail <player|*> [item_no count] message', 'soluk'); return; }
      let esya = null, adet = 1;
      if (/^\d{6,}$/.test(r[0] || '')) { esya = Number(r.shift()); if (/^\d+$/.test(r[0] || '')) adet = Number(r.shift()); }
      const metin = r.join(' ');
      const { data, error } = await sb.rpc('gm_mail', { p_char: character.id, p_alici: alici, p_konu: esya ? 'Hediye' : 'Sistem mesajı', p_metin: metin || 'GM hediyesi', p_esya: esya, p_adet: adet });
      if (error) { say(error.message, 'hata'); return; }
      say(`System mail sent (${data.gonderilen} players).`, 'tamam'); return;
    }
    if (c === 'tp' || c === 'git' || c === 'teleport') {
      const arg = (args[0] || '').toLowerCase();
      if (!arg || arg === 'list' || arg === 'liste') {
        const list = await zones(sb);
        const hazir = list.filter((z) => z.available).length;
        say(`— Maps (${list.length}, loaded: ${hazir}) —`, 'baslik');
        for (const z of list) {
          const ek = z.aliases?.length ? ` [${z.aliases.join(', ')}]` : '';
          say(`${z.available ? '●' : '○'} ${z.id} — ${z.name}${ek}${z.available ? '' : ' (not loaded)'}`, z.available ? 'tamam' : 'soluk');
        }
        say('Usage: /tp <map-name>', 'soluk');
        return;
      }
      // harita adı değilse oyuncu adı: oyuncuyu GM'in yanına çağır
      const zl = await zones(sb).catch(() => []);
      const harita = zl.some((z) => z.id.toLowerCase() === arg || (z.name || '').toLowerCase() === arg || (z.aliases || []).some((a) => String(a).toLowerCase() === arg));
      if (!harita) {
        if (!isGm) { say('This command is GM only.', 'hata'); return; }
        const p = konum?.() || { x: 0, z: 0 };
        const { data: d, error: e } = await sb.rpc('gm_cagir', { p_char: character.id, p_ad: args[0], p_x: p.x + 1.5, p_z: p.z + 1.5 });
        if (e) { say(e.message, 'hata'); return; }
        net?.cagir?.({ id: d.id, zone: d.zone, x: d.x, z: d.z, gm: character.name });
        say(`${d.ad} teleported to you.`, 'tamam');
        return;
      }
      const { data, error } = await sb.rpc('gm_teleport', { p_char: character.id, p_zone: arg });
      if (error) { say(error.message, 'hata'); return; }
      say(`Teleporting to ${data.name}…`, 'tamam');
      net?.halt?.();
      const u = new URL(location.href);
      u.searchParams.delete('x'); u.searchParams.delete('z'); u.searchParams.delete('bolge');
      u.searchParams.set('karakter', character.id);
      setTimeout(() => location.replace(u.toString()), 350);
      return;
    }
    // /klan <klan adı> <1-15>: klan derecesini el ile ayarla (1-5 Knight 5→1, 6-10 Accredited 5→1, 11-15 Royal 5→1)
    if (c === 'klan' && isGm && args.length >= 2 && /^\d+$/.test(args[args.length - 1])) {
      const L = Number(args[args.length - 1]), ad = args.slice(0, -1).join(' ');
      const { data, error } = await sb.rpc('gm_klan_derece', { p_char: character.id, p_ad: ad, p_seviye: L });
      if (error) { say(error.message, 'hata'); return; }
      const v = data.seviye || {}, TUR = { mavi: 'Knight', akredite: 'Accredited Knight', royal: 'Royal Knight' }, ROMA = ['', 'I', 'II', 'III', 'IV', 'V'];
      say(`${data.ad} clan grade: ${TUR[v.tur] || v.tur} ${ROMA[v.derece] || v.derece} (${L}/15).`, 'tamam');
      // klan üyelerinin pencereleri yenilensin
      try { const k = sb.channel('klan:' + data.id); k.subscribe((st) => { if (st === 'SUBSCRIBED') { k.send({ type: 'broadcast', event: 'degisti', payload: { olay: 'derece' } }); setTimeout(() => sb.removeChannel(k), 1500); } }); } catch {}
      return;
    }
    // /np <oyuncu> [miktar]: oyuncuya ulus puanı ver (eksi miktar puan alır). Miktar yazılmazsa sorulur.
    if (c === 'np') {
      if (!isGm) { say('This command is GM only.', 'hata'); return; }
      const ad = args[0]; if (!ad) { say('Usage: /np <player name> [amount]', 'soluk'); return; }
      const ver = async (n) => {
        n = Math.round(Number(String(n).replace(/[.\s]/g, '')));
        if (!Number.isFinite(n) || n === 0) { say('Enter a valid national point amount.', 'hata'); return; }
        const { data, error } = await sb.rpc('gm_np', { p_char: character.id, p_ad: ad, p_miktar: n });
        if (error) { say(error.message, 'hata'); return; }
        const f = (x) => Number(x || 0).toLocaleString('en-US');
        say(`${n > 0 ? 'Gave' : 'Deducted'} ${f(Math.abs(n))} national points ${n > 0 ? 'to' : 'from'} ${data.ad}. Total: ${f(data.np)} (this month ${f(data.np_ay)}).`, 'tamam');
      };
      if (args[1] != null) return ver(args[1]);
      if (hud?.girdi?.('Give National Points', `National points to give to ${ad}:`, { max: 11, deger: '1000' }, (v) => ver(v)) === false) say('Usage: /np <player name> <amount>', 'soluk');
      return;
    }
    const GMK = { seviye: 'gm_seviye', level: 'gm_seviye', statu: 'gm_statu', stat: 'gm_statu', master: 'gm_master', usta: 'gm_master', noah: 'gm_noah', para: 'gm_noah', esyadb: 'gm_esyadb' };
    if (GMK[c]) {
      if (!isGm) { say('This command is GM only.', 'hata'); return; }
      const ad = args[0], n = Number(args[1]);
      const sayili = ['gm_seviye', 'gm_statu', 'gm_noah'].includes(GMK[c]);
      if (!ad || (sayili && !Number.isFinite(n))) { say(`Usage: /${c} <player name>${sayili ? ' <amount>' : ''}`, 'soluk'); return; }
      const arg = { p_char: character.id, p_ad: ad };
      if (GMK[c] === 'gm_seviye') arg.p_seviye = Math.round(n);
      if (GMK[c] === 'gm_statu') arg.p_miktar = Math.round(n);
      if (GMK[c] === 'gm_noah') arg.p_miktar = Math.round(n);
      const { data, error } = await sb.rpc(GMK[c], arg);
      if (error) { say(error.message, 'hata'); return; }
      const m = { gm_seviye: `${data.ad} is now level ${data.seviye}.`, gm_statu: `${data.ad} free stat points: ${data.puan}.`,
        gm_master: `${data.ad}: master skills ${data.usta ? 'enabled' : 'disabled'}.`, gm_noah: `${data.ad} Noah: ${Number(data.gold).toLocaleString('en-US')}.`,
        gm_esyadb: `Item database opened for ${data.ad} (30 min).` }[GMK[c]];
      say(m, 'tamam');
      return;
    }
    // /dc <oyuncu>: oyuncuyu oyundan at (sunucu oturumunu işaretler; istemci bir sonraki yoklamada ya da hemen kapanır)
    // GM /mobkill all: bulunduğun haritadaki tüm canlı mobları öldürür (EXP / drop yok, doğurucu süresiyle yeniden doğar)
    // GM /dayaniklilik <yüzde>: elindeki silahın dayanıklılığını en yüksek değerin yüzdesi kadar düşürür (üst üste 25 → 50 → 75); çatlaklar modelde görünür
    if (c === 'dayaniklilik' || c === 'dayanıklılık' || c === 'dur') {
      if (!isGm) { say('This command is GM only.', 'hata'); return; }
      const y = Math.round(Number(String(args[0] ?? '25').replace('%', '')));
      if (!Number.isFinite(y) || y < 1 || y > 100) { say('Usage: /dayaniklilik <percent 1-100>', 'soluk'); return; }
      const { data, error } = await sb.rpc('gm_dayaniklilik', { p_char: character.id, p_yuzde: y });
      if (error) { say(error.message, 'hata'); return; }
      if (!data?.ok) { say(data?.mesaj || 'Action failed.', 'hata'); return; }
      say(`${data.ad}: durability ${data.durability} / ${data.max} (${data.yuzde}%).`, 'tamam');
      try { const st = window.__ko?.state; st?.inv?.dayanikYaz?.(data.slot, data.durability); await st?.inv?.reload?.(); } catch {}
      return;
    }
    if (c === 'mobkill') {
      if (!isGm) { say('This command is GM only.', 'hata'); return; }
      if ((args[0] || '').toLowerCase() !== 'all') { say('Usage: /mobkill all', 'soluk'); return; }
      const { data, error } = await sb.rpc('gm_mobkill', { p_char: character.id, p_kapsam: 'all' });
      if (error) { say(error.message, 'hata'); return; }
      say(`${data.adet} mobs killed (${data.zone}). They will respawn when their spawn timers expire.`, 'tamam'); return;
    }
    if (c === 'dc' || c === 'at' || c === 'kick') {
      if (!isGm) { say('This command is GM only.', 'hata'); return; }
      if (!args[0]) { say('Usage: /dc <player name>', 'soluk'); return; }
      const { data, error } = await sb.rpc('gm_dc', { p_char: character.id, p_ad: args[0] });
      if (error) { say(error.message, 'hata'); return; }
      net?.kontrol?.(data.id);
      say(data.oyunda ? `${data.ad} was disconnected.` : `${data.ad} is not online right now.`, data.oyunda ? 'tamam' : 'soluk');
      return;
    }
    // /bakim ac | kapa: bakım modu — açıkken GM olmayan oyuncular sunucuya giremez
    // GM /sure: süreli eşya penceresi
    if (c === 'sure' || c === 'süre') {
      if (!isGm) { say('This command is GM only.', 'hata'); return; }
      const { sureAc } = await import('./gm-sure.js'); sureAc({ sb, character, say });
      say('Timed item window opened: drag an item from your bag into the slot, enter the duration, then OK.', 'soluk'); return;
    }
    if (c === 'bakim' || c === 'bakım') {
      if (!isGm) { say('This command is GM only.', 'hata'); return; }
      const a = (args[0] || '').toLowerCase();
      if (!a) { const { data } = await sb.rpc('bakim_durum'); say(`Maintenance mode: ${data ? 'ON' : 'off'}. Usage: /bakim ac | kapa`, 'soluk'); return; }
      const ac = ['ac', 'aç', 'on', 'acik', 'açık', '1'].includes(a), kapa = ['kapa', 'kapat', 'off', 'kapali', 'kapalı', '0'].includes(a);
      if (!ac && !kapa) { say('Usage: /bakim ac | kapa', 'soluk'); return; }
      const { error } = await sb.rpc('gm_bakim', { p_char: character.id, p_ac: ac });
      if (error) { say(error.message, 'hata'); return; }
      say(ac ? 'Maintenance mode ON: non-GM players cannot enter the server.' : 'Maintenance mode off: players can enter the server.', 'tamam');
      return;
    }
    if (c === 'town' || c === 'kasaba') {
      const { data, error } = await sb.rpc('town', { p_char: character.id });
      if (error) { say(error.message, 'hata'); return; }
      if (!data?.ok) { say(data?.reason || 'Could not teleport.', 'hata'); return; }
      try { window.__ko?.state?.genie?.durdur?.('Kasabaya döndün, Genie durduruldu.'); } catch {}   // town: çalışan Genie durur
      if (data.bolge_degisti) { say('Returning from the arena to Moradon…', 'tamam'); const u = new URL(location.href); for (const k of ['x', 'z', 'bolge']) u.searchParams.delete(k); u.searchParams.set('karakter', character.id); setTimeout(() => location.replace(u.toString()), 600); return; }
      isinla?.(Number(data.x), Number(data.z)); dispatchEvent(new CustomEvent('ko-isinlandi'));
      say('Teleported to town.', 'tamam');
      return;
    }
    if (c === 'npc' || c === 'npcs') {
      if (!npcUi) { say('NPCs are not loaded yet.', 'hata'); return; }
      if (!isGm) say('NPC list opened (spawning/editing is GM only).', 'soluk');
      await npcUi.openCatalog(args.join(' '));
      return;
    }
    if (c === 'panel' || c === 'gmpanel' || c === 'kule' || c === 'kuleler') {
      if (!gmWin) { say('The GM panel is GM only.', 'hata'); return; }
      gmWin.open(c.startsWith('kule') ? 'kule' : 'konum', args[0] ?? null);
      return;
    }
    if (c === 'duyuru' || c === 'notice') {
      const text = line.slice(1).trim().slice(cmd.length).trim();
      if (!text) { say('Usage: /duyuru <message>', 'soluk'); return; }
      const { error } = await sb.rpc('gm_announce', { p_char: character.id, p_text: text });
      if (error) say(error.message, 'hata');
      return;
    }
    if (c === 'yardim' || c === 'help' || c === '?' || c === 'gm') {
      say('GM: /seviye <name> <n> · /statu <name> <n> · /master <name> · /noah <name> <n> · /np <name> [n] · /klan <clan> <1-15> · /esyadb <name> · /dc <name> · /mobkill all · /dayaniklilik <percent> · /bakim ac|kapa', 'soluk');
      say('Commands: /town · /tp list · /tp <map> · /tp <player> (GM: summon to you) · /duyuru <message> · /npc [search] · /panel · /kule [id] (GM)', 'soluk');
      say('GM: right-click an NPC → edit window (rotate, move, delete, copy)', 'soluk');
      say('GM: can walk through buildings · V key boosts speed by 200% (toggle)', 'soluk');
      return;
    }
    say(`Unknown command: /${cmd}`, 'hata');
  } catch (e) {
    say('Command error: ' + (e.message || e), 'hata');
  }
}
