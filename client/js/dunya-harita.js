// KO dünya haritası (M) — deadsoft 2369 re_map1024 arayüzü (assets/ui/harita: yalnız bu pencerenin parçaları):
// KO çerçevesi + üst şerit, KO parşömen bölge haritası (Moradon: Group_moradon / area_moradon), diğer bölgeler parşömen kâğıdı üzerinde istemci haritası.
// Üst şerit: solda arama kutusu, NPC açılır menüsü, ortada harita seçimi (KO Group_list), sağda Mob açılır menüsü (KO Group_find_list).
// Haritada tüm NPC'ler ve mob doğma noktaları: yuvarlak altın çerçeveli baş portresi (model-onizleme modelIkon) + ad rengiyle başlık.
// Sağ tık: KO not / sembol penceresi (Group_NoteEdit: 10 sembol sırasıyla + not) — oyuncu sembolü seçip haritaya koyar (tarayıcıda, bölge başına).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// KO parşömen haritaları (deadsoft re_map1024): bölge → [grup, alan]; alan = bölgenin tüm dünyasının çizildiği kare.
// Moradon, Luferson / El Morad, Eslant, RLB, Ardream NPC ve doğma noktalarıyla örtüştürülerek doğrulandı; diğerleri KO dünya haritasındaki adlarından.
const KO_HARITA = {
  moradon: ['Group_moradon', 'area_moradon'], moradon_xmas: ['Group_moradon', 'area_moradon'],
  karus2004: ['Group_karubase', 'area_karubase'], elmo2004: ['Group_elmobase', 'area_elmobase'], eslantzone: ['Group_islant', 'area_islant'],
  freezone_c: ['Group_ronak_base', 'area_ronak_base'], freezone_a: ['Group_cultivation_old', 'area_cultivation_old'],
  old_karus: ['Group_karu_old', 'area_karu_old'], old_elmo: ['Group_elmo_old', 'area_elmo_old'], war_a: ['Group_dellos', 'area_dellos'],
  battlezone: ['Group_luna_A', 'area_luna_A'], battlezone_b: ['Group_luna_B', 'area_luna_B'], battlezone_d: ['Group_luna_C', 'area_luna_C'],
  battlezone_e: ['Group_luna_D', 'area_luna_D'], new_runawar: ['Group_luna_F', 'area_luna_F'],
};
// KO dünya haritası (Group_global) bölge alanları → [bölge, vurgu katmanı (Group_select), KO adı]
const DUNYA = 'dunya';
const GLOBAL_ALAN = {
  area01: ['karus2004', 'karus', 'Karus'], area02: ['elmo2004', 'elmorad', 'El Morad'], area03: ['moradon', 'moradon', 'Moradon'], area04: ['war_a', 'dellos', 'Delos'],
  area05: ['battlezone', 'luna_a', 'Napies Gorge'], area06: ['battlezone_b', 'luna_b', 'Alseids Prairie'], area07: ['battlezone_d', 'luna_c', 'Nieds Triangle'],
  area08: ['eslantzone', 'karus_islant', 'Karus Eslant'], area09: ['eslantzone', 'elmorad_islant', 'El Morad Eslant'], area10: ['freezone_a', 'cultivation_b', 'Ardream'],
  area11: ['freezone_b', 'cultivation_a', 'Ronark Land'], area12: ['battlezone_e', 'luna_d', "Nereid's Island"], area13: ['freezone_c', 'ronak_base', 'Ronark Land Base'],
  area14: [null, 'minac', 'Minark Forest'],
};
const SEMBOL = ['btn_none', 'btn_memo', 'btn_dead', 'btn_mob2', 'btn_mob3', 'btn_flag3', 'btn_knight', 'btn_knight3', 'btn_el', 'btn_ka'];
const SEMBOL_AD = { btn_none: 'Çarpı', btn_memo: 'Not', btn_dead: 'Tehlike', btn_mob2: 'Canavar', btn_mob3: 'Güçlü canavar', btn_flag3: 'Bayrak', btn_knight: 'Şövalye', btn_knight3: 'Muhafız', btn_el: 'El Morad', btn_ka: 'Karus' };
// çerçevenin görünen iç kenarı (harita bunun altına kadar uzanır, çerçeve üstte); sol menü 22..236, harita sağında ortalı kare
const IC = { l: 22, t: 52, r: 1006, b: 754 }, KW = IC.r - IC.l, KH = IC.b - IC.t, HARITA_SOL = IC.l, SOL_W = 218;   // sol menü: haritanın sol kenarına bitişik ayrı pencere
const px = (e, k) => parseFloat(e.style[k]) || 0;
// grubu (transform-origin 0 0) pencere koordinatındaki pc noktası (cx, cy)'ye gelecek ve k kat büyüyecek şekilde yerleştir
const yerlestir = (g, k, pcx, pcy, cx, cy) => { const gl = px(g, 'left'), gt = px(g, 'top'); g.style.transformOrigin = '0 0'; g.style.transform = `translate(${cx + k * (gl - pcx) - gl}px, ${cy + k * (gt - pcy) - gt}px) scale(${k})`; };

