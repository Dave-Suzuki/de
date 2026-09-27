/* コーチ：その場の状況から推奨アクションと理由を返す
 *
 * ctx = {
 *   street: 'preflop'|'flop'|'turn'|'river',
 *   hole, board, position ('UTG'|'HJ'|'CO'|'BTN'|'SB'|'BB'),
 *   pot,             // テーブル上のベットも含めた現在のポット
 *   toCall,          // コールに必要な額
 *   currentBet,      // このストリートの最高ベット額
 *   myBet,           // 自分がこのストリートに出している額
 *   stack,           // 残りスタック
 *   bb, minRaiseTo,
 *   raises,          // このストリートのレイズ回数（プリフロップはBBを数えない）
 *   limpers,         // プリフロップでリンプした人数
 *   opps: [...],     // 残っている相手（equity() 用）
 *   inPosition,      // ポストフロップで最後に行動できるか
 *   aggressor,       // 前のストリートで自分が最後のアグレッサーか
 *   iters,
 * }
 * 戻り値: { action, amount, label, acceptable:[...], reasons:[...], metrics:{...} }
 */
(function (HE) {
  'use strict';

  const pct = (x) => `${Math.round(x * 100)}%`;
  const BBs = (chips, bb) => {
    const v = chips / bb;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}BB`;
  };

  function clampRaise(to, ctx) {
    const max = ctx.myBet + ctx.stack;
    const step = ctx.bb / 2;
    let amount = Math.max(Math.round(to / step) * step, ctx.minRaiseTo);
    // 残りが少ない場合はオールイン
    if (amount >= max * 0.85) amount = max;
    return Math.min(amount, max);
  }

  function raiseLabel(ctx, amount) {
    const allIn = amount >= ctx.myBet + ctx.stack;
    if (allIn) return 'オールイン';
    return ctx.currentBet > 0 ? `レイズ（${BBs(amount, ctx.bb)}まで）` : `ベット（${BBs(amount, ctx.bb)}）`;
  }

  /* ---------- プリフロップ ---------- */

  const OPEN_TH = { UTG: 9, HJ: 8, CO: 7, BTN: 6, SB: 7, BB: 10 };

  function preflop(ctx) {
    const [c1, c2] = ctx.hole;
    const score = HE.chen(c1, c2) + (ctx.chenBonus || 0);
    const top = HE.handPct(c1, c2);
    const cls = HE.handClass(c1, c2);
    const r1 = HE.rankOf(c1), r2 = HE.rankOf(c2);
    const pair = r1 === r2;
    const isAK = Math.min(r1, r2) === 13 && Math.max(r1, r2) === 14;
    const pos = ctx.position;
    const headsUp = ctx.numPlayers === 2;
    const reasons = [];
    const metrics = { chen: score, top, cls };
    reasons.push(`${cls} はチェン・スコア ${HE.chen(c1, c2)} 点。${top <= 0.5 ? `全ハンドの上位 ${pct(top)}` : `全ハンドの下位 ${pct(1 - top + 1 / 1326)}`} の強さです。`);

    const done = (action, amount, acceptable, extra) => {
      let label;
      if (action === 'fold') label = 'フォールド';
      else if (action === 'check') label = 'チェック';
      else if (action === 'call') label = ctx.toCall ? `コール（${BBs(ctx.toCall, ctx.bb)}）` : 'チェック';
      else label = raiseLabel(ctx, amount);
      return { action, amount, label, acceptable: acceptable || [], reasons: reasons.concat(extra || []), metrics };
    };

    // --- 誰もレイズしていない ---
    if (ctx.raises === 0) {
      let th = headsUp ? (pos === 'BB' ? 9 : 5) : OPEN_TH[pos];
      const pairOpen = pair && (r1 >= 5 || ['CO', 'BTN', 'SB'].includes(pos) || headsUp);
      const sizeBB = (pos === 'SB' && !headsUp ? 3 : 2.5) + ctx.limpers;
      const to = clampRaise(sizeBB * ctx.bb, ctx);

      if (pos === 'BB' && ctx.toCall === 0) {
        if (score >= th) {
          return done('raise', to, ['check'], [`リンプした相手に対して強いハンドなので、${BBs(to, ctx.bb)}にレイズして主導権を取りましょう。`]);
        }
        return done('check', 0, [], ['BBはレイズされていなければ無料でフロップを見られます。チェックでOK。']);
      }

      if (score >= th || pairOpen) {
        const why = ctx.limpers
          ? `リンパーが ${ctx.limpers} 人いるので、少し大きめの ${BBs(to, ctx.bb)} にアイソレート（孤立させる）レイズ。`
          : `${pos} からのオープンレイズ基準（チェン ${th} 点以上）を満たしています。${BBs(to, ctx.bb)}にレイズして参加しましょう。`;
        const extra = [why];
        if (pair && score < th) extra.push('ポケットペアはセットになれば大きく勝てるので、後ろのポジションなら参加する価値があります。');
        extra.push('リンプ（BBと同額でのコール）より、レイズで入る方が主導権を握れて有利です。');
        return done('raise', to, [], extra);
      }

      // リンパーがいて、後ろのポジションで投機的なハンド
      if (ctx.limpers > 0 && ['CO', 'BTN', 'SB'].includes(pos) && score >= th - 2) {
        return done('call', 0, ['fold'], ['リンパーがいて安く参加できるので、後ろのポジションならリンプで様子を見るのもアリです。']);
      }
      return done('fold', 0, [], [`${pos} から参加するにはチェン ${th} 点以上が目安。このハンドはフォールドで損失を防ぎましょう。`, '弱いハンドを降りることが、長期的に勝つための一番の近道です。']);
    }

    // --- レイズが1回入っている ---
    const potOdds = ctx.toCall / (ctx.pot + ctx.toCall);
    metrics.potOdds = potOdds;
    const effStack = Math.min(ctx.stack, ctx.maxOppStack || ctx.stack);

    if (ctx.raises === 1) {
      const threeBet = clampRaise(ctx.currentBet * (ctx.inPosition ? 3 : 3.5), ctx);
      if (score >= 11 || isAK) {
        return done('raise', threeBet, ['call'], [`プレミアムハンドです。${BBs(threeBet, ctx.bb)}に3ベットしてポットを大きくしましょう。`]);
      }
      let callTh = pos === 'BB' ? (ctx.toCall <= 2 * ctx.bb ? 7 : 8) : pos === 'SB' ? 10 : 9;
      if (headsUp) callTh -= 2;
      if (score >= callTh) {
        const extra = [`レイズに対してコールできる強さ（${callTh} 点以上）があります。`];
        if (pos === 'BB') extra.push(`BBはすでに1BB払っているので、${pct(potOdds)}の勝率があればコールが割に合います。`);
        return done('call', 0, score >= 10 ? ['raise'] : ['fold'], extra);
      }
      if (pair && ctx.toCall <= 4 * ctx.bb && effStack >= ctx.toCall * 15) {
        return done('call', 0, ['fold'], [
          'ペアはフロップでセット（スリーカード）になる確率が約12%（8回に1回）。',
          `相手のスタックが深い（コール額の15倍以上）ので、セットを狙うコールが割に合います。これを「セットマイニング」と言います。`,
          'フロップでセットにならなければ、基本的には降りましょう。',
        ]);
      }
      if (pos === 'BB' && ctx.toCall <= ctx.bb * 1.5 && score >= 5) {
        return done('call', 0, ['fold'], [`ミニレイズに対してBBは ${pct(potOdds)} の勝率があれば良い値段。コールで守りましょう。`]);
      }
      return done('fold', 0, [], ['レイズした相手は強いハンドを持っていることが多いです。', `このハンドでは勝負するには弱いのでフォールド。`]);
    }

    // --- 3ベット以上 ---
    const fourBet = clampRaise(ctx.currentBet * 2.3, ctx);
    if (score >= 14 || (score >= 12 && pair)) {
      return done('raise', fourBet, ['call'], ['3ベット以上の争いでも、QQ以上は自信を持ってさらにレイズできます。']);
    }
    if (score >= 11 || isAK) {
      return done('call', 0, ['raise', 'fold'], ['強いハンドですが、何度もレイズされた相手にはQQ+やAKが多い。コールで様子を見ましょう。']);
    }
    return done('fold', 0, [], ['何度もレイズが入ったポットは相手のレンジがとても強いです。', 'ここではトップクラスのハンド以外はフォールドが正解です。']);
  }

  /* ---------- フロップ以降 ---------- */

  function postflop(ctx) {
    const { hole, board } = ctx;
    const opps = ctx.opps;
    const n = Math.max(1, opps.length);
    const eq = HE.equity(hole, board, opps, ctx.iters || 1500);
    const made = HE.evaluate(hole.concat(board));
    const dr = HE.draws(hole, board);
    const valueTh = n === 1 ? 0.6 : n === 2 ? 0.5 : 0.42;
    const strongTh = valueTh + 0.17;
    const potOdds = ctx.toCall > 0 ? ctx.toCall / (ctx.pot + ctx.toCall) : 0;
    const metrics = { equity: eq, potOdds, made: HE.describe(made), draws: dr.names, outs: dr.outs, valueTh };
    const reasons = [];

    reasons.push(`現在の役：${HE.describe(made)}${made.cat >= 1 && !HE.improvesBoard(hole, board) ? '（ボードの役を使っているだけ）' : ''}`);
    if (dr.outs) {
      const cardsLeft = ctx.street === 'flop' ? 2 : 1;
      const approx = Math.min(dr.outs * (cardsLeft === 2 ? 4 : 2), 100);
      reasons.push(`${dr.names.join('＋')}：アウツ ${dr.outs} 枚。「2と4の法則」で完成率はおよそ ${approx}%。`);
    }
    reasons.push(`相手 ${n} 人に対する推定勝率は ${pct(eq)}（${n === 1 ? '1対1なら50%が互角' : `${n + 1}人なら${pct(1 / (n + 1))}が互角`}）。`);

    const done = (action, amount, acceptable, extra) => {
      let label;
      if (action === 'fold') label = 'フォールド';
      else if (action === 'check') label = 'チェック';
      else if (action === 'call') label = `コール（${BBs(ctx.toCall, ctx.bb)}）`;
      else label = raiseLabel(ctx, amount);
      return { action, amount, label, acceptable: acceptable || [], reasons: reasons.concat(extra || []), metrics };
    };

    const potSize = (f) => clampRaise(ctx.currentBet + Math.round((ctx.pot + ctx.toCall) * f), ctx);

    // ---- 誰もベットしていない ----
    if (ctx.toCall === 0) {
      if (eq >= strongTh) {
        const amt = potSize(0.75);
        return done('raise', amt, ['check'], ['かなり強いハンドです。ポットの3/4程度をベットして、弱いハンドからもチップを取りましょう（バリューベット）。']);
      }
      if (eq >= valueTh) {
        const amt = potSize(0.6);
        return done('raise', amt, ['check'], [`勝率が目安（${pct(valueTh)}）を上回っています。ポットの半分〜2/3をベットしてバリューを取りましょう。`]);
      }
      if (dr.outs >= 8 && ctx.street !== 'river') {
        const amt = potSize(0.5);
        return done('raise', amt, ['check'], ['強いドローはセミブラフのチャンス。相手が降りれば勝ち、コールされても完成すれば勝てます。']);
      }
      if (ctx.aggressor && n === 1 && ctx.street === 'flop' && eq >= 0.3) {
        const amt = potSize(0.33);
        return done('raise', amt, ['check'], ['プリフロップでレイズしたのはあなたなので、小さめのコンティニュエーションベット（Cベット）が有効です。']);
      }
      return done('check', 0, [], [ctx.street === 'river' ? 'リバーでは弱いハンドでベットしても強いハンドにしかコールされません。チェックで安く見ましょう。' : '強くもドローでもないので、チェックで無料のカードを見ましょう。']);
    }

    // ---- ベットに直面している ----
    reasons.push(`ポットオッズ：${BBs(ctx.toCall, ctx.bb)}を払って ${BBs(ctx.pot + ctx.toCall, ctx.bb)}を取りにいく → 必要勝率 ${pct(potOdds)}。`);
    if (eq >= strongTh) {
      const amt = clampRaise(ctx.currentBet * 3, ctx);
      return done('raise', amt, ['call'], ['勝率が高いのでレイズしてポットを大きくしましょう。']);
    }
    if (eq >= potOdds + 0.03) {
      const acc = eq >= valueTh ? ['raise'] : [];
      return done('call', 0, acc, [`勝率 ${pct(eq)} が必要勝率 ${pct(potOdds)} を上回るので、コールは長期的にプラスです。`]);
    }
    const implied = dr.outs >= 8 && ctx.street !== 'river' && ctx.toCall <= ctx.stack * 0.2;
    if (implied && eq + 0.07 >= potOdds) {
      return done('call', 0, ['fold'], ['今の勝率だけでは少し足りませんが、ドローが完成したときに追加でチップを取れる見込み（インプライドオッズ）があるのでコールできます。']);
    }
    if (eq >= potOdds - 0.03) {
      return done('fold', 0, ['call'], [`勝率 ${pct(eq)} と必要勝率 ${pct(potOdds)} がほぼ同じ。ギリギリなのでどちらでも大差ありません。`]);
    }
    return done('fold', 0, [], [`勝率 ${pct(eq)} が必要勝率 ${pct(potOdds)} に届きません。コールし続けると長期的に損をします。`]);
  }

  function advise(ctx) {
    return ctx.street === 'preflop' ? preflop(ctx) : postflop(ctx);
  }

  /* プレイヤーのアクションを採点する */
  function grade(rec, action) {
    if (action === rec.action) return 'good';
    if (rec.acceptable.includes(action)) return 'ok';
    return 'bad';
  }

  Object.assign(HE, { advise, grade, BBs, pct });
})(typeof window !== 'undefined' ? window.HE : globalThis.HE);
