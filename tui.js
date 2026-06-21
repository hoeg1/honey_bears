import { stdin as input, stdout as output, exit } from "node:process";
import * as readline from "node:readline/promises";
import { parseArgs, styleText } from 'node:util';
import { WILD, new_card, to_sr, HoneyBears, Rand } from './mod/honeybears.js';
import { think_play, get_names } from './mod/think.js';


const TITLE   = "Reiner Knizia's Honey Bears";
const VERSION = "0.0.1";
const VERSION_STR = `${TITLE} v${VERSION}`;
const DEF_SPEED = 0;

// ウェイト＆キー入力待ち
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pressEnter() {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question('[press Enter]\n');
  } finally {
    rl.close();
  }
}

// くまの色
const BearColor = ['red', 'blue', 'green', 'yellow', 'magenta'];

// くまの文字
const suit_char = (suit, upper=false) => {
  const ch = ['a', 's', 'd', 'f', 'w'][suit];
  return upper? ch.toUpperCase(): ch;
};

const card2str = (suit, rank, add_num=false) => {
  return styleText( BearColor[suit],
    suit_char(suit, rank === 2) +
    (add_num? rank.toString(): '') );
};

const suit2str = suit => styleText( BearColor[suit], suit_char(suit, true) );


const draw_board = (msg, hb, dc_add=1) => {
  const dc = hb.deal_count + dc_add;
  const bstr = ["", "", "", ""];
  for (let i = 0; i < 4; ++i) {
    for (let j = 0; j < 14; ++j) {
      const b = hb.bears[i] == j? card2str(i, 2): ' ';
      const cap = j === 13? '     |': ' |';
      bstr[i] += ` ${b}${cap}`;
    }
  }
  let dis = '';
  let cnt = 0;
  for (let d of hb.discards) {
    const [suit, rank] = to_sr(d);
    dis += card2str(suit, rank, true);
    cnt += 3;
    if (cnt >= 57) {
      dis += '\n          ';
      cnt = 0;
    } else {
      dis += ' ';
    }
  }
  const tit = hb.is_hedgehogs? 'R.Hedgehogs': 'Honey Bears';

  const template = ` ${msg}
  +-------+-----------------------------------------------+-------+
  | START |     Reiner Knizia's ${tit}     Deal ${dc}/${hb.np}  | GOAL! |
  +-------+---+---+---+---+---+---+---+---+---+---+---+---+-------+
  |    ${bstr[0]}
  |    ${bstr[1]}
  |    ${bstr[2]}
  |    ${bstr[3]}
  +-------+---+---+---+---+---+---+---+---+---+---+---+---+-------+
  |               -1              |   0   |   1   |   2   |   3   |
  +-------------------------------+-------+-------+-------+-------+
  pleyed: ${dis}
`;
  console.log(template);
};

const draw_hands = hands => {
  const str = ['', '', '', '', ''];
  for (let card of hands) {
    const [s, r] = to_sr(card);
    str[s] += card2str(s, r) + ' ';
  }
  console.log(`  手札: ${str[0]}  ${str[1]}  ${str[2]}  ${str[3]}  ${str[4]}`);
};

const show_score = hb => {
  for (let p of hb.players) {
    let str = (p === hb.goal ? (hb.is_hedgehogs? '+3 ': '+6'): '');
    for (let c of p.hands) {
      let sr = to_sr(c);
      str += card2str(sr[0], sr[1]) + ' ';
    }
    const k = p.katen();
    console.log(`${p.name}: ${p.score}pt (+${k}) [ ${str}]`);
  }
};

// ヒトプレイヤーの処理
async function human_play(hb) {
  const rl = readline.createInterface({ input, output });
  const name = hb.teban.name;
  const hands = hb.teban.hands;
  if (hands.length === 0) { // 普通ありえない状況
    throw new Error(`panic! ${name} の手札が無い！`);
  }
  let err_msg = '';
  try {
    while (true) {
      console.clear();
      draw_board(`${err_msg} ${name} のターン`, hb);
      draw_hands(hands);
      err_msg = "";
      const ans = (await rl.question('> ')).trim();
      // 空っぽなら無限ループ
      if (ans === '') continue;
      // そうでなければ
      let suit = -1;
      let rank = -1;
      let wild = -1;
      switch (ans.charAt(0)) {
        case 'a': suit = 0; rank = 1; break;
        case 'A': suit = 0; rank = 2; break;
        case 's': suit = 1; rank = 1; break;
        case 'S': suit = 1; rank = 2; break;
        case 'd': suit = 2; rank = 1; break;
        case 'D': suit = 2; rank = 2; break;
        case 'f': suit = 3; rank = 1; break;
        case 'F': suit = 3; rank = 2; break;
        case 'w': suit = 4; rank = 1; break;
        case 'W': suit = 4; rank = 2; break;
        case 'q': case 'Q':
          exit();
        default:
          err_msg = styleText('red', `['${ans}' を解釈できません]`);
          continue;
      }
      if (suit === WILD) {
        if (ans.length == 2) {
          switch (ans.charAt(1).toLowerCase()) {
            case 'a': wild = 0; break;
            case 's': wild = 1; break;
            case 'd': wild = 2; break;
            case 'f': wild = 3; break;
            default:
              err_msg = `[ワイルドカードのスート指定 '${ans.charAt(1)}' を解釈できません]`;
              continue;
          }
        } else {
          err_msg = styleText('red', `[ワイルドカード '${ans}' にはスートの指定が必要です]`);
          continue;
        }
      }
      const selected = new_card(suit, rank);
      if (hands.includes( selected )) {
        hb.teban.select_card(selected);
        return { // ワイルドの場合はすでに上で検証している
          wild: wild,
          card: selected,
        };
      } else {
        err_msg = styleText('red', `[手札 '${ans}' が見つかりません]`);
      }
    }
  } finally {
    rl.close();
  }
}

