// ─────────────────────────────────────────────────────────────
// os/ui — Windows 98 chrome, drawn with 2D canvas primitives.
// Every bevel, gradient and icon here is hand-drawn; nothing is
// an image file.
// ─────────────────────────────────────────────────────────────

export const C = {
  face: '#c0c0c0',
  faceLight: '#dfdfdf',
  white: '#ffffff',
  shadow: '#808080',
  dark: '#000000',
  text: '#000000',
  disabled: '#808080',
  titleA1: '#000080',
  titleA2: '#1084d0',
  titleI1: '#808080',
  titleI2: '#b5b5b5',
  titleText: '#ffffff',
  desktop: '#008080',
  select: '#000080',
  selectText: '#ffffff',
  menu: '#c0c0c0',
  scroll: '#dfdfdf',
  info: '#ffffe1',
};

export const FONT = {
  ui: '11px Tahoma, "MS Sans Serif", "Segoe UI", sans-serif',
  uiBold: 'bold 11px Tahoma, "MS Sans Serif", "Segoe UI", sans-serif',
  small: '10px Tahoma, "MS Sans Serif", sans-serif',
  title: 'bold 11px Tahoma, "MS Sans Serif", sans-serif',
  mono: '12px "Courier New", ui-monospace, monospace',
  monoSmall: '11px "Courier New", ui-monospace, monospace',
  big: 'bold 15px Tahoma, "MS Sans Serif", sans-serif',
};

/** Raised 3D border (buttons, window frames, taskbar). */
export function bevelOut(ctx, x, y, w, h, thick = 2) {
  ctx.fillStyle = C.white;
  ctx.fillRect(x, y, w - 1, 1);
  ctx.fillRect(x, y, 1, h - 1);
  ctx.fillStyle = C.dark;
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x + w - 1, y, 1, h);
  if (thick === 2) {
    ctx.fillStyle = C.faceLight;
    ctx.fillRect(x + 1, y + 1, w - 3, 1);
    ctx.fillRect(x + 1, y + 1, 1, h - 3);
    ctx.fillStyle = C.shadow;
    ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
  }
}

/** Sunken 3D border (text fields, list boxes, status panes). */
export function bevelIn(ctx, x, y, w, h, thick = 2) {
  ctx.fillStyle = C.shadow;
  ctx.fillRect(x, y, w - 1, 1);
  ctx.fillRect(x, y, 1, h - 1);
  ctx.fillStyle = C.white;
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x + w - 1, y, 1, h);
  if (thick === 2) {
    ctx.fillStyle = C.dark;
    ctx.fillRect(x + 1, y + 1, w - 3, 1);
    ctx.fillRect(x + 1, y + 1, 1, h - 3);
    ctx.fillStyle = C.faceLight;
    ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
  }
}

/** Thin sunken line used by group boxes and separators. */
export function etchIn(ctx, x, y, w, h) {
  ctx.fillStyle = C.shadow;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = C.white;
  ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
}

export function fill(ctx, x, y, w, h, color) {
  ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
}

export function text(ctx, str, x, y, {
  font = FONT.ui, color = C.text, align = 'left', baseline = 'top', maxWidth,
} = {}) {
  ctx.font = font; ctx.fillStyle = color;
  ctx.textAlign = align; ctx.textBaseline = baseline;
  if (maxWidth !== undefined) ctx.fillText(str, x, y, maxWidth);
  else ctx.fillText(str, x, y);
}

export function textDisabled(ctx, str, x, y, opts = {}) {
  text(ctx, str, x + 1, y + 1, { ...opts, color: C.white });
  text(ctx, str, x, y, { ...opts, color: C.shadow });
}

