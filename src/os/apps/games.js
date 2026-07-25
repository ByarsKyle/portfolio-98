// ─────────────────────────────────────────────────────────────
// apps/games — Minesweeper (complete, with flood fill and flags)
// and Snake.
// ─────────────────────────────────────────────────────────────
import { C, FONT, bevelOut, bevelIn, fill, text, button, drawIcon } from '../ui.js';

// ── shared: the LED segment display from Minesweeper ─────────
function ledDigits(ctx, x, y, value, count = 3) {
  const dw = 13, dh = 23;
  fill(ctx, x, y, dw * count + 2, dh + 2, '#000000');
  const str = value < 0
    ? `-${String(Math.abs(value)).padStart(count - 1, '0')}`
    : String(Math.min(999, value)).padStart(count, '0');
  const SEG = {
    0: [1, 1, 1, 1, 1, 1, 0], 1: [0, 1, 1, 0, 0, 0, 0], 2: [1, 1, 0, 1, 1, 0, 1],
    3: [1, 1, 1, 1, 0, 0, 1], 4: [0, 1, 1, 0, 0, 1, 1], 5: [1, 0, 1, 1, 0, 1, 1],
    6: [1, 0, 1, 1, 1, 1, 1], 7: [1, 1, 1, 0, 0, 0, 0], 8: [1, 1, 1, 1, 1, 1, 1],
    9: [1, 1, 1, 1, 0, 1, 1], '-': [0, 0, 0, 0, 0, 0, 1],
  };
  for (let i = 0; i < str.length; i++) {
    const segs = SEG[str[i]] ?? SEG[0];
    const ox = x + 1 + i * dw, oy = y + 1;
    const on = '#ff2020', off = '#3a0808';
    const T = 2.5, W = 9, H = 9;
    const bar = (bx, by, bw, bh, lit) => { ctx.fillStyle = lit ? on : off; ctx.fillRect(ox + bx, oy + by, bw, bh); };
    bar(2.5, 1, W, T, segs[0]);            // top
    bar(2.5 + W, 2, T, H, segs[1]);        // top right
    bar(2.5 + W, 2 + H + 1, T, H, segs[2]);// bottom right
    bar(2.5, 2 + H * 2 + 1, W, T, segs[3]);// bottom
    bar(1, 2 + H + 1, T, H, segs[4]);      // bottom left
    bar(1, 2, T, H, segs[5]);              // top left
    bar(2.5, 2 + H, W, T, segs[6]);        // middle
  }
  return { w: dw * count + 2, h: dh + 2 };
}

