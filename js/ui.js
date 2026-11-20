/* עזרי ממשק: שמירת התקדמות, חלונות, קונפטי, ושלד מסך הלוח. */
(function () {
  'use strict';
  var KC = window.KC = window.KC || {};

  KC.el = function (html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  KC.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  KC.pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };

  /* ---------- שמירה במכשיר ---------- */
  var KEY = 'chessKids.v1';
  var data = null;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
  if (!data || !Array.isArray(data.profiles)) data = { profiles: [], current: null, settings: {} };
  if (!data.settings || typeof data.settings !== 'object') data.settings = {};
  if (!data.deleted || typeof data.deleted !== 'object') data.deleted = {}; // ילדים שנמחקו (כדי שלא יחזרו ממכשיר אחר)
  var defaults = { sound: true, voice: true, helper: true, unlockAll: false };
  Object.keys(defaults).forEach(function (k) { if (data.settings[k] === undefined) data.settings[k] = defaults[k]; });

  KC.store = {
    data: data,
    // quiet = שמירה במכשיר בלבד, בלי לבקש סנכרון (משמש את הסנכרון עצמו)
    save: function (quiet) {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* מצב פרטי - לא נשמר */ }
      if (!quiet && KC.sync) KC.sync.touch();
    },
    removeProfile: function (id) {
      data.profiles = data.profiles.filter(function (x) { return x.id !== id; });
      data.deleted[id] = Date.now();
      if (data.current === id) data.current = null;
      this.save();
    },
    profile: function () {
      for (var i = 0; i < data.profiles.length; i++) if (data.profiles[i].id === data.current) return data.profiles[i];
      return null;
    },
    stars: function (id, p) { p = p || this.profile(); return (p && p.stars && p.stars[id]) || 0; },
    setStars: function (id, n) {
      var p = this.profile();
      if (!p) return;
      p.stars = p.stars || {};
      if (n > (p.stars[id] || 0)) p.stars[id] = n;
      this.save();
    },
    /* איפה הילד עצר באמצע שיעור: { i: מספר הצעד, m: טעויות עד כה, t: מתי } */
    resume: function (id, p) {
      p = p || this.profile();
      var r = p && p.resume && p.resume[id];
      return r && r.i > 0 ? r : null;
    },
    // i = 0 פירושו "אין מקום שמור" (סיימו או התחילו מחדש). נשמר עם זמן, כדי שמקום ישן ממכשיר אחר לא יחזור.
    setResume: function (id, i, m) {
      var p = this.profile();
      if (!p) return;
      p.resume = p.resume || {};
      if (!(i > 0) && !p.resume[id]) return;
      p.resume[id] = { i: i > 0 ? i : 0, m: i > 0 ? (m || 0) : 0, t: Date.now() };
      this.save();
    },
    totalStars: function (p) {
      p = p || this.profile();
      var t = 0;
      if (p && p.stars) Object.keys(p.stars).forEach(function (k) { t += p.stars[k]; });
      return t;
    },
    addWin: function (key) {
      var p = this.profile();
      if (!p) return;
      p.wins = p.wins || {};
      p.wins[key] = (p.wins[key] || 0) + 1;
      this.save();
    }
  };

  /* ---------- חלון קופץ ---------- */
  KC.modal = function (html, on, cls) {
    var wrap = KC.el('<div class="modal-wrap"><div class="modal ' + (cls || '') + '">' + html + '</div></div>');
    document.body.appendChild(wrap);
    var api = { el: wrap, close: function () { wrap.remove(); } };
    wrap.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]');
      if (a && on) on(a.getAttribute('data-act'), api, a);
    });
    return api;
  };

  KC.confetti = function () {
    var box = KC.el('<div class="confetti"></div>');
    var bits = ['⭐', '🎉', '✨', '🌟', '🎊', '💜'];
    for (var i = 0; i < 36; i++) {
      var s = document.createElement('span');
      s.textContent = bits[i % bits.length];
      s.style.left = Math.random() * 100 + '%';
      s.style.animationDelay = Math.random() * 0.7 + 's';
      s.style.fontSize = 18 + Math.random() * 22 + 'px';
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 3200);
  };

  KC.starRow = function (n, cls) {
    var h = '<span class="star-row ' + (cls || '') + '">';
    for (var i = 1; i <= 3; i++) h += '<i class="' + (i <= n ? 'on' : '') + '">★</i>';
    return h + '</span>';
  };

  /* ---------- שלד מסך הלוח (משותף לשיעורים ולמשחק) ---------- */
  KC.stageHTML = function (side) {
    return '<div class="stage">' +
      '<div class="bubble"><div class="owl">🦉</div><p class="say-text"></p><button class="icon-btn speak" data-x="speak" aria-label="השמע שוב">🔊</button></div>' +
      '<div class="board-wrap"><div class="board-frame"><div class="board"></div></div></div>' +
      (side || '') +
      '<div class="actions"></div></div>';
  };

  KC.pickPromo = function (color, cb) {
    var html = '<h2>במה לבחור?</h2><div class="promo-row">';
    ['Q', 'R', 'B', 'N'].forEach(function (t) {
      html += '<button class="promo-btn" data-act="' + t + '">' + KC.pieces.svg(color + t) + '<span>' + KC.NAMES[t] + '</span></button>';
    });
    html += '</div>';
    KC.media.say('במה לבחור?');
    KC.modal(html, function (act, m) { m.close(); cb(act); });
  };
})();
