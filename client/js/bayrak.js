// KO kale klan bayrakları: El Morad / Luferson kalesindeki bayrak direklerinde (flagpole_*_01_2006) ulusun ilk 5 klanı sıralanır.
// Sol ve sağ sıradaki karşılıklı direklerde aynı klanın yatay, dalgalanan bayrağı (pelerin rengi + desen + sembol), üstünde sıra ve klan adı. Sıralama: klan puanı (klan_ilk5).
import * as THREE from '../vendor/three.module.min.js';
import { pelerinTuval } from './pelerin.js';

// .opd'deki direkler (KO koordinatları; ön sıra, 1. → 5.), dönüş (D3DX dördey) ve ölçek
const DIREK = {
  elmo2004: { ulus: 2, q: [0, 0.924, 0, -0.382], s: 0.9, p: [[1626.0, 15.8, 389.2], [1628.8, 15.8, 386.4], [1631.6, 15.8, 383.6], [1634.5, 15.8, 380.7], [1637.3, 15.8, 377.9]],
    p2: [[1634.7, 15.8, 398.0], [1637.5, 15.8, 395.1], [1640.3, 15.8, 392.3], [1643.2, 15.8, 389.5], [1646.0, 15.8, 386.7]] },
  // (2.11) Moradon güney meydanı: obj_tutkey_gikbal bayrak direkleri (moradon.opd). Sol sıra (x 851 → 830) El Morad (Human) ilk 5 klanı,
  // sağ sıra (x 804 → 783) Karus ilk 5 klanı; bayraklar sağa (KO -x) açılır. Direk ~9 m, bayrak hilal başlığın altında
  moradon: { sira: [
    { ulus: 2, p: [[851.34, 14.07, 583.91], [846.13, 14.07, 583.93], [840.63, 14.08, 584.03], [835.31, 14.07, 584.02], [830.34, 14.07, 584.02]] },
    { ulus: 1, p: [[804.35, 14.07, 583.69], [799.14, 14.07, 583.72], [793.64, 14.07, 583.82], [788.32, 14.07, 583.81], [783.36, 14.07, 583.8]] },
  ], q: [0, 1, 0, 0], s: 1, bayrakY: 5.9, etiketY: 10.6, kenar: 0.32, adsiz: true },   // (2.11) Moradon: bayrak üstünde klan adı yazmaz
  karus2004: { ulus: 1, q: [0, 0.385, 0, 0.923], s: 0.9, p: [[423.4, 14.4, 1677.1], [426.2, 14.4, 1674.3], [429.1, 14.4, 1671.4], [431.9, 14.4, 1668.6], [434.7, 14.4, 1665.8]],
    p2: [[414.9, 14.4, 1668.5], [417.8, 14.4, 1665.6], [420.6, 14.4, 1662.8], [423.4, 14.4, 1660.0], [426.2, 14.4, 1657.1]] },
};
// KO (satır vektörü) v * S * R(q) * T(pos) → sütun-öncelikli matris (tools/convert/objects.js partMatrix ile aynı)
function koMatris([px, py, pz], q, s) {
  const [x, y, z, w] = q, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  const R = [1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy)];
  const m = new Array(16).fill(0);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] = R[c * 3 + r] * s;
  m[12] = px; m[13] = py; m[14] = pz; m[15] = 1;
  return new THREE.Matrix4().fromArray(m);
}
// (4.11) eksenlere ayrı ölçekli sürüm: KO .flag kumaş bayrakları (ölçek x/y/z farklı)
function koMatris3([px, py, pz], q, [sx, sy, sz]) {
  const m = koMatris([px, py, pz], q, 1).elements.slice(), S = [sx, sy, sz];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] *= S[c];
  return new THREE.Matrix4().fromArray(m);
}
// KO <bölge>.flag kumaş bayrakları (orijinal istemci Zones\moradon.flag; tools: scratchpad flag ayrıştırıcı → assets/bayrak/bayraklar.json):
// çapa noktası bayrağın direk tarafındaki alt köşesi, kumaş yerel +x (rüzgâr) ve +y (yukarı) yönünde; taban boy 2,4 × 2,4 m × ölçek.
// İlk 10 kayıt (dokusuz) güney meydanı klan bayrakları — onları startBayraklar klan verisiyle çizer, burada yok.
// Dokular: Human (f_ bat_e_flag_elmo128_a1), Karus (f_ bat_e_flag_karus128_a1), tarafsız (bat_e_flag_neutrality);
// "Knight Online" 16th_noahd_k/s_2018 bayrakları MineKO logolu (kullanıcı isteği).
const KW = 2.4, KH = 2.4;   // (5.11 12:05) kullanıcı isteğiyle eski boyuta dönüldü (1 m denemesi geri alındı)   // (5.11) KO kumaş taban boyu 1 × 1 m × ölçek (lamba / direk sancakları; klan bayraklarının onaylı yüksekliğiyle tutarlı: 19,4 + 1,345/2 ≈ 20,1)
const KLAN_KO = false;   // klan bayrakları: KO .flag kaydı yerine eski (3,5 × 2,1 m) bayrak
let KO_JSON = null; const koJson = () => (KO_JSON ||= fetch('./assets/bayrak/bayraklar.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));
// (4.11) iki yüzlü bayrak: dünya grubu z-aynalı (world.scale.z = −1) olduğu için ön yüz dokuyu ters (aynalı) gösteriyordu, arka yüz düz.
// Yazılı / simgeli bayraklarda (MineKO, tarafsız, klan) ön yüz u-aynalı doku ile çizilir → iki yüzden de doğru okunur.
// Ön ve arka geometri konum / normal / indeksi paylaşır (dalgalanma ikisine birden). Human / Karus / tarafsız sancaklarda (yırtık uç tek tarafta) ayna yok.
function ikiYuz(geo, tex, ek = {}, ayna = true, eksen = 0) {   // eksen: aynalanacak doku ekseni (0 = u; 1 = v — kumaşın yerel x'i dikey duran sancaklar)
  if (!ayna) { const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, ...ek })); return m; }
  const g2 = new THREE.BufferGeometry(); g2.setIndex(geo.index); g2.setAttribute('position', geo.attributes.position); g2.setAttribute('normal', geo.attributes.normal);
  const uv = geo.attributes.uv.array.slice(); for (let i = eksen; i < uv.length; i += 2) uv[i] = 1 - uv[i]; g2.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const m1 = new THREE.MeshLambertMaterial({ map: tex, side: THREE.BackSide, ...ek }), m2 = new THREE.MeshLambertMaterial({ map: tex, side: THREE.FrontSide, ...ek });
  const on = new THREE.Mesh(geo, m1), arka = new THREE.Mesh(g2, m2); on.add(arka);
  on.userData.arka = arka; return on;
}
function etiket(metin, renk) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.strokeText(metin, 256, 48); g.fillStyle = renk; g.fillText(metin, 256, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  sp.scale.set(5.2, 0.98, 1); sp.renderOrder = 20; return sp;
}

