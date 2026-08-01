/* compose.js — 端末キャプチャにApp Store掲載用のコピーを載せて1290x2796に仕上げる */
const sharp = require('C:/Users/kosuk/Claude/fe-master-app/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'out');
const DST = path.join(__dirname, 'store');

const W = 1290, H = 2796;
const CANVAS = '#E4DDD0';        // 端末の背景(#FAF8F5)と差がつく、少し沈めた砂色
const INK = '#1C1A17';
const ACCENT = '#3B6BC4';
const FONT = 'Yu Gothic UI, Yu Gothic, Meiryo, sans-serif';

// 端末画像の配置(全体が収まるサイズ。切り落とさない)
const DW = 1045, DH = Math.round(H * DW / W), DX = Math.round((W - DW) / 2), DY = 420, RADIUS = 118;

const SHEETS = [
  { src: 'quiz',  l1: '科目A・科目B対応',   l2: '2,400問以上を収録' },
  { src: 'exp',   l1: '答え合わせで終わらない', l2: '全問に、丁寧な解説' },
  { src: 'flash', l1: '間違えた問題が',     l2: 'そのまま単語帳に' },
  { src: 'stats', l1: '弱点が、数字で見える', l2: '分野別の正答率を記録' },
  { src: 'home',  l1: '毎日つづく仕組み',   l2: '連続学習日数と今日の目標' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function build(sheet, index) {
  const caption = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${W}" height="${H}" fill="${CANVAS}"/>` +
    `<text x="${W / 2}" y="196" text-anchor="middle" font-family="${FONT}" font-size="62" font-weight="700" fill="${INK}">${esc(sheet.l1)}</text>` +
    `<text x="${W / 2}" y="312" text-anchor="middle" font-family="${FONT}" font-size="76" font-weight="700" fill="${ACCENT}">${esc(sheet.l2)}</text>` +
    `</svg>`);

  // 端末画像を角丸に抜く
  const mask = Buffer.from(
    `<svg width="${DW}" height="${DH}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${DW}" height="${DH}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`);
  const device = await sharp(path.join(SRC, sheet.src + '.png'))
    .resize(DW, DH)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png().toBuffer();

  // 端末のふちを1本入れて、近い色の背景から浮かせる
  const edge = Buffer.from(
    `<svg width="${DW}" height="${DH}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="1" y="1" width="${DW - 2}" height="${DH - 2}" rx="${RADIUS}" ry="${RADIUS}" ` +
    `fill="none" stroke="#CFC6B5" stroke-width="2"/></svg>`);

  const out = path.join(DST, String(index + 1).padStart(2, '0') + '.png');
  await sharp(caption)
    .composite([{ input: device, left: DX, top: DY }, { input: edge, left: DX, top: DY }])
    .png().toFile(out);
  return out;
}

(async () => {
  fs.mkdirSync(DST, { recursive: true });
  for (let i = 0; i < SHEETS.length; i++) {
    const f = await build(SHEETS[i], i);
    const m = await sharp(f).metadata();
    console.log(path.basename(f), SHEETS[i].src, m.width + 'x' + m.height);
  }
})();
