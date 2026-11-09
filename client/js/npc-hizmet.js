// Moradon hizmet NPC'leri: [National Enchanter] (31508) ücretli güçlendirme (KO NPC buff) ve Moradon ışınlanma kapısı (obj_el_potal_gate_2005).
import { npcMenuAc, npcMenuKapat } from './npc-menu.js';

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

// ---- (3.11) KO [Royal National Enchanter] (31508_NEnchant.lua, Quest_Talk / Quest_Menu metinleri birebir)
// Lv 1-34 ücretsiz; 35-60 30.000 Noah ya da 2 [sign of victory]; 61+ 50.000 Noah. Dört buff hepsi: 35-60 150.000, 61+ 200.000 Noah.
const KO_METIN = (t) => String(t).replace(/\|/g, '\n').replace(/#\s*/g, '• ');
const T = {
  9126: 'Knights between levels 1 and 35 can use it free of charge. The list of  buffs which a user can receive is as follows: |#Shout for charge: Attack power 10%|# Firm will: Defensive power 100|# Endless patience: Enhancement of physical strength by 500 |The price is 30000 Noah per buff. It can also be paid by one [sign of victory].',
  9127: 'This is the list of buffs which a user between levels 36 and 60 can receive: |#Shout for charge: Attack power 10%|# Unbeatable will: Defensive power 150|# Unlimited patience: Enhancement of physical strength by 800|The price is 30000 Noah per buff. It can also be paid by two [signs of victory].',
  9128: 'This is the list of buffs which a user between levels 61 and 83 can receive:|# Shout for charge: Attack power 10%|# Unyielding will: Defensive power 200|# Extreme patience: Enhancement of physical strength by 1000|The price is 50000 Noah per buff.',
  9129: "Information on the NPC buff payment|- It is free for a customer who is at the level between Lv. 1 and 35..|- The three types of buffs, enhancement of striking power, enhancement of defensive power and enhancement of physical strength, are provided for 30 minutes.|- The buff provided varies depending on the degree of level and the money to be paid also varies.|- The three types of buffs can be overlaid with each other and as for the buff that has already been received, it can't be received again unless the time has expired or cancelled.",
  9132: 'Please select the buff you would like to receive.|# Shout for charge : Attack power 10%|# Firm will: Defensive power 100|# Endless patience: Enhancement of physical strength by 500',
  9133: 'Please select the buff you would like to receive.|# Shout for charge : Attack power 10%|# Unbeatable will: Defensive power 150|# Unlimited patience: Enhancement of physical strength by 800',
  9134: 'Please select the buff you would like to receive.|# Shout for charge : Attack power 10%|# Unyielding will: Defensive power 200|# Extreme patience: Enhancement of physical strength by 1000',
  9135: 'Please select your method of payment. |#Noah : 30000 Noah consumed |# sign of victory : Two used',
  9130: 'Please select your method of payment. Buffs are free for a customer between the levels of 1 and 35.|#Lv.1~35: Free |# Noah : 10000 Noah consumed |# sign of victory : One used',
  9131: 'The payment means are not enough. Please confirm it again.',
  9136: 'Please select your method of payment. |#Noah : 50000 Noah consumed',
  9137: 'You are already completed. Have a good time.',
  9139: "This buff is already in use. You can't receive the same type of buff repeatedly.",
  9138: 'How are you? I am the Enchanter dispatched to Moradon Castle.  I offer buffs to help you on your journey. The are three types of buffs that you can receive: attack power, defensive power and enhancement of physical strength, and they can be stacked! Possible payment means are Noah, and for those people between level 36 and 60, can pay with the [sign of victory] too.',
  11849: "You don't have buff coupon.",
};
export function enchanterMenu({ sb, character, hud, state, ad = '[National Enchanter]', model = null }) {
  if (/^\[National Enchanter\]$/.test(String(ad).trim())) ad = '[Royal National Enchanter]';
  const seviye = () => state.combat?.stats?.level ?? character.level;
  const kat = () => (seviye() <= 34 ? 1 : seviye() <= 60 ? 2 : 3);
  // KO: [sign of victory] = Certificate of Victory (900017000); buff başına 2 adet (9135 "Two used")
  const zaferSay = () => { let n = 0; for (const [sl, e] of state.inv?.items || []) if (sl >= 14 && sl <= 41 && Number(e.row?.item_num) === 900017000) n += Number(e.row?.count) || 1; return n; };
  const zaferVar = (gerek = 2) => zaferSay() >= gerek;
  const ac = (id, secenekler, ek = {}) => npcMenuAc({ ad, model, metin: KO_METIN(typeof id === 'number' ? T[id] : id), secenekler, enAz: 0, ...ek });
  const tamam = { ad: 'Confirm', fn: () => {} };
  const yetmez = () => ac(9131, [tamam]);
  const al = async (tip, odeme = 'noah') => {
    const { data: d, error } = await sb.rpc('npc_buff', { p_char: character.id, p_tip: tip, p_odeme: odeme });
    if (error) { hud.notice?.(error.message, 'hata'); return; }
    if (!d?.ok) { if (d?.para) return yetmez(); return ac(d?.mesaj || T[9137], [tamam]); }
    state.combat?.odulUygula?.({ gold: d.gold, hp: d.hp, max_hp: d.max_hp, mp: d.mp, max_mp: d.max_mp });
    state.inv?.stats?.(); if (d.zafer) state.inv?.reload?.();
    for (const v of d.verilen || []) dispatchEvent(new CustomEvent('ko-etki', { detail: { id: v.skill, ad: v.ad, sure: v.sure, tip: 'buff', anahtar: 'buff:' + v.anahtar } }));
    hud.info?.(`You received ${(d.verilen || []).map((v) => v.ad).join(', ')} (30 minutes)${d.ucret ? `, paid ${fmt(d.ucret)} Noah` : ''}${d.zafer ? `, used ${d.zafer} [sign of victory]` : ''}.`, 'beceri');
    ac(9137, [tamam]);
  };
  // (5.11) KO akışı: [Buff] → seviye listesi (9126/9127/9128) Yes → ödeme bilgisi (9129, portresiz, Confirm) →
  //   Lv 1-34: buff seçimi (9132, ücretsiz) · Lv 35-60: ödeme yolu (9135: Provided in Noah / Provided as a sign of victory) → 9133 · Lv 61+: 9136 (Provided in Noah) → 9134
  //   ödeme yetmezse 9131; buff verilince 9137
  const buffSec = (odeme) => {
    const k = kat();
    ac([9132, 9133, 9134][k - 1], [
      { ad: '[Attack] Shout for charge', kalsin: true, fn: () => al('saldiri', odeme) },
      { ad: ['[Defense] Firm will', '[Defense] Unbeatable will', '[Defense] Unyielding will'][k - 1], kalsin: true, fn: () => al('savunma', odeme) },
      { ad: ['[Physical strength] Endless patience', '[Physical strength] Unlimited patience', '[Physical strength] Extreme patience'][k - 1], kalsin: true, fn: () => al('can', odeme) },
      { ad: 'Strong legs [Go]', kalsin: true, fn: () => al('hiz', odeme) },
    ]);
  };
  const noahYeter = (n) => Number(state.combat?.stats?.gold ?? 0) >= n;
  const odemeYolu = () => {
    const k = kat();
    if (k === 1) return buffSec('noah');
    if (k === 2) return ac(9135, [
      { ad: 'Provided in Noah', kalsin: true, fn: () => (noahYeter(30000) ? buffSec('noah') : yetmez()) },
      { ad: 'Provided as a sign of victory', kalsin: true, fn: () => (zaferVar() ? buffSec('zafer') : yetmez()) },
    ]);
    return ac(9136, [{ ad: 'Provided in Noah', kalsin: true, fn: () => (noahYeter(50000) ? buffSec('noah') : yetmez()) }]);
  };
  const odemeBilgi = () => ac(9129, [{ ad: 'Confirm', kalsin: true, fn: odemeYolu }], { portresiz: true, uzat: 80 });
  const buffMenu = () => ac([9126, 9127, 9128][kat() - 1], [{ ad: 'Yes', kalsin: true, fn: odemeBilgi }, { ad: 'No', fn: () => {} }]);
  const kupon = () => ac(11849, [tamam]);   // KO: Buff Free-Rental (900667000) kuponu gerekir
  const hepsi = () => ac(9138, [
    { ad: 'Receive for Free', kalsin: true, fn: () => (kat() === 1 ? al('hepsi', 'noah') : ac(9129, [tamam], { portresiz: true, uzat: 80 })) },
    { ad: 'Receive with Noah', kalsin: true, fn: () => (kat() === 1 ? ac(9135, [tamam]) : al('hepsi', 'noah')) },
    { ad: 'Receive with Symbol of Victory', kalsin: true, fn: () => (kat() === 2 ? al('hepsi', 'zafer') : ac(9135, [tamam])) },
  ]);
  const ana = () => ac(9138, [
    { ad: '[Buff][Noah/Symbol of Victory]', kalsin: true, fn: buffMenu },
    { ad: '[Spirit Alseids] Of mounting', kalsin: true, fn: kupon },
    { ad: 'Settlement support free of charge buff', kalsin: true, fn: kupon },
    { ad: 'Receive all 4 buffs', kalsin: true, fn: hepsi },
  ]);
  ana();
}

// ---- [Pitman] (31511): KO madencilik NPC'si (31511_Pitman.lua) — kazma verir, Mysterious Ore takası, madencilik bilgisi
export function pitmanMenu({ sb, character, hud, state, ad = '[Miner] Jaro', model = null }) {
  // (5.11) KO [Miner] Jaro (31511) birebir: Quest_Talk 9167–9179 (npc tipi 1025); ana menü kullanıcının KO ekran görüntüsünden
  const T = {
    9169: 'Why am I standing here? Is it not obvious? I am standing here because I am a miner! Why is a miner standing here? So I can mine ores! You sure ask silly questions! Then why am I not mining any ores? It is bothersome, that is why, you smirk bastard! Actually, this is great. Go over there and start mining some ores for me. You do not know how to? Here, I will give you a Mattock, so hold this and press [Sparce Bar] near the ore veins. Then you will automatically start mining. Go on now! If you mine up some [Mysterious Ore], I will purify it and then craft it into a useful item for you! Run along now!',
    9170: 'The weather sure is great today. Who are you? What do you want?',
    9171: 'Oh, you actually managed to find [Mysterious Ore] and [Mysterious Gold Ore]. Well, do you want me to purify it and turn it into an item?',
    9172: 'What? You want a Mattock? You took one before. I cannot just keep giving away Mattock for free, so I will give you a Mattock for 1 M Noah.',
    9173: "Mattock? Here's a spare one. No need to pay for it. Just go mine up some ores already. For your information, it has to be repaired when it runs out of durability, or else you will have to purchase it from me again.",
    9174: 'Here, take it.',
    9175: 'Did you check your bag space? How packed is it if you cannot even accept this? Come back after you free up some space!',
    9176: 'Here, take it. Hopefully it is something you wanted.',
    9177: 'You do not have the [Exchange Coupon]. Check again!',
    9178: 'Which [Exchange Coupon] did you bring?',
    9179: 'Bring me [Mysterious Ore] and [Mysterious Gold Ore! Hurry and go mine it up!',
    9161: 'You do not have enough Noah. To buy a pickaxe you need 1 million Noah.',
  };
  const tamam = { ad: 'Confirm', fn: () => {} };
  const ac = (id, secenekler = [tamam]) => npcMenuAc({ ad, model, metin: T[id] || id, secenekler, enAz: 0 });
  const canta = (r) => /bag|çanta|canta|yer yok|space|full/i.test(String(r || ''));
  const noah = (r) => /noah|para|gold/i.test(String(r || ''));
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, { p_char: character.id, ...args }); if (error) { hud.notice?.(error.message, 'hata'); return null; } return data; };
  const kazmaAl = async (satin = false) => {
    const d = await rpc('pitman_kazma', { p_satin: satin }); if (!d) return;
    if (!d.ok) {
      if (d.var) return ac(9172, [{ ad: 'Yes', kalsin: true, fn: () => kazmaAl(true) }, { ad: 'No', fn: () => {} }]);
      return ac(canta(d.reason) ? 9175 : noah(d.reason) ? 9161 : d.reason);
    }
    if (d.ucret) state.combat?.odulUygula?.({ gold: d.gold });
    state.inv?.reload?.(); hud.info?.(`You've received a Mattock${d.ucret ? ` (${fmt(d.ucret)} Noah)` : ''}.`, 'esya');
    ac(d.ucret ? 9174 : 9173);
  };
  const takas = async (tur = 0) => {
    const d = await rpc('pitman_cevher', { p_tur: tur }); if (!d) return;
    if (!d.ok) return ac(canta(d.reason) ? 9175 : 9179);
    state.inv?.reload?.(); hud.info?.(`${tur ? 'Mysterious Gold Ore' : 'Mysterious Ore'}: you've received ${d.ad}${d.adet > 1 ? ' x' + d.adet : ''}.`, 'esya');
    ac(9176);
  };
  // Golden Mattock Voucher (508122000) / bakım ödülü kuponu (810473000) → 30 günlük Golden Mattock
  const altinKupon = async () => {
    const KUP = new Set([508122000, 810473000]); let slot = null;
    try { await state.inv?.reload?.(); } catch {}
    for (const [sl, e] of state.inv?.items || []) if (sl >= 14 && sl <= 41 && KUP.has(Number(e.row.item_num))) { slot = sl; break; }
    if (slot == null) return ac(9177);
    const d = await rpc('kupon_takas_yap', { p_slot: slot, p_npc: 31511 }); if (!d) return;
    if (!d.ok) return ac(canta(d.reason) ? 9175 : d.reason);
    state.inv?.reload?.(); hud.info?.(`You've received the ${d.ad} (${d.gun} days) item.`, 'esya');
    ac(9174);
  };
  const ana = () => ac(9170, [
    { ad: "Golden Pickaxe & Master's teachings", kalsin: true, fn: () => ac(9178, [   // Quest_Menu 45626 / 45629
      { ad: 'Golden Pickaxe Exchange', kalsin: true, fn: altinKupon },
      { ad: 'Exchange Golden Pickaxe Voucher for Master’s Teaching', kalsin: true, fn: () => ac(9177) },
    ]) },
    { ad: '[Free] Receive a Mattock', kalsin: true, fn: () => kazmaAl(false) },
    { ad: 'What are you doing here?', kalsin: true, fn: () => ac(9169) },
    { ad: '[Exchange] Refine this for me, please?', kalsin: true, fn: () => ac(9171, [
      { ad: '[Mysterious Ore]', kalsin: true, fn: () => takas(0) },
      { ad: '[Mysterious Gold Ore]', kalsin: true, fn: () => takas(1) },
    ]) },
  ]);
  ana();
}

