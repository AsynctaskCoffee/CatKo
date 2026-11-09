// KO dinlenme (oturma): görev çubuğundaki otur/kalk düğmesi (re_taskbar_main btn_00 ayakta / btn_01 oturuyor).
// Animasyon: SitDown (11) → SitDown_Breath (12) → StandUp (13); kanat takılıysa uçarak oturma wing_S (145) → wing_B (146) → wing_E (147).
// KO dinlenme (kobugda.com/resting · deadsoft): otururken ~14,5 sn'de bir seviyeye göre sabit EXP + can/mana (sunucu dinlen_tick);
// her 2 saat dinlenmede +20 dk Spirit of Genie (en çok 60 dk; yeniden girişte satın alınmış Genie yoksa silinir). Hareket / saldırı / yetenek isteğinde "Dinlenme modundan çıkmak istiyor musunuz?" sorulur.
// Hasar alınca KO gibi kendiliğinden kalkar.
export function initDinlen({ sb, character, hud, state }) {
  const av = () => state.avatar;
  // kanat takılıysa uçarak oturur (wing_S/B/E); kanat yoksa yere oturur (SitDown) — pelerin etkilemez
  const kanatli = () => !!av()?.plugObj?.('kanatModel');
  let tik = 0, zaman = 0;
  // KO dinlenme penceresi (re_training): oturumdaki toplam dinlenme süresi (sunucu), bu oturuştaki EXP, tamamlanan 2 saatlik tur (+20 dk Genie)
  let bas = 0, toplam = 0, saat = 0, sunucuSure = 0, sunucuAn = 0;
  const gecen = () => sunucuSure + (sunucuAn ? (Date.now() - sunucuAn) / 1000 : (Date.now() - bas) / 1000);
  const pencere = () => hud.egitim?.(state.otur ? { sure: gecen(), exp: toplam, kez: Math.floor(gecen() / 7200) } : null);
  const klip = (asama) => {
    const k = state.otur?.kanat;
    return asama === 'iniyor' ? (k ? 'wing_s' : 'sit') : asama === 'oturuyor' ? (k ? 'wing_b' : 'sit_breath') : (k ? 'wing_e' : 'stand');
  };
  const sure = (c) => Math.max(0.2, av()?.sure?.(c) || 0.8) * 1000;
  function dugmeler() {
    const otur = !!state.otur && state.otur.asama !== 'kalkiyor';
    hud.oturDugme?.(otur);
  }
  function otur() {
    if (state.otur || state.combat?.stats?.dead || state.frozen) return;
    if (!av()?.has?.('sit')) return;
    state.target = null; state.combat?.cancel?.(); state.combat?.cancelAttack?.();
    const kanat = kanatli() && av().has('wing_s');
    state.otur = { asama: 'iniyor', kanat };
    clearTimeout(zaman); zaman = setTimeout(() => { if (state.otur?.asama === 'iniyor') state.otur.asama = 'oturuyor'; }, sure(klip('iniyor')));
    hud.info?.('Resting started.', 'exp');
    bas = Date.now(); toplam = 0; sunucuAn = 0; clearInterval(saat); saat = setInterval(pencere, 1000); pencere();
    dugmeler();
    clearInterval(tik); tik = setInterval(tick, 14500);   // KO: dinlenme tiki ~14,5 sn
  }
  function kalk(zorla = false) {
    if (!state.otur || state.otur.asama === 'kalkiyor') return;
    clearInterval(tik); clearTimeout(zaman); clearInterval(saat); hud.egitim?.(null);
    if (zorla) { state.otur = null; dugmeler(); return; }
    state.otur.asama = 'kalkiyor';
    zaman = setTimeout(() => { state.otur = null; dugmeler(); }, sure(klip('kalkiyor')));
    dugmeler();
  }
  /** hareket / saldırı isteği. KO re_training "Move immediately." işaretliyse kalkış animasyonu olmadan hemen kalkar ve
   *  istek sürer (false); işaretli değilse kalkış animasyonu oynar, istek o an engellenir (true). */
  function engelle() {
    if (!state.otur) return false;
    if (hud.egitimTasi?.()) { kalk(true); return false; }
    if (state.otur.asama !== 'kalkiyor') kalk();
    return true;
  }
  async function tick() {
    if (state.otur?.asama !== 'oturuyor') return;
    const { data: d, error } = await sb.rpc('dinlen_tick', { p_char: character.id });
    if (error || !d?.ok) return;
    state.combat?.odulUygula?.(d);
    if (d.sure != null) { sunucuSure = Number(d.sure); sunucuAn = Date.now(); }
    if (d.kazanc > 0) { toplam += Number(d.kazanc); hud.info?.(`Resting: earned ${Number(d.kazanc).toLocaleString('en-US')} Experience Points.`, 'exp'); }
    if (d.genie_bonus > 0) {
      hud.notice?.(`You rested for 2 hours: earned ${d.genie_bonus} minutes of Spirit of Genie! (resting Genie: ${d.genie_dinlenme} / 60 min)`, 'exp');
      window.dispatchEvent(new CustomEvent('ko-genie-sure', { detail: { kalan: d.genie_kalan } }));
    }
    pencere();
  }
  function toggle() { if (state.otur) engelle(); else otur(); }
  /** ana döngü: animasyon adı (null → normal) */
  const klipAdi = () => (state.otur ? klip(state.otur.asama) : null);
  hud.oturBagla?.(toggle);
  dugmeler();
  return { otur, kalk, toggle, engelle, klipAdi, get aktif() { return !!state.otur; } };
}
