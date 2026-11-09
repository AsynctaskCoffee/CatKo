// (7.11) GM tablet modu (GM paneli → Ayarlar → Tablet modu): dokunmatik ekranda oyunu klavye / fare olmadan yönetmek için.
//  - Sağ kenarda yüzen düğme şeridi: GM paneli · Sohbet / komut (ekran klavyesi açılır) · H menüsü · Esc · Arayüzü gizle
//  - Oyun ekranı: dokun = tıkla, tek parmak sürükle = kamera, basılı tut = sağ tık, iki parmak = yakınlaş / döndür; sol altta joystick, sağ altta Z / R
//  - <html class="ko-tablet">: büyük dokunma hedefleri, sayfa yakınlaştırma / kaydırma kapalı (client.css)
const ANAHTAR = 'ko-gm-tablet';
export const tabletAcik = () => { try { return localStorage.getItem(ANAHTAR) === '1'; } catch { return false; } };
let serit = null, jest = null, kumanda = null, hover = null, joyApi = null;

function tus(code, key) {
  const ev = { code, key, bubbles: true, cancelable: true };
  document.activeElement?.blur?.();
  document.dispatchEvent(new KeyboardEvent('keydown', ev)); document.dispatchEvent(new KeyboardEvent('keyup', ev));
}

// tam ekran (iPad Safari: webkit önekli)
export const tamEkranda = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
export function tamEkranDegis() {
  const d = document, e = d.documentElement;
  try {
    if (tamEkranda()) return (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
    const r = (e.requestFullscreen || e.webkitRequestFullscreen)?.call(e, { navigationUI: 'hide' });
    r?.catch?.(() => {});
  } catch {}
}

// state verilmezse (lobi / sunucu listesi) yalnız görünüm sınıfı; oyunda (GM) düğme şeridi ve iki parmak kamera jesti de kurulur
export function tabletUygula({ state, acik = tabletAcik() } = {}) {
  try { localStorage.setItem(ANAHTAR, acik ? '1' : '0'); } catch {}
  document.documentElement.classList.toggle('ko-tablet', acik);
  const vp = document.querySelector('meta[name=viewport]');
  if (vp) vp.content = acik ? 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover' : 'width=device-width,initial-scale=1';
  if (acik && state) { seritKur(state); jestKur(state); kumandaKur(state); hoverKur(); } else if (!acik) { serit?.remove(); serit = null; jest?.(); jest = null; kumanda?.(); kumanda = null; hover?.(); hover = null; if (state) state.joy = null; }
  dispatchEvent(new CustomEvent('ko-tablet', { detail: acik }));
}

function seritKur(state) {
  if (serit?.isConnected) return;
  serit = document.createElement('div'); serit.id = 'ko-tablet-serit';
  serit.innerHTML = [['gm', 'GM', 'GM paneli'], ['sohbet', '💬', 'Sohbet / GM komutu'], ['h', 'H', 'H menüsü (komutlar)'], ['esc', 'Esc', 'Açık pencereyi kapat'], ['tam', '⛶', 'Tam ekran'], ['ui', '👁', 'Arayüzü gizle / göster']]
    .map(([k, t, ip]) => `<button data-k="${k}" title="${ip}">${t}</button>`).join('');
  serit.addEventListener('pointerdown', (e) => e.stopPropagation());
  serit.addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
    if (k === 'gm') return state?.gmWin?.toggle?.();
    if (k === 'sohbet') { const i = document.getElementById('sohbet-giris'); if (i) { i.closest('[hidden]')?.removeAttribute('hidden'); i.focus(); } return; }
    if (k === 'h') return tus('KeyH', 'h');
    if (k === 'esc') return tus('Escape', 'Escape');
    if (k === 'tam') return tamEkranDegis();
    if (k === 'ui') document.documentElement.classList.toggle('ko-tablet-ui-gizli');
  });
  document.body.append(serit);
}

