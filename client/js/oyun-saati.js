// GM oyun saati / hava ayarı (sunucu: oyun_saati tablosu + gm_oyun_saati). Bölge satırı varsa o, yoksa '*' (tüm haritalar) satırı geçerli.
//  mod 'akis'  : GM'nin ayarladığı saatten gerçek zamanla akar
//  mod 'sabit' : hep aynı saat (ör. 13:00 — gün hiç ilerlemez)
//  hava        : 'oto' (doğal hava, hava.js) | 'acik' | 'yagmur' | 'kar'
// Satır yoksa oyun saati Türkiye gerçek saatidir (main.js oyunSaati). Değişiklik realtime ile anında herkese yansır.
let SATIR = new Map(), dinleyici = new Set(), kuruldu = false;

const uygula = (rows) => { SATIR = new Map((rows || []).map((r) => [r.zone, r])); for (const f of dinleyici) try { f(); } catch {} };

export function kurOyunSaati(sb) {
  if (kuruldu || !sb) return; kuruldu = true;
  const yukle = () => sb.from('oyun_saati').select('*').then(({ data }) => uygula(data), () => {});
  yukle();
  try { sb.channel('oyun-saati').on('postgres_changes', { event: '*', schema: 'public', table: 'oyun_saati' }, () => yukle()).subscribe(); } catch {}
  setInterval(yukle, 120000);   // realtime kopsa da yedek
}
export const oyunSaatiDegisti = (f) => { dinleyici.add(f); return () => dinleyici.delete(f); };
export const yerelUygula = uygula;   // GM paneli RPC sonucunu hemen uygular (realtime beklemeden)

export function saatAyari(zone) { return SATIR.get(String(zone || '').toLowerCase()) || SATIR.get(zone) || SATIR.get('*') || null; }

/** GM ayarı varsa oyun saati (sn, 0-86399), yoksa null */
export function gmSaat(zone, ms = Date.now()) {
  const r = saatAyari(zone); if (!r) return null;
  if (r.mod === 'sabit') return r.saat_sn;
  return (r.saat_sn + Math.max(0, (ms - Date.parse(r.ayar_at)) / 1000) * KO_HIZ) % 86400;   // KO hızında akar
}
/** KO oyun saati (CN3SkyMng TIME_REAL_PER_GAME = 10; sunucu UpdateGameTime 6 sn'de 1 oyun dakikası): oyun 10 kat hızlı akar,
 *  bir oyun günü 2 saat 24 dakika. Herkes için aynı (Türkiye saatinden türetilir). */
export const KO_HIZ = 10;
export const koSaat = (ms = Date.now()) => (((ms / 1000 + 3 * 3600) * KO_HIZ) % 86400 + 86400) % 86400;
/** GM hava ayarı ('acik' | 'yagmur' | 'kar') ya da null (oto) */
export function gmHava(zone) { const r = saatAyari(zone); return r && r.hava && r.hava !== 'oto' ? r.hava : null; }
export const saatYaz = (sn) => { sn = Math.floor(((sn % 86400) + 86400) % 86400); return String(Math.floor(sn / 3600)).padStart(2, '0') + ':' + String(Math.floor(sn / 60) % 60).padStart(2, '0'); };
