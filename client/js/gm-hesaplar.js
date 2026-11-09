// GM paneli → Oyuncular → Hesaplar: oyuncu hesapları (kullanıcı adı, e-posta, karakterler, durum) ve hesap işlemleri.
// Şifreler veritabanında tek yönlü özet (bcrypt) olarak durur — kimse (GM dahil) okuyamaz; GM yeni şifre belirler ya da sıfırlama bağlantısı yollar.
// Sunucu: gm_hesap_liste (her GM görür), gm_hesap_islem (yalnız Yönetici rütbesi): ad / sifre / eposta / oturum / kilit / sifirlama; her işlem gm_hesap_log'a yazılır.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const zaman = (t) => (t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const ULUS = { 1: 'Karus', 2: 'El Morad' };
const ISLEM = { ad: 'Kullanıcı adı', sifre: 'Şifre', eposta: 'E-posta', oturum: 'Oturum kapatma', kilit: 'Giriş kilidi', sifirlama: 'Sıfırlama bağlantısı' };

export function initGmHesaplar({ sb, character, hud }) {
  let h = null, L = [], toplam = 0, yonetici = false, sec = null, ara = '', durum = '', sayfa = 0, form = null, aT = 0, yukleniyor = false;
  const rpc = async (fn, a = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...a }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };

  async function yukle() {
    yukleniyor = true; ciz();
    const d = await rpc('gm_hesap_liste', { p_ara: ara || null, p_sayfa: sayfa, p_durum: durum || null }).catch(() => null);
    yukleniyor = false; if (!d) return ciz();
    L = d.liste || []; toplam = d.toplam || 0; yonetici = !!d.yonetici;
    if (sec && !L.some((x) => x.id === sec)) sec = null;
    ciz();
  }
  const rozet = (x) => [x.cevrimici && '<em style="color:#fff" class="gh-r yesil">Oyunda</em>', x.gm && '<em style="color:#fff" class="gh-r mavi">GM</em>', x.yasak && '<em style="color:#fff" class="gh-r kirmizi">Yasaklı</em>', x.silindi && '<em style="color:#fff" class="gh-r gri">Silinmiş</em>', x.yerel && '<em style="color:#fff" class="gh-r gri" title="Gerçek e-posta tanımlı değil (ad@koweb.local)">E-postasız</em>'].filter(Boolean).join('');

  function detay() {
    const x = L.find((y) => y.id === sec); if (!x) return '<aside class="gh-detay gh-bos">Soldan bir hesap seç.</aside>';
    const kilitli = !yonetici ? ' disabled title="Yalnız Yönetici rütbesindeki GM"' : '';
    const f = (k, etiket, tip, yer, deger = '') => form === k ? `<div class="gh-form"><input name="gh-deger" type="${tip}" placeholder="${esc(yer)}" value="${esc(deger)}" autocomplete="off" maxlength="72">
      ${tip === 'password' ? '<button class="gpj-mini" data-k="goster" title="Göster / gizle">👁</button><button class="gpj-mini" data-k="uret" title="Rastgele güçlü şifre">⚄</button>' : ''}
      <button class="g2-ana" data-k="uygula" data-islem="${k}">Kaydet</button><button class="g2-ikincil" data-k="vazgec">Vazgeç</button></div>` : '';
    return `<aside class="gh-detay">
      <div class="gh-bas"><b>${esc(x.hesap)}</b>${rozet(x)}</div>
      <table class="gh-tablo">
        <tr><td>Kullanıcı adı</td><td><b>${esc(x.hesap)}</b></td><td><button class="g2-ikincil" data-k="form" data-f="ad"${kilitli}>Değiştir</button></td></tr>
        ${form === 'ad' ? `<tr><td colspan="3">${f('ad', 'Kullanıcı adı', 'text', 'Yeni kullanıcı adı (3-20, harf / rakam / _)', x.hesap)}</td></tr>` : ''}
        <tr><td>Şifre</td><td><span class="gh-soluk">•••••••• (şifreler okunamaz, yalnız yenisi belirlenir)</span></td><td><button class="g2-ikincil" data-k="form" data-f="sifre"${kilitli}>Yeni şifre</button></td></tr>
        ${form === 'sifre' ? `<tr><td colspan="3">${f('sifre', 'Şifre', 'password', 'Yeni şifre (en az 6 karakter)')}<div class="gh-not">Kaydedince hesabın açık oturumları kapanır, oyundaysa oyundan atılır.</div></td></tr>` : ''}
        <tr><td>E-posta</td><td>${esc(x.eposta)}${x.yerel ? ' <span class="gh-soluk">(gerçek e-posta yok)</span>' : x.onayli ? '' : ' <span class="gh-soluk">(onaysız)</span>'}</td><td><button class="g2-ikincil" data-k="form" data-f="eposta"${kilitli}>Değiştir</button></td></tr>
        ${form === 'eposta' ? `<tr><td colspan="3">${f('eposta', 'E-posta', 'email', 'yeni@eposta.com', x.yerel ? '' : x.eposta)}</td></tr>` : ''}
        <tr><td>Oluşturma</td><td colspan="2">${zaman(x.olusturma)}</td></tr>
        <tr><td>Son giriş</td><td colspan="2">${zaman(x.son_giris)}</td></tr>
        ${x.yasak ? `<tr><td>Yasak</td><td colspan="2">${esc(x.yasak.neden || '-')} · ${x.yasak.bitis ? 'bitiş ' + zaman(x.yasak.bitis) : 'kalıcı'}</td></tr>` : ''}
      </table>
      <div class="gh-alt">Hesap işlemleri</div>
      <div class="g2-dugmeler gh-islemler">
        <button class="g2-ikincil" data-k="sifirlama"${kilitli}${x.yerel ? ' disabled title="Gerçek e-posta yok: önce e-posta tanımla ya da yeni şifre belirle"' : ''}>✉ Sıfırlama bağlantısı gönder</button>
        <button class="g2-ikincil" data-k="oturum"${kilitli}>⏏ Tüm oturumları kapat</button>
        <button class="g2-ikincil" data-k="kilit"${kilitli} title="10 hatalı giriş sonrası 10 dakikalık kilidi kaldırır">🔓 Giriş kilidini kaldır</button>
      </div>
      <div class="gh-alt">Karakterler (${x.karakterler.length})</div>
      <div class="gh-kar">${x.karakterler.map((c) => `<div><b>${esc(c.ad)}</b><span>Lv ${c.seviye} · ${ULUS[c.ulus] || '-'} · ${esc(c.bolge || '-')}</span></div>`).join('') || '<span class="gh-soluk">Karakter yok.</span>'}</div>
      <div class="gh-alt">Son GM işlemleri</div>
      <div class="gh-log">${x.kayit.map((k) => `<div><span>${zaman(k.zaman)}</span><b>${esc(ISLEM[k.islem] || k.islem)}</b><i>${esc(k.detay || '')}</i><em>${esc(k.gm || '')}</em></div>`).join('') || '<span class="gh-soluk">Kayıt yok.</span>'}</div>
      ${!yonetici ? '<div class="gh-not">Hesap işlemleri yalnız Yönetici rütbesindeki GM içindir; bu rütbede değilsin (yalnız görüntüleme).</div>' : ''}
    </aside>`;
  }
  function ciz() {
    if (!h?.isConnected) return;
    const odak = document.activeElement?.name, konum = document.activeElement?.selectionStart, deger = h.querySelector('[name=gh-deger]')?.value;
    const kay = h.querySelector('.gh-liste')?.scrollTop || 0;
    const sayfaSay = Math.max(1, Math.ceil(toplam / 50));
    h.innerHTML = `<div class="g2-gomulu gh">
      <div class="gh-arac">
        <input name="gh-ara" placeholder="Ara: kullanıcı adı, e-posta ya da karakter adı…" value="${esc(ara)}">
        <select name="gh-durum">${[['', 'Tüm hesaplar'], ['cevrimici', 'Oyunda'], ['gm', 'GM hesapları'], ['yasakli', 'Yasaklı'], ['silinen', 'Silinmiş']].map(([k, a]) => `<option value="${k}"${durum === k ? ' selected' : ''}>${a}</option>`).join('')}</select>
        <span class="gh-soluk">${yukleniyor ? 'Yükleniyor…' : `${toplam} hesap`}</span>
        <span class="gh-sayfa"><button class="gpj-mini" data-k="onceki"${sayfa <= 0 ? ' disabled' : ''}>◀</button> ${sayfa + 1} / ${sayfaSay} <button class="gpj-mini" data-k="sonraki"${sayfa + 1 >= sayfaSay ? ' disabled' : ''}>▶</button></span>
      </div>
      <div class="gh-govde">
        <div class="gh-liste">${L.map((x) => `<div class="gh-satir${sec === x.id ? ' secili' : ''}" data-id="${x.id}">
          <span class="gh-ad"><b>${esc(x.hesap)}</b>${rozet(x)}<i>${esc(x.yerel ? '' : x.eposta)}</i></span>
          <span class="gh-kc">${x.karakterler.slice(0, 3).map((c) => esc(c.ad)).join(', ')}${x.karakterler.length > 3 ? ' +' + (x.karakterler.length - 3) : ''}</span>
          <span class="gh-zaman" title="Son giriş">${zaman(x.son_giris)}</span></div>`).join('') || `<div class="g2-bos">${yukleniyor ? 'Yükleniyor…' : 'Hesap bulunamadı.'}</div>`}</div>
        ${detay()}
      </div></div>`;
    const l = h.querySelector('.gh-liste'); if (l) l.scrollTop = kay;
    h.querySelectorAll('input, select').forEach((e) => e.addEventListener('keydown', (ev) => ev.stopPropagation()));
    if (deger != null) { const e = h.querySelector('[name=gh-deger]'); if (e) e.value = deger; }
    if (odak) { const e = h.querySelector(`[name="${odak}"]`); if (e) { e.focus(); try { if (konum != null) e.setSelectionRange(konum, konum); } catch {} } }
  }
  const uret = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; return Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => a[n % a.length]).join(''); };
  async function islem(k, deger = null) {
    const x = L.find((y) => y.id === sec); if (!x) return;
    if (k === 'sifirlama') {
      if (!confirm(`${x.hesap} hesabının e-postasına (${x.eposta}) şifre sıfırlama bağlantısı gönderilsin mi?`)) return;
      const d = await rpc('gm_hesap_islem', { p_hedef: x.id, p_islem: 'sifirlama' }).catch(() => null); if (!d) return;
      const yer = new URL('index.html', location.href); yer.hash = 'yeni-sifre';
      const { error } = await sb.auth.resetPasswordForEmail(d.eposta, { redirectTo: yer.href });
      if (error) return hud.notice?.(`Bağlantı gönderilemedi: ${error.message}`, 'hata');
      hud.info?.(`Şifre sıfırlama bağlantısı gönderildi: ${d.eposta}`, 'gm'); return yukle();
    }
    if (k === 'oturum' && !confirm(`${x.hesap} hesabının tüm oturumları kapatılsın mı? Oyundaysa oyundan atılır.`)) return;
    if (k === 'sifre' && !confirm(`${x.hesap} hesabının şifresi değiştirilsin mi? Açık oturumları kapanır.`)) return;
    const d = await rpc('gm_hesap_islem', { p_hedef: x.id, p_islem: k, p_deger: deger }).catch(() => null); if (!d) return;
    if (k === 'sifre') {   // belirlenen şifre panoya (oyuncuya iletmek için); ekranda tutulmaz
      try { await navigator.clipboard.writeText(deger); hud.info?.(`${x.hesap}: yeni şifre belirlendi ve panoya kopyalandı.`, 'gm'); } catch { hud.info?.(`${x.hesap}: yeni şifre belirlendi.`, 'gm'); }
    } else hud.info?.(`${x.hesap}: ${ISLEM[k]} — ${d.detay || 'tamam'}`, 'gm');
    form = null; await yukle();
  }
  function bagla() {
    h.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]'); const s = e.target.closest('.gh-satir');
      if (b && !b.disabled) {
        const k = b.dataset.k;
        if (k === 'onceki') { sayfa = Math.max(0, sayfa - 1); return yukle(); }
        if (k === 'sonraki') { sayfa++; return yukle(); }
        if (k === 'form') { form = form === b.dataset.f ? null : b.dataset.f; ciz(); const i = h.querySelector('[name=gh-deger]'); i?.focus(); if (form === 'sifre' && i) i.value = ''; return; }
        if (k === 'vazgec') { form = null; return ciz(); }
        if (k === 'goster') { const i = h.querySelector('[name=gh-deger]'); if (i) i.type = i.type === 'password' ? 'text' : 'password'; return; }
        if (k === 'uret') { const i = h.querySelector('[name=gh-deger]'); if (i) { i.value = uret(); i.type = 'text'; } return; }
        if (k === 'uygula') { const v = h.querySelector('[name=gh-deger]')?.value || ''; return islem(b.dataset.islem, v); }
        if (['sifirlama', 'oturum', 'kilit'].includes(k)) return islem(k);
        return;
      }
      if (s) { sec = s.dataset.id; form = null; ciz(); }
    });
    h.addEventListener('input', (e) => { if (e.target.name === 'gh-ara') { ara = e.target.value; sayfa = 0; clearTimeout(aT); aT = setTimeout(yukle, 300); } });
    h.addEventListener('change', (e) => { if (e.target.name === 'gh-durum') { durum = e.target.value; sayfa = 0; yukle(); } });
    h.addEventListener('keydown', (e) => { if (e.target.name === 'gh-deger' && e.key === 'Enter') h.querySelector('[data-k=uygula]')?.click(); if (e.target.name === 'gh-deger' && e.key === 'Escape') { form = null; ciz(); } });
  }
  function open(kap) { h = kap; bagla(); yukle(); }
  return { open };
}
