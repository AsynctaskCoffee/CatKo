// KO 2369 (deadsoft) klan pencereleri — orijinal yerleşimler (assets/ui/klanui):
//   re_creat_clan (klan adı), re_clan_break (ayrılma / dağıtma uyarısı + "a + b = ?" onay sorusu),
//   re_clan_clanpoint (Clan Point biriktirme), re_knightsmantleshop (pelerin dükkânı: renk + desen + önizleme),
//   re_knights_crest (sembol kaydı açıklaması). Metinler yerleşimlerin kendi İngilizce metinleri ve KO Texts_us.tbl.
import { ekUI, hasLayout, buildLayout, draggable } from './kui.js';
import { toFront } from './ko-pencere.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
export const hazir = () => ekUI('klanui').then((ok) => ok && hasLayout('re_creat_clan'));
let acik = null;   // aynı anda tek klan penceresi

/** yerleşimi ekranın ortasında aç; Esc / X kapatır */
function pencere(ad, cls) {
  acik?.kapat();
  const L = buildLayout(ad, { className: `ko-klanko ko-pencere ${cls || ''}` });
  (document.getElementById('kohud') || document.body).append(L.el);
  L.el.style.pointerEvents = 'auto'; L.el.style.zIndex = 4300;
  const r = L.el.getBoundingClientRect(), p = L.el.offsetParent || document.body;
  L.el.style.left = Math.max(0, Math.round((p.clientWidth - (parseFloat(L.el.style.width) || r.width)) / 2)) + 'px';
  L.el.style.top = Math.max(0, Math.round((p.clientHeight - (parseFloat(L.el.style.height) || r.height)) / 2)) + 'px';
  draggable(L, 36);
  L.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(L.el); });
  L.el.addEventListener('keydown', (e) => e.stopPropagation());
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); kapat(); } };
  addEventListener('keydown', esc, true);
  const kapat = () => { L.el.remove(); removeEventListener('keydown', esc, true); if (acik?.L === L) acik = null; };
  acik = { L, kapat };
  for (const id of ['btn_close', 'btn_close2']) L.click(id, kapat);
  return { L, kapat };
}

/** KO klan kurma: "Oh~ho~.. Welcome my brave friend.. Tell me, what would you like to name your clan?" (Texts 6507) */
export async function klanAdiSor(onTamam) {
  if (!(await hazir())) return false;
  const { L, kapat } = pencere('re_creat_clan', 'ko-klan-kur');
  L.text('Text_Message', 'Oh~ho~.. Welcome my brave friend.. Tell me, what would you like to name your clan?');
  const inp = L.input('Edit_Clan', { maxLength: 15 });
  const ok = () => { const v = inp.value.trim(); if (!v) return; kapat(); onTamam(v); };
  L.click('btn_yes', ok); L.click('btn_no', kapat);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  setTimeout(() => inp.focus(), 30);
  return true;
}

/** KO re_clan_break: önce uyarılar ("Warnings when leaving a clan"), Next → "Leaving clan confirmation question" a + b = ? */
export async function klanAyrilOnay(onTamam, { hata } = {}) {
  if (!(await hazir())) return false;
  const { L, kapat } = pencere('re_clan_break', 'ko-klan-ayril');
  const [uyari, soru] = L.all('base_warning').concat(L.all('base_question'));
  const a = 2 + Math.floor(Math.random() * 8), b = 2 + Math.floor(Math.random() * 8);
  L.show('base_question', false); L.show('base_warning', true);
  const sq = L.get('base_question');
  sq.querySelectorAll('[data-id="str_question"]').forEach((e) => (e.textContent = `${a} + ${b} = ?`));
  const ed = sq.querySelector('[data-id="edit_result"]'); let inp = null;
  if (ed) { ed.textContent = ''; inp = document.createElement('input'); inp.className = 'kui-input'; inp.maxLength = 3; ed.append(inp); }
  // her grubun kendi düğmeleri (yerleşimde aynı adlı iki takım)
  const tik = (grup, id, fn) => grup?.querySelectorAll(`[data-id="${id}"]`).forEach((e) => { e.classList.add('kui-tik'); e.onclick = (ev) => { ev.stopPropagation(); fn(); }; });
  const uyariG = L.get('base_warning');
  tik(uyariG, 'btn_cancel', kapat); tik(uyariG, 'btn_ok', () => { uyariG.hidden = true; sq.hidden = false; setTimeout(() => inp?.focus(), 30); });
  const onay = () => { if (Number(inp?.value) === a + b) { kapat(); onTamam(); } else { kapat(); hata?.('Wrong answer. The action has been canceled.'); } };
  tik(sq, 'btn_cancel', kapat); tik(sq, 'btn_ok', onay);
  inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') onay(); });
  void uyari; void soru;
  return true;
}

