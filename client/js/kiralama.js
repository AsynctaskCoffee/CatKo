// KO Item Rental ([Rental booth] Helard 14401 / 32574 / 32575, [Novice Weapon Rental] Sodern 14402 / Soren 14403):
// oyuncunun sınıfına (Savaşçı / Rogue / Büyücü / Rahip) ve seviyesine göre kiralık eşyalar (sunucu kiralik_esya tablosu).
// Kiralanan eşya 5 gün süreli: süre hemen başlar, ipucunun en altında "Eşyanın Kalan Süresi" yazar; süre dolunca silinir.
// Kiralık eşya takas edilemez, NPC'ye satılamaz, depoya / maile / pazara konamaz.
import { koWindow, toFront } from './ko-pencere.js';
import { loadMeta, fromDb, iconHtml, noahHtml, tooltipHtml } from './esya.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const noah = (n) => Number(n || 0).toLocaleString('tr-TR');
const SINIF = { 1: 'Warrior', 2: 'Rogue', 3: 'Mage', 4: 'Priest' };
const IRK = { 1: 'Arch Tuarek', 2: 'Tuarek', 3: 'Wrinkle Tuarek', 4: 'Puri Tuarek', 5: 'Kurian', 6: 'Kurian', 11: 'Barbarian', 12: 'El Morad', 13: 'El Morad', 14: 'Porutu' };
export const KIRA_NPC = new Set([14401, 14402, 14403, 32574, 32575]);

let win = null, tip = null;
export async function kiralamaAc({ sb, character, hud, state, npc }) {
  await loadMeta().catch(() => {});
  const { data: d, error } = await sb.rpc('kira_liste', { p_char: character.id });
  if (error || !d) { hud.notice?.(error?.message || 'Could not load the rental list.', 'hata'); return; }
  const nums = (d.liste || []).map((x) => x.num);
  const { data: rows } = nums.length ? await sb.from('items').select('*').in('num', nums) : { data: [] };
  const IT = new Map((rows || []).map((r) => [Number(r.num), { ...fromDb(r), _db: r }]));
  kapat();
  win = document.createElement('div'); win.id = 'kira-pencere'; win.className = 'ko-panel ko-pencere';
  const toplam = Number(d.set_ucret) || 3700000;
  const aktif = d.aktif_bitis ? new Date(d.aktif_bitis) : null;
  const minSv = Number(d.min_seviye) || 55, dusuk = Number(d.seviye) < minSv;
  const kalanYaz = (t) => { const s = Math.max(0, Math.floor((t - Date.now()) / 1000)), g = Math.floor(s / 86400), sa = Math.floor((s % 86400) / 3600), dk = Math.floor((s % 3600) / 60); return (g ? `${g} day${g > 1 ? 's' : ''} ` : '') + (sa ? `${sa} hour${sa > 1 ? 's' : ''} ` : '') + `${dk} minute${dk === 1 ? '' : 's'}`; };
  const baslik = `${SINIF[d.sinif] || 'Character'} — ${IRK[character.race] || ''}`.replace(/ — $/, '');
  win.innerHTML = `<div class="ay-baslik">${esc(npc?.ad || 'Item Rental')}</div><button class="ko-kapat" title="Close"></button>
    <div class="kr-govde">
      <div class="kr-bilgi"><b>${esc(SINIF[d.sinif] || '')} Set (${d.gun || 5} Day${(d.gun || 5) > 1 ? 's' : ''})</b></div>
      ${(d.liste || []).length ? `<div class="kr-liste">${d.liste.map((x) => { const it = IT.get(Number(x.num)); return `<div class="kr-satir" data-id="${x.id}" data-num="${x.num}" title=""><span class="kr-ikon">${it ? iconHtml(it, 40) : ''}</span></div>`; }).join('')}</div>
        <div class="kr-alt"><span class="kr-fiyat">${noahHtml(toplam)}</span><button class="ay-dugme" data-k="set"${aktif || dusuk ? ' disabled' : ''}>Rent</button></div>
        ${dusuk ? `<div class="kr-uyari">You must be at least level <b>${minSv}</b> to rent items.</div>` : ''}
        ${aktif ? `<div class="kr-uyari">You cannot rent again until your current rental expires. Remaining time: <b>${kalanYaz(aktif.getTime())}</b></div>` : ''}`
        : '<div class="nk-not">There is no rental set for your class.</div>'}
    </div>`;
  (document.getElementById('kohud') || document.body).append(win);
  win.style.pointerEvents = 'auto';
  koWindow(win); toFront(win);
  win.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); toFront(win); });
  win.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') kapat(); });
  win.querySelector('.ko-kapat').onclick = kapat;
  // ipucu: eşya bilgisi + en altta kiralama süresi (5 gün)
  win.addEventListener('pointermove', (ev) => {
    const r = ev.target.closest('.kr-satir'); const it = r && IT.get(Number(r.dataset.num));
    if (!it) { tip?.remove(); tip = null; return; }
    tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu' });
    if (!tip.isConnected) document.body.append(tip);
    const x = d.liste.find((y) => String(y.id) === r.dataset.id);
    tip.innerHTML = tooltipHtml(it, { sure: { sure_sn: (Number(x?.gun) || 5) * 86400, kiralik: true }, satisGizle: true });
    Object.assign(tip.style, { position: 'fixed', zIndex: 9999, pointerEvents: 'none', left: Math.min(innerWidth - tip.offsetWidth - 8, ev.clientX + 16) + 'px', top: Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, ev.clientY - 10)) + 'px' });
  });
  win.addEventListener('pointerleave', () => { tip?.remove(); tip = null; });
  const kirala = async () => {
    const soru = `Do you want to rent the ${SINIF[d.sinif] || ''} set (${d.liste.length} pieces) for ${d.gun || 5} days for ${noah(toplam)} Noah?`;
    const yap = async () => {
      try { const p = state?.player?.position || window.__ko?.player?.position; if (p) await sb.from('characters').update({ x: p.x, z: p.z }).eq('id', character.id); } catch {}
      const { data: r, error: e } = await sb.rpc('kira_al', { p_char: character.id, p_npc: Number(npc?.id), p_id: null });
      if (e || !r?.ok) { hud.notice?.(r?.mesaj || e?.message || 'The rental failed.', 'hata'); return; }
      hud.info?.(`${r.esyalar.map((x) => x.ad).join(', ')} rented for 5 days (${noah(r.ucret)} Noah).`, 'seviye');
      kapat(); await state?.inv?.reload?.(); state?.inv?.stats?.();
    };
    if (hud.soru) hud.soru('Item Rental', soru, yap); else yap();
  };
  win.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    if (b.dataset.k === 'set' && !b.disabled) kirala();
  });
}
export function kapat() { tip?.remove(); tip = null; win?.remove(); win = null; }
