# App Store スクリーンショット生成

`store/screenshots/01〜05.png`(1290×2796 = 6.9インチ用)を、実機を使わずに作り直すための一式。
デザインを変えたら毎回ここから撮り直す。

## 使い方

```bash
mkdir -p /tmp/shots && cp -r docs /tmp/shots/site
cp tools/screenshots/_shot.js /tmp/shots/site/
# site/index.html の <script src="js/storage.js"> の直前に <script src="_shot.js"></script> を挿す
cp tools/screenshots/capture.js tools/screenshots/compose.js /tmp/shots/
cd /tmp/shots && node capture.js && node compose.js
cp store/*.png <repo>/store/screenshots/
```

- `_shot.js` … サンプル学習データを流し込み、目的の画面まで自動で進めて `document.title` を `SHOT-READY` にする
- `capture.js` … ヘッドレスChromeをCDPで駆動し、430×932@3x で `out/*.png` に保存する
- `compose.js` … `out/*.png` にキャッチコピーを載せて `store/01〜05.png` に仕上げる

## ハマりどころ

- `--screenshot` フラグは撮影タイミングを制御できない(loadを遅らせても初期状態が写る)。
  `--virtual-time-budget` は新headlessでは無視される。だからCDPで待ってから撮っている。
- 静的サーバをcapture.jsと同じプロセスで動かすので、Chromeの起動は必ず非同期(`spawn`)にすること。
  `execFileSync` にするとイベントループが止まり、サーバが応答できず必ずタイムアウトする。
- レスポンスに `Cache-Control: no-store` が要る。プロファイルを使い回すため、
  付けないとChromeが古い `_shot.js` を掴んだままになる。
- `_shot.js` 側で `overflow: hidden` を掛けるとスクロール駆動(単語帳のカード送り)が効かなくなる。
