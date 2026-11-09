// Çok oyunculu katman (Supabase Realtime)
//  - Presence: bölgedeki oyuncular (ad, ulus, sınıf)
//  - Broadcast "pos": konum + hız + animasyon (hareket ederken 10 Hz, dururken 1 Hz); "anim": tek seferlik animasyonlar
//  - Broadcast "chat": sohbet
//  - Konum veritabanına 15 sn'de bir ve sayfadan çıkarken yazılır
// Not: v1'de konum istemci bildirimidir (hile koruması sonraki aşamada sunucu tarafında).

export function startNet({ sb, character, getLocal, onJoin, onLeave, onPos, onChat, onCount, onAnim = () => {}, onGear = () => {}, onPvp = () => {}, onCagir = () => {}, onMeta = () => {}, onHp = () => {}, onKontrol = () => {}, onDost = () => {}, onFx = () => {}, onMob = () => {}, onBoyut = () => {}, onKopuk = () => {}, onBaglanti = () => {}, gmMi = false, gmIdler = () => new Set(), yakinVar = () => true }) {
  // GM: online listelerinde görünmez (oyuncular için); GM gizlenme (gg): bölgedeki oyuncular GM'i hiç görmez
  let gg = 0; if (gmMi) { try { gg = localStorage.getItem('ko-gm-gizli') === '1' ? 1 : 0; } catch {} }
  const gmKayit = (id, m) => !!m?.gm || gmIdler().has(Number(id));
  let gear = [], ck = null, subscribed = false, gz = 0, gzSure = 0, klan = null, kl = 0, pel = null, bo = Number(character.boyut) || 100, don = null, pt = null, gn = 0, un = null;
  const me = String(character.id);
  // alt sunucu (Ares 1-4): her kanal ayrı dünya kopyası — aynı bölgedeki oyuncular yalnızca kendi kanallarında görünür
  let kanal = 1; try { kanal = Math.max(1, Number(sessionStorage.getItem('ko-kanal') || localStorage.getItem('ko-kanal')) || 1); } catch {}
  // KO: Ardream, Ronark Land ve Ronark Land Base tek dünya — herkes 1. kanalda (diğer bölgelerde seçilen kanal geçerli)
  if (['freezone_a', 'freezone_b', 'freezone_c'].includes(character.zone)) kanal = 1;
  // Bölge kanalı yalnız broadcast: Supabase Presence (track) sunucuda zaman aşımına düşüp kanalı sürekli kapatıyordu
  // (realtime_logs: PresenceHandler.track … time out) → kanal her 5-6 sn yeniden kuruluyor, konum paketleri kayboluyordu.
  // Artık oyuncu bilgisi (meta) ve varlık, broadcast "meta" yayınlarıyla (katılınca, 4 sn'de bir, değişince) taşınır.
  const PVP = ['freezone_a', 'freezone_b', 'freezone_c'].includes(character.zone);
  const ch = sb.channel(`bolge:${character.zone}:k${kanal}`, { config: { broadcast: { self: false } } });
  const known = new Map();          // görünen oyuncular: id → meta
  const bekleyen = new Map();       // sessizliği yüzünden gizlenen (PvP dışı) oyuncular: id → meta (paket gelince geri döner)
  const duyuldu = new Map(), kopuk = new Set(), metaIst = new Map();
  const GIZLE = 4000;               // PvP dışı: bu kadar sessiz kalan (bağlantısı yavaş/kopuk) oyuncu rakiplerde görünmez
  const PVP_AT = 10000;             // PvP: bağlantısı kopan karakter 10 sn sahada kalır (kaçamaz), sonra herkesten silinir
  const katil = (id, meta) => {
    known.set(id, meta); bekleyen.delete(id); kopuk.delete(id); onJoin(id, meta);
    setTimeout(() => { sendPos(true); canGonder(true); }, 50);   // yeni gelen hemen yerimizi görsün
  };
  const cik = (id, sebep) => { if (!known.has(id)) return; const m = known.get(id); known.delete(id); kopuk.delete(id); if (sebep === 'sessiz') bekleyen.set(id, m); else bekleyen.delete(id); onLeave(id, { sebep }); sayac(); };
  const sayac = () => onCount(1 + [...known.entries()].filter(([id, m]) => gmMi || !gmKayit(id, m)).length);   // kendimiz + görünenler (GM'ler sayılmaz)
  const duy = (id, meta = null) => {
    duyuldu.set(id, performance.now());
    if (kopuk.delete(id)) onKopuk(id, false);
    if (known.has(id)) { if (meta) metaGuncelle(id, meta); return; }
    const m = meta || bekleyen.get(id);
    if (m) { katil(id, m); sayac(); return; }
    // meta'sı bilinmeyen oyuncudan paket geldi (biz sonradan girdik ya da meta kaçtı): bilgisini iste (sık değil)
    const t = metaIst.get(id) || 0; if (performance.now() - t > 1500) { metaIst.set(id, performance.now()); if (subscribed) ch.send({ type: 'broadcast', event: 'kim', payload: { id: me, h: id } }); }
  };
  function metaGuncelle(id, meta) {
    const eski = known.get(id);
    // (3.11) GM ırk / meslek / ulus değişimi: oyuncu modeli baştan kurulur (ayrılıp yeniden katılır)
    if (['race', 'nation', 'cls', 'face', 'hair'].some((k) => String(eski[k] ?? '') !== String(meta[k] ?? ''))) { cik(id, 'degisim'); katil(id, meta); sayac(); return; }
    if (JSON.stringify(eski.gear || []) !== JSON.stringify(meta.gear || [])) { known.set(id, meta); onGear(id, meta.gear || []); }
    if (!!eski.gp !== !!meta.gp || JSON.stringify(eski.yd || null) !== JSON.stringify(meta.yd || null) || (eski.gmfx !== false) !== (meta.gmfx !== false) || !!eski.gz !== !!meta.gz || (eski.klan || null) !== (meta.klan || null) || !!eski.kl !== !!meta.kl || JSON.stringify(eski.pel || null) !== JSON.stringify(meta.pel || null) || (eski.bo || 100) !== (meta.bo || 100) || JSON.stringify(eski.don || null) !== JSON.stringify(meta.don || null) || JSON.stringify(eski.pt || null) !== JSON.stringify(meta.pt || null) || !!eski.gg !== !!meta.gg || !!eski.gn !== !!meta.gn || (eski.un || null) !== (meta.un || null)) { known.set(id, meta); onMeta(id, meta); }   // GM efekti aç/kapa, görünmezlik herkeste
    else known.set(id, meta);
  }
  // sessizlik denetimi (her oyuncu dururken de saniyede bir konum yollar)
  const susT = setInterval(() => {
    const now = performance.now();
    for (const id of [...known.keys()]) {
      const sus = now - (duyuldu.get(id) ?? now);
      if (PVP) {
        if (sus > GIZLE && !kopuk.has(id)) { kopuk.add(id); onKopuk(id, true); }   // herkes anında görür: "bağlantı koptu"
        if (sus > GIZLE + PVP_AT) cik(id, 'pvp_dc');
      } else if (sus > GIZLE) cik(id, 'sessiz');
    }
    for (const [id] of bekleyen) if (now - (duyuldu.get(id) ?? 0) > 120000) bekleyen.delete(id);
  }, 1000);
  ch.on('broadcast', { event: 'meta' }, ({ payload }) => { if (!payload || String(payload.id) === me || !payload.m) return; duy(String(payload.id), payload.m); if (payload.ilk) setTimeout(() => sendMeta(true), 80 + Math.random() * 300); });
  ch.on('broadcast', { event: 'kim' }, ({ payload }) => { if (payload && String(payload.h) === me) sendMeta(true); });
  ch.on('broadcast', { event: 'bye' }, ({ payload }) => {
    const id = payload && String(payload.id); if (!id || id === me || !known.has(id)) return;
    if (PVP) { duyuldu.set(id, performance.now() - GIZLE - 1); kopuk.add(id); onKopuk(id, true); }   // PvP: sayfayı kapatan/yenileyen 10 sn sahada kalır
    else cik(id, 'ayrildi');
  });
  ch.on('broadcast', { event: 'pos' }, ({ payload }) => {
    if (!payload || payload.id === me) return; const id = String(payload.id); duy(id);
    if (!known.has(id)) return;
    // (6.11) konum paketindeki meta sürümü (mv) bildiğimizden farklıysa (meta yayını kaçmış) yeni bilgiyi iste — 4 sn'lik tam meta yayını yerine
    if (payload.mv && known.get(id)?.mv && payload.mv !== known.get(id).mv) { const t = metaIst.get(id) || 0; if (performance.now() - t > 1500) { metaIst.set(id, performance.now()); if (subscribed) ch.send({ type: 'broadcast', event: 'kim', payload: { id: me, h: id } }); } }
    onPos(id, payload);
  });
  ch.on('broadcast', { event: 'anim' }, ({ payload }) => { if (payload?.id !== me && known.has(payload.id) && typeof payload.n === 'string') { duy(String(payload.id)); onAnim(payload.id, payload); } });
  // anlık can (hedef çubuğu için): her değişimde ve yeni gelen oyuncuya
  ch.on('broadcast', { event: 'hp' }, ({ payload }) => { if (payload && String(payload.id) !== me) onHp(String(payload.id), payload); });
  // efektler (yetenek, ok, iksir, seviye…): görüş mesafesindeki herkes oynatır
  ch.on('broadcast', { event: 'fx' }, ({ payload }) => { if (payload && String(payload.from) !== me && known.has(String(payload.from))) onFx(String(payload.from), payload); });
  // ortak mob konumları: mobu kovalatan oyuncunun istemcisi yayınlar
  ch.on('broadcast', { event: 'mob' }, ({ payload }) => { if (payload && String(payload.from) !== me && Array.isArray(payload.l)) onMob(payload.l); });
  ch.on('broadcast', { event: 'pvp' }, ({ payload }) => { if (payload && payload.from !== me) onPvp(payload); });
  ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
    if (!payload || typeof payload.text !== 'string') return;
    // KO "Bağır": yalnız 100 m çapındaki oyunculara ulaşır
    if (payload.b) { const p = getLocal(); if (!(Number.isFinite(payload.x) && Math.hypot(p.x - payload.x, p.z - payload.z) <= 150)) return; }   // bağırma 150 m içinde duyulur
    // (2.11) KO genel (All) sohbet: sunucu bölge (region) ızgarasına gönderir — 48 m'lik hücreler, yazanın hücresi ve 8 komşusu (3×3) duyar
    else if (Number.isFinite(payload.x) && Number.isFinite(payload.z)) { const p = getLocal(), R = 48; if (Math.abs(Math.floor(p.x / R) - Math.floor(payload.x / R)) > 1 || Math.abs(Math.floor(p.z / R) - Math.floor(payload.z / R)) > 1) return; }
    onChat(payload.name, payload.text.slice(0, 200), payload.nation, payload.id != null ? String(payload.id) : null, payload.b ? 'bagir' : undefined);
  });

  let ilkBaglanti = true, sonDurum = '';
  ch.subscribe(async (status) => {
    sonDurum = status; onBaglanti(status);
    if (status === 'SUBSCRIBED') {
      subscribed = true; sendMeta(true, true); trackSon = performance.now();
      // (oyuna girişteki "… bölgesine bağlandın (kanal N)" sohbet satırı kaldırıldı — istek)
      ilkBaglanti = false; setTimeout(() => { sendPos(true); canGonder(true); }, 50);   // yeniden bağlanınca da yerimiz hemen görünsün
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') subscribed = false;   // kütüphane kendisi yeniden bağlanır
  });
  const metaTimer = setInterval(() => sendMeta(true), 15000);   // (6.11) seyrek tam meta (yedek); değişiklikler anında yayınlanır, kaçan değişiklik konum paketindeki mv ile istenir

  const gmfx = () => { try { return localStorage.getItem('ko-gm-efekt') !== '0'; } catch { return true; } };
  // varlık (presence) güncellemesi seyreltilir: Supabase istemci başına presence sınırı aşılırsa kanal kapanır → efekt/konum iletileri kaybolur
  let trackSon = 0, trackT = 0;
  function track() {
    const now = performance.now(); clearTimeout(trackT);
    if (now - trackSon < 1500) { trackT = setTimeout(track, 1500 - (now - trackSon)); return Promise.resolve(); }
    trackSon = now; return trackHemen();
  }
  const metaBilgi = () => ({ name: character.name, nation: character.nation, race: character.race, face: character.face, hair: character.hair, sr: character.sac_renk ?? null, cls: character.class, level: character.level, gear, gmfx: gmfx(), gz, gzs: gzSure, klan, kl, pel, bo, don, pt, gn, un, gm: gmMi ? 1 : 0, gg, ck, gp: window.__gmPeri ? 1 : 0, yd: window.__gmYd || null });
  let mv = '';
  const ozet = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  // (8.11) harita yüklemesi bitmeden kendi varlığımız / konumumuz yayınlanmaz: başkaları beni yükleme ekranındayken haritada görmez
  const yuklendi = () => window.__koYuklendi !== false;
  function sendMeta(zorla = false, ilk = false) {
    if (!subscribed || !yuklendi()) return Promise.resolve();
    const m = metaBilgi(); delete m.mv; mv = ozet(JSON.stringify(m)); m.mv = mv;
    return ch.send({ type: 'broadcast', event: 'meta', payload: { id: me, m, ...(ilk ? { ilk: 1 } : {}) } });
  }
  function trackHemen() { return sendMeta(true); }
  // tüm bölgeler için ortak "oyundakiler" kanalı (web paneli buradan sayar)
  const genel = sb.channel('oyun:genel', { config: { presence: { key: me } } });
  // GM çağrısı (/tp <oyuncu>): yalnız hedef oyuncu işler
  genel.on('broadcast', { event: 'cagir' }, ({ payload }) => { if (payload && String(payload.id) === me) onCagir(payload); });
  // GM /dc: hedef istemci oturumunu hemen yoklar (atma kararı sunucuda — bu ileti kendi başına kimseyi atamaz)
  genel.on('broadcast', { event: 'dost' }, ({ payload }) => { if (payload && String(payload.id) === me) onDost(payload); });   // (5.11) başka oyuncunun bana kullandığı dost yetenek (Minor Healing, Swift, Strength of Wolf)
  genel.on('broadcast', { event: 'kontrol' }, ({ payload }) => { if (payload && String(payload.id) === me) onKontrol(payload); });
  // GM boyutu değişti (GM paneli): herkes uygular, hedef kendi presence kaydını da günceller
  genel.on('broadcast', { event: 'boyut' }, ({ payload }) => { if (payload && payload.id != null) onBoyut(String(payload.id), Number(payload.v) || 100, String(payload.id) === me); });
  // (6.11) presence'a klan sembolü anahtarı (pel: {k, v}) da konur → sohbet oyuncu listesinin "bağlı" sekmesinde klan sütunu
  let genelHazir = false;
  const genelTrack = () => { if (genelHazir) genel.track({ name: character.name, nation: character.nation, cls: character.class, level: character.level, zone: character.zone, gm: gmMi ? 1 : 0, ...(pel?.k ? { pel: { k: pel.k, v: pel.v || 0 } } : {}) }).catch?.(() => {}); };
  genel.subscribe((st) => { if (st === 'SUBSCRIBED') { genelHazir = true; genelTrack(); } });

  // konum + anlık animasyon: hareket ederken 10 Hz (yakında kimse yoksa 4 Hz), dururken 1 Hz; harekete başlayınca / durunca / animasyon değişince hemen
  // (31.10) sıra numarası zamandan başlar: F5 ile yeniden giren oyuncunun paketleri, eski oturumun numarasından küçük kalıp diğerlerinde "eski paket" sayılmasın
  let last = null, lastSent = 0, seq = Date.now(), yakinSon = 0, yakin = true;
  function sendPos(force) {
    if (!yuklendi()) return;
    const p = getLocal();
    const now = performance.now();
    const fark = last ? Math.abs(p.x - last.x) + Math.abs(p.z - last.z) : 1, donus = last ? Math.abs(p.yaw - last.yaw) : 1;
    const moved = !last || fark + donus > 0.03 || p.clip !== last.clip;
    const anlik = !last || p.clip !== last.clip || (fark > 0.03) !== !!last.hareket;   // (6.11) harekete başlama / durma / klip değişimi: beklemeden
    if (now - yakinSon > 500) { yakinSon = now; try { yakin = known.size > 0 && yakinVar(); } catch { yakin = true; } }
    const aralik = !moved ? 1000 : yakin ? 100 : 250;
    if (!force && !anlik && now - lastSent < aralik - 5) return;
    if (now - lastSent < 45) return;
    const dt = last ? Math.max(0.05, (now - lastSent) / 1000) : 1;
    const vx = last ? (p.x - last.x) / dt : 0, vz = last ? (p.z - last.z) / dt : 0;
    last = { ...p, hareket: fark > 0.03 }; lastSent = now;
    // (6.11) kısa paket: sıfır hız / yürüyüş / nefes klibi yazılmaz (alıcı varsayılanı kullanır)
    const pl = { id: me, s: ++seq, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3) };
    if (Math.abs(vx) >= 0.01) pl.vx = +vx.toFixed(2); if (Math.abs(vz) >= 0.01) pl.vz = +vz.toFixed(2);
    if (p.clip && p.clip !== 'breath') pl.c = p.clip; if (p.run) pl.r = 1; if (mv) pl.mv = mv;
    ch.send({ type: 'broadcast', event: 'pos', payload: pl });
  }
  const sendTimer = setInterval(() => sendPos(false), 50);

  let halted = false, saved = null;
  async function save(force = false) {
    if (halted) return;
    const p = getLocal();
    if (!force && saved && Math.abs(p.x - saved.x) + Math.abs(p.z - saved.z) < 0.5 && Math.abs(p.yaw - saved.yaw) < 0.1) return;
    saved = p;
    await sb.from('characters').update({ x: p.x, y: p.y, z: p.z, yaw: p.yaw }).eq('id', character.id);
  }
  // oyuncunun konumu kaydedilir: hareket ettikçe 5 sn'de bir, sekme gizlenince ve çıkışta → tekrar girişte orada başlar
  const saveTimer = setInterval(save, 5000);
  addEventListener('pagehide', () => save(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(true); });

  let can = null, canSon = 0, canT = 0;
  function canGonder(zorla = false) {
    if (!yuklendi()) return;
    if (!can || !subscribed) return;
    const now = performance.now(); clearTimeout(canT);
    if (!zorla && now - canSon < 150) { canT = setTimeout(() => canGonder(true), 160); return; }
    canSon = now; ch.send({ type: 'broadcast', event: 'hp', payload: { id: me, ...can } });
  }
  return {
    /** kendi canım değişti → diğer oyunculara (hedef çubukları anlık) */
    can(hp, max_hp, dead) { const y = { hp: Number(hp) || 0, max_hp: Number(max_hp) || 1, dead: !!dead }; if (can && can.hp === y.hp && can.max_hp === y.max_hp && can.dead === y.dead) return; can = y; canGonder(); },
    /** sohbet penceresi oyuncu listesi (KO: yalnız bu haritadaki iki ulusun oyuncuları): 'konum' = bu harita/kanal, 'bagli' = bu haritadaki herkes (tüm kanallar) */
    liste(tur) {
      if (tur === 'bagli') { const st = genel.presenceState(); return Object.entries(st).map(([id, v]) => ({ id, ...(v[0] || {}), ...(known.get(id)?.pel ? { pel: known.get(id).pel } : {}), ...(id === me && pel ? { pel } : {}), ben: id === me })).filter((o) => o.name && (o.ben || !o.zone || o.zone === character.zone) && (gmMi || o.ben || !gmKayit(o.id, o))); }
      return [{ id: me, ...metaBilgi(), ben: true }, ...[...known.entries()].map(([id, m]) => ({ id, ...m, ben: false }))].filter((o) => o.name && (gmMi || o.ben || !gmKayit(o.id, o)));   // oyuncular GM'leri listede görmez
    },
    chat(text, bagir = false) {
      text = String(text).trim().slice(0, 200); if (!text) return;
      if (window.__mgSohbet) text = window.__mgSohbet(text);   // MineGuard: küfür süzgeci
      const p = getLocal();   // konum her mesajda: genel sohbet bölge ızgarasına, bağırma 150 m'ye göre süzülür
      ch.send({ type: 'broadcast', event: 'chat', payload: { id: character.id, name: character.name, nation: character.nation, text, x: +p.x.toFixed(1), z: +p.z.toFixed(1), ...(bagir ? { b: 1 } : {}) } });
      onChat(character.name, text, character.nation, 'ben', bagir ? 'bagir' : undefined);
    },
    save: () => save(true),
    /** arena vuruşu: hedefin istemcisi hasarı/ölümü gösterir (gerçek değer sunucuda) */
    cagir(p) { genel.send({ type: 'broadcast', event: 'cagir', payload: p }); },
    kontrol(id) { genel.send({ type: 'broadcast', event: 'kontrol', payload: { id: String(id) } }); },
    dost(p) { genel.send({ type: 'broadcast', event: 'dost', payload: { ...p, id: String(p.id), from: me } }); },
    /** oyundan çıkış / sekme kapanışı: varlık kaydı hemen silinir → diğer oyunculardan anında kalkar */
    ayril() { try { ch.send({ type: 'broadcast', event: 'bye', payload: { id: me } }); } catch {} try { genel.untrack(); } catch {} try { clearInterval(sendTimer); clearInterval(saveTimer); clearInterval(metaTimer); clearInterval(susT); setTimeout(() => { try { sb.removeChannel(ch); sb.removeChannel(genel); } catch {} }, 150); } catch {} },
    /** bölge kanalı bağlı mı + son durum (bağlantı denetimi için) */
    bagli: () => subscribed, durum: () => sonDurum,
    pvp(p) { ch.send({ type: 'broadcast', event: 'pvp', payload: { ...p, from: me } }); },
    mob(l) { if (subscribed) ch.send({ type: 'broadcast', event: 'mob', payload: { l, from: me } }); },
    fx(p) { if (subscribed) ch.send({ type: 'broadcast', event: 'fx', payload: { ...p, from: me } }); },
    /** kuşanılan eşyalar ([[yuva, kaynak]]) diğer oyunculara (presence) */
    /** görünüm tercihi değişti (GM efekti): diğer oyunculara yeniden duyur */
    izle() { if (subscribed) track(); },
    yuklendi() { window.__koYuklendi = true; if (subscribed) { sendMeta(true, true); setTimeout(() => { sendPos(true); canGonder(true); }, 50); } },
    /** klan adı (isim etiketinin altında) diğer oyunculara */
    /** çağrılı pet [görünüm, ad, seviye] diğer oyunculara */
    /** GM gizlenme: açıkken bölgedeki oyuncular GM'i (model, isim, efekt, pet) göremez */
    setGizli(v) { if (!gmMi) return; gg = v ? 1 : 0; try { localStorage.setItem('ko-gm-gizli', gg ? '1' : '0'); } catch {} if (subscribed) trackHemen(); },
    get gizli() { return !!gg; },
    /** Genie çalışıyor (başın üstündeki dönen GENIE yazısı herkeste görünür) */
    setGenie(on) { on = on ? 1 : 0; if (on === gn) return; gn = on; if (subscribed) track(); },
    setPet(p) { p = p || null; if (JSON.stringify(p) === JSON.stringify(pt)) return; pt = p; if (subscribed) track(); },
    /** takılı başarım adı (isim etiketinde [Başarım] İsim) */
    setUnvan(ad) { ad = ad || null; if (ad === un) return; un = ad; if (subscribed) track(); },
    setKlan(ad, p = null, lider = false) { ad = ad || null; const l = ad && lider ? 1 : 0; if (ad === klan && l === kl && JSON.stringify(p) === JSON.stringify(pel)) return; klan = ad; kl = l; pel = p; if (subscribed) track(); genelTrack(); },
    /** görünmezlik (Stealth/Hide) başladı/bitti: anlık yayın + presence (sonradan gelenler de bilsin) */
    gorunmez(v, sure = 0) { gz = v ? 1 : 0; gzSure = v ? Math.round(sure) : 0; if (!subscribed) return; ch.send({ type: 'broadcast', event: 'fx', payload: { k: 'gz', v: gz, s: gzSure, from: me } }); track(); },
    /** karakter boyutu (%) ve dönüşüm ({pid, b, bit}) diğer oyunculara */
    setBoyut(v) { v = Number(v) || 100; if (v === bo) return; bo = v; if (subscribed) track(); },
    setDon(d) { d = d || null; if (JSON.stringify(d) === JSON.stringify(don)) return; don = d; if (subscribed) track(); },
    boyutYay(id, v) { genel.send({ type: 'broadcast', event: 'boyut', payload: { id: String(id), v } }); },
    /** aşınmış eşya çatlakları (parça anahtarı → kademe 1-3) herkese */
    setCatlak(x) { const j = JSON.stringify(x || null); if (j === JSON.stringify(ck)) return; ck = x || null; if (subscribed) sendMeta(true); },
    setGear(g) { const j = JSON.stringify(g); if (j === JSON.stringify(gear)) return; gear = g; if (subscribed) track(); },
    /** anlık konum/animasyon değişikliği (ör. koşu → yürüyüş) hemen gönderilsin */
    kick() { sendPos(true); },
    /** tek seferlik animasyon (saldırı, darbe, ölüm…) diğer oyunculara */
    anim(n, hold = false, speed = 1) { ch.send({ type: 'broadcast', event: 'anim', payload: { id: me, n, h: hold ? 1 : 0, ...(speed && speed !== 1 ? { s: Math.round(speed * 100) / 100 } : {}) } }); },
    /** ışınlanmadan önce: konum artık yazılmasın (yeni bölge konumunu ezmesin) */
    halt() { halted = true; try { ch.send({ type: "broadcast", event: "bye", payload: { id: me } }); } catch {} clearInterval(sendTimer); clearInterval(saveTimer); clearInterval(metaTimer); clearInterval(susT); setTimeout(() => { try { sb.removeChannel(ch); sb.removeChannel(genel); } catch {} }, 150); },
    stop() { clearInterval(sendTimer); clearInterval(saveTimer); save(true); sb.removeChannel(ch); sb.removeChannel(genel); },
  };
}
