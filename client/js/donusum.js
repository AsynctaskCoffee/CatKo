// KO dönüşüm (MAGIC_TYPE6) + karakter boyutu.
//  - Transformation Totem (379090000 / 379093000) ve Transformation Scroll (381001000) kısayol çubuğuna konur;
//    kullanınca KO'daki gibi dönüşüm listesi açılır: oyuncunun seviyesine uygun canavarlar seviye sırasıyla.
//  - Totem kalıcıdır, her dönüşüm 1 Transformation Gem harcar; parşömen kendisi harcanır (sunucu: donusum_yap).
//  - Dönüşünce karakter modeli gizlenir, canavar modeli (npc_<TransformID>, Size %) yerine çizilir; animasyonlar
//    karakterinkinden aynalanır (yürü/koş/bekle/saldırı/darbe/ölüm). Süre bitince kendiliğinden geri döner.
//  - Boyut (%): GM panelinden GM karakterlerine verilir; karakter modeli (ve dönüşüm modeli) ölçeklenir.
import * as THREE from '../vendor/three.module.min.js';
import { hasNpc, createNpc, hasMonster, createMonster, createCharacter } from './character.js';
import { applyGear } from './donanim.js';
import { koWindow, toFront } from './ko-pencere.js';
import { fromDb } from './esya.js';
import { mobFxTak } from './mobfx.js';
import { mobSilahTak } from './mob-silah.js';
const sonIt = new Map();

export const DONUSUM_ESYA = new Set([379090000, 379093000, 381001000]);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const simdi = () => Date.now() / 1000;

