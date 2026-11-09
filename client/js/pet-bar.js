// Pet (Familiar) kısayol çubuğu — KO orijinal co_pat_ui_02.dxt dokusu (Alt3…Alt0 yazılı 10 yuva + döndür düğmesi).
// Pet çağrılıyken görünür; ana kısayol çubuğuna yapışık (dikeyde solunda, yatayda üstünde) durur, onunla birlikte hareket eder / döner.
// Yuva 1: "A" = Saldırı modu aç/kapa · Yuva 2: hedefe saldır komutu · Yuva 3–10: pet becerileri (sağ tık: beceri ata / boşalt)
// Kısayollar: Alt+1 … Alt+0
const KEY = 'ko-pet-bar';
const YUVA = [8, 39, 69, 100, 130, 161, 192, 221, 252, 282];   // dokuda yuvaların başlangıcı (28×28)
const IKON = 'assets/ui/petbar/ikon.png', BEC = 'assets/yetenek/pet-beceri.webp';

export function initPetBar({ state }) {
  let atama = {}; try { atama = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  const kaydet = () => { try { localStorage.setItem(KEY, JSON.stringify(atama)); } catch {} };
  const el = document.createElement('div'); el.className = 'ko-petbar'; el.hidden = true;
  const yuvalar = YUVA.map((p, i) => {
    const y = document.createElement('div'); y.className = 'pb-yuva'; y.dataset.i = i; y.style.setProperty('--p', p + 'px');
    y.innerHTML = '<i class="pb-ikon"></i><b class="pb-cd"></b>'; el.append(y); return y;
  });
  const don = document.createElement('div'); don.className = 'pb-don'; don.title = 'Rotate'; el.append(don);
  let kok = null;

  const pet = () => state.pet;
  const BECERI = () => pet()?.BECERI || [];
  function kullan(i) {
    const P = pet(); if (!P?.canli?.()) return;
    if (i === 0) return P.modSec('saldiri');
    if (i === 1) return P.saldirKomut();
    const id = atama[i]; if (id) P.beceriIste(id);
  }
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    if (e.target.closest('.pb-don')) { const ana = document.querySelector('.ko-hotkey:not(.ko-hotkey-ek)'); const g = ana?.querySelector(`:scope > [data-id="${ana.classList.contains('dikey') ? 'Hotkey_vertical' : 'Hotkey_Horizontal'}"]`); g?.querySelector('[data-id="btn_change"]')?.click(); return; }
    const y = e.target.closest('.pb-yuva'); if (y) kullan(Number(y.dataset.i));
  });
  // sağ tık: beceri ata (yuva 3–10)
  let menu = null;
  const menuKapat = () => { menu?.remove(); menu = null; };
  addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target)) menuKapat(); }, true);
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault(); menuKapat();
    const y = e.target.closest('.pb-yuva'); const i = Number(y?.dataset.i); if (!y || i < 2) return;
    const lv = pet()?.pet?.seviye || 0;
    menu = document.createElement('div'); menu.className = 'ko-pb-menu';
    menu.innerHTML = BECERI().map(([id, ad, sv], k) => `<div class="pbm-s${lv < sv ? ' kilitli' : ''}" data-id="${id}"><i style="background-position:${-k * 26}px 0"></i>${ad} <small>Lv ${sv}</small></div>`).join('')
      + (atama[i] ? '<div class="pbm-s pbm-bos" data-id="0">Remove</div>' : '');
    document.body.append(menu);
    const r = y.getBoundingClientRect();
    menu.style.left = Math.max(4, r.left - menu.offsetWidth - 4) + 'px'; menu.style.top = Math.min(innerHeight - menu.offsetHeight - 4, r.top) + 'px';
    menu.addEventListener('click', (ev) => {
      const s = ev.target.closest('.pbm-s'); if (!s || s.classList.contains('kilitli')) return;
      const id = Number(s.dataset.id);
      for (const k of Object.keys(atama)) if (atama[k] === id) delete atama[k];
      if (id) atama[i] = id; else delete atama[i];
      kaydet(); menuKapat(); ciz(true);
    });
  });
  addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA/.test(e.target.tagName) || el.hidden) return;
    const m = /^Digit(\d)$/.exec(e.code); if (!m) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) kullan(m[1] === '0' ? 9 : Number(m[1]) - 1);
  }, true);

  let imza = '';
  function ciz(zorla) {
    const P = pet(), p = P?.pet, mod = p?.mod;
    const lv = p?.seviye || 0;
    const s = [mod, lv, JSON.stringify(atama)].join('|');
    if (zorla || s !== imza) {
      imza = s;
      yuvalar[0].querySelector('.pb-ikon').style.cssText = `background:url(${IKON}) ${mod === 'saldiri' ? 0 : -56}px 0 no-repeat`;
      yuvalar[1].querySelector('.pb-ikon').style.cssText = `background:url(${IKON}) -84px 0 no-repeat`;
      yuvalar[0].title = 'Attack mode (Alt+1)'; yuvalar[1].title = 'Attack target (Alt+2)';
      for (let i = 2; i < 10; i++) {
        const id = atama[i], k = BECERI().findIndex((b) => b[0] === id), ik = yuvalar[i].querySelector('.pb-ikon');
        ik.style.cssText = k >= 0 ? `background:url(${BEC}) ${-k * 28}px 0 / 168px 28px no-repeat` : '';
        yuvalar[i].classList.toggle('dolu', k >= 0);
        yuvalar[i].classList.toggle('kilitli', k >= 0 && lv < BECERI()[k][2]);
        yuvalar[i].title = k >= 0 ? `${BECERI()[k][1]} (Alt+${(i + 1) % 10})` : 'Right click: assign familiar skill';
      }
    }
    for (let i = 2; i < 10; i++) {
      const id = atama[i], kal = id ? P?.beceriKalan?.(id) || 0 : 0, c = yuvalar[i].querySelector('.pb-cd');
      c.textContent = kal > 0 ? Math.ceil(kal) : ''; yuvalar[i].classList.toggle('bekle', kal > 0);
    }
  }
  function yerlestir() {
    const P = pet(), H = P?.canli?.() ? state.hotkeyCerceve?.() : null;
    const goster = !!H;
    if (el.hidden === goster) el.hidden = !goster;
    if (!goster) { menuKapat(); return; }
    // ana çubuğun içine eklenir → ana çubuk sürüklenirken / döndürülürken gecikmesiz birlikte hareket eder (ölçeği de ondan alır)
    if (kok !== H.ana) { kok = H.ana; kok.append(el); }
    const { A, dikey } = H, tum = [A, ...H.ekler];
    el.classList.toggle('dikey', dikey);
    const R = kok.getBoundingClientRect(), S = (R.width / (kok.offsetWidth || R.width)) || 1;   // ana çubuğun ekrandaki ölçeği (zoom × scale)
    const k = { width: (dikey ? 33 : 332) * S, height: (dikey ? 333 : 33) * S }, o = S;
    let x, y;
    if (dikey) {
      const sol = Math.min(...tum.filter((q) => q.top < A.bottom && q.bottom > A.top).map((q) => q.left));
      x = sol - k.width + 2 * o; y = A.top + 12 * o;
      if (x < 0) x = Math.max(...tum.map((q) => q.right)) - 2 * o;
    } else {
      const ust = Math.min(...tum.filter((q) => q.left < A.right && q.right > A.left).map((q) => q.top));
      y = ust - k.height + 2 * o; x = A.left + 12 * o;
      if (y < 0) y = Math.max(...tum.map((q) => q.bottom)) - 2 * o;
    }
    el.style.left = Math.round((x - R.left) / S) + 'px'; el.style.top = Math.round((y - R.top) / S) + 'px';
    ciz();
  }
  setInterval(() => { try { yerlestir(); } catch {} }, 100);
  return { kullan, ciz };
}
