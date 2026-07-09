/* generate_questions.js — 用語辞書から4択問題を機械生成する(依存なし)
 *
 * ねらい: 「AI生成で量産」の土台。手打ちに頼らず words.json から問題を作ることで
 *   ① 正答が構造的に正しいことを保証(正解=その用語の定義、ダミー=別用語の定義)
 *   ② 辞書が増えるほど問題も自動で増える(3000問への拡張エンジン)
 *
 * 生成する問題タイプ:
 *   def  … 「◯◯の説明として適切なものはどれか」 正解=その用語のmeaning
 *   term … 「次の説明に該当する用語はどれか(＋meaning提示)」 正解=その用語名
 *   analogy … 「◯◯を身近に例えたものとして適切なものはどれか」 正解=その用語のanalogy(analogyのある語のみ)
 *
 * ダミー選択肢は「同一分野の別用語」を優先採用し、紛らわしさ(=学習効果)を高める。
 * 実行: node tools/generate_questions.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'qualifications/fe/words.json'), 'utf8'));

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
const CATS = ['テクノロジ', 'マネジメント', 'ストラテジ'];
const byCat = {};
words.forEach(w => { (byCat[w.category] = byCat[w.category] || []).push(w); });

// wにとってのダミー候補(自分以外)。同分野を優先し、足りなければ全体から補う。
function distractorPool(w) {
  const same = (byCat[w.category] || []).filter(x => x.wordId !== w.wordId);
  const others = words.filter(x => x.wordId !== w.wordId && x.category !== w.category);
  return shuffle(same).concat(shuffle(others));
}

// 3つのダミーを、指定フィールドの値が正解と重複しないように選ぶ
function pickDistractors(w, field, correctValue) {
  const out = [];
  for (const d of distractorPool(w)) {
    const v = d[field];
    if (!v || v === correctValue) continue;
    if (out.some(o => o[field] === v)) continue;
    out.push(d);
    if (out.length === 3) break;
  }
  return out;
}

// 正解＋ダミー3件から、正解位置をシャッフルした choices/correctIndex を作る
function assemble(correctText, distractorTexts) {
  const items = [{ t: correctText, ok: true }, ...distractorTexts.map(t => ({ t, ok: false }))];
  const shuffled = shuffle(items);
  return {
    choices: shuffled.map(x => x.t),
    correctIndex: shuffled.findIndex(x => x.ok)
  };
}

const questions = [];

for (const w of words) {
  // --- def: 用語 → 説明 ---
  {
    const ds = pickDistractors(w, 'meaning', w.meaning);
    if (ds.length === 3) {
      const { choices, correctIndex } = assemble(w.meaning, ds.map(d => d.meaning));
      questions.push({
        questionId: `g_def_${w.wordId}`,
        category: w.category,
        text: `${w.word} の説明として最も適切なものはどれか。`,
        choices, correctIndex,
        explanation: `${w.word}: ${w.meaning}`,
        source: `生成問題(定義 / ${w.word})`,
        relatedWordIds: [w.wordId]
      });
    }
  }
  // --- term: 説明 → 用語 ---
  {
    const ds = pickDistractors(w, 'word', w.word);
    if (ds.length === 3) {
      const { choices, correctIndex } = assemble(w.word, ds.map(d => d.word));
      questions.push({
        questionId: `g_term_${w.wordId}`,
        category: w.category,
        text: `次の説明に最もよく当てはまる用語はどれか。\n「${w.meaning}」`,
        choices, correctIndex,
        explanation: `正解は「${w.word}」。${w.meaning}`,
        source: `生成問題(用語選択 / ${w.word})`,
        relatedWordIds: [w.wordId]
      });
    }
  }
  // --- exq: 例え → 用語(逆引き) ---
  if (w.analogy) {
    const ds = pickDistractors(w, 'word', w.word);
    if (ds.length === 3) {
      const { choices, correctIndex } = assemble(w.word, ds.map(d => d.word));
      questions.push({
        questionId: `g_exq_${w.wordId}`,
        category: w.category,
        text: `次の「例え」が表す用語として最も適切なものはどれか。\n「${w.analogy}」`,
        choices, correctIndex,
        explanation: `正解は「${w.word}」。例え: ${w.analogy}`,
        source: `生成問題(例えから用語 / ${w.word})`,
        relatedWordIds: [w.wordId]
      });
    }
  }
  // --- cat: 分野が異なるもの(仲間はずれ) ---
  {
    const others = CATS.filter(c => c !== w.category && (byCat[c] || []).length >= 3);
    if (others.length) {
      const oc = others[Math.floor(rand() * others.length)];
      const ds = shuffle(byCat[oc]).slice(0, 3);
      const { choices, correctIndex } = assemble(w.word, ds.map(d => d.word));
      questions.push({
        questionId: `g_cat_${w.wordId}`,
        category: w.category,
        text: `次の四つの用語のうち、分類される分野が他の三つと異なるものはどれか。`,
        choices, correctIndex,
        explanation: `「${w.word}」は${w.category}分野で、他の三つは${oc}分野。`,
        source: `生成問題(分野判定 / ${w.word})`,
        relatedWordIds: [w.wordId]
      });
    }
  }
  // --- analogy: 用語 → 例え話(analogyを持つ語のみ) ---
  if (w.analogy) {
    const pool = distractorPool(w).filter(d => d.analogy && d.analogy !== w.analogy);
    const ds = [];
    for (const d of pool) { if (!ds.some(o => o.analogy === d.analogy)) ds.push(d); if (ds.length === 3) break; }
    if (ds.length === 3) {
      const { choices, correctIndex } = assemble(w.analogy, ds.map(d => d.analogy));
      questions.push({
        questionId: `g_analogy_${w.wordId}`,
        category: w.category,
        text: `${w.word} を身近なものに例えた説明として、最も適切なものはどれか。`,
        choices, correctIndex,
        explanation: `${w.word} の例え: ${w.analogy}`,
        source: `生成問題(例え / ${w.word})`,
        relatedWordIds: [w.wordId]
      });
    }
  }
}

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
