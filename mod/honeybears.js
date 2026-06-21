
export class Rand {
  constructor(seed=Math.trunc(Math.random() * 12345678)+1) {
    this.seed = seed;
    this.x = 123456789;
    this.y = 362436069;
    this.z = 521288629;
    this.w = seed;
  }
  next() {
    const t = this.x ^ (this.x << 11);
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    this.w = (this.w ^ (this.w >>> 19)) ^ (t ^ (t >>> 8));
    return (this.w >>> 0) - 1;
  }
  random() {
    return this.next() / 0xffffffff;
  }
  rand(n) {
    return this.next() % n;
  }
}

// suit ... {0,1,2,3,4(wild)}
// rank ... {1,2}
export const new_card = (suit, rank) => (suit << 1) | (rank - 1);
export const to_suit = card => card >> 1;
export const to_rank = card => card % 2 + 1;
export const to_sr   = card => { return [to_suit(card), to_rank(card)]; }

export const WILD = 4;
export const wild_to_suit = (card, suit) => new_card(suit, to_rank(card));

export const new_deck = rnd => {
  const d = [];
  for (let s = 0; s < 5; ++s) {
    for (let r = 0; r < 6; ++r) d.push(new_card(s, 1));
    for (let r = 0; r < 5; ++r) d.push(new_card(s, 2));
  }
  // shuffle
  for (let i = 54 /*d.length-1*/; i > 0; --i) {
    const r = rnd.rand(i + 1);
    [d[i], d[r]] = [d[r], d[i]];
  }
  return d;
};

export const to_seikaku = name => [...name].reduce((acc, cur)=>acc + cur.charCodeAt(0), 0) % 8;

export class Player {
  constructor(name, rnd, hands=null, score=0) {
    this.name = name;
    this.seikaku = to_seikaku(name);
    if (this.seikaku === 7) {
      this.seikaku = rnd.rand(7);
    }
    if (hands === null) this.hands = []; else this.set_hands(hands);
    this.scores = [score]; // タイブレーク用にスコアを記録
    this._score = score;
  }
  get score() { return this._score; }
  // 得点したとき
  add_score(sc) {
    this.scores.push(sc);
    this._score += sc;
  }
  // タイブレーク用：最後のディールの得点を返す
  katen() {
    return this.scores[this.scores.length - 1];
  }
  // 新規ディール用：手札をセット
  set_hands(hands) {
    if (hands.length != 0) {
      this.hands = [...hands].sort(this.seikaku % 2 == 0?
        Player.sort_hands2: Player.sort_hands);
    } else {
      throw new Error(`hands = ${hands}`);
    }
  }
  // index の位置で手札を選択し、削除する
  // select_card からも最後はこれが呼ばれる
  select_by_idx(idx) {
    if (idx < 0 || idx >= this.hands.length) {
      throw new Error(`hands[${idx}] out of range`);
    }
    const card = this.hands[idx];
    this.hands.splice(idx, 1); // ！削除！
    return card;
  }
  // card で同じ値の手札を選択し、削除する
  select_card(card) {
    const idx = this.hands.indexOf(card);
    if (idx === -1) {
      throw new Error(`card '${card}' not found: ${this.hands}`);
    }
    return this.select_by_idx(idx);
  }
  // 手札を並べ替える
  static sort_hands(a, b) {
    const s = [to_suit(a), to_suit(b)];
    if (s[0] === s[1]) {
      const r = [to_rank(a), to_rank(b)];
      return r[0] - r[1];
    } else {
      return s[0] - s[1];
    }
  }
  static sort_hands2(a, b) {
    const [as, bs] = [to_suit(a), to_suit(b)];
    if (as === bs) {
      const [ar, br] = [to_rank(a), to_rank(b)];
      return ar - br;
    } else if (as === WILD) {
      return 1;
    } else if (bs === WILD) {
      return -1;
    } else {
      return bs - as;
    }
  }
}

