// KO sohbet ifadeleri (orijinal UI\re_emoticon.dxt, Data\TABLE_EMOTICON_us.tbl — 126 ifade): "(Smile)", "(Noah)" … yazılınca
// sohbette ve konuşma balonunda 20×20 simge olarak görünür. Seçici: sohbet giriş kutusunun sağındaki gülen yüz → ızgaradan tıklanan ifade yazılır.
const BASE = './assets/ui/emoticon';
let E = null, RE = null, P = null;
export function emoYukle() {
  return (P ||= fetch(`${BASE}/emoticon.json`).then((r) => r.json()).then((d) => {
    E = new Map(d.liste.map(([n, x, y]) => [n.toLowerCase(), { n, x, y }]));
    RE = new RegExp('(' + d.liste.map(([n]) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|') + ')', 'gi');
    return E;
  }).catch(() => null));
}
export const emoSpan = (e) => { const s = document.createElement('span'); s.className = 'ko-emo'; s.title = e.n; s.style.backgroundPosition = `-${e.x}px -${e.y}px`; return s; };
/** metni el içine yazar; tanınan ifadeler simge olur (yüklenmediyse düz metin, yüklenince yeniden işlenir) */
export function emoYaz(el, text) {
  text = String(text ?? '');
  if (!E) { el.append(document.createTextNode(text)); if (/\(/.test(text)) emoYukle().then(() => { if (!E || !el.isConnected) return; const tn = [...el.childNodes].find((c) => c.nodeType === 3 && c.nodeValue === text); if (tn) { const f = document.createDocumentFragment(); parca(f, text); tn.replaceWith(f); } }); return; }
  parca(el, text);
}
function parca(el, text) {
  let i = 0; RE.lastIndex = 0; let m;
  while ((m = RE.exec(text))) { if (m.index > i) el.append(document.createTextNode(text.slice(i, m.index))); const e = E.get(m[0].toLowerCase()); el.append(e ? emoSpan(e) : document.createTextNode(m[0])); i = m.index + m[0].length; }
  if (i < text.length) el.append(document.createTextNode(text.slice(i)));
}
/** (5.11) ifade seçici — KO re_emoticon_2 (333×203: tournament_chaos_2021_a01 çerçeve, alt ◀ X ▶): 7 × 4 ızgara, sayfalı, tüm ifadeler */
let sec = null, sayfa = 0;
const SUT = 7, SAT = 4, SAYFA = SUT * SAT;
export async function emoSecici(inp, yer) {
  if (sec) { sec.remove(); sec = null; return; }
  await emoYukle(); if (!E) return;
  const K = await import('./kui.js');
  const hepsi = [...E.values()], N = Math.max(1, Math.ceil(hepsi.length / SAYFA));
  let L = null;
  if (await K.ekUI('emopan').catch(() => false) && K.hasLayout('re_emoticon_2')) L = K.buildLayout('re_emoticon_2', { className: 'ko-emo-panel' });
  sec = L ? L.el : document.createElement('div'); sec.classList.add('ko-emo-secici-orj'); if (!L) sec.classList.add('ko-panel', 'ko-emo-secici');
  const izgara = document.createElement('div'); izgara.className = 'ko-emo-izgara'; sec.append(izgara);
  const kapat = () => { sec?.remove(); sec = null; removeEventListener('pointerdown', disTik, true); };
  const ciz = () => {
    izgara.textContent = '';
    hepsi.slice(sayfa * SAYFA, sayfa * SAYFA + SAYFA).forEach((e, i) => {
      const b = emoSpan(e); b.style.left = (38.5 + 41 * (i % SUT) - 10) + 'px'; b.style.top = (32.5 + 41.7 * Math.floor(i / SUT) - 10) + 'px';
      b.addEventListener('click', (ev) => { ev.stopPropagation(); const p = inp.selectionStart ?? inp.value.length; inp.value = (inp.value.slice(0, p) + e.n + inp.value.slice(p)).slice(0, inp.maxLength > 0 ? inp.maxLength : 200); inp.focus(); const q = p + e.n.length; try { inp.setSelectionRange(q, q); } catch {} });
      izgara.append(b);
    });
  };
  sayfa = Math.min(sayfa, N - 1); ciz();
  if (L) {
    L.click('btn_down', () => { sayfa = (sayfa - 1 + N) % N; ciz(); });
    L.click('btn_up', () => { sayfa = (sayfa + 1) % N; ciz(); });
    L.click('btn_close', kapat);
  }
  sec.addEventListener('pointerdown', (e) => e.stopPropagation());
  Object.assign(sec.style, { position: 'fixed', zIndex: 9000 });
  document.body.append(sec);   // en üst katmanda: PM penceresinin (body, z 4060) arkasında kalmaz
  const r = yer.getBoundingClientRect(), w = sec.offsetWidth || 333, h = sec.offsetHeight || 203;
  const pm = yer.closest('.kui-root, .ko-pm, [class*="pm"]')?.getBoundingClientRect();
  sec.style.left = Math.max(4, Math.min(innerWidth - w - 4, pm ? pm.left : r.right - w)) + 'px';
  sec.style.top = Math.max(4, Math.min(innerHeight - h - 4, pm ? pm.bottom + 4 : r.top - h - 6)) + 'px';   // KO: PM penceresinin hemen altında
  function disTik(ev) { if (sec && !sec.contains(ev.target) && ev.target !== yer) kapat(); }
  setTimeout(() => addEventListener('pointerdown', disTik, true), 0);
}
emoYukle();
