// Savaş: canavarlar (Supabase npcs tablosu + Realtime), hedef seçme, otomatik saldırı, hasar, EXP/seviye, ölüm/dirilme.
// Hasar, menzil, bekleme süresi ve ödüller sunucuda (attack_npc RPC) hesaplanır; istemci yalnızca gösterir.
import { yetenekVerisi, loadYetenekler, futbolYet, futbolAcik } from './yetenek.js';
import * as THREE from '../vendor/three.module.min.js';
import { mobFxTak } from './mobfx.js';
import { loadMonsterMeta, hasMonster, createMonster, hasNpc, createNpc } from './character.js';
import { mobSilahTak } from './mob-silah.js';
import { fxEkle } from './fx.js';

// Canavar modelleri dönüştürülene kadar şablona göre basit gövdeler
const LOOK = {
  mob_worm: { color: 0xb07a4a, body: 'worm', size: 0.9 }, mob_bandicoot: { color: 0x8a6a4a, body: 'quad', size: 0.9 },
  mob_kecoon: { color: 0x6a8a3a, body: 'quad', size: 1.1 }, npc_boss_bird: { color: 0x5a4a6a, body: 'bird', size: 1.3 }, mob_gavolt: { color: 0x7a3a2a, body: 'quad', size: 1.5 },
  worm: { color: 0xb07a4a, body: 'worm', size: 0.9 },
  bandicoot: { color: 0x8a6a4a, body: 'quad', size: 0.9 },
  kecoon: { color: 0x6a8a3a, body: 'quad', size: 1.1 },
  bulture: { color: 0x5a4a6a, body: 'bird', size: 1.3 },
  gavolt: { color: 0x7a3a2a, body: 'quad', size: 1.5 },
};

function buildMonster(tpl) {
  const L = LOOK[tpl.model] || { color: 0x888888, body: 'quad', size: 1 };
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: L.color });
  const eye = new THREE.MeshBasicMaterial({ color: 0xffe070 });
  const s = L.size;
  if (L.body === 'worm') {
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s * (1 - i * 0.1), 12, 8), mat); m.position.set(0, 0.25 * s, -i * 0.34 * s); m.userData.seg = i; g.add(m); }
  } else if (L.body === 'bird') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45 * s, 14, 10), mat); b.scale.set(1, 0.9, 1.4); b.position.y = 1.2 * s; g.add(b);
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.4 * s, 0.05, 0.6 * s), mat); w.position.set(sx * 0.9 * s, 1.3 * s, 0); w.userData.wing = sx; g.add(w); }
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 10, 8), mat); hd.position.set(0, 1.45 * s, 0.55 * s); g.add(hd);
  } else {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5 * s, 14, 10), mat); b.scale.set(0.9, 0.75, 1.4); b.position.y = 0.7 * s; g.add(b);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 12, 10), mat); hd.position.set(0, 0.9 * s, 0.7 * s); g.add(hd);
    for (const sx of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 6, 4), eye); e.position.set(sx * s, 1.0 * s, 0.95 * s); g.add(e); }
    for (const [lx, lz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.07 * s, 0.5 * s, 6), mat); l.position.set(lx * 0.3 * s, 0.25 * s, lz * 0.4 * s); l.userData.leg = lx * lz; g.add(l); }
  }
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * s, 0.8 * s, 2 * s, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = s; g.add(hit); g.userData.hit = hit;
  return g;
}

