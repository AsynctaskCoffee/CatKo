// Etki çubuğu (KO buff/debuff göstergesi): sol üstteki can/mana/EXP çerçevesinin hemen altında, soldan sağa dizilen ikonlar.
// Yetenek etkileri yetenek ikonuyla, eşya etkileri (iksir, parşömen) eşya ikonuyla gösterilir. Son 10 sn yanıp söner.
// Kaynaklar: sunucudaki characters.buffs (girişte) + oyun içi 'ko-etki' olayları ({id, ad, sure, tip: 'buff'|'debuff', esya?}).
import { loadYetenekler, yetenekVerisi } from './yetenek.js';
import { iconHtml, fromDb } from './esya.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PX = 30;

export function initEtkiler({ sb, character, hud, state }) {
  const kutu = document.createElement('div'); kutu.id = 'ko-etkiler';
  // tutma imleci: sürükleyerek etki simgeleri ekranda istenen yere taşınır (konum tarayıcıda saklanır; çift tık → varsayılan yer)
  const tutamak = document.createElement('div'); tutamak.className = 'ke-tutamak'; tutamak.title = 'Drag to move (double-click: default position)';
  const liste_ = document.createElement('div'); liste_.className = 'ke-liste';
  kutu.append(tutamak, liste_);
  document.body.append(kutu);
  const KONUM = 'ko-etki-konum';
  let konum = null; try { konum = JSON.parse(localStorage.getItem(KONUM) || 'null'); } catch {}
  // sürükleme: pencere düzeyinde izlenir (oyun tuvali / üstteki saydam katmanlar olayları yutmasın)
  tutamak.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return; ev.preventDefault(); ev.stopPropagation();
    if (document.documentElement.classList.contains('ko-tampon-kilit')) return;   // Options → Lock Buff Icon Bar
    const r = kutu.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top;
    try { tutamak.setPointerCapture(ev.pointerId); } catch {}
    kutu.classList.add('ke-tasiniyor');
    const mv = (e) => {
      e.preventDefault(); e.stopPropagation();
      const x = Math.max(0, Math.min(innerWidth - 40, e.clientX - dx)), y = Math.max(0, Math.min(innerHeight - 40, e.clientY - dy));
      konum = { x: Math.round(x), y: Math.round(y) }; kutu.style.left = konum.x + 'px'; kutu.style.top = konum.y + 'px';
    };
    const up = (e) => {
      removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
      kutu.classList.remove('ke-tasiniyor'); e?.stopPropagation?.();
      try { localStorage.setItem(KONUM, JSON.stringify(konum)); } catch {}
    };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
  }, true);
  tutamak.addEventListener('dblclick', () => { konum = null; try { localStorage.removeItem(KONUM); } catch {} ciz(); });
  const etkiler = new Map();   // anahtar → { id, ad, bitis(ms, Date), tip, esya? }

  const ikon = (e) => {
    if (e.esyaIt) return `<span class="ke-ikon ke-esya">${iconHtml(e.esyaIt, 30)}</span>`;
    const A = yetenekVerisi()?.atlas, s = yetenekVerisi()?.yetenekler?.[e.id];
    if (!A || !s) return '<span class="ke-ikon ke-bos"></span>';
    const i = s.ikon < 0 ? 0 : s.ikon, k = PX / A.boyut;
    return `<span class="ke-ikon" style="background:url(./assets/yetenek/${A.dosya}) ${-(i % A.kolon) * PX}px ${-Math.floor(i / A.kolon) * PX}px / ${A.kolon * A.boyut * k}px auto no-repeat"></span>`;
  };
  const sureYaz = (sn) => (sn >= 3600 ? Math.floor(sn / 3600) + 'h' : sn >= 60 ? Math.floor(sn / 60) + 'm' : Math.ceil(sn) + '');
  let imza = '';
  function ciz() {
    const now = Date.now();
    let bitti = false;
    for (const [k, e] of etkiler) if (e.bitis <= now) {
      etkiler.delete(k); bitti = true;
      // süresi biten güçlendirme sunucudan da hemen kalkar (dakikalık temizliği beklemez) → statlar anında eski haline döner
      if (String(k).startsWith('buff:')) sb.rpc('buff_remove', { p_char: character.id, p_key: String(k).slice(5) }).then(() => state?.inv?.stats?.(), () => state?.inv?.stats?.());
    }
    if (bitti) setTimeout(() => state?.inv?.stats?.(), 400);
    const liste = [...etkiler.values()].sort((a, b) => a.baslangic - b.baslangic);
    // yalnız liste ya da simgeler değişince yeniden kur (yanıp sönme animasyonu bozulmasın) — girişte simge verisi (eşya / yetenek ikonları,
    // TS'nin eşya kaydı) sonradan gelince boş (siyah) simge yenisiyle değişir
    const html = liste.map((e) => `<div class="ke ${e.tip === 'debuff' ? 'ke-debuff' : ''}" data-k="${esc(e.anahtar)}">${ikon(e)}<b class="ke-sure"></b></div>`).join('');
    if (html !== imza) { imza = html; liste_.innerHTML = html; }
    for (const e of liste) {
      const el = kutu.querySelector(`[data-k="${CSS.escape(e.anahtar)}"]`); if (!el) continue;
      const kalan = (e.bitis - now) / 1000;
      el.querySelector('.ke-sure').textContent = e.kalici ? '' : sureYaz(kalan);
      el.classList.toggle('ke-son', !e.kalici && kalan <= 10);
    }
    if (ipucuK) ipucuYaz();
    // konum: can/mana/EXP çerçevesinin altı, sol köşeden
    const hp = document.querySelector('.ko-hp');
    if (konum) { kutu.style.left = Math.min(konum.x, innerWidth - 40) + 'px'; kutu.style.top = Math.min(konum.y, innerHeight - 40) + 'px'; }
    else if (hp && !hp.hidden) { const r = hp.getBoundingClientRect(); kutu.style.left = Math.round(r.left + 6) + 'px'; kutu.style.top = Math.round(r.bottom + 4) + 'px'; }
    kutu.hidden = !liste.length;
  }
  setInterval(ciz, 250);

  // ipucu: ad, açıklama (özellikler), kalan süre
  let tip = null, ipucuK = null, ipX = 0, ipY = 0;
  function ipucuYaz() {
    const e = etkiler.get(ipucuK); if (!e) return ipucuKapat();
    tip ||= Object.assign(document.createElement('div'), { className: 'ke-ipucu' });
    if (!tip.isConnected) document.body.append(tip);
    const s = yetenekVerisi()?.yetenekler?.[e.id], kalan = Math.max(0, Math.ceil((e.bitis - Date.now()) / 1000));
    const dk = Math.floor(kalan / 60), sn = kalan % 60;
    // (5.11) KO birebir: tek satır "[Ad] Remaining Time : N + minutes" (#8080ff, koyu yarı saydam şerit)
    const ad = String(e.ad || '').trim(), adK = ad.startsWith('[') ? ad : `[${ad}]`;
    const sure = e.kalici ? '' : kalan >= 60 ? ` Remaining Time : ${dk} + minutes` : ` Remaining Time : ${sn} + seconds`;
    tip.innerHTML = `<span class="ke-ko">${esc(adK + sure)}</span>`;
    tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, ipX + 14) + 'px';
    tip.style.top = Math.min(innerHeight - tip.offsetHeight - 8, ipY + 14) + 'px';
  }
  const ipucuKapat = () => { ipucuK = null; tip?.remove(); };
  kutu.addEventListener('pointermove', (ev) => { const el = ev.target.closest('.ke'); if (!el) return ipucuKapat(); ipucuK = el.dataset.k; ipX = ev.clientX; ipY = ev.clientY; ipucuYaz(); });
  kutu.addEventListener('pointerleave', ipucuKapat);
  kutu.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  // tek tık peri simgesi: Oreads toplama seçenekleri
  kutu.addEventListener('click', (ev) => { const el = ev.target.closest('.ke'); if (el?.dataset.k === 'peri') dispatchEvent(new CustomEvent('ko-peri-ayar')); });
  // çift tık: güçlendirmeyi kaldır (zayıflatmalar hariç)
  kutu.addEventListener('dblclick', async (ev) => {
    ev.stopPropagation();
    const el = ev.target.closest('.ke'); if (!el) return;
    const e = etkiler.get(el.dataset.k); if (!e) return;
    if (e.tip === 'debuff') return hud?.notice?.('Debuffs cannot be removed.', 'hata');
    if (e.anahtar === 'peri') return hud?.notice?.('To remove the fairy, take it out of the fairy slot in your inventory.', 'hata');
    if (e.anahtar === 'donusum') { await state?.donusumApi?.bitir?.(); sil(e.anahtar); ipucuKapat(); hud?.info?.('Transformation removed.', 'beceri'); return; }   // TS: eski görünüme dön
    const anahtar = String(e.anahtar).replace(/^buff:/, '');
    if (e.anahtar.startsWith('buff:')) {
      const { data, error } = await sb.rpc('buff_remove', { p_char: character.id, p_key: anahtar });
      if (error || data?.ok === false) return hud?.notice?.(error?.message || data.reason, 'hata');
    }
    sil(e.anahtar); ipucuKapat();
    if (e.hiz && state) state.buffHiz = null;   // hız güçlendirmesi kaldırıldı
    if (state?.gorunmez?.anahtar === e.anahtar) state.gorunmez.boz?.('removed');
    if ([715, 735].includes(Number(e.id) % 1000) && Number(state?.gorunmez?.gozYetenegi?.()) === Number(e.id)) state.gorunmez.gozBitir?.();   // Cat's / Lupine Eyes kaldırıldı: diğeri hemen kullanılabilir
    try { state?.inv?.stats?.(); } catch {}
    hud?.info?.(`${e.ad} effect removed.`, 'beceri');
  });

  function ekle({ id, ad, sure, tip = 'buff', esya = null, esyaIt = null, anahtar = null, bitis = null, hiz = false, kalici = false, aciklama = null }) {
    const k = anahtar || `${tip}:${esya || id}`;
    const e = etkiler.get(k);
    etkiler.set(k, { id, ad, tip, esya, esyaIt, hiz, kalici, aciklama, anahtar: k, baslangic: e?.baslangic ?? Date.now(), bitis: kalici ? Date.now() + 3.15e11 : bitis ?? Date.now() + (Number(sure) || 0) * 1000 });
    ciz();
  }
  const sil = (k) => { etkiler.delete(k); ciz(); };
  addEventListener('ko-etki', (ev) => ekle(ev.detail || {}));
  addEventListener('ko-etki-sil', (ev) => sil(ev.detail));
  // (7.11) Cure Curse / Cure Disease (kendine ya da bana başka oyuncudan): zayıflatma simgeleri kalkar (sunucu buffs'tan zaten sildi)
  addEventListener('ko-debuff-temizle', () => { for (const [k, e] of [...etkiler]) if (e?.tip === 'debuff') sil(k); try { state?.inv?.stats?.(); } catch {} });
  // görünmezlik bozuldu vb.: simge hemen kalkar, sunucudaki güçlendirme kaydı da silinir (yeniden girişte geri gelmesin)
  addEventListener('ko-etki-kaldir', (ev) => {
    const k = String(ev.detail || ''); if (!k) return;
    sil(k); if (ipucuK === k) ipucuKapat();
    if (k.startsWith('buff:')) sb.rpc('buff_remove', { p_char: character.id, p_key: k.slice(5) }).then(() => { try { state?.inv?.stats?.(); } catch {} }, () => {});
  });

  // KO: Spirit of Logos güçlendirmesi ölünce ya da ışınlanınca kalkar (sunucuda trg_logos_sil siler; burada simge ve değerler)
  const logosSil = () => { if (!etkiler.has('buff:logos')) return; sil('buff:logos'); if (ipucuK === 'buff:logos') ipucuKapat(); setTimeout(() => { try { state?.inv?.stats?.(); } catch {} }, 400); };
  addEventListener('ko-olum', logosSil); addEventListener('ko-isinlandi', logosSil);
  // KO: karakter ölünce hızlanma güçlendirmeleri (Swift, Light Feet, Sprint, Whipping) silinir — simge, sunucu kaydı ve hız
  const HIZ_AD = /^(sprint|swift|light feet|whipping)$/i;
  addEventListener('ko-olum', () => {
    for (const [k, e] of [...etkiler]) {
      if (!(e.hiz || HIZ_AD.test(String(e.ad || '').trim()))) continue;
      sil(k); if (ipucuK === k) ipucuKapat();
      if (String(k).startsWith('buff:')) sb.rpc('buff_remove', { p_char: character.id, p_key: String(k).slice(5) }).then(() => {}, () => {});
    }
    if (state) state.buffHiz = null;
  });
  // KO: ölüp doğunca beceri güçlendirme/zayıflatmaları kalkar; scroll ve eşyadan gelen etkiler (esya) ile peri/dönüşüm kalır
  addEventListener('ko-dirilis', () => {
    for (const [k, e] of [...etkiler]) {
      if (e.esya || e.esyaIt || k === 'peri' || k === 'donusum') continue;
      sil(k); if (ipucuK === k) ipucuKapat();
    }
    if (state) state.buffHiz = null;
  });
  // girişte sunucudaki etkin güçlendirmeler
  (async () => {
    await loadYetenekler().catch(() => {});
    const { data } = await sb.from('characters').select('buffs').eq('id', character.id).maybeSingle();
    const now = Date.now() / 1000;
    for (const [k, v] of Object.entries(data?.buffs || {})) {
      if (!(Number(v?.until) > now)) continue;
      const s = yetenekVerisi()?.yetenekler?.[v.skill];
      let esyaIt = null; if (v.esya) { const { data: it } = await sb.from('items').select('*').eq('num', v.esya).maybeSingle(); if (it) esyaIt = fromDb(it); }
      const npcAc = k === 'npc_savunma' ? `Defense +${v.ac}` : k === 'npc_can' ? `Max HP +${v.maxhp}` : k === 'npc_saldiri' ? 'Attack power +10%' : null;
      ekle({ id: v.skill, esyaIt, ad: (k.startsWith('npc_') && v.ad) || s?.ad || v.ad || esyaIt?.strName || 'Etki', tip: v.debuff ? 'debuff' : 'buff', anahtar: 'buff:' + k, bitis: Number(v.until) * 1000, aciklama: npcAc });
    }
  })().catch(() => {});
  // ---- hedef alınan oyuncunun etkileri: hedef can çubuğunun sol altında küçük simgeler (KO)
  const hk = document.createElement('div'); hk.id = 'hedef-etkiler'; hk.hidden = true; document.body.append(hk);
  const esyaOnbellek = new Map();
  let hedefId = null, hedefListe = [], hedefImza = '', hedefSorgu = 0;
  const hedefOnbellek = new Map();   // oyuncu → son bilinen etkiler (hedef değişip geri gelince boş görünmez)
  const hedefOyuncu = () => {
    if (state?.combat?.target) return null;   // canavar hedefi
    const a = state?.arena; const id = a?.hedef || a?.secili || state?.seciliOyuncu?.id;
    return id != null && String(id) !== String(character.id) ? String(id) : null;
  };
  async function hedefYukle(id) {
    const t = ++hedefSorgu;
    const { data } = await sb.rpc('hedef_etkiler', { p_id: Number(id) });
    if (t !== hedefSorgu || id !== hedefId || !Array.isArray(data)) return;   // hata/yarım yanıt listeyi silmez
    const l = data;
    for (const v of l) if (v.esya && !esyaOnbellek.has(v.esya)) {
      esyaOnbellek.set(v.esya, null);
      const { data: it } = await sb.from('items').select('*').eq('num', v.esya).maybeSingle(); if (it) esyaOnbellek.set(v.esya, fromDb(it));
    }
    if (t !== hedefSorgu || id !== hedefId) return;
    hedefListe = l.map((v) => ({ id: v.skill, esyaIt: v.esya ? esyaOnbellek.get(v.esya) : null, tip: v.debuff ? 'debuff' : 'buff', bitis: Number(v.until) * 1000, anahtar: v.k,
      ad: v.ad || yetenekVerisi()?.yetenekler?.[v.skill]?.ad || 'Etki' }));
    hedefOnbellek.set(id, hedefListe); hedefImza = '';
  }
  function hedefCiz() {
    const tg = document.querySelector('.ko-target:not([hidden])');
    let id = hedefOyuncu();
    if (!id && tg && hedefId && !state?.combat?.target) id = hedefId;   // hedef çubuğu aynı oyuncuda açık kalırken (saldırı bırakıldı vb.) liste silinmez
    if (id !== hedefId) { hedefId = id; hedefListe = (id && hedefOnbellek.get(id)) || []; hedefImza = ''; if (id) hedefYukle(id).catch(() => {}); }
    const now = Date.now(); hedefListe = hedefListe.filter((e) => e.bitis > now);
    if (!id || !tg || !hedefListe.length) { hk.hidden = true; return; }
    const imza = hedefListe.map((e) => e.anahtar).join('|');
    if (imza !== hedefImza) { hedefImza = imza; hk.innerHTML = hedefListe.map((e) => `<div class="he ${e.tip === 'debuff' ? 'ke-debuff' : ''}" title="${esc(e.ad)}">${ikon(e)}</div>`).join(''); }
    const bar = tg.querySelector('[data-id="grpg_level_0"]') || tg, r = bar.getBoundingClientRect();
    hk.style.left = Math.round(r.left) + 'px'; hk.style.top = Math.round(r.bottom + 2) + 'px'; hk.hidden = false;
  }
  setInterval(hedefCiz, 250);
  setInterval(() => { if (hedefId && !document.hidden) hedefYukle(hedefId).catch(() => {}); }, 2000);   // (6.11) 1 → 2 sn: değişiklikler zaten olayla (ko-hedef-etki-yenile) anında yenilenir   // hedefin etkileri değişince (buff, scroll, debuff) 2 sn içinde
  // PvP vuruşu / yetenek (rakibe zayıflatma, rakibin kendine güçlendirmesi): sunucu yazdıktan hemen sonra yenile
  let yenileT = 0;
  addEventListener('ko-hedef-etki-yenile', (ev) => {
    const d = ev.detail || {}; if (!hedefId || (d.id && d.from && d.id !== hedefId && d.from !== hedefId)) return;
    clearTimeout(yenileT); yenileT = setTimeout(() => hedefYukle(hedefId).catch(() => {}), 150);
  });

  return { ekle, sil, get liste() { return [...etkiler.values()]; } };
}
