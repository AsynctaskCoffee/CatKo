// Arazi yönetimi (GM paneli → Dünya editörü → Arazi): yükseklik fırçaları, özel haritaların arazi üretimi, gerçek zamanlı eşitleme.
// Veri: arazi_parca (zone, cx, cz, h real[33*33]) — 32 × 32 karoluk parçanın köşe yükseklikleri. Harita yüklenirken özgün araziye
// uygulanır; düzenlemeler sunucuya parça parça yazılır (gm_arazi_kaydet) ve realtime ile o haritadaki herkese anında yansır.
// Özel haritalar (ozel_harita): zemin dokuları ve gökyüzü şablon haritadan; arazi şekli tohumdan üretilir (sekilUret).
export const PARCA = 32, KOSE = 33;
export const YUZEY_TABAN = 600;   // karo kimliği ≥ 600: yüzey kütüphanesi katmanı (terrain.js ile aynı)

// ---------- gürültü (tohumlu değer gürültüsü)
function rastgele(tohum) { let a = tohum >>> 0 || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function gurultu(tohum = 1) {
  const r = rastgele(tohum), P = new Uint8Array(512), G = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; G[i] = r() * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const yum = (t) => t * t * (3 - 2 * t);
  const deger = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = yum(x - xi), fz = yum(z - zi), X = xi & 255, Z = zi & 255;
    const a = G[P[X + P[Z]]], b = G[P[X + 1 + P[Z]]], c = G[P[X + P[Z + 1]]], d = G[P[X + 1 + P[Z + 1]]];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  const fbm = (x, z, o = 5) => { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < o; i++) { s += deger(x * f, z * f) * a; t += a; a *= 0.5; f *= 2.03; } return s / t; };
  const sirt = (x, z, o = 5) => { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < o; i++) { const v = 1 - Math.abs(deger(x * f, z * f)); s += v * v * a; t += a; a *= 0.5; f *= 2.07; } return s / t; };
  return { deger, fbm, sirt };
}

/** özel harita: arazi şekli (z.heights doldurulur) ve tek tip zemin dokusu (şablonun en yaygın karosu) */
export function sekilUret(z, { sekil = 'duz', tohum = 1, taban = 20 } = {}) {
  const { N, heights, bits } = z, g = gurultu(tohum), m = (N - 1) / 2;
  for (let x = 0; x < N; x++) for (let k = 0; k < N; k++) {
    const u = (x - m) / m, v = (k - m) / m, d = Math.min(1, Math.hypot(u, v));
    const kenar = Math.min(1, Math.min(x, k, N - 1 - x, N - 1 - k) / (N * 0.06));   // kenarlarda düz şerit
    const nx = x / ((N - 1) / 16), nz = k / ((N - 1) / 16);   // harita boyutundan bağımsız (önizleme ile aynı şekil)
    let h = 0;
    if (sekil === 'tepeler') h = (g.fbm(nx * 0.45, nz * 0.45) * 0.5 + 0.5) * 38;
    else if (sekil === 'daglik') h = Math.pow(g.sirt(nx * 0.22, nz * 0.22), 2.4) * 170 + g.fbm(nx, nz) * 6;
    else if (sekil === 'ada') h = Math.max(0, 1 - d * d * 1.35) * 55 + g.fbm(nx * 0.5, nz * 0.5) * 14 - 8;
    else if (sekil === 'vadi') h = Math.min(1, Math.abs(u + g.fbm(nz * 0.5, 3) * 0.35) * 1.6) ** 1.6 * 90 + g.fbm(nx, nz) * 6;
    else if (sekil === 'plato') { const p = g.fbm(nx * 0.3, nz * 0.3) * 0.5 + 0.5; h = (p > 0.55 ? 40 : p > 0.45 ? (p - 0.45) * 400 : 0) + g.fbm(nx * 3, nz * 3) * 3; }
    heights[x * N + k] = taban + h * kenar;
  }
  // zemin: şablondaki en yaygın tam karo (çoğunlukla çimen / kum / kar)
  const say = new Map(); for (let i = 0; i < bits.length; i += 7) { const b = bits[i]; if (b & 1) { const t = (b >>> 11) & 1023; say.set(t, (say.get(t) || 0) + 1); } }
  const sira = [...say].sort((a, b) => b[1] - a[1]), t1 = sira[0]?.[0] ?? 0, t2 = sira[1]?.[0] ?? t1;
  // dik yamaçlarda şablonun ikinci yaygın karosu (çoğunlukla toprak / kaya): dağlar düz renk görünmesin
  const T = z.meta?.tileSize || 4;
  for (let x = 0; x < N; x++) for (let k = 0; k < N; k++) {
    const i = x * N + k, h = heights[i];
    const e = x < N - 1 && k < N - 1 ? Math.max(Math.abs(heights[i + N] - h), Math.abs(heights[i + 1] - h), Math.abs(heights[i + N + 1] - h)) / T : 0;
    bits[i] = 1 | ((e > 0.9 ? t2 : t1) << 11) | (1023 << 21);
  }
}

