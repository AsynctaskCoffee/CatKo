// KO Chat Text Color Setting (orijinal re_chatcolor): sohbet türlerinin yazı rengi. Onay kutusuyla tür(ler) seçilir,
// paletten renk tıklanır (seçili türlerin yazısı önizlenir), Apply kaydeder, Default KO renklerine döner.
// Renkler html'de CSS değişkeni (--ks-<tür>); #sohbet-mesajlar satır sınıfları (k-genel, k-bagir, k-parti …) bunları kullanır.
import { ekUI, hasLayout, buildLayout, draggable } from './kui.js';

export const SOHBET_RENK_VARS = { 0: ['genel', '#ffffff'], 1: ['bagir', '#ff8040'], 2: ['parti', '#0080ff'], 3: ['klan', '#00ff00'], 4: ['ozelgiden', '#80ffff'], 5: ['ozel', '#ffff00'],
  6: ['ozelarkadas', '#80ff80'], 7: ['noahk', '#00ffff'], 8: ['noahe', '#ff8080'], 9: ['birlik', '#80ffff'], 10: ['oda', '#8080ff'] };
const KEY = 'ko-sohbet-renk';
const oku = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
export function sohbetRenkUygula(r = oku()) {
  const h = document.documentElement;
  for (const [, [k]] of Object.entries(SOHBET_RENK_VARS)) { if (r[k]) h.style.setProperty('--ks-' + k, r[k]); else h.style.removeProperty('--ks-' + k); h.classList.toggle('ks-on-' + k, !!r[k]); }
}
sohbetRenkUygula();

let L = null, gecici = {}, secili = new Set();
export async function sohbetRenkAc() {
  if (!(await ekUI('sohbet').catch(() => false)) || !hasLayout('re_chatcolor')) return;
  if (!L) {
    L = buildLayout('re_chatcolor', { className: 'ko-sohbet-renk ko-pencere kui-dokulu' });
    (document.getElementById('kohud') || document.body).append(L.el); draggable(L, 70);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    L.click('Btn_close', () => { L.el.hidden = true; });
    for (const i of Object.keys(SOHBET_RENK_VARS)) L.click('Btn_' + i, () => { if (secili.has(+i)) secili.delete(+i); else secili.add(+i); ciz(); });
    // palet (KO plate: yatayda renk tonu, dikeyde açıktan koyuya; sağ sütun gri tonlar)
    const p = L.get('Img_palet');
    if (p) {
      const W = 235, H = 130, cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.className = 'ksr-palet';
      const g = cv.getContext('2d'), CW = 9, RH = 8, cols = Math.floor((W - 14) / CW), rows = Math.ceil(H / RH);
      for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) { const l = 96 - (y / (rows - 1)) * 92; g.fillStyle = `hsl(${(x / cols) * 360},100%,${l}%)`; g.fillRect(x * CW, y * RH, CW, RH); }
      for (let y = 0; y < rows; y++) { const v = 255 - Math.round((y / (rows - 1)) * 255); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(cols * CW, y * RH, W - cols * CW, RH); }
      p.append(cv); p.style.pointerEvents = 'auto'; cv.style.cursor = 'crosshair';
      cv.addEventListener('click', (e) => {
        e.stopPropagation(); const r = cv.getBoundingClientRect();
        const d = g.getImageData(Math.floor((e.clientX - r.left) / r.width * W), Math.floor((e.clientY - r.top) / r.height * H), 1, 1).data;
        const hex = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        for (const i of secili) gecici[SOHBET_RENK_VARS[i][0]] = hex; ciz();
      });
    }
    L.click('Btn_defult', () => { gecici = {}; ciz(); });
    L.click('Btn_alpy', () => { try { localStorage.setItem(KEY, JSON.stringify(gecici)); } catch {} sohbetRenkUygula(gecici); L.el.hidden = true; });
  }
  gecici = oku(); secili = new Set(); ciz();
  L.el.hidden = false; L.el.style.zIndex = 4300;
  if (!L.el.style.left) { L.el.style.left = Math.max(10, innerWidth - 470) + 'px'; L.el.style.top = Math.max(10, innerHeight - 640) + 'px'; }
}
function ciz() {
  for (const [i, [k, d]] of Object.entries(SOHBET_RENK_VARS)) {
    L.get('Btn_' + i)?.classList.toggle('secili', secili.has(+i));
    const t = L.get('Str_' + i); if (t) t.style.setProperty('color', gecici[k] || d, 'important');
  }
}
