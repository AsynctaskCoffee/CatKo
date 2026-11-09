// GM yardımcısı (GM Paneli → GM karakterim → "GM yardımcısı"): GM'i sürekli izleyen, en fazla 3 m yaklaşan görsel bir mob.
// Model Dönüşüm listesinden seçilir (mob / NPC görünümü), adı ve ad rengi değiştirilebilir, ölçeği ayarlanır. Sunucuda mob değildir:
// saldırılamaz, hasar almaz, kimseye vurmaz. Diğer oyuncular da görür (presence 'yd': { m, a, r, s }).
// Modelin KO efektleri (n3fxplug: Arc Demon'un mor alevleri vb.) dönüşümdeki gibi eklemlerine bağlanır ve herkes görür.
import * as THREE from '../vendor/three.module.min.js';
import { hasNpc, createNpc, hasMonster, createMonster } from './character.js';
import { mobFxTak } from './mobfx.js';

export const YARDIMCI_VARSAYILAN = { aktif: false, m: 'npc_9924', a: 'MineGuard', r: '#ff4040', s: 100 };
export function yardimciAyar() { try { return { ...YARDIMCI_VARSAYILAN, ...JSON.parse(localStorage.getItem('ko-gm-yardimci') || '{}') }; } catch { return { ...YARDIMCI_VARSAYILAN }; } }
export function yardimciKaydet(v) { try { localStorage.setItem('ko-gm-yardimci', JSON.stringify(v)); } catch {} }

/** world: KO koordinatlı dünya grubu; nameSprite(text, color, opts) → isim etiketi; heightAt(x, z) */
export function initYardimci({ world, nameSprite, heightAt, fx = null }) {
  const canli = new Map();   // sahip anahtarı → { cfgK, g, api, tag, sahip }
  function kaldir(k) { const o = canli.get(k); if (!o) return; o.bitti = true; o.api?._mobFx?.dur(); o.g.removeFromParent(); canli.delete(k); }
  /** sahip: THREE.Object3D (oyuncu ya da uzak oyuncu), cfg: { m, a, r, s } ya da null */
  function ayarla(k, sahip, cfg) {
    const cfgK = cfg ? JSON.stringify([cfg.m, cfg.a, cfg.r, cfg.s]) : null, o = canli.get(k);
    if (!cfg) return kaldir(k);
    if (o && o.cfgK === cfgK) { o.sahip = sahip; return; }
    const eski = o; kaldir(k);
    const g = new THREE.Group(); g.name = 'gm-yardimci';
    const p = sahip.position;
    if (eski) g.position.copy(eski.g.position); else g.position.set(p.x + 2, p.y, p.z + 2);
    world.add(g);
    const yeni = { cfgK, g, api: null, tag: null, sahip, bitti: false, klip: '' };
    canli.set(k, yeni);
    const olc = Math.max(0.1, Math.min(5, (Number(cfg.s) || 100) / 100));
    const key = String(cfg.m || '');
    // model kataloğu (NPC / mob) oyuna girişte henüz yüklenmemiş olabilir: hazır olana dek bekle
    (async () => {
      for (let i = 0; i < 120 && !hasNpc(key) && !hasMonster(key); i++) { await new Promise((r) => setTimeout(r, 250)); if (yeni.bitti) return null; }
      return hasNpc(key) ? createNpc(key) : hasMonster(key) ? createMonster(key) : createNpc(key);
    })().then((api) => {
      if (yeni.bitti || !api) return;
      yeni.api = api; api.group.scale.multiplyScalar(olc); g.add(api.group); api.setClip?.('breath');
      g.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(api.group, true);
      const tag = nameSprite(String(cfg.a || 'MineGuard').slice(0, 24), cfg.r || '#ff4040', { kind: 'canavar' });
      tag.position.y = (b.isEmpty() ? 2 : b.max.y - g.position.y) + 0.35; g.add(tag); yeni.tag = tag;
      // canavarın kendi efektleri (dönüşümdeki gibi): ölçekle birlikte büyür
      mobFxTak(api, key, fx || (() => window.__ko?.state?.fx), olc).then(() => { if (yeni.bitti) api._mobFx?.dur(); }).catch(() => {});
    }).catch(() => {});
  }
  const _h = new THREE.Vector3();
  function update(dt) {
    for (const o of canli.values()) {
      const s = o.sahip?.position; if (!s) continue;
      const g = o.g, dx = s.x - g.position.x, dz = s.z - g.position.z, d = Math.hypot(dx, dz);
      let klip = 'breath';
      if (d > 40) { g.position.set(s.x - dx / d * 2.5, s.y, s.z - dz / d * 2.5); }   // ışınlanma: hemen yanına
      else if (d > 3) {   // 3 m'ye kadar yaklaş (uzaksa koşar)
        const hiz = d > 8 ? 7.5 : 3.2, adim = Math.min(d - 2.6, hiz * dt);
        g.position.x += dx / d * adim; g.position.z += dz / d * adim; klip = d > 8 ? 'run' : 'walk';
        g.rotation.y = Math.atan2(dx, dz);
      } else if (d > 0.01) {
        const hedef = Math.atan2(dx, dz); let fark = ((hedef - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI; g.rotation.y += fark * Math.min(1, dt * 3);
      }
      const y = heightAt?.(g.position.x, g.position.z); g.position.y = Number.isFinite(y) ? y : s.y;
      if (o.api) {
        if (o.klip !== klip) { o.klip = klip; o.api.setClip?.(o.api.has?.(klip) ? klip : 'breath'); }
        o.api.update?.(dt);
      }
      g.visible = o.sahip.visible !== false;
      void _h;
    }
  }
  return { ayarla, kaldir, update, get liste() { return canli; } };
}
