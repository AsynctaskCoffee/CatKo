// KO Party Board (re_partyboard, orijinal istemci dokuları — assets/ui/partiboard): görev çubuğundaki parti düğmesiyle açılır.
// Parti arayan (Seeking Party) oyuncular listelenir; Register ile kendini kaydedersin (mesaj ≤ 15 harf), Remove Registration ile çıkarsın.
// Kayıtlı oyuncunun isminin üstünde yeşil "Seeking Party : Level a ~ b" yazar (KO). Sunucu: parti_arayan tablosu, parti_ara_* RPC'leri.
const SINIF = { 1: 'Warrior', 2: 'Rogue', 3: 'Mage', 4: 'Priest', 13: 'Kurian', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Necromancer', 11: 'Shaman', 12: 'Dark Priest', 14: 'Shadow Bane', 15: 'Shadow Knight' };
const BOLGE = { moradon: 'Moradon', elmo2004: 'El Morad Castle', karus2004: 'Luferson Castle', battle: 'Ronark Land', ronark: 'Ronark Land', freezone_a: 'Ardream', eslantzone: 'Eslant', delos: 'Delos', elmo_isle: 'El Morad Island', karus_isle: 'Karus Island' };
const KONUM_SECIM = ['All', 'Luferson Castle', 'El Morad Castle', 'Moradon', 'Karus Island', 'El Morad Island', 'Ronark Land', 'Ardream', 'Napaies Gorge', 'Alseids Prairie', 'Niads Corridor', 'Nereids Island', 'Delos'];
const SEVIYE_SECIM = ['All', '1~10', '11~20', '21~30', '31~40', '41~50', '51~60', '61~70', '71~80', '81 and above'];
const PARTI_SECIM = ['All', 'Individual', 'Party'];
const bolgeAd = (z) => BOLGE[String(z || '').toLowerCase()] || String(z || '').replace(/^\w/, (c) => c.toUpperCase());
const temel = (c) => { const k = Number(c) % 100; return k >= 13 ? 13 : k <= 4 ? k : [0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4][k] || k; };
const sinifAd = (c) => SINIF[Number(c) % 100] || SINIF[Math.floor(Number(c) / 100)] || '';

export function initPartiBoard({ sb, character, hud, state }) {
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); return null; } return data; };
  let kurSoz = null, acKilit = false;
  let L = null, liste = [], sayfa = 0, secili = -1, filtre = { parti: 0, konum: 0, seviye: 0 };
  async function kur() {
    const K = await import('./kui.js');
    if (!(await K.ekUI('partiboard').catch(() => false)) || !K.hasLayout('re_partyboard')) return null;
    L = K.buildLayout('re_partyboard', { className: 'ko-partiboard ko-pencere kui-dokulu' });
    L.el.hidden = true; (document.getElementById('kohud') || document.body).append(L.el); K.draggable(L, 44);   // (3.11) gizli kurulur: yer tutucu (beyaz) yazılar görünmez
    L.el.style.pointerEvents = 'auto';
    L.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); import('./ko-pencere.js').then((M) => M.toFront?.(L.el)).catch(() => {}); });
    L.el.addEventListener('contextmenu', (e) => e.preventDefault());
    L.show('btn_enter', false); L.show('btn_promote', false);
    for (const g of ['group_level', 'group_location', 'group_state']) L.show(g, false);
    L.click('btn_close', () => { L.el.hidden = true; });
    // açılır listeler (Party / Location / Level)
    const acilir = (btn, txt, grup, secenek, k) => {
      const ac = () => { for (const g of ['group_level', 'group_location', 'group_state']) if (g !== grup) L.show(g, false); L.show(grup, L.get(grup).hidden); };
      L.click(btn, ac); L.get(txt)?.addEventListener('click', ac); L.get(txt) && (L.get(txt).style.cursor = 'pointer', L.get(txt).style.pointerEvents = 'auto');
      const G = L.get(grup);
      G?.querySelectorAll('[data-id^="img_Choice"]').forEach((el) => {
        const i = Number(el.dataset.id.replace('img_Choice', '')); el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer';
        el.title = secenek[i] || '';
        el.addEventListener('click', (e) => { e.stopPropagation(); filtre[k] = i; L.text(txt, secenek[i] || 'All'); L.show(grup, false); });
      });
      L.text(txt, secenek[0]);
    };
    acilir('btn_state', 'text_state', 'group_state', PARTI_SECIM, 'parti');
    acilir('btn_location', 'text_location', 'group_location', KONUM_SECIM, 'konum');
    acilir('btn_level', 'text_level', 'group_level', SEVIYE_SECIM, 'seviye');
    L.click('btn_search', () => { sayfa = 0; ciz(); });
    L.click('btn_refresh', () => yukle());
    L.click('btn_page_down', () => { if (sayfa > 0) { sayfa--; ciz(); } });
    L.click('btn_page_up', () => { if ((sayfa + 1) * 12 < suzulmus().length) { sayfa++; ciz(); } });
    for (let i = 0; i < 12; i++) L.click('btn_' + String(i).padStart(2, '0'), () => { secili = sayfa * 12 + i; ciz(); });
    const sec = () => suzulmus()[secili];
    L.click('btn_whisper', () => { const x = sec(); if (!x) return hud.notice?.('Select a player from the list.', 'hata'); if (x.ben) return; hud.ozelMesajAc?.(x.id, x.ad); });
    L.click('btn_party', () => { const x = sec(); if (!x) return hud.notice?.('Select a player from the list.', 'hata'); if (x.ben) return; state.parti?.davetEt(x.id, x.ad); });
    L.click('btn_autosearch', () => hud.notice?.('Auto Enter: the party system is not available yet.', 'hata'));
    L.click('btn_add', () => kayitSor());
    L.click('btn_adjust', () => kayitSor());
    L.click('btn_delete', async () => { const d = await rpc('parti_ara_sil'); if (d) { hud.info?.('Your party registration has been removed.', 'soluk'); benim = null; etiketYenile(); yukle(); } });
    ciz();   // yer tutucu satır yazılarını ("Text") temizle
    return L;
  }
  const suzulmus = () => liste.filter((x) => {
    if (filtre.parti === 2) return false;   // parti kaydı (parti sistemi yok) — yalnız bireysel
    if (filtre.konum && bolgeAd(x.zone) !== KONUM_SECIM[filtre.konum]) return false;
    if (filtre.seviye) { const a = (filtre.seviye - 1) * 10 + 1, b = filtre.seviye === 9 ? 999 : a + 9; if (x.sv < a || x.sv > b) return false; }
    return true;
  });
  function ciz() {
    if (!L) return;
    const S = suzulmus(), top = Math.max(1, Math.ceil(S.length / 12)); sayfa = Math.min(sayfa, top - 1);
    for (let i = 0; i < 12; i++) {
      const x = S[sayfa * 12 + i], t = (k) => 'text_' + String(k * 12 + i).padStart(2, '0');
      L.text(t(0), x ? String(sayfa * 12 + i + 1) : ''); L.text(t(1), x ? 'Individual' : ''); L.text(t(2), x ? x.mesaj : '');
      L.text(t(3), x ? x.ad : ''); { const e = L.get(t(4)); if (e) e.innerHTML = x ? `<i class="pb-sinif pt-s${temel(x.sinif)} pt-u${Number(x.ulus) || 1}" title="${sinifAd(x.sinif)}"></i>` : ''; } L.text(t(5), x ? bolgeAd(x.zone) : '');
      L.text(t(6), x ? `${x.min} ~ ${x.max}` : ''); L.text(t(7), x ? '-' : '');
      const b = L.get('btn_' + String(i).padStart(2, '0')); if (b) { b.hidden = !x; b.classList.toggle('pb-secili', !!x && secili === sayfa * 12 + i); }
      // KO: seviyesi aralığa uyanlar yeşil, uymayanlar beyaz
      const uygun = x && Number(state.combat?.stats?.level ?? character.level) >= x.min && Number(state.combat?.stats?.level ?? character.level) <= x.max;
      for (let k = 0; k < 8; k++) L.get(t(k))?.classList.toggle('pb-uygun', !!uygun);
    }
    L.text('string_page', String(sayfa + 1));
  }
  async function yukle() { const d = await rpc('parti_ara_liste'); liste = Array.isArray(d) ? d : []; secili = -1; ciz(); }
  // Register Party (re_partyboard_message_2): mesaj 1–15 harf
  let benim = null, M = null;
  async function kayitSor() {
    const K = await import('./kui.js');
    if (!(await K.ekUI('partiboard').catch(() => false))) return;
    if (!M) {
      M = K.buildLayout('re_partyboard_message_2', { className: 'ko-partiboard-msg ko-pencere kui-dokulu' });
      (document.getElementById('kohud') || document.body).append(M.el); K.draggable(M, 36);
      M.el.style.pointerEvents = 'auto'; M.el.addEventListener('pointerdown', (e) => e.stopPropagation());
      M.inp = M.input('edit_message', { maxLength: 15 });
      M.inp?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') M.tamam(); if (e.key === 'Escape') M.el.hidden = true; });
      M.tamam = async () => {
        const v = String(M.inp?.value || '').trim(); if (v.length < 1 || v.length > 15) return hud.notice?.('The message must be between 1 and 15 letters long.', 'hata');
        const d = await rpc('parti_ara_kaydet', { p_mesaj: v }); if (!d?.ok) { if (d?.mesaj) hud.notice?.(d.mesaj, 'hata'); return; }
        M.el.hidden = true; benim = d; hud.info?.(`Registered on the Party Board: ${d.mesaj} (Level ${d.min} ~ ${d.max})`, 'soluk'); etiketYenile(); yukle();
      };
      M.click('btn_ok', () => M.tamam()); M.click('btn_cencel', () => { M.el.hidden = true; });
    }
    M.el.hidden = false; M.el.style.zIndex = 5300;
    M.el.style.left = Math.max(8, innerWidth / 2 - 164) + 'px'; M.el.style.top = Math.max(8, innerHeight / 2 - 103) + 'px';
    if (M.inp) { M.inp.value = benim?.mesaj || 'Seeking_Party'; setTimeout(() => { M.inp.focus(); M.inp.select(); }, 0); }
  }
  // isim üstü yazı: "Seeking Party : Level a ~ b" (yeşil, kalın) — bölgedeki tüm kayıtlılar
  const etiketli = new Map();   // id → öğe
  async function etiketYenile() {
    const d = await rpc('parti_ara_etiket'); if (!Array.isArray(d)) return;
    const yeni = new Map(d.map(([id, a, b]) => [String(id), `Seeking Party : Level ${a} ~ ${b}`]));
    for (const [id, el] of etiketli) if (!yeni.has(id) || !el.isConnected) { el.remove(); etiketli.delete(id); const k = state.isimEl?.(id); if (k) k._h = null; }
    for (const [id, metin] of yeni) {
      const kok = state.isimEl?.(id); if (!kok) continue;
      let el = etiketli.get(id);
      if (!el || !el.isConnected || el.parentElement !== kok) { el?.remove(); el = document.createElement('div'); el.className = 'parti-ara-yazi'; kok.prepend(el); etiketli.set(id, el); kok._h = null; }
      if (el.textContent !== metin) { el.textContent = metin; kok._h = null; }
    }
  }
  // (3.11) oyundan çıkınca Seeking Party kapanır: girişte eski kayıt kaldırılır; oyundayken 30 sn'de bir nabız (sunucu 75 sn
  // nabız gelmeyen kaydı listede / isim üstünde göstermez); sekme kapanırken de kaldırılır
  benim = null;
  rpc('parti_ara_sil').then(() => etiketYenile());
  setInterval(etiketYenile, 15000);
  // (3.11) partiye girince Seeking Party kapanır (sunucu tetikleyicisi kaydı kapatır; burada durum + isim üstü yazı tazelenir)
  addEventListener('ko-parti', (e) => { if (e.detail?.parti) { benim = null; etiketYenile(); if (L && !L.el.hidden) yukle(); } else etiketYenile(); });
  setInterval(() => { if (benim) sb.rpc('parti_ara_nabiz', { p_char: character.id }).then(() => {}, () => {}); }, 30000);
  addEventListener('pagehide', () => { if (benim) { try { sb.rpc('parti_ara_sil', { p_char: character.id }); } catch {} } });
  return {
    async ac(goster = false) {   // goster: açıksa kapatma (yalnız aç)
      const yeni = !L;
      if (!L) await (kurSoz ||= kur().finally(() => { if (!L) kurSoz = null; }));   // (3.11) art arda tıklama tek pencere kurar
      if (!L) { hud.notice?.('Could not load the Party Board.', 'hata'); return false; }
      if (yeni && acKilit) return true; acKilit = yeni;   // kurulum sırasında gelen diğer tıklamalar yok sayılır
      const goster2 = yeni || goster ? true : L.el.hidden;
      if (yeni) setTimeout(() => (acKilit = false), 0);
      if (!goster2) { L.el.hidden = true; return true; }
      if (L.el.hidden) {   // (3.11) liste hazır olunca tek seferde görünür (önce boş / yer tutucu yazılı pencere çıkmaz)
        await yukle().catch(() => {});
        L.el.style.left = Math.max(8, innerWidth / 2 - 390) + 'px'; L.el.style.top = Math.max(8, (innerHeight - 568) / 2) + 'px'; L.el.style.zIndex = 5200;
        L.el.hidden = false;
      } else yukle();
      return true;
    },
    kaydet: () => kayitSor(),
    /** KO /seeking_party: kayıtlıysa kaldırır, değilse varsayılan mesajla ("Seeking_Party") kaydeder */
    async ac_kapa() {
      if (benim) { if (await rpc('parti_ara_sil')) { benim = null; etiketYenile(); hud.info?.('You are no longer seeking a party.', 'soluk'); } return; }
      const d = await rpc('parti_ara_kaydet', { p_mesaj: 'Seeking_Party' }); if (!d?.ok) { if (d?.mesaj) hud.notice?.(d.mesaj, 'hata'); return; }
      benim = d; etiketYenile(); hud.info?.(`Seeking Party : Level ${d.min} ~ ${d.max}`, 'soluk');
    },
    sil: async () => { if (await rpc('parti_ara_sil')) { benim = null; etiketYenile(); } },
    etiketYenile,
  };
}
