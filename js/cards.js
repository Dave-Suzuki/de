/* カード表現と役判定
 * カードは 0..51 の整数。rank = (id >> 2) + 2 (2..14)、suit = id & 3 (0:♠ 1:♥ 2:♦ 3:♣)
 */
(function (HE) {
  'use strict';

  const RANK_CHARS = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const RANK_LABEL = { ...RANK_CHARS, 10: '10' };
  const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
  const SUIT_NAMES = ['spade', 'heart', 'diamond', 'club'];

  const CATEGORY_NAMES = [
    'ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート',
    'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ',
  ];

  const rankOf = (c) => (c >> 2) + 2;
  const suitOf = (c) => c & 3;
  const makeCard = (rank, suit) => ((rank - 2) << 2) | suit;

  function cardText(c) {
    return RANK_CHARS[rankOf(c)] + SUIT_SYMBOLS[suitOf(c)];
  }

  function newDeck() {
    const d = [];
    for (let i = 0; i < 52; i++) d.push(i);
    return d;
  }

  function shuffle(arr, rng = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ランクのビットマスクから最高位ストレートのトップランクを返す（なければ 0）
  function straightHigh(mask) {
    if (mask & (1 << 14)) mask |= 1 << 1; // A を 1 としても扱う
    for (let h = 14; h >= 5; h--) {
      if (((mask >> (h - 4)) & 31) === 31) return h;
    }
    return 0;
  }

  function topRanks(mask, n, exclude = []) {
    const out = [];
    for (let r = 14; r >= 2 && out.length < n; r--) {
      if ((mask & (1 << r)) && !exclude.includes(r)) out.push(r);
    }
    return out;
  }

  function encode(cat, ranks) {
    let v = cat;
    for (let i = 0; i < 5; i++) v = v * 15 + (ranks[i] || 0);
    return v;
  }

  /* 5〜7 枚から最強の役を判定し、比較可能なスコアを返す */
  function evaluate(cards) {
    const rc = new Array(15).fill(0);
    const suitMask = [0, 0, 0, 0];
    const suitCount = [0, 0, 0, 0];
    let rankMask = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const r = (c >> 2) + 2, s = c & 3;
      rc[r]++;
      suitCount[s]++;
      suitMask[s] |= 1 << r;
      rankMask |= 1 << r;
    }

    let flushSuit = -1;
    for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flushSuit = s;

    if (flushSuit >= 0) {
      const sf = straightHigh(suitMask[flushSuit]);
      if (sf) return { score: encode(8, [sf]), cat: 8, ranks: [sf] };
    }

    const quads = [], trips = [], pairs = [];
    for (let r = 14; r >= 2; r--) {
      if (rc[r] === 4) quads.push(r);
      else if (rc[r] === 3) trips.push(r);
      else if (rc[r] === 2) pairs.push(r);
    }

    if (quads.length) {
      const k = topRanks(rankMask, 1, [quads[0]]);
      return { score: encode(7, [quads[0], k[0]]), cat: 7, ranks: [quads[0], k[0]] };
    }
    if (trips.length && (trips.length > 1 || pairs.length)) {
      const t = trips[0];
      const p = Math.max(trips[1] || 0, pairs[0] || 0);
      return { score: encode(6, [t, p]), cat: 6, ranks: [t, p] };
    }
    if (flushSuit >= 0) {
      const f = topRanks(suitMask[flushSuit], 5);
      return { score: encode(5, f), cat: 5, ranks: f };
    }
    const st = straightHigh(rankMask);
    if (st) return { score: encode(4, [st]), cat: 4, ranks: [st] };
    if (trips.length) {
      const k = topRanks(rankMask, 2, [trips[0]]);
      const rr = [trips[0], ...k];
      return { score: encode(3, rr), cat: 3, ranks: rr };
    }
    if (pairs.length >= 2) {
      const k = topRanks(rankMask, 1, [pairs[0], pairs[1]]);
      const rr = [pairs[0], pairs[1], ...k];
      return { score: encode(2, rr), cat: 2, ranks: rr };
    }
    if (pairs.length === 1) {
      const k = topRanks(rankMask, 3, [pairs[0]]);
      const rr = [pairs[0], ...k];
      return { score: encode(1, rr), cat: 1, ranks: rr };
    }
    const h = topRanks(rankMask, 5);
    return { score: encode(0, h), cat: 0, ranks: h };
  }

  // スコア比較だけが必要な高速版
  function score(cards) {
    return evaluate(cards).score;
  }

  function describe(ev) {
    const R = (r) => RANK_LABEL[r];
    switch (ev.cat) {
      case 8: return ev.ranks[0] === 14 ? 'ロイヤルフラッシュ' : `ストレートフラッシュ（${R(ev.ranks[0])}ハイ）`;
      case 7: return `フォーカード（${R(ev.ranks[0])}）`;
      case 6: return `フルハウス（${R(ev.ranks[0])} と ${R(ev.ranks[1])}）`;
      case 5: return `フラッシュ（${R(ev.ranks[0])}ハイ）`;
      case 4: return `ストレート（${R(ev.ranks[0])}ハイ）`;
      case 3: return `スリーカード（${R(ev.ranks[0])}）`;
      case 2: return `ツーペア（${R(ev.ranks[0])} と ${R(ev.ranks[1])}）`;
      case 1: return `ワンペア（${R(ev.ranks[0])}）`;
      default: return `ハイカード（${R(ev.ranks[0])}）`;
    }
  }

  // "AKs" / "T9o" / "77" のような表記
  function handClass(c1, c2) {
    let a = rankOf(c1), b = rankOf(c2);
    if (b > a) { const t = a; a = b; b = t; }
    if (a === b) return RANK_CHARS[a] + RANK_CHARS[b];
    return RANK_CHARS[a] + RANK_CHARS[b] + (suitOf(c1) === suitOf(c2) ? 's' : 'o');
  }

  Object.assign(HE, {
    RANK_CHARS, RANK_LABEL, SUIT_SYMBOLS, SUIT_NAMES, CATEGORY_NAMES,
    rankOf, suitOf, makeCard, cardText, newDeck, shuffle,
    evaluate, score, describe, handClass, straightHigh,
  });
})(typeof window !== 'undefined' ? (window.HE = window.HE || {}) : (globalThis.HE = globalThis.HE || {}));