export function button(ctx, x, y, w, h, label, { pressed = false, disabled = false, focus = false, font = FONT.ui } = {}) {
  fill(ctx, x, y, w, h, C.face);
  if (pressed) {
    ctx.fillStyle = C.shadow;
    ctx.fillRect(x, y, w - 1, 1); ctx.fillRect(x, y, 1, h - 1);
    ctx.fillStyle = C.dark;
    ctx.fillRect(x + 1, y + 1, w - 3, 1); ctx.fillRect(x + 1, y + 1, 1, h - 3);
    ctx.fillStyle = C.white;
    ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
  } else {
    bevelOut(ctx, x, y, w, h);
  }
  if (focus) {
    ctx.save();
    ctx.setLineDash([1, 1]); ctx.strokeStyle = C.dark; ctx.lineWidth = 1;
    ctx.strokeRect(x + 3.5, y + 3.5, w - 8, h - 8);
    ctx.restore();
  }
  const ox = pressed ? 1 : 0;
  if (label) {
    if (disabled) textDisabled(ctx, label, x + w / 2 + ox, y + h / 2 + ox, { align: 'center', baseline: 'middle', font });
    else text(ctx, label, x + w / 2 + ox, y + h / 2 + ox, { align: 'center', baseline: 'middle', font });
  }
}

/** Title bar with the classic blue gradient and three system buttons. */
export function titleBar(ctx, x, y, w, title, active, icon, { close = true, min = true, max = true } = {}) {
  const h = 18;
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, active ? C.titleA1 : C.titleI1);
  grad.addColorStop(1, active ? C.titleA2 : C.titleI2);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  let tx = x + 3;
  if (icon) { drawIcon(ctx, icon, x + 2, y + 2, 14); tx = x + 20; }
  text(ctx, title, tx, y + h / 2, { font: FONT.title, color: C.titleText, baseline: 'middle' });

  let bx = x + w - 18;
  const sysBtn = (glyph) => {
    button(ctx, bx, y + 2, 16, 14, null);
    ctx.fillStyle = C.dark;
    const cx = bx + 8, cy = y + 9;
    if (glyph === 'x') {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(cx + i - 1, cy + i - 1, 2, 1);
        ctx.fillRect(cx - i - 1, cy + i - 1, 2, 1);
      }
    } else if (glyph === '_') {
      ctx.fillRect(cx - 4, cy + 3, 8, 2);
    } else if (glyph === '□') {
      ctx.fillRect(cx - 5, cy - 5, 10, 9);
      ctx.fillStyle = C.face; ctx.fillRect(cx - 4, cy - 2, 8, 5);
      ctx.fillStyle = C.dark; ctx.fillRect(cx - 5, cy - 5, 10, 2);
    }
    bx -= 16;
  };
  if (close) sysBtn('x');
  bx -= 2;
  if (max) sysBtn('□');
  if (min) sysBtn('_');
  return h;
}

/** Menu bar strip; returns hit rectangles for each item. */
export function menuBar(ctx, x, y, w, items, openIndex = -1, hoverIndex = -1) {
  fill(ctx, x, y, w, 18, C.face);
  const rects = [];
  let mx = x + 1;
  ctx.font = FONT.ui;
  items.forEach((label, i) => {
    const tw = ctx.measureText(label).width + 12;
    const on = i === openIndex;
    if (on) fill(ctx, mx, y + 1, tw, 16, C.select);
    text(ctx, label, mx + 6, y + 9, { baseline: 'middle', color: on ? C.selectText : C.text });
    rects.push({ x: mx, y: y + 1, w: tw, h: 16, i });
    mx += tw;
  });
  return rects;
}

