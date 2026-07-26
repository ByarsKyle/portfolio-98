// ─────────────────────────────────────────────────────────────
// apps/vault — Password Keeper.
//
// It looks like a utility that shipped on a CD in 1998. It is not one. This
// window talks to the same Convex vault as Personal OS, and it is a genuine
// zero-knowledge client:
//
//   • The master password is typed into a canvas text field, used once to
//     derive a KEK with PBKDF2-SHA256 at the server's stored iteration count,
//     and dropped the moment the vault key is unwrapped.
//   • The unwrapped DEK lives in ONE module-local variable (VAULT_KEY below).
//     It is never written to storage, never attached to window, never sent
//     anywhere. Locking sets it to null and empties the plaintext cache.
//   • Everything the server holds is ciphertext plus a handful of plaintext
//     section names it was always allowed to see. A wrong master password
//     fails the AES-GCM auth tag on the unwrap — that failure *is* the
//     password check; there is no verifier to leak.
//
// Coordinates: draw() translates the context to the window's content origin,
// so every number in here — layout and hit rectangle alike — is
// content-relative, which is exactly what mouse() is handed.
// ─────────────────────────────────────────────────────────────
import {
  C, FONT, bevelOut, bevelIn, etchIn, fill, text, button,
  drawIcon, scrollBar, checkbox, groupBox, progressBar,
} from '../ui.js';
import { createConnectPanel, wrap } from './connect.js';
import backend from '../../net/backend.js';
import {
  unlockVaultKey, encryptJSON, decryptJSON, WrongPasswordError, cryptoStatus,
  generatePassword, generatePassphrase, estimateStrength, parseTotp, generateTotp,
  DEFAULT_PASSWORD_OPTIONS,
} from '../vaultcrypto.js';

// ── the only place the decrypted vault key ever lives ────────
// Module-local on purpose: not exported, not on `window`, not in any storage.
// One window at a time (the app is single-instance), and lock() nulls it.
let VAULT_KEY = null;

const CLIP_DEFAULT = 20;      // seconds, when the account has no preference
const ROW_H = 17;
const SB = 15;                // scrollbar width

const TYPE_LABEL = {
  login: 'Login', note: 'Secure Note', card: 'Payment Card', identity: 'Identity',
  document: 'Document', photo: 'Photo', file: 'File',
};

const FILTERS = [
  { id: 'all', label: 'All Items', icon: 'vault' },
  { id: 'fav', label: 'Favorites', icon: null },
  { id: 'login', label: 'Logins', icon: 'key' },
  { id: 'card', label: 'Cards', icon: null },
  { id: 'note', label: 'Notes', icon: 'notepad' },
];