// karakter animasyonu → canavar animasyonu
function esle(mm, n, tek) {
  if (!mm || !n) return null;
  if (mm.has?.(n)) return n;
  if (/attack|atk|skill|cast|magic|shot|throw|blow|stab|swing/i.test(n)) return mm.has?.('attack') ? 'attack' : mm.has?.('attack1') ? 'attack1' : null;
  if (/struck|hit|damage/i.test(n)) return mm.has?.('struck') ? 'struck' : null;
  if (/dead|die/i.test(n)) return mm.has?.('dead') ? 'dead' : null;
  if (/run/i.test(n)) return mm.has?.('run') ? 'run' : 'walk';
  if (/walk/i.test(n)) return mm.has?.('walk') ? 'walk' : 'run';
  return tek ? null : 'breath';
}
function yamala(c) {
  if (c._donYama) return; c._donYama = true;
  const sc = c.setClip.bind(c), up = c.update.bind(c), po = c.playOnce.bind(c), so = c.stopOnce?.bind(c);
  c.setClip = (n, ...a) => { const r = sc(n, ...a); if (c._don && !(c._donTek > performance.now())) { const m = esle(c._don, n); if (m) c._don.setClip(m); } return r; };
  c.update = (dt, ...a) => { const r = up(dt, ...a); c._don?.update(dt, ...a); return r; };
  c.playOnce = (n, o = {}) => {
    const r = po(n, o);
    if (c._don) { const m = esle(c._don, n, true); if (m && c._don.playOnce(m, { hold: !!o.hold, speed: o.speed })) c._donTek = performance.now() + (o.hold ? 1e9 : 900); }
    return r;
  };
  c.stopOnce = (x) => { so?.(x); c._donTek = 0; c._don?.stopOnce?.(x); };
}
const olcek = (c) => (c._boyut || 100) / 100;
// dönüşmüşken karakterin kendi efektleri gizlenir (silah parıltısı, pathos, peri, efekt kanatları, klan bileziği);
// yalnız dönüşülen canavarın KO efektleri (n3fxplug: Burning Skeleton alevleri vb.) görünür. Sonradan kurulan efektler için 250 ms'de bir yinelenir.
function fxGizle(c, v) {
  for (const g of Object.values(c._glow || {})) for (const b of g.b || []) if (b) b.gizli = v;
  for (const b of c._pathos || []) if (b) b.gizli = v;
  for (const b of c._peri?.fx || []) if (b) b.gizli = v;
  for (const b of c._fxKanatFx || []) if (b) b.gizli = v;
  if (c._bilezik) c._bilezik.gizli = v;
  clearInterval(c._fxGizT); c._fxGizT = v ? setInterval(() => { if (!c._don) { clearInterval(c._fxGizT); return; } fxGizle.tek(c); }, 250) : null;
}
fxGizle.tek = (c) => {
  for (const g of Object.values(c._glow || {})) for (const b of g.b || []) if (b) b.gizli = true;
  for (const b of c._pathos || []) if (b) b.gizli = true;
  for (const b of c._peri?.fx || []) if (b) b.gizli = true;
  for (const b of c._fxKanatFx || []) if (b) b.gizli = true;
  if (c._bilezik) c._bilezik.gizli = true;
};
let FXM_F = null;
/** efekt yöneticisi (state.fx) — dönüşüm canavarının KO efektleri için */
export const donusumFxAyarla = (f) => { FXM_F = f; };
function olcekUygula(c) {
  c._taban ??= c.group.scale.clone();
  c.group.scale.copy(c._taban).multiplyScalar(olcek(c));
  if (c._don) c._don.group.scale.setScalar((c._donB || 100) / 100 * olcek(c));
}
/** karakter boyutu (%) — kendi avatarı ve uzak oyuncular */
export function boyutUygula(c, yuzde, onFit) {
  if (!c?.group) return;
  c._boyut = Math.max(10, Math.min(1000, Number(yuzde) || 100));
  olcekUygula(c); onFit?.(c._don?.group || c.group);
}
// KO insan görünümlü dönüşümler (Patrick, Menissiah, Cougar, Hera, Elmoradian / Karus Man-Woman, Magpie, Crisis, Ibex):
// modelleri oyuncu iskeletiyle (24 eklem) derilidir. Canavar gibi ayrı model yerine NPC'nin gövde parçaları oyuncunun kendi
// iskeletine giydirilir: oyuncunun tüm animasyonları (saldırı, yetenek…), elindeki silahlar, pathos eldiveni, peri ve kanatlar aynen kalır.
const INSAN = new Set([26008, 26009, 26010, 26011, 26012, 26013, 26014, 26015, 27000, 27001, 27002, 27003, 5870, 5871, 5903, 5904]);
function mulRow(a, b, o) { for (let r = 0; r < 4; r++) { const a0 = a[r * 4], a1 = a[r * 4 + 1], a2 = a[r * 4 + 2], a3 = a[r * 4 + 3]; for (let k = 0; k < 4; k++) o[r * 4 + k] = a0 * b[k] + a1 * b[4 + k] + a2 * b[8 + k] + a3 * b[12 + k]; } return o; }
function giydir(c, mm) {
  const inv = mm.rigInv, n = c.eklemAdlari?.length || 0;
  if (!inv || !c.joint || !c.addExtra || inv.length !== n) return null;
  const bones = inv.map(() => { const x = new THREE.Bone(); x.matrixAutoUpdate = false; x.matrixWorldAutoUpdate = false; return x; });
  const sk = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
  const eklenen = [];
  for (const m of [...mm.group.children]) if (m.isSkinnedMesh) { m.bindMode = THREE.DetachedBindMode; m.bind(sk, new THREE.Matrix4()); m.frustumCulled = false; m.userData.donusumParca = true; c.group.add(m); eklenen.push(m); }
  if (!eklenen.length) return null;
  const tmp = new Float32Array(16);
  // oyuncunun gövde / zırh / pelerin parçaları gizlenir (sonradan takılanlar da); silah, kanat, peri takıları (plug) görünür kalır
  const gizle = () => { for (const m of c.group.children) if (m.isSkinnedMesh && !m.userData.donusumParca && m.visible) { m.visible = false; m.userData.donGizli = true; } };
  const surus = () => { gizle(); for (let i = 0; i < n; i++) { const p = c.joint(i); if (p) bones[i].matrixWorld.fromArray(mulRow(inv[i], p, tmp)); } };
  surus();
  const off = c.addExtra(surus);
  return { kaldir() { off(); for (const m of eklenen) m.removeFromParent(); for (const m of c.group.children) if (m.userData.donGizli) { m.visible = true; delete m.userData.donGizli; } } };
}
// canavar iskeletinde el eklemleri (KO adları: R_hand / Ghost_R_Hand / Bip01 R Hand …)
const elBul = (mm, yan) => (mm?.eklemAdlari || []).findIndex((n) => new RegExp(`(^|[_\\s])${yan}[_\\s]?hand$`, 'i').test(String(n)));
const elleriVar = (mm) => elBul(mm, 'R') >= 0 || elBul(mm, 'L') >= 0;
// oyuncunun eldeki silah modelleri (yuva6 sağ / yuva8 sol) kopyalanıp canavarın el eklemlerine takılır; canavar ölçeği silaha yansımaz
function silahTasi(c, mm, d) {
  const s = Math.max(0.1, ((Number(d.b) || 100) / 100) * olcek(c));
  for (const [yuva, yan] of [[6, 'R'], [8, 'L']]) {
    const obj = c.plugObj?.('yuva' + yuva), M = c.plugM?.('yuva' + yuva), j = elBul(mm, yan);
    if (!obj || !M || j < 0) continue;
    const k = obj.clone(true), m = Float32Array.from(M);
    for (let i = 0; i < 12; i++) m[i] /= s;   // dönme satırları: canavar grubunun büyütmesini geri al
    mm.setPlug('don_yuva' + yuva, k, j, m);
  }
}
/** oyuncu dönüşmüşken kuşandıkları değişti (pathos eldiveni / silah çıkarıldı, takıldı…): dönüşüm modelindeki kopyalar da güncellenir —
 * oyuncu ırkı görünümü (irk_N) ve Orc Bandit modeli kendi applyGear'ıyla, GM el dönüşümünde taşınan silahlar yeniden kopyalanır */
