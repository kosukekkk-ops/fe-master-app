/* generate_calc_questions.js — FE科目Aの計算問題を機械生成する(依存なし)
 *
 * ねらい: 定義問題(generate_questions.js)に対し、こちらは「計算して解く」問題を量産する。
 *   正答はコードで計算するため必ず正しい。ダミー選択肢は「よくある計算ミス」を再現して
 *   紛らわしくする(公式の取り違え・単位換算忘れ・目標利益の入れ忘れ 等)。
 *
 * 対象7系統:
 *   avail    稼働率 = MTBF/(MTBF+MTTR)
 *   sysavail 直列/並列システムの稼働率
 *   radix    基数変換(16進小数→10進 / 2進整数→10進)
 *   transfer 伝送時間(データ量・回線速度・伝送効率)
 *   breakeven 損益分岐点/必要販売数量
 *   cache    キャッシュ実効アクセス時間
 *   imgsize  画像1枚の記憶容量
 *
 * 実行: node tools/generate_calc_questions.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'docs');
const DETAILS = require('../docs/js/word_details.js');

// 再現性のあるシード付き乱数
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260707);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 数値を4桁で丸めて末尾ゼロを落とした文字列に
const round4 = (n) => Math.round(n * 10000) / 10000;
const numStr = (n) => String(round4(n));

// ---- 系統別の解説ガイド(2026-08-08、「解説が式だけで乏しい」というユーザー指摘を受けて全系統に整備) ----
// idea: なぜその式になるのかを平易に説明する「考え方」 / note: 定番のつまずきポイント
const CALC_GUIDE = {
  avail: {
    idea: '稼働率は「全時間のうち動いていた時間の割合」。装置は平均してMTBF(故障までの平均稼働時間)だけ動いてはMTTR(平均修理時間)だけ止まる、を繰り返す。1周期(MTBF+MTTR)のうち動いているのはMTBFなので、稼働率 = MTBF ÷ (MTBF + MTTR) になる。',
    note: 'MTBFは「動いている時間」、MTTRは「直している時間」。分母を両方の合計(全体の時間)にするのがポイント。' },
  sysavail: {
    idea: '直列は「全部が動いてはじめて動く」ので、稼働率は掛け算になり必ず1台のときより低くなる。並列は「1台でも動けばよい」ので、先に「全台が同時に止まる確率」= 故障率(1−稼働率)の掛け算を求め、それを1から引く。',
    note: '並列を稼働率の足し算にしない(1を超えたら計算ミス)。「1から引く」を2回使うのが並列のコツ。' },
  radix: {
    idea: 'n進数は「各桁がnの累乗の重みを持つ」数の表し方。整数部の重みは右から1, n, n², …、小数部の重みは左から1/n, 1/n², …。各桁の値×重みを合計すれば10進数になる。',
    note: '16進数の小数第1位は「16分の1の位」(10分の1ではない)。2進数は1が立っている桁の重みだけを足せばよい。' },
  transfer: {
    idea: '伝送時間は「送るデータ量 ÷ 実際に出る速度」。回線は理論値どおりの速度が出ないため、実効速度 = 回線速度 × 伝送効率で先に補正する。また、データ量はバイト、回線速度はビット/秒で単位が違うので、バイトを8倍してビットに揃えてから割り算する。',
    note: 'バイト→ビットの「×8」と、伝送効率の掛け忘れが2大ミス。単位を式に書きながら計算すると防げる。' },
  breakeven: {
    idea: '商品を1個売ると、売価から変動費(1個増えるごとにかかる費用)を引いた「限界利益」だけ手元に残る。この限界利益の積み重ねで固定費(売れなくてもかかる費用)を回収しきる点が損益分岐点。目標利益がある場合は「固定費+目標利益」を1個当たりの限界利益で割れば必要販売数が出る。',
    note: '固定費を売価で割らないこと。割るのは「売価−変動費」の限界利益。' },
  cache: {
    idea: 'メモリアクセスは「キャッシュに当たる(速い)」か「外れて主記憶まで行く(遅い)」かの2通りしかない。それぞれの所要時間を、起きる確率(ヒット率とミス率)で重み付けして平均したものが実効アクセス時間。',
    note: 'ミス率は 1−ヒット率。「ヒット率×主記憶の時間」と組み合わせを取り違えない。' },
  imgsize: {
    idea: '画像は小さな点(画素)の集まりで、1画素の色を何ビットで表すかが決まっている。だから容量 = 横×縦の総画素数 × 1画素のビット数。バイトで答えるので最後に8で割る。',
    note: 'ビット→バイトの「÷8」を忘れると、ちょうど8倍の誤答(選択肢に必ずある)に引っかかる。' },
  compl2: {
    idea: '2の補数表現では先頭ビットが1なら負の数。その値は「符号なし整数として読んだ値 − 2^ビット数」で求められる(全ビットを反転して1を足すと絶対値が出る、でも同じ)。',
    note: '「反転して+1」は絶対値を出す手順。正負の判断はあくまで先頭ビットで行う。' },
  mips: {
    idea: 'MIPSは「1秒間に実行できる命令数」を百万(10^6)単位で表した指標。1秒間のクロック数(=クロック周波数)を1命令に必要な平均クロック数(CPI)で割れば、1秒間に実行できる命令数が出る。',
    note: '最後に10^6で割ってMIPS単位に直すこと。クロック周波数のG(10^9)との換算も丁寧に。' },
  addr: {
    idea: 'アドレス線が1ビット増えるごとに指定できる番地は2倍になる。nビットなら2^n番地。1番地に1バイト格納する方式なら、容量もそのまま2^nバイト。',
    note: '2^10=1K、2^20=1M、2^30=1G。この対応を覚えておくと大きな累乗も即答できる。' },
  queue: {
    idea: 'M/M/1の待ち行列では、窓口の混み具合(利用率ρ)が高いほど行列が急激に伸びる。平均待ち時間は ρ/(1−ρ) × 平均サービス時間。空いている度合い(1−ρ)で割るため、ρが1に近づくと待ち時間は爆発的に増える。',
    note: '聞かれているのが「待ち時間」か「応答時間(待ち+処理)」かを必ず確認。応答時間なら平均サービス時間を足す。' },
  pcm: {
    idea: 'PCMは音の波の高さを1秒間にサンプリング周波数の回数だけ測り、1回の測定値を量子化ビット数のビットで記録する方式。だから1秒・1チャネル当たりのデータ量 = サンプリング周波数 × (量子化ビット数÷8)バイト。これにチャネル数(ステレオなら2)と録音秒数を掛ける。',
    note: 'kHzの「×1000」、ビット→バイトの「÷8」、ステレオの「×2」。この3つの掛け忘れが定番ミス。' },
  depreciation: {
    idea: '減価償却は、高価な資産の購入額を「使う年数に分けて」毎年の費用にする会計処理。定額法は毎年同じ額ずつ費用化する方法で、年間償却費 = (取得原価 − 残存価額) ÷ 耐用年数。',
    note: '残存価額(使い終わっても残る価値)を先に引いてから年数で割る。' },
  rotwait: {
    idea: '磁気ディスクは円盤が回って目的のデータが磁気ヘッドの下に来るのを待つ。狙った位置は円盤上のどこにあるか分からないので、平均すると半回転分待つと考える。1回転の時間 = 60秒 ÷ 毎分回転数、平均回転待ちはその半分。',
    note: '回転数は「毎分」なので60秒を基準に計算し、ミリ秒への換算を忘れない。' },
  pert: {
    idea: '三点見積り(PERT)は「楽観値・最可能値・悲観値」の3つから現実的な所要日数を見積もる方法。最も起こりやすい最可能値に4倍の重みを付けて、(楽観 + 4×最可能 + 悲観) ÷ 6 で加重平均する。',
    note: '割るのは3ではなく6(重み1+4+1の合計)。' },
  colors: {
    idea: 'nビットあれば0と1の並びは2^n通り作れるので、2^n色を区別できる。逆に「◯色を表すには何ビット必要か」と問われたら、2^n ≧ 色数 を満たす最小のnを探す。',
    note: '「2倍ずつ増える」感覚を持つと速い。8ビット=256色、16ビット=65,536色。' },
  subnet: {
    idea: 'IPアドレスのホスト部がnビットなら、アドレスの組合せは2^n通り。ただし先頭の1つ(ネットワークアドレス)と末尾の1つ(ブロードキャストアドレス)は機器に割り当てられないため、実際に使えるのは 2^n − 2 台。',
    note: '「−2」を忘れると、選択肢に必ず用意されている2^nそのまま(256など)に引っかかる。' },
  expval: {
    idea: '期待値は「起こりうる各ケースの金額 × その確率」を全部足し合わせた、平均的に見込める値。どちらか一方が起きる場合も、確率で重み付けして足せば「ならしたときの結果」が出る。',
    note: '使った確率の合計が1になっているかを先に確認すると、ケースの数え漏れを防げる。' },
  payback: {
    idea: '回収期間法は「投資したお金が何年で戻ってくるか」で投資案を評価する簡便な方法。回収期間 = 初期投資額 ÷ 年間の回収額。短いほど早く元が取れる投資といえる。',
    note: '利息(時間価値)や回収後の利益は考えない、という簡便法ならではの限界もセットで問われる。' },
  raid5: {
    idea: 'RAID5は誤り回復用のパリティ情報を全ディスクに分散して持ち、どの1台が壊れても残りから復元できる。パリティが全体で「1台分」の容量を占めるため、使える容量 = (台数 − 1) × 1台の容量。',
    note: 'パリティ専用のディスクが1台あるのではなく、分散して合計1台分。耐えられる故障は1台までという点も頻出。' },
  seriesn: {
    idea: '同じ稼働率の装置をn台つなぐ場合、直列は全台が動く必要があるので「稼働率のn乗」。並列は1台でも動けばよいので、全滅する確率「故障率のn乗」を1から引く。',
    note: '並列は「1から引く」を2回使う(稼働率→故障率に直す、全滅確率→稼働率に戻す)のがコツ。' },
  queueW: {
    idea: '応答時間は「行列で待つ時間 + 自分が処理される時間」の合計。M/M/1ではこの合計が 平均サービス時間 ÷ (1 − 利用率) というシンプルな式になる。空き具合(1−ρ)で割るので、混むほど急激に悪化する。',
    note: '「待ち時間だけ」なら ρ/(1−ρ)×サービス時間。応答時間との違いを問題文で確認する。' },
  cputime: {
    idea: 'CPUはクロックという一定の刻みに合わせて動く。1クロックの時間はクロック周波数の逆数(1÷周波数)。1命令に平均CPIクロックかかるなら、1命令の実行時間 = CPI × 1クロックの時間。',
    note: 'GHz(10^9Hz)の逆数はナノ秒(10^-9秒)。単位の対応を押さえると桁を間違えない。' },
  hamming: {
    idea: 'ハミング符号は、データmビット+検査ビットrビットの全体(m+r)ビットの「どこで誤ったか」と「誤りなし」の合計(m+r+1)通りを、rビットの検査結果で区別する仕組み。だから 2^r ≧ m + r + 1 を満たす最小のrが必要な検査ビット数になる。',
    note: '不等式の右辺にr自身も入る(検査ビット自体の誤りも区別するため)。' },
  diskcap: {
    idea: '磁気ディスクの容量は入れ物の階層の掛け算で求まる。1トラックの容量 × 1シリンダ当たりのトラック数 × シリンダ数 = 総容量。',
    note: '最後のKバイト→Mバイトなどの単位換算を忘れずに。' },
  raid01: {
    idea: 'RAID0(ストライピング)はデータを分散して書き込むだけなので全台の容量をそのまま使える(そのかわり冗長性はない)。RAID1(ミラーリング)は同じデータを2台に書くので、使える容量は合計の半分になる。',
    note: '容量と引き換えに何を得ているか(RAID0=速度、RAID1=安全)をセットで覚える。' },
};


/* 正解値 + ダミー候補値 から choices/correctIndex を組み立てる。
 * ダミーは 正解と重複せず、互いに重複せず、正のものだけを採用。
 * 足りなければ ±10%/±25% の摂動で補う。 unit は各選択肢末尾に付ける文字列。 */
