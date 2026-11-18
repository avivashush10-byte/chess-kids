/* המסכים הראשיים: בחירת ילד, בית, מסלול הלמידה, חידות, הגדרות ואזור הורים. */
(function () {
  'use strict';
  var KC = window.KC, CT = KC.content, M = KC.media, S = KC.store, P = KC.pieces;
  var appEl = document.getElementById('app');
  var cleanup = null;
  var AVATARS = ['🦁', '🐯', '🦊', '🐼', '🐸', '🦄', '🐶', '🐱', '🐵', '🐰', '🐙', '🦖'];

  KC.mount = function (node, onLeave) {
    if (cleanup) { try { cleanup(); } catch (e) { /* כלום */ } }
    cleanup = onLeave || null;
    M.stop();
    appEl.innerHTML = '';
    appEl.appendChild(node);
    window.scrollTo(0, 0);
  };

  function applySettings() { M.set(S.data.settings); }

  /* ---------- מה פתוח ומה נעול ---------- */
  var flat = [];
  CT.worlds.forEach(function (w) { w.lessons.forEach(function (id) { flat.push(id); }); });

  function done(id) { return S.stars(id) > 0; }
  function all() { return S.data.settings.unlockAll; }
  function lessonOpen(id) { var i = flat.indexOf(id); return all() || i === 0 || done(flat[i - 1]); }
  function worldDone(wid) {
    var w = CT.worlds.filter(function (x) { return x.id === wid; })[0];
    return w.lessons.every(done);
  }
  function packOpen(p) { return all() || done(p.requires); }
  function gameOpen() { return all() || worldDone('w2'); }
  function lessonsDone() { return flat.filter(done).length; }

  /* ---------- בחירת שחקן ---------- */
  function profilesScreen() {
    var html = '<div class="screen center-screen"><div class="hero"><div class="hero-piece">' + P.svg('wN') + '</div>' +
      '<h1>ממלכת השחמט</h1><p class="sub">מי משחק היום?</p></div><div class="profiles">';
    S.data.profiles.forEach(function (p) {
      html += '<button class="profile-card" data-id="' + p.id + '"><span class="avatar">' + p.avatar + '</span>' +
        '<span class="pname">' + KC.esc(p.name) + '</span><span class="pstars">⭐ ' + S.totalStars(p) + '</span></button>';
    });
    html += '<button class="profile-card add" data-add="1"><span class="avatar">➕</span><span class="pname">שחקן חדש</span></button></div></div>';
    var root = KC.el(html);
    root.addEventListener('click', function (e) {
      var c = e.target.closest('.profile-card');
      if (!c) return;
      if (c.getAttribute('data-add')) return newProfile();
      S.data.current = c.getAttribute('data-id');
      S.save();
      M.sfx('good');
      homeScreen(true);
    });
    KC.mount(root);
  }

  function newProfile() {
    var chosen = AVATARS[S.data.profiles.length % AVATARS.length];
    var html = '<h2>שחקן חדש</h2><input class="name-input" type="text" maxlength="12" placeholder="איך קוראים לך?" autocomplete="off">' +
      '<div class="avatar-grid">' + AVATARS.map(function (a) {
        return '<button class="avatar-btn' + (a === chosen ? ' on' : '') + '" data-act="av" data-a="' + a + '">' + a + '</button>';
      }).join('') + '</div>' +
      '<div class="row"><button class="btn ghost" data-act="cancel">ביטול</button><button class="btn primary big" data-act="ok">יאללה! ◀</button></div>';
    var m = KC.modal(html, function (act, mod, target) {
      if (act === 'av') {
        chosen = target.getAttribute('data-a');
        mod.el.querySelectorAll('.avatar-btn').forEach(function (b) { b.classList.toggle('on', b === target); });
        M.sfx('tap');
      } else if (act === 'cancel') mod.close();
      else if (act === 'ok') {
        var input = mod.el.querySelector('.name-input');
        var name = input.value.trim();
        if (!name) { input.classList.add('shake'); input.focus(); setTimeout(function () { input.classList.remove('shake'); }, 500); return; }
        var p = { id: 'p' + Date.now(), name: name, avatar: chosen, stars: {}, wins: {} };
        S.data.profiles.push(p);
        S.data.current = p.id;
        S.save();
        mod.close();
        M.sfx('good');
        homeScreen(true);
      }
    });
    m.el.querySelector('.name-input').focus();
  }

  /* ---------- בית ---------- */
  function homeScreen(greet) {
    var p = S.profile();
    if (!p) return profilesScreen();
    var anyPack = CT.packs.some(packOpen);
    var cards = [
      { k: 'learn', emoji: '🗺️', title: 'לומדים', sub: lessonsDone() + ' מתוך ' + flat.length + ' שיעורים', open: true, cls: 'c-learn' },
      { k: 'puzzles', emoji: '🧩', title: 'חידות', sub: 'מט במהלך אחד ועוד', open: anyPack, cls: 'c-puzzle', why: 'החידות נפתחות אחרי שלומדים מה זה מט.' },
      { k: 'ai', emoji: '🤖', title: 'נגד המחשב', sub: 'משחק מלא', open: gameOpen(), cls: 'c-ai', why: 'קודם נלמד איך כל הכלים זזים, ואז נשחק!' },
      { k: 'friend', emoji: '👫', title: 'נגד חבר', sub: 'שניים על מכשיר אחד', open: gameOpen(), cls: 'c-friend', why: 'קודם נלמד איך כל הכלים זזים, ואז נשחק!' },
      { k: 'pawns', emoji: '⚔️', title: 'קרב רגלים', sub: 'משחק קצר וכיפי', open: all() || done('pawn'), cls: 'c-pawns', why: 'קרב הרגלים נפתח אחרי השיעור על הרגלי.' }
    ];
    var hello = 'שלום ' + p.name + '! מה נעשה היום?';
    var html = '<div class="screen">' +
      '<header class="topbar"><button class="chip" data-go="profiles"><span class="chip-av">' + p.avatar + '</span>' + KC.esc(p.name) + '</button>' +
      '<div class="chip gold">⭐ ' + S.totalStars() + '</div><span class="grow"></span>' +
      '<button class="icon-btn" data-go="settings" aria-label="הגדרות">⚙️</button></header>' +
      '<div class="bubble home-bubble"><div class="owl">🦉</div><p class="say-text">' + KC.esc(hello) + '</p></div>' +
      '<div class="menu-grid">';
    cards.forEach(function (c) {
      html += '<button class="menu-card ' + c.cls + (c.open ? '' : ' locked') + '" data-card="' + c.k + '">' +
        '<span class="menu-emoji">' + (c.open ? c.emoji : '🔒') + '</span><span class="menu-title">' + c.title + '</span>' +
        '<span class="menu-sub">' + c.sub + '</span></button>';
    });
    html += '</div></div>';
    var root = KC.el(html);
    var bubble = root.querySelector('.say-text');
    root.addEventListener('click', function (e) {
      var go = e.target.closest('[data-go]');
      if (go) {
        if (go.getAttribute('data-go') === 'profiles') profilesScreen(); else settingsModal();
        return;
      }
      var el = e.target.closest('[data-card]');
      if (!el) return;
      var c = cards.filter(function (x) { return x.k === el.getAttribute('data-card'); })[0];
      if (!c.open) { M.sfx('bad'); bubble.textContent = c.why; M.say(c.why); el.classList.add('shake'); setTimeout(function () { el.classList.remove('shake'); }, 500); return; }
      M.sfx('tap');
      if (c.k === 'learn') mapScreen();
      else if (c.k === 'puzzles') puzzlesScreen();
      else if (c.k === 'ai') levelModal();
      else KC.runGame({ mode: c.k, onExit: function () { homeScreen(); } });
    });
    KC.mount(root);
    if (greet) M.say(hello);
  }

  function levelModal() {
    var p = S.profile(), wins = (p && p.wins) || {};
    var info = { 1: 'המחשב משחק סתם, בלי לחשוב', 2: 'המחשב חושב קצת, ולפעמים טועה', 3: 'המחשב חושב היטב' };
    var html = '<h2>נגד מי משחקים?</h2><div class="level-list">';
    [1, 2, 3].forEach(function (l) {
      html += '<button class="level-btn l' + l + '" data-act="' + l + '"><b>' + KC.LEVELS[l] + '</b><span>' + info[l] + '</span>' +
        (wins['ai' + l] ? '<i>🏆 ' + wins['ai' + l] + '</i>' : '') + '</button>';
    });
    html += '</div><div class="row"><button class="btn ghost" data-act="x">חזרה</button></div>';
    M.say('נגד מי משחקים?');
    KC.modal(html, function (act, m) {
      m.close();
      if (act !== 'x') KC.runGame({ mode: 'ai', level: Number(act), onExit: function () { homeScreen(); } });
    });
  }

  /* ---------- מסלול הלמידה ---------- */
  function mapScreen() {
    var current = null;
    flat.forEach(function (id) { if (current === null && lessonOpen(id) && !done(id)) current = id; });
    var html = '<div class="screen"><header class="topbar"><button class="icon-btn" data-go="home" aria-label="הביתה">🏠</button>' +
      '<div class="title">מסלול הלמידה</div><div class="chip gold">⭐ ' + S.totalStars() + '</div></header><div class="map">';
    CT.worlds.forEach(function (w, wi) {
      html += '<section class="world" style="--wc:' + w.color + '"><h2><span>' + w.emoji + '</span> ' + (wi + 1) + '. ' + w.title + '</h2><div class="nodes">';
      w.lessons.forEach(function (id) {
        var L = CT.lessons[id], open = lessonOpen(id), st = S.stars(id);
        html += '<button class="node' + (open ? '' : ' locked') + (st ? ' done' : '') + (id === current ? ' current' : '') + '" data-lesson="' + id + '">' +
          '<span class="node-icon">' + (!open ? '🔒' : L.icon ? P.svg(L.icon) : L.emoji) + '</span>' +
          '<span class="node-title">' + L.title + '</span>' + KC.starRow(st) + '</button>';
      });
      html += '</div></section>';
    });
    html += '</div></div>';
    var root = KC.el(html);
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-go]')) return homeScreen();
      var n = e.target.closest('[data-lesson]');
      if (!n) return;
      var id = n.getAttribute('data-lesson');
      if (!lessonOpen(id)) { M.sfx('bad'); M.say('השיעור הזה עוד נעול. קודם מסיימים את השיעור שלפניו.'); n.classList.add('shake'); setTimeout(function () { n.classList.remove('shake'); }, 500); return; }
      M.sfx('tap');
      KC.runLesson(CT.lessons[id], { onExit: mapScreen, onDone: mapScreen });
    });
    KC.mount(root);
    var cur = root.querySelector('.node.current');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
  }

  /* ---------- חידות ---------- */
  function puzzlesScreen() {
    var html = '<div class="screen"><header class="topbar"><button class="icon-btn" data-go="home" aria-label="הביתה">🏠</button>' +
      '<div class="title">חידות</div><div class="chip gold">⭐ ' + S.totalStars() + '</div></header><div class="pack-list">';
    CT.packs.forEach(function (p) {
      var open = packOpen(p);
      html += '<button class="pack' + (open ? '' : ' locked') + '" style="--wc:' + p.color + '" data-pack="' + p.id + '">' +
        '<span class="pack-emoji">' + (open ? p.emoji : '🔒') + '</span><span class="pack-body"><b>' + p.title + '</b>' +
        '<span>' + (open ? p.steps.length + ' חידות' : 'נפתח אחרי השיעור "' + CT.lessons[p.requires].title + '"') + '</span></span>' + KC.starRow(S.stars(p.id)) + '</button>';
    });
    html += '</div></div>';
    var root = KC.el(html);
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-go]')) return homeScreen();
      var n = e.target.closest('[data-pack]');
      if (!n) return;
      var p = CT.packs.filter(function (x) { return x.id === n.getAttribute('data-pack'); })[0];
      if (!packOpen(p)) { M.sfx('bad'); n.classList.add('shake'); setTimeout(function () { n.classList.remove('shake'); }, 500); return; }
      M.sfx('tap');
      KC.runLesson(p, { onExit: puzzlesScreen, onDone: puzzlesScreen });
    });
    KC.mount(root);
  }

  /* ---------- הגדרות ואזור הורים ---------- */
  function toggleRow(key, label) {
    return '<button class="toggle-row' + (S.data.settings[key] ? ' on' : '') + '" data-act="t-' + key + '"><span>' + label + '</span><i></i></button>';
  }

  function settingsModal() {
    var html = '<h2>הגדרות</h2>' + toggleRow('sound', '🔔 צלילים') + toggleRow('voice', '🗣️ הקראה בקול') +
      '<div class="row"><button class="btn ghost" data-act="parents">🔒 אזור הורים</button><button class="btn primary" data-act="close">סגירה</button></div>';
    KC.modal(html, function (act, m, target) {
      if (act.indexOf('t-') === 0) {
        var k = act.slice(2);
        S.data.settings[k] = !S.data.settings[k];
        S.save(); applySettings();
        target.classList.toggle('on', S.data.settings[k]);
        M.sfx('tap');
        if (k === 'voice' && S.data.settings.voice) M.say('ההקראה פועלת');
      } else if (act === 'close') m.close();
      else if (act === 'parents') { m.close(); parentGate(); }
    });
  }

  function parentGate() {
    var a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
    var html = '<h2>אזור הורים</h2><p>כמה זה ' + a + ' × ' + b + '?</p><input class="name-input" type="number" inputmode="numeric">' +
      '<div class="row"><button class="btn ghost" data-act="x">ביטול</button><button class="btn primary" data-act="ok">כניסה</button></div>';
    var m = KC.modal(html, function (act, mod) {
      if (act === 'x') return mod.close();
      var input = mod.el.querySelector('input');
      if (Number(input.value) === a * b) { mod.close(); parentsModal(); }
      else { input.value = ''; input.classList.add('shake'); setTimeout(function () { input.classList.remove('shake'); }, 500); }
    });
    m.el.querySelector('input').focus();
  }

  function parentsModal() {
    var vs = M.voiceState();
    var voiceText = vs === 'he' ? '✅ נמצא קול עברי במכשיר.' : vs === 'none' ? '⚠️ הדפדפן הזה לא תומך בהקראה.' :
      '⚠️ לא נמצא קול עברי במכשיר. ההסברים יופיעו בכתב בלבד. אפשר להתקין קול עברי בהגדרות המכשיר (המרת טקסט לדיבור).';
    var rows = S.data.profiles.map(function (p) {
      var n = flat.filter(function (id) { return S.stars(id, p) > 0; }).length;
      return '<li><span>' + p.avatar + ' ' + KC.esc(p.name) + '</span><span>' + n + '/' + flat.length + ' שיעורים · ⭐ ' + S.totalStars(p) + '</span>' +
        '<button class="link danger" data-act="del" data-id="' + p.id + '">מחיקה</button></li>';
    }).join('');
    var html = '<h2>אזור הורים</h2><ul class="parent-list">' + (rows || '<li>אין עדיין שחקנים</li>') + '</ul>' +
      toggleRow('unlockAll', '🔓 לפתוח את כל השלבים') + toggleRow('helper', '🛡️ עוזר סכנות במשחק') +
      '<p class="note">' + voiceText + '</p><p class="note">ההתקדמות נשמרת במכשיר הזה בלבד.</p>' +
      '<div class="row"><button class="btn primary" data-act="close">סגירה</button></div>';
    KC.modal(html, function (act, m, target) {
      if (act.indexOf('t-') === 0) {
        var k = act.slice(2);
        S.data.settings[k] = !S.data.settings[k];
        S.save();
        target.classList.toggle('on', S.data.settings[k]);
      } else if (act === 'del') {
        var id = target.getAttribute('data-id');
        var p = S.data.profiles.filter(function (x) { return x.id === id; })[0];
        if (target.getAttribute('data-sure') !== '1') { target.setAttribute('data-sure', '1'); target.textContent = 'למחוק את ' + p.name + '? הקישו שוב'; return; }
        S.data.profiles = S.data.profiles.filter(function (x) { return x.id !== id; });
        if (S.data.current === id) S.data.current = null;
        S.save();
        m.close(); parentsModal();
      } else if (act === 'close') { m.close(); homeScreen(); }
    }, 'wide');
  }

  applySettings();
  if (S.profile()) homeScreen(); else profilesScreen();
})();
