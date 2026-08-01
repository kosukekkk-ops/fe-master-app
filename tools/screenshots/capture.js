/* capture.js — ヘッドレスChromeをCDPで駆動し、アプリ画面を1290x2796で撮る。
 *
 * --screenshot フラグは撮影タイミングを制御できず(loadを遅らせても初期状態が写る)、
 * --virtual-time-budget は新headlessでは無視される。よってCDPで
 * 「_shot.jsがdocument.titleをSHOT-READYにするまで待ってから撮る」方式にしている。
 * 静的サーバを同一プロセスで持つので、Chromeの起動・待機はすべて非同期で行うこと。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, 'site');
const OUT = path.join(__dirname, 'out');
const PORT = 8791;
const CDP_PORT = 9333;
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const SHOTS = process.argv[2] ? process.argv[2].split(',') : ['home', 'quiz', 'exp', 'flash', 'stats'];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
               '.webmanifest': 'application/manifest+json' };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/_hold.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('/*noop*/'); }
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    // プロファイルを使い回すので、Chromeに古い_shot.jsを掴ませないよう毎回取り直させる
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
  }).on('error', reject);
});

/** CDPの1接続分のラッパ。id採番とレスポンス待ちだけを面倒みる。 */
function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const myId = ++id;
    pending.set(myId, (m) => m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result));
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--user-data-dir=' + path.join(__dirname, 'profile'),
    '--remote-debugging-port=' + CDP_PORT,
    'about:blank'
  ], { stdio: 'ignore' });

  // DevTools エンドポイントが上がるまで待つ
  for (let i = 0; i < 60; i++) {
    try { await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`); break; } catch { await sleep(500); }
  }

  // 新しめのChromeは /json/new をGETで受け付けないため、起動時のタブを使い回す
  const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const tab = targets.find(t => t.type === 'page');

  for (const shot of SHOTS) {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    const send = cdp(ws);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',
      { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await send('Page.navigate', { url: `http://localhost:${PORT}/index.html?shot=${shot}` });

    // _shot.js が目的の画面まで進めたら title を SHOT-READY にする
    let ready = false;
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      const r = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
      if (r.result.value === 'SHOT-READY') { ready = true; break; }
    }
    await sleep(600);   // 最後のトランジション分だけ余裕を見る

    const shotRes = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const out = path.join(OUT, shot + '.png');
    fs.writeFileSync(out, Buffer.from(shotRes.data, 'base64'));
    console.log(shot, ready ? 'ready' : 'TIMEOUT', Math.round(fs.statSync(out).size / 1024) + 'KB');

    ws.close();
  }

  chrome.kill('SIGKILL');
  server.close();
  process.exit(0);
}

server.listen(PORT, () => main().catch(e => { console.error('FATAL', e.message); process.exit(1); }));
