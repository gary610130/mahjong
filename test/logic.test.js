const assert = require('node:assert/strict');
const MJ = require('../logic.js');

const baseSettings = {
  base: 50,
  perTai: 20,
  tsumoTai: true,
  dealerTai: true,
  drawStreak: true,
};

// 1. 連莊台數計算（dealerExtra）
{
  const st = { dealer: 1, streak: 3, rotation: 1 };
  // 莊家胡或莊家付：莊家台 1 + 連3拉3 (6) = 7 台
  assert.equal(MJ.dealerExtra(st, 1, 2, { dealerTai: true }), 7);
  assert.equal(MJ.dealerExtra(st, 2, 1, { dealerTai: true }), 7);
  // 關掉莊家台：只算連3拉3 = 6 台
  assert.equal(MJ.dealerExtra(st, 1, 2, { dealerTai: false }), 6);
  // 兩邊都不是莊家：0 台
  assert.equal(MJ.dealerExtra(st, 2, 3, { dealerTai: true }), 0);
}

// 2. 放槍、莊家胡連莊、閒家胡下莊
{
  // 莊家（0）胡閒家（2）2 台：50 + (2 + 1) * 20 = 110，莊家連 1
  const r1 = MJ.settleHand(
    { dealer: 0, streak: 0, rotation: 0 },
    { type: 'ron', winner: 0, loser: 2, tai: 2 },
    baseSettings
  );
  assert.deepEqual(r1.delta, [110, 0, -110, 0]);
  assert.deepEqual(r1.next, { dealer: 0, streak: 1, rotation: 0 });

  // 莊家連 1 時，閒家（1）胡閒家（3）3 台：跟莊家無關，50 + 3 * 20 = 110，莊家下莊換 1 當莊、rotation + 1
  const r2 = MJ.settleHand(
    r1.next,
    { type: 'ron', winner: 1, loser: 3, tai: 3 },
    baseSettings
  );
  assert.deepEqual(r2.delta, [0, 110, 0, -110]);
  assert.deepEqual(r2.next, { dealer: 1, streak: 0, rotation: 1 });

  // 閒家（2）胡莊家（1，連 2）1 台：50 + (1 + 1 + 4) * 20 = 170，下莊換 2 當莊
  const r3 = MJ.settleHand(
    { dealer: 1, streak: 2, rotation: 1 },
    { type: 'ron', winner: 2, loser: 1, tai: 1 },
    baseSettings
  );
  assert.deepEqual(r3.delta, [0, -170, 170, 0]);
  assert.deepEqual(r3.next, { dealer: 2, streak: 0, rotation: 2 });
}

// 3. 自摸（含 tsumoTai 開和關）
{
  // tsumoTai 開、dealerTai 開，莊家 0 連 1，閒家 2 自摸 2 台：
  // 莊家 0 付：50 + (2 + 1自摸 + 1莊 + 2連拉) * 20 = 170
  // 閒家 1、3 各付：50 + (2 + 1自摸) * 20 = 110
  // 閒家 2 共收：170 + 110 + 110 = 390，莊家下莊
  const rOpen = MJ.settleHand(
    { dealer: 0, streak: 1, rotation: 0 },
    { type: 'tsumo', winner: 2, tai: 2 },
    baseSettings
  );
  assert.equal(rOpen.selfTai, 1);
  assert.deepEqual(rOpen.delta, [-170, -110, 390, -110]);
  assert.deepEqual(rOpen.next, { dealer: 1, streak: 0, rotation: 1 });

  // tsumoTai 關、dealerTai 關，莊家 0（連 2）自摸 4 台：
  // 三家各付：50 + (4 + 0自摸 + 4連拉) * 20 = 210，莊家共收 630，變連 3
  const rClosed = MJ.settleHand(
    { dealer: 0, streak: 2, rotation: 0 },
    { type: 'tsumo', winner: 0, tai: 4 },
    { base: 50, perTai: 20, tsumoTai: false, dealerTai: false, drawStreak: true }
  );
  assert.equal(rClosed.selfTai, 0);
  assert.deepEqual(rClosed.delta, [630, -210, -210, -210]);
  assert.deepEqual(rClosed.next, { dealer: 0, streak: 3, rotation: 0 });
}

// 4. 流局（drawStreak 開和關）
{
  const st = { dealer: 2, streak: 1, rotation: 2 };
  const rDrawOn = MJ.settleHand(st, { type: 'draw', tai: 0 }, { ...baseSettings, drawStreak: true });
  assert.deepEqual(rDrawOn.delta, [0, 0, 0, 0]);
  assert.deepEqual(rDrawOn.next, { dealer: 2, streak: 2, rotation: 2 });

  const rDrawOff = MJ.settleHand(st, { type: 'draw', tai: 0 }, { ...baseSettings, drawStreak: false });
  assert.deepEqual(rDrawOff.delta, [0, 0, 0, 0]);
  assert.deepEqual(rDrawOff.next, { dealer: 2, streak: 1, rotation: 2 });
}

