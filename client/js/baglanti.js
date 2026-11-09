// Bağlantı denetimi: sunucuya gecikme (RTT) yoklaması, bölge kanalı durumu ve tarayıcı çevrimiçi bilgisi.
//  - İşlem bilgileri (aksiyon) kutusunun üstünde: Wi-Fi simgesi (yeşil iyi → sarı → kırmızı yavaş, X koptu) + "FPS: n · ms"
//    (yazı rengi bağlantı kalitesine göre yeşilden kırmızıya geçişli).
//  - Bağlantı yavaşlar ya da koparsa "Sunucuya yeniden bağlanılıyor…" penceresi; düzelmezse (PvP bölgesinde 10 sn, diğerlerinde 20 sn)
//    "Disconnected from server" uyarısı → sunucu seçme ekranına döner (sayfa yenilenir).
export function initBaglanti({ sb, state, hud = null, pvp = false, onKopma = () => {} }) {
  // (4.11) kopma eşikleri gevşetildi: sunucu anlık yavaşlayınca (8 sn'ye varan sorgu) oyuncu atılmasın — yalnız gerçekten ulaşılamıyorsa
  const YOKLAMA = 2000, ZAMAN_ASIMI = 9000, YAVAS = 600, COK_YAVAS = 2500;
  const KOPMA_SURE = pvp ? 25000 : 45000;
  let gizliBit = 0;   // sekme arka plandayken zamanlayıcılar kısılır → ölçümler yanıltıcı; görünür olunca birkaç sn tolerans
  let rtt = null, hata = 0, kanalKopuk = 0, kopukBas = 0, bitti = false, fps = 0;

  // ---- gösterge
  const el = document.createElement('div'); el.id = 'baglanti-gosterge';
  el.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path class="bg-a3" d="M2 9.5a15 15 0 0 1 20 0" /><path class="bg-a2" d="M5.5 13a10 10 0 0 1 13 0" /><path class="bg-a1" d="M9 16.5a5 5 0 0 1 6 0" />
    <circle class="bg-n" cx="12" cy="20" r="1.6" /><g class="bg-x"><path d="M15 3l7 7M22 3l-7 7" /></g></svg><b class="bg-fps">FPS: --</b>`;
  el.title = 'Connection';
  document.body.append(el);
  // işlem bilgileri kutusunun hemen üstüne yerleşir (kutu ölçeklenebilir / taşınabilir → her saniye yeniden hesaplanır)
  const yerlestir = () => {
    const kutu = document.querySelector('.ko-info:not([hidden]), .ko-info-re:not([hidden]), #bilgi-mesajlar');
    const r = kutu?.getBoundingClientRect();
    if (r && r.width > 0) { el.style.left = 'auto'; el.style.right = Math.max(4, Math.round(innerWidth - r.right + 4)) + 'px'; el.style.top = Math.round(r.top - 24) + 'px'; el.style.bottom = 'auto'; }   // kutunun sağ üst köşesi (ekranın sağı)
    else { el.style.right = '8px'; el.style.bottom = '250px'; el.style.left = 'auto'; el.style.top = 'auto'; }
  };

  // ---- FPS
  let kare = 0, kareBas = performance.now();
  const say = () => { kare++; const now = performance.now(); if (now - kareBas >= 1000) { fps = Math.round(kare * 1000 / (now - kareBas)); kare = 0; kareBas = now; } if (!bitti) requestAnimationFrame(say); };
  requestAnimationFrame(say);

  // kalite 0 (kötü) … 1 (iyi) → yeşilden kırmızıya renk
  const kalite = () => { if (durum() === 'kopuk') return 0; if (rtt == null) return 0.8; return Math.max(0, Math.min(1, 1 - (rtt - 120) / (COK_YAVAS - 120))); };
  const renk = (q) => `hsl(${Math.round(q * 120)}, 85%, 55%)`;
  function durum() {
    if (!navigator.onLine) return 'kopuk';
    if (hata >= 3) return 'kopuk';   // art arda 3 yoklama (≥ ~6-27 sn) yanıtsız
    // bölge kanalı (realtime) kopukluğu tek başına atmaz: kütüphane kendisi yeniden bağlanır; sunucu yanıt veriyorsa yalnız "yavaş"
    if (kanalKopuk && performance.now() - kanalKopuk > 5000 && hata >= 1) return 'kopuk';
    if (hata >= 1 || (rtt != null && rtt >= YAVAS) || (kanalKopuk && performance.now() - kanalKopuk > 5000)) return 'yavas';
    return 'iyi';
  }
  function ciz() {
    const d = durum(), q = kalite(), c = renk(q);
    el.dataset.durum = d; el.style.setProperty('--bg-renk', d === 'kopuk' ? '#ff3b30' : d === 'yavas' ? '#ff5a3c' : '#35e06a');
    // sinyal çubukları: kaliteye göre 1-3 yay
    const yay = d === 'kopuk' ? 0 : q > 0.66 ? 3 : q > 0.33 ? 2 : 1;
    el.querySelector('.bg-a1').style.opacity = yay >= 1 ? 1 : 0.25; el.querySelector('.bg-a2').style.opacity = yay >= 2 ? 1 : 0.25; el.querySelector('.bg-a3').style.opacity = yay >= 3 ? 1 : 0.25;
    const f = el.querySelector('.bg-fps'); f.textContent = `FPS: ${fps}${rtt != null && d !== 'kopuk' ? ` · ${Math.round(rtt)} ms` : d === 'kopuk' ? ' · offline' : ''}`; f.style.color = c;
    el.title = d === 'kopuk' ? 'Disconnected' : d === 'yavas' ? `Slow connection (${Math.round(rtt || 0)} ms)` : `Connection good (${Math.round(rtt || 0)} ms)`;
  }

  // ---- yoklama: son 5 ölçümün ortancası (tek seferlik takılmalar ping'i şişirmez)
  const olcumler = [];
  const olcEkle = (ms) => { olcumler.push(ms); if (olcumler.length > 5) olcumler.shift(); const sr = [...olcumler].sort((a, b) => a - b); rtt = sr[Math.floor(sr.length / 2)]; };
  async function yokla() {
    if (bitti) return;
    const t0 = performance.now();
    try {
      const sonuc = await Promise.race([sb.rpc('baglanti_ping', {}), new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı')), ZAMAN_ASIMI))]);
      // sunucu yanıt verdiyse (işlev hatası dahil) bağlantı var sayılır; yalnız ağ hatası (fetch) kopukluktur
      if (sonuc?.error && /fetch|network|ağ|load failed|timeout/i.test(String(sonuc.error.message || sonuc.error))) throw sonuc.error;
      olcEkle(performance.now() - t0); hata = 0;
    } catch (e) {
      if (/zaman aşımı|fetch|network|load failed|timeout/i.test(String(e?.message || e))) hata = Math.min(hata + 1, 9);
      else { olcEkle(performance.now() - t0); hata = 0; }   // ağ dışı hata: sunucuya ulaşıldı
    }
    degerlendir();
  }
  // ---- yeniden bağlanma penceresi / kopma
  // KO re_messagebox görünümünde (hud.koKutu); KO arayüzü yoksa basit panel
  let pen = null;
  const pencere = (ac, alt = '') => {
    if (ac && !pen) {
      const k = hud?.koKutu?.({ baslik: 'Connection', metin: 'Reconnecting…' });
      if (k) pen = { kutu: k, remove: () => k.kapat() };
      else {
        pen = document.createElement('div'); pen.id = 'baglanti-pencere';
        pen.innerHTML = '<div class="ko-panel"><div class="bp-baslik">Connection</div><div class="bp-donen"></div><p>Reconnecting…</p><small></small></div>';
        document.body.append(pen);
      }
    }
    if (ac && pen) {
      if (pen.kutu) { const n = Math.floor(performance.now() / 500) % 4; pen.kutu.yaz(`Reconnecting${'.'.repeat(n)}${alt ? '\n' + alt : ''}`); }
      else pen.querySelector('small').textContent = alt;
    }
    if (!ac && pen) { pen.remove(); pen = null; }
  };
  function degerlendir() {
    if (bitti) return;
    if (document.hidden || performance.now() < gizliBit) { kopukBas = 0; ciz(); return; }   // arka planda / yeni döndüyse kopma sayılmaz
    const d = durum(), cokYavas = rtt != null && rtt >= COK_YAVAS;
    ciz();
    if (d === 'kopuk' || cokYavas) {
      if (!kopukBas) kopukBas = performance.now();
      const kalan = Math.max(0, Math.ceil((KOPMA_SURE - (performance.now() - kopukBas)) / 1000));
      pencere(true, d === 'kopuk' ? `${kalan}s` : `Slow connection (${Math.round(rtt)} ms)`);
      if (d === 'kopuk' && performance.now() - kopukBas >= KOPMA_SURE) kop();
    } else { kopukBas = 0; pencere(false); }
  }
  function kop() {
    if (bitti) return; bitti = true; pencere(false); ciz();
    if (window.__koKicked) return;   // oturum uyarısı zaten açık
    try { window.__koKopuk = true; } catch {}
    try { onKopma(); } catch {}
    try { state?.net?.halt?.(); } catch {}
    const git = () => { try { window.__koKicked = true; } catch {} location.href = 'index.html'; };   // oturum açık → sunucu listesi (sayfa yenilenir)
    // KO: "Disconnected from server." mesaj kutusu (Tamam → sunucu seçimi)
    const k = hud?.koKutu?.({ baslik: 'Disconnected', metin: 'Disconnected from server.', buton: 'OK', onButon: git, perde: true });
    if (k) k.el.classList.add('ko-kutu-koptu');
    else {
      const d = document.createElement('div'); d.id = 'baglanti-pencere'; d.className = 'bp-koptu';
      d.innerHTML = '<div class="ko-panel"><div class="bp-baslik">Disconnected</div><p>Disconnected from server.</p><button class="ko-btn">OK</button></div>';
      document.body.append(d); d.querySelector('button').onclick = git;
    }
    setTimeout(git, 8000);
  }

  addEventListener('online', () => { hata = 0; yokla(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) return; gizliBit = performance.now() + 8000; hata = 0; kopukBas = 0; if (kanalKopuk) kanalKopuk = performance.now(); yokla(); });
  addEventListener('offline', () => degerlendir());
  const t1 = setInterval(yokla, YOKLAMA), t2 = setInterval(() => { yerlestir(); degerlendir(); }, 1000);
  setTimeout(yokla, 500); yerlestir(); ciz();
  return {
    /** bölge kanalı durumu (net.js onBaglanti) */
    /** test: pencereleri göster ('yavas' | 'kop') */
    _test(t) { if (t === 'kop') kop(); else pencere(true, 'Bağlantı çok yavaş (2400 ms).'); },
    kanal(status) { if (status === 'SUBSCRIBED') kanalKopuk = 0; else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) && !kanalKopuk) kanalKopuk = performance.now(); degerlendir(); },
    durum, rtt: () => rtt,
    dur() { bitti = true; clearInterval(t1); clearInterval(t2); el.remove(); pencere(false); },
  };
}
