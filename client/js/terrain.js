// KO arazisi — orijinal N3Terrain/N3TerrainPatch çizim kurallarının WebGL karşılığı
//
// Her 4x4 m karo:
//   dolu && tex1 geçerli : tex1(dir1) + tex2(dir2)   (D3DTOP_ADD — maskeli karolar toplanır)
//   aksi halde           : renk haritası
// Uzakta (orijinaldeki düşük LOD yamaları gibi) renk haritasına yumuşak geçiş yapılır.
import * as THREE from '../vendor/three.module.min.js';
import { decodeDXT, joinDXT } from './dxt.js';
import { mipChain } from './mips.js';

let _s3tc = null;
function hasS3TC() {
  if (_s3tc === null) { try { const gl = document.createElement('canvas').getContext('webgl2'); _s3tc = !!gl?.getExtension('WEBGL_compressed_texture_s3tc'); } catch { _s3tc = false; } }
  return _s3tc;
}

// N3Terrain.cpp TileDirU/V [yön][LT, RT, LB, RB]
const DIR_U = [[0,1,0,1],[0,0,1,1],[1,0,1,0],[1,1,0,0],[1,0,1,0],[0,0,1,1],[0,1,0,1],[1,1,0,0]];
const DIR_V = [[0,0,1,1],[1,0,1,0],[1,1,0,0],[0,1,0,1],[0,0,1,1],[0,1,0,1],[1,1,0,0],[1,0,1,0]];
// köşe sırası: (x,z) (x,z+1) (x+1,z+1) (x+1,z)  →  tablo indeksi LB, LT, RT, RB
const CORNER = [2, 0, 1, 3];

// yüzey kütüphanesi (dünya editörü arazi boyası): karo kimliği ≥ YUZEY_TABAN → assets/yuzey doku dizisindeki katman (kimlik − taban)
export const YUZEY_TABAN = 600;
let YUZEY_P = null;
/** tüm haritaların zemin yüzeyleri (DTex): DXT1 doku dizisi, mip'ler worker'da — yalnız gerektiğinde (boyanmış arazi / GM) yüklenir */
export function yuzeyYukle(renderer) {
  return (YUZEY_P ||= (async () => {
    const V = (u) => (window.KO_V ? window.KO_V(u) : u);
    const meta = await (await fetch(V('./assets/yuzey/yuzey.json'))).json();
    const buf = await (await fetch(V('./assets/yuzey/yuzey.bin'))).arrayBuffer();
    let mips = null;
    if (hasS3TC()) {
      const [off, len, w, h] = meta.levels[0], per = len / meta.layers;
      const chains = await Promise.all(Array.from({ length: meta.layers }, (_, i) => mipChain(new Uint8Array(buf, off + i * per, per), meta.fmt, w, h, { split: meta.split }))).catch(() => null);
      if (chains) mips = chains[0].map((lv, L) => { const sz = lv.data.length, data = new Uint8Array(sz * meta.layers); chains.forEach((c, i) => data.set(c[L].data, i * sz)); return { data, width: lv.width, height: lv.height, depth: meta.layers }; });
    }
    return { meta, tex: makeTileArrayDXT(buf, meta, renderer, mips) };
  })().catch((e) => { YUZEY_P = null; throw e; }));
}
const YUZEY_BOS = (() => { const t = new THREE.DataArrayTexture(new Uint8Array([90, 110, 70, 255]), 1, 1, 1); t.needsUpdate = true; return t; })();
const USE_LIGHTMAP = new URLSearchParams(location.search).has('isikharitasi');
export async function loadZone(base) {
  const meta = await (await fetch(`${base}/meta.json`)).json();
  const ext = meta.images || 'jpg';
  // .tlt ışık haritası (pişmiş gölgeler) web'de nesnelerle örtüşmüyor, zeminde zikzak "gölge" izleri bırakıyordu → kullanılmaz
  const lm = USE_LIGHTMAP ? meta.lightmap : null;
  const [bin, tilesImg, cmImg, detailImg, lmImg, lmIdx] = await Promise.all([
    fetch(`${base}/terrain.bin`).then((r) => r.arrayBuffer()),
    meta.tileTex ? fetch(`${base}/tiles.bin`).then((r) => r.arrayBuffer()) : loadImage(`${base}/tiles.${ext}`).catch(() => loadImage(`${base}/tiles.${ext === 'png' ? 'jpg' : 'png'}`)),   // eski paketler: tiles.png (dungeon_b1th/b2th)
    meta.colormapPx ? loadImage(`${base}/colormap.${ext}`) : null,
    meta.detail ? loadImage(`${base}/detail.${ext}`) : null,
    lm ? loadImage(`${base}/lightmap.png`) : null,
    lm ? fetch(`${base}/lightmap.idx`).then((r) => r.arrayBuffer()) : null,
  ]);
  const N = meta.size;
  // karo dizisinin mip'leri dosyada yok: katman başına worker'da üretilir
  let tileMips = null;
  const tt = meta.tileTex;
  if (tt && tt.runtimeMips && hasS3TC()) {
    const [off, len, w, h] = tt.levels[0], per = len / tt.layers;
    const chains = await Promise.all(Array.from({ length: tt.layers }, (_, i) =>
      mipChain(new Uint8Array(tilesImg, off + i * per, per), tt.fmt, w, h, { split: tt.split }))).catch((e) => { console.warn('karo mip üretilemedi', e); return null; });
    if (chains) tileMips = chains[0].map((lv, L) => {
      const sz = lv.data.length, data = new Uint8Array(sz * tt.layers);
      chains.forEach((c, i) => data.set(c[L].data, i * sz));
      return { data, width: lv.width, height: lv.height, depth: tt.layers };
    });
  }
  return {
    tileMips,
    meta, N,
    heights: new Float32Array(bin, 0, N * N),
    bits: new Uint32Array(bin, N * N * 4, N * N),
    tilesImg, cmImg, detailImg, lmImg, lmIdx,
  };
}

