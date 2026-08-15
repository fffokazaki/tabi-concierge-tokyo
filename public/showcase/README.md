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
| `.image-slots.state.json` / `.thumbnail` | 画像スロットの状態とサムネイル |
| `uploads/Tourism.docx` | 元になった資料 |

**ファイル構成を崩さないこと。** HTML が `./support.js` のように相対参照している。

## 収録画面

旅のプロフィール（`isSetup`）／プラン（`isBriefing`）／スキャン（`isScan`）／周辺（`isNearby`）／あなたへ（`isForYou`）

## 実装との関係

React 実装は、このプロトタイプの配色（oklch）・タイポグラフィ（Lora / Karla）・レイアウト・日本語コピーを踏襲する。ただし**移植は段階的**で、まずプラン画面から着手する。実装が追いつくまでは、資料用のキャプチャはここから切り出してよい。

## 注意

表示には `fonts.googleapis.com` への接続が必要。**オフラインではフォントが崩れる**ため、収録前にネットワークを確認すること。
