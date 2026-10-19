/**
 * 盤面生成・検証（8×8 / 8色 / 各行・各列・各色に1匹 / 猫は隣接禁止）
 * ステージ番号をシードにするので、同じステージは誰がやっても同じ問題。
 * 解が1通りになるまで生成をくり返す（唯一解保証）。
 */
const Puzzle = (() => {
  const N = 8;
  const COLORS = [
    { hex: '#f4a9b8', name: 'ピンク' },
    { hex: '#ffc58a', name: 'オレンジ' },
    { hex: '#f7e37e', name: 'きいろ' },
    { hex: '#b5df92', name: 'きみどり' },
    { hex: '#9fd6ec', name: 'みずいろ' },
    { hex: '#adb9f2', name: 'あお' },
    { hex: '#d3aeea', name: 'むらさき' },
    { hex: '#dcc6ad', name: 'ベージュ' },
  ];

  function rngFrom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const range = () => [...Array(N).keys()];

  // 各行・各列に1匹、隣接なしの配置（sol[row] = col）
  function placeCats(rng) {
    const sol = []; const used = Array(N).fill(false);
    (function bt(r) {
      if (r === N) return true;
      for (const c of shuffle(range(), rng)) {
        if (used[c]) continue;
        if (r > 0 && Math.abs(sol[r - 1] - c) <= 1) continue;
        used[c] = true; sol[r] = c;
        if (bt(r + 1)) return true;
        used[c] = false;
      }
      return false;
    })(0);
    return sol;
  }

  // 猫の位置を種にしてランダムに領域を広げる（極端に大きい領域ができないよう上限付き）
  const MAX_REGION = 13;
  function growRegions(rng, sol) {
    const reg = Array(N * N).fill(-1);
    const size = Array(N).fill(1);
    sol.forEach((c, r) => { reg[r * N + c] = r; });
    let remaining = N * N - N;
    while (remaining > 0) {
      const i = Math.floor(rng() * N * N);
      if (reg[i] !== -1) continue;
      const r = Math.floor(i / N), c = i % N, nb = [];
      if (r > 0 && reg[i - N] !== -1) nb.push(reg[i - N]);
      if (r < N - 1 && reg[i + N] !== -1) nb.push(reg[i + N]);
      if (c > 0 && reg[i - 1] !== -1) nb.push(reg[i - 1]);
      if (c < N - 1 && reg[i + 1] !== -1) nb.push(reg[i + 1]);
      if (!nb.length) continue;
      const small = nb.filter(g => size[g] < MAX_REGION);
      const pool = small.length ? small : nb;
      const g = pool[Math.floor(rng() * pool.length)];
      reg[i] = g; size[g]++; remaining--;
    }
    return reg;
  }

  function countSolutions(reg, limit = 2) {
    let count = 0;
    const colUsed = Array(N).fill(false), regUsed = Array(N).fill(false), cols = [];
    (function bt(r) {
      if (count >= limit) return;
      if (r === N) { count++; return; }
      for (let c = 0; c < N; c++) {
        const g = reg[r * N + c];
        if (colUsed[c] || regUsed[g]) continue;
        if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue;
        colUsed[c] = regUsed[g] = true; cols[r] = c;
        bt(r + 1);
        colUsed[c] = regUsed[g] = false;
      }
    })(0);
    return count;
  }

  function generate(stage) {
    const rng = rngFrom(Math.imul(stage + 1, 2654435761) ^ 0x9e3779b9);
    for (let attempt = 0; attempt < 20000; attempt++) {
      const sol = placeCats(rng);
      for (let k = 0; k < 40; k++) {
        const reg = growRegions(rng, sol);
        if (countSolutions(reg) === 1) {
          const perm = shuffle(range(), rng);
          return { size: N, regions: reg.map(g => perm[g]), solution: sol };
        }
      }
    }
    throw new Error('問題を作れませんでした');
  }

  // marks: 0=空 1=× 2=猫
  function validate(regions, marks) {
    const cats = [];
    marks.forEach((m, i) => { if (m === 2) cats.push(i); });
    if (cats.length !== N) return false;
    const rows = new Set(), cols = new Set(), regs = new Set();
    for (const i of cats) {
      rows.add(Math.floor(i / N)); cols.add(i % N); regs.add(regions[i]);
    }
    if (rows.size !== N || cols.size !== N || regs.size !== N) return false;
    for (const a of cats) for (const b of cats) {
      if (a === b) continue;
      const dr = Math.abs(Math.floor(a / N) - Math.floor(b / N));
      const dc = Math.abs((a % N) - (b % N));
      if (dr <= 1 && dc <= 1) return false;
    }
    return true;
  }

  // 猫を置いた時の自動×対象（同じ行・列・周囲8マス）
  function autoXCells(marks) {
    const set = new Set();
    marks.forEach((m, i) => {
      if (m !== 2) return;
      const r = Math.floor(i / N), c = i % N;
      for (let k = 0; k < N; k++) { set.add(r * N + k); set.add(k * N + c); }
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) set.add(rr * N + cc);
      }
    });
    marks.forEach((m, i) => { if (m === 2) set.delete(i); });
    return set;
  }

  /**
   * ヒント用の分析：猫がまだいない行・列・色ブロックのうち、
   * 候補マスが最も少ないものを探す（答えのマスそのものは渡さない）
   */
  function analyze(regions, marks) {
    const blocked = new Set();
    const catRegions = new Set(), catRows = new Set(), catCols = new Set();
    marks.forEach((m, i) => {
      if (m === 1) blocked.add(i);
      if (m === 2) { catRegions.add(regions[i]); catRows.add(Math.floor(i / N)); catCols.add(i % N); }
    });
    autoXCells(marks).forEach(i => blocked.add(i));
    marks.forEach((m, i) => { if (m === 2) blocked.add(i); });

    const groups = [];
    for (let g = 0; g < N; g++) if (!catRegions.has(g)) {
      const cells = []; for (let i = 0; i < N * N; i++) if (regions[i] === g && !blocked.has(i)) cells.push(i);
      groups.push({ kind: 'ブロック', name: `${COLORS[g].name}のブロック`, cells });
    }
    for (let r = 0; r < N; r++) if (!catRows.has(r)) {
      const cells = []; for (let c = 0; c < N; c++) if (!blocked.has(r * N + c)) cells.push(r * N + c);
      groups.push({ kind: '行', name: `上から${r + 1}行目`, cells });
    }
    for (let c = 0; c < N; c++) if (!catCols.has(c)) {
      const cells = []; for (let r = 0; r < N; r++) if (!blocked.has(r * N + c)) cells.push(r * N + c);
      groups.push({ kind: '列', name: `左から${c + 1}列目`, cells });
    }
    if (!groups.length) return null;
    groups.sort((a, b) => a.cells.length - b.cells.length || (a.kind === 'ブロック' ? -1 : 1));
    const t = groups[0];
    const rowsOf = new Set(t.cells.map(i => Math.floor(i / N)));
    const colsOf = new Set(t.cells.map(i => i % N));
    let pattern = '';
    if (t.kind === 'ブロック' && rowsOf.size === 1) pattern = `候補がすべて上から${[...rowsOf][0] + 1}行目に並んでいる（その行の他のマスには置けない）`;
    else if (t.kind === 'ブロック' && colsOf.size === 1) pattern = `候補がすべて左から${[...colsOf][0] + 1}列目に並んでいる（その列の他のマスには置けない）`;
    return {
      kind: t.kind, name: t.name, candidates: t.cells.length, pattern,
      catsPlaced: marks.filter(m => m === 2).length,
    };
  }

  return { N, COLORS, generate, validate, autoXCells, analyze };
})();
