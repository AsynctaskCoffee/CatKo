// (7.11) GM → Proje yönetimi → Ağ grafiği: MineKO'nun altyapı / sunucu / güvenlik / oyun / sistem bileşenleri ve aralarındaki bağımlılıklar.
// Veri sunucuda (proje_ag_dugum, proje_ag_bag, proje_ag_log; RPC proje_ag_*, yalnız GM). Bir bileşen değişince "Değişti" işaretlenir;
// ona bağlı olan (etkilenen) her şey grafikte "kontrol" halkasıyla görünür, doğrulanınca "Sağlam" yapılır — böylece bir yerde yapılan
// değişiklik diğer tarafları fark edilmeden bozmaz. Düğümler sürüklenir (konum kaydedilir), boş alan sürüklenerek kaydırılır, tekerlek /
// iki parmakla yakınlaşır. Bağ ekleme: düğüm seç → "Bağ ekle" → hedef düğüme tıkla.
const KATMAN = [
  ['altyapi', 'Altyapı', '#4f8fd6'], ['sunucu', 'Sunucu', '#9b6cd6'], ['guvenlik', 'Güvenlik', '#d65a5a'], ['oyun', 'Oyun', '#4fb06a'], ['sistem', 'Sistemler', '#d6a24f'],
];
const KRENK = Object.fromEntries(KATMAN.map(([k, , r]) => [k, r]));
const KAD = Object.fromEntries(KATMAN.map(([k, a]) => [k, a]));
const DURUM = { saglam: ['Sağlam', '#5fc77a'], degisti: ['Değişti', '#f0b43c'], riskli: ['Riskli', '#ff7b4a'], kirik: ['Kırık', '#ff4a4a'], planli: ['Planlı', '#8fa3b8'] };
const BTUR = { kullanir: ['kullanır', '#8aa0b6'], okur: ['okur', '#6fb3d9'], yazar: ['yazar', '#d98a6f'], korur: ['korur', '#e06666'], tetikler: ['tetikler', '#c9a84f'], yukler: ['yükler', '#7fc48f'] };
// etki yönü: kullanır / okur / yazar → kaynak hedefe bağımlı (hedef değişince kaynak etkilenir); korur / tetikler / yükler → kaynak hedefi etkiler
const BAGIMLI = new Set(['kullanir', 'okur', 'yazar']);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const zaman = (t) => { try { return new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export function initGmAg({ sb, character, hud }) {
  let D = [], B = [], LOG = [], yuklendi = false, kap = null, yuklemeP = null;
  let sec = null, bagModu = false, duzen = null, sekme = 'grafik';
  const AY = (() => { try { return JSON.parse(localStorage.getItem('ko-gm-ag') || '{}'); } catch { return {}; } })();
  const f = Object.assign({ ara: '', katman: KATMAN.map((k) => k[0]), durum: '', etkiGoster: true }, AY.f || {});
  let gor = Object.assign({ x: 0, y: 0, k: 0.8 }, AY.gor || {});
  const sakla = () => { try { localStorage.setItem('ko-gm-ag', JSON.stringify({ f, gor })); } catch {} };
  const rpc = async (fn, a = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...a }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };

  async function yukle() {
    const d = await rpc('proje_ag_liste').catch(() => null); if (!d) return;
    D = d.dugumler || []; B = d.baglar || []; LOG = d.log || []; yuklendi = true;
    yerlesim(false); ciz();
  }
  const byId = () => new Map(D.map((n) => [n.id, n]));

  // varsayılan yerleşim: katmanlar sütun sütun (soldan sağa altyapı → sistemler), sütun içinde türe göre
  const SUTUN = 330, SATIR = 62;
  function yerlesim(hepsi) {
    for (const [ki, [k]] of KATMAN.entries()) {
      const L = D.filter((n) => n.katman === k && (hepsi || n.x == null || n.y == null)).sort((a, b) => (a.tur + a.ad).localeCompare(b.tur + b.ad, 'tr'));
      const dolu = hepsi ? 0 : D.filter((n) => n.katman === k && n.x != null && n.y != null).length;
      L.forEach((n, i) => { n.x = ki * SUTUN + 40 + ((i + dolu) % 2) * 26; n.y = 70 + (i + dolu) * SATIR; n._yeni = true; });
    }
  }
  let konumT = 0;
  function konumKaydet(liste) {
    clearTimeout(konumT);
    konumT = setTimeout(() => rpc('proje_ag_konum', { p_konumlar: liste.map((n) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y) })) }).catch(() => {}), 500);
  }

  // etki analizi: bu düğüm değişirse etkilenenler (geçişli)
  function etkilenen(id) {
    const ileri = new Map();
    for (const b of B) {
      const [a, z] = BAGIMLI.has(b.tur) ? [b.hedef, b.kaynak] : [b.kaynak, b.hedef];
      if (!ileri.has(a)) ileri.set(a, []); ileri.get(a).push(z);
    }
    const derin = new Map([[id, 0]]), q = [id];
    while (q.length) { const x = q.shift(); for (const y of ileri.get(x) || []) if (!derin.has(y)) { derin.set(y, derin.get(x) + 1); q.push(y); } }
    derin.delete(id); return derin;
  }
  // değişti / kırık / riskli işaretli düğümlerin etkilediği (kontrol gerektiren) düğümler
  function kontrolKumesi() {
    const s = new Map();
    for (const n of D) if (n.durum === 'degisti' || n.durum === 'kirik') for (const [y] of etkilenen(n.id)) if (!s.has(y)) s.set(y, n.id);
    return s;
  }
  const gorunur = (n) => f.katman.includes(n.katman) && (!f.durum || n.durum === f.durum) &&
    (!f.ara || `${n.ad} ${n.kod} ${n.aciklama} ${(n.dosyalar || []).join(' ')}`.toLocaleLowerCase('tr').includes(f.ara.toLocaleLowerCase('tr')));

  function svgHtml() {
    const M = byId(), kontrol = f.etkiGoster ? kontrolKumesi() : new Map();
    const etki = sec ? etkilenen(sec) : null, komsu = new Set();
    if (sec) for (const b of B) { if (b.kaynak === sec) komsu.add(b.hedef); if (b.hedef === sec) komsu.add(b.kaynak); }
    const maxY = Math.max(400, ...D.map((n) => (n.y || 0) + 60));
    const seritler = KATMAN.map(([k, a, r], i) => `<g class="gag-serit"><rect x="${i * SUTUN - 10}" y="0" width="${SUTUN - 20}" height="${maxY}" rx="14" fill="${r}" fill-opacity=".06" stroke="${r}" stroke-opacity=".25"/>
      <text x="${i * SUTUN + 6}" y="34" fill="${r}" class="gag-serit-ad">${esc(a)}</text></g>`).join('');
    const kenar = B.map((b) => {
      const a = M.get(b.kaynak), z = M.get(b.hedef); if (!a || !z || !gorunur(a) || !gorunur(z)) return '';
      const ilgili = sec && (b.kaynak === sec || b.hedef === sec);
      const sol = (a.x || 0) <= (z.x || 0);
      const x1 = (a.x || 0) + (sol ? 230 : 0), y1 = (a.y || 0) + 20, x2 = (z.x || 0) + (sol ? 0 : 230), y2 = (z.y || 0) + 20;
      const dx = Math.max(60, Math.abs(x2 - x1) * 0.45) * (sol ? 1 : -1);
      const ayni = Math.abs(x1 - x2) < 40 + 230;
      const d = ayni && Math.abs((a.x || 0) - (z.x || 0)) < 100
        ? `M${(a.x || 0) + 230},${y1} C${(a.x || 0) + 300},${y1} ${(z.x || 0) + 300},${y2} ${(z.x || 0) + 230},${y2}`
        : `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      const [, renk] = BTUR[b.tur] || BTUR.kullanir;
      return `<path d="${d}" class="gag-kenar${ilgili ? ' ilgili' : ''}${sec && !ilgili ? ' soluk' : ''}" stroke="${renk}" marker-end="url(#gag-ok-${b.tur})" data-b="${b.id}"><title>${esc(a.ad)} — ${BTUR[b.tur]?.[0] || b.tur} → ${esc(z.ad)}${b.aciklama ? '\n' + esc(b.aciklama) : ''}</title></path>`;
    }).join('');
    const dugum = D.filter(gorunur).map((n) => {
      const r = KRENK[n.katman] || '#888', [dad, drenk] = DURUM[n.durum] || DURUM.saglam;
      const kon = kontrol.has(n.id) && n.durum === 'saglam', ek = etki?.has(n.id);
      const cls = ['gag-d', sec === n.id ? 'secili' : '', sec && sec !== n.id && !komsu.has(n.id) && !ek ? 'soluk' : '', ek ? 'etki' : '', kon ? 'kontrol' : ''].join(' ');
      return `<g class="${cls}" data-d="${n.id}" transform="translate(${n.x || 0},${n.y || 0})">
        ${kon ? '<rect x="-5" y="-5" width="240" height="50" rx="12" class="gag-kontrol-halka"/>' : ''}
        ${ek ? `<rect x="-4" y="-4" width="238" height="48" rx="11" class="gag-etki-halka"/>` : ''}
        <rect width="230" height="40" rx="9" class="gag-kutu" stroke="${r}"/>
        <rect width="6" height="40" rx="3" fill="${r}"/>
        <circle cx="216" cy="12" r="5" fill="${drenk}"><title>${dad}${n.durum_not ? ': ' + esc(n.durum_not) : ''}</title></circle>
        <text x="14" y="17" class="gag-ad">${esc(n.ad.length > 30 ? n.ad.slice(0, 29) + '…' : n.ad)}</text>
        <text x="14" y="32" class="gag-tur">${esc(n.tur)}${kon ? ' · kontrol gerekli' : ek ? ` · etki ${etki.get(n.id)}. derece` : ''}</text>
      </g>`;
    }).join('');
    const ok = Object.entries(BTUR).map(([k, [, r]]) => `<marker id="gag-ok-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${r}"/></marker>`).join('');
    return `<svg class="gag-svg${bagModu ? ' bag-modu' : ''}"><defs>${ok}</defs><g class="gag-kok" transform="translate(${gor.x},${gor.y}) scale(${gor.k})">${seritler}${kenar}${dugum}</g></svg>`;
  }

  function yanHtml() {
    const M = byId();
    if (duzen) {
      const n = duzen;
      return `<div class="gag-yan"><h4>${n.id ? 'Düğümü düzenle' : 'Yeni düğüm'}</h4>
        <label>Ad<input name="ag-ad" value="${esc(n.ad || '')}" maxlength="80"></label>
        <label>Kod (benzersiz, kısa)<input name="ag-kod" value="${esc(n.kod || '')}" ${n.id ? 'disabled' : ''} placeholder="ör. f_yeni"></label>
        <div class="gag-iki"><label>Katman<select name="ag-katman">${KATMAN.map(([k, a]) => `<option value="${k}" ${n.katman === k ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label>Tür<input name="ag-tur" value="${esc(n.tur || 'modul')}" list="gag-turler"><datalist id="gag-turler">${[...new Set(D.map((x) => x.tur))].map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label></div>
        <div class="gag-iki"><label>Durum<select name="ag-durum">${Object.entries(DURUM).map(([k, [a]]) => `<option value="${k}" ${n.durum === k ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label>Sürüm<input name="ag-surum" value="${esc(n.surum || '')}" placeholder="ör. mw6l…"></label></div>
        <label>Durum notu<input name="ag-dnot" value="${esc(n.durum_not || '')}" placeholder="ne değişti / neden"></label>
        <label>Açıklama<textarea name="ag-acik" rows="5">${esc(n.aciklama || '')}</textarea></label>
        <label>Dosyalar (her satıra bir)<textarea name="ag-dosya" rows="3">${esc((n.dosyalar || []).join('\n'))}</textarea></label>
        <div class="gag-dugmeler"><button data-a="kaydet" class="ana">Kaydet</button><button data-a="vazgec">Vazgeç</button></div></div>`;
    }
    if (!sec) {
      const say = (k) => D.filter((n) => n.katman === k).length;
      const kontrol = kontrolKumesi();
      return `<div class="gag-yan"><h4>MineKO ağ grafiği</h4>
        <div class="gag-ozet">${KATMAN.map(([k, a, r]) => `<div><i style="background:${r}"></i>${a}<b>${say(k)}</b></div>`).join('')}
          <div><i style="background:#ccc"></i>Bağ<b>${B.length}</b></div></div>
        <div class="gag-ozet">${Object.entries(DURUM).map(([k, [a, r]]) => `<div><i style="background:${r}"></i>${a}<b>${D.filter((n) => n.durum === k).length}</b></div>`).join('')}
          <div><i class="gag-kontrol-ornek"></i>Kontrol gerekli<b>${[...kontrol.keys()].filter((id) => M.get(id)?.durum === 'saglam').length}</b></div></div>
        <p class="gag-ipucu">Bir düğüme tıkla: ayrıntı, bağlar ve <b>etki analizi</b> (değişirse neler etkilenir). Değişiklik yaptığın bileşeni <b>Değişti</b> işaretle; ona bağlı her şey <b>kontrol gerekli</b> halkasıyla görünür. Kontrol edip <b>Doğrulandı</b> dersin.</p>
        <p class="gag-ipucu">Düğümleri sürükle (konum kaydedilir) · boş alanı sürükle: kaydır · tekerlek / iki parmak: yakınlaş.</p>
        <div class="gag-lejant">${Object.entries(BTUR).map(([, [a, r]]) => `<span><i style="background:${r}"></i>${a}</span>`).join('')}</div></div>`;
    }
    const n = M.get(sec); if (!n) { sec = null; return yanHtml(); }
    const [dad, drenk] = DURUM[n.durum] || DURUM.saglam;
    const giden = B.filter((b) => b.kaynak === n.id), gelen = B.filter((b) => b.hedef === n.id);
    const bagSatir = (b, karsi, yon) => `<li><span class="gag-bt" style="color:${BTUR[b.tur]?.[1]}">${yon === 'g' ? '' : '← '}${BTUR[b.tur]?.[0] || b.tur}${yon === 'g' ? ' →' : ''}</span>
      <a data-a="git" data-id="${karsi.id}" style="border-color:${KRENK[karsi.katman]}">${esc(karsi.ad)}</a><button data-a="bag-sil" data-id="${b.id}" title="Bağı kaldır">✕</button></li>`;
    const etki = etkilenen(n.id), etkiL = [...etki.entries()].map(([id, d]) => [M.get(id), d]).filter(([x]) => x).sort((a, b) => a[1] - b[1] || a[0].katman.localeCompare(b[0].katman));
    const kim = kontrolKumesi().get(n.id);
    return `<div class="gag-yan"><div class="gag-bas"><i style="background:${KRENK[n.katman]}"></i><div><h4>${esc(n.ad)}</h4><small>${KAD[n.katman]} · ${esc(n.tur)} · <code>${esc(n.kod)}</code></small></div></div>
      <div class="gag-durum"><span style="background:${drenk}">${dad}</span>${n.durum_not ? `<em>${esc(n.durum_not)}</em>` : ''}</div>
      ${kim && n.durum === 'saglam' ? `<div class="gag-uyari">Kontrol gerekli: <a data-a="git" data-id="${kim}">${esc(M.get(kim)?.ad)}</a> değişti; bu bileşen ondan etkileniyor.</div>` : ''}
      <p class="gag-acik">${esc(n.aciklama || '—')}</p>
      ${(n.dosyalar || []).length ? `<div class="gag-dosya">${n.dosyalar.map((d) => `<code>${esc(d)}</code>`).join('')}</div>` : ''}
      <div class="gag-dugmeler">
        ${n.durum !== 'degisti' ? '<button data-a="degisti" class="ana">Değişti işaretle</button>' : '<button data-a="dogrula" class="ana">Doğrulandı (sağlam)</button>'}
        <button data-a="bag-ekle" class="${bagModu ? 'acik' : ''}">${bagModu ? 'Hedefe tıkla…' : 'Bağ ekle'}</button>
        <button data-a="duzenle">Düzenle</button><button data-a="sil" class="tehlike">Sil</button></div>
      ${bagModu ? `<div class="gag-bagtur">Bağ türü: <select name="ag-btur">${Object.entries(BTUR).map(([k, [a]]) => `<option value="${k}">${a}</option>`).join('')}</select></div>` : ''}
      <h5>Bu bileşen kullanıyor / etkiliyor (${giden.length})</h5><ul class="gag-bl">${giden.map((b) => bagSatir(b, M.get(b.hedef) || {}, 'g')).join('') || '<li class="bos">—</li>'}</ul>
      <h5>Buna bağlı olanlar (${gelen.length})</h5><ul class="gag-bl">${gelen.map((b) => bagSatir(b, M.get(b.kaynak) || {}, 'c')).join('') || '<li class="bos">—</li>'}</ul>
      <h5>Etki analizi: değişirse etkilenen ${etkiL.length} bileşen</h5>
      <ul class="gag-etki">${etkiL.map(([x, d]) => `<li><b>${d}</b><a data-a="git" data-id="${x.id}" style="border-color:${KRENK[x.katman]}">${esc(x.ad)}</a><small>${KAD[x.katman]}</small></li>`).join('') || '<li class="bos">Hiçbir bileşen etkilenmez.</li>'}</ul>
      <small class="gag-son">Son güncelleme: ${zaman(n.guncelleme)}${n.guncelleyen ? ' · ' + esc(n.guncelleyen) : ''}${n.surum ? ' · sürüm ' + esc(n.surum) : ''}</small></div>`;
  }

  function logHtml() {
    return `<div class="gag-log">${LOG.map((l) => `<div class="gag-lsatir"><time>${zaman(l.zaman)}</time><span class="gag-lis gag-lis-${esc(l.islem)}">${esc({ ekle: 'eklendi', duzenle: 'düzenlendi', sil: 'silindi', bag: 'bağ', bag_sil: 'bağ kaldırıldı' }[l.islem] || l.islem)}</span>
      ${l.dugum_id ? `<a data-a="git" data-id="${l.dugum_id}">${esc(l.dugum_kod)}</a>` : `<code>${esc(l.dugum_kod || '')}</code>`}<span class="gag-loz">${esc(l.ozet)}</span><small>${esc(l.kim || '')}</small></div>`).join('') || '<div class="g2-bos">Kayıt yok.</div>'}</div>`;
  }

  function ciz() {
    if (!kap?.isConnected) return;
    if (!yuklendi) { kap.innerHTML = '<div class="g2-bos">Ağ grafiği yükleniyor…</div>'; return; }
    const taslak = duzen ? oku() : null; if (taslak) Object.assign(duzen, taslak);
    const yanS = kap.querySelector('.gag-yan')?.scrollTop || 0;
    kap.innerHTML = `<div class="gag">
      <div class="gag-arac">
        <div class="gag-sek"><button data-a="sek" data-s="grafik" class="${sekme === 'grafik' ? 'secili' : ''}">Grafik</button><button data-a="sek" data-s="log" class="${sekme === 'log' ? 'secili' : ''}">Değişiklik geçmişi <b>${LOG.length}</b></button></div>
        <input name="ag-ara" placeholder="Ara: ad, kod, dosya…" value="${esc(f.ara)}">
        <div class="gag-katmanlar">${KATMAN.map(([k, a, r]) => `<button data-a="katman" data-k2="${k}" class="${f.katman.includes(k) ? 'acik' : ''}" style="--r:${r}">${a}</button>`).join('')}</div>
        <select name="ag-durumf"><option value="">Tüm durumlar</option>${Object.entries(DURUM).map(([k, [a]]) => `<option value="${k}" ${f.durum === k ? 'selected' : ''}>${a}</option>`).join('')}</select>
        <label class="gag-tik"><input type="checkbox" name="ag-etki" ${f.etkiGoster ? 'checked' : ''}> Kontrol halkaları</label>
        <span class="gag-bosluk"></span>
        <button data-a="sigdir" title="Tümünü göster">Sığdır</button><button data-a="dizle" title="Varsayılan sütun yerleşimi">Yerleşimi sıfırla</button><button data-a="yeni" class="ana">+ Düğüm</button><button data-a="yenile" title="Sunucudan yenile">⟳</button>
      </div>
      <div class="gag-govde">${sekme === 'grafik' ? `<div class="gag-alan">${svgHtml()}</div>${yanHtml()}` : logHtml()}</div></div>`;
    const y = kap.querySelector('.gag-yan'); if (y) y.scrollTop = yanS;
    kap.querySelectorAll('input, textarea, select').forEach((e) => e.addEventListener('keydown', (ev) => ev.stopPropagation()));
    if (D.some((n) => n._yeni)) { const L = D.filter((n) => n._yeni); L.forEach((n) => delete n._yeni); konumKaydet(L); }
  }
  // yalnız grafiği yeniden çiz (sürükleme sırasında yan panel ve araç çubuğu yerinde kalsın)
  function grafikCiz() { const a = kap?.querySelector('.gag-alan'); if (a) a.innerHTML = svgHtml(); else ciz(); }
  const oku = () => {
    const v = (n) => kap.querySelector(`[name=${n}]`)?.value; if (v('ag-ad') == null) return null;
    return { ad: v('ag-ad'), kod: v('ag-kod'), katman: v('ag-katman'), tur: v('ag-tur'), durum: v('ag-durum'), surum: v('ag-surum'), durum_not: v('ag-dnot'), aciklama: v('ag-acik'), dosyalar: String(v('ag-dosya') || '').split('\n').map((s) => s.trim()).filter(Boolean) };
  };
  function sigdir() {
    const a = kap?.querySelector('.gag-alan'); const L = D.filter(gorunur); if (!a || !L.length) return;
    const r = a.getBoundingClientRect(), x0 = Math.min(-20, ...L.map((n) => n.x - 20)), y0 = Math.min(0, ...L.map((n) => n.y)) - 10, x1 = Math.max(...L.map((n) => n.x)) + 260, y1 = Math.max(...L.map((n) => n.y)) + 60;
    gor.k = Math.max(0.2, Math.min(1.4, Math.min(r.width / (x1 - x0), r.height / (y1 - y0)))); gor.x = -x0 * gor.k + (r.width - (x1 - x0) * gor.k) / 2; gor.y = -y0 * gor.k + 6; sakla(); grafikCiz();
  }

  async function dugumKaydet(n) {
    const r = await rpc('proje_ag_dugum_kaydet', { p_dugum: n }).catch(() => null); if (!r) return null;
    const i = D.findIndex((x) => x.id === r.id); if (i >= 0) D[i] = { ...D[i], ...r }; else D.push(r);
    rpc('proje_ag_liste').then((d) => { if (d) { LOG = d.log || LOG; if (sekme === 'log') ciz(); } }).catch(() => {});
    return r;
  }

  function bagla() {
    kap.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-a]'); const a = t?.dataset.a;
      if (!a) return;
      e.stopPropagation();
      const id = Number(t.dataset.id) || null;
      if (a === 'sek') { sekme = t.dataset.s; return ciz(); }
      if (a === 'katman') { const k = t.dataset.k2; f.katman = f.katman.includes(k) ? f.katman.filter((x) => x !== k) : [...f.katman, k]; sakla(); return ciz(); }
      if (a === 'yenile') { yuklendi = false; ciz(); return yukle(); }
      if (a === 'sigdir') return sigdir();
      if (a === 'dizle') { if (!confirm('Bütün düğümler varsayılan sütun yerleşimine dönsün mü?')) return; yerlesim(true); ciz(); return sigdir(); }
      if (a === 'yeni') { duzen = { katman: sec ? byId().get(sec)?.katman || 'sistem' : 'sistem', tur: 'modul', durum: 'saglam', dosyalar: [] }; return ciz(); }
      if (a === 'git') { sec = id; sekme = 'grafik'; duzen = null; bagModu = false; ciz(); const n = byId().get(id); const al = kap.querySelector('.gag-alan'); if (n && al) { const r = al.getBoundingClientRect(); gor.x = r.width / 2 - (n.x + 115) * gor.k; gor.y = r.height / 2 - (n.y + 20) * gor.k; sakla(); grafikCiz(); } return; }
      if (a === 'vazgec') { duzen = null; return ciz(); }
      if (a === 'kaydet') {
        const v = oku(); if (!v?.ad?.trim()) return hud.notice?.('Ad boş olamaz.', 'hata');
        const n = { ...duzen, ...v }; if (!n.id && n.x == null) { const al = kap.querySelector('.gag-alan')?.getBoundingClientRect(); n.x = al ? (al.width / 2 - gor.x) / gor.k : 100; n.y = al ? (al.height / 2 - gor.y) / gor.k : 100; }
        const r = await dugumKaydet(n); if (!r) return;
        if (!duzen.id && r.x == null) { r.x = n.x; r.y = n.y; konumKaydet([r]); }
        duzen = null; sec = r.id; hud.info?.(`Ağ grafiği: ${r.ad} kaydedildi.`, 'gm'); return ciz();
      }
      const n = byId().get(sec); if (!n) return;
      if (a === 'duzenle') { duzen = { ...n }; return ciz(); }
      if (a === 'degisti') {
        const not = prompt(`"${n.ad}" — ne değişti? (bağlı bileşenler "kontrol gerekli" olarak işaretlenir)`, n.durum_not || ''); if (not == null) return;
        await dugumKaydet({ ...n, durum: 'degisti', durum_not: not }); return ciz();
      }
      if (a === 'dogrula') { await dugumKaydet({ ...n, durum: 'saglam', durum_not: '' }); return ciz(); }
      if (a === 'bag-ekle') { bagModu = !bagModu; return ciz(); }
      if (a === 'bag-sil') { if (!confirm('Bu bağ kaldırılsın mı?')) return; const r = await rpc('proje_ag_bag_sil', { p_id: id }).catch(() => null); if (r?.ok) { B = B.filter((b) => b.id !== id); ciz(); } return; }
      if (a === 'sil') {
        const bs = B.filter((b) => b.kaynak === n.id || b.hedef === n.id).length;
        if (!confirm(`"${n.ad}" ve ${bs} bağı silinsin mi?`)) return;
        const r = await rpc('proje_ag_dugum_sil', { p_id: n.id }).catch(() => null); if (!r?.ok) return;
        D = D.filter((x) => x.id !== n.id); B = B.filter((b) => b.kaynak !== n.id && b.hedef !== n.id); sec = null; return ciz();
      }
    });
    kap.addEventListener('input', (e) => { if (e.target.name === 'ag-ara') { f.ara = e.target.value; sakla(); grafikCiz(); } });
    kap.addEventListener('change', (e) => {
      if (e.target.name === 'ag-durumf') { f.durum = e.target.value; sakla(); ciz(); }
      if (e.target.name === 'ag-etki') { f.etkiGoster = e.target.checked; sakla(); ciz(); }
    });
    // grafik: sürükle (düğüm / kaydırma), tekerlek / iki parmak yakınlaştırma, tıklama seçimi
    const P = new Map(); let surukle = null, kis = null;
    const svgNokta = (cx, cy) => { const r = kap.querySelector('.gag-svg').getBoundingClientRect(); return { x: (cx - r.left - gor.x) / gor.k, y: (cy - r.top - gor.y) / gor.k }; };
    kap.addEventListener('pointerdown', (e) => {
      const svg = e.target.closest('.gag-svg'); if (!svg) return;
      P.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (P.size === 2) { const [p1, p2] = [...P.values()]; kis = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), k: gor.k, x: gor.x, y: gor.y, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 }; surukle = null; return; }
      const g = e.target.closest('[data-d]');
      const n = g ? byId().get(Number(g.dataset.d)) : null;
      surukle = n ? { n, p0: svgNokta(e.clientX, e.clientY), x0: n.x, y0: n.y, cx: e.clientX, cy: e.clientY, oynadi: false } : { pan: true, cx: e.clientX, cy: e.clientY, gx: gor.x, gy: gor.y, oynadi: false };
      try { svg.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    kap.addEventListener('pointermove', (e) => {
      if (!P.has(e.pointerId)) return; P.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (kis && P.size >= 2) {
        const [p1, p2] = [...P.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y), r = kap.querySelector('.gag-svg').getBoundingClientRect();
        const k = Math.max(0.2, Math.min(2.5, kis.k * d / Math.max(10, kis.d))), mx = kis.mx - r.left, my = kis.my - r.top;
        gor.k = k; gor.x = mx - (mx - kis.x) * (k / kis.k) + ((p1.x + p2.x) / 2 - kis.mx); gor.y = my - (my - kis.y) * (k / kis.k) + ((p1.y + p2.y) / 2 - kis.my);
        const kk = kap.querySelector('.gag-kok'); if (kk) kk.setAttribute('transform', `translate(${gor.x},${gor.y}) scale(${gor.k})`); return;
      }
      const s = surukle; if (!s) return;
      if (!s.oynadi && Math.hypot(e.clientX - s.cx, e.clientY - s.cy) < 4) return; s.oynadi = true;
      if (s.pan) { gor.x = s.gx + e.clientX - s.cx; gor.y = s.gy + e.clientY - s.cy; const kk = kap.querySelector('.gag-kok'); if (kk) kk.setAttribute('transform', `translate(${gor.x},${gor.y}) scale(${gor.k})`); return; }
      const p = svgNokta(e.clientX, e.clientY); s.n.x = Math.round(s.x0 + p.x - s.p0.x); s.n.y = Math.round(s.y0 + p.y - s.p0.y); grafikCiz();
    });
    const birak = async (e) => {
      if (!P.delete(e.pointerId)) return;
      if (P.size < 2) kis = null;
      const s = surukle; surukle = null; if (!s) { sakla(); return; }
      if (s.oynadi) { if (s.n) konumKaydet([s.n]); sakla(); return; }
      // tıklama
      if (s.n) {
        if (bagModu && sec && sec !== s.n.id) {
          const tur = kap.querySelector('[name=ag-btur]')?.value || 'kullanir';
          const r = await rpc('proje_ag_bag_kaydet', { p_bag: { kaynak: sec, hedef: s.n.id, tur } }).catch(() => null);
          if (r) { B = B.filter((b) => b.id !== r.id); B.push(r); hud.info?.(`Bağ eklendi: ${byId().get(sec)?.ad} —${BTUR[tur][0]}→ ${s.n.ad}`, 'gm'); }
          bagModu = false; return ciz();
        }
        sec = s.n.id; duzen = null; bagModu = false; return ciz();
      }
      if (sec || bagModu) { sec = null; bagModu = false; ciz(); }
    };
    kap.addEventListener('pointerup', birak); kap.addEventListener('pointercancel', birak);
    kap.addEventListener('wheel', (e) => {
      const svg = e.target.closest('.gag-svg'); if (!svg) return; e.preventDefault();
      const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k0 = gor.k;
      gor.k = Math.max(0.2, Math.min(2.5, k0 * Math.exp(-e.deltaY * 0.0015)));
      gor.x = mx - (mx - gor.x) * (gor.k / k0); gor.y = my - (my - gor.y) * (gor.k / k0);
      const kk = kap.querySelector('.gag-kok'); if (kk) kk.setAttribute('transform', `translate(${gor.x},${gor.y}) scale(${gor.k})`);
      clearTimeout(birak.t); birak.t = setTimeout(sakla, 300);
    }, { passive: false });
  }

  return {
    /** Proje yönetimi "Ağ grafiği" sekmesi açılınca (gm-proje.js her çizimde yeni kap verir) */
    ac(el) {
      const yeniKap = kap !== el; kap = el;
      if (yeniKap) bagla();
      if (!yuklendi) { ciz(); if (!yuklemeP) yuklemeP = yukle().finally(() => { yuklemeP = null; }); return; }
      ciz();
    },
  };
}
