// GM Paneli → Dönüşüm: GM kendini ya da herhangi bir oyuncuyu oyundaki herhangi bir mob / NPC modeline dönüştürür.
// Liste: tüm moblar (monsters) ve NPC'ler (npc_katalog.json), model portresiyle (görünür satırlar sırayla çizilir), üzerine gelince 3B önizleme.
// Süre dakika (0 = süresiz), boyut %. Sunucu: gm_donusum_ver (characters.donusum + gm_bildirim 'donusum' → hedefin istemcisi anında uygular).
import { koWindow, toFront } from './ko-pencere.js';
import { showModel, hideModel, modelIkon } from './model-onizleme.js';
import { goster as kartGoster, gizle as kartGizle } from './onizleme-kart.js';
import { createNpc, createCharacter } from './character.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pidOf = (m) => { const x = /^npc_(\d+)$/.exec(String(m || '')); return x ? Number(x[1]) : null; };
const ROW = 46;
// oyuncu ırkı görünümleri (pid = −ırk): karakter modeli dönüşenin kuşandıklarıyla giydirilir (ör. rogue silah/zırhla Karus kadın)
const IRKLAR = [
  [1, 'Karus Warrior — Arch Tuarek'], [2, 'Karus — Tuarek (warrior / rogue / priest)'], [3, 'Karus — Wrinkle Tuarek (mage)'], [4, 'Karus Kadın — Puri Tuarek (asas / priest / mage)'], [6, 'Karus — Kurian'],
  [11, 'El Morad Warrior — Barbarian'], [12, 'El Morad Erkek'], [13, 'El Morad Kadın'], [14, 'El Morad — Porutu'],
].map(([irk, ad]) => ({ ad, sv: null, pid: -irk, boyut: 100, no: 'ırk ' + irk, irk }));

