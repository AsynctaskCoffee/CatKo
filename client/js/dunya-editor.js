// GM paneli → Dünya editörü (panelin içine gömülü, kalıcı DOM: izleyici tuvali yeniden çizimlerde kaybolmaz).
//  • Obje kütüphanesi: istemcideki tüm haritaların benzersiz nesneleri (kutuphane.js) — ikon ızgarası, kategori / harita / arama süzgeci,
//    üzerine gelince taslak görünüm penceresinde dönen 3B önizleme. Modüller: Duvar modülü (geçilmez taş duvar).
//  • İzleyici modu: panel içindeki tuvalde serbest kamera (izleyici.js); fareyle zemine / binaya işaret edip tıklayarak yerleştir,
//    eklenmiş objeye tıklayarak seç. Yerleştirmeden önce yön, ölçek, duvar (çarpışma) ayarlanır.
//  • Seçili obje: konum / yön / ölçek / ad / duvar; döndür, ölçekle, taşı, imlecin altına taşı, odaklan, kopyala / kes / yapıştır / çoğalt, kaldır.
//  • Güvenlik: her değişiklik gm_obje_kaydet (GM yetkisi, sınır ve model denetimi, değişiklik günlüğü dunya_obje_log); kaldırma iki adımlı onaylı
//    ve geri alınabilir (yumuşak silme); Ctrl+Z / Ctrl+Y ile 100 adıma kadar geri al / yinele. Yerleştirme yalnız bulunduğun haritada.
import * as THREE from '../vendor/three.module.min.js';
import { kutup, sekilKur, guzelAd, KATEGORI, KUTUP_TABAN, ikonAtlas } from './kutuphane.js';
import { goster as kartGoster, gizle as kartGizle } from './onizleme-kart.js';
import { FIRCALAR, sekilUret } from './arazi.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const D = (r) => ((Math.round(r * 180 / Math.PI) % 360) + 360) % 360;
const IK = 46;   // ikon kutusu (px)
const ALAN = ['x', 'y', 'z', 'yaw', 'olcek', 'duvar', 'ad', 'gen', 'yuk', 'der', 'aktif'];
const anlik = (r) => Object.fromEntries(ALAN.map((k) => [k, r[k]]));

