/* מיזוג התקדמות בין מכשירים. אותו קוד רץ בדפדפן ובשרת (ראו SYNC.md).
   הכלל: אף פעם לא מאבדים התקדמות, והתוצאה לא תלויה בסדר ולא משתנה במיזוג חוזר. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var KC = root.KC = root.KC || {};
  var MAX_PROFILES = 12, MAX_KEYS = 200, MAX_T = 9e15;

  function num(v, lo, hi) {
    v = Math.floor(Number(v));
    return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
  }
  function okKey(k) { return /^[A-Za-z0-9_-]{1,40}$/.test(k) && k !== '__proto__' && k !== 'constructor' && k !== 'prototype'; }
  function isMap(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function cleanMap(src, fn) {
    var out = {}, n = 0;
    if (isMap(src)) Object.keys(src).sort().forEach(function (k) {
      if (n >= MAX_KEYS || !okKey(k)) return;
      var v = fn(src[k]);
      if (v !== null) { out[k] = v; n++; }
    });
    return out;
  }
  function positive(max) { return function (v) { v = num(v, 0, max); return v > 0 ? v : null; }; }

  function cleanProfile(p) {
    if (!isMap(p)) return null;
    var id = String(p.id || ''), name = String(p.name || '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();
    if (!okKey(id) || !name) return null;
    return {
      id: id, name: name, avatar: String(p.avatar || '🙂').slice(0, 8),
      stars: cleanMap(p.stars, positive(3)),
      wins: cleanMap(p.wins, positive(100000)),
      resume: cleanMap(p.resume, function (r) { return isMap(r) ? { i: num(r.i, 0, 500), m: num(r.m, 0, 10000), t: num(r.t, 0, MAX_T) } : null; })
    };
  }

  function clean(doc) {
    var out = { profiles: [], deleted: {} };
    if (!isMap(doc)) return out;
    out.deleted = cleanMap(doc.deleted, positive(MAX_T));
    if (Array.isArray(doc.profiles)) doc.profiles.forEach(function (p) {
      p = cleanProfile(p);
      if (p) out.profiles.push(p);
    });
    return out;
  }

  // המזהה נוצר מהשעה שבה נוצר הפרופיל ('p' + זמן), ולכן המזהה הקטן הוא הוותיק
  function idTime(id) { var m = /^p(\d+)$/.exec(id); return m ? Number(m[1]) : Infinity; }
  function before(a, b) { var ta = idTime(a), tb = idTime(b); return ta !== tb ? ta < tb : a < b; }
  function newer(x, y) { return x.t !== y.t ? x.t > y.t : x.i !== y.i ? x.i > y.i : x.m >= y.m; }
  function maxMap(a, b) {
    var out = {};
    Object.keys(a).concat(Object.keys(b)).sort().forEach(function (k) { out[k] = Math.max(a[k] || 0, b[k] || 0); });
    return out;
  }
  function join(keep, other) {
    var resume = {};
    Object.keys(keep.resume).concat(Object.keys(other.resume)).sort().forEach(function (k) {
      var x = keep.resume[k], y = other.resume[k];
      resume[k] = !y ? x : !x ? y : newer(x, y) ? x : y;
    });
    return { id: keep.id, name: keep.name, avatar: keep.avatar, stars: maxMap(keep.stars, other.stars), wins: maxMap(keep.wins, other.wins), resume: resume };
  }

  /* מחזיר { profiles, deleted, alias }. alias = מזהים שהתמזגו לתוך מזהה אחר (אותו שם = אותו ילד). */
  KC.mergeDocs = function (a, b) {
    a = clean(a); b = clean(b);
    var deleted = maxMap(a.deleted, b.deleted);
    var byName = {}, alias = {};
    a.profiles.concat(b.profiles).forEach(function (p) {
      if (deleted[p.id]) return;
      var k = p.name.toLowerCase(), cur = byName[k];
      if (!cur) { byName[k] = p; return; }
      var keep = cur.id === p.id || before(cur.id, p.id) ? cur : p, drop = keep === cur ? p : cur;
      byName[k] = join(keep, drop);
      if (drop.id !== keep.id) alias[drop.id] = keep.id;
    });
    Object.keys(alias).forEach(function (k) {
      var to = alias[k], guard = 0;
      while (alias[to] && guard++ < 20) to = alias[to];
      alias[k] = to;
    });
    var profiles = Object.keys(byName).map(function (k) { return byName[k]; });
    profiles.sort(function (x, y) { return x.id === y.id ? 0 : before(x.id, y.id) ? -1 : 1; });
    return { profiles: profiles.slice(0, MAX_PROFILES), deleted: deleted, alias: alias };
  };
})();
