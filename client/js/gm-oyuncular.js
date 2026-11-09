// GM paneli → Oyuncular: tüm oyuncular (arama, yalnız çevrimiçi), satıra tıklayınca alt pencerede oyuncunun bilgileri ve işlemler:
// ışınlanma (yanına git, yanına çağır, haritaya gönder), ceza (sustur / yasakla süreli ya da kalıcı, cezayı kaldır, oyundan at),
// ödül (seviye, Noah, ulus puanı, cash, posta ile eşya), can / mana doldur. Sunucu: gm_oyuncu_liste / gm_oyuncu_detay / gm_oyuncu_islem
// (GM yetkisi denetlenir; başka bir GM'e ceza / atma / seviye işlemi yapılamaz). Riskli işlemler iki adımlı onay ister.
import { iconHtml, nameColor, loadMeta as esyaMeta } from './esya.js';
import { MG_TUR } from './gm-mineguard.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SINIF = (c) => { const k = c % 100; return [1, 5, 6].includes(k) ? 'Savaşçı' : [2, 7, 8].includes(k) ? 'Okçu' : [3, 9, 10].includes(k) ? 'Büyücü' : [4, 11, 12].includes(k) ? 'Rahip' : [13, 14, 15].includes(k) ? 'Kurian' : '#' + c; };
const ULUS = { 1: 'Karus', 2: 'El Morad' };
const tarih = (t) => (t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const once = (t) => { if (!t) return '—'; const s = (Date.now() - new Date(t).getTime()) / 1000; if (s < 120) return 'şimdi'; if (s < 3600) return Math.round(s / 60) + ' dk önce'; if (s < 86400) return Math.round(s / 3600) + ' sa önce'; return Math.round(s / 86400) + ' gün önce'; };

export function initGmOyuncular({ sb, character, zone, state, player, hud, say }) {
  let envAcik = false, env = null, envSekme = 'envanter', mg = null;
  let kok = null, liste = [], toplam = 0, ara = '', cevrim = false, secId = null, detay = null, onay = null, haritalar = [];
  const rpc = async (fn, a) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...a }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };
  const $ = (s) => kok.querySelector(s);
  function kur() {
    kok = document.createElement('div'); kok.className = 'g2-gomulu go2';
    kok.innerHTML = `<div class="go2-ust"><input data-o="ara" placeholder="Oyuncu adı ya da numarası…" autocomplete="off"><label class="go2-cb"><input type="checkbox" data-o="cevrim"> Yalnız çevrimiçi</label><button data-o="yenile">↻ Yenile</button><span class="go2-sayi"></span></div>
      <div class="go2-tablo"><div class="go2-tr go2-th"><span>Oyuncu</span><span>Seviye</span><span>Ulus · Meslek</span><span>Harita</span><span>Durum</span></div><div class="go2-govde"></div></div>
      <div class="go2-alt"><div class="g2-bos">Ayrıntı ve işlemler için listeden bir oyuncu seç.</div></div>`;
    kok.addEventListener('input', (e) => { if (e.target.dataset.o === 'ara') { ara = e.target.value.trim(); clearTimeout(kur.t); kur.t = setTimeout(yukle, 250); } });
    kok.addEventListener('change', (e) => { if (e.target.dataset.o === 'cevrim') { cevrim = e.target.checked; yukle(); } });
    kok.addEventListener('click', tikla);
    kok.addEventListener('keydown', (e) => { e.stopPropagation(); });
    sb.from('zones').select('id,name').order('sort').then(({ data }) => { haritalar = data || []; if (detay) altCiz(); }, () => {});
    yukle();
  }
  async function yukle() {
    const d = await rpc('gm_oyuncu_liste', { p_ara: ara || null, p_cevrim: cevrim, p_limit: 300, p_offset: 0 }).catch(() => null);
    if (!d) return;
    liste = d.liste || []; toplam = d.toplam || 0; listeCiz();
  }
  function listeCiz() {
    $('.go2-sayi').textContent = `${toplam.toLocaleString('tr-TR')} oyuncu${toplam > liste.length ? ` · ilk ${liste.length} gösteriliyor` : ''}`;
    $('.go2-govde').innerHTML = liste.map((o) => `<div class="go2-tr go2-sec${o.id === secId ? ' secili' : ''}" data-id="${o.id}">
      <span><b>${esc(o.ad)}</b>${o.gm ? '<em class="go2-rozet gm">GM</em>' : ''}${(o.ceza || []).map((c) => `<em class="go2-rozet ${c}">${c === 'ban' ? 'Yasaklı' : 'Susturulmuş'}</em>`).join('')}</span>
      <span>${o.seviye}</span><span>${ULUS[o.ulus] || '-'} · ${SINIF(o.sinif)}</span><span>${esc(o.zone)}</span>
      <span>${o.cevrimici ? '<i class="go2-nokta acik"></i>Çevrimiçi' : `<i class="go2-nokta"></i>${once(o.son)}`}</span></div>`).join('') || '<div class="g2-bos">Oyuncu bulunamadı.</div>';
  }
  async function sec(id) {
    secId = id; onay = null; listeCiz();
    $('.go2-alt').innerHTML = '<div class="g2-bos">Yükleniyor…</div>';
    detay = await rpc('gm_oyuncu_detay', { p_hedef: id }).catch(() => null);
    envAcik = false; env = null; envSekme = 'envanter';
    mg = await rpc('gm_mg_oyuncu', { p_hedef: id }).catch(() => null);
    altCiz();
  }
  function altCiz() {
    const d = detay, k = $('.go2-alt');
    if (!d?.ok) { k.innerHTML = `<div class="g2-bos">${esc(d?.reason || 'Oyuncu bulunamadı.')}</div>`; return; }
    const ben = d.id === Number(character.id);
    const ob = (ad, et) => `<button data-i="${ad}" ${onay === ad ? 'class="go2-onay"' : ''}>${onay === ad ? 'Onayla' : et}</button>`;
    k.innerHTML = `<div class="go2-bas"><div><b>${esc(d.ad)}</b>${d.gm ? '<em class="go2-rozet gm">GM</em>' : ''}<span>#${d.id} · ${d.seviye}. seviye · ${ULUS[d.ulus] || '-'} · ${SINIF(d.sinif)} · hesap <b>${esc(d.hesap || '-')}</b></span></div>
        <span class="go2-durum ${d.cevrimici ? 'acik' : ''}">${d.cevrimici ? 'Çevrimiçi' : 'Çevrimdışı'}</span></div>
      <div class="go2-izgara">
        <section><h4>Bilgi</h4><dl>
          <dt>Harita</dt><dd>${esc(d.zone_ad || d.zone)} · X ${d.x} Z ${d.z}</dd><dt>Can / Mana</dt><dd>${d.hp} / ${d.max_hp} · ${d.mp} / ${d.max_mp}${d.olu ? ' · <b class="go2-k">ölü</b>' : ''}</dd>
          <dt>Noah</dt><dd>${Number(d.noah || 0).toLocaleString('tr-TR')}</dd><dt>Cash · NP</dt><dd>${Number(d.cash || 0).toLocaleString('tr-TR')} · ${Number(d.np || 0).toLocaleString('tr-TR')}</dd>
          <dt>Statü</dt><dd>STR ${d.str} · HP ${d.sta} · DEX ${d.dex} · INT ${d.intel} · MP ${d.cha} · boş ${d.puan}</dd>
          <dt>Klan</dt><dd>${esc(d.klan || '—')}</dd><dt>Oluşturma</dt><dd>${tarih(d.olusturma)}</dd>
          <dt>Hesaptaki</dt><dd>${(d.karakterler || []).map((c) => `<a data-sec="${c.id}">${esc(c.ad)} (${c.seviye})</a>`).join(', ')}</dd></dl>
          <div class="go2-sat"><button data-env="1" class="${envAcik ? 'g2-ana' : ''}">${envAcik ? 'Envanteri gizle' : 'Envanteri göster'}</button><span class="go2-ipucu">çanta, Inn Hostess deposu ve postadaki eşyalar</span></div></section>
        <section><h4>Işınlanma</h4>
          <div class="go2-sat"><button data-i="git" ${ben ? 'disabled' : ''}>Yanına git</button><button data-i="cagir" ${ben ? 'disabled' : ''}>Yanıma çağır</button></div>
          <div class="go2-sat"><select data-v="hzone">${haritalar.map((z) => `<option value="${esc(z.id)}" ${z.id === 'moradon' ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select>${ob('gonder', 'Haritaya gönder')}</div>
          <div class="go2-sat"><button data-i="iyiles">Can / mana doldur, dirilt</button></div>
          <h4>Ödül ve düzenleme</h4>
          <div class="go2-sat"><span class="go2-et">Seviye</span><input type="number" data-v="seviye" min="1" max="83" value="${d.seviye}">${ob('seviye', 'Ayarla')}</div>
          <div class="go2-sat"><span class="go2-et">Master<small>${[6, 8, 10, 12, 15].includes(d.sinif % 100) ? 'açık' : 'kapalı'}</small></span>${ob('master_ac', 'Master aç')}${ob('master_kapat', 'Master kapat')}</div>
          ${[['noah', 'Noah', Number(d.noah || 0)], ['np', 'Ulus puanı', Number(d.np || 0)], ['cash', 'Cash', Number(d.cash || 0)], ['puan', 'Statü puanı', Number(d.puan || 0)]].map(([k, ad, m]) => `<div class="go2-sat"><span class="go2-et">${ad}<small>${m.toLocaleString('tr-TR')}</small></span><input type="number" min="1" data-v="${k}" placeholder="Miktar">${ob(k + '+', 'Ver')}${ob(k + '-', 'Al')}</div>`).join('')}
          <div class="go2-sat"><span class="go2-et">Eşya</span><input type="number" data-v="esya" placeholder="Eşya no"><input type="number" data-v="adet" value="1" min="1" style="max-width:64px">${ob('posta', 'Gönder')}</div></section>
        <section><h4>Ceza</h4>
          <div class="go2-sat"><select data-v="sure"><option value="10">10 dakika</option><option value="60" selected>1 saat</option><option value="1440">1 gün</option><option value="10080">7 gün</option><option value="43200">30 gün</option><option value="0">Kalıcı</option></select>
            <input data-v="neden" placeholder="Neden (oyuncuya gösterilir)" maxlength="300"></div>
          <div class="go2-sat">${ob('sustur', 'Sohbetten sustur')}${ob('ban', 'Hesabı yasakla')}${ob('dc', 'Oyundan at')}</div>
          <h4 class="mg2-h4">MineGuard</h4>
          <div class="go2-mg"><div><b class="${(mg?.toplam || 0) > 0 ? 'kirmizi' : ''}">${mg?.toplam ?? 0}</b><span>ceza puanı</span></div><div><b>${mg?.supheli ?? 0}</b><span>şüphe (7 gün)</span></div></div>
          <div class="go2-sat"><input type="number" data-v="mgpuan" min="1" max="100" value="1" style="max-width:64px"><input data-v="mgneden" placeholder="Neden (küfür, hakaret…)" maxlength="300">${ob('mgceza', 'Ceza puanı ver')}</div>
          ${(mg?.olaylar || []).slice(0, 5).map((o) => `<div class="go2-mgolay"><b>${esc(MG_TUR[o.tur]?.[0] || o.tur)}</b><span>şüphe ${o.skor}${o.adet > 1 ? ' ×' + o.adet : ''} · ${{ yeni: 'incelenmemiş', cezali: 'cezalı', incelendi: 'incelendi', yoksay: 'yok sayıldı' }[o.durum] || o.durum}</span><i>${tarih(o.son_at)}</i></div>`).join('')}
          ${(mg?.cezalar || []).filter((z) => z.aktif).slice(0, 5).map((z) => `<div class="go2-mgolay ceza"><b>+${z.puan}</b><span>${esc(z.neden || '')}</span><i>${z.kaynak === 'mineguard' ? 'MineGuard' : esc(z.gm || 'GM')} · ${tarih(z.zaman)}</i></div>`).join('')}
          <h4>Etkin cezalar</h4>
          ${(d.cezalar || []).map((c) => `<div class="go2-ceza"><b>${c.tur === 'ban' ? 'Yasak' : 'Susturma'}</b><span>${c.bitis ? 'bitiş ' + tarih(c.bitis) : 'kalıcı'} · ${esc(c.gm || '')}${c.neden ? ' · ' + esc(c.neden) : ''}</span><button data-i="ceza_kaldir" data-id="${c.id}">Kaldır</button></div>`).join('') || '<p class="ay-not">Etkin ceza yok.</p>'}
        </section>
      </div>${envAcik ? envHtml() : ''}`;
  }
  // ---- oyuncunun eşyaları: çanta (kuşanılan + çanta + diğer yuvalar), Inn Hostess deposu (hesap), postadaki alınmamış eşyalar
  const ESL = { 0: 'Kulak', 1: 'Baş', 2: 'Kolye', 3: 'Kulak', 4: 'Gövde', 5: 'Kemer', 6: 'Sağ el', 7: 'Sağ yüzük', 8: 'Sol el', 9: 'Bacak', 10: 'Kalkan', 11: 'Sol yüzük', 12: 'Eldiven', 13: 'Ayak' };
  const yuva = (x, alt) => { const it = { ikon: x.ikon, strName: x.ad, ItemType: x.tip, Kind: x.tur, AdRenk: x.renk };
    return `<div class="go2-yuva" title="${esc(x.ad || '#' + x.num)} · #${x.num}${x.adet > 1 ? ' · ' + x.adet + ' adet' : ''}${x.dur != null ? ' · dayanıklılık ' + x.dur : ''}${alt ? ' · ' + alt : ''}"><span class="g2-slot-ik" style="--d:${nameColor(it)}">${iconHtml(it, 40)}${x.adet > 1 ? `<em>${x.adet}</em>` : ''}</span><span class="go2-yuva-ad" style="color:${koyu(nameColor(it))}">${esc(x.ad || '#' + x.num)}</span>${alt ? `<i>${esc(alt)}</i>` : ''}</div>`; };
  const koyu = (hex) => { const n = parseInt(String(hex).slice(1), 16); if ((n >> 16 & 255) > 220 && (n >> 8 & 255) > 220 && (n & 255) > 220) return '#1f2937'; const f = (v) => Math.round(v * 0.55).toString(16).padStart(2, '0'); return '#' + f(n >> 16 & 255) + f(n >> 8 & 255) + f(n & 255); };
  function envHtml() {
    if (!env) return '<div class="go2-env"><div class="g2-bos">Eşyalar yükleniyor…</div></div>';
    const E = env.envanter || [], kus = E.filter((x) => x.slot < 14), canta = E.filter((x) => x.slot >= 14 && x.slot <= 41), diger = E.filter((x) => x.slot > 41);
    const ust = `<div class="g2-alt go2-env-sekme">${[['envanter', `Çanta (${E.length})`], ['depo', `Inn Hostess (${(env.depo || []).length})`], ['posta', `Posta (${(env.posta || []).length})`]].map(([k, a]) => `<button data-envs="${k}" class="${envSekme === k ? 'secili' : ''}">${a}</button>`).join('')}</div>`;
    let ic = '';
    if (envSekme === 'envanter') ic = `<div class="go2-env-bas">Noah: <b>${Number(env.noah || 0).toLocaleString('tr-TR')}</b></div>
      <h4>Kuşanılan</h4><div class="go2-izg">${kus.map((x) => yuva(x, ESL[x.slot] || 'yuva ' + x.slot)).join('') || '<p class="ay-not">Kuşanılan eşya yok.</p>'}</div>
      <h4>Çanta</h4><div class="go2-izg">${canta.map((x) => yuva(x)).join('') || '<p class="ay-not">Çanta boş.</p>'}</div>
      ${diger.length ? `<h4>Diğer yuvalar (kostüm, pet vb.)</h4><div class="go2-izg">${diger.map((x) => yuva(x, 'yuva ' + x.slot)).join('')}</div>` : ''}`;
    if (envSekme === 'depo') ic = `<div class="go2-env-bas">Depodaki Noah: <b>${Number(env.depo_noah || 0).toLocaleString('tr-TR')}</b> · hesabın ortak deposu</div><div class="go2-izg">${(env.depo || []).map((x) => yuva(x)).join('') || '<p class="ay-not">Depo boş.</p>'}</div>`;
    if (envSekme === 'posta') ic = `<div class="go2-env-bas">Alınmamış posta eşyaları</div><div class="go2-izg">${(env.posta || []).map((x) => yuva(x, `${x.kimden || '?'} · ${tarih(x.zaman)}`)).join('') || '<p class="ay-not">Postada eşya yok.</p>'}</div>`;
    return `<div class="go2-env"><div class="go2-env-ust"><b>${esc(detay.ad)} — eşyalar</b>${ust}</div>${ic}</div>`;
  }
  async function tikla(e) {
    const r = e.target.closest('.go2-sec'); if (r) return sec(Number(r.dataset.id));
    if (e.target.closest('[data-env]')) { envAcik = !envAcik; altCiz(); if (envAcik && !env) { await esyaMeta().catch(() => {}); env = await rpc('gm_oyuncu_esyalar', { p_hedef: detay.id }).catch(() => ({})); altCiz(); } if (envAcik) kok.querySelector('.go2-env')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    const es = e.target.closest('[data-envs]'); if (es) { envSekme = es.dataset.envs; return altCiz(); }
    const a = e.target.closest('[data-sec]'); if (a) return sec(Number(a.dataset.sec));
    if (e.target.closest('[data-o=yenile]')) return yukle();
    const b = e.target.closest('button[data-i]'); if (!b || !detay?.ok) return;
    const i = b.dataset.i, v = (n) => kok.querySelector(`[data-v="${n}"]`)?.value;
    const riskli = ['master_ac', 'master_kapat', 'mgceza', 'gonder', 'seviye', 'noah+', 'noah-', 'np+', 'np-', 'cash+', 'cash-', 'puan+', 'puan-', 'posta', 'sustur', 'ban', 'dc'];
    if (riskli.includes(i) && onay !== i) { onay = i; altCiz(); clearTimeout(tikla.t); tikla.t = setTimeout(() => { if (onay === i) { onay = null; altCiz(); } }, 4000); return; }
    onay = null;
    let veri = {};
    let islem = i;
    if (i === 'seviye') { const n = Number(v(i)); if (!Number.isFinite(n) || n < 1 || n > 83) { altCiz(); return hud.notice?.('Level must be between 1 and 83.', 'hata'); } veri = { deger: n }; }
    if (/^(noah|np|cash|puan)[+-]$/.test(i)) { islem = i.slice(0, -1); const n = Math.abs(Math.round(Number(v(islem)))); if (!Number.isFinite(n) || n <= 0) { altCiz(); return hud.notice?.('Enter a valid amount.', 'hata'); } veri = { deger: i.endsWith('-') ? -n : n }; }
    if (i === 'gonder') veri = { zone: v('hzone') };
    if (i === 'master_ac' || i === 'master_kapat') { islem = 'master'; veri = { ac: i === 'master_ac' }; }   // (4.11) master (usta) aç / kapat: açıkken sınıf ustalıkta sabit kalır
    if (i === 'sustur' || i === 'ban') veri = { dakika: Number(v('sure')) || 0, neden: v('neden') || '' };
    if (i === 'ceza_kaldir') veri = { id: Number(b.dataset.id) };
    try {
      if (i === 'mgceza') {
        const p = Number(v('mgpuan')), ned = (v('mgneden') || '').trim(); if (!(p > 0)) { altCiz(); return hud.notice?.('Enter points.', 'hata'); } if (!ned) { altCiz(); return hud.notice?.('Enter a reason.', 'hata'); }
        const d = await rpc('gm_mg_ceza_ver', { p_hedef: detay.id, p_puan: p, p_neden: ned }); if (!d?.ok) { altCiz(); return hud.notice?.(d?.reason || 'Action failed.', 'hata'); }
        hud.info?.(`${detay.ad}: +${p} penalty points (total ${d.toplam})${d.ban ? ' — threshold exceeded, account banned.' : ''}`, 'tamam'); return sec(detay.id);
      }
      if (i === 'posta') {
        const num = Number(v('esya')), adet = Math.max(1, Number(v('adet')) || 1); if (!num) { altCiz(); return hud.notice?.('Enter an item number.', 'hata'); }
        await rpc('gm_mail', { p_alici: detay.ad, p_konu: 'Hediye', p_metin: 'GM hediyesi', p_esya: num, p_adet: adet });
        hud.info?.(`${detay.ad}: #${num} ×${adet} sent by mail.`, 'tamam'); return altCiz();
      }
      const d = await rpc('gm_oyuncu_islem', { p_hedef: detay.id, p_islem: islem, p_veri: veri });
      if (!d?.ok) { hud.notice?.(d?.reason || 'Action failed.', 'hata'); return altCiz(); }
      if (i === 'git') {
        if (d.ayni) { player.position.set(d.x, state.heightAt?.(d.x, d.z) ?? player.position.y, d.z); state.target = null; state.net?.kick?.(); hud.info?.(`Teleported to ${detay.ad}.`, 'tamam'); }
        else { say?.(`Teleporting to ${detay.ad}…`, 'tamam'); state.net?.halt?.(); const u = new URL(location.href); ['x', 'z', 'bolge'].forEach((q) => u.searchParams.delete(q)); u.searchParams.set('karakter', character.id); setTimeout(() => location.replace(u.toString()), 350); }
        return;
      }
      if (i === 'cagir') state.net?.cagir?.({ id: detay.id, zone: d.zone, x: d.x, z: d.z, gm: character.name });
      hud.info?.(`${detay.ad}: ${d.mesaj || 'done'}`, 'tamam');
      await sec(detay.id); yukle();
    } catch { altCiz(); }
  }
  return {
    open(host) { if (!kok) kur(); if (host && kok.parentNode !== host) host.append(kok); },
    secOyuncu(id) { if (!kok) kur(); return sec(Number(id)); },
  };
}
