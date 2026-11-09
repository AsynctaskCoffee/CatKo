// KO madencilik (deadsoft MiningFishingSystem.cpp): Moradon maden alanı X 600–666, Z 348–399.
// Sağ elde kazma (Mattock / Golden Mattock, Kind 61) varken SPACE ile başlar; karakter kazmayı kaldırıp yere vurur (animasyon 151),
// istemci her 5 sn'de bir deneme gönderir (MINING_DELAY), sunucu maden_kaz: EXP (13082 efekti) ya da eşya (13081 efekti).
// Yürüyünce, saldırınca, ölünce, alandan çıkınca, çanta dolunca ya da kazma aşınınca durur. SPACE tekrar: bırak.
import { fxEkle } from './fx.js';

// deadsoft MiningFishingSystem: Moradon, El Morad Castle (2 alan), Luferson Castle (2 alan)
const ALANLAR = {
  moradon: [[600, 666, 348, 399]],
  elmo2004: [[1408, 1488, 354, 440], [1653, 1733, 526, 625]],
  karus2004: [[597, 720, 1625, 1705], [315, 415, 1435, 1500]],
};
const GECIKME = 5000, KLIP = 'a151';   // oyuncu animasyon tablosu 151: kazmayı başın üstüne kaldırıp yere vurma (152 = balıkçılık bekleme duruşu)
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

