/* CPU の対戦相手。コーチの判断をベースに、性格ごとのブレを加える */
(function (HE) {
  'use strict';

  const BOT_PROFILES = [
    { name: 'タケシ', style: '堅実', loose: -1, aggr: 0.35, bluff: 0.05, sticky: 0.05 },
    { name: 'ミホ', style: '攻撃的', loose: 1, aggr: 0.8, bluff: 0.25, sticky: 0.1 },
    { name: 'ケン', style: 'コール好き', loose: 2, aggr: 0.2, bluff: 0.05, sticky: 0.4 },
    { name: 'サクラ', style: 'バランス', loose: 0, aggr: 0.55, bluff: 0.12, sticky: 0.12 },
    { name: 'ゴロー', style: 'ルーズ', loose: 2, aggr: 0.6, bluff: 0.2, sticky: 0.25 },
  ];

  function decide(p, ctx, rng = Math.random) {
    const st = p.profile;
    const noise = ctx.street === 'preflop' ? Math.round((rng() - 0.5) * 2) : 0;
    const rec = HE.advise({ ...ctx, iters: 350, chenBonus: st.loose + noise });
    let action = rec.action, amount = rec.amount;
    const eq = rec.metrics.equity;
    const pot = ctx.pot + ctx.toCall;

    if (action === 'fold' && ctx.toCall > 0) {
      const cheap = ctx.toCall <= ctx.bb || ctx.toCall / (pot) < 0.2;
      if (rng() < st.sticky * (cheap ? 2 : 1)) action = 'call';
    } else if (action === 'raise' && rng() < (1 - st.aggr) * 0.35) {
      action = ctx.toCall > 0 ? 'call' : 'check';
    } else if (action === 'check' && ctx.street !== 'preflop' && rng() < st.bluff) {
      action = 'raise';
      amount = ctx.currentBet + Math.round(pot * (0.4 + rng() * 0.4));
    } else if (action === 'call' && ctx.street !== 'preflop' && eq > 0.45 && rng() < st.aggr * 0.3) {
      action = 'raise';
      amount = ctx.currentBet * 2.5;
    }

    // 合法手に丸める
    const max = ctx.myBet + ctx.stack;
    if (action === 'call' && ctx.toCall === 0) action = 'check';
    if (action === 'check' && ctx.toCall > 0) action = 'fold';
    if (action === 'raise') {
      if (ctx.stack <= ctx.toCall) action = 'call';
      else {
        const step = ctx.bb / 2;
        amount = Math.round(amount / step) * step;
        amount = Math.min(Math.max(amount, ctx.minRaiseTo), max);
      }
    }
    return { action, amount };
  }

  Object.assign(HE, { BOT_PROFILES, botDecide: decide });
})(typeof window !== 'undefined' ? window.HE : globalThis.HE);