function buildNumeric(correct, candidates, unit, opts = {}) {
  const norm = (n) => opts.integer ? Math.round(n) : n;
  const key = (n) => round4(norm(n));
  const used = new Set([key(correct)]);
  const chosen = [];
  const consider = (raw) => {
    if (raw == null || !isFinite(raw)) return;
    const v = norm(raw);
    if (!opts.signed && v <= 0) return;   // 通常は正の値のみ。signed時は負の答え(2の補数等)も許可
    const k = key(v);
    if (used.has(k)) return;
    used.add(k); chosen.push(v);
  };
  candidates.forEach(consider);
  const perturb = [correct * 1.1, correct * 0.9, correct * 1.25, correct * 0.75, correct * 2, correct / 2, correct * 1.5];
  for (const p of perturb) { if (chosen.length >= 3) break; consider(p); }
  const three = chosen.slice(0, 3);
  const items = shuffle([{ v: correct, ok: true }, ...three.map(v => ({ v, ok: false }))]);
  return {
    choices: items.map(x => numStr(x.v) + unit),
    correctIndex: items.findIndex(x => x.ok)
  };
}

const questions = [];
const seenText = new Set();
function add(q) {
  if (seenText.has(q.text)) return false;   // 同一問題文の重複を排除
  seenText.add(q.text);
  questions.push(q);
  return true;
}

