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
  const wFam = familyOf(w);
  // 同ファミリー優先(本試験の「全選択肢が同じ問いへの別解」の並びに寄せる)、
  // 同ファミリー内では意味文の類似度が高い順。
  const rank = (list) => shuffle(list)
    .map(x => ({ x, fam: familyOf(x) === wFam ? 1 : 0, sim: jaccard(wGrams, gramsOf(x)) }))
    .sort((a, b) => (b.fam - a.fam) || (b.sim - a.sim))
    .map(o => o.x);
  const same = (byCat[w.category] || []).filter(x => x.wordId !== w.wordId);
  const others = quizWords.filter(x => x.wordId !== w.wordId && x.category !== w.category);
  return rank(same).concat(rank(others));
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

// ---- キーワード分散(2026-08-06、過去問道場100問の実走から) ----
// 本試験は「WAFの目的はどれか」なら4択全部がWebサーバの文、という作りで、
// 問題語のキーワードが全選択肢に分散している。逆に正解だけがキーワードを
// 共有すると(例: DNSキャッシュポイズニング問題で正解だけがDNSを含む)、
// 表面一致だけで解けてしまう。
// 対策: 問題語と正解文の共有トークンを検出し、同じトークンを含む誤答を
// 必ず混ぜる。混ぜられない場合はその問題を生成しない。

// 2つの文字列の最長共通部分文字列(カナ/漢字/英数を含むもののみ意味があるとみなす)
function salientLcs(a, b) {
  a = String(a).toLowerCase(); b = String(b).toLowerCase();
  let best = '';
  for (let i = 0; i < a.length; i++) {
    for (let j = i + Math.max(2, best.length); j <= a.length; j++) {
      const sub = a.slice(i, j);
      if (b.includes(sub)) { if (sub.length > best.length) best = sub; }
      else break;
    }
  }
  if (!/[ァ-ヶーa-z0-9一-龠]/.test(best)) return { len: 0, str: '' };
  return { len: best.length, str: best };
}
// 問題語と自分の意味文が共有するトークン(3文字以上)。あれば分散が必要。
function keywordTokenOf(w) {
  const t = salientLcs(w.word, w.meaning || '');
  return t.len >= 3 ? t : null;
}

