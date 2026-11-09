// KO görev sistemi: görev verileri (assets/gorev/gorevler.json — Quest_Helper/Quest_guide/Quest_Monster_Exchange/Item_Exchange'ten),
// NPC görev menüsü (KO re_npcmenu) ve ekranın sağında, mini haritanın altında sabit görev takip penceresi.
// Sunucu: quest_defs / char_quests; gorev_listem, gorev_al, gorev_birak, gorev_teslim; öldürme sayacı _mob_hit içinde (_gorev_oldur).
import { npcMenuAc, npcMenuKapat, portre } from './npc-menu.js';
import { hasLayout, buildLayout, draggable, ekUI } from './kui.js';
import { bindScroll } from './hud.js';
import { iconHtml, fromDb, tooltipHtml } from './esya.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('en-US');   // KO: 4,500
let VERI = null;
const veri = () => (VERI ||= fetch('./assets/gorev/gorevler.json').then((r) => r.json()).then((a) => new Map(a.map((q) => [q.id, q]))).catch(() => new Map()));

const NPC_AD = { 14425: '[Reconnaissance Captain] Raek', 24425: '[Reconnaissance Captain] Zamed', 13013: '[Guard] Patrick', 13016: '[Familiar Tamer] Kate', 14301: '[Blacksmith] Hepa', 16079: '[Daughter of Grand Merchant] Menissiah', 19002: '[Entrepot Trader] Berret',
  19003: '[Mercenary Adjutant] Lazi', 19004: '[Mercenary Supply Officer] Osmond', 24414: '[Nameless Warrior]', 13009: '[Mercenary Captain] Cougar', 25000: '[Kurian] Potrang',
  18004: '[Grand Merchant] Kaishan', 18005: '[Manager] Billbor', 31524: '[Mysterious] Narki' };   // KO Quest_Npc_Desc_us
const NPC_MODEL = {};
let BOLGE = 'moradon';
const sinifGrup = (c) => (c >= 1 && c <= 4 ? c : c >= 5 && c <= 12 ? Math.floor((c - 5) / 2) + 1 : 1);

