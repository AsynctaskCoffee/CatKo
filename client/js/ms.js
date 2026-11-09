// Monster Stone (KO): Monster Stone eşyası yetenek çubuğuna konup basılır → onay → oyuncuya özel yuvaya ışınlanır.
// Yuva = ayrı bölge örneği "ms<harita>_<aile>_<karakter>" (In_dungeon01/02/03); 3 oda: oda temizlenince sonraki açılır, 3. odada boss.
// Süre 30 dk (ms_aile.sure_dk); boss ölünce 2 dk sonra, süre bitince ya da /town ile önceki yere dönülür. Sunucu: ms_gir / ms_durum / ms_cikis.
import { fromDb } from './esya.js';
import { buildLayout, draggable, ekUI, hasLayout } from './kui.js';
const MS_RE = /^ms([1-3])_(\d+)_/;

export function initMs({ sb, character, hud, state, zone }) {
  const icinde = MS_RE.test(zone);
  let kutu = null, son = null, fark = 0, tik = 0, sor = 0, cikiliyor = false;

  // hedef {zone,x,z}: halt öncesi 5 sn'lik konum kaydı eski haritanın koordinatını yazmış olabilir → sunucunun verdiği hedef yeniden yazılır, sonra yüklenir
  const yenidenYukle = (gecikme = 600, hedef = null) => {
    state.net?.halt?.();
    const u = new URL(location.href); for (const k of ['x', 'z', 'bolge']) u.searchParams.delete(k); u.searchParams.set('karakter', character.id);
    const git = () => location.replace(u.toString());
    if (hedef?.zone && hedef.x != null && hedef.z != null) setTimeout(() => sb.from('characters').update({ zone: hedef.zone, x: Number(hedef.x), z: Number(hedef.z) }).eq('id', character.id).then(git, git), Math.max(600, gecikme));
    else setTimeout(git, gecikme);
  };

  // ── kullanım (yetenek çubuğu / envanter): pazar kuruluyken ya da herhangi bir pencere açıkken açılmaz
  const engel = () => {
    if (state.pazarAcik || state.pazar?.acik) return 'You cannot use the Monster Stone while your merchant stall is open.';
    if (hud.windowOpen || state.ticaret?.acik || state.genie?.acik || state.gmWin?.isOpen || document.querySelector('.ko-npc-menu:not([hidden]), #pus-pencere:not([hidden]), .ko-mail:not([hidden])'))
      return 'Close the open windows before using the Monster Stone.';
    if (state.combat?.dead) return 'Monster\'s Stone cannot be used in death.';
    if (icinde) return 'You are already in a Monster Stone den.';
    if (/^klanq_/.test(zone) || zone === 'arena') return 'The Monster Stone cannot be used in this zone.';
    if (Number(character.level) < 20) return 'You must be at least level 20 to use the Monster Stone.';
    return null;
  };
  addEventListener('ko-monster-stone', (ev) => {
    const slot = ev.detail?.slot; if (slot == null) return;
    const e = engel(); if (e) { hud.notice?.(e, 'hata'); return; }
    const ok = hud.soru?.('Monster Stone', 'You will be teleported to the Monster Stone den.\nThe Monster Stone will be consumed. Do you want to continue?', async () => {
      const e2 = engel(); if (e2) { hud.notice?.(e2, 'hata'); return; }
      const { data, error } = await sb.rpc('ms_gir', { p_char: character.id, p_slot: slot }).then((r) => r, (er) => ({ error: er }));
      if (error || !data?.ok) { hud.notice?.(data?.mesaj || error?.message || 'The Monster Stone could not be used.', 'hata'); return; }
      hud.notice?.(`Teleporting to the ${data.ad} den… (${data.sure_dk} min)`, 'seviye');
      yenidenYukle(900, data);
    });
    if (ok === false) hud.notice?.('The confirmation window could not be opened.', 'hata');
  });

  if (!icinde) return { icinde: false };

  // ── yuva içi: geri sayım penceresi — krallık (Roben) NPC'sinin KO penceresi: co_msgboxok_king (deadsoft US yerleşimi) + kral-dekor; sürüklenebilir
  let yazi = null;
  const pencereKur = async () => {
    // oyun arayüzü (ui.json) yüklenmeden çağrılırsa krallık paketi eklenemez → arayüz hazır olana dek bekle (en çok 20 sn)
    for (let i = 0; i < 80 && !hasLayout('re_hpbar'); i++) await new Promise((r) => setTimeout(r, 250));
    let ok = await ekUI('kral').catch(() => false);
    if (!ok) { await new Promise((r) => setTimeout(r, 1500)); ok = await ekUI('kral').catch(() => false); }
    const ad = hasLayout('co_msgboxok_king_us') ? 'co_msgboxok_king_us' : 'co_msgboxok_king';
    if (ok && hasLayout(ad)) {
      const L = buildLayout(ad, { className: 'ko-pencere ko-kral kral-dekor kral-dekor-kucuk ms-pencere ms-kral' });
      kutu = L.el;
      const msg = L.get('text_msg'); msg.textContent = '';
      msg.innerHTML = '<div class="ms-ad">…</div><div class="ms-sure">--:--</div><div class="ms-not"></div>';
      { const tx = [...L.el.querySelectorAll('[data-id="btn_ok"] .kui-tx')]; tx.forEach((t, i) => { t.textContent = 'Çıkış'; if (i < tx.length - 1) t.hidden = true; else t.classList.add('ms-btn-yazi'); }); }   // KO'nun gri gölge katmanı gizli: tek, gölgesiz yazı
      L.click('btn_ok', () => {   // KO onay penceresi: evet → yuvadan çıkış (Moradon)
        const r = hud.soru?.('Monster Stone', 'Are you sure you want to leave the Monster Stone?\nThe den will close and you will be teleported to Moradon.', () => cik());
        if (r === false && confirm('Are you sure you want to leave the Monster Stone?')) cik();
      });
      document.body.append(kutu);   // #kohud dönüşümlü kap (fixed konum ona göre kayar) → sürüklemede zıplama; doğrudan sayfaya
      // ortalama CSS transform ile yapılıyordu → sürüklemede pencere yarı genişliği kadar zıplıyordu: konum piksele çevrilir
      requestAnimationFrame(() => { const r = kutu.getBoundingClientRect(), p = kutu.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 };
        kutu.style.transform = 'none'; kutu.style.left = Math.round(r.left - p.left) + 'px'; kutu.style.top = Math.round(r.top - p.top) + 'px'; });
      try { draggable(L, 70); } catch {}   // yalnız üst bilgi alanından tutulur (alttaki Çıkış düğmesi sürüklemez)
    } else {
      kutu = document.createElement('div'); kutu.className = 'ms-pencere';
      kutu.innerHTML = '<div class="ms-baslik">Monster Stone</div><div class="ms-kutu"><div class="ms-ad">…</div><div class="ms-sure">--:--</div><div class="ms-not"></div></div>';
      (document.getElementById('kohud') || document.body).append(kutu);
      let d = null;
      kutu.addEventListener('pointerdown', (e) => { e.stopPropagation(); d = { x: e.clientX - kutu.offsetLeft, y: e.clientY - kutu.offsetTop }; kutu.setPointerCapture(e.pointerId); });
      kutu.addEventListener('pointermove', (e) => { if (d) { kutu.style.left = (e.clientX - d.x) + 'px'; kutu.style.top = (e.clientY - d.y) + 'px'; kutu.style.transform = 'none'; } });
      kutu.addEventListener('pointerup', () => { d = null; });
    }
    yazi = kutu;
  };
  const pencereHazir = pencereKur();
  const yaz = () => {
    if (!son || !yazi) return;
    const k = Math.max(0, Math.round((Date.parse(son.bitis) - (Date.now() + fark)) / 1000));
    yazi.querySelector('.ms-sure').innerHTML = `<span>Kalan süre</span> ${String(Math.floor(k / 60)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}`;
    kutu.classList.toggle('az', k <= 60);
    if (k <= 0 && !cikiliyor) durum();
  };
  let bossBildirildi = false, esyaIt = null;
  let sorguda = false;
  async function durum() {
    if (cikiliyor || sorguda) return;   // 5 sn sorgusu, süre sonu ve mob ölümü aynı anda tetiklenince çıkış mesajı iki kez yazılmasın
    sorguda = true;
    try { await durumSor(); } finally { sorguda = false; }
  }
  async function durumSor() {
    await pencereHazir;
    const { data } = await sb.rpc('ms_durum', { p_char: character.id }).then((r) => r, () => ({}));
    if (!data) return;
    if (data.cikis) { cikiliyor = true; hud.notice?.(son?.boss_oldu ? 'Monster Stone completed; teleporting to Moradon…' : 'Monster Stone time is over; teleporting to Moradon…', 'seviye'); yenidenYukle(1200, data); return; }
    if (!data.ok) return;
    son = data; if (data.simdi) fark = Date.parse(data.simdi) - Date.now();
    yazi.querySelector('.ms-ad').textContent = data.ad;
    if (data.boss_oldu && !bossBildirildi) { bossBildirildi = true; hud.banner?.(`${data.boss || 'Boss'} yenildi! 20 saniye içinde Moradon'a ışınlanacaksın.`, 'seviye', 5); }
    yazi.querySelector('.ms-not').textContent = data.boss_oldu ? `${data.boss || 'Boss'} yenildi` : `Boss: ${data.boss || '?'} · ${data.kalan} canavar`;
    if (!esyaIt) { const num = Number(data.esya) || 900144023; const { data: it } = await sb.from('items').select('*').eq('num', num).maybeSingle().then((r) => r, () => ({})); if (it) esyaIt = fromDb(it); }
    dispatchEvent(new CustomEvent('ko-etki', { detail: { anahtar: 'ms-yuva', ad: esyaIt?.strName || 'Monster Stone', esyaIt, bitis: Date.parse(data.bitis) - fark, tip: 'buff', aciklama: `${data.ad} — you will be teleported to Moradon when the time runs out.` } }));
    yaz();
  }
  tik = setInterval(yaz, 1000); sor = setInterval(durum, 5000); durum();
  addEventListener('ko-mob-oldu', () => setTimeout(durum, 600));

  const cik = async () => {
    if (cikiliyor) return;
    const { data, error } = await sb.rpc('ms_cikis', { p_char: character.id }).then((r) => r, (er) => ({ error: er }));
    if (error || !data?.ok) { hud.notice?.(data?.mesaj || error?.message || 'Could not leave the den.', 'hata'); return; }
    cikiliyor = true; clearInterval(tik); clearInterval(sor); hud.notice?.('Leaving the den…', 'seviye'); yenidenYukle(700, data);
  };
  return { icinde: true, cik, durum };
}
