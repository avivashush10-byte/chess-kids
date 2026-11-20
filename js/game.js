/* משחק מלא: מול המחשב, מול חבר על אותו מכשיר, או "קרב רגלים". כולל עוזר שמלמד לצפות את היריב. */
(function () {
  'use strict';
  var KC = window.KC, C = KC.chess, M = KC.media;
  var PAWNS = '8/pppppppp/8/8/8/8/PPPPPPPP/8 w - - 0 1';
  var LEVELS = { 1: '🐣 קל', 2: '🦊 בינוני', 3: '🦁 קשה' };

  KC.runGame = function (opts) {
    var friend = opts.mode === 'friend', pawns = opts.mode === 'pawns';
    var level = opts.level || 1;
    var title = friend ? '👫 שני שחקנים' : pawns ? '⚔️ קרב רגלים' : '🤖 ' + LEVELS[level];
    var root = KC.el('<div class="screen play-screen">' +
      '<header class="topbar"><button class="icon-btn" data-x="exit" aria-label="יציאה">✕</button>' +
      '<div class="title">' + title + '</div>' +
      '<button class="chip toggle" data-x="helper"></button></header>' +
      KC.stageHTML('<div class="side"><div class="cap-row" data-c="w"></div><div class="cap-row" data-c="b"></div></div>') +
      '</div>');

    var s, hist, last, captured, sel = null, moves = [], busy = false, thinking = false, over = false;
    var aiTimer = null, endTimer = null, hintLevel = 0, lastText = '', firstTurn = true;
    var helper = KC.store.data.settings.helper;
    var view = new KC.BoardView(root.querySelector('.board'), onTap);
    var actions = root.querySelector('.actions'), textEl = root.querySelector('.say-text');
    var helperBtn = root.querySelector('[data-x="helper"]');

    function setText(t, quiet) { lastText = t; textEl.textContent = t; if (!quiet) M.say(t); }
    function isAI(color) { return !friend && color === 'b'; }
    function val(p) { return C.VALUE[p.charAt(1)]; }

    function drawHelper() {
      helperBtn.textContent = '🛡️ עוזר: ' + (helper ? 'פועל' : 'כבוי');
      helperBtn.classList.toggle('on', helper);
    }

    root.addEventListener('click', function (e) {
      var x = e.target.closest('[data-x]');
      if (!x) return;
      var k = x.getAttribute('data-x');
      if (k === 'exit') { clearTimeout(aiTimer); clearTimeout(endTimer); opts.onExit(); }
      else if (k === 'speak') M.say(lastText);
      else if (k === 'helper') {
        helper = !helper;
        KC.store.data.settings.helper = helper;
        KC.store.save();
        drawHelper();
        setText(helper ? 'העוזר פועל: אני אזהיר אתכם כשכלי בסכנה.' : 'העוזר כבוי. עכשיו אתם לבד!');
        if (!busy && !thinking && !over) { deselect(); baseMarks(); if (helper) showThreat(true); }
      }
    });

    function btn(label, cls, fn) {
      var b = KC.el('<button class="btn ' + cls + '">' + label + '</button>');
      b.addEventListener('click', fn);
      actions.appendChild(b);
    }
    btn('💡 רמז', 'ghost', hint);
    btn('↩️ מהלך אחורה', 'ghost', undo);
    btn('🔄 חדש', 'ghost', function () {
      if (!hist.length) return;
      KC.modal('<div class="big-emoji">🔄</div><h2>להתחיל משחק חדש?</h2><div class="row"><button class="btn ghost" data-act="no">לא</button><button class="btn primary" data-act="yes">כן</button></div>',
        function (act, m) { m.close(); if (act === 'yes') reset(); });
    });

    function reset() {
      clearTimeout(aiTimer);
      clearTimeout(endTimer);
      s = C.fromFEN(pawns ? PAWNS : C.START);
      hist = []; last = null; captured = { w: [], b: [] };
      sel = null; moves = []; busy = false; thinking = false; over = false; firstTurn = true;
      view.reset(); view.setBoard(s.board);
      drawCaptured();
      startTurn();
    }

    function drawCaptured() {
      ['w', 'b'].forEach(function (c) {
        var row = root.querySelector('[data-c="' + c + '"]');
        var label = friend ? (c === 'w' ? 'הלבן אכל:' : 'השחור אכל:') : (c === 'w' ? 'אכלתם:' : 'אכלו לכם:');
        var list = captured[c].slice().sort(function (a, b) { return val(b) - val(a); });
        var pts = 0;
        list.forEach(function (p) { pts += val(p); });
        row.innerHTML = '<span class="cap-label">' + label + '</span><span class="cap-pieces">' +
          list.map(function (p) { return KC.pieces.svg(p); }).join('') + '</span>' + (pts ? '<span class="cap-pts">' + pts + '</span>' : '');
      });
    }

    function baseMarks() {
      view.reset();
      if (last) { view.mark(last.from, 'last'); view.mark(last.to, 'last'); }
      if (C.inCheck(s)) view.mark(C.findKing(s.board, s.turn), 'check');
    }

    // מראה לילד מה היריב מאיים לאכול. מחזיר טקסט או null.
    function showThreat(quiet) {
      var th = C.threats(s.board, s.turn).filter(function (t) { return val(t.piece) >= 3; });
      if (!th.length) return null;
      var t = th[0], a = t.attackers[0];
      view.mark(t.sq, 'danger');
      view.setArrows([[a, t.sq, 'red']]);
      var at = s.board[a].charAt(1), vt = t.piece.charAt(1);
      var msg = friend
        ? 'שימו לב! ' + KC.THE[vt] + ' בסכנה.'
        : 'שימו לב! ' + KC.THE[at] + ' שלי ' + (at === 'Q' ? 'מאיימת' : 'מאיים') + ' על ' + KC.THE[vt] + ' שלכם.';
      if (!quiet) setText(msg);
      return msg;
    }

    function startTurn() {
      baseMarks();
      hintLevel = 0;
      var st = C.status(s), k = C.key(s), rep = 1;
      hist.forEach(function (h) { if (C.key(h.s) === k) rep++; });
      if (pawns) {
        if (!st.moves.length) return end('draw', 'אף אחד לא יכול לזוז. תיקו!');
      } else {
        if (st.mate) return end(C.other(s.turn));
        if (st.stalemate) return end('draw', 'פט! אין מהלכים, אז זה תיקו.');
        if (st.insufficient) return end('draw', 'נשארו מעט מדי כלים. תיקו!');
        if (rep >= 3 || s.half >= 100) return end('draw', 'המשחק חוזר על עצמו. תיקו!');
      }
      if (isAI(s.turn)) {
        thinking = true;
        setText(st.check ? 'שח! עכשיו אני צריך להציל את המלך שלי…' : 'אני חושב…', !st.check);
        if (st.check) M.sfx('check');
        aiTimer = setTimeout(aiPlay, 750);
        return;
      }
      var who = friend ? (s.turn === 'w' ? 'תור הלבן ⚪' : 'תור השחור ⚫') : null;
      if (st.check) {
        M.sfx('check');
        setText('שח! ' + (friend ? 'המלך ' + (s.turn === 'w' ? 'הלבן' : 'השחור') : 'המלך שלכם') + ' בסכנה. הצילו אותו!');
      } else if (!(helper && showThreat())) {
        if (firstTurn) setText(pawns ? 'קרב רגלים! מי שמגיע ראשון עם רגלי לצד השני, מנצח.' : friend ? 'הלבן מתחיל. בהצלחה לשניכם!' : 'אתם הלבנים, ואתם מתחילים. בהצלחה!');
        else setText(who || 'תורכם!', true);
      }
      firstTurn = false;
    }

    function aiPlay() {
      thinking = false;
      var mv = pawns ? C.bestMove(s, 2, 40) : C.aiMove(s, level);
      if (mv) commit(mv);
    }

    function commit(mv) {
      hist.push({ s: s, last: last, cap: { w: captured.w.slice(), b: captured.b.slice() } });
      var color = mv.piece.charAt(0), after = C.applyMove(s, mv);
      if (mv.captured) captured[color].push(mv.captured);
      var list = [{ from: mv.from, to: mv.to }];
      if (mv.flag === 'castleK') list.push({ from: mv.to + 1, to: mv.to - 1 });
      if (mv.flag === 'castleQ') list.push({ from: mv.to - 2, to: mv.to + 1 });
      busy = true; sel = null; moves = [];
      view.reset();
      M.sfx(mv.captured ? 'capture' : 'move');
      view.animate(list, after.board, function () {
        busy = false; s = after; last = mv;
        drawCaptured();
        if (pawns && mv.promo) return end(color, 'רגלי הגיע לצד השני!');
        startTurn();
      });
    }

    // מחזיר מהלך אחורה. מול המחשב חוזרים שני מהלכים (שלו ושלכם), כדי שהתור יחזור אליכם.
    function undo() {
      if (busy) return;
      if (!hist.length) { M.sfx('bad'); setText('עוד לא שיחקתם מהלך, אז אין מה להחזיר.'); return; }
      clearTimeout(aiTimer);
      clearTimeout(endTimer);
      thinking = false; over = false;
      var h = hist.pop();
      if (!friend && h.s.turn !== 'w' && hist.length) h = hist.pop();
      s = h.s; last = h.last; captured = h.cap;
      sel = null; moves = [];
      view.setBoard(s.board);
      drawCaptured();
      M.sfx('tap');
      startTurn();
    }

    function hint() {
      if (busy || thinking || over || isAI(s.turn)) return;
      var mv = C.bestMove(s, 2, 0);
      if (!mv) return;
      hintLevel++;
      deselect();
      view.unmark('hint');
      view.mark(mv.from, 'hint');
      if (hintLevel >= 2) view.mark(mv.to, 'hint');
      setText(hintLevel >= 2 ? 'אפשר להזיז את ' + KC.THE[mv.piece.charAt(1)] + ' למשבצת המסומנת.' : 'אולי כדאי להזיז את ' + KC.THE[mv.piece.charAt(1)] + '?');
    }

    function risky(mv) {
      if (mv.piece.charAt(1) === 'P' && !mv.promo) return false;
      var after = C.applyMove(s, mv);
      if (!C.hanging(after.board, mv.to)) return false;
      return !(mv.captured && val(mv.captured) >= C.VALUE[mv.promo || mv.piece.charAt(1)]);
    }

    function select(i) {
      var ms = C.legalMoves(s, i);
      if (!ms.length) {
        M.sfx('bad');
        setText(C.inCheck(s) ? 'המלך בשח! הכלי הזה לא יכול להציל אותו.' : 'הכלי הזה לא יכול לזוז עכשיו.');
        return;
      }
      deselect();
      sel = i; moves = ms;
      view.mark(i, 'sel');
      ms.forEach(function (m) {
        view.mark(m.to, m.captured ? 'cap' : 'move');
        if (helper && risky(m)) view.mark(m.to, 'risky');
      });
      M.sfx('tap');
    }
    function deselect() {
      sel = null; moves = [];
      ['sel', 'move', 'cap', 'risky', 'hint'].forEach(function (c) { view.unmark(c); });
    }

    // כלים שייכנסו לסכנה בגלל המהלך הזה
    function blunders(mv, after) {
      var color = mv.piece.charAt(0), was = {};
      C.threats(s.board, color).forEach(function (t) { was[t.sq] = true; });
      return C.threats(after.board, color).filter(function (t) {
        if (val(t.piece) < 3) return false;
        if (t.sq === mv.to) return !(mv.captured && val(mv.captured) >= val(t.piece));
        return !was[t.sq];
      });
    }

    function tryMove(mv) {
      var after = C.applyMove(s, mv);
      var bl = helper && !C.isMate(after) ? blunders(mv, after) : [];
      if (!bl.length) return commit(mv);
      var t = bl[0], vt = t.piece.charAt(1);
      view.setArrows([[t.attackers[0], t.sq, 'red']]);
      view.mark(t.sq, 'danger');
      var msg = 'אם תשחקו ככה, היריב יוכל לאכול את ' + KC.THE[vt] + '.';
      M.sfx('bad');
      M.say('רגע! ' + msg);
      KC.modal('<div class="big-emoji">🤔</div><h2>רגע, רגע!</h2><p>' + msg + '</p>' +
        '<div class="row"><button class="btn ghost" data-act="go">לשחק בכל זאת</button><button class="btn primary big" data-act="back">↩️ אחשוב שוב</button></div>',
        function (act, m) {
          m.close();
          if (act === 'go') commit(mv);
          else { deselect(); baseMarks(); if (helper) showThreat(true); }
        }, 'slim');
    }

    function onTap(i) {
      if (busy || thinking || over || isAI(s.turn)) return;
      var cands = sel === null ? [] : moves.filter(function (m) { return m.to === i; });
      if (cands.length > 1) {
        if (pawns) return tryMove(cands[0]);
        return KC.pickPromo(s.turn, function (t) { tryMove(cands.filter(function (m) { return m.promo === t; })[0]); });
      }
      if (cands.length === 1) return tryMove(cands[0]);
      var p = s.board[i];
      if (p && p.charAt(0) === s.turn) return select(i);
      deselect();
    }

    function end(winner, text) {
      over = true;
      var emoji, head, body;
      if (winner === 'draw') { emoji = '🤝'; head = 'תיקו!'; body = text; M.sfx('good'); }
      else if (friend) { emoji = '🏆'; head = (winner === 'w' ? 'הלבן' : 'השחור') + ' ניצח!'; body = text || 'מט! איזה משחק יפה.'; M.sfx('win'); KC.confetti(); }
      else if (winner === 'w') {
        emoji = '🏆'; head = 'ניצחתם!'; body = text || 'מט! עשיתם מט למחשב. כל הכבוד!';
        M.sfx('win'); KC.confetti();
        KC.store.addWin(pawns ? 'pawns' : 'ai' + level);
      } else { emoji = '💪'; head = 'הפעם המחשב ניצח'; body = (text ? text + ' ' : '') + 'לא נורא, ככה לומדים! ננסה שוב?'; M.sfx('lose'); }
      setText(head + ' ' + body);
      endTimer = setTimeout(function () {
        KC.modal('<div class="big-emoji">' + emoji + '</div><h2>' + head + '</h2><p>' + body + '</p>' +
          '<div class="row"><button class="btn ghost" data-act="home">🏠 הביתה</button><button class="btn primary big" data-act="again">🔄 משחק חדש</button></div>',
          function (act, m) { m.close(); if (act === 'again') reset(); else opts.onExit(); });
      }, 900);
    }

    KC.mount(root, function () { clearTimeout(aiTimer); clearTimeout(endTimer); });
    drawHelper();
    reset();
  };

  KC.LEVELS = LEVELS;
})();