/** Dropdown menu panel; items may be strings, '-' separators, or objects. */
export function menuPanel(ctx, x, y, items, hoverIndex = -1, minW = 110) {
  ctx.font = FONT.ui;
  let w = minW;
  for (const it of items) {
    if (it === '-') continue;
    const label = typeof it === 'string' ? it : it.label;
    const acc = typeof it === 'object' && it.accel ? it.accel : '';
    w = Math.max(w, ctx.measureText(label).width + ctx.measureText(acc).width + 58);
  }
  const rowH = 18;
  let h = 6;
  for (const it of items) h += it === '-' ? 7 : rowH;

  // drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x + 3, y + 3, w, h);
  fill(ctx, x, y, w, h, C.face);
  bevelOut(ctx, x, y, w, h);

  const rects = [];
  let cy = y + 3;
  items.forEach((it, i) => {
    if (it === '-') {
      etchIn(ctx, x + 3, cy + 3, w - 6, 2);
      cy += 7;
      return;
    }
    const o = typeof it === 'string' ? { label: it } : it;
    const on = i === hoverIndex && !o.disabled;
    if (on) fill(ctx, x + 3, cy, w - 6, rowH, C.select);
    const col = o.disabled ? C.disabled : (on ? C.selectText : C.text);
    if (o.checked) text(ctx, '✓', x + 8, cy + rowH / 2, { baseline: 'middle', color: col });
    if (o.icon) drawIcon(ctx, o.icon, x + 5, cy + 1, 16);
    text(ctx, o.label, x + 26, cy + rowH / 2, { baseline: 'middle', color: col });
    if (o.accel) text(ctx, o.accel, x + w - 10, cy + rowH / 2, { baseline: 'middle', align: 'right', color: o.disabled ? C.disabled : (on ? C.selectText : C.shadow) });
    if (o.submenu) text(ctx, '▸', x + w - 12, cy + rowH / 2, { baseline: 'middle', color: col });
    rects.push({ x: x + 3, y: cy, w: w - 6, h: rowH, i, item: o });
    cy += rowH;
  });
  return { rects, w, h };
}

export function scrollBar(ctx, x, y, w, h, pos, visible, total, vertical = true) {
  fill(ctx, x, y, w, h, '#d8d8d8');
  // dotted background
  ctx.save();
  const pat = ctx.createImageData(2, 2);
  const p = pat.data;
  const set = (i, c) => { p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = 255; };
  set(0, [255, 255, 255]); set(4, [192, 192, 192]); set(8, [192, 192, 192]); set(12, [255, 255, 255]);
  ctx.restore();

  const btn = vertical ? w : h;
  // arrows
  if (vertical) {
    button(ctx, x, y, w, btn, null);
    arrow(ctx, x + w / 2, y + btn / 2, 'up');
    button(ctx, x, y + h - btn, w, btn, null);
    arrow(ctx, x + w / 2, y + h - btn / 2, 'down');
  } else {
    button(ctx, x, y, btn, h, null);
    arrow(ctx, x + btn / 2, y + h / 2, 'left');
    button(ctx, x + w - btn, y, btn, h, null);
    arrow(ctx, x + w - btn / 2, y + h / 2, 'right');
  }
  const track = (vertical ? h : w) - btn * 2;
  const frac = Math.min(1, visible / Math.max(1, total));
  const thumb = Math.max(12, track * frac);
  const maxScroll = Math.max(1, total - visible);
  const off = (pos / maxScroll) * (track - thumb);
  if (frac < 1) {
    if (vertical) button(ctx, x, y + btn + off, w, thumb, null);
    else button(ctx, x + btn + off, y, thumb, h, null);
  }
  return { thumb, track, btn };
}

export function arrow(ctx, cx, cy, dir, color = C.dark) {
  ctx.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    if (dir === 'up') ctx.fillRect(cx - i, cy - 2 + i, i * 2 + 1, 1);
    if (dir === 'down') ctx.fillRect(cx - i, cy + 2 - i, i * 2 + 1, 1);
    if (dir === 'left') ctx.fillRect(cx - 2 + i, cy - i, 1, i * 2 + 1);
    if (dir === 'right') ctx.fillRect(cx + 2 - i, cy - i, 1, i * 2 + 1);
  }
}

export function checkbox(ctx, x, y, checked, label) {
  fill(ctx, x, y, 13, 13, C.white);
  bevelIn(ctx, x, y, 13, 13);
  if (checked) {
    ctx.fillStyle = C.dark;
    const pts = [[3, 6], [3, 7], [4, 7], [4, 8], [5, 8], [5, 9], [6, 9], [6, 8], [7, 8], [7, 7], [8, 7], [8, 6], [9, 6], [9, 5], [10, 5], [10, 4]];
    for (const [px, py] of pts) ctx.fillRect(x + px, y + py, 1, 1);
    for (const [px, py] of pts) ctx.fillRect(x + px, y + py + 1, 1, 1);
  }
  if (label) text(ctx, label, x + 18, y + 6, { baseline: 'middle' });
}

