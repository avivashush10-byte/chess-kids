/* בדיקות סנכרון: (1) כללי המיזוג, (2) השרת מקצה לקצה במצב קובץ, (3) מצב ענן מול Upstash מדומה.
   הכול רץ על תיקייה זמנית ושרתים זמניים - לא נוגע בנתונים אמיתיים. */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let errors = 0;
function ok(cond, name, extra) {
  if (!cond) errors++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond || !extra ? '' : '  (' + extra + ')'));
}
function eq(got, want, name) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  ok(a === b, name, 'got ' + a + ', want ' + b);
}
async function section(name, fn) {
  console.log('== ' + name + ' ==');
  try { await fn(); } catch (e) { errors++; console.log('  ✗ נפל: ' + (e && e.message)); }
}

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-sync-test-'));
const kids = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer(port, env, args) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port=' + port].concat(args || []), {
    env: Object.assign({}, process.env, { ACCESS_CODE: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', DATA_FILE: '' }, env || {}),
    stdio: 'ignore'
  });
  kids.push(child);
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/api/health'); if (r.ok) return child; } catch (e) { /* עוד לא עלה */ }
    await sleep(100);
  }
  throw new Error('server on port ' + port + ' did not start');
}
function stop(child) { return new Promise((r) => { child.once('exit', r); child.kill(); }); }

