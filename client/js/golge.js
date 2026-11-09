// Hafif karakter gölgeleri (Seçenekler → DirectX): oyuncu, diğer oyuncular, canavarlar, NPC'ler ve petlerin ayak altında
// yumuşak, yarı saydam bir leke. Tek InstancedMesh → tek çizim çağrısı. DX-11: yumuşak, güneşin tersine hafif uzayan gölge;
// DX-9: KO'nun klasik koyu yuvarlak gölgesi.
import * as THREE from '../vendor/three.module.min.js';

const MAX = 256, MESAFE = 70;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _b = new THREE.Box3(), _v = new THREE.Vector3();
const YUKARI = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export function createGolgeler({ world, player, remotes }) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    uniforms: { ...THREE.UniformsLib.fog, uGuc: { value: 0.38 }, uYumusak: { value: 1 } },
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uGuc, uYumusak; varying vec2 vUv;
      void main() {
        float d = length(vUv);
        float a = uGuc * (1.0 - smoothstep(1.0 - uYumusak, 1.0, d));
        if (a < 0.003) discard;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
        #ifdef USE_FOG
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          gl_FragColor.a *= 1.0 - fogFactor;
        #endif
      }`,
  });
  const geo = new THREE.PlaneGeometry(2, 2);
  const im = new THREE.InstancedMesh(geo, mat, MAX);
  im.frustumCulled = false; im.renderOrder = 2; im.count = 0; im.name = 'golgeler';
  world.add(im);
  let acik = true, dx11 = true, uzat = new THREE.Vector2(0, 0);

  const yaricap = (o) => {
    if (o.userData.golgeR) return o.userData.golgeR;
    const n = o.children.length;
    if (o.userData._grN === n && o.userData._gr) return o.userData._gr;
    let r = 0.6;
    try {
      _b.makeEmpty();
      o.updateWorldMatrix(true, true);
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
      o.traverse((c) => {
        if (!c.isMesh || !c.geometry || c.userData.seg != null || c === im) return;
        if (c.material?.transparent && c.material.blending === THREE.AdditiveBlending) return;
        c.geometry.boundingBox || c.geometry.computeBoundingBox();
        _b.union(c.geometry.boundingBox.clone().applyMatrix4(_m.multiplyMatrices(inv, c.matrixWorld)));
      });
      if (!_b.isEmpty()) { _b.getSize(_v); r = Math.max(_v.x, _v.z) * 0.42 * Math.abs(o.scale.x || 1); }
    } catch {}
    r = Math.min(3.2, Math.max(0.45, r || 0.6));
    o.userData._grN = n; o.userData._gr = r;
    return r;
  };

  const koy = (o, cam, i) => {
    if (!o || !o.visible || i >= MAX) return i;
    const x = o.position.x, z = o.position.z;
    if ((x - cam.x) ** 2 + (z - cam.z) ** 2 > MESAFE * MESAFE) return i;
    const r = yaricap(o);
    // DX-11: gölge güneşin tersine biraz uzar ve kayar (yumuşak, atmosferik); DX-9: tam altında yuvarlak
    const ux = dx11 ? uzat.x * r * 0.35 : 0, uz = dx11 ? uzat.y * r * 0.35 : 0;
    _p.set(x + ux, o.position.y + 0.06, z + uz);
    _s.set(r * (dx11 ? 1.25 : 1), r * (dx11 ? 1.0 : 0.85), 1);
    _q.copy(YUKARI);
    if (dx11 && (ux || uz)) _q.premultiply(new THREE.Quaternion().setFromAxisAngle(_v.set(0, 1, 0), Math.atan2(-uz, ux)));
    _m.compose(_p, _q, _s);
    im.setMatrixAt(i, _m);
    return i + 1;
  };

  return {
    ayarla({ golge = true, dx = 'dx11', golgeGuc = 45 } = {}) {
      acik = !!golge; dx11 = dx !== 'dx9';
      im.visible = acik;
      mat.uniforms.uGuc.value = (dx11 ? 0.55 : 0.7) * (golgeGuc / 100);
      mat.uniforms.uYumusak.value = dx11 ? 0.85 : 0.35;
    },
    gunes(dir) { if (dir) { uzat.set(-dir.x, dir.z); if (uzat.lengthSq() > 1e-6) uzat.normalize(); } },
    update(cam) {
      if (!acik) return;
      let i = 0;
      i = koy(player, cam, i);
      for (const r of remotes.values()) i = koy(r.obj, cam, i);
      for (const c of world.children) {
        if (c.name !== 'npcs' && c.name !== 'pet') continue;
        for (const o of c.children) { if (!o.isGroup && !o.isObject3D) continue; i = koy(o, cam, i); }
      }
      im.count = i;
      if (i) im.instanceMatrix.needsUpdate = true;
    },
  };
}
