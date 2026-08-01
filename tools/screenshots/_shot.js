/* _shot.js — App Store用スクリーンショット撮影ハーネス。
 * 本番アセットには含めない。docs/のコピーに対してのみ注入する。
 * ?shot=<画面名> を付けて開くと、サンプルデータを流し込み目的の画面まで自動で進める。
 */
(() => {
  const shot = new URLSearchParams(location.search).get('shot') || 'home';

  // --- 1) サンプル学習データを注入(app.jsが読む前に済ませる) ---
  const P = 'feapp:FE:';
  // タブを使い回すので、前回の撮影分(演習の途中状態など)を必ず消してから積む
  Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k));
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const at = (n, h) => day(n) + 'T' + String(h).padStart(2, '0') + ':30:00.000Z';

  // 直近5日連続で学習、通算39問・正答率67%、当日は9問
  const log = [];
  const plan = [[4, 8], [3, 7], [2, 6], [1, 5], [0, 9]];  // [何日前, 問題数]
  let seq = 0;
  for (const [ago, n] of plan) {
    for (let i = 0; i < n; i++) {
      log.push({ q: 'g_def_w' + String((seq % 380) + 1).padStart(3, '0'), chosen: 0,
                 correct: seq % 3 !== 2, ts: at(ago, 9 + (i % 8)) });
      seq++;
    }
  }
  const weak = {};
  for (let i = 1; i <= 11; i++) weak['w' + String(i).padStart(3, '0')] = { wrongCount: 12 - i, sourceQuestionIds: [], ai: {} };

  localStorage.setItem(P + 'theme', JSON.stringify('light'));
  localStorage.setItem(P + 'log', JSON.stringify(log));
  localStorage.setItem(P + 'weak', JSON.stringify(weak));
  localStorage.setItem(P + 'premium', JSON.stringify(true));   // 有料機能もスクショに写す
  localStorage.setItem(P + 'updateMeta', JSON.stringify({ checkedOn: day(0), latest: '1.2' }));
  localStorage.setItem(P + 'reviewMeta', JSON.stringify({ asked: true }));

  // --- 2) 画面遷移のドライバ ---
  const $ = (s) => document.querySelector(s);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const click = (sel) => { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.click(); return !!el; };
  const tab = (name) => click('.tabbar button[data-tab="' + name + '"]');

  async function startQuiz() {
    tab('quiz');
    await wait(300);
    click('#quiz-start');
    await wait(600);
  }

  // 正解した状態の解説を出す(選択肢の正誤は実行時シャッフルなので当たるまで進める)
  async function answeredCorrectly() {
    for (let tries = 0; tries < 20; tries++) {
      const cs = document.querySelectorAll('.choice');
      if (!cs.length) { await wait(200); continue; }
      cs[Math.floor(Math.random() * cs.length)].click();
      await wait(300);
      const fb = $('.feedback');
      if (fb && /正解/.test(fb.textContent) && !/不正解/.test(fb.textContent)) return;
      click('#q-next');
      await wait(300);
    }
  }

  async function drive() {
    if (shot === 'quiz') { await startQuiz(); }
    else if (shot === 'exp') { await startQuiz(); await answeredCorrectly(); }
    else if (shot === 'flash') {
      tab('flash'); await wait(300);
      click('#flash-start'); await wait(500);
      click('#card'); await wait(500);          // カードを裏返して意味を表示
      document.querySelector('#card').scrollIntoView({ block: 'start' });
      scrollBy(0, -70); await wait(500);
    }
    else if (shot === 'stats') { tab('stats'); await wait(700); }
    document.documentElement.removeAttribute('data-theme');  // headlessの端末設定がダークでもライトで撮る
    document.title = 'SHOT-READY';
  }

  addEventListener('DOMContentLoaded', () => setTimeout(drive, 900));

  // --- 3) 撮影用の見た目調整 ---
  addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = '::-webkit-scrollbar{display:none !important}' +
                    '.toast{display:none !important}';
    document.head.appendChild(s);
  });
})();
