// GM penceresi (sağ üst mini haritadaki "GM" düğmesi). Sekmeler:
//   Konum   — koordinatlar, haritanın başlangıç (ışınlanma) noktasını bulunduğun yere ayarla (gm_set_start), koordinata git
//   Kuleler — ulus için kule kur (hasar, hasar alanı çapı), kule kimliğine göre düzenle/taşı/sil (gm_tower_*)
import { TOWER_NAME, TOWER_MODELS, TOWER_MODEL, towerModel } from './towers.js';
import { showModel, hideModel } from './model-onizleme.js';
import { initVeriWindow } from './veri-pencere.js';
import { initMobWindow } from './mob-pencere.js';
import { initNpcEditor } from './npc-editor.js';
import { koWindow, toFront } from './ko-pencere.js';
import { tabletAcik, tabletUygula, tamEkranDegis } from './tablet.js';
import { initBaslangic, SINIFLAR } from './gm-baslangic.js';
import { initOzelEsya } from './gm-esya.js';
import { onerilenOlcu, VARSAYILAN_GORSEL } from './reklam.js';
import { iconHtml, nameColor, RARITY, loadMeta as esyaMeta } from './esya.js';
import { npcModelAnahtarlari } from './character.js';
import { modelIkon } from './model-onizleme.js';
import { initDunyaEditor } from './dunya-editor.js';
import { initGmOyuncular } from './gm-oyuncular.js';
import { initGmKonum } from './gm-konum.js';
import { initGmMineGuard } from './gm-mineguard.js';
import { initGmDestek } from './gm-destek.js';
import { initGmDuyuru } from './gm-duyuru.js';
import { initGmEtkinlik } from './gm-etkinlik.js';
import { yardimciAyar, yardimciKaydet } from './gm-yardimci.js';
import { gizle as kartGizle, goster as kartGoster } from './onizleme-kart.js';
import { createNpc } from './character.js';