export function radio(ctx, x, y, checked, label) {
  ctx.save();
  ctx.fillStyle = C.white;
  ctx.beginPath(); ctx.arc(x + 6, y + 6, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.shadow; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x + 6, y + 6, 5.5, Math.PI * 0.75, Math.PI * 1.75); ctx.stroke();
  ctx.strokeStyle = C.white;
  ctx.beginPath(); ctx.arc(x + 6, y + 6, 5.5, Math.PI * 1.75, Math.PI * 0.75); ctx.stroke();
  if (checked) {
    ctx.fillStyle = C.dark;
    ctx.beginPath(); ctx.arc(x + 6, y + 6, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (label) text(ctx, label, x + 18, y + 6, { baseline: 'middle' });
}

export function progressBar(ctx, x, y, w, h, frac) {
  fill(ctx, x, y, w, h, C.face);
  bevelIn(ctx, x, y, w, h);
  const inner = w - 4;
  const blocks = Math.floor((inner / 8) * Math.max(0, Math.min(1, frac)));
  ctx.fillStyle = C.titleA1;
  for (let i = 0; i < blocks; i++) ctx.fillRect(x + 2 + i * 8, y + 2, 6, h - 4);
}

export function groupBox(ctx, x, y, w, h, label) {
  etchIn(ctx, x, y + 5, w, h - 5);
  if (label) {
    ctx.font = FONT.ui;
    const tw = ctx.measureText(label).width;
    fill(ctx, x + 8, y, tw + 6, 11, C.face);
    text(ctx, label, x + 11, y + 5, { baseline: 'middle' });
  }
}

// ─────────────────────────────────────────────────────────────
// Icons — every one drawn from rectangles and paths.
// ─────────────────────────────────────────────────────────────

const ICONS = {};

function defIcon(name, fn) { ICONS[name] = fn; }

// helper: pixel plotter scaled to the icon box
const px = (ctx, x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };

defIcon('computer', (ctx, x, y, s) => {
  const u = s / 32;
  px(ctx, x + 3 * u, y + 4 * u, 26 * u, 18 * u, '#c0c0c0');
  px(ctx, x + 3 * u, y + 4 * u, 26 * u, 1 * u, '#ffffff');
  px(ctx, x + 3 * u, y + 4 * u, 1 * u, 18 * u, '#ffffff');
  px(ctx, x + 3 * u, y + 21 * u, 26 * u, 1 * u, '#000000');
  px(ctx, x + 28 * u, y + 4 * u, 1 * u, 18 * u, '#000000');
  px(ctx, x + 5 * u, y + 6 * u, 22 * u, 14 * u, '#000080');
  // screen glint
  const g = ctx.createLinearGradient(x + 5 * u, y + 6 * u, x + 27 * u, y + 20 * u);
  g.addColorStop(0, 'rgba(120,180,255,0.55)'); g.addColorStop(0.5, 'rgba(0,0,128,0)');
  ctx.fillStyle = g; ctx.fillRect(x + 5 * u, y + 6 * u, 22 * u, 14 * u);
  px(ctx, x + 11 * u, y + 22 * u, 10 * u, 3 * u, '#808080');
  px(ctx, x + 7 * u, y + 25 * u, 18 * u, 4 * u, '#c0c0c0');
  px(ctx, x + 7 * u, y + 25 * u, 18 * u, 1 * u, '#ffffff');
  px(ctx, x + 7 * u, y + 28 * u, 18 * u, 1 * u, '#000000');
  px(ctx, x + 20 * u, y + 26 * u, 3 * u, 2 * u, '#00ff00');
});

defIcon('folder', (ctx, x, y, s) => {
  const u = s / 32;
  px(ctx, x + 2 * u, y + 8 * u, 12 * u, 3 * u, '#e8b84b');
  px(ctx, x + 2 * u, y + 10 * u, 28 * u, 16 * u, '#ffd166');
  px(ctx, x + 2 * u, y + 10 * u, 28 * u, 1 * u, '#ffe9b0');
  px(ctx, x + 2 * u, y + 25 * u, 28 * u, 1 * u, '#a07a20');
  px(ctx, x + 29 * u, y + 10 * u, 1 * u, 16 * u, '#a07a20');
});

defIcon('folderOpen', (ctx, x, y, s) => {
  const u = s / 32;
  px(ctx, x + 2 * u, y + 8 * u, 12 * u, 3 * u, '#e8b84b');
  px(ctx, x + 2 * u, y + 10 * u, 24 * u, 15 * u, '#e0b850');
  ctx.fillStyle = '#ffd98a';
  ctx.beginPath();
  ctx.moveTo(x + 5 * u, y + 25 * u); ctx.lineTo(x + 30 * u, y + 25 * u);
  ctx.lineTo(x + 26 * u, y + 13 * u); ctx.lineTo(x + 2 * u, y + 13 * u);
  ctx.closePath(); ctx.fill();
});

defIcon('doc', (ctx, x, y, s) => {
  const u = s / 32;
  px(ctx, x + 6 * u, y + 2 * u, 19 * u, 28 * u, '#ffffff');
  px(ctx, x + 6 * u, y + 2 * u, 19 * u, 1 * u, '#c8c8c8');
  ctx.strokeStyle = '#808080'; ctx.lineWidth = Math.max(1, u);
  ctx.strokeRect(x + 6 * u, y + 2 * u, 19 * u, 28 * u);
  // folded corner
  px(ctx, x + 19 * u, y + 2 * u, 6 * u, 6 * u, '#e0e0e0');
  ctx.beginPath(); ctx.moveTo(x + 19 * u, y + 2 * u); ctx.lineTo(x + 25 * u, y + 8 * u);
  ctx.strokeStyle = '#808080'; ctx.stroke();
  ctx.fillStyle = '#4a4a8a';
  for (let i = 0; i < 6; i++) ctx.fillRect(x + 9 * u, y + (11 + i * 3) * u, (i === 5 ? 8 : 13) * u, 1.2 * u);
});

defIcon('notepad', (ctx, x, y, s) => {
  const u = s / 32;
  px(ctx, x + 5 * u, y + 2 * u, 21 * u, 28 * u, '#ffffff');
  ctx.strokeStyle = '#606060'; ctx.lineWidth = Math.max(1, u);
  ctx.strokeRect(x + 5 * u, y + 2 * u, 21 * u, 28 * u);
  px(ctx, x + 5 * u, y + 2 * u, 21 * u, 5 * u, '#0a3a8a');
  ctx.fillStyle = '#2a2a2a';
  for (let i = 0; i < 7; i++) ctx.fillRect(x + 8 * u, y + (11 + i * 3) * u, (i % 3 === 2 ? 9 : 15) * u, 1.1 * u);
});

defIcon('ie', (ctx, x, y, s) => {
  const u = s / 32;
  // globe
  const cx = x + 16 * u, cy = y + 16 * u, r = 11 * u;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#9fd8ff'); g.addColorStop(0.55, '#2f8fdd'); g.addColorStop(1, '#0d4e8f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, u * 0.8);
  ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
  // the swoosh
  ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = Math.max(1.5, u * 2.4);
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2 * u, r * 1.15, r * 0.5, -0.42, Math.PI * 0.1, Math.PI * 1.35);
  ctx.stroke();
});

defIcon('modem', (ctx, x, y, s) => {
  const u = s / 32;
  px(ctx, x + 3 * u, y + 14 * u, 26 * u, 12 * u, '#b8b8ac');
  px(ctx, x + 3 * u, y + 14 * u, 26 * u, 1 * u, '#eaeae0');
  px(ctx, x + 3 * u, y + 25 * u, 26 * u, 1 * u, '#606058');
  for (let i = 0; i < 5; i++) px(ctx, x + (6 + i * 4) * u, y + 18 * u, 2 * u, 2 * u, i < 3 ? '#3aff5a' : '#204a28');
  // phone cord
  ctx.strokeStyle = '#404048'; ctx.lineWidth = Math.max(1, u);
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    ctx.lineTo(x + (16 + Math.sin(t * 9) * 4) * u, y + (14 - t * 11) * u);
  }
  ctx.stroke();
});