// ── Minesweeper ──────────────────────────────────────────────
export const minesweeper = {
  title: 'Minesweeper',
  icon: 'mine',
  w: 164, h: 226,
  single: true,
  resizable: false,

  create(arg, api) {
    const LEVELS = {
      beginner: { cols: 9, rows: 9, mines: 10 },
      intermediate: { cols: 16, rows: 16, mines: 40 },
    };
    let level = 'beginner';
    const st = {
      cols: 9, rows: 9, mines: 10,
      grid: [], revealed: [], flags: [],
      state: 'ready',   // ready | playing | won | lost
      time: 0, face: 'smile', pressed: -1, firstClick: true,
    };

    const CELL = 16;
    const PAD = 9;

    function sizeFor(lv) {
      const L = LEVELS[lv];
      return {
        w: L.cols * CELL + PAD * 2 + 6,
        h: L.rows * CELL + PAD * 2 + 37 + 22 + 6,
      };
    }

    function reset(lv = level) {
      level = lv;
      const L = LEVELS[lv];
      st.cols = L.cols; st.rows = L.rows; st.mines = L.mines;
      st.grid = Array(st.cols * st.rows).fill(0);
      st.revealed = Array(st.cols * st.rows).fill(false);
      st.flags = Array(st.cols * st.rows).fill(0);
      st.state = 'ready'; st.time = 0; st.face = 'smile'; st.firstClick = true;
      const sz = sizeFor(lv);
      app.w = sz.w; app.h = sz.h;
      if (app._win) { app._win.w = sz.w; app._win.h = sz.h; }
    }

    function placeMines(safeIdx) {
      const n = st.cols * st.rows;
      const spots = [];
      for (let i = 0; i < n; i++) {
        if (i === safeIdx) continue;
        // keep the 3x3 around the first click clear
        const r0 = Math.floor(safeIdx / st.cols), c0 = safeIdx % st.cols;
        const r = Math.floor(i / st.cols), c = i % st.cols;
        if (Math.abs(r - r0) <= 1 && Math.abs(c - c0) <= 1) continue;
        spots.push(i);
      }
      for (let i = spots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }
      for (let i = 0; i < st.mines; i++) st.grid[spots[i]] = -1;
      // neighbour counts
      for (let i = 0; i < n; i++) {
        if (st.grid[i] === -1) continue;
        let c = 0;
        forNeighbours(i, (ni) => { if (st.grid[ni] === -1) c++; });
        st.grid[i] = c;
      }
    }

    function forNeighbours(i, fn) {
      const r = Math.floor(i / st.cols), c = i % st.cols;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= st.rows || nc < 0 || nc >= st.cols) continue;
        fn(nr * st.cols + nc);
      }
    }

    function reveal(i) {
      if (st.revealed[i] || st.flags[i] === 1) return;
      st.revealed[i] = true;
      if (st.grid[i] === -1) {
        st.state = 'lost'; st.face = 'dead';
        for (let k = 0; k < st.grid.length; k++) if (st.grid[k] === -1) st.revealed[k] = true;
        api.sound('error');
        return;
      }
      if (st.grid[i] === 0) forNeighbours(i, reveal);
    }

    function checkWin() {
      const n = st.cols * st.rows;
      let hidden = 0;
      for (let i = 0; i < n; i++) if (!st.revealed[i]) hidden++;
      if (hidden === st.mines) {
        st.state = 'won'; st.face = 'cool';
        for (let i = 0; i < n; i++) if (st.grid[i] === -1) st.flags[i] = 1;
        api.sound('ding');
      }
    }

    const NUM_COLORS = ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000000', '#808080'];

    const app = {
      title: 'Minesweeper', icon: 'mine',
      w: sizeFor('beginner').w, h: sizeFor('beginner').h,
      resizable: false,
      menus: [
        { label: 'Game', items: [
          { label: 'New', id: 'new', accel: 'F2' }, '-',
          { label: 'Beginner', id: 'beginner', checked: true },
          { label: 'Intermediate', id: 'intermediate' },
          '-', { label: 'Exit', id: 'exit' },
        ] },
        { label: 'Help', items: [{ label: 'About Minesweeper', id: 'about' }] },
      ],
      init(win) { app._win = win; reset('beginner'); win.w = app.w; win.h = app.h; },
      command(id, win, papi) {
        if (id === 'new' || id === 'New') reset();
        else if (id === 'beginner' || id === 'Beginner') {
          reset('beginner'); win.w = app.w; win.h = app.h;
          app.menus[0].items[2].checked = true; app.menus[0].items[3].checked = false;
        } else if (id === 'intermediate' || id === 'Intermediate') {
          reset('intermediate'); win.w = app.w; win.h = app.h;
          app.menus[0].items[2].checked = false; app.menus[0].items[3].checked = true;
        } else if (id === 'exit' || id === 'Exit') papi.close(win);
        else if (id === 'about' || id?.startsWith('About')) {
          papi.messageBox('About Minesweeper',
            'Minesweeper\n\nThe original time sink.\nRight-click to flag. Do not click the mine.',
            { icon: 'mine', w: 280 });
        }
      },
      key(e, win, papi) {
        if (e.key === 'F2') reset();
      },
      update(dt) {
        if (st.state === 'playing') st.time += dt;
      },
      draw(ctx, r, win, papi) {
        fill(ctx, r.x, r.y, r.w, r.h, C.face);
        const x0 = r.x + 3, y0 = r.y + 3;
        const bw = st.cols * CELL, bh = st.rows * CELL;
        const panelW = bw + 12;

        // outer sunken panel
        bevelOut(ctx, x0, y0, panelW, bh + 12 + 37, 2);

        // header
        bevelIn(ctx, x0 + 6, y0 + 6, bw, 25);
        ledDigits(ctx, x0 + 9, y0 + 8, Math.max(0, st.mines - st.flags.filter((f) => f === 1).length));
        ledDigits(ctx, x0 + bw - 41, y0 + 8, Math.floor(st.time));

        // face button
        const fx = x0 + 6 + bw / 2 - 13, fy = y0 + 8;
        button(ctx, fx, fy, 26, 22, null, { pressed: st.pressed === -2 });
        drawFace(ctx, fx + 13, fy + 11, st.face, st.pressed >= 0 && st.state === 'playing');
        st.faceRect = { x: fx, y: fy, w: 26, h: 22 };

        // board
        const bx = x0 + 6, by = y0 + 37;
        bevelIn(ctx, bx - 3, by - 3, bw + 6, bh + 6);
        st.boardRect = { x: bx, y: by, w: bw, h: bh };

        for (let i = 0; i < st.cols * st.rows; i++) {
          const cx = bx + (i % st.cols) * CELL;
          const cy = by + Math.floor(i / st.cols) * CELL;
          if (st.revealed[i]) {
            fill(ctx, cx, cy, CELL, CELL, '#c0c0c0');
            ctx.fillStyle = '#808080';
            ctx.fillRect(cx, cy, CELL, 1); ctx.fillRect(cx, cy, 1, CELL);
            if (st.grid[i] === -1) {
              // mine
              fill(ctx, cx, cy, CELL, CELL, st.flags[i] === 3 ? '#ff0000' : '#c0c0c0');
              ctx.fillStyle = '#000';
              ctx.beginPath(); ctx.arc(cx + 8, cy + 8, 4.4, 0, Math.PI * 2); ctx.fill();
              ctx.fillRect(cx + 7, cy + 2, 2, 12); ctx.fillRect(cx + 2, cy + 7, 12, 2);
              ctx.fillRect(cx + 4, cy + 4, 8, 8);
              ctx.fillStyle = '#fff'; ctx.fillRect(cx + 5.5, cy + 5.5, 2, 2);
            } else if (st.grid[i] > 0) {
              text(ctx, String(st.grid[i]), cx + CELL / 2, cy + CELL / 2 + 1, {
                align: 'center', baseline: 'middle',
                font: 'bold 12px Tahoma, sans-serif', color: NUM_COLORS[st.grid[i]],
              });
            }
          } else {
            fill(ctx, cx, cy, CELL, CELL, '#c0c0c0');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(cx, cy, CELL - 1, 2); ctx.fillRect(cx, cy, 2, CELL - 1);
            ctx.fillStyle = '#808080';
            ctx.fillRect(cx, cy + CELL - 2, CELL, 2); ctx.fillRect(cx + CELL - 2, cy, 2, CELL);
            if (st.flags[i] === 1) {
              ctx.fillStyle = '#ff0000';
              ctx.beginPath();
              ctx.moveTo(cx + 5, cy + 4); ctx.lineTo(cx + 11, cy + 7); ctx.lineTo(cx + 5, cy + 10);
              ctx.closePath(); ctx.fill();
              ctx.fillStyle = '#000';
              ctx.fillRect(cx + 4, cy + 4, 1.5, 7);
              ctx.fillRect(cx + 3, cy + 11, 8, 2);
            } else if (st.flags[i] === 2) {
              text(ctx, '?', cx + CELL / 2, cy + CELL / 2, {
                align: 'center', baseline: 'middle', font: 'bold 12px Tahoma', color: '#000',
              });
            }
          }
        }
      },
      mouse(type, x, y, btn, win, papi) {
        const b = win.maximized ? { x: 0, y: 0 } : { x: win.x, y: win.y };
        const ax = x + b.x + 3, ay = y + b.y + 40;
        const fr = st.faceRect;
        if (fr && ax >= fr.x && ax <= fr.x + fr.w && ay >= fr.y && ay <= fr.y + fr.h) {
          if (type === 'down') st.pressed = -2;
          if (type === 'up' && st.pressed === -2) { reset(); papi.sound('click'); }
          if (type === 'up') st.pressed = -1;
          return;
        }
        const br = st.boardRect;
        if (!br) return;
        const cx = Math.floor((ax - br.x) / CELL);
        const cy = Math.floor((ay - br.y) / CELL);
        if (cx < 0 || cx >= st.cols || cy < 0 || cy >= st.rows) { if (type === 'up') st.pressed = -1; return; }
        const i = cy * st.cols + cx;

        if (st.state === 'won' || st.state === 'lost') return;

        if (type === 'down') {
          if (btn === 2) {
            if (!st.revealed[i]) {
              st.flags[i] = (st.flags[i] + 1) % 3;
              papi.sound('click');
            }
            return;
          }
          st.pressed = i;
        } else if (type === 'up') {
          if (btn === 2) return;
          if (st.pressed === i) {
            if (st.firstClick) { placeMines(i); st.firstClick = false; st.state = 'playing'; }
            if (st.revealed[i] && st.grid[i] > 0) {
              // chord: if flags match the number, open the rest
              let f = 0;
              forNeighbours(i, (ni) => { if (st.flags[ni] === 1) f++; });
              if (f === st.grid[i]) forNeighbours(i, (ni) => { if (st.flags[ni] !== 1) reveal(ni); });
            } else {
              reveal(i);
            }
            if (st.state !== 'lost') checkWin();
            papi.sound('click');
          }
          st.pressed = -1;
        }
      },
    };

    function drawFace(ctx, cx, cy, face, oh) {
      ctx.fillStyle = '#ffff00';
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#000';
      if (face === 'dead') {
        // X eyes
        for (const ex of [-3.5, 3.5]) {
          ctx.beginPath();
          ctx.moveTo(cx + ex - 2, cy - 4); ctx.lineTo(cx + ex + 2, cy);
          ctx.moveTo(cx + ex + 2, cy - 4); ctx.lineTo(cx + ex - 2, cy);
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(cx, cy + 5, 3, Math.PI, 0); ctx.stroke();
      } else if (face === 'cool') {
        ctx.fillRect(cx - 6, cy - 4, 12, 3.5);
        ctx.beginPath(); ctx.arc(cx, cy + 2, 3.5, 0.2, Math.PI - 0.2); ctx.stroke();
      } else {
        ctx.fillRect(cx - 4.5, cy - 3.5, 2, 3);
        ctx.fillRect(cx + 2.5, cy - 3.5, 2, 3);
        ctx.beginPath();
        if (oh) { ctx.arc(cx, cy + 3, 2.6, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.arc(cx, cy + 1.5, 3.6, 0.25, Math.PI - 0.25); ctx.stroke(); }
      }
    }

    return app;
  },
};