const GOMULU = {
  npc: ['NPC editörü', 'Tüm NPC listesi, model önizleme, yerleşimler (git, taşı, yön, boyut, sil), özel NPC. Haritadaki NPC\'ye sağ tıklayınca ayrıntılı düzenleme açılır.'],
  mob: ['Mob editörü', 'Seviye listesi, can / hasar, düşen eşyalar (% şans), doğurucular, özel mob ve mob yumurtası.'],
  veri: ['Eşya veritabanı', 'Kategori, artı, yeniden dökme, parça ve parşömen süzgeçleri; ayrıntı ve eşya verme.', '<button data-k="ozel-ac" class="g2-ikincil">Özel eşya editörü</button>'],
  saat: ['Saat ve hava', 'Bu haritanın ya da tüm haritaların oyun saati (kaydırıcı / fare tekerleği), sabit saat (ör. her zaman 13:00) ve hava durumu — anında herkese uygulanır.'],
  hesaplar: ['Hesaplar', 'Oyuncu hesapları: kullanıcı adı, e-posta, karakterler, durum. Yeni şifre belirleme, şifre sıfırlama bağlantısı, kullanıcı adı / e-posta değiştirme, oturum kapatma (işlemler yalnız Yönetici rütbesi).'],
  proje: ['Proje yönetimi', 'Yapılacaklar, eksiklikler, notlar ve son güncellemeler: durum, grup, öncelik ve etiketle süz; Liste ya da Pano. Son güncellemeler sekmesinde geliştirme notları kategori kategori.'],
  konum: ['Konum ve doğma noktaları', 'Her haritanın ortak doğma noktası ve ulus üsleri; yeni karakterlerin oyuna ilk giriş noktası.'],
  oyuncular: ['Oyuncu listesi', 'Tüm oyuncular; bir oyuncuya tıkla, alt pencerede ışınlama, ceza, ödül ve düzenleme işlemleri.'],
  esyatakip: ['Eşya takibi', 'Her eşya örneğinin drop / satın alma anından beri izi: kime geçti (takas, pazar, posta, banka), upgrade, yanma, çöp, satış. Filtreli arama, sütun sıralama, eşya kaldırma.'],
  mineguard: ['MineGuard', 'Ceza takip ve şüphe sistemi: makro, otomasyon, yazılım enjeksiyonu, küfür, anlamsız ticaret, fahiş pazar, gelir akışı ve dupe tespiti; ceza puanı ve otomatik yasak.'],
  dunya: ['Dünya editörü', 'Tüm haritaların objeleri (kütüphane), izleyici modunda panelin içinde gezip yerleştir; her değişiklik geri alınabilir ve günlüğe yazılır.'],
  etkinlik: ['Etkinlikler ve Notice', 'EXP / Noah / ülke puanı yüzde artışı ve 2x seviye atlama; süreli ya da devamlı. Oyuna ilk girişte sağdan açılan Notice penceresinin GM metni ve günün ipucu.'],
  duyuru: ['Otomatik duyurular', 'Sohbete belirli aralıklarla düşen sarı "#### Notice" duyuruları: ekle, düzenle, aralık / ofset / sunucu / renk, etkin-kapalı, sohbette önizle.'],
  destek: ['Destek talepleri', 'Oyuncuların sağ üstteki "?" düğmesiyle gönderdiği sorular; cevapla, kapat, sil. Cevap oyuncuya KO cevap penceresinde gider.'],
  donusum: ['Dönüşüm', 'Kendini ya da bir oyuncuyu herhangi bir mob, NPC ya da karakter görünümüne dönüştür (süre dakika, 0 = süresiz).'],
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const deg = (r) => ((Math.round(r * 180 / Math.PI) % 360) + 360) % 360;

// GM ırk / meslek değişimi (lobby RACE ile aynı kurallar; sunucu gm_irk_meslek doğrular)
const GM_IRK = [[1, 'Arch Tuarek (Karus, erkek)'], [2, 'Tuarek (Karus, erkek)'], [3, 'Wrinkle Tuarek (Karus, erkek)'], [4, 'Puri Tuarek (Karus, kadın)'], [6, 'Kurian (Karus)'],
  [11, 'Barbarian (El Morad, erkek)'], [12, 'El Morad Erkek'], [13, 'El Morad Kadın'], [14, 'Porutu (El Morad)']];
const GM_MESLEK = [[1, 'Savaşçı'], [2, 'Okçu'], [3, 'Büyücü'], [4, 'Rahip'], [13, 'Kurian / Porutu']];
const exp0 = (r) => Number(r?.num) === 900001000;   // EXP (deneyim) satırı: ikonu #900001000 eşyasından
export function initGmWindow({ state, player, sb, character, zone, zoneName = () => zone, hud, say, towers: getTowers }) {
  let win = null, tab = 'konum', selId = null, start = null, liveT = 0;
  let pickModel = null, hoverI = -1, veri = null, mobw = null, npcw = null, gmDmg = null, bas = null, ozel = null, olumsuz = false, basAyar = null, boyutlar = null, maden = null;
  let reklamlar = null, reklamSec = null, gmVeri = null, gmSec = null, cikarT = 0;
  let mesSec = null, mesEkle = null, gmAlt = 'liste', mesAlt = 'maden', deEd = null, gmOy = null, gmKonum = null, gmMg = null;
  let yardimciSecim = false, gmTam = false, gmBoyut = 'buyuk', gmTema = 'acik', navKapali = false, gmGizliOnizle = false, gmSaydam = 100, gmGizli = false, deAraT = 0, deModelAd = '', deKutupL = null;
  try { gmSaydam = Number(localStorage.getItem('ko-gm-saydam')) || 100; gmGizli = localStorage.getItem('ko-gm-gizli') === '1'; navKapali = localStorage.getItem('ko-gm-nav') === '1'; gmTam = localStorage.getItem('ko-gm-tam') === '1'; gmBoyut = localStorage.getItem('ko-gm-boyut') || 'buyuk'; gmTema = localStorage.getItem('ko-gm-tema') === 'koyu' ? 'koyu' : 'acik'; } catch {}
  // dünya editörü
  let deHarita = zone, deHaritalar = null, deObjeler = null, deSec = null, deKat = 'yapi', deAra = '', deKutup = null, deModel = null, dePano = null, deGrup = 0;
  const ozelAc = (r) => (ozel ||= initOzelEsya({ sb, character, hud, say, state })).open(r);   // seçili kule modeli (null → ulusun varsayılanı)
  const modelName = (m) => TOWER_MODELS.find((x) => x.m === m)?.n || m;
  const T = () => getTowers?.();
  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args });
    if (error) { hud.notice?.(error.message, 'hata'); say?.(error.message, 'hata'); throw error; }
    return data;
  };
  const curModel = () => pickModel || TOWER_MODEL[Number(win?.querySelector('[name=yn]')?.value) || 1];
  const here = () => ({ x: +player.position.x.toFixed(1), z: +player.position.z.toFixed(1) });
  const teleport = (x, z) => {
    state.target = null;
    const y = T()?.groundY ? T().groundY(x, z) : state.heightAt(x, z);
    player.position.set(x, y, z);
  };
  async function loadStart() {
    sb.from('characters').select('gm_damage,gm_olumsuz').eq('id', character.id).maybeSingle().then(({ data }) => { gmDmg = data?.gm_damage ?? 0; olumsuz = !!data?.gm_olumsuz; state.gmOlumsuz = olumsuz; render(); }, () => {});
    rpc('gm_boyut_liste', {}).then((l) => { boyutlar = l || []; render(); }, () => {});
    const { data } = await sb.from('zones').select('start_x,start_z').eq('id', zone).maybeSingle();
    start = data?.start_x != null ? { x: data.start_x, z: data.start_z } : null;
    render();
  }

  function html() {
    const p = here();
    if (tab === 'reklam') {
      if (!reklamlar) return '<p class="ay-not">Yükleniyor…</p>';
      const r = reklamlar.find((x) => x.id === reklamSec);
      const ol = r ? onerilenOlcu(r.genislik, r.yukseklik) : null;
      return `<div class="g2-bolum"><div class="g2-bas">Reklam alanları <span class="g2-rozet">${reklamlar.length}</span><button data-k="rk-yeni" class="g2-ikincil">+ Bulunduğum yere yeni bayrak</button></div>
        <div class="g2-tablo">
          <div class="g2-tr g2-th"><span>Kod</span><span>Harita</span><span>Konum (X · Y · Z)</span><span>Boyut</span><span>Durum</span></div>
          ${reklamlar.map((x) => `<div class="g2-tr g2-sec${x.id === reklamSec ? ' secili' : ''}" data-rk="${x.id}"><span><b>${esc(x.kod)}</b><i>${esc(x.kategori || 'Reklam alanı')}</i></span><span>${esc(x.zone)}</span><span>${(+x.x).toFixed(1)} · ${(+x.y).toFixed(1)} · ${(+x.z).toFixed(1)}</span><span>${(+x.genislik).toFixed(1)} × ${(+x.yukseklik).toFixed(1)} m</span><span><em class="g2-durum ${x.aktif ? 'acik' : 'kapali'}">${x.aktif ? 'Yayında' : 'Kapalı'}</em></span></div>`).join('') || '<div class="g2-bos">Kayıtlı reklam alanı yok.</div>'}
        </div></div>
        ${r ? `<div class="g2-bolum"><div class="g2-bas">${esc(r.kod)} düzenle</div>
          <div class="g2-iki">
            <div class="g2-form">
              <label>Kod<input name="rk-kod" value="${esc(r.kod)}"></label>
              <label>Harita<input name="rk-zone" value="${esc(r.zone)}"></label>
              <label>X<input type="number" step="0.1" name="rk-x" value="${(+r.x).toFixed(1)}"></label>
              <label>Y (alt)<input type="number" step="0.1" name="rk-y" value="${(+r.y).toFixed(1)}"></label>
              <label>Z<input type="number" step="0.1" name="rk-z" value="${(+r.z).toFixed(1)}"></label>
              <label>Yön (°)<input type="number" step="1" name="rk-yaw" value="${Math.round((+r.yaw || 0) * 180 / Math.PI)}"></label>
              <label>Genişlik (m)<input type="number" step="0.1" min="0.5" name="rk-gen" value="${(+r.genislik).toFixed(1)}"></label>
              <label>Yükseklik (m)<input type="number" step="0.1" min="0.5" name="rk-yuk" value="${(+r.yukseklik).toFixed(1)}"></label>
              <label class="g2-tik"><input type="checkbox" name="rk-aktif" ${r.aktif ? 'checked' : ''}> Yayında</label>
            </div>
            <div class="g2-gorsel"><div class="g2-onizle" style="background-image:url('${r.gorsel ? r.gorsel : (window.KO_V ? window.KO_V(VARSAYILAN_GORSEL) : VARSAYILAN_GORSEL)}')"></div>
              <div class="g2-olcu">Önerilen görsel: <b>${ol.w} × ${ol.h} px</b><br>Oran ${(+r.genislik).toFixed(1)} : ${(+r.yukseklik).toFixed(1)} (dikey). Yatay görsel yüklersen 90° çevrilip dikey bayrağa yerleştirilir.</div>
              <label class="g2-dosya">Görsel değiştir<input type="file" accept="image/*" name="rk-dosya"></label>
              <button data-k="rk-varsayilan" class="g2-ikincil" ${r.gorsel ? '' : 'disabled'}>Varsayılan MineKO bayrağı</button></div>
          </div>
          <div class="g2-dugmeler"><button data-k="rk-kaydet" class="g2-ana">Kaydet</button><button data-k="rk-buraya" class="g2-ikincil" title="X ve Z bulunduğun yer, Y zemin + 0">Konumuma taşı</button><button data-k="rk-git" class="g2-ikincil" ${r.zone === zone ? '' : 'disabled'}>Yanına git</button></div>
        </div>` : '<p class="ay-not">Düzenlemek için listeden bir alan seç.</p>'}`;
    }
    if (tab === 'gmler' && gmAlt !== 'karakter') return gmAltHtml() + (() => {
      if (!gmVeri) return '<p class="ay-not">Yükleniyor…</p>';
      const yon = gmVeri.ben === 'yonetici', RUT = { yonetici: 'Yönetici', gm: 'GM', yardimci: 'Yardımcı GM' };
      const ULUS = { 1: 'Karus', 2: 'El Morad' };
      const tarih = (t) => (t ? new Date(t).toLocaleDateString('tr-TR') : '—');
      const g = gmVeri.liste.find((x) => x.id === gmSec);
      return `<div class="g2-bolum"><div class="g2-bas">GM'ler <span class="g2-rozet">${gmVeri.liste.length}</span><span class="g2-ben">Senin rütben: <b>${RUT[gmVeri.ben] || gmVeri.ben}</b></span></div>
        <div class="g2-tablo">
          <div class="g2-tr g2-th g2-gm"><span>Karakter</span><span>Rütbe</span><span>Ulus · Sv</span><span>Son giriş</span><span>Ekleyen</span></div>
          ${gmVeri.liste.map((x) => `<div class="g2-tr g2-gm g2-sec${x.id === gmSec ? ' secili' : ''}" data-gm="${x.id}"><span><b>${esc(x.ad)}</b>${x.notu ? `<i>${esc(x.notu)}</i>` : ''}</span><span><em class="g2-rutbe ${x.rutbe}">${RUT[x.rutbe] || x.rutbe}</em></span><span>${ULUS[x.ulus] || '—'} · ${x.seviye}</span><span>${tarih(x.son_giris)}</span><span>${esc(x.ekleyen || '—')}</span></div>`).join('')}
        </div></div>
        ${yon ? `${g ? `<div class="g2-bolum"><div class="g2-bas">${esc(g.ad)} düzenle</div>
          <div class="g2-form g2-satirform"><label>Rütbe<select name="gm-rutbe">${Object.entries(RUT).map(([k, v]) => `<option value="${k}"${g.rutbe === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
            <label class="g2-genis">Not<input name="gm-not" value="${esc(g.notu || '')}" placeholder="ör. etkinlik sorumlusu"></label></div>
          <div class="g2-dugmeler"><button data-k="gm-kaydet" class="g2-ana">Kaydet</button>${g.id !== Number(character.id) ? '<button data-k="gm-cikar" class="g2-tehlike">GM yetkisini kaldır</button>' : ''}</div></div>` : ''}
        <div class="g2-bolum"><div class="g2-bas">Yeni GM ekle</div>
          <div class="g2-form g2-satirform"><label class="g2-genis">Karakter adı<input name="gm-yeni-ad" placeholder="Karakter adı" autocomplete="off"></label>
            <label>Rütbe<select name="gm-yeni-rutbe"><option value="gm">GM</option><option value="yardimci">Yardımcı GM</option><option value="yonetici">Yönetici</option></select></label>
            <label class="g2-genis">Not<input name="gm-yeni-not" placeholder="isteğe bağlı"></label></div>
          <div class="g2-dugmeler"><button data-k="gm-ekle" class="g2-ana">GM olarak ekle</button></div>
          <p class="ay-not">Yönetici: GM ekler, düzenler, kaldırır. GM / Yardımcı GM: panelin diğer bölümlerini kullanır. Yetki kaldırılan karakterin kaydı arşivde kalır; yeniden eklenebilir. Değişiklik, karakter oyuna yeniden girince etkinleşir.</p></div>` : '<p class="ay-not">GM ekleme, düzenleme ve kaldırma yalnız Yönetici rütbesindeki GM içindir.</p>'}`;
    })();
    // gömülü editörler: ayrı pencere açılmaz, aynı veriler panelin içinde (açık tema)
    if (GOMULU[tab]) {
      const [ad, ac, ek] = GOMULU[tab];
      return `<div class="g2-gomu-ust"><b>${ad}</b><span>${ac}</span>${ek || ''}</div><div class="g2-gomu"><div class="g2-bos">Yükleniyor…</div></div>`;
    }
    if (tab === 'baslangic') return `
      <div class="gm-kutu"><div class="gm-satir"><span>Başlangıç eşyaları</span><b>yeni karakterlere verilir</b></div>
        <p class="ay-not">Sınıfı seç: o sınıfın başlangıç envanteri açılır. Kendi çantandan (I) eşyaları donanım ya da çanta yuvalarına sürükle. Sağ tık: kaldır.</p></div>
      ${SINIFLAR.map(([k, ad]) => `<div class="nd-dugmeler"><button data-k="bas-${k}" class="ay-dugme">${esc(ad)} başlangıç eşyaları</button></div>`).join('')}
      <div class="gm-ara">Yeni karakter ayarları</div>
      ${basAyar ? `
      <div class="nd-satir"><span>Başlangıç seviyesi</span><input type="number" name="bseviye" min="1" max="83" value="${basAyar.bas_seviye}" style="width:70px"></div>
      <div class="nd-satir"><span>Yetenekler</span><select name="byetenek"><option value="kapali" ${basAyar.bas_yetenek === 'kapali' ? 'selected' : ''}>Kapalı (meslek değiştirilmemiş)</option><option value="acik" ${basAyar.bas_yetenek === 'acik' ? 'selected' : ''}>Açık (meslek değişmiş, 10+ sv.)</option><option value="usta" ${basAyar.bas_yetenek === 'usta' ? 'selected' : ''}>Açık + usta yetenekleri</option></select></div>
      <div class="nd-satir"><label><input type="checkbox" name="botoyet" ${basAyar.bas_oto_yetenek ? 'checked' : ''}> Seviyeye göre yetenek puanını otomatik dağıt</label></div>
      <div class="nd-satir"><label><input type="checkbox" name="botostat" ${basAyar.bas_oto_stat ? 'checked' : ''}> Seviyeye göre statü puanını otomatik dağıt</label></div>
      <div class="nd-dugmeler"><button data-k="bas-ayar" class="ay-dugme">Ayarları kaydet</button></div>
      <p class="ay-not">Seviye başına 3 statü puanı (ana statü: savaşçı/rahip/kurian Güç, okçu/suikastçı Çeviklik, büyücü Büyü gücü; 255'ten sonra Sağlık), 10. seviyeden sonra seviye başına 2 yetenek puanı (meslek sekmelerine sırayla).</p>` : '<p class="ay-not">Ayarlar yükleniyor…</p>'}`;
    if (tab === 'meslek') {
      const alt = `<div class="g2-alt"><button data-ma="maden" class="${mesAlt === 'maden' ? 'secili' : ''}">Madencilik</button><button data-ma="balik" class="${mesAlt === 'balik' ? 'secili' : ''}">Balıkçılık</button></div>`;
      if (!maden) return alt + '<p class="ay-not">Yükleniyor…</p>';
      // koyu yazı tonu: derece renginin açık temada okunur hâli (siyaha %45 karışım)
      const koyu = (hex) => { const n = parseInt(String(hex).slice(1), 16); if ((n >> 16 & 255) > 220 && (n >> 8 & 255) > 220 && (n & 255) > 220) return '#1f2937'; const f = (v) => Math.round(v * 0.55).toString(16).padStart(2, '0'); return '#' + f(n >> 16 & 255) + f(n >> 8 & 255) + f(n & 255); };
      const yuz = (o) => (o / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
      const slot = (r, top) => {
        const exp = r.num === 900001000, it = { ikon: r.ikon || (exp0(r) ? '9_0000_10_0' : ''), strName: r.ad, ItemType: r.tip, Kind: r.tur };
        const gercek = top && top !== 10000 ? ` · gerçek ≈ %${(r.oran * 100 / top).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` : '';
        return `<button class="g2-slot${mesSec === r.id ? ' secili' : ''}" data-ms="${r.id}" title="${esc(r.ad || '#' + r.num)} · #${r.num}${r.adet > 1 ? ' · ' + r.adet + ' adet' : ''} · şans %${yuz(r.oran)}${gercek}" style="--d:${exp ? '#10b981' : RARITY[r.tip]?.[1] || '#cbd5e1'}">
          <span class="g2-slot-ik">${iconHtml(it, 40)}${r.adet > 1 ? `<em>${r.adet}</em>` : ''}</span><span class="g2-slot-oran">%${yuz(r.oran)}</span></button>`;
      };
      const duzen = (r, k, top) => {
        const exp = r.num === 900001000, it = { ikon: r.ikon || (exp0(r) ? '9_0000_10_0' : ''), strName: r.ad, ItemType: r.tip, Kind: r.tur };
        const renk = exp ? '#047857' : Number(r.tip) > 0 ? koyu(nameColor(it)) : '#1f2937', der = exp ? 'EXP' : RARITY[r.tip]?.[0] || 'Normal';
        return `<div class="g2-slot-duzen"><span class="g2-ikon">${iconHtml(it, 30)}</span>
          <span class="g2-dad"><b style="color:${renk}">${esc(r.ad || '#' + r.num)}</b><i><em class="g2-der" style="--d:${exp ? '#10b981' : RARITY[r.tip]?.[1] || '#9ca3af'}">${der}</em> #${r.num}${r.adet > 1 ? ` · ${r.adet} adet` : ''}${top && top !== 10000 ? ` · gerçek olasılık ≈ %${(r.oran * 100 / top).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` : ''}</i></span>
          <span class="g2-oran"><input type="number" name="mo-${r.id}" min="0" max="100" step="0.01" value="${r.oran / 100}"><i>%</i></span>
          <span class="g2-dug"><button data-k="mes-kaydet" data-id="${r.id}" data-kazma="${k}" data-num="${r.num}" class="g2-ana">Kaydet</button><button data-k="mes-kapat" data-id="${r.id}" data-kazma="${k}" data-num="${r.num}" class="g2-tehlike" title="Şansı 0 yapar (listeden çıkar)">Çıkar</button><button data-k="mes-kapa" title="Kapat">✕</button></span></div>`;
      };
      const ekleForm = (k) => `<div class="g2-slot-duzen g2-slot-ekle"><b>Bu listeye eşya ekle</b>
          <label>Eşya no<input type="number" name="mes-num" placeholder="ör. 389011000"></label><label>Adet<input type="number" name="mes-adet" min="1" value="1"></label><label>Şans (%)<input type="number" name="mes-yuzde" min="0" max="100" step="0.01"></label>
          <input type="hidden" name="mes-kz" value="${k}"><span class="g2-dug"><button data-k="mes-ekle" class="g2-ana">Ekle</button><button data-k="mes-kapa">✕</button></span></div>`;
      const blok = (k, ad) => { const l = maden.filter((r) => r.kazma === k), top = l.reduce((a, r) => a + r.oran, 0), sr = l.find((r) => r.id === mesSec);
        return `<div class="g2-bolum"><div class="g2-bas">${ad}<span class="g2-rozet">${l.length}</span><span class="g2-ben">Toplam %${yuz(top)}</span></div>
          <div class="g2-env">${l.map((r) => slot(r, top)).join('')}<button class="g2-slot g2-slot-arti${mesEkle === k ? ' secili' : ''}" data-mek="${k}" title="Bu listeye eşya ekle"><span class="g2-slot-ik">+</span><span class="g2-slot-oran">Ekle</span></button></div>
          ${sr ? duzen(sr, k, top) : mesEkle === k ? ekleForm(k) : ''}</div>`; };
      const turler = mesAlt === 'maden' ? [[0, 'Mattock kazısı'], [1, 'Golden Mattock kazısı'], [2, 'Mysterious Ore dropları (Pitman)'], [3, 'Mysterious gold mine dropları (Pitman)']] : [[4, 'Fishing Rod (olta)'], [5, 'Golden Fishing Rod']];
      return alt + `<p class="ay-not" style="margin:0">${mesAlt === 'maden' ? 'Her kazıda (5 sn) ve Pitman\'daki her cevher kırdırmada listeden bir eşya seçilir; çıkma olasılığı = şans / toplam. EXP (900001000) seviyeye göre EXP verir.' : 'Balık tutmada her denemede listeden bir eşya seçilir (Fishing Rod: Rainworm yem gerekir; Golden Fishing Rod yemsiz).'} Eşyaya tıkla: şansı düzenle / çıkar · + ile yeni eşya ekle.</p>
        ${turler.map(([k, ad]) => blok(k, ad)).join('')}`;
    }
    if (tab === 'dunya') return dunyaHtml();
    if (tab === 'ayarlar') return ayarHtml();
    if (tab === 'karakter') { tab = 'gmler'; gmAlt = 'karakter'; }
    if (tab === 'gmler' && gmAlt === 'karakter') return gmAltHtml() + `
      <div class="gm-kompakt">
      <div class="gk-bilgi"><span>Harita</span><b>${esc(zoneName())} <i>(${esc(zone)})</i></b><span>Konum</span><b class="gm-canli">X ${p.x} · Z ${p.z}</b><span>Doğma noktası</span><b>${start ? `X ${start.x} · Z ${start.z}` : 'ayarlanmamış'}</b></div>
      <div class="gk-satir"><span>Git</span>X<input type="number" name="gx" step="1" value="${p.x}">Z<input type="number" name="gz" step="1" value="${p.z}"><button data-k="git">Git</button></div>
      <div class="gk-satir" title="0 = normal (KO formülü). Başka bir değer girilirse GM'in her vuruşu ıskalamadan bu kadar hasar verir."><span>Vuruş hasarı</span><input type="number" name="gdmg" min="0" max="10000000" value="${gmDmg ?? 0}" class="gk-genis"><button data-k="gdmg">Kaydet</button></div>
      <div class="gk-secimler">
        <label title="Mob, NPC, kule ve oyuncu saldırıları"><input type="checkbox" name="gmolumsuz" ${olumsuz ? 'checked' : ''}> Hasar yemez</label>
        <label title="Karakterimin üstünde GM efekti"><input type="checkbox" name="gmfx" ${localStorage.getItem('ko-gm-efekt') === '0' ? '' : 'checked'}> GM efekti</label>
        <label title="Oyuncular beni, petimi ve efektlerimi göremez; GM'ler görür"><input type="checkbox" name="gmgizli" ${state.net?.gizli ? 'checked' : ''}> Gizlen</label>
      </div>
      <div class="gk-baslik" title="100 = normal boy. 10–1000 arası; tüm oyuncular GM'i bu boyutta görür.">Boyut (%)</div>
      ${boyutlar ? boyutlar.map((g) => `<div class="gk-satir"><span>${esc(g.ad)}</span><input type="number" name="boy-${g.id}" min="10" max="1000" step="5" value="${g.boyut}"><button data-k="boyut" data-id="${g.id}">Uygula</button></div>`).join('') : '<div class="gk-satir"><i>Yükleniyor…</i></div>'}
      <div class="gk-baslik" title="GM karakterinin ırkı (cinsiyet ırkla belirlenir: Tuarek / Puri Tuarek, El Morad Erkek / Kadın) ve mesleği. Ulus ırka göre değişir; sayfa yenilenir.">Irk / Meslek / Cinsiyet</div>
      <div class="gk-satir"><select name="girk">${GM_IRK.map(([r, ad]) => `<option value="${r}"${Number(character.race) === r ? ' selected' : ''}>${esc(ad)}</option>`).join('')}</select><select name="gmes">${GM_MESLEK.map(([c, ad]) => `<option value="${c}"${Number(character.class) % 100 === c || Number(character.class) === c ? ' selected' : ''}>${esc(ad)}</option>`).join('')}</select><button data-k="irkmeslek">Uygula</button></div>
      <div class="gk-baslik" title="Oyundaki tüm periler omuzlarının ve başının çevresinde uçar; tüm oyuncular görür.">Periler</div>
      <div class="gk-secimler"><label><input type="checkbox" name="gmperi" ${(() => { try { return localStorage.getItem('ko-gm-peri') === '1'; } catch { return false; } })() ? 'checked' : ''}> Tüm periler etrafımda uçsun</label></div>
      <div class="gk-baslik" title="GM'i izleyen, 3 m'ye kadar yaklaşan, saldırılamayan görsel yardımcı. Tüm oyuncular görür.">GM yardımcısı</div>
      ${(() => { const y = yardimciAyar(); return `<div class="gy-kart">
        <label class="gy-ac"><input type="checkbox" name="gy-aktif" ${y.aktif ? 'checked' : ''}> Yardımcı açık</label>
        <label>Ad<input name="gy-ad" maxlength="24" value="${esc(y.a)}"></label>
        <label>Ad rengi<input type="color" name="gy-renk" value="${esc(y.r)}"></label>
        <label>Ölçek (%)<input type="number" name="gy-olcek" min="10" max="500" step="5" value="${y.s}"></label>
        <div class="gy-model"><span>Model</span><b>${esc(y.mAd || y.m)}</b><i>${esc(y.m)}</i><button data-k="gy-sec">Dönüşüm listesinden seç</button></div>
        <div class="gk-satir"><button data-k="gy-kaydet" class="g2-ana">Uygula</button></div></div>`; })()}
      </div>`;
    const list = (T()?.list || []).slice().sort((a, b) => a.t.id - b.t.id);
    const sel = selId != null ? T()?.byId(selId) : null;
    const dist = (e) => Math.hypot(e.t.x - player.position.x, e.t.z - player.position.z);
    return `
      <div class="gm-ara">Yeni kule (bulunduğun yere)</div>
      <div class="nd-satir"><span>Ulus</span><select name="yn"><option value="1">Karus</option><option value="2">El Morad</option></select></div>
      <div class="gm-ara gm-ince">Kule modeli <i>— üzerine gel: önizleme · tekerlek: gez · tıkla: seç</i></div>
      <div class="gm-modeller">${TOWER_MODELS.map((x, i) => `<div class="gm-model u${x.u}${x.m === curModel() ? ' secili' : ''}" data-i="${i}"><span>${esc(x.n)}</span><i>${x.m.slice(4)}</i></div>`).join('')}</div>
      <div class="nd-satir"><span>Hasar</span><input type="number" name="yh" min="0" max="100000" value="50"><span>Çap (m)</span><input type="number" name="yc" min="1" max="200" value="20"></div>
      <div class="nd-dugmeler"><button data-k="kur" class="ay-dugme">Konumuma kule kur</button></div>
      <div class="gm-ara">Kuleler (${list.length}) <input name="kid" type="number" placeholder="Kule ID" style="width:80px"><button data-k="bul">Bul</button></div>
      <div class="nk-liste gm-kuleler">${list.map((e) => `<div class="nk-satir${e.t.id === selId ? ' secili' : ''}" data-id="${e.t.id}"><b>#${e.t.id}</b><span>${TOWER_NAME[e.t.nation]} · ${e.t.damage} hasar · ${e.t.range} m · ${esc(modelName(towerModel(e.t)))}</span><i>${dist(e).toFixed(0)} m</i></div>`).join('') || '<div class="nk-not">Bu haritada kule yok</div>'}</div>
      ${sel ? `
      <div class="gm-ara">Kule #${sel.t.id} düzenle</div>
      <div class="nd-satir"><span>Ulus</span><select name="dn"><option value="1" ${sel.t.nation === 1 ? 'selected' : ''}>Karus</option><option value="2" ${sel.t.nation === 2 ? 'selected' : ''}>El Morad</option></select></div>
      <div class="nd-satir"><span>Hasar</span><input type="number" name="dh" min="0" max="100000" value="${sel.t.damage}"><span>Çap (m)</span><input type="number" name="dc" min="1" max="200" value="${sel.t.range}"></div>
      <div class="nd-satir"><span>Model</span><b class="gm-mad">${esc(modelName(towerModel(sel.t)))}</b></div>
      <div class="nd-dugmeler"><button data-k="kaydet" class="ay-dugme">Kaydet</button><button data-k="kmodel" class="ay-dugme" ${curModel() === towerModel(sel.t) ? 'disabled' : ''} title="Listede seçili modeli bu kuleye uygula">Seçili modeli uygula</button></div>
      <div class="nd-dugmeler"><button data-k="tasi" class="ay-dugme">Konumuma taşı</button></div>
      <div class="nd-dugmeler"><button data-k="kgit" class="ay-dugme">Yanına git</button><button data-k="ksil" class="ay-dugme tehlike">Sil</button></div>` : '<p class="ay-not">Düzenlemek için listeden bir kule seç ya da ID ile bul. Kulelere sağ tıklayarak da seçebilirsin.</p>'}`;
  }
  function gmAltHtml() {
    return `<div class="g2-alt"><button data-ga="liste" class="${gmAlt !== 'karakter' ? 'secili' : ''}">GM listesi</button><button data-ga="karakter" class="${gmAlt === 'karakter' ? 'secili' : ''}">GM karakterim</button></div>`;
  }
  function ayarHtml() {
    return `<div class="g2-bolum"><div class="g2-bas">Panel</div>
        <div class="g2-form g2-satirform"><label>Saydamlık<span class="g2-ayar-sat"><input type="range" min="35" max="100" step="5" name="ay-saydam" value="${gmSaydam}"><b>%${gmSaydam}</b></span></label>
        <label>Renk modu<select name="ay-tema"><option value="acik" ${gmTema === 'acik' ? 'selected' : ''}>Açık</option><option value="koyu" ${gmTema === 'koyu' ? 'selected' : ''}>Koyu</option></select></label>
        <label>Açılış boyutu<select name="ay-boyut"><option value="buyuk" ${gmBoyut === 'buyuk' ? 'selected' : ''}>Büyük (1180 × 800)</option><option value="orta" ${gmBoyut === 'orta' ? 'selected' : ''}>Orta (980 × 680)</option><option value="kucuk" ${gmBoyut === 'kucuk' ? 'selected' : ''}>Küçük (800 × 560)</option><option value="ozel" ${gmBoyut === 'ozel' ? 'selected' : ''}>Özel (köşeden sürükle)</option><option value="tam" ${gmBoyut === 'tam' ? 'selected' : ''}>Ekranı kapla</option></select></label>
        <label class="g2-tik"><input type="checkbox" name="ay-nav" ${navKapali ? '' : 'checked'}> Sol menü açık</label>
        <label class="g2-tik"><input type="checkbox" name="ay-gizli" ${gmGizli ? 'checked' : ''}> Panel gizli (yalnız başlık)</label>
        <label class="g2-tik"><input type="checkbox" name="ay-tablet" ${tabletAcik() ? 'checked' : ''}> Tablet modu (dokunmatik: büyük düğmeler, yan düğme şeridi, iki parmakla kamera)</label>
        <label class="g2-tik"><input type="checkbox" name="ay-tamekran" ${document.fullscreenElement || document.webkitFullscreenElement ? 'checked' : ''}> Tarayıcı tam ekran</label></div>
        <p class="ay-not">Kısayollar: Esc paneli kapatır · başlığa çift tıklama gizler / gösterir · sağ üstteki — düğmesi gizler.</p></div>
      <div class="g2-bolum"><div class="g2-bas">Sunucu</div>
        <div class="g2-form g2-satirform"><label>Duyuru (tüm oyunculara)<span class="g2-ayar-sat"><input name="ay-duyuru" maxlength="200" placeholder="Duyuru metni"><button data-k="ay-duyur" class="g2-ana">Duyur</button></span></label>
        <label>Bakım modu<span class="g2-ayar-sat"><button data-k="ay-bakim" data-v="1">Bakıma al</button><button data-k="ay-bakim" data-v="0">Bakımı bitir</button></span></label></div>
        <p class="ay-not">Bakım modunda GM olmayan oyuncular oyuna giremez; açık oturumlar uyarılır.</p></div>`;
  }
  function render() {
    if (!win) return;
    win.querySelectorAll('.gm2-nav button').forEach((b) => b.classList.toggle('secili', b.dataset.t === tab));
    const bb = win.querySelector('.gm2-sayfa'); if (bb) { const nb = win.querySelector(`.gm2-nav button[data-t="${tab}"]`); bb.textContent = (nb?.querySelector('.gm2-uzun') || nb)?.textContent || ''; }
    const body = win.querySelector('.gm-govde');
    const keep = {}; body.querySelectorAll('input[name=yh],input[name=yc],select[name=yn]').forEach((i) => (keep[i.name] = i.value));
    const scroll = body.querySelector('.gm-kuleler')?.scrollTop || 0, mscroll = body.querySelector('.gm-modeller')?.scrollTop || 0;
    body.innerHTML = html();
    for (const [k, v] of Object.entries(keep)) { const i = body.querySelector(`[name=${k}]`); if (i) i.value = v; }
    const l = body.querySelector('.gm-kuleler'); if (l) l.scrollTop = scroll;
    const ml = body.querySelector('.gm-modeller'); if (ml) ml.scrollTop = mscroll;
    markModel();
    body.classList.toggle('g2-gomu-mod', !!GOMULU[tab]);
    if (GOMULU[tab]) gomuAc(tab, body.querySelector('.g2-gomu'));
  }
  async function gomuAc(t, h) {
    if (!h) return;
    try {
      if (t === 'esyatakip') (state.gmEsyaTakip ||= initGmMineGuard({ sb, character, hud, mod: 'akis', acOyuncu: (id) => { tab = 'oyuncular'; render(); setTimeout(() => gmOy?.secOyuncu?.(id), 50); } })).open(h);
      if (t === 'mineguard') (gmMg ||= initGmMineGuard({ sb, character, hud, acOyuncu: (id) => { tab = 'oyuncular'; render(); setTimeout(() => gmOy?.secOyuncu?.(id), 50); } })).open(h);
      if (t === 'saat') { const { initGmSaat } = await import('./gm-saat.js'); (state.gmSaat ||= initGmSaat({ sb, character, zone, zoneName, state, hud })).open(h); }
      if (t === 'hesaplar') { const { initGmHesaplar } = await import('./gm-hesaplar.js'); (state.gmHesaplar ||= initGmHesaplar({ sb, character, hud })).open(h); }
      if (t === 'proje') { const { initGmProje } = await import('./gm-proje.js'); (state.gmProje ||= initGmProje({ sb, character, hud })).open(h); }
      if (t === 'konum') (gmKonum ||= initGmKonum({ sb, character, zone, zoneName, state, player, hud, say })).open(h);
      if (t === 'etkinlik') (state.gmEtkinlik ||= initGmEtkinlik({ sb, character, hud })).open(h);
      if (t === 'duyuru') (state.gmDuyuru ||= initGmDuyuru({ sb, character, hud })).open(h);
      if (t === 'destek') (state.gmDestek ||= initGmDestek({ sb, character, hud, gitOyuncu: (id) => { tab = 'oyuncular'; render(); setTimeout(() => gmOy?.secOyuncu?.(id), 50); } })).open(h);
      if (t === 'oyuncular') (gmOy ||= initGmOyuncular({ sb, character, zone, state, player, hud, say })).open(h);
      if (t === 'dunya') (deEd ||= initDunyaEditor({ sb, character, zone, zoneName, state, player, hud, say })).open(h);
      if (t === 'npc') await (npcw ||= initNpcEditor({ state, player, sb, character, zone, hud, remoteBase: state.npcBase || '' })).open(h);
      if (t === 'mob') await (mobw ||= initMobWindow({ state, player, sb, character, zone, hud, say })).open(h);
      if (t === 'veri') await (veri ||= initVeriWindow({ sb, character, hud, say, onGive: () => state.inv?.reload(), onEdit: ozelAc })).open(h);
      if (t === 'donusum') { const { initGmDonusum } = await import('./gm-donusum.js'); await (state.gmDonusum ||= initGmDonusum({ sb, character, hud, onYardimci: (x) => { const y = { ...yardimciAyar(), m: 'npc_' + x.pid, mAd: x.ad, aktif: true }; yardimciKaydet(y); window.__gmYdAyarla?.(y); yardimciSecim = false; hud.info?.(`GM helper model: ${x.ad}`, 'tamam'); tab = 'gmler'; gmAlt = 'karakter'; render(); } })).open(h); }
    } catch (e) { h.innerHTML = `<div class="g2-bos">Yüklenemedi: ${esc(e?.message || e)}</div>`; }
    if (tab !== t || !win) return;
    // yükleme sürerken panel yeniden çizildiyse editörü güncel alana taşı
    const cur = win.querySelector('.gm-govde .g2-gomu');
    if (cur && cur !== h && (gomuAc.n = (gomuAc.n || 0) + 1) < 20) return gomuAc(t, cur);
    gomuAc.n = 0;
    // yükleme sürerken bekleme yazısı kaldıysa temizle
    const b = h.querySelector(':scope > .g2-bos'); if (b && h.querySelector('.g2-gomulu')) b.remove();
    requestAnimationFrame(() => h.querySelectorAll('.mb-liste, .vi-liste, .gd-liste').forEach((l) => l.dispatchEvent(new Event('scroll'))));
  }
  let silT = 0;
  function open(t = tab, id = null) {
    if (!state.ghost) { say?.('The GM window is GM only.', 'hata'); return; }
    tab = t; if (id != null) { selId = Number(id); T()?.select(T()?.byId(selId)); }
    if (!win) {
      // açık tema, kurumsal düzen: üstte başlık şeridi, solda gruplu kategori menüsü, sağda içerik
      win = document.createElement('div'); win.id = 'gm-pencere'; win.className = 'gm2';
      const KISA = { hesaplar: 'Hesaplar', proje: 'Proje', saat: 'Saat', konum: 'Konum', dunya: 'Dünya', kule: 'Kuleler', mob: 'Moblar', npc: "NPC'ler", reklam: 'Reklam', veri: 'Eşyalar', baslangic: 'Başlangıç', meslek: 'Meslekler', oyuncular: 'Oyuncular', donusum: 'Dönüşüm', destek: 'Destek', duyuru: 'Duyurular', etkinlik: 'Etkinlik', gmler: "GM'ler", ayarlar: 'Ayarlar', mineguard: 'Ceza takip' };
      const grup = (ad, l) => `<div class="gm2-grup">${ad === 'Eşya ve ekonomi' ? '<span class="gm2-uzun">Eşya ve ekonomi</span><span class="gm2-kisa">Ekonomi</span>' : ad}</div>` + l.map(([t, a]) => `<button data-t="${t}"><span class="gm2-uzun">${a}</span><span class="gm2-kisa">${KISA[t] || a}</span></button>`).join('');
      win.innerHTML = `<div class="gm2-ust ay-baslik"><span class="gm2-logo" title="MineKO Yönetim Paneli"><img src="./assets/ui/pus/mineko_logo.webp" alt="MineKO" draggable="false"></span><b>Yönetim Paneli</b><span class="gm2-ayrac">/</span><span class="gm2-sayfa"></span>
          <span class="gm2-bilgi">${esc(character.name || '')} · ${esc(zoneName())}</span>
          <label class="gm2-saydam" title="Panel saydamlığı"><span>Saydamlık</span><input type="range" name="gm-saydam" min="35" max="100" step="5" value="${gmSaydam}"><em>%${gmSaydam}</em></label>
          <button class="gm2-tam" data-k="tam" title="Tam ekran (F11 gibi panel tüm ekranı kaplar)"><i></i></button><button class="gm2-gizle" data-k="gizle" title="Paneli gizle / göster (yalnız başlık kalır)"><i></i></button><button class="gm2-kapat" data-k="kapat" title="Kapat (Esc)">✕</button></div>
        <div class="gm2-ic"><nav class="gm2-nav">
          ${grup('Genel', [['konum', 'Konum ve noktalar'], ['proje', 'Proje yönetimi']])}
          ${grup('Dünya', [['dunya', 'Dünya editörü'], ['saat', 'Saat ve hava'], ['kule', 'Kuleler'], ['mob', 'Moblar'], ['npc', "NPC'ler"], ['reklam', 'Reklam alanları']])}
          ${grup('Eşya ve ekonomi', [['veri', 'Eşya veritabanı'], ['baslangic', 'Başlangıç'], ['meslek', 'Meslekler']])}
          ${grup('Oyuncular', [['oyuncular', 'Oyuncu listesi'], ['hesaplar', 'Hesaplar'], ['destek', 'Destek talepleri'], ['donusum', 'Dönüşüm'], ['gmler', 'GM yönetimi']])}
          ${grup('Etkinlik', [['etkinlik', 'Etkinlikler ve Notice'], ['duyuru', 'Otomatik duyurular']])}
          ${grup('Ayarlar', [['ayarlar', 'Panel ve sunucu']])}
          <div class="gm2-grup gm2-mg">MineGuard</div><button data-t="mineguard" class="gm2-mg-b"><span class="gm2-uzun">Ceza takip sistemi</span><span class="gm2-kisa">Ceza takip</span></button><button data-t="esyatakip" class="gm2-mg-b"><span class="gm2-uzun">Eşya takibi</span><span class="gm2-kisa">Eşya takip</span></button>
          <button class="gm2-nav-gizle" data-k="nav" title="Menüyü gizle / göster"><i></i><span>Menüyü gizle</span></button>
        </nav><div class="gm-govde"></div></div><div class="gm2-boyut-tut" title="Sürükleyerek boyutlandır"></div>`;
      // Destek talepleri: menüde açık talep sayısı (yeni soru gelince oyuncuya bildirim)
      { const rozet = (n) => { const bt = win?.querySelector('.gm2-nav button[data-t="destek"]'); if (!bt) return; let r = bt.querySelector('.gds-rozet'); if (!r) { r = document.createElement('em'); r.className = 'gds-rozet'; bt.append(r); } r.textContent = n > 0 ? String(n) : ''; r.hidden = !(n > 0); };
        let onceki = null;
        addEventListener('ko-gm-destek-sayi', (e) => rozet(Number(e.detail) || 0));
        const say = async () => { const { data } = await Promise.resolve(sb.rpc('gm_destek_liste', { p_char: character.id, p_durum: 'acik' })).catch(() => ({})); const n = data?.acik || 0; rozet(n); if (onceki != null && n > onceki) hud.notice?.(`New support request (${n} open).`, 'gorev'); onceki = n; };
        say(); setInterval(say, 60000); }
      document.body.append(win); toFront(win);
      // küçültülünce sığdır: panel tasarım boyutundan (1180 × 800) küçükse tüm içerik aynı oranda küçülür
      new ResizeObserver(() => olcekUygula()).observe(win);
      // sağ alt köşeden sürükleyerek boyutlandırma (özel boyut hatırlanır)
      win.querySelector('.gm2-boyut-tut').addEventListener('pointerdown', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const r0 = win.getBoundingClientRect(), x0 = ev.clientX, y0 = ev.clientY, el = ev.currentTarget; el.setPointerCapture(ev.pointerId);
        const hareket = (e) => { const w = Math.max(520, Math.min(innerWidth - r0.left - 4, r0.width + e.clientX - x0)), h = Math.max(360, Math.min(innerHeight - r0.top - 4, r0.height + e.clientY - y0)); win.style.setProperty('width', w + 'px'); win.style.setProperty('height', h + 'px'); };
        const bitir = () => { el.removeEventListener('pointermove', hareket); el.removeEventListener('pointerup', bitir); const r = win.getBoundingClientRect(); gmBoyut = 'ozel'; try { localStorage.setItem('ko-gm-boyut', 'ozel'); localStorage.setItem('ko-gm-ozel', JSON.stringify([Math.round(r.width), Math.round(r.height)])); } catch {} const sel = win.querySelector('[name=ay-boyut]'); if (sel) sel.value = 'ozel'; window.dispatchEvent(new Event('resize')); };
        el.addEventListener('pointermove', hareket); el.addEventListener('pointerup', bitir);
      });
      boyutUygula(true);
      if (tabletAcik()) { gmTam = true; win.classList.add('gm-tablet'); }   // (7.11) tablet: panel tüm ekranı kaplar, küçültme ölçeği yok
      saydamUygula(); temaUygula(); navUygula(); if (gmGizli) gizleDegis(true); if (gmTam) tamUygula();
      win.addEventListener('input', (ev) => { if (ev.target.name === 'de-ara') { deAra = ev.target.value.trim().toLocaleLowerCase('tr'); clearTimeout(deAraT); deAraT = setTimeout(() => { const k = win.querySelector('.de-kutup'); if (k) k.innerHTML = kutupHtml(); }, 180); } });
      { const bar = win.querySelector('.gm2-ust'); let d = null;   // başlıktan sürükle
        bar.addEventListener('pointerdown', (e) => { if (e.button !== 0 || gmTam || e.target.closest('button, input, label, select')) return; const r = win.getBoundingClientRect(); d = { dx: e.clientX - r.left, dy: e.clientY - r.top }; bar.setPointerCapture(e.pointerId); e.preventDefault(); });
        bar.addEventListener('pointermove', (e) => { if (!d) return; win.style.left = Math.min(Math.max(-500, e.clientX - d.dx), innerWidth - 120) + 'px'; win.style.top = Math.min(Math.max(0, e.clientY - d.dy), innerHeight - 40) + 'px'; });
        bar.addEventListener('pointerup', () => (d = null)); bar.addEventListener('pointercancel', () => (d = null));
        bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button, input, label')) gizleDegis(); }); }
      // gizle düğmesi ve saydamlık kaydırıcısı: kendi dinleyicileri (başlık sürüklemesi / oyun tıklamaları karışmasın)
      { const gb = win.querySelector('.gm2-gizle'), sl = win.querySelector('[name=gm-saydam]');
        for (const el of [gb, sl]) el?.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(win); });
        gb?.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); gizleDegis(); });
        const sUygula = () => { gmSaydam = Math.max(35, Math.min(100, Number(sl.value) || 100)); saydamUygula(); try { localStorage.setItem('ko-gm-saydam', String(gmSaydam)); } catch {} };
        sl?.addEventListener('input', (e) => { e.stopPropagation(); sUygula(); }); sl?.addEventListener('change', (e) => { e.stopPropagation(); sUygula(); }); }
      win.addEventListener('change', (ev) => { const nm = ev.target.name;
        if (nm === 'ay-tema') { gmTema = ev.target.value === 'koyu' ? 'koyu' : 'acik'; try { localStorage.setItem('ko-gm-tema', gmTema); } catch {} temaUygula(); return; }
        if (nm === 'ay-boyut') { gmBoyut = ev.target.value; try { localStorage.setItem('ko-gm-boyut', gmBoyut); } catch {} boyutUygula(true); return; }
        if (nm === 'ay-nav') { navKapali = !ev.target.checked; navUygula(); return; }
        if (nm === 'ay-gizli') { gizleDegis(ev.target.checked); return; }
        if (nm === 'ay-tablet') { tabletUygula({ state, acik: ev.target.checked }); win.classList.toggle('gm-tablet', ev.target.checked); if (ev.target.checked) gmTam = true; if (gmTam) tamUygula(); olcekUygula(); return; }
        if (nm === 'ay-tamekran') { tamEkranDegis(); return; } });
      win.addEventListener('input', (ev) => { if (ev.target.name === 'ay-saydam') { gmSaydam = Number(ev.target.value); saydamUygula(); const b = ev.target.parentNode.querySelector('b'); if (b) b.textContent = '%' + gmSaydam; const hs = win.querySelector('[name=gm-saydam]'); if (hs) hs.value = gmSaydam; try { localStorage.setItem('ko-gm-saydam', String(gmSaydam)); } catch {} } });
      win.addEventListener('change', (ev) => { if (ev.target.name === 'de-harita') { deHarita = ev.target.value; deObjeler = null; deSec = null; state.dunya?.sec?.(null); onizleGoster(); render(); objelerYukle(); return; } if (ev.target.name === 'rk-dosya' && ev.target.files?.[0]) reklamGorsel(ev.target.files[0]); });
      win.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); toFront(win); });
      win.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (dunyaKisayol(ev)) return; if (ev.key === 'Escape') close(); });
      win.tabIndex = -1;
      win.addEventListener('click', onClick);
      // kule modelleri: üzerine gelince önizleme, tekerlekle sıradaki/önceki model
      win.addEventListener('pointerover', (ev) => { const mi = ev.target.closest?.('.gm-model'); if (mi) preview(Number(mi.dataset.i)); });
      win.addEventListener('pointerout', (ev) => { if (ev.target.closest?.('.gm-modeller') && !ev.relatedTarget?.closest?.('.gm-modeller')) { hoverI = -1; hideModel(); kartGizle(); markModel(); } });
      win.addEventListener('wheel', (ev) => {
        const list = ev.target.closest?.('.gm-modeller'); if (!list) return;
        ev.preventDefault();
        const n = TOWER_MODELS.length, i = ((hoverI < 0 ? 0 : hoverI + Math.sign(ev.deltaY)) + n) % n;
        preview(i); list.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
      }, { passive: false });
      win.addEventListener('change', async (ev) => { if (ev.target.name === 'gmolumsuz') { try { olumsuz = await rpc('gm_olumsuz_ayarla', { p_acik: ev.target.checked }); state.gmOlumsuz = olumsuz; hud.info?.(olumsuz ? 'GM: taking damage off (invulnerable).' : 'GM: taking damage on.', 'tamam'); } catch { ev.target.checked = olumsuz; } return; } if (ev.target.name === 'gmfx') { window.__gmAura?.(ev.target.checked); return; } if (ev.target.name === 'gmperi') { window.__gmPeriAyarla?.(ev.target.checked); hud.info?.(ev.target.checked ? 'GM: fairies are flying around you.' : 'GM: fairies turned off.', 'tamam'); return; } if (ev.target.name === 'gmgizli') { state.net?.setGizli?.(ev.target.checked); state.gmGizliIsaret?.(ev.target.checked); hud.info?.(ev.target.checked ? 'GM: you are hidden — players cannot see you.' : 'GM: you are visible.', 'tamam'); return; } if (ev.target.name === 'yn' && !pickModel) render(); });
      loadStart();
    }
    render();
  }
  // ---- reklam alanları
  async function reklamYukle() {
    const { data } = await sb.from('reklam_alanlari').select('*').order('id');
    reklamlar = data || []; if (reklamSec == null && reklamlar[0]) reklamSec = reklamlar[0].id; render();
  }
  const rkDeger = () => {
    const v = (n) => win.querySelector(`[name=${n}]`)?.value;
    return { kod: v('rk-kod'), zone: v('rk-zone'), x: Number(v('rk-x')), y: Number(v('rk-y')), z: Number(v('rk-z')), yaw: (Number(v('rk-yaw')) || 0) * Math.PI / 180,
      genislik: Number(v('rk-gen')), yukseklik: Number(v('rk-yuk')), aktif: !!win.querySelector('[name=rk-aktif]')?.checked };
  };
  async function rkKaydet(id, veri, mesaj) {
    const d = await rpc('gm_reklam_kaydet', { p_id: id, p_veri: veri });
    if (!d?.ok) { hud.notice?.(d?.reason || 'Could not save.', 'hata'); return null; }
    hud.info?.(mesaj || `${d.kod} saved.`, 'tamam'); reklamSec = d.id; await reklamYukle(); state.reklam?.yenile?.(); return d;
  }
  async function reklamIslem(k) {
    const r = reklamlar?.find((x) => x.id === reklamSec);
    if (k === 'rk-yeni') { const p = here(); return rkKaydet(null, { zone, x: p.x, y: +(state.heightAt?.(p.x, p.z) ?? 0).toFixed(1), z: p.z, yaw: 0, genislik: 5.4, yukseklik: 9.5 }, 'New banner area added at your position.'); }
    if (!r) return;
    if (k === 'rk-kaydet') return rkKaydet(r.id, rkDeger());
    if (k === 'rk-buraya') { const p = here(); return rkKaydet(r.id, { zone, x: p.x, z: p.z, y: +(state.heightAt?.(p.x, p.z) ?? r.y).toFixed(1) }, `${r.kod} moved to your position.`); }
    if (k === 'rk-git') { teleport(Number(r.x), Number(r.z) - 6); return; }
    if (k === 'rk-varsayilan') return rkKaydet(r.id, { gorsel: null }, `${r.kod}: default MineKO banner.`);
  }
  // yüklenen görsel: yatay ise 90° çevrilir, bayrak oranına kırpılır (ortadan), önerilen ölçüye indirilip WebP olarak kaydedilir
  async function reklamGorsel(dosya) {
    const r = reklamlar?.find((x) => x.id === reklamSec); if (!r) return;
    const ol = onerilenOlcu(r.genislik, r.yukseklik), W = Math.min(ol.w, 900), H = Math.round(W * ol.h / ol.w);
    const img = await createImageBitmap(dosya).catch(() => null); if (!img) return hud.notice?.('Could not read the image.', 'hata');
    const dondur = img.width > img.height && ol.h > ol.w;
    const sw = dondur ? img.height : img.width, sh = dondur ? img.width : img.height;   // çevrildikten sonraki boyut
    const k = Math.max(W / sw, H / sh);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.translate(W / 2, H / 2); if (dondur) g.rotate(Math.PI / 2);
    const dw = img.width * k, dh = img.height * k; g.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    let url = c.toDataURL('image/webp', 0.86); if (url.length > 2800000) url = c.toDataURL('image/webp', 0.7);
    await rkKaydet(r.id, { gorsel: url }, `${r.kod}: new image uploaded (${W} × ${H} px${dondur ? ', rotated 90°' : ''}).`);
  }
  // ---- GM yönetimi
  async function gmYukle() { gmVeri = await rpc('gm_liste', {}).catch(() => null); if (gmVeri && gmSec == null) gmSec = gmVeri.liste[0]?.id ?? null; render(); }
  async function gmIslem(k, b) {
    const v = (n) => win.querySelector(`[name=${n}]`)?.value;
    if (k === 'gm-ekle') { const ad = (v('gm-yeni-ad') || '').trim(); if (!ad) return hud.notice?.('Enter a character name.', 'hata');
      const d = await rpc('gm_ekle', { p_ad: ad, p_rutbe: v('gm-yeni-rutbe'), p_not: v('gm-yeni-not') || null });
      if (!d?.ok) return hud.notice?.(d?.reason || 'Could not add.', 'hata'); hud.info?.(`${d.ad} added as GM.`, 'tamam'); return gmYukle(); }
    if (gmSec == null) return;
    if (k === 'gm-kaydet') { const d = await rpc('gm_duzenle', { p_hedef: gmSec, p_rutbe: v('gm-rutbe'), p_not: v('gm-not') || null });
      if (!d?.ok) return hud.notice?.(d?.reason || 'Could not save.', 'hata'); hud.info?.('GM details saved.', 'tamam'); return gmYukle(); }
    if (k === 'gm-cikar') {
      if (performance.now() - cikarT > 4000) { cikarT = performance.now(); b.textContent = 'Emin misin? Tekrar bas'; return; }
      const d = await rpc('gm_cikar', { p_hedef: gmSec }); if (!d?.ok) return hud.notice?.(d?.reason || 'Could not remove.', 'hata');
      hud.info?.(`${d.ad}: GM rights removed.`, 'tamam'); gmSec = null; return gmYukle(); }
  }

  // ---- dünya editörü: harita seç, obje kütüphanesi, yerleştir / döndür / ölçekle / taşı / kopyala / kes / yapıştır, duvar (çarpışma) modülü
  const YAPI_RE = /\b(gate|door|stone|tower|statue|flag|box|chest|barricade|wall|fence|tent|catapult|cannon|altar|monument|pillar|portal|bridge|house|tree|rock|crystal|throne|well|wagon|cart|torch|lamp|banner|bind|totem|obelisk|shrine|fountain|grave|tomb|coffin|barrel|crate|sign|table|chair|boat|ship|ore|mine|kale|kapı|kule|taş|sandık|bayrak|heykel)/i;
  const kalanBol = () => win?.querySelector('.de-kutup');
  async function kutupYukle() {
    if (deKutupL) return deKutupL;
    const ad = new Map(), tur = new Map();
    try { const r = await fetch((window.KO_V || ((u) => u))('./assets/npc_katalog.json')); const j = r.ok ? await r.json() : []; for (const n of (Array.isArray(j) ? j : j.npcs || [])) if (n.m && !ad.has(n.m)) { ad.set(n.m, n.n); tur.set(n.m, 'npc'); } } catch {}
    try { for (let b = 0; b < 20000; b += 1000) { const { data } = await sb.from('monsters').select('name,model').range(b, b + 999); if (!data?.length) break; for (const m of data) if (m.model && !ad.has(m.model)) { ad.set(m.model, m.name); tur.set(m.model, 'mob'); } if (data.length < 1000) break; } } catch {}
    const L = npcModelAnahtarlari().map((k) => { const n = ad.get(k) || ''; let t = tur.get(k) || 'yapi'; if (n && YAPI_RE.test(n)) t = 'yapi'; return { k, ad: n || k.replace(/^npc_/, 'Model #'), t }; });
    L.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
    L.unshift({ k: 'duvar', ad: 'Duvar modülü (taş duvar)', t: 'modul' });
    return (deKutupL = L);
  }
  function kutupHtml() {
    if (!deKutupL) return '<div class="g2-bos">Kütüphane yükleniyor…</div>';
    const l = deKutupL.filter((m) => m.t === deKat && (!deAra || m.ad.toLocaleLowerCase('tr').includes(deAra) || m.k.includes(deAra)));
    setTimeout(ikonDoldur, 0);
    return l.slice(0, 240).map((m) => `<button class="de-model${m.k === deModel ? ' secili' : ''}" data-dm="${esc(m.k)}" data-ad="${esc(m.ad)}" title="${esc(m.ad)} · ${esc(m.k)}"><span class="de-resim" data-ik="${esc(m.k)}">${m.k === 'duvar' ? '<i class="de-duvar-ik"></i>' : ''}</span><b>${esc(m.ad)}</b></button>`).join('')
      + (l.length > 240 ? `<div class="g2-bos">${l.length - 240} model daha — aramayı daralt.</div>` : '') + (l.length ? '' : '<div class="g2-bos">Eşleşen model yok.</div>');
  }
  let ikonGoz = null;
  function ikonDoldur() {   // görünen kutucuklara model portresi (sırayla çizilir)
    const k = kalanBol(); if (!k) return;
    ikonGoz?.disconnect();
    ikonGoz = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { const el = e.target; ikonGoz.unobserve(el); modelIkon(el.dataset.ik).then((u) => { if (u) el.style.backgroundImage = `url(${u})`; }); } }, { root: k });
    k.querySelectorAll('.de-resim[data-ik]').forEach((el) => { if (el.dataset.ik !== 'duvar') ikonGoz.observe(el); });
  }
  async function dunyaAc() {
    if (!deHaritalar) sb.from('zones').select('id,name').order('sort').then(({ data }) => { deHaritalar = data || []; render(); }, () => {});
    kutupYukle().then(() => { if (tab === 'dunya') { const k = kalanBol(); if (k) k.innerHTML = kutupHtml(); } });
    await objelerYukle();
  }
  async function objelerYukle() {
    let data = []; try { ({ data } = await sb.from('dunya_objeleri').select('*').eq('zone', deHarita).eq('aktif', true).order('id')); } catch {}
    deObjeler = data || []; if (deSec != null && !deObjeler.some((o) => o.id === deSec)) deSec = null;
    if (tab === 'dunya') render();
  }
  const onu = (m = 3) => { const p = player.position, y = state.yaw || 0; const x = +(p.x + Math.sin(y) * m).toFixed(2), z = +(p.z + Math.cos(y) * m).toFixed(2); return { x, z, y: +(state.heightAt?.(x, z) ?? p.y).toFixed(2), yaw: +((y + Math.PI) % (Math.PI * 2)).toFixed(3) }; };
  function onizleGoster() { if (deHarita === zone && deModel) state.dunya?.onizle?.(deModel, onu()); else state.dunya?.onizle?.(null); }
  function dunyaHtml() {
    const burada = deHarita === zone;
    const o = deObjeler?.find((x) => x.id === deSec);
    const kat = [['yapi', 'Yapı & obje'], ['npc', 'NPC'], ['mob', 'Mob'], ['modul', 'Modüller']];
    const f = (n, v, st = 0.1, ek = '') => `<input type="number" name="${n}" step="${st}" value="${v ?? ''}" ${ek}>`;
    const sayi = deKutupL ? kat.map(([k]) => deKutupL.filter((m) => m.t === k).length) : [];
    return `<div class="de-ust"><label>Harita <select name="de-harita">${(deHaritalar || [{ id: zone, name: zoneName() }]).map((z) => `<option value="${esc(z.id)}" ${z.id === deHarita ? 'selected' : ''}>${esc(z.name)}${z.id === zone ? ' · buradasın' : ''}</option>`).join('')}</select></label>
        <span class="g2-rozet">${deObjeler ? deObjeler.length : '…'} obje</span>
        ${burada ? `<span class="de-not">Yerleştirme bulunduğun yere / önüne yapılır. Harita nesnelerine dokunulmaz.</span>` : `<span class="de-not uyari">Bu haritada değilsin — objeleri görebilir, kaldırabilirsin; yerleştirmek ve taşımak için haritaya git.</span><button data-k="de-haritaya-git" class="g2-ana">Haritaya git</button>`}</div>
      <div class="de-izgara">
        <div class="g2-bolum de-kutuphane"><div class="g2-bas">Obje kütüphanesi</div>
          <div class="g2-alt">${kat.map(([k, a], i) => `<button data-dk="${k}" class="${deKat === k ? 'secili' : ''}">${a}${sayi.length ? ` <small>${sayi[i]}</small>` : ''}</button>`).join('')}</div>
          <input name="de-ara" class="de-ara" placeholder="Ara: ad ya da model no" value="${esc(deAra)}" autocomplete="off">
          <div class="de-kutup">${kutupHtml()}</div>
          ${deKat === 'modul' ? `<div class="g2-form g2-satirform3"><label>Duvar eni (m)${f('de-ygen', 4, 0.5)}</label><label>Yükseklik (m)${f('de-yyuk', 3, 0.5)}</label><label>Kalınlık (m)${f('de-yder', 0.8, 0.1)}</label></div>` : ''}
          <div class="g2-dugmeler"><button data-k="de-yerlestir" class="g2-ana" ${deModel && burada ? '' : 'disabled'}>${deModel ? `Yerleştir: ${esc(deModelAd || deModel)}` : 'Yerleştirmek için model seç'}</button>
            <label class="de-cb"><input type="checkbox" name="de-yduvar" ${deModel === 'duvar' ? 'checked' : ''}> Duvar (geçilmez)</label></div></div>
        <div class="de-sag">
          <div class="g2-bolum"><div class="g2-bas">Haritadaki objeler <span class="g2-ben">${dePano ? `Panoda: ${esc(dePano.ad || dePano.model)}${dePano.kes ? ' (kesildi)' : ''}` : 'Pano boş'}</span></div>
            <div class="de-liste">${deObjeler ? deObjeler.map((r) => `<div class="de-satir${r.id === deSec ? ' secili' : ''}" data-do="${r.id}"><b>${esc(r.ad || r.model)}</b><i>#${r.id} · X ${(+r.x).toFixed(1)} Z ${(+r.z).toFixed(1)}${r.duvar ? ' · <em>duvar</em>' : ''}</i></div>`).join('') || '<div class="g2-bos">Bu haritada eklenmiş obje yok.</div>' : '<div class="g2-bos">Yükleniyor…</div>'}</div></div>
          <div class="g2-bolum de-denetci"><div class="g2-bas">${o ? `Seçili: ${esc(o.ad || o.model)} <span class="g2-ben">#${o.id} · ${esc(o.model)}</span>` : 'Seçili obje yok'}</div>
            ${o ? `<div class="g2-form de-form"><label>Ad<input name="de-ad" value="${esc(o.ad || '')}"></label><label>X${f('de-x', (+o.x).toFixed(2))}</label><label>Y${f('de-y', (+o.y).toFixed(2))}</label><label>Z${f('de-z', (+o.z).toFixed(2))}</label>
              <label>Yön (°)${f('de-yaw', deg(+o.yaw), 1)}</label><label>Ölçek${f('de-olcek', (+o.olcek).toFixed(2), 0.05, 'min="0.05" max="50"')}</label>
              ${o.model === 'duvar' ? `<label>En (m)${f('de-gen', o.gen, 0.5)}</label><label>Yükseklik${f('de-yuk', o.yuk, 0.5)}</label><label>Kalınlık${f('de-der', o.der, 0.1)}</label>` : ''}
              <label class="de-cb"><input type="checkbox" name="de-duvar" ${o.duvar ? 'checked' : ''}> Duvar — oyuncular içinden geçemez</label></div>
              <div class="de-araclar"><div><span>Döndür</span><button data-k="de-don" data-v="-15">⟲ 15°</button><button data-k="de-don" data-v="15">⟳ 15°</button><button data-k="de-don" data-v="90">90°</button></div><div><span>Ölçek</span><button data-k="de-olc" data-v="0.9">− %10</button><button data-k="de-olc" data-v="1.1">+ %10</button><button data-k="de-olc" data-v="0">1:1</button></div><div><span>Taşı</span><button data-k="de-tas" data-v="x-">X −</button><button data-k="de-tas" data-v="x+">X +</button><button data-k="de-tas" data-v="z-">Z −</button><button data-k="de-tas" data-v="z+">Z +</button><button data-k="de-tas" data-v="y+">Y ↑</button><button data-k="de-tas" data-v="y-">Y ↓</button><button data-k="de-tas" data-v="zemin">Zemine</button></div><div><span>Adım</span><select name="de-adim"><option value="0.1">0,1 m</option><option value="0.5" selected>0,5 m</option><option value="1">1 m</option><option value="5">5 m</option></select></div>
              </div>
              <div class="g2-dugmeler"><button data-k="de-kaydet" class="g2-ana">Kaydet</button>${burada ? '<button data-k="de-buraya">Önüme taşı</button><button data-k="de-git">Yanına git</button>' : ''}
                <button data-k="de-kopyala" title="Ctrl+C">Kopyala</button><button data-k="de-kes" title="Ctrl+X">Kes</button><button data-k="de-cogalt" ${burada ? '' : 'disabled'}>Çoğalt</button><button data-k="de-sil" class="g2-tehlike" title="Delete">Kaldır</button></div>`
              : '<p class="ay-not">Listeden ya da kütüphaneden yerleştirerek bir obje seç. Kısayollar (panel odaktayken): Ctrl+C / Ctrl+X / Ctrl+V, Delete, Q / E döndür.</p>'}
            <div class="g2-dugmeler"><button data-k="de-yapistir" ${dePano && burada ? '' : 'disabled'} title="Ctrl+V — önüne yapıştırır">Yapıştır${dePano ? `: ${esc(dePano.ad || dePano.model)}` : ''}</button></div></div>
        </div></div>`;
  }
  async function deKaydet(id, veri, mesaj) {
    const d = await rpc('gm_obje_kaydet', { p_id: id, p_veri: veri });
    if (!d?.ok) { hud.notice?.(d?.reason || 'Could not save.', 'hata'); return null; }
    state.dunya?.uygula?.(d.obje);
    const i = deObjeler?.findIndex((x) => x.id === d.obje.id) ?? -1;
    if (!d.obje.aktif) { if (i >= 0) deObjeler.splice(i, 1); if (deSec === d.obje.id) deSec = null; }
    else if (i >= 0) deObjeler[i] = d.obje; else deObjeler?.push(d.obje);
    if (d.obje.aktif && id == null) { deSec = d.obje.id; setTimeout(() => state.dunya?.sec?.(deSec), 400); }
    if (mesaj) hud.info?.(mesaj, 'tamam');
    render(); return d.obje;
  }
  const panoAl = (o, kes) => ({ model: o.model, ad: o.ad, yaw: o.yaw, olcek: o.olcek, duvar: o.duvar, gen: o.gen, yuk: o.yuk, der: o.der, kes });
  async function dunyaIslem(k, b) {
    const v = (n) => win.querySelector(`[name=${n}]`)?.value, cb = (n) => !!win.querySelector(`[name=${n}]`)?.checked;
    const burada = deHarita === zone;
    if (k === 'de-haritaya-git') {
      const { data, error } = await sb.rpc('gm_teleport', { p_char: character.id, p_zone: deHarita });
      if (error) return hud.notice?.(error.message, 'hata');
      say?.(`Teleporting to ${data?.name || deHarita}…`, 'tamam'); state.net?.halt?.();
      const u = new URL(location.href); ['x', 'z', 'bolge'].forEach((q) => u.searchParams.delete(q)); u.searchParams.set('karakter', character.id);
      return setTimeout(() => location.replace(u.toString()), 350);
    }
    if (k === 'de-yerlestir') {
      if (!deModel || !burada) return;
      const p = onu(), duvar = deModel === 'duvar' ? true : cb('de-yduvar');
      const veri = { zone, model: deModel, ad: deModelAd || deModel, x: p.x, y: p.y, z: p.z, yaw: p.yaw, olcek: 1, duvar };
      if (deModel === 'duvar') Object.assign(veri, { gen: Number(v('de-ygen')) || 4, yuk: Number(v('de-yyuk')) || 3, der: Number(v('de-yder')) || 0.8 });
      return deKaydet(null, veri, `${veri.ad} placed.`);
    }
    if (k === 'de-yapistir') {
      if (!dePano || !burada) return;
      const p = onu(); const veri = { ...dePano, zone, x: p.x, y: p.y, z: p.z }; delete veri.kes;
      const r = await deKaydet(null, veri, `${veri.ad || veri.model} pasted.`);
      if (r && dePano.kes) dePano = null;
      return render();
    }
    const o = deObjeler?.find((x) => x.id === deSec); if (!o) return;
    const adim = Number(v('de-adim')) || 0.5;
    if (k === 'de-kaydet') {
      const veri = { ad: v('de-ad') || null, x: Number(v('de-x')), y: Number(v('de-y')), z: Number(v('de-z')), yaw: (Number(v('de-yaw')) || 0) * Math.PI / 180, olcek: Number(v('de-olcek')) || 1, duvar: cb('de-duvar') };
      if (o.model === 'duvar') Object.assign(veri, { gen: Number(v('de-gen')) || 4, yuk: Number(v('de-yuk')) || 3, der: Number(v('de-der')) || 0.8 });
      return deKaydet(o.id, veri, 'Object saved.');
    }
    if (k === 'de-don') { const d = Number(b.dataset.v) * Math.PI / 180; return deKaydet(o.id, { yaw: +(((+o.yaw + d) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)).toFixed(4) }); }
    if (k === 'de-olc') { const f = Number(b.dataset.v); return deKaydet(o.id, { olcek: f ? +(o.olcek * f).toFixed(3) : 1 }); }
    if (k === 'de-tas') {
      const yon = b.dataset.v, veri = {};
      if (yon === 'zemin') veri.y = +(state.heightAt?.(+o.x, +o.z) ?? o.y).toFixed(2);
      else { const ek = (yon.endsWith('+') ? 1 : -1) * (yon[0] === 'y' ? Math.min(adim, 1) : adim); veri[yon[0]] = +(+o[yon[0]] + ek).toFixed(2); }
      return deKaydet(o.id, veri);
    }
    if (k === 'de-buraya' && burada) { const p = onu(); return deKaydet(o.id, { x: p.x, y: p.y, z: p.z }, 'Object moved in front of you.'); }
    if (k === 'de-git' && burada) { teleport(+o.x + 2.5, +o.z + 2.5); return; }
    if (k === 'de-kopyala') { dePano = panoAl(o, false); hud.info?.(`${o.ad || o.model} copied — use Paste to place it in front of you.`, 'tamam'); return render(); }
    if (k === 'de-kes') { dePano = panoAl(o, true); return deKaydet(o.id, { aktif: false }, `${o.ad || o.model} cut — use Paste to place it somewhere new.`); }
    if (k === 'de-cogalt' && burada) { const veri = { ...panoAl(o), zone, x: +(+o.x + 2).toFixed(2), y: o.y, z: o.z }; delete veri.kes; return deKaydet(null, veri, 'Object duplicated (2 m to the side).'); }
    if (k === 'de-sil') {
      if (performance.now() - silT > 4000) { silT = performance.now(); b.textContent = 'Emin misin? Tekrar bas'; return; }
      return deKaydet(o.id, { aktif: false }, `${o.ad || o.model} removed.`);
    }
  }
  function dunyaKisayol(ev) {
    return false;   // eski dünya editörü kısayolları (yeni editör dunya-editor.js kendi kısayollarını yönetir)
    // eslint-disable-next-line no-unreachable
    if (tab !== 'dunya' || /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return false;
    const c = ev.ctrlKey || ev.metaKey, key = ev.key.toLowerCase(), fake = (k, v) => ({ dataset: { v }, textContent: '' });
    const tik = (k, v) => { ev.preventDefault(); dunyaIslem(k, v != null ? fake(k, v) : win.querySelector(`[data-k=${k}]`) || fake(k)); return true; };
    if (c && key === 'c') return tik('de-kopyala');
    if (c && key === 'x') return tik('de-kes');
    if (c && key === 'v') return tik('de-yapistir');
    if (key === 'delete') return tik('de-sil');
    if (key === 'q') return tik('de-don', -15);
    if (key === 'e') return tik('de-don', 15);
    return false;
  }
  // saydamlık: pencerenin kendisi (inline opacity — başka kurallar ezmesin); gizle: yalnız başlık şeridi kalır
  /** renk modu: koyu temada panel ve önizleme kartları koyu (client.css .gm2.koyu kuralları) */
  function temaUygula() { win?.classList.toggle('koyu', gmTema === 'koyu'); document.documentElement.classList.toggle('gm-koyu', gmTema === 'koyu'); }
  function saydamUygula() { if (!win) return; win.style.setProperty('opacity', String(gmSaydam / 100), 'important'); const sl = win.querySelector('[name=gm-saydam]'); if (sl && Number(sl.value) !== gmSaydam) sl.value = gmSaydam; const e = win.querySelector('.gm2-saydam em'); if (e) e.textContent = '%' + gmSaydam; }
  /** içerik ölçeği: panel 1180 × 800'den küçükse yazılar, ikonlar, listeler aynı oranda küçülür (en az %55) */
  function olcekUygula() {
    if (!win) return;
    const r = win.getBoundingClientRect(); if (!r.width || win.classList.contains('gizli')) return;   // küçültülmüş kompakt kutu ölçeği değiştirmez
    const k = document.documentElement.classList.contains('ko-tablet') ? 1 : Math.max(0.55, Math.min(1, r.width / 1180, win.classList.contains('gizli') ? 1 : (r.height || 800) / 800));
    const eski = Number(win.style.getPropertyValue('--g2-olcek')) || 1; const eskiKucuk = win.classList.contains('kucuk');
    if (Math.abs(k - eski) < 0.005) return;
    win.style.setProperty('--g2-olcek', k.toFixed(3));
    win.style.setProperty('--g2-nav', (Math.max(k, 0.86) / k).toFixed(3)); if (win.classList.toggle('kucuk', k < 0.95) !== eskiKucuk) navUygula();   // küçükken sol menü okunur kalır (en az %86) ve sıkışık
    clearTimeout(olcekUygula.t); olcekUygula.t = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);   // sanal listeler yeniden ölçsün
  }
  function boyutUygula(ortala) {
    if (!win) return;
    let ozel = null; if (gmBoyut === 'ozel') { try { ozel = JSON.parse(localStorage.getItem('ko-gm-ozel') || 'null'); } catch {} }
    const [w, h] = gmBoyut === 'orta' ? [980, 680] : gmBoyut === 'kucuk' ? [800, 560] : gmBoyut === 'tam' ? [innerWidth - 16, innerHeight - 16] : ozel ? ozel : [1180, 800];
    win.style.setProperty('width', `min(${w}px, calc(100vw - 16px))`); win.style.setProperty('height', `min(${h}px, calc(100vh - 16px))`);
    if (ortala || gmBoyut === 'tam') { win.style.left = Math.max(8, Math.round((innerWidth - Math.min(w, innerWidth - 16)) / 2)) + 'px'; win.style.top = Math.max(8, Math.round((innerHeight - Math.min(h, innerHeight - 16)) / 2)) + 'px'; }
  }
  function tamUygula() {
    if (!win) return;
    win.classList.toggle('tam', gmTam);
    const b = win.querySelector('.gm2-tam'); if (b) b.title = gmTam ? 'Tam ekrandan çık' : 'Tam ekran (panel tüm ekranı kaplar)';
    if (gmTam) { if (gmGizli) gizleDegis(false); win.style.left = '0px'; win.style.top = '0px'; win.style.setProperty('width', document.documentElement.classList.contains('ko-tablet') ? 'calc(100vw - 74px)' : '100vw', 'important'); win.style.setProperty('height', '100vh', 'important'); }
    else { win.style.removeProperty('width'); win.style.removeProperty('height'); boyutUygula(true); }
    try { localStorage.setItem('ko-gm-tam', gmTam ? '1' : '0'); } catch {}
    window.dispatchEvent(new Event('resize'));
  }
  function navUygula() {
    if (!win) return; win.classList.toggle('nav-kapali', navKapali);
    const b = win.querySelector('.gm2-nav-gizle'); if (b) { b.title = navKapali ? 'Menüyü göster' : 'Menüyü gizle'; b.querySelector('span').textContent = navKapali ? '' : win.classList.contains('kucuk') ? 'Gizle' : 'Menüyü gizle'; }
    try { localStorage.setItem('ko-gm-nav', navKapali ? '1' : '0'); } catch {}
    window.dispatchEvent(new Event('resize'));   // gömülü listeler (sanal kaydırma) yeniden ölçsün
  }
  function gizleDegis(zorla) {
    if (!win) return; const r0 = win.classList.contains('gizli') ? null : win.getBoundingClientRect(), tam0 = win.classList.contains('tam');   // küçültmeden önceki boyut
    if (!win) return; gmGizli = zorla ?? !gmGizli; if (gmGizli && gmTam) { gmTam = false; tamUygula(); }
    const ic = win.querySelector('.gm2-ic'), gb = win.querySelector('.gm2-gizle');
    win.classList.toggle('gizli', gmGizli);
    if (ic) ic.style.display = gmGizli ? 'none' : '';
    if (gmGizli) {
      // küçültmeden önceki boyut kaydedilir: "Paneli göster" ve sonraki açılışlar hep bu boyutta (Özel boyut)
      const r = r0;
      if (r && !tam0 && r.width > 300 && r.height > 200) { gmBoyut = 'ozel'; try { localStorage.setItem('ko-gm-boyut', 'ozel'); localStorage.setItem('ko-gm-ozel', JSON.stringify([Math.round(r.width), Math.round(r.height)])); } catch {} }
      win.style.setProperty('width', '240px', 'important'); win.style.setProperty('height', '96px', 'important');   // küçültülmüş: can barı boyutunda kompakt kutu
    } else { win.style.removeProperty('width'); win.style.removeProperty('height'); boyutUygula(false); olcekUygula(); }
    if (gb) { gb.title = gmGizli ? 'Paneli göster' : 'Paneli gizle (yalnız başlık kalır)'; }
    if (gmGizli) { state.dunya?.onizle?.(null); hideModel(); }
    try { localStorage.setItem('ko-gm-gizli', gmGizli ? '1' : '0'); } catch {}
  }
  function close() { hideModel(); kartGizle(); deEd?.ayril?.(); state.dunya?.onizle?.(null); state.dunya?.sec?.(null); win?.remove(); win = null; T()?.select(null); }
  function markModel() { win?.querySelectorAll('.gm-model').forEach((d) => { d.classList.toggle('uzerinde', Number(d.dataset.i) === hoverI); d.classList.toggle('secili', TOWER_MODELS[Number(d.dataset.i)].m === curModel()); }); }
  function preview(i) {
    hoverI = i; markModel();
    const x = TOWER_MODELS[i], wr = win.getBoundingClientRect(), it = win.querySelector(`.gm-model[data-i="${i}"]`)?.getBoundingClientRect();
    void wr; const el = win.querySelector(`.gm-model[data-i="${i}"]`); if (el) kartGoster(el, { anahtar: 'kule|' + x.m, bilgiHtml: `<b>${esc(x.n)}</b><i>model ${esc(x.m)}</i>`, yap: () => createNpc(x.m) }); void it;
  }
  async function onClick(ev) {
    if (ev.target.closest('.g2-gomulu')) return;   // gömülü editörün kendi tıklamaları (alt sekmeleri de data-t kullanır)
    const tb = ev.target.closest('[data-t]'); if (tb) { tab = tb.dataset.t; if (tab !== 'dunya') deEd?.ayril?.(); kartGizle(); hideModel(); hoverI = -1; if (tab === 'reklam') reklamYukle(); if (tab === 'gmler') gmYukle(); if (tab === 'meslek') esyaMeta().then(() => render()).catch(() => {}); if (tab === 'meslek') rpc('gm_maden_liste', {}).then((l) => { maden = l; render(); }, () => {}); if (tab === 'baslangic' && !basAyar) rpc('gm_baslangic_ayar', { p_ayar: null }).then((a) => { basAyar = a; render(); }, () => {}); return render(); }   // editörler sekme içindeki düğmeyle açılır
    const mi = ev.target.closest('.gm-model');
    if (mi) { pickModel = TOWER_MODELS[Number(mi.dataset.i)].m; return render(); }
    const ma = ev.target.closest('[data-ma]'); if (ma) { mesAlt = ma.dataset.ma; mesSec = null; mesEkle = null; return render(); }
    const msl = ev.target.closest('[data-ms]'); if (msl) { mesSec = mesSec === Number(msl.dataset.ms) ? null : Number(msl.dataset.ms); mesEkle = null; return render(); }
    const mek = ev.target.closest('[data-mek]'); if (mek) { mesEkle = mesEkle === Number(mek.dataset.mek) ? null : Number(mek.dataset.mek); mesSec = null; return render(); }
    const ga = ev.target.closest('[data-ga]'); if (ga) { gmAlt = ga.dataset.ga; if (gmAlt === 'liste' && !gmVeri) gmYukle(); return render(); }
    const dk = ev.target.closest('[data-dk]'); if (dk) { deKat = dk.dataset.dk; return render(); }
    const dm = ev.target.closest('[data-dm]'); if (dm) { deModel = dm.dataset.dm; deModelAd = dm.dataset.ad || dm.dataset.dm; win.querySelectorAll('.de-model.secili').forEach((x) => x.classList.remove('secili')); dm.classList.add('secili'); onizleGoster(); const cbd = win.querySelector('[name=de-yduvar]'); if (cbd) cbd.checked = deModel === 'duvar'; const b2 = win.querySelector('[data-k=de-yerlestir]'); if (b2) { b2.disabled = deHarita !== zone; b2.textContent = `Yerleştir: ${deModelAd}`; } return; }
    const dob = ev.target.closest('[data-do]'); if (dob) { deSec = Number(dob.dataset.do); state.dunya?.sec?.(deSec); return render(); }
    const rk = ev.target.closest('[data-rk]'); if (rk) { reklamSec = Number(rk.dataset.rk); return render(); }
    const gr = ev.target.closest('[data-gm]'); if (gr) { gmSec = Number(gr.dataset.gm); cikarT = 0; return render(); }
    const row = ev.target.closest('.nk-satir[data-id]');
    if (row) { selId = Number(row.dataset.id); T()?.select(T()?.byId(selId)); return render(); }
    const b = ev.target.closest('button'); const k = b?.dataset.k; if (!k) return;
    if (k === 'irkmeslek') {
      const r = Number(win.querySelector('[name=girk]')?.value), c = Number(win.querySelector('[name=gmes]')?.value);
      try { const d = await rpc('gm_irk_meslek', { p_race: r, p_class: c }); if (!d?.ok) return hud.notice?.(d?.reason || 'Could not change.', 'hata');
        if (state.karakterDegisti) state.karakterDegisti(d); else { hud.info?.('Race / class changed, reloading the game…', 'seviye'); setTimeout(() => location.replace(location.href), 900); } } catch {}
      return;
    }
    if (k === 'town') {
      const u = Number(b.dataset.u), p = here();
      try { const d = await rpc('gm_town_ayarla', { p_ulus: u, p_x: p.x, p_z: p.z }); if (!d?.ok) return hud.notice?.(d?.reason || 'Could not save.', 'hata');
        hud.info?.(`${u === 2 ? 'El Morad' : 'Karus'} town point: ${d.zone} X ${p.x} Z ${p.z}`, 'seviye'); } catch {}
      return;
    }
    const val = (n) => win.querySelector(`[name=${n}]`)?.value;
    try {
      if (k === 'kapat') return close();
      if (k === 'gy-kaydet' || k === 'gy-sec') {
        const y = { ...yardimciAyar(), aktif: !!win.querySelector('[name=gy-aktif]')?.checked, a: (val('gy-ad') || 'MineGuard').trim().slice(0, 24) || 'MineGuard', r: val('gy-renk') || '#ff4040', s: Math.max(10, Math.min(500, Number(val('gy-olcek')) || 100)) };
        yardimciKaydet(y);
        if (k === 'gy-sec') { yardimciSecim = true; tab = 'donusum'; render(); hud.info?.('Pick a mob or NPC from the transformation list and press "Make GM helper".', 'tamam'); return; }
        window.__gmYdAyarla?.(y); hud.info?.(y.aktif ? `GM helper: ${y.a}` : 'GM helper turned off.', 'tamam'); return;
      }
      if (k === 'tam') { gmTam = !gmTam; tamUygula(); return; }
      if (k === 'nav') { navKapali = !navKapali; navUygula(); return; }
      if (k === 'ay-duyur') { const t = (val('ay-duyuru') || '').trim(); if (!t) return hud.notice?.('Enter the announcement text.', 'hata'); await rpc('gm_announce', { p_text: t }); hud.info?.('Announcement sent.', 'tamam'); win.querySelector('[name=ay-duyuru]').value = ''; return; }
      if (k === 'ay-bakim') { const ac = b.dataset.v === '1'; if (ac && performance.now() - silT > 4000) { silT = performance.now(); b.textContent = 'Emin misin? Tekrar bas'; return; } await rpc('gm_bakim', { p_ac: ac }); hud.info?.(ac ? 'Server put into maintenance mode.' : 'Maintenance mode turned off.', 'tamam'); return render(); }
      if (k.startsWith('de-')) return dunyaIslem(k, b);
      if (k.startsWith('rk-')) return reklamIslem(k);
      if (k.startsWith('gm-')) return gmIslem(k, b);
      if (k === 'npc-ac') { (npcw ||= initNpcEditor({ state, player, sb, character, zone, hud, remoteBase: state.npcBase || '' })).open(); return; }
      if (k === 'donusum-ac') { import('./gm-donusum.js').then(({ initGmDonusum }) => { (state.gmDonusum ||= initGmDonusum({ sb, character, hud })).open(); }); return; }
      if (k === 'mob-ac') { (mobw ||= initMobWindow({ state, player, sb, character, zone, hud, say })).open(); return; }
      if (k === 'boyut') {
        const id = Number(b.dataset.id), v = Math.round(Number(val('boy-' + id)) || 100);
        const r = await rpc('gm_boyut', { p_hedef: id, p_yuzde: v });
        const g = boyutlar?.find((x) => x.id === id); if (g) g.boyut = r.boyut;
        state.boyutAyarla?.(id, r.boyut, id === Number(character.id)); state.net?.boyutYay?.(id, r.boyut);
        hud.notice?.(`${g?.ad || 'GM'} size: ${r.boyut}%`); return render();
      }
      if (k === 'mes-kapa') { mesSec = null; mesEkle = null; return render(); }
      if (k === 'mes-kaydet' || k === 'mes-kapat') {
        const id = Number(b.dataset.id), y = k === 'mes-kapat' ? 0 : Number(val('mo-' + id));
        if (!Number.isFinite(y) || y < 0 || y > 100) return hud.notice?.('Chance must be between 0 and 100.', 'hata');
        maden = await rpc('gm_maden_kaydet', { p_id: id, p_kazma: Number(b.dataset.kazma), p_num: Number(b.dataset.num), p_yuzde: y, p_adet: maden?.find((x) => x.id === id)?.adet || 1 }); if (k === 'mes-kapat') mesSec = null;
        const mt = Number(b.dataset.kazma) >= 4 ? 'Fishing' : 'Mining'; hud.info?.(k === 'mes-kapat' ? `${mt}: item removed from the list.` : `${mt}: chance saved as ${y}%.`, 'tamam'); return render();
      }
      if (k === 'mes-ekle') {
        const num = Number(val('mes-num')), y = Number(val('mes-yuzde')), kz = Number(val('mes-kz')), adet = Math.max(1, Number(val('mes-adet')) || 1);
        if (!num) return hud.notice?.('Enter an item number.', 'hata');
        if (!Number.isFinite(y) || y <= 0 || y > 100) return hud.notice?.('Chance must be between 0 and 100.', 'hata');
        maden = await rpc('gm_maden_kaydet', { p_id: null, p_kazma: kz, p_num: num, p_yuzde: y, p_adet: adet }); mesEkle = null;
        hud.info?.(`${kz >= 4 ? 'Fishing' : 'Mining'}: #${num} added (${y}%, ${['Mattock digging', 'Golden Mattock digging', 'Mysterious Ore breaking', 'Mysterious gold mine breaking', 'Fishing Rod', 'Golden Fishing Rod'][kz]}).`, 'tamam'); return render();
      }
      if (k === 'gdmg') { const v = await rpc('gm_set_damage', { p_dmg: Math.round(Number(val('gdmg')) || 0) }); gmDmg = v; hud.notice?.(v ? `GM hit damage: ${v}` : 'GM hit damage back to normal.'); return render(); }
      if (k === 'veri-ac') { (veri ||= initVeriWindow({ sb, character, hud, say, onGive: () => state.inv?.reload(), onEdit: ozelAc })).open(); return; }
      if (k === 'ozel-ac') { ozelAc(null); return; }
      if (k === 'bas-ayar') {
        const ayar = { bas_seviye: String(Math.max(1, Math.min(83, Math.round(Number(val('bseviye')) || 1)))), bas_yetenek: val('byetenek'),
          bas_oto_yetenek: win.querySelector('[name=botoyet]').checked ? '1' : '0', bas_oto_stat: win.querySelector('[name=botostat]').checked ? '1' : '0' };
        basAyar = await rpc('gm_baslangic_ayar', { p_ayar: ayar });
        hud.info?.(`New character settings saved: level ${basAyar.bas_seviye} · skills ${{ kapali: 'off', acik: 'on', usta: 'on + master' }[basAyar.bas_yetenek]} · auto skill ${basAyar.bas_oto_yetenek ? 'on' : 'off'} · auto stat ${basAyar.bas_oto_stat ? 'on' : 'off'}`, 'tamam');
        return render();
      }
      if (k.startsWith('bas-')) { (bas ||= initBaslangic({ sb, character, hud })).ac(Number(k.slice(4))); if (!hud.invOpen) hud.panel?.('envanter'); return; }
      if (k === 'baslangic') { const p = here(); const r = await rpc('gm_set_start', { p_zone: zone, p_x: p.x, p_z: p.z }); start = { x: r.x, z: r.z }; hud.notice?.(`Start point set: X ${r.x} · Z ${r.z}`); say?.(`${zoneName()} start point: X ${r.x} · Z ${r.z}`, 'tamam'); return render(); }
      if (k === 'baslangica-git' && start) { teleport(start.x, start.z); return render(); }
      if (k === 'git') { const x = Number(val('gx')), z = Number(val('gz')); if (Number.isFinite(x) && Number.isFinite(z) && x > 0 && z > 0 && x < state.world && z < state.world) teleport(x, z); else hud.notice?.('Invalid coordinates', 'hata'); return render(); }
      if (k === 'kur') {
        const p = here();
        const r = await rpc('gm_tower_create', { p_zone: zone, p_nation: Number(val('yn')), p_x: p.x, p_z: p.z, p_dir: deg(state.yaw), p_damage: Math.round(Number(val('yh')) || 0), p_range: Number(val('yc')) || 20, p_model: curModel() });
        T()?.apply(r); selId = r.id; T()?.select(T()?.byId(r.id));
        hud.notice?.(`${TOWER_NAME[r.nation]} built (ID ${r.id}).`); say?.(`Tower #${r.id} built: ${TOWER_NAME[r.nation]}, ${r.damage} damage, ${r.range} m range`, 'tamam');
        return render();
      }
      if (k === 'bul') { const id = Number(val('kid')); if (T()?.byId(id)) { selId = id; T()?.select(T()?.byId(id)); } else hud.notice?.(`Tower #${id} is not on this map`, 'hata'); return render(); }
      const sel = selId != null ? T()?.byId(selId) : null; if (!sel) return;
      if (k === 'kaydet') { const r = await rpc('gm_tower_update', { p_id: sel.t.id, p_nation: Number(val('dn')), p_x: null, p_z: null, p_dir: null, p_damage: Math.round(Number(val('dh')) || 0), p_range: Number(val('dc')) || sel.t.range, p_model: null }); T()?.apply(r); hud.notice?.(`Tower #${r.id} saved.`); return render(); }
      if (k === 'tasi') { const p = here(); const r = await rpc('gm_tower_update', { p_id: sel.t.id, p_nation: null, p_x: p.x, p_z: p.z, p_dir: deg(state.yaw), p_damage: null, p_range: null, p_model: null }); T()?.apply(r); hud.notice?.(`Tower #${r.id} moved to your position.`); return render(); }
      if (k === 'kmodel') { const r = await rpc('gm_tower_update', { p_id: sel.t.id, p_nation: null, p_x: null, p_z: null, p_dir: null, p_damage: null, p_range: null, p_model: curModel() }); T()?.apply(r); hud.notice?.(`Tower #${r.id} model: ${modelName(r.model)}`); return render(); }
      if (k === 'kgit') { teleport(sel.t.x + 3, sel.t.z + 3); return render(); }
      if (k === 'ksil') {
        if (performance.now() - silT > 4000) { silT = performance.now(); b.textContent = 'Emin misin? Tekrar bas'; return; }
        await rpc('gm_tower_delete', { p_id: sel.t.id }); T()?.remove(sel.t.id); hud.notice?.(`Tower #${sel.t.id} deleted.`); selId = null; return render();
      }
    } catch { /* hata iletisi rpc'de gösterildi */ }
  }
  // haritaya gittikten sonra (sayfa yenilenir) dünya editörünü yeniden aç
  try { const ac = sessionStorage.getItem('ko-gm-ac'); if (ac) { sessionStorage.removeItem('ko-gm-ac'); let n = 0; const t = setInterval(() => { if (state.ghost || ++n > 40) { clearInterval(t); if (state.ghost) open(ac); } }, 500); } } catch {}
  return {
    open, close, toggle() { if (win) close(); else open(); },
    get isOpen() { return !!win; },
    update() {
      if (!win || performance.now() - liveT < 300) return; liveT = performance.now();
      const c = win.querySelector('.gm-canli'); if (c) { const p = here(); c.textContent = `X ${p.x} · Z ${p.z}`; }
      if (tab === 'dunya' && deModel && deHarita === zone && !gmGizliOnizle) state.dunya?.onizleKonum?.(onu());
    },
    refresh() { if (win && tab === 'kule') render(); },
  };
}
