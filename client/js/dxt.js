// S3TC desteklemeyen cihazlar (mobil) için DXT1/3/5 → RGBA8 çözücü
function c565(c, o, i) { o[i] = ((c >> 11) & 31) * 255 / 31 | 0; o[i + 1] = ((c >> 5) & 63) * 255 / 63 | 0; o[i + 2] = (c & 31) * 255 / 31 | 0; }

export function decodeDXT(src, fmt, w, h) {
  const out = new Uint8Array(w * h * 4);
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  const pal = new Uint8Array(16);
  let s = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const cs = fmt === 'dxt1' ? s : s + 8;
    const c0 = dv.getUint16(cs, true), c1 = dv.getUint16(cs + 2, true), bits = dv.getUint32(cs + 4, true);
    c565(c0, pal, 0); c565(c1, pal, 4); pal[3] = pal[7] = 255;
    if (c0 > c1 || fmt !== 'dxt1') {
      for (let k = 0; k < 3; k++) { pal[8 + k] = (2 * pal[k] + pal[4 + k]) / 3 | 0; pal[12 + k] = (pal[k] + 2 * pal[4 + k]) / 3 | 0; }
      pal[11] = pal[15] = 255;
    } else {
      for (let k = 0; k < 3; k++) { pal[8 + k] = (pal[k] + pal[4 + k]) >> 1; pal[12 + k] = 0; }
      pal[11] = 255; pal[15] = 0;
    }
    for (let i = 0; i < 16; i++) {
      const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2); if (x >= w || y >= h) continue;
      const k = ((bits >>> (2 * i)) & 3) * 4, o = (y * w + x) * 4;
      out[o] = pal[k]; out[o + 1] = pal[k + 1]; out[o + 2] = pal[k + 2]; out[o + 3] = pal[k + 3];
    }
    if (fmt === 'dxt3') {
      for (let i = 0; i < 16; i++) {
        const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2); if (x >= w || y >= h) continue;
        out[(y * w + x) * 4 + 3] = ((src[s + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
      }
    } else if (fmt === 'dxt5') {
      const a0 = src[s], a1 = src[s + 1]; const lut = [a0, a1];
      if (a0 > a1) for (let i = 1; i < 7; i++) lut.push(((7 - i) * a0 + i * a1) / 7 | 0);
      else { for (let i = 1; i < 5; i++) lut.push(((5 - i) * a0 + i * a1) / 5 | 0); lut.push(0, 255); }
      const lo = src[s + 2] | (src[s + 3] << 8) | (src[s + 4] << 16), hi = src[s + 5] | (src[s + 6] << 8) | (src[s + 7] << 16);
      for (let i = 0; i < 16; i++) {
        const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2); if (x >= w || y >= h) continue;
        const code = i < 8 ? (lo >> (3 * i)) & 7 : (hi >> (3 * (i - 8))) & 7;
        out[(y * w + x) * 4 + 3] = lut[code];
      }
    }
    s += fmt === 'dxt1' ? 8 : 16;
  }
  return out;
}

/** splitDXT'nin tersi: akışlara ayrılmış DXT verisini blok düzenine çevirir */
export function joinDXT(src, fmt) {
  const bs = fmt === 'dxt1' ? 8 : 16, n = src.length / bs, out = new Uint8Array(src.length);
  const c0 = bs === 16 ? n * 8 : 0, c1 = c0 + n * 2, ix = c1 + n * 2;
  for (let i = 0; i < n; i++) {
    let p = i * bs;
    if (bs === 16) { out.set(src.subarray(i * 8, i * 8 + 8), p); p += 8; }
    out[p] = src[c0 + i * 2]; out[p + 1] = src[c0 + i * 2 + 1];
    out[p + 2] = src[c1 + i * 2]; out[p + 3] = src[c1 + i * 2 + 1];
    out[p + 4] = src[ix + i * 4]; out[p + 5] = src[ix + i * 4 + 1]; out[p + 6] = src[ix + i * 4 + 2]; out[p + 7] = src[ix + i * 4 + 3];
  }
  return out;
}

// ── Mip üretimi ────────────────────────────────────────────────────────────
// Dosyalarda yalnızca en büyük seviye saklanır; küçük seviyeler burada
// (D3DX gibi 2x2 kutu filtresiyle, gama uzayında) üretilip yeniden DXT'ye kodlanır.

const q565 = (r, g, b) => ((r * 31 + 127.5) / 255 << 11) | ((g * 63 + 127.5) / 255 << 5) | ((b * 31 + 127.5) / 255);
const e565 = (c, o) => { o[0] = ((c >> 11) & 31) * 255 / 31; o[1] = ((c >> 5) & 63) * 255 / 63; o[2] = (c & 31) * 255 / 31; };