/** haritanın kayıtlı arazi düzenlemelerini (arazi_parca) yükseklik dizisine uygula — arazi kurulmadan önce */
export async function araziYukle(sb, zone, z) {
  z.hOrj ||= z.heights.slice();   // özgün arazi (sıfırlama ve başkasının sıfırlaması için)
  if (!sb) return 0;
  let n = 0;
  for (let bas = 0; bas < 4096; bas += 200) {
    const { data, error } = await sb.from('arazi_parca').select('cx,cz,h,b,w').eq('zone', zone).range(bas, bas + 199);
    if (error || !data?.length) break;
    for (const r of data) { if (r.h) parcaYaz(z, r.cx, r.cz, r.h); if ((r.b || r.w) && karoYaz(z, r.cx, r.cz, r.b, r.w)) z.yuzeyGerek = true; n++; }
    if (data.length < 200) break;
  }
  return n;
}
function parcaYaz(z, cx, cz, h) {
  const { N, heights } = z;
  for (let i = 0; i < KOSE; i++) { const x = cx * PARCA + i; if (x >= N) break; for (let j = 0; j < KOSE; j++) { const k = cz * PARCA + j; if (k >= N) break; const v = h[i * KOSE + j]; if (Number.isFinite(v)) heights[x * N + k] = v; } }
}
/** yüzey boyası verisi: karo başına kütüphane katmanı (−1 yok) ve köşe başına karışım ağırlığı (0–255) */
const yzHazir = (z) => { z.yzK ||= new Int16Array(z.N * z.N).fill(-1); z.yzW ||= new Uint8Array(z.N * z.N); };
/** parça: b = 32 × 32 katman, w = 33 × 33 ağırlık; döner: boyalı yüzey var mı */
function karoYaz(z, cx, cz, b, w) {
  yzHazir(z); const { N, yzK, yzW } = z; let var_ = false;
  if (b) for (let i = 0; i < PARCA; i++) { const x = cx * PARCA + i; if (x >= N - 1) break; for (let j = 0; j < PARCA; j++) { const k = cz * PARCA + j; if (k >= N - 1) break; let v = b[i * PARCA + j]; if (v == null) continue;
    if (v > 2000 || v < -1) { const t = ((v >>> 0) >>> 11) & 1023; v = t >= YUZEY_TABAN ? t - YUZEY_TABAN : -1; if (v >= 0 && !w) { for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) yzW[(x + a) * N + k + c] = 255; } }   // eski biçim (tam karo kimliği)
    yzK[x * N + k] = v; if (v >= 0) var_ = true; } }
  if (w) for (let i = 0; i < KOSE; i++) { const x = cx * PARCA + i; if (x >= N) break; for (let j = 0; j < KOSE; j++) { const k = cz * PARCA + j; if (k >= N) break; const v = w[i * KOSE + j]; if (v != null) yzW[x * N + k] = v; } }
  return var_;
}
function karoOku(z, cx, cz) {
  yzHazir(z); const { N, yzK, yzW } = z, b = new Array(PARCA * PARCA), w = new Array(KOSE * KOSE);
  for (let i = 0; i < PARCA; i++) for (let j = 0; j < PARCA; j++) { const x = Math.min(N - 2, cx * PARCA + i), k = Math.min(N - 2, cz * PARCA + j); b[i * PARCA + j] = yzK[x * N + k]; }
  for (let i = 0; i < KOSE; i++) for (let j = 0; j < KOSE; j++) { const x = Math.min(N - 1, cx * PARCA + i), k = Math.min(N - 1, cz * PARCA + j); w[i * KOSE + j] = yzW[x * N + k]; }
  return { b, w };
}
function parcaOku(z, cx, cz) {
  const { N, heights } = z, h = new Array(KOSE * KOSE);
  for (let i = 0; i < KOSE; i++) for (let j = 0; j < KOSE; j++) { const x = Math.min(N - 1, cx * PARCA + i), k = Math.min(N - 1, cz * PARCA + j); h[i * KOSE + j] = Math.round(heights[x * N + k] * 100) / 100; }
  return h;
}

