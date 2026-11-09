// Haritadaki NPC'ler. Yerleşim Supabase'deki npc_placements tablosunda (GM'ler düzenler, değişiklikler Realtime ile
// herkese yansır); tablo okunamazsa sitedeki assets/npc_<bölge>.json kullanılır (düzenlenemez).
// Modeller Supabase Storage'da (zones/npc/). Yakındakiler canlandırılır; GM'ler üstlerinde yeşil NPC kimliğini görür.
import * as THREE from '../vendor/three.module.min.js';
import { mobFxTak } from './mobfx.js';
import { mobSilahTak } from './mob-silah.js';
import { fxEkle, fxEnDusuk, fxSadeceKart } from './fx.js';
import { loadNpcMeta, createNpc } from './character.js';

const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const HIT_GEO = new THREE.CylinderGeometry(0.55, 0.55, 2, 8).translate(0, 1, 0);
const RING_GEO = new THREE.RingGeometry(0.7, 0.85, 32).rotateX(-Math.PI / 2);
let secimIsaret = null;
const RING_MAT = new THREE.MeshBasicMaterial({ color: 0x7dff7a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
const STUB_MAT = new THREE.MeshLambertMaterial({ color: 0x8a7a60, transparent: true, opacity: 0.55 });

const fromRow = (r) => ({ pid: r.id, id: r.npc_id, m: r.model, n: r.name, x: r.x, z: r.z, d: r.dir || 0, s: r.size || 100, e: r.etiket || '', ec: r.etiket_renk || '' });
// GM etiketi: NPC adının hemen üstünde, seçilen renkte yazı
function etiketYaz(tag, n) {
  const el = tag?.userData?.el; if (!el) return;
  let k = el.querySelector('.npc-etiket');
  if (!n.e) { k?.remove(); return; }
  if (!k) { k = document.createElement('div'); k.className = 'npc-etiket'; const a = el.querySelector('.ad'); if (a) a.before(k); else el.prepend(k); }
  k.textContent = n.e; k.style.color = n.ec || '#ffd76a'; el._h = null;
}

export async function spawnNpcs({ zone, world, state, nameSprite, remoteBase, showIds = false, namesOn = () => true, sb = null, onChange = () => {} }) {
  let rows = null, editable = false;
  if (sb) {
    // Monster Stone yuvası: haritanın (in_dungeon0N) kalıcı NPC'leri de (KO: Halber / Ruber / National Enchanter — deadsoft MonsterStoneSystem)
    const msh = /^ms([1-3])_/.exec(zone), bolgeler = msh ? [zone, 'in_dungeon0' + msh[1]] : [zone];
    const { data, error } = await sb.from('npc_placements').select('id,npc_id,model,name,x,z,dir,size,etiket,etiket_renk').in('zone', bolgeler).limit(5000);
    if (!error && data) { rows = data.map(fromRow); editable = true; }
  }
  if (!rows || (!rows.length && !editable)) {
    const r = await fetch(`./assets/npc_${zone}.json`).catch(() => null);
    if (r?.ok) { rows = (await r.json()).npcs.map((n) => ({ pid: null, ...n })); editable = false; }
  }
  rows ||= [];
  // klan görev arenaları (klanq_<boss>_<klan>): giriş noktasının yanında ışınlayıcı NPC (Moradon'a / ulus kalesine dönüş)
  const ARENA_GIRIS = { caitharos: [150, 150], isiloon: [62, 478], felankor: [106, 18] };
  const ag = /^klanq_/.test(zone) ? ARENA_GIRIS[zone.split('_')[1]] : null;
  if (ag && !rows.some((r) => r.id === 900201)) rows.push({ pid: null, id: 900201, m: 'npc_25240', n: '[Teleporter] Arena Rehberi', x: ag[0] + 3, z: ag[1] + 3, d: 225, s: 100, e: '', ec: '' });
  // Monster Stone ulus kapıları (başlangıç alanı; haritanın kendi kapı nesnesi + efekti görünür): üstteki El Morad (mavi), alttaki Karus (kırmızı) — NPC modelsiz tıklama alanı
  // Kapı mobları (Gate 7032-7034) ayrı: ms_dogum ile canavar olarak doğar, yalnız hedef alınır.
  const MS_ULUS_KAPI = { 1: [[203.8, 206.87], [203.13, 189.37]], 2: [[203.8, 206.87], [203.13, 189.68]], 3: [[203.8, 212.66], [203.13, 189.68]] }, msg = /^ms([1-3])_/.exec(zone);
  if (msg) MS_ULUS_KAPI[msg[1]].forEach(([gx, gz], i) => { if (!rows.some((r) => r.id === 900206 + i)) rows.push({ pid: null, id: 900206 + i, m: '', gizli: true, n: 'Gate', x: gx, z: gz, d: 0, s: 160, e: '', ec: '' }); });
  const meta = await loadNpcMeta(`${remoteBase}/npc`).catch(() => null);
  // KO guidefx.tbl: dükkân / han / tüccar NPC'lerinin başında dönen simgeler (silah, zırh, iksir, han…) — efektler uzak fxguide paketinde
  // White Shadow Captain Sirin (31526): z_chaosss_npc__all simgesi modelin içinde kalıyor → 2 m yukarı
  const REHBER_EK = { 31526: 2, 19073: 1.3 };   // Shozin: halka (3,2 m) ismin üstünde kalsın
  const KAMERA_SIMGE = new Set([19073]);   // simge kameraya döner (dönmez)
  const SABIT_SIMGE = new Set([31526, 25177, 16085, 29056]);   // White Shadow Captain Sirin, Iruta, Peddler Hemes, Vendor Kayra: simge dönmez
  const TERS_SIMGE = new Set([25177, 16085, 29056, 31526]);   // + White Shadow Captain Osiris: kanat simgesi 180° çevrik
  const REHBER = await fetch('./assets/fxmob/guidefx.json').then((r) => r.json()).catch(() => ({}));
  // KO 2009+ (deadsoft z_npc_fx_mark022) 3B simgeler yerel pakette: iksir şişesi (iksirci), sandık (han/depo, sundries), balta (silahçı), zırh (zırhçı)
  const rehberHazir = Promise.all([fxEkle(`${remoteBase}/fxguide`).catch(() => null), fxEkle('./assets/fxrehber').catch(() => null)]);
  fxEkle(`${remoteBase}/fxzone`).catch(() => null);   // bölge + bazı NPC takı efektleri (ör. El Morad Raiba bekçi taşı)
  const _rw = new THREE.Vector3();
  const rehberFx = (e) => {
    const fxId = REHBER[e.n.id]; if (!fxId || e.rehber) return;
    const kayit = e.rehber = { b: null, bitti: false };
    rehberHazir.then(async () => {
      for (let i = 0; i < 120 && !kayit.bitti && !(state?.fx?.var?.(fxId)); i++) await new Promise((r) => setTimeout(r, 500));
      if (kayit.bitti || !state?.fx?.var?.(fxId)) return;
      // KO: simge NPC'nin başının üstünde (efektin kendi yüksekliği yoksa); yere yapışık parçalar da aynı yükseklikte
      const ek = REHBER_EK[e.n.id] || 0;   // NPC'ye özel ek yükseklik (m)
      const dy = () => Math.max(0, (e.top || 2.2) + 1.7 + ek - fxEnDusuk(fxId));   // simgenin alt ucu isim etiketinin ~1 m üstünde (dip dibe kalmaz)
      const at = () => { e.holder.updateWorldMatrix(true, false); _rw.setFromMatrixPosition(e.holder.matrixWorld); return new THREE.Vector3(_rw.x, _rw.y + dy(), -_rw.z); };
      // KO: NPC simgeleri kendi ekseni etrafında yavaşça döner (bu NPC'ler hariç)
      // Iruta / Peddler Hemes / Vendor Kayra: kanat simgesi 180° ters (Y ekseni) — sabit, dönmez
      // [Disciple of Hepa] Shozin: KO'da çekiç + dişli halka simgesi dönmez, hep kameraya bakar (halka kendi düzleminde döner)
      const kam = state?.fx?.camera, _kq = new THREE.Quaternion(), _ky = new THREE.Vector3(0, 1, 0);
      if (KAMERA_SIMGE.has(Number(e.n.id)) && kam) {
        kayit.b = state.fx.play(fxId, { loop: true, follow: at, ground: () => at().y, yon: () => { const a = at(); return _kq.setFromAxisAngle(_ky, -Math.atan2(kam.position.x - a.x, kam.position.z + a.z)); } });
        return;
      }
      const yon = TERS_SIMGE.has(Number(e.n.id)) ? (() => { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); return () => q; })() : SABIT_SIMGE.has(Number(e.n.id)) || fxSadeceKart(fxId) ? null : (() => { const q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), t0 = performance.now(); return () => q.setFromAxisAngle(Y, ((performance.now() - t0) / 1000) * 0.9); })();
      kayit.b = state.fx.play(fxId, { loop: true, follow: at, ground: () => at().y, ...(yon ? { yon } : {}) });
      // White Shadow Captain (z_chaosss_npc__all.fxb): orijinal fxb'de El Morad (elmo) ve Karus (karu) kanatlarının ömrü 0 = kalıcı;
      // karu 4,1 sn sonra belirir ve ikisi üst üste sabit kalır (sırayla değişmez)
      if (/chaosss_npc/i.test(String(fxId))) kayit.b?.parts?.forEach((x) => { if (x.p.type === 3 && x.p.life) x.p = { ...x.p, life: 0 }; });
      // simge modelleri (sandık, şişe, zırh…) normal saydamlıkla çiziliyor ama derinlik yazmıyordu → içleri / arka yüzleri görünüyordu
      // kartlar (eski KO simgeleri) arka yüzden de görünmeli: ön yüz kırpması yalnız 3B simgelerde
      // KO render bayrağı RF_NOTZWRITE (0x100) olan parçalar (ör. Moira / etkinlik simgelerindeki 6 ışın: muder_a02 sword_a04/a06) derinlik yazmaz ve iki yüzlü kalır:
      // önceden onlar da katı yapılıyordu → yandan bakınca düz çubuk gibi görünüyordu
      if (!fxSadeceKart(fxId)) for (const x of kayit.b?.parts || []) { if (x.p.type !== 3 || (x.p.flags & 0x100)) continue; x.obj?.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material || [])) if (m.blendDst === THREE.OneMinusSrcAlphaFactor) { m.depthWrite = true; m.side = THREE.FrontSide; m.needsUpdate = true; } }); }
    });
  };
  // KO 2369 görev işaretleri (deadsoft fx.tbl): 30501 sarı "?" alınabilir yeni görev, 30502 sarı "!" süren görev,
  // 30503 yeşil "!" tamamlanan (teslim edilebilir) görev — assets/fxquest
  // Güncel KO (KnightOnlineEn fx.tbl 13068 / 13069): alınabilir görev obj_mora_fx_qy1 (sarı "?", büyük sarı hale, 8 ışın, parıltı),
  // teslim edilebilir görev obj_mora_fx_ay1 (yeşil "!", turkuaz hale, 8 ışın) — assets/fxquest2. Süren görev eski sarı "!" (30502).
  const ISARET = { yeni: 13068, devam: 30502, bitti: 13069 };
  const ISARET_UST = { 13068: 2.1, 13069: 2.1 };   // büyük haleli işaretler isim etiketinin daha üstünde
  const isaretHazir = Promise.all([fxEkle('./assets/fxquest').catch(() => null), fxEkle('./assets/fxquest2').catch(() => null)]);
  const isaretGuncelle = async (e) => {
    const t = state?.gorev?.isaret?.(Number(e.n.id)) || null, fxId = t && ISARET[t];
    if ((e.isaret?.fx || null) === (fxId || null)) return;
    e.isaret?.b?.dispose?.(); e.isaret = fxId ? { fx: fxId, b: null } : null;
    if (!fxId) return;
    const kayit = e.isaret; await isaretHazir;
    if (e.isaret !== kayit || !state?.fx?.var?.(fxId)) return;
    const ust = () => (e.top || 2.2) + (ISARET_UST[fxId] || 1.2) + (e.rehber ? 1.4 : 0);   // isim etiketinin üstü; dükkân simgesi varsa onun da üstü
    const at = () => { e.holder.updateWorldMatrix(true, false); _rw.setFromMatrixPosition(e.holder.matrixWorld); return new THREE.Vector3(_rw.x, _rw.y + ust(), -_rw.z); };
    // KO birebir: quest_first / quest_third / quest_second.fxb kendi hâliyle — şeklin dönüş / süzülme / nabız anahtarları, parlama parçacığı ve 20 fps hale kartı (ek dönüş ya da saydamlık yok)
    kayit.b = state.fx.play(fxId, { loop: true, follow: at, ground: () => at().y });
  };
  setInterval(() => { if (!state?.gorev?.isaret) return; for (const e of list) { isaretGuncelle(e); if (e.isaret?.b) e.isaret.b.gizli = !gorunurMu(e.holder) || window.koSecenek?.npcFx === false; } }, 1000);   // Use NPC FX
  const gorunurMu = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return !!o.parent; };
  setInterval(() => { for (const e of list) if (e.rehber?.b) e.rehber.b.gizli = !gorunurMu(e.holder) || window.koSecenek?.npcFx === false; }, 300);
  const group = new THREE.Group(); group.name = 'npcs'; world.add(group);
  const list = [];
  const byPid = new Map();
  let selected = null;
  const ring = new THREE.Mesh(RING_GEO, RING_MAT); ring.renderOrder = 2; ring.visible = false;
  // (2.11) KO: NPC seçiminde de canavar / oyuncu seçimindeki yeşil hedef halkası (target_symbol_plane — assets/ui/secek/hedef1.webp)
  { const t = new THREE.TextureLoader().load(new URL('../assets/ui/secek/hedef1.webp', import.meta.url).href); t.colorSpace = THREE.SRGBColorSpace;
    ring.geometry = new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2);
    ring.material = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); ring.renderOrder = 5; }
  secimIsaret = import('./fx-secim.js').then(({ secimTakip }) => secimTakip(state, '2009_select_friend.fxb'));

  const groundY = (x, z) => {
    let y = state.heightAt(x, z);
    if (state.col) { const yc = state.col.heightNear(x, y + 2, z); if (yc > y && yc < y + 4) y = yc; }
    return y;
  };
  const place = (e) => {
    e.holder.position.set(e.n.x, groundY(e.n.x, e.n.z), e.n.z);
    e.holder.rotation.y = (e.n.d || 0) * Math.PI / 180;
  };
  const fitTag = (e) => {
    const s = (e.n.s || 100) / 100;
    let top = 2.2 * s, gen = 0;
    if (e.api) {
      e.holder.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(e.api.group, true);
      const base = e.holder.getWorldPosition(new THREE.Vector3()).y;
      if (!b.isEmpty()) { const t = b.max.y - base; if (t > 0.3 && t < 12) top = t;
        // geniş nesne NPC'ler (Chaotic Generator vb.): tıklama alanı modelin genişliğini kapsar
        const yc = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2, w = yc / 0.55; if (w > 0 && w < 40) { gen = w * 0.9; e.yaricap = yc; } }
    }
    e.tag.position.y = top + 0.3; e.top = top;
    const g = Math.max(0.6, s, gen);
    e.hit.scale.set(g, Math.max(0.5, top / 2), g);
  };
  const loadModel = (e) => {
    if (e.stub) { e.stub.removeFromParent(); e.stub = null; }
    if (e.api) { e.api._mobFx?.dur(); e.api.group.removeFromParent(); e.api = null; }
    const mk = ++e.gen;
    const stub = () => {
      if (mk !== e.gen) return;
      e.stub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.8, 10).translate(0, 0.9, 0), STUB_MAT); e.holder.add(e.stub); fitTag(e);
    };
    if (e.n.gizli) { fitTag(e); return; }   // modelsiz NPC (ör. Monster Stone kapısı: haritanın kendi kapı nesnesi görünür, NPC yalnız tıklama alanı + isim)
    if (!meta || !e.n.m) return stub();
    createNpc(e.n.m).then((api) => {
      if (mk !== e.gen) return;
      if (!api) return stub();
      const s = (e.n.s || 100) / 100;
      api.group.scale.set(s, s, s);
      e.holder.add(api.group); e.api = api; fitTag(e);
      mobFxTak(api, e.n.m, () => state?.fx, s);   // KO n3fxplug efektleri (anıtlar, kuleler, mancınıklar…)
      mobSilahTak(api, { pid: Number(String(e.n.m).replace(/^npc_/, '')), sid: e.n.id, npc: true }).catch(() => {});   // KO NPC silahı (K_NPC iWeapon1/2: muhafız mızrağı / kalkanı…)
    }).catch(stub);
  };

  function add(n) {
    const holder = new THREE.Group();
    group.add(holder);
    const e = { n, holder, api: null, stub: null, tag: null, hit: null, gen: 0 };
    holder.userData.npc = e;
    e.tag = nameSprite(n.n, '#ffffff', { kind: 'npc' }); holder.add(e.tag); etiketYaz(e.tag, n);
    if (showIds) { const g = document.createElement('div'); g.className = 'npc-id'; g.textContent = String(n.id); e.tag.userData.el.prepend(g); }   // GM: yeşil NPC kimliği
    e.hit = new THREE.Mesh(HIT_GEO, HIT_MAT); e.hit.userData.npc = e; holder.add(e.hit);
    place(e); fitTag(e); loadModel(e); rehberFx(e);
    list.push(e); if (n.pid != null) byPid.set(n.pid, e);
    return e;
  }
  function remove(e) {
    if (!e) return;
    e.gen++;
    e.api?._mobFx?.dur(); if (e.rehber) { e.rehber.bitti = true; e.rehber.b?.dispose?.(); e.rehber = null; } if (e.isaret) { e.isaret.b?.dispose?.(); e.isaret = null; } e.tag.removeFromParent(); e.holder.removeFromParent();
    const i = list.indexOf(e); if (i >= 0) list.splice(i, 1);
    if (e.n.pid != null) byPid.delete(e.n.pid);
    if (selected === e) select(null);
  }
  function apply(n) {   // konum/yön/model değişikliği (yerel önizleme ya da Realtime)
    const e = byPid.get(n.pid); if (!e) return add(n);
    const modelChanged = n.m !== e.n.m;
    Object.assign(e.n, n);
    place(e);
    // boyut: model yeniden yüklenmeden anlık ölçeklenir (GM düzenleme penceresinde kaydırıcıyla canlı önizleme)
    { const sc = (e.n.s || 100) / 100;
      if (!modelChanged && e.api && Math.abs(e.api.group.scale.x - sc) > 1e-4) { if (e.api._mobFx) loadModel(e); else { e.api.group.scale.set(sc, sc, sc); fitTag(e); } if (selected === e) select(e); }
      else if (!modelChanged && e.stub && !e.api) fitTag(e); }
    if (e.tag.userData.el) { const ad = e.tag.userData.el.querySelector('.ad'); if (ad && ad.textContent !== n.n) ad.textContent = n.n; }
    etiketYaz(e.tag, e.n);
    if (modelChanged) loadModel(e);
    return e;
  }
  function select(e) {
    selected = e || null;
    ring.removeFromParent();
    ring.visible = !!e;
    if (e) { const s = Math.max(0.8, (e.n.s || 100) / 100); ring.scale.set(s, 1, s); ring.position.y = 0.08; e.holder.add(ring); }
    // KO: seçili NPC altında deadsoft 2009_select_friend.fxb (yeşil)
    secimIsaret.then((h) => { if (true || !e) return h.gizle(); const hp = e.holder, s = Math.max(0.8, Math.min(2.5, (e.n.s || 100) / 100)); const q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0); h.goster(() => (hp.parent ? hp.position : null), s, { yon: () => q.setFromAxisAngle(Y, hp.rotation.y) }); });   // ok NPC'nin konum ve yönünü izler
  }
  // deneme korkulukları (19067-19072) artık saldırılabilir canavar (monsters/spawners) olarak doğar; NPC olarak çizilmez
  const MOB_NPC = new Set([19067, 19068, 19069, 19070, 19071, 19072]);
  for (const n of rows) if (!MOB_NPC.has(Number(n.id))) add(n);

  // Realtime: GM değişiklikleri herkese
  if (sb && editable) {
    sb.channel('npc-yerlesim-' + zone).on('postgres_changes', { event: '*', schema: 'public', table: 'npc_placements' }, (p) => {
      if (p.eventType === 'DELETE') { remove(byPid.get(p.old?.id)); onChange(); return; }
      const r = p.new; if (!r || r.zone !== zone) return;
      if (api.isLocked?.(r.id)) return;                // bu GM'in kendi düzenlemesi sürüyor → eski yankıyı yok say
      apply(fromRow(r)); onChange();
    }).subscribe();
  }

  const ray = new THREE.Raycaster();
  const api = {
    group, list, editable,
    get selected() { return selected; },
    add, remove, apply, select, groundY,
    byPid: (pid) => byPid.get(pid),
    /** ekrandaki bir noktadaki NPC (en yakın) */
    pick(e, camera, canvas) {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      // KO: şehir / köy anıtları (El Morad, Luferson, Asga, Raiba, Doda, Laon, Linate, Bellua … Monument) tıklanmaz (GM görünümünde düzenlenebilir)
      const hits = ray.intersectObjects(list.filter((x) => x.holder.visible && (showIds || !/\bmonument\s*$/i.test(x.n?.n || ''))).map((x) => x.hit), false);
      return hits[0]?.object.userData.npc || null;
    },
    update(dt, camPos) {
      for (const e of list) {
        const d = Math.hypot(e.holder.position.x - camPos.x, e.holder.position.z - camPos.z);
        e.holder.visible = (d < 110 || e === selected) && !e.oluGizli && !e.logosGizli;   // logosGizli: Spirit of Logos bu dönem başka yerde (logos.js)   // oluGizli: ölmüş muhafız (muhafiz.js) doğana dek görünmez
        e.tag.visible = (d < 60 || e === selected) && namesOn() && !e.logosGizli;   // isimler yakındaki NPC'lerde (KO: ~60 m)
        if (e.api && d < 60) e.api.update(dt, e.animHiz || 1);   // animHiz: ör. Chaotic Generator üretim sırasında hızlı döner
      }
      if (ring.visible) ring.material.opacity = 0.55 + 0.3 * Math.sin(performance.now() / 250);
    },
  };
  return api;
}
