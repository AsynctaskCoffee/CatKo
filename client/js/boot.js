// oyun.html: KO giriş ekranı (oturum yoksa) → duyuru → sunucu seçimi → karakter seçimi/oluşturma (lobby.js) → main.js dünyayı yükler
import './tarayici-kilidi.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

window.KO_BOOT = (async () => {
  // (4.11) realtime: kalp atışı Web Worker'da (sekme arka plandayken tarayıcı zamanlayıcıları kısınca bağlantı düşmesin), 15 sn aralık,
  //   kopunca hızlı yeniden bağlanma (0,5 → 1 → 2 → 4 → en çok 5 sn)
  // (6.11) GM çoklu hesap: GM hesabıyla oyun içinden giriş yapılan sekmenin oturumu yalnız o sekmeye aittir (sessionStorage, sekmeye özel anahtar) →
  //   aynı tarayıcıda her sekmede ayrı GM hesabı; diğer sekmelerin (ve sitenin) ortak oturumuna dokunmaz, sekmeler arası oturum yayını da gelmez
  let ayrik = null; try { ayrik = sessionStorage.getItem('ko-ayrik'); } catch {}
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { ...(ayrik ? { auth: { storageKey: ayrik, storage: window.sessionStorage } } : {}), realtime: { ...(typeof Worker === 'function' ? { worker: true } : {}), heartbeatIntervalMs: 15000, reconnectAfterMs: (n) => [500, 1000, 2000, 4000][n - 1] || 5000 } });
  // sb.rpc / sb.from(...) sorgu nesneleri yalnız then'li (thenable): .catch / .finally yok → kodun her yerinde güvenle zincirlenebilsin
  { const r0 = sb.rpc.bind(sb); sb.rpc = (...a) => { const q = r0(...a); if (q && typeof q.catch !== 'function') { q.catch = (f) => Promise.resolve(q).catch(f); q.finally = (f) => Promise.resolve(q).finally(f); } return q; }; }
  const hold = () => new Promise(() => {});
  if (window.KO_CIKIS) await hold();   // geri/ileri ile gelindi: giriş ekranına yönlendiriliyor
  const { data: { session } } = await sb.auth.getSession();
  // doğrudan giriş (geliştirme): oyun.html?karakter=<id>
  const id = Number(new URLSearchParams(location.search).get('karakter'));
  let character = null;
  if (id && session) character = (await sb.from('characters').select('*').eq('id', id).eq('owner', session.user.id).maybeSingle()).data;
  if (!character) {
    const { runLobby } = await import('./lobby.js');
    character = await runLobby({ sb, session });
  }
  document.title = `${character.name} · CatKo`;
  return { sb, session, character };
})();
