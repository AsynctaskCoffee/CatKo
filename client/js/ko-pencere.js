// KO görünümlü pencere: orijinal arayüz parçalarıyla çerçeve (assets/ui/gm/), altın başlık plakası, KO kapat düğmesi.
// Açılınca ekranın ortasına gelir; başlıktan tutulup ekranda istenen yere sürüklenir.
export function koWindow(el, { center = true } = {}) {
  el.classList.add('ko-gui');
  const place = () => {
    const r = el.getBoundingClientRect();
    el.style.left = Math.max(0, Math.round((innerWidth - r.width) / 2)) + 'px';
    el.style.top = Math.max(0, Math.round((innerHeight - r.height) / 2)) + 'px';
  };
  if (center) { el.style.visibility = 'hidden'; requestAnimationFrame(() => { place(); el.style.visibility = ''; }); }
  const bar = el.querySelector('.ay-baslik');
  if (!bar || bar.dataset.surukle) return el;
  bar.dataset.surukle = '1';
  bar.title = 'Sürükleyerek taşı';
  let d = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const r = el.getBoundingClientRect();
    d = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
    bar.setPointerCapture(e.pointerId); el.classList.add('suruklen'); e.preventDefault();
  });
  bar.addEventListener('pointermove', (e) => {
    if (!d) return;
    const x = Math.min(Math.max(-d.w + 80, e.clientX - d.dx), innerWidth - 80);
    const y = Math.min(Math.max(0, e.clientY - d.dy), innerHeight - 40);
    el.style.left = x + 'px'; el.style.top = y + 'px';
  });
  const end = () => { d = null; el.classList.remove('suruklen'); };
  bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
  return el;
}
/** pencereyi öne getir (birden çok KO penceresi açıkken) */
let z = 20;
export function toFront(el) { el.style.zIndex = String(++z); }
