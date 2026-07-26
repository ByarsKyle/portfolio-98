// ─────────────────────────────────────────────────────────────
// api/surf — the modem. Fetches a real page off the real web and
// converts it into the block vocabulary that apps/browser.js draws.
//
// The 1998 browser is a canvas. It cannot run scripts, decode
// arbitrary remote images or lay out CSS, so everything is boiled
// down to: h1 h2 p small hr ul links pre trow img space.
// ─────────────────────────────────────────────────────────────
import dns from 'node:dns';
import net from 'node:net';
import { parse } from 'node-html-parser';

const TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024;      // 2 MB, then we hang up
const MAX_REDIRECTS = 5;
const MAX_BLOCKS = 400;
const MAX_TEXT = 2000;

// modern UA on purpose: a lot of hosts 403 anything that looks like
// MSIE 4, and an error page is a worse joke than a working one.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Portfolio98/1.0';

// tags whose subtree never makes it to the canvas
const DROP = new Set([
  'script', 'style', 'noscript', 'svg', 'iframe', 'form', 'nav', 'footer',
  'head', 'meta', 'link', 'template', 'canvas', 'audio', 'video', 'object',
  'embed', 'button', 'input', 'select', 'textarea', 'picture', 'source',
  'dialog', 'math',
]);

// tags that start a new block when we hit them
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// ── rate limit ───────────────────────────────────────────────
// best-effort only: every serverless instance has its own memory, so
// a busy deployment gets N buckets rather than one. Good enough to
// stop a single bored visitor hammering the thing.
const RATE = new Map();
const RATE_MAX = 20;          // requests
const RATE_WINDOW = 60000;    // per minute

