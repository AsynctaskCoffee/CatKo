// Moradon ışınlanma kapısı (KO: obj_el_potal_gate_2005, kasabanın doğusunda). Tıklayınca kapıya yürür, KO re_warp penceresi açılır.
// Liste (warpinfo.tbl): Folk Village, El Morad Castle, Luferson Castle (kendi ulusu), Ardream. Sunucu: warp_git(p_char, p_hedef, p_x, p_z).
import * as THREE from '../vendor/three.module.min.js';
import { hasLayout, buildLayout, draggable } from './kui.js';

export const KAPI = { zone: 'moradon', x: 837.4, y: 5.2, z: 526.8 };
// Moradon'da iki kapı: doğuda El Morad kapısı (obj_el_potal_gate_2005), batıda Karus kapısı (obj_2005_potal_karu)
const KAPI_BOLGE = {
  moradon: [
    { ulus: 2, ad: 'El Morad Warp Gate', x: 837.4, y: 5.2, z: 526.8, hedef: ['folk', 'elmo', 'ardream', 'ronark', 'ronarkbase'] },
    { ulus: 1, ad: 'Karus Warp Gate', x: 797.7, y: 5.0, z: 526.9, hedef: ['folk', 'luferson', 'ardream', 'ronark', 'ronarkbase'] },
  ],
  // Ardream: ulus base'lerindeki ışınlanma kapıları (el_bindpoint01 / ka_bindpoint01) — Moradon ve kendi kalesi
  freezone_a: [
    { ulus: 2, ad: 'El Morad Warp Gate', x: 203.8, y: 75.6, z: 907.5, boy: 7, gen: 3, hedef: ['moradon', 'elmo'] },
    { ulus: 1, ad: 'Karus Warp Gate', x: 840.5, y: 77.0, z: 125.5, boy: 7, gen: 3, hedef: ['moradon', 'luferson'] },
  ],
  // Ronark Land / Ronark Land Base: deadsoft K_OBJECTPOS tür 5 ulus kapıları — Moradon ve kendi kalesi (Ardream gibi)
  freezone_b: [
    { ulus: 2, ad: 'El Morad Warp Gate', x: 622.0, y: 11.6, z: 911.0, boy: 7, gen: 3, hedef: ['moradon', 'elmo'] },
    { ulus: 1, ad: 'Karus Warp Gate', x: 1375.0, y: 11.6, z: 1085.0, boy: 7, gen: 3, hedef: ['moradon', 'luferson'] },
  ],
  freezone_c: [
    { ulus: 2, ad: 'El Morad Warp Gate', x: 526.3, y: 7.5, z: 915.8, boy: 7, gen: 3, hedef: ['moradon', 'elmo'] },
    { ulus: 1, ad: 'Karus Warp Gate', x: 502.4, y: 7.5, z: 104.6, boy: 7, gen: 3, hedef: ['moradon', 'luferson'] },
  ],
};
let KAPILAR = KAPI_BOLGE.moradon;
const UZAK = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? './zones' : 'https://vnlevnlsyyqkofnplzdm.supabase.co/storage/v1/object/public/zones');   // yerel kurulum (localhost): harita dosyaları site/zones klasöründen   // (artık kullanılmıyor: görseller yerel)
// KO warpinfo.tbl → npcimg\<ad>.dxt (162×186, altın çerçeveli bölge resmi). Ulusa göre farklı olanlar: Eslant / Eslant Entrance / Lunar Valley (ka_ / el_)
const WARP_RESIM = {"Moradon": "moradon", "Bellua Village": "velua", "Kalluga Valley": "ka_kaluga", "Raon Camp": "laoncamp", "Ardream": "cultivation_middlelv", "Ronark Land Base": "ronak_base", "Ronark Land": "cultivation", "Luferson Castle": "luperson", "Linate Village": "linate", "Asga Village": "asga", "Doda Camp": "dodacamp", "Kalluga Valley Entrance": "el_kaluga", "El Morad Castle": "elmorad", "Laiba Village": "liva", "Folk Village": "fork_village", "Tale Village": "tail_village", "Delos": "dellos", "Abyss Dungeon": "abyss_of_despair", "Naredis Southeast Fort": "war_d_south", "Naredis Northwest Fort": "war_d_south", "Alseids Plain Combat Area": "battlezone_b_gate", "Nieds Triangle Combat Area": "battlezone_d_gate"};
const WARP_ULUS = { 'Eslant': ['ka_islant', 'el_islant'], 'Eslant Entrance': ['ka_islant_entrance', 'el_islant_entrance'], 'Lunar Valley': ['ka_infiltration_gate', 'el_infiltration_gate'] };
const WARP_KUCUK = new Map([...Object.entries(WARP_RESIM), ['Linart Village', 'linate']].map(([a, b]) => [a.toLowerCase(), b]));
const WARP_ULUS_K = new Map(Object.entries(WARP_ULUS).map(([a, b]) => [a.toLowerCase(), b]));
export const warpResim = (ad, ulus) => { const n = String(ad || '').trim().toLowerCase(), u = WARP_ULUS_K.get(n); const k = u ? u[Number(ulus) === 2 ? 1 : 0] : WARP_KUCUK.get(n); return k ? `./assets/ui/warp/${k}.webp` : ''; };
const TUM_HEDEFLER = [
  { id: 'moradon', ad: 'Moradon', seviye: 'Lv 1  ~  Lv 83', ucret: 3000, resim: warpResim('Moradon'),
    aciklama: "You will be transported to Moradon. Moradon is a free-trade zone in southern Adonis continent inhabited by fairies and dragons. Moradon region is suitable for players at Level 1-20. Transport fee is 3,000 Noahs." },
  { id: 'folk', ad: 'Folk Village', seviye: 'Lv 1  ~  Lv 83', ucret: 3000, resim: warpResim('Folk Village'),
    aciklama: "A small village which is located in the middle of Moradon, and it is an important place for Moradon field travelers and which gives lots of facilities to the travelers. Transport fee is 3,000 Noahs." },
  { id: 'elmo', ulus: 2, ad: 'El Morad Castle', seviye: 'Lv 10  ~  Lv 83', ucret: 10000, resim: warpResim('El Morad Castle'),
    aciklama: "You will be transported to El Morad Castle. Home of Pianna Knight Squad Tower, it is a village of warriors and priests. El Morad Castle vicinity is suitable for players at Level 35. Transport fee is 10,000 Noahs." },
  { id: 'luferson', ulus: 1, ad: 'Luferson Castle', seviye: 'Lv 10  ~  Lv 83', ucret: 10000, resim: warpResim('Luferson Castle'),
    aciklama: "You will be transported to Luferson Castle. Home of Kooglin`s tombstone, it is a village of warriors and priests. Luferson Castle vicinity is suitable for players at Level 35. Transport fee is 10,000 Noahs." },
  { id: 'ardream', ad: 'Ardream', seviye: 'Lv 30  ~  Lv 59', ucret: 10000, resim: warpResim('Ardream'),
    aciklama: "You will be teleported to Ardream. In Ardream, where young knights converge to gain experience, players can hunt or wage battles against opposing nations. Only level 35-59 players will be allowed entry. Transport fee is 10,000 Noahs." },
  // henüz ulaşıma kapalı: listede kırmızı görünür, ışınlanılamaz
  { id: 'ronark', ad: 'Ronark Land', seviye: 'Lv 60  ~  Lv 83', ucret: 0, resim: warpResim('Ronark Land'), kapali: true,
    aciklama: 'Ronark Land is currently closed.' },
  { id: 'ronarkbase', ad: 'Ronark Land Base', seviye: 'Lv 35  ~  Lv 83', ucret: 0, resim: warpResim('Ronark Land Base'), kapali: true,
    aciklama: 'Ronark Land Base is currently closed.' },
];
let HEDEFLER = TUM_HEDEFLER;
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// El Morad / Luferson kaleleri: KO harita (SMD) ışınlanma noktaları (obj_*_transmark00) ve WARP listeleri → kapi_nokta / kapi_warp
const KALE = new Set(['elmo2004', 'karus2004']);
const ZONE_RESIM = { moradon: './assets/ui/warp_moradon.jpg', elmo2004: './assets/ui/warp_elmo2004.jpg', karus2004: './assets/ui/warp_karus2004.jpg', freezone_a: './assets/ui/warp_freezone_a.jpg' };
const ZONE_BOY = { moradon: 1024, elmo2004: 2048, karus2004: 2048, freezone_a: 1024 };
async function kaleKapilari(sb, zone, gmMi = () => false) {
  const [{ data: nk }, { data: wl }] = await Promise.all([sb.from('kapi_nokta').select('*').eq('zone', zone), sb.from('kapi_warp').select('*').eq('zone', zone).order('id')]);
  return (nk || []).map((n) => ({ ulus: zone === 'elmo2004' ? 2 : 1, ad: 'Warp Gate', x: n.x, y: n.y ?? 0, z: n.z, boy: 4, gen: 2.5, grup: n.grup,
    liste: (wl || []).filter((w) => w.grup === n.grup).map((w) => ({ id: 'w' + w.id, warp: w.id, ad: w.ad, ucret: w.ucret, kilit: w.kilit,
      get kapali() { return !w.hedef_zone || w.kilit === 'kapali' || (w.kilit === 'gm' && !gmMi()); },   // RLB kapalı, RL yalnız GM
      seviye: `Lv ${w.seviye_min}  ~  Lv ${w.seviye_max}`, resim: warpResim(w.ad, zone === 'elmo2004' ? 2 : 1) || ZONE_RESIM[w.hedef_zone] || '', hedefZone: w.hedef_zone, hx: w.x, hz: w.z,
      get aciklama() { return !w.hedef_zone ? `${w.ad} is not open yet.` : this.kapali ? `${w.ad} is currently closed.` : `You will be transported to ${w.ad}.${w.ucret ? ` Transport fee is ${fmt(w.ucret)} Noahs.` : ' There is no transport fee.'}`; } })) }));
}

