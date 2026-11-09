// Bölge nesneleri (binalar, ağaçlar, çitler...) — CN3ShapeMgr/CN3Shape/CN3SPart karşılığı
// Aynı mesh+doku+malzemeyi paylaşan parçalar tek InstancedMesh ile çizilir.
import * as THREE from '../vendor/three.module.min.js';
import { decodeDXT, joinDXT } from './dxt.js';
import { mipChain } from './mips.js';

const RF = { ALPHA: 0x1, NOFOG: 0x2, DOUBLE: 0x4, BOARD_Y: 0x8, WINDY: 0x20, NOLIGHT: 0x40, NOZWRITE: 0x100 };
// D3DBLEND → three
const BLEND = { 1: THREE.ZeroFactor, 2: THREE.OneFactor, 3: THREE.SrcColorFactor, 4: THREE.OneMinusSrcColorFactor, 5: THREE.SrcAlphaFactor, 6: THREE.OneMinusSrcAlphaFactor, 7: THREE.DstAlphaFactor, 8: THREE.OneMinusDstAlphaFactor, 9: THREE.DstColorFactor, 10: THREE.OneMinusDstColorFactor };

export async function loadObjects(base, renderer, onProgress = () => {}) {
  const r = await fetch(`${base}/objects/meta.json`);
  if (!r.ok) return null;
  const meta = await r.json();
  onProgress('Nesne verisi indiriliyor…');
  const get = (n) => fetch(`${base}/objects/${n}`).then((x) => { if (!x.ok) throw new Error(n + ' ' + x.status); return x.arrayBuffer(); });
  const texParts = meta.texParts ? meta.texParts.map((_, i) => get(`tex.${i}.bin`)) : [get('tex.bin')];   // 8 MB parçalar
  const [meshBuf, instBuf, ...parts] = await Promise.all([get('mesh.bin'), get('inst.bin'), ...texParts]);
  const texBuf = parts.length === 1 ? parts[0] : concat(parts);
  const s3tc = renderer.extensions.has('WEBGL_compressed_texture_s3tc');

  // alfa testli (harmanlanmayan) dokular: mip'lerde kapsama korunur
  const alphaTest = new Set(meta.groups.filter((g) => g.tex >= 0 && !(g.flags & RF.ALPHA)).map((g) => g.tex));
  let done = 0;
  onProgress(`Dokular hazırlanıyor (0/${meta.textures.length})…`);
  const textures = await Promise.all(meta.textures.map(async (t, i) => {
    const [off, len] = t.top, top = new Uint8Array(texBuf, off, len);
    let tex;
    if (s3tc) {
      const fmt = t.fmt === 'dxt1' ? (t.alpha ? THREE.RGBA_S3TC_DXT1_Format : THREE.RGB_S3TC_DXT1_Format)
        : t.fmt === 'dxt3' ? THREE.RGBA_S3TC_DXT3_Format : THREE.RGBA_S3TC_DXT5_Format;
      const single = () => [{ data: meta.texSplit ? joinDXT(top, t.fmt) : top, width: t.w, height: t.h }];
      const mips = t.mips
        ? await mipChain(top, t.fmt, t.w, t.h, { split: meta.texSplit, punch: t.fmt === 'dxt1' && t.alpha, cutoff: t.alpha && alphaTest.has(i) ? 64 : 0 }).catch(single)
        : single();
      tex = new THREE.CompressedTexture(mips, t.w, t.h, fmt);
      tex.minFilter = mips.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    } else {
      const rgba = decodeDXT(meta.texSplit ? joinDXT(top, t.fmt) : top, t.fmt, t.w, t.h);
      tex = new THREE.DataTexture(rgba, t.w, t.h, THREE.RGBAFormat);
      tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    }
    tex.flipY = false;                       // D3D UV başlangıcı sol üst
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.name = t.name || '';
    tex.needsUpdate = true;
    if (++done % 40 === 0) onProgress(`Dokular hazırlanıyor (${done}/${meta.textures.length})…`);
    return tex;
  }));

  // konum int16 (örnek matrisine katlanmış ölçek/öteleme), normal int8, uv float
  const geos = meta.meshes.map((m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Int16Array(meshBuf, m.p, m.n * 3), 3, true));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(meshBuf, m.nr, m.n * 3), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(meshBuf, m.u, m.n * 2), 2));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(meshBuf, m.i[0], m.i[1]), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.sqrt(3));   // [-1,1]^3 küpü
    return g;
  });

  const windUniform = { value: 0 }, shineUniform = { value: 0 };
  const group = new THREE.Group(); group.name = 'objects';
  const batches = [], flipbooks = [];
  const tmp = new THREE.Vector3();
  for (const gm of meta.groups) {
    if (gm.tex < 0 && meta.meshes[gm.mesh].n <= 8) continue;   // dokusuz küçük yardımcı mesh (zz_fx işaretçileri): oyunda çizilmez
    const map = gm.tex >= 0 ? textures[gm.tex] : null;
    const texMeta = gm.tex >= 0 ? meta.textures[gm.tex] : null;
    const f = gm.flags;
    const color = new THREE.Color().setRGB(Math.min(1, gm.diffuse[0]), Math.min(1, gm.diffuse[1]), Math.min(1, gm.diffuse[2]), THREE.SRGBColorSpace);
    const params = { map, color, side: f & RF.DOUBLE ? THREE.DoubleSide : THREE.FrontSide, fog: !(f & RF.NOFOG) };
    if (f & RF.ALPHA) {
      // KO CN3SPart / N3AlphaPrimitiveManager: alfa karışımlı parça da Z yazar (yalnız RF_NOTZWRITE yazmaz); şeffaf texeller atılır (ALPHATEST).
      // Önceden hepsi depthWrite kapalıydı → InstancedMesh örnekleri arası sıralama yapılamadığından uzak kubbe / ağaç yakındakinin önüne çiziliyordu (Moradon "yırtılma").
      params.transparent = true; params.depthWrite = !(f & RF.NOZWRITE) && gm.dst !== 2; if (params.depthWrite) params.alphaTest = 0.04;   // ek karışımlı (ONE) ışıma kartları Z yazmaz: siyah kenarları arkadaki saydamları örtmesin
      const src = BLEND[gm.src], dst = BLEND[gm.dst];
      if (gm.src === 5 && gm.dst === 6) params.blending = THREE.NormalBlending;
      // ağaç yaprak / dal kartları (ör. Moradon 2017 yılbaşı ağacı k_tree_2017_*): KO'da alfa karışımı + ALPHATEST + z yazımı.
      // z yazımı kapalıyken dallar rastgele sırayla üst üste binip "yırtık", soluk görünüyordu → kesik (alphaTest) + derinlik yazımı
      if (texMeta?.alpha && /tree|leap|leaf|branch|bush|grass|fern|pine/i.test(texMeta.name)) { params.depthWrite = true; params.alphaTest = 0.35; }
      else if (src !== undefined && dst !== undefined) { params.blending = THREE.CustomBlending; params.blendSrc = src; params.blendDst = dst; }
    } else if (texMeta?.alpha) {
      params.alphaTest = 0.25;               // orijinal: ALPHATEST GREATER 0
      params.alphaToCoverage = true;         // MSAA ile yaprak/çit kenarlarında piksel tırtığı olmaz
    }
    const mat = f & RF.NOLIGHT ? new THREE.MeshBasicMaterial(params) : new THREE.MeshLambertMaterial(params);
    if (f & RF.WINDY) addWind(mat, windUniform);
    if (texMeta?.alpha && texMeta.fmt === 'dxt1') unpremultiply(mat);
    // KO maden kristalleri (obj_04el_mineral01/02, doku obj_04el_guard_a002): kristal yavaşça parlayıp söner, yüzeyinde ışık süzülür
    if (/^obj_04el_guard_a002\.dxt$/.test(texMeta?.name || '')) addShine(mat, shineUniform);

    // canlı doku dizisi (CN3SPart m_TexRefs + m_fTexFPS): Moradon örsünün (obj_co_itemup) dönen yeşil büyü halkası
    const fb = /^(item_sb|item_table)0000\.dxt$/.exec(texMeta?.name || '');
    if (fb) flipbooks.push({ mat, frames: loadFrames(fb[1], fb[1] === 'item_sb' ? 5 : 10), fps: 8 });
    // ulus kapılarının ateş / büyü dizileri (Ardream bind point'leri, El Morad transgate): KO doku dizisi, kendi karesinden başlar
    const kf = /^(el_bindpoint01_fire|ka_bindpoint01_fire|el_transgate01_fire)(\d\d)\.dxt$/.exec(texMeta?.name || '');
    if (kf) { const n = KAPI_KARE[kf[1]]; flipbooks.push({ mat, frames: kapiKareleri(kf[1], n), fps: 12, bas: Number(kf[2]) % n }); }
    const [off, count] = gm.inst;
    const all = new Float32Array(instBuf, off, count * 16);
    const mesh = new THREE.InstancedMesh(geos[gm.mesh], mat, count);
    mesh.instanceMatrix.array.set(all);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (f & RF.ALPHA) mesh.renderOrder = 1;
    group.add(mesh);
    // örnek merkezleri ve yarıçapları (mesafe kırpma için)
    // (merkez = örnek matrisiyle dönüştürülmüş geometri küre merkezi, yarıçap = geometri yarıçapı × en büyük ölçek)
    const cr = new Float32Array(count * 4);
    const g0 = geos[gm.mesh]; if (!g0.boundingSphere) g0.computeBoundingSphere();
    const gc = g0.boundingSphere.center, gr = g0.boundingSphere.radius;
    for (let j = 0; j < count; j++) {
      const o = j * 16;
      tmp.set(all[o], all[o + 1], all[o + 2]); const sx = tmp.length();
      tmp.set(all[o + 4], all[o + 5], all[o + 6]); const sy = tmp.length();
      tmp.set(all[o + 8], all[o + 9], all[o + 10]); const sz = tmp.length();
      cr[j * 4] = all[o + 12] + all[o] * gc.x + all[o + 4] * gc.y + all[o + 8] * gc.z;
      cr[j * 4 + 1] = all[o + 13] + all[o + 1] * gc.x + all[o + 5] * gc.y + all[o + 9] * gc.z;
      cr[j * 4 + 2] = all[o + 14] + all[o + 2] * gc.x + all[o + 6] * gc.y + all[o + 10] * gc.z;
      cr[j * 4 + 3] = gr * Math.max(sx, sy, sz);
    }
    batches.push({ mesh, all, cr, count });
  }

  // Görüş mesafesi dışındaki örnekleri çizme (orijinal: CN3ShapeMgr görünür hücre listesi).
  // Kamera 16 m'den fazla yer değiştirince yeniden hesaplanır.
  const last = new THREE.Vector3(1e9, 0, 0);
  const cull = (camLocal, dist, far = dist) => {
    if (last.distanceToSquared(camLocal) < 256) return;
    last.copy(camLocal);
    let vis = 0;
    for (const b of batches) {
      const arr = b.mesh.instanceMatrix.array; let n = 0;
      for (let j = 0; j < b.count; j++) {
        const r = b.cr[j * 4 + 3], dx = b.cr[j * 4] - camLocal.x, dz = b.cr[j * 4 + 2] - camLocal.z;
        // küçük nesneler (çim, taş, fıçı) yarıçaplarıyla orantılı mesafede kaybolur (en az 200 m; CN3ShapeMgr gibi)
        // binalar/büyük yapılar (yarıçap ≥ 6 m) uzak görüş mesafesine kadar, diğerleri görüş mesafesine kadar
        const lim = (r >= 6 ? far : Math.min(dist, Math.max(120, r * 80))) + r + 24;
        if (dx * dx + dz * dz > lim * lim) continue;
        // her zaman kopyala: önceki kırpmada dizi sıkıştırıldıysa arr[j] artık j. örnek değildir (eskiden n === j iken atlanıyordu →
        // oyuncu yürüdükçe lamba direkleri, kapı direkleri, çitler gibi örnekler yanlış/eksik çiziliyordu)
        if (b.sik || n !== j) arr.set(b.all.subarray(j * 16, j * 16 + 16), n * 16);
        n++;
      }
      if (n !== b.mesh.count || n !== b.count || b.sik) {
        b.sik = n !== b.count;   // dizi sıkıştırıldı mı (bir sonraki kırpmada tam kopya gerekir)
        b.mesh.count = n; b.mesh.visible = n > 0;
        if (n) { b.mesh.instanceMatrix.needsUpdate = true; b.mesh.computeBoundingSphere(); }
      }
      vis += n;
    }
    group.userData.stats.visible = vis;
  };

  group.userData.tick = (t, wind = true) => {
    if (wind) windUniform.value = t;
    shineUniform.value = t;
    for (const f of flipbooks) { const k = f.frames[(Math.floor(t * f.fps) + (f.bas || 0)) % f.frames.length]; if (k?.image && f.mat.map !== k) { f.mat.map = k; } }
  };
  group.userData.cull = cull;
  group.userData.collision = meta.collision;
  group.userData.stats = { groups: meta.groups.length, parts: meta.parts, shapes: meta.shapes, s3tc, textures: textures.length };
  return group;
}

