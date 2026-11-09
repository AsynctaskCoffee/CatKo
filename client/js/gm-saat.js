// GM paneli → Saat ve hava: bu haritanın ya da tüm haritaların oyun saatini kaydırıcıyla (fare tekerleği de çalışır) ayarlar.
//  • Sürüklerken gök / ışık / sis anında önizlenir; bırakınca sunucuya yazılır, herkes realtime ile hemen görür.
//  • Akış: ayarlanan saatten gerçek zamanla ilerler. Sabit: hep aynı saat (ör. "her zaman 13:00").
//  • Hava: Oto (doğal hava döngüsü) / Açık / Yağmur / Kar — anında değişir.
//  • KO saatine dön: ayar silinir (Türkiye saati + doğal hava).
// Sunucu: oyun_saati tablosu, gm_oyun_saati(p_char, p_zone, p_mod, p_saat, p_hava).
import { saatAyari, gmSaat, saatYaz, yerelUygula, oyunSaatiDegisti, kurOyunSaati, koSaat } from './oyun-saati.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HIZLI = [[0, 'Gece yarısı'], [5 * 60, 'Gün doğumu'], [9 * 60, 'Sabah'], [13 * 60, 'Öğle'], [17 * 60, 'Gün batımı'], [19 * 60, 'Akşam'], [22 * 60, 'Gece']];
const gunduz = (dk) => { const h = dk / 60; return Math.max(0, Math.min(1, h < 12 ? (h - 4.5) / 2 : (19 - h) / 2)); };
const HAVA = [['oto', 'Oto (doğal)'], ['acik', 'Açık'], ['yagmur', 'Yağmur'], ['kar', 'Kar']];

