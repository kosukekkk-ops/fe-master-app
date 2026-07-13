# 基本情報技術者試験(FE)対策アプリ v1

問題演習の**誤答から苦手単語を自動で蓄積・復習**できる学習PWA。
要件定義書(2026-07-07)に基づくスクラッチ実装。

**公開URL: https://kosukekkk-ops.github.io/fe-master-app/**
iPhoneのSafariでこのURLを開き、共有メニューから「ホーム画面に追加」するとアプリとして使える。

## 特徴
- **問題演習(4択)** — 分野別に出題。選択肢は毎回シャッフルされ、正解位置が固定にならない。
- **誤答分析→苦手単語帳の自動登録(コア機能)** — 不正解になると、その問題に紐づく `relatedWordIds` の単語を苦手単語帳へ自動登録し、間違えた回数(wrongCount)を加算する。
- **単語帳(フラッシュカード)** — 全単語/苦手単語をタップでめくって復習。例え話ベースの解説つき。シャッフル・進捗表示あり。
- **AI解説生成** — 苦手単語に対し「解説を生成 / もっと簡単に / 別の例えで」。Claude APIをオンデマンド呼び出し、結果は端末にキャッシュ(同じ要求で再課金しない)。
- **学習ログ** — 分野別正答率(レーダー/棒)、正答率の推移(折れ線)、間違えた回数トップ10。すべて依存ライブラリなしの自前SVG。
- **オフライン対応 / PWA** — Service Workerで全アセット+データをキャッシュ。ホーム画面に追加可能。AI解説だけオンライン必須。

## ディレクトリ構成(資格を軸にした設計)
```
fe-master-app/
├─ index.html              アプリシェル
├─ css/style.css           モバイル最優先・ダークテーマ
├─ js/
│   ├─ storage.js          localStorage永続化(feapp:<資格>:<key> 名前空間)
│   ├─ data.js             words.json / questions*.json 読み込み・結合
│   ├─ ai.js               Claude API(オンデマンド解説)
│   ├─ charts.js           自前SVGチャート(依存なし)
│   └─ app.js              画面制御・演習・単語帳・ログ
├─ qualifications/fe/
│   ├─ words.json              用語辞書(380語 / relatedWordIds付き)
│   ├─ questions.json           再構成問題(45問。手書き)
│   ├─ questions_official.json  IPA公式過去問(51問。令和5〜7年度 科目A)
│   ├─ questions_generated.json 辞書から自動生成(1,900問。5種)
│   ├─ questions_calc.json      自動生成の計算問題(1,069問。26系統)
│   ├─ questions_b.json          IPA公式 科目B(6問。R7アルゴリズム4+セキュリティ2)
│   └─ questions_b_generated.json 自動生成 科目Bトレース(102問)
├─ tools/generate_questions.js       定義問題ジェネレータ(words.json→問題)
├─ tools/generate_calc_questions.js  計算問題ジェネレータ
├─ tools/generate_b_questions.js     科目Bトレース問題ジェネレータ
├─ manifest.webmanifest    PWAマニフェスト
├─ sw.js                   Service Worker(オフライン)
├─ icons/                  アプリアイコン
└─ server.js               ローカル確認用の静的サーバ(本番不要)
```
将来の資格拡張(簿記・ITパスポート等)に備え、データは `qualifications/<資格>/` に分離し、
各エントリは `qualification: "FE"` を保持。`storage.js` の `QUAL` を差し替えるだけで別資格へ切り替え可能な布石にしている(UI切り替えはv1対象外)。

## 動かし方
```
node fe-master-app/server.js      # http://localhost:4173
```
または `index.html` 以下を任意の静的ホスティング(GitHub Pages等)へ配置。
iPhoneではブラウザで開き「ホーム画面に追加」でPWAとして利用。
※ データJSONを `fetch` で読むため、`file://` 直開きではなくWebサーバ経由で開くこと。

## AI解説を使うには
設定タブで Anthropic APIキーを登録(キーは端末のlocalStorageにのみ保存)。
モデルは Haiku 4.5(低コスト・既定)/ Sonnet 5 / Opus 4.8 から選択可。

## 問題データの2系統(方針: 過去3年はIPA公式、その他はAI生成)
- **questions_official.json** … IPA公式サイトの『基本情報技術者試験 科目A 公開問題』令和5・6・7年度から取得した51問。問題文・正答の著作権はIPAに帰属し、出典を各問 `source`(例:「令和7年度 科目A 問10」)に保持。図・表が解答に必須で本文だけでは成立しない設問(アローダイアグラム/流れ図/真理値表など)は収録対象外。
- **questions.json** … 上記の出題パターンを踏襲したAI生成/再構成問題45問。
- `data.js` が両ファイルを読み込んで結合する。公式分の取得に失敗しても生成問題だけで動作する。

### なぜ過去問道場等ではなくIPA公式なのか
過去問道場などのサイトは**解説文が運営者の著作物**で無断転載・スクレイピングが規約違反。一方IPA公式の公開問題は出典明記での学習利用が広く行われている正規ルート。なおFEは2023年から通年CBT化で全問公開はされず、公式に取れるのは各年度の公開問題(科目A 20問)＋2022年サンプル問題に限られるため、**公式問題＋AI生成**の二本立てが現実解。

