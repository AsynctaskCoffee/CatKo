// GM Paneli → NPC Editörü (mob editörü düzeninde). Sol: tüm NPC listesi (KO K_NPC kataloğu, 883 NPC) + süzgeçler,
// üzerine gelince model önizleme. Sağ sekmeler:
//   Özellikler  — ad, model, boyut, isim üstü yazı; "Konumuma doğur" (yeni yerleşim)
//   Yerleşimler — bu NPC'nin tüm bölgelerdeki kayıtları: git, buraya taşı, yön, boyut, model/ad değiştir, sil
//   Modeller    — tüm NPC ve mob modelleri (npc_<pid>): üzerine gelince önizleme, tıkla → seçili NPC'ye uygula
// Değişiklikler GM denetimli RPC'lerle (gm_npc_spawn / gm_npc_guncelle / gm_npc_kimlik / gm_npc_delete) ve Realtime ile herkese yansır.
import { koWindow, toFront } from './ko-pencere.js';
import { showModel, hideModel } from './model-onizleme.js';
import { goster as kartGoster, gizle as kartGizle } from './onizleme-kart.js';
import { createNpc } from './character.js';
const esc2 = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

import { npcModelAnahtarlari, loadNpcMeta } from './character.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROW = 30;
const TIPLER = [[0, 'Konuşan NPC'], [21, 'Tüccar (ticaret)'], [31, 'Depocu (depo)'], [49, 'Rahip (iyileştirme)'], [77, 'Demirci (tamir)']];
const deg = (r) => ((Math.round(r * 180 / Math.PI) % 360) + 360) % 360;

