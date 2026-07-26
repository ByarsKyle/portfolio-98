// ─────────────────────────────────────────────────────────────
// apps/mail — Outlook Express 5, wired to a real mailbox.
//
// Everything in this window is genuine: the folder list, the message list,
// the preview pane and the compose window all talk to the same Convex
// deployment that backs Personal OS, through net/backend.js. Nothing here is
// canned. If a message arrives while you are looking at the list it appears,
// because the list and the unread count are live Convex subscriptions rather
// than polls.
//
// Two shapes of window come out of create(): the three-pane reader, and a
// compose window (opened with api.open('mail', { compose: {...} })). They
// share the sign-in panel, the glyphs and the little text-field editor, and
// nothing else.
//
// Coordinates: draw() gets an absolute content rect, mouse() gets
// content-relative points. Every hit rect stored here is content-relative and
// gets r.x/r.y added at paint time — same convention as connect.js.
// ─────────────────────────────────────────────────────────────
import {
  C, FONT, bevelOut, bevelIn, etchIn, fill, text, button, drawIcon, scrollBar,
} from '../ui.js';
import { createConnectPanel, wrap } from './connect.js';
import backend from '../../net/backend.js';

const BLURB = 'Outlook Express reads the same mailbox as Personal OS. Sign in to collect your mail.';

const FOLDERS = [
  { view: 'inbox', label: 'Inbox', glyph: 'inbox' },
  { view: 'done', label: 'Archive', glyph: 'folder' },
  { view: 'starred', label: 'Starred', glyph: 'star' },
  { view: 'snoozed', label: 'Snoozed', glyph: 'clock' },
  { view: 'trash', label: 'Deleted Items', glyph: 'trash' },
];

const PAGE_SIZE = 60;      // one screenful of Inbox is nowhere near this
const UNDO_SECONDS = 7;    // matches the server's send window

// ── small helpers ────────────────────────────────────────────
const hit = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** "Kyle Byars" from { name, email }, falling back to the local part. */
function who(p) {
  if (!p) return '(unknown)';
  if (p.name) return p.name;
  const e = String(p.email ?? '');
  return e.split('@')[0] || e || '(unknown)';
}

function fullAddr(p) {
  if (!p) return '';
  return p.name ? `${p.name} <${p.email}>` : String(p.email ?? '');
}

/** OE showed the clock for today and a short date for anything older. */
function fmtWhen(ms, now) {
  if (!ms) return '';
  const d = new Date(ms);
  const n = new Date(now);
  const sameDay = d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  if (sameDay) {
    let h = d.getHours();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

function fmtLong(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

const ENTS = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—',
  ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', middot: '·',
};

function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m;
    }
    return ENTS[body.toLowerCase()] ?? m;
  });
}

/**
 * HTML → something a canvas can lay out. The server already sanitises the
 * markup, so this only has to be a de-tagger, not a defence.
 */
function htmlToText(html) {
  let s = String(html ?? '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<li\b[^>]*>/gi, '\n• ');
  s = s.replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table|ul|ol)\s*>/gi, '\n');
  s = s.replace(/<[^>]*>/g, '');
  s = decodeEntities(s);
  s = s.replace(/\r/g, '');
  s = s.replace(/[ \t ]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const textToHtml = (s) => String(s).split('\n')
  .map((ln) => `<div>${escapeHtml(ln) || '<br>'}</div>`).join('');

/** "a@b.com, c@d.com; e@f.com" → three addresses. */
const splitAddrs = (s) => String(s).split(/[,;]/).map((v) => v.trim()).filter(Boolean);

/**
 * One keystroke against a text field. Returns null when the key means
 * something to the caller instead (Tab, Enter in a single-line field, ...).
 */
function editKey(e, val, caret, multiline = false) {
  const k = e.key;
  const c = Math.max(0, Math.min(val.length, caret));
  if (k === 'Backspace') return c > 0 ? { val: val.slice(0, c - 1) + val.slice(c), caret: c - 1 } : { val, caret: c };
  if (k === 'Delete') return { val: val.slice(0, c) + val.slice(c + 1), caret: c };
  if (k === 'ArrowLeft') return { val, caret: Math.max(0, c - 1) };
  if (k === 'ArrowRight') return { val, caret: Math.min(val.length, c + 1) };
  if (k === 'Home') return { val, caret: 0 };
  if (k === 'End') return { val, caret: val.length };
  if (k === 'Enter' && multiline) return { val: `${val.slice(0, c)}\n${val.slice(c)}`, caret: c + 1 };
  if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    return { val: val.slice(0, c) + k + val.slice(c), caret: c + 1 };
  }
  return null;
}

/** Wrap into lines, honouring hard newlines. Callers memoise the result. */
function layoutText(ctx, str, maxW, font = FONT.ui) {
  ctx.font = font;
  const out = [];
  for (const para of String(str).split('\n')) {
    if (!para) { out.push(''); continue; }
    for (const ln of wrap(ctx, para, maxW)) out.push(ln);
  }
  return out;
}

/** Single-line sunken field with a clipped view of its text. */
function field(ctx, x, y, w, h, value, { focused = false, blink = false } = {}) {
  fill(ctx, x, y, w, h, C.white);
  bevelIn(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 2, y + 1, w - 4, h - 2); ctx.clip();
  text(ctx, value, x + 3, y + h / 2, { baseline: 'middle', font: FONT.ui });
  if (focused && blink) {
    ctx.font = FONT.ui;
    fill(ctx, x + 4 + ctx.measureText(value).width, y + 3, 1, h - 6, '#000000');
  }
  ctx.restore();
}

// ── procedural glyphs ────────────────────────────────────────
// Everything the toolbar and the folder tree draw is rectangles and paths:
// no image files, and no fonts we can't count on.

function envelopeAt(ctx, x, y, w, h, { open = false } = {}) {
  fill(ctx, x, y, w, h, '#ffffff');
  ctx.strokeStyle = '#505050'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = open ? '#9aa8bc' : '#1a4a9a';
  ctx.beginPath();
  ctx.moveTo(x + 1, y + 1);
  ctx.lineTo(x + w / 2, y + (open ? h * 0.35 : h * 0.62));
  ctx.lineTo(x + w - 1, y + 1);
  ctx.stroke();
}

function starAt(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.44 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  if (filled) { ctx.fillStyle = '#f0b820'; ctx.fill(); }
  ctx.strokeStyle = filled ? '#8a6000' : '#a0a0a0';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function triangle(ctx, cx, cy, size, dir, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (dir === 'left') { ctx.moveTo(cx - size, cy); ctx.lineTo(cx + size, cy - size); ctx.lineTo(cx + size, cy + size); }
  else if (dir === 'right') { ctx.moveTo(cx + size, cy); ctx.lineTo(cx - size, cy - size); ctx.lineTo(cx - size, cy + size); }
  else if (dir === 'down') { ctx.moveTo(cx, cy + size); ctx.lineTo(cx - size, cy - size); ctx.lineTo(cx + size, cy - size); }
  else { ctx.moveTo(cx, cy - size); ctx.lineTo(cx - size, cy + size); ctx.lineTo(cx + size, cy + size); }
  ctx.closePath(); ctx.fill();
}

function wastebasket(ctx, cx, cy, s) {
  const w = s * 0.62, h = s * 0.72;
  const x = cx - w / 2, y = cy - h / 2 + s * 0.08;
  ctx.fillStyle = '#9aa4b0';
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y);
  ctx.lineTo(x + w * 0.86, y + h); ctx.lineTo(x + w * 0.14, y + h);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6a7480';
  for (let i = 1; i < 3; i++) ctx.fillRect(x + (w * i) / 3, y + 2, 1, h - 4);
  ctx.fillStyle = '#c0c8d2';
  ctx.fillRect(x - 1, y - s * 0.16, w + 2, s * 0.13);
  ctx.fillRect(cx - s * 0.1, y - s * 0.26, s * 0.2, s * 0.1);
}

