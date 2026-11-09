// Kuleler (towers tablosu): GM'ler kurar/düzenler; düşman ulustan oyuncular kulenin hasar alanına (çap) girince
// kule 1.5 sn'de bir ateş eder. Hasar ve menzil denetimi sunucuda (tower_strike RPC). Kule kimliklerini yalnızca GM'ler görür.
import * as THREE from '../vendor/three.module.min.js';
import { loadNpcMeta, hasNpc, createNpc } from './character.js';

export const TOWER_MODEL = { 1: 'npc_30311', 2: 'npc_30211' };        // Karus / El Morad nöbetçi kulesi (NPC_Looks)
export const TOWER_NAME = { 1: 'Karus Kulesi', 2: 'El Morad Kulesi' };
const ULUS = { 0: 'Tarafsız', 1: 'Karus', 2: 'El Morad' };
const adOf = (t) => t.kind === 'anit' ? `${t.ad || 'Anıt'} (${ULUS[t.nation] || ''})` : (t.ad || TOWER_NAME[t.nation] || 'Kule');
// GM panelinde seçilebilen kule modelleri (NPC_Looks görünümleri)
export const TOWER_MODELS = [
  { m: 'npc_30311', n: 'Karus Nöbetçi Kulesi', u: 1 },
  { m: 'npc_30211', n: 'El Morad Nöbetçi Kulesi', u: 2 },
  { m: 'npc_30310', n: 'Karus Nöbetçi Kulesi (savaş)', u: 1 },
  { m: 'npc_5835', n: 'Karus Gözcü Kulesi', u: 1 },
  { m: 'npc_5834', n: 'El Morad Gözcü Kulesi', u: 2 },
  { m: 'npc_14003', n: 'Karus Savaş Kulesi', u: 1 },
  { m: 'npc_14004', n: 'El Morad Savaş Kulesi', u: 2 },
  { m: 'npc_14005', n: 'Tarafsız Savaş Kulesi', u: 0 },
  { m: 'npc_5401', n: 'Karus Topu', u: 1 },
  { m: 'npc_5301', n: 'El Morad Topu', u: 2 },
  { m: 'npc_5846', n: 'Güç Kulesi', u: 0 },
];
export const towerModel = (t) => t.model || TOWER_MODEL[t.nation];
const RING_COLOR = { 0: 0xffd35a, 1: 0xff4a3a, 2: 0x3a8cff };
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

