/* סנכרון ההתקדמות עם השרת, ברקע. האפליקציה תמיד עובדת מהמכשיר; השרת רק ממזג בין מכשירים (ראו SYNC.md). */
(function () {
  'use strict';
  var KC = window.KC, S = KC.store, KEY = 'chessKids.sync';
  var host = location.hostname;
  // כשהאפליקציה מוגשת מהשרת עצמו (מקומית או ב-Render) פונים אליו ישירות; אחרת לכתובת שב-config.js
  var sameOrigin = host === 'localhost' || host === '127.0.0.1' || /\.onrender\.com$/.test(host);
  var base = sameOrigin ? '' : (KC.SYNC_URL ? String(KC.SYNC_URL).replace(/\/+$/, '') : null);
  var WAITS = [3000, 6000, 12000, 24000, 45000]; // שרת חינמי שנרדם מתעורר תוך כדקה
  var st = {};
  try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { st = {}; }
  var state = 'idle', timer = null, inflight = false, again = false, tries = 0, rev = 0, syncedRev = -1;

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* מצב פרטי */ } }
  function local() { return { profiles: S.data.profiles, deleted: S.data.deleted || {} }; }
  function setState(s) {
    if (state === s) return;
    state = s;
    if (api.onState) api.onState(s);
  }

  function call(path, body, token, keepalive) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 70000);
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(base + path, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined, keepalive: !!keepalive })
      .then(function (r) {
        return r.json().then(function (j) { return j; }, function () { return null; }).then(function (j) { clearTimeout(t); return { status: r.status, body: j }; });
      }, function (e) { clearTimeout(t); throw e; });
  }

  // ממזג את מה שחזר מהשרת עם מה שיש עכשיו במכשיר. מחזיר true אם משהו השתנה על המסך.
  function apply(doc) {
    var before = JSON.stringify(local()) + '|' + S.data.current;
    var m = KC.mergeDocs(local(), doc);
    var cur = S.data.current;
    if (cur && m.alias[cur]) cur = m.alias[cur];
    if (cur && !m.profiles.some(function (p) { return p.id === cur; })) cur = null;
    S.data.profiles = m.profiles;
    S.data.deleted = m.deleted;
    S.data.current = cur;
    S.save(true);
    return JSON.stringify(local()) + '|' + cur !== before;
  }

  function push(keepalive) {
    if (!api.linked()) return;
    if (inflight) { again = true; return; }
    clearTimeout(timer); timer = null;
    inflight = true;
    var sentRev = rev;
    setState('busy');
    call('/api/sync', local(), st.token, keepalive === true).then(function (r) {
      inflight = false;
      if (r.status === 200 && r.body && r.body.doc) {
        tries = 0;
        var changed = apply(r.body.doc);
        st.at = Date.now(); persist();
        if (rev === sentRev) syncedRev = rev;
        setState('ok');
        if (changed && api.onChange) api.onChange();
        if (again || rev !== sentRev) { again = false; touchTimer(); }
      } else if (r.status === 401) {
        // הקוד הוחלף בשרת: מתנתקים, ההתקדמות נשארת במכשיר
        st = { bad: true }; persist();
        setState('idle');
        if (api.onChange) api.onChange();
      } else retry();
    }, function () { inflight = false; retry(); });
  }

  function retry() {
    again = false;
    setState('offline');
    if (tries < WAITS.length) { clearTimeout(timer); timer = setTimeout(push, WAITS[tries++]); }
  }
  function touchTimer() { clearTimeout(timer); timer = setTimeout(push, 2000); }

  var api = KC.sync = {
    enabled: base !== null,
    onChange: null,
    onState: null,
    linked: function () { return base !== null && !!st.token; },
    state: function () { return state; },
    lastAt: function () { return st.at || 0; },
    needsCode: function () { return !!st.bad; },

    // נקרא בכל שמירה במכשיר: שולחים לשרת קצת אחרי, כדי לאגד כמה שינויים יחד
    touch: function () {
      rev++;
      if (!api.linked()) return;
      tries = 0;
      touchTimer();
    },
    now: function () { tries = 0; push(); },

    // חיבור המכשיר עם קוד המשפחה. cb מקבל: 'ok' | 'badcode' | 'wait' | 'offline', ו-'waking' בזמן שמנסים שוב
    link: function (code, cb) {
      var n = 0;
      (function attempt() {
        call('/api/login', { code: code }).then(function (r) {
          if (r.status === 200 && r.body && r.body.token) {
            st = { token: r.body.token }; persist();
            syncedRev = -1;
            cb('ok');
            api.now();
          } else if (r.status === 401) cb('badcode');
          else if (r.status === 429) cb('wait');
          else again2();
        }, again2);
        function again2() {
          if (n >= 5) return cb('offline');
          cb('waking');
          setTimeout(attempt, WAITS[n++]);
        }
      })();
    },
    unlink: function () { clearTimeout(timer); st = {}; persist(); setState('idle'); },

    start: function () {
      if (base === null) return;
      document.addEventListener('visibilitychange', function () {
        if (!api.linked()) return;
        if (document.visibilityState === 'visible') api.now();
        else if (rev !== syncedRev && !inflight) push(true); // יוצאים מהאפליקציה: שולחים מה שעוד לא נשלח
      });
      if (api.linked()) api.now();
    }
  };
})();
