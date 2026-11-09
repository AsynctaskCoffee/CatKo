// Drop sandıkları: mob ölünce öldüğü noktada sandık belirir (loot_boxes, Realtime). Sandığa tıklayınca KO'nun re_droppeditem penceresi açılır;
// eşyaya tıklayınca çantaya alınır (loot_take). Sandık 90 sn sonra ya da boşalınca kaybolur.
import * as THREE from '../vendor/three.module.min.js';
import { buildLayout, hasLayout, draggable } from './kui.js';
import { toFront } from './ko-pencere.js';
import { hasNpc, createNpc } from './character.js';
import { loadMeta, iconHtml, tooltipHtml, fromDb } from './esya.js';

const CHEST = 'npc_30302';   // KO "Treasure Chest" görünümü

export async function startLoot({ sb, character, world, state, player, hud, camera, canvas, inv }) {
  const zone = character.zone || 'moradon';
  await loadMeta().catch(() => {});
  const boxes = new Map();   // id → {row, obj}
  const group = new THREE.Group(); group.name = 'sandiklar'; world.add(group);
  const itemCache = new Map();

  function makeChest() {
    const g = new THREE.Group();
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.45; g.add(hit); g.userData.hit = hit;
    if (hasNpc(CHEST)) createNpc(CHEST).then((m) => { if (m) { m.group.scale.setScalar(0.55); g.add(m.group); g.userData.model = m; } }).catch(() => {});
    else {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshLambertMaterial({ color: 0x7a4a1c }));
      b.position.y = 0.3; g.add(b);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.65), new THREE.MeshLambertMaterial({ color: 0xc89a3a })); l.position.y = 0.62; g.add(l);
    }
    return g;
  }
  function add(row, at) {
    if (boxes.has(row.id) || row.zone !== zone) return;
    if (new Date(row.expires_at).getTime() < Date.now()) return;
    const obj = makeChest();
    // sandık mobun BU ekranda öldüğü noktada doğar (mob konumu oyuncudan oyuncuya biraz farklı olabilir)
    if (!at && row.mob_id != null) { const n = state.combat?.mobs?.get(row.mob_id) || state.combat?.mobs?.get(Number(row.mob_id)); const o = n?.olumYer && performance.now() - n.olumYer.t < 15000 ? n.olumYer : n?.pos; if (o && Math.hypot(o.x - row.x, o.z - row.z) < 60) at = { x: o.x, z: o.z }; }
    let x = at?.x ?? row.x, z = at?.z ?? row.z;
    // büyük yaratıklarda (Dragon Fossil, Dreadium…) sandık yerde kalan cesedin içinde kalıp görünmüyordu:
    // sandık cesedin kenarına, oyuncuya bakan yana konur (küçük moblarda yerinde)
    { const n = row.mob_id != null ? (state.combat?.mobs?.get(row.mob_id) || state.combat?.mobs?.get(Number(row.mob_id))) : null;
      let r = 0;
      if (n?.obj) { const b = new THREE.Box3().setFromObject(n.obj); if (isFinite(b.min.x)) r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2; }
      else if (n?.t?.size) r = (n.t.size / 100) * 0.6;
      r = Math.min(6, r);
      if (r > 0.7) { const dx = player.position.x - x, dz = player.position.z - z, L = Math.hypot(dx, dz) || 1; const k = Math.min(r + 0.4, Math.max(0, L - 1)); x += dx / L * k; z += dz / L * k; } }
    obj.position.set(x, state.heightAt(x, z), z); obj.rotation.y = Math.random() * 6.28;
    obj.userData.box = row.id; group.add(obj);
    // sandık düşme ışık efekti (30601) kapatıldı (istek)
    boxes.set(row.id, { row, obj });
    if (row.mob_id != null) state.combat?.cesetTut?.(row.mob_id, row.id);   // KO: ceset sandıkla birlikte yerde kalır, cesede tıklayınca sandık açılır
    onYukle((row.items || []).filter(Boolean));
  }
  function remove(id) { const b = boxes.get(id); if (!b) return; b.obj.removeFromParent(); boxes.delete(id); state.combat?.cesetBirak?.(id); if (openId === id) close(); }

  const { data } = await sb.from('loot_boxes').select('*').eq('zone', zone).gt('expires_at', new Date().toISOString()).limit(200);
  for (const r of data || []) add(r);
  const sandikRt = (p) => {
    if (p.eventType === 'DELETE') return remove(p.old?.id);
    const r = p.new; if (!r || r.zone !== zone) return;
    if (!boxes.has(r.id)) add(r); else { const bx = boxes.get(r.id); if (!pending.size) { bx.row = r; bx.srv = r.items.slice(); if (openId === r.id) render(); } }
  };
  { const sc = sb.channel('sandik:' + zone);   // (4.11) yalnız bu bölge (sunucu filtresi); silmeler ayrı
    for (const ev of ['INSERT', 'UPDATE']) sc.on('postgres_changes', { event: ev, schema: 'public', table: 'loot_boxes', filter: `zone=eq.${zone}` }, sandikRt);
    sc.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'loot_boxes' }, sandikRt).subscribe(); }
  // süresi dolanlar
  setInterval(() => { for (const [id, b] of boxes) if (new Date(b.row.expires_at).getTime() < Date.now()) remove(id); }, 3000);

  // ---- KO drop penceresi (re_droppeditem, 2 sütun × 3 satır)
  let win = null, openId = null, tip = null, surukle = null, surukBitti = false;
  function ensureWin() {
    if (win) return win;
    const layer = document.getElementById('kohud') || document.body;
    if (!hasLayout('re_droppeditem')) return null;
    win = buildLayout('re_droppeditem', { className: 'ko-drop ko-pencere' });
    win.el.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = ''));
    // 2 sütun × 3 satır (6 yuva): 3. sütun ve 4. satır gizlenir
    for (const e of win.el.querySelectorAll(':scope > *')) if (parseFloat(e.style.left) >= 100 || parseFloat(e.style.top) >= 150) e.remove();
    win.el.style.width = '106px'; win.el.style.height = '157px';
    layer.append(win.el); draggable(win, 30);
    const baslik = document.createElement('div'); baslik.className = 'ko-drop-baslik'; win.el.prepend(baslik);
    win.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    win.el.addEventListener('contextmenu', (e) => { e.preventDefault(); close(); });
    win.el.addEventListener('click', (e) => { if (surukBitti) { surukBitti = false; return; } const s = e.target.closest('[data-drop]'); if (s) take(Number(s.dataset.drop)); });
    // sürükle-bırak: eşya çantadaki çöp sepetine (area_samma) bırakılırsa yok edilir, çantaya bırakılırsa alınır
    win.el.addEventListener('pointerdown', (e) => {
      const s = e.target.closest('[data-drop]'); if (!s || e.button !== 0) return;
      const i = Number(s.dataset.drop); if (i < 0) return;
      e.stopPropagation();   // pencere sürüklemesi (kui draggable) eşya sürüklemesini çalmasın
      surukle = { i, x: e.clientX, y: e.clientY, el: s, ghost: null, id: openId };
    }, true);
    addEventListener('pointermove', (e) => {
      const d = surukle; if (!d) return;
      if (!d.ghost) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
        const k = d.el.querySelector('.inv-esya'); if (!k) { surukle = null; return; }
        hideTip();
        d.ghost = k.cloneNode(true); d.ghost.classList.add('inv-hayalet');
        Object.assign(d.ghost.style, { position: 'fixed', zIndex: 10000, pointerEvents: 'none', opacity: '.85', width: d.el.offsetWidth + 'px', height: d.el.offsetHeight + 'px' });
        document.body.append(d.ghost); d.el.style.opacity = '.35';
      }
      d.ghost.style.left = (e.clientX - d.ghost.offsetWidth / 2) + 'px'; d.ghost.style.top = (e.clientY - d.ghost.offsetHeight / 2) + 'px';
    });
    addEventListener('pointerup', (e) => {
      const d = surukle; surukle = null; if (!d) return;
      d.el.style.opacity = '';
      if (!d.ghost) return;
      d.ghost.remove(); surukBitti = true; setTimeout(() => { surukBitti = false; }, 0);
      if (openId !== d.id) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (hit?.closest?.('[data-id="area_samma"]')) {
        let kilit = false; try { kilit = localStorage.getItem('ko-cop-kapali') === '1'; } catch {}
        if (kilit) { hud.notice?.('You cannot destroy the item since the trashbin is closed.', 'hata'); return; }
        const b = boxes.get(d.id), x = b?.row.items[d.i]; if (!x) return;
        const it = itemCache.get(x.num), ad = it?.strName || x.name || 'Item';
        const ok = hud.soru?.('Destroy Item', `Destroy ${ad}${x.count > 1 ? ` (${x.count})` : ''}?\nA destroyed item cannot be recovered.`, () => take(d.i, true, d.id, x));
        if (!ok) hud.notice?.('The confirmation window could not be opened.', 'hata');
        return;
      }
      if (hit?.closest?.('.inv-yuva, .ko-inv')) take(d.i);
    }, true);
    win.el.addEventListener('pointermove', (e) => {
      const s = e.target.closest('[data-drop]'); if (!s) return hideTip();
      const b = boxes.get(openId); if (!b) return;
      const i = Number(s.dataset.drop);
      tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu', id: 'ko-ipucu-drop' });
      if (!tip.isConnected) document.body.append(tip);
      // (3.11) KO Noah ipucu birebir: çizgi · çerçeveli Noah simgesi + "196  Coin" (beyaz kalın) · çizgi · ortalı açıklama · çizgi
      if (i === -1) tip.innerHTML = `<div class="ti-ayrac"></div><div class="ti-bas ti-noah"><div class="ti-ikon">${iconHtml({ ikon: '9_0001_00_0', Kind: 0 }, 42)}</div><div class="ti-bas-sag"><div class="ti-ad" style="color:#fff">${Number(b.row.gold).toLocaleString('en-US')}&nbsp;&nbsp;Coin</div></div></div>`
        + '<div class="ti-ayrac"></div><div class="ti-aciklama">*The currency of the<br>Adonis Continent.*</div><div class="ti-ayrac"></div>';
      else { const it = itemCache.get(b.row.items[i]?.num); tip.innerHTML = it ? tooltipHtml(it) : `<div class="ti-ad">${b.row.items[i]?.name || ''}</div>`; }
      tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16) + 'px'; tip.style.top = Math.max(8, e.clientY - 10) + 'px';
    });
    win.el.addEventListener('pointerleave', hideTip);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId != null) close(); });
    // pencere dışına tıklanınca kapanır (KO gibi)
    addEventListener('pointerdown', (e) => { if (openId != null && win && !win.el.contains(e.target)) close(); }, true);
    return win;
  }
  const hideTip = () => tip?.remove();
  // satır satır: soldan sağa, yukarıdan aşağı
  const areas = () => [...win.el.querySelectorAll(':scope > .kui-ar')].sort((a, b) => (parseFloat(a.style.top) - parseFloat(b.style.top)) || (parseFloat(a.style.left) - parseFloat(b.style.left)));
  // eşya bilgileri sandık düşer düşmez önceden alınır; pencere beklemeden açılır
  const bekleyen = new Set();
  function onYukle(items) {
    const nums = [...new Set((items || []).map((e) => e.num))].filter((n) => !itemCache.has(n) && !bekleyen.has(n));
    if (!nums.length) return null;
    nums.forEach((n) => bekleyen.add(n));
    return sb.from('items').select('*').in('num', nums).then(({ data }) => {
      for (const r of data || []) itemCache.set(r.num, fromDb(r));
      nums.forEach((n) => bekleyen.delete(n));
      if (openId != null) render();
    }, () => nums.forEach((n) => bekleyen.delete(n)));
  }
  function render() {
    const b = boxes.get(openId); if (!b || !win) return;
    onYukle(b.row.items.filter(Boolean));
    win.el.querySelector('.ko-drop-baslik').textContent = b.row.mob_name || 'Sandık';
    const list = [];
    // (31.10) KO: eşya alınınca diğerleri kaymaz — alınan yuva boş kalır (Noah yuvası da)
    if (b.row.gold > 0) b.noahYuva = true;
    if (b.noahYuva) list.push(b.row.gold > 0 ? { i: -1 } : null);
    b.row.items.forEach((e, i) => list.push(e ? { i, e } : null));
    areas().forEach((a, k) => {
      const x = list[k]; a.style.pointerEvents = 'auto';
      if (!x) { a.innerHTML = ''; delete a.dataset.drop; return; }
      a.dataset.drop = x.i;
      const sz = Math.floor(parseFloat(a.style.width) || 45);
      a.innerHTML = x.i === -1 ? `<div class="inv-esya">${iconHtml({ ikon: '9_0001_00_0', Kind: 0 }, sz)}<b class="inv-adet">${b.row.gold.toLocaleString('tr-TR')}</b></div>`
        : `<div class="inv-esya">${iconHtml(itemCache.get(x.e.num) || { Kind: 0 }, sz)}${x.e.count > 1 ? `<b class="inv-adet">${x.e.count}</b>` : ''}</div>`;
    });
  }
  // KO: drop sahibi olmayan sandığın içeriğini göremez (sunucu loot_take ile aynı kural: sahibine 30 sn ayrılır)
  const KILIT_MS = 30000;
  const kilitli = (row) => row.owner != null && Number(row.owner) !== Number(character.id) && !state.parti?.uyeMi?.(row.owner) && Date.now() < (row.created_at ? new Date(row.created_at).getTime() : 0) + KILIT_MS;
  function open(id, ev) {
    const bx = boxes.get(id);
    if (bx && kilitli(bx.row)) { close(); hud.notice?.('This chest belongs to someone else.', 'hata'); return; }
    if (!ensureWin()) return;
    openId = id; win.el.hidden = false; toFront(win.el); win.el.style.zIndex = String(Math.max(Number(win.el.style.zIndex) || 0, 4060));   // çantanın (4050) üstünde: eşya çöpe / çantaya sürüklenebilsin
    const r = win.el.getBoundingClientRect();
    win.el.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, (ev?.clientX ?? innerWidth / 2) + 30)) + 'px';
    win.el.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, (ev?.clientY ?? innerHeight / 2) - r.height / 2)) + 'px';
    render();
  }
  function close() { openId = null; if (win) win.el.hidden = true; hideTip(); }
  // iyimser alma: pencere hemen güncellenir, sunucu reddederse geri alınır (bekleme hissi olmaz)
  const pending = new Set(); let queue = Promise.resolve();
  async function take(i, cop = false, kutu = openId, giris = null) {
    if (kutu == null) return; hideTip();
    const id = kutu, b = boxes.get(id); if (!b) return;
    if (giris && b.row.items[i] !== giris) { i = b.row.items.indexOf(giris); if (i < 0) return; }
    const key = id + ':' + (i === -1 ? 'g' : b.row.items[i]?.num + ':' + i); if (pending.has(key)) return; pending.add(key);
    const before = { gold: b.row.gold, items: b.row.items.slice() };
    const entry = i === -1 ? null : b.row.items[i];
    if (i === -1) b.row.gold = 0; else b.row.items = b.row.items.map((x, k) => (k === i ? null : x));
    render();
    b.srv ||= before.items.slice();
    // (7.11) hızlı toplama: alma istekleri sıra beklemeden paralel gider (sunucu eşyayı numarasıyla bulur, sandık kilidiyle sırayla işler);
    //   yalnız çöpe atma (loot_cop) sıra numarasıyla sıralı kalır
    const srvSil = (res) => { if (!res.error && res.data?.ok && entry) { const k = b.srv.indexOf(entry); if (k >= 0) b.srv.splice(k, 1); } return res; };
    const job = cop ? queue.then(async () => {
      const si = b.srv.indexOf(entry);
      return srvSil(await sb.rpc('loot_cop', { p_char: character.id, p_box: id, p_idx: si, p_x: player.position.x, p_z: player.position.z }));
    }) : Promise.resolve(sb.rpc('loot_take_num', { p_char: character.id, p_box: id, p_num: i === -1 ? -1 : Number(entry?.num), p_x: player.position.x, p_z: player.position.z })).then(srvSil);
    if (cop) queue = job.catch(() => {});
    try {
      const { data, error } = await job;
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason || 'Could not be picked up.');
      if (cop) hud.info?.(`${itemCache.get(entry?.num)?.strName || data.name} has been destroyed.`, 'hata');
      else if (i === -1) {
        // (3.11) KO: partide Noah üyelere seviyeyle orantılı bölünür → yalnız kendi payı yazılır, diğer üyelere bildirim
        const once = Number(state.combat?.stats?.gold), pay = Number.isFinite(once) && data.total_gold != null ? Math.max(0, Number(data.total_gold) - once) : Number(data.gold);
        hud.info?.(`Picked up ${pay} Coins.`, 'drop'); state.combat?.applyStats?.({ gold: data.total_gold }); dispatchEvent(new CustomEvent('ko-ganimet', { detail: { para: pay } }));
        if (state.parti?.partide) state.parti.yay?.('noah', {});
      } else {
        const baskasi = data.alici != null && Number(data.alici) !== Number(character.id);
        // KO GetItemRoutingUser: partide eşya sıradaki üyeye gider — "%s got %s" (Texts_us 3413)
        if (state.parti?.partide) { hud.info?.(`${data.alici_ad || character.name} got ${data.name}`, 'drop'); state.parti.yay?.('esya', { alici: Number(data.alici ?? character.id), ad: data.alici_ad || character.name, esya: data.name }); }
        else hud.info?.(`Picked up ${data.name}`, 'drop');
        if (!baskasi) { inv()?.reload?.(); dispatchEvent(new CustomEvent('ko-ganimet', { detail: { it: itemCache.get(entry?.num), ad: data.name } })); }
      }
      if (!b.row.gold && !b.row.items.some(Boolean)) remove(id);
    } catch (e) {
      hud.notice?.(e.message, 'hata');
      if (boxes.has(id)) { b.row.gold = before.gold; b.row.items = before.items; if (openId === id) render(); }
    } finally { pending.delete(key); }
  }

  // ---- tıklama: sandık seçilirse yanına yürü, yakınsa aç
  const ray = new THREE.Raycaster();
  let walkTo = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hits = ray.intersectObjects([...boxes.values()].map((b) => b.obj.userData.hit), false);
    return hits[0] ? hits[0].object.parent.userData.box : null;
  }
  setInterval(() => {
    if (openId != null) { const b = boxes.get(openId); if (!b || Math.hypot(b.obj.position.x - player.position.x, b.obj.position.z - player.position.z) > 9) close(); }
    if (walkTo) {
      const b = boxes.get(walkTo.id); if (!b) { walkTo = null; return; }
      if (Math.hypot(b.obj.position.x - player.position.x, b.obj.position.z - player.position.z) < 4) { state.target = null; open(walkTo.id, walkTo.ev); walkTo = null; }
    }
  }, 150);
  return {
    onClick(e) {
      let id = pick(e);
      // yerde yatan mobun üstüne tıklama: yanındaki sandık (KO gibi ceset üzerinden de açılır)
      if (id == null) { const c = state.combat?.oluSec?.(e); if (c?.kutu != null && boxes.has(c.kutu)) id = c.kutu; else if (c) { let en = 9; for (const [bid, b] of boxes) { const d = Math.hypot(b.obj.position.x - c.x, b.obj.position.z - c.z); if (d < en) { en = d; id = bid; } } } }
      if (id == null) return false;
      const b = boxes.get(id);
      if (kilitli(b.row)) { hud.notice?.('This chest belongs to someone else.', 'hata'); return true; }
      if (Math.hypot(b.obj.position.x - player.position.x, b.obj.position.z - player.position.z) < 4) open(id, e);   // (7.11) 4 m içinde yürümeden açılır (sunucu sınırı 8 m)
      else { walkTo = { id, ev: { clientX: e.clientX, clientY: e.clientY } }; state.target = new THREE.Vector3(b.obj.position.x, 0, b.obj.position.z); }
      return true;
    },
    /** kendi öldürdüğümüz mob: sandığı hemen mobun olduğu yere koy (Realtime beklemeden) */
    drop(data, at) {
      if (!data?.box) return;
      // Realtime kaydı RPC yanıtından önce geldiyse sandık zaten var: mobun ayağının dibine taşı
      const var_ = boxes.get(data.box);
      if (var_ && at) { var_.obj.position.set(at.x, state.heightAt(at.x, at.z), at.z); if (at.name) var_.row.mob_name ||= at.name; return; }
      add({ id: data.box, zone, x: data.box_x, z: data.box_z, owner: character.id, items: data.drops || [], gold: data.box_gold || 0, mob_name: at?.name, mob_id: at?.mob ?? null, expires_at: new Date(Date.now() + 20000).toISOString() }, at);
      const b = boxes.get(data.box); if (b) state.pet?.kutuDustu?.(data.box, b.obj.position.x, b.obj.position.z);   // peri / pet Toplama: otomatik toplama
    },
    /** sandık penceresini aç (test / kısayol) */
    ac(id) { open(id); },
    /** otomatik toplanan sandık (loot_oto) */
    kaldir(id) { remove(id); },
    /** sahnedeki sandıklar (Oreads 5 m toplama) */
    /** Genie: kutudaki her şeyi pencere açmadan topla (yakında olmalı) */
    async hepsiniAl(id) {
      const b = boxes.get(id); if (!b) return false;
      const eski = openId; openId = id; const is = [];
      try { if (b.row.gold > 0) is.push(take(-1)); for (let i = b.row.items.length - 1; i >= 0; i--) if (b.row.items[i]) is.push(take(i)); }
      finally { openId = eski; if (eski != null) render(); }
      await Promise.allSettled(is); return true;
    },
    kutular() { return [...boxes.values()].map((b) => ({ id: b.row.id, owner: b.row.owner, x: b.obj.position.x, z: b.obj.position.z })); },
    update(dt) {
      for (const b of boxes.values()) b.obj.userData.model?.update(dt);
      // (7.11) sandığa yürürken her karede denetim: 4 m'ye girince pencere hemen açılır (150 ms aralık beklenmez)
      if (walkTo) { const b = boxes.get(walkTo.id); if (b && Math.hypot(b.obj.position.x - player.position.x, b.obj.position.z - player.position.z) < 4) { state.target = null; open(walkTo.id, walkTo.ev); walkTo = null; } }
    },
  };
}