export const vault = {
  title: 'Password Keeper',
  icon: 'vault',
  w: 560, h: 396,
  minW: 470, minH: 300,
  single: true,

  create(arg, api) {
    const st = {
      backend: backend.getStatus(),
      // server-side, all of it either ciphertext or deliberately public
      account: null,
      accountLoaded: false,
      sections: [],
      items: [],
      loadErr: null,
      // client-side plaintext — dies with lock()
      plain: new Map(),        // itemId -> decrypted payload (+ _cipher marker)
      decrypting: false,
      // unlock screen
      master: '',
      unlockErr: null,
      unlocking: false,
      // browsing
      view: 'unlock',          // unlock | browse | edit
      filter: { kind: 'all' },
      selId: null,
      showPw: false,
      search: '',
      focus: null,             // 'search' in browse; field name in edit
      listScroll: 0,
      sectScroll: 0,
      detailScroll: 0,
      // dialogs / transient
      gen: null,
      editor: null,
      saving: false,
      clip: null,              // { label, left, total }
      totp: null,
      totpPending: false,
      status: '',
      caret: 0,
      idle: 0,
      dragSlider: false,
    };

    const panel = createConnectPanel({
      blurb: 'Password Keeper reads your encrypted vault. Sign in first; the master password comes after, and stays in this window.',
      icon: 'vault',
    });

    // Hit rectangles, rebuilt every frame, content-relative — the same numbers
    // the drawing code used, because draw() translates to the content origin.
    // Kept as a list as well as a map so hit-testing can run newest-first: a
    // dialog drawn last must win over whatever it is covering.
    let R = {};
    let RL = [];
    const reg = (name, x, y, w, h, data) => {
      const rect = { name, x, y, w, h, ...data };
      R[name] = rect;
      RL.push(rect);
    };
    const hit = (rect, x, y) => !!rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
    const at = (x, y) => {
      for (let i = RL.length - 1; i >= 0; i--) if (hit(RL[i], x, y)) return { name: RL[i].name, rect: RL[i] };
      return null;
    };

    let statusT = 0;
    const setStatus = (msg) => { st.status = msg; statusT = 0; };

    // ── menus ────────────────────────────────────────────────
    const showItem = { label: 'Show Passwords', id: 'showpw', checked: false };
    const menus = [
      { label: 'File', items: [
        { label: 'New Login...', id: 'new' },
        '-',
        { label: 'Lock Vault', id: 'lock', accel: 'Ctrl+L' },
        '-',
        { label: 'Close', id: 'close' },
      ] },
      { label: 'Edit', items: [
        { label: 'Copy Username', id: 'copyuser' },
        { label: 'Copy Password', id: 'copypass' },
        '-',
        { label: 'Edit Item...', id: 'edit' },
        { label: 'Delete Item', id: 'delete' },
      ] },
      { label: 'View', items: [
        showItem,
        '-',
        { label: 'Refresh', id: 'refresh', accel: 'F5' },
      ] },
      { label: 'Tools', items: [{ label: 'Password Generator...', id: 'generator' }] },
      { label: 'Help', items: [{ label: 'About Password Keeper', id: 'about' }] },
    ];

    // ── backend wiring ───────────────────────────────────────
    let dataStops = [];
    function stopData() {
      for (const stop of dataStops) { try { stop(); } catch { /* already gone */ } }
      dataStops = [];
    }

    function startData() {
      if (dataStops.length) return;
      dataStops.push(backend.watch('vault:account', {}, (v, err) => {
        st.accountLoaded = true;
        if (err) { st.loadErr = err; return; }
        st.loadErr = null;
        st.account = v ?? null;
      }));
      dataStops.push(backend.watch('vault:listSections', {}, (v) => {
        st.sections = Array.isArray(v) ? v.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
      }));
      dataStops.push(backend.watch('vault:listItems', {}, (v) => {
        st.items = Array.isArray(v) ? v : [];
        decryptAll();
      }));
    }

    // ── locking ──────────────────────────────────────────────
    // Bumped by every lock. An unlock that is still deriving when the vault is
    // locked (or the window is closed) must throw its result away rather than
    // install a live key into a module that nobody is watching any more.
    //
    // Declared before the status subscription below on purpose: onChange fires
    // its callback synchronously, that callback calls lock(), and lock() is a
    // hoisted function declaration — so it is callable while a `let` it closes
    // over is still in the temporal dead zone. Registering the subscription
    // first threw a ReferenceError the moment the window opened.
    let session = 0;

    const offStatus = backend.onChange((s) => {
      st.backend = s;
      if (s.status === 'online') startData();
      else {
        stopData();
        lock();
        st.account = null; st.accountLoaded = false;
        st.items = []; st.sections = [];
      }
    });

    /** Drop the key and every scrap of plaintext derived from it. */
    function lock(message = null) {
      session += 1;
      VAULT_KEY = null;
      st.plain = new Map();
      st.master = '';
      st.selId = null;
      st.editor = null;
      st.gen = null;
      st.showPw = false;
      showItem.checked = false;
      st.totp = null;
      st.search = '';
      st.focus = null;
      st.listScroll = 0; st.detailScroll = 0;
      st.view = 'unlock';
      st.unlockErr = message;
      st.idle = 0;
    }

    const unlocked = () => VAULT_KEY !== null;

    // ── unlocking ────────────────────────────────────────────
    const nextFrame = () => new Promise((res) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => res());
      else setTimeout(res, 16);
    });

    async function doUnlock(win, api) {
      if (st.unlocking) return;
      const acct = st.account;
      if (!acct) return;
      const crypt = cryptoStatus();
      if (!crypt.ok) { st.unlockErr = crypt.message; api.sound('error'); return; }
      if (!st.master) { st.unlockErr = 'Enter your master password.'; api.sound('error'); return; }

      st.unlocking = true;
      st.unlockErr = null;
      // Take the password out of the app's state right now: from here it lives
      // only in this local, for as long as the derivation runs.
      const password = st.master;
      const mine = session;
      st.master = '';
      api.setBusy(true);
      // PBKDF2 at 600k iterations pins the main thread for the better part of a
      // second, and this canvas is a live texture in the room — so hand the
      // renderer two frames to actually paint "Decrypting vault..." first.
      await nextFrame();
      await nextFrame();

      try {
        const key = await unlockVaultKey(password, {
          kdfSalt: acct.kdfSalt,
          kdfIterations: acct.kdfIterations,
          wrappedKey: acct.wrappedKey,
        });
        if (mine !== session) return;   // locked or closed while we were deriving
        VAULT_KEY = key;
        st.view = 'browse';
        st.idle = 0;
        api.sound('ding');
        decryptAll();
      } catch (err) {
        // Deliberately terse: a wrong password is the only thing we admit to,
        // and nothing about the attempt is logged anywhere.
        st.unlockErr = err instanceof WrongPasswordError
          ? 'The master password is incorrect.'
          : (cryptoStatus().ok ? 'The vault could not be unlocked.' : cryptoStatus().message);
        api.sound('error');
      } finally {
        st.unlocking = false;
      }
    }

    // ── decryption ───────────────────────────────────────────
    let decryptToken = 0;

    function decryptAll() {
      if (!unlocked()) return;
      const token = ++decryptToken;
      const key = VAULT_KEY;
      st.decrypting = true;
      (async () => {
        const next = new Map();
        for (const it of st.items) {
          const cached = st.plain.get(it._id);
          if (cached && cached._cipher === it.cipher) { next.set(it._id, cached); continue; }
          try {
            const data = await decryptJSON(it.cipher, key);
            const obj = (data && typeof data === 'object') ? data : {};
            next.set(it._id, { ...obj, name: String(obj.name ?? '(untitled)'), _cipher: it.cipher });
          } catch {
            // one bad item must not take the vault down with it
            next.set(it._id, { name: '(cannot be decrypted)', broken: true, _cipher: it.cipher });
          }
          if (token !== decryptToken || VAULT_KEY !== key) return;
        }
        if (token !== decryptToken || VAULT_KEY !== key) return;
        st.plain = next;
        st.decrypting = false;
      })().catch(() => { st.decrypting = false; });
    }

    // ── selection helpers ────────────────────────────────────
    const plainOf = (id) => st.plain.get(id) ?? null;
    const selItem = () => st.items.find((i) => i._id === st.selId) ?? null;
    const selPlain = () => (st.selId ? plainOf(st.selId) : null);

    function visibleItems() {
      const f = st.filter;
      const q = st.search.trim().toLowerCase();
      const out = st.items.filter((it) => {
        if (f.kind === 'fav' && !it.favorite) return false;
        if (f.kind === 'type' && it.type !== f.type) return false;
        if (f.kind === 'section' && it.sectionId !== f.id) return false;
        if (q) {
          const p = plainOf(it._id);
          const hay = `${p?.name ?? ''} ${p?.login?.username ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      out.sort((a, b) => {
        const an = (plainOf(a._id)?.name ?? '').toLowerCase();
        const bn = (plainOf(b._id)?.name ?? '').toLowerCase();
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
      return out;
    }

    function filterLabel() {
      const f = st.filter;
      if (f.kind === 'all') return 'All Items';
      if (f.kind === 'fav') return 'Favorites';
      if (f.kind === 'type') return TYPE_LABEL[f.type] ?? f.type;
      return st.sections.find((s) => s._id === f.id)?.name ?? 'Section';
    }

    // ── clipboard ────────────────────────────────────────────
    function copyValue(label, value, api) {
      if (!value) return;
      const clip = (typeof navigator !== 'undefined' ? navigator : null)?.clipboard;
      if (!clip?.writeText) {
        api.messageBox('Copy',
          'This browser will not give the page access to the clipboard.\n\nUse "Show" and copy the value by hand.',
          { icon: 'warn', w: 330 });
        return;
      }
      const secs = Math.max(1, st.account?.clipboardClearSeconds ?? CLIP_DEFAULT);
      clip.writeText(value).then(() => {
        st.clip = { label, left: secs, total: secs };
        setStatus(`${label} copied to the clipboard.`);
        api.sound('click');
      }).catch(() => {
        api.messageBox('Copy',
          'The browser refused clipboard access for this page.\n\nUse "Show" and copy the value by hand.',
          { icon: 'warn', w: 330 });
      });
    }

    function clearClipboard() {
      const clip = (typeof navigator !== 'undefined' ? navigator : null)?.clipboard;
      st.clip = null;
      setStatus('Clipboard cleared.');
      clip?.writeText?.('')?.catch?.(() => { /* nothing we can do about it */ });
    }

    // ── TOTP ─────────────────────────────────────────────────
    function tickTotp() {
      const src = selPlain()?.login?.totp;
      if (!src || !unlocked()) { st.totp = null; return; }
      const now = Date.now();
      if (st.totpPending) return;
      if (st.totp && st.totp.src === src && now < st.totp.expiresAt) return;
      const cfg = parseTotp(String(src));
      if (!cfg) { st.totp = { src, bad: true, expiresAt: now + 30000, period: 30 }; return; }
      st.totpPending = true;
      generateTotp(cfg, now).then((res) => {
        st.totpPending = false;
        if (!res) { st.totp = { src, bad: true, expiresAt: Date.now() + 30000, period: cfg.period }; return; }
        st.totp = {
          src, code: res.code, period: cfg.period,
          expiresAt: Date.now() + res.secondsRemaining * 1000,
        };
      }).catch(() => {
        st.totpPending = false;
        st.totp = { src, bad: true, expiresAt: Date.now() + 30000, period: cfg.period };
      });
    }

    // ── editing ──────────────────────────────────────────────
    function openEditor(itemId, api) {
      if (!unlocked()) return;
      const p = itemId ? plainOf(itemId) : null;
      if (itemId && (!p || p.broken)) return;
      // This window writes logins only. Anything else would lose fields it has
      // no editor for, so it stays read-only here.
      const type = itemId ? (st.items.find((i) => i._id === itemId)?.type ?? 'login') : 'login';
      if (type !== 'login') {
        api?.messageBox('Password Keeper',
          `${TYPE_LABEL[type] ?? 'This item'} can be read here but only edited in Personal OS.`,
          { icon: 'info', w: 340 });
        return;
      }
      st.editor = {
        itemId: itemId ?? null,
        name: p?.name ?? '',
        username: p?.login?.username ?? '',
        password: p?.login?.password ?? '',
        url: p?.login?.urls?.[0] ?? '',
        notes: p?.notes ?? '',
      };
      st.focus = 'name';
      st.view = 'edit';
      st.caret = 0;
    }

    function saveEditor(win, api) {
      if (!unlocked() || !st.editor || st.saving) return;
      const ed = st.editor;
      if (!ed.name.trim()) {
        api.messageBox('Password Keeper', 'Please give this item a name.', { icon: 'warn' });
        return;
      }
      // Build on top of whatever was already in the item so fields this little
      // editor does not show (TOTP, extra URLs, card data) survive a save.
      const base = ed.itemId ? { ...(plainOf(ed.itemId) ?? {}) } : {};
      delete base._cipher; delete base.broken;
      const oldUrls = Array.isArray(base.login?.urls) ? base.login.urls : [];
      const urls = ed.url.trim() ? [ed.url.trim(), ...oldUrls.slice(1)] : oldUrls.slice(1);
      const payload = {
        ...base,
        name: ed.name.trim(),
        notes: ed.notes.trim() || undefined,
        login: {
          ...(base.login ?? {}),
          username: ed.username.trim() || undefined,
          password: ed.password || undefined,
          urls: urls.length ? urls : undefined,
        },
      };

      st.saving = true;
      (async () => {
        // Only ciphertext crosses this line.
        const cipher = await encryptJSON(payload, VAULT_KEY);
        if (ed.itemId) {
          await backend.mutation('vault:updateItem', { itemId: ed.itemId, cipher });
        } else {
          const args = { type: 'login', cipher };
          if (st.filter.kind === 'section') args.sectionId = st.filter.id;
          const id = await backend.mutation('vault:createItem', args);
          if (typeof id === 'string') st.selId = id;
        }
        st.saving = false;
        st.editor = null;
        st.focus = null;
        st.view = 'browse';
        setStatus('Saved.');
        api.sound('ding');
      })().catch((err) => {
        st.saving = false;
        api.messageBox('Password Keeper', String(err?.message ?? 'The item could not be saved.'),
          { icon: 'error', w: 330 });
      });
    }

    function deleteItem(win, api) {
      const id = st.selId;
      const p = id ? plainOf(id) : null;
      if (!id || !p) return;
      api.messageBox('Password Keeper',
        `Delete "${p.name}"?\n\nThis cannot be undone.`,
        { icon: 'warn', buttons: ['Yes', 'No'], w: 320, onResult: (r) => {
          if (r !== 'Yes') return;
          backend.mutation('vault:deleteItem', { itemId: id })
            .then(() => { st.selId = null; setStatus('Item deleted.'); })
            .catch((err) => api.messageBox('Password Keeper',
              String(err?.message ?? 'The item could not be deleted.'), { icon: 'error', w: 330 }));
        } });
    }

    // ── generator ────────────────────────────────────────────
    function openGenerator() {
      if (st.gen) return;
      st.gen = { ...DEFAULT_PASSWORD_OPTIONS, mode: 'password', words: 5, value: '' };
      regenerate();
    }

    function regenerate() {
      const g = st.gen;
      if (!g) return;
      try {
        g.value = g.mode === 'passphrase'
          ? generatePassphrase(g.words, '-', true, true)
          : generatePassword({
            length: g.length, uppercase: g.uppercase, lowercase: g.lowercase,
            numbers: g.numbers, symbols: g.symbols, avoidAmbiguous: g.avoidAmbiguous,
          });
      } catch {
        g.value = '';
      }
    }

    // ═════════════════════════════════════════════════════════
    // drawing
    // ═════════════════════════════════════════════════════════
    const blink = () => Math.floor(st.caret * 2) % 2 === 0;

    function drawField(ctx, x, y, w, h, value, opts = {}) {
      const {
        focused = false, masked = false, placeholder = '', font = FONT.ui, disabled = false,
      } = opts;
      fill(ctx, x, y, w, h, disabled ? C.face : C.white);
      bevelIn(ctx, x, y, w, h);
      const shown = masked ? '*'.repeat(value.length) : value;
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 2, y + 1, w - 4, h - 2); ctx.clip();
      ctx.font = font;
      const tw = ctx.measureText(shown).width;
      const shift = focused ? Math.max(0, tw - (w - 12)) : 0;
      if (!value && placeholder) {
        text(ctx, placeholder, x + 4, y + h / 2, { baseline: 'middle', font, color: C.shadow });
      } else {
        text(ctx, shown, x + 4 - shift, y + h / 2, { baseline: 'middle', font, color: disabled ? C.shadow : C.text });
      }
      if (focused && blink()) fill(ctx, x + 5 + tw - shift, y + 3, 1, h - 6, '#000000');
      ctx.restore();
    }

    /** Type glyph for the item list: mostly the icon kit, cards drawn inline. */
    function typeGlyph(ctx, x, y, s, type) {
      if (type === 'card') {
        const u = s / 16;
        fill(ctx, x + u, y + 3 * u, 14 * u, 10 * u, '#3a6ab8');
        fill(ctx, x + u, y + 5 * u, 14 * u, 3 * u, '#1a3a70');
        fill(ctx, x + 3 * u, y + 10 * u, 5 * u, 2 * u, '#e0d8a0');
        return;
      }
      const name = type === 'login' ? 'key'
        : type === 'note' ? 'notepad'
          : type === 'identity' ? 'me'
            : type === 'photo' ? 'paint' : 'doc';
      drawIcon(ctx, name, x, y, s);
    }

    /** Scrollbar + its hit rects. Returns nothing; caller clips its own pane. */
    function vScroll(ctx, x, y, w, h, scroll, visible, total, name) {
      if (total <= visible) return;
      scrollBar(ctx, x, y, w, h, scroll, visible, total, true);
      const track = h - w * 2;
      const frac = Math.min(1, visible / Math.max(1, total));
      const thumb = Math.max(12, track * frac);
      const maxScroll = Math.max(1, total - visible);
      const off = (scroll / maxScroll) * (track - thumb);
      reg(`${name}:up`, x, y, w, w);
      reg(`${name}:down`, x, y + h - w, w, w);
      reg(`${name}:track`, x, y + w, w, track, { thumbTop: y + w + off, thumbH: thumb });
    }

    function draw(ctx, r, win, api) {
      R = {}; RL = [];
      ctx.save();
      ctx.translate(r.x, r.y);
      const W = r.w, H = r.h;
      fill(ctx, 0, 0, W, H, C.face);

      if (!panel.connected()) {
        // the shared sign-in box wants absolute coords, so undo the translate
        ctx.restore();
        panel.draw(ctx, r, win, api);
        return;
      }

      if (st.view === 'edit') drawEditor(ctx, W, H);
      else if (unlocked()) drawBrowse(ctx, W, H);
      else drawUnlock(ctx, W, H, api);

      if (st.gen) drawGenerator(ctx, W, H);

      ctx.restore();
    }

    // ── the unlock screen ────────────────────────────────────
    function drawUnlock(ctx, W, H) {
      const bw = Math.min(340, W - 40);
      const x = Math.round((W - bw) / 2);
      let y = 16;

      drawIcon(ctx, 'vault', x, y, 32);
      text(ctx, 'Password Keeper', x + 42, y + 2, { font: FONT.big });
      text(ctx, 'Personal OS Vault', x + 42, y + 21, { font: FONT.ui, color: '#404040' });
      y += 44;

      if (st.loadErr) {
        ctx.font = FONT.ui;
        wrap(ctx, st.loadErr, bw).forEach((ln, i) => text(ctx, ln, x, y + i * 13, { color: '#a00000' }));
        return;
      }
      if (!st.accountLoaded) {
        text(ctx, 'Reading vault settings...', x, y, { font: FONT.ui, color: '#404040' });
        return;
      }
      if (!st.account) {
        drawIcon(ctx, 'warn', x, y, 16);
        ctx.font = FONT.ui;
        wrap(ctx, 'This account has no vault yet. Create one in Personal OS — the master password has to be chosen where a real key can be generated and wrapped.', bw - 22)
          .forEach((ln, i) => text(ctx, ln, x + 22, y + 1 + i * 13, { font: FONT.ui }));
        return;
      }

      const acct = st.account;

      if (st.unlocking) {
        groupBox(ctx, x, y, bw, 64, 'Working');
        text(ctx, 'Decrypting vault...', x + 12, y + 24, { font: FONT.uiBold });
        progressBar(ctx, x + 12, y + 40, bw - 24, 14, 0.45);
        y += 74;
        ctx.font = FONT.small;
        wrap(ctx, `Deriving the key with PBKDF2-SHA256 at ${acct.kdfIterations.toLocaleString('en-US')} iterations. This is meant to be slow.`, bw)
          .forEach((ln, i) => text(ctx, ln, x, y + i * 12, { font: FONT.small, color: '#404040' }));
        return;
      }

      groupBox(ctx, x, y, bw, st.account.hint ? 76 : 58, 'Locked');
      const fy = y + 22;
      text(ctx, 'Master password:', x + 10, fy + 8, { baseline: 'middle', font: FONT.ui });
      const fx = x + 108, fw = bw - 118;
      drawField(ctx, fx, fy, fw, 18, st.master, { focused: true, masked: true });
      reg('master', fx, fy, fw, 18);

      if (acct.hint) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x + 10, fy + 24, bw - 20, 14); ctx.clip();
        text(ctx, `Hint: ${acct.hint}`, x + 10, fy + 31, { baseline: 'middle', font: FONT.small, color: '#404040' });
        ctx.restore();
      }
      y += (acct.hint ? 76 : 58) + 10;

      button(ctx, x + bw - 80, y, 80, 22, 'Unlock', { focus: true });
      reg('unlock', x + bw - 80, y, 80, 22);
      text(ctx, `${st.items.length} encrypted item${st.items.length === 1 ? '' : 's'} on the server`,
        x, y + 11, { baseline: 'middle', font: FONT.small, color: '#404040' });
      y += 32;

      if (st.unlockErr) {
        ctx.font = FONT.ui;
        const lines = wrap(ctx, st.unlockErr, bw);
        lines.forEach((ln, i) => text(ctx, ln, x, y + i * 13, { font: FONT.ui, color: '#a00000' }));
        y += lines.length * 13 + 6;
      }

      ctx.font = FONT.small;
      wrap(ctx, 'The master password is used here and then discarded. It is never sent to the server, and the server has never seen it.', bw)
        .forEach((ln, i) => text(ctx, ln, x, H - 34 + i * 12, { font: FONT.small, color: '#707070' }));
    }

    // ── the two-pane browser ─────────────────────────────────
    function drawBrowse(ctx, W, H) {
      // ── toolbar
      const TB = 28;
      const tb = [
        { id: 'new', label: 'New', w: 40, on: true },
        { id: 'edit', label: 'Edit', w: 40, on: !!selPlain() && !selPlain()?.broken && selItem()?.type === 'login' },
        { id: 'delete', label: 'Delete', w: 46, on: !!selPlain() },
        { id: 'generator', label: 'Generate', w: 56, on: true },
        { id: 'lock', label: 'Lock', w: 40, on: true },
      ];
      let bx = 4;
      tb.forEach((b) => {
        button(ctx, bx, 3, b.w, 21, b.label, { disabled: !b.on, font: FONT.small });
        if (b.on) reg(`tb:${b.id}`, bx, 3, b.w, 21);
        bx += b.w + 3;
      });
      // search
      const sw = Math.min(150, Math.max(80, W - bx - 60));
      text(ctx, 'Find:', bx + 6, 13, { baseline: 'middle', font: FONT.small });
      drawField(ctx, bx + 34, 5, sw, 17, st.search, { focused: st.focus === 'search', placeholder: 'name or user', font: FONT.small });
      reg('search', bx + 34, 5, sw, 17);

      etchIn(ctx, 0, TB - 2, W, 2);

      // ── panes
      const top = TB + 2;
      const bot = H - 20;
      const paneH = bot - top;
      const sectW = 106;
      const listW = Math.max(118, Math.min(168, Math.round((W - sectW - 10) * 0.36)));
      const detX = sectW + 6 + listW + 6;
      const detW = W - detX - 2;

      drawSections(ctx, 2, top, sectW, paneH);
      drawList(ctx, sectW + 6, top, listW, paneH);
      drawDetail(ctx, detX, top, detW, paneH);

      // ── status bar
      const sy = H - 18;
      fill(ctx, 0, sy, W, 18, C.face);
      const count = visibleItems().length;
      bevelIn(ctx, 1, sy + 1, W * 0.46, 16);
      ctx.save();
      ctx.beginPath(); ctx.rect(3, sy + 1, W * 0.46 - 4, 16); ctx.clip();
      const left = st.decrypting ? 'Decrypting items...'
        : st.saving ? 'Saving...'
          : (st.status || `${count} item${count === 1 ? '' : 's'} in ${filterLabel()}`);
      text(ctx, left, 5, sy + 9, { baseline: 'middle', font: FONT.small });
      ctx.restore();

      bevelIn(ctx, W * 0.47, sy + 1, W * 0.32, 16);
      ctx.save();
      ctx.beginPath(); ctx.rect(W * 0.47 + 2, sy + 1, W * 0.32 - 4, 16); ctx.clip();
      if (st.clip) {
        text(ctx, `Clipboard clears in ${Math.ceil(st.clip.left)}s`, W * 0.47 + 4, sy + 9,
          { baseline: 'middle', font: FONT.small, color: '#804000' });
      } else {
        const mins = st.account?.autoLockMinutes ?? 0;
        const rem = mins > 0 ? Math.max(0, mins * 60 - st.idle) : 0;
        text(ctx, mins > 0 ? `Auto-lock in ${Math.floor(rem / 60)}:${String(Math.floor(rem % 60)).padStart(2, '0')}` : 'Auto-lock off',
          W * 0.47 + 4, sy + 9, { baseline: 'middle', font: FONT.small });
      }
      ctx.restore();

      bevelIn(ctx, W - 62, sy + 1, 60, 16);
      drawIcon(ctx, 'key', W - 59, sy + 2, 13);
      text(ctx, 'Unlocked', W - 44, sy + 9, { baseline: 'middle', font: FONT.small });
    }

    function drawSections(ctx, x, y, w, h) {
      fill(ctx, x, y, w, h, C.white);
      bevelIn(ctx, x, y, w, h);
      const rows = [
        ...FILTERS.map((f) => ({ kind: f.id === 'all' || f.id === 'fav' ? f.id : 'type', type: f.id, label: f.label, icon: f.icon })),
        ...(st.sections.length ? [{ sep: true }] : []),
        ...st.sections.map((s) => ({ kind: 'section', id: s._id, label: s.name, color: s.color, icon: s.icon })),
      ];
      const inner = { x: x + 2, y: y + 2, w: w - 4, h: h - 4 };
      const total = rows.reduce((n, row) => n + (row.sep ? 7 : ROW_H), 0);
      const needs = total > inner.h;
      const bodyW = inner.w - (needs ? SB : 0);
      st.sectScroll = Math.max(0, Math.min(st.sectScroll, total - inner.h));

      ctx.save();
      ctx.beginPath(); ctx.rect(inner.x, inner.y, bodyW, inner.h); ctx.clip();
      let ry = inner.y - st.sectScroll;
      rows.forEach((row, i) => {
        if (row.sep) { etchIn(ctx, inner.x + 4, ry + 3, bodyW - 8, 2); ry += 7; return; }
        const on = row.kind === st.filter.kind
          && (row.kind !== 'type' || row.type === st.filter.type)
          && (row.kind !== 'section' || row.id === st.filter.id);
        if (ry + ROW_H > inner.y - ROW_H && ry < inner.y + inner.h) {
          if (on) fill(ctx, inner.x, ry, bodyW, ROW_H, C.select);
          if (row.kind === 'section') {
            fill(ctx, inner.x + 4, ry + 5, 8, 8, row.color || '#808080');
            fill(ctx, inner.x + 4, ry + 5, 8, 1, '#ffffff');
          } else if (row.icon) {
            drawIcon(ctx, row.icon, inner.x + 3, ry + 2, 13);
          } else if (row.type === 'fav') {
            star(ctx, inner.x + 9, ry + 8, 5);
          } else {
            typeGlyph(ctx, inner.x + 3, ry + 2, 13, 'card');
          }
          ctx.save();
          ctx.beginPath(); ctx.rect(inner.x + 17, ry, bodyW - 19, ROW_H); ctx.clip();
          text(ctx, row.label, inner.x + 18, ry + ROW_H / 2,
            { baseline: 'middle', font: FONT.ui, color: on ? C.selectText : C.text });
          ctx.restore();
          reg(`sect:${i}`, inner.x, ry, bodyW, ROW_H, { row });
        }
        ry += ROW_H;
      });
      ctx.restore();
      if (needs) vScroll(ctx, inner.x + inner.w - SB, inner.y, SB, inner.h, st.sectScroll, inner.h, total, 'sect');
    }

    function drawList(ctx, x, y, w, h) {
      fill(ctx, x, y, w, h, C.white);
      bevelIn(ctx, x, y, w, h);
      const inner = { x: x + 2, y: y + 2, w: w - 4, h: h - 4 };
      const list = visibleItems();
      const total = list.length * ROW_H;
      const needs = total > inner.h;
      const bodyW = inner.w - (needs ? SB : 0);
      st.listScroll = Math.max(0, Math.min(st.listScroll, Math.max(0, total - inner.h)));

      if (!list.length) {
        text(ctx, st.items.length ? 'No matching items.' : 'This vault is empty.',
          inner.x + 6, inner.y + 8, { font: FONT.small, color: C.shadow });
      }

      ctx.save();
      ctx.beginPath(); ctx.rect(inner.x, inner.y, bodyW, inner.h); ctx.clip();
      list.forEach((it, i) => {
        const ry = inner.y + i * ROW_H - st.listScroll;
        if (ry + ROW_H < inner.y || ry > inner.y + inner.h) return;
        const p = plainOf(it._id);
        const on = it._id === st.selId;
        if (on) fill(ctx, inner.x, ry, bodyW, ROW_H, C.select);
        typeGlyph(ctx, inner.x + 2, ry + 2, 13, it.type);
        let tx = inner.x + 18;
        if (it.favorite) { star(ctx, tx + 4, ry + 8, 4.5); tx += 11; }
        ctx.save();
        ctx.beginPath(); ctx.rect(tx, ry, bodyW - (tx - inner.x) - 2, ROW_H); ctx.clip();
        const label = p ? p.name : 'Decrypting...';
        text(ctx, label, tx, ry + ROW_H / 2, {
          baseline: 'middle', font: FONT.ui,
          color: on ? C.selectText : (p?.broken ? '#a00000' : C.text),
        });
        ctx.restore();
        reg(`item:${it._id}`, inner.x, ry, bodyW, ROW_H, { id: it._id });
      });
      ctx.restore();
      if (needs) vScroll(ctx, inner.x + inner.w - SB, inner.y, SB, inner.h, st.listScroll, inner.h, total, 'list');
    }

    function drawDetail(ctx, x, y, w, h) {
      fill(ctx, x, y, w, h, C.face);
      bevelIn(ctx, x, y, w, h);
      const inner = { x: x + 3, y: y + 3, w: w - 6, h: h - 6 };
      const item = selItem();
      const p = selPlain();

      if (!item || !p) {
        ctx.font = FONT.ui;
        wrap(ctx, 'Select an item on the left. Everything you see there was decrypted in this browser.', inner.w - 8)
          .forEach((ln, i) => text(ctx, ln, inner.x + 4, inner.y + 6 + i * 13, { font: FONT.ui, color: C.shadow }));
        return;
      }

      ctx.save();
      ctx.beginPath(); ctx.rect(inner.x, inner.y, inner.w, inner.h); ctx.clip();
      const bodyW = inner.w - SB - 2;
      let cy = inner.y + 2 - st.detailScroll;
      const x0 = inner.x + 2;

      // header
      typeGlyph(ctx, x0, cy, 16, item.type);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 + 20, cy, bodyW - 22, 18); ctx.clip();
      text(ctx, p.name, x0 + 20, cy + 8, { baseline: 'middle', font: FONT.uiBold });
      ctx.restore();
      cy += 18;
      text(ctx, TYPE_LABEL[item.type] ?? item.type, x0, cy, { font: FONT.small, color: '#505050' });
      if (item.favorite) star(ctx, x0 + bodyW - 8, cy + 4, 5);
      cy += 15;
      etchIn(ctx, x0, cy, bodyW, 2); cy += 8;

      if (p.broken) {
        ctx.font = FONT.ui;
        wrap(ctx, 'This item could not be decrypted with the current vault key. Its ciphertext is intact on the server.', bodyW)
          .forEach((ln, i) => text(ctx, ln, x0, cy + i * 13, { color: '#a00000' }));
        cy += 40;
      }

      const row = (label, value, opts = {}) => { cy = fieldRow(ctx, x0, cy, bodyW, label, value, opts); };

      if (item.type === 'login' || p.login) {
        row('User name', p.login?.username ?? '', { name: 'username' });
        row('Password', p.login?.password ?? '', { name: 'password', secret: true });
        const url = p.login?.urls?.[0] ?? '';
        row('Address', url, { name: 'url' });
        if (p.login?.totp) cy = totpRow(ctx, x0, cy, bodyW);
      }
      if (item.type === 'card' || p.card) {
        row('Cardholder', p.card?.cardholder ?? '', { name: 'cardholder' });
        row('Number', p.card?.number ?? '', { name: 'number', secret: true });
        row('Brand', p.card?.brand ?? '', { name: 'brand', noCopy: true });
        const exp = [p.card?.expMonth, p.card?.expYear].filter(Boolean).join(' / ');
        row('Expires', exp, { name: 'exp', noCopy: true });
        row('Security code', p.card?.cvv ?? '', { name: 'cvv', secret: true });
        row('PIN', p.card?.pin ?? '', { name: 'pin', secret: true });
        row('ZIP', p.card?.zip ?? '', { name: 'zip', noCopy: true });
      }
      if (item.type === 'identity' || p.identity) {
        row('Full name', p.identity?.fullName ?? '', { name: 'fullName' });
        row('E-mail', p.identity?.email ?? '', { name: 'email' });
        row('Telephone', p.identity?.phone ?? '', { name: 'phone' });
        row('Address', p.identity?.address ?? '', { name: 'address' });
        row('Company', p.identity?.company ?? '', { name: 'company', noCopy: true });
        row(p.identity?.idKind || 'ID number', p.identity?.idNumber ?? '', { name: 'idNumber', secret: true });
      }
      if (p.file) {
        row('File name', p.file.filename ?? '', { name: 'filename', noCopy: true });
        row('Type', p.file.mimeType ?? '', { name: 'mime', noCopy: true });
        row('Size', p.file.originalSize ? `${Math.ceil(p.file.originalSize / 1024).toLocaleString('en-US')} KB` : '', { name: 'size', noCopy: true });
      }
      if (Array.isArray(p.attachments) && p.attachments.length) {
        text(ctx, `${p.attachments.length} attachment${p.attachments.length === 1 ? '' : 's'} — open Personal OS to download them.`,
          x0, cy, { font: FONT.small, color: '#505050' });
        cy += 16;
      }

      if (p.notes) {
        text(ctx, 'Notes', x0, cy, { font: FONT.small, color: '#505050' });
        cy += 13;
        ctx.font = FONT.ui;
        const lines = [];
        for (const para of String(p.notes).split('\n')) {
          if (!para) { lines.push(''); continue; }
          for (const ln of wrap(ctx, para, bodyW - 8)) lines.push(ln);
        }
        const boxH = Math.min(120, Math.max(24, lines.length * 13 + 6));
        fill(ctx, x0, cy, bodyW, boxH, C.white);
        bevelIn(ctx, x0, cy, bodyW, boxH);
        ctx.save();
        ctx.beginPath(); ctx.rect(x0 + 2, cy + 2, bodyW - 4, boxH - 4); ctx.clip();
        lines.forEach((ln, i) => text(ctx, ln, x0 + 4, cy + 4 + i * 13, { font: FONT.ui }));
        ctx.restore();
        cy += boxH + 6;
      }

      ctx.restore();

      const contentH = cy - (inner.y + 2 - st.detailScroll) + 6;
      st.detailScroll = Math.max(0, Math.min(st.detailScroll, Math.max(0, contentH - inner.h)));
      if (contentH > inner.h) {
        vScroll(ctx, inner.x + inner.w - SB, inner.y, SB, inner.h, st.detailScroll, inner.h, contentH, 'detail');
      }
    }

    /** One label/value line with optional Show + Copy buttons. */
    function fieldRow(ctx, x, y, w, label, value, { secret = false, name = label, noCopy = false } = {}) {
      if (!value) return y;
      const H = 17;
      text(ctx, label, x, y + H / 2, { baseline: 'middle', font: FONT.small, color: '#404040' });
      let bx = x + w;
      if (!noCopy) {
        bx -= 36;
        button(ctx, bx, y + 1, 36, 15, 'Copy', { font: FONT.small });
        reg(`copy:${name}`, bx, y + 1, 36, 15, { value, label });
        bx -= 3;
      }
      if (secret) {
        bx -= 34;
        button(ctx, bx, y + 1, 34, 15, st.showPw ? 'Hide' : 'Show', { font: FONT.small });
        reg('toggleShow', bx, y + 1, 34, 15);
        bx -= 3;
      }
      const vx = x + 72;
      const vw = Math.max(20, bx - vx);
      const shown = secret && !st.showPw ? '*'.repeat(Math.min(20, String(value).length)) : String(value);
      ctx.save();
      ctx.beginPath(); ctx.rect(vx, y, vw, H); ctx.clip();
      text(ctx, shown, vx, y + H / 2, {
        baseline: 'middle',
        font: secret && st.showPw ? FONT.monoSmall : FONT.ui,
      });
      ctx.restore();
      return y + H + 2;
    }

    function totpRow(ctx, x, y, w) {
      const t = st.totp;
      text(ctx, 'One-time code', x, y + 8, { baseline: 'middle', font: FONT.small, color: '#404040' });
      if (!t || (!t.code && !t.bad)) {
        text(ctx, 'working...', x + 72, y + 8, { baseline: 'middle', font: FONT.ui, color: C.shadow });
        return y + 19;
      }
      if (t.bad) {
        text(ctx, 'unreadable secret', x + 72, y + 8, { baseline: 'middle', font: FONT.ui, color: '#a00000' });
        return y + 19;
      }
      const pretty = t.code.length === 6 ? `${t.code.slice(0, 3)} ${t.code.slice(3)}` : t.code;
      text(ctx, pretty, x + 72, y + 8, { baseline: 'middle', font: 'bold 14px "Courier New", monospace' });
      button(ctx, x + w - 36, y + 1, 36, 15, 'Copy', { font: FONT.small });
      reg('copy:totp', x + w - 36, y + 1, 36, 15, { value: t.code, label: 'One-time code' });
      // the countdown bar
      const left = Math.max(0, (t.expiresAt - Date.now()) / 1000);
      const frac = Math.max(0, Math.min(1, left / (t.period || 30)));
      const bw = Math.max(40, w - 150);
      const bx = x + 150;
      fill(ctx, bx, y + 5, bw, 7, C.white);
      bevelIn(ctx, bx, y + 5, bw, 7);
      fill(ctx, bx + 1, y + 6, Math.round((bw - 2) * frac), 5, left <= 5 ? '#b02020' : C.titleA1);
      text(ctx, `${Math.ceil(left)}s`, bx + bw + 4, y + 8, { baseline: 'middle', font: FONT.small, color: '#404040' });
      return y + 21;
    }

    function star(ctx, cx, cy, rad) {
      ctx.save();
      ctx.fillStyle = '#e8b020';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? rad : rad * 0.45;
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // ── the editor ───────────────────────────────────────────
    const EDIT_FIELDS = ['name', 'username', 'password', 'url', 'notes'];

    function drawEditor(ctx, W, H) {
      const ed = st.editor;
      if (!ed) { st.view = 'browse'; return; }
      fill(ctx, 0, 0, W, H, C.face);
      text(ctx, ed.itemId ? 'Edit Login' : 'New Login', 10, 8, { font: FONT.uiBold });
      text(ctx, 'Everything below is encrypted in this window before it is sent.',
        10, 24, { font: FONT.small, color: '#505050' });

      const x = 10, w = W - 20;
      let y = 42;
      const labelW = 74;
      const fieldX = x + labelW;
      const fieldW = w - labelW;

      const line = (label, key, opts = {}) => {
        text(ctx, label, x, y + 9, { baseline: 'middle', font: FONT.ui });
        const fw = opts.short ? fieldW - 80 : fieldW;
        drawField(ctx, fieldX, y, fw, 18, ed[key], {
          focused: st.focus === key,
          masked: key === 'password' && !st.showPw,
        });
        reg(`f:${key}`, fieldX, y, fw, 18);
        if (opts.short) {
          button(ctx, fieldX + fw + 4, y, 34, 18, st.showPw ? 'Hide' : 'Show', { font: FONT.small });
          reg('toggleShow', fieldX + fw + 4, y, 34, 18);
          button(ctx, fieldX + fw + 42, y, 34, 18, 'Gen', { font: FONT.small });
          reg('tb:generator', fieldX + fw + 42, y, 34, 18);
        }
        y += 24;
      };

      line('Name:', 'name');
      line('User name:', 'username');
      line('Password:', 'password', { short: true });
      line('Address:', 'url');

      // strength read-out for whatever is in the password box
      const s = estimateStrength(ed.password);
      strengthMeter(ctx, fieldX, y - 2, Math.min(180, fieldW), s);
      y += 18;

      text(ctx, 'Notes:', x, y + 6, { font: FONT.ui });
      const nh = Math.max(40, H - y - 40);
      fill(ctx, fieldX, y, fieldW, nh, C.white);
      bevelIn(ctx, fieldX, y, fieldW, nh);
      reg('f:notes', fieldX, y, fieldW, nh);
      ctx.save();
      ctx.beginPath(); ctx.rect(fieldX + 2, y + 2, fieldW - 4, nh - 4); ctx.clip();
      ctx.font = FONT.ui;
      const lines = [];
      for (const para of ed.notes.split('\n')) {
        const wrapped = para ? wrap(ctx, para, fieldW - 10) : [''];
        for (const ln of wrapped) lines.push(ln);
      }
      lines.forEach((ln, i) => text(ctx, ln, fieldX + 4, y + 4 + i * 13, { font: FONT.ui }));
      if (st.focus === 'notes' && blink()) {
        const lastY = y + 4 + Math.max(0, lines.length - 1) * 13;
        fill(ctx, fieldX + 5 + ctx.measureText(lines[lines.length - 1] ?? '').width, lastY, 1, 12, '#000000');
      }
      ctx.restore();
      y += nh + 6;

      button(ctx, W - 168, y, 78, 22, st.saving ? 'Saving...' : 'Save', { disabled: st.saving, focus: !st.saving });
      reg('save', W - 168, y, 78, 22);
      button(ctx, W - 86, y, 78, 22, 'Cancel');
      reg('cancel', W - 86, y, 78, 22);
    }

    function strengthMeter(ctx, x, y, w, s) {
      const segW = Math.floor((w - 8) / 5);
      const cols = ['#b02020', '#c07020', '#c0a020', '#409040', '#207030'];
      for (let i = 0; i < 5; i++) {
        const on = i <= s.score && s.bits > 0;
        fill(ctx, x + i * (segW + 2), y, segW, 8, on ? cols[s.score] : '#a0a0a0');
        bevelIn(ctx, x + i * (segW + 2), y, segW, 8, 1);
      }
      text(ctx, `${s.label} · ${s.bits} bits`, x + 5 * (segW + 2) + 6, y + 4,
        { baseline: 'middle', font: FONT.small, color: '#404040' });
    }

    // ── the generator dialog ─────────────────────────────────
    function drawGenerator(ctx, W, H) {
      const g = st.gen;
      const w = Math.min(320, W - 20);
      const h = 208;
      const x = Math.round((W - w) / 2);
      const y = Math.max(4, Math.round((H - h) / 2) - 6);

      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.fillRect(x + 4, y + 4, w, h);
      fill(ctx, x, y, w, h, C.face);
      bevelOut(ctx, x, y, w, h);
      // little title bar so it reads as a dialog
      const grad = ctx.createLinearGradient(x + 3, 0, x + w - 3, 0);
      grad.addColorStop(0, C.titleA1); grad.addColorStop(1, C.titleA2);
      ctx.fillStyle = grad; ctx.fillRect(x + 3, y + 3, w - 6, 16);
      text(ctx, 'Password Generator', x + 7, y + 11, { baseline: 'middle', font: FONT.title, color: C.titleText });
      button(ctx, x + w - 20, y + 4, 14, 14, null);
      ctx.fillStyle = C.dark;
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(x + w - 13 + i - 1, y + 11 + i - 1, 2, 1);
        ctx.fillRect(x + w - 13 - i - 1, y + 11 + i - 1, 2, 1);
      }
      reg('gen:close', x + w - 20, y + 4, 14, 14);

      let cy = y + 26;
      const ix = x + 10, iw = w - 20;

      // the value
      fill(ctx, ix, cy, iw - 42, 20, C.white);
      bevelIn(ctx, ix, cy, iw - 42, 20);
      ctx.save();
      ctx.beginPath(); ctx.rect(ix + 2, cy + 2, iw - 46, 16); ctx.clip();
      text(ctx, g.value, ix + 4, cy + 10, { baseline: 'middle', font: FONT.monoSmall });
      ctx.restore();
      button(ctx, ix + iw - 38, cy, 38, 20, 'New', { font: FONT.small });
      reg('gen:new', ix + iw - 38, cy, 38, 20);
      cy += 24;

      strengthMeter(ctx, ix, cy, Math.min(190, iw - 90), estimateStrength(g.value));
      cy += 16;

      // mode
      button(ctx, ix, cy, 78, 18, 'Password', { pressed: g.mode === 'password', font: FONT.small });
      reg('gen:mode:password', ix, cy, 78, 18);
      button(ctx, ix + 80, cy, 78, 18, 'Passphrase', { pressed: g.mode === 'passphrase', font: FONT.small });
      reg('gen:mode:passphrase', ix + 80, cy, 78, 18);
      cy += 24;

      // length / words slider
      const isPhrase = g.mode === 'passphrase';
      const lo = isPhrase ? 3 : 6, hi = isPhrase ? 10 : 64;
      const val = isPhrase ? g.words : g.length;
      text(ctx, isPhrase ? `Words: ${val}` : `Length: ${val}`, ix, cy + 6, { baseline: 'middle', font: FONT.ui });
      const trackX = ix + 78, trackW = iw - 88;
      fill(ctx, trackX, cy + 5, trackW, 4, C.face);
      bevelIn(ctx, trackX, cy + 5, trackW, 4, 1);
      const frac = (val - lo) / (hi - lo);
      const thumbX = trackX + Math.round(frac * (trackW - 10));
      button(ctx, thumbX, cy - 2, 10, 18, null);
      reg('gen:slider', trackX - 4, cy - 4, trackW + 8, 22, { trackX, trackW, lo, hi });
      cy += 24;

      // toggles
      if (isPhrase) {
        text(ctx, 'Words are picked from a 256-word list — 8 bits each,', ix, cy, { font: FONT.small, color: '#404040' });
        text(ctx, 'chosen with crypto.getRandomValues.', ix, cy + 12, { font: FONT.small, color: '#404040' });
        cy += 30;
      } else {
        const toggles = [
          ['uppercase', 'A-Z'], ['lowercase', 'a-z'], ['numbers', '0-9'],
          ['symbols', '!@#$'], ['avoidAmbiguous', 'Avoid ambiguous'],
        ];
        let tx = ix, ty = cy;
        toggles.forEach(([key, label], i) => {
          checkbox(ctx, tx, ty, g[key], label);
          reg(`gen:opt:${key}`, tx, ty, i === 4 ? 120 : 60, 14);
          if (i === 3) { tx = ix; ty += 18; } else tx += 66;
        });
        cy += 38;
      }

      const bw = 74;
      button(ctx, ix, cy, bw, 22, 'Copy');
      reg('gen:copy', ix, cy, bw, 22);
      const canUse = st.view === 'edit';
      button(ctx, ix + bw + 6, cy, 96, 22, 'Use for this item', { disabled: !canUse, font: FONT.small });
      if (canUse) reg('gen:use', ix + bw + 6, cy, 96, 22);
      button(ctx, x + w - 10 - bw, cy, bw, 22, 'Close');
      reg('gen:close2', x + w - 10 - bw, cy, bw, 22);
    }

    // ═════════════════════════════════════════════════════════
    // input
    // ═════════════════════════════════════════════════════════
    function mouse(type, mx, my, btn, win, api) {
      if (!panel.connected()) { panel.mouse(type, mx, my, btn, win, api); return; }
      if (type === 'move') {
        // deliberately does NOT reset the auto-lock timer: a cursor parked over
        // the window while you are out of the room is not interaction
        if (st.dragSlider && st.gen) { st.idle = 0; setSliderFrom(mx); }
        return;
      }
      st.idle = 0;
      if (type === 'up') { st.dragSlider = false; return; }
      if (type !== 'down' && type !== 'dblclick') return;

      const h = at(mx, my);
      const name = h?.name ?? '';

      // the generator is modal over whatever is behind it
      if (st.gen) {
        if (!name.startsWith('gen:')) return;
        handleGenerator(name, h.rect, mx, api);
        return;
      }

      if (!name) return;

      if (name === 'master') return;                      // the field is always focused
      if (name === 'unlock') { doUnlock(win, api); return; }
      if (name === 'toggleShow') { setShowPw(!st.showPw); return; }
      if (name === 'search') { st.focus = 'search'; return; }
      if (name === 'save') { saveEditor(win, api); return; }
      if (name === 'cancel') { st.editor = null; st.focus = null; st.view = 'browse'; return; }
      if (name.startsWith('f:')) { st.focus = name.slice(2); st.caret = 0; return; }
      if (name.startsWith('tb:')) { command(name.slice(3), win, api); return; }
      if (name.startsWith('copy:')) { copyValue(h.rect.label ?? 'Value', h.rect.value, api); return; }
      if (name.startsWith('sect:')) {
        const row = h.rect.row;
        st.filter = row.kind === 'type' ? { kind: 'type', type: row.type }
          : row.kind === 'section' ? { kind: 'section', id: row.id }
            : { kind: row.kind };
        st.listScroll = 0;
        return;
      }
      if (name.startsWith('item:')) {
        if (st.selId !== h.rect.id) { st.selId = h.rect.id; st.detailScroll = 0; st.totp = null; }
        if (type === 'dblclick') openEditor(st.selId, api);
        return;
      }
      // scrollbars
      const m = /^(sect|list|detail):(up|down|track)$/.exec(name);
      if (m) {
        const key = m[1] === 'sect' ? 'sectScroll' : m[1] === 'list' ? 'listScroll' : 'detailScroll';
        if (m[2] === 'up') st[key] -= ROW_H;
        else if (m[2] === 'down') st[key] += ROW_H;
        else st[key] += my < h.rect.thumbTop ? -60 : 60;
        st[key] = Math.max(0, st[key]);
      }
    }

    function setShowPw(v) { st.showPw = v; showItem.checked = v; }

    function setSliderFrom(mx) {
      const rect = R['gen:slider'];
      if (!rect || !st.gen) return;
      const f = Math.max(0, Math.min(1, (mx - rect.trackX - 5) / Math.max(1, rect.trackW - 10)));
      const v = Math.round(rect.lo + f * (rect.hi - rect.lo));
      if (st.gen.mode === 'passphrase') st.gen.words = v; else st.gen.length = v;
      regenerate();
    }

    function handleGenerator(name, rect, mx, api) {
      const g = st.gen;
      if (name === 'gen:close' || name === 'gen:close2') { st.gen = null; return; }
      if (name === 'gen:new') { regenerate(); return; }
      if (name === 'gen:slider') { st.dragSlider = true; setSliderFrom(mx); return; }
      if (name.startsWith('gen:mode:')) { g.mode = name.slice(9); regenerate(); return; }
      if (name.startsWith('gen:opt:')) { const k = name.slice(8); g[k] = !g[k]; regenerate(); return; }
      if (name === 'gen:copy') { copyValue('Generated password', g.value, api); return; }
      if (name === 'gen:use') {
        if (st.editor) { st.editor.password = g.value; st.focus = 'password'; }
        st.gen = null;
      }
    }

    function key(e, win, api) {
      st.idle = 0;
      if (!panel.connected()) { panel.key(e, win, api); return; }

      if (st.gen) {
        if (e.key === 'Escape') { st.gen = null; return; }
        if (e.key === 'Enter') { regenerate(); return; }
        return;
      }

      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { command('lock', win, api); return; }
      if (e.key === 'F5') { command('refresh', win, api); return; }

      // ── unlock screen: everything typed is the master password
      if (!unlocked()) {
        if (st.unlocking) return;
        if (e.key === 'Enter') { doUnlock(win, api); return; }
        if (e.key === 'Backspace') { st.master = st.master.slice(0, -1); st.caret = 0; return; }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { st.master += e.key; st.caret = 0; }
        return;
      }

      // ── editor
      if (st.view === 'edit' && st.editor) {
        const ed = st.editor;
        if (e.key === 'Escape') { st.editor = null; st.focus = null; st.view = 'browse'; return; }
        if (e.key === 'Tab') {
          const i = EDIT_FIELDS.indexOf(st.focus);
          st.focus = EDIT_FIELDS[(i + (e.shiftKey ? EDIT_FIELDS.length - 1 : 1)) % EDIT_FIELDS.length];
          st.caret = 0;
          return;
        }
        if (e.key === 'Enter') {
          if (st.focus === 'notes') { ed.notes += '\n'; return; }
          saveEditor(win, api);
          return;
        }
        if (!st.focus || !(st.focus in ed)) return;
        if (e.key === 'Backspace') { ed[st.focus] = ed[st.focus].slice(0, -1); st.caret = 0; return; }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { ed[st.focus] += e.key; st.caret = 0; }
        return;
      }

      // ── browse
      if (st.focus === 'search') {
        if (e.key === 'Escape') { st.search = ''; st.focus = null; return; }
        if (e.key === 'Enter') { st.focus = null; return; }
        if (e.key === 'Backspace') { st.search = st.search.slice(0, -1); st.listScroll = 0; return; }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { st.search += e.key; st.listScroll = 0; return; }
      }
      const list = visibleItems();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!list.length) return;
        const i = list.findIndex((it) => it._id === st.selId);
        const n = e.key === 'ArrowDown'
          ? Math.min(list.length - 1, i + 1)
          : Math.max(0, (i < 0 ? 0 : i - 1));
        st.selId = list[n]._id;
        st.detailScroll = 0;
        st.totp = null;
        st.listScroll = Math.max(0, n * ROW_H - 60);
        return;
      }
      if (e.key === 'PageDown') { st.detailScroll += 80; return; }
      if (e.key === 'PageUp') { st.detailScroll = Math.max(0, st.detailScroll - 80); return; }
      if (e.key === 'Enter' && st.selId) { openEditor(st.selId, api); return; }
      if (e.key === 'Delete' && st.selId) { deleteItem(win, api); return; }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { st.focus = 'search'; st.search += e.key; }
    }

    // ── menu / toolbar commands ──────────────────────────────
    function command(id, win, api) {
      st.idle = 0;
      switch (id) {
        case 'close': api.close(win); return;
        case 'lock': lock('The vault is locked.'); api.sound('click'); return;
        case 'new': if (unlocked()) openEditor(null, api); return;
        case 'edit': if (unlocked() && st.selId) openEditor(st.selId, api); return;
        case 'delete': if (unlocked()) deleteItem(win, api); return;
        case 'generator': openGenerator(); return;
        case 'showpw': setShowPw(!st.showPw); return;
        case 'refresh':
          if (unlocked()) { st.plain = new Map(); decryptAll(); setStatus('Refreshed.'); }
          return;
        case 'copyuser': {
          const p = selPlain();
          if (p?.login?.username) copyValue('User name', p.login.username, api);
          return;
        }
        case 'copypass': {
          const p = selPlain();
          if (p?.login?.password) copyValue('Password', p.login.password, api);
          return;
        }
        case 'about':
          api.messageBox('About Password Keeper',
            'Password Keeper 1.0\n\nEverything in this window is decrypted in your browser.\nThe server only ever holds ciphertext: it has never seen your\nmaster password and cannot read a single item.\n\nAES-256-GCM items, key wrapped under PBKDF2-SHA256.\nThe vault key lives in memory and dies when you lock.',
            { icon: 'vault', w: 360 });
          return;
        default:
      }
    }

    // ── tick ─────────────────────────────────────────────────
    function update(dt, win, api) {
      st.caret += dt;
      if (!panel.connected()) { panel.update(dt); return; }

      if (st.unlocking || st.saving || st.decrypting) api.setBusy(true);

      if (st.status) {
        statusT += dt;
        if (statusT > 4) st.status = '';
      }

      if (st.clip) {
        st.clip.left -= dt;
        if (st.clip.left <= 0) clearClipboard();
      }

      if (unlocked()) {
        tickTotp();
        st.idle += dt;
        const mins = st.account?.autoLockMinutes ?? 0;
        if (mins > 0 && st.idle > mins * 60) {
          lock(`Locked automatically after ${mins} minute${mins === 1 ? '' : 's'} of inactivity.`);
          api.sound('click');
        }
      }
    }

    function dispose() {
      lock();
      stopData();
      offStatus();
      panel.dispose();
    }

    return {
      title: 'Password Keeper',
      icon: 'vault',
      w: vault.w, h: vault.h,
      minW: vault.minW, minH: vault.minH,
      menus,
      // Note the missing `st`. Other apps hang their state off the window
      // object for debugging, but the OS state is reachable from
      // window.__room.desktop.state — which would put decrypted vault items one
      // property access away from the console. This app's state stays in the
      // closure.
      init(win, api) { if (st.backend.status === 'online') startData(); },
      update, command, key, draw, mouse, dispose,
    };
  },
};