function loadImage(url) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('yüklenemedi: ' + url)); i.src = window.KO_V ? window.KO_V(url) : url; });
}

/** Atlas görüntüsünü WebGL2 doku dizisine çevir (katman = karo indeksi) */
function makeTileArray(img, meta) {
  const { cols, tilePx } = meta.atlas;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const all = g.getImageData(0, 0, img.width, img.height).data;
  const layers = Math.max(1, meta.tileCount);
  const data = new Uint8Array(tilePx * tilePx * 4 * layers);
  for (let i = 0; i < layers; i++) {
    const cx = (i % cols) * tilePx, cy = Math.floor(i / cols) * tilePx;
    for (let y = 0; y < tilePx; y++) {
      const src = ((cy + y) * img.width + cx) * 4;
      data.set(all.subarray(src, src + tilePx * 4), (i * tilePx * tilePx + y * tilePx) * 4);
    }
  }
  const tex = new THREE.DataArrayTexture(data, tilePx, tilePx, layers);
  tex.format = THREE.RGBAFormat;
  tex.colorSpace = THREE.NoColorSpace;   // D3D gibi gama uzayında hesaplanır
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Orijinal DXT karo blokları → sıkıştırılmış doku dizisi (S3TC yoksa JS ile çözülür) */
function makeTileArrayDXT(buf, tt, renderer, runtimeMips) {
  const s3tc = renderer.extensions.has('WEBGL_compressed_texture_s3tc');
  const n = tt.layers;
  let tex;
  // katman başına akışlara ayrılmış veri → blok düzeni
  const level = (off, len) => { const raw = new Uint8Array(buf, off, len); if (!tt.split) return raw; const per = len / n, out = new Uint8Array(len); for (let i = 0; i < n; i++) out.set(joinDXT(raw.subarray(i * per, (i + 1) * per), tt.fmt), i * per); return out; };
  if (s3tc) {
    const fmt = tt.fmt === 'dxt1' ? THREE.RGB_S3TC_DXT1_Format : tt.fmt === 'dxt3' ? THREE.RGBA_S3TC_DXT3_Format : THREE.RGBA_S3TC_DXT5_Format;
    const mips = runtimeMips || tt.levels.map(([off, len, w, h]) => ({ data: level(off, len), width: w, height: h, depth: n }));
    tex = new THREE.CompressedArrayTexture(mips, tt.levels[0][2], tt.levels[0][3], n, fmt);
    tex.minFilter = mips.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;   // mip üretilemediyse eksik doku (siyah) olmasın
  } else {
    const [off, len, w, h] = tt.levels[0], per = len / n, lv0 = level(off, len);
    const data = new Uint8Array(w * h * 4 * n);
    for (let i = 0; i < n; i++) data.set(decodeDXT(lv0.subarray(i * per, (i + 1) * per), tt.fmt, w, h), i * w * h * 4);
    tex = new THREE.DataArrayTexture(data, w, h, n); tex.format = THREE.RGBAFormat;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  tex.colorSpace = THREE.NoColorSpace; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}

export function buildTerrain(z, renderer) {
  const { N, heights, bits, meta } = z;
  // yüzey boyası (GM): karo başına kütüphane katmanı (−1 yok) + köşe başına karışım ağırlığı (0–255) → yumuşak kenar, uzaktan da görünür
  z.yzK ||= new Int16Array(N * N).fill(-1); z.yzW ||= new Uint8Array(N * N);
  const { yzK, yzW } = z;
  const T = meta.tileSize, tiles = N - 1, count = meta.tileCount;
  const H = (x, zz) => heights[x * N + zz];

  // 32x32 karoluk parçalar: görüş dışı/uzak parçalar çizilmez (orijinal: CN3Terrain yama LOD/görünürlük)
  const CH = 32, nCh = Math.ceil(tiles / CH);
  const normalAt = (x, zz) => {   // köşe normalleri (merkezi fark)
    const hl = H(Math.max(0, x - 1), zz), hr = H(Math.min(N - 1, x + 1), zz);
    const hd = H(x, Math.max(0, zz - 1)), hu = H(x, Math.min(N - 1, zz + 1));
    const nx = hl - hr, nz = hd - hu, ny = 2 * T; const l = Math.hypot(nx, ny, nz);
    return [nx / l, ny / l, nz / l];
  };
  const chunkGeo = (x0, z0) => {
    const x1 = Math.min(tiles, x0 + CH), z1 = Math.min(tiles, z0 + CH), quads = (x1 - x0) * (z1 - z0);
    const pos = new Float32Array(quads * 12), nor = new Int8Array(quads * 12);
    const uv1 = new Uint8Array(quads * 8), uv2 = new Uint8Array(quads * 8);
    const lay = new Int16Array(quads * 8);    // tex1 katmanı, tex2 katmanı (-1: yok, -2: renk haritası)
    const yzl = new Int16Array(quads * 4), yzw = new Uint8Array(quads * 4);   // yüzey boyası: katman (karo), ağırlık (köşe)
    const idx = new Uint16Array(quads * 6);
    let q = 0;
    for (let tx = x0; tx < x1; tx++) {
      for (let tz = z0; tz < z1; tz++, q++) {
        const b = bits[tx * N + tz];
        const full = b & 1, d1 = (b >>> 1) & 31, d2 = (b >>> 6) & 31, t1 = (b >>> 11) & 1023, t2 = (b >>> 21) & 1023;
        const tileMode = full && (t1 < count || t1 >= YUZEY_TABAN);
        const corners = [[tx, tz], [tx, tz + 1], [tx + 1, tz + 1], [tx + 1, tz]];
        for (let k = 0; k < 4; k++) {
          const v = q * 4 + k, [cx, cz] = corners[k];
          pos[v * 3] = cx * T; pos[v * 3 + 1] = H(cx, cz); pos[v * 3 + 2] = cz * T;
          const n = normalAt(cx, cz); nor[v * 3] = Math.round(n[0] * 127); nor[v * 3 + 1] = Math.round(n[1] * 127); nor[v * 3 + 2] = Math.round(n[2] * 127);
          const c = CORNER[k], dd1 = d1 & 7, dd2 = d2 & 7;
          uv1[v * 2] = DIR_U[dd1][c]; uv1[v * 2 + 1] = DIR_V[dd1][c];
          uv2[v * 2] = DIR_U[dd2][c]; uv2[v * 2 + 1] = DIR_V[dd2][c];
          yzl[v] = yzK[tx * N + tz]; yzw[v] = yzW[cx * N + cz];
          lay[v * 2] = tileMode ? t1 : -2;
          lay[v * 2 + 1] = tileMode && t2 < count ? t2 : -1;
        }
        // orijinal üçgenleme (CN3Terrain::GetHeight): (ix+iz) tekse köşegen (x,z)-(x+1,z+1), çiftse (x,z+1)-(x+1,z)
        const o = q * 4, i6 = q * 6;
        if (((tx + tz) & 1) === 1) idx.set([o, o + 1, o + 2, o, o + 2, o + 3], i6);
        else idx.set([o + 1, o + 2, o + 3, o + 1, o + 3, o], i6);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
    geo.setAttribute('uv1t', new THREE.BufferAttribute(uv1, 2));
    geo.setAttribute('uv2t', new THREE.BufferAttribute(uv2, 2));
    geo.setAttribute('layers', new THREE.BufferAttribute(lay, 2));
    geo.setAttribute('yzl', new THREE.BufferAttribute(yzl, 1)); geo.setAttribute('yzw', new THREE.BufferAttribute(yzw, 1, true));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  };

  const tileArr = meta.tileTex ? makeTileArrayDXT(z.tilesImg, meta.tileTex, renderer, z.tileMips) : makeTileArray(z.tilesImg, meta);
  let cmTex = null;
  if (z.cmImg) {
    cmTex = new THREE.Texture(z.cmImg);
    cmTex.flipY = false; cmTex.colorSpace = THREE.NoColorSpace;
    cmTex.generateMipmaps = true; cmTex.minFilter = THREE.LinearMipmapLinearFilter; cmTex.anisotropy = 8;
    cmTex.needsUpdate = true;
  }

  const imgTex = (img, opts = {}) => {
    if (!img) return null;
    const t = new THREE.Texture(img); t.flipY = false; t.colorSpace = THREE.NoColorSpace;
    t.generateMipmaps = opts.mips !== false; t.minFilter = opts.mips === false ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter; t.anisotropy = 8;
    if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true; return t;
  };
  const detailTex = imgTex(z.detailImg, { repeat: true });
  const lmTex = imgTex(z.lmImg, { mips: false });
  let lmIdxTex = null;
  if (z.lmIdx) {   // karo → atlas yuvası (+1), RG8 olarak
    const src = new Uint16Array(z.lmIdx), n = tiles, d = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) { d[i * 4] = src[i] & 255; d[i * 4 + 1] = src[i] >> 8; }
    lmIdxTex = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);   // texel (tz, tx)
    lmIdxTex.magFilter = lmIdxTex.minFilter = THREE.NearestFilter; lmIdxTex.needsUpdate = true;
  }
  const L = meta.lightmap || { px: 32, cols: 64, width: 1, height: 1 };

  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uTiles: { value: tileArr }, uYuzey: { value: YUZEY_BOS }, uHasYuzey: { value: 0 },
      uColorMap: { value: cmTex },
      uHasCM: { value: cmTex ? 1 : 0 },
      uDetail: { value: detailTex }, uHasDetail: { value: detailTex ? 1 : 0 },
      uLM: { value: lmTex }, uLMIdx: { value: lmIdxTex }, uHasLM: { value: lmTex ? 1 : 0 },
      uLMInfo: { value: new THREE.Vector4(L.px, L.cols, L.width, L.height) },
      uLight: { value: new THREE.Color(1, 1, 1) }, uDebug: { value: 0 },
      uWorld: { value: meta.worldSize },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uSun: { value: new THREE.Color(1.0, 0.97, 0.9) },
      uSunAmt: { value: 0 },
      uAmbient: { value: new THREE.Color(0.55, 0.57, 0.62) },
      uFogColor: { value: new THREE.Color(0.66, 0.74, 0.82) },
      uFogNear: { value: 250 }, uFogFar: { value: 900 },
      uLodNear: { value: 300 }, uLodFar: { value: 460 },   // karo dokusu sis başlangıcına kadar korunur
    },
    vertexShader: /* glsl */`
      in vec2 uv1t; in vec2 uv2t; in vec2 layers; in float yzl; in float yzw;
      flat out float vYzL; out float vYzW;
      out vec2 vUv1; out vec2 vUv2; flat out vec2 vLayers; out vec3 vWorld; out vec3 vNormal; out float vDist;
      out vec2 vKO;
      void main() {
        vYzL = yzl; vYzW = yzw;
        vUv1 = uv1t; vUv2 = uv2t; vLayers = layers; vNormal = normal; vKO = position.xz;
        vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
        vec4 mv = viewMatrix * w; vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float; precision highp sampler2DArray;
      uniform sampler2DArray uTiles; uniform sampler2DArray uYuzey; uniform int uHasYuzey; uniform sampler2D uColorMap; uniform int uHasCM; uniform float uWorld;
      uniform sampler2D uDetail; uniform int uHasDetail;
      uniform sampler2D uLM; uniform sampler2D uLMIdx; uniform int uHasLM; uniform vec4 uLMInfo;
      uniform vec3 uLight, uFogColor, uSunDir, uSun; uniform float uSunAmt; uniform int uDebug; uniform float uFogNear, uFogFar, uLodNear, uLodFar;
      flat in float vYzL; in float vYzW;
      in vec2 vUv1; in vec2 vUv2; flat in vec2 vLayers; in vec3 vWorld; in vec3 vNormal; in float vDist; in vec2 vKO;
      out vec4 fragColor;
      // Tüm hesap orijinaldeki gibi gama uzayında (D3D sabit işlem hattı)
      void main() {
        vec3 cm = uHasCM == 1 ? texture(uColorMap, vKO / uWorld).rgb : vec3(0.35, 0.4, 0.25);
        vec3 col;
        if (vLayers.x >= 0.0) {
          vec3 a = vLayers.x >= ${YUZEY_TABAN}.0 ? (uHasYuzey == 1 ? texture(uYuzey, vec3(vUv1, vLayers.x - ${YUZEY_TABAN}.0)).rgb : cm) : texture(uTiles, vec3(vUv1, vLayers.x)).rgb;   // D3DTOP_SELECTARG1 (yüzey kütüphanesi: GM boyası)
          vec3 b = vLayers.y >= 0.0 ? texture(uTiles, vec3(vUv2, vLayers.y)).rgb : vec3(0.0);
          vec3 tileCol = min(a + b, vec3(1.0));                                         // D3DTOP_ADD
          col = mix(tileCol, cm, smoothstep(uLodNear, uLodFar, vDist));
        } else {
          // renk haritası x Terrain_Base (karo başına 0..1)            D3DTOP_MODULATE
          vec3 det = uHasDetail == 1 ? texture(uDetail, vKO / 4.0).rgb : vec3(1.0);
          col = cm * mix(det, vec3(0.95), smoothstep(uLodNear, uLodFar, vDist));
        }
        // yüzey boyası: köşe ağırlıklarıyla yumuşak karışım; mip'ler sayesinde uzaktan da boyanan renk görünür (renk haritasına dönmez)
        if (uHasYuzey == 1 && vYzL >= 0.0 && vYzW > 0.002) {
          vec2 yuv = vKO / 4.0;
          vec3 yc = textureGrad(uYuzey, vec3(fract(yuv), vYzL), dFdx(yuv), dFdy(yuv)).rgb;
          col = mix(col, yc, clamp(vYzW, 0.0, 1.0));
        }
        col *= uLight;                                                                  // x DIFFUSE (normal = yukarı)
        // ışık haritası: karo başına doku, SRCALPHA / INVSRCALPHA
        if (uHasLM == 1) {
          vec2 t = vKO / 4.0; ivec2 ti = ivec2(floor(t));
          vec4 e = texelFetch(uLMIdx, ivec2(ti.y, ti.x), 0);
          float slot = floor(e.r * 255.0 + 0.5) + floor(e.g * 255.0 + 0.5) * 256.0;
          if (slot > 0.5) {
            slot -= 1.0;
            vec2 f = fract(t);
            vec2 cell = vec2(mod(slot, uLMInfo.y), floor(slot / uLMInfo.y)) * uLMInfo.x;
            vec2 local = vec2(1.0 / 16.0) + vec2(f.x, 1.0 - f.y) * (14.0 / 16.0);
            vec4 lm = texture(uLM, (cell + local * uLMInfo.x) / uLMInfo.zw);
            col = mix(col, lm.rgb * uLight, lm.a);
            if (uDebug == 1) col = mix(col, vec3(1.0, 0.0, 0.0), lm.a);
          }
        }
        // güneş (yalnız güneşli bölgeler): eğime göre aydınlatma — güneşe dönük yamaçlar sıcak ve parlak, arkası gölgede
        if (uSunAmt > 0.0) {
          float nl = max(dot(normalize(vNormal), uSunDir), 0.0);
          vec3 isik = vec3(0.62, 0.66, 0.78) + uSun * (nl * 0.62);   // gökyüzü ortamı (serin) + güneş (sıcak)
          col = mix(col, col * isik, uSunAmt);
        }
        float fog = smoothstep(uFogNear, uFogFar, vDist);
        vec3 fogG = mix(uFogColor * 12.92, 1.055 * pow(uFogColor, vec3(1.0/2.4)) - 0.055, step(0.0031308, uFogColor));
        fragColor = vec4(mix(col, fogG, fog), 1.0);
      }`,
  });
  const group = new THREE.Group(); group.name = 'terrain';
  const chunks = [];
  for (let cx = 0; cx < nCh; cx++) for (let cz = 0; cz < nCh; cz++) {
    const m = new THREE.Mesh(chunkGeo(cx * CH, cz * CH), mat);
    m.name = `terrain_${cx}_${cz}`; m.matrixAutoUpdate = false; group.add(m);
    const bs = m.geometry.boundingSphere; chunks.push({ m, x: bs.center.x, z: bs.center.z, r: bs.radius });
  }
  group.userData.material = mat;
  /** arazi düzenleme (dünya editörü fırçası / gerçek zamanlı değişiklik): karo aralığına değen parçaların geometrisi yeniden kurulur.
   * Yükseklikler z.heights'ten okunur (heightAt aynı diziyi kullanır). Normaller komşu köşeye bağlı olduğu için 1 karo pay bırakılır. */
  group.userData.yenile = (tx0, tz0, tx1, tz1) => {
    const a0 = Math.max(0, Math.floor((tx0 - 1) / CH)), a1 = Math.min(nCh - 1, Math.floor((tx1 + 1) / CH));
    const b0 = Math.max(0, Math.floor((tz0 - 1) / CH)), b1 = Math.min(nCh - 1, Math.floor((tz1 + 1) / CH));
    for (let cx = a0; cx <= a1; cx++) for (let cz = b0; cz <= b1; cz++) {
      const c = chunks[cx * nCh + cz]; if (!c) continue;
      const eski = c.m.geometry; c.m.geometry = chunkGeo(cx * CH, cz * CH); eski.dispose();
      const bs = c.m.geometry.boundingSphere; c.x = bs.center.x; c.z = bs.center.z; c.r = bs.radius;
    }
  };
  group.userData.N = N; group.userData.T = T; group.userData.heights = heights;
  /** yüzey kütüphanesi doku dizisi (boyanmış karolar için) */
  group.userData.yuzeyAyarla = (tex) => { mat.uniforms.uYuzey.value = tex || YUZEY_BOS; mat.uniforms.uHasYuzey.value = tex ? 1 : 0; };
  // boyanmış karo varsa ve uzaktaysa renk haritası yerine karo dokusu kalsın diye: yalnız yakın çizim — mevcut LOD kuralı geçerli
  // uzak parçaları gizle (sis bitişinin ötesi zaten görünmez)
  group.userData.cull = (x, z, dist) => {
    for (const c of chunks) { const lim = dist + c.r; c.m.visible = (c.x - x) ** 2 + (c.z - z) ** 2 < lim * lim; }
  };
  return group;
}

