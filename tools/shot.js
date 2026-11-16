// Headless smoke test: node tools/shot.js <out.png> [script-to-eval] ; serves the folder, loads the game, screenshots.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = process.argv[2] || 'shot.png', W = +(process.env.W || 960), H = +(process.env.H || 540);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = http.createServer((q, s) => { let p = q.url.split('?')[0]; if (p === '/') { s.writeHead(200, { 'content-type': 'text/html' }); return s.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + fs.readFileSync(path.join(root, 'index.html'), 'utf8') + '</body></html>'); } const f = path.join(root, p); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(fs.readFileSync(f)); });
srv.listen(0, async () => {
  const port = srv.address().port, b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH });
  const page = await ctx.newPage(); const logs = []; await page.addInitScript((q) => { try { if (q !== 'auto') localStorage.setItem('bd.quality', q); } catch (e) {} }, process.env.Q || '0');   // Q=auto: leave the graphics level unset
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text())); page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.route('**/three.min.js', (r) => r.fulfill({ path: path.join(root, 'node_modules/three/build/three.min.js'), contentType: 'text/javascript' }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  const t0 = Date.now(); await page.goto('http://localhost:' + port + '/');
  try { await page.waitForFunction(() => !document.getElementById('bDrive').disabled || /could not|cannot/i.test(document.getElementById('loadText').textContent), null, { timeout: 150000 }); } catch (e) { logs.push('TIMEOUT waiting for load'); }
  logs.push('load text: ' + await page.evaluate(() => document.getElementById('loadText').textContent));
  logs.push('loaded in ' + (Date.now() - t0) + ' ms');
  const steps = process.argv.slice(3);
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (st.startsWith('wait:')) await page.waitForTimeout(+st.slice(5));
    else if (st.startsWith('shot:')) await page.screenshot({ path: st.slice(5), timeout: 180000 }).catch((e) => logs.push('SHOT FAIL ' + e.message.split('\n')[0]));
    else if (st.startsWith('key:')) { const [k, ms] = st.slice(4).split(','); await page.keyboard.down(k); await page.waitForTimeout(+ms || 50); await page.keyboard.up(k); }
    else if (st.startsWith('down:')) await page.keyboard.down(st.slice(5));
    else if (st.startsWith('up:')) await page.keyboard.up(st.slice(3));
    else if (st.startsWith('click:')) await page.click(st.slice(6), { timeout: 8000 }).catch((e) => logs.push('CLICK FAIL ' + st + ' ' + e.message.split('\n')[0]));
    else if (st.startsWith('mouse:')) { const [x, y] = st.slice(6).split(',').map(Number); await page.mouse.click(x, y); }
    else { const r = await page.evaluate(st).catch((e) => 'EVAL ERROR ' + e.message); if (r !== undefined) logs.push('eval> ' + JSON.stringify(r)); }
  }
  console.log(logs.join('\n')); await page.waitForTimeout(600); await page.screenshot({ path: out, timeout: 180000 }).catch((e) => console.log('SHOT FAIL ' + e.message.split('\n')[0])); await b.close(); srv.close();
});
