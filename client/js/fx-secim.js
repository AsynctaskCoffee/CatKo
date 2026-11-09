// KO seçim / hedef işaretleri (deadsoft fx): yere tıklayınca target_pointer.fxb (sarı halka, ok ve ışık),
// seçili canavar altında 2009_select_enemyl.fxb (düşman: dönen oklar), seçili NPC / dost altında 2009_select_friend.fxb (yeşil).
// Kütüphane: assets/fxsecim (tools/convert/fx.js, FXFILES=target_pointer.fxb,2009_select_enemyl.fxb,2009_select_friend.fxb).
import * as THREE from '../vendor/three.module.min.js';
import { fxEkle } from './fx.js';

let hazirP = null;
const hazir = () => (hazirP ||= fxEkle('./assets/fxsecim').then(() => true, () => false));

/** state: oyunun state'i (state.fx), fxAd: efekt dosyası. goster(kaynak: () => Vector3 | null, olcek) her karede çağrılabilir */
export function secimTakip(state, fxAd) {
  let b = null, kaynak = null, olcek = 1, bekliyor = false, son = null;
  const v = new THREE.Vector3();
  const kapat = () => { if (b) { b.stop?.(); b.dispose?.(); b = null; } };
  return {
    goster(k, s = 1, { yeniden = false, yon = null } = {}) {
      if (yeniden) kapat();
      if (k !== kaynak || s !== olcek) { kapat(); kaynak = k; olcek = s; }
      if ((b && !b.dead) || bekliyor || !state.fx) return;
      bekliyor = true;
      hazir().then((ok) => {
        bekliyor = false;
        if (!ok || kaynak !== k || !state.fx || (b && !b.dead)) return;
        const p0 = k(); if (!p0) return;
        b = state.fx.play(fxAd, { pos: p0, loop: true, scale: s, follow: () => { const p = kaynak?.(); return p ? v.copy(p) : null; }, yon });   // yon: () => Quaternion (seçili NPC dönünce oklar da döner)
        son = p0.clone?.() || null;
      });
    },
    gizle() { kaynak = null; kapat(); },
    get acik() { return !!b && !b.dead; },
    get son() { return son; },
  };
}
