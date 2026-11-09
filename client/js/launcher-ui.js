// KO Web launcher görünümü v6 (MineKO — kullanıcının paylaştığı launcher tasarımı, 1451×1084): arka plan resmi k2d/launcher/sahne6.webp
// (tasarımın kendisi; güncelleme notlarının metinleri, başlıktaki tarih, "Update Completed" / "100%" yazıları temizlendi — canlı).
// Resimde olanlar (X, START, HOME PAGE, OPTION, altın ilerleme çubuğu) üzerine tıklama alanları; ilerleme çubuğunun dolmamış kısmı koyu
// oluk ile örtülür. Sağ panelde güncelleme notları (NOTLAR: etiket, başlık, tarih, maddeler; kaydırılır). OPTION → launcher ayarları.
// API (launcher-sayfa.js): baslik, ilerleme, adim, sunucu, sunucular, oyuncu, surum, dogrulaniyor, hazir, yenidenBasla, kapat, bekle.
// Önceki v5: /tmp/claude-0/launcher-yedek/launcher-ui-v5.js
const W = 1451, H = 1084;
const SECENEK_KEY = 'ko-launcher-secenek';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// güncelleme notları (en yeni üstte) — tür: yeni / duzenleme / hata
export const NOTLAR = [
  { tur: 'yeni', etiket: 'NEW', baslik: 'New Features', tarih: '23.10.2026', maddeler: ['The web-based MineKO service is live.', 'New starter events have been added.', 'Premium systems have been activated.', 'In-game balance has been updated.'] },
  { tur: 'duzenleme', etiket: 'UPDATE', baslik: 'Balance and Improvements', tarih: '20.10.2026', maddeler: ['Skill balance of some classes has been updated.', 'In-game performance has been improved.', 'Issues with map transitions have been fixed.'] },
  { tur: 'hata', etiket: 'BUG FIX', baslik: 'Bug Fixes', tarih: '18.10.2026', maddeler: ['A quest progress bug has been fixed.', 'Some NPCs no longer get stuck.', 'Minor game client bugs have been fixed.'] },
];

