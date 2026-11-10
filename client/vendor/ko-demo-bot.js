/* CatKo — bot dünyası (çevrimdışı, tarayıcı içi)
 * Gerçek çok oyunculu protokolü (Supabase Realtime broadcast: meta/pos/hp/pvp/chat/anim) taklit eder:
 * oyun istemcisi botları sıradan oyuncular gibi görür. Botlar: gezer, sohbet eder, PK yapar, CZ'de savaşır,
 * pazar kurar (her şey bedava). Kapatmak için ?bot=0 ya da localStorage 'ko-bots'='0'.
 * CZ = Chaos Zone: Ardream (freezone_a) — iki ulusun serbest PK alanı. Moradon'da iki arena da PK alanıdır. */
(function () {
  'use strict';
  if (!window.KO_DEMO || !window.KO_DEMO_API || !window.KO_DEMO_API.OYUN || !window.KO_DEMO_API.hub) return;
  var A = window.KO_DEMO_API, R = A.RPC, T = A.table, HUB = A.hub, O = A.OYUN;
  var OFF = false; try { OFF = /[?&]bot=0\b/.test(location.search) || localStorage.getItem('ko-bots') === '0'; } catch (e) {}
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (l) { return l[Math.floor(Math.random() * l.length)]; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var nowS = function () { return Date.now() / 1000; };

  var GATE = { freezone_a: { 1: [840.5, 125.5], 2: [203.8, 907.5] }, moradon: { 1: [797.7, 526.9], 2: [837.4, 526.8] } };
  var ARENAS = [[684, 735, 440, 491], [684, 735, 360, 411]];
  var inRect = function (r, x, z) { return x > r[0] && x < r[1] && z > r[2] && z < r[3]; };
  var NAMES = ['Pamuk', 'Tekir', 'Mirmir', 'Boncuk', 'Minnos', 'Duman', 'Pati', 'Misket', 'Zeytin', 'Tarcin', 'Luna', 'Simba', 'Karamel', 'Cakil', 'Mavis', 'Fistik', 'Pisi', 'Gofret', 'Badem', 'Kasar', 'Sirin', 'Tombik', 'Pelus', 'Findik', 'Kedi_Reis', 'NightPaw', 'IronWhisker', 'PurrKnight', 'MeowMage', 'ShadowTail', 'FuzzyBlade', 'CatNip', 'Bengal', 'Sphynx', 'Ragdoll', 'Siamese'];
  var COMBO = { 1: [[1, 1], [2, 2], [2, 4], [3, 3], [4, 4], [4, 3]], 2: [[11, 1], [12, 1], [12, 2], [12, 3], [12, 4], [13, 1], [13, 2], [13, 3], [13, 4]] };
  var CLS = { 1: { rng: 3.6, cd: 1.5, mul: 1.15, hp: 1.25 }, 2: { rng: 3.2, cd: 1.0, mul: 1.0, hp: 0.95 }, 3: { rng: 18, cd: 2.2, mul: 1.4, hp: 0.8 }, 4: { rng: 16, cd: 2.4, mul: 0.75, hp: 0.9, heal: true } };
  var SAY = {
    selam: ['Selam! Pati pati 🐾', 'Merhaba, CatKo\'ya hoş geldin!', 'Hey! Pazar bedava, bakmayı unutma.', 'Selam kedi dostu!'],
    pazar: ['Pazar güneyde, her şey bedava!', 'Bedava pazar kuruldu, tezgâhlara tıkla 🛒', 'Market free! Tezgâha tıkla, al.'],
    pk: ['CZ için Ardream\'e gel, PK orada!', 'Arenada düello yapıyoruz, gel!', 'PK mi? Hazırım 😼'],
    grup: ['Grup olalım mı? CZ\'de bekliyorum.', 'Party? Ben varım!'],
    genel: ['Bugün hava kediliyor', 'Mırr...', 'Kimse var mı?', 'Level atlamak için CZ en iyisi.', 'Pot lazım olan var mı? Pazar bedava!', 'Gg!', 'Bir sonraki arena maçı bende.', 'Pati izi bırakıyorum 🐾'],
    olum: ['Ah be!', 'Tekrar gelirim 😾', 'Güzel vuruştu!', 'Pot atmayı unuttum...'],
    zafer: ['Gg ez 😼', 'Bir tane daha!', 'Miyav!', 'Sıradaki?'],
  };

  var worlds = {}, seq = 9000000;
  function heightAt(x, z) { try { return window.__ko.state.heightAt(x, z) || 0; } catch (e) { return 0; } }
  function charRow() { try { var id = window.__ko.character.id; return T('characters').find(function (c) { return c.id == id; }) || null; } catch (e) { return null; } }

  function mkBot(W, o) {
    var combo = pick(COMBO[o.nation]), lv = clamp(Math.round(o.level), 1, 83), cl = CLS[combo[1]];
    var b = { id: ++seq, name: o.name, nation: o.nation, race: combo[0], cls: combo[1], face: 0, hair: 0, level: lv, role: o.role, arena: o.arena, home: o.home, x: o.x, z: o.z, yaw: rnd(0, 6.28), vx: 0, vz: 0, run: false, seq: 0,
      goal: null, tgt: null, atkT: 0, thinkT: nowS() + rnd(0, 1), potT: 0, hitT: 0, respT: 0, dead: false, sayT: nowS() + rnd(8, 40), healT: 0, lastPos: 0, lastMove: false, mode: 'idle' };
    b.max_hp = Math.round((80 + lv * 14 + 100) * cl.hp); b.hp = b.max_hp; b.def = lv * 0.8; b.atk = (5 + lv * 1.5) * cl.mul;
    b.mv = 'b' + b.id; b.y = heightAt(b.x, b.z);
    W.bots.push(b); W.byId[b.id] = b; return b;
  }
  var E = function (W, ev, pl) { HUB.emit(W.topic, ev, pl); };
  function sendMeta(W, b, ilk) {
    var m = { name: b.name, nation: b.nation, race: b.race, face: b.face, hair: b.hair, sr: null, cls: b.cls, level: b.level, gear: [], gmfx: false, mv: b.mv };
    E(W, 'meta', Object.assign({ id: String(b.id), m: m }, ilk ? { ilk: 1 } : {}));
  }
  function sendHp(W, b) { E(W, 'hp', { id: String(b.id), hp: Math.round(b.hp), max_hp: b.max_hp, dead: b.dead ? 1 : 0 }); }
  function sendPos(W, b) {
    b.y = heightAt(b.x, b.z);
    var pl = { id: String(b.id), s: ++b.seq, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), yaw: +b.yaw.toFixed(3), mv: b.mv };
    if (b.vx || b.vz) { pl.vx = +b.vx.toFixed(2); pl.vz = +b.vz.toFixed(2); pl.c = b.run ? 'run' : 'walk'; if (b.run) pl.r = 1; }
    E(W, 'pos', pl);
  }
  function say(W, b, text, shout) { E(W, 'chat', Object.assign({ id: String(b.id), name: b.name, text: text, nation: b.nation, x: +b.x.toFixed(1), z: +b.z.toFixed(1) }, shout ? { b: 1 } : {})); }

  // ---------------------------------------------------------------- dünya kurulumu
  function startWorld(zone) {
    if (worlds[zone] || OFF) return;
    var W = worlds[zone] = { zone: zone, topic: 'bolge:' + zone + ':k1', bots: [], byId: {}, t: 0, metaT: 0, hpT: 0, P: null, chatQ: [] };
    var ch = charRow(), plv = ch ? ch.level : 10, names = NAMES.slice().sort(function () { return Math.random() - 0.5; }), ni = 0;
    var nm = function () { return names[ni++ % names.length] + (ni > names.length ? ni : ''); };
    var lvl = function () { return clamp(plv + Math.round(rnd(-4, 6)), 3, 83); };
    if (zone === 'moradon') {
      // arena düellocuları (her arenada 3 bot, serbest PK)
      ARENAS.forEach(function (r, ai) { for (var i = 0; i < 3; i++) mkBot(W, { name: nm(), nation: i % 2 ? 1 : 2, level: lvl(), role: 'duel', arena: ai, x: rnd(r[0] + 8, r[1] - 8), z: rnd(r[2] + 8, r[3] - 8) }); });
      // pazar esnafı: 8 tezgâh, hepsi bedava
      for (var i = 0; i < 8; i++) { var b = mkBot(W, { name: nm(), nation: 1 + (i % 2), level: lvl(), role: 'merchant', x: 800 + (i % 4) * 11, z: 556 + Math.floor(i / 4) * 12 }); b.stall = i; }
      // sosyal gezginler
      for (var j = 0; j < 7; j++) mkBot(W, { name: nm(), nation: 1 + (j % 2), level: lvl(), role: 'social', x: rnd(790, 850), z: rnd(500, 545), home: [rnd(785, 855), rnd(495, 545)] });
    } else if (zone === 'freezone_a') {
      // CZ: her ulustan 9 bot — gruplar halinde devriye, kovalama, kaçma, pot, diriliş
      [1, 2].forEach(function (n) { for (var i = 0; i < 9; i++) { var g = GATE.freezone_a[n]; mkBot(W, { name: nm(), nation: n, level: lvl(), role: 'cz', x: g[0] + rnd(-12, 12), z: g[1] + (n === 1 ? 1 : -1) * rnd(6, 16), home: g }); } });
    }
    W.bots.forEach(function (b) { sendMeta(W, b, true); sendHp(W, b); sendPos(W, b); });
    W.timer = setInterval(function () { try { tick(W); } catch (e) { console.warn('bot tick', e); } }, 100);
    HUB.tap(W.topic, function (ev, p) {
      if (ev === 'kim' && p && W.byId[p.h]) { var b = W.byId[p.h]; setTimeout(function () { sendMeta(W, b, true); sendHp(W, b); sendPos(W, b); }, 30); }
      else if (ev === 'chat' && p && typeof p.text === 'string' && String(p.id) === String(W.P && W.P.id)) onPlayerChat(W, p);
    });
    if (zone === 'moradon') { setTimeout(function () { A.notify('merchant_stalls', 'INSERT', { id: 1 }, null); }, 800); setTimeout(function () { A.notify('merchant_stalls', 'INSERT', { id: 1 }, null); }, 4000); }   // pazar tezgâhları istemcide açılsın
    console.info('%cCatKo botları: ' + zone + ' (' + W.bots.length + ' bot)', 'color:#e8a25c');
  }

  function onPlayerChat(W, p) {
    var t = p.text.toLowerCase(), k = /selam|merhaba|\bhi\b|hello|naber|slm/.test(t) ? 'selam' : /pazar|market|shop|bedava|free/.test(t) ? 'pazar' : /pk|cz|savas|savaş|arena|duello|düello|fight/.test(t) ? 'pk' : /grup|party|takım|takim/.test(t) ? 'grup' : 'genel';
    var near = W.bots.filter(function (b) { return !b.dead && Math.hypot(b.x - p.x, b.z - p.z) < 60; });
    if (!near.length) near = W.bots.filter(function (b) { return !b.dead; });
    if (!near.length) return; var b = pick(near);
    setTimeout(function () { if (!b.dead) say(W, b, pick(SAY[k])); }, rnd(1200, 3200));
  }

  // ---------------------------------------------------------------- oyuncu görünümü (bot gözünden)
  function me(W) {
    var c = charRow(), pl; try { pl = window.__ko.player.position; } catch (e) { return null; }
    if (!c || !pl) return null;
    return { id: c.id, isP: true, name: c.name, nation: c.nation, level: c.level, x: pl.x, z: pl.z, hp: c.hp, max_hp: c.max_hp || 1, dead: !!c.dead, row: c };
  }
  var gateOf = function (W, n) { return (GATE[W.zone] || {})[n] || [800, 530]; };
  function safeFor(W, c) { if (W.zone !== 'freezone_a') return false; var g = gateOf(W, c.nation); return Math.hypot(c.x - g[0], c.z - g[1]) < 24; }   // kale kapısında spawn-camp yok
  function foe(W, a, c) {
    if (!c || c.dead || c === a) return false;
    if (W.zone === 'freezone_a') return a.nation !== c.nation && !safeFor(W, c);
    if (a.role !== 'duel') return false;
    if (c.isP) return inRect(ARENAS[a.arena], c.x, c.z);
    return c.role === 'duel' && c.arena === a.arena;
  }

  // ---------------------------------------------------------------- savaş
  function damageBot(W, b, dmg, killer) {   // killer: bot ya da oyuncu
    b.hp = Math.max(0, b.hp - dmg); b.hitT = nowS();
    if (b.hp <= 0 && !b.dead) die(W, b, killer);
    return b.hp;
  }
  function die(W, b, killer) {
    b.dead = true; b.hp = 0; b.tgt = null; b.goal = null; b.vx = b.vz = 0; b.respT = nowS() + (W.zone === 'freezone_a' ? 8 : 5);
    E(W, 'anim', { id: String(b.id), n: 'dead', h: 1 }); sendHp(W, b);
    if (Math.random() < 0.4) setTimeout(function () { say(W, b, pick(SAY.olum)); }, 600);
    if (killer && !killer.isP && Math.random() < 0.4) setTimeout(function () { say(W, killer, pick(SAY.zafer)); }, 900);
  }
  function respawn(W, b) {
    var g = b.home || (W.zone === 'moradon' && b.role === 'duel' ? null : gateOf(W, b.nation));
    if (g) { b.x = g[0] + rnd(-6, 6); b.z = g[1] + rnd(-6, 6); } else { var r = ARENAS[b.arena]; b.x = rnd(r[0] + 8, r[1] - 8); b.z = rnd(r[2] + 8, r[3] - 8); }
    if (window.KO_WORLD && window.KO_WORLD.zone === W.zone && window.KO_WORLD.blocked(b.x, b.z, 1)) unstick(window.KO_WORLD, b);
    b.dead = false; b.hp = b.max_hp; b.mode = 'idle'; b.goal = null; b.tgt = null; b.potT = 0;
    E(W, 'anim', { id: String(b.id), n: 'stopx' }); sendPos(W, b); sendHp(W, b);
  }
  var acCache = { t: 0, ac: 0 };
  function attack(W, b, t, now) {
    var cl = CLS[b.cls]; if (now < b.atkT) return; b.atkT = now + cl.cd * rnd(0.9, 1.15);
    E(W, 'anim', { id: String(b.id), n: 'a1' });
    var miss = Math.random() < 0.15, dmg = miss ? 0 : Math.max(1, Math.round(b.atk * rnd(0.75, 1.25)));
    if (t.isP) {
      var c = t.row; if (!c || c.dead) return; if (now - acCache.t > 3) { acCache.t = now; O.atkOf(c).then(function (s) { acCache.ac = s.ac; }, function () {}); }
      if (c.protect && c.protect > Date.now()) { dmg = 0; miss = true; }
      dmg = Math.round(dmg * 100 / (100 + acCache.ac * 0.5));
      c.hp = Math.max(0, c.hp - dmg); var dead = c.hp <= 0; if (dead) c.dead = true; A.save();
      E(W, 'pvp', { hedef: String(c.id), from: String(b.id), damage: dmg, miss: miss, hp: c.hp, max_hp: c.max_hp, dead: dead, ad: b.name, an: b.nation, npk: 0 });
      if (dead) { b.tgt = null; setTimeout(function () { say(W, b, pick(SAY.zafer)); }, 700); }
    } else {
      dmg = Math.round(dmg * 100 / (100 + t.def));
      var hp = damageBot(W, t, dmg, b);
      E(W, 'pvp', { hedef: String(t.id), from: String(b.id), damage: dmg, miss: miss, hp: Math.round(hp), max_hp: t.max_hp, dead: t.dead, ad: b.name, an: b.nation, npk: 0 });
      sendHp(W, t);
    }
  }

  // ---------------------------------------------------------------- yapay zekâ
  function cands(W, b, P) {
    var l = []; W.bots.forEach(function (c) { if (foe(W, b, c)) l.push(c); }); if (P && foe(W, b, P)) l.push(P); return l;
  }
  function think(W, b, P, now) {
    var cl = CLS[b.cls], hpf = b.hp / b.max_hp;
    if (b.role === 'merchant') { b.goal = null; if (now > b.sayT) { b.sayT = now + rnd(30, 70); say(W, b, pick(SAY.pazar), true); } return; }
    if (b.role === 'social') {
      if (now > b.sayT) { b.sayT = now + rnd(25, 80); say(W, b, pick(SAY.genel)); }
      if (!b.goal || Math.hypot(b.x - b.goal[0], b.z - b.goal[1]) < 1.5) { if (Math.random() < 0.5) b.goal = [b.home[0] + rnd(-25, 25), b.home[1] + rnd(-20, 20)]; else b.goal = null; }
      b.run = false; return;
    }
    var all = cands(W, b, P), near = all.filter(function (c) { return Math.hypot(c.x - b.x, c.z - b.z) < 50; });
    var foesNear = near.filter(function (c) { return Math.hypot(c.x - b.x, c.z - b.z) < 28; }).length;
    var alliesNear = W.bots.filter(function (c) { return c !== b && !c.dead && c.nation === b.nation && Math.hypot(c.x - b.x, c.z - b.z) < 28; }).length;
    // priest: dost iyileştirme
    if (cl.heal && now > b.healT) {
      var wounded = W.bots.filter(function (c) { return !c.dead && c.nation === b.nation && c.hp / c.max_hp < 0.6 && Math.hypot(c.x - b.x, c.z - b.z) < cl.rng; }).sort(function (x, y) { return x.hp / x.max_hp - y.hp / y.max_hp; })[0];
      if (wounded) { b.healT = now + 4; wounded.hp = Math.min(wounded.max_hp, wounded.hp + wounded.max_hp * 0.25); E(W, 'anim', { id: String(b.id), n: 'a1' }); sendHp(W, wounded); }
    }
    if (hpf < 0.3 && foesNear > 0) {   // kaç + pot
      b.mode = 'flee'; b.tgt = null; b.run = true; var g = b.home || gateOf(W, b.nation); b.goal = [g[0], g[1]];
      if (now > b.potT) drink(W, b, now);
      return;
    }
    if (hpf < 0.5 && foesNear === 0 && now > b.potT) drink(W, b, now);
    if (hpf < 0.7 && foesNear > alliesNear + 2) {   // az kaldık: gruba dön
      var al = W.bots.filter(function (c) { return c !== b && !c.dead && c.nation === b.nation; }).sort(function (x, y) { return Math.hypot(x.x - b.x, x.z - b.z) - Math.hypot(y.x - b.x, y.z - b.z); })[0];
      b.mode = 'regroup'; b.tgt = null; b.run = true; var h = al || { x: gateOf(W, b.nation)[0], z: gateOf(W, b.nation)[1] }; b.goal = [h.x, h.z]; return;
    }
    // hedef seçimi: yakın, zayıf, düşük canlı; mage/priest zırhsıza (düşük can) odaklanır
    var best = null, bs = 1e9;
    near.forEach(function (c) { var d = Math.hypot(c.x - b.x, c.z - b.z), s = d + (c.hp / c.max_hp) * 30 + Math.max(0, c.level - b.level) * 2 + (c.cls === 4 ? -10 : 0); if (s < bs) { bs = s; best = c; } });
    if (b.tgt && !b.tgt.dead && foe(W, b, b.tgt) && Math.hypot(b.tgt.x - b.x, b.tgt.z - b.z) < 55 && Math.random() < 0.75) best = b.tgt;   // hedefi çabuk değiştirme
    if (best) { b.tgt = best; b.mode = 'hunt'; b.run = true; if (now > b.sayT && Math.random() < 0.3) { b.sayT = now + rnd(40, 90); say(W, b, pick(SAY.pk)); } return; }
    b.tgt = null; b.mode = 'patrol'; b.run = false;
    if (W.zone === 'moradon') {   // arena: yerinde kal, ortada dolan
      if (!b.goal || Math.hypot(b.x - b.goal[0], b.z - b.goal[1]) < 2) { var r = ARENAS[b.arena]; b.goal = [rnd(r[0] + 6, r[1] - 6), rnd(r[2] + 6, r[3] - 6)]; }
    } else if (!b.goal || Math.hypot(b.x - b.goal[0], b.z - b.goal[1]) < 3) {   // CZ: kendi kapısından düşman kapısına doğru devriye
      var own = gateOf(W, b.nation), en = gateOf(W, 3 - b.nation), f = rnd(0.25, 0.75);
      if (P && !P.dead && !safeFor(W, P) && Math.random() < 0.4) { b.goal = [clamp(P.x + rnd(-45, 45), 20, 1000), clamp(P.z + rnd(-45, 45), 20, 1000)]; return; }   // oyuncunun olduğu bölgeye kayış (savaş çıksın)
      b.goal = [clamp(own[0] + (en[0] - own[0]) * f + rnd(-60, 60), 20, 1000), clamp(own[1] + (en[1] - own[1]) * f + rnd(-60, 60), 20, 1000)];
    }
  }
  function drink(W, b, now) {
    b.potT = now + 18; b.hp = Math.min(b.max_hp, b.hp + b.max_hp * 0.45); sendHp(W, b);
    if (Math.random() < 0.2) say(W, b, 'Pot!');
  }
  function unstick(Wd, b) {
    for (var r = 2; r <= 40; r += 2) for (var a = 0; a < 8; a++) {
      var x = b.x + Math.cos(a * 0.785) * r, z = b.z + Math.sin(a * 0.785) * r;
      if (!Wd.blocked(x, z, 1.0)) { b.x = x; b.z = z; return; }
    }
  }
  function step(W, b, P, now, dt) {
    if (b.dead) { if (now > b.respT) respawn(W, b); return; }
    if (now - b.hitT > 8 && b.hp < b.max_hp) b.hp = Math.min(b.max_hp, b.hp + b.max_hp * 0.015 * dt);
    if (now > b.thinkT) { b.thinkT = now + 0.35 + Math.random() * 0.3; think(W, b, P, now); }
    var cl = CLS[b.cls], gx = null, gz = null, stop = 0.5;
    if (b.tgt) {
      var t = b.tgt; if (t.isP && W.P) t = b.tgt = W.P; if (t.dead || !foe(W, b, t)) { b.tgt = null; }
      else {
        var d = Math.hypot(t.x - b.x, t.z - b.z); gx = t.x; gz = t.z; stop = cl.rng * 0.8; b.yaw = Math.atan2(t.x - b.x, t.z - b.z);
        if (d <= cl.rng) attack(W, b, t, now);
      }
    } else if (b.goal) { gx = b.goal[0]; gz = b.goal[1]; stop = 0.5; }
    b.vx = b.vz = 0;
    if (gx != null) {
      var dx = gx - b.x, dz = gz - b.z, dist = Math.hypot(dx, dz);
      if (dist > stop) {
        var sp = b.run ? 6.2 : 3.0, st = Math.min(sp * dt, dist - stop);
        var mx = dx / dist * st, mz = dz / dist * st, Wd = window.KO_WORLD, ok = true;
        if (Wd && Wd.zone === W.zone) {
          if (Wd.blocked(b.x, b.z, 0.3)) { unstick(Wd, b); }
          if (!Wd.blocked(b.x + mx, b.z + mz)) { b.x += mx; b.z += mz; }
          else if (!Wd.blocked(b.x + mx, b.z)) { b.x += mx; }
          else if (!Wd.blocked(b.x, b.z + mz)) { b.z += mz; }
          else { ok = false; b.stuck = (b.stuck || 0) + 1; if (b.stuck > 6) { b.stuck = 0; b.goal = null; if (b.tgt && Math.random() < 0.5) b.tgt = null; } }
          if (ok) b.stuck = 0;
        } else { b.x += mx; b.z += mz; }
        b.vx = ok ? dx / dist * sp : 0; b.vz = ok ? dz / dist * sp : 0;
        if (!b.tgt) b.yaw = Math.atan2(dx, dz);
      }
    }
    var moving = !!(b.vx || b.vz);
    if (moving ? now - b.lastPos > 0.1 : (b.lastMove || now - b.lastPos > 1)) { b.lastPos = now; sendPos(W, b); }
    b.lastMove = moving;
  }
  function tick(W) {
    if (window.__koYuklendi === false) return;
    var now = nowS(), P = me(W); W.P = P;
    W.bots.forEach(function (b) { step(W, b, P, now, 0.1); });
    if (now > W.metaT) { W.metaT = now + 4; W.bots.forEach(function (b) { sendMeta(W, b, false); }); }
    if (now > W.hpT) { W.hpT = now + 2; W.bots.forEach(function (b) { sendHp(W, b); }); }
  }

  // ---------------------------------------------------------------- başlatma: oyuncu bölge kanalına katılınca
  HUB.onsub.push(function (topic) {
    var m = /^bolge:([a-z_0-9]+):k1$/.exec(topic); if (!m || worlds[m[1]] || OFF) return;
    if (m[1] !== 'moradon' && m[1] !== 'freezone_a') return;
    var zone = m[1], tries = 0, iv = setInterval(function () {
      tries++; if (tries > 200) return clearInterval(iv);
      if (window.__ko && window.__ko.player && window.__koYuklendi !== false && charRow()) { clearInterval(iv); startWorld(zone); }
    }, 300);
  });

  // ---------------------------------------------------------------- RPC: PvP (bot hedefler)
  var skillsP = null; function skillList() { return (skillsP = skillsP || fetch(A.base + 'assets/yetenek/yetenekler.json').then(function (r) { return r.json(); }).then(function (j) { return j.yetenekler; }).catch(function () { return {}; })); }
  async function pvpHit(a, ctx, mult, skill) {
    var c = O.chOf(ctx, a.p_char); if (!c) return { ok: false, reason: 'Karakter yok' };
    var W = worlds[c.zone], b = W && W.byId[a.p_hedef]; if (!b) return { ok: false, reason: 'Hedef bulunamadı' };
    if (c.dead) return { ok: false, reason: 'ölü' }; if (b.dead) return { ok: false, reason: 'ölü' };
    var now = Date.now(); if (now < (c._pvpT || 0)) return { ok: false, reason: 'hizli' };
    if (Math.hypot(b.x - a.p_x, b.z - a.p_z) > 40) return { ok: false, reason: 'uzak' };
    var pv = { id: c.id, isP: true, nation: c.nation, x: a.p_x, z: a.p_z, hp: c.hp, max_hp: c.max_hp };
    if (W.zone === 'freezone_a' && b.nation === c.nation) return { ok: false, reason: 'Kendi ulusundan oyuncuya saldıramazsın.' };
    if (W.zone === 'moradon' && !(b.role === 'duel' && inRect(ARENAS[b.arena], a.p_x, a.p_z))) return { ok: false, reason: 'Burası PK alanı değil (arenaya gir).' };
    c._pvpT = now + 700;
    var st = await O.atkOf(c), miss = Math.random() < 0.1, dmg = miss ? 0 : Math.max(1, Math.round(st.atk * mult * rnd(0.8, 1.25) * 100 / (100 + b.def)));
    var np = null, was = b.dead; damageBot(W, b, dmg, pv); sendHp(W, b);
    b.tgt = null; b.hitT = nowS(); if (!was && !b.dead && (b.role === 'cz' || b.role === 'duel')) b.tgt = { isP: true, id: c.id, row: c, get x() { try { return window.__ko.player.position.x; } catch (e) { return 0; } }, get z() { try { return window.__ko.player.position.z; } catch (e) { return 0; } }, nation: c.nation, level: c.level, hp: c.hp, max_hp: c.max_hp, cls: 1, get dead() { return !!c.dead; } };
    var res = { ok: true, hedef: b.id, damage: dmg, miss: miss, hp: c.hp, max_hp: c.max_hp, mp: c.mp, max_mp: c.max_mp, dead: b.dead, hedef_hp: Math.round(b.hp), hedef_max_hp: b.max_hp, ad: b.name, genel: 0 };
    if (b.dead) { var kz = b.level * 30; O.giveExp(c, kz); c.ulus_puani = (c.ulus_puani || 0) + 25; np = { kazanc: 25, kayip: 0 }; res.np = np; res.exp = c.exp; res.level = c.level; if (Math.random() < 0.5) c.gold = (c.gold || 0) + b.level * 20; }
    ctx.save(); res.gold = c.gold; return res;
  }
  R.pvp_attack = function (a, ctx) { return pvpHit(a, ctx, 1, null); };
  R.pvp_skill = async function (a, ctx) {
    var S = (await skillList())[a.p_skill]; if (!S) return { ok: false, reason: 'Bilinmeyen beceri' };
    var r = await R.skill_use({ p_char: a.p_char, p_skill: a.p_skill }, ctx); if (!r || !r.ok) return r || { ok: false };
    if (/heal|recover|restore/i.test(S.en || '')) return Object.assign({}, r, { hedef: a.p_hedef, hedef_hp: r.hp, hedef_max_hp: r.max_hp, ad: S.ad, damage: 0, dead: false });
    var pct = /(\d+)%/.exec(S.en || ''), mult = pct ? Math.max(0.7, +pct[1] / 100) : 1.4, d = await pvpHit(a, ctx, mult, S);
    if (d && d.ok) { d.mp = r.mp; d.max_mp = r.max_mp; d.hp = r.hp; d.max_hp = r.max_hp; d.skill = S.id; }
    return d;
  };

  // ---------------------------------------------------------------- Pazar (bedava tezgâhlar)
  var STALL_ITEMS = null;
  async function stallItems() {
    if (STALL_ITEMS) return STALL_ITEMS;
    var st = await O.stock(), m = await O.items(), pots = st.filter(function (x) { return x.num >= 389900000 && x.num < 390000000; }), gear = st.filter(function (x) { return !(x.num >= 389900000 && x.num < 390000000); });
    var out = [];
    for (var s = 0; s < 8; s++) {
      var l = []; pots.slice(s % Math.max(1, pots.length), (s % Math.max(1, pots.length)) + 2).forEach(function (x) { l.push(x); });
      for (var k = 0; k < 5 && gear.length; k++) l.push(gear[(s * 7 + k * 11) % gear.length]);
      var seen = {}; l = l.filter(function (x) { if (seen[x.num]) return false; seen[x.num] = 1; return true; }).slice(0, 6);
      out.push(l.map(function (x, i) { var it = m.get(x.num); return { idx: i, item_num: x.num, count: it && it.countable ? 200 : 1, price: 0, kc: false }; }));
    }
    return (STALL_ITEMS = out);
  }
  var STITLE = ['CatKo Bedava Pazar 🐾', 'Her şey bedava!', 'Free Shop — al götür', 'Pati Market', 'Bedava pot & zırh', 'Kedi Esnafı', 'Mırr Pazarı', 'Hediye tezgâhı'];
  function stallBots() { var W = worlds.moradon; return W ? W.bots.filter(function (b) { return b.role === 'merchant'; }) : []; }
  A.VIRTUAL.merchant_stalls = async function () { return stallBots().map(function (b) { return { id: b.id, char_id: b.id, name: b.name, zone: 'moradon', server_id: null, x: b.x, z: b.z, baslik: STITLE[b.stall % STITLE.length], tur: 'sat', created_at: new Date().toISOString() }; }); };
  A.VIRTUAL.merchant_items = async function () { var si = await stallItems(), r = []; stallBots().forEach(function (b) { si[b.stall % si.length].forEach(function (x) { r.push(Object.assign({ char_id: b.id }, x)); }); }); return r; };
  A.VIRTUAL.alim_items = async function () { return []; };
  R.pazar_bak = function () { return { ok: true }; };
  R.pazar_al = async function (a, ctx) {
    var c = O.chOf(ctx, a.p_char), b = stallBots().find(function (x) { return x.id === a.p_satici; }); if (!c || !b) return { ok: false, reason: 'Pazar kapalı.' };
    if (Math.hypot(b.x - a.p_x, b.z - a.p_z) > 14) return { ok: false, reason: 'You are too far away from the merchant.' };
    var si = await stallItems(), m = si[b.stall % si.length].find(function (x) { return x.idx === a.p_idx; }), it = m && (await O.items()).get(m.item_num); if (!it) return { ok: false, reason: 'Item not found.' };
    var n = it.countable ? clamp(+a.p_count || 1, 1, 200) : 1;
    if (O.addItem(c, it, n) < 0) return { ok: false, reason: 'Your inventory is full.' };
    ctx.save(); return { ok: true, gold: c.gold, kc: false, cash: c.cash || 0, ad: it.name, adet: n };
  };

  // ---------------------------------------------------------------- Işınlanma (kapılar bedava; haritalar: Moradon + Ardream/CZ)
  var DEST = { moradon: ['moradon', 'Moradon'], folk: ['moradon', 'Moradon'], ardream: ['freezone_a', 'Ardream (CZ)'] };
  R.warp_git = function (a, ctx) {
    var c = O.chOf(ctx, a.p_char), d = DEST[a.p_hedef]; if (!c) return { ok: false, mesaj: 'Karakter yok' };
    if (!d) return { ok: false, mesaj: 'Bu bölge CatKo demo haritasında yok. Moradon ve Ardream (CZ) açık.' };
    var g = (GATE[d[0]] || GATE.moradon)[c.nation], x = g[0] + (d[0] === 'freezone_a' ? (c.nation === 1 ? 5 : -5) : 0), z = g[1] + (d[0] === 'freezone_a' ? (c.nation === 1 ? 8 : -8) : 6);
    c.zone = d[0]; c.x = x; c.z = z; ctx.save();
    return { ok: true, zone: d[0], ad: d[1], ucret: 0, x: x, z: z, gold: c.gold };
  };
  var oldRevive = R.revive;
  R.revive = function (a, ctx) {
    var c = O.chOf(ctx, a.p_char); if (c && c.zone === 'freezone_a') {
      O.stat(c); c.dead = false; c.hp = Math.round(c.max_hp * 0.6); c.mp = Math.round(c.max_mp * 0.6); c.protect = Date.now() + 5000;
      var g = GATE.freezone_a[c.nation], x = g[0] + (c.nation === 1 ? 5 : -5), z = g[1] + (c.nation === 1 ? 8 : -8); c.x = x; c.z = z; ctx.save();
      return { ok: true, hp: c.hp, mp: c.mp, x: x, z: z, zone: 'freezone_a', base: true };
    }
    return oldRevive(a, ctx);
  };
  R.town = oldRevive;
  window.KO_BOTS = { worlds: worlds, off: OFF };
  console.info('%cCatKo bot sistemi hazır' + (OFF ? ' (kapalı)' : ''), 'color:#e8a25c');
})();