export function initKapi({ sb, character, hud, state, player, camera, canvas, world }) {
  const BOLGE = character?.zone || KAPI.zone;
  if (!KAPI_BOLGE[BOLGE] && !KALE.has(BOLGE)) return null;
  KAPILAR = KAPI_BOLGE[BOLGE] || [];
  if (['freezone_b', 'freezone_c'].includes(BOLGE) && state.heightAt) for (const k of KAPILAR) k.y = state.heightAt(k.x, k.z);   // deadsoft haritası yüksekliği
  if (KALE.has(BOLGE)) kaleKapilari(sb, BOLGE, () => !!state.ghost).then((l) => { for (const k of l) k.y = state.heightAt ? state.heightAt(k.x, k.z) : 0; KAPILAR.push(...l); }).catch((e) => console.warn('kapılar', e));
  let K = KAPILAR[0] || null;   // tıklanan kapı: listesi o kapının kalesini gösterir
  const merkezOf = (k) => new THREE.Vector3(k.x, k.y + 2.2, k.z);
  const uzaklik = () => (K ? Math.hypot(player.position.x - K.x, player.position.z - K.z) : 1e9);
  const layer = () => document.getElementById('kohud') || document.body;
  let bekleyen = false, pen = null, secili = 0, mesgul = false;

  const ekran = (v) => { const p = v.clone(); world.localToWorld(p); p.project(camera); const r = canvas.getBoundingClientRect(); return { x: (p.x + 1) / 2 * r.width + r.left, y: (1 - p.y) / 2 * r.height + r.top, z: p.z }; };
  function click(e) {
    // KO: yalnız kapının kendisine tıklanınca. Ekran yakınlığı yerine dünya ışını: tıklama ışınının kapı gövdesine (yerden boy kadar)
    // uzaklığı kapı genişliğinden küçük olmalı; uzaktaki kapının ekrandaki çevresine (zemine, binalara) tıklamak artık kapıya götürmez.
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
    const ray = rc.ray.clone().applyMatrix4(new THREE.Matrix4().copy(world.matrixWorld).invert());
    const k = KAPILAR.find((k) => {
      if (Math.hypot(player.position.x - k.x, player.position.z - k.z) > 60) return false;
      const boy = k.boy || 2.5, gen = (k.gen || 2) * 0.9;
      for (let h = 0; h <= boy + 1; h += 0.5) if (ray.distanceToPoint(new THREE.Vector3(k.x, k.y + h, k.z)) <= gen) return true;
      return false;
    });
    if (!k) return false;
    // KO: her ulus yalnız kendi kapısını kullanır (El Morad ↔ Karus); GM muaf
    if (k.ulus && !state.ghost && Number(k.ulus) !== Number(character?.nation)) {
      hud.notice?.(`Only ${Number(k.ulus) === 2 ? 'El Morad' : 'Karus'} players can use this gate.`, 'hata'); return true;
    }
    if (k !== K) { K = k; if (pen) pen.el.hidden = true; }
    // Ardream: yalnız Moradon ve oyuncunun kendi kalesi
    if (K.liste) HEDEFLER = K.liste;
    else {
      const liste = ['freezone_a', 'freezone_b', 'freezone_c'].includes(BOLGE) ? ['moradon', Number(character?.nation) === 2 ? 'elmo' : 'luferson'] : K.hedef;
      HEDEFLER = liste.map((id) => TUM_HEDEFLER.find((h) => h.id === id)).filter(Boolean);
    }
    if (uzaklik() <= 7) ac();
    else { const dx = player.position.x - K.x, dz = player.position.z - K.z, L = Math.hypot(dx, dz) || 1; state.target = new THREE.Vector3(K.x + dx / L * 4, 0, K.z + dz / L * 4); bekleyen = true; }
    return true;
  }
  function update() {
    if (bekleyen && uzaklik() <= 7) { bekleyen = false; ac(); }
    if (bekleyen && !state.target) bekleyen = false;
    if (pen && !pen.el.hidden && uzaklik() > 12) pen.el.hidden = true;
  }
  const ortala = (el) => requestAnimationFrame(() => {
    const r = el.getBoundingClientRect(), z = r.width / (el.offsetWidth || r.width) || 1;
    el.style.left = Math.max(0, (innerWidth - r.width) / 2 / z) + 'px'; el.style.top = Math.max(0, (innerHeight - r.height) / 2 / z) + 'px';
  });

  function kur() {
    if (!hasLayout('re_warp')) { hud.notice?.('Could not load the warp interface.', 'hata'); return null; }
    const L = buildLayout('re_warp', { className: 'ko-warp ko-pencere kui-dokulu' });
    layer().append(L.el); draggable(L, 36);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    // ESC ya da pencere dışına tıklama (yürümek dahil) kapatır
    addEventListener('keydown', (e) => {
      if (L.el.hidden || ['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      if (e.key === 'Escape') { L.el.hidden = true; bekleyen = false; }
      // Enter: seçili hedefe doğrudan ışınlan (Işınlan tuşuna gerek yok); ok tuşları seçimi değiştirir
      else if (e.key === 'Enter' || e.key === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); git(); }
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && HEDEFLER.length) { e.preventDefault(); e.stopImmediatePropagation(); secili = (secili + (e.key === 'ArrowDown' ? 1 : HEDEFLER.length - 1)) % HEDEFLER.length; ciz(); }
    }, true);
    addEventListener('pointerdown', (e) => { if (!L.el.hidden && !L.el.contains(e.target)) L.el.hidden = true; }, true);
    // liste satırları (str_warp0..8) tıklanabilir
    for (let i = 0; i < 9; i++) {
      const t = L.get('str_warp' + i); if (!t) continue;
      t.style.pointerEvents = 'auto'; t.classList.add('warp-satir');
      t.addEventListener('click', () => { if (HEDEFLER[i]) { secili = i; ciz(); } });
      t.addEventListener('dblclick', () => { if (HEDEFLER[i]) { secili = i; ciz(); git(); } });
    }
    const resim = L.get('img_zone'); if (resim) { resim.innerHTML = ''; resim.classList.add('warp-resim'); }
    L.click('Btn_Ok', git); L.click('Btn_Cancel', () => (L.el.hidden = true)); L.click('btn_close', () => (L.el.hidden = true));
    for (const [id, t] of [['Btn_Ok', 'Warp'], ['Btn_Cancel', 'Cancel']]) L.get(id)?.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = t));
    return L;
  }
  function ciz() {
    const L = pen, h = HEDEFLER[secili];
    for (let i = 0; i < 9; i++) {
      L.text('str_warp' + i, HEDEFLER[i]?.ad || '');
      const t = L.get('str_warp' + i); if (t) t.style.color = HEDEFLER[i]?.kapali ? '#ff3c3c' : '';   // açık olmayan haritalar kırmızı
    }
    const sel = L.get('img_select'), row = L.get('str_warp' + secili);
    if (sel && row) { sel.style.top = row.style.top; sel.hidden = !h; }
    L.text('str_level', h?.seviye || '');
    const ack = L.get('Text_Agreement'); if (ack) ack.textContent = h ? h.aciklama : '';
    const r = L.get('img_zone');
    if (r) {
      r.style.backgroundImage = h?.resim ? `url(${h.resim})` : 'none';
      // kale kapıları: hedefin çevresi (bölgenin mini haritasından kırpılmış görünüm)
      const B = h?.hedefZone && ZONE_BOY[h.hedefZone];
      if (B && !/\/warp\//.test(h.resim || '') && h.hedefZone !== 'moradon' && h.hedefZone !== 'freezone_a') { const k = 4; r.style.backgroundSize = `${k * 100}% ${k * 100}%`; r.style.backgroundPosition = `${Math.min(100, Math.max(0, (h.hx / B * k - 0.5) / (k - 1) * 100))}% ${Math.min(100, Math.max(0, ((1 - h.hz / B) * k - 0.5) / (k - 1) * 100))}%`; }
      else { r.style.backgroundSize = ''; r.style.backgroundPosition = ''; }
    }
  }
  function ac() {
    pen ||= kur(); if (!pen) return;
    secili = 0; ciz(); pen.el.hidden = false; pen.el.style.zIndex = 60; ortala(pen.el);
  }
  async function git() {
    const h = HEDEFLER[secili]; if (!h || mesgul) return;
    mesgul = true;
    try {
      if (h.kapali) { hud.notice?.(h.aciklama, 'hata'); return; }
      const { data: d, error } = h.warp
        ? await sb.rpc('kapi_git', { p_char: character.id, p_warp: h.warp, p_x: player.position.x, p_z: player.position.z })
        : await sb.rpc('warp_git', { p_char: character.id, p_hedef: h.id, p_x: player.position.x, p_z: player.position.z });
      if (error) { hud.notice?.(error.message, 'hata'); return; }
      if (!d?.ok) { hud.notice?.(d?.mesaj || 'Teleport failed.', 'hata'); return; }
      pen.el.hidden = true;
      state.target = null;
      if (d.zone && d.zone !== BOLGE) {   // başka harita: konum sunucuda kaydedildi, harita yeniden yüklenir
        hud.info?.(`Teleporting to ${d.ad}… (${fmt(d.ucret)} Noah)`, 'beceri');
        try { const v = player.position; state.efekt?.(Number(character?.nation) === 2 ? 10047 : 10046, v, { follow: () => v }); } catch {}
        state.net?.halt?.(); const u = new URL(location.href); for (const k of ['x', 'z', 'bolge']) u.searchParams.delete(k); u.searchParams.set('karakter', character.id);
        setTimeout(() => location.replace(u.toString()), 500); return;
      }
      player.position.set(d.x, state.heightAt ? state.heightAt(d.x, d.z) : player.position.y, d.z);
      dispatchEvent(new CustomEvent('ko-isinlandi'));   // Spirit of Logos güçlendirmesi kalkar
      state.combat?.odulUygula?.({ gold: d.gold }); state.inv?.stats?.();
      hud.info?.(`You have been teleported to ${d.ad}. (${fmt(d.ucret)} Noah)`, 'beceri');
      const v = player.position; state.efekt?.(Number(character?.nation) === 2 ? 10047 : 10046, v, { follow: () => v });   // (5.11) KO warp_ka / warp_el.fxb (ses 400 warp_zone) — seviye atlama (10018) değil
    } finally { mesgul = false; }
  }
  return { click, update, ac };
}