function rateOk(ip) {
  const now = Date.now();
  let b = RATE.get(ip);
  if (!b) { b = { tokens: RATE_MAX, ts: now }; RATE.set(ip, b); }
  b.tokens = Math.min(RATE_MAX, b.tokens + ((now - b.ts) / RATE_WINDOW) * RATE_MAX);
  b.ts = now;
  if (RATE.size > 5000) RATE.clear();   // crude sweep
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// ── SSRF guard ───────────────────────────────────────────────
function v4Private(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return true;              // this net, 10/8, loopback
  if (a === 169 && b === 254) return true;                        // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;               // 172.16/12
  if (a === 192 && b === 168) return true;                        // 192.168/16
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;   // IETF assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true;           // benchmarking
  if (a === 198 && b === 51 && c === 100) return true;            // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true;             // TEST-NET-3
  if (a === 100 && b >= 64 && b <= 127) return true;              // CGNAT
  if (a >= 224) return true;                                      // multicast + reserved + broadcast
  return false;
}

function v6Private(ip) {
  const s = ip.toLowerCase().split('%')[0];
  if (s === '::1' || s === '::') return true;
  if (s.startsWith('::ffff:')) {                                  // v4-mapped
    const tail = s.slice(7);
    return tail.includes('.') ? v4Private(tail) : true;
  }
  const head = s.split(':')[0];
  if (/^f[cd]/.test(head)) return true;                           // fc00::/7 unique local
  if (/^fe[89ab]/.test(head)) return true;                        // fe80::/10 link-local
  if (/^ff/.test(head)) return true;                              // multicast
  return false;
}

function ipPrivate(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return v4Private(ip);
  if (fam === 6) return v6Private(ip);
  return true;
}

/** Throws with a period-appropriate reason if this URL must not be fetched. */
async function guard(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch { throw fail(400, 'Bad URL', 'The address is not valid'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw fail(403, 'Unsupported protocol', 'Internet Explorer cannot open this address type');
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw fail(400, 'Bad URL', 'Cannot find server');
  const literal = net.isIP(host) ? host : (host.startsWith('[') ? host.slice(1, -1) : null);
  if (literal) {
    if (ipPrivate(literal)) throw fail(403, 'Blocked address', 'Access to this address is restricted');
    return u;
  }
  // bare hostnames (no dot) are intranet names — refuse them outright
  if (!host.includes('.')) throw fail(403, 'Blocked address', 'Access to this address is restricted');
  if (host === 'localhost' || /\.(localhost|local|internal|home|lan)$/.test(host)) {
    throw fail(403, 'Blocked address', 'Access to this address is restricted');
  }
  let addrs;
  try {
    addrs = await dns.promises.lookup(host, { all: true });
  } catch {
    throw fail(502, 'DNS failure', 'Cannot find server or DNS Error');
  }
  if (!addrs.length) throw fail(502, 'DNS failure', 'Cannot find server or DNS Error');
  // NOTE: resolve-then-fetch leaves a small TOCTOU window (DNS rebinding).
  // Fine here: the response never leaves this function except as text blocks.
  for (const a of addrs) {
    if (ipPrivate(a.address)) throw fail(403, 'Blocked address', 'Access to this address is restricted');
  }
  return u;
}

function fail(status, error, reason) {
  const e = new Error(error);
  e.status = status; e.reason = reason;
  return e;
}

// ── html → blocks ────────────────────────────────────────────
function abs(href, base) {
  if (!href) return null;
  const h = href.trim();
  if (!h || h.startsWith('#') || /^(javascript|mailto|tel|data):/i.test(h)) return null;
  try {
    const u = new URL(h, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch { return null; }
}

function clean(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** Flatten an element into styled runs: [{ text }, { text, href }, ...] */
function runs(el, base) {
  const out = [];
  const push = (txt, href) => {
    if (!txt) return;
    const last = out[out.length - 1];
    if (last && last.href === href) last.text += txt;
    else out.push(href ? { text: txt, href } : { text: txt });
  };
  const walk = (node, href) => {
    if (node.nodeType === 3) { push(node.rawText ? decode(node.rawText) : '', href); return; }
    if (node.nodeType !== 1) return;
    const tag = (node.rawTagName || '').toLowerCase();
    if (DROP.has(tag)) return;
    if (tag === 'br') { push(' ', href); return; }
    if (tag === 'img') { push(` [${clean(node.getAttribute('alt')) || 'image'}] `, href); return; }
    const next = tag === 'a' ? (abs(node.getAttribute('href'), base) || href) : href;
    for (const c of node.childNodes) walk(c, next);
    if (tag === 'li' || tag === 'p' || tag === 'div') push(' ', href);
  };
  walk(el, null);
  // normalise whitespace across the run list, keeping single spaces between runs
  let first = true;
  const norm = [];
  for (const r of out) {
    let t = r.text.replace(/\s+/g, ' ');
    if (first) t = t.replace(/^ /, '');
    if (!t) continue;
    first = false;
    norm.push(r.href ? { text: t, href: r.href } : { text: t });
  }
  while (norm.length && !norm[norm.length - 1].text.trim()) norm.pop();
  if (norm.length) norm[norm.length - 1].text = norm[norm.length - 1].text.replace(/ $/, '');
  return norm;
}

function runsText(rs) {
  return clean(rs.map((r) => r.text).join('')).slice(0, MAX_TEXT);
}

// node-html-parser leaves entities alone in rawText, so decode by hand.
const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®',
  trade: '™', deg: '°', middot: '·', bull: '•', times: '×', divide: '÷', laquo: '«',
  raquo: '»', eacute: 'é', egrave: 'è', agrave: 'à', uuml: 'ü', ouml: 'ö', auml: 'ä',
  ccedil: 'ç', ntilde: 'ñ', pound: '£', euro: '€', yen: '¥', sect: '§', para: '¶',
  dagger: '†', permil: '‰', prime: '′', Prime: '″', larr: '←', rarr: '→', harr: '↔',
  minus: '−', frac12: '½', frac14: '¼', sup2: '²', sup3: '³', shy: '',
};
function decode(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]{1,9});/gi, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return m;
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    const hit = ENT[body] ?? ENT[body.toLowerCase()];
    return hit === undefined ? m : hit;
  });
}

/** Does this element hold its own text, or is it just a wrapper? */
function hasOwnText(el) {
  for (const c of el.childNodes) {
    if (c.nodeType === 3 && clean(decode(c.rawText))) return true;
    if (c.nodeType === 1) {
      const tag = (c.rawTagName || '').toLowerCase();
      if (['a', 'span', 'strong', 'b', 'em', 'i', 'code', 'small', 'u', 'abbr', 'time', 'label', 'sub', 'sup', 'font', 'mark', 'q', 'cite'].includes(tag)
        && clean(c.text)) return true;
    }
  }
  return false;
}

function htmlToBlocks(root, base) {
  const blocks = [];
  const add = (b) => { if (blocks.length < MAX_BLOCKS) blocks.push(b); };
  let linkRun = null;   // consecutive standalone anchors collapse into one links block

  const flushLinks = () => { linkRun = null; };
  const addLink = (item) => {
    if (!linkRun || blocks[blocks.length - 1] !== linkRun) {
      linkRun = { t: 'links', items: [] };
      add(linkRun);
    }
    if (linkRun.items.length < 40) linkRun.items.push(item);
  };

  const para = (rs, indent) => {
    const txt = runsText(rs);
    if (!txt) return;
    flushLinks();
    // one bare anchor on its own line reads better as a link entry
    if (rs.length === 1 && rs[0].href) { addLink({ text: `→ ${txt}`, href: rs[0].href }); return; }
    add({ t: 'p', text: txt, spans: trimSpans(rs), ...(indent ? { indent: true } : {}) });
  };

  const walk = (el, depth) => {
    if (blocks.length >= MAX_BLOCKS || depth > 40) return;
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        const t = clean(decode(node.rawText));
        if (t) { flushLinks(); add({ t: 'p', text: t.slice(0, MAX_TEXT) }); }
        continue;
      }
      if (node.nodeType !== 1) continue;
      const tag = (node.rawTagName || '').toLowerCase();
      if (DROP.has(tag)) continue;
      if (blocks.length >= MAX_BLOCKS) return;

      if (HEADINGS.has(tag)) {
        const txt = runsText(runs(node, base));
        if (txt) { flushLinks(); add({ t: tag === 'h1' ? 'h1' : 'h2', text: txt.slice(0, 300) }); }
      } else if (tag === 'hr') {
        flushLinks(); add({ t: 'hr' });
      } else if (tag === 'p' || tag === 'dd' || tag === 'dt' || tag === 'figcaption') {
        para(runs(node, base), false);
      } else if (tag === 'blockquote') {
        para(runs(node, base), true);
      } else if (tag === 'pre' || (tag === 'code' && !hasParentPre(node))) {
        const lines = decode(node.text).replace(/\t/g, '  ').split('\n')
          .map((l) => l.replace(/\s+$/, '')).slice(0, 40);
        while (lines.length && !lines[0].trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        if (lines.length) { flushLinks(); add({ t: 'pre', lines: lines.map((l) => l.slice(0, 200)) }); }
      } else if (tag === 'ul' || tag === 'ol') {
        const items = [];
        let n = 1;
        for (const li of node.childNodes) {
          if (li.nodeType !== 1 || (li.rawTagName || '').toLowerCase() !== 'li') continue;
          const rs = runs(li, base);
          const txt = runsText(rs);
          if (!txt) continue;
          const prefix = tag === 'ol' ? `${n}. ` : '';
          items.push({ text: prefix + txt, spans: prefix ? [{ text: prefix }, ...trimSpans(rs)] : trimSpans(rs) });
          n += 1;
          if (items.length >= 60) break;
        }
        if (items.length) { flushLinks(); add({ t: 'ul', items }); }
      } else if (tag === 'table') {
        flushLinks();
        const rows = node.querySelectorAll('tr').slice(0, 25);
        for (const tr of rows) {
          const cells = [];
          for (const td of tr.childNodes) {
            if (td.nodeType !== 1) continue;
            const ct = (td.rawTagName || '').toLowerCase();
            if (ct !== 'td' && ct !== 'th') continue;
            cells.push(clean(decode(td.text)).slice(0, 90));
          }
          if (cells.some((c) => c)) {
            add({ t: 'trow', cells: cells.slice(0, 5), head: cells.length > 0 && tr.querySelector('th') != null });
          }
        }
      } else if (tag === 'img') {
        flushLinks();
        const alt = clean(decode(node.getAttribute('alt') || ''));
        // images are never proxied: the renderer is a canvas and cannot
        // safely decode arbitrary remote bitmaps. Placeholder + alt only.
        add({ t: 'img', ph: true, alt: alt.slice(0, 120), src: abs(node.getAttribute('src'), base) });
      } else if (tag === 'a') {
        const rs = runs(node, base);
        const txt = runsText(rs);
        const href = abs(node.getAttribute('href'), base);
        if (txt && href) addLink({ text: `→ ${txt.slice(0, 120)}`, href });
        else if (txt) { flushLinks(); add({ t: 'p', text: txt }); }
      } else if (tag === 'br') {
        // ignore: handled inside runs()
      } else if (hasOwnText(node)) {
        // a div/section/span that carries its own prose is a paragraph,
        // but keep walking for the element children it also holds
        para(runs(node, base), false);
      } else {
        walk(node, depth + 1);
      }
    }
  };

  walk(root, 0);
  return tidy(blocks);
}