// 5. 換手（swap）後錢記給正確的隊伍與個人
{
  const game = {
    settings: baseSettings,
    lineups: [
      {
        from: 0,
        restart: true,
        dealer: 0,
        seats: [
          { members: ['A', 'A2'], on: 0 },
          { members: ['B'], on: 0 },
          { members: ['C'], on: 0 },
          { members: ['D'], on: 0 },
        ],
      },
      {
        from: 1,
        restart: false,
        dealer: 0,
        seats: [
          { members: ['A', 'A2'], on: 1 }, // 第 2 把起 A2 換手上場
          { members: ['B'], on: 0 },
          { members: ['C'], on: 0 },
          { members: ['D'], on: 0 },
        ],
      },
    ],
    hands: [
      // 第 1 把：A（莊）胡 B 1 台 -> 50 + (1 + 1) * 20 = 90，變連 1
      { type: 'ron', winner: 0, loser: 1, tai: 1 },
      // 第 2 把：A2（莊，連 1）胡 C 2 台 -> 50 + (2 + 1 + 2) * 20 = 150，變連 2
      { type: 'ron', winner: 0, loser: 2, tai: 2 },
    ],
  };
  const r = MJ.replay(game);
  // 個人帳分開記
  assert.equal(r.people['A'].net, 90);
  assert.equal(r.people['A'].hands, 1);
  assert.equal(r.people['A2'].net, 150);
  assert.equal(r.people['A2'].hands, 1);
  assert.equal(r.people['A2'].maxStreak, 2);
  assert.equal(r.people['B'].net, -90);
  assert.equal(r.people['C'].net, -150);
  // 隊伍帳合在東位隊伍（代號 'A'）：90 + 150 = 240
  assert.equal(r.teams['A'].net, 240);
  assert.deepEqual(r.state, { dealer: 0, streak: 2, rotation: 0 });
}

// 6. 重新抽位子（restart）從東風東局重算 & totalRotation
{
  const game = {
    settings: baseSettings,
    lineups: [
      {
        from: 0,
        restart: true,
        dealer: 0,
        seats: [
          { members: ['A'], on: 0 },
          { members: ['B'], on: 0 },
          { members: ['C'], on: 0 },
          { members: ['D'], on: 0 },
        ],
      },
      {
        from: 2,
        restart: true,
        dealer: 3, // 重抽後北位（A）當莊，圈局歸零從東風東局重算
        seats: [
          { members: ['B'], on: 0 },
          { members: ['C'], on: 0 },
          { members: ['D'], on: 0 },
          { members: ['A'], on: 0 },
        ],
      },
    ],
    hands: [
      // 第一段第 1 把：閒 1 胡 莊 0 -> rotation 變 1，dealer 變 1
      { type: 'ron', winner: 1, loser: 0, tai: 1 },
      // 第一段第 2 把：閒 2 胡 莊 1 -> rotation 變 2，dealer 變 2
      { type: 'ron', winner: 2, loser: 1, tai: 1 },
      // 第二段第 3 把（重抽後）：莊 3（A）胡 閒 0（B）1 台 -> 連莊 streak 變 1，rotation 仍為 0
      { type: 'ron', winner: 3, loser: 0, tai: 1 },
      // 第二段第 4 把：閒 0（B）胡 莊 3（A）1 台 -> 下莊 dealer 變 0，rotation 變 1
      { type: 'ron', winner: 0, loser: 3, tai: 1 },
    ],
  };
  const r = MJ.replay(game);
  // 重抽後第 3 把的 before 狀態應為 dealer: 3, streak: 0, rotation: 0（東風東局）
  assert.deepEqual(r.rows[2].before, { dealer: 3, streak: 0, rotation: 0 });
  assert.equal(MJ.roundLabel(r.rows[2].before.rotation), '東風東局');
  // 目前最後狀態：dealer: 0, streak: 0, rotation: 1（東風南局）
  assert.deepEqual(r.state, { dealer: 0, streak: 0, rotation: 1 });
  assert.equal(MJ.roundLabel(r.state.rotation), '東風南局');
  // totalRotation 應為第一段的 2 局 + 第二段的 1 局 = 3 局
  assert.equal(MJ.totalRotation(game), 3);
}

