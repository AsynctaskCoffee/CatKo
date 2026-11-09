// (3.11) KO Duel: oyuncuya sağ tık → Duel. Karşı tarafta KO re_messagebox (başlık: isteyenin adı, Block düğmesi,
// "<ad> has challenged you into a battle. Press OK and you'll be automatically be teleported to the battlefield.", 30 sn süre çubuğu, Confirm / Cancel).
// Kabul edilince iki oyuncu da Moradon arenasına (kuzey bölme) ışınlanır. Sunucu: duello_iste / duello_cevap, tablo duello (Realtime).
const ISTEK_SN = 30000;

export function initDuello({ sb, character, hud, state }) {
  const me = Number(character.id);
  let KUTU = null;
  const isinla = () => {
    hud.notice?.('Teleporting to the battlefield…', 'seviye');
    state.net?.halt?.();
    const u = new URL(location.href); for (const k of ['x', 'z', 'bolge']) u.searchParams.delete(k); u.searchParams.set('karakter', me);
    setTimeout(() => location.replace(u.toString()), 900);
  };
  async function kutu(row) {
    const K = await import('./kui.js');
    if (!K.hasLayout('re_messagebox')) return false;
    KUTU?.kapat?.();
    const ad = row.a_ad || 'Player';
    const L = K.buildLayout('re_messagebox', { className: 'ko-parti-davet ko-duello-istek ko-pencere kui-dokulu' });
    for (const id of ['Btn_Ok', 'Btn_Cancel', 'Edit_Common', 'base_item', 'img_icon', 'str_crash_tooltip', 'str_itemname']) L.show(id, false);
    L.show('Btn_ban', true); L.show('progress_durationtime', true); L.show('Btn_Yes', true); L.show('Btn_No', true);
    L.text('Text_title', ad);
    L.text('Text_Message', `${ad} has challenged you into a battle. Press OK and you'll be automatically be teleported to the battlefield.`);
    const yaz = (id, t) => L.get(id)?.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = t));
    yaz('Btn_Yes', 'Confirm'); yaz('Btn_No', 'Cancel'); yaz('Btn_ban', 'Block');
    (document.getElementById('kohud') || document.body).append(L.el);
    L.el.style.pointerEvents = 'auto'; L.el.style.zIndex = 9000;
    L.el.style.left = Math.max(8, innerWidth / 2 - (L.el.offsetWidth || 360) / 2) + 'px'; L.el.style.top = Math.max(8, innerHeight * 0.3) + 'px';
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    let bitti = false; const t0 = Date.parse(row.created_at) || Date.now();
    const kapat = () => { if (bitti) return; bitti = true; L.el.remove(); if (KUTU?.L === L) KUTU = null; };
    KUTU = { L, kapat, id: Number(row.id) };
    const tik = () => { if (bitti) return; const k = 1 - (Date.now() - t0) / ISTEK_SN; L.progress('progress_durationtime', Math.max(0, k)); if (k <= 0) { cevap(row.id, false); return kapat(); } requestAnimationFrame(tik); };
    requestAnimationFrame(tik);
    L.click('Btn_Yes', async () => { if (bitti) return; kapat(); const d = await cevap(row.id, true); if (d?.ok && d.kabul) isinla(); else if (d && !d.ok) hud.notice?.(d.reason, 'hata'); });
    L.click('Btn_No', () => { if (bitti) return; kapat(); cevap(row.id, false); });
    L.click('Btn_ban', () => { if (bitti) return; kapat(); state.duelloEngel = true; hud.info?.('Duel requests are now blocked.', 'soluk'); cevap(row.id, false); });
    return true;
  }
  async function cevap(id, kabul) {
    const { data, error } = await sb.rpc('duello_cevap', { p_char: me, p_id: Number(id), p_kabul: !!kabul });
    if (error) { hud.notice?.(error.message, 'hata'); return null; }
    return data;
  }
  const soruldu = new Set();
  function isle(row) {
    if (!row) return;
    if (Number(row.b) === me) {
      if (row.durum === 'istek' && !soruldu.has(Number(row.id))) {
        soruldu.add(Number(row.id));
        if (state.duelloEngel) { cevap(row.id, false); return; }
        if (Date.now() - (Date.parse(row.created_at) || Date.now()) > ISTEK_SN) return;
        kutu(row).then((ok) => { if (!ok) hud.soru?.('Duel', `${row.a_ad} has challenged you into a battle. Press OK and you'll be automatically be teleported to the battlefield.`, async () => { const d = await cevap(row.id, true); if (d?.kabul) isinla(); }, () => cevap(row.id, false), { kompakt: true }); });
      } else if (row.durum !== 'istek' && KUTU?.id === Number(row.id)) KUTU.kapat();
      return;
    }
    if (Number(row.a) === me) {
      if (row.durum === 'kabul') { hud.info?.('Your duel request has been accepted.', 'seviye'); isinla(); }
      else if (row.durum === 'red') hud.info?.('The user has declined the duel.', 'hata');
    }
  }
  for (const k of ['a', 'b']) sb.channel(`duello-${k}-${me}`).on('postgres_changes', { event: '*', schema: 'public', table: 'duello', filter: `${k}=eq.${me}` }, (p) => isle(p.new)).subscribe();
  return {
    async iste(hedef, ad) {
      const { data, error } = await sb.rpc('duello_iste', { p_char: me, p_hedef: Number(hedef) });
      if (error) return hud.notice?.(error.message, 'hata');
      if (!data?.ok) return hud.notice?.(data?.reason || 'The duel request failed.', 'hata');
      hud.info?.(`You have challenged ${ad || 'the player'} to a duel.`, 'seviye');
    },
  };
}