/** KO re_clan_clanpoint: "Clan point accumulation" — Saved Clan CONT (ulus puanın) · Clan CONT to save · Clan point conversion (36 NP = 1 CP) */
export async function klanPuanKO({ np, onKaydet }) {
  if (!(await hazir())) return false;
  const { L, kapat } = pencere('re_clan_clanpoint', 'ko-klan-puan');
  // çerçevenin 9 parçalı iç dokusu tonlarda farklı (orta parça açık): iç alan tek, açık renk zeminle örtülür (yazılar / kutular üstte kalır)
  { const kok = L.el.firstElementChild || L.el, imgs = [...kok.children].filter((c) => c.classList.contains('kui-img'));
    const z = document.createElement('div'); z.className = 'kk-zemin'; (imgs[8] || kok.firstChild)?.after(z); }
  L.text('text_realm', fmt(np)); L.text('text_clan', '0');
  const inp = L.input('edit_point', { type: 'number', min: 36, step: 36 });
  const yaz = () => L.text('text_clan', fmt(Math.floor((Number(inp.value) || 0) / 36)));
  inp.addEventListener('input', yaz);
  const kaydet = async () => { const n = Math.floor(Number(inp.value) || 0); if (await onKaydet(n)) kapat(); };
  L.click('btn_save', kaydet);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') kaydet(); });
  setTimeout(() => inp.focus(), 30);
  return true;
}

/** KO re_knights_crest: sembol kaydı açıklaması (1. Symbol.bmp 2. 32px X 32px 3. 5,000,000 Coins) · Preview → sembol düzenleyici, Later → kapat */
export async function sembolKO(onDevam) {
  if (!(await hazir())) return false;
  const { L, kapat } = pencere('re_knights_crest', 'ko-klan-sembol');
  for (const id of ['str_tga1', 'str_tga2', 'str_bmp1', 'str_bmp2']) L.show(id, false);
  // web sürümü: sembol oyun klasörüne konmaz, düzenleyicide çizilir / resim yüklenir — madde metinleri buna göre (aynı KO düzeni)
  for (const e of L.el.querySelectorAll('.kui-tx')) {
    const t = e.textContent.trim();
    if (/^1\. Please name/.test(t)) e.textContent = "1. Draw your Knights symbol or load an image (Symbol.bmp / .tga / .png).";
    else if (/^2\. The size/.test(t)) e.textContent = '2. The size of the symbol should be set to 32px X 32px.';
    else if (/^3\. Registering/.test(t)) e.textContent = '3. Registering the Knights symbol will cost 5,000,000 Coins.';
    else if (/^(32px X 32px|5,000,000)$/.test(t)) e.hidden = true;
  }
  L.click('btn_ok', () => { kapat(); onDevam(); }); L.click('btn_cancel', kapat);
  return true;
}

