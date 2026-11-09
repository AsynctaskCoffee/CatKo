// KO Moradon sıralama heykelleri (moradon.opd: moraranker_ka_a1–a3 Karus 790/782/774, moraranker_el_a1–a3 El Morad 842/850/858; z 561).
// Her kaide: üst disk y +2,92 (yerel), ön yüz −z (ad levhası moraranker_a003: x ±1,59, y 2,06–2,53, z −1,73).
// Her ulusun ulus puanı en yüksek 3 karakteri (sunucu heykel_liste) kendi ırkı, yüzü, saçı ve kuşanılı eşyalarıyla kaidenin üstünde
// donmuş bir duruşta durur; adı kaidenin ön levhasında yazar. Liste 10 dakikada bir yenilenir.
import * as THREE from '../vendor/three.module.min.js';
import { createCharacter } from './character.js';
import { kusanilanlar } from './envanter.js';

const KAIDE = { 1: [[790, 561], [782, 561], [774, 561]], 2: [[842, 561], [850, 561], [858, 561]] };
const KAIDE_Y = 4.741 + 2.92;
const DURUS = ['sec0', 'breath', 'stand'];   // KO heykel: savaş duruşu varsa o, yoksa bekleme

function levha(ad) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 76;
  const g = c.getContext('2d');
  g.fillStyle = '#0d0f12'; g.fillRect(0, 0, 512, 76);
  g.strokeStyle = '#8c8f96'; g.lineWidth = 3; g.strokeRect(4, 4, 504, 68);
  g.font = 'bold 40px Verdana, Tahoma, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#c9ccd2'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText(ad, 256, 40, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.45), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  return m;
}

export function heykeller({ sb, world, state, serverId }) {
  const grup = new THREE.Group(); grup.name = 'heykeller'; world.add(grup);
  let anahtar = '';
  async function kur() {
    const { data } = await sb.rpc('heykel_liste', { p_server: serverId || 1 });
    const L = Array.isArray(data) ? data : [];
    const k = JSON.stringify(L.map((h) => [h.id, h.nation, h.sira, (h.eq || []).map((e) => e.item_num)]));
    if (k === anahtar) return; anahtar = k;
    for (const c of [...grup.children]) { grup.remove(c); c.traverse?.((o) => { o.material?.map?.dispose?.(); }); }
    await state.gearReady;
    for (const h of L) {
      const yer = KAIDE[h.nation]?.[(h.sira || 1) - 1]; if (!yer) continue;
      const [x, z] = yer;
      const tut = new THREE.Group(); tut.position.set(x, KAIDE_Y, z); grup.add(tut);
      const lv = levha(h.name); lv.position.set(x, 4.741 + 2.3, z - 1.76); grup.add(lv);   // dünya z-aynalı: döndürmeden yazı önden düz okunur
      try {
        const api = await createCharacter(h.race, { face: h.face ?? 0, hair: h.hair ?? 0, sacRenk: h.sac_renk ?? null });
        if (!api) continue;
        api.fxOk = true;
        tut.add(api.group);
        tut.rotation.y = Math.PI;   // ön yüze (−z, meydana) dönük
        tut.scale.setScalar(1.82);   // heykel karakterleri: önce %30, sonra %40 daha büyük (1,3 × 1,4)
        const eq = kusanilanlar(h.eq || []);
        if (state.donanim) await state.donanim.applyGear(api, h.race, state.donanim.gearCodes(eq), true).catch(() => {});
        const c = DURUS.find((n) => api.has?.(n)) || 'breath';
        api.setClip(c); api.update(0.6);   // duruş tek kare: heykel donuk
      } catch (e) { console.warn('heykel', h.name, e); }
    }
  }
  kur().catch((e) => console.warn('heykeller', e));
  const iv = setInterval(() => kur().catch(() => {}), 600000);
  return { kapat() { clearInterval(iv); world.remove(grup); } };
}