defIcon('mine', (ctx, x, y, s) => {
  const u = s / 32;
  px(ctx, x + 2 * u, y + 2 * u, 28 * u, 28 * u, '#c0c0c0');
  px(ctx, x + 2 * u, y + 2 * u, 28 * u, 2 * u, '#ffffff');
  px(ctx, x + 2 * u, y + 28 * u, 28 * u, 2 * u, '#808080');
  ctx.fillStyle = '#000000';
  ctx.beginPath(); ctx.arc(x + 16 * u, y + 17 * u, 7 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x + 15 * u, y + 6 * u, 2 * u, 6 * u);
  ctx.fillStyle = '#ff2020';
  ctx.beginPath(); ctx.arc(x + 16 * u, y + 6 * u, 2.5 * u, 0, Math.PI * 2); ctx.fill();
  px(ctx, x + 13 * u, y + 14 * u, 2 * u, 2 * u, '#ffffff');
});

defIcon('paint', (ctx, x, y, s) => {
  const u = s / 32;
  // palette
  ctx.fillStyle = '#d8cfc0';
  ctx.beginPath(); ctx.ellipse(x + 15 * u, y + 18 * u, 12 * u, 9 * u, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a7a68';
  ctx.beginPath(); ctx.arc(x + 20 * u, y + 21 * u, 3 * u, 0, Math.PI * 2); ctx.fill();
  const cols = ['#e02020', '#f0a020', '#20a040', '#2050d0', '#802090'];
  cols.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + (8 + i * 3.6) * u, y + (13 + Math.sin(i) * 2) * u, 2.2 * u, 0, Math.PI * 2);
    ctx.fill();
  });
  // brush
  ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 2.4 * u;
  ctx.beginPath(); ctx.moveTo(x + 20 * u, y + 12 * u); ctx.lineTo(x + 28 * u, y + 3 * u); ctx.stroke();
  ctx.fillStyle = '#303030';
  ctx.beginPath(); ctx.arc(x + 19.5 * u, y + 12.5 * u, 2 * u, 0, Math.PI * 2); ctx.fill();
});