export function initDunyaHarita({ sb, state, hud, player, zoneBase, aktifZone, git }) {
  let kurulum = null, L = null, zonelar = null, secili = aktifZone, veri = null, aranan = '', vurgu = null, tik = 0, yukNo = 0, acikListe = null, notDuzen = null;
  const metaOnbellek = new Map();
  const portre = (model) => (model ? import('./model-onizleme.js').then((M) => M.modelIkon(model, { bas: true })).catch(() => null) : Promise.resolve(null));
  const notlar = (z) => { try { return JSON.parse(localStorage.getItem('ko-harita-not:' + z) || '[]'); } catch { return []; } };
  const notKaydet = (z, l) => { try { localStorage.setItem('ko-harita-not:' + z, JSON.stringify(l)); } catch {} };
  // oyuncunun haritada gizlediği NPC / mob adları (bölge başına, tarayıcıda)
  const gizliOku = (z) => { try { return new Set(JSON.parse(localStorage.getItem('ko-harita-gizli:' + z) || '[]')); } catch { return new Set(); } };
  const gizliYaz = (z, S) => { try { localStorage.setItem('ko-harita-gizli:' + z, JSON.stringify([...S])); } catch {} };
  let gizli = new Set();

  async function zoneListesi() {
    if (zonelar) return zonelar;
    const { data } = sb ? await sb.from('zones').select('id,name,available,sort').order('sort', { ascending: true }).then((r) => r, () => ({ data: null })) : { data: null };
    // şimdilik haritada yalnız bu bölgeler (sırasıyla); oyuncu başka bir bölgedeyse o da listede kalır
    const ACIK = ['moradon', 'elmo2004', 'karus2004', 'eslantzone', 'freezone_b', 'war_a', 'freezone_c'];
    zonelar = ACIK.map((id) => (data || []).find((z) => z.id === id && z.available !== false)).filter(Boolean);
    if (!data) zonelar = ACIK.map((id) => ({ id, name: id }));
    if (!zonelar.some((z) => z.id === aktifZone)) zonelar.unshift({ id: aktifZone, name: hud.zoneName || aktifZone });
    return zonelar;
  }
  const meta = (z) => { if (!metaOnbellek.has(z)) metaOnbellek.set(z, fetch(`${zoneBase(z)}/meta.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)); return metaOnbellek.get(z); };
  async function zoneVeri(z) {
    const [m, np, sp] = await Promise.all([
      meta(z),
      !sb ? [] : sb.from('npc_placements').select('npc_id,model,name,x,z,etiket_renk').eq('zone', z).then((r) => r.data || [], () => []),
      !sb ? [] : sb.from('spawners').select('sid,x,z,enabled,monsters(name,pid,level,boss)').eq('zone', z).eq('enabled', true).then((r) => r.data || [], () => []),
    ]);
    const dunya = z === aktifZone && state.world ? state.world : (m?.worldSize || 1024);
    const resim = m?.hasMinimap === false && m?.colormapPx ? `${zoneBase(z)}/colormap.${m.images || 'jpg'}` : `${zoneBase(z)}/minimap.jpg`;
    // haritada gösterilmeyenler: muhafızlar (Guard), Kaul'lar, boss moblar (oyuncular zaten çizilmez)
    // + Suspicious Box, [Mercenary] …, [Captine] … moblar, Leather / Chain / Iron Scarecrow
    const gizle = (ad) => /guard|kaul|suspicious\s*box|^\s*\[mercenary\]|captine|(leather|chain|iron)\s*scarecrow/i.test(ad);
    const npc = np.filter((n) => n.name && n.name.trim() && !gizle(n.name)).map((n) => ({ tur: 'npc', ad: n.name.trim(), model: n.model || null, x: n.x, z: n.z, renk: '#ffffff' }));
    // mob: bir yuvadaki (aynı mob, ~120 m içindeki doğma noktaları) tüm moblar tek işaret — kümenin ortasında, tek ad
    const mob = [];
    for (const s of sp) {
      const t = Array.isArray(s.monsters) ? s.monsters[0] : s.monsters; if (!t?.name || t.boss || gizle(t.name)) continue;
      const k = mob.find((o) => o.ad === t.name && Math.hypot(o.x - s.x, o.z - s.z) < 120);
      if (k) { k.n++; k.sx += s.x; k.sz += s.z; k.x = k.sx / k.n; k.z = k.sz / k.n; continue; }
      mob.push({ tur: 'mob', ad: t.name, sv: t.level, model: t.pid ? 'npc_' + t.pid : null, x: s.x, z: s.z, sx: s.x, sz: s.z, n: 1, renk: t.boss ? '#ff6a6a' : '#ff9a9a', boss: !!t.boss });
    }
    const tekil = (A) => { const g = new Set(); return A.filter((o) => { const k = o.ad + '|' + Math.round(o.x / 3) + '|' + Math.round(o.z / 3); if (g.has(k)) return false; g.add(k); return true; }); };
    return { z, dunya, resim, npc: tekil(npc), mob };
  }

  // ---------------- KO penceresi
  const solAcikIlk = () => { try { return localStorage.getItem('ko-harita-sol') !== '0'; } catch { return true; } };
  async function kur() {
    const K = await import('./kui.js');
    if (!(await K.ekUI('harita', (a) => a.p === 'cekirdek')) || !K.hasLayout('re_map1024')) throw new Error('re_map1024 yüklenemedi');
    L = K.buildLayout('re_map1024', { className: 'ko-dh' });
    (document.getElementById('kohud') || document.body).append(L.el);
    L.el.style.pointerEvents = 'auto';
    for (const c of L.el.children) if ((c.dataset.id || '').startsWith('Group_') && c.dataset.id !== 'Group_uiform') c.hidden = true;
    const u = L.get('Group_uiform');
    // eski düzenden kalan çift öğeler ve QUEST kutusu gizli
    for (const t of u.querySelectorAll('.kui-tx')) if (/QUEST/i.test(t.textContent)) t.hidden = true;
    for (const id of ['btn_quest_check', 'btn_find_check']) L.show(id, false);
    const tekiniBirak = (id, x) => { for (const e of L.all(id)) e.hidden = Math.abs(px(e, 'left') - x) > 4; };
    tekiniBirak('string_select', 437); tekiniBirak('btn_togglelist', 582); tekiniBirak('string_find_select', 802); tekiniBirak('btn_togglefindlist', 953); tekiniBirak('btn_close', 992);
    // üst şeritte yalnız harita seçimi; Mob açılır kutusu kaldırıldı (arama / NPC / Mob listeleri solda sabit menüde)
    for (const id of ['string_find_select', 'btn_togglefindlist']) L.show(id, false);
    const zoneYazi = [...L.all('string_select')].find((e) => !e.hidden), zoneOk = [...L.all('btn_togglelist')].find((e) => !e.hidden);
    zoneYazi.classList.add('dh-secim');
    const gl = L.get('Group_list'), gf = L.get('Group_find_list');
    for (const c of [...gf.children, ...gl.children]) if (/^(findList|ImgFineList|list|ImgList)/.test(c.dataset.id || '') || c.classList.contains('kui-tx') || c.classList.contains('kui-sc')) c.hidden = true;
    const kutu = (g) => { const d = document.createElement('div'); d.className = 'dh-liste'; d.style.cssText = `left:12px;top:12px;width:${px(g, 'width') - 30}px;height:${px(g, 'height') - 26}px`; g.append(d); return d; };
    // sol menü: arama kutusu + NPC listesi + Mob listesi (ikisi de KO arama listesi çerçevesi), her zaman açık
    const sol = document.createElement('div'); sol.className = 'dh-sol';
    sol.innerHTML = `<div class="dh-sol-ic"><div class="dh-ara-kutu"><input class="dh-ara" placeholder="NPC / Mob ara…" spellcheck="false" autocomplete="off"><i class="dh-ara-sil" title="Temizle">×</i></div>
      <div class="dh-bas npc">NPC <b data-say="npc">0</b><span class="dh-tumu" data-tumu="npc" title="Tüm NPC'leri haritada göster / gizle">Tümü</span></div>
      <div class="dh-bas mob" style="top:${48 + 262}px">Mob <b data-say="mob">0</b><span class="dh-tumu" data-tumu="mob" title="Tüm mobları haritada göster / gizle">Tümü</span></div></div>`;
    const gn = gf.cloneNode(true); gn.removeAttribute('data-id');
    for (const [g, y] of [[gn, 48], [gf, 48 + 262 + 18]]) { g.hidden = false; g.style.left = '-2px'; g.style.top = y + 'px'; sol.firstElementChild.append(g); }
    // sol menünün çerçevesi: KO harita penceresinin sol yarısının aynısı (üst şerit, sol kenar, alt köşe ve alt şerit parçaları)
    for (const c of u.children) {
      if (c.dataset.id || !c.classList.contains('kui-img')) continue;
      const x = px(c, 'left') + px(u, 'left'), y = px(c, 'top') + px(u, 'top');
      if (x > 10) continue;   // yalnız sol kenardan başlayan parçalar
      const k = c.cloneNode(true); k.style.left = (x - 5) + 'px'; k.style.top = y + 'px';
      if (px(c, 'width') > SOL_W) k.style.width = (SOL_W + 4) + 'px';
      k.classList.add('dh-sol-cerceve'); sol.append(k);
    }
    const zl = kutu(gl), nl = kutu(gn), ml = kutu(gf);
    L.listeler = { zl, ml, nl }; L.sol = sol;
    const ac = (k) => { acikListe = acikListe === k ? null : k; gl.hidden = acikListe !== 'zone'; if (acikListe) listeCiz(); };
    L.ac = ac;
    for (const e of [zoneYazi, zoneOk]) { e.classList.add('kui-tik'); e.addEventListener('click', (ev) => { ev.stopPropagation(); ac('zone'); }); }
    zl.addEventListener('click', (e) => { const b = e.target.closest('[data-z]'); if (!b) return; ac(null); zoneSec(b.dataset.z); });
    const secAd = (e) => {
      const r = e.target.closest('[data-ad]'); if (!r || !veri) return;
      if (e.target.closest('.dh-goz')) {   // göz: bu adı haritada gizle / göster
        const ad = r.dataset.ad; gizli.has(ad) ? gizli.delete(ad) : gizli.add(ad); gizliYaz(veri.z, gizli);
        if (gizli.has(ad) && vurgu === ad) vurgu = null;
        isaretCiz(); solCiz(); return;
      }
      vurgu = vurgu === r.dataset.ad ? null : r.dataset.ad; if (vurgu) { gizli.delete(vurgu); gizliYaz(veri.z, gizli); } isaretCiz(); solCiz();
    };
    sol.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tumu]'); if (!t || !veri) return;
      const adlar = [...new Set((t.dataset.tumu === 'mob' ? veri.mob : veri.npc).filter(eslesir).map((o) => o.ad))];
      const hepsiGizli = adlar.every((a) => gizli.has(a));
      for (const a of adlar) hepsiGizli ? gizli.delete(a) : gizli.add(a);
      gizliYaz(veri.z, gizli); isaretCiz(); solCiz();
    });
    ml.addEventListener('click', secAd); nl.addEventListener('click', secAd);
    const ara = sol.querySelector('input');
    ara.addEventListener('input', () => { aranan = ara.value.trim().toLocaleLowerCase('tr'); isaretCiz(); solCiz(); });
    ara.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { ara.value = ''; ara.dispatchEvent(new Event('input')); } if (e.key === 'Enter') { const o = [...(veri?.npc || []), ...(veri?.mob || [])].find(eslesir); if (o) { vurgu = o.ad; isaretCiz(); solCiz(); } } });
    sol.querySelector('.dh-ara-sil').addEventListener('click', () => { ara.value = ''; ara.dispatchEvent(new Event('input')); ara.focus(); });
    sol.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    // sol menüyü gizle / göster: menünün sağ ortasında (harita çerçevesinin sol kenarında) KO tarzı çekme sekmesi; tercih tarayıcıda kalır
    const cek = document.createElement('div'); cek.className = 'dh-cek'; cek.innerHTML = '<i></i>';
    const solGoster = (ac) => { sol.hidden = !ac; cek.classList.toggle('kapali', !ac); cek.title = ac ? 'Menüyü gizle' : 'Menüyü göster'; try { localStorage.setItem('ko-harita-sol', ac ? '1' : '0'); } catch {} };
    cek.addEventListener('click', (e) => { e.stopPropagation(); solGoster(sol.hidden); });
    L.el.append(cek); L.cek = cek;
    L.solGoster = solGoster;
    for (const e of L.all('btn_close')) e.addEventListener('click', (ev) => { ev.stopPropagation(); kapat(); });
    L.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (acikListe && !e.target.closest('[data-id="Group_list"], .kui-tik')) ac(null); });
    L.el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Escape') kapat(); });
    L.el.addEventListener('contextmenu', (e) => e.preventDefault());
    // harita alanı (çerçevenin altında)
    const alan = document.createElement('div'); alan.className = 'dh-alan';
    alan.innerHTML = '<img class="dh-img" alt="" draggable="false"><div class="dh-isaretler"></div><div class="dh-notlar"></div><i class="dh-ben" hidden></i><div class="dh-yukle" hidden>Yükleniyor…</div>';
    // kırpma kutusu (çerçeve iç alanı) → sahne (yakınlaştırılan katman): parşömen / kâğıt + harita alanı
    const kirp = document.createElement('div'); kirp.className = 'dh-kirp'; kirp.style.cssText = `left:${IC.l}px;top:${IC.t}px;width:${IC.r - IC.l}px;height:${IC.b - IC.t}px`;
    const sahne = document.createElement('div'); sahne.className = 'dh-sahne'; kirp.append(sahne);
    sahne.style.cssText = `left:${-IC.l}px;top:${-IC.t}px;transform-origin:${IC.l}px ${IC.t}px`;
    L.el.insertBefore(kirp, u); L.el.append(sol);
    L.solGoster?.(solAcikIlk());
    for (const g of new Set([...Object.values(KO_HARITA).map((x) => x[0]), 'Group_global', 'Group_select'])) { const e = L.get(g); if (e) sahne.append(e); }
    globalKur();
    sahne.append(alan); L.sahne = sahne; L.kirp = kirp;
    const konum = document.createElement('div'); konum.className = 'dh-konum'; L.el.append(konum);
    L.alan = alan;
    const kagit = document.createElement('div'); kagit.className = 'dh-kagit'; kagit.style.cssText = kirp.style.cssText; sahne.insertBefore(kagit, sahne.firstChild); L.kagit = kagit;
    const yer = (e) => { const r = alan.getBoundingClientRect(); return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height }; };
    alan.addEventListener('pointermove', (e) => { if (!veri) return; const { fx, fy } = yer(e); konum.textContent = `${Math.round(fx * veri.dunya)} , ${Math.round((1 - fy) * veri.dunya)}`; });
    // fare tekerleği: imlecin olduğu yeri yakınlaştır (×1–×6); yakınken sol tuşla sürükle; işaretler ekranda sabit boyutta kalır
    kirp.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = kirp.getBoundingClientRect(), wz = r.width / KW, mx = (e.clientX - r.left) / wz, my = (e.clientY - r.top) / wz;
      const k2 = Math.max(1, Math.min(6, yak.k * (e.deltaY < 0 ? 1.25 : 0.8)));
      yakAyarla(k2, mx - (mx - yak.x) / yak.k * k2, my - (my - yak.y) / yak.k * k2);
    }, { passive: false });
    let surukle = null;
    kirp.addEventListener('pointerdown', (e) => { if (e.button !== 0 || yak.k <= 1 || e.target.closest('.dh-not')) return; surukle = { x: e.clientX, y: e.clientY, ox: yak.x, oy: yak.y, oldu: false }; });
    addEventListener('pointermove', (e) => {
      if (!surukle) return; if (!(e.buttons & 1)) { surukle = null; return; }
      const wz = kirp.getBoundingClientRect().width / KW, dx = (e.clientX - surukle.x) / wz, dy = (e.clientY - surukle.y) / wz;
      if (!surukle.oldu && Math.hypot(dx, dy) < 4) return; surukle.oldu = true; kirp.classList.add('suruk');
      yakAyarla(yak.k, surukle.ox + dx, surukle.oy + dy);
    });
    addEventListener('pointerup', () => { if (surukle?.oldu) { L.surukBitti = performance.now(); } surukle = null; kirp.classList.remove('suruk'); });
    alan.addEventListener('click', (e) => {
      if (performance.now() - (L.surukBitti || 0) < 200) return;
      const m = e.target.closest('.dh-m'); if (!m || !veri || veri.z !== aktifZone) return;
      git?.(Number(m.dataset.x), Number(m.dataset.z)); hud.info?.(`Walking to ${m.dataset.ad}.`, 'beceri');
    });
    alan.addEventListener('dblclick', (e) => { if (!veri || veri.z !== aktifZone || e.target.closest('.dh-m, .dh-not')) return; const { fx, fy } = yer(e); git?.(fx * veri.dunya, (1 - fy) * veri.dunya); });
    alan.addEventListener('contextmenu', (e) => {
      e.preventDefault(); if (!veri) return;
      const n = e.target.closest('.dh-not'), { fx, fy } = yer(e);
      notAc(n ? { i: Number(n.dataset.i) } : { x: fx * veri.dunya, z: (1 - fy) * veri.dunya }, e);
    });
    notKur();
    // ekrana sığdır (KO penceresi 1029×771) ve üst şeritten sürükle
    const z = () => parseFloat(L.el.style.zoom) || 1;
    const sigdir = () => { if (!L) return; const k = Math.min(1, (innerWidth - 12) / (1029 + SOL_W), (innerHeight - 12) / 771); L.el.style.zoom = k < 0.999 ? k.toFixed(4) : ''; L.el.style.left = Math.max(SOL_W, Math.round((innerWidth / k - 1029 - SOL_W) / 2) + SOL_W) + 'px'; L.el.style.top = Math.max(0, Math.round((innerHeight / k - 771) / 2)) + 'px'; };
    sigdir(); addEventListener('resize', sigdir);
    let d = null;
    u.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.kui-tik, .kui-btn, .dh-ara-kutu') || (e.clientY - L.el.getBoundingClientRect().top) / z() > 44) return;
      d = { x: e.clientX / z() - px(L.el, 'left'), y: e.clientY / z() - px(L.el, 'top') }; u.setPointerCapture(e.pointerId);
    });
    u.addEventListener('pointermove', (e) => { if (d) { L.el.style.left = (e.clientX / z() - d.x) + 'px'; L.el.style.top = (e.clientY / z() - d.y) + 'px'; } });
    u.addEventListener('pointerup', () => { d = null; });
  }

  // ---------------- KO not / sembol penceresi
  function notKur() {
    const g = L.get('Group_NoteEdit'); if (!g) return;
    L.notG = g;
    const imgs = [...g.children].filter((c) => c.classList.contains('kui-img') && !c.dataset.id && px(c, 'width') >= 30 && px(c, 'width') <= 40);
    const ikon = new Map();
    for (const id of SEMBOL) {
      const b = L.get(id); if (!b) continue;
      const bx = px(b, 'left') + px(b, 'width') / 2, by = px(b, 'top') + px(b, 'height') / 2;
      const im = imgs.find((c) => bx >= px(c, 'left') && bx <= px(c, 'left') + px(c, 'width') && by >= px(c, 'top') && by <= px(c, 'top') + px(c, 'height'));
      if (im) ikon.set(id, im);
      b.title = SEMBOL_AD[id];
      b.classList.add('kui-tik');
      b.addEventListener('click', (ev) => { ev.stopPropagation(); if (!notDuzen) return; notDuzen.s = id; sembolVurgu(); L.notInput?.focus(); });
    }
    L.sembolIkon = ikon;
    for (const id of ['btn_left', 'btn_right', 'btn_sendnote']) L.show(id, false);
    for (const t of g.querySelectorAll(':scope > .kui-tx')) t.hidden = true;
    const yazi = (id, t) => { for (const b of L.all(id)) { const s = document.createElement('span'); s.className = 'dh-dugme-yazi'; s.textContent = t; b.append(s); } };
    yazi('btn_regist', 'Kaydet'); yazi('btn_modify', 'Değiştir'); yazi('btn_delete', 'Sil'); yazi('btn_cancel', 'İptal');
    L.notInput = L.input('edit_note', { placeholder: 'Not yaz (isteğe bağlı)', maxLength: 40 });
    L.notInput?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') (notDuzen?.i != null ? L.get('btn_modify') : L.get('btn_regist'))?.click(); if (e.key === 'Escape') bitir(); });
    const bitir = () => { g.hidden = true; notDuzen = null; };
    L.click('btn_close_edit', bitir); L.click('btn_cancel', bitir);
    L.click('btn_regist', () => { if (!notDuzen || !veri) return; const l = notlar(veri.z); l.push({ x: Math.round(notDuzen.x), z: Math.round(notDuzen.z), s: notDuzen.s, n: L.notInput?.value.trim() || '' }); notKaydet(veri.z, l); bitir(); notCiz(); });
    L.click('btn_modify', () => { if (!notDuzen || !veri) return; const l = notlar(veri.z), o = l[notDuzen.i]; if (o) { o.s = notDuzen.s; o.n = L.notInput?.value.trim() || ''; notKaydet(veri.z, l); } bitir(); notCiz(); });
    L.click('btn_delete', () => { if (!notDuzen || !veri) return; const i = notDuzen.i, z = veri.z; onay('Delete this marker', 'from the map?', () => { const l = notlar(z); l.splice(i, 1); notKaydet(z, l); bitir(); notCiz(); }); });
    // KO onay kutusu (Group_MsgBox) ve not ipucu (Group_Note)
    const mb = L.get('Group_MsgBox');
    if (mb) {
      L.show('btn_ok_single', false); yazi('btn_ok_dual', 'Yes'); yazi('btn_cancel_dual', 'No');
      mb.style.left = (1029 / 2 - 113) + 'px'; mb.style.top = (771 / 2 - 80) + 'px';
      mb.addEventListener('pointerdown', (e) => e.stopPropagation());
      L.click('btn_cancel_dual', () => { mb.hidden = true; });
      L.click('btn_ok_dual', () => { mb.hidden = true; const f = L.onayFn; L.onayFn = null; f?.(); });
    }
    g.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  function onay(s1, s2, fn) {
    const mb = L.get('Group_MsgBox'); if (!mb) { fn(); return; }
    L.text('str_msg01', s1); L.text('str_msg02', s2); L.onayFn = fn; mb.hidden = false;
  }
  function notIpucu(o, e) {
    const g = L.get('Group_Note'); if (!g) return;
    if (!o) { g.hidden = true; return; }
    L.text('string_note', (SEMBOL_AD[o.s] || 'Not') + (o.n ? ': ' + o.n : ''));
    const r = L.el.getBoundingClientRect(), k = parseFloat(L.el.style.zoom) || 1;
    g.style.left = Math.min(1029 - 220, (e.clientX - r.left) / k + 14) + 'px'; g.style.top = Math.max(0, (e.clientY - r.top) / k - 64) + 'px';
    g.hidden = false;
  }
  const sembolVurgu = () => { for (const s of SEMBOL) L.get(s)?.classList.toggle('dh-secili', s === notDuzen?.s); };
  function notAc(o, e) {
    const g = L.notG; if (!g) return;
    const yeni = o.i == null, kayit = yeni ? null : notlar(veri.z)[o.i]; if (!yeni && !kayit) return;
    notDuzen = yeni ? { x: o.x, z: o.z, s: 'btn_memo' } : { i: o.i, s: kayit.s };
    sembolVurgu();
    L.show('btn_regist', yeni); L.show('btn_cancel', yeni); L.show('btn_modify', !yeni); L.show('btn_delete', !yeni);
    if (L.notInput) L.notInput.value = kayit?.n || '';
    const r = L.el.getBoundingClientRect(), k = parseFloat(L.el.style.zoom) || 1;
    const x = (e.clientX - r.left * 1) / k, y = (e.clientY - r.top) / k;
    // grup çocukları pencere koordinatında; grubu tıklanan yere taşı (doğal konumu 127,204)
    g.style.left = (Math.max(20, Math.min(1029 - 240, x + 12)) - 127) + 'px';
    g.style.top = (Math.max(50, Math.min(771 - 200, y + 12)) - 204) + 'px';
    g.hidden = false; setTimeout(() => L.notInput?.focus(), 0);
  }
  function notCiz() {
    const k = L?.alan?.querySelector('.dh-notlar'); if (!k) return;
    k.innerHTML = '';
    if (!veri) return;
    notlar(veri.z).forEach((o, i) => {
      const d = document.createElement('div'); d.className = 'dh-not'; d.dataset.i = i;
      d.style.left = (o.x / veri.dunya * 100) + '%'; d.style.top = ((1 - o.z / veri.dunya) * 100) + '%';
      d.addEventListener('pointerenter', (e) => notIpucu(o, e)); d.addEventListener('pointermove', (e) => notIpucu(o, e)); d.addEventListener('pointerleave', () => notIpucu(null));
      const im = L.sembolIkon?.get(o.s);
      if (im) { const c = im.cloneNode(true); c.className = 'dh-not-ikon'; c.removeAttribute('style'); c.style.backgroundImage = im.style.backgroundImage; c.style.backgroundSize = im.style.backgroundSize; c.style.backgroundPosition = im.style.backgroundPosition; c.style.width = im.style.width; c.style.height = im.style.height; d.append(c); }
      if (o.n) { const s = document.createElement('span'); s.className = 'dh-not-yazi'; s.textContent = o.n; d.append(s); }
      k.append(d);
    });
  }

  // ---------------- içerik
  const eslesir = (o) => !aranan || o.ad.toLocaleLowerCase('tr').includes(aranan);
  const yak = { k: 1, x: 0, y: 0 };
  let etiketZam = 0;
  function yakAyarla(k, x, y) {
    yak.k = k; yak.x = Math.min(0, Math.max(KW - KW * k, x)); yak.y = Math.min(0, Math.max(KH - KH * k, y));
    if (!L?.sahne) return;
    L.sahne.style.transform = k === 1 ? '' : `translate(${yak.x}px, ${yak.y}px) scale(${k})`;
    L.el.style.setProperty('--iz', String(1 / k));
    L.kirp.classList.toggle('yakin', k > 1);
    cancelAnimationFrame(etiketZam); etiketZam = requestAnimationFrame(etiketDuzenle);
  }
  // çakışan ad başlıkları: önce vurgulu / NPC'ler, sonra moblar; üst üste binen başlık gizlenir (yakınlaştıkça açılır)
  function etiketDuzenle() {
    const k = L?.alan?.querySelector('.dh-isaretler'); if (!k || L.el.hidden) return;
    const M = [...k.querySelectorAll('.dh-m:not(.soluk)')];
    M.sort((a, b) => (b.classList.contains('vurgu') - a.classList.contains('vurgu')) || (b.classList.contains('npc') - a.classList.contains('npc')));
    const al = []; const kr = L.kirp.getBoundingClientRect();
    for (const m of M) {
      const b = m.querySelector('.dh-ad'); b.classList.remove('gizli');
      const r = b.getBoundingClientRect();
      const disari = r.right < kr.left || r.left > kr.right || r.bottom < kr.top || r.top > kr.bottom;
      if (disari) continue;
      if (al.some((o) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top)) { b.classList.add('gizli'); continue; }
      al.push(r);
    }
  }
  function alanYerlestir(z) {
    const a = L.alan, ko = KO_HARITA[z], dunya = z === DUNYA;
    for (const g of new Set([...Object.values(KO_HARITA).map((x) => x[0]), 'Group_global', 'Group_select'])) { const e = L.get(g); if (e) e.hidden = true; }
    // harita çerçevenin iç yüksekliğini doldurur (702 px kare, ortada); KO parşömeni aynı oranda büyütülüp çerçeveye kırpılır
    const A = IC.b - IC.t, cx = HARITA_SOL + (IC.r - HARITA_SOL) / 2, cy = (IC.t + IC.b) / 2;
    if (ko) {
      const g = L.get(ko[0]), ar = L.get(ko[1]);
      if (g && ar) {
        g.hidden = false;
        const k = A / px(ar, 'width');
        yerlestir(g, k, px(g, 'left') + px(ar, 'left') + px(ar, 'width') / 2, px(g, 'top') + px(ar, 'top') + px(ar, 'height') / 2, cx, cy);
      }
    }
    if (dunya) {   // KO dünya haritası: resim (0,32)-(1024,768) çerçeve içini kaplar
      const k = Math.max(KW / 1024, KH / 736);
      for (const id of ['Group_global', 'Group_select']) { const g = L.get(id); if (!g) continue; g.hidden = false; yerlestir(g, k, 512, 400, cx, cy); }
      for (const c of L.get('Group_select')?.children || []) c.hidden = true;
    }
    L.kagit.hidden = !!ko || dunya; a.hidden = dunya;
    a.style.cssText = `left:${cx - A / 2}px;top:${IC.t}px;width:${A}px;height:${A}px`;
    L.el.classList.toggle('dh-istemci', !ko && !dunya);
    L.el.classList.toggle('dh-dunya', dunya);
  }
  // KO dünya haritası: bölge alanlarına tıklayınca o bölgenin haritası açılır; üzerine gelince KO vurgu katmanı
  function globalKur() {
    const g = L.get('Group_global'), sel = L.get('Group_select'); if (!g) return;
    for (const [id, [z, katman, ad]] of Object.entries(GLOBAL_ALAN)) {
      const e = L.get(id); if (!e) continue;
      const var_ = z && (zonelar || []).some((x) => x.id === z);
      e.classList.add('dh-galan'); e.classList.toggle('kapali', !var_);
      e.title = ad + (var_ ? '' : ' (kapalı)');
      const k = sel ? [...sel.children].find((c) => c.dataset.id === katman) : null;
      e.addEventListener('pointerenter', () => { if (k) k.hidden = false; });
      e.addEventListener('pointerleave', () => { if (k) k.hidden = true; });
      e.addEventListener('click', (ev) => { ev.stopPropagation(); if (var_) zoneSec(z); });
    }
  }
  async function zoneSec(z) {
    secili = z; vurgu = null; zoneYaz(); yakAyarla(1, 0, 0);
    solCiz();
    alanYerlestir(z);
    const no = ++yukNo, yk = L.alan.querySelector('.dh-yukle');
    if (z === DUNYA) { veri = null; gizli = new Set(); isaretCiz(); notCiz(); benCiz(); solCiz(); return; }
    yk.hidden = false;
    const v = await zoneVeri(z).catch(() => null); if (no !== yukNo || !L) return;
    veri = v; yk.hidden = true; gizli = gizliOku(z);
    const img = L.alan.querySelector('.dh-img');
    if (KO_HARITA[z]) { img.hidden = true; img.removeAttribute('src'); } else { img.hidden = false; img.src = v?.resim || ''; img.onerror = () => img.removeAttribute('src'); }
    isaretCiz(); notCiz(); benCiz(); solCiz();
    requestAnimationFrame(etiketDuzenle);
  }
  const zoneAd = () => (secili === DUNYA ? 'Dünya Haritası' : (zonelar || []).find((x) => x.id === secili)?.name || secili);
  function zoneYaz() { const e = [...L.all('string_select')].find((x) => !x.hidden); if (e) e.textContent = zoneAd(); }
  function listeCiz() {
    const { zl } = L.listeler;
    zl.innerHTML = `<div class="dh-s dh-s-dunya${secili === DUNYA ? ' secili' : ''}" data-z="${DUNYA}">◆ Dünya Haritası</div>` + (zonelar || []).map((z) => `<div class="dh-s${z.id === secili ? ' secili' : ''}${z.id === aktifZone ? ' burada' : ''}" data-z="${esc(z.id)}">${esc(z.name || z.id)}</div>`).join('');
  }
  // sol menü: arama süzgecine uyan NPC ve moblar (aynı ad tek satır, adet), seçili olan vurgulu
  function solCiz() {
    if (!L?.listeler) return;
    for (const tur of ['npc', 'mob']) {
      const kume = (tur === 'mob' ? veri?.mob : veri?.npc) || [];
      const g = new Map(); for (const o of kume) if (eslesir(o)) { const x = g.get(o.ad) || { ...o, n: 0 }; x.n++; g.set(o.ad, x); }
      const A = [...g.values()].sort((a, b) => (tur === 'mob' ? (a.sv || 0) - (b.sv || 0) : 0) || a.ad.localeCompare(b.ad, 'tr'));
      L.sol.querySelector(`[data-say="${tur}"]`).textContent = A.length;
      (tur === 'mob' ? L.listeler.ml : L.listeler.nl).innerHTML = A.length ? A.map((x) => `<div class="dh-s${vurgu === x.ad ? ' secili' : ''}${gizli.has(x.ad) ? ' kapali' : ''}" data-ad="${esc(x.ad)}" style="color:${x.renk}"><i class="dh-goz" title="${gizli.has(x.ad) ? 'Haritada göster' : 'Haritada gizle'}"></i>${esc(x.ad)}${x.sv ? ` <em>Lv ${x.sv}</em>` : ''}${x.n > 1 ? ` <b>×${x.n}</b>` : ''}</div>`).join('') : `<div class="dh-bos">${secili === DUNYA ? 'Bir bölge seç.' : veri ? 'Sonuç yok.' : 'Yükleniyor…'}</div>`;
      const t = L.sol.querySelector(`[data-tumu="${tur}"]`); if (t) t.classList.toggle('kapali', A.length > 0 && A.every((x) => gizli.has(x.ad)));
    }
  }
  function isaretCiz() {
    const k = L.alan.querySelector('.dh-isaretler'); if (!veri) { k.innerHTML = ''; return; }
    const D = veri.dunya;
    k.innerHTML = [...veri.mob, ...veri.npc].filter((o) => !gizli.has(o.ad) && o.x >= 0 && o.z >= 0 && o.x <= D && o.z <= D).map((o) => {
      const es = eslesir(o), vg = vurgu === o.ad;
      return `<div class="dh-m ${o.tur}${o.boss ? ' boss' : ''}${!es ? ' soluk' : ''}${vg ? ' vurgu' : ''}" style="left:${(o.x / D * 100).toFixed(2)}%;top:${((1 - o.z / D) * 100).toFixed(2)}%" data-ad="${esc(o.ad)}" data-x="${o.x}" data-z="${o.z}" title="${esc(o.ad)}${o.sv ? ' (Lv ' + o.sv + ')' : ''}"><b class="dh-ad" style="color:${o.renk}">${esc(o.ad)}</b><i class="dh-p" data-model="${esc(o.model || '')}"></i></div>`;
    }).join('');
    for (const i of k.querySelectorAll('.dh-p')) { const m = i.dataset.model; if (m) portre(m).then((url) => { if (url && i.isConnected) i.style.backgroundImage = `url(${url})`; }); }
    cancelAnimationFrame(etiketZam); etiketZam = requestAnimationFrame(etiketDuzenle);
  }
  function benCiz() {
    const b = L?.alan?.querySelector('.dh-ben'); if (!b) return;
    if (!veri || veri.z !== aktifZone) { b.hidden = true; return; }
    const D = veri.dunya, p = player.position; b.hidden = false;
    b.style.left = (p.x / D * 100) + '%'; b.style.top = ((1 - p.z / D) * 100) + '%'; b.style.transform = `translate(-50%, -50%) rotate(${state.yaw || 0}rad)`;
  }

  async function ac() {
    if (!L) { await (kurulum ||= zoneListesi().then(kur).catch((e) => { kurulum = null; throw e; })); }
    L.el.hidden = false;
    if (!veri || veri.z !== secili) await zoneSec(secili); else { zoneYaz(); benCiz(); }
    clearInterval(tik); tik = setInterval(() => { if (!L || L.el.hidden) return clearInterval(tik); benCiz(); }, 250);
  }
  function kapat() { if (L) { L.el.hidden = true; if (L.notG) L.notG.hidden = true; L.show('Group_MsgBox', false); L.show('Group_Note', false); notDuzen = null; if (acikListe) L.ac(null); } clearInterval(tik); }
  return { ac, kapat, toggle: () => (L && !L.el.hidden ? kapat() : kurulum && !L ? null : ac()), get acik() { return !!L && !L.el.hidden; } };
}
