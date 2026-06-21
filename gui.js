// :tabnew | terminal
// <C-\><C-n> => normal
// python3 -m http.server 8080
// localhost:8080

import { HoneyBears, Player, Rand, to_sr, WILD } from "./mod/honeybears.js";
import { think_play, get_names } from './mod/think.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/////////////////////////////////////////////////////////////////////////////

// くまの位置を更新
const update_bears = hb => {
  const tr = [
    Object.values(document.getElementById('bear_tr0').children),
    Object.values(document.getElementById('bear_tr1').children),
    Object.values(document.getElementById('bear_tr2').children),
    Object.values(document.getElementById('bear_tr3').children) ];
  const COLNAME = ['bearRed', 'bearBlue', 'bearGreen', 'bearYellow'];
  for (let i = 0; i < 4; ++i) {
    const cur = tr[i];
    const idx = hb.bears[i];
    const cn = COLNAME[i];
    // くまの位置が前回の描画と違ったら
    if (! cur[idx].classList.contains(cn)) {
      cur.forEach(e => e.classList.contains(cn) && e.classList.remove(cn));
      cur[idx].classList.add(cn);
    }
  }
};

// メッセージを表示
const mes = msg => {
  document.getElementById('msg_box').textContent = msg;
};

// スート(0-4)を大文字の文字列表現に
const s2s = suit => [ 'A', 'S','D','F','W'][suit];

// カードを "大文字＋ランク" の文字列表現に
const c2s = card => {
  const [suit, rank] = to_sr(card);
  const ss = s2s(suit);
  return ss + (rank == 1? '1': '2');
}

// 画面表示用のためにカードを文字列に変換
const played_card_str = (pl, te) => {
  return `${pl.name} は ${c2s(te.card)} を` + (
    te.wild == -1?
    'プレイ':
    ` ${s2s(te.wild)} としてプレイ`);
};

class Report {
  constructor(names, seed) {
    this.players = names.map(n => ({ name: n, score: 0 }));
    this.seed = 'Seed: 0x' + seed.toString(16).toUpperCase();
  }
  update_score(scores) {
    this.players.forEach((p, i) => p.score = scores[i]);
  }
  // init_tag したあとに呼び出す
  // 手札がプレイされたときに反映
  update_tag(idx, card, wild=-1) {
    const p = Object.values(document.getElementsByClassName('report-p'))[idx];
    p.appendChild(card2tag(card, wild));
  }
  // ディールのたびに呼び出す
  // もとのテーブルは消す
  init_tag(deal_count) {
    const table = document.createElement('table');
    table.classList.add('report-table');
    const dtr = document.createElement('tr');
    const dtd = document.createElement('th');
    dtd.textContent = `Deal: ${deal_count}/${this.players.length}`;
    dtr.appendChild(dtd);
    const dts = document.createElement('th');
    dts.textContent = this.seed;
    dtr.appendChild(dts);
    table.appendChild(dtr);
    for (let p of this.players) {
      const tr = document.createElement('tr');
      const name = document.createElement('th');
      name.textContent = `${p.name} (${p.score}vp)`;
      tr.appendChild(name);
      //
      const ptag = document.createElement('p');
      ptag.classList.add('report-p');
      const te = document.createElement('td');
      te.appendChild(ptag);
      tr.appendChild(te);
      table.appendChild(tr);
    }
    return table;
  }
}

///////////////////////////////////////////////////////////////


// プレイヤーの手札を初期化
const init_hands = human => {
  const area = document.getElementById('player_hand_area');
  for (let card of human.hands) {
    const but = document.createElement('button');
    const [suit, rank] = to_sr(card);
    but.classList.add('card');
    but.classList.add(['red', 'blue', 'green', 'yellow', 'wild'][suit]);
    but.classList.add(rank == 1? "one": "two");
    but.card = card;
    but.is_wild = suit == WILD;
    area.appendChild(but);
  }
};