// fırçalar: KO koordinatında daire; f(r) yumuşak düşüş (merkez 1, kenar 0)
export const FIRCALAR = [
  ['yukselt', 'Yükselt', '▲'], ['alcalt', 'Alçalt', '▼'], ['duzlestir', 'Düzleştir', '▬'], ['yumusat', 'Yumuşat', '≈'], ['purtuz', 'Pürüz', '✶'],
  ['tepe', 'Tepe', '◠'], ['sivri', 'Sivri dağ', '⛰'], ['siradag', 'Sıradağ', '⩙'], ['plato', 'Plato', '⊓'], ['krater', 'Krater', '◡'], ['cukur', 'Çukur', '∪'],
  ['yuzey', 'Yüzey boya', '▦'], ['yuzeysil', 'Yüzey sil', '⌫'],
];

/** realtime eşitleme + fırça uygulaması (her oyuncuda eşitleme; fırça yalnız GM) */
export function initArazi({ sb, zone, state, z, terrain, character, hud, yuzeyGerekli = () => {} }) {
  yzHazir(z);
  z.hOrj ||= z.heights.slice();
  const { N, heights, yzK, yzW, hOrj } = z, T = z.meta.tileSize;
  const kirliB = new Set();   // karo bilgisi değişen parçalar
  const g = gurultu(911);
  const kirli = new Set();   // kaydedilecek parçalar 'cx,cz'
  let kayitT = 0, vurus = null, kaydediliyor = false, kendiSifir = -1e9;
  const geri = [], ileri = [];
  const yenile = (x0, z0, x1, z1) => terrain.userData.yenile?.(x0, z0, x1, z1);

  // ---- gerçek zamanlı: başka bir GM'in düzenlemesi
  try {
    sb?.channel('arazi-' + zone).on('postgres_changes', { event: '*', schema: 'public', table: 'arazi_parca', filter: `zone=eq.${zone}` }, (p) => {
      if (p.eventType === 'DELETE') { if (performance.now() - kendiSifir < 8000) return; const o = p.old; if (o?.cx != null) { parcaOzgun(o.cx, o.cz); yenile(o.cx * PARCA, o.cz * PARCA, o.cx * PARCA + PARCA, o.cz * PARCA + PARCA); } return; }   // sıfırlama: parça özgün haline
      const r = p.new; if (!r?.h && !r?.b && !r?.w) return;
      if (Number(r.guncelleyen) === Number(character?.id) && (vurus || kirli.size || kirliB.size)) return;   // kendi yazdığımız (yerelde zaten var)
      if (r.h) parcaYaz(z, r.cx, r.cz, r.h);
      if ((r.b || r.w) && karoYaz(z, r.cx, r.cz, r.b, r.w)) yuzeyGerekli();
      yenile(r.cx * PARCA, r.cz * PARCA, r.cx * PARCA + PARCA, r.cz * PARCA + PARCA);
    }).subscribe();
  } catch {}

  function kaydetPlanla() { clearTimeout(kayitT); kayitT = setTimeout(kaydet, 300); }
  async function kaydet() {
    if (kaydediliyor) return kaydetPlanla();
    if (!kirli.size && !kirliB.size) return;
    kaydediliyor = true;
    const liste = [...new Set([...kirli, ...kirliB])].slice(0, 48), hK = new Set(liste.filter((k) => kirli.has(k))), bK = new Set(liste.filter((k) => kirliB.has(k)));
    liste.forEach((k) => { kirli.delete(k); kirliB.delete(k); });
    const parcalar = liste.map((k) => { const [cx, cz] = k.split(',').map(Number); return { cx, cz, ...(hK.has(k) ? { h: parcaOku(z, cx, cz) } : {}), ...(bK.has(k) ? karoOku(z, cx, cz) : {}) }; });
    try {
      const { data, error } = await sb.rpc('gm_arazi_kaydet', { p_char: character.id, p_zone: zone, p_parcalar: parcalar });
      if (error || !data?.ok) { hud?.notice?.(data?.reason || error?.message || 'The terrain could not be saved.', 'hata'); hK.forEach((k) => kirli.add(k)); bK.forEach((k) => kirliB.add(k)); }
    } catch { hK.forEach((k) => kirli.add(k)); bK.forEach((k) => kirliB.add(k)); }
    kaydediliyor = false;
    if (kirli.size || kirliB.size) kaydetPlanla();
  }
  const isaretle = (x, k) => {   // köşe → onu içeren tüm parçalar (sınırdaki köşe iki parçada)
    const ax = Math.floor(x / PARCA), az = Math.floor(k / PARCA);
    for (const cx of x % PARCA === 0 && x > 0 ? [ax - 1, ax] : [ax]) for (const cz of k % PARCA === 0 && k > 0 ? [az - 1, az] : [az]) if (cx * PARCA < N - 1 && cz * PARCA < N - 1) kirli.add(cx + ',' + cz);
  };
  const H = (x, k) => heights[Math.min(N - 1, Math.max(0, x)) * N + Math.min(N - 1, Math.max(0, k))];

  /** vuruş başlangıcı (fare basıldı): düzleştir / plato hedefi, geri alma kaydı */
  function basla(px, pz) {
    vurus = { eski: new Map(), eskiK: new Map(), eskiW: new Map(), hedef: state.heightAt?.(px, pz) ?? 0 };
    ileri.length = 0;
  }
  function bitir() {
    if (!vurus) return;
    if (vurus.eski.size || vurus.eskiK.size || vurus.eskiW.size) geri.push({ h: vurus.eski, k: vurus.eskiK, w: vurus.eskiW });   // sınırsız geri alma
    vurus = null; kaydetPlanla();
  }
  /** fırçayı uygula: (px, pz) KO dünya koordinatı; ayar: { yaricap (m), guc (m/sn), yukseklik (plato / düzleştir hedefi farkı) } */
  const isaretleB = (x, k) => {   // köşe ağırlığı → onu içeren parçalar
    const ax = Math.floor(x / PARCA), az = Math.floor(k / PARCA);
    for (const cx of x % PARCA === 0 && x > 0 ? [ax - 1, ax] : [ax]) for (const cz of k % PARCA === 0 && k > 0 ? [az - 1, az] : [az]) if (cx * PARCA < N - 1 && cz * PARCA < N - 1) kirliB.add(cx + ',' + cz);
  };
  /** yüzey boyası: köşe ağırlıkları yumuşak fırçayla artar (sil: azalır), fırçanın değdiği karolar seçilen kütüphane yüzeyine geçer */
  function yuzeyBoya(px, pz, ayar, dt, sil) {
    const R = Math.max(1, ayar.yaricap || 10), L = Math.max(0, ayar.yuzey | 0), hiz = Math.min(1, (ayar.guc || 10) * Math.min(0.1, dt || 1 / 60) * 0.35);
    const x0 = Math.max(0, Math.floor((px - R) / T)), x1 = Math.min(N - 1, Math.ceil((px + R) / T));
    const k0 = Math.max(0, Math.floor((pz - R) / T)), k1 = Math.min(N - 1, Math.ceil((pz + R) / T));
    let n = 0;
    for (let x = x0; x <= x1; x++) for (let k = k0; k <= k1; k++) {
      const r = Math.hypot(x * T - px, k * T - pz) / R; if (r >= 1) continue;
      const f = r < 0.5 ? 1 : 1 - ((r - 0.5) / 0.5) ** 2 * (3 - 2 * (r - 0.5) / 0.5), i = x * N + k, w0 = yzW[i];
      const w1 = sil ? Math.max(0, Math.round(w0 - 255 * f * hiz)) : Math.max(w0, Math.min(255, Math.round(w0 + (255 * f - w0) * hiz)));
      if (w1 !== w0) { if (!vurus.eskiW.has(i)) vurus.eskiW.set(i, w0); yzW[i] = w1; isaretleB(x, k); n++; }
      // köşeye değen karolar (sol-alt köşesi bu köşe olan dört karo) seçilen yüzeye geçer
      if (!sil && f > 0.02) for (const [a, c] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const tx = x + a, tz = k + c; if (tx < 0 || tz < 0 || tx >= N - 1 || tz >= N - 1) continue;
        const ti = tx * N + tz; if (yzK[ti] === L) continue;
        if (!vurus.eskiK.has(ti)) vurus.eskiK.set(ti, yzK[ti]); yzK[ti] = L; kirliB.add(Math.floor(tx / PARCA) + ',' + Math.floor(tz / PARCA)); n++;
      }
    }
    if (n) { if (!sil) yuzeyGerekli(); yenile(x0, k0, x1, k1); kaydetPlanla(); }
    return n;
  }
  function boya(px, pz, arac, ayar, dt) {
    if (!vurus) basla(px, pz);
    if (arac === 'yuzey' || arac === 'yuzeysil') return yuzeyBoya(px, pz, ayar, dt, arac === 'yuzeysil');
    const R = Math.max(1, ayar.yaricap || 10), s = (ayar.guc || 10) * Math.min(0.1, dt || 1 / 60);
    const x0 = Math.max(0, Math.floor((px - R) / T)), x1 = Math.min(N - 1, Math.ceil((px + R) / T));
    const k0 = Math.max(0, Math.floor((pz - R) / T)), k1 = Math.min(N - 1, Math.ceil((pz + R) / T));
    const yeni = [];
    for (let x = x0; x <= x1; x++) for (let k = k0; k <= k1; k++) {
      const dx = x * T - px, dz = k * T - pz, r = Math.hypot(dx, dz) / R; if (r >= 1) continue;
      const f = 0.5 + 0.5 * Math.cos(Math.PI * r), i = x * N + k, h = heights[i];
      let v = h;
      switch (arac) {
        case 'yukselt': v = h + s * f; break;
        case 'alcalt': v = h - s * f; break;
        case 'duzlestir': v = h + (vurus.hedef + (ayar.yukseklik || 0) - h) * Math.min(1, s * 0.08 * f); break;
        case 'yumusat': { const o = (H(x - 1, k) + H(x + 1, k) + H(x, k - 1) + H(x, k + 1)) / 4; v = h + (o - h) * Math.min(1, s * 0.12 * f); break; }
        case 'purtuz': v = h + g.deger(x * 0.9, k * 0.9) * s * 0.6 * f; break;
        case 'tepe': v = h + s * Math.exp(-r * r * 4); break;
        case 'sivri': v = h + s * 1.6 * Math.pow(1 - r, 2.2) * (0.75 + 0.5 * g.sirt(x / 9, k / 9)); break;
        case 'siradag': v = h + s * 1.3 * f * Math.pow(g.sirt(x / 14, k / 14, 4), 2.5) * 2; break;
        case 'plato': { const ust = vurus.hedef + (ayar.yukseklik || 15), w = r < 0.65 ? 1 : 1 - (r - 0.65) / 0.35; if (h < ust) v = Math.min(ust, h + s * 1.5 * w); break; }
        case 'krater': { const halka = Math.exp(-Math.pow((r - 0.62) / 0.14, 2)); v = h + s * (halka * 1.2 - (r < 0.5 ? (1 - r / 0.5) * 1.4 : 0)); break; }
        case 'cukur': v = h - s * 1.2 * (r < 0.7 ? 1 : 1 - (r - 0.7) / 0.3); break;
        default: break;
      }
      v = Math.max(-1000, Math.min(3000, v));
      if (v === h) continue;
      if (!vurus.eski.has(i)) vurus.eski.set(i, h);
      heights[i] = v; yeni.push(i); isaretle(x, k);
    }
    if (yeni.length) { yenile(x0, k0, x1, k1); kaydetPlanla(); }
    return yeni.length;
  }
  function geriAl(yon = -1) {
    const y = yon < 0 ? geri : ileri, k = y.pop(); if (!k) return false;
    const karsi = { h: new Map(), k: new Map(), w: new Map() };
    let a0 = N, a1 = 0, b0 = N, b1 = 0;
    const kutu = (x, kk) => { a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, kk); b1 = Math.max(b1, kk); };
    for (const [i, h] of k.h) { karsi.h.set(i, heights[i]); heights[i] = h; const x = Math.floor(i / N), kk = i % N; isaretle(x, kk); kutu(x, kk); }
    for (const [i, v] of k.k || []) { karsi.k.set(i, yzK[i]); yzK[i] = v; const x = Math.floor(i / N), kk = i % N; kirliB.add(Math.floor(x / PARCA) + ',' + Math.floor(kk / PARCA)); kutu(x, kk); }
    for (const [i, v] of k.w || []) { karsi.w.set(i, yzW[i]); yzW[i] = v; const x = Math.floor(i / N), kk = i % N; isaretleB(x, kk); kutu(x, kk); }
    (yon < 0 ? ileri : geri).push(karsi);
    yenile(a0, b0, a1, b1); kaydetPlanla();
    return true;
  }
  /** parçayı özgün araziye döndür (yükseklik + boya) */
  function parcaOzgun(cx, cz) {
    for (let i = 0; i <= PARCA; i++) { const x = cx * PARCA + i; if (x >= N) break; for (let j = 0; j <= PARCA; j++) { const k = cz * PARCA + j; if (k >= N) break; const q = x * N + k; heights[q] = hOrj[q]; yzW[q] = 0; if (i < PARCA && j < PARCA) yzK[q] = -1; } }
  }
  /** haritadaki tüm arazi düzenlemelerini kaldır (yükseklik + yüzey boyası): tek geri alma adımı; sunucu tarafı gm_arazi_sifirla */
  function sifirla() {
    kendiSifir = performance.now();
    const e = { h: new Map(), k: new Map(), w: new Map() };
    for (let q = 0; q < N * N; q++) {
      if (heights[q] !== hOrj[q]) { e.h.set(q, heights[q]); heights[q] = hOrj[q]; }
      if (yzK[q] !== -1) { e.k.set(q, yzK[q]); yzK[q] = -1; }
      if (yzW[q] !== 0) { e.w.set(q, yzW[q]); yzW[q] = 0; }
    }
    kirli.clear(); kirliB.clear(); clearTimeout(kayitT);
    if (e.h.size || e.k.size || e.w.size) { geri.push(e); ileri.length = 0; }
    yenile(0, 0, N - 1, N - 1);
    return e.h.size + e.k.size + e.w.size;
  }
  return { boya, basla, bitir, geriAl, kaydet, sifirla, get bekleyen() { return kirli.size + kirliB.size; }, get geriVar() { return geri.length > 0; }, get ileriVar() { return ileri.length > 0; }, N, T };
}
