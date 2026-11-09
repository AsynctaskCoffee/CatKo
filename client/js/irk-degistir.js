// Nation Transfer (KO WIZ_NATION_TRANSFER): çantadaki Nation Transfer kullanılınca onay sorulur → irk_degistir RPC: hesabın bu sunucudaki
// tüm karakterleri öbür ulusa geçer (hepsi klandan çıkmış olmalı; kral / senatör olamaz), Moradon'a ışınlanır, ulus görevleri yeni ulusun
// aynı görevlerine taşınır. Sonra karakter seçimine dönülür (yeni ulusun seçim ekranı); her karakterle ilk girişte ırk / yüz / saç seçilir.
export function initIrkDegistir({ sb, character, hud }) {
  let mesgul = false;
  addEventListener('ko-irk-degistir', (ev) => {
    if (mesgul) return;
    const slot = ev.detail?.slot;
    const hedef = Number(character.nation) === 2 ? 'Karus' : 'El Morad';
    const metin = `ALL characters of your account on this server will transfer to the ${hedef} nation and be teleported to Moradon.\nOn each character's first login you will choose a new race, face and hair. Do you want to continue?`;
    const evet = async () => {
      mesgul = true;
      try {
        const { data, error } = await sb.rpc('irk_degistir', { p_char: character.id, p_slot: slot });
        if (error) return hud.notice?.(error.message, 'hata');
        if (!data?.ok) return (hud.mesaj?.('Nation Transfer', data?.reason || 'The nation transfer failed.') || hud.notice?.(data?.reason || 'The nation transfer failed.', 'hata'));
        hud.info?.(`Nation transferred: ${data.sayi} characters are now ${data.ulus === 2 ? 'El Morad' : 'Karus'}. Returning to character selection…`, 'seviye');
        try { sessionStorage.setItem('ko-secime-don', '1'); } catch {}
        setTimeout(() => (hud.oyundanCik ? hud.oyundanCik('oyun.html') : location.replace('oyun.html')), 1600);
      } finally { setTimeout(() => (mesgul = false), 2000); }
    };
    if (!hud.soru?.('Nation Transfer', metin, evet)) { if (confirm(metin)) evet(); }
  });
}