// ---- ファミリータグ(誤答を「同じ問いへの別の実在解」で揃えるための粗い分類) ----
// 本試験の誤答は同ファミリー(全部が誤り検査方式、全部が価格決定法…)で並ぶ。
// 類似度に加えて同ファミリーを優先することで、この並びに近づける。
const FAMILY_RULES = [
  ['攻撃手法', /攻撃|インジェクション|フィッシング|ポイズニング|トラバーサル|スプーフィング|ハイジャック|総当たり|辞書攻撃|標的型|ランサム|マルウェア|ウイルス|ワーム|ボット|バックドア|ソーシャルエンジニアリング/],
  ['セキュリティ技術', /暗号|署名|証明書|ハッシュ|認証|鍵|PKI|WAF|ファイアウォール|IDS|IPS|検疫|アクセス制御|リスク|脆弱性|インシデント|CSIRT/],
  ['ネットワーク', /プロトコル|TCP|UDP|HTTP|SMTP|POP|IMAP|DNS|DHCP|FTP|SSL|TLS|IP(アドレス)?|ポート|ルータ|スイッチ|LAN|WAN|サブネット|パケット|通信|無線|イーサネット/],
  ['テスト', /テスト|網羅|レビュー|スタブ|ドライバ|デバッグ|検証|品質保証|品質管理|バグ/],
  ['記憶装置', /RAID|ミラーリング|ストライピング|ディスク|メモリ|キャッシュ|記憶|ROM|RAM|フラッシュ/],
  ['OS', /OS|スケジューリング|プロセス|スレッド|割込み|仮想記憶|ページ|タスク|排他制御|デッドロック|セマフォ/],
  ['データベース', /SQL|データベース|正規化|主キー|外部キー|トランザクション|ロック|コミット|ロールバック|インデックス|結合|射影/],
  ['開発手法', /開発|設計|要件|アジャイル|スクラム|ウォーターフォール|オブジェクト指向|クラス|継承|カプセル|UML|モジュール|リファクタリング|DevOps/],
  ['プロマネ', /プロジェクト|工程|クリティカルパス|WBS|見積|ファンクションポイント|クラッシング|ファストトラッキング|PERT|ガント|マイルストーン|スコープ/],
  ['サービス運用', /サービス|SLA|インシデント管理|ITIL|運用|保守|バックアップ|可用性|稼働率|監視/],
  ['監査', /監査|内部統制|ガバナンス|コンプライアンス/],
  ['経営戦略', /戦略|マーケティング|価格|市場|SWOT|PPM|3C|4P|イノベーション|シェア|プロダクト|顧客|ブランド|KGI|KPI|CSF|バランススコアカード/],
  ['会計法務', /費用|原価|利益|会計|償却|損益|財務|法|権利?$|著作|特許|契約|派遣|請負|個人情報|ライセンス/],
];
const familyCache = new Map();
function familyOf(w) {
  let f = familyCache.get(w.wordId);
  if (f) return f;
  const probe = w.word + ' ' + (w.meaning || '');
  f = (FAMILY_RULES.find(([, re]) => re.test(probe)) || [w.subcat || w.category])[0];
  familyCache.set(w.wordId, f);
  return f;
}

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
  // 問題語と正解文の共有トークン。あれば「同トークン入りの誤答」を必ず混ぜる。
  const tok = keywordTokenOf(w);
  // 重複意味文を除いた誤答候補(名前漏れ除外済み・類似度/ファミリー順)
  const uniqPool = (() => {
    const seen = new Set([w.meaning]);
    const out = [];
    for (const d of distractorPool(w)) {
      if (!d.meaning || seen.has(d.meaning)) continue;
      if (!okMeaningFor(w)(d)) continue;
      seen.add(d.meaning); out.push(d);
    }
    return out;
  })();
  const kwPool = tok ? uniqPool.filter(d => d.meaning.toLowerCase().includes(tok.str)) : [];
  const restPool = tok ? uniqPool.filter(d => !d.meaning.toLowerCase().includes(tok.str)) : uniqPool;

  // トークンあり: def=[同キーワード1+その他2] / desc=[同キーワード1+その他2](別組)。
  //             同キーワード誤答が無ければその形式は生成しない(表面一致で解けるため)。
  // トークンなし: 従来どおり def=上位3 / desc=次点3。
  let dsDef = null, dsDesc = null;
  if (tok) {
    if (kwPool.length >= 1 && restPool.length >= 2) dsDef = [kwPool[0], restPool[0], restPool[1]];
    if (kwPool.length >= 2 && restPool.length >= 4) dsDesc = [kwPool[1], restPool[2], restPool[3]];
  } else {
    if (uniqPool.length >= 3) dsDef = uniqPool.slice(0, 3);
    if (uniqPool.length >= 6) dsDesc = uniqPool.slice(3, 6);
  }

  // --- def: 用語 → 説明 ---
  {
    const ds = dsDef || [];
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
  // 提示する説明文が答えの用語名の一部を含む(トークンあり)場合、
  // 名前の一致だけで選べてしまうため term 形式は生成しない。
  if (!tok) {
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
    const ds = dsDesc || [];
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
  // キーワード分散: 正解だけが問題語とトークン(3文字以上)を共有していたら違反。
  // 誤答の少なくとも1つが同じトークンを含んでいなければならない。
  if (kind === 'def' || kind === 'desc') {
    const t = salientLcs(subject.word, q.choices[q.correctIndex]);
    if (t.len >= 3) {
      const spread = q.choices.some((c, i) => i !== q.correctIndex && c.toLowerCase().includes(t.str));
      if (!spread) lintErrors.push(`${q.questionId}: 正解だけがトークン「${t.str}」を含む(分散なし)`);
    }
  }
  if (kind === 'term') {
    const t = salientLcs(q.choices[q.correctIndex], q.text.replace(/^次の説明に最もよく当てはまる用語はどれか。\n/, ''));
    if (t.len >= 3)
      lintErrors.push(`${q.questionId}: 提示文が正解名のトークン「${t.str}」を含む`);
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