// (7.11) KO re_knightsmantleshop (NTTGame orijinali): üstte çerçeveler (img_pattern 0–5, Cloak no / 100), altta pelerin dokuları (img_color 0–5, no % 100),
//   solda karakter önizlemesi; bilgi kutusu: Noah · Clan CONT · Purchase Grade · Cloak.tbl açıklaması; Purchase · Cancel · Ticket Exchange.
//   Boyanan pelerinlerde sağda re_palette ("Paint costs 1,000 clan points." · Input Color Manually · R G B · Confirm).
const boyanir = (r) => (r >= 29 && r <= 33) || (r >= 60 && r <= 80);
export async function pelerinDukkanKO({ liste, klan, lider, sembol, pelerinTuval, satinAl, kosul, onizleme, hud }) {
  if (!(await hazir())) return false;
  const { L, kapat: kapat0 } = pencere('re_knightsmantleshop', 'ko-klan-pelerin');
  let oniz = null; const ozel = L.get('area_char');
  if (ozel && onizleme) onizleme(ozel).then((o) => { oniz = o; ciz(); }).catch((e) => console.warn('cape preview', e));
  let P = null;   // boya penceresi
  const kapat = () => { oniz?.kapat(); P?.el.remove(); kapat0(); };
  if (acik) acik.kapat = kapat;
  L.click('btn_close', kapat);
  for (const [id, t] of [['btn_purchase', 'Purchase'], ['btn_cancel', 'Cancel'], ['btn_purchase2', 'Ticket Exchange']]) L.get(id)?.querySelectorAll('.kui-tx').forEach((e) => { e.textContent = t; });
  L.show('btn_purchase2', true);
  L.show('img_cloak', false); L.show('img_cloak_back', false);   // NTTGame düzeninde sol altta büyük pelerin resmi yok (önizleme yalnız 3B karakterde)
  liste = liste.filter((p) => Number(p.renk) < 95);   // (7.11) yılbaşı (95 / 96) ve kral (97–99) pelerinleri dükkânda listelenmez (istek)
  const renkler = [...new Set(liste.map((p) => Number(p.renk)))].sort((a, b) => a - b);
  const desenleri = (r) => [...new Set(liste.filter((p) => Number(p.renk) === r).map((p) => Number(p.desen)))].sort((a, b) => a - b);
  let renk = Number(klan.pelerin ?? 0) % 100, desen = Math.floor(Number(klan.pelerin ?? 0) / 100);
  if (!renkler.includes(renk)) renk = renkler[0] ?? 0;
  if (!desenleri(renk).includes(desen)) desen = desenleri(renk)[0] ?? 0;
  let rSayfa = Math.max(0, Math.floor(renkler.indexOf(renk) / 6)), dSayfa = Math.max(0, Math.floor(desenleri(renk).indexOf(desen) / 6));
  const bul = () => liste.find((p) => Number(p.renk) === renk && Number(p.desen) === desen);
  let rgb = klan.pelerin_rgb != null ? Number(klan.pelerin_rgb) : 0xffffff;
  const boya = async (id, no, sb) => {
    const e = L.get(id); if (!e) return;
    const cv = await pelerinTuval(no, sb, 128, boyanir(no % 100) ? rgb : null); cv.className = 'kk-tuval'; e.replaceChildren(cv);
  };
  // ---- boya penceresi (re_palette) — dükkânın sağına yapışık
  let paletSoz = null;
  const paletAc = () => (paletSoz ||= paletKur());   // (7.11) ciz() art arda çağrılınca iki boya penceresi açılıyordu
  const paletKur = async () => {
    if (P) return P;
    if (!(await ekUI('palet').catch(() => false)) || !hasLayout('re_palette')) return null;
    const W = buildLayout('re_palette', { className: 'ko-palet ko-klan-palet' }); P = W;
    (document.getElementById('kohud') || document.body).append(W.el);
    W.el.style.position = 'absolute'; W.el.style.zIndex = 4301;
    W.el.addEventListener('pointerdown', (e) => e.stopPropagation()); W.el.addEventListener('keydown', (e) => e.stopPropagation());
    W.text('notice', 'Paint costs 1,000 clan points.'); W.text('notice2', 'Input Color Manually');
    W.get('apply')?.querySelectorAll('.kui-tx').forEach((t) => { t.textContent = 'Confirm'; });
    for (const t of W.el.querySelectorAll('.kui-tx')) { const x = t.textContent.trim(); if (x === 'R' || x === 'G' || x === 'B') t.classList.add('pl-' + x.toLowerCase()); }
    const kutu = ['edit_r', 'edit_g', 'edit_b'].map((id, i) => W.input(id, { type: 'text', value: String((rgb >> (16 - i * 8)) & 255), maxLength: 3, inputMode: 'numeric' }));
    W._yaz = () => kutu.forEach((k, i) => { if (k && document.activeElement !== k) k.value = String((rgb >> (16 - i * 8)) & 255); });
    kutu.forEach((k, i) => k?.addEventListener('input', () => { k.value = k.value.replace(/\D/g, '').slice(0, 3); const n = Math.min(255, parseInt(k.value, 10) || 0); const sh = 16 - i * 8; rgb = (rgb & ~(255 << sh)) | (n << sh); ciz(); }));
    const pal = W.get('img_palette');
    if (pal) {
      const cv = document.createElement('canvas'); cv.width = 255; cv.height = 255; cv.className = 'pl-tuval';
      const c = cv.getContext('2d', { willReadFrequently: true }), gx = c.createLinearGradient(0, 0, 255, 0);
      ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'].forEach((r, i) => gx.addColorStop(i / 6, r));
      c.fillStyle = gx; c.fillRect(0, 0, 255, 255);
      const gy = c.createLinearGradient(0, 0, 0, 255); gy.addColorStop(0, 'rgba(136,136,144,0)'); gy.addColorStop(1, 'rgba(136,136,144,1)');
      c.fillStyle = gy; c.fillRect(0, 0, 255, 255);
      pal.append(cv);
      let sur = false;
      const al = (e) => { const r = cv.getBoundingClientRect(); const x = Math.max(0, Math.min(254, (e.clientX - r.left) * 255 / r.width)), y = Math.max(0, Math.min(254, (e.clientY - r.top) * 255 / r.height));
        const d = c.getImageData(x | 0, y | 0, 1, 1).data; rgb = (d[0] << 16) | (d[1] << 8) | d[2]; W._yaz(); ciz(); };
      const pg = W.get('palette') || pal; pg.style.pointerEvents = 'auto'; pg.querySelectorAll('*').forEach((x) => { x.style.pointerEvents = 'auto'; }); pg.style.cursor = 'crosshair';
      pg.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); sur = true; try { pg.setPointerCapture(e.pointerId); } catch {} al(e); });
      pg.addEventListener('pointermove', (e) => { if (sur) al(e); });
      pg.addEventListener('pointerup', () => { sur = false; }); pg.addEventListener('pointercancel', () => { sur = false; });
    }
    W.click('apply', async () => { const p = bul(); if (p && (await satinAl(p, kosul(p).uzun, rgb))) ciz(); });
    return W;
  };
  const paletYerles = () => {
    if (!P) return; const r = L.el.getBoundingClientRect(), par = P.el.offsetParent || document.body, pr = par.getBoundingClientRect();
    const z = parseFloat(getComputedStyle(par).zoom) || 1;
    P.el.style.left = Math.round((r.right - pr.left) / z + 4) + 'px'; P.el.style.top = Math.round((r.top - pr.top) / z) + 'px';
  };
  const ciz = async () => {
    const ds = desenleri(renk);
    dSayfa = Math.max(0, Math.min(dSayfa, Math.ceil(ds.length / 6) - 1));
    const rs = renkler.slice(rSayfa * 6, rSayfa * 6 + 6), dsS = ds.slice(dSayfa * 6, dSayfa * 6 + 6);
    L.text('text_colorpage', String(rSayfa + 1)); L.text('text_patternpage', String(dSayfa + 1));
    for (let i = 0; i < 6; i++) {
      const r = rs[i], d = dsS[i];
      L.get('area_color_' + i)?.classList.toggle('kk-secili', r === renk);
      L.get('area_pattern_' + i)?.classList.toggle('kk-secili', d === desen);
      if (r != null) boya('img_color' + i, r); else L.get('img_color' + i)?.replaceChildren();
      if (d != null) boya('img_pattern' + i, d * 100 + renk); else L.get('img_pattern' + i)?.replaceChildren();
    }
    const p = bul();
    oniz?.guncelle(desen * 100 + renk, Number(p?.tip) === 2, sembol, boyanir(renk) ? rgb : null);
    const k = p ? kosul(p) : null;
    L.text('text_money', p && Number(p.fiyat) > 0 ? `${fmt(p.fiyat)} Noah` : '');
    L.text('text_royalty', p && Number(p.cp) > 0 ? `${fmt(p.cp)} Clan CONT` : '');
    L.text('text_grade', p && k.derece ? `Purchase Grade: ${k.derece}` : '');
    L.text('text_notice', !p ? 'This cape is not available.' : [p.aciklama, k.neden].filter(Boolean).join('\n'));
    for (const e of L.all('text_notice')) { e.style.whiteSpace = 'pre-line'; e.querySelectorAll('.kui-tx').forEach((x) => { x.style.whiteSpace = 'pre-line'; }); }
    L.get('btn_purchase')?.classList.toggle('kui-pasif', !p || !!k.neden);
    if (boyanir(renk) && p) { await paletAc(); if (P) { P.el.hidden = false; P._yaz?.(); paletYerles(); } } else if (P) P.el.hidden = true;
  };
  for (let i = 0; i < 6; i++) {
    L.click('area_color_' + i, () => { const r = renkler[rSayfa * 6 + i]; if (r == null) return; renk = r; const ds = desenleri(r); if (!ds.includes(desen)) desen = ds[0] ?? 0; dSayfa = Math.max(0, Math.floor(ds.indexOf(desen) / 6)); ciz(); });
    L.click('area_pattern_' + i, () => { const d = desenleri(renk)[dSayfa * 6 + i]; if (d != null) { desen = d; ciz(); } });
  }
  const sayfa = (tur, d) => { if (tur === 'r') rSayfa = Math.max(0, Math.min(Math.ceil(renkler.length / 6) - 1, rSayfa + d)); else dSayfa = Math.max(0, Math.min(Math.ceil(desenleri(renk).length / 6) - 1, dSayfa + d)); ciz(); };
  L.click('btn_colordown', () => sayfa('r', -1)); L.click('btn_colorup', () => sayfa('r', 1));
  L.click('btn_left', () => oniz?.dondur(-1)); L.click('btn_right', () => oniz?.dondur(1));
  L.click('btn_zoom', () => { const z = oniz?.yakinlas?.(); L.get('btn_zoom')?.classList.toggle('secili', !!z); });   // (7.11) büyüteç: sırt / pelerin yakın plan ↔ tüm boy
  L.click('btn_patterndown', () => sayfa('d', -1)); L.click('btn_patternup', () => sayfa('d', 1));
  L.click('btn_cancel', kapat);
  L.click('btn_purchase', async () => { const p = bul(); if (!p || kosul(p).neden) return; if (await satinAl(p, kosul(p).uzun, boyanir(renk) ? rgb : null)) ciz(); });
  // KO Ticket Exchange: pelerin değiştirme bileti (TICKET_EXCHANGE.tbl'de pelerin bileti yok) → çantada bilet yoksa uyarı
  L.click('btn_purchase2', () => hud?.notice?.('You do not have a ticket to exchange.', 'hata'));
  new MutationObserver(paletYerles).observe(L.el, { attributes: true, attributeFilter: ['style'] });
  const bekci = setInterval(() => { if (!L.el.isConnected) { clearInterval(bekci); P?.el.remove(); oniz?.kapat(); } }, 500);   // Esc / başka pencere ile kapanınca boya penceresi de
  ciz();
  return true;
}

