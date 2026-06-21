import { WILD, new_card, to_suit, to_sr } from './honeybears.js';


//////////////////////////////////////////////////////////////////////////////
//
// 手を決める
// 手の指定は次のオブジェクトで行う
// result = {
//    wild: -1, // ワイルドカードを使うならどのスートかを指定。使わないなら -1
//              // ランクは下記で指定したワイルドカードのランクになる
//    card: プレイするカード, // 手札に無いとだめ
// }
//

const NAMES = [
  '熊一郎', 'カムイホプニレ', '女王蜂', 'テディ',
  '熊三郎', '山くじら', 'ビーすけ', '猛獣使い',
  'メドヴェーチ', '蜂須賀', 'Old Sherlock', 'くまモン',
  '熊治郎', 'プーさん', 'ハッチ', 'be Bee',
  'お熊', '熊五郎', 'パンダ', 'イーヨー',
  '山親爺', 'クマさん', 'イオマンテ', 'ニモ',
  'ツキノワ', '穴熊', 'ミッツ', '習禁平',
  'いのくま', 'アライ', 'ウェンカムイ', 'アナログマ',
];

// 上のリストから指定された個数の名前を適当に返す
export const get_names = (len, rnd) => {
  const ret = [];
  while (ret.length != len) {
    const r = rnd.rand(NAMES.length);
    if (! ret.includes(NAMES[r])) {
      ret.push(NAMES[r]);
    }
  }
  return ret;
};

// 手札を分解
const bunkai = hands => {
  const ret = [
    {suit: 0, one: 0, two: 0, len: 0}, {suit: 1, one: 0, two: 0, len: 0},
    {suit: 2, one: 0, two: 0, len: 0}, {suit: 3, one: 0, two: 0, len: 0},
    {suit: 4, one: 0, two: 0, len: 0},
  ];
  for (let card of hands) {
    const [suit, rank] = to_sr(card);
    ret[suit].len += 1;
    if (rank === 1) {
      ret[suit].one += 1;
    } else {
      ret[suit].two += 1;
    }
  }
  return ret;
};


// 手番にとって合法な１手を適当に選ぶ
const random_play = (hands, rnd) => {
  const r = rnd.rand(hands.length);
  //const card = hb.teban.choice(r);
  const card = hands[r];
  return {
    wild: to_suit(card) === WILD? rnd.rand(4): -1,
    card: card
  };
};

// 一番ペアが多いスートを返す
const pair_top = lst => {
  let top = 0;
  let result = -1;
  let len = -1;
  for (let cc of lst) {
    if (cc.suit === WILD) break;
    const p = Math.trunc(cc.one / 2); // 1枚しかないなら p=0
    if (p > top) {
      top = p;
      result = cc.suit;
      len = cc.len;
    } else if (cc.one >= 2 && p == top && cc.len > len) {
      // ペア数が同じなら長いスートを優先
      result = cc.suit;
      len = cc.len;
    }
  }
  return top === 0? -1: result;
};

// ワイルド以外で一番たくさん持ってるスートを返す
const len_top = lst => {
  let top = 0;
  let result = -1;
  for (let cc of lst) {
    if (cc.suit === 4) break;
    if (cc.len > top) {
      top = cc.len;
      result = cc.suit;
    }
  }
  return result; // ワイルドしかないなら -1
};

//////////////////////////////////////////////////////////////////////////////
// 場の状況も他のプレイヤーも見ず、手札だけで行動を決める
// 手札運に任せて突っ走るプレイをするのでゆっくりしてると負ける……が、
// 突っ走るとわかってしまうと弱い……
export const think_play = hb => {
  const hands = hb.teban.hands;
  if (hands.length === 0) { // 普通ありえない状況
    throw new Error(`panic! ${hb.teban.name} の手札が無い！`);
  }
  const sei = hb.teban.seikaku * 8 + 50;
  const lst = bunkai(hands);
  const p_top = pair_top(lst);
  const l_top = len_top(lst);

  // wild があるなら
  if (lst[4].len > 0 && sei > hb.rnd.rand(100) + 1) {
    const rank = lst[4].two > 0? 2: 1; // ランク２を優先で出す
    // どのスートとして出すか
    if (p_top != -1) {
      return {
        wild: p_top, // ペアが最も多いスート
        card: new_card(WILD, rank),
      };
    } else if (l_top != -1) {
      return {
        wild: l_top, // 枚数が最も多いスート
        card: new_card(WILD, rank),
      };
    }
    // 手持ちがワイルドだけのときはどうしようもない
  }

  // ワイルドカードがないなら

  if (l_top != -1 && lst[l_top].two > 0 && sei > hb.rnd.rand(100) + 1) {
    // 長いスートのランク２があれば出す
    return {
      wild: -1,
      card: new_card(l_top, 2),
    };
  }
  if (l_top != -1 && lst[l_top].one >= 3 && lst[l_top].one % 2 == 1
    && sei > hb.rnd.rand(100) + 1) {
    // 長いスートの
    // aaa などペアになれず余ってるカードを出す
    return {
      wild: -1,
      card: new_card(l_top, 1),
    };
  }

  // 手札を半分くらい使っている場合、最弱のペアを「見込みなし」として処分
  if (hands.length < hb.hand_len / 2 && sei > hb.rnd.rand(100) + 1) {
    for (let s = 0; s < 4; ++s) {
      const b = hb.bears[s];
      if (b < 8 && lst[s].one >= 2) {
        return {
          wild: -1,
          card: new_card(s, 1),
        };
      }
    }
    // ペアが無いなら２を処分
    for (let s = 0; s < 4; ++s) {
      const b = hb.bears[s];
      if (b < 8 && lst[s].two > 0) {
        return {
          wild: -1,
          card: new_card(s, 2),
        };
      }
    }
  }

  // ペアを持たないスートからランダムに出す
  if (sei > hb.rnd.rand(100) + 1) {
    for (let cc of lst) {
      if (cc.suit === WILD) break;
      if (cc.len > 0 && cc.one < 2) { // 存在し、かつペアがない
        return {
          wild: -1,
          card: new_card(cc.suit, cc.one > 0? 1: 2), // ランク1を優先
        };
      }
    }
  }
  // どれもだめならランダム
  return random_play(hands, hb.rnd);
};