export async function startTowers({ zone, world, state, player, sb, character, nameSprite, remoteBase, hud, onChange = () => {} }) {
  if (!sb) return null;
  const { data, error } = await sb.from('towers').select('*').eq('zone', zone).order('id');
  if (error) { console.warn('kuleler', error.message); return null; }
  if (!hasNpc(TOWER_MODEL[1])) await loadNpcMeta(`${remoteBase}/npc`).catch(() => null);
  const isGm = () => !!state.ghost;
  const group = new THREE.Group(); group.name = 'kuleler'; world.add(group);
  const byId = new Map();
  let selected = null;

  const groundY = (x, z) => {
    let y = state.heightAt(x, z);
    if (state.col) { const yc = state.col.heightNear(x, y + 2, z); if (yc > y && yc < y + 4) y = yc; }
    return y;
  };
  function build(t) {
    const e = { t: { ...t }, holder: new THREE.Group(), api: null, top: 7, gen: 0 };
    e.holder.userData.tower = e;
    group.add(e.holder);
    e.tag = nameSprite(adOf(t), t.kind === 'anit' ? '#ffd35a' : '#ffffff', { kind: 'npc' }); e.holder.add(e.tag);
    if (isGm()) { e.idEl = document.createElement('div'); e.idEl.className = 'npc-id'; e.tag.userData.el.prepend(e.idEl); }
    e.hit = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 8, 10).translate(0, 4, 0), HIT_MAT); e.hit.userData.tower = e; e.holder.add(e.hit);
    // GM: hasar alanı halkası (çap)
    e.ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: RING_COLOR[t.nation], transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    e.ring.position.y = 0.15; e.ring.renderOrder = 2; e.holder.add(e.ring);
    byId.set(t.id, e);
    place(e); model(e);
    return e;
  }
  function place(e) {
    const t = e.t;
    e.holder.position.set(t.x, groundY(t.x, t.z), t.z);
    e.holder.rotation.y = (t.dir || 0) * Math.PI / 180;
    const r = Math.max(0.5, t.range / 2); e.ring.scale.set(r, 1, r);
    e.ring.visible = isGm() && t.kind !== 'anit';
    e.ring.material.color.setHex(RING_COLOR[t.nation] || 0xffffff);
    if (t.kind === 'muhafiz') { e.hit.scale.set(0.45, 0.3, 0.45); }
    const ad = e.tag.userData.el.querySelector('.ad'); if (ad) ad.textContent = adOf(t);
    if (e.idEl) e.idEl.textContent = `Kule #${t.id} · ${t.damage} hasar · ${t.range} m çap`;
  }
  function model(e) {
    const key = towerModel(e.t);
    e.modelKey = key;
    if (e.api) { e.api.group.removeFromParent(); e.api = null; }
    e.top = 7;
    const g = ++e.gen;
    createNpc(key).then((api) => {
      if (!api || g !== e.gen) return;
      e.holder.add(api.group); e.api = api;
      e.holder.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(api.group, true);
      if (!b.isEmpty()) { const top = b.max.y - e.holder.position.y; if (top > 1 && top < 40) e.top = top; }
      e.tag.position.y = e.top + 0.4;
    }).catch(() => {});
    e.tag.position.y = e.top + 0.4;
  }
  function apply(t) {
    const e = byId.get(t.id); if (!e) { build(t); return; }
    const eskiUlus = e.t.nation;
    Object.assign(e.t, t); place(e); if (towerModel(e.t) !== e.modelKey) model(e);
    if (e.t.kind === 'anit') {
      if (anit === e) { if ((e.t.hp ?? e.t.max_hp) <= 0) anitBirak(); else hedefCiz(e); }
      if (eskiUlus !== e.t.nation) { const v = new THREE.Vector3(); state.efekt?.(10018, e.holder.position, { follow: () => v.copy(e.holder.position), boyut: 2.2 }); }   // ele geçirme ışığı
    }
  }
  function remove(id) {
    const e = byId.get(id); if (!e) return;
    e.gen++; e.tag.removeFromParent(); e.holder.removeFromParent(); byId.delete(id);
    if (selected === e) selected = null;
  }
  for (const t of data || []) build(t);

  { const kuleRt = (p) => {
      if (p.eventType === 'DELETE') { remove(p.old?.id); onChange(); return; }
      if (p.new?.zone !== zone) return;
      apply(p.new); onChange();
    };
    const kc = sb.channel('kuleler-' + zone);   // (4.11) yalnız bu bölge (sunucu filtresi); silmeler ayrı
    for (const ev of ['INSERT', 'UPDATE']) kc.on('postgres_changes', { event: ev, schema: 'public', table: 'towers', filter: `zone=eq.${zone}` }, kuleRt);
    kc.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'towers' }, kuleRt).subscribe(); }

  // ---- ateş (KO Skill 300458 "GuardTower FireArrow": döküm 2101, uçan ok 10110, hedef 101) / muhafız: kılıç vuruşu
  const shots = [];
  const okGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5).rotateX(Math.PI / 2);
  const okMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
  const animOyna = (e, ad) => { if (e.api?.has?.(ad)) { e.api.playOnce(ad); return true; } return false; };
  const yuzunuDon = (e, hedef) => { if (e.t.kind === 'muhafiz') e.holder.rotation.y = Math.atan2(hedef.x - e.holder.position.x, hedef.z - e.holder.position.z); };
  // hedefObj: vurulan oyuncunun modeli (ben ya da başka oyuncu — herkes aynı atışı görür)
  function fire(e, hedefObj, onHit) {
    yuzunuDon(e, hedefObj.position);
    if (e.t.kind === 'muhafiz') {
      if (!animOyna(e, 'attack')) animOyna(e, 'attack0');
      setTimeout(() => onHit?.(), 420); return;
    }
    animOyna(e, 'attack') || animOyna(e, 'attack0');
    const from = e.holder.position.clone().add(new THREE.Vector3(0, e.top * 0.85, 0));
    { const v = from.clone(); state.efekt?.(2101, v, { boyut: 0.9, enFazla: 3 }); }
    const m = new THREE.Mesh(okGeo, okMat); m.position.copy(from); world.add(m);
    const b = { m, from, hedefObj, t: 0, onHit, fx: null };
    const vv = new THREE.Vector3();
    b.fx = state.efekt?.(10110, from, { boyut: 0.9, enFazla: 2.5, follow: () => vv.copy(m.position) }) || null;
    shots.push(b);
  }
  const lastShot = new Map();
  let busy = false, checkT = 0;
  async function check() {
    if (busy || !character || (isGm() && state.gmOlumsuz) || state.combat?.dead || state.gorunmez?.aktif || state.baslamadi) return;   // görünmez oyuncuyu kuleler görmez   // GM yalnız "hasar yemez" açıkken muaf
    const p = player.position, now = performance.now();
    // menzilindeki TÜM düşman kuleleri vurur (iç içe 2-3 kule varsa hepsi; her kulenin kendi 1.5 sn aralığı var — sunucu: tower_vurus)
    const hedef = [];
    for (const e of byId.values()) {
      if (e.t.kind === 'anit' || e.t.nation === character.nation || !e.t.nation) continue;
      if (Math.hypot(p.x - e.t.x, p.z - e.t.z) > e.t.range / 2) continue;
      if (now - (lastShot.get(e.t.id) || 0) < 1500) continue;
      lastShot.set(e.t.id, now); hedef.push(e);
    }
    if (!hedef.length) return;
    busy = true;
    try {
      const sonuc = await Promise.all(hedef.map((e) => sb.rpc('tower_strike', { p_char: character.id, p_tower: e.t.id, p_x: p.x, p_z: p.z }).then((r) => ({ e, ...r }), () => ({ e }))));
      // yanıtlar sırasız gelebilir: can en yüksekten en düşüğe uygulanır (son değer en güncel)
      sonuc.filter((r) => !r.error && r.data?.ok).sort((a, b) => b.data.hp - a.data.hp).forEach(({ e, data: d }, i) => {
        setTimeout(() => { fire(e, player, () => state.combat?.hurt?.(d, adOf(e.t))); state.net?.fx?.({ k: 'kule', t: e.t.id }); }, i * 90);
      });
    } finally { busy = false; }
  }

  // ---- anıt: düşman ulus (tarafsızsa herkes) sol tıkla hedef alır, yanına gidip silah hızında vurur (anit_vur)
  let anit = null, anitSon = 0, anitMesgul = false, anitSaldir = false;   // anitSaldir: R / sol tık → otomatik vuruş; Z yalnız hedef alır
  const C = () => state.combat;
  function hedefCiz(e) { hud?.target?.({ name: adOf(e.t), level: 0, hp: e.t.hp ?? e.t.max_hp, max_hp: e.t.max_hp || 1, enemy: true }); }
  function anitBirak() { anitSaldir = false; if (anit) { anit = null; hud?.target?.(null); } }
  async function anitVur(e) {
    anitMesgul = true; anitSon = performance.now(); state.savasSon = anitSon;
    const kl = C()?.saldiriKlibi?.() || 'attack', k2 = state.avatar?.has?.(kl) ? kl : 'attack';
    state.avatar?.playOnce(k2, { speed: Math.max(1, (state.avatar?.sure?.(k2) || 0) * 1000 / ((C()?.saldiriAraligi?.() || 1000) * 0.95)) });
    try {
      const p = player.position;
      const { data: d, error } = await sb.rpc('anit_vur', { p_char: character.id, p_tower: e.t.id, p_x: p.x, p_z: p.z });
      if (error) { hud?.notice?.(error.message, 'hata'); anitBirak(); return; }
      if (!d?.ok) { if (d?.reason && !['uzak', 'hizli'].includes(d.reason)) { hud?.notice?.(d.reason, 'hata'); anitBirak(); } return; }
      if (C()?.takiliYay?.()) { state.okKilit = performance.now() + 750; C().okAt?.(e.holder.position, 400); if (d.ok_kalan != null) C().okYenile?.(d.ok_kalan); }
      C()?.floatText?.(e.holder.position.clone().add(new THREE.Vector3(0, Math.min(e.top, 6) + 0.5, 0)), String(d.damage), 'o', true);
      animOyna(e, 'struck');
      e.t.hp = d.hp; e.t.max_hp = d.max_hp; e.t.nation = d.nation; hedefCiz(e);
      if (d.ele) { e.t.sahip_ulus = d.sahip; hud?.notice?.(`You have destroyed ${e.t.ad || 'the Monument'}! Your nation will earn 10% more national points in this zone.`, 'seviye'); anitBirak(); }
    } finally { anitMesgul = false; }
  }
  function anitGuncelle() {
    if (!anit || !anitSaldir || anitMesgul || state.combat?.dead) return;
    const e = anit; if (!byId.has(e.t.id)) { anitBirak(); return; }
    const dx = e.t.x - player.position.x, dz = e.t.z - player.position.z, d = Math.hypot(dx, dz);
    const yay = C()?.takiliYay?.(), menzil = yay ? Math.min(30, C().yayMenzili?.() || 20) : 5;
    if (d > menzil) { if (!state.target) state.target = new THREE.Vector3(e.t.x - dx / d * (menzil - 1), 0, e.t.z - dz / d * (menzil - 1)); return; }
    state.target = null; state.yaw = Math.atan2(dx, dz);
    if (performance.now() - anitSon >= (C()?.saldiriAraligi?.() || 1000)) anitVur(e);
  }

  const ray = new THREE.Raycaster();
  return {
    group,
    get list() { return [...byId.values()]; },
    byId: (id) => byId.get(Number(id)),
    apply, remove, groundY,
    select(e) { selected = e || null; },
    /** sol tık: anıta tıklandıysa hedef al (düşman ya da tarafsız) */
    anitTikla(ev, camera, canvas) {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
      const h = ray.intersectObjects([...byId.values()].filter((e) => e.holder.visible && e.t.kind === 'anit').map((e) => e.hit), false)[0];
      const e = h?.object.userData.tower; if (!e) return false;
      if ((e.t.hp ?? e.t.max_hp) <= 0) return false;
      anit = e; anitSaldir = true; hedefCiz(e); hud?.info?.(`${adOf(e.t)} targeted.`, 'beceri'); return true;
    },
    anitBirak,
    /** Z: menzildeki anıt (hedef alınabilir) */
    get anitHedef() { return anit; },
    anitAday(p, menzil = 70) { for (const e of byId.values()) if (e.t.kind === 'anit' && (e.t.hp ?? e.t.max_hp) > 0) { const d = Math.hypot(e.t.x - p.x, e.t.z - p.z); if (d < menzil) return { e, d }; } return null; },
    anitSec(e) { anit = e; anitSaldir = false; hedefCiz(e); hud?.info?.(`${adOf(e.t)} targeted.`, 'beceri'); },
    /** R: seçili anıta saldırmaya başla / hareketle dur */
    anitSaldir() { if (!anit) return false; anitSaldir = true; hud?.info?.(`Basic Attack used → ${adOf(anit.t)}`, 'beceri'); return true; },
    anitDur() { anitSaldir = false; },
    /** yetenek sonucu (skill_use, hedef −kule id): hasar yazısı, can, yıkılış */
    anitSonuc(r) {
      const e = byId.get(Number(r.anit)); if (!e) return;
      C()?.floatText?.(e.holder.position.clone().add(new THREE.Vector3(0, Math.min(e.top, 6) + 0.5, 0)), String(r.damage), 'o', true);
      animOyna(e, 'struck');
      e.t.hp = r.anit_hp; e.t.max_hp = r.anit_max ?? e.t.max_hp; if (r.nation != null) e.t.nation = r.nation;
      if (anit === e) hedefCiz(e);
      if (r.ele) { e.t.sahip_ulus = r.sahip; hud?.notice?.(`You have destroyed ${e.t.ad || 'the Monument'}! Your nation will earn 10% more national points in this zone.`, 'seviye'); if (anit === e) anitBirak(); }
    },
    /** başka bir oyuncuya kule/muhafız atışı (net 'fx' k:'kule'): herkes aynı atışı görür */
    uzakAtes(id, hedefObj) { const e = byId.get(Number(id)); if (e && hedefObj) fire(e, hedefObj, null); },
    get selected() { return selected; },
    pick(ev, camera, canvas) {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
      const hits = ray.intersectObjects([...byId.values()].filter((e) => e.holder.visible).map((e) => e.hit), false);
      return hits[0]?.object.userData.tower || null;
    },
    update(dt, camPos) {
      for (const e of byId.values()) {
        const d = Math.hypot(e.holder.position.x - camPos.x, e.holder.position.z - camPos.z);
        // Ardream Anıtı yıkıldıysa (can 0) 1 saat sonra yeniden çıkana kadar görünmez
        e.holder.visible = d < 160 && !(e.t.kind === 'anit' && (e.t.hp ?? e.t.max_hp) <= 0);
        e.tag.visible = d < 60;
        if (e.api && d < 80) e.api.update(dt);
        if (e.ring.visible) e.ring.material.opacity = selected === e ? 0.9 : 0.5;
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i]; s.t += dt / 0.35;
        const to = s.hedefObj.position.clone().add(new THREE.Vector3(0, 1.3, 0));
        s.m.position.lerpVectors(s.from, to, Math.min(1, s.t)); s.m.position.y += Math.sin(Math.min(1, s.t) * Math.PI) * 1.5;
        s.m.lookAt(to);
        if (s.t >= 1) {
          s.m.removeFromParent(); shots.splice(i, 1); s.fx?.stop?.();
          const v = new THREE.Vector3(); state.efekt?.(101, s.hedefObj.position, { follow: () => v.copy(s.hedefObj.position), boyut: 0.7, enFazla: 2 });   // KO hedef efekti (fire_target0_1)
          s.onHit?.();
        }
      }
      checkT += dt; if (checkT > 0.3) { checkT = 0; check(); }
      anitGuncelle();
    },
  };
}
