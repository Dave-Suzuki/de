/* 画面の描画と操作 */
(function (HE) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BB = 100;
  const bbs = (chips) => HE.BBs(chips, BB);
  const pct = (x) => `${Math.round(x * 100)}%`;

  const MODE_INTRO = {
    drill: {
      title: 'プリフロップ特訓',
      text: '配られた2枚とポジションを見て、フォールド・コール・レイズを選びましょう。答えるとすぐに採点して、理由を解説します。',
    },
    coach: {
      title: 'ライブコーチ',
      text: 'あなたの番になると、プリフロップからリバーまで毎回、推奨アクションとその理由（勝率・ポットオッズ・ドロー）を表示します。',
    },
    review: {
      title: 'レビュー',
      text: 'プレイ中のヒントはありません。ハンドが終わったら、一つひとつの判断を「どうすべきだったか」と一緒に振り返ります。',
    },
  };

  /* ---------- 保存 ---------- */
  const STORE_KEY = 'holdem-dojo-v1';
  const store = {
    load() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
    },
    save(v) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch (e) { /* 保存できない環境では無視 */ }
    },
  };
  const saved = store.load();
  const state = {
    mode: ['drill', 'coach', 'review'].includes(saved.mode) ? saved.mode : 'coach',
    opps: saved.opps >= 1 && saved.opps <= 5 ? saved.opps : 5,
    speed: saved.speed || 'normal',
    stats: saved.stats || { good: 0, ok: 0, bad: 0 },
    waitingNext: null,
    turn: null,
    lastHandNo: -1,
    lastBoardLen: 0,
  };
  const persist = () => store.save({ mode: state.mode, opps: state.opps, speed: state.speed, stats: state.stats });

  /* ---------- カード ---------- */
  function cardHTML(c, extra = '') {
    if (c == null) return `<div class="card back ${extra}"></div>`;
    const r = HE.RANK_LABEL[HE.rankOf(c)];
    const s = HE.suitOf(c);
    return `<div class="card ${HE.SUIT_NAMES[s]} ${extra}" aria-label="${HE.cardText(c)}"><span class="r">${r}</span><span class="s">${HE.SUIT_SYMBOLS[s]}</span></div>`;
  }
  const cardsHTML = (cs) => cs.map((c) => cardHTML(c)).join('');

  /* ---------- テーブル描画 ---------- */
  const narrow = window.matchMedia('(max-width: 640px)');

  function seatXY(i, n, scale = 1) {
    const rx = (narrow.matches ? 40 : 45) * scale;
    const ry = (narrow.matches ? 44 : 44) * scale;
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
  }

  let lastSnap = null;
  function renderTable(snap) {
    lastSnap = snap;
    const n = snap.players.length;
    const newHand = snap.handNo !== state.lastHandNo;
    const seats = snap.players.map((p, i) => {
      const { x, y } = seatXY(i, n);
      const showFace = p.isHero || (snap.showdown && !p.folded);
      let hole = '';
      if (p.hole && !(p.folded && !p.isHero)) {
        hole = p.hole.map((c) => cardHTML(showFace ? c : null, newHand ? 'deal' : '')).join('');
      }
      const cls = ['seat', p.isHero ? 'hero' : '', p.folded ? 'folded' : '', snap.toActId === p.id ? 'acting' : '', p.won > 0 ? 'winner' : ''].join(' ');
      const pos = `<span class="pos ${p.position === 'BTN' ? 'btn' : ''}">${p.position}</span>`;
      const said = p.handName && snap.showdown && !p.folded
        ? `<span class="hand-name">${esc(p.handName)}</span>`
        : `<span class="said">${p.lastAction ? esc(p.lastAction) : '&nbsp;'}</span>`;
      const style = p.profile ? `<span class="style">${esc(p.profile.style)}</span>` : '<span class="style">あなた</span>';
      return `<div class="${cls}" style="left:${x}%;top:${y}%">
        <div class="hole">${hole}</div>
        <div class="plate">${pos}<span class="name">${esc(p.name)}</span>${style}<span class="stack">${bbs(p.stack)}</span></div>
        ${said}
      </div>`;
    });
    const chips = snap.players.map((p, i) => {
      if (!p.bet) return '';
      const { x, y } = seatXY(i, n, 0.6);
      return `<div class="bet-chip" style="left:${x}%;top:${y}%">${bbs(p.bet)}</div>`;
    });
    $('seats').innerHTML = seats.join('') + chips.join('');

    const board = [];
    for (let i = 0; i < 5; i++) {
      const c = snap.board[i];
      board.push(c == null ? '<div class="slot"></div>' : cardHTML(c, i >= state.lastBoardLen && !newHand ? 'deal' : ''));
    }
    $('board').innerHTML = board.join('');
    state.lastBoardLen = snap.board.length;
    state.lastHandNo = snap.handNo;
    $('pot').textContent = `ポット ${bbs(snap.pot)}`;
    $('street-label').textContent = snap.showdown ? 'ショーダウン' : HE.STREET_JA[snap.street] || '';
  }
  narrow.addEventListener('change', () => lastSnap && renderTable(lastSnap));

  /* ---------- ログ ---------- */
  function log(text, cls) {
    const li = document.createElement('li');
    li.textContent = text;
    if (cls) li.className = cls;
    const ol = $('log');
    ol.appendChild(li);
    while (ol.children.length > 300) ol.removeChild(ol.firstChild);
    ol.scrollTop = ol.scrollHeight;
  }

  /* ---------- 統計 ---------- */
  function renderStats() {
    const s = state.stats;
    const count = s.good + s.ok + s.bad;
    $('stat-count').textContent = count;
    $('stat-acc').textContent = count ? pct((s.good + s.ok) / count) : '–';
    if (game) {
      const net = (game.hero.stack - game.startStack * game.heroBuyIns) / BB;
      $('stat-net').textContent = `${net > 0 ? '+' : net < 0 ? '−' : '±'}${Math.abs(net).toFixed(Number.isInteger(net) ? 0 : 1)}BB`;
    }
  }
  function addStat(grade) {
    state.stats[grade]++;
    persist();
    renderStats();
  }

  /* ---------- コーチ欄 ---------- */
  const coach = () => $('coach');

  function introHTML(extra = '') {
    const m = MODE_INTRO[state.mode];
    return `<div class="eyebrow">${m.title}</div><p class="lead">${m.text}</p>${extra}`;
  }

  function meterHTML(rec, ctx) {
    const m = rec.metrics;
    if (ctx.street === 'preflop') {
      const strength = 1 - m.top;
      return `<div class="meter">
        <div class="meter-bar"><div class="meter-fill" style="width:${Math.max(2, strength * 100)}%"></div></div>
        <div class="meter-legend"><span>ハンドの強さ <b>${m.cls}</b></span><span>上位 <b>${pct(m.top)}</b></span></div>
      </div>`;
    }
    const mark = ctx.toCall > 0 ? `<div class="meter-mark" style="left:${m.potOdds * 100}%" title="必要勝率"></div>` : '';
    return `<div class="meter">
      <div class="meter-bar"><div class="meter-fill" style="width:${Math.max(2, m.equity * 100)}%"></div>${mark}</div>
      <div class="meter-legend"><span>推定勝率 <b>${pct(m.equity)}</b></span>${ctx.toCall > 0 ? `<span>必要勝率 <b>${pct(m.potOdds)}</b></span>` : `<span>ベットの目安 <b>${pct(m.valueTh)}</b></span>`}</div>
    </div>`;
  }

  const ACTION_NAME = { fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'ベット／レイズ' };
  const alsoHTML = (rec) => (rec.acceptable.length ? `<div class="also">これも可：${rec.acceptable.map((a) => ACTION_NAME[a]).join('、')}</div>` : '');

  function recHTML(rec, ctx) {
    return `<div class="verdict ${rec.action}">${esc(rec.label)}</div>
      ${alsoHTML(rec)}
      ${meterHTML(rec, ctx)}
      <ul class="reasons">${rec.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
  }

  function renderCoachTurn(rec, ctx) {
    const street = HE.STREET_JA[ctx.street];
    if (state.mode === 'coach') {
      coach().innerHTML = `<div class="eyebrow">${street}・コーチのおすすめ</div>${recHTML(rec, ctx)}`;
      highlight(rec.action);
    } else if (state.mode === 'drill') {
      coach().innerHTML = `<div class="eyebrow">${street}・${ctx.position}</div>
        <div class="verdict">どうする？</div>
        <p class="lead">${ctx.toCall > 0 ? `コールには ${bbs(ctx.toCall)} 必要です。` : 'まだ誰もレイズしていません。'}自分のポジションと前の人の行動を確認して選びましょう。</p>
        <div class="btn-row"><button class="btn ghost" id="show-hint">ヒントを見る</button></div>`;
      $('show-hint').onclick = () => {
        coach().innerHTML = `<div class="eyebrow">${street}・ヒント</div>${recHTML(rec, ctx)}`;
        highlight(rec.action);
      };
    } else {
      coach().innerHTML = `<div class="eyebrow">${street}・あなたの番</div>
        <div class="verdict">自分で判断しよう</div>
        <p class="lead">ヒントはハンド終了後のレビューで確認できます。</p>`;
    }
  }

  function highlight(action) {
    $('btn-fold').classList.toggle('hint', action === 'fold');
    $('btn-call').classList.toggle('hint', action === 'call' || action === 'check');
    $('btn-raise').classList.toggle('hint', action === 'raise');
  }

  function gradeHTML(g) {
    const t = { good: 'ナイス判断', ok: '許容範囲', bad: '改善しよう' }[g];
    return `<span class="grade ${g}">${t}</span>`;
  }

  function waitNext() {
    return new Promise((resolve) => {
      state.waitingNext = resolve;
      const b = $('next-hand');
      if (b) { b.onclick = () => { state.waitingNext = null; resolve(); }; b.focus({ preventScroll: true }); }
    });
  }

  function renderDrillAnswer(rec, ctxLike) {
    const g = rec.grade;
    coach().innerHTML = `<div class="eyebrow">プリフロップ特訓・採点</div>
      ${gradeHTML(g)}
      <div class="verdict ${rec.rec.action}">${g === 'good' ? '正解！' : ''}${esc(rec.rec.label)}</div>
      <div class="also">あなた：${esc(rec.label)}${rec.rec.acceptable.length ? `／これも可：${rec.rec.acceptable.map((a) => ACTION_NAME[a]).join('、')}` : ''}</div>
      ${meterHTML(rec.rec, ctxLike)}
      <ul class="reasons">${rec.rec.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="btn-row"><button class="btn" id="next-hand">次のハンド（N）</button></div>`;
  }

  /* ---------- レビュー ---------- */
  function renderReview(res) {
    const byId = new Map(res.players.map((p) => [p.id, p]));
    const net = res.heroNet / BB;
    const counts = { good: 0, ok: 0, bad: 0 };
    res.decisions.forEach((d) => counts[d.grade]++);

    const steps = res.decisions.map((d) => {
      const opps = d.oppIds.map((id) => ({ known: byId.get(id).hole }));
      const hindsight = opps.length ? HE.equity(d.hole, d.board, opps, 1200) : 1;
      const m = d.rec.metrics;
      const est = d.street === 'preflop'
        ? `<dt>ハンド</dt><dd>${esc(m.cls)}（上位 ${pct(m.top)}）</dd>`
        : `<dt>推定勝率</dt><dd class="num">${pct(m.equity)}${d.toCall > 0 ? `（必要 ${pct(m.potOdds)}）` : ''}</dd>`;
      const should = d.grade === 'bad'
        ? `<div><b>こうすべきだった：</b>${esc(d.rec.label)}</div>`
        : '';
      return `<li class="step ${d.grade}">
        <div class="step-head"><span class="step-street">${HE.STREET_JA[d.street]}・${d.position}</span>${gradeHTML(d.grade)}</div>
        <div class="step-cards">${cardsHTML(d.hole)}<span class="gap"></span>${cardsHTML(d.board)}</div>
        <dl>
          <dt>あなた</dt><dd>${esc(d.label)}</dd>
          <dt>推奨</dt><dd>${esc(d.rec.label)}${d.rec.acceptable.length ? `（${d.rec.acceptable.map((a) => ACTION_NAME[a]).join('・')}も可）` : ''}</dd>
          ${est}
          <dt>実際の勝率</dt><dd class="num">${pct(hindsight)} <span class="muted">相手の手札が見えていた場合</span></dd>
        </dl>
        ${should}
        <details><summary>理由を見る</summary><ul>${d.rec.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
      </li>`;
    });

    const bad = res.decisions.filter((d) => d.grade === 'bad');
    let overall;
    if (!res.decisions.length) overall = 'あなたの判断が必要な場面はありませんでした。';
    else if (!bad.length) overall = counts.ok ? '大きなミスはありません。「許容範囲」の場面は推奨アクションも確認しておきましょう。' : 'すべて推奨どおりの判断でした。この調子！';
    else overall = `改善ポイントが ${bad.length} つあります。「こうすべきだった」を確認しましょう。`;
    if (res.decisions.length && net < 0 && !bad.length) overall += '結果は負けでも、判断が正しければ長期的には勝てます。';
    if (res.decisions.length && net > 0 && bad.length) overall += '今回は勝てましたが、結果ではなく判断の質を見直しましょう。';

    const everyone = res.players.map((p) => `<div class="row"><span class="who">${esc(p.name)}</span>${cardsHTML(p.hole)}<span class="muted">${p.folded ? 'フォールド' : p.handName ? esc(p.handName) : ''}</span></div>`).join('');

    coach().innerHTML = `<div class="eyebrow">ハンド #${res.handNo} の振り返り</div>
      <div class="result-line">
        <span>${res.showdown ? 'ショーダウンで決着' : '全員フォールドで決着'}</span>
        <span class="result-amt ${net > 0 ? 'plus' : net < 0 ? 'minus' : ''}">${net > 0 ? '+' : net < 0 ? '−' : '±'}${Math.abs(net)}BB</span>
      </div>
      <p class="lead">${overall}</p>
      ${res.decisions.length ? `<div class="also">ナイス ${counts.good}・許容 ${counts.ok}・改善 ${counts.bad}</div>` : ''}
      <ol class="timeline">${steps.join('')}</ol>
      <details><summary>全員の手札を見る</summary><div class="showdown-list">${everyone}</div></details>
      <div class="btn-row"><button class="btn" id="next-hand">次のハンド（N）</button></div>`;
  }

  /* ---------- 操作 ---------- */
  function setButtonsEnabled(on) {
    ['btn-fold', 'btn-call', 'btn-raise'].forEach((id) => { $(id).disabled = !on; });
    $('raise-slider').disabled = !on;
    $('sizing').classList.toggle('off', !on);
    if (!on) highlight(null);
  }

  function raiseText(ctx, to) {
    if (to >= ctx.myBet + ctx.stack) return `オールイン ${bbs(to)}`;
    return `${ctx.currentBet > 0 ? 'レイズ' : 'ベット'} ${bbs(to)}`;
  }

  function defaultRaise(ctx) {
    const potAfter = ctx.pot + ctx.toCall;
    if (ctx.street === 'preflop') return ctx.raises === 0 ? (2.5 + ctx.limpers) * ctx.bb : ctx.currentBet * 3;
    return ctx.currentBet === 0 ? ctx.currentBet + potAfter * 0.66 : ctx.currentBet * 3;
  }

  function askHero({ ctx, rec }) {
    return new Promise((resolve) => {
      const max = ctx.myBet + ctx.stack;
      const min = Math.min(ctx.minRaiseTo, max);
      const canRaise = ctx.stack > ctx.toCall;
      const step = ctx.bb / 2;
      const slider = $('raise-slider');
      slider.min = min; slider.max = max; slider.step = step;
      const snapTo = (v) => Math.min(max, Math.max(min, Math.round(v / step) * step));
      const setRaise = (v) => {
        slider.value = snapTo(v);
        const to = Number(slider.value);
        $('raise-out').textContent = bbs(to);
        $('raise-label').textContent = raiseText(ctx, to);
      };
      setRaise(defaultRaise(ctx));

      const potAfter = ctx.pot + ctx.toCall;
      const presets = [];
      if (ctx.street === 'preflop') {
        if (ctx.raises === 0) [2.5, 3, 4].forEach((x) => presets.push([`${x}BB`, (x + ctx.limpers) * ctx.bb]));
        else [2.5, 3, 4].forEach((x) => presets.push([`${x}倍`, ctx.currentBet * x]));
      } else if (ctx.currentBet === 0) {
        [['1/3', 1 / 3], ['1/2', 0.5], ['2/3', 2 / 3], ['ポット', 1]].forEach(([l, f]) => presets.push([l, potAfter * f]));
      } else {
        [2.5, 3].forEach((x) => presets.push([`${x}倍`, ctx.currentBet * x]));
        presets.push(['ポット', ctx.currentBet + potAfter]);
      }
      presets.push(['オールイン', max]);
      $('presets').innerHTML = presets.map(([l], i) => `<button class="preset" data-i="${i}">${l}</button>`).join('');
      $('presets').querySelectorAll('.preset').forEach((b) => { b.onclick = () => setRaise(presets[Number(b.dataset.i)][1]); });
      slider.oninput = () => setRaise(Number(slider.value));

      $('call-label').textContent = ctx.toCall === 0 ? 'チェック' : ctx.toCall >= ctx.stack ? `オールイン ${bbs(ctx.toCall)}` : `コール ${bbs(ctx.toCall)}`;
      setButtonsEnabled(true);
      $('btn-raise').disabled = !canRaise;
      if (!canRaise) $('raise-label').textContent = 'レイズ';

      renderCoachTurn(rec, ctx);

      const finish = (choice) => {
        state.turn = null;
        setButtonsEnabled(false);
        const g = HE.grade(rec, choice.action);
        addStat(g);
        resolve(choice);
      };
      state.turn = {
        fold: () => finish({ action: 'fold', label: 'フォールド' }),
        call: () => finish(ctx.toCall === 0
          ? { action: 'check', label: 'チェック' }
          : { action: 'call', label: $('call-label').textContent }),
        raise: () => {
          if (!canRaise) return;
          const to = Number(slider.value);
          finish({ action: 'raise', amount: to, label: raiseText(ctx, to) });
        },
      };
    });
  }

  $('btn-fold').onclick = () => state.turn && state.turn.fold();
  $('btn-call').onclick = () => state.turn && state.turn.call();
  $('btn-raise').onclick = () => state.turn && state.turn.raise();

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') && e.target.type !== 'range') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (state.turn) {
      if (k === 'f') state.turn.fold();
      else if (k === 'c') state.turn.call();
      else if (k === 'r') state.turn.raise();
    } else if (k === 'n' && state.waitingNext) {
      const r = state.waitingNext; state.waitingNext = null; r();
    }
  });

  /* ---------- モードと設定 ---------- */
  function renderModes() {
    document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === state.mode)));
  }
  document.querySelectorAll('.mode').forEach((b) => {
    b.onclick = () => {
      if (state.mode === b.dataset.mode) return;
      state.mode = b.dataset.mode;
      persist();
      renderModes();
      if (state.waitingNext) {
        const r = state.waitingNext; state.waitingNext = null; r();
      } else if (!state.turn) {
        coach().innerHTML = introHTML('<p class="muted">このハンドが終わると切り替わります。</p>');
      } else {
        coach().insertAdjacentHTML('beforeend', `<p class="muted">次のハンドから「${MODE_INTRO[state.mode].title}」に切り替わります。</p>`);
      }
    };
  });

  $('opt-opps').value = String(state.opps);
  $('opt-speed').value = state.speed;
  $('opt-opps').onchange = (e) => {
    state.opps = Number(e.target.value);
    persist();
    if (state.waitingNext) { const r = state.waitingNext; state.waitingNext = null; r(); }
  };
  $('opt-speed').onchange = (e) => { state.speed = e.target.value; persist(); };

  const SPEED = { slow: 1.7, normal: 1, fast: 0.3 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- ゲーム ---------- */
  let game = null;
  let drillAnswered = false;
  const ui = {
    onUpdate: renderTable,
    onLog: log,
    delay: (ms) => sleep(ms * SPEED[state.speed]),
    botDelay: () => 650 * SPEED[state.speed],
    askHero,
    onDrillAnswer(record) {
      drillAnswered = true;
      renderDrillAnswer(record, { street: 'preflop' });
    },
  };

  async function loop() {
    game = new HE.Game(ui, { numOpponents: state.opps, bb: BB });
    renderStats();
    for (;;) {
      if (game.players.length - 1 !== state.opps) game.setOpponents(state.opps);
      const mode = state.mode;
      coach().innerHTML = introHTML('<p class="muted">相手の行動を待っています…</p>');
      drillAnswered = false;
      const res = await game.playHand(mode);
      renderStats();
      if (mode === 'drill') {
        if (drillAnswered) await waitNext();
        else {
          coach().innerHTML = introHTML('<p class="muted">全員がフォールドしたので、次のハンドを配ります。</p>');
          await sleep(1200);
        }
      } else {
        renderReview(res);
        await waitNext();
      }
    }
  }

  renderModes();
  renderStats();
  setButtonsEnabled(false);
  loop();
})(window.HE);