// oyun tuvali dokunma jestleri (tablet modu):
//  - dokunuş = sol tık (yürü / NPC / mob / oyuncu seç), çift dokunuş = çift tık (moba saldır, NPC)
//  - tek parmakla basılı sürükleme = kamera yatay + dikey döner (karakter yürümez)
//  - kıpırdamadan basılı tutma (0,55 sn) = sağ tık (NPC / oyuncu menüsü, GM: kule / NPC düzenleme, sağ tık yeteneği)
//  - iki parmak: kıstır / aç = yakınlaş / uzaklaş, birlikte kaydır = döndür / eğ
function jestKur(state) {
  if (jest) return;
  const cv = document.getElementById('sahne'); if (!cv) return;
  const P = new Map(); let onceki = null, uzun = null, mod = null, sonTik = null, sonDokunus = 0;
  let J = null;   // joystick parmağı (ekranın sol %40'ı): { id, x0, y0, oyna }
  const ozet = () => { const [a, b] = [...P.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const uzunIptal = () => { clearTimeout(uzun); uzun = null; };
  const fare = (tip, button, x, y, extra = {}) => cv.dispatchEvent(new PointerEvent(tip, { pointerId: 9071, pointerType: 'mouse', isPrimary: false, button, buttons: tip === 'pointerdown' ? (button === 2 ? 2 : 1) : 0, clientX: x, clientY: y, bubbles: true, cancelable: true, ...extra }));
  const tikla = (button, x, y) => { fare('pointerdown', button, x, y); fare('pointerup', button, x, y); };
  const indir = (e) => {
    if (e.pointerType !== 'touch') return;
    e.stopImmediatePropagation(); e.preventDefault(); sonDokunus = performance.now();
    if (!J && joyApi && (!P.size || mod === 'kamera') && e.clientX < innerWidth * 0.4) {   // sol bölüm: joystick dokunulan yerde belirir (sağ elle kamera aynı anda çevrilebilir)
      J = { id: e.pointerId, x0: e.clientX, y0: e.clientY, oyna: false }; joyApi.bas(e.clientX, e.clientY); return;
    }
    P.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY });
    if (P.size === 1) {
      mod = null; uzunIptal();
      const id = e.pointerId, x = e.clientX, y = e.clientY;
      uzun = setTimeout(() => { uzun = null; if (P.size === 1 && P.has(id) && !mod) { mod = 'sag'; tikla(2, x, y); navigator.vibrate?.(15); } }, 550);
    } else { uzunIptal(); mod = 'iki'; onceki = ozet(); }
  };
  const oynat = (e) => {
    if (J && e.pointerId === J.id) { e.stopImmediatePropagation(); e.preventDefault(); if (!J.oyna && Math.hypot(e.clientX - J.x0, e.clientY - J.y0) > 8) J.oyna = true; if (J.oyna) joyApi?.it(e.clientX, e.clientY); return; }
    const p = P.get(e.pointerId); if (!p) return;
    e.stopImmediatePropagation(); e.preventDefault();
    p.x = e.clientX; p.y = e.clientY;
    if (P.size >= 2 && onceki) {
      const s = ozet();
      if (onceki.d > 10 && s.d > 10) state.camDist = Math.max(3, Math.min(12, state.camDist * (onceki.d / s.d)));
      state.camYaw += (s.x - onceki.x) * 0.006;
      state.camPitch = Math.max(0.05, Math.min(1.4, state.camPitch + (s.y - onceki.y) * 0.004));
      onceki = s; return;
    }
    if (!mod && Math.hypot(p.x - p.x0, p.y - p.y0) > 10) { mod = 'kamera'; uzunIptal(); }
    if (mod === 'kamera') {   // tek parmak: kamera hem yatayda hem dikeyde (fare sağ tuş sürüklemesi gibi, biraz daha hızlı)
      state.camYaw += (p.x - p.lx) * 0.0065;
      state.camPitch = Math.max(0.05, Math.min(1.4, state.camPitch + (p.y - p.ly) * 0.0045));
    }
    p.lx = p.x; p.ly = p.y;
  };
  const kaldir = (e) => {
    if (J && e.pointerId === J.id) {   // joystick parmağı kalktı: gizlenir; kıpırdamadıysa dokunuş (tıklama) sayılır
      e.stopImmediatePropagation(); const j = J; J = null; joyApi?.birak();
      if (!j.oyna && e.type === 'pointerup') tikla(0, j.x0, j.y0);
      return;
    }
    const p = P.get(e.pointerId); if (!p) return;
    e.stopImmediatePropagation(); P.delete(e.pointerId);
    if (P.size === 1) { onceki = null; const q = [...P.values()][0]; q.lx = q.x; q.ly = q.y; return; }   // ikinci parmak kalktı: kalan parmak kamerayı çevirir
    if (P.size) return;
    uzunIptal(); onceki = null;
    if (mod === null && e.type === 'pointerup') {   // dokunuş
      const t = performance.now(), cift = sonTik && t - sonTik.t < 380 && Math.hypot(p.x0 - sonTik.x, p.y0 - sonTik.y) < 32;
      tikla(0, p.x0, p.y0);
      if (cift) { cv.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: p.x0, clientY: p.y0, button: 0, detail: 2 })); sonTik = null; }
      else sonTik = { t, x: p.x0, y: p.y0 };
    }
    mod = null;
  };
  const dbl = (e) => { if (e.isTrusted && performance.now() - sonDokunus < 800) e.stopImmediatePropagation(); };   // tarayıcının dokunuştan ürettiği çift tık: kendi çift dokunuşumuz yeter
  const ac = [['pointerdown', indir], ['pointermove', oynat], ['pointerup', kaldir], ['pointercancel', kaldir], ['dblclick', dbl]];
  for (const [t, f] of ac) cv.addEventListener(t, f, true);
  jest = () => { uzunIptal(); J = null; joyApi?.birak(); for (const [t, f] of ac) cv.removeEventListener(t, f, true); };
}