const CSS = `
.kln { position: fixed; inset: 0; overflow: hidden; background: #5f5f5f; opacity: 0; transition: opacity .35s; user-select: none; -webkit-user-select: none; }
.kln.acik { opacity: 1; }
.kln-sahne { position: absolute; left: 50%; top: 50%; width: ${W}px; height: ${H}px; transform-origin: 50% 50%; }
.kln-arka { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; }
.kln.secenekte .kln-ana { display: none; } .kln:not(.secenekte) .kln-sec { display: none; }
.kln-efekt { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.kln-tik { position: absolute; cursor: pointer; border-radius: 4px; transition: backdrop-filter .15s, -webkit-backdrop-filter .15s; }
.kln-tik:hover { backdrop-filter: brightness(1.18) saturate(1.1); -webkit-backdrop-filter: brightness(1.18) saturate(1.1); }
.kln-tik:active { backdrop-filter: brightness(.9); -webkit-backdrop-filter: brightness(.9); }
.kln-start.kapali { cursor: default; backdrop-filter: grayscale(.85) brightness(.7); -webkit-backdrop-filter: grayscale(.85) brightness(.7); }
.kln-start.hazir { animation: kln-nabiz 1.9s ease-in-out infinite; }
@keyframes kln-nabiz { 0%, 100% { box-shadow: 0 0 0 0 rgba(255, 90, 40, 0); } 50% { box-shadow: 0 0 22px 2px rgba(255, 90, 40, .55); } }
.kln-tarih-b { position: absolute; left: 1150px; top: 214px; width: 121px; text-align: right; font: 400 15px/26px 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #cbc4b6; letter-spacing: .2px; }
.kln-notlar { position: absolute; left: 650px; top: 268px; width: 656px; height: 426px; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: #9a9a9a transparent; }
.kln-notlar::-webkit-scrollbar { width: 6px; } .kln-notlar::-webkit-scrollbar-thumb { background: #a3a3a3; border-radius: 3px; } .kln-notlar::-webkit-scrollbar-track { background: transparent; }
.kln-not { margin: 0 34px 0 40px; padding: 12px 0 11px; border-bottom: 1px solid #cfcdc8; font-family: 'Segoe UI', 'Noto Sans', Arial, sans-serif; }
.kln-not:last-child { border-bottom: 0; }
.kln-not-ust { display: flex; align-items: center; gap: 15px; height: 27px; }
.kln-etiket { display: inline-flex; align-items: center; height: 25px; padding: 0 16px; border-radius: 3px; font: 600 15px/1 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #fff; letter-spacing: .3px; box-shadow: inset 0 1px 0 rgba(255,255,255,.18), inset 0 -1px 0 rgba(0,0,0,.25); }
.kln-not.yeni .kln-etiket { background: linear-gradient(#8f3523, #6e2416); }
.kln-not.duzenleme .kln-etiket { background: linear-gradient(#27477a, #1a3259); }
.kln-not.hata .kln-etiket { background: linear-gradient(#24894f, #186a3b); }
.kln-not-baslik { font: 600 19px/1 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #2b2b2e; flex: 1; }
.kln-not-tarih { font: 400 15px/1 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #66656a; }
.kln-not ul { list-style: none; margin: 7px 0 0; padding: 0 0 0 12px; }
.kln-not li { position: relative; padding-left: 22px; font: 400 17px/26.3px 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #343438; }
.kln-not li::before { content: ''; position: absolute; left: 2px; top: 9px; width: 8px; height: 8px; transform: rotate(45deg); }
.kln-not.yeni li::before { background: linear-gradient(135deg, #f0a35a, #b8571d); }
.kln-not.duzenleme li::before { background: linear-gradient(135deg, #4d76b8, #1d3a6c); }
.kln-not.hata li::before { background: linear-gradient(135deg, #8a9a5a, #3e5a2c); }
.kln-durum { position: absolute; left: 636px; top: 716px; width: 590px; height: 36px; font: 400 25px/36px Georgia, 'Times New Roman', serif; color: #eee2c4; text-shadow: 0 1px 2px #000, 0 0 6px rgba(0,0,0,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: .3px; }
.kln-yuzde { position: absolute; left: 1226px; top: 716px; width: 92px; height: 36px; text-align: right; font: 400 25px/36px Georgia, 'Times New Roman', serif; color: #eee2c4; text-shadow: 0 1px 2px #000, 0 0 6px rgba(0,0,0,.6); }
.kln-oluk { position: absolute; top: 759px; height: 31px; right: 137px; left: 652px; background: linear-gradient(#0f0d0b, #2a2520 45%, #1a1714 70%, #0b0a09); box-shadow: inset 0 2px 4px rgba(0,0,0,.8); clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%); transition: left .25s; }
.kln-oluk::before { content: ''; position: absolute; left: -3px; top: 0; bottom: 0; width: 8px; background: linear-gradient(90deg, rgba(255,240,170,.9), rgba(255,200,60,0)); filter: blur(1px); }
.kln-oluk.bos::before, .kln-oluk.dolu::before { display: none; }
.kln-uyari { position: absolute; left: 650px; top: 662px; width: 656px; text-align: center; font: 600 16px/30px 'Segoe UI', Arial, sans-serif; color: #fff; background: rgba(20, 14, 10, .82); border-top: 1px solid #a5793b; opacity: 0; transition: opacity .3s; pointer-events: none; }
.kln-uyari.gor { opacity: 1; }
.kso-sekme { position: absolute; left: 580px; width: 194px; height: 66px; cursor: pointer; background: url(k2d/launcher/secenek/sekme.png) center / 100% 100% no-repeat; }
.kso-sekme.aktif { height: 70px; background-image: url(k2d/launcher/secenek/sekme_aktif.png); }
.kso-sekme:not(.aktif):hover { filter: brightness(1.25); }
.kso-sekme i { position: absolute; left: 19px; top: 50%; width: 40px; height: 36px; transform: translateY(-50%); background: #dcc7a0; -webkit-mask: center / contain no-repeat; mask: center / contain no-repeat; }
.kso-sekme.aktif i { background: #fff6ea; }
.kso-sekme span { position: absolute; left: 70px; top: 0; bottom: 0; display: flex; align-items: center; font: 600 18px/1 'Cinzel', Georgia, serif; color: #e9d7b4; letter-spacing: .3px; text-shadow: 0 1px 2px #000; }
.kso-sekme.aktif span { color: #fff3e2; }
.kso-icerik { position: absolute; left: 812px; top: 276px; width: 540px; height: 568px; overflow-y: auto; padding-right: 6px; scrollbar-width: thin; scrollbar-color: #6d5a3c transparent; }
.kso-bolum { padding: 0 0 8px 10px; }
.kso-bolum + .kso-bolum { margin-top: 12px; border-top: 1px solid #2c2a28; padding-top: 10px; }
.kso-bolum h4 { margin: 6px 0 12px; padding-bottom: 8px; font: 600 23px/1 'Cinzel', Georgia, serif; color: #e6c98e; letter-spacing: .6px; border-bottom: 1px solid transparent; border-image: linear-gradient(90deg, #b68f55, #7b6340 70%, rgba(123,99,64,.3)) 1; text-shadow: 0 1px 2px #000; }
.kso-satir { display: flex; align-items: center; min-height: 43px; }
.kso-et { width: 250px; font: 400 17px/1.2 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #e7e1d7; }
.kso-ic { flex: 1; display: flex; align-items: center; gap: 12px; }
.kso-sec { position: relative; width: 271px; }
.kso-sec select { width: 100%; height: 37px; padding: 0 34px 0 13px; appearance: none; -webkit-appearance: none; background: linear-gradient(#141414, #0d0d0d); color: #ece6dc; border: 1px solid #6d5a3c; border-radius: 3px; font: 400 17px/1 'Segoe UI', 'Noto Sans', Arial, sans-serif; cursor: pointer; box-shadow: inset 0 1px 3px rgba(0,0,0,.7); }
.kso-sec select option { background: #151515; }
.kso-sec::after { content: ''; position: absolute; right: 13px; top: 13px; width: 8px; height: 8px; border-right: 2px solid #d9cfbf; border-bottom: 2px solid #d9cfbf; transform: rotate(45deg); pointer-events: none; }
.kso-kutu { display: inline-flex; align-items: center; gap: 13px; cursor: pointer; font: 400 17px/1 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #ece6dc; }
.kso-kutu input { display: none; }
.kso-kutu i { position: relative; width: 26px; height: 26px; box-sizing: border-box; border: 1px solid #8e7349; border-radius: 3px; background: linear-gradient(#1a1a1a, #0e0e0e); box-shadow: inset 0 1px 3px rgba(0,0,0,.8), 0 0 0 1px rgba(0,0,0,.6); }
.kso-kutu input:checked + i::after { content: ''; position: absolute; left: 7px; top: 1px; width: 8px; height: 15px; border-right: 3px solid #e2c588; border-bottom: 3px solid #e2c588; transform: rotate(40deg); filter: drop-shadow(0 1px 1px #000); }
.kso-kutu.kapali { opacity: .7; cursor: default; }
.kso-yol { width: 260px; height: 37px; box-sizing: border-box; display: flex; align-items: center; padding: 0 12px; background: linear-gradient(#141414, #0d0d0d); border: 1px solid #6d5a3c; border-radius: 3px; color: #ece6dc; font: 400 15px/1 'Segoe UI', Arial, sans-serif; white-space: nowrap; overflow: hidden; }
.kso-yol span { overflow: hidden; text-overflow: ellipsis; }
.kso-tik { cursor: pointer; } .kso-tik:hover { border-color: #b68f55; color: #fff; }
.kso-dugme { width: 40px; height: 37px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 1px solid #6d5a3c; border-radius: 3px; background: linear-gradient(#2a2520, #141210); color: #e2c588; font-size: 20px; cursor: pointer; }
.kso-dugme:hover { filter: brightness(1.3); }
.kso-tus { min-width: 90px; height: 33px; padding: 0 14px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #6d5a3c; border-radius: 3px; background: linear-gradient(#1b1b1b, #0e0e0e); color: #e2c588; font: 600 16px/1 'Segoe UI', Arial, sans-serif; }
@media (prefers-reduced-motion: reduce) { .kln-start.hazir { animation: none; } }
`;

