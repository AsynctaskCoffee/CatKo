/* KO Web DEMO — RPC işlevleri (tek oyunculu, tarayıcı içi). ko-demo.js'den sonra yüklenir. */
(function () {
  'use strict';
  if (!window.KO_DEMO) return;
  var A = window.KO_DEMO_API, R = A.RPC, T = A.table;
  var KARUS = [1, 2, 3, 4, 6], now = function () { return new Date().toISOString(); };

  var chOf = function (ctx, id) { return T('characters').find(function (c) { return c.id == id && c.owner === ctx.uid; }); };
  var need = function (ctx) { if (!ctx.uid) throw new Error('Oturum yok'); };
  var BASE_HP = function (c) { return 100 + c.level * 20 + (c.sta || 60) * 3; };
  var BASE_MP = function (c) { return 50 + c.level * 10 + (c.intel || 60) * 2; };

  // ---- hesap / oturum
  R.account_available = function (a) { return !T('profiles').some(function (p) { return String(p.account).toLowerCase() === String(a.p_account || '').toLowerCase(); }); };
  R.giris_eposta = function (a, ctx) {
    var id = String(a.p_id || '').toLowerCase();
    var p = T('profiles').find(function (x) { return String(x.account).toLowerCase() === id; });
    var u = p && ctx.db.users.find(function (x) { return x.id === p.id; });
    if (!u || u.pw !== a.p_sifre) throw new Error('Invalid login credentials');
    return u.email;
  };
  R.session_durum = function () { return { aktif: false }; };
  R.session_claim = function () { return { ok: true }; };
  R.session_ping2 = function () { return { ok: true }; };
  R.session_release = function () { return { ok: true }; };
  R.baglanti_ping = function () { return true; };
  R.bakim_durum = function () { return false; };
  R.bakim_giris = function () { return { gm: false }; };
  R.ceza_durum = function () { return null; };
  R.server_doluluk = function (a, ctx) { return [{ server_id: 1, online: 1, toplam: T('characters').length }]; };
  R.kral_sunucu = function () { return {}; };
  R.kral_durum = function () { return {}; };
  R.web_gm_mi = function () { return false; };
  R.launcher_dosyalar = function () { return []; };
  R.web_siralama = function () { return []; };
  R.etkinlik_liste = function () { return []; };
  R.oto_duyuru_liste = function () { return []; };
  R.gunluk_sira_liste = function () { return []; };
  R.mg_istemci = function () { return null; };
  R.mg_bildir = function () { return null; };

  // ---- karakter
  R.create_character = async function (a, ctx) {
    need(ctx);
    var name = String(a.p_name || '').trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) throw new Error('Name must be 3-20 letters/numbers.');
    if (T('characters').some(function (c) { return String(c.name).toLowerCase() === name.toLowerCase(); })) throw new Error('This name is already in use.');
    var nation = KARUS.indexOf(+a.p_race) >= 0 ? 1 : 2;
    var c = {
      id: ctx.nextId('characters'), owner: ctx.uid, server_id: a.p_server || 1, slot: a.p_slot || 0, name: name, race: +a.p_race, class: +a.p_class, nation: nation,
      face: a.p_face || 0, hair: a.p_hair || 0, sac_renk: null, level: 1, exp: 0, gold: 0, cash: 0, zone: 'moradon', x: nation === 1 ? 797.7 : 837.4, z: 526.8, y: 0, rot: 0,
      str: a.p_str, sta: a.p_sta, dex: a.p_dex, intel: a.p_int, cha: a.p_cha, stat_points: 0, skill_points: 0, dead: false, created_at: now(),
    };
    c.max_hp = c.hp = BASE_HP(c); c.max_mp = c.mp = BASE_MP(c);
    T('characters').push(c);
    ctx.save(); return c.id;
  };
  R.irk_gorunum = function (a, ctx) { var c = chOf(ctx, a.p_char); if (c) { c.race = a.p_race; c.face = a.p_face; c.hair = a.p_hair; ctx.save(); } return true; };
  R.sac_renk_ayarla = function (a, ctx) { var c = chOf(ctx, a.p_char); if (c) { c.sac_renk = a.p_rgb < 0 ? null : a.p_rgb; ctx.save(); } return true; };
  R.char_stats = function (a, ctx) {
    var c = chOf(ctx, a.p_char); if (!c) return null;
    return Object.assign({}, c, { max_hp: c.max_hp || BASE_HP(c), max_mp: c.max_mp || BASE_MP(c), weight: 0, max_weight: 1000, ac: 0, attack: 10 + c.level * 3 });
  };
  R.add_stat = function (a, ctx) { var c = chOf(ctx, a.p_char); if (!c || c.stat_points <= 0) throw new Error('No stat points'); var k = { str: 'str', sta: 'sta', dex: 'dex', int: 'intel', intel: 'intel', cha: 'cha' }[a.p_stat]; if (k) { c[k]++; c.stat_points--; ctx.save(); } return c; };
  R.oyuncu_bilgi = function (a, ctx) { var c = T('characters').find(function (x) { return x.id == a.p_char || x.name === a.p_ad; }); return c || null; };
  R.regen = function (a, ctx) { var c = chOf(ctx, a.p_char); if (!c) return null; c.hp = Math.min(c.max_hp, c.hp + Math.ceil(c.max_hp * 0.02)); c.mp = Math.min(c.max_mp, c.mp + Math.ceil(c.max_mp * 0.02)); return { hp: c.hp, mp: c.mp }; };
  R.dinlen_tick = R.regen;
  R.revive = function (a, ctx) { var c = chOf(ctx, a.p_char); if (c) { c.dead = false; c.hp = c.max_hp; c.mp = c.max_mp; ctx.save(); } return c; };
  R.town = R.revive;

  // ---- envanter
  R.oyuncu_envanter = function (a, ctx) { return T('inventory').filter(function (i) { return i.char_id == a.p_char; }); };
  R.oyuncu_ekipman = function (a, ctx) { return T('inventory').filter(function (i) { return i.char_id == a.p_char && i.slot < 14; }); };
  R.depo_list = function () { return []; };
  R.shop_list = function () { return []; };
  R.pazar_bak = function () { return []; };
  R.esya_ara = function () { return []; };
})();
