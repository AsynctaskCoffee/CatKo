// Kasaba muhafızları (Moradon, El Morad / Karus kasabası "Guard" / "Elite Guard"): 15 m içindeki moblara, kale muhafızları ayrıca
// düşman ulustan oyunculara vurur. Sunucu: muhafizlar tablosu + muhafiz_tik RPC (bölgedeki her istemci ~1,5 sn'de bir çağırır; her muhafız
// kendi aralığıyla tek vuruş yapar, mob karşılık verir, canı biten muhafız ölür ve süre sonunda yeniden doğar).
// Görsel: muhafizlar realtime değişikliği → muhafız hedefine döner, saldırı animasyonu, hasar yazısı; ölünce yere yığılır, gizlenir, doğunca geri gelir.
import * as THREE from '../vendor/three.module.min.js';

export const MUHAFIZ_BOLGE = new Set(['moradon', 'elmo2004', 'karus2004']);

export function initMuhafiz({ sb, character, state, player, zone }) {
  if (!MUHAFIZ_BOLGE.has(zone)) return null;
  const durum = new Map();   // placement_id → satır
  const npc = (pid) => state.npcs?.byPid?.(pid);
  const yaziKonum = new THREE.Vector3();
  function goster(r, eski) {
    const e = npc(r.placement_id); if (!e) return;
    const olu = r.olu_bitis && new Date(r.olu_bitis).getTime() > Date.now();
    const oluydu = eski?.olu_bitis && new Date(eski.olu_bitis).getTime() > Date.now();
    if (olu && !oluydu) {   // öldü: yere yığılır, 3 sn sonra gizlenir
      e.api?.playOnce?.('dead', { hold: true });
      clearTimeout(e._mhT); e._mhT = setTimeout(() => { e.oluGizli = true; }, 3000);
      return;
    }
    if (!olu && (oluydu || e.oluGizli)) { clearTimeout(e._mhT); e.oluGizli = false; e.api?.stopOnce?.(); e.api?.setClip?.('breath'); }
    // yeni vuruş: hedefe dön, saldır
    if (r.son_vurus && r.son_vurus !== eski?.son_vurus && !olu) {
      let hx = null, hz = null, hedefPos = null;
      if (r.hedef_mob != null) { const m = state.combat?.mobs?.get?.(r.hedef_mob) || state.combat?.mobs?.get?.(Number(r.hedef_mob)); if (m?.pos) { hx = m.pos.x; hz = m.pos.z; hedefPos = m.pos; } }
      else if (r.hedef_char != null) {
        if (Number(r.hedef_char) === Number(character.id)) { hx = player.position.x; hz = player.position.z; }
        else { const o = state.uzakKonum?.(r.hedef_char); if (o) { hx = o.x; hz = o.z; } }
      }
      if (hx != null) e.holder.rotation.y = Math.atan2(hx - e.holder.position.x, hz - e.holder.position.z);
      const klip = e.api?.has?.('attack1') && Math.random() < 0.5 ? 'attack1' : 'attack';
      e.api?.playOnce?.(e.api?.has?.(klip) ? klip : 'attack', { speed: 0.9 });
      void hedefPos; void yaziKonum;
    }
  }
  async function yukle() {
    const { data } = await sb.from('muhafizlar').select('*').eq('zone', zone);
    for (const r of data || []) { const eski = durum.get(r.placement_id); durum.set(r.placement_id, r); goster(r, eski); }
  }
  yukle().catch(() => {});
  try {
    sb.channel('muhafiz-' + zone).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'muhafizlar', filter: `zone=eq.${zone}` }, (p) => {
      const r = p.new; if (!r) return; const eski = durum.get(r.placement_id); durum.set(r.placement_id, r); goster(r, eski);
    }).subscribe();
  } catch {}
  // vuruş döngüsü: oyuncu bölgedeyken, yaşıyorken
  let mesgul = false;
  const tik = async () => {
    if (mesgul || document.hidden || !state.combat || state.frozen) return;
    mesgul = true;
    try {
      const p = player.position;
      const { data, error } = await sb.rpc('muhafiz_tik', { p_char: character.id, p_x: +p.x.toFixed(2), p_z: +p.z.toFixed(2) });
      if (error || !data?.ok) return;
      for (const o of data.olaylar || []) {
        if (o.m != null && o.d) {   // mob hasar yazısı
          const m = state.combat.mobs?.get?.(o.m);
          if (m?.pos) state.combat.floatText?.(new THREE.Vector3(m.pos.x, (m.pos.y || 0) + 2.2, m.pos.z), String(o.d), 'muhafiz', true);
        }
      }
      if (data.ben?.ok) state.combat.hurt?.(data.ben, 'Muhafız');
    } catch {} finally { mesgul = false; }
  };
  const t = setInterval(tik, 1500);
  // ölü muhafızların doğuşu (realtime gelmezse de zamanında görünsün)
  const t2 = setInterval(() => { for (const r of durum.values()) if (r.olu_bitis && new Date(r.olu_bitis).getTime() <= Date.now()) { const e = npc(r.placement_id); if (e?.oluGizli) { e.oluGizli = false; e.api?.stopOnce?.(); } } }, 2000);
  return { kapat() { clearInterval(t); clearInterval(t2); } };
}
