// GM paneli → Konum: her haritanın doğma ve üs noktaları ile oyuna ilk giriş noktası.
//  • Ortak doğma noktası (zones.start_x/z): ışınlanma, diriliş ve /town için herkesin noktası.
//  • Ulus üsleri (karus_x/z, elmo_x/z): tanımlıysa o haritada her ulus kendi üssünde doğar / town olur (ortak noktanın yerine).
//  • Yarıçap (nokta_r): üs noktasında rastgele dağılma (m).
//  • İlk giriş: yeni karakterlerin başlayacağı harita ve nokta (ortak ya da ulusa göre ayrı); boşsa haritanın ortak doğma noktası.
// Sunucu: gm_konum_liste / gm_konum_kaydet / gm_ilk_giris_kaydet (GM yetkisi, sınır denetimi).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NOKTA = [['s', 'Ortak doğma noktası', 'Herkes (ulus üssü yoksa)'], ['k', 'Karus üssü', 'Karus oyuncuları'], ['e', 'El Morad üssü', 'El Morad oyuncuları']];

export function initGmKonum({ sb, character, zone, zoneName, state, player, hud, say }) {
  let kok = null, veri = null, sec = zone, ara = '';
  const rpc = async (fn, a) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...a }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };
  const $ = (s) => kok.querySelector(s);
  const f1 = (v) => (v == null ? '' : (+v).toFixed(1));
  const burasi = () => ({ x: +player.position.x.toFixed(1), z: +player.position.z.toFixed(1) });
  function kur() {
    kok = document.createElement('div'); kok.className = 'g2-gomulu gk2';
    kok.innerHTML = `<div class="gk2-ana"><aside class="gk2-sol"><input data-k="ara" placeholder="Harita ara…" autocomplete="off"><div class="gk2-liste"><div class="g2-bos">Yükleniyor…</div></div></aside>
      <div class="gk2-sag"><div class="gk2-harita"></div><div class="gk2-ilk"></div></div></div>`;
    kok.addEventListener('input', (e) => { if (e.target.dataset.k === 'ara') { ara = e.target.value.trim().toLowerCase(); listeCiz(); } });
    kok.addEventListener('click', tikla);
    kok.addEventListener('keydown', (e) => e.stopPropagation());
    yukle();
  }
  async function yukle() { veri = await rpc('gm_konum_liste', {}).catch(() => null); if (veri) { listeCiz(); haritaCiz(); ilkCiz(); } }
  const h = (id) => veri?.haritalar.find((x) => x.id === id);
  function listeCiz() {
    const l = veri.haritalar.filter((x) => !ara || x.ad.toLowerCase().includes(ara) || x.id.includes(ara));
    $('.gk2-liste').innerHTML = l.map((x) => `<div class="gk2-satir${x.id === sec ? ' secili' : ''}" data-z="${esc(x.id)}"><b>${esc(x.ad)}${x.id === zone ? ' <em>buradasın</em>' : ''}</b>
      <i>${x.sx != null ? 'ortak' : ''}${x.kx != null ? ' · Karus' : ''}${x.ex != null ? ' · El Morad' : ''}${x.sx == null && x.kx == null && x.ex == null ? 'nokta yok' : ''}${veri.ilk?.ilk_zone === x.id ? ' · ilk giriş' : ''}</i></div>`).join('');
  }
  function haritaCiz() {
    const x = h(sec); const k = $('.gk2-harita'); if (!x) { k.innerHTML = ''; return; }
    const bu = x.id === zone;
    k.innerHTML = `<div class="gk2-bas"><b>${esc(x.ad)}</b><span>${esc(x.id)}${bu ? ' · bulunduğun harita' : ''}</span></div>
      <p class="ay-not">Ulus üssü tanımlıysa o haritada uluslar kendi üslerinde doğar ve /town olur; tanımlı değilse herkes ortak doğma noktasını kullanır.${bu ? '' : ' "Bulunduğum yer" yalnız o haritadayken kullanılabilir; koordinatı elle de girebilirsin.'}</p>
      <div class="gk2-noktalar">${NOKTA.map(([p, ad, kim]) => { const X = x[p + 'x'], Z = x[p + 'z']; return `<div class="gk2-nokta${X == null ? ' bos' : ''}">
        <div class="gk2-nb"><b>${ad}</b><span>${kim}</span></div>
        <label>X<input type="number" step="0.5" data-n="${p}x" value="${f1(X)}"></label><label>Z<input type="number" step="0.5" data-n="${p}z" value="${f1(Z)}"></label>
        <div class="gk2-nd"><button data-a="burasi" data-p="${p}" ${bu ? '' : 'disabled'}>Bulunduğum yer</button><button data-a="git" data-p="${p}" ${bu && X != null ? '' : 'disabled'}>Git</button><button data-a="temizle" data-p="${p}" class="g2-tehlike" ${X == null ? 'disabled' : ''}>Temizle</button></div></div>`; }).join('')}</div>
      <div class="gk2-alt"><label>Üs yarıçapı (m)<input type="number" min="0" max="100" step="0.5" data-n="r" value="${x.r ?? ''}" placeholder="0"></label><button data-a="kaydet" class="g2-ana">Haritanın noktalarını kaydet</button></div>`;
  }
  function ilkCiz() {
    const a = veri.ilk || {}, k = $('.gk2-ilk');
    k.innerHTML = `<div class="gk2-bas"><b>Oyuna ilk giriş</b><span>yeni karakterlerin başlangıç noktası</span></div>
      <p class="ay-not">Boş bırakılırsa yeni karakterler Moradon'un ortak doğma noktasında başlar. Ulusa göre ayrı nokta girilirse o ulus orada başlar.</p>
      <div class="gk2-ilk-form">
        <label>Harita<select data-i="ilk_zone"><option value="">Varsayılan (Moradon)</option>${veri.haritalar.map((x) => `<option value="${esc(x.id)}" ${a.ilk_zone === x.id ? 'selected' : ''}>${esc(x.ad)}</option>`).join('')}</select></label>
        <div class="gk2-ilk-n"><b>Ortak</b><label>X<input type="number" step="0.5" data-i="ilk_x" value="${a.ilk_x ?? ''}"></label><label>Z<input type="number" step="0.5" data-i="ilk_z" value="${a.ilk_z ?? ''}"></label><button data-a="ilk-burasi" data-p="">Bulunduğum yer</button></div>
        <div class="gk2-ilk-n"><b>Karus</b><label>X<input type="number" step="0.5" data-i="ilk_kx" value="${a.ilk_kx ?? ''}"></label><label>Z<input type="number" step="0.5" data-i="ilk_kz" value="${a.ilk_kz ?? ''}"></label><button data-a="ilk-burasi" data-p="k">Bulunduğum yer</button></div>
        <div class="gk2-ilk-n"><b>El Morad</b><label>X<input type="number" step="0.5" data-i="ilk_ex" value="${a.ilk_ex ?? ''}"></label><label>Z<input type="number" step="0.5" data-i="ilk_ez" value="${a.ilk_ez ?? ''}"></label><button data-a="ilk-burasi" data-p="e">Bulunduğum yer</button></div>
      </div>
      <div class="g2-dugmeler"><button data-a="ilk-kaydet" class="g2-ana">İlk giriş ayarını kaydet</button><button data-a="ilk-sifirla">Varsayılana döndür</button></div>`;
  }
  async function tikla(e) {
    const s = e.target.closest('[data-z]'); if (s) { sec = s.dataset.z; listeCiz(); return haritaCiz(); }
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const a = b.dataset.a, p = b.dataset.p, x = h(sec), inp = (n) => kok.querySelector(`[data-n="${n}"]`);
    if (a === 'burasi') { const q = burasi(); inp(p + 'x').value = q.x; inp(p + 'z').value = q.z; return; }
    if (a === 'git') { const X = Number(inp(p + 'x').value), Z = Number(inp(p + 'z').value); if (Number.isFinite(X) && Number.isFinite(Z)) { player.position.set(X, state.heightAt?.(X, Z) ?? player.position.y, Z); state.target = null; } return; }
    if (a === 'temizle') { inp(p + 'x').value = ''; inp(p + 'z').value = ''; return; }
    if (a === 'kaydet') {
      const v = {}; for (const n of ['sx', 'sz', 'kx', 'kz', 'ex', 'ez', 'r']) { const t = inp(n).value.trim(); v[n] = t === '' ? null : Number(t); }
      for (const [q] of NOKTA) if ((v[q + 'x'] == null) !== (v[q + 'z'] == null)) return hud.notice?.('Each point needs both X and Z (or leave both empty).', 'hata');
      const d = await rpc('gm_konum_kaydet', { p_zone: sec, p_veri: v }).catch(() => null); if (!d?.ok) return d && hud.notice?.(d.reason, 'hata');
      hud.info?.(`${x.ad}: spawn / base points saved.`, 'tamam'); if (sec === zone) say?.(`${x.ad} points updated.`, 'tamam'); return yukle();
    }
    if (a === 'ilk-burasi') { const q = burasi(); kok.querySelector('[data-i=ilk_zone]').value = zone; kok.querySelector(`[data-i=ilk_${p}x]`).value = q.x; kok.querySelector(`[data-i=ilk_${p}z]`).value = q.z; return; }
    if (a === 'ilk-kaydet' || a === 'ilk-sifirla') {
      const v = {}; for (const n of ['ilk_zone', 'ilk_x', 'ilk_z', 'ilk_kx', 'ilk_kz', 'ilk_ex', 'ilk_ez']) v[n] = a === 'ilk-sifirla' ? '' : kok.querySelector(`[data-i=${n}]`).value.trim();
      if (a === 'ilk-kaydet' && !v.ilk_zone && (v.ilk_x || v.ilk_kx || v.ilk_ex)) return hud.notice?.('Select the first-login map first.', 'hata');
      const d = await rpc('gm_ilk_giris_kaydet', { p_veri: v }).catch(() => null); if (!d?.ok) return d && hud.notice?.(d.reason, 'hata');
      hud.info?.(a === 'ilk-sifirla' ? 'First login reset to default (Moradon).' : 'First login point saved.', 'tamam'); return yukle();
    }
  }
  return { open(host) { if (!kok) kur(); if (host && kok.parentNode !== host) host.append(kok); } };
}
