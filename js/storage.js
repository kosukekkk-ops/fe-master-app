/* storage.js — localStorage 永続化レイヤ
 * 資格を軸にした名前空間(feapp:<QUAL>:<key>)で保存する。
 * 将来の資格切り替え(簿記/ITパスポート等)に備え、QUAL を差し替えるだけで
 * 別資格のデータへ切り替えられる構造にしている。
 */
const Store = (() => {
  const QUAL = 'FE';
  const ns = (key) => `feapp:${QUAL}:${key}`;

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(ns(key));
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('Store.read failed', key, e);
      return fallback;
    }
  }
  function write(key, val) {
    try { localStorage.setItem(ns(key), JSON.stringify(val)); }
    catch (e) { console.warn('Store.write failed', key, e); }
  }

  return {
    QUAL,
    // 解答ログ: [{ q, chosen, correct, ts }]
    getLog() { return read('log', []); },
    addLog(entry) { const l = read('log', []); l.push(entry); write('log', l); },

    // 苦手単語帳: { wordId: { wrongCount, lastWrongAt, sourceQuestionIds:[], ai:{} } }
    getWeak() { return read('weak', {}); },
    setWeak(w) { write('weak', w); },

    // フラッシュカード進捗: { deckKey: { known:[ids], idx } }
    getFlash() { return read('flash', {}); },
    setFlash(f) { write('flash', f); },

    // 設定: { apiKey, model }
    getSettings() { return read('settings', { apiKey: '', model: 'claude-haiku-4-5-20251001' }); },
    setSettings(s) { write('settings', s); },

    resetAll() {
      ['log', 'weak', 'flash'].forEach(k => localStorage.removeItem(ns(k)));
    },
    exportAll() {
      return { qualification: QUAL, log: read('log', []), weak: read('weak', {}), flash: read('flash', {}) };
    },
    // 書き出したJSONを取り込んで、今の端末のデータへマージする(上書きではなく合算)。
    // 別のURL/ブラウザで学習していた履歴を引き継ぐための機能。
    importMerge(data) {
      const log = read('log', []).concat(Array.isArray(data.log) ? data.log : []);
      log.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
      write('log', log);

      const weak = read('weak', {});
      Object.entries(data.weak || {}).forEach(([id, e]) => {
        const cur = weak[id] || { wrongCount: 0, sourceQuestionIds: [], ai: {} };
        cur.wrongCount = (cur.wrongCount || 0) + (e.wrongCount || 0);
        cur.sourceQuestionIds = Array.from(new Set([...(cur.sourceQuestionIds || []), ...(e.sourceQuestionIds || [])]));
        cur.ai = { ...(e.ai || {}), ...(cur.ai || {}) };
        cur.lastWrongAt = [cur.lastWrongAt, e.lastWrongAt].filter(Boolean).sort().pop();
        weak[id] = cur;
      });
      write('weak', weak);

      const flash = read('flash', {});
      Object.entries(data.flash || {}).forEach(([k, v]) => { if (!flash[k]) flash[k] = v; });
      write('flash', flash);

      return { logCount: log.length, weakCount: Object.keys(weak).length };
    }
  };
})();