// ── Snake ────────────────────────────────────────────────────
export const snake = {
  title: 'Snake',
  icon: 'game',
  w: 268, h: 246,
  single: true,
  resizable: false,

  create(arg, api) {
    const COLS = 24, ROWS = 18, CELL = 10;
    const st = {
      snake: [], dir: [1, 0], next: [1, 0], food: null,
      score: 0, best: 0, alive: false, tick: 0, speed: 0.11, over: false,
    };

    function reset() {
      st.snake = [[6, 9], [5, 9], [4, 9]];
      st.dir = [1, 0]; st.next = [1, 0];
      st.score = 0; st.alive = true; st.over = false; st.speed = 0.115;
      dropFood();
    }
    function dropFood() {
      let p;
      do {
        p = [Math.floor(Math.random() * COLS), Math.floor(Math.random() * ROWS)];
      } while (st.snake.some((s) => s[0] === p[0] && s[1] === p[1]));
      st.food = p;
    }

    const app = {
      title: 'Snake', icon: 'game', w: 268, h: 246, resizable: false,
      menus: [
        { label: 'Game', items: [{ label: 'New Game', id: 'new', accel: 'F2' }, '-', { label: 'Exit', id: 'exit' }] },
        { label: 'Help', items: [{ label: 'How to play', id: 'help' }] },
      ],
      init() { reset(); st.alive = false; },
      command(id, win, papi) {
        if (id === 'new' || id === 'New Game') reset();
        else if (id === 'exit' || id === 'Exit') papi.close(win);
        else papi.messageBox('Snake', 'Arrow keys to steer.\nEat the squares. Do not eat yourself.', { icon: 'game' });
      },
      key(e) {
        const k = e.key;
        if (k === 'F2' || (!st.alive && (k === ' ' || k === 'Enter'))) { reset(); return; }
        const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
                    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[k];
        if (d && (d[0] !== -st.dir[0] || d[1] !== -st.dir[1])) st.next = d;
      },
      update(dt, win, papi) {
        if (!st.alive) return;
        st.tick += dt;
        if (st.tick < st.speed) return;
        st.tick = 0;
        st.dir = st.next;
        const head = [st.snake[0][0] + st.dir[0], st.snake[0][1] + st.dir[1]];
        if (head[0] < 0 || head[0] >= COLS || head[1] < 0 || head[1] >= ROWS
            || st.snake.some((s) => s[0] === head[0] && s[1] === head[1])) {
          st.alive = false; st.over = true;
          st.best = Math.max(st.best, st.score);
          papi.sound('error');
          return;
        }
        st.snake.unshift(head);
        if (head[0] === st.food[0] && head[1] === st.food[1]) {
          st.score += 10;
          st.speed = Math.max(0.05, st.speed * 0.97);
          dropFood();
          papi.sound('ding', { soft: true });
        } else st.snake.pop();
      },
      draw(ctx, r) {
        fill(ctx, r.x, r.y, r.w, r.h, C.face);
        const bx = r.x + 6, by = r.y + 24;
        bevelIn(ctx, bx - 3, by - 3, COLS * CELL + 6, ROWS * CELL + 6);
        fill(ctx, bx, by, COLS * CELL, ROWS * CELL, '#98a888');

        // score bar
        bevelIn(ctx, r.x + 6, r.y + 4, r.w - 12, 16);
        text(ctx, `Score: ${st.score}`, r.x + 11, r.y + 12, { baseline: 'middle', font: FONT.ui });
        text(ctx, `Best: ${st.best}`, r.x + r.w - 11, r.y + 12, { baseline: 'middle', align: 'right', font: FONT.ui });

        // food
        if (st.food) {
          fill(ctx, bx + st.food[0] * CELL + 1, by + st.food[1] * CELL + 1, CELL - 2, CELL - 2, '#303020');
        }
        // snake
        st.snake.forEach((s, i) => {
          const px = bx + s[0] * CELL, py = by + s[1] * CELL;
          fill(ctx, px + 0.5, py + 0.5, CELL - 1, CELL - 1, '#303020');
          if (i === 0) {
            fill(ctx, px + 2, py + 2, CELL - 4, CELL - 4, '#98a888');
            fill(ctx, px + 3.5, py + 3.5, CELL - 7, CELL - 7, '#303020');
          }
        });

        if (!st.alive) {
          const msg = st.over ? 'GAME OVER' : 'SNAKE';
          const sub = st.over ? 'Press F2 or Space' : 'Press Space to start';
          ctx.save();
          ctx.globalAlpha = 0.86;
          fill(ctx, bx + 20, by + ROWS * CELL / 2 - 26, COLS * CELL - 40, 52, '#c0c0c0');
          bevelOut(ctx, bx + 20, by + ROWS * CELL / 2 - 26, COLS * CELL - 40, 52);
          ctx.restore();
          text(ctx, msg, bx + COLS * CELL / 2, by + ROWS * CELL / 2 - 10, {
            align: 'center', baseline: 'middle', font: 'bold 14px Tahoma, sans-serif',
          });
          text(ctx, sub, bx + COLS * CELL / 2, by + ROWS * CELL / 2 + 10, {
            align: 'center', baseline: 'middle', font: FONT.small,
          });
        }
      },
    };
    return app;
  },
};
