/* מנוע שחמט קטן: חוקים מלאים, זיהוי איומים, ויריב ממוחשב פשוט. */
(function (root) {
  'use strict';
  var KC = root.KC = root.KC || {};

  var FILES = 'abcdefgh';
  var START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  var VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 99, X: 0 };
  var CP = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0, X: 0 };
  var KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var ALL = DIAG.concat(ORTH);

  function other(c) { return c === 'w' ? 'b' : 'w'; }
  function sq(n) { return (8 - Number(n.charAt(1))) * 8 + FILES.indexOf(n.charAt(0)); }
  function name(i) { return FILES.charAt(i & 7) + (8 - (i >> 3)); }
  function inside(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  // לוח: מערך של 64, אינדקס 0 = a8. כלי = 'wK', 'bP' וכו'. 'wX' = סלע (מכשול בשיעורים).
  function fromFEN(fen) {
    var p = fen.trim().split(/\s+/);
    var board = [], i;
    for (i = 0; i < 64; i++) board.push(null);
    i = 0;
    for (var k = 0; k < p[0].length; k++) {
      var ch = p[0].charAt(k);
      if (ch === '/') continue;
      if (ch >= '1' && ch <= '8') { i += Number(ch); continue; }
      board[i++] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase();
    }
    var c = p[2] || '-';
    return {
      board: board,
      turn: p[1] || 'w',
      castling: { wK: c.indexOf('K') >= 0, wQ: c.indexOf('Q') >= 0, bK: c.indexOf('k') >= 0, bQ: c.indexOf('q') >= 0 },
      ep: p[3] && p[3] !== '-' ? sq(p[3]) : null,
      half: Number(p[4] || 0),
      full: Number(p[5] || 1)
    };
  }

  function key(s) {
    var out = '';
    for (var i = 0; i < 64; i++) out += s.board[i] || '-';
    return out + s.turn + (s.castling.wK ? 'K' : '') + (s.castling.wQ ? 'Q' : '') +
      (s.castling.bK ? 'k' : '') + (s.castling.bQ ? 'q' : '') + (s.ep === null ? '' : s.ep);
  }

  // אילו כלים בצבע `by` מאיימים על המשבצת t
  function attackers(board, t, by, firstOnly) {
    var res = [], r = t >> 3, c = t & 7, i, d, rr, cc, p;
    var pr = r + (by === 'w' ? 1 : -1);
    if (pr >= 0 && pr < 8) {
      if (c > 0 && board[pr * 8 + c - 1] === by + 'P') res.push(pr * 8 + c - 1);
      if (c < 7 && board[pr * 8 + c + 1] === by + 'P') res.push(pr * 8 + c + 1);
    }
    if (firstOnly && res.length) return res;
    for (i = 0; i < 8; i++) {
      rr = r + KN[i][0]; cc = c + KN[i][1];
      if (inside(rr, cc) && board[rr * 8 + cc] === by + 'N') res.push(rr * 8 + cc);
      rr = r + ALL[i][0]; cc = c + ALL[i][1];
      if (inside(rr, cc) && board[rr * 8 + cc] === by + 'K') res.push(rr * 8 + cc);
    }
    if (firstOnly && res.length) return res;
    for (i = 0; i < 8; i++) {
      d = ALL[i];
      var diag = i < 4;
      rr = r + d[0]; cc = c + d[1];
      while (inside(rr, cc)) {
        p = board[rr * 8 + cc];
        if (p) {
          if (p.charAt(0) === by && (p.charAt(1) === 'Q' || p.charAt(1) === (diag ? 'B' : 'R'))) res.push(rr * 8 + cc);
          break;
        }
        rr += d[0]; cc += d[1];
      }
      if (firstOnly && res.length) return res;
    }
    return res;
  }

  function findKing(board, color) { return board.indexOf(color + 'K'); }

  function inCheck(s, color) {
    color = color || s.turn;
    var k = findKing(s.board, color);
    return k >= 0 && attackers(s.board, k, other(color), true).length > 0;
  }

  function pseudoMoves(s, color, onlyFrom) {
    var b = s.board, moves = [], opp = other(color);
    function att(i) { return attackers(b, i, opp, true).length > 0; }
    for (var from = 0; from < 64; from++) {
      if (onlyFrom !== undefined && onlyFrom !== null && from !== onlyFrom) continue;
      var pc = b[from];
      if (!pc || pc.charAt(0) !== color) continue;
      var t = pc.charAt(1), r = from >> 3, c = from & 7, to, i, rr, cc;
      var add = function (dest, flag, promo, cap) {
        moves.push({ from: from, to: dest, piece: pc, captured: cap || b[dest] || null, flag: flag || null, promo: promo || null });
      };
      if (t === 'P') {
        var dir = color === 'w' ? -1 : 1, startRow = color === 'w' ? 6 : 1, promoRow = color === 'w' ? 0 : 7;
        var r1 = r + dir;
        if (r1 < 0 || r1 > 7) continue;
        var addP = function (dest, flag, cap) {
          if ((dest >> 3) === promoRow) { add(dest, flag, 'Q', cap); add(dest, flag, 'R', cap); add(dest, flag, 'B', cap); add(dest, flag, 'N', cap); }
          else add(dest, flag, null, cap);
        };
        if (!b[r1 * 8 + c]) {
          addP(r1 * 8 + c);
          if (r === startRow && !b[(r + 2 * dir) * 8 + c]) add((r + 2 * dir) * 8 + c, 'double');
        }
        for (i = -1; i <= 1; i += 2) {
          cc = c + i;
          if (cc < 0 || cc > 7) continue;
          to = r1 * 8 + cc;
          if (b[to] && b[to].charAt(0) === opp) addP(to);
          else if (!b[to] && to === s.ep) add(to, 'ep', null, opp + 'P');
        }
      } else if (t === 'N' || t === 'K') {
        var offs = t === 'N' ? KN : ALL;
        for (i = 0; i < 8; i++) {
          rr = r + offs[i][0]; cc = c + offs[i][1];
          if (!inside(rr, cc)) continue;
          to = rr * 8 + cc;
          if (!b[to] || b[to].charAt(0) === opp) add(to);
        }
        if (t === 'K') {
          var home = color === 'w' ? 60 : 4;
          if (from === home && (s.castling[color + 'K'] || s.castling[color + 'Q']) && !att(home)) {
            if (s.castling[color + 'K'] && b[home + 3] === color + 'R' && !b[home + 1] && !b[home + 2] && !att(home + 1) && !att(home + 2)) add(home + 2, 'castleK');
            if (s.castling[color + 'Q'] && b[home - 4] === color + 'R' && !b[home - 1] && !b[home - 2] && !b[home - 3] && !att(home - 1) && !att(home - 2)) add(home - 2, 'castleQ');
          }
        }
      } else if (t === 'B' || t === 'R' || t === 'Q') {
        var dirs = t === 'B' ? DIAG : t === 'R' ? ORTH : ALL;
        for (i = 0; i < dirs.length; i++) {
          rr = r + dirs[i][0]; cc = c + dirs[i][1];
          while (inside(rr, cc)) {
            to = rr * 8 + cc;
            if (!b[to]) add(to);
            else { if (b[to].charAt(0) === opp) add(to); break; }
            rr += dirs[i][0]; cc += dirs[i][1];
          }
        }
      }
    }
    return moves;
  }

  function applyMove(s, m) {
    var b = s.board.slice();
    var color = m.piece.charAt(0);
    b[m.from] = null;
    b[m.to] = m.promo ? color + m.promo : m.piece;
    if (m.flag === 'ep') b[(m.from >> 3) * 8 + (m.to & 7)] = null;
    else if (m.flag === 'castleK') { b[m.to + 1] = null; b[m.to - 1] = color + 'R'; }
    else if (m.flag === 'castleQ') { b[m.to - 2] = null; b[m.to + 1] = color + 'R'; }
    var cs = { wK: s.castling.wK, wQ: s.castling.wQ, bK: s.castling.bK, bQ: s.castling.bQ };
    if (m.piece.charAt(1) === 'K') { cs[color + 'K'] = false; cs[color + 'Q'] = false; }
    if (m.from === 56 || m.to === 56) cs.wQ = false;
    if (m.from === 63 || m.to === 63) cs.wK = false;
    if (m.from === 0 || m.to === 0) cs.bQ = false;
    if (m.from === 7 || m.to === 7) cs.bK = false;
    return {
      board: b,
      turn: other(color),
      castling: cs,
      ep: m.flag === 'double' ? (m.from + m.to) / 2 : null,
      half: (m.piece.charAt(1) === 'P' || m.captured) ? 0 : s.half + 1,
      full: s.full + (color === 'b' ? 1 : 0)
    };
  }

  function legalMoves(s, from) {
    var color = s.turn, opp = other(color), out = [];
    var list = pseudoMoves(s, color, from);
    for (var i = 0; i < list.length; i++) {
      var n = applyMove(s, list[i]);
      var k = findKing(n.board, color);
      if (k < 0 || !attackers(n.board, k, opp, true).length) out.push(list[i]);
    }
    return out;
  }

  function insufficient(board) {
    if (findKing(board, 'w') < 0 || findKing(board, 'b') < 0) return false;
    var rest = [];
    for (var i = 0; i < 64; i++) if (board[i] && board[i].charAt(1) !== 'K') rest.push(board[i].charAt(1));
    return rest.length === 0 || (rest.length === 1 && (rest[0] === 'N' || rest[0] === 'B'));
  }

  function status(s) {
    var moves = legalMoves(s), check = inCheck(s);
    return { moves: moves, check: check, mate: check && !moves.length, stalemate: !check && !moves.length, insufficient: insufficient(s.board) };
  }

  function isMate(s) { return inCheck(s) && legalMoves(s).length === 0; }

  // האם הכלי במשבצת i "תלוי" - אפשר לאכול אותו ולהרוויח
  function hanging(board, i) {
    var p = board[i];
    if (!p || p.charAt(1) === 'K' || p.charAt(1) === 'X') return false;
    var color = p.charAt(0);
    var atk = attackers(board, i, other(color));
    if (!atk.length) return false;
    if (!attackers(board, i, color).length) return true;
    for (var k = 0; k < atk.length; k++) {
      var t = board[atk[k]].charAt(1);
      if (t !== 'K' && VALUE[t] < VALUE[p.charAt(1)]) return true;
    }
    return false;
  }

  function threats(board, color) {
    var out = [];
    for (var i = 0; i < 64; i++) {
      if (board[i] && board[i].charAt(0) === color && hanging(board, i)) {
        out.push({ sq: i, piece: board[i], attackers: attackers(board, i, other(color)) });
      }
    }
    out.sort(function (a, b) { return VALUE[b.piece.charAt(1)] - VALUE[a.piece.charAt(1)]; });
    return out;
  }

  /* ---------- יריב ממוחשב ---------- */
  function evaluate(board) {
    var sc = 0;
    for (var i = 0; i < 64; i++) {
      var p = board[i];
      if (!p) continue;
      var t = p.charAt(1), w = p.charAt(0) === 'w', r = i >> 3, c = i & 7;
      var center = 7 - Math.abs(c - 3.5) - Math.abs(r - 3.5);
      var v = CP[t];
      if (t === 'P') v += (w ? 6 - r : r - 1) * 8 + center * 2;
      else if (t === 'N' || t === 'B') v += center * 6;
      else if (t === 'Q') v += center * 2;
      else if (t === 'K') v -= center * 5;
      sc += w ? v : -v;
    }
    return sc;
  }

  function order(moves) {
    moves.sort(function (a, b) {
      var av = a.captured ? VALUE[a.captured.charAt(1)] * 10 - VALUE[a.piece.charAt(1)] : (a.promo ? 5 : -1);
      var bv = b.captured ? VALUE[b.captured.charAt(1)] * 10 - VALUE[b.piece.charAt(1)] : (b.promo ? 5 : -1);
      return bv - av;
    });
    return moves;
  }

  function negamax(s, depth, alpha, beta) {
    if (depth === 0) {
      if (inCheck(s) && !legalMoves(s).length) return -100000;
      return (s.turn === 'w' ? 1 : -1) * evaluate(s.board);
    }
    var moves = legalMoves(s);
    if (!moves.length) return inCheck(s) ? -100000 - depth : 0;
    order(moves);
    for (var i = 0; i < moves.length; i++) {
      var sc = -negamax(applyMove(s, moves[i]), depth - 1, -beta, -alpha);
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return alpha;
  }

  function bestMove(s, depth, noise) {
    var moves = order(legalMoves(s)), best = null, bestSc = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var sc = -negamax(applyMove(s, moves[i]), depth - 1, -1000000, 1000000) + Math.random() * (noise || 0);
      if (sc > bestSc) { bestSc = sc; best = moves[i]; }
    }
    return best;
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // רמה 1: כמעט אקראי. רמה 2: רואה מהלך אחד קדימה ולפעמים טועה. רמה 3: חושב שלושה מהלכים.
  function aiMove(s, level) {
    var moves = legalMoves(s);
    if (!moves.length) return null;
    if (level <= 1) {
      var caps = moves.filter(function (m) { return m.captured; });
      var pool = caps.length && Math.random() < 0.5 ? caps : moves;
      var qs = pool.filter(function (m) { return !m.promo || m.promo === 'Q'; });
      return pick(qs.length ? qs : pool);
    }
    if (level === 2) {
      if (Math.random() < 0.2) return pick(moves.filter(function (m) { return !m.promo || m.promo === 'Q'; }));
      return bestMove(s, 2, 60);
    }
    return bestMove(s, 3, 15);
  }

  KC.chess = {
    START: START, VALUE: VALUE, other: other, sq: sq, name: name,
    fromFEN: fromFEN, key: key, attackers: attackers, findKing: findKing, inCheck: inCheck,
    pseudoMoves: pseudoMoves, legalMoves: legalMoves, applyMove: applyMove,
    status: status, isMate: isMate, hanging: hanging, threats: threats,
    evaluate: evaluate, bestMove: bestMove, aiMove: aiMove
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = KC.chess;
})(typeof window !== 'undefined' ? window : globalThis);
