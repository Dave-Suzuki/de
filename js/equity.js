/* ハンドの強さ指標と勝率（エクイティ）計算 */
(function (HE) {
  'use strict';
  const { rankOf, suitOf, evaluate, score } = HE;

  /* チェン・フォーミュラ: プリフロップのスターティングハンドを点数化する定番の方法 */
  function chen(c1, c2) {
    let hi = rankOf(c1), lo = rankOf(c2);
    if (lo > hi) { const t = hi; hi = lo; lo = t; }
    const base = (r) => ({ 14: 10, 13: 8, 12: 7, 11: 6 }[r] || r / 2);
    if (hi === lo) return Math.max(5, Math.ceil(base(hi) * 2));
    let s = base(hi);
    if (suitOf(c1) === suitOf(c2)) s += 2;
    const gap = hi - lo - 1;
    s -= [0, 1, 2, 4][gap] ?? 5;
    if (gap <= 1 && hi < 12) s += 1;
    return Math.ceil(s);
  }

  /* 全 1326 通りのうち「このハンド以上」の割合（上位何%か） */
  const pctTable = (() => {
    const combos = [];
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
      // 同点はハイカードの強さで細かく並べる
      combos.push({ a, b, v: chen(a, b) * 1000 + Math.max(rankOf(a), rankOf(b)) * 20 + Math.min(rankOf(a), rankOf(b)) });
    }
    combos.sort((x, y) => y.v - x.v);
    const table = new Float32Array(52 * 52);
    let i = 0;
    while (i < combos.length) {
      let j = i;
      while (j < combos.length && combos[j].v === combos[i].v) j++;
      const pct = j / combos.length;
      for (let k = i; k < j; k++) {
        table[combos[k].a * 52 + combos[k].b] = pct;
        table[combos[k].b * 52 + combos[k].a] = pct;
      }
      i = j;
    }
    return table;
  })();

  const handPct = (c1, c2) => pctTable[c1 * 52 + c2];

  /* ドロー検出：フラッシュドロー、オープンエンド、ガットショット */
  function draws(hole, board) {
    const res = { flushDraw: false, oesd: false, gutshot: false, outs: 0, names: [] };
    if (board.length < 3 || board.length >= 5) return res;
    const all = hole.concat(board);
    const madeCat = evaluate(all).cat;

    // フラッシュドロー（自分のカードを少なくとも1枚含む4枚同スート）
    if (madeCat < 5) {
      for (let s = 0; s < 4; s++) {
        const n = all.filter((c) => suitOf(c) === s).length;
        const mine = hole.filter((c) => suitOf(c) === s).length;
        if (n === 4 && mine >= 1) { res.flushDraw = true; res.outs += 9; res.names.push('フラッシュドロー'); }
      }
    }

    // ストレートドロー：次の1枚でストレートになるランクを数える
    if (madeCat < 4) {
      let mask = 0, boardMask = 0;
      for (const c of all) mask |= 1 << rankOf(c);
      for (const c of board) boardMask |= 1 << rankOf(c);
      const completing = [];
      for (let r = 2; r <= 14; r++) {
        if (mask & (1 << r)) continue;
        const h = HE.straightHigh(mask | (1 << r));
        // ボードだけでストレートになるなら自分のドローではない
        if (h && !HE.straightHigh(boardMask | (1 << r))) completing.push(r);
      }
      if (completing.length >= 2) {
        res.oesd = true; res.names.push('オープンエンド・ストレートドロー');
        res.outs += res.flushDraw ? 6 : 8;
      } else if (completing.length === 1) {
        res.gutshot = true; res.names.push('ガットショット');
        res.outs += res.flushDraw ? 3 : 4;
      }
    }
    return res;
  }

  /* 自分のホールカードが役に絡んでいるか（ボードだけの役より強いか） */
  function improvesBoard(hole, board) {
    if (board.length < 3) return true;
    const withHole = evaluate(hole.concat(board));
    const boardOnly = evaluate(board);
    return withHole.cat > boardOnly.cat || (withHole.cat >= 1 && withHole.ranks[0] !== boardOnly.ranks[0] && withHole.cat === boardOnly.cat);
  }

  /*
   * モンテカルロで勝率を計算する。
   * opps: [{ known?: [c,c], range?: 0..1 (上位何%を想定), aggressive?: bool }]
   * aggressive = このストリートでベット/レイズした相手。ボードに絡んだハンドに寄せて推定する。
   */
  function equity(hole, board, opps, iters = 1500, rng = Math.random) {
    const used = new Uint8Array(52);
    for (const c of hole) used[c] = 1;
    for (const c of board) used[c] = 1;
    for (const o of opps) if (o.known) for (const c of o.known) used[c] = 1;
    const base = [];
    for (let i = 0; i < 52; i++) if (!used[i]) base.push(i);

    const need = 5 - board.length;
    let win = 0, tie = 0, total = 0;
    const deck = base.slice();
    const oppHands = new Array(opps.length);

    for (let it = 0; it < iters; it++) {
      // 山札を元に戻す
      for (let i = 0; i < base.length; i++) deck[i] = base[i];
      let top = deck.length;
      const draw = () => {
        const j = Math.floor(rng() * top);
        const c = deck[j];
        deck[j] = deck[--top];
        deck[top] = c;
        return c;
      };
      const unDraw = (n) => { top += n; };

      for (let k = 0; k < opps.length; k++) {
        const o = opps[k];
        if (o.known) { oppHands[k] = o.known; continue; }
        let a, b, tries = 0;
        for (;;) {
          a = draw(); b = draw();
          tries++;
          if (tries > 25) break;
          if (o.range != null && o.range < 1 && handPct(a, b) > o.range) { unDraw(2); continue; }
          if (o.aggressive && board.length >= 3 && rng() > 0.3) {
            // ベットしてきた相手は、多くの場合ボードに絡んでいるかドローがある
            const hand = [a, b];
            if (!improvesBoard(hand, board) && !draws(hand, board).outs) { unDraw(2); continue; }
          }
          break;
        }
        oppHands[k] = [a, b];
      }

      const full = board.slice();
      for (let i = 0; i < need; i++) full.push(draw());

      const my = score(hole.concat(full));
      let best = -1, ties = 0;
      for (let k = 0; k < opps.length; k++) {
        const s = score(oppHands[k].concat(full));
        if (s > best) { best = s; ties = 1; } else if (s === best) ties++;
      }
      if (my > best) win++;
      else if (my === best) tie += 1 / (ties + 1);
      total++;
    }
    return total ? (win + tie) / total : 0;
  }

  Object.assign(HE, { chen, handPct, draws, improvesBoard, equity });
})(typeof window !== 'undefined' ? window.HE : globalThis.HE);
