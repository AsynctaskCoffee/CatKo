// Otomatik sohbet mesajları:
// 1) KO NPC bağırmaları (KnightOnlineEn Data\NPC_Shout_us.tbl → assets/gorev/npc_bagir.json: npc → [[ağırlık, metin]]):
//    yakındaki (25 m) NPC'ler ara ara konuşur — başının üstünde KO NPC balonu + sohbet satırı "[Trader] Moira : …". <selfname> → karakter adı.
// 2) Sunucu otomatik duyuruları (oto_duyuru, RPC oto_duyuru_liste): "#### Notice : … ####" sarı satır; her duyuru kendi aralığında
//    (aralık / ofset dakika, gerçek saate göre — tüm oyuncular aynı anda görür).
const ARALIK = [70, 160];   // sn: bir NPC'nin iki konuşması arası (rastgele)
const MESAFE = 25;

export function initOtoSohbet({ state, player, sb, character, say, bubble }) {
  const ad = String(character?.name || '');
  let B = null; const sonra = new Map();
  fetch('./assets/gorev/npc_bagir.json').then((r) => r.json()).then((d) => { B = d; }).catch(() => {});
  const sec = (L) => { const t = L.reduce((a, x) => a + (Number(x[0]) || 0), 0) || L.length; let r = Math.random() * t; for (const x of L) { r -= Number(x[0]) || 1; if (r <= 0) return x[1]; } return L[L.length - 1][1]; };
  setInterval(() => {
    if (!B || !player || document.hidden) return;
    const list = state.npcs?.list || [], now = performance.now();
    for (const e of list) {
      const L = B[e.n?.id]; if (!L?.length || !e.holder?.visible) continue;
      const p = e.holder.position, dx = p.x - player.position.x, dz = p.z - player.position.z;
      if (dx * dx + dz * dz > MESAFE * MESAFE) continue;
      const k = e.n.id + ':' + (e.n.pid ?? ''), t = sonra.get(k);
      if (t == null) { sonra.set(k, now + (8 + Math.random() * 40) * 1000); continue; }   // yeni yaklaşılan NPC: hemen değil
      if (now < t) continue;
      sonra.set(k, now + (ARALIK[0] + Math.random() * (ARALIK[1] - ARALIK[0])) * 1000);
      const m = String(sec(L)).replace(/<selfname>/gi, ad).trim(); if (!m) continue;
      bubble?.(e.holder, e.tag, m);
      // NPC konuşma balonu sohbete yazılmaz (yalnız balon)
    }
  }, 2000);

  // sunucu otomatik duyuruları
  let D = [];
  const yukle = () => sb?.rpc('oto_duyuru_liste', { p_server: character?.server_id ?? null }).then(({ data }) => { if (Array.isArray(data)) D = data; }).catch(() => {});
  yukle(); setInterval(yukle, 600000);
  addEventListener('ko-oto-duyuru-yenile', yukle);   // GM paneli değişiklik yaptı
  // GM paneli "Sohbette önizle": yalnız bu oyuncunun sohbetine bir kez
  const yaz = (metin, renk) => { say?.(String(metin), 'oto-duyuru'); if (renk) { const s = document.querySelector('#sohbet-mesajlar > .oto-duyuru:last-child'); s?.style.setProperty('color', renk, 'important'); } };
  addEventListener('ko-oto-duyuru-onizle', (e) => { const d = e.detail || {}; if (d.metin) yaz(d.metin, d.renk); });
  const gosterilen = new Map();
  setInterval(() => {
    const dk = Math.floor(Date.now() / 60000);
    for (const d of D) {
      const a = Math.max(5, Number(d.aralik) || 30), slot = Math.floor((dk - (Number(d.ofset) || 0)) / a);
      if (!gosterilen.has(d.id)) { gosterilen.set(d.id, slot); continue; }   // girişte bekleyen duyuru hemen basılmaz
      if (gosterilen.get(d.id) === slot) continue;
      gosterilen.set(d.id, slot);
      yaz(d.metin, d.renk);
    }
  }, 15000);
}
