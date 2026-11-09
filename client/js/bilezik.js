// KO: her ulusun ilk 3 klanının üyeleri parlayan bilezik takar (sunucu klan_bilezik() → üye kimlikleri; sıralama klan_ilk5 ile aynı:
// Royal > Accredited > Knight, derece, Clan Point fonu, üyelerin ulus puanı). Kendi karakterin ve bölgedeki oyuncular için uygulanır.
export function initBilezik({ sb, state, benId, remotes }) {
  let IDS = new Set();
  const uygula = () => {
    const D = state.donanim; if (!D?.klanBilezik) return;
    if (state.avatar) D.klanBilezik(state.avatar, IDS.has(Number(benId)));
    for (const [id, r] of remotes) { const c = r.obj?.userData?.chr; if (c) D.klanBilezik(c, IDS.has(Number(id)) && !r.gz); }
  };
  async function yukle() {
    const { data, error } = await sb.rpc('klan_bilezik');
    if (error || !Array.isArray(data)) return;
    IDS = new Set(data.map(Number)); uygula();
  }
  yukle(); setInterval(yukle, 10 * 60 * 1000); setInterval(uygula, 2000);
  return { yukle, uygula, var: (id) => IDS.has(Number(id)) };
}
