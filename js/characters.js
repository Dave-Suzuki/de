/* 対戦相手のキャラクター（SVG の似顔絵）とセリフ */
(function (HE) {
  'use strict';

  const SKIN = {
    light: ['#f6d5bd', '#e2b597'],
    warm: ['#eebf9c', '#d39d77'],
    tan: ['#c98d63', '#a87048'],
  };

  // 各キャラの見た目。髪は後ろ（顔の奥）と前（前髪）に分けて描く
  const LOOKS = {
    タケシ: {
      bg: '#4b6f93', skin: 'light', base: 'neutral', cloth: '#26344f',
      hairColor: '#28221f',
      hairBack: '',
      hairFront: 'M33 52 C31 28 50 19 63 21 C79 22 91 33 87 52 C84 41 76 35 67 35 C60 40 45 37 36 46 Z',
      extra: `
        <path d="M49 86 L60 100 L71 86 Z" fill="#f2f2ee"/>
        <path d="M57 88 L63 88 L62 104 L60 107 L58 104 Z" fill="#b8343c"/>
        <g fill="none" stroke="#2b2b2b" stroke-width="2.2">
          <rect x="40.5" y="48" width="18" height="14" rx="5"/>
          <rect x="61.5" y="48" width="18" height="14" rx="5"/>
          <path d="M58.5 54 Q60 52.5 61.5 54"/>
        </g>
        <path d="M43 50 L55 50" stroke="#ffffff" stroke-width="1.4" opacity=".45"/>`,
    },
    ミホ: {
      bg: '#a8404c', skin: 'light', base: 'smirk', cloth: '#1d1b22', lips: '#b3263a',
      hairColor: '#6e2428',
      hairBack: 'M28 60 C22 30 40 15 60 17 C82 15 100 32 94 62 C99 80 97 97 88 106 L32 106 C22 95 22 78 28 60 Z',
      hairFront: 'M34 50 C34 30 50 22 64 24 C80 26 88 38 86 52 C78 40 66 34 56 38 C48 42 40 44 34 50 Z',
      extra: `
        <g>
          <rect x="39" y="26" width="18" height="9" rx="4" fill="#15151a" stroke="#e3b04b" stroke-width="1.4"/>
          <rect x="63" y="26" width="18" height="9" rx="4" fill="#15151a" stroke="#e3b04b" stroke-width="1.4"/>
          <path d="M57 30 L63 30" stroke="#e3b04b" stroke-width="1.4"/>
        </g>
        <path d="M44 88 Q60 96 76 88" stroke="#e3b04b" stroke-width="1.6" fill="none"/>
        <circle cx="60" cy="95" r="2.6" fill="#e3b04b"/>
        <path d="M44 51 L41 49 M76 51 L79 49" stroke="#28221f" stroke-width="1.6" stroke-linecap="round"/>`,
    },
    ケン: {
      bg: '#d99a3a', skin: 'warm', base: 'smile', cloth: '#3f8a5a', round: true,
      hairColor: '#4a3322',
      hairBack: '',
      hairFront: 'M34 50 C36 44 40 42 44 44 L76 44 C80 42 85 44 86 50 L86 44 L34 44 Z',
      extra: `
        <path d="M31 46 C30 22 90 22 89 46 Z" fill="#e0612c"/>
        <path d="M31 46 C45 41 75 41 89 46 L89 48 C75 44 45 44 31 48 Z" fill="#b84a1f"/>
        <path d="M60 45 C74 41 98 42 103 48 C93 51 72 51 60 48 Z" fill="#c9521f"/>
        <circle cx="60" cy="24" r="3" fill="#b84a1f"/>
        <path d="M52 34 L68 34" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity=".85"/>
        <g fill="#b9724b" opacity=".7">
          <circle cx="44" cy="62" r="1"/><circle cx="47" cy="65" r="1"/><circle cx="42" cy="66" r="1"/>
          <circle cx="76" cy="62" r="1"/><circle cx="73" cy="65" r="1"/><circle cx="78" cy="66" r="1"/>
        </g>
        <path d="M46 88 L46 106 M74 88 L74 106" stroke="#2e6a44" stroke-width="2"/>`,
    },
    サクラ: {
      bg: '#cf85a1', skin: 'light', base: 'smile', cloth: '#f1ece4',
      hairColor: '#4d2b3d',
      hairBack: 'M30 58 C26 30 44 19 60 19 C76 19 94 30 90 58 L92 83 C84 87 78 85 76 80 L44 80 C42 85 36 87 28 83 Z',
      hairFront: 'M34 48 C34 30 48 23 60 23 C74 23 86 30 86 48 L80 43 L74 47 L67 42 L60 47 L53 42 L46 47 L40 43 Z',
      extra: `
        <g transform="translate(80 33)">
          <g fill="#ffb7cf" stroke="#e17aa0" stroke-width=".8">
            <ellipse cx="0" cy="-5" rx="3.4" ry="4.4"/>
            <ellipse cx="0" cy="-5" rx="3.4" ry="4.4" transform="rotate(72)"/>
            <ellipse cx="0" cy="-5" rx="3.4" ry="4.4" transform="rotate(144)"/>
            <ellipse cx="0" cy="-5" rx="3.4" ry="4.4" transform="rotate(216)"/>
            <ellipse cx="0" cy="-5" rx="3.4" ry="4.4" transform="rotate(288)"/>
          </g>
          <circle r="2.2" fill="#f6d36b"/>
        </g>
        <path d="M44 86 L60 96 L76 86 L72 92 L60 100 L48 92 Z" fill="#e58fae"/>`,
    },
    ゴロー: {
      bg: '#7d5a2c', skin: 'tan', base: 'grin', cloth: '#5b3a8c',
      hairColor: '#2d1d12',
      hairBack: '',
      hairFront: 'M50 36 C46 18 54 6 60 4 C66 8 72 18 70 36 C66 32 54 32 50 36 Z',
      extra: `
        <path d="M36 44 C38 36 46 32 52 34 L52 40 C46 40 40 42 36 48 Z M84 44 C82 36 74 32 68 34 L68 40 C74 40 80 42 84 48 Z" fill="#2d1d12" opacity=".35"/>
        <path d="M34 58 C36 82 48 92 60 92 C72 92 84 82 86 58 C82 70 74 76 60 76 C46 76 38 70 34 58 Z" fill="#2d1d12"/>
        <path d="M48 66 C52 62 58 63 60 65 C62 63 68 62 72 66 C68 67 64 67 60 66.5 C56 67 52 67 48 66 Z" fill="#2d1d12"/>
        <circle cx="87" cy="66" r="2.2" fill="#e3b04b"/>
        <path d="M40 92 Q60 108 80 92" stroke="#e3b04b" stroke-width="2.4" fill="none" stroke-dasharray="3 2"/>
        <path d="M52 86 L60 96 L68 86" fill="none" stroke="#3d2660" stroke-width="2"/>`,
    },
  };

  const MOUTHS = `
    <path class="m m-neutral" d="M53 70 Q60 71.5 67 70" stroke="#6b3a2e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path class="m m-smile" d="M51 67 Q60 76 69 67" stroke="#6b3a2e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path class="m m-grin" d="M50 66 Q60 81 70 66 Z" fill="#7a2e2e" stroke="#6b3a2e" stroke-width="1.5" stroke-linejoin="round"/>
    <path class="m m-grin" d="M52 67 L68 67 L67 69.5 L53 69.5 Z" fill="#ffffff"/>
    <ellipse class="m m-open" cx="60" cy="71" rx="5" ry="6.5" fill="#7a2e2e"/>
    <path class="m m-frown" d="M52 73 Q60 66 68 73" stroke="#6b3a2e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path class="m m-smirk" d="M52 70 Q62 73 69 65" stroke="#6b3a2e" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;

  function svg(name) {
    const L = LOOKS[name];
    if (!L) return '';
    const [skin, shade] = SKIN[L.skin];
    const rx = L.round ? 28 : 26;
    const mouth = L.lips ? MOUTHS.replace(/#6b3a2e/g, L.lips) : MOUTHS;
    return `<svg viewBox="0 0 120 120" class="avatar-svg" aria-hidden="true">
      <circle cx="60" cy="60" r="60" fill="${L.bg}"/>
      <circle cx="60" cy="60" r="60" fill="url(#av-sheen)" opacity=".5"/>
      <g class="av-body">
        <path d="M16 122 C18 94 38 84 60 84 C82 84 102 94 104 122 Z" fill="${L.cloth}"/>
        <path d="M52 72 L68 72 L68 86 Q60 91 52 86 Z" fill="${shade}"/>
      </g>
      <g class="av-head">
        ${L.hairBack ? `<path d="${L.hairBack}" fill="${L.hairColor}"/>` : ''}
        <ellipse cx="${60 - rx - 1}" cy="58" rx="5" ry="7" fill="${skin}"/>
        <ellipse cx="${60 + rx + 1}" cy="58" rx="5" ry="7" fill="${skin}"/>
        <ellipse cx="60" cy="55" rx="${rx}" ry="28" fill="${skin}"/>
        <g class="av-blush"><ellipse cx="45" cy="64" rx="5" ry="3" fill="#f08a8a" opacity=".4"/><ellipse cx="75" cy="64" rx="5" ry="3" fill="#f08a8a" opacity=".4"/></g>
        <g class="av-look"><g class="av-eyes">
          <ellipse cx="50" cy="55" rx="3" ry="3.8" fill="#1d1a19"/>
          <ellipse cx="70" cy="55" rx="3" ry="3.8" fill="#1d1a19"/>
          <circle cx="51" cy="53.6" r="1" fill="#fff"/><circle cx="71" cy="53.6" r="1" fill="#fff"/>
        </g></g>
        <g class="av-brows" stroke="${L.hairColor}" stroke-width="2.6" fill="none" stroke-linecap="round">
          <path class="brow-l" d="M44 46 Q50 43 55 46"/>
          <path class="brow-r" d="M65 46 Q70 43 76 46"/>
        </g>
        ${mouth}
        <path d="${L.hairFront}" fill="${L.hairColor}"/>
        ${L.extra}
      </g>
    </svg>`;
  }

  // SVG 共通のグラデーション（ページに1回だけ置く）
  const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <radialGradient id="av-sheen" cx="35%" cy="25%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs></svg>`;

  // 気分ごとの口の形
  function mouthFor(name, mood) {
    const base = (LOOKS[name] || {}).base || 'neutral';
    return {
      idle: base, think: 'neutral', check: base === 'grin' ? 'smile' : base, call: base,
      bet: 'smirk', raise: 'smirk', allin: 'open', fold: 'frown', win: 'grin', lose: 'frown',
    }[mood] || base;
  }

  const LINES = {
    タケシ: {
      fold: ['ここは降ります。', '無理はしません。'], check: ['チェックで。', '様子を見ます。'],
      call: ['コールで。', 'ついていきます。'], bet: ['ベットします。', '取りにいきます。'],
      raise: ['しっかりレイズします。', 'ここはレイズで。'], allin: ['…勝負です。'],
      win: ['計算どおりです。', 'いただきます。'],
    },
    ミホ: {
      fold: ['今回は譲ってあげる。', 'ふん、降りるわ。'], check: ['…チェック。', 'どうぞ？'],
      call: ['ふーん、コール。', '見せてもらうわ。'], bet: ['ベット。降りたら？', 'さあ、どうする？'],
      raise: ['レイズ！ついて来られる？', '上乗せよ！'], allin: ['オールイン！勝負よ！'],
      win: ['当然ね！', 'ごちそうさま♪'],
    },
    ケン: {
      fold: ['うーん、降りるか…', 'ちぇっ、フォールド。'], check: ['チェックで〜', 'とりあえずチェック！'],
      call: ['とりあえずコール！', 'まだ見たい！コール！'], bet: ['ベットしちゃお！'],
      raise: ['たまにはレイズ！', 'いっちゃえ、レイズ！'], allin: ['えいっ、全部！'],
      win: ['やったー！', 'ラッキー！'],
    },
    サクラ: {
      fold: ['フォールドです。', '今回は見送りますね。'], check: ['チェックで。'],
      call: ['コールしますね。'], bet: ['ベットします。'],
      raise: ['レイズします。', 'ここは強気で。'], allin: ['オールインです！'],
      win: ['ありがとうございます♪', 'うれしいです！'],
    },
    ゴロー: {
      fold: ['チッ、降りだ。', '今回はくれてやる。'], check: ['様子見だ。', 'チェックだ。'],
      call: ['乗った！', 'コールだ、見せてみろ。'], bet: ['ベットだ！'],
      raise: ['レイズだァ！', 'もっと積むぜ！'], allin: ['全部いくぜ！'],
      win: ['ガッハッハ！', 'いただきだ！'],
    },
  };

  function line(name, type) {
    const set = LINES[name] && LINES[name][type];
    if (!set) return '';
    return set[Math.floor(Math.random() * set.length)];
  }

  HE.chars = { svg, DEFS, mouthFor, line, LOOKS };
})(window.HE);
