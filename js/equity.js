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
        // ボードだけでできるストレートより高いときだけ、自分のドローとして数える
        if (h && h > HE.straightHigh(boardMask | (1 << r))) completing.push(r);
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
    if (withHole.cat !== boardOnly.cat) return withHole.cat > boardOnly.cat;
    if (withHole.cat === 0) return false; // 役なし同士は「絡んでいる」とは言わない
    // 同じ役なら、キッカーまで含めて比べる（例：888KK に AA ＝ 8のフルハウス、Aペア）
    for (let i = 0; i < 5; i++) {
      const a = withHole.ranks[i] || 0, b = boardOnly.ranks[i] || 0;
      if (a !== b) return a > b;
    }
    return false;
  }

  /* ベットしてきた相手が持っていそうか：役が1段上がっているか、ドローがある */
  function connects(hand, board) {
    return evaluate(hand.concat(board)).cat > evaluate(board).cat || draws(hand, board).outs > 0;
  }

  /*
   * 相手のハンドの候補リスト。レンジ（上位何%）と「ベットしてきたか」で絞る。
   * 引いては捨てる方式だと、狭いレンジで試行が尽きてランダムな手が混ざるため、
   * あらかじめ条件に合う組み合わせを列挙しておき、その中から直接選ぶ。
   */
  const comboCache = new Map();
  function comboLists(range, aggressive, board) {
    const key = `${range}|${aggressive ? board.join(',') : ''}`;
    let v = comboCache.get(key);
    if (v) return v;
    const hit = [], miss = [];
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
      if (range < 1 && handPct(a, b) > range) continue;
      if (aggressive && !connects([a, b], board)) miss.push(a, b);
      else hit.push(a, b);
    }
    v = { hit, miss };
    if (comboCache.size > 300) comboCache.clear();
    comboCache.set(key, v);
    return v;
  }

  // ベットしてきた相手のうち、ボードに絡んでいない手（ブラフ）の比重
  const BLUFF_WEIGHT = 0.3;

  /*
   * モンテカルロで勝率を計算する。
   * opps: [{ known?: [c,c], range?: 0..1 (上位何%を想定), aggressive?: bool }]
   * aggressive = このストリートでベット/レイズした相手。ボードに絡んだハンドに寄せて推定する。
   */
  function equity(hole, board, opps, iters = 1500, rng = Math.random) {
    const dead = new Uint8Array(52);
    for (const c of hole) dead[c] = 1;
    for (const c of board) dead[c] = 1;
    for (const o of opps) if (o.known) for (const c of o.known) dead[c] = 1;

    // 相手ごとの候補（死んだカードを含む組み合わせは除く）
    const samplers = opps.map((o) => {
      if (o.known) return null;
      const narrow = o.range != null && o.range < 1;
      const agg = !!o.aggressive && board.length >= 3;
      if (!narrow && !agg) return null; // 完全ランダム
      const lists = comboLists(narrow ? o.range : 1, agg, board);
      const filt = (arr) => {
        const out = [];
        for (let i = 0; i < arr.length; i += 2) if (!dead[arr[i]] && !dead[arr[i + 1]]) out.push(arr[i], arr[i + 1]);
        return out;
      };
      const hit = filt(lists.hit), miss = filt(lists.miss);
      const wHit = hit.length, wMiss = miss.length * BLUFF_WEIGHT;
      if (!wHit && !wMiss) return null;
      return { hit, miss, pHit: wHit / (wHit + wMiss) };
    });

    const need = 5 - board.length;
    let win = 0, tie = 0, total = 0;
    const used = new Uint8Array(52);
    const oppHands = new Array(opps.length);
    const randomFree = () => {
      for (;;) { const c = Math.floor(rng() * 52); if (!used[c]) { used[c] = 1; return c; } }
    };

    for (let it = 0; it < iters; it++) {
      used.set(dead);
      for (let k = 0; k < opps.length; k++) {
        const o = opps[k];
        if (o.known) { oppHands[k] = o.known; continue; }
        const sm = samplers[k];
        if (!sm) { oppHands[k] = [randomFree(), randomFree()]; continue; }
        let hand = null;
        // 他の相手とカードがぶつかったら選び直す（候補は十分あるので通常すぐ決まる）
        for (let t = 0; t < 200 && !hand; t++) {
          let list = rng() < sm.pHit ? sm.hit : sm.miss;
          if (!list.length) list = sm.hit.length ? sm.hit : sm.miss;
          const i = Math.floor(rng() * (list.length / 2)) * 2;
          if (!used[list[i]] && !used[list[i + 1]]) hand = [list[i], list[i + 1]];
        }
        if (!hand) {
          // 候補がすべて他の相手と重なった場合：条件に合う残りを総当たりで探す
          const all = sm.hit.concat(sm.miss);
          for (let i = 0; i < all.length && !hand; i += 2) if (!used[all[i]] && !used[all[i + 1]]) hand = [all[i], all[i + 1]];
        }
        if (hand) { used[hand[0]] = 1; used[hand[1]] = 1; oppHands[k] = hand; }
        else oppHands[k] = [randomFree(), randomFree()];
      }

      const full = board.slice();
      for (let i = 0; i < need; i++) full.push(randomFree());

      const my = score(hole.concat(full));
      let best = -1, ties = 0;
      for (let k = 0; k < opps.length; k++) {
        const s2 = score(oppHands[k].concat(full));
        if (s2 > best) { best = s2; ties = 1; } else if (s2 === best) ties++;
      }
      if (my > best) win++;
      else if (my === best) tie += 1 / (ties + 1);
      total++;
    }
    return total ? (win + tie) / total : 0;
  }

  Object.assign(HE, { chen, handPct, draws, improvesBoard, connects, equity });
})(typeof window !== 'undefined' ? window.HE : globalThis.HE);