/** 4x4 blok (16 RGBA) → 8 baytlık renk bloğu. punch: DXT1 saydam kip (alfa < 128 → saydam) */
function encodeColorBlock(px, out, o, punch) {
  // ana eksen: min/max kutusunun köşegeni, eşdeğişkenliğe göre işaret düzeltmesi
  let mnR = 255, mnG = 255, mnB = 255, mxR = 0, mxG = 0, mxB = 0, n = 0, sR = 0, sG = 0, sB = 0;
  for (let i = 0; i < 16; i++) {
    const p = i * 4; if (punch && px[p + 3] < 128) continue;
    const r = px[p], g = px[p + 1], b = px[p + 2]; n++; sR += r; sG += g; sB += b;
    if (r < mnR) mnR = r; if (r > mxR) mxR = r; if (g < mnG) mnG = g; if (g > mxG) mxG = g; if (b < mnB) mnB = b; if (b > mxB) mxB = b;
  }
  if (n === 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; out[o + 4] = out[o + 5] = out[o + 6] = out[o + 7] = 0xff; return; }
  const aR = sR / n, aG = sG / n, aB = sB / n; let cRG = 0, cRB = 0, cGB = 0;
  for (let i = 0; i < 16; i++) {
    const p = i * 4; if (punch && px[p + 3] < 128) continue;
    const r = px[p] - aR, g = px[p + 1] - aG, b = px[p + 2] - aB; cRG += r * g; cRB += r * b; cGB += g * b;
  }
  let lo = [mnR, mnG, mnB], hi = [mxR, mxG, mxB];
  // yeşil baskın eksene göre: kırmızı veya mavi ters korelasyonluysa uçları değiştir
  if (cRG < 0) { const t = lo[0]; lo[0] = hi[0]; hi[0] = t; }
  if (cGB < 0) { const t = lo[2]; lo[2] = hi[2]; hi[2] = t; }
  else if (cRG >= 0 && cRB < 0 && Math.abs(cRB) > Math.abs(cGB)) { const t = lo[2]; lo[2] = hi[2]; hi[2] = t; }
  // kutuyu biraz içeri çek (stb_dxt gibi) — ara değerler daha iyi örnekler
  for (let k = 0; k < 3; k++) { const d = (hi[k] - lo[k]) / 16; hi[k] -= d; lo[k] += d; }
  let c0 = q565(Math.max(0, Math.min(255, hi[0])), Math.max(0, Math.min(255, hi[1])), Math.max(0, Math.min(255, hi[2])));
  let c1 = q565(Math.max(0, Math.min(255, lo[0])), Math.max(0, Math.min(255, lo[1])), Math.max(0, Math.min(255, lo[2])));
  const three = punch && n < 16;
  if (three ? c0 > c1 : c0 < c1) { const t = c0; c0 = c1; c1 = t; }
  // c0 === c1: tüm indeksler 0 olur, her iki kipte de doğru
  const A = new Float32Array(3), B = new Float32Array(3); e565(c0, A); e565(c1, B);
  const pal = three
    ? [A, B, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]]
    : [A, B, [(2 * A[0] + B[0]) / 3, (2 * A[1] + B[1]) / 3, (2 * A[2] + B[2]) / 3], [(A[0] + 2 * B[0]) / 3, (A[1] + 2 * B[1]) / 3, (A[2] + 2 * B[2]) / 3]];
  let bits = 0;
  for (let i = 15; i >= 0; i--) {
    const p = i * 4; let best = 0;
    if (three && px[p + 3] < 128) best = 3;
    else {
      let bd = 1e9;
      for (let k = 0; k < pal.length; k++) {
        const dr = px[p] - pal[k][0], dg = px[p + 1] - pal[k][1], db = px[p + 2] - pal[k][2], d = dr * dr * 2 + dg * dg * 4 + db * db;
        if (d < bd) { bd = d; best = k; }
      }
    }
    bits = (bits << 2) | best;
  }
  out[o] = c0 & 255; out[o + 1] = c0 >> 8; out[o + 2] = c1 & 255; out[o + 3] = c1 >> 8;
  out[o + 4] = bits & 255; out[o + 5] = (bits >>> 8) & 255; out[o + 6] = (bits >>> 16) & 255; out[o + 7] = (bits >>> 24) & 255;
}

