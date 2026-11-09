// Knight Cash kod yönetimi (GM): web sitesi Yönetici panelinde ve oyundaki Power-Up Store GM panelinde aynı ekran.
// Sunucu: gm_kc_kod_liste / gm_kc_kod_kaydet / gm_kc_kod_uret (web_gm_mi kontrolü), oyuncu tarafı kc_kod_yukle.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const tarih = (t) => (t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const DURUM = { aktif: ['Aktif', 'yesil'], kapali: ['Kapalı', 'gri'], suresi: ['Süresi doldu', 'kirmizi'], bitti: ['Tükendi', 'turuncu'] };
const yerel = (t) => { if (!t) return ''; const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

const STIL = `
.kck { --kck-altin: #ffd76a; --kck-cizgi: #5a5436; --kck-zemin: rgba(0,0,0,.4); --kck-yazi: #e8e0c4; --kck-soluk: #a39b7c; color: var(--kck-yazi); font: 12px Tahoma, Verdana, Arial, sans-serif; display: flex; flex-direction: column; gap: 10px; text-align: left; user-select: text; }
.kck h4 { margin: 0 0 6px; font: bold 13px Georgia, serif; color: var(--kck-altin); text-shadow: 1px 1px 0 #000; }
.kck-ozet { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.kck-ozet div { background: var(--kck-zemin); border: 1px solid var(--kck-cizgi); padding: 6px 10px; }
.kck-ozet span { display: block; color: var(--kck-soluk); font-size: 11px; } .kck-ozet b { font-size: 16px; color: var(--kck-altin); }
.kck-form { background: var(--kck-zemin); border: 1px solid var(--kck-cizgi); padding: 8px 10px; }
.kck-alanlar { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px 10px; }
.kck-alanlar label { display: flex; flex-direction: column; gap: 2px; color: var(--kck-soluk); font-size: 11px; }
.kck-alanlar label.genis { grid-column: span 2; }
.kck input, .kck select { height: 22px; box-sizing: border-box; background: #000; color: #fff; border: 1px solid #4b4830; padding: 0 5px; font: 12px Tahoma, Arial; min-width: 0; width: 100%; }
.kck-ara input { width: auto; } .kck-kod { white-space: nowrap; }
.kck input:focus { outline: none; border-color: #a8924e; }
.kck-dugmeler { display: flex; gap: 6px; margin-top: 8px; align-items: center; flex-wrap: wrap; }
.kck button { cursor: pointer; height: 22px; padding: 0 10px; color: #ece4c4; font: 12px Tahoma, Arial; text-shadow: 1px 1px 0 #000; border: 1px solid #7d7652; border-radius: 2px;
  background: linear-gradient(#58543a, #34321f 48%, #22200f 52%, #2c2a19); box-shadow: inset 0 1px 0 rgba(255,240,190,.22), 0 0 0 1px #000; }
.kck button:hover { color: #fff; border-color: #b4a466; }
.kck button.altin { color: #2a1a04; text-shadow: none; font-weight: bold; border-color: #2a1a04; background: linear-gradient(#ffe7a0, #e0b04c 48%, #b88324 52%, #d0a040); }
.kck button.kucuk { height: 19px; padding: 0 6px; font-size: 11px; }
.kck-uretilen { margin-top: 8px; padding: 6px 8px; background: rgba(40,60,30,.35); border: 1px solid #4a6a3a; font: 12px Consolas, monospace; color: #c8ffc0; white-space: pre-wrap; max-height: 90px; overflow: auto; user-select: text; }
.kck-uretilen[hidden] { display: none; }
.kck-ara { display: flex; gap: 8px; align-items: center; } .kck-ara input { flex: 1; }
.kck-tablo { width: 100%; border-collapse: collapse; }
.kck-tablo th { text-align: left; color: var(--kck-soluk); font-weight: normal; font-size: 11px; padding: 4px 6px; border-bottom: 1px solid var(--kck-cizgi); position: sticky; top: 0; background: #12110b; }
.kck-tablo td { padding: 4px 6px; border-bottom: 1px solid rgba(90,84,54,.35); vertical-align: middle; }
.kck-tablo tr:hover td { background: rgba(120,98,46,.15); }
.kck-tablo .sag { text-align: right; }
.kck-kod { font: bold 12px Consolas, monospace; color: #fff; cursor: copy; } .kck-kod:hover { color: var(--kck-altin); }
.kck-rozet { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: bold; color: #000; }
.kck-rozet.yesil { background: #6ee88a; } .kck-rozet.gri { background: #9a9a9a; } .kck-rozet.kirmizi { background: #ff7a7a; } .kck-rozet.turuncu { background: #ffb84a; }
.kck-kaydir { max-height: 260px; overflow: auto; border: 1px solid var(--kck-cizgi); background: var(--kck-zemin); }
.kck-bos { text-align: center; color: var(--kck-soluk); padding: 16px; }
.kck-sekmeler { display: flex; gap: 4px; } .kck-sekmeler button.secili { color: #ffe28a; border-color: #d8b65a; background: linear-gradient(#7c6626, #4c3c12 48%, #33280a 52%, #4a3a12); }
@media (max-width: 700px) { .kck-alanlar { grid-template-columns: repeat(2, minmax(0, 1fr)); } .kck-ozet { grid-template-columns: 1fr 1fr; } }
`;

export async function kcKodYonetim(el, sb, { bildir = (m) => alert(m), tema = '' } = {}) {
  if (!document.getElementById('kck-stil')) document.head.append(Object.assign(document.createElement('style'), { id: 'kck-stil', textContent: STIL }));
  let veri = null, duzenId = null, gorunum = 'kodlar';
  el.innerHTML = `<div class="kck${tema ? ' kck-' + tema : ''}">
    <div class="kck-ozet"><div><span>Toplam kod</span><b data-o="kod">…</b></div><div><span>Kullanılabilir</span><b data-o="aktif">…</b></div><div><span>Toplam kullanım</span><b data-o="kullanim">…</b></div><div><span>Dağıtılan KC</span><b data-o="dagitilan">…</b></div></div>
    <div class="kck-form">
      <h4 class="kck-form-baslik">Yeni KC Kodu</h4>
      <div class="kck-alanlar">
        <label>Kod (boş = otomatik)<input name="kod" maxlength="32" placeholder="ör. MINE-YENI-2026"></label>
        <label>Ön ek (otomatik kod)<input name="on_ek" maxlength="8" placeholder="MINE"></label>
        <label>KC miktarı<input name="miktar" type="number" min="1" value="1000"></label>
        <label>Kullanım sınırı (hesap)<input name="max" type="number" min="1" value="1"></label>
        <label>Bitiş (boş = süresiz)<input name="bitis" type="datetime-local"></label>
        <label class="genis">Açıklama<input name="aciklama" maxlength="120" placeholder="ör. Açılış etkinliği ödülü"></label>
        <label class="kck-adet-alan">Adet (toplu üretim)<input name="adet" type="number" min="1" max="100" value="1"></label>
      </div>
      <div class="kck-dugmeler"><button class="altin" data-a="kaydet">Kod Oluştur</button><button data-a="vazgec" hidden>Vazgeç</button><button data-a="yenile">Yenile</button></div>
      <div class="kck-uretilen" hidden></div>
    </div>
    <div class="kck-ara"><div class="kck-sekmeler"><button data-g="kodlar" class="secili">Kodlar</button><button data-g="kullanimlar">Kullanım Geçmişi</button></div><input class="kck-q" placeholder="Kod, açıklama ya da karakter ara…"></div>
    <div class="kck-kaydir"></div>
  </div>`;
  const $ = (s) => el.querySelector(s), F = (n) => el.querySelector(`.kck-form [name="${n}"]`);
  const yukle = async () => {
    const { data, error } = await sb.rpc('gm_kc_kod_liste');
    if (error) { $('.kck-kaydir').innerHTML = `<div class="kck-bos">${esc(/GM/.test(error.message) ? 'Bu bölüm yalnızca GM\'ler içindir.' : 'KC kodları yüklenemedi: ' + error.message)}</div>`; return; }
    veri = data; for (const [k, v] of Object.entries(veri.ozet || {})) { const b = el.querySelector(`[data-o="${k}"]`); if (b) b.textContent = fmt(v); }
    ciz();
  };
  const ciz = () => {
    if (!veri) return;
    const q = $('.kck-q').value.trim().toLocaleLowerCase('tr');
    const has = (...a) => !q || a.some((s) => String(s ?? '').toLocaleLowerCase('tr').includes(q));
    if (gorunum === 'kodlar') {
      const r = veri.kodlar.filter((k) => has(k.kod, k.aciklama));
      $('.kck-kaydir').innerHTML = r.length ? `<table class="kck-tablo"><thead><tr><th>Kod</th><th class="sag">KC</th><th class="sag">Kullanım</th><th>Bitiş</th><th>Durum</th><th>Açıklama</th><th>Oluşturma</th><th></th></tr></thead><tbody>${r.map((k) => { const [d, renk] = DURUM[k.durum] || DURUM.aktif; return `<tr>
        <td><span class="kck-kod" data-kopya="${esc(k.kod)}" title="Kopyalamak için tıkla">${esc(k.kod)}</span></td><td class="sag">${fmt(k.miktar)}</td><td class="sag">${fmt(k.kullanim)} / ${fmt(k.max)}</td>
        <td>${k.bitis ? tarih(k.bitis) : 'Süresiz'}</td><td><span class="kck-rozet ${renk}">${d}</span></td><td>${esc(k.aciklama || '')}</td><td>${tarih(k.olusturma)}</td>
        <td><button class="kucuk" data-duzen="${k.id}">Düzenle</button> <button class="kucuk" data-ac="${k.id}" data-v="${k.aktif ? 0 : 1}">${k.aktif ? 'Kapat' : 'Aç'}</button></td></tr>`; }).join('')}</tbody></table>`
        : '<div class="kck-bos">Kod yok.</div>';
    } else {
      const r = veri.kullanimlar.filter((u) => has(u.kod, u.karakter));
      $('.kck-kaydir').innerHTML = r.length ? `<table class="kck-tablo"><thead><tr><th>Tarih</th><th>Kod</th><th>Karakter</th><th class="sag">KC</th></tr></thead><tbody>${r.map((u) => `<tr><td>${tarih(u.tarih)}</td><td><span class="kck-kod" data-kopya="${esc(u.kod)}">${esc(u.kod)}</span></td><td>${esc(u.karakter || '—')}</td><td class="sag">${fmt(u.miktar)}</td></tr>`).join('')}</tbody></table>`
        : '<div class="kck-bos">Henüz kullanılan kod yok.</div>';
    }
  };
  const formSifirla = () => {
    duzenId = null; $('.kck-form-baslik').textContent = 'Yeni KC Kodu'; el.querySelector('[data-a="kaydet"]').textContent = 'Kod Oluştur'; el.querySelector('[data-a="vazgec"]').hidden = true; $('.kck-adet-alan').hidden = false;
    F('kod').value = ''; F('on_ek').value = ''; F('miktar').value = 1000; F('max').value = 1; F('bitis').value = ''; F('aciklama').value = ''; F('adet').value = 1;
  };
  const kaydet = async (btn) => {
    const v = { kod: F('kod').value.trim(), on_ek: F('on_ek').value.trim(), miktar: Math.floor(Number(F('miktar').value)), max: Math.floor(Number(F('max').value) || 1), bitis: F('bitis').value ? new Date(F('bitis').value).toISOString() : '', aciklama: F('aciklama').value };
    const adet = Math.max(1, Math.min(100, Math.floor(Number(F('adet').value) || 1)));
    btn.disabled = true;
    let res;
    if (duzenId) res = await sb.rpc('gm_kc_kod_kaydet', { p_id: duzenId, p_veri: v });
    else if (adet > 1 && !v.kod) res = await sb.rpc('gm_kc_kod_uret', { p_adet: adet, p_veri: v });
    else res = await sb.rpc('gm_kc_kod_kaydet', { p_id: null, p_veri: v });
    btn.disabled = false;
    if (res.error || !res.data?.ok) return bildir(res.error?.message || 'Kaydedilemedi.', 'hata');
    const kodlar = res.data.kodlar || [res.data.kod];
    const u = $('.kck-uretilen'); u.hidden = false; u.textContent = (duzenId ? 'Güncellendi: ' : `Oluşturulan ${kodlar.length} kod (${fmt(v.miktar)} KC):\n`) + kodlar.join('\n');
    bildir(duzenId ? 'Kod güncellendi.' : `${kodlar.length} kod oluşturuldu.`, 'tamam');
    formSifirla(); await yukle();
  };
  const kopyala = async (t) => { try { await navigator.clipboard.writeText(t); bildir(`${t} kopyalandı.`, 'tamam'); } catch { bildir(t, 'tamam'); } };
  el.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-kopya]'); if (k) return kopyala(k.dataset.kopya);
    const b = e.target.closest('button'); if (!b) return;
    e.preventDefault();
    if (b.dataset.a === 'kaydet') return kaydet(b);
    if (b.dataset.a === 'vazgec') return formSifirla();
    if (b.dataset.a === 'yenile') return yukle();
    if (b.dataset.g) { gorunum = b.dataset.g; el.querySelectorAll('.kck-sekmeler button').forEach((x) => x.classList.toggle('secili', x === b)); return ciz(); }
    if (b.dataset.ac) { b.disabled = true; const { error } = await sb.rpc('gm_kc_kod_kaydet', { p_id: Number(b.dataset.ac), p_veri: { aktif: b.dataset.v === '1' } }); if (error) bildir(error.message, 'hata'); return yukle(); }
    if (b.dataset.duzen) {
      const x = veri.kodlar.find((y) => y.id === Number(b.dataset.duzen)); if (!x) return;
      duzenId = x.id; $('.kck-form-baslik').textContent = `Kodu Düzenle — ${x.kod}`; el.querySelector('[data-a="kaydet"]').textContent = 'Kaydet'; el.querySelector('[data-a="vazgec"]').hidden = false; $('.kck-adet-alan').hidden = true;
      F('kod').value = x.kod; F('miktar').value = x.miktar; F('max').value = x.max; F('bitis').value = yerel(x.bitis); F('aciklama').value = x.aciklama || '';
      F('kod').focus();
    }
  });
  $('.kck-q').addEventListener('input', ciz);
  el.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  await yukle();
}

// oyuncu: kodu kullan → Knight Cash
export async function kcKodKullan(sb, charId, kod) {
  const { data, error } = await sb.rpc('kc_kod_yukle', { p_char: charId, p_kod: kod });
  if (error) return { ok: false, mesaj: error.message };
  return data;
}