/** Orijinal üçgenlemeye uygun yükseklik (CN3Terrain::GetHeight karşılığı) */
export function makeHeightFn(z) {
  const { N, heights, meta } = z; const T = meta.tileSize;
  const H = (x, zz) => heights[Math.min(N - 1, Math.max(0, x)) * N + Math.min(N - 1, Math.max(0, zz))];
  return (x, zz) => {
    const fx = x / T, fz = zz / T;
    const tx = Math.floor(fx), tz = Math.floor(fz);
    if (tx < 0 || tz < 0 || tx >= N - 1 || tz >= N - 1) return 0;
    const dx = fx - tx, dz = fz - tz;
    const h00 = H(tx, tz), h01 = H(tx, tz + 1), h11 = H(tx + 1, tz + 1), h10 = H(tx + 1, tz);
    if (((tx + tz) & 1) === 1) {
      // köşegen (x,z)-(x+1,z+1)
      return dz > dx ? h00 + (h11 - h01) * dx + (h01 - h00) * dz : h00 + (h10 - h00) * dx + (h11 - h10) * dz;
    }
    // köşegen (x,z+1)-(x+1,z)
    return dx + dz < 1 ? h00 + (h10 - h00) * dx + (h01 - h00) * dz : h11 + (h01 - h11) * (1 - dx) + (h10 - h11) * (1 - dz);
  };
}

