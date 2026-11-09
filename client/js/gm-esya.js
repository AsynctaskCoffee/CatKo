// GM paneli → Özel eşya editörü. GM kendi eşyasını yapar: model kodu (KO dwIDResrc) seçimi + 3B önizleme,
// mevcut veritabanındaki model kodları listesi (üzerine gelince önizleme), ad, kategori, tür, yuva, derece, hasar, savunma,
// dayanıklılık, gereksinimler, bonuslar, dirençler ve en altta açıklama. Kaydet → gm_item_save (items, custom = true)
// → eşya veri tabanı penceresinde "GM özel eşyaları" ve kendi kategorisinde görünür; envantere eklenebilir.
import * as THREE from '../vendor/three.module.min.js';
import { koWindow, toFront } from './ko-pencere.js';
import { loadMeta, iconHtml, tooltipHtml, fromDb, KIND, RARITY } from './esya.js';
import { showModel, hideModel } from './model-onizleme.js';
import { ozelYenile } from './veri-pencere.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// KO ITEM.Slot → açıklama (kuşanma yeri)
const YUVA = { 0: 'Tek el (iki el de)', 1: 'Sağ el', 2: 'Sol el', 3: 'Çift el (sağ)', 4: 'Çift el (sol)', 5: 'Omuzluk / gövde', 6: 'Pantolon', 7: 'Kask', 8: 'Eldiven', 9: 'Çizme',
  10: 'Küpe', 11: 'Kolye', 12: 'Yüzük', 13: 'Kemer', 14: 'Diğer', 255: 'Kuşanılmaz' };
// zırh parçası → karakter donanım yuvası (önizleme)
const ZIRH_YUVA = { 5: 4, 6: 10, 7: 1, 8: 12, 9: 13 };
const SAYI = [   // KO özgün (Texts_us.tbl) İngilizce etki adları
  ['Basic', [['damage', 'Attack Power'], ['delay', 'Attack Speed (low = fast)'], ['range', 'Effective Range (×10 cm)'], ['ac', 'Defense Ability'], ['duration', 'Max Durability'], ['weight', 'Weight (×0.1)'], ['hitrate', 'Attack Power %'], ['evasionrate', 'Dodging Rate %']]],
  ['Required', [['req_level', 'Level'], ['req_str', 'Strength'], ['req_sta', 'Health'], ['req_dex', 'Dexterity'], ['req_intel', 'Intelligence'], ['req_cha', 'Magic Power']]],
  ['Damage', [['fire_damage', 'Flame Damage'], ['ice_damage', 'Glacier Damage'], ['lightning_damage', 'Lightning Damage'], ['poison_damage', 'Poison Damage'], ['hp_drain', 'HP Recovery'], ['mp_drain', 'MP Recovery']]],
  ['Bonus', [['str_b', 'Strength Bonus'], ['sta_b', 'Health Bonus'], ['dex_b', 'Dexterity Bonus'], ['intel_b', 'Intelligence Bonus'], ['cha_b', 'Magic Power Bonus'], ['max_hp_b', 'HP Bonus'], ['max_mp_b', 'MP Bonus']]],
  ['Resistance', [['fire_r', 'Resistance to Flame'], ['cold_r', 'Resistance to Glacier'], ['lightning_r', 'Resistance to Lightning'], ['magic_r', 'Resistance to Magic'], ['poison_r', 'Resistance to Poison'], ['curse_r', 'Resistance to Curse']]],
  ['Price', [['buy_price', 'Purchasing Price'], ['sell_price', 'Selling Price']]],
];
const MAKS = { buy_price: 2e9, sell_price: 2e9 };
const RENKLER = ['#ffffff', '#ffe23a', '#e8b44c', '#ff9a2a', '#ff4040', '#ff9ad8', '#c7a0ff', '#6aa8ff', '#5ff0ff', '#7bff6b', '#3dff4a', '#a0a0a0'];
const ELEMENT = [[1, 'Flame glow'], [2, 'Glacier glow'], [3, 'Lightning glow'], [4, 'Poison glow']];
const p2 = (n) => String(n).padStart(2, '0');
const adToRes = (n) => { const [a, b, c, d] = n.split('_').map(Number); return a * 1e7 + b * 1e3 + c * 10 + d; };