/** (7.11) KO re_cloakshopnpc — [Cape Merchant] Habice (26031): "What do you want to trade?" · Cape · Register Knights Symbol · Walk away (orijinal pencere, ulusa göre portre) */
export async function pelerinciKO({ ulus, model, onCape, onSymbol }) {
  if (!(await hazir()) || !hasLayout('re_cloakshopnpc')) return false;
  const { L, kapat } = pencere('re_cloakshopnpc', 'ko-pelerinci');
  L.el.classList.remove('ko-klanko'); L.el.classList.add('ko-npcmenu', 'kui-dokulu');   // (7.11) yazılar diğer NPC menüleriyle aynı (koyu, gölgesiz konuşma metni)
  L.show('img_npc_ka', Number(ulus) !== 2); L.show('img_npc_el', Number(ulus) === 2);
  // portre: KO yerleşiminde img_npc_ka / el dokusuz (istemci NPC portresini çizer) → NPC menüsündeki 3B portre
  const yer = L.get(Number(ulus) === 2 ? 'img_npc_el' : 'img_npc_ka');
  if (yer && model) { Object.assign(yer.style, { borderRadius: '50%', overflow: 'hidden' }); import('./npc-menu.js').then((M) => M.portre(model, yer, () => L.el.isConnected)).then(() => { const cv = yer.querySelector('canvas'); if (cv) Object.assign(cv.style, { width: '100%', height: '100%', display: 'block' }); }).catch(() => {}); }
  L.text('Text_NpcName', '');
  L.text('Text_Title', 'What do you want to trade?');
  L.click('btn_mantle', () => { kapat(); onCape?.(); });
  L.click('btn_application', () => { kapat(); onSymbol?.(); });
  L.click('btn_close', kapat); L.click('btn_close2', kapat);
  return true;
}
