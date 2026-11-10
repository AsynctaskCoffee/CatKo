// CatKo ana sayfa: giriş / kayıt / sıralama (demo modunda hepsi tarayıcı içi)
import { SUPABASE_URL, SUPABASE_KEY } from './js/config.js';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const msg = (t, ok) => { const m = $('#msg'); m.textContent = t || ''; m.className = 'msg' + (ok ? ' ok' : ''); };
const tr = (e) => { const m = e?.message || String(e); return /Invalid login/i.test(m) ? 'E-posta veya şifre hatalı.' : /already registered/i.test(m) ? 'Bu e-posta ile zaten bir hesap var.' : /Password should/i.test(m) ? 'Şifre en az 6 karakter olmalı.' : 'Hata: ' + m; };

function goster(ses) {
  document.querySelectorAll('[data-only="misafir"]').forEach((e) => (e.hidden = !!ses));
  document.querySelectorAll('[data-only="uye"]').forEach((e) => (e.hidden = !ses));
  if (ses) $('#hesap-adi').textContent = ses.user?.user_metadata?.account || (ses.user?.email || '').split('@')[0];
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  $('#f-giris').hidden = b.dataset.tab !== 'giris'; $('#f-kayit').hidden = b.dataset.tab !== 'kayit'; msg('');
}));
async function gonder(form, fn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(form)); form.querySelectorAll('button,input').forEach((x) => (x.disabled = true)); msg('');
    try { await fn(d); msg('Tamam! Yönlendiriliyorsun…', true); location.href = 'launcher.html'; }
    catch (err) { msg(tr(err)); } finally { form.querySelectorAll('button,input').forEach((x) => (x.disabled = false)); }
  });
}
gonder($('#f-giris'), async (d) => { const { error } = await sb.auth.signInWithPassword({ email: d.email, password: d.password }); if (error) throw error; });
gonder($('#f-kayit'), async (d) => {
  const { data, error } = await sb.auth.signUp({ email: d.email, password: d.password, options: { data: { account: d.account } } }); if (error) throw error;
  if (!data.session) { const { error: e2 } = await sb.auth.signInWithPassword({ email: d.email, password: d.password }); if (e2) throw e2; }
});
$('#cikis').addEventListener('click', async (e) => { e.preventDefault(); await sb.auth.signOut(); goster(null); });
sb.auth.getSession().then(({ data }) => goster(data?.session || null));
try { if (window.KO_DEMO) $('#mod').textContent = 'Çevrimdışı mod: veriler bu tarayıcıda saklanır. Gerçek sunucu için adrese ?gercek=1 ekle.'; else $('#mod').textContent = 'Çevrimiçi mod'; } catch {}

(async () => {
  try {
    const { data } = await sb.from('characters').select('name,nation,level,exp').order('level', { ascending: false }).limit(10);
    if (data?.length) $('#rank').innerHTML = data.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.name)}</td><td class="${c.nation === 1 ? 'kar' : 'elm'}">${c.nation === 1 ? 'Karus' : 'El Morad'}</td><td>${c.level}</td></tr>`).join('');
  } catch {}
})();