function hasParentPre(node) {
  let p = node.parentNode;
  while (p) {
    if ((p.rawTagName || '').toLowerCase() === 'pre') return true;
    p = p.parentNode;
  }
  return false;
}

function trimSpans(rs) {
  const out = [];
  let len = 0;
  for (const r of rs) {
    if (len >= MAX_TEXT) break;
    const t = r.text.slice(0, MAX_TEXT - len);
    len += t.length;
    if (t) out.push(r.href ? { text: t, href: r.href } : { text: t });
  }
  return out;
}

/** Drop repeats and dangling junk so the page reads like a page. */
function tidy(blocks) {
  const out = [];
  const seen = new Set();
  for (const b of blocks) {
    if (b.t === 'p') {
      const k = b.text.toLowerCase();
      if (k.length > 24) {
        if (seen.has(k)) continue;
        seen.add(k);
      }
      if (b.text.length < 2) continue;
    }
    if (b.t === 'hr' && (!out.length || out[out.length - 1].t === 'hr')) continue;
    if (b.t === 'links' && !b.items.length) continue;
    out.push(b);
  }
  while (out.length && out[out.length - 1].t === 'hr') out.pop();
  return out;
}

// ── fetching ─────────────────────────────────────────────────
async function readCapped(res) {
  const reader = res.body?.getReader?.();
  if (!reader) return { buf: new Uint8Array(0), bytes: 0, truncated: false };
  const chunks = [];
  let bytes = 0, truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (bytes + value.length > MAX_BYTES) {
      chunks.push(value.subarray(0, MAX_BYTES - bytes));
      bytes = MAX_BYTES; truncated = true;
      try { await reader.cancel(); } catch { /* already gone */ }
      break;
    }
    chunks.push(value);
    bytes += value.length;
  }
  const buf = new Uint8Array(bytes);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  return { buf, bytes, truncated };
}