// (7.11) sol altta joystick (kameraya göre yön: yukarı = kameradan ileri; main.js state.joy), sağ altta Z (en yakın hedef) ve R (vuruş)
function kumandaKur(state) {
  if (kumanda) return;
  const joy = document.createElement('div'); joy.id = 'ko-joy'; joy.innerHTML = '<i></i>';
  const tuslar = document.createElement('div'); tuslar.id = 'ko-atak';
  tuslar.innerHTML = '<button data-k="KeyZ" title="Target (Z)">Z</button><button data-k="KeyR" class="r" title="Attack (R)">R</button>';
  // (7.11) joystick yalnız ekranın sol bölümüne dokununca, dokunulan yerde görünür; parmak kalkınca gizlenir (jestKur yönetir)
  const top = joy.firstChild; let mx = 0, my = 0;
  const R = () => (joy.offsetWidth || 150) * 0.38;
  const birak = () => { state.joy = null; top.style.transform = ''; joy.classList.remove('aktif'); };
  joyApi = {
    bas(x, y) { mx = x; my = y; joy.style.left = x + 'px'; joy.style.top = y + 'px'; top.style.transform = ''; joy.classList.add('aktif'); },
    it(x, y) {
      const dx = x - mx, dy = y - my, r = R(), L = Math.hypot(dx, dy), k = L > r ? r / L : 1;
      top.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      state.joy = L < r * 0.18 ? null : { x: dx * k / r, y: -dy * k / r };
    },
    birak,
  };
  tuslar.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-k]'); e.stopPropagation(); e.preventDefault(); if (!b) return;
    b.classList.add('basili'); setTimeout(() => b.classList.remove('basili'), 140);
    tus(b.dataset.k, b.dataset.k.slice(3).toLowerCase()); navigator.vibrate?.(8);
  });
  tuslar.addEventListener('click', (e) => e.stopPropagation());
  document.body.append(joy, tuslar);
  kumanda = () => { birak(); joyApi = null; joy.remove(); tuslar.remove(); };
}

// (7.11) dokunmatikte "üzerine gelince" ipuçları (dükkân, depo, takas, pazar, görev ödülü vb. eşya bilgileri): dokunulan yere
//   fare hareketi gönderilir → ipucu açılır; başka yere dokununca kapanır. Çanta eşyaları envanter.js'te (dokun → bilgi).
function hoverKur() {
  if (hover) return;
  let bas = null;
  const indir = (e) => { if (e.pointerType === 'touch') bas = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
  const kaldir = (e) => {
    if (e.pointerType !== 'touch' || !bas || bas.id !== e.pointerId) return;
    const b = bas; bas = null; if (Math.hypot(e.clientX - b.x, e.clientY - b.y) > 10) return;
    setTimeout(() => {
      const el = document.elementFromPoint(e.clientX, e.clientY); if (!el || el.id === 'sahne') return;
      if (el.closest('.inv-esya') && !el.closest('.ko-drop') || el.closest('#ko-tablet-serit, #ko-joy, #ko-atak')) return;
      const o = { pointerId: 9072, pointerType: 'mouse', isPrimary: true, clientX: e.clientX, clientY: e.clientY, bubbles: true, cancelable: true, buttons: 0 };
      el.dispatchEvent(new PointerEvent('pointerover', o)); el.dispatchEvent(new PointerEvent('pointermove', o));
      el.dispatchEvent(new MouseEvent('mouseover', o)); el.dispatchEvent(new MouseEvent('mousemove', o));
    }, 0);
  };
  addEventListener('pointerdown', indir, true); addEventListener('pointerup', kaldir, true);
  hover = () => { removeEventListener('pointerdown', indir, true); removeEventListener('pointerup', kaldir, true); };
}
