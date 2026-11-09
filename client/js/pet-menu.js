// KO pet menüsü (P): orijinal re_pet_various_frame (Status / Item / Skill sekmeleri) + re_pet_page_state / _inventory / _skill (assets/ui/petmenu).
// Status: canlı pet görüntüsü, ad, HP / MP, seviye, saldırı, savunma, tokluk (Satiation), EXP, dirençler (RES).
// Item: 4 pet yuvası (iksir / paket) + Feeding (yem bırak → "Do you want to feed?" → besler) ve çantanın 7×4 kopyası. Skill: pet becerileri.
import { ekUI, hasLayout, buildLayout, draggable } from './kui.js';
import { iconHtml, tooltipHtml } from './esya.js';
import { toFront } from './ko-pencere.js';

let M = null;
export async function petMenuAc(api, { hud, state }) {
  if (M) { M.kapat(); return; }
  if (!(await ekUI('petmenu').catch(() => false)) || !hasLayout('re_pet_various_frame')) return hud.notice?.('Could not load the Familiar window.', 'hata');
  const kok = document.createElement('div'); kok.className = 'ko-pet-menu'; (document.getElementById('kohud') || document.body).append(kok);
  const F = buildLayout('re_pet_various_frame', { className: 'pm-cerceve' }); kok.append(F.el);
  const S = {}; for (const [k, ad] of [['state', 're_pet_page_state'], ['item', 're_pet_page_inventory'], ['skill', 're_pet_page_skill']]) { S[k] = buildLayout(ad, { className: 'pm-sayfa pm-' + k }); S[k].el.style.top = '56px'; kok.append(S[k].el); }
  kok.style.left = Math.max(8, innerWidth - 380) + 'px'; kok.style.top = Math.max(8, (innerHeight - 470) / 2) + 'px';
  let sekme = 'state', tip = null;
  const ipKapat = () => { tip?.remove(); tip = null; };
  const ip = (it, e) => { if (!it) return ipKapat(); tip ||= Object.assign(document.createElement('div'), { className: 'ko-ipucu' }); if (!tip.isConnected) document.body.append(tip); tip.innerHTML = tooltipHtml(it, { satisGizle: true }); Object.assign(tip.style, { position: 'fixed', zIndex: 9999, pointerEvents: 'none', left: Math.max(4, e.clientX - tip.offsetWidth - 16) + 'px', top: Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, e.clientY - 10)) + 'px' }); };
  const kapat = () => { ipKapat(); clearInterval(tik); removeEventListener('ko-envanter-degisti', ciz); kok.remove(); M = null; };
  M = { kapat };
  kok.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(kok); });
  kok.addEventListener('contextmenu', (e) => e.preventDefault());
  kok.addEventListener('keydown', (e) => e.stopPropagation());
  // pencereyi üst şeritten sürükle
  { let d = null; F.el.addEventListener('pointerdown', (e) => { if (e.target.closest('.kui-btn')) return; d = { x: e.clientX - kok.offsetLeft, y: e.clientY - kok.offsetTop }; F.el.setPointerCapture(e.pointerId); });
    F.el.addEventListener('pointermove', (e) => { if (!d) return; kok.style.left = Math.max(0, Math.min(innerWidth - 60, e.clientX - d.x)) + 'px'; kok.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - d.y)) + 'px'; });
    F.el.addEventListener('pointerup', () => (d = null)); }
  const sekmeYap = (k) => { sekme = k; for (const [s, L] of Object.entries(S)) L.el.hidden = s !== k;
    for (const s of ['state', 'item', 'skill']) { F.show('btn_' + s, s !== k); F.show('btn_' + s + '_active', s === k); }
    ciz(); };
  for (const s of ['state', 'item', 'skill']) { F.click('btn_' + s, () => sekmeYap(s)); F.click('btn_' + s + '_active', () => {}); }
  F.click('btn_exit', kapat);
  // ---- Status
  const st = S.state; st.text('str10', '');
  const etk = (L, id, t) => L.text(id, t);
  // RES etiketleri sabit yazı (orijinal dokuda değil: str4-9 değerleri) — sıra: Flame, Glacier, Lightning | Spells, Curse, Poison
  const bar = (L, id, oran) => { const e = L.get(id); if (e) L.progress?.(null, Math.max(0, Math.min(1, oran)), e); };
  // ---- Item
  const it = S.item; it.show('feeding_message', false);
  const ar = (id) => [...it.el.querySelectorAll(`[data-id="${id}"]`)];
  // ızgara: kimlikleri 0-27 olan kui-ar (alt kısımda, y ≥ 186) = çanta 14-41; üstteki 0,1,2,3 (y < 186) = pet yuvaları
  const cantaYuva = [], petYuva = [];
  for (let i = 0; i < 28; i++) { for (const e of ar(String(i))) { if (!e.classList.contains('kui-ar')) continue; const y = parseFloat(e.style.top); if (y >= 180) { cantaYuva[i] = e; e.dataset.cs = 14 + i; } else if (i <= 3) { petYuva[i] = e; e.dataset.ps = i + 1; } } }
  const sayi = []; for (let i = 0; i < 28; i++) sayi[i] = [...it.el.querySelectorAll(`.kui-tx[data-id="${i}"]`)][0];
  const feed = it.get('Feeding'); if (feed) feed.dataset.feed = '1';
  let bekleyenYem = null;
  it.click('btn_ok', async () => { it.show('feeding_message', false); const s = bekleyenYem; bekleyenYem = null; if (s != null) { await api.kullan(s, state.inv?.items?.get?.(s)?.it); ciz(); } });
  it.click('btn_cancle', () => { it.show('feeding_message', false); bekleyenYem = null; });
  const yemMi = (e) => [152, 176].includes(Number(e?.it?.Kind));
  const birak = async (cs, hedef) => {
    const e = state.inv?.items?.get?.(cs); if (!e?.it) return;
    if (hedef === 'feed' || (hedef == null && yemMi(e))) { if (!yemMi(e)) return hud.notice?.('Only Familiar food can be fed.', 'hata'); bekleyenYem = cs; it.show('feeding_message', true); return; }
    let ps = hedef; if (ps == null) { const env = api.veri()?.envanter || []; ps = [1, 2, 3, 4].find((i) => !env[i]) ?? 1; }
    await api.esyaKoy(cs, ps); ciz();
  };
  it.el.addEventListener('click', (e) => { const c = e.target.closest('[data-cs]'); if (c) birak(Number(c.dataset.cs)); const p = e.target.closest('[data-ps]'); if (p && api.veri()?.envanter?.[Number(p.dataset.ps)]) api.esyaAl(Number(p.dataset.ps)).then(ciz); });
  it.el.addEventListener('contextmenu', (e) => { const c = e.target.closest('[data-cs]'); if (c) birak(Number(c.dataset.cs)); });
  it.el.dataset.esyaBirak = '1';
  it.el.addEventListener('ko-esya-birak', (ev) => { const d = ev.detail || {}; if (!(d.slot >= 14 && d.slot <= 41)) return; const h = document.elementFromPoint(d.x ?? 0, d.y ?? 0); birak(d.slot, h?.closest?.('[data-feed]') ? 'feed' : h?.closest?.('[data-ps]') ? Number(h.closest('[data-ps]').dataset.ps) : null); });
  kok.addEventListener('pointermove', (e) => {
    const c = e.target.closest('[data-cs]'), p = e.target.closest('[data-ps]');
    if (c) return ip(state.inv?.items?.get?.(Number(c.dataset.cs))?.it, e);
    if (p) { const x = api.veri()?.envanter?.[Number(p.dataset.ps)]; return ip(x && api.esya.get(Number(x.num)), e); }
    ipKapat();
  });
  kok.addEventListener('pointerleave', ipKapat);
  // ---- Skill
  const sk = S.skill; for (const id of ['str_mp', 'str_item', 'str_info', 'str_name', 'str_auto', 'str_lv']) sk.text(id, '');
  let skSec = 0;
  const skCiz = (p) => {
    const L = api.beceriler || [];
    for (let i = 0; i < 10; i++) { const a = sk.get(String(i)); if (!a) continue; const b = L[i]; a.innerHTML = b ? `<span class="pm-bk${p.seviye >= b[2] ? ' acik' : ''}" style="background-position:${-i * 26}px 0"></span>` : ''; a.dataset.bi = i; a.classList.toggle('pm-sec', i === skSec && !!b); }
    const b = L[skSec];
    if (b) { sk.text('str_name', `Skill : ${b[1]}`); sk.text('str_lv', `Required level : ${b[2]}`); sk.text('str_mp', `MP : ${(b[0] - 301000) * 10}`); sk.text('str_auto', 'Auto skill : Possible'); sk.text('str_item', `Cooldown : ${b[3]} sec`); sk.text('str_info', p.seviye >= b[2] ? 'Your Familiar uses this skill automatically in Attack mode.' : `Unlocked at level ${b[2]}.`); }
  };
  sk.el.addEventListener('click', (e) => { const a = e.target.closest('[data-bi]'); if (a && api.beceriler?.[Number(a.dataset.bi)]) { skSec = Number(a.dataset.bi); ciz(); } });
  sk.show('btn_left', false); sk.show('btn_right', false);
  // ---- çizim
  function ciz() {
    const p = api.veri(); if (!p) { kapat(); return; }
    const s = p.stat?.saldiri != null ? p.stat : { hp: 300 + p.seviye * 80, mp: 150 + p.seviye * 30, saldiri: 15 + p.seviye * 8, savunma: 20 + p.seviye * 6 };
    const hp = p.hp ?? s.hp, mhp = p.max_hp ?? s.hp, mp = p.mp ?? s.mp, mmp = p.max_mp ?? s.mp;
    const alan = (S[sekme].get('area_pet')); if (alan && sekme !== 'skill') { const cv = api.onizleme(p.gorunum); if (cv && cv.parentElement !== alan) alan.append(cv); }
    if (sekme === 'state') {
      st.text('str10', p.ad || ''); st.text('str11', `${hp}/${mhp}`); st.text('str12', `${mp}/${mmp}`); st.text('str0', String(p.seviye));
      st.text('str2', String(s.saldiri ?? 0)); st.text('str3', String(s.savunma ?? 0));
      const tk = Math.max(0, Math.min(100, (Number(p.tokluk) || 0) / 100)), ex = Math.max(0, Math.min(100, (Number(p.exp) || 0) / Math.max(1, Number(p.gerek) || 1) * 100));
      st.text('str13', tk.toFixed(2)); st.text('str1', ex.toFixed(2));
      bar(st, 'prog_hp', hp / Math.max(1, mhp)); bar(st, 'prog_mp', mp / Math.max(1, mmp)); bar(st, 'prog_stomach', tk / 100); bar(st, 'prog_exp', ex / 100);
      const R = p.stat?.res || {}; ['ates', 'buz', 'simsek', 'buyu', 'lanet', 'zehir'].forEach((k, i) => st.text('str' + (4 + i), String(R[k] ?? 0)));
    } else if (sekme === 'item') {
      const bag = state.inv?.items || new Map();
      for (let i = 0; i < 28; i++) { const e = cantaYuva[i]; if (!e) continue; const b = bag.get(14 + i); e.innerHTML = b?.it ? iconHtml(b.it, 42) : ''; const n = Number(b?.row?.count) || 0; if (sayi[i]) sayi[i].textContent = b?.it && n > 1 ? String(n) : ''; }
      const env = p.envanter || []; const nums = env.filter(Boolean).map((x) => Number(x.num));
      api.esyaBilgi(nums).then(() => { for (let i = 0; i < 4; i++) { const e = petYuva[i]; if (!e) continue; const x = env[i + 1], it2 = x && api.esya.get(Number(x.num)); e.innerHTML = it2 ? `${iconHtml(it2, 43)}${Number(x.count) > 1 ? `<b class="pm-adet">${x.count}</b>` : ''}` : ''; }
        if (feed) { const x = env[0], it2 = x && api.esya.get(Number(x.num)); feed.innerHTML = it2 ? `${iconHtml(it2, 43)}${Number(x.count) > 1 ? `<b class="pm-adet">${x.count}</b>` : ''}` : ''; } });
    } else skCiz(p);
  }
  addEventListener('ko-envanter-degisti', ciz);
  const tik = setInterval(() => { if (!kok.isConnected) return clearInterval(tik); ciz(); }, 1000);
  sekmeYap('state');
  return true;
}
