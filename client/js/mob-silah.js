// KO canavar / NPC silahları (CPlayerNPC): sunucu K_MONSTER / K_NPC iWeapon1 sağ ele (NPC_Looks iJointRH), iWeapon2 sol ele
// (iJointLH; yay / kalkan gibi sol kola takılanlar iJointLH2). Veri: assets/mobsilah/silah.json (tools/convert/mob-silah.mjs)
//   { j: {pid: [rh, lh, lh2]}, m: {mob sid: [w1, w2]}, n: {npc sid: [w1, w2]}, p: {pid: [w1, w2]} }
// Silah modeli oyuncu eşyalarıyla aynı (Item_Org dwIDResrc → CN3CPlug); canavar ölçeği silaha da uygulanır (KO'daki gibi).
import { gearCodes, plugAdi, donanimHazir, weaponGlow, rebUygula } from './donanim.js';
import { createPlug, silahFor, createKanat } from './character.js';
import * as THREE from '../vendor/three.module.min.js';

let VERI = null;
const veri = () => (VERI ||= fetch(new URL('../assets/mobsilah/silah.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null));

/** api: createMonster / createNpc sonucu; pid: görünüm (npc_<pid>); sid: canavar / NPC kimliği (yoksa pid'in ilk silahlı canavarı) */
export async function mobSilahTak(api, { pid, sid = null, npc = false } = {}) {
  if (!api?.setPlug || !pid) return false;
  const V = await veri(); if (!V) return false;
  const J0 = V.j[pid]; if (!J0) return false;
  // NPC_Looks el eklemleri KO'nun standart iskeletine göre (12 sağ el ucu, 7 sol el ucu, 5 sol dirsek); farklı iskeletli modellerde
  // (ör. [Eslant Wise] Pablo: 12 = joint62, 7 = L_e) bu numaralar başka kemiğe denk gelir → yalnız el / bilek / uç kemiklerine takılır
  const ad = (i) => String(api.eklemAdlari?.[i] ?? '');
  const el = (i) => !api.eklemAdlari || /end_?site|wrist|hand/i.test(ad(i)), kol = (i) => !api.eklemAdlari || /end_?site|wrist|hand|elbow/i.test(ad(i));
  const J = [el(J0[0]) ? J0[0] : -1, el(J0[1]) ? J0[1] : -1, kol(J0[2]) ? J0[2] : -1];
  if (J[0] < 0 && J[1] < 0) return false;
  const W = (sid != null && (npc ? V.n : V.m)[sid]) || (sid == null || !npc ? V.p[pid] : null); if (!W) return false;
  for (let i = 0; i < 50 && !donanimHazir(); i++) await new Promise((r) => setTimeout(r, 200));   // eşya kataloğu oyuna girişte yükleniyor olabilir
  let takildi = false;
  for (const [k, w0] of W.entries()) {
    // silah: eşya numarası ya da [numara, rebirth derecesi] (ör. [Event Manager] Aset: Dark Knight Spear(+11) rebirth)
    const num = Array.isArray(w0) ? w0[0] : w0, reb = Array.isArray(w0) ? Number(w0[1]) || 0 : 0;
    if (!num) continue;
    const yuva = k === 0 ? 6 : 8, key = 'yuva' + yuva;
    // Item_Org kaynağı ana eşyada (numaranın son 3 hanesi 000); Item_Ext satırı (num - org) eşyanın kendi efektini verir
    const kod = gearCodes([{ slot: yuva, org: Math.floor(num / 1000) * 1000, num, reb }])[0]; const res = kod?.[1]; if (!res) continue;
    const fx = kod[3] || 0;
    const pad = plugAdi(res);
    if (pad) {
      const p = await createPlug(pad).catch(() => null); if (!p) continue;
      const pj = Number(p.info.joint);
      const j = yuva === 6 ? J[0] : (pj === 5 || pj === 6) && J[2] > 0 ? J[2] : J[1];
      if (j == null || j < 0) continue;
      api.setPlug(key, p.obj, j, p.info.m); takildi = true;
      try { rebUygula(api, key, p.obj, reb); if (fx) weaponGlow(api, yuva, 0, fx, p.info.m, pad); } catch {}   // rebirth parıltısı + eşyanın KO silah efekti
      continue;
    }
    // KO 2369 animasyonlu silah (kendi iskeleti olan model)
    const name = `${Math.floor(res / 1e7)}_${String(Math.floor(res / 1e3) % 1e4).padStart(4, '0')}_${String(Math.floor(res / 10) % 100).padStart(2, '0')}_${res % 10}`;
    const ani = silahFor(name); if (!ani) continue;
    const w = await createKanat(ani[0]).catch(() => null); if (!w) continue;
    const g = new THREE.Group(); g.add(w.group);
    const ja = yuva === 6 ? J[0] : J[1]; if (ja < 0) continue;
    api.setPlug(key, g, ja, ani[2]);
    api.addExtra?.((dt) => { w.setClip('breath'); w.update(dt); });
    try { rebUygula(api, key, w.group, reb); if (fx) weaponGlow(api, yuva, 0, fx, ani[2], name); } catch {}
    takildi = true;
  }
  return takildi;
}