/* ---- 各系統のジェネレータ(1問返す。パラメータが不適なら null) ---- */
const GEN = {
  // 稼働率
  avail() {
    // a/(1-a) が整数になる稼働率だけ使い、MTBF/MTTRを整数に保つ
    const table = [[0.75, 3], [0.8, 4], [0.875, 7], [0.9, 9], [0.95, 19], [0.96, 24], [0.98, 49], [0.99, 99]];
    const [a, ratio] = pick(table);
    const mttr = pick([10, 20, 25, 40, 50, 80, 100, 120, 150, 200, 250, 500]);
    const mtbf = mttr * ratio;
    // ダミーは稼働率(0〜1)として自然な、正答より小さい値に限定(100%超え等の見破りやすい値を避ける)
    const dist = [1 - a, a - 0.05, a - 0.02, a - 0.1, mtbf / mttr / 100];
    const { choices, correctIndex } = buildNumeric(a, dist, '');
    return {
      idKey: `avail_${mtbf}_${mttr}`, category: 'テクノロジ', relatedWordIds: ['w051'],
      text: `MTBFが${mtbf}時間、MTTRが${mttr}時間の装置がある。この装置の稼働率は幾らか。`,
      choices, correctIndex,
      explanation: `稼働率 = MTBF ÷ (MTBF + MTTR) = ${mtbf} ÷ (${mtbf} + ${mttr}) = ${mtbf} ÷ ${mtbf + mttr} = ${numStr(a)}。`,
      source: '生成問題(計算 / 稼働率)'
    };
  },
  // 直列・並列システムの稼働率
  sysavail() {
    const set = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99];
    const a = pick(set); let b = pick(set);
    const series = rng() < 0.5;
    const ans = series ? a * b : 1 - (1 - a) * (1 - b);
    const other = series ? 1 - (1 - a) * (1 - b) : a * b;
    const dist = [other, a + b - 1, Math.min(a, b), (a + b) / 2];
    const { choices, correctIndex } = buildNumeric(ans, dist, '');
    return {
      idKey: `sys_${series ? 's' : 'p'}_${a}_${b}`, category: 'テクノロジ', relatedWordIds: ['w051'],
      text: series
        ? `稼働率が${a}の装置Aと稼働率が${b}の装置Bを直列に接続した。両方が動作するときだけシステムが稼働するとき、システム全体の稼働率は幾らか。`
        : `稼働率が${a}の装置Aと稼働率が${b}の装置Bを並列に接続した。少なくとも一方が動作すればシステムが稼働するとき、システム全体の稼働率は幾らか。`,
      choices, correctIndex,
      explanation: series
        ? `直列は稼働率の積。${a} × ${b} = ${numStr(ans)}。`
        : `並列は「両方が同時に停止しない確率」。1 − (1−${a})(1−${b}) = 1 − ${numStr((1 - a) * (1 - b))} = ${numStr(ans)}。`,
      source: '生成問題(計算 / 稼働率)'
    };
  },
  // 基数変換
  radix() {
    if (rng() < 0.5) {
      // 16進小数(1桁) → 10進
      const hexDigits = { 2: '2', 4: '4', 6: '6', 8: '8', 10: 'A', 12: 'C', 14: 'E' };
      const d = pick([2, 4, 6, 8, 10, 12, 14]);
      const ans = d / 16;
      const dist = [d / 10, d / 8, d / 16 * 10, (16 - d) / 16];
      const { choices, correctIndex } = buildNumeric(ans, dist, '');
      return {
        idKey: `radix16_${d}`, category: 'テクノロジ', relatedWordIds: [],
        text: `16進小数 0.${hexDigits[d]} を10進小数に変換したものはどれか。`,
        choices, correctIndex,
        explanation: `0.${hexDigits[d]}(16) = ${d} ÷ 16 = ${numStr(ans)}。`,
        source: '生成問題(計算 / 基数変換)'
      };
    } else {
      // 2進整数(5〜7bit) → 10進
      let bits = ''; const len = pick([5, 6, 7]);
      for (let i = 0; i < len; i++) bits += (rng() < 0.5 ? '1' : '0');
      bits = '1' + bits.slice(1); // 先頭を1にして桁数を安定させる
      const ans = parseInt(bits, 2);
      const rev = parseInt(bits.split('').reverse().join(''), 2);
      const dist = [ans + 1, ans - 1, rev, parseInt(bits, 8) || ans + 2];
      const { choices, correctIndex } = buildNumeric(ans, dist, '');
      return {
        idKey: `radix2_${bits}`, category: 'テクノロジ', relatedWordIds: [],
        text: `2進数 ${bits} を10進数で表したものはどれか。`,
        choices, correctIndex,
        explanation: `${bits}(2) = ${bits.split('').map((b, i) => b === '1' ? Math.pow(2, len - 1 - i) : 0).filter(x => x).join(' + ')} = ${ans}。`,
        source: '生成問題(計算 / 基数変換)'
      };
    }
  },
  // 伝送時間
  transfer() {
    const sizeMB = pick([10, 20, 50, 100, 200, 500, 1000]);
    const speed = pick([40, 50, 80, 100, 150, 200, 400]);  // Mビット/秒
    const eff = pick([0.5, 0.8, 1.0]);
    const bits = sizeMB * 8;                      // Mビット
    const ans = bits / (speed * eff);             // 秒
    const dist = [bits / speed, sizeMB / speed, bits * eff / speed, sizeMB / (speed * eff)];
    const { choices, correctIndex } = buildNumeric(ans, dist, '秒');
    return {
      idKey: `xfer_${sizeMB}_${speed}_${eff}`, category: 'テクノロジ', relatedWordIds: ['w053'],
      text: `${sizeMB}Mバイトのデータを、伝送速度${speed}Mビット/秒の回線で転送する。伝送効率が${Math.round(eff * 100)}%のとき、転送に掛かる時間はおよそ何秒か。ここで1Mバイト=8Mビットとする。`,
      choices, correctIndex,
      explanation: `データ量 = ${sizeMB}×8 = ${bits}Mビット。実効速度 = ${speed}×${eff} = ${speed * eff}Mビット/秒。時間 = ${bits} ÷ ${speed * eff} = ${numStr(ans)}秒。`,
      source: '生成問題(計算 / 伝送時間)'
    };
  },
  // 損益分岐点/必要販売数量
  breakeven() {
    const p = pick([400, 500, 600, 800, 1000]);
    const v = pick([100, 150, 200, 250, 300]);
    if (v >= p) return null;
    const contrib = p - v;
    const F = pick([180000, 240000, 300000, 360000, 400000, 480000, 600000]);
    const profit = pick([0, 60000, 90000, 100000, 120000, 150000]);
    const total = F + profit;
    if (total % contrib !== 0) return null;        // 割り切れる組合せだけ採用
    const ans = total / contrib;
    const dist = [F / contrib, total / p, total / v, ans + 100];
    const { choices, correctIndex } = buildNumeric(ans, dist, '個');
    return {
      idKey: `be_${p}_${v}_${F}_${profit}`, category: 'ストラテジ', relatedWordIds: ['w044'],
      text: profit === 0
        ? `1個当たりの販売価格が${p}円、変動費が${v}円、固定費が月${F.toLocaleString()}円の商品がある。損益分岐点となる月間販売数量は何個か。`
        : `1個当たりの販売価格が${p}円、変動費が${v}円、固定費が月${F.toLocaleString()}円の商品がある。月${profit.toLocaleString()}円の利益を出すために必要な月間販売数量は何個か。`,
      choices, correctIndex,
      explanation: `1個当たりの限界利益 = ${p} − ${v} = ${contrib}円。必要販売数 = (固定費${F.toLocaleString()} + 目標利益${profit.toLocaleString()}) ÷ ${contrib} = ${total.toLocaleString()} ÷ ${contrib} = ${ans.toLocaleString()}個。`,
      source: '生成問題(計算 / 損益分岐点)'
    };
  },
  // キャッシュ実効アクセス時間
  cache() {
    const h = pick([0.7, 0.8, 0.9, 0.95, 0.98, 0.99]);
    const c = pick([10, 20, 25, 40, 50]);
    const m = pick([80, 100, 150, 200, 400, 500]);
    if (m <= c) return null;
    const ans = h * c + (1 - h) * m;
    const dist = [(1 - h) * c + h * m, (c + m) / 2, c + m, h * m];
    const { choices, correctIndex } = buildNumeric(ans, dist, 'ナノ秒');
    return {
      idKey: `cache_${h}_${c}_${m}`, category: 'テクノロジ', relatedWordIds: ['w024'],
      text: `キャッシュメモリのアクセス時間が${c}ナノ秒、主記憶のアクセス時間が${m}ナノ秒、キャッシュのヒット率が${Math.round(h * 100)}%であるとき、実効アクセス時間はおよそ何ナノ秒か。`,
      choices, correctIndex,
      explanation: `実効アクセス時間 = ヒット率×キャッシュ + (1−ヒット率)×主記憶 = ${h}×${c} + ${round4(1 - h)}×${m} = ${numStr(ans)}ナノ秒。`,
      source: '生成問題(計算 / キャッシュ)'
    };
  },
  // 画像1枚の記憶容量
  imgsize() {
    const res = pick([[640, 480], [800, 600], [1024, 768], [1280, 720], [1280, 1024], [1600, 1200], [1920, 1080], [3840, 2160]]);
    const bpp = pick([8, 16, 24, 32]);
    const bytes = res[0] * res[1] * bpp / 8;
    const ansMB = bytes / 1e6;
    const dist = [res[0] * res[1] * bpp / 1e6, bytes / 1048576, res[0] * res[1] / 1e6, bytes * 8 / 1e6];
    const { choices, correctIndex } = buildNumeric(ansMB, dist, 'Mバイト');
    return {
      idKey: `img_${res[0]}x${res[1]}_${bpp}`, category: 'テクノロジ', relatedWordIds: [],
      text: `解像度${res[0]}×${res[1]}ドット、1画素当たり${bpp}ビットで表現する画像1枚の記憶容量はおよそ何Mバイトか。ここで1Mバイト=10^6バイトとする。`,
      choices, correctIndex,
      explanation: `容量 = ${res[0]}×${res[1]}×${bpp} ÷ 8 = ${bytes.toLocaleString()}バイト ≒ ${numStr(ansMB)}Mバイト。`,
      source: '生成問題(計算 / 記憶容量)'
    };
  },
  // 2の補数(8ビット)→ 10進の符号付き整数
  compl2() {
    const v = pick([-1, -2, -3, -4, -5, -6, -8, -10, -12, -15, -16, -20, -25, -32, -50, -64, -100, -120, -128]);
    const uns = v + 256;                       // ビット列を符号なしとして見た値
    const bin = uns.toString(2).padStart(8, '0');
    const dist = [uns, -(uns - 128), v + 1, v - 1];  // 符号なし読み/符号絶対値読み/±1
    const { choices, correctIndex } = buildNumeric(v, dist, '', { signed: true, integer: true });
    return {
      idKey: `compl2_${v}`, category: 'テクノロジ', relatedWordIds: ['w075'],
      text: `8ビットの2進数 ${bin} を、2の補数表現の符号付き整数とみなしたときの10進数はどれか。`,
      choices, correctIndex,
      explanation: `先頭ビットが1なので負の数。2の補数では 値 = (符号なしとして見た値) − 2^8 = ${uns} − 256 = ${v}。`,
      source: '生成問題(計算 / 2の補数)'
    };
  },
  // MIPS(処理性能)
  mips() {
    const f = pick([0.5, 1, 1.6, 2, 2.5, 3, 4]);       // GHz
    const cpi = pick([2, 4, 5, 8, 10]);
    const ans = f * 1000 / cpi;                // MIPS = クロック(Hz)/(CPI×10^6)
    const dist = [f * 1000 * cpi, f / cpi, cpi * 1000 / f, f * 100 / cpi];
    const { choices, correctIndex } = buildNumeric(ans, dist, 'MIPS');
    return {
      idKey: `mips_${f}_${cpi}`, category: 'テクノロジ', relatedWordIds: [],
      text: `クロック周波数${f}GHz、1命令の実行に平均${cpi}クロックを要するCPUがある。このCPUの処理性能はおよそ何MIPSか。`,
      choices, correctIndex,
      explanation: `MIPS = クロック周波数 ÷ (CPI × 10^6) = ${f}×10^9 ÷ (${cpi}×10^6) = ${f * 1000} ÷ ${cpi} = ${numStr(ans)}MIPS。`,
      source: '生成問題(計算 / 処理性能)'
    };
  },
  // アドレス空間(nビット → 記憶容量)
  addr() {
    const table = [[10, 'K', 1024], [12, 'K', 1024], [14, 'K', 1024], [16, 'K', 1024], [18, 'K', 1024], [20, 'M', 1048576], [22, 'M', 1048576], [24, 'M', 1048576], [26, 'M', 1048576], [28, 'M', 1048576], [30, 'G', 1073741824], [32, 'G', 1073741824]];
    const [n, letter, factor] = pick(table);
    const val = Math.pow(2, n) / factor;
    const dist = [val * 2, val / 2, val * 4, val / 4];
    const { choices, correctIndex } = buildNumeric(val, dist, `${letter}バイト`);
    return {
      idKey: `addr_${n}_${letter}`, category: 'テクノロジ', relatedWordIds: [],
      text: `${n}ビットのアドレスで、1番地に1バイトを割り当てて指定できる記憶容量は何${letter}バイトか。ここで1Kバイト=1024バイトとする。`,
      choices, correctIndex,
      explanation: `${n}ビットで 2^${n} = ${Math.pow(2, n).toLocaleString()}バイト。${letter}バイト単位では ${numStr(val)}${letter}バイト。`,
      source: '生成問題(計算 / アドレス空間)'
    };
  },
  // M/M/1 待ち行列の平均待ち時間
  queue() {
    const rho = pick([0.2, 0.5, 0.6, 0.75, 0.8, 0.9]);
    const ts = pick([10, 20, 25, 40, 50, 100]);
    const ans = rho / (1 - rho) * ts;          // 平均待ち時間 Wq
    const dist = [rho * ts, ts / (1 - rho), (1 - rho) / rho * ts, ts];
    const { choices, correctIndex } = buildNumeric(ans, dist, 'ミリ秒');
    return {
      idKey: `queue_${rho}_${ts}`, category: 'テクノロジ', relatedWordIds: ['w080'],
      text: `M/M/1の待ち行列モデルにおいて、窓口の利用率が${rho}、平均サービス時間が${ts}ミリ秒であるとき、平均待ち時間はおよそ何ミリ秒か。`,
      choices, correctIndex,
      explanation: `平均待ち時間 = ρ/(1−ρ) × 平均サービス時間 = ${rho}/(1−${rho}) × ${ts} = ${numStr(rho / (1 - rho))} × ${ts} = ${numStr(ans)}ミリ秒。`,
      source: '生成問題(計算 / 待ち行列)'
    };
  },
  // PCM 音声データ量
  pcm() {
    const f = pick([8, 11.025, 22.05, 44.1, 48]);             // kHz
    const bits = pick([8, 16, 24]);
    const ch = pick([1, 2]);
    const sec = pick([10, 20, 30, 60]);
    const bytes = f * 1000 * (bits / 8) * ch * sec;
    const ansMB = bytes / 1e6;
    const dist = [f * 1000 * bits * ch * sec / 1e6, bytes / ch / 1e6, f * 1000 * (bits / 8) * sec / 1e6, bytes * 8 / 1e6];
    const { choices, correctIndex } = buildNumeric(ansMB, dist, 'Mバイト');
    return {
      idKey: `pcm_${f}_${bits}_${ch}_${sec}`, category: 'テクノロジ', relatedWordIds: [],
      text: `サンプリング周波数${f}kHz、量子化ビット数${bits}ビット、${ch === 1 ? 'モノラル(1チャネル)' : 'ステレオ(2チャネル)'}で、${sec}秒間の音声を無圧縮のPCMで記録したときのデータ量はおよそ何Mバイトか。ここで1Mバイト=10^6バイトとする。`,
      choices, correctIndex,
      explanation: `データ量 = ${f}×1000 × (${bits}÷8) × ${ch} × ${sec} = ${bytes.toLocaleString()}バイト ≒ ${numStr(ansMB)}Mバイト。`,
      source: '生成問題(計算 / PCM)'
    };
  },
  // 定額法の減価償却費
  depreciation() {
    const cost = pick([600000, 900000, 1000000, 1200000, 1500000, 1800000, 2000000, 2400000]);
    const salvage = pick([0, Math.round(cost * 0.1)]);
    const years = pick([3, 4, 5, 6, 8]);
    if ((cost - salvage) % years !== 0) return null;
    const ans = (cost - salvage) / years;
    const dist = [cost / years, (cost - salvage) / (years + 1), (cost + salvage) / years, cost * 0.9 / years];
    const { choices, correctIndex } = buildNumeric(ans, dist, '円');
    return {
      idKey: `depre_${cost}_${salvage}_${years}`, category: 'ストラテジ', relatedWordIds: [],
      text: `取得原価${cost.toLocaleString()}円、残存価額${salvage.toLocaleString()}円、耐用年数${years}年の設備を定額法で減価償却するとき、1年当たりの減価償却費は何円か。`,
      choices, correctIndex,
      explanation: `定額法の年間償却費 = (取得原価 − 残存価額) ÷ 耐用年数 = (${cost.toLocaleString()} − ${salvage.toLocaleString()}) ÷ ${years} = ${ans.toLocaleString()}円。`,
      source: '生成問題(計算 / 減価償却)'
    };
  },
  // 磁気ディスクの平均回転待ち時間
  rotwait() {
    const rpm = pick([3000, 3600, 4000, 4500, 5000, 6000, 7200, 7500, 10000, 12000, 15000]);
    const ans = 30000 / rpm;                   // 平均回転待ち = 1回転時間の半分(ミリ秒)
    const dist = [60000 / rpm, 15000 / rpm, rpm / 1000, 30000 / rpm * 2];
    const { choices, correctIndex } = buildNumeric(ans, dist, 'ミリ秒');
    return {
      idKey: `rot_${rpm}`, category: 'テクノロジ', relatedWordIds: [],
      text: `回転速度${rpm.toLocaleString()}回転/分の磁気ディスクの、平均回転待ち時間はおよそ何ミリ秒か。`,
      choices, correctIndex,
      explanation: `1回転 = 60秒 ÷ ${rpm.toLocaleString()} = ${numStr(60000 / rpm)}ミリ秒。平均回転待ちはその半分で ${numStr(ans)}ミリ秒。`,
      source: '生成問題(計算 / 回転待ち)'
    };
  },
  // PERT 三点見積の期待所要時間
  pert() {
    const o = pick([1, 2, 3, 4, 5, 6]);
    const m = o + pick([2, 3, 4, 5]);
    const p = m + pick([2, 3, 4, 6]);
    if ((o + 4 * m + p) % 6 !== 0) return null;
    const ans = (o + 4 * m + p) / 6;
    const dist = [(o + m + p) / 3, (o + 4 * m + p) / 4, m, (o + p) / 2];
    const { choices, correctIndex } = buildNumeric(ans, dist, '日');
    return {
      idKey: `pert_${o}_${m}_${p}`, category: 'マネジメント', relatedWordIds: ['w031'],
      text: `ある作業について、楽観値${o}日、最可能値${m}日、悲観値${p}日と見積もった。PERTにおける期待所要日数は何日か。`,
      choices, correctIndex,
      explanation: `期待値 = (楽観値 + 4×最可能値 + 悲観値) ÷ 6 = (${o} + 4×${m} + ${p}) ÷ 6 = ${o + 4 * m + p} ÷ 6 = ${numStr(ans)}日。`,
      source: '生成問題(計算 / PERT)'
    };
  },
  // 表現できる色数(nビット → 2^n色)
  colors() {
    const n = pick([1, 2, 4, 8, 16, 24]);
    const ans = Math.pow(2, n);
    const dist = [Math.pow(2, n - 1), n * n, 2 * n, Math.pow(2, n + 1)];
    const { choices, correctIndex } = buildNumeric(ans, dist, '色');
    return {
      idKey: `colors_${n}`, category: 'テクノロジ', relatedWordIds: [],
      text: `1画素を${n}ビットで表現するとき、表現できる色数は何色か。`,
      choices, correctIndex,
      explanation: `${n}ビットで 2^${n} = ${ans.toLocaleString()}色を表現できる。`,
      source: '生成問題(計算 / 色数)'
    };
  },
  // サブネットに割当て可能なホスト数(2^n − 2)
  subnet() {
    const n = pick([3, 4, 5, 6, 7, 8]);
    const ans = Math.pow(2, n) - 2;   // ネットワークアドレスとブロードキャストを除く
    const dist = [Math.pow(2, n), Math.pow(2, n) - 1, Math.pow(2, n - 1) - 2, Math.pow(2, n) + 2];
    const { choices, correctIndex } = buildNumeric(ans, dist, '台');
    return {
      idKey: `subnet_${n}`, category: 'テクノロジ', relatedWordIds: ['w010'],
      text: `あるサブネットのホスト部が${n}ビットのとき、そのサブネットに割り当てられるホストの最大数は幾つか。`,
      choices, correctIndex,
      explanation: `ホスト部${n}ビットで 2^${n} = ${Math.pow(2, n)} 通り。ネットワークアドレスとブロードキャストアドレスの2つを除き、${Math.pow(2, n)} − 2 = ${ans}台。`,
      source: '生成問題(計算 / サブネット)'
    };
  },
  // 期待値(2択の確率×利得)
  expval() {
    const p = pick([0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 0.8]);
    const a = pick([100, 200, 500, 1000, 2000, 5000]);
    const b = pick([0, 100, 200, 500, 1000]);
    if (a === b) return null;
    const ans = p * a + (1 - p) * b;
    const dist = [(a + b) / 2, p * a, a * (1 - p) + b * p, a * p + b];
    const { choices, correctIndex } = buildNumeric(ans, dist, '円');
    return {
      idKey: `expval_${p}_${a}_${b}`, category: 'ストラテジ', relatedWordIds: [],
      text: `確率${p}で${a.toLocaleString()}円、確率${numStr(1 - p)}で${b.toLocaleString()}円が得られるとき、得られる金額の期待値は何円か。`,
      choices, correctIndex,
      explanation: `期待値 = ${p}×${a.toLocaleString()} + ${numStr(1 - p)}×${b.toLocaleString()} = ${numStr(ans)}円。`,
      source: '生成問題(計算 / 期待値)'
    };
  },
  // 回収期間法
  payback() {
    const cf = pick([200000, 250000, 300000, 400000, 500000]);
    const years = pick([2, 3, 4, 5, 6]);
    const invest = cf * years;   // ちょうど割り切れる投資額
    const ans = years;
    const dist = [years + 1, years - 1, years + 2, years + 3];
    const { choices, correctIndex } = buildNumeric(ans, dist, '年');
    return {
      idKey: `payback_${cf}_${years}`, category: 'ストラテジ', relatedWordIds: ['w187'],
      text: `初期投資額${invest.toLocaleString()}円、毎年の回収額(キャッシュフロー)が${cf.toLocaleString()}円の投資案件がある。回収期間法による回収期間は何年か。`,
      choices, correctIndex,
      explanation: `回収期間 = 初期投資額 ÷ 年間回収額 = ${invest.toLocaleString()} ÷ ${cf.toLocaleString()} = ${ans}年。`,
      source: '生成問題(計算 / 回収期間)'
    };
  },
  // RAID5 の実効容量
  raid5() {
    const disk = pick([500, 1000, 2000, 4000]);
    const n = pick([3, 4, 5, 6, 8]);
    const ans = (n - 1) * disk;
    const dist = [n * disk, (n - 2) * disk, disk, n * disk / 2];
    const { choices, correctIndex } = buildNumeric(ans, dist, 'Gバイト');
    return {
      idKey: `raid5_${disk}_${n}`, category: 'テクノロジ', relatedWordIds: ['w022'],
      text: `容量${disk.toLocaleString()}Gバイトのディスク${n}台でRAID5を構成したとき、実効的に利用できる容量は何Gバイトか。`,
      choices, correctIndex,
      explanation: `RAID5はパリティで1台分を使うため、実効容量 = (台数−1)×1台容量 = (${n}−1)×${disk.toLocaleString()} = ${ans.toLocaleString()}Gバイト。`,
      source: '生成問題(計算 / RAID5)'
    };
  },
  // n台同一稼働率の直列/並列
  seriesn() {
    const a = pick([0.7, 0.8, 0.9, 0.95, 0.99]);
    const n = pick([2, 3, 4]);
    const series = rng() < 0.5;
    const ans = series ? Math.pow(a, n) : 1 - Math.pow(1 - a, n);
    if (round4(ans) >= 1) return null;   // 稼働率が丸めて1になる組合せは誤解を招くため出題しない
    const other = series ? 1 - Math.pow(1 - a, n) : Math.pow(a, n);
    const dist = [other, a, Math.pow(a, n - 1), 1 - Math.pow(1 - a, n - 1)];
    const { choices, correctIndex } = buildNumeric(ans, dist, '');
    return {
      idKey: `seriesn_${series ? 's' : 'p'}_${a}_${n}`, category: 'テクノロジ', relatedWordIds: ['w051'],
      text: series
        ? `稼働率が${a}の装置を${n}台直列に接続し、全部が動作するときだけ稼働する。システム全体の稼働率はおよそ幾らか。`
        : `稼働率が${a}の装置を${n}台並列に接続し、少なくとも1台が動作すれば稼働する。システム全体の稼働率はおよそ幾らか。`,
      choices, correctIndex,
      explanation: series
        ? `直列は稼働率の積。${a}^${n} = ${numStr(ans)}。`
        : `並列は「全台が同時に停止しない確率」。1 − (1−${a})^${n} = ${numStr(ans)}。`,
      source: '生成問題(計算 / 稼働率)'
    };
  },
  // M/M/1 平均応答時間(待ち+処理)
  queueW() {
    const rho = pick([0.2, 0.5, 0.6, 0.75, 0.8]);
    const ts = pick([10, 20, 25, 40, 50, 100]);
    const ans = ts / (1 - rho);
    const dist = [rho / (1 - rho) * ts, ts, rho * ts, ts * (1 - rho)];
    const { choices, correctIndex } = buildNumeric(ans, dist, 'ミリ秒');
    return {
      idKey: `queueW_${rho}_${ts}`, category: 'テクノロジ', relatedWordIds: ['w080'],
      text: `M/M/1の待ち行列モデルで、窓口の利用率が${rho}、平均サービス時間が${ts}ミリ秒のとき、平均応答時間(待ち時間＋処理時間)はおよそ何ミリ秒か。`,
      choices, correctIndex,
      explanation: `平均応答時間 = 平均サービス時間 ÷ (1−利用率) = ${ts} ÷ (1−${rho}) = ${numStr(ans)}ミリ秒。`,
      source: '生成問題(計算 / 待ち行列)'
    };
  },
  // 1命令の平均実行時間(CPI / クロック周波数)
  cputime() {
    const cpi = pick([2, 3, 4, 5, 8, 10]);
    const f = pick([0.5, 1, 2, 2.5, 4, 5]);   // GHz
    const ans = cpi / f;                       // ナノ秒(1GHz周期=1ns)
    const dist = [f / cpi, cpi * f, cpi, 1 / f];
    const { choices, correctIndex } = buildNumeric(ans, dist, 'ナノ秒');
    return {
      idKey: `cputime_${cpi}_${f}`, category: 'テクノロジ', relatedWordIds: [],
      text: `クロック周波数${f}GHz、1命令の実行に平均${cpi}クロックを要するCPUで、1命令の平均実行時間はおよそ何ナノ秒か。`,
      choices, correctIndex,
      explanation: `1クロックの時間 = 1 ÷ ${f}GHz = ${numStr(1 / f)}ナノ秒。1命令 = ${cpi}クロック × ${numStr(1 / f)} = ${numStr(ans)}ナノ秒。`,
      source: '生成問題(計算 / 命令実行時間)'
    };
  },
  // ハミング符号の冗長ビット数
  hamming() {
    const m = pick([4, 8, 16, 32, 64]);
    let r = 1; while (Math.pow(2, r) < m + r + 1) r++;
    const dist = [r + 1, r - 1, Math.ceil(Math.log2(m)), r + 2];
    const { choices, correctIndex } = buildNumeric(r, dist, 'ビット');
    return {
      idKey: `hamming_${m}`, category: 'テクノロジ', relatedWordIds: ['w076'],
      text: `${m}ビットのデータに対して単一ビット誤りを訂正できるハミング符号を構成するとき、必要な冗長(検査)ビット数は最小で何ビットか。`,
      choices, correctIndex,
      explanation: `検査ビット数rは 2^r ≧ (データビット数 + r + 1) を満たす最小のr。${m}ビットでは r=${r}(2^${r}=${Math.pow(2, r)} ≧ ${m + r + 1})。`,
      source: '生成問題(計算 / ハミング符号)'
    };
  },
  // 磁気ディスクの記憶容量
  diskcap() {
    const trackKB = pick([25, 40, 50, 60, 100]);
    const tracks = pick([10, 15, 20, 30]);
    const cyls = pick([500, 800, 1000, 2000]);
    const ansMB = trackKB * tracks * cyls / 1000;
    const dist = [trackKB * cyls / 1000, trackKB * tracks / 1000, ansMB * 2, ansMB / 2];
    const { choices, correctIndex } = buildNumeric(ansMB, dist, 'Mバイト');
    return {
      idKey: `diskcap_${trackKB}_${tracks}_${cyls}`, category: 'テクノロジ', relatedWordIds: [],
      text: `1トラックの記憶容量が${trackKB}Kバイト、1シリンダ当たり${tracks}トラック、シリンダ数が${cyls.toLocaleString()}の磁気ディスクの記憶容量は何Mバイトか。ここで1Mバイト=1,000Kバイトとする。`,
      choices, correctIndex,
      explanation: `容量 = 1トラック容量 × トラック数 × シリンダ数 = ${trackKB} × ${tracks} × ${cyls.toLocaleString()} = ${(trackKB * tracks * cyls).toLocaleString()}Kバイト = ${numStr(ansMB)}Mバイト。`,
      source: '生成問題(計算 / ディスク容量)'
    };
  },
  // RAID0 / RAID1 の実効容量
  raid01() {
    const disk = pick([500, 1000, 2000, 4000]);
    const n = pick([2, 4, 6, 8]);
    const isRaid0 = rng() < 0.5;
    const ans = isRaid0 ? n * disk : n / 2 * disk;
    const dist = [isRaid0 ? n / 2 * disk : n * disk, disk, (n - 1) * disk, disk * 2];
    const { choices, correctIndex } = buildNumeric(ans, dist, 'Gバイト');
    return {
      idKey: `raid01_${isRaid0 ? 0 : 1}_${disk}_${n}`, category: 'テクノロジ', relatedWordIds: ['w216'],
      text: isRaid0
        ? `容量${disk.toLocaleString()}Gバイトのディスク${n}台でRAID0(ストライピング)を構成したとき、実効的に利用できる容量は何Gバイトか。`
        : `容量${disk.toLocaleString()}Gバイトのディスク${n}台でRAID1(ミラーリング)を構成したとき、実効的に利用できる容量は何Gバイトか。`,
      choices, correctIndex,
      explanation: isRaid0
        ? `RAID0は全容量を使える。${n}×${disk.toLocaleString()} = ${ans.toLocaleString()}Gバイト。`
        : `RAID1は同じ内容を2台に複製するため実効容量は半分。${n}÷2×${disk.toLocaleString()} = ${ans.toLocaleString()}Gバイト。`,
      source: '生成問題(計算 / RAID)'
    };
  }
};

