import puppeteer from 'puppeteer';
const URL = process.argv[2];
const OUT = '/tmp/claude-1000/-home-claude/56dc6218-4a75-4b20-a27a-104d2182a216/scratchpad/shots';
const browser = await puppeteer.launch({ headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0,160)); });
page.on('requestfailed', r => errs.push('reqfail: ' + r.url().slice(0,120)));
const t0 = Date.now();
const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
console.log('HTTP', resp.status(), 'in', Date.now() - t0, 'ms');
try {
  await page.waitForFunction('window.__room && window.__room.ready', { timeout: 240000 });
  console.log('scene ready in', ((Date.now() - t0)/1000).toFixed(1), 's');
} catch (e) { console.log('NOT READY'); }
await page.screenshot({ path: `${OUT}/live-start.png` });
await page.evaluate(() => {
  document.getElementById('start-btn')?.click();
  const R = window.__room;
  if (R) R.look(-0.75, 1.585, 1.9, 0.10, -0.06);
});
await new Promise(r => setTimeout(r, 4000));
await page.screenshot({ path: `${OUT}/live-room.png` });
console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].slice(0,10).join('\n') : 'no errors');
await browser.close();