const loader = new THREE.TextureLoader();
const KAPI_KARE = { el_bindpoint01_fire: 17, ka_bindpoint01_fire: 16, el_transgate01_fire: 15 };
const kapiOnbellek = new Map();
export function kapiKareleri(ad, n) {
  if (!kapiOnbellek.has(ad)) kapiOnbellek.set(ad, Array.from({ length: n }, (_, i) => {
    const t = loader.load(`./assets/kapi/${ad}${String(i).padStart(2, '0')}.webp`);
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }));
  return kapiOnbellek.get(ad);
}
export function loadFrames(ad, n) {
  return Array.from({ length: n }, (_, i) => {
    const t = loader.load(`./assets/itemup/${ad}${String(i).padStart(4, '0')}.png`);
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  });
}

function concat(bufs) {
  const out = new Uint8Array(bufs.reduce((a, b) => a + b.byteLength, 0)); let o = 0;
  for (const b of bufs) { out.set(new Uint8Array(b), o); o += b.byteLength; }
  return out.buffer;
}

// RF_WINDY: yapraklar/bayraklar rüzgârda hafifçe salınır (orijinal: CN3Base::s_vWindFactor)
// DXT1 saydam texeller (0,0,0,0) çözülür: çift doğrusal süzgeç kenarlarda rengi siyaha çeker (yapraklarda koyu,
// tırtıklı piksel saçağı). Renk önceden alfa ile çarpılmış kabul edilip geri bölünür → kenar rengi doğru kalır.
function unpremultiply(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef USE_MAP
        diffuseColor.rgb /= max(sampledDiffuseColor.a, 0.02);
      #endif`);
  };
  mat.customProgramCacheKey = () => 'unpremul' + (mat.userData.wind ? 'w' : '');
}

