// KO Web paneli — tek sayfa, adres çubuğundaki #bölüm ile gezinir. Veriler Supabase'den (RLS korumalı) gelir.
import { SUPABASE_URL, SUPABASE_KEY } from './js/config.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const NATION = { 1: 'Karus', 2: 'El Morad' };
const CLASS = { 1: 'Savaşçı', 2: 'Okçu', 3: 'Büyücü', 4: 'Rahip', 13: 'Kurian' };
const SERVER = { 1: 'Ares' };
let session = null;

function flash(msg, tur = 'hata') {
  const f = $('#flash'); f.textContent = msg; f.className = 'flash ' + tur; f.hidden = false;
  clearTimeout(flash.t); flash.t = setTimeout(() => (f.hidden = true), 8000);
}
function trErr(err) {
  const m = err?.message || String(err);
  if (/Invalid login credentials/i.test(m)) return 'E-posta veya şifre hatalı.';
  if (/Email not confirmed/i.test(m)) return 'E-posta adresin henüz onaylanmadı. Gelen kutunu kontrol et.';
  if (/already registered/i.test(m)) return 'Bu e-posta ile zaten bir hesap var.';
  if (/Password should be/i.test(m)) return 'Şifre en az 6 karakter olmalı.';
  if (/rate limit|too many/i.test(m)) return 'Çok fazla deneme. Biraz sonra tekrar dene.';
  if (/same password|different from the old/i.test(m)) return 'Yeni şifre eskisinden farklı olmalı.';
  return 'Hata: ' + m;
}
const busy = (form, on) => form.querySelectorAll('button, input').forEach((el) => (el.disabled = on));

