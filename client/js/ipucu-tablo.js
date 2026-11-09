// KO Tiptable_us.tbl (orijinal istemci): seviyeye göre oyuncuya sohbette sarı yardım mesajları ("To open your inventory, press [I]." …).
// Satır: [id, başlık, metin ('|' = yeni satır), en düşük seviye, en yüksek seviye, zaman (o seviyede geçen oyun süresi, 0,1 sn)].
// Görev koşullu ipuçları (Tiptable sütun 7 ≠ -1) dahil edilmedi. Her ipucu karakter başına bir kez (tarayıcıda saklanır).
export async function initIpucuTablo({ say, seviye, charId }) {
  let T = [];
  try { T = await (await fetch(new URL('../assets/ipucu/tiptable.json', import.meta.url))).json(); } catch { return null; }
  const KEY = 'ko-tip-' + charId;
  let D = { lv: 0, t: 0, g: [] }; try { D = { ...D, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
  const goruldu = new Set(D.g || []);
  const kaydet = () => { try { localStorage.setItem(KEY, JSON.stringify({ lv: D.lv, t: D.t, g: [...goruldu] })); } catch {} };
  let son = 0;
  const tik = () => {
    const lv = Number(seviye()) || 0; if (!lv) return;
    if (lv !== D.lv) { D.lv = lv; D.t = 0; }
    D.t += 10;
    // aynı anda birden çok ipucu gelirse araya 3 sn konur (KO gibi tek tek)
    if (performance.now() - son > 3000) {
      const x = T.find((r) => lv >= r[3] && lv <= r[4] && D.t >= r[5] && !goruldu.has(r[0]));
      if (x) {
        goruldu.add(x[0]); son = performance.now();
        say(x[1]); for (const s of String(x[2]).split('|')) if (s.trim()) say(s.trim());
      }
    }
    if (D.t % 100 === 0) kaydet();
  };
  const z = setInterval(tik, 1000);
  addEventListener('beforeunload', kaydet);
  return { durdur: () => { clearInterval(z); kaydet(); } };
}