let g_modal_tar = null;
function on_close_modal(e) {
  const v = parseInt(e.target.returnValue);
  e.target.returnValue = -1; // ESC連打で変な動作をしてしまうので
  if (g_modal_tar != null && v != -1) {
    const area = document.getElementById('player_hand_area');
    const chi = Object.values(area.children);
    area.removeChild(g_modal_tar.btn);
    chi.forEach((e, i) => e.removeEventListener('click', g_modal_tar.f_lst[i]));
    g_modal_tar.resolve({ wild: v, card: g_modal_tar.btn.card });
  }
  g_modal_tar = null;
}

function think_human() {
  const area = document.getElementById('player_hand_area');
  const chi = Object.values(area.children);
  const f_lst = [];
  g_modal_tar = null;
  return new Promise(resolve => {
    for (let but of chi) {
      const f = e => {
        const c = e.target;
        if (c.is_wild) {
          g_modal_tar = {
            btn: c,
            f_lst: f_lst,
            resolve: resolve,
          };
          const ws = document.getElementById('wild_sel_modal');
          ws.returnValue = -1; // ESC連打で変な動作をするので
          ws.showModal();
        } else {
          chi.forEach((e, i) => e.removeEventListener('click', f_lst[i]));
          area.removeChild(c);
          resolve({ wild: -1, card: c.card});
        }
      };
      f_lst.push(f);
      but.addEventListener('click', f);
    }
  });
}



/////////////////////////////////////////////////////////////////////////////

// プレイヤー or CPU に手を決めさせる
// 返却値は { wild: -1 or ワイルドカードのときのスート, card: 使うカード }
async function think(hb) {
  const teban = hb.teban;
  let te;
  if (teban.is_human) {
    mes('あなたのターンです');
    te = await think_human(); // 手札は画面表示されているので hb は不要
  } else {
    te = think_play(hb);
  }
  const msg = played_card_str(teban, te);
  mes(msg);
  hb.report.update_tag(hb.turn, te.card, te.wild);
  hb.teban.select_card(te.card);
  const ret = hb.play_card(te.card, te.wild);
  update_bears(hb);

  const ms = parseInt(document.getElementById('wait_speed').value);
  await sleep(ms);

  return ret;
};


const card2tag = (card, wild=-1) => {
  const span = document.createElement('span');
  const [suit, rank] = to_sr(card);
  span.textContent = ['A', 'S', 'D', 'F', 'W'][suit] + ['1', '2'][rank - 1];
  span.style.color = ['crimson', 'mediumblue', 'darkgreen', 'sienna', 'purple'][suit];
  if (wild != -1) {
    const s2 = document.createElement('span');
    s2.textContent = ['a', 's', 'd', 'f'][wild];
    s2.style.color = ['crimson', 'mediumblue', 'darkgreen', 'sienna'][wild];
    span.appendChild(s2);
  }
  return span;
};

