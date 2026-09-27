/* BGM と効果音。音声ファイルを使わず Web Audio API で合成する */
(function (HE) {
  'use strict';

  let ctx = null, master, bgmBus, sfxBus, noiseBuf;
  const prefs = { bgm: true, sfx: true, volume: 0.7 };

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = prefs.volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    bgmBus = ctx.createGain(); bgmBus.gain.value = 0.16; bgmBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  /* ユーザー操作の中で呼ぶ（ブラウザの自動再生制限のため） */
  function unlock() {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (prefs.bgm) bgm.start();
  }

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  /* ---------- 音の部品 ---------- */
  function tone({ freq, type = 'sine', t = 0, dur = 0.3, gain = 0.3, attack = 0.005, bus, glide, detune = 0, filter }) {
    const now = ctx.currentTime + t;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, now + dur);
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filter;
      o.connect(f); node = f;
    }
    node.connect(g).connect(bus || sfxBus);
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  function noise({ t = 0, dur = 0.1, gain = 0.2, type = 'bandpass', freq = 3000, q = 1, sweep, bus }) {
    const now = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, now); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f).connect(g).connect(bus || sfxBus);
    src.start(now, Math.random() * 0.5);
    src.stop(now + dur + 0.05);
  }

  function clink(t, gain = 0.12) {
    const f = 2600 + Math.random() * 1400;
    tone({ freq: f, t, dur: 0.09, gain, type: 'sine' });
    tone({ freq: f * 1.51, t, dur: 0.06, gain: gain * 0.5, type: 'sine' });
    noise({ t, dur: 0.03, gain: gain * 0.6, freq: 6000, q: 2 });
  }

  /* ---------- 効果音 ---------- */
  const SFX = {
    deal(i = 0) {
      noise({ t: i * 0.07, dur: 0.09, gain: 0.25, freq: 2500, sweep: 5500, q: 0.8 });
      tone({ freq: 180, t: i * 0.07 + 0.05, dur: 0.05, gain: 0.08, type: 'triangle' });
    },
    chips(n = 2) { for (let i = 0; i < n; i++) clink(i * 0.045 + Math.random() * 0.01); },
    check() {
      [0, 0.12].forEach((t) => {
        tone({ freq: 150, t, dur: 0.1, gain: 0.35, type: 'sine', glide: 90 });
        noise({ t, dur: 0.05, gain: 0.15, type: 'lowpass', freq: 900 });
      });
    },
    fold() {
      noise({ dur: 0.28, gain: 0.22, freq: 2200, sweep: 350, q: 1.2 });
      tone({ freq: 330, dur: 0.25, gain: 0.05, type: 'triangle', glide: 200 });
    },
    call() { SFX.chips(3); },
    raise() {
      SFX.chips(5);
      tone({ freq: 392, t: 0.05, dur: 0.18, gain: 0.12, type: 'triangle' });
      tone({ freq: 587, t: 0.14, dur: 0.25, gain: 0.12, type: 'triangle' });
    },
    allin() {
      for (let i = 0; i < 10; i++) noise({ t: i * 0.035, dur: 0.05, gain: 0.08 + i * 0.012, type: 'lowpass', freq: 500 });
      [55, 59, 62, 67].forEach((n) => tone({ freq: midi(n), t: 0.38, dur: 0.7, gain: 0.09, type: 'sawtooth', filter: 1800 }));
      tone({ freq: midi(43), t: 0.38, dur: 0.6, gain: 0.25, type: 'sine' });
      SFX.chips(8);
    },
    turn() {
      tone({ freq: 1318.5, dur: 0.9, gain: 0.12, type: 'sine' });
      tone({ freq: 2637, dur: 0.5, gain: 0.03, type: 'sine' });
      tone({ freq: 1760, t: 0.12, dur: 0.9, gain: 0.1, type: 'sine' });
    },
    win() {
      [72, 76, 79, 84].forEach((n, i) => tone({ freq: midi(n), t: i * 0.09, dur: 0.35, gain: 0.14, type: 'triangle' }));
      [72, 76, 79, 83, 86].forEach((n) => tone({ freq: midi(n), t: 0.4, dur: 1.2, gain: 0.05, type: 'triangle' }));
      for (let i = 0; i < 6; i++) clink(0.45 + i * 0.07, 0.08);
    },
    lose() {
      tone({ freq: midi(67), dur: 0.3, gain: 0.1, type: 'triangle' });
      tone({ freq: midi(63), t: 0.22, dur: 0.5, gain: 0.1, type: 'triangle' });
    },
    good() {
      tone({ freq: midi(84), dur: 0.2, gain: 0.1, type: 'sine' });
      tone({ freq: midi(91), t: 0.08, dur: 0.4, gain: 0.1, type: 'sine' });
    },
    ok() { tone({ freq: midi(79), dur: 0.3, gain: 0.1, type: 'sine' }); },
    bad() {
      tone({ freq: 140, dur: 0.22, gain: 0.08, type: 'square', filter: 700 });
      tone({ freq: 118, t: 0.18, dur: 0.3, gain: 0.08, type: 'square', filter: 600 });
    },
    combo(level = 1) {
      const base = 76 + Math.min(level, 6);
      [0, 4, 7, 12].forEach((iv, i) => tone({ freq: midi(base + iv), t: i * 0.05, dur: 0.25, gain: 0.08, type: 'square', filter: 3000 }));
    },
    levelUp() {
      const seq = [[67, 0], [72, 0.14], [76, 0.28], [79, 0.42], [84, 0.6]];
      seq.forEach(([n, t]) => tone({ freq: midi(n), t, dur: 0.4, gain: 0.12, type: 'sawtooth', filter: 2400 }));
      [72, 76, 79, 84].forEach((n) => tone({ freq: midi(n), t: 0.6, dur: 1.4, gain: 0.06, type: 'triangle' }));
    },
    click() { tone({ freq: 900, dur: 0.04, gain: 0.05, type: 'triangle' }); },
    pop() { tone({ freq: 520, dur: 0.12, gain: 0.08, type: 'sine', glide: 880 }); },
  };

  function play(name, ...args) {
    if (!prefs.sfx || !ctx || ctx.state !== 'running') return;
    try { SFX[name] && SFX[name](...args); } catch (e) { /* 音が鳴らなくてもゲームは続ける */ }
  }

  /* ---------- BGM：スウィングするラウンジ・ジャズ ---------- */
  // 8小節の進行。コードは MIDI ノート（左手ボイシング）とベースのルート
  const PROG = [
    { root: 38, notes: [53, 57, 60, 64] },       // Dm9
    { root: 43, notes: [53, 57, 59, 64] },       // G13
    { root: 36, notes: [52, 55, 59, 62] },       // Cmaj9
    { root: 45, notes: [55, 58, 61, 64] },       // A7(b9)
    { root: 41, notes: [52, 57, 60, 64] },       // Fmaj7
    { root: 41, notes: [51, 56, 60, 62] },       // Fm6
    { root: 40, notes: [50, 55, 59, 62] },       // Em7
    { root: 45, notes: [49, 55, 58, 64] },       // A7alt
  ];
  const SCALE = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76];
  const TEMPO = 96;

  const bgm = {
    timer: null,
    step: 0,
    nextTime: 0,
    lastMel: 67,
    start() {
      if (!ctx || this.timer) return;
      this.nextTime = ctx.currentTime + 0.1;
      this.step = 0;
      this.timer = setInterval(() => this.schedule(), 30);
    },
    stop() {
      clearInterval(this.timer);
      this.timer = null;
    },
    schedule() {
      const beat = 60 / TEMPO;
      while (this.nextTime < ctx.currentTime + 0.15) {
        const s = this.step % 64;           // 8小節 × 8分音符
        const bar = Math.floor(s / 8);
        const e = s % 8;                    // 小節内の8分音符
        const swing = e % 2 === 1 ? beat * 0.16 : 0;
        const t = this.nextTime + swing - ctx.currentTime;
        this.note(PROG[bar], PROG[(bar + 1) % 8], e, t, beat);
        this.nextTime += beat / 2;
        this.step++;
      }
    },
    note(chord, next, e, t, beat) {
      const B = bgmBus;
      // ライド・シンバル（チン・チッキ・チン）
      if (e % 2 === 0 || e === 3 || e === 7) noise({ t, dur: e % 2 ? 0.06 : 0.14, gain: e % 2 ? 0.05 : 0.08, type: 'highpass', freq: 7000, bus: B });
      // ブラシのスネア（2・4拍）
      if (e === 2 || e === 6) noise({ t, dur: 0.18, gain: 0.05, freq: 1800, q: 0.5, bus: B });
      // ウォーキング・ベース（4分音符）
      if (e % 2 === 0) {
        const q = e / 2;
        const r = chord.root;
        const approach = next.root + (next.root > r ? -1 : 1);
        const n = [r, r + 7, r + 5, approach][q];
        tone({ freq: midi(n), t, dur: beat * 0.95, gain: 0.5, type: 'triangle', attack: 0.01, bus: B, filter: 700 });
      }
      // エレピのコンプ（チャールストン・リズム）
      if (e === 0 || e === 3) {
        chord.notes.forEach((n, i) => {
          tone({ freq: midi(n), t: t + i * 0.008, dur: e === 0 ? beat * 1.2 : beat * 2.2, gain: 0.07, type: 'sine', attack: 0.01, bus: B });
          tone({ freq: midi(n + 12), t: t + i * 0.008, dur: 0.4, gain: 0.012, type: 'triangle', attack: 0.004, bus: B });
        });
      }
      // ビブラフォンの即興（まばらに）
      if ((e === 1 || e === 4 || e === 6) && Math.random() < 0.34) {
        const chordTones = chord.notes.map((n) => n + 12);
        const pool = Math.random() < 0.6 ? chordTones : SCALE;
        let n = pool.reduce((best, x) => (Math.abs(x - this.lastMel) < Math.abs(best - this.lastMel) && x !== this.lastMel ? x : best), pool[0]);
        if (Math.random() < 0.5) n = pool[Math.floor(Math.random() * pool.length)];
        this.lastMel = n;
        tone({ freq: midi(n), t, dur: beat * 1.4, gain: 0.07, type: 'sine', attack: 0.004, bus: B });
        tone({ freq: midi(n) * 4, t, dur: 0.18, gain: 0.01, type: 'sine', attack: 0.002, bus: B });
      }
    },
  };

  function setBgm(on) {
    prefs.bgm = on;
    if (!ctx) return;
    if (on) { if (ctx.state === 'suspended') ctx.resume(); bgm.start(); } else bgm.stop();
  }
  function setSfx(on) { prefs.sfx = on; }
  function setVolume(v) {
    prefs.volume = v;
    if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  // タブを離れたら BGM を止める
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { bgm.stop(); ctx.suspend(); }
    else { ctx.resume(); if (prefs.bgm) bgm.start(); }
  });

  HE.audio = { unlock, play, setBgm, setSfx, setVolume, prefs };
})(window.HE);