export function initGmDonusum({ sb, character, hud, onYardimci = null }) {
  let win = null, tur = 'mob', ara = '', liste = { mob: null, npc: null }, view = [], sec = null, gozlem = null;

  async function mobYukle() {
    const out = [];
    for (let bas = 0; bas < 20000; bas += 1000) {
      const { data, error } = await sb.from('monsters').select('sid,name,level,pid,size,model').order('level').order('name').range(bas, bas + 999);
      if (error || !data?.length) break; out.push(...data); if (data.length < 1000) break;
    }
    // aynı modelli kopyalar tek satır (ad + model)
    const gor = new Set();
    return out.map((m) => ({ ad: m.name, sv: m.level, pid: (pidOf(m.model) ?? Number(m.pid)) || null, boyut: Number(m.size) || 100, no: m.sid }))
      .filter((x) => x.pid && !gor.has(x.ad + '|' + x.pid) && gor.add(x.ad + '|' + x.pid));
  }
  async function npcYukle() {
    const r = await fetch((window.KO_V || ((u) => u))('./assets/npc_katalog.json')).catch(() => null);
    const j = r?.ok ? await r.json() : [];
    const L = Array.isArray(j) ? j : j.npcs || [];
    const gor = new Set();
    return L.map((n) => ({ ad: n.n, sv: null, pid: pidOf(n.m), boyut: Number(n.s) || 100, no: n.id }))
      .filter((x) => x.pid && !gor.has(x.ad + '|' + x.pid) && gor.add(x.ad + '|' + x.pid));
  }

  function kur(host = null) {
    win = document.createElement('div'); win.id = 'gm-donusum'; win.className = 'ko-panel ko-pencere';
    win.innerHTML = `<div class="ay-baslik">GM — Dönüşüm</div>
      <div class="gd-ust">
        <label>Oyuncu <input name="hedef" placeholder="boş = kendin" autocomplete="off"></label>
        <label>Süre <input name="sure" type="number" min="0" max="100000" value="60"> dk <i>(0 = süresiz)</i></label>
        <label>Boyut <input name="boyut" type="number" min="10" max="500" value="100"> %</label>
      </div>
      <div class="gd-sekme"><button data-tur="mob" class="secili">Moblar</button><button data-tur="npc">NPC'ler</button><button data-tur="irk">Karakterler</button><input name="ara" placeholder="Ara: ad ya da numara" autocomplete="off"><span class="gd-sayi"></span></div>
      <div class="gd-liste"><div class="gd-ic"></div></div>
      <div class="gd-alt"><span class="gd-secili">Listeden bir mob ya da NPC seç.</span>
        <button data-k="don" class="ay-dugme" disabled>Dönüştür</button>${onYardimci ? '<button data-k="yardimci" class="ay-dugme gd-yardimci" disabled title="Seçili mob / NPC modelini GM yardımcısı yap">GM yardımcısı yap</button>' : ''}<button data-k="kaldir" class="ay-dugme tehlike">Dönüşümü kaldır</button></div>`;
    if (host) { win.className = 'g2-gomulu'; host.append(win); }
    else { document.body.append(win); koWindow(win); toFront(win); const k = document.createElement('button'); k.className = 'ko-kapat'; k.dataset.k = 'kapat'; k.title = 'Kapat'; win.append(k); }
    win.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(win); });
    win.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' && !host) kapat(); if (e.key === 'Enter' && sec && e.target.name !== 'ara') donustur(); });
    win.addEventListener('wheel', (e) => e.stopPropagation());
    let qt = 0;
    win.addEventListener('input', (e) => { if (e.target.name === 'ara') { clearTimeout(qt); qt = setTimeout(() => { ara = e.target.value.trim().toLocaleLowerCase('tr'); suz(); }, 200); } });
    win.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tur]'); if (t) { tur = t.dataset.tur; win.querySelectorAll('[data-tur]').forEach((b) => b.classList.toggle('secili', b === t)); sec = null; return yukle(); }
      const s = e.target.closest('.gd-satir'); if (s) { sec = view[Number(s.dataset.i)]; secYaz(); ciz(); return; }
      const b = e.target.closest('[data-k]')?.dataset.k;
      if (b === 'kapat') kapat();
      if (b === 'don') donustur();
      if (b === 'kaldir') kaldir();
      if (b === 'yardimci' && sec && sec.pid > 0) onYardimci?.(sec);
    });
    win.addEventListener('dblclick', (e) => { const s = e.target.closest('.gd-satir'); if (s) { sec = view[Number(s.dataset.i)]; donustur(); } });
    win.addEventListener('pointerover', (e) => {
      const s = e.target.closest('.gd-satir'); if (!s) return;
      const x = view[Number(s.dataset.i)], wr = win.getBoundingClientRect(), r = s.getBoundingClientRect();
      void wr; if (x && x.pid < 0) kartGoster(s, { anahtar: 'irk|' + x.irk, bilgiHtml: `<b>${esc(x.ad)}</b><i>Oyuncu görünümü · ırk ${x.irk}</i><span>Dönüşen kişi kendi kuşandıklarıyla görünür.</span>`, yap: () => createCharacter(x.irk) }); else if (x && x.pid > 0) kartGoster(s, { anahtar: 'npc_' + x.pid + '|' + x.ad, bilgiHtml: `<b>${esc(x.ad)}</b><i>${tur === 'mob' ? 'Mob' : 'NPC'} #${esc(x.no)} · model npc_${x.pid}</i>${x.sv != null ? `<span>Seviye ${x.sv}</span>` : ''}<span>Boyut %${x.boyut}</span>`, yap: () => createNpc('npc_' + x.pid) }); else kartGizle();
    });
    win.addEventListener('pointerout', (e) => { if (!e.relatedTarget?.closest?.('.gd-liste')) { hideModel(); kartGizle(); } });
    win.querySelector('.gd-liste').addEventListener('scroll', () => requestAnimationFrame(ciz));
  }
  async function yukle() {
    win.querySelector('.gd-sayi').textContent = 'Yükleniyor…';
    liste[tur] ||= await (tur === 'mob' ? mobYukle() : tur === 'irk' ? IRKLAR : npcYukle()).catch(() => []);
    suz();
  }
  function suz() {
    const L = liste[tur] || [];
    view = ara ? L.filter((x) => String(x.ad).toLocaleLowerCase('tr').includes(ara) || String(x.no).startsWith(ara) || String(x.pid).startsWith(ara)) : L;
    win.querySelector('.gd-sayi').textContent = `${view.length.toLocaleString('tr-TR')} ${tur === 'mob' ? 'mob' : 'NPC'}`;
    win.querySelector('.gd-liste').scrollTop = 0; ciz();
  }
  // sanal liste: yalnız görünen satırlar; portreler sırayla çizilir (önbellekli)
  function ciz() {
    if (!win) return;
    const list = win.querySelector('.gd-liste'), ic = list.querySelector('.gd-ic');
    ic.style.height = view.length * ROW + 'px';
    const a = Math.max(0, Math.floor(list.scrollTop / ROW) - 3), b = Math.min(view.length, Math.ceil((list.scrollTop + list.clientHeight) / ROW) + 3);
    let h = '';
    for (let i = a; i < b; i++) {
      const x = view[i];
      h += `<div class="gd-satir${sec === x ? ' secili' : ''}" data-i="${i}" style="top:${i * ROW}px"><span class="gd-resim" data-pid="${x.pid}"></span><b>${esc(x.ad)}</b><i>${x.irk ? 'Oyuncu görünümü · kuşandıklarınla' : `${x.sv != null ? 'Sv ' + x.sv + ' · ' : ''}npc_${x.pid} · #${x.no}`}</i></div>`;
    }
    ic.innerHTML = h;
    for (const el of ic.querySelectorAll('.gd-resim')) {
      const pid = Number(el.dataset.pid), irk = pid < 0 ? -pid : 0;
      const key = irk ? 'irk_' + irk : 'npc_' + pid;
      Promise.resolve(modelIkon(key, { tam: true, yap: irk ? () => createCharacter(irk) : null })).then((url) => { if (url && el.isConnected) el.style.backgroundImage = `url(${url})`; else if (el.isConnected) { el.classList.add(irk ? 'irk' : 'yok'); if (irk) el.textContent = String(irk); } });
    }
  }
  function secYaz() {
    win.querySelector('.gd-secili').innerHTML = sec ? `Seçili: <b>${esc(sec.ad)}</b>${sec.irk ? '' : ` (npc_${sec.pid})`}` : 'Listeden bir mob ya da NPC seç.';
    win.querySelector('[data-k=don]').disabled = !sec; { const yb = win.querySelector('[data-k=yardimci]'); if (yb) yb.disabled = !sec || !(sec.pid > 0); }
    if (sec) win.querySelector('[name=boyut]').value = sec.boyut || 100;
  }
  const deger = (n) => win.querySelector(`[name=${n}]`).value;
  async function donustur() {
    if (!sec) return;
    const { data, error } = await sb.rpc('gm_donusum_ver', { p_char: character.id, p_hedef: deger('hedef').trim() || null, p_pid: sec.pid, p_ad: sec.ad, p_boyut: Number(deger('boyut')) || 100, p_sure_dk: Math.max(0, Number(deger('sure')) || 0) });
    if (error || !data?.ok) { hud.notice?.(data?.mesaj || error?.message || 'Transformation failed.', 'hata'); return; }
    const sure = Math.max(0, Number(deger('sure')) || 0);
    hud.info?.(`${data.ad} transformed into ${sec.ad} (${sure ? sure + ' min' : 'permanent'}).`, 'tamam');
  }
  async function kaldir() {
    const { data, error } = await sb.rpc('gm_donusum_ver', { p_char: character.id, p_hedef: deger('hedef').trim() || null, p_pid: null, p_ad: null, p_boyut: null, p_sure_dk: null });
    if (error || !data?.ok) { hud.notice?.(data?.mesaj || error?.message || 'Could not remove.', 'hata'); return; }
    hud.info?.(`${data.ad}: transformation removed.`, 'tamam');
  }
  function kapat() { hideModel(); kartGizle(); win?.remove(); win = null; }
  async function open(host = null) { if (win) { if (host && win.parentNode !== host) host.append(win); else if (!host) toFront(win); return; } kur(host); await yukle(); }
  return { open, close: kapat };
}