export async function donusumGiydir(c, gear) {
  const mm = c?._don; if (!mm) return;
  try {
    if (/^irk_/.test(String(c._donKey))) await applyGear(mm, Number(String(c._donKey).slice(4)), gear || []);
    else if (c._donOrk) await applyGear(mm, 2, (gear || []).filter((g) => g[0] === 6 || g[0] === 8));
    if (c._donSilah && c._don === mm) { await Promise.resolve(); mm.setPlug?.('don_yuva6', null); mm.setPlug?.('don_yuva8', null); silahTasi(c, mm, c._donSilah); }
  } catch {}
}
/** dönüşüm görünümü: d = {pid, b, bit} ya da null (geri dön) */
// KO: Orc Bandit Officer'lar (1606 büyücü, 1631 okçu/rogue, 1636 savaşçı) oyuncu iskeleti upc_ka_tu ile derilidir →
// Tuarek iskeletine bağlanır; oyuncunun silahları ellerinde görünür ve oyuncunun saldırı animasyonları (yay dahil) aynen oynar.
const ORK = new Set([1606, 1631, 1636]);
const kaldir = (m) => { m._mobFx?.dur(); m.group.removeFromParent(); for (const g of Object.values(m._glow || {})) for (const b of g.b || []) b?.dispose?.(); for (const b of m._pathos || []) b?.dispose?.(); };
async function orkModeli(key, gear) {
  const [mm, drv] = await Promise.all([createNpc(key), createCharacter(2, {})]);
  if (!mm || !drv) return mm || null;
  for (const m of drv.group.children) if (m.isSkinnedMesh) m.visible = false;   // Tuarek gövdesi gizli: yalnız iskelet ve silahlar
  for (const m of [...mm.group.children]) if (m.isSkinnedMesh) { m.bind(drv.skeleton, m.bindMatrix); drv.group.add(m); }
  try { await applyGear(drv, 2, (gear || []).filter((g) => g[0] === 6 || g[0] === 8)); } catch {}
  drv.setClip('breath');
  return drv;
}
// KO: Transformation Scroll yalnız Moradon, Luferson Castle, El Morad Castle ve Eslant'ta kullanılır; süren parşömen dönüşümü
// diğer haritalarda karakteri dönüştürmez (etki simgesi ve süre sürer), bu haritalara dönünce model yine görünür. Totem her yerde.
export const SCROLL_BOLGE = new Set(['moradon', 'karus2004', 'elmo2004', 'eslantzone']);
export const donusumScroll = (d) => !!d && (!!d.sc || Number(d.esya) === 381001000 || Math.floor(Number(d.id) / 1000) === 472);   // sc: Patrick, Hera, Magpie… dönüşüm parşömenleri
export const donusumGorunur = (d, zone) => !!d && (!donusumScroll(d) || SCROLL_BOLGE.has(String(zone)));
export async function donusumGorsel(c, d, onFit, gear = null) {
  if (!c?.group) return;
  const istek = (c._donIstek = (c._donIstek || 0) + 1);
  // pid < 0: oyuncu ırkı görünümü (GM dönüşümü: −ırk kodu, ör. −4 Puri Tuarek / −1 Arch Tuarek); oyuncunun kuşandıklarıyla giydirilir
  const irk = Number(d?.pid) < 0 ? -Number(d.pid) : 0;
  const key = d?.pid ? (irk ? 'irk_' + irk : 'npc_' + d.pid) : null;
  if (c._donKey === key && (key ? c._don : true)) return;
  if (c._don) { kaldir(c._don); c._don = null; } c._donSilah = null; c._donOrk = false;
  c._donGiy?.kaldir(); c._donGiy = null;
  c._donKey = null; c.group.visible = true; clearTimeout(c._donT); fxGizle(c, false);
  if (!d || !key || !(Number(d.bit) > simdi())) { onFit?.(c.group); return; }
  let mm = null;
  if (irk) {
    mm = await createCharacter(irk, { face: Number(d.yuz) || 0, hair: Number(d.sac) || 0 }).catch(() => null);
    if (mm) { try { await applyGear(mm, irk, gear || []); } catch {} mm.setClip?.('breath'); }
  } else {
    // oyuna girişte NPC/mob model kataloğu henüz yüklenmemiş olabilir: hazır olana dek bekle (en çok ~30 sn)
    for (let i = 0; i < 120 && !hasNpc(key) && !hasMonster(key); i++) { await new Promise((r) => setTimeout(r, 250)); if (istek !== c._donIstek) return; }
    c._donOrk = ORK.has(Number(d.pid)) && hasNpc(key);
    mm = await (ORK.has(Number(d.pid)) && hasNpc(key) ? orkModeli(key, gear) : hasNpc(key) ? createNpc(key) : hasMonster(key) ? createMonster(key) : Promise.resolve(null)).catch(() => null);
  }
  if (istek !== c._donIstek) return;
  if (!mm) { onFit?.(c.group); return; }
  if (INSAN.has(Number(d.pid))) {
    const g = giydir(c, mm);
    if (g) { c._donGiy = g; c._don = mm; c._donKey = key; c._donB = 100; c._donT = setTimeout(() => donusumGorsel(c, null, onFit, gear), Math.max(0, (Number(d.bit) - simdi()) * 1000)); onFit?.(c.group); return; }
  }
  yamala(c);
  c._don = mm; c._donKey = key; c._donB = Number(d.b) || 100;
  // GM dönüşümü: elleri olan modellerde (insan / yaratık eli, Castellan Ghost…) silahlar canavarın eline taşınır; pathos eldiveni, peri ve diğer efektler görünür kalır
  const gmEl = !!d.gm && !irk && elleriVar(mm);
  c.group.parent?.add(mm.group); c.group.visible = false; fxGizle(c, !gmEl && !irk);
  olcekUygula(c); mm.setClip?.('breath');
  if (gmEl) { silahTasi(c, mm, d); c._donSilah = d; } else c._donSilah = null;
  // canavarın kendi KO efektleri (n3fxplug) — mobdaki gibi eklemlerine bağlı
  if (!irk) mobFxTak(mm, key, FXM_F || (() => window.__ko?.state?.fx), (c._donB / 100) * olcek(c)).catch(() => {});
  // canavarın kendi silahı (KO K_MONSTER iWeapon1/2: Burning Skeleton'ın kılıcı vb.) — oyuncunun silahları ele taşınmadıysa
  if (!irk && !gmEl) mobSilahTak(mm, { pid: Number(d.pid) }).catch(() => {});
  c._donT = setTimeout(() => donusumGorsel(c, null, onFit, gear), Math.max(0, (Number(d.bit) - simdi()) * 1000));
  onFit?.(mm.group);
}

