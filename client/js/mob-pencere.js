// GM Paneli → Mob Editörü (KO pencere sistemi). Veriler Supabase'de: monsters (şablon), monster_drops (% şanslı düşenler),
// spawners (doğurucu: nokta, çap, en fazla adet, doğma süresi), mob_instances (canlılar; her mob kendi doğma sayacıyla).
// Sunucu mobları K_MONSTER / K_NPCPOS'tan gelir; doğurucular kapalı başlar, GM açar. Özel mob = mevcut mobun kopyası.
import { koWindow, toFront } from './ko-pencere.js';
import { showModel, hideModel } from './model-onizleme.js';
import { goster as kartGoster, gizle as kartGizle } from './onizleme-kart.js';
import { createNpc } from './character.js';
const esc2 = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

import { loadMeta as loadEsyaMeta, iconHtml, fromDb, tooltipHtml } from './esya.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROW = 30;
const sure = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} sa ${Math.round((s % 3600) / 60)} dk` : s >= 60 ? `${Math.floor(s / 60)} dk${s % 60 ? ' ' + (s % 60) + ' sn' : ''}` : `${s} sn`);
const FIELDS = [['name', 'Ad', 'text'], ['level', 'Seviye'], ['hp', 'Can'], ['damage', 'Hasar'], ['atk', 'Saldırı'], ['ac', 'Savunma'], ['hitrate', 'İsabet'], ['evade', 'Kaçınma'],
  ['exp', 'EXP'], ['money', 'Para (Noah)'], ['attack_range', 'Saldırı menzili (×0.1 m)'], ['size', 'Boyut %'], ['pid', 'Görünüm (NPC_Looks)'], ['boss', 'Boss (0/1)']];

export function initMobWindow({ state, player, sb, character, zone, hud, say }) {
  let silOnay = null, silT = 0;
  let win = null, mobs = [], view = [], sel = null, tab = 'ozellik', q = '', bolge = '', lvMin = 0, lvMax = 255, sadeceDogan = false;
  let spawners = [], drops = [], zones = {}, hoverT = 0;
  let acikGrup = null, grupEsya = [], dusSec = null, grupSec = null;   // Düşenler sekmesinde içeriği açık eşya grubu (KO MAKE_ITEM_GROUP)
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };
  const zoneName = (z) => zones[z] || z || '—';
  const spOf = (sid) => spawners.filter((s) => s.sid === sid);

  async function loadAll() {
    // Supabase REST tek istekte en fazla 1000 satır döndürür: tüm moblar/doğurucular sayfa sayfa çekilir
    const hepsi = async (yap) => { const out = []; for (let i = 0; ; i += 1000) { const { data, error } = await yap().range(i, i + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) return { data: out }; } };
    const [{ data: m }, { data: sp }, { data: zs }] = await Promise.all([
      hepsi(() => sb.from('monsters').select('*').order('level').order('name').order('sid')),
      hepsi(() => sb.from('spawners').select('*').order('id')),
      hepsi(() => sb.from('zones').select('id,name').order('id')),
    ]);
    mobs = m || []; spawners = sp || []; zones = Object.fromEntries((zs || []).map((z) => [z.id, z.name]));
    if (!mobs.length) {   // sunucu tablosu henüz dolmadıysa sitedeki veriden (salt okunur)
      const r = await fetch('./assets/mob-db/moblar.json').catch(() => null);
      if (r?.ok) { const D = await r.json(), F = D.alanlar, c = (x, k) => x[F.indexOf(k)];
        mobs = D.moblar.map((x) => ({ sid: c(x, 'sid'), name: c(x, 'ad'), level: c(x, 'seviye'), hp: c(x, 'can'), exp: c(x, 'exp'), atk: c(x, 'saldiri'), damage: c(x, 'hasar'), ac: c(x, 'savunma'),
          hitrate: c(x, 'isabet'), evade: c(x, 'kacinma'), money: c(x, 'para'), boss: c(x, 'boss'), pid: c(x, 'pid'), size: c(x, 'boyut'), attack_range: c(x, 'menzil'), _ro: true }));
        spawners = Object.entries(D.dogma).flatMap(([sid, arr]) => arr.map((s, i) => ({ id: -(i + 1), sid: Number(sid), zone: s[0], x: s[2], z: s[3], max_count: s[4], radius: s[5], regen_sec: s[6], enabled: false, source: 'server', _ro: true })));
        zones = { ...D.bolgeler, ...zones };
      }
    }
  }
  function filter() {
    const s = q.trim().toLowerCase();
    view = mobs.filter((m) => {
      if (m.level < lvMin || m.level > lvMax) return false;
      const sp = spOf(m.sid);
      if (sadeceDogan && !sp.length) return false;
      if (bolge && !sp.some((x) => x.zone === bolge)) return false;
      return !s || m.name.toLowerCase().includes(s) || String(m.sid) === s;
    });
    win.querySelector('.mb-sayi').textContent = `${view.length} mob`;
    win.querySelector('.mb-liste').scrollTop = 0;
    renderList();
  }
  function renderList() {
    const list = win.querySelector('.mb-liste'), inner = list.querySelector('.mb-ic');
    inner.style.height = view.length * ROW + 'px';
    const a = Math.max(0, Math.floor(list.scrollTop / ROW) - 5), b = Math.min(view.length, Math.ceil((list.scrollTop + list.clientHeight) / ROW) + 5);
    let h = '';
    for (let i = a; i < b; i++) {
      const m = view[i], sp = spOf(m.sid), on = sp.filter((x) => x.enabled).length;
      h += `<div class="mb-satir${sel === m ? ' secili' : ''}${m.boss ? ' boss' : ''}${m.custom ? ' ozel' : ''}" data-i="${i}" style="top:${i * ROW}px"><b class="mb-lv">${m.level}</b><span class="mb-ad">${esc(m.name)}</span><i>${sp.length ? `${sp.length} nokta${on ? ` · ${on} açık` : ''}` : ''}</i></div>`;
    }
    inner.innerHTML = h;
  }
  async function select(m) {
    if (sel !== m) { acikGrup = null; grupEsya = []; dusSec = null; grupSec = null; }
    sel = m; renderList();
    drops = [];
    if (!m._ro) {
      const { data } = await sb.from('monster_drops').select('item_num,chance').eq('sid', m.sid).order('chance', { ascending: false });
      drops = data || [];
      const nums = drops.filter((d) => d.item_num > 0).map((d) => d.item_num);
      const { data: its } = nums.length ? await sb.from('items').select('*').in('num', nums) : { data: [] };
      const byNum = new Map((its || []).map((r) => [r.num, r]));
      // eksi kod: KO MAKE_ITEM_GROUP (gruptan rastgele eşya)
      for (const d of drops) d.items = d.item_num > 0 ? byNum.get(d.item_num) : { num: d.item_num, name: `Eşya grubu ${-d.item_num} (rastgele eşya)` };
    }
    renderDetail();
  }
  function renderDetail() {
    const box = win.querySelector('.mb-detay');
    win.querySelectorAll('.mb-sekme button').forEach((b) => b.classList.toggle('secili', b.dataset.t === tab));
    if (!sel) { box.innerHTML = '<p class="ay-not">Düzenlemek için listeden bir mob seç ya da <b>Yeni mob</b> oluştur. Mobun üzerine gelince görüntüsü açılır.</p>'; return; }
    const m = sel, ro = !!m._ro;
    let h = `<div class="mb-baslik"><div class="mb-dad${m.boss ? ' boss' : ''}">${esc(m.name)}${m.boss ? ' <small>BOSS</small>' : ''}${m.custom ? ' <small class="oz">ÖZEL</small>' : ''}</div><div class="mb-dno">Mob #${m.sid} · Seviye ${m.level}</div></div>`;
    if (ro) h += '<p class="ay-not">Mob tabloları sunucuya henüz aktarılmadı (site yayınlandıktan birkaç dakika sonra otomatik aktarılır). Şimdilik yalnızca görüntüleme.</p>';
    if (tab === 'ozellik') {
      h += `<div class="mb-form">${FIELDS.map(([k, l, t]) => `<label><span>${l}</span><input name="f_${k}" type="${t || 'number'}" value="${esc(m[k] ?? 0)}" ${ro ? 'disabled' : ''}></label>`).join('')}</div>
        <div class="nd-dugmeler"><button data-k="kaydet" class="ay-dugme" ${ro ? 'disabled' : ''}>Kaydet</button><button data-k="kopya" class="ay-dugme" ${ro ? 'disabled' : ''}>Özel mob olarak kopyala</button></div>
        <div class="nd-dugmeler"><button data-k="yumurta" class="ay-dugme" ${ro ? 'disabled' : ''}>Mob yumurtası: konumuma doğur</button>${sel.custom ? `<button data-k="sil" class="ay-dugme mb-sil" ${ro ? 'disabled' : ''}>${silOnay === sel.sid ? 'Emin misin? Tekrar bas' : 'Özel mobu sil'}</button>` : ''}</div>`;
    } else if (tab === 'dus') {
      // envanter tipi: her düşen eşya bir yuva, şansı altında; eşya grubu (KO MAKE_ITEM_GROUP) yuvasına tıklayınca içeriği aynı biçimde,
      // her eşyanın gerçek şansı = grup şansı / grup eşya sayısı
      const yz = (v) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
      const toplam = drops.reduce((a, d) => a + (Number(d.chance) || 0), 0);
      const yuva = (it, alt, { sec = false, data = '', baslik = '', rozet = '', grup = false } = {}) => `<button class="g2-slot${sec ? ' secili' : ''}${grup ? ' mb-grup-slot' : ''}" ${data} title="${esc(baslik)}" style="--d:${grup ? '#8b5cf6' : ({ 1: '#6aa8ff', 2: '#eab308', 3: '#22c55e', 4: '#d4b45c', 5: '#94a3b8', 11: '#a78bfa', 12: '#e98ba6' }[it.ItemType] || '#cbd5e1')}">
          <span class="g2-slot-ik">${grup ? `<b class="mb-g-ik">G${-it.Num}</b>` : iconHtml(it, 40)}${rozet ? `<em>${rozet}</em>` : ''}</span><span class="g2-slot-oran">${alt}</span></button>`;
      const secD = drops.find((d) => d.item_num === dusSec);
      h += `<div class="mb-dus-hedef" data-esya-birak="1"><b>Eşya ekle</b><span>GM çantasından (I) bir eşyayı buraya sürükle ya da numarasını yaz</span>
          <div class="nd-satir"><input name="d_num" type="number" placeholder="Eşya no (grup için eksi: -12)"><input name="d_sans" type="number" step="0.1" value="10" title="% şans"><span class="mb-yuzde">%</span><button data-k="d_ekle" class="g2-ana" ${ro ? 'disabled' : ''}>Ekle</button></div></div>
        <div class="mb-env-bas"><b>Düşenler</b><span>${drops.length} eşya · toplam şans %${yz(toplam)} · her eşya kendi şansıyla bağımsız düşer</span></div>
        <div class="g2-env mb-env">${drops.map((d) => { const it = fromDb(d.items || {}); const g = d.item_num < 0;
          return yuva(g ? { Num: d.item_num } : it, `%${yz(d.chance)}`, { sec: dusSec === d.item_num, data: `data-dsec="${d.item_num}"`, baslik: `${g ? `Eşya grubu ${-d.item_num} (gruptan rastgele bir eşya)` : it.strName || '#' + d.item_num} · #${d.item_num} · şans %${yz(d.chance)}`, grup: g, rozet: g && acikGrup === -d.item_num ? grupEsya.length : '' }); }).join('') || '<p class="ay-not">Bu mob henüz bir şey düşürmüyor.</p>'}</div>`;
      if (secD) { const g = secD.item_num < 0, it = fromDb(secD.items || {});
        h += `<div class="g2-slot-duzen mb-dus-duzen"><span class="g2-ikon">${g ? `<b class="mb-g-ik">G</b>` : iconHtml(it, 30)}</span>
          <span class="g2-dad"><b>${esc(g ? `Eşya grubu ${-secD.item_num}` : it.strName || '#' + secD.item_num)}</b><i>#${secD.item_num}${g ? ' · mob öldüğünde gruptan rastgele bir eşya' : ''}</i></span>
          <span class="g2-oran"><input type="number" step="0.1" min="0" max="100" value="${secD.chance}" data-k="d_sans" data-num="${secD.item_num}" ${ro ? 'disabled' : ''}><i>%</i></span>
          <span class="g2-dug">${g ? `<button data-k="g_ac" data-grp="${-secD.item_num}">${acikGrup === -secD.item_num ? 'İçeriği gizle' : 'İçeriği göster'}</button>` : ''}<button data-k="d_sil" data-num="${secD.item_num}" class="g2-tehlike" ${ro ? 'disabled' : ''}>Çıkar</button><button data-k="d_kapa">✕</button></span></div>`; }
      if (acikGrup) { const gd = drops.find((d) => d.item_num === -acikGrup), n = grupEsya.length || 1, pay = gd ? (Number(gd.chance) || 0) / n : null;
        h += `<div class="mb-grup"><div class="mb-env-bas"><b>Eşya grubu ${acikGrup}</b><span>${grupEsya.length} eşya${gd ? ` · grup şansı %${yz(gd.chance)} → her eşya ≈ %${yz(pay)} (1/${n})` : ''}</span><button data-k="g_kapat">Kapat</button></div>
          <div class="nd-satir mb-g-ekle"><input name="g_num" type="number" placeholder="Eşya no"><button data-k="g_ekle" class="g2-ana" ${ro ? 'disabled' : ''}>Gruba ekle</button></div>
          <div class="g2-env mb-env">${grupEsya.map((g0) => { const x = fromDb(g0); return yuva(x, pay != null ? `%${yz(pay)}` : `1/${n}`, { sec: grupSec === Number(g0.num), data: `data-gsec="${g0.num}"`, baslik: `${x.strName || '#' + g0.num} · #${g0.num} · gruptan çıkma 1/${n}${pay != null ? ` · gerçek ≈ %${yz(pay)}` : ''}` }); }).join('') || '<p class="ay-not">Grup boş.</p>'}</div>
          ${grupSec != null ? (() => { const g0 = grupEsya.find((x) => Number(x.num) === grupSec); if (!g0) return ''; const x = fromDb(g0); return `<div class="g2-slot-duzen mb-dus-duzen"><span class="g2-ikon">${iconHtml(x, 30)}</span><span class="g2-dad"><b>${esc(x.strName || '#' + g0.num)}</b><i>#${g0.num} · grupta 1/${n}${pay != null ? ` · ≈ %${yz(pay)}` : ''}</i></span><span></span><span class="g2-dug"><button data-k="g_cikar" data-num="${g0.num}" class="g2-tehlike" ${ro ? 'disabled' : ''}>Gruptan çıkar</button><button data-k="g_secKapa">✕</button></span></div>`; })() : ''}</div>`; }
    } else {
      const sp = spOf(m.sid).sort((a, b) => (a.zone === zone ? -1 : 0) - (b.zone === zone ? -1 : 0));
      h += `<div class="mb-alt-baslik">Yeni doğurucu (bulunduğun yere)</div>
        <div class="mb-form mb-form-kucuk"><label><span>Çap (m)</span><input name="s_radius" type="number" value="10"></label><label><span>En fazla adet</span><input name="s_max" type="number" value="5"></label><label><span>Doğma süresi (sn)</span><input name="s_regen" type="number" value="30"></label></div>
        <div class="nd-dugmeler"><button data-k="s_ekle" class="ay-dugme" ${ro ? 'disabled' : ''}>Konumuma doğurucu kur</button></div>
        <div class="mb-alt-baslik">Doğurucular (${sp.length})</div>
        <table class="mb-dogma"><tr><th>Bölge</th><th>Konum</th><th>Çap</th><th>Adet</th><th>Süre</th><th>Açık</th><th></th></tr>
        ${sp.map((s) => `<tr data-id="${s.id}"><td>${esc(zoneName(s.zone))}${s.egg ? ' 🥚' : ''}</td><td>${Math.round(s.x)}, ${Math.round(s.z)}</td>
          <td><input type="number" data-f="radius" value="${s.radius}" ${ro ? 'disabled' : ''}></td><td><input type="number" data-f="max_count" value="${s.max_count}" ${ro ? 'disabled' : ''}></td>
          <td><input type="number" data-f="regen_sec" value="${s.regen_sec}" title="${sure(s.regen_sec)}" ${ro ? 'disabled' : ''}></td><td><input type="checkbox" data-f="enabled" ${s.enabled ? 'checked' : ''} ${ro ? 'disabled' : ''}></td>
          <td class="mb-dug">${s.zone === zone ? `<button data-k="s_git" data-id="${s.id}">Git</button><button data-k="s_tasi" data-id="${s.id}" ${ro ? 'disabled' : ''}>Buraya</button>` : ''}<button data-k="s_kaydet" data-id="${s.id}" ${ro ? 'disabled' : ''}>Kaydet</button><button data-k="s_sil" data-id="${s.id}" ${ro ? 'disabled' : ''}>✕</button></td></tr>`).join('') || '<tr><td colspan="7">Doğurucu yok</td></tr>'}</table>
        <p class="ay-not">Her doğurucu çap içinde en fazla "adet" kadar mob tutar; ölen her mob kendi süresi dolunca tek tek yeniden doğar. Moblar hasar almadıkça çapın dışına çıkmaz, hasar alınca oyuncuyu en fazla 50 m takip edip alanına döner.</p>`;
    }
    box.innerHTML = h;
  }
  const val = (n) => win.querySelector(`[name=${n}]`)?.value;
  async function onClick(e) {
    const tb = e.target.closest('.mb-sekme [data-t]'); if (tb) { tab = tb.dataset.t; renderDetail(); return; }
    const row = e.target.closest('.mb-satir'); if (row) { await select(view[Number(row.dataset.i)]); return; }
    const ds = e.target.closest('[data-dsec]'); if (ds) { const n = Number(ds.dataset.dsec); dusSec = dusSec === n ? null : n; if (n < 0 && dusSec === n && acikGrup !== -n) { await grupYukle(-n).catch(() => {}); return; } renderDetail(); return; }
    const gs = e.target.closest('[data-gsec]'); if (gs) { const n = Number(gs.dataset.gsec); grupSec = grupSec === n ? null : n; renderDetail(); return; }
    const b = e.target.closest('button'); const k = b?.dataset.k; if (!k) return;
    try {
      if (k === 'kapat') return close();
      if (k === 'yeni') { const m = await rpc('gm_mob_save', { p_sid: null, p_data: { name: 'Yeni Mob' } }); mobs.unshift(m); filter(); await select(m); tab = 'ozellik'; renderDetail(); return; }
      if (!sel) return;
      const data = () => Object.fromEntries(FIELDS.map(([f, , t]) => [f, t === 'text' ? val('f_' + f) : Number(val('f_' + f)) || 0]));
      if (k === 'kaydet') { const m = await rpc('gm_mob_save', { p_sid: sel.sid, p_data: data() }); Object.assign(sel, m); renderList(); renderDetail(); hud.notice?.('Mob saved.'); }
      if (k === 'kopya') { const d = data(); d.name = d.name + ' (özel)'; d.copy_from = sel.sid; const m = await rpc('gm_mob_save', { p_sid: null, p_data: d }); mobs.unshift(m); filter(); await select(m); hud.notice?.(`Custom mob #${m.sid} created.`); }
      if (k === 'sil') {
        if (silOnay !== sel.sid) { silOnay = sel.sid; clearTimeout(silT); silT = setTimeout(() => { silOnay = null; renderDetail(); }, 4000); renderDetail(); return; }
        silOnay = null; const sid = sel.sid; await rpc('gm_mob_delete', { p_sid: sid });
        mobs = mobs.filter((m) => m.sid !== sid); spawners = spawners.filter((x) => x.sid !== sid); sel = null; filter(); renderDetail(); hud.notice?.(`Custom mob #${sid} deleted.`); return;
      }
      if (k === 'yumurta') { const s = await rpc('gm_spawner_save', { p_id: null, p_data: { zone, sid: sel.sid, x: player.position.x, z: player.position.z, radius: 3, max_count: 1, regen_sec: 60, enabled: true, egg: true } }); spawners.push(s); hud.notice?.(`${sel.name} has been spawned.`); renderDetail(); renderList(); }
      if (k === 'd_ekle') { const num = Number(val('d_num')); if (num) await addDrop(num, Number(val('d_sans')) || 10); }
      if (k === 'g_ac') { const g = Number(b.dataset.grp); if (acikGrup === g) { acikGrup = null; renderDetail(); return; } await grupYukle(g); return; }
      if (k === 'g_kapat') { acikGrup = null; grupSec = null; renderDetail(); return; }
      if (k === 'd_kapa') { dusSec = null; renderDetail(); return; }
      if (k === 'g_secKapa') { grupSec = null; renderDetail(); return; }
      if (k === 'g_cikar') { const num = Number(b.dataset.num); if (b.dataset.onay !== '1') { b.dataset.onay = '1'; b.textContent = 'Emin misin?'; return; } await rpc('gm_item_grup_cikar', { p_grp: acikGrup, p_item: num }); grupSec = null; await grupYukle(acikGrup); hud.notice?.('Item removed from the group.'); return; }
      if (k === 'g_ekle') { const num = Number(val('g_num')); if (!num || !acikGrup) return; await rpc('gm_item_grup_ekle', { p_grp: acikGrup, p_item: num }); await grupYukle(acikGrup); hud.notice?.('Item added to the group.'); return; }
      if (k === 'd_sil') { dusSec = null; await rpc('gm_mob_drop', { p_sid: sel.sid, p_item: Number(b.dataset.num), p_chance: 0 }); await select(sel); }
      if (k === 's_ekle') { const s = await rpc('gm_spawner_save', { p_id: null, p_data: { zone, sid: sel.sid, x: player.position.x, z: player.position.z, radius: Number(val('s_radius')) || 0, max_count: Number(val('s_max')) || 1, regen_sec: Number(val('s_regen')) || 30, enabled: true } }); spawners.push(s); renderDetail(); renderList(); hud.notice?.('Spawner created.'); }
      const sp = spawners.find((x) => x.id === Number(b.dataset.id));
      if (k === 's_git' && sp) { state.target = null; player.position.set(sp.x, state.heightAt(sp.x, sp.z), sp.z); }
      if (k === 's_tasi' && sp) { const s = await rpc('gm_spawner_save', { p_id: sp.id, p_data: { x: player.position.x, z: player.position.z } }); Object.assign(sp, s); renderDetail(); }
      if (k === 's_kaydet' && sp) {
        const tr = b.closest('tr'), g = (f) => tr.querySelector(`[data-f=${f}]`);
        const s = await rpc('gm_spawner_save', { p_id: sp.id, p_data: { radius: Number(g('radius').value), max_count: Number(g('max_count').value), regen_sec: Number(g('regen_sec').value), enabled: g('enabled').checked } });
        Object.assign(sp, s); renderDetail(); renderList(); hud.notice?.('Spawner saved.');
      }
      if (k === 's_sil' && sp) { if (b.dataset.onay !== '1') { b.dataset.onay = '1'; b.textContent = 'Sil?'; return; } await rpc('gm_spawner_delete', { p_id: sp.id }); spawners = spawners.filter((x) => x !== sp); renderDetail(); renderList(); }
    } catch { /* ileti gösterildi */ }
  }
  async function grupYukle(g) {
    const liste = await rpc('gm_item_grup_liste', { p_grp: g });
    const nums = (liste || []).map((r) => r.item_num ?? r);
    const its = [];
    for (let i = 0; i < nums.length; i += 200) { const { data } = await sb.from('items').select('*').in('num', nums.slice(i, i + 200)); its.push(...(data || [])); }
    const byNum = new Map(its.map((r) => [r.num, r]));
    grupEsya = nums.map((n) => byNum.get(n) || { num: n, name: '#' + n }); acikGrup = g; tab = 'dus'; renderDetail();
  }
  async function addDrop(num, chance) {
    if (!sel || sel._ro) return;
    await rpc('gm_mob_drop', { p_sid: sel.sid, p_item: num, p_chance: chance });
    await select(sel); tab = 'dus'; renderDetail();
    hud.notice?.('Drop item added.');
  }
  async function open(host = null) {
    if (win) { if (host && win.parentNode !== host) host.append(win); win.hidden = false; if (!host) toFront(win); return; }
    if (open.yukleniyor) return; open.yukleniyor = true;
    if (!host) hud.info?.('Loading the mob editor…', 'soluk'); else host.innerHTML = '<div class="g2-bos">Mob verisi yükleniyor…</div>';
    try { await Promise.all([loadAll(), loadEsyaMeta().catch(() => null)]); }
    catch (e) { hud.notice?.('Could not load mob data: ' + (e?.message || e), 'hata'); return; }
    finally { open.yukleniyor = false; }
    if (win) { if (host && win.parentNode !== host) host.append(win); win.hidden = false; if (!host) toFront(win); return; }
    const zs = [...new Set(spawners.map((s) => s.zone).filter(Boolean))].sort((a, b) => zoneName(a).localeCompare(zoneName(b)));
    if (host) host.innerHTML = '';
    win = document.createElement('div'); win.id = 'mob-pencere'; win.className = 'ko-panel ko-pencere';
    win.innerHTML = `<div class="ay-baslik">Mob Editörü</div>
      <div class="mb-ust"><input name="ara" placeholder="Ara: mob adı ya da numarası" autocomplete="off">
        <label>Seviye <input type="number" name="min" value="0" min="0" max="255"> – <input type="number" name="max" value="255" min="0" max="255"></label>
        <select name="bolge"><option value="">Tüm bölgeler</option>${zs.map((z) => `<option value="${esc(z)}">${esc(zoneName(z))}</option>`).join('')}</select>
        <label><input type="checkbox" name="dogan"> Yalnızca doğanlar</label><button data-k="yeni" class="ay-dugme">Yeni mob</button><span class="mb-sayi"></span></div>
      <div class="mb-govde"><div class="mb-liste"><div class="mb-ic"></div></div>
        <div class="mb-cubuk" title="Sürükle: mob listesini daralt / genişlet · Tıkla: listeyi gizle / göster"><i></i></div>
        <div class="mb-sag"><div class="ay-sekmeler mb-sekme"><button data-t="ozellik">Özellikler</button><button data-t="dus">Düşenler (%)</button><button data-t="dogurucu">Doğurucular</button></div><div class="mb-detay"></div></div></div>`;
    // host verilirse GM paneline gömülü (sayfa içi, açık tema), yoksa ayrı KO penceresi
    if (host) { win.className = 'g2-gomulu'; host.append(win); }
    else { document.body.append(win); koWindow(win); toFront(win); const k = document.createElement('button'); k.className = 'ko-kapat'; k.dataset.k = 'kapat'; k.title = 'Kapat'; win.append(k); }
    win.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(win); });
    win.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' && !host) close(); });
    win.addEventListener('wheel', (e) => e.stopPropagation());
    win.querySelector('.mb-liste').addEventListener('scroll', () => requestAnimationFrame(renderList));
    // mob listesi daraltma çubuğu: sürükleyerek genişlik (0–700 px), tıklayınca gizle / geri aç (son genişlik hatırlanır)
    { const govde = win.querySelector('.mb-govde'), cubuk = win.querySelector('.mb-cubuk');
      let gen = Number(localStorage.getItem('mbListeGen')) || 380, kapali = localStorage.getItem('mbListeKapali') === '1';
      const uygula = () => { govde.style.setProperty('--mb-sol', (kapali ? 0 : gen) + 'px'); govde.classList.toggle('mb-kapali', kapali); try { localStorage.setItem('mbListeGen', gen); localStorage.setItem('mbListeKapali', kapali ? '1' : '0'); } catch {} requestAnimationFrame(renderList); };
      uygula();
      cubuk.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); cubuk.setPointerCapture(e.pointerId);
        const x0 = e.clientX, g0 = kapali ? 0 : gen; let oynadi = false;
        const mv = (ev) => { const dx = ev.clientX - x0; if (Math.abs(dx) > 3) oynadi = true; if (!oynadi) return; const w = Math.max(0, Math.min(700, g0 + dx)); kapali = w < 40; if (!kapali) gen = w; govde.style.setProperty('--mb-sol', (kapali ? 0 : w) + 'px'); };
        const up = () => { cubuk.removeEventListener('pointermove', mv); cubuk.removeEventListener('pointerup', up); if (!oynadi) kapali = !kapali; uygula(); };
        cubuk.addEventListener('pointermove', mv); cubuk.addEventListener('pointerup', up);
      });
    }
    // mobun üzerine gelince görüntüsü
    win.querySelector('.mb-liste').addEventListener('pointerover', (e) => {
      const row = e.target.closest('.mb-satir'); if (!row) return;
      const m = view[Number(row.dataset.i)]; if (!m) return;
      clearTimeout(hoverT); hoverT = setTimeout(() => { const r = win.getBoundingClientRect(), rr = row.getBoundingClientRect(); void r; const key = m.model || (m.pid ? 'npc_' + m.pid : ''); kartGoster(row, { anahtar: 'mob|' + m.sid + key, bilgiHtml: `<b>${esc2(m.name)}</b><i>Mob #${esc2(m.sid)}${key ? ' · model ' + esc2(key) : ''}</i><span>Seviye ${m.level}${m.hp ? ' · can ' + Number(m.hp).toLocaleString('tr-TR') : ''}${m.boss ? ' · boss' : ''}</span>`, yap: () => (key ? createNpc(key) : null) }); }, 120);
    });
    win.querySelector('.mb-liste').addEventListener('pointerleave', () => { clearTimeout(hoverT); hideModel(); kartGizle(); });
    // GM çantasından sürüklenen eşya → düşenler
    win.addEventListener('ko-esya-birak', (e) => { if (sel) addDrop(e.detail.num, Number(val('d_sans')) || 10); });
    win.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.dataset.k === 'd_sans') { try { await rpc('gm_mob_drop', { p_sid: sel.sid, p_item: Number(t.dataset.num), p_chance: Number(t.value) || 0 }); const d = drops.find((x) => x.item_num === Number(t.dataset.num)); if (d) d.chance = Number(t.value) || 0; hud.notice?.('Chance updated.'); renderDetail(); } catch {} }
    });
    let qt = 0;
    win.addEventListener('input', (e) => {
      const n = e.target.name; if (!n || /^(f_|d_|s_)/.test(n)) return;
      if (n === 'ara') { clearTimeout(qt); const v = e.target.value; if (!v.trim()) { q = ''; filter(); return; } qt = setTimeout(() => { q = v; filter(); }, 150); return; }
      if (n === 'min') lvMin = Number(e.target.value) || 0;
      if (n === 'max') lvMax = Number(e.target.value) || 255;
      if (n === 'bolge') bolge = e.target.value;
      if (n === 'dogan') sadeceDogan = e.target.checked;
      filter();
    });
    win.addEventListener('click', onClick);
    filter(); renderDetail();
  }
  // kapanınca arama ve süzgeçler sıfırlanır: bir sonraki açılışta tüm moblar
  function close() { hideModel(); kartGizle(); win?.remove(); win = null; q = ''; bolge = ''; lvMin = 0; lvMax = 255; sadeceDogan = false; }
  return { open, close };
}
