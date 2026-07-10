/* data.js — 用語辞書・問題集の読み込み
 * qualifications/fe/ 配下の JSON を読み込む。ホスト時は fetch、
 * オフライン時は Service Worker がキャッシュから返す。
 * file:// で直接開いた場合など fetch に失敗したときは、
 * window.__FE_WORDS__ / __FE_QUESTIONS__(任意の埋め込み)にフォールバックする。
 */
const Data = (() => {
  const CATS = ['テクノロジ', 'マネジメント', 'ストラテジ'];
  let words = [], questions = [];
  let wordById = {}, questionById = {};

  async function loadJson(path, fallbackKey) {
    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (window[fallbackKey]) return window[fallbackKey];
      throw e;
    }
  }

  async function load() {
    // 問題は複数ソースを結合して扱う。追加ソースが取れない環境でも
    // 基本問題(questions.json)だけで動くよう、追加分の失敗は握りつぶす。
    //   questions.json           … 手書きの再構成問題
    //   questions_official.json  … IPA公式の過去問(令和5〜7年度 科目A)。出典は各問sourceに保持
    //   questions_generated.json … 辞書から機械生成した定義/用語選択/例え問題
    //   questions_calc.json      … 機械生成した計算問題(稼働率・基数変換・損益分岐点 等)
    //   questions_b.json           … IPA公式の科目B(アルゴリズム/セキュリティ)
    //   questions_b_generated.json … 機械生成した科目Bアルゴリズム(トレース)問題
    // 各要素の4番目は subject('A'=午前系 / 'B'=科目B)。B問題は category='テクノロジ' 固定＋genreで細分。
    const OPTIONAL = [
      ['qualifications/fe/questions_official.json', '__FE_QUESTIONS_OFFICIAL__', 'IPA公式', 'A'],
      ['qualifications/fe/questions_generated.json', '__FE_QUESTIONS_GENERATED__', '生成問題', 'A'],
      ['qualifications/fe/questions_calc.json', '__FE_QUESTIONS_CALC__', '生成問題(計算)', 'A'],
      ['qualifications/fe/questions_b.json', '__FE_QUESTIONS_B__', 'IPA公式(科目B)', 'B'],
      ['qualifications/fe/questions_b_generated.json', '__FE_QUESTIONS_B_GEN__', '生成問題(科目B)', 'B']
    ];
    const [w, q] = await Promise.all([
      loadJson('qualifications/fe/words.json', '__FE_WORDS__'),
      loadJson('qualifications/fe/questions.json', '__FE_QUESTIONS__')
    ]);
    const tag = (src, defSrc, subject) => (src.questions || []).map(x => ({
      qualification: src.qualification || 'FE',
      ...x,
      source: x.source || defSrc,
      subject: subject || 'A',
      // 科目Bは分野をテクノロジ扱いにして分野別統計に反映(genreは別に保持)
      category: x.category || (subject === 'B' ? 'テクノロジ' : x.category)
    }));
    const extra = await Promise.all(OPTIONAL.map(async ([p, fb, def, subj]) => {
      try { return tag(await loadJson(p, fb), def, subj); }
      catch (e) { console.warn('optional questions unavailable:', p, e); return []; }
    }));

    words = (w.words || []).map(x => ({ qualification: w.qualification || 'FE', ...x }));
    questions = tag(q, '再構成問題', 'A').concat(...extra);
    wordById = Object.fromEntries(words.map(x => [x.wordId, x]));
    questionById = Object.fromEntries(questions.map(x => [x.questionId, x]));
    return { words, questions };
  }

  return {
    CATS,
    load,
    get words() { return words; },
    get questions() { return questions; },
    wordById: (id) => wordById[id],
    questionById: (id) => questionById[id],
    // 分野別正答率レーダー用の細分化サブカテゴリ。問題自体にsubcatがあればそれを、
    // なければ最初の関連語彙(relatedWordIds[0])のsubcatを使う。
    subcatOf: (q) => {
      if (!q) return null;
      if (q.subcat) return q.subcat;
      const id = (q.relatedWordIds || [])[0];
      const w = id && wordById[id];
      return (w && w.subcat) || null;
    },
    wordsByCategory: (cat) => words.filter(x => x.category === cat),
    // 科目A(午前系)のみ。分野で絞り込み
    questionsByCategory: (cat) => questions.filter(x => x.subject !== 'B' && (cat === '全分野' || x.category === cat)),
    // 科目B(アルゴリズム/セキュリティ)。genreで絞り込み
    questionsBySubjectB: (genre) => questions.filter(x => x.subject === 'B' && (genre === '全部' || !genre || x.genre === genre)),
    get subjectBCount() { return questions.filter(x => x.subject === 'B').length; }
  };
})();