/** Dönüşüm listesi penceresi (totem / parşömen kullanılınca) */
export function initDonusum({ sb, character, hud, state }) {
  let win = null, veri = null, esyaNo = null;
  const rpc = async (fn, a = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...a }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };
  const kalanYaz = (bit) => { const s = Math.max(0, Math.round(bit - simdi())); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function ciz() {
    if (!win) return;
    const akt = state.donusum && state.donusum.bit > simdi() ? state.donusum : null;
    const L = veri?.liste || [];
    win.querySelector('.dn-govde').innerHTML = `
      ${akt ? `<div class="dn-aktif">Dönüşüm: <b>${esc(akt.ad)}</b> · kalan <i class="dn-kalan">${kalanYaz(akt.bit)}</i> <button data-k="bitir" class="ay-dugme">Geri dön</button></div>` : ''}
      <div class="dn-bilgi">${esyaNo === 381001000 ? 'Transformation Scroll: dönüşümde parşömen harcanır.' : `Transformation Totem: her dönüşüm 1 Transformation Gem harcar (çantanda <b>${veri?.gem ?? 0}</b>).`} Seviyen: <b>${veri?.seviye ?? '-'}</b></div>
      ${gemYok() ? '<div class="dn-uyari">Totemi kullanmak için çantanda Transformation Gem olmalı.</div>' : ''}
      <div class="dn-liste">${L.map((d) => `<div class="dn-satir" data-id="${d.id}"><b>${esc(d.ad)}</b><span>Sv. ${d.seviye}</span><i>${Math.round(d.sure / 60)} dk</i></div>`).join('') || '<div class="nk-not">Seviyene uygun dönüşüm yok.</div>'}</div>
      <div class="nd-dugmeler"><button data-k="don" class="ay-dugme" disabled>Dönüş</button></div>`;
  }
  let secili = null;
  const gemYok = () => esyaNo !== 381001000 && veri && !(Number(veri.gem) > 0);
  async function ac(num) {
    if (Number(num) === 381001000 && !SCROLL_BOLGE.has(String(character.zone))) { hud.notice?.('You cannot transform in this area.', 'hata'); return; }
    esyaNo = Number(num);
    if (!win) {
      win = document.createElement('div'); win.id = 'donusum-pencere'; win.className = 'ko-panel ko-pencere';
      win.innerHTML = `<div class="ay-baslik">Transformation</div><div class="dn-govde"></div>`;
      document.body.append(win); koWindow(win);
      const k = document.createElement('button'); k.className = 'ko-kapat'; k.dataset.k = 'kapat'; k.title = 'Kapat'; win.append(k);
      win.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); toFront(win); });
      win.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') kapat(); if (ev.key === 'Enter' && secili) don(); });
      win.addEventListener('click', async (ev) => {
        const s = ev.target.closest('.dn-satir');
        if (s) { secili = Number(s.dataset.id); win.querySelectorAll('.dn-satir').forEach((x) => x.classList.toggle('secili', x === s)); win.querySelector('[data-k=don]').disabled = gemYok(); return; }
        const b = ev.target.closest('[data-k]')?.dataset.k;
        if (b === 'kapat') return kapat();
        if (b === 'don') return don();
        if (b === 'bitir') { await bitir(); ciz(); }
      });
      win.addEventListener('dblclick', (ev) => { const s = ev.target.closest('.dn-satir'); if (s) { secili = Number(s.dataset.id); don(); } });
      win._t = setInterval(() => { const e = win?.querySelector('.dn-kalan'); if (e && state.donusum) e.textContent = kalanYaz(state.donusum.bit); }, 1000);
    }
    toFront(win); secili = null;
    win.querySelector('.dn-govde').innerHTML = '<p class="ay-not">Yükleniyor…</p>';
    try { veri = await rpc('donusum_liste', { p_esya: esyaNo }); } catch { veri = null; }
    ciz();
  }
  function kapat() { if (!win) return; clearInterval(win._t); win.remove(); win = null; }
  async function don() {
    if (!secili) return;
    if (gemYok()) { hud.notice?.('Skill Failed - You need to have the Transformation Gem.', 'hata'); return; }
    try {
      const d = await rpc('donusum_yap', { p_id: secili });
      if (!d?.ok) { hud.notice?.(d?.reason || 'Transformation failed.', 'hata'); return; }
      uygula({ id: d.id, ad: d.ad, pid: d.pid, b: d.b, bit: Number(d.bit), esya: esyaNo });
      hud.info?.(`You have transformed into ${d.ad} (${Math.round(d.sure / 60)} min).`, 'tamam');
      Promise.resolve(state.inv?.reload?.()).then(() => dispatchEvent(new CustomEvent('ko-esya-kullanildi', { detail: { donusum: true } }))); kapat();
    } catch {}
  }
  async function bitir() { try { await rpc('donusum_bitir'); } catch {} uygula(null); }
  function uygula(d) {
    state.donusum = d && d.bit > simdi() ? d : null;
    const m = state.donusum && donusumGorunur(state.donusum, character.zone) ? { pid: d.pid, b: d.b, bit: d.bit, gm: !!d.gm } : null;   // parşömen: izinli haritalarda model
    state.net?.setDon?.(m);
    if (state.avatar) donusumGorsel(state.avatar, m, state.fitKendi, state.gear);
    clearTimeout(uygula._t);
    if (state.donusum) uygula._t = setTimeout(() => { rpc('donusum_bitir').catch(() => {}); uygula(null); hud.info?.('Transformation has ended.'); }, (d.bit - simdi()) * 1000);
    dispatchEvent(new CustomEvent('ko-donusum', { detail: state.donusum }));
    // sol üst etki simgesi: TS (totem / parşömen ikonu) + kalan süre; çift tıkla kaldırılınca eski görünüme dönülür
    if (state.donusum) {
      const num = Number(d.esya) || ({ 470: 379090000, 471: 379093000, 472: 381001000 })[Math.floor(Number(d.id) / 1000)] || 379090000;
      let esyaIt = null; for (const [, e] of state.inv?.items || []) if (Number(e.row.item_num) === num) { esyaIt = e.it; break; }
      esyaIt ||= sonIt.get(num) || null; if (esyaIt) sonIt.set(num, esyaIt);
      const ekle = (it) => dispatchEvent(new CustomEvent('ko-etki', { detail: { id: null, esyaIt: it, ad: `Transformation: ${d.ad}`, anahtar: 'donusum', bitis: d.bit * 1000 } }));
      ekle(esyaIt);
      if (!esyaIt) sb.from('items').select('*').eq('num', num).maybeSingle().then(({ data }) => { if (data && state.donusum) { const it = fromDb(data); sonIt.set(num, it); ekle(it); } }, () => {});
    } else dispatchEvent(new CustomEvent('ko-etki-sil', { detail: 'donusum' }));
  }
  // girişte süren dönüşüm
  const d0 = character.donusum; if (d0 && Number(d0.bit) > simdi()) setTimeout(() => uygula({ ...d0, bit: Number(d0.bit) }), 1500);
  return { ac, kapat, bitir, uygula };
}
