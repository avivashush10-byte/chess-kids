/* בדיקות: (1) מנוע החוקים מול מספרי perft ידועים, (2) שכל תרגיל וחידה באמת פתירים. */
require('../js/engine.js');
require('../js/goals.js');
require('../js/content.js');
const { chess: C, goals: G, content: CT, parseFen } = globalThis.KC;

let errors = 0;
const fail = (msg) => { errors++; console.log('  ✗ ' + msg); };

function perft(s, d) {
  if (!d) return 1;
  let n = 0;
  for (const m of C.legalMoves(s)) n += perft(C.applyMove(s, m), d - 1);
  return n;
}

console.log('== perft ==');
const PERFT = [
  [C.START, [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]]
];
for (const [fen, exp] of PERFT) {
  const s = C.fromFEN(fen);
  exp.forEach((want, i) => {
    const got = perft(s, i + 1);
    if (got !== want) fail(`perft d${i + 1} ${fen}: got ${got}, want ${want}`);
  });
}
console.log(errors ? '  perft FAILED' : '  perft ok');

const mv = (m) => C.name(m.from) + C.name(m.to) + (m.promo || '');

function validate(unit) {
  unit.steps.forEach((step, i) => {
    const tag = `${unit.id}#${i + 1} ${step.type}${step.goal ? ':' + step.goal : ''}`;
    const s = parseFen(step.fen);
    const hasKings = C.findKing(s.board, 'w') >= 0 && C.findKing(s.board, 'b') >= 0;
    if (hasKings && C.inCheck(s, C.other(s.turn))) fail(`${tag}: side not to move is in check`);
    if (!step.text) fail(`${tag}: no text`);
    if (step.type === 'goal') {
      const sols = G.solutions(step);
      const legal = C.legalMoves(s).length;
      console.log(`  ${tag}: ${sols.length}/${legal} -> ${sols.slice(0, 12).map(mv).join(' ')}`);
      if (!sols.length) fail(`${tag}: no solution`);
      if (sols.length === legal && step.goal !== 'escape') fail(`${tag}: every move solves it`);
      if (step.goal === 'defend' && !G.threat(s)) fail(`${tag}: no mate threat`);
      if (step.goal === 'save' && !C.threats(s.board, 'w').some((t) => C.VALUE[t.piece[1]] >= 3)) fail(`${tag}: nothing in danger`);
    } else if (step.type === 'tap' && step.answer === 'danger') {
      const th = C.threats(s.board, 'w').filter((t) => C.VALUE[t.piece[1]] >= 3);
      console.log(`  ${tag}: ${th.map((t) => t.piece + '@' + C.name(t.sq)).join(' ')}`);
      if (th.length !== 1) fail(`${tag}: expected exactly one piece in danger`);
    } else if (step.type === 'choice') {
      const st = C.status(s);
      const ans = st.mate ? 'mate' : st.stalemate ? 'stalemate' : st.check ? 'check' : 'none';
      console.log(`  ${tag}: ${ans}`);
      if (step.options.indexOf(ans) < 0) fail(`${tag}: answer ${ans} not among options`);
    } else if (step.type === 'collect') {
      step.stars.forEach((n) => { if (s.board[C.sq(n)]) fail(`${tag}: star on occupied square ${n}`); });
      // BFS: האם אפשר לאסוף את כל הכוכבים?
      let left = new Set(step.stars.map(C.sq));
      let cur = s;
      for (let guard = 0; guard < 10 && left.size; guard++) {
        const seen = new Map([[C.key(cur), cur]]);
        let frontier = [cur], found = null;
        while (frontier.length && !found) {
          const next = [];
          for (const st of frontier) {
            for (const m of C.pseudoMoves(st, 'w')) {
              const n = C.applyMove(st, m); n.turn = 'w'; n.ep = null;
              if (left.has(m.to)) { found = [n, m.to]; break; }
              const k = C.key(n);
              if (!seen.has(k)) { seen.set(k, n); next.push(n); }
            }
            if (found) break;
          }
          frontier = next;
        }
        if (!found) break;
        cur = found[0]; left.delete(found[1]);
      }
      if (left.size) fail(`${tag}: stars unreachable`);
    } else if (step.type === 'eat') {
      if (!s.board.some((p) => p && p[0] === 'b')) fail(`${tag}: nothing to eat`);
    } else if (step.type === 'find') {
      if (!s.board.some((p) => p && p[1] === step.piece)) fail(`${tag}: piece missing`);
    } else if (step.type === 'say') {
      for (const d of step.demo || []) if (!s.board[C.sq(d[0])] && d === step.demo[0]) fail(`${tag}: demo from empty square`);
      if (step.showMoves && !s.board[C.sq(step.showMoves)]) fail(`${tag}: showMoves on empty square`);
    }
  });
}

console.log('== content ==');
const used = new Set();
CT.worlds.forEach((w) => w.lessons.forEach((id) => {
  if (!CT.lessons[id]) return fail('missing lesson ' + id);
  used.add(id); validate(CT.lessons[id]);
}));
Object.keys(CT.lessons).forEach((id) => { if (!used.has(id)) fail('lesson not in any world: ' + id); });
CT.packs.forEach((p) => { if (!CT.lessons[p.requires]) fail('pack requires unknown lesson'); validate(p); });

// המחשב משחק נגד עצמו כדי לוודא שאין קריסות
console.log('== self-play ==');
for (const level of [1, 2, 3]) {
  let s = C.fromFEN(C.START), n = 0;
  const t0 = Date.now();
  let worst = 0;
  while (n < 60) {
    const st = C.status(s);
    if (st.mate || st.stalemate || st.insufficient) break;
    const t1 = Date.now();
    const m = C.aiMove(s, level);
    worst = Math.max(worst, Date.now() - t1);
    if (!m) { fail('ai returned no move'); break; }
    s = C.applyMove(s, m); n++;
  }
  console.log(`  level ${level}: ${n} plies, ${Date.now() - t0}ms total, slowest move ${worst}ms`);
}

console.log(errors ? `\n${errors} ERROR(S)` : '\nALL OK');
process.exit(errors ? 1 : 0);