/** Arazi yüzey normali (orijinal üçgenlemeye göre; CN3Terrain::GetNormal) */
export function makeNormalFn(z) {
  const { N, heights, meta } = z; const T = meta.tileSize;
  const H = (x, zz) => heights[Math.min(N - 1, Math.max(0, x)) * N + Math.min(N - 1, Math.max(0, zz))];
  const norm = (ax, ay, az, bx, by, bz) => {   // (a x b) yukarı bakacak şekilde
    let x = ay * bz - az * by, y = az * bx - ax * bz, zz = ax * by - ay * bx;
    if (y < 0) { x = -x; y = -y; zz = -zz; }
    const l = Math.hypot(x, y, zz) || 1; return { x: x / l, y: y / l, z: zz / l };
  };
  return (x, zz) => {
    const fx = x / T, fz = zz / T, tx = Math.floor(fx), tz = Math.floor(fz);
    if (tx < 0 || tz < 0 || tx >= N - 1 || tz >= N - 1) return { x: 0, y: 1, z: 0 };
    const dx = fx - tx, dz = fz - tz;
    const h00 = H(tx, tz), h01 = H(tx, tz + 1), h11 = H(tx + 1, tz + 1), h10 = H(tx + 1, tz);
    if (((tx + tz) & 1) === 1) {
      return dz > dx ? norm(0, h01 - h00, T, T, h11 - h00, T) : norm(T, h10 - h00, 0, T, h11 - h00, T);
    }
    return dx + dz < 1 ? norm(T, h10 - h00, 0, 0, h01 - h00, T) : norm(-T, h01 - h11, 0, 0, h10 - h11, -T);
  };
}