// 各系統から目標数だけ生成(重複文はスキップして再試行)
const TARGET = {
  avail: 80, sysavail: 90, radix: 60, transfer: 80, breakeven: 85, cache: 90, imgsize: 30,
  compl2: 19, mips: 30, addr: 12, queue: 36, pcm: 72, depreciation: 55, rotwait: 11, pert: 20,
  colors: 6, subnet: 6, expval: 75, payback: 25, raid5: 20,
  seriesn: 40, queueW: 36, cputime: 30, hamming: 5, diskcap: 44, raid01: 30
};
// 分野別正答率レーダー用のサブカテゴリ(relatedWordIdsが無い系統もあるため系統ごとに直接指定)
const SUBCAT_BY_TYPE = {
  avail: '基礎理論', sysavail: '基礎理論', radix: '基礎理論', transfer: 'ネットワーク', breakeven: '会計法務',
  cache: 'ハードウェア', imgsize: '基礎理論', compl2: '基礎理論', mips: 'ハードウェア', addr: 'ハードウェア',
  queue: '基礎理論', pcm: '基礎理論', depreciation: '会計法務', rotwait: 'ハードウェア', pert: '開発管理',
  colors: '基礎理論', subnet: 'ネットワーク', expval: '経営戦略', payback: '会計法務', raid5: 'ハードウェア',
  seriesn: '基礎理論', queueW: '基礎理論', cputime: 'ハードウェア', hamming: '基礎理論', diskcap: 'ハードウェア', raid01: 'ハードウェア'
};
for (const [type, want] of Object.entries(TARGET)) {
  let made = 0, attempts = 0;
  while (made < want && attempts < want * 60) {
    attempts++;
    const q = GEN[type]();
    if (!q) continue;
    // 系統別ガイド(考え方・注意)で解説を3部構成にする
    const guide = CALC_GUIDE[type] || {};
    const question = {
      questionId: `gc_${q.idKey}`,
      category: q.category,
      subcat: SUBCAT_BY_TYPE[type],
      text: q.text,
      choices: q.choices,
      correctIndex: q.correctIndex,
      explanation: [
        guide.idea ? `【考え方】${guide.idea}` : null,
        `【計算】${q.explanation}`,
        guide.note ? `【注意】${guide.note}` : null,
      ].filter(Boolean).join('\n'),
      source: q.source,
      relatedWordIds: q.relatedWordIds
    };
    if (add(question)) made++;
  }
}

const out = {
  qualification: 'FE',
  version: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  note: 'FE科目Aの計算問題を自動生成(tools/generate_calc_questions.js)。正答はコード計算で保証、ダミーは典型的な計算ミス値。',
  questions
};
const outPath = path.join(ROOT, 'qualifications/fe/questions_calc.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 1), 'utf8');

const byType = {};
questions.forEach(q => { const t = q.questionId.split('_')[1]; byType[t] = (byType[t] || 0) + 1; });
console.log(`generated ${questions.length} calc questions -> ${path.relative(ROOT, outPath)}`);
console.log('by type:', JSON.stringify(byType));
