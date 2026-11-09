// NPC etkileşimi: sol tık → seç, sağ tık → NPC menüsü (Konuş / Bilgi). GM'ler sağ tıkta ayrıca düzenleme penceresi
// açar (döndür, taşı, sil, kopyala). /npc → tüm NPC kataloğu; GM seçtiği NPC'yi bulunduğu konuma doğurur.
// Tüm değişiklikler sunucuda GM denetimli RPC'lerle yapılır (gm_npc_update / gm_npc_delete / gm_npc_spawn).
import * as THREE from '../vendor/three.module.min.js';
import { koWindow, toFront } from './ko-pencere.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const deg = (r) => ((Math.round(r * 180 / Math.PI) % 360) + 360) % 360;
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

function greeting(name) {
  const role = (/^\[([^\]]+)\]/.exec(name)?.[1] || '').toLowerCase();
  if (/merchant|sundries|potion|portion|accessory|scroll|peddler|trader|vendor|rental/.test(role)) return 'Welcome, traveler! My shop will be open very soon.';
  if (/guard|sentinel|captain|officer|mercenary/.test(role) || /guard/i.test(name)) return 'Moradon is safe, traveler. We keep watch everywhere.';
  if (/priest|healing/.test(role)) return 'May the light be with you, traveler.';
  if (/inn/.test(role)) return 'The inn is always open if you wish to rest.';
  if (/scarecrow|box|board|statue|generator/i.test(name)) return null;
  return 'Hello, traveler. How may I help you?';
}

let TIP = null, TIC = null;
fetch('./assets/npc-tip.json').then((r) => r.json()).then((d) => (TIP = d)).catch(() => {});

