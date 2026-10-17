// 麻將計分邏輯：只靠牌局設定、座位安排和每一把的紀錄重算出所有結果
(function (root) {
  const WINDS = ['東', '南', '西', '北'];

  // 跟莊家有關的那筆帳才加：莊家台 + 連 n 拉 n（2n 台）
  function dealerExtra(st, winner, payer, s) {
    if (winner !== st.dealer && payer !== st.dealer) return 0;
    return (s.dealerTai ? 1 : 0) + 2 * st.streak;
  }

  function settleHand(st, hand, s) {
    const delta = [0, 0, 0, 0];
    const pays = [];
    // 自摸固定多 1 台（舊牌局沒有這個設定時也當作開）
    const selfTai = hand.type === 'tsumo' && s.tsumoTai !== false ? 1 : 0;
    const charge = (payer) => {
      const extra = dealerExtra(st, hand.winner, payer, s);
      const amt = s.base + (hand.tai + selfTai + extra) * s.perTai;
      delta[payer] -= amt;
      delta[hand.winner] += amt;
      pays.push({ from: payer, to: hand.winner, amt, extra, selfTai });
    };
    if (hand.type === 'ron') charge(hand.loser);
    if (hand.type === 'tsumo') {
      for (let p = 0; p < 4; p++) if (p !== hand.winner) charge(p);
    }

    const next = { dealer: st.dealer, streak: st.streak, rotation: st.rotation };
    if (hand.type === 'draw') {
      if (s.drawStreak) next.streak += 1;
    } else if (hand.winner === st.dealer) {
      next.streak += 1;
    } else {
      next.dealer = (st.dealer + 1) % 4;
      next.streak = 0;
      next.rotation += 1;
    }
    return { delta, pays, selfTai, next };
  }

  // 座位安排：一個位子是一隊（1～2 人），on 是目前坐著打的那位
  // from 是從第幾把（0 起算）開始生效；restart 代表重新抽位子，圈局從東風東局重算
  function lineupsOf(game) {
    if (game.lineups && game.lineups.length) return game.lineups;
    return [{
      from: 0, restart: true, dealer: game.startDealer || 0,
      seats: (game.players || []).map((n) => ({ members: [n], on: 0 })),
    }];
  }

  const sittingOf = (lineup) => lineup.seats.map((s) => s.members[s.on]);

  function emptyStat(name) {
    return { name, net: 0, hands: 0, win: 0, tsumo: 0, deal: 0, taiSum: 0, maxWin: 0, maxLoss: 0, maxStreak: 0 };
  }

  function replay(game) {
    const s = game.settings;
    const lineups = lineupsOf(game);
    const hands = game.hands || [];
    const people = {};
    const order = [];
    const person = (name) => {
      if (!people[name]) { people[name] = emptyStat(name); order.push(name); }
      return people[name];
    };
    lineups.forEach((l) => l.seats.forEach((seat) => seat.members.forEach(person)));
    // 隊伍以第一位成員當代號；每一把的錢記給當時那個位子的隊伍，
    // 隊友中途換到別隊也不會把舊隊的錢帶過去
    const teams = {};
    const team = (seat) => {
      const id = seat.members[0];
      if (!teams[id]) teams[id] = { id, members: [], net: 0 };
      teams[id].members = seat.members.slice(); // 依序套用，最後留下的是最新的隊員名單
      return teams[id];
    };
    lineups.forEach((l) => l.seats.forEach(team));

    let li = -1;
    let lineup = null;
    let st = null;
    const changes = [];
    const applyLineups = (i) => {
      while (li + 1 < lineups.length && lineups[li + 1].from <= i) {
        li += 1;
        lineup = lineups[li];
        if (lineup.restart || !st) st = { dealer: lineup.dealer || 0, streak: 0, rotation: 0 };
        if (li > 0) changes.push({ at: lineup.from, lineup, index: li });
      }
    };

    const rows = hands.map((hand, i) => {
      applyLineups(i);
      const names = sittingOf(lineup);
      const before = st;
      const r = settleHand(st, hand, s);
      names.forEach((n, p) => {
        const o = person(n);
        o.hands += 1;
        o.net += r.delta[p];
        if (r.delta[p] > o.maxWin) o.maxWin = r.delta[p];
        if (r.delta[p] < o.maxLoss) o.maxLoss = r.delta[p];
        teams[lineup.seats[p].members[0]].net += r.delta[p];
      });
      if (hand.type !== 'draw') {
        const w = person(names[hand.winner]);
        w.win += 1;
        w.taiSum += hand.tai + r.selfTai;
        if (hand.winner === st.dealer && r.next.streak > w.maxStreak) w.maxStreak = r.next.streak;
      }
      if (hand.type === 'tsumo') person(names[hand.winner]).tsumo += 1;
      if (hand.type === 'ron') person(names[hand.loser]).deal += 1;
      st = r.next;
      return { no: i + 1, index: i, hand, before, delta: r.delta, names, lineupIndex: li };
    });
    applyLineups(hands.length);

    return { rows, people, order, teams, state: st, lineup, changes };
  }

  // 圈從東風開始，每換一次莊往下一局，四局一圈
  function roundLabel(rotation) {
    const wind = WINDS[Math.floor(rotation / 4) % 4];
    const seat = WINDS[rotation % 4];
    const lap = Math.floor(rotation / 16);
    return (lap > 0 ? '第' + (lap + 1) + '將 ' : '') + wind + '風' + seat + '局';
  }

  // 打了多少：換一次莊算一局，四局一圈，四圈一將
  function progressLabel(rotation) {
    const jiang = Math.floor(rotation / 16);
    const quan = Math.floor((rotation % 16) / 4);
    const ju = rotation % 4;
    const parts = [];
    if (jiang) parts.push(jiang + ' 將');
    if (quan) parts.push(quan + ' 圈');
    if (ju) parts.push(ju + ' 局');
    return parts.length ? parts.join(' ') : '未滿一局';
  }

  // 一場的總進度：每段重新抽位子之前打的局數要加起來
  function totalRotation(game) {
    const lineups = lineupsOf(game);
    const hands = game.hands || [];
    let total = 0;
    let st = null;
    let li = -1;
    const flush = () => { if (st) total += st.rotation; };
    for (let i = 0; i <= hands.length; i++) {
      while (li + 1 < lineups.length && lineups[li + 1].from <= i) {
        li += 1;
        const l = lineups[li];
        if (l.restart || !st) { flush(); st = { dealer: l.dealer || 0, streak: 0, rotation: 0 }; }
      }
      if (i < hands.length) st = settleHand(st, hands[i], game.settings).next;
    }
    flush();
    return total;
  }

  // 刪掉第 i 把時，之後的座位變動也要往前挪一把
  function removeHand(game, i) {
    game.hands.splice(i, 1);
    if (game.lineups) game.lineups.forEach((l) => { if (l.from > i) l.from -= 1; });
    return game;
  }

  const api = {
    dealerExtra, settleHand, replay, roundLabel, progressLabel, totalRotation,
    lineupsOf, sittingOf, removeHand, WINDS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJ = api;
})(this);
