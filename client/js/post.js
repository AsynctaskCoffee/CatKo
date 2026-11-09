// Ekran sonrası işlem (Seçenekler): bulanıklık, keskinlik, netlik, görünüm modu (renk), parlaklık.
// Hepsi varsayılandaysa sahne doğrudan ekrana çizilir (ek maliyet yok).
import * as THREE from '../vendor/three.module.min.js';

export const MODES = {
  normal: { label: 'Normal', sat: 1, con: 1, tint: [1, 1, 1], vig: 0, gray: 0 },
  canli: { label: 'Canlı', sat: 1.3, con: 1.08, tint: [1, 1, 1], vig: 0, gray: 0 },
  sinema: { label: 'Sinematik', sat: 0.88, con: 1.12, tint: [1.05, 1.0, 0.92], vig: 0.45, gray: 0 },
  // Klasik KO: kullanıcının KO ekran görüntüsüne göre (Moradon, 606/467): DX-11 ekran efektleri yok (ton eşleme, parlama, pus), renkler
  // KO'daki gibi hafif soluk ve yeşile çalan (çimen S≈0,38 H≈72°, toprak kahve-gri), biraz daha koyu ve kontrastlı
  klasik: { label: 'Klasik KO', sat: 0.72, con: 1.06, tint: [0.95, 1.03, 0.98], vig: 0, gray: 0, vib: 0, bright: 0.95, saf: true },
  gece: { label: 'Gece', sat: 0.7, con: 1.05, tint: [0.78, 0.86, 1.12], vig: 0.35, gray: 0 },
  sb: { label: 'Siyah-beyaz', sat: 1, con: 1.1, tint: [1, 1, 1], vig: 0.25, gray: 1 },
};

