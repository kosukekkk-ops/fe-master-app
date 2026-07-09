/* app.js — 画面制御と各機能の実装 */
(() => {
  'use strict';
  const $ = (sel, el = document) => el.querySelector(sel);
  const CATS = ['テクノロジ', 'マネジメント', 'ストラテジ'];
  const CAT_CLASS = { 'テクノロジ': 'tech', 'マネジメント': 'mgmt', 'ストラテジ': 'strat' };
  const CAT_COLOR = { 'テクノロジ': 'var(--tech)', 'マネジメント': 'var(--mgmt)', 'ストラテジ': 'var(--strat)' };
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

  /* ---------- 統計の導出(解答ログが唯一の真実) ---------- */
  function stats() {
    const log = Store.getLog();
    const byCat = {}; CATS.forEach(c => byCat[c] = { ok: 0, n: 0 });
    const byDay = {};
    let ok = 0;
    log.forEach(e => {
      const q = Data.questionById(e.q); const cat = q ? q.category : null;
      if (cat && byCat[cat]) { byCat[cat].n++; if (e.correct) byCat[cat].ok++; }
      const day = (e.ts || '').slice(0, 10);
      if (day) { (byDay[day] = byDay[day] || { ok: 0, n: 0 }).n++; if (e.correct) byDay[day].ok++; }
      if (e.correct) ok++;
    });
    return { total: log.length, ok, byCat, byDay };
  }

  /* ================= ホーム ================= */
  function renderHome() {
    const s = stats();
    const rate = s.total ? Math.round((s.ok / s.total) * 100) : 0;
    const weak = Store.getWeak();
    const weakCount = Object.keys(weak).length;
    const td = s.byDay[today()] || { ok: 0, n: 0 };
    const v = $('#view-home');
    v.innerHTML = `
      <div class="card">
        <h2>今日の学習</h2>
        <div class="stat-grid">
          <div class="stat"><div class="num">${td.n}</div><div class="lbl">今日解いた問題</div></div>
          <div class="stat"><div class="num" style="color:${td.n && td.ok/td.n>=0.6?'var(--ok)':'var(--warn)'}">${td.n ? Math.round(td.ok/td.n*100) : 0}%</div><div class="lbl">今日の正答率</div></div>
        </div>
      </div>
      <div class="card">
        <h2>累計</h2>
        <div class="stat-grid">
          <div class="stat"><div class="num">${s.total}</div><div class="lbl">総解答数</div></div>
          <div class="stat"><div class="num" style="color:${rate>=60?'var(--ok)':'var(--warn)'}">${rate}%</div><div class="lbl">累計正答率</div></div>
          <div class="stat"><div class="num" style="color:var(--ng)">${weakCount}</div><div class="lbl">苦手単語</div></div>
          <div class="stat"><div class="num">${Data.words.length}</div><div class="lbl">収録用語</div></div>
        </div>
      </div>
      <button class="btn big-cta" data-go="quiz">▶ 問題演習をはじめる</button>
      <div style="height:10px"></div>
      <button class="btn secondary" data-go="flash">📇 単語帳で復習する${weakCount ? `(苦手 ${weakCount} 語あり)` : ''}</button>
    `;
    v.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  }

  /* ================= 問題演習 ================= */
  const quiz = { pool: [], idx: 0, cat: '全分野', subject: 'A', current: null, answered: false, sessionOk: 0, sessionN: 0 };

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
    quiz.pool = shuffle(subject === 'B' ? Data.questionsBySubjectB(key) : Data.questionsByCategory(key));
    quiz.idx = 0; quiz.sessionOk = 0; quiz.sessionN = 0;
    if (!quiz.pool.length) { toast('この条件の問題がありません'); return; }
    showQuestion();
  }

  const MARKS = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ'];

  function showQuestion() {
    quiz.answered = false;
    quiz.current = buildQuestion(quiz.pool[quiz.idx]);
    const { q, choices } = quiz.current;
    const pct = Math.round((quiz.idx / quiz.pool.length) * 100);
    const pill = q.subject === 'B'
      ? `<span class="pill strat">科目B・${esc(q.genre || 'アルゴリズム')}</span>`
      : `<span class="pill ${CAT_CLASS[q.category]}">${q.category}</span>`;
    $('#view-quiz').innerHTML = `
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
      <div class="q-progress"><span>${quiz.idx + 1} / ${quiz.pool.length} 問</span>${pill}</div>
      <div class="q-text">${esc(q.text)}</div>
      ${q.bodyHtml ? `<div class="qbody">${q.bodyHtml}</div>` : ''}
      ${q.program ? `<pre class="pseudocode">${esc(q.program)}</pre>` : ''}
      <div class="choices">
        ${choices.map((c, i) => `<button class="choice" data-i="${i}"><span class="mark">${MARKS[i]}</span><span class="ctext">${esc(c)}</span></button>`).join('')}
      </div>
      <div class="giveup-row"><button class="btn ghost small" id="q-giveup">🤔 わからない(解説を見る)</button></div>
      <div id="quiz-foot"></div>
    `;
    $('#view-quiz').querySelectorAll('.choice').forEach(b => b.onclick = () => answer(parseInt(b.dataset.i, 10)));
    $('#q-giveup').onclick = giveUp;
  }

  function answer(pos) {
    if (quiz.answered) return;
    quiz.answered = true;
    const { q, correctPos } = quiz.current;
    const correct = pos === correctPos;
    quiz.sessionN++; if (correct) quiz.sessionOk++;

    Store.addLog({ q: q.questionId, chosen: pos, correct, ts: new Date().toISOString() });

    let addedNote = '';
    if (!correct) addedNote = registerWeakWords(q);

    document.querySelectorAll('.choice').forEach((b, i) => {
      b.classList.add('disabled');
      if (i === correctPos) b.classList.add('correct');
      if (i === pos && !correct) b.classList.add('wrong');
    });

    renderQuizFeedback({
      verdictText: correct ? '⭕ 正解' : '❌ 不正解', cls: correct ? 'ok' : 'ng', addedNote,
      offerManualRegister: correct && (q.relatedWordIds || []).length > 0
    });
  }

  // 「わからない」で解説だけ確認する場合も、誤答と同じく苦手単語帳へ登録する
  function giveUp() {
    if (quiz.answered) return;
    quiz.answered = true;
    const { q, correctPos } = quiz.current;
    quiz.sessionN++;

    Store.addLog({ q: q.questionId, chosen: null, correct: false, gaveUp: true, ts: new Date().toISOString() });
    const addedNote = registerWeakWords(q);

    document.querySelectorAll('.choice').forEach((b, i) => {
      b.classList.add('disabled');
      if (i === correctPos) b.classList.add('correct');
    });

    renderQuizFeedback({ verdictText: '🤔 解説を確認しました', cls: 'skip', addedNote });
  }

  function renderQuizFeedback({ verdictText, cls, addedNote, offerManualRegister }) {
    const { q } = quiz.current;
    const gu = $('#q-giveup'); if (gu) gu.style.display = 'none';
    const last = quiz.idx >= quiz.pool.length - 1;
    $('#quiz-foot').innerHTML = `
      <div class="feedback ${cls}">
        <div class="verdict">${verdictText}</div>
        <div class="exp">${esc(q.explanation || '')}</div>
        ${q.source ? `<div class="muted" style="font-size:12px;margin-top:8px">出典: ${esc(q.source)}</div>` : ''}
        ${addedNote ? `<div class="added" id="added-note">📝 ${addedNote}</div>` : ''}
        ${offerManualRegister ? `<button class="btn ghost small" id="manual-register" style="margin-top:10px">📝 念のため苦手単語帳に登録</button>` : ''}
      </div>
      <div style="height:14px"></div>
      <button class="btn" id="q-next">${last ? '結果を見る' : '次の問題へ ▶'}</button>
    `;
    $('#q-next').onclick = () => { if (last) finishQuiz(); else { quiz.idx++; showQuestion(); window.scrollTo(0, 0); } };
    const noteEl = $('#added-note');
    if (noteEl) noteEl.onclick = () => go('flash');
    const regBtn = $('#manual-register');
    if (regBtn) regBtn.onclick = () => {
      const note = registerWeakWords(q);
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
    const rate = quiz.sessionN ? Math.round((quiz.sessionOk / quiz.sessionN) * 100) : 0;
    $('#view-quiz').innerHTML = `
      <div class="card center">
        <h2>お疲れさまでした</h2>
        <div class="stat" style="margin:10px 0"><div class="num" style="color:${rate>=60?'var(--ok)':'var(--warn)'}">${rate}%</div><div class="lbl">${quiz.sessionOk} / ${quiz.sessionN} 問 正解</div></div>
        <p class="muted" style="font-size:13px">間違えた問題の重要単語は「苦手単語帳」に登録されました。単語帳タブで復習しましょう。</p>
      </div>
      <button class="btn" id="again">もう一度(${quiz.cat})</button>
      <div style="height:10px"></div>
      <button class="btn secondary" data-go="flash">苦手単語帳へ</button>
    `;
    $('#again').onclick = () => startQuiz(quiz.subject, quiz.cat);
    $('#view-quiz [data-go]').onclick = () => go('flash');
  }

  // 演習開始画面。科目A(分野別4択)/科目B(アルゴリズム・セキュリティ)を切り替える
  const qstate = { subject: 'A', aKey: '全分野', bKey: '全部' };
  function renderQuizStart() {
    const v = $('#view-quiz');
    const cats = ['全分野', ...CATS];
    const bGenres = ['全部', 'アルゴリズム', 'セキュリティ'];
    const bCount = Data.subjectBCount;
    const aRow = `
      <div class="chips" id="quiz-cats">
        ${cats.map(c => `<div class="chip ${qstate.aKey === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}${c === '全分野' ? '' : `<span style="opacity:.7">(${Data.questionsByCategory(c).length})</span>`}</div>`).join('')}
      </div>`;
    const bRow = `
      <div class="chips" id="quiz-bgenres">
        ${bGenres.map(g => `<div class="chip ${qstate.bKey === g ? 'active' : ''}" data-genre="${esc(g)}">${esc(g)}<span style="opacity:.7">(${Data.questionsBySubjectB(g).length})</span></div>`).join('')}
      </div>`;
    v.innerHTML = `
      <div class="card">
        <h2>問題演習</h2>
        <div class="chips" id="quiz-subject">
          <div class="chip ${qstate.subject === 'A' ? 'active' : ''}" data-subject="A">科目A(午前)</div>
          <div class="chip ${qstate.subject === 'B' ? 'active' : ''}" data-subject="B">科目B(アルゴリズム/セキュリティ)${bCount ? ` (${bCount})` : ''}</div>
        </div>
        <p class="muted" style="font-size:13px">${qstate.subject === 'A' ? '4択形式。間違えると重要単語が自動で苦手単語帳に貯まります。' : '擬似言語プログラムを読み解く形式(選択肢はア〜コ)。'}</p>
        ${qstate.subject === 'A' ? aRow : bRow}
        <button class="btn" id="quiz-start">▶ 開始</button>
      </div>
    `;
    v.querySelectorAll('#quiz-subject .chip').forEach(ch => ch.onclick = () => { qstate.subject = ch.dataset.subject; renderQuizStart(); });
    v.querySelectorAll('#quiz-cats .chip').forEach(ch => ch.onclick = () => {
      v.querySelectorAll('#quiz-cats .chip').forEach(x => x.classList.remove('active'));
      ch.classList.add('active'); qstate.aKey = ch.dataset.cat;
    });
    v.querySelectorAll('#quiz-bgenres .chip').forEach(ch => ch.onclick = () => {
      v.querySelectorAll('#quiz-bgenres .chip').forEach(x => x.classList.remove('active'));
      ch.classList.add('active'); qstate.bKey = ch.dataset.genre;
    });
    $('#quiz-start').onclick = () => qstate.subject === 'B' ? startQuiz('B', qstate.bKey) : startQuiz('A', qstate.aKey);
  }

  /* ================= 単語帳(フラッシュカード) ================= */
  const flash = { deck: [], idx: 0, mode: 'weak', cat: '全分野', flipped: false };

  function buildDeck() {
    if (flash.mode === 'weak') {
      const weak = Store.getWeak();
      flash.deck = Object.keys(weak)
        .map(id => ({ ...Data.wordById(id), _weak: weak[id] }))
        .filter(w => w.wordId)
        .sort((a, b) => (b._weak.wrongCount) - (a._weak.wrongCount));
    } else {
      const base = flash.cat === '全分野' ? Data.words : Data.wordsByCategory(flash.cat);
      flash.deck = shuffle(base);
    }
    flash.idx = 0; flash.flipped = false;
  }

  function renderFlashStart() {
    const weakCount = Object.keys(Store.getWeak()).length;
    const v = $('#view-flash');
    v.innerHTML = `
      <div class="card">
        <h2>単語帳</h2>
        <div class="chips" id="flash-mode">
          <div class="chip ${flash.mode==='weak'?'active':''}" data-mode="weak">苦手単語 (${weakCount})</div>
          <div class="chip ${flash.mode==='all'?'active':''}" data-mode="all">全単語 (${Data.words.length})</div>
        </div>
        <div id="flash-catwrap" class="${flash.mode==='all'?'':'hidden'}" style="${flash.mode==='all'?'':'display:none'}">
          <div class="chips" id="flash-cats">
            ${['全分野', ...CATS].map(c => `<div class="chip ${flash.cat===c?'active':''}" data-cat="${esc(c)}">${esc(c)}</div>`).join('')}
          </div>
        </div>
        <button class="btn" id="flash-start">📇 開始</button>
      </div>
      <div id="flash-area"></div>
    `;
    v.querySelectorAll('#flash-mode .chip').forEach(ch => ch.onclick = () => {
      flash.mode = ch.dataset.mode; renderFlashStart();
    });
    v.querySelectorAll('#flash-cats .chip').forEach(ch => ch.onclick = () => {
      v.querySelectorAll('#flash-cats .chip').forEach(x => x.classList.remove('active'));
      ch.classList.add('active'); flash.cat = ch.dataset.cat;
    });
    $('#flash-start').onclick = () => {
      buildDeck();
      if (!flash.deck.length) { toast(flash.mode === 'weak' ? 'まだ苦手単語はありません' : '単語がありません'); return; }
      showCard();
    };
  }

  function showCard() {
    const area = $('#flash-area');
    if (flash.idx >= flash.deck.length) {
      area.innerHTML = `<div class="card center"><h2>1周しました 🎉</h2><p class="muted">${flash.deck.length}語を確認しました。</p></div>
        <button class="btn" id="fl-again">もう一度</button>`;
      $('#fl-again').onclick = () => { buildDeck(); showCard(); };
      return;
    }
    const w = flash.deck[flash.idx];
    flash.flipped = false;
    const pct = Math.round((flash.idx / flash.deck.length) * 100);
    const wc = w._weak ? `<div class="wrongcount">間違えた回数: ${w._weak.wrongCount} 回</div>` : '';
    area.innerHTML = `
      <div class="q-progress"><span>${flash.idx + 1} / ${flash.deck.length}</span><span class="pill ${CAT_CLASS[w.category]}">${w.category}</span></div>
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
      <div class="flash-wrap"><div class="flash" id="card">
        <div class="flash-face front">
          <div class="word">${esc(w.word)}</div>
          <div class="reading">${esc(w.reading || '')}</div>
          <div class="hint">タップで意味を表示</div>
        </div>
        <div class="flash-face back">
          <div class="meaning">${esc(w.meaning)}</div>
          <div class="analogy-lbl">💡 例え話</div>
          <div class="analogy">${esc(w.analogy || '')}</div>
          ${wc}
          <div class="word-cat"><span class="pill ${CAT_CLASS[w.category]}">${w.category}</span></div>
          <div id="ai-slot" style="width:100%"></div>
        </div>
      </div></div>
      <div class="row">
        <button class="btn secondary small" id="fl-prev" style="flex:1" ${flash.idx===0?'disabled':''}>◀ 前へ</button>
        <button class="btn small" id="fl-next" style="flex:2">次へ ▶</button>
      </div>
    `;
    const card = $('#card');
    card.onclick = (e) => { if (e.target.closest('#ai-slot')) return; card.classList.toggle('flipped'); flash.flipped = !flash.flipped; if (flash.flipped) renderAISlot(w); };
    $('#fl-prev').onclick = () => { if (flash.idx > 0) { flash.idx--; showCard(); } };
    $('#fl-next').onclick = () => { flash.idx++; showCard(); window.scrollTo(0, 0); };
  }

  /* ---------- AI解説(単語帳の裏面) ---------- */
  function renderAISlot(w) {
    const slot = $('#ai-slot'); if (!slot) return;
    const weak = Store.getWeak();
    const cached = weak[w.wordId] && weak[w.wordId].ai ? weak[w.wordId].ai : {};
    const hasKey = AI.hasKey();
    const shown = cached.base || cached.simpler || cached.alt || '';
    slot.innerHTML = `
      <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
        <div class="analogy-lbl">🤖 AI解説${hasKey ? '' : '(要APIキー)'}</div>
        <div id="ai-text" class="ai-out" style="${shown ? '' : 'display:none'}">${esc(shown)}</div>
        <div class="row wrap" style="margin-top:10px">
          <button class="btn ghost small" data-ai="base">解説を生成</button>
          <button class="btn ghost small" data-ai="simpler">もっと簡単に</button>
          <button class="btn ghost small" data-ai="alt">別の例えで</button>
        </div>
      </div>`;
    slot.querySelectorAll('[data-ai]').forEach(b => b.onclick = (e) => { e.stopPropagation(); genAI(w, b.dataset.ai); });
  }

  async function genAI(w, style) {
    const textEl = $('#ai-text'); if (!textEl) return;
    const weak = Store.getWeak();
    const entry = weak[w.wordId] && weak[w.wordId].ai ? weak[w.wordId].ai : null;
    // キャッシュ命中(同じ単語×同じスタイル)なら再呼び出ししない
    if (entry && entry[style]) { textEl.style.display = 'block'; textEl.textContent = entry[style]; toast('保存済みの解説を表示'); return; }
    if (!AI.hasKey()) { toast('設定タブでAPIキーを登録してください'); go('settings'); return; }
    textEl.style.display = 'block';
    textEl.innerHTML = '<span class="spin"></span> 生成中…';
    try {
      const out = await AI.explain(w, style);
      textEl.textContent = out;
      // 苦手単語(または新規)エントリにキャッシュ保存
      const all = Store.getWeak();
      const e = all[w.wordId] || { wrongCount: 0, sourceQuestionIds: [], ai: {} };
      e.ai = e.ai || {}; e.ai[style] = out;
      all[w.wordId] = e; Store.setWeak(all);
    } catch (err) {
      textEl.textContent = err.message === 'NO_KEY' ? 'APIキーが未設定です(設定タブ)。' : ('生成に失敗しました: ' + err.message);
    }
  }

  /* ================= 学習ログ ================= */
  function renderStats() {
    const s = stats();
    const v = $('#view-stats');
    if (!s.total) { v.innerHTML = `<div class="empty"><div class="big">📊</div>まだ解答データがありません。<br>問題演習を始めると、ここに分析が表示されます。</div>`; return; }

    const axes = CATS.map(c => ({ label: c.slice(0, 4), value: s.byCat[c].n ? s.byCat[c].ok / s.byCat[c].n : 0 }));
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

    v.innerHTML = `
      <div class="card">
        <h2>分野別 正答率(レーダー)</h2>
        <div class="chart-box">${Charts.radar(axes)}</div>
      </div>
      <div class="card">
        <h2>分野別 正答率(棒グラフ)</h2>
        <div class="chart-box">${Charts.bars(barItems)}</div>
      </div>
      <div class="card">
        <h2>正答率の推移(日別)</h2>
        <div class="chart-box">${Charts.line(linePts)}</div>
      </div>
      <div class="card">
        <h2>間違えた回数 トップ10</h2>
        ${ranking.length ? ranking.map((r, i) => `
          <div class="rank-item"><span class="no">${i + 1}</span>
            <span class="w">${esc(r.w.word)} <span class="pill ${CAT_CLASS[r.w.category]}" style="font-size:10px">${r.w.category}</span></span>
            <span class="cnt">${r.c}回</span></div>`).join('')
        : '<p class="muted">まだ苦手単語はありません。</p>'}
      </div>
    `;
  }

  /* ================= 設定 ================= */
  function renderSettings() {
    const s = Store.getSettings();
    const v = $('#view-settings');
    v.innerHTML = `
      <div class="card">
        <h2>AI解説の設定</h2>
        <p class="muted" style="font-size:13px">苦手単語のAI解説生成に Claude API を使います。キーは<strong>この端末のブラウザにのみ</strong>保存され、外部には送信されません(呼び出し先はAnthropic APIのみ)。未設定でも他の機能はすべて使えます。</p>
        <label class="field">Anthropic API キー</label>
        <input class="inp" id="set-key" type="password" placeholder="sk-ant-..." value="${esc(s.apiKey)}">
        <label class="field">モデル</label>
        <select class="inp" id="set-model">
          <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5(低コスト・推奨)</option>
          <option value="claude-sonnet-5">Claude Sonnet 5(高品質)</option>
          <option value="claude-opus-4-8">Claude Opus 4.8(最高品質)</option>
        </select>
        <div style="height:12px"></div>
        <button class="btn" id="set-save">保存</button>
      </div>
      <div class="card">
        <h2>データ管理</h2>
        <p class="muted" style="font-size:13px">学習ログ・苦手単語帳はブラウザ(localStorage)に保存され、次回も引き継がれます。別のURL/ブラウザで学習していた履歴は、書き出したJSONをこの端末で読み込むと合算されます。</p>
        <button class="btn secondary" id="set-export">学習データを書き出す(JSON)</button>
        <div style="height:10px"></div>
        <input type="file" id="set-import-file" accept="application/json" style="display:none">
        <button class="btn secondary" id="set-import">学習データを読み込む(JSON)</button>
        <div style="height:10px"></div>
        <button class="btn ghost" id="set-reset" style="color:var(--ng);border-color:var(--ng)">学習データを全消去</button>
      </div>
      <div class="card">
        <h2>このアプリについて</h2>
        <p class="muted" style="font-size:13px">基本情報技術者試験(FE)対策アプリ v1 / 資格: ${Store.QUAL}<br>
        収録: 用語 ${Data.words.length} 語・問題 ${Data.questions.length} 問<br>
        オフライン対応(単語帳・演習・分析は通信不要)。ホーム画面に追加してPWAとして利用できます。</p>
      </div>
    `;
    $('#set-model').value = s.model || 'claude-haiku-4-5-20251001';
    $('#set-save').onclick = () => {
      Store.setSettings({ apiKey: $('#set-key').value.trim(), model: $('#set-model').value });
      toast('設定を保存しました');
    };
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
    if ('serviceWorker' in navigator) {
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