export async function startCombat(ctx) {
  const { sb, character: me, world, camera, canvas, state, player, hud, nameSprite } = ctx;
  const zone = me.zone || 'moradon';
  // moblar: GM'in açtığı doğurucuların canlıları (mob_instances + monsters şablonu, spawners = doğma alanı)
  // Supabase REST tek istekte en fazla 1000 satır verir (Ronark Land 1085 mob): sayfa sayfa
  const hepsi = async (yap) => { const out = []; for (let i = 0; ; i += 1000) { const { data } = await yap().range(i, i + 999); out.push(...(data || [])); if (!data || data.length < 1000) return { data: out }; } };
  const [{ data: rows }, { data: levels }, { data: sps }] = await Promise.all([
    hepsi(() => sb.from('mob_instances').select('*, monsters(*)').eq('zone', zone).order('id')), sb.from('level_up').select('*'),
    hepsi(() => sb.from('spawners').select('id,x,z,radius,regen_sec,enabled').eq('zone', zone).order('id')),
  ]);
  const SP = new Map((sps || []).map((x) => [x.id, x]));
  const tpl = (m) => ({ name: m.name, level: m.level, max_hp: m.hp, damage: m.damage, defense: m.ac, attack_range: Math.max(2, Math.min(12, (m.attack_range || 20) / 10)),
    // KO: arama menzili (search_range) 5+ olanlar oyuncuyu görünce saldırır; sandıklar (0) ve kurtlar/bandikutlar (3-4) yalnızca karşılık verir
    aggressive: (m.search_range || 0) >= 5 && (m.damage > 0 || m.atk > 0), sight: Math.min(25, Math.max(5, m.search_range || 0)),
    walk: 1.2 + Math.min(2, (m.speed1 || 1) * 0.35), run: 3.4 + Math.min(3, (m.speed2 || 3) * 0.3), delay: 1500,
    model: m.pid ? 'npc_' + m.pid : null, size: m.size || 100, sid: m.sid, boss: !!m.boss,
    // KO deneme korkulukları (Moradon, K_NPC 19067-19072): saldırmaz; 19067-69 sabit, 19070-72 ray üzerinde ileri-geri yürür
    pasif: !(m.damage > 0 || m.atk > 0), korkuluk: m.sid >= 19067 && m.sid <= 19072, sabit: (m.sid >= 19067 && m.sid <= 19069) || (m.sid >= 7032 && m.sid <= 7034),
    kapi: m.sid >= 7032 && m.sid <= 7034 });   // Monster Stone kapıları (Gate, deadsoft canavar): geçidi kapatır, kırılınca açılır
  await loadMonsterMeta(ctx.monBase || './assets/mon').catch(() => null);
  const expNext = (lv) => levels?.find((l) => l.level === lv)?.exp || 0;
  const FXN = () => ctx.namesOn ? ctx.namesOn() : true;
  const S = { hp: me.hp, max_hp: me.max_hp, mp: me.mp, max_mp: me.max_mp, level: me.level, exp: Number(me.exp || 0), gold: Number(me.gold || 0), name: me.name, dead: !!me.dead };
  // (9.11) Minor Healing: yanıtı beklenen basışların MP / can etkisi S'ye yazılmaz, yalnız gösterimde uygulanır →
  //   sunucudan gelen her değer (regen, vuruş, yanıt) doğrudan yazılır, çubuk geri sıçramaz / gidip gelmez
  const minorBekleyen = new Set();
  const minorBorc = () => { let mp = 0, hp = 0; for (const b of minorBekleyen) { mp += b.mp; hp += b.hp; } return { mp, hp }; };
  const gorHp = () => { const b = minorBorc(); return Math.min(S.max_hp, S.hp + b.hp); };
  const showStats = () => { const b = minorBorc(), hp = Math.min(S.max_hp, S.hp + b.hp); hud.stats({ ...S, hp, mp: Math.max(0, S.mp - b.mp), expNext: expNext(S.level) }); state.net?.can?.(hp, S.max_hp, S.dead); };   // canım diğer oyunculara anlık
  showStats(); hud.show();

  // ---- canavarlar
  const npcs = new Map();
  const group = new THREE.Group(); group.name = 'npcs'; world.add(group);
  const serverOffset = { v: 0 };   // sunucu saati farkı (yaklaşık)
  const isDead = (n) => n.dead_until && new Date(n.dead_until).getTime() > Date.now() + serverOffset.v;
  // Monster Stone kapısı (Gate): geçidin iki duvarı arasına oturur (8 m içindeki en dar doğrultu, haritanın çarpışma yüzeylerinden);
  // kapı kırılana dek o çizgiden geçilemez (collision.js engeller → moveStep)
  function kapiHizala(n) {
    n.kapiHiza = true;
    const col = state.col, y = n.pos.y + 1.2; let en = null;
    for (let a = 0; a < 180; a += 5) {
      const r = a * Math.PI / 180, dx = Math.cos(r), dz = Math.sin(r);
      const d1 = col.segment(n.pos.x, y, n.pos.z, dx, 0, dz, 8), d2 = col.segment(n.pos.x, y, n.pos.z, -dx, 0, -dz, 8);
      if (d1 >= 0 && d2 >= 0 && (!en || d1 + d2 < en.w)) en = { w: d1 + d2, dx, dz, d1, d2 };
    }
    if (!en) en = { w: 6, dx: 1, dz: 0, d1: 3, d2: 3 };
    n.yaw = Math.atan2(-en.dz, en.dx);   // modelin genişliği (yerel X) geçit boyunca
    const ax = n.pos.x + en.dx * (en.d1 + 0.3), az = n.pos.z + en.dz * (en.d1 + 0.3), bx = n.pos.x - en.dx * (en.d2 + 0.3), bz = n.pos.z - en.dz * (en.d2 + 0.3);
    (col.engeller ||= new Map()).set('kapi' + n.id, { ax, az, bx, bz, aktif: () => npcs.get(n.id) === n && !isDead(n) });
  }
  function addMob(r) {
    const m = r.monsters; if (!m) return;
    const t = tpl(m), sp = SP.get(r.spawner_id);
    const obj = buildMonster({ model: 'x' });
    const tag = t.korkuluk ? nameSprite(`<${t.name}>`, '#b4b4b4', { kind: 'canavar' }) : nameSprite(`${t.name}`, t.boss ? '#ff6a6a' : '#ff9a9a', { kind: 'canavar' }); tag.position.y = 1.3 * t.size / 100; obj.add(tag);   // korkuluklar: gri, <Iron Scarecrow>
    group.add(obj);
    const home = sp ? { x: sp.x, z: sp.z, r: sp.radius } : { x: r.x, z: r.z, r: 3 };
    const n = { ...r, t, obj, tag, home, spot: { x: r.x, z: r.z }, pos: new THREE.Vector3(r.x, state.heightAt(r.x, r.z), r.z), yaw: t.korkuluk ? Math.PI : t.kapi ? Math.PI / 4 : Math.random() * 6.28, phase: Math.random() * 100, aggro: false };
    obj.position.copy(n.pos); obj.userData.npc = n;
    npcs.set(r.id, n);
    // model yakına gelince yüklenir (Moradon'da yüzlerce mob var)
    n.load = () => {
      if (n.loading) return; n.loading = true;
      const make = t.model && hasNpc(t.model) ? createNpc(t.model) : hasMonster(t.model) ? createMonster(t.model) : null;
      make?.then((mm) => {
        if (!mm || !npcs.has(r.id)) return;
        obj.children.filter((c) => c.isMesh && c !== obj.userData.hit).forEach((c) => (c.visible = false));
        const k = t.size / 100; mm.group.scale.set(k, k, k);
        obj.add(mm.group); n.model = mm;
        mobFxTak(mm, t.model, () => state.fx, k);   // KO mob efektleri (Burning Skeleton ateşi vb.)
        mobSilahTak(mm, { pid: Number(String(t.model || '').replace(/^npc_/, '')), sid: t.sid ?? r.sid }).catch(() => {});   // KO canavar silahı (K_MONSTER iWeapon1/2)
        if (isDead(n)) olum(n);
        fitMobName(n);
      }).catch(() => {});
    };
  }
  // ölüm: modelin KO ölüm klibi (ANI_NPC_DEAD0); klibi olmayan modeller (kapı, taş, tohum vb.) yana devrilir
  function olum(n) {
    if (n.t?.korkuluk && !(n.kutu != null)) { n.dying = 0; n.devril = null; n.obj.visible = false; return; }   // (8.11) Moradon korkulukları (Scarecrow) devrilmez: öldüğü an yok olur
    if (!n.model) return;
    n.devril = n.model.playOnce('dead', { hold: true }) ? null : 0;
  }
  function olumKare(n, dt) {
    const g = n.model?.group; if (!g) return;
    if (n.devril != null) { n.devril = Math.min(1, n.devril + dt / 0.7); const e = 1 - (1 - n.devril) ** 3; g.rotation.z = -1.45 * e; }
    // son 1.5 sn: ceset yere gömülür
    const kalan = (n.dying || 0) - performance.now();
    g.position.y = kalan > 0 && kalan < 1500 ? -(1 - kalan / 1500) * 1.2 * (n.t.size / 100) : 0;
  }
  function dirilt(n) { const g = n.model?.group; n.devril = null; if (g) { g.rotation.z = 0; g.position.y = 0; } }
  // isim: modelin başının hemen üstü (oyuncu isimleri gibi)
  const _b = new THREE.Box3();
  function fitMobName(n) {
    const tag = n.tag; if (!tag || !n.model) return;
    n.obj.updateMatrixWorld(true); _b.setFromObject(n.model.group, true);
    if (_b.isEmpty()) return;
    const top = _b.max.y - n.obj.position.y;
    if (top > 0.3 && top < 30) tag.position.y = top + 0.12;
  }
  function removeMob(id) { const n = npcs.get(id); if (!n) return; n.model?._mobFx?.dur(); n.obj.removeFromParent(); npcs.delete(id); if (target === n) clearTarget(); }
  for (const r of rows || []) addMob(r);
  // Realtime: diğer oyuncuların vuruşları ve yeniden doğmalar
  const ch = sb.channel(`moblar:${zone}`);
  // (4.11) sunucu yükü / bağlantı: yalnız bu bölgenin mob değişiklikleri (filtre sunucuda); silmeler filtrelenemez → ayrı dinleyici
  const mobRt = async (p) => {
    if (p.eventType === 'DELETE') { removeMob(p.old?.id); return; }
    const r = p.new; if (!r || r.zone !== zone) return;
    const n = npcs.get(r.id);
    if (!n || p.eventType === 'INSERT') {
      if (n) return;
      const { data } = await sb.from('mob_instances').select('*, monsters(*)').eq('id', r.id).maybeSingle();
      if (data && !npcs.has(r.id)) addMob(data);
      return;
    }
    rtUygula(n, r);
  };
  for (const ev of ['INSERT', 'UPDATE']) ch.on('postgres_changes', { event: ev, schema: 'public', table: 'mob_instances', filter: `zone=eq.${zone}` }, mobRt);
  ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'mob_instances' }, mobRt);
  // KO: ok hedefe değmeden mob ölmez — benim okum uçarken gelen sunucu kaydı (can / ölüm) ok varana dek bekletilir
  function rtUygula(n, r) {
    const kalan = (n.okBekle || 0) - performance.now();
    if (kalan > 0) { n.bekleyenRt = r; clearTimeout(n.rtT); n.rtT = setTimeout(() => { const q = n.bekleyenRt; n.bekleyenRt = null; if (q && npcs.get(n.id) === n) rtUygula(n, q); }, kalan + 30); return; }
    const wasDead = isDead(n);
    Object.assign(n, { hp: r.hp, dead_until: r.dead_until, last_hit_at: r.last_hit_at });
    // önce ölüm: mob bu ekranda durduğu yerde ölür (sunucu yeni doğma noktasını aynı kayıtta yollar; ceset/sandık oraya kaymasın)
    if (!wasDead && isDead(n) && !(n.dying > performance.now())) { n.olumYer = { x: n.pos.x, z: n.pos.z, t: performance.now() }; n.dying = performance.now() + 10000; n.aggro = false; olum(n); }
    if (r.x !== n.spot.x || r.z !== n.spot.z) { n.spot = { x: r.x, z: r.z }; if (isDead(n) && !(n.dying > performance.now())) n.pos.set(r.x, 0, r.z); }
    if (target === n) refreshTarget();
    if (!wasDead && isDead(n) && target === n) clearTarget();
  }
  // ok varınca bekleyen kayıt hemen uygulanır (applyHit ölümü zaten işlediyse tekrar ölmez)
  const okVardiMob = (n) => { n.okBekle = 0; if (n.bekleyenRt) { clearTimeout(n.rtT); const q = n.bekleyenRt; n.bekleyenRt = null; rtUygula(n, q); } };
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'spawners' }, (p) => {
    const r = p.new?.id ? p.new : p.old; if (!r?.id) return;
    if (p.eventType === 'DELETE' || !p.new.enabled) SP.delete(r.id); else SP.set(r.id, p.new);
    for (const n of npcs.values()) if (n.spawner_id === r.id && SP.has(r.id)) { const s2 = SP.get(r.id); n.home = { x: s2.x, z: s2.z, r: s2.radius }; }
  });
  ch.subscribe(() => {});

  // ---- hedef
  let target = null, attacking = false, busy = false, lastAttack = 0, oncekiAtak = false;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32), new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; world.add(ring);
  // KO Game option2 → Targeting Image Type: 1 = Misc\target_symbol_plane (yeşil halka), 2 = target_hunt_plane (mor halka); 3–4 = eski kırmızı halka
  const hedefTex = [1, 2].map((i) => { const t = new THREE.TextureLoader().load(`./assets/ui/secek/hedef${i}.webp`); t.colorSpace = THREE.SRGBColorSpace; return t; });
  const hedefPlan = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: hedefTex[0], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  hedefPlan.renderOrder = 5; ring.add(hedefPlan);
  const hedefTipUygula = () => { const tip = Number(window.koSecenek?.hedefTip ?? 0); const doku = tip < 2; ring.material.visible = !doku; hedefPlan.visible = doku; if (doku && hedefPlan.material.map !== hedefTex[tip]) { hedefPlan.material.map = hedefTex[tip]; hedefPlan.material.needsUpdate = true; } };
  hedefTipUygula();
  ring.renderOrder = 5;   // Z / tıklama ile hedeflenen mobun ayağında kırmızı çember (deadsoft 2009_select_enemyl.fxb ile birlikte)
  const hedefIsaret = import('./fx-secim.js').then(({ secimTakip }) => secimTakip(state, '2009_select_enemyl.fxb'));
  let hedefIsaretKaynak = null, hedefIsaretMob = null;
  // sunucu yeniden doğan mobun canını ilk vuruşa kadar 0 bırakır (dead_until geçince tam can sayılır) → istemcide de tam can
  const canOf = (n) => (isDead(n) ? 0 : Number(n.hp) > 0 ? Number(n.hp) : n.t.max_hp);
  const refreshTarget = () => { if (target) hud.target({ name: target.t.name, level: target.t.level, hp: canOf(target), max_hp: target.t.max_hp, enemy: true, mob: true, sid: target.t.sid }); };
  // (8.11) 1 dk hasar almayan mobun canı dolar (sunucu _mob_hit aynı kuralı uygular): çubuk ve hedef yazısı da dolar
  setInterval(() => { const t = performance.now();
    for (const n of npcs.values()) { const h = Number(n.hp), mx = Number(n.t?.max_hp) || 0;
      if (n._sonHp == null) { n._sonHp = h; n._hasarT = t; continue; }
      if (h < n._sonHp) n._hasarT = t; n._sonHp = h;
      if (mx > 0 && h > 0 && h < mx && !isDead(n) && t - (n._hasarT || t) > 60000) { n.hp = mx; n._sonHp = mx; if (target === n) refreshTarget(); }
    } }, 1000);
  function selectTarget(n) { state.arena?.birakSecim?.(); if (target !== n) setSlotActive(false); target = n; attacking = false; ring.visible = !!n; refreshTarget(); if (!n) hud.target(null); }
  function clearTarget() { target = null; attacking = false; ring.visible = false; hud.target(null); setSlotActive(false); }
  // KO: saldırı modundayken (R / temel saldırı sürerken) fare imleci her yerde silah (kılıç) olur
  const setSlotActive = (on) => { document.querySelector('.slot[data-i="1"]')?.classList.toggle('aktif', on); document.documentElement.classList.toggle('saldiri-modu', !!on); };
  document.querySelector('.slot[data-i="1"]')?.classList.add('saldiri');
  // KO: kısayol çubuğunun 1. yuvasında "Temel Saldırı" yoktur; saldırı R tuşu / hedefe çift tık ile

  // KO Z: en yakın düşman (oyuncu ya da canavar). Hedef varken tekrar Z → sıradaki en yakın düşmana geçer
  // (yanında oyuncu ve canavar varsa ikisi arasında değişir); 3 sn Z'ye basılmazsa sıra baştan başlar.
  let zGecmis = new Set(), zSon = 0;
  function zHedef() {
    const A = [];
    for (const n of npcs.values()) { if (isDead(n) || n.t.kapi || n.dogumBekle > performance.now()) continue; const d = Math.hypot(n.pos.x - player.position.x, n.pos.z - player.position.z); if (d < 40) A.push({ k: 'm:' + n.id, d, n }); }
    for (const o of state.arena?.zAdaylar?.() || []) A.push({ k: 'o:' + o.id, d: o.d, o: o.id });
    { const an = state.towers?.anitAday?.(player.position); if (an) A.push({ k: 'a:' + an.e.t.id, d: an.d, a: an.e }); }   // Ardream Anıtı da Z ile hedef alınır
    if (!A.length) return;
    // KO: Z her basışta yalnız en yakın hedefi seçer (sırayla değiştirmez); en yakın zaten seçiliyse olduğu gibi kalır
    A.sort((a, b) => a.d - b.d);
    const s = A[0];
    const ah = state.towers?.anitHedef;
    const simdiki = target ? 'm:' + target.id : state.arena?.secili ? 'o:' + state.arena.secili : ah ? 'a:' + ah.t.id : null;
    if (s.k === simdiki) return;
    if (s.a) { clearTarget(); state.arena?.birak?.(); state.towers?.anitSec?.(s.a); }
    else if (s.n) { state.towers?.anitBirak?.(); state.arena?.birak?.(); selectTarget(s.n); } else { state.towers?.anitBirak?.(); state.arena?.oyuncuSec?.(s.o); }
  }
  function nearest() {
    let best = null, bd = 40;
    for (const n of npcs.values()) { if (isDead(n) || n.t.kapi || n.dogumBekle > performance.now()) continue; const d = Math.hypot(n.pos.x - player.position.x, n.pos.z - player.position.z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  // ---- yay / ok (KO: yay takılıyken R vuruşu ve ok yetenekleri çantadaki okları harcar; ok yoksa saldırılamaz)
  const takiliYay = () => { const it = state.inv?.items; return [it?.get?.(6)?.it, it?.get?.(8)?.it].find((x) => x && [70, 71].includes(Number(x.Kind))) || null; };
  const okSayisi = () => { let n = 0; for (const [sl, e] of state.inv?.items || []) if (sl >= 14 && sl <= 41 && Number(e.it?.Kind) === 120) n += Number(e.row?.count) || 0; return n; };
  // yay menzili eşyanın Range değerinden (350 → 21 m, 400 → 24 m)
  const yayMenzili = (y = takiliYay()) => Math.max(12, Math.min(30, (Number(y?.Range) || 350) / 10 * 0.6));
  let okT = 0;
  const okYenile = (kalan) => {   // çanta sayısını yerelde düşür, sunucudan kısa süre sonra yenile
    for (const [sl, e] of state.inv?.items || []) if (sl >= 14 && sl <= 41 && Number(e.it?.Kind) === 120 && e.row.count > 0) { e.row.count--; break; }
    clearTimeout(okT); okT = setTimeout(() => state.inv?.reload?.(), kalan === 0 ? 50 : 1500);
  };
  const okYokUyari = () => { hud.notice('You have no arrows! You need Arrows in your inventory to attack with a bow.', 'hata'); hud.info?.('Out of arrows. Buy Arrows from [Sundries] Zarta.', 'hata'); };
  // ok mermisi: yaydan hedefe hafif yay çizerek uçan ok (şaft + uç + tüy), varınca kaybolur
  const okGeo = (() => {
    const g = new THREE.Group();
    const saft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5), new THREE.MeshBasicMaterial({ color: 0x8a6a3a })); saft.rotation.x = Math.PI / 2; g.add(saft);
    const uc = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 6), new THREE.MeshBasicMaterial({ color: 0xcfd6dc })); uc.rotation.x = Math.PI / 2; uc.position.z = 0.5; g.add(uc);
    for (const r of [0, Math.PI / 2]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.16), new THREE.MeshBasicMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide })); t.rotation.set(0, 0, r); t.rotation.x = Math.PI / 2; t.position.z = -0.4; t.rotateY(r); g.add(t); }
    return g;
  })();
  // yaratık üzerindeki vuruş efektleri: yalnızca yerde (ayak hizası), yaratığın boyutunu geçmeyecek kadar küçük; parçacıklar havaya uçmaz
  // dy: zeminden yükseklik (ok yeteneklerinde efekt mobun gövdesinin ortasında)
  const zeminFx = (id, m, boyut = 0.3, olcek = 1, yay = true, dy = 0, zorla = false) => {
    if (!id || !m || (id === 10002 && !zorla)) return;   // mavi vuruş parlaması (damage0_1) kapalı
    const sz = Math.max(0.35, Math.min(1.2, ((m.t?.size || 100) / 100) * 0.7));
    if (dy > 0) { const tv = new THREE.Vector3(); state.efekt?.(id, { x: m.pos.x, y: m.pos.y + dy, z: m.pos.z }, { follow: () => { tv.copy(m.pos); tv.y += dy; return tv; }, boyut: boyut * sz * olcek, enFazla: sz * olcek }); }
    else state.efekt?.(id, { x: m.pos.x, y: m.pos.y + 0.05, z: m.pos.z }, { boyut: boyut * sz * olcek, enFazla: sz * olcek });
    if (yay) state.net?.fx?.({ k: 'z', id, x: +m.pos.x.toFixed(2), y: +(m.pos.y + dy).toFixed(2), z: +m.pos.z.toFixed(2), m: m.id ?? null, b: +(boyut * sz * olcek).toFixed(3), e: +(sz * olcek).toFixed(3), ...(dy > 0 ? { dy: +dy.toFixed(2) } : {}) });
  };
  // büyücü hedef efektleri mobun altındaki kırmızı hedef çemberi (2009_select_enemyl: halka yarıçapı ~1,15 m × ölçek) büyüklüğünde:
  // efektin kendi taban çapı (m) → çembere ölçeklenir. 131 Hell fire (zemin 2,6), 113 Pillar of fire / Fire Impact / Incineration (~1,4), 32078 Manes of fire (~5,2)
  const CEMBER_FX = { 131: 2.6, 113: 1.4, 32078: 5.2 };
  // KO ölçeği (CN3FXBundle): demet kendi boyutunda oynar; dependScale demetleri hedefin ölçeğiyle (NPC size / 100) büyür
  const koFx = (id, m, dy = 0, enAz = 0.3) => {
    const sc = Math.max(enAz, (m?.t?.size || 100) / 100), tv = new THREE.Vector3();
    const ek = {};   // Manes of fire dahil: KO ölçeği birebir (kaya büyütmesi yok)
    if (dy > 0) state.efekt?.(id, { x: m.pos.x, y: m.pos.y + dy, z: m.pos.z }, { scale: sc, follow: () => { tv.copy(m.pos); tv.y += dy; return tv; }, ...ek });
    else state.efekt?.(id, { x: m.pos.x, y: m.pos.y + 0.05, z: m.pos.z }, { scale: sc, ...ek });
    state.net?.fx?.({ k: 'z', id, x: +m.pos.x.toFixed(2), y: +(m.pos.y + dy).toFixed(2), z: +m.pos.z.toFixed(2), m: m.id ?? null, s: +sc.toFixed(3), ...(dy > 0 ? { dy: +dy.toFixed(2) } : {}) });
  };
  const cemberCap = (m) => 2.3 * Math.max(0.8, Math.min(3, (m?.t?.size || 100) / 100));
  const cemberFx = (id, m) => {
    const D = cemberCap(m), b = +(D / CEMBER_FX[id]).toFixed(3), e = +D.toFixed(2);
    const sinir = id === 113 ? {} : { enFazla: e, };   // Pillar sütunu yükseklikte kırpılmaz (yalnız taban ölçeklenir)
    state.efekt?.(id, { x: m.pos.x, y: m.pos.y + 0.05, z: m.pos.z }, { boyut: b, ...sinir });
    state.net?.fx?.({ k: 'z', id, x: +m.pos.x.toFixed(2), y: +m.pos.y.toFixed(2), z: +m.pos.z.toFixed(2), m: m.id ?? null, b, ...(id === 113 ? {} : { e }) });
  };
  const ortaY = (m) => Math.max(0.6, (kafaY(m) - 1) / 2);   // mobun gövde ortası (zeminden)
  // kendi üstümdeki efekt (döküm, buff, iksir, seviye): bende oynar ve görüş mesafesindeki herkese yayınlanır.
  // 2601 (heal_cast: her yetenekte zeminde çıkan mavi halka) gösterilmez — her yetenek/eşya yalnız kendi özel efektiyle
  const GENEL_DOKUM = new Set([2601]);
  const _EKLEM_M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; let _eklemNo = 0;
  // KO 2369 seviye atlama: Karus fx.tbl 30401 karu_levelup.fxb, El Morad 30402 elmo_levelup.fxb (sesleri 9000 / 9500) — assets/fxseviye
  function seviyeFx() { const id = Number(me.nation) === 2 ? 30402 : 30401; import('./fx.js').then((F) => F.fxEkle('./assets/fxseviye')).then(() => benFx(id, { eklem: 0 }), () => benFx(10018, { eklem: 0 })); }   // KO: TriggerBundle(.., kaynak eklem 0 = kalça) — efekt kalça hizasından
  function benFx(id, o = {}) {
    if (!id || (GENEL_DOKUM.has(id) && !o.zorla)) return null;
    let dy = Number(o.dy) || 0; const v = new THREE.Vector3(), on = Number(o.on) || 0;   // dy: ayaktan yükseklik (m) — ör. emme yeteneklerinde omuz hizası; on: karakterin önüne (m), ör. yayın ortası
    // KO SelfPart: efekt karakterin eklemine bağlı (2 göğüs, 12 sağ el) — eklemi izler (Skill_Magic_Main sütun 8)
    let plug = null, follow = () => { v.copy(player.position); v.y += dy; if (on) { v.x += Math.sin(state.yaw) * on; v.z += Math.cos(state.yaw) * on; } return v; };
    const av = state.avatar;
    if (o.eklem >= 0 && av?.setPlug && av.eklemAdlari && o.eklem < av.eklemAdlari.length) {
      const key = 'fxEklem' + (++_eklemNo); plug = new THREE.Object3D(); av.setPlug(key, plug, o.eklem, _EKLEM_M);
      const _w = new THREE.Vector3();
      const yer = () => { if (!plug.parent) return null; plug.updateWorldMatrix(true, false); _w.setFromMatrixPosition(plug.matrixWorld); return v.set(_w.x, _w.y, -_w.z); };
      follow = () => yer() || (v.copy(player.position), v);
      const p0 = yer(); if (p0) dy = +(p0.y - player.position.y).toFixed(2);   // uzak oyunculara yaklaşık eklem yüksekliği
      plug.userData.kaldir = () => av.setPlug(key, null);
    }
    const { eklem: _e, zorla: _z, ...oo } = o;
    const b = state.efekt?.(id, player.position, { follow, ...oo });
    if (plug) { if (b) { const d0 = b.dispose.bind(b); b.dispose = () => { d0(); plug.userData.kaldir(); }; } else plug.userData.kaldir(); setTimeout(() => plug.userData.kaldir(), (o.omur || 6000) + 500); }
    const yn = o.dir ? +Math.atan2(o.dir.x, o.dir.z).toFixed(3) : null;   // efekt yönü (KO: karakterin baktığı yön)
    const pl = { k: 'b', id, b: o.boyut ?? null, e: o.enFazla ?? null, ...(dy ? { dy } : {}), ...(on ? { on } : {}), ...(yn != null ? { yn } : {}), ...(o.roll ? { rl: +o.roll.toFixed(3) } : {}) };
    if (o.omur && b) setTimeout(() => { try { b.dispose?.(); } catch {} }, o.omur);   // kısa ömürlü efekt (ör. yaydaki efektli ok 1 sn)
    if (o.omur) pl.om = o.omur;
    if (o.loop) pl.lp = 1;   // döküm efekti gibi döngülü (omur ile biter) — diğer oyuncularda da aynı
    if (o.yayinKuyruk) o.yayinKuyruk.push(pl);   // sunucu onaylayınca yayınlanır (reddedilen yeteneğin efekti diğer oyuncularda görünmesin)
    else state.net?.fx?.(pl);
    return b;
  }
  // suikastçı Blood Drain (x610) / Vampiric Touch (x650): emilen can efekti oyuncunun omuz hizasında (ayakta değil)
  // (3.11) savaşçı yetenekleri (Warrior / Berserker / Guardian, Karus 1xx · El Morad 2xx): KO CMagicSkillMng birebir —
  // SelfFX1 SelfPart1 % 1000 ekleminde (ikinci eklem SelfPart1 / 1000), TargetFX TargetPart ekleminde (-1 = ayak), KO ölçeğinde (kırpma / küçültme yok)
  // (7.11) Sprint (her sınıfta, KO tablosunda aynı efektler 2701 / 10029): savaşçıdaki gibi — sarı döküm topu (2701, Ability_cast0_1) yok, yalnız mavi koşu izi (10029 sprint.fxb)
  const sprintYet = (s) => /^sprint$/i.test(String(s?.ad || '')) || Number(s?.fx?.[2]) === 10029;
  const savasciYet = (s) => [1, 2].includes(Math.floor(Number(s?.id) / 100000)) && [1, 5, 6].includes(Math.floor(Number(s?.id) / 1000) % 100);
  const koParcaFx = (id, parca, o = {}) => { const ek = []; const p = Number(parca); if (!(p >= 0)) return [benFx(id, { boyut: 1, ...o })];
    const p1 = p % 1000, p2 = Math.floor(p / 1000); for (const e of p2 ? [p1, p2] : [p1]) ek.push(benFx(id, { boyut: 1, eklem: e, ...o })); return ek; };
  // (7.11) suikastçı / usta KO birebir (Blood Drain x610, Vampiric Touch x650, Magic Shield x802, Disarm x820): SelfFX SelfPart ekleminde (2 = göğüs),
  //   KO ölçeğinde (küçültme / kırpma yok), karakterin baktığı yönde — efektin önü oyuncunun önünde; TargetFX hedeften oyuncuya doğru akar
  // (7.11) Cure Curse (KO Skill_Magic_Main: anim 18, SelfFX 2701 SelfPart −1, TargetFX 32064 TargetPart −1, döküm 1,5 sn): döküm efekti ayakta, KO ölçeğinde,
  //   döküm süresince döngüde, karakterin yönünde; hedef efekti (gövdeyi saran sarmal) hedefin ayağında tam boy
  const cureKo = (s) => /^cure (curse|disease)$/i.test(String(s?.ad || ''));   // (7.11) Cure Disease da Cure Curse ile birebir aynı (efekt 32064, animasyon 18)
  // Cure Curse sarmalı (z_lv2009 sütunları) zeminden yükselir; halka (z__fx_final_fly kartları) başın 0,45 m üstünde (kafaya değmez)
  const CURE_HALKA_DISI = /^(?![\s\S]*z__fx_final_fly)/, CURE_HALKA = /z__fx_final_fly/;
  function cureFx(id, follow0, basY, yon) {
    const v = new THREE.Vector3(), v2 = new THREE.Vector3();
    state.efekt?.(id, follow0(), { follow: () => v.copy(follow0()), boyut: 1, dir: yon, haric: CURE_HALKA });
    state.efekt?.(id, follow0(), { follow: () => { v2.copy(follow0()); v2.y += basY + 1.45; return v2; }, boyut: 1, dir: yon, haric: CURE_HALKA_DISI });
  }
  const rogueKo = (s) => [107, 108, 207, 208].includes(Math.floor(Number(s?.id) / 1000)) && [802].includes(Number(s?.id) % 1000);   // (7.11) Disarm (820) efekt / yön Vampiric Touch ile aynı (omuz yolu)   // (7.11) Blood Drain / Vampiric Touch (610 / 650) önceden ayarlanan görünümde kalır (omuz hizası dy 1,55, hedefte +0,2 m, 0,8 ölçek)
  const emmeSec = (hp, kf, s = null) => { if (kf || (s && !rogueKo(s))) return { boyut: 0.8, enFazla: 3 }; const d = new THREE.Vector3(player.position.x - hp.x, 0, player.position.z - hp.z); return d.lengthSq() > 1e-4 ? { boyut: 1, dir: d.normalize() } : { boyut: 1, dir: ileri().negate() }; };
  const OMUZ_FX = (s) => [107, 108, 207, 208].includes(Math.floor(s.id / 1000)) && [610, 650, 820, 821].includes(s.id % 1000);   // 821: Eskrima (yalnız efekt; kol animasyonu Spike)   // 820: Disarm (Vampiric Touch ile aynı animasyon / efekt)
  // KO: emme efektleri karakterin yönüne göre döner — döküm (2202) karakterin önünde, emilen can (801) hedeften karaktere akar
  const ileri = () => new THREE.Vector3(Math.sin(state.yaw || 0), 0, Math.cos(state.yaw || 0));
  // Cat's Eyes / Lupine Eyes (KO fx 3200 z_rupeneyes_alllll: göz parlamaları, XY düzleminde) başın üstünde (boy + 0,3 m), karakterin baktığı yönde; diğer oyuncular da aynı yerde görür
  const GOZ_FX = new Set([3200]);
  // KO'daki gibi tam boy (kırpılmadan) oynayan hedef efektleri: Cure Curse 32064 (z_final_fx_2009_buffa01, gövdeyi saran sarmal)
  const TAM_FX = new Set([32064]);
  // başın üstünde oynayan hedef efektleri (KO Eskrima kanama maskesi new_eskrimama_target_a01): başın 1 m üstünde (oyuncu: 1,8 + 1 m), yatay (90° çevrilmiş), boyut 0,8 (%20 küçük)
  const KAFA_FX = new Set([32043]);   // (8.11) Eskrima maskesi: önceki yükseklikten 1 m yukarıda (başın ~2 m üstü)
  const kafaY = (n) => { if (!n) return 2.8; if (n._kafa == null) { try { const o = n.obj || n.model?.group; const b = o ? new THREE.Box3().setFromObject(o) : null; const h = b && !b.isEmpty() ? b.max.y - (n.pos?.y ?? b.min.y) : 0; n._kafa = h > 0.5 && h < 12 ? h + 1.0 : 2.8; } catch { n._kafa = 2.8; } } return n._kafa; };
  let _basY = 0;
  const basYuk = () => { if (!_basY) { const b = new THREE.Box3().setFromObject(state.avatar?.group || player); const h = b.max.y - b.min.y; _basY = h > 0.5 && h < 4 ? h * 0.9 : 1.6; } return _basY; };
  const YAY_ON_FX = new Set([143, 146, 152, 155, 158]);
  const YAY_OKLU_FX = new Set([10109, 10115]);   // Fire / Poison Arrow & Shot: efektli ok yayın / arbaletin ucunda (karakterin önü, göğüs hizası, ileri bakar), 1 sn sonra silinir
  const omuzSecenek = (s, geri = false) => (OMUZ_FX(s) ? { dy: 1.55, dir: geri ? ileri().negate() : ileri(), ...(geri ? {} : { boardIleri: 0.6 }) } : s?.tip1 === 2 ? (YAY_OKLU_FX.has(Number(s.fx?.[0])) ? { dy: 1.25, on: 0.55, dir: ileri(), omur: 1000 } : { dy: 1.1, dir: ileri() }) : {});
  // Ice / Lightning / Power Shot (+ Explosive, Viper…): efekt karakterin baktığı yöne çevrilir → yayın önünde, ileri doğru açılır (yönsüz hâli sırtta / yukarı bakıyordu)   // ok yetenekleri (Lightning / Ice Shot…): döküm efekti karakterin ortasında   // Blood Drain / Vampiric Touch: efekt omuz hizasının 0,2 m üstünde
  // ok: şaft + uç + tüy modeli; KO'daki gibi yayın uçan efekti (Archery fly FX) oku izler, varınca hedef efekti
  // paralel: oklar yan yana düz hatlarda (3'lü/5'li atış) — yalnızca hedefin doğrultusunda gider, hedefe kilitlenmez; gec: ıska ok hedefi geçer
  const _okYon = new THREE.Vector3(), _OK_Z = new THREE.Vector3(0, 0, 1);
  const OK_HASAR_GECIKME = 100;   // ms: ok değdikten sonra hasar
  const OK_HIZ = 50;   // m/sn (KO arrow_new_karus_1st.fxb fVelocity)
  function okAt(hedefPos, sure, onVar, { fx = 0, hedefFx = 0, yan = 0, gecik = 0, paralel = 0, yakinsa = 1, gec = false, kaynak = null, yay = true, aci = 0, iz2 = 0 } = {}) {
    const bas = () => {
      const o = okGeo.clone(); world.add(o);
      // KO: ok yayın bulunduğu (sol el) noktadan, karakterin önünden çıkar; hedefin gövde ortasına (boyuna göre) gider
      const hm = yay && target && target.pos === hedefPos ? target : null;
      const govde = () => hm ? Math.max(0.5, Math.min(2.4, (hm.obj?.userData?.hit?.position?.y || 1) * (hm.obj?.scale?.y || 1) * 0.9)) : 1.0;
      const p0 = (kaynak || player.position).clone().add(new THREE.Vector3(0, 1.3, 0)), p1 = new THREE.Vector3(hedefPos.x, hedefPos.y + govde(), hedefPos.z);
      if (!kaynak) { const d = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z); if (d.lengthSq() > 1e-4) p0.add(d.normalize().multiplyScalar(0.45)); }
      if (yan) { const d = p1.clone().sub(p0); const sag = new THREE.Vector3(d.z, 0, -d.x).normalize().multiplyScalar(yan); p1.add(sag); }
      if (paralel) { const d = p1.clone().sub(p0); const sag = new THREE.Vector3(d.z, 0, -d.x).normalize().multiplyScalar(paralel); p0.add(sag); p1.add(sag.multiplyScalar(1 - yakinsa)); }   // yakinsa 1: ok ucu yaratığa (hedefe) gider
      // yelpaze (3'lü / 5'li atış): ok, hedef doğrultusundan 'aci' kadar sapmış yönde hedef uzaklığına kadar gider
      if (aci) { const dx = p1.x - p0.x, dz = p1.z - p0.z, L0 = Math.hypot(dx, dz), a0 = Math.atan2(dx, dz) + aci; p1.set(p0.x + Math.sin(a0) * L0, p1.y, p0.z + Math.cos(a0) * L0); }
      if (gec) p1.add(p1.clone().sub(p0).multiplyScalar(0.35));
      const L = p0.distanceTo(p1), t0 = performance.now(), v = new THREE.Vector3(), onceki = p0.clone();
      // KO: ok (arrow.fxb / arrow_new_*_1st.fxb, CN3FXBundle hızı 50–77 m/sn) yaydan hedefe dümdüz ve sabit hızla gider — kavis yok
      sure = Math.max(70, (L / OK_HIZ) * 1000);
      // diğer oyuncular da oku ve izini görsün (başlangıç: atanın kendisi, yan/paralel kayma dahil hedef noktası)
      if (yay) state.net?.fx?.({ k: 'ok', id: fx || 0, h: hedefFx || 0, x: +p1.x.toFixed(2), y: +(p1.y - 1).toFixed(2), z: +p1.z.toFixed(2), ms: Math.round(sure), dx: +(p0.x - player.position.x).toFixed(2), dz: +(p0.z - player.position.z).toFixed(2), ...(iz2 ? { i2: iz2 } : {}) });
      const iz = fx ? state.efekt?.(fx, p0, { boyut: 0.8, enFazla: 1.6, follow: () => o.position, yon: () => o.quaternion }) : null;   // uçan ok efekti okun yönünde
      const izB = iz2 ? state.efekt?.(iz2, p0, { boyut: 1.4, enFazla: 3, follow: () => o.position, yon: () => o.quaternion }) : null;   // 3'lü / 5'li: okun arkasında kırmızı kıvılcım izi (deadsoft ork_arrow_chr_01)
      const adim = () => {
        // KO CN3FXBundle (hedefli): ok uçarken hedef yürürse ok hedefi izler (güdümlü, düz hatta)
        if (hm && !paralel && !gec && !yan && !aci && !isDead(hm)) p1.set(hm.pos.x, hm.pos.y + govde(), hm.pos.z);
        const k = Math.min(1, (performance.now() - t0) / sure);
        v.copy(p0).lerp(p1, k);
        o.position.copy(v);
        // yön yerel uzayda: dünya grubu Z'de aynalı (scale.z = -1) olduğundan lookAt (dünya koordinatı bekler) oku çapraz uçuşlarda yana çeviriyordu
        if (k > 0) { _okYon.copy(v).sub(onceki); if (_okYon.lengthSq() > 1e-8) o.quaternion.setFromUnitVectors(_OK_Z, _okYon.normalize()); }
        onceki.copy(v);
        if (k < 1) requestAnimationFrame(adim);
        else {
          o.removeFromParent(); iz?.stop?.(); izB?.stop?.();
          if (hedefFx) { const m = yay && target && Math.hypot(target.pos.x - hedefPos.x, target.pos.z - hedefPos.z) < 0.5 ? target : { pos: new THREE.Vector3(hedefPos.x, hedefPos.y, hedefPos.z), t: { size: 100 } }; zeminFx(hedefFx, m, 0.3, 1, false); }
          // KO: hasar ok yaratığa değdikten 0,1 sn sonra işlenir (hasar yazısı, ölüm, EXP)
          if (onVar) setTimeout(onVar, OK_HASAR_GECIKME);
        }
      };
      o.position.copy(p0); _okYon.copy(p1).sub(p0); if (_okYon.lengthSq() > 1e-8) o.quaternion.setFromUnitVectors(_OK_Z, _okYon.normalize()); requestAnimationFrame(adim);
    };
    if (gecik > 0) setTimeout(bas, gecik); else bas();
  }
  // karakterin sınıf/ulus Archery yeteneği (KO: yayla R vuruşu = Archery; animasyon ve efektleri buradan)
  const archery = () => { const Y = yetenekVerisi()?.yetenekler; return Y?.[(me.nation === 2 ? 200000 : 100000) + (Number(me.class) || 2) * 1000 + 3] || Y?.[102003] || null; };

  // KO PvP "R combo": yetenekten hemen sonra R'ye basılırsa yeteneğin kalan kol animasyonu kesilir, hasarı hemen görünür
  // ve R vuruşu beklemeden araya girer (R → yetenek → R → yetenek…). Yetenek hasarı/etkisi kaybolmaz; yalnız animasyon kısalır.
  let rKombo = null;   // { bit, flush }
  const buyucuMu = () => [3, 9, 10].includes(Number(me.class) % 100);   // büyücü (Mage / Elemental Lord / Arch Mage)
  function rKomboDene() {
    const now = performance.now();
    if (buyucuMu()) return false;   // büyücü: yetenek kol animasyonu R ile kesilmez (animasyon bitmeden yeni yetenek yok)
    if (!rKombo || now > rKombo.bit || !target || isDead(target) || takiliYay()) return false;
    const k = rKombo; rKombo = null;
    k.flush?.();                                  // bekleyen yetenek hasarı hemen
    if (state.avatar && [1, 5, 6].includes(Number(me.class) % 100)) state.avatar._izKirmiziBit = now + saldiriAraligi() + 400;   // (4.11) KO: kombo R vuruşunda silah izi kırmızı
    state.yayinSustur = true; state.avatar?.stopOnce?.(); state.yayinSustur = false;   // yetenek animasyonu bende kesilir (diğer oyuncular yeteneği sonuna dek görür)
    state.yetenekKlipBit = now;
    lastAttack = Math.min(lastAttack, now - saldiriAraligi() - 1);   // R vuruşu hemen
    kombo = (kombo || 0) + 1; komboSon = now;
    return true;
  }
  let kombo = 0, komboSon = 0;
  function startAttack() {
    state.sonR = performance.now();   // (4.11) W basılıyken R: hedefe doğru yürüme (main.js)
    if (S.dead) return;
    if (state.dinlen?.engelle()) return;   // otururken: dinlenmeden çıkma sorusu
    if (performance.now() - komboSon > 2500) kombo = 0;
    rKomboDene();
    if (takiliYay() && okSayisi() < 1) { okYokUyari(); attacking = false; setSlotActive(false); return; }
    if ((!target || isDead(target)) && state.towers?.anitHedef) { state.towers.anitSaldir(); return; }   // seçili anıt: R ile vur
    if (!target || isDead(target)) { const n = nearest(); if (!n) return hud.notice('No target.', 'hata'); selectTarget(n); }
    if (!attacking) hud.info?.(`Beginning attack on ${target?.t?.name || ''}`, 'o');
    attacking = true; setSlotActive(true);
  }

  // tıklama: canavara tıklandıysa hedef seç (çift tık: saldır)
  const ray = new THREE.Raycaster();
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hits = ray.intersectObjects([...npcs.values()].filter((n) => !isDead(n) && !(n.dogumBekle > performance.now())).map((n) => n.obj.userData.hit), false);
    return hits[0] ? hits[0].object.parent.userData.npc : null;
  };
  // fare canavarın üstündeyse KO'daki gibi kılıç imleci
  let hoverT = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons || performance.now() - hoverT < 90) return; hoverT = performance.now();
    document.documentElement.classList.toggle('imlec-saldiri', !!pick(e));
  });
  canvas.addEventListener('dblclick', (e) => { const n = pick(e); if (n) { selectTarget(n); startAttack(); } });
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyZ' || e.code === 'Tab') { e.preventDefault(); zHedef(); }
    if (e.code === 'KeyR') { if (!target && state.arena?.rSaldir?.()) return; startAttack(); }
    if (e.code === 'Escape') { if (target) clearTarget(); else if (!hud.closeAll?.()) hud.panel?.('sistem'); }
  });

  // ---- hasar yazıları
  // hasar / ıska / iyileşme yazıları yalnızca oyuncunun başının üstünde (isim etiketinin üstü), isim yazı tipiyle
  let yaziSira = 0, yaziSon = 0;
  const floatText = (worldPos, text, cls, kendiKonumu = false) => {
    const v = (kendiKonumu && worldPos ? worldPos.clone() : player.position.clone().add(new THREE.Vector3(0, 2.75, 0))); world.localToWorld(v); v.project(camera);
    if (v.z > 1) return;
    const now = performance.now(); yaziSira = now - yaziSon < 350 ? (yaziSira + 1) % 4 : 0; yaziSon = now;   // art arda yazılar üst üste binmesin
    const d = document.createElement('div'); d.className = 'hasar ' + cls; d.textContent = text;
    d.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - v.y) / 2 * innerHeight - yaziSira * 15) + 'px';
    document.body.append(d);
    requestAnimationFrame(() => { d.style.transform = 'translate(-50%, -50px)'; d.style.opacity = '0'; });
    setTimeout(() => d.remove(), 1100);
  };

  let rGorsel = 0;   // normal vuruşun (ok / vuruş karesi) hasarı ekranda görünene kadar (en çok 1,6 sn)
  // R vuruş klibi (mob ve oyuncu saldırısında ortak): silahın A / B animasyonları sırayla; yayda germe / arbalet nişanı
  function rKlibi() {
    const yay = takiliYay();
    const w = silahTuru(), rA = saldiriKlibi(), rB = 'atkb_' + w, ikili = (rA !== 'attack' || w === 'naked') && state.avatar?.has?.(rB);   // çıplak el: ANI_NAKED_ATTACK_A (sağ yumruk) / _B (sol-sağ kombinasyon) sırayla
    return yay && silahTuru() === 'xbow' ? 'a28' : yay && state.avatar?.has?.('a26') ? 'a26' : ikili && (rSira++ % 2) ? rB : rA;
  }
  const CIPLAK_KLIP = 1300, CIPLAK_ARALIK = 1500;   // (31.10) çıplak el: yumruk klibi en az 1,3 sn sürer (kısa klip yavaşlatılır), vuruş aralığı 1,5 sn
  let rKesik = null;   // oynayan R klibi (büyücü yetenekle keser)
  async function doAttack() {
    state.target = null;   // KO: saldırınca önceden tıklanan yere yürüme iptal (vuruştan sonra oraya devam etmez)
    busy = true; lastAttack = performance.now(); rGorsel = performance.now() + 1600;
    let komboR = false;
    { const av = state.avatar; if (av && performance.now() < (av._izKomboBekle || 0)) { av._izKomboBekle = 0; av._izKirmiziBit = performance.now() + saldiriAraligi() + 300; komboR = true; } }   // (4.11) R combo: bu R vuruşunun izi kırmızı
    const n = target;
    let struck = false, data = null, shown = false;
    const show = () => {
      if (shown || !struck || !data || !okVardi) return; shown = true; rGorsel = 0;
      applyHit(n, data); okVardiMob(n);
      if (komboR && data?.hit) komboFx();
    };
    const yay = takiliYay();
    if (yay && okSayisi() < 1) { busy = false; attacking = false; setSlotActive(false); okYokUyari(); return; }
    state.gorunmez?.boz?.('saldırdın');   // KO: R saldırısı görünmezliği kaldırır
    let okVardi = !yay;
    if (yay) {   // vuruş anında ok çıkar; hasar ok hedefe varınca görünür
      const show0 = show;
      const mesafe = Math.hypot(n.pos.x - player.position.x, n.pos.z - player.position.z), sure = Math.max(180, Math.min(700, mesafe * 22));
      const [aSelf, aFly, aHedef] = archery()?.fx || [500, 532, 551];
      if (aSelf) benFx(aSelf, { boyut: 0.8, enFazla: 2.5 });   // yay germe
      state.okKilit = performance.now() + 450;   // KO: yay gerilirken yürünmez; ok çıktığı anda (okCik1) kilit kalkar
      var okCik = () => okAt(n.pos, sure, () => { okVardi = true; show0(); }, { fx: aFly, hedefFx: aHedef });
    }
    // KO: R vuruşu silahın iki saldırı animasyonunu sırayla oynatır (ATTACK_A / ATTACK_B: atk_<silah> / atkb_<silah>) — hançerde de
    const kl0 = rKlibi(), kl = state.avatar?.has?.(kl0) ? kl0 : 'attack';
    // KO: vuruş animasyonu silah hızına sığar (aralık animasyondan kısaysa hızlanır)
    const hiz = silahTuru() === 'naked' ? Math.min(1, (state.avatar?.sure?.(kl) || 1.3) * 1000 / CIPLAK_KLIP) : Math.max(1, (state.avatar?.sure?.(kl) || 0) * 1000 / (saldiriAraligi() * 0.95));   // (31.10) çıplak el: KO'daki gibi animasyonun kendi hızı (n3anim fps), hızlandırılmaz
    state.savasSon = performance.now();
    let cikti = false; const okCik1 = () => { if (cikti) return; cikti = true; okBirakildi(); okCik(); };   // ok bir kez çıkar; çıkınca hemen yürünebilir   // ok bir kez çıkar
    if (silahTuru() === 'naked') state.yetenekKlipBit = Math.max(state.yetenekKlipBit || 0, performance.now() + (state.avatar?.sure?.(kl) || 0) * 1000 / hiz * 0.95);   // KO: çıplak elde sonraki yumruk animasyon bitince
    if (!state.avatar?.playOnce(kl, { r: true, speed: hiz, onStrike: () => { struck = true; if (yay) okCik1(); else show(); } })) { struck = true; if (yay) okCik1(); }
    // büyücü (asa R'si): yetenek basılınca R klibi hemen kesilir — vuruş hasarı o an işlenir, yetenek + kol animasyonu başlar
    rKesik = yay ? null : { ad: kl, kes: () => { if (!struck) { struck = true; show(); } } };
    // ok atma klibinde vuruş karesi yoksa (ya da yürüyüşle kesilirse) ok en geç 0,45 sn'de çıkar — kilit (0,75 sn) bitmeden
    if (yay) setTimeout(() => { if (!cikti) { struck = true; okCik1(); } }, 450);
    // R vuruşu klibi bir yetenekle kesilirse (seri R + yetenek) vuruş karesi gelmez: hasar yine de en geç 0,45 sn'de işlenir
    else setTimeout(() => { if (!struck) { struck = true; show(); } }, 450);
    n.aggro = true; n.aggroAt = performance.now(); n.petHedef = false;   // oyuncu vurunca mob oyuncuya döner
    n.okBekle = performance.now() + (yay ? 2500 : 1500);   // sunucu ölümü / canı yanıt ya da vuruş karesi gelmeden realtime'dan düşebilir — (4.11) yakın vuruşta da: can çubuğu hasar yazısıyla birlikte azalır, ölüm hasar görünmeden olmaz
    const res = await sb.rpc('mob_attack', { p_char: me.id, p_mob: n.id, p_x: player.position.x, p_z: player.position.z, p_mx: n.pos.x, p_mz: n.pos.z });
    busy = false;
    if (res.error || !res.data?.ok) { rGorsel = 0; okVardiMob(n); }
    if (res.error) { hud.notice(res.error.message, 'hata'); attacking = false; setSlotActive(false); return; }
    if (!res.data.ok) {
      if (res.data.reason === 'ölü') clearTarget();
      // sunucu R aralığı (0,55 sn) dolmadan geldi (R combo): vuruş kaybolmasın, kısa süre sonra yeniden denenir
      if (res.data.reason === 'bekle') lastAttack = performance.now() - saldiriAraligi() + 260;
      if (res.data.ok_yok) { attacking = false; setSlotActive(false); okYokUyari(); state.inv?.reload?.(); }
      return;
    }
    data = res.data; if (yay && data.ok_kalan != null) okYenile(data.ok_kalan); show();
  }

  // ---- KO büyücü ikincil etkileri: buz yavaşlatır, şimşek sersemletir (sunucu successrate zarı); süreli büyü hasarı 2 sn'de bir tık
  const dotlar = new Map();   // mob id → zamanlayıcı
  function buyuEtki(m, r, s) {
    const now = performance.now();
    if (r.sersem) { m.sersemBit = now + r.sersem * 1000; hud.info?.(`${m.t.name} is stunned.`, 'beceri'); floatText(m.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), 'Stun', 'iska'); }
    if (r.yavas != null) { m.yavasBit = now + (r.yavas_sure || 10) * 1000; m.yavasK = Number(r.yavas); hud.info?.(`${m.t.name} is slowed down.`, 'beceri'); floatText(m.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), 'Slow', 'iska'); }
    if (r.dot?.adet > 0) {
      clearInterval(dotlar.get(m.id));
      const ad = s?.ad || '';
      const id = setInterval(async () => {
        if (isDead(m) || S.dead) { clearInterval(id); dotlar.delete(m.id); return; }
        const { data } = await sb.rpc('mob_dot_tik', { p_char: me.id, p_mob: m.id, p_x: player.position.x, p_z: player.position.z }).then((x) => x, () => ({}));
        if (!data || data.bitti || (!data.ok && data.reason !== 'erken')) { clearInterval(id); dotlar.delete(m.id); }
        if (data?.ok) applyHit(m, data, { fx: false, ad });
      }, 2000);
      dotlar.set(m.id, id);
    }
  }
  function blinkHedef() {
    const yaw = state.yaw ?? 0, p = player.position;
    for (let d = 20; d >= 2; d -= 2) {   // önü kapalıysa (yükseklik farkı) daha yakına
      const x = p.x + Math.sin(yaw) * d, z = p.z + Math.cos(yaw) * d, y = state.heightAt?.(x, z);
      if (y == null || Math.abs(y - p.y) < 6) return { x, z };
    }
    return { x: p.x, z: p.z };
  }
  // bir vuruş sonucunu (mob_attack / skill_use sonucu) uygular: hasar yazısı, efektler, ölüm, sandık, seviye
  // KO vuruş parlaması (damage0_1 … damage3_2): R vuruşu ve yetenek isabetinde mobun gövdesinde rastgele bir türü (turuncu / kırmızı, yeşil,
  // mor-beyaz) oynar; _1 / _2 sırayla değişir (sağ / sol vuruş)
  // (2.11) KO orijinal fx.src: damage0_1 = damage3_2 (sarı-beyaz ışın yıldızı), damage0_2 = damage3_1 (pembe-mor kıvılcım),
  // damage1_2 = damage2_1 (camgöbeği buz parlaması), damage1_1 = damage2_2 (kırmızı-ateş). Düz R vuruşu: ilk üç renkten rastgele biri.
  // (4.11) dokulara göre: damage0_1 / 0_2 / 3_1 / 3_2 sarı-turuncu kıvılcım, damage1_2 / 2_1 yeşil (ice_a02 / iice), damage1_1 / 2_2 kırmızı (meny_01_red, roc_cast_fire).
  // Düz R vuruşu: sarı, yeşil, kırmızı eşit olasılıkla (art arda aynı renk gelmez); _1 / _2 sırayla.
  // (4.11) orijinal 2369 demetleri (fx.src, NTF7 dokular çözüldü): 0_1 / 3_2 mor-pembe, 1_2 / 2_1 yeşil-camgöbeği, 0_2 / 3_1 sarı-turuncu, 1_1 / 2_2 yeşil-sarı
  const DARBE_R = [['damage0_1', 'damage3_2'], ['damage1_2', 'damage2_1'], ['damage0_2', 'damage3_1'], ['damage1_1', 'damage2_2']];
  let darbeSira = 0, darbeSon = -1;
  // (4.11) fx.tbl kimlikleri (yayında da çalışsın diye sayısal): R vuruşu mavi / mor / yeşil, yakın dövüş yetenek (R combo) isabeti kırmızı (damage1_1 / damage2_2)
  const DARBE_ID = { damage0_1: 10002, damage0_2: 10048, damage1_1: 10049, damage1_2: 10050, damage2_1: 10051, damage2_2: 10052, damage3_1: 10053, damage3_2: 10054 };
  // (4.11) KO fx.tbl'si ile karşılaştırıldı (aynı demetler). Oyunda üç renk: sarı (damage0_x / 3_x), yeşil (1_2 / 2_1), mor (1_1 / 2_2).
  // R vuruşu ve yetenek isabeti ikisi de bu üç renkten rastgele; yetenek isabetinde bazen (≈%35) iki farklı renk birlikte çıkar.
  const darbeSec = (haric = -1) => {
    darbeSira ^= 1;
    const N = DARBE_R.length; let k = Math.floor(Math.random() * N), g = 0;
    while ((k === darbeSon || k === haric) && g++ < 8) k = Math.floor(Math.random() * N);
    darbeSon = k;
    return [k, DARBE_ID[DARBE_R[k][darbeSira]]];
  };
  const darbeIdler = (yetenek) => { const [k, a] = darbeSec(); if (!yetenek || Math.random() > 0.2) return [a]; return [a, darbeSec(k)[1]]; };
  // KO'da vuruş parlaması küçük yaratıkta (Worm) da tam boyutta: ölçek en az 1
  const darbeFx = (n, yetenek = false) => {
    // (4.11) yoğunluk sınırı: aynı moba 0,35 sn içinde ikinci parlama yok (çok vuruşlu / alan yetenekleri üst üste yığılmasın);
    //   çift renk yalnız son parlamadan 1,2 sn sonra (≈%20)
    const now = performance.now(), once = now - (n._darbeT || 0); if (once < 350) return;
    n._darbeT = now;
    for (const id of darbeIdler(yetenek && once > 1200)) koFx(id, n, ortaY(n), 1);
  };   // gövde ortasında
  // (4.11) KO R combo kılıç enerjisi (검기): orijinal fx.tbl 70128-70130 zzzall_newss_or1/2/3 (gumgy_knight_all_20099 red / yellow hilal meshleri) —
  // yetenekten hemen sonraki R vuruşunda karakterin önünde, baktığı yönde; üç çeşitten rastgele biri (art arda aynısı gelmez)
  let komboFxSon = -1;
  // hilal çeşitleri: 70129 yatay, 70128 yatık, 70130 çapraz + aynı meshler ileri eksen etrafında döndürülerek dikey ve ters çapraz
  const KOMBO_HILAL = [[70129, 0], [70128, 0], [70130, 0], [70129, Math.PI / 2], [70129, -Math.PI / 2], [70130, Math.PI / 2], [70128, Math.PI / 4], [70130, -Math.PI / 3]];
  function komboFx() {
    let i = Math.floor(Math.random() * KOMBO_HILAL.length), g = 0; while (i === komboFxSon && g++ < 5) i = Math.floor(Math.random() * KOMBO_HILAL.length); komboFxSon = i;
    const [id, roll] = KOMBO_HILAL[i];
    benFx(id, { boyut: 1, dir: ileri(), dy: 1, ...(roll ? { roll } : {}) });
  }

  // oyuncuya (PvP) vuruş parlaması: gövde ortasında, bende ve görüş mesafesindekilerde
  function darbeOyuncu(obj, hedefId, yetenek = false) {
    if (!obj) return;
    for (const id of darbeIdler(yetenek)) {
      const v = new THREE.Vector3();
      state.efekt?.(id, obj.position, { follow: () => { v.copy(obj.position); v.y += 1; return v; }, boyut: 1, enFazla: 3 });
      state.net?.fx?.({ k: 'o', id, o: String(hedefId), b: 1, e: 3, dy: 1 });
    }
  }
  // (2.11) yetenek isabetlerinde düz vuruş (R) darbe parlaması oynamaz: darbe: false — (4.11) yakın dövüş yetenekleri kırmızı darbe ('kirmizi')
  function applyHit(n, data, { fx = true, ad = null, darbe = true } = {}) {
    {
      const head = n.pos.clone().add(new THREE.Vector3(0, 2, 0));
      floatText(head, data.hit ? String(data.damage) : 'Iska', data.hit ? 'o' : 'iska');
      hud.info?.(data.hit ? `${n.t.name} received ${data.damage} damage` : `${S.name || me.name} Missed.`, data.hit ? 'o' : 'iska');
      if (data.back) hud.info?.(`${data.back} HP Damage`, 'ben');
      { const yh = data.mob_hp ?? data.npc_hp; if (yh != null) n.hp = Number(yh); }   // yanıtta can yoksa (ıska/bekle) eski değer kalır → çubuk kararmaz
      if (data.hit && !data.killed) { n.model?.playOnce('struck'); if (n.t.korkuluk) n.sars = performance.now() + 350; }
      // KO: vuruşta kan efekti (FXID_BLOOD), elementli silahta hedef efekti (FXID_SWORD_*_TARGET)
      if (darbe && data.hit && data.damage > 0) darbeFx(n, darbe === 'kirmizi');
      if (data.hit && data.damage > 0) dispatchEvent(new CustomEvent('ko-hasar-verdim', { detail: Number(data.damage) }));   // (3.11) Party War Board
      if (fx && data.hit && data.damage > 0) {
        const hy = n.pos.y + Math.max(0.6, (n.t.size / 100) * 0.9);
        // mavi vuruş parlaması (FXID_BLOOD 10002 / damage0_1) kapatıldı
        const tfx = { 1: 10031, 2: 10032, 3: 10033, 4: 10034 }[state.weaponEl];
        if (tfx) zeminFx(tfx, n, 0.3, 0.35);   // silah element efekti mobda çok küçük
      }
      if (data.back) {   // karşı vuruş: hasar yazısı ve oyuncunun darbe animasyonu mobun vuruş karesinde
        let oldu = false; const vur = () => { if (oldu) return; oldu = true; floatText(player.position.clone().add(new THREE.Vector3(0, 2.2, 0)), String(data.back), 'ben'); if (!data.dead) { state.dinlen?.kalk(true); state.avatar?.playOnce('struck'); } };
        if (n.model?.playOnce(mobSaldiriKlibi(n), { speed: 0.8, onStrike: vur })) n.atkUntil = performance.now() + 1125; else vur();
        setTimeout(vur, 900);
      }
      Object.assign(S, { hp: data.hp, max_hp: data.max_hp, mp: data.mp, max_mp: data.max_mp, exp: Number(data.exp), level: data.level, gold: Number(data.gold) });
      if (data.killed) {
        n.dead_until = data.respawn_at; n.hp = 0;
        if (Number(data.gained) > 0) hud.info(`Earned ${data.gained} Experience Points`, 'exp');
        if (!(n.olumYer && performance.now() - n.olumYer.t < 3000)) n.olumYer = { x: n.pos.x, z: n.pos.z, t: performance.now() };
        if (data.box) { state.loot?.drop(data, { x: n.olumYer.x, z: n.olumYer.z, name: n.t.name, mob: n.id }); n.kutu = data.box; }
        n.aggro = false;
        // KO gibi: ölüm animasyonu oynar, ceset 10 sn yerde kalır, sonra kaybolur
        n.dying = performance.now() + (n.kutu != null && data.box ? 20000 : 10000); olum(n);   // sandıklı ceset sandık kalkana dek (20 sn) yatar
        if (target === n) clearTarget();
      }
      if (data.gorev?.length) state.gorev?.guncelle(data.gorev);   // KO görevleri: öldürme sayacı
      if (data.parti_exp?.length) state.parti?.expYay?.(data.parti_exp, data.gained);   // (3.11) parti tecrübe payları → üyelere bildirim
      if (data.pet) state.pet?.oldurmeBilgisi?.(data.pet);   // pet deneyimi
      if (data.levelup) {
        if (data.level != null) me.level = Number(data.level);   // (7.11) karakter satırı da güncel: yetenek penceresi (temel yetenekler seviyeyle açılır) ve diğer seviye denetimleri
        hud.info(`Level Up! (Level ${data.level})`, 'seviye'); state.inv?.stats?.();
        seviyeFx();
        window.dispatchEvent(new CustomEvent('ko-seviye'));   // başarımlar: seviye
      }
      if (data.dead) die();
      refreshTarget(); showStats();
    }
  }

  function die() {
    state.dinlen?.kalk(true);
    S.dead = true; attacking = false; clearTarget(); state.frozen = true; state.net?.can?.(0, S.max_hp, true);   // herkesin hedefinden çıkar
    state.buffHiz = null; state.savasciGrup?.clear?.(); dispatchEvent(new Event('ko-olum'));   // ölünce Swift / Light Feet / Sprint silinir
    if (state.donusum) state.donusumApi?.bitir?.();   // KO: ölünce dönüşüm biter
    // KO: canavara ölünce tecrübe kaybı (sunucu _karakter_seviye_kural; PvP / arena kaybettirmez)
    { const eskiL = Number(S.level), eskiE = Number(S.exp);
      setTimeout(async () => {
        const { data: c } = await sb.from('characters').select('level,exp').eq('id', me.id).maybeSingle().then((r) => r, () => ({}));
        if (!c) return;
        const L = Number(c.level), E = Number(c.exp);
        const kayip = L < eskiL ? eskiE + (expNext(L) - E) : eskiE - E;
        Object.assign(S, { level: L, exp: E }); showStats();
        if (kayip > 0) hud.info?.(`Lost ${kayip} Experience Points`, 'ben');
        if (L < eskiL) { hud.notice?.(`Your level dropped to ${L}.`, 'hata'); state.inv?.stats?.(); }
      }, 500); }
    state.avatar?.playOnce('dead', { hold: true });
    // Ardream: ulusun üssünde; Moradon arenası: arena girişinde; diğer haritalar (Luferson, El Morad, Eslant…): o haritada doğar
    const harita = hud.zoneName || 'Moradon', ulusNoktali = ['karus2004', 'elmo2004', 'eslantzone', 'freezone_b', 'freezone_c'].includes(zone);
    const BOLGESIZ = new Set(['karus_intro', 'elmorad_intro', 'freezone_a', 'freezone_b', 'freezone_c']);
    const arenadaOldu = ['freezone_a', 'freezone_b', 'freezone_c'].includes(zone) ? 'us' : zone === 'arena' || state.arena?.icinde?.() ? true : { bolge: BOLGESIZ.has(zone) ? 'Moradon' : harita, us: ulusNoktali };
    try { state.net?.save?.(); } catch {}   // ölüm yeri sunucuya yazılsın (arenada ölen arenaya döner)
    let dirildi = false;
    const diril = async () => {
      if (dirildi) return; dirildi = true;
      try { await state.net?.save?.(); } catch {}
      const { data } = await sb.rpc('revive', { p_char: me.id });
      if (data?.ok && data.zone && data.zone !== me.zone) {   // doğma noktası olmayan haritada öldü → Moradon'a dön
        state.net?.halt?.(); const u = new URL(location.href); u.searchParams.set('karakter', me.id); location.replace(u.toString()); return;
      }
      if (data?.ok) {
        S.dead = false; S.hp = data.hp; state.frozen = false; hud.dead(false); state.avatar?.stopOnce(true);
        dispatchEvent(new Event('ko-dirilis'));
        state.gorunmez?.koruma?.(5); hud.info?.('Respawn protection: you are immune to damage for 5 seconds.', 'beceri');   // sunucu revive koruma_bitis = +5 sn   // beceri etkileri silinir, yalnız scroll/eşya etkileri kalır (sunucu revive ile aynı)
        setTimeout(() => state.inv?.stats?.(), 300);   // ölü poz anında kalkar (herkeste)
        state.hedefTemizle?.(); state.arena?.birak?.(); state.loot?.kapat?.();   // diriliş: yerde kalan işaret/hedef temizlenir
        player.position.set(data.x, state.heightAt(data.x, data.z), data.z); showStats();
        if (data.arena) hud.info?.('You have respawned at the arena entrance.', 'beceri');
        if (data.base) hud.info?.("You have respawned at your nation's base.", 'beceri');
      } else dirildi = false;
    };
    state.diril = diril;   // Genie: "ölünce otomatik kalk"
    hud.dead(true, diril, arenadaOldu);
    dispatchEvent(new CustomEvent('ko-oldum'));
  }
  if (S.dead) die();

  // ---- can/mana yenilenmesi (sunucu süreyi ölçer)
  setInterval(async () => {
    if (S.dead || (S.hp >= S.max_hp && S.mp >= S.max_mp)) return;
    const { data } = await sb.rpc('regen', { p_char: me.id });
    if (data?.ok && minorBekleyen.size) return;   // (9.11) Minor yanıtı yolda: bu dilimi atla (çift düşüm / geri sıçrama olmasın)
    if (data?.ok) {
      const dh = Number(data.hp) - S.hp, dm = Number(data.mp) - S.mp;
      S.hp = data.hp; S.mp = data.mp; showStats();
      // KO işlem bilgisi: mavi "<n> HP Recovered" / "<n> SP Recovered"
      if (dh > 0) hud.info?.(`${dh} HP Recovered`, 'iyi');
      if (dm > 0) hud.info?.(`${dm} ${spMi() ? 'SP' : 'MP'} Recovered`, 'iyi');
    }
  }, 5000);
  function spMi() { return [1, 5, 6, 2, 7, 8, 13, 14, 15].includes(Number(me.class) % 100); }

  // ---- saldırgan canavarlar
  const strikeAt = new Map();
  const turn = (a, b, k) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * Math.min(1, k); };
  // KO K_MONSTER iMagic1-3 → Skill_Magic_Main (deadsoft 2369, tools/convert/mob-buyu.mjs): [SelfFX, SelfPart, FlyingFX, TargetFX, TargetPart, no]
  // KO CMagicSkillMng gibi: döküm efekti mobun SelfPart eklemine bağlı (2 göğüs, 12 sağ el…; −1 / 255 ayakta), uçan efekt mobdan hedefe gider,
  // hedef efekti TargetPart'ta (−1 / 255: hedefin bulunduğu yer — Apostle şimşeği gökten iner; 0… oyuncunun eklemi); KO ölçeği (kırpma yok)
  let BUYU = null; fetch(window.KO_V ? window.KO_V('./assets/mob-db/buyu.json') : './assets/mob-db/buyu.json').then((r) => (r.ok ? r.json() : null)).then((d) => { BUYU = d; }).catch(() => {});
  import('./fx.js').then((F) => F.fxEkle('./assets/fxmobbuyu')).catch(() => {});   // deadsoft'tan: üst seviye canavar / boss büyü efektleri
  const EKLEM_CIFT = { 7012: [7, 12], 72: [7, 2], 61: [6, 1], 128: [12, 8] };
  function mobEklemFx(n, id, sp) {
    const mm = n.model, sc = Math.max(0.3, (n.t.size || 100) / 100), v = new THREE.Vector3();
    const ayak = () => v.copy(n.pos);
    const say = mm?.eklemAdlari?.length || 0;
    const eklemler = (EKLEM_CIFT[sp] || [sp]).filter((e) => e >= 0 && e < say && e !== 255);
    if (!eklemler.length || !mm?.setPlug) { state.efekt?.(id, n.pos.clone(), { follow: ayak, scale: sc }); return; }
    for (const e of eklemler) {
      const key = 'mobFx' + (++_eklemNo), plug = new THREE.Object3D(); mm.setPlug(key, plug, e, _EKLEM_M);
      const w = new THREE.Vector3(), vv = new THREE.Vector3();
      const yer = () => { if (!plug.parent) return ayak(); plug.updateWorldMatrix(true, false); w.setFromMatrixPosition(plug.matrixWorld); return vv.set(w.x, w.y, -w.z); };
      const b = state.efekt?.(id, yer().clone(), { follow: yer, scale: sc });
      const kaldir = () => mm.setPlug(key, null);
      if (b) { const d0 = b.dispose.bind(b); b.dispose = () => { d0(); kaldir(); }; } setTimeout(kaldir, 6500);
    }
  }
  function mobBuyu(n, hedefPos) {
    const l = BUYU?.[n.sid]; if (!l?.length || Math.random() > 0.4) return null;
    const [ben, sp, uc, hd, tp] = l[Math.floor(Math.random() * l.length)];
    if (ben && !GENEL_DOKUM.has(ben)) mobEklemFx(n, ben, Number(sp));
    const hedefVur = () => {
      if (!hd) return;
      const t = Number(tp);
      if (t >= 0 && t < 200 && state.avatar?.eklemAdlari && t < state.avatar.eklemAdlari.length) { benFx(hd, { eklem: t, zorla: true }); return; }
      const v = new THREE.Vector3(); const hp = () => { const p = hedefPos(); return p ? v.set(p.x, p.y, p.z) : v; };
      state.efekt?.(hd, hp().clone(), { follow: hp });   // hedefin bulunduğu yer, KO ölçeği (gökten inen şimşek vb.)
    };
    return () => {
      const p = hedefPos();
      if (!uc || !p) { hedefVur(); return; }
      // uçan efekt: mobun göğsünden oyuncunun göğsüne düz çizgide (yön her karede gidişe bakar)
      const gy = Math.max(0.8, (kafaY(n) - 1) * 0.7), p0 = new THREE.Vector3(n.pos.x, n.pos.y + gy, n.pos.z);
      const hv = new THREE.Vector3(), hedef = () => { const q = hedefPos() || p; return hv.set(q.x, q.y + basYuk() * 0.6, q.z); };
      const t0 = performance.now(), ms = Math.round(Math.max(200, Math.min(800, p0.distanceTo(hedef()) * 28))), vv = new THREE.Vector3();
      const yq = new THREE.Quaternion(), yd = new THREE.Vector3(), Zx = new THREE.Vector3(0, 0, 1);
      const b = state.efekt?.(uc, p0, { dir: hedef().clone().sub(p0), yon: () => { yd.copy(hedef()).sub(p0); return yd.lengthSq() < 1e-6 ? null : yq.setFromUnitVectors(Zx, yd.normalize()); }, follow: () => vv.copy(p0).lerp(hedef(), Math.min(1, (performance.now() - t0) / ms)) });
      setTimeout(() => { b?.stop?.(); hedefVur(); }, ms);
    };
  }
  // KO: mobların iki saldırı animasyonu (ANI_NPC_ATTACK0 / ATTACK1) sırayla oynar; ikincisi yoksa hep ilki
  function mobSaldiriKlibi(n) { const iki = n.model?.has?.('attack1'); n._asira = !n._asira; return iki && !n._asira ? 'attack1' : 'attack'; }
  async function npcStrike(n) {
    if (n.t.pasif) return;
    const now = performance.now();
    if (n.sersemBit > now) return;   // şimşek büyüsüyle sersemlemiş mob saldırmaz
    if ((strikeAt.get(n.id) || 0) > now) return;
    strikeAt.set(n.id, now + n.t.delay + Math.random() * 300);
    n.aggroAt = now; state.sonSaldiran = { n, t: now };   // pet Savunma komutu
    // KO: mobun saldırı animasyonu hemen başlar; hasar yazısı ve oyuncunun darbe (struck) animasyonu mobun vuruş karesinde (strike) görünür
    let vurdu = false, sonuc = null;
    const goster = () => {
      if (!vurdu || !sonuc) return; const data = sonuc; sonuc = null;
      floatText(player.position.clone().add(new THREE.Vector3(0, 2.2, 0)), data.back ? String(data.back) : 'Iska', data.back ? 'ben' : 'iska');
      hud.info?.(data.back ? `${data.back} HP Damage` : `${n.t.name} Missed.`, data.back ? 'ben' : 'iska');
      if (data.emilen > 0) hud.info?.(`${data.emilen * 4} MP Used`, 'beceri');
      if (data.yansit > 0) { floatText(n.pos.clone().add(new THREE.Vector3(0, 2, 0)), String(data.yansit), 'o'); hud.info?.(`${n.t.name} received ${data.yansit} damage`, 'o'); if (data.mob_hp != null) { n.hp = Number(data.mob_hp); if (target === n) refreshTarget(); } }
      S.hp = data.hp; if (data.mp != null) S.mp = data.mp; showStats(); if (data.back && !data.dead) { state.dinlen?.kalk(true); state.avatar?.playOnce('struck'); } if (data.dead) die();
    };
    const buyu = mobBuyu(n, () => player.position); let buyuOldu = false; const buyuVur = () => { if (buyu && !buyuOldu) { buyuOldu = true; buyu(); } };
    if (n.model?.playOnce(mobSaldiriKlibi(n), { speed: 0.8, onStrike: () => { vurdu = true; buyuVur(); goster(); } })) n.atkUntil = now + 1125;   // mob vuruş animasyonu %20 yavaş
    else { vurdu = true; buyuVur(); }
    setTimeout(() => { vurdu = true; goster(); }, 900);   // klip kesilirse
    const { data } = await sb.rpc('mob_strike', { p_char: me.id, p_mob: n.id });
    if (data?.ok) { sonuc = data; goster(); }
  }

  // ---- pete saldıran mob (mob_pet_strike): hasar yazısı petin üstünde, pet darbe animasyonu; can biterse pet ölür
  async function petStrike(n) {
    const now = performance.now();
    if ((strikeAt.get(n.id) || 0) > now) return;
    strikeAt.set(n.id, now + n.t.delay + Math.random() * 300);
    n.aggroAt = now;
    let vurdu = false, sonuc = null;
    const goster = () => {
      if (!vurdu || !sonuc) return; const data = sonuc; sonuc = null;
      const pk = state.pet?.konum?.(); if (pk) floatText(new THREE.Vector3(pk.x, pk.y + 1.6, pk.z), data.back ? String(data.back) : 'Iska', data.back ? 'ben' : 'iska');
      state.pet?.hasarAl?.(n, data);
    };
    if (n.model?.playOnce(mobSaldiriKlibi(n), { speed: 0.8, onStrike: () => { vurdu = true; goster(); } })) n.atkUntil = now + 1125;
    else vurdu = true;
    setTimeout(() => { vurdu = true; goster(); }, 900);
    const { data } = await sb.rpc('mob_pet_strike', { p_char: me.id, p_mob: n.id });
    if (data?.ok) { sonuc = data; goster(); } else if (data?.reason === 'pet yok') n.petHedef = false;
  }

  // ---- menü pencereleri
  const CLS = { 1: 'Savaşçı', 2: 'Okçu', 3: 'Büyücü', 4: 'Rahip', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Enchanter', 11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Uzman Kurian', 15: 'Usta Kurian' };
  const windows = {
    karakter: () => hud.window('Karakter', `<table>
      <tr><td>Ad</td><td>${me.name}</td></tr><tr><td>Seviye</td><td>${S.level}</td></tr><tr><td>Sınıf</td><td>${CLS[me.class] || ''}</td></tr>
      <tr><td>Ulus</td><td>${me.nation === 1 ? 'Karus' : 'El Morad'}</td></tr>
      <tr><td>Can</td><td>${S.hp} / ${S.max_hp}</td></tr><tr><td>Mana</td><td>${S.mp} / ${S.max_mp}</td></tr>
      <tr><td>Güç (STR)</td><td>${me.str}</td></tr><tr><td>Sağlık (HP)</td><td>${me.sta}</td></tr><tr><td>Çeviklik (DEX)</td><td>${me.dex}</td></tr>
      <tr><td>Zeka (INT)</td><td>${me.intel}</td></tr><tr><td>Büyü Gücü (MP)</td><td>${me.cha}</td></tr>
      <tr><td>EXP</td><td>${S.exp.toLocaleString('tr-TR')} / ${expNext(S.level).toLocaleString('tr-TR')}</td></tr></table>`),
    envanter: () => hud.window('Envanter', `<table><tr><td>Altın (Noah)</td><td>${S.gold.toLocaleString('tr-TR')}</td></tr></table><p class="ko-alt">Eşya sistemi sonraki aşamada.</p>`),
  };
  hud.bind?.(() => ({ me, S, expNext }));
  const openWin = (k) => hud.panel?.(k) || (windows[k] ? windows[k]() : hud.window({ beceri: 'Beceriler', parti: 'Parti', klan: 'Klan', gorev: 'Görevler', ayar: 'Ayarlar' }[k] || k, '<p class="ko-alt">Sonraki aşamada.</p>'));
  document.querySelectorAll('#menu button').forEach((b) => (b.onclick = () => openWin(b.dataset.m)));
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    // KO kısayolları: C otur/kalk, L posta kutusu, U karakter bilgisi, I envanter, K beceri
    if (e.code === 'KeyC' && !e.ctrlKey && !e.altKey) { state.dinlen?.toggle(); return; }
    if (e.code === 'KeyL' && !e.ctrlKey && !e.altKey) { if (e.repeat) return; if (state.mail?.ackapa) state.mail.ackapa(); else if (state.mail?.ac) state.mail.ac(); return; }   // L: posta kutusu aç / kapat
    const k = { KeyU: 'karakter', KeyI: 'envanter', KeyK: 'beceri', KeyP: 'parti', KeyG: 'klan', KeyQ: null, KeyO: 'ayar' }[e.code];
    if (k) { if (hud.windowOpen && !hud.panel) hud.window(null); else openWin(k); }
  });

  // KO R vuruş aralığı: sağ eldeki silahın Delay değeri / 100 sn (100 = 1 sn; hançer ~0.8, çift el ~1.2-1.4); silahsız 1 sn.
  // Yay/arbalet: temel ok yeteneği (102003) döküm süresi + 0.15 sn.
  // KO silah tipine göre saldırı animasyonu (e_Ani: ANI_SWORD_ATTACK_A0, ANI_DAGGER_…, ANI_NAKED_ATTACK_A0 …)
  function silahTuru() {
    const it = state.inv?.items, sag = it?.get?.(6)?.it, sol = it?.get?.(8)?.it;
    const k = (x) => Number(x?.Kind) || 0, silah = (x) => x && Number(x.Damage) > 0;
    // KO (ko4life GameDef.h / MagicSkillMng.cpp): arbalet (ITEM_CLASS_BOW_CROSS) duruşu ANI_CROSS_BOW_BREATH (93); atışta yay ANI_SHOOT_ARROW_A/B (26/27)
    // yerine ANI_SHOOT_QUARREL_A (28, diz çöküp nişan) ve QUARREL_B (29, bırakma) oynar
    const xb = (x) => x && (k(x) === 71 || (k(x) === 70 && /crossbow/i.test(x.strName || '')));
    if (xb(sag) || xb(sol)) return state.avatar?.has?.('a28') ? 'xbow' : 'bow';
    if ([70, 71].includes(k(sag)) || [70, 71].includes(k(sol))) return 'bow';
    // KO: iki elde hançer (suikastçı) → hançer saplama animasyonu (attack_dagger); diğer çift silahlar dual
    if (silah(sag) && silah(sol) && (k(sag) === 11 || k(sol) === 11)) return 'dagger';
    if (silah(sag) && silah(sol) && ![60].includes(k(sol))) return 'dual';
    const K = k(sag) || (silah(sol) ? k(sol) : 0);
    // KO e_ItemClass → e_Ani grubu: 11 hançer, 21 kılıç, 22 çift el kılıç, 31 balta, 32 çift el balta (çift el topuz vuruşu),
    // 41/43/181 topuz (rahip topuzu 181), 42 çift el topuz, 51 mızrak, 52 uzun mızrak (polearm), 110 asa (tek el topuz vuruşu).
    // Yalnız kalkan (60) ya da silahsız → yumruk (ANI_NAKED_ATTACK).
    return { 11: 'dagger', 21: 'sword', 22: '2h', 31: 'axe', 32: 'blunt2h', 41: 'blunt', 42: 'blunt2h', 43: 'blunt', 181: 'blunt', 110: 'blunt', 51: 'spear', 52: 'pole', 61: 'blunt2h', 62: 'pole', 63: 'pole', 140: 'sword' }[K] || 'naked';
  }
  // KO JudgeAnimationAttack: düz R vuruşu silah türünün ATTACK_A animasyonu (attack_<silah>0_A).
  // B animasyonu (attack_<silah>0_B, daha uzun gösterişli savuruş) yakın dövüş yeteneklerinde kullanılır; R vuruşunda kullanılmaz.
  let rSira = 0;
  function saldiriKlibi() {
    const w = silahTuru(), a = w === 'xbow' ? 'a28' : w === 'naked' ? 'attack' : 'atk_' + w;
    return state.avatar?.has?.(a) ? a : 'attack';
  }
  // KO yetenek kol animasyonları (animasyon tablosu 112-135: skill_<silah>_A / _B) — yakın dövüş yetenekleri silaha göre bunları sırayla oynatır
  const YETENEK_ANIM = { dagger: [116, 117], dual: [118, 119], sword: [128, 129], '2h': [134, 135], axe: [112, 113], blunt: [120, 121], blunt2h: [122, 123], spear: [126, 127], pole: [124, 125] };
  let yetSira = 0;
  function yetenekVurusKlibi() {
    const w = silahTuru(), p = YETENEK_ANIM[w];
    if (p) { const c = 'a' + p[yetSira++ % 2]; if (state.avatar?.has?.(c) && (state.avatar?.sure?.(c) || 0) >= 0.3) return c; }
    const b = w === 'xbow' ? 'a28' : w === 'bow' ? 'a26' : 'atkb_' + w;
    return state.avatar?.has?.(b) ? b : saldiriKlibi();
  }
  // KO JudgeAnimationBreath: saldırı modunda silah duruşu (breath_<silah>)
  function savasDurusu() { const c = 'b_' + silahTuru(); return state.avatar?.has?.(c) ? c : null; }
  // yetenek animasyonu: tbl iSelfAnimID1 (= KO e_Ani sırası). Yakın dövüş yeteneklerinde silah vuruşu ya da 112-135 silah yetenek animasyonu.
  function yetenekKlibi(s) {
    const a = Number(s.anim), has = (c) => state.avatar?.has?.(c);
    // yakın dövüş yeteneği: tabloda özel animasyon (112-135 silah yetenekleri, 18-24 Crash vb.) varsa o; yoksa (26) silahın yetenek savuruşu (ATTACK_B)
    if (s.tip1 === 1) {
      // KO Skill_Magic_1.tbl: yeteneğin kendi kol animasyonu (tek el / çift el silah sütunu) — ör. Spike 129, Jab 128, Cut 114
      if (Array.isArray(s.ka)) {
        const w = silahTuru(), iki = ['2h', 'blunt2h', 'pole'].includes(w);
        for (const k of iki ? [s.ka[1], s.ka[0]] : [s.ka[0], s.ka[1]]) { const c = 'a' + k; if (k > 0 && has(c) && (state.avatar?.sure?.(c) || 0) >= 0.3) return c; }
      }
      return a !== 26 && a > 0 && has('a' + a) ? 'a' + a : yetenekVurusKlibi();
    }
    if (s.tip1 === 2 && silahTuru() === 'xbow' && has('a28')) return 'a28';   // KO: arbalette ok yetenekleri ANI_SHOOT_QUARREL_A
    if (s.tip1 === 2 && (a === 26 || a < 0 || !a)) return has('a26') ? 'a26' : 'atk_bow';
    if (!(a > 0)) return null;
    // asas kendine buffları (Evade/Safety/Scaled Skin, Light Feet, Sprint…): karakter animasyonu yok, yalnız efekt
    const sinifNo = Math.floor(s.id / 1000) % 100;
    if (s.tip1 === 4 && (a === 24 || (a === 26 && Number(s.hedef) === 1)) && [2, 7, 8].includes(sinifNo)) return null;   // Critical Point (anim 26, kendine): KO'da kol animasyonu yok
    if (s.id % 1000 === 705 && [7, 8].includes(sinifNo)) return null;   // suikastçı Minor healing: kol animasyonu yok
    if (a === 16) return 'cast'; if (a === 17) return 'cast2';
    // bazı ırklarda klip boş (ör. Karus iri savaşçıda a24 = 0 sn) → KO'daki gibi yetenek (a18) ya da büyü duruşu
    const dolu = (c) => has(c) && (state.avatar?.sure?.(c) || 0) >= 0.3;
    // (3.11) savaşçı (KO MagicSkillMng: m_iMagicAni = iSelfAnimID1): klip boşsa (ör. Karus iri savaşçı a24) KO'da kol hareketi yok — yedek klip oynatılmaz
    if (savasciYet(s) && a === 26 && s.tip1 !== 1) return null;
    if (savasciYet(s) && [730, 750].includes(Number(s.id) % 1000)) return null;   // (4.11) Restoration / Regeneration: kol animasyonu yok, yalnız mavi baloncuklar (2601)   // (4.11) Rise / Outrage / Hate / Blaze Killer (anim 26): KO'da kol animasyonu yok (a26 bizde ok germe)
    if (/^sprint$/i.test(String(s.ad || ''))) return null;   // (7.11) Rogue Sprint de savaşçınınki gibi: kol animasyonu yok   // (4.11) Sprint: Karus savaşçıdaki gibi kol animasyonu yok (insan barbarda klip saçma oynuyordu), yalnız mavi koşu efekti
    if (savasciYet(s)) return dolu('a' + a) ? 'a' + a : null;
    return dolu('a' + a) ? 'a' + a : dolu('a18') ? 'a18' : 'cast';
  }
  function saldiriAraligi() {
    if (silahTuru() === 'naked') return CIPLAK_ARALIK;   // (31.10) KO: çıplak el yumruğu yavaş — ~1,5 sn'de bir
    const it = state.inv?.items, sag = it?.get?.(6)?.it, sol = it?.get?.(8)?.it;
    const yay = [sag, sol].find((x) => x && [70, 71].includes(Number(x.Kind)));
    if (yay) { const Y = yetenekVerisi(); if (!Y) loadYetenekler().catch(() => {}); const s = Y?.yetenekler?.[102003]; return ((s?.dokum ?? 10) / 10 + 0.15) * 1000; }
    const d = Number(sag?.Delay) || Number(sol && Number(sol.Damage) > 0 ? sol.Delay : 0) || 100;
    return Math.max(600, Math.min(2000, d * 10));
  }
  // ---- kare güncellemesi (main.js çağırır)
  // ---- ortak mob konumları
  const meId = Number(me.id);
  const hash01 = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  /** boşta dolaşma: mob kimliği ve ortak saatten (Date.now) belirlenen yol — her istemcide aynı. Her turda yürür, sonra durur. */
  function gezPos(n, tSn) {
    const P = 9 + (n.id % 4), sabit = n.t.sabit || n.t.pasif && !n.t.korkuluk;
    if (sabit) return { x: n.spot.x, z: n.spot.z, moving: false, yaw: n.yaw };
    const t2 = tSn + hash01(n.id, 7) * P, k = Math.floor(t2 / P), s = t2 - k * P;
    const R = Math.max(1.5, n.home.r);
    const g = (i) => { const a = hash01(n.id, i * 2 + 1) * 6.283, r = Math.sqrt(hash01(n.id, i * 2 + 2)) * R; return [n.home.x + Math.cos(a) * r, n.home.z + Math.sin(a) * r]; };
    const A = g(k - 1), B = g(k), d = Math.hypot(B[0] - A[0], B[1] - A[1]), wt = Math.min(P * 0.7, d / Math.max(0.5, n.t.walk || 1.5));
    const yaw = Math.atan2(B[0] - A[0], B[1] - A[1]);
    if (s < wt) { const f = s / wt; return { x: A[0] + (B[0] - A[0]) * f, z: A[1] + (B[1] - A[1]) * f, moving: true, yaw }; }
    return { x: B[0], z: B[1], moving: false, yaw };
  }
  let mobSahip = [], mobBitti = new Set(), mobYayinSon = 0, mobYayinZorla = false;
  function mobYayin() {
    const now = performance.now();
    if (!mobBitti.size && (!mobSahip.length || (!mobYayinZorla && now - mobYayinSon < 150))) return;
    mobYayinSon = now; mobYayinZorla = false;
    const l = mobSahip.map((n) => [n.id, +n.pos.x.toFixed(2), +n.pos.z.toFixed(2), +n.yaw.toFixed(2), n.moving ? 1 : 0, n.returning || (n.aggro && n.moving) ? 1 : 0, n.atkUntil > now ? 1 : 0, meId, n.claim || 0]);
    for (const id of mobBitti) l.push([id, 0, 0, 0, 0, 0, 0, 0, 0]);
    mobBitti.clear();
    if (l.length) state.net?.mob?.(l);
  }
  /** başka istemcinin yönettiği mob konumları (net 'mob') */
  function mobUzak(l) {
    const now = performance.now();
    for (const [id, x, z, yaw, m, r, a, h, ts] of l || []) {
      const n = npcs.get(id); if (!n) continue;
      if (!h) { if (n.uz && !(n.uz.h && Number(n.uz.h) === meId)) n.uz = null; continue; }
      n.uz = { x, z, yaw, m, r, a, h, ts, at: now };
    }
  }
  const MOB_TETIK = 5, MOB_TETIK_SURE = 3000;   // saldırgan mob: 5 m tetikleme, 3 sn bekleme
  const MOB_GORUS = 70;   // moblar her bölgede 70 m'den görünür
  function update(dt, t) {
    mobSahip = [];
    // saldırı modunda silah duruşu; son vuruştan 5 sn sonra normal duruş
    state.savasDurus = (attacking && target) || performance.now() - (state.savasSon || -1e9) < 5000 ? savasDurusu() : null;
    for (const n of npcs.values()) {
      const dead = isDead(n) && !(n.dying > performance.now());
      n.obj.visible = !dead;
      // KO yeniden doğma: ceset önce yok olur, 2 sn sonra mob doğduğu yerde sıfırdan (ayakta, geçişsiz) belirir — yerden kalkıyormuş gibi görünmez
      if (!isDead(n) && n.dying) {
        n.dying = 0; n.kutu = null; n.model?.stopOnce(true); n.model?.setClip?.('breath'); n.model?.blendIptal?.(); dirilt(n); if (!(Number(n.hp) > 0)) n.hp = n.t.max_hp;
        n.pos.set(n.spot.x, 0, n.spot.z); n.aggro = false; n.returning = false; n.dogumBekle = performance.now() + 2000;
        if (target === n) clearTarget();
      }
      if (n.dogumBekle) {
        if (performance.now() < n.dogumBekle) { n.obj.visible = false; continue; }
        n.dogumBekle = 0; n.model?.stopOnce(true); n.moving = false; n.atkUntil = 0; n.model?.setClip?.('breath'); n.model?.blendIptal?.(); dirilt(n);   // (7.11) KO: bir anda belirir — ölü pozundan duruşa geçiş (ayağa kalkma) yok
      }
      if (dead) { n.pos.set(n.spot.x, 0, n.spot.z); n.aggro = false; n.returning = false; continue; }
      const px = player.position.x, pz = player.position.z;
      const dp = Math.hypot(px - n.pos.x, pz - n.pos.z);
      // performans: 70 m ötesindeki moblar çizilmez ve yapay zekâları çalışmaz; isimler yalnızca 15 m içinde
      if (dp > MOB_GORUS && !n.aggro) { n.obj.visible = false; continue; }
      n.tag.visible = dp <= 15 && FXN();
      if (!n.model) n.load();
      if (isDead(n)) { n.model?.update(dt); olumKare(n, dt); continue; }   // ceset: yerinde, ölüm pozunda
      const now = performance.now();
      // ---- çok oyunculu: herkes aynı mobu aynı yerde görsün.
      //  * boşta dolaşma / korkuluk: mob kimliği + ortak saatten belirlenen yol (her istemcide aynı, ağ trafiği yok)
      //  * saldırırken / dönerken: mobu kovalatan oyuncunun istemcisi yönetir ve konumunu yayınlar (net 'mob'); diğerleri onu izler
      const uz = n.uz && now - n.uz.at < 1600 ? n.uz : null;
      const uzakSahip = !!(uz && uz.h && Number(uz.h) !== meId && !(n.aggro && n.claim && (n.claim > uz.ts || (n.claim === uz.ts && meId < Number(uz.h)))));
      if (uzakSahip && (n.aggro || n.returning)) { n.aggro = false; n.returning = false; n.claim = 0; }
      let engaged = false;
      if (uzakSahip) {
        const k = Math.min(1, dt * 10);
        if (Math.hypot(uz.x - n.pos.x, uz.z - n.pos.z) > 8) { n.pos.x = uz.x; n.pos.z = uz.z; }
        else { n.pos.x += (uz.x - n.pos.x) * k; n.pos.z += (uz.z - n.pos.z) * k; }
        if (!n.t.korkuluk) n.yaw = turn(n.yaw, uz.yaw, dt * 10); n.moving = !!uz.m; n.uzKos = !!uz.r;   // korkuluklar hep Moradon kalesine bakar
        if (uz.a && !(n.atkUntil > now) && n.model?.playOnce(mobSaldiriKlibi(n), { speed: 0.8 })) n.atkUntil = now + 1125;
      } else {
        n.uzKos = false;
        // saldırgan moblar: oyuncu görüş menzilindeyse ve doğma alanına yakınsa saldırır (GM'ler hariç, kulelerdeki gibi)
        // KO: saldırgan mob oyuncuyu 5 m içinde fark eder; oyuncu 3 sn boyunca bu alanda kalırsa peşine düşüp saldırır,
        // 3 sn dolmadan alandan çıkarsa hiç saldırmaz (sayaç sıfırlanır)
        if (!n.aggro && !n.returning && n.t.aggressive && !S.dead && !state.baslamadi && !(state.ghost && state.gmOlumsuz) && !state.gorunmez?.aktif && !state.gorunmez?.korumada?.() && dp < MOB_TETIK) {   // (7.11) giriş / doğuş korumasında moblar oyuncuyu görmez
          n.tetik ||= now;
          if (now - n.tetik >= MOB_TETIK_SURE) { n.aggro = true; n.aggroAt = now; n.tetik = 0; }
        } else if (!n.aggro) n.tetik = 0;
        if (n.aggro && !n.claim) { n.claim = Date.now(); mobYayinZorla = true; }   // bu mobu artık ben yönetiyorum
        // KO kuralı: hasar almadıkça doğma çapını geçmez; hasar alınca oyuncuyu doğma alanından en fazla 50 m uzağa kadar takip eder, sonra alanına döner
        const fromHome = Math.hypot(n.pos.x - n.home.x, n.pos.z - n.home.z);
        if (n.t.pasif) { n.aggro = false; n.returning = false; }   // korkuluk vb.: kovalamaz, alanına koşmaz
        // pete saldıran mob: hedef pet (pet yoksa / öldüyse oyuncuya döner)
        const pk = n.petHedef ? state.pet?.konum?.() : null; if (n.petHedef && !pk) n.petHedef = false;
        const hx = pk ? pk.x : px, hz = pk ? pk.z : pz, dh = pk ? Math.hypot(hx - n.pos.x, hz - n.pos.z) : dp;
        if (n.aggro && ((S.dead && !pk) || ((state.gorunmez?.aktif || state.gorunmez?.korumada?.()) && !n.petHedef) || fromHome > n.home.r + 50 || now - (n.aggroAt || 0) > 30000))   // KO: görünmez (Stealth/Hide) oyuncuyu moblar görmez → bırakıp alanına döner
          { n.aggro = false; n.returning = true; n.goal = null; n.petHedef = false; }
        engaged = n.aggro && !n.returning && (!S.dead || !!pk) && !n.t.pasif;
        n._hx = hx; n._hz = hz; n._dh = dh;
        let tx, tz, speed = n.t.walk;
        const tSn = Date.now() / 1000;
        const sersem = n.sersemBit > now, yavasK = n.yavasBit > now ? n.yavasK : 1;   // KO büyücü: şimşek sersemletir, buz yavaşlatır
        if (sersem) { /* yerinde kalır */ }
        else if (engaged) { if (dh > n.t.attack_range * 0.8) { tx = hx; tz = hz; speed = n.t.run * yavasK; } }
        else if (n.returning) {   // ortak dolaşma yolundaki yerine koşar
          const g = gezPos(n, tSn); tx = g.x; tz = g.z; speed = n.t.run;
          if (Math.hypot(tx - n.pos.x, tz - n.pos.z) < 0.6) {
            n.returning = false; n.claim = 0; mobBitti.add(n.id);
            // KO: kovalayıp doğma alanına geri dönen mobun canı tamamen dolar (sunucu mob_eve_dondu; son 4 sn vurulduysa dolmaz)
            if (!isDead(n) && Number(n.hp) < Number(n.t.max_hp)) sb.rpc('mob_eve_dondu', { p_mob: n.id }).then(({ data }) => { if (data?.ok && !isDead(n)) { n.hp = Number(data.hp); if (target === n) refreshTarget(); } }, () => {});
          }
        }
        else if (n.t.sabit) { /* sabit korkuluk */ }
        else if (n.t.korkuluk) {   // hareketli korkuluk: doğma noktasının iki yanı arasında gidip gelir (ortak saat)
          const R = Math.max(1, n.home.r), P = 4 * R / 1.6, u = ((tSn / P) + hash01(n.id, 5)) % 1, tri = u < 0.5 ? 4 * u - 1 : 3 - 4 * u;
          n.pos.z = n.home.z; n.pos.x = n.home.x + R * tri; n.moving = true;
        }
        else {   // KO gibi dolaşma: ortak yol (yürü → dur); yoldan ayrıldıysa (kovalama sonrası) koşarak yetişir
          const g = gezPos(n, tSn), d0 = Math.hypot(g.x - n.pos.x, g.z - n.pos.z);
          if (d0 > 0.6) { tx = g.x; tz = g.z; speed = Math.max(n.t.run, n.t.walk); }
          else { n.pos.x = g.x; n.pos.z = g.z; if (g.moving) n.yaw = turn(n.yaw, g.yaw, dt * 8); }
          n.gezYuruyor = d0 <= 0.6 && g.moving;
        }
        if (!n.t.korkuluk || n.t.sabit) n.moving = !!n.gezYuruyor;
        n.gezYuruyor = false;
        if (tx != null) {
          const dx = tx - n.pos.x, dz = tz - n.pos.z, d = Math.hypot(dx, dz);
          if (d > 0.05) { const sp = Math.min(d, speed * dt); n.pos.x += dx / d * sp; n.pos.z += dz / d * sp; if (!n.t.korkuluk) n.yaw = turn(n.yaw, Math.atan2(dx, dz), dt * 8); n.moving = sp > 0.3 * dt; }
        }
        if (engaged && !n.moving) n.yaw = turn(n.yaw, Math.atan2(n._hx - n.pos.x, n._hz - n.pos.z), dt * 10);
        if (n.aggro || n.returning) mobSahip.push(n);
      }
      n.pos.y = state.heightAt(n.pos.x, n.pos.z);
      if (n.t.korkuluk && state.col) { const yc = state.col.heightNear(n.pos.x, n.pos.y + 2, n.pos.z); if (yc > n.pos.y && yc < n.pos.y + 1.5) n.pos.y = yc; }   // ray / kaide üstü
      if (n.t.kapi && !n.kapiHiza && state.col) kapiHizala(n);
      n.obj.position.copy(n.pos); n.obj.rotation.y = n.yaw;
      // korkulukların iskelet animasyonu yok (KO'da da): darbe alınca kısa sallanma
      if (n.t.korkuluk && n.model?.group) { const k = Math.max(0, (n.sars || 0) - now) / 350; n.model.group.rotation.x = k > 0 ? Math.sin(k * 18) * 0.12 * k : 0; }
      if (n.model) { if (!(n.atkUntil > now)) n.model.setClip(n.moving ? (engaged || n.returning || n.uzKos ? 'run' : 'walk') : 'breath'); n.model.update(dt); }
      // basit canlandırma
      // yalnız işaretli parçalar (yer tutucu modelin bacak/kanat/gövde halkaları) — her karede tüm model ağacı gezilmez
      if (!n._animP || n._animP.k !== n.obj.children.length) { const L = []; n.obj.traverse((m) => { if (m.userData.leg || m.userData.wing || m.userData.seg != null) L.push(m); }); n._animP = { k: n.obj.children.length, L }; }
      for (const m of n._animP.L) {
        if (m.userData.leg) m.rotation.x = Math.sin(t * 8 + n.phase) * 0.5 * m.userData.leg * (n.moving ? 1 : 0.15);
        if (m.userData.wing) m.rotation.z = Math.sin(t * 6 + n.phase) * 0.4 * m.userData.wing;
        if (m.userData.seg != null) m.position.y = 0.25 + Math.abs(Math.sin(t * 3 + m.userData.seg * 0.8 + n.phase)) * 0.12;
      }
      if (engaged && (n.petHedef ? n._dh : dp) < n.t.attack_range + 1) (n.petHedef ? petStrike(n) : npcStrike(n));
    }
    mobYayin();
    if (target) {
      if (isDead(target) || (!attacking && Math.hypot(target.pos.x - player.position.x, target.pos.z - player.position.z) > 45)) clearTarget();   // KO: hedeften çok uzaklaşınca (45 m) hedef bırakılır
      else {
        ring.visible = true; hedefTipUygula(); ring.position.set(target.pos.x, target.pos.y + 0.08, target.pos.z); { const rs = Math.max(0.8, Math.min(3, (target.t?.size || 100) / 100)); ring.scale.set(rs, rs, rs); }
        if (hedefIsaretMob !== target) { hedefIsaretMob = target; const m = target; hedefIsaretKaynak = () => (m && !m.dead ? m.pos : null); }
        { const k = hedefIsaretKaynak, sz = Math.max(0.8, Math.min(3, (target.t?.size || 100) / 100)); hedefIsaret.then((h) => h.goster(k, sz)); }
      }
    }
    if (!target && hedefIsaretMob) { hedefIsaretMob = null; hedefIsaretKaynak = null; hedefIsaret.then((h) => h.gizle()); }
    // KO işlem bilgisi: saldırı (hedef yaşarken) durunca camgöbeği "Stop Attack" (Genie'nin kendi iptalleri hariç)
    if (oncekiAtak && !attacking && target && !isDead(target) && !S.dead && !state.genie?.acik) hud.info?.('Stop Attack', 'atak-dur');
    oncekiAtak = attacking;
    // otomatik saldırı (KO CPlayerMySelf): menzile gir, silahın saldırı aralığıyla vur
    if (attacking && target && !S.dead) {
      const dx = target.pos.x - player.position.x, dz = target.pos.z - player.position.z, d = Math.hypot(dx, dz);
      const reach = takiliYay() ? yayMenzili() : target.t.attack_range + 1.2;
      if (d > reach) { if (!state.wSaldiri) state.target = new THREE.Vector3(target.pos.x - dx / d * (reach - 0.6), 0, target.pos.z - dz / d * (reach - 0.6)); }   // (4.11) W+R: yürüyüşü main.js yönetir
      else {
        state.target = null; if (!state.wSaldiri) state.yaw = Math.atan2(dx, dz);
        const yk = yaklasYetenek;
        if (yk && (yk.n !== target || performance.now() > yk.bit)) yaklasYetenek = null;
        else if (yk && !skillBusy) { yaklasYetenek = null; useSkill(yk.s).then((r) => { if (r?.ok) dispatchEvent(new CustomEvent('ko-yetenek-kullanildi', { detail: { id: yk.s.id, bekleme: r.bekleme } })); }); return; }
        if (!busy && !state.genie?.duzKapali?.() && performance.now() >= (state.genieRBekle || 0) && performance.now() - lastAttack > saldiriAraligi() && performance.now() >= (state.yetenekKlipBit || 0)) doAttack();   // yetenek animasyonu bitmeden R yok; Genie 'Düz vuruş uygula' kapalıysa yalnız yetenekler
      }
    }
  }

  // ---- yetenek kullanımı (skill_use). KO: hedefli yetenekler seçili canavara; güçlendirme/ışınlanma kendine.
  // Animasyon: yakın dövüş = silah saldırısı, ok = yay, diğerleri = büyü; efektler tablodaki kendi / uçan / hedef FX kimlikleri.
  // ok çıktı: yay gerilirken W / yön tuşuna basıldıysa (kombo) kol animasyonu hemen kesilir, sıradaki ok yeteneği beklemez
  const okBirakildi = () => {
    state.okKilit = performance.now();
    if (performance.now() - (state.okWIstek || 0) < 700) { state.okWIstek = 0; state.avatar?.stopOnce?.(); state.yetenekKlipBit = performance.now(); }
  };
  let okSiraNo = 0;
  let skillBusy = false, yaklasYetenek = null, minorYolda = 0, minorTahmin = 0, minorFxSon = 0;
  // (31.10) alan yeteneği düşman oyunculara: yarıçaptaki rakipler (arena bölmesi / savaş bölgesi) sunucu pvp_alan ile vurulur
  async function alanPvp(s, alanP) {
    const R = Math.max(1, Number(s.alan) || 5) + 1;
    const H = (state.arena?.zAdaylar?.() || []).map((o) => { const k = state.arena?.konum?.(o.id); return k ? { id: Number(o.id), x: +k.x.toFixed(2), z: +k.z.toFixed(2) } : null; })
      .filter((o) => o && Math.hypot(o.x - alanP.x, o.z - alanP.z) <= R);
    if (!H.length) return;
    let res; try { res = await sb.rpc('pvp_alan', { p_char: me.id, p_skill: s.id, p_x: player.position.x, p_z: player.position.z, p_mx: alanP.x, p_mz: alanP.z, p_hedefler: H }); } catch { return; }
    for (const d of res?.data?.sonuc || []) {
      const pid = String(d.hedef), bas = (state.arena?.konum?.(pid) || new THREE.Vector3(alanP.x, player.position.y, alanP.z)).clone().add(new THREE.Vector3(0, 2.1, 0));
      floatText(bas, d.miss ? 'Iska' : String(d.damage), d.miss ? 'iska' : 'o', true);
      hud.info?.(d.miss ? `${S.name || me.name} Missed.` : `${d.ad} received ${d.damage} damage`, d.miss ? 'iska' : 'o');
      state.net?.pvp?.({ hedef: pid, damage: d.damage, miss: !!d.miss, hp: d.hedef_hp, max_hp: d.hedef_max_hp, dead: !!d.dead, ad: me.name, an: me.nation, npk: d.np?.kayip || 0, dk: null, sure: 0, skill: s.id, sad: s.ad });
      if (d.dead && ['freezone_a', 'freezone_b', 'freezone_c'].includes(me.zone)) { const v = state.arena?.oyuncu?.(pid); state.oldurmeSatiri?.(me.name, me.nation, v?.meta?.name || 'Oyuncu', v?.meta?.nation, v?.obj?.position); }
      else if (d.dead) { const v = state.arena?.oyuncu?.(pid); if (v?.obj) state.arenaOldurme?.(me.name, v?.meta?.name || 'Player', v.obj.position, state.player?.position || v.obj.position); }   // (3.11) arena ölüm duyurusu
      if (d.np?.kazanc) { hud.info?.(`Earned ${d.np.kazanc} national points. `, 'np-kazanc'); state.inv?.stats?.(); }
      state.arena?.canGuncelle?.(d.hedef, d.hedef_hp, d.hedef_max_hp);
      if (d.gorev?.length) state.gorev?.guncelle?.(d.gorev);
      if (d.dead) hud.notice?.(`${d.ad} has been defeated!`, 'seviye');
    }
  }
  // arena: oyuncuya yetenek (animasyon + kendi/hedef efekti, hasar hedefin başında, karşı tarafa yayın)
  async function pvpYetenek(s, pid) {
    setTimeout(() => dispatchEvent(new CustomEvent('ko-hedef-etki-yenile', { detail: { id: String(pid) } })), 400);   // rakibe uygulanan zayıflatma hedef simgelerine anında düşer
    const hp = state.arena?.konum?.(pid); if (!hp) return false;
    if (s.tip1 === 2 && !takiliYay()) { hud.notice('You must equip a bow to use this skill.', 'hata'); return false; }
    // menzil (sunucu pvp_skill ile aynı: yakın 6, ok 32, büyü 26 m) — uzaksa kol animasyonu / efekt hiç oynamaz
    { const menzil = blowArrow(s) ? 5.5 : s.tip1 === 1 ? 6 : s.tip1 === 2 ? 32 : 26;
      if (Math.hypot(hp.x - player.position.x, hp.z - player.position.z) > menzil) { hud.notice('Skill failed - Too far', 'hata'); return false; } }
    state.gorunmez?.korumaBitir?.();
    if (gorunmezBozar(s)) state.gorunmez?.boz?.('saldırdın');
    skillBusy = true; state.target = null;   // oyuncuya saldırı yeteneği: önceden tıklanan yere yürüme iptal
    if (s.tip1 === 2) state.okKilit = performance.now() + 450;   // yay gerilirken yürünmez; ok çıkınca kalkar
    state.yaw = Math.atan2(hp.x - player.position.x, hp.z - player.position.z); state.savasSon = performance.now();
    const clip = yetenekKlibi(s); const YH = (s.tip1 === 2 ? 1 : OMUZ_FX(s) && s.tip1 !== 1 && Number(s.id) % 1000 !== 820 ? 1.095 * 0.7 : Number(s.id) % 1000 === 820 ? 1.095 * 1.2 * 0.8 * 1.4 * 1.3 : 1.095) * (buyucuMu() ? 1.2 : 1);   // büyücü %20 hızlı
    let vuruldu = !clip, bekleyen = null;
    if (clip) state.avatar?.playOnce(state.avatar?.has?.(clip) ? clip : 'attack', { speed: YH, onStrike: () => { vuruldu = true; const f = bekleyen; bekleyen = null; f?.(); } });
    if (clip) state.yetenekKlipBit = performance.now() + (state.avatar?.sure?.(state.avatar?.has?.(clip) ? clip : 'attack') || 0) * 1000 / YH;   // yeni ok / R için kol animasyonu beklenir (W ile kesilir)
    const [fxSelf, fxFly, fxHedef] = s.fx || []; const v0 = new THREE.Vector3();
    // (31.10) büyücü büyüsü oyuncuya da moba olduğu gibi: döküm efekti (elde / göğüste, döküm boyunca), döküm bitince uçan efekt rakibe gider, hasar varınca
    const buyucuYet = [3, 9, 10].includes(Math.floor(Number(s.id) / 1000) % 100);
    const buyucu = ([3, 9, 10].includes(Number(me.class) || 0) || buyucuYet) && s.tip1 === 3;
    const koOlcek = buyucuYet && Number(s.id) % 1000 >= 500 && Number(s.id) % 1000 < 600;
    const klipSure = clip ? (state.avatar?.sure?.(state.avatar?.has?.(clip) ? clip : 'attack') || 0) * 1000 / YH : 0;
    const dokumMs = buyucu ? (klipSure > 0 ? Math.max(100, klipSure) : Number(s.dokum) > 0 ? Number(s.dokum) * 100 : 0) : 0;   // (3.11) büyü kol animasyonu tamamen bitince çıkar
    const ekl = buyucuYet && Number(s.sp) >= 0 && Number(s.sp) < 200 ? Number(s.sp) : -1;
    const pvYayin = [];
    const pvFx = !fxSelf ? null : buyucu
      ? benFx(fxSelf, { ...(koOlcek ? {} : { boyut: 0.8, enFazla: 3 }), eklem: ekl, ...(ekl < 0 ? { dy: +(basYuk() * 0.72).toFixed(2) } : {}), dir: ileri(), zorla: true, loop: true, omur: Math.round(dokumMs + 150), yayinKuyruk: pvYayin })
      : rogueKo(s) ? (koParcaFx(fxSelf, s.sp, { dir: ileri(), yayinKuyruk: pvYayin })[0] || null)   // (7.11) suikastçı / usta KO birebir (oyuncuya da)
      : benFx(fxSelf, { boyut: 0.8, enFazla: 3, ...omuzSecenek(s), yayinKuyruk: pvYayin });
    const mpOnce = S.mp, mpDus = Number(s.mp) > 0 && S.mp >= Number(s.mp);
    // (8.11) mana ön düşülmez: başarısız yetenekte çubuk inip geri çıkmasın; sunucu onaylayınca kesin değer yazılır
    // (6.11) başarısız (uzak / ölü / iptal / sunucu reddi) yetenekte mana harcanmaz: ön düşülen bedel her durumda geri eklenir (arada MP yenilenmesi olsa da)
    const mpGeri = () => {};   // (8.11) ön düşüm yok → geri verilecek mana yok
    let ucus = null;
    if (buyucu) {
      const dokumBit = performance.now() + dokumMs; state.okKilit = Math.max(state.okKilit || 0, dokumBit);
      let iptal = false;
      const tik = (ev) => { if (ev.button === 0) iptal = true; };
      const tus = (ev) => { if (!ev.repeat && /^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(ev.code) && !/^(INPUT|TEXTAREA)$/.test(ev.target?.tagName || '')) iptal = true; };
      canvas.addEventListener('pointerdown', tik, true); addEventListener('keydown', tus, true);
      await new Promise((r) => { const bak = () => { if (iptal || S.dead || performance.now() >= dokumBit) return r(); setTimeout(bak, 15); }; bak(); });
      canvas.removeEventListener('pointerdown', tik, true); removeEventListener('keydown', tus, true);
      pvFx?.dispose?.();
      if (iptal || S.dead) { skillBusy = false; mpGeri(); state.okKilit = 0; if (clip) { state.avatar?.stopOnce?.(); state.yetenekKlipBit = performance.now(); } if (!S.dead) hud.info?.('Casting failed', 'ben'); return false; }
      if (fxFly) { const hv = new THREE.Vector3(); ucus = ucur(fxFly, () => { const k = state.arena?.konum?.(pid) || hp; return hv.set(k.x, k.y + 1.1, k.z); }, null, koOlcek); }
    }
    // (7.11) Blood Drain / Vampiric Touch: kol animasyonu bitmeden rakibe uygulanmaz (sunucu isteği ve emme efekti animasyon sonunda)
    if (!buyucu && [610, 650].includes(Number(s.id) % 1000) && OMUZ_FX(s) && klipSure > 0) {
      const bit = performance.now() + klipSure; state.okKilit = Math.max(state.okKilit || 0, bit);
      await new Promise((r) => { const bak = () => { if (S.dead || performance.now() >= bit) return r(); setTimeout(bak, 20); }; bak(); });
      if (S.dead) { skillBusy = false; mpGeri(); return false; }
    }
    let res;
    try { res = await sb.rpc('pvp_skill', { p_char: me.id, p_skill: s.id, p_hedef: Number(pid), p_x: player.position.x, p_z: player.position.z, p_hx: hp.x, p_hz: hp.z }); }
    finally { skillBusy = false; }
    const animDur = () => { if (s.tip1 === 2) state.okKilit = 0; pvFx?.dispose?.(); if (clip) { state.avatar?.stopOnce?.(); state.yetenekKlipBit = performance.now(); } };   // sunucu reddetti (uzak, bekleme…): kol animasyonu kesilir
    if (res.error) { ucus?.iptal(); mpGeri(); animDur(); hud.notice(res.error.message, 'hata'); return false; }
    const d = res.data;
    if (!d?.ok) { ucus?.iptal(); mpGeri(); animDur(); if (d?.hazir == null) hud.notice(d?.reason === 'ölü' ? 'The target is already dead.' : d?.reason || 'Casting failed', 'hata'); if (d?.ok_yok) state.inv?.reload?.(); return d || false; }
    for (const pl of pvYayin) state.net?.fx?.(pl);
    if (d.ok_kalan != null) okYenile(d.ok_kalan);
    if (s.bicak) state.inv?.reload?.();   // Throwing Knife: çantadan 1 Throwing-knife harcandı
    if (d.genel) state.genelBekleme = { bit: performance.now() + d.genel * 1000, top: d.genel * 1000 };
    Object.assign(S, { hp: d.hp, max_hp: d.max_hp, mp: d.mp, max_mp: d.max_mp }); showStats();
    const vur = () => {
      const bas = (state.arena?.konum?.(pid) || hp).clone().add(new THREE.Vector3(0, 2.1, 0));
      const zayif = s.tip1 === 4;   // Illusion: hasar yok, etki rakibin üstünde
      if (!zayif) floatText(bas, d.miss ? 'Iska' : String(d.damage), d.miss ? 'iska' : 'o', true);
      if (!zayif && !d.miss && s.tip1 === 1 && !buyucuMu()) darbeOyuncu(state.arena?.oyuncu?.(pid)?.obj, pid, true);   // (4.11) R combo isabeti: kırmızı darbe
      if (fxHedef && !(fxHedef === 10002 && s.tip1 === 1 && !buyucuMu())) { const tv = new THREE.Vector3(); const kf = KAFA_FX.has(fxHedef), ek = kf ? 3.8 : cureKo(s) ? 1.9 : OMUZ_FX(s) ? (rogueKo(s) ? 1.0 : 0.2) : s.tip1 === 2 ? 1.0 : s.bicak ? 1.2 : 0; state.efekt?.(fxHedef, hp, { follow: () => { tv.copy(state.arena?.konum?.(pid) || hp); tv.y += ek; return tv; }, ...(OMUZ_FX(s) ? emmeSec(hp, kf, s) : cureKo(s) || TAM_FX.has(fxHedef) ? { boyut: 1 } : { boyut: 0.8, enFazla: 3 }) }); state.net?.fx?.({ k: 'o', id: fxHedef, o: String(pid), ...(cureKo(s) || TAM_FX.has(fxHedef) ? { b: 1 } : { b: 0.8, e: 3 }), ...(ek ? { dy: ek } : {}) }); }
      if (d.emme) { floatText(player.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '+' + d.emme, 'iyi'); hud.info?.(`${d.emme} HP Recovered`, 'iyi'); }
      hud.info?.(zayif ? `${s.ad} : ${d.ad}` : d.miss ? `${S.name || me.name} Missed.` : `${d.ad} received ${d.damage} damage`, d.miss ? 'iska' : 'o');
      if (d.debuff === 'd32') { const ms = (Number(d.sure) || 3) * 1000; state.silahGizle?.(state.arena?.oyuncu?.(String(d.hedef))?.obj?.userData?.chr, ms); state.net?.fx?.({ k: 'disarm', o: String(d.hedef), ms }); }   // (8.11) Disarm: rakibin sağ elindeki silah süre boyunca herkeste görünmez (envanter değişmez)
      state.net?.pvp?.({ hedef: String(d.hedef), damage: d.damage, miss: !!d.miss, hp: d.hedef_hp, max_hp: d.hedef_max_hp, dead: !!d.dead, ad: me.name, an: me.nation, npk: d.np?.kayip || 0, dk: d.debuff || null, sure: d.sure || 0, skill: s.id, sad: s.ad });
      if (d.dead && ['freezone_a', 'freezone_b', 'freezone_c'].includes(me.zone)) { const v = state.arena?.oyuncu?.(pid); state.oldurmeSatiri?.(me.name, me.nation, v?.meta?.name || 'Oyuncu', v?.meta?.nation, v?.obj?.position); }
      else if (d.dead) { const v = state.arena?.oyuncu?.(pid); if (v?.obj) state.arenaOldurme?.(me.name, v?.meta?.name || 'Player', v.obj.position, state.player?.position || v.obj.position); }   // (3.11) arena ölüm duyurusu
      if (d.np?.kazanc) { hud.info?.(`Earned ${d.np.kazanc} national points. `, 'np-kazanc'); state.inv?.stats?.(); }
      state.arena?.canGuncelle?.(d.hedef, d.hedef_hp, d.hedef_max_hp);
      if (d.gorev?.length) state.gorev?.guncelle?.(d.gorev);
      if (d.dead) { hud.notice?.(`${d.ad} has been defeated!`, 'seviye'); state.arena?.birak?.(); }
    };
    // KO: ok, kol kalkıp yay bırakıldığı karede (strike) çıkar — sunucu yanıtı önce gelse bile önce kol kalkar, sonra ok
    const okAtis = () => { okBirakildi(); okAt(state.arena?.konum?.(pid) || hp, Math.max(180, Math.min(700, Math.hypot(hp.x - player.position.x, hp.z - player.position.z) * 22)), vur, { fx: fxFly }); };
    if (ucus) { ucus.var.then(vur); return d; }   // büyücü: uçan efekt rakibe varınca hasar
    // (8.11) Throwing Knife (oyuncuya): hançer atış karesinde göğüs hizasından (1,2 m) rakibin göğsüne uçar, varınca isabet efekti göğüste
    if (s.bicak && fxFly) {
      const firlat = () => { const t0 = performance.now(), p0 = player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), vv = new THREE.Vector3(), hv = new THREE.Vector3();
        const hedefP = () => { const k = state.arena?.konum?.(pid) || hp; return hv.set(k.x, k.y + 1.2, k.z); };
        const b = state.efekt?.(fxFly, p0, { boyut: 0.8, enFazla: 2, follow: () => vv.copy(p0).lerp(hedefP(), Math.min(1, (performance.now() - t0) / 350)) });
        const h0 = hedefP(); state.net?.fx?.({ k: 'u', id: fxFly, x: +h0.x.toFixed(2), y: +h0.y.toFixed(2), z: +h0.z.toFixed(2), m: null, ms: 350 });
        setTimeout(() => { b?.stop?.(); vur(); }, 350); };
      if (vuruldu) firlat(); else { bekleyen = firlat; setTimeout(() => { if (bekleyen === firlat) { bekleyen = null; firlat(); } }, 700); }
      return d;
    }
    if (s.tip1 === 2) { if (vuruldu) okAtis(); else { bekleyen = okAtis; setTimeout(() => { if (bekleyen === okAtis) { bekleyen = null; okAtis(); } }, 450); } }
    else if (vuruldu) vur(); else { bekleyen = vur; setTimeout(() => { if (bekleyen === vur) { bekleyen = null; vur(); } }, 700); }
    return d;
  }
  // KO: okçu (rogue) elinde yay varken yalnız okçu yetenekleri — suikastçı sekmesi (6) ve yakın dövüş yetenekleri kapalı
  // Blow Arrow (okçu sekmesi x575): yalnız elde yay / arbaletle; en fazla 5 m yakın vuruş, Stroke kol animasyonu, ok harcamaz
  const blowArrowMu = (s) => !!s && Number(s.id) % 1000 === 575 && [7, 8].includes(Math.floor(Number(s.id) / 1000) % 100);
  const blowArrow = (s) => blowArrowMu(s) && !!takiliYay();
  const yayYasak = (s) => [2, 7, 8].includes(Number(me.class)) && s.tip1 !== 9 && takiliYay() && (s.sekme === 6 || s.tip1 === 1) && !blowArrow(s);   // Stealth/Hide (tip 9) silaha bakmaz
  const gorunmezBozar = (s) => [1, 2, 3, 7].includes(Number(s.tip1));
  let gizDokum = null;   // Stealth/Hide dökümü: { bit, iptal }
  let gorselBit = 0;   // son yeteneğin görsel vuruşunun (ok, animasyon) biteceği an
  // ---- KO MORAL_AREA_ENEMY (hedef 10) büyücü alan yetenekleri: tuşa basınca zeminde yetenek yarıçapında yardımcı çember açılır,
  // imleçle gezer (araziye oturur); sol tık o noktaya yeteneği bırakır, sağ tık / Esc vazgeçer. Menzil dışında çember kırmızı olur.
  // uçan büyü efekti: göğüs hizasından hedefe (mob gövdesi / alan noktası), mesafeye göre 250–800 ms; var → Promise
  const _ucH = new THREE.Vector3();
  function ucur(id, hedef, mob = null, ko = false) {   // ko: KO ölçeği (boyut 1, kırpma yok)
    const t0 = performance.now(), p0 = player.position.clone().add(new THREE.Vector3(Math.sin(state.yaw) * 0.4, basYuk() * 0.72, Math.cos(state.yaw) * 0.4)), vv = new THREE.Vector3(), h0 = hedef().clone();
    const ms = Math.round(Math.max(250, Math.min(800, p0.distanceTo(h0) * 28)));
    // uçan büyü (Fire spear, Fire ball, Ice arrow…): oyuncudan hedefe düz çizgide gider; efektin ileri ekseni (Z) her karede gidiş yönüne bakar
    //   (mızrak / ok yan dönmez, iz arkasında düz kalır)
    const yq = new THREE.Quaternion(), yd = new THREE.Vector3(), Zx = new THREE.Vector3(0, 0, 1);
    const yon = () => { yd.copy(hedef()).sub(p0); if (yd.lengthSq() < 1e-6) return null; return yq.setFromUnitVectors(Zx, yd.normalize()); };
    const b = state.efekt?.(id, p0, { ...(ko ? {} : { boyut: 0.8, enFazla: 2 }), dir: h0.clone().sub(p0), yon, follow: () => { const k = Math.min(1, (performance.now() - t0) / ms); return vv.copy(p0).lerp(hedef(), k); } });
    state.net?.fx?.({ k: 'u', id, x: +h0.x.toFixed(2), y: +h0.y.toFixed(2), z: +h0.z.toFixed(2), m: mob?.id ?? null, ms, ...(ko ? { ko: 1 } : {}) });
    let bitti = false; const var_ = new Promise((r) => setTimeout(() => { if (!bitti) b?.stop?.(); r(); }, ms));
    return { var: var_, iptal: () => { bitti = true; b?.dispose?.(); } };
  }
  let alanAktif = null; const alanDoku = {};
  const _alanRay = new THREE.Raycaster();
  function alanSec(s) {
    alanAktif?.iptal();
    return new Promise((coz) => {
      const R = Math.max(1, Number(s.alan) || 5), menzil = Math.max(5, Number(s.menzil) || 20) + 1;
      // KO bölge hedefi (deadsoft fx.tbl 10035–10040 Region_Target_<El|Ka>_<Rogue|Wizard|Priest>.fxb): yere yatık tek doku (BottomBoard),
      // ek karışım (SRCALPHA / ONE), −1,2 rad/sn döner; çapı yeteneğin alanı. Arazinin üstüne serilir (eğimde de görünür).
      const sinif = Number(me.class) || 0, tur = [2, 7, 8].includes(sinif) ? 'rogue' : [4, 11, 12].includes(sinif) ? 'priest' : 'wizard';
      const doku = (alanDoku[`${me.nation === 2 ? 'el' : 'ka'}_${tur}`] ||= new THREE.TextureLoader().load(`./assets/fxalan/region_${me.nation === 2 ? 'el' : 'ka'}_${tur}.webp`, (t) => { t.colorSpace = THREE.SRGBColorSpace; }));
      // KO CN3FXPartBottomBoard birebir (Region_Target_*.fxb: sizeX/Z 3, rotVel −1.2 rad/sn, gap 0.02, SRCALPHA/ONE, dependScale yok):
      // 3 × 3 m sabit boyut (yeteneğin alanından bağımsız), 3×3 köşeli tabla (9 köşe) — her köşe arazi yüksekliği + 0,02; tabla kendi ekseninde döner
      const g = new THREE.Group(); g.name = 'alan-cember';
      const BOY = Math.max(3, R * 2) * 0.15, GAP = 0.02,   // beyaz bölge dokusu hedef alanının (oklar halkası) merkezinde — (31.10) çapı bir kez daha %50 küçük (0,3 → 0,15)
        M = Math.max(2, Math.ceil(BOY / 1.5)), geo = new THREE.PlaneGeometry(1, 1, M, M);   // KO: daire yeteneğin alanı kadar (çap = 2 × alan); büyük dairede ara köşeler araziye oturur
      const mat = new THREE.MeshBasicMaterial({ map: doku, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const tabla = new THREE.Mesh(geo, mat); tabla.frustumCulled = false; tabla.renderOrder = 6; g.add(tabla);
      world.add(g);
      // KO fx.tbl 30002 zone_pointer.fxb (target_pointer 30001'in bölge karşılığı): dairenin ortasında dönen ok (billboard\40310zone_pointer\z_po_new, 4×4 kare, 18 fps, 1,4 m, yalnız Y'de döner)
      // KO alan hedefi okları (fx.tbl 30002 zone_pointer.fxb: kırmızı dönen ok, 4×4 kare): dairenin çevresine eşit aralıkla 6 (küçük alan) ya da 8 ok, hep birlikte aşağı-yukarı süzülür
      const OK_N = R < 4 ? 6 : 8, okFx = [], okV = []; let okT = 0;
      const okYer = (i) => { const a = (i / OK_N) * Math.PI * 2, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R; return okV[i].set(x, H(x, z) + 0.75 + Math.sin(okT * 4) * 0.22, z); };
      fxEkle('./assets/fxalan').then(() => { if (alanAktif !== api || !state.fx) return; for (let i = 0; i < OK_N; i++) { okV[i] = new THREE.Vector3(); okFx.push(state.fx.play('zone_pointer.fxb', { loop: true, sessiz: true, pos: okYer(i).clone(), follow: () => okYer(i) })); } }, () => {});
      const H = (x, z) => (state.heightAt?.(x, z) ?? player.position.y) + GAP;
      let cx = player.position.x + Math.sin(state.yaw) * Math.min(8, menzil - 1), cz = player.position.z + Math.cos(state.yaw) * Math.min(8, menzil - 1), aci = 0, ici = false;
      const P = geo.attributes.position.array, U = geo.attributes.uv.array, n1 = M + 1;
      const ciz = () => {
        ici = Math.hypot(cx - player.position.x, cz - player.position.z) <= menzil;
        const ca = Math.cos(aci), sa = Math.sin(aci);
        for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
          const k = j * n1 + i, ux = (i / M - 0.5) * BOY, uz = (j / M - 0.5) * BOY;   // birim kare × 3, Y ekseninde döndürülür (mtxRot)
          const x = cx + ux * ca - uz * sa, z = cz + ux * sa + uz * ca;
          P[k * 3] = x; P[k * 3 + 1] = H(x, z); P[k * 3 + 2] = z;
          U[k * 2] = i / M; U[k * 2 + 1] = j / M;
        }
        geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true; geo.computeBoundingSphere();
      };
      if (mat.map) { mat.map.wrapS = mat.map.wrapT = THREE.ClampToEdgeWrapping; }
      const yer = (e) => {
        if (!state.terrain) return null;
        const r = canvas.getBoundingClientRect();
        _alanRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        const hit = _alanRay.intersectObject(state.terrain, true)[0]; if (!hit) return null;
        return world.worldToLocal(hit.point.clone());
      };
      let raf = 0, son = performance.now(), sagBas = null;
      const dongu = () => { const t = performance.now(); aci -= (t - son) / 1000 * 1.2; okT += (t - son) / 1000; son = t; ciz(); raf = requestAnimationFrame(dongu); };
      const kapat = (sonuc) => {
        if (alanAktif !== api) return; alanAktif = null; state.alanSecim = null;
        cancelAnimationFrame(raf); for (const f of okFx) { f?.stop?.(); f?.dispose?.(); } okFx.length = 0; g.removeFromParent(); geo.dispose(); mat.dispose();
        canvas.removeEventListener('pointermove', izle, true); canvas.removeEventListener('pointerdown', bas, true); canvas.removeEventListener('pointerup', birak, true);
        removeEventListener('keydown', tus, true); document.body.classList.remove('alan-secim');
        coz(sonuc);
      };
      const izle = (e) => { const n = pick(e); if (n?.pos) { cx = n.pos.x; cz = n.pos.z; return; } const p = yer(e); if (p) { cx = p.x; cz = p.z; } };   // KO: imleç canavarın üstündeyse daire onun ayağına (OPMgr Pick)
      const bas = (e) => {
        if (e.button === 0) {
          e.stopImmediatePropagation(); e.preventDefault(); izle(e);
          if (S.dead) return kapat(null);
          if (!ici) { hud.notice('The target area is out of range.', 'hata'); return; }
          kapat({ x: cx, z: cz });
        } else if (e.button === 2) sagBas = { x: e.clientX, y: e.clientY };
      };
      const birak = (e) => { if (e.button === 2 && sagBas && Math.hypot(e.clientX - sagBas.x, e.clientY - sagBas.y) <= 6) { e.stopImmediatePropagation(); kapat(null); } sagBas = null; };
      const tus = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); kapat(null); } };
      const api = { iptal: () => kapat(null) };
      alanAktif = api; state.alanSecim = api;
      canvas.addEventListener('pointermove', izle, true); canvas.addEventListener('pointerdown', bas, true); canvas.addEventListener('pointerup', birak, true);
      addEventListener('keydown', tus, true); document.body.classList.add('alan-secim');
      if (state.sonImlec) izle(state.sonImlec);
      dongu();
    });
  }
  // (4.11) KO View Option: kullanılan her yetenek (kısayol, sağ tık, Genie, yaklaşma…) karakterin üstünde süzülen simge için tek noktadan bildirilir
  async function useSkill(s) { if (state.gorunmez?.korumada?.()) { hud.notice?.('You cannot use skills while under login protection.', 'hata'); return false; }   // (4.11) KO giriş koruması: yetenek kullanılamaz (sunucu skill_use / pvp_skill da reddeder)
    const r = await useSkill0(s); if (r?.ok && s?.id) dispatchEvent(new CustomEvent('ko-yetenek-simge', { detail: { id: s.id } })); return r; }
  async function useSkill0(s) {
    const genieHiz = Number(state.genieYetHiz) || 1; state.genieYetHiz = 0;   // Genie saldırı / iyileşme yuvalarından: kol animasyonu ve döküm %15 hızlı
    // Rogue Throwing Knife (x656): yay/ok değil — hançer elde, çantada Throwing-knife (370007000) gerekir; bıçak uçan efektle (32040) gider
    if (s && s.id % 1000 === 656 && [7, 8].includes(Math.floor(s.id / 1000) % 100)) {
      const it = state.inv?.items, hancer = [6, 8].some((sl) => Number(it?.get?.(sl)?.it?.Kind) === 11);
      if (!hancer) { hud.notice('Throwing Knife can only be used with a dagger.', 'hata'); return false; }
      let adet = 0; for (const [sl, e] of it || []) if (sl >= 14 && Number(e?.row?.item_num) === 370007000) adet += Number(e.row.count) || 1;
      if (it && !adet) { hud.notice('Throwing Knife requires Throwing-knife in your inventory (sold by [Sundries]).', 'hata'); return false; }
      s = { ...s, tip1: 3, bicak: true };
    }
    // Magic Shield (x802, usta rogue): çantada Magic Shield Scroll (379064000) olmalı (harcanmaz; Clarence görevi)
    if (s && s.id % 1000 === 802 && [108, 208].includes(Math.floor(s.id / 1000))) {
      const it = state.inv?.items; let var_ = false; for (const [sl, e] of it || []) if (sl >= 14 && Number(e?.row?.item_num) === 379064000) var_ = true;
      if (it && !var_) { hud.notice('Magic Shield requires a Magic Shield Scroll in your inventory ([Secret Agent] Clarence quest).', 'hata'); return false; }
    }
    // Cure Curse (x736, rogue): çantada Blessing Potion (370005000) gerekir
    if (s && s.id % 1000 === 736 && [7, 8].includes(Math.floor(s.id / 1000) % 100)) {
      const it = state.inv?.items; let adet = 0; for (const [sl, e] of it || []) if (sl >= 14 && Number(e?.row?.item_num) === 370005000) adet += Number(e.row.count) || 1;
      if (it && !adet) { hud.notice('Cure Curse requires Blessing Potion in your inventory (sold by [Sundries]).', 'hata'); return false; }
    }
    // Strength of Wolf (x030, rogue): çantada Blood of wolf (370004000) gerekir; saldırı güçlendirmesi sürerken sunucu reddeder
    if (s && s.id % 1000 === 30 && [7, 8].includes(Math.floor(s.id / 1000) % 100)) {
      const it = state.inv?.items; let adet = 0; for (const [sl, e] of it || []) if (sl >= 14 && Number(e?.row?.item_num) === 370004000) adet += Number(e.row.count) || 1;
      if (it && !adet) { hud.notice('Strength of Wolf requires Blood of wolf in your inventory (sold by [Sundries]).', 'hata'); return false; }
    }
    // Eskrima (usta, x821): Spike gibi kol animasyonu (Skill_Magic_1 ka 129)
    if (s && s.id % 1000 === 821 && [108, 208].includes(Math.floor(s.id / 1000))) s = { ...s, ka: [129, 129], fx: [0, 0, 32043] };   // (7.11) karakterin üstünde Vampiric Touch benzeri döküm (2202) yok   // kol animasyonu Spike; döküm 2202, hedefte KO Eskrima maskesi 32043 (başın üstünde)
    // Disarm (usta, x820): Vampiric Touch'ın kol animasyonu (126) ve efektleri (2202 döküm, 801 emme)
    if (s && /^cure disease$/i.test(String(s.ad || ''))) s = { ...s, anim: 18, fx: [2701, 0, 32064] };   // (7.11) Cure Disease: Cure Curse ile aynı efekt ve animasyon
    // (7.11) KO Skill_Magic_Main birebir: Disarm kendi animasyonu 18 (Vampiric Touch'ın 126'sı değil), efektler 2202 (SelfPart 2) / 801
    // büyücü temel: Flash → Spark'ın döküm efekti (2301, göğüs), Shiver → Cold wave'inki (2201, göğüs); Stroke'ta döküm efekti (2601 iksir halkası) yok
    if (s && [3, 9, 10].includes(Math.floor(Number(s.id) / 1000) % 100) && [1, 2, 3].includes(Number(s.id) % 1000)) {
      const f = [...(s.fx || [0, 0, 0])]; f[0] = ({ 1: 0, 2: 2301, 3: 2201 })[Number(s.id) % 1000];
      if (Number(s.id) % 1000 === 2) f[2] = 201;   // Flash: mobtaki vuruş efekti Shiver'ınkiyle aynı (201)
      s = { ...s, fx: f, sp: 2 };
    }
    if (state.pazarAcik) { hud.notice('You cannot use skills while in merchant mode.', 'hata'); return false; }
    if (state.dinlen?.engelle()) return false;
    // Rogue Minor Healing (x705): KO'daki gibi seri ve gecikmesiz — kol animasyonu yok, başka yeteneğin yanıtını beklemez,
    // sunucu yanıtı beklenmeden efekt anında oynar ve sonraki basış kabul edilir (en çok 2 istek yolda); can sunucu yanıtıyla güncellenir
    if (s && !S.dead && s.id % 1000 === 705 && [7, 8].includes(Math.floor(s.id / 1000) % 100)) {
      if (minorYolda >= 4) return false;   // (9.11) seri basış: en çok 4 istek yolda
      if (Number(s.mp) > 0 && S.mp - minorBorc().mp < Number(s.mp)) { hud.notice('Skill Failed - Not enough MP', 'hata'); return false; }
      // (5.11) başka bir oyuncu seçiliyse Minor Healing ona basılır (PvP bölgesinde karşı ulus / rakip: sunucu reddeder)
      const msec = Number(state.seciliOyuncu?.id) || 0, mho = msec && msec !== Number(me.id) ? state.arena?.oyuncu?.(msec) : null;
      if (mho?.obj) {
        if (minorYolda > 0 || performance.now() - (state.minorHedefSon || 0) < 300) return false;   // (5.11) başkasına Minor: tek istek yolda, en az 0,3 sn aralık (sunucu kilit yığılması / bağlantı kopması olmasın)
        state.minorHedefSon = performance.now();
        minorYolda++;
        try {
          const hp0 = mho.obj.position;
          const { data: d, error } = await sb.rpc('skill_use', { p_char: me.id, p_skill: s.id, p_mob: msec, p_x: player.position.x, p_z: player.position.z, p_mx: hp0.x, p_mz: hp0.z });
          if (error || !d?.ok) { if (error) hud.notice(error.message, 'hata'); else if (d?.hazir == null) hud.notice(d?.reason || 'Casting failed', 'hata'); return d || false; }
          const [mfS, , mfH] = s.fx || [];
          // (5.11) kendine bastığındakiyle aynı: genel döküm efekti (2601) gösterilmez, yalnız iyileşme efekti (601)
          for (const f of [mfS, mfH]) if (f && !GENEL_DOKUM.has(f)) { const v = new THREE.Vector3(), o = mho.obj; state.efekt?.(f, o.position, { follow: () => v.copy(o.position), boyut: 0.8, enFazla: 3 }); state.net?.fx?.({ k: 'o', id: f, o: String(msec), b: 0.8, e: 3 }); }
          const r = (d.sonuc || []).find((x) => x.hedef_char != null);
          if (r?.heal) { floatText(mho.obj.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '+' + r.heal, 'iyi'); state.net?.dost?.({ id: String(msec), skill: s.id, ad: s.ad, heal: r.heal, hp: r.hedef_hp ?? null, max_hp: r.hedef_max_hp ?? null }); }
          if (d.mp != null) { S.mp = Number(d.mp); showStats(); }
          return d;
        } finally { minorYolda--; }
      }
      minorYolda++;
      const [mfS, , mfH] = s.fx || [];
      // seri basışta efekt yığılmasın: önceki Minor efekti hâlâ oynarken (0,45 sn) yenisi başlatılmaz
      if (performance.now() - (minorFxSon || 0) > 450) { minorFxSon = performance.now(); if (mfS) benFx(mfS, { boyut: 0.8, enFazla: 3 }); if (mfH) benFx(mfH, { boyut: 0.8, enFazla: 3 }); }
      // can ve mana çubukları anında: MP düşer, can son iyileştirme miktarı kadar artar (tahmin); sunucu yanıtı gelince
      // gerçek değer yazılır, hâlâ yolda olan diğer basışların tahmini korunur (çubuk geri sıçramaz)
      const mpBedel = Number(s.mp) || 0, tahmin = Math.max(0, Math.min(minorTahmin, S.max_hp - gorHp()));
      // (9.11) KO'daki gibi anında: basışta mana düşer, can tahminle artar (gösterimde); sunucu yanıtı gelince gerçek değer yazılır
      const bu = { mp: mpBedel, hp: tahmin }; minorBekleyen.add(bu); showStats();
      if (tahmin) floatText(player.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '+' + tahmin, 'iyi');
      try {
        const { data: d, error } = await sb.rpc('skill_use', { p_char: me.id, p_skill: s.id, p_mob: null, p_x: player.position.x, p_z: player.position.z, p_mx: null, p_mz: null });
        minorBekleyen.delete(bu);
        if (error || !d?.ok) {
          showStats();
          if (error) hud.notice(error.message, 'hata'); else if (d?.hazir == null) hud.notice(d?.reason || 'Casting failed', 'hata'); return d || false;
        }
        const heal = (d.sonuc || []).reduce((t, r) => t + (Number(r.heal) || 0), 0);
        if (heal > 0) minorTahmin = heal;
        hud.info?.(`${heal} HP Recovered`, 'minor-heal');   // işlem bilgileri: mavi, kalın değil
        if (d.max_hp != null) S.max_hp = d.max_hp;
        if (d.hp != null) S.hp = Math.min(S.max_hp, Number(d.hp));
        if (d.mp != null) S.mp = Math.max(0, Number(d.mp));
        showStats();
        if (heal && !tahmin) floatText(player.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '+' + heal, 'iyi');
        return { ok: true, bekleme: d.bekleme ?? 0.068 };
      } finally { minorYolda--; minorBekleyen.delete(bu); }
    }
    // ok yeteneği bir önceki atış bitmeden basıldıysa kısa süre (0,7 sn) sırada bekler — 3'lü → W → 5'li kombosu kaçmaz
    if (s?.tip1 === 2 && (skillBusy || performance.now() < (state.yetenekKlipBit || 0))) {
      const no = ++okSiraNo, lim = performance.now() + 700;
      while ((skillBusy || performance.now() < (state.yetenekKlipBit || 0)) && performance.now() < lim) { await new Promise((r) => setTimeout(r, 25)); if (no !== okSiraNo) return false; }
    }
    // büyü (tip 3) önceki büyünün sunucu yanıtı beklenirken basıldıysa (ör. mob öldü → Z ile yeni hedef → hemen büyü) kısa süre (0,9 sn) sırada bekler, düşmez
    if (s?.tip1 === 3 && skillBusy) {
      const no = ++okSiraNo, lim = performance.now() + 900;
      while (skillBusy && performance.now() < lim) { await new Promise((r) => setTimeout(r, 20)); if (no !== okSiraNo) return false; }
    }
    if (S.dead || skillBusy || !s) return false;
    // büyücü: önceki yeteneğin kol animasyonu bitmeden yeni yetenek kullanılamaz — (3.11) basış düşmez, animasyon (+ geçiş payı) bitince
    // sıradaki tek basış kullanılır (en çok 1,6 sn bekler; arada yeni basış gelirse yalnız sonuncusu)
    if (buyucuMu() && performance.now() < (state.yetenekKlipBit || 0) + 120) {
      const no = ++okSiraNo, lim = performance.now() + 1600;
      while (performance.now() < (state.yetenekKlipBit || 0) + 120 && performance.now() < lim) { await new Promise((r) => setTimeout(r, 25)); if (no !== okSiraNo) return false; }
      if (S.dead || skillBusy || performance.now() < (state.yetenekKlipBit || 0) + 120) return false;
    }
    // KO: ok yeteneği — önceki atışın kol animasyonu süresi dolmadan yeni ok atılmaz (karakter arada yürüse de)
    if (s.tip1 === 2 && performance.now() < (state.yetenekKlipBit || 0)) return false;
    // KO: başka sınıfın yeteneği (kimliğin ilk 3 hanesi = ulus·100 + sınıf) kullanılamaz — animasyon / efekt hiç oynamaz
    { const k = Math.floor(Number(s.id) / 1000), c = k % 100, grp = (x) => ([1, 5, 6].includes(x) ? 1 : [2, 7, 8].includes(x) ? 2 : [3, 9, 10].includes(x) ? 3 : [4, 11, 12].includes(x) ? 4 : [13, 14, 15].includes(x) ? 13 : 0);
      if (k >= 100 && k < 300 && grp(c) && grp(c) !== grp(Number(me.class) || 0)) { hud.notice('This skill does not belong to your class.', 'hata'); return false; } }
    // KO: Stealth / Hide durarak basılır — hareket hâlinde basılırsa karakter durur ve yetenek döküm animasyonuyla çıkar;
    // döküm sürerken tekrar basılırsa işlem iptal olur (görünmezlik başlamaz)
    const gizlenme = s.tip1 === 9 && [645, 700].includes(Number(s.id) % 1000);
    if (gizlenme && gizDokum && performance.now() < gizDokum.bit) {
      gizDokum.iptal = true; gizDokum = null; state.okKilit = 0; state.avatar?.stopOnce?.(); state.yetenekKlipBit = performance.now();
      hud.info?.(`Casting failed`, 'ben'); return false;
    }
    if (gizlenme) { state.target = null; state.okKilit = performance.now() + 400; }   // dur (yürüme hedefi silinir, tuşlar kilitlenir)
    if (futbolYet(s) && !futbolAcik()) { hud.notice('Dribble and Shoot can only be used during the soccer event.', 'hata'); return false; }
    // Rogue: Cat's Eyes (x715) ile Lupine Eyes (x735) aynı anda kullanılamaz
    { const gz = (x) => [715, 735].includes(Number(x) % 1000), ak = state.gorunmez?.gozYetenegi?.() || 0;
      if (gz(s.id) && ak && gz(ak) && Number(ak) !== Number(s.id)) { hud.notice("Cat's Eyes and Lupine Eyes cannot be used at the same time.", 'hata'); return false; } }
    // hızlanma yetenekleri (Sprint, Swift, Light Feet, Whipping): biri etkinken diğeri kullanılamaz
    { const HIZ = /^(sprint|swift|light feet|whipping)$/i, Y = yetenekVerisi()?.yetenekler, bh = state.buffHiz;
      const hizMi = (x) => HIZ.test(String(Y?.[x]?.ad || ''));
      if (HIZ.test(String(s.ad)) && bh && performance.now() < bh.until && bh.id && hizMi(bh.id) && Number(bh.id) !== Number(s.id)) { hud.notice(`${s.ad} cannot be used while ${Y?.[bh.id]?.ad || 'another speed skill'} is active.`, 'hata'); return false; } }
    // (4.11) KO: Rise ile Blaze Killer, Outrage ile Hate birlikte kullanılamaz; etkisi sürerken üstüne yeniden basılamaz
    if (savasciYet(s)) { const G = [[710, 731], [720, 755]], k = Number(s.id) % 1000, g = G.find((x) => x.includes(k));
      if (g) { const B = (state.savasciGrup ||= new Map()), Y = yetenekVerisi()?.yetenekler;
        for (const x of g) { const b = B.get(x); if (b && performance.now() < b.bit) { hud.notice(x === k ? `${s.ad} is already in effect.` : `${s.ad} cannot be used while ${Y?.[b.id]?.ad || 'another skill'} is active.`, 'hata'); return false; } } } }
    // (5.11) KO: Cry Echo (x782) yalnız Battle Cry (x781) etkinken — istemcide de engellenir (sunucu da reddeder)
    if (Number(s.id) % 1000 === 782 && savasciYet(s) && !(state.etkiler?.liste || []).some((e) => Number(e.id) % 1000 === 781 && e.bitis > Date.now())) { hud.notice('Cry Echo can only be used while Battle Cry is active.', 'hata'); return false; }
    if (blowArrowMu(s) && !takiliYay()) { hud.notice('You must equip a bow or crossbow to use Blow Arrow.', 'hata'); return false; }
    if (blowArrowMu(s)) s = { ...s, ka: [131, 113], anim: 26 };   // KO: Stroke kol animasyonu
    if (yayYasak(s)) { hud.notice('You cannot use assassin skills while holding a bow; only archery skills are available.', 'hata'); return false; }
    if (s.tip1 === 2) {
      if (!takiliYay()) { hud.notice('You must equip a bow to use this skill.', 'hata'); return false; }
      if (okSayisi() < 1) { okYokUyari(); return false; }
    }
    // KO büyücü: büyü (tip 3) hareket hâlinde yapılamaz; döküm süresince karakter kıpırdamaz
    const buyucuYet = [3, 9, 10].includes(Math.floor(Number(s.id) / 1000) % 100);   // yetenek büyücü sınıfının (yakın vuruşlar dahil)
    // büyücü ateş ağacı (x5xx): efektler KO'daki ölçekte — döküm / uçan / hedef efekti boyut 1, kırpma yok; dependScale demetleri hedefin boyuna göre (size / 100)
    const koOlcek = buyucuYet && Number(s.id) % 1000 >= 500 && Number(s.id) % 1000 < 600;
    // büyücü güçlendirmeleri (Resist / Endure Fire · Cold · Lightning …, döküm süreli tip 4) de büyü gibi: yürürken basılırsa karakter durur, döküm bitince çıkar
    const cagirYet = buyucuYet && s.tip1 === 8 && Number(s.id) % 1000 === 4;   // (3.11) Summon Friend: KO'da büyü gibi dökülür (kol animasyonu 16, göğüste move_cast 2401), hedef parti üyesinde move_target 401
    if (savasciYet(s) && Number(s.id) % 1000 === 660) {   // (4.11) Sacrifice: parti üyesi seçilmeli (kendin olamaz)
      const sid = Number(state.seciliOyuncu?.id) || 0;
      if (!sid || sid === Number(me.id) || !state.parti?.uyeMi?.(sid)) { hud.notice('Select a party member to use Sacrifice on.', 'hata'); return false; }
    }
    if (cagirYet) {
      const sid = Number(state.seciliOyuncu?.id) || 0;
      if (!sid || sid === Number(me.id)) { hud.notice('Select a party member to summon.', 'hata'); return false; }
      if (state.parti && !state.parti.uyeMi?.(sid)) { hud.notice('You can only summon members of your party.', 'hata'); return false; }
    }
    const buyucu = (([3, 9, 10].includes(Number(me.class) || 0) || buyucuYet) && s.tip1 === 3) || (buyucuYet && s.tip1 === 4 && Number(s.dokum) > 0) || cagirYet;
    // KO: yürürken / basılı tutarken büyü basılırsa karakter olduğu yerde durur ve büyüyü döker (yürüme hedefi silinir, döküm bitene dek kıpırdamaz)
    const durVeDok = () => { state.target = null; state.hedefTemizle?.(); state.okKilit = Math.max(state.okKilit || 0, performance.now() + 400); };
    if (buyucu && s.hedef !== 10) durVeDok();
    let alanP = null;
    if (buyucu && s.hedef === 10 && Number(s.alan) > 0) {
      // Genie (otomatik av): çember açılmaz, yetenek seçili hedefin bulunduğu yere bırakılır
      if (state.genie?.acik && target && !isDead(target)) alanP = { x: target.pos.x, z: target.pos.z };
      else { alanP = await alanSec(s); if (!alanP) return false; }
      if (S.dead || skillBusy) return false;
      durVeDok();
      state.target = null; state.yaw = Math.atan2(alanP.x - player.position.x, alanP.z - player.position.z);
    }
    const hedefli = s.tip1 === 1 || s.tip1 === 2 || (s.tip1 === 3 && s.hedef === 7) || (s.tip1 === 4 && s.hedef === 7) || (s.tip1 === 7 && s.hedef === 7);   // (4.11) Binding: seçili mob   // tip 4 + hedef 7: düşmana zayıflatma (Illusion)
    // arenada hedef bir oyuncuysa (Z ile seçili ya da saldırılan) yetenek oyuncuya kullanılır (sunucu pvp_skill)
    if (hedefli && (!target || isDead(target))) { const pid = state.arena?.pvpHedef?.(); if (pid) return pvpYetenek(s, pid); }
    let n = null; const yuruyerek = hedefli && !!state.fareYurut?.() && !!state.target;
    const an = hedefli && (!target || isDead(target)) ? state.towers?.anitHedef : null;
    if (an) {   // anıt (Ardream / Ronark Land / RLB): yetenek hedefi −kule kimliği; sunucu _anit_hit
      const top = Math.min(an.top || 4, 6);
      n = { id: -an.t.id, anit: an, pos: new THREE.Vector3(an.t.x, an.holder.position.y, an.t.z), t: { name: an.t.ad || 'Anıt', attack_range: 4, size: 300 }, obj: an.holder, olumYer: null, tepe: top };
      const d = Math.hypot(n.pos.x - player.position.x, n.pos.z - player.position.z);
      const menzil = s.tip1 === 1 ? 7 : s.tip1 === 2 ? Math.max(s.menzil || 0, yayMenzili() + 1) : Math.max(10, s.menzil || 20);
      if (d > menzil) { hud.notice('Skill failed - Too far', 'hata'); return false; }
      state.yaw = Math.atan2(n.pos.x - player.position.x, n.pos.z - player.position.z);
      if (n.t && npcs.get(n.id) === n) n.okBekle = Math.max(n.okBekle || 0, performance.now() + 2500);   // (4.11) yetenek hasarı görünene dek realtime can / ölüm bekletilir
    } else if (hedefli) {
      // hedef yokken yetenek en yakına kendiliğinden atılmaz (KO: önce Z / tıkla hedef seç); yalnız Genie (otomatik av) en yakını seçer
      if (!target || isDead(target)) {
        const m = state.genie?.acik ? nearest() : null;
        if (!m) { hud.notice('No target selected.', 'hata'); return false; }
        selectTarget(m);
      }
      n = target;
      const d = Math.hypot(n.pos.x - player.position.x, n.pos.z - player.position.z);
      const menzil = blowArrow(s) ? 5 : s.tip1 === 1 ? n.t.attack_range + 2 : s.tip1 === 2 ? Math.max(s.menzil || 0, yayMenzili() + 1) : Math.max(10, s.menzil || 20);
      if (d > menzil) {
        if (blowArrow(s)) hud.notice('Blow Arrow requires the target to be within 5 m.', 'hata');
        // (5.11) menzil dışındaki yakın dövüş yeteneği hedefe koşturmaz (kullanıcı isteği): yalnız menzildeyse işler
        else if (s.tip1 === 1) hud.notice('Skill failed - Too far', 'hata');   // büyücü: asa yetenekleri (Magic/Fire/Frozen blade…) hedefe koşmaz, R başlatmaz; yalnız menzildeyse vurur
        else hud.notice('Skill failed - Too far', 'hata');
        return false;
      }
      if (!yuruyerek) state.yaw = Math.atan2(n.pos.x - player.position.x, n.pos.z - player.position.z);
    }
    // KO: hasar / iyileştirme yeteneği görünmezliği kaldırır (efektler görünsün diye yayından önce); güçlendirmeler (Light Feet…) kaldırmaz
    if (gorunmezBozar(s)) state.gorunmez?.boz?.('yetenek kullandın');
    skillBusy = true; if (s.tip1 !== 4 && s.tip1 !== 9 && !yuruyerek) state.target = null;   // saldırı yeteneği: önceden tıklanan yere yürüme iptal
    if (s.tip1 === 2 && !yuruyerek) state.okKilit = performance.now() + 450;   // ok yeteneği: yay gerilirken (bırakma karesine dek, en geç 0,45 sn) yürünmez; oklar çıkınca kilit kalkar
    const clip = yetenekKlibi(s); if (s.tip1 === 1) state.savasSon = performance.now();
    // yetenek kol animasyonu 1,19 hızla oynar ve sonuna kadar sürer: R vuruşu klip bitmeden araya girmez
    let YET_HIZ = s.tip1 === 2 ? 1 : s.tip1 === 9 ? 1.095 * 0.6 : 1.095;   // 0,952 × 1,15 (kol animasyonu %15 hızlı); görünmezlik/görme (tip 9) %40 yavaş
    // Blood Drain / Vampiric Touch: KO'da kol animasyonu yeteneğin döküm süresi boyunca oynar (dokum 16 → 1,6 sn)
    if (OMUZ_FX(s) && s.tip1 !== 1 && Number(s.id) % 1000 !== 820) YET_HIZ = 1.095 * 0.7;   // (7.11) Disarm normal hızda (KO animasyon 18)
    if (Number(s.id) % 1000 === 820) YET_HIZ = 1.095 * 1.2 * 0.8 * 1.4 * 1.3;   // (8.11) Disarm kol animasyonu: +%20, −%20, +%40, +%30
    if ([736, 748].includes(s.id % 1000) && [7, 8].includes(Math.floor(s.id / 1000) % 100)) YET_HIZ = 1.095 * 1.25 * 0.8;   // Rogue Cure Curse: önceki kısaltmadan %20 yavaş (~1,47 sn)   // Blood Drain / Vampiric Touch: moblarda da oyunculardaki hızla (1,095 × 0,7)
    if (genieHiz !== 1) YET_HIZ *= genieHiz;
    if (buyucuMu() && clip) YET_HIZ *= 1.2;   // büyücü yetenek kol animasyonu %20 hızlı
    // KO: yakın dövüş yeteneğinin hasarı klibin vuruş karesinde (strike) görünür — animasyon ile vuruş eş zamanlı
    let vurusOldu = !clip, bekleyenVur = null;
    // büyücü asa ile R yaparken yetenek: R vuruşu anında biter (hasar hemen), yetenek klibi geçişsiz başlar
    if (buyucuMu() && rKesik && state.avatar?.onceBilgi?.()?.name === rKesik.ad) { const k = rKesik; rKesik = null; k.kes(); state.avatar?.stopOnce?.(true); lastAttack = performance.now(); }
    if (clip) state.avatar?.playOnce(state.avatar?.has?.(clip) ? clip : 'attack', { speed: YET_HIZ, onStrike: () => { vurusOldu = true; const f = bekleyenVur; bekleyenVur = null; f?.(); } });
    // R combo penceresi: yetenek klibi boyunca (+0,35 sn) R basılırsa animasyon kesilir, hasar hemen uygulanır
    if (clip && s.tip1 !== 2) rKombo = { bit: performance.now() + (clip ? (state.avatar?.sure?.(state.avatar?.has?.(clip) ? clip : 'attack') || 0.8) * 1000 / YET_HIZ : 0) + 350,
      flush: () => { if (!vurusOldu) { vurusOldu = true; const f = bekleyenVur; bekleyenVur = null; f?.(); } } };
    const klipSure = clip ? (state.avatar?.sure?.(state.avatar?.has?.(clip) ? clip : 'attack') || 0) * 1000 / YET_HIZ : 0;
    state.yetenekKlipBit = performance.now() + klipSure; state.yetenekYayinBit = state.yetenekKlipBit;   // kombo R'si bu süre içinde yayınlanmaz
    if (savasciYet(s) && s.tip1 === 1 && state.avatar) state.avatar._izKomboBekle = performance.now() + klipSure + 1500;   // (4.11) KO: yetenek sırasında / hemen ardından gelen R vuruşunun silah izi kırmızı
    const klipBit = performance.now() + klipSure;
    state.yurYetBit = yuruyerek ? klipBit : 0;
    const dokum = gizlenme ? (gizDokum = { bit: klipBit, iptal: false }) : null;
    if (dokum) state.okKilit = Math.max(state.okKilit || 0, klipBit);   // döküm bitene dek kıpırdamaz
    // Rogue Cure Curse / Cat's Eyes / Lupine Eyes: kol animasyonu bitene dek karakter yürümez; etkisi (+ efekt) animasyon bitince
    const sonraEtki = (([736, 748, 715, 735, 30, 610, 650, 802].includes(s.id % 1000) && [7, 8].includes(Math.floor(s.id / 1000) % 100)) || /^swift$/i.test(String(s.ad))) && klipSure > 0;   // + Strength of Wolf, Swift   // Cure Curse, Cat's / Lupine Eyes
    if (sonraEtki) { state.target = null; state.okKilit = Math.max(state.okKilit || 0, klipBit); }
    // Cat's Eyes (x715), Lupine Eyes (x735), Cure Curse (x736), Swift: hareket hâlinde basılınca karakter kendiliğinden durur, yetenek atılır
    //   (kol animasyonu boyunca yürümez)
    const durdur = (([715, 735, 736, 748].includes(s.id % 1000) && [7, 8].includes(Math.floor(s.id / 1000) % 100)) || /^swift$/i.test(String(s.ad))) && klipSure > 0;
    if (durdur) { state.target = null; state.okKilit = Math.max(state.okKilit || 0, klipBit); }
    if (s.bicak && klipSure > 0) state.okKilit = Math.max(state.okKilit || 0, klipBit);   // Throwing Knife: atış animasyonu boyunca yürümez
    const [fxSelf, fxFly, fxHedef] = s.fx || [];
    const v0 = new THREE.Vector3();
    // Evade/Safety/Scaled Skin: döküm topu (2701) yok; hedef efekti eksiksiz (ışık çubukları + zemin halkası), KO ölçeğinde
    const sadeceZemin = [2706, 2707, 2708].includes(fxHedef);
    const onYayin = [];   // erken efektlerin diğer oyunculara yayını: yalnız sunucu onaylarsa
    const onFxler = [];   // sunucu reddederse (sınıf, seviye, bekleme…) erken oynayan efektler ve kol animasyonu durdurulur
    // KO büyücü döküm efekti (birebir): tablonun SelfEffect'i, SelfPart ekleminde (2 göğüs, 12 sağ el — Flash / Shiver'da heal_cast
    // sağ elde); döküm boyunca döngüde, döküm bitince / iptalde kalkar. Büyücünün yakın vuruş yetenekleri (Stroke, Magic blade) de eklemde.
    // büyü kol animasyonunun bitişinden 0,5 sn önce çıkar (animasyon sonuna kadar oynar); klibi olmayan büyüde tablodaki döküm süresi (dokum/10 sn)
    const dokumMs = buyucu ? (klipSure > 0 ? Math.max(100, klipSure) : Number(s.dokum) > 0 ? Number(s.dokum) * 100 : 0) : 0;   // (3.11) büyü kol animasyonu tamamen bitince çıkar
    let dokumFx = null;
    const ekl = buyucuYet && Number(s.sp) >= 0 && Number(s.sp) < 200 ? Number(s.sp) : -1;
    if (buyucu) {
      // Resist / Endure Fire · Cold · Lightning (tip 4): sarı döküm efekti (2701) ayaktan başa kadar — yarım ölçek, ayakta, baş hizasında kırpılır
      if (fxSelf && s.tip1 === 4 && [2701, 2702].includes(Number(fxSelf))) { dokumFx = benFx(fxSelf, { boyut: 0.5, enFazla: +basYuk().toFixed(2), dir: ileri(), zorla: true, loop: true, omur: Math.round(dokumMs + 150), yayinKuyruk: onYayin }); onFxler.push(dokumFx); }
      else if (fxSelf) { dokumFx = benFx(fxSelf, { ...(koOlcek ? {} : { boyut: 0.8, enFazla: 3 }), eklem: ekl, ...(ekl < 0 ? { dy: +(basYuk() * 0.72).toFixed(2) } : {}), dir: ileri(), zorla: true, loop: true, omur: Math.round(dokumMs + 150), yayinKuyruk: onYayin }); onFxler.push(dokumFx); }
    } else if (fxSelf && !sadeceZemin && buyucuYet && ekl >= 0) onFxler.push(benFx(fxSelf, { boyut: 0.8, enFazla: 3, eklem: ekl, dir: ileri(), zorla: true, omur: 2500, yayinKuyruk: onYayin }));
    else if (fxSelf && !sadeceZemin && (savasciYet(s) || sprintYet(s) || rogueKo(s))) { if (!(Number(fxHedef) === 10029 && Number(fxSelf) === 2701)) onFxler.push(...koParcaFx(fxSelf, s.sp, { dir: ileri(), yayinKuyruk: onYayin, ...([730, 750].includes(Number(s.id) % 1000) ? { zorla: true } : {}) })); }   // (4.11) Sprint koşulu düşünce alttaki genel dala düşüp yine 2701 çiziliyordu — (3.11) savaşçı: KO SelfPart eklemi — (4.11) Sprint'te sarı baloncuk (2701 ability_cast) yok; genel döküm efekti 2601 (mavi iksir halkası) gösterilmez; yalnız yeteneğin kendi efekti
    else if (fxSelf && !sadeceZemin) onFxler.push(benFx(fxSelf, { boyut: 0.8, enFazla: 3, ...omuzSecenek(s), yayinKuyruk: onYayin }));
    // kendine yetenek (iyileştirme, güçlendirme, Eyes…): etki efekti tuşa basıldığı an oynar — sunucu yanıtı beklenmez
    // (4.11) savaşçı hedef efekti karakterin yönünde; Sprint (10029 sprint.fxb): mavi koşu izi (mesh z +0,4'ten −3 m/sn geriye) ayağın hemen arkasından başlasın diye demet 0,6 m geride
    const hedefFxSec = () => (cureKo(s) ? { boyut: 1, dir: ileri(), dy: +basYuk().toFixed(2) } : savasciYet(s) || sprintYet(s) || rogueKo(s) ? { boyut: 1, dir: ileri(), ...(Number(fxHedef) === 10029 ? { on: -0.6 } : {}), ...(Number(fxHedef) === 32038 ? { dy: +(basYuk() * 0.5).toFixed(2) } : {}), ...(Number(s.tp) >= 0 && Number(s.tp) < 200 ? { eklem: Number(s.tp) } : {}) } : koOlcek ? {} : sadeceZemin || TAM_FX.has(fxHedef) ? { boyut: 1 } : GOZ_FX.has(fxHedef) ? { boyut: 1, dy: basYuk() / 0.9 + 0.3, dir: ileri() } : { boyut: 0.8, enFazla: 3, ...omuzSecenek(s, true) });
    let onFx = false;
    if (!sonraEtki && !buyucu && !hedefli && fxHedef && [3, 4, 5, 9].includes(Number(s.tip1)) && !OMUZ_FX(s)) { onFx = true; onFxler.push(benFx(fxHedef, { ...hedefFxSec(), yayinKuyruk: onYayin })); }
    const reddet = () => { if (s.tip1 === 2) state.okKilit = 0; for (const b of onFxler) b?.dispose?.(); if (clip) { state.avatar?.stopOnce?.(); state.yetenekKlipBit = performance.now(); } rKombo = null; if (dokum) { gizDokum = null; state.okKilit = 0; } };
    // anlık geri bildirim: mana maliyeti yanıt beklenmeden düşülür (sunucu yanıtı kesin değeri yazar, başarısızsa geri alınır)
    const mpOnce = S.mp, mpDus = Number(s.mp) > 0 && S.mp >= Number(s.mp);
    // (8.11) mana ön düşülmez: başarısız yetenekte çubuk inip geri çıkmasın; sunucu onaylayınca kesin değer yazılır
    // (6.11) başarısız (uzak / ölü / iptal / sunucu reddi) yetenekte mana harcanmaz: ön düşülen bedel her durumda geri eklenir (arada MP yenilenmesi olsa da)
    const mpGeri = () => {};   // (8.11) ön düşüm yok → geri verilecek mana yok
    let res;
    const okluYet = s.tip1 === 2 && n; if (okluYet) n.okBekle = performance.now() + 3000;   // ok yeteneği: mob ok değmeden ölmesin
    // etki animasyon bitince. Animasyon sürerken başka yere tıklanırsa (dünya, NPC, arayüz) yetenek iptal olur:
    // kol animasyonu kesilir, mana geri verilir, sunucuya istek gitmez (Cure Curse, Cat's / Lupine Eyes, Strength of Wolf, Swift)
    if (sonraEtki) {
      let iptal = false;
      // yalnız sahneye (dünyaya) sol tık iptal eder — yürüme / hedef komutu. Arayüz tıklamaları (kısayol çubuğu, pencereler)
      // ve sağ tuş (kamera döndürme) iptal etmez; yoksa dururken basılan Cat's / Lupine Eyes bazen kendiliğinden iptal oluyordu
      const tik = (ev) => { if (ev.button === 0 && ev.target?.id === 'sahne') iptal = true; };
      addEventListener('pointerdown', tik, true);
      await new Promise((r) => { const t0 = performance.now(), bitis = Math.max(0, klipBit - t0); const bak = () => { if (iptal || performance.now() - t0 >= bitis) return r(); setTimeout(bak, 30); }; bak(); });
      removeEventListener('pointerdown', tik, true);
      if (iptal) { skillBusy = false; mpGeri(); reddet(); state.okKilit = 0; hud.info?.(`Casting failed`, 'ben'); return false; }
    }
    // KO büyücü: büyü döküm süresi (dokum/10 sn) boyunca karakter kıpırdamaz; büyü döküm bitince çıkar (sunucuya o an gider)
    // döküm sürerken sahneye sol tık (başka yere yürüme / hedef) ya da yeni bir WASD / ok tuşu basışı büyüyü anında iptal eder:
    // kol animasyonu ve döküm topu kesilir, mana geri verilir, sunucuya istek gitmez, karakter hemen yürür
    if (buyucu && !sonraEtki) {
      const dokumBit = performance.now() + dokumMs;
      state.target = null; state.okKilit = Math.max(state.okKilit || 0, dokumBit);
      let iptal = false;
      const tik = (ev) => { if (ev.button === 0) iptal = true; };
      const tus = (ev) => { if (!ev.repeat && /^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(ev.code) && !/^(INPUT|TEXTAREA)$/.test(ev.target?.tagName || '')) iptal = true; };
      canvas.addEventListener('pointerdown', tik, true); addEventListener('keydown', tus, true);
      // yürürken büyü basılırsa karakter kendiliğinden durur: büyüden ÖNCE basılı olan yön tuşu / fare yürümesi iptal ettirmez
      // (döküm bitince yürüme sürer). Döküm başladıktan SONRA basılan yön tuşu (basılı tutulsa da) ya da sahneye tıklama iptal eder.
      await new Promise((r) => { const bak = () => { if (iptal || S.dead || performance.now() >= dokumBit) return r(); setTimeout(bak, 15); }; bak(); });
      canvas.removeEventListener('pointerdown', tik, true); removeEventListener('keydown', tus, true);
      dokumFx?.dispose?.();
      if (iptal || S.dead) { skillBusy = false; mpGeri(); reddet(); state.okKilit = 0; if (!S.dead) hud.info?.(`Casting failed`, 'ben'); return false; }
    }
    // KO: büyünün uçan efekti (Fire ball, Fire spear, burst'ler…) döküm biter bitmez elden çıkar — sunucu yanıtı beklenmez; hasar efekt varınca
    let ucus = null;
    if (buyucu && fxFly && (n || alanP)) ucus = ucur(fxFly, n ? () => _ucH.set(n.pos.x, n.pos.y + ortaY(n), n.pos.z) : () => _ucH.set(alanP.x, (state.heightAt?.(alanP.x, alanP.z) ?? player.position.y) + 0.3, alanP.z), n, koOlcek);
    const blinkP = s.tip1 === 8 && Number(s.id) % 1000 === 774 ? blinkHedef() : null;   // Blink: baktığı yöne en fazla 20 m
    // (3.11) Summon Friend (x004 büyücü, warptype 12): hedef seçili parti üyesi (karakter id)
    const cagirMi = s.tip1 === 8 && Number(s.id) % 1000 === 4 && [9, 10].includes(Math.floor(Number(s.id) / 1000) % 100);
    const cagirId = cagirMi ? Number(state.seciliOyuncu?.id) || null : null;
    // (4.11) Descent (x650) / Sacrifice (x660): seçili parti üyesi; yoksa en yakın parti üyesi (canlı konumu p_mx / p_mz)
    const partiYet = savasciYet(s) && [650, 660].includes(Number(s.id) % 1000);
    let partiId = null, partiPos = null;
    if (partiYet) {
      const sec = Number(state.seciliOyuncu?.id) || 0;
      if (sec && sec !== Number(me.id) && state.parti?.uyeMi?.(sec)) partiId = sec;
      else if (state.parti?.partide) { let bd = 1e9; for (const u of state.parti?.uyeler?.() || []) { const o = state.arena?.oyuncu?.(u)?.obj; if (!o || Number(u) === Number(me.id)) continue; const dd = o.position.distanceTo(player.position); if (dd < bd) { bd = dd; partiId = Number(u); } } }
      const po = partiId ? state.arena?.oyuncu?.(partiId)?.obj : null; if (po) partiPos = { x: po.position.x, z: po.position.z };
    }
    // (5.11) KO dost hedefli yetenek (Minor Healing, Swift…; MORAL_FRIEND): seçili oyuncuya (kendisi değilse); sunucu PvP bölgesinde karşı ulusu / rakibi reddeder
    const dostYet = Number(s.hedef) === 2 && (s.tip1 === 3 || s.tip1 === 4 || s.tip1 === 5);   // (7.11) 5: Cure Curse / Cure Disease seçili oyuncuya
    const dostSec = dostYet ? Number(state.seciliOyuncu?.id) || 0 : 0;
    const dostId = dostSec && dostSec !== Number(me.id) ? dostSec : null;
    const dostPos = dostId ? state.arena?.oyuncu?.(dostId)?.obj?.position : null;
    try { res = await sb.rpc('skill_use', { p_char: me.id, p_skill: s.id, p_mob: cagirMi ? cagirId : partiYet ? partiId : dostId ?? n?.id ?? null, p_x: player.position.x, p_z: player.position.z, p_mx: n?.pos.x ?? alanP?.x ?? blinkP?.x ?? partiPos?.x ?? dostPos?.x ?? null, p_mz: n?.pos.z ?? alanP?.z ?? blinkP?.z ?? partiPos?.z ?? dostPos?.z ?? null }); }
    catch (e) { ucus?.iptal(); throw e; }
    finally { skillBusy = false; }
    if (res.error) { ucus?.iptal(); mpGeri(); reddet(); hud.notice(res.error.message, 'hata'); return false; }
    const d = res.data;
    if (!d?.ok) { ucus?.iptal(); mpGeri(); reddet(); if (d?.hazir == null) { hud.notice(d?.reason || 'Casting failed', 'hata'); hud.info?.(`${s.ad} failed`, 'harca'); }   // bekleme süresi mesajı yazılmaz (yuvada kararma görünür)
      if (d?.ok_yok) state.inv?.reload?.(); return d || false; }
    for (const pl of onYayin) state.net?.fx?.(pl);   // onaylandı: erken efektler artık diğer oyunculara da
    if (d.mp == null && mpDus) { S.mp = Math.max(0, S.mp - Number(s.mp)); showStats(); }   // (8.11) sunucu değer döndürmediyse onaydan sonra düş
    if (d.mp != null) { S.mp = d.mp; showStats(); }   // mana hemen sunucu değerine (hasar/iyileşme vuruş karesinde)
    if (d.ok_kalan != null) okYenile(d.ok_kalan);
    if (d.iksir_kalan != null) { state.inv?.reload?.(); if (d.iksir_kalan <= 0) hud.notice('You have run out of Blessing Potion.', 'hata'); }
    if (d.kan_kalan != null) { state.inv?.reload?.(); if (d.kan_kalan <= 0) hud.notice('You have run out of Blood of wolf.', 'hata'); }
    if (d.tas_kalan != null) { state.inv?.reload?.(); if (d.tas_kalan <= 0) hud.notice('You have run out of Stone of Warrior.', 'hata'); }   // (4.11) savaşçı usta yetenekleri
    if (d.bicak_kalan != null) { state.inv?.reload?.(); if (d.bicak_kalan <= 0) hud.notice('You have run out of Throwing-knife.', 'hata'); }
    // KO ortak gecikme: yetenekten sonra diğer yetenekler ve R vuruşu döküm süresi kadar bekler
    const kombolandi = komboSon >= klipBit - klipSure;   // yanıt gelmeden R combo yapıldıysa R beklemesi yeniden kurulmaz
    if (d.genel) { state.genelBekleme = { bit: performance.now() + d.genel * 1000, top: d.genel * 1000 }; if (!kombolandi) lastAttack = performance.now() + Math.max(0, d.genel * 1000 - saldiriAraligi()); }
    if (klipSure && !kombolandi) lastAttack = Math.max(lastAttack, klipBit - saldiriAraligi());
    // KO işlem bilgisi: sarı "Using <yetenek>", kırmızı "<n> SP Used" (savaşçı / rogue / Kurian SP, büyücü / rahip MP)
    hud.info?.(`Using ${s.ad}`, 'kullan');
    if (savasciYet(s) && [710, 731, 720, 755].includes(Number(s.id) % 1000)) {   // grup kilidi: buff süresi (sonuç), yoksa (Blaze Killer) yeteneğin bekleme süresi
      const sure = Math.max(...(d.sonuc || []).map((r) => Number(r.sure) || 0), 0) || Number(d.bekleme) || 6;
      (state.savasciGrup ||= new Map()).set(Number(s.id) % 1000, { bit: performance.now() + sure * 1000, id: s.id });
    }
    if (Number(s.mp) > 0) hud.info?.(`${Number(s.mp)} ${spMi() ? 'SP' : 'MP'} Used`, 'harca');
    if (n) { n.aggro = true; n.aggroAt = performance.now(); n.petHedef = false; }
    const vur = () => {
      for (const r of d.sonuc || []) {
        if (r.hedef_char != null) {   // (5.11) başka oyuncuya: dost hedefli (Minor Healing / Swift) ya da parti güçlendirmesi (Strength of Wolf) — efekt hedefte, etki hedefin istemcisine
          const hid = String(r.hedef_char), ho = state.arena?.oyuncu?.(hid);
          if (fxHedef && cureKo(s) && ho?.obj) { const o = ho.obj; cureFx(fxHedef, () => o.position, 1.8, new THREE.Vector3(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y))); state.net?.fx?.({ k: 'o', id: fxHedef, o: hid, b: 1, cure: 1 }); }
          else if (fxHedef) {   // (5.11) kendi üstündekiyle aynı ölçü / yükseklik / yön (Battle Cry halkası vb. her üyede aynı yerde)
            const fo = hedefFxSec(), bo = fo.boyut ?? 0.8, ef = fo.enFazla ?? null, dy = Number(fo.dy) || 0, yonlu = !!fo.dir;
            if (ho?.obj) { const v = new THREE.Vector3(), o = ho.obj; state.efekt?.(fxHedef, o.position, { follow: () => { v.copy(o.position); v.y += dy; return v; }, boyut: bo, ...(ef ? { enFazla: ef } : {}), ...(yonlu ? { dir: new THREE.Vector3(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y)) } : {}) }); }
            state.net?.fx?.({ k: 'o', id: fxHedef, o: hid, b: bo, e: ef, ...(dy ? { dy } : {}), ...(yonlu ? { yon: 1 } : {}) }); }
          if (r.heal && ho?.obj) floatText(ho.obj.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '+' + r.heal, 'iyi');
          state.net?.dost?.({ id: hid, skill: s.id, ad: s.ad, ...(r.temizle ? { temizle: 1 } : {}), heal: r.heal || 0, hp: r.hedef_hp ?? null, max_hp: r.hedef_max_hp ?? null, buff: r.buff || null, sure: r.sure || 0, hiz: r.hiz || 100 });
          continue;
        }
        if (r.heal) { floatText(player.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '+' + r.heal, 'iyi'); hud.info?.(`${r.heal} HP Recovered`, 'iyi'); }
        if ((r.buff || r.heal) && fxHedef && !vur.fxOynadi && !onFx) { vur.fxOynadi = true;
          // Blood Drain / Vampiric Touch: oyunculardaki gibi emme efekti hedefin üstünde (+0,2 m)
          if (OMUZ_FX(s) && n?.pos) { const tv = new THREE.Vector3(), hn = n, kf = KAFA_FX.has(fxHedef), ek = kf ? kafaY(hn) + 1.0 : rogueKo(s) ? ortaY(hn) : 0.2; state.efekt?.(fxHedef, hn.pos, { follow: () => { tv.copy(hn.pos); tv.y += ek; return tv; }, ...emmeSec(hn.pos, kf, s) }); if (kf) state.net?.fx?.({ k: 'z', id: fxHedef, x: +hn.pos.x.toFixed(2), y: +(hn.pos.y + ek).toFixed(2), z: +hn.pos.z.toFixed(2), m: hn.id ?? null, b: 0.8, e: 3, dy: +ek.toFixed(2) }); }
          else benFx(fxHedef, hedefFxSec()); }
        // Stealth / Hide / Cat's / Lupine Eyes: yetenek animasyonu bitmeden görünmez olmaz
        if (r.buff && r.ozel === 9) { const bekle = Math.max(0, klipBit - performance.now()); setTimeout(() => {
          if (dokum?.iptal) { dispatchEvent(new CustomEvent('ko-etki-kaldir', { detail: 'buff:' + r.buff })); return; }   // döküm iptal edildi
          if (dokum && gizDokum === dokum) gizDokum = null;
          if (!S.dead) state.gorunmez?.etkin?.(s.id, r.durum, Math.max(1, r.sure - bekle / 1000), s.ad, 'buff:' + r.buff); }, bekle); }
        if (r.buff) {
          void 0;   // KO: güçlendirme süresi sohbet günlüğüne yazılmaz (simgesi görünür)
          dispatchEvent(new CustomEvent('ko-etki', { detail: { id: s.id, ad: s.ad, sure: r.sure, tip: r.debuff ? 'debuff' : 'buff', anahtar: 'buff:' + r.buff, hiz: !!(r.hiz && r.hiz !== 100) } }));
          if (r.hiz && r.hiz !== 100) state.buffHiz = { k: r.hiz / 100, until: performance.now() + r.sure * 1000, id: s.id };
          setTimeout(() => state.inv?.stats?.(), r.sure * 1000 + 300);   // süre bitince değerler yeniden hesaplansın
        }
        if (r.temizle && fxHedef && !onFx && !vur.fxOynadi) { vur.fxOynadi = true; if (cureKo(s)) { cureFx(fxHedef, () => player.position, basYuk(), ileri()); state.net?.fx?.({ k: 'b', id: fxHedef, b: 1, cure: 1 }); } else benFx(fxHedef, hedefFxSec()); }   // arındırma efekti (Cure Curse: animasyon sonunda)
        if (r.temizle) dispatchEvent(new CustomEvent('ko-debuff-temizle'));
        if (r.isinlan) { player.position.set(r.x, state.heightAt(r.x, r.z), r.z); state.target = null; if (r.descent) { benFx(701, { boyut: 1, dir: ileri() }); hud.info?.('You have teleported to your party member.', 'beceri'); } }
        if (r.kurban) {   // (4.11) Sacrifice: parti üyesinin canı doldu (bizim canımız sunucuda 1'e indi)
          state.parti?.yay?.('kurban', { id: Number(r.kurban), hp: r.hedef_hp, max_hp: r.hedef_max_hp, ad: me.name });
          const ro = state.arena?.oyuncu?.(r.kurban)?.obj; if (ro && fxHedef) { const v = new THREE.Vector3(); state.efekt?.(fxHedef, ro.position, { follow: () => v.copy(ro.position), boyut: 1 }); state.net?.fx?.({ k: 'o', id: fxHedef, o: String(r.kurban), b: 1, e: 3 }); }
          hud.info?.(`${state.arena?.oyuncu?.(r.kurban)?.meta?.name || 'Party member'}'s HP has been fully restored.`, 'iyi');
        }
        if (r.kiskirt && r.mob != null) {   // (4.11) Binding / Provoke: mob(lar) kullananı hedefler (KO MAGIC_TYPE7 bTargetChange)
          const m = npcs.get(r.mob); if (!m || isDead(m)) continue;
          m.aggro = true; m.aggroAt = performance.now(); m.petHedef = false; m.kiskirtBit = performance.now() + (Number(r.sure) || 10) * 1000;
          if (fxHedef) koFx(fxHedef, m, ortaY(m), 1);
          continue;
        }
        if (r.cagir) { state.parti?.yay?.('cagir', { id: Number(r.cagir), x: r.x, z: r.z, zone: me.zone ?? null, ad: me.name }); hud.info?.('You have summoned your party member.', 'beceri'); }
        if (r.hedef_debuff != null) { const m = npcs.get(r.hedef_debuff) || n; if (fxHedef && m && OMUZ_FX(s)) { const tv = new THREE.Vector3(), kf = KAFA_FX.has(fxHedef), ek = kf ? kafaY(m) + 1.0 : rogueKo(s) ? ortaY(m) : 0.2; state.efekt?.(fxHedef, m.pos, { follow: () => { tv.copy(m.pos); tv.y += ek; return tv; }, ...emmeSec(m.pos, kf, s) }); } else if (fxHedef && m) zeminFx(fxHedef, m, 0.6); hud.info?.(`${s.ad}: ${m?.t?.name || 'target'} weakened (${r.sure} sec).`, 'beceri'); continue; }
        if (r.anit && r.ok) { state.towers?.anitSonuc?.(r); if (fxHedef && n) zeminFx(fxHedef, n, 0.6); continue; }   // anıta vuruş
        if (r.mob != null && r.ok) {
          const m = npcs.get(r.mob); if (!m) continue;
          if (fxHedef && OMUZ_FX(s)) { const tv = new THREE.Vector3(), hm = m, kf = KAFA_FX.has(fxHedef), ek = kf ? kafaY(hm) + 1.0 : rogueKo(s) ? ortaY(hm) : 0.2; state.efekt?.(fxHedef, hm.pos, { follow: () => { tv.copy(hm.pos); tv.y += ek; return tv; }, ...emmeSec(hm.pos, kf, s) }); }   // Eskrima: KO kanama maskesi başın üstünde
          else if (fxHedef && !alanP && koOlcek) koFx(fxHedef, m, CEMBER_FX[fxHedef] ? 0 : Number(s.tp) === 0 ? ortaY(m) : 0);   // ateş büyüleri: KO ölçeği
          else if (fxHedef && !alanP && buyucuYet && CEMBER_FX[fxHedef]) cemberFx(fxHedef, m);   // Hell fire / Pillar / Manes / Fire Impact / Incineration: hedef çemberi büyüklüğünde
          else if (fxHedef && !alanP && savasciYet(s) && Number(fxHedef) !== 10002) koFx(fxHedef, m, Number(s.tp) >= 0 && Number(s.tp) < 255 ? ortaY(m) : 0, 1);   // (4.11) savaşçı: KO ölçeği (1) ve TargetPart (−1 / 255 ayak, diğerleri gövde)
          else if (fxHedef && !alanP) zeminFx(fxHedef, m, 0.6, 1, true, s.tip1 === 2 || s.bicak || (buyucuYet && Number(s.tp) === 0) ? ortaY(m) : 0, buyucuYet);
          else if (fxHedef && alanP && buyucuYet && [533, 633, 733].includes(Number(s.id) % 1000)) { if (koOlcek) koFx(fxHedef, m, ortaY(m)); else zeminFx(fxHedef, m, 0.6, 1, true, ortaY(m), true); }   // Fire / Ice / Thunder burst: alandaki her moba vuruş efekti
          m.aggro = true; m.aggroAt = performance.now(); m.petHedef = false;
          applyHit(m, r, { fx: !fxHedef || !!alanP, ad: s.ad, darbe: s.tip1 === 1 && !buyucuMu() ? 'kirmizi' : false });
          okVardiMob(m);
          buyuEtki(m, r, s);
        }
      }
      Object.assign(S, { hp: d.hp, max_hp: d.max_hp, mp: d.mp, max_mp: d.max_mp }); showStats();
      if (d.tip === 4) state.inv?.stats?.();
    };
    // görsel vuruş bitişi (ok uçuşu / vuruş karesi / uçan efekt): Genie bu ana kadar yeni yetenek ya da normal vuruş başlatmaz —
    // yoksa sonraki istek mobu sunucuda öldürür ve mob, ilk yeteneğin oku / animasyonu varmadan yere düşer
    {
      const simdi = performance.now(), mes = n ? Math.hypot(n.pos.x - player.position.x, n.pos.z - player.position.z) : 0;
      const okSay = (d.sonuc || []).filter((r) => r.mob != null).length || 1;
      const bit = s.tip1 === 2 && n ? simdi + Math.max(0, Math.min(450, klipBit - simdi)) + Math.max(180, Math.min(700, mes * 22)) + (okSay - 1) * 110 + 120 + OK_HASAR_GECIKME
        : fxFly && n ? simdi + 400 : s.tip1 === 1 ? Math.max(klipBit, simdi + 150) : simdi + 150;
      gorselBit = Math.max(gorselBit, bit);
      if (state.genie?.acik) lastAttack = Math.max(lastAttack, gorselBit - saldiriAraligi());
    }
    if (s.tip1 === 2 && n) {   // ok yeteneği: oklar yay kol animasyonunun bırakma karesinde (strike) çıkar — en geç 0,45 sn
      const okSalvo = () => {
      okBirakildi();   // KO: oklar çıktı — karakter hemen yürüyebilir (yeni ok için kol animasyonu + bekleme beklenir; W ile kesilirse beklemez)
      const mesafe = Math.hypot(n.pos.x - player.position.x, n.pos.z - player.position.z), sure = Math.max(180, Math.min(700, mesafe * 22));
      // her ok ayrı: 3'lü / 5'li atışta oklar hedefe düz gider, her biri varınca kendi sonucunu (hasar ya da ıska) gösterir
      const oklar = (d.sonuc || []).filter((r) => r.mob != null);
      n.okBekle = performance.now() + 2500;   // oklar uçarken (ok varınca bırakılır)
      if (!oklar.length) okAt(n.pos, sure, () => { vur(); okVardiMob(n); }, { fx: fxFly });
      // KO: 3'lü / 5'li atış yatay sıra hâlinde, yaratığın doğrultusunda paralel gider; isabet edenler ortadaki hatlar
      // KO yelpaze: 1. ok hedefe, 2-3. oklar ±15°, (5'li) 4-5. oklar ±30° — sunucu sırasıyla aynı (yakındayken hepsi tutar, uzakta yandakiler ıskalar)
      const YELPAZE = [0, 15, -15, 30, -30].map((d) => d * Math.PI / 180);
      // 3'lü / 5'li: sunucu ilk ok mobu öldürünce durur (tek sonuç) — görselde yine de 3 / 5 ok yelpaze hâlinde çıkar; sonucu olmayan oklar yalnız görsel
      const COKLU = ({ 515: 3, 555: 5 })[s.id % 1000] || 0;
      const yelpaze = COKLU ? Array.from({ length: COKLU }, (_, k) => oklar[k] || { mob: oklar[0]?.mob ?? n.id, gorsel: true }) : oklar;
      // yan ok başka bir moba değdiyse (sunucu yolundaki ilk mobu vurur) ok doğrudan o moba gider
      const baskaMob = (r) => !r.gorsel && r.ok && String(r.mob) !== String(n.id) ? npcs.get(r.mob) : null;
      if (yelpaze.length > 1) yelpaze.forEach((r, k) => okAt(baskaMob(r)?.pos || n.pos, sure, () => {
        if (r.gorsel) { if (k === yelpaze.length - 1) okVardiMob(n); return; }
        const m = npcs.get(r.mob) || n;
        if (r.ok && r.anit) { state.towers?.anitSonuc?.(r); if (fxHedef) zeminFx(fxHedef, m, 0.6, 1, true, ortaY(m)); }
        else if (r.ok) { m.aggro = true; m.aggroAt = performance.now(); applyHit(m, r, { fx: !fxHedef, ad: s.ad, darbe: s.tip1 === 1 && !buyucuMu() ? 'kirmizi' : false }); okVardiMob(m); if (fxHedef) zeminFx(fxHedef, m, 0.6, 1, true, ortaY(m)); }
        else if (r.ok_iska) floatText(m.pos, 'Iska', 'iska');
        if (k === 0) { Object.assign(S, { hp: d.hp, max_hp: d.max_hp, mp: d.mp, max_mp: d.max_mp }); showStats(); }
        if (k === yelpaze.length - 1) okVardiMob(n);
      }, { fx: fxFly, aci: baskaMob(r) ? 0 : YELPAZE[k] || 0, gec: !!r.ok_iska || !!r.gorsel && k > 0, gecik: k * 15, iz2: COKLU ? 10203 : 0 }));
      else yelpaze.forEach((r, k) => okAt(n.pos, sure, () => {
        const m = npcs.get(r.mob) || n;
        if (r.ok && r.anit) { state.towers?.anitSonuc?.(r); if (fxHedef) zeminFx(fxHedef, m, 0.6, 1, true, ortaY(m)); }
        else if (r.ok) { m.aggro = true; m.aggroAt = performance.now(); applyHit(m, r, { fx: !fxHedef, ad: s.ad, darbe: s.tip1 === 1 && !buyucuMu() ? 'kirmizi' : false }); okVardiMob(m); if (fxHedef) zeminFx(fxHedef, m, 0.6, 1, true, ortaY(m)); }
        else if (r.ok_iska) floatText(m.pos.clone().add(new THREE.Vector3(0, 2, 0)), 'Iska', 'iska');
        if (k === oklar.length - 1) { Object.assign(S, { hp: d.hp, max_hp: d.max_hp, mp: d.mp, max_mp: d.max_mp }); showStats(); okVardiMob(n); }
      }, { fx: fxFly, gecik: k * 110 }));
      };
      if (vurusOldu) okSalvo();
      else { bekleyenVur = okSalvo; setTimeout(() => { if (bekleyenVur === okSalvo) { bekleyenVur = null; okSalvo(); } }, Math.max(0, Math.min(450, klipBit - performance.now()))); }
    } else if (ucus && n) {
      ucus.var.then(vur);   // büyücü: uçan efekt döküm bitince çıktı; hasar varınca
    } else if (fxFly && n) {
      // uçan efekt: oyuncudan hedefe 0.35 sn'de gider. Throwing Knife: önce kol animasyonu biter, sonra hançer fırlar
      const firlat = () => {
        const t0 = performance.now(), p0 = player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), vv = new THREE.Vector3();
        const b = state.efekt?.(fxFly, p0, { boyut: 0.8, enFazla: 2, follow: () => { const k = Math.min(1, (performance.now() - t0) / 350); return vv.copy(p0).lerp(new THREE.Vector3(n.pos.x, n.pos.y + 1.1, n.pos.z), k); } });
        state.net?.fx?.({ k: 'u', id: fxFly, x: +n.pos.x.toFixed(2), y: +(n.pos.y + 1.1).toFixed(2), z: +n.pos.z.toFixed(2), m: n.id, ms: 350 });
        setTimeout(() => { b?.stop?.(); vur(); }, 350);
      };
      // (7.11) Throwing Knife: hançer kol animasyonunun atış anında (onStrike) fırlar — animasyonun tamamen bitmesi (kuyruk) beklenmez
      if (s.bicak && !vurusOldu) { const t0 = performance.now(), iv = setInterval(() => { if (vurusOldu || performance.now() >= klipBit || performance.now() - t0 > 3000) { clearInterval(iv); firlat(); } }, 15); }
      else firlat();
    } else if (alanP) {
      // KO alan büyüsü: hedef efekti seçilen noktada (yarıçapa göre ölçekli); hasar efekt yere indikten sonra
      const y = state.heightAt?.(alanP.x, alanP.z) ?? player.position.y, b = koOlcek ? 1 : Math.max(0.8, Math.min(2.2, (Number(s.alan) || 8) / 8));
      const in_ = () => { if (fxHedef) { state.efekt?.(fxHedef, { x: alanP.x, y: y + 0.05, z: alanP.z }, { boyut: b }); state.net?.fx?.({ k: 'z', id: fxHedef, x: +alanP.x.toFixed(2), y: +y.toFixed(2), z: +alanP.z.toFixed(2), m: null, b: +b.toFixed(3), tam: 1 }); } };   // tam: yerelle aynı (boyut, kırpmasız)
      gorselBit = Math.max(gorselBit, performance.now() + 1400);
      const vurA = () => { vur(); alanPvp(s, alanP); };   // (31.10) alan, düşman oyunculara da (arena / savaş bölgesi) vurur
      if (ucus) ucus.var.then(() => { in_(); setTimeout(vurA, 250); });   // burst: uçan efekt noktaya varınca patlar
      else { in_(); setTimeout(vurA, 550); }
    } else if (s.tip1 === 1) {
      if (vurusOldu) vur();
      else { bekleyenVur = vur; setTimeout(() => { if (bekleyenVur === vur) { bekleyenVur = null; vur(); } }, Math.max(120, Math.min(klipBit - performance.now(), klipSure * 0.45 - (performance.now() - (klipBit - klipSure))))); }   // vuruş karesi gecikirse hasar en geç klibin %45'inde   // klip kesilirse yine de vurur
    } else vur();   // iyileştirme / güçlendirme: yanıt gelir gelmez (beklemesiz)
    return d;
  }

  /** başka bir oyuncunun efekti (net 'fx'): kaynak = o oyuncunun modeli; mob kimliği varsa bu istemcideki mobun konumu kullanılır */
  function uzakFx(p, kaynakObj) {
    const id = Number(p.id) || 0, mob = p.m != null ? npcs.get(p.m) : null;
    if (p.k === 'b' && id && p.cure && kaynakObj) { const o = kaynakObj; cureFx(id, () => o.position, 1.8, new THREE.Vector3(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y))); return null; }   // (8.11) Cure Curse / Disease: sarmal zeminde, halka başın üstünde (her istemcide aynı)
    if (p.k === 'b' && id && p.sn) { const v = new THREE.Vector3(), dy = Number(p.dy) || 0, t0 = performance.now(), sn = Number(p.sn) * 1000, yuk = Number(p.yuk) || 0;   // süreli, yükselen efekt (ör. madencilik +ITEM / +EXP)
      const b = state.efekt?.(id, kaynakObj.position, { follow: () => { v.copy(kaynakObj.position); v.y += dy + yuk * Math.min(1, (performance.now() - t0) / sn); return v; }, ...(p.b != null ? { boyut: p.b } : {}) }); if (b) setTimeout(() => b.dispose?.(), sn); return b; }
    if (p.k === 'b' && id) { const v = new THREE.Vector3(), dy = Number(p.dy) || 0, on = Number(p.on) || 0, yn = Number(p.yn) || 0; const h = state.efekt?.(id, kaynakObj.position, { follow: () => { v.copy(kaynakObj.position); v.y += dy; if (on) { v.x += Math.sin(yn) * on; v.z += Math.cos(yn) * on; } return v; }, ...(p.b != null ? { boyut: p.b } : {}), ...(p.e != null ? { enFazla: p.e } : {}), ...(p.yn != null ? { dir: new THREE.Vector3(Math.sin(p.yn), 0, Math.cos(p.yn)) } : {}), ...(p.rl ? { roll: Number(p.rl) } : {}), ...(p.lp ? { loop: true } : {}) }); if (p.om && h) setTimeout(() => { try { h.dispose?.(); } catch {} }, Number(p.om)); return h; }
    if (p.k === 'z' && id) { const q = mob?.pos || { x: p.x, y: p.y - (Number(p.dy) || 0), z: p.z }; return state.efekt?.(id, { x: q.x, y: q.y + (Number(p.dy) || 0.05), z: q.z }, { ...(p.s != null ? { scale: p.s } : p.tam ? { boyut: p.b ?? 1 } : { boyut: p.b ?? 0.3, enFazla: p.e ?? 1 }), ...(p.up ? { dir: new THREE.Vector3(0, 1, 0) } : p.yn != null ? { dir: new THREE.Vector3(Math.sin(p.yn), 0, Math.cos(p.yn)) } : {}) }); }   // s: KO ölçeği (ateş büyüleri)
    if (p.k === 'ok') { const q = new THREE.Vector3(p.x, p.y, p.z), k0 = kaynakObj.position.clone(); k0.x += p.dx || 0; k0.z += p.dz || 0;
      return okAt(q, Math.max(120, Math.min(1500, p.ms || 400)), null, { fx: id, hedefFx: Number(p.h) || 0, kaynak: k0, yay: false, iz2: Number(p.i2) || 0 }); }
    if (p.k === 'u' && id) {
      const t0 = performance.now(), p0 = kaynakObj.position.clone().add(new THREE.Vector3(0, 1.2, 0)), vv = new THREE.Vector3(), ms = Math.max(100, Math.min(1500, p.ms || 350));
      const hedef = () => (mob ? vv.set(mob.pos.x, mob.pos.y + 1.1, mob.pos.z) : vv.set(p.x, p.y, p.z));
      const yq = new THREE.Quaternion(), yd = new THREE.Vector3(), Zx = new THREE.Vector3(0, 0, 1), hv = new THREE.Vector3();
      const yon = () => { yd.copy(hedef()).sub(p0); if (yd.lengthSq() < 1e-6) return null; return yq.setFromUnitVectors(Zx, yd.normalize()); };   // düz gidiş yönüne bakar
      const b = state.efekt?.(id, p0, { ...(p.ko ? {} : { boyut: 0.8, enFazla: 2 }), dir: hedef().clone().sub(p0), yon, follow: () => { const k = Math.min(1, (performance.now() - t0) / ms); hv.copy(hedef()); return vv.copy(p0).lerp(hv, k); } });
      setTimeout(() => b?.stop?.(), ms); return b;
    }
    return null;
  }

  return {
    useSkill, uzakFx, benFx, mobUzak, cureFx, basYuk, mesgul: () => skillBusy, okMesgul: () => skillBusy,   // R vuruşu (busy) ok yeteneğini bekletmez
    /** Genie: hedefi seç ve otomatik saldırıyı başlat; durum sorguları */
    genie: {
      saldir(n) { if (target !== n) selectTarget(n); startAttack(); },
      sec(n) { if (target !== n) selectTarget(n); },   // büyücü (düz vuruş kapalı): yalnız hedef seçilir, yakına koşulmaz — büyüler menzilden atılır
      olu: (n) => isDead(n),
      saldiriyor: () => attacking && !!target && !isDead(target),
      mesgul: () => skillBusy || busy || performance.now() < gorselBit || performance.now() < rGorsel,
      ben: () => player.position,
      oldum: () => !!S.dead,
    },
    /** pet vuruşu (pet_vur sonucu): hasar yazısı, ölüm, sandık — oyuncunun vuruşu gibi */
    // KO: pet vurduğu moba hedef olur — mob pete koşar ve pete saldırır (oyuncu vurursa oyuncuya döner)
    petVurus(n, data, ad) { n.aggro = true; n.aggroAt = performance.now(); n.petHedef = true; applyHit(n, data, { fx: false, ad, darbe: false }); },
    petOldu() { for (const n of npcs.values()) if (n.petHedef) { n.petHedef = false; n.aggro = false; n.returning = true; n.goal = null; } },
    get mobs() { return npcs; },
    saldiriKlibi, rKlibi, saldiriAraligi, floatText, darbeOyuncu, komboFx, takiliYay, okSayisi, yayMenzili, okAt, okYokUyari, okYenile,
    cancelAttack() { if (attacking) { attacking = false; setSlotActive(false); } },
    get target() { return target; },
    clearTarget() { clearTarget(); },
    update,
    onClick(e) { const n = pick(e); if (n) { selectTarget(n); return true; } return false; },
    /** yerde yatan (ölüm animasyonundaki) mobun konumu — sandığı açmak için */
    oluSec(e) {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const olu = [...npcs.values()].filter((n) => (isDead(n) || n.dying > performance.now()) && n.obj.visible && n.obj.userData.hit);   // sandıklı ceset: yeniden doğma süresi geçse de tıklanır
      const h = ray.intersectObjects(olu.map((n) => n.obj.userData.hit), false)[0]; let n = h?.object.parent.userData.npc;
      // yerde yatan ceset dik vuruş kutusunun dışına uzanır: tıklama ışınının yerdeki noktası cesedin yarıçapı içindeyse o ceset
      if (!n) {
        const r0 = ray.ray.clone().applyMatrix4(new THREE.Matrix4().copy(world.matrixWorld).invert()), q = new THREE.Vector3();
        let en = Infinity;
        for (const m of olu) {
          if (Math.abs(r0.direction.y) < 1e-4) break;
          const t = (m.pos.y + 0.3 - r0.origin.y) / r0.direction.y; if (t <= 0) continue;
          q.copy(r0.origin).addScaledVector(r0.direction, t);
          const d = Math.hypot(q.x - m.pos.x, q.z - m.pos.z), R = Math.max(1.5, Math.min(6, ((m.t?.size || 100) / 100) * 1.6));
          if (d < R && d < en) { en = d; n = m; }
        }
      }
      return n ? { x: n.pos.x, z: n.pos.z, kutu: n.kutu ?? null } : null;
    },
    /** sandığı olan ceset: sandık durduğu sürece (en fazla 20 sn) yerde yatar ve tıklanınca sandığı açar */
    cesetTut(mobId, kutu) {
      const n = npcs.get(mobId) || npcs.get(Number(mobId)); if (!n) return;
      n.kutu = kutu;
      if (isDead(n) && n.dying > performance.now()) n.dying = Math.max(n.dying, performance.now() + 20000);
    },
    cesetBirak(kutu) { for (const n of npcs.values()) if (n.kutu === kutu) { n.kutu = null; if (n.dying > performance.now() + 1500) n.dying = performance.now() + 1500; } },
    get stats() { return S; },
    /** görev ödülü (gorev_teslim): EXP/Noah/seviye sunucudan gelir */
    odulUygula(d) {
      if (!d) return;
      Object.assign(S, { exp: Number(d.exp ?? S.exp), level: d.level ?? S.level, gold: Number(d.gold ?? S.gold), hp: d.hp ?? S.hp, max_hp: d.max_hp ?? S.max_hp, mp: d.mp ?? S.mp, max_mp: d.max_mp ?? S.max_mp });
      if (d.level != null) me.level = Number(d.level);   // (7.11)
      if (d.levelup) { hud.notice(`Level Up! Level ${d.level} (+3 stat points)`, 'seviye'); state.inv?.stats?.(); seviyeFx(); window.dispatchEvent(new CustomEvent('ko-seviye')); }
      showStats();
    },
    /** dışarıdan gelen hasar (kule vb.): sunucunun döndürdüğü can değerini uygular */
    hurt(data, from = '') {
      if (!data?.ok || S.dead) return;
      floatText(player.position.clone().add(new THREE.Vector3(0, 2.2, 0)), String(data.damage), 'ben');
      hud.info?.(`${data.damage} HP Damage`, 'ben');
      S.hp = data.hp; if (data.max_hp) S.max_hp = data.max_hp; showStats();
      if (data.dead) die(); else { state.dinlen?.kalk(true); state.avatar?.playOnce('struck'); }
    },
    get dead() { return S.dead; },
    /** sunucudan gelen karakter durumu (char_stats / add_stat / inv_move) */
    applyStats(d) {
      if (!d) return;
      for (const k of ['hp', 'max_hp', 'mp', 'max_mp', 'level', 'gold']) if (d[k] != null) S[k] = Number(d[k]);
      if (d.exp != null) S.exp = Number(d.exp);
      showStats();
    },
    cancel() { if (attacking) { attacking = false; setSlotActive(false); } state.towers?.anitDur?.(); },
  };
}
