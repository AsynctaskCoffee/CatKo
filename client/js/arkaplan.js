// Arka plan sekmesi: oyun durmaz (KO'da aksiyon her zaman anlık sürer).
// Tarayıcılar gizli sekmede requestAnimationFrame'i tamamen durdurur, setTimeout/setInterval'ı önce 1 sn'ye,
// 5 dk sonra dakikada bire (Chrome "intensive throttling") indirir. Web Worker zamanlayıcıları bu kısıtlamaya
// girmez: tüm zamanlayıcılar bir worker üzerinden çalıştırılır, gizliyken rAF ~20 Hz worker adımına çevrilir.
// (Görüntü çizimi gizliyken atlanır — main.js document.hidden'a bakar; mantık, ağ, savaş, oklar sürer.)
const KOD = `const t = new Map();
onmessage = (e) => { const [k, id, ms] = e.data;
  if (k === 's') t.set(id, setTimeout(() => { t.delete(id); postMessage(id); }, ms));
  else if (k === 'i') t.set(id, setInterval(() => postMessage(id), ms));
  else { clearTimeout(t.get(id)); clearInterval(t.get(id)); t.delete(id); } };`;

let w = null;
try { w = new Worker(URL.createObjectURL(new Blob([KOD], { type: 'text/javascript' }))); } catch { w = null; }

if (w && !window.__koArkaplan) {
  window.__koArkaplan = true;
  const G = window, oSt = G.setTimeout.bind(G), oCt = G.clearTimeout.bind(G), oSi = G.setInterval.bind(G), oCi = G.clearInterval.bind(G);
  const oRaf = G.requestAnimationFrame.bind(G), oCaf = G.cancelAnimationFrame.bind(G);
  const isler = new Map();   // id → { fn, args, tekrar }
  let sira = 1e6;            // tarayıcının kimlikleriyle çakışmasın
  w.onmessage = (e) => {
    const i = isler.get(e.data); if (!i) return;
    if (!i.tekrar) isler.delete(e.data);
    try { typeof i.fn === 'function' ? i.fn(...i.args) : (0, eval)(String(i.fn)); } catch (err) { oSt(() => { throw err; }); }
  };
  const kur = (fn, ms, args, tekrar) => { const id = ++sira; isler.set(id, { fn, args, tekrar }); w.postMessage([tekrar ? 'i' : 's', id, Math.max(0, Number(ms) || 0)]); return id; };
  const sil = (id) => { if (isler.delete(id)) w.postMessage(['c', id]); };
  G.setTimeout = (fn, ms, ...args) => kur(fn, ms, args, false);
  G.setInterval = (fn, ms, ...args) => kur(fn, Math.max(4, Number(ms) || 0), args, true);
  G.clearTimeout = (id) => { if (isler.has(id)) sil(id); else oCt(id); };
  G.clearInterval = (id) => { if (isler.has(id)) sil(id); else oCi(id); };

  // requestAnimationFrame: görünürken gerçek kare; gizliyken 50 ms worker adımı. Gizlenme anında bekleyen
  // kareler de worker'a taşınır (yoksa sekme geri gelene dek hiç çalışmazlar).
  const kareler = new Map();   // bizim kimlik → { fn, raf, zam }
  let kSira = 0;
  const calistir = (k, t) => { const c = kareler.get(k); if (!c) return; kareler.delete(k); c.fn(t ?? performance.now()); };
  const planla = (k) => {
    const c = kareler.get(k);
    if (document.hidden) c.zam = kur(() => calistir(k), 50, [], false);
    else c.raf = oRaf((t) => calistir(k, t));
  };
  G.requestAnimationFrame = (fn) => { const k = ++kSira; kareler.set(k, { fn }); planla(k); return k; };
  G.cancelAnimationFrame = (k) => { const c = kareler.get(k); if (!c) return oCaf(k); kareler.delete(k); if (c.raf) oCaf(c.raf); if (c.zam) sil(c.zam); };
  document.addEventListener('visibilitychange', () => {
    for (const [k, c] of kareler) { if (c.raf) { oCaf(c.raf); c.raf = 0; } if (c.zam) { sil(c.zam); c.zam = 0; } planla(k); }
  });
  void oSi;
}