//////////////////////////////////////////////////////////////////////////////
export class HoneyBears {
  // 名前のリスト、乱数Obj、ハリネズミルールか、棋譜を取るか
  constructor(names, rnd, is_hedgehogs=false, kihu_fn=undefined) {
    this.np = names.length;
    this.rnd = rnd;
    this.use_kihu = kihu_fn !== undefined;
    this.is_hedgehogs = is_hedgehogs;
    // hand
    this.hand_len = 11;
    switch (this.np) {
      case 3: this.hand_len = 15; break;
      case 4: this.hand_len = 13; break;
      case 5: this.hand_len = 11; break;
      default:
        throw new Error(`人数が不正: ${names}`);
    }
    const deck = new_deck(this.rnd);
    this.players = [];
    for (let p = 0; p < this.np; ++p) {
      const h = [];
      for (let i = 0; i < this.hand_len; ++i) {
        h.push( deck.pop() );
      }
      this.players.push( new Player(names[p], this.rnd, h, 0) );
    }
    // other
    this.bears = [0, 0, 0, 0];
    this.turn = rnd.rand(this.np); // 最初の手番を決定
    this.start_player = this.turn;
    this.goal = null; // このディールでゴールしたプレイヤー
    this.deal_count = 0;
    this.discards = [];
    // 棋譜
    this.kihu_fn = kihu_fn;
    this.kihu = this.use_kihu? new Kihu(this): null;
  }
  // 手番を返す
  get teban() {
    return this.players[ this.turn ];
  }
  // カードをボードに適用し、いずれかのくまがゴールしたら偽、でなければ真を返す
  forward(card) {
    const s = to_suit(card);
    const r = to_rank(card);
    this.bears[ s ] += r;
    // ディール終了か判定
    if (this.bears[s] >= 13) {
      this.bears[s] = 13;
      return false;
    } else {
      return true;
    }
  }
  // forward の結果、ディール終了でなければ手番を変化させる
  turn_next(ret) {
    if (ret) {
      this.turn += 1;
      if (this.turn === this.np) this.turn = 0;
      return 'play';
    } else {
      return this.on_deal_end();
    }
  }
  // カードをプレイする
  // card ... 使う手札。ワイルドもそのまま渡す
  // wild_suit ... card がワイルドのとき、どのスートにするか
  // 結果は文字列で、'play', 'deal', 'gameover'
  play_card(card, wild_suit=-1) {
    let play_card = card;
    if (to_suit(card) === WILD) {
      if (wild_suit < 0 || wild_suit > 3) {
        throw new Error(`ワイルドカードのスートが変: ${wild_suit}`);
      } else {
        // forward にわたすために変換
        play_card = new_card(wild_suit, to_rank(card));
      }
    }
    this.discards.push(card); // 使ったカード（wildかもしれない）を記録
    const ret = this.forward(play_card);
    if (this.use_kihu) {
      this.kihu.on_play(this.teban.name, card, wild_suit); // 棋譜をとる
    }
    return this.turn_next(ret);
  }
  // ディールの終わりに各プレイヤーの得点を計算
  // ゴール点を含めて計算するので this.goal がnullだと計算に失敗する
  calc_score() {
    if (this.goal === null) {
      throw new Error('ゴールしたプレイヤーが存在しません');
    }
    for (let p of this.players) {
      let sc = this.player_score(p);
      if (p == this.goal) sc += this.is_hedgehogs? 3: 6; // ゴールさせた者にボーナス
      p.add_score(sc < 0? 0: sc);// マイナスなら０に修正
    }
  }
  // ゴール点なしにあるプレイヤーの点数を計算する
  // 結果は負になりうる
  player_score(cur_player) {
    const BASIC_SCORE = [-1, -1, -1, -1, -1, -1, -1, 0, 0, 1, 1, 2, 2, 3];
    // 枚数をカウント
    const one = [0, 0, 0, 0];
    const two = [0, 0, 0, 0];
    for (let card of cur_player.hands) {
      const s = to_suit(card);
      if (s !== WILD) {
        const r = to_rank(card);
        if (r === 1) one[s] += 1;
        else two[s] += 1;
      }
    }
    // 点数を計算
    let result = 0;
    for (let s = 0; s < 4; ++s) {
      const bs = BASIC_SCORE[ this.bears[ s ] ];
      if (this.is_hedgehogs) {
        result += bs * (one[s] + two[s]);
      } else {
        const cnt_one = one[s];
        const pairs = Math.trunc( cnt_one / 2 );
        const amari = cnt_one % 2;
        result += (bs * 5 * pairs) + (bs * amari) + (bs * 2 * two[s]);
      }
    }
    // return
    return result;
  }
  on_deal_end() {
    this.goal = this.teban; // このタイミングから次の next_deal まで goal は null でない
    this.calc_score();
    // next deal
    this.deal_count += 1;
    if (this.deal_count < this.np) {
      this.start_player += 1;
      if (this.start_player === this.np) this.start_player = 0;
      if (this.use_kihu) {
        this.kihu.on_deal_end(this); // 棋譜をとる
      }
      return 'deal'
    } else {
      if (this.use_kihu) {
        this.kihu.on_deal_end(this);
        this.kihu.on_gameover(this);
      }
      return 'gameover';
    }
  }
  // 次のディールを準備する
  next_deal() {
    // 席順でスタートプレイヤーを交代
    this.turn = this.start_player;
    this.goal = null; // 誰がゴールしたかを null に戻す
    // くまの位置をリセット
    this.bears = [0, 0, 0, 0];
    // 手札を配りなおす
    this.discards = [];
    const deck = new_deck(this.rnd);
    for (let p of this.players) {
      const h = [];
      for (let i = 0; i < this.hand_len; ++i) h.push( deck.pop() );
      p.set_hands(h);
    }
    if (this.use_kihu) {
      this.kihu.on_deal_start(this); // 棋譜をとる
    }
  }
  // 優勝者を決定
  // 結果は配列：タイブレークの曖昧さのため、複数の勝者を返すかもしれない
  get_winner() {
    // ary ... すべてのプレイヤーの配列
    // f_score(a) ... あるプレイヤーが持つ比較可能な値を返す関数
    function find(ary, f_score) {
      let pt = -999;
      let lst = [];
      for (let a of ary) {
        let s = f_score(a);
        if (pt < s) {  // これまでの最高点を上回るなら
          lst = [ a ]; // リストを作り直す
          pt = s;      // 最高点を記録
        } else if (pt === s) {
          lst.push( a ); // 同点ならリストに追加
        }
      }
      // 結果は複数が有りうるので、該当するすべてのリストを返す
      return lst;
    }
    // 合計点数を比較する
    // 単独トップならlst.length == 1
    const lst = find(this.players, p => p.score);
    if (lst.length > 1) { // タイブレークなら
      this.is_tie = true;
      // 同じロジックでラスト・ディールの得点を比較
      const lst2 = find(lst, p => p.katen());
      // タイブレークがうまくいけば lst2.length == 1 だが、
      // うまく行かなかったときの記載がないので複数の勝者が出ることを許容する
      return lst2; // 複数の要素を持つかもしれない
    } else {
      this.is_tie = false;
      return lst;  // 配列ではあるが、要素数は常に１
    }
  }
}


