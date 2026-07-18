# Zenn記事ドラフト

タイトル案（どれか1つ。「Macなし」「非エンジニア」が引きになる）:
- 「Macを持ってない営業職が、Claude CodeだけでiOSアプリをApp Storeに出すまで」
- 「コード1行も書かずにiOSアプリをリリースした話(Capacitor+Codemagic+Claude Code)」

topics: `claudecode`, `capacitor`, `codemagic`, `ios`, `個人開発`

---

## はじめに

私は法人営業をしている非エンジニアです。Macを持っていません。
それでも基本情報技術者試験(FE)の対策アプリをApp Storeにリリースできました。
開発・ビルド・ストア提出までほぼすべてClaude Code(AIコーディングエージェント)に任せた記録です。

作ったもの: 「受かる基本情報 FE過去問＆単語帳」
- 科目A/科目B対応の演習3,173問
- 間違えた問題の重要用語が自動で「苦手単語帳」にたまるのがコア機能
- 完全オフライン・サーバーレス・買い切り課金

## 構成: Macなし・サーバーなしでiOSアプリを出す

- アプリ本体: 素のHTML/CSS/JS(フレームワークなし)のPWA
- ネイティブ化: Capacitor(WebアプリをそのままiOSアプリの器に入れる)
- iOSビルド: Codemagic(クラウド上のMacを借りる。無料枠500分/月)
- 配信: App Store。Web版はGitHub Pagesにそのまま公開
- データ: 学習履歴は端末のlocalStorage、課金はStoreKit。サーバー費0円

ポイントは「WindowsしかなくてもiOSアプリは出せる」こと。
XcodeはCodemagicのクラウドMacの中でだけ動きます。

## ハマったポイント集(ここが本題)

### 1. 証明書の秘密鍵を毎ビルド生成してはいけない
CIで`openssl genrsa`して証明書を毎回発行する構成にしたら、3回目のビルドで
`You already have a current Distribution certificate`(409)。
AppleのDistribution証明書は2枚まで。**固定の秘密鍵を1本作ってSecure環境変数に入れ、使い回す**のが正解。

### 2. ビルド番号の自動採番は「TestFlight側」を見る
`get-latest-app-store-build-number`は「App Storeで公開済み」の番号しか返さないため、
未公開のうちは常に0→毎回同じビルド番号→アップロードが409で弾かれる。
`get-latest-testflight-build-number`を使う。

### 3. Windowsで`cap sync`するとSPMのパスが壊れる
CapacitorのSPM構成(CocoaPodsなし)で、Windows上で`npx cap sync`すると
`Package.swift`のパスがバックスラッシュ(`..\..\..\node_modules\...`)で書かれてしまう。
CIのmacOS上で`cap sync`し直せば直るが、リポジトリに壊れたパスを入れないよう注意。

### 4. App Store Connect APIの自作JWTがなぜか401
資格情報が正しいのに自作JWT(Node/PyJWT)は401。
codemagic-cli-toolsのPythonライブラリ(`AppStoreConnectApiClient`)にトークンを作らせたら通った。
CIに入っているツールの実装を借りるのが早い。

### 5. ストア提出の「事務作業」もAPIで自動化できる
アプリ名・説明文・キーワード・審査連絡先・IAP作成・価格設定・年齢制限・スクリーンショットのアップロードまで、
ほぼ全部App Store Connect APIで登録できる。手作業はAppプライバシーの宣言と提出ボタンくらい。

### 6. Service WorkerのASSETS更新忘れは既存ユーザーを殺す
ファイルを削除/リネームしたのにsw.jsのプリキャッシュ一覧に残っていると、
`cache.addAll`が404で失敗→SWのインストール自体が失敗→**既存ユーザーが永久に更新できなくなる**。

## AIとの分担

私(人間)がやったこと:
- 「こういう機能が欲しい」「ここが使いにくい」を日本語で伝える
- 実機での動作確認、スクリーンショット撮影
- Apple Developer登録、銀行・税務情報、最後の提出ボタン

Claude Codeがやったこと:
- 実装のすべて(3,173問の問題生成エンジン含む)
- CI設定、ビルドエラーの調査と修正
- ストア提出メタデータのAPI登録、テスト

## まとめ

「個人開発の難所は、開発よりAppleへの提出手続き」というのが率直な感想です。
そこも含めてAIに任せられる時代になったので、非エンジニアこそ試す価値があると思います。

📱 App Store: https://apps.apple.com/jp/app/id6790236851
🌐 Web版: https://kosukekkk-ops.github.io/fe-master-app/
