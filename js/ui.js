/* 画面の描画と操作 */
(function (HE) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BB = 100;
  const bbs = (chips) => HE.BBs(chips, BB);
  const pct = (x) => `${Math.round(x * 100)}%`;
  // 全1326通り中の順位（上位50%より下は「下位」で表す）
  const topText = (top) => (top <= 0.5 ? `上位 <b>${pct(top)}</b>` : `下位 <b>${pct(1 - top + 1 / 1326)}</b>`);
  const A = HE.audio;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 用語リンク付きの文章
  const T = (text, seen) => HE.glossary.link(esc(text), seen);

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

  // 段位：ナイス判断 10点、許容範囲 5点
  const RANKS = [
    [0, '入門'], [50, '5級'], [120, '4級'], [200, '3級'], [300, '2級'], [420, '1級'],
    [560, '初段'], [720, '二段'], [900, '三段'], [1100, '四段'], [1350, '五段'], [1650, '名人'],
  ];

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
    sound: saved.sound || { bgm: true, sfx: true, volume: 0.7 },
    waitingNext: null,
    turn: null,
    combo: 0,
  };
  const persist = () => store.save({ mode: state.mode, opps: state.opps, speed: state.speed, stats: state.stats, sound: state.sound });

  /* ---------- カード ---------- */
  function cardHTML(c, extra = '') {
    if (c == null) return `<div class="card back ${extra}"></div>`;
    const r = HE.RANK_LABEL[HE.rankOf(c)];
    const s = HE.suitOf(c);
    return `<div class="card ${HE.SUIT_NAMES[s]} ${extra}" aria-label="${HE.cardText(c)}"><span class="r">${r}</span><span class="s">${HE.SUIT_SYMBOLS[s]}</span></div>`;
  }
  const cardsHTML = (cs) => cs.map((c) => cardHTML(c)).join('');

  const retrigger = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  /* ---------- テーブル ---------- */
  const narrow = window.matchMedia('(max-width: 640px)');
  const tableEl = $('table');

  function seatXY(i, n, scale = 1) {
    const rx = (narrow.matches ? 38 : 44) * scale;
    const ry = (narrow.matches ? 42 : 42) * scale;
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
  }

  // 要素の中心座標（テーブル基準の px）
  function centerOf(el) {
    const t = tableEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - t.left + r.width / 2, y: r.top - t.top + r.height / 2 };
  }

  const view = { seats: [], n: 0, prev: new Map(), lastHandNo: -1, boardLen: 0, snap: null, moods: new Map(), lines: new Map() };

  function buildSeats(players) {
    const n = players.length;
    const root = $('seats');
    root.innerHTML = '';
    view.seats = players.map((p, i) => {
      const { x, y } = seatXY(i, n);
      const el = document.createElement('div');
      el.className = `seat ${p.isHero ? 'hero' : 'bot'}`;
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      const below = y < 30;
      el.innerHTML = `
        <div class="bubble ${below ? 'below' : ''}" hidden><b class="b-act"></b><span class="b-line"></span></div>
        <div class="thinking ${below ? 'below' : ''}" hidden><i></i><i></i><i></i></div>
        <div class="seat-main">
          ${p.isHero ? '' : `<div class="avatar" data-mood="idle" style="--blink-delay:${(i * 1.7) % 5}s">${HE.chars.svg(p.name)}</div>`}
          <div class="hole"></div>
        </div>
        <div class="plate">
          <button type="button" class="pos"></button>
          <span class="name">${esc(p.name)}</span>
          <span class="style">${p.profile ? esc(p.profile.style) : 'あなた'}</span>
          <span class="stack"></span>
        </div>
        <div class="hand-name"></div>`;
      root.appendChild(el);

      const chip = document.createElement('div');
      const c = seatXY(i, n, 0.56);
      chip.className = 'bet-chip';
      chip.style.left = `${c.x}%`;
      chip.style.top = `${c.y}%`;
      chip.hidden = true;
      chip.innerHTML = '<i class="chip-stack"></i><span></span>';
      root.appendChild(chip);

      return {
        id: p.id, el, chip,
        bubble: el.querySelector('.bubble'), thinking: el.querySelector('.thinking'),
        avatar: el.querySelector('.avatar'), hole: el.querySelector('.hole'),
        pos: el.querySelector('.pos'), stack: el.querySelector('.stack'), handName: el.querySelector('.hand-name'),
        holeKey: '', actSeq: -1, bet: 0,
      };
    });
    view.n = n;
  }

  function setMood(id, mood) {
    view.moods.set(id, mood);
  }

  function renderTable(snap) {
    view.snap = snap;
    const n = snap.players.length;
    if (n !== view.n || view.seats.some((s, i) => s.id !== snap.players[i].id)) buildSeats(snap.players);
    const newHand = snap.handNo !== view.lastHandNo;

    snap.players.forEach((p, i) => {
      const s = view.seats[i];
      s.el.classList.toggle('folded', !!p.folded);
      s.el.classList.toggle('acting', snap.toActId === p.id);
      s.el.classList.toggle('winner', p.won > 0);
      s.el.classList.toggle('allin', !!p.allIn && !p.folded);
      s.stack.textContent = p.allIn && !p.folded && !p.won ? 'オールイン' : bbs(p.stack);

      const term = HE.glossary.find(p.position);
      s.pos.textContent = p.position;
      s.pos.className = `pos ${p.position === 'BTN' ? 'btn' : ''}`;
      s.pos.dataset.term = term ? term.id : '';
      s.pos.title = `${p.position}：タップで説明`;

      // 手札
      const showFace = p.isHero || (snap.showdown && !p.folded);
      const hidden = !p.hole || (p.folded && !p.isHero);
      const key = hidden ? 'none' : `${snap.handNo}:${showFace ? p.hole.join(',') : 'back'}`;
      if (key !== s.holeKey) {
        const anim = newHand ? 'deal' : showFace && !p.isHero ? 'flip' : '';
        s.hole.innerHTML = hidden ? '' : p.hole.map((c, k) => cardHTML(showFace ? c : null, anim).replace('class="card', `style="--d:${(i + k * n) * 45}ms" class="card`)).join('');
        s.holeKey = key;
      }

      // 吹き出し
      if (p.actSeq !== s.actSeq || newHand) {
        s.actSeq = p.actSeq;
        if (p.lastAction) {
          const type = p.lastActionType || 'blind';
          s.bubble.hidden = false;
          s.bubble.className = `bubble ${s.bubble.classList.contains('below') ? 'below' : ''} t-${type}`;
          s.bubble.querySelector('.b-act').textContent = p.lastAction;
          const line = view.lines.get(p.id) || '';
          view.lines.delete(p.id);
          s.bubble.querySelector('.b-line').textContent = line;
          s.bubble.querySelector('.b-line').hidden = !line;
          if (type !== 'blind') retrigger(s.bubble, 'pop');
          if (s.avatar && type !== 'blind') retrigger(s.avatar, `react-${type}`);
        } else {
          s.bubble.hidden = true;
        }
      } else if (!p.lastAction && !p.won) {
        s.bubble.hidden = true;
      }

      // 考え中
      const thinking = snap.toActId === p.id && !p.isHero;
      s.thinking.hidden = !thinking;
      if (thinking) s.bubble.hidden = true;

      // 表情
      if (s.avatar) {
        let mood = view.moods.get(p.id) || 'idle';
        if (p.folded) mood = 'fold';
        if (thinking) mood = 'think';
        s.avatar.dataset.mood = mood;
        s.avatar.dataset.mouth = HE.chars.mouthFor(p.name, mood);
      }

      s.handName.textContent = snap.showdown && !p.folded && p.handName ? p.handName : '';

      // ベット額とチップの移動
      if (p.bet > s.bet && !newHand) flyChips(s.el.querySelector('.seat-main'), s.chip, Math.min(6, 1 + Math.floor((p.bet - s.bet) / BB / 3)));
      s.bet = p.bet;
      s.chip.hidden = !p.bet;
      s.chip.classList.toggle('big', p.bet >= 10 * BB);
      s.chip.querySelector('span').textContent = bbs(p.bet);
    });

    // ボード
    const boardEl = $('board');
    if (newHand || snap.board.length !== view.boardLen) {
      const cells = [];
      for (let i = 0; i < 5; i++) {
        const c = snap.board[i];
        const fresh = c != null && i >= view.boardLen && !newHand;
        cells.push(c == null ? '<div class="slot"></div>' : cardHTML(c, fresh ? 'flip' : '').replace('class="card', `style="--d:${(i - view.boardLen) * 110}ms" class="card`));
        if (fresh) A.play('deal', i - view.boardLen);
      }
      boardEl.innerHTML = cells.join('');
      view.boardLen = snap.board.length;
    }
    view.lastHandNo = snap.handNo;
    $('pot-text').textContent = `ポット ${bbs(snap.pot)}`;
    $('street-label').textContent = snap.showdown ? 'ショーダウン' : HE.STREET_JA[snap.street] || '';
  }
  narrow.addEventListener('change', () => { view.n = 0; if (view.snap) { view.lastHandNo = -1; renderTable(view.snap); } });

  /* ---------- 演出 ---------- */
  function flyChips(fromEl, toEl, count = 3, onDone) {
    if (reduceMotion.matches || !fromEl || !toEl) { if (onDone) onDone(); return; }
    const fx = $('fx');
    const a = centerOf(fromEl);
    const wasHidden = toEl.hidden;
    toEl.hidden = false;
    const b = centerOf(toEl);
    toEl.hidden = wasHidden;
    for (let k = 0; k < count; k++) {
      const c = document.createElement('i');
      c.className = 'fly-chip';
      c.style.left = `${a.x}px`;
      c.style.top = `${a.y}px`;
      fx.appendChild(c);
      const dx = b.x - a.x + (Math.random() - 0.5) * 14, dy = b.y - a.y + (Math.random() - 0.5) * 8;
      c.animate(
        [{ transform: 'translate(-50%,-50%) scale(.7)', opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1 }],
        { duration: 420 + k * 40, delay: k * 45, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' },
      ).onfinish = () => { c.remove(); if (k === count - 1 && onDone) onDone(); };
    }
  }

  function gatherChips() {
    const pot = $('pot');
    view.seats.forEach((s) => { if (!s.chip.hidden) flyChips(s.chip, pot, 3); });
  }

  function announce(name, type, text) {
    const el = $('announce');
    el.className = `announce t-${type}`;
    el.innerHTML = `<span class="who">${esc(name)}</span><span class="what">${esc(text)}</span>`;
    retrigger(el, 'show');
  }

  function toast(html, kind = '', ms = 2200) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = html;
    $('toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  }

  function stamp(grade) {
    const hero = view.seats[0];
    if (!hero) return;
    const text = { good: 'ナイス！', ok: 'OK', bad: 'うーん…' }[grade];
    const el = document.createElement('div');
    el.className = `stamp ${grade}`;
    el.textContent = text;
    const c = centerOf(hero.el);
    const side = narrow.matches ? 78 : 130;
    el.style.left = `${c.x + side}px`;
    el.style.top = `${c.y - 30}px`;
    $('fx').appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  /* 紙吹雪 */
  let confettiRun = 0;
  function confetti(power = 1) {
    if (reduceMotion.matches) return;
    const cv = $('confetti');
    const rect = tableEl.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = rect.width * dpr; cv.height = rect.height * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ['#e3b04b', '#f6d58a', '#58c98f', '#f06363', '#6fa3ef', '#fbf8f1', '#ffb7cf'];
    const parts = [];
    const count = Math.round(70 * power);
    for (let i = 0; i < count; i++) {
      const fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? rect.width * 0.15 : rect.width * 0.85, y: rect.height * 0.75,
        vx: (fromLeft ? 1 : -1) * (2 + Math.random() * 5), vy: -(7 + Math.random() * 7),
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, c: colors[i % colors.length],
      });
    }
    const id = ++confettiRun;
    const start = performance.now();
    (function frame(now) {
      if (id !== confettiRun) return;
      const t = now - start;
      g.clearRect(0, 0, rect.width, rect.height);
      for (const p of parts) {
        p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save();
        g.translate(p.x, p.y); g.rotate(p.r);
        g.globalAlpha = Math.max(0, 1 - t / 2600);
        g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        g.restore();
      }
      if (t < 2600) requestAnimationFrame(frame);
      else g.clearRect(0, 0, rect.width, rect.height);
    })(start);
  }

  /* ---------- エンジンからのイベント ---------- */
  function onEvent(type, d) {
    const snap = view.snap;
    const nameOf = (id) => (snap && snap.players.find((p) => p.id === id) || {}).name || '';
    if (type === 'hand') {
      view.moods.clear();
      view.lines.clear();
      const n = state.opps + 1;
      for (let i = 0; i < Math.min(8, n * 2); i++) setTimeout(() => A.play('deal'), i * 70);
    } else if (type === 'street') {
      gatherChips();
      if (snap && snap.players.some((p) => p.bet > 0)) A.play('chips', 4);
    } else if (type === 'action') {
      const sfx = { fold: 'fold', check: 'check', call: 'call', bet: 'raise', raise: 'raise', allin: 'allin' }[d.type];
      A.play(sfx);
      if (!d.isHero) {
        const name = nameOf(d.id);
        view.lines.set(d.id, HE.chars.line(name, d.type));
        setMood(d.id, d.type);
        if (['bet', 'raise', 'allin'].includes(d.type)) announce(name, d.type, d.text);
      }
    } else if (type === 'win') {
      const pot = $('pot');
      const heroWin = d.winners.find((w) => w.isHero);
      if (snap && d.showdown) snap.players.forEach((p) => { if (!p.folded && !p.isHero) setMood(p.id, 'lose'); });
      d.winners.forEach((w) => {
        const idx = view.seats.findIndex((s) => s.id === w.id);
        if (idx < 0) return;
        const s = view.seats[idx];
        flyChips(pot, s.el.querySelector('.seat-main'), Math.min(10, 3 + Math.floor(w.amount / BB / 4)));
        if (!w.isHero) setMood(w.id, 'win');
        s.bubble.hidden = false;
        s.bubble.className = `bubble ${s.bubble.classList.contains('below') ? 'below' : ''} t-win`;
        s.bubble.querySelector('.b-act').textContent = `+${bbs(w.amount)} 獲得`;
        const line = w.isHero ? (w.handName ? w.handName : 'ナイス！') : HE.chars.line(nameOf(w.id), 'win');
        s.bubble.querySelector('.b-line').textContent = line;
        s.bubble.querySelector('.b-line').hidden = !line;
        retrigger(s.bubble, 'pop');
        if (s.avatar) retrigger(s.avatar, 'react-win');
      });
      if (snap) renderTable(snap);
      if (heroWin) {
        A.play('win');
        const amt = heroWin.amount / BB;
        confetti(amt >= 20 ? 2 : amt >= 8 ? 1.3 : 0.7);
        announce('あなた', 'win', `+${bbs(heroWin.amount)} 獲得！`);
      } else if (d.showdown && snap && snap.players[0] && !snap.players[0].folded) {
        A.play('lose');
      }
    }
  }

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

  /* ---------- 統計と段位 ---------- */
  const points = () => state.stats.good * 10 + state.stats.ok * 5;
  function rankOf(pts) {
    let i = 0;
    while (i + 1 < RANKS.length && pts >= RANKS[i + 1][0]) i++;
    return i;
  }

  function renderStats() {
    const s = state.stats;
    const count = s.good + s.ok + s.bad;
    $('stat-count').textContent = count;
    $('stat-acc').textContent = count ? pct((s.good + s.ok) / count) : '–';
    if (game) {
      const net = (game.hero.stack - game.startStack * game.heroBuyIns) / BB;
      $('stat-net').textContent = `${net > 0 ? '+' : net < 0 ? '−' : '±'}${Math.abs(net).toFixed(Number.isInteger(net) ? 0 : 1)}BB`;
    }
    const pts = points();
    const r = rankOf(pts);
    const [lo, name] = RANKS[r];
    const hi = RANKS[r + 1] ? RANKS[r + 1][0] : lo;
    $('rank-name').textContent = name;
    $('rank-fill').style.width = hi > lo ? `${((pts - lo) / (hi - lo)) * 100}%` : '100%';
    $('rank').title = RANKS[r + 1] ? `段位 ${name}：次の「${RANKS[r + 1][1]}」まであと ${hi - pts} 点（ナイス判断 10点・許容 5点）` : `段位 ${name}：最高段位です！`;
  }

  /* 判断を記録。live = その場で結果を見せる（レビューモード以外） */
  function recordGrade(g, live) {
    const before = rankOf(points());
    state.stats[g]++;
    persist();
    renderStats();
    if (live) {
      A.play(g);
      stamp(g);
      if (g === 'good') {
        state.combo++;
        if (state.combo >= 2) {
          setTimeout(() => A.play('combo', state.combo), 250);
          toast(`<b>ナイス判断 ×${state.combo}</b> コンボ！`, 'combo', 1600);
        }
      } else if (g === 'bad') {
        state.combo = 0;
      }
    }
    const after = rankOf(points());
    if (after > before) {
      setTimeout(() => {
        A.play('levelUp');
        confetti(1.6);
        toast(`<span class="toast-eyebrow">昇級！</span><b>${RANKS[before][1]} → ${RANKS[after][1]}</b>`, 'level', 3200);
        retrigger($('rank'), 'bump');
      }, live ? 500 : 200);
    }
  }

  /* ---------- コーチ欄 ---------- */
  const coach = () => $('coach');

  function introHTML(extra = '') {
    const m = MODE_INTRO[state.mode];
    return `<div class="eyebrow">${m.title}</div><p class="lead">${T(m.text)}</p>${extra}`;
  }

  function flowHTML(ctx) {
    const snap = view.snap;
    if (!snap || !snap.streetLog.length) return '';
    const items = snap.streetLog.map((a) => `<li class="t-${a.type}"><span class="pos-mini">${a.position}</span>${esc(a.isHero ? 'あなた' : a.name)}<b>${esc(a.text)}</b></li>`);
    return `<div class="flow"><div class="eyebrow">この${HE.STREET_JA[ctx.street]}の流れ</div><ol>${items.join('')}</ol></div>`;
  }

  function meterHTML(rec, ctx) {
    const m = rec.metrics;
    if (ctx.street === 'preflop') {
      const strength = 1 - m.top;
      return `<div class="meter">
        <div class="meter-bar"><div class="meter-fill" style="width:${Math.max(2, strength * 100)}%"></div></div>
        <div class="meter-legend"><span>ハンドの強さ <b>${m.cls}</b></span><span>${topText(m.top)}</span></div>
      </div>`;
    }
    const mark = ctx.toCall > 0 ? `<div class="meter-mark" style="left:${m.potOdds * 100}%" title="必要勝率"></div>` : '';
    const seen = new Set();
    return `<div class="meter">
      <div class="meter-bar"><div class="meter-fill" style="width:${Math.max(2, m.equity * 100)}%"></div>${mark}</div>
      <div class="meter-legend"><span>${T('推定勝率', seen)} <b>${pct(m.equity)}</b></span>${ctx.toCall > 0 ? `<span>${T('必要勝率', seen)} <b>${pct(m.potOdds)}</b></span>` : `<span>ベットの目安 <b>${pct(m.valueTh)}</b></span>`}</div>
    </div>`;
  }

  const ACTION_NAME = { fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'ベット／レイズ' };
  const alsoHTML = (rec) => (rec.acceptable.length ? `<div class="also">これも可：${rec.acceptable.map((a) => ACTION_NAME[a]).join('、')}</div>` : '');
  const reasonsHTML = (reasons) => {
    const seen = new Set();
    return `<ul class="reasons">${reasons.map((r) => `<li>${T(r, seen)}</li>`).join('')}</ul>`;
  };

  function recHTML(rec, ctx) {
    return `<div class="verdict ${rec.action}">${esc(rec.label)}</div>
      ${alsoHTML(rec)}
      ${meterHTML(rec, ctx)}
      ${reasonsHTML(rec.reasons)}`;
  }

  function renderCoachTurn(rec, ctx) {
    const street = HE.STREET_JA[ctx.street];
    const flow = flowHTML(ctx);
    if (state.mode === 'coach') {
      coach().innerHTML = `${flow}<div class="eyebrow">${street}・コーチのおすすめ</div>${recHTML(rec, ctx)}`;
      highlight(rec.action);
    } else if (state.mode === 'drill') {
      coach().innerHTML = `${flow}<div class="eyebrow">${street}・${ctx.position}</div>
        <div class="verdict">どうする？</div>
        <p class="lead">${T(ctx.toCall > 0 ? `コールには ${bbs(ctx.toCall)} 必要です。` : 'まだ誰もレイズしていません。')}${T(`あなたは ${ctx.position} の席。前の人の行動を確認して選びましょう。`)}</p>
        <div class="btn-row"><button class="btn ghost" id="show-hint">ヒントを見る<kbd>H</kbd></button></div>`;
      $('show-hint').onclick = () => {
        A.play('pop');
        coach().innerHTML = `${flow}<div class="eyebrow">${street}・ヒント</div>${recHTML(rec, ctx)}`;
        highlight(rec.action);
      };
    } else {
      coach().innerHTML = `${flow}<div class="eyebrow">${street}・あなたの番</div>
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
      if (b) { b.onclick = () => { A.play('click'); state.waitingNext = null; resolve(); }; b.focus({ preventScroll: true }); }
      flushPendingKey();
    });
  }

  function renderDrillAnswer(rec) {
    const g = rec.grade;
    coach().innerHTML = `<div class="eyebrow">プリフロップ特訓・採点</div>
      ${gradeHTML(g)}
      <div class="verdict ${rec.rec.action}">${g === 'good' ? '正解！' : ''}${esc(rec.rec.label)}</div>
      <div class="also">あなた：${esc(rec.label)}${rec.rec.acceptable.length ? `／これも可：${rec.rec.acceptable.map((a) => ACTION_NAME[a]).join('、')}` : ''}</div>
      ${meterHTML(rec.rec, { street: 'preflop' })}
      ${reasonsHTML(rec.rec.reasons)}
      <div class="btn-row"><button class="btn" id="next-hand">次のハンド<kbd>Space</kbd></button></div>`;
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
        ? `<dt>ハンド</dt><dd>${esc(m.cls)}（${topText(m.top)}）</dd>`
        : `<dt>${T('推定勝率')}</dt><dd class="num">${pct(m.equity)}${d.toCall > 0 ? `（必要 ${pct(m.potOdds)}）` : ''}</dd>`;
      const should = d.grade === 'bad' ? `<div class="should"><b>こうすべきだった：</b>${esc(d.rec.label)}</div>` : '';
      // 良い判断は1行にたたんでおき、改善が必要な判断だけ最初から開いておく
      return `<li class="step ${d.grade}"><details class="step-box"${d.grade === 'bad' ? ' open' : ''}>
        <summary class="step-head">
          <span class="step-street">${esc(HE.STREET_JA[d.street])}・${esc(d.position)}</span>
          <span class="step-you">${esc(d.label)}${d.grade === 'bad' ? ` → <b>${esc(d.rec.label)}</b>` : ''}</span>
          ${gradeHTML(d.grade)}
        </summary>
        <div class="step-body">
          <div class="step-cards">${cardsHTML(d.hole)}<span class="gap"></span>${cardsHTML(d.board)}</div>
          <dl>
            <dt>あなた</dt><dd>${esc(d.label)}</dd>
            <dt>推奨</dt><dd>${esc(d.rec.label)}${d.rec.acceptable.length ? `（${d.rec.acceptable.map((a) => ACTION_NAME[a]).join('・')}も可）` : ''}</dd>
            ${est}
            <dt>実際の勝率</dt><dd class="num">${pct(hindsight)} <span class="muted">相手の手札が見えていた場合</span></dd>
          </dl>
          ${should}
          <div class="step-reasons"><div class="eyebrow">理由</div>${reasonsHTML(d.rec.reasons)}</div>
        </div>
      </details></li>`;
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
        <span>${res.showdown ? T('ショーダウンで決着') : '全員フォールドで決着'}</span>
        <span class="result-amt ${net > 0 ? 'plus' : net < 0 ? 'minus' : ''}">${net > 0 ? '+' : net < 0 ? '−' : '±'}${Math.abs(net)}BB</span>
      </div>
      <p class="lead">${overall}</p>
      ${res.decisions.length ? `<div class="tally"><span class="grade good">ナイス ${counts.good}</span><span class="grade ok">許容 ${counts.ok}</span><span class="grade bad">改善 ${counts.bad}</span></div>` : ''}
      ${counts.good + counts.ok && counts.bad ? '<p class="muted fold-note">ナイス判断・許容範囲の場面はたたんであります。タップで開けます。</p>' : ''}
      <ol class="timeline">${steps.join('')}</ol>
      <details><summary>全員の手札を見る</summary><div class="showdown-list">${everyone}</div></details>
      <div class="btn-row"><button class="btn" id="next-hand">次のハンド<kbd>Space</kbd></button></div>`;
  }

  /* ---------- 操作 ---------- */
  function setButtonsEnabled(on) {
    ['btn-fold', 'btn-call', 'btn-raise'].forEach((id) => { $(id).disabled = !on; });
    $('raise-slider').disabled = !on;
    $('sizing').classList.toggle('off', !on);
    $('actions').classList.toggle('your-turn', on);
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
      A.play('turn');
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
      $('presets').innerHTML = presets.map(([l], i) => `<button class="preset" data-i="${i}">${l}${PRESET_KEYS[i] ? `<kbd>${PRESET_KEYS[i][0]}</kbd>` : ''}</button>`).join('');
      $('presets').querySelectorAll('.preset').forEach((b) => { b.onclick = () => { A.play('click'); setRaise(presets[Number(b.dataset.i)][1]); }; });
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
        if (state.mode !== 'review') recordGrade(g, true);
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
        preset: (i) => {
          if (!canRaise || !presets[i]) return;
          A.play('click');
          setRaise(presets[i][1]);
        },
        nudge: (dir, big) => {
          if (!canRaise) return;
          setRaise(Number(slider.value) + dir * (big ? ctx.bb * 5 : step));
        },
      };
      flushPendingKey();
    });
  }

  $('btn-fold').onclick = () => state.turn && state.turn.fold();
  $('btn-call').onclick = () => state.turn && state.turn.call();
  $('btn-raise').onclick = () => state.turn && state.turn.raise();

  /* キー操作：左手のホームポジションで完結する配置。
   * 物理キー位置（e.code）で判定するので、日本語入力がオンでも効く */
  const ACTION_KEYS = { KeyA: 'fold', Digit1: 'fold', KeyS: 'call', Digit2: 'call', KeyD: 'raise', Digit3: 'raise' };
  const PRESET_KEYS = [['Q', 'KeyQ'], ['W', 'KeyW'], ['E', 'KeyE'], ['R', 'KeyR'], ['T', 'KeyT']];
  const NEXT_KEYS = new Set(['Space', 'Enter', 'KeyS']);
  const isGameKey = (code) => ACTION_KEYS[code] || NEXT_KEYS.has(code) || code === 'KeyH'
    || PRESET_KEYS.some(([, c]) => c === code) || code === 'ArrowLeft' || code === 'ArrowRight';

  function flash(id) {
    const el = $(id);
    if (el) retrigger(el, 'pressed');
  }

  /* 今受け付けられるキーなら実行して true を返す */
  function runKey(code, shift) {
    if (state.turn) {
      if (ACTION_KEYS[code]) {
        const act = ACTION_KEYS[code];
        const id = { fold: 'btn-fold', call: 'btn-call', raise: 'btn-raise' }[act];
        if ($(id).disabled) return false;
        flash(id);
        state.turn[act]();
        return true;
      }
      const pi = PRESET_KEYS.findIndex(([, c]) => c === code);
      if (pi >= 0) { state.turn.preset(pi); return true; }
      if (code === 'ArrowLeft' || code === 'ArrowRight') { state.turn.nudge(code === 'ArrowRight' ? 1 : -1, shift); return true; }
      if (code === 'KeyH' && $('show-hint')) { $('show-hint').click(); return true; }
      return false;
    }
    if (NEXT_KEYS.has(code) && state.waitingNext) {
      A.play('click');
      flash('next-hand');
      const r = state.waitingNext; state.waitingNext = null; r();
      return true;
    }
    return false;
  }

  /* 画面の切り替わり中（相手の行動・結果の表示待ち）に押されたキーは少しの間とっておき、
   * 受け付けられるようになった瞬間に実行する */
  const BUFFER_MS = { action: 900, next: 2500 };
  let pendingKey = null;
  function flushPendingKey() {
    if (!pendingKey) return;
    const { code, shift, at } = pendingKey;
    pendingKey = null;
    const limit = NEXT_KEYS.has(code) && state.waitingNext ? BUFFER_MS.next : BUFFER_MS.action;
    if (performance.now() - at <= limit) runKey(code, shift);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideTerm(); return; }
    if (!$('title-screen').hidden) {
      if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); start(true); }
      return;
    }
    // 文字入力欄（用語検索）とスライダーの矢印だけはブラウザに任せる
    const t = e.target;
    if (t.matches('textarea, input:not([type="range"]):not([type="checkbox"])')) return;
    if (t.type === 'range' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!isGameKey(e.code)) return;
    e.preventDefault();
    hideTerm();
    if (e.repeat) return;
    if (!runKey(e.code, e.shiftKey)) pendingKey = { code: e.code, shift: e.shiftKey, at: performance.now() };
  });

  // マウスで設定を触った後もキーが効くように、フォーカスを残さない
  document.addEventListener('change', (e) => { if (e.target.matches('select')) e.target.blur(); });
  document.addEventListener('pointerup', (e) => {
    const b = e.target.closest('.mode, .toggle, .preset, .act, summary');
    if (b) setTimeout(() => b.blur(), 0);
  });

  /* ---------- 用語の説明 ---------- */
  const pop = $('term-pop');
  function showTerm(target) {
    const t = HE.glossary.TERMS[Number(target.dataset.term)];
    if (!t) return;
    pop.innerHTML = `<div class="term-group">${esc(t.group)}</div><div class="term-title">${esc(t.title)}</div><p>${T(t.desc, new Set([t.id]))}</p>`;
    pop.hidden = false;
    const r = target.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 32);
    pop.style.width = `${w}px`;
    let left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), window.innerWidth - w - 16);
    let top = r.bottom + 8;
    const h = pop.offsetHeight;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    retrigger(pop, 'show');
    A.play('pop');
  }
  function hideTerm() { pop.hidden = true; }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-term]');
    if (t && t.dataset.term !== '') { e.preventDefault(); showTerm(t); return; }
    if (!e.target.closest('#term-pop')) hideTerm();
  });
  window.addEventListener('resize', hideTerm);
  document.addEventListener('scroll', hideTerm, true);

  function buildGlossary() {
    const groups = new Map();
    HE.glossary.TERMS.forEach((t) => {
      if (!groups.has(t.group)) groups.set(t.group, []);
      groups.get(t.group).push(t);
    });
    $('glossary').innerHTML = [...groups].map(([g, ts]) => `<section class="g-group"><h3>${esc(g)}</h3><dl>${ts.map((t) => `<div class="g-item" data-search="${esc(t.aliases.join(' ') + ' ' + t.desc)}"><dt>${esc(t.aliases.join('／'))}</dt><dd>${esc(t.desc)}</dd></div>`).join('')}</dl></section>`).join('');
    $('glossary-search').oninput = (e) => {
      const q = e.target.value.trim();
      $('glossary').querySelectorAll('.g-item').forEach((el) => { el.hidden = q && !el.dataset.search.includes(q); });
      $('glossary').querySelectorAll('.g-group').forEach((sec) => { sec.hidden = !sec.querySelector('.g-item:not([hidden])'); });
    };
  }

  /* ---------- モードと設定 ---------- */
  function renderModes() {
    document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === state.mode)));
  }
  document.querySelectorAll('.mode').forEach((b) => {
    b.onclick = () => {
      if (state.mode === b.dataset.mode) return;
      A.play('click');
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

  function renderSound() {
    $('opt-bgm').setAttribute('aria-pressed', String(state.sound.bgm));
    $('opt-sfx').setAttribute('aria-pressed', String(state.sound.sfx));
    $('opt-vol').value = state.sound.volume;
  }
  function applySound() {
    A.setVolume(state.sound.volume);
    A.setSfx(state.sound.sfx);
    A.setBgm(state.sound.bgm);
    renderSound();
    persist();
  }
  $('opt-bgm').onclick = () => { state.sound.bgm = !state.sound.bgm; A.unlock(); applySound(); };
  $('opt-sfx').onclick = () => { state.sound.sfx = !state.sound.sfx; A.unlock(); applySound(); A.play('click'); };
  $('opt-vol').oninput = (e) => { state.sound.volume = Number(e.target.value); A.unlock(); applySound(); };

  const SPEED = { slow: 1.7, normal: 1, fast: 0.3 };

  /* ---------- ゲーム ---------- */
  let game = null;
  let drillAnswered = false;
  const ui = {
    onUpdate: renderTable,
    onLog: log,
    onEvent,
    delay: (ms) => sleep(ms * SPEED[state.speed]),
    botDelay: () => (550 + Math.random() * 450) * SPEED[state.speed],
    askHero,
    onDrillAnswer(record) {
      drillAnswered = true;
      renderDrillAnswer(record);
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
          await sleep(1400);
        }
      } else {
        if (mode === 'review') res.decisions.forEach((d) => recordGrade(d.grade, false));
        await sleep(600 * SPEED[state.speed]);
        renderReview(res);
        await waitNext();
      }
    }
  }

  /* ---------- タイトル画面 ---------- */
  function buildTitle() {
    $('lineup').innerHTML = HE.BOT_PROFILES.map((p, i) => `
      <div class="lineup-item" style="--i:${i}">
        <div class="avatar" data-mood="idle" data-mouth="${HE.chars.mouthFor(p.name, 'idle')}" style="--blink-delay:${i * 0.9}s">${HE.chars.svg(p.name)}</div>
        <div class="lineup-name">${esc(p.name)}</div>
        <div class="lineup-style">${esc(p.style)}</div>
      </div>`).join('');
  }

  let started = false;
  function start(withSound) {
    if (started) return;
    started = true;
    if (withSound) { state.sound.bgm = true; state.sound.sfx = true; A.unlock(); }
    else { state.sound.bgm = false; state.sound.sfx = false; }
    applySound();
    A.play('chips', 4);
    $('title-screen').classList.add('leaving');
    setTimeout(() => { $('title-screen').hidden = true; }, 450);
    loop();
  }
  $('start-sound').onclick = () => start(true);
  $('start-mute').onclick = () => start(false);

  document.body.insertAdjacentHTML('afterbegin', HE.chars.DEFS);
  buildTitle();
  buildGlossary();
  renderModes();
  renderSound();
  renderStats();
  setButtonsEnabled(false);
  coach().innerHTML = introHTML();
  $('start-sound').focus({ preventScroll: true });
})(window.HE);
