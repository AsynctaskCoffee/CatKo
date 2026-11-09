// KO görünmezlik (MAGIC_TYPE9): Stealth (durum 2, 80 sn) / Hide (durum 1, 40 sn, hareket edince biter) ve
// görme yetenekleri Cat's Eyes (3) / Lupine Eyes (4, 50 sn).
//  - görünmez oyuncu kendini %70 saydam görür; rakipler hiç göremez (model, isim, efekt yok, Z/tık ile seçilemez)
//  - Cat's/Lupine Eyes etkinken görünmez oyuncular %70 saydam görünür ve seçilebilir
//  - hasar yeteneği, R saldırısı, iyileştirme ve iksir/eşya kullanımı görünmezliği kaldırır; Light Feet gibi güçlendirmeler kaldırmaz
// Diğer oyunculara: presence 'gz' (sonradan gelenler için) + anlık 'fx' {k:'gz'} yayını (net.js gorunmez()).
import * as THREE from '../vendor/three.module.min.js';

const SAYDAM = 0.3;   // %70 saydam
const DURUM_ID = { 645: 2, 700: 1, 715: 3, 735: 4 };
export const durumOf = (skillId, d) => Number(d) || DURUM_ID[Number(skillId) % 1000] || 0;

/** nesnenin (karakter) malzemelerini saydam yap / geri al. Malzemeler paylaşımlı olabileceği için mesh başına kopyalanır.
 *  Zırhın altındaki çıplak gövde parçaları saydam zırhın içinden görünmesin diye her ağın yalnız derinlik yazan bir ikizi
 *  (renk yazmaz, opak geçişte çizilir) eklenir: saydam geçişte yalnız en öndeki yüzey (zırh) çizilir — KO'daki gibi tek kat hayalet. */
export function saydamYap(obj, a) {
  if (!obj) return;
  const liste = [];
  obj.traverse((m) => { if (m.isMesh && m.material && !m.userData.ikiz) liste.push(m); });
  for (const m of liste) {
    if (a < 1) {
      if (!m.userData._ozMat) {
        const o = m.material; if (!Array.isArray(o) && (o.blending === THREE.AdditiveBlending || m.userData.fx || o.transparent && !o.map)) continue;   // efekt/parlama ağları
        m.userData._ozMat = o;
        m.material = Array.isArray(o) ? o.map((x) => x.clone()) : o.clone();
        for (const x of [].concat(m.material)) { x.transparent = true; x.depthWrite = false; x.depthFunc = THREE.LessEqualDepth; x.alphaToCoverage = false; x.userData._opa = x.opacity; x.userData._at = x.alphaTest || 0; }
        // derinlik ikizi (aynı geometri / iskelet; ağın çocuğu → aynı dünya matrisi)
        const ilk = [].concat(o)[0];
        // saydam listede (opaklardan sonra) çizilir: önce ikizler derinlik yazar (renderOrder 1), sonra saydam renk geçişi (renderOrder 2)
        const dm = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true, map: ilk.alphaTest ? ilk.map : null, alphaTest: ilk.alphaTest || 0 });
        const ik = m.isSkinnedMesh ? new THREE.SkinnedMesh(m.geometry, dm) : new THREE.Mesh(m.geometry, dm);
        if (m.isSkinnedMesh) { ik.bindMode = m.bindMode; ik.bind(m.skeleton, m.bindMatrix); }
        ik.userData.ikiz = true; ik.frustumCulled = false; ik.renderOrder = 1; ik.matrixAutoUpdate = true;
        m.userData._ro = m.renderOrder; m.renderOrder = 2;
        m.add(ik); m.userData._ikiz = ik;
      }
      // alphaTest saydamlıkla ölçeklenir: yoksa (alfa × 0,3) < 0,5 olan kesik dokulu parçalar (pantolon, etek…) tümden kaybolur
      for (const x of [].concat(m.material)) { x.opacity = (x.userData._opa ?? 1) * a; x.alphaTest = (x.userData._at || 0) * a; }
    } else if (m.userData._ozMat) {
      for (const x of [].concat(m.material)) x.dispose();
      m.material = m.userData._ozMat; delete m.userData._ozMat;
      const ik = m.userData._ikiz; if (ik) { ik.removeFromParent(); ik.material.dispose(); delete m.userData._ikiz; }
      if (m.userData._ro != null) { m.renderOrder = m.userData._ro; delete m.userData._ro; }
    }
  }
}

