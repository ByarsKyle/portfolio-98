// ─────────────────────────────────────────────────────────────
// apps/shell — My Computer, Recycle Bin, Dial-Up Networking,
// Control Panel, Find, Help.
// ─────────────────────────────────────────────────────────────
import { C, FONT, bevelOut, bevelIn, etchIn, fill, text, textDisabled, button, drawIcon, progressBar, groupBox, checkbox, scrollBar } from '../ui.js';

// ── My Computer ──────────────────────────────────────────────
export const computer = {
  title: 'My Computer',
  icon: 'computer',
  w: 380, h: 260,
  single: true,

  create(arg, api) {
    const ITEMS = [
      { icon: 'floppy', label: '3½ Floppy (A:)', kind: 'floppy' },
      { icon: 'hdd', label: 'Main (C:)', kind: 'drive', size: '8.4 GB', free: '2.1 GB' },
      { icon: 'cd', label: 'Audio CD (D:)', kind: 'cd' },
      { icon: 'folder', label: 'Printers', kind: 'folder' },
      { icon: 'settings', label: 'Control Panel', kind: 'cpl' },
      { icon: 'modem', label: 'Dial-Up Networking', kind: 'dun' },
    ];
    const st = { sel: -1 };

    return {
      title: 'My Computer', icon: 'computer', w: 384, h: 268, minW: 240, minH: 160,
      menus: [
        { label: 'File', items: [{ label: 'Open', id: 'open' }, { label: 'Explore', disabled: true }, '-', { label: 'Close', id: 'close' }] },
        { label: 'Edit', items: [{ label: 'Select All', disabled: true }] },
        { label: 'View', items: [{ label: 'Large Icons', checked: true }, { label: 'Small Icons' }, { label: 'List' }, { label: 'Details' }] },
        { label: 'Help', items: [{ label: 'About Windows 98', id: 'about' }] },
      ],
      command(id, win, papi) {
        if (id === 'close' || id === 'Close') papi.close(win);
        else if (id === 'about' || id === 'About Windows 98') {
          papi.messageBox('About Windows 98',
            'Microsoft (R) Windows 98\n  4.10.1998\n\nThis product is licensed to:\n  Kyle\n  A bedroom, 1998\n\nPhysical memory available to Windows: 130,432 KB',
            { icon: 'computer', w: 320 });
        } else if (id === 'open' || id === 'Open') openSel(win, papi);
      },
      draw(ctx, r, win) {
        fill(ctx, r.x, r.y, r.w, r.h, C.face);
        // toolbar strip
        fill(ctx, r.x, r.y, r.w, 22, C.face);
        text(ctx, 'Address', r.x + 4, r.y + 11, { baseline: 'middle', font: FONT.small });
        fill(ctx, r.x + 46, r.y + 3, r.w - 52, 16, C.white);
        bevelIn(ctx, r.x + 46, r.y + 3, r.w - 52, 16);
        drawIcon(ctx, 'computer', r.x + 48, r.y + 4, 13);
        text(ctx, 'My Computer', r.x + 64, r.y + 11, { baseline: 'middle', font: FONT.small });

        const view = { x: r.x + 2, y: r.y + 24, w: r.w - 4, h: r.h - 26 - 18 };
        fill(ctx, view.x, view.y, view.w, view.h, C.white);
        bevelIn(ctx, view.x, view.y, view.w, view.h);

        st.rects = [];
        const COLW = 92, ROWH = 62;
        const cols = Math.max(1, Math.floor((view.w - 12) / COLW));
        ITEMS.forEach((it, i) => {
          const cx = view.x + 8 + (i % cols) * COLW;
          const cy = view.y + 8 + Math.floor(i / cols) * ROWH;
          const sel = st.sel === i;
          drawIcon(ctx, it.icon, cx + 26, cy, 32);
          if (sel) {
            ctx.globalCompositeOperation = 'multiply';
            fill(ctx, cx + 26, cy, 32, 32, '#8098c8');
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.font = FONT.ui;
          const tw = ctx.measureText(it.label).width;
          if (sel) fill(ctx, cx + 42 - tw / 2 - 2, cy + 35, tw + 4, 13, C.select);
          text(ctx, it.label, cx + 42, cy + 41, {
            align: 'center', baseline: 'middle', color: sel ? C.selectText : C.text,
          });
          st.rects.push({ x: cx + 18, y: cy, w: 48, h: 50, i });
        });

        // status bar
        const sy = r.y + r.h - 17;
        bevelIn(ctx, r.x + 2, sy, r.w * 0.55, 15);
        const selItem = ITEMS[st.sel];
        text(ctx, selItem ? `1 object selected` : `${ITEMS.length} object(s)`,
          r.x + 6, sy + 8, { baseline: 'middle', font: FONT.small });
        bevelIn(ctx, r.x + 4 + r.w * 0.55, sy, r.w * 0.42 - 8, 15);
        text(ctx, selItem?.size ? `${selItem.free} free of ${selItem.size}` : '',
          r.x + 8 + r.w * 0.55, sy + 8, { baseline: 'middle', font: FONT.small });
      },
      mouse(type, x, y, btn, win, papi) {
        const b = win.maximized ? { x: 0, y: 0 } : { x: win.x, y: win.y };
        const ax = x + b.x + 3, ay = y + b.y + 40;
        const hit = (st.rects ?? []).find((rr) => ax >= rr.x && ax <= rr.x + rr.w && ay >= rr.y && ay <= rr.y + rr.h + 14);
        if (type === 'down') st.sel = hit ? hit.i : -1;
        if (type === 'dblclick' && hit) { st.sel = hit.i; openSel(win, papi); }
      },
    };

    function openSel(win, papi) {
      const it = ITEMS[st.sel];
      if (!it) return;
      if (it.kind === 'floppy') papi.messageBox('3½ Floppy (A:)', 'A:\\ is not accessible.\n\nThe device is not ready.', { icon: 'error', w: 290 });
      else if (it.kind === 'cd') papi.open('media');
      else if (it.kind === 'cpl') papi.open('controlpanel');
      else if (it.kind === 'dun') papi.open('dialup');
      else if (it.kind === 'drive') papi.messageBox('Main (C:)', 'Contents:\n\n  WINDOWS\n  PROGRAM FILES\n  MY DOCUMENTS\n  AUTOEXEC.BAT\n  CONFIG.SYS\n\nTry the MS-DOS Prompt for a proper look.', { icon: 'hdd', w: 300 });
      else papi.messageBox(it.label, 'This folder is empty.', { icon: 'info' });
    }
  },
};

// ── Recycle Bin ──────────────────────────────────────────────
export const recycle = {
  title: 'Recycle Bin',
  icon: 'recycle',
  w: 330, h: 200,
  single: true,

  create(arg, api) {
    const ITEMS = [
      { icon: 'doc', name: 'homepage_OLD.html', from: 'C:\\WEB', del: '11/02/98' },
      { icon: 'doc', name: 'homepage_OLD2.html', from: 'C:\\WEB', del: '11/06/98' },
      { icon: 'doc', name: 'homepage_FINAL.html', from: 'C:\\WEB', del: '11/09/98' },
      { icon: 'doc', name: 'homepage_FINAL_v2.html', from: 'C:\\WEB', del: '11/11/98' },
      { icon: 'notepad', name: 'resignation_letter.txt', from: 'C:\\MY DOCU~1', del: '10/30/98' },
    ];
    const st = { sel: -1 };
    return {
      title: 'Recycle Bin', icon: 'recycle', w: 340, h: 210, minW: 240, minH: 150,
      menus: [
        { label: 'File', items: [{ label: 'Restore', id: 'restore' }, { label: 'Empty Recycle Bin', id: 'empty' }, '-', { label: 'Close', id: 'close' }] },
        { label: 'Help', items: [{ label: 'Help Topics', id: 'help' }] },
      ],
      command(id, win, papi) {
        if (id === 'close' || id === 'Close') papi.close(win);
        else if (id === 'empty' || id === 'Empty Recycle Bin') {
          papi.messageBox('Confirm Multiple File Delete',
            `Are you sure you want to delete these ${ITEMS.length} items?`, {
              icon: 'warn', buttons: ['Yes', 'No'], w: 320,
              onResult: (rr) => { if (rr === 'Yes') { ITEMS.length = 0; papi.sound('ding'); } },
            });
        } else if (id === 'restore' || id === 'Restore') {
          papi.messageBox('Recycle Bin', 'Some things are in here for a reason.', { icon: 'info', w: 280 });
        } else papi.messageBox('Windows Help', 'Help is not available for this topic.', { icon: 'help', w: 290 });
      },
      draw(ctx, r, win) {
        fill(ctx, r.x, r.y, r.w, r.h, C.face);
        const view = { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 22 };
        fill(ctx, view.x, view.y, view.w, view.h, C.white);
        bevelIn(ctx, view.x, view.y, view.w, view.h);

        // column headers
        const cols = [['Name', 0.46], ['Original Location', 0.30], ['Date Deleted', 0.24]];
        let cx = view.x + 2;
        cols.forEach(([label, frac]) => {
          const w = (view.w - 4) * frac;
          button(ctx, cx, view.y + 2, w, 16, null);
          text(ctx, label, cx + 5, view.y + 10, { baseline: 'middle', font: FONT.ui });
          cx += w;
        });

        st.rects = [];
        ITEMS.forEach((it, i) => {
          const ry = view.y + 20 + i * 17;
          if (ry + 17 > view.y + view.h) return;
          const sel = st.sel === i;
          if (sel) fill(ctx, view.x + 2, ry, view.w - 4, 16, C.select);
          drawIcon(ctx, it.icon, view.x + 4, ry, 16);
          const col = sel ? C.selectText : C.text;
          text(ctx, it.name, view.x + 24, ry + 8, { baseline: 'middle', color: col });
          text(ctx, it.from, view.x + 2 + (view.w - 4) * 0.46 + 4, ry + 8, { baseline: 'middle', color: col, font: FONT.small });
          text(ctx, it.del, view.x + 2 + (view.w - 4) * 0.76 + 4, ry + 8, { baseline: 'middle', color: col, font: FONT.small });
          st.rects.push({ x: view.x + 2, y: ry, w: view.w - 4, h: 16, i });
        });
        if (!ITEMS.length) {
          text(ctx, 'This folder is empty.', view.x + view.w / 2, view.y + view.h / 2, {
            align: 'center', baseline: 'middle', color: C.shadow,
          });
        }
        const sy = r.y + r.h - 17;
        bevelIn(ctx, r.x + 2, sy, r.w - 4, 15);
        text(ctx, `${ITEMS.length} object(s)`, r.x + 6, sy + 8, { baseline: 'middle', font: FONT.small });
      },
      mouse(type, x, y, btn, win, papi) {
        const b = win.maximized ? { x: 0, y: 0 } : { x: win.x, y: win.y };
        const ax = x + b.x + 3, ay = y + b.y + 40;
        const hit = (st.rects ?? []).find((rr) => ax >= rr.x && ax <= rr.x + rr.w && ay >= rr.y && ay <= rr.y + rr.h);
        if (type === 'down') st.sel = hit ? hit.i : -1;
        if (type === 'dblclick' && hit) {
          papi.messageBox('Recycle Bin',
            `${ITEMS[hit.i].name}\n\nThis file has been deleted. To open it,\nyou must restore it first.`,
            { icon: 'warn', w: 310 });
        }
      },
    };
  },
};

// ── Dial-Up Networking ───────────────────────────────────────
export const dialup = {
  title: 'Connect To',
  icon: 'modem',
  w: 296, h: 214,
  single: true,
  resizable: false,

  create(arg, api) {
    const st = { user: 'kyle', pass: '••••••••', save: true, field: 0, t: 0 };

    return {
      title: 'Connect To', icon: 'modem', w: 300, h: 218, resizable: false, noMinMax: true,
      update(dt) { st.t += dt; },
      draw(ctx, r, win, papi) {
        const du = papi.state.dialup;
        fill(ctx, r.x, r.y, r.w, r.h, C.face);

        if (du.state === 'offline') {
          drawIcon(ctx, 'modem', r.x + 12, r.y + 10, 32);
          text(ctx, 'My Connection', r.x + 54, r.y + 24, { font: FONT.big, baseline: 'middle' });
          etchIn(ctx, r.x + 10, r.y + 50, r.w - 20, 2);

          const lx = r.x + 14, fx = r.x + 96, fw = r.w - 110;
          text(ctx, 'User name:', lx, r.y + 66, { baseline: 'middle' });
          fill(ctx, fx, r.y + 58, fw, 18, C.white); bevelIn(ctx, fx, r.y + 58, fw, 18);
          text(ctx, st.user, fx + 4, r.y + 67, { baseline: 'middle' });
          if (st.field === 0 && Math.floor(st.t * 2) % 2 === 0) {
            ctx.font = FONT.ui;
            fill(ctx, fx + 5 + ctx.measureText(st.user).width, r.y + 62, 1, 11, '#000');
          }
          st.userField = { x: fx, y: r.y + 58, w: fw, h: 18 };

          text(ctx, 'Password:', lx, r.y + 92, { baseline: 'middle' });
          fill(ctx, fx, r.y + 84, fw, 18, C.white); bevelIn(ctx, fx, r.y + 84, fw, 18);
          text(ctx, st.pass, fx + 4, r.y + 93, { baseline: 'middle' });
          st.passField = { x: fx, y: r.y + 84, w: fw, h: 18 };

          checkbox(ctx, fx, r.y + 110, st.save, 'Save password');
          st.saveBox = { x: fx, y: r.y + 110, w: 120, h: 14 };

          text(ctx, 'Phone number:', lx, r.y + 138, { baseline: 'middle' });
          text(ctx, '555-0143', fx + 4, r.y + 138, { baseline: 'middle', font: FONT.ui });
          text(ctx, 'Dialing from:', lx, r.y + 156, { baseline: 'middle' });
          text(ctx, 'Default Location', fx + 4, r.y + 156, { baseline: 'middle', font: FONT.ui });

          button(ctx, r.x + r.w - 168, r.y + r.h - 30, 76, 22, 'Connect', { focus: true });
          button(ctx, r.x + r.w - 86, r.y + r.h - 30, 76, 22, 'Cancel');
          st.connectBtn = { x: r.x + r.w - 168, y: r.y + r.h - 30, w: 76, h: 22 };
          st.cancelBtn = { x: r.x + r.w - 86, y: r.y + r.h - 30, w: 76, h: 22 };
        } else {
          // connecting / connected panel
          drawIcon(ctx, 'modem', r.x + 14, r.y + 16, 32);
          const phase = du.state;
          let msg = '', sub = '', frac = 0;
          if (phase === 'dialing') {
            const steps = ['Initializing modem...', 'Dialing 555-0143...', 'Dialing 555-0143...', 'Waiting for answer...'];
            msg = 'Status: ' + steps[Math.min(steps.length - 1, Math.floor(du.t / 1.05))];
            sub = 'Connecting to My Connection.';
            frac = du.t / 4.2 * 0.5;
          } else if (phase === 'handshake') {
            const steps = ['Verifying user name and password...', 'Negotiating protocols...', 'Logging on to network...'];
            msg = 'Status: ' + steps[Math.min(steps.length - 1, Math.floor(du.t / 1.9))];
            sub = 'Connecting to My Connection.';
            frac = 0.5 + (du.t / 5.6) * 0.5;
          } else {
            msg = 'Status: Connected at 56,000 bps';
            const secs = Math.floor(du.t);
            sub = `Duration: ${String(Math.floor(secs / 3600)).padStart(3, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
            frac = 1;
          }
          text(ctx, sub, r.x + 56, r.y + 22, { font: FONT.uiBold, baseline: 'middle' });
          text(ctx, msg, r.x + 56, r.y + 40, { baseline: 'middle', font: FONT.ui });

          progressBar(ctx, r.x + 14, r.y + 62, r.w - 28, 16, frac);

          if (phase === 'online') {
            etchIn(ctx, r.x + 14, r.y + 90, r.w - 28, 2);
            const sent = Math.floor(du.t * 1832), recv = Math.floor(du.t * 9481);
            text(ctx, `Bytes received: ${recv.toLocaleString()}`, r.x + 16, r.y + 104, { baseline: 'middle', font: FONT.ui });
            text(ctx, `Bytes sent: ${sent.toLocaleString()}`, r.x + 16, r.y + 122, { baseline: 'middle', font: FONT.ui });
            text(ctx, 'Compression: MNP5', r.x + 16, r.y + 140, { baseline: 'middle', font: FONT.ui });
            button(ctx, r.x + r.w - 96, r.y + r.h - 30, 86, 22, 'Disconnect');
            st.discBtn = { x: r.x + r.w - 96, y: r.y + r.h - 30, w: 86, h: 22 };
            st.connectBtn = null; st.cancelBtn = null;
            // little blinking connection lights
            for (let i = 0; i < 2; i++) {
              const on = Math.floor(st.t * 7 + i * 3) % 2 === 0;
              fill(ctx, r.x + r.w - 40 + i * 12, r.y + 104, 8, 8, on ? '#30ff40' : '#184018');
            }
          } else {
            button(ctx, r.x + r.w - 96, r.y + r.h - 30, 86, 22, 'Cancel');
            st.cancelBtn = { x: r.x + r.w - 96, y: r.y + r.h - 30, w: 86, h: 22 };
            st.connectBtn = null; st.discBtn = null;
          }
        }
      },
      key(e, win, papi) {
        if (papi.state.dialup.state !== 'offline') return;
        if (e.key === 'Enter') { papi.connect(); return; }
        if (st.field !== 0) return;
        if (e.key === 'Backspace') st.user = st.user.slice(0, -1);
        else if (e.key.length === 1) st.user += e.key;
      },
      mouse(type, x, y, btn, win, papi) {
        if (type !== 'down') return;
        const b = win.maximized ? { x: 0, y: 0 } : { x: win.x, y: win.y };
        const ax = x + b.x + 3, ay = y + b.y + 22;
        const hit = (r) => r && ax >= r.x && ax <= r.x + r.w && ay >= r.y && ay <= r.y + r.h;
        if (hit(st.connectBtn)) { papi.connect(); papi.sound('click'); return; }
        if (hit(st.discBtn)) {
          papi.disconnect(); papi.sound('click');
          papi.toast('Disconnected.\nThe phone line is free.');
          return;
        }
        if (hit(st.cancelBtn)) { papi.close(win); return; }
        if (hit(st.userField)) st.field = 0;
        if (hit(st.saveBox)) { st.save = !st.save; papi.sound('click'); }
      },
    };
  },
};

// ── Control Panel ────────────────────────────────────────────
export const controlpanel = {
  title: 'Control Panel',
  icon: 'settings',
  w: 340, h: 220,
  single: true,

  create(arg, api) {
    const ITEMS = [
      { icon: 'settings', label: 'Display' },
      { icon: 'media', label: 'Sounds' },
      { icon: 'modem', label: 'Modems' },
      { icon: 'computer', label: 'System' },
      { icon: 'game', label: 'Game Controllers' },
      { icon: 'find', label: 'Fonts' },
    ];
    const st = { sel: -1 };
    return {
      title: 'Control Panel', icon: 'settings', w: 344, h: 224, minW: 240, minH: 160,
      draw(ctx, r) {
        fill(ctx, r.x, r.y, r.w, r.h, C.face);
        const view = { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 22 };
        fill(ctx, view.x, view.y, view.w, view.h, C.white);
        bevelIn(ctx, view.x, view.y, view.w, view.h);
        st.rects = [];
        const COLW = 100, ROWH = 60;
        const cols = Math.max(1, Math.floor((view.w - 10) / COLW));
        ITEMS.forEach((it, i) => {
          const cx = view.x + 8 + (i % cols) * COLW;
          const cy = view.y + 10 + Math.floor(i / cols) * ROWH;
          const sel = st.sel === i;
          drawIcon(ctx, it.icon, cx + 30, cy, 32);
          ctx.font = FONT.ui;
          const tw = ctx.measureText(it.label).width;
          if (sel) fill(ctx, cx + 46 - tw / 2 - 2, cy + 35, tw + 4, 13, C.select);
          text(ctx, it.label, cx + 46, cy + 41, { align: 'center', baseline: 'middle', color: sel ? C.selectText : C.text });
          st.rects.push({ x: cx + 22, y: cy, w: 48, h: 50, i });
        });
        const sy = r.y + r.h - 17;
        bevelIn(ctx, r.x + 2, sy, r.w - 4, 15);
        text(ctx, `${ITEMS.length} object(s)`, r.x + 6, sy + 8, { baseline: 'middle', font: FONT.small });
      },
      mouse(type, x, y, btn, win, papi) {
        const b = win.maximized ? { x: 0, y: 0 } : { x: win.x, y: win.y };
        const ax = x + b.x + 3, ay = y + b.y + 22;
        const hit = (st.rects ?? []).find((rr) => ax >= rr.x && ax <= rr.x + rr.w && ay >= rr.y && ay <= rr.y + rr.h + 14);
        if (type === 'down') st.sel = hit ? hit.i : -1;
        if (type === 'dblclick' && hit) {
          const it = ITEMS[hit.i];
          if (it.label === 'Display') {
            papi.messageBox('Display Properties',
              'Screen area: 640 by 480 pixels\nColors: High Color (16 bit)\n\nThis is as good as it gets.',
              { icon: 'settings', w: 300 });
          } else if (it.label === 'System') {
            papi.messageBox('System Properties',
              'Microsoft Windows 98\n  4.10.1998\n\nPentium III 500 MHz\n128.0 MB RAM\n\nRegistered to: Kyle',
              { icon: 'computer', w: 300 });
          } else if (it.label === 'Modems') {
            papi.messageBox('Modems Properties',
              'Installed:\n  Standard 56000 bps V.90 Modem\n\nPort: COM2\nMaximum speed: 57600',
              { icon: 'modem', w: 310 });
          } else if (it.label === 'Sounds') {
            papi.messageBox('Sounds Properties',
              'Scheme: Windows Default\n\nTry the Media Player. It only has\nthree files and they are all MIDI.',
              { icon: 'media', w: 310 });
          } else {
            papi.messageBox(it.label, 'This control panel is not installed.', { icon: 'warn', w: 280 });
          }
        }
      },
    };
  },
};

// ── Find ─────────────────────────────────────────────────────
export const find = {
  title: 'Find: All Files',
  icon: 'find',
  w: 320, h: 190,
  single: true,
  resizable: false,

  create(arg, api) {
    const st = { q: '', t: 0, searching: 0, results: [] };
    const ALL = [
      { icon: 'notepad', name: 'README.TXT', where: 'C:\\MY DOCU~1' },
      { icon: 'notepad', name: 'RESUME.TXT', where: 'C:\\MY DOCU~1' },
      { icon: 'notepad', name: 'TODO.TXT', where: 'C:\\MY DOCU~1' },
      { icon: 'mine', name: 'WINMINE.EXE', where: 'C:\\WINDOWS' },
      { icon: 'doc', name: 'CLOUD.BMP', where: 'C:\\WINDOWS' },
      { icon: 'game', name: 'SNAKE.EXE', where: 'C:\\WINDOWS' },
      { icon: 'doc', name: 'AUTOEXEC.BAT', where: 'C:\\' },
    ];
    return {
      title: 'Find: All Files', icon: 'find', w: 324, h: 194, resizable: false,
      update(dt) {
        st.t += dt;
        if (st.searching > 0) {
          st.searching -= dt;
          if (st.searching <= 0) {
            st.results = ALL.filter((f) => !st.q || f.name.toLowerCase().includes(st.q.toLowerCase()));
          }
        }
      },
      key(e, win, papi) {
        if (e.key === 'Enter') { st.searching = 1.1; st.results = []; papi.sound('click'); }
        else if (e.key === 'Backspace') st.q = st.q.slice(0, -1);
        else if (e.key.length === 1) st.q += e.key;
      },
      draw(ctx, r, win, papi) {
        fill(ctx, r.x, r.y, r.w, r.h, C.face);
        groupBox(ctx, r.x + 6, r.y + 6, r.w - 12, 54, 'Name & Location');
        text(ctx, 'Named:', r.x + 14, r.y + 30, { baseline: 'middle' });
        fill(ctx, r.x + 62, r.y + 22, r.w - 160, 18, C.white);
        bevelIn(ctx, r.x + 62, r.y + 22, r.w - 160, 18);
        text(ctx, st.q, r.x + 66, r.y + 31, { baseline: 'middle' });
        if (Math.floor(st.t * 2) % 2 === 0) {
          ctx.font = FONT.ui;
          fill(ctx, r.x + 67 + ctx.measureText(st.q).width, r.y + 25, 1, 11, '#000');
        }
        text(ctx, 'Look in:', r.x + 14, r.y + 50, { baseline: 'middle' });
        fill(ctx, r.x + 62, r.y + 42, r.w - 160, 18, C.white);
        bevelIn(ctx, r.x + 62, r.y + 42, r.w - 160, 18);
        text(ctx, 'My Computer', r.x + 66, r.y + 51, { baseline: 'middle' });

        button(ctx, r.x + r.w - 88, r.y + 20, 80, 22, 'Find Now', { focus: true });
        button(ctx, r.x + r.w - 88, r.y + 44, 80, 22, 'Stop');
        st.findBtn = { x: r.x + r.w - 88, y: r.y + 20, w: 80, h: 22 };

        // results
        const view = { x: r.x + 6, y: r.y + 66, w: r.w - 12, h: r.h - 90 };
        fill(ctx, view.x, view.y, view.w, view.h, C.white);
        bevelIn(ctx, view.x, view.y, view.w, view.h);
        if (st.searching > 0) {
          text(ctx, 'Searching...', view.x + 8, view.y + view.h / 2, { baseline: 'middle', color: C.shadow });
          // the animated magnifying glass
          const mx = view.x + view.w - 40 + Math.sin(st.t * 6) * 10;
          drawIcon(ctx, 'find', mx, view.y + view.h / 2 - 12, 24);
          papi.setBusy(true);
        } else {
          st.results.forEach((f, i) => {
            const ry = view.y + 3 + i * 16;
            if (ry + 16 > view.y + view.h) return;
            drawIcon(ctx, f.icon, view.x + 3, ry, 14);
            text(ctx, f.name, view.x + 22, ry + 8, { baseline: 'middle' });
            text(ctx, f.where, view.x + 140, ry + 8, { baseline: 'middle', font: FONT.small, color: '#444' });
          });
        }
        const sy = r.y + r.h - 20;
        bevelIn(ctx, r.x + 6, sy, r.w - 12, 16);
        text(ctx, st.searching > 0 ? 'Searching...' : `${st.results.length} file(s) found`,
          r.x + 10, sy + 8, { baseline: 'middle', font: FONT.small });
      },
      mouse(type, x, y, btn, win, papi) {
        if (type !== 'down') return;
        const b = win.maximized ? { x: 0, y: 0 } : { x: win.x, y: win.y };
        const ax = x + b.x + 3, ay = y + b.y + 22;
        const r = st.findBtn;
        if (r && ax >= r.x && ax <= r.x + r.w && ay >= r.y && ay <= r.y + r.h) {
          st.searching = 1.1; st.results = []; papi.sound('click');
        }
      },
    };
  },
};

// ── Help ─────────────────────────────────────────────────────
export const help = {
  title: 'Windows Help',
  icon: 'help',
  w: 340, h: 240,
  single: true,

  create(arg, api) {
    const TOPICS = [
      ['Getting around the room', 'Use W, A, S and D to walk and the mouse to look. Hold Shift to run. Walk up to the computer and press E to sit down; press Escape to stand up again.'],
      ['Getting on the Internet', 'Open Dial-Up Networking from the desktop or the Start menu, then click Connect. It takes about ten seconds and it makes the noise. Once the two little computers appear in the system tray, Internet Explorer will work.'],
      ['Playing Minesweeper', 'Left-click to uncover a square. Right-click to place a flag. Click a number that already has the right number of flags around it to open the rest. Do not click the mine.'],
      ['Why is everything beige', 'It was 1998. Everything was beige. The plastic has also yellowed slightly, which is modelled.'],
      ['Is this a real Windows', 'No. It is about two thousand lines of JavaScript drawing rectangles onto a canvas, which is then used as a texture on a curved mesh. Nothing you do here is saved.'],
      ['About the dog', 'He is a pug. He breathes, blinks, wags his tail and occasionally looks at you. He is made of roughly sixteen thousand fur shells and one very good attitude.'],
    ];
    const st = { sel: 0, scroll: 0 };
    return {
      title: 'Windows Help', icon: 'help', w: 344, h: 244, minW: 260, minH: 180,
      draw(ctx, r) {
        fill(ctx, r.x, r.y, r.w, r.h, C.face);
        // tabs
        const tabs = ['Contents', 'Index', 'Find'];
        let tx = r.x + 4;
        tabs.forEach((t, i) => {
          const w = 54;
          fill(ctx, tx, r.y + 3, w, 17, C.face);
          if (i === 0) { bevelOut(ctx, tx, r.y + 3, w, 19); }
          else { bevelOut(ctx, tx, r.y + 5, w, 15); }
          text(ctx, t, tx + w / 2, r.y + 13, { align: 'center', baseline: 'middle', font: i === 0 ? FONT.uiBold : FONT.ui });
          tx += w + 2;
        });
        etchIn(ctx, r.x + 3, r.y + 21, r.w - 6, 2);

        // topic list
        const lw = 130;
        const view = { x: r.x + 6, y: r.y + 26, w: lw, h: r.h - 34 };
        fill(ctx, view.x, view.y, view.w, view.h, C.white);
        bevelIn(ctx, view.x, view.y, view.w, view.h);
        st.rects = [];
        TOPICS.forEach(([t], i) => {
          const ry = view.y + 3 + i * 30;
          const sel = st.sel === i;
          if (sel) fill(ctx, view.x + 2, ry, view.w - 4, 28, C.select);
          drawIcon(ctx, sel ? 'folderOpen' : 'doc', view.x + 4, ry + 6, 16);
          ctx.font = FONT.small;
          const words = t.split(' ');
          let line = '', ly = ry + 7;
          const put = (s) => { text(ctx, s, view.x + 24, ly, { font: FONT.small, color: sel ? C.selectText : C.text }); ly += 11; };
          for (const w of words) {
            const test = line ? `${line} ${w}` : w;
            if (ctx.measureText(test).width > view.w - 30) { put(line); line = w; } else line = test;
          }
          if (line) put(line);
          st.rects.push({ x: view.x, y: ry, w: view.w, h: 28, i });
        });

        // body
        const bx = r.x + lw + 12;
        const bw = r.w - lw - 18;
        fill(ctx, bx, view.y, bw, view.h, C.white);
        bevelIn(ctx, bx, view.y, bw, view.h);
        ctx.save();
        ctx.beginPath(); ctx.rect(bx + 2, view.y + 2, bw - 4, view.h - 4); ctx.clip();
        text(ctx, TOPICS[st.sel][0], bx + 8, view.y + 10, { font: FONT.uiBold });
        ctx.font = FONT.ui;
        const words = TOPICS[st.sel][1].split(' ');
        let line = '', y2 = view.y + 30;
        for (const w of words) {
          const test = line ? `${line} ${w}` : w;
          if (ctx.measureText(test).width > bw - 18) {
            text(ctx, line, bx + 8, y2); y2 += 14; line = w;
          } else line = test;
        }
        if (line) text(ctx, line, bx + 8, y2);
        ctx.restore();
      },
      mouse(type, x, y, btn, win) {
        if (type !== 'down' && type !== 'dblclick') return;
        const b = win.maximized ? { x: 0, y: 0 } : { x: win.x, y: win.y };
        const ax = x + b.x + 3, ay = y + b.y + 22;
        const hit = (st.rects ?? []).find((rr) => ax >= rr.x && ax <= rr.x + rr.w && ay >= rr.y && ay <= rr.y + rr.h);
        if (hit) st.sel = hit.i;
      },
    };
  },
};