async function game_main(hb, speed) {
  // 最後のプレイヤーが「あなた」になる
  const human = hb.players[ hb.players.length - 1 ];
  while (true) {
    // 手番にプレイさせる
    let result; // {wild: -1 or 0-3, card: card}
    if (hb.teban === human) {
      const te = await human_play(hb);
      result = hb.play_card(te.card, te.wild);
    } else {
      const name = hb.teban.name;
      const te = think_play(hb);
      hb.teban.select_card(te.card); // 手札から消す
      result = hb.play_card(te.card, te.wild);
      // 描画
      console.clear();
      const [suit, rank] = to_sr(te.card);
      let msg = `${name} `;
      if (te.wild < 0) {
        msg += `は ${card2str(suit, rank, true)} をプレイ`;
      } else {
        msg += `は ${card2str(suit, rank, true)} を ${suit2str(te.wild)} としてプレイ`;
      }
      draw_board(msg, hb);
      draw_hands(human.hands);
      if (speed < 100) {
        await pressEnter();
      } else {
        await sleep(speed);
      }
    }
    // プレイした結果
    switch (result) {
      case 'gameover': // 全ディール終了
        console.clear();
        draw_board(`| ${styleText('yellow', 'ゲーム終了')} |`, hb, 0);
        show_score(hb);
        console.log('\n========== 勝者 ==========');
        for (let w of hb.get_winner()) {
          console.log(`${w.name}: ${w.score}pt`);
        }
        if (hb.is_tie) {
          console.log('※タイブレークが発生しました');
        }
        console.log(`\nseed: 0x${hb.rnd.seed.toString(16).toUpperCase()}`);
        ///////////////////////////////////////////////////////////////
        // output
        // writeFile
        if (hb.use_kihu) {
          try {
            readline.writeFile(hb.kihu_fn, JSON.stringify(hb.kihu), 'utf8');
          } catch (er) {
            console.error(`${hb.kihu_fn} への書き込みでエラーが発生: ${er}`);
          }
        }
        // ループを抜ける
        return;
      case 'deal': // 次のディール
        console.clear();
        draw_board(`${hb.goal.name} のプレイでディール終了！ (${hb.deal_count}/${hb.np})`,
          hb, 0);
        show_score(hb);
        console.log(`\nキー入力で 第${hb.deal_count + 1} ディールを始めます\n`);
        await pressEnter();
        hb.next_deal();
        break;
      default: // 次のプレイヤーの手番
        break;
    }
  }
}

