// node tests/engine.test.mjs — ブラウザ無しでエンジンを検証する
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx = vm.createContext({ console, Math });
for (const f of ['cards', 'equity', 'advisor', 'bots', 'game']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8'), ctx);
}
const HE = ctx.HE;

const parse = (s) => s.split(' ').map((t) => HE.makeCard('23456789TJQKA'.indexOf(t[0]) + 2, 'shdc'.indexOf(t[1])));
const cat = (s) => HE.evaluate(parse(s)).cat;

// 役判定
assert.equal(cat('As Ks Qs Js Ts 2d 3c'), 8);
assert.equal(cat('Ah 2d 3c 4s 5h 9d Kc'), 4, 'A-5 ストレート');
assert.equal(cat('9h 9d 9c 4s 4h 2d Kc'), 6);
assert.equal(cat('9h 9d 9c 4s 4h 4d Kc'), 6, 'スリーカード2組はフルハウス');
assert.equal(cat('2h 7h 9h Jh Kh 2d 2c'), 5);
assert.equal(cat('2h 2d 7c 7s Kh Kd 3c'), 2);
assert.equal(cat('Ah Kd 7c 5s 3h 2d 9c'), 0);
const s = (x) => HE.evaluate(parse(x)).score;
assert.ok(s('Ah Ad Kc 7s 3h 2d 9c') > s('Ah Ad Qc 7s 3h 2d 9c'), 'キッカー比較');
assert.ok(s('2h 3d 4c 5s 6h 9d Kc') > s('Ah 2d 3c 4s 5h 9d Kc'), '6ハイ > 5ハイ');

// チェン
assert.equal(HE.chen(...parse('As Ah')), 20);
assert.equal(HE.chen(...parse('As Ks')), 12);
assert.equal(HE.chen(...parse('7h 2d')), -1);
assert.ok(HE.handPct(...parse('As Ah')) < 0.01);

// 勝率：AA vs ランダム1人 ≈ 85%
const eq = HE.equity(parse('As Ah'), [], [{}], 4000);
assert.ok(eq > 0.81 && eq < 0.89, `AA equity ${eq}`);

// ドロー
const d = HE.draws(parse('Ah 5h'), parse('9h Kh 2c'));
assert.ok(d.flushDraw && d.outs === 9);
const o = HE.draws(parse('8c 9d'), parse('Th Jc 2s'));
assert.ok(o.oesd && o.outs === 8);

// エンジン：ヒーローもコーチ通りに打つ自動対局でチップ保存を検証
let seed = 12345;
const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (const opps of [1, 2, 5]) {
  const ui = {
    onUpdate() {}, onLog() {}, delay: async () => {}, botDelay: () => 0,
    askHero: async ({ rec }) => ({ action: rec.action, amount: rec.amount }),
  };
  const g = new HE.Game(ui, { numOpponents: opps, rng });
  let grades = { good: 0, ok: 0, bad: 0 };
  for (let h = 0; h < 120; h++) {
    const res = await g.playHand('coach');
    for (const p of g.players) assert.ok(p.stack >= 0, 'no negative stack');
    for (const dcs of res.decisions) grades[dcs.grade]++;
  }
  assert.equal(grades.bad, 0, 'コーチ通りのプレイは全て good');
  console.log(`opps=${opps}: ok`, grades);
}

// 厳密なチップ保存（リバイなし区間）
{
  const ui = { onUpdate() {}, onLog() {}, delay: async () => {}, askHero: async ({ rec }) => ({ action: rec.action, amount: rec.amount }) };
  const g = new HE.Game(ui, { numOpponents: 5, rng });
  for (let h = 0; h < 200; h++) {
    const before = g.players.map((p) => (p.stack < g.bb ? g.startStack : p.stack)).reduce((a, b) => a + b, 0);
    await g.playHand('review');
    const after = g.players.reduce((a, p) => a + p.stack, 0);
    assert.equal(after, before, `hand ${h}: ${before} -> ${after}`);
  }
  console.log('conservation: ok');
}
console.log('all tests passed');
