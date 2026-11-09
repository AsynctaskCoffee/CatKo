// KO parti sistemi: davet (re_messagebox — Block düğmesi + süre çubuğu), parti penceresi (re_party), Party War Board (re_damagemeter_party).
// Sunucu: parti / parti_uye / parti_davet tabloları; parti_davet_et, parti_cevap, parti_bilgi, parti_ayril, parti_at RPC'leri.
// Parti sohbeti ve hasar payı: partiye özel realtime yayın kanalı (parti-<id>).
const DAVET_SN = 10;   // KO: davet kutusu süre çubuğu (sn)
const SINIF = { 1: 'Warrior', 2: 'Rogue', 3: 'Magician', 4: 'Priest', 5: 'Berserker', 6: 'Guardian', 7: 'Hunter', 8: 'Penetrator', 9: 'Sorcerer', 10: 'Enchanter', 11: 'Shaman', 12: 'Dark Priest', 13: 'Kurian', 14: 'Shadow Bane', 15: 'Shadow Knight' };
const temelSinif = (c) => { const k = Number(c) % 100; return k >= 13 ? 13 : k <= 4 ? k : [0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4][k] || k; };

export function initParti({ sb, character, hud, state, say }) {
  const me = Number(character.id);
  try { if (localStorage.getItem('ko-parti-engel') === '1') state.partiEngel = true; } catch {}   // /Block_Party kalıcı
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, { p_char: me, ...args }); if (error) { hud.notice?.(error.message, 'hata'); return null; } if (data && data.ok === false) { hud.notice?.(data.reason || 'Failed.', 'hata'); return null; } return data; };
  let P = null;            // parti_bilgi sonucu
  let ayrildim = false;
  let kanal = null, kanalId = null;
  const hasar = new Map();   // üye id → toplam hasar (Party War Board)

  // ---------- davet gönder
  async function davetEt(id, ad) {
    if (state.partiEngel) return hud.notice?.('You have blocked party requests.', 'hata');
    const d = await rpc('parti_davet_et', { p_hedef: Number(id) }); if (!d) return;
    hud.info?.(`You have invited ${d.ad || ad || 'the player'} to the party.`, 'soluk');
  }

  // ---------- davet al (KO re_messagebox: başlık = davet eden, Block, süre çubuğu, Confirm / Cancel)
  let KUTU = null;
  async function davetKutusu(row) {
    const K = await import('./kui.js');
    if (KUTU) KUTU.el.remove();
    if (!K.hasLayout('re_messagebox')) { hud.soru?.('Party', `${row.kimden_ad} has invited you to join the party. Will you join?`, () => cevap(row, true), () => cevap(row, false), ['Confirm', 'Cancel']); return; }
    const L = K.buildLayout('re_messagebox', { className: 'ko-parti-davet ko-pencere kui-dokulu' }); KUTU = L;
    for (const id of ['Btn_Ok', 'Btn_Cancel', 'Edit_Common', 'base_item', 'img_icon', 'str_crash_tooltip', 'str_itemname']) L.show(id, false);
    L.show('Btn_ban', true); L.show('progress_durationtime', true); L.show('Btn_Yes', true); L.show('Btn_No', true);
    L.text('Text_title', row.kimden_ad || 'Party');
    L.text('Text_Message', `${row.kimden_ad} has invited you to join the party. Will you join?`);
    const yaz = (id, t) => L.get(id)?.querySelectorAll('.kui-tx').forEach((e) => (e.textContent = t));
    yaz('Btn_Yes', 'Confirm'); yaz('Btn_No', 'Cancel'); yaz('Btn_ban', 'Block');
    (document.getElementById('kohud') || document.body).append(L.el);
    L.el.style.pointerEvents = 'auto'; L.el.style.zIndex = 9000;
    L.el.style.left = Math.max(8, innerWidth / 2 - (L.el.offsetWidth || 360) / 2) + 'px'; L.el.style.top = Math.max(8, innerHeight * 0.3) + 'px';
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    let bitti = false; const t0 = performance.now();
    const kapat = () => { bitti = true; L.el.remove(); if (KUTU === L) KUTU = null; };
    const tik = () => {
      if (bitti) return;
      const k = 1 - (performance.now() - t0) / (DAVET_SN * 1000);
      L.progress('progress_durationtime', k);
      if (k <= 0) { kapat(); cevap(row, false); return; }
      requestAnimationFrame(tik);
    };
    requestAnimationFrame(tik);
    L.click('Btn_Yes', () => { if (bitti) return; kapat(); cevap(row, true); });
    L.click('Btn_No', () => { if (bitti) return; kapat(); cevap(row, false); });
    L.click('Btn_ban', () => { if (bitti) return; kapat(); state.partiEngel = true; cevap(row, false); hud.info?.('Party requests are now blocked. (/allow_party to allow)', 'soluk'); });
  }
  async function cevap(row, kabul) {
    const d = await rpc('parti_cevap', { p_davet: row.id, p_kabul: kabul });
    if (d?.kabul) { hud.info?.(`You have joined ${row.kimden_ad}'s party.`, 'soluk'); yukle(); }
  }
  const soruldu = new Set();
  sb.channel('parti-davet-' + me).on('postgres_changes', { event: '*', schema: 'public', table: 'parti_davet', filter: `kime=eq.${me}` }, (p) => {
    const r = p.new; if (!r || r.durum !== 'istek' || soruldu.has(r.id)) return; soruldu.add(r.id);
    if (state.partiEngel || window.koSecenek?.partiRet) { rpc('parti_cevap', { p_davet: r.id, p_kabul: false }); return; }
    davetKutusu(r);
  }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'parti_davet', filter: `kimden=eq.${me}` }, (p) => {
    const r = p.new; if (!r) return;
    if (r.durum === 'red') hud.info?.('The player has declined your party invitation.', 'hata');
    else if (r.durum === 'kabul') yukle();
  }).subscribe();

  // ---------- parti bilgisi
  // (5.11) tek uçuş: aynı anda en fazla bir parti_bilgi isteği; arada gelen istekler bir sonrakine birleşir
  let yukleniyor = null, tekrar = false;
  function yukle() { if (yukleniyor) { tekrar = true; return yukleniyor; } yukleniyor = yukleIc().catch(() => {}).finally(() => { yukleniyor = null; if (tekrar) { tekrar = false; setTimeout(yukle, 300); } }); return yukleniyor; }
  async function yukleIc() {
    const { data, error } = await sb.rpc('parti_bilgi', { p_char: me });
    if (error) return;
    const eski = P?.parti ?? null;
    P = data?.parti ? data : null;
    if ((P?.parti ?? null) !== eski) { kanalKur(P?.parti ?? null); yer = null; sesAcik = false; dispatchEvent(new CustomEvent('ko-parti', { detail: { parti: P?.parti ?? null } })); }   // yeni parti → pencere yeniden sağda ortalı
    if (eski && !P) { hud.info?.(ayrildim ? 'You have left the party.' : 'The party has been disbanded.', 'soluk'); hasar.clear(); }   // (3.11) parti dağılınca diğer üyelerde de pencere kapanır
    ayrildim = false;
    ciz();
  }
  function kanalKur(pid) {
    if (kanal) { try { sb.removeChannel(kanal); } catch {} kanal = null; }
    kanalId = pid; if (!pid) return;
    kanal = sb.channel('parti-' + pid)
      .on('broadcast', { event: 'sohbet' }, ({ payload: m }) => { if (m && Number(m.id) !== me) say?.(m.ad, m.t, m.ulus, 'parti', m.id); })
      .on('broadcast', { event: 'hasar' }, ({ payload: m }) => { if (m) { hasar.set(Number(m.id), Number(m.top) || 0); meterCiz(); } })
      .on('broadcast', { event: 'yenile' }, () => yukle())
      .on('broadcast', { event: 'cagir' }, ({ payload: m }) => { if (m && Number(m.id) === me) state.cagrildi?.({ x: m.x, z: m.z, zone: m.zone, ad: m.ad }); })   // (3.11) Summon Friend
      .on('broadcast', { event: 'kurban' }, ({ payload: m }) => { if (m && Number(m.id) === me) { state.combat?.applyStats?.({ hp: m.hp, max_hp: m.max_hp }); hud.info?.(`${m.ad} sacrificed their HP: your HP has been fully restored.`, 'iyi'); } })   // (4.11) Sacrifice
      .on('broadcast', { event: 'esya' }, ({ payload: m }) => {
        if (!m || Number(m.kimden) === me) return;
        hud.info?.(`${m.ad} got ${m.esya}`, 'drop');
        if (Number(m.alici) === me) { try { state.inv?.reload?.(); } catch {} }
      })
      .on('broadcast', { event: 'noah' }, ({ payload: m }) => {
        if (!m || Number(m.kimden) === me) return;
        const once = Number(state.combat?.stats?.gold);
        sb.from('characters').select('gold').eq('id', me).maybeSingle().then(({ data }) => {
          if (!data) return; const pay = Number(data.gold) - (Number.isFinite(once) ? once : Number(data.gold));
          if (pay > 0) hud.info?.(`Picked up ${pay} Coins.`, 'drop');
          state.combat?.applyStats?.({ gold: data.gold });
        }, () => {});
      })
      .on('broadcast', { event: 'exp' }, ({ payload: m }) => {
        const x = (m?.liste || []).find((e) => Number(e.id) === me); if (!x) return;
        hud.info?.(`You have received ${Number(x.exp).toLocaleString('en-US')} experience points from the party.`, 'exp');
        sb.from('characters').select('exp,level,max_hp,max_mp,hp,mp').eq('id', me).maybeSingle().then(({ data }) => {
          if (!data) return; const eskiLv = Number(state.combat?.stats?.level);
          state.combat?.applyStats?.(data);
          if (x.up || (eskiLv && Number(data.level) > eskiLv)) { hud.notice?.(`Level Up! Level ${data.level}`, 'seviye'); state.inv?.stats?.(); dispatchEvent(new CustomEvent('ko-seviye')); }
        }, () => {});
      })
      // (5.11) yalnız katılma / ayrılma: nabız güncellemeleri (UPDATE) her üyede parti_bilgi tetikleyip istek fırtınasına (bağlantı kopması) yol açıyordu
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parti_uye', filter: `parti_id=eq.${pid}` }, () => yukle())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'parti_uye', filter: `parti_id=eq.${pid}` }, () => yukle())
      .subscribe();
  }
  setInterval(() => { if (P) yukle(); }, 2500);   // üyelerin can / mana / tecrübesi

  // ---------- parti penceresi (re_party: yalnız parti bölümü)
  let W = null, secili = null, menuAcik = false, kurSoz = null;
  async function pencereKur() {
    const K = await import('./kui.js');
    if (!(await K.ekUI('parti').catch(() => false)) || !K.hasLayout('re_party')) return null;
    W = K.buildLayout('re_party', { className: 'ko-parti ko-pencere kui-dokulu' });
    W.el.hidden = true; (document.getElementById('kohud') || document.body).append(W.el);
    W.el.style.pointerEvents = 'none';
    const gizle = ['img_voice', 'base_option', 'Base_Rank', 'str_Count', 'auto_rejoin', 'Base_menu'];
    for (let i = 0; i < 8; i++) gizle.push('base_Voice' + i, 'img_soundrev' + i);
    for (const id of gizle) W.show(id, false);
    for (const e of W.el.querySelectorAll('.kui-btn, [data-id^="Base_Party"], [data-id="topbar"]')) e.style.pointerEvents = 'auto';
    // (3.11) parti kurulunca (her üyede) ekranın sağ kenarında dikeyde ortalı açılır; başlık çubuğundan sürüklenebilir (konum yalnız o parti boyunca kalır)
    addEventListener('resize', () => konum());
    const bar = W.get('topbar');
    bar?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
      const r = W.el.getBoundingClientRect(), S = (r.width / (W.el.offsetWidth || r.width)) || 1;
      const x0 = parseFloat(W.el.style.left) || 0, y0 = parseFloat(W.el.style.top) || 0, cx = e.clientX, cy = e.clientY;
      const mv = (ev) => { yer = { x: Math.round(x0 + (ev.clientX - cx) / S), y: Math.round(y0 + (ev.clientY - cy) / S) }; konum(); };
      const up = () => { removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); };
      addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
    });
    W.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    W.el.addEventListener('contextmenu', (e) => e.preventDefault());
    // üst düğmeler: X = partiden ayrıl, çubuk = Party War Board, ↻ = sayaç sıfırla
    W.click('btn_party', () => hud.soru?.('Party', 'Do you want to leave the party?', () => ayril(), null, ['Confirm', 'Cancel']));
    W.click('btn_metertotal', () => meterAcKapa());
    W.click('btn_metertoggle', () => { hasar.clear(); benimHasar = 0; yayHasar(); meterCiz(); hud.info?.('The Party War Board has been reset.', 'soluk'); });
    W.click('btn_voice', () => { sesAcik = !sesAcik; sesCiz(); });   // (3.11) KO Friends Voice paneli (re_party sol bölüm)
    sesKur();
    W.click('btn_commander_zoom', () => { kucuk = !kucuk; ciz(); });
    // lider menüsü (Make party leader · Kick from party · Authorize Commander · Vote)
    W.click('btn_chief', () => { menuKapat(); hud.notice?.('Changing the party leader is not available yet.', 'hata'); });
    W.click('btn_out', () => { const u = secili; menuKapat(); if (u) hud.soru?.('Party', `Kick ${u.ad} from the party?`, async () => { if (await rpc('parti_at', { p_hedef: u.id })) { kanal?.send({ type: 'broadcast', event: 'yenile', payload: {} }); yukle(); } }, null, ['Confirm', 'Cancel']); });
    W.click('btn_commander', () => { menuKapat(); hud.notice?.('Commander is not available yet.', 'hata'); });
    W.click('btn_uservote', () => { menuKapat(); hud.notice?.('Voting is not available yet.', 'hata'); });
    for (let i = 0; i < 8; i++) {
      const B = W.get('Base_Party' + i); if (!B) continue;
      B.addEventListener('click', (e) => { if (e.target.closest('.kui-btn')) return; const u = P?.uyeler?.[i]; if (!u) return; secili = u; ciz(); hedefSec(u); });
      B.addEventListener('contextmenu', (e) => {
        const u = P?.uyeler?.[i]; if (!u) return; secili = u; ciz();
        if (Number(P.lider) !== me || Number(u.id) === me) return;
        const M = W.get('Base_menu'); if (!M) return; W.show('Base_menu', true); menuAcik = true;
        M.style.transform = `translate(0, ${parseFloat(B.style.top || 0) - 6}px)`;
      });
    }
    addEventListener('pointerdown', (e) => { if (menuAcik && !W.get('Base_menu')?.contains(e.target)) menuKapat(); }, true);
    return W;
  }
  let kucuk = false;
  const menuKapat = () => { menuAcik = false; W?.show('Base_menu', false); };
  function hedefSec(u) {
    if (Number(u.id) === me) return;
    if (state.combat?.clearTarget) state.combat.clearTarget();
    // (3.11) dünyada görünen oyuncunun tam meta'sı (rütbe, ırk, klan…) kullanılır → hedef çubuğunda rütbe / ırk simgesi çıkar
    const r = state.remotes?.get?.(String(u.id)) || state.remotes?.get?.(Number(u.id));
    const meta = r?.meta ? r.meta : { name: u.ad, level: u.sv, nation: u.ulus, class: u.sinif, race: u.irk };
    state.seciliOyuncu = { id: String(u.id), meta };
    hud.target?.({ name: meta.name || u.ad, level: meta.level ?? u.sv, hp: r?.hp ?? u.hp, max_hp: r?.max_hp ?? u.max_hp, enemy: false, oyuncu: true, id: String(u.id), nation: meta.nation ?? u.ulus });
  }

  let yer = null;
  // ---------- (3.11) Friends Voice paneli: parti ayar simgesi (btn_voice) aç/kapa — üye başına ses satırı + seçenekler (KO re_party birebir)
  let sesAcik = false;
  const SES_K = 'ko-parti-ses';
  let ses = { voice: true, mic: true, mark: true, hiz: 2, uygulanan: 2 };
  try { Object.assign(ses, JSON.parse(localStorage.getItem(SES_K) || '{}')); } catch {}
  const sesKaydet = () => { try { localStorage.setItem(SES_K, JSON.stringify(ses)); } catch {} };
  const HIZ_MAX = 10;
  function sesKur() {
    const O = W.get('base_option'); if (!O) return;
    for (const e of [W.get('img_voice'), O, ...Array.from({ length: 8 }, (_, i) => W.get('base_Voice' + i))]) if (e) e.style.pointerEvents = 'auto';
    // (3.11) metin sınıfları (KO görüntüsüne sığdırma): çok satırlı açıklamalar, düğme yazıları, onay kutusu etiketleri
    for (const e of W.el.querySelectorAll('[data-id="base_option"] .kui-tx, [data-id^="base_Voice"] .kui-tx')) {
      const t = e.textContent.trim();
      if (/^Adjusting the Speed|^If there is a lot/.test(t)) e.classList.add('ses-cok', /^If/.test(t) ? 'ses-yardim' : 'ses-hiz');
      else if (/^(Apply|Setting|Help|Reconnect)$/.test(t)) e.classList.add('ses-dug');
      else if (/on\/off$/.test(t)) e.classList.add('ses-etiket');
    }
    const tik = (id, k) => W.click(id, () => { ses[k] = !ses[k]; sesKaydet(); sesCiz(); });
    tik('btn_allmute', 'voice'); tik('btn_mic', 'mic'); tik('btn_mark', 'mark');
    const sc = W.get('scr_rectime'), dg = sc ? [...sc.querySelectorAll(':scope > .kui-btn')] : [];
    const hizAyarla = (v) => { ses.hiz = Math.max(1, Math.min(HIZ_MAX, v)); sesCiz(); };
    if (dg[0]) { dg[0].classList.add('kui-tik'); dg[0].onclick = (e) => { e.stopPropagation(); hizAyarla(ses.hiz - 1); }; }
    if (dg[1]) { dg[1].classList.add('kui-tik'); dg[1].onclick = (e) => { e.stopPropagation(); hizAyarla(ses.hiz + 1); }; }
    const tr = sc?.querySelector(':scope > .kui-tr');
    tr?.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const r = tr.getBoundingClientRect();
      const set = (ev) => hizAyarla(1 + Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (HIZ_MAX - 1)));
      set(e);
      const up = () => { removeEventListener('pointermove', set, true); removeEventListener('pointerup', up, true); };
      addEventListener('pointermove', set, true); addEventListener('pointerup', up, true);
    });
    W.click('btn_rectime', () => { ses.uygulanan = ses.hiz; sesKaydet(); sesCiz(); hud.info?.(`Voice transmission speed has been set to ${ses.hiz}.`, 'soluk'); });
    W.click('btn_gooption', () => { state.ayarlar?.open?.(); });
    W.click('btn_help', () => hud.info?.('Friends Voice: talk with your party members. Use the Setting button to adjust microphone sensitivity.', 'soluk'));
    for (let i = 0; i < 8; i++) {
      const B = W.get('base_Voice' + i); if (!B) continue;
      const rc = B.querySelector('[data-id="Btn_Reconect"]');
      if (rc) { rc.classList.add('kui-tik'); rc.onclick = (e) => { e.stopPropagation(); hud.notice?.('Unable to connect to the voice chat server.', 'hata'); }; }
      const m = B.querySelector('[data-id="btn_mute"]'); if (m) m.onclick = (e) => e.stopPropagation();
    }
  }
  function sesCiz() {
    if (!W) return;
    const ac = sesAcik && !!P && !W.el.hidden, U = P?.uyeler || [];
    W.show('img_voice', ac); W.show('base_option', ac);
    for (let i = 0; i < 8; i++) {
      W.show('img_soundrev' + i, false);
      const B = W.get('base_Voice' + i); if (!B) continue;
      const u = U[i]; B.hidden = !(ac && u); if (B.hidden) continue;
      const q = (k) => B.querySelector(`[data-id="${k}"]`), ben = Number(u.id) === me;
      // KO: sesli sohbete bağlı değil → "Disconnect Voice Chat"; kendi satırında kulaklık / mikrofon kapalı (kırmızı X), diğerlerinde Reconnect
      for (const k of ['img_lis_off', 'img_mic_off']) { const e = q(k); if (e) e.hidden = true; }
      const lm = q('img_lis_mute'), lo = q('img_lis_on'), mm = q('img_mic_mute'), mo = q('img_mic_on');
      if (lm) lm.hidden = !(ben || !ses.voice); if (lo) lo.hidden = !lm?.hidden;
      if (mm) mm.hidden = !(ben || !ses.mic); if (mo) mo.hidden = !mm?.hidden;
      const sb2 = q('img_subBack'); if (sb2) sb2.hidden = false;
      const st = q('str_state'); if (st) { st.hidden = false; st.textContent = 'Disconnect Voice Chat'; }
      const rc = q('Btn_Reconect'); if (rc) rc.hidden = ben;
      const vn = q('str_volName'); if (vn) vn.textContent = u.ad;
    }
    // seçenekler bölümü son ses satırının hemen altına çıkar (KO: üye sayısına göre)
    const O = W.get('base_option');
    if (O && ac) { const n = Math.max(1, Math.min(8, U.length)), son = W.get('base_Voice' + (n - 1)); const alt = son ? parseFloat(son.style.top) + parseFloat(son.style.height) : 82; O.style.transform = `translateY(${Math.round(alt + 4 - 439)}px)`; }
    W.get('btn_allmute')?.classList.toggle('secili', !!ses.voice);
    W.get('btn_mic')?.classList.toggle('secili', !!ses.mic);
    W.get('btn_mark')?.classList.toggle('secili', !!ses.mark);
    W.text('str_rectime', String(ses.hiz)); W.text('str_recparty', String(ses.uygulanan));
    const th = W.get('scr_rectime')?.querySelector(':scope > .kui-tr > .kui-img:last-child');
    if (th) th.style.left = Math.round(((ses.hiz - 1) / (HIZ_MAX - 1)) * 42) + 'px';
  }
  function konum() {
    if (!W || W.el.hidden) return;
    if (yer) { W.el.style.left = yer.x + 'px'; W.el.style.top = yer.y + 'px'; return; }
    const R0 = W.el.getBoundingClientRect(), S = (R0.width / (W.el.offsetWidth || R0.width)) || 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of [W.get('topbar'), ...Array.from({ length: 8 }, (_, i) => W.get('Base_Party' + i))]) {
      if (!e || e.hidden || !e.offsetWidth) continue;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    }
    if (!isFinite(x0)) return;
    const solK = (x0 - R0.left) / S, ustK = (y0 - R0.top) / S, gen = (x1 - x0) / S, boy = (y1 - y0) / S;
    W.el.style.left = Math.round(innerWidth / S - gen - solK - 4) + 'px';
    W.el.style.top = Math.round((innerHeight / S - boy) / 2 - ustK) + 'px';
  }
  // (3.11) aynı partideki oyuncuların başlarının üstündeki isimleri sarı
  let sariIds = new Set();
  function isimRenk() {
    const yeni = new Set((P?.uyeler || []).map((u) => String(u.id)).filter((id) => Number(id) !== me));
    for (const id of new Set([...sariIds, ...yeni])) { const el = state.isimEl?.(id); if (el) el.classList.toggle('parti-uye', yeni.has(id)); }
    sariIds = yeni;
  }
  setInterval(isimRenk, 1000);   // yeni görünen / yeniden kurulan oyuncu etiketleri için
  async function ciz() {
    isimRenk();
    if (!P) { if (W) W.el.hidden = true; meterCiz(); return; }
    if (!W) { await (kurSoz ||= pencereKur()); if (!W || !P) { if (W) W.el.hidden = true; return; } }
    W.el.hidden = false;
    const U = P.uyeler || [];
    for (let i = 0; i < 8; i++) {
      const u = U[i], id = 'Base_Party' + i; W.show(id, !!u); if (!u) continue;
      const B = W.get(id), q = (k) => B.querySelector(`[data-id="${k}"]`);
      for (const k of ['img_voice_play', 'BtnCheckTP', 'btn_up', 'btn_down']) { const e = q(k); if (e) e.hidden = k === 'btn_up' || k === 'btn_down' ? false : true; }
      const ad = q('str_name'); if (ad) { ad.textContent = u.ad; ad.classList.toggle('pt-lider', Number(u.id) === Number(P.lider)); ad.classList.toggle('pt-olu', !!u.olu || u.cevrim === false); }
      W.progress('progress_hp', u.max_hp ? u.hp / u.max_hp : 0, q('progress_hp'));
      W.progress('progress_mp', u.max_mp ? u.mp / u.max_mp : 0, q('progress_mp'));
      const mb = q('meterbar'); if (mb) mb.style.setProperty('--pt-exp', `${Math.max(0, Math.min(100, u.exp_max ? (u.exp / u.exp_max) * 100 : 0))}%`);
      const ar = q('area'); if (ar) { ar.className = ar.className.replace(/\bpt-s\d+\b|\bpt-u\d\b/g, '').trim() + ` pt-s${temelSinif(u.sinif)} pt-u${Number(u.ulus) || 1}`; ar.title = SINIF[Number(u.sinif) % 100] || ''; }
      B.classList.toggle('pt-secili', !!secili && Number(secili.id) === Number(u.id));
      q('base_choice') && (q('base_choice').hidden = !(secili && Number(secili.id) === Number(u.id)));
      q('bg_small') && (q('bg_small').hidden = true);
    }
    konum();
    sesCiz();
    meterCiz();
  }
  async function ayril() { ayrildim = true; if (await rpc('parti_ayril')) { kanal?.send({ type: 'broadcast', event: 'yenile', payload: {} }); yukle(); } }

  // ---------- Party War Board (re_damagemeter_party): üyelerin hasar payı
  let D = null, benimHasar = 0;
  async function meterAcKapa() {
    const K = await import('./kui.js');
    if (!D) {
      if (!(await K.ekUI('parti').catch(() => false)) || !K.hasLayout('re_damagemeter_party')) return;
      D = K.buildLayout('re_damagemeter_party', { className: 'ko-parti-meter ko-pencere kui-dokulu' });
      (document.getElementById('kohud') || document.body).append(D.el); K.draggable(D, 24);
      D.el.style.pointerEvents = 'auto'; D.el.addEventListener('pointerdown', (e) => e.stopPropagation());
      D.el.style.left = Math.max(8, innerWidth - 640) + 'px'; D.el.style.top = '220px';
      D.click('close', () => { D.el.hidden = true; }); D.click('tab_heal', () => hud.info?.('Healing ranking is not available yet.', 'soluk'));
      D.el.hidden = true;
    }
    D.el.hidden = !D.el.hidden; meterCiz();
  }
  function meterCiz() {
    if (!D || D.el.hidden) return;
    const U = (P?.uyeler || []).map((u) => ({ u, d: Number(u.id) === me ? benimHasar : hasar.get(Number(u.id)) || 0 })).sort((a, b) => b.d - a.d);
    const top = U.reduce((t, x) => t + x.d, 0), enCok = Math.max(1, ...U.map((x) => x.d));
    for (let i = 0; i < 8; i++) {
      const R = D.get('rank_' + i); if (!R) continue; const x = U[i]; R.hidden = !x; if (!x) continue;
      const q = (k) => R.querySelector(`[data-id="${k}"]`);
      q('name') && (q('name').textContent = `${i + 1}. ${x.u.ad}`);
      q('per') && (q('per').textContent = `${(top ? (x.d / top) * 100 : 0).toFixed(1)}%`);
      D.progress('bar', x.d / enCok, q('bar'));
      const ar = q('class'); if (ar) { ar.className = ar.className.replace(/\bpt-s\d+\b|\bpt-u\d\b/g, '').trim() + ` pt-s${temelSinif(x.u.sinif)} pt-u${Number(x.u.ulus) || 1}`; }
    }
    D.text('cooltime', '');
  }
  const yayHasar = () => kanal?.send({ type: 'broadcast', event: 'hasar', payload: { id: me, top: benimHasar } });
  let yayT = 0;
  addEventListener('ko-hasar-verdim', (e) => {
    if (!P) return; benimHasar += Number(e.detail) || 0; meterCiz();
    if (performance.now() - yayT > 800) { yayT = performance.now(); yayHasar(); }
  });

  kurSoz = pencereKur().then((w) => { if (W && !P) W.el.hidden = true; return w; }, () => null);   // pencere önceden hazır → partiye girince anında açılır
  // (3.11) KO: oyundan çıkan partiden düşer → önceki oturumdan kalan üyelik açılışta bırakılır; sekme kapanırken de ayrılır
  sb.rpc('parti_ayril', { p_char: me }).then(() => yukle(), () => yukle());
  addEventListener('pagehide', () => { if (P) { try { kanal?.send({ type: 'broadcast', event: 'yenile', payload: {} }); sb.rpc('parti_ayril', { p_char: me }); } catch {} } });
  return {
    davetEt, yukle, ayril,
    /** parti kanalına olay: 'esya' {alici, ad, esya} · 'noah' {} */
    yay(olay, veri = {}) { kanal?.send({ type: 'broadcast', event: olay, payload: { ...veri, kimden: me } }); },
    /** _mob_hit 'parti_exp' payları: parti kanalına yayılır (üyeler bildirim alır, tecrübe çubukları yenilenir) */
    expYay(liste) { if (kanal && liste?.length) kanal.send({ type: 'broadcast', event: 'exp', payload: { liste } }); setTimeout(yukle, 400); },
    get partide() { return !!P; },
    uyeMi: (id) => !!P?.uyeler?.some((u) => Number(u.id) === Number(id)),
    uyeler: () => (P?.uyeler || []).map((u) => Number(u.id)),
    /** parti sohbeti: true → gönderildi */
    sohbet(t) {
      if (!P || !kanal) { hud.info?.('You are not in a party.', 'hata'); return true; }
      const m = { id: me, ad: character.name, t: String(t).slice(0, 200), ulus: character.nation };
      kanal.send({ type: 'broadcast', event: 'sohbet', payload: m }); say?.(m.ad, m.t, m.ulus, 'parti', me); return true;
    },
  };
}
