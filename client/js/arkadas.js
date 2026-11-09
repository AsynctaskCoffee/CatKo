// KO arkadaş listesi (Karakter Bilgisi → Friend sekmesi, deadsoft re_page_friends) + oyuncuya sağ tık menüsü (deadsoft re_minimenu).
// Sunucu: arkadaslar tablosu, arkadas_liste / arkadas_ekle / arkadas_cikar. Çevrimiçi = game_sessions son 20 sn.
// Liste: yeşil = çevrimiçi, kırmızı = çevrimdışı. Register = isimle ekle, Delete = seçiliyi çıkar, Whisper = özel mesaj.
import { buildLayout, hasLayout, ekUI, draggable } from './kui.js';
import { iconHtml, fromDb, tooltipHtml, loadMeta } from './esya.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SATIR = 11;

export function initArkadas({ sb, character, hud, state }) {
  const me = Number(character.id);
  let liste = [], secili = null, bas = 0, yukleniyor = false, L = null, P = null, zam = 0;

  const rpc = async (fn, args = {}) => {
    const { data, error } = await sb.rpc(fn, { p_char: me, ...args });
    if (error) { hud.notice?.(error.message, 'hata'); return null; }
    if (data?.ok === false) { hud.notice?.(data.reason || 'The operation failed.', 'hata'); return null; }
    return data;
  };

  async function yukle() {
    if (yukleniyor) return; yukleniyor = true;
    try { const d = await rpc('arkadas_liste'); if (Array.isArray(d)) liste = d; } finally { yukleniyor = false; }
    window.koArkadasIdleri = () => liste.map((a) => Number(a.id));   // PM süzgeci (Whisper Mode Settings → Friend)
    if (secili != null && !liste.some((a) => a.id === secili)) secili = null;
    bas = Math.max(0, Math.min(bas, liste.length - SATIR));
    ciz();
  }

  async function ekle(ad) {
    ad = String(ad || '').trim(); if (!ad) return;
    const d = await rpc('arkadas_ekle', { p_ad: ad });
    if (d) { hud.info?.(`${d.ad} has been added to your friend list.`, 'beceri'); await yukle(); }
  }

  // ---------- pencere
  function bagla() {
    L = hud.arkadasL?.(); P = L?.sayfa; if (!P || P._bagli) return; P._bagli = true;
    for (let i = 0; i < SATIR; i++) {
      const b = P.get('base_friend' + i); if (!b) continue;
      b.classList.add('ark-satir'); b.style.pointerEvents = 'auto'; b.style.cursor = 'pointer';
      b.addEventListener('click', () => { const a = liste[bas + i]; if (!a) return; secili = a.id; ciz(); });
      b.addEventListener('dblclick', () => { const a = liste[bas + i]; if (a?.cevrimici) state.pm?.ac?.(a.id, a.ad); });
    }
    const alan = P.el;
    // açıklama satırındaki "Disconnected" noktası da kırmızı (KO'da gri; burada çevrimdışı = kırmızı)
    for (const e of alan.querySelectorAll(':scope > .kui-img')) if (Math.abs(parseFloat(e.style.left) - 207) < 3 && Math.abs(parseFloat(e.style.top) - 388) < 3) e.classList.add('ark-kapali');
    alan.addEventListener('wheel', (e) => { if (liste.length <= SATIR) return; e.preventDefault(); bas = Math.max(0, Math.min(liste.length - SATIR, bas + Math.sign(e.deltaY))); ciz(); }, { passive: false });
    const sc = P.get('scrollbar_list');
    if (sc) { const d = sc.querySelectorAll(':scope > .kui-btn'); d[0]?.addEventListener('click', () => { bas = Math.max(0, bas - 1); ciz(); }); d[1]?.addEventListener('click', () => { bas = Math.max(0, Math.min(liste.length - SATIR, bas + 1)); ciz(); }); }
    P.click('btn_refresh', () => yukle());
    P.click('btn_add', () => {
      const t = hud.girdi?.('Add Friend', 'Enter the name of the player you want to add.', { max: 20 }, (v) => ekle(v));
      if (t === false) { const v = prompt('Name of the player you want to add:'); if (v) ekle(v); }
    });
    P.click('Btn_Delete', () => {
      const a = liste.find((x) => x.id === secili); if (!a) return hud.notice?.('Select a friend from the list first.', 'hata');
      hud.soru?.('Delete Friend', `Remove ${a.ad} from your friend list?`, async () => { if (await rpc('arkadas_cikar', { p_id: a.id })) { hud.info?.(`${a.ad} has been removed from your friend list.`, 'soluk'); secili = null; yukle(); } }, null, { kompakt: true });
    });
    P.click('btn_whisper', () => {
      const a = liste.find((x) => x.id === secili); if (!a) return hud.notice?.('Select a friend from the list first.', 'hata');
      if (!a.cevrimici) return hud.notice?.(`${a.ad} is not online.`, 'hata');
      state.pm?.ac?.(a.id, a.ad);
    });
    P.click('btn_party', () => {
      const a = liste.find((x) => x.id === secili); if (!a) return hud.notice?.('Select a friend from the list first.', 'hata');
      if (!a.cevrimici) return hud.notice?.(`${a.ad} is not online.`, 'hata');
      state.parti?.davetEt(a.id, a.ad);
    });
  }

  function ciz() {
    bagla(); if (!P) return;
    const sec = P.get('img_choice');
    let secGor = false;
    for (let i = 0; i < SATIR; i++) {
      const b = P.get('base_friend' + i); if (!b) continue;
      const a = liste[bas + i];
      const q = (id) => b.querySelector(`[data-id="${id}"]`);
      const ad = q('strname'); if (ad) { ad.textContent = a ? a.ad : ''; ad.style.color = a ? (a.cevrimici ? '#ffffff' : '#bdb3a0') : ''; ad.title = a ? `${a.ad} · Sv. ${a.sv ?? '?'}${a.cevrimici ? ' · çevrimiçi' : ' · çevrimdışı'}` : ''; }
      const on = q('icon_on'), off = q('icon_off'), pt = q('icon_party');
      if (on) on.style.display = a && a.cevrimici ? '' : 'none';
      if (off) { off.style.display = a && !a.cevrimici ? '' : 'none'; off.classList.add('ark-kapali'); }
      if (pt) pt.style.display = 'none';
      b.style.cursor = a ? 'pointer' : 'default';
      if (a && a.id === secili && sec) { sec.style.top = b.style.top; secGor = true; }
    }
    if (sec) sec.style.display = secGor ? '' : 'none';
  }

  hud.onArkadasAc = () => { bagla(); ciz(); yukle(); };
  setInterval(() => { const w = hud.arkadasL?.(); if (w && !w.el.hidden && !document.hidden) yukle(); }, 8000);   // açıkken çevrimiçi durumu tazelenir

  // ---------- oyuncuya sağ tık menüsü (KO re_minimenu)
  let menu = null;
  const menuKapat = () => { menu?.el.remove(); menu = null; };
  addEventListener('pointerdown', (e) => { if (menu && !menu.el.contains(e.target)) menuKapat(); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) menuKapat(); });

  // ---- KO oyuncu sağ tık menüsü (orijinal re_minimenu): "Request a party" · User trade · Whisper · Add friend · User Information · Duel · Equipment View
  const SINIF = { 1: 'Warrior', 2: 'Rogue', 3: 'Magician', 4: 'Priest', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Enchanter', 11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Shadow Vain', 15: 'Shadow Knight' };
  let orjHazir = false; ekUI('minimenu').then((ok) => { orjHazir = !!ok && hasLayout('re_minimenu_orj'); }).catch(() => {});
  async function islem(k, id, meta) {
    const ad = meta?.name || 'Player';
    if (k === 'parti') return state.parti ? state.parti.davetEt(id, ad) : hud.notice?.('The party system is loading.', 'hata');
    if (k === 'takas') return state.takas?.takasIste?.(id, meta);
    if (k === 'pazar') return state.pazar?.bak?.(id);
    if (k === 'mesaj') return state.pm?.ac?.(id, ad);
    if (k === 'arkadas') return ekle(ad);
    if (k === 'duello') return state.duello ? state.duello.iste(id, ad) : hud.notice?.('The duel system is loading.', 'hata');   // (3.11) KO Duel
    if (k === 'klan') return state.klanApi?.davetEt?.(id);
    // KO View Inventory: hedefin I penceresinin aynısı (anlık, 1 dk) — çantada Equipment Confirmation Item gerekir
    if (k === 'envanter') return import('./envanter-bak.js').then(({ envanterBak }) => envanterBak({ sb, character, hud, state, hedef: id })).catch((er) => hud.notice?.(er.message, 'hata'));
    // (3.11) KO Character Info penceresi (re_map_info); paket yoksa eski tek satırlık bilgi
    if (k === 'bilgi' && await import('./karakter-bilgi.js').then(({ karakterBilgiAc }) => karakterBilgiAc({ sb, character, hud, hedef: id })).catch(() => false)) return;
    if (k === 'bilgi' || k === 'ekipman') {
      const d = await rpc('oyuncu_ekipman', { p_hedef: Number(id) }); if (!d) return;
      if (!d.ok) return hud.notice?.(d.reason, 'hata');
      if (k === 'bilgi') return hud.info?.(`${d.name} : Level ${d.level} ${SINIF[Number(d.class) % 100] || ''} · ${Number(d.nation) === 2 ? 'El Morad' : 'Karus'}${d.klan ? ` · Clan [${d.klan}]` : ''}${d.np ? ` · National Points ${Number(d.np).toLocaleString('en-US')}` : ''}`, 'beceri');
      return ekipmanGoster(d);
    }
  }
  // (31.10) sohbetin solundaki oyuncu listesinde sağ tık: KO orijinal re_minimenu_userlist
  //   Request Party · Whisper · Add as friend · View Info · Copy ID · EquipmentView
  let ulHazir = false; ekUI('userlistmenu').then((ok) => { ulHazir = !!ok && hasLayout('re_minimenu_userlist'); }).catch(() => {});
  function listeMenu(id, ad, x, y) {
    menuKapat();
    if (!ulHazir) return false;
    const M = buildLayout('re_minimenu_userlist', { className: 'ko-minimenu ko-ulmenu' });
    for (const [b, k] of [['btn_party', 'parti'], ['btn_wis', 'mesaj'], ['btn_addfriend', 'arkadas'], ['btn_info', 'bilgi'], ['btn_IdCopy', 'kopya'], ['btn_UserEquipInfo', 'envanter']]) {
      const el = M.get(b); if (!el) continue; el.dataset.k = k;
      // KO düğme yazısı: normal beyaz, üzerinde sarı (renk CSS'te)
    }
    (document.getElementById('kohud') || document.body).append(M.el);
    M.el.style.pointerEvents = 'auto'; M.el.style.zIndex = 5200;
    M.el.style.left = Math.max(4, Math.min(x + 2, innerWidth - 120)) + 'px';
    M.el.style.top = Math.max(4, Math.min(y + 2 + 8, innerHeight - 124)) + 'px';
    M.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    M.el.addEventListener('contextmenu', (e) => e.preventDefault());
    M.el.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
      menuKapat();
      if (k === 'kopya') { try { navigator.clipboard?.writeText(ad); } catch {} return hud.info?.(`${ad} has been copied.`, 'soluk'); }
      if (k === 'mesaj' && hud.ozelMesajAc) return hud.ozelMesajAc(id, ad);
      if (['bilgi', 'envanter'].includes(k) && !Number(id)) return hud.notice?.(`${ad} is not online.`, 'hata');
      islem(k, id, { name: ad });
    });
    menu = M; return true;
  }
  function oyuncuMenuOrj(id, meta, x, y) {
    menuKapat();
    const M = buildLayout('re_minimenu_orj', { className: 'ko-minimenu ko-minimenu-orj' });
    const ad = meta?.name || 'Player', pazarci = !!state?.pazar?.saticiMi?.(id);
    const klanDavet = state?.klan && [1, 2].includes(Number(state.klan.rutbe)) && Number(meta?.nation) === Number(character.nation) && !meta?.klan;
    const dinamik = [['parti', 'Request a party'], ...(klanDavet ? [['klan', 'Clan invite']] : [])];
    const sabit = [[pazarci ? 'pazar' : 'takas', pazarci ? 'Merchant' : 'User trade'], ['mesaj', 'Whisper'], ['arkadas', 'Add friend'], ['bilgi', 'User Information'], ['duello', 'Duel'], ['envanter', 'View Inventory']];
    const yazi = (b, t, k) => { if (!b) return; b.dataset.k = k; const tl = b.querySelectorAll('.kui-tx'); if (tl.length) tl.forEach((e) => (e.textContent = t)); else { const tx = document.createElement('span'); tx.className = 'kmo-yazi'; tx.textContent = t; b.append(tx); } };   // orijinal düğmelerin kendi yazıları (st0–st3)
    const dn = dinamik.length;
    for (let i = 0; i < 5; i++) {
      const b = M.get('btn_dynamic0' + i), im = M.get('img_dynamic0' + i), d = dinamik[4 - i];
      if (!d) { if (b) b.style.display = 'none'; if (im) im.style.display = 'none'; continue; }
      yazi(b, d[1], d[0]);
    }
    const head = M.get('img_head'), ust = (parseFloat(M.get('img_dynamic0' + (5 - dn))?.style.top) || 95) - 13; if (head) head.style.top = ust + 'px';
    sabit.forEach(([k, t], i) => yazi(M.get('btn_default0' + i), t, k));
    (document.getElementById('kohud') || document.body).append(M.el);
    M.el.style.pointerEvents = 'auto'; M.el.style.zIndex = 5200;
    M.el.style.left = Math.max(4, Math.min(x + 6, innerWidth - 128)) + 'px';
    M.el.style.top = Math.max(4 - ust, Math.min(y + 6 - ust, innerHeight - 232)) + 'px';
    M.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    M.el.addEventListener('contextmenu', (e) => e.preventDefault());
    M.el.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
      menuKapat(); islem(k, id, meta);
    });
    menu = M; return true;
  }
  // Equipment View: hedefin kuşandıkları (KO 3×5 düzen: küpe, kask, küpe / kolye, zırh, pelerin / sağ el, kemer, sol el / yüzük, pantolon, yüzük / eldiven, bot)
  let EV = null;
  async function ekipmanGoster(d) {
    await loadMeta().catch(() => {});
    EV?.remove();
    EV = document.createElement('div'); EV.className = 'ko-ekipman-bak ko-panel ko-pencere';
    const E = new Map((d.esyalar || []).map((r) => [Number(r.slot), fromDb(r.items || {})]));
    EV.innerHTML = `<div class="keb-baslik">${String(d.name).replace(/[<>&]/g, '')} <i>Lv ${d.level}</i><button class="keb-kapat">✕</button></div><div class="keb-izgara">` +
      Array.from({ length: 15 }, (_, i) => { const it = E.get(i); return `<div class="keb-yuva" data-s="${i}">${it ? iconHtml(it, 44) : ''}</div>`; }).join('') + '</div>';
    (document.getElementById('kohud') || document.body).append(EV);
    EV.style.left = Math.max(10, innerWidth / 2 - 90) + 'px'; EV.style.top = Math.max(10, innerHeight / 2 - 160) + 'px';
    EV.addEventListener('pointerdown', (e) => e.stopPropagation());
    EV.querySelector('.keb-kapat').onclick = () => { EV.remove(); EV = null; };
    let tip = null;
    EV.querySelectorAll('.keb-yuva').forEach((y) => {
      const it = E.get(Number(y.dataset.s)); if (!it) return;
      y.addEventListener('pointerenter', (e) => { tip?.remove(); tip = document.createElement('div'); tip.className = 'ko-ipucu'; tip.id = 'ko-ipucu-yuzen'; tip.innerHTML = tooltipHtml(it); document.body.append(tip); tip.style.left = Math.min(innerWidth - 310, e.clientX + 14) + 'px'; tip.style.top = Math.min(innerHeight - tip.offsetHeight - 6, e.clientY + 10) + 'px'; });
      y.addEventListener('pointerleave', () => { tip?.remove(); tip = null; });
    });
  }
  function oyuncuMenu(id, meta, x, y) {
    if (orjHazir) return oyuncuMenuOrj(id, meta, x, y);
    if (!hasLayout('re_minimenu')) return false;
    menuKapat();
    const M = buildLayout('re_minimenu', { className: 'ko-minimenu' });
    const ad = meta?.name || 'Oyuncu';
    const pazarci = !!state?.pazar?.saticiMi?.(id);
    const klanDavet = state?.klan && [1, 2].includes(Number(state.klan.rutbe)) && Number(meta?.nation) === Number(character.nation) && !meta?.klan;
    // üst (dinamik) bölüm: KO'daki gibi "Request a party" (+ klan lideri için klan daveti)
    const dinamik = [['parti', 'Request a party'], ...(klanDavet ? [['klan', 'Clan invite']] : [])];
    // alt bölüm: User trade, Whisper, Add friend, Gift, Duel
    const sabit = [[pazarci ? 'pazar' : 'takas', pazarci ? 'Merchant' : 'User trade'], ['mesaj', 'Whisper'], ['arkadas', 'Add friend'], ['hediye', 'Gift'], ['duello', 'Duel']];
    const yaz = (btn, t) => { for (const e of btn.querySelectorAll('.kui-tx')) e.textContent = t; };
    // dinamik düğmeler alttan yukarı (04 en altta, sabit listenin hemen üstünde)
    const DH = 19, dn = dinamik.length;
    for (let i = 0; i < 5; i++) {
      const b = M.get('btn_dynamic0' + i), im = M.get('img_dynamic0' + i), k = 4 - i;   // k: alttan sıra
      const d = dinamik[k];
      if (!d) { if (b) b.style.display = 'none'; if (im) im.style.display = 'none'; continue; }
      if (b) { yaz(b, d[1]); b.dataset.k = d[0]; }
    }
    // başlık süsü: en üstteki dinamik satırın üstüne
    const head = M.get('img_head'); if (head) head.style.top = (parseFloat(M.get('img_dynamic0' + (5 - dn))?.style.top) || 89) - 13 + 'px';
    const ids = ['btn_default00', 'btn_default01', 'btn_default02', 'btn_default03', 'btn_default04'];
    ids.forEach((bid, i) => { const b = M.get(bid); if (!b) return; yaz(b, sabit[i][1]); b.dataset.k = sabit[i][0]; });
    // Vs Teklif satırı yok: alt kenar süsü bir satır yukarı
    const vs = M.get('btn_vsteklif'); if (vs) vs.style.display = 'none';
    const def = M.get('base_default');
    if (def) {
      const ims = [...def.querySelectorAll(':scope > .kui-img')];
      const t = (e) => parseFloat(e.style.top) || 0;
      const vsImg = vs ? ims.find((e) => Math.abs(t(e) - t(vs)) < 3) : null;
      const alt = ims.reduce((a, e) => (t(e) > t(a) ? e : a), ims[0]);
      if (vsImg && vsImg !== alt) { vsImg.style.display = 'none'; alt.style.top = t(vsImg) + 'px'; }
    }
    (document.getElementById('kohud') || document.body).append(M.el);
    M.el.style.pointerEvents = 'auto'; M.el.style.zIndex = 5200;
    // görünen üst kenar: başlık süsü
    const ust = parseFloat(head?.style.top) || 0, altK = 222 + 12;
    M.el.style.left = Math.max(4, Math.min(x + 6, innerWidth - 115)) + 'px';
    M.el.style.top = Math.max(4 - ust, Math.min(y + 6 - ust, innerHeight - altK - 4)) + 'px';
    M.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    M.el.addEventListener('contextmenu', (e) => e.preventDefault());
    M.el.addEventListener('click', async (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
      menuKapat();
      if (k === 'parti') return hud.notice?.('The party system is not available yet.', 'hata');
      if (k === 'takas') return state.takas?.takasIste?.(id, meta);
      if (k === 'pazar') return state.pazar?.bak?.(id);
      if (k === 'mesaj') return state.pm?.ac?.(id, ad);
      if (k === 'arkadas') return ekle(ad);
      if (k === 'hediye') return state.mail?.yeni ? state.mail.yeni(ad) : hud.notice?.('Could not load the mailbox.', 'hata');   // KO Gift: eşyayı mektupla gönder
      if (k === 'duello') return state.duello ? state.duello.iste(id, ad) : hud.notice?.('The duel system is loading.', 'hata');   // (3.11) KO Duel
      if (k === 'klan') return state.klanApi?.davetEt?.(id);
    });
    menu = M; return true;
  }

  setTimeout(() => { yukle().catch(() => {}); }, 6000);   // PM süzgeci için arkadaş listesi oyuna girişte bir kez
  return { yukle, ekle, oyuncuMenu, listeMenu, menuKapat };
}
