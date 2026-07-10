/* generate_b_questions.js — 科目B(アルゴリズム)のトレース問題を機械生成する(依存なし)
 *
 * ねらい: 擬似言語のプログラムを生成し、その戻り値を JS で計算する。
 *   出力する擬似言語と JS の計算を同じロジックで対応させることで、正答を構造的に保証する。
 *   「次の関数 f を実行したときの戻り値はどれか」という科目Bらしいトレース問題を量産する。
 *
 * 生成テンプレート:
 *   cdiv   1〜N のうち k の倍数の個数
 *   srange a〜b の総和
 *   asum   配列の総和
 *   amax   配列の最大値
 *   halve  x を 1 になるまで半分にする回数
 *   pow    b の n 乗
 *   gcd    ユークリッドの互除法(最大公約数)
 *   cgt    配列で t より大きい要素の個数
 *
 * questionId に全パラメータを埋め込むため、別スクリプトで独立に再計算・検証できる。
 * 実行: node tools/generate_b_questions.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'docs');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260708);
const pick = (a) => a[Math.floor(rng() * a.length)];
const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const arr = (n, lo, hi) => Array.from({ length: n }, () => randInt(lo, hi));
const renderArr = (a) => '{' + a.join(', ') + '}';

// 正解(整数)＋ダミー候補から、重複しない4択(数値文字列)を作る
function buildChoices(correct, cands) {
  const used = new Set([correct]);
  const chosen = [];
  const consider = (v) => { if (v == null || !Number.isFinite(v) || v < 0) return; v = Math.round(v); if (used.has(v)) return; used.add(v); chosen.push(v); };
  cands.forEach(consider);
  [correct + 1, correct - 1, correct + 2, Math.max(0, correct * 2), correct + 3].forEach(v => { if (chosen.length < 3) consider(v); });
  const items = shuffle([{ v: correct, ok: true }, ...chosen.slice(0, 3).map(v => ({ v, ok: false }))]);
  return { choices: items.map(x => String(x.v)), correctIndex: items.findIndex(x => x.ok) };
}

const TEXT = '次の関数 f を実行したときの戻り値はどれか。';
const questions = [];
const seen = new Set();

const GEN = {
  cdiv() {
    const N = pick([10, 12, 15, 20, 24, 30, 50, 100]);
    const k = pick([2, 3, 4, 5, 6]);
    const ans = Math.floor(N / k);
    const program = `○整数型: f()\n  整数型: count ← 0\n  整数型: i\n  for (i を 1 から ${N} まで 1 ずつ増やす)\n    if ((i mod ${k}) が 0 と等しい)\n      count ← count + 1\n    endif\n  endfor\n  return count`;
    const { choices, correctIndex } = buildChoices(ans, [Math.floor(N / k) + 1, Math.floor(N / (k + 1)), N - ans, k]);
    return { idKey: `cdiv_${N}_${k}`, program, choices, correctIndex, explanation: `iを1から${N}まで1つずつ増やしながら、「iを${k}で割った余りが0(=${k}の倍数)」のときだけcountを増やしている。1〜${N} のうち ${k} の倍数の個数を数える処理なので、答えは ${N} ÷ ${k} の商 = ${ans}。` };
  },
  srange() {
    const a = pick([1, 2, 3, 5, 10]);
    const b = pick([10, 15, 20, 25, 50, 100]);
    if (b <= a) return null;
    const ans = (a + b) * (b - a + 1) / 2;
    const program = `○整数型: f()\n  整数型: sum ← 0\n  整数型: i\n  for (i を ${a} から ${b} まで 1 ずつ増やす)\n    sum ← sum + i\n  endfor\n  return sum`;
    const { choices, correctIndex } = buildChoices(ans, [(1 + b) * b / 2, (a + b), b - a + 1, ans - a]);
    return { idKey: `srange_${a}_${b}`, program, choices, correctIndex, explanation: `iを${a}から${b}まで1つずつ増やしながら、そのたびにsumへ加算していく処理。${a} から ${b} までの総和 = (${a}+${b})×(${b}-${a}+1)÷2 = ${ans}。` };
  },
  asum() {
    const a = arr(pick([4, 5, 6]), 1, 20);
    const ans = a.reduce((s, x) => s + x, 0);
    const program = `○整数型: f()\n  整数型の配列: A ← ${renderArr(a)}\n  整数型: sum ← 0\n  整数型: i\n  for (i を 1 から A の要素数 まで 1 ずつ増やす)\n    sum ← sum + A[i]\n  endfor\n  return sum`;
    const { choices, correctIndex } = buildChoices(ans, [ans - a[0], ans + a[a.length - 1], Math.max(...a), a.length]);
    return { idKey: `asum_${a.join('-')}`, program, choices, correctIndex, explanation: `配列の先頭から末尾まで順に見て、sumへ足し込んでいく処理。配列 ${renderArr(a)} の全要素の和 = ${ans}。` };
  },
  amax() {
    const a = arr(pick([4, 5, 6]), 1, 40);
    const ans = Math.max(...a);
    const program = `○整数型: f()\n  整数型の配列: A ← ${renderArr(a)}\n  整数型: r ← A[1]\n  整数型: i\n  for (i を 2 から A の要素数 まで 1 ずつ増やす)\n    if (A[i] > r)\n      r ← A[i]\n    endif\n  endfor\n  return r`;
    const { choices, correctIndex } = buildChoices(ans, [Math.min(...a), a[0], a[a.length - 1], ans - 1]);
    return { idKey: `amax_${a.join('-')}`, program, choices, correctIndex, explanation: `rを1番目の要素で初期化し、以降の要素と比べて大きければrを更新していく処理(最大値の更新)。配列 ${renderArr(a)} の最大値 = ${ans}。` };
  },
  halve() {
    const N = pick([8, 10, 16, 20, 32, 50, 64, 100]);
    let x = N, count = 0;
    while (x > 1) { x = Math.floor(x / 2); count++; }
    const program = `○整数型: f()\n  整数型: x ← ${N}\n  整数型: count ← 0\n  while (x > 1)\n    x ← x ÷ 2 の商\n    count ← count + 1\n  endwhile\n  return count`;
    const { choices, correctIndex } = buildChoices(count, [count + 1, count - 1, N / 2, count + 2]);
    return { idKey: `halve_${N}`, program, choices, correctIndex, explanation: `while文で「xが1より大きい間」ループし、毎回xを2で割ってcountを増やす。x=${N} を 1 になるまで整数除算で半分にする回数を数える処理なので、答えは ${count}。` };
  },
  pow() {
    const b = pick([2, 3, 5]);
    const n = pick([2, 3, 4, 5]);
    const ans = Math.pow(b, n);
    if (ans > 100000) return null;
    const program = `○整数型: f()\n  整数型: r ← 1\n  整数型: i\n  for (i を 1 から ${n} まで 1 ずつ増やす)\n    r ← r × ${b}\n  endfor\n  return r`;
    const { choices, correctIndex } = buildChoices(ans, [b * n, Math.pow(b, n - 1), Math.pow(b, n + 1), b + n]);
    return { idKey: `pow_${b}_${n}`, program, choices, correctIndex, explanation: `rを1で初期化し、ループのたびに${b}を掛けていく処理(累乗の計算)。r に ${b} を ${n} 回掛ける = ${b} の ${n} 乗 = ${ans}。` };
  },
  gcd() {
    const A = pick([12, 18, 24, 36, 48, 60, 84, 100]);
    const B = pick([8, 15, 16, 20, 28, 42, 45, 56]);
    let a = A, b = B; while (b !== 0) { const t = a % b; a = b; b = t; }
    const program = `○整数型: f()\n  整数型: a ← ${A}\n  整数型: b ← ${B}\n  while (b ≠ 0)\n    整数型: t ← a mod b\n    a ← b\n    b ← t\n  endwhile\n  return a`;
    const { choices, correctIndex } = buildChoices(a, [a * 2, Math.min(A, B), a + 1, Math.abs(A - B)]);
    return { idKey: `gcd_${A}_${B}`, program, choices, correctIndex, explanation: `「aをbで割った余りをtとし、bをaに、tをbに置き換える」を bが0になるまで繰り返す、ユークリッドの互除法。${A} と ${B} の最大公約数を求める処理で、答えは ${a}。` };
  },
  cgt() {
    const a = arr(pick([5, 6, 7]), 1, 20);
    const t = pick([5, 8, 10, 12]);
    const ans = a.filter(x => x > t).length;
    const program = `○整数型: f()\n  整数型の配列: A ← ${renderArr(a)}\n  整数型: count ← 0\n  整数型: i\n  for (i を 1 から A の要素数 まで 1 ずつ増やす)\n    if (A[i] > ${t})\n      count ← count + 1\n    endif\n  endfor\n  return count`;
    const { choices, correctIndex } = buildChoices(ans, [a.length - ans, ans + 1, a.length, a.filter(x => x >= t).length]);
    return { idKey: `cgt_${t}_${a.join('-')}`, program, choices, correctIndex, explanation: `配列の各要素を順に調べ、${t}より大きいものだけcountを増やしていく処理。配列 ${renderArr(a)} で ${t} より大きい要素の個数 = ${ans}。` };
  }
};

const TARGET = { cdiv: 14, srange: 12, asum: 14, amax: 14, halve: 10, pow: 12, gcd: 14, cgt: 14 };
for (const [type, want] of Object.entries(TARGET)) {
  let made = 0, attempts = 0;
  while (made < want && attempts < want * 80) {
    attempts++;
    const g = GEN[type]();
    if (!g) continue;
    if (seen.has(g.idKey)) continue;
    seen.add(g.idKey);
    questions.push({
      questionId: `gb_${g.idKey}`,
      genre: 'アルゴリズム',
      subcat: 'アルゴリズム',
      text: TEXT,
      program: g.program,
      choices: g.choices,
      correctIndex: g.correctIndex,
      explanation: g.explanation,
      source: '生成問題(科目B / トレース)',
      relatedWordIds: []
    });
    made++;
  }
}

const out = {
  qualification: 'FE', version: 1, generatedAt: new Date().toISOString().slice(0, 10),
  note: '科目B(アルゴリズム)のトレース問題を自動生成(tools/generate_b_questions.js)。擬似言語を生成し戻り値をコードで計算して正答を保証。',
  questions
};
const outPath = path.join(ROOT, 'qualifications/fe/questions_b_generated.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1), 'utf8');
const byType = {}; questions.forEach(q => { const t = q.questionId.split('_')[1]; byType[t] = (byType[t] || 0) + 1; });
console.log(`generated ${questions.length} 科目B questions -> ${path.relative(ROOT, outPath)}`);
console.log('by type:', JSON.stringify(byType));