export function initGorunmez({ state, player, hud, character = null }) {
  let ben = null;          // { durum, bit, x, z }
  let gorBit = 0, gorId = 0;   // Cat's/Lupine Eyes bitişi ve hangi yetenek
  let saydamT = 0, benSaydam = false;
  let korumaBit = 0;   // KO giriş koruması (5 sn): hafif saydam, hasar yemez (sunucu koruma_bitis)
  // KO: koruma süresince karakter yanıp söner (0,25 sn'de bir saydam ↔ neredeyse opak)
  const korumaAlfa = () => (Math.floor(performance.now() / 250) % 2 ? 0.3 : 0.85);
  const korumada = () => performance.now() < korumaBit;
  /** kendi giriş korumam başladı (sure sn) — diğer oyunculara da yayınlanır */
  let korumaYayin = 0;
  function koruma(sure) { korumaBit = performance.now() + sure * 1000; korumaYayin = performance.now(); net()?.fx?.({ k: 'koruma', s: sure }); }
  /** saldırınca koruma biter (sunucu da kaldırır) */
  function korumaBitir() { if (!korumada()) return; korumaBit = 0; net()?.fx?.({ k: 'koruma', s: 0 }); hud.info?.('You broke your spawn protection by attacking.', 'beceri'); }
  /** uzak oyuncunun giriş koruması */
  function uzakKoruma(r, sure) { r.korumaBit = Number(sure) > 0 ? performance.now() + Number(sure) * 1000 : 0; }
  const net = () => state.net;
  const yayin = (v, sure = 0) => { net()?.gorunmez?.(v, sure); };

  function etkin(skillId, durum, sure, ad, anahtar = null) {
    durum = durumOf(skillId, durum);
    if (durum === 1 || durum === 2) {
      ben = { durum, bit: performance.now() + sure * 1000, x: player.position.x, z: player.position.z, anahtar };
      yayin(true, sure);
      hud.info?.(`${ad || 'Invisibility'}: enemies cannot see you (${sure} sec).`, 'beceri');
    } else if (durum === 3 || durum === 4) {
      gorBit = performance.now() + sure * 1000; gorId = Number(skillId) || 0;
      hud.info?.(`${ad || 'Detection'}: you can see invisible enemies (${sure} sec).`, 'beceri');
    }
  }
  function boz(sebep) {
    if (!ben) return;
    const k = ben.anahtar; ben = null; yayin(false);
    if (k) dispatchEvent(new CustomEvent('ko-etki-kaldir', { detail: k }));   // sol üstteki etki simgesi de kalksın
    hud.info?.(sebep ? `Your invisibility has ended (${sebep}).` : 'Your invisibility has ended.', 'beceri');
  }
  const gorurum = () => performance.now() < gorBit;
  /** uzak oyuncu: 1 = normal, SAYDAM = görünmez ama görüyorum, 0 = göremiyorum */
  function uzakAlfa(r) {
    if (!r.gz) return r.korumaBit && performance.now() < r.korumaBit ? korumaAlfa() : 1;
    if (r.gzBit && performance.now() > r.gzBit) { r.gz = false; return 1; }   // bitiş yayını kaçtıysa
    // KO: kendi ulusum (ve partim) görünmez oyuncuyu saydam görür; rakip ulus yalnız Cat's / Lupine Eyes ile
    if (gorurum() || (r.meta?.nation != null && Number(r.meta.nation) === Number(character?.nation))) return SAYDAM;
    return 0;
  }
  /** net: uzak oyuncunun görünmezliği değişti */
  function uzakAyarla(r, v, sure) {
    r.gz = !!v; r.gzBit = v ? performance.now() + (Number(sure) || 90) * 1000 + 2000 : 0;
    if (!v) { saydamYap(r.obj, 1); r._alfa = 1; }
  }
  function update(dt) {
    if (ben) {
      if (performance.now() > ben.bit) { ben = null; yayin(false); hud.info?.('Invisibility has expired.', 'beceri'); }
      else if (ben.durum === 1 && Math.hypot(player.position.x - ben.x, player.position.z - ben.z) > 0.4) boz('hareket ettin');   // Hide: kıpırdamadan
      else if (state.combat?.dead) boz();
    }
    // kendi saydamlığım (kuşanılan eşya değişince yeni ağlar da saydam olsun: 0.5 sn'de bir yeniden uygulanır)
    saydamT += dt;
    // koruma sürerken saniyede bir yeniden yayın: kanala geç katılan / beni henüz tanımayan oyuncular da yanıp sönmeyi görsün
    if (korumada() && performance.now() - korumaYayin > 1000) { korumaYayin = performance.now(); net()?.fx?.({ k: 'koruma', s: Math.max(0.2, (korumaBit - performance.now()) / 1000) }); }
    const benA = ben ? SAYDAM : korumada() ? korumaAlfa() : 1;
    if (benA !== benSaydam || (benA < 1 && saydamT > 0.5)) { saydamT = 0; benSaydam = benA; saydamYap(player, benA); }
  }
  /** her karede uzak oyuncu için: görünürlük ve saydamlık. Dönüş: false = çizilmesin */
  function uzakGuncelle(r) {
    const a = uzakAlfa(r);
    if (a === 0) return false;
    if (a !== r._alfa || (a < 1 && (r._alfaT = (r._alfaT || 0) + 1) % 30 === 0)) { r._alfa = a; saydamYap(r.obj, a); }
    return true;
  }
  return { etkin, boz, gorurum, koruma, korumaBitir, uzakKoruma, korumada, gozYetenegi: () => (performance.now() < gorBit ? gorId : 0), gozBitir: () => { gorBit = 0; gorId = 0; }, uzakGuncelle, uzakAyarla, update, get aktif() { return !!ben; }, get durum() { return ben?.durum || 0; }, get anahtar() { return ben?.anahtar || null; }, kalan: () => (ben ? Math.max(0, (ben.bit - performance.now()) / 1000) : 0) };
}