/** yayın sürümünden (build.mjs: Date.now() 36 tabanında) son güncelleştirme tarihi */
export function sonGuncelleme(v = window.KO_SURUM) {
  const ms = parseInt(String(v || ''), 36);
  if (!ms || ms < 1.6e12 || ms > 4e12) return '—';
  return new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function launcherKur({ kok = document.body, oyunIci = false, ayarlar = null, dogrula = null } = {}) {
  if (!document.getElementById('kln-css')) { const st = document.createElement('style'); st.id = 'kln-css'; st.textContent = CSS; document.head.append(st); }
  const V = (u) => (window.KO_V ? window.KO_V(u) : u);
  const RESIM = V('k2d/launcher/sahne6.webp');
  let secenek = { oto: false, pencere: false }; try { Object.assign(secenek, JSON.parse(localStorage.getItem(SECENEK_KEY) || '{}')); } catch {}
  const secKaydet = () => { try { localStorage.setItem(SECENEK_KEY, JSON.stringify(secenek)); } catch {} };
  const el = document.createElement('div'); el.className = 'kln';
  const tik = (k, x, y, w, h, t, ek = '') => `<div class="kln-tik ${ek}" data-k="${k}" title="${esc(t)}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`;
  const notHtml = NOTLAR.map((n) => `<div class="kln-not ${esc(n.tur)}"><div class="kln-not-ust"><span class="kln-etiket">${esc(n.etiket)}</span><span class="kln-not-baslik">${esc(n.baslik)}</span><span class="kln-not-tarih">${esc(n.tarih)}</span></div>
    <ul>${n.maddeler.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`).join('');
  el.innerHTML = `<div class="kln-sahne"><img class="kln-arka" src="${RESIM}" alt="" draggable="false">
      <canvas class="kln-efekt" width="${W}" height="${H}"></canvas>
      <div class="kln-ana"><div class="kln-tarih-b">${esc(NOTLAR[0]?.tarih || '')}</div>
      <div class="kln-notlar">${notHtml}</div>
      <div class="kln-durum"></div><div class="kln-yuzde">0%</div>
      <div class="kln-oluk"></div>
      ${tik('kapat', 1342, 114, 57, 53, 'Close')}
      ${tik('start', 626, 832, 241, 83, 'Start game', 'kln-start kapali')}
      ${tik('site', 889, 837, 221, 76, 'Ana sayfa')}
      ${tik('ayar', 1129, 837, 209, 76, 'Ayarlar')}</div>
      <div class="kln-sec"></div>
      <div class="kln-uyari"></div>
    </div>`;
  kok.append(el);
  const sahne = el.querySelector('.kln-sahne'), $ = (s) => el.querySelector(s);
  // tek seferde açılış: sahne resmi çözülene dek (en fazla 3 sn) her şey gizli, sonra birlikte belirir
  const img = $('.kln-arka');
  Promise.race([Promise.all([img.decode ? img.decode().catch(() => {}) : new Promise((r) => { img.onload = img.onerror = r; }), document.fonts?.ready?.catch(() => {})]), new Promise((r) => setTimeout(r, 3000))])
    .then(() => requestAnimationFrame(() => el.classList.add('acik')));
  // pencereye oturur: oran korunur, ekrandan %15 küçük; kalan yer düz gri (resmin kenarları griye yumuşakça karışır)
  const olcek = () => {
    let sx = innerWidth / W, sy = innerHeight / H;
    const s = Math.min(sx, sy) * 0.85; sx = s; sy = s;   // %15 küçük; çevresi düz gri
    sahne.style.transform = `translate(-50%, -50%) scale(${sx}, ${sy})`;
  };
  olcek(); addEventListener('resize', olcek);
  const efektDur = efektKur(el.querySelector('.kln-efekt'));
  let hazir = false, basla = null, ayarEl = null, uyT = 0, durumMetin = '';
  const bekle = new Promise((r) => (basla = r));
  const uyari = (t) => { const u = $('.kln-uyari'); u.textContent = t; u.classList.add('gor'); clearTimeout(uyT); uyT = setTimeout(() => u.classList.remove('gor'), 3500); };
  const baslat = () => {
    if (!hazir) return uyari('Preparing files, please wait…');
    if (!secenek.pencere && !document.fullscreenElement) { try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch {} }
    basla();
  };
  // ── OPTION ekranı (kullanıcının OPTION tasarımı: k2d/launcher/secenek6.webp; sekmeler, içerik, RESET / SAVE / CANCEL)
  const SECRESIM = V('k2d/launcher/secenek6.webp'); new Image().src = SECRESIM;
  let secSekme = 'general', taslak = null;
  const koAyarOku = () => { try { return JSON.parse(localStorage.getItem('ko-ayar') || '{}'); } catch { return {}; } };
  const ayarAc = () => {
    const g = ayarlar?.durum?.() || {};
    const k = koAyarOku();
    taslak = { oto: !!secenek.oto, pencere: !!secenek.pencere, modeller: g.modeller !== false, muzikIndir: g.muzik !== false,
      dil: k.dil || 'en', ui: k.ui || 100, names: k.fx?.names !== false, monsterNames: k.fx?.monsterNames !== false,
      silahFx: k.silahFx !== false, esyaFx: k.esyaFx !== false, yerelFx: k.yerelFx !== false, deprem: k.deprem !== false,
      muzikAcik: k.muzikAcik !== false, muzik: k.muzik ?? 60, efektSesAcik: k.efektSesAcik !== false, efektSes: k.efektSes ?? 80,
      takasRet: !!k.takasRet, partiRet: !!k.partiRet, seed: !!k.seed, yYuru: k.yYuru !== false, hpAcik: k.hpAcik !== false, hpYon: k.hpYon || 'v' };
    img.src = SECRESIM; el.classList.add('secenekte'); secCiz();
  };
  const ayarKapat = () => { taslak = null; img.src = RESIM; el.classList.remove('secenekte'); };
  const VARSAYILAN = { oto: false, pencere: false, modeller: true, muzikIndir: true, dil: 'en', ui: 100, names: true, monsterNames: true, silahFx: true, esyaFx: true, yerelFx: true, deprem: true,
    muzikAcik: true, muzik: 60, efektSesAcik: true, efektSes: 80, takasRet: false, partiRet: false, seed: false, yYuru: true, hpAcik: true, hpYon: 'v' };
  const kaydetSec = () => {
    const t = taslak; if (!t) return;
    secenek.oto = t.oto; secenek.pencere = t.pencere; secKaydet();
    ayarlar?.kaydet?.({ modeller: t.modeller, muzik: t.muzikIndir });
    const k = koAyarOku();
    Object.assign(k, { dil: t.dil, ui: Number(t.ui), silahFx: t.silahFx, esyaFx: t.esyaFx, yerelFx: t.yerelFx, deprem: t.deprem, muzikAcik: t.muzikAcik, muzik: Number(t.muzik),
      efektSesAcik: t.efektSesAcik, efektSes: Number(t.efektSes), takasRet: t.takasRet, partiRet: t.partiRet, seed: t.seed, yYuru: t.yYuru, hpAcik: t.hpAcik, hpYon: t.hpYon });
    k.fx = { ...(k.fx || {}), names: t.names, monsterNames: t.monsterNames };
    try { localStorage.setItem('ko-ayar', JSON.stringify(k)); } catch {}
    ayarKapat(); uyari('Settings saved.');
    if (secenek.oto && hazir) baslat();
  };
  const SEKMELER = [['general', 'GENERAL'], ['graphics', 'GRAPHICS'], ['sound', 'SOUND'], ['game', 'GAME'], ['shortcuts', 'SHORTCUTS']];
  const TAB_Y = [272, 348, 421, 493, 566];
  const sec = (a, ops) => `<div class="kso-sec"><select data-t="${a}">${ops.map(([v, t]) => `<option value="${esc(v)}" ${String(taslak[a]) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  const kutu = (a, t = 'Enable', kapali = false) => `<label class="kso-kutu ${kapali ? 'kapali' : ''}"><input type="checkbox" data-t="${a}" ${(a ? taslak[a] : true) ? 'checked' : ''} ${kapali ? 'disabled' : ''}><i></i><span>${esc(t)}</span></label>`;
  const satir = (et, ic) => `<div class="kso-satir"><span class="kso-et">${esc(et)}</span><div class="kso-ic">${ic}</div></div>`;
  const bolum = (b, ic) => `<div class="kso-bolum"><h4>${esc(b)}</h4>${ic}</div>`;
  const ses = Array.from({ length: 11 }, (_, i) => [i * 10, i * 10 + '%']);
  const MB = (b) => (b / 1048576).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB';
  const icerik = () => {
    if (secSekme === 'general') return bolum('GENERAL', satir('Language', sec('dil', [['en', 'English'], ['tr', 'Türkçe']])) + satir('Auto Start', kutu('oto', 'Start game when ready')) + satir('Window Mode', kutu('pencere')) + satir('Auto Update', kutu(null, 'Enable', true)))
      + bolum('PATCH', satir('Pre-download Models', kutu('modeller')) + satir('Pre-download Music', kutu('muzikIndir')))
      + bolum('FILE', satir('Game Files', `<div class="kso-yol"><span>Browser cache · ${MB(ayarlar?.durum?.()?.onbellek || 0)}</span></div><div class="kso-dugme" data-x="dogrula" title="Verify files">⟳</div>`)
        + satir('Clear Cache', `<div class="kso-yol kso-tik" data-x="temizle"><span>Clear and re-download</span></div>`));
    if (secSekme === 'graphics') return bolum('GRAPHICS', satir('Interface Scale', sec('ui', [80, 90, 100, 110, 120, 130].map((v) => [v, v + '%']))) + satir('Player Names', kutu('names')) + satir('Monster Names', kutu('monsterNames'))
      + satir('Weapon Effects', kutu('silahFx')) + satir('Item Effects', kutu('esyaFx')) + satir('Zone Effects', kutu('yerelFx')) + satir('Screen Shake', kutu('deprem')));
    if (secSekme === 'sound') return bolum('MUSIC', satir('Background Music', kutu('muzikAcik')) + satir('Music Volume', sec('muzik', ses))) + bolum('EFFECTS', satir('Sound Effects', kutu('efektSesAcik')) + satir('Effect Volume', sec('efektSes', ses)));
    if (secSekme === 'game') return bolum('GAME', satir('Refuse Trade', kutu('takasRet')) + satir('Refuse Party', kutu('partiRet')) + satir("Decline Seed's Help", kutu('seed')) + satir('Y-key Walking', kutu('yYuru')))
      + bolum('HUD', satir('HP / MP HUD', kutu('hpAcik', 'Show')) + satir('HUD Orientation', sec('hpYon', [['v', 'Vertical'], ['h', 'Horizontal']])));
    const KISA = [['Target Nearest', 'Z / Tab'], ['Attack', 'R'], ['Sit / Stand', 'C'], ['Run / Walk', 'T / Y'], ['Inventory', 'I'], ['World Map', 'M'], ['Minimap', 'N'], ['Mailbox', 'L'], ['Merchant Menu', 'H'], ['Chat', 'Enter']];
    return bolum('SHORTCUTS', KISA.map(([a, b]) => satir(a, `<div class="kso-tus">${esc(b)}</div>`)).join(''));
  };
  const secCiz = () => {
    const kok = $('.kln-sec');
    kok.innerHTML = SEKMELER.map(([k, t], i) => `<div class="kso-sekme ${k === secSekme ? 'aktif' : ''}" data-sekme="${k}" style="top:${TAB_Y[i]}px"><i style="-webkit-mask-image:url(${V(`k2d/launcher/secenek/ikon_${k}.png`)});mask-image:url(${V(`k2d/launcher/secenek/ikon_${k}.png`)})"></i><span>${t}</span></div>`).join('')
      + `<div class="kso-icerik">${icerik()}</div>` + tik('sec-kapat', 1346, 112, 56, 52, 'Close') + tik('sec-reset', 676, 868, 196, 58, 'Reset') + tik('sec-save', 890, 868, 196, 58, 'Save') + tik('sec-cancel', 1103, 868, 196, 58, 'Cancel');
  };
  el.addEventListener('change', (e) => {
    const t = e.target.dataset?.t; if (!t || !taslak) return;
    taslak[t] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  });
  el.addEventListener('click', (e) => {
    const sk = e.target.closest('[data-sekme]'); if (sk && taslak) { secSekme = sk.dataset.sekme; return secCiz(); }
    const x = e.target.closest('[data-x]')?.dataset.x;
    if (x === 'dogrula') { ayarKapat(); return ayarlar?.dogrula?.(); }
    if (x === 'temizle') { ayarKapat(); return ayarlar?.temizle?.(); }
    const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
    if (k === 'sec-save') return kaydetSec();
    if (k === 'sec-cancel' || k === 'sec-kapat') return ayarKapat();
    if (k === 'sec-reset') { taslak = { ...VARSAYILAN }; return secCiz(); }
    if (k === 'start') return baslat();
    if (k === 'ayar') return ayarAc();
    if (k === 'kapat') return void (location.href = 'index.html');
    if (k === 'site') return void window.open('index.html', '_blank');
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && taslak) return ayarKapat(); if (hazir && !taslak && el.isConnected && (e.key === 'Enter' || e.key === 'NumpadEnter')) { e.preventDefault(); e.stopPropagation(); baslat(); } }, true);
  const durumYaz = () => { const d = $('.kln-durum'); d.textContent = hazir ? 'Update Completed' : durumMetin; d.title = durumMetin; };
  const BAR0 = 652, BAR1 = 1314;
  const api = {
    el, bekle,
    baslik: (t) => { api._baslik = t; },
    ilerleme: (p) => {
      p = Math.max(0, Math.min(1, p || 0));
      const o = $('.kln-oluk'); o.style.left = (BAR0 + (BAR1 - BAR0) * p).toFixed(1) + 'px'; o.classList.toggle('bos', p <= 0); o.classList.toggle('dolu', p >= 1);
      o.style.visibility = p >= 1 ? 'hidden' : 'visible';
      $('.kln-yuzde').textContent = Math.floor(p * 100) + '%';
    },
    /** durum satırı: dizi (aktif adım) ya da düz metin */
    adim: (a, aktif = 0) => { durumMetin = Array.isArray(a) ? String(a[Math.max(0, aktif)] || a[0] || '') : String(a || ''); durumYaz(); },
    sunucu: () => {},
    sunucular: () => {},
    oyuncu: () => {},
    surum: (t) => { $('.kln-yuzde').title = String(t) + ' · yayın ' + (window.KO_SURUM || ''); },
    dogrulaniyor: () => {},
    hazir: (t = 'Game ready') => {
      hazir = true; const s = $('.kln-start'); s.classList.remove('kapali'); s.classList.add('hazir'); api.baslik(t); api.ilerleme(1); durumYaz();
      if (secenek.oto) setTimeout(() => { if (el.isConnected) basla(); }, 600);
    },
    yenidenBasla: () => { hazir = false; const s = $('.kln-start'); s.classList.add('kapali'); s.classList.remove('hazir'); durumYaz(); },
    kapat: () => { removeEventListener('resize', olcek); efektDur(); el.remove(); },
  };
  void oyunIci; void dogrula;
  api.ilerleme(0);
  return api;
}

// ── canlı efekt (sahne koordinatları 1451×1084): soldaki karakterin ateş kanatlarından yükselen kor parçacıkları
function efektKur(cv) {
  const c = cv.getContext('2d'); let raf = 0, son = performance.now();
  const KAYNAK = [[520, 230, 90, 120], [560, 360, 70, 90], [140, 330, 80, 140], [470, 520, 120, 110], [210, 560, 120, 120]];   // x, y, w, h (kanat / omuz ateşi)
  const P = [];
  const dog = () => { const k = KAYNAK[(Math.random() * KAYNAK.length) | 0]; return { x: k[0] + Math.random() * k[2], y: k[1] + Math.random() * k[3], vx: (Math.random() - 0.5) * 14, vy: -18 - Math.random() * 26, t: 0, o: 1.6 + Math.random() * 2.2, r: 0.8 + Math.random() * 1.6 }; };
  for (let i = 0; i < 55; i++) { const p = dog(); p.t = Math.random() * p.o; P.push(p); }
  const ciz = (now) => {
    raf = requestAnimationFrame(ciz);
    const dt = Math.min(0.05, (now - son) / 1000); son = now;
    c.clearRect(0, 0, W, H); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < P.length; i++) {
      const p = P[i]; p.t += dt;
      if (p.t >= p.o) { P[i] = dog(); continue; }
      p.x += (p.vx + Math.sin(now / 400 + i) * 6) * dt; p.y += p.vy * dt;
      const a = Math.sin(Math.PI * p.t / p.o) * 0.85;
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.2);
      g.addColorStop(0, `rgba(255,220,140,${a})`); g.addColorStop(0.4, `rgba(255,120,40,${a * 0.6})`); g.addColorStop(1, 'rgba(255,60,20,0)');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  };
  const gor = () => { cancelAnimationFrame(raf); if (!document.hidden) { son = performance.now(); raf = requestAnimationFrame(ciz); } };
  document.addEventListener('visibilitychange', gor);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(ciz);
  return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', gor); };
}

/** sunucu durumu (bu tasarımda gösterilmiyor; API uyumu için) */
export function sunucuIzle(sb, api) {
  if (!sb) return () => {};
  const al = () => sb.from('servers').select('name,is_open,sort').order('sort').then(({ data }) => api.sunucular((data || []).map((s) => ({ name: s.name, is_open: !!s.is_open }))), () => {});
  al();
  const t = setInterval(al, 60000);
  return () => clearInterval(t);
}