const KATE_NPC = new Set([13016, 13017, 13018]);
export function initNpcUi({ npcs, state, player, camera, canvas, sb, character, zone, hud, say, bubble }) {
  const isGm = () => !!state.ghost;
  const OZEL = new Map();
  const ozelYukle = () => sb?.from('npc_ozel').select('id,tip,selam').eq('aktif', true).then(({ data }) => { OZEL.clear(); for (const o of data || []) OZEL.set(o.id, o); }, () => {});
  ozelYukle(); addEventListener('ko-npc-ozel', ozelYukle);
  const layer = document.body;
  let menu = null, editor = null, catalog = null, pendingTalk = null, menuNpc = null;

  // ---------- yardımcılar
  const dist = (e) => Math.hypot(e.holder.position.x - player.position.x, e.holder.position.z - player.position.z);
  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args });
    if (error) { say?.(error.message, 'hata'); hud.notice?.(error.message, 'hata'); throw error; }
    return data;
  };
  const rowToN = (r) => ({ pid: r.id, id: r.npc_id, m: r.model, n: r.name, x: r.x, z: r.z, d: r.dir || 0, s: r.size || 100, e: r.etiket || '', ec: r.etiket_renk || '' });
  const canEdit = (e) => isGm() && npcs.editable && e?.n.pid != null && sb && character;

  // KO: menüsü açılan NPC oyuncuya döner; menü kapanınca eski yönüne döner
  let bakan = null, ticApi = null;
  const npcPenceresiAcik = () => !!document.querySelector('.ko-npcmenu:not([hidden]), #usta-gerek:not([hidden]), .ko-pazar-pano:not([hidden])') || !!ticApi?.acik;
  const aci = (a) => { a %= Math.PI * 2; return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a; };
  function bakisGuncelle(dt) {
    if (!bakan) return;
    if (!ticApi && TIC) TIC.then((t) => { ticApi = t; });
    const e = bakan, h = e.holder; if (!h?.parent) { bakan = null; return; }
    const acik = performance.now() - e._bakT < 1200 || (npcPenceresiAcik() && dist(e) < 12);
    const hedef = acik ? Math.atan2(player.position.x - h.position.x, player.position.z - h.position.z) : e._eskiYon;
    const fark = aci(hedef - h.rotation.y);
    h.rotation.y += fark * Math.min(1, dt * 8);
    if (!acik && Math.abs(fark) < 0.01) { h.rotation.y = e._eskiYon; bakan = null; }
  }
  const DONMEZ = new Set([603, 20004, 20005]);   // nesne NPC'ler (Chaotic Generator, Bulletin Board): tıklanınca oyuncuya dönmez
  function talk(e) {
    if (bakan && bakan !== e) bakan.holder.rotation.y = bakan._eskiYon;
    if (DONMEZ.has(Number(e.n.id))) bakan = null;
    else { if (bakan !== e) e._eskiYon = e.holder.rotation.y; e._bakT = performance.now(); bakan = e; }
    TIC?.then((t) => { ticApi = t; });
    // Kaishan (18004): KO NPC menüsü — yetenek açma
    if (Number(e.n.id) === 18004 && sb && character) {
      import('./npc-menu.js').then(({ kaishanMenu }) => kaishanMenu({ sb, character, hud, state, model: e.n.m,
        onSinif: () => { import('./yetenek.js').then((Y) => Y.yenileBilgi()); state.inv?.stats?.(); } })()).catch((err) => console.warn('npc menüsü', err));
      menuNpc = e;
      return;
    }
    // KO 2. meslek (usta) NPC'leri: 60. seviye + Heart + 2 Captain özü
    if ([14201, 14202, 14203, 14204, 24201, 24202, 24203, 24204, 25017, 25003].includes(Number(e.n.id)) && sb && character) {
      import('./npc-menu.js').then(({ ustaMenu }) => ustaMenu({ sb, character, hud, state, npc: Number(e.n.id), ad: e.n.n, model: e.n.m,
        onSinif: () => { import('./yetenek.js').then((Y) => Y.yenileBilgi()); state.inv?.stats?.(); } })()).catch((err) => console.warn('usta menüsü', err));
      menuNpc = e;
      return;
    }
    // Chaotic Generator (603, Moradon): KO BifrostPieceProcess — gem ya da 7 günah parçası koy, ağırlıklı rastgele eşya (sunucu chaotic_uret)
    if (Number(e.n.id) === 603 && sb && character) {
      const KAYNAK = [[389205000, 'Black Gem'], [389201000, 'Green Gem'], [389199000, 'Blue Gem'], [389198000, 'Yellow Gem'], [389197000, 'Red Gem'], [389196000, 'Silvery Gem'],
        [389160000, 'Fragment of Arrogance'], [389162000, 'Fragment of Rage'], [389163000, 'Fragment of Sloth'], [389164000, 'Fragment of Lechery'], [389165000, 'Fragment of Jealousy'], [389166000, 'Fragment of Avarice']];
      const adetOf = (num) => { let n = 0; for (const [sl, x] of state.inv?.items || []) if (sl >= 14 && Number(x?.row?.item_num) === num) n += Number(x.row.count) || 1; return n; };
      const DERECE = { 1: '', 2: ' (rare)', 3: ' (unique)' };
      const genMenu = async (ek = '') => {
        const { npcMenuAc } = await import('./npc-menu.js');
        const var_ = KAYNAK.filter(([num]) => adetOf(num) > 0);
        const sec = [{ ad: 'Use the Chaotic Generator.', kalsin: true, fn: () => pencere() }];
        sec.push({ ad: 'Leave.', fn: () => {} });
        npcMenuAc({ ad: e.n.n, model: e.n.m, secenekler: sec,
          metin: (ek ? ek + '\n\n' : '') + (var_.length ? 'Place a gem or a fragment of sin into the Chaotic Generator and a random item will come out in return.' : 'You have no gem (Black, Green, Blue, Yellow, Red, Silvery) or fragment of sin (Arrogance, Rage, Sloth, Lechery, Jealousy, Avarice) that can be placed into the Chaotic Generator.') });
      };
      const uret = async (num, ad) => {
        try { const p = player.position; await sb.from('characters').update({ x: p.x, y: p.y, z: p.z }).eq('id', character.id); } catch {}
        const { data: r, error } = await sb.rpc('chaotic_uret', { p_char: character.id, p_kaynak: num }).then((x) => x, (er) => ({ error: er }));
        if (error || !r?.ok) { const m = r?.mesaj || error?.message || 'Production failed.'; hud.notice?.(m, 'hata'); return genMenu(m); }
        await state.inv?.reload?.();
        state.efekt?.(10101, e.holder.position);   // KO üretim / başarı efekti
        hud.info?.(`Chaotic Generator: ${ad} → ${r.ad}${DERECE[r.derece] || ''}`, 'seviye');
        genMenu(`You received ${r.ad}${DERECE[r.derece] || ''} for your ${ad}!`);
      };
      // KO: tıklayınca doğrudan Chaotic Generator penceresi (re_piecechange) açılır; "Chat" konuşma menüsüne döner
      const pencere = async () => {
        const { npcMenuKapat } = await import('./npc-menu.js'); npcMenuKapat();
        const C = await import('./chaotic.js');
        state.chaotic ||= C.initChaotic({ sb, character, hud, state, player });
        if (!(await state.chaotic.ac(e, { chat: () => genMenu() }))) genMenu();
      };
      void uret; pencere(); menuNpc = e; return;
    }
    // Moradon ulus panoları (Bulletin Board): KO sıralama tablosu (ulus puanı, klanlar, krallar)
    if ([20004, 20005].includes(Number(e.n.id)) && sb) { import('./pano.js').then(({ panoAc }) => panoAc({ sb, character, ulus: Number(e.n.id) === 20004 ? 1 : 2 })); menuNpc = e; return; }
    // (7.11) [Cape Merchant] Habice (26031): KO menüsü birebir — "What do you want to trade?" · Cape · Register Knights Symbol · Walk away
    if (Number(e.n.id) === 26031) {
      const klanli = () => !!state?.klanApi?.bilgi?.klan;
      const git2 = (olay) => { if (!klanli()) return hud.notice?.('Not a clan member.', 'hata'); document.dispatchEvent(new CustomEvent(olay)); };
      import('./klan-ko.js').then((K) => K.pelerinciKO({ ulus: character?.nation, model: e.n.m, onCape: () => git2('ko-klan-pelerin'), onSymbol: () => git2('ko-klan-sembol') })).then((ok) => { if (ok) return;
      import('./npc-menu.js').then(({ npcMenuAc, npcMenuKapat }) => {
        const git = (olay) => () => { if (!klanli()) { npcMenuKapat(); return hud.notice?.('Not a clan member.', 'hata'); } document.dispatchEvent(new CustomEvent(olay)); };
        npcMenuAc({ ad: e.n.n, model: e.n.m, metin: 'What do you want to trade?', secenekler: [
          { ad: 'Cape', fn: git('ko-klan-pelerin') },
          { ad: 'Register Knights Symbol', fn: git('ko-klan-sembol') },
          { ad: 'Walk away', fn: () => npcMenuKapat() },
        ] });
      }); });
      menuNpc = e; return;
    }
    // [Knight Clerk] Delaga / Charel: KO klan işlemleri (kur, onay, ayrıl, dağıt)
    if ([11610, 21610, 29029, 29030].includes(Number(e.n.id)) && state?.klanApi) { state.klanApi.clerkMenu({ ad: e.n.n, model: e.n.m }); menuNpc = e; return; }
    // [Disciple of Hepa] Shozin (19073, Moradon): KO menüsü birebir — portresiz pencere, "Well...  What can I do for you?"
    // Chatting (KO NPC_Shout satırları), Asking for manufacturing, Buying a pickaxe (Pitman ile aynı: pitman_kazma), Manufacturing, Check Manufacturing recipe
    if (Number(e.n.id) === 19073 && sb && character) {
      const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); return null; } return data; };
      const ac = async (o) => { const { npcMenuAc } = await import('./npc-menu.js'); npcMenuAc({ ad: e.n.n, model: e.n.m, portresiz: true, ...o }); };
      import('./uretim-kitap.js').then((m) => m.onYukle?.({ sb, character, hud, state })).catch(() => {});   // Item Combination / kitap arayüzü önceden yüklenir (anında açılsın)
      const geri = { ad: 'Previous Page', kalsin: true, fn: () => shozin() };
      // KO metinleri (Shozin'in konuşmaları)
      const SOHBET = "Hi! Eh? You don't know me? I'm Shojin, one of the heroes of the Adonisian Continent's past. Hahaha~you recognize me, now? That's okay. I can put up with that rudeness. Why am I here? Um~I would like to revive the Hero Weapon, so I have been learning blacksmith skills from Heppa. But that's not everything. I want to combine blacksmith skill with the alchemy that I learned from an alchemist in my heroic days. I could make weapons and armors that nobody has ever seen. Come and see me if you are interested in production.";
      const URETIM = "Um~Production literally means combining many items. It's a type of alchemy! Well, I have repeatedly failed as my EXP is not high enough. But the weapons and armors made out of it have incredible abilities.  Are you interested? I can try if you want, but as I told you just before, there's a possibility of failure. Just get the materials.";
      const shozin = (metin = 'Well...  What can I do for you?') => ac({ metin, secenekler: [
        { ad: 'Chatting', kalsin: true, fn: () => ac({ metin: SOHBET, uzat: 132, secenekler: [geri] }) },
        { ad: 'Asking for manufacturing', kalsin: true, fn: () => ac({ metin: URETIM, uzat: 132, secenekler: [geri] }) },
        { ad: 'Buying a pickaxe', kalsin: true, fn: () => ac({ metin: 'Hey hey~To make the Mattock, I need 100 CONT and 1 million Noah  are needed.', uzat: 158, secenekler: [
          { ad: 'Buying', kalsin: true, fn: async () => {
            const d = await rpc('shozin_kazma'); if (!d) return;
            if (!d.ok) return ac({ metin: d.mesaj, uzat: 158, secenekler: [geri] });
            state.combat?.odulUygula?.({ gold: d.gold }); state.inv?.reload?.(); hud.info?.("You've received a Mattock (1,000,000 Noah, 100 CONT).", 'esya');
            ac({ metin: d.mesaj, uzat: 158, secenekler: [geri] });
          } },
          { ad: "Don't buy", kalsin: true, fn: () => shozin() },
        ] }) },
        { ad: 'Manufacturing', kalsin: true, fn: () => ac({ metin: "Are you going to start production? Finally! Let's do it~", uzat: 158, secenekler: [
          { ad: 'Yes, please show me your power', fn: () => import('./uretim-kitap.js').then(({ uretimKitabi }) => uretimKitabi({ sb, character, hud, state, uretim: true })).catch(() => {}) },
          { ad: 'No, I will come back later', fn: () => {} },
        ] }) },
        { ad: 'Check Manufacturing recipe', fn: () => import('./uretim-kitap.js').then(({ uretimKitabi }) => uretimKitabi({ sb, character, hud, state })).catch(() => {}) },
      ] });
      shozin(); menuNpc = e; return;
    }
    // [Pitman] (31511): KO madencilik NPC'si — kazma, Mysterious Ore takası
    if (Number(e.n.id) === 31511 && sb && character) { import('./npc-hizmet.js').then(({ pitmanMenu }) => pitmanMenu({ sb, character, hud, state, ad: e.n.n, model: e.n.m })); menuNpc = e; return; }
    // klan görev arenası ışınlayıcısı (npcs.js sanal NPC 900201): Moradon'a ya da kendi ulusunun kalesine
    if (Number(e.n.id) === 900201 && sb && character) {
      const git = async (hedef) => {
        const { data, error } = await sb.rpc('klanq_cikis', { p_char: character.id, p_hedef: hedef }).then((r) => r, (er) => ({ error: er }));
        if (error || !data?.ok) { hud.notice?.(data?.mesaj || error?.message || 'Teleport failed.', 'hata'); return; }
        hud.notice?.(`Teleporting to ${data.ad}…`, 'seviye');
        state.net?.halt?.(); const u = new URL(location.href); for (const k of ['x', 'z', 'bolge']) u.searchParams.delete(k); u.searchParams.set('karakter', character.id); setTimeout(() => location.replace(u.toString()), 600);
      };
      const kale = Number(character.nation) === 2 ? 'El Morad Castle' : 'Luferson Castle';
      import('./npc-menu.js').then(({ npcMenuAc }) => npcMenuAc({ ad: e.n.n, model: e.n.m, metin: 'If you have finished your mission, I can take you out of here. Where would you like to go?', secenekler: [
        { ad: 'Return to Moradon.', fn: () => git('moradon') },
        { ad: `Return to my nation (${kale}).`, fn: () => git('ulus') },
        { ad: 'Leave.', fn: () => {} },
      ] }));
      menuNpc = e; return;
    }
    // Monster Stone ulus kapıları (npcs.js sanal 900206 El Morad / 900207 Karus): yalnız kendi ulusunun kapısı → onay → Moradon
    if ((Number(e.n.id) === 900206 || Number(e.n.id) === 900207) && sb && character) {
      const ulus = Number(e.n.id) === 900206 ? 2 : 1;
      if (Number(character.nation) !== ulus && !state.ghost) { hud.notice?.(`Only ${ulus === 2 ? 'El Morad' : 'Karus'} players can use this gate.`, 'hata'); return; }
      const sor = hud.soru?.('Gate', 'Do you want to leave the Monster Stone and teleport to Moradon?', () => state.ms?.cik?.());
      if (sor === false) state.ms?.cik?.();   // onay kutusu yoksa doğrudan
      return;
    }
    // KO Item Rental: Helard / Sodern / Soren — sınıfa ve seviyeye göre 5 günlük kiralık eşya
    if ([14401, 14402, 14403, 32574, 32575].includes(Number(e.n.id)) && sb && character) {
      const npc = { id: Number(e.n.id), ad: e.n.n };
      import('./npc-menu.js').then(({ npcMenuAc }) => npcMenuAc({ ad: e.n.n, model: e.n.m, metin: `${character.name}, if your equipment is lacking, I can rent you items for 5 days. Would you like to see the items suited to your class and level?`, secenekler: [
        { ad: 'Rent items.', fn: () => import('./kiralama.js').then(({ kiralamaAc }) => kiralamaAc({ sb, character, hud, state: { ...state, player }, npc })) },
        { ad: 'Leave.', fn: () => {} },
      ] }));
      menuNpc = e; return;
    }
    // (6.11) KO [White Shadow Captain] Osiris (31526): ana menü + alt pencereler birebir (osiris.js, Quest_Talk 9264…)
    if (Number(e.n.id) === 31526 && sb && character) { import('./osiris.js').then(({ osirisMenu }) => osirisMenu({ sb, character, hud, state, ad: e.n.n, model: e.n.m })); menuNpc = e; return; }
    // (5.11) KO [Arena Manager] Dualer (19006): Quest_Talk 8062 + iki bilgi seçeneği (Quest_Menu 4473 / 4474 → Talk 8063 / 8064); arenaya giriş Artes'ten
    if (Number(e.n.id) === 19006) {
      const ana = () => import('./npc-menu.js').then(({ npcMenuAc }) => npcMenuAc({ ad: e.n.n, model: e.n.m, enAz: 2, metin: "I'm Dueller, I manage the Clan Stadium. If you have any questions, just ask me, any time.", secenekler: [
        { ad: 'What is the Personal Clan Stadium?', kalsin: true, fn: () => cevap("As soon as you enter this place, it's a total free-for-all. No allies, just enemies all around.  Can you handle that?") },
        { ad: 'What is the Party Clan Stadium?', kalsin: true, fn: () => cevap('This is a place where you can fight your allies with enemies in your party! Speaking of parties, teamwork will keep you alive out there. Think about it.') },
      ] }));
      const cevap = (metin) => import('./npc-menu.js').then(({ npcMenuAc }) => npcMenuAc({ ad: e.n.n, model: e.n.m, enAz: 1, metin, secenekler: [{ ad: 'Confirm', fn: () => {} }] }));   // KO: Confirm pencereyi kapatır
      ana(); menuNpc = e; return;
    }
    // KO arena: [Coliseum] Artes (15002) → Battle Arena (zone 48), Judge (13010) → Moradon
    if ([15002, 13010].includes(Number(e.n.id)) && sb && character) {
      const cik = Number(e.n.id) === 13010;
      const git = async () => {
        try { const p = player.position; await sb.from('characters').update({ x: p.x, y: p.y, z: p.z }).eq('id', character.id); } catch {}
        const { data, error } = await (cik ? sb.rpc('arena_cik', { p_char: character.id }) : sb.rpc('arena_gir', { p_char: character.id, p_npc: Number(e.n.id) })).then((r) => r, (er) => ({ error: er }));
        if (error || !data?.ok) { hud.notice?.(data?.mesaj || error?.message || 'Teleport failed.', 'hata'); return; }
        hud.notice?.(`Teleporting to ${data.ad}…`, 'seviye');
        state.net?.halt?.(); const u = new URL(location.href); for (const k of ['x', 'z', 'bolge']) u.searchParams.delete(k); u.searchParams.set('karakter', character.id); setTimeout(() => location.replace(u.toString()), 600);
      };
      const metin = cik ? 'Do you want to leave the arena? I can send you back to Moradon.'
        : 'Test your strength against other warriors in the arena! Outside the safe zone in the middle of the arena, anyone can attack anyone regardless of nation. You will not lose experience if you die in the arena.';
      import('./npc-menu.js').then(({ npcMenuAc }) => npcMenuAc({ ad: e.n.n, model: e.n.m, metin, secenekler: [
        { ad: cik ? 'Return to Moradon.' : 'Enter the arena.', fn: git },
        { ad: 'Leave.', fn: () => {} },
      ] }));
      menuNpc = e; return;
    }
    // [Spirit of Logos]: dört güçlendirmeden biri (logos.js)
    if (/^\[Spirit of Logos\]$/.test(String(e.n.n || '').trim()) && sb && character) { import('./logos.js').then(({ logosMenu }) => logosMenu({ sb, character, hud, state, e, player })); menuNpc = e; return; }
    // [National Enchanter] (31508 Moradon, 31507 El Morad köyleri Asga/Laiba…, 31505 Karus köyleri): KO ücretli NPC güçlendirmesi
    if ([31505, 31507, 31508].includes(Number(e.n.id)) && sb && character) { import('./npc-hizmet.js').then(({ enchanterMenu }) => enchanterMenu({ sb, character, hud, state, ad: e.n.n, model: e.n.m })); menuNpc = e; return; }
    // KO [Vendor] Hemes (Quest_Talk 4131): Power-Up Store eşyaları — 7 seçenek (KnightOnlineEn)
    if (Number(e.n.id) === 16085) {
      const yok = (es) => () => import('./npc-menu.js').then(({ npcMenuAc }) => npcMenuAc({ ad: e.n.n, model: e.n.m, metin: `You don't have a [${es}]. You can purchase it from Power Up Store (PUS).`, secenekler: [{ ad: 'Confirm', fn: () => {} }] }));
      import('./npc-menu.js').then(({ npcMenuAc }) => npcMenuAc({ ad: e.n.n, model: e.n.m, metin: 'I handle items purchased from the [Power-Up Store]. Which items will you use?', secenekler: [
        { ad: 'Premium Potions', kalsin: true, fn: yok('Premium Potion') },
        { ad: 'Change ID', kalsin: true, fn: yok('Change ID Scroll') },
        { ad: 'Skill/EXP Redistribution', kalsin: true, fn: yok('Redistribution Item') },
        { ad: 'Guidebook event', kalsin: true, fn: yok('Guidebook') },
        { ad: 'Captain premium', kalsin: true, fn: yok('Captain Premium Voucher') },
        { ad: 'Change clan name', kalsin: true, fn: yok('Clan Name Change Scroll') },
        { ad: 'Skill/EXP Redistribution (mid-grade)', kalsin: true, fn: yok('Redistribution Item (mid-grade)') },
        // (4.11) KO 16085_Hamus.lua: Valkyrie / Gryphon / Bahamut / Yeniçeri / Pathos sertifikası → seçilen özellikli kostüm (eskiden bu menü erken döndüğü için hiç görünmüyordu)
        ...(sb && character ? [{ ad: 'Costume certificate exchange', kalsin: true, fn: () => import('./npc-hizmet.js').then(({ sertifikaMenu }) => sertifikaMenu({ sb, character, hud, state, ad: e.n.n, model: e.n.m })) }] : []),
      ] }));
      menuNpc = e; return;
    }
    // KO: [Trainer] Kate (pet) · [Vendor] Kaira / [Vendor] Iruta
    if (state?.pet?.npcVarMi?.(e.n.id) && sb) {
      const npc = { id: Number(e.n.id), ad: e.n.n };
      const ticaret = () => (TIC ||= import('./ticaret.js').then((m) => m.initTicaret({ sb, character, hud, state, isGm, konum: () => player.position }))).then((t) => t.ticaret(npc));
      // KO: [Familiar Tamer] Kate — "Pet" görevi (78) bitmemişse önce görev daveti; Yes → görev penceresi (Collect / Reward · Accepted / Rejected)
      if (KATE_NPC.has(npc.id) && state.gorev?.durum && state.gorev.durum(78) !== 2) {
        import('./npc-menu.js').then(({ npcMenuAc, npcMenuKapat }) => npcMenuAc({ ad: '[Familiar Tamer] Kate', model: e.n.m,
          metin: 'Familiars, devoid of evil, are surfacing all over the continent. Are you ready to domesticate them?',
          secenekler: [{ ad: 'Yes', fn: () => { npcMenuKapat(); state.gorev.goster(78, 'npc'); } }, { ad: 'No', fn: () => {} }] }));
        menuNpc = e; return;
      }
      state.pet.npcMenu({ npc: npc.id, ad: e.n.n, model: e.n.m, ticaret }); menuNpc = e; return;
    }
    // KO krallık: [Election Official] Roben (seçim) · [Grand Chamberlain] Laisa / Rina (hazine, vergi)
    if ([14404, 24404].includes(Number(e.n.id)) && state?.kral) { state.kral.roben(); menuNpc = e; return; }
    if ([14405, 24405].includes(Number(e.n.id)) && state?.kral) { state.kral.lisa({ ad: e.n.n, model: e.n.m }); menuNpc = e; return; }
    const name = e.n.n.replace(/^\[[^\]]+\]\s*/, '') || e.n.n;
    const oz = OZEL.get(Number(e.n.id));   // GM'in oluşturduğu özel NPC: görevi (tüccar/depocu/rahip/demirci) ve selamı
    const [tip, grup] = oz ? [oz.tip || 0, 0] : TIP?.[e.n.id] || [0, 0];
    const rol = (/^\[([^\]]+)\]/.exec(e.n.n)?.[1] || '').toLowerCase();
    const tuccar = grup > 0 || [21, 22, 78].includes(tip) || /merchant|sundries|potion|portion|accessory|scroll|peddler|trader|vendor|rental|armor|weapon/.test(rol) && !/grand|entrep/.test(rol);   // [Entrep Trader] Berret: yalnız görev listesi
    const depocu = tip === 31 || /inn/.test(rol), rahip = tip === 49 || /priest|healing/.test(rol) && !tuccar, demirci = tip === 77 || /blacksmith/.test(rol);
    let g = oz?.selam || greeting(e.n.n);
    if (tuccar) g = /weapon/.test(rol) || String(grup).startsWith('201') ? 'The only thing that will protect you is the weapon in your hand. What would you like to buy?'
      : /armor/.test(rol) || String(grup).startsWith('202') ? 'Armor protects you from your enemies. Take a look at my wares.'
      : /potion|portion|healing/.test(rol) || grup === 253000 ? 'You will need potions to survive in battle.'
      : /accessory/.test(rol) ? 'Jeweled accessories bring out your hidden abilities.'
      : /rental/.test(rol) ? 'I am in charge of rental items. What kind of deal would you like?'
      : 'These items are the beginning of a strategic victory. Please, have a look.';
    if (depocu) g = "Your day should begin and end at our inn\n don't you think?";
    if (demirci) g = 'You want a stronger weapon? It must be forged. The price is high and there is no guarantee.';
    if (rahip) g = 'May the light be with you, traveler. I can pray for your wounds.';
    if (oz?.selam) g = oz.selam;
    if (!g && !isGm()) { say?.(`You cannot talk to ${name}.`, 'soluk'); return; }
    g ||= `${name}`;
    // KO: konuşulabilen her NPC'de NPC menüsü (re_npcmenu) açılır; türüne göre satırlar
    const npc = { id: Number(e.n.id), ad: e.n.n };
    const T = () => (TIC ||= import('./ticaret.js').then((m) => m.initTicaret({ sb, character, hud, state, isGm, konum: () => player.position })));
    const hizmet = (fn) => () => { T().then((t) => t[fn](npc)).catch((err) => { console.warn('npc hizmeti', err); hud.notice?.('The window could not be opened.', 'hata'); }); };
    const secenekler = [];
    // GM'in Beta NPC'si: BETA MARKET (npc_shop 900001) — sertifikalar, Pathos paketi, ejder kanadı kuponu, peri / Magic Bag kuponları, premium iksir, 30'luk scrollar
    if (npc.id === 900001) {
      const seviye = () => Number(state.combat?.stats?.level ?? character?.level) || 0;
      const tezgah = (id, ad) => () => seviye() < 59 ? (hud.notice?.(`You must be at least level 59 to use the ${ad} section.`, 'hata'), import('./npc-menu.js').then(({ npcMenuMetin }) => npcMenuMetin?.(`The ${ad} section is open to players of level 59 and above.`)).catch(() => {})) : T().then((t) => t.ticaret({ id, ad: `${e.n.n} — ${ad}` })).catch((err) => { console.warn('npc hizmeti', err); hud.notice?.('The window could not be opened.', 'hata'); });
      secenekler.push({ ad: 'BETA MARKET', fn: hizmet('ticaret') },
        { ad: 'ARMORS', fn: tezgah(900011, 'Armors') },
        { ad: 'WEAPONS', fn: tezgah(900012, 'Weapons') },
        { ad: 'ACCESSORIES', fn: tezgah(900013, 'Accessories') });
    }
    if (tuccar && npc.id !== 16085) secenekler.push({ ad: 'I want to trade.', fn: hizmet('ticaret') });   // [Peddler] Hemes: ticaret yok (yalnız sertifika / Item Exchange)
    if (tuccar && (/weapon|armor/.test(rol) || /^20[12]/.test(String(grup)))) secenekler.push({ ad: 'Repair items.', fn: hizmet('rpr') });   // KO: zırh / silah satıcısında da Sundries ile aynı tamir modu (çekiç imleci, eşyaya tıkla)
    if (tuccar && /sundries/.test(rol)) secenekler.push({ ad: 'Repair items.', fn: hizmet('rpr') });
    // KO Inn Hostess (yeni sürüm, İngilizce): Use storage. · Use [VIP] storage · Create clan · Power Up Store · Seal / Cancel(anti-theft) · Character Seal / Cancel · Seal / Cancel
    if (depocu) T().then((t) => t.depoOnYukle?.()).catch(() => {});   // (2.11) menü açılırken depo verisi önceden alınır
    if (depocu) secenekler.push({ ad: 'Use storage.', fn: hizmet('depo') }, { ad: 'Use [VIP] storage', fn: hizmet('depo') });
    // KO Inn Hostess: klan kurma (Knight Clerk ile aynı — klan adı penceresi)
    if (depocu) secenekler.push({ ad: 'Create clan', fn: () => { import('./npc-menu.js').then(({ npcMenuKapat }) => npcMenuKapat?.()).catch(() => {}); if (state?.klanApi?.klanKur) state.klanApi.klanKur(); else hud.notice?.('The clan system is loading. Please try again in a moment.', 'hata'); } });   // tüm depocularda her zaman görünür; klandaysa 'Zaten bir klandasın'
    // (7.11) KO'nun yeni [Knight Clerk] menüsünde olmayan klan işlemleri (ittifak, pelerin / sembol, ayrılma, dağıtma) burada
    if (depocu && state?.klanApi?.bilgi?.klan) secenekler.push({ ad: 'Clan management', kalsin: true, fn: () => state.klanApi.clerkMenu({ ad: e.n.n, model: e.n.m, yonetim: true }) });
    if (depocu) secenekler.push({ ad: 'Power Up Store', fn: () => hud.panel?.('magaza') },
      { ad: 'Seal / Cancel(anti-theft)', kalsin: true, fn: () => import('./npc-menu.js').then(({ npcMenuAc }) => npcMenuAc({ ad: e.n.n, model: e.n.m, resim: './assets/npcimg/buysellinn.webp', metin: 'Seal your item to protect it from theft, or cancel the seal.', secenekler: [{ ad: 'Seal item', fn: hizmet('kilitle') }, { ad: 'Cancel seal', fn: hizmet('kilitAc') }, { ad: 'Close', fn: () => {} }] })) },   // eşya kilidi (anti-theft)
      { ad: 'Character Seal / Cancel', kapali: true }, { ad: 'Seal / Cancel', kapali: true });
    // [NP Merchant] Merchini (18028, Karus) / Leona (18029, El Morad): 100 ve 500 ulus puanı paketi — her paket bir kez,
    // ulus puanı sıfırlanınca (0) yeniden alınabilir (sunucu np_merchant_bilgi / np_merchant_al)
    if ((npc.id === 18028 || npc.id === 18029) && sb && character) {
      const fmtN = (n) => Number(n || 0).toLocaleString('tr-TR');
      const npAna = async () => {
        const { npcMenuAc } = await import('./npc-menu.js');
        const { data } = await sb.rpc('np_merchant_bilgi', { p_char: character.id, p_npc: npc.id }).then((r) => r, () => ({}));
        const P = data?.paketler || [{ paket: 100, fiyat: 5000000, alinabilir: true }, { paket: 500, fiyat: 25000000, alinabilir: true }];
        const sec = P.map((p) => ({ ad: `${p.paket} National Points (${fmtN(p.fiyat)} Noah)${p.alinabilir ? '' : ' — purchased'}`, kalsin: true, fn: () => npOnay(p) }));
        sec.push({ ad: 'Leave.', fn: () => {} });
        npcMenuAc({ ad: e.n.n, model: e.n.m, secenekler: sec,
          metin: `I grant National Points to those who wish to serve their nation. You can buy each package only once; if your National Points drop to zero, you can buy them again.\nYour current National Points: ${fmtN(data?.np)}` });
      };
      const npOnay = async (p) => {
        const { npcMenuAc, npcMenuMetin } = await import('./npc-menu.js');
        if (!p.alinabilir) { npcMenuMetin(`You have already bought the ${p.paket} National Points package. You can buy it again once your National Points drop to zero.`); return; }
        npcMenuAc({ ad: e.n.n, model: e.n.m, metin: `Do you want to buy ${p.paket} National Points for ${fmtN(p.fiyat)} Noah?`, secenekler: [
          { ad: 'Yes, buy.', kalsin: true, fn: async () => {
            const { data, error } = await sb.rpc('np_merchant_al', { p_char: character.id, p_npc: npc.id, p_paket: p.paket }).then((r) => r, (er) => ({ error: er }));
            if (error || !data?.ok) { const m = data?.reason || error?.message || 'Purchase failed.'; npcMenuMetin(m); hud.notice?.(m, 'hata'); return; }
            state.combat?.applyStats?.({ gold: data.gold }); state.inv?.stats?.();
            hud.info?.(`You purchased ${data.paket} national points (${fmtN(data.fiyat)} Noah). National points: ${fmtN(data.np)}.`, 'np-kazanc');
            npcMenuMetin(`${data.paket} National Points have been added. Your National Points: ${fmtN(data.np)}.`);
          } },
          { ad: 'No.', kalsin: true, fn: () => npAna() },
        ] });
      };
      secenekler.push({ ad: 'I want to buy National Points.', kalsin: true, fn: () => npAna() });
    }
    // [Event Manager] Aset (31772, Moradon): KO menüsü birebir — portre npcimg\npc_dk_2020, "Hail Knight. I'm [Event Manager] Aset. What do you wish to buy?"
    // Tüm satın alma satırları Aset'in dükkânını açar (eşyalar GM: "[GM] Open / edit shop" ile dükkâna eklenir).
    if (npc.id === 31772 && sb && character) {
      const dukkan = hizmet('ticaret');
      import('./npc-menu.js').then(({ npcMenuAc }) => npcMenuAc({ ad: e.n.n, model: e.n.m, resim: './assets/npcimg/npc_dk_2020.webp',
        metin: "Hail Knight. I'm [Event Manager] Aset. What do you wish to buy?",
        secenekler: [
          { ad: 'Box Purchase or Open', fn: dukkan },
          { ad: 'Magic Warehouse Ticket (100 pieces)', fn: dukkan },
          { ad: 'Blessed Potion', fn: dukkan },
          { ad: "Aset's Unique Monster Staff", fn: dukkan },
          { ad: 'Talisman Purchase and Drawing', fn: dukkan },
          { ad: 'Event Sales Item List', fn: dukkan },
          { ad: '[General Sales Item List]', fn: dukkan },
        ] })).catch(() => {});
      menuNpc = e; return;
    }
    // [Trader] Julia (31741, Moradon — Moira'nın yanında): KO menüsü birebir (başlık şeridi boş, "Hello, I'm Julia and I'm here to help Moira").
    // Değişimler sandik_ac ile (sandik_degisim tablosu; ödüller Web panel → Oyun yönetimi → Kutu kırma'dan tanımlanır). Eşya yoksa KO metni.
    if (npc.id === 31741 && sb && character) {
      const adetOf = (num) => { let n = 0; for (const [sl, x] of state.inv?.items || []) if (sl >= 14 && Number(x?.row?.item_num) === num) n += Number(x.row.count) || 1; return n; };
      const JULIA = [
        ['[Exchange] Gold Rimmed Blue Treasure Chest', [[814048000, 'Gold Rimmed Blue Treasure Chest of the Forgotten Temple']]],
        ['[Exchange] Cursed Weapon', [[814050000, 'Cursed Weapon Box'], [814049000, 'Cursed Weapon Material Box']]],
        ['[Exchange] Soul Gem', [[0, 'Soul Gem']]],
        ["Exchange Dason's Gift", [[931683000, "Dason's Glorious Gift"], [931684000, "Dason's Shining Gift"], [931685000, "Dason's Delicate Gift"]]],
        ["Manes' Orb Exchange", [[978026000, "Manes' Orb"]]],
      ];
      const juliaMenu = async (ek = '') => {
        const { npcMenuAc } = await import('./npc-menu.js');
        npcMenuAc({ ad: '', model: e.n.m, metin: ek || "Hello, I'm Julia and I'm here to help Moira", secenekler: JULIA.map(([ad, es]) => ({ ad, kalsin: true, fn: () => juliaDegis(es) })) });
      };
      const juliaDegis = async (es) => {
        const var_ = es.find(([num]) => num && adetOf(num) > 0);
        if (!var_) return juliaMenu(`You don't have a [${es[0][1]}].`);
        const [num, ad] = var_;
        try { const p = player.position; await sb.from('characters').update({ x: p.x, y: p.y, z: p.z }).eq('id', character.id); } catch {}
        const { data: r, error } = await sb.rpc('sandik_ac', { p_char: character.id, p_sandik: num }).then((x) => x, (er) => ({ error: er }));
        if (error || !r?.ok) { const m = r?.mesaj || error?.message || 'This item cannot be exchanged right now.'; hud.notice?.(m, 'hata'); return juliaMenu(m); }
        await state.inv?.reload?.();
        hud.info?.(`${ad} exchanged: you've received ${r.ad}!`, 'seviye');
        juliaMenu(`You exchanged the ${ad} and received ${r.ad}!`);
      };
      juliaMenu(); menuNpc = e; return;
    }
    // [Operator] Moira (16047, Moradon): KO hazine sandığı değişimi — Kırmızı / Yeşil / Mavi Treasure Chest (sunucu sandik_ac, KO Item_Exchange)
    if (npc.id === 16047 && sb && character) {
      const SANDIK = [[379154000, 'Red Treasure Chest'], [379155000, 'Green Treasure Chest'], [379156000, 'Blue Treasure Chest'], [379106000, 'Abyss Gem']];
      const adetOf = (num) => { let n = 0; for (const [sl, x] of state.inv?.items || []) if (sl >= 14 && Number(x?.row?.item_num) === num) n += Number(x.row.count) || 1; return n; };
      const sandikMenu = async (ek = '') => koMenu(ek);
      const sandikMenuEski = async (ek = '') => {
        const { npcMenuAc } = await import('./npc-menu.js');
        const sec = SANDIK.map(([num, ad]) => ({ ad: `${num === 379106000 ? 'Exchange' : 'Open'} ${ad} (${adetOf(num)})`, kalsin: true, fn: () => sandikAc(num, ad) }));
        sec.push({ ad: 'Leave.', fn: () => {} });
        npcMenuAc({ ad: e.n.n, model: e.n.m, secenekler: sec,
          metin: (ek ? ek + '\n\n' : '') + 'Bring me a treasure chest or an Abyss Gem and I will give you the special reward inside. I open Red, Green and Blue Treasure Chests and exchange Abyss Gems.' });
      };
      const sandikAc = async (num, ad) => {
        if (!adetOf(num)) return sandikMenu(`You don't have a ${ad}.`);
        try { const p = player.position; await sb.from('characters').update({ x: p.x, y: p.y, z: p.z }).eq('id', character.id); } catch {}
        const { data: r, error } = await sb.rpc('sandik_ac', { p_char: character.id, p_sandik: num }).then((x) => x, (er) => ({ error: er }));
        if (error || !r?.ok) { const m = r?.mesaj || error?.message || 'The chest could not be opened.'; hud.notice?.(m, 'hata'); return sandikMenu(m); }
        await state.inv?.reload?.();
        hud.info?.(`${ad} opened: you've received ${r.ad}!`, 'seviye');
        sandikMenu(`You opened the ${ad} and found ${r.ad} inside!`);
      };
      // KO: Exchanging accessory box → alt menü (Accessory / Forgotten / Forgotten Advanced Accessory Chest Exchange)
      const aksesuarMenu = async () => {
        const { npcMenuAc } = await import('./npc-menu.js');
        const degis = (nums, ad) => { const n = nums.find((x) => adetOf(x) > 0); return n ? sandikAc(n, ad) : yok(ad); };
        npcMenuAc({ ad: e.n.n, model: e.n.m, metin: 'What would you like to trade?', secenekler: [
          { ad: 'Accessory Chest Exchange', kalsin: true, fn: () => degis([810347000, 508194000, 810228000], 'Accessory Box') },
          { ad: 'Forgotten Accessory Chest Exchange', kalsin: true, fn: () => degis([900823000], 'Forgotten Accessory Box') },
          { ad: 'Forgotten Advanced Accessory Chest Exchange', kalsin: true, fn: () => degis([900824000], 'Advanced Forgotten Accessory Box') },
        ] });
      };
      // KO [Trader] Moira menüsü (birebir): "What would you like to trade?" + 10 değişim satırı
      const yok = (es) => sandikMenu(`You don't have a [${es}].`);
      const koMenu = async (ek = '') => {
        const { npcMenuAc } = await import('./npc-menu.js');
        npcMenuAc({ ad: e.n.n, model: e.n.m, metin: (ek ? ek + '\n\n' : '') + 'What would you like to trade?', secenekler: [
          { ad: 'Exchanging the War Trophy Chest', kalsin: true, fn: () => yok('War Trophy Chest') },
          { ad: 'Treasure chest of the Forgotten Shrine', kalsin: true, fn: () => yok('Treasure chest of the Forgotten Shrine') },
          { ad: 'Abyss Gemstone', kalsin: true, fn: () => sandikAc(379106000, 'Abyss Gem') },
          { ad: 'Lottery ticket', kalsin: true, fn: () => yok('Lottery ticket') },
          { ad: 'Premium lottery ticket', kalsin: true, fn: () => yok('Premium lottery ticket') },
          { ad: 'Exchanging accessory box', kalsin: true, fn: () => aksesuarMenu() },
          { ad: 'Chitin Armor Exchange', kalsin: true, fn: () => yok('Chitin Armor Exchange Voucher') },
          { ad: 'Forgotten Temple Coin Exchange', kalsin: true, fn: () => yok('Forgotten Temple Coin') },
          { ad: 'Red Treasure Chest', kalsin: true, fn: () => sandikAc(379154000, 'Red Treasure Chest') },
          { ad: 'Fortune Box Exchange', kalsin: true, fn: () => yok('Fortune Box') },
        ] });
      };
      koMenu(); menuNpc = e; return;
    }
    // [Secret Agent] Clarence (14202 El Morad / 24202 Karus): KO Magic Shield görevi — usta rogue, savaş bölgelerinde 7 zafer → Magic Shield Scroll
    if ((npc.id === 14202 || npc.id === 24202) && sb && character) {
      const msAna = async (ek = '') => {
        const { npcMenuAc } = await import('./npc-menu.js');
        const { data: d } = await sb.rpc('clarence_gorev', { p_char: character.id, p_npc: npc.id, p_islem: 'bilgi' }).then((r) => r, () => ({}));
        if (!d || d.durum === 'uygun_degil') return npcMenuAc({ ad: e.n.n, model: e.n.m, metin: d?.mesaj || 'I have nothing for you right now.', secenekler: [{ ad: 'Leave.', fn: () => {} }] });
        const sec = [];
        let metin;
        if (d.durum === 'aktif') {
          metin = `For me to make the Scroll of Magic Shield, you must prove your ability at the National Combat.\nWin seven victories against the enemy nation in the war zones (Ardream, Ronark Land…).\nVictories: ${d.sayac} / ${d.gerek}`;
          if (d.sayac >= d.gerek) sec.push({ ad: 'I have won seven victories. (Receive Magic Shield Scroll)', kalsin: true, fn: () => msIslem('teslim') });
        } else if (d.durum === 'bitti' && d.var) {
          metin = 'You already have the Magic Shield Scroll. Please don`t lose that rogue`s passion of yours.';
        } else {
          metin = 'For me to make the Scroll of Magic Shield, you must prove your ability at the National Combat. And that can also prove whether you are qualified to use the Magic Shield.\nWin seven victories against the enemy nation in the war zones and come back to me, and I will make the Scroll of Magic Shield for you. (Master rogue, level 61 or higher)';
          sec.push({ ad: 'I accept the quest.', kalsin: true, fn: () => msIslem('kabul') });
        }
        sec.push({ ad: 'Leave.', fn: () => {} });
        npcMenuAc({ ad: e.n.n, model: e.n.m, metin: (ek ? ek + '\n\n' : '') + metin, secenekler: sec });
      };
      const msIslem = async (islem) => {
        const { data: r, error } = await sb.rpc('clarence_gorev', { p_char: character.id, p_npc: npc.id, p_islem: islem }).then((x) => x, (er) => ({ error: er }));
        if (error || !r?.ok) { const m = r?.mesaj || error?.message || 'The request failed.'; hud.notice?.(m, 'hata'); return msAna(m); }
        if (islem === 'teslim') { state.inv?.reload?.(); hud.info?.('You\'ve received the Magic Shield Scroll item.', 'seviye'); return msAna('You have moved me with your drive. Here is the Magic Shield Scroll. Please don`t lose that rogue`s passion of yours.'); }
        hud.info?.('Quest accepted: win 7 victories in the war zones.', 'beceri'); msAna('I`ll be waiting.');
      };
      secenekler.push({ ad: 'Magic Shield', html: '<span class="npm-gorev">Magic Shield</span>', kalsin: true, fn: () => msAna() });
    }
    // KO 16085_Hamus.lua: [Peddler] Hemes — Valkyrie / Gryphon / Bahamut / Yeniçeri sertifikasını özellik seçerek kostüme çevirir
    if (npc.id === 16085 && sb && character) secenekler.push({ ad: 'I want to exchange a costume / Pathos certificate.', kalsin: true, fn: () => import('./npc-hizmet.js').then(({ sertifikaMenu }) => sertifikaMenu({ sb, character, hud, state, ad: e.n.n, model: e.n.m })) });
    if (rahip) secenekler.push({ ad: 'Heal me.', fn: hizmet('iyilestir') });
    if (demirci) secenekler.push({ ad: 'I want to upgrade my items.', kalsin: true, fn: () => import('./npc-menu.js').then(({ npcMenuMetin }) => {
      const t = 'To upgrade your items, go to the Magic Anvil in the square. Click the anvil, choose "Item Upgrade" and place your item and scroll in the slots. Rebirth requires a Rebirth Scroll, and upgrading rebirth items requires a Reverse Item Strengthen Scroll.';
      npcMenuMetin(t);
    }) });
    // görev veren NPC: başka hizmeti yoksa doğrudan KO görev menüsü, varsa en üstte "Görevler" satırı
    const gorevNpc = state.gorev?.varMi(npc.id);
    if (gorevNpc && !secenekler.length) { state.gorev.npcMenu({ npc: npc.id, ad: e.n.n, model: e.n.m }); menuNpc = e; return; }
    if (gorevNpc) secenekler.unshift({ ad: 'Quest', html: '<span class="npm-gorev">Quest</span>', kalsin: true, fn: () => state.gorev.npcMenu({ npc: npc.id, ad: e.n.n, model: e.n.m }) });
    if (isGm() && !tuccar && npc.id !== 900001) secenekler.push({ ad: '[GM] Open / edit shop', fn: hizmet('ticaret') });
    secenekler.push({ ad: 'Leave.', fn: () => {} });
    import('./npc-menu.js').then(({ npcMenuAc }) => npcMenuAc({ ad: e.n.n, metin: g, secenekler, model: e.n.m, resim: depocu ? './assets/npcimg/buysellinn.webp' : null })).catch(() => {});
    menuNpc = e;
    // NPC karakterine dönsün (yerel), isminin üstünde balon
    bubble?.(e.holder, e.tag, g);   // balon yazısı sohbete yazılmaz
  }
  function info(e) {
    const n = e.n;
    say?.(`— ${n.n} —`, 'baslik');
    say?.(`NPC #${n.id}${n.pid != null ? ` · record ${n.pid}` : ''} · model ${n.m || 'none'} · size ${n.s}%`, 'soluk');
    say?.(`Position ${n.x.toFixed(1)}, ${n.z.toFixed(1)} · facing ${Math.round(n.d)}° · distance ${dist(e).toFixed(1)} m`, 'soluk');
  }
  // (2.11) KO: NPC yalnız yakından açılır; uzaktaysa yürüyüp gitmez, "You are too far from the NPC." yazar
  const NPC_MESAFE = 7;
  function approachAndTalk(e) {
    if (dist(e) <= NPC_MESAFE) { talk(e); return; }
    pendingTalk = null;
    hud.notice?.('You are too far from the NPC.', 'hata');
  }

  // ---------- sağ tık menüsü
  function closeMenu() { menu?.remove(); menu = null; }
  function openMenu(e, x, y) {
    closeMenu();
    const items = [['konus', 'Konuş'], ['bilgi', 'Bilgi']];
    if (isGm()) items.push(['duzenle', 'Düzenle…'], ['tasi', 'Konumuma taşı'], ['sil', 'Sil']);
    menu = el(`<div id="npc-menu" class="ko-panel"><div class="nm-baslik">${esc(e.n.n)}</div>${items.map(([k, t]) => `<button data-k="${k}"${k === 'sil' ? ' class="tehlike"' : ''}>${t}</button>`).join('')}</div>`);
    layer.append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    menu.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    menu.addEventListener('click', async (ev) => {
      const k = ev.target.closest('button')?.dataset.k; if (!k) return;
      closeMenu();
      if (k === 'konus') approachAndTalk(e);
      else if (k === 'bilgi') info(e);
      else if (k === 'duzenle') openEditor(e);
      else if (k === 'tasi') { openEditor(e); moveHere(e); }
      else if (k === 'sil') { openEditor(e); editor?.querySelector('[data-k=sil]')?.click(); }
    });
  }
  addEventListener('pointerdown', (ev) => { if (menu && !menu.contains(ev.target)) closeMenu(); }, true);

  // ---------- GM düzenleme penceresi
  let edE = null, refT = 0;
  // Kaydetme kuyruğu: NPC başına en son hâl gönderilir, aynı NPC için aynı anda tek istek uçar.
  // Hızlı art arda basışlarda ara değerler atlanır; hiçbir NPC'nin değişikliği başka NPC'ninkini ezmez.
  const dirty = new Map();        // pid → { e, n }
  const inflight = new Set();     // pid
  let flushT = 0;
  function queueSave(e, patch) {
    Object.assign(e.n, patch); npcs.apply({ ...e.n });
    e.lock = performance.now();                       // bu sürede gelen Realtime yankıları yerel önizlemeyi geri almasın
    dirty.set(e.n.pid, { e, n: { ...e.n } });
    clearTimeout(flushT); flushT = setTimeout(flush, 120);
    refreshEditor();
  }
  function flush() {
    for (const [pid, job] of dirty) {
      if (inflight.has(pid)) continue;
      dirty.delete(pid); inflight.add(pid);
      rpc('gm_npc_guncelle', { p_id: pid, p_x: job.n.x, p_z: job.n.z, p_dir: job.n.d, p_size: Math.round(job.n.s || 100), p_etiket: job.n.e || '', p_renk: job.n.ec || null })
        .catch(() => {})
        .finally(() => {
          inflight.delete(pid); job.e.lock = performance.now();
          if (dirty.has(pid)) flush();
        });
    }
  }
  npcs.isLocked = (pid) => { const e = npcs.byPid(pid); return !!e && (dirty.has(pid) || inflight.has(pid) || performance.now() - (e.lock || 0) < 1500); };
  function moveHere(e) {
    if (!canEdit(e)) return;
    queueSave(e, { x: +player.position.x.toFixed(2), z: +player.position.z.toFixed(2) });
    hud.notice?.(`${e.n.n} has been moved to your position.`);
  }
  function refreshEditor() {
    if (!editor || !edE) return;
    const n = edE.n;
    editor.querySelector('.nd-kimlik').textContent = `NPC #${n.id} · kayıt ${n.pid ?? '—'} · ${n.m || 'model yok'}`;
    const set = (k, v) => { const i = editor.querySelector(`[name=${k}]`); if (i && document.activeElement !== i) i.value = v; };
    set('x', n.x.toFixed(1)); set('z', n.z.toFixed(1)); set('d', Math.round(n.d)); set('dr', Math.round(n.d)); set('s', Math.round(n.s || 100)); set('sr', Math.round(n.s || 100));
    for (const b of editor.querySelectorAll('.nd-renk')) b.classList.toggle('secili', (n.ec || '#ffd76a').toLowerCase() === b.dataset.r);
    editor.querySelector('.nd-uzak').textContent = `${dist(edE).toFixed(1)} m uzakta`;
  }
  function closeEditor() { clearTimeout(flushT); flush(); editor?.remove(); editor = null; edE = null; }
  function openEditor(e) {
    npcs.select(e);
    if (!isGm()) return;
    closeEditor();
    edE = e;
    const ok = canEdit(e);
    const RENK = ['#ffd76a', '#ffffff', '#ff4040', '#ff9a2e', '#7dff7a', '#3fd0ff', '#4f7dff', '#c77dff', '#ff7ad9', '#b8b0a0'];
    editor = el(`<div id="npc-duzen" class="ko-panel ko-pencere">
      <div class="ay-baslik">NPC Düzenle</div><button class="ko-kapat" data-k="kapat" title="Kapat"></button>
      <div class="nd-ad">${esc(e.n.n)}</div>
      <div class="nd-kimlik"></div><div class="nd-uzak"></div>
      ${ok ? '' : '<p class="ay-not">Bu NPC veritabanında değil; düzenlenemez.</p>'}
      <fieldset ${ok ? '' : 'disabled'}>
        <div class="nd-satir"><span>Yön</span><input type="range" name="dr" min="0" max="359" step="1"><input type="number" name="d" min="0" max="359" step="1"></div>
        <div class="nd-satir"><span>Boyut %</span><input type="range" name="sr" min="20" max="500" step="5"><input type="number" name="s" min="20" max="500" step="5"></div>
        <div class="nd-dugmeler"><button data-k="s-25">−25%</button><button data-k="s-10">−10%</button><button data-k="s100">%100</button><button data-k="s+10">+10%</button><button data-k="s+25">+25%</button></div>
        <div class="nd-bolum">İsim üstü yazı</div>
        <div class="nd-satir"><input type="text" name="etiket" maxlength="40" placeholder="Örn: [Görev] / Etkinlik" class="nd-etiket"></div>
        <div class="nd-renkler">${RENK.map((r) => `<button class="nd-renk" data-k="renk" data-r="${r}" style="background:${r}" title="${r}"></button>`).join('')}<input type="color" name="renk" title="Özel renk"></div>
        <div class="nd-dugmeler"><button data-k="etiket-kaydet" class="ay-dugme">Yazıyı kaydet</button><button data-k="etiket-sil" class="ay-dugme tehlike">Yazıyı sil</button></div>
        <div class="nd-dugmeler">
          <button data-k="r-45">↺ 45°</button><button data-k="r-15">↺ 15°</button><button data-k="r+15">15° ↻</button><button data-k="r+45">45° ↻</button>
        </div>
        <div class="nd-dugmeler"><button data-k="bana">Bana baksın</button><button data-k="yonum">Benim yönüme</button><button data-k="ters">Ters çevir</button></div>
        <div class="nd-satir"><span>Konum</span><input type="number" name="x" step="0.5"><input type="number" name="z" step="0.5"><button data-k="uygula">Uygula</button></div>
        <div class="nd-ok">
          <span></span><button data-k="z+">▲</button><span></span>
          <button data-k="x-">◀</button><select name="adim"><option value="0.25">0.25 m</option><option value="1" selected>1 m</option><option value="5">5 m</option></select><button data-k="x+">▶</button>
          <span></span><button data-k="z-">▼</button><span></span>
        </div>
        <div class="nd-dugmeler"><button data-k="tasi" class="ay-dugme">Konumuma taşı</button><button data-k="git" class="ay-dugme">Yanına git</button></div>
        <div class="nd-dugmeler"><button data-k="kopya" class="ay-dugme">Kopyala (konumuma)</button><button data-k="sil" class="ay-dugme tehlike">Sil</button></div>
      </fieldset>
    </div>`);
    layer.append(editor);
    koWindow(editor, { center: false }); toFront(editor);   // KO çerçevesi
    editor.style.left = Math.max(8, innerWidth - 360) + 'px'; editor.style.top = '70px';
    { const et = editor.querySelector('[name=etiket]'); if (et) et.value = e.n.e || ''; const rc = editor.querySelector('[name=renk]'); if (rc) rc.value = e.n.ec || '#ffd76a'; }
    editor.addEventListener('keydown', (ev) => ev.stopPropagation());
    editor.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); toFront(editor); });
    editor.addEventListener('input', (ev) => {
      const t = ev.target; if (!edE || !canEdit(edE)) return;
      if (t.name === 'dr' || t.name === 'd') { const v = ((Number(t.value) || 0) % 360 + 360) % 360; queueSave(edE, { d: v }); }
      if (t.name === 'sr' || t.name === 's') { const v = Math.max(20, Math.min(500, Number(t.value) || 100)); queueSave(edE, { s: v }); }
      if (t.name === 'renk') { queueSave(edE, { ec: t.value, e: editor.querySelector('[name=etiket]').value.trim() || edE.n.e }); }
    });
    let silOnay = 0;
    editor.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      const k = b.dataset.k, E = edE; if (!E) return;
      if (k === 'kapat') return closeEditor();
      if (!canEdit(E)) return;
      const step = Number(editor.querySelector('[name=adim]').value) || 1;
      const turn = /^r([+-]\d+)$/.exec(k);
      if (turn) return queueSave(E, { d: ((E.n.d + Number(turn[1])) % 360 + 360) % 360 });
      if (k === 'bana') return queueSave(E, { d: deg(Math.atan2(player.position.x - E.holder.position.x, player.position.z - E.holder.position.z)) });
      if (k === 'yonum') return queueSave(E, { d: deg(state.yaw) });
      const sb2 = /^s([+-]\d+)$/.exec(k);
      if (sb2) return queueSave(E, { s: Math.max(20, Math.min(500, Math.round((E.n.s || 100) * (1 + Number(sb2[1]) / 100)))) });
      if (k === 's100') return queueSave(E, { s: 100 });
      if (k === 'renk') { const r = b.dataset.r; editor.querySelector('[name=renk]').value = r; return queueSave(E, { ec: r, e: editor.querySelector('[name=etiket]').value.trim() || E.n.e }); }
      if (k === 'etiket-kaydet') { const v = editor.querySelector('[name=etiket]').value.trim(); queueSave(E, { e: v, ec: E.n.ec || editor.querySelector('[name=renk]').value }); hud.notice?.(v ? 'Name tag text saved.' : 'Text empty: removed.'); return; }
      if (k === 'etiket-sil') { editor.querySelector('[name=etiket]').value = ''; queueSave(E, { e: '' }); hud.notice?.('Name tag text removed.'); return; }
      if (k === 'ters') return queueSave(E, { d: (E.n.d + 180) % 360 });
      if (k === 'x-') return queueSave(E, { x: E.n.x - step });
      if (k === 'x+') return queueSave(E, { x: E.n.x + step });
      if (k === 'z-') return queueSave(E, { z: E.n.z - step });
      if (k === 'z+') return queueSave(E, { z: E.n.z + step });
      if (k === 'uygula') {
        const x = Number(editor.querySelector('[name=x]').value), z = Number(editor.querySelector('[name=z]').value);
        if (Number.isFinite(x) && Number.isFinite(z)) queueSave(E, { x, z });
        return;
      }
      if (k === 'tasi') return moveHere(E);
      if (k === 'git') { teleportTo(E.holder.position.x + 1.5, E.holder.position.z + 1.5); return; }
      if (k === 'kopya') { await spawnAt({ id: E.n.id, n: E.n.n, m: E.n.m, s: E.n.s }); return; }
      if (k === 'sil') {
        if (performance.now() - silOnay > 4000) { silOnay = performance.now(); b.textContent = 'Emin misin? Tekrar bas'; setTimeout(() => { if (b.isConnected) b.textContent = 'Sil'; }, 4000); return; }
        try { await rpc('gm_npc_delete', { p_id: E.n.pid }); npcs.remove(E); hud.notice?.(`${E.n.n} has been deleted.`); closeEditor(); renderCatalog(); } catch (err) { console.warn('NPC silinemedi', err); }
      }
    });
    refreshEditor();
  }

  function teleportTo(x, z) {
    state.target = null;
    player.position.set(x, npcs.groundY(x, z), z);
  }
  async function spawnAt(c) {
    if (!isGm()) { say?.('This action is for GMs only.', 'hata'); return null; }
    if (!sb || !character) { say?.('You must be logged in to spawn an NPC.', 'hata'); return null; }
    try {
      const r = await rpc('gm_npc_spawn', { p_zone: zone, p_npc_id: c.id, p_model: c.m || '', p_name: c.n, p_x: +player.position.x.toFixed(2), p_z: +player.position.z.toFixed(2), p_dir: deg(state.yaw), p_size: c.s || 100 });
      const e = npcs.apply(rowToN(r));
      hud.notice?.(`${c.n} has been spawned.`);
      say?.(`NPC spawned: #${c.id} ${c.n} (record ${r.id})`, 'tamam');
      openEditor(e); renderCatalog();
      return e;
    } catch { return null; }
  }

  // ---------- /npc kataloğu
  let cat = null, tab = 'tum', secili = null;
  async function loadCatalog() {
    if (cat) return cat;
    const r = await fetch('./assets/npc_katalog.json').catch(() => null);
    cat = r?.ok ? await r.json() : [];
    cat.sort((a, b) => (!!b.m - !!a.m) || a.id - b.id);
    return cat;
  }
  function renderCatalog() {
    if (!catalog) return;
    const q = catalog.querySelector('[name=ara]').value.trim().toLowerCase();
    const box = catalog.querySelector('.nk-liste');
    const match = (id, name) => !q || String(id).includes(q) || name.toLowerCase().includes(q);
    catalog.querySelectorAll('.ay-sekmeler button').forEach((b) => b.classList.toggle('secili', b.dataset.t === tab));
    let html = '';
    if (tab === 'tum') {
      const items = (cat || []).filter((c) => match(c.id, c.n));
      catalog.querySelector('.nk-sayi').textContent = `${items.length} / ${(cat || []).length} NPC`;
      html = items.slice(0, 600).map((c) => `<div class="nk-satir${secili === c ? ' secili' : ''}${c.m ? '' : ' modelsiz'}" data-id="${c.id}"><b>${c.id}</b><span>${esc(c.n)}</span><i>${c.m ? '' : 'model yok'}</i></div>`).join('');
      if (items.length > 600) html += `<div class="nk-not">… ${items.length - 600} tane daha — aramayı daralt</div>`;
    } else {
      const items = npcs.list.filter((e) => match(e.n.id, e.n.n)).sort((a, b) => dist(a) - dist(b));
      catalog.querySelector('.nk-sayi').textContent = `Bu haritada ${npcs.list.length} NPC`;
      html = items.map((e) => `<div class="nk-satir${npcs.selected === e ? ' secili' : ''}" data-pid="${e.n.pid ?? ''}" data-i="${npcs.list.indexOf(e)}"><b>${e.n.id}</b><span>${esc(e.n.n)}</span><i>${dist(e).toFixed(0)} m</i></div>`).join('');
    }
    box.innerHTML = html || '<div class="nk-not">Sonuç yok</div>';
    const gm = isGm();
    catalog.querySelector('[data-k=dogur]').disabled = !gm || tab !== 'tum' || !secili;
    catalog.querySelector('[data-k=git]').disabled = tab !== 'harita' || !npcs.selected;
    catalog.querySelector('[data-k=duzenle]').disabled = !gm || tab !== 'harita' || !npcs.selected;
  }
  async function openCatalog(query = '') {
    if (catalog) { catalog.remove(); catalog = null; }
    catalog = el(`<div id="npc-katalog" class="ko-panel ko-pencere">
      <div class="ay-baslik">NPC Listesi<button class="ay-kapat" data-k="kapat" title="Kapat">✕</button></div>
      <div class="ay-sekmeler"><button data-t="tum">Tüm NPC'ler</button><button data-t="harita">Bu haritada</button></div>
      <input name="ara" placeholder="Ara: ad ya da NPC numarası" autocomplete="off">
      <div class="nk-sayi"></div>
      <div class="nk-liste"></div>
      <div class="nd-dugmeler">
        <button data-k="dogur" class="ay-dugme">Konumuma doğur</button>
        <button data-k="git" class="ay-dugme">Yanına git</button>
        <button data-k="duzenle" class="ay-dugme">Düzenle</button>
      </div>
      ${isGm() ? '' : '<p class="ay-not">Doğurma ve düzenleme yalnızca GM içindir.</p>'}
    </div>`);
    layer.append(catalog);
    catalog.querySelector('[name=ara]').value = query;
    catalog.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    catalog.addEventListener('input', () => renderCatalog());
    catalog.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') closeCatalog(); });
    catalog.addEventListener('click', async (ev) => {
      const t = ev.target.closest('[data-t]'); if (t) { tab = t.dataset.t; return renderCatalog(); }
      const row = ev.target.closest('.nk-satir');
      if (row) {
        if (tab === 'tum') secili = cat.find((c) => String(c.id) === row.dataset.id) || null;
        else { const e = npcs.list[Number(row.dataset.i)]; if (e) npcs.select(e); }
        renderCatalog();
        return;
      }
      const k = ev.target.closest('button')?.dataset.k;
      if (k === 'kapat') return closeCatalog();
      if (k === 'dogur' && secili) await spawnAt(secili);
      if (k === 'git' && npcs.selected) { const p = npcs.selected.holder.position; teleportTo(p.x + 1.5, p.z + 1.5); renderCatalog(); }
      if (k === 'duzenle' && npcs.selected) openEditor(npcs.selected);
    });
    catalog.addEventListener('dblclick', async (ev) => {
      const row = ev.target.closest('.nk-satir'); if (!row) return;
      if (tab === 'tum' && secili && isGm()) await spawnAt(secili);
      else if (tab === 'harita' && npcs.selected) openEditor(npcs.selected);
    });
    await loadCatalog();
    renderCatalog();
    setTimeout(() => catalog?.querySelector('[name=ara]')?.focus(), 0);
  }
  function closeCatalog() { catalog?.remove(); catalog = null; }

  addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (menu) { closeMenu(); ev.stopImmediatePropagation(); return; }
    if (editor && ev.target.closest?.('#npc-duzen') == null && ev.target.tagName !== 'INPUT') { closeEditor(); ev.stopImmediatePropagation(); }
  }, true);

  let hoverT = 0;
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.buttons || performance.now() - hoverT < 90) return; hoverT = performance.now();
    document.documentElement.classList.toggle('imlec-npc', !!npcs.pick(ev, camera, canvas));
  });

  return {
    /** başka yere tıklandı: NPC'ye gitme/konuşma isteği iptal */
    vazgec() { pendingTalk = null; },
    /** GM düzenleme penceresini aç (test / katalog) */
    duzenle: (e) => openEditor(e),
    /** sol tık: NPC'yi seç (true → tıklama tüketildi) */
    click(ev) {
      const e = npcs.pick(ev, camera, canvas); if (!e) return false;
      npcs.select(e); closeMenu();
      if ((Number(e.n.id) === 18004 || [14201, 14202, 14203, 14204, 24201, 24202, 24203, 24204, 25017, 25003, 603].includes(Number(e.n.id)) || [20004, 20005].includes(Number(e.n.id)) || greeting(e.n.n)) && !(editor && isGm())) approachAndTalk(e);   // KO: NPC'ye tıklayınca yanına gidip menüyü açar
      if (editor && isGm()) openEditor(e);
      renderCatalog();
      return true;
    },
    /** sağ tık: menü (GM: düzenleme penceresi de açılır) */
    context(ev) {
      const e = npcs.pick(ev, camera, canvas); if (!e) { closeMenu(); return false; }
      npcs.select(e);
      if (isGm()) { closeMenu(); openEditor(e); }   // GM: yalnız düzenleme penceresi
      else { closeMenu(); approachAndTalk(e); }   // (2.11) KO: sağ tık doğrudan NPC'nin kendi menüsünü açar (Konuş / Bilgi ara penceresi yok)
      renderCatalog();
      return true;
    },
    dblclick(ev) { const e = npcs.pick(ev, camera, canvas); if (!e) return false; npcs.select(e); approachAndTalk(e); return true; },
    openCatalog,
    __open: (e) => openEditor(e),   // test
    __talk: (e) => talk(e),   // test
    update() {
      { const t = performance.now(); bakisGuncelle(Math.min(0.1, (t - (this._t || t)) / 1000)); this._t = t; }
      if (menuNpc && dist(menuNpc) > 10) { menuNpc = null; import('./npc-menu.js').then((m) => m.npcMenuKapat()); TIC?.then((t) => t.kapatHepsi()); }
      if (pendingTalk) {
        if (dist(pendingTalk) <= 7) { const e = pendingTalk; pendingTalk = null; talk(e); }
        else if (!state.target) pendingTalk = null;
      }
      if (editor && edE) { if (!edE.holder.parent) closeEditor(); else if (performance.now() - refT > 400) { refT = performance.now(); refreshEditor(); } }
    },
  };
}