function on_deal_end(title, hb, is_gameover) {
  return new Promise(resolve => {
    const dmsg = document.getElementById('score_msg');
    dmsg.textContent = '';
    const tit = document.createElement('h4');
    tit.textContent = title;
    if (is_gameover) tit.style.color = 'orange';
    dmsg.appendChild(tit);
    //
    const thead = document.createElement('thead');
    const thtr = document.createElement('tr');
    ['名前', '手札', 'VP', '合計'].forEach(txt => {
      const th = document.createElement('th');
      th.textContent = txt;
      thtr.appendChild(th);
    });
    thead.appendChild(thtr);
    //
    const tbody = document.createElement('tbody');
    for (let pl of hb.players) {
      const tr = document.createElement('tr');
      //
      const name = document.createElement('td');
      name.textContent = pl.name;
      name.classList.add('score-name');
      tr.appendChild(name);
      //
      const hands = document.createElement('td');
      hands.classList.add('score-hands');
      pl.hands.forEach(card => {
        const span = card2tag(card);
        hands.appendChild(span);
      });
      if (hb.goal == pl) {
        const span = document.createElement('span');
        span.textContent = hb.is_hedgehogs? '(+3)': '(+6)';
        hands.appendChild(span);
      }
      tr.appendChild(hands);
      //
      const deal_pt = document.createElement('td');
      deal_pt.textContent = pl.katen();
      deal_pt.classList.add('score-pt');
      tr.appendChild(deal_pt);
      //
      const score = document.createElement('td');
      score.textContent = pl.score;
      score.classList.add('score-total');
      tr.appendChild(score);
      //
      tbody.appendChild(tr);
    }
    //
    const table = document.createElement('table');
    table.appendChild(thead);
    table.appendChild(tbody);
    dmsg.appendChild(table);
    //
    if (is_gameover) {
      const base = document.createElement('div');
      base.appendChild(document.createElement('hr'));
      let msg = '勝者: ';
      const ww = hb.get_winner(); // -> hb.is_tie がセットされる
      for (let win of ww) {
        const winner = document.createElement('p');
        winner.textContent = `勝者: ${win.name} ${win.score}vp`;
        msg += win.name + (ww.length == 1?'': '  ');
        winner.style.color = 'red';
        base.appendChild(winner);
      }
      if (hb.is_tie) {
        const p = document.createElement('p');
        p.textContent = '※タイブレークが発生';
        p.style.color = 'orange';
        base.appendChild(p);
      }
      dmsg.appendChild(base);
      mes(msg);
    }
    //
    const dlg = document.getElementById('score_dlg');
    dlg.addEventListener('close', () => resolve(), { once: true });
    //
    dlg.showModal();
  });
}

//////////////////////////////////////////////////////////////////////////////

async function mainloop(hb) {
  await sleep(1000); // 一瞬待つ
  mes(`■ディール 1/${hb.np}`);
  loop: while (true) {
    const ret = await think(hb);
    switch (ret) {
      case 'deal':
        await sleep(1000); // 一瞬待つ
        mes(`${hb.goal.name} のプレイでディール終了！ ${hb.deal_count}/${hb.np}`);
        await on_deal_end(`${hb.goal.name} のプレイでディール終了！ ${hb.deal_count}/${hb.np}`,
          hb, false);
        // 次の手札
        hb.next_deal();
        // 表示を初期化
        document.getElementById("player_hand_area").textContent = '';
        kihu_clear(hb);
        init_hands(hb.players[0]);
        update_bears(hb);
        mes(`■ディール ${hb.deal_count + 1}/${hb.np}`);
        await sleep(1000); // 一瞬待つ
        break;
      case 'gameover':
        await sleep(1000); // 一瞬待つ
        await on_deal_end(`${hb.goal.name} のプレイでゲーム終了！`,
          hb, true);
        // START ボタンをもとに戻す
        document.getElementById('game_start').disabled = false;
        break loop;
      default:
        break;
    }
  }
}

const kihu_clear = hb => {
  const ki = document.getElementById('kifu');
  ki.textContent = '';
  //
  const sc = hb.players.map(p=>p.score);
  hb.report.update_score(sc);
  ki.appendChild( hb.report.init_tag(hb.deal_count + 1) );
};


window.onload = () => {
  document.getElementById('wild_sel_modal').addEventListener('close',
    on_close_modal);
  document.getElementById('game_start').addEventListener('click', e => {
    e.target.disabled = true;
    //
    const rnd = new Rand();
    //
    const np = parseInt(document.getElementById('nplayers').value);
    const names = ['あなた', ...get_names(np - 1, rnd)];
    const is_h = document.getElementById('is_hedgehogs').checked;

    const hb = new HoneyBears(names, rnd, is_h);
    hb.players.forEach(p => p.is_human = false);
    // プレイヤーを初期化
    const human = hb.players[0];
    human.is_human = true;
    human.seikaku = 1;
    human.hands.sort(Player.sort_hands);
    document.getElementById("player_hand_area").textContent = '';
    init_hands(human);
    // 棋譜を消して
    // レポートの準備
    hb.report = new Report(names, rnd.seed);
    kihu_clear(hb);
    // くまの位置を初期化
    update_bears(hb);

    mes(`${np} 人で遊びます(ID: 0x${rnd.seed.toString(16).toUpperCase()})`);

    mainloop(hb);
  });
};

