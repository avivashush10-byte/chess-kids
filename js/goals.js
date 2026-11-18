/* בדיקת משימות: האם המהלך של הילד עמד במטרה של התרגיל. */
(function (root) {
  'use strict';
  var KC = root.KC = root.KC || {};
  var C = KC.chess;

  function parseFen(fen) {
    if (fen === 'start') fen = C.START;
    if (!fen || fen === 'empty') fen = '8/8/8/8/8/8/8/8 w - - 0 1';
    return C.fromFEN(fen);
  }

  // אם השחור היה משחק עכשיו - האם יש לו מט במהלך אחד?
  function threat(s) {
    var n = { board: s.board, turn: C.other(s.turn), castling: s.castling, ep: null, half: 0, full: 1 };
    var moves = C.legalMoves(n);
    for (var i = 0; i < moves.length; i++) if (C.isMate(C.applyMove(n, moves[i]))) return moves[i];
    return null;
  }

  // המהלך של היריב ש"מעניש" טעות: אוכל כלי שנשאר בלי הגנה
  function punish(after) {
    var moves = C.legalMoves(after), best = null;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (!m.captured || m.flag === 'ep') continue;
      if (C.VALUE[m.captured.charAt(1)] < 3 || !C.hanging(after.board, m.to)) continue;
      if (!best || C.VALUE[m.captured.charAt(1)] > C.VALUE[best.captured.charAt(1)]) best = m;
    }
    return best;
  }

  function check(step, before, mv, after) {
    var color = mv.piece.charAt(0), opp = C.other(color);
    var moved = mv.promo || mv.piece.charAt(1);
    var i, st;
    switch (step.goal) {
      case 'mate':
        st = C.status(after);
        if (st.mate) return { ok: true };
        return { ok: false, reason: st.stalemate ? 'stalemate' : st.check ? 'onlycheck' : 'nomate' };
      case 'check':
        return { ok: C.inCheck(after), reason: 'nocheck' };
      case 'escape':
        return { ok: true };
      case 'castle':
        return { ok: mv.flag === 'castleK' || mv.flag === 'castleQ', reason: 'wrong' };
      case 'promote':
        return { ok: !!mv.promo, reason: 'wrong' };
      case 'ep':
        return { ok: mv.flag === 'ep', reason: 'wrong' };
      case 'capture':
        return { ok: !!mv.captured && mv.captured.charAt(1) === step.target, reason: mv.captured ? 'notbest' : 'nocapture' };
      case 'move':
        return { ok: step.to.indexOf(C.name(mv.to)) >= 0, reason: 'wrong' };
      case 'safe-capture':
        if (!mv.captured) return { ok: false, reason: 'nocapture' };
        if (C.hanging(after.board, mv.to) && C.VALUE[mv.captured.charAt(1)] <= C.VALUE[moved]) return { ok: false, reason: 'hanging' };
        return { ok: true };
      case 'save':
        var th = C.threats(after.board, color).filter(function (t) { return C.VALUE[t.piece.charAt(1)] >= 3; });
        return { ok: th.length === 0, reason: 'still' };
      case 'defend':
        var replies = C.legalMoves(after);
        for (i = 0; i < replies.length; i++) {
          if (C.isMate(C.applyMove(after, replies[i]))) return { ok: false, reason: 'mated', reply: replies[i] };
        }
        return { ok: true };
      case 'fork':
        if (C.hanging(after.board, mv.to)) return { ok: false, reason: 'hanging' };
        var n = 0;
        for (i = 0; i < 64; i++) {
          var p = after.board[i];
          if (!p || p.charAt(0) !== opp) continue;
          if (C.attackers(after.board, i, color).indexOf(mv.to) < 0) continue;
          var t = p.charAt(1);
          if (t === 'K' || C.VALUE[t] > C.VALUE[moved] || !C.attackers(after.board, i, opp).length) n++;
        }
        return { ok: n >= 2, reason: 'nofork' };
    }
    return { ok: true };
  }

  function solutions(step) {
    var s = parseFen(step.fen);
    return C.legalMoves(s).filter(function (m) { return check(step, s, m, C.applyMove(s, m)).ok; });
  }

  KC.parseFen = parseFen;
  KC.goals = { check: check, solutions: solutions, threat: threat, punish: punish };
})(typeof window !== 'undefined' ? window : globalThis);