/** 8 baytlık DXT5 alfa bloğu */
function encodeAlpha5(px, out, o) {
  let mn = 255, mx = 0; for (let i = 0; i < 16; i++) { const a = px[i * 4 + 3]; if (a < mn) mn = a; if (a > mx) mx = a; }
  out[o] = mx; out[o + 1] = mn;
  const lut = [mx, mn]; for (let i = 1; i < 7; i++) lut.push(((7 - i) * mx + i * mn) / 7);
  let lo = 0, hi = 0;
  for (let i = 0; i < 16; i++) {
    const a = px[i * 4 + 3]; let best = 0, bd = 1e9;
    if (mx !== mn) for (let k = 0; k < 8; k++) { const d = Math.abs(a - lut[k]); if (d < bd) { bd = d; best = k; } }
    if (i < 8) lo |= best << (3 * i); else hi |= best << (3 * (i - 8));
  }
  out[o + 2] = lo & 255; out[o + 3] = (lo >> 8) & 255; out[o + 4] = (lo >> 16) & 255;
  out[o + 5] = hi & 255; out[o + 6] = (hi >> 8) & 255; out[o + 7] = (hi >> 16) & 255;
}

/** RGBA → DXT blokları. fmt: dxt1|dxt3|dxt5; punch: DXT1'de 1 bit alfa */
export function encodeDXT(rgba, w, h, fmt, punch = false) {
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2), bs = fmt === 'dxt1' ? 8 : 16;
  const out = new Uint8Array(bw * bh * bs), px = new Uint8Array(64);
  let o = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    for (let i = 0; i < 16; i++) {
      const x = Math.min(w - 1, bx * 4 + (i & 3)), y = Math.min(h - 1, by * 4 + (i >> 2)), s = (y * w + x) * 4;
      px[i * 4] = rgba[s]; px[i * 4 + 1] = rgba[s + 1]; px[i * 4 + 2] = rgba[s + 2]; px[i * 4 + 3] = rgba[s + 3];
    }
    if (fmt === 'dxt3') {
      for (let i = 0; i < 8; i++) out[o + i] = ((px[i * 8 + 3] * 15 + 127) / 255 | 0) | (((px[i * 8 + 7] * 15 + 127) / 255 | 0) << 4);
      encodeColorBlock(px, out, o + 8, false, true);
    } else if (fmt === 'dxt5') { encodeAlpha5(px, out, o); encodeColorBlock(px, out, o + 8, false, true); }
    else encodeColorBlock(px, out, o, punch, false);
    o += bs;
  }
  return out;
}

/** 2x2 kutu filtresi. Alfa-testli dokularda (cutoff) kapsama oranı korunur — uzakta yapraklar erimez. */
export function downsample(src, w, h, cutoff = 0) {
  const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1), y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1);
    const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4, o = (y * nw + x) * 4;
    const wa = src[a + 3] + 1, wb = src[b + 3] + 1, wc = src[c + 3] + 1, wd = src[d + 3] + 1, ws = wa + wb + wc + wd;
    // renk alfa ağırlıklı (saydam piksellerin rengi kenarlara sızmasın)
    for (let k = 0; k < 3; k++) out[o + k] = (src[a + k] * wa + src[b + k] * wb + src[c + k] * wc + src[d + k] * wd) / ws + 0.5;
    out[o + 3] = (src[a + 3] + src[b + 3] + src[c + 3] + src[d + 3] + 2) >> 2;
  }
  if (cutoff > 0) preserveCoverage(src, w * h, out, nw * nh, cutoff);
  return out;
}

function coverage(p, n, t) { let c = 0; for (let i = 0; i < n; i++) if (p[i * 4 + 3] > t) c++; return c / n; }
function preserveCoverage(src, ns, dst, nd, cutoff) {
  const target = coverage(src, ns, cutoff);
  let lo = 0, hi = 4, best = 1;
  for (let it = 0; it < 10; it++) {   // alfa ölçeğini ikili aramayla bul
    const m = (lo + hi) / 2; let c = 0;
    for (let i = 0; i < nd; i++) if (Math.min(255, dst[i * 4 + 3] * m) > cutoff) c++;
    if (c / nd < target) lo = m; else { hi = m; best = m; }
  }
  if (best !== 1) for (let i = 0; i < nd; i++) dst[i * 4 + 3] = Math.min(255, dst[i * 4 + 3] * best + 0.5);
}

/**
 * Üst seviyeden (blok düzeninde) tam mip zinciri üretir.
 * Dönen: [{data, width, height}] — ilk eleman verilen üst seviye.
 */
export function buildMipChain(top, fmt, w, h, { punch = false, cutoff = 0 } = {}) {
  const levels = [{ data: top, width: w, height: h }];
  let rgba = decodeDXT(top, fmt, w, h), cw = w, ch = h;
  while (cw > 1 || ch > 1) {
    rgba = downsample(rgba, cw, ch, cutoff); cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
    levels.push({ data: encodeDXT(rgba, cw, ch, fmt, punch), width: cw, height: ch });
  }
  return levels;
}
