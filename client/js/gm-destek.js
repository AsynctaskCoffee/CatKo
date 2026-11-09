// GM paneli → Oyuncular → Destek talepleri: oyuncuların sağ üstteki KO "?" düğmesiyle (re_requesthelp) gönderdiği sorular.
// Liste (Açık / Cevaplanan / Kapalı / Tümü), seçili talep: oyuncu, sunucu, harita, seviye, zaman, soru; cevap yaz → oyuncuya KO cevap penceresinde gider.
// Sunucu: destek_talep tablosu, gm_destek_liste / gm_destek_cevap / gm_destek_durum.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tarih = (t) => { if (!t) return ''; const d = new Date(t); return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const DURUM = { acik: ['Açık', 'kapali'], cevaplandi: ['Cevaplandı', 'acik'], kapali: ['Kapalı', ''] };

export function initGmDestek({ sb, character, hud, gitOyuncu }) {
  let h = null, liste = [], acikSay = 0, filtre = 'acik', sec = null, yukT = 0;
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };
  async function yukle() {
    const d = await rpc('gm_destek_liste', { p_durum: filtre === 'hepsi' ? null : filtre }).catch(() => null); if (!d) return;
    liste = d.liste || []; acikSay = d.acik || 0;
    if (sec && !liste.some((x) => x.id === sec)) sec = null;
    if (!sec && liste.length) sec = liste[0].id;
    window.dispatchEvent(new CustomEvent('ko-gm-destek-sayi', { detail: acikSay }));
    ciz();
  }
  function ciz() {
    if (!h?.isConnected) return;
    const r = liste.find((x) => x.id === sec);
    const yazi = h.querySelector('[name=ds-cevap]')?.value;
    h.innerHTML = `<div class="g2-gomulu gds">
      <div class="g2-bolum"><div class="g2-bas">Destek talepleri <span class="g2-rozet">${acikSay} açık</span>
        <span class="gds-filtre">${[['acik', 'Açık'], ['cevaplandi', 'Cevaplanan'], ['kapali', 'Kapalı'], ['hepsi', 'Tümü']].map(([k, a]) => `<button data-f="${k}" class="g2-ikincil${filtre === k ? ' secili' : ''}">${a}</button>`).join('')}
        <button data-k="yenile" class="g2-ikincil" title="Yenile">⟳</button></span></div>
        <div class="gds-liste">${liste.map((x) => `<div class="g2-tr g2-sec gds-satir${x.id === sec ? ' secili' : ''}" data-id="${x.id}">
          <span><b>${esc(x.char_ad)}</b><i>Lv ${x.level ?? '-'} · ${esc(x.sunucu || '')}</i></span><span class="gds-ozet">${esc(x.metin)}</span><span>${tarih(x.olusturma)}</span>
          <span><em class="g2-durum gds-${x.durum}">${DURUM[x.durum]?.[0] || x.durum}</em></span></div>`).join('') || '<div class="g2-bos">Talep yok.</div>'}</div></div>
      ${r ? `<div class="g2-bolum"><div class="g2-bas">#${r.id} · ${esc(r.char_ad)} <span class="g2-ben">${esc(r.sunucu || '')} · ${esc(r.zone || '')}${r.x != null ? ` (${Math.round(r.x)}, ${Math.round(r.z)})` : ''} · ${tarih(r.olusturma)}</span></div>
        <div class="gds-soru"><b>Soru</b><p>${esc(r.metin)}</p></div>
        ${r.cevap ? `<div class="gds-onceki"><b>Cevap — ${esc(r.cevaplayan || '')} · ${tarih(r.cevap_zaman)}${r.okundu ? ' · okundu' : ' · henüz okunmadı'}</b><p>${esc(r.cevap)}</p></div>` : ''}
        <textarea name="ds-cevap" class="gds-yaz" maxlength="1000" placeholder="Cevabını yaz… (oyuncuya KO cevap penceresinde gösterilir)"></textarea>
        <div class="g2-dugmeler"><button data-k="cevapla" class="g2-ana">${r.cevap ? 'Cevabı güncelle' : 'Cevapla'}</button>
          ${r.durum !== 'kapali' ? '<button data-k="kapat" class="g2-ikincil">Kapat</button>' : '<button data-k="ac" class="g2-ikincil">Yeniden aç</button>'}
          ${gitOyuncu ? '<button data-k="oyuncu" class="g2-ikincil">Oyuncuyu aç</button>' : ''}
          <button data-k="sil" class="g2-tehlike">Sil</button></div></div>` : ''}
    </div>`;
    const ta = h.querySelector('[name=ds-cevap]'); if (ta && yazi) ta.value = yazi;
    if (ta) ta.addEventListener('keydown', (e) => e.stopPropagation());
  }
  function bagla() {
    h.addEventListener('click', async (e) => {
      const f = e.target.closest('[data-f]'); if (f) { filtre = f.dataset.f; sec = null; return yukle(); }
      const s = e.target.closest('.gds-satir'); if (s) { sec = Number(s.dataset.id); const ta = h.querySelector('[name=ds-cevap]'); if (ta) ta.value = ''; return ciz(); }
      const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
      const r = liste.find((x) => x.id === sec);
      if (k === 'yenile') return yukle();
      if (!r) return;
      try {
        if (k === 'cevapla') { const m = h.querySelector('[name=ds-cevap]')?.value.trim(); if (!m) return hud.notice?.('Cevap boş olamaz.', 'hata'); await rpc('gm_destek_cevap', { p_id: r.id, p_cevap: m }); h.querySelector('[name=ds-cevap]').value = ''; hud.info?.(`${r.char_ad} adlı oyuncuya cevap gönderildi.`, 'tamam'); }
        if (k === 'kapat') await rpc('gm_destek_durum', { p_id: r.id, p_durum: 'kapali' });
        if (k === 'ac') await rpc('gm_destek_durum', { p_id: r.id, p_durum: 'acik' });
        if (k === 'sil') { await rpc('gm_destek_durum', { p_id: r.id, p_durum: 'sil' }); sec = null; }
        if (k === 'oyuncu') return gitOyuncu?.(r.char_id);
        yukle();
      } catch {}
    });
  }
  function open(kap) {
    h = kap; bagla(); h.innerHTML = '<div class="g2-bos">Yükleniyor…</div>';
    yukle(); clearInterval(yukT); yukT = setInterval(() => { if (!h?.isConnected) return clearInterval(yukT); if (!h.querySelector('[name=ds-cevap]')?.value) yukle(); }, 20000);
  }
  return { open, sayi: async () => (await rpc('gm_destek_liste', { p_durum: 'acik' }).catch(() => null))?.acik || 0 };
}
