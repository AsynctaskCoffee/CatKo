// Kısayol çubuğu yetenekleri (KO CUIHotKeyDlg): Yetenekler penceresinden sürüklenen yetenek bir yuvaya yerleşir,
// 1-0 tuşları ya da tıklama ile kullanılır. 8 sayfa × 10 yuva, karakter başına tarayıcıda saklanır. Bekleme süresi yuvada kararır.
// Ana çubuktaki ok düğmesi yanına ek çubuk açar (en fazla 3 çubuk yan yana); ek çubukların sayfası ayrı seçilir, tıklamayla kullanılır.
// F1–F8 ana çubuğun sayfasını değiştirir (hud.js). Kaishan'da yetenekler sıfırlanınca 8 sayfanın tamamı temizlenir.
import { loadYetenekler, yetenekVerisi, futbolYet, futbolAcik, pasifYet } from './yetenek.js';
import { iconHtml, hakli } from './esya.js';
import { hasLayout, buildLayout } from './kui.js';

export function initKisayol({ character, state, hud }) {
  const KEY = 'ko-kisayol-yetenek-' + character.id, EK_KEY = 'ko-kisayol-ek-' + character.id;
  let atama = {}; try { atama = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  const kilitli = () => !!document.querySelector('.ko-hotkey.kilitli');   // çubuğun altındaki kilit (btn_lock)
  const kaydet = () => { try { localStorage.setItem(KEY, JSON.stringify(atama)); } catch {} };
  let sayfa = 1;
  const bekleme = new Map();   // yetenek → bitiş (ms)
  const slot = (i) => document.querySelector(`.slot[data-i="${i}"]`);
  const idOf = (pg, i) => atama[pg]?.[i] || null;
  const al = (i) => idOf(sayfa, i);
  const ikonCss = (s, px) => {
    const A = yetenekVerisi()?.atlas; if (!A) return '';
    const i = s.ikon < 0 ? 0 : s.ikon, k = px / A.boyut;
    return `background:url(./assets/yetenek/${A.dosya}) ${-(i % A.kolon) * px}px ${-Math.floor(i / A.kolon) * px}px / ${A.kolon * A.boyut * k}px auto`;
  };
  // çantada eşya isteyen yetenekler: Strength of Wolf (x030) → Blood of wolf, Cure Curse (x736) → Blessing Potion (rogue 7/8)
  const gerekenEsya = (s) => { if (!s) return null; const id = Number(s.id), sn = Math.floor(id / 1000) % 100; if (![7, 8].includes(sn)) return null;
    return id % 1000 === 30 ? 370004000 : id % 1000 === 736 ? 370005000 : id % 1000 === 748 ? 370006000 : id % 1000 === 656 ? 370007000 : null; };   // (7.11) + Cure Disease → Cure Potion, Throwing Knife → Throwing-knife (yuvada çantadaki adet)
  const ESYA_AD = { 370004000: 'Blood of wolf', 370005000: 'Blessing Potion', 370006000: 'Cure Potion', 370007000: 'Throwing-knife' };
  const cantadaVar = (num) => { const it = state.inv?.items; if (!it) return true; for (const [sl, e] of it) if (sl >= 14 && sl <= 41 && Number(e?.row?.item_num) === num && (Number(e.row.count) || 1) > 0) return true; return false; };
  const esyaAdet = (num) => { const it = state.inv?.items; let n = 0; if (!it) return 0; for (const [sl, e] of it) if (((sl >= 14 && sl <= 41) || (sl >= 54 && sl <= 90)) && Number(e?.row?.item_num) === num) n += Number(e.row.count) || 1; return n; };
  const esyaliYet = (v) => { const s = yetenekVerisi()?.yetenekler?.[v]; return !!gerekenEsya(s); };
  // tek yuvayı çiz (ana ya da ek çubuk)
  function yuvaCiz(el, id, i, ana) {
    if (!el) return;
    const Y = yetenekVerisi();
    const s = id && Y?.yetenekler?.[id], E = esyaOf(id);
    const ik = el.querySelector('.ikon');
    el.classList.toggle('yetenek', !!s || !!E);
    el.dataset.esyaBirak = '1';
    el.querySelector('.ks-adet')?.remove();
    if (E) {
      el.classList.remove('saldiri');
      el.classList.add('esya-ks');   // eşya ikonu yuvayı doldurur (çerçevesiz)
      if (ik) { ik.style.cssText = ''; const w = ik.clientWidth || Math.round(el.clientWidth - 2) || 30; ik.innerHTML = E.it ? iconHtml(E.it, Math.max(20, w + 2)) : ''; }
      const b = document.createElement('b'); b.className = 'ks-adet'; b.textContent = E.adet; el.append(b);
      el.classList.toggle('bos-esya', !E.adet);
      el.title = `${E.it?.strName || 'Eşya'}${ana ? ` (${i % 10})` : ''} · ${E.adet} adet`;
      return;
    }
    if (ik) ik.innerHTML = '';
    el.classList.remove('bos-esya', 'esya-ks', 'ks-kapali');
    if (s) {
      el.classList.remove('saldiri');
      const px = Math.max(20, Math.round((ik?.clientWidth || 30)));
      if (ik) ik.style.cssText = ikonCss(s, px) + ';background-repeat:no-repeat';
      const ge = gerekenEsya(s), esyaYok = !!ge && !cantadaVar(ge);
      el.classList.toggle('ks-kapali', (futbolYet(s) && !futbolAcik()) || esyaYok);
      if (ge) { const b = document.createElement('b'); b.className = 'ks-adet'; b.textContent = esyaAdet(ge); el.append(b); }   // (5.11) KO: Strength of Wolf / Cure Curse yuvasında gereken eşyanın (Blood of wolf / Blessing Potion) adedi
      el.title = `${s.ad}${futbolYet(s) && !futbolAcik() ? ' — yalnız futbol maçı etkinliğinde' : ''}${esyaYok ? ` — no ${ESYA_AD[ge] || 'item'} in your inventory` : ''}${ana ? ` (${i % 10})` : ''}`;
    } else {
      if (ik) ik.style.cssText = '';
      el.classList.remove('saldiri'); el.title = '';   // KO: 1. yuvada temel saldırı yok (saldırı R / çift tık)
    }
  }
  // KO: adedi biten eşya kısayoldan kalkar (çanta yüklenmeden silinmez; çağrılı pet varken Familiar Summon kalır — geri gönderme)
  function bitenleriSil() {
    if (!state.inv?.items) return;
    let degisti = false;
    for (const pg of Object.keys(atama)) for (const i of Object.keys(atama[pg] || {})) {
      const id = atama[pg][i], E = esyaOf(id); if (!E || E.adet > 0) continue;
      if (E.num === 389191000 && state.pet?.pet?.cagrili) continue;
      delete atama[pg][i]; degisti = true;
      if (String(sagTik) === String(id)) { sagTik = null; sagKaydet(); }
    }
    if (degisti) kaydet();
  }
  function ciz() {
    bitenleriSil();
    for (let i = 1; i <= 10; i++) yuvaCiz(slot(i), al(i), i, true);
    for (const b of ekler) ekCiz(b);
    isaretCiz();
  }
  // eşya kısayolu: 'e:<num>' — çantadaki aynı eşyaların toplamı gösterilir
  const esyaOf = (id) => {
    if (typeof id !== 'string' || !id.startsWith('e:')) return null;
    const num = Number(id.slice(2)); let adet = 0, it = null, slot = null;
    for (const [sl, e] of state.inv?.items || []) if (sl >= 14 && sl <= 41 && Number(e.row.item_num) === num) { adet += hakli(e.it) ? Number(e.row.durability ?? e.it.Duration) || 0 : e.row.count || 1; /* premium iksir / 30'luk scroll: kalan kullanım hakkı */ it ||= e.it; slot ??= sl; }
    if (!it) it = sonIt.get(num) || null; else sonIt.set(num, it);
    return { num, adet, it, slot };
  };
  const sonIt = new Map();
  // KO: kısayoldaki yeteneğe sağ tık → mavi parlama (sağ tık yeteneği); hedefe sağ tıklayınca bu yetenek kullanılır. Tekrar sağ tık kaldırır.
  const SAG_KEY = 'ko-kisayol-sagtik-' + character.id;
  let sagTik = null; try { sagTik = JSON.parse(localStorage.getItem(SAG_KEY) || 'null'); } catch {}
  const sagKaydet = () => { try { localStorage.setItem(SAG_KEY, JSON.stringify(sagTik)); } catch {} };
  const isaretCiz = () => document.querySelectorAll('.slot[data-i], .slot[data-ek]').forEach((el) => {
    const k = el.dataset.ek != null ? (ekler[Number(el.dataset.ek)] ? { pg: ekler[Number(el.dataset.ek)].page, i: Number(el.dataset.ei) } : null) : { pg: sayfa, i: Number(el.dataset.i) };
    el.classList.toggle('sag-tik', !!(k && sagTik != null && String(idOf(k.pg, k.i)) === String(sagTik)));
  });
  const esyaliSayfa = (pg) => Object.values(atama[pg] || {}).some((v) => String(v).startsWith('e:') || esyaliYet(v));
  setInterval(() => { if (esyaliSayfa(sayfa) || ekler.some((b) => esyaliSayfa(b.page))) ciz(); }, 1000);
  addEventListener('ko-esya-kullanildi', () => setTimeout(ciz, 50));
  loadYetenekler().then(() => {
    // önceden çubuğa konmuş pasif yetenekler (Valor, Absoluteness, Matchless…) kaldırılır
    const Y = yetenekVerisi()?.yetenekler; let d = false;
    for (const pg of Object.keys(atama)) for (const i of Object.keys(atama[pg] || {})) if (pasifYet(Y?.[atama[pg][i]])) { delete atama[pg][i]; d = true; }
    if (d) kaydet();
    ciz();
  }).catch(() => {});
  addEventListener('ko-kisayol-sayfa', (e) => { sayfa = e.detail || 1; ciz(); });
  addEventListener('resize', () => setTimeout(() => { ekYerlestir(true); ciz(); }, 50));
  setTimeout(ciz, 1500);

  addEventListener('ko-futbol', () => ciz());   // futbol maçı etkinliği başladı / bitti: Dribble / Shoot yuvaları açılır / griye döner
  addEventListener('ko-yetenek-kullanildi', (e) => { const d = e.detail; if (d?.id) { bekleme.set(Number(d.id) || d.id, performance.now() + (d.bekleme || 0.5) * 1000); ciz(); } });
  // (5.11) aynı eşya / iksir nereden kullanılırsa kullanılsın (çubuğun herhangi bir sayfası, ek çubuk, envanter) tüm sayfalardaki yuvalarında geri sayım
  addEventListener('ko-esya-kullanildi', (e) => { const n = Number(e.detail?.num); if (n) { const k = 'e:' + n; bekleme.set(k, Math.max(bekleme.get(k) || 0, performance.now() + 2000)); } });
  async function kullanId(id) {
    const E = esyaOf(id);
    if (E) {
      if (E.slot == null && E.num === 389191000 && state.pet?.pet?.cagrili) { state.pet.gonder?.(); return true; }   // Familiar Summon bitse de çağrılı pet geri gönderilebilir
      if (E.slot == null) { hud.notice?.(`Not enough items left in the inventory: ${E.it?.strName || 'item'}.`, 'hata'); return true; }
      const ok = await state.inv?.kullan?.(E.slot);
      if (ok) bekleme.set(id, performance.now() + 2000);
      ciz(); return true;
    }
    const s = id && yetenekVerisi()?.yetenekler?.[id];
    if (!s) return false;
    if (state.pazarAcik) { hud.notice?.('You cannot use skills while in merchant mode.', 'hata'); return true; }
    // KO: bekleme süresindeki yetenek sıraya alınmaz (sonradan kendiliğinden çıkmaz)
    const minor = s.id % 1000 === 705 && [7, 8].includes(Math.floor(s.id / 1000) % 100);   // Rogue Minor Healing ortak gecikmeyi beklemez
    const bekliyor = () => true;   // KO: bekleme / başka yetenek sürerken basılan yetenek yok sayılır (ileti yok, sıraya da alınmaz)
    const kalan = (bekleme.get(s.id) || 0) - performance.now();
    if (kalan > 0) return bekliyor(kalan);
    let g = state.genelBekleme;
    // KO ok kombosu (ör. 3'lü ok → W → 5'li ok): ok yeteneği ortak gecikme / önceki atış bitmek üzereyken basılırsa kısa süre sırada bekler, sonra hemen çıkar
    if (s.tip1 === 2) {
      const engel = () => Math.max((g = state.genelBekleme) && g.bit > performance.now() ? g.bit - performance.now() : 0, (state.yetenekKlipBit || 0) - performance.now(), state.combat?.okMesgul?.() ? 1 : 0);
      if (engel() > 0 && engel() <= 1700) {
        const no = ++okSira, lim = performance.now() + 1800;
        while (engel() > 0 && performance.now() < lim) { await new Promise((r) => setTimeout(r, 25)); if (no !== okSira) return true; }
      }
      if (engel() > 0) return bekliyor();
      const d = await state.combat?.useSkill?.(s);
      if (d?.ok) bekleme.set(s.id, performance.now() + (d.bekleme || 0.5) * 1000);
      else if (d?.hazir) { const ms = Math.max(0, d.hazir * 1000 - Date.now()); bekleme.set(s.id, performance.now() + ms); }
      return true;
    }
    // büyü (tip 3): ortak gecikme / önceki büyünün yanıtı / kol animasyonu bitmek üzereyken (≤ 1,2 sn) basılırsa sırada bekler, bitince hemen çıkar
    //   (mob öldü → Z ile yeni hedef → büyü: tuş düşmez)
    // (9.11) yakın dövüş (tip 1, rogue R kombosu vb.) de aynı giriş tamponu: ortak gecikme / kol animasyonu / önceki yanıt bitmek üzereyken (≤ 0,9 sn)
    //   basılan yetenek düşmez, engel kalkar kalkmaz çıkar (son basılan geçerli) → R - yetenek - R akışı takılmaz
    if (s.tip1 === 3 || (s.tip1 === 1 && !minor)) {
      const engel = () => Math.max((g = state.genelBekleme) && g.bit > performance.now() ? g.bit - performance.now() : 0, (state.yetenekKlipBit || 0) - performance.now(), state.combat?.mesgul?.() ? 1 : 0);
      if (engel() > 0 && engel() <= (s.tip1 === 1 ? 900 : 1200)) {
        const no = ++okSira, lim = performance.now() + 1300;
        while (engel() > 0 && performance.now() < lim) { await new Promise((r) => setTimeout(r, 20)); if (no !== okSira) return true; }
      }
    }
    if (!minor && g && g.bit > performance.now()) return bekliyor(g.bit - performance.now());
    if (!minor && (state.combat?.mesgul?.() || performance.now() < (state.yetenekKlipBit || 0))) return bekliyor();   // önceki yetenek hâlâ etkin (sunucu yanıtı / kol animasyonu sürüyor)
    const d = await state.combat?.useSkill?.(s);
    if (d?.ok) bekleme.set(s.id, performance.now() + (d.bekleme || 0.5) * 1000);
    else if (d?.hazir) { const ms = Math.max(0, d.hazir * 1000 - Date.now()); bekleme.set(s.id, performance.now() + ms); bekliyor(ms); }
    return true;
  }
  let okSira = 0;   // sırada bekleyen ok yeteneği (son basılan geçerli)
  const kullan = (i) => kullanId(al(i));
  // bekleme göstergesi
  const beklemeCiz = (el, id) => {
    const b = el?.querySelector('.bekleme'); if (!b) return;
    const now = performance.now();
    const s = id && yetenekVerisi()?.yetenekler?.[id], e = typeof id === 'string' && id.startsWith('e:'), bit = s ? Math.max(bekleme.get(Number(s.id)) || 0, bekleme.get(String(s.id)) || 0) : e ? bekleme.get(id) || 0 : 0;   // sayı / metin kimlik farkı tüm sayfalarda aynı yeteneği eşler
    const top = s ? Math.max(0.5, Math.max(s.bekleme || 5, s.dokum || 0) / 10) * 1000 : 2000;
    let oran = bit > now ? Math.min(1, (bit - now) / top) : 0;
    // ortak gecikme (genel bekleme) diğer yuvalarda gösterilmez: her yetenek yalnız kendi bekleme süresini gösterir
    // KO: kırmızı yarı saydam saat dilimi — 12 yönünden saat yönünde açılır, kalan süre kırmızı kalır, sıfırlanınca kaybolur
    const v = oran.toFixed(3); if (b._o !== v) { b._o = v; const g = ((1 - oran) * 360).toFixed(1); b.style.setProperty('background', oran > 0 ? `conic-gradient(transparent 0deg ${g}deg, rgba(200,0,0,.55) ${g}deg 360deg)` : 'transparent', 'important'); }   // yalnız değişince yaz
  };
  setInterval(() => {
    for (let i = 1; i <= 10; i++) beklemeCiz(slot(i), al(i));
    for (const b of ekler) for (let i = 1; i <= 10; i++) beklemeCiz(b.slots[i - 1], idOf(b.page, i));
  }, 50);

  // tuşlar
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.repeat || e.altKey) return;   // Alt+rakam: pet kısayol çubuğu
    const m = /^Digit(\d)$/.exec(e.code); if (!m) return;
    const i = m[1] === '0' ? 10 : Number(m[1]);
    if (al(i)) { e.stopImmediatePropagation(); kullan(i); }
  }, true);

  // ortak yuva davranışı: tık = kullan, sağ tık = boşalt, sürükle = yer değiştir / dışarı bırakınca kaldır
  // hedef çözümü: ana yuva (.slot[data-i]) ya da ek yuva (.slot[data-ek][data-ei])
  const hedefOf = (el) => {
    const h = el?.closest?.('.slot'); if (!h) return null;
    if (h.dataset.ek != null) { const b = ekler[Number(h.dataset.ek)]; return b ? { pg: b.page, i: Number(h.dataset.ei) } : null; }
    return h.dataset.i ? { pg: sayfa, i: Number(h.dataset.i) } : null;
  };
  let surukT = 0;
  function yuvaBagla(el, konum) {   // konum(): { pg, i }
    el.addEventListener('click', (e) => { const k = konum(), id = idOf(k.pg, k.i); if (id) { e.stopImmediatePropagation(); if (performance.now() - surukT < 300) return; kullanId(id); } }, true);
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation(); const k = konum(), id = idOf(k.pg, k.i); if (!id) return;
      const s = yetenekVerisi()?.yetenekler?.[id];
      if (String(sagTik) === String(id)) { sagTik = null; hud.info?.('Right-click skill removed.', 'beceri'); }
      else { sagTik = id; hud.info?.(`Right-click skill: ${s?.ad || 'item'} — used when you right-click.`, 'beceri'); }
      sagKaydet(); isaretCiz();
    });
    el.addEventListener('pointerdown', (e) => {
      const k0 = konum();
      if (e.button !== 0 || !idOf(k0.pg, k0.i)) return;
      e.stopPropagation();   // çubuğun kendisi sürüklenmesin
      if (kilitli()) return;   // kilit kapalı: kısayoldaki yetenek / eşya sürüklenemez (tıklayıp kullanmak serbest)
      const bas = { x: e.clientX, y: e.clientY };
      let g = null;
      const mv = (ev) => {
        if (!g && Math.hypot(ev.clientX - bas.x, ev.clientY - bas.y) >= 8) {
          g = document.createElement('div'); g.className = 'ks-hayalet';
          const id0 = idOf(k0.pg, k0.i), s0 = yetenekVerisi()?.yetenekler?.[id0], E0 = esyaOf(id0);
          if (E0?.it) g.innerHTML = iconHtml(E0.it, 36); else if (s0) g.innerHTML = `<span style="display:block;width:36px;height:36px;${ikonCss(s0, 36)};background-repeat:no-repeat"></span>`;
          document.body.append(g);
        }
        if (g) { g.style.left = ev.clientX - 18 + 'px'; g.style.top = ev.clientY - 18 + 'px'; }
      };
      addEventListener('pointermove', mv, true);
      const up = (ev) => {
        removeEventListener('pointerup', up, true); removeEventListener('pointermove', mv, true); g?.remove();
        if (Math.hypot(ev.clientX - bas.x, ev.clientY - bas.y) < 8) return;
        surukT = performance.now();   // ardından gelen tıklama yeteneği kullanmasın
        const h = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => hedefOf(x)).find(Boolean);
        const id = idOf(k0.pg, k0.i);
        if (h) {
          atama[h.pg] ||= {};
          const eski = atama[h.pg][h.i];
          atama[h.pg][h.i] = id;
          if (h.pg !== k0.pg || h.i !== k0.i) { if (eski) atama[k0.pg][k0.i] = eski; else delete atama[k0.pg][k0.i]; }
        } else delete atama[k0.pg][k0.i];   // çubuğun dışına bırakılırsa kaldırılır
        kaydet(); ciz();
      };
      addEventListener('pointerup', up, true);
    });
    // çantadan eşya bırakma (iksir vb.)
    el.addEventListener('ko-esya-birak', (e) => {
      const d = e.detail || {}, k = konum();
      if (!state.inv?.kullanilir?.(d.it)) { hud.notice?.('Only usable items (potions, scrolls) can be placed on the shortcut bar.', 'hata'); return; }
      atama[k.pg] ||= {}; atama[k.pg][k.i] = 'e:' + d.num; kaydet(); ciz();
      hud.info?.(`${d.name} has been placed on the shortcut bar (page ${k.pg}).`, 'beceri');
    });
  }
  for (let i = 1; i <= 10; i++) { const el = slot(i); if (el) yuvaBagla(el, () => ({ pg: sayfa, i })); }
  // Yetenekler penceresinden bırakma
  addEventListener('ko-yetenek-birak', (e) => {
    const { id, x, y } = e.detail || {};
    const h = hedefOf(document.elementFromPoint(x, y)); if (!h) return;
    if (kilitli()) return hud.notice?.('The shortcut bar is locked. Unlock it with the lock below to place skills.', 'hata');
    if (pasifYet(yetenekVerisi()?.yetenekler?.[id])) return hud.notice?.('Passive skills cannot be placed on the shortcut bar.', 'hata');
    atama[h.pg] ||= {}; atama[h.pg][h.i] = id; kaydet(); ciz();
    const s = yetenekVerisi()?.yetenekler?.[id]; if (s) hud.info?.(`${s.ad} has been placed on the shortcut bar (page ${h.pg}).`, 'beceri');
  });

  // Yetenek kitabında sağ tık → ana çubuğun (geçerli sayfa) ilk boş yuvası; dolu ise ek çubuklar
  addEventListener('ko-yetenek-yerlestir', (e) => {
    const id = e.detail?.id; const s = yetenekVerisi()?.yetenekler?.[id]; if (!s) return;
    const yerler = [...Array.from({ length: 10 }, (_, k) => ({ pg: sayfa, i: k + 1 })), ...ekler.flatMap((b) => Array.from({ length: 10 }, (_, k) => ({ pg: b.page, i: k + 1 })))];
    const bos = yerler.find((y) => !idOf(y.pg, y.i));
    if (!bos) return hud.notice?.('There are no empty slots on the shortcut bar.', 'hata');
    atama[bos.pg] ||= {}; atama[bos.pg][bos.i] = id; kaydet(); ciz();
    hud.info?.(`${s.ad} has been placed on the shortcut bar (page ${bos.pg}, slot ${bos.i % 10}).`, 'beceri');
  });

  // Kaishan: yetenekler sıfırlanınca kısayol çubuğunun 8 sayfasının tamamı (yetenek + eşya kısayolları) ve sağ tık ataması boşaltılır
  addEventListener('ko-yetenek-sifirlandi', () => {
    // (6.11) Save Quickslot kayıtları da silinir (kullanılacak çubuk sayısı ayarı kalır)
    try { const k = 'ko-hkpreset-' + character.id, v = JSON.parse(localStorage.getItem(k) || 'null'); if (v) { delete v.kayit; localStorage.setItem(k, JSON.stringify(v)); } } catch {}
    for (const pg of Object.keys(atama)) atama[pg] = {};
    sagTik = null; sagKaydet();
    bekleme.clear(); kaydet(); ciz();
    hud.info?.('All 8 pages of the shortcut bar have been cleared.', 'beceri');
  });

  // ---------- ek kısayol çubukları (en fazla 2 ek → toplam 3). Ana çubuğa yapışık, onunla aynı görünüm ve yönde;
  // ana çubuk taşınınca / döndürülünce birlikte hareket eder. Kilit ve döndür düğmeleri ana çubuğu yönetir.
  const ekler = [];   // { page, L, slots }
  let ekDurum = []; try { ekDurum = JSON.parse(localStorage.getItem(EK_KEY) || '[]'); } catch {}
  const ekKaydet = () => { try { localStorage.setItem(EK_KEY, JSON.stringify(ekler.map((b) => ({ page: b.page })))); } catch {} };
  const anaCubuk = () => document.querySelector('.ko-hotkey:not(.ko-hotkey-ek)');
  const zoom = () => parseFloat(getComputedStyle(document.getElementById('kohud') || document.body).zoom) || 1;
  const grupOf = (el, dikey) => el?.querySelector(`:scope > [data-id="${dikey ? 'Hotkey_vertical' : 'Hotkey_Horizontal'}"]`);
  // görünen çerçeve: grubun çizilen parçalarının birleşimi (grup kutusu çizimden geniş/dar olabilir)
  const gorunen = (g) => {
    let l = Infinity, t = Infinity, r = -Infinity, bt = -Infinity, gh = 0, gw = 0;
    for (const e of g.querySelectorAll('.kui-img')) {
      if (!e.getClientRects().length || e.closest('[hidden]')) continue;
      const q = e.getBoundingClientRect(); if (q.width < 2 || q.height < 2) continue;
      l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); bt = Math.max(bt, q.bottom);
      // gövde kalınlığı: uzun çerçeve parçasının kısa kenarı (uç başlıklar gövdeden taşar → çubuklar arası boşluk)
      if (q.width > q.height * 2.5) gh = Math.max(gh, q.height); if (q.height > q.width * 2.5) gw = Math.max(gw, q.width);
    }
    if (!isFinite(l)) { const q = g.getBoundingClientRect(); return { left: q.left, top: q.top, right: q.right, bottom: q.bottom, width: q.width, height: q.height, gh: q.height, gw: q.width }; }
    return { left: l, top: t, right: r, bottom: bt, width: r - l, height: bt - t, gh: gh || bt - t, gw: gw || r - l };
  };
  function ekCiz(b) {
    for (let i = 1; i <= 10; i++) yuvaCiz(b.slots[i - 1], idOf(b.page, i), i, false);
    b.L.text('strpage1', String(b.page)); b.L.text('strpage0', String(b.page));
  }
  // yön: ana çubukla aynı (yuvalar yatayda 10-19, dikeyde 0-9 alanlarına taşınır)
  function ekYon(b, dikey) {
    if (b.dikey === dikey) return;
    b.dikey = dikey;
    b.L.el.classList.toggle('dikey', dikey);
    b.L.get('Hotkey_Horizontal').hidden = dikey; b.L.get('Hotkey_vertical').hidden = !dikey;
    const g = grupOf(b.L.el, dikey);
    b.slots.forEach((el, i) => { const ar = g?.querySelector(`.kui-ar[data-id="${dikey ? i : 10 + i}"]`); if (ar) ar.append(el); });
    ekCiz(b);
  }
  // yerleşim: görünen çerçeve ana çubuğun çerçevesine tam yapışık (yatayda üst, sığmazsa alt; dikeyde sağ, sığmazsa sol)
  let sonImza = '';
  function ekYerlestir(zorla = false) {
    const ana = anaCubuk(); if (!ana) return;
    const dikey = ana.classList.contains('dikey'), g = grupOf(ana, dikey); if (!g) return;
    const A = gorunen(g), z = zoom();
    const imza = [A.left, A.top, A.width, A.height, dikey, ekler.length, innerWidth].map((v) => Math.round(Number(v) || 0)).join(',');
    if (!zorla && imza === sonImza) return;
    sonImza = imza;
    const w = A.width, h = A.height, dolu = [A];
    const cakisir = (r) => dolu.some((q) => r.left < q.right - 8 && r.right > q.left + 8 && r.top < q.bottom - 8 && r.bottom > q.top + 8);
    const sigar = (r) => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && !cakisir(r);
    const kutu = (x, y) => ({ left: x, top: y, right: x + w, bottom: y + h });
    for (const b of ekler) {
      ekYon(b, dikey);
      const sol = Math.min(...dolu.map((q) => q.left)), sag = Math.max(...dolu.map((q) => q.right)), ust = Math.min(...dolu.map((q) => q.top));
      // yatay çubukların uçları yuvarlak başlık: saydam kenarlar üst üste bindirilir → çerçeveler kesintisiz birleşir
      // yatay: ana çubuğa paralel, üst üste yukarı doğru (dikeyde yana); aralarında boşluk kalmaz
      const ov = Math.max(0, dikey ? A.width - A.gw : A.height - A.gh) + (dikey ? A.gw : A.gh) * 2 / 45;   // + saydam kenar (45 px'lik parçada ~2 px)   // uç başlık taşması kadar bindir → gövdeler bitişik
      const adaylar = dikey ? [kutu(sag - ov, A.top), kutu(sol - w + ov, A.top)] : [kutu(A.left, ust - h + ov), kutu(A.left, Math.max(...dolu.map((q) => q.bottom)) - ov)];
      const r = adaylar.find(sigar) || adaylar[0];
      // kök öğeyi, görünen grubu r'ye oturacak şekilde konumla (grup kökün içinde kaymalı durabilir)
      const el = b.L.el, bg = grupOf(el, dikey);
      el.style.setProperty('--x', r.left / z + 'px'); el.style.setProperty('--y', r.top / z + 'px');
      const G = gorunen(bg);
      const dx = (G.left - r.left) / z, dy = (G.top - r.top) / z;
      el.style.setProperty('--x', (r.left / z - dx) + 'px'); el.style.setProperty('--y', (r.top / z - dy) + 'px');
      dolu.push(r);
    }
  }
  setInterval(() => { if (ekler.length && !surukle) ekYerlestir(); }, 150);
  // pet kısayol çubuğu için: ana + ek çubukların görünen çerçeveleri
  state.hotkeyCerceve = () => {
    const ana = anaCubuk(); if (!ana || ana.hidden || !ana.getClientRects().length) return null;
    const dikey = ana.classList.contains('dikey'), g = grupOf(ana, dikey); if (!g) return null;
    return { ana, dikey, A: gorunen(g), ekler: ekler.map((b) => { const bg = grupOf(b.L.el, dikey); return bg ? gorunen(bg) : null; }).filter(Boolean), z: zoom() };
  };   // ana çubuk taşınınca/döndürülünce yapışık kalır
  // ana çubuk sürüklenirken ek çubuklar her karede (requestAnimationFrame) ana çubuğun kayması kadar kaydırılır:
  // yalnız tek bir konum okuması (getBoundingClientRect), yerleşim hesabı yok → gecikmesiz, yapışık takip. Bırakınca tam yerleşim.
  let surukle = null;
  const kareTakip = () => {
    if (!surukle) return;
    const r = surukle.ana.getBoundingClientRect(), z = surukle.z;
    const dx = (r.left - surukle.x0) / z, dy = (r.top - surukle.y0) / z;
    if (dx !== surukle.dx || dy !== surukle.dy) {
      surukle.dx = dx; surukle.dy = dy;
      for (const k of surukle.ekler) { k.el.style.setProperty('--x', (k.x + dx) + 'px'); k.el.style.setProperty('--y', (k.y + dy) + 'px'); }
    }
    requestAnimationFrame(kareTakip);
  };
  addEventListener('pointerdown', (e) => {
    const ana = anaCubuk(); if (!ana || !ekler.length || !ana.contains(e.target)) return;
    const r = ana.getBoundingClientRect();
    surukle = { ana, z: zoom(), x0: r.left, y0: r.top, dx: 0, dy: 0, ekler: ekler.map((b) => ({ el: b.L.el, x: parseFloat(b.L.el.style.getPropertyValue('--x')) || 0, y: parseFloat(b.L.el.style.getPropertyValue('--y')) || 0 })) };
    requestAnimationFrame(kareTakip);
  }, true);
  const birak = () => { if (!surukle) return; surukle = null; requestAnimationFrame(() => ekYerlestir(true)); };
  addEventListener('pointerup', birak, true); addEventListener('pointercancel', birak, true);
  // (6.11) Save Quickslot "Number of quick slots to use" (0–3): açılabilecek en çok kısayol çubuğu sayısı; 0 → çubuklar gizli
  let azami = 3; try { const v = JSON.parse(localStorage.getItem('ko-hkpreset-' + character.id) || 'null')?.adet; if (Number.isFinite(v)) azami = Math.max(0, Math.min(3, v)); } catch {}
  function cubukSiniri(n) {
    azami = Math.max(0, Math.min(3, Number(n) || 0));
    while (ekler.length > Math.max(0, azami - 1)) ekKapat(ekler[ekler.length - 1]);
    for (const bar of document.querySelectorAll('.ko-hotkey')) bar.style.visibility = azami <= 0 ? 'hidden' : '';
  }
  function ekAc(d = {}) {
    if (!hasLayout('re_hotkey')) return;
    if (ekler.length >= Math.min(2, azami - 1)) { hud.notice?.(azami <= 1 ? 'You cannot open more shortcut bars. Increase "Number of quick slots to use" in Save Quickslot.' : `You can open up to ${azami} shortcut bars.`, 'hata'); return; }
    const L = buildLayout('re_hotkey', { className: 'ko-hotkey ko-hotkey-ek serbest' });
    { const ana = anaCubuk(); if (ana?.parentElement) ana.after(L.el); else (document.getElementById('kohud') || document.body).append(L.el); }   // (5.11) DOM'da ana çubuğun hemen ardına: pencerelere göre önceliği ana çubukla aynı (sonradan açılan pencereler üstte kalır)
    { const ana = anaCubuk(); if (ana?.style.zIndex) L.el.style.zIndex = ana.style.zIndex; }
    L.show('btn_open', false);
    for (let i = 0; i < 10; i++) { L.text(String(20 + i), ''); L.get('Hotkey_vertical')?.querySelectorAll(`.kui-tx[data-id="${i}"]`).forEach((e) => (e.textContent = '')); }
    const n = ekler.length;
    const b = { page: d.page || ((sayfa + n) % 8) + 1, L, slots: [], dikey: null };
    for (let i = 1; i <= 10; i++) {
      const el = document.createElement('div'); el.className = 'slot ek-slot'; el.dataset.ei = i;
      el.innerHTML = '<span class="ikon"></span><i class="bekleme"></i>';
      b.slots.push(el);
      yuvaBagla(el, () => ({ pg: b.page, i }));
    }
    const dugme = (id, fn, t) => L.all(id).forEach((e) => { e.style.pointerEvents = 'auto'; e.classList.add('kui-tik'); if (t) e.title = t; e.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); }); });
    dugme('btn_up', () => { b.page = ((b.page + 6) % 8) + 1; ekCiz(b); ekKaydet(); });
    dugme('btn_down', () => { b.page = (b.page % 8) + 1; ekCiz(b); ekKaydet(); });
    dugme('btn_close', () => ekKapat(b), 'Bu kısayol çubuğunu kapat');
    // döndür / kilit: ana çubuğun düğmelerini kullanır (hepsi birlikte döner)
    const anaDugme = (id) => { const ana = anaCubuk(); const dk = ana?.classList.contains('dikey'); grupOf(ana, dk)?.querySelector(`[data-id="${id}"]`)?.click(); setTimeout(() => ekYerlestir(true), 30); };
    dugme('btn_change', () => anaDugme('btn_change'), 'Döndür (yatay / dikey)');
    dugme('btn_lock', () => anaDugme('btn_lock'), 'Kilit: kapalı kilit = yetenekler sürüklenemez, açık kilit = sürüklenebilir');
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    ekler.push(b);
    ekYon(b, !!anaCubuk()?.classList.contains('dikey'));
    ekYerlestir(true); ekCiz(b); ekKaydet();
    requestAnimationFrame(() => { ekYerlestir(true); ekCiz(b); });
  }
  function ekKapat(b) {
    const i = ekler.indexOf(b); if (i < 0) return;
    b.L.el.remove(); ekler.splice(i, 1);
    ekler.forEach((x, k) => x.slots.forEach((el) => (el.dataset.ek = k)));
    ekYerlestir(true); ekKaydet();
  }
  const ekAcVeIsaretle = (d) => { ekAc(d); ekler.forEach((x, k) => x.slots.forEach((el) => (el.dataset.ek = k))); };
  addEventListener('ko-kisayol-ek', () => ekAcVeIsaretle());
  // önceki oturumdaki ek çubuklar
  setTimeout(() => { for (const d of ekDurum.slice(0, Math.max(0, Math.min(2, azami - 1)))) ekAcVeIsaretle(d); cubukSiniri(azami); }, 1600);

  // eşyayı (ör. Familiar Summon) geçerli sayfanın ilk boş yuvasına koy
  function esyaEkle(num, ad) {
    for (let i = 1; i <= 10; i++) {
      if (idOf(sayfa, i)) continue;
      atama[sayfa] ||= {}; atama[sayfa][i] = 'e:' + num; kaydet(); ciz();
      hud.info?.(`${ad || 'Item'} has been placed on the shortcut bar (key ${i % 10}).`, 'beceri'); return true;
    }
    hud.notice?.('There are no empty slots on the shortcut bar.', 'hata'); return false;
  }
  const esyaVar = (num) => Object.values(atama).some((pg) => Object.values(pg || {}).some((v) => v === 'e:' + num));
  // (4.11) yalnız ekranda görünen çubuklarda (geçerli sayfa + açık ek çubuklar) var mı — başka sayfada kalmış eski kayıt sağ tıkla yerleştirmeyi engellemesin
  const esyaGorunur = (num) => [sayfa, ...ekler.map((b) => b.page)].some((pg) => Object.values(atama[pg] || {}).some((v) => v === 'e:' + num));
  // (6.11) Save Quickslot (hotkey-preset.js): kayıtlı 10 yuvayı kısayol sayfasına uygular (yuva 1…9, 0 → 1…10)
  const sayfaAta = (pg, liste) => { atama[pg] = {}; (liste || []).forEach((id, k) => { if (id != null) atama[pg][k + 1] = id; }); kaydet(); ciz(); };
  return { sayfaAta, cubukSiniri, esyaEkle, esyaVar, esyaGorunur, dolu: (i) => !!al(i), kullan, ciz, sagTikId: () => sagTik, sagTikKullan: () => (sagTik != null ? kullanId(sagTik) : false) };
}
