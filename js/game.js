/**
 * ゲーム画面の制御
 * タップ: 空 → × → 猫 → 空
 * 正解でないマスに猫を置くと魚が1匹減り、そのマスは×になる
 */
const Game = (() => {
  const N = Puzzle.N;
  let st = null;
  let el = {};

  const CAT_SVG = `<svg class="cat" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M11 24 L14 5 L27 15 Q32 14 37 15 L50 5 L53 24 Q58 32 55 42 Q50 57 32 57 Q14 57 9 42 Q6 32 11 24Z" fill="#2b2233"/>
    <path d="M17 12 L24 17 L18 20Z M47 12 L40 17 L46 20Z" fill="#f4a9b8"/>
    <ellipse cx="23" cy="34" rx="5" ry="5.5" fill="#ffd23f"/><ellipse cx="41" cy="34" rx="5" ry="5.5" fill="#ffd23f"/>
    <ellipse cx="23" cy="34" rx="1.8" ry="4" fill="#2b2233"/><ellipse cx="41" cy="34" rx="1.8" ry="4" fill="#2b2233"/>
    <path d="M29.5 42 L34.5 42 L32 45Z" fill="#f4a9b8"/>
    <path d="M32 45 Q29 49 26 47 M32 45 Q35 49 38 47" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"/>
  </svg>`;
  const FISH_SVG = `<svg viewBox="0 0 48 28" aria-hidden="true">
    <path d="M3 14 Q15 0 31 8 L44 2 L40 14 L44 26 L31 20 Q15 28 3 14Z" fill="#3d8fd1"/>
    <circle cx="12" cy="12" r="2.2" fill="#fff"/><circle cx="12" cy="12" r="1" fill="#16314d"/>
    <path d="M20 9 Q23 14 20 19" stroke="#bfe0f7" stroke-width="1.6" fill="none"/>
  </svg>`;

  function $(id) { return document.getElementById(id); }

  function init() {
    el = {
      board: $('board'), counter: $('catCounter'), lives: $('lives'), timer: $('timer'),
      stageLabel: $('stageLabel'), hintBubble: $('hintBubble'), hintText: $('hintText'),
      loading: $('boardLoading'),
    };
    el.board.addEventListener('click', e => {
      const cell = e.target.closest('.cell');
      if (cell) onTap(Number(cell.dataset.i));
    });
    $('btnUndo').addEventListener('click', undo);
    $('btnReset').addEventListener('click', resetBoard);
    $('btnHint').addEventListener('click', hint);
    $('hintClose').addEventListener('click', () => el.hintBubble.hidden = true);
  }

  function start(stage) {
    stop();
    el.loading.hidden = false;
    el.board.innerHTML = '';
    el.hintBubble.hidden = true;
    el.stageLabel.textContent = `ステージ ${stage}`;
    // 生成で一瞬固まるのでローディングを描画してから
    setTimeout(() => {
      const p = Puzzle.generate(stage);
      st = {
        stage, regions: p.regions, solution: p.solution,
        marks: Array(N * N).fill(0), history: [],
        lives: APP_CONFIG.MAX_LIVES, mistakes: 0,
        startTime: Date.now(), timerId: null, finished: false,
      };
      el.loading.hidden = true;
      buildBoard();
      render();
      st.timerId = setInterval(tick, 1000);
      tick();
      Sound.say('ニャー！スタート！');
    }, 30);
  }

  function stop() {
    if (st && st.timerId) clearInterval(st.timerId);
  }

  function elapsed() { return st ? Date.now() - st.startTime : 0; }

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function tick() { if (st && !st.finished) el.timer.textContent = fmt(elapsed()); }

  function buildBoard() {
    const R = st.regions;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < N * N; i++) {
      const r = Math.floor(i / N), c = i % N, g = R[i];
      const b = document.createElement('button');
      b.className = 'cell';
      b.type = 'button';
      b.dataset.i = i;
      b.style.background = Puzzle.COLORS[g].hex;
      const thick = '3px solid var(--ink)', thin = '1px solid rgba(43,34,51,.18)';
      b.style.borderTop = (r === 0 || R[i - N] !== g) ? thick : thin;
      b.style.borderLeft = (c === 0 || R[i - 1] !== g) ? thick : thin;
      b.style.borderBottom = (r === N - 1) ? thick : 'none';
      b.style.borderRight = (c === N - 1) ? thick : 'none';
      b.setAttribute('aria-label', `${r + 1}行${c + 1}列 ${Puzzle.COLORS[g].name}`);
      frag.appendChild(b);
    }
    el.board.appendChild(frag);
  }

  function render() {
    const auto = Settings.get('autoX') ? Puzzle.autoXCells(st.marks) : new Set();
    const cells = el.board.children;
    for (let i = 0; i < N * N; i++) {
      const m = st.marks[i], cell = cells[i];
      let html = '';
      if (m === 2) html = CAT_SVG;
      else if (m === 1) html = '<span class="x">×</span>';
      else if (auto.has(i)) html = '<span class="x auto">×</span>';
      if (cell.dataset.state !== `${m}${auto.has(i) ? 'a' : ''}`) {
        cell.innerHTML = html;
        cell.dataset.state = `${m}${auto.has(i) ? 'a' : ''}`;
      }
      cell.classList.toggle('has-cat', m === 2);
    }
    const cats = st.marks.filter(m => m === 2).length;
    el.counter.textContent = `${cats}/${N}`;
    el.lives.innerHTML = '';
    for (let k = 0; k < APP_CONFIG.MAX_LIVES; k++) {
      const s = document.createElement('span');
      s.className = 'fish' + (k >= st.lives ? ' lost' : '');
      s.innerHTML = FISH_SVG;
      el.lives.appendChild(s);
    }
  }

  function onTap(i) {
    if (!st || st.finished) return;
    const next = (st.marks[i] + 1) % 3;
    st.history.push(st.marks.slice());
    if (st.history.length > 200) st.history.shift();

    if (next === 2) {
      const r = Math.floor(i / N), c = i % N;
      if (st.solution[r] !== c) { mistake(i); return; }
      st.marks[i] = 2;
      Sound.sfx('cat');
      render();
      const cell = el.board.children[i];
      cell.classList.remove('pop'); void cell.offsetWidth; cell.classList.add('pop');
      checkClear();
      return;
    }
    st.marks[i] = next;
    Sound.sfx('tap');
    render();
  }

  function mistake(i) {
    st.marks[i] = 1;
    st.lives--;
    st.mistakes++;
    Sound.sfx('miss');
    render();
    const cell = el.board.children[i];
    cell.classList.remove('shake'); void cell.offsetWidth; cell.classList.add('shake');
    if (st.lives <= 0) {
      st.finished = true; stop();
      setTimeout(() => App.showGameOver(st.stage), 500);
      Sound.say('あらら…お魚がなくなっちゃったニャ。もう一回やってみよう！');
    }
  }

  function undo() {
    if (!st || st.finished || !st.history.length) return;
    st.marks = st.history.pop();
    render();
  }

  function resetBoard() {
    if (!st || st.finished) return;
    if (!st.marks.some(m => m)) return;
    if (!confirm('盤面をまっさらに戻しますか？（時間と魚はそのまま）')) return;
    st.history.push(st.marks.slice());
    st.marks = Array(N * N).fill(0);
    render();
  }

  function checkClear() {
    if (st.marks.filter(m => m === 2).length !== N) return;
    if (!Puzzle.validate(st.regions, st.marks)) return;
    st.finished = true; stop();
    const timeMs = elapsed();
    el.timer.textContent = fmt(timeMs);
    Sound.sfx('clear');
    setTimeout(() => App.showClear({ stage: st.stage, timeMs, mistakes: st.mistakes, timeText: fmt(timeMs) }), 600);
  }

  async function hint() {
    if (!st || st.finished) return;
    const info = Puzzle.analyze(st.regions, st.marks);
    if (!info) return;
    const local = info.pattern
      ? `${info.name}を見てみて。${info.pattern}ニャ。`
      : `${info.name}に注目ニャ。猫が置けそうなマスは残り${info.candidates}つだけだよ。`;
    el.hintBubble.hidden = false;
    el.hintText.textContent = '考え中ニャ…';
    let text = local;
    try {
      const r = await Api.call('hint', { info });
      if (r.text) text = r.text;
    } catch (e) { /* ローカルヒントで代用 */ }
    if (st.finished) return;
    el.hintText.textContent = text;
    Sound.say(text);
  }

  function refresh() { if (st) render(); }
  function currentStage() { return st ? st.stage : 1; }

  return { init, start, stop, refresh, currentStage, CAT_SVG };
})();