## 問題の量産(ジェネレータ)
`questions_generated.json` は **`tools/generate_questions.js` が `words.json` から自動生成**する(手書きではない)。1用語につき最大5問:
- **定義問題**: 「◯◯の説明として適切なものはどれか」 正解=その用語の意味
- **用語選択**: 「次の説明に当てはまる用語はどれか」 正解=その用語名
- **例えから用語**: 「次の例えが表す用語は」 正解=その用語名
- **例え問題**: 「◯◯を身近に例えたものは」 正解=その用語の例え話
- **意味問題**: 「◯◯を説明したものとして最も適切なものは」 正解=その用語の意味(定義問題とは別の紛らわしい選択肢で出題)

正解＝対象用語のフィールド、ダミー＝**同分野を優先した別用語**の値、という構造なので**正答の正しさが保証される**(全1350問の正答整合を検証済み)。正答位置はシード付きシャッフルで4択に分散。

```
node fe-master-app/tools/generate_questions.js   # words.json → questions_generated.json を再生成
```
**辞書(words.json)に用語を増やして再実行すれば、問題数もそのぶん自動で増える** = 問題量産の拡張エンジン。現状380語×5種で1900問。辞書が苦手単語で育つ(演習の誤答で自動追加)ほど、生成できる問題も増えていく。

### 計算問題の量産
`questions_calc.json` は **`tools/generate_calc_questions.js`** が生成する。数値をランダムに振り、**正答はコードで計算**、ダミーは「公式取り違え・単位換算忘れ・目標利益の入れ忘れ」などの典型的な計算ミス値にしている(全1,069問を独立再計算で正答一致を検証済み。questionIdにパラメータを埋め込み、別ロジックで解き直して照合)。**26系統**:
稼働率／直列・並列稼働率／n台冗長／基数変換／伝送時間／損益分岐点／キャッシュ実効アクセス時間／画像記憶容量／2の補数／MIPS／命令実行時間／アドレス空間／M/M/1待ち行列(待ち時間・応答時間)／PCMデータ量／定額法減価償却／磁気ディスク回転待ち／ディスク容量／PERT三点見積／色数／サブネットのホスト数／期待値／回収期間／ハミング符号／RAID5／RAID0・1。
```
node fe-master-app/tools/generate_calc_questions.js   # questions_calc.json を再生成
```
系統を増やすには `GEN` にジェネレータ関数を追加し `TARGET` に件数を足す。件数は各系統のパラメータ範囲を広げるだけでも増える(パラメータをquestionIdに埋めておくと再検証しやすい)。

### 科目B(アルゴリズム)の量産
科目Bは擬似言語プログラムやシナリオを読み解く形式で、UIも専用(擬似言語のモノスペース表示、図表のHTML表示、選択肢ア〜コの最大10択)。図・表は各問の `bodyHtml`(自前の信頼済みHTML。表・箇条書き・注記)で表現し、`program`(擬似言語)は `<pre class="pseudocode">` で表示する。
- `questions_b.json` … IPA公式 科目B(令和7年度)を出典付きで収録。アルゴリズム4問＋セキュリティ2問(問5=理論度数の表計算、問6=BCP/RPO/RTOのシナリオ。図表つき)。
- `questions_b_generated.json` … **`tools/generate_b_questions.js`** が擬似言語プログラムを生成し、その戻り値を JS で計算して正答を保証(全102問を独立再計算で検証済み)。8テンプレート: 倍数の個数/範囲の総和/配列の総和/配列の最大値/半減回数/べき乗/ユークリッドの互除法/しきい値超えの個数。
```
node fe-master-app/tools/generate_b_questions.js   # questions_b_generated.json を再生成
```
演習画面で「科目A(午前)/科目B」を切り替えて出題する。科目B問題は分野統計上テクノロジ扱い、genre(アルゴリズム/セキュリティ)で絞り込み可能。

## 問題データ一覧(合計3,173問 ※科目A 3,065 + 科目B 108)
| ファイル | 中身 | 件数 |
|---|---|---|
| `questions_official.json` | IPA公式過去問(令和5〜7年度 科目A) | 51 |
| `questions.json` | 手書きの再構成問題 | 45 |
| `questions_generated.json` | 辞書(380語)から自動生成(定義/意味/用語/例え/例えから用語の5種) | 1,900 |
| `questions_calc.json` | 自動生成の計算問題(26系統) | 1,069 |
| `questions_b.json` | IPA公式 科目B(R7アルゴリズム4+セキュリティ2) | 6 |
| `questions_b_generated.json` | 自動生成 科目Bトレース(8テンプレート) | 102 |

辞書は380語(テクノロジ182・マネジメント66・ストラテジ132)。`words.json` に用語を足して `node tools/generate_questions.js` を再実行すれば、そのぶん定義問題(1語×5問)が自動で増える。

手書きで追加する場合の必須項目: `questionId / category / text / choices(4つ) / correctIndex / relatedWordIds`(任意で `explanation`, `source`)。`relatedWordIds` は `words.json` の `wordId` を指す。
IPAが新年度の公開問題を出したら `questions_official.json` に追記(取得〜変換パイプラインは実証済み: PDF取得→本文抽出→解答キーで `correctIndex` 確定)。