/** Toolbar icons, drawn centred on (cx, cy) inside a 16px box. */
function toolGlyph(ctx, name, cx, cy, { on = true, lit = false } = {}) {
  ctx.save();
  ctx.globalAlpha = on ? 1 : 0.35;
  ctx.lineWidth = 1;
  switch (name) {
    case 'new':
      envelopeAt(ctx, cx - 8, cy - 4, 14, 10);
      triangle(ctx, cx + 6, cy - 6, 3.4, 'up', '#f0c020');
      ctx.fillStyle = '#f0c020'; ctx.fillRect(cx + 4.6, cy - 6, 2.8, 4);
      break;
    case 'reply':
      envelopeAt(ctx, cx - 3, cy - 4, 11, 9);
      triangle(ctx, cx - 6, cy - 1, 4, 'left', '#1a5ac0');
      ctx.fillStyle = '#1a5ac0'; ctx.fillRect(cx - 6, cy - 2, 6, 2);
      break;
    case 'replyall':
      envelopeAt(ctx, cx - 1, cy - 4, 9, 9);
      triangle(ctx, cx - 7, cy - 3, 3.2, 'left', '#1a5ac0');
      triangle(ctx, cx - 7, cy + 3, 3.2, 'left', '#5a90e0');
      break;
    case 'forward':
      envelopeAt(ctx, cx - 8, cy - 4, 11, 9);
      triangle(ctx, cx + 6, cy - 1, 4, 'right', '#1a8a3a');
      ctx.fillStyle = '#1a8a3a'; ctx.fillRect(cx, cy - 2, 6, 2);
      break;
    case 'delete':
      wastebasket(ctx, cx, cy, 16);
      break;
    case 'archive':
      fill(ctx, cx - 8, cy - 1, 16, 7, '#d8b050');
      ctx.strokeStyle = '#8a6a18'; ctx.strokeRect(cx - 7.5, cy - 0.5, 15, 6);
      fill(ctx, cx - 8, cy - 5, 16, 4, '#f0d090');
      ctx.strokeRect(cx - 7.5, cy - 4.5, 15, 3);
      triangle(ctx, cx, cy + 2.5, 3, 'down', '#6a5010');
      break;
    case 'inboxmove':
      fill(ctx, cx - 8, cy + 1, 16, 5, '#b8c4d4');
      ctx.strokeStyle = '#5a6a80'; ctx.strokeRect(cx - 7.5, cy + 1.5, 15, 4);
      triangle(ctx, cx, cy - 1, 4, 'down', '#1a5ac0');
      ctx.fillStyle = '#1a5ac0'; ctx.fillRect(cx - 1.5, cy - 8, 3, 4);
      break;
    case 'star':
      starAt(ctx, cx, cy, 7.5, lit);
      break;
    case 'sendrecv':
      envelopeAt(ctx, cx - 8, cy - 3, 12, 9);
      triangle(ctx, cx + 5, cy - 4, 4, 'up', '#1a8a3a');
      triangle(ctx, cx + 5, cy + 4, 4, 'down', '#1a5ac0');
      break;
    case 'send':
      envelopeAt(ctx, cx - 8, cy - 4, 13, 10);
      triangle(ctx, cx + 6, cy, 4.5, 'right', '#1a8a3a');
      break;
    case 'clip':
      ctx.strokeStyle = '#707880'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy - 2, 4, Math.PI, 0);
      ctx.lineTo(cx + 4, cy + 4);
      ctx.stroke();
      break;
    default: break;
  }
  ctx.restore();
}

