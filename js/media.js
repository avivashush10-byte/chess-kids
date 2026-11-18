/* צלילים (מסונתזים, בלי קבצים) והקראה קולית בעברית דרך הדפדפן. */
(function () {
  'use strict';
  var KC = window.KC = window.KC || {};
  var ctx = null;
  var opts = { sound: true, voice: true };

  function ac() {
    if (!ctx) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, at, dur, type, vol, slideTo) {
    var a = ac();
    if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }

  var SFX = {
    tap: function () { tone(520, 0, 0.05, 'triangle', 0.12); },
    move: function () { tone(330, 0, 0.07, 'triangle', 0.25); tone(220, 0.04, 0.08, 'triangle', 0.2); },
    capture: function () { tone(420, 0, 0.09, 'square', 0.12, 180); tone(160, 0.07, 0.14, 'triangle', 0.25, 90); },
    star: function () { tone(880, 0, 0.1, 'sine', 0.22); tone(1320, 0.08, 0.16, 'sine', 0.22); },
    good: function () { tone(523, 0, 0.11, 'triangle', 0.22); tone(659, 0.1, 0.11, 'triangle', 0.22); tone(784, 0.2, 0.2, 'triangle', 0.24); },
    bad: function () { tone(220, 0, 0.22, 'sine', 0.25, 120); },
    check: function () { tone(740, 0, 0.1, 'square', 0.1); tone(740, 0.16, 0.14, 'square', 0.1); },
    win: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.2, 'triangle', 0.24); }); },
    lose: function () { tone(392, 0, 0.2, 'triangle', 0.2); tone(330, 0.2, 0.2, 'triangle', 0.2); tone(262, 0.4, 0.35, 'triangle', 0.2); }
  };

  function sfx(name) {
    if (!opts.sound || !SFX[name]) return;
    try { SFX[name](); } catch (e) { /* אין אודיו - ממשיכים בשקט */ }
  }

  /* ---------- הקראה ---------- */
  // ניקוד למילים שמנועי דיבור נוטים לקרוא לא נכון. מוצג על המסך בלי ניקוד.
  var NIKUD = {
    'שח': 'שַׁח', 'מט': 'מָט', 'פט': 'פָּט', 'תיקו': 'תֵּיקוּ', 'ר': 'רֵישׁ',
    'רץ': 'רָץ', 'הרץ': 'הָרָץ', 'רצים': 'רָצִים', 'הרצים': 'הָרָצִים',
    'פרש': 'פָּרָשׁ', 'הפרש': 'הַפָּרָשׁ', 'הפרשים': 'הַפָּרָשִׁים',
    'צריח': 'צְרִיחַ', 'הצריח': 'הַצְּרִיחַ', 'צריחים': 'צְרִיחִים',
    'רגלי': 'רַגְלִי', 'הרגלי': 'הָרַגְלִי', 'רגלים': 'רַגְלִים', 'הרגלים': 'הָרַגְלִים',
    'מלך': 'מֶלֶךְ', 'המלך': 'הַמֶּלֶךְ', 'מלכה': 'מַלְכָּה', 'המלכה': 'הַמַּלְכָּה',
    'הצרחה': 'הַצְרָחָה', 'מזלג': 'מַזְלֵג', 'ינשופי': 'יַנְשׁוּפִי',
    'אכלו': 'אִכְלוּ', 'הקישו': 'הַקִּישׁוּ', 'הזיזו': 'הָזִיזוּ', 'נסו': 'נַסּוּ', 'עשו': 'עֲשׂוּ',
    'תנו': 'תְּנוּ', 'אספו': 'אִסְפוּ', 'מצאו': 'מִצְאוּ', 'הצילו': 'הַצִּילוּ', 'עצרו': 'עִצְרוּ',
    'שימו': 'שִׂימוּ', 'בחרו': 'בַּחֲרוּ', 'קפצו': 'קִפְצוּ', 'חפשו': 'חַפְּשׂוּ', 'הגנו': 'הָגֵנּוּ'
  };

  function forSpeech(text) {
    var t = String(text);
    try { t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, ' '); } catch (e) { /* דפדפן ישן */ }
    return t.replace(/[א-ת]+/g, function (w) { return NIKUD[w] || w; });
  }

  var heVoice = null, voicesLoaded = false;
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    var vs = window.speechSynthesis.getVoices() || [];
    if (vs.length) voicesLoaded = true;
    heVoice = null;
    for (var i = 0; i < vs.length; i++) if (/^(he|iw)/i.test(vs[i].lang)) { heVoice = vs[i]; break; }
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function say(text) {
    if (!opts.voice || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(forSpeech(text));
      u.lang = 'he-IL';
      if (heVoice) u.voice = heVoice;
      u.rate = 0.9; u.pitch = 1.1;
      window.speechSynthesis.speak(u);
    } catch (e) { /* אין הקראה במכשיר */ }
  }

  function stop() { try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) { /* כלום */ } }

  KC.media = {
    sfx: sfx, say: say, stop: stop,
    set: function (o) { opts.sound = !!o.sound; opts.voice = !!o.voice; if (!opts.voice) stop(); },
    voiceState: function () {
      if (!('speechSynthesis' in window)) return 'none';
      if (!voicesLoaded) loadVoices();
      return heVoice ? 'he' : (voicesLoaded ? 'missing' : 'unknown');
    }
  };
})();
