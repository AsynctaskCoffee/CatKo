// Moradon arenası (KO isInArena: X 684–735, Z 440–491 ya da 360–411): içerideki oyuncular birbirine saldırabilir (GM'ler dahil).
// Arenadaki bir oyuncuya sol tık (ya da sağ tık → "Saldır") → yanına gider ve silah hızında vurur. Hasarı sunucu hesaplar (pvp_attack);
// hedefin istemcisi hasarı/ölümü Realtime yayınıyla anında görür.
import * as THREE from '../vendor/three.module.min.js';

// arena bölmesi: 1 = kuzey (Z 440–491), 2 = güney (Z 360–411), 0 = dışarı
// Battle Arena (KO zone 48): ortadaki güvenli alan (127,113) r36 dışında herkes herkese saldırabilir
const arenaHaritasi = (zone, x, z) => zone === 'arena' && (x - 127) ** 2 + (z - 113) ** 2 > 36 * 36;
export const arenaBolme = (zone, x, z) => arenaHaritasi(zone, x, z) ? 3 : (zone === 'moradon' && x > 684 && x < 735 ? (z > 440 && z < 491 ? 1 : z > 360 && z < 411 ? 2 : 0) : 0);
export const arenada = (zone, x, z) => arenaHaritasi(zone, x, z) || zone === 'moradon' && x > 684 && x < 735 && ((z > 440 && z < 491) || (z > 360 && z < 411));

