# /api/surf — the modem

A single Vercel serverless function (Node, ESM) that lets the in-OS Internet
Explorer browse the real web. It fetches a URL, strips it down to text, and
returns a list of blocks that `src/os/apps/browser.js` already knows how to
draw on a 640x480 canvas.

Nothing else in the project talks to the network.

## Request

```
GET /api/surf?url=<absolute http(s) URL>
```

`url` may omit the scheme (`example.com` becomes `http://example.com`).

## Response — success

```jsonc
{
  "ok": true,
  "url": "http://example.com",              // what was asked for
  "finalUrl": "https://example.com/",       // after redirects
  "title": "Example Domain",
  "bytes": 559,                             // real bytes read off the wire
  "blocks": [ /* see below */ ]
}
```

Sent with `Cache-Control: public, s-maxage=300` so Vercel's edge serves repeat
visits without re-fetching.

## Response — failure

```jsonc
{
  "ok": false,
  "status": 404,
  "error": "HTTP 404",                      // developer-facing
  "reason": "The page cannot be found"      // drawn on the 1998 error page
}
```

`reason` is always period-appropriate: "Cannot find server or DNS Error",
"Connection timed out", "403 Forbidden", "Too many redirects occurred",
"Access to this address is restricted", "The line is busy. Please try again in
a minute."

## Blocks

Same vocabulary the local 1998 pages use, minus anything that needs a drawing
function:

| block | shape | notes |
| --- | --- | --- |
| `h1` | `{ t, text }` | `<h1>` |
| `h2` | `{ t, text }` | `<h2>`–`<h6>` |
| `p` | `{ t, text, spans?, indent? }` | `<p>`, prose-carrying `<div>`; `spans` keeps links inline; `indent` is `<blockquote>` |
| `small` | `{ t, text }` | the URL line under the title |
| `hr` | `{ t }` | `<hr>` |
| `ul` | `{ t, items: [{ text, spans? }] }` | `<ul>`/`<ol>` (ordered items are numbered into the text) |
| `links` | `{ t, items: [{ text, href }] }` | runs of standalone `<a>` elements |
| `pre` | `{ t, lines: [string] }` | `<pre>`/block `<code>`, drawn monospaced |
| `trow` | `{ t, cells: [string], head }` | one `<tr>`, up to 5 cells |
| `img` | `{ t, ph: true, alt, src }` | placeholder only — see below |

`spans` are `[{ text }, { text, href }]`; every `href` is absolute against the
final URL. The client draws link spans blue/underlined and hit-tests them, so
links inside a paragraph work like links.

## Deliberate limits

- **Images are never proxied.** The renderer is a canvas; decoding arbitrary
  remote bitmaps is both a security problem and a performance one. Every `<img>`
  becomes a broken-image box carrying its alt text.
- `script`, `style`, `noscript`, `svg`, `iframe`, `form`, `nav`, `footer` and
  friends are dropped entirely. Pages that are pure JavaScript render empty.
- Only `text/html` and `text/plain` are accepted. Anything else comes back as a
  short "this file cannot be displayed" page.
- 8 second timeout, 2 MB body cap, max 5 redirects, max 400 blocks.

## SSRF guard

Every hop — the original URL *and* each redirect — is validated before it is
fetched:

- http/https only.
- Hostnames without a dot are refused, as are `localhost` and the
  `.local` / `.internal` / `.home` / `.lan` suffixes.
- The hostname is resolved with `dns.promises.lookup(host, { all: true })` and
  **every** returned address is checked. Loopback, `10/8`, `172.16/12`,
  `192.168/16`, `169.254/16` (cloud metadata), CGNAT, test nets, multicast,
  `::1`, `fc00::/7` and `fe80::/10` are all rejected with 403.

There is a small resolve-then-fetch TOCTOU window (DNS rebinding). It is
acceptable here because the response never leaves the function except as plain
text blocks — there is no credential, header or cookie to steal.

## Rate limit

An in-memory token bucket keyed on `x-forwarded-for`: 20 requests per minute,
otherwise 429. Serverless instances do not share memory, so this is best-effort
— it stops one bored visitor, not a botnet.

## Local development

Vite has no serverless runtime of its own, so `vite.config.js` carries a small
dev-only middleware (`apiDev`) that loads this exact module and hands it the
real Node request/response. `npm run dev` therefore browses the real web the
same way the deployed site does — no `vercel dev` required.

If the endpoint is ever missing anyway, the browser app notices the response
isn't JSON and shows a period error explaining the modem could not reach the
server. The local 1998 pages keep working regardless.