function decodeBody(buf, contentType) {
  const m = /charset=["']?([\w-]+)/i.exec(contentType || '');
  let label = m ? m[1] : null;
  let txt = tryDecode(buf, label || 'utf-8');
  if (!label) {
    const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(txt.slice(0, 4000));
    if (meta && !/^utf-?8$/i.test(meta[1])) {
      label = meta[1];
      txt = tryDecode(buf, label);
    }
  }
  return txt;
}
function tryDecode(buf, label) {
  try { return new TextDecoder(label, { fatal: false }).decode(buf); }
  catch { return new TextDecoder('utf-8', { fatal: false }).decode(buf); }
}

const STATUS_REASON = {
  400: '400 Bad Request', 401: '401 Unauthorized', 403: '403 Forbidden',
  404: 'The page cannot be found', 405: '405 Method Not Allowed',
  408: 'Connection timed out', 410: '410 Gone', 429: 'Too many requests',
  500: '500 Internal Server Error', 502: '502 Bad Gateway',
  503: 'Service Unavailable', 504: 'Connection timed out',
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
  if (!rateOk(ip)) {
    res.statusCode = 429;
    res.end(JSON.stringify({
      ok: false, status: 429, error: 'Rate limited',
      reason: 'The line is busy. Please try again in a minute.',
    }));
    return;
  }

  const raw = typeof req.query?.url === 'string'
    ? req.query.url
    : new URL(req.url, 'http://x').searchParams.get('url');

  if (!raw) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, status: 400, error: 'Missing url', reason: 'Cannot find server' }));
    return;
  }

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    // bare "example.com" gets a scheme; anything that already has one keeps it
    // so ftp:/file: land on the protocol check rather than looking like a host
    let target = raw.trim();
    if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) target = `http://${target}`;

    let hops = 0;
    let current = target;
    let response = null;
    for (;;) {
      await guard(current);
      response = await fetch(current, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const loc = response.headers.get('location');
        try { await response.body?.cancel(); } catch { /* ignore */ }
        if (!loc) throw fail(502, 'Bad redirect', 'The page cannot be displayed');
        hops += 1;
        if (hops > MAX_REDIRECTS) throw fail(508, 'Too many redirects', 'Too many redirects occurred');
        current = new URL(loc, current).toString();
        continue;
      }
      break;
    }

    const finalUrl = response.url || current;
    if (response.status >= 400) {
      try { await response.body?.cancel(); } catch { /* ignore */ }
      throw fail(response.status, `HTTP ${response.status}`,
        STATUS_REASON[response.status] || `${response.status} ${response.statusText || 'Error'}`);
    }

    const ctype = (response.headers.get('content-type') || '').toLowerCase();
    const isText = ctype.includes('text/plain');
    // a missing content-type gets sniffed after we have the body
    const maybeHtml = ctype.includes('text/html') || ctype.includes('xhtml');
    if (!maybeHtml && !isText && ctype) {
      try { await response.body?.cancel(); } catch { /* ignore */ }
      const kind = ctype.split(';')[0] || 'unknown';
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      res.end(JSON.stringify({
        ok: true,
        url: target,
        finalUrl,
        title: 'Unsupported file type',
        bytes: 0,
        blocks: [
          { t: 'h1', text: 'This file cannot be displayed' },
          { t: 'p', text: `The server sent a "${kind}" file. Internet Explorer 4 in this room can only display text and HTML pages — pictures, downloads, video and PDFs are not supported.` },
          { t: 'hr' },
          { t: 'small', text: finalUrl },
        ],
      }));
      return;
    }

    const { buf, bytes, truncated } = await readCapped(response);
    const body = decodeBody(buf, ctype);
    const isHtml = maybeHtml || (!ctype && /^\s*<(!doctype|html|head|body|meta)/i.test(body.slice(0, 400)));

    let title = '';
    let blocks;
    if (isHtml) {
      const doc = parse(body, {
        blockTextElements: { script: false, noscript: false, style: false, pre: true },
      });
      title = clean(decode(doc.querySelector('title')?.rawText || '')).slice(0, 120);
      const body_ = doc.querySelector('body') || doc;
      blocks = htmlToBlocks(body_, finalUrl);
    } else {
      title = finalUrl;
      blocks = body.split(/\n{2,}/).slice(0, MAX_BLOCKS)
        .map((chunk) => clean(chunk))
        .filter(Boolean)
        .map((text) => ({ t: 'p', text: text.slice(0, MAX_TEXT) }));
    }

    if (!blocks.length) {
      blocks = [
        { t: 'h1', text: title || 'Untitled document' },
        { t: 'p', text: 'This page has no text that Internet Explorer 4 can display. It is probably built entirely with scripts, which this browser does not run.' },
      ];
    }
    // the page usually repeats its own title as an h1 near the top — one is plenty
    const dupe = blocks.slice(0, 10).findIndex((b) => b.t === 'h1'
      && b.text.length > 6 && title.toLowerCase().startsWith(b.text.toLowerCase()));
    if (dupe >= 0) blocks.splice(dupe, 1);
    blocks.unshift({ t: 'h1', text: title || finalUrl }, { t: 'small', text: finalUrl }, { t: 'hr' });
    if (truncated) {
      blocks.push({ t: 'hr' }, { t: 'small', text: 'Transfer interrupted — page truncated at 2,048 KB.' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=300');
    res.end(JSON.stringify({
      ok: true, url: target, finalUrl, title: title || finalUrl, bytes, blocks,
    }));
  } catch (err) {
    const aborted = err?.name === 'AbortError' || (Date.now() - started) >= TIMEOUT_MS;
    const status = err?.status ?? (aborted ? 504 : 502);
    const reason = err?.reason
      ?? (aborted ? 'Connection timed out' : 'Cannot find server or DNS Error');
    res.statusCode = status >= 400 && status < 600 ? status : 502;
    res.end(JSON.stringify({
      ok: false,
      status: res.statusCode,
      error: String(err?.message || 'Fetch failed').slice(0, 200),
      reason,
    }));
  } finally {
    clearTimeout(timer);
  }
}
