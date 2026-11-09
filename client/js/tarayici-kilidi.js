// Oyun ekranında tarayıcıya özgü davranışları kapatır: sağ tık menüsü, orta tıkla yeni sekme,
// resim/bağlantı sürükleme, metin seçimi, Ctrl+S/P/U/F gibi tarayıcı pencereleri. Yazı alanları (input/textarea) serbest.
const yaziAlani = (t) => !!t?.closest?.('input, textarea, [contenteditable="true"]');
addEventListener('contextmenu', (e) => { if (!yaziAlani(e.target)) e.preventDefault(); }, true);
addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); }, true);
addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }, true);   // orta tık kaydırma / yeni sekme
addEventListener('dragstart', (e) => { if (!yaziAlani(e.target)) e.preventDefault(); }, true);
addEventListener('selectstart', (e) => { if (!yaziAlani(e.target)) e.preventDefault(); }, true);
addEventListener('click', (e) => { const a = e.target.closest?.('a[href]'); if (a && (e.ctrlKey || e.shiftKey || e.metaKey)) e.preventDefault(); }, true);
addEventListener('keydown', (e) => {
  const k = e.key?.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'u', 'o', 'g', 'j', 'h', 'd', 'f'].includes(k) && !(k === 'f' && yaziAlani(e.target))) e.preventDefault();
  if (k === 'f3' || k === 'f7' || (k === 'backspace' && !yaziAlani(e.target))) e.preventDefault();
}, true);
// Ctrl + tekerlek ile sayfa yakınlaştırma
addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false, capture: true });
document.documentElement.style.userSelect = 'none';
document.documentElement.style.webkitUserSelect = 'none';

// KO: oyun tarayıcı geçmişinde açık kalmaz. Geri / ileri tuşuna basılınca (ya da sayfa geçmişten / önbellekten geri gelince)
// oyun kapanır, oturum bırakılır ve giriş penceresine dönülür (oyun.html?cikis=1 → lobby.js oturumu kapatır).
const CIKIS = 'oyun.html?cikis=1';
let cikildi = false;
const oyundanCik = () => { if (cikildi) return; cikildi = true; window.KO_CIKIS = true; location.replace(CIKIS); };
{
  const nav = performance.getEntriesByType?.('navigation')?.[0];
  if (nav?.type === 'back_forward' && !/[?&]cikis=/.test(location.search)) oyundanCik();
  // oyundayken sayfa yenilenirse (F5 / Ctrl+R / yenile düğmesi) otomatik oyuna girilmez: oturum kapanır, giriş ekranına dönülür
  // (oyunun kendi geçişleri location.replace kullanır → 'navigate', yenileme sayılmaz)
  if (nav?.type === 'reload' && /[?&]karakter=/.test(location.search) && !/[?&]cikis=/.test(location.search)) oyundanCik();
}
addEventListener('pageshow', (e) => { if (e.persisted) oyundanCik(); });   // tarayıcının ileri-geri önbelleğinden geri yüklendi
if (!/[?&]cikis=/.test(location.search)) {
  history.pushState({ ko: 1 }, '', location.href);   // geri tuşu önce bu kaydı tüketir → popstate
  addEventListener('popstate', oyundanCik);
}