/** Folder-tree icons, 14px. */
function folderGlyph(ctx, kind, x, y, s = 14) {
  const cx = x + s / 2, cy = y + s / 2;
  ctx.save();
  ctx.lineWidth = 1;
  if (kind === 'inbox') {
    fill(ctx, x + 1, y + 6, s - 2, s - 8, '#b8c4d4');
    ctx.strokeStyle = '#5a6a80'; ctx.strokeRect(x + 1.5, y + 6.5, s - 3, s - 9);
    triangle(ctx, cx, y + 4, 3.2, 'down', '#1a5ac0');
  } else if (kind === 'folder') {
    fill(ctx, x + 1, y + 3, 6, 2, '#e8b84b');
    fill(ctx, x + 1, y + 4, s - 2, s - 7, '#ffd166');
    ctx.strokeStyle = '#a07a20'; ctx.strokeRect(x + 1.5, y + 4.5, s - 3, s - 8);
  } else if (kind === 'star') {
    starAt(ctx, cx, cy, 6, true);
  } else if (kind === 'clock') {
    ctx.fillStyle = '#e8eef6';
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#40506a'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 3.6);
    ctx.moveTo(cx, cy); ctx.lineTo(cx + 2.6, cy + 1.4);
    ctx.stroke();
  } else if (kind === 'trash') {
    wastebasket(ctx, cx, cy + 1, 13);
  } else if (kind === 'find') {
    ctx.strokeStyle = '#404048'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx - 1, cy - 1, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 2, cy + 2); ctx.lineTo(cx + 5, cy + 5); ctx.stroke();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// the reader
// ─────────────────────────────────────────────────────────────
function createMain() {
  const panel = createConnectPanel({ blurb: BLURB, icon: 'mail' });

  const st = {
    t: 0,
    now: Date.now(),
    view: 'inbox',
    threads: [],
    isDone: true,
    loading: true,
    unread: 0,
    selId: null,
    scroll: 0,           // message list scroll, in rows
    pScroll: 0,          // preview scroll, in lines
    detail: null,        // getThread payload for selId
    accounts: [],
    status: 'Ready',
    error: null,
    hover: null,         // toolbar button id under the pointer
    find: { open: false, q: '', caret: 0, busy: false, threads: null },
    rects: {},
    busy: 0,             // seconds of hourglass left
  };

  // Bodies live in Convex storage behind signed URLs, so each one is fetched
  // once and kept here; the URLs themselves expire, the text does not.
  const bodies = new Map();      // messageId -> text
  const fetching = new Set();    // messageId
  const requested = new Set();   // threadId, so requestBodies fires once

  let stopList = null;
  let stopUnread = null;
  let stopDetail = null;
  let online = backend.getStatus().status === 'online';
  let dead = false;

  const bodyMemo = { key: '', lines: [] };

  // ── subscriptions ──────────────────────────────────────────
  function subscribeList() {
    stopList?.();
    st.loading = true;
    st.threads = [];
    stopList = backend.watch('mail/threads:list',
      { view: st.view, paginationOpts: { numItems: PAGE_SIZE, cursor: null } },
      (value, err) => {
        if (dead) return;
        st.loading = false;
        if (err) { st.error = err; return; }
        st.error = null;
        // tab/account filtering happens after pagination server-side, so a
        // short page is not the end of the list — isDone is.
        st.threads = value?.page ?? [];
        st.isDone = value?.isDone !== false;
        if (!st.find.threads && !st.threads.some((t) => t._id === st.selId)) {
          select(st.threads[0]?._id ?? null, null);
        }
      });
  }

  function subscribeUnread() {
    stopUnread?.();
    stopUnread = backend.watch('mail/threads:inboxUnread', {}, (value, err) => {
      if (dead || err) return;
      st.unread = typeof value === 'number' ? value : 0;
    });
  }

  function subscribeDetail() {
    stopDetail?.();
    stopDetail = null;
    st.detail = null;
    bodyMemo.key = '';
    if (!st.selId) return;
    const id = st.selId;
    stopDetail = backend.watch('mail/threads:getThread', { threadId: id }, (value, err) => {
      if (dead || id !== st.selId) return;
      if (err) { st.error = err; return; }
      st.detail = value ?? null;
      bodyMemo.key = '';
      pullBody();
    });
  }

  function startAll() {
    subscribeList();
    subscribeUnread();
    backend.query('mail/accounts:list', {}, [])
      .then((a) => { if (!dead) st.accounts = a ?? []; })
      .catch(() => {});
  }

  const stopBackendWatch = backend.onChange((s) => {
    const nowOnline = s.status === 'online';
    if (nowOnline && !online) { online = true; startAll(); }
    else if (!nowOnline && online) {
      online = false;
      stopList?.(); stopUnread?.(); stopDetail?.();
      stopList = null; stopUnread = null; stopDetail = null;
      st.threads = []; st.detail = null; st.selId = null;
    }
  });

  // ── selection & bodies ─────────────────────────────────────
  const rows = () => st.find.threads ?? st.threads;

  const selected = () => (st.selId ? rows().find((t) => t._id === st.selId) ?? null : null);

  function select(id, papi) {
    if (id === st.selId) return;
    st.selId = id;
    st.pScroll = 0;
    subscribeDetail();
    const th = selected();
    if (th && th.unreadCount > 0) {
      backend.mutation('mail/threads:markRead', { threadId: id, read: true }).catch(() => {});
    }
    papi?.sound('click');
  }

  /** The message the preview pane shows: the newest one in the thread. */
  function shownMessage() {
    const msgs = st.detail?.messages;
    return msgs && msgs.length ? msgs[msgs.length - 1] : null;
  }

  /** Ask for the body once, then read it out of storage when it lands. */
  function pullBody() {
    const msg = shownMessage();
    if (!msg) return;
    if (msg.bodyState !== 'ready') {
      const tid = st.detail?.thread?._id;
      if (tid && !requested.has(tid)) {
        requested.add(tid);
        backend.mutation('mail/threads:requestBodies', { threadId: tid }).catch(() => {});
      }
      return;
    }
    if (bodies.has(msg._id) || fetching.has(msg._id)) return;
    const url = msg.bodyTextUrl || msg.bodyHtmlUrl;
    if (!url) {
      bodies.set(msg._id, msg.snippet || '(This message has no text.)');
      bodyMemo.key = '';
      return;
    }
    const asHtml = !msg.bodyTextUrl;
    fetching.add(msg._id);
    fetch(url)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((raw) => {
        bodies.set(msg._id, asHtml ? htmlToText(raw) : String(raw).replace(/\r/g, '').trim());
      })
      .catch(() => {
        bodies.set(msg._id, msg.snippet || '(The message body could not be retrieved.)');
      })
      .then(() => { fetching.delete(msg._id); bodyMemo.key = ''; });
  }

  // ── actions ────────────────────────────────────────────────
  function act(name, papi) {
    const th = selected();
    if (!th) return;
    const id = th._id;
    const list = rows();
    const idx = list.findIndex((t) => t._id === id);
    const after = list[idx + 1]?._id ?? list[idx - 1]?._id ?? null;

    let call = null;
    if (name === 'delete') call = ['mail/threads:trash', { threadId: id }];
    else if (name === 'archive') call = ['mail/threads:archive', { threadId: id }];
    else if (name === 'inbox') call = ['mail/threads:moveToInbox', { threadId: id }];
    else if (name === 'star') call = ['mail/threads:toggleStar', { threadId: id }];
    else if (name === 'read') call = ['mail/threads:markRead', { threadId: id, read: true }];
    else if (name === 'unread') call = ['mail/threads:markRead', { threadId: id, read: false }];
    if (!call) return;

    // optimistic: the row is about to move or change, the watch will correct us
    if (name === 'star') th.isFlagged = !th.isFlagged;
    else if (name === 'read' || name === 'unread') th.unreadCount = name === 'read' ? 0 : 1;
    else select(after, null);

    st.busy = 0.6;
    backend.mutation(call[0], call[1]).catch((err) => {
      papi?.messageBox('Outlook Express', String(err?.message ?? err), { icon: 'error', w: 340 });
    });
    papi?.sound('click');
  }

  function compose(mode, papi) {
    const th = selected();
    if (mode !== 'new' && !th) return;
    papi.open('mail', {
      compose: {
        mode,
        threadId: mode === 'new' ? undefined : th._id,
        accountId: st.accounts[0]?._id,
      },
    }, { x: 74, y: 46 });
  }

  function sendReceive(papi) {
    st.status = 'Checking for new messages on the server...';
    st.busy = 1.2;
    if (online) { subscribeList(); subscribeUnread(); }
    papi?.sound('click');
    setTimeout(() => { if (!dead) st.status = 'Ready'; }, 1500);
  }

  function runSearch(papi) {
    const q = st.find.q.trim();
    if (!q) { st.find.threads = null; return; }
    st.find.busy = true;
    st.busy = 1;
    backend.query('mail/threads:search', { q }, []).then((res) => {
      if (dead) return;
      st.find.busy = false;
      st.find.threads = (res ?? []).map((m) => m.thread).filter(Boolean);
      st.scroll = 0;
      st.status = `${st.find.threads.length} message(s) found.`;
      st.selId = null;
      select(st.find.threads[0]?._id ?? null, null);
    }).catch(() => { if (!dead) st.find.busy = false; });
    papi?.sound('click');
  }

  function closeFind() {
    st.find.open = false;
    st.find.q = '';
    st.find.threads = null;
    st.scroll = 0;
    if (!rows().some((t) => t._id === st.selId)) {
      st.selId = null;
      select(rows()[0]?._id ?? null, null);
    }
  }

  function setView(v, papi) {
    if (v === st.view && !st.find.threads) return;
    st.view = v;
    st.find.threads = null;
    st.scroll = 0;
    st.selId = null;
    subscribeDetail();
    if (online) subscribeList();
    papi?.sound('click');
  }

  function showAccounts(papi) {
    backend.query('mail/accounts:list', {}, []).then((list) => {
      if (dead) return;
      st.accounts = list ?? [];
      const body = st.accounts.length
        ? st.accounts.map((a) => `${a.displayName || a.emailAddress}\n   ${a.provider === 'graph' ? 'Exchange/Graph' : 'IMAP'} · ${a.status}${a.lastError ? ` · ${a.lastError}` : ''}`).join('\n')
        : 'No mail accounts are configured on the server.';
      papi.messageBox('Internet Accounts', body, { icon: 'mail', w: 370 });
    }).catch(() => {});
  }

  // ── layout ─────────────────────────────────────────────────
  const TOOL_H = 38, STATUS_H = 18, TREE_W = 118, ROW_H = 16, HEAD_H = 17, SBW = 15, FIND_H = 20;

  function layout(r) {
    const bodyY = TOOL_H;
    const bodyH = Math.max(60, r.h - TOOL_H - STATUS_H);
    const rx = TREE_W + 4;
    const rw = Math.max(120, r.w - rx - 2);
    const listH = Math.max(HEAD_H + ROW_H * 2 + 4, Math.round(bodyH * 0.54));
    return {
      tree: { x: 2, y: bodyY, w: TREE_W - 4, h: bodyH },
      list: { x: rx, y: bodyY, w: rw, h: listH },
      prev: { x: rx, y: bodyY + listH + 3, w: rw, h: Math.max(28, bodyH - listH - 3) },
      status: { x: 0, y: r.h - STATUS_H, w: r.w, h: STATUS_H },
    };
  }

  function toolbarButtons() {
    const th = selected();
    const filed = st.view === 'done' || st.view === 'trash' || st.view === 'snoozed';
    return [
      { id: 'new', label: 'New Mail', glyph: 'new', on: true },
      { id: 'reply', label: 'Reply', glyph: 'reply', on: !!th },
      { id: 'replyAll', label: 'Reply All', glyph: 'replyall', on: !!th },
      { id: 'forward', label: 'Forward', glyph: 'forward', on: !!th },
      { sep: true },
      { id: 'delete', label: 'Delete', glyph: 'delete', on: !!th },
      filed
        ? { id: 'inbox', label: 'Inbox', glyph: 'inboxmove', on: !!th }
        : { id: 'archive', label: 'Archive', glyph: 'archive', on: !!th },
      { id: 'star', label: 'Star', glyph: 'star', on: !!th, lit: !!th?.isFlagged },
      { sep: true },
      { id: 'sendrecv', label: 'Send/Recv', glyph: 'sendrecv', on: true },
    ];
  }

  function drawToolbar(ctx, r) {
    fill(ctx, r.x, r.y, r.w, TOOL_H, C.face);
    ctx.font = FONT.small;
    let x = 3;
    st.rects.tools = [];
    for (const b of toolbarButtons()) {
      if (b.sep) {
        fill(ctx, r.x + x + 2, r.y + 4, 1, 28, C.shadow);
        fill(ctx, r.x + x + 3, r.y + 4, 1, 28, C.white);
        x += 7;
        continue;
      }
      const bw = Math.max(38, Math.ceil(ctx.measureText(b.label).width) + 8);
      if (st.hover === b.id && b.on) bevelOut(ctx, r.x + x, r.y + 2, bw, 32);
      toolGlyph(ctx, b.glyph, r.x + x + bw / 2, r.y + 13, { on: b.on, lit: b.lit });
      text(ctx, b.label, r.x + x + bw / 2, r.y + 24, {
        align: 'center', font: FONT.small, color: b.on ? C.text : C.disabled,
      });
      st.rects.tools.push({ x, y: 2, w: bw, h: 32, id: b.id, on: b.on });
      x += bw;
    }
    fill(ctx, r.x, r.y + TOOL_H - 2, r.w, 1, C.shadow);
    fill(ctx, r.x, r.y + TOOL_H - 1, r.w, 1, C.white);
  }

  function drawTree(ctx, r, L) {
    const b = L.tree;
    fill(ctx, r.x + b.x, r.y + b.y, b.w, b.h, C.white);
    bevelIn(ctx, r.x + b.x, r.y + b.y, b.w, b.h);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x + b.x + 2, r.y + b.y + 2, b.w - 4, b.h - 4); ctx.clip();

    let y = b.y + 4;
    drawIcon(ctx, 'mail', r.x + b.x + 4, r.y + y, 14);
    text(ctx, 'Outlook Express', r.x + b.x + 22, r.y + y + 7, { baseline: 'middle', font: FONT.ui });
    y += 19;

    st.rects.folders = [];
    for (const f of FOLDERS) {
      const on = !st.find.threads && st.view === f.view;
      const rowW = b.w - 8;
      if (on) fill(ctx, r.x + b.x + 4, r.y + y, rowW, 17, C.select);
      folderGlyph(ctx, f.glyph, r.x + b.x + 14, r.y + y + 2, 14);
      const bold = f.view === 'inbox' && st.unread > 0;
      const label = bold ? `${f.label} (${st.unread})` : f.label;
      text(ctx, label, r.x + b.x + 32, r.y + y + 9, {
        baseline: 'middle',
        font: bold ? FONT.uiBold : FONT.ui,
        color: on ? C.selectText : C.text,
      });
      st.rects.folders.push({ x: b.x + 4, y, w: rowW, h: 17, view: f.view });
      y += 18;
    }

    if (st.find.threads) {
      y += 4;
      fill(ctx, r.x + b.x + 4, r.y + y, b.w - 8, 17, C.select);
      folderGlyph(ctx, 'find', r.x + b.x + 14, r.y + y + 2, 14);
      text(ctx, 'Search Results', r.x + b.x + 32, r.y + y + 9, {
        baseline: 'middle', font: FONT.ui, color: C.selectText,
      });
    }
    ctx.restore();
  }

  function drawList(ctx, r, L) {
    const b = L.list;
    const ax = r.x + b.x, ay = r.y + b.y;
    fill(ctx, ax, ay, b.w, b.h, C.white);
    bevelIn(ctx, ax, ay, b.w, b.h);

    let top = b.y + 2;
    st.rects.findField = null;
    st.rects.findGo = null;
    st.rects.findClose = null;
    if (st.find.open) {
      fill(ctx, ax + 2, r.y + top, b.w - 4, FIND_H, C.face);
      text(ctx, 'Look for:', ax + 5, r.y + top + FIND_H / 2, { baseline: 'middle', font: FONT.small });
      const fx = b.x + 50, fw = Math.max(40, b.w - 120);
      field(ctx, r.x + fx, r.y + top + 2, fw, 16, st.find.q, {
        focused: true, blink: Math.floor(st.t * 2) % 2 === 0,
      });
      button(ctx, ax + b.w - 66, r.y + top + 2, 30, 16, 'Find', { font: FONT.small });
      button(ctx, ax + b.w - 34, r.y + top + 2, 32, 16, 'Close', { font: FONT.small });
      st.rects.findField = { x: fx, y: top + 2, w: fw, h: 16 };
      st.rects.findGo = { x: b.x + b.w - 66, y: top + 2, w: 30, h: 16 };
      st.rects.findClose = { x: b.x + b.w - 34, y: top + 2, w: 32, h: 16 };
      top += FIND_H;
    }

    const innerW = b.w - 4;
    const gridW = innerW - SBW;
    const cStar = 14, cIcon = 16, cRecv = 58;
    const cFrom = Math.min(112, Math.max(64, Math.round(gridW * 0.25)));
    const cSubj = Math.max(36, gridW - cStar - cIcon - cFrom - cRecv);

    // ── column headers
    const cols = [
      { w: cStar, label: '' }, { w: cIcon, label: '' },
      { w: cFrom, label: 'From' }, { w: cSubj, label: 'Subject' }, { w: cRecv, label: 'Received' },
    ];
    let hx = b.x + 2;
    for (const c of cols) {
      button(ctx, r.x + hx, r.y + top, c.w, HEAD_H, null);
      if (c.label) {
        ctx.save();
        ctx.beginPath(); ctx.rect(r.x + hx + 2, r.y + top, c.w - 4, HEAD_H); ctx.clip();
        text(ctx, c.label, r.x + hx + 4, r.y + top + HEAD_H / 2, { baseline: 'middle', font: FONT.small });
        ctx.restore();
      }
      hx += c.w;
    }
    fill(ctx, r.x + hx, r.y + top, Math.max(0, b.x + 2 + innerW - hx), HEAD_H, C.face);

    // ── rows
    const gridY = top + HEAD_H;
    const gridH = Math.max(0, b.y + b.h - 2 - gridY);
    const vis = Math.max(0, Math.floor(gridH / ROW_H));
    const list = rows();
    st.scroll = Math.max(0, Math.min(Math.max(0, list.length - vis), st.scroll));

    ctx.save();
    ctx.beginPath(); ctx.rect(r.x + b.x + 2, r.y + gridY, gridW, gridH); ctx.clip();

    if (st.loading && !list.length) {
      text(ctx, 'Retrieving message list...', r.x + b.x + 8, r.y + gridY + 8, { font: FONT.ui, color: '#404040' });
    } else if (!list.length) {
      const msg = st.find.threads
        ? 'No messages match what you are looking for.'
        : 'There are no items in this view.';
      text(ctx, msg, r.x + b.x + 8, r.y + gridY + 8, { font: FONT.ui, color: '#606060' });
    }

    st.rects.rows = [];
    for (let i = 0; i < vis; i++) {
      const th = list[st.scroll + i];
      if (!th) break;
      const ry = gridY + i * ROW_H;
      const sel = th._id === st.selId;
      const unread = th.unreadCount > 0;
      if (sel) fill(ctx, r.x + b.x + 2, r.y + ry, gridW, ROW_H, C.select);
      const col = sel ? C.selectText : C.text;
      const font = unread ? FONT.uiBold : FONT.ui;

      let cx = b.x + 2;
      starAt(ctx, r.x + cx + cStar / 2, r.y + ry + ROW_H / 2, 5, th.isFlagged);
      cx += cStar;
      envelopeAt(ctx, r.x + cx + 2, r.y + ry + 4, 11, 8, { open: !unread });
      cx += cIcon;

      const cell = (str, w, right = false) => {
        ctx.save();
        ctx.beginPath(); ctx.rect(r.x + cx, r.y + ry, Math.max(1, w - 3), ROW_H); ctx.clip();
        text(ctx, str, r.x + cx + (right ? w - 6 : 2), r.y + ry + ROW_H / 2, {
          baseline: 'middle', font, color: col, align: right ? 'right' : 'left',
        });
        ctx.restore();
        cx += w;
      };
      cell(who(th.participants?.[0]), cFrom);
      cell(th.subjectNorm || '(no subject)', cSubj);
      cell(fmtWhen(th.lastMessageAt, st.now), cRecv, true);

      st.rects.rows.push({ x: b.x + 2, y: ry, w: gridW, h: ROW_H, id: th._id, starW: cStar });
    }
    ctx.restore();

    const sbX = b.x + 2 + gridW;
    scrollBar(ctx, r.x + sbX, r.y + gridY, SBW, gridH,
      st.scroll * ROW_H, vis * ROW_H, Math.max(vis, list.length) * ROW_H, true);
    st.rects.listSb = { x: sbX, y: gridY, w: SBW, h: gridH, vis };
  }

  function drawPreview(ctx, r, L) {
    const b = L.prev;
    const ax = r.x + b.x, ay = r.y + b.y;
    fill(ctx, ax, ay, b.w, b.h, C.white);
    bevelIn(ctx, ax, ay, b.w, b.h);

    const th = selected();
    if (!th) {
      text(ctx, 'There is no message selected.', ax + 8, ay + 8, { font: FONT.ui, color: '#606060' });
      st.rects.prevSb = null;
      return;
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(ax + 2, ay + 2, b.w - 4, b.h - 4); ctx.clip();

    const msg = shownMessage();
    const hx = ax + 6;
    let hy = ay + 5;
    const LH = 13;
    const headW = b.w - 14;

    const head = (label, value) => {
      text(ctx, label, hx, hy, { font: FONT.uiBold });
      ctx.save();
      ctx.beginPath(); ctx.rect(hx + 44, hy - 1, Math.max(1, headW - 44), LH); ctx.clip();
      text(ctx, value, hx + 44, hy, { font: FONT.ui });
      ctx.restore();
      hy += LH;
    };
    head('From:', msg ? fullAddr(msg.from) : (th.participants ?? []).map(who).join(', '));
    head('To:', msg ? ((msg.to ?? []).map(fullAddr).join(', ') || '(undisclosed recipients)') : '');
    head('Subject:', (msg?.subject || th.subjectNorm) || '(no subject)');
    head('Date:', fmtLong(msg?.sentAt ?? th.lastMessageAt));
    etchIn(ctx, ax + 3, hy + 1, b.w - 6, 2);
    hy += 6;

    const bodyY = hy;
    const bodyH = Math.max(12, ay + b.h - 3 - bodyY);
    const bodyW = Math.max(40, b.w - 14 - SBW);

    let content;
    if (!st.detail) content = 'Retrieving message...';
    else if (msg && msg.bodyState !== 'ready') {
      content = 'Retrieving message...\n\nThe body has been requested from the server. This pane fills in on its own.';
    } else if (msg && !bodies.has(msg._id)) content = 'Retrieving message...';
    else content = bodies.get(msg?._id) || th.snippet || '(This message has no text.)';

    if (th.messageCount > 1) content += `\n\n— ${th.messageCount} messages in this conversation —`;
    if (msg?.hasAttachments) {
      const names = (msg.attachments ?? []).map((a) => a.filename).filter(Boolean).join(', ');
      content += `\n\nAttachments: ${names || 'yes'}`;
    }

    const key = `${msg?._id ?? th._id}|${bodyW}|${content.length}`;
    if (bodyMemo.key !== key) {
      bodyMemo.key = key;
      bodyMemo.lines = layoutText(ctx, content, bodyW);
    }
    const lines = bodyMemo.lines;
    const visLines = Math.max(1, Math.floor(bodyH / LH));
    st.pScroll = Math.max(0, Math.min(Math.max(0, lines.length - visLines), st.pScroll));

    for (let i = 0; i < visLines; i++) {
      const ln = lines[st.pScroll + i];
      if (ln === undefined) break;
      if (ln) text(ctx, ln, hx, bodyY + i * LH, { font: FONT.ui });
    }
    ctx.restore();

    const sbX = b.x + b.w - SBW - 2;
    scrollBar(ctx, r.x + sbX, bodyY, SBW, bodyH,
      st.pScroll * LH, visLines * LH, Math.max(visLines, lines.length) * LH, true);
    st.rects.prevSb = { x: sbX, y: bodyY - r.y, w: SBW, h: bodyH, vis: visLines };
  }

  function drawStatus(ctx, r, L) {
    const b = L.status;
    fill(ctx, r.x, r.y + b.y, r.w, b.h, C.face);
    const list = rows();
    const unread = list.reduce((n, t) => n + (t.unreadCount > 0 ? 1 : 0), 0);
    const left = st.error
      ? st.error
      : (st.find.threads ? `${list.length} found` : `${list.length} message(s), ${unread} unread`);
    const lw = Math.round(r.w * 0.56);
    bevelIn(ctx, r.x + 1, r.y + b.y + 2, lw, 14);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x + 3, r.y + b.y + 2, lw - 4, 14); ctx.clip();
    text(ctx, left, r.x + 5, r.y + b.y + 9, {
      baseline: 'middle', font: FONT.small, color: st.error ? '#a00000' : C.text,
    });
    ctx.restore();

    const rx = r.x + lw + 4;
    const rw = Math.max(20, r.w - lw - 7);
    bevelIn(ctx, rx, r.y + b.y + 2, rw, 14);
    ctx.save();
    ctx.beginPath(); ctx.rect(rx + 2, r.y + b.y + 2, rw - 4, 14); ctx.clip();
    text(ctx, st.isDone ? st.status : `${st.status} · more on server`, rx + 4, r.y + b.y + 9, {
      baseline: 'middle', font: FONT.small,
    });
    ctx.restore();
  }

  /** Keep the selected row inside the visible window after keyboard moves. */
  function ensureVisible() {
    const sb = st.rects.listSb;
    if (!sb) return;
    const idx = rows().findIndex((t) => t._id === st.selId);
    if (idx < 0) return;
    if (idx < st.scroll) st.scroll = idx;
    else if (idx >= st.scroll + sb.vis) st.scroll = idx - sb.vis + 1;
  }

  // ── the app object ─────────────────────────────────────────
  return {
    title: 'Outlook Express',
    icon: 'mail',
    w: 560, h: 380,
    minW: 430, minH: 290,
    st,

    menus: [
      { label: 'File', items: [
        { label: 'New Message', id: 'new', accel: 'Ctrl+N' },
        '-',
        { label: 'Save As...', disabled: true },
        { label: 'Print...', accel: 'Ctrl+P', disabled: true },
        '-',
        { label: 'Close', id: 'close' },
      ] },
      { label: 'Edit', items: [
        { label: 'Copy', accel: 'Ctrl+C', disabled: true },
        '-',
        { label: 'Mark as Read', id: 'read' },
        { label: 'Mark as Unread', id: 'unread' },
        '-',
        { label: 'Delete', id: 'delete', accel: 'Del' },
        { label: 'Move to Archive', id: 'archive' },
        '-',
        { label: 'Find Message...', id: 'find', accel: 'F3' },
      ] },
      { label: 'View', items: [
        { label: 'Inbox', id: 'view:inbox' },
        { label: 'Archive', id: 'view:done' },
        { label: 'Starred', id: 'view:starred' },
        { label: 'Snoozed', id: 'view:snoozed' },
        { label: 'Deleted Items', id: 'view:trash' },
        '-',
        { label: 'Refresh', id: 'sendrecv', accel: 'F5' },
      ] },
      { label: 'Tools', items: [
        { label: 'Send and Receive', id: 'sendrecv', accel: 'F5' },
        '-',
        { label: 'Accounts...', id: 'accounts' },
        '-',
        { label: 'Sign Out', id: 'signout' },
      ] },
      { label: 'Help', items: [
        { label: 'Contents and Index', id: 'contents' },
        '-',
        { label: 'About Outlook Express', id: 'about' },
      ] },
    ],

    // Subscribing is also how we ask backend.js to wake up: watch() awaits
    // connect(), which restores an existing Clerk session. Every query here is
    // auth-tolerant, so doing this before sign-in costs an empty result.
    init() {
      startAll();
    },

    dispose() {
      dead = true;
      stopList?.(); stopUnread?.(); stopDetail?.();
      stopBackendWatch?.();
      panel.dispose();
    },

    update(dt, win, papi) {
      st.t += dt;
      st.now = Date.now();
      panel.update(dt);
      if (st.busy > 0) { st.busy -= dt; papi.setBusy(true); }
      else if (st.loading && panel.connected()) papi.setBusy(true);
    },

    command(id, win, papi) {
      if (id === 'close') { papi.close(win); return; }
      if (!panel.connected()) return;
      if (id === 'new') { compose('new', papi); return; }
      if (id === 'delete' || id === 'archive' || id === 'read' || id === 'unread') { act(id, papi); return; }
      if (id === 'sendrecv') { sendReceive(papi); return; }
      if (id === 'accounts') { showAccounts(papi); return; }
      if (id === 'signout') { backend.signOut().catch(() => {}); return; }
      if (id === 'find') { st.find.open = true; st.find.caret = st.find.q.length; return; }
      if (typeof id === 'string' && id.startsWith('view:')) { setView(id.slice(5), papi); return; }
      if (id === 'contents') {
        papi.messageBox('Outlook Express Help',
          'Pick a folder on the left. Click a message to read it below.\n\n'
          + 'New Mail writes one. Reply, Reply All and Forward do what they say.\n'
          + 'Delete moves the conversation to Deleted Items; Archive files it away.\n\n'
          + 'The list is live: new mail arrives on its own.',
          { icon: 'help', w: 360 });
        return;
      }
      if (id === 'about') {
        const s = backend.getStatus();
        papi.messageBox('About Outlook Express',
          'Microsoft Outlook Express 5\n\nVersion 5.00.2014.0211\n\n'
          + `Signed in as: ${s.user?.email || '(nobody)'}\n`
          + `Mail accounts: ${st.accounts.length}\n\n`
          + 'This one is not a reconstruction. It is reading a real mailbox.',
          { icon: 'mail', w: 340 });
      }
    },

    key(e, win, papi) {
      if (!panel.connected()) { panel.key(e, win, papi); return; }

      if (st.find.open) {
        if (e.key === 'Escape') { closeFind(); return; }
        if (e.key === 'Enter') { runSearch(papi); return; }
        const res = editKey(e, st.find.q, st.find.caret);
        if (res) { st.find.q = res.val; st.find.caret = res.caret; return; }
      }

      const list = rows();
      const idx = list.findIndex((t) => t._id === st.selId);
      if (e.key === 'ArrowDown') { select(list[Math.min(list.length - 1, idx + 1)]?._id ?? st.selId, papi); ensureVisible(); return; }
      if (e.key === 'ArrowUp') { select(list[Math.max(0, idx - 1)]?._id ?? st.selId, papi); ensureVisible(); return; }
      if (e.key === 'PageDown') { st.scroll += 6; return; }
      if (e.key === 'PageUp') { st.scroll = Math.max(0, st.scroll - 6); return; }
      if (e.key === 'Delete') { act('delete', papi); return; }
      if (e.key === 'F5') { sendReceive(papi); return; }
      if (e.key === 'F3') { st.find.open = true; st.find.caret = st.find.q.length; return; }
      if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) { compose('new', papi); return; }
      if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) compose('reply', papi);
    },

    draw(ctx, r, win, papi) {
      if (!panel.connected()) { panel.draw(ctx, r, win, papi); return; }
      fill(ctx, r.x, r.y, r.w, r.h, C.face);
      const L = layout(r);
      drawToolbar(ctx, r);
      drawTree(ctx, r, L);
      drawList(ctx, r, L);
      drawPreview(ctx, r, L);
      drawStatus(ctx, r, L);
    },

    mouse(type, x, y, btn, win, papi) {
      if (!panel.connected()) { panel.mouse(type, x, y, btn, win, papi); return; }

      if (type === 'move') {
        st.hover = null;
        for (const t of st.rects.tools ?? []) if (hit(t, x, y)) st.hover = t.id;
        return;
      }
      if (type !== 'down' && type !== 'dblclick') return;

      for (const t of st.rects.tools ?? []) {
        if (!hit(t, x, y)) continue;
        if (!t.on) return;
        if (t.id === 'new') compose('new', papi);
        else if (t.id === 'reply') compose('reply', papi);
        else if (t.id === 'replyAll') compose('replyAll', papi);
        else if (t.id === 'forward') compose('forward', papi);
        else if (t.id === 'sendrecv') sendReceive(papi);
        else act(t.id, papi);
        return;
      }

      for (const f of st.rects.folders ?? []) {
        if (hit(f, x, y)) { setView(f.view, papi); return; }
      }

      if (hit(st.rects.findGo, x, y)) { runSearch(papi); return; }
      if (hit(st.rects.findClose, x, y)) { closeFind(); return; }
      if (hit(st.rects.findField, x, y)) { st.find.caret = st.find.q.length; return; }

      for (const row of st.rects.rows ?? []) {
        if (!hit(row, x, y)) continue;
        if (x - row.x < row.starW) { select(row.id, null); act('star', papi); }
        else select(row.id, papi);
        return;
      }

      const sb = st.rects.listSb;
      if (hit(sb, x, y)) {
        if (y < sb.y + SBW) st.scroll -= 1;
        else if (y > sb.y + sb.h - SBW) st.scroll += 1;
        else {
          const frac = (y - sb.y - SBW) / Math.max(1, sb.h - SBW * 2);
          st.scroll = Math.round(frac * Math.max(0, rows().length - sb.vis));
        }
        return;
      }
      const ps = st.rects.prevSb;
      if (hit(ps, x, y)) {
        if (y < ps.y + SBW) st.pScroll = Math.max(0, st.pScroll - 2);
        else if (y > ps.y + ps.h - SBW) st.pScroll += 2;
        else st.pScroll = Math.max(0, st.pScroll + (y < ps.y + ps.h / 2 ? -3 : 3));
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────
// the compose window
// ─────────────────────────────────────────────────────────────
function createCompose(spec) {
  const panel = createConnectPanel({ blurb: BLURB, icon: 'mail' });
  const FIELDS = ['to', 'cc', 'subject', 'body'];

  const st = {
    t: 0,
    draftId: null,
    creating: false,
    error: null,
    to: '',
    cc: '',
    subject: '',
    body: '',
    field: 0,
    caret: 0,
    scroll: 0,
    send: null,       // { left } while the undo window is open
    status: 'Creating message...',
    rects: {},
    hover: null,
  };

  let dead = false;
  const bodyMemo = { key: '', lines: [] };

  /**
   * The server builds reply/forward drafts (quoted body, recipients, "Re:"),
   * so once the draft exists we read it back out of the thread's pending list
   * rather than trying to reconstruct any of that here.
   */
  function createDraft() {
    st.creating = true;
    const args = { mode: spec.mode ?? 'new' };
    if (spec.threadId) args.threadId = spec.threadId;
    if (spec.accountId && (spec.mode ?? 'new') === 'new') args.accountId = spec.accountId;

    backend.mutation('mail/send:createDraft', args).then((id) => {
      if (dead) return null;
      st.draftId = id;
      st.creating = false;
      st.status = 'Ready';
      if (!spec.threadId) return null;
      return backend.query('mail/threads:getThread', { threadId: spec.threadId }, null).then((d) => {
        if (dead || !d) return;
        const draft = (d.pending ?? []).find((p) => p._id === id);
        if (!draft) return;
        st.to = (draft.to ?? []).join(', ');
        st.cc = (draft.cc ?? []).join(', ');
        st.subject = draft.subject ?? '';
        st.body = htmlToText(draft.bodyHtml ?? '');
        st.caret = 0;
        bodyMemo.key = '';
      });
    }).catch((err) => {
      if (dead) return;
      st.creating = false;
      st.error = String(err?.message ?? err);
      st.status = 'The message could not be created.';
    });
  }

  function doSend(papi, win) {
    if (!st.draftId || st.send) return;
    const to = splitAddrs(st.to);
    if (!to.length) {
      papi.messageBox('Outlook Express',
        'Please enter at least one e-mail address in the To field.', { icon: 'warn', w: 330 });
      return;
    }
    st.status = 'Sending message...';
    backend.mutation('mail/send:updateDraft', {
      draftId: st.draftId,
      to,
      cc: splitAddrs(st.cc),
      subject: st.subject,
      bodyHtml: textToHtml(st.body),
    })
      .then(() => backend.mutation('mail/send:sendNow', { draftId: st.draftId }))
      .then(() => {
        if (dead) return;
        st.send = { left: UNDO_SECONDS };
        st.status = 'Message queued.';
        papi.sound('ding');
      })
      .catch((err) => {
        if (dead) return;
        st.status = 'The message was not sent.';
        papi.messageBox('Outlook Express', String(err?.message ?? err), { icon: 'error', w: 350 });
      });
  }

  function undoSend(papi) {
    if (!st.send || !st.draftId) return;
    st.send = null;
    st.status = 'Send cancelled. The message is a draft again.';
    backend.mutation('mail/send:cancelSend', { draftId: st.draftId }).catch((err) => {
      papi.messageBox('Outlook Express', String(err?.message ?? err), { icon: 'error', w: 350 });
    });
    papi.sound('click');
  }

  const TOOL_H = 38, STATUS_H = 18, ROW = 20;

  return {
    title: 'New Message',
    icon: 'mail',
    w: 430, h: 300,
    minW: 320, minH: 230,
    st,

    menus: [
      { label: 'File', items: [
        { label: 'Send Message', id: 'send', accel: 'Alt+S' },
        '-',
        { label: 'Close', id: 'close' },
      ] },
      { label: 'Edit', items: [
        { label: 'Cut', disabled: true },
        { label: 'Copy', disabled: true },
        { label: 'Paste', disabled: true },
      ] },
      { label: 'Insert', items: [
        { label: 'File Attachment...', disabled: true },
        { label: 'Signature', disabled: true },
      ] },
      { label: 'Help', items: [{ label: 'About Outlook Express', id: 'about' }] },
    ],

    init() {
      if (panel.connected()) createDraft();
    },

    dispose() { dead = true; panel.dispose(); },

    update(dt, win, papi) {
      st.t += dt;
      panel.update(dt);
      // the draft can only be created once there is a session to create it in
      if (!st.draftId && !st.creating && !st.error && panel.connected()) createDraft();
      if (st.creating) papi.setBusy(true);
      if (st.send) {
        st.send.left -= dt;
        if (st.send.left <= 0) {
          st.send = null;
          papi.toast('Outlook Express\nYour message has been sent.');
          papi.close(win);
          return;
        }
      }
      win.title = st.subject ? `${st.subject} - Message` : 'New Message';
    },

    command(id, win, papi) {
      if (id === 'close') papi.close(win);
      else if (id === 'send') doSend(papi, win);
      else if (id === 'about') {
        papi.messageBox('About Outlook Express',
          'Microsoft Outlook Express 5\n\nVersion 5.00.2014.0211', { icon: 'mail', w: 300 });
      }
    },

    key(e, win, papi) {
      if (!panel.connected()) { panel.key(e, win, papi); return; }
      if (st.send) { if (e.key === 'Escape') undoSend(papi); return; }
      if (e.altKey && (e.key === 's' || e.key === 'S')) { doSend(papi, win); return; }
      if (e.key === 'Tab') {
        st.field = (st.field + (e.shiftKey ? FIELDS.length - 1 : 1)) % FIELDS.length;
        st.caret = st[FIELDS[st.field]].length;
        return;
      }
      const name = FIELDS[st.field];
      if (e.key === 'Enter' && name !== 'body') {
        st.field = Math.min(FIELDS.length - 1, st.field + 1);
        st.caret = st[FIELDS[st.field]].length;
        return;
      }
      const res = editKey(e, st[name], st.caret, name === 'body');
      if (res) {
        st[name] = res.val;
        st.caret = res.caret;
        if (name === 'body') bodyMemo.key = '';
      }
    },

    draw(ctx, r, win, papi) {
      if (!panel.connected()) { panel.draw(ctx, r, win, papi); return; }
      fill(ctx, r.x, r.y, r.w, r.h, C.face);

      // ── toolbar
      ctx.font = FONT.small;
      st.rects.tools = [];
      let bx = 3;
      const btns = [
        { id: 'send', label: 'Send', glyph: 'send', on: !!st.draftId && !st.send },
        { id: 'attach', label: 'Attach', glyph: 'clip', on: false },
      ];
      for (const b of btns) {
        const bw = Math.max(40, Math.ceil(ctx.measureText(b.label).width) + 10);
        if (st.hover === b.id && b.on) bevelOut(ctx, r.x + bx, r.y + 2, bw, 32);
        toolGlyph(ctx, b.glyph, r.x + bx + bw / 2, r.y + 13, { on: b.on });
        text(ctx, b.label, r.x + bx + bw / 2, r.y + 24, {
          align: 'center', font: FONT.small, color: b.on ? C.text : C.disabled,
        });
        st.rects.tools.push({ x: bx, y: 2, w: bw, h: 32, id: b.id, on: b.on });
        bx += bw;
      }
      fill(ctx, r.x, r.y + TOOL_H - 2, r.w, 1, C.shadow);
      fill(ctx, r.x, r.y + TOOL_H - 1, r.w, 1, C.white);

      // ── header fields
      let fy = TOOL_H + 3;
      st.rects.fields = [];
      [['To:', 'to'], ['Cc:', 'cc'], ['Subject:', 'subject']].forEach(([label, name], i) => {
        text(ctx, label, r.x + 6, r.y + fy + 9, { baseline: 'middle', font: FONT.ui });
        const fx = 54, fw = Math.max(40, r.w - 60);
        field(ctx, r.x + fx, r.y + fy, fw, 18, st[name], {
          focused: st.field === i && !st.send,
          blink: Math.floor(st.t * 2) % 2 === 0,
        });
        st.rects.fields.push({ x: fx, y: fy, w: fw, h: 18, i });
        fy += ROW;
      });

      // ── body
      const undoH = st.send ? 20 : 0;
      const by = fy + 2;
      const bh = Math.max(20, r.h - by - STATUS_H - undoH - 2);
      const bw2 = Math.max(40, r.w - 8);
      fill(ctx, r.x + 4, r.y + by, bw2, bh, C.white);
      bevelIn(ctx, r.x + 4, r.y + by, bw2, bh);
      st.rects.fields.push({ x: 4, y: by, w: bw2, h: bh, i: 3 });

      const innerW = Math.max(20, bw2 - 10);
      const key = `${st.body.length}|${innerW}`;
      if (bodyMemo.key !== key) { bodyMemo.key = key; bodyMemo.lines = layoutText(ctx, st.body, innerW); }
      const LH = 13;
      const vis = Math.max(1, Math.floor((bh - 6) / LH));
      // typing at the bottom should follow the caret down
      st.scroll = Math.max(0, bodyMemo.lines.length - vis);

      ctx.save();
      ctx.beginPath(); ctx.rect(r.x + 6, r.y + by + 2, bw2 - 8, bh - 4); ctx.clip();
      for (let i = 0; i < vis; i++) {
        const ln = bodyMemo.lines[st.scroll + i];
        if (ln === undefined) break;
        if (ln) text(ctx, ln, r.x + 8, r.y + by + 3 + i * LH, { font: FONT.ui });
      }
      if (st.field === 3 && !st.send && Math.floor(st.t * 2) % 2 === 0) {
        const shown = Math.max(1, Math.min(vis, bodyMemo.lines.length - st.scroll));
        const last = bodyMemo.lines[st.scroll + shown - 1] ?? '';
        ctx.font = FONT.ui;
        fill(ctx, r.x + 9 + ctx.measureText(last).width, r.y + by + 3 + (shown - 1) * LH, 1, 12, '#000000');
      }
      ctx.restore();

      // ── the 7-second undo strip
      st.rects.undo = null;
      if (st.send) {
        const uy = r.h - STATUS_H - undoH;
        fill(ctx, r.x + 2, r.y + uy, r.w - 4, undoH - 2, C.info);
        ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 2.5, r.y + uy + 0.5, r.w - 5, undoH - 3);
        const n = Math.max(1, Math.ceil(st.send.left));
        text(ctx, `Message will be sent in ${n} second${n === 1 ? '' : 's'}.`,
          r.x + 8, r.y + uy + (undoH - 2) / 2, { baseline: 'middle', font: FONT.ui });
        button(ctx, r.x + r.w - 62, r.y + uy + 1, 56, undoH - 5, 'Undo', { font: FONT.small });
        st.rects.undo = { x: r.w - 62, y: uy + 1, w: 56, h: undoH - 5 };
      }

      // ── status
      const sy = r.h - STATUS_H;
      fill(ctx, r.x, r.y + sy, r.w, STATUS_H, C.face);
      bevelIn(ctx, r.x + 1, r.y + sy + 2, r.w - 3, 14);
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x + 3, r.y + sy + 2, r.w - 7, 14); ctx.clip();
      text(ctx, st.error ?? st.status, r.x + 5, r.y + sy + 9, {
        baseline: 'middle', font: FONT.small, color: st.error ? '#a00000' : C.text,
      });
      ctx.restore();
    },

    mouse(type, x, y, btn, win, papi) {
      if (!panel.connected()) { panel.mouse(type, x, y, btn, win, papi); return; }
      if (type === 'move') {
        st.hover = null;
        for (const t of st.rects.tools ?? []) if (hit(t, x, y)) st.hover = t.id;
        return;
      }
      if (type !== 'down' && type !== 'dblclick') return;
      if (hit(st.rects.undo, x, y)) { undoSend(papi); return; }
      if (st.send) return;
      for (const t of st.rects.tools ?? []) {
        if (hit(t, x, y)) { if (t.on && t.id === 'send') doSend(papi, win); return; }
      }
      for (const f of st.rects.fields ?? []) {
        if (hit(f, x, y)) { st.field = f.i; st.caret = st[FIELDS[f.i]].length; return; }
      }
    },
  };
}

export const mail = {
  title: 'Outlook Express',
  icon: 'mail',
  w: 560, h: 380,
  minW: 430, minH: 290,

  // one app name, two windows: the reader, and a compose sheet
  create(arg) {
    if (arg && typeof arg === 'object' && arg.compose) return createCompose(arg.compose);
    return createMain();
  },
};

export default mail;
