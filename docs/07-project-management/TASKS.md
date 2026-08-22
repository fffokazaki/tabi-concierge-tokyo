---
title: "TASKS"
version: "1.4.2"
status: "draft"
owner: "@fffokazaki"
created: "2026-08-15"
updated: "2026-08-22"
changeImpact: "medium"
---

# TASKS.md - タスク管理

> 本書は提出締切（2026-08-23 17:00）までの実作業を管理する。粒度の細かい進行管理は GitHub Issues を SSOT とし、本書は全体像とブロッカーを俯瞰するために使う。

## 1. 現在のフェーズ

### フェーズ情報

| 項目 | 内容 |
| ---- | ---- |
| フェーズ | Phase 2: POC 実装・提出準備 |
| 期間 | 2026-08-15 〜 2026-08-23 17:00 |
| ゴール | 「このコンセプトでこのデータが使える」ことを示す POC と、提出物一式の完成 |

### 進捗サマリー（2026-08-19 時点）

| 区分 | 状態 |
| ---- | ---- |
| 企画 | ✅ 完了（最終企画案 v1.0） |
| UI デザイン | ✅ プロトタイプ完成（5画面・日英2バージョン → `/showcase/`） |
| UI 実装 | 🔄 進行中（プラン画面・あなたへ画面が `/api/*` に接続済み。旅のプロフィール→プラン、あなたへ興味チップ→レコメンドの2系統が縦貫通で成立。スキャン・周辺は未着手） |
| Cloudflare 基盤 | ✅ Worker ＋ SPA ＋ showcase をデプロイ済み（<https://tabi-concierge-tokyo.tokyo-odh-091.workers.dev>） |
| データ（D1） | ✅ 利用データ10件を確定（[Issue #10](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/10)・[DATABASE.md](../02-design/DATABASE.md) §2）。ブロック解消 |
| データ組み込み | ✅ 完了（1,645 spots・エリア分類済み。[Issue #24](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/24)） |
| `/api/*` 接続 | ✅ 完了（スタブ。Issue #31・#22）。プランのコア3操作をフロントから呼べる |
| `/mcp` 接続 | ⬜ 未着手（Step 5） |
| 提出物（資料・キャプチャ・動画） | ⬜ 未着手 |

## 2. 現在のタスク

### 🔴 優先度: Critical（提出締切に直結）

- [x] **利用オープンデータの確定（[Issue #10](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/10)）** — 台東区7件＋都2件＋渋谷区1件の計10件を実データ検証のうえ確定（[DATABASE.md](../02-design/DATABASE.md) §2）
- [x] **オープンデータを D1 へ取り込む（スキーマ設計 ＋ シード）** — [Issue #24](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/24)。datasets/spots/gaps の3テーブル、1,645 spots を投入済み
- [x] **プラン画面を `/api/*` のコア3操作へ接続**（Issue #31）。SCENARIOS の静的差し替えではなく、`search_datasets` → `aggregate_dataset` → `get_provenance` を実際に呼ぶ形に置き換え済み。渋谷は観光データが無いため引き続き面のみ（`DATABASE.md`「渋谷エリアの制約」）。ペース別表示件数・ギャップカード（`feat/plan-data-grounding-and-pace`）は develop へマージ済み。マナー情報なしの表示文言修正（Issue #67・PR #77）と、その際 Futoshi から指摘のあった DATABASE.md の実装参照ズレの修正（PR #83）も develop へ反映済み
- [x] **あなたへ画面を実装し `/api/*` のコア3操作へ接続**（PR #82・develop へマージ済み）。興味チップ（ラーメン・文化・家族向け・自然）→レコメンドカード（出典つき）の縦貫通が成立。ラーメンは意図的に候補ゼロのまま運用し、正直な「答えられない」実演として使う。あなたへのスコーピング中に見つかったバックエンド側の `aggregate_dataset` 出典の選定根拠明記（Issue #78）は Futoshi が修正し、PR #79 で develop へマージ済み
- [x] **提出資料と First Stage スライドの構成確定**（2026-08-21）。提出資料14枚は [submission-deck.md](../submission-deck.md)、2分版8枚と台本は [first-stage-presentation.md](../first-stage-presentation.md) v2.0。v1.0 台本が実装と乖離していた（#4「MCPでアプリに接続します」が事実でない）ため全面差し替え
- [ ] 提出用画面キャプチャ（1600×900px・3点）の切り出し — 対象は submission-deck のスライド6/7/8（[Issue #126](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/126)）
- [ ] 提出資料（16:9・必須4項目を含む）の作成 — 構成は [submission-deck.md](../submission-deck.md) に確定済み（[Issue #127](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/127)）
- [x] **「探索30分→3分」を断定を避けた表現へ確定**（[Issue #130](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/130)・2026-08-22）。実測はせず、30分＝開発メンバーの初回探索体験に基づく目安・3分＝操作一巡の目安として提示する。根拠は [PROJECT.md](../01-context/PROJECT.md) §8
- [ ] 提出フォーム送信（<https://form.jotform.com/261870604352051>）→ 提出後ただちに収録枠を予約（30分単位・早い者順）（[Issue #128](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/128)）

### 🟠 優先度: High

- [ ] コンシェルジュを MCP サーバーとして最小実装（データセット検索・集計・出典取得の3ツール）し、フロントから接続
- [ ] デモ動画の録画（本番アプリの画面収録・BGMなし）— 埋め込み先は2分版の #3（プラン生成）と #4（ラーメンに答えない）（[Issue #131](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/131)）
- [ ] ナレーション台本（507字）の読み上げ練習 — **スライド単位**で尺を実測し 1分55秒着地を確認（[Issue #132](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/132)）

### 🟡 優先度: Medium

- [ ] 8/15 ミーティングの文字起こしをチーム全員に共有（担当: 岡崎）
- [ ] スライド内タイムコード（右上）の非表示化（本番書き出し前）
- [x] コア3操作の引数スキーマ確定と [API.md](../02-design/API.md)（スキーマ SSOT）・[MCP.md](../02-design/MCP.md) への反映（2026-08-17・Issue #22。`/api/*` は `worker/core/` の固定データによるスタブで稼働。中身の本実装は Step 5）
- [ ] [ARCHITECTURE.md](../02-design/ARCHITECTURE.md) §8 の「未確認」バージョンを実値へ更新

### 🟢 優先度: Low（Final Stage 以降）

- [ ] 介助者モード・音声対応のデモ設計
- [ ] 都への API 公開提案の資料化
- [ ] MCP 基盤の外部公開（翌年参加者への開放）方針の決定
- [ ] コンシェルジュを別リポジトリへ切り出し MIT で OSS 公開する — 対象はバックエンドのみで旅行アプリ `src/` は含まない。Final Stage（2026-10-17）まで（[Issue #129](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/129)）
- [ ] やさしい日本語対応

## 3. タスクステータス定義

| ステータス | 意味 |
| ---------- | ---- |
| ⬜ 未着手 | 着手していない |
| 🔄 進行中 | 担当者が作業中 |
| 🔍 レビュー中 | 成果物のチーム確認待ち |
| ✅ 完了 | 完了の定義を満たした |
| ⛔ ブロック中 | 他タスク・外部要因の解消待ち |

## 4. ブロッカーと課題

### 現在のブロッカー

| ブロッカー | 影響するタスク | 解消条件 |
| ---------- | -------------- | -------- |
| ~~10件リストが旧企画（公園・防災デモ）ベースのまま~~ | — | **解消済み（2026-08-16・Issue #10）**。[DATABASE.md](../02-design/DATABASE.md) §2 の確定版に差し替え |
| 画面イメージが未作成 | デモ動画・画面キャプチャ | 代表エリアのデータ差し替えが完了すること |

### 提出直前の確認事項

- [ ] 確定10件のカタログURL が生きていることと `metadata_modified` の変化を確認する（2026-08-23・[DATABASE.md](../02-design/DATABASE.md) §3）

### 技術的負債（POC 由来・許容済み）

- 同梱データはダウンロード時点のスナップショット（動的取り込みは Final Stage で判断）
- 技術スタックのバージョンが一部「未確認」のまま（実装着手時に確定）

## 5. 完了の定義（Definition of Done）

### 実装タスク

- [ ] 動作を実際に確認した（モックで成立させる場合はその旨を明記）
- [ ] 出典が付与されている（回答を伴う機能の場合）
- [ ] 関連ドキュメント（ARCHITECTURE / API / DATABASE）を更新した

### 提出物タスク

- [ ] 主催者規定を満たしている（16:9／1600×900px／著作権ルール）
- [ ] 必須4項目（①課題及び解決策 ②プロダクト ③利用オープンデータ ④チーム紹介）に対応している
- [ ] チームで内容を確認した

## 6. タスク依存関係

```
10件リスト確定 ──► データ組み込み ──► 代表エリア画面 ──► デモ動画 ──► 提出資料 ──► 提出 ──► 収録枠予約 ──► 収録
   （✅ 完了）
                                        └──► 画面キャプチャ ──────────┘
MCP 最小実装 ────────────────────────────────► （資料内アーキ図の裏付け）
```

## 7. 参照

- フェーズ全体像: [ROADMAP.md](./ROADMAP.md)
- リスクと対応: [RISKS.md](./RISKS.md)
- 制約（締切・提出要件・著作権ルール）: [CONSTRAINTS.md](../01-context/CONSTRAINTS.md)
- 提出資料の構成（16:9・14枚）: [submission-deck.md](../submission-deck.md)
- First Stage 2分スライドと台本: [first-stage-presentation.md](../first-stage-presentation.md)

## Changelog

### [1.4.2] - 2026-08-22

#### 変更

- Critical タスク「『探索30分→3分』を実測するか断定を避けた表現へ直す」を完了へ更新（[Issue #130](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/130)）。根拠は [PROJECT.md](../01-context/PROJECT.md) §8 に確定

### [1.4.1] - 2026-08-22

#### 変更

- Cloudflare 基盤の行のURLを更新。Cloudflare アカウントを事務局発行の `tokyo_odh_091` へ移設したことに伴い、本番URLを <https://tabi-concierge-tokyo.tokyo-odh-091.workers.dev> へ更新（[Issue #171](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/171)）

### [1.4.0] - 2026-08-21

#### 変更

- 残タスクを GitHub Issue 化し、各タスクへ [#126](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/126)〜[#132](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/132) を紐付けた
- Critical の「`LICENSE`（MIT）をリポジトリへ設置」を削除し、「探索30分→3分の扱い」（[#130](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/130)）へ差し替えた。OSS 化は**このリポジトリを public にすることではなく、コンシェルジュを別リポジトリへ切り出すこと**であり、実施時期も提出後〜Final Stage のため Low へ移した（[#129](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/129)）
- 台本の実測字数を 503 → 507字へ更新（#7 の OSS 記述を具体化したため）

### [1.3.0] - 2026-08-21

#### 変更

- 提出資料と First Stage スライドの構成確定を Critical に追加。構成の SSOT を [submission-deck.md](../submission-deck.md)（提出資料14枚）と [first-stage-presentation.md](../first-stage-presentation.md) v2.0（2分版8枚）に置いた
- ナレーション台本の字数を「約620字」から新版の実測値 503字へ更新し、尺の実測を**スライド単位**で行う指示に変えた
- デモ動画のタスクを「絵コンテ6カット」から本番アプリの画面収録へ変更（埋め込み先は2分版 #3・#4）

#### 追加

- `LICENSE`（MIT）設置タスク。提出資料スライド11「MIT で OSS 公開予定」の裏付けとして提出前に必要（現状 private・LICENSE 未設定）
- §7 参照に提出資料・First Stage スライドの2文書を追加

### [1.2.0] - 2026-08-19

#### 変更

- 進捗サマリー・Critical タスクを実態へ更新: あなたへ画面を実装し `/api/*` のコア3操作へ接続（PR #82・develop へマージ済み）。UI 実装の状態を「スキャン・周辺・あなたへは未着手」から「スキャン・周辺は未着手」へ訂正
- プラン画面のタスクに、`feat/plan-data-grounding-and-pace`（ペース別表示件数・ギャップカード）の develop マージ、マナー表示文言修正（Issue #67・PR #77）、その際 Futoshi 指摘の DATABASE.md 参照修正（PR #83）の反映済みを追記
- あなたへのスコーピング中に見つかった `aggregate_dataset` 出典の選定根拠明記（Issue #78・PR #79）の解消を記録

### [1.1.1] - 2026-08-18

#### 修正

- 進捗サマリーの見出し日付が2026-08-15のまま止まっていたのを更新
- Critical タスクの `/api/*` 接続項目から「Futoshi のレビュー待ち」を削除。チェック済み（[x]）の項目にレビュー待ちの注記が同居しており自己矛盾していた。PR のレビュー状況は GitHub 側を SSOT とする旨を明記
- Changelog [1.1.0] にあった同種の「レビュー待ち」表記も削除

### [1.1.0] - 2026-08-17

#### 変更

- 進捗サマリー・Critical タスクを実態へ更新: プラン画面が `/api/*` のコア3操作（スタブ）に接続済み（Issue #31）。「MCP 接続」の行を `/api/*`（完了）と `/mcp`（未着手・Step 5）に分けた
- `feat/plan-data-grounding-and-pace` ブランチの develop 競合解消と、ペース別表示件数・ギャップカードの追加を記録

### [1.0.0] - 2026-08-17

#### 追加

- frontmatter（`title` / `version` / `status` / `owner` / `created` / `updated` / `changeImpact`）を導入し、コア文書と書式を揃えた。本文の変更はない
- `created` は Git の初回コミット日（実測）。この版より前の変更履歴は Git ログを参照する
