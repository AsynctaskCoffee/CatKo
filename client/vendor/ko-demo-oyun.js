/* KO Web DEMO — oyun mantığı: canavarlar, savaş, exp/seviye, loot, envanter, eşya kullanımı.
 * Gerçek veriler assets/ içinden: canavarlar + doğma noktaları + düşüş tabloları (mob-db/moblar.json), eşyalar (esya/*.tsv). */
(function () {
  'use strict';
  if (!window.KO_DEMO) return;
  var A = window.KO_DEMO_API, R = A.RPC, T = A.table, base = A.base;
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  var now = function () { return Date.now(); };

  // ------------------------------------------------------------ veri
  var MOBP = null;
  function mobdb() {
    return (MOBP = MOBP || fetch(base + 'assets/mob-db/moblar.json').then(function (r) { return r.json(); }).then(function (j) {
      var al = j.alanlar, ix = {}; al.forEach(function (k, i) { ix[k] = i; });
      var mons = j.moblar.map(function (r) {
        return { sid: r[0], name: r[1], level: r[2], hp: r[3], exp: r[4], atk: r[5], damage: r[6], ac: r[7], hit: r[8], evasion: r[9], money: r[10], boss: !!r[11], pid: r[12], size: r[13],
          attack_range: r[14], search_range: r[15], track_range: r[16], speed1: r[28], speed2: r[29], grup: r[25], tur: r[26], custom: false };
      });
      var bySid = new Map(mons.map(function (m) { return [m.sid, m]; }));
      // doğma noktaları: gerçek koordinatlar; Moradon'da canavarlar oyuncu başlangıcına yakın olsun diye kaydırılır
      var sp = [], id = 0, cx = 0, cz = 0, n = 0;
      Object.keys(j.dogma).forEach(function (sid) { j.dogma[sid].forEach(function (d) { if (d[0] === 'moradon') { cx += d[2]; cz += d[3]; n++; } }); });
      cx /= n || 1; cz /= n || 1;
      // seviyeye göre halkalar: düşük seviyeli canavarlar oyuncu başlangıcına (797,527) yakın, güçlüler uzakta; yön gerçek dağılımdan
      Object.keys(j.dogma).forEach(function (sid) {
        var m0 = bySid.get(+sid); if (!m0) return;
        j.dogma[sid].forEach(function (d) {
          if (d[0] !== 'moradon') return;
          var ang = Math.atan2(d[3] - cz, d[2] - cx), rad = 70 + Math.min(m0.level, 75) * 4.2 + (d[2] * 7 + d[3] * 3) % 17;
          sp.push({ id: ++id, sid: +sid, zone: 'moradon', x: Math.max(30, Math.min(990, 797 + Math.cos(ang) * rad)), z: Math.max(30, Math.min(990, 527 + Math.sin(ang) * rad)), radius: Math.max(3, d[5] || 5), count: d[4] || 1, regen_sec: Math.min(600, Math.max(8, d[6] || 30)), enabled: true });
        });
      });
      return { mons: mons, bySid: bySid, sp: sp, dusus: j.dusus, gruplar: j.gruplar, bolgeler: j.bolgeler };
    }));
  }
  var LV = [];
  var needExp = function (lv) { return Math.round(40 * Math.pow(lv, 2.5) + 60); };
  for (var i = 1; i <= 83; i++) LV.push({ level: i, exp: needExp(i) });

  A.VIRTUAL.monsters = async function () { return (await mobdb()).mons; };
  A.VIRTUAL.level_up = async function () { return LV; };
  A.VIRTUAL.spawners = async function () { return (await mobdb()).sp; };
  A.VIRTUAL.monster_drops = async function () { var d = (await mobdb()).dusus, o = []; Object.keys(d).forEach(function (s) { d[s].forEach(function (x) { if (x[0] > 0) o.push({ sid: +s, item_num: x[0], chance: x[1] }); }); }); return o; };
  A.VIRTUAL.zones = async function () { return []; };

  // mob_instances: açılışta tohumlanır (kalıcı değil)
  var seeded = false;
  A.hooks = A.hooks || {};
  A.hooks.mob_instances = async function () {
    if (seeded) return; seeded = true;
    var d = await mobdb(), t = T('mob_instances'); t.length = 0;
    d.sp.forEach(function (s) {
      var m = d.bySid.get(s.sid);
      for (var k = 0; k < Math.min(s.count, 6); k++) { var a = rnd(0, 6.283), r = Math.sqrt(Math.random()) * s.radius; t.push({ id: A.nextId('mob_instances'), sid: s.sid, zone: s.zone, spawner_id: s.id, x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r, hp: m.hp, dead_until: null, last_hit_at: null }); }
    });
  };

  // ------------------------------------------------------------ eşyalar (demo iksirleri eklenir)
  var DEMO_ITEMS = [
    { num: 389900000, name: 'Healing Potion (S)', kind: 97, item_type: 0, countable: 1, buy_price: 30, sell_price: 10, icon_key: '3_8901_60_0', heal: 1, miktar: 150 },
    { num: 389900100, name: 'Healing Potion (M)', kind: 97, item_type: 0, countable: 1, buy_price: 120, sell_price: 40, icon_key: '3_8901_70_0', heal: 1, miktar: 600 },
    { num: 389900200, name: 'Healing Potion (L)', kind: 97, item_type: 0, countable: 1, buy_price: 500, sell_price: 160, icon_key: '3_8901_80_0', heal: 1, miktar: 2200 },
    { num: 389901000, name: 'Mana Potion (S)', kind: 97, item_type: 0, countable: 1, buy_price: 30, sell_price: 10, icon_key: '3_8902_00_0', heal: 2, miktar: 120 },
    { num: 389901100, name: 'Mana Potion (M)', kind: 97, item_type: 0, countable: 1, buy_price: 120, sell_price: 40, icon_key: '3_8901_90_0', heal: 2, miktar: 500 },
  ];
  var DEMO_BY = new Map(DEMO_ITEMS.map(function (x) { return [x.num, x]; }));
  var itemsP = null;
  function items() {
    return (itemsP = itemsP || A.itemsLoad().then(function (m) { DEMO_ITEMS.forEach(function (x) { if (!m.has(x.num)) m.set(x.num, Object.assign({ weight: 10, duration: 0, damage: 0, ac: 0, req_level: 0, org_num: x.num }, x)); }); return m; }));
  }

  // ------------------------------------------------------------ yardımcılar
  var ACTIVE = {};
  var chOf = function (ctx, id) { var c = T('characters').find(function (c) { return c.id == id && c.owner === ctx.uid; }); if (c) ACTIVE[ctx.uid] = c.id; return c; };
  var inv = function (c) { return T('inventory').filter(function (i) { return i.char_id === c.id; }); };
  var BAG0 = 14, BAG1 = 41;
  function addItem(c, it, count) {
    count = count || 1; var rows = inv(c);
    if (it.countable) { var ex = rows.find(function (r) { return r.item_num === it.num && r.slot >= BAG0 && r.count < 9999; }); if (ex) { ex.count += count; return ex.slot; } }
    for (var s = BAG0; s <= BAG1; s++) if (!rows.some(function (r) { return r.slot === s; })) { T('inventory').push({ char_id: c.id, slot: s, item_num: it.num, count: it.countable ? count : 1, durability: it.duration || 0 }); return s; }
    return -1;
  }
  function equipped(c, map) {
    var out = []; inv(c).forEach(function (r) { if (r.slot <= 13) { var it = map.get(r.item_num); if (it) out.push(it); } }); return out;
  }
  function maxHp(c) { return 100 + c.level * 20 + (c.sta || 60) * 3; }
  function maxMp(c) { return 50 + c.level * 10 + (c.intel || 60) * 2; }
  async function atkOf(c) { var m = await items(), w = 0, ac = 0; equipped(c, m).forEach(function (it) { w += +it.damage || 0; ac += +it.ac || 0; }); return { atk: Math.round(4 + c.level * 1.6 + (c.str || 60) * 0.12 + w * 0.6), ac: ac }; }
  function stat(c) { c.max_hp = maxHp(c); c.max_mp = maxMp(c); c.hp = Math.min(c.hp, c.max_hp); c.mp = Math.min(c.mp, c.max_mp); }
  function giveExp(c, gain) {
    c.exp = (c.exp || 0) + gain; var up = false;
    while (c.level < 83 && c.exp >= needExp(c.level)) { c.exp -= needExp(c.level); c.level++; up = true; c.stat_points = (c.stat_points || 0) + (c.level > 60 ? 5 : 3); c.skill_points = (c.skill_points || 0) + (c.level >= 10 ? 1 : 0); }
    if (up) { stat(c); c.hp = c.max_hp; c.mp = c.max_mp; }
    return up;
  }
  var BOX = new Map(), boxSeq = 1;
  var out = function (c, extra) { return Object.assign({ hp: c.hp, max_hp: c.max_hp, mp: c.mp, max_mp: c.max_mp, exp: c.exp, level: c.level, gold: c.gold }, extra || {}); };

  // ------------------------------------------------------------ başlangıç eşyaları (create_character'a ek)
  var oldCreate = R.create_character;
  R.create_character = async function (a, ctx) {
    var id = await oldCreate(a, ctx), c = T('characters').find(function (x) { return x.id === id; }), m = await items();
    if (c && !inv(c).length) {
      var sw = m.get(120010000) || m.get(125070000); if (sw) T('inventory').push({ char_id: c.id, slot: 6, item_num: sw.num, count: 1, durability: sw.duration || 5000 });
      addItem(c, m.get(389900000), 30); addItem(c, m.get(389901000), 20); c.gold = 500; ctx.save();
    }
    return id;
  };

  // ------------------------------------------------------------ savaş
  function row(id) { return T('mob_instances').find(function (r) { return r.id == id; }); }
  function respawn(r, s, m) {
    setTimeout(function () {
      var a = rnd(0, 6.283), d = Math.sqrt(Math.random()) * (s ? s.radius : 3), o = Object.assign({}, r);
      Object.assign(r, { hp: m.hp, dead_until: null, last_hit_at: null, x: (s ? s.x : r.x) + Math.cos(a) * d, z: (s ? s.z : r.z) + Math.sin(a) * d });
      A.notify('mob_instances', 'UPDATE', r, o);
    }, Math.max(3000, (s ? s.regen_sec : 20) * 1000));
  }
  async function lootFor(d, m) {
    var map = await items(), drops = [], list = d.dusus[String(m.sid)] || [];
    list.forEach(function (x) {
      if (Math.random() * 100 > x[1]) return; var num = x[0];
      if (num < 0) { var g = d.gruplar[String(-num)]; if (!g || !g.length) return; num = pick(g); }
      var it = map.get(num); if (it) drops.push({ num: num, count: it.countable ? 1 + Math.floor(Math.random() * 3) : 1, name: it.name });
    });
    if (Math.random() < 0.45) { var p = pick([389900000, 389901000]); drops.push({ num: p, count: 1 + Math.floor(Math.random() * 2), name: DEMO_BY.get(p).name }); }
    return drops;
  }
  async function hitMob(c, r, mult, ctx) {
    var d = await mobdb(), m = d.bySid.get(r.sid), s = d.sp.find(function (x) { return x.id === r.spawner_id; });
    var dead = r.dead_until && new Date(r.dead_until).getTime() > now();
    if (!m || dead || r.hp <= 0) return { ok: false, reason: 'ölü' };
    if (c.dead) return { ok: false, reason: 'öldün' };
    var st = await atkOf(c), diff = c.level - m.level, hit = Math.random() < Math.max(0.55, Math.min(0.97, 0.9 + diff * 0.01));
    var dmg = hit ? Math.max(1, Math.round(st.atk * (mult || 1) * rnd(0.85, 1.15) * 100 / (100 + (m.ac || 0) * 0.02))) : 0;
    var res = { ok: true, hit: hit, damage: dmg };
    var o = Object.assign({}, r);
    r.hp = Math.max(0, r.hp - dmg); r.last_hit_at = new Date().toISOString();
    res.mob_hp = r.hp;
    if (r.hp <= 0) {
      var gain = Math.max(1, Math.round(m.exp * Math.max(0.1, Math.min(1.5, 1 - diff * 0.1)))), up = giveExp(c, gain);
      var wait = Math.max(3, (s ? s.regen_sec : 20)); r.dead_until = new Date(now() + wait * 1000).toISOString();
      Object.assign(res, { killed: true, gained: gain, respawn_at: r.dead_until, levelup: up });
      var gq = await questKill(c, r.sid); if (gq.length) res.gorev = gq;
      var drops = await lootFor(d, m), gold = Math.round((m.money || 0) * rnd(0.6, 1.4) + m.level);
      if (drops.length || gold > 0) { var id = boxSeq++; BOX.set(id, { drops: drops, gold: gold, owner: c.id }); Object.assign(res, { box: id, box_x: r.x, box_z: r.z, drops: drops, box_gold: gold }); }
      respawn(r, s, m);
    }
    A.notify('mob_instances', 'UPDATE', r, o);
    ctx.save();
    return Object.assign(res, out(c));
  }
  R.mob_attack = async function (a, ctx) { var c = chOf(ctx, a.p_char), r = row(a.p_mob); if (!c || !r) return { ok: false, reason: 'ölü' }; return hitMob(c, r, 1, ctx); };
  R.mob_strike = async function (a, ctx) {
    var c = chOf(ctx, a.p_char), r = row(a.p_mob), d = await mobdb(); if (!c || !r) return { ok: false };
    var m = d.bySid.get(r.sid); if (!m || r.hp <= 0 || c.dead) return { ok: false };
    var st = await atkOf(c), hit = Math.random() < 0.82, back = hit ? Math.max(1, Math.round((m.damage || 1) * rnd(0.7, 1.1) * 100 / (100 + st.ac * 0.5))) : 0;
    if (c.protect && c.protect > now()) { back = 0; hit = false; }
    c.hp = Math.max(0, c.hp - back); if (c.hp <= 0) { c.dead = true; }
    ctx.save();
    return Object.assign({ ok: true, hit: hit, back: back, dead: !!c.dead }, out(c));
  };
  R.mob_pet_strike = function () { return { ok: false, reason: 'pet yok' }; };
  R.mob_eve_dondu = function (a) { var r = row(a.p_mob); if (!r) return { ok: false }; return { ok: true, hp: r.hp }; };
  R.mob_dot_tik = function () { return { ok: false, bitti: true }; };
  R.pvp_attack = R.pvp_skill = function () { return { ok: false, reason: 'PvP demo modunda yok' }; };

  // beceriler: assets/yetenek/yetenekler.json
  var SK = null;
  function skills() { return (SK = SK || fetch(base + 'assets/yetenek/yetenekler.json').then(function (r) { return r.json(); }).then(function (j) { return j.yetenekler; }).catch(function () { return {}; })); }
  var cool = {};
  R.skill_use = async function (a, ctx) {
    var c = chOf(ctx, a.p_char), S = (await skills())[a.p_skill]; if (!c || !S) return { ok: false, reason: 'Bilinmeyen beceri' };
    if (c.dead) return { ok: false, reason: 'öldün' };
    if (c.level < (S.seviye || 1)) return { ok: false, reason: 'Seviye yetmiyor' };
    var key = c.id + ':' + S.id, t = now(); if ((cool[key] || 0) > t) return { ok: false, hazir: 0, reason: 'Hazır değil' };
    if ((S.mp || 0) > c.mp) return { ok: false, reason: 'Yetersiz MP' };
    c.mp -= (S.mp || 0); cool[key] = t + Math.max(0, (S.bekleme || 0) * 100 - 200);
    var pct = /(\d+)%/.exec(S.en || ''), mult = pct ? Math.max(0.5, +pct[1] / 100) : 1.3;
    var r = a.p_mob != null ? row(a.p_mob) : null;
    if (r && (S.tip1 === 1 || S.tip1 === 2 || S.tip1 === 3 || S.tip1 === 4) && (S.hedef === 1 || S.hedef === 7 || S.hedef === 0 || true) && !/heal|recover|restore|increase|resist/i.test(S.en || '')) {
      var res = await hitMob(c, r, mult, ctx); return Object.assign(res, { skill: S.id, ad: S.ad, sonuc: [] });
    }
    if (/heal|recover|restore/i.test(S.en || '')) { var h = Math.round(c.max_hp * 0.15 + c.level * 10); c.hp = Math.min(c.max_hp, c.hp + h); ctx.save(); return Object.assign({ ok: true, heal: h, sonuc: [{ hedef_char: c.id, heal: h, hedef_hp: c.hp, hedef_max_hp: c.max_hp }] }, out(c)); }
    ctx.save(); return Object.assign({ ok: true, sonuc: [] }, out(c));
  };
  R.skill_info = function () { return {}; };

  // ------------------------------------------------------------ loot
  R.loot_take_num = async function (a, ctx) {
    var c = chOf(ctx, a.p_char), b = BOX.get(a.p_box); if (!c || !b) return { ok: false, reason: 'Sandık yok' };
    if (a.p_num === -1) { var g = b.gold; b.gold = 0; c.gold = (c.gold || 0) + g; ctx.save(); return { ok: true, gold: g, total_gold: c.gold }; }
    var i = b.drops.findIndex(function (x) { return x.num === a.p_num; }); if (i < 0) return { ok: false, reason: 'Eşya yok' };
    var it = (await items()).get(a.p_num), x = b.drops[i];
    if (addItem(c, it, x.count) < 0) return { ok: false, reason: 'Çanta dolu' };
    b.drops.splice(i, 1); ctx.save(); return { ok: true, name: it.name, count: x.count };
  };
  R.loot_cop = async function (a, ctx) { var b = BOX.get(a.p_box); if (!b) return { ok: false }; var x = b.drops.splice(a.p_idx, 1)[0]; return { ok: !!x, name: x && x.name }; };
  A.VIRTUAL.loot_boxes = async function () { return []; };

  // ------------------------------------------------------------ karakter / envanter
  R.char_stats = async function (a, ctx) {
    var c = chOf(ctx, a.p_char); if (!c) return null; stat(c); var st = await atkOf(c);
    return Object.assign({}, c, { exp_next: needExp(c.level), points: c.stat_points || 0, np: 0, np_ay: 0, ability: { str: c.str, sta: c.sta, dex: c.dex, intel: c.intel, cha: c.cha, ap: st.atk, ac: st.ac, weight: 0, max_weight: 1000 + (c.str || 60) * 30 } });
  };
  R.oyuncu_envanter = function (a) { return T('inventory').filter(function (i) { return i.char_id == a.p_char; }); };
  R.inv_move = async function (a, ctx) {
    var c = chOf(ctx, a.p_char); if (!c) throw new Error('Karakter yok'); var m = await items(), t = T('inventory');
    var x = t.find(function (r) { return r.char_id === c.id && r.slot === a.p_from; }), y = t.find(function (r) { return r.char_id === c.id && r.slot === a.p_to; });
    if (!x) return { ok: false };
    var chk = function (r, slot) { if (slot > 13 || !r) return; var it = m.get(r.item_num); if ((+it.req_level || 0) > c.level) throw new Error('kuşanılamaz: seviye'); };
    chk(x, a.p_to); chk(y, a.p_from);
    if (y && x.item_num === y.item_num && (m.get(x.item_num) || {}).countable && a.p_to > 13 && a.p_from > 13) { y.count += x.count; t.splice(t.indexOf(x), 1); }
    else { x.slot = a.p_to; if (y) y.slot = a.p_from; }
    stat(c); ctx.save(); return { ok: true };
  };
  R.inv_destroy = function (a, ctx) { var t = T('inventory'), i = t.findIndex(function (r) { return r.char_id == a.p_char && r.slot === a.p_slot; }); if (i >= 0) t.splice(i, 1); ctx.save(); return { ok: true }; };
  R.inv_sirala = function (a, ctx) { var c = chOf(ctx, a.p_char); if (!c) return { ok: false }; var bag = inv(c).filter(function (r) { return r.slot >= BAG0 && r.slot <= BAG1; }).sort(function (p, q) { return p.item_num - q.item_num; }); bag.forEach(function (r, i) { r.slot = BAG0 + i; }); ctx.save(); return { ok: true }; };
  R.esya_kullan = async function (a, ctx) {
    var c = chOf(ctx, a.p_char), r = T('inventory').find(function (x) { return x.char_id === a.p_char && x.slot === a.p_slot; }); if (!c || !r) return { ok: false, reason: 'Eşya yok' };
    var it = (await items()).get(r.item_num), dm = DEMO_BY.get(r.item_num);
    if (c.dead) return { ok: false, reason: 'You cannot use items while dead.' };
    if (!dm) return { ok: false, reason: 'This item cannot be used.' };
    if (dm.heal === 1) c.hp = Math.min(c.max_hp, c.hp + dm.miktar); else c.mp = Math.min(c.max_mp, c.mp + dm.miktar);
    r.count--; var kalan = r.count; if (r.count <= 0) T('inventory').splice(T('inventory').indexOf(r), 1);
    ctx.save(); return Object.assign({ ok: true, kalan: kalan, ad: it.name, miktar: dm.miktar, heal: dm.heal, fx: dm.heal === 1 ? 601 : 602 }, out(c));
  };


  // ------------------------------------------------------------ görevler (assets/gorev/gorevler.json)
  var QP = null;
  function quests() { return (QP = QP || fetch(base + 'assets/gorev/gorevler.json').then(function (r) { return r.json(); }).then(function (a) { return new Map(a.map(function (q) { return [q.id, q]; })); }).catch(function () { return new Map(); })); }
  var cq = function (c) { return T('char_quests').filter(function (r) { return r.char_id === c.id; }); };
  async function questKill(c, sid) {
    var G = await quests(), out = [];
    cq(c).forEach(function (r) {
      if (r.durum !== 1) return; var q = G.get(r.id); if (!q) return; var ch = false;
      q.gruplar.forEach(function (g, i) { if (g.mobs.indexOf(sid) >= 0 && (r.sayac[i] || 0) < g.n) { r.sayac[i] = (r.sayac[i] || 0) + 1; ch = true; } });
      if (ch) out.push({ id: r.id, sayac: r.sayac.slice() });
    });
    return out;
  }
  var active = function (ctx) { var id = ACTIVE[ctx.uid]; return T('characters').find(function (c) { return c.id === id && c.owner === ctx.uid; }) || T('characters').find(function (c) { return c.owner === ctx.uid; }); };
  R.gorev_listem = function (a, ctx) { var c = active(ctx); return c ? cq(c).map(function (r) { return { id: r.id, durum: r.durum, sayac: r.sayac }; }) : []; };
  R.gorev_al = async function (a, ctx) {
    var c = active(ctx), q = (await quests()).get(a.p_q); if (!c || !q) return { ok: false, mesaj: 'Quest not found.' };
    if (c.level < (q.seviye || 1)) return { ok: false, mesaj: 'You need level ' + q.seviye + '.' };
    if (cq(c).some(function (r) { return r.id === q.id; })) return { ok: false, mesaj: 'You already have this quest.' };
    var row = { char_id: c.id, id: q.id, durum: 1, sayac: q.gruplar.map(function () { return 0; }) }; T('char_quests').push(row); ctx.save(); return { ok: true, sayac: row.sayac };
  };
  R.gorev_birak = function (a, ctx) { var c = active(ctx), t = T('char_quests'), i = t.findIndex(function (r) { return c && r.char_id === c.id && r.id === a.p_q; }); if (i >= 0) t.splice(i, 1); ctx.save(); return { ok: true }; };
  R.gorev_teslim = async function (a, ctx) {
    var c = active(ctx), G = await quests(), q = G.get(a.p_q), r = c && cq(c).find(function (x) { return x.id === a.p_q; }), m = await items();
    if (!c || !q || !r) return { ok: false, mesaj: 'Quest not found.' }; if (r.durum === 2) return { ok: false, mesaj: 'Already completed.' };
    if (!q.gruplar.every(function (g, i) { return (r.sayac[i] || 0) >= g.n; })) return { ok: false, mesaj: 'The quest is not complete yet.' };
    var od = q.odul || {}, esy = [], up = giveExp(c, od.exp || 0); c.gold = (c.gold || 0) + (od.noah || 0);
    (od.esya || []).forEach(function (x) { var it = m.get(x[0]); if (it) { addItem(c, it, x[1]); esy.push({ name: it.name, count: x[1], num: it.num }); } });
    r.durum = 2; ctx.save();
    return Object.assign({ ok: true, exp_odul: od.exp || 0, noah_odul: od.noah || 0, esyalar: esy, levelup: up }, out(c));
  };
  R.clarence_gorev = function () { return { ok: false }; };

  // ------------------------------------------------------------ mağaza (her tüccar NPC'si aynı demo stoğunu satar)
  var STOCK = null;
  async function stock() {
    if (STOCK) return STOCK; var m = await items(), per = {}, out = [];
    DEMO_ITEMS.forEach(function (x) { out.push({ num: x.num, price: 0 }); });   // CatKo: market bedava
    var grp = {};
    Array.from(m.values()).filter(function (it) { return !DEMO_BY.has(it.num) && it.item_type === 0 && !/\(\+/.test(it.name) && (+it.req_level || 0) <= 40 && +it.buy_price >= 50 && +it.buy_price <= 90000 && (+it.damage > 0 || +it.ac > 0) && !it.race; })
      .forEach(function (it) { var k = it.kind + ':' + (it.slot || 0), g = (grp[k] = grp[k] || {}); if (!g[it.name]) g[it.name] = it; });
    Object.keys(grp).forEach(function (k) {
      var l = Object.keys(grp[k]).map(function (n) { return grp[k][n]; }).sort(function (a, b) { return (+a.req_level || 0) - (+b.req_level || 0) || a.buy_price - b.buy_price; });
      var step = Math.max(1, Math.floor(l.length / 4)); for (var i = 0; i < l.length && i < step * 4; i += step) if (out.length < 90) out.push({ num: l[i].num, price: 0 });
    });
    return (STOCK = out);
  }
  R.shop_list = async function () { return (await stock()).map(function (x, i) { return { num: x.num, price: x.price, sira: i + 1 }; }); };
  R.shop_buy = async function (a, ctx) {
    var c = chOf(ctx, a.p_char), st = (await stock()).find(function (x) { return x.num === a.p_item; }), it = (await items()).get(a.p_item), n = Math.max(1, Math.min(999, +a.p_count || 1));
    if (!c || !st || !it) throw new Error('Item is not sold here.'); if (!it.countable) n = 1;
    var tutar = st.price * n; if ((c.gold || 0) < tutar) return { ok: false, reason: 'Not enough Noah.' };
    if (addItem(c, it, n) < 0) return { ok: false, reason: 'Your inventory is full.' };
    c.gold -= tutar; ctx.save(); return { ok: true, name: it.name, count: n, tutar: tutar, vergi: 0, gold: c.gold };
  };
  R.shop_sell = async function (a, ctx) {
    var c = chOf(ctx, a.p_char), t = T('inventory'), r = t.find(function (x) { return x.char_id === a.p_char && x.slot === a.p_slot; }), it = r && (await items()).get(r.item_num);
    if (!c || !r || !it) return { ok: false, reason: 'Item not found.' }; if (a.p_slot <= 13) return { ok: false, reason: 'Unequip the item first.' };
    var n = Math.max(1, Math.min(r.count, +a.p_count || r.count)), unit = +it.sell_price === 1 ? +it.buy_price : Math.floor((+it.buy_price || 0) / 6), tutar = unit * n;
    r.count -= n; if (r.count <= 0) t.splice(t.indexOf(r), 1); c.gold = (c.gold || 0) + tutar; ctx.save();
    return { ok: true, name: it.name, count: n, tutar: tutar, gold: c.gold };
  };

  R.add_stat = function (a, ctx) { var c = chOf(ctx, a.p_char); if (!c || !(c.stat_points > 0)) throw new Error('No stat points'); var k = { str: 'str', sta: 'sta', dex: 'dex', int: 'intel', intel: 'intel', cha: 'cha' }[String(a.p_stat).toLowerCase()]; if (k) { c[k]++; c.stat_points--; stat(c); ctx.save(); } return Object.assign({ ok: true }, out(c)); };
  R.revive = function (a, ctx) {
    var c = chOf(ctx, a.p_char); if (!c) return { ok: false }; stat(c); c.dead = false; c.hp = Math.round(c.max_hp * 0.5); c.mp = Math.round(c.max_mp * 0.5);
    c.exp = Math.max(0, Math.round((c.exp || 0) * 0.9)); c.protect = now() + 5000;
    var x = c.nation === 1 ? 797.7 : 837.4, z = 526.8; c.x = x; c.z = z; ctx.save();
    return { ok: true, hp: c.hp, mp: c.mp, x: x, z: z, zone: 'moradon' };
  };
  R.town = R.revive;
  R.regen = function (a, ctx) { var c = chOf(ctx, a.p_char); if (!c || c.dead) return null; stat(c); c.hp = Math.min(c.max_hp, c.hp + Math.ceil(c.max_hp * 0.02)); c.mp = Math.min(c.max_mp, c.mp + Math.ceil(c.max_mp * 0.02)); return out(c); };
  R.dinlen_tick = R.regen;
  A.OYUN = { chOf: chOf, ACTIVE: function () { return ACTIVE; }, addItem: addItem, items: items, stock: stock, atkOf: atkOf, stat: stat, out: out, giveExp: giveExp, pick: pick, rnd: rnd };
  console.info('%cKO demo oyun mantığı yüklendi (canavar, savaş, loot, envanter)', 'color:#7ad27a');
})();
