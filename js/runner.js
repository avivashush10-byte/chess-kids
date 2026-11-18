/* מריץ שיעור או חבילת חידות: צעד אחרי צעד, עם הסבר קולי, משימה קטנה ומשוב. */
(function () {
  'use strict';
  var KC = window.KC, C = KC.chess, G = KC.goals, M = KC.media;
  var PRAISE = ['כל הכבוד!', 'מצוין!', 'יופי!', 'נהדר!', 'בול!', 'אלופים!'];

  var FAIL = {
    stalemate: 'אוי, זה פט! לשחור אין מהלכים, אבל הוא לא בשח. נסו שוב.',
    onlycheck: 'זה שח, אבל המלך עוד יכול להינצל. חפשו מט!',
    nomate: 'זה לא מט. חפשו שח שאי אפשר לברוח ממנו.',
    nocheck: 'המלך השחור לא בשח. נסו שוב!',
    nocapture: 'צריך לאכול כלי! נסו שוב.',
    notbest: 'אפשר לאכול כלי ששווה יותר. נסו שוב!',
    hanging: 'אוי! שמרו על הכלי הזה, ועכשיו אוכלים אתכם בחזרה.',
    still: 'אוי! עדיין יש כלי לבן בסכנה. נסו שוב.',
    mated: 'אוי! השחור עשה מט. נסו לעצור אותו.',
    nofork: 'זה לא מזלג. חפשו מהלך שמאיים על שני כלים.',
    wrong: 'לא בדיוק. נסו שוב!'
  };
  var CHOICE = { check: 'רק שח', mate: 'מט!', stalemate: 'פט (תיקו)' };

  KC.runLesson = function (unit, opts) {
    var steps = unit.steps;
    var root = KC.el('<div class="screen play-screen">' +
      '<header class="topbar"><button class="icon-btn" data-x="exit" aria-label="יציאה">✕</button>' +
      '<div class="progress"><i></i></div><div class="chip mini" data-x="count"></div></header>' +
      KC.stageHTML() + '</div>');

    var idx = 0, mistakes = 0, step, s, sel = null, moves = [], locked = false, busy = false;
    var fails = 0, hintLevel = 0, stars = [], sols = [], answer = [], timers = [], lastText = '';
    var view = new KC.BoardView(root.querySelector('.board'), onTap);
    var actions = root.querySelector('.actions'), textEl = root.querySelector('.say-text');
    var bar = root.querySelector('.progress i'), count = root.querySelector('[data-x="count"]');

    root.addEventListener('click', function (e) {
      var x = e.target.closest('[data-x]');
      if (!x) return;
      var k = x.getAttribute('data-x');
      if (k === 'exit') { stopTimers(); opts.onExit(); }
      else if (k === 'speak') M.say(lastText);
    });

    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function stopTimers() { timers.forEach(clearTimeout); timers = []; }
    function setText(t, quiet) { lastText = t; textEl.textContent = t; if (!quiet) M.say(t); }
    function btn(label, cls, fn) {
      var b = KC.el('<button class="btn ' + cls + '">' + label + '</button>');
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    }
    function nextButton() {
      btn(idx === steps.length - 1 ? 'סיום 🎉' : 'הבא ◀', 'primary big bounce', next);
    }
    function markCheck(st) {
      ['w', 'b'].forEach(function (c) { if (C.inCheck(st, c)) view.mark(C.findKing(st.board, c), 'check'); });
    }

    function show(i) {
      stopTimers();
      idx = i; step = steps[i]; s = KC.parseFen(step.fen);
      sel = null; moves = []; locked = false; busy = false; fails = 0; hintLevel = 0; stars = [];
      bar.style.width = (i / steps.length * 100) + '%';
      count.textContent = (i + 1) + ' / ' + steps.length;
      view.reset();
      view.setBoard(s.board);
      actions.innerHTML = '';
      setText(step.text);
      ({ say: setupSay, find: setupFind, tap: setupTap, collect: setupFree, eat: setupFree, goal: setupGoal, choice: setupChoice })[step.type]();
    }

    /* ----- הסבר ----- */
    function setupSay() {
      locked = true;
      (step.marks || []).forEach(function (m) { view.mark(C.sq(m[0]), m[1]); });
      if (step.arrows) view.setArrows(step.arrows.map(function (a) { return [C.sq(a[0]), C.sq(a[1]), a[2] || 'red']; }));
      if (step.labels) view.setLabels(step.labels);
      if (step.showMoves) showMovesFor(C.sq(step.showMoves), step.showDanger);
      if (step.demo) runDemo(step.demo);
      nextButton();
    }

    function showMovesFor(i, danger) {
      var st = { board: s.board, turn: s.board[i].charAt(0), castling: s.castling, ep: s.ep, half: 0, full: 1 };
      var ms = C.legalMoves(st, i), ok = {};
      view.mark(i, 'sel');
      ms.forEach(function (m) { ok[m.to] = true; view.mark(m.to, m.captured ? 'cap' : 'move'); });
      if (danger) {
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
          var r = (i >> 3) + dr, c = (i & 7) + dc, t = r * 8 + c;
          if ((dr || dc) && r >= 0 && r < 8 && c >= 0 && c < 8 && !ok[t] && !s.board[t]) view.mark(t, 'forbid');
        }
      }
    }

    function runDemo(demo) {
      var k = 0, cur = s.board.slice();
      function tick() {
        if (k === demo.length) { k = 0; cur = s.board.slice(); view.setBoard(cur); later(tick, 1000); return; }
        var d = demo[k++], from = C.sq(d[0]), to = C.sq(d[1]);
        var nb = cur.slice();
        var cap = !!nb[to] || !!d[2];
        nb[to] = nb[from]; nb[from] = null;
        if (d[2]) nb[C.sq(d[2])] = null;
        view.animate([{ from: from, to: to }], nb);
        M.sfx(cap ? 'capture' : 'move');
        cur = nb;
        later(tick, k === demo.length ? 1700 : 1000);
      }
      later(tick, 1300);
    }

    /* ----- מצאו את הכלי / הקישו על המשבצת ----- */
    function setupFind() {
      answer = [];
      for (var i = 0; i < 64; i++) if (s.board[i] && s.board[i].charAt(1) === step.piece) answer.push(i);
      if (step.guided) answer.forEach(function (i) { view.mark(i, 'pulse'); });
    }

    function setupTap() {
      answer = [];
      var i;
      if (step.answer === 'white' || step.answer === 'black') {
        for (i = 0; i < 64; i++) if (s.board[i] && s.board[i].charAt(0) === step.answer.charAt(0)) answer.push(i);
      } else if (step.answer === 'danger') {
        C.threats(s.board, 'w').forEach(function (t) { if (C.VALUE[t.piece.charAt(1)] >= 3) answer.push(t.sq); });
      } else answer = step.answer.map(C.sq);
    }

    function tapAnswer(i) {
      if (answer.indexOf(i) >= 0) {
        view.unmark('pulse');
        view.mark(i, 'good');
        if (step.answer === 'danger') {
          view.setArrows(C.attackers(s.board, i, 'b').map(function (a) { return [a, i, 'red']; }));
        }
        return success();
      }
      mistakes++; fails++;
      M.sfx('bad');
      var p = s.board[i], msg;
      if (step.type === 'find') msg = p ? KC.THIS[p.charAt(1)] + '. נסו שוב!' : 'כאן אין כלי. נסו שוב!';
      else if (step.answer === 'danger') msg = p && p.charAt(0) === 'w' ? 'הכלי הזה בטוח. חפשו כלי לבן שהשחור יכול לאכול.' : 'חפשו כלי לבן שנמצא בסכנה.';
      else msg = step.wrong || 'לא בדיוק. נסו שוב!';
      setText(msg);
      if (fails >= 2) answer.forEach(function (a) { view.mark(a, 'pulse'); });
    }

    /* ----- משחק חופשי: אוספים כוכבים / אוכלים כלים ----- */
    function setupFree() {
      stars = (step.stars || []).map(C.sq);
      view.setStars(stars);
      btn('🔄 מהתחלה', 'ghost', function () { show(idx); });
    }

    function freeMoves(i) {
      var seen = {};
      return C.pseudoMoves(s, 'w', i).filter(function (m) {
        if (m.promo && m.promo !== 'Q') return false;
        if (seen[m.to]) return false;
        seen[m.to] = true;
        return true;
      });
    }

    function tapFree(i) {
      var p = s.board[i], mv = null;
      if (sel !== null) moves.forEach(function (m) { if (m.to === i) mv = m; });
      if (mv) return doFree(mv);
      if (p && p.charAt(0) === 'w' && p.charAt(1) !== 'X') return select(i, freeMoves(i));
      if (sel !== null) { mistakes++; M.sfx('bad'); setText(KC.THE[s.board[sel].charAt(1)] + ' לא יכול להגיע לשם. נסו משבצת ירוקה.'.replace('יכול', s.board[sel].charAt(1) === 'Q' ? 'יכולה' : 'יכול')); }
    }

    function doFree(mv) {
      busy = true;
      var ns = C.applyMove(s, mv);
      ns.turn = 'w'; ns.ep = null;
      var gotStar = stars.indexOf(mv.to);
      view.clearMarks();
      view.animate([{ from: mv.from, to: mv.to }], ns.board, function () {
        busy = false; s = ns; sel = null; moves = [];
        if (gotStar >= 0) { stars.splice(gotStar, 1); view.setStars(stars); M.sfx('star'); }
        var blacks = 0, canMove = 0;
        for (var i = 0; i < 64; i++) if (s.board[i] && s.board[i].charAt(0) === 'b') blacks++;
        if (step.type === 'collect' ? !stars.length : !blacks) return success();
        canMove = C.pseudoMoves(s, 'w').length;
        if (!canMove) {
          setText('אופס, נתקענו! מתחילים שוב.');
          M.sfx('bad');
          later(function () { show(idx); }, 1800);
        }
      });
      M.sfx(mv.captured ? 'capture' : (gotStar >= 0 ? 'tap' : 'move'));
    }

    /* ----- משימה עם חוקים אמיתיים ----- */
    function setupGoal() {
      sols = G.solutions(step);
      markCheck(s);
      btn('💡 רמז', 'ghost', function () { if (!locked && !busy) { mistakes++; hint(); } });
    }

    function tapGoal(i) {
      var p = s.board[i], cands = [];
      if (sel !== null) cands = moves.filter(function (m) { return m.to === i; });
      if (cands.length > 1) {
        return KC.pickPromo('w', function (t) { playGoal(cands.filter(function (m) { return m.promo === t; })[0]); });
      }
      if (cands.length === 1) return playGoal(cands[0]);
      if (p && p.charAt(0) === s.turn && p.charAt(1) !== 'X') {
        var ms = C.legalMoves(s, i);
        if (!ms.length) {
          M.sfx('bad');
          setText(C.inCheck(s) ? 'המלך בשח! הכלי הזה לא יכול לעזור.' : 'הכלי הזה לא יכול לזוז עכשיו.');
          return;
        }
        return select(i, ms);
      }
      deselect();
    }

    function playGoal(mv) {
      busy = true;
      var before = s, after = C.applyMove(s, mv);
      var list = [{ from: mv.from, to: mv.to }];
      if (mv.flag === 'castleK') list.push({ from: mv.to + 1, to: mv.to - 1 });
      if (mv.flag === 'castleQ') list.push({ from: mv.to - 2, to: mv.to + 1 });
      view.clearMarks();
      view.setArrows([]);
      M.sfx(mv.captured ? 'capture' : 'move');
      view.animate(list, after.board, function () {
        var res = G.check(step, before, mv, after);
        markCheck(after);
        if (res.ok) { view.mark(mv.to, 'good'); return success(); }
        mistakes++; fails++;
        M.sfx('bad');
        setText(FAIL[res.reason] || FAIL.wrong);
        var reply = res.reply || ((step.goal === 'save' || step.goal === 'safe-capture') ? G.punish(after) : null);
        if (reply) {
          later(function () {
            var a2 = C.applyMove(after, reply);
            view.unmark('check');
            view.setArrows([[reply.from, reply.to, 'red']]);
            view.animate([{ from: reply.from, to: reply.to }], a2.board, function () { markCheck(a2); });
            M.sfx('capture');
          }, 900);
        }
        later(function () {
          view.reset(); view.setBoard(before.board); markCheck(before);
          sel = null; moves = []; busy = false;
          if (fails >= 2) hint();
        }, reply ? 3200 : 2200);
      });
    }

    function hint() {
      hintLevel++;
      if (step.type === 'goal') {
        if (step.goal === 'defend' && hintLevel === 1) {
          var th = G.threat(s);
          if (th) { view.setArrows([[th.from, th.to, 'red']]); setText('ראו מה השחור מתכנן! איך עוצרים אותו?'); return; }
        }
        if (!sols.length) return;
        view.unmark('hint');
        view.mark(sols[0].from, 'hint');
        if (hintLevel >= 2) view.mark(sols[0].to, 'hint');
        setText(hintLevel >= 2 ? 'הזיזו את ' + KC.THE[sols[0].piece.charAt(1)] + ' למשבצת המסומנת.' : 'נסו להזיז את ' + KC.THE[sols[0].piece.charAt(1)] + '.');
      }
    }

    /* ----- שאלה: שח, מט או פט? ----- */
    function setupChoice() {
      var st = C.status(s);
      var correct = st.mate ? 'mate' : st.stalemate ? 'stalemate' : st.check ? 'check' : 'none';
      markCheck(s);
      step.options.forEach(function (o) {
        var b = btn(CHOICE[o], 'choice', function () {
          if (locked) return;
          if (o === correct) {
            b.classList.add('right');
            if (correct === 'check') {
              var k = C.findKing(s.board, s.turn);
              C.legalMoves(s, k).forEach(function (m) { view.mark(m.to, 'move'); });
            }
            return success(correct === 'check' ? 'נכון, רק שח! המלך יכול לברוח.' : correct === 'mate' ? 'נכון, זה מט! למלך אין לאן לברוח.' : 'נכון, זה פט! המלך לא בשח.');
          }
          mistakes++;
          M.sfx('bad');
          b.classList.add('shake');
          setTimeout(function () { b.classList.remove('shake'); }, 500);
          setText(correct === 'check' ? 'לא מט. בדקו: האם המלך יכול לזוז למשבצת בטוחה?' : correct === 'mate' ? 'בדקו שוב: האם למלך יש לאן לברוח?' : 'בדקו: האם המלך בכלל בשח?');
        });
      });
    }

    /* ----- משותף ----- */
    function select(i, ms) {
      sel = i; moves = ms;
      view.unmark('sel'); view.unmark('move'); view.unmark('cap');
      view.mark(i, 'sel');
      ms.forEach(function (m) { view.mark(m.to, m.captured ? 'cap' : 'move'); });
      M.sfx('tap');
    }
    function deselect() {
      sel = null; moves = [];
      view.unmark('sel'); view.unmark('move'); view.unmark('cap');
    }

    function onTap(i) {
      if (locked || busy) return;
      if (step.type === 'find' || step.type === 'tap') tapAnswer(i);
      else if (step.type === 'collect' || step.type === 'eat') tapFree(i);
      else if (step.type === 'goal') tapGoal(i);
    }

    function success(text) {
      locked = true;
      stopTimers();
      M.sfx('good');
      actions.innerHTML = '';
      setText(text || KC.pick(PRAISE));
      root.querySelector('.owl').classList.add('happy');
      later(function () { root.querySelector('.owl').classList.remove('happy'); }, 900);
      nextButton();
    }

    function next() {
      if (idx + 1 < steps.length) show(idx + 1);
      else finish();
    }

    function finish() {
      stopTimers();
      bar.style.width = '100%';
      var n = mistakes <= 1 ? 3 : mistakes <= 4 ? 2 : 1;
      KC.store.setStars(unit.id, n);
      M.sfx('win');
      KC.confetti();
      M.say('כל הכבוד! סיימתם את ' + unit.title + '.');
      KC.modal('<div class="big-emoji">🏆</div><h2>כל הכבוד!</h2>' + KC.starRow(n, 'huge') +
        '<p>סיימתם: ' + KC.esc(unit.title) + '</p>' +
        '<div class="row"><button class="btn ghost" data-act="again">🔄 שוב</button><button class="btn primary big" data-act="done">המשך ◀</button></div>',
        function (act, m) {
          m.close();
          if (act === 'again') { mistakes = 0; show(0); }
          else opts.onDone();
        });
    }

    KC.mount(root, stopTimers);
    show(0);
  };
})();