export function initGmSaat({ sb, character, zone, zoneName, state, hud }) {
  kurOyunSaati(sb);
  let kok = null, hedef = zone, dk = null, mod = 'akis', hava = 'oto', surukle = false, kayitT = 0;
  const gercek = () => koSaat();   // KO oyun saati (10× hızlı)
  const simdi = (z) => gmSaat(z) ?? gercek();
  const bolge = () => (hedef === '*' ? '*' : zone);
  async function kaydet(p) {
    try {
      const { data, error } = await sb.rpc('gm_oyun_saati', { p_char: character.id, p_zone: bolge(), ...p });
      if (error) throw error;
      yerelUygula(data); hud.info?.(p.p_mod === 'sifirla' ? 'Oyun saati KO saatine döndü.' : `Oyun saati ${saatYaz(p.p_saat ?? 0)} (${p.p_mod === 'sabit' ? 'sabit' : 'akıyor'}) · ${hedef === '*' ? 'tüm haritalar' : 'bu harita'}`, 'tamam');
    } catch (e) { hud.notice?.(e?.message || String(e), 'hata'); }
    finally { window.KO_SAAT_ONIZLE = null; state.gunUygula?.(); }
  }
  const yaz = () => kaydet({ p_mod: mod, p_saat: dk * 60, p_hava: hava });
  const onizle = () => { window.KO_SAAT_ONIZLE = dk * 60; state.gunUygula?.(); ciz(false); };
  const ertele = () => { clearTimeout(kayitT); kayitT = setTimeout(() => { if (!surukle) yaz(); }, 450); };
  function durumAl() {
    const r = hedef === '*' ? saatAyari('*') : saatAyari(zone);
    mod = r?.mod || mod; hava = r?.hava || 'oto';
    if (!surukle) dk = Math.floor((r ? (r.mod === 'sabit' ? r.saat_sn : simdi(zone)) : simdi(zone)) / 60) % 1440;
  }
  function kur() {
    kok = document.createElement('div'); kok.className = 'g2-gomulu gs2';
    kok.addEventListener('input', (e) => { if (e.target.name === 'gs-dk') { dk = +e.target.value; surukle = true; onizle(); } });
    kok.addEventListener('change', (e) => {
      if (e.target.name === 'gs-dk') { dk = +e.target.value; surukle = false; yaz(); }
      if (e.target.name === 'gs-hedef') { hedef = e.target.value; durumAl(); ciz(); }
      if (e.target.name === 'gs-sabit') { mod = e.target.checked ? 'sabit' : 'akis'; yaz(); }
    });
    kok.addEventListener('wheel', (e) => {
      if (!e.target.closest('.gs2-kaydir')) return; e.preventDefault();
      dk = (dk + (e.deltaY > 0 ? -15 : 15) + 1440) % 1440; onizle(); ertele();
    }, { passive: false });
    kok.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const k = b.dataset.k;
      if (k === 'saat') { dk = +b.dataset.v; onizle(); yaz(); }
      if (k === 'hep13') { dk = 13 * 60; mod = 'sabit'; onizle(); yaz(); }
      if (k === 'hava') { hava = b.dataset.v; if (dk == null) durumAl(); yaz(); }
      if (k === 'sifirla') { kaydet({ p_mod: 'sifirla' }).then(() => { durumAl(); ciz(); }); }
      if (k === 'ince') { dk = (dk + Number(b.dataset.v) + 1440) % 1440; onizle(); ertele(); }
    });
    oyunSaatiDegisti(() => { if (kok?.isConnected) { durumAl(); ciz(); } });
    setInterval(() => { if (kok?.isConnected && !surukle) { const r = saatAyari(hedef === '*' ? '*' : zone); if (!r || r.mod === 'akis') durumAl(); ciz(false); } }, 1000);
  }
  function ciz(tam = true) {
    if (!kok) return;
    const r = hedef === '*' ? saatAyari('*') : saatAyari(zone);
    const oyunda = simdi(zone), kim = saatAyari(zone);
    const durum = kim ? `${kim.zone === '*' ? 'Tüm haritalar ayarı' : 'Bu harita ayarı'} · ${kim.mod === 'sabit' ? 'sabit' : 'akıyor'} · ${HAVA.find((h) => h[0] === kim.hava)?.[1] || 'Oto'}${kim.gm ? ' · ' + esc(kim.gm) : ''}` : 'KO oyun saati (10× hızlı) · doğal hava';
    if (!tam && kok.querySelector('.gs2-saat')) {
      kok.querySelector('.gs2-saat').textContent = saatYaz(dk * 60);
      kok.querySelector('.gs2-oyun').textContent = saatYaz(oyunda);
      kok.querySelector('.gs2-durum').textContent = durum;
      const i = kok.querySelector('[name=gs-dk]'); if (i && !surukle) i.value = dk;
      { const g = kok.querySelector('.gs2-gunes'); g.style.setProperty('--a', String(dk / 1440)); g.style.setProperty('--g', String(gunduz(dk))); }
      return;
    }
    kok.innerHTML = `<div class="g2-bolum"><div class="g2-bas">Oyun saati</div>
      <div class="gs2-ust"><label><input type="radio" name="gs-hedef" value="${esc(zone)}" ${hedef !== '*' ? 'checked' : ''}> Bu harita <em>${esc(zoneName())}</em></label>
        <label><input type="radio" name="gs-hedef" value="*" ${hedef === '*' ? 'checked' : ''}> Tüm haritalar</label></div>
      <div class="gs2-kart"><div class="gs2-gunes" style="--a:${dk / 1440};--g:${gunduz(dk)}"><i></i></div>
        <div><div class="gs2-saat">${saatYaz(dk * 60)}</div><div class="gs2-alt">Bu haritada şu an: <b class="gs2-oyun">${saatYaz(oyunda)}</b></div><div class="gs2-durum">${durum}</div></div></div>
      <div class="gs2-kaydir" title="Kaydır ya da fare tekerleğiyle ±15 dk">
        <button data-k="ince" data-v="-60">−1 sa</button><button data-k="ince" data-v="-10">−10 dk</button>
        <input type="range" name="gs-dk" min="0" max="1439" step="1" value="${dk}">
        <button data-k="ince" data-v="10">+10 dk</button><button data-k="ince" data-v="60">+1 sa</button></div>
      <div class="gs2-olcek"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:59</span></div>
      <div class="gs2-hizli">${HIZLI.map(([m, a]) => `<button data-k="saat" data-v="${m}" class="${dk === m ? 'secili' : ''}"><b>${saatYaz(m * 60)}</b>${a}</button>`).join('')}</div>
      <div class="gs2-sat"><label class="gs2-tik"><input type="checkbox" name="gs-sabit" ${(r?.mod || mod) === 'sabit' ? 'checked' : ''}> Saati sabitle (gün ilerlemez, hep bu saat)</label>
        <button data-k="hep13" class="g2-ana">Her zaman 13:00</button>
        <button data-k="sifirla" class="g2-ikincil">KO saatine dön</button></div></div>
      <div class="g2-bolum"><div class="g2-bas">Hava durumu</div>
        <div class="gs2-hava">${HAVA.map(([k, a]) => `<button data-k="hava" data-v="${k}" class="${(r?.hava || 'oto') === k ? 'secili' : ''}">${a}</button>`).join('')}</div>
        <p class="ay-not">Oto (KO sunucusu UpdateWeather): her oyun saatinde (6 gerçek dakika) yeniden belirlenir — %2 kar, %5 yağmur, %93 açık (açık havada ara ara sis). Seçilen hava ve saat bu harita${hedef === '*' ? ' yerine tüm haritalar' : ''} için anında herkese uygulanır. KO saati gerçek saatten 10 kat hızlı (bir gün 2 sa 24 dk). Gün döngüsü KO n3sky: 05:00 gün doğumu, 06:00 öğle ışığı, 17:00 gün batımı, 21:00 gece (geçişler 30 oyun dakikası).</p></div>`;
  }
  return {
    open(h) { if (!kok) kur(); durumAl(); ciz(); h.innerHTML = ''; h.append(kok); },
  };
}