// ───────── sıralama yardımcıları
async function ranking({ nation, limit = 50 } = {}) {
  let q = sb.from('ranking').select('*').order('level', { ascending: false }).limit(limit);
  if (nation) q = q.eq('nation', nation);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
const rankTable = (rows, empty = 'Henüz karakter yok. İlk sen ol!') => `<table class="liste"><thead><tr><th class="no">#</th><th>Karakter</th><th>Ulus</th><th>Sınıf</th><th>Sunucu</th><th class="sag">Seviye</th></tr></thead><tbody>${
  rows.length ? rows.map((r, i) => `<tr class="${i < 3 ? 'ilk' : ''}"><td class="no">${i + 1}</td><td><b>${esc(r.name)}</b></td><td class="ulus-${r.nation}">${esc(NATION[r.nation])}</td><td>${esc(CLASS[r.class] || '')}</td><td>${esc(SERVER[r.server_id] || r.server_id || '')}</td><td class="sag">${r.level}</td></tr>`).join('')
  : `<tr><td colspan="6" class="bos">${empty}</td></tr>`}</tbody></table>`;
const loading = '<p class="soluk">Yükleniyor…</p>';

// ───────── bölümler
const PAGES = {
  async anasayfa(el) {
    el.innerHTML = `
      <div class="baslik-yazi">Oyundan Haberler</div>
      <div class="icerik-kutu"><h3>Ares sunucusu açıldı</h3><span class="tarih">29.09.2026</span>
        <p>Knight Online artık tarayıcında! Hesabını oluştur, oyuna gir; sunucu listesinden Ares'i seç, ulusunu ve karakterini oluştur.</p></div>
      <div class="icerik-kutu"><h3>Orijinal arayüz</h3><span class="tarih">29.09.2026</span>
        <p>Giriş, karakter seçimi, oluşturma ve oyun içi arayüz v2038 istemcisinin kendi dosyalarıyla çiziliyor.</p></div>
      <div class="icerik-kutu"><h3>Tüm haritalar</h3><span class="tarih">29.09.2026</span>
        <p>İstemcideki bütün haritalar (Luferson, El Morad, Eslant, Ronark Land, Ardream, Delos, zindanlar ve savaş alanları) sisteme eklendi.</p></div>
      <div class="baslik-yazi">En İyi 5 Kullanıcı</div>
      <div id="top5">${loading}</div>`;
    try { $('#top5', el).innerHTML = rankTable(await ranking({ limit: 5 })); } catch { $('#top5', el).innerHTML = '<p class="soluk">Sıralama yüklenemedi.</p>'; }
  },
  async siralama(el) { await siralamaSayfa(el); },
  // eski bağlantılar (menüden kaldırıldı) → tek sıralama sayfası, ilgili filtreyle
  karus() { go('siralama?ulus=1'); }, elmorad() { go('siralama?ulus=2'); }, klan() { go('siralama?tur=klan'); },
  kayit(el) {
    if (session) return go('hesap');
    el.innerHTML = `<div class="baslik-yazi">Ücretsiz Kayıt Ol</div>
      <form class="form" id="f-kayit">
        <label>Hesap adı<input name="account" required minlength="3" maxlength="20" pattern="[A-Za-z0-9]+" autocomplete="username"></label>
        <p class="ipucu">3-20 karakter, yalnızca harf ve rakam.</p>
        <label>E-posta<input type="email" name="email" required autocomplete="email"></label>
        <label>Şifre<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
        <label>Şifre (tekrar)<input type="password" name="password2" required minlength="6" autocomplete="new-password"></label>
        <button class="dugme">Hesap Oluştur</button>
      </form>`;
    $('#f-kayit', el).addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f));
      if (d.password !== d.password2) return flash('Şifreler eşleşmiyor.');
      busy(f, true);
      try {
        const { data: ok, error: e1 } = await sb.rpc('account_available', { p_account: d.account });
        if (e1) throw e1;
        if (!ok) return flash('Bu hesap adı alınmış ya da geçersiz.');
        const { data, error } = await sb.auth.signUp({ email: d.email, password: d.password, options: { data: { account: d.account }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        // (5.11) hızlı kayıt: sunucu e-postayı kayıtta onaylı sayar (auth.users hizli_kayit_onay) → oturum yoksa hemen giriş yapılır
        let ses = data.session;
        if (!ses) { const { data: g, error: e2 } = await sb.auth.signInWithPassword({ email: d.email, password: d.password }); if (e2) throw e2; ses = g.session; }
        if (!ses) flash('Hesabın oluşturuldu. Giriş yapabilirsin.', 'tamam');
        else { applySession(ses); flash('Hoş geldin! Oyuna girip karakterini oluşturabilirsin.', 'tamam'); go('hesap'); }
        f.reset();
      } catch (err) { flash(trErr(err)); } finally { busy(f, false); }
    });
  },
  giris(el) {
    if (session) return go('hesap');
    el.innerHTML = `<div class="baslik-yazi">Kullanıcı Girişi</div>
      <form class="form" id="f-giris">
        <label>ID / E-posta<input type="text" name="email" required autocomplete="username"></label>
        <label>Şifre<input type="password" name="password" required minlength="6" autocomplete="current-password"></label>
        <button class="dugme">Giriş</button>
        <p class="ipucu"><a href="#sifre">Şifremi unuttum</a> · <a href="#kayit">Kayıt ol</a></p>
      </form>`;
    $('#f-giris', el).addEventListener('submit', login);
  },
  sifre(el) {
    el.innerHTML = `<div class="baslik-yazi">Şifremi Unuttum</div>
      <form class="form" id="f-sifre"><label>Kayıtlı e-posta<input type="email" name="email" required autocomplete="email"></label>
      <p class="ipucu">Şifre yenileme bağlantısı e-postana gönderilir.</p><button class="dugme">Bağlantı Gönder</button></form>`;
    $('#f-sifre', el).addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target; busy(f, true);
      const { error } = await sb.auth.resetPasswordForEmail(new FormData(f).get('email'), { redirectTo: location.origin + location.pathname + '#yeni-sifre' });
      busy(f, false);
      if (error) flash(trErr(error)); else { flash('Bağlantı gönderildi. E-postanı kontrol et.', 'tamam'); f.reset(); }
    });
  },
  'sifre-degis'(el) { passwordForm(el, 'Şifre Değiştir'); },
  'yeni-sifre'(el) { passwordForm(el, 'Yeni Şifre Belirle'); },
  async hesap(el) {
    if (!session) return go('giris');
    el.innerHTML = `<div class="baslik-yazi">Hesabım</div>
      <div class="icerik-kutu"><p>Hesap: <b id="h-ad">…</b><br>E-posta: ${esc(session.user.email)}</p></div>
      <div class="baslik-yazi">Karakterlerim</div><div id="h-kar">${loading}</div>`;
    const [{ data: prof }, { data: chars, error }] = await Promise.all([
      sb.from('profiles').select('account').eq('id', session.user.id).maybeSingle(),
      sb.from('characters').select('name,nation,class,level,server_id,zone').eq('owner', session.user.id).order('level', { ascending: false }),
    ]);
    $('#h-ad', el).textContent = prof?.account || '—';
    $('#h-kar', el).innerHTML = error ? '<p class="soluk">Karakterler yüklenemedi.</p>' : `<table class="liste"><thead><tr><th>Karakter</th><th>Ulus</th><th>Sınıf</th><th>Sunucu</th><th class="sag">Seviye</th></tr></thead><tbody>${
      chars.length ? chars.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td class="ulus-${c.nation}">${esc(NATION[c.nation])}</td><td>${esc(CLASS[c.class] || '')}</td><td>${esc(SERVER[c.server_id] || c.server_id)}</td><td class="sag">${c.level}</td></tr>`).join('')
      : '<tr><td colspan="5" class="bos">Henüz karakterin yok — oyuna girip karakterini oluştur.</td></tr>'}</tbody></table>`;
  },
  kurallar(el) {
    el.innerHTML = `<div class="baslik-yazi">Kurallar</div><div class="icerik-kutu"><ul>
      <li>Hile, bot ve oyun açıklarını kullanmak yasaktır.</li><li>Küfür, hakaret ve reklam yapmak yasaktır.</li>
      <li>GM ve yetkili taklidi yapmak yasaktır.</li><li>Hesap paylaşımı ve hesap satışı kullanıcının sorumluluğundadır.</li>
      <li>Kurallara uymayan hesaplar uyarılmadan cezalandırılabilir.</li></ul></div>`;
  },
  indir(el) {
    el.innerHTML = `<div class="baslik-yazi">İndir</div><div class="icerik-kutu"><p>İndirmen gereken bir şey yok. Oyun tarayıcında çalışır; güncel Chrome, Edge ya da Firefox yeterli.</p>
      <a class="oyna-buyuk" href="launcher.html">OYNA</a></div>`;
  },
  async yonetici(el) { await yoneticiSayfa(el); },
  iletisim(el) { el.innerHTML = `<div class="baslik-yazi">İletişim</div><div class="icerik-kutu"><p>Soru, öneri ve hata bildirimleri için oyun içindeki sohbeti ya da topluluk kanallarını kullanabilirsin.</p></div>`; },
};

function passwordForm(el, title) {
  if (!session) return go('giris');
  el.innerHTML = `<div class="baslik-yazi">${title}</div><form class="form" id="f-yeni">
    <label>Yeni şifre<input type="password" name="p1" required minlength="6" autocomplete="new-password"></label>
    <label>Yeni şifre (tekrar)<input type="password" name="p2" required minlength="6" autocomplete="new-password"></label>
    <button class="dugme">Kaydet</button></form>`;
  $('#f-yeni', el).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f));
    if (d.p1 !== d.p2) return flash('Şifreler eşleşmiyor.');
    busy(f, true); const { error } = await sb.auth.updateUser({ password: d.p1 }); busy(f, false);
    if (error) flash(trErr(error)); else { flash('Şifren güncellendi.', 'tamam'); f.reset(); }
  });
}

async function login(e) {
  e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f));
  busy(f, true);
  // kullanıcı adı (ID) ya da e-posta: ID ise sunucu (giris_eposta) şifre doğruysa hesabın e-postasını verir
  const em = String(d.email || '').trim(); let email = em.includes('@') ? em : null;
  if (!email) { const r = await sb.rpc('giris_eposta', { p_id: em, p_sifre: d.password }); if (r.error) { busy(f, false); return flash(r.error.message); } email = r.data || `${em.toLowerCase()}@koweb.local`; }
  const { error } = await sb.auth.signInWithPassword({ email, password: d.password });
  busy(f, false);
  if (error) flash(trErr(error)); else { f.reset(); flash('Giriş yapıldı.', 'tamam'); if (['giris', 'kayit'].includes(current())) go('hesap'); }
}

import { siralamaSayfa, yoneticiSayfa, panelBagla } from './js/web-panel.js';
panelBagla({ sb, $, esc, fmt, flash, go: (p) => go(p), hashParam: () => hashParam(), oturum: () => session, loading });

// ───────── yönlendirme
const current = () => decodeURIComponent(location.hash.slice(1)).split('?')[0] || 'anasayfa';
const hashParam = () => new URLSearchParams(decodeURIComponent(location.hash.slice(1)).split('?')[1] || '');
const go = (p) => { if (decodeURIComponent(location.hash.slice(1)) === p) render(); else location.hash = p; };
function render() {
  const p = PAGES[current()] ? current() : 'anasayfa';
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('aktif', a.getAttribute('href') === '#' + p));
  const el = $('#icerik'); el.innerHTML = '';
  Promise.resolve(PAGES[p](el)).catch((err) => { el.innerHTML = '<p class="soluk">Bu bölüm yüklenemedi.</p>'; console.warn(err); });
  if (innerWidth <= 1000 && p !== 'anasayfa') $('#orta').scrollIntoView({ behavior: 'smooth' });
}
addEventListener('hashchange', render);

// ───────── yan kutular
async function sideStats() {
  const cnt = async (nation) => { let q = sb.from('ranking').select('*', { count: 'exact', head: true }); if (nation) q = q.eq('nation', nation); const { count } = await q; return count; };
  const [srv, all, k, e, top] = await Promise.all([
    sb.from('servers').select('is_open').eq('id', 1).maybeSingle(), cnt(), cnt(1), cnt(2),
    sb.from('kral').select('ulus,ad').then(({ data }) => [data?.filter((r) => r.ulus === 1) || [], data?.filter((r) => r.ulus === 2) || []], () => [[], []]),
  ]).catch(() => [null, null, null, null, [[], []]]);
  const open = srv?.data?.is_open;
  $('#b-sunucu').innerHTML = open == null ? '?' : open ? '<span class="acik">Açık</span>' : '<span class="kapali">Kapalı</span>';
  $('#b-toplam').textContent = all ?? '—'; $('#b-karus').textContent = k ?? '—'; $('#b-elmo').textContent = e ?? '—';
  $('#kral-1').textContent = top[0].map((r) => r.ad).filter(Boolean).join(', ') || '—'; $('#kral-2').textContent = top[1].map((r) => r.ad).filter(Boolean).join(', ') || '—';
  $('#anket').innerHTML = '<p class="soluk">Şu anda aktif anket yok.</p>';
}

// oyundaki kullanıcılar: oyunun genel kanalına izleyici olarak katıl (kendimizi göstermeden)
const online = new Map();
const gmIdleri = new Set(); sb.from('gms').select('char_id').then(({ data }) => data?.forEach((r) => gmIdleri.add(Number(r.char_id))), () => {});
function watchOnline() {
  const ch = sb.channel('oyun:genel', { config: { presence: { key: 'panel-' + Math.random().toString(36).slice(2) } } });
  ch.on('presence', { event: 'sync' }, () => {
    online.clear();
    for (const [key, metas] of Object.entries(ch.presenceState())) if (metas[0]?.name && !metas[0]?.gm && !gmIdleri.has(Number(key))) online.set(key, metas[0]);   // GM'ler listelenmez
    $('#b-online').textContent = fmt(online.size);
  }).subscribe();
}

// ───────── oturum
function applySession(s) {
  session = s;
  document.querySelectorAll('[data-only="uye"]').forEach((el) => (el.hidden = !s));
  document.querySelectorAll('[data-only="misafir"]').forEach((el) => (el.hidden = !!s));
  $('#gm-menu').hidden = true;
  if (s) sb.rpc('web_gm_mi').then(({ data }) => { $('#gm-menu').hidden = !data; if (!data && current() === 'yonetici') go('anasayfa'); }, () => {});
  if (s) sb.from('profiles').select('account').eq('id', s.user.id).maybeSingle().then(({ data }) => { $('#hesap-adi').textContent = data?.account || s.user.email; });
}
sb.auth.onAuthStateChange((ev, s) => {
  const was = !!session; applySession(s);
  if (ev === 'PASSWORD_RECOVERY') go('yeni-sifre');
  else if (was !== !!s && ['hesap', 'giris', 'kayit', 'sifre-degis'].includes(current())) render();
});
$('#f-giris-kisa').addEventListener('submit', login);
$('#cikis').addEventListener('click', async (e) => { e.preventDefault(); await sb.auth.signOut(); go('anasayfa'); });

const { data } = await sb.auth.getSession();
applySession(data.session);
render(); sideStats(); watchOnline(); bannerFx();

// üst banner kıvılcımları: solda altın (savaşçının mızrağı), sağda mavi (orkun baltası) ışıltılar ve küçük şimşekler
function bannerFx() {
  const c = document.querySelector('.bn-fx'); if (!c || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = c.getContext('2d'); let w = 0, h = 0, P = [], son = 0, gorunur = true;
  const R = (a, b) => a + Math.random() * (b - a);
  const boyut = () => { const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); w = r.width; h = r.height; c.width = Math.round(w * d); c.height = Math.round(h * d); ctx.setTransform(d, 0, 0, d, 0, 0); };
  boyut(); addEventListener('resize', boyut);
  new IntersectionObserver((e) => { gorunur = e[0]?.isIntersecting; }).observe(c);
  const dogur = (t) => { const mavi = t === 'mavi', altin = t === 'altin';
    return { x: (mavi ? R(.72, .95) : altin ? R(.06, .4) : R(0, 1)) * w, y: (mavi ? R(.38, .82) : altin ? R(.3, .8) : R(.4, 1)) * h, vx: R(-.35, .35), vy: R(-1, -.25),
      om: R(30, 100), max: 100, r: R(.5, 2.2), renk: mavi ? '80,195,255' : altin ? '255,203,101' : '255,160,90', kor: t === 'kor', f: R(0, 6.28) }; };
  const simsek = (x, y, mavi) => { ctx.save(); ctx.beginPath(); let px = x, py = y; ctx.moveTo(px, py); for (let i = 0; i < 5; i++) { px += R(-10, 10); py += R(-9, 9); ctx.lineTo(px, py); }
    ctx.strokeStyle = mavi ? 'rgba(105,210,255,.7)' : 'rgba(255,222,130,.55)'; ctx.shadowColor = mavi ? '#59caff' : '#ffd06b'; ctx.shadowBlur = 12; ctx.lineWidth = R(.6, 1.5); ctx.stroke(); ctx.restore(); };
  const kare = (now) => {
    requestAnimationFrame(kare);
    if (!gorunur || document.hidden || now - son < 30) return;
    const dt = Math.min((now - son) / 16.67 || 1, 2.5); son = now;
    ctx.clearRect(0, 0, w, h); ctx.globalCompositeOperation = 'lighter';
    if (Math.random() < .55) P.push(dogur('mavi')); if (Math.random() < .4) P.push(dogur('altin')); if (Math.random() < .18) P.push(dogur('kor'));
    if (P.length > 140) P.splice(0, P.length - 140);
    for (const p of P) { p.om -= dt; p.x += p.vx * dt + Math.sin(now / 800 + p.f) * .15; p.y += p.vy * dt;
      const a = Math.max(0, Math.min(1, p.om / p.max)) * .8; ctx.fillStyle = `rgba(${p.renk},${a})`; ctx.shadowBlur = p.kor ? 5 : 12; ctx.shadowColor = `rgba(${p.renk},.8)`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    P = P.filter((p) => p.om > 0); ctx.shadowBlur = 0;
    if (Math.random() < .1) simsek(R(.78, .93) * w, R(.45, .72) * h, true);
    if (Math.random() < .05) simsek(R(.12, .35) * w, R(.42, .68) * h, false);
    ctx.globalCompositeOperation = 'source-over';
  };
  requestAnimationFrame(kare);
}
