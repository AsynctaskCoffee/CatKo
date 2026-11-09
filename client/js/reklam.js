// Reklam alanları (GM paneli → Reklam alanı): haritaya asılan bayraklar (ör. Moradon kapısındaki BAYRAK-ALANI-1 / 2).
// Sunucu: reklam_alanlari (kod, zone, x/y/z KO koordinatı = bayrağın alt orta noktası, yaw, genislik, yukseklik, gorsel, aktif).
// Görsel yoksa varsayılan MineKO bayrağı (assets/reklam/bayrak-mineko.webp, dikey). Bayrak üstte altın bir çubuğa asılı kumaş:
// alt kısmı rüzgârda hafifçe dalgalanır, ışık alır. Değişiklikler (GM kaydı) anında tüm oyunculara yansır (realtime).
import * as THREE from '../vendor/three.module.min.js';

export const VARSAYILAN_GORSEL = './assets/reklam/bayrak-mineko.webp';
const PX_M = 150;   // önerilen görsel çözünürlüğü: metre başına piksel
/** GM'e önerilen görsel ölçüsü (dikey bayrak oranı) */
export const onerilenOlcu = (gen, yuk) => ({ w: Math.round(gen * PX_M), h: Math.round(yuk * PX_M) });

const yukleyici = new THREE.TextureLoader();
const dokular = new Map();
function doku(src) {
  const k = src || VARSAYILAN_GORSEL;
  if (!dokular.has(k)) {
    const t = yukleyici.load(k.startsWith('data:') || /^https?:/.test(k) ? k : (window.KO_V ? window.KO_V(k) : k));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    dokular.set(k, t);
  }
  return dokular.get(k);
}

function bayrakKur(r) {
  const gen = Number(r.genislik) || 4.4, yuk = Number(r.yukseklik) || 11;
  const g = new THREE.Group(); g.name = 'reklam:' + r.kod;
  // kumaş
  const geo = new THREE.PlaneGeometry(gen, yuk, 10, 26);
  const taban = Float32Array.from(geo.attributes.position.array);
  const mat = new THREE.MeshStandardMaterial({ map: doku(r.gorsel), side: THREE.DoubleSide, roughness: 0.82, metalness: 0, emissive: 0x241010, emissiveIntensity: 0.35, transparent: false, alphaTest: 0.35 });   // saydam kenarlar (yırtık kumaş) kesik, derinlik sıralaması sorunsuz
  const kumas = new THREE.Mesh(geo, mat); kumas.position.y = yuk / 2; kumas.castShadow = false; g.add(kumas);
  // (asma çubuğu görselin kendisinde çizili — ayrı model yok)
  g.position.set(Number(r.x), Number(r.y), Number(r.z));
  g.rotation.y = Number(r.yaw) || 0;
  const faz = Math.random() * 10;
  let n = 0;
  g.userData.tik = (t) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = taban[i], y = taban[i + 1], k = Math.pow((yuk / 2 - y) / yuk, 1.3);   // üst sabit, aşağı indikçe serbest
      // dalga: üstten aşağı yayılan kumaş dalgası + yatay kıvrım (duvara değmesin diye derinlik ±0,22 m ile sınırlı)
      const e = 0.12 + 0.88 * k;
      p[i + 2] = e * (0.13 * Math.sin(t * 1.9 + faz - y * 0.55 + x * 0.8) + 0.07 * Math.sin(t * 1.1 + faz * 0.5 - y * 0.27) + 0.03 * Math.sin(t * 3.3 + x * 2.1 + y))
        // (6.11) alt kısım ileri-geri sarkaç salınımı (yalnız öne, duvardan uzağa: 0…0,5 m, aşağı indikçe artar)
        + Math.pow(k, 1.6) * (0.25 + 0.25 * Math.sin(t * 1.15 + faz * 0.7 - y * 0.12));
      p[i] = x + k * (0.06 * Math.sin(t * 1.3 + faz - y * 0.35) + 0.02 * Math.sin(t * 2.7 + y * 0.9));
      p[i + 1] = y - k * 0.02 * (1 + Math.sin(t * 1.9 + faz - y * 0.55));
    }
    geo.attributes.position.needsUpdate = true;
    if ((n++ & 1) === 0) geo.computeVertexNormals();
  };
  g.userData.birak = () => { geo.dispose(); mat.dispose(); };
  return g;
}

export function initReklam({ sb, world, zone }) {
  const kok = new THREE.Group(); kok.name = 'reklam'; world.add(kok);
  const canli = new Map();   // id → group
  let satirlar = [];
  const kur = () => {
    for (const g of canli.values()) { kok.remove(g); g.userData.birak?.(); }
    canli.clear();
    for (const r of satirlar) if (r.aktif && r.zone === zone) { const g = bayrakKur(r); kok.add(g); canli.set(r.id, g); }
  };
  const yukle = async () => {
    try { const { data } = await sb.from('reklam_alanlari').select('*').eq('zone', zone); satirlar = data || []; } catch { satirlar = []; }
    kur();
  };
  yukle();
  try { sb.channel('reklam-' + zone).on('postgres_changes', { event: '*', schema: 'public', table: 'reklam_alanlari' }, () => yukle()).subscribe(); } catch {}
  let raf = 0;
  const dongu = (ms) => { raf = requestAnimationFrame(dongu); if (document.hidden || !canli.size) return; const t = ms / 1000; for (const g of canli.values()) g.userData.tik(t); };
  raf = requestAnimationFrame(dongu);
  return { yenile: yukle, kapat: () => { cancelAnimationFrame(raf); kok.removeFromParent(); } };
}
export { bayrakKur as bayrakOlustur };
