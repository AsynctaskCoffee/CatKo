// KO NPC/mob efekt takıları (CN3FXPlug: NPC_Looks 16. sütun → Chr\*.n3fxplug): her parça bir .fxb efektini bir ekleme bağlar
// (konum = ofset × eklem matrisi, ölçek). Veri: assets/fxmob/fxplug.json (npc_<pid> → [{fx, j, p, s}]) + fxmob efekt kütüphanesi.
// Moblar, NPC'ler ve dönüşümler için ortak; model gizlenince (uzak, ölü) efekt de gizlenir.
import * as THREE from '../vendor/three.module.min.js';
import { fxEkle } from './fx.js';

const BASE = './assets/fxmob';
let PLUG = null, hazir = null;
// ek paket (assets/fxnpcek): sonradan orijinal KO dosyalarından eklenen NPC efektleri (ör. [Event Manager] Aset npc_9948 → npc_dk_2020_a001.fxb)
const EK = './assets/fxnpcek';
const yukle = () => (hazir ||= Promise.all([
  fetch(`${BASE}/fxplug.json`).then((r) => r.json()),
  fetch(`${EK}/fxplug.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  fxEkle(BASE), fxEkle(EK).catch(() => null),
]).then(([a, b]) => { PLUG = { ...a, ...b }; }).catch((e) => { console.warn('mob efektleri', e); PLUG = {}; }));
const aktif = new Set();
const _w = new THREE.Vector3();
const gorunur = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
setInterval(() => { for (const e of aktif) { if (!e.kok.parent) { e.dur(); continue; } const g = !gorunur(e.kok); for (const b of e.fx) if (b) b.gizli = g; } }, 250);

/** api: createNpc/createMonster sonucu; key: 'npc_<pid>'; fxm: FXManager (state.fx); olcek: modelin boyut çarpanı */
export async function mobFxTak(api, key, fxm, olcek = 1) {
  if (!api || !key) return null;
  await yukle();
  const parcalar = PLUG?.[key]; if (!parcalar?.length) return null;
  if (typeof fxm === 'function') { let f = fxm(); for (let i = 0; !f && i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); f = fxm(); } fxm = f; }   // efekt yöneticisi sonradan hazır olabilir
  if (!fxm) return null;
  for (let i = 0; i < 80 && !parcalar.every((p) => fxm.var?.(p.fx) !== false); i++) await new Promise((r) => setTimeout(r, 250));   // efekt kütüphanesi (ek paketler) hazır olsun
  if (api._mobFx) api._mobFx.dur();
  const fx = [], plugs = [], serbest = [];
  parcalar.forEach((p, i) => {
    const o = new THREE.Object3D(), k = 'mobfx' + i;
    api.setPlug(k, o, p.j, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p.p[0], p.p[1], p.p[2], 1]); plugs.push(k);
    if (!o.parent) { o.position.set(p.p[0], p.p[1], p.p[2]); api.group.add(o); serbest.push(o); }   // eklem modelde yoksa gövdeye bağla (dünya merkezinde kalmasın)
    const at = () => { o.updateWorldMatrix(true, false); _w.setFromMatrixPosition(o.matrixWorld); return new THREE.Vector3(_w.x, _w.y, -_w.z); };
    // KO CN3FXPlugPart: takı ölçeği efekte her zaman uygulanır (bundle dependScale kapalı olsa da; ör. Burning Skeleton alevleri 0.3–0.8)
    const b = fxm.play(p.fx, { loop: true, scale: 1, boyut: olcek * (p.s || 1), follow: at });
    fx.push(b);
  });
  const e = { kok: api.group, fx, dur() { aktif.delete(e); for (const b of fx) b?.dispose?.(); for (const k of plugs) api.setPlug(k, null); for (const o of serbest) o.removeFromParent(); api._mobFx = null; } };
  aktif.add(e); api._mobFx = e;
  return e;
}
