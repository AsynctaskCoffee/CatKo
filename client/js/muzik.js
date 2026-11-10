// KO bölge müzikleri (Zones.tbl sütun 19 → sound.tbl): oyuncunun bulunduğu bölgeye göre arka plan müziği.
// Dosyalar Supabase Storage'da (zones/muzik/*.ogg, KO Snd klasöründen). Ses düzeyi Seçenekler → Ses (localStorage "ko-ayar").
const BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? './zones/muzik/' : (window.KO_DEMO ? './zones/muzik/' : 'https://vnlevnlsyyqkofnplzdm.supabase.co/storage/v1/object/public/zones/muzik/');   // yerel kurulumda site/zones
// bölge → KO müziği (sound.tbl: 93 21_moradon, 96 71_ronak, 95 1_karus, 94 2_elmolad, 92 75_korowaz, 91 85_chaos, 107 bgm_castle,
// 20000 bgm_co_town, 20009 fight stadium, 20030 bgm_bifrost, 111000 bgm_ins_81, 35 bgm_login)
const BOLGE = {
  moradon: '21_moradon', freezone_a: '71_ronak', freezone_b: '71_ronak', freezone_c: '71_ronak', freezone_a_event2012: '71_ronak', freezone_b_2012event: '71_ronak',
  karus2004: '1_karus', old_karus: '1_karus', elmo2004: '2_elmolad', old_elmo: '2_elmolad', itemzone_a: '75_korowaz', sky_war_2009: '85_chaos',
  war_a: 'bgm_castle', dungeon_a: 'bgm_bifrost', dungeond: 'fight_stadium', clanfight_b: 'fight_stadium', bossmode: 'fight_stadium',
  in_dungeon01: 'bgm_ins_81', in_dungeon02: 'bgm_ins_81', in_dungeon03: 'bgm_ins_81', in_dungeon04: 'bgm_ins_81', in_dungeon05: 'bgm_ins_81',
  // deadsoft Zones.tbl (sütun 19) ile tamamlandı: 96 Ronark, 20009 savaş arenası, 111000 instance, 20000 ortak kasaba
  freezone_bb: '71_ronak', star_neo: '71_ronak', in_dungeon06: 'bgm_ins_81', dungeon_defense: 'bgm_ins_81', xmas_battle: 'bgm_ins_81',
  clanfight: 'fight_stadium', clanfight_c: 'fight_stadium', clanfight_d: 'fight_stadium', worldwar: 'fight_stadium', oraclegamer_moradonwar: 'fight_stadium',
  eslantzone: 'bgm_co_town', dungeon_b1th: 'bgm_co_town', dungeon_b2th: 'bgm_co_town', dragon_a: 'bgm_co_town', arena: 'bgm_co_town', new_runawar: 'bgm_co_town',
};
export const bolgeMuzigi = (zone) => BOLGE[zone] || 'bgm_co_town';

const ayar = () => { try { const s = JSON.parse(localStorage.getItem('ko-ayar') || '{}'); return { acik: s.muzikAcik !== false, ses: (s.muzik ?? 60) / 100 }; } catch { return { acik: true, ses: 0.6 }; } };
let audio = null, simdiki = null, bekleyen = false;
function oynat() {
  if (!audio) return;
  const a = ayar(); audio.volume = a.ses * 0.7;   // KO müziği arka planda (efektlerin altında)
  if (!a.acik || a.ses <= 0) { audio.pause(); return; }
  const p = audio.play();
  // tarayıcı kullanıcı etkileşimi olmadan sesi başlatmaz: ilk tıklama / tuşta başlar
  if (p?.catch) p.catch(() => {
    if (bekleyen) return; bekleyen = true;
    const ilk = () => { bekleyen = false; removeEventListener('pointerdown', ilk, true); removeEventListener('keydown', ilk, true); oynat(); };
    addEventListener('pointerdown', ilk, true); addEventListener('keydown', ilk, true);
  });
}
/** bölgenin (ya da 'login') müziğini çal; aynı parça çalıyorsa dokunma. Parçalar KO'daki gibi döngüde. */
export function muzikCal(ad) {
  if (simdiki === ad && audio) { oynat(); return; }
  simdiki = ad;
  const yeni = new Audio(BASE + ad + '.ogg'); yeni.loop = true; yeni.preload = 'auto';
  // launcher önbelleğinde varsa oradan (ağdan yeniden indirilmez)
  if (window.caches) caches.open('ko-dosyalar-v1').then((c) => c.match(BASE + ad + '.ogg')).then((r) => r?.blob()).then((b) => { if (b && audio === yeni) { const t = yeni.currentTime; yeni.src = URL.createObjectURL(b); yeni.currentTime = t || 0; oynat(); } }).catch(() => {});
  yeni.addEventListener('error', () => {}, { once: true });   // dosya henüz yüklenmediyse sessiz geç
  const eski = audio; audio = yeni;
  if (eski) { const v0 = eski.volume, t0 = performance.now(); const kis = () => { const k = Math.min(1, (performance.now() - t0) / 800); eski.volume = v0 * (1 - k); if (k < 1) requestAnimationFrame(kis); else eski.pause(); }; kis(); }
  oynat();
}
/** Seçenekler değişince (ses düzeyi / aç-kapa) */
export function muzikAyarla() { oynat(); }
export function muzikDurdur() { audio?.pause(); simdiki = null; }
