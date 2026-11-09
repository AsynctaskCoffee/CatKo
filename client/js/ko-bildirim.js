// KO (KnightOnlineEn) bildirim pencereleri:
//  • Seviye atlama: re_quest_seed — sağ altta Seed (npcimg\seed_congra_01.dxt, sevinçli) ve parşömen konuşma kutusu
//    "Hehe, you leveled up, Master~" + "Thank you." seçeneği (Seçenekler → Decline Seed's Help açıksa gösterilmez).
//  • Görev ödülü: re_quest_requital — "Reward" penceresi: EXP / Coin / eşyalar (simge + ad + miktar), Confirm.
import { hasLayout, buildLayout, draggable, ekUI } from './kui.js';
import { loadMeta, iconHtml, fromDb } from './esya.js';

const hazir = () => ekUI('qseed').then((ok) => ok && hasLayout('re_quest_seed'));
const katman = () => document.getElementById('kohud') || document.body;
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

let SEED = null, seedZaman = 0;
export async function seviyeSeed() {
  if (window.koSecenek?.seed) return;
  if (!(await hazir())) return;
  if (!SEED) {
    const L = buildLayout('re_quest_seed', { className: 'ko-seed-bildirim kui-dokulu' });
    katman().append(L.el);
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    L.get('img_npc')?.classList.add('sb-portre');
    L.show('txt_talk_ext', false); L.show('btn_1', false); L.show('str_1', false);
    const kapat = () => { L.el.hidden = true; };
    L.click('btn_0', kapat);
    L.get('str_0')?.addEventListener('click', kapat);
    SEED = L;
  }
  SEED.text('txt_talk', 'Hehe, you leveled up, Master~');
  SEED.text('str_0', 'Thank you.');
  SEED.el.hidden = false; seedZaman = Date.now();
  clearTimeout(SEED._t); SEED._t = setTimeout(() => { if (Date.now() - seedZaman >= 14000) SEED.el.hidden = true; }, 15000);
}

let ODUL = null;
export async function odulPenceresi(sb, d) {
  if (!(await hazir()) || !hasLayout('re_quest_requital')) return false;
  await loadMeta().catch(() => {});
  const satir = [];
  if (d.exp_odul) satir.push({ num: 900001000, ad: 'EXP', miktar: fmt(d.exp_odul) });
  if (d.noah_odul) satir.push({ num: 900000000, ad: 'Coin', miktar: fmt(d.noah_odul) });
  for (const e of d.esyalar || []) satir.push({ num: e.num, ad: e.name, miktar: fmt(e.count || 1) });
  const nums = [...new Set(satir.map((r) => r.num).filter(Boolean))];
  const IT = new Map();
  if (sb && nums.length) { const { data } = await sb.from('items').select('*').in('num', nums); for (const r of data || []) IT.set(r.num, fromDb(r)); }
  if (!ODUL) {
    const L = buildLayout('re_quest_requital', { className: 'ko-odul ko-pencere kui-dokulu' });
    katman().append(L.el);   // KO: taşınamaz, yalnız Confirm ile kapanır
    L.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    L.click('btn_close', () => { L.el.hidden = true; });
    // "Reward" başlığı ve "Confirm" yazısı orijinal dokuda zaten var: üstüne ikinci yazı konmaz (iç içe görünüyordu)
    L.get('btn_close')?.querySelectorAll('.kui-tx').forEach((t) => t.remove());
    ODUL = L;
  }
  const L = ODUL;
  for (let i = 0; i < 8; i++) {
    const g = L.get('group_' + i), r = satir[i]; if (!g) continue;
    g.hidden = !r; if (!r) continue;
    const q = (k) => g.querySelector(`[data-id="${k}"]`);
    q('txt_first').textContent = r.ad; q('txt_second').textContent = r.miktar;
    const it = IT.get(r.num); q('area').innerHTML = it ? iconHtml(it, 36) : '';
  }
  // pencere yüksekliği satır sayısına göre: alt bölüm son satırın altına
  const n = Math.max(1, Math.min(8, satir.length)), alt = L.get('group_bottom');
  // alt bölüm son satırın tam bitimine (kesirli piksel boşluğu yatay bir çizgi / yırtık gibi görünüyordu) — 1 px bindirme
  const son = L.get('group_' + (n - 1)), y = son ? Math.round(parseFloat(son.style.top) + parseFloat(son.style.height)) - 1 : 50 + n * 48;
  if (alt) alt.style.top = y + 'px';
  L.el.style.height = (y + 57) + 'px';
  L.el.hidden = false; L.el.style.zIndex = 4200;
  // her açılışta ekranın tam ortası
  requestAnimationFrame(() => {
    const p = L.el.offsetParent || document.body, pr = p.getBoundingClientRect(), k = p.offsetWidth ? pr.width / p.offsetWidth : 1;
    L.el.style.left = Math.max(0, (p.offsetWidth - L.el.offsetWidth) / 2) + 'px'; L.el.style.top = Math.max(0, ((innerHeight - pr.top) / k - L.el.offsetHeight) / 2) + 'px';
  });
  return true;
}
