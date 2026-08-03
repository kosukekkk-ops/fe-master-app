/* generate_questions.js — 用語辞書から4択問題を機械生成する(依存なし)
 *
 * ねらい: 「AI生成で量産」の土台。手打ちに頼らず words.json から問題を作ることで
 *   ① 正答が構造的に正しいことを保証(正解=その用語の定義、ダミー=別用語の定義)
 *   ② 辞書が増えるほど問題も自動で増える(3000問への拡張エンジン)
 *
 * 生成する問題タイプ:
 *   def  … 「◯◯の説明として適切なものはどれか」 正解=その用語のmeaning
 *   desc … defと同じく説明を選ぶが、別の紛らわしいダミー組で出題(重複回避)
 *   term … 「次の説明に該当する用語はどれか(＋meaning提示)」 正解=その用語名
 *   exq  … 「次の例えが表す用語はどれか」 正解=その用語名(analogyのある語のみ)
 *   analogy … 「◯◯を身近に例えたものとして適切なものはどれか」 正解=その用語のanalogy(analogyのある語のみ)
 * ※分野の仲間はずれ(cat)問題は試験合格に直結しないため廃止した。
 *
 * ダミー選択肢は「同一分野の別用語」を優先採用し、紛らわしさ(=学習効果)を高める。
 * 実行: node tools/generate_questions.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'docs');
const WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'qualifications/fe/words.json'), 'utf8'));
const DETAILS = require('../docs/js/word_details.js');

// 演習の解説専用の詳しい説明文(未収録ならmeaningにフォールバック)
function detail(w) { return DETAILS[w.wordId] || w.meaning; }
// ※誤答選択肢の正体は解説文に焼き込まず、choiceInfo(選択肢と同じ並びの配列)として持つ。
//   アプリは表示のたびに選択肢をシャッフルするため、固定文で順番に言及すると必ずズレる。
//   表示時にapp.jsがア〜エの実際の並びに合わせて描画する。
// 例え話は学習用の補助であり、実際の試験では技術的な定義で問われることを明示する
function examNote(w) { return `※実際の試験では、この例え話ではなく「${w.meaning}」のような技術的な定義の文章で問われる。`; }

// 再現性のあるシャッフル(mulberry32)。実行のたび同じ結果になるよう固定シード。
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260707);
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const words = WORDS.words;

// ---- 名前漏れ対策(2026-08-02のMBO問題の教訓) ----
// 意味文が自分の用語名を名指しする語(「KPIとKGI」のような対比型)は、
// 四択に流用すると知識ゼロでも消去法で解けてしまう。
// そのため出題対象からも誤答プールからも外す(単語帳のカードとしては残る)。
const partsOf = (name) => String(name).split(/[と・/()\s]+/).filter(p => p.length >= 2);
const selfNaming = (w) => partsOf(w.word).some(p => (w.meaning || '').includes(p));
const banned = new Set(words.filter(selfNaming).map(w => w.wordId));
const quizWords = words.filter(w => !banned.has(w.wordId));

const byCat = {};
quizWords.forEach(w => { (byCat[w.category] = byCat[w.category] || []).push(w); });

// 文字bigramのJaccard類似度。分野(3分類)だけでは話題が近い保証がないため、
// meaning本文の類似度で「紛らわしい(=学習効果の高い)」ダミーを選ぶために使う。
function bigrams(s) {
  const arr = Array.from(String(s || ''));
  const set = new Set();
  for (let i = 0; i < arr.length - 1; i++) set.add(arr[i] + arr[i + 1]);
  if (!set.size && arr.length) set.add(arr[0]);
  return set;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
const gramsCache = new Map();
function gramsOf(w) {
  let g = gramsCache.get(w.wordId);
  if (!g) { g = bigrams(w.meaning); gramsCache.set(w.wordId, g); }
  return g;
}

// wにとってのダミー候補(自分以外)。同分野の中でmeaningが近い語を優先し、
// 分野が同じでも話題が全く違う(=簡単すぎる)誤答になるのを防ぐ。同分野で足りなければ全体から補う。
function distractorPool(w) {
  const wGrams = gramsOf(w);
  const bySimilarity = (list) => shuffle(list)
    .map(x => ({ x, sim: jaccard(wGrams, gramsOf(x)) }))
    .sort((a, b) => b.sim - a.sim)
    .map(o => o.x);
  const same = (byCat[w.category] || []).filter(x => x.wordId !== w.wordId);
  const others = quizWords.filter(x => x.wordId !== w.wordId && x.category !== w.category);
  return bySimilarity(same).concat(bySimilarity(others));
}

// 3つのダミーを、指定フィールドの値が正解と重複しないように選ぶ。
// skip>0 のときは「より紛らわしい上位skip件」を飛ばして次点を採用する。
// これにより同じ用語でも def と別のダミー組で出題でき、重複問題を防げる。
// ok を渡すと、それを満たさない候補を飛ばす(名前漏れの除外に使う)。
function pickDistractors(w, field, correctValue, skip = 0, ok = null) {
  const valid = [];
  for (const d of distractorPool(w)) {
    const v = d[field];
    if (!v || v === correctValue) continue;
    if (valid.some(o => o[field] === v)) continue;
    if (ok && !ok(d)) continue;
    valid.push(d);
    if (valid.length === skip + 3) break;
  }
  return valid.slice(skip, skip + 3);
}

// def/desc用: ダミーの説明文が出題対象の用語名を含むと
// 「これは◯◯自身の説明ではない」と読み取れてしまうため除外する。
const okMeaningFor = (w) => (d) => !partsOf(w.word).some(p => (d.meaning || '').includes(p));
// term用: 提示する説明文の中に名前が出てくる用語をダミーにすると
// その場で消去できてしまうため除外する。
const okTermFor = (w) => (d) => !partsOf(d.word).some(p => (w.meaning || '').includes(p));

// 正解＋ダミー3件から、正解位置をシャッフルした choices/correctIndex/choiceInfo を作る。
// distractors は {t: 選択肢文, note: その選択肢の正体(表示用)} の配列。
// choiceInfo は choices と同じ並びで、正解位置は null。
function assemble(correctText, distractors) {
  const items = [{ t: correctText, note: null, ok: true }, ...distractors.map(d => ({ t: d.t, note: d.note, ok: false }))];
  const shuffled = shuffle(items);
  return {
    choices: shuffled.map(x => x.t),
    correctIndex: shuffled.findIndex(x => x.ok),
    choiceInfo: shuffled.map(x => x.note)
  };
}

const questions = [];

for (const w of quizWords) {
  // --- def: 用語 → 説明 ---
  {
    const ds = pickDistractors(w, 'meaning', w.meaning, 0, okMeaningFor(w));
    if (ds.length === 3) {
      const { choices, correctIndex, choiceInfo } = assemble(w.meaning,
        ds.map(d => ({ t: d.meaning, note: `「${d.word}」の説明` })));
      questions.push({
        questionId: `g_def_${w.wordId}`,
        category: w.category,
        text: `${w.word} の説明として最も適切なものはどれか。`,
        choices, correctIndex, choiceInfo,
        explanation: `${w.word}: ${detail(w)}`,
        source: `生成問題(定義 / ${w.word})`,
        relatedWordIds: [w.wordId]
      });
    }
  }
  // --- term: 説明 → 用語 ---
  {
    const ds = pickDistractors(w, 'word', w.word, 0, okTermFor(w));
    if (ds.length === 3) {
      const { choices, correctIndex, choiceInfo } = assemble(w.word,
        ds.map(d => ({ t: d.word, note: `「${d.word}」＝${d.meaning}` })));
      questions.push({
        questionId: `g_term_${w.wordId}`,
        category: w.category,
        text: `次の説明に最もよく当てはまる用語はどれか。\n「${w.meaning}」`,
        choices, correctIndex, choiceInfo,
        explanation: `正解は「${w.word}」。${detail(w)}`,
        source: `生成問題(用語選択 / ${w.word})`,
        relatedWordIds: [w.wordId]
      });
    }
  }
  // ※例え系問題(exq: 例え→用語 / analogy: 用語→例え)は2026-07-20に廃止。
  //   例え話は覚えるための補助であり、4択にすると選択肢同士が無関係で簡単すぎるため
  //   演習の平均品質を下げていた。例え話自体は単語帳の裏面で引き続き表示される。
  // --- desc: 用語 → 説明(defとは別の紛らわしいダミー組で出題) ---
  // 分野の仲間はずれ問題は試験合格に直結しないため廃止し、
  // 「用語の説明を選ぶ」問題に置き換え。defが上位3件のダミーを使うのに対し、
  // こちらは次点(4〜6番目に紛らわしい別用語の説明)を使うので重複しない。
  {
    const ds = pickDistractors(w, 'meaning', w.meaning, 3, okMeaningFor(w));
    if (ds.length === 3) {
      const { choices, correctIndex, choiceInfo } = assemble(w.meaning,
        ds.map(d => ({ t: d.meaning, note: `「${d.word}」の説明` })));
      questions.push({
        questionId: `g_desc_${w.wordId}`,
        category: w.category,
        text: `「${w.word}」を説明したものとして最も適切なものはどれか。`,
        choices, correctIndex, choiceInfo,
        explanation: `${w.word}: ${detail(w)}`,
        source: `生成問題(意味 / ${w.word})`,
        relatedWordIds: [w.wordId]
      });
    }
  }
}

// ---- 再発防止リンター ----
// 「知識がなくても消去法で解ける選択肢」を全問検証し、1件でもあれば生成を失敗させる。
//  1) def/desc: 選択肢の説明文が、その説明の主(用語)を名指ししていないか
//  2) def/desc: ダミーの説明文が、出題対象の用語名を含んでいないか
//  3) term: 提示する説明文が、正解またはダミーの用語名を含んでいないか
const meaningOwner = new Map(words.map(w => [w.meaning, w]));
const lintErrors = [];
for (const q of questions) {
  const kind = q.questionId.split('_')[1];
  const subject = words.find(w => w.wordId === q.relatedWordIds[0]);
  if (kind === 'def' || kind === 'desc') {
    q.choices.forEach((c, i) => {
      const owner = meaningOwner.get(c);
      if (owner && partsOf(owner.word).some(p => c.includes(p)))
        lintErrors.push(`${q.questionId}: 選択肢${i}が自分(「${owner.word}」)を名指し`);
      if (i !== q.correctIndex && partsOf(subject.word).some(p => c.includes(p)))
        lintErrors.push(`${q.questionId}: ダミー${i}が出題対象「${subject.word}」を名指し`);
    });
  } else if (kind === 'term') {
    q.choices.forEach((c, i) => {
      if (partsOf(c).some(p => q.text.includes(p)))
        lintErrors.push(`${q.questionId}: 提示文が選択肢${i}「${c}」を名指し`);
    });
  }
}
if (lintErrors.length) {
  console.error(`LINT NG (${lintErrors.length}件):`);
  lintErrors.slice(0, 30).forEach(e => console.error(' ', e));
  process.exit(1);
}
console.log('lint OK: 名前漏れなし(全' + questions.length + '問)');

const out = {
  qualification: 'FE',
  version: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  note: 'words.json から自動生成した問題(tools/generate_questions.js)。正解=対象用語の定義/例え、ダミー=同分野優先の別用語。辞書を増やして再実行すると問題も増える。',
  questions
};
const outPath = path.join(ROOT, 'qualifications/fe/questions_generated.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1), 'utf8');

// サマリ表示
const byType = {};
questions.forEach(q => { const t = q.questionId.split('_')[1]; byType[t] = (byType[t] || 0) + 1; });
console.log(`generated ${questions.length} questions -> ${path.relative(ROOT, outPath)}`);
console.log('by type:', JSON.stringify(byType));