export async function initGorev({ sb, character, hud, seviye, onOdul, onEsya, esyaSay = () => 0, sinif = () => character.class }) {
  BOLGE = character.zone || 'moradon';
  const G = await veri();
  // ulus süzgeci (Eslant: Karus/El Morad görevleri aynı NPC'de) ve ulusa göre NPC eşi (npcU)
  const ULUS = Number(character.nation) || 0;
  const qNpc = (q) => q.npcU?.[ULUS] ?? q.npc;
  // (3.11) KO: tekrarlanan görevler ([Repeatable Solo] / [Repeatable] / [Repeat] / [Party/Repeatable] / [Tekrar]) aynı NPC'deki aynı adlı
  // asıl görev(ler) bitirilmeden görünmez (alınmış olan teslim için görünür). El Morad / Luferson kale görevleri.
  const tekrarMi = (q) => /^\s*\[(tekrar|repeat|party\s*\/\s*repeat)/i.test(String(q.ad || ''));
  const kokAd = (q) => String(q.ad || '').replace(/^\s*\[[^\]]*\]\s*/, '').trim().toLowerCase();
  const tekrarAcik = (q) => {
    if (!tekrarMi(q) || benim.get(q.id)?.durum === 1) return true;
    const k = kokAd(q), asil = [...G.values()].filter((x) => x !== q && !tekrarMi(x) && qNpc(x) === qNpc(q) && benimMi(x) && kokAd(x) === k);
    return asil.every((x) => benim.get(x.id)?.durum === 2);
  };
  const benimMi = (q) => !q.ulus || q.ulus === ULUS;
  const benim = new Map();   // id → { durum, sayac }
  const rpc = async (fn, args = {}) => {
    const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args });
    if (error) { hud.notice?.(error.message, 'hata'); return null; }
    return data;
  };
  const isterOk = (q) => (q.ister?.esya || []).every(([n, c]) => esyaSay(n) >= c);
  const tamam = (q, s) => q.gruplar.every((g, i) => (s?.sayac?.[i] || 0) >= g.n) && isterOk(q);
  const esyaAdi = (q, n) => { const i = (q.ister?.esya || []).findIndex(([x]) => x === n); return i >= 0 ? (q.ister.esyaAd?.[i] || '').replace(/ x\d+$/, '') : `#${n}`; };
  // eşya kayıtları (ikon için) — görev ödülleri / istenenler
  const IT = new Map();
  async function esyalar(nums) {
    const eksik = [...new Set(nums)].filter((n) => !IT.has(n)); if (!eksik.length) return;
    const { data } = await sb.from('items').select('*').in('num', eksik);
    for (const r of data || []) IT.set(r.num, fromDb(r));
  }
  const odulu = (q) => (q.sinif && q.sinif[sinifGrup(sinif())]) || q.odul;

  // ---- takip penceresi (mini haritanın altı). KO re_quest_mini_tip başlığı: küçült / büyüt / kapat.
  // Kapatılınca gizli kalır (tarayıcıda saklanır); sol alttaki kız simgesi (btn_question) yeniden açar / kapatır.
  let el = null, govde = null, KL = null;
  const GKEY = 'ko-gorev-takip2-' + character.id;   // (2: eski kapalı ayarı sıfırlandı — takip penceresi varsayılan açık)
  let ayar = { gizli: false, kucuk: false }; try { Object.assign(ayar, JSON.parse(localStorage.getItem(GKEY) || '{}')); } catch {}
  delete ayar.konum;   // (7.11) her girişte Quest tips standart yerinde: ekranın sağ kenarında, dikeyde ortada (oyun içinde taşınabilir)
  const ayarKaydet = () => { try { localStorage.setItem(GKEY, JSON.stringify(ayar)); } catch {} };
  function pencere() {
    if (el?.isConnected) return el;
    const kat = document.getElementById('kohud') || document.body;
    el = document.createElement('div'); el.className = 'ko-gorev-takip'; el.hidden = true;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    if (hasLayout('re_quest_mini_tip')) {
      KL = buildLayout('re_quest_mini_tip', { className: 'gt-ko-baslik' });
      KL.show('img_bakground', false); KL.show('MiniBar_Page', false); KL.show('MiniBar_List', false);
      for (const t of KL.el.querySelectorAll('.kui-tx')) if (/Quest tips/i.test(t.textContent)) t.textContent = 'Quest tips';
      KL.click('btn_close', () => takip(false));
      KL.click('btn_mini', () => { ayar.kucuk = true; ayarKaydet(); ciz(); });
      KL.click('btn_max', () => { ayar.kucuk = false; ayarKaydet(); ciz(); });
      KL.get('btn_close').title = 'Close';
      KL.get('btn_mini').title = 'Minimize'; KL.get('btn_max').title = 'Maximize';
      el.append(KL.el);
    } else { const b = document.createElement('div'); b.className = 'gt-baslik'; b.textContent = 'Quest tips'; el.append(b); }
    govde = document.createElement('div'); govde.className = 'gt-govde'; el.append(govde);
    kat.prepend(el);   // (7.11) katmanın ilk öğesi: diğer tüm arayüz öğelerinin arkasında
    // mini haritanın tam altına yapışık (harita yeri üst düğmelere göre değişir; harita kapatılınca üst düğmelerin altına)
    const yerlestir = () => {
      if (ayar.konum) {   // oyuncunun taşıdığı yer (ekran dışına taşmaz)
        el.style.right = 'auto';
        // Genie gibi: pencerenin tamamı her zaman ekranda (kenarlardan dışarı taşınamaz)
        const r = el.getBoundingClientRect(), w = r.width || 220, h = r.height || 60;
        const x = Math.round(Math.max(0, Math.min(innerWidth - w, ayar.konum.x))), y = Math.round(Math.max(0, Math.min(innerHeight - h, ayar.konum.y)));
        ayar.konum.x = x; ayar.konum.y = y;
        el.style.left = x + 'px'; el.style.top = y + 'px';
        return;
      }
      // (7.11) standart yer: ekranın sağ kenarı, dikeyde orta (pencere kendi kat yakınlaştırmasıyla ölçülür)
      const kz = el.offsetHeight ? (el.getBoundingClientRect().height / el.offsetHeight) || 1 : 1;
      const h = el.getBoundingClientRect().height || 120;
      el.style.left = ''; el.style.right = '0px';
      el.style.top = Math.max(0, Math.round((innerHeight - h) / 2 / kz)) + 'px';
    };
    yerlestir(); addEventListener('resize', yerlestir); setInterval(yerlestir, 1000);
    // başlıktan tutup sürükle: oyuncu pencereyi istediği yere taşır (yer karakter başına saklanır; çift tık = varsayılan yere dön)
    { const tut = KL?.el || el.querySelector('.gt-baslik');
      if (tut) {
        tut.style.cursor = 'move'; let d = null;
        tut.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || e.target.closest('[data-id^="btn_"]')) return;
          const r = el.getBoundingClientRect(), z = el.offsetWidth ? r.width / el.offsetWidth : 1;
          d = { x: e.clientX - r.left, y: e.clientY - r.top, z }; tut.setPointerCapture(e.pointerId); e.preventDefault();
        });
        tut.addEventListener('pointermove', (e) => { if (!d) return; ayar.konum = { x: (e.clientX - d.x), y: (e.clientY - d.y) }; yerlestir(); });
        tut.addEventListener('pointerup', () => { if (d) { d = null; ayarKaydet(); } });
        tut.addEventListener('dblclick', (e) => { if (e.target.closest('[data-id^="btn_"]')) return; delete ayar.konum; ayarKaydet(); el.style.left = ''; yerlestir(); });
      } }
    return el;
  }
  /** Quest tips aç / kapat (aç = null → tersine çevir). KO: pencere, Mission sekmesinde onay kutusu işaretli görevleri gösterir;
   *  kapatmak (X) tüm onayları kaldırır, açmak tüm devam eden görevleri işaretler. */
  function takip(ac = null) {
    const ids = [...benim].filter(([, s]) => s.durum === 1).map(([id]) => id);
    const acik = ids.some((id) => !takipDisi.has(id));
    const hedef = ac == null ? !acik : ac;
    if (hedef && !ids.length) { hud.info?.('You have no active quests. You can get quests from NPCs.', 'gorev'); return; }
    for (const id of ids) { if (hedef) takipDisi.delete(id); else takipDisi.add(id); }
    tdKaydet(); ayar.gizli = false; ayarKaydet(); ciz();
  }
  // KO Mission sekmesi: görev satırındaki onay kutusu → görev Quest tips penceresinde gösterilir / gizlenir
  const TDKEY = 'ko-gorev-takipdisi-' + character.id;
  const takipDisi = new Set((() => { try { return JSON.parse(localStorage.getItem(TDKEY) || '[]'); } catch { return []; } })());
  const tdKaydet = () => { try { localStorage.setItem(TDKEY, JSON.stringify([...takipDisi])); } catch {} };
  // KO re_quest_mini_tip: satır = ▼/▲ (btn_list_title_open / _close) + "Ad  [Under way]"; ok açınca görevin ayrıntısı (yeşil ok + "Mob : 0/5");
  // altta ◀ sayfa ▶ ● (btn_change: Seed'in Mission sekmesi)
  const kapaliQ = new Set(); let tSayfa = 0; const T_SAYFA = 5;
  function klon(id) {
    const o = KL?.get(id); if (!o) return '';
    const c = o.cloneNode(true); c.removeAttribute('data-id'); c.hidden = false; c.style.left = '0px'; c.style.top = '0px';
    c.querySelectorAll('[data-id]').forEach((e) => e.removeAttribute('data-id'));
    return c;
  }
  // (5.11) KO: Quest tips alt satırındaki yeşil üçgen pusula gibi görevin hedefine döner — av görevinde o grubun bu haritadaki
  // en yakın canlı canavarı (gruplar[].mobs = canavar sid), yoksa / eşya satırında görevin NPC'si. Yön ekrana göre: yukarı = kameranın baktığı yön.
  function pusulaHedef(q, gi) {
    const K = window.__ko; if (!K) return null;
    const v = new K.THREE.Vector3(), ben = K.player.getWorldPosition(new K.THREE.Vector3());
    let en = null, d0 = Infinity;
    const gruplar = gi >= 0 ? [q.gruplar[gi]] : q.gruplar;
    const sid = new Set(gruplar.flatMap((g) => g?.mobs || []).map(Number));
    if (sid.size) for (const n of K.state?.combat?.mobs?.values?.() || []) {
      if (!sid.has(Number(n.sid)) || (n.dead_until && new Date(n.dead_until).getTime() > Date.now())) continue;
      (n.obj || n.model?.group)?.getWorldPosition?.(v); const d = (v.x - ben.x) ** 2 + (v.z - ben.z) ** 2; if (d < d0) { d0 = d; en = { x: v.x, z: v.z }; }
    }
    if (!en) { const e = (K.state?.npcs?.list || []).find((x) => Number(x.n?.id) === Number(q.npc)); if (e) { e.holder.getWorldPosition(v); en = { x: v.x, z: v.z }; } }
    return en && { x: en.x - ben.x, z: en.z - ben.z };
  }
  setInterval(() => {
    if (!el || el.hidden) return;
    const oklar = el.querySelectorAll('.gto-yesil[data-q]'); if (!oklar.length) return;
    const K = window.__ko; if (!K?.camera) return;
    const f = K.camera.getWorldDirection(new K.THREE.Vector3()); const fl = Math.hypot(f.x, f.z) || 1; f.x /= fl; f.z /= fl;
    for (const o of oklar) {
      const q = G.get(Number(o.dataset.q)) || G.get(o.dataset.q); const d = q && pusulaHedef(q, Number(o.dataset.g));
      if (!d) { o.style.transform = ''; continue; }
      const aci = Math.atan2(d.x * -f.z + d.z * f.x, d.x * f.x + d.z * f.z);   // ekran yukarısından saat yönünde
      o.style.transform = `rotate(${(aci * 180 / Math.PI).toFixed(1)}deg)`;   // (5.11) KO quest_mini_tip_direction.dxt: ok yukarıyı gösterir
    }
  }, 120);
  function ciz() {
    if (SH && !SH.el.hidden) shCiz();
    window.dispatchEvent(new CustomEvent('ko-gorev-degisti'));
    const w = pencere(); w.classList.add('gt-orj'); w.classList.toggle('gt-koyu', !!ayar.koyu);
    const aktif = [...benim].filter(([id, s]) => s.durum === 1 && !takipDisi.has(id)).map(([id, s]) => [G.get(id), s]).filter(([q]) => q);
    w.hidden = !aktif.length || !!window.koSecenek?.gorevYardim;   // KO Decline Quest Help: görev ipuçları penceresi gösterilmez
    if (KL) { KL.show('btn_mini', !ayar.kucuk); KL.show('btn_max', ayar.kucuk); KL.text('str_title', String(aktif.length)); }
    w.classList.toggle('gt-kucuk', ayar.kucuk);
    if (ayar.kucuk || !aktif.length) { govde.innerHTML = ''; return; }
    const top = Math.max(1, Math.ceil(aktif.length / T_SAYFA)); tSayfa = Math.max(0, Math.min(tSayfa, top - 1));
    govde.innerHTML = '<div class="gt-liste"></div><div class="gto-sayfa"></div>';
    const liste = govde.firstChild;
    for (const [q, s] of aktif.slice(tSayfa * T_SAYFA, tSayfa * T_SAYFA + T_SAYFA)) {
      const bitti = tamam(q, s), acik = !kapaliQ.has(q.id);
      const sat = document.createElement('div'); sat.className = 'gto-satir';
      const ok = document.createElement('span'); ok.className = 'gto-ok kui-tik'; ok.title = acik ? 'Hide' : 'Show';
      const k = klon(acik ? 'btn_list_title_close' : 'btn_list_title_open'); if (k) ok.append(k); else ok.textContent = acik ? '▲' : '▼';
      ok.onclick = (e) => { e.stopPropagation(); if (kapaliQ.has(q.id)) kapaliQ.delete(q.id); else kapaliQ.add(q.id); ciz(); };
      // KO: biten görev — turuncu "!" + mavi "Ad  [Before compensation]", alt satırlar gri (yeşil ok yok)
      const ad = document.createElement('span'); ad.className = 'gto-ad' + (bitti ? ' gto-bitti' : ''); ad.textContent = `${q.ad}  ${bitti ? '[Before compensation]' : '[Under way]'}`; ad.title = 'Quest details';
      ad.onclick = (e) => { e.stopPropagation(); gorevGoster(q, { mod: 'takip' }); };
      if (bitti) { const u = document.createElement('span'); u.className = 'gto-unlem'; u.textContent = '!'; sat.append(ok, u, ad); } else sat.append(ok, ad);
      liste.append(sat);
      if (!acik) continue;
      const alt = [];
      q.gruplar.forEach((g, i) => alt.push(`${g.ad} : ${Math.min(g.n, s.sayac?.[i] || 0)}/${g.n}`));
      for (const [num, c] of q.ister?.esya || []) alt.push(`${esyaAdi(q, num)} : ${Math.min(c, esyaSay(num))}/${c}`);
      if (!alt.length && q.ilerleme) alt.push(q.ilerleme);
      for (const [ti, t] of alt.entries()) { const d = document.createElement('div'); d.className = 'gto-alt' + (bitti ? ' gto-alt-bitti' : ''); d.innerHTML = bitti ? `<span class="gto-metin">${esc(t)}</span>` : `<span class="gto-yesil" data-q="${q.id}" data-g="${ti < q.gruplar.length ? ti : -1}"></span><span class="gto-metin">${esc(t)}</span>`; d.title = t; liste.append(d); }
    }
    // sayfa çubuğu (MiniBar_Page kopyası)
    const sb2 = govde.lastChild, pg = klon('MiniBar_Page');
    if (pg) {
      sb2.append(pg);
      const btn = [...pg.children].filter((e) => !e.classList.contains('kui-tx'));
      const tx = pg.querySelector('.kui-tx'); if (tx) tx.textContent = String(tSayfa + 1);
      const [onc, son, deg] = btn.filter((e) => e.children.length);   // btn_prevpage, btn_nextpage, btn_change
      const bag = (e, f) => { if (!e) return; e.classList.add('kui-tik'); e.style.pointerEvents = 'auto'; e.onclick = (ev) => { ev.stopPropagation(); f(); }; };
      bag(onc, () => { if (tSayfa > 0) { tSayfa--; ciz(); } });
      bag(son, () => { if (tSayfa < top - 1) { tSayfa++; ciz(); } });
      bag(deg, () => { ayar.koyu = !ayar.koyu; ayarKaydet(); w.classList.toggle('gt-koyu', !!ayar.koyu); });   // KO: mavi düğme arka planı karartır / saydam yapar
      if (deg) deg.title = 'Background';
    } else sb2.innerHTML = `<span>${tSayfa + 1}</span>`;
  }
  async function yukle() {
    const d = await rpc('gorev_listem'); if (!d) return;
    benim.clear(); for (const r of d) benim.set(r.id, { durum: r.durum, sayac: r.sayac || [] });
    ciz();
  }

  // KO re_quest_completed: görev mobu öldürülünce ekranın üst ortasında 3 sn "<< Görev >>" + "Mob : n/N" satırları
  let IP = null, ipT = 0;
  async function ilerlemeGoster(q, s) {
    if (!IP) { if (!(await ekUI('qseed').catch(() => false)) || !hasLayout('re_quest_completed')) return;
      IP ||= buildLayout('re_quest_completed', { className: 'ko-gorev-ilerleme' }); IP.el.querySelectorAll('.kui-tx').forEach((t) => (t.style.fontWeight = 'normal')); (document.getElementById('kohud') || document.body).append(IP.el); }
    // KO: görev bitince satırlar yerine tek satır "Monster hunt complete!"
    const satir = tamam(q, s) ? ['Monster hunt complete!'] : q.gruplar.map((g, i) => `${g.ad} : ${Math.min(g.n, s.sayac?.[i] || 0)}/${g.n}`)
      .concat((q.ister?.esya || []).map(([n, c]) => `${esyaAdi(q, n)} : ${Math.min(c, esyaSay(n))}/${c}`)).slice(0, 10);
    IP.text('txt_title', `<< ${q.ad} >>`);
    for (let i = 0; i < 10; i++) { IP.show('group_' + i, i < satir.length); IP.text('txt_msg_' + i, satir[i] || ''); }
    const alt = IP.get('group_base'); if (alt) alt.style.top = (48 + satir.length * 20) + 'px';
    IP.el.style.height = (48 + satir.length * 20 + 18) + 'px';
    IP.el.hidden = false; IP.el.classList.remove('gi-son'); void IP.el.offsetWidth; IP.el.classList.add('gi-acik');
    clearTimeout(ipT); ipT = setTimeout(() => { IP.el.classList.add('gi-son'); setTimeout(() => { if (IP.el.classList.contains('gi-son')) { IP.el.hidden = true; IP.el.classList.remove('gi-acik', 'gi-son'); } }, 400); }, 3000);
  }
  /** _mob_hit sonucundaki 'gorev' dizisi: [{id, sayac}] */
  function guncelle(liste) {
    if (!Array.isArray(liste) || !liste.length) return;
    let yeniEsya = false;
    for (const r of liste) {
      if (r.basarim) { window.dispatchEvent(new CustomEvent('ko-basarim', { detail: r })); continue; }   // başarım tamamlandı (sunucu _basarim_*)
      const s = benim.get(r.id), q = G.get(r.id); if (!s || !q) continue;
      if (r.esya) {   // görev eşyası düştü (çantaya eklendi)
        hud.info?.(`${q.ad}: ${esyaAdi(q, r.esya)} ${Math.min(r.adet, r.gerek)} / ${r.gerek}`, 'gorev');
        if (r.adet >= r.gerek && (q.ister?.esya || []).every(([n, c]) => n === r.esya || esyaSay(n) >= c) && q.gruplar.every((g, i) => (s.sayac?.[i] || 0) >= g.n))
          hud.notice?.(`${q.ad} completed! Return to ${NPC_AD[q.npc] || q.npcAd || 'the quest giver'} for your reward.`, 'gorev');
        yeniEsya = true; continue;
      }
      const once = tamam(q, s); s.sayac = r.sayac || s.sayac;
      ilerlemeGoster(q, s);
      q.gruplar.forEach((g, i) => { const n = Math.min(g.n, s.sayac[i] || 0); hud.info?.(`${q.ad}: ${g.ad} ${n} / ${g.n}`, 'gorev'); });
      if (!once && tamam(q, s)) hud.notice?.(`${q.ad} completed! Return to ${NPC_AD[q.npc] || q.npcAd || 'the quest giver'} for your reward.`, 'gorev');
    }
    if (yeniEsya) Promise.resolve(onEsya?.()).then(() => ciz()); else ciz();
  }

  // ---- KO temalı ödül paneli (Kabul et / Ödülü al düğmelerinin üstünde): eşya ikonları + miktar, EXP / Noah
  let secim = 0;
  const NOAH = 900000000, EXP = 900001000;
  const odulNums = (q) => [NOAH, EXP, ...Object.values(q.arti || {}).flatMap((x) => (x.esya || []).map(([n]) => n)), ...(odulu(q).esya || []).map(([n]) => n), ...(q.ister?.esya || []).map(([n]) => n)];
  // fareyle ödülün üzerine gelince KO eşya ipucu
  let tip = null;
  const ipucuKapat = () => tip?.remove();
  function ipucuBagla(el) {
    el.querySelectorAll('[data-num]').forEach((k) => {
      k.addEventListener('pointerenter', (ev) => ipucuGoster(k, ev)); k.addEventListener('pointermove', (ev) => ipucuGoster(k, ev)); k.addEventListener('pointerleave', ipucuKapat);
    });
  }
  function ipucuGoster(k, ev) {
    const it = IT.get(Number(k.dataset.num)); if (!it) return;
    tip ||= Object.assign(document.createElement('div'), { id: 'ko-ipucu-yuzen', className: 'ko-ipucu' });
    if (!tip.isConnected) document.body.append(tip);
    const adet = Number(k.dataset.adet) || 0, para = it.num === NOAH || it.num === EXP || Number(it.Num) === NOAH || Number(it.Num) === EXP;
    tip.innerHTML = para ? `<div class="ip-ad" style="color:#ffe08a;font-weight:bold">${esc(String(it.strName || '').replace(/\s*\(\+0\)$/, ''))}</div><div>${fmt(adet)}</div>` : tooltipHtml(it, { count: adet > 1 ? adet : 0 });
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(innerWidth - w - 8, ev.clientX + 16) + 'px';
    tip.style.top = Math.max(8, Math.min(innerHeight - h - 8, ev.clientY - 10)) + 'px';
    tip.style.zIndex = 9000;
  }
  addEventListener('pointerdown', ipucuKapat, true);
  function odulPanel(q) {
    const o = odulu(q), list = o.esya || [], secmeli = !!q.sinif && list.length > 1;
    if (secim >= list.length) secim = 0;
    const kutu = (n, c, i) => { const it = IT.get(n); const ad = it?.strName || `#${n}`;
      return `<div class="od-esya${secmeli ? ' od-secilebilir' + (i === secim ? ' od-secili' : '') : ''}" data-i="${i}" data-num="${n}" data-adet="${c}">${it ? iconHtml(it, 32) : ''}${c > 1 ? `<b>${c}</b>` : ''}</div>`; };
    const parca = [];
    const para = (n, miktar, etiket) => { const it = IT.get(n); return `<div class="od-para" data-num="${n}" data-adet="${miktar}"><span class="od-esya od-kucuk">${it ? iconHtml(it, 26) : ''}</span><span class="od-yazi">${fmt(miktar)} ${etiket}</span></div>`; };
    if (o.exp) parca.push(para(EXP, o.exp, 'EXP'));
    if (o.noah) parca.push(para(NOAH, o.noah, 'Noah'));
    list.forEach(([n, c], i) => parca.push(kutu(n, c, i)));
    if (!parca.length) parca.push('<span class="od-not">No reward</span>');
    // teslim edilecekler: ödüllerin hemen üstünde, eşya ikonu + miktar (çantadaki yetmiyorsa kırmızı çerçeve), fareyle ipucu
    const isterEsya = q.ister?.esya || [];
    const isterParca = isterEsya.map(([n, c]) => { const it = IT.get(n), var_ = esyaSay(n);
      return `<div class="od-esya od-teslim${var_ >= c ? ' od-tamam' : ' od-eksik'}" data-num="${n}" data-adet="${c}">${it ? iconHtml(it, 32) : ''}<b>${Math.min(var_, c)}/${c}</b></div>`; });
    if (q.ister?.noah) isterParca.push(para(NOAH, q.ister.noah, 'Noah'));
    const teslim = isterParca.length ? `<div class="od-baslik">Collect</div><div class="od-satir">${isterParca.join('')}</div>` : '';
    const notlar = secmeli ? '<div class="od-not">Select the item you want as your reward.</div>' : '';
    return { yukseklik: 74 + (secmeli ? 13 : 0) + (isterParca.length ? 62 : 0),
      html: `${teslim}<div class="od-baslik${teslim ? ' od-ikinci' : ''}">Reward</div><div class="od-satir">${parca.join('')}</div>${notlar}`,
      bagla: (el) => { ipucuBagla(el); if (secmeli) el.querySelectorAll('.od-esya.od-secilebilir').forEach((e) => e.addEventListener('click', () => { secim = Number(e.dataset.i); el.querySelectorAll('.od-esya.od-secilebilir').forEach((x) => x.classList.toggle('od-secili', x === e)); })); } };
  }

  // ---- KO görev penceresi (re_quest_viewer): başlık, NPC portresi, açıklama; "Toplanacaklar" (av / eşya) ve "Ödül" kutuları,
  // altta iki düğme (Kabul/Kapat, Kapat/Bırak, Ödülü al/Kapat). Satır sayısı içeriğe göre, pencere boyu buna göre küçülür.
  const HUNT = 900005000;
  const MOBAD = new Map();
  async function mobAdlari(q) {
    const ids = [...new Set((q.dusur || []).flatMap((d) => d.mobs || []))].filter((i) => !MOBAD.has(i)); if (!ids.length) return;
    const { data } = await sb.from('monsters').select('sid,name').in('sid', ids);
    for (const r of data || []) MOBAD.set(r.sid, r.name);
  }
  let GV = null;
  function gvKur() {
    if (GV) return GV;
    if (!hasLayout('re_quest_viewer')) return null;
    const L = buildLayout('re_quest_viewer', { className: 'ko-gorev-pencere ko-pencere' });
    (document.getElementById('kohud') || document.body).append(L.el);
    for (const id of ['premium', 'group_middle_2', 'addrequital_0', 'addrequital_1', 'addrequital_2', 'btn_close', 'btn_giveup', 'btn_accept']) L.show(id, false);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    const not = L.get('txt_note'); if (not) { not.textContent = ''; const d = document.createElement('div'); d.className = 'gv-not'; not.append(d); bindScroll(L.get('scroll'), d); }
    L.click('btn_hide', () => gvKapat());
    L.click('btn_prev', () => {}); L.click('btn_next', () => {});
    // KO: görev penceresi sürüklenmez, her açılışta ekranın ortasında sabit durur
    addEventListener('resize', () => { if (!L.el.hidden) gvOrtala(); });
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && !L.el.hidden && e.target.tagName !== 'INPUT') { e.stopImmediatePropagation(); e.preventDefault(); gvKapat(); } }, true);
    GV = L; return L;
  }
  function gvOrtala() {
    const L = GV; if (!L) return; const p = L.el.offsetParent || document.body;
    const W = p.clientWidth || innerWidth, H = p.clientHeight || innerHeight, w = L.el.offsetWidth || 383, h = L.el.offsetHeight || 400;
    L.el.style.marginLeft = '0'; L.el.style.left = Math.round((W - w) / 2) + 'px'; L.el.style.top = Math.max(0, Math.round((H - h) / 2)) + 'px';
  }
  const gvKapat = () => { if (GV) GV.el.hidden = true; ipucuKapat(); };
  /** Reward Plus satırı (addrequital_N): KO yerleşiminde kutuların kimlikleri Reward satırlarıyla aynı (btn_return_0/1…) → grubun içinden bulunur */
  function artiDoldur(g, k, v) {
    const q = (id) => g.querySelector(`[data-id="${id}_${k}"]`) || g.querySelectorAll(`[data-id^="${id}_"]`)[k % 2];
    const b = q('btn_return'), ar = q('area_return'), t1 = q('txt_return_first'), t2 = q('txt_return_second');
    for (const e of [b, ar, t1, t2]) if (e) e.hidden = !v;
    if (!v || !ar) return;
    ar.innerHTML = v.ikon || ''; ar.dataset.num = v.num || ''; ar.dataset.adet = v.adet || 0; ar.style.pointerEvents = 'auto';
    if (t1) t1.textContent = v.bir || ''; if (t2) { t2.textContent = v.iki || ''; t2.style.color = v.renk2 || ''; }
  }
  /** kutu: [ikon html, sayı, 1. satır, 2. satır, data-num, data-adet, ek sınıf] */
  function kutuDoldur(L, tur, i, k) {
    const b = L.get(`btn_${tur}_${i}`), ar = L.get(`area_${tur}_${i}`), t1 = L.get(`txt_${tur}_first_${i}`), t2 = L.get(`txt_${tur}_second_${i}`), c = L.get(`txt_${tur}_count_${i}`);
    for (const e of [b, ar, t1, t2, c]) if (e) e.hidden = !k;
    if (!k) return;
    ar.innerHTML = k.ikon || ''; ar.dataset.num = k.num || ''; ar.dataset.adet = k.adet || 0; ar.className = ar.className.replace(/ gv-\S+/g, '') + (k.sinif ? ' ' + k.sinif : '');
    ar.style.pointerEvents = 'auto'; ar.dataset.i = k.i ?? '';
    t1.textContent = k.bir || ''; t2.textContent = k.iki || ''; if (c) c.textContent = k.sayi != null ? String(k.sayi) : '';
    t1.style.color = k.renk1 || ''; t2.style.color = k.renk2 || '';
  }
  async function gorevGoster(q, { model, mod, geri } = {}) {
    await Promise.all([esyalar([...odulNums(q), HUNT]).catch(() => {}), mobAdlari(q).catch(() => {})]);
    const L = gvKur(); if (!L) return false;
    npcMenuKapat();
    const s = benim.get(q.id), al = s?.durum === 1, bitti = al && tamam(q, s);
    L.text('txt_title', q.ad);
    // açıklama: teklif / ilerleme + sayaçlar / tamamlandı
    const sayac = q.gruplar.map((g, i) => `${g.ad} : ${Math.min(g.n, s?.sayac?.[i] || 0)}/${g.n}`)
      .concat((q.ister?.esya || []).map(([n, c]) => `${esyaAdi(q, n)} : ${Math.min(c, esyaSay(n))}/${c}`));
    const metin = !al ? String(q.teklif || '').replace(/\s*\|\s*/g, '\n') : bitti ? `${q.ilerleme}\n\nQuest complete. Talk to ${NPC_AD[q.npc] || q.npcAd || 'the quest giver'} to receive your reward.` : `${q.ilerleme}\n${sayac.join('\n')}`;
    const nd = L.el.querySelector('.gv-not'); if (nd) { nd.textContent = metin; nd.scrollTop = 0; }
    // toplanacaklar: av grupları + teslim edilecek eşyalar + Noah
    const top = [];
    for (const [gi, g] of q.gruplar.entries()) { const it = IT.get(HUNT); const n = Math.min(g.n, s?.sayac?.[gi] || 0);
      top.push({ ikon: it ? iconHtml(it, 36) : '', sayi: g.n, bir: 'Hunt', iki: g.ad, renk2: al && n >= g.n ? '#8dff7a' : '', num: '', adet: g.n }); }   // av ikonunda ipucu yok
    for (const [n, c] of q.ister?.esya || []) { const it = IT.get(n), d = (q.dusur || []).find((x) => x.esya === n);
      const kaynak = d ? d.mobs.map((m) => MOBAD.get(m)).filter(Boolean).slice(0, 2).join(', ') : '';
      top.push({ ikon: it ? iconHtml(it, 36) : '', sayi: c, bir: esyaAdi(q, n), iki: kaynak ? `[Drop] ${kaynak}` : 'From inventory', num: n, adet: c, sinif: esyaSay(n) >= c ? 'gv-tamam' : 'gv-eksik' }); }
    if (q.ister?.noah) { const it = IT.get(NOAH); top.push({ ikon: it ? iconHtml(it, 36) : '', sayi: '', bir: 'Noah', iki: fmt(q.ister.noah), num: NOAH, adet: q.ister.noah }); }
    // ödüller: EXP, Noah, eşyalar (sınıfa göre seçmeli olabilir)
    const o = odulu(q), list = o.esya || [], secmeli = !!q.sinif && list.length > 1; if (secim >= list.length) secim = 0;
    const odl = [];
    if (o.exp) { const it = IT.get(EXP); odl.push({ ikon: it ? iconHtml(it, 36) : '', bir: 'EXP', iki: fmt(o.exp), num: EXP, adet: o.exp }); }
    if (o.noah) { const it = IT.get(NOAH); odl.push({ ikon: it ? iconHtml(it, 36) : '', bir: 'Coin', iki: fmt(o.noah), num: NOAH, adet: o.noah }); }
    list.forEach(([n, c], i) => { const it = IT.get(n); odl.push({ ikon: it ? iconHtml(it, 36) : '', sayi: c > 1 ? c : '', bir: it?.strName || (o.esyaAd?.[i] || `#${n}`), iki: secmeli ? (i === secim ? 'Selected' : 'Click to select') : (c > 1 ? `x${c}` : ''), renk2: secmeli && i === secim ? '#8dff7a' : '#c8c0a0', num: n, adet: c, sinif: secmeli ? 'gv-secmeli' + (i === secim ? ' gv-secili' : '') : '', i }); });
    // yerleşim: başlık şeritleri ve satırlar alt alta, boşluk kalmaz
    let y = 177;
    const yerlestir = (id, h) => { const e = L.get(id); if (e) { e.hidden = false; e.style.top = y + 'px'; } y += h; };
    const satirlar = (pre, arr, tur) => { const n = Math.max(1, Math.ceil(arr.length / 2));
      for (let r = 0; r < 3; r++) { const g = L.get(pre + r); if (!g) continue; if (r < n) { g.hidden = false; g.style.top = y + 'px'; y += 51; } else g.hidden = true; }
      for (let i = 0; i < 6; i++) kutuDoldur(L, tur, i, arr[i] || null); };
    // KO: satırlar gruplarda ikişerli (0-1, 2-3, 4-5); grup üyeleri gruba göre konumlu olduğundan yalnız grup kayar
    if (top.length) { yerlestir('group_middle_0', 22); satirlar('group_', top.slice(0, 6), 'needs'); } else { L.show('group_middle_0', false); for (let r = 0; r < 3; r++) L.show('group_' + r, false); }
    yerlestir('group_middle_1', 22); satirlar('requital_', odl.slice(0, 6), 'return');
    // KO "Reward Plus": sınıfa göre ek ödül (sunucu Lua'sı: her sınıf grubunun eşyası listelenir, teslimde yalnız kendi sınıfınınki verilir)
    const arti = []; for (const g of ['1', '2', '3', '4']) for (const [n, c] of q.arti?.[g]?.esya || []) { const it = IT.get(n); arti.push({ ikon: it ? iconHtml(it, 36) : '', sayi: '', bir: it?.strName || `#${n}`, iki: String(c), renk2: '', num: n, adet: c }); }
    if (arti.length) {
      yerlestir('group_middle_2', 22);
      const n = Math.ceil(Math.min(arti.length, 6) / 2);
      for (let r = 0; r < 3; r++) { const g = L.get('addrequital_' + r); if (!g) continue; if (r < n) { g.hidden = false; g.style.top = y + 'px'; y += 51; } else g.hidden = true;
        for (let k = 0; k < 2; k++) artiDoldur(g, r * 2 + k, arti[r * 2 + k] || null); }
    } else { L.show('group_middle_2', false); for (let r = 0; r < 3; r++) L.show('addrequital_' + r, false); }
    const alt = L.get('group_bottom'); if (alt) alt.style.top = (y + 2) + 'px';
    L.el.style.height = (y + 2 + 85) + 'px'; L.el.style.setProperty('--gv-h', (y + 2) + 'px');
    L.text('text_page', '1/1');
    // düğmeler
    const d0 = L.get('btn_menu_0'), d1 = L.get('btn_menu_1');
    const dugme = (b, i, yazi, fn) => { L.text('str_menu_' + i, yazi); b.hidden = !yazi; b.onclick = (e) => { e.stopPropagation(); fn?.(); }; b.classList.add('kui-tik'); };
    const kapat = () => { gvKapat(); geri?.(); };
    if (mod === 'npc' && !al) {
      dugme(d0, 0, 'Accepted', async () => {   // KO görev penceresi: Accepted / Rejected
        const d = await rpc('gorev_al', { p_q: q.id }); if (!d) return;
        if (!d.ok) { hud.notice?.(d.mesaj, 'hata'); return; }
        benim.set(q.id, { durum: 1, sayac: d.sayac || [] }); ciz();
        hud.notice?.(`Quest accepted: ${q.ad}`, 'gorev'); hud.info?.(`Quest accepted: ${q.ad} — ${q.ilerleme}`, 'gorev'); gvKapat();
      });
      dugme(d1, 1, 'Rejected', kapat);
    } else if (mod === 'npc' && bitti) {
      dugme(d0, 0, 'Complete', async () => {
        const d = await rpc('gorev_teslim', { p_q: q.id, p_secim: secim }); if (!d) return;
        if (!d.ok) { hud.notice?.(d.mesaj, 'hata'); return; }
        s.durum = 2; ciz();
        const p = []; if (d.exp_odul) p.push(`+${fmt(d.exp_odul)} EXP`); if (d.noah_odul) p.push(`+${fmt(d.noah_odul)} Noah`);
        for (const e of d.esyalar || []) p.push(`${e.name}${e.count > 1 ? ' x' + e.count : ''}`);
        hud.notice?.(`${q.ad} completed! ${p.join(', ')}`, 'exp'); hud.info?.(`Quest reward: ${p.join(', ')}`, 'gorev');
        onOdul?.(d); import('./ko-bildirim.js').then((M) => M.odulPenceresi(sb, d)).catch(() => {}); gvKapat(); npcMenuKapat();   // KO: teslimden sonra NPC görev menüsü yeniden açılmaz
      });
      dugme(d1, 1, 'Close', kapat);
    } else {
      dugme(d0, 0, 'Close', kapat);
      dugme(d1, 1, al ? 'Give up' : '', () => hud.soru?.('Give up quest', `Do you want to give up the "${q.ad}" quest? Your progress will be lost.`, async () => {
        const d = await rpc('gorev_birak', { p_q: q.id }); if (!d) return;
        benim.delete(q.id); ciz(); hud.info?.(`Quest abandoned: ${q.ad}`, 'gorev'); kapat();
      }));
    }
    // ipucu + seçmeli ödül
    ipucuBagla(L.el);
    L.el.querySelectorAll('.gv-secmeli').forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); secim = Number(e.dataset.i) || 0; gorevGoster(q, { model, mod, geri }); }));
    L.el.hidden = false; L.el.style.zIndex = 60; gvOrtala();
    // NPC'nin modeli: menüden açıldıysa bilinir; görev listesinden (kız simgesi / takip penceresi) açılınca NPC yerleşiminden bulunur
    let npcModel = model || NPC_MODEL[q.npc];
    if (!npcModel && q.npc) {
      const { data } = await sb.from('npc_placements').select('model').eq('npc_id', q.npc).limit(5).then((r) => r, () => ({}));
      const m = (data || []).find((x) => x.model)?.model;
      if (m) npcModel = NPC_MODEL[q.npc] = m;
    }
    portre(npcModel, L.get('img_npc'), () => GV && !GV.el.hidden);
    return true;
  }

  /** sunucuya özel görevler (ör. Clarence Magic Shield) için aynı KO görev penceresi:
   *  { ad, metin, top: [{num, adet, bir, iki, tamam}], odul: [[num, adet]], dugmeler: [[yazi, fn], [yazi, fn]], model, npc } */
  async function ozelGoster({ ad, metin, top = [], odul = [], dugmeler = [], model = null, npc = null }) {
    await esyalar([NOAH, EXP, HUNT, ...top.map((k) => k.num).filter(Boolean), ...odul.map(([n]) => n)]).catch(() => {});
    const L = gvKur(); if (!L) return false;
    npcMenuKapat();
    L.text('txt_title', ad);
    const nd = L.el.querySelector('.gv-not'); if (nd) { nd.textContent = metin; nd.scrollTop = 0; }
    const ik = (n) => { const it = IT.get(n || HUNT); return it ? iconHtml(it, 36) : ''; };
    const t = top.map((k) => ({ ikon: ik(k.num), sayi: k.adet, bir: k.bir, iki: k.iki, renk2: k.tamam ? '#8dff7a' : '', num: k.num || '', adet: k.adet, sinif: k.num ? (k.tamam ? 'gv-tamam' : 'gv-eksik') : '' }));
    const o = odul.map(([n, c]) => { const it = IT.get(n); return { ikon: ik(n), sayi: c > 1 ? c : '', bir: n === EXP ? 'EXP' : n === NOAH ? 'Noah' : it?.strName || `#${n}`, iki: n === EXP || n === NOAH ? fmt(c) : (c > 1 ? `x${c}` : ''), renk2: '#c8c0a0', num: n, adet: c }; });
    let y = 177;
    const yerlestir = (id, h) => { const e = L.get(id); if (e) { e.hidden = false; e.style.top = y + 'px'; } y += h; };
    const satirlar = (pre, arr, tur) => { const n = Math.max(1, Math.ceil(arr.length / 2));
      for (let r = 0; r < 3; r++) { const g = L.get(pre + r); if (!g) continue; if (r < n) { g.hidden = false; g.style.top = y + 'px'; y += 51; } else g.hidden = true; }
      for (let i = 0; i < 6; i++) kutuDoldur(L, tur, i, arr[i] || null); };
    if (t.length) { yerlestir('group_middle_0', 22); satirlar('group_', t.slice(0, 6), 'needs'); } else { L.show('group_middle_0', false); for (let r = 0; r < 3; r++) L.show('group_' + r, false); }
    yerlestir('group_middle_1', 22); satirlar('requital_', o.slice(0, 6), 'return');
    L.show('group_middle_2', false); for (let r = 0; r < 3; r++) L.show('addrequital_' + r, false);
    const alt = L.get('group_bottom'); if (alt) alt.style.top = (y + 2) + 'px';
    L.el.style.height = (y + 2 + 85) + 'px'; L.el.style.setProperty('--gv-h', (y + 2) + 'px');
    L.text('text_page', '1/1');
    [0, 1].forEach((i) => { const b = L.get('btn_menu_' + i); if (!b) return; const [yazi, fn] = dugmeler[i] || [];
      L.text('str_menu_' + i, yazi || ''); b.hidden = !yazi; b.onclick = (e) => { e.stopPropagation(); fn ? fn() : gvKapat(); }; b.classList.add('kui-tik'); });
    ipucuBagla(L.el);
    L.el.hidden = false; L.el.style.zIndex = 60; gvOrtala();
    let npcModel = model || (npc && NPC_MODEL[npc]);
    if (!npcModel && npc) {
      const { data } = await sb.from('npc_placements').select('model').eq('npc_id', npc).limit(5).then((r) => r, () => ({}));
      npcModel = (data || []).find((x) => x.model)?.model; if (npcModel) NPC_MODEL[npc] = npcModel;
    }
    portre(npcModel, L.get('img_npc'), () => GV && !GV.el.hidden);
    return true;
  }

  // ---- KO tohum yardımcısı (deadsoft re_seed_helper): sol alttaki kız simgesi açar. "Görevler" sekmesi: devam eden görevler
  // (ad, durum, sayaçlar; tıklayınca görev ayrıntısı). "Rehber" sekmesi: seviyeye göre alınabilecek görevler (seviye ara, ◀ ▶, 3'er).
  let SH = null, shSekme = 'liste', shSayfa = 0, shSev = null; const SH_SATIR = 5;
  function shKur() {
    if (SH) return SH;
    if (!hasLayout('re_seed_helper')) return null;
    const L = buildLayout('re_seed_helper', { className: 'ko-seed ko-pencere' }); L.el.hidden = true;
    (document.getElementById('kohud') || document.body).append(L.el);
    for (const id of ['group_help_menu', 'group_help_sub_menu', 'group_faq', 'group_help_content', 'group_option', 'area_npc', 'img_misel', 'btn_help', 'btn_story', 'btn_questguide']) L.show(id, false);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    const tr = { '※ Enter Level': '' };   // KO özgün İngilizce metinler korunur
    L.el.querySelectorAll('.kui-tx').forEach((e) => { const t = e.textContent.trim(); if (t in tr) e.textContent = tr[t]; });
    L.text('txt_talk', 'Hello! I will help you with your quests.');
    // devam eden görev listesi: tree_list alanına KO satırları
    const ag = L.el.querySelector('[data-id="group_questlist"] [data-id="tree_list"]');
    if (ag) { ag.innerHTML = ''; const d = document.createElement('div'); d.className = 'sh-liste'; ag.append(d); }
    L.text('txt_default', '');
    const lv = L.input('edit_level', { type: 'number', min: 1, max: 83, placeholder: 'Seviye' });
    lv?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { shSev = Number(lv.value) || null; shSayfa = 0; shCiz(); } });
    L.click('btn_check', () => { shSev = Number(lv?.value) || null; shSayfa = 0; shCiz(); });
    L.el.querySelectorAll('[data-id="group_questguide"] [data-id="btn_up"]').forEach((b) => { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); shSayfa++; shCiz(); }; });
    L.el.querySelectorAll('[data-id="group_questguide"] [data-id="btn_down"]').forEach((b) => { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); shSayfa = Math.max(0, shSayfa - 1); shCiz(); }; });
    // KO: rehber listesi sekme düğmelerinin hemen altından başlar (yerleşimde 100 px aşağıdaydı) ve paneli 5 satırla doldurur
    const rg = L.get('group_questguide');
    if (rg) {
      rg.style.top = (parseFloat(rg.style.top) - 100) + 'px'; rg.style.height = '351px';
      for (let i = 3; i < SH_SATIR; i++) for (const k of ['btn_title', 'btn_select_', 'text_title_', 'text_lvexp_', 'text_guide']) {
        const a = rg.querySelector(`[data-id="${k}2"]`); if (!a) continue;
        const c = a.cloneNode(true); c.dataset.id = k + i; c.style.top = (parseFloat(a.style.top) + 64 * (i - 2)) + 'px'; a.after(c);
      }
    }
    // yan görev (takip) penceresi aç / kapa: KO sekme düğmesinin (Görevler) kopyası, devam eden görev listesinin altında
    const ag2 = L.get('group_questlist'), tree = ag2?.querySelector('[data-id="tree_list"]'), orj = L.get('btn_questlist');
    if (ag2 && tree && orj) {
      const b = orj.cloneNode(true); delete b.dataset.id; b.classList.remove('sh-secili'); b.classList.add('sh-takip-dugme', 'kui-tik'); b.style.pointerEvents = 'auto';
      b.querySelectorAll('[data-id]').forEach((x) => delete x.dataset.id);
      const bw = parseFloat(orj.style.width) || orj.offsetWidth || 190, bh = parseFloat(orj.style.height) || orj.offsetHeight || 26;
      const tt = parseFloat(tree.style.top) || tree.offsetTop, th = parseFloat(tree.style.height) || tree.offsetHeight, tl = parseFloat(tree.style.left) || tree.offsetLeft, tw = parseFloat(tree.style.width) || tree.offsetWidth;
      tree.style.height = (th - bh - 8) + 'px';
      const sc = ag2.querySelector('[data-id="scroll"]'); if (sc) sc.style.height = ((parseFloat(sc.style.height) || sc.offsetHeight) - bh - 8) + 'px';
      Object.assign(b.style, { position: 'absolute', left: (tl + (tw - bw) / 2) + 'px', top: (tt + th - bh) + 'px' });
      b.addEventListener('click', (e) => { e.stopPropagation(); takip(); shCiz(); });
      ag2.append(b); L._takipDugme = b;
    }
    L.click('btn_questlist', () => { shSekme = 'liste'; shCiz(); });
    L.click('btn_option', () => { shSekme = 'rehber'; shCiz(); });
    L.click('btn_close', () => shKapat());
    draggable(L, 40);
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && SH && !SH.el.hidden && e.target.tagName !== 'INPUT') { e.stopImmediatePropagation(); shKapat(); } }, true);
    SH = L; return L;
  }
  const shKapat = () => { if (SH) SH.el.hidden = true; document.querySelectorAll('[data-id="btn_question"]').forEach((b) => b.classList.remove('secili')); };
  function shCiz() {
    const L = SH; if (!L || L.el.hidden) return;
    L.show('group_questlist', shSekme === 'liste'); L.show('group_questguide', shSekme === 'rehber');
    L.get('btn_questlist')?.classList.toggle('sh-secili', shSekme === 'liste'); L.get('btn_option')?.classList.toggle('sh-secili', shSekme === 'rehber');
    const aktif = [...benim].filter(([, s]) => s.durum === 1).map(([id, s]) => [G.get(id), s]).filter(([q]) => q);
    L.text('txt_quest_count', `Quest ${aktif.length}`);
    if (L._takipDugme) { const acik = !pencere().hidden; L._takipDugme.querySelectorAll('.kui-tx').forEach((t) => (t.textContent = acik ? 'Hide quest tips' : 'Show quest tips')); L._takipDugme.title = 'Ekranın sağındaki görev takip penceresi'; }
    const kutu = L.el.querySelector('.sh-liste');
    if (kutu) {
      kutu.innerHTML = aktif.length ? aktif.map(([q, s]) => {
        const bitti = tamam(q, s);
        return `<div class="sh-gorev${bitti ? ' sh-bitti' : ''}" data-q="${q.id}"><div class="sh-ad">${esc(q.ad)} <span>${bitti ? '(Complete)' : '(In progress)'}</span></div>`
          + `<div class="sh-tanim">${esc(bitti ? `Talk to ${NPC_AD[q.npc] || q.npcAd || 'the quest giver'} to receive your reward.` : q.ilerleme || '')}</div>`
          + q.gruplar.map((g, i) => { const n = Math.min(g.n, s.sayac?.[i] || 0); return `<div class="sh-sayac${n >= g.n ? ' sh-ok' : ''}">${esc(g.ad)} <b>${n} / ${g.n}</b></div>`; }).join('')
          + (q.ister?.esya || []).map(([num, c]) => { const n = Math.min(c, esyaSay(num)); return `<div class="sh-sayac${n >= c ? ' sh-ok' : ''}">${esc(esyaAdi(q, num))} <b>${n} / ${c}</b></div>`; }).join('') + '</div>';
      }).join('') : '<div class="sh-bos">You have no quests in progress. Talk to NPCs to receive quests; the "Option" tab lists quests for your level.</div>';
      kutu.querySelectorAll('.sh-gorev').forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); const q = G.get(Number(e.dataset.q)); if (q) gorevGoster(q, { mod: 'takip' }); }));
    }
    // rehber: KO görev veritabanı (kobugda.com/quests, 911 görev) — seviyeye ve ulusa göre; oyunda oynanabilen görevler "Ayrıntı" ile açılır
    const sev = shSev || seviye(), ulus = Number(character.nation) || 0;
    const oyun = new Map([...G.values()].map((q) => [String(q.ad || '').toLowerCase(), q]));
    const db = KB || [];
    if (!KB) kobugda().then(() => { if (SH && !SH.el.hidden) shCiz(); });
    const uygun = db.filter((k) => k[3] <= sev && (!k[1] || k[1] === ulus)).sort((x, y) => y[3] - x[3] || String(x[0]).localeCompare(String(y[0])));
    // veritabanında olmayan, oyuna özel görevler de listede
    for (const q of G.values()) if (q.seviye <= sev && benimMi(q) && benim.get(q.id)?.durum !== 2 && !db.some((k) => String(k[0]).toLowerCase() === String(q.ad || '').toLowerCase())) uygun.push([q.ad, 0, '', q.seviye, q.seviye, q.ilerleme || '', '', NPC_AD[q.npc] || q.npcAd || '', 'Moradon', q]);
    const top = Math.max(1, Math.ceil(uygun.length / SH_SATIR)); shSayfa = Math.min(shSayfa, top - 1);
    L.text('text_page', `${shSayfa + 1}/${top}`);
    const rg = L.get('group_questguide'), sg = (id) => rg?.querySelector(`[data-id="${id}"]`);
    for (let i = 0; i < SH_SATIR; i++) {
      const k = uygun[shSayfa * SH_SATIR + i];
      for (const id of ['btn_title' + i, 'btn_select_' + i, 'text_title_' + i, 'text_lvexp_' + i, 'text_guide' + i]) { const e = sg(id); if (e) e.hidden = !k; }
      if (!k) continue;
      const q = k[9] || oyun.get(String(k[0]).toLowerCase()) || null, st = q ? benim.get(q.id) : null;
      const yaz = (id, t) => { const e = sg(id); if (e) { e.textContent = t; e.title = t; } };
      yaz('text_title_' + i, k[0]);
      yaz('text_lvexp_' + i, `Lv ${k[3]}${st?.durum === 2 ? ' · Complete' : st?.durum === 1 ? ' · Accepted' : ''}`);
      yaz('text_guide' + i, `${k[5]}${k[7] ? ` — ${k[7]}${k[8] ? ' (' + k[8] + ')' : ''}` : ''}`);
      const b = sg('btn_select_' + i);
      if (b) { b.classList.add('kui-tik'); b.onclick = (e) => { e.stopPropagation(); if (q) gorevGoster(q, { mod: 'takip' }); else kbAyrinti(k); }; }
    }
  }
  // KO görev veritabanı (assets/gorev/kobugda.json): [ad, ulus 0/1/2, seri, svMin, svMax, görev, not/ödül, npc, yer]
  let KB = null, KBP = null;
  const kobugda = () => (KBP ||= fetch('./assets/gorev/kobugda.json').then((r) => r.json()).then((j) => { KB = j.gorevler || []; return KB; }).catch(() => { KBP = null; return []; }));
  const ULUS_AD = ['Both nations', 'Karus', 'El Morad'];
  function kbAyrinti(k) {
    const metin = [`Seviye: ${k[3]}${k[4] && k[4] !== k[3] ? '-' + k[4] : ''} · ${ULUS_AD[k[1]] || ''}${k[2] ? ' · Seri: ' + k[2] : ''}`,
      k[7] ? `NPC: ${k[7]}${k[8] ? ' — ' + k[8] : ''}` : '', '', `Quest: ${k[5]}`, k[6] ? `\n${k[6]}` : ''].filter((x) => x !== undefined).join('\n');
    if (hud.mesaj) hud.mesaj(k[0], metin); else hud.info?.(`${k[0]}: ${k[5]}`, 'beceri');
  }
  function seedAc(ac = null) {
    const L = shKur(); if (!L) return takip(ac);
    const ac2 = ac == null ? L.el.hidden : ac;
    if (!ac2) return shKapat();
    L.el.hidden = false; L.el.style.zIndex = 58;
    if (!L.el.dataset.yer) { L.el.dataset.yer = '1'; L.el.style.left = Math.max(8 - 137, (innerWidth - 465) / 2 - 137) + 'px'; L.el.style.top = Math.max(8, (innerHeight - 545) / 2 + 11) + 'px'; }
    document.querySelectorAll('[data-id="btn_question"]').forEach((b) => b.classList.add('secili'));
    shCiz();
  }

  // ---- NPC görev menüsü (KO re_npcmenu: NPC adı, konuşma metni, 7 satır)
  function npcMenu({ npc, ad, model, selam }) {
    // KO: NPC'nin ana görevleri (seviyene uygun, bitmemiş) dururken [Tekrar] görevleri listede çıkmaz (alınmış olanlar teslim için görünür)
    const liste = () => {
      const L = [...G.values()].filter((q) => qNpc(q) === npc && benimMi(q) && seviye() >= q.seviye && benim.get(q.id)?.durum !== 2 && (!q.maxSev || seviye() <= q.maxSev || benim.get(q.id)?.durum === 1) && tekrarAcik(q));
      return L.sort((a, b) => (tekrarMi(a) - tekrarMi(b)) || (a.seviye - b.seviye));   // asıl görevler önce
    };
    const ana = (sayfa = 0) => {
      gvKapat();   // NPC'ye yeniden tıklanınca açık görev ayrıntısı kapanır
      const L = liste(), BOY = 5, top = Math.max(1, Math.ceil(L.length / BOY)); sayfa = Math.min(Math.max(0, sayfa), top - 1);
      const bas = sayfa * BOY, parca = L.slice(bas, bas + BOY);
      const secenekler = parca.map((q) => {
        const s = benim.get(q.id), al = s?.durum === 1;
        const bitti = al && tamam(q, s);
        const etiket = !al ? q.ad : bitti ? `${q.ad} (Complete)` : `${q.ad} (In progress)`;
        return { ad: etiket, html: !al ? null : `${esc(q.ad)}&nbsp;<span class="${bitti ? 'npm-tamam">(Complete)' : 'npm-devam">(In progress)'}</span>`, kalsin: true, fn: () => gorevAc(q, sayfa) };
      });
      // sayfalı liste: "Sayfa 1/3" — tıklayınca sonraki sayfa (sonuncudan sonra başa döner)
      if (top > 1) { const yazi = `Page ${sayfa + 1}/${top}`; secenekler.push({ ad: yazi, html: `<span class="npm-gri">${yazi}</span>`, kalsin: true, fn: () => ana((sayfa + 1) % top) }); }
      secenekler.push({ ad: 'Close', html: '<span class="npm-kirmizi">Close</span>', fn: () => npcMenuKapat() });
      npcMenuAc({ ad, model, metin: L.length ? (selam || (BOLGE === 'freezone_a' ? `${character.name}, our nation needs you here in Ardream. Which quest are you interested in?` : BOLGE === 'eslantzone' ? `${character.name}, Eslant is full of demons and their servants. Which quest are you interested in?` : `${character.name}, I need your help to protect Moradon from the monsters. Which quest are you interested in?`))
        : 'I have no quest for you at the moment. Come back when you have grown stronger.', secenekler });
    };
    const gorevAc = async (q, sayfa) => {
      if (model) NPC_MODEL[q.npc] = model;
      if (await gorevGoster(q, { model, mod: 'npc', geri: () => ana(sayfa) })) return;
      await esyalar(odulNums(q)).catch(() => {});
      const s = benim.get(q.id);
      secim = 0;
      if (!s || s.durum !== 1) {
        npcMenuAc({ ad, model, metin: q.teklif, ust: odulPanel(q), secenekler: [
          { ad: 'Accept', kalsin: true, fn: async () => {
            const d = await rpc('gorev_al', { p_q: q.id }); if (!d) return;
            if (!d.ok) { hud.notice?.(d.mesaj, 'hata'); return ana(sayfa); }
            benim.set(q.id, { durum: 1, sayac: d.sayac || [] }); ciz();
            hud.notice?.(`Quest accepted: ${q.ad}`, 'gorev'); hud.info?.(`Quest accepted: ${q.ad} — ${q.ilerleme}`, 'gorev');
            npcMenuKapat();
          } },
          { ad: 'Refuse', kalsin: true, fn: () => ana(sayfa) },
        ] });
      } else if (tamam(q, s)) {
        npcMenuAc({ ad, model, metin: `Well done, ${character.name}! ${BOLGE === 'freezone_a' || BOLGE === 'eslantzone' ? 'Your nation' : 'Moradon'} is grateful to you. Here is your reward.`, ust: odulPanel(q), secenekler: [
          { ad: 'Receive reward', kalsin: true, fn: async () => {
            const d = await rpc('gorev_teslim', { p_q: q.id, p_secim: secim }); if (!d) return;
            if (!d.ok) { hud.notice?.(d.mesaj, 'hata'); return; }
            s.durum = 2; ciz();
            const p = []; if (d.exp_odul) p.push(`+${fmt(d.exp_odul)} EXP`); if (d.noah_odul) p.push(`+${fmt(d.noah_odul)} Noah`);
            for (const e of d.esyalar || []) p.push(`${e.name}${e.count > 1 ? ' x' + e.count : ''}`);
            hud.notice?.(`${q.ad} completed! ${p.join(', ')}`, 'exp'); hud.info?.(`Quest reward: ${p.join(', ')}`, 'gorev');
            onOdul?.(d); import('./ko-bildirim.js').then((M) => M.odulPenceresi(sb, d)).catch(() => {});
            ana(sayfa);
          } },
          { ad: 'Back', kalsin: true, fn: () => ana(sayfa) },
        ] });
      } else {
        const ilerle = q.gruplar.map((g, i) => `${g.ad}: ${Math.min(g.n, s.sayac?.[i] || 0)} / ${g.n}`)
          .concat((q.ister?.esya || []).map(([n, c]) => `${esyaAdi(q, n)}: ${Math.min(c, esyaSay(n))} / ${c}`)).join('\n');
        npcMenuAc({ ad, model, metin: `${q.ilerleme}\n\n${ilerle}`, ust: odulPanel(q), secenekler: [
          { ad: 'Give up', kalsin: true, fn: () => hud.soru?.('Give up quest', `Do you want to give up the "${q.ad}" quest? Your progress will be lost.`, async () => {
            const d = await rpc('gorev_birak', { p_q: q.id }); if (!d) return;
            benim.delete(q.id); ciz(); hud.info?.(`Quest abandoned: ${q.ad}`, 'gorev'); ana(sayfa);
          }) },
          { ad: 'Back', kalsin: true, fn: () => ana(sayfa) },
        ] });
      }
    };
    ana(0);
  }

  await yukle();
  // KO NPC başı görev işareti: 'bitti' (teslim edilebilir görev) > 'yeni' (alınabilir görev) > 'devam' (alınmış, sürüyor)
  const isaret = (npc) => {
    let yeni = false, devam = false;
    for (const q of G.values()) {
      if (qNpc(q) !== npc || !benimMi(q)) continue;
      const s = benim.get(q.id);
      if (s?.durum === 1) { if (tamam(q, s)) return 'bitti'; devam = true; }
      else if (s?.durum !== 2 && seviye() >= q.seviye && (!q.maxSev || seviye() <= q.maxSev) && tekrarAcik(q)) yeni = true;
    }
    return yeni ? 'yeni' : devam ? 'devam' : null;
  };
  const aktifListe = () => [...benim].filter(([, s]) => s.durum === 1).map(([id, s]) => { const q = G.get(id); return q ? { id, ad: q.ad, npc: qNpc(q), bitti: tamam(q, s), takip: !takipDisi.has(id) } : null; }).filter(Boolean);
  const takipDegis = (id) => { if (takipDisi.has(id)) takipDisi.delete(id); else takipDisi.add(id); tdKaydet(); ciz(); };
  const birak = (id) => { const q = G.get(Number(id)); if (!q) return; hud.soru?.('Cancel quest', `Do you want to give up the "${q.ad}" quest? Your progress will be lost.`, async () => {
    const d = await rpc('gorev_birak', { p_q: q.id }); if (!d) return; benim.delete(q.id); ciz(); hud.info?.(`Quest abandoned: ${q.ad}`, 'gorev'); }); };
  return { durum: (id) => benim.get(Number(id))?.durum ?? 0, aktifListe, takipDegis, birak, goster: (id, mod = 'npc') => { const q = G.get(Number(id)); return q ? gorevGoster(q, { mod }) : false; }, guncelle, yukle, npcMenu, ozelGoster, kapat: gvKapat, ciz, isaret, takip, seedAc, get takipAcik() { return !!el && !el.hidden; }, varMi: (npc) => [...G.values()].some((q) => qNpc(q) === npc && benimMi(q)) };
}
