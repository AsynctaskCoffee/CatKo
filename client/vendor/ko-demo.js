/* KO Web · DEMO MODU — Supabase'siz çalışır.
 * window.supabase.createClient'ı tarayıcı içi sahte bir istemciyle değiştirir:
 *   - auth: hesaplar localStorage'da ('ko-demo-db'), oturum sahte JWT
 *   - from(): bellek içi tablolar (localStorage'a kaydedilir) + assets/ içindeki gerçek veriler (eşya tsv, mob/npc json)
 *   - rpc(): kayıtlı işlevler (aşağıda RPC); olmayan RPC {data:null,error:null} döner, konsola "[demo] rpc yok: …" yazar
 *   - channel()/realtime: tek oyunculu, boş ama hata vermeyen
 * Kapatmak (gerçek Supabase): adres ?gercek=1  ya da  localStorage.setItem('ko-gercek','1')
 */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search), ls = null;
  try { ls = window.localStorage; } catch (e) {}
  if (Q.get('gercek') === '1' || (ls && ls.getItem('ko-gercek') === '1')) return;
  if (Q.get('demo') === '0') return;
  window.KO_DEMO = true;

  var DBK = 'ko-demo-db-v1', LOG = !!(ls && ls.getItem('ko-demo-log'));
  var base = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/vendor\/[^\/]*$/, '') : location.href.replace(/[^\/]*$/, ''); })();
  var warn = function () { if (LOG || window.KO_DEMO_DEBUG) console.warn.apply(console, ['[demo]'].concat([].slice.call(arguments))); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  var uid = function () { return 'u-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); };

  // ---------------------------------------------------------------- veritabanı
  var DB;
  function load() {
    try { DB = JSON.parse(ls.getItem(DBK)); } catch (e) {}
    if (!DB || !DB.tables) DB = { users: [], seq: {}, tables: {} };
    var T = DB.tables;
    if (T.servers && T.servers[0] && T.servers[0].is_open === undefined) T.servers[0].is_open = true;
    if (!T.servers) T.servers = [{ id: 1, name: 'Ares', sort: 1, is_open: true, aktif: true, max_online: 1000 }];
    if (!T.race_bases) T.race_bases = [
      { race: 1, str: 65, sta: 65, dex: 60, intel: 50, cha: 50 }, { race: 2, str: 65, sta: 65, dex: 60, intel: 50, cha: 50 },
      { race: 11, str: 60, sta: 60, dex: 70, intel: 50, cha: 50 }, { race: 12, str: 60, sta: 60, dex: 70, intel: 50, cha: 50 },
      { race: 3, str: 60, sta: 60, dex: 60, intel: 55, cha: 50 }, { race: 4, str: 60, sta: 60, dex: 60, intel: 55, cha: 50 },
      { race: 13, str: 60, sta: 60, dex: 60, intel: 55, cha: 50 }, { race: 14, str: 60, sta: 60, dex: 60, intel: 55, cha: 50 },
      { race: 5, str: 60, sta: 60, dex: 60, intel: 60, cha: 50 }, { race: 6, str: 60, sta: 60, dex: 60, intel: 60, cha: 50 }];
    ['characters', 'profiles', 'inventory', 'gms', 'giris_duyuru', 'ranking', 'pm_mesaj', 'takas', 'level_up', 'kral'].forEach(function (t) { if (!T[t]) T[t] = []; });
    if (!T.giris_duyuru.length) T.giris_duyuru.push({ id: 1, sira: 1, baslik: 'KO Web Demo', metin: 'Bu sürüm Supabase olmadan, tarayıcı içi demo modunda çalışır. Veriler yalnızca bu tarayıcıda saklanır.' });
  }
  var saveT = null;
  function save() { try { ls.setItem(DBK, JSON.stringify(DB, function (k, v) { return k === 'mob_instances' ? undefined : v; })); } catch (e) { warn('kayıt başarısız', e); } }
  load();
  window.KO_DEMO_RESET = function () { try { ls.removeItem(DBK); ls.removeItem('ko-demo-oturum'); } catch (e) {} location.reload(); };
  var table = function (n) { return (DB.tables[n] = DB.tables[n] || []); };
  var nextId = function (n) { DB.seq[n] = (DB.seq[n] || table(n).reduce(function (m, r) { return Math.max(m, +r.id || 0); }, 0)) + 1; return DB.seq[n]; };

  // ---------------------------------------------------------------- eşya verisi (assets/esya/*.tsv)
  var ITEMS = null;   // Promise<Map(num→satır)>
  var DOSYALAR = ['kilic', 'balta', 'asa', 'mizrak', 'yay', 'kalkan', 'zirh', 'taki', 'iksir', 'diger'];
  function snake(s) { return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase(); }
  function itemsLoad() {
    if (ITEMS) return ITEMS;
    ITEMS = (async function () {
      var idx = await (await fetch(base + 'assets/esya/index.json')).json();
      var alan = idx.alanlar.map(function (a) { return a === 'strName' ? 'name' : a === 'Num' ? 'num' : snake(a); });
      var m = new Map();
      var dosyalar = (idx.dosyalar && idx.dosyalar.length ? idx.dosyalar : DOSYALAR).map(function (d) { return String(d).replace(/\.tsv$/, ''); });
      await Promise.all(dosyalar.map(async function (d) {
        try {
          var r = await fetch(base + 'assets/esya/' + d + '.tsv'); if (!r.ok) return;
          var t = await r.text(), ln = t.split('\n');
          for (var i = 0; i < ln.length; i++) {
            if (!ln[i]) continue; var c = ln[i].split('\t'), o = {};
            for (var k = 0; k < alan.length; k++) { var v = c[k]; o[alan[k]] = v === undefined || v === '' ? 0 : (isNaN(+v) ? v : +v); }
            o.name = c[1] || ''; o.org_num = o.org_num || Math.floor(o.num / 1000) * 1000;
            if (o.kind != null && o.item_type == null) o.item_type = o.kind;
            m.set(o.num, o);
          }
        } catch (e) { warn('eşya tsv', d, e); }
      }));
      return m;
    })();
    return ITEMS;
  }

  // ---------------------------------------------------------------- sorgu oluşturucu
  function getv(r, k) { return k.indexOf('.') < 0 ? r[k] : k.split('.').reduce(function (a, p) { return a == null ? a : a[p]; }, r); }
  function mkFilter(op, k, v) {
    return function (r) {
      var a = getv(r, k);
      switch (op) {
        case 'eq': return a == v || (typeof a === 'number' && typeof v === 'string' && String(a) === v);
        case 'neq': return a != v;
        case 'gt': return a > v; case 'gte': return a >= v; case 'lt': return a < v; case 'lte': return a <= v;
        case 'in': return v.some(function (x) { return x == a; });
        case 'is': return v === null ? a == null : a === v;
        case 'like': case 'ilike': var re = new RegExp('^' + String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', op === 'ilike' ? 'i' : ''); return re.test(String(a == null ? '' : a));
        case 'contains': return Array.isArray(a) && v.every(function (x) { return a.indexOf(x) >= 0; });
      }
      return true;
    };
  }
  var VIRTUAL = {};   // tablo adı → async () => satırlar (assets'ten gelen salt-okunur veri)
  var FK = { 'inventory.items': ['item_num', 'items', 'num'], 'mob_instances.monsters': ['sid', 'monsters', 'sid'], 'spawners.monsters': ['sid', 'monsters', 'sid'] };
  var allRows = async function (n) { return n === 'items' ? Array.from((await itemsLoad()).values()) : VIRTUAL[n] ? (await VIRTUAL[n]()) : table(n); };

  function Query(tname) {
    var q = { t: tname, mode: 'select', filters: [], order: [], lim: null, rng: null, single: null, payload: null, count: null, head: false, sel: '*', ret: false, onConflict: null };
    var self = {};
    ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'like', 'ilike', 'contains'].forEach(function (op) { self[op] = function (k, v) { q.filters.push(mkFilter(op, k, v)); return self; }; });
    self.not = function (k, op, v) { var f = mkFilter(op, k, v); q.filters.push(function (r) { return !f(r); }); return self; };
    self.or = function (s) {
      var parts = String(s).split(',').map(function (p) { var m = /^([^.]+)\.([a-z]+)\.(.*)$/.exec(p); if (!m) return function () { return true; }; var v = m[3]; if (m[2] === 'in') v = v.replace(/^\(|\)$/g, '').split(','); return mkFilter(m[2], m[1], v); });
      q.filters.push(function (r) { return parts.some(function (f) { return f(r); }); }); return self;
    };
    self.match = function (o) { Object.keys(o).forEach(function (k) { q.filters.push(mkFilter('eq', k, o[k])); }); return self; };
    self.filter = function (k, op, v) { q.filters.push(mkFilter(op, k, v)); return self; };
    self.textSearch = function () { return self; };
    self.order = function (k, o) { q.order.push([k, !(o && o.ascending === false)]); return self; };
    self.limit = function (n) { q.lim = n; return self; };
    self.range = function (a, b) { q.rng = [a, b]; return self; };
    self.select = function (cols, o) { if (q.mode === 'select' || !q.ret) { q.sel = cols || '*'; } q.ret = true; if (o && o.count) q.count = o.count; if (o && o.head) q.head = true; return self; };
    self.single = function () { q.single = 'single'; return self; };
    self.maybeSingle = function () { q.single = 'maybe'; return self; };
    self.csv = function () { return self; };
    self.abortSignal = function () { return self; };
    self.returns = function () { return self; };
    self.insert = function (p) { q.mode = 'insert'; q.payload = p; return self; };
    self.upsert = function (p, o) { q.mode = 'upsert'; q.payload = p; q.onConflict = o && o.onConflict; return self; };
    self.update = function (p) { q.mode = 'update'; q.payload = p; return self; };
    self.delete = function () { q.mode = 'delete'; return self; };
    self.then = function (a, b) { return run(q).then(a, b); };
    self.catch = function (f) { return run(q).catch(f); };
    self.finally = function (f) { return run(q).finally(f); };
    return self;
  }

  function embed(rows, sel) {
    // select('*, items(name,...)') → ilişkili tabloları ekle
    var m, re = /([a-z_]+)(?:!inner)?\(([^)]*)\)/g, out = rows;
    while ((m = re.exec(sel || ''))) {
      var rel = m[1];
      out = out.map(function (r) { return r; });
      (function (rel) {
        var fk = null; Object.keys(FK).forEach(function (k) { if (k.split('.')[1] === rel) fk = FK[k]; });
        if (!fk) return;
        out._pending = (out._pending || []).concat([[rel, fk]]);
      })(rel);
    }
    return out;
  }

  async function run(q) {
    try {
      await wait(0);
      if (window.KO_DEMO_API.hooks[q.t]) await window.KO_DEMO_API.hooks[q.t]();
      var rows;
      if (q.t === 'items') { var im = await itemsLoad(); rows = null; }
      if (q.mode === 'select') {
        if (q.t === 'items') rows = Array.from((await itemsLoad()).values());
        else if (VIRTUAL[q.t]) rows = (await VIRTUAL[q.t]()).slice();
        else rows = table(q.t).slice();
        rows = rows.filter(function (r) { return q.filters.every(function (f) { return f(r); }); });
        q.order.forEach(function (o) { }); for (var i = q.order.length - 1; i >= 0; i--) (function (o) { rows.sort(function (a, b) { var x = getv(a, o[0]), y = getv(b, o[0]); return (x > y ? 1 : x < y ? -1 : 0) * (o[1] ? 1 : -1); }); })(q.order[i]);
        var total = rows.length;
        if (q.rng) rows = rows.slice(q.rng[0], q.rng[1] + 1); else if (q.lim != null) rows = rows.slice(0, q.lim);
        // ilişkiler: select('*, monsters(*)') → ilişkili satır gömülür
        var re = /([a-z_]+)(?:!inner)?\(([^)]*)\)/g, mm;
        while ((mm = re.exec(q.sel || ''))) {
          var rel = mm[1], fk = FK[q.t + '.' + rel];
          if (fk) { var idx = new Map((await allRows(fk[1])).map(function (x) { return [x[fk[2]], x]; })); rows = rows.map(function (r) { var c = Object.assign({}, r); c[rel] = idx.get(r[fk[0]]) || null; return c; }); }
        }
        rows = clone(rows);
        if (q.head) return { data: null, error: null, count: total };
        return fin(q, rows, total);
      }
      var T = table(q.t), list = Array.isArray(q.payload) ? q.payload : [q.payload], res = [];
      if (q.mode === 'insert' || q.mode === 'upsert') {
        list.forEach(function (p) {
          p = clone(p);
          if (q.mode === 'upsert') {
            var keys = (q.onConflict || 'id').split(',').map(function (s) { return s.trim(); });
            var ex = T.find(function (r) { return keys.every(function (k) { return r[k] != null && r[k] == p[k]; }); });
            if (ex) { var o0 = clone(ex); Object.assign(ex, p); res.push(ex); notify(q.t, 'UPDATE', ex, o0); return; }
          }
          if (p.id == null && q.t !== 'profiles' && q.t !== 'gms') p.id = nextId(q.t);
          T.push(p); res.push(p); notify(q.t, 'INSERT', p, null);
        });
      } else if (q.mode === 'update') {
        T.forEach(function (r) { if (q.filters.every(function (f) { return f(r); })) { var o1 = clone(r); Object.assign(r, clone(q.payload)); res.push(r); notify(q.t, 'UPDATE', r, o1); } });
      } else if (q.mode === 'delete') {
        DB.tables[q.t] = T.filter(function (r) { if (q.filters.every(function (f) { return f(r); })) { res.push(r); notify(q.t, 'DELETE', null, r); return false; } return true; });
        if (q.t === 'characters') res.forEach(function (c) { DB.tables.inventory = table('inventory').filter(function (i) { return i.char_id !== c.id; }); });
      }
      save();
      return q.ret ? fin(q, clone(res), res.length) : { data: null, error: null, count: res.length };
    } catch (e) { warn('sorgu hatası', q.t, e); return { data: null, error: { message: String(e && e.message || e), code: 'DEMO' } }; }
  }
  function fin(q, rows, total) {
    if (q.single) {
      if (rows.length === 1 || (q.single === 'maybe' && rows.length <= 1)) return { data: rows[0] || null, error: null, count: total };
      if (q.single === 'maybe') return { data: null, error: { message: 'birden çok satır', code: 'PGRST116' } };
      return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    }
    return { data: rows, error: null, count: total };
  }

  // ---------------------------------------------------------------- auth
  var listeners = [];
  function sessionOf(u) { return u ? { access_token: 'demo.' + u.id, refresh_token: 'demo-r.' + u.id, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: pub(u) } : null; }
  function pub(u) { return { id: u.id, email: u.email, app_metadata: {}, user_metadata: u.meta || {}, aud: 'authenticated', role: 'authenticated', created_at: u.created || new Date().toISOString() }; }
  function emit(ev, s) { listeners.slice().forEach(function (f) { try { f(ev, s); } catch (e) { console.error(e); } }); }
  function mkAuth(opt) {
    var key = (opt && opt.auth && opt.auth.storageKey) || 'ko-demo-oturum';
    var store = (opt && opt.auth && opt.auth.storage) || ls;
    var persist = !(opt && opt.auth && opt.auth.persistSession === false);
    var mem = null;
    var cur = function () { if (!persist) return mem; try { var id = store.getItem(key); return id ? DB.users.find(function (u) { return u.id === id; }) || null : null; } catch (e) { return null; } };
    var set = function (u) { mem = u; if (persist) { try { u ? store.setItem(key, u.id) : store.removeItem(key); } catch (e) {} } };
    var A = {
      getSession: async function () { var u = cur(); return { data: { session: sessionOf(u) }, error: null }; },
      getUser: async function () { var u = cur(); return u ? { data: { user: pub(u) }, error: null } : { data: { user: null }, error: { message: 'Auth session missing!' } }; },
      onAuthStateChange: function (f) { listeners.push(f); setTimeout(function () { var u = cur(); f('INITIAL_SESSION', sessionOf(u)); }, 0); return { data: { subscription: { unsubscribe: function () { listeners = listeners.filter(function (x) { return x !== f; }); } } } }; },
      signUp: async function (a) {
        var em = String(a.email || '').toLowerCase().trim();
        if (!em || !a.password) return { data: { user: null, session: null }, error: { message: 'E-posta ve şifre gerekli', status: 400 } };
        if (DB.users.some(function (u) { return u.email === em; })) return { data: { user: null, session: null }, error: { message: 'User already registered', status: 422 } };
        var u = { id: uid(), email: em, pw: a.password, meta: (a.options && a.options.data) || {}, created: new Date().toISOString() };
        DB.users.push(u);
        var acc = (u.meta.account || u.meta.username || em.split('@')[0]);
        table('profiles').push({ id: u.id, account: acc, email: em, created_at: u.created });
        save(); set(u); emit('SIGNED_IN', sessionOf(u));
        return { data: { user: pub(u), session: sessionOf(u) }, error: null };
      },
      signInWithPassword: async function (a) {
        var em = String(a.email || '').toLowerCase().trim();
        var u = DB.users.find(function (x) { return x.email === em; });
        if (!u || u.pw !== a.password) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400 } };
        set(u); emit('SIGNED_IN', sessionOf(u)); return { data: { user: pub(u), session: sessionOf(u) }, error: null };
      },
      setSession: async function (s) {
        var id = String(s && s.access_token || '').replace(/^demo\./, ''), u = DB.users.find(function (x) { return x.id === id; });
        if (!u) return { data: { user: null, session: null }, error: { message: 'invalid session' } };
        set(u); emit('SIGNED_IN', sessionOf(u)); return { data: { user: pub(u), session: sessionOf(u) }, error: null };
      },
      refreshSession: async function () { var u = cur(); return { data: { user: u ? pub(u) : null, session: sessionOf(u) }, error: null }; },
      signOut: async function () { set(null); emit('SIGNED_OUT', null); return { error: null }; },
      updateUser: async function (a) { var u = cur(); if (!u) return { data: { user: null }, error: { message: 'Auth session missing!' } }; if (a.password) u.pw = a.password; if (a.email) u.email = String(a.email).toLowerCase(); if (a.data) u.meta = Object.assign(u.meta || {}, a.data); save(); return { data: { user: pub(u) }, error: null }; },
      resetPasswordForEmail: async function () { return { data: {}, error: null }; },
      exchangeCodeForSession: async function () { return { data: { session: null }, error: null } },
      verifyOtp: async function () { return { data: { session: null, user: null }, error: null }; },
    };
    A._cur = cur; return A;
  }

  // ---------------------------------------------------------------- RPC
  var RPC = (window.KO_DEMO_RPC = {});
  window.KO_DEMO_API = { hooks: {}, notify: function () { return notify.apply(null, arguments); }, allRows: function (n) { return allRows(n); }, DB: function () { return DB; }, save: save, table: table, nextId: nextId, itemsLoad: itemsLoad, VIRTUAL: VIRTUAL, RPC: RPC, clone: clone, base: base, warn: warn };
  function mkRpc(auth) {
    return function (name, args) {
      args = args || {};
      var p = (async function () {
        await wait(0);
        var u = auth._cur(), ctx = { user: u, uid: u && u.id, args: args, db: DB, T: table, save: save, nextId: nextId, items: itemsLoad };
        var f = RPC[name];
        if (!f) { warn('rpc yok:', name, args); return { data: null, error: null }; }
        try { var d = await f(args, ctx); return { data: d === undefined ? null : clone(d), error: null }; }
        catch (e) { return { data: null, error: { message: String(e && e.message || e), code: 'P0001' } }; }
      })();
      return p;
    };
  }

  // ---------------------------------------------------------------- realtime (yerel): postgres_changes + broadcast
  var PG = [];   // {event, table, filter(fn), cb}
  function notify(tbl, type, nw, old) {
    PG.slice().forEach(function (l) {
      if (l.table !== tbl && l.table !== '*') return; if (l.event !== '*' && l.event !== type) return;
      var row = nw || old; if (l.filter && !l.filter(row)) return;
      setTimeout(function () { try { l.cb({ schema: 'public', table: tbl, eventType: type, new: nw ? clone(nw) : {}, old: old ? clone(old) : {}, commit_timestamp: new Date().toISOString() }); } catch (e) { console.error(e); } }, 0);
    });
  }
  function mkChannel(name) {
    var ch = { topic: name, state: 'joined' }, bc = [];
    ch.on = function (kind, cfg, cb) {
      if (kind === 'postgres_changes' && cfg && cb) {
        var f = null, m = cfg.filter && /^([a-z_]+)=eq\.(.*)$/.exec(cfg.filter);
        if (m) f = function (r) { return r && String(r[m[1]]) === m[2]; };
        PG.push({ event: cfg.event || '*', table: cfg.table || '*', filter: f, cb: cb });
      } else if (kind === 'broadcast' && cb) bc.push({ ev: cfg && cfg.event, cb: cb });
      return ch;
    };
    ch.subscribe = function (cb) { if (cb) setTimeout(function () { cb('SUBSCRIBED'); }, 0); return ch; };
    ch.unsubscribe = async function () { return 'ok'; };
    ch.send = async function () { return 'ok'; };
    ch.track = async function () { return 'ok'; };
    ch.untrack = async function () { return 'ok'; };
    ch.presenceState = function () { return {}; };
    return ch;
  }

  function createClient(url, key, opt) {
    var auth = mkAuth(opt);
    var sb = {
      auth: auth,
      from: function (t) { return Query(t); },
      rpc: mkRpc(auth),
      channel: mkChannel,
      removeChannel: async function () { return 'ok'; }, removeAllChannels: async function () { return []; }, getChannels: function () { return []; },
      realtime: { setAuth: function () {}, disconnect: function () {}, connect: function () {}, onOpen: function () {}, onClose: function () {}, isConnected: function () { return true; } },
      functions: { invoke: async function (n) { warn('function yok:', n); return { data: null, error: null }; } },
      storage: { from: function (b) {
        return {
          getPublicUrl: function (p) { return { data: { publicUrl: base + 'zones/' + p } }; },
          download: async function (p) { try { var r = await fetch(base + 'zones/' + p); return r.ok ? { data: await r.blob(), error: null } : { data: null, error: { message: 'Object not found' } }; } catch (e) { return { data: null, error: { message: String(e) } }; } },
          list: async function () { return { data: [], error: null }; },
          upload: async function () { return { data: null, error: { message: 'Demo modunda yükleme yok' } }; },
          remove: async function () { return { data: [], error: null }; },
        };
      } },
    };
    return sb;
  }
  window.supabase = { createClient: createClient };
  console.info('%cKO Web · DEMO modu (Supabase yok) — sıfırlamak için KO_DEMO_RESET()', 'color:#d2ba5b');
})();
