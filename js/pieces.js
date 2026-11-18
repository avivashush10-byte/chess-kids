/* ציור הכלים ב-SVG: צורות פשוטות וידידותיות עם עיניים. */
(function () {
  'use strict';
  var KC = window.KC = window.KC || {};

  var BASE = '<path d="M22 92 Q22 80 32 80 H68 Q78 80 78 92 Z"/>';
  var SHAPES = {
    P: '<path d="M36 80 C38 64 44 58 44 50 H56 C56 58 62 64 64 80 Z"/><rect x="37" y="44" width="26" height="8" rx="4"/><circle cx="50" cy="29" r="15"/>',
    R: '<path d="M34 80 L37 46 H63 L66 80 Z"/><path d="M27 46 V20 H38 V28 H45 V20 H55 V28 H62 V20 H73 V46 Z"/>',
    B: '<path d="M36 80 C40 68 44 64 44 58 H56 C56 64 60 68 64 80 Z"/><rect x="36" y="52" width="28" height="8" rx="4"/><path d="M50 14 C63 24 67 38 62 48 Q50 56 38 48 C33 38 37 24 50 14 Z"/><circle cx="50" cy="11" r="5"/>',
    N: '<path d="M33 80 C33 64 44 58 42 47 C36 51 30 53 24 49 C19 45 22 40 26 36 C32 28 36 18 48 14 L46 5 L57 12 C71 18 77 38 70 80 Z"/>',
    Q: '<path d="M34 80 L26 36 L40 54 L50 28 L60 54 L74 36 L66 80 Z"/><circle cx="26" cy="32" r="5.5"/><circle cx="50" cy="24" r="6"/><circle cx="74" cy="32" r="5.5"/>',
    K: '<path d="M34 80 L26 42 L39 52 L50 40 L61 52 L74 42 L66 80 Z"/><path d="M47 6 H53 V13 H60 V19 H53 V40 H47 V19 H40 V13 H47 Z"/>'
  };
  var LINES = {
    B: '<path d="M57 24 L49 34"/>',
    N: '<path d="M59 23 C66 33 68 48 66 64"/>'
  };
  var EYES = { P: [[45, 27], [55, 27]], R: [[44, 34], [56, 34]], B: [[45, 38], [55, 38]], N: [[41, 30]], Q: [[44, 64], [56, 64]], K: [[44, 63], [56, 63]] };

  function svg(code) {
    var t = code.charAt(1);
    if (t === 'X') {
      return '<svg viewBox="0 0 100 100" class="pc rock"><path d="M14 86 L24 52 L44 32 L68 36 L84 60 L88 86 Z" fill="#aab0c8" stroke="#6b7191" stroke-width="4" stroke-linejoin="round"/><path d="M44 32 L52 56 L84 60 M52 56 L36 86" fill="none" stroke="#6b7191" stroke-width="3" stroke-linecap="round" opacity=".6"/></svg>';
    }
    var w = code.charAt(0) === 'w';
    var fill = w ? '#ffffff' : '#51467a', stroke = w ? '#3a335c' : '#1f1a38', eye = w ? '#3a335c' : '#ffffff';
    var e = EYES[t], face = '';
    for (var i = 0; i < e.length; i++) face += '<circle cx="' + e[i][0] + '" cy="' + e[i][1] + '" r="2.8"/>';
    var mouth = '';
    if (e.length === 2) {
      var mx = (e[0][0] + e[1][0]) / 2, my = e[0][1] + 5;
      mouth = '<path d="M' + (mx - 4) + ' ' + my + ' Q' + mx + ' ' + (my + 5) + ' ' + (mx + 4) + ' ' + my + '" fill="none" stroke="' + eye + '" stroke-width="2.2" stroke-linecap="round"/>';
    } else {
      mouth = '<circle cx="27" cy="43" r="1.6" fill="' + eye + '"/>';
    }
    return '<svg viewBox="0 0 100 100" class="pc">' +
      '<g fill="' + fill + '" stroke="' + stroke + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">' + SHAPES[t] + BASE +
      (LINES[t] ? '<g fill="none">' + LINES[t] + '</g>' : '') + '</g>' +
      '<g fill="' + eye + '">' + face + '</g>' + mouth + '</svg>';
  }

  KC.pieces = { svg: svg };
  KC.NAMES = { K: 'מלך', Q: 'מלכה', R: 'צריח', B: 'רץ', N: 'פרש', P: 'רגלי' };
  KC.THE = { K: 'המלך', Q: 'המלכה', R: 'הצריח', B: 'הרץ', N: 'הפרש', P: 'הרגלי' };
  KC.THIS = { K: 'זה מלך', Q: 'זאת מלכה', R: 'זה צריח', B: 'זה רץ', N: 'זה פרש', P: 'זה רגלי' };
})();