async function post(port, p, body, token, raw) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch('http://127.0.0.1:' + port + p, { method: 'POST', headers, body: raw !== undefined ? raw : JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch (e) { /* לא JSON */ }
  return { status: r.status, body: j, headers: r.headers };
}

const kid = (id, name, extra) => Object.assign({ id, name, avatar: '🦁', stars: {}, wins: {}, resume: {} }, extra || {});
const find = (doc, name) => doc.profiles.filter((p) => p.name === name)[0];

(async () => {
  let merge = null;
  await section('כללי המיזוג', async () => {
    require('../js/merge.js');
    merge = globalThis.KC.mergeDocs;
    const plain = (m) => ({ profiles: m.profiles, deleted: m.deleted });

    const A = { profiles: [kid('p100', 'נועה', { stars: { board: 3, rook: 1 }, wins: { ai1: 2 }, resume: { queen: { i: 4, m: 1, t: 1000 } } })], deleted: {} };
    const B = { profiles: [kid('p100', 'נועה', { stars: { board: 2, rook: 3, king: 2 }, wins: { ai1: 1, pawns: 4 }, resume: { queen: { i: 2, m: 0, t: 500 }, king: { i: 1, m: 0, t: 700 } } }),
      kid('p200', 'יואב', { stars: { board: 1 } })], deleted: {} };
    const m = merge(A, B);
    eq(m.profiles.map((p) => p.name), ['נועה', 'יואב'], 'ילד שקיים רק במכשיר אחד מופיע אחרי המיזוג');
    eq(find(m, 'נועה').stars, { board: 3, king: 2, rook: 3 }, 'כוכבים: הגבוה מבין השניים');
    eq(find(m, 'נועה').wins, { ai1: 2, pawns: 4 }, 'ניצחונות: הגבוה מבין השניים');
    eq(find(m, 'נועה').resume.queen, { i: 4, m: 1, t: 1000 }, 'מקום באמצע שיעור: האחרון לפי זמן');
    eq(find(m, 'נועה').resume.king.i, 1, 'מקום שקיים רק בצד אחד נשמר');

    eq(plain(merge(A, B)), plain(merge(B, A)), 'הסדר לא משנה (א+ב = ב+א)');
    eq(plain(merge(plain(m), A)), plain(m), 'מיזוג חוזר לא משנה כלום');
    eq(plain(merge(plain(m), plain(m))), plain(m), 'מיזוג של מסמך עם עצמו לא משנה כלום');

    const done = { profiles: [kid('p100', 'נועה', { resume: { queen: { i: 0, m: 0, t: 2000 } } })], deleted: {} };
    eq(merge(A, done).profiles[0].resume.queen.i, 0, 'שיעור שהסתיים במכשיר אחד לא חוזר ל"באמצע" בגלל מכשיר אחר');
    const oldDone = { profiles: [kid('p100', 'נועה', { resume: { queen: { i: 0, m: 0, t: 10 } } })], deleted: {} };
    eq(merge(A, oldDone).profiles[0].resume.queen.i, 4, 'סימון סיום ישן לא מוחק מקום חדש יותר');

    const dup = merge({ profiles: [kid('p300', 'דני', { stars: { board: 2 } })], deleted: {} },
      { profiles: [kid('p150', ' דני ', { stars: { rook: 3 } })], deleted: {} });
    eq(dup.profiles.length, 1, 'אותו שם בשני מכשירים = ילד אחד');
    eq([dup.profiles[0].id, dup.profiles[0].stars], ['p150', { board: 2, rook: 3 }], 'נשאר המזהה הוותיק, וההתקדמות מתאחדת');
    eq(dup.alias, { p300: 'p150' }, 'המיזוג מדווח איזה מזהה הוחלף (כדי לתקן את הילד הנבחר במכשיר)');

    const del = merge({ profiles: [], deleted: { p200: 5000 } }, B);
    eq(del.profiles.map((p) => p.name), ['נועה'], 'ילד שנמחק לא חוזר ממכשיר אחר');
    eq(del.deleted, { p200: 5000 }, 'סימון המחיקה נשמר');

    let junk = null;
    try {
      junk = merge({ profiles: [null, 'x', { id: '../../etc', name: 'רע' }, { id: 'p1', name: '' }, { id: 'p9', name: 'שם ארוך מאוד מאוד מאוד', stars: { board: 99, x: -5, y: 'abc' }, wins: 'nope', resume: { a: 'b', rook: { i: 3, t: 5 } } }], deleted: 'zzz' }, null);
    } catch (e) { junk = null; }
    ok(!!junk, 'קלט פגום לא מפיל את המיזוג');
    if (junk) {
      eq(junk.profiles.length, 1, 'פרופילים לא תקינים נזרקים');
      eq([junk.profiles[0].name.length <= 12, junk.profiles[0].stars, junk.profiles[0].wins, junk.profiles[0].resume], [true, { board: 3 }, {}, { rook: { i: 3, m: 0, t: 5 } }], 'ערכים חריגים מנוקים ומוגבלים');
    }
    const many = { profiles: [], deleted: {} };
    for (let i = 0; i < 40; i++) many.profiles.push(kid('p' + (1000 + i), 'ילד' + i));
    ok(merge(many, null).profiles.length <= 12, 'יש תקרה למספר הפרופילים');
  });

  const FILE = path.join(TMP, 'sync.json');
  let token = null;
  await section('שרת: כניסה עם קוד משפחה', async () => {
    await startServer(4311, {}, ['--code=Sus-123', '--data=' + FILE]);
    const h = await (await fetch('http://127.0.0.1:4311/api/health')).json();
    eq([h.ok, h.storage, h.ready], [true, 'file', true], 'בדיקת תקינות עונה');
    eq((await post(4311, '/api/sync', { profiles: [], deleted: {} })).status, 401, 'בלי קוד אין סנכרון');
    eq((await post(4311, '/api/sync', { profiles: [] }, 'local')).status, 401, 'אסימון מזויף נדחה');
    eq((await post(4311, '/api/login', { code: 'wrong' })).status, 401, 'קוד שגוי נדחה');
    const good = await post(4311, '/api/login', { code: '  sus-123 ' });
    eq(good.status, 200, 'קוד נכון מתקבל (בלי רגישות לרווחים ולאותיות גדולות)');
    token = good.body && good.body.token;
    ok(typeof token === 'string' && token.length >= 32 && token.indexOf('Sus') < 0, 'האסימון אינו הקוד עצמו');
  });

  await section('שרת: שני מכשירים', async () => {
    const tablet = { profiles: [kid('p100', 'נועה', { stars: { board: 3 }, resume: { rook: { i: 2, m: 0, t: 1000 } } })], deleted: {} };
    const phone = { profiles: [kid('p200', 'יואב', { stars: { board: 2, pieces: 3 } })], deleted: {} };
    const r1 = await post(4311, '/api/sync', tablet, token);
    eq([r1.status, r1.body && r1.body.doc.profiles.length], [200, 1], 'הטאבלט מעלה את ההתקדמות שלו');
    const r2 = await post(4311, '/api/sync', phone, token);
    eq(r2.body.doc.profiles.map((p) => p.name), ['נועה', 'יואב'], 'הטלפון מקבל גם את הילדה מהטאבלט');
    const r3 = await post(4311, '/api/sync', tablet, token);
    eq(find(r3.body.doc, 'יואב').stars, { board: 2, pieces: 3 }, 'הטאבלט מקבל את ההתקדמות מהטלפון');
    const r4 = await post(4311, '/api/sync', { profiles: [], deleted: {} }, token);
    eq(r4.body.doc.profiles.length, 2, 'מכשיר חדש וריק מקבל הכול');
    const r5 = await post(4311, '/api/sync', tablet, token);
    eq(r5.body.doc.profiles.length, 2, 'ומכשיר ריק לא מוחק כלום');
    eq(find(r5.body.doc, 'נועה').resume.rook.i, 2, 'המקום באמצע שיעור עבר בין המכשירים');
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    eq(saved.profiles.map((p) => p.name), ['נועה', 'יואב'], 'נשמר בקובץ הנתונים (עברית תקינה)');
  });

  await section('שרת: הגנות', async () => {
    const get = (p) => fetch('http://127.0.0.1:4311' + p);
    const home = await get('/');
    ok(home.status === 200 && (await home.text()).indexOf('ממלכת השחמט') >= 0, 'האפליקציה עצמה מוגשת');
    eq((await get('/js/app.js')).status, 200, 'קבצי האפליקציה מוגשים');
    eq([(await get('/data/sync.json')).status, (await get('/server.js')).status, (await get('/.git/config')).status, (await get('/tools/test-sync.js')).status, (await get('/js/..%2Fserver.js')).status],
      [404, 404, 404, 404, 404], 'קובץ הנתונים, קוד השרת ותיקיות פנימיות לא נגישים מבחוץ');
    const opt = await fetch('http://127.0.0.1:4311/api/sync', { method: 'OPTIONS', headers: { Origin: 'https://example.github.io', 'Access-Control-Request-Method': 'POST' } });
    eq([opt.status, opt.headers.get('access-control-allow-origin'), /authorization/i.test(opt.headers.get('access-control-allow-headers') || '')], [204, '*', true], 'האתר ב-GitHub Pages מורשה לפנות לשרת (CORS)');
    const r = await post(4311, '/api/sync', { profiles: [] }, token);
    eq([r.headers.get('access-control-allow-origin'), r.headers.get('cache-control')], ['*', 'no-store'], 'תשובות השרת לא נשמרות במטמון');
    eq((await post(4311, '/api/sync', null, token, '{not json')).status, 400, 'גוף לא תקין נדחה');
    eq((await post(4311, '/api/sync', null, token, JSON.stringify({ profiles: [], pad: 'x'.repeat(400000) }))).status, 413, 'גוף גדול מדי נדחה');
    eq(JSON.parse(fs.readFileSync(FILE, 'utf8')).profiles.length, 2, 'והנתונים לא נפגעו מהבקשות האלה');
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await post(4311, '/api/login', { code: 'guess' + i })).status;
    eq(last, 429, 'ניחושי קוד חוזרים נחסמים');
  });

  await section('שרת: הנתונים שורדים הפעלה מחדש', async () => {
    await stop(kids[0]);
    await startServer(4311, {}, ['--code=Sus-123', '--data=' + FILE]);
    const r = await post(4311, '/api/sync', { profiles: [], deleted: {} }, token);
    eq([r.status, r.body && r.body.doc.profiles.length], [200, 2], 'אחרי הפעלה מחדש הכול עדיין שם, והאסימון עדיין תקף');
    const del = await post(4311, '/api/sync', { profiles: [], deleted: { p200: Date.now() } }, token);
    eq(del.body.doc.profiles.map((p) => p.name), ['נועה'], 'מחיקת ילד מאזור ההורים עוברת לשרת');
    const back = await post(4311, '/api/sync', { profiles: [kid('p200', 'יואב')], deleted: {} }, token);
    eq(back.body.doc.profiles.length, 1, 'ומכשיר שעוד מחזיק אותו לא מחזיר אותו');
  });

  await section('שרת מקומי בלי קוד (הרצה בבית)', async () => {
    await startServer(4312, {}, ['--data=' + path.join(TMP, 'local.json')]);
    const login = await post(4312, '/api/login', { code: '' });
    eq(login.status, 200, 'בלי קוד מוגדר, מקומית, החיבור פתוח');
    eq((await post(4312, '/api/sync', { profiles: [kid('p1', 'בדיקה')] }, login.body.token)).status, 200, 'והסנכרון עובד');
  });

  // ---------- Upstash מדומה ----------
  const store = new Map();
  let calls = 0;
  const mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      calls++;
      res.setHeader('Content-Type', 'application/json');
      if (req.headers.authorization !== 'Bearer good-token') { res.statusCode = 401; return res.end(JSON.stringify({ error: 'WRONGPASS invalid or missing auth token' })); }
      const cmd = JSON.parse(body);
      if (cmd[0] === 'GET') return res.end(JSON.stringify({ result: store.has(cmd[1]) ? store.get(cmd[1]) : null }));
      if (cmd[0] === 'SET') { store.set(cmd[1], cmd[2]); return res.end(JSON.stringify({ result: 'OK' })); }
      res.statusCode = 400; res.end(JSON.stringify({ error: 'ERR unknown command' }));
    });
  });
  await new Promise((r) => mock.listen(4320, '127.0.0.1', r));
  const UP = { UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:4320', UPSTASH_REDIS_REST_TOKEN: 'good-token', ACCESS_CODE: 'cloud-code' };

  await section('ענן: שמירה ב-Upstash', async () => {
    await startServer(4313, UP);
    const h = await (await fetch('http://127.0.0.1:4313/api/health')).json();
    eq([h.storage, h.storageOk, h.ready], ['upstash', true, true], 'השרת מזהה מצב ענן ובודק את האחסון בעלייה');
    const t = (await post(4313, '/api/login', { code: 'cloud-code' })).body.token;
    const r = await post(4313, '/api/sync', { profiles: [kid('p100', 'נועה ״הצריח״', { stars: { board: 3 } })] }, t);
    eq(r.status, 200, 'סנכרון בענן מצליח');
    const raw = store.get('chess-kids:family');
    ok(!!raw && JSON.parse(raw).profiles[0].name === 'נועה ״הצריח״', 'נשמר ב-Upstash תחת המפתח של האפליקציה, עברית תקינה');
    await stop(kids[kids.length - 1]);
    await startServer(4313, UP);
    const again = await post(4313, '/api/sync', { profiles: [] }, t);
    eq(again.body.doc.profiles[0].stars, { board: 3 }, 'אחרי הפעלה מחדש (כמו שרת חינמי שנרדם) הנתונים חוזרים מ-Upstash');
    ok(!fs.existsSync(path.join(ROOT, 'data', 'cloud-should-not-write')) && !fs.existsSync(path.join(TMP, 'sync-cloud.json')), 'בענן לא נכתב קובץ מקומי');
  });

  await section('ענן: תקלות אחסון לא מוסתרות ולא דורסות', async () => {
    const before = store.get('chess-kids:family');
    await startServer(4314, Object.assign({}, UP, { UPSTASH_REDIS_REST_TOKEN: 'wrong-token' }));
    const h = await (await fetch('http://127.0.0.1:4314/api/health')).json();
    eq(h.storageOk, false, 'אסימון Upstash שגוי מתגלה כבר בעליית השרת');
    const t = (await post(4314, '/api/login', { code: 'cloud-code' })).body.token;
    const r = await post(4314, '/api/sync', { profiles: [kid('p500', 'אורח')] }, t);
    eq([r.status, !!(r.body && r.body.ok)], [503, false], 'כשהשמירה נכשלת השרת מחזיר שגיאה ולא "הצליח"');
    eq(store.get('chess-kids:family'), before, 'והנתונים הקיימים לא השתנו');

    store.set('chess-kids:family', '{corrupted');
    const t2 = (await post(4313, '/api/login', { code: 'cloud-code' })).body.token;
    const bad = await post(4313, '/api/sync', { profiles: [kid('p500', 'אורח')] }, t2);
    eq(bad.status, 503, 'נתון שמור פגום: שגיאה');
    eq(store.get('chess-kids:family'), '{corrupted', 'ולא דורסים אותו בנתונים חדשים');
    store.set('chess-kids:family', before);

    await startServer(4315, Object.assign({}, UP, { ACCESS_CODE: '' }));
    const h2 = await (await fetch('http://127.0.0.1:4315/api/health')).json();
    eq(h2.ready, false, 'ענן בלי קוד משפחה: השרת מדווח שאינו מוכן');
    eq((await post(4315, '/api/login', { code: '' })).status, 503, 'ואי אפשר להתחבר');
    eq((await post(4315, '/api/sync', { profiles: [] }, 'local')).status, 503, 'ואי אפשר לסנכרן');
  });

  kids.forEach((c) => { try { c.kill(); } catch (e) { /* כבר נסגר */ } });
  mock.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* לא נורא */ }
  console.log(errors ? `\n${errors} ERROR(S)` : '\nALL OK');
  process.exit(errors ? 1 : 0);
})();
