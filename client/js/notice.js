// KO "Notice" penceresi: oyuna ilk girişte (oturum başına bir kez) etkin etkinlik ya da GM notice metni varsa ekranın sağından
// kayarak gelir. Üst bölüm: etkinlik duyuruları (sarı) + GM notice metni; alt bölüm: [Knight Online Tip of the Day!] (rastgele ipucu).
// Çerçeve: KO orijinal re_notice.uif (assets/ui/notice, tools/uif2kui.py).
// Sunucu: etkinlik_liste(p_server) → { etkinlik: [{tur, oran, bitis, metin}], notice: {aktif, metin, ipucu} }.
import { yanAcildi } from './yan-pencere.js';
import { hasLayout, buildLayout, ekUI } from './kui.js';

// KO orijinal ipuçları (Texts_us 5000-5033)
const IPUCU = ["Recover rapidly by sitting down - 'C'", "You can move using your mouse in the 'quarter-view' mode.", "Toggle Auto Walk/Run - 'E'", "When you want to teleport back to town - Type'/town'", "To find the nearest enemy/monster - Press the 'Z' key", "Using Skill : Drag the skill icon to the shortcut key window.", "Designate re-spawn spot : Right-click on the Resurrection Stone.", "Visit the blacksmith to increase the durability of an item.", "Item Storage : Right-click on the Inn-Keeper.", "Selecting Specialty : You can select your specialty when you reach level 10.", "Pick up item : Click on the dead monster.", "Walk/Run : Press the 'T' key", "Toggle Attack : Press the 'R' key or double click on the target.", "Toggle View : shortcut key 'F9'", "You can move your character by pressing 'W,A,S,D's keys or the arrow keys.", "Using Skill : Press the skill icon placed on the shortcut key window or press '1~8'", "You can level up faster if you form a party.", "Display request for party : Type'/Seeking_party'", "Invite into a party : Type '/party'", "Trade Item : Select a character and type '/trade'", "Party Chat : Click on the 'Party Chat' button on the chat window", "General Chat : Click on the 'General Chat' button on the chat window", "Gaining Stat Points : Gain 3 stat points every time you level up.", "Gaining Skill Points : You can gain 2 skill points every time you level up once you've reached level 10.", "Destroy Item : Drag and drop the item you wish to destroy on to the red mark on the inventory window.", "View Description of the Skill : Put your cursor over the skill icon.", "Private Message : Type '/pm' ID", "View Mini-map : Press 'N'.  The red and orange dots are enemies.", "Flip through shortcut key window : 'PageUp/PageDown'", "Use the 'Home / End' keys to change views in the quarter-view mode.", "Take 5 Silk Bundles to the Proconsul standing near the accessory vendor and he'll give you a weapon.", "Lock on the closest NPC - 'B'", "View Overall Map : 'M'"];
const fmtSaat = (t) => { const d = new Date(t); return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
export function etkinlikMetni(e) {
  const son = e.bitis ? ` (until ${fmtSaat(e.bitis)})` : '';
  if (e.metin) return e.metin + son;
  if (e.tur === 'exp') return `EXP Increase Event is under way! Earn ${e.oran} percent extra EXP from monster hunting.${son}`;
  if (e.tur === 'noah') return `Noah Increase Event is under way! Earn ${e.oran} percent extra Noah from monster hunting.${son}`;
  if (e.tur === 'np') return `National Point Increase Event is under way! Earn ${e.oran} percent extra National Points from defeating enemies.${son}`;
  if (e.tur === 'seviye2x') return `Double Level Up Event is under way! You gain 2 levels every time you level up.${son}`;
  return '';
}

let W = null;
export async function noticeGoster({ sb, character, zorla = false } = {}) {
  if (!sb) return false;
  const anahtar = 'ko-notice-gosterildi-' + (character?.id ?? '');
  if (!zorla) { try { if (sessionStorage.getItem(anahtar)) return false; } catch {} }
  const { data } = await Promise.resolve(sb.rpc('etkinlik_liste', { p_server: character?.server_id ?? null })).catch(() => ({}));
  const E = data?.etkinlik || [], N = data?.notice || {};
  const satirlar = E.map(etkinlikMetni).filter(Boolean);
  if (N.aktif !== false && N.metin) satirlar.push(N.metin);
  if (!satirlar.length && !zorla) return false;   // KO: etkinlik / duyuru yoksa açılmaz
  try { sessionStorage.setItem(anahtar, '1'); } catch {}
  await ekUI('orj').catch(() => false);
  if (!W) {
    const kat = document.getElementById('kohud') || document.body;
    if ((await ekUI('notice').catch(() => false)) && hasLayout('re_notice')) {
      // (31.10) KO orijinal re_notice.uif penceresi birebir (re_el_notice01/02 dokuları)
      const L = buildLayout('re_notice', { className: 'ko-notice kui-dokulu' });
      L.show('text_event', false);
      L.text('text_event_name', '[Knight Online Tip of the Day!]');
      const tn = L.get('text_notice'); tn.textContent = ''; tn.classList.add('nt-metin');
      const tt = L.get('text_tip'); tt.textContent = ''; tt.classList.add('nt-ipucu');
      L.click('btn_quit', () => kapat());
      // kaydırma çubuğu: yukarı / aşağı düğmeleri, tekerlek ve tutamak sürükleme
      const sc = L.get('scroll'), [bu, bd] = sc ? sc.querySelectorAll(':scope > .kui-btn') : [], tr = sc?.querySelector(':scope > .kui-tr');
      const tut = tr?.lastElementChild, TOP = 0, ALT = 175 - 11;   // tutamak, kanala göre konumlanır
      const guncel = () => { if (!tut) return; const m = tn.scrollHeight - tn.clientHeight; tut.hidden = m <= 0; tut.style.top = (m > 0 ? TOP + (ALT - TOP) * tn.scrollTop / m : TOP) + 'px'; };   // KO: kaydırılacak metin yoksa tutamak görünmez
      const kay = (d) => { tn.scrollTop += d; guncel(); };
      bu?.addEventListener('click', () => kay(-14)); bd?.addEventListener('click', () => kay(14));
      tn.addEventListener('scroll', guncel);
      W = L.el; W._guncel = guncel;
      W.addEventListener('wheel', (e) => { kay(e.deltaY > 0 ? 28 : -28); }, { passive: true });
      if (tut) tut.addEventListener('pointerdown', (e) => {
        e.preventDefault(); const y0 = e.clientY, s0 = tn.scrollTop, m = tn.scrollHeight - tn.clientHeight; if (m <= 0) return;
        const mv = (ev) => { tn.scrollTop = s0 + (ev.clientY - y0) * m / (ALT - TOP); guncel(); };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      kat.append(L.el);
    } else {
      W = document.createElement('div'); W.className = 'ko-notice ko-notice-yedek ko-panel';
      W.innerHTML = `<div class="nt-baslik">Notice</div><b class="nt-x">×</b><div class="nt-panel nt-ust"><div class="nt-metin"></div></div>
        <div class="nt-panel nt-alt"><div class="nt-ipucu-bas">[Knight Online Tip of the Day!]</div><div class="nt-ipucu"></div></div>`;
      W.querySelector('.nt-x').onclick = () => kapat();
      kat.append(W);
    }
    W.addEventListener('pointerdown', (e) => e.stopPropagation());
    W.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && W && !W.hidden && W.classList.contains('nt-acik')) { e.stopImmediatePropagation(); kapat(); } }, true);
  }
  const m = W.querySelector('.nt-metin'); m.replaceChildren(...satirlar.map((t) => { const p = document.createElement('p'); p.textContent = t; return p; }));
  const ip = IPUCU[Math.floor(Math.random() * IPUCU.length)];
  W.querySelector('.nt-ipucu').textContent = ip;
  const ipAlt = W.querySelector('.nt-alt'); if (ipAlt) ipAlt.hidden = N.ipucu === false;
  else for (const id of ['text_event_name', 'text_tip']) { const e = W.querySelector(`[data-id="${id}"]`); if (e) e.hidden = N.ipucu === false; }
  const tnm = W.querySelector('.nt-metin'); if (tnm) tnm.scrollTop = 0; requestAnimationFrame(() => W._guncel?.());
  W.hidden = false; W.classList.remove('nt-acik'); void W.offsetWidth;
  yanAcildi(W, 'sag', () => kapat());
  requestAnimationFrame(() => W.classList.add('nt-acik'));   // sağdan kayarak gelir
  return true;
}
function kapat() { if (!W) return; W.classList.remove('nt-acik'); setTimeout(() => { if (W && !W.classList.contains('nt-acik')) W.hidden = true; }, 350); }