export function startBayraklar({ sb, zone, world }) {
  const D = DIREK[zone]; if (!D) return null;
  const grup = new THREE.Group(); grup.name = 'klan-bayraklari'; world.add(grup);
  const bayraklar = []; let t = 0;
  const kumaslar = [];
  (async () => {
    const j = await koJson();
    const L = j?.[zone]; if (!L) return;
    const yk = new THREE.TextureLoader(), dok = {};
    L.forEach((f, i) => {
      const tex = dok[f.d] ||= (() => { const x = yk.load(`./assets/bayrak/${f.d}.webp`); x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 4; return x; })();
      const kok = new THREE.Object3D(); kok.matrixAutoUpdate = false; kok.matrix.copy(koMatris3(f.p, f.q, f.s)); grup.add(kok);
      const geo = new THREE.PlaneGeometry(KW, KH, 12, 10); geo.translate(KW / 2, KH / 2, 0);
      // asılı sancaklar (duvar / direk kolundan aşağı sarkan: yerel +y aşağı ya da +x dikey): duvara gömülmesin diye dalga çok küçük
      //   ve derinlik ofseti (kameraya doğru) — KO'da da duvar sancakları neredeyse kıpırdamaz
      const M = kok.matrix.elements, yx = Math.hypot(M[0], M[1], M[2]) || 1, yy = Math.hypot(M[4], M[5], M[6]) || 1;
      const dikX = Math.abs(M[1] / yx) > 0.7, asili = M[5] / yy < -0.5 || dikX;
      const mesh = ikiYuz(geo, tex, { alphaTest: 0.4, ...(asili ? { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 } : {}) }, /^mineko/.test(f.d), dikX ? 1 : 0);   // yalnız yazılı MineKO sancakları aynalanır (Human / Karus / tarafsızın yırtık ucu tek tarafta kalmalı)
      kok.add(mesh); kumaslar.push({ mesh, taban: Float32Array.from(geo.attributes.position.array), faz: i * 1.37, genlik: asili ? (/^mineko/.test(f.d) ? (dikX ? 0.32 : 0.55) : 0.22) : 1.6, sarkik: asili && !dikX });   // (5.11) MineKO sancakları da sallanır; lamba sancağı (yerel y aşağı) üst kenardan asılı → dalga y'ye göre artar   // (5.11) kullanıcı isteği: daha çok sallansın
    });
  })();
  // sıralar: her sıra bir ulusun ilk 5 klanı (i. direk = i. klan). Kaleler: aynı ulusun iki karşılıklı sırası
  const SIRA = D.sira || [{ ulus: D.ulus, p: D.p }, { ulus: D.ulus, p: D.p2 }];
  const BY = D.bayrakY ?? 7.35, EY = D.etiketY ?? 14.6, KENAR = D.kenar ?? 0.12;
  async function yukle() {
    const uluslar = [...new Set(SIRA.map((x) => x.ulus))];
    const veri = Object.fromEntries(await Promise.all(uluslar.map(async (u) => { const { data } = await sb.rpc('klan_ilk5', { p_ulus: u }); return [u, Array.isArray(data) ? data : []]; })));
    for (const b of bayraklar) { b.kok.removeFromParent(); b.mesh.geometry.dispose(); b.mesh.material.map?.dispose(); b.mesh.material.dispose(); b.mesh.userData.arka?.material.dispose(); b.mesh.userData.arka?.geometry.dispose(); }
    bayraklar.length = 0;
    for (const [j, sr] of SIRA.entries()) {
      const liste = veri[sr.ulus] || [];
      for (let i = 0; i < sr.p.length; i++) {
        const k = liste[i]; if (!k) continue;
        const cv = await pelerinTuval(k.pelerin ?? (sr.ulus === 2 ? 3 : 1), k.sembol || null, 128);
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const kok = new THREE.Object3D(); kok.matrixAutoUpdate = false; grup.add(kok);
        // (5.11) Moradon: KO moradon.flag'deki klan bayrağı kaydı (direğe en yakın) varsa konum / dönüş / ölçek birebir, boy 1 × 1 m × ölçek
        const ko = KLAN_KO && ((await koJson())?.[zone + '_klan'] || []).find((r) => Math.hypot(r.p[0] - sr.p[i][0], r.p[2] - sr.p[i][2]) < 1.5);
        let geo, kenar = KENAR, gen = 3.5;
        if (ko) { kok.matrix.copy(koMatris3(ko.p, ko.q, ko.s)); geo = new THREE.PlaneGeometry(KW, KH, 12, 8); geo.translate(KW / 2, KH / 2, 0); kenar = 0; gen = KW; }
        else {   // yatay bayrak: direğe tutturulmuş kenardan rüzgâr yönüne açılır (3.5 × 2.1 m), direğin tepesinin hemen altında
          kok.matrix.copy(koMatris(sr.p[i], D.q, D.s)); geo = new THREE.PlaneGeometry(3.5, 2.1, 16, 6); geo.translate(KENAR + 1.75, BY, 0);
        }
        const mesh = ikiYuz(geo, tex); kok.add(mesh);
        if (!D.adsiz) { const ad = etiket(`${k.sira}. ${k.ad}`, k.sira === 1 ? '#ffd84a' : '#ffffff'); ad.position.set(0, EY, 0); kok.add(ad); }
        bayraklar.push({ kok, mesh, taban: Float32Array.from(geo.attributes.position.array), faz: i * 0.9 + j * 2.1, kenar, gen });
      }
    }
  }
  yukle().catch((e) => console.warn('klan bayrakları', e));
  const zaman = setInterval(() => yukle().catch(() => {}), 120000);   // sıralama 2 dk'da bir yenilenir
  return {
    update(dt) {
      t += dt;
      for (const b of kumaslar) {   // kumaş: direk kenarı sabit, uca doğru artan dalga
        const p = b.mesh.geometry.attributes.position, a = p.array, o = b.taban;
        for (let i = 0; i < a.length; i += 3) {
          const u = b.sarkik ? Math.abs(o[i + 1]) / KH : o[i] / KW;
          const g = b.genlik * KW / 2.4, f = 2.4 / KW;   // dalga KO boyuna orantılı
          a[i + 2] = o[i + 2] + (Math.sin(t * 3.0 - o[i] * 2.2 * f + b.faz) * 0.22 + Math.sin(t * 4.7 - o[i] * 3.4 * f + o[i + 1] * 1.3 * f + b.faz) * 0.05) * u * g;
          a[i + 1] = o[i + 1] - u * u * 0.12 * g + Math.sin(t * 2.3 - o[i] * 1.5 * f + b.faz) * 0.04 * u * g;
        }
        p.needsUpdate = true; b.mesh.geometry.computeVertexNormals();
      }
      for (const b of bayraklar) {   // normal bayrak gibi dalgalanma: direkten uzaklaştıkça artan, uca doğru ilerleyen dalga
        const p = b.mesh.geometry.attributes.position, a = p.array, o = b.taban;
        for (let i = 0; i < a.length; i += 3) {
          const u = Math.max(0, o[i] - b.kenar) / b.gen, A = b.gen / 3.5;
          const f = 3.5 / b.gen;   // küçük (KO boyu) bayrakta dalga boyu ve genliği orantılı
          a[i + 2] = o[i + 2] + (Math.sin(t * 3.4 - o[i] * 1.9 * f + b.faz) * 0.46 + Math.sin(t * 5.1 - o[i] * 3.1 * f + o[i + 1] * 1.2 * f + b.faz) * 0.1) * u * A;
          a[i + 1] = o[i + 1] - u * u * 0.18 * A + Math.sin(t * 2.6 - o[i] * 1.4 * f + b.faz) * 0.05 * u * A;
        }
        p.needsUpdate = true; b.mesh.geometry.computeVertexNormals();
      }
    },
    yenile: () => yukle(),
    durdur() { clearInterval(zaman); grup.removeFromParent(); },
  };
}
