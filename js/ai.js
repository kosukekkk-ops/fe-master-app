/* ai.js — Claude API による解説生成(オンデマンド)
 * ・ユーザーがボタンを押したときだけ呼び出す(自動連打によるコスト増を防止)
 * ・生成結果は苦手単語帳エントリの ai.{styleKey} にキャッシュし、同じ要求では再呼び出ししない
 * ・APIキー未設定でもアプリの他機能はすべて動作する(ここだけオンライン必須)
 *
 * 注意: 本アプリはサーバを持たない静的PWAのため、個人利用前提で
 * ブラウザから直接 Anthropic API を呼ぶ(anthropic-dangerous-direct-browser-access)。
 * APIキーは端末の localStorage にのみ保存される。
 */
const AI = (() => {
  const ENDPOINT = 'https://api.anthropic.com/v1/messages';

  const STYLES = {
    base:    '中学生にも分かるように、身近な「例え話」を1つ入れて4〜5文で説明してください。',
    simpler: 'できるだけやさしい言葉で、専門用語を避けて、さらに簡単に短く説明してください。',
    alt:     '前回とは別の角度の、新しい身近な「例え話」を使って説明し直してください。'
  };

  function hasKey() { return !!Store.getSettings().apiKey; }

  async function explain(word, styleKey = 'base') {
    const s = Store.getSettings();
    if (!s.apiKey) throw new Error('NO_KEY');
    const style = STYLES[styleKey] || STYLES.base;
    const prompt =
      `あなたは基本情報技術者試験の講師です。次の用語について、受験生が腑に落ちるように解説してください。\n` +
      `用語: ${word.word}\n分野: ${word.category}\n` +
      `参考の意味: ${word.meaning || '(なし)'}\n\n` +
      `${style}\n見出しや箇条書きは使わず、説明文のみを出力してください。`;

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: s.model || 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('APIキーが正しくありません(設定タブで確認してください)');
      if (res.status === 429) throw new Error('リクエストが混み合っています。しばらくしてから再試行してください');
      const t = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const text = (json.content || []).map(c => c.text || '').join('').trim();
    if (!text) throw new Error('空の応答が返りました');
    return text;
  }

  return { hasKey, explain, STYLES };
})();