function show_usage() {
  console.log(`${VERSION_STR}:

--help, -h           ... このヘルプを表示。
--version, -v        ... バージョンを表示。

--speed, -s   N      ... N に 100 以上の自然数を指定した場合、CPU が手を
                         打ったあと N ミリ秒待ったら自動で次の手番に移る。
--seed, -r    N      ... N は自然数。ゲームのシード値を指定する。
                         0x で始まる16進数を指定してもよい。
--out, -o [fn]       ... ゲームが普通に終了したとき [fn] に JSON で棋譜を保存。

  プレイ人数は指定なしなら５人で、あなたを含めた３〜５人でプレイできる。

--players, -p = N    ... 自然数 N で指定した人数でプレイする。
                           指定できる数は半角で 3, 4, 5 のどれか。
                           CPU の名前はランダムに決まる。
--names, -n = [list] ... [list] で指定した名前のリストを使ってプレイする。
                           例) -n Alice Bob Criss
                           名前のリストにあなたを追加してプレイするため、
                           リストの人数は ２〜４人 でなければならない。
                           名前に使った文字によって CPU の振る舞いが変わる。
                           設定された場合、上記の -p は無視される。
--headgehogs, -g     ... 得点ルールを「急げハリネズミ」に変更する。
                           得点は「どれも１倍、ゴール３点」になる。

[ ゲームのルール ]

・目標
  ＡＳＤＦの４色のくまのうち、どれかひとつがゴールしたとき手札に応じて
勝利点を得るレースゲーム。
  全員がスタートプレイヤーを務めたあと、最も勝利点を持つプレイヤーが優勝。

・使う道具
  １４マスのすごろくボードがあり、各マス目には -1 から +3 点の勝利点が
記されている。
  ゲームにはさらに５スートに分かれるカードが合計５５枚あり、各スートは
ランク１のカード６枚とランク２のカード５枚の１１枚で構成されている。
そのうち４スートはくまの色に対応し、残る１スートはワイルドカード。

・ディール
  ４色のくまをスタート位置に配置する。
  プレイヤーには人数に応じた手札が配られ、乱数で決められたスタートプレイヤー
からプレイを始める。

    ３人のとき……１５枚の手札
    ４人のとき……１３枚の手札
    ５人のとき……１１枚の手札

  いずれの場合も配り残しのカードはこのディールで使わない。

・プレイ
  プレイヤーは表示された手札のうち好きな１枚を次のように記入する:

  asdfASDF ... 対応する色のくまを小文字なら１マス、大文字なら２マス進める。
  w? or W? ... ワイルドカードを使う。
                 ? の部分に asdf の形でスートを指定し、元の w or W が
                 小文字なら１マス、大文字なら２マスだけ指定したスートのくまを
                 前進させる。asdf 部分の大小は無視される。

  q or Q   ... 強制終了する。

・スコア
  いずれかのくまがゴールに到達したらディール終了。
  すべてのプレイヤーは次のように勝利点を得る:
    ワイルドスート : ランクが１でも２でも０勝利点。
    各スートの２   : 同じ色のくまがいる位置のボードに書かれた勝利点の２倍。
    各スートの１   : その色の枚数を２で割り、商と余りについて：
                       商 × 対応するくまの勝利点 × ５
                       余り × 対応するくまの勝利点
                     の合計を得点する。要するに、ペアは５倍ということ。

  ・オプションルール「急げハリネズミ」
    得点を、ワイルドは０点、各色の１や２のランクはどれも「その色のくまの点」
    として計算する。ゴールした人は３点を得る。

・ゲームの終了
  スコアを済ませたら席順でスタートプレイヤーを交代し次のディールを始める。
  全員がスタートプレイヤーを務めたらゲーム終了。
  累計勝利点が最多のプレイヤーの勝ち。もし同点なら最後のディールで最も多くの
勝利点を得たプレイヤーの勝ち。それすら同点なら（ルールにその状況についての記載
がないので）、このアプリでは該当する全員の勝ちとする。
`);
}



function main(args) {
  let nplayers = 5;
  let speed = DEF_SPEED;
  let names = [];
  let seed = Math.trunc(Math.random() * 123456789);
  let rnd = null;
  let ofn = undefined;
  let is_h = false;

  if (args !== null) {
    if (args.help) {
      show_usage(); exit();
    }
    if (args.version) {
      console.log(VERSION_STR); exit();
    }
    if (args.speed !== undefined) {
      speed = parseInt(args.speed);
      if (speed === NaN) {
        console.log(`遷移速度 '${args.speed}' を解釈できません`);
        exit();
      }
    }
    if (args.seed !== undefined) {
      seed = parseInt(args.seed, /^0x[a-fA-F0-9]+$/.test(args.seed)? 16: 10);
      if (seed === NaN) {
        console.log(`乱数シード '${args.speed}' を解釈できません`);
        exit();
      }
    }
    if (args.names === undefined && args.players !== undefined) {
      nplayers = parseInt(args.players);
      if (nplayers === NaN) {
        console.log(`参加人数 '${args.players}' を解釈できません`);
        exit();
      }
      if (nplayers < 3 || nplayers > 5) {
        console.log(`${nplayers}人 では遊べません。`);
        exit();
      }
    }
    if (args.names !== undefined) {
      nplayers = args.names.length + 1;
      if (nplayers < 3 || nplayers > 5) {
        console.log(`無効な参加人数です: ${args.names.length} + あなた = ${nplayers}人`);
        exit();
      } else {
        names = args.names;
      }
    }
    if (args.headgehogs) {
      is_h = true;
    }
    if (args.out !== undefined) {
      ofn = args.out;
    }
  }
  if (rnd === null) {
    rnd = new Rand(seed);
  }
  if (names.length === 0) {
    names = get_names(nplayers - 1, rnd);
  }
  names.push('あなた');

  const hb = new HoneyBears(names, rnd, is_h, ofn);
  game_main(hb, speed);
}


// start
(function (){
  const { values } = parseArgs({
    options: {
      help: {
        type: 'boolean',
        short: 'h',
      },
      version: {
        type: 'boolean',
        short: 'v',
      },
      seed: {
        type: 'string',
        short: 'r',
      },
      speed: {
        type: 'string',
        short: 's',
      },
      players: {
        type: 'string',
        short: 'p',
      },
      names: {
        type: 'string',
        short: 'n',
        multiple: true,
      },
      headgehogs: {
        type: 'boolean',
        short: 'g',
      },
      out: {
        type: 'string',
        short: 'o',
      },
    },
  });
  main(values);
})();


