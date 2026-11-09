// MineGuard (istemci tarafı): hile / düzen bozan eylem gözcüsü. Kararı sunucu verir (mg_bildir → mg_olay, gerekirse ceza puanı).
//  • Otomasyon: navigator.webdriver (Selenium / Puppeteer / Playwright), başsız tarayıcı imzası
//  • Enjeksiyon: tarayıcıya ait olmayan yazılımla eylem girişimi — sayfaya sonradan sokulan betiklerin ürettiği güvenilmez
//    (isTrusted = false) tuş / fare olayları
//  • Makro: aynı tuşa ya da aynı ekran noktasına insan olmayacak kadar düzenli aralıklarla basılması (değişim katsayısı çok düşük)
//  • Hız: sürekli saniyede 25+ eylem
//  • Küfür / hakaret: sohbet iletisi gönderilmeden süzülür (yıldızlanır), sunucuya bildirilir (sunucu listeyle yeniden denetler)
// Ayrıca MineGuard / GM ceza puanı bildirimi ekranın ortasında kırmızı uyarı olarak gösterilir.
export function initMineGuard({ sb, character, hud, addLine }) {
  const son = new Map();   // tür → son bildirim zamanı (istemci kısıtı; sunucu da birleştirir)
  const bildir = (tur, detay = {}) => {
    const n = Date.now(); if (n - (son.get(tur) || 0) < 3 * 60 * 1000) return; son.set(tur, n);
    Promise.resolve(sb.rpc('mg_bildir', { p_char: character.id, p_tur: tur, p_detay: detay })).catch(() => {});
  };
  let ayar = { aktif: true, kufur: [] };
  Promise.resolve(sb.rpc('mg_istemci')).then(({ data }) => { if (data) ayar = data; }, () => {});

  // ---- otomasyon
  setTimeout(() => {
    const ua = navigator.userAgent || '';
    if (navigator.webdriver === true || /HeadlessChrome|PhantomJS|Electron\/.*Puppeteer/i.test(ua)) bildir('otomasyon', { webdriver: !!navigator.webdriver, ua: ua.slice(0, 160) });
  }, 15000);

  // ---- enjeksiyon: güvenilmez tuş / fare olayları (oyunun kendisi bu türleri yapay olarak üretmez)
  let sahte = [];
  const sahteKontrol = (e) => {
    if (e.isTrusted) return;
    const n = performance.now(); sahte.push(n); sahte = sahte.filter((t) => n - t < 60000);
    if (sahte.length >= 5) { bildir('enjeksiyon', { olay: e.type, adet: sahte.length, tus: e.key || null }); sahte = []; }
  };
  for (const t of ['keydown', 'keyup', 'pointerdown', 'mousedown']) addEventListener(t, sahteKontrol, true);

  // ---- makro + hız: aynı tuş / aynı nokta için aralık düzenliliği
  const tuslar = new Map();   // tuş → zaman damgaları
  let noktalar = [], hepsi = [];
  const cv = (a) => { if (a.length < 2) return 1; const m = a.reduce((x, y) => x + y, 0) / a.length; if (m <= 0) return 1; const s = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); return s / m; };
  const aralik = (z) => z.slice(1).map((t, i) => t - z[i]);
  function eylem(anahtar, n) {
    hepsi.push(n); hepsi = hepsi.filter((t) => n - t < 3000);
    if (hepsi.length > 75) bildir('hiz', { eylem_sn: Math.round(hepsi.length / 3) });
    const z = tuslar.get(anahtar) || []; z.push(n); while (z.length > 31) z.shift(); tuslar.set(anahtar, z);
    if (z.length >= 31) {
      const a = aralik(z), m = a.reduce((x, y) => x + y, 0) / a.length, k = cv(a);
      if (m > 40 && m < 4000 && k < 0.035) { bildir('makro', { tus: anahtar, ort_ms: Math.round(m), cv: +k.toFixed(4), ornek: a.length }); z.length = 0; }
    }
  }
  addEventListener('keydown', (e) => { if (!e.isTrusted || e.repeat) return; if (/^(INPUT|TEXTAREA)$/.test(e.target?.tagName)) return; eylem('t:' + e.code, performance.now()); }, true);
  addEventListener('pointerdown', (e) => {
    if (!e.isTrusted || e.target?.id !== 'sahne') return;
    const n = performance.now(); noktalar.push({ x: e.clientX, y: e.clientY, n }); while (noktalar.length > 26) noktalar.shift();
    if (noktalar.length >= 26 && noktalar.every((p) => p.x === noktalar[0].x && p.y === noktalar[0].y)) {
      const a = aralik(noktalar.map((p) => p.n)), k = cv(a);
      if (k < 0.06) { bildir('makro', { tik: `${noktalar[0].x},${noktalar[0].y}`, cv: +k.toFixed(4), ornek: a.length }); noktalar = []; }
    }
    eylem('f:' + e.button, n);
  }, true);

  // ---- sohbet süzgeci: küfür / hakaret yıldızlanır, sunucuya bildirilir
  // sözcük bazlı: tek sözcük → aynı sözcük ya da (4+ harfse) o kökle başlayan sözcük; çok sözcüklü → ifade olarak geçiyorsa
  const kufurBul = (t) => {
    const k = String(t).toLocaleLowerCase('tr'), toks = k.split(/[^0-9a-zçğıöşü]+/i).filter(Boolean);
    return (ayar.kufur || []).map((w) => String(w).toLocaleLowerCase('tr').trim()).filter((w) => w && (w.includes(' ') ? ` ${toks.join(' ')} `.includes(` ${w} `) : toks.some((x) => x === w || (w.length >= 4 && x.startsWith(w)))));
  };
  window.__mgSohbet = (text) => {
    if (!ayar.aktif) return text;
    const bul = kufurBul(text); if (!bul.length) return text;
    bildir('kufur', { metin: String(text).slice(0, 200) });
    let t = String(text);
    t = t.split(/(\s+)/).map((x) => { const l = x.toLocaleLowerCase('tr').replace(/[^0-9a-zçğıöşü]/gi, ''); return bul.some((w) => !w.includes(' ') && (l === w || (w.length >= 4 && l.startsWith(w)))) ? '*'.repeat(x.length) : x; }).join('');
    for (const w of bul) if (w.includes(' ')) t = t.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => '*'.repeat(m.length));
    return t;
  };

  /** ceza puanı bildirimi: ekranın ortasında kırmızı uyarı (bölge giriş yazısı gibi) + sohbet satırı */
  function uyari(v = {}) {
    const el = document.createElement('div'); el.className = 'maden-orta-yazi mg-uyari';
    const baslik = v.kaynak === 'mineguard' ? 'Suspicious activity detected!' : 'GM warning!';
    el.innerHTML = `<b>${baslik}</b><span>${Number(v.puan) || 0} penalty points have been added to your account.</span>${v.neden ? `<i>${String(v.neden).replace(/[&<>"]/g, '')}</i>` : ''}`;
    document.body.append(el); void el.offsetWidth; el.classList.add('gor');
    setTimeout(() => el.classList.remove('gor'), 6500); setTimeout(() => el.remove(), 8000);
    addLine?.(null, `[MineGuard] ${baslik} ${v.puan} penalty points have been added to your account${v.neden ? ` (${v.neden})` : ''}. Total: ${v.toplam}`, 0, 'mg-satir');
    hud?.notice?.(`MineGuard: +${v.puan} penalty points (total ${v.toplam})`, 'hata');
  }
  return { uyari, bildir };
}
