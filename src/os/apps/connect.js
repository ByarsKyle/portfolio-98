// ─────────────────────────────────────────────────────────────
// apps/connect — the sign-in panel shared by Mail and the vault.
//
// Both apps front a real Convex deployment behind a real Clerk instance, so
// both need the same three states drawn in the same place: not configured,
// signed out (a login box), and working on it. This is that box, rendered in
// 98 chrome so you never leave the machine to log in.
//
// Coordinates are content-relative throughout: rects are stored as offsets
// from the window's content origin, which is exactly what the OS hands to
// mouse(). Nothing here stores absolute canvas positions.
// ─────────────────────────────────────────────────────────────
import { C, FONT, bevelIn, fill, text, button, drawIcon, groupBox } from '../ui.js';
import backend from '../../net/backend.js';

const FIELDS = ['email', 'password'];

/**
 * @param {object} opts
 * @param {string} opts.blurb  one line explaining what this app wants a session for
 * @param {string} opts.icon   icon name drawn beside the blurb
 */
export function createConnectPanel({ blurb, icon = 'key' }) {
  const st = {
    email: '',
    password: '',
    code: '',
    field: 0,
    busy: false,
    message: null,
    needsHostedUI: false,
    verify: null,          // set when Clerk wants a verification code
    backend: backend.getStatus(),
    caret: 0,
    rects: {},
  };

  // keep the panel honest about the connection without polling
  const unsubscribe = backend.onChange((s) => {
    st.backend = s;
    if (s.status === 'online') {
      st.password = ''; st.code = ''; st.verify = null; st.message = null;
    }
    if (s.status === 'error' && s.error) st.message = s.error;
  });

  /** true when the app above should draw itself instead of this panel */
  const connected = () => st.backend.status === 'online';

  /** Every sign-in call answers in the same shape, so handle it in one place. */
  function handle(res, api) {
    st.busy = false;
    if (res.ok) {
      st.password = ''; st.code = ''; st.verify = null; st.message = null;
      api?.sound('ding');
      return;
    }
    if (res.verify) {
      // Clerk wants a code. Keep the password out of memory from here on.
      const fresh = !st.verify;
      st.verify = res.verify;
      st.password = '';
      if (fresh) { st.code = ''; st.field = 0; }
      st.message = res.message ?? null;
      api?.sound(fresh ? 'ding' : 'error');
      return;
    }
    st.verify = null;
    st.message = res.message ?? 'Sign in failed.';
    st.needsHostedUI = Boolean(res.needsHostedUI);
    api?.sound('error');
  }

  function submit(api) {
    if (st.busy) return;

    if (st.verify) {
      if (!st.code.trim()) {
        st.message = 'Enter the code.';
        api?.sound('error');
        return;
      }
      st.busy = true;
      st.message = 'Checking the code...';
      backend.submitCode(st.code).then((res) => handle(res, api));
      return;
    }

    if (!st.email.trim() || !st.password) {
      st.message = 'Enter your e-mail address and password.';
      api?.sound('error');
      return;
    }
    st.busy = true;
    st.message = 'Connecting to server...';
    st.needsHostedUI = false;
    backend.signIn(st.email, st.password).then((res) => handle(res, api));
  }

  function resend(api) {
    if (st.busy || !st.verify) return;
    st.busy = true;
    st.message = 'Sending another code...';
    backend.resendCode().then((res) => {
      st.busy = false;
      st.message = res.message ?? null;
      api?.sound(res.ok ? 'ding' : 'error');
    });
  }

  function startOver(api) {
    backend.cancelSignIn();
    st.verify = null; st.code = ''; st.password = '';
    st.field = 1; st.message = null; st.busy = false;
    api?.sound('click');
  }

  function draw(ctx, r, win, api) {
    fill(ctx, r.x, r.y, r.w, r.h, C.face);

    const s = st.backend;
    const W = Math.min(300, r.w - 24);
    const x = r.x + Math.round((r.w - W) / 2);
    let y = r.y + 16;
    st.rects = {};

    // ── not configured: nothing to sign in to
    if (!s.configured) {
      drawIcon(ctx, 'warn', x, y, 32);
      text(ctx, 'No server configured', x + 42, y + 4, { font: FONT.uiBold });
      ctx.font = FONT.ui;
      wrap(ctx, 'This build has no VITE_CONVEX_URL or VITE_CLERK_PUBLISHABLE_KEY, so there is nothing to connect to.', W - 42)
        .forEach((ln, i) => text(ctx, ln, x + 42, y + 22 + i * 14, { font: FONT.ui }));
      return;
    }

    // ── header. Advance by the blurb's real height: a fixed step is fine until
    // an app writes three lines and the group box lands on top of them.
    drawIcon(ctx, icon, x, y, 32);
    text(ctx, 'Connect to Personal OS', x + 42, y + 2, { font: FONT.uiBold });
    ctx.font = FONT.ui;
    const blurbLines = wrap(ctx, blurb, W - 46);
    blurbLines.forEach((ln, i) =>
      text(ctx, ln, x + 42, y + 18 + i * 13, { font: FONT.ui, color: '#404040' }));
    y += Math.max(54, 26 + blurbLines.length * 13);

    if (s.status === 'connecting') {
      text(ctx, 'Locating server...', x, y, { font: FONT.ui });
      return;
    }

    // one text field, drawn the same wherever it appears
    const field = (name, label, fx, fy, fw, index, mask = false) => {
      const fh = 18;
      text(ctx, label, x + 10, fy + fh / 2, { baseline: 'middle', font: FONT.ui });
      fill(ctx, fx, fy, fw, fh, st.busy ? C.face : C.white);
      bevelIn(ctx, fx, fy, fw, fh);
      const raw = st[name];
      const shown = mask ? '*'.repeat(raw.length) : raw;
      ctx.save();
      ctx.beginPath(); ctx.rect(fx + 2, fy, fw - 4, fh); ctx.clip();
      text(ctx, shown, fx + 4, fy + fh / 2, { baseline: 'middle', font: FONT.ui });
      if (st.field === index && !st.busy && Math.floor(st.caret * 2) % 2 === 0) {
        ctx.font = FONT.ui;
        fill(ctx, fx + 5 + ctx.measureText(shown).width, fy + 3, 1, 12, '#000');
      }
      ctx.restore();
      st.rects[name] = { x: fx - r.x, y: fy - r.y, w: fw, h: fh, field: index };
    };

    if (st.verify) {
      // ── step two: Clerk wants a verification code
      const v = st.verify;
      const where = v.hint ? ` to ${v.hint}` : '';
      const blurb2 = v.sent
        ? `A verification code was sent by ${v.label}${where}. Type it in below.`
        : `Open your ${v.label} and type the current code in below.`;
      ctx.font = FONT.ui;
      const lines = wrap(ctx, blurb2, W - 20);
      const boxH = 44 + lines.length * 13;
      groupBox(ctx, x, y, W, boxH, 'Verification');
      let ly = y + 18;
      lines.forEach((ln) => { text(ctx, ln, x + 10, ly, { font: FONT.ui }); ly += 13; });
      field('code', 'Code:', x + 72, ly + 4, Math.min(120, W - 82), 0);

      const bw = 74, bh = 21;
      let bx = x + W - bw - 8;
      const by = y + boxH + 8;
      button(ctx, bx, by, bw, bh, st.busy ? 'Wait...' : 'Verify',
        { disabled: st.busy, focus: !st.busy });
      st.rects.connect = { x: bx - r.x, y: by - r.y, w: bw, h: bh };
      if (v.sent) {
        bx -= 82;
        button(ctx, bx, by, 74, bh, 'Resend', { disabled: st.busy });
        st.rects.resend = { x: bx - r.x, y: by - r.y, w: 74, h: bh };
      }
      button(ctx, x, by, 74, bh, 'Start over', { disabled: st.busy });
      st.rects.startover = { x: x - r.x, y: by - r.y, w: 74, h: bh };
      y = by + bh + 12;
    } else {
      // ── step one: credentials
      groupBox(ctx, x, y, W, 92, 'Account');
      let fy = y + 20;
      FIELDS.forEach((name, i) => {
        field(name, name === 'email' ? 'E-mail:' : 'Password:',
          x + 72, fy, W - 82, i, name === 'password');
        fy += 26;
      });

      const by = y + 68;
      const bw = 74, bh = 21;
      button(ctx, x + W - bw - 8, by, bw, bh, st.busy ? 'Wait...' : 'Connect',
        { disabled: st.busy, focus: !st.busy });
      st.rects.connect = { x: x + W - bw - 8 - r.x, y: by - r.y, w: bw, h: bh };
      y += 104;
    }

    // ── status line
    if (st.message) {
      const err = !st.busy;
      ctx.font = FONT.ui;
      wrap(ctx, st.message, W).forEach((ln, i) =>
        text(ctx, ln, x, y + i * 13, { font: FONT.ui, color: err ? '#a00000' : '#404040' }));
      y += wrap(ctx, st.message, W).length * 13 + 6;
    }

    // Clerk's own modal handles anything a canvas can't, and it is also the
    // guaranteed way through if this dialog's own code flow goes wrong — so it
    // stays reachable for as long as a verification is outstanding.
    if (st.needsHostedUI || st.verify) {
      const hw = 150;
      button(ctx, x, y, hw, 21, 'Other sign-in options...');
      st.rects.hosted = { x: x - r.x, y: y - r.y, w: hw, h: 21 };
      y += 28;
    }

    text(ctx, 'Only the account owner is authorised; the server checks.',
      x, r.y + r.h - 14, { font: FONT.small, color: '#707070' });
  }

  /** Whichever fields the current step is showing. */
  const activeFields = () => (st.verify ? ['code'] : FIELDS);

  function mouse(type, mx, my, btn, win, api) {
    if (type !== 'down' && type !== 'dblclick') return;
    const hit = (rect) => rect && mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;

    for (const name of activeFields()) {
      if (hit(st.rects[name])) { st.field = st.rects[name].field; st.caret = 0; return; }
    }
    if (hit(st.rects.connect)) { submit(api); return; }
    if (hit(st.rects.resend)) { resend(api); return; }
    if (hit(st.rects.startover)) { startOver(api); return; }
    if (hit(st.rects.hosted)) { backend.openHostedSignIn(); return; }
  }

  function key(e, win, api) {
    if (st.busy) return;
    const fields = activeFields();
    if (e.key === 'Tab') { st.field = (st.field + 1) % fields.length; st.caret = 0; return; }
    if (e.key === 'Enter') { submit(api); return; }
    const name = fields[st.field] ?? fields[0];
    if (e.key === 'Backspace') { st[name] = st[name].slice(0, -1); st.caret = 0; return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { st[name] += e.key; st.caret = 0; }
  }

  function update(dt) { st.caret += dt; }

  return { st, draw, mouse, key, update, connected, dispose: unsubscribe };
}

/** Local copy — the browser has one but exporting it would couple the apps. */
function wrap(ctx, str, maxW) {
  const words = String(str).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export { wrap };
