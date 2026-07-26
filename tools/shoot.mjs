// Screenshot harness — boots the built site in headless Chrome with
// software WebGL and grabs a set of views so the render can be checked
// without a display.
//
//   node tools/shoot.mjs [outdir]
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { mkdirSync } from 'fs';

const OUT = process.argv[2] || '/tmp/claude-1000/-home-claude/56dc6218-4a75-4b20-a27a-104d2182a216/scratchpad/shots';
mkdirSync(OUT, { recursive: true });

// yaw 0 = looking down -Z (at the desk); +yaw turns left
const VIEWS = [
  { name: '01-entry',      args: [-0.75, 1.585, 1.95, 0.10, -0.06] },
  { name: '02-desk',       args: [0.35, 1.585, -0.85, 0.02, -0.20] },
  { name: '03-bed',        args: [0.05, 1.585, 1.05, -Math.PI / 2 - 0.15, -0.14] },
  { name: '04-pug',        args: [-0.30, 1.585, 1.55, 0.02, -0.52] },
  { name: '05-window',     args: [0.55, 1.585, 0.35, Math.PI / 2, -0.04] },
  { name: '06-crt-close',  args: [0.26, 1.585, -1.30, 0.02, -0.26] },
  { name: '07-corner',     args: [1.75, 1.585, -1.55, -Math.PI * 0.72, -0.06] },
  { name: '08-bookcase',   args: [-1.05, 1.585, 1.15, Math.PI / 2 + 0.35, -0.12] },
  { name: '11-wide',       args: [1.85, 1.585, 2.15, 0.62, -0.10] },
];

// hmr/watch off: an edit landing mid-run reloads the page and blows away
// window.__room half way through the shot list.
const server = await createServer({
  root: process.cwd(),
  server: { port: 5199, strictPort: false, hmr: false, watch: null },
});
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('serving', url);

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-webgl', '--ignore-gpu-blocklist',
    '--window-size=1280,800',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') errors.push(`[${t}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));

console.log('loading…');
await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });

try {
  await page.waitForFunction('window.__room && window.__room.ready', { timeout: 180000 });
} catch (e) {
  console.log('[fatal] scene never became ready');
  const txt = await page.evaluate(() => ({
    log: document.getElementById('loader-log')?.innerText ?? '',
    task: document.getElementById('loader-task')?.textContent ?? '',
  }));
  console.log('loader task:', txt.task);
  console.log('loader log:\n' + txt.log);
  console.log('─── console ───\n' + [...new Set(errors)].slice(0, 20).join('\n'));
  await page.screenshot({ path: `${OUT}/00-failed.png` });
  await browser.close();
  await server.close();
  process.exit(1);
}

// dismiss the start card and let a few frames settle
await page.evaluate(() => {
  for (const id of ['start', 'loader', 'hint', 'crosshair', 'prompt']) {
    const e = document.getElementById(id);
    if (e) e.style.display = 'none';
  }
});
await new Promise((r) => setTimeout(r, 2500));

for (const v of VIEWS) {
  await page.evaluate((a) => window.__room.look(...a), v.args);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${OUT}/${v.name}.png` });
  console.log('shot', v.name);
}

// a close pass on the monitor before sitting down
await page.evaluate(() => {
  const R = window.__room;
  R.player.enabled = true; R.player.locked = false;
  R.camera.position.set(0.30, 1.05, -1.45);
  R.camera.rotation.set(0, 0, 0);
  R.camera.updateMatrixWorld();
  R.player.enabled = false;      // stop the controller stomping the camera
});
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: `${OUT}/12-monitor.png` });
console.log('shot 12-monitor');

// and the dog
await page.evaluate(() => {
  const R = window.__room;
  R.camera.position.set(-0.30, 0.55, 1.35);
  R.camera.rotation.set(0, 0, 0);
  R.camera.rotateY(0.05); R.camera.rotateX(-0.12);
  R.camera.updateMatrixWorld();
});
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: `${OUT}/13-pug.png` });
console.log('shot 13-pug');

// Sit down at the machine. The dolly is time-based and this software
// rasteriser runs at well under 1 fps, so snap to the end of the move
// rather than waiting a minute of wall clock for it.
console.log('sit ->', JSON.stringify(await page.evaluate(() => {
  const R = window.__room;
  R.player.enabled = true;
  R.interaction.mode = 'walk';
  R.interaction._enterCRT();
  R.camera.position.copy(R.interaction.to.pos);
  R.camera.quaternion.copy(R.interaction.to.quat);
  R.interaction.mode = 'inCRT';
  R.interaction.blend = 1;
  return { cam: R.camera.position.toArray().map((n) => +n.toFixed(2)) };
})));
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: `${OUT}/09-crt-seated.png` });
console.log('shot 09-crt-seated');

// let the OS finish booting and open the browser app
await new Promise((r) => setTimeout(r, 12000));
await page.screenshot({ path: `${OUT}/10-crt-desktop.png` });
console.log('shot 10-crt-desktop');

// Jump the OS straight to the desktop — booting is time-based and this
// renderer is far too slow to wait it out — then open a few apps.
await page.evaluate(() => {
  const os = window.__room.desktop.os;
  os.state.phase = 'desktop';
  os.state.phaseT = 0;
  os.api.open('browser', 'home', { x: 40, y: 14 });
});
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: `${OUT}/14-os-browser.png` });
console.log('shot 14-os-browser');

await page.evaluate(() => {
  const os = window.__room.desktop.os;
  os.state.windows = [];
  os.api.open('dialup', null, { x: 150, y: 60 });
  os.api.connect();
});
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${OUT}/15-os-dialup.png` });
console.log('shot 15-os-dialup');

await page.evaluate(() => {
  const os = window.__room.desktop.os;
  os.state.windows = [];
  os.api.open('minesweeper', null, { x: 60, y: 40 });
  os.api.open('notepad', 'readme', { x: 250, y: 90 });
  os.state.startOpen = true;
  os.state.startHover = 0;
  os.state.startSub = 0;
});
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${OUT}/16-os-apps.png` });
console.log('shot 16-os-apps');

const info = await page.evaluate(() => ({
  tris: window.__room.renderer.info.render.triangles,
  calls: window.__room.renderer.info.render.calls,
  progs: window.__room.renderer.info.programs?.length,
  mem: window.__room.renderer.info.memory,
  osPhase: window.__room.desktop.os.phase,
}));
console.log('\nrender info:', JSON.stringify(info));

if (errors.length) {
  console.log('\n─── console output ───');
  console.log([...new Set(errors)].slice(0, 40).join('\n'));
} else {
  console.log('\nno console errors');
}

await browser.close();
await server.close();
