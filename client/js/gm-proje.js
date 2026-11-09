// GM paneli → Genel → Proje yönetimi.
// 1) Görevler ve notlar: yapılacaklar / eksiklikler / notlar / son güncellemeler; durum (Yapılacak · Yapılıyor · Beklemede · Yapıldı · Tamamlandı),
//    kendi grupların (renkli), öncelik, etiket; tür / durum / grup / öncelik / arama süzgeçleri; Liste ya da Pano (sürükle-bırak ile durum değişir).
// 2) Son güncellemeler: geliştirme notları (oyun-sistemleri-2) kategori kategori; tarih, kategori, etiket ve tam metin araması, ayrıntı görünümü.
// Sunucu: proje_grup / proje_kayit / proje_guncelleme; proje_liste, proje_kaydet, proje_durum, proje_grup_kaydet, proje_guncellemeler, proje_guncelleme_ac, proje_guncelleme_yenile.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tarihSaat = (t) => (t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const gun = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'short' }) : 'Tarihsiz');

const TUR = [['yapilacak', 'Yapılacak', '☐'], ['eksik', 'Eksiklik', '⚠'], ['not', 'Not', '✎'], ['guncelleme', 'Son güncelleme', '★']];
const DURUM = [['yapilacak', 'Yapılacak', '#64748b'], ['yapiliyor', 'Yapılıyor', '#2563eb'], ['beklemede', 'Beklemede', '#d97706'], ['yapildi', 'Yapıldı', '#7c3aed'], ['tamamlandi', 'Tamamlandı', '#16a34a']];
const ONCELIK = [[0, 'Düşük', '#94a3b8'], [1, 'Normal', '#3b82f6'], [2, 'Yüksek', '#f59e0b'], [3, 'Acil', '#dc2626']];
const KAT = { pazar: ['Pazar ve ticaret', '#0891b2'], esya: ['Eşya ve örs', '#b45309'], yetenek: ['Yetenek ve savaş', '#dc2626'], arayuz: ['Arayüz', '#2563eb'], npc: ['NPC ve görev', '#16a34a'],
  dunya: ['Dünya ve harita', '#059669'], mob: ['Mob ve pet', '#9333ea'], sosyal: ['Klan, parti ve sosyal', '#db2777'], gm: ['GM ve yönetim', '#475569'], karakter: ['Karakter ve giriş', '#ca8a04'],
  teknik: ['Teknik ve performans', '#0f766e'], diger: ['Diğer', '#6b7280'] };
const RENKLER = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#475569'];
const ad = (L, k) => L.find((x) => x[0] === k)?.[1] || k;
const renk = (L, k) => L.find((x) => x[0] === k)?.[2] || '#64748b';