export function initDunyaEditor({ sb, character, zone, zoneName, state, player, hud, say }) {
  let kok = null, harita = zone, haritalar = null, objeler = [], secId = null;
  let K = null, kat = 'hepsi', hFiltre = '', ara = '', secModel = null;
  const yer = { yaw: 0, olcek: 1, duvar: false, gen: 4, yuk: 3, der: 0.8 };
  let pano = null, izgara = 0.5, zemin = true, hizala = false, coklu = new Set(), grupAdlandir = null, kapaliGrup = new Set(), silT = 0, silId = null;
  const geri = [], ileri = [];
  let sonIsin = null, isinBekle = false;
  // arazi / harita modları
  let mod = 'obje', arac = 'yukselt', boyaRaf = 0, halka = null, ozelHaritalar = null, haritaSilId = null, sifirlaT = 0;
  const fAyar = { yaricap: 12, guc: 8, yukseklik: 15, yuzey: 0 };
  let YZ = null, yzAile = '', yzAra = '';   // yüzey kütüphanesi dizini (assets/yuzey/yuzey.json)
  const yzYukle = () => (YZ ||= fetch((window.KO_V || ((u) => u))('./assets/yuzey/yuzey.json')).then((r) => r.json()).then((j) => { j.aile = j.adlar.map((a) => a.split('#')[0].replace(/_\d+$/, '')); j.aileler = [...new Set(j.aile)].sort(); return j; }).catch(() => { YZ = null; return null; }));
  try { Object.assign(fAyar, JSON.parse(localStorage.getItem('ko-de-firca') || '{}')); arac = localStorage.getItem('ko-de-arac') || arac; } catch {}
  const yeniH = { ad: '', sablon: 'moradon', sekil: 'tepeler', taban: 20, tohum: 1 + Math.floor(Math.random() * 99999) };
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); throw error; } return data; };
  const $ = (s) => kok?.querySelector(s);
  const hAd = (id) => haritalar?.find((z) => z.id === id)?.name || id;
  const burada = () => harita === zone;
  const izl = () => state.izleyici;
  const izAktif = () => !!izl()?.aktif && burada();
  const snap = (v) => (izgara ? Math.round(v / izgara) * izgara : v);
  const modelAd = (m) => (m === 'duvar' ? 'Duvar modülü' : String(m).startsWith('k:') ? guzelAd(m.slice(2)) : m);

  // ---------- iskelet
  function kur() {
    kok = document.createElement('div'); kok.className = 'g2-gomulu de2';
    kok.innerHTML = `
      <div class="de2-ust">
        <label class="de2-et">Harita <select data-de="harita"><option value="${esc(zone)}">${esc(zoneName())}</option></select></label>
        <div class="de2-mod"><button data-de="mod" data-v="obje" class="secili">Objeler</button><button data-de="mod" data-v="arazi">Arazi</button><button data-de="mod" data-v="harita">Haritalar</button></div>
        <button data-de="git" class="g2-ikincil" hidden>Bu haritaya git</button>
        <span class="de2-cizgi"></span>
        <button data-de="izle" class="g2-ana">İzleyici modunu başlat</button>
        <button data-de="karakter" title="İzleyici kamerasını karakterinin arkasına getir">Karakter<span class="de2-uzun">e dön</span></button>
        <label class="de2-et" title="Yerleştirme ve taşıma adımı">Izgara <select data-de="izgara"><option value="0">Kapalı</option><option value="0.25">0,25 m</option><option value="0.5" selected>0,5 m</option><option value="1">1 m</option><option value="2">2 m</option><option value="4">4 m</option></select></label>
        <label class="de2-et de2-cb" title="Açık: imlecin altındaki yüzeye oturur (arazi, kale duvarı, bina, köprü, eklenmiş obje). Kapalı: yalnız araziye."><input type="checkbox" data-de="zemin" checked> Yüzeyi algıla</label>
        <label class="de2-et de2-cb" title="Duvar gibi dik yüzeylerde obje yüzeyden dışarı bakacak şekilde döner"><input type="checkbox" data-de="hizala"> Yüzeye hizala</label>
        <span class="de2-esnek"></span>
        <button data-de="geri" class="de2-ikon-d" title="Geri al (Ctrl+Z)" disabled>↶</button><button data-de="ileri" class="de2-ikon-d" title="Yinele (Ctrl+Y)" disabled>↷</button>
      </div>
      <div class="de2-ana">
        <aside class="de2-kutup">
          <div class="de2-kat"></div>
          <div class="de2-suz"><select data-de="hfiltre"><option value="">Tüm haritalar</option></select><input data-de="ara" placeholder="Obje ara…" autocomplete="off"></div>
          <div class="de2-izgara"><div class="g2-bos">Kütüphane yükleniyor…</div></div>
          <div class="de2-kutup-alt"><span class="de2-sayi"></span></div>
        </aside>
        <section class="de2-gorus">
          <canvas class="de2-tuval"></canvas>
          <div class="de2-kapali"><b>İzleyici modu kapalı</b><p>Haritayı panelin içinde serbest kamerayla gez; kütüphaneden obje seçip fareyle işaret ettiğin yere yerleştir.</p><button data-de="izle" class="g2-ana">İzleyici modunu başlat</button></div>
          <div class="de2-durum"></div>
          <div class="de2-yardim"><b>W A S D</b> gez · <b>Q / E</b> alçal / yüksel · <b>Shift</b> hızlı · <b>sağ tuş sürükle</b> etrafa bak · <b>tekerlek</b> hız<br><b>sol tık</b> yerleştir / seç · <b>R / T</b> döndür · <b>[ ]</b> ölçek · <b>G</b> imlece taşı · <b>F</b> odaklan · <b>Del</b> kaldır · <b>Esc</b> bırak · <b>Ctrl+Z / Y C X V D</b></div>
        </section>
        <aside class="de2-sag">
          <div class="de2-arazi"></div>
          <div class="de2-haritalar"></div>
          <div class="de2-yer"></div>
          <div class="de2-denet"></div>
          <div class="de2-liste-bas"><b>Haritadaki objeler</b><span class="de2-liste-sayi"></span><button data-de="yenile" title="Listeyi yenile">↻</button></div>
          <div class="de2-liste"></div>
        </aside>
      </div>`;
    kok.addEventListener('click', tikla);
    kok.addEventListener('change', degisti);
    kok.addEventListener('input', (e) => { if (e.target.dataset.yz === 'ara') { yzAra = e.target.value.trim().toLowerCase(); clearTimeout(kur.y); kur.y = setTimeout(() => { araziCiz(); const i = $('[data-yz=ara]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); return; } if (e.target.dataset.fa) return degisti(e); if (e.target.dataset.hf === 'ad') { yeniH.ad = e.target.value; return; } if (e.target.dataset.de === 'ara') { ara = e.target.value.trim().toLowerCase(); clearTimeout(kur.t); kur.t = setTimeout(izgaraCiz, 160); } });
    // odak panelin dışındayken de (ör. devre dışı kalan düğmeden sonra) geri al / yinele çalışsın
    document.addEventListener('keydown', (e) => {
      if (!kok?.isConnected || kok.offsetParent === null || kok.contains(e.target) || e.defaultPrevented || /INPUT|SELECT|TEXTAREA/.test(e.target?.tagName || '')) return;
      if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) kisayol(e);
    }, true);
    kok.addEventListener('keydown', (e) => { if (e.target.closest('.de2-tuval')) return; if (e.target.matches('input, select, textarea')) { if (e.target.matches('.de2-grup-ad')) { if (e.key === 'Enter') grupAdKaydet(e.target.dataset.gad, e.target.value); else if (e.key === 'Escape') { grupAdlandir = null; listeCiz(); } return; } if (e.key === 'Enter' && e.target.matches('[data-f="cgrup"]')) { grupIslem('grupla'); return; } if (e.key === 'Enter' && e.target.closest('.de2-denet')) uygulaForm(); return; } kisayol(e); });
    kok.addEventListener('pointerover', (e) => { const m = e.target.closest('.de2-ik'); if (m) onizleGoster(m); });
    kok.addEventListener('pointerout', (e) => { if (e.target.closest('.de2-ik') && !e.relatedTarget?.closest?.('.de2-ik')) onizleGizle(); });
    sb.from('zones').select('id,name,available').eq('available', true).order('sort').then(({ data }) => {
      haritalar = data || [];
      const sel = $('[data-de=harita]'); sel.innerHTML = haritalar.map((z) => `<option value="${esc(z.id)}" ${z.id === harita ? 'selected' : ''}>${esc(z.name)}${z.id === zone ? ' — buradasın' : ''}</option>`).join('');
      hFiltreCiz();
    }, () => {});
    kutup().then((j) => { K = j; katCiz(); hFiltreCiz(); izgaraCiz(); }).catch((e) => { $('.de2-izgara').innerHTML = `<div class="g2-bos">Obje kütüphanesi yüklenemedi: ${esc(e.message)}</div>`; });
    objelerYukle();
    yerCiz(); denetCiz(); ustCiz();
  }
  function ustCiz() {
    if (!kok) return;
    const g = $('[data-de=git]'); g.hidden = burada();
    const ia = izAktif();
    kok.querySelectorAll('[data-de=izle]').forEach((b) => { b.innerHTML = ia ? 'İzleyici<span class="de2-uzun"> modunu kapat</span>' : 'İzleyici<span class="de2-uzun"> modunu başlat</span>'; b.disabled = !burada() || !izl(); b.classList.toggle('g2-ana', !ia); });
    $('[data-de=karakter]').disabled = !ia;
    kok.classList.toggle('izliyor', ia);
    $('.de2-kapali p').textContent = !burada() ? `İzleyici modu yalnız bulunduğun haritada çalışır. ${hAd(harita)} haritasını düzenlemek için "Bu haritaya git".` : !izl() ? 'Harita yükleniyor…' : 'Haritayı panelin içinde serbest kamerayla gez; kütüphaneden obje seçip fareyle işaret ettiğin yere yerleştir.';
    if (mod === 'arazi') { $('[data-de=geri]').disabled = !state.arazi?.geriVar; $('[data-de=ileri]').disabled = !state.arazi?.ileriVar; }
    else { $('[data-de=geri]').disabled = !geri.length; $('[data-de=ileri]').disabled = !ileri.length; }
    $('[data-de=geri]').title = `Geri al (Ctrl+Z) — sınırsız · ${mod === 'arazi' ? 'arazi' : 'objeler'}`; $('[data-de=ileri]').title = `Yinele (Ctrl+Y) — sınırsız · ${mod === 'arazi' ? 'arazi' : 'objeler'}`;
  }

  // ---------- kütüphane
  function katCiz() {
    const say = (k) => (K ? K.sekiller.filter((s) => !s.bos && s.ust == null && (k === 'hepsi' || s.kat === k) && (!hFiltre || s.harita.includes(hFiltre))).length : 0);
    $('.de2-kat').innerHTML = [['hepsi', 'Tümü'], ...KATEGORI, ['modul', 'Modüller']].map(([k, a]) => `<button data-kat="${k}" class="${kat === k ? 'secili' : ''}">${a}<small>${k === 'modul' ? 1 : say(k)}</small></button>`).join('');
  }
  function hFiltreCiz() {
    if (!K) return;
    const sayac = new Map(); for (const s of K.sekiller) if (s.ust == null) for (const h of s.harita) sayac.set(h, (sayac.get(h) || 0) + 1);
    const sel = $('[data-de=hfiltre]');
    sel.innerHTML = '<option value="">Tüm haritalar</option>' + [...sayac.entries()].sort((a, b) => hAd(a[0]).localeCompare(hAd(b[0]), 'tr')).map(([h, n]) => `<option value="${esc(h)}" ${h === hFiltre ? 'selected' : ''}>${esc(hAd(h))} (${n})</option>`).join('');
  }
  const ikonBtn = (s) => { const a = ikonAtlas(s.id); return `<button class="de2-ik${secModel?.model === 'k:' + s.ad ? ' secili' : ''}${s.parcaSay ? ' takim' : ''}" data-model="k:${esc(s.ad)}" data-ad="${esc(guzelAd(s.ad))}" data-i="${s.id}"><i style="background-image:url(${(window.KO_V || ((u) => u))(a.dosya)});${ikonStil(a.i)}"></i>${s.parcaSay ? `<b>${s.parcaSay}</b>` : ''}</button>`; };
  const ikonStil = (i) => `background-position:${-(i % 32) * IK}px ${-Math.floor(i / 32) * IK}px;background-size:${32 * IK}px auto`;
  function izgaraCiz() {
    const kutu = $('.de2-izgara'); if (!kutu) return;
    if (kat === 'modul') {
      kutu.innerHTML = `<button class="de2-ik de2-modul${secModel?.model === 'duvar' ? ' secili' : ''}" data-model="duvar" data-ad="Duvar modülü"><i class="de2-duvar"></i><span>Duvar modülü</span></button>`;
      $('.de2-sayi').textContent = 'Modüller: geçilmez taş duvar (en / yükseklik / kalınlık ayarlanır)'; return;
    }
    if (!K) return;
    const l = K.sekiller.filter((s) => !s.bos && s.ust == null && (kat === 'hepsi' || s.kat === kat) && (!hFiltre || s.harita.includes(hFiltre)) && (!ara || s.ad.includes(ara) || guzelAd(s.ad).toLowerCase().includes(ara)));
    kutu.innerHTML = l.map(ikonBtn).join('') || '<div class="g2-bos">Eşleşen obje yok.</div>';
    $('.de2-sayi').textContent = `${l.length.toLocaleString('tr-TR')} obje${hFiltre ? ' · ' + hAd(hFiltre) : ''}`;
  }
  function modelSec(model, ad) {
    onizleGizle();
    if (secModel?.model === model) { secModel = null; } else secModel = { model, ad };
    kok.querySelectorAll('.de2-ik.secili').forEach((b) => b.classList.remove('secili'));
    if (secModel) kok.querySelector(`.de2-ik[data-model="${CSS.escape(model)}"]`)?.classList.add('secili');
    if (secModel) { yer.duvar = model === 'duvar'; yer.olcek = 1; }
    hayaletKur(); yerCiz();
  }

  // ---------- taslak görünüm (üzerine gelince dönen 3B önizleme)
  function onizleGoster(el) {
    const model = el.dataset.model; if (!model) return;
    const s = model.startsWith('k:') ? K?.adla.get(model.slice(2)) : null;
    let bilgi;
    if (s) { const k = s.kutu, olc = `${(k[3] - k[0]).toFixed(1)} × ${(k[5] - k[2]).toFixed(1)} × ${(k[4] - k[1]).toFixed(1)} m`;
      bilgi = `<b>${esc(guzelAd(s.ad))}</b><i>${esc(s.ad)}</i><span>${esc((KATEGORI.find((x) => x[0] === s.kat) || ['', 'Diğer'])[1])} · ${olc}</span><span>Haritalar: ${s.harita.slice(0, 4).map((h) => esc(hAd(h))).join(', ')}${s.harita.length > 4 ? ` +${s.harita.length - 4}` : ''} · ${s.adet.toLocaleString('tr-TR')} kez kullanılmış</span>`; }
    else bilgi = '<b>Duvar modülü</b><span>Taş duvar kutusu: en, yükseklik ve kalınlık ayarlanır. Oyuncular içinden geçemez.</span>';
    kartGoster(el, { yan: el.closest('.de2-kutup, .de2-sag') || null, anahtar: model, bilgiHtml: bilgi, yap: () => (model === 'duvar' ? duvarOrnek() : sekilKur(model.slice(2))) });
  }
  function onizleGizle() { kartGizle(); }
  function duvarOrnek() { const m = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.8), new THREE.MeshLambertMaterial({ color: 0x9a907e })); m.position.y = 1.5; const g = new THREE.Group(); g.add(m); return g; }

  // ---------- yerleştirme hayaleti
  function hayaletKur() {
    if (!secModel || !burada()) { state.dunya?.onizle?.(null); return; }
    const p = hayaletKonum(); state.dunya?.onizle?.(secModel.model, p);
  }
  // yüzey algılama: ışının çarptığı yüzey (arazi / bina / kale duvarı / eklenmiş obje); kapalıysa yalnız arazi
  const yuzeyde = () => zemin && sonIsin?.yuzey && sonIsin.yuzey !== 'arazi';   // arazi dışı yüzeyde ızgaraya yapıştırma (duvardan taşmasın)
  /** (x, z)'de ustY altındaki yüzey: "Yüzeyi algıla" açıkken arazi + harita nesneleri (duvar / bina üstü) + eklenmiş objeler; kapalıyken yalnız arazi */
  const inis = (x, z, ustY, haric = null) => (zemin && izl()?.asagi ? izl().asagi(x, z, ustY, haric).y : (state.heightAt?.(x, z) ?? ustY ?? 0));
  const yuzeyY = (n, x, z) => +(zemin ? n.y : (state.heightAt?.(x, z) ?? n.y)).toFixed(3);
  const hizaYaw = () => { const nr = sonIsin?.normal; if (!hizala || !nr || Math.abs(nr.y) > 0.6) return null; return +Math.atan2(nr.x, nr.z).toFixed(3); };
  function hayaletKonum() {
    if (izAktif() && sonIsin?.nokta) { const n = sonIsin.nokta; const x = yuzeyde() ? n.x : snap(n.x), z = yuzeyde() ? n.z : snap(n.z); return { x, z, y: yuzeyY(n, x, z), yaw: hizaYaw() ?? yer.yaw, olcek: yer.olcek }; }
    const p = player.position, yw = state.yaw || 0, x = snap(p.x + Math.sin(yw) * 4), z = snap(p.z + Math.cos(yw) * 4);
    return { x, z, y: inis(x, z, p.y + 3), yaw: yer.yaw, olcek: yer.olcek, gorunur: !izAktif() };
  }
  // birleşik şekil: takımın tamamı ya da tek tek parçaları
  function parcaIzgara() {
    if (!K || !secModel?.model?.startsWith('k:')) return '';
    const s = K.adla.get(secModel.model.slice(2)); if (!s) return '';
    const ana = s.ust != null ? K.sekiller[s.ust] : s; if (!ana.parcaSay) return '';
    const parcalar = K.sekiller.filter((x) => x.ust === ana.id);
    return `<div class="de2-parcalar"><div class="de2-kart-bas">Parçalar <span>${parcalar.length} parça · birini seçip tek başına yerleştir</span></div>
      <div class="de2-izgara de2-p-izgara">${ikonBtn(ana).replace('class="de2-ik', 'title="Takımın tamamı" class="de2-ik de2-tumu')}${parcalar.map(ikonBtn).join('')}</div></div>`;
  }
  function yerCiz() {
    const k = $('.de2-yer'); if (!k) return;
    if (!secModel) { k.innerHTML = `<div class="de2-kart-bas">Yerleştirme</div><p class="ay-not">Kütüphaneden bir obje seç. İzleyici modunda fareyle işaret edip sol tıkla; kapalıyken karakterinin önüne yerleştirilir.</p>`; return; }
    const duv = secModel.model === 'duvar';
    k.innerHTML = `<div class="de2-kart-bas">Yerleştir: <b>${esc(secModel.ad)}</b><button data-de="birak" title="Seçimi bırak (Esc)">✕</button></div>
      <div class="de2-form">
        <label>Yön (°)<input type="number" data-yer="yaw" step="15" value="${D(yer.yaw)}"></label>
        <label>Ölçek<input type="number" data-yer="olcek" step="0.1" min="0.05" max="50" value="${yer.olcek}"></label>
        ${duv ? `<label>En (m)<input type="number" data-yer="gen" step="0.5" min="0.5" max="200" value="${yer.gen}"></label><label>Yükseklik<input type="number" data-yer="yuk" step="0.5" min="0.5" max="100" value="${yer.yuk}"></label><label>Kalınlık<input type="number" data-yer="der" step="0.1" min="0.1" max="50" value="${yer.der}"></label>` : ''}
        <label class="de2-cb de2-genis"><input type="checkbox" data-yer="duvar" ${yer.duvar ? 'checked' : ''}> Duvar — oyuncular içinden geçemez</label>
      </div>
      <div class="g2-dugmeler"><button data-de="onume" class="g2-ana" ${burada() ? '' : 'disabled'}>Önüme yerleştir</button>${izAktif() ? '<span class="ay-not">ya da görüntüde tıkla</span>' : ''}</div>
      ${parcaIzgara()}`;
  }

  // ---------- haritadaki objeler
  async function objelerYukle() {
    let data = []; try { ({ data } = await sb.from('dunya_objeleri').select('*').eq('zone', harita).eq('aktif', true).order('id')); } catch {}
    objeler = data || []; if (secId != null && !objeler.some((o) => o.id === secId)) secId = null;
    listeCiz(); denetCiz();
  }
  function listeCiz() {
    const k = $('.de2-liste'); if (!k) return;
    $('.de2-liste-sayi').textContent = `${objeler.length} · ${hAd(harita)}`;
    const satir = (r) => `<div class="de2-satir${r.id === secId || coklu.has(r.id) ? ' secili' : ''}${r.grup ? ' grupta' : ''}" data-oid="${r.id}"><b>${esc(r.ad || modelAd(r.model))}</b><i>#${r.id} · X ${(+r.x).toFixed(1)} Z ${(+r.z).toFixed(1)}${r.duvar ? ' · <em>duvar</em>' : ''}</i></div>`;
    const gruplar = new Map(); for (const r of objeler) if (r.grup) { if (!gruplar.has(r.grup)) gruplar.set(r.grup, []); gruplar.get(r.grup).push(r); }
    const gBas = (ad, l) => { const tum = l.every((r) => coklu.has(r.id)), kap = kapaliGrup.has(ad);
      return `<div class="de2-grup${tum ? ' secili' : ''}" data-grup="${esc(ad)}">${grupAdlandir === ad
        ? `<input class="de2-grup-ad" data-gad="${esc(ad)}" value="${esc(ad)}" maxlength="40"><button data-gk="adkaydet" title="Kaydet (Enter)">✓</button><button data-gk="advazgec" title="Vazgeç (Esc)">✕</button>`
        : `<button data-gk="ac" class="de2-grup-ok" title="${kap ? 'Aç' : 'Kapat'}">${kap ? '▸' : '▾'}</button><b data-gk="sec" title="Grubun tüm objelerini seç">▣ ${esc(ad)}</b><span>${l.length}</span><button data-gk="adlandir" title="Yeniden adlandır">✎</button><button data-gk="dagit" title="Grubu dağıt (objeler kalır)">⊘</button>`}</div>${kap ? '' : `<div class="de2-grup-ic">${l.map(satir).join('')}</div>`}`; };
    const tek = objeler.filter((r) => !r.grup);
    k.innerHTML = (gruplar.size || tek.length) ? [...gruplar].sort((a, b) => a[0].localeCompare(b[0], 'tr')).map(([ad, l]) => gBas(ad, l)).join('') + (gruplar.size && tek.length ? '<div class="de2-grup-ayrac">Grupsuz</div>' : '') + tek.map(satir).join('') : '<div class="g2-bos">Bu haritada eklenmiş obje yok.</div>';
    k.querySelector('.de2-grup-ad')?.focus();
    k.querySelector('.secili')?.scrollIntoView({ block: 'nearest' });
  }
  /** çoklu seçim: Ctrl / Shift tıklama ekler-çıkarır; grup başlığı tüm üyeleri seçer */
  function cokluCiz() { state.dunya?.sec?.(burada() ? (coklu.size > 1 ? [...coklu] : secId) : null); }
  function cokSec(ids, ekle = false) {
    if (!ekle) coklu.clear();
    for (const id of ids) coklu.add(id);
    secId = coklu.size === 1 ? [...coklu][0] : null; silId = null;
    cokluCiz(); listeCiz(); denetCiz();
  }
  function cokDegis(id) { if (coklu.size === 0 && secId != null) coklu.add(secId); if (coklu.has(id)) coklu.delete(id); else coklu.add(id); secId = coklu.size === 1 ? [...coklu][0] : null; silId = null; cokluCiz(); listeCiz(); denetCiz(); }
  const grupAdlari = () => [...new Set(objeler.map((r) => r.grup).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  function sec(id, odak = false) {
    coklu.clear(); if (id != null) coklu.add(id);
    secId = id; state.dunya?.sec?.(burada() ? id : null); silId = null;
    listeCiz(); denetCiz();
    const o = objeler.find((x) => x.id === id);
    if (o && odak && izAktif()) izl().git(+o.x, +o.y, +o.z, Math.max(8, 6 * (+o.olcek || 1)));
  }
  function cokluHtml() {
    const l = objeler.filter((r) => coklu.has(r.id)), gr = [...new Set(l.map((r) => r.grup).filter(Boolean))], b = burada();
    return `<div class="de2-kart-bas">Çoklu seçim: <b>${l.length} obje</b>${gr.length === 1 && l.length === objeler.filter((r) => r.grup === gr[0]).length ? `<span>grup: ${esc(gr[0])}</span>` : ''}<button data-de="secim-birak" title="Seçimi bırak (Esc)">✕</button></div>
      <div class="de2-form"><label class="de2-genis">Grup adı<input data-f="cgrup" list="de2-gruplar" value="${esc(gr.length === 1 ? gr[0] : '')}" maxlength="40" placeholder="ör. Kale kapısı süsleri"></label><datalist id="de2-gruplar">${grupAdlari().map((g) => `<option value="${esc(g)}">`).join('')}</datalist></div>
      <div class="g2-dugmeler"><button data-de="grupla" class="g2-ana">Grupla</button>${gr.length ? '<button data-de="gruptan-cikar">Gruptan çıkar</button>' : ''}</div>
      <div class="de2-arac">
        <button data-de="ctas" data-v="x-">X−</button><button data-de="ctas" data-v="x+">X+</button><button data-de="ctas" data-v="z-">Z−</button><button data-de="ctas" data-v="z+">Z+</button><button data-de="ctas" data-v="y+">Y↑</button><button data-de="ctas" data-v="y-">Y↓</button>
        <button data-de="cdon" data-v="-15" title="Grup merkezinin çevresinde">⟲ 15°</button><button data-de="cdon" data-v="15">⟳ 15°</button><button data-de="cdon" data-v="90">90°</button>
      </div>
      <div class="g2-dugmeler">${b && izAktif() ? '<button data-de="cimlec" title="Grubu imlecin altına taşı (G)">İmlece taşı</button>' : ''}${b ? '<button data-de="ccogalt">Çoğalt</button>' : ''}<button data-de="csil" class="g2-tehlike">${silId === -1 ? 'Emin misin? Tekrar bas' : 'Hepsini kaldır'}</button></div>
      <p class="ay-not">Ctrl / Shift + tıklama ile seçime ekle-çıkar. Gruplanan objeler listede başlık altında toplanır; başlığa tıklayınca grubun tamamı seçilir ve birlikte taşınır / döner. Ctrl+Z tüm grup işlemini tek adımda geri alır.</p>`;
  }
  function denetCiz() {
    const k = $('.de2-denet'); if (!k) return;
    if (coklu.size > 1) { k.innerHTML = cokluHtml(); return; }
    const o = objeler.find((x) => x.id === secId);
    if (!o) { k.innerHTML = `<div class="de2-kart-bas">Seçili obje</div><p class="ay-not">Görüntüde bir objeye tıkla ya da listeden seç.</p>${pano ? `<div class="g2-dugmeler"><button data-de="yapistir" ${burada() ? '' : 'disabled'}>Yapıştır: ${esc(pano.ad || modelAd(pano.model))}</button></div>` : ''}`; return; }
    const f = (n, v, st = 0.1, ek = '') => `<input type="number" data-f="${n}" step="${st}" value="${v ?? ''}" ${ek}>`;
    const b = burada();
    k.innerHTML = `<div class="de2-kart-bas">Seçili: <b>${esc(o.ad || modelAd(o.model))}</b><span>#${o.id}</span></div>
      <div class="de2-form">
        <label class="de2-genis">Ad<input data-f="ad" value="${esc(o.ad || '')}" maxlength="60"></label>
        <label class="de2-genis">Grup<input data-f="grup" list="de2-gruplar" value="${esc(o.grup || '')}" maxlength="40" placeholder="grupsuz"></label><datalist id="de2-gruplar">${grupAdlari().map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
        <label>X${f('x', (+o.x).toFixed(2))}</label><label>Y${f('y', (+o.y).toFixed(2))}</label><label>Z${f('z', (+o.z).toFixed(2))}</label>
        <label>Yön (°)${f('yaw', D(+o.yaw), 1)}</label><label>Ölçek${f('olcek', (+o.olcek).toFixed(2), 0.05, 'min="0.05" max="50"')}</label>
        ${o.model === 'duvar' ? `<label>En${f('gen', o.gen, 0.5)}</label><label>Yükseklik${f('yuk', o.yuk, 0.5)}</label><label>Kalınlık${f('der', o.der, 0.1)}</label>` : ''}
        <label class="de2-cb de2-genis"><input type="checkbox" data-f="duvar" ${o.duvar ? 'checked' : ''}> Duvar — oyuncular içinden geçemez</label>
      </div>
      <div class="de2-arac">
        <button data-de="don" data-v="-15" title="R">⟲ 15°</button><button data-de="don" data-v="15" title="T">⟳ 15°</button><button data-de="don" data-v="90">90°</button>
        <button data-de="olc" data-v="0.9" title="[">−%10</button><button data-de="olc" data-v="1.1" title="]">+%10</button><button data-de="olc" data-v="0">1:1</button>
        <button data-de="zemine" title="Altındaki yüzeye indir (Yüzeyi algıla kapalıysa araziye)">Yüzeye indir</button>
      </div>
      <div class="de2-arac">
        <button data-de="tas" data-v="x-">X−</button><button data-de="tas" data-v="x+">X+</button><button data-de="tas" data-v="z-">Z−</button><button data-de="tas" data-v="z+">Z+</button><button data-de="tas" data-v="y+">Y↑</button><button data-de="tas" data-v="y-">Y↓</button>
      </div>
      <div class="g2-dugmeler">
        <button data-de="kaydet" class="g2-ana" title="Enter">Kaydet</button>
        ${b ? '<button data-de="odak" title="F">Odaklan</button><button data-de="imlec" title="G — izleyicide imlecin altına">İmlece taşı</button><button data-de="onume-tas">Önüme taşı</button>' : ''}
        <button data-de="kopyala" title="Ctrl+C">Kopyala</button><button data-de="kes" title="Ctrl+X">Kes</button><button data-de="cogalt" ${b ? '' : 'disabled'} title="Ctrl+D">Çoğalt</button>
        <button data-de="sil" class="g2-tehlike" title="Delete">${silId === o.id ? 'Emin misin? Tekrar bas' : 'Kaldır'}</button>
      </div>
      ${pano ? `<div class="g2-dugmeler"><button data-de="yapistir" ${b ? '' : 'disabled'}>Yapıştır: ${esc(pano.ad || modelAd(pano.model))}${pano.kes ? ' (kesildi)' : ''}</button></div>` : ''}`;
  }

  // ---------- sunucu işlemleri + geri al
  async function kaydet(id, veri, mesaj, { gecmis = true } = {}) {
    const once = id != null ? objeler.find((x) => x.id === id) : null;
    const d = await rpc('gm_obje_kaydet', { p_id: id, p_veri: veri }).catch(() => null);
    if (!d?.ok) { if (d) hud.notice?.(d.reason || 'Could not save.', 'hata'); return null; }
    const r = d.obje;
    state.dunya?.uygula?.(r);
    const i = objeler.findIndex((x) => x.id === r.id);
    if (!r.aktif) { if (i >= 0) objeler.splice(i, 1); if (secId === r.id) { secId = null; state.dunya?.sec?.(null); } }
    else if (i >= 0) objeler[i] = r; else objeler.push(r);
    if (gecmis) { geri.push({ id: r.id, once: once ? anlik(once) : null, sonra: anlik(r) }); ileri.length = 0; }
    if (r.aktif && id == null) { secId = r.id; setTimeout(() => state.dunya?.sec?.(secId), 350); }
    if (mesaj) hud.info?.(mesaj, 'tamam');
    listeCiz(); denetCiz(); ustCiz();
    return r;
  }
  /** toplu kayıt (grup işlemleri): tek geri alma adımı */
  async function kaydetCok(liste, mesaj) {
    const kayit = [];
    for (const [id, veri] of liste) {
      const once = id != null ? objeler.find((x) => x.id === id) : null;
      const r = await kaydet(id, veri, null, { gecmis: false }); if (!r) continue;
      kayit.push({ id: r.id, once: once ? anlik(once) : null, sonra: anlik(r) });
    }
    if (kayit.length) { geri.push({ coklu: kayit }); ileri.length = 0; }
    if (mesaj && kayit.length) hud.info?.(mesaj, 'tamam');
    listeCiz(); denetCiz(); ustCiz(); cokluCiz();
    return kayit;
  }
  async function geriAl(yon) {
    const yigin0 = yon < 0 ? geri : ileri, son = yigin0[yigin0.length - 1];
    if (son?.coklu) {
      yigin0.pop();
      for (const k of son.coklu) { const hedef = yon < 0 ? k.once : k.sonra; const r = await kaydet(k.id, hedef ? { ...hedef, aktif: true } : { aktif: false }, null, { gecmis: false }); if (r?.aktif && !objeler.some((x) => x.id === r.id)) objeler.push(r); }
      (yon < 0 ? ileri : geri).push(son);
      hud.info?.(yon < 0 ? 'Undone.' : 'Redone.', 'tamam'); ustCiz(); listeCiz(); denetCiz(); cokluCiz(); return;
    }
    const yigin = yon < 0 ? geri : ileri, k = yigin.pop(); if (!k) return;
    const hedef = yon < 0 ? k.once : k.sonra;
    const veri = hedef ? { ...hedef, aktif: true } : { aktif: false };
    const r = await kaydet(k.id, veri, null, { gecmis: false });
    if (!r) { yigin.push(k); return; }
    (yon < 0 ? ileri : geri).push(k);
    if (r.aktif && !objeler.some((x) => x.id === r.id)) objeler.push(r);
    hud.info?.(yon < 0 ? 'Undone.' : 'Redone.', 'tamam'); ustCiz(); listeCiz(); denetCiz();
  }
  async function yerlestir(p) {
    if (!secModel || !burada()) return;
    const veri = { zone, model: secModel.model, ad: secModel.ad, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +(p.yaw ?? yer.yaw).toFixed(4), olcek: yer.olcek, duvar: !!yer.duvar };
    if (secModel.model === 'duvar') Object.assign(veri, { gen: yer.gen, yuk: yer.yuk, der: yer.der });
    await kaydet(null, veri, `${secModel.ad} placed.`);
  }
  const secili = () => objeler.find((x) => x.id === secId);
  async function grupIslem(k, b) {
    const l = objeler.filter((r) => coklu.has(r.id)); if (!l.length) return;
    const v = Number(b?.dataset?.v);
    if (k === 'secim-birak') return sec(null);
    if (k === 'grupla') { const ad = (kok.querySelector('[data-f="cgrup"]')?.value || '').trim() || `Grup ${grupAdlari().length + 1}`; return kaydetCok(l.map((r) => [r.id, { grup: ad }]), `${l.length} objects added to group "${ad}".`); }
    if (k === 'gruptan-cikar') return kaydetCok(l.filter((r) => r.grup).map((r) => [r.id, { grup: '' }]), 'Objects removed from the group.');
    if (k === 'ctas') {
      const yon = b.dataset.v, a = yon[0], adim = (yon.endsWith('+') ? 1 : -1) * (izgara || 0.5);
      return kaydetCok(l.map((r) => [r.id, { [a]: +(+r[a] + adim).toFixed(2) }]));
    }
    const mx = l.reduce((t, r) => t + +r.x, 0) / l.length, mz = l.reduce((t, r) => t + +r.z, 0) / l.length;
    if (k === 'cdon') {   // grup merkezi çevresinde döndür (konum + yön)
      const a = v * Math.PI / 180, c = Math.cos(a), s2 = Math.sin(a);
      return kaydetCok(l.map((r) => { const dx = +r.x - mx, dz = +r.z - mz; return [r.id, { x: +(mx + dx * c + dz * s2).toFixed(2), z: +(mz - dx * s2 + dz * c).toFixed(2), yaw: +((((+r.yaw + a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).toFixed(4) }]; }));
    }
    if (k === 'cimlec' && izAktif() && sonIsin?.nokta) {   // grup merkezi imlecin altına; yükseklik farkları korunur
      const n = sonIsin.nokta, my = Math.min(...l.map((r) => +r.y)), dy = yuzeyY(n, n.x, n.z) - my;
      return kaydetCok(l.map((r) => [r.id, { x: +(+r.x + n.x - mx).toFixed(2), z: +(+r.z + n.z - mz).toFixed(2), y: +(+r.y + dy).toFixed(2) }]), 'Group moved under the cursor.');
    }
    if (k === 'ccogalt' && burada()) {
      const kay = Math.max(2, izgara * 4), yeniAd = l[0].grup ? l[0].grup + ' (kopya)' : null;
      const r = await kaydetCok(l.map((o) => [null, { zone, model: o.model, ad: o.ad, yaw: o.yaw, olcek: o.olcek, duvar: o.duvar, gen: o.gen, yuk: o.yuk, der: o.der, x: +(+o.x + kay).toFixed(2), y: o.y, z: o.z, grup: yeniAd || '' }]), `${l.length} objects duplicated.`);
      return cokSec(r.map((x) => x.id));
    }
    if (k === 'csil') {
      if (silId !== -1 || performance.now() - silT > 4000) { silId = -1; silT = performance.now(); return denetCiz(); }
      silId = null; await kaydetCok(l.map((r) => [r.id, { aktif: false }]), `${l.length} objects removed (Ctrl+Z to undo).`); coklu.clear(); return denetCiz();
    }
  }
  async function islem(k, b) {
    if (coklu.size > 1 && ['secim-birak', 'grupla', 'gruptan-cikar', 'ctas', 'cdon', 'cimlec', 'ccogalt', 'csil'].includes(k)) return grupIslem(k, b);
    const o = secili(), v = Number(b?.dataset?.v);
    if (k === 'don' && secModel && !o) { yer.yaw = ((yer.yaw + v * Math.PI / 180) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); yerCiz(); return hayaletKur(); }
    if (!o) return;
    if (k === 'don') return kaydet(o.id, { yaw: +((((+o.yaw + v * Math.PI / 180) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).toFixed(4) });
    if (k === 'olc') return kaydet(o.id, { olcek: v ? Math.max(0.05, Math.min(50, +(o.olcek * v).toFixed(3))) : 1 });
    if (k === 'zemine') return kaydet(o.id, { y: +inis(+o.x, +o.z, +o.y + 0.5, o.id).toFixed(2) }, zemin ? 'Dropped onto the surface below.' : 'Dropped onto the terrain.');
    if (k === 'tas') {
      const yon = b.dataset.v, a = yon[0], adim = (yon.endsWith('+') ? 1 : -1) * (izgara || 0.5);
      if (a === 'y') return kaydet(o.id, { y: +(+o.y + adim).toFixed(2) });
      const veri = { [a]: +(+o[a] + adim).toFixed(2) }; const nx = a === 'x' ? veri.x : +o.x, nz = a === 'z' ? veri.z : +o.z;
      if (zemin) veri.y = +inis(nx, nz, +o.y + 2, o.id).toFixed(2);   // duvar / bina üstündeyken orada kalır, kenardan düşerse alttaki yüzeye
      return kaydet(o.id, veri);
    }
    if (k === 'kaydet') return uygulaForm();
    if (k === 'odak' && burada()) { if (!izAktif()) izleBaslat(); return sec(o.id, true); }
    if (k === 'imlec' && izAktif() && sonIsin?.nokta) { const n = sonIsin.nokta, x = yuzeyde() ? +n.x.toFixed(2) : snap(n.x), z = yuzeyde() ? +n.z.toFixed(2) : snap(n.z); const yw = hizaYaw(); return kaydet(o.id, { x, z, y: yuzeyY(n, x, z), ...(yw != null ? { yaw: yw } : {}) }, 'Moved under the cursor.'); }
    if (k === 'onume-tas' && burada()) { const p = player.position, yw = state.yaw || 0, x = +(p.x + Math.sin(yw) * 4).toFixed(2), z = +(p.z + Math.cos(yw) * 4).toFixed(2); return kaydet(o.id, { x, z, y: +inis(x, z, p.y + 3, o.id).toFixed(2) }, 'Moved in front of you.'); }
    if (k === 'kopyala') { pano = { model: o.model, ad: o.ad, yaw: o.yaw, olcek: o.olcek, duvar: o.duvar, gen: o.gen, yuk: o.yuk, der: o.der }; hud.info?.('Copied — Paste (Ctrl+V) to place it under the cursor / in front of you.', 'tamam'); return denetCiz(); }
    if (k === 'kes') { pano = { model: o.model, ad: o.ad, yaw: o.yaw, olcek: o.olcek, duvar: o.duvar, gen: o.gen, yuk: o.yuk, der: o.der, kes: true }; return kaydet(o.id, { aktif: false }, 'Cut — use Paste to place it somewhere new (Ctrl+Z to undo).'); }
    if (k === 'cogalt' && burada()) { const veri = { zone, model: o.model, ad: o.ad, yaw: o.yaw, olcek: o.olcek, duvar: o.duvar, gen: o.gen, yuk: o.yuk, der: o.der, x: +(+o.x + Math.max(1, izgara * 4)).toFixed(2), y: o.y, z: o.z }; return kaydet(null, veri, 'Duplicated.'); }
    if (k === 'sil') {
      if (silId !== o.id || performance.now() - silT > 4000) { silId = o.id; silT = performance.now(); denetCiz(); return; }
      silId = null; return kaydet(o.id, { aktif: false }, `${o.ad || modelAd(o.model)} removed (Ctrl+Z to undo).`);
    }
  }
  async function yapistir() {
    if (!pano || !burada()) return;
    const p = izAktif() && sonIsin?.nokta ? { x: snap(sonIsin.nokta.x), z: snap(sonIsin.nokta.z) } : (() => { const q = player.position, yw = state.yaw || 0; return { x: q.x + Math.sin(yw) * 4, z: q.z + Math.cos(yw) * 4 }; })();
    const veri = { ...pano, zone, x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +(izAktif() && sonIsin?.nokta && zemin ? sonIsin.nokta.y : inis(p.x, p.z, player.position.y + 3)).toFixed(2) }; delete veri.kes;
    const r = await kaydet(null, veri, `${pano.ad || modelAd(pano.model)} pasted.`);
    if (r && pano.kes) pano = null; denetCiz();
  }
  function uygulaForm() {
    const o = secili(); if (!o) return;
    const v = (n) => kok.querySelector(`[data-f="${n}"]`);
    const veri = { ad: v('ad').value.trim() || null, grup: v('grup')?.value.trim() || '', x: Number(v('x').value), y: Number(v('y').value), z: Number(v('z').value), yaw: (Number(v('yaw').value) || 0) * Math.PI / 180, olcek: Math.max(0.05, Math.min(50, Number(v('olcek').value) || 1)), duvar: v('duvar').checked };
    if (o.model === 'duvar') Object.assign(veri, { gen: Number(v('gen').value) || 4, yuk: Number(v('yuk').value) || 3, der: Number(v('der').value) || 0.8 });
    if (![veri.x, veri.y, veri.z].every(Number.isFinite)) return hud.notice?.('Invalid position.', 'hata');
    return kaydet(o.id, veri, 'Object saved.');
  }

  /** grubu yeniden adlandır (boş ad → dağıt): sunucuda tek seferde (gm_obje_grup) */
  async function grupAdKaydet(eski, yeni) {
    yeni = String(yeni ?? '').trim().slice(0, 40); grupAdlandir = null;
    if (yeni === eski) return listeCiz();
    const d = await rpc('gm_obje_grup', { p_zone: harita, p_eski: eski, p_yeni: yeni || null }).catch(() => null);
    if (!d?.ok) { hud.notice?.(d?.reason || 'Could not save the group.', 'hata'); return listeCiz(); }
    for (const r of objeler) if (r.grup === eski) r.grup = d.grup || null;
    if (kapaliGrup.delete(eski) && d.grup) kapaliGrup.add(d.grup);
    hud.info?.(d.grup ? `Group renamed to "${d.grup}" (${d.adet} objects).` : `Group "${eski}" disbanded (${d.adet} objects).`, 'tamam');
    listeCiz(); denetCiz();
  }
  // ---------- modlar: Objeler / Arazi / Haritalar
  function modSec(m) {
    mod = m; kok.dataset.mod = m;
    kok.querySelectorAll('[data-de=mod]').forEach((b) => b.classList.toggle('secili', b.dataset.v === m));
    if (m !== 'obje') { if (secModel) modelSec(secModel.model); state.dunya?.onizle?.(null); }
    if (m !== 'arazi') halkaGizle(); else halkaCiz();
    if (m === 'arazi') araziCiz(); if (m === 'harita') { haritaCiz(); haritalarYukle(); }
    ustCiz();
    durumCiz();
  }
  const faYaz = (k) => k === 'yaricap' ? fAyar.yaricap + ' m' : k === 'guc' ? (arac === 'yuzey' || arac === 'yuzeysil' ? '%' + Math.round(fAyar.guc / 60 * 100) : fAyar.guc + ' m/sn') : (fAyar.yukseklik > 0 ? '+' : '') + fAyar.yukseklik + ' m';
  function araziCiz() {
    const k = $('.de2-arazi'); if (!k || mod !== 'arazi') return;
    const A = state.arazi;
    if (!burada()) { k.innerHTML = `<div class="de2-kart-bas">Arazi yönetimi</div><p class="ay-not">Araziyi düzenlemek için o haritada olmalısın.</p><div class="g2-dugmeler"><button data-de="git" class="g2-ana">Bu haritaya git</button></div>`; return; }
    const hedefli = arac === 'duzlestir' || arac === 'plato';
    k.innerHTML = `<div class="de2-kart-bas">Arazi fırçası <span>${esc(zoneName())}</span></div>
      <div class="de2-fircalar">${FIRCALAR.map(([id, ad, ik]) => `<button data-de="arac" data-v="${id}" class="${arac === id ? 'secili' : ''}" title="${esc(ad)}"><i>${ik}</i><span>${esc(ad)}</span></button>`).join('')}</div>
      <div class="de2-form de2-firca-ayar">
        <label class="de2-genis">Fırça yarıçapı <b>${faYaz('yaricap')}</b><input type="range" data-fa="yaricap" min="2" max="80" step="1" value="${fAyar.yaricap}"></label>
        <label class="de2-genis">${arac === 'yuzey' || arac === 'yuzeysil' ? 'Boya hızı' : 'Güç'} <b>${faYaz('guc')}</b><input type="range" data-fa="guc" min="1" max="60" step="1" value="${fAyar.guc}"></label>
        ${arac === 'yuzey' ? '' : ''}${hedefli ? `<label class="de2-genis">${arac === 'plato' ? 'Plato yüksekliği' : 'Hedef farkı'} <b>${faYaz('yukseklik')}</b><input type="range" data-fa="yukseklik" min="-60" max="120" step="1" value="${fAyar.yukseklik}"></label>` : ''}
      </div>
      ${arac === 'yuzey' ? yuzeyHtml() : arac === 'yuzeysil' ? '<p class="ay-not">Yüzey sil: boyanan yüzeyi yumuşakça kaldırır, altındaki özgün zemin görünür.</p>' : ''}
      <p class="ay-not">${izAktif() ? 'Sol tuş basılı: uygula (bıraktığında bir adım). Ctrl + tekerlek yarıçap, Alt + tekerlek güç, [ ] yarıçap, Ctrl+Z geri al.' : 'Fırça için izleyici modunu başlat.'} Değişiklikler anında kaydedilir ve haritadaki herkes gerçek zamanlı görür.</p>
      ${izAktif() ? '' : '<div class="g2-dugmeler"><button data-de="izle" class="g2-ana">İzleyici modunu başlat</button></div>'}
      <div class="g2-dugmeler"><button data-de="a-geri" ${A?.geriVar ? '' : 'disabled'}>↶ Geri al</button><button data-de="a-ileri" ${A?.ileriVar ? '' : 'disabled'}>↷ Yinele</button></div>
      <div class="g2-dugmeler"><button data-de="a-sifirla" class="g2-tehlike" title="Arazi yüksekliği ve yüzey boyası özgün haline döner">${sifirlaT?.k === 'arazi' && performance.now() - sifirlaT.t < 4000 ? 'Emin misin? Tekrar bas' : 'Araziyi sıfırla'}</button><button data-de="a-sifirla-tum" class="g2-tehlike" title="Arazi, yüzey boyası ve haritaya eklenen tüm objeler">${sifirlaT?.k === 'tum' && performance.now() - sifirlaT.t < 4000 ? 'Emin misin? Tekrar bas' : 'Haritayı tamamen sıfırla'}</button></div>
      <div class="de2-a-durum">${A ? (A.bekleyen ? `Kaydediliyor… (${A.bekleyen} parça)` : 'Tüm değişiklikler kaydedildi.') : 'Arazi verisi yüklenmedi.'}</div>`;
  }
  /** yüzey kütüphanesi: tüm haritaların zemin yüzeyleri (küçük resim + aile süzgeci) */
  function yuzeyHtml() {
    const j = YZ && typeof YZ.then !== 'function' ? YZ : null;
    if (!j) { yzYukle().then((x) => { YZ = x; if (x && mod === 'arazi' && arac === 'yuzey') araziCiz(); }); return '<div class="de2-yz"><div class="g2-bos">Yüzey kütüphanesi yükleniyor…</div></div>'; }
    const P = 40, C = j.kucuk.cols, url = (window.KO_V || ((u) => u))('./assets/yuzey/kucuk.jpg');
    const l = j.adlar.map((a, i) => i).filter((i) => (!yzAile || j.aile[i] === yzAile) && (!yzAra || j.adlar[i].includes(yzAra)));
    return `<div class="de2-yz">
      <div class="de2-kart-bas">Yüzey kütüphanesi <span>${l.length} / ${j.adlar.length}</span></div>
      <div class="de2-yz-suz"><select data-yz="aile"><option value="">Tüm yüzeyler</option>${j.aileler.map((a) => `<option value="${esc(a)}" ${a === yzAile ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select><input data-yz="ara" placeholder="Ara…" value="${esc(yzAra)}"></div>
      <div class="de2-yz-izgara">${l.map((i) => `<button data-de="yz" data-v="${i}" class="${fAyar.yuzey === i ? 'secili' : ''}" title="${esc(j.adlar[i])}"><i style="background-image:url(${url});background-size:${C * 38}px auto;background-position:-${(i % C) * 38}px -${Math.floor(i / C) * 38}px"></i></button>`).join('')}</div>
      <div class="de2-yz-sec">Seçili: <b>${esc(j.adlar[fAyar.yuzey] || '—')}</b></div></div>`;
  }
  // fırça uygulaması: basılı tutulduğu sürece her karede imlecin altına
  function boyaBaslat() {
    const A = state.arazi; if (!A || boyaRaf) return;
    const n0 = sonIsin?.nokta; if (n0) A.basla(n0.x, n0.z);
    let son = performance.now(), durumT = 0;
    const kare = () => {
      boyaRaf = requestAnimationFrame(kare);
      const n = performance.now(), dt = Math.min(0.1, (n - son) / 1000); son = n;
      const f = izl()?.fare; if (f) sonIsin = izl().isin(f.x, f.y);
      const p = sonIsin?.nokta; if (!p) return;
      A.boya(p.x, p.z, arac, fAyar, dt); halkaCiz();
      if (n - durumT > 400) { durumT = n; const d = $('.de2-a-durum'); if (d) d.textContent = A.bekleyen ? `Kaydediliyor… (${A.bekleyen} parça)` : 'Tüm değişiklikler kaydedildi.'; }
    };
    boyaRaf = requestAnimationFrame(kare);
  }
  function boyaBitir() { cancelAnimationFrame(boyaRaf); boyaRaf = 0; state.arazi?.bitir(); araziCiz(); ustCiz(); setTimeout(araziCiz, 1200); }
  /** sıfırla: tum = false → arazi yüksekliği + yüzey boyası; tum = true → ayrıca haritaya eklenen tüm objeler.
   * Anında herkese yansır; Ctrl+Z ile geri alınır (arazi: Arazi modunda, objeler: Objeler modunda); sunucuda yedek tutulur. */
  async function araziSifirla(tum = false) {
    const anahtar = tum ? 'tum' : 'arazi';
    if (sifirlaT?.k !== anahtar || performance.now() - sifirlaT.t > 4000) { sifirlaT = { k: anahtar, t: performance.now() }; return araziCiz(); }
    sifirlaT = 0;
    const once = tum && harita === zone ? objeler.map((o) => ({ id: o.id, once: anlik(o), sonra: null })) : [];
    const d = await rpc('gm_arazi_sifirla', { p_zone: zone, p_obje: !!tum }).catch(() => null); if (!d?.ok) return;
    const n = state.arazi?.sifirla?.() || 0;
    if (tum && d.obje) {
      const silinen = new Set((d.objeler || []).map(Number));
      for (const o of objeler.filter((x) => silinen.has(Number(x.id)))) state.dunya?.uygula?.({ ...o, aktif: false });
      objeler = objeler.filter((x) => !silinen.has(Number(x.id))); secId = null; coklu.clear();
      const kayit = once.filter((x) => silinen.has(Number(x.id))); if (kayit.length) { geri.push({ coklu: kayit }); ileri.length = 0; }
      listeCiz(); denetCiz(); ustCiz();
    }
    hud.info?.(`${tum ? 'All world changes on this map' : 'Terrain edits'} reset${n ? ` (${n.toLocaleString('en-US')} points)` : ''}${tum && d.obje ? `, ${d.obje} objects removed` : ''}. You can undo with Ctrl+Z; a backup was kept on the server.`, 'tamam');
    araziCiz();
  }
  // fırça halkası: arazinin üstünde, yükseltiyi izleyen çember
  const HALKA_RENK = { yuzey: 0x38bdf8, yuzeysil: 0xf472b6, yukselt: 0x34d399, tepe: 0x34d399, sivri: 0x34d399, siradag: 0x34d399, plato: 0x60a5fa, alcalt: 0xf87171, cukur: 0xf87171, krater: 0xfb923c, duzlestir: 0xfbbf24, yumusat: 0xa78bfa, purtuz: 0xe5e7eb };
  function halkaCiz() {
    const p = sonIsin?.nokta, w = state.terrain?.parent;
    if (mod !== 'arazi' || !p || !w || !izAktif()) return halkaGizle();
    if (!halka) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(97 * 3), 3));
      halka = new THREE.Group();
      for (const k of [1, 0.5]) { const l = new THREE.Line(g.clone(), new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: k === 1 ? 0.95 : 0.45, depthTest: false })); l.userData.k = k; l.renderOrder = 999; l.frustumCulled = false; halka.add(l); }
    }
    if (halka.parent !== w) w.add(halka);
    halka.visible = true;
    for (const l of halka.children) {
      const a = l.geometry.attributes.position, R = fAyar.yaricap * l.userData.k;
      for (let i = 0; i <= 96; i++) { const t = (i / 96) * Math.PI * 2, x = p.x + Math.cos(t) * R, z = p.z + Math.sin(t) * R; a.setXYZ(i, x, (state.heightAt?.(x, z) ?? p.y) + 0.35, z); }
      a.needsUpdate = true; l.material.color.setHex(HALKA_RENK[arac] || 0x34d399);
    }
  }
  function halkaGizle() { if (halka) halka.visible = false; }

  // ---------- haritalar: oluştur / kaldır
  async function haritalarYukle() {
    try { const { data } = await sb.from('ozel_harita').select('*').is('silindi', null).order('created_at'); ozelHaritalar = data || []; } catch { ozelHaritalar = []; }
    haritaCiz();
  }
  const SEKIL = [['duz', 'Düz ova'], ['tepeler', 'Tepeler'], ['daglik', 'Dağlık'], ['ada', 'Ada'], ['vadi', 'Vadi'], ['plato', 'Platolar']];
  function haritaCiz() {
    const k = $('.de2-haritalar'); if (!k || mod !== 'harita') return;
    const sablonlar = (haritalar || []).filter((z) => !/^ozel_/.test(z.id));
    k.innerHTML = `<div class="de2-kart-bas">Yeni harita oluştur</div>
      <div class="de2-form">
        <label class="de2-genis">Harita adı<input data-hf="ad" maxlength="40" value="${esc(yeniH.ad)}" placeholder="ör. Kuzey Adası"></label>
        <label class="de2-genis">Zemin ve gökyüzü<select data-hf="sablon">${sablonlar.map((z) => `<option value="${esc(z.id)}" ${z.id === yeniH.sablon ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select></label>
        <label>Arazi şekli<select data-hf="sekil">${SEKIL.map(([v, a]) => `<option value="${v}" ${v === yeniH.sekil ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label>Taban (m)<input type="number" data-hf="taban" min="0" max="500" step="5" value="${yeniH.taban}"></label>
        <label class="de2-genis">Tohum<span class="de2-tohum"><input type="number" data-hf="tohum" min="1" max="99999" value="${yeniH.tohum}"><button data-de="h-zar" title="Rastgele">🎲</button></span></label>
      </div>
      <canvas class="de2-h-onizle" width="240" height="240"></canvas>
      <p class="ay-not">Zemin dokusu ve gökyüzü şablon haritadan alınır; arazi seçilen şekle göre üretilir, sonra Arazi fırçasıyla istediğin gibi düzenlenir. Objeleri Objeler modunda yerleştir.</p>
      <div class="g2-dugmeler"><button data-de="h-olustur" class="g2-ana">Haritayı oluştur</button></div>
      <div class="de2-kart-bas" style="margin-top:6px">Oluşturulan haritalar <span>${ozelHaritalar ? ozelHaritalar.length : '…'}</span></div>
      <div class="de2-h-liste">${ozelHaritalar == null ? '<div class="g2-bos">Yükleniyor…</div>' : ozelHaritalar.map((h) => `<div class="de2-h-satir"><span><b>${esc(h.ad)}</b><i>${esc(h.id)} · ${esc(hAd(h.sablon))} · ${esc((SEKIL.find((x) => x[0] === h.sekil) || ['', h.sekil])[1])}${h.id === zone ? ' · <em>buradasın</em>' : ''}</i></span>${h.id === zone ? '' : `<button data-de="h-git" data-id="${esc(h.id)}">Git</button>`}<button data-de="h-sil" data-id="${esc(h.id)}" class="g2-tehlike">${haritaSilId === h.id ? 'Emin misin?' : 'Kaldır'}</button></div>`).join('') || '<div class="g2-bos">Henüz oluşturulan harita yok.</div>'}</div>`;
    haritaOnizle();
  }
  /** yeni haritanın kuşbakışı önizlemesi (yükseklik → renk, gölgeli) */
  function haritaOnizle() {
    const cv = $('.de2-h-onizle'); if (!cv) return;
    const N = 129, z = { N, heights: new Float32Array(N * N), bits: new Uint32Array(N * N) };
    sekilUret(z, { sekil: yeniH.sekil, tohum: yeniH.tohum, taban: yeniH.taban });
    // önizleme 129 köşe (harita 1025): aynı şekil için gürültü ölçeğini eşitle
    const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N); let mn = Infinity, mx = -Infinity;
    for (const v of z.heights) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    for (let x = 0; x < N; x++) for (let k = 0; k < N; k++) {
      const h = z.heights[x * N + k], t = (h - mn) / Math.max(1, mx - mn), gx = z.heights[Math.min(N - 1, x + 1) * N + k] - h, gz = z.heights[x * N + Math.min(N - 1, k + 1)] - h;
      const isik = Math.max(0.45, Math.min(1.25, 1 - (gx + gz) * 0.04));
      // renk: alçak çimen yeşili → orta toprak → yüksek kaya grisi → zirve karı
      const R = [[74, 120, 52], [112, 140, 64], [150, 128, 88], [128, 120, 112], [236, 236, 240]], u = Math.min(0.999, t) * 4, i0 = Math.floor(u), f = u - i0, c0 = R[i0], c1 = R[i0 + 1];
      const r = c0[0] + (c1[0] - c0[0]) * f, g = c0[1] + (c1[1] - c0[1]) * f, b = c0[2] + (c1[2] - c0[2]) * f;
      const i = (k * N + x) * 4; img.data[i] = r * isik; img.data[i + 1] = g * isik; img.data[i + 2] = b * isik; img.data[i + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = N; tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
  }
  async function haritaOlustur() {
    const ad = (yeniH.ad || '').trim(); if (ad.length < 2) return hud.notice?.('Map name must be at least 2 characters.', 'hata');
    const d = await rpc('gm_harita_olustur', { p_ad: ad, p_sablon: yeniH.sablon, p_sekil: yeniH.sekil, p_taban: yeniH.taban, p_tohum: yeniH.tohum }).catch(() => null);
    if (!d?.ok) { if (d) hud.notice?.(d.reason || 'Could not create the map.', 'hata'); return; }
    hud.info?.(`Map "${d.ad}" created (${d.id}). Use Go in the list to switch to it.`, 'tamam');
    yeniH.ad = ''; yeniH.tohum = 1 + Math.floor(Math.random() * 99999);
    const { data } = await sb.from('zones').select('id,name,available').eq('available', true).order('sort'); haritalar = data || haritalar;
    const sel = $('[data-de=harita]'); if (sel) sel.innerHTML = haritalar.map((z) => `<option value="${esc(z.id)}" ${z.id === harita ? 'selected' : ''}>${esc(z.name)}${z.id === zone ? ' — buradasın' : ''}</option>`).join('');
    haritalarYukle();
  }
  async function haritaSil(id) {
    if (haritaSilId !== id) { haritaSilId = id; haritaCiz(); setTimeout(() => { if (haritaSilId === id) { haritaSilId = null; haritaCiz(); } }, 4000); return; }
    haritaSilId = null;
    const d = await rpc('gm_harita_sil', { p_id: id }).catch(() => null); if (!d?.ok) { if (d) hud.notice?.(d.reason || 'Could not remove.', 'hata'); return; }
    hud.info?.(`Map removed${d.tasinan ? ` — ${d.tasinan} characters on it were moved to Moradon` : ''}. The data is kept in backup.`, 'tamam');
    haritalar = haritalar.filter((z) => z.id !== id); haritalarYukle();
  }

  // ---------- izleyici
  function izleBaslat() {
    if (!burada() || !izl()) return;
    const cv = $('.de2-tuval');
    izl().bagla(cv, {
      basla: (h) => { if (mod !== 'arazi' || !state.arazi || !h?.nokta) return false; sonIsin = h; boyaBaslat(); return true; },
      bitir: () => boyaBitir(),
      tik: (h, e) => {
        if (mod !== 'obje') return;
        sonIsin = h; if (secModel && h?.nokta) return yerlestir(hayaletKonum());
        if (h?.obje) {
          const id = h.obje.id, r = objeler.find((x) => x.id === id);
          if (e?.ctrlKey || e?.metaKey || e?.shiftKey) return cokDegis(id);
          if (e?.altKey && r?.grup) return cokSec(objeler.filter((x) => x.grup === r.grup).map((x) => x.id));   // Alt + tık: objenin grubunu seç
          return sec(id);
        }
        if (secId != null || coklu.size) sec(null);
      },
      uzerinde: (e) => { onizleGizle(); if (isinBekle) return; isinBekle = true; requestAnimationFrame(() => { isinBekle = false; if (!izAktif()) return; sonIsin = izl().isin(e.clientX, e.clientY); durumCiz(); if (mod === 'arazi') halkaCiz(); else if (secModel) state.dunya?.onizleKonum?.(hayaletKonum()); }); },
      tus: (e) => { e.stopPropagation(); kisayol(e); },
      teker: (e) => { if (mod === 'arazi') { const y = e.deltaY < 0 ? 1 : -1; if (e.ctrlKey) fAyar.yaricap = Math.max(2, Math.min(80, fAyar.yaricap + y * 2)); else fAyar.guc = Math.max(1, Math.min(60, fAyar.guc + y)); try { localStorage.setItem('ko-de-firca', JSON.stringify(fAyar)); } catch {} halkaCiz(); return araziCiz(); } if (secModel) { yer.yaw = ((yer.yaw + Math.sign(e.deltaY) * Math.PI / 12) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); yerCiz(); state.dunya?.onizleKonum?.(hayaletKonum()); } },
      hiz: () => durumCiz(),
    });
    cv.focus({ preventScroll: true }); hayaletKur(); ustCiz(); yerCiz(); durumCiz(); if (mod === 'arazi') { araziCiz(); halkaCiz(); }
  }
  function izleDurdur() { izl()?.birak(); ustCiz(); yerCiz(); hayaletKur(); halkaGizle(); if (mod === 'arazi') araziCiz(); }
  function durumCiz() {
    const d = $('.de2-durum'); if (!d) return;
    const K2 = izl()?.konum, n = sonIsin?.nokta;
    d.innerHTML = izAktif() ? `Kamera X ${K2.x.toFixed(0)} Y ${K2.y.toFixed(0)} Z ${K2.z.toFixed(0)} · hız ${Math.round(izl().hiz)} m/sn${n ? ` · imleç X ${n.x.toFixed(1)} Y ${n.y.toFixed(1)} Z ${n.z.toFixed(1)} · yüzey: ${({ arazi: 'arazi', bina: 'bina', nesne: 'harita nesnesi', obje: 'eklenmiş obje' })[sonIsin?.yuzey] || '—'}${sonIsin?.normal && Math.abs(sonIsin.normal.y) < 0.6 ? ' (dik)' : ''}` : ''}${secModel ? ` · <b>${esc(secModel.ad)}</b> ${D(yer.yaw)}° ×${yer.olcek}` : ''}` : '';
  }
  function kisayol(e) {
    const c = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), o = secili();
    const yap = (f) => { e.preventDefault(); e.stopPropagation(); f(); };
    if (k === 'escape') return yap(() => { if (grupAdlandir) { grupAdlandir = null; listeCiz(); } else if (secModel) modelSec(secModel.model); else if (secId != null || coklu.size) sec(null); else if (izAktif()) izleDurdur(); });
    if (coklu.size > 1 && !c && k === 'g') return yap(() => grupIslem('cimlec'));
    if (mod === 'arazi' && c && (k === 'y' || (e.shiftKey && k === 'z'))) return yap(() => { state.arazi?.geriAl(1); araziCiz(); ustCiz(); });
    if (mod === 'arazi' && c && k === 'z') return yap(() => { state.arazi?.geriAl(-1); araziCiz(); ustCiz(); });
    if (mod === 'arazi' && (k === '[' || k === ']')) return yap(() => { fAyar.yaricap = Math.max(2, Math.min(80, fAyar.yaricap + (k === ']' ? 2 : -2))); halkaCiz(); araziCiz(); });
    if (c && k === 'z') return yap(() => geriAl(-1));
    if (c && (k === 'y' || (e.shiftKey && k === 'z'))) return yap(() => geriAl(1));
    if (c && k === 'c' && o) return yap(() => islem('kopyala'));
    if (c && k === 'x' && o) return yap(() => islem('kes'));
    if (c && k === 'v') return yap(() => yapistir());
    if (c && k === 'd' && o) return yap(() => islem('cogalt'));
    if (c) return;
    const sahte = (v) => ({ dataset: { v: String(v) } });
    if (k === 'r') return yap(() => islem('don', sahte(-15)));
    if (k === 't') return yap(() => islem('don', sahte(15)));
    if (k === '[' || k === '-') return yap(() => { if (secModel && !o) { yer.olcek = Math.max(0.05, +(yer.olcek * 0.9).toFixed(3)); yerCiz(); state.dunya?.onizleKonum?.(hayaletKonum()); } else islem('olc', sahte(0.9)); });
    if (k === ']' || k === '+' || k === '=') return yap(() => { if (secModel && !o) { yer.olcek = Math.min(50, +(yer.olcek * 1.1).toFixed(3)); yerCiz(); state.dunya?.onizleKonum?.(hayaletKonum()); } else islem('olc', sahte(1.1)); });
    if (k === 'delete' && o) return yap(() => islem('sil'));
    if (k === 'f' && o) return yap(() => islem('odak'));
    if (k === 'g' && o) return yap(() => islem('imlec'));
    if (o && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'pageup', 'pagedown'].includes(k)) return yap(() => {
      if (k === 'pageup') return islem('tas', { dataset: { v: 'y+' } }); if (k === 'pagedown') return islem('tas', { dataset: { v: 'y-' } });
      // kameraya göre: yukarı = kameranın baktığı yön
      const yw = izAktif() ? izl().konum.yaw : (state.yaw || 0), a = izgara || 0.5;
      const [fx, fz] = k === 'arrowup' ? [Math.sin(yw), Math.cos(yw)] : k === 'arrowdown' ? [-Math.sin(yw), -Math.cos(yw)] : k === 'arrowleft' ? [-Math.cos(yw), Math.sin(yw)] : [Math.cos(yw), -Math.sin(yw)];   // sol / sağ: kameraya göre (KO z ters)
      const x = +(+o.x + fx * a).toFixed(2), z = +(+o.z + fz * a).toFixed(2);
      return kaydet(o.id, { x, z, ...(zemin ? { y: +inis(x, z, +o.y + 2, o.id).toFixed(2) } : {}) });
    });
  }

  // ---------- olaylar
  function tikla(e) {
    const ik = e.target.closest('.de2-ik'); if (ik) return modelSec(ik.dataset.model, ik.dataset.ad);
    const kt = e.target.closest('[data-kat]'); if (kt) { kat = kt.dataset.kat; katCiz(); return izgaraCiz(); }
    const gk = e.target.closest('[data-gk]');
    if (gk) {
      const ad = gk.closest('[data-grup]')?.dataset.grup, uyeler = objeler.filter((r) => r.grup === ad).map((r) => r.id);
      if (gk.dataset.gk === 'sec') return cokSec(uyeler, e.ctrlKey || e.metaKey || e.shiftKey);
      if (gk.dataset.gk === 'ac') { if (kapaliGrup.has(ad)) kapaliGrup.delete(ad); else kapaliGrup.add(ad); return listeCiz(); }
      if (gk.dataset.gk === 'adlandir') { grupAdlandir = ad; return listeCiz(); }
      if (gk.dataset.gk === 'advazgec') { grupAdlandir = null; return listeCiz(); }
      if (gk.dataset.gk === 'adkaydet') return grupAdKaydet(ad, kok.querySelector('.de2-grup-ad')?.value);
      if (gk.dataset.gk === 'dagit') return grupAdKaydet(ad, '');
    }
    const sat = e.target.closest('[data-oid]');
    if (sat) { const id = Number(sat.dataset.oid); if (e.ctrlKey || e.metaKey || e.shiftKey) return cokDegis(id); return sec(id, true); }
    const b = e.target.closest('button[data-de]'); if (!b) return;
    const k = b.dataset.de;
    if (k === 'mod') return modSec(b.dataset.v);
    if (k === 'arac') { arac = b.dataset.v; try { localStorage.setItem('ko-de-arac', arac); } catch {} return araziCiz(); }
    if (k === 'yz') { fAyar.yuzey = Number(b.dataset.v) || 0; try { localStorage.setItem('ko-de-firca', JSON.stringify(fAyar)); } catch {} kok.querySelectorAll('.de2-yz-izgara .secili').forEach((x) => x.classList.remove('secili')); b.classList.add('secili'); const sb2 = $('.de2-yz-sec b'); if (sb2) sb2.textContent = YZ?.adlar?.[fAyar.yuzey] || ''; state.izleyici && izAktif() && $('.de2-tuval')?.focus({ preventScroll: true }); return; }
    if (k === 'a-geri') { state.arazi?.geriAl(-1); return araziCiz(); }
    if (k === 'a-ileri') { state.arazi?.geriAl(1); return araziCiz(); }
    if (k === 'a-sifirla') return araziSifirla(false);
    if (k === 'a-sifirla-tum') return araziSifirla(true);
    if (k === 'h-olustur') return haritaOlustur();
    if (k === 'h-zar') { yeniH.tohum = 1 + Math.floor(Math.random() * 99999); return haritaCiz(); }
    if (k === 'h-git') { harita = b.dataset.id; return haritayaGit(); }
    if (k === 'h-sil') return haritaSil(b.dataset.id);
    if (k === 'izle') return izAktif() ? izleDurdur() : izleBaslat();
    if (k === 'karakter') { izl()?.karakteraDon(); return; }
    if (k === 'git') return haritayaGit();
    if (k === 'yenile') return objelerYukle();
    if (k === 'geri') { if (mod === 'arazi') { state.arazi?.geriAl(-1); ustCiz(); return araziCiz(); } return geriAl(-1); }
    if (k === 'ileri') { if (mod === 'arazi') { state.arazi?.geriAl(1); ustCiz(); return araziCiz(); } return geriAl(1); }
    if (k === 'birak') return modelSec(secModel.model);
    if (k === 'onume') { if (!secModel) return; const p = player.position, yw = state.yaw || 0, x = snap(p.x + Math.sin(yw) * 4), z = snap(p.z + Math.cos(yw) * 4); return yerlestir({ x, z, y: inis(x, z, p.y + 3) }); }
    if (k === 'yapistir') return yapistir();
    return islem(k, b);
  }
  function degisti(e) {
    const t = e.target, d = t.dataset;
    if (d.de === 'harita') { harita = t.value; secId = null; state.dunya?.sec?.(null); if (!burada() && izAktif()) izleDurdur(); objeler = []; listeCiz(); denetCiz(); ustCiz(); yerCiz(); hayaletKur(); return objelerYukle(); }
    if (d.de === 'hfiltre') { hFiltre = t.value; katCiz(); return izgaraCiz(); }
    if (d.de === 'izgara') { izgara = Number(t.value) || 0; return; }
    if (d.yz === 'aile') { yzAile = t.value; return araziCiz(); }
    if (d.fa) { fAyar[d.fa] = Number(t.value); try { localStorage.setItem('ko-de-firca', JSON.stringify(fAyar)); } catch {} const b = t.parentNode.querySelector('b'); if (b) b.textContent = faYaz(d.fa); return; }
    if (d.hf) { yeniH[d.hf] = d.hf === 'ad' || d.hf === 'sablon' || d.hf === 'sekil' ? t.value : Number(t.value); if (d.hf !== 'ad') haritaOnizle(); return; }
    if (d.de === 'zemin') { zemin = t.checked; return; }
    if (d.de === 'hizala') { hizala = t.checked; return; }
    if (d.yer) {
      if (d.yer === 'duvar') yer.duvar = t.checked;
      else if (d.yer === 'yaw') yer.yaw = ((Number(t.value) || 0) * Math.PI / 180) % (Math.PI * 2);
      else yer[d.yer] = Math.max(0.05, Number(t.value) || yer[d.yer]);
      if (['gen', 'yuk', 'der'].includes(d.yer)) hayaletKur(); else state.dunya?.onizleKonum?.(hayaletKonum());
    }
  }
  async function haritayaGit() {
    const { data, error } = await sb.rpc('gm_teleport', { p_char: character.id, p_zone: harita });
    if (error) return hud.notice?.(error.message, 'hata');
    try { sessionStorage.setItem('ko-gm-ac', 'dunya'); } catch {}
    say?.(`Teleporting to ${data?.name || hAd(harita)}… The world editor will reopen there.`, 'tamam'); state.net?.halt?.();
    const u = new URL(location.href); ['x', 'z', 'bolge'].forEach((q) => u.searchParams.delete(q)); u.searchParams.set('karakter', character.id);
    setTimeout(() => location.replace(u.toString()), 350);
  }

  return {
    open(host) {
      if (!kok) kur();
      if (host && kok.parentNode !== host) host.append(kok);
      ustCiz(); hayaletKur();
    },
    /** sekmeden çıkınca / panel kapanınca: izleyici ve hayalet kapanır */
    ayril() { izleDurdur(); state.dunya?.onizle?.(null); state.dunya?.sec?.(null); onizleGizle(); },
  };
}
