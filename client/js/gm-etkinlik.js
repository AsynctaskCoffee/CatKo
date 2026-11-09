// GM paneli → Etkinlikler: EXP / Noah / Ülke puanı (NP) yüzde artışı ve 2x seviye atlama; süreli (başlangıç–bitiş) ya da devamlı.
// Sunucu oranları ödüllere uygular (_etkinlik_oran: _mob_hit EXP / Noah / seviye atlama, _pvp_oldurme NP). Aynı türde birden çok
// etkinlik etkinse yüzdeler toplanır. + Notice ayarı: oyuna ilk girişte sağdan gelen Notice penceresindeki GM metni ve günün ipucu.
// Sunucu: etkinlik, notice_ayar; gm_etkinlik_liste / gm_etkinlik_kaydet / gm_etkinlik_sil / gm_notice_kaydet.
import { etkinlikMetni, noticeGoster } from './notice.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TUR = { exp: 'EXP artışı', noah: 'Noah artışı', np: 'Ülke puanı (NP) artışı', seviye2x: '2x seviye atlama' };
const tarih = (t) => (t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
// <input type="datetime-local"> değeri (yerel saat) ↔ ISO
const yerel = (t) => { if (!t) return ''; const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const iso = (v) => (v ? new Date(v).toISOString() : null);

export function initGmEtkinlik({ sb, character, hud }) {
  let h = null, liste = [], notice = {}, sec = null;
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };
  let giris = [];
  async function yukle() { const d = await rpc('gm_etkinlik_liste').catch(() => null); if (!d) return; liste = d.liste || []; notice = d.notice || {};
    giris = (await sb.from('giris_duyuru').select('baslik,metin').order('sira').limit(3).then((r) => r.data, () => null)) || []; if (sec != null && sec !== 'yeni' && !liste.some((x) => x.id === sec)) sec = null; ciz(); }
  const durum = (x) => {
    if (!x.aktif) return '<em class="g2-durum">Kapalı</em>';
    if (x.simdi) return '<em class="g2-durum gds-cevaplandi">Sürüyor</em>';
    if (x.baslangic && new Date(x.baslangic) > new Date()) return '<em class="g2-durum gds-acik">Bekliyor</em>';
    return '<em class="g2-durum gds-kapali">Bitti</em>';
  };
  function ciz() {
    if (!h?.isConnected) return;
    const r = sec === 'yeni' ? { id: null, tur: 'exp', oran: 30, baslangic: null, bitis: null, aktif: true, sunucu: null, metin: '' } : liste.find((x) => x.id === sec);
    const devamli = r ? !r.bitis : true;
    h.innerHTML = `<div class="g2-gomulu gdu getk">
      <div class="g2-bolum"><div class="g2-bas">Etkinlikler <span class="g2-rozet">${liste.filter((x) => x.simdi).length} sürüyor</span>
        <span class="gds-filtre"><button data-k="yeni" class="g2-ana">+ Yeni etkinlik</button><button data-k="yenile" class="g2-ikincil" title="Yenile">⟳</button></span></div>
        <div class="gdu-liste">${liste.map((x) => `<div class="g2-tr g2-sec getk-satir${x.id === sec ? ' secili' : ''}${x.aktif ? '' : ' gdu-pasif'}" data-id="${x.id}">
          <span><b>${TUR[x.tur] || x.tur}</b>${x.tur !== 'seviye2x' ? ` · %${x.oran}` : ''}</span>
          <span>${x.bitis ? `${x.baslangic ? tarih(x.baslangic) : 'Şimdi'} → ${tarih(x.bitis)}` : (x.baslangic ? tarih(x.baslangic) + ' → ' : '') + 'Devamlı'}</span>
          <span>${x.sunucu ? 'Sunucu ' + x.sunucu : 'Tüm sunucular'}</span><span>${durum(x)}</span></div>`).join('') || '<div class="g2-bos">Etkinlik yok. "+ Yeni etkinlik" ile ekle.</div>'}</div></div>
      ${r ? `<div class="g2-bolum"><div class="g2-bas">${r.id ? '#' + r.id + ' düzenle' : 'Yeni etkinlik'}</div>
        <div class="gdu-sira">
          <label><span>Tür</span><select name="et-tur">${Object.entries(TUR).map(([k, a]) => `<option value="${k}"${k === r.tur ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
          <label class="et-oran"><span>Artış (%)</span><input type="number" name="et-oran" min="1" max="1000" value="${r.oran || 30}"></label>
          <label><span>Sunucu</span><input type="number" name="et-sunucu" min="1" placeholder="Tümü" value="${r.sunucu ?? ''}"></label>
          <label class="gdu-tik"><input type="checkbox" name="et-aktif"${r.aktif ? ' checked' : ''}><span>Etkin</span></label>
        </div>
        <div class="gdu-sira">
          <label><span>Başlangıç (boş = hemen)</span><input type="datetime-local" name="et-bas" value="${yerel(r.baslangic)}"></label>
          <label class="gdu-tik"><input type="checkbox" name="et-devamli"${devamli ? ' checked' : ''}><span>Devamlı (bitişsiz)</span></label>
          <label class="et-bitis"${devamli ? ' hidden' : ''}><span>Bitiş</span><input type="datetime-local" name="et-bit" value="${yerel(r.bitis)}"></label>
          <span class="et-hizli"${devamli ? ' hidden' : ''}>${[1, 3, 6, 24, 72].map((s) => `<button data-sure="${s}" class="g2-ikincil">${s < 24 ? s + ' sa' : s / 24 + ' gün'}</button>`).join('')}</span>
        </div>
        <label class="gdu-alan"><span>Notice metni (boş = otomatik KO metni)</span><input type="text" name="et-metin" maxlength="300" class="et-metin-g" value="${esc(r.metin || '')}"></label>
        <div class="gdu-onizle et-onizle" style="color:#e6c34a"></div>
        <div class="g2-dugmeler"><button data-k="kaydet" class="g2-ana">Kaydet</button>
          ${r.id ? `<button data-k="durdur" class="g2-ikincil">${r.aktif ? 'Durdur' : 'Başlat'}</button><button data-k="sil" class="g2-tehlike">Sil</button>` : ''}<button data-k="vazgec" class="g2-ikincil">Vazgeç</button></div></div>` : ''}
      <div class="g2-bolum"><div class="g2-bas">Notice penceresi <span class="g2-ben">oyuna ilk girişte, etkinlik ya da metin varsa sağdan açılır</span></div>
        <label class="gdu-alan"><span>GM notice metni (etkinlik satırlarının altında)</span><textarea name="nt-metin" maxlength="2000" class="gds-yaz" rows="3">${esc(notice.metin || '')}</textarea></label>
        <div class="gdu-sira"><label class="gdu-tik"><input type="checkbox" name="nt-aktif"${notice.aktif !== false ? ' checked' : ''}><span>GM metnini göster</span></label>
          <label class="gdu-tik"><input type="checkbox" name="nt-ipucu"${notice.ipucu_acik !== false ? ' checked' : ''}><span>[MineKO Tip of the Day!] göster</span></label></div>
        <div class="g2-dugmeler"><button data-k="nt-kaydet" class="g2-ana">Notice'i kaydet</button><button data-k="nt-onizle" class="g2-ikincil">Notice penceresini önizle</button></div></div>
      <div class="g2-bolum"><div class="g2-bas">Giriş Notice <span class="g2-ben">girişten sonra, sunucu listesinden önce (en çok 3 kutu; boş bırakılan kutu gösterilmez)</span></div>
        ${[0, 1, 2].map((i) => `<div class="gdu-sira"><label><span>Başlık ${i + 1}</span><input type="text" name="gd-b${i}" maxlength="80" value="${esc(giris[i]?.baslik || '')}" placeholder="[Welcome to MineKO]"></label></div>
        <label class="gdu-alan"><span>Metin ${i + 1}</span><textarea name="gd-m${i}" maxlength="600" class="gds-yaz" rows="2">${esc(giris[i]?.metin || '')}</textarea></label>`).join('')}
        <div class="g2-dugmeler"><button data-k="gd-kaydet" class="g2-ana">Giriş Notice'i kaydet</button></div></div>
    </div>`;
    h.querySelectorAll('textarea, input, select').forEach((e) => e.addEventListener('keydown', (ev) => ev.stopPropagation()));
    const q = (n) => h.querySelector(`[name=${n}]`);
    const tazele = () => {
      if (!q('et-tur')) return;
      const t = q('et-tur').value; h.querySelector('.et-oran').hidden = t === 'seviye2x';
      const dv = q('et-devamli').checked; h.querySelector('.et-bitis').hidden = dv; h.querySelector('.et-hizli').hidden = dv;
      h.querySelector('.et-onizle').textContent = etkinlikMetni({ tur: t, oran: Number(q('et-oran').value) || 0, bitis: dv ? null : iso(q('et-bit').value), metin: q('et-metin').value.trim() });
    };
    for (const n of ['et-tur', 'et-oran', 'et-devamli', 'et-bit', 'et-metin']) q(n)?.addEventListener('input', tazele);
    q('et-devamli')?.addEventListener('change', tazele);
    tazele();
  }
  const deger = () => {
    const q = (n) => h.querySelector(`[name=${n}]`); const dv = q('et-devamli').checked;
    return { p_tur: q('et-tur').value, p_oran: Number(q('et-oran').value) || 0, p_baslangic: iso(q('et-bas').value), p_bitis: dv ? null : iso(q('et-bit').value),
      p_aktif: q('et-aktif').checked, p_sunucu: q('et-sunucu').value ? Number(q('et-sunucu').value) : null, p_metin: q('et-metin').value };
  };
  function bagla() {
    h.addEventListener('click', async (e) => {
      const s = e.target.closest('.getk-satir'); if (s) { sec = Number(s.dataset.id); return ciz(); }
      const sure = e.target.closest('[data-sure]')?.dataset.sure;
      if (sure) { const q = (n) => h.querySelector(`[name=${n}]`); const b = q('et-bas').value ? new Date(q('et-bas').value) : new Date(); q('et-bit').value = yerel(new Date(b.getTime() + Number(sure) * 3600000)); q('et-bit').dispatchEvent(new Event('input')); return; }
      const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
      try {
        if (k === 'yenile') return yukle();
        if (k === 'yeni') { sec = 'yeni'; return ciz(); }
        if (k === 'vazgec') { sec = null; return ciz(); }
        if (k === 'kaydet') {
          const v = deger(); if (!v.p_bitis && !h.querySelector('[name=et-devamli]').checked) return hud.notice?.('Bitiş zamanı seç ya da "Devamlı"yı işaretle.', 'hata');
          const d = await rpc('gm_etkinlik_kaydet', { p_id: sec === 'yeni' ? null : sec, ...v }); sec = d?.id ?? sec; hud.info?.('Etkinlik kaydedildi.', 'tamam');
        }
        if (k === 'durdur') { const r = liste.find((x) => x.id === sec); if (r) await rpc('gm_etkinlik_kaydet', { p_id: r.id, p_tur: r.tur, p_oran: r.oran, p_baslangic: r.baslangic, p_bitis: r.bitis, p_aktif: !r.aktif, p_sunucu: r.sunucu, p_metin: r.metin }); }
        if (k === 'sil') {
          const id = sec, sil = async () => { await rpc('gm_etkinlik_sil', { p_id: id }).catch(() => {}); sec = null; yukle(); };
          if (hud.soru) hud.soru('Etkinlik', 'Bu etkinlik silinsin mi?', sil, () => {}); else sil();
          return;
        }
        if (k === 'nt-kaydet') {
          const q = (n) => h.querySelector(`[name=${n}]`);
          await rpc('gm_notice_kaydet', { p_aktif: q('nt-aktif').checked, p_metin: q('nt-metin').value, p_ipucu: q('nt-ipucu').checked }); hud.info?.('Notice kaydedildi.', 'tamam');
        }
        if (k === 'gd-kaydet') {
          const q = (n) => h.querySelector(`[name=${n}]`);
          await rpc('gm_giris_duyuru_kaydet', { p_liste: [0, 1, 2].map((i) => ({ baslik: q('gd-b' + i).value, metin: q('gd-m' + i).value })) }); hud.info?.('Giriş Notice kaydedildi.', 'tamam');
        }
        if (k === 'nt-onizle') return noticeGoster({ sb, character, zorla: true });
        yukle();
      } catch {}
    });
  }
  function open(kap) { h = kap; bagla(); h.innerHTML = '<div class="g2-bos">Yükleniyor…</div>'; yukle(); }
  return { open };
}
