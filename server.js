// שרת קטן בלי תלויות: מגיש את האפליקציה, ומסנכרן את ההתקדמות של הילדים בין מכשירים (ראו SYNC.md).
// מקומי: נשמר בקובץ data/sync.json, בלי קוד. ענן: Upstash + קוד משפחה (ACCESS_CODE).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('./js/merge.js');
const mergeDocs = globalThis.KC.mergeDocs;

function arg(name) {
  const a = process.argv.find((x) => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : '';
}
const ROOT = __dirname;
const PORT = Number(arg('port') || process.env.PORT || 3240);
const norm = (code) => String(code || '').trim().toLowerCase();
const ACCESS_CODE = norm(arg('code') || process.env.ACCESS_CODE);
const UP_URL = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
const UP_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const CLOUD = !!UP_URL;
const DATA_FILE = arg('data') || process.env.DATA_FILE || path.join(ROOT, 'data', 'sync.json');
const KEY = 'chess-kids:family';
const MAX_BODY = 256 * 1024;
const READY = !CLOUD || !!ACCESS_CODE; // בענן לא עובדים בלי קוד משפחה
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const TOKEN = ACCESS_CODE ? sha('chess-kids:' + ACCESS_CODE) : 'local';
let storageOk = false;
let boot = null; // בדיקת האחסון שרצה בעליית השרת

/* ---------- אחסון ---------- */
async function redis(cmd) {
  const r = await fetch(UP_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + UP_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) throw new Error('upstash: ' + ((j && j.error) || 'HTTP ' + r.status));
  return j.result;
}

// "אין נתונים" מחזיר מסמך ריק. כל תקלה אחרת זורקת שגיאה, כדי שלא נכתוב מעל נתונים שלא הצלחנו לקרוא.
async function loadDoc() {
  let raw;
  if (CLOUD) raw = await redis(['GET', KEY]);
  else {
    try { raw = fs.readFileSync(DATA_FILE, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; raw = null; }
  }
  if (raw === null || raw === undefined || raw === '') return { profiles: [], deleted: {} };
  const doc = JSON.parse(raw);
  if (!doc || !Array.isArray(doc.profiles)) throw new Error('stored document is malformed');
  return doc;
}

async function saveDoc(doc) {
  const raw = JSON.stringify(doc);
  if (CLOUD) {
    const res = await redis(['SET', KEY, raw]);
    if (res !== 'OK') throw new Error('upstash: SET returned ' + res);
  } else {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE + '.tmp', raw);
    fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
  }
}

// בקשות הסנכרון רצות אחת אחרי השנייה, כדי ששני מכשירים בו-זמנית לא ידרסו זה את זה
let chain = Promise.resolve();
function syncDoc(incoming) {
  const run = chain.then(async () => {
    const stored = await loadDoc();
    const m = mergeDocs(stored, incoming);
    const doc = { profiles: m.profiles, deleted: m.deleted };
    if (JSON.stringify(doc) !== JSON.stringify(stored)) await saveDoc(doc);
    return doc;
  });
  chain = run.then(() => { storageOk = true; }, (e) => { storageOk = false; console.error('SYNC FAILED:', e.message); });
  return run;
}

async function checkStorage() {
  try {
    if (CLOUD) {
      const stamp = String(Date.now());
      await redis(['SET', KEY + ':ping', stamp]);
      if ((await redis(['GET', KEY + ':ping'])) !== stamp) throw new Error('upstash: read-back mismatch');
    }
    await loadDoc();
    storageOk = true;
    console.log('אחסון תקין (' + (CLOUD ? 'Upstash' : DATA_FILE) + ')');
  } catch (e) {
    storageOk = false;
    console.error('!!! בעיית אחסון - הסנכרון לא יעבוד עד שתתוקן: ' + e.message);
  }
}

/* ---------- עזרי HTTP ---------- */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
function json(res, status, body) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS));
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > MAX_BODY) { done = true; return reject(Object.assign(new Error('too large'), { status: 413 })); }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); }
      catch (e) { reject(Object.assign(new Error('bad json'), { status: 400 })); }
    });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}
function safeEq(a, b) {
  const x = Buffer.from(sha(String(a))), y = Buffer.from(sha(String(b)));
  return crypto.timingSafeEqual(x, y);
}
function authed(req) {
  if (!ACCESS_CODE) return !CLOUD;
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') && safeEq(h.slice(7), TOKEN);
}

// חסימת ניחושי קוד: עד 8 ניסיונות שגויים ב-10 דקות לכל כתובת
const fails = new Map();
const WINDOW = 10 * 60 * 1000, MAX_FAILS = 8;
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
function recentFails(ip) {
  const now = Date.now(), list = (fails.get(ip) || []).filter((t) => now - t < WINDOW);
  if (list.length) fails.set(ip, list); else fails.delete(ip);
  return list;
}

/* ---------- API ---------- */
async function api(req, res, url) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url === '/api/health' && req.method === 'GET') {
    if (boot) await boot;
    return json(res, 200, { ok: true, storage: CLOUD ? 'upstash' : 'file', storageOk: storageOk, ready: READY });
  }
  if (req.method !== 'POST' || (url !== '/api/login' && url !== '/api/sync')) return json(res, 404, { error: 'not found' });
  if (!READY) { req.resume(); return json(res, 503, { error: 'not configured' }); }

  let body;
  try { body = await readBody(req); } catch (e) { req.resume(); return json(res, e.status || 400, { error: e.message }); }

  if (url === '/api/login') {
    if (!ACCESS_CODE) return json(res, 200, { token: TOKEN });
    const ip = clientIp(req), list = recentFails(ip);
    if (list.length >= MAX_FAILS) return json(res, 429, { error: 'too many attempts' });
    if (safeEq(norm(body && body.code), ACCESS_CODE)) return json(res, 200, { token: TOKEN });
    list.push(Date.now()); fails.set(ip, list);
    return json(res, 401, { error: 'wrong code' });
  }

  if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
  try {
    const doc = await syncDoc(body);
    return json(res, 200, { ok: true, doc: doc });
  } catch (e) {
    return json(res, 503, { ok: false, error: 'storage' });
  }
}

/* ---------- קבצי האפליקציה (רשימה סגורה: שום דבר אחר לא מוגש) ---------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml'
};
const PUBLIC = /^\/(index\.html|manifest\.json|icon\.svg|(js|css)\/[A-Za-z0-9_-]+\.(js|css))$/;
function serveStatic(req, res, url) {
  let rel = url;
  try { rel = decodeURIComponent(url); } catch (e) { rel = ''; }
  if (rel === '/') rel = '/index.html';
  const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('לא נמצא'); };
  if (!PUBLIC.test(rel)) return notFound();
  fs.readFile(path.join(ROOT, rel), (err, data) => {
    if (err) return notFound();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)], 'Cache-Control': 'no-cache, must-revalidate' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/')) {
    return api(req, res, url).catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server' }); });
  }
  serveStatic(req, res, url);
}).listen(PORT, () => {
  console.log('ממלכת השחמט: http://localhost:' + PORT + (CLOUD ? ' (ענן)' : ' (מקומי)'));
  if (!READY) console.error('!!! חסר ACCESS_CODE - הסנכרון כבוי עד שיוגדר קוד משפחה');
  boot = checkStorage();
});