export function initMaden({ sb, character, hud, state, player, zone }) {
  const AL = ALANLAR[zone]; if (!AL) return { update() {}, aktif: () => false, dur() {} };
  const fxHazir = fxEkle('./assets/fxmaden').catch(() => null);
  let icerde = false, kaz = null, sonBilgi = 0;
  const alanda = () => { const p = player.position; return AL.some(([x0, x1, z0, z1]) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1); };
  const kazma = () => { const it = state.inv?.items?.get?.(6)?.it; return it && Number(it.Kind ?? it.kind) === 61 ? it : null; };
  // ekranın ortasında sarı yazı: yavaşça belirir, 4 sn kalır, silinir (çerçevesiz)
  let ortaEl = null, ortaT = 0;
  const yazi = (t) => {
    if (!ortaEl) { ortaEl = document.createElement('div'); ortaEl.className = 'maden-orta-yazi'; document.body.append(ortaEl); }
    clearTimeout(ortaT); ortaEl.textContent = t; ortaEl.classList.remove('gor'); void ortaEl.offsetWidth; ortaEl.classList.add('gor');
    ortaT = setTimeout(() => ortaEl.classList.remove('gor'), 1000 + 4000);   // 1 sn belirme + 4 sn bekleme, sonra 1 sn'de silinir
  };

  function basla() {
    if (kaz) return;
    if (state.combat?.stats?.dead || state.combat?.dead) return;
    if (!alanda()) { hud.notice?.('Not mining area', 'hata'); return; }
    if (!kazma()) { hud.notice?.('You need a pickaxe (Mattock) in your right hand to mine. You can get one from [Pitman] at the mine entrance.', 'hata'); return; }
    if (state.otur && state.dinlen?.engelle?.()) return;
    if (state.genie?.acik) { hud.notice?.('You cannot mine while Genie is running. Stop Genie first.', 'hata'); return; }
    state.target = null; state.combat?.cancel?.(); state.combat?.cancelAttack?.();
    kaz = { x: player.position.x, z: player.position.z, sonraki: performance.now() + GECIKME, bekliyor: false };
    state.maden = kaz;
    hud.info?.('Mining started. Press SPACE or move to stop.', 'beceri');
    yazi('Mining started');
    sallan();
  }
  function dur(neden) {
    if (!kaz) return;
    kaz = null; state.maden = null;
    state.avatar?.stopOnce?.();
    if (neden) hud.info?.(neden, 'soluk');
  }
  // KO 13080 (z_h_mine_nomal_all): kazma yere vurunca toz bulutu (sandwind), sıçrayan taşlar ve zemin çatlağı — her vuruşta, karakterin önünde
  const VURUS_FX = 13080;
  function vurusFx() {
    const y = state.yaw || 0, p = player.position;
    const x = p.x + Math.sin(y) * 0.9, z = p.z + Math.cos(y) * 0.9, h = state.heightAt?.(x, z) ?? p.y;
    fxHazir.then(() => { const b = state.efekt?.(VURUS_FX, { x, y: h + 0.05, z }, { boyut: 0.8 }); if (b) setTimeout(() => b.stop?.(), 1500); });
    state.net?.fx?.({ k: 'z', id: VURUS_FX, x: +x.toFixed(2), y: +h.toFixed(2), z: +z.toFixed(2), m: null, b: 0.8, e: 4 });
  }
  // KO: madencilik animasyonu (upc_*.n3anim 151 — orijinal istemcideki tabloyla birebir aynı) kendi hızında, kesintisiz döngüde oynar;
  // her yere vuruşta (strike karesi) toz / taş efekti
  function sallan() {
    const av = state.avatar; if (!av?.has?.(KLIP) || av.busy) return;
    av.playOnce(KLIP, { onStrike: () => { if (kaz) vurusFx(); } });
  }
  async function dene() {
    kaz.bekliyor = true;
    const k = kaz;
    let d;
    try { ({ data: d } = await sb.rpc('maden_kaz', { p_char: character.id, p_x: player.position.x, p_z: player.position.z })); }
    catch { d = null; }
    finally { if (k === kaz) { kaz.bekliyor = false; kaz.sonraki = performance.now() + GECIKME; } }
    if (k !== kaz) return;
    if (!d) return;
    if (!d.ok) { if (d.reason === 'bekle') return; hud.notice?.(d.reason || 'Mining stopped.', 'hata'); if (d.dur) dur(); return; }
    await fxHazir;
    // +ITEM (13081) / +EXP (13082) yazısı karakterin başının üstünde yükselir
    // +ITEM (13081) / +EXP (13082): %20 küçük, başın üstünden yukarı süzülür (1,6 → 2,8 m, 1,5 sn) ve silinir
    const v = player.position.clone(), t0 = performance.now(), SURE = 1500;
    const b = state.efekt?.(d.fx, player.position, { boyut: 0.8, follow: () => v.copy(player.position).setY(player.position.y + 1.6 + 1.2 * Math.min(1, (performance.now() - t0) / SURE)) });
    if (b) setTimeout(() => b.dispose?.(), SURE);
    state.net?.fx?.({ k: 'b', id: d.fx, b: 0.8, dy: 1.6, yuk: 1.2, sn: 1.5 });
    if (d.tur === 'exp') {
      state.combat?.odulUygula?.({ exp: d.exp, level: d.level, levelup: d.levelup, hp: d.hp, max_hp: d.max_hp, mp: d.mp, max_mp: d.max_mp });
      hud.info?.(`Mining: earned ${fmt(d.kazanc)} Experience Points.`, 'exp');
    } else {
      hud.info?.(`Mining: you found ${d.ad}${d.adet > 1 ? ' x' + d.adet : ''}.`, 'esya');
      state.inv?.reload?.();
    }
    if (d.dur != null && d.dur <= 0) { hud.notice?.('The durability of pickaxe is 0', 'hata'); dur(); }
  }

  // SPACE: maden bölgesinde madenciliği başlat / bırak
  addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!alanda() && !kaz) return;
    e.preventDefault();
    if (kaz) dur('You stopped mining.'); else basla();
  });

  return {
    aktif: () => !!kaz,
    dur,
    update() {
      const ic = alanda();
      if (ic !== icerde) {
        icerde = ic;
        if (ic) {
          yazi('Mining area — press SPACE to mine');
          if (performance.now() - sonBilgi > 30000) { sonBilgi = performance.now(); hud.info?.(kazma() ? 'You entered the mining area. Press SPACE to start mining.' : 'You entered the mining area. Equip a pickaxe (Mattock) in your right hand to mine; you can get one from [Pitman]. Then press SPACE.', 'beceri'); }
        } else if (kaz) dur('You left the mining area; mining stopped.');
      }
      if (!kaz) return;
      // KO: yürümek, saldırmak ya da ölmek madenciliği bitirir
      const p = player.position;
      if (Math.hypot(p.x - kaz.x, p.z - kaz.z) > 0.3 || state.target) return dur('You moved; mining stopped.');
      if (state.combat?.dead || state.combat?.stats?.dead) return dur();
      if (!kazma()) return dur('The pickaxe was unequipped; mining stopped.');
      sallan();
      if (!kaz.bekliyor && performance.now() >= kaz.sonraki) dene();
    },
  };
}