defIcon('media', (ctx, x, y, s) => {
  const u = s / 32;
  px(ctx, x + 3 * u, y + 6 * u, 26 * u, 20 * u, '#c0c0c0');
  bevelOutRaw(ctx, x + 3 * u, y + 6 * u, 26 * u, 20 * u, u);
  px(ctx, x + 6 * u, y + 9 * u, 20 * u, 10 * u, '#101820');
  ctx.fillStyle = '#40e0a0';
  for (let i = 0; i < 9; i++) {
    const h = (2 + Math.abs(Math.sin(i * 1.7)) * 7) * u;
    ctx.fillRect(x + (7 + i * 2.2) * u, y + 19 * u - h, 1.6 * u, h);
  }
  ctx.fillStyle = '#303030';
  ctx.beginPath();
  ctx.moveTo(x + 8 * u, y + 21 * u); ctx.lineTo(x + 8 * u, y + 25 * u); ctx.lineTo(x + 12 * u, y + 23 * u);
  ctx.closePath(); ctx.fill();
});

defIcon('recycle', (ctx, x, y, s) => {
  const u = s / 32;
  ctx.fillStyle = '#9aa4b0';
  ctx.beginPath();
  ctx.moveTo(x + 8 * u, y + 9 * u); ctx.lineTo(x + 24 * u, y + 9 * u);
  ctx.lineTo(x + 22 * u, y + 29 * u); ctx.lineTo(x + 10 * u, y + 29 * u);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b8c2ce';
  ctx.beginPath(); ctx.ellipse(x + 16 * u, y + 9 * u, 8 * u, 3 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6a7480';
  for (let i = 0; i < 3; i++) ctx.fillRect(x + (11 + i * 4) * u, y + 12 * u, 1.5 * u, 15 * u);
  // recycle chevrons
  ctx.fillStyle = '#2f8f4f';
  ctx.beginPath();
  ctx.moveTo(x + 16 * u, y + 14 * u); ctx.lineTo(x + 20 * u, y + 20 * u); ctx.lineTo(x + 12 * u, y + 20 * u);
  ctx.closePath(); ctx.fill();
});

defIcon('game', (ctx, x, y, s) => {
  const u = s / 32;
  px(ctx, x + 3 * u, y + 10 * u, 26 * u, 14 * u, '#4a4a52');
  ctx.fillStyle = '#3a3a42';
  ctx.beginPath(); ctx.arc(x + 6 * u, y + 17 * u, 5 * u, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 26 * u, y + 17 * u, 5 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8d8e0';
  ctx.fillRect(x + 8 * u, y + 16 * u, 7 * u, 2 * u);
  ctx.fillRect(x + 10.5 * u, y + 13.5 * u, 2 * u, 7 * u);
  ctx.fillStyle = '#e04040';
  ctx.beginPath(); ctx.arc(x + 23 * u, y + 15 * u, 2 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4090e0';
  ctx.beginPath(); ctx.arc(x + 26 * u, y + 19 * u, 2 * u, 0, Math.PI * 2); ctx.fill();
});

defIcon('floppy', (ctx, x, y, s) => {
  const u = s / 32;
  px(ctx, x + 4 * u, y + 4 * u, 24 * u, 24 * u, '#2a2a30');
  px(ctx, x + 9 * u, y + 4 * u, 14 * u, 10 * u, '#c8c8c8');
  px(ctx, x + 12 * u, y + 5 * u, 6 * u, 8 * u, '#5a5a60');
  px(ctx, x + 7 * u, y + 17 * u, 18 * u, 11 * u, '#d8d8d8');
  ctx.fillStyle = '#8a8a90';
  for (let i = 0; i < 3; i++) ctx.fillRect(x + 9 * u, y + (19 + i * 2.5) * u, 12 * u, 1 * u);
});

defIcon('hdd', (ctx, x, y, s) => {
  const u = s / 32;
  px(ctx, x + 3 * u, y + 9 * u, 26 * u, 15 * u, '#c8c4b8');
  bevelOutRaw(ctx, x + 3 * u, y + 9 * u, 26 * u, 15 * u, u);
  px(ctx, x + 6 * u, y + 12 * u, 20 * u, 6 * u, '#9a968c');
  px(ctx, x + 22 * u, y + 20 * u, 4 * u, 2 * u, '#40d060');
});

defIcon('cd', (ctx, x, y, s) => {
  const u = s / 32;
  const cx = x + 16 * u, cy = y + 16 * u;
  const g = ctx.createLinearGradient(cx - 12 * u, cy - 12 * u, cx + 12 * u, cy + 12 * u);
  g.addColorStop(0, '#e8e8f0'); g.addColorStop(0.3, '#a0d8f0'); g.addColorStop(0.5, '#f0c0e0');
  g.addColorStop(0.7, '#c0f0d0'); g.addColorStop(1, '#b0b0c8');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, 12 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c0c0c0';
  ctx.beginPath(); ctx.arc(cx, cy, 4 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#606060';
  ctx.beginPath(); ctx.arc(cx, cy, 1.8 * u, 0, Math.PI * 2); ctx.fill();
});

defIcon('help', (ctx, x, y, s) => {
  const u = s / 32;
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath(); ctx.arc(x + 16 * u, y + 16 * u, 12 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#403000';
  ctx.font = `bold ${20 * u}px Tahoma, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('?', x + 16 * u, y + 16.5 * u);
});

defIcon('warn', (ctx, x, y, s) => {
  const u = s / 32;
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.moveTo(x + 16 * u, y + 3 * u); ctx.lineTo(x + 30 * u, y + 28 * u); ctx.lineTo(x + 2 * u, y + 28 * u);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#8a6a00'; ctx.lineWidth = u; ctx.stroke();
  ctx.fillStyle = '#000000';
  ctx.fillRect(x + 14.5 * u, y + 11 * u, 3 * u, 9 * u);
  ctx.fillRect(x + 14.5 * u, y + 22 * u, 3 * u, 3 * u);
});

defIcon('error', (ctx, x, y, s) => {
  const u = s / 32;
  ctx.fillStyle = '#d02020';
  ctx.beginPath(); ctx.arc(x + 16 * u, y + 16 * u, 13 * u, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5 * u; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 10 * u, y + 10 * u); ctx.lineTo(x + 22 * u, y + 22 * u);
  ctx.moveTo(x + 22 * u, y + 10 * u); ctx.lineTo(x + 10 * u, y + 22 * u);
  ctx.stroke();
});

defIcon('info', (ctx, x, y, s) => {
  const u = s / 32;
  ctx.fillStyle = '#2050c0';
  ctx.beginPath(); ctx.arc(x + 16 * u, y + 16 * u, 13 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold italic ${19 * u}px Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('i', x + 16 * u, y + 16 * u);
});

defIcon('settings', (ctx, x, y, s) => {
  const u = s / 32;
  ctx.fillStyle = '#8a8a94';
  ctx.save();
  ctx.translate(x + 16 * u, y + 16 * u);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2 * u, -12 * u, 4 * u, 5 * u);
  }
  ctx.restore();
  ctx.fillStyle = '#b0b0ba';
  ctx.beginPath(); ctx.arc(x + 16 * u, y + 16 * u, 8 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6a6a74';
  ctx.beginPath(); ctx.arc(x + 16 * u, y + 16 * u, 3.5 * u, 0, Math.PI * 2); ctx.fill();
});

defIcon('shutdown', (ctx, x, y, s) => {
  const u = s / 32;
  ctx.strokeStyle = '#d03020'; ctx.lineWidth = 3 * u; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x + 16 * u, y + 17 * u, 9 * u, -Math.PI * 0.35, Math.PI * 1.35); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 16 * u, y + 5 * u); ctx.lineTo(x + 16 * u, y + 15 * u); ctx.stroke();
});

defIcon('find', (ctx, x, y, s) => {
  const u = s / 32;
  ctx.strokeStyle = '#404048'; ctx.lineWidth = 2.5 * u;
  ctx.beginPath(); ctx.arc(x + 13 * u, y + 13 * u, 8 * u, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(160,210,255,0.5)';
  ctx.beginPath(); ctx.arc(x + 13 * u, y + 13 * u, 7 * u, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#303038'; ctx.lineWidth = 3.5 * u; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 19 * u, y + 19 * u); ctx.lineTo(x + 27 * u, y + 27 * u); ctx.stroke();
});

defIcon('me', (ctx, x, y, s) => {
  const u = s / 32;
  // a little pug face, because of course
  ctx.fillStyle = '#d9bb8a';
  ctx.beginPath(); ctx.ellipse(x + 16 * u, y + 18 * u, 11 * u, 10 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2f28';
  ctx.beginPath(); ctx.ellipse(x + 8 * u, y + 10 * u, 4 * u, 5 * u, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 24 * u, y + 10 * u, 4 * u, 5 * u, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 16 * u, y + 21 * u, 6 * u, 5 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x + 12 * u, y + 15 * u, 2.6 * u, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 20 * u, y + 15 * u, 2.6 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.beginPath(); ctx.arc(x + 12 * u, y + 15.5 * u, 1.5 * u, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 20 * u, y + 15.5 * u, 1.5 * u, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 16 * u, y + 20 * u, 2.4 * u, 1.8 * u, 0, 0, Math.PI * 2); ctx.fill();
});

function bevelOutRaw(ctx, x, y, w, h, u) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, u); ctx.fillRect(x, y, u, h);
  ctx.fillStyle = '#606060'; ctx.fillRect(x, y + h - u, w, u); ctx.fillRect(x + w - u, y, u, h);
}

export function drawIcon(ctx, name, x, y, size = 32) {
  const fn = ICONS[name];
  if (!fn) return;
  ctx.save();
  fn(ctx, x, y, size);
  ctx.restore();
}

export const ICON_NAMES = Object.keys(ICONS);