export function initNpcEditor({ state, player, sb, character, zone, hud, remoteBase }) {
  let sadeceOzel = false;
  let win = null, kat = [], view = [], sel = null, tab = 'ozellik', q = '', bolge = '', sadeceYer = false, modelQ = '', modelTur = 'hepsi';
  let yer = [], zones = {}, mobPid = new Map(), npcPid = new Map(), hoverT = 0, silOnay = null;
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };
  const zoneName = (z) => zones[z] || z || '—';
  const yerOf = (id) => yer.filter((y) => y.npc_id === id);
  const npcs = () => state.npcs;

  async function loadAll() {
    const [k, { data: y }, { data: zs }, { data: mb }, { data: oz }] = await Promise.all([
      fetch('./assets/npc_katalog.json').then((r) => r.json()).catch(() => []),
      sb.from('npc_placements').select('id,zone,npc_id,model,name,x,z,dir,size,etiket,etiket_renk').limit(20000),
      sb.from('zones').select('id,name'),
      sb.from('monsters').select('pid,name,level').order('level').limit(5000),
      sb.from('npc_ozel').select('*').eq('aktif', true).order('id'),
    ]);
    yer = y || []; zones = Object.fromEntries((zs || []).map((z) => [z.id, z.name]));
    // katalog + veritabanında olup katalogda olmayan NPC kimlikleri
    const by = new Map(k.map((c) => [c.id, { id: c.id, n: c.n, m: c.m, s: c.s || 100 }]));
    for (const o of oz || []) by.set(o.id, { id: o.id, n: o.ad, m: o.model, s: o.boyut || 100, ozel: true, tip: o.tip || 0, selam: o.selam || '' });
    for (const r of yer) if (!by.has(r.npc_id)) by.set(r.npc_id, { id: r.npc_id, n: r.name, m: r.model, s: r.size || 100 });
    kat = [...by.values()].sort((a, b) => a.id - b.id);
    for (const c of kat) if (c.m && !npcPid.has(c.m)) npcPid.set(c.m, c.n);
    for (const m of mb || []) { const key = 'npc_' + m.pid; if (m.pid && !mobPid.has(key)) mobPid.set(key, `${m.name} (Sv ${m.level})`); }
    if (!npcModelAnahtarlari().length) await loadNpcMeta(`${remoteBase}/npc`).catch(() => null);
  }
  function filter() {
    const s = q.trim().toLowerCase();
    view = kat.filter((c) => {
      const y = yerOf(c.id);
      if (sadeceYer && !y.length) return false;
      if (sadeceOzel && !c.ozel) return false;
      if (bolge && !y.some((x) => x.zone === bolge)) return false;
      return !s || c.n.toLowerCase().includes(s) || String(c.id).includes(s) || (c.m || '').toLowerCase().includes(s);
    });
    win.querySelector('.mb-sayi').textContent = `${view.length} NPC · ${yer.length} yerleşim`;
    win.querySelector('.mb-liste').scrollTop = 0;
    renderList();
  }
  function renderList() {
    const list = win.querySelector('.mb-liste'), inner = list.querySelector('.mb-ic');
    inner.style.height = view.length * ROW + 'px';
    const a = Math.max(0, Math.floor(list.scrollTop / ROW) - 5), b = Math.min(view.length, Math.ceil((list.scrollTop + list.clientHeight) / ROW) + 5);
    let h = '';
    for (let i = a; i < b; i++) {
      const c = view[i], y = yerOf(c.id), burada = y.filter((x) => x.zone === zone).length;
      h += `<div class="mb-satir${sel === c ? ' secili' : ''}${c.ozel ? ' ozel' : c.m ? '' : ' boss'}" data-i="${i}" style="top:${i * ROW}px"><b class="mb-lv">${c.id}</b><span class="mb-ad">${esc(c.n)}</span><i>${y.length ? `${y.length} yer${burada ? ` · ${burada} burada` : ''}` : c.m ? '' : 'model yok'}</i></div>`;
    }
    inner.innerHTML = h;
  }
  function select(c) { sel = c; silOnay = null; renderList(); renderDetail(); }
  const modelAdi = (m) => (m ? `${m}${npcPid.get(m) ? ' · ' + npcPid.get(m) : mobPid.get(m) ? ' · ' + mobPid.get(m) : ''}` : 'model yok');

  function renderDetail() {
    const box = win.querySelector('.mb-detay');
    win.querySelectorAll('.mb-sekme button').forEach((b) => b.classList.toggle('secili', b.dataset.t === tab));
    if (!sel && tab !== 'model') { box.innerHTML = '<p class="ay-not">Listeden bir NPC seç. Üzerine gelince modeli görünür. <b>Modeller</b> sekmesinde tüm NPC ve mob görünümleri var.</p>'; return; }
    const c = sel; let h = '';
    if (c) h += `<div class="mb-baslik"><div class="mb-dad">${esc(c.n)}${c.ozel ? ' <small class="oz">ÖZEL</small>' : ''}</div><div class="mb-dno">NPC #${c.id} · ${esc(modelAdi(c.m))} · ${yerOf(c.id).length} yerleşim</div></div>`;
    if (tab === 'ozellik') {
      h += `<div class="mb-form">
          <label><span>Ad</span><input name="f_ad" type="text" value="${esc(c.n)}"></label>
          <label><span>Model</span><input name="f_model" type="text" value="${esc(c.m || '')}" placeholder="npc_12345"></label>
          <label><span>Boyut %</span><input name="f_boyut" type="number" min="10" max="500" value="${c.s || 100}"></label>
          <label><span>Yön (°)</span><input name="f_yon" type="number" min="0" max="359" value="${deg(state.yaw + Math.PI)}"></label></div>
        <div class="nd-dugmeler"><button data-k="dogur" class="ay-dugme">Konumuma doğur</button><button data-k="modelsec" class="ay-dugme">Model seç…</button></div>
        <div class="nd-dugmeler"><button data-k="hepsine" class="ay-dugme" ${yerOf(c.id).length ? '' : 'disabled'}>Ad ve modeli tüm yerleşimlerine uygula</button></div>
        ${c.ozel ? `<div class="mb-alt-baslik">Özel NPC</div>
          <div class="mb-form"><label><span>Görevi</span><select name="f_tip">${TIPLER.map(([v, a]) => `<option value="${v}" ${Number(c.tip) === v ? 'selected' : ''}>${a}</option>`).join('')}</select></label></div>
          <label class="ne-selam"><span>Konuşma (selam) metni</span><textarea name="f_selam" rows="3" maxlength="300" placeholder="Boş: göreve göre KO selamı">${esc(c.selam || '')}</textarea></label>
          <div class="nd-dugmeler"><button data-k="oz_kaydet" class="ay-dugme">Özel NPC'yi kaydet</button><button data-k="oz_sil" class="ay-dugme mb-sil">${silOnay === 'oz' + c.id ? 'Emin misin? Tekrar bas' : 'Özel NPC\'yi kaldır'}</button></div>
          <p class="ay-not">Tüccar: GM, NPC'nin ticaret penceresine çantasından eşya sürükleyip fiyat belirleyerek tezgâhı doldurur. Depocu: depo; Rahip: iyileştirme; Demirci: tamir.</p>`
        : `<div class="nd-dugmeler"><button data-k="oz_kopya" class="ay-dugme">Özel NPC olarak kopyala</button></div>`}
        <p class="ay-not">Doğurulan NPC bulunduğun yere, girilen yön ve boyutla konur. Haritadaki NPC'ye sağ tıklayınca ayrıntılı düzenleme penceresi açılır (döndür, taşı, isim üstü yazı).</p>`;
    } else if (tab === 'yer') {
      const y = yerOf(c.id).sort((a, b) => (a.zone === zone ? -1 : 0) - (b.zone === zone ? -1 : 0) || Math.hypot(a.x - player.position.x, a.z - player.position.z) - Math.hypot(b.x - player.position.x, b.z - player.position.z));
      h += `<table class="mb-dogma ne-yer"><tr><th>Bölge</th><th>Konum</th><th>Yön</th><th>Boyut</th><th>Model</th><th></th></tr>
        ${y.map((r) => `<tr data-id="${r.id}"><td>${esc(zoneName(r.zone))}</td><td>${Math.round(r.x)}, ${Math.round(r.z)}${r.zone === zone ? ` <small>${Math.round(Math.hypot(r.x - player.position.x, r.z - player.position.z))} m</small>` : ''}</td>
          <td><input type="number" data-f="dir" value="${Math.round(r.dir || 0)}"></td><td><input type="number" data-f="size" value="${r.size || 100}"></td>
          <td title="${esc(modelAdi(r.model))}">${esc(r.model || '—')}</td>
          <td class="mb-dug">${r.zone === zone ? `<button data-k="y_git" data-id="${r.id}">Git</button><button data-k="y_tasi" data-id="${r.id}">Buraya</button><button data-k="y_duzen" data-id="${r.id}">Düzenle</button>` : ''}<button data-k="y_kaydet" data-id="${r.id}">Kaydet</button><button data-k="y_sil" data-id="${r.id}">${silOnay === r.id ? 'Sil?' : '✕'}</button></td></tr>`).join('') || '<tr><td colspan="6">Bu NPC hiçbir haritada yok. Özellikler → Konumuma doğur.</td></tr>'}</table>`;
    } else {
      const s = modelQ.trim().toLowerCase();
      const hepsi = npcModelAnahtarlari().map((m) => ({ m, mob: mobPid.has(m) && !npcPid.has(m) })).filter((x) => (modelTur === 'hepsi' || (modelTur === 'mob') === x.mob) && (!s || x.m.includes(s) || modelAdi(x.m).toLowerCase().includes(s)));
      h += `<div class="nd-satir"><input name="m_ara" placeholder="Model ara (ad ya da npc_kodu)" value="${esc(modelQ)}" autocomplete="off" style="flex:1">
          <select name="m_tur"><option value="hepsi" ${modelTur === 'hepsi' ? 'selected' : ''}>Tümü</option><option value="npc" ${modelTur === 'npc' ? 'selected' : ''}>NPC görünümleri</option><option value="mob" ${modelTur === 'mob' ? 'selected' : ''}>Mob görünümleri</option></select> <span>${hepsi.length}</span></div>
        <div class="ne-modeller">${hepsi.slice(0, 1500).map((x) => `<div class="ne-model${x.mob ? ' mob' : ''}${c && c.m === x.m ? ' secili' : ''}" data-m="${esc(x.m)}" title="${esc(modelAdi(x.m))}"><b>${esc(x.m.replace('npc_', ''))}</b>${esc((npcPid.get(x.m) || mobPid.get(x.m) || '').slice(0, 26))}</div>`).join('')}</div>
        <p class="ay-not">Yeşil: NPC görünümü, kırmızı: mob görünümü. Üzerine gel → önizleme; tıkla → ${c ? `<b>${esc(c.n)}</b> için model olarak seçilir (Özellikler → doğur ya da tüm yerleşimlerine uygula)` : 'önce bir NPC seç'}.</p>`;
    }
    box.innerHTML = h;
  }
  const val = (n) => win.querySelector(`[name=${n}]`)?.value;
  const satirOf = (r) => ({ pid: r.id, id: r.npc_id, m: r.model, n: r.name, x: r.x, z: r.z, d: r.dir || 0, s: r.size || 100, e: r.etiket || '', ec: r.etiket_renk || '' });
  async function onClick(e) {
    const tb = e.target.closest('.mb-sekme [data-t]'); if (tb) { tab = tb.dataset.t; renderDetail(); return; }
    const row = e.target.closest('.mb-satir'); if (row) { select(view[Number(row.dataset.i)]); return; }
    const md = e.target.closest('.ne-model');
    if (md && sel) { sel.m = md.dataset.m; hud.notice?.(`${sel.n}: model ${modelAdi(sel.m)}`); tab = 'ozellik'; renderDetail(); renderList(); return; }
    const b = e.target.closest('button'); const k = b?.dataset.k; if (!k) return;
    try {
      if (k === 'kapat') return close();
      if (k === 'oz_yeni') {
        const o = await rpc('gm_npc_ozel_kaydet', { p_id: null, p_veri: { ad: 'Yeni NPC', model: sel?.m || 'npc_11000', boyut: 100, tip: 0 } });
        const c = { id: o.id, n: o.ad, m: o.model, s: o.boyut, ozel: true, tip: o.tip, selam: o.selam || '' }; kat.unshift(c); q = ''; win.querySelector('[name=ara]').value = ''; filter(); tab = 'ozellik'; select(c);
        dispatchEvent(new Event('ko-npc-ozel')); hud.notice?.(`Custom NPC #${o.id} created. Set its name, model and role, then spawn it at its location.`); return;
      }
      if (!sel) return;
      if (k === 'oz_kopya') {
        const o = await rpc('gm_npc_ozel_kaydet', { p_id: null, p_veri: { ad: sel.n + ' (özel)', model: sel.m || '', boyut: sel.s || 100, tip: 0 } });
        const c = { id: o.id, n: o.ad, m: o.model, s: o.boyut, ozel: true, tip: o.tip, selam: '' }; kat.unshift(c); filter(); select(c); dispatchEvent(new Event('ko-npc-ozel')); hud.notice?.(`Custom NPC #${o.id} created.`); return;
      }
      if (k === 'oz_kaydet' && sel.ozel) {
        const o = await rpc('gm_npc_ozel_kaydet', { p_id: sel.id, p_veri: { ad: (val('f_ad') || '').trim(), model: (val('f_model') || '').trim(), boyut: Number(val('f_boyut')) || 100, tip: Number(val('f_tip')) || 0, selam: win.querySelector('[name=f_selam]')?.value || '' } });
        Object.assign(sel, { n: o.ad, m: o.model, s: o.boyut, tip: o.tip, selam: o.selam || '' }); dispatchEvent(new Event('ko-npc-ozel')); renderList(); renderDetail(); hud.notice?.('Custom NPC saved.'); return;
      }
      if (k === 'oz_sil' && sel.ozel) {
        if (silOnay !== 'oz' + sel.id) { silOnay = 'oz' + sel.id; renderDetail(); return; }
        for (const r of yerOf(sel.id)) { await rpc('gm_npc_delete', { p_id: r.id }); if (r.zone === zone) npcs()?.remove?.(npcs()?.byPid?.(r.id)); }
        await rpc('gm_npc_ozel_kaydet', { p_id: sel.id, p_veri: { aktif: false } });
        yer = yer.filter((x) => x.npc_id !== sel.id); kat = kat.filter((x) => x !== sel); sel = null; silOnay = null; dispatchEvent(new Event('ko-npc-ozel')); filter(); renderDetail(); hud.notice?.('Custom NPC removed.'); return;
      }
      if (k === 'modelsec') { tab = 'model'; renderDetail(); return; }
      if (k === 'dogur') {
        const ad = (val('f_ad') || sel.n).trim(), m = (val('f_model') || '').trim(), s = Math.max(10, Math.min(500, Number(val('f_boyut')) || 100)), d = ((Number(val('f_yon')) || 0) % 360 + 360) % 360;
        const r = await rpc('gm_npc_spawn', { p_zone: zone, p_npc_id: sel.id, p_model: m, p_name: ad, p_x: +player.position.x.toFixed(2), p_z: +player.position.z.toFixed(2), p_dir: d, p_size: s });
        yer.push(r); npcs()?.apply?.(satirOf(r)); hud.notice?.(`${ad} spawned (record ${r.id}).`); renderList(); renderDetail(); return;
      }
      if (k === 'hepsine') {
        const ad = (val('f_ad') || sel.n).trim(), m = (val('f_model') || '').trim();
        for (const r of yerOf(sel.id)) { const y = await rpc('gm_npc_kimlik', { p_id: r.id, p_model: m, p_name: ad }); Object.assign(r, y); if (r.zone === zone) npcs()?.apply?.(satirOf(r)); }
        sel.n = ad; sel.m = m || sel.m; hud.notice?.(`${yerOf(sel.id).length} placements updated.`); renderList(); renderDetail(); return;
      }
      const r = yer.find((x) => x.id === Number(b.dataset.id)); if (!r) return;
      if (k === 'y_git') { state.target = null; player.position.set(r.x, state.heightAt(r.x, r.z), r.z); return; }
      if (k === 'y_duzen') { const en = npcs()?.byPid?.(r.id); if (en) state.npcUi?.duzenle?.(en); return; }
      const kaydet = async (x, z) => {
        const tr = b.closest('tr'), g = (f) => Number(tr.querySelector(`[data-f=${f}]`)?.value);
        const y = await rpc('gm_npc_guncelle', { p_id: r.id, p_x: x ?? r.x, p_z: z ?? r.z, p_dir: ((g('dir') || 0) % 360 + 360) % 360, p_size: Math.max(10, Math.min(500, g('size') || 100)), p_etiket: r.etiket || '', p_renk: r.etiket_renk || null });
        if (y && typeof y === 'object') Object.assign(r, y); else Object.assign(r, { x: x ?? r.x, z: z ?? r.z, dir: g('dir'), size: g('size') });
        if (r.zone === zone) npcs()?.apply?.(satirOf(r));
      };
      if (k === 'y_tasi') { await kaydet(+player.position.x.toFixed(2), +player.position.z.toFixed(2)); hud.notice?.('NPC moved to your position.'); renderDetail(); return; }
      if (k === 'y_kaydet') { await kaydet(); hud.notice?.('NPC saved.'); renderDetail(); return; }
      if (k === 'y_sil') {
        if (silOnay !== r.id) { silOnay = r.id; renderDetail(); return; }
        await rpc('gm_npc_delete', { p_id: r.id }); yer = yer.filter((x) => x !== r); if (r.zone === zone) npcs()?.remove?.(npcs()?.byPid?.(r.id));
        silOnay = null; hud.notice?.('NPC deleted.'); renderList(); renderDetail();
      }
    } catch { /* ileti gösterildi */ }
  }
  async function open(host = null) {
    if (win) { if (host && win.parentNode !== host) host.append(win); win.hidden = false; if (!host) toFront(win); return; }
    await loadAll();
    const zs = [...new Set(yer.map((s) => s.zone))].sort((a, b) => zoneName(a).localeCompare(zoneName(b)));
    win = document.createElement('div'); win.id = 'npc-editor'; win.className = 'ko-panel ko-pencere';
    win.innerHTML = `<div class="ay-baslik">NPC Editörü</div>
      <div class="mb-ust"><input name="ara" placeholder="Ara: NPC adı, numarası ya da modeli" autocomplete="off">
        <select name="bolge"><option value="">Tüm bölgeler</option>${zs.map((z) => `<option value="${esc(z)}" ${z === zone ? '' : ''}>${esc(zoneName(z))}</option>`).join('')}</select>
        <label><input type="checkbox" name="yerli"> Yalnızca yerleştirilenler</label><label><input type="checkbox" name="ozeller"> Yalnızca özel NPC'ler</label><button data-k="oz_yeni" class="ay-dugme">Yeni özel NPC</button><span class="mb-sayi"></span></div>
      <div class="mb-govde"><div class="mb-liste"><div class="mb-ic"></div></div>
        <div class="mb-cubuk" title="Sürükle: listeyi daralt / genişlet · Tıkla: gizle / göster"><i></i></div>
        <div class="mb-sag"><div class="ay-sekmeler mb-sekme"><button data-t="ozellik">Özellikler</button><button data-t="yer">Yerleşimler</button><button data-t="model">Modeller</button></div><div class="mb-detay"></div></div></div>`;
    // host verilirse GM paneline gömülü (sayfa içi, açık tema), yoksa ayrı KO penceresi
    if (host) { win.className = 'g2-gomulu'; host.append(win); }
    else { document.body.append(win); koWindow(win); toFront(win); const k = document.createElement('button'); k.className = 'ko-kapat'; k.dataset.k = 'kapat'; k.title = 'Kapat'; win.append(k); }
    win.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(win); });
    win.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' && !host) close(); });
    win.addEventListener('wheel', (e) => e.stopPropagation());
    win.querySelector('.mb-liste').addEventListener('scroll', () => requestAnimationFrame(renderList));
    { const govde = win.querySelector('.mb-govde'), cubuk = win.querySelector('.mb-cubuk');
      let gen = Number(localStorage.getItem('neListeGen')) || 340, kapali = localStorage.getItem('neListeKapali') === '1';
      const uygula = () => { govde.style.setProperty('--mb-sol', (kapali ? 0 : gen) + 'px'); govde.classList.toggle('mb-kapali', kapali); try { localStorage.setItem('neListeGen', gen); localStorage.setItem('neListeKapali', kapali ? '1' : '0'); } catch {} requestAnimationFrame(renderList); };
      uygula();
      cubuk.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); cubuk.setPointerCapture(e.pointerId);
        const x0 = e.clientX, g0 = kapali ? 0 : gen; let oynadi = false;
        const mv = (ev) => { const dx = ev.clientX - x0; if (Math.abs(dx) > 3) oynadi = true; if (!oynadi) return; const w = Math.max(0, Math.min(700, g0 + dx)); kapali = w < 40; if (!kapali) gen = w; govde.style.setProperty('--mb-sol', (kapali ? 0 : w) + 'px'); };
        const up = () => { cubuk.removeEventListener('pointermove', mv); cubuk.removeEventListener('pointerup', up); if (!oynadi) kapali = !kapali; uygula(); };
        cubuk.addEventListener('pointermove', mv); cubuk.addEventListener('pointerup', up);
      });
    }
    // üzerine gelince model önizleme (NPC listesi ve model ızgarası)
    const onizle = (key, ad, el) => { clearTimeout(hoverT); hoverT = setTimeout(() => { const r = win.getBoundingClientRect(), rr = el.getBoundingClientRect(); void r; if (key) kartGoster(el, { anahtar: 'npc|' + key + '|' + ad, bilgiHtml: `<b>${esc2(ad)}</b><i>model ${esc2(key)}</i>`, yap: () => createNpc(key) }); else kartGizle(); }, 120); };
    win.addEventListener('pointerover', (e) => {
      const row = e.target.closest('.mb-satir'); if (row) { const c = view[Number(row.dataset.i)]; if (c) onizle(c.m, `#${c.id} ${c.n}`, row); return; }
      const md = e.target.closest('.ne-model'); if (md) onizle(md.dataset.m, modelAdi(md.dataset.m), md);
    });
    win.addEventListener('pointerleave', () => { clearTimeout(hoverT); hideModel(); kartGizle(); });
    let qt = 0;
    win.addEventListener('input', (e) => {
      // Yerleşimler tablosu: boyut / yön değişince bu haritadaki NPC anında önizlenir (Kaydet ile kalıcı olur)
      const f = e.target.dataset?.f;
      if (f === 'size' || f === 'dir') {
        const tr = e.target.closest('tr'), r = yer.find((x) => x.id === Number(tr?.dataset.id));
        if (r && r.zone === zone) { const g = (k) => Number(tr.querySelector(`[data-f=${k}]`)?.value);
          npcs()?.apply?.({ ...satirOf(r), s: Math.max(10, Math.min(500, g('size') || 100)), d: ((g('dir') || 0) % 360 + 360) % 360 }); }
        return;
      }
      // Özellikler: özel NPC boyutu → bu haritadaki tüm yerleşimleri anında önizlenir
      if (e.target.name === 'f_boyut' && sel?.ozel) { const v = Math.max(10, Math.min(500, Number(e.target.value) || 100)); for (const r of yerOf(sel.id)) if (r.zone === zone) npcs()?.apply?.({ ...satirOf(r), s: v }); return; }
      const n = e.target.name; if (!n || /^(f_)/.test(n)) return;
      if (n === 'm_ara') { clearTimeout(qt); const v = e.target.value, pos = e.target.selectionStart; qt = setTimeout(() => { modelQ = v; renderDetail(); const i = win.querySelector('[name=m_ara]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 200); return; }
      if (n === 'm_tur') { modelTur = e.target.value; renderDetail(); return; }
      if (n === 'f_tip' || n === 'f_selam') return;
      if (n === 'ara') { clearTimeout(qt); const v = e.target.value; qt = setTimeout(() => { q = v; filter(); }, 150); return; }
      if (n === 'bolge') bolge = e.target.value;
      if (n === 'yerli') sadeceYer = e.target.checked;
      if (n === 'ozeller') sadeceOzel = e.target.checked;
      filter();
    });
    win.addEventListener('click', onClick);
    filter(); renderDetail();
  }
  function close() { hideModel(); kartGizle(); win?.remove(); win = null; q = ''; bolge = ''; sadeceYer = false; }
  return { open, close };
}