////////////////////////////////
// ゲームの棋譜をとる
export class Kihu {
  constructor(hb) {
    this.seed = '0x' + hb.rnd.seed.toString(16).toUpperCase();
    this.nplayers = hb.players.length;
    this.deals = [];
    this.final_scores = [];
    this.winners = [];
    // 最初のディールを記録
    this.on_deal_start(hb);
  }
  card_to_obj(card) {
    const [suit, rank] = to_sr(card);
    return {
      card: ['A', 'S', 'D', 'F', 'W'][suit] + rank.toString(),
      suit: suit,
      rank: rank,
    };
  }
  // カードを配り終えたあとに呼ぶ
  on_deal_start(hb) {
    this.deals.push( {
      start_player: hb.teban.name,
      play: [],
      scores: [],
      players_hands: hb.players.map( pl => {
        return {
          name: pl.name,
          hands: pl.hands.toSorted(Player.sort_hands).map(
            c => this.card_to_obj(c)),
        };
      } ),
    } );
  }
  get cur_deal() {
    return this.deals[this.deals.length - 1];
  }
  // 手番がカードを選択したあとに呼ぶ
  // wild ... card がワイルドだとして、その変換先のスート
  on_play(name, card, wild=-1) {
    this.cur_deal.play.push({
      name: name,
      card: this.card_to_obj(card),
      wild: wild == WILD? '': ['A', 'S', 'D', 'F'][wild],
    });
  }
  // ディールが終了し、得点計算が終わっている状態で呼ぶ
  on_deal_end(hb) {
    this.cur_deal.scores = hb.players.map(p => { return {
      name: p.name,
      deal_score: p.katen(),
    }; });
  }
  // ゲームが終了したときに呼ぶ
  on_gameover(hb) {
    this.final_scores = hb.players.map(p => p.score);
    this.winners = hb.get_winner().map(w => w.name);
  }
}