export function createPost(renderer) {
  const size = new THREE.Vector2();
  // Sahne her zamanki gibi ekrana çizilir, sonra ekranın kendisi (gösterilen sRGB değerleri, kenar yumuşatmalı)
  // dokuya kopyalanır ve işlenip geri çizilir → renk uzayı dönüşümü yok, tüm malzemeler aynı görünür.
  let ft = null;
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
    uniforms: {
      tMap: { value: null }, uTexel: { value: new THREE.Vector2() },
      uBlur: { value: 0 }, uSharp: { value: 0 }, uClarity: { value: 0 }, uBright: { value: 1 },
      uSat: { value: 1 }, uCon: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uVig: { value: 0 }, uGray: { value: 0 }, uVib: { value: 0 }, uRGB: { value: new THREE.Vector3(1, 1, 1) },
      uTone: { value: 0 }, uBloom: { value: 0 }, uGrade: { value: 0 }, uHaze: { value: 0 }, uHazeCol: { value: new THREE.Vector3(0.55, 0.72, 0.85) },
    },
    vertexShader: /* glsl */`
      out vec2 vUv;
      void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tMap; uniform vec2 uTexel;
      uniform float uBlur, uSharp, uClarity, uBright, uSat, uCon, uVig, uGray, uVib, uTone, uBloom, uGrade, uHaze; uniform vec3 uTint, uRGB, uHazeCol;
      in vec2 vUv; out vec4 fragColor;
      vec3 box(vec2 uv, float r) {   // 9 örnekli yumuşak ortalama, yarıçap r piksel
        vec2 d = uTexel * r;
        vec3 c = texture(tMap, uv).rgb * 4.0;
        c += (texture(tMap, uv + vec2(d.x, 0.0)).rgb + texture(tMap, uv - vec2(d.x, 0.0)).rgb + texture(tMap, uv + vec2(0.0, d.y)).rgb + texture(tMap, uv - vec2(0.0, d.y)).rgb) * 2.0;
        c += texture(tMap, uv + d).rgb + texture(tMap, uv - d).rgb + texture(tMap, uv + vec2(d.x, -d.y)).rgb + texture(tMap, uv + vec2(-d.x, d.y)).rgb;
        return c / 16.0;
      }
      void main() {
        vec3 src = texture(tMap, vUv).rgb;
        vec3 col = uBlur > 0.01 ? box(vUv, uBlur) : src;
        if (uSharp > 0.001) col += (src - box(vUv, 1.0)) * uSharp;                         // keskinlik: ince ayrıntı
        if (uClarity > 0.001) {                                                            // netlik: orta ton yerel kontrast
          vec3 wide = box(vUv, 5.0); float l = dot(col, vec3(0.299, 0.587, 0.114));
          col += (col - wide) * uClarity * (1.0 - abs(l * 2.0 - 1.0));
        }
        // ---- DX-11 görünümü: ışık parlaması (bloom), HDR ton eşleme (ACES), renk derecelendirmesi, atmosferik pus
        if (uBloom > 0.001) {   // parlak bölgelerden iki halkalı yumuşak taşma (12+12 örnek)
          vec3 b = vec3(0.0);
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 0.5235988;
            vec2 o = vec2(cos(a), sin(a)) * uTexel;
            b += max(texture(tMap, vUv + o * 5.0).rgb - 0.6, 0.0);
            b += max(texture(tMap, vUv + o * 13.0).rgb - 0.6, 0.0) * 0.7;
          }
          col += b / 12.0 * uBloom;
        }
        if (uTone > 0.001) {    // sRGB → doğrusal → ACES (film eğrisi) → sRGB; parlaklar yumuşar, gölgeler derinleşir
          vec3 l = pow(max(col, 0.0), vec3(2.2)) * 0.85;
          vec3 t = clamp((l * (2.51 * l + 0.03)) / (l * (2.43 * l + 0.59) + 0.14), 0.0, 1.0);
          col = mix(col, pow(t, vec3(1.0 / 2.2)), uTone);
        }
        if (uGrade > 0.001) {   // Deadsoft tonları: sıcak ışıklar, hafif serin gölgeler, biraz daha doygun
          float L = dot(col, vec3(0.299, 0.587, 0.114));
          vec3 g = col * mix(vec3(0.95, 0.98, 1.05), vec3(1.05, 1.01, 0.94), smoothstep(0.15, 0.85, L));
          float L2 = dot(g, vec3(0.299, 0.587, 0.114)); g = mix(vec3(L2), g, 1.1);
          col = mix(col, g, uGrade);
        }
        if (uHaze > 0.001) {    // havadaki mavi pus: koyu tonlar sis rengine doğru hafif açılır
          float L = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, uHazeCol, uHaze * (0.144 * (1.0 - L) + 0.06));   // pus: koyu tonlar sis rengine açılır + tüm görüntüye hafif puslu örtü
        }
        col *= uBright * uTint * uRGB;   // kullanıcı R-G-B kazancı
        col = (col - 0.5) * uCon + 0.5;
        float g = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(g), col, uSat); col = mix(col, vec3(g), uGray);
        if (uVib > 0.001) {   // canlılık (vibrance): soluk renkler daha çok doyurulur → rengarenk, ten/gökyüzü patlamaz
          float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b)), g2 = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(g2), col, 1.0 + uVib * (1.0 - clamp((mx - mn) * 1.6, 0.0, 1.0)));
        }
        vec2 q = vUv - 0.5; col *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
        fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), mat);
  quad.frustumCulled = false;
  const pScene = new THREE.Scene(); pScene.add(quad);
  const pCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let active = false;
  const U = mat.uniforms;
  return {
    set(o) {
      const m = MODES[o.mode] || MODES.normal;
      U.uBlur.value = (o.blur || 0) / 100 * 3;
      U.uSharp.value = (o.sharp || 0) / 100 * 1.6 + (m.sharp || 0);
      U.uClarity.value = (o.clarity || 0) / 100 * 0.9 + (m.clarity || 0);
      U.uBright.value = (o.bright ?? 100) / 100 * (m.bright || 1); U.uVib.value = m.vib || 0;
      U.uRGB.value.set((o.r ?? 100) / 100, (o.g ?? 100) / 100, (o.b ?? 100) / 100);
      U.uSat.value = m.sat; U.uCon.value = m.con; U.uTint.value.set(...m.tint); U.uVig.value = m.vig; U.uGray.value = m.gray;
      const dx11 = o.dx !== 'dx9';
      const fx11 = dx11 && !m.saf;   // Klasik KO: DX-11 ekran efektleri (ton eşleme, parlama, pus) uygulanmaz
      U.uTone.value = fx11 && o.dxTone !== false ? 0.85 : 0;
      U.uBloom.value = fx11 ? (o.dxBloom ?? 45) / 100 * 0.9 : 0;
      U.uGrade.value = 0;   // 'Deadsoft renk tonları' kaldırıldı
      U.uHaze.value = fx11 ? (o.dxHaze ?? 40) / 100 : 0;   // (7.11) DX-9 / Klasik: pus yok (görüntü puslu / bulanık görünmesin)   // klasik modda da hafif pus (oyun biraz puslu)
      active = U.uTone.value > 0 || U.uBloom.value > 0 || U.uGrade.value > 0 || U.uHaze.value > 0 || U.uBlur.value > 0.01 || U.uSharp.value > 0.001 || U.uClarity.value > 0.001 || Math.abs(U.uBright.value - 1) > 0.001 || U.uRGB.value.x !== 1 || U.uRGB.value.y !== 1 || U.uRGB.value.z !== 1 || o.mode && o.mode !== 'normal';
    },
    sisRengi(c) { if (c) U.uHazeCol.value.set(c.r, c.g, c.b); },
    render(scene, camera) {
      if (!active) { renderer.render(scene, camera); return; }
      renderer.getDrawingBufferSize(size);
      if (!ft || ft.image.width !== size.x || ft.image.height !== size.y) {
        ft?.dispose(); ft = new THREE.FramebufferTexture(size.x, size.y);
        ft.minFilter = ft.magFilter = THREE.LinearFilter; U.tMap.value = ft;
      }
      U.uTexel.value.set(1 / size.x, 1 / size.y);
      renderer.render(scene, camera);
      renderer.copyFramebufferToTexture(ft);
      renderer.render(pScene, pCam);
    },
  };
}
