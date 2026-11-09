// KO sistem menüsü (deadsoft 2369 re_taskbar_sub): görev çubuğundaki menü düğmesinin hemen yanında açılan dikey liste.
// Düğmeler KO'nun kendi düğme parçalarıyla (normal / üzerinde / basılı / kapalı) üst üste dizilir; arka plan boyuna göre uzar.
import { ekUI, hasLayout, buildLayout } from './kui.js';

const ADIM = 20, ILK = 23;   // (4.11) ayrı Power up store düğmesi kalktı: liste onun yerinden (23) başlar   // üst boşluk 10 px daraltıldı (Power up store 30 → 20, liste 53 → 43)
let L = null, kurP = null;

function tus(code, key) { dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true })); setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true })), 30); }

async function kur(hud) {
  if (!(await ekUI('yeniui').catch(() => false)) || !hasLayout('re_taskbar_sub')) return null;
  L = buildLayout('re_taskbar_sub', { className: 'ko-sismenu' });
  (document.getElementById('kohud') || document.body).append(L.el);
  L.el.style.pointerEvents = 'auto'; L.el.hidden = true;
  const sablon = L.get('btn_option'), altin = L.get('btn_mail');
  const ORJ = ['btn_seed_karu', 'btn_seed_elmo', 'btn_mail', 'btn_chat_creat', 'btn_inven', 'btn_userinfo', 'btn_skill', 'btn_globalmap', 'btn_minimap', 'btn_hotkey', 'btn_movie_record', 'btn_macro', 'btn_clan', 'btn_trade', 'btn_merchant', 'btn_partywanted', 'btn_party', 'btn_option', 'btn_achieve', 'btn_exit'];
  const kapat = () => { L.el.hidden = true; };
  const p = (k) => () => { kapat(); hud.panel?.(k); };
  // [yazı, iş (yoksa kapalı), altın renkli]
  // (4.11) KO orijinal sıra (ekran görüntüsü): Seed · Power up store · Mail (altın) · Chatting room … Option · Achieve · End
  const OGELER = [
    ['Seed', p('gorev'), true],
    ['Power up store', p('magaza'), true],
    ['Mail', () => { kapat(); hud._mail?.(); }, true],
    ['Chatting room', null],
    ['Inventory (I)', p('envanter')],
    ['User information (U)', p('karakter')],
    ['Skill (K)', p('beceri')],
    ['World Map (M)', () => { kapat(); tus('KeyM', 'm'); }],
    ['Minimap (N)', () => { kapat(); tus('KeyN', 'n'); }],
    ['Shortcut (H)', () => { kapat(); document.querySelector('.ko-hotkey')?.toggleAttribute('hidden'); }],
    ['Videos (F12)', null],
    ['Clan', p('klan')],
    ['Trade', () => { kapat(); hud.info?.('To trade, right-click a player → Trade.', 'beceri'); }],
    ['Store', p('magaza')],
    ['Looking for party', () => { kapat(); const S = window.__ko?.state; if (S?.partiBoard) { S.partiBoard.ac(true); S.partiBoard.ac_kapa(); } else hud.notice?.('The Party Board is loading.', 'hata'); }],   // (5.11) KO: Party Board (parti arayanlar)
    ['Invite to party', () => { kapat(); const S = window.__ko?.state; if (S?.koKomut) S.koKomut.calistir('/Party'); }],   // (5.11) seçili oyuncuya parti daveti (/Party)
    ['Option', p('ayar')],
    ['Achieve', p('basarim')],
    ['End', p('sistem_cikis')],
  ];
  for (const id of ORJ) L.show(id, false);
  L.show('btn_powerup', false);   // (4.11) Power up store artık listenin ikinci satırı (Seed'in altında)
  OGELER.forEach(([yazi, is, sari], i) => {
    const b = (sari ? altin : sablon).cloneNode(true); b.removeAttribute('data-id'); b.hidden = false;
    const y = ILK + i * ADIM, dy = y - parseFloat(b.style.top);
    b.style.top = y + 'px';
    for (const c of b.querySelectorAll('.kui-tx')) { c.textContent = yazi; c.style.top = (parseFloat(c.style.top) || 0) + 'px'; }
    void dy;
    b.classList.add('ss-oge'); if (!is) b.classList.add('kapali');
    else { b.classList.add('kui-tik'); b.addEventListener('click', (e) => { e.stopPropagation(); is(); }); }
    L.el.append(b);
  });
  // arka plan: orta parça uzar, alt parça son düğmenin altına iner
  const son = ILK + (OGELER.length - 1) * ADIM + 18, altY = son - 16;   // alt boşluk 10 px daraltıldı   // KO: alt parça son düğmenin 12 px altından başlar (üstü saydam)
  const bb = L.get('base_backboard'), imgs = [...bb.children].filter((c) => c.classList.contains('kui-img'));
  const alt = imgs.find((c) => parseFloat(c.style.height) < 40), orta = imgs.find((c) => c !== alt);
  if (orta) {   // orta parça (üstü 33) alt parçanın üstüne kadar uzar; doku dikeyde aynı oranda gerilir
    const h0 = parseFloat(orta.style.height), h1 = altY - 33 + 4, k = h1 / h0;
    orta.style.height = h1 + 'px';
    orta.style.backgroundSize = orta.style.backgroundSize.replace(/(\S+)\s+(\S+)/, (m, a, b2) => `${a} ${(parseFloat(b2) * k).toFixed(1)}px`);
    orta.style.backgroundPosition = orta.style.backgroundPosition.replace(/(\S+)\s+(\S+)/, (m, a, b2) => `${a} ${(parseFloat(b2) * k).toFixed(1)}px`);
  }
  if (alt) { alt.style.top = (altY - 32) + 'px'; }   // grup koordinatı (base_backboard üstü 32)
  bb.style.height = (altY + 1) + 'px'; L.el.style.height = (altY + 33 + 4) + 'px';
  L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  addEventListener('pointerdown', (e) => { if (!L.el.hidden && !e.target.closest?.('.ko-sismenu, [data-id="btn_menu"]')) kapat(); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !L.el.hidden) { e.stopPropagation(); kapat(); } }, true);
  return L;
}

/** menü düğmesinin (görev çubuğu btn_menu) yanında aç / kapat */
export async function sistemMenu(hud, dugme) {
  if (!L) { await (kurP ||= kur(hud)); if (!L) return false; }
  if (!L.el.hidden) { L.el.hidden = true; return true; }
  L.el.hidden = false;
  const r = dugme?.getBoundingClientRect?.(), p = L.el.offsetParent || document.body, pr = p.getBoundingClientRect(), k = p.offsetWidth ? pr.width / p.offsetWidth : 1;
  const h = L.el.offsetHeight, w = 125;
  if (r?.width) {
    // KO: liste ekranın sol köşesinden başlar, görev çubuğundaki menü düğmesinin hemen üstünde açılır
    const y = (r.top - pr.top) / k - h;
    L.el.style.left = '0px'; L.el.style.top = Math.max(0, y) + 'px';
  } else { L.el.style.left = (p.offsetWidth - w - 10) + 'px'; L.el.style.top = Math.max(0, p.offsetHeight - h - 60) + 'px'; }
  return true;
}
