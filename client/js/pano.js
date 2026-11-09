// Moradon ulus panoları (Karus Bulletine Board 20004 / Elmorad Bulletine Board 20005): KO sıralama tablosu.
// Sekmeler: Ulus Puanı (ulusun oyuncuları, ulus puanına göre), Klan (ulusun klanları, dereceye ve puana göre), Krallar.
// Veri: RPC pano_bilgi(p_ulus).
import { koWindow, toFront } from './ko-pencere.js';

const SINIF = { 1: 'Savaşçı', 2: 'Okçu', 3: 'Büyücü', 4: 'Rahip', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Enchanter', 11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Uzman Kurian', 15: 'Usta Kurian' };
const ROMA = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
const TUR = { mavi: 'Knight', akredite: 'Accredited Knight', royal: 'Royal Knight' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const ULUS = { 1: 'Karus', 2: 'El Morad' };

let W = null;
// kral değişince (seçim, görevden alma, GM) açık pano anında yenilenir — kral.js 'ko-kral-degisti' olayı
let SON = null;
addEventListener('ko-kral-degisti', () => { if (W && !W.hidden && SON) yenile(); });
async function yenile() {
  const { sb, character } = SON, ulus = Number(W.dataset.ulus);
  const { data, error } = await sb.rpc('pano_bilgi', { p_ulus: ulus });
  if (Number(W.dataset.ulus) !== ulus) return;
  W.veri = error ? { hata: error.message } : data; W.ben = character?.name; ciz();
}
export async function panoAc({ sb, character, ulus }) {
  SON = { sb, character };
  if (!W) {
    W = document.createElement('div'); W.id = 'ko-pano'; W.className = 'ko-panel ko-pencere';
    W.innerHTML = `<div class="ay-baslik">Bulletin Board</div><button class="ko-kapat" title="Kapat"></button>
      <div class="ay-sekmeler"><button data-t="np">Ulus Puanı</button><button data-t="klan">Klan Sıralaması</button><button data-t="kral">Krallar</button></div>
      <div class="pn-ulus"></div><div class="pn-govde">Yükleniyor…</div>`;
    (document.getElementById('kohud') || document.body).append(W);
    W.querySelector('.ko-kapat').onclick = () => (W.hidden = true);
    W.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(W); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && W && !W.hidden) W.hidden = true; });
    W.querySelectorAll('.ay-sekmeler button').forEach((b) => (b.onclick = () => { W.dataset.t = b.dataset.t; ciz(); }));
  }
  W.dataset.t ||= 'np'; W.dataset.ulus = ulus;
  W.hidden = false; koWindow(W); toFront(W); W.style.zIndex = 4200;
  W.querySelector('.pn-ulus').innerHTML = `<b class="pn-${ulus === 1 ? 'ka' : 'el'}">${ULUS[ulus]}</b> ulus panosu`;
  W.veri = null; ciz();
  const { data, error } = await sb.rpc('pano_bilgi', { p_ulus: ulus });
  W.veri = error ? { hata: error.message } : data; W.ben = character?.name; ciz();
}

function ciz() {
  if (!W) return;
  const t = W.dataset.t, d = W.veri, g = W.querySelector('.pn-govde');
  W.querySelectorAll('.ay-sekmeler button').forEach((b) => b.classList.toggle('secili', b.dataset.t === t));
  if (!d) { g.innerHTML = '<div class="pn-bos">Yükleniyor…</div>'; return; }
  if (d.hata) { g.innerHTML = `<div class="pn-bos">${esc(d.hata)}</div>`; return; }
  const madalya = (s) => (s <= 3 ? `<i class="pn-m pn-m${s}">${s}</i>` : s);
  if (t === 'np') {
    const L = d.oyuncular || [];
    g.innerHTML = `<table><thead><tr><th>Sıra</th><th>Karakter</th><th>Sv</th><th>Sınıf</th><th>Klan</th><th>Ulus Puanı</th><th>Bu Ay</th></tr></thead><tbody>${
      L.length ? L.map((o) => `<tr${o.ad === W.ben ? ' class="pn-ben"' : ''}><td>${madalya(o.sira)}</td><td class="pn-ad">${esc(o.ad)}</td><td>${o.sv}</td><td>${esc(SINIF[o.sinif] || '')}</td><td class="pn-klan">${esc(o.klan || '')}</td><td class="pn-np">${fmt(o.np)}</td><td>${fmt(o.np_ay)}</td></tr>`).join('')
      : '<tr><td colspan="7" class="pn-bos">Henüz kayıt yok.</td></tr>'}</tbody></table>`;
  } else if (t === 'klan') {
    const L = d.klanlar || [];
    g.innerHTML = `<table><thead><tr><th>Sıra</th><th>Arma</th><th>Klan</th><th>Derece</th><th>Lider</th><th>Üye</th><th>Klan Puanı</th></tr></thead><tbody>${
      L.length ? L.map((k) => { const v = k.seviye || { tur: 'mavi', derece: 5 }; return `<tr><td>${madalya(k.sira)}</td><td><i class="pn-arma" style="background-image:url(assets/ui/klan/${v.tur}${v.derece}.webp)"></i></td><td class="pn-ad">${esc(k.ad)}</td><td class="pn-${v.tur}">${TUR[v.tur]} ${ROMA[v.derece]}</td><td>${esc(k.lider || '')}</td><td>${k.uye}</td><td class="pn-np">${fmt(k.puan)}</td></tr>`; }).join('')
      : '<tr><td colspan="7" class="pn-bos">Bu ulusta henüz klan yok.</td></tr>'}</tbody></table>`;
  } else {
    // KO: panoda yalnız o ulusun kralı (krallık sistemi; seçim / görevden alma anında yenilenir)
    const n = Number(W.dataset.ulus) || 1, k = (d.krallar || {})[n] || (d.krallar || {})[String(n)];
    g.innerHTML = `<div class="pn-krallar"><div class="pn-kral pn-${n === 1 ? 'ka' : 'el'}"><div class="pn-tac">♛</div><div class="pn-kral-ulus">${ULUS[n]} Kralı</div>`
      + `<div class="pn-kral-ad">${k ? esc(k.ad) : '—'}</div>${k ? `<div class="pn-kral-alt">Sv ${k.sv}${k.klan ? ` · ${esc(k.klan)}` : ''}</div>` : ''}</div></div>`;
  }
}
