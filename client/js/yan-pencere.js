// Ekran kenarına yaslı (soldan / sağdan kayarak gelen) pencereler: aynı kenarda yeni bir pencere açılınca o kenarda açık duran
// önceki pencere kapanır — üst üste binmezler. Yan yana durmak için tasarlanmış çiftler (envanter + K beceri penceresi) birbirini kapatmaz.
const KAYIT = { sol: new Map(), sag: new Map() };   // el → { kapat, grup }
const acikMi = (el) => el?.isConnected && !el.hidden && getComputedStyle(el).display !== 'none';
/** el: açılan pencere; yan: 'sol' | 'sag'; kapat: bu pencereyi kapatan fonksiyon; grup: aynı gruptakiler birbirini kapatmaz */
export function yanAcildi(el, yan, kapat, grup = null) {
  const K = KAYIT[yan]; if (!K || !el) return;
  for (const y of ['sol', 'sag']) if (y !== yan) KAYIT[y].delete(el);
  K.set(el, { kapat, grup });
  for (const [e, v] of [...K]) {
    if (e === el) continue;
    if (!e.isConnected) { K.delete(e); continue; }
    if (grup && v.grup === grup) continue;
    if (acikMi(e)) { try { v.kapat(); } catch {} }
  }
}
