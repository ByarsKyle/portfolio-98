// ─────────────────────────────────────────────────────────────
// os/os.js — a Windows 98 workalike rendered to a 640×480 canvas.
//
// POST → boot splash → desktop, with a real window manager: drag,
// focus, z-order, minimise/maximise, menus, dialogs, a taskbar with
// a working clock, and a screensaver that kicks in when you idle.
//
// The canvas is used directly as the CRT's texture, so what you see
// on the desk and what you see in fullscreen are literally the same
// pixels.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import {
  C, FONT, bevelOut, bevelIn, etchIn, fill, text, textDisabled, button,
  titleBar, menuBar, menuPanel, drawIcon, progressBar, scrollBar, arrow,
} from './ui.js';
import { Noise2D, mulberry32 } from '../forge/noise.js';
import { APPS } from './apps/index.js';

export const W = 640, H = 480;
const TASKBAR_H = 28;

export function createOS() {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  ctx.imageSmoothingEnabled = false;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  // ── state ──────────────────────────────────────────────────
  const S = {
    phase: 'post',        // post | boot | desktop | shutdown | off
    t: 0,
    phaseT: 0,
    windows: [],
    nextId: 1,
    zTop: 10,
    focus: null,
    startOpen: false,
    startHover: -1,
    startSub: null,
    startSubHover: -1,
    menu: null,           // {win, barIndex, items, hover, x, y}
    desktopSel: -1,
    dragging: null,
    mouse: { x: 320, y: 240, down: false, inside: false },
    lastClick: { t: -1, x: 0, y: 0, target: null },
    idle: 0,
    saver: false,
    saverT: 0,
    dialup: { state: 'offline', progress: 0, t: 0 },  // offline|dialing|handshake|online
    busy: false,
    sound: null,          // set by the audio bus
    tray: { volume: true, modem: false },
    bsod: null,
    toast: null,
    dirty: true,
    bootLog: [],
  };

  // ── desktop icons ──────────────────────────────────────────
  const desktopIcons = [
    { icon: 'me', label: 'My Portfolio', app: 'browser', arg: 'home' },
    { icon: 'computer', label: 'My Computer', app: 'computer' },
    { icon: 'ie', label: 'Internet\nExplorer', app: 'browser' },
    { icon: 'modem', label: 'Dial-Up\nNetworking', app: 'dialup' },
    { icon: 'notepad', label: 'README.TXT', app: 'notepad', arg: 'readme' },
    { icon: 'mine', label: 'Minesweeper', app: 'minesweeper' },
    { icon: 'game', label: 'Snake', app: 'snake' },
    { icon: 'paint', label: 'Paint', app: 'paint' },
    { icon: 'media', label: 'Media Player', app: 'media' },
    { icon: 'recycle', label: 'Recycle Bin', app: 'recycle' },
  ];

  // ── wallpaper: procedural clouds, baked once ───────────────
  const wallpaper = (() => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H - TASKBAR_H;
    const g = c.getContext('2d');
    const n = new Noise2D(4242);
    const img = g.createImageData(c.width, c.height);
    const d = img.data;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const f = n.fbm(x * 0.006, y * 0.008, 6) * 0.5 + 0.5;
        // a touch deeper than the real Clouds.bmp so the white icon labels
        // stay readable over it
        const cloud = Math.max(0, f - 0.46) * 1.9;
        const sky = 1 - y / c.height;
        const r = 26 + sky * 34 + cloud * 150;
        const gg = 74 + sky * 46 + cloud * 132;
        const b = 140 + sky * 44 + cloud * 84;
        const i = (y * c.width + x) * 4;
        d[i] = Math.min(255, r); d[i + 1] = Math.min(255, gg); d[i + 2] = Math.min(255, b); d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  })();

  // ── app registry / api ─────────────────────────────────────
  const api = {
    get state() { return S; },
    open,
    close,
    focusWindow,
    messageBox,
    sound: (name, opts) => S.sound?.(name, opts),
    setBusy: (v) => { S.busy = v; },
    dialup: S.dialup,
    connect: startDial,
    disconnect: () => { S.dialup.state = 'offline'; S.tray.modem = false; },
    toast: (msg) => { S.toast = { msg, t: 0 }; },
    crash: (reason) => { S.bsod = { reason, t: 0 }; },
    W, H, TASKBAR_H,
  };

  function open(appName, arg, opts = {}) {
    const def = APPS[appName];
    if (!def) return null;
    // single-instance apps focus instead of spawning
    if (def.single) {
      const existing = S.windows.find((w) => w.appName === appName);
      if (existing) {
        existing.minimized = false;
        focusWindow(existing);
        if (arg !== undefined && existing.app.setArg) existing.app.setArg(arg, existing, api);
        return existing;
      }
    }
    const app = def.create ? def.create(arg, api) : { ...def };
    const w = {
      id: S.nextId++,
      appName,
      app,
      title: app.title ?? def.title ?? appName,
      icon: app.icon ?? def.icon ?? 'doc',
      x: opts.x ?? Math.round(28 + (S.windows.length % 5) * 22),
      y: opts.y ?? Math.round(24 + (S.windows.length % 5) * 20),
      w: app.w ?? def.w ?? 400,
      h: app.h ?? def.h ?? 300,
      minimized: false,
      maximized: false,
      z: ++S.zTop,
      menuOpen: -1,
      scroll: 0,
      state: {},
    };
    w.x = Math.max(0, Math.min(W - w.w, w.x));
    w.y = Math.max(0, Math.min(H - TASKBAR_H - w.h, w.y));
    S.windows.push(w);
    focusWindow(w);
    app.init?.(w, api);
    S.sound?.('open');
    return w;
  }

  function close(win) {
    win.app.dispose?.(win, api);
    S.windows = S.windows.filter((x) => x !== win);
    if (S.focus === win) {
      const rest = S.windows.filter((x) => !x.minimized).sort((a, b) => b.z - a.z);
      S.focus = rest[0] ?? null;
    }
    S.sound?.('close');
  }

  function focusWindow(win) {
    if (!win) return;
    S.focus = win;
    win.z = ++S.zTop;
  }

  function messageBox(title, message, { icon = 'info', buttons = ['OK'], onResult, w: mw = 300 } = {}) {
    const lines = String(message).split('\n');
    const h = Math.max(110, 74 + lines.length * 14);
    const win = {
      id: S.nextId++, appName: '__dialog', title, icon: null,
      x: Math.round((W - mw) / 2), y: Math.round((H - TASKBAR_H - h) / 2 - 10),
      w: mw, h, minimized: false, maximized: false, z: ++S.zTop, menuOpen: -1,
      dialog: true, state: {},
      app: {
        noMenu: true, noMinMax: true,
        draw(c, r) {
          fill(c, r.x, r.y, r.w, r.h, C.face);
          drawIcon(c, icon, r.x + 14, r.y + 14, 32);
          lines.forEach((ln, i) =>
            text(c, ln, r.x + 58, r.y + 20 + i * 14, { font: FONT.ui }));
          const bw = 74, bh = 21;
          const total = buttons.length * bw + (buttons.length - 1) * 8;
          let bx = r.x + (r.w - total) / 2;
          win.state.btnRects = [];
          buttons.forEach((b, i) => {
            button(c, bx, r.y + r.h - 30, bw, bh, b, {
              pressed: win.state.pressed === i, focus: i === 0,
            });
            win.state.btnRects.push({ x: bx, y: r.y + r.h - 30, w: bw, h: bh, label: b });
            bx += bw + 8;
          });
        },
        mouse(type, x, y, btn, wn) {
          const rects = wn.state.btnRects || [];
          const hit = rects.findIndex((b) => x >= b.x - wn.x && x <= b.x - wn.x + b.w && y >= b.y - wn.y && y <= b.y - wn.y + b.h);
          // coordinates arrive window-relative; rects are absolute — normalise
          const ax = x + wn.x, ay = y + wn.y;
          const idx = rects.findIndex((b) => ax >= b.x && ax <= b.x + b.w && ay >= b.y && ay <= b.y + b.h);
          if (type === 'down') wn.state.pressed = idx;
          if (type === 'up') {
            if (idx >= 0 && idx === wn.state.pressed) {
              close(wn);
              onResult?.(rects[idx].label);
              S.sound?.('click');
            }
            wn.state.pressed = -1;
          }
        },
        key(e, wn) {
          if (e.key === 'Enter' || e.key === 'Escape') { close(wn); onResult?.(buttons[0]); }
        },
      },
    };
    S.windows.push(win);
    focusWindow(win);
    S.sound?.(icon === 'error' ? 'error' : 'ding');
    return win;
  }

  function startDial() {
    if (S.dialup.state !== 'offline') return;
    S.dialup.state = 'dialing';
    S.dialup.t = 0;
    S.dialup.progress = 0;
    S.sound?.('dialup');
  }

  // ── layout helpers ─────────────────────────────────────────
  const winContent = (w) => {
    const bounds = winBounds(w);
    const top = bounds.y + (w.dialog ? 22 : 22) + (w.app.menus ? 18 : 0);
    return {
      x: bounds.x + 3,
      y: top,
      w: bounds.w - 6,
      h: bounds.h - (top - bounds.y) - 3,
    };
  };
  const winBounds = (w) => w.maximized
    ? { x: 0, y: 0, w: W, h: H - TASKBAR_H }
    : { x: w.x, y: w.y, w: w.w, h: w.h };

  // ── drawing ────────────────────────────────────────────────
  function drawPOST() {
    fill(ctx, 0, 0, W, H, '#000000');
    const t = S.phaseT;
    const lines = [
      'Award Modular BIOS v4.51PG, An Energy Star Ally',
      'Copyright (C) 1984-98, Award Software, Inc.',
      '',
      'DIMENSION XPS T500  BIOS Revision A11',
      '',
      `Main Processor : Pentium III 500 MHz`,
      `Memory Testing : ${Math.min(131072, Math.floor(t * 190000)).toString().padStart(6)}K OK`,
      '',
    ];
    ctx.font = '13px "Courier New", monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#c8c8c8';
    lines.forEach((l, i) => ctx.fillText(l, 24, 24 + i * 16));

    if (t > 0.75) {
      const more = [
        'Detecting IDE Primary Master  ... QUANTUM FIREBALL 8.4GB',
        'Detecting IDE Primary Slave   ... None',
        'Detecting IDE Secondary Master... CD-ROM 48X',
        'Detecting IDE Secondary Slave ... None',
      ];
      const shown = Math.min(more.length, Math.floor((t - 0.75) * 6));
      for (let i = 0; i < shown; i++) ctx.fillText(more[i], 24, 24 + (lines.length + i) * 16);
    }
    if (t > 1.6) {
      ctx.fillStyle = '#c8c8c8';
      ctx.fillText('Verifying DMI Pool Data ...', 24, 24 + 13 * 16);
    }
    if (t > 2.1) {
      ctx.fillText('Starting Windows 98...', 24, 24 + 15 * 16);
    }
    // blinking cursor
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#c8c8c8';
      const row = t > 2.1 ? 16 : (t > 1.6 ? 14 : lines.length + 4);
      ctx.fillRect(24, 24 + row * 16, 8, 13);
    }
  }

  function drawBootSplash() {
    const t = S.phaseT;
    // deep blue field with the cloud band
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#000000'); g.addColorStop(0.35, '#001038');
    g.addColorStop(0.62, '#0a3a86'); g.addColorStop(1, '#000818');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // logo: four panes with a wave
    const cx = W / 2 - 60, cy = 150;
    const pane = (px, py, col, skew) => {
      ctx.save();
      ctx.translate(cx + px, cy + py);
      ctx.transform(1, 0, -0.28, 1, 0, 0);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let i = 0; i <= 10; i++) {
        ctx.lineTo(i * 5.2, Math.sin(i * 0.42 + skew) * 3.4);
      }
      ctx.lineTo(52, 40); ctx.lineTo(0, 40); ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    pane(0, 0, '#e84a3a', 0);
    pane(56, 0, '#7ac943', 0.5);
    pane(0, 44, '#3aa0e8', 1.0);
    pane(56, 44, '#f5c020', 1.5);

    ctx.fillStyle = '#ffffff';
    ctx.font = '300 40px Tahoma, "Segoe UI", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Microsoft', cx + 130, cy + 26);
    ctx.font = 'bold 46px Tahoma, "Segoe UI", sans-serif';
    ctx.fillText('Windows', cx + 130, cy + 72);
    ctx.font = '300 26px Tahoma, sans-serif';
    ctx.fillStyle = '#c8d8f0';
    ctx.fillText('98', cx + 340, cy + 72);

    // the animated wipe bar at the bottom
    const bw = 180, bx = (W - bw) / 2, by = H - 90;
    fill(ctx, bx, by, bw, 12, '#0a1830');
    ctx.strokeStyle = '#2a4a80'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 11);
    const pos = (t * 0.55) % 1.25;
    const gw = 46;
    const gx = bx + 2 + (bw - gw - 4) * Math.min(1, pos);
    const grad = ctx.createLinearGradient(gx, 0, gx + gw, 0);
    grad.addColorStop(0, '#1a3a70'); grad.addColorStop(0.5, '#5a9ae8'); grad.addColorStop(1, '#1a3a70');
    ctx.fillStyle = grad;
    ctx.fillRect(gx, by + 2, gw, 8);

    ctx.fillStyle = '#8fa8d0';
    ctx.font = '11px Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Copyright © 1981-1998 Microsoft Corporation', W / 2, H - 46);
    ctx.textAlign = 'left';
  }

  function drawDesktop() {
    // wallpaper
    ctx.drawImage(wallpaper, 0, 0);

    // icons
    ctx.textAlign = 'center';
    desktopIcons.forEach((ic, i) => {
      const col = Math.floor(i / 6);
      const row = i % 6;
      const x = 14 + col * 76;
      const y = 12 + row * 72;
      const sel = S.desktopSel === i;
      drawIcon(ctx, ic.icon, x + 18, y, 32);
      if (sel) {
        ctx.globalCompositeOperation = 'multiply';
        fill(ctx, x + 18, y, 32, 32, '#8098c8');
        ctx.globalCompositeOperation = 'source-over';
      }
      const lines = ic.label.split('\n');
      lines.forEach((ln, li) => {
        ctx.font = FONT.ui;
        const tw = ctx.measureText(ln).width;
        const lx = x + 34, ly = y + 36 + li * 12;
        if (sel) fill(ctx, lx - tw / 2 - 2, ly - 1, tw + 4, 13, C.select);
        // white text with a dark shadow, as 98 does
        if (!sel) {
          text(ctx, ln, lx + 1, ly + 1, { align: 'center', color: 'rgba(0,0,0,0.55)' });
        }
        text(ctx, ln, lx, ly, { align: 'center', color: sel ? C.selectText : '#ffffff' });
      });
      ic._rect = { x: x + 10, y, w: 48, h: 48 };
    });
    ctx.textAlign = 'left';
  }

  function drawWindow(w) {
    const b = winBounds(w);
    const active = S.focus === w;

    // frame
    fill(ctx, b.x, b.y, b.w, b.h, C.face);
    bevelOut(ctx, b.x, b.y, b.w, b.h);
    ctx.save();
    // title
    titleBar(ctx, b.x + 3, b.y + 3, b.w - 6, w.title, active, w.icon, {
      min: !w.app.noMinMax, max: !w.app.noMinMax, close: true,
    });
    ctx.restore();

    // menu bar
    let cy = b.y + 22;
    if (w.app.menus) {
      w._menuRects = menuBar(ctx, b.x + 3, cy, b.w - 6, w.app.menus.map((m) => m.label), w.menuOpen);
      cy += 18;
    }

    // content
    const r = { x: b.x + 3, y: cy, w: b.w - 6, h: b.h - (cy - b.y) - 3 };
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    w.app.draw?.(ctx, r, w, api);
    ctx.restore();

    // resize grip
    if (w.app.resizable !== false && !w.maximized && !w.dialog) {
      const gx = b.x + b.w - 14, gy = b.y + b.h - 14;
      ctx.fillStyle = C.white;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j <= i; j++) {
          ctx.fillRect(gx + 9 - i * 4, gy + 9 - j * 4, 2, 2);
        }
      }
      ctx.fillStyle = C.shadow;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j <= i; j++) {
          ctx.fillRect(gx + 10 - i * 4, gy + 10 - j * 4, 2, 2);
        }
      }
    }

    // open menu panel
    if (w.menuOpen >= 0 && w.app.menus) {
      const mr = w._menuRects[w.menuOpen];
      const items = w.app.menus[w.menuOpen].items;
      const panel = menuPanel(ctx, mr.x, mr.y + 16, items, w._menuHover ?? -1);
      w._menuPanel = { ...panel, x: mr.x, y: mr.y + 16, items };
    } else {
      w._menuPanel = null;
    }
  }

  function drawTaskbar() {
    const y = H - TASKBAR_H;
    fill(ctx, 0, y, W, TASKBAR_H, C.face);
    ctx.fillStyle = C.white; ctx.fillRect(0, y, W, 1);

    // start button
    const sw = 54, sh = 22;
    const sbx = 2, sby = y + 3;
    button(ctx, sbx, sby, sw, sh, null, { pressed: S.startOpen });
    const off = S.startOpen ? 1 : 0;
    // flag
    const fx = sbx + 6 + off, fy = sby + 5 + off;
    const cols = ['#e84a3a', '#7ac943', '#3aa0e8', '#f5c020'];
    [[0, 0], [6, 0], [0, 6], [6, 6]].forEach((p, i) => {
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.moveTo(fx + p[0], fy + p[1] + (p[0] ? 0 : 1));
      ctx.lineTo(fx + p[0] + 5, fy + p[1] - (p[0] ? 1 : 0));
      ctx.lineTo(fx + p[0] + 5, fy + p[1] + 4);
      ctx.lineTo(fx + p[0], fy + p[1] + 5);
      ctx.closePath(); ctx.fill();
    });
    text(ctx, 'Start', sbx + 22 + off, sby + 11 + off, { font: FONT.uiBold, baseline: 'middle' });

    // quick launch
    let qx = sbx + sw + 6;
    fill(ctx, qx - 3, y + 4, 1, 20, C.shadow);
    fill(ctx, qx - 2, y + 4, 1, 20, C.white);
    const quick = [['ie', 'browser'], ['notepad', 'notepad'], ['media', 'media']];
    S._quickRects = [];
    quick.forEach(([icon, app]) => {
      drawIcon(ctx, icon, qx, y + 6, 16);
      S._quickRects.push({ x: qx, y: y + 6, w: 16, h: 16, app });
      qx += 20;
    });
    fill(ctx, qx + 1, y + 4, 1, 20, C.shadow);
    fill(ctx, qx + 2, y + 4, 1, 20, C.white);
    qx += 8;

    // task buttons
    const trayX = W - 74;
    const avail = trayX - qx - 6;
    const list = S.windows.filter((w) => !w.dialog);
    const bw = Math.max(40, Math.min(150, avail / Math.max(1, list.length) - 3));
    S._taskRects = [];
    list.forEach((w, i) => {
      const bx = qx + i * (bw + 3);
      if (bx + bw > trayX) return;
      const on = S.focus === w && !w.minimized;
      button(ctx, bx, y + 4, bw, 20, null, { pressed: on });
      drawIcon(ctx, w.icon, bx + 4 + (on ? 1 : 0), y + 6 + (on ? 1 : 0), 14);
      ctx.save();
      ctx.beginPath(); ctx.rect(bx + 20, y + 4, bw - 24, 20); ctx.clip();
      text(ctx, w.title, bx + 21 + (on ? 1 : 0), y + 14 + (on ? 1 : 0), {
        baseline: 'middle', font: on ? FONT.uiBold : FONT.ui,
      });
      ctx.restore();
      S._taskRects.push({ x: bx, y: y + 4, w: bw, h: 20, win: w });
    });

    // tray
    bevelIn(ctx, trayX, y + 4, W - trayX - 3, 20);
    let tx = trayX + 4;
    if (S.tray.modem) {
      // two little computers blinking
      const on = Math.floor(S.t * 6) % 2 === 0;
      fill(ctx, tx, y + 9, 5, 5, on ? '#40ff40' : '#206020');
      fill(ctx, tx + 6, y + 9, 5, 5, on ? '#206020' : '#40ff40');
      tx += 15;
    }
    if (S.tray.volume) {
      ctx.fillStyle = '#404040';
      ctx.beginPath();
      ctx.moveTo(tx, y + 12); ctx.lineTo(tx + 3, y + 12); ctx.lineTo(tx + 6, y + 9);
      ctx.lineTo(tx + 6, y + 18); ctx.lineTo(tx + 3, y + 15); ctx.lineTo(tx, y + 15);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#404040'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(tx + 7, y + 13.5, 3, -0.9, 0.9); ctx.stroke();
      tx += 14;
    }
    const d = new Date();
    let hh = d.getHours(); const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    const clock = `${hh}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
    text(ctx, clock, W - 6, y + 14, { align: 'right', baseline: 'middle' });
  }

  const START_ITEMS = [
    { label: 'Programs', icon: 'folderOpen', submenu: [
      { label: 'Internet Explorer', icon: 'ie', app: 'browser' },
      { label: 'Notepad', icon: 'notepad', app: 'notepad' },
      { label: 'Paint', icon: 'paint', app: 'paint' },
      { label: 'Media Player', icon: 'media', app: 'media' },
      '-',
      { label: 'Minesweeper', icon: 'mine', app: 'minesweeper' },
      { label: 'Snake', icon: 'game', app: 'snake' },
      '-',
      { label: 'MS-DOS Prompt', icon: 'doc', app: 'dos' },
    ] },
    { label: 'Favorites', icon: 'folder', submenu: [
      { label: 'My Portfolio', icon: 'me', app: 'browser', arg: 'home' },
      { label: 'Projects', icon: 'ie', app: 'browser', arg: 'projects' },
      { label: 'Guestbook', icon: 'ie', app: 'browser', arg: 'guestbook' },
    ] },
    { label: 'Documents', icon: 'folder', submenu: [
      { label: 'README.TXT', icon: 'notepad', app: 'notepad', arg: 'readme' },
      { label: 'RESUME.TXT', icon: 'notepad', app: 'notepad', arg: 'resume' },
      { label: 'TODO.TXT', icon: 'notepad', app: 'notepad', arg: 'todo' },
    ] },
    { label: 'Settings', icon: 'settings', submenu: [
      { label: 'Control Panel', icon: 'settings', app: 'controlpanel' },
      { label: 'Dial-Up Networking', icon: 'modem', app: 'dialup' },
    ] },
    { label: 'Find', icon: 'find', app: 'find' },
    { label: 'Help', icon: 'help', app: 'help' },
    '-',
    { label: 'Shut Down...', icon: 'shutdown', action: 'shutdown' },
  ];

  function drawStartMenu() {
    const items = START_ITEMS;
    ctx.font = FONT.ui;
    const rowH = 24;
    let h = 6;
    for (const it of items) h += it === '-' ? 7 : rowH;
    const w = 168;
    const x = 2, y = H - TASKBAR_H - h;

    fill(ctx, x, y, w, h, C.face);
    bevelOut(ctx, x, y, w, h);

    // the vertical branding gutter
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#2a2a8a'); grad.addColorStop(1, '#000038');
    ctx.fillStyle = grad;
    ctx.fillRect(x + 3, y + 3, 21, h - 6);
    ctx.save();
    ctx.translate(x + 19, y + h - 8);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.font = '15px Tahoma, sans-serif';
    ctx.fillStyle = '#d8d8d8';
    ctx.fillText('98', 0, 0);
    const gap = ctx.measureText('98 ').width;
    ctx.font = 'bold 15px Tahoma, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Windows', gap, 0);
    ctx.restore();

    S._startRects = [];
    let cy = y + 3;
    items.forEach((it, i) => {
      if (it === '-') { etchIn(ctx, x + 26, cy + 3, w - 30, 2); cy += 7; return; }
      const on = S.startHover === i;
      if (on) fill(ctx, x + 26, cy, w - 29, rowH, C.select);
      drawIcon(ctx, it.icon, x + 29, cy + 4, 16);
      text(ctx, it.label, x + 50, cy + rowH / 2, {
        baseline: 'middle', color: on ? C.selectText : C.text,
        font: it.action === 'shutdown' ? FONT.ui : FONT.ui,
      });
      if (it.submenu) {
        ctx.fillStyle = on ? C.selectText : C.text;
        arrow(ctx, x + w - 12, cy + rowH / 2, 'right', on ? C.selectText : C.text);
      }
      S._startRects.push({ x: x + 26, y: cy, w: w - 29, h: rowH, i, item: it });
      cy += rowH;
    });

    // submenu
    if (S.startSub !== null && items[S.startSub]?.submenu) {
      const r = S._startRects.find((rr) => rr.i === S.startSub);
      const sub = items[S.startSub].submenu;
      const panel = menuPanel(ctx, x + w - 3, Math.min(r.y, H - TASKBAR_H - sub.length * 18 - 10), sub, S.startSubHover, 150);
      S._startSubPanel = { ...panel, x: x + w - 3, y: Math.min(r.y, H - TASKBAR_H - sub.length * 18 - 10), items: sub };
    } else S._startSubPanel = null;
  }

  function drawScreensaver() {
    fill(ctx, 0, 0, W, H, '#000000');
    // flying-through-space starfield
    if (!S._stars) {
      const rnd = mulberry32(5);
      S._stars = Array.from({ length: 260 }, () => ({
        x: (rnd() - 0.5) * 2, y: (rnd() - 0.5) * 2, z: rnd() * 1 + 0.02,
      }));
    }
    for (const s of S._stars) {
      s.z -= 0.0055;
      if (s.z <= 0.02) { s.z = 1; s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; }
      const k = 220 / s.z;
      const px = W / 2 + s.x * k, py = H / 2 + s.y * k;
      if (px < 0 || px > W || py < 0 || py > H) continue;
      const b = Math.min(1, (1 - s.z) * 1.4);
      const size = b * 2.4;
      ctx.fillStyle = `rgba(255,255,255,${b})`;
      ctx.fillRect(px, py, size, size);
    }
  }

  function drawBSOD() {
    fill(ctx, 0, 0, W, H, '#0000aa');
    ctx.font = '14px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(W / 2 - 60, 120, 120, 18);
    ctx.fillStyle = '#0000aa';
    ctx.fillText('Windows', W / 2, 133);
    ctx.fillStyle = '#c0c0c0';
    ctx.textAlign = 'left';
    const lines = [
      '',
      `  An exception 0E has occurred at 0028:C0011E36 in VxD VMM(01) +`,
      `  00010E36. This was called from 0028:C00B0A78 in VxD`,
      `  ${S.bsod.reason}. It may be possible to continue normally.`,
      '',
      '  *  Press any key to attempt to continue.',
      '  *  Press CTRL+ALT+DEL to restart your computer. You will',
      '     lose any unsaved information in all applications.',
      '',
    ];
    lines.forEach((l, i) => ctx.fillText(l, 40, 170 + i * 18));
    ctx.textAlign = 'center';
    ctx.fillText('Press any key to continue _', W / 2, 360);
    ctx.textAlign = 'left';
  }

  function drawShutdown() {
    const t = S.phaseT;
    if (t < 1.8) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#001038'); g.addColorStop(0.6, '#0a3a86'); g.addColorStop(1, '#000818');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      ctx.font = '300 30px Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Windows is shutting down...', W / 2, H / 2);
      ctx.textAlign = 'left';
    } else {
      fill(ctx, 0, 0, W, H, '#000000');
      ctx.fillStyle = '#e8a020';
      ctx.font = '22px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText("It's now safe to turn off", W / 2, H / 2 - 14);
      ctx.fillText('your computer.', W / 2, H / 2 + 14);
      ctx.textAlign = 'left';
    }
  }

  function render() {
    if (S.bsod) { drawBSOD(); return; }
    if (S.phase === 'post') { drawPOST(); return; }
    if (S.phase === 'boot') { drawBootSplash(); return; }
    if (S.phase === 'shutdown') { drawShutdown(); return; }
    if (S.saver) { drawScreensaver(); return; }

    drawDesktop();

    const ordered = [...S.windows].sort((a, b) => a.z - b.z);
    for (const w of ordered) {
      if (w.minimized) continue;
      drawWindow(w);
    }

    drawTaskbar();
    if (S.startOpen) drawStartMenu();

    // toast (used by the dial-up connect notification)
    if (S.toast) {
      const tw = 210, th = 54;
      const x = W - tw - 8, y = H - TASKBAR_H - th - 8;
      const a = Math.min(1, S.toast.t * 4) * Math.min(1, (3.2 - S.toast.t) * 2);
      ctx.globalAlpha = Math.max(0, a);
      fill(ctx, x, y, tw, th, C.info);
      ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
      drawIcon(ctx, 'modem', x + 8, y + 11, 24);
      const parts = S.toast.msg.split('\n');
      parts.forEach((p, i) => text(ctx, p, x + 40, y + 14 + i * 14, { font: i === 0 ? FONT.uiBold : FONT.ui }));
      ctx.globalAlpha = 1;
    }

    // cursor is drawn by the host (3D reticle / fullscreen pointer)
    if (S.mouse.inside) drawCursor(S.mouse.x, S.mouse.y);
  }

  function drawCursor(x, y) {
    const busy = S.busy;
    ctx.save();
    if (busy) {
      // hourglass
      ctx.translate(x, y);
      ctx.fillStyle = '#000000';
      ctx.fillRect(-4, -7, 8, 2); ctx.fillRect(-4, 5, 8, 2);
      ctx.beginPath();
      ctx.moveTo(-4, -5); ctx.lineTo(4, -5); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-4, 5); ctx.lineTo(4, 5); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      const p = (S.t * 1.2) % 1;
      ctx.beginPath();
      ctx.moveTo(-3, -4); ctx.lineTo(3, -4); ctx.lineTo(0, 0.5); ctx.closePath();
      ctx.globalAlpha = 1 - p; ctx.fill(); ctx.globalAlpha = 1;
    } else {
      // classic arrow
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 16);
      ctx.lineTo(x + 4.2, y + 12.2);
      ctx.lineTo(x + 7, y + 17.6);
      ctx.lineTo(x + 9.4, y + 16.4);
      ctx.lineTo(x + 6.6, y + 11.2);
      ctx.lineTo(x + 11.4, y + 11);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── input ──────────────────────────────────────────────────
  function hitSysButtons(w, x, y) {
    const b = winBounds(w);
    const ty = b.y + 5;
    if (y < ty || y > ty + 14) return null;
    const right = b.x + b.w - 5;
    if (x >= right - 16 && x <= right) return 'close';
    if (w.app.noMinMax) return null;
    if (x >= right - 34 && x <= right - 18) return 'max';
    if (x >= right - 50 && x <= right - 34) return 'min';
    return null;
  }

  function topWindowAt(x, y) {
    const ordered = [...S.windows].filter((w) => !w.minimized).sort((a, b) => b.z - a.z);
    for (const w of ordered) {
      const b = winBounds(w);
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return w;
    }
    return null;
  }

  function pointer(type, x, y, btn = 0) {
    S.mouse.x = x; S.mouse.y = y;
    S.mouse.inside = x >= 0 && x < W && y >= 0 && y < H;
    S.idle = 0;
    if (S.saver) { if (type === 'down') S.saver = false; return; }
    if (S.bsod) { if (type === 'down') S.bsod = null; return; }
    if (S.phase !== 'desktop') return;

    if (type === 'move') {
      if (S.dragging) {
        const d = S.dragging;
        if (d.kind === 'window') {
          d.win.x = Math.max(-d.win.w + 60, Math.min(W - 40, x - d.dx));
          d.win.y = Math.max(0, Math.min(H - TASKBAR_H - 22, y - d.dy));
        } else if (d.kind === 'resize') {
          d.win.w = Math.max(d.win.app.minW ?? 180, x - d.win.x + d.dx);
          d.win.h = Math.max(d.win.app.minH ?? 120, y - d.win.y + d.dy);
        }
        return;
      }
      if (S.startOpen) {
        const r = (S._startRects || []).find((rr) => x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h);
        if (r) {
          S.startHover = r.i;
          if (r.item.submenu) S.startSub = r.i;
          else if (S._startSubPanel && !insidePanel(S._startSubPanel, x, y)) S.startSub = null;
        }
        if (S._startSubPanel) {
          const sp = S._startSubPanel;
          const hit = sp.rects.find((rr) => x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h);
          S.startSubHover = hit ? hit.i : -1;
        }
      }
      const fw = S.focus;
      if (fw && fw.menuOpen >= 0 && fw._menuPanel) {
        const hit = fw._menuPanel.rects.find((rr) => x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h);
        fw._menuHover = hit ? hit.i : -1;
        // sliding across the menu bar switches menus
        const mb = (fw._menuRects || []).find((rr) => x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h);
        if (mb) fw.menuOpen = mb.i;
      }
      const w = topWindowAt(x, y);
      if (w) {
        const c = winContent(w);
        w.app.mouse?.('move', x - c.x, y - c.y, btn, w, api);
      }
      return;
    }

    if (type === 'up') {
      if (S.dragging) { S.dragging = null; return; }
      const w = topWindowAt(x, y);
      if (w) {
        const c = winContent(w);
        w.app.mouse?.('up', x - c.x, y - c.y, btn, w, api);
      }
      return;
    }

    // ── down
    const now = S.t;
    const dbl = now - S.lastClick.t < 0.42 && Math.abs(x - S.lastClick.x) < 5 && Math.abs(y - S.lastClick.y) < 5;
    S.lastClick = { t: now, x, y };

    // menus first: a click anywhere else dismisses them
    const fw = S.focus;
    if (fw && fw.menuOpen >= 0 && fw._menuPanel) {
      const p = fw._menuPanel;
      const hit = p.rects.find((rr) => x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h);
      if (hit) {
        fw.menuOpen = -1;
        if (!hit.item.disabled) {
          S.sound?.('click');
          fw.app.command?.(hit.item.id ?? hit.item.label, fw, api);
        }
        return;
      }
      if (!(x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h)) fw.menuOpen = -1;
    }

    if (S.startOpen) {
      if (S._startSubPanel) {
        const sp = S._startSubPanel;
        const hit = sp.rects.find((rr) => x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h);
        if (hit) {
          S.startOpen = false; S.startSub = null;
          const it = hit.item;
          if (it.app) open(it.app, it.arg);
          return;
        }
      }
      const r = (S._startRects || []).find((rr) => x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h);
      if (r) {
        const it = r.item;
        if (it.submenu) { S.startSub = r.i; return; }
        S.startOpen = false;
        if (it.app) open(it.app, it.arg);
        else if (it.action === 'shutdown') confirmShutdown();
        return;
      }
      // click outside closes it
      const inStart = y > H - TASKBAR_H && x < 58;
      S.startOpen = false;
      S.startSub = null;
      if (inStart) return;
    }

    // taskbar
    if (y >= H - TASKBAR_H) {
      if (x >= 2 && x <= 56) {
        S.startOpen = !S.startOpen;
        S.startHover = -1; S.startSub = null;
        S.sound?.('click');
        return;
      }
      const q = (S._quickRects || []).find((rr) => x >= rr.x - 2 && x <= rr.x + rr.w + 2 && y >= rr.y - 4 && y <= rr.y + rr.h + 4);
      if (q) { open(q.app); return; }
      const tb = (S._taskRects || []).find((rr) => x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h);
      if (tb) {
        if (S.focus === tb.win && !tb.win.minimized) tb.win.minimized = true;
        else { tb.win.minimized = false; focusWindow(tb.win); }
        S.sound?.('click');
        return;
      }
      return;
    }

    // windows
    const w = topWindowAt(x, y);
    if (w) {
      focusWindow(w);
      const b = winBounds(w);

      const sys = hitSysButtons(w, x, y);
      if (sys === 'close') { close(w); return; }
      if (sys === 'min') { w.minimized = true; S.sound?.('click'); return; }
      if (sys === 'max') { w.maximized = !w.maximized; S.sound?.('click'); return; }

      // title bar drag / double-click to maximise
      if (y >= b.y + 3 && y <= b.y + 21) {
        if (dbl && !w.app.noMinMax) { w.maximized = !w.maximized; return; }
        if (!w.maximized) S.dragging = { kind: 'window', win: w, dx: x - w.x, dy: y - w.y };
        return;
      }

      // menu bar
      if (w.app.menus && w._menuRects) {
        const mb = w._menuRects.find((rr) => x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h);
        if (mb) {
          w.menuOpen = w.menuOpen === mb.i ? -1 : mb.i;
          w._menuHover = -1;
          return;
        }
      }

      // resize grip
      if (w.app.resizable !== false && !w.maximized && !w.dialog
          && x > b.x + b.w - 16 && y > b.y + b.h - 16) {
        S.dragging = { kind: 'resize', win: w, dx: w.x + w.w - x, dy: w.y + w.h - y };
        return;
      }

      const c = winContent(w);
      w.app.mouse?.(dbl ? 'dblclick' : 'down', x - c.x, y - c.y, btn, w, api);
      return;
    }

    // desktop
    const idx = desktopIcons.findIndex((ic) =>
      ic._rect && x >= ic._rect.x && x <= ic._rect.x + ic._rect.w
      && y >= ic._rect.y && y <= ic._rect.y + ic._rect.h + 14);
    if (idx >= 0) {
      if (dbl && S.desktopSel === idx) {
        const ic = desktopIcons[idx];
        open(ic.app, ic.arg);
      }
      S.desktopSel = idx;
      return;
    }
    S.desktopSel = -1;
  }

  const insidePanel = (p, x, y) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;

  function confirmShutdown() {
    messageBox('Shut Down Windows', 'Are you sure you want to shut down\nthe computer?', {
      icon: 'shutdown', buttons: ['Yes', 'No'], w: 290,
      onResult: (r) => {
        if (r === 'Yes') { S.phase = 'shutdown'; S.phaseT = 0; S.windows = []; S.sound?.('shutdown'); }
      },
    });
  }

  function key(e) {
    S.idle = 0;
    if (S.saver) { S.saver = false; return; }
    if (S.bsod) { S.bsod = null; return; }
    if (S.phase === 'shutdown') { if (S.phaseT > 2) restart(); return; }
    if (S.phase !== 'desktop') return;

    // ctrl+alt+del easter egg
    if (e.ctrlKey && e.altKey && (e.key === 'Delete' || e.code === 'Delete')) {
      messageBox('Close Program', 'This will end your Windows session.\n\nNot that anything here was saved anyway.', {
        icon: 'warn', buttons: ['Shut Down', 'Cancel'], w: 320,
        onResult: (r) => { if (r === 'Shut Down') { S.phase = 'shutdown'; S.phaseT = 0; S.windows = []; } },
      });
      return;
    }
    if (e.key === 'Escape' && S.startOpen) { S.startOpen = false; return; }

    const w = S.focus;
    if (w) w.app.key?.(e, w, api);
  }

  function restart() {
    S.phase = 'post'; S.phaseT = 0; S.windows = []; S.bsod = null;
    S.dialup.state = 'offline'; S.tray.modem = false;
  }

  // ── tick ───────────────────────────────────────────────────
  function update(dt, t) {
    S.t = t ?? S.t + dt;
    S.phaseT += dt;

    if (S.phase === 'post' && S.phaseT > 3.1) { S.phase = 'boot'; S.phaseT = 0; }
    if (S.phase === 'boot' && S.phaseT > 4.4) {
      S.phase = 'desktop'; S.phaseT = 0;
      S.sound?.('startup');
      // the machine boots with the portfolio already open
      setTimeout(() => {
        open('browser', 'home', { x: 44, y: 18 });
      }, 400);
    }

    // dial-up progression
    const du = S.dialup;
    if (du.state === 'dialing') {
      du.t += dt;
      if (du.t > 4.2) { du.state = 'handshake'; du.t = 0; }
    } else if (du.state === 'handshake') {
      du.t += dt;
      if (du.t > 5.6) {
        du.state = 'online'; du.t = 0;
        S.tray.modem = true;
        api.toast('Connected at 56,000 bps\nDuration: 000:00:00');
        S.sound?.('connected');
      }
    } else if (du.state === 'online') {
      du.t += dt;
    }

    // idle → screensaver
    if (S.phase === 'desktop') {
      S.idle += dt;
      if (S.idle > 75 && !S.saver) S.saver = true;
    }
    if (S.saver) S.saverT += dt;

    if (S.toast) {
      S.toast.t += dt;
      if (S.toast.t > 3.4) S.toast = null;
    }
    if (S.bsod) S.bsod.t += dt;

    S.busy = false;
    for (const w of S.windows) w.app.update?.(dt, w, api);

    render();
    texture.needsUpdate = true;
  }

  return {
    canvas, texture, update, pointer, key,
    get busy() { return S.busy; },
    get phase() { return S.phase; },
    state: S,
    api,
    restart,
  };
}