// küçük markdown çizici (başlık, liste, kod, kalın, tablo)
function md(t) {
  const sat = String(t || '').split('\n'), out = []; let kod = null, liste = null, tablo = null;
  const satir = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  const kapat = () => { if (liste) { out.push(`</${liste}>`); liste = null; } if (tablo) { out.push('</table>'); tablo = null; } };
  for (const s of sat) {
    if (kod != null) { if (/^\s*```/.test(s)) { out.push(`<pre>${esc(kod.join('\n'))}</pre>`); kod = null; } else kod.push(s); continue; }
    if (/^\s*```/.test(s)) { kapat(); kod = []; continue; }
    const h = s.match(/^(#{3,6})\s+(.*)/); if (h) { kapat(); out.push(`<h${Math.min(6, h[1].length + 1)}>${satir(h[2])}</h${Math.min(6, h[1].length + 1)}>`); continue; }
    if (/^\s*\|.*\|\s*$/.test(s)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(s)) continue;
      if (!tablo) { kapat(); out.push('<table>'); tablo = 1; }
      out.push('<tr>' + s.trim().slice(1, -1).split('|').map((c) => `<td>${satir(c.trim())}</td>`).join('') + '</tr>'); continue;
    }
    const l = s.match(/^(\s*)([-*]|\d+[.)])\s+(.*)/);
    if (l) { const t2 = /\d/.test(l[2]) ? 'ol' : 'ul'; if (tablo) kapat(); if (liste !== t2) { if (liste) out.push(`</${liste}>`); out.push(`<${t2}>`); liste = t2; } out.push(`<li${l[1].length >= 2 ? ' class="gpj-ic"' : ''}>${satir(l[3])}</li>`); continue; }
    if (!s.trim()) { kapat(); continue; }
    if (liste && /^\s{2,}/.test(s)) { out.push(`<div class="gpj-devam">${satir(s.trim())}</div>`); continue; }
    kapat(); out.push(`<p>${satir(s)}</p>`);
  }
  if (kod) out.push(`<pre>${esc(kod.join('\n'))}</pre>`);
  kapat(); return out.join('');
}

export function initGmProje({ sb, character, hud }) {
  let h = null, gorunum = 'gorev', K = [], G = [], U = null, Ud = new Map(), sec = null, usec = null, yeniGrup = false, grupDuz = null;
  const AYAR = (() => { try { return JSON.parse(localStorage.getItem('ko-gm-proje') || '{}'); } catch { return {}; } })();
  const f = Object.assign({ tur: '', durum: '', grup: '', oncelik: '', ara: '', sirala: 'degistirme', pano: false, bitenGizle: false }, AYAR.f || {});
  const uf = Object.assign({ kat: '', tarih: '', ara: '', sunucuAra: '' }, AYAR.uf || {});
  gorunum = AYAR.gorunum || 'gorev';
  const sakla = () => { try { localStorage.setItem('ko-gm-proje', JSON.stringify({ f, uf, gorunum })); } catch {} };
  const rpc = async (fn, a = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...a }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };

  // (7.11) Ağ grafiği sekmesi: modül ilk açılışta yüklenir, durumu sekmeler arasında korunur
  let AG = null;
  const agAc = (el) => { if (!el) return; (AG ? Promise.resolve(AG) : import('./gm-ag.js').then((M) => (AG = M.initGmAg({ sb, character, hud })))).then((m) => { if (el.isConnected) m.ac(el); }).catch((e) => { el.innerHTML = '<div class="g2-bos">Ağ grafiği yüklenemedi.</div>'; console.warn('ağ grafiği', e); }); };
  async function yukle() { const d = await rpc('proje_liste').catch(() => null); if (!d) return; K = d.kayitlar || []; G = d.gruplar || []; ciz(); }
  async function uYukle() {
    U = (await rpc('proje_guncellemeler', { p_ara: uf.sunucuAra || null }).catch(() => null)) || [];
    if (usec && !U.some((x) => x.sira === usec)) usec = null;
    ciz();
  }
  async function uAc(sira) {
    usec = sira; ciz();
    if (!Ud.has(sira)) { const d = await rpc('proje_guncelleme_ac', { p_sira: sira }).catch(() => null); if (d) Ud.set(sira, d); if (usec === sira) ciz(); }
  }

  // ---------- Görevler
  const say = (fn) => K.filter(fn).length;
  function suz() {
    const q = f.ara.trim().toLocaleLowerCase('tr');
    let l = K.filter((k) => (!f.tur || k.tur === f.tur) && (!f.durum || k.durum === f.durum) && (f.oncelik === '' || k.oncelik === Number(f.oncelik))
      && (!f.grup || (f.grup === 'yok' ? !k.grup_id : k.grup_id === Number(f.grup))) && (!f.bitenGizle || f.durum || k.durum !== 'tamamlandi')
      && (!q || (k.baslik + ' ' + k.metin + ' ' + (k.etiketler || []).join(' ')).toLocaleLowerCase('tr').includes(q)));
    const s = { degistirme: (a, b) => (b.degistirme || '').localeCompare(a.degistirme || ''), olusturma: (a, b) => (b.olusturma || '').localeCompare(a.olusturma || ''),
      oncelik: (a, b) => b.oncelik - a.oncelik || (b.degistirme || '').localeCompare(a.degistirme || ''), baslik: (a, b) => a.baslik.localeCompare(b.baslik, 'tr'),
      durum: (a, b) => DURUM.findIndex((x) => x[0] === a.durum) - DURUM.findIndex((x) => x[0] === b.durum) || b.oncelik - a.oncelik }[f.sirala];
    return s ? l.sort(s) : l;
  }
  const grupCip = (id) => { const g = G.find((x) => x.id === id); return g ? `<em class="gpj-grup" style="--r:${esc(g.renk)};color:#fff">${esc(g.ad)}</em>` : ''; };
  const durumCip = (k) => `<em class="gpj-durum" data-durum-ac="${k.id}" style="--r:${renk(DURUM, k.durum)};color:var(--r)" title="Durumu değiştir">${ad(DURUM, k.durum)} ▾</em>`;
  const onc = (k) => `<i class="gpj-onc" style="--r:${renk(ONCELIK, k.oncelik)}" title="Öncelik: ${ad(ONCELIK, k.oncelik)}"></i>`;
  function yan() {
    const b = (grp, k, a, n, r, ek = '') => `<button class="gpj-yb${f[grp] === k ? ' secili' : ''}" data-f="${grp}" data-v="${k}">${r ? `<i class="gpj-nokta" style="--r:${r}"></i>` : ''}<span>${a}</span><b>${n}</b>${ek}</button>`;
    return `<aside class="gpj-yan">
      <div class="gpj-yt">Tür</div>${b('tur', '', 'Tümü', K.length)}${TUR.map(([k, a, s]) => b('tur', k, `${s} ${a}`, say((x) => x.tur === k))).join('')}
      <div class="gpj-yt">Durum</div>${b('durum', '', 'Tümü', K.length)}${DURUM.map(([k, a, r]) => b('durum', k, a, say((x) => x.durum === k), r)).join('')}
      <label class="gpj-tik"><input type="checkbox" data-bg${f.bitenGizle ? ' checked' : ''}> Tamamlananları gizle</label>
      <div class="gpj-yt">Gruplar <button class="gpj-mini" data-k="grup-yeni" title="Yeni grup">+</button></div>
      ${b('grup', '', 'Tümü', K.length)}
      ${G.map((g) => grupDuz === g.id ? `<div class="gpj-gform"><input name="pj-gad" maxlength="40" value="${esc(g.ad)}"><input type="color" name="pj-grenk" value="${esc(g.renk)}"><button class="gpj-mini" data-k="grup-kaydet" data-id="${g.id}">✓</button><button class="gpj-mini" data-k="grup-iptal">✕</button></div>`
        : b('grup', String(g.id), esc(g.ad), say((x) => x.grup_id === g.id), esc(g.renk), `<span class="gpj-gis"><i data-k="grup-duz" data-id="${g.id}" title="Düzenle">✎</i><i data-k="grup-sil" data-id="${g.id}" title="Sil">✕</i></span>`)).join('')}
      ${b('grup', 'yok', 'Grupsuz', say((x) => !x.grup_id), '#cbd5e1')}
      ${yeniGrup ? `<div class="gpj-gform"><input name="pj-gad" maxlength="40" placeholder="Grup adı"><input type="color" name="pj-grenk" value="${RENKLER[G.length % RENKLER.length]}"><button class="gpj-mini" data-k="grup-kaydet">✓</button><button class="gpj-mini" data-k="grup-iptal">✕</button></div>` : ''}
    </aside>`;
  }
  function satirHtml(k) {
    const t = TUR.find((x) => x[0] === k.tur);
    return `<div class="gpj-satir${sec === k.id ? ' secili' : ''}${k.durum === 'tamamlandi' ? ' bitti' : ''}" data-id="${k.id}">
      ${onc(k)}<span class="gpj-tur" title="${t?.[1] || ''}">${t?.[2] || ''}</span>
      <span class="gpj-ad"><b>${esc(k.baslik)}</b><span class="gpj-alt">${grupCip(k.grup_id)}${(k.etiketler || []).map((e) => `<em class="gpj-et">#${esc(e)}</em>`).join('')}${k.metin ? `<i>${esc(k.metin.slice(0, 140))}</i>` : ''}</span></span>
      ${durumCip(k)}<span class="gpj-zaman" title="Oluşturma: ${tarihSaat(k.olusturma)}${k.olusturan ? ' · ' + esc(k.olusturan) : ''}">${tarihSaat(k.degistirme)}</span></div>`;
  }
  function pano(l) {
    return `<div class="gpj-pano">${DURUM.map(([d, a, r]) => { const x = l.filter((k) => k.durum === d); return `<div class="gpj-kolon" data-kolon="${d}">
      <div class="gpj-kb" style="--r:${r}">${a}<b>${x.length}</b></div>
      ${x.map((k) => `<div class="gpj-kart${sec === k.id ? ' secili' : ''}" draggable="true" data-id="${k.id}">${onc(k)}<b>${TUR.find((t) => t[0] === k.tur)?.[2] || ''} ${esc(k.baslik)}</b>
        <span class="gpj-alt">${grupCip(k.grup_id)}${(k.etiketler || []).map((e) => `<em class="gpj-et">#${esc(e)}</em>`).join('')}</span></div>`).join('') || '<div class="gpj-bos-k">—</div>'}</div>`; }).join('')}</div>`;
  }
  function editor() {
    if (sec == null) return '';
    const k = sec === 'yeni' ? { tur: f.tur || 'yapilacak', durum: f.durum || 'yapilacak', grup_id: f.grup && f.grup !== 'yok' ? Number(f.grup) : null, oncelik: 1, baslik: '', metin: '', etiketler: [] } : K.find((x) => x.id === sec);
    if (!k) return '';
    const sel = (n, L, v) => `<select name="${n}">${L.map(([a, b]) => `<option value="${a}"${String(a) === String(v ?? '') ? ' selected' : ''}>${b}</option>`).join('')}</select>`;
    return `<aside class="gpj-ed">
      <div class="gpj-yt">${sec === 'yeni' ? 'Yeni kayıt' : '#' + k.id + ' düzenle'}<button class="gpj-mini" data-k="kapat" title="Kapat">✕</button></div>
      <label><span>Başlık</span><input name="pj-baslik" maxlength="200" value="${esc(k.baslik)}" placeholder="Ne yapılacak / ne eksik?"></label>
      <div class="gpj-ed2"><label><span>Tür</span>${sel('pj-tur', TUR, k.tur)}</label><label><span>Durum</span>${sel('pj-durum', DURUM, k.durum)}</label></div>
      <div class="gpj-ed2"><label><span>Grup</span>${sel('pj-grup', [['', '— Grupsuz —'], ...G.map((g) => [g.id, g.ad])], k.grup_id)}</label><label><span>Öncelik</span>${sel('pj-onc', ONCELIK, k.oncelik)}</label></div>
      <label><span>Etiketler (virgülle)</span><input name="pj-et" maxlength="200" value="${esc((k.etiketler || []).join(', '))}" placeholder="pazar, arayüz"></label>
      <label class="gpj-buyuk"><span>Ayrıntı / not</span><textarea name="pj-metin" maxlength="20000" placeholder="Ayrıntılar, adımlar, bağlantılar… (markdown: - liste, \`kod\`, **kalın**)">${esc(k.metin)}</textarea></label>
      ${k.guncelleme_sira ? `<button class="gpj-bag" data-k="gun-git" data-sira="${k.guncelleme_sira}">↗ Bağlı güncelleme notu #${k.guncelleme_sira}</button>` : ''}
      ${sec !== 'yeni' ? `<div class="gpj-meta">Oluşturan ${esc(k.olusturan || '-')} · ${tarihSaat(k.olusturma)}<br>Son değişiklik ${tarihSaat(k.degistirme)}${k.bitis ? '<br>Tamamlandı ' + tarihSaat(k.bitis) : ''}</div>` : ''}
      <div class="g2-dugmeler"><button data-k="kaydet" class="g2-ana">Kaydet</button>${sec !== 'yeni' ? '<button data-k="sil" class="g2-tehlike">Sil</button>' : ''}<button data-k="kapat" class="g2-ikincil">Vazgeç</button></div>
    </aside>`;
  }
  function gorevHtml() {
    const l = suz(), ac = DURUM.filter(([d]) => d !== 'tamamlandi').reduce((t, [d]) => t + say((x) => x.durum === d), 0);
    const tm = say((x) => x.durum === 'tamamlandi'), yuz = K.length ? Math.round((tm / K.length) * 100) : 0;
    return `<div class="gpj-govde${sec != null ? ' ed-acik' : ''}">${yan()}
      <section class="gpj-ana">
        <div class="gpj-ozet"><span><b>${K.length}</b> kayıt</span><span><b>${ac}</b> açık</span><span><b>${say((x) => x.oncelik === 3 && x.durum !== 'tamamlandi')}</b> acil</span><span class="gpj-ilerleme" title="Tamamlanan oranı"><i style="width:${yuz}%"></i><em>%${yuz} tamamlandı</em></span></div>
        <div class="gpj-arac">
          <input name="pj-ara" placeholder="Ara: başlık, not, etiket…" value="${esc(f.ara)}">
          <select name="pj-foncelik"><option value="">Tüm öncelikler</option>${ONCELIK.map(([k, a]) => `<option value="${k}"${String(f.oncelik) === String(k) ? ' selected' : ''}>${a}</option>`).join('')}</select>
          <select name="pj-sirala">${[['degistirme', 'Son değişen'], ['olusturma', 'Son eklenen'], ['oncelik', 'Öncelik'], ['durum', 'Durum'], ['baslik', 'Başlık (A-Z)']].map(([k, a]) => `<option value="${k}"${f.sirala === k ? ' selected' : ''}>${a}</option>`).join('')}</select>
          <span class="gpj-gor"><button data-k="liste" class="${f.pano ? '' : 'secili'}">☰ Liste</button><button data-k="pano" class="${f.pano ? 'secili' : ''}">▦ Pano</button></span>
          <button data-k="yeni" class="g2-ana">+ Yeni kayıt</button>
        </div>
        ${(f.tur || f.durum || f.grup || f.oncelik !== '' || f.ara) ? `<div class="gpj-aktif">Süzgeç: ${[f.tur && ad(TUR, f.tur), f.durum && ad(DURUM, f.durum), f.grup && (f.grup === 'yok' ? 'Grupsuz' : G.find((g) => g.id === Number(f.grup))?.ad), f.oncelik !== '' && ad(ONCELIK, Number(f.oncelik)), f.ara && `"${esc(f.ara)}"`].filter(Boolean).map((x) => `<em>${x}</em>`).join('')} · ${l.length} sonuç <button class="gpj-mini" data-k="temizle">Temizle</button></div>` : ''}
        ${f.pano ? pano(l) : `<div class="gpj-liste">${l.map(satirHtml).join('') || `<div class="g2-bos">${K.length ? 'Süzgece uyan kayıt yok.' : 'Henüz kayıt yok. "+ Yeni kayıt" ile yapılacakları, eksiklikleri, notları ve güncellemeleri eklemeye başla.'}</div>`}</div>`}
      </section>${editor()}</div>`;
  }

  // ---------- Son güncellemeler
  function guncHtml() {
    if (!U) return '<div class="g2-bos">Güncellemeler yükleniyor…</div>';
    const q = uf.ara.trim().toLocaleLowerCase('tr');
    const l = U.filter((x) => (!uf.kat || x.kategori === uf.kat || (x.etiketler || []).includes(uf.kat)) && (!uf.tarih || (x.tarih || '').startsWith(uf.tarih))
      && (!q || (x.baslik + ' ' + (x.ozet || '')).toLocaleLowerCase('tr').includes(q)));
    const katSay = {}; for (const x of U) katSay[x.kategori] = (katSay[x.kategori] || 0) + 1;
    const ayl = [...new Set(U.map((x) => (x.tarih || '').slice(0, 7)).filter(Boolean))].sort().reverse();
    const enCok = Math.max(1, ...Object.values(katSay));
    const gunler = new Map(); for (const x of l) { const k = x.tarih || ''; if (!gunler.has(k)) gunler.set(k, []); gunler.get(k).push(x); }
    const d = usec != null ? Ud.get(usec) : null, ds = U.find((x) => x.sira === usec);
    const bagli = usec != null ? K.filter((k) => k.guncelleme_sira === usec) : [];
    return `<div class="gpj-govde gpj-u${usec != null ? ' ed-acik' : ''}">
      <aside class="gpj-yan">
        <div class="gpj-yt">Kategori</div>
        <button class="gpj-yb${!uf.kat ? ' secili' : ''}" data-uf="kat" data-v=""><span>Tümü</span><b>${U.length}</b></button>
        ${Object.entries(KAT).filter(([k]) => katSay[k]).map(([k, [a, r]]) => `<button class="gpj-yb gpj-kat${uf.kat === k ? ' secili' : ''}" data-uf="kat" data-v="${k}"><i class="gpj-nokta" style="--r:${r}"></i><span>${a}</span><b>${katSay[k]}</b><u style="width:${Math.round((katSay[k] / enCok) * 100)}%;--r:${r}"></u></button>`).join('')}
        <div class="gpj-yt">Dönem</div>
        <button class="gpj-yb${!uf.tarih ? ' secili' : ''}" data-uf="tarih" data-v=""><span>Tüm zamanlar</span><b>${U.length}</b></button>
        ${ayl.map((a) => `<button class="gpj-yb${uf.tarih === a ? ' secili' : ''}" data-uf="tarih" data-v="${a}"><span>${new Date(a + '-01T00:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</span><b>${U.filter((x) => (x.tarih || '').startsWith(a)).length}</b></button>`).join('')}
      </aside>
      <section class="gpj-ana">
        <div class="gpj-ozet"><span><b>${U.length}</b> güncelleme notu</span><span><b>${new Set(U.map((x) => x.tarih)).size}</b> gün</span><span>Son: <b>${U[0] ? gun(U[0].tarih) : '-'}</b></span>
          <button class="gpj-mini gpj-sag" data-k="u-yenile" title="Siteye yüklenen en son notları sunucuya aktar">⟳ Notları güncelle</button></div>
        <div class="gpj-arac">
          <input name="pj-uara" placeholder="Başlıkta / özette süz…" value="${esc(uf.ara)}">
          <input name="pj-usara" placeholder="Tam metinde ara (Enter)…" value="${esc(uf.sunucuAra)}" title="Tüm not metninde arar (sunucu)">
          ${uf.sunucuAra ? '<button class="gpj-mini" data-k="u-ara-sil">✕ Tam metin</button>' : ''}
        </div>
        ${(uf.kat || uf.tarih || uf.ara || uf.sunucuAra) ? `<div class="gpj-aktif">${l.length} sonuç <button class="gpj-mini" data-k="u-temizle">Temizle</button></div>` : ''}
        <div class="gpj-liste gpj-zaman-cizgi">${[...gunler].map(([t, x]) => `<div class="gpj-gun"><div class="gpj-gb">${gun(t)} <b>${x.length}</b></div>
          ${x.map((u) => `<div class="gpj-u-satir${usec === u.sira ? ' secili' : ''}" data-sira="${u.sira}">
            <i class="gpj-nokta" style="--r:${KAT[u.kategori]?.[1] || '#6b7280'}"></i>
            <span class="gpj-ad"><b>${esc(u.baslik)}</b><span class="gpj-alt">${(u.etiketler || []).map((e) => `<em class="gpj-kc" style="--r:${KAT[e]?.[1] || '#6b7280'};color:#fff">${KAT[e]?.[0] || e}</em>`).join('')}${u.ozet ? `<i>${esc(u.ozet)}</i>` : ''}</span></span>
            <span class="gpj-boy">#${u.sira}<br>${(u.boy / 1024).toFixed(1)} KB</span></div>`).join('')}</div>`).join('') || '<div class="g2-bos">Sonuç yok.</div>'}</div>
      </section>
      ${usec != null ? `<aside class="gpj-ed gpj-oku">
        <div class="gpj-yt">#${usec} ${ds ? `<em class="gpj-kc" style="--r:${KAT[ds.kategori]?.[1]};color:#fff">${KAT[ds.kategori]?.[0] || ''}</em>` : ''}<button class="gpj-mini" data-k="u-kapat" title="Kapat">✕</button></div>
        <h3>${esc(ds?.baslik || '')}</h3><div class="gpj-meta">${gun(ds?.tarih)}</div>
        <div class="gpj-btns"><button class="g2-ikincil" data-k="u-gorev">+ Bu nottan kayıt oluştur</button>${bagli.length ? `<span>${bagli.length} bağlı kayıt: ${bagli.map((k) => `<a data-k="gorev-git" data-id="${k.id}">${esc(k.baslik)}</a>`).join(', ')}</span>` : ''}</div>
        <div class="gpj-md">${d ? md(d.metin) : 'Yükleniyor…'}</div>
      </aside>` : ''}
    </div>`;
  }

  function ciz() {
    if (!h?.isConnected) return;
    const odak = document.activeElement?.name, konum = document.activeElement?.selectionStart;
    const kayd = [...h.querySelectorAll('.gpj-liste, .gpj-yan, .gpj-md, .gpj-pano')].map((e) => e.scrollTop);
    const taslak = sec != null ? taslakOku() : null;
    h.innerHTML = `<div class="g2-gomulu gpj">
      <div class="gpj-sekme"><button data-g="gorev" class="${gorunum === 'gorev' ? 'secili' : ''}">Görevler ve notlar <b>${K.filter((k) => k.durum !== 'tamamlandi').length}</b></button>
        <button data-g="guncelleme" class="${gorunum === 'guncelleme' ? 'secili' : ''}">Son güncellemeler <b>${U ? U.length : '…'}</b></button>
        <button data-g="ag" class="${gorunum === 'ag' ? 'secili' : ''}">Ağ grafiği</button></div>
      ${gorunum === 'gorev' ? gorevHtml() : gorunum === 'ag' ? '<div class="gpj-ag"></div>' : guncHtml()}</div>`;
    if (gorunum === 'ag') agAc(h.querySelector('.gpj-ag'));   // (7.11) MineKO ağ grafiği (gm-ag.js)
    if (taslak) taslakYaz(taslak);
    [...h.querySelectorAll('.gpj-liste, .gpj-yan, .gpj-md, .gpj-pano')].forEach((e, i) => { if (kayd[i]) e.scrollTop = kayd[i]; });
    h.querySelectorAll('input, textarea, select').forEach((e) => e.addEventListener('keydown', (ev) => ev.stopPropagation()));
    if (odak) { const e = h.querySelector(`[name="${odak}"]`); if (e) { e.focus(); try { if (konum != null) e.setSelectionRange(konum, konum); } catch {} } }
  }
  const alanlar = ['pj-baslik', 'pj-tur', 'pj-durum', 'pj-grup', 'pj-onc', 'pj-et', 'pj-metin'];
  const taslakOku = () => { const o = {}; let var_ = false; for (const n of alanlar) { const e = h.querySelector(`[name=${n}]`); if (e) { o[n] = e.value; var_ = true; } } return var_ ? { sec, o } : null; };
  const taslakYaz = (t) => { if (t.sec !== sec) return; for (const [n, v] of Object.entries(t.o)) { const e = h.querySelector(`[name=${n}]`); if (e) e.value = v; } };

  async function kaydet() {
    const v = (n) => h.querySelector(`[name=${n}]`)?.value ?? '';
    const k = { id: sec === 'yeni' ? null : sec, baslik: v('pj-baslik').trim(), tur: v('pj-tur'), durum: v('pj-durum'), grup_id: v('pj-grup') || null, oncelik: Number(v('pj-onc')), metin: v('pj-metin'),
      etiketler: v('pj-et').split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean) };
    if (sec === 'yeni' && kaydet.bagli) k.guncelleme_sira = kaydet.bagli;
    if (!k.baslik) return hud.notice?.('Başlık boş olamaz.', 'hata');
    const d = await rpc('proje_kaydet', { p_kayit: k }).catch(() => null); if (!d) return;
    kaydet.bagli = null; hud.info?.(`Kaydedildi: ${d.baslik}`, 'gm');
    const i = K.findIndex((x) => x.id === d.id); if (i >= 0) K[i] = d; else K.unshift(d);
    sec = d.id; ciz();
  }
  async function durumYap(id, durum) {
    const k = K.find((x) => x.id === id); if (!k || k.durum === durum) return;
    await rpc('proje_durum', { p_id: id, p_durum: durum }).catch(() => null);
    k.durum = durum; k.degistirme = new Date().toISOString(); k.bitis = durum === 'tamamlandi' ? k.bitis || k.degistirme : null; ciz();
  }
  function durumMenu(id, el) {
    document.querySelector('.gpj-menu')?.remove();
    const r = el.getBoundingClientRect(), m = document.createElement('div'); m.className = 'gpj-menu';
    m.innerHTML = DURUM.map(([d, a, c]) => `<button data-d="${d}"><i class="gpj-nokta" style="--r:${c}"></i>${a}</button>`).join('');
    m.style.left = r.left + 'px'; m.style.top = r.bottom + 2 + 'px'; document.body.append(m);
    m.addEventListener('pointerdown', (e) => e.stopPropagation());
    m.onclick = (e) => { const b = e.target.closest('[data-d]'); if (b) durumYap(id, b.dataset.d); m.remove(); };
    setTimeout(() => addEventListener('pointerdown', () => m.remove(), { once: true }), 0);
  }

  function bagla() {
    h.addEventListener('click', async (e) => {
      const t = e.target;
      const g = t.closest('[data-g]'); if (g) { gorunum = g.dataset.g; sakla(); if (gorunum === 'guncelleme' && !U) uYukle(); return ciz(); }
      const da = t.closest('[data-durum-ac]'); if (da) { e.stopPropagation(); return durumMenu(Number(da.dataset.durumAc), da); }
      const k = t.closest('[data-k]')?.dataset.k;
      if (k) {
        const id = Number(t.closest('[data-k]').dataset.id) || null;
        if (k === 'yeni') { sec = 'yeni'; kaydet.bagli = null; return ciz(); }
        if (k === 'kapat') { sec = null; return ciz(); }
        if (k === 'kaydet') return kaydet();
        if (k === 'sil') { const r = K.find((x) => x.id === sec); if (!r || !confirm(`"${r.baslik}" silinsin mi?`)) return; await rpc('proje_durum', { p_id: r.id, p_durum: 'sil' }).catch(() => null); K = K.filter((x) => x.id !== r.id); sec = null; return ciz(); }
        if (k === 'liste' || k === 'pano') { f.pano = k === 'pano'; sakla(); return ciz(); }
        if (k === 'temizle') { Object.assign(f, { tur: '', durum: '', grup: '', oncelik: '', ara: '' }); sakla(); return ciz(); }
        if (k === 'grup-yeni') { yeniGrup = true; grupDuz = null; ciz(); return h.querySelector('[name=pj-gad]')?.focus(); }
        if (k === 'grup-iptal') { yeniGrup = false; grupDuz = null; return ciz(); }
        if (k === 'grup-duz') { e.stopPropagation(); grupDuz = id; yeniGrup = false; ciz(); return h.querySelector('[name=pj-gad]')?.focus(); }
        if (k === 'grup-kaydet') {
          const a = h.querySelector('[name=pj-gad]')?.value.trim(), r = h.querySelector('[name=pj-grenk]')?.value; if (!a) return hud.notice?.('Grup adı boş olamaz.', 'hata');
          const d = await rpc('proje_grup_kaydet', { p_id: id, p_ad: a, p_renk: r }).catch(() => null); if (!d) return;
          const i = G.findIndex((x) => x.id === d.id); if (i >= 0) G[i] = d; else G.push(d); yeniGrup = false; grupDuz = null; return ciz();
        }
        if (k === 'grup-sil') {
          e.stopPropagation(); const gr = G.find((x) => x.id === id); if (!gr || !confirm(`"${gr.ad}" grubu silinsin mi? İçindeki kayıtlar grupsuz kalır.`)) return;
          await rpc('proje_grup_kaydet', { p_id: id, p_ad: gr.ad, p_sil: true }).catch(() => null);
          G = G.filter((x) => x.id !== id); K.forEach((x) => { if (x.grup_id === id) x.grup_id = null; }); if (f.grup === String(id)) f.grup = ''; return ciz();
        }
        if (k === 'u-kapat') { usec = null; return ciz(); }
        if (k === 'u-temizle') { Object.assign(uf, { kat: '', tarih: '', ara: '' }); const s = uf.sunucuAra; uf.sunucuAra = ''; sakla(); return s ? uYukle() : ciz(); }
        if (k === 'u-ara-sil') { uf.sunucuAra = ''; sakla(); return uYukle(); }
        if (k === 'u-yenile') { const s = await rpc('proje_guncelleme_yenile').catch(() => null); if (s) hud.info?.('Güncelleme notları: ' + s, 'gm'); Ud.clear(); return uYukle(); }
        if (k === 'u-gorev') {
          const u = U.find((x) => x.sira === usec); if (!u) return;
          gorunum = 'gorev'; sec = 'yeni'; kaydet.bagli = u.sira; ciz();
          const s = (n, v) => { const el = h.querySelector(`[name=${n}]`); if (el) el.value = v; };
          s('pj-baslik', u.baslik.slice(0, 200)); s('pj-tur', 'guncelleme'); s('pj-durum', 'yapildi'); s('pj-et', (u.etiketler || []).map((x) => KAT[x]?.[0] || x).join(', '));
          return;
        }
        if (k === 'gun-git') { gorunum = 'guncelleme'; sakla(); if (!U) await uYukle(); return uAc(Number(t.closest('[data-k]').dataset.sira)); }
        if (k === 'gorev-git') { gorunum = 'gorev'; sec = id; sakla(); return ciz(); }
        return;
      }
      const yb = t.closest('[data-f]'); if (yb) { f[yb.dataset.f] = yb.dataset.v; sakla(); return ciz(); }
      const ub = t.closest('[data-uf]'); if (ub) { uf[ub.dataset.uf] = ub.dataset.v; sakla(); return ciz(); }
      const s = t.closest('.gpj-satir, .gpj-kart'); if (s) { sec = Number(s.dataset.id); kaydet.bagli = null; return ciz(); }
      const us = t.closest('.gpj-u-satir'); if (us) return uAc(Number(us.dataset.sira));
    });
    h.addEventListener('input', (e) => {
      const n = e.target.name;
      if (n === 'pj-ara') { f.ara = e.target.value; sakla(); ciz(); }
      if (n === 'pj-uara') { uf.ara = e.target.value; sakla(); ciz(); }
    });
    h.addEventListener('change', (e) => {
      const n = e.target.name;
      if (n === 'pj-foncelik') { f.oncelik = e.target.value; sakla(); ciz(); }
      if (n === 'pj-sirala') { f.sirala = e.target.value; sakla(); ciz(); }
      if (e.target.matches('[data-bg]')) { f.bitenGizle = e.target.checked; sakla(); ciz(); }
    });
    h.addEventListener('keydown', (e) => {
      if (e.target.name === 'pj-usara' && e.key === 'Enter') { uf.sunucuAra = e.target.value.trim(); sakla(); uYukle(); }
      if (e.target.name === 'pj-gad' && e.key === 'Enter') h.querySelector('[data-k="grup-kaydet"]')?.click();
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && sec != null) { e.preventDefault(); kaydet(); }
    });
    // pano: sürükle-bırak ile durum değiştir
    h.addEventListener('dragstart', (e) => { const c = e.target.closest?.('.gpj-kart'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('suruk'); } });
    h.addEventListener('dragend', (e) => e.target.closest?.('.gpj-kart')?.classList.remove('suruk'));
    h.addEventListener('dragover', (e) => { const k = e.target.closest?.('.gpj-kolon'); if (k) { e.preventDefault(); h.querySelectorAll('.gpj-kolon.ust').forEach((x) => x !== k && x.classList.remove('ust')); k.classList.add('ust'); } });
    h.addEventListener('drop', (e) => { const k = e.target.closest?.('.gpj-kolon'); h.querySelectorAll('.gpj-kolon.ust').forEach((x) => x.classList.remove('ust')); if (!k) return; e.preventDefault(); durumYap(Number(e.dataTransfer.getData('text/plain')), k.dataset.kolon); });
  }
  function open(kap) {
    h = kap; h.innerHTML = '<div class="g2-bos">Yükleniyor…</div>'; bagla();
    yukle(); uYukle();
  }
  return { open };
}
