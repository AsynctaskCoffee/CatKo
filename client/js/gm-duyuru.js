// GM paneli → Otomatik duyurular: sohbete belirli aralıklarla düşen sarı "#### Notice : … ####" satırları (oto-sohbet.js).
// Her duyuru: metin, aralık (dk, en az 5), ofset (dk: aynı aralıktaki duyurular üst üste binmesin), etkin, sunucu (boş = tümü), renk.
// Gösterim gerçek saate göre: dakika (UTC) − ofset, aralığın katına geldiğinde tüm oyuncularda aynı anda.
// Sunucu: oto_duyuru tablosu, gm_oto_duyuru_liste / gm_oto_duyuru_kaydet / gm_oto_duyuru_sil.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const VARSAYILAN_RENK = '#ffff3c';

export function initGmDuyuru({ sb, character, hud }) {
  let h = null, liste = [], sec = null;
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };
  const sonraki = (d) => {
    const a = Math.max(5, Number(d.aralik) || 30), o = Number(d.ofset) || 0, dk = Math.floor(Date.now() / 60000);
    const k = Math.floor((dk - o) / a) + 1, t = new Date((k * a + o) * 60000);
    return t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };
  async function yukle() { liste = (await rpc('gm_oto_duyuru_liste').catch(() => null)) || []; if (sec != null && sec !== 'yeni' && !liste.some((x) => x.id === sec)) sec = null; ciz(); }
  function ciz() {
    if (!h?.isConnected) return;
    const r = sec === 'yeni' ? { id: null, metin: '#### Notice : ', aralik: 30, ofset: 0, aktif: true, sunucu: null, renk: null } : liste.find((x) => x.id === sec);
    h.innerHTML = `<div class="g2-gomulu gdu">
      <div class="g2-bolum"><div class="g2-bas">Otomatik duyurular <span class="g2-rozet">${liste.filter((x) => x.aktif).length} etkin</span>
        <span class="gds-filtre"><button data-k="yeni" class="g2-ana">+ Yeni duyuru</button><button data-k="yenile" class="g2-ikincil" title="Yenile">⟳</button></span></div>
        <div class="gdu-liste">${liste.map((x) => `<div class="g2-tr g2-sec gdu-satir${x.id === sec ? ' secili' : ''}${x.aktif ? '' : ' gdu-pasif'}" data-id="${x.id}">
          <span class="gdu-metin" style="color:${esc(x.renk || VARSAYILAN_RENK)}">${esc(x.metin)}</span>
          <span>${x.aralik} dk${x.ofset ? ` · +${x.ofset}` : ''}</span><span>${x.sunucu ? 'Sunucu ' + x.sunucu : 'Tüm sunucular'}</span>
          <span>${x.aktif ? `Sıradaki ${sonraki(x)}` : '<em class="g2-durum">Kapalı</em>'}</span></div>`).join('') || '<div class="g2-bos">Duyuru yok. "+ Yeni duyuru" ile ekle.</div>'}</div></div>
      ${r ? `<div class="g2-bolum"><div class="g2-bas">${r.id ? '#' + r.id + ' düzenle' : 'Yeni duyuru'}</div>
        <label class="gdu-alan"><span>Metin</span><textarea name="du-metin" maxlength="300" class="gds-yaz" rows="3">${esc(r.metin)}</textarea></label>
        <div class="gdu-sira">
          <label><span>Aralık (dk)</span><input type="number" name="du-aralik" min="5" max="1440" value="${r.aralik}"></label>
          <label><span>Ofset (dk)</span><input type="number" name="du-ofset" min="0" max="1439" value="${r.ofset}"></label>
          <label><span>Sunucu</span><input type="number" name="du-sunucu" min="1" placeholder="Tümü" value="${r.sunucu ?? ''}"></label>
          <label><span>Renk</span><input type="color" name="du-renk" value="${esc(r.renk || VARSAYILAN_RENK)}"></label>
          <label class="gdu-tik"><input type="checkbox" name="du-aktif"${r.aktif ? ' checked' : ''}><span>Etkin</span></label>
        </div>
        <div class="gdu-onizle" style="color:${esc(r.renk || VARSAYILAN_RENK)}">${esc(r.metin)}</div>
        <div class="g2-dugmeler"><button data-k="kaydet" class="g2-ana">Kaydet</button>
          <button data-k="dene" class="g2-ikincil" title="Yalnız senin sohbetine bir kez yazar">Sohbette önizle</button>
          ${r.id ? '<button data-k="sil" class="g2-tehlike">Sil</button>' : ''}<button data-k="vazgec" class="g2-ikincil">Vazgeç</button></div></div>` : ''}
    </div>`;
    h.querySelectorAll('textarea, input').forEach((e) => e.addEventListener('keydown', (ev) => ev.stopPropagation()));
    const on = h.querySelector('.gdu-onizle'), ta = h.querySelector('[name=du-metin]'), rk = h.querySelector('[name=du-renk]');
    const tazele = () => { if (on) { on.textContent = ta.value; on.style.color = rk.value; } };
    ta?.addEventListener('input', tazele); rk?.addEventListener('input', tazele);
  }
  const deger = () => {
    const q = (n) => h.querySelector(`[name=${n}]`);
    const renk = q('du-renk').value.toLowerCase();
    return { p_metin: q('du-metin').value, p_aralik: Number(q('du-aralik').value) || 30, p_ofset: Number(q('du-ofset').value) || 0, p_aktif: q('du-aktif').checked,
      p_sunucu: q('du-sunucu').value ? Number(q('du-sunucu').value) : null, p_renk: renk === VARSAYILAN_RENK ? null : renk };
  };
  function bagla() {
    h.addEventListener('click', async (e) => {
      const s = e.target.closest('.gdu-satir'); if (s) { sec = Number(s.dataset.id); return ciz(); }
      const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
      try {
        if (k === 'yenile') return yukle();
        if (k === 'yeni') { sec = 'yeni'; return ciz(); }
        if (k === 'vazgec') { sec = null; return ciz(); }
        if (k === 'dene') { const v = deger(); window.dispatchEvent(new CustomEvent('ko-oto-duyuru-onizle', { detail: { metin: v.p_metin, renk: v.p_renk } })); return; }
        if (k === 'kaydet') {
          const d = await rpc('gm_oto_duyuru_kaydet', { p_id: sec === 'yeni' ? null : sec, ...deger() });
          sec = d?.id ?? sec; hud.info?.('Otomatik duyuru kaydedildi.', 'tamam');
        }
        if (k === 'sil') {
          const id = sec, sil = async () => { await rpc('gm_oto_duyuru_sil', { p_id: id }).catch(() => {}); sec = null; window.dispatchEvent(new Event('ko-oto-duyuru-yenile')); yukle(); };
          if (hud.soru) hud.soru('Otomatik duyuru', 'Bu otomatik duyuru silinsin mi?', sil, () => {}); else sil();
          return;
        }
        window.dispatchEvent(new Event('ko-oto-duyuru-yenile'));
        yukle();
      } catch {}
    });
  }
  function open(kap) { h = kap; bagla(); h.innerHTML = '<div class="g2-bos">Yükleniyor…</div>'; yukle(); }
  return { open };
}
