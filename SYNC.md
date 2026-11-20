# סנכרון בין מכשירים – הכללים

המטרה: ילד שמשחק בטאבלט וממשיך בטלפון רואה את אותה התקדמות. **אף פעם לא מאבדים התקדמות.**

## איך זה עובד

- האפליקציה ממשיכה לעבוד מהמכשיר עצמו (localStorage). גם בלי אינטרנט וגם כשהשרת ישן – משחקים כרגיל.
- ברקע, המכשיר שולח לשרת את ההתקדמות שלו. השרת **ממזג** אותה עם מה ששמור אצלו, שומר, ומחזיר את התוצאה הממוזגת.
- מכשיר אף פעם לא "דורס" את השרת, והשרת אף פעם לא "דורס" את המכשיר: תמיד מיזוג.
- חיבור מכשיר: באזור ההורים מקלידים את קוד המשפחה, פעם אחת בכל מכשיר.

## כללי המיזוג (`js/merge.js`, אותו קוד בשרת ובדפדפן)

| מה | הכלל |
|---|---|
| ילדים | איחוד: ילד שקיים במכשיר אחד מופיע בכולם |
| אותו שם בשני מכשירים | זה אותו ילד – מתמזגים לפרופיל אחד (נשאר המזהה הוותיק) |
| כוכבים לשיעור | הגבוה מבין השניים |
| ניצחונות | הגבוה מבין השניים |
| מקום באמצע שיעור | האחרון לפי זמן. גם "סיימתי / התחלתי מחדש" נשמר עם זמן, כדי שמקום ישן לא יחזור |
| ילד שנמחק באזור ההורים | נשאר מחוק בכל המכשירים (נשמר סימון מחיקה) |
| הגדרות (צלילים, הקראה, עוזר, פתיחת שלבים) | לא מסונכרנות – נשארות לכל מכשיר |

המיזוג לא תלוי בסדר (א+ב = ב+א) וחזרה עליו לא משנה כלום, ולכן שליחה כפולה או שני מכשירים בו-זמנית לא מזיקים.

## כללי בטיחות בשרת

- בלי קוד משפחה נכון אין קריאה ואין כתיבה. בענן השרת מסרב לעבוד אם לא הוגדר קוד.
- אם הקריאה מהאחסון נכשלה או שהנתון השמור פגום – **לא כותבים** ומחזירים שגיאה (503). לא מחזירים "הצליח" כשלא נשמר.
- כל מה שמגיע ממכשיר מנוקה ומוגבל בגודל לפני שמירה.
- השרת מגיש רק את קבצי האפליקציה; קובץ הנתונים לא נגיש מבחוץ.
- בדיקות רצות על קובץ נתונים זמני ועל Upstash מדומה – אף פעם לא על הנתונים האמיתיים.

## הרצה

- מקומי: `node server.js` – נשמר ב-`data/sync.json`, בלי קוד.
- ענן (Render): משתני סביבה `ACCESS_CODE`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. המפתח ב-Upstash: `chess-kids:family`.
- בדיקות: `node tools/test-sync.js`

---

**English summary.** Local-first sync. Each device keeps playing from localStorage and, in the background, POSTs its profiles to `/api/sync`; the server merges them into the stored family document and returns the merged result. The merge (shared `js/merge.js`) is commutative and idempotent: union of children, same name = same child, max stars/wins, last-writer-wins resume position with tombstones, delete tombstones for removed profiles. Settings are per device. The server never reports success on a failed write and never overwrites when the stored document could not be read.
