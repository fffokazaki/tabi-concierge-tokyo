# デザインプロトタイプ（showcase）

訪日観光客向け AI 旅行ガイド「旅コンシェルジュTOKYO」の5画面デザイン。**デザインの正典**として保全している。

- **公開 URL**: デプロイ済みの Worker の `/showcase/`
- **ローカル**: `npm run dev` 後に <http://localhost:5173/showcase/>

## これは実装ではない

クリッカブルなデザインプロトタイプであり、**実際のオープンデータは流れていない**（画面内の内容はモックデータ `SCENARIOS`）。実データが流れる動作するアプリはリポジトリルートの `src/`（フロントエンド）と `worker/`（API）で、URL は `/`。

## 何でできているか

Claude の宣言的コンポーネント runtime（`<x-dc>` / `<sc-if>` / `{{ }}` テンプレート）で書かれた単一 HTML。React アプリではないため、**このファイルに API 呼び出しを足すことはできない**。

| ファイル | 役割 |
| --- | --- |
| `Japanese version.dc.html` | 日本語版プロトタイプ本体（5画面） |
| `English version.dc.html` | 英語版 |
| `Japanese version-print.dc.html` | 印刷・資料貼り込み用 |
| `support.js` / `doc-page.js` / `image-slot.js` | runtime。これが無いと表示できない |
| `ios-frame.jsx` | iOS デバイスフレーム |
| `.image-slots.state.json` | 画像スロットの状態。**`{}` で固定する**（下記） |
| `.thumbnail` | 一覧用サムネイル。プロトタイプ自身（旅のプロフィール画面）のスクリーンショットで、第三者の素材は含まない |

**ファイル構成を崩さないこと。** HTML が `./support.js` のように相対参照している。

## 画像スロットは意図的に空にしている

`.image-slots.state.json` は `{}` で固定する。**出典を画面に表示できない画像は置かないこと。** 経緯は [Issue #222](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/222)。

主催者規定の「引用は出典を明記する」（[CONSTRAINTS.md](https://github.com/fffokazaki/tabi-concierge-tokyo/blob/develop/docs/01-context/CONSTRAINTS.md) §3）は、**成果物の上に表示すること**を求めている。この README に書くだけでは満たせない。`image-slot.js` は対応する仕組みを既に持っている。

- `<image-slot>` の `credit` / `credit-href` 属性に出典を書くと、画像の左下にクレジットが**表示される**（`:host([data-filled][data-credit]) .credit{display:block}`）
- `credit` は **HTML 属性で、sidecar のフィールドではない**。authoring host から画像をドロップしただけでは付かないので、`.dc.html` 側の編集が必須
- sidecar は **3つの `.dc.html`（日本語・英語・印刷用）が同じ1ファイルを document-relative に読む**。1点入れると3ページすべてに出るため、`credit` は3ファイル分書く
- `@media print` と `:host-context([data-om-exporting])` ではクレジットが**隠れる**。印刷・authoring host のエクスポート経由の出力には出ない

したがって画像を足すときは、**(1) `credit` / `credit-href` を3ファイルすべてに書く (2) 撮影者・撮影日・利用許諾をこの README にも記録する**。どちらかができない画像は置かない。

空のままでもプロトタイプは壊れない（枠がプレースホルダ表示になるだけ。`placeholder` 属性の値が出る）。

### `uploads/` を置かない

以前ここに `uploads/` があり、デザインカンプと元資料を git 追跡下で公開配信していた。**`public/` 配下に置いたものは、画面から到達できなくても全部そのまま配信される。** 3点は [`docs/02-design/design-canvas/`](https://github.com/fffokazaki/tabi-concierge-tokyo/tree/develop/docs/02-design/design-canvas) へ移した。プロトタイプの描画に必要な資産だけをこのディレクトリに置くこと。

> このファイル自身も `/showcase/README.md` で公開配信される（実測 200 / `text/markdown`）。**運用の経緯や内部判断を書き足さないこと。** 相対リンクもこの経路では SPA フォールバックに吸われるため、リンクは絶対URLで書く。

## 収録画面

旅のプロフィール（`isSetup`）／プラン（`isBriefing`）／スキャン（`isScan`）／周辺（`isNearby`）／あなたへ（`isForYou`）

## 実装との関係

React 実装は、このプロトタイプの配色（oklch）・タイポグラフィ（Lora / Karla）・レイアウト・日本語コピーを踏襲する。ただし**移植は段階的**で、まずプラン画面から着手する。実装が追いつくまでは、資料用のキャプチャはここから切り出してよい。

## 注意

表示には `fonts.googleapis.com` への接続が必要。**オフラインではフォントが崩れる**ため、収録前にネットワークを確認すること。
