// KO [Spirit of Logos] (NPC 25178…, model npc_14002 — Raiba taşı + obj_04el_graiba_fx efekti):
// bölgede tanımlı yerlerin (Moradon'da 8) yalnız birinde, 4 saatte bir doğar (sunucu _logos_aktif: dönem = 4 saat, yer dönemden seçilir).
// Sağ tık → dört güçlendirmeden biri (1 saat): saldırı +%20, savunma +400, EXP +%100, NP +10. Biri seçince Logos o dönem kaybolur.
import * as THREE from '../vendor/three.module.min.js';
import { npcMenuAc, npcMenuKapat } from './npc-menu.js';

const AD = '[Spirit of Logos]';
let durum = { pid: null }, npcs = null, sbRef = null, zoneRef = null, zam = 0;

export const logosMu = (n) => String(n?.n || '').trim() === AD;

function uygula() {
  if (!npcs) return;
  for (const e of npcs.list || []) if (logosMu(e.n)) {
    e.logosGizli = Number(e.n.pid) !== Number(durum.pid);
    if (e.logosGizli && npcs.selected === e) npcs.select?.(null);
  }
}
async function yenile() {
  if (!sbRef) return;
  const { data } = await sbRef.rpc('logos_durum', { p_zone: zoneRef }).then((r) => r, () => ({}));
  if (data) durum = data;
  uygula();
  // dönem bitince (yeni yer) hemen yenile
  clearTimeout(zam); zam = setTimeout(yenile, Math.max(5, Math.min(60, Number(durum.kalan) || 60)) * 1000 + 500);
}

/** oyun içinde: npcs (spawnNpcs api), sb, zone */
export function logosKur({ npcs: n, sb, zone }) {
  if (!(n?.list || []).some((e) => logosMu(e.n))) return;
  npcs = n; sbRef = sb; zoneRef = zone;
  uygula(); yenile();
}

const SECIM = [
  { tip: 'saldiri', ad: 'Attack power increase', etki: 'Attack +20%' },
  { tip: 'savunma', ad: 'Defense increase', etki: 'Defense +400' },
  { tip: 'exp', ad: 'Experience increase', etki: 'EXP +100%' },
  { tip: 'np', ad: 'National Point increase', etki: 'NP +10' },
];

export function logosMenu({ sb, character, hud, state, e, player }) {
  const ad = e.n.n, model = e.n.m;
  const al = async (b) => {
    const { data: d, error } = await sb.rpc('logos_al', { p_char: character.id, p_tip: b.tip });
    if (error) { hud.notice?.(error.message, 'hata'); return; }
    if (!d?.ok) { hud.notice?.(d?.reason || 'Failed.', 'hata'); npcMenuKapat(); yenile(); return; }
    state.combat?.odulUygula?.({ hp: d.hp, max_hp: d.max_hp, mp: d.mp, max_mp: d.max_mp });
    state.inv?.stats?.();
    dispatchEvent(new CustomEvent('ko-etki', { detail: { id: d.skill, ad: d.ad, sure: d.sure, tip: 'buff', anahtar: 'buff:logos', aciklama: `${b.etki} for 1 hour.` } }));
    // KO: güçlendirme efekti oyuncunun üstünde, Logos ışığı söner
    const p = (player || state.player)?.position; if (p && state.fx?.play) { const v = new THREE.Vector3(); state.fx.play(702, { follow: () => v.set(p.x, p.y, -p.z) }); }
    hud.info?.(`You have received the ${d.ad}. (1 hour)`, 'beceri');
    npcMenuKapat();
    durum = { ...durum, pid: null }; uygula();
  };
  npcMenuAc({ ad, model,
    metin: 'The will of Logos, God of regulation, dwells in this light.\nChoose one blessing. Once a blessing has been granted, the spirit will disappear.\n\nEach blessing lasts 1 hour.',
    secenekler: [
      ...SECIM.map((b) => ({ ad: `${b.ad} — ${b.etki}`, html: `${b.ad}&nbsp;<span class="npm-gri">(${b.etki})</span>`, kalsin: true, fn: () => al(b) })),
      { ad: 'Close', html: '<span class="npm-kirmizi">Close</span>', fn: () => npcMenuKapat() },
    ] });
}
