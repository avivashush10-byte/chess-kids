/* בדיקות לשמירת ההתקדמות: כל ילד בנפרד, והמשך מאמצע שיעור.
   רץ על localStorage מדומה בזיכרון בלבד - לא נוגע בשום נתון אמיתי. */
const mem = {};
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); }
};
require('../js/ui.js');
const S = globalThis.KC.store;

let errors = 0;
function eq(got, want, name) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) errors++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`));
}
function attempt(name, fn) {
  try { fn(); } catch (e) { errors++; console.log('  ✗ ' + name + '  (' + e.message + ')'); }
}
const saved = () => JSON.parse(mem['chessKids.v1']);
const pick = (id) => { S.data.current = id; };

S.data.profiles.push({ id: 'a', name: 'ילד א', avatar: '🦁', stars: {}, wins: {} });
S.data.profiles.push({ id: 'b', name: 'ילד ב', avatar: '🐼', stars: {}, wins: {} });

console.log('== כוכבים לכל ילד בנפרד ==');
attempt('כוכבים', () => {
  pick('a'); S.setStars('board', 3);
  pick('b');
  eq(S.stars('board'), 0, 'ילד ב לא מקבל כוכבים של ילד א');
  pick('a');
  eq(S.stars('board'), 3, 'הכוכבים של ילד א נשמרו');
});

console.log('== המשך מאמצע שיעור ==');
attempt('שמירת מקום', () => {
  pick('a'); S.setResume('rook', 4, 2);
  const r = S.resume('rook');
  eq(r && [r.i, r.m], [4, 2], 'המקום והטעויות נשמרים');
  eq(typeof (r && r.t), 'number', 'נשמר גם מתי (כדי לדעת מה האחרון)');
  eq(saved().profiles[0].resume.rook.i, 4, 'נכתב לאחסון של המכשיר');
});
attempt('הפרדה בין ילדים', () => {
  pick('b');
  eq(S.resume('rook'), null, 'ילד ב לא רואה את המקום של ילד א');
  S.setResume('rook', 1, 0);
  pick('a');
  eq(S.resume('rook').i, 4, 'המקום של ילד א לא השתנה כשילד ב התקדם');
  eq(S.resume('rook', S.data.profiles[1]).i, 1, 'אפשר לקרוא מקום של ילד מסוים');
});
attempt('ניקוי', () => {
  pick('a'); S.setResume('rook', 0, 0);
  eq(S.resume('rook'), null, 'חזרה לצעד הראשון מוחקת את המקום השמור');
  eq(saved().profiles[0].resume.rook.i, 0, 'באחסון נשאר סימון "נוקה" עם זמן (בשביל הסנכרון בין מכשירים)');
  S.setResume('never-started', 0, 0);
  eq('never-started' in saved().profiles[0].resume, false, 'שיעור שלא נקטע אף פעם לא משאיר סימון מיותר');
  eq(S.resume('rook', S.data.profiles[1]).i, 1, 'המקום של ילד ב נשאר');
});
attempt('פרופיל ישן', () => {
  S.data.profiles.push({ id: 'old', name: 'ישן', avatar: '🐸', stars: { board: 2 } });
  pick('old');
  eq(S.resume('board'), null, 'פרופיל שנשמר לפני העדכון עובד בלי שגיאה');
  S.setResume('board', 2, 1);
  eq(S.resume('board').i, 2, 'ואפשר לשמור בו מקום');
  eq(S.stars('board'), 2, 'והכוכבים הישנים שלו נשארו');
});
attempt('בלי ילד נבחר', () => {
  pick(null);
  S.setResume('rook', 3, 0);
  eq(S.resume('rook'), null, 'בלי ילד נבחר לא נשמר כלום ואין שגיאה');
});

console.log('== מחיקת ילד ושמירה שקטה ==');
attempt('מחיקה', () => {
  let touched = 0;
  globalThis.KC.sync = { touch: () => { touched++; } };
  S.removeProfile('b');
  eq(S.data.profiles.some((p) => p.id === 'b'), false, 'הילד נמחק');
  eq(typeof saved().deleted.b, 'number', 'נשמר סימון מחיקה עם זמן');
  eq(touched, 1, 'שמירה רגילה מבקשת סנכרון');
  S.save(true);
  eq(touched, 1, 'שמירה שקטה (של הסנכרון עצמו) לא מבקשת סנכרון נוסף');
  pick('a'); S.removeProfile('a');
  eq(S.data.current, null, 'מחיקת הילד הנבחר מבטלת את הבחירה');
});

console.log(errors ? `\n${errors} ERROR(S)` : '\nALL OK');
process.exit(errors ? 1 : 0);
