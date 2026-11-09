// KO "See Map" (Seçenekler → Find.M): orijinal KnightOnlineEn re_quest_map.uif — üstte NPC portresi, adı ve tanımı
// (Quest_Npc_Desc_us: "[Blacksmith] Hepa\nThe most accomplished blacksmith…"), altta bölgenin KO parşömen haritası (re_map1024
// Group_<bölge> parçalarından birleştirilmiş, assets/ui/harita/tam_*.webp) NPC'nin konumu ortada, üstünde dönen camgöbeği ok
// (img_point, 7 kare); harita başlığı yer adı ("Moradon Castle interior"), Close.
import { hasLayout, buildLayout, draggable, ekUI } from './kui.js';

const BOLGE = { 21: 'moradon', 1: 'karus2004', 2: 'elmo2004', 11: 'eslantzone', 12: 'eslantzone', 71: 'freezone_b', 72: 'freezone_a', 73: 'freezone_c' };
const HARITA = { moradon: 'moradon', karus2004: 'karubase', elmo2004: 'elmobase', eslantzone: 'islant', freezone_a: 'cultivation_old', freezone_c: 'ronak_base' };
const BOYUT = { karus2004: 2048, elmo2004: 2048, freezone_b: 2048 };
let L = null, YER = null, ALAN = null, kare = null;

export async function gorevHaritasi({ npcId, npcAd, model }) {
  if (!(await ekUI('qmap').catch(() => false)) || !hasLayout('re_quest_map')) return false;
  YER ||= await fetch('./assets/gorev/npc_yer.json').then((r) => r.json()).catch(() => ({}));
  ALAN ||= await fetch('./assets/ui/harita/tam_alan.json').then((r) => r.json()).catch(() => ({}));
  const k = (YER[npcId] || [])[0];
  if (!L) {
    L = buildLayout('re_quest_map', { className: 'ko-gorev-harita ko-pencere kui-dokulu' });
    (document.getElementById('kohud') || document.body).append(L.el); draggable(L, 40);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    const kapat = () => { L.el.hidden = true; clearInterval(kare); };
    L.click('btn_close', kapat); L.click('btn_back', kapat);
    // btn_back: "Close" yazısı orijinal düğme görüntüsünün içinde (ayrıca yazı eklenmez)
    L.show('scroll_bar', false);
  }
  const ad = k?.[1] || npcAd || '';
  L.text('txt_title', ad);
  L.text('txt_talk', (k?.[2] || ad).replace(/\\n/g, '\n'));
  L.text('txt_map_desc', k?.[3] || '');
  // portre: NPC modelinin kafa-omuz görüntüsü (npc-menu portre)
  const pn = L.get('img_npc');
  if (pn && model) import('./npc-menu.js').then((M) => M.portre?.(model, pn, () => !L.el.hidden)).catch(() => {});
  // harita
  const zone = BOLGE[k?.[0]] || 'moradon', grp = HARITA[zone], ar = ALAN[grp], img = L.get('img_map'), ok = L.get('img_point');
  if (img && ar && k) {
    const D = BOYUT[zone] || 1024, W = parseFloat(img.style.width), H = parseFloat(img.style.height);
    const S = 0.55;   // KO: harita yarı ölçekte (bölgenin büyük kısmı görünür)
    const px = (ar[0] + (k[4] / D) * ar[2]) * S, py = (ar[1] - 32 + (1 - k[5] / D) * ar[3]) * S;
    const ox = Math.max(0, Math.min(1024 * S - W, px - W / 2)), oy = Math.max(0, Math.min(736 * S - H, py - H / 2));
    img.style.background = `url(assets/ui/harita/tam_${grp}.webp) ${-ox}px ${-oy}px / ${1024 * S}px ${736 * S}px no-repeat`;
    if (ok) { ok.hidden = false; ok.style.left = (parseFloat(img.style.left) + px - ox - parseFloat(ok.style.width) / 2) + 'px'; ok.style.top = (parseFloat(img.style.top) + py - oy - parseFloat(ok.style.height) / 2) + 'px'; }
  } else if (ok) ok.hidden = true;
  // dönen ok: 7 kare
  const kareler = ok ? [ok, ...ok.querySelectorAll(':scope > .kui-img')] : [];
  let i = 0; clearInterval(kare);
  kare = setInterval(() => { if (!kareler.length) return; i = (i + 1) % kareler.length; kareler.forEach((e, j) => { if (j) e.style.opacity = j === i ? '1' : '0'; }); ok.classList.toggle('gh-ilk', i === 0); }, 90);
  L.el.hidden = false; L.el.style.zIndex = 4200;
  return true;
}
