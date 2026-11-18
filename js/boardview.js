/* תצוגת הלוח: משבצות, כלים עם אנימציה, סימונים, חצים וכוכבים. */
(function () {
  'use strict';
  var KC = window.KC, P = KC.pieces;
  var MARKS = ['sel', 'move', 'cap', 'risky', 'last', 'check', 'danger', 'hint', 'good', 'forbid', 'pulse'];
  var COLORS = { red: '#ff4d67', purple: '#7c5cff', green: '#22a66c' };

  function pos(d, i) { d.style.left = (i & 7) * 12.5 + '%'; d.style.top = (i >> 3) * 12.5 + '%'; }

  function BoardView(el, onTap) {
    var self = this;
    this.el = el;
    el.innerHTML = '';
    var squares = document.createElement('div');
    squares.className = 'squares';
    this.sqs = [];
    for (var i = 0; i < 64; i++) {
      var d = document.createElement('div');
      d.className = 'sq ' + (((i >> 3) + (i & 7)) % 2 ? 'dark' : 'light');
      squares.appendChild(d);
      this.sqs.push(d);
    }
    el.appendChild(squares);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '0 0 8 8');
    this.svg.setAttribute('class', 'arrows');
    this.piecesEl = document.createElement('div');
    this.piecesEl.className = 'pieces';
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    el.appendChild(this.piecesEl);
    el.appendChild(this.svg);
    el.appendChild(this.overlay);
    this.pcs = {};
    this.stars = [];
    this.labels = {};

    el.addEventListener('click', function (e) {
      var r = el.getBoundingClientRect();
      var c = Math.floor((e.clientX - r.left) / r.width * 8), row = Math.floor((e.clientY - r.top) / r.height * 8);
      if (c >= 0 && c < 8 && row >= 0 && row < 8) onTap(row * 8 + c);
    });

    function fit() { el.style.fontSize = (el.clientWidth / 8) + 'px'; }
    fit();
    if (window.ResizeObserver) { this.ro = new ResizeObserver(fit); this.ro.observe(el); }
    else window.addEventListener('resize', fit);
  }

  BoardView.prototype.setBoard = function (board) {
    clearTimeout(this._t);
    this.board = board.slice();
    this.piecesEl.innerHTML = '';
    this.pcs = {};
    for (var i = 0; i < 64; i++) {
      if (!board[i]) continue;
      var d = document.createElement('div');
      d.className = 'piece';
      pos(d, i);
      d.innerHTML = P.svg(board[i]);
      this.piecesEl.appendChild(d);
      this.pcs[i] = d;
    }
  };

  // מזיז כלים באנימציה ואז מציג את הלוח החדש
  BoardView.prototype.animate = function (list, newBoard, cb) {
    var self = this;
    list.forEach(function (m) {
      var d = self.pcs[m.from], cap = self.pcs[m.to];
      if (cap && cap !== d) cap.classList.add('captured');
      if (d) { d.classList.add('moving'); pos(d, m.to); }
    });
    clearTimeout(this._t);
    this._t = setTimeout(function () { self.setBoard(newBoard); if (cb) cb(); }, 300);
  };

  BoardView.prototype.mark = function (i, cls) { this.sqs[i].classList.add(cls); };
  BoardView.prototype.unmark = function (cls) { for (var i = 0; i < 64; i++) this.sqs[i].classList.remove(cls); };
  BoardView.prototype.clearMarks = function () {
    for (var i = 0; i < 64; i++) for (var k = 0; k < MARKS.length; k++) this.sqs[i].classList.remove(MARKS[k]);
  };

  BoardView.prototype.setArrows = function (list) {
    var html = '<defs>';
    Object.keys(COLORS).forEach(function (k) {
      html += '<marker id="ah-' + k + '" markerWidth="3.2" markerHeight="3.2" refX="1.6" refY="1.6" orient="auto"><path d="M0,0 L3.2,1.6 L0,3.2 Z" fill="' + COLORS[k] + '"/></marker>';
    });
    html += '</defs>';
    (list || []).forEach(function (a) {
      var x1 = (a[0] & 7) + 0.5, y1 = (a[0] >> 3) + 0.5, x2 = (a[1] & 7) + 0.5, y2 = (a[1] >> 3) + 0.5;
      var len = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)) || 1, cut = 0.38;
      var col = a[2] || 'red';
      html += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + (x2 - (x2 - x1) / len * cut) + '" y2="' + (y2 - (y2 - y1) / len * cut) +
        '" stroke="' + COLORS[col] + '" stroke-width="0.17" stroke-linecap="round" marker-end="url(#ah-' + col + ')"/>';
    });
    this.svg.innerHTML = html;
  };

  BoardView.prototype.drawOverlay = function () {
    var self = this, html = '';
    this.stars.forEach(function (i) {
      html += '<div class="star" style="left:' + (i & 7) * 12.5 + '%;top:' + (i >> 3) * 12.5 + '%">⭐</div>';
    });
    Object.keys(this.labels).forEach(function (n) {
      var i = KC.chess.sq(n);
      html += '<div class="sq-label" style="left:' + (i & 7) * 12.5 + '%;top:' + ((i >> 3) - 1) * 12.5 + '%"><span>' + self.labels[n] + '</span></div>';
    });
    this.overlay.innerHTML = html;
  };
  BoardView.prototype.setStars = function (list) { this.stars = list.slice(); this.drawOverlay(); };
  BoardView.prototype.setLabels = function (map) { this.labels = map || {}; this.drawOverlay(); };

  BoardView.prototype.reset = function () {
    this.clearMarks();
    this.setArrows([]);
    this.stars = [];
    this.labels = {};
    this.drawOverlay();
  };

  KC.BoardView = BoardView;
})();