export function initArena({ sb, character, state, hud, player, remotes }) {
  const me = Number(character.id), zone = character.zone;
  let hedef = null, son = 0, mesgul = false, icerde = false;
  // Ardream (KO serbest bölge): farklı uluslardan oyuncular her yerde birbirine saldırabilir
  const ARDREAM = ['freezone_a', 'freezone_b', 'freezone_c'].includes(zone);   // Ardream / Ronark Land / Ronark Land Base
  const benArenada = () => ARDREAM || arenada(zone, player.position.x, player.position.z);
  // PvP bölgesinde ulus puanı biterse (0) oyuncu Moradon'a ışınlanır (sunucu np_bitti; ölüyken dirilince)
  if (ARDREAM && sb) {
    let gidiyor = false, npGoruldu = false;
    const npDenetle = async () => {
      if (gidiyor) return;
      // yalnız bu bölgede puanı tükenince: girişte puanı 0 olan oyuncu atılmaz (puanı bir kez > 0 görülmüş olmalı)
      const { data: c } = await sb.from('characters').select('ulus_puani,dead').eq('id', me).maybeSingle().then((r) => r, () => ({}));
      if (!c) return;
      if (Number(c.ulus_puani) > 0) { npGoruldu = true; return; }
      if (!npGoruldu || c.dead) return;
      const { data } = await sb.rpc('np_bitti', { p_char: me }).then((r) => r, () => ({}));
      if (!data?.ok) return;
      gidiyor = true; clearInterval(npT);
      hud.mesaj?.('National Points', 'You have 0 National Points. Teleporting to Moradon.') || hud.notice?.('You have 0 National Points. Teleporting to Moradon…', 'hata');
      state.net?.halt?.();
      const u = new URL(location.href); for (const k of ['x', 'z', 'bolge']) u.searchParams.delete(k); u.searchParams.set('karakter', me);
      setTimeout(() => location.replace(u.toString()), 2500);
    };
    const npT = setInterval(() => npDenetle().catch(() => {}), 5000);
    setTimeout(() => npDenetle().catch(() => {}), 3000);
  }
  const r = (id) => remotes.get(String(id)) || remotes.get(Number(id));
  const dusman = (x) => ARDREAM ? Number(x?.meta?.nation) !== Number(character.nation) : true;
  const hedefArenada = (id) => { const x = r(id); return !!x && dusman(x) && (ARDREAM || arenada(zone, x.obj.position.x, x.obj.position.z)); };
  const saldirabilir = (id) => benArenada() && hedefArenada(id);

  function hedefle(id) {
    if (!saldirabilir(id)) { hud.notice?.(ARDREAM ? 'You cannot attack players of your own nation.' : 'You can only attack players in the arena.', 'hata'); return false; }
    hedef = String(id);
    state.combat?.cancelAttack?.();
    { const x = r(id); hud.target?.({ name: x?.meta?.name || 'Oyuncu', level: x?.meta?.level, hp: x?.hp ?? 1, max_hp: x?.max_hp ?? 1, enemy: true, oyuncu: true, id: String(id), nation: x?.meta?.nation }); }
    hud.info?.(`${r(id)?.meta?.name || 'Player'} targeted (arena).`, 'beceri');
    return true;
  }
  const birak = () => { hedef = null; };
  // Z: aynı arena bölmesindeki en yakın oyuncuyu seç (KO). Saldırı R ile başlar.
  let secili = null;
  /** Z adayları: seçilebilir düşman oyuncular [{id, d}] (görünmez olup göremediğim oyuncular r.obj.visible=false → hariç) */
  function zAdaylar() {
    const b = ARDREAM ? -1 : arenaBolme(zone, player.position.x, player.position.z); if (!b) return [];
    const a = [];
    for (const [id, x] of remotes) {
      if (!x.obj.visible || !dusman(x) || (x.hp != null && x.hp <= 0)) continue;
      const d = Math.hypot(x.obj.position.x - player.position.x, x.obj.position.z - player.position.z);
      if (ARDREAM ? d > 40 : arenaBolme(zone, x.obj.position.x, x.obj.position.z) !== b) continue;
      a.push({ id: String(id), d });
    }
    return a;
  }
  function oyuncuSec(en) {
    state.combat?.clearTarget?.();   // mob hedefi bırakılır (secili'yi de sıfırlar → sonra atanır)
    secili = String(en); const x = r(en);
    hud.target?.({ name: x?.meta?.name || 'Oyuncu', level: x?.meta?.level, hp: x?.hp ?? 1, max_hp: x?.max_hp ?? 1, enemy: true, oyuncu: true, id: String(en), nation: x?.meta?.nation });
    hud.info?.(`${x?.meta?.name || 'Player'} targeted. Press R to attack.`, 'beceri');
    return true;
  }
  // eski Z (yalnız oyuncular) — combat.js artık oyuncu + canavar adaylarını birlikte sıralar
  function zSec() { const a = zAdaylar().filter((o) => o.id !== String(secili)).sort((x, y) => x.d - y.d); return a.length ? oyuncuSec(a[0].id) : false; }
  /** R: arenada seçili oyuncu varsa ona saldır */
  function rSaldir() { if (secili && saldirabilir(secili)) return hedefle(secili); return false; }

  let animBit = 0;
  async function vur(x) {
    if (state.combat?.takiliYay?.() && (state.combat.okSayisi?.() || 0) < 1) { state.combat.okYokUyari?.(); birak(); return; }
    mesgul = true; son = performance.now(); state.savasSon = son; state.target = null;
    let komboR = false;
    { const av = state.avatar; if (av && son < (av._izKomboBekle || 0)) { av._izKomboBekle = 0; av._izKirmiziBit = son + (state.combat?.saldiriAraligi?.() || 1000) + 300; komboR = true; } }   // (4.11) R combo izi kırmızı + kılıç enerjisi   // vurunca tıklanan yere yürüme iptal
    const C = state.combat;
    // mob R vuruşuyla aynı: silahın A / B saldırı animasyonları sırayla, tamamı oynar (aralıktan uzunsa yalnız o kadar hızlanır)
    const kl = C?.rKlibi?.() || C?.saldiriKlibi?.() || 'attack';
    const k2 = state.avatar?.has?.(kl) ? kl : 'attack';
    // KO: yayda önce kol kalkar, ok bırakma karesinde (strike) çıkar
    let kalkti = false, okBekle = null;
    const yayli = !!C?.takiliYay?.();
    if (yayli) state.okKilit = performance.now() + 450;
    if (!state.avatar?.playOnce(k2, { r: true, speed: Math.max(1, (state.avatar?.sure?.(k2) || 0) * 1000 / ((C?.saldiriAraligi?.() || 1000) * 0.95)), onStrike: () => { kalkti = true; const f = okBekle; okBekle = null; f?.(); } })) kalkti = true;
    animBit = performance.now() + ((state.avatar?.sure?.(k2) || 0.8) * 1000) / Math.max(1, (state.avatar?.sure?.(k2) || 0) * 1000 / ((C?.saldiriAraligi?.() || 1000) * 0.95));
    const hp = x.obj.position;
    try {
      state.gorunmez?.boz?.('you attacked');
      state.gorunmez?.korumaBitir?.();
      const { data, error } = await sb.rpc('pvp_attack', { p_char: me, p_hedef: Number(hedef), p_x: player.position.x, p_z: player.position.z, p_hx: hp.x, p_hz: hp.z });
      if (error) { hud.notice?.(error.message, 'hata'); birak(); return; }
      if (data?.ok && yayli) {
        const at = () => { state.okKilit = performance.now(); C.okAt?.(x.obj.position, Math.max(180, Math.min(700, Math.hypot(x.obj.position.x - player.position.x, x.obj.position.z - player.position.z) * 22))); };
        if (kalkti) at(); else { okBekle = at; setTimeout(() => { if (okBekle === at) { okBekle = null; at(); } }, 450); }
        C.okYenile?.(1);
      } else if (yayli) state.okKilit = 0;
      if (!data?.ok) {
        if (data?.reason === 'ölü') { hud.info?.(`${x.meta?.name} has already been defeated.`, 'beceri'); birak(); }
        else if (data?.reason && !['uzak', 'hizli'].includes(data.reason)) { hud.notice?.(data.reason, 'hata'); birak(); }
        return;
      }
      // vurduğun hasar hedefin başının üstünde (kendi ekranında da)
      const yazi = hp.clone().add(new THREE.Vector3(0, 2.1, 0));
      C?.floatText?.(yazi, data.miss ? 'Iska' : String(data.damage), data.miss ? 'iska' : 'o', true);
      hud.info?.(data.miss ? `${x.meta?.name || 'Player'} evaded your attack (miss).` : `You inflicted ${data.damage} damage on ${x.meta?.name || 'Player'}.`, data.miss ? 'iska' : 'o');
      state.net?.pvp?.({ hedef: String(data.hedef), damage: data.damage, miss: !!data.miss, hp: data.hp, max_hp: data.max_hp, dead: !!data.dead, ad: character.name, an: character.nation, npk: data.np?.kayip || 0 });
      if (data.np?.kazanc) { hud.info?.(`Earned ${data.np.kazanc} national points.`, 'np-kazanc'); state.inv?.stats?.(); }
      // vuruş efekti (silahın element hedef efekti): bende ve görüş mesafesindeki herkeste, vurulan oyuncunun üstünde
      if (!data.miss && data.damage > 0) C?.darbeOyuncu?.(x.obj, data.hedef);
      if (komboR && !data.miss) C?.komboFx?.();   // (4.11) KO R vuruş parlaması (mavi / mor / yeşil)
      const tfx = !data.miss && { 1: 10031, 2: 10032, 3: 10033, 4: 10034 }[state.weaponEl];
      if (tfx) { const v = new THREE.Vector3(); state.efekt?.(tfx, hp, { follow: () => v.copy(x.obj.position), boyut: 0.5, enFazla: 1.5 }); state.net?.fx?.({ k: 'o', id: tfx, o: String(data.hedef), b: 0.5, e: 1.5 }); }
      canGuncelle(data.hedef, data.hp, data.max_hp);
      if (data.gorev?.length) state.gorev?.guncelle?.(data.gorev);   // Ardream: düşman oyuncu yenme görevleri
      if (data.dead && !ARDREAM) state.arenaOldurme?.(character.name, x?.meta?.name || data.ad || 'Player', x?.obj?.position, player.position);
      if (data.dead && ARDREAM) state.oldurmeSatiri?.(character.name, character.nation, x?.meta?.name || data.ad || 'Oyuncu', x?.meta?.nation, x?.obj?.position);
      if (data.dead) { hud.info?.(`You defeated ${data.ad} ${ARDREAM ? ({ freezone_b: 'in Ronark Land', freezone_c: 'in Ronark Land Base' }[zone] || 'in Ardream') : 'in the arena'}!`, 'seviye'); hud.notice?.(`${data.ad} has been defeated!`, 'seviye'); birak(); }
    } finally { mesgul = false; }
  }

  function update() {
    const ic = benArenada();
    if (ic !== icerde) { icerde = ic; if (!ARDREAM) hud.notice?.(ic ? 'You entered the arena: players can attack each other here.' : 'You left the arena.', ic ? 'hata' : undefined); if (!ic) { birak(); if (secili) { secili = null; hud.target?.(null); } } }
    if (!hedef || mesgul || state.combat?.dead) return;
    const x = r(hedef);
    if (!x || !x.obj.visible || !hedefArenada(hedef) || !ic) { birak(); return; }
    const dx = x.obj.position.x - player.position.x, dz = x.obj.position.z - player.position.z, d = Math.hypot(dx, dz);
    const yay = state.combat?.takiliYay?.(), menzil = yay ? state.combat.yayMenzili() : 3.2;
    // KO: vuruş animasyonu sürerken hedef biraz kıpırdasa da yerinden oynamaz (animasyon yarıda kesilmez); menzilden belirgin çıkınca yaklaşır
    if (d > menzil + (performance.now() < animBit ? 1.5 : 0.4)) { state.target = new THREE.Vector3(x.obj.position.x - dx / d * (menzil - 1.2), 0, x.obj.position.z - dz / d * (menzil - 1.2)); return; }
    if (state.target && d <= menzil) state.target = null;
    state.yaw = Math.atan2(dx, dz);
    const aralik = state.combat?.saldiriAraligi?.() || 1000;
    if (performance.now() - son >= aralik) vur(x);
  }

  // başka bir oyuncunun arena vuruşu
  // körlük: sahnenin üstüne (HUD'un altına) koyu örtü + isim etiketleri gizli; örtü tıklamaları geçirir (hedefleme sürer)
  let korT = 0, korEl = null;
  function korEt(sure) {
    if (!korEl) { korEl = document.createElement('div'); korEl.id = 'korluk'; document.body.append(korEl); }
    clearTimeout(korT); korEl.classList.remove('kor-bitis'); void korEl.offsetWidth;
    korEl.hidden = false; document.documentElement.classList.add('korluk');
    korT = setTimeout(() => { korEl.classList.add('kor-bitis'); document.documentElement.classList.remove('korluk'); setTimeout(() => { if (!document.documentElement.classList.contains('korluk')) korEl.hidden = true; }, 450); }, sure * 1000);
  }
  function onPvp(p) {
    try { dispatchEvent(new CustomEvent('ko-hedef-etki-yenile', { detail: { id: String(p.hedef ?? ''), from: String(p.from ?? '') } })); } catch {}   // hedef etkileri anında yenilenir
    // PvP bölgesi öldürme satırı (sohbet): "Öldüren -> Ölen"
    if (p.dead && !p.miss && ARDREAM) {
      const a = r(p.from), v = String(p.hedef) === String(me) ? { meta: { name: character.name, nation: character.nation } } : r(p.hedef);
      const yer = String(p.hedef) === String(me) ? player.position : r(p.hedef)?.obj?.position;
      state.oldurmeSatiri?.(a?.meta?.name || p.ad || 'Oyuncu', a?.meta?.nation ?? p.an, v?.meta?.name || 'Oyuncu', v?.meta?.nation, yer);
    }
    // arena (Moradon / Battle Arena): KO ölüm duyurusu, ölenin 30 m çevresine
    if (p.dead && !p.miss && !ARDREAM) {
      const a = r(p.from), v = String(p.hedef) === String(me) ? { meta: { name: character.name } } : r(p.hedef);
      const yer = String(p.hedef) === String(me) ? player.position : v?.obj?.position;
      if (yer && arenada(zone, yer.x, yer.z)) state.arenaOldurme?.(a?.meta?.name || p.ad || 'Player', v?.meta?.name || 'Player', yer, player.position);
    }
    if (String(p.hedef) === String(me)) {
      if (p.miss) { hud.info?.(`${p.ad} missed you (miss).`, 'beceri'); return; }
      // Rogue Blinding (x675) / Blinding Strafe (x580): kör eder — ekran kararır, oyuncular ve canavarlar görünmez,
      // ama sahnede durdukları için tıklayınca hedeflenebilirler (görüntü örtüsü tıklamayı geçirir)
      { const sk = Number(p.skill) || 0, no = sk % 1000, sinif = Math.floor(sk / 1000) % 100;
        if ((no === 675 || no === 580) && [2, 7, 8].includes(sinif) && !p.dead) {
          const sure = Number(p.sure) > 0 && Number(p.sure) <= 10 ? Number(p.sure) : 2;
          korEt(sure);
          // tek etki simgesi: sunucu zayıflatma anahtarı (dk) varsa aynı anahtar kullanılır, aşağıdaki dk bloğu ikinci simge eklemez
          dispatchEvent(new CustomEvent('ko-etki-sil', { detail: 'kor' }));
          dispatchEvent(new CustomEvent('ko-etki', { detail: { id: sk, ad: p.sad || 'Blinding', sure, tip: 'debuff', anahtar: p.dk ? 'buff:' + p.dk : 'kor' } }));
          hud.info?.(`${p.ad} blinded you (${sure} sec).`, 'np-kayip');
          if (p.dk) { setTimeout(() => state.inv?.stats?.(), 300); if (!p.damage) return; p = { ...p, dk: null }; }
        } }
      // rakibin zayıflatması (anti-def, Illusion…): etki penceresinde süresi bitene dek görünür
      if (p.dk) {
        dispatchEvent(new CustomEvent('ko-etki', { detail: { id: p.skill, ad: p.sad || 'Debuff', sure: Number(p.sure) || 10, tip: 'debuff', anahtar: 'buff:' + p.dk } }));
        hud.info?.(`${p.ad} cast ${p.sad || 'a debuff'} on you (${Number(p.sure) || 10} sec).`, 'np-kayip');
        setTimeout(() => state.inv?.stats?.(), 300); setTimeout(() => state.inv?.stats?.(), (Number(p.sure) || 10) * 1000 + 400);
        if (!p.damage) return;
      }
      state.combat?.hurt?.({ ok: true, damage: p.damage, hp: p.hp, max_hp: p.max_hp, dead: p.dead }, p.ad);
      if (p.dead && p.npk) { hud.info?.(`Lost ${p.npk} national points.`, 'np-kayip'); setTimeout(() => state.inv?.stats?.(), 500); }
    } else {
      canGuncelle(p.hedef, p.hp, p.max_hp);
      const x = r(p.hedef);
      if (x && !p.miss) state.combat?.floatText?.(x.obj.position.clone().add(new THREE.Vector3(0, 2.1, 0)), String(p.damage), 'o', true);
    }
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && hedef) birak(); });
  /** oyuncunun bilinen canı (vuruş sonuçlarından): seçili/saldırılan oyuncuysa üstteki can çubuğu güncellenir */
  function canGuncelle(id, hp, max) {
    const x = r(id); if (!x || hp == null) return;
    x.hp = Number(hp); x.max_hp = Number(max) || x.max_hp || 1;
    if (String(id) === String(secili) || String(id) === String(hedef)) hud.target?.({ name: x.meta?.name || 'Oyuncu', level: x.meta?.level, hp: x.hp, max_hp: x.max_hp, enemy: true, oyuncu: true, id: String(id), nation: x.meta?.nation });
  }
  /** oyuncu canı yayını (net 'hp'): hedef çubuğu anlık; ölen oyuncu herkesin hedefinden çıkar */
  function canYayini(id, p) {
    canGuncelle(id, p.hp, p.max_hp);
    if ((p.dead || Number(p.hp) <= 0) && (String(id) === String(secili) || String(id) === String(hedef))) { if (String(id) === String(hedef)) birak(); secili = null; hud.target?.(null); }
  }
  /** yetenek hedefi: saldırılan ya da Z ile seçili arena oyuncusu */
  const pvpHedef = () => { const id = hedef || secili; return id && saldirabilir(id) ? id : null; };
  const konum = (id) => r(id)?.obj.position || null;
  return { oyuncu: r, canGuncelle, canYayini, icinde: () => !ARDREAM && benArenada(), saldirabilir, hedefle, birak, update, onPvp, zSec, zAdaylar, oyuncuSec, rSaldir, pvpHedef, konum, get secili() { return secili; }, birakSecim: () => { secili = null; }, get hedef() { return hedef; } };
}
