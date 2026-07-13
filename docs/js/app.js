/* app.js — 画面制御と各機能の実装 */
(() => {
  'use strict';
  const $ = (sel, el = document) => el.querySelector(sel);
  const CATS = ['テクノロジ', 'マネジメント', 'ストラテジ'];
  const CAT_CLASS = { 'テクノロジ': 'tech', 'マネジメント': 'mgmt', 'ストラテジ': 'strat' };
  const CAT_COLOR = { 'テクノロジ': 'var(--tech)', 'マネジメント': 'var(--mgmt)', 'ストラテジ': 'var(--strat)' };
  // 分野別正答率レーダー用の細分化サブカテゴリ(9分野)
  const SUBCATS = ['基礎理論', 'アルゴリズム', 'ハードウェア', 'データベース', 'ネットワーク', 'セキュリティ', '開発管理', '経営戦略', '会計法務'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

  let toastTimer;
  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- 外観テーマ(system | light | dark) ---------- */
  const lightMedia = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
  function applyTheme(pref) {
    const light = pref === 'light' || (pref === 'system' && lightMedia && lightMedia.matches);
    if (light) document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    // ステータスバー等の色をテーマに追随させる
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = light ? '#eef1f6' : '#0f1420';
  }
  if (lightMedia && lightMedia.addEventListener) {
    lightMedia.addEventListener('change', () => { if (Store.getTheme() === 'system') applyTheme('system'); });
  }

  /* ---------- 統計の導出(解答ログが唯一の真実) ---------- */
  function stats() {
    const log = Store.getLog();
    const byCat = {}; CATS.forEach(c => byCat[c] = { ok: 0, n: 0 });
    const bySubcat = {}; SUBCATS.forEach(c => bySubcat[c] = { ok: 0, n: 0 });
    const byDay = {};
    let ok = 0;
    log.forEach(e => {
      const q = Data.questionById(e.q); const cat = q ? q.category : null;
      if (cat && byCat[cat]) { byCat[cat].n++; if (e.correct) byCat[cat].ok++; }
      const sub = Data.subcatOf(q);
      if (sub && bySubcat[sub]) { bySubcat[sub].n++; if (e.correct) bySubcat[sub].ok++; }
      const day = (e.ts || '').slice(0, 10);
      if (day) { (byDay[day] = byDay[day] || { ok: 0, n: 0 }).n++; if (e.correct) byDay[day].ok++; }
      if (e.correct) ok++;
    });
    return { total: log.length, ok, byCat, bySubcat, byDay };
  }

  /* ================= ホーム ================= */
  const DAILY_GOAL = 20; // 1日の目標問題数(達成度バナーの基準)

  // 時間帯であいさつを出し分ける
  function greeting() {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return { text: 'おはようございます', emoji: '☀️' };
    if (h >= 11 && h < 18) return { text: 'こんにちは', emoji: '🙌' };
    return { text: 'こんばんは', emoji: '👋' };
  }

  // 連続学習日数。今日または昨日に学習していれば継続中とみなし、連続する日を数える。
  function studyStreak(byDay) {
    const set = new Set(Object.keys(byDay));
    if (!set.size) return 0;
    const iso = (dt) => dt.toISOString().slice(0, 10);
    const d = new Date(today() + 'T00:00:00Z');
    if (!set.has(iso(d))) {
      d.setUTCDate(d.getUTCDate() - 1);
      if (!set.has(iso(d))) return 0; // 今日も昨日も未学習=途切れている
    }
    let streak = 0;
    while (set.has(iso(d))) { streak++; d.setUTCDate(d.getUTCDate() - 1); }
    return streak;
  }

  // 円形プログレスリング(SVG)。pct=0..1
  function ring(pct, color, center) {
    const size = 56, stroke = 6, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(1, pct)));
    return `<div class="ringwrap">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--bg-elev)" stroke-width="${stroke}"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
          transform="rotate(-90 ${size/2} ${size/2})"/>
      </svg>
      <span class="ringc" style="color:${color}">${center}</span>
    </div>`;
  }

  const ICON = {
    list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none"/></svg>`,
    trend: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 0 4 20.5z"/><path d="M4 17.5A1.5 1.5 0 0 1 5.5 16H20"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 13 10 18 19 6"/></svg>`,
    target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
    cards: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="14" height="12" rx="2"/><path d="M7 6V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-1"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`,
    code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 8 4 12 8 16"/><polyline points="16 8 20 12 16 16"/><line x1="14" y1="5" x2="10" y2="19"/></svg>`,
    briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    bars: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="15"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/></svg>`,
    layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 3 21 8 12 13 3 8"/><polyline points="3 12.5 12 17.5 21 12.5"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2 2 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>`,
    back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`
  };

  function renderHome() {
    const s = stats();
    const rate = s.total ? Math.round((s.ok / s.total) * 100) : 0;
    const weak = Store.getWeak();
    const weakCount = Object.keys(weak).length;
    const td = s.byDay[today()] || { ok: 0, n: 0 };
    const todayRate = td.n ? Math.round(td.ok / td.n * 100) : 0;
    const streak = studyStreak(s.byDay);
    const g = greeting();

    // 達成度バナー: 今日の学習量が1日の目標に対しどれだけ進んだか
    const goalPct = Math.min(100, Math.round(td.n / DAILY_GOAL * 100));
    let bTitle, bSub;
    if (td.n === 0) { bTitle = '今日の学習を始めよう！'; bSub = '少しずつでも続けるのが合格への近道です。'; }
    else if (goalPct < 50) { bTitle = 'いいスタートです！'; bSub = 'この調子で今日の目標を達成しましょう！'; }
    else if (goalPct < 100) { bTitle = '素晴らしいペースです！'; bSub = 'ゴールはもうすぐそこです！'; }
    else { bTitle = '今日の目標を達成！🎉'; bSub = '素晴らしい継続力です。'; }

    const v = $('#view-home');
    v.innerHTML = `
      <header class="home-head">
        <div class="greeting">
          <h1>${g.text}！<span class="wave">${g.emoji}</span></h1>
          <div class="sub">今日も一緒に頑張りましょう！</div>
        </div>
        <div class="streak">
          <div class="flame">🔥</div>
          <div class="streak-txt"><div class="streak-lbl">連続学習日数</div><div class="streak-n">${streak}<span>日</span></div></div>
        </div>
      </header>

      <section class="panel">
        <h2 class="panel-h">今日の学習</h2>
        <div class="today-grid">
          <div class="mini">
            ${ring(Math.min(1, td.n / DAILY_GOAL), 'var(--accent)', ICON.check)}
            <div class="mini-txt"><div class="mini-n">${td.n}<span>問</span></div><div class="mini-lbl">今日解いた問題</div></div>
          </div>
          <div class="mini">
            ${ring(todayRate / 100, 'var(--warn)', ICON.target)}
            <div class="mini-txt"><div class="mini-n" style="color:var(--warn)">${todayRate}<span>%</span></div><div class="mini-lbl">今日の正答率</div></div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2 class="panel-h">累計データ</h2>
        <div class="cum-grid">
          <div class="cum">
            <div class="itile" style="--c:var(--accent)">${ICON.list}</div>
            <div class="mini-txt"><div class="mini-n">${s.total}<span>問</span></div><div class="mini-lbl">総解答数</div></div>
          </div>
          <div class="cum">
            <div class="itile" style="--c:var(--ok)">${ICON.trend}</div>
            <div class="mini-txt"><div class="mini-n" style="color:var(--ok)">${rate}<span>%</span></div><div class="mini-lbl">累計正答率</div></div>
          </div>
          <div class="cum">
            <div class="itile" style="--c:var(--ng)"><b>A</b></div>
            <div class="mini-txt"><div class="mini-n" style="color:var(--ng)">${weakCount}<span>語</span></div><div class="mini-lbl">苦手単語</div></div>
          </div>
          <div class="cum">
            <div class="itile" style="--c:var(--accent-2)">${ICON.book}</div>
            <div class="mini-txt"><div class="mini-n">${Data.words.length}<span>語</span></div><div class="mini-lbl">収録用語</div></div>
          </div>
        </div>
      </section>

      <div class="banner">
        <div class="banner-body">
          <div class="banner-title">${bTitle}</div>
          <div class="banner-sub">${bSub}</div>
          <div class="banner-bar"><span style="width:${goalPct}%"></span></div>
        </div>
        <div class="banner-goal">${goalPct}%</div>
        <div class="banner-trophy">🏆</div>
      </div>

      <button class="home-cta primary" data-go="quiz">
        <span class="cta-ic">${ICON.play}</span>
        <span class="cta-label">問題演習をはじめる</span>
        <span class="cta-chev">${ICON.chevron}</span>
      </button>
      <button class="home-cta" data-go="flash">
        <span class="cta-ic sec">${ICON.cards}</span>
        <span class="cta-label">単語帳で復習する${weakCount ? `(苦手 ${weakCount} 語あり)` : ''}</span>
        <span class="cta-chev">${ICON.chevron}</span>
      </button>
    `;
    v.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  }

  /* ================= 問題演習 ================= */
  // built[]=各indexのシャッフル済み問題(前後移動で選択肢がぶれないようキャッシュ)
  // answers[]=各indexの回答状態(null=未回答 / {pos,correct,gaveUp,...})。前の問題へ戻れるようにするための保持。
  const quiz = { pool: [], idx: 0, cat: '全分野', subject: 'A', built: [], answers: [], sessionOk: 0, sessionN: 0 };

  function buildQuestion(q) {
    // 選択肢を実行時シャッフルし、正解位置が固定にならないようにする
    const order = shuffle(q.choices.map((_, i) => i));
    return {
      q,
      choices: order.map(i => q.choices[i]),
      correctPos: order.indexOf(q.correctIndex)
    };
  }

  function startQuiz(subject, key) {
    quiz.subject = subject;
    quiz.cat = key;
    let pool = shuffle(subject === 'B' ? Data.questionsBySubjectB(key) : Data.questionsByCategory(key));
    if (qstate.limit > 0) pool = pool.slice(0, qstate.limit); // 出題数の上限(0=すべて)
    quiz.pool = pool;
    quiz.built = new Array(pool.length).fill(null);
    quiz.answers = new Array(pool.length).fill(null);
    quiz.idx = 0; quiz.sessionOk = 0; quiz.sessionN = 0;
    if (!quiz.pool.length) { toast('この条件の問題がありません'); return; }
    showQuestion();
  }

  const MARKS = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ'];

  // シャッフル済み問題をindex単位でキャッシュ(前後移動で選択肢の並びを固定)
  function builtAt(idx) {
    if (!quiz.built[idx]) quiz.built[idx] = buildQuestion(quiz.pool[idx]);
    return quiz.built[idx];
  }

  function showQuestion() {
    const idx = quiz.idx;
    const { q, choices, correctPos } = builtAt(idx);
    const ans = quiz.answers[idx];      // null=未回答
    const answered = !!ans;
    const last = idx >= quiz.pool.length - 1;
    const pct = Math.round(((idx + 1) / quiz.pool.length) * 100);
    const pill = q.subject === 'B'
      ? `<span class="pill strat">科目B・${esc(q.genre || 'アルゴリズム')}</span>`
      : `<span class="pill ${CAT_CLASS[q.category]}">${q.category}</span>`;
    const v = $('#view-quiz');
    v.classList.add('qmode');
    v.innerHTML = `
      <div class="quiz-scroll">
        <div class="progress-bar"><span style="width:${pct}%"></span></div>
        <div class="q-progress"><span>${idx + 1} / ${quiz.pool.length} 問</span>${pill}</div>
        <div class="q-text">${esc(q.text)}</div>
        ${q.bodyHtml ? `<div class="qbody">${q.bodyHtml}</div>` : ''}
        ${q.program ? `<pre class="pseudocode">${esc(q.program)}</pre>` : ''}
        <div class="choices">
          ${choices.map((c, i) => {
            let cls = 'choice';
            if (answered) {
              cls += ' disabled';
              if (i === correctPos) cls += ' correct';
              if (ans.pos === i && !ans.correct) cls += ' wrong';
            }
            return `<button class="${cls}" data-i="${i}"><span class="mark">${MARKS[i]}</span><span class="ctext">${esc(c)}</span></button>`;
          }).join('')}
        </div>
        ${answered ? '' : `<div class="giveup-row"><button class="btn ghost small" id="q-giveup">🤔 わからない(解説を見る)</button></div>`}
        <div id="quiz-foot"></div>
      </div>
      <div class="quiz-nav">
        <button class="qnav prev" id="q-prev" ${idx === 0 ? 'disabled' : ''}>◀ 前の問題</button>
        <button class="qnav next" id="q-next">${last ? '結果を見る' : '次の問題 ▶'}</button>
      </div>
    `;
    if (!answered) {
      v.querySelectorAll('.choice').forEach(b => b.onclick = () => answer(parseInt(b.dataset.i, 10)));
      $('#q-giveup').onclick = giveUp;
    } else {
      renderQuizFeedback(ans);
    }
    $('#q-prev').onclick = () => { if (quiz.idx > 0) { quiz.idx--; showQuestion(); window.scrollTo(0, 0); } };
    $('#q-next').onclick = () => { if (last) finishQuiz(); else { quiz.idx++; showQuestion(); window.scrollTo(0, 0); } };
  }

  function answer(pos) {
    const idx = quiz.idx;
    if (quiz.answers[idx]) return;      // 回答済みなら無視
    const { q, correctPos } = builtAt(idx);
    const correct = pos === correctPos;
    quiz.sessionN++; if (correct) quiz.sessionOk++;

    Store.addLog({ q: q.questionId, chosen: pos, correct, ts: new Date().toISOString() });

    let addedNote = '';
    if (!correct) addedNote = registerWeakWords(q);

    quiz.answers[idx] = {
      pos, correct, gaveUp: false, addedNote,
      verdictText: correct ? '⭕ 正解' : '❌ 不正解', cls: correct ? 'ok' : 'ng',
      offerManualRegister: correct && (q.relatedWordIds || []).length > 0
    };
    showQuestion();   // 回答済み表示に再描画
  }

  // 「わからない」で解説だけ確認する場合も、誤答と同じく苦手単語帳へ登録する
  function giveUp() {
    const idx = quiz.idx;
    if (quiz.answers[idx]) return;
    const { q } = builtAt(idx);
    quiz.sessionN++;

    Store.addLog({ q: q.questionId, chosen: null, correct: false, gaveUp: true, ts: new Date().toISOString() });
    const addedNote = registerWeakWords(q);

    quiz.answers[idx] = {
      pos: null, correct: false, gaveUp: true, addedNote,
      verdictText: '🤔 解説を確認しました', cls: 'skip', offerManualRegister: false
    };
    showQuestion();
  }

  // 回答済み問題のフィードバック(解説・出典・苦手登録)を #quiz-foot に描画。
  // 「次の問題」への進行は下部ナビが担うため、ここには進行ボタンを置かない。
  function renderQuizFeedback(ans) {
    const { q } = builtAt(quiz.idx);
    $('#quiz-foot').innerHTML = `
      <div class="feedback ${ans.cls}">
        <div class="verdict">${ans.verdictText}</div>
        <div class="exp">${esc(q.explanation || '')}</div>
        ${q.source ? `<div class="muted" style="font-size:12px;margin-top:8px">出典: ${esc(q.source)}</div>` : ''}
        ${ans.addedNote ? `<div class="added" id="added-note">📝 ${ans.addedNote}</div>` : ''}
        ${ans.offerManualRegister ? `<button class="btn ghost small" id="manual-register" style="margin-top:10px">📝 念のため苦手単語帳に登録</button>` : ''}
      </div>
    `;
    const noteEl = $('#added-note');
    if (noteEl) noteEl.onclick = () => go('flash');
    const regBtn = $('#manual-register');
    if (regBtn) regBtn.onclick = () => {
      const note = registerWeakWords(q);
      ans.addedNote = note; ans.offerManualRegister = false;   // 保持して再訪時も反映
      regBtn.outerHTML = note ? `<div class="added" id="added-note">📝 ${note}</div>` : '';
      const added = $('#added-note');
      if (added) added.onclick = () => go('flash');
    };
  }

  // ★コア機能: 不正解の問題に紐づく relatedWordIds を苦手単語帳へ自動登録
  function registerWeakWords(q) {
    const ids = q.relatedWordIds || [];
    if (!ids.length) return '';
    const weak = Store.getWeak();
    const names = [];
    ids.forEach(id => {
      const w = Data.wordById(id);
      if (!w) return;
      const e = weak[id] || { wrongCount: 0, sourceQuestionIds: [], ai: {} };
      e.wrongCount++;
      e.lastWrongAt = today();
      if (!e.sourceQuestionIds.includes(q.questionId)) e.sourceQuestionIds.push(q.questionId);
      weak[id] = e;
      names.push(w.word);
    });
    Store.setWeak(weak);
    return `苦手単語帳に登録: ${names.join('、')}(タップで単語帳へ)`;
  }

  function finishQuiz() {
    $('#view-quiz').classList.remove('qmode');
    const rate = quiz.sessionN ? Math.round((quiz.sessionOk / quiz.sessionN) * 100) : 0;
    const color = rate >= 60 ? 'var(--ok)' : 'var(--warn)';
    const emoji = rate >= 80 ? '🎉' : rate >= 60 ? '👍' : '💪';
    $('#view-quiz').innerHTML = `
      <div class="result-hero">
        ${ring(rate / 100, color, `<span class="result-emoji">${emoji}</span>`)}
        <div class="result-rate" style="color:${color}">${rate}<span>%</span></div>
        <div class="result-sub">${quiz.sessionOk} / ${quiz.sessionN} 問 正解</div>
      </div>
      <p class="panel-note center" style="margin:0 4px 18px">間違えた問題の重要単語は「苦手単語帳」に登録されました。単語帳で復習しましょう。</p>
      <button class="home-cta primary center" id="again">
        <span class="cta-ic">${ICON.play}</span><span class="cta-label">もう一度(${esc(quiz.cat)})</span>
      </button>
      <button class="home-cta" data-go="flash">
        <span class="cta-ic sec">${ICON.cards}</span><span class="cta-label">苦手単語帳で復習する</span><span class="cta-chev">${ICON.chevron}</span>
      </button>
    `;
    $('#again').onclick = () => startQuiz(quiz.subject, quiz.cat);
    $('#view-quiz [data-go]').onclick = () => go('flash');
  }

  // 演習開始画面。科目A(分野別4択)/科目B(アルゴリズム・セキュリティ)を切り替える
  const qstate = { subject: 'A', aKey: '全分野', bKey: '全部', limit: 0, optsOpen: false };
  // 出題範囲タイルのアイコンと色(モックアップに合わせた配色)
  const RANGES_A = [
    { key: '全分野', icon: ICON.list, color: 'var(--accent)' },
    { key: 'テクノロジ', icon: ICON.code, color: 'var(--ok)' },
    { key: 'マネジメント', icon: ICON.briefcase, color: '#fb923c' },
    { key: 'ストラテジ', icon: ICON.bars, color: 'var(--warn)' }
  ];
  const RANGES_B = [
    { key: '全部', icon: ICON.layers, color: 'var(--accent)' },
    { key: 'アルゴリズム', icon: ICON.code, color: 'var(--ok)' },
    { key: 'セキュリティ', icon: ICON.shield, color: 'var(--ng)' }
  ];
  const LIMITS = [{ n: 10, l: '10問' }, { n: 20, l: '20問' }, { n: 50, l: '50問' }, { n: 0, l: 'すべて' }];

  function renderQuizStart() {
    const v = $('#view-quiz');
    v.classList.remove('qmode');
    const bCount = Data.subjectBCount;
    const isA = qstate.subject === 'A';
    const ranges = isA ? RANGES_A : RANGES_B;
    const activeKey = isA ? qstate.aKey : qstate.bKey;
    const countOf = (k) => isA ? Data.questionsByCategory(k).length : Data.questionsBySubjectB(k).length;

    const tiles = ranges.map(r => `
      <button class="range-tile ${activeKey === r.key ? 'active' : ''}" data-range="${esc(r.key)}">
        <div class="itile sm" style="--c:${r.color}">${r.icon}</div>
        <div class="range-txt"><div class="range-name">${esc(r.key)}</div><div class="range-count">${countOf(r.key).toLocaleString()}<span>問</span></div></div>
        <span class="range-chev">${ICON.chevron}</span>
      </button>`).join('');

    v.innerHTML = `
      <button class="back-btn" data-go="home">${ICON.back}</button>
      <div class="qstart-top">
        <div class="qstart-title">
          <h1>演習をはじめる前に <span>🚀</span></h1>
          <div class="sub">出題範囲と形式を確認して、演習を開始しましょう！</div>
        </div>
        <div class="goal-chip">
          <div class="goal-lbl">🎯 目標</div>
          <div class="goal-val">苦手を克服</div>
        </div>
      </div>

      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--accent)">${ICON.list}</div><h2 class="panel-h">問題演習</h2></div>
        <div class="subj-pills">
          <button class="subj-pill ${isA ? 'active' : ''}" data-subject="A">科目A</button>
          <button class="subj-pill ${!isA ? 'active' : ''}" data-subject="B">科目B(アルゴリズム/セキュリティ)${bCount ? ` (${bCount})` : ''}</button>
        </div>
        <p class="panel-note">${isA ? '4択形式。間違えると重要単語が自動で苦手単語帳に貯まります。' : '擬似言語プログラムを読み解く形式(選択肢はア〜コ)。'}</p>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--accent-2)">${ICON.layers}</div><h2 class="panel-h">出題範囲</h2></div>
        <div class="range-grid">${tiles}</div>
      </section>

      <button class="home-cta primary center" id="quiz-start">
        <span class="cta-ic">${ICON.play}</span>
        <span class="cta-label">演習を開始する</span>
      </button>

      <button class="home-cta" id="quiz-opts-toggle" aria-expanded="${qstate.optsOpen}">
        <span class="cta-ic sec">${ICON.edit}</span>
        <span class="cta-label">演習設定を確認・変更する</span>
        <span class="cta-chev" style="transform:rotate(${qstate.optsOpen ? 90 : 0}deg)">${ICON.chevron}</span>
      </button>
      <div class="qopts" ${qstate.optsOpen ? '' : 'hidden'}>
        <div class="qopts-h">1回の出題数</div>
        <div class="chips">
          ${LIMITS.map(o => `<div class="chip ${qstate.limit === o.n ? 'active' : ''}" data-limit="${o.n}">${o.l}</div>`).join('')}
        </div>
      </div>
    `;

    v.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    v.querySelectorAll('.subj-pill').forEach(b => b.onclick = () => { qstate.subject = b.dataset.subject; renderQuizStart(); });
    v.querySelectorAll('.range-tile').forEach(b => b.onclick = () => {
      if (isA) qstate.aKey = b.dataset.range; else qstate.bKey = b.dataset.range;
      renderQuizStart();
    });
    $('#quiz-start').onclick = () => isA ? startQuiz('A', qstate.aKey) : startQuiz('B', qstate.bKey);
    $('#quiz-opts-toggle').onclick = () => { qstate.optsOpen = !qstate.optsOpen; renderQuizStart(); };
    v.querySelectorAll('.qopts .chip').forEach(ch => ch.onclick = () => {
      qstate.limit = parseInt(ch.dataset.limit, 10);
      v.querySelectorAll('.qopts .chip').forEach(x => x.classList.toggle('active', x === ch));
    });
  }

  /* ================= 単語帳(フラッシュカード) ================= */
  const flash = { deck: [], idx: 0, mode: 'weak', cat: '全分野', flipped: false, shuffleOn: false, hideKnown: false };

  function buildDeck() {
    const known = Store.getKnown();
    let base;
    if (flash.mode === 'weak') {
      const weak = Store.getWeak();
      base = Object.keys(weak)
        .map(id => ({ ...Data.wordById(id), _weak: weak[id] }))
        .filter(w => w.wordId);
      if (!flash.shuffleOn) base.sort((a, b) => (b._weak.wrongCount) - (a._weak.wrongCount));
    } else {
      base = (flash.cat === '全分野' ? Data.words : Data.wordsByCategory(flash.cat)).slice();
    }
    if (flash.hideKnown) base = base.filter(w => !known[w.wordId]);
    flash.deck = flash.shuffleOn ? shuffle(base) : base;
    flash.idx = 0; flash.flipped = false;
  }

  function renderFlashStart() {
    const weakCount = Object.keys(Store.getWeak()).length;
    const knownCount = Object.keys(Store.getKnown()).length;
    const v = $('#view-flash');
    v.innerHTML = `
      <header class="home-head">
        <div class="greeting"><h1>単語帳 📇</h1><div class="sub">タップでめくって意味と例えを確認</div></div>
      </header>
      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--accent)">${ICON.cards}</div><h2 class="panel-h">出題する単語</h2></div>
        <div class="chips" id="flash-mode">
          <div class="chip ${flash.mode==='weak'?'active':''}" data-mode="weak">苦手単語 (${weakCount})</div>
          <div class="chip ${flash.mode==='all'?'active':''}" data-mode="all">全単語 (${Data.words.length})</div>
        </div>
        <div id="flash-catwrap" class="${flash.mode==='all'?'':'hidden'}" style="${flash.mode==='all'?'':'display:none'}">
          <div class="chips" id="flash-cats" style="margin-bottom:0">
            ${['全分野', ...CATS].map(c => `<div class="chip ${flash.cat===c?'active':''}" data-cat="${esc(c)}">${esc(c)}</div>`).join('')}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--accent-2)">${ICON.edit}</div><h2 class="panel-h">オプション</h2></div>
        <div class="chips" id="flash-opts" style="margin-bottom:0">
          <div class="chip ${flash.shuffleOn?'active':''}" data-opt="shuffle">🔀 シャッフル</div>
          <div class="chip ${flash.hideKnown?'active':''}" data-opt="hideKnown">🙈 覚えた単語を隠す${knownCount ? `(${knownCount})` : ''}</div>
        </div>
      </section>
      <button class="home-cta primary center" id="flash-start">
        <span class="cta-ic">${ICON.cards}</span>
        <span class="cta-label">単語帳を開始</span>
      </button>
      <div id="flash-area"></div>
    `;
    v.querySelectorAll('#flash-mode .chip').forEach(ch => ch.onclick = () => {
      flash.mode = ch.dataset.mode; renderFlashStart();
    });
    v.querySelectorAll('#flash-cats .chip').forEach(ch => ch.onclick = () => {
      v.querySelectorAll('#flash-cats .chip').forEach(x => x.classList.remove('active'));
      ch.classList.add('active'); flash.cat = ch.dataset.cat;
    });
    v.querySelectorAll('#flash-opts .chip').forEach(ch => ch.onclick = () => {
      if (ch.dataset.opt === 'shuffle') flash.shuffleOn = !flash.shuffleOn;
      else flash.hideKnown = !flash.hideKnown;
      ch.classList.toggle('active');
    });
    $('#flash-start').onclick = () => {
      buildDeck();
      if (!flash.deck.length) { toast(flash.mode === 'weak' ? 'まだ苦手単語はありません' : '該当する単語がありません'); return; }
      showCard();
    };
  }

  // 単語帳の「試験ではこう出る」文。FE科目Aは意味・特徴を問う4択が基本。
  function examHint(w) {
    let s = `「${w.word}の説明として最も適切なものはどれか」のように意味や特徴を問う4択、または説明文から用語名を選ぶ形式で出題されます。`;
    if (w.analogy) s += '例え話は覚えるための補助です。本番では上の「意味」のような技術的な説明で問われます。';
    return s;
  }

  function showCard() {
    const area = $('#flash-area');
    if (flash.idx >= flash.deck.length) {
      area.innerHTML = `
        <div class="result-hero">
          <div class="result-emoji-lg">🎉</div>
          <div class="result-sub" style="font-size:16px;font-weight:700;color:var(--text)">1周しました</div>
          <div class="result-sub">${flash.deck.length}語を確認しました</div>
        </div>
        <button class="home-cta primary center" id="fl-again">
          <span class="cta-ic">${ICON.cards}</span><span class="cta-label">もう一度</span>
        </button>`;
      $('#fl-again').onclick = () => { buildDeck(); showCard(); };
      return;
    }
    const w = flash.deck[flash.idx];
    flash.flipped = false;
    const pct = Math.round((flash.idx / flash.deck.length) * 100);
    const wc = w._weak ? `<div class="wrongcount">間違えた回数: ${w._weak.wrongCount} 回</div>` : '';
    const isKnown = !!Store.getKnown()[w.wordId];
    // 演習と同じ充実版の説明(word_details.js)。未収録なら簡易meaningへフォールバック
    const detailText = (window.WORD_DETAILS && window.WORD_DETAILS[w.wordId]) || w.meaning;
    area.innerHTML = `
      <div class="q-progress"><span>${flash.idx + 1} / ${flash.deck.length}</span><span class="pill ${CAT_CLASS[w.category]}">${w.category}</span></div>
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
      <div class="flash-wrap"><div class="flash" id="card">
        <div class="flash-face front">
          <div class="word">${esc(w.word)}</div>
          <div class="hint">タップで意味を表示</div>
        </div>
        <div class="flash-face back">
          <div class="meaning">${esc(detailText)}</div>
          ${w.analogy ? `<div class="analogy-lbl">💡 例え話</div><div class="analogy">${esc(w.analogy)}</div>` : ''}
          <div class="exam-lbl">📝 試験ではこう出る</div>
          <div class="exam-note">${esc(examHint(w))}</div>
          ${wc}
          <div class="word-cat"><span class="pill ${CAT_CLASS[w.category]}">${w.category}</span></div>
        </div>
      </div></div>
      <button class="btn ${isKnown ? '' : 'ghost'} small" id="fl-known" style="width:100%;margin-bottom:10px">${isKnown ? '✅ 覚えた(タップで解除)' : '☐ 覚えたにする'}</button>
      <div class="row">
        <button class="btn secondary small" id="fl-prev" style="flex:1" ${flash.idx===0?'disabled':''}>◀ 前へ</button>
        <button class="btn small" id="fl-next" style="flex:2">次へ ▶</button>
      </div>
    `;
    const card = $('#card');
    card.onclick = () => { card.classList.toggle('flipped'); flash.flipped = !flash.flipped; };
    $('#fl-known').onclick = () => {
      const known = Store.getKnown();
      if (known[w.wordId]) delete known[w.wordId]; else known[w.wordId] = true;
      Store.setKnown(known);
      showCard();
    };
    $('#fl-prev').onclick = () => { if (flash.idx > 0) { flash.idx--; showCard(); } };
    $('#fl-next').onclick = () => { flash.idx++; showCard(); window.scrollTo(0, 0); };
  }

  /* ================= 学習ログ ================= */
  function renderStats() {
    const s = stats();
    const v = $('#view-stats');
    if (!s.total) { v.innerHTML = `<div class="empty"><div class="big">📊</div>まだ解答データがありません。<br>問題演習を始めると、ここに分析が表示されます。</div>`; return; }

    const axes = SUBCATS.map(c => ({ label: c, value: s.bySubcat[c].n ? s.bySubcat[c].ok / s.bySubcat[c].n : 0 }));
    const barItems = CATS.map(c => ({
      label: c, color: CAT_COLOR[c],
      value: s.byCat[c].n ? s.byCat[c].ok / s.byCat[c].n : 0,
      note: s.byCat[c].n ? `${Math.round(s.byCat[c].ok / s.byCat[c].n * 100)}% (${s.byCat[c].ok}/${s.byCat[c].n})` : '—'
    }));
    const days = Object.keys(s.byDay).sort();
    const linePts = days.map(d => ({ label: d.slice(5), value: s.byDay[d].ok / s.byDay[d].n }));

    const weak = Store.getWeak();
    const ranking = Object.keys(weak)
      .map(id => ({ w: Data.wordById(id), c: weak[id].wrongCount }))
      .filter(x => x.w)
      .sort((a, b) => b.c - a.c).slice(0, 10);

    const overallRate = Math.round((s.ok / s.total) * 100);
    v.innerHTML = `
      <header class="home-head">
        <div class="greeting"><h1>学習ログ 📊</h1><div class="sub">これまでの解答 ${s.total.toLocaleString()} 問・正答率 ${overallRate}%</div></div>
      </header>
      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--accent)">${ICON.target}</div><h2 class="panel-h">分野別 正答率(レーダー)</h2></div>
        <div class="chart-box">${Charts.radar(axes, 320)}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--ok)">${ICON.bars}</div><h2 class="panel-h">大分類の正答率</h2></div>
        <div class="chart-box">${Charts.bars(barItems)}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--accent-2)">${ICON.trend}</div><h2 class="panel-h">正答率の推移(日別)</h2></div>
        <div class="chart-box">${Charts.line(linePts)}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--ng)"><b>A</b></div><h2 class="panel-h">間違えた回数 トップ10</h2></div>
        ${ranking.length ? ranking.map((r, i) => `
          <div class="rank-item"><span class="no">${i + 1}</span>
            <span class="w">${esc(r.w.word)} <span class="pill ${CAT_CLASS[r.w.category]}" style="font-size:10px">${r.w.category}</span></span>
            <span class="cnt">${r.c}回</span></div>`).join('')
        : '<p class="panel-note">まだ苦手単語はありません。</p>'}
      </section>
    `;
  }

  /* ================= 設定 ================= */
  // 利用規約・プライバシーポリシーをアプリ内の全画面ビューアで表示(オフラインでも読める)
  function openLegal(kind) {
    const html = window.LEGAL ? window.LEGAL[kind] : null;
    if (!html) { toast('文書を読み込めませんでした'); return; }
    const overlay = document.createElement('div');
    overlay.className = 'legal-overlay';
    overlay.innerHTML = `
      <div class="legal-sheet">
        <div class="legal-head"><button class="legal-close">✕ 閉じる</button></div>
        <div class="legal-body">${html}</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.legal-close').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  function renderSettings() {
    const v = $('#view-settings');
    const theme = Store.getTheme();
    const THEMES = [{ k: 'system', l: '🖥 システム' }, { k: 'light', l: '☀️ ライト' }, { k: 'dark', l: '🌙 ダーク' }];
    v.innerHTML = `
      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--warn)">${ICON.target}</div><h2 class="panel-h">外観</h2></div>
        <div class="chips" id="set-theme" style="margin-bottom:0">
          ${THEMES.map(t => `<div class="chip ${theme === t.k ? 'active' : ''}" data-theme-opt="${t.k}">${t.l}</div>`).join('')}
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--accent)">${ICON.list}</div><h2 class="panel-h">データ管理</h2></div>
        <p class="panel-note" style="margin-bottom:12px">学習ログ・苦手単語帳は端末内に保存され、次回も引き継がれます。別のURL/ブラウザで学習していた履歴は、書き出したJSONをこの端末で読み込むと合算されます。</p>
        <button class="btn secondary" id="set-export">学習データを書き出す(JSON)</button>
        <div style="height:10px"></div>
        <input type="file" id="set-import-file" accept="application/json" style="display:none">
        <button class="btn secondary" id="set-import">学習データを読み込む(JSON)</button>
        <div style="height:10px"></div>
        <button class="btn ghost" id="set-reset" style="color:var(--ng);border-color:var(--ng)">学習データを全消去</button>
      </section>
      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--accent-2)">${ICON.shield}</div><h2 class="panel-h">サポート</h2></div>
        <button class="setting-row" data-legal="terms"><span>利用規約</span><span class="cta-chev">${ICON.chevron}</span></button>
        <button class="setting-row" data-legal="privacy"><span>プライバシーポリシー</span><span class="cta-chev">${ICON.chevron}</span></button>
        <button class="setting-row" id="set-contact"><span>お問い合わせ(GitHub)</span><span class="cta-chev">${ICON.chevron}</span></button>
      </section>
      <section class="panel">
        <div class="panel-head"><div class="itile sm" style="--c:var(--ok)">${ICON.book}</div><h2 class="panel-h">このアプリについて</h2></div>
        <div class="about-rows">
          <div class="about-row"><span>アプリ名</span><span>基本情報技術者 FE対策</span></div>
          <div class="about-row"><span>バージョン</span><span>1.0.0</span></div>
          <div class="about-row"><span>収録用語</span><span>${Data.words.length} 語</span></div>
          <div class="about-row"><span>収録問題</span><span>${Data.questions.length.toLocaleString()} 問</span></div>
        </div>
        <p class="panel-note" style="margin-top:12px">主要機能はオフラインで動作します。本アプリは個人開発の学習教材であり、試験実施団体(IPA)とは関係ありません。「基本情報技術者試験」はIPAの登録商標または名称です。</p>
      </section>
    `;
    v.querySelectorAll('#set-theme .chip').forEach(ch => ch.onclick = () => {
      const pref = ch.dataset.themeOpt;
      Store.setTheme(pref);
      applyTheme(pref);
      v.querySelectorAll('#set-theme .chip').forEach(x => x.classList.toggle('active', x === ch));
    });
    v.querySelectorAll('[data-legal]').forEach(b => b.onclick = () => openLegal(b.dataset.legal));
    $('#set-contact').onclick = () => window.open('https://github.com/kosukekkk-ops/fe-master-app', '_blank');
    $('#set-export').onclick = () => {
      const blob = new Blob([JSON.stringify(Store.exportAll(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `fe-learning-${today()}.json`; a.click();
      URL.revokeObjectURL(a.href);
    };
    $('#set-import').onclick = () => $('#set-import-file').click();
    $('#set-import-file').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const { logCount, weakCount } = Store.importMerge(data);
        toast(`読み込みました(解答履歴 ${logCount}件 / 苦手単語 ${weakCount}語)`);
        renderSettings();
      } catch (err) {
        toast('読み込みに失敗しました: ' + err.message);
      }
      e.target.value = '';
    };
    $('#set-reset').onclick = () => {
      if (confirm('学習ログと苦手単語帳をすべて消去します。よろしいですか?')) {
        Store.resetAll(); toast('消去しました'); renderSettings();
      }
    };
  }

  /* ================= ルーター ================= */
  const views = {
    home: renderHome,
    quiz: renderQuizStart,
    flash: renderFlashStart,
    stats: renderStats,
    settings: renderSettings
  };

  function go(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('nav.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    const el = document.getElementById('view-' + name);
    el.classList.add('active');
    (views[name] || (() => {}))();
    window.scrollTo(0, 0);
  }

  async function init() {
    try {
      await Data.load();
    } catch (e) {
      $('#app').innerHTML = `<div class="empty" style="padding-top:80px"><div class="big">⚠️</div>データの読み込みに失敗しました。<br><span class="muted" style="font-size:13px">${esc(e.message)}<br>このアプリはWebサーバ経由(またはPWA)で開いてください。</span></div>`;
      return;
    }
    document.querySelectorAll('nav.tabbar button').forEach(b => b.onclick = () => go(b.dataset.tab));
    go('home');
    // Service Worker(オフライン対応)。新しいSWが有効化されたら自動でリロードして
    // ホーム画面のアイコンを削除・再追加しなくても常に最新版が表示されるようにする。
    // Capacitorネイティブアプリではアセットが端末内にあるためSW不要(iOSのWKWebViewでは動作もしない)。
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (!isNative && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => reg.update().catch(() => {})).catch(() => {});
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    }
    // 学習データ(localStorage)をブラウザに消されにくくする(対応ブラウザのみ)
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    // 外観テーマ(headのインラインスクリプトで先行適用済み。meta theme-color等をここで同期)
    applyTheme(Store.getTheme());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