export function addShine(mat, uTime) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uShineTime = uTime;
    sh.vertexShader = 'uniform float uShineTime;\nvarying float vShinePh;\nvarying float vShineY;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vShinePh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
      #else
        vShinePh = 0.0;
      #endif
      vShineY = position.y;`);
    sh.fragmentShader = 'uniform float uShineTime;\nvarying float vShinePh;\nvarying float vShineY;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      float nabiz = 0.5 + 0.5 * sin(uShineTime * 1.8 + vShinePh);                       // yavaş parlayıp sönme
      float bant = fract(vShineY * 0.35 - uShineTime * 0.25 + vShinePh * 0.1);          // yukarı süzülen ışık şeridi
      float parilti = smoothstep(0.0, 0.08, bant) * (1.0 - smoothstep(0.08, 0.2, bant));
      outgoingLight = outgoingLight * (0.8 + 0.45 * nabiz) + vec3(0.45, 0.8, 1.0) * parilti * 0.35;
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'kristal';
}

export function addWind(mat, uTime) {
  mat.userData.wind = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWindTime = uTime;
    sh.vertexShader = 'uniform float uWindTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
      #else
        float ph = 0.0;
      #endif
      float sway = max(position.y, 0.0) * 0.015;
      transformed.x += sin(uWindTime * 1.7 + ph) * sway;
      transformed.z += cos(uWindTime * 1.3 + ph) * sway * 0.6;`);
  };
  mat.customProgramCacheKey = () => 'wind';
}