export function initOzelEsya({ sb, character, hud, say, state }) {
  let win = null, modeller = null, meta = null, cur = null, filtre = '', ozeller = [], efektler = {};
  const race = () => Number(character?.race) || 12;

  async function modelYukle(m) {
    const [D, C] = await Promise.all([import('./donanim.js'), import('./character.js')]);
    const pn = D.plugAdi(m.r);
    if (pn) { const p = await C.createPlug(pn); if (!p) return null; const g = new THREE.Group(); g.add(p.obj); return { group: g }; }
    const api = await C.createCharacter(race()); if (!api) return null;
    const yuva = ZIRH_YUVA[m.s] ?? (Number(m.k) === 60 || [2, 4].includes(Number(m.s)) ? 8 : Number(m.s) <= 4 ? 6 : 4);
    await D.applyGear(api, race(), [[yuva, m.r, 0, 0, 0]], true);
    api.setClip?.('breath');
    return api;
  }
  function onizle(m, el) {
    if (!m?.r) return;
    const wr = win.getBoundingClientRect(), r = el?.getBoundingClientRect?.();
    showModel('esya_' + m.r + '_' + (m.s ?? ''), `${m.n || 'Model'} · ${m.r}`, { x: wr.left - 236, y: (r?.top ?? wr.top + 80) - 100 }, () => modelYukle(m));
  }

  const bos = () => ({ num: null, name: '', category: 'kilic', kind: 21, slot: 1, item_type: 0, item_class: 3, class: 0, countable: 0, model_res: null, icon_key: '', aciklama: '',
    damage: 0, delay: 110, range: 10, ac: 0, duration: 5000, weight: 10, req_level: 1 });

  function listeHtml() {
    const q = filtre.trim().toLocaleLowerCase('tr');
    const l = (modeller || []).filter((m) => !q || String(m.r).includes(q) || m.n.toLocaleLowerCase('tr').includes(q) || (KIND[m.k] || '').toLocaleLowerCase('tr').includes(q));
    return l.map((m) => `<div class="ge-model${cur?.model_res === m.r ? ' secili' : ''}" data-r="${m.r}">${iconHtml({ ikon: m.i, Kind: m.k }, 30)}<span>${esc(m.n)}<i>${m.y ? 'yalnız model (veri tabanında eşyası yok)' : esc(KIND[m.k] || 'Tür ' + m.k)}${m.a > 1 ? ` · ${m.a} eşya` : ''}${m.f ? ' · efektli' : ''}</i></span><b>${m.r}</b></div>`).join('')
      + (!l.length ? '<div class="nk-not">Model bulunamadı</div>' : '');
  }
  const sec = (ad, deger, secenekler) => `<select name="${ad}">${secenekler.map(([v, t]) => `<option value="${v}"${String(v) === String(deger ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  function formHtml() {
    const c = cur, m = modeller?.find((x) => x.r === Number(c.model_res));
    const it = { ...fromDb(c), ikon: c.icon_key, strName: c.name || 'Yeni eşya' };
    return `
      <div class="ge-ust">
        <div class="ge-onizle">${iconHtml(it, 52)}<div><div class="ge-ad">${esc(c.name || 'Yeni eşya')}</div><div class="ay-not">${c.num ? 'Özel eşya #' + c.num : 'Kaydedilmemiş yeni eşya'}</div></div></div>
        <div class="nd-satir"><span>Ad</span><input name="name" value="${esc(c.name)}" maxlength="60" placeholder="Eşya adı" style="color:${c.ad_renk || '#f0e6c8'}"></div>
        <div class="nd-satir"><span>Ad rengi</span><span class="ge-kartela" data-hedef="ad">${RENKLER.map((r) => `<i data-renk="${r}" style="background:${r}" class="${c.ad_renk === r ? 'secili' : ''}"></i>`).join('')}<input type="color" name="ad_renk_s" value="${c.ad_renk || '#ffffff'}" title="Özel renk"><button data-k="ad-renk-yok" title="Derece rengini kullan">Derece rengi</button></span></div>
        <div class="nd-satir"><span>Model kodu</span><input name="model_res" type="number" value="${c.model_res ?? ''}" placeholder="ör. 11121000" style="width:110px"><button data-k="model-onizle" title="Bu model kodunu önizle">Önizle</button><i class="ge-mad">${m ? esc(m.n) : c.model_res ? 'listede yok' : ''}</i></div>
        <div class="nd-satir"><span>İkon</span><input name="icon_key" value="${esc(c.icon_key || '')}" placeholder="ikon anahtarı" style="width:150px"><input name="ikon_num" type="number" placeholder="eşya no'dan al" style="width:110px"><button data-k="ikon-al">Al</button></div>
        <div class="nd-satir"><span>Kategori</span>${sec('category', c.category, (meta?.kategoriler || []).map((k) => [k.id, k.ad]))}<span>Tür</span>${sec('kind', c.kind, Object.entries(KIND).map(([k, v]) => [k, `${v} (${k})`]))}</div>
        <div class="nd-satir"><span>Yuva</span>${sec('slot', c.slot, Object.entries(YUVA).map(([k, v]) => [k, `${v} (${k})`]))}<span>Derece</span>${sec('item_type', c.item_type, [[0, 'Normal'], ...Object.entries(RARITY).map(([k, v]) => [k, v[0]])])}</div>
        <div class="nd-satir"><span>Sınıf</span>${sec('item_class', c.item_class, [[1, 'Alt (Low)'], [2, 'Orta (Middle)'], [3, 'Üst (High)']])}<span>Meslek</span>${sec('class', c.class, [[0, 'Hepsi'], [1, 'Savaşçı'], [2, 'Okçu/Suikastçı'], [3, 'Büyücü'], [4, 'Rahip'], [13, 'Kurian']])}</div>
        <div class="nd-satir"><label><input type="checkbox" name="countable" ${Number(c.countable) > 0 ? 'checked' : ''}> Sayılabilir (yığın)</label></div>
        <div class="nd-satir"><span>Efekt</span>${sec('efekt', c.efekt ?? '', [['', 'Otomatik (element hasarına göre)'], [0, 'Efekt yok'], ...ELEMENT, ...Object.entries(efektler).map(([k, v]) => [k, `${v} (${k})`])])}
          ${m?.f?.length ? `<button data-k="model-efekt" title="Bu model koduyla gelen KO efektini kullan">Modelin efekti (${m.f.join(', ')})</button>` : '<i class="ge-mad">seçili modelin hazır efekti yok</i>'}</div>
      </div>
      ${SAYI.map(([b, alan]) => `<div class="gm-ara gm-ince">${b}</div><div class="ge-sayilar">${alan.map(([k, t]) => `<label><span>${t}</span><input type="number" name="${k}" value="${Number(c[k]) || 0}" min="0" max="${MAKS[k] || 32767}"></label>`).join('')}</div>`).join('')}
      <div class="gm-ara gm-ince">Açıklama</div>
      <div class="ge-arac"><button data-k="ac-b" title="Kalın"><b>K</b></button><button data-k="ac-i" title="İtalik"><i>İ</i></button><span class="ge-kartela" data-hedef="aciklama">${RENKLER.map((r) => `<i data-renk="${r}" style="background:${r}"></i>`).join('')}</span><span class="ay-not">Metni seç → kalın / italik / renk. Enter: alt satır.</span></div>
      <textarea name="aciklama" rows="3" maxlength="500" placeholder="İpucunun en altında görünür">${esc(c.aciklama || '')}</textarea>
      <div class="nd-dugmeler"><button data-k="kaydet" class="ay-dugme">${c.num ? 'Kaydet' : 'Oluştur ve veri tabanına ekle'}</button><button data-k="yeni" class="ay-dugme">Yeni eşya</button></div>
      ${c.num ? `<div class="nd-satir"><span>Adet</span><input type="number" name="adet" min="1" max="9999" value="1" style="width:70px"><button data-k="ver">Envanterime ekle</button></div>` : ''}
      <div class="gm-ara gm-ince">Özel eşyalar (${ozeller.length})</div>
      <div class="nk-liste ge-ozeller">${ozeller.map((o) => `<div class="nk-satir${o.num === c.num ? ' secili' : ''}" data-num="${o.num}"><b>#${o.num}</b><span>${esc(o.name)}</span><i>${esc(KIND[o.kind] || '')}</i></div>`).join('') || '<div class="nk-not">Henüz özel eşya yok</div>'}</div>
      <div class="ge-ipucu ko-ipucu">${tooltipHtml(it)}</div>`;
  }
  // formdaki değerleri cur'a al
  function oku() {
    if (!win) return;
    const v = (n) => win.querySelector(`[name=${n}]`);
    cur.name = v('name').value.trim(); cur.model_res = Number(v('model_res').value) || null; cur.icon_key = v('icon_key').value.trim();
    for (const k of ['category']) cur[k] = v(k).value;
    for (const k of ['kind', 'slot', 'item_type', 'item_class', 'class']) cur[k] = Number(v(k).value) || 0;
    cur.countable = v('countable').checked ? 1 : 0;
    for (const [, alan] of SAYI) for (const [k] of alan) cur[k] = Math.max(0, Math.min(MAKS[k] || 32767, Math.round(Number(v(k).value) || 0)));
    cur.aciklama = v('aciklama').value;
    const ef = v('efekt').value; cur.efekt = ef === '' ? null : Number(ef);
  }
  function ciz(liste = true) {
    if (!win) return;
    if (liste) win.querySelector('.ge-liste').innerHTML = listeHtml();
    const f = win.querySelector('.ge-form'), st = f.scrollTop; f.innerHTML = formHtml(); f.scrollTop = st;
  }
  async function ozelYukle() { const { data } = await sb.from('items').select('*').eq('custom', true).order('num'); ozeller = data || []; }

  async function open(duzenle = null) {
    if (!state?.ghost) { say?.('The custom item editor is GM only.', 'hata'); return; }
    meta = await loadMeta();
    if (!modeller) {
      modeller = await fetch('./assets/esya/modeller.json').then((r) => r.json()).catch(() => []);
      efektler = await fetch('./assets/esya/efektler.json').then((r) => r.json()).catch(() => ({}));
      // istemcinin model paketindeki (esya.json) silah modelleri: veri tabanında eşyası olmayanlar da listelensin
      try {
        const C = await import('./character.js'), G = C.gearMeta(), var_ = new Set(modeller.map((m) => m.r));
        for (const n of Object.keys(G?.plugs || {})) { const r = adToRes(n); if (r > 0 && !var_.has(r)) { var_.add(r); modeller.push({ r, n: 'Model ' + n, k: 0, s: 1, i: '', c: 'kilic', a: 0, y: 1 }); } }
        modeller.sort((a, b) => a.r - b.r);
      } catch {}
    }
    cur = duzenle ? { ...duzenle } : (cur || bos());
    if (!win) {
      win = document.createElement('div'); win.id = 'gm-esya'; win.className = 'ko-panel ko-pencere';
      win.innerHTML = `<div class="ay-baslik">Özel Eşya Editörü</div>
        <div class="ge-govde"><div class="ge-sol"><input name="ara" placeholder="Model ara: ad, tür ya da kod" autocomplete="off"><div class="ay-not">Mevcut veri tabanındaki model kodları — üzerine gel: önizleme · tıkla: seç</div><div class="ge-liste"></div></div><div class="ge-form"></div></div>`;
      document.body.append(win); koWindow(win); toFront(win);
      { const k = document.createElement('button'); k.className = 'ko-kapat'; k.dataset.k = 'kapat'; k.title = 'Kapat'; win.append(k); }
      win.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(win); });
      win.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
      win.addEventListener('wheel', (e) => e.stopPropagation());
      let qt = 0;
      win.addEventListener('input', (e) => {
        if (e.target.name === 'ara') { clearTimeout(qt); qt = setTimeout(() => { filtre = e.target.value; win.querySelector('.ge-liste').innerHTML = listeHtml(); }, 150); return; }
        if (e.target.closest('.ge-form')) { oku(); const ip = win.querySelector('.ge-ipucu'); if (ip) ip.innerHTML = tooltipHtml({ ...fromDb(cur), ikon: cur.icon_key, strName: cur.name || 'Yeni eşya' }); }
      });
      win.addEventListener('pointerover', (e) => { const r = e.target.closest?.('.ge-model'); if (r) onizle(modeller.find((m) => m.r === Number(r.dataset.r)), r); });
      win.addEventListener('pointerout', (e) => { if (e.target.closest?.('.ge-liste') && !e.relatedTarget?.closest?.('.ge-liste')) hideModel(); });
      win.addEventListener('click', tik);
      win.addEventListener('change', (e) => { if (e.target.name === 'ad_renk_s') { oku(); cur.ad_renk = e.target.value; return ciz(false); } if (e.target.closest('.ge-form') && e.target.tagName === 'SELECT') { oku(); ciz(false); } });
    }
    win.hidden = false; toFront(win);
    await ozelYukle(); ciz();
  }
  async function tik(e) {
    const m = e.target.closest('.ge-model');
    if (m) {
      oku(); const x = modeller.find((y) => y.r === Number(m.dataset.r)); if (!x) return;
      Object.assign(cur, { model_res: x.r, icon_key: x.i, kind: x.k, slot: x.s, category: x.c });
      if (!cur.name) cur.name = x.n;
      return ciz();
    }
    const o = e.target.closest('.ge-ozeller [data-num]');
    if (o) { const r = ozeller.find((x) => x.num === Number(o.dataset.num)); if (r) { cur = { ...r }; ciz(); } return; }
    const sw = e.target.closest('.ge-kartela [data-renk]');
    if (sw) {
      const hedef = sw.closest('.ge-kartela').dataset.hedef; oku();
      if (hedef === 'ad') { cur.ad_renk = sw.dataset.renk; return ciz(false); }
      return sar(`[r=${sw.dataset.renk}]`, '[/r]');
    }
    const k = e.target.closest('button')?.dataset.k; if (!k) return;
    if (k === 'kapat') return close();
    oku();
    if (k === 'ac-b') return sar('[b]', '[/b]');
    if (k === 'ac-i') return sar('[i]', '[/i]');
    if (k === 'ad-renk-yok') { cur.ad_renk = null; return ciz(false); }
    if (k === 'model-efekt') { const m2 = modeller.find((y) => y.r === Number(cur.model_res)); if (m2?.f?.length) { cur.efekt = m2.f[0]; if (!efektler[m2.f[0]]) efektler[m2.f[0]] = 'model efekti'; } return ciz(false); }
    if (k === 'model-onizle') { const x = modeller.find((y) => y.r === Number(cur.model_res)) || { r: Number(cur.model_res), n: 'Model', s: cur.slot, k: cur.kind }; return onizle(x, e.target); }
    if (k === 'yeni') { cur = bos(); return ciz(); }
    if (k === 'ikon-al') {
      const n = Number(win.querySelector('[name=ikon_num]').value); if (!n) return;
      const { data } = await sb.from('items').select('icon_key,name').eq('num', n).maybeSingle();
      if (!data?.icon_key) return hud.notice?.('No item with an icon at this number.', 'hata');
      cur.icon_key = data.icon_key; hud.info?.(`Icon copied: ${data.name}`, 'soluk'); return ciz(false);
    }
    if (k === 'kaydet') {
      if (!cur.name) return hud.notice?.('Item name is required.', 'hata');
      if (!(cur.model_res > 0) && Number(cur.kind) !== 97 && Number(cur.countable) === 0) hud.info?.('Model code is empty: the item will not be visible on the character.', 'soluk');
      const veri = { ...cur }; delete veri.custom;
      const { data, error } = await sb.rpc('gm_item_save', { p_char: character.id, p_data: veri });
      if (error) { hud.notice?.(error.message, 'hata'); return; }
      const yeni = !cur.num; cur = { ...data };
      hud.info?.(`${yeni ? 'Custom item created' : 'Custom item saved'}: ${data.name} (#${data.num}) — added to the item database.`, 'tamam');
      ozelYenile(); await ozelYukle(); return ciz();
    }
    if (k === 'ver' && cur.num) {
      const n = Math.max(1, Math.min(9999, Number(win.querySelector('[name=adet]')?.value) || 1));
      const { data, error } = await sb.rpc('gm_give_item', { p_char: character.id, p_num: cur.num, p_count: n });
      if (error || data?.ok === false) return hud.notice?.(error?.message || data?.reason, 'hata');
      hud.info?.(`${cur.name} added to inventory (slot ${data?.slot ?? '?'}).`, 'tamam'); state.inv?.reload?.();
    }
  }
  // açıklamada seçili metni etiketle sar (seçim yoksa imlece boş etiket)
  function sar(a, b) {
    const t = win.querySelector('[name=aciklama]'); if (!t) return;
    const s0 = t.selectionStart, s1 = t.selectionEnd, v = t.value;
    t.value = v.slice(0, s0) + a + v.slice(s0, s1) + b + v.slice(s1);
    t.focus(); t.selectionStart = s0 + a.length; t.selectionEnd = s1 + a.length;
    oku(); const ip = win.querySelector('.ge-ipucu'); if (ip) ip.innerHTML = tooltipHtml({ ...fromDb(cur), ikon: cur.icon_key, strName: cur.name || 'Yeni eşya' });
  }
  function close() { hideModel(); win?.remove(); win = null; }
  return { open, close, get isOpen() { return !!win; } };
}