// ---- [Peddler] Hemes (16085): KO kostüm sertifikaları (16085_Hamus.lua) — sertifikayı seç, özelliği seç, kostüm çantaya gelir
export async function sertifikaMenu({ sb, character, hud, state, ad = '[Peddler] Hemes', model = null, npc = 16085, geri = null }) {
  const [{ data: S }, { data: B }] = await Promise.all([sb.from('sertifika').select('*'), sb.from('kostum_bonus').select('*')]);
  const SER = new Map((S || []).filter((r) => Number(r.npc ?? 16085) === npc).map((r) => [Number(r.kupon), r])), BON = new Map((B || []).map((r) => [Number(r.num), r]));
  // KO: menü satırları çantaya bakmadan her zaman görünür (sertifika türü başına); seçince çanta sunucudan tazelenir,
  // sertifika yoksa bir sonraki adımda söylenir. Aynı türden birden çok varsa hangisi olduğu sorulur.
  const grupOf = (r) => String(r.ad || '').replace(/'s?\s+(Helmet|Armor)$|\s+(Helmet|Armor)$/, '').replace(/' Glove$/, "' Gloves");
  const GRUP = []; for (const r of SER.values()) { const g = grupOf(r); if (!GRUP.includes(g)) GRUP.push(g); }
  const ana = (metin) => npcMenuAc({ ad, model,
    metin: metin || (npc === 16085 ? 'Bring me a Valkyrie, Gryphon, Bahamut, Yeniçeri or Pathos\' Gloves certificate and I will give you the item with the option of your choice. Which certificate would you like to exchange?' : 'Bring me a Wing of Dragon Exchange Coupon and I will give you wings with the option of your choice.'),
    secenekler: [{ ad: 'Item Exchange', kalsin: true, fn: () => exchangeAc(null) }, ...GRUP.map((g) => ({ ad: `Exchange ${g} ${npc === 16085 ? 'certificate' : 'coupon'}`, kalsin: true, fn: () => grupSec(g) })),
      ...(geri ? [{ ad: 'Back', kalsin: true, fn: geri }] : []), { ad: 'Close', html: '<span class="npm-kirmizi">Close</span>', fn: () => npcMenuKapat() }] });
  const grupSec = async (g) => {
    try { await state.inv?.reload?.(); } catch {}
    const liste = [];
    for (const [slot, e] of state.inv?.items || []) { const r = SER.get(Number(e?.row?.item_num)); if (slot >= 14 && slot <= 41 && r && grupOf(r) === g) liste.push({ slot, e, s: r }); }
    if (!liste.length) return ana(`You don't have a ${g} ${npc === 16085 ? 'certificate' : 'coupon'}.`);
    // KO Item Exchange penceresi: ilk uygun kupon kayıtlı açılır; başka kupon çantadan sürüklenip kaydedilebilir
    npcMenuKapat();
    const { itemExchange } = await import('./esya-degis.js');
    itemExchange({ sb, character, hud, state, SER, BON, slot: liste[0].slot });
  };
  // KO "Item Exchange" penceresi (USKO sertifika takası): başlık, "Please register the exchange ticket item from your inventory.",
  // mor bantta kayıtlı kupon (ikon + ad + "Types of items available for exchange (Count N)"), altında seçenek satırları
  // (onay kutusu · hedef eşya ikonu · "Cospre option : …"), kaydırma çubuğu, Exchange düğmesi. Kupon çantadan sürüklenerek (ya da yuvaya tıklanarak) kaydedilir.
  const ozellik = (x) => exchangeAc(x);
  let pen = null, secili = null, sec = 0;
  const IT = new Map();
  const esyalar = async (nums) => { const e = [...new Set(nums.map(Number))].filter((n) => n && !IT.has(n)); if (!e.length) return;
    const { data } = await sb.from('items').select('*').in('num', e); const { fromDb } = await import('./esya.js'); for (const r of data || []) IT.set(Number(r.num), fromDb(r)); };
  const cantaKupon = (num = null) => { const l = []; for (const [slot, e] of state.inv?.items || []) { const r = SER.get(Number(e?.row?.item_num)); if (slot >= 14 && slot <= 41 && r && (num == null || Number(r.kupon) === Number(num))) l.push({ slot, e, s: r }); } return l; };
  const kapatPen = () => { pen?.remove(); pen = null; secili = null; };
  async function exchangeAc(x = null) {
    npcMenuKapat?.();
    const E = await import('./esya.js'); await E.loadMeta().catch(() => {});
    const { koWindow, toFront } = await import('./ko-pencere.js');
    hud.acPanel?.('envanter');   // kupon çantadan sürüklenir
    if (!pen) {
      pen = document.createElement('div'); pen.className = 'ko-iex ko-pencere'; pen.dataset.esyaBirak = '1';
      pen.innerHTML = `<div class="ay-baslik iex-baslik"><i>◆</i><span>Item Exchange</span><i>◆</i></div><button class="iex-kapat" title="Close">X</button>
        <p class="iex-alt">Please register the exchange ticket item from your inventory.</p>
        <div class="iex-bant"><div class="iex-cerceve iex-kupon" title="Drag the voucher here"></div><div class="iex-bilgi"><b></b><span></span></div></div>
        <div class="iex-liste"></div>
        <button class="iex-dugme">Exchange</button>`;
      (document.getElementById('kohud') || document.body).append(pen); pen.style.pointerEvents = 'auto';
      koWindow(pen); toFront(pen);
      // ekranın ortasında aç (kohud ölçeği hesaba katılır)
      requestAnimationFrame(() => { if (!pen) return; const r = pen.getBoundingClientRect(), z = r.width / (pen.offsetWidth || r.width) || 1; pen.style.left = Math.max(0, (innerWidth - r.width) / 2 / z) + 'px'; pen.style.top = Math.max(0, (innerHeight - r.height) / 2 / z) + 'px'; pen.style.right = pen.style.bottom = 'auto'; });
      pen.addEventListener('pointerdown', (e) => { e.stopPropagation(); toFront(pen); });
      pen.addEventListener('keydown', (e) => e.stopPropagation());
      pen.querySelector('.iex-kapat').addEventListener('click', kapatPen);
      const esc = (e) => { if (!pen) return removeEventListener('keydown', esc, true); if (e.key === 'Escape') { kapatPen(); removeEventListener('keydown', esc, true); } };
      addEventListener('keydown', esc, true);
      pen.addEventListener('ko-esya-birak', (ev) => {
        const d = ev.detail || {}; if (d.slot == null || d.slot < 14 || d.slot > 41) return hud.notice?.('Drag the coupon from your inventory.', 'hata');
        const e = state.inv?.items?.get?.(d.slot), r = e && SER.get(Number(e.row.item_num));
        if (!r) return hud.notice?.('This item cannot be exchanged here.', 'hata');
        kaydet({ slot: d.slot, e, s: r });
      });
      pen.querySelector('.iex-kupon').addEventListener('click', () => { if (secili) return kaydet(null); const l = cantaKupon(); if (l.length) kaydet(l[0]); else hud.notice?.('You have no coupon / certificate to exchange in your inventory.', 'hata'); });
      pen.querySelector('.iex-liste').addEventListener('click', (e) => { const r = e.target.closest('.iex-satir'); if (!r || !secili) return; sec = sec === Number(r.dataset.i) ? 0 : Number(r.dataset.i); ciz(); });
      pen.querySelector('.iex-dugme').addEventListener('click', async () => {
        if (!secili) return hud.notice?.('Register the coupon from your inventory first.', 'hata');
        if (!sec) return hud.notice?.('Select the option to exchange.', 'hata');
        const kupon = secili.s.kupon, d = await kir(secili, sec, true); if (!d) return;
        kaydet(cantaKupon(kupon)[0] || null);   // aynı türden başka kupon varsa kayıtlı kalır
      });
    }
    toFront(pen); kaydet(x);
  }
  async function kaydet(x) {
    secili = x; sec = 0;
    if (x) await esyalar([x.e?.row?.item_num, ...(x.s.hedefler || []), ...(x.s.hedefler2 || [])]).catch(() => {});
    ciz();
  }
  async function ciz() {
    if (!pen) return;
    const { iconHtml, etiketEn } = await import('./esya.js');
    const k = pen.querySelector('.iex-kupon'), b = pen.querySelector('.iex-bilgi b'), sp = pen.querySelector('.iex-bilgi span'), L = pen.querySelector('.iex-liste');
    pen.querySelector('.iex-dugme').classList.toggle('pasif', !secili || !sec);
    if (!secili) { k.innerHTML = ''; b.textContent = 'Exchange ticket'; sp.textContent = 'Drag a voucher / certificate from your inventory to this slot, or click the slot.'; L.innerHTML = ''; return; }
    k.innerHTML = secili.e?.it ? iconHtml(secili.e.it, 44) + (secili.e.row.count > 1 ? `<b class="iex-adet">${secili.e.row.count}</b>` : '') : '';
    b.textContent = secili.e?.it?.strName || secili.s.ad; sp.textContent = `Types of items available for exchange (Count ${secili.s.hedefler.length})`;
    const hedef = (i) => (Number(character.nation) === 2 && secili.s.hedefler2 ? secili.s.hedefler2[i] : secili.s.hedefler[i]);
    L.innerHTML = secili.s.hedefler.map((h, i) => { const it = IT.get(Number(hedef(i))), et = secili.s.etiketler?.[i] || BON.get(Number(h))?.etiket || `Option ${i + 1}`;
      return `<div class="iex-satir${sec === i + 1 ? ' secili' : ''}" data-i="${i + 1}"><div class="iex-sol"><i class="iex-kutu"></i></div><div class="iex-cerceve">${it ? iconHtml(it, 40) : ''}</div><div class="iex-yazi">Cospre option : ${String(etiketEn(et)).replace(/[<>&]/g, '')}</div></div>`; }).join('');
  }
  const kir = async (x, secim, pencereden = false) => {
    const { data: d, error } = await sb.rpc('sertifika_kir', { p_char: character.id, p_slot: x.slot, p_secim: secim });
    if (error) { hud.notice?.(error.message, 'hata'); return null; }
    if (!d?.ok) { if (pencereden) { hud.notice?.(d?.reason || 'The certificate could not be exchanged.', 'hata'); return null; } return ana(d?.reason || 'The certificate could not be exchanged.'); }
    await state.inv?.reload?.(); hud.info?.(`You've received the ${d.ad} item (${d.gun || 60} days; the period starts when first equipped).`, 'esya');
    if (!pencereden) ana(`${d.ad} is ready! It lasts ${d.gun || 60} days; the time starts when you first equip it.`);
    return d;
  };
  ana();
}