// 7. removeHand 刪一把後重算（包含刪掉換手前後那一把）
{
  const game = {
    settings: baseSettings,
    lineups: [
      {
        from: 0,
        restart: true,
        dealer: 0,
        seats: [
          { members: ['A', 'A2'], on: 0 },
          { members: ['B'], on: 0 },
          { members: ['C'], on: 0 },
          { members: ['D'], on: 0 },
        ],
      },
      {
        from: 2, // 原本從第 3 把（index 2）開始換 A2 上場
        restart: false,
        dealer: 0,
        seats: [
          { members: ['A', 'A2'], on: 1 },
          { members: ['B'], on: 0 },
          { members: ['C'], on: 0 },
          { members: ['D'], on: 0 },
        ],
      },
    ],
    hands: [
      { type: 'ron', winner: 0, loser: 1, tai: 1 }, // index 0 (A 在場，莊連 1)
      { type: 'draw', tai: 0 },                     // index 1 (A 在場，流局連 2)
      { type: 'ron', winner: 0, loser: 2, tai: 1 }, // index 2 (A2 在場)
    ],
  };

  // 刪掉換手前的第 1 把（index 0）：原本 from: 2 應往前挪成 from: 1
  MJ.removeHand(game, 0);
  assert.equal(game.hands.length, 2);
  assert.equal(game.lineups[1].from, 1);

  const rAfter1 = MJ.replay(game);
  // 現在第 1 把（index 0）是流局（A 在場，連 1），第 2 把（index 1）是 A2 胡 C 1 台（莊連 1：50 + (1 + 1 + 2)*20 = 130）
  assert.equal(rAfter1.people['A'].hands, 1);
  assert.equal(rAfter1.people['A'].net, 0);
  assert.equal(rAfter1.people['A2'].hands, 1);
  assert.equal(rAfter1.people['A2'].net, 130);

  // 再刪掉換手後的那一把（index 1）
  MJ.removeHand(game, 1);
  assert.equal(game.hands.length, 1);
  const rAfter2 = MJ.replay(game);
  assert.equal(rAfter2.people['A2'].hands, 0);
  assert.equal(rAfter2.people['A2'].net, 0);
}

// 8. 一炮三響（莊家放槍、閒家放槍兩種）
{
  const game = {
    settings: baseSettings,
    players: ['東', '南', '西', '北'],
    hands: [
      // 第 1 把：莊家（0，連 0）放槍一炮三響，南 2 台、西 1 台、北 4 台
      // 因為放槍者是莊家，三筆都有莊家台 1 台：
      // 南收：50 + (2 + 1) * 20 = 110
      // 西收：50 + (1 + 1) * 20 = 90
      // 北收：50 + (4 + 1) * 20 = 150
      // 東共付：110 + 90 + 150 = 350；莊家放槍下莊 -> dealer: 1, streak: 0, rotation: 1
      { type: 'triple', loser: 0, tais: [0, 2, 1, 4] },
      // 第 2 把：現在南（1，連 0）當莊，西（2）放槍一炮三響，東 3 台、南 2 台、北 1 台
      // 東（閒）收：50 + 3 * 20 = 110
      // 南（莊）收：50 + (2 + 1莊) * 20 = 110
      // 北（閒）收：50 + 1 * 20 = 70
      // 西共付：110 + 110 + 70 = 290；閒家放槍代表莊家也胡了 -> dealer: 1, streak: 1, rotation: 1
      { type: 'triple', loser: 2, tais: [3, 2, 0, 1] },
    ],
  };
  const r = MJ.replay(game);
  assert.deepEqual(r.rows[0].delta, [-350, 110, 90, 150]);
  assert.deepEqual(r.rows[1].before, { dealer: 1, streak: 0, rotation: 1 });
  assert.deepEqual(r.rows[1].delta, [110, 110, -290, 70]);
  assert.deepEqual(r.state, { dealer: 1, streak: 1, rotation: 1 });

  // 統計驗證：
  // 東：第 1 把放槍(deal=1)、第 2 把胡 3 台(win=1, taiSum=3)，net = -350 + 110 = -240
  assert.deepEqual(
    { net: r.people['東'].net, win: r.people['東'].win, deal: r.people['東'].deal, taiSum: r.people['東'].taiSum },
    { net: -240, win: 1, deal: 1, taiSum: 3 }
  );
  // 南：兩把都胡(win=2, taiSum=2+2=4)，第 2 把莊家胡連 1(maxStreak=1)，net = 110 + 110 = 220
  assert.deepEqual(
    { net: r.people['南'].net, win: r.people['南'].win, deal: r.people['南'].deal, taiSum: r.people['南'].taiSum, maxStreak: r.people['南'].maxStreak },
    { net: 220, win: 2, deal: 0, taiSum: 4, maxStreak: 1 }
  );
  // 西：第 1 把胡 1 台、第 2 把放槍(win=1, deal=1, taiSum=1)，net = 90 - 290 = -200
  assert.deepEqual(
    { net: r.people['西'].net, win: r.people['西'].win, deal: r.people['西'].deal, taiSum: r.people['西'].taiSum },
    { net: -200, win: 1, deal: 1, taiSum: 1 }
  );
  // 北：兩把都胡(win=2, deal=0, taiSum=4+1=5)，net = 150 + 70 = 220
  assert.deepEqual(
    { net: r.people['北'].net, win: r.people['北'].win, deal: r.people['北'].deal, taiSum: r.people['北'].taiSum },
    { net: 220, win: 2, deal: 0, taiSum: 5 }
  );
  assert.equal(MJ.totalRotation(game), 1);
}

console.log('OK');
