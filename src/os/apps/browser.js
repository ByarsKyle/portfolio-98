// ─────────────────────────────────────────────────────────────
// apps/browser — Internet Explorer 4 and the little web behind it.
//
// PAGES is the whole site. If you're forking this repo to make it
// your own portfolio, this object is the only thing you need to edit.
// ─────────────────────────────────────────────────────────────
import {
  C, FONT, bevelOut, bevelIn, etchIn, fill, text, button, drawIcon, scrollBar, arrow,
} from '../ui.js';
import { Noise2D, mulberry32 } from '../../forge/noise.js';

const LINK = '#0000ee';
const VISITED = '#551a8b';

// ── procedural page graphics ─────────────────────────────────
const art = {
  underConstruction(ctx, x, y, w, h, t) {
    fill(ctx, x, y, w, h, '#ffd800');
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#000000';
    for (let i = -h; i < w; i += 16) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + 8, y + h);
      ctx.lineTo(x + i + 8 + h, y); ctx.lineTo(x + i + h, y);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    fill(ctx, x + 4, y + h / 2 - 9, w - 8, 18, '#ffd800');
    text(ctx, 'UNDER CONSTRUCTION', x + w / 2, y + h / 2, {
      align: 'center', baseline: 'middle', font: 'bold 11px Tahoma, sans-serif', color: '#000',
    });
  },
  pug(ctx, x, y, w, h) {
    const u = w / 100;
    fill(ctx, x, y, w, h, '#b8d8e8');
    // simple front-facing pug portrait
    ctx.fillStyle = '#d9bb8a';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.58, w * 0.30, h * 0.30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2f28';
    ctx.beginPath(); ctx.ellipse(x + w * 0.28, y + h * 0.28, w * 0.11, h * 0.16, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w * 0.72, y + h * 0.28, w * 0.11, h * 0.16, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.66, w * 0.17, h * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + w * 0.40, y + h * 0.48, w * 0.075, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w * 0.60, y + h * 0.48, w * 0.075, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x + w * 0.40, y + h * 0.49, w * 0.042, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w * 0.60, y + h * 0.49, w * 0.042, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.62, w * 0.06, h * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    // tongue
    ctx.fillStyle = '#e07a8a';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.76, w * 0.05, h * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#00000030'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  },
  banner(ctx, x, y, w, h, t) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#2a1a6a'); g.addColorStop(0.5, '#6a2a9a'); g.addColorStop(1, '#1a3a8a');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    // starfield
    const rnd = mulberry32(7);
    for (let i = 0; i < 60; i++) {
      const sx = x + rnd() * w, sy = y + rnd() * h;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i));
      ctx.fillStyle = `rgba(255,255,255,${tw * 0.9})`;
      ctx.fillRect(sx, sy, 1.4, 1.4);
    }
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const hue = (t * 40) % 360;
    ctx.font = 'bold 26px Impact, "Arial Black", Tahoma, sans-serif';
    ctx.fillStyle = `hsl(${hue}, 100%, 62%)`;
    ctx.shadowColor = '#000'; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.fillText("KYLE'S CORNER OF THE WEB", x + w / 2, y + h / 2);
    ctx.restore();
  },
  badge(label, bg, fg) {
    return (ctx, x, y, w, h) => {
      fill(ctx, x, y, w, h, bg);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      text(ctx, label, x + w / 2, y + h / 2, {
        align: 'center', baseline: 'middle', color: fg, font: 'bold 10px Tahoma, sans-serif',
      });
    };
  },
  screenshot(seed, title) {
    return (ctx, x, y, w, h) => {
      const rnd = mulberry32(seed);
      fill(ctx, x, y, w, h, '#101828');
      // fake app chrome
      fill(ctx, x, y, w, 12, '#20304a');
      text(ctx, title, x + 4, y + 6, { baseline: 'middle', color: '#a8c8f0', font: '9px Tahoma' });
      for (let i = 0; i < 26; i++) {
        const bx = x + 6 + rnd() * (w - 60);
        const by = y + 18 + rnd() * (h - 26);
        const bw = 20 + rnd() * 46, bh = 3 + rnd() * 4;
        ctx.fillStyle = ['#3a6fd8', '#40c0a0', '#d8a040', '#8a6ad8'][(rnd() * 4) | 0] + '';
        ctx.globalAlpha = 0.35 + rnd() * 0.5;
        ctx.fillRect(bx, by, bw, bh);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#000'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };
  },
};

// ── the site ─────────────────────────────────────────────────
// blocks: h1 h2 p small hr ul link marquee img space table buttons counter
const PAGES = {
  home: {
    title: "Kyle's Corner of the Web",
    url: 'http://www.geocities.com/SiliconValley/9481/',
    bg: '#c8d8f0',
    blocks: [
      { t: 'img', h: 56, draw: art.banner },
      { t: 'space', h: 6 },
      { t: 'marquee', text: '*** WELCOME TO MY HOMEPAGE *** BEST VIEWED IN 800x600 *** SIGN MY GUESTBOOK *** ' },
      { t: 'space', h: 8 },
      { t: 'h1', text: 'Hi, I build things.' },
      { t: 'p', text: "You've reached the personal homepage of Kyle Byars. I make software — mostly web apps, tools, and the occasional thing nobody asked for. This whole page is running inside a Windows 98 machine, which is itself running inside a 3D bedroom, which is itself running in your browser." },
      { t: 'p', text: 'It is turtles all the way down. Have a look around.' },
      { t: 'space', h: 6 },
      { t: 'hr' },
      { t: 'h2', text: 'Where to go' },
      { t: 'links', items: [
        { text: '→ Projects I have shipped', href: 'projects' },
        { text: '→ About me / how to reach me', href: 'about' },
        { text: '→ How this room was built', href: 'howitworks' },
        { text: '→ Sign my guestbook', href: 'guestbook' },
        { text: '→ Cool links', href: 'links' },
      ] },
      { t: 'space', h: 8 },
      { t: 'hr' },
      { t: 'h2', text: 'My dog' },
      { t: 'row', items: [
        { t: 'img', w: 104, h: 84, draw: art.pug },
        { t: 'p', text: "That's the pug. He is on the rug behind you. He does not do much. He has been described as 'structurally concerned' and 'mostly nose'. He is a very good boy." },
      ] },
      { t: 'space', h: 8 },
      { t: 'hr' },
      { t: 'counter', n: 4172 },
      { t: 'space', h: 4 },
      { t: 'buttons', items: [
        art.badge('NETSCAPE NOW!', '#1a1a4a', '#ffffff'),
        art.badge('MADE ON A MAC', '#e8e8e8', '#222222'),
        art.badge('NO FRAMES!', '#8a1010', '#ffffff'),
        art.badge('Y2K READY', '#0a6a2a', '#ffffff'),
      ] },
      { t: 'space', h: 6 },
      { t: 'small', text: 'Last updated: 11/14/1998 · This page has been under construction since 1997.' },
      { t: 'img', h: 26, draw: art.underConstruction },
    ],
  },

  projects: {
    title: 'Projects',
    url: 'http://www.geocities.com/SiliconValley/9481/projects.html',
    bg: '#e8e8d8',
    blocks: [
      { t: 'h1', text: 'Things I have built' },
      { t: 'p', text: 'A working list. Some of these are live, some are half-finished, all of them taught me something.' },
      { t: 'hr' },
      { t: 'project', name: 'CallGuard', tag: 'Web app',
        desc: 'Call handling and screening tooling. Staging-first workflow, ships to production when it earns it.',
        seed: 11 },
      { t: 'project', name: 'PoolSurf', tag: 'Web app',
        desc: 'A service business platform — scheduling, routes, customers, the unglamorous parts that actually matter.',
        seed: 22 },
      { t: 'project', name: 'Personal OS', tag: 'Desktop',
        desc: 'A personal finance and life dashboard. Indigo and Poppins, because if you have to look at your money it should at least look nice.',
        seed: 33 },
      { t: 'project', name: 'HHN Alert', tag: 'Automation',
        desc: 'Watches for ticket drops and yells at me before they sell out. A cron job with strong opinions.',
        seed: 44 },
      { t: 'project', name: 'This room', tag: 'WebGL',
        desc: 'Every polygon and pixel generated at load time from about 6,000 lines of JavaScript. No 3D models. No texture files. See "How this room was built".',
        seed: 55 },
      { t: 'space', h: 8 },
      { t: 'links', items: [
        { text: '← Back to the homepage', href: 'home' },
        { text: '→ How this room was built', href: 'howitworks' },
      ] },
    ],
  },

  about: {
    title: 'About Me',
    url: 'http://www.geocities.com/SiliconValley/9481/about.html',
    bg: '#f0e8e0',
    blocks: [
      { t: 'h1', text: 'About me' },
      { t: 'row', items: [
        { t: 'img', w: 90, h: 90, draw: art.pug },
        { t: 'p', text: "I'm Kyle. I build software — usually the kind that saves somebody an hour a day. I like small tools, fast feedback loops, and interfaces that don't make you think twice." },
      ] },
      { t: 'space', h: 6 },
      { t: 'h2', text: 'What I work with' },
      { t: 'ul', items: [
        'JavaScript / TypeScript, Node, React',
        'Python when the problem calls for it',
        'Postgres, Supabase, the usual suspects',
        'WebGL and Three.js, evidently',
        'Whatever else the job needs',
      ] },
      { t: 'h2', text: 'Get in touch' },
      { t: 'ul', items: [
        'E-Mail: kylebyars@outlook.com',
        'GitHub: github.com/ByarsKyle',
        'ICQ: 41552087 (do not actually try this)',
      ] },
      { t: 'space', h: 6 },
      { t: 'p', text: 'If you got here by walking across a bedroom and pressing E on a beige monitor, thank you for playing along.' },
      { t: 'hr' },
      { t: 'links', items: [{ text: '← Back to the homepage', href: 'home' }] },
    ],
  },

  howitworks: {
    title: 'How this room was built',
    url: 'http://www.geocities.com/SiliconValley/9481/tech.html',
    bg: '#dce8dc',
    blocks: [
      { t: 'h1', text: 'How this room was built' },
      { t: 'p', text: 'There are no model files in this project. No .glb, no .fbx, no downloaded textures. Everything you can see is generated by code when the page loads, in about four seconds.' },
      { t: 'h2', text: 'The materials' },
      { t: 'p', text: 'Every surface is a shading function — a bit of maths that, for any point on a surface, returns a height, a colour and a roughness. The oak floor knows about plank seams, grain rings and the worn path through the middle of the room. The duvet knows about its own weave and quilt stitching.' },
      { t: 'p', text: 'Those functions are baked into full PBR map sets: albedo, roughness, metalness, a normal map derived by running a Sobel filter over the height field, and a cavity ambient-occlusion map from the difference between the height and its own blur.' },
      { t: 'h2', text: 'The bedding' },
      { t: 'p', text: 'The duvet, sheet, curtains and rug are not modelled. They are cloth simulations. A grid of points is dropped from above the bed and relaxed for a few hundred iterations against the mattress and a couple of invisible spheres, so the folds fall where physics puts them. Every reload settles slightly differently.' },
      { t: 'h2', text: 'The monitor' },
      { t: 'p', text: 'The screen you are reading this on is a 640x480 canvas being drawn every frame, used as a texture, and pushed through a shader that does barrel distortion, an aperture-grille RGB mask, scanlines, convergence error and phosphor glow. The same canvas is what you see when you sit down at the desk. It also samples its own average colour every few frames and feeds that to a light, so the monitor genuinely lights the room.' },
      { t: 'h2', text: 'The dog' },
      { t: 'p', text: 'Sixteen thousand fur shells over a deformed icosahedron. He breathes, blinks, wags, and occasionally looks at you.' },
      { t: 'hr' },
      { t: 'links', items: [
        { text: '← Back to the homepage', href: 'home' },
        { text: '→ Projects', href: 'projects' },
      ] },
    ],
  },

  guestbook: {
    title: 'Guestbook',
    url: 'http://www.geocities.com/SiliconValley/9481/guestbook.html',
    bg: '#f8f0d8',
    blocks: [
      { t: 'h1', text: 'Sign my guestbook!' },
      { t: 'p', text: 'Leave a message. It will not be saved anywhere, because it is 1998 and my CGI script has been broken since June.' },
      { t: 'guestform' },
      { t: 'hr' },
      { t: 'h2', text: 'Recent entries' },
      { t: 'entry', who: 'xX_dialup_kid_Xx', when: '11/12/98', msg: 'kool site!!! how did u make the background??' },
      { t: 'entry', who: 'webmaster@angelfire', when: '11/09/98', msg: 'Link exchange? I have a page about my cat.' },
      { t: 'entry', who: 'Dad', when: '11/03/98', msg: 'Kyle. Get off the phone line.' },
      { t: 'entry', who: 'anonymous', when: '10/28/98', msg: 'the dog is the best part' },
      { t: 'hr' },
      { t: 'links', items: [{ text: '← Back to the homepage', href: 'home' }] },
    ],
  },

  links: {
    title: 'Cool Links',
    url: 'http://www.geocities.com/SiliconValley/9481/links.html',
    bg: '#101020',
    fg: '#c8d8ff',
    blocks: [
      { t: 'h1', text: 'COOL LINKS', color: '#7af0ff' },
      { t: 'p', text: 'The best of the World Wide Web, hand-picked by me.' },
      { t: 'links', items: [
        { text: 'AltaVista — the search engine that finds everything', href: 'altavista' },
        { text: 'Space Jam (1996) — still up!', href: '404' },
        { text: 'The Hamster Dance', href: '404' },
        { text: 'Webring: 90s Bedroom Appreciation Society', href: '404' },
        { text: 'My friend Dave\'s page', href: '404' },
      ] },
      { t: 'space', h: 10 },
      { t: 'p', text: 'Disclaimer: I am not responsible for the content of external sites, or for the modem noises they may cause.' },
      { t: 'hr' },
      { t: 'links', items: [{ text: '← Back to the homepage', href: 'home' }] },
    ],
  },

  altavista: {
    title: 'AltaVista',
    url: 'http://www.altavista.digital.com/',
    bg: '#ffffff',
    blocks: [
      { t: 'h1', text: 'AltaVista', color: '#0033aa' },
      { t: 'small', text: 'The most powerful and useful guide to the Net.' },
      { t: 'searchbox' },
      { t: 'hr' },
      { t: 'small', text: 'Documents 1-4 of about 11,300,442 matching the query.' },
      { t: 'result', title: "Kyle's Corner of the Web", href: 'home',
        url: 'www.geocities.com/SiliconValley/9481/',
        desc: 'Personal homepage. Projects, a guestbook, and a pug. Under construction since 1997.' },
      { t: 'result', title: 'How this room was built', href: 'howitworks',
        url: 'www.geocities.com/SiliconValley/9481/tech.html',
        desc: 'There are no model files in this project. Everything is generated by code at load time...' },
      { t: 'result', title: 'Projects — Kyle Byars', href: 'projects',
        url: 'www.geocities.com/SiliconValley/9481/projects.html',
        desc: 'A working list of shipped things. CallGuard, PoolSurf, Personal OS, and this room.' },
      { t: 'result', title: '404 Not Found', href: '404',
        url: 'www.example.com/somewhere/',
        desc: 'The page you are looking for has been moved, deleted, or never existed.' },
    ],
  },

  'about:': {
    title: 'About this browser',
    url: 'about:',
    bg: '#ffffff',
    blocks: [
      { t: 'h1', text: 'About this browser' },
      { t: 'p', text: 'You are looking at a 640x480 canvas being drawn inside a WebGL bedroom. There is no HTML in this window — every pixel of Internet Explorer, and of the page you are reading, is painted by hand each frame. Some of it is a period reconstruction. Some of it is genuinely talking to the internet. Here is which is which.' },
      { t: 'hr' },
      { t: 'h2', text: 'Real' },
      { t: 'ul', items: [
        'The address bar works. Type a domain and press Enter and this window fetches that page off the live web, right now.',
        'Pages are fetched by a small serverless function (/api/surf) which downloads the HTML, throws away the scripts, styles and frames, and hands back a list of drawable blocks.',
        'Links on a fetched page are real links. Clicking one fetches it.',
        'The byte counts in the status bar are the real size of what came down the wire.',
        'Back and Forward work across both this little 1998 site and anything you fetch.',
      ] },
      { t: 'h2', text: 'Simulated' },
      { t: 'ul', items: [
        'The modem. Dial-Up Networking, the handshake noise and the connection gate are all theatre — your connection is whatever it actually is.',
        'The slowness. Fetched pages are revealed at roughly 5 KB/s, like a 56k line, but capped at about three and a half seconds so it stays a joke rather than a punishment.',
        'The local pages (this homepage, the guestbook, AltaVista) are hand-written data in the source, not fetched from anywhere.',
        'The visitor counter, the guestbook CGI error, and the 40-bit cipher strength.',
      ] },
      { t: 'h2', text: 'Not supported, on purpose' },
      { t: 'ul', items: [
        'Pictures. A canvas cannot safely decode arbitrary remote images, so every picture arrives as a placeholder with its alt text.',
        'JavaScript, CSS, cookies, logins, forms and video. Pages that are built entirely out of scripts will look empty — which is roughly what 1998 would have made of them too.',
        'Private addresses. The fetcher refuses anything on a local or internal network.',
      ] },
      { t: 'hr' },
      { t: 'links', items: [
        { text: '← Back to the homepage', href: 'home' },
        { text: '→ Try a real site: example.com', href: 'http://example.com/' },
      ] },
      { t: 'small', text: 'Microsoft Internet Explorer 4.01 · rendered on a 2D canvas · no frames, no scripts, no cookies' },
    ],
  },

  404: {
    title: '404 Not Found',
    url: 'http://www.example.com/',
    bg: '#ffffff',
    blocks: [
      { t: 'h1', text: '404 Not Found' },
      { t: 'p', text: 'The requested URL was not found on this server.' },
      { t: 'p', text: 'Honestly, in 1998, this is what most of the web looked like. Half the links were dead within a year.' },
      { t: 'hr' },
      { t: 'small', text: 'Apache/1.3.3 Server at www.example.com Port 80' },
      { t: 'space', h: 10 },
      { t: 'links', items: [{ text: '← Back to the homepage', href: 'home' }] },
    ],
  },
};

// ── text layout helper ───────────────────────────────────────
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

export const browser = {
  title: 'Microsoft Internet Explorer',
  icon: 'ie',
  w: 452, h: 342,
  single: true,
  minW: 300, minH: 200,

  create(arg, api) {
    const st = {
      page: null,          // local PAGES entry or a fetched { blocks } page
      pageKey: null,       // local key, null for fetched pages
      history: [],         // entries: { key } local | { url } fetched
      hIndex: -1,
      scroll: 0,
      loading: 0,          // local page "modem" timer
      loadTotal: 1,
      pending: null,
      pushNext: true,
      status: 'Done',
      throb: 0,
      links: [],
      hover: -1,
      visited: new Set(),
      guest: { name: '', msg: '', field: 0 },
      search: '',
      err: null,           // { title, url, reason, bullets, connect }
      net: null,           // in-flight fetch/stream, see navigateUrl()
      seq: 0,              // navigation token, kills stale fetches
      abort: null,
      cache: new Map(),    // url -> surf payload, so Back is cheap
      progress: 0,
      reveal: Infinity,    // blocks revealed so far while "downloading"
      addr: '',
      addrFocus: false,
      addrCaret: 0,
      addrSel: false,
      t: 0,
    };

    const app = {
      title: 'Microsoft Internet Explorer',
      icon: 'ie',
      w: 452, h: 342,
      minW: 320, minH: 220,
      st,
      menus: [
        { label: 'File', items: [{ label: 'New Window', accel: 'Ctrl+N' }, { label: 'Open...', accel: 'Ctrl+O' }, '-', { label: 'Work Offline', id: 'offline' }, '-', { label: 'Close', id: 'close' }] },
        { label: 'Edit', items: [{ label: 'Cut', disabled: true }, { label: 'Copy', disabled: true }, { label: 'Paste', disabled: true }] },
        { label: 'View', items: [{ label: 'Toolbars', checked: true }, { label: 'Status Bar', checked: true }, '-', { label: 'Refresh', id: 'refresh', accel: 'F5' }, { label: 'Source', id: 'source' }] },
        { label: 'Go', items: [{ label: 'Back', id: 'back' }, { label: 'Forward', id: 'forward' }, { label: 'Home Page', id: 'home' }, '-', { label: 'Search the Web', id: 'search' }] },
        { label: 'Favorites', items: [{ label: 'My Portfolio', id: 'go:home' }, { label: 'Projects', id: 'go:projects' }, { label: 'Guestbook', id: 'go:guestbook' }, { label: 'Cool Links', id: 'go:links' }, '-', { label: 'Example Domain', id: 'surf:http://example.com/' }, { label: 'Wikipedia', id: 'surf:https://en.wikipedia.org/wiki/Windows_98' }] },
        { label: 'Help', items: [{ label: 'What is real here?', id: 'go:about:' }, '-', { label: 'About Internet Explorer', id: 'about' }] },
      ],

      init(win, papi) {
        openAddress(arg || 'home', papi, { initial: true });
      },
      setArg(a, win, papi) { openAddress(a || 'home', papi); },

      update(dt, win, papi) {
        st.t += dt;
        if (st.loading > 0) {
          st.loading -= dt;
          st.throb += dt;
          st.progress = 1 - Math.max(0, st.loading) / st.loadTotal;
          papi.setBusy(true);
          if (st.loading <= 0) {
            st.loading = 0;
            finishLoad(papi);
          }
        }
        if (st.net) {
          st.net.t += dt;
          st.throb += dt;
          papi.setBusy(true);
          if (st.net.phase === 'fetch') tickFetch();
          else tickStream(papi);
        }
      },

      command(id, win, papi) {
        if (id === 'close') papi.close(win);
        else if (id === 'back') back(papi);
        else if (id === 'forward') forward(papi);
        else if (id === 'home' || id === 'Home Page') navigate('home', papi);
        else if (id === 'refresh' || id === 'Refresh') refresh(papi);
        else if (id === 'search' || id === 'Search the Web') navigate('altavista', papi);
        else if (id === 'Open...') { st.addrFocus = true; st.addrSel = true; st.addr = currentUrl(); st.addrCaret = st.addr.length; }
        else if (id?.startsWith('surf:')) navigateUrl(id.slice(5), papi);
        else if (id === 'source') {
          papi.open('notepad', 'source');
        } else if (id === 'about') {
          papi.messageBox('About Internet Explorer',
            'Microsoft Internet Explorer 4.01\n\nVersion 4.72.3110.8\nCipher Strength: 40-bit\n\nBased on NCSA Mosaic. Sort of.',
            { icon: 'ie', w: 300 });
        } else if (id?.startsWith('go:')) navigate(id.slice(3), papi);
      },

      key(e, win, papi) {
        if (st.addrFocus) { addrKey(e, papi); return; }
        if (e.key === 'F5') { refresh(papi); return; }
        if (e.key === 'F6' || (e.ctrlKey && (e.key === 'l' || e.key === 'L'))) { focusAddress(); return; }
        if (e.key === 'Escape' && st.net) { stop(); return; }
        if (e.key === 'Backspace' && st.guest.field === 0 && st.search === '') { back(papi); return; }
        // guestbook / search typing
        const page = st.page;
        if (page?.blocks.some((b) => b.t === 'guestform')) {
          const f = st.guest.field === 0 ? 'name' : 'msg';
          if (e.key === 'Backspace') st.guest[f] = st.guest[f].slice(0, -1);
          else if (e.key === 'Tab') st.guest.field = 1 - st.guest.field;
          else if (e.key === 'Enter') submitGuest(papi);
          else if (e.key.length === 1) st.guest[f] += e.key;
        } else if (page?.blocks.some((b) => b.t === 'searchbox')) {
          if (e.key === 'Backspace') st.search = st.search.slice(0, -1);
          else if (e.key === 'Enter') { papi.sound('click'); navigate('altavista', papi); }
          else if (e.key.length === 1) st.search += e.key;
        }
        if (e.key === 'ArrowDown') st.scroll += 24;
        if (e.key === 'ArrowUp') st.scroll = Math.max(0, st.scroll - 24);
        if (e.key === 'PageDown') st.scroll += 180;
        if (e.key === 'PageUp') st.scroll = Math.max(0, st.scroll - 180);
      },

      draw(ctx, r, win, papi) { render(ctx, r, win, papi); },
      mouse(type, x, y, btn, win, papi) { handleMouse(type, x, y, btn, win, papi); },
    };

    function submitGuest(papi) {
      if (!st.guest.name.trim()) {
        papi.messageBox('Guestbook', 'Please enter your name.', { icon: 'warn' });
        return;
      }
      papi.messageBox('CGI Error',
        'Error 500: Internal Server Error\n\n/cgi-bin/guestbook.pl: Permission denied.\n\n(It has been broken since June.)',
        { icon: 'error', w: 320 });
      st.guest.name = ''; st.guest.msg = '';
    }

    // ── address parsing ──────────────────────────────────────
    const isUrl = (s) => /^https?:\/\//i.test(String(s ?? ''));

    function normUrl(s) {
      const raw = String(s).trim();
      return isUrl(raw) ? raw : `http://${raw.replace(/^\/+/, '')}`;
    }

    /** What the address bar shows when it is not being typed into. */
    function currentUrl() {
      if (st.net) return st.net.url;
      if (st.err) return st.err.url ?? 'about:blank';
      return st.page?.url ?? 'about:blank';
    }

    /** Anything the user can type or click: local key, absolute URL, about:. */
    function openAddress(raw, papi, opts = {}) {
      const s = String(raw ?? '').trim();
      if (!s) return;
      const low = s.toLowerCase();
      if (low.startsWith('about:')) { navigate('about:', papi, opts); return; }
      if (isUrl(s)) { navigateUrl(s, papi, opts); return; }
      if (PAGES[s]) { navigate(s, papi, opts); return; }
      if (PAGES[low]) { navigate(low, papi, opts); return; }
      if (/[a-z0-9-]\.[a-z]{2,}/i.test(s) || s.includes('.')) { navigateUrl(normUrl(s), papi, opts); return; }
      // a bare word nobody has a page for: 1998 says search for it
      st.search = s;
      navigate('altavista', papi, opts);
    }

    function follow(href, papi) {
      if (!href) return;
      if (isUrl(href)) navigateUrl(href, papi);
      else navigate(href, papi);
    }

    function refresh(papi) {
      if (st.page?.remote) navigateUrl(st.page.url, papi, { push: false, fresh: true });
      else if (st.err?.retry) follow(st.err.retry, papi);
      else navigate(st.pageKey ?? 'home', papi);
    }

    // ── local pages ──────────────────────────────────────────
    function navigate(key, papi, opts = {}) {
      if (!PAGES[key]) key = '404';
      stop();
      // dial-up gate: no connection, no web
      if (papi.state.dialup.state !== 'online') {
        showOffline(PAGES[key].url, key, papi, opts.initial);
        return;
      }
      st.err = null;
      st.pending = key;
      st.pushNext = opts.push !== false;
      st.loading = 0.5 + Math.random() * 1.5;   // 56k is not fast
      st.loadTotal = st.loading;
      st.status = `Opening page ${PAGES[key].url}...`;
      st.scroll = 0;
      st.reveal = Infinity;
      papi.sound('click');
    }

    function finishLoad(papi) {
      const key = st.pending;
      st.pending = null;
      st.page = PAGES[key];
      st.pageKey = key;
      st.visited.add(key);
      st.status = 'Done';
      st.progress = 0;
      if (st.pushNext) pushHistory({ key });
      st.pushNext = true;
      papi.sound('ding', { soft: true });
    }

    // ── the real web ─────────────────────────────────────────
    const WIRE_BPS = 5120;      // 56k, near enough
    const LOAD_MIN = 0.5;
    const LOAD_MAX = 3.5;       // dial-up should be funny, not tedious

    async function navigateUrl(rawUrl, papi, opts = {}) {
      const url = normUrl(rawUrl);
      stop();
      if (papi.state.dialup.state !== 'online') {
        showOffline(url, null, papi, opts.initial);
        return;
      }
      st.err = null;
      st.scroll = 0;
      st.reveal = 0;
      st.progress = 0;
      st.status = `Opening page ${url}...`;
      papi.sound('click');

      const seq = ++st.seq;
      st.net = { phase: 'fetch', url, t: 0, dur: 1, total: 0, page: null, imgs: 0, push: opts.push !== false };

      // already been there: the page is "in the cache", so it comes back fast
      const cached = opts.fresh ? null : st.cache.get(url);
      if (cached) { beginStream(cached, url, true); return; }

      let payload = null;
      let problem = null;
      try {
        const ctrl = new AbortController();
        st.abort = ctrl;
        const res = await fetch(`/api/surf?url=${encodeURIComponent(url)}`, {
          signal: ctrl.signal, headers: { accept: 'application/json' },
        });
        const ctype = res.headers.get('content-type') || '';
        if (!ctype.includes('json')) {
          // /api/surf missing or broken — a static host with no function runtime
          problem = {
            reason: 'Cannot find server',
            note: res.status === 404
              ? 'The modem dialled out, but nothing answered. The page fetcher (/api/surf) is not responding on this host.'
              : `The page fetcher answered with ${res.status} ${res.statusText || ''} instead of a page.`,
          };
        } else {
          const json = await res.json();
          if (json?.ok) payload = json;
          else problem = { reason: json?.reason || 'The page cannot be displayed' };
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        problem = { reason: 'Cannot find server or DNS Error', note: String(err?.message ?? err).slice(0, 120) };
      }
      if (seq !== st.seq) return;   // a newer navigation won
      st.abort = null;
      if (payload) {
        if (st.cache.size > 24) st.cache.clear();
        st.cache.set(url, payload);
        beginStream(payload, url);
      } else {
        st.net = null;
        showError(url, problem.reason, problem.note, papi);
      }
    }

    /** Turn a surf payload into a page and start dribbling it in. */
    function beginStream(payload, url, cached = false) {
      const total = Math.max(0, payload.bytes || 0);        // real bytes, for the status bar
      const spent = st.net?.t ?? 0;
      const budget = cached
        ? 0.45
        : Math.min(LOAD_MAX, Math.max(LOAD_MIN, Math.max(1400, total) / WIRE_BPS));
      const page = {
        title: payload.title || payload.finalUrl || url,
        url: payload.finalUrl || url,
        bg: '#ffffff',
        blocks: payload.blocks ?? [],
        remote: true,
      };
      st.net = {
        ...st.net,
        phase: 'stream',
        t: 0,
        dur: Math.max(0.35, budget - spent),
        total,
        page,
        imgs: page.blocks.filter((b) => b.t === 'img').length,
      };
      st.reveal = 0;
    }

    function tickFetch() {
      st.progress = Math.min(0.2, st.net.t * 0.07);
      st.status = st.net.t < 0.9
        ? `Opening page ${st.net.url}...`
        : 'Web site found. Waiting for reply...';
    }

    function tickStream(papi) {
      const n = st.net;
      const f = Math.min(1, n.t / n.dur);
      st.progress = f;
      const blocks = n.page.blocks;
      st.reveal = Math.max(1, Math.ceil(f * blocks.length));
      const bytes = Math.floor(f * n.total);
      const last = blocks[Math.min(blocks.length, st.reveal) - 1];
      if (last?.t === 'img' && n.imgs > 0 && f < 1) {
        const done = blocks.slice(0, st.reveal).filter((b) => b.t === 'img').length;
        st.status = `Downloading picture ${done} of ${n.imgs}...`;
      } else {
        st.status = `${bytes.toLocaleString('en-US')} bytes transferred`;
      }
      if (f >= 1) finishStream(papi);
    }

    function finishStream(papi) {
      const n = st.net;
      st.net = null;
      st.abort = null;
      st.page = n.page;
      st.pageKey = null;
      st.reveal = Infinity;
      st.progress = 0;
      st.visited.add(n.url);
      st.visited.add(n.page.url);
      st.status = `Done · ${n.total.toLocaleString('en-US')} bytes transferred`;
      if (n.push) pushHistory({ url: n.page.url });
      papi.sound('ding', { soft: true });
    }

    /** Cancel whatever the modem is doing. */
    function stop() {
      st.seq += 1;
      try { st.abort?.abort(); } catch { /* already gone */ }
      st.abort = null;
      st.net = null;
      st.loading = 0;
      st.pending = null;
      st.progress = 0;
      st.reveal = Infinity;
    }

    // ── error pages ──────────────────────────────────────────
    function showOffline(url, key, papi, initial) {
      st.err = {
        url: url ?? 'about:blank',
        retry: key ?? url,
        reason: 'Cannot find server or DNS Error',
        note: 'The page you are looking for is currently unavailable. Your computer is not connected to the Internet.',
        bullets: [
          'Open Dial-Up Networking and connect to your service provider.',
          'Check that the phone line is plugged in and nobody is on it.',
          'Click the button below and wait about ten seconds.',
        ],
        connect: true,
      };
      st.page = null;
      st.pageKey = typeof key === 'string' ? key : null;
      st.status = 'Cannot find server';
      st.scroll = 0;
      if (!initial) papi.sound('error');
    }

    function showError(url, reason, note, papi) {
      let host = url;
      try { host = new URL(url).host; } catch { /* keep the raw string */ }
      st.err = {
        url,
        retry: url,
        reason: reason || 'The page cannot be displayed',
        note: note || `The page you are looking for is currently unavailable. The Web site ${host} might be experiencing technical difficulties, or the page may have moved.`,
        bullets: [
          'Check that the address is spelled correctly.',
          'Click Refresh, or try again later.',
          'This browser cannot display pictures, scripts or secure logins.',
        ],
        connect: false,
      };
      st.page = null;
      st.pageKey = null;
      st.scroll = 0;
      st.status = reason || 'Cannot find server';
      papi.sound('error');
    }

    // ── history ──────────────────────────────────────────────
    function pushHistory(entry) {
      const cur = st.history[st.hIndex];
      if (cur && cur.key === entry.key && cur.url === entry.url) return;
      st.history = st.history.slice(0, st.hIndex + 1);
      st.history.push(entry);
      st.hIndex = st.history.length - 1;
    }

    function goEntry(entry, papi) {
      if (!entry) return;
      if (entry.url) { navigateUrl(entry.url, papi, { push: false }); return; }
      stop();
      st.err = null;
      st.pending = entry.key;
      st.pushNext = false;
      st.loading = 0.25;
      st.loadTotal = 0.25;
      st.scroll = 0;
    }

    function back(papi) {
      if (st.hIndex > 0) { st.hIndex--; goEntry(st.history[st.hIndex], papi); }
    }
    function forward(papi) {
      if (st.hIndex < st.history.length - 1) { st.hIndex++; goEntry(st.history[st.hIndex], papi); }
    }

    // ── address bar input ────────────────────────────────────
    function focusAddress() {
      st.addrFocus = true;
      st.addr = currentUrl();
      st.addrCaret = st.addr.length;
      st.addrSel = true;
    }

    function addrKey(e, papi) {
      const k = e.key;
      const clearSel = () => {
        if (!st.addrSel) return;
        st.addr = ''; st.addrCaret = 0; st.addrSel = false;
      };
      if (k === 'Escape') { st.addrFocus = false; st.addrSel = false; return; }
      if (k === 'Enter') {
        st.addrFocus = false; st.addrSel = false;
        const typed = st.addr.trim();
        if (typed) openAddress(typed, papi);
        return;
      }
      if (k === 'Backspace') {
        if (st.addrSel) { clearSel(); return; }
        if (st.addrCaret > 0) {
          st.addr = st.addr.slice(0, st.addrCaret - 1) + st.addr.slice(st.addrCaret);
          st.addrCaret -= 1;
        }
        return;
      }
      if (k === 'Delete') {
        if (st.addrSel) { clearSel(); return; }
        st.addr = st.addr.slice(0, st.addrCaret) + st.addr.slice(st.addrCaret + 1);
        return;
      }
      if (k === 'ArrowLeft') { st.addrSel = false; st.addrCaret = Math.max(0, st.addrCaret - 1); return; }
      if (k === 'ArrowRight') { st.addrSel = false; st.addrCaret = Math.min(st.addr.length, st.addrCaret + 1); return; }
      if (k === 'Home') { st.addrSel = false; st.addrCaret = 0; return; }
      if (k === 'End') { st.addrSel = false; st.addrCaret = st.addr.length; return; }
      if (k === 'Tab') { st.addrFocus = false; st.addrSel = false; return; }
      if (k.length === 1 && !e.ctrlKey && !e.metaKey) {
        clearSel();
        st.addr = st.addr.slice(0, st.addrCaret) + k + st.addr.slice(st.addrCaret);
        st.addrCaret += 1;
      }
    }

    // ── rendering ────────────────────────────────────────────
    const TOOLBAR_H = 46;
    const STATUS_H = 18;

    function render(ctx, r, win, papi) {
      fill(ctx, r.x, r.y, r.w, r.h, C.face);

      // ── toolbar
      const btns = [
        { label: 'Back', icon: 'left', on: st.hIndex > 0 },
        { label: 'Forward', icon: 'right', on: st.hIndex < st.history.length - 1 },
        { label: 'Stop', icon: 'stop', on: st.loading > 0 || !!st.net },
        { label: 'Refresh', icon: 'refresh', on: true },
        { label: 'Home', icon: 'home', on: true },
      ];
      st.btnRects = [];
      let bx = r.x + 4;
      ctx.font = FONT.small;
      btns.forEach((b) => {
        const bw = 42;
        const hot = st.hoverBtn === b.label;
        if (hot && b.on) bevelOut(ctx, bx, r.y + 2, bw, 34);
        // glyph
        const cx = bx + bw / 2, cy = r.y + 13;
        ctx.save();
        ctx.globalAlpha = b.on ? 1 : 0.4;
        if (b.icon === 'left' || b.icon === 'right') {
          ctx.fillStyle = b.icon === 'left' ? '#1a6a2a' : '#1a6a2a';
          const d = b.icon === 'left' ? -1 : 1;
          ctx.beginPath();
          ctx.moveTo(cx + d * 7, cy); ctx.lineTo(cx - d * 2, cy - 7); ctx.lineTo(cx - d * 2, cy - 3);
          ctx.lineTo(cx - d * 8, cy - 3); ctx.lineTo(cx - d * 8, cy + 3); ctx.lineTo(cx - d * 2, cy + 3);
          ctx.lineTo(cx - d * 2, cy + 7); ctx.closePath(); ctx.fill();
        } else if (b.icon === 'stop') {
          ctx.fillStyle = '#c02020';
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            ctx.lineTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
          }
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillRect(cx - 4, cy - 1.5, 8, 3);
        } else if (b.icon === 'refresh') {
          ctx.strokeStyle = '#1a5a9a'; ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.arc(cx, cy, 6, 0.6, Math.PI * 1.7); ctx.stroke();
          ctx.fillStyle = '#1a5a9a';
          ctx.beginPath(); ctx.moveTo(cx + 6, cy - 5); ctx.lineTo(cx + 9, cy + 1); ctx.lineTo(cx + 2, cy + 0); ctx.fill();
        } else if (b.icon === 'home') {
          ctx.fillStyle = '#c08030';
          ctx.beginPath();
          ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx + 5, cy);
          ctx.lineTo(cx + 5, cy + 7); ctx.lineTo(cx - 5, cy + 7); ctx.lineTo(cx - 5, cy);
          ctx.lineTo(cx - 8, cy); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        if (b.on) text(ctx, b.label, cx, r.y + 26, { align: 'center', font: FONT.small });
        else text(ctx, b.label, cx, r.y + 26, { align: 'center', font: FONT.small, color: C.disabled });
        st.btnRects.push({ x: bx, y: r.y + 2, w: bw, h: 34, label: b.label, on: b.on });
        bx += bw;
      });

      // throbber: the spinning 'e'
      const tw = 32;
      const tx = r.x + r.w - tw - 2;
      fill(ctx, tx, r.y + 2, tw, 34, C.face);
      ctx.save();
      ctx.translate(tx + tw / 2, r.y + 17);
      if (st.loading > 0 || st.net) ctx.rotate(st.throb * 3.4);
      const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, 11);
      g.addColorStop(0, '#a8dcff'); g.addColorStop(0.6, '#2a80d0'); g.addColorStop(1, '#0a3a70');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 11, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke();
      ctx.restore();

      // ── address bar (a real, typeable field)
      const ay = r.y + 38;
      text(ctx, 'Address', r.x + 4, ay + 7, { baseline: 'middle', font: FONT.small });
      const axx = r.x + 46, aw = r.w - 50;
      fill(ctx, axx, ay, aw, 16, C.white);
      bevelIn(ctx, axx, ay, aw, 16);
      drawIcon(ctx, 'ie', axx + 2, ay + 1, 13);
      const url = st.addrFocus ? st.addr : currentUrl();
      const fieldX = axx + 18, fieldW = aw - 36;
      ctx.save();
      ctx.beginPath(); ctx.rect(axx + 17, ay + 1, aw - 34, 14); ctx.clip();
      ctx.font = FONT.small;
      // scroll the text so the caret stays visible
      const caretX = ctx.measureText(url.slice(0, st.addrCaret)).width;
      const shift = st.addrFocus ? Math.max(0, caretX - fieldW + 8) : 0;
      if (st.addrFocus && st.addrSel && url) {
        fill(ctx, fieldX - 1, ay + 2, Math.min(fieldW + 2, ctx.measureText(url).width + 2), 12, C.select);
      }
      text(ctx, url, fieldX - shift, ay + 8, {
        baseline: 'middle', font: FONT.small,
        color: st.addrFocus && st.addrSel ? C.selectText : C.text,
      });
      if (st.addrFocus && !st.addrSel && Math.floor(st.t * 2) % 2 === 0) {
        fill(ctx, fieldX + caretX - shift, ay + 2, 1, 12, '#000000');
      }
      ctx.restore();
      st.addrRect = { x: axx, y: ay, w: aw - 18, h: 16 };
      button(ctx, axx + aw - 16, ay + 1, 15, 14, null);
      arrow(ctx, axx + aw - 8.5, ay + 8, 'down');

      // ── page viewport
      const vy = ay + 20;
      const vh = r.h - (vy - r.y) - STATUS_H;
      const SB = 15;
      const shown = st.net?.phase === 'stream' ? st.net.page : st.page;
      fill(ctx, r.x + 1, vy, r.w - 2, vh, shown?.bg ?? C.white);
      bevelIn(ctx, r.x, vy - 1, r.w, vh + 1);

      const view = { x: r.x + 2, y: vy + 1, w: r.w - 4 - SB, h: vh - 2 };
      ctx.save();
      ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip();

      let contentH = 0;
      st.links = [];
      if (st.net?.phase === 'stream') {
        contentH = drawPage(ctx, view, st.net.page, papi, st.reveal);
      } else if (st.loading > 0 || st.net) {
        text(ctx, 'Opening page...', view.x + 8, view.y + 10, { color: '#444' });
      } else if (st.err) {
        contentH = drawOffline(ctx, view, papi);
      } else if (st.page) {
        contentH = drawPage(ctx, view, st.page, papi);
      }
      ctx.restore();

      st.contentH = contentH;
      st.maxScroll = Math.max(0, contentH - view.h);
      st.scroll = Math.max(0, Math.min(st.maxScroll, st.scroll));
      st.view = view;

      // scrollbar
      scrollBar(ctx, r.x + r.w - SB - 1, vy, SB, vh, st.scroll, view.h, contentH, true);

      // ── status bar
      const sy = r.y + r.h - STATUS_H;
      fill(ctx, r.x, sy, r.w, STATUS_H, C.face);
      bevelIn(ctx, r.x + 1, sy + 2, r.w * 0.6, 14);
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x + 3, sy + 2, r.w * 0.6 - 4, 14); ctx.clip();
      const hovered = st.hover >= 0 ? st.links[st.hover] : null;
      const statusMsg = hovered
        ? (isUrl(hovered.href) ? hovered.href : (PAGES[hovered.href]?.url ?? 'http://www.example.com/'))
        : st.status;
      text(ctx, statusMsg, r.x + 5, sy + 9, { baseline: 'middle', font: FONT.small });
      ctx.restore();
      // progress — driven by real bytes when we are fetching for real
      if (st.loading > 0 || st.net) {
        const px = r.x + r.w * 0.62;
        bevelIn(ctx, px, sy + 2, r.w * 0.22, 14);
        const frac = Math.max(0, Math.min(1, st.progress));
        ctx.fillStyle = C.titleA1;
        const blocks = Math.floor((r.w * 0.22 - 4) / 6 * frac);
        for (let i = 0; i < blocks; i++) ctx.fillRect(px + 2 + i * 6, sy + 4, 4, 10);
      }
      bevelIn(ctx, r.x + r.w - 76, sy + 2, 74, 14);
      const zone = papi.state.dialup.state === 'online' ? 'Internet zone' : 'Offline';
      text(ctx, zone, r.x + r.w - 72, sy + 9, { baseline: 'middle', font: FONT.small });
    }

    // "The page cannot be displayed" — offline, dead server, refused, 404
    function drawOffline(ctx, view, papi) {
      const e = st.err ?? {};
      const x = view.x + 10;
      let y = view.y + 14 - st.scroll;
      st.connectBtn = null;
      st.retryBtn = null;
      text(ctx, 'The page cannot be displayed', x, y, { font: 'bold 15px Tahoma, sans-serif', color: '#000' });
      y += 26;
      ctx.font = FONT.ui;
      wrap(ctx, e.note ?? 'The page you are looking for is currently unavailable.', view.w - 24)
        .forEach((l) => { text(ctx, l, x, y); y += 15; });
      y += 10;
      text(ctx, 'Please try the following:', x, y, { font: FONT.uiBold }); y += 20;
      (e.bullets ?? []).forEach((b) => {
        text(ctx, '•', x + 4, y);
        wrap(ctx, b, view.w - 40).forEach((l) => { text(ctx, l, x + 16, y); y += 15; });
      });
      y += 14;
      const bh = 24;
      if (e.connect) {
        button(ctx, x, y, 150, bh, 'Connect to the Internet', { font: FONT.ui });
        st.connectBtn = { x, y, w: 150, h: bh };
      } else {
        button(ctx, x, y, 90, bh, 'Try Again', { font: FONT.ui });
        st.retryBtn = { x, y, w: 90, h: bh };
      }
      y += bh + 16;
      text(ctx, e.reason ?? 'Cannot find server or DNS Error', x, y, { font: FONT.small, color: '#555' });
      y += 14;
      if (e.url) {
        ctx.font = FONT.small;
        wrap(ctx, e.url, view.w - 24).forEach((l) => { text(ctx, l, x, y, { font: FONT.small, color: '#555' }); y += 13; });
      }
      text(ctx, 'Internet Explorer', x, y, { font: FONT.small, color: '#555' });
      return y - view.y + st.scroll + 20;
    }

    const SERIF = '12px "Times New Roman", Georgia, serif';
    let curView = null;   // viewport of the page being drawn, for off-screen culling

    // Text layout is memoised per block: a fetched page can be a few hundred
    // blocks and this canvas is redrawn every frame.
    const layouts = new WeakMap();
    function memo(block, key, build) {
      let e = layouts.get(block);
      if (!e || e.key !== key) { e = { key, data: build() }; layouts.set(block, e); }
      return e.data;
    }

    function wrapMemo(ctx, block, str, maxW, font) {
      return memo(block, `w|${maxW}|${font}|${str.length}`, () => {
        ctx.font = font;
        return wrap(ctx, str, maxW);
      });
    }

    // stripping tags leaves gaps like "text [ 5 ] ." — glue those back up
    const TIGHT_BEFORE = /^[.,;:!?)\]}%»…]/;
    const TIGHT_AFTER = /[([{«]$/;

    /** Word-positions for a run of styled spans: [{ text }, { text, href }]. */
    function richLayout(ctx, spans, maxW, font) {
      ctx.font = font;
      const sp = ctx.measureText(' ').width;
      const words = [];
      let cx = 0, line = 0, prev = '';
      for (const run of spans) {
        for (const word of String(run.text).split(/\s+/)) {
          if (!word) continue;
          const ww = ctx.measureText(word).width;
          const tight = TIGHT_BEFORE.test(word) || TIGHT_AFTER.test(prev);
          prev = word;
          if (tight && cx > 0) { /* no space */ }
          else if (cx > 0 && cx + sp + ww > maxW) { cx = 0; line += 1; }
          else if (cx > 0) cx += sp;
          words.push({ text: word, x: cx, line, w: ww, href: run.href ?? null });
          cx += ww;
        }
      }
      return { words, lines: line + 1 };
    }

    /**
     * Draw styled spans with word wrap, underlining and hit-testing the link
     * runs as it goes. This is how a fetched page keeps its links inline
     * instead of dumping them in a list at the bottom.
     */
    function drawRich(ctx, block, spans, x, y, maxW, { font = SERIF, color = '#000', lh = 15, pushLink }) {
      const L = memo(block, `r|${maxW}|${font}`, () => richLayout(ctx, spans, maxW, font));
      const top = curView ? curView.y - lh : -1e9;
      const bot = curView ? curView.y + curView.h : 1e9;
      for (const w of L.words) {
        const wy = y + w.line * lh;
        if (wy < top || wy > bot) continue;
        const col = w.href ? (st.visited.has(w.href) ? VISITED : LINK) : color;
        text(ctx, w.text, x + w.x, wy, { font, color: col });
        if (w.href) {
          fill(ctx, x + w.x, wy + lh - 3, w.w, 1, col);
          pushLink?.(w.href, x + w.x, wy, w.w, lh - 2);
        }
      }
      return y + L.lines * lh;
    }

    function drawPage(ctx, view, page, papi, limit = Infinity) {
      const M = 12;
      const x = view.x + M;
      const maxW = view.w - M * 2;
      let y = view.y + 10 - st.scroll;
      const fg = page.fg ?? '#000000';
      st.links = [];
      curView = view;

      const pushLink = (href, lx, ly, lw, lh, label) => {
        st.links.push({ href, x: lx, y: ly, w: lw, h: lh, label });
      };

      let drawn = 0;
      for (const b of page.blocks) {
        if (drawn >= limit) break;
        drawn += 1;
        switch (b.t) {
          case 'h1':
            ctx.font = 'bold 19px "Times New Roman", Georgia, serif';
            text(ctx, b.text, x, y, { font: 'bold 19px "Times New Roman", Georgia, serif', color: b.color ?? fg });
            y += 26;
            break;
          case 'h2':
            text(ctx, b.text, x, y, { font: 'bold 14px "Times New Roman", Georgia, serif', color: b.color ?? fg });
            y += 20;
            break;
          case 'p': {
            const px = x + (b.indent ? 16 : 0);
            const pw = maxW - (b.indent ? 20 : 0);
            const y0 = y;
            if (b.spans) {
              y = drawRich(ctx, b, b.spans, px, y, pw, { color: fg, pushLink });
            } else {
              wrapMemo(ctx, b, b.text, pw, SERIF).forEach((l) => {
                if (y > view.y - 16 && y < view.y + view.h) text(ctx, l, px, y, { font: SERIF, color: fg });
                y += 15;
              });
            }
            if (b.indent) fill(ctx, x + 4, y0, 2, Math.max(4, y - y0 - 2), '#a0a0a0');
            y += 6;
            break;
          }
          case 'small':
            ctx.font = FONT.small;
            wrap(ctx, b.text, maxW).forEach((l) => {
              text(ctx, l, x, y, { font: FONT.small, color: page.fg ? '#8898c8' : '#555555' });
              y += 13;
            });
            y += 4;
            break;
          case 'hr':
            fill(ctx, x, y + 3, maxW, 1, '#808080');
            fill(ctx, x, y + 4, maxW, 1, '#ffffff');
            y += 12;
            break;
          case 'space':
            y += b.h;
            break;
          case 'ul':
            ctx.font = SERIF;
            b.items.forEach((it) => {
              ctx.fillStyle = fg;
              ctx.beginPath(); ctx.arc(x + 6, y + 6, 2.4, 0, Math.PI * 2); ctx.fill();
              if (it && it.spans) {
                y = drawRich(ctx, it, it.spans, x + 16, y, maxW - 20, { color: fg, pushLink });
              } else {
                ctx.font = SERIF;
                wrap(ctx, it.text ?? it, maxW - 20).forEach((l) => {
                  text(ctx, l, x + 16, y, { font: SERIF, color: fg });
                  y += 15;
                });
              }
            });
            y += 6;
            break;
          case 'links':
            ctx.font = '12px "Times New Roman", Georgia, serif';
            b.items.forEach((it) => {
              const visited = st.visited.has(it.href);
              const col = visited ? VISITED : LINK;
              const tw = ctx.measureText(it.text).width;
              text(ctx, it.text, x + 4, y, { font: '12px "Times New Roman", Georgia, serif', color: col });
              fill(ctx, x + 4, y + 13, tw, 1, col);
              pushLink(it.href, x + 4, y, tw, 14);
              y += 18;
            });
            y += 4;
            break;
          case 'marquee': {
            const h = 18;
            fill(ctx, x, y, maxW, h, '#000080');
            ctx.save();
            ctx.beginPath(); ctx.rect(x, y, maxW, h); ctx.clip();
            ctx.font = 'bold 12px Tahoma, sans-serif';
            const tw = ctx.measureText(b.text).width;
            const off = (st.t * 60) % (tw || 1);
            for (let i = 0; i < Math.ceil(maxW / tw) + 1; i++) {
              text(ctx, b.text, x + maxW - off + i * tw, y + h / 2, {
                baseline: 'middle', font: 'bold 12px Tahoma, sans-serif', color: '#ffff00',
              });
            }
            ctx.restore();
            y += h + 4;
            break;
          }
          case 'img': {
            if (!b.draw) {
              // fetched pages never carry bitmaps — draw IE's broken-image box
              const iw = Math.min(maxW, 240), ih = 30;
              fill(ctx, x, y, iw, ih, '#ffffff');
              ctx.strokeStyle = '#909090'; ctx.lineWidth = 1;
              ctx.strokeRect(x + 0.5, y + 0.5, iw - 1, ih - 1);
              fill(ctx, x + 6, y + 8, 13, 15, '#f0f0f0');
              ctx.strokeStyle = '#606060'; ctx.strokeRect(x + 6.5, y + 8.5, 12, 14);
              ctx.strokeStyle = '#c02020'; ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.moveTo(x + 9, y + 11); ctx.lineTo(x + 16, y + 20);
              ctx.moveTo(x + 16, y + 11); ctx.lineTo(x + 9, y + 20);
              ctx.stroke();
              ctx.save();
              ctx.beginPath(); ctx.rect(x + 24, y, iw - 28, ih); ctx.clip();
              text(ctx, b.alt || '(image)', x + 26, y + 15, {
                baseline: 'middle', font: FONT.small, color: '#606060',
              });
              ctx.restore();
              y += ih + 6;
              break;
            }
            const iw = b.w ?? maxW, ih = b.h ?? 60;
            b.draw(ctx, x, y, iw, ih, st.t);
            y += ih + 6;
            break;
          }
          case 'pre': {
            const lines = b.lines ?? [];
            const h = lines.length * 13 + 8;
            fill(ctx, x, y, maxW, h, '#f4f4f4');
            ctx.strokeStyle = '#a0a0a0'; ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, maxW - 1, h - 1);
            ctx.save();
            ctx.beginPath(); ctx.rect(x, y, maxW, h); ctx.clip();
            lines.forEach((l, i) => {
              text(ctx, l, x + 5, y + 5 + i * 13, { font: FONT.monoSmall, color: '#202020' });
            });
            ctx.restore();
            y += h + 8;
            break;
          }
          case 'trow': {
            const cells = b.cells ?? [];
            const n = Math.max(1, cells.length);
            const cw = maxW / n;
            ctx.font = b.head ? FONT.uiBold : FONT.ui;
            const wrapped = cells.map((c) => wrap(ctx, c, cw - 8));
            const rows = Math.max(1, ...wrapped.map((w) => w.length));
            const h = rows * 13 + 6;
            fill(ctx, x, y, maxW, h, b.head ? '#e4e4e4' : '#fafafa');
            ctx.strokeStyle = '#b0b0b0'; ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, maxW - 1, h - 1);
            wrapped.forEach((ls, i) => {
              if (i > 0) fill(ctx, x + i * cw, y + 1, 1, h - 2, '#b0b0b0');
              ls.forEach((l, j) => {
                text(ctx, l, x + i * cw + 4, y + 3 + j * 13, {
                  font: b.head ? FONT.uiBold : FONT.ui, color: fg,
                });
              });
            });
            y += h + 2;
            break;
          }
          case 'row': {
            // image on the left, paragraph beside it
            const img = b.items.find((i) => i.t === 'img');
            const par = b.items.find((i) => i.t === 'p');
            const iw = img?.w ?? 90, ih = img?.h ?? 90;
            img?.draw(ctx, x, y, iw, ih, st.t);
            ctx.font = '12px "Times New Roman", Georgia, serif';
            let ty = y;
            wrap(ctx, par.text, maxW - iw - 12).forEach((l) => {
              text(ctx, l, x + iw + 12, ty, { font: '12px "Times New Roman", Georgia, serif', color: fg });
              ty += 15;
            });
            y += Math.max(ih, ty - y) + 8;
            break;
          }
          case 'project': {
            const h = 62;
            fill(ctx, x, y, maxW, h, '#ffffff');
            ctx.strokeStyle = '#909090'; ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, maxW - 1, h - 1);
            art.screenshot(b.seed, b.name)(ctx, x + 4, y + 4, 76, h - 8);
            text(ctx, b.name, x + 88, y + 8, { font: 'bold 13px Tahoma, sans-serif', color: '#102a6a' });
            const tagW = ctx.measureText(b.tag).width + 8;
            ctx.font = FONT.small;
            fill(ctx, x + maxW - tagW - 6, y + 8, tagW, 13, '#dde4f4');
            text(ctx, b.tag, x + maxW - tagW - 2, y + 14, { font: FONT.small, baseline: 'middle', color: '#3a4a7a' });
            ctx.font = FONT.ui;
            let dy = y + 26;
            wrap(ctx, b.desc, maxW - 96).forEach((l) => { text(ctx, l, x + 88, dy, { font: FONT.ui }); dy += 14; });
            y += h + 8;
            break;
          }
          case 'result': {
            const tw = ctx.measureText(b.title).width;
            text(ctx, b.title, x, y, { font: 'bold 12px Tahoma, sans-serif', color: LINK });
            ctx.font = 'bold 12px Tahoma, sans-serif';
            fill(ctx, x, y + 13, ctx.measureText(b.title).width, 1, LINK);
            pushLink(b.href, x, y, ctx.measureText(b.title).width, 14);
            y += 16;
            ctx.font = FONT.small;
            wrap(ctx, b.desc, maxW).forEach((l) => { text(ctx, l, x, y, { font: FONT.small }); y += 13; });
            text(ctx, b.url, x, y, { font: FONT.small, color: '#0a7a2a' });
            y += 20;
            break;
          }
          case 'entry': {
            fill(ctx, x, y, maxW, 44, '#fffbe8');
            ctx.strokeStyle = '#c8b880'; ctx.strokeRect(x + 0.5, y + 0.5, maxW - 1, 43);
            text(ctx, b.who, x + 6, y + 6, { font: FONT.uiBold, color: '#6a4a10' });
            text(ctx, b.when, x + maxW - 6, y + 6, { font: FONT.small, align: 'right', color: '#8a7a50' });
            ctx.font = FONT.ui;
            let ey = y + 22;
            wrap(ctx, b.msg, maxW - 12).forEach((l) => { text(ctx, l, x + 6, ey); ey += 13; });
            y += 50;
            break;
          }
          case 'counter': {
            text(ctx, 'You are visitor number', x, y + 4, { font: FONT.ui, color: fg });
            ctx.font = 'bold 13px "Courier New", monospace';
            let cx = x + 122;
            const digits = String(b.n + Math.floor(st.t / 9)).padStart(6, '0');
            for (const d of digits) {
              fill(ctx, cx, y, 12, 18, '#000000');
              text(ctx, d, cx + 6, y + 9, {
                align: 'center', baseline: 'middle', color: '#00ff40',
                font: 'bold 13px "Courier New", monospace',
              });
              cx += 13;
            }
            y += 26;
            break;
          }
          case 'buttons': {
            let bx2 = x;
            b.items.forEach((drawBadge) => {
              if (bx2 + 88 > x + maxW) { bx2 = x; y += 35; }
              drawBadge(ctx, bx2, y, 88, 31);
              bx2 += 92;
            });
            y += 38;
            break;
          }
          case 'searchbox': {
            y += 6;
            fill(ctx, x, y, maxW - 70, 20, '#ffffff');
            bevelIn(ctx, x, y, maxW - 70, 20);
            text(ctx, st.search || '', x + 5, y + 10, { baseline: 'middle', font: FONT.ui });
            if (Math.floor(st.t * 2) % 2 === 0) {
              ctx.font = FONT.ui;
              const cw = ctx.measureText(st.search).width;
              fill(ctx, x + 6 + cw, y + 4, 1, 12, '#000');
            }
            button(ctx, x + maxW - 64, y, 62, 20, 'Search');
            st.searchBtn = { x: x + maxW - 64, y, w: 62, h: 20 };
            y += 30;
            break;
          }
          case 'guestform': {
            text(ctx, 'Your name:', x, y + 4, { font: FONT.ui });
            fill(ctx, x + 70, y, 160, 18, '#ffffff');
            bevelIn(ctx, x + 70, y, 160, 18);
            text(ctx, st.guest.name, x + 74, y + 9, { baseline: 'middle', font: FONT.ui });
            if (st.guest.field === 0 && Math.floor(st.t * 2) % 2 === 0) {
              ctx.font = FONT.ui;
              fill(ctx, x + 75 + ctx.measureText(st.guest.name).width, y + 3, 1, 12, '#000');
            }
            st.nameField = { x: x + 70, y, w: 160, h: 18 };
            y += 24;
            text(ctx, 'Message:', x, y + 4, { font: FONT.ui });
            fill(ctx, x + 70, y, maxW - 70, 52, '#ffffff');
            bevelIn(ctx, x + 70, y, maxW - 70, 52);
            ctx.font = FONT.ui;
            wrap(ctx, st.guest.msg, maxW - 82).slice(0, 3).forEach((l, i) => {
              text(ctx, l, x + 74, y + 5 + i * 14, { font: FONT.ui });
            });
            if (st.guest.field === 1 && Math.floor(st.t * 2) % 2 === 0) {
              const ls = wrap(ctx, st.guest.msg, maxW - 82);
              const last = ls[ls.length - 1] ?? '';
              fill(ctx, x + 75 + ctx.measureText(last).width, y + 4 + Math.max(0, ls.length - 1) * 14, 1, 12, '#000');
            }
            st.msgField = { x: x + 70, y, w: maxW - 70, h: 52 };
            y += 58;
            button(ctx, x + 70, y, 70, 22, 'Sign it!');
            st.signBtn = { x: x + 70, y, w: 70, h: 22 };
            y += 30;
            break;
          }
          default: break;
        }
      }
      return y - view.y + st.scroll + 16;
    }

    function handleMouse(type, x, y, btn, win, papi) {
      // coordinates are content-relative; convert to absolute
      const b = win.maximized ? { x: 0, y: 0 } : { x: win.x, y: win.y };
      const off = win.app.menus ? 40 : 22;
      const ax = x + b.x + 3;
      const ay = y + b.y + off;

      if (type === 'move') {
        st.hoverBtn = null;
        for (const r of st.btnRects ?? []) {
          if (ax >= r.x && ax <= r.x + r.w && ay >= r.y && ay <= r.y + r.h) st.hoverBtn = r.label;
        }
        st.hover = (st.links ?? []).findIndex((l) =>
          ax >= l.x && ax <= l.x + l.w && ay >= l.y - 2 && ay <= l.y + l.h);
        return;
      }
      if (type !== 'down' && type !== 'dblclick') return;

      // toolbar
      for (const r of st.btnRects ?? []) {
        if (ax >= r.x && ax <= r.x + r.w && ay >= r.y && ay <= r.y + r.h) {
          if (!r.on) return;
          st.addrFocus = false;
          if (r.label === 'Back') back(papi);
          else if (r.label === 'Forward') forward(papi);
          else if (r.label === 'Stop') { stop(); st.status = 'Stopped'; }
          else if (r.label === 'Refresh') refresh(papi);
          else if (r.label === 'Home') navigate('home', papi);
          papi.sound('click');
          return;
        }
      }

      // address bar: click to type in it
      const ar = st.addrRect;
      if (ar && ax >= ar.x && ax <= ar.x + ar.w + 18 && ay >= ar.y && ay <= ar.y + ar.h) {
        if (!st.addrFocus) focusAddress();
        else {
          // second click drops the selection and puts a caret roughly where you clicked
          st.addrSel = false;
          st.addrCaret = st.addr.length;
        }
        papi.sound('click');
        return;
      }
      st.addrFocus = false;

      // scrollbar
      const SB = 15;
      const view = st.view;
      if (view && ax >= view.x + view.w + 2) {
        const sbY = view.y - 1, sbH = view.h + 2;
        if (ay >= sbY && ay <= sbY + sbH) {
          if (ay < sbY + 15) st.scroll = Math.max(0, st.scroll - 32);
          else if (ay > sbY + sbH - 15) st.scroll = Math.min(st.maxScroll, st.scroll + 32);
          else {
            const frac = (ay - sbY - 15) / Math.max(1, sbH - 30);
            st.scroll = frac * st.maxScroll;
          }
          return;
        }
      }

      const hitRect = (r) => r && ax >= r.x && ax <= r.x + r.w && ay >= r.y && ay <= r.y + r.h;

      // error page buttons
      if (st.err && hitRect(st.connectBtn)) { papi.open('dialup'); return; }
      if (st.err && hitRect(st.retryBtn)) { refresh(papi); return; }

      // form widgets
      if (hitRect(st.nameField)) { st.guest.field = 0; return; }
      if (hitRect(st.msgField)) { st.guest.field = 1; return; }
      if (hitRect(st.signBtn)) { submitGuest(papi); return; }
      if (hitRect(st.searchBtn)) { papi.sound('click'); navigate('altavista', papi); return; }

      // links — local page keys and absolute URLs both live in here
      const link = (st.links ?? []).find((l) =>
        ax >= l.x && ax <= l.x + l.w && ay >= l.y - 2 && ay <= l.y + l.h);
      if (link) follow(link.href, papi);
    }

    return app;
  },
};

export { PAGES };
