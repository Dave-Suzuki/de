/* テキサスホールデムの進行エンジン（ノーリミット） */
(function (HE) {
  'use strict';

  const STREETS = ['preflop', 'flop', 'turn', 'river'];
  const STREET_JA = { preflop: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー' };
  const ACTION_JA = { fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', bet: 'ベット', allin: 'オールイン' };

  function positionLabels(n) {
    // ボタンからの距離ごとのポジション名
    if (n === 2) return ['BTN', 'BB'];
    const rest = ['UTG', 'HJ', 'CO'].slice(3 - (n - 3));
    return ['BTN', 'SB', 'BB', ...rest];
  }

  class Game {
    constructor(ui, opts = {}) {
      this.ui = ui;
      this.bb = opts.bb || 100;
      this.sb = this.bb / 2;
      this.startStack = opts.startStack || this.bb * 100;
      this.rng = opts.rng || Math.random;
      this.setOpponents(opts.numOpponents || 5);
      this.button = Math.floor(this.rng() * this.players.length);
      this.handNo = 0;
      this.heroBuyIns = 1;
    }

    setOpponents(n) {
      if (!this.hero) {
        this.hero = { id: 0, name: 'あなた', isHero: true, stack: this.startStack };
        this.bots = HE.BOT_PROFILES.map((profile, i) => ({ id: i + 1, name: profile.name, profile, stack: this.startStack }));
      }
      this.players = [this.hero, ...this.bots.slice(0, n)];
      if (this.button >= this.players.length) this.button = 0;
    }

    /* ---- 便利関数 ---- */
    seatAfter(i) { return (i + 1) % this.players.length; }
    orderFrom(start) {
      const out = [];
      for (let k = 0; k < this.players.length; k++) out.push(this.players[(start + k) % this.players.length]);
      return out;
    }
    live() { return this.players.filter((p) => !p.folded); }
    canAct(p) { return !p.folded && !p.allIn; }
    pot() { return this.players.reduce((s, p) => s + p.totalBet, 0); }

    put(p, amount) {
      const a = Math.min(amount, p.stack);
      p.stack -= a;
      p.bet += a;
      p.totalBet += a;
      if (p.stack === 0) p.allIn = true;
      return a;
    }

    snapshot() {
      return {
        players: this.players.map((p) => ({ ...p, hole: p.hole ? p.hole.slice() : null })),
        board: this.board.slice(),
        pot: this.pot(),
        street: this.street,
        currentBet: this.currentBet,
        toActId: this.toActId,
        button: this.button,
        handNo: this.handNo,
        showdown: this.showdown,
        streetLog: this.streetLog.slice(),
      };
    }

    render() { this.ui.onUpdate(this.snapshot()); }
    log(t, cls) { this.ui.onLog(t, cls); }
    emit(type, data) { if (this.ui.onEvent) this.ui.onEvent(type, data || {}); }

    /* ---- 1ハンド ---- */
    async playHand(mode) {
      this.mode = mode;
      this.handNo++;
      const P = this.players;
      const n = P.length;

      // 破産したプレイヤーはリバイ
      for (const p of P) {
        if (p.stack < this.bb) {
          p.stack = this.startStack;
          if (p.isHero) this.heroBuyIns++;
          this.log(`${p.name} がリバイしました（${this.startStack / this.bb}BB）`, 'muted');
        }
      }
      const stackBefore = P.map((p) => p.stack);

      this.button = this.seatAfter(this.button);
      const labels = positionLabels(n);
      P.forEach((p, i) => {
        Object.assign(p, {
          hole: null, folded: false, allIn: false, bet: 0, totalBet: 0,
          lastAction: null, lastActionType: null, actSeq: 0, pfRange: 1, streetAggr: false, won: 0, handName: null,
          position: labels[(i - this.button + n) % n],
        });
      });
      this.board = [];
      this.decisions = [];
      this.showdown = false;
      this.lastAggressor = null;
      this.toActId = null;
      this.aborted = false;
      this.streetLog = [];
      this.actionSeq = this.actionSeq || 0;

      const deck = HE.shuffle(HE.newDeck(), this.rng);
      for (const p of P) p.hole = [deck.pop(), deck.pop()];
      this.deck = deck;

      this.log(`―― ハンド #${this.handNo} ――`, 'head');
      this.log(`あなたの手札：${P[0].hole.map(HE.cardText).join(' ')}（${P[0].position}）`);

      // ブラインド
      const sbSeat = n === 2 ? this.button : this.seatAfter(this.button);
      const bbSeat = this.seatAfter(sbSeat);
      this.put(P[sbSeat], this.sb); P[sbSeat].lastAction = `SB ${HE.BBs(this.sb, this.bb)}`;
      this.put(P[bbSeat], this.bb); P[bbSeat].lastAction = `BB ${HE.BBs(this.bb, this.bb)}`;
      P[sbSeat].lastActionType = P[bbSeat].lastActionType = 'blind';
      this.emit('hand', { handNo: this.handNo });

      for (const street of STREETS) {
        this.street = street;
        if (street !== 'preflop') {
          const count = street === 'flop' ? 3 : 1;
          this.emit('street', { street });
          await this.ui.delay(this.pot() > 0 ? 380 : 0);
          this.deck.pop(); // バーンカード
          for (let i = 0; i < count; i++) this.board.push(this.deck.pop());
          for (const p of P) {
            p.bet = 0; p.streetAggr = false;
            if (!p.folded && !p.allIn) { p.lastAction = null; p.lastActionType = null; }
          }
          this.streetLog = [];
          this.currentBet = 0;
          this.lastRaise = this.bb;
          this.raises = 0;
          this.resetRaiseRights();
          this.log(`${STREET_JA[street]}：${this.board.map(HE.cardText).join(' ')}`, 'street');
          this.render();
          await this.ui.delay(this.live().filter((p) => this.canAct(p)).length > 1 ? 450 : 900);
          await this.bettingRound(this.seatAfter(this.button));
        } else {
          this.currentBet = this.bb;
          this.lastRaise = this.bb;
          this.raises = 0;
          this.limpers = 0;
          this.resetRaiseRights();
          this.render();
          await this.bettingRound(this.seatAfter(bbSeat));
        }
        if (this.aborted) break;
        if (this.live().length === 1) break;
      }

      if (this.aborted) {
        // 特訓モード：チップを元に戻して終了
        P.forEach((p, i) => { p.stack = stackBefore[i]; });
        this.toActId = null;
        this.render();
        return this.summary(stackBefore, true);
      }

      this.toActId = null;
      this.settle();
      this.render();
      this.emit('win', {
        showdown: this.showdown,
        winners: this.players.filter((p) => p.won > 0).map((p) => ({ id: p.id, amount: p.won, isHero: !!p.isHero, handName: p.handName })),
      });
      if (this.mode === 'drill') {
        // 特訓モードで自分の番が来なかったハンド（BB のウォークなど）もチップは動かさない
        P.forEach((p, i) => { p.stack = stackBefore[i]; });
        this.render();
        return this.summary(stackBefore, true);
      }
      return this.summary(stackBefore, false);
    }

    summary(stackBefore, drill) {
      const hero = this.players[0];
      return {
        handNo: this.handNo,
        drill,
        board: this.board.slice(),
        fullBoard: this.fullBoard ? this.fullBoard.slice() : this.board.slice(),
        players: this.players.map((p) => ({ id: p.id, name: p.name, hole: p.hole.slice(), folded: p.folded, position: p.position, won: p.won, handName: p.handName })),
        decisions: this.decisions,
        heroNet: hero.stack - stackBefore[0],
        showdown: this.showdown,
        bb: this.bb,
      };
    }

    /* ---- ベッティングラウンド ---- */
    async bettingRound(firstSeat) {
      let pending = this.orderFrom(firstSeat).filter((p) => this.canAct(p));
      while (pending.length) {
        if (this.live().length === 1) return;
        const p = pending.shift();
        if (!this.canAct(p)) continue;
        const others = this.live().filter((q) => q !== p && !q.allIn);
        if (others.length === 0 && p.bet >= this.currentBet) continue;

        this.toActId = p.id;
        this.render();
        const ctx = this.buildCtx(p);
        let decision;
        if (p.isHero) {
          const rec = HE.advise(ctx);
          const choice = await this.ui.askHero({ ctx, rec, street: this.street });
          const record = {
            street: this.street, board: this.board.slice(), hole: p.hole.slice(), position: p.position,
            pot: ctx.pot, toCall: ctx.toCall, bb: this.bb, rec, action: choice.action, amount: choice.amount, label: choice.label,
            grade: HE.grade(rec, choice.action),
            oppIds: this.live().filter((q) => q !== p).map((q) => q.id),
          };
          this.decisions.push(record);
          decision = choice;
          if (this.mode === 'drill') {
            this.applyAction(p, decision, ctx);
            this.aborted = true;
            this.ui.onDrillAnswer && this.ui.onDrillAnswer(record);
            return;
          }
        } else {
          await this.ui.delay(this.ui.botDelay ? this.ui.botDelay() : 500);
          decision = HE.botDecide(p, ctx, this.rng);
        }
        const raised = this.applyAction(p, decision, ctx);
        this.render();
        const after = this.orderFrom(this.seatAfter(this.players.indexOf(p))).filter((q) => q !== p && this.canAct(q));
        if (raised === 'full') {
          pending = after;
        } else if (raised === 'partial') {
          // 最小レイズに届かないオールイン：まだ行動していない人はそのまま。
          // すでに行動した人はコールかフォールドだけ（レイズの権利は戻らない）
          pending = after.filter((q) => q.bet < this.currentBet || pending.includes(q));
          for (const q of pending) if (this.actedFull.has(q)) this.noRaise.add(q);
        }
      }
    }

    resetRaiseRights() {
      this.actedFull = new Set(); // 最後のフルレイズ以降に行動した人
      this.noRaise = new Set();   // レイズできない人（不完全なオールインに直面）
    }

    buildCtx(p) {
      const oppsCanAct = this.live().filter((q) => q !== p && !q.allIn).length;
      const opps = this.live().filter((q) => q !== p).map((q) => ({ range: q.pfRange, aggressive: q.streetAggr }));
      const liveOrder = this.orderFrom(this.seatAfter(this.button)).filter((q) => !q.folded);
      const inPosition = this.street === 'preflop'
        ? !['SB', 'BB'].includes(p.position)
        : liveOrder[liveOrder.length - 1] === p;
      return {
        street: this.street,
        hole: p.hole,
        board: this.board.slice(),
        position: p.position,
        numPlayers: this.players.length,
        pot: this.pot(),
        toCall: Math.min(this.currentBet - p.bet, p.stack),
        currentBet: this.currentBet,
        myBet: p.bet,
        stack: p.stack,
        bb: this.bb,
        minRaiseTo: this.currentBet + this.lastRaise,
        raises: this.raises,
        limpers: this.limpers || 0,
        opps,
        inPosition,
        aggressor: this.lastAggressor === p.id,
        maxOppStack: Math.max(0, ...this.live().filter((q) => q !== p).map((q) => q.stack + q.bet)),
        oppsCanAct,
        // レイズできるか：スタックが足りる／レイズの権利がある／相手がまだ行動できる
        canRaise: p.stack > this.currentBet - p.bet && !this.noRaise.has(p) && oppsCanAct > 0,
      };
    }

    /* 戻り値: 'full'（フルレイズでアクション再開）/ 'partial'（最小に届かないオールイン）/ false */
    applyAction(p, d, ctx) {
      const toCall = this.currentBet - p.bet;
      let text, type;
      let raised = false;
      // 不正なアクションは安全な側に直す（UI・コーチ・CPUは本来ここに来ない）
      if (d.action === 'check' && toCall > 0) d = { ...d, action: 'fold' };
      if (d.action === 'raise' && (this.noRaise.has(p) || p.stack <= toCall)) d = { ...d, action: 'call' };
      if (d.action === 'fold') {
        p.folded = true;
        text = 'フォールド';
        type = 'fold';
      } else if (d.action === 'check' || (d.action === 'call' && toCall <= 0)) {
        text = 'チェック';
        type = 'check';
        if (this.street === 'preflop' && p.position === 'BB') p.pfRange = Math.min(p.pfRange, 1);
      } else if (d.action === 'call' || Math.min(d.amount, p.bet + p.stack) <= this.currentBet) {
        const paid = this.put(p, toCall);
        text = p.allIn ? `オールイン（コール ${HE.BBs(paid, this.bb)}）` : `コール ${HE.BBs(p.bet, this.bb)}`;
        type = p.allIn ? 'allin' : 'call';
        if (this.street === 'preflop') {
          if (this.raises === 0) { this.limpers++; p.pfRange = Math.min(p.pfRange, p.position === 'SB' ? 0.7 : 0.6); }
          else p.pfRange = Math.min(p.pfRange, 0.35);
        }
      } else {
        // 最小レイズ額に満たない額は、スタックが許す範囲で最小額まで引き上げる
        const to = Math.min(Math.max(d.amount || 0, this.currentBet + this.lastRaise), p.bet + p.stack);
        const size = to - this.currentBet;
        const wasBet = this.currentBet === 0;
        this.put(p, to - p.bet);
        const full = size >= this.lastRaise || wasBet;
        if (this.street === 'preflop' && full) {
          p.pfRange = Math.min(p.pfRange, [0.22, 0.08, 0.04][Math.min(this.raises, 2)]);
        }
        this.currentBet = Math.max(this.currentBet, p.bet);
        if (full) {
          this.lastRaise = Math.max(size, this.lastRaise);
          this.raises++;
          this.actedFull = new Set();
          this.noRaise = new Set();
        }
        this.lastAggressor = p.id;
        p.streetAggr = true;
        raised = full ? 'full' : 'partial';
        text = p.allIn ? `オールイン ${HE.BBs(p.bet, this.bb)}` : `${wasBet ? 'ベット' : 'レイズ'} ${HE.BBs(p.bet, this.bb)}`;
        type = p.allIn ? 'allin' : wasBet ? 'bet' : 'raise';
      }
      this.actedFull.add(p);
      p.lastAction = text;
      p.lastActionType = type;
      p.actSeq = ++this.actionSeq;
      this.streetLog.push({ id: p.id, name: p.name, position: p.position, text, type, isHero: !!p.isHero });
      this.log(`${p.name}：${text}`, p.isHero ? 'hero' : '');
      this.emit('action', { id: p.id, type, text, isHero: !!p.isHero, street: this.street });
      return raised;
    }

    /* ---- 精算（サイドポット対応） ---- */
    settle() {
      const P = this.players;
      const live = this.live();
      this.fullBoard = this.board.slice();

      if (live.length === 1) {
        const w = live[0];
        const pot = this.pot();
        w.stack += pot;
        w.won = pot;
        this.log(`${w.name} が ${HE.BBs(pot, this.bb)} を獲得（全員フォールド）`, 'win');
        return;
      }

      // 残りのボードを配る（オールイン時）
      while (this.board.length < 5) {
        if (this.board.length === 0) { this.deck.pop(); this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop()); }
        else { this.deck.pop(); this.board.push(this.deck.pop()); }
      }
      this.fullBoard = this.board.slice();
      this.showdown = true;
      this.log(`ショーダウン：${this.board.map(HE.cardText).join(' ')}`, 'street');

      const scores = new Map();
      for (const p of live) {
        const ev = HE.evaluate(p.hole.concat(this.board));
        scores.set(p, ev.score);
        p.handName = HE.describe(ev);
        this.log(`${p.name}：${p.hole.map(HE.cardText).join(' ')} → ${p.handName}`);
      }

      const levels = [...new Set(live.map((p) => p.totalBet))].sort((a, b) => a - b);
      let prev = 0;
      for (const level of levels) {
        let amount = 0;
        for (const p of P) amount += Math.max(0, Math.min(p.totalBet, level) - prev);
        const eligible = live.filter((p) => p.totalBet >= level);
        prev = level;
        if (!amount) continue;
        let best = -1, winners = [];
        for (const p of eligible) {
          const s = scores.get(p);
          if (s > best) { best = s; winners = [p]; } else if (s === best) winners.push(p);
        }
        // 割り切れない端数は、ボタンの左隣に近い勝者から1単位ずつ配る
        const n = P.length;
        winners.sort((a, b) => ((P.indexOf(a) - this.button - 1 + n) % n) - ((P.indexOf(b) - this.button - 1 + n) % n));
        const unit = this.sb / 5;
        const units = Math.floor(amount / unit);
        const base = Math.floor(units / winners.length);
        let extra = units - base * winners.length;
        let loose = amount - units * unit; // 単位未満の端数（通常は0）
        for (const w of winners) {
          let got = base * unit;
          if (extra > 0) { got += unit; extra--; }
          if (loose > 0) { got += loose; loose = 0; }
          w.stack += got;
          w.won += got;
        }
      }
      for (const p of live) {
        if (p.won > 0) this.log(`${p.name} が ${HE.BBs(p.won, this.bb)} を獲得（${p.handName}）`, 'win');
      }
    }
  }

  Object.assign(HE, { Game, STREET_JA, ACTION_JA, positionLabels });
})(typeof window !== 'undefined' ? window.HE : globalThis.HE);
