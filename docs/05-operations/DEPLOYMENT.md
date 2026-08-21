---
title: "DEPLOYMENT"
version: "1.5.0"
status: "draft"
owner: "@fffokazaki"
created: "2026-08-15"
updated: "2026-08-21"
changeImpact: "low"
---

# DEPLOYMENT.md - デプロイメント・運用ガイド

> **📏 ドキュメント最適化**: このファイルは索引として300-500行に抑えています。詳細は `deployment/` サブディレクトリ配下の個別ファイルを参照してください。
>
> **📦 初期セット外（重要）**: `deployment/` サブディレクトリは `/init-docs` の初期セットに含まれません（索引であるこの DEPLOYMENT.md 自身はコア7文書として必ずコピーされます）。本文が参照する `deployment/*.md` は、必要になった時点で `${CLAUDE_PLUGIN_ROOT}/docs-template/05-operations/deployment/` 配下の同一ファイル名からコピーしてください。展開直後のリンク切れを避けるため、以下では角括弧リンクではなくファイル名（例: `deployment/git-workflow.md`）で参照を示します。

## 📖 構成

> 下表の各ファイルは初期セット外です。必要になった時点で `${CLAUDE_PLUGIN_ROOT}/docs-template/05-operations/deployment/<ファイル名>` からコピーしてください。
>
> **例外**: `deployment/ace-cycle.md` は `/ace-setup` により**配置済み**（本リポジトリ向けの修正が入っているため、テンプレートからの上書きコピーをしないこと）。

| ドキュメント                                | 内容                                              | 推奨読み順     |
| ------------------------------------------- | ------------------------------------------------- | -------------- |
| `deployment/github-setup.md`                | GitHub初期設定（ラベル・Release Drafter）         | ⭐⭐⭐⭐⭐ 0th |
| `deployment/git-workflow.md`                | AI駆動Git Workflow全体                            | ⭐⭐⭐⭐⭐ 1st |
| `deployment/self-review.md`                 | セルフレビュー詳細（PR作成前）                    | ⭐⭐⭐⭐ 2nd   |
| `deployment/devin-pre-pr-review.md`         | Devin Pre-PRレビューシステム（5エージェント並列） | ⭐⭐⭐⭐ 2.5th |
| `deployment/automated-code-review.md`       | 自動コードレビュー（Claude Code + Husky）         | ⭐⭐⭐⭐ -     |
| `deployment/agent-deletion-prevention-harness.md` | 削除事故防止ハーネス設計                     | ⭐⭐⭐⭐ -     |
| `deployment/knowledge-management.md`        | ナレッジ体系化（マージ後・cleanup後）             | ⭐⭐⭐⭐ 3rd   |
| `deployment/ace-cycle.md`                   | ACEサイクル（Playbook増分更新）**✅ 配置済み — コピー不要** | ⭐⭐⭐⭐ 3.5th |
| `deployment/ace-autonomous.md`              | ACE autonomous（subagent + worktree、任意）       | ⭐⭐⭐ 3.6th   |
| `deployment/ai-tools-integration.md`        | AIツール統合設定                                  | ⭐⭐⭐ -       |
| `deployment/ci-cd.md`                       | CI/CDパイプライン                                 | ⭐⭐⭐ 4th     |
| `deployment/infrastructure.md`              | インフラ構成                                      | ⭐⭐⭐ -       |
| `deployment/multi-cli-review-orchestration.md` | Multi-CLI分散レビュー                          | ⭐⭐⭐ -       |
| `deployment/review-response-policy.md`      | PRレビュー対応ポリシー                            | ⭐⭐⭐⭐ -     |
| `deployment/workflow-principles.md`         | ワークフロー運用原則（3原則＋TodoWrite）          | ⭐⭐⭐⭐ -     |
| `deployment/monitoring.md`                  | モニタリング                                      | ⭐⭐ -         |

## 🚀 クイックスタート（30秒で理解）

### AI駆動開発の基本フロー

```
Issue → Branch → Implement → Test → Self-Review → PR → Review → Merge → Cleanup → ACE → Next Task
```

**詳細**: `deployment/git-workflow.md`

### よく使うコマンド

```bash
# 1. Issue作成
gh issue create --title "feat: ..." --body "..."

# 2. ブランチ作成
git checkout -b "feature/123-feature-name"

# 3. セルフレビュー（AIツールに依頼）
「MASTER.mdとPATTERNS.mdに基づいて、今回の変更をレビューしてください」

# 4. PR作成
gh pr create --base develop --title "..." --body "..."

# 5. ナレッジ記録（マージ後）
gh discussion create --category "..." --title "..." --body-file knowledge.md
```

## 1. AI仕様駆動Git Workflow

### 概要

Git Flow ベースの軽量フロー。PoC 段階のため Issue 起票と ACE を任意とし、ブランチと PR を必須としている（[ADR-006](../06-reference/DECISIONS.md)）。SSOT は [MASTER.md](../MASTER.md)「Git Workflow（軽量フロー）」。

### 主要ステップ（既定 = 軽量フロー）

1. **Issue作成** - **任意**（仕様に議論が必要なとき・作業を分担するときだけ）
2. **ブランチ作成** - **必須**。`develop` から。`feature/` `fix/` `chore/` `docs/` + 短い説明
3. **実装・コミット** - AI駆動開発
4. **PR作成** - **必須**。base は `develop`。本文に「何を・なぜ」を書く
5. **レビュー** - 変更内容に応じて実施。設計判断・出典強制に触れる変更は必ず見る
6. **レビュー対応** - 指摘への対応内容をコメントで残す
7. **マージ** - Squash 推奨。**`Closes #N` は発火する**（このリポジトリのデフォルトブランチが `develop` のため。ADR-009）。手動クローズは不要
8. **クリーンアップ** - ブランチ削除、`git fetch --prune`
9. **デプロイ** - `worker/` `shared/` `migrations/` `src/` を変更したときは §3「いつデプロイするか」に従って反映する
10. **ナレッジ体系化（ACE）** - **任意**。メンテナ環境では必須運用 ← ACE Playbook: `deployment/ace-cycle.md`

### メンテナ環境のフル運用（参考）

メンテナは上記に加えて次を実施する。外部プラグイン（ff-dev-toolkit）を前提とするため、**プラグイン非保有者には適用しない**。

- Draft PR を作成してからセルフレビュー（ローカルの多観点レビュー + クロスモデルレビュー）→ 指摘を1 fix commit に束ねる → `gh pr ready`
- マージ直前に AC 照合ゲート（Issue の受け入れ条件とチェックボックスの照合・完了報告コメント）
- マージ後に cleanup とナレッジ抽出（ACE）

### 詳細ドキュメント

- **全体フロー**: `deployment/git-workflow.md`
- **セルフレビュー**: `deployment/self-review.md`
- **ナレッジ管理**: `deployment/knowledge-management.md`
- **AIツール統合**: `deployment/ai-tools-integration.md`
- **削除事故防止**: `deployment/agent-deletion-prevention-harness.md`

### ブランチ戦略（PoC 期間・[ADR-009](../06-reference/DECISIONS.md)）

**`develop` が唯一の統合ブランチ。`main` の運用は未定で、使っていない。**

```
develop       ← 唯一の統合ブランチ。デフォルトブランチ・PR の base・デプロイ元
  ↑
feature/*     ← 機能追加
fix/*         ← 不具合修正
chore/*       ← 雑務
docs/*        ← 文書のみの変更
knowledge/*   ← ACE エントリの追記

main          ← 用途未定。develop から乖離したまま放置している（直接コミットは禁止）
```

> **`main` は本番ではない。** ブランチ名から「本番リリース」を連想しがちだが、本プロジェクトは `main` を経由せず **`develop` の内容を直接 Cloudflare へ手動反映**している。位置づけは提出（2026-08-23）後に決める（ADR-009）。

**使わないもの**: `release/*` / `hotfix/*`。リリース列が1本しか無いため分ける意味が無い。

**命名規則**: `<種別>/#{issue番号}-{内容}`（Issue があるとき）または `<種別>/{内容}`。

- `feature/#31-connect-plan-to-api`
- `fix/#30-megurin-area-detection`
- `docs/43-etiquette-catalog-survey`

## 2. CI/CDパイプライン

### 概要

GitHub Actions/GitLab CI/Jenkinsによる自動化パイプライン。

### 主要構成

- **テスト**: 単体テスト、統合テスト、E2Eテスト
- **ビルド**: アプリケーションのコンパイル・バンドル
- **デプロイ**: 環境別デプロイ（develop → staging → production）
- **通知**: Slack/Teams通知

### 詳細ドキュメント

`deployment/ci-cd.md`

## 3. インフラストラクチャ — Cloudflare へのデプロイ

**本プロジェクトの実デプロイ手順。この節はテンプレートではなく実態を記述している。**

### 環境構成

| 環境 | 用途 | URL | 実行環境 |
| --- | --- | --- | --- |
| ローカル | 開発 | <http://localhost:5173> | **workerd**（`@cloudflare/vite-plugin` 経由。本番と同じランタイム） |
| 本番 | 提出・共有 | <https://tabi-concierge-tokyo.opendata-002.workers.dev> | Cloudflare Workers |

ステージングは設けない（First Stage はライブデモ不可のため、常時公開の可用性要件が無い）。

### 前提

| 項目 | 値 |
| --- | --- |
| Cloudflare アカウント | `opendata`（PoC 用の仮アカウント）。`wrangler.jsonc` の `account_id` に明示 |
| Node.js | 24（`.nvmrc` / `engines`）。**ツールチェーン用であり本番ランタイムではない** |
| wrangler | v4.123 以上（`@cloudflare/vite-plugin` が peer で要求） |

初回は認証が必要。

```bash
npx wrangler login   # ブラウザで OAuth。opendata アカウントへのアクセスを許可する
npx wrangler whoami  # opendata が一覧に出ることを確認
```

#### AI Gateway / Workers AI（[ADR-013](../06-reference/DECISIONS.md)）

推論は Workers AI を **AI Gateway 経由**で呼ぶ。設定は `wrangler.jsonc` に入っており、**ダッシュボードでの事前作業は要らない**。

| 設定 | 値 | 置き場所 |
| --- | --- | --- |
| バインディング | `AI` | `wrangler.jsonc` の `"ai"` |
| ゲートウェイ ID | `default` | `wrangler.jsonc` の `"vars".AI_GATEWAY_ID` |
| キャッシュ TTL | 3600 秒 | 呼び出し側（`env.AI.run` の第3引数） |

- **`default` は予約名**で、初回の認証済みリクエストでゲートウェイが**自動作成**される。ダッシュボード（AI → AI Gateway）でログ・ニューロン消費・キャッシュ HIT を確認できる
- **名前付きゲートウェイに変えたい場合**は、先にダッシュボードか API で作成してから `vars.AI_GATEWAY_ID` を差し替える。**作成せずに名前を指定すると推論そのものが落ちる**（`AiGatewayError: 2001: Please configure AI Gateway in the Cloudflare dashboard`）
- ローカルだけ別ゲートウェイへ向けたいときは `.dev.vars` に `AI_GATEWAY_ID=...` を置く（`.dev.vars` は Git 管理外）

> **AI バインディングはローカルでも実 API を叩く。** `npm run dev` の推論は本物で、無料枠（10,000 ニューロン/日）を消費する。`--remote` は要らない。
> テストは `vitest.worker.config.ts` の `remoteBindings: false` で外へ出ないようにしてある（外すと Cloudflare 認証情報を持たない CI が全滅する）。

### デプロイ

```bash
npm install     # prepare で wrangler types が走り worker-configuration.d.ts が生成される
npm run dev     # ローカル（workerd）で確認
npm run deploy  # vite build → wrangler deploy
```

#### いつデプロイするか（[Issue #46](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/46)）

**CI は検証（typecheck / test / build）だけを行い、デプロイしない。** `npm run deploy` の手動実行が唯一の反映経路である。

この「手動」という設計自体は維持するが、**契機を決めていなかったために本番が 43 コミット分・データセット3テーブル分まるごと遅れる事故が起きた**（2026-08-17 に発覚。`/api/search-datasets` が 404、リモート D1 は空）。以下を契機とする。

| 契機 | 実行するもの |
| --- | --- |
| **`worker/` または `shared/` を変更する PR をマージしたとき** | `npm run deploy` |
| **`migrations/` を変更する PR をマージしたとき** | `npm run db:migrate` → `npm run deploy` |
| **`wrangler.jsonc` のバインディング・`vars` を変更する PR をマージしたとき** | `npm run cf-typegen` → `npm run deploy`（バインディングは deploy でしか本番へ渡らない） |
| **`data/` または `scripts/` を変更してデータの中身が変わるとき** | `npm run db:seed` |
| 提出直前（2026-08-23） | 3つすべて＋下記の確認 |

`src/`（フロントエンド）だけの変更もデプロイしないと画面に出ない点に注意する。

> **リモートへ反映する順番**: マイグレーション → シード → デプロイ。シードだけ流してもテーブルが無いため失敗する（[DATABASE.md](../02-design/DATABASE.md) §2）。

#### デプロイ記録

「今デプロイされているもの」は `main` では辿れない（ADR-009）。反映したらここに記録する。

| 日時 | Version ID | 内容 | 確認 |
| --- | --- | --- | --- |
| 2026-08-21 | `5aebf720-384e-41e5-a119-30ce85a0c3b8` | プラン画面の `search_datasets` 送信を構造化入力（`interests` + `query` は自由文のみ）へ切り替え（#53 / PR #113）。`src/features/plan/buildPlan.ts` の挙動変更に加え、`worker/core/operations.ts`・`worker/core/search-gaps.ts` はコメントのみの変更だが、`worker/` `src/` の変更のためデプロイ（§3「いつデプロイするか」）。`migrations/` `data/` `scripts/` は未変更のため、マイグレーション・シードは実行していない | チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404）。`index.html` のバンドル（`assets/index-mRCnRsbT.js`）はローカルビルドとハッシュ一致。Issue #53 の実測ケースを本番で確認 — `{"query":"上野で夜遊びしたい","interests":["ナイトライフ"]}` が `answered`（銭湯）を返しつつ `gaps` に「『ナイトライフ』について訊かれましたが…当たるものがありませんでした」を載せる（切り替え前は gaps 0件で沈黙していた入力）。同じ候補で aggregate（燕湯）→ provenance（銭湯・CC BY 4.0）の一連も `answered`。**本番 D1 への書き込みが発生している** — 上記の実測で `gaps` に `ナイトライフ、上野で夜遊びしたい / 上野 / other` の行（13:40:29）が記録されたことを確認（ADR-010 の想定どおりの通常挙動。構造化入力の興味は `question` 列へ「、」で畳み込まれて残る仕様） |
| 2026-08-20 | `45f1755e-16ee-4682-8291-90b1c29accfe` | 未回答 `message` から名乗りの一文（「該当するオープンデータが（あり／見つかり）ません。」）を除去し、画面見出しとの重複を解消（#107 / PR #109）。`worker/core/search-gaps.ts`・`worker/core/operations.ts`・`shared/core.ts` の変更のためデプロイ（§3「いつデプロイするか」）。`migrations/` `data/` `scripts/` は未変更のため、マイグレーション・シードは実行していない | チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404）。`index.html` のバンドル（`assets/index-y-EHawRN.js`）はローカルビルドとハッシュ一致（`src/` は無変更だが、squash 後の develop からビルドして一致を確認）。コア3操作の代表経路を実測 — `上野の寺社をめぐりたい` が `answered`（名所・史跡）、`新宿の美術館に行きたい` が HTTP 200 の `unanswered(out_of_area)` で**新文面（名乗りなし・「「新宿」はこのアプリの対象エリア（上野・浅草・渋谷）の外です。」）**が返ること。**本番 D1 への書き込みが発生している** — 上記の実測で `gaps` に `新宿の美術館に行きたい / 新宿 / out_of_area` の行が記録されたことを確認（ADR-010 の想定どおりの通常挙動） |
| 2026-08-20 | `b52c99fb-ad26-4f74-96df-7c2a30ade11b` | プラン画面で `aggregate_dataset` の `unanswered` を握りつぶさず `gaps` へ合流させる修正（#95 / PR #98。#89 のプラン版）。**`src/` のみの変更**だが、フロントエンドはデプロイしないと画面に出ないためデプロイ（§3「いつデプロイするか」）。`worker/` `shared/` `migrations/` `data/` `scripts/` は未変更のため、マイグレーション・シードは実行していない | チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404）。`index.html` のバンドル（`assets/index-Cb0O0LlG.js`）はローカルビルドとハッシュ一致。コア3操作も実測（`上野の寺社をめぐりたい` の search → aggregate（寛永寺）→ provenance（CC BY 4.0 の出典1件）が一連で `answered`）。**修正が効く条件（集計側の `unanswered`）が本番で発生することも確認した** — クエリ `統計` で `samples: []` の `t000012d0000000081`（R6国・地域別外国人旅行者行動特性調査）が候補に入り、それを集計すると `insufficient_granularity` の `unanswered` が返る。修正前のプラン画面はこの応答で停留地が黙って消えていた（PR #93 のデプロイ時に確認した「到達条件」と同一で、今回はプラン側=自然文 `query` 経由でも候補に入ることを確認）。**本番 D1 への書き込みが発生している** — 上記の実測で `gaps` に `統計` の `insufficient_granularity` が記録される（ADR-010 の想定どおりの通常挙動） |
| 2026-08-20 | `9d4ee8c8-728c-4cad-a06a-c7538ae724ff` | あなたへ画面で `aggregate_dataset` の `unanswered` を握りつぶさず `gaps` へ合流させる修正（#89 / PR #93）。**`src/` のみの変更**だが、フロントエンドはデプロイしないと画面に出ないためデプロイ（§3「いつデプロイするか」）。`worker/` `shared/` `migrations/` `data/` `scripts/` は未変更のため、マイグレーション・シードは実行していない | チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404）。`index.html` のバンドル（`assets/index-D7Z439oZ.js`）はローカルビルドとハッシュ一致。コア3操作も実測（`上野の寺社をめぐりたい` が `answered`、対象エリア外が HTTP 200 の `unanswered(out_of_area)`）。**本修正は現行のチップ構成では画面の見え方を変えない。それを実測で確かめた** — あなたへ画面の現行呼び出し（`interests` 4件・`limit: 6`）が返す候補6件すべてを `aggregate_dataset` に通し、6件とも `answered`（集計側の欠損が1件も出ない）ことを確認。Issue #89 の「現行の `FORYOU_INTEREST_TAGS` では到達しない」が本番でも成立している。**到達したときに修正が効く条件も本番で確認した** — 興味「統計」を送ると `samples: []` の`t000012d0000000081`（R6国・地域別外国人旅行者行動特性調査）が候補に入り、それを集計すると `insufficient_granularity` の `unanswered` が返る。修正前はこの応答でカードが黙って消えていた。**本番 D1 への書き込みが発生している** — 上記の実測で `gaps` に4行（`統計` の `insufficient_granularity` / `other`、`ラーメン、文化、家族向け、自然` の `insufficient_granularity` ×2、`新宿の美術館に行きたい` の `out_of_area`）が記録されたことを確認（ADR-010 の想定どおりの通常挙動） |
| 2026-08-19 | `b7680bf0-b47e-4a4d-81f8-f2b10b5ee315` | `search_datasets` の候補選定を興味カバレッジ優先にする修正（#84 / PR #86）。`worker/core/search-gaps.ts` と `worker/core/operations.ts` の変更のためデプロイ（§3「いつデプロイするか」）。`migrations/` `data/` `scripts/` は未変更のため、マイグレーション・シードは実行していない | デプロイ後の確認チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404）。`index.html` のバンドル（`assets/index-C-fp05dy.js`）はローカルビルドとハッシュ一致で、**フロントエンドは PR #82 から変わっていない**（本 PR の `src/` 変更はコメントのみ）。コア3操作をすべて実測 — `search_datasets`（`上野の寺社をめぐりたい`）が `answered`、対象エリア外（`新宿の美術館`）が HTTP 200 の `unanswered(out_of_area)`、`aggregate_dataset` が `answered`、`get_provenance`（`/api/provenance`）が CC BY 4.0 の出典1件を返すこと。本修正の要点も本番で確認した — `{"interests":["ラーメン","文化","家族向け","自然"],"limit":4}` が［名所・史跡／文化観光施設／トイレ情報／**都市公園・都立公園一覧**］を返し「自然」の `other` 欠損が出ないこと、`limit: 6`（あなたへ画面の現行値）では同点6件がそのまま返り**従来と同一**であること、`{"interests":["観光","家族向け","自然"],"limit":2}` では枠が尽きて「自然」が `other` の欠損として残ること（既知の限界・仕様どおり）。**本番 D1 への書き込みが発生している** — 上記のうち欠損を伴う応答は `toGapRecords` の経路で `gaps` 行が記録される（ADR-010 の想定どおりの通常挙動） |
| 2026-08-19 | `fa934ef5-e942-4e17-8ed1-1ae3871e70b5` | あなたへ画面（興味チップ・レコメンドカード・出典つき / PR #82）。**`src/` と文書のみの変更**だが、フロントエンドはデプロイしないと画面に出ないためデプロイ（§3「いつデプロイするか」）。`worker/` `shared/` `migrations/` は未変更のため、マイグレーション・シードは実行していない | `/api/health` の `runtime` が `Cloudflare-Workers`、SPA `/` が 200 で `index.html` が新バンドル（`assets/index-C-fp05dy.js`）を指し、ローカルビルドとハッシュ一致。`/api/unknown` は 404。`/showcase` は 307 →（`/showcase/`）200（Workers Assets のディレクトリ・リダイレクト。本デプロイでの変更ではない）。加えて**実ブラウザで本番の「あなたへ」タブを操作**し、「すべて」で6件（寛永寺・国立西洋美術館・絹本著色元三大師画像・上野公園大黒天横・銭湯・**恵比寿東公園**）が出典チップつきで並ぶこと、欠損表示がラーメンの `insufficient_granularity` 1件だけになること、ラーメンのチップ単独では正常な「該当するオープンデータがありません」になることを確認。**本番 D1 への書き込みが発生している** — 「すべて」の応答は `answered` だがラーメンの gap を1件伴うため、`toGapRecords` の経路で gaps 行が1行記録される（ADR-010 の想定どおりの通常挙動） |
| 2026-08-18 | `bc0c7593-5bd5-4c40-84e1-0d13157d257f` | `aggregate_dataset` の `query` に行の選定根拠と「intent の内容との照合はしていない」を明記（#78 / PR #79）。`worker/core/operations.ts` のみの変更で、`migrations/` は未変更のためマイグレーション・シードは実行していない | チェックリスト4項目 OK（health の runtime / SPA 200 / showcase 200 / api 404）。加えて `POST /api/aggregate-dataset` に無エリア（`寺社を1件`）と浅草指定（`浅草の寺社を1件`）を投げ、両経路の `query` に新しい選定根拠と未照合の明記が載ること、浅草側の行番号（27行目）と選定根拠が同じ sample から出ていることを確認。`search_datasets` の疎通も確認。伝播直後の1回目は旧版が応答し、約20秒後の再実行で新版を確認した。**本番 D1 の実測は行っていない** — `gaps` の記録経路は本変更で触れておらず（`answered` は記録対象外のまま）、テストで担保 |
| 2026-08-18 | `8553395f-a161-4fda-87e6-1274b2c708a8` | プラン画面のペース別表示件数とデータギャップ表示（PR #49）。**`src/` のみの変更**だが、フロントエンドはデプロイしないと画面に出ないためデプロイ（§3「いつデプロイするか」）。`worker/` `shared/` `migrations/` は未変更のため、マイグレーション・シードは実行していない | `/api/health` OK。`index.html` が新バンドル（`assets/index-C6r66paK.js`）を指し、ローカルビルドとハッシュ一致。バンドル内に #54 の見出し「答えられなかった点があります」と、表示上限の注記「〜件を伏せています」が含まれることを確認 |
| 2026-08-18 | `5b6f5f35-428f-4670-a81b-29d442fc58a4` | `operations.ts` を `search-gaps.ts` と分割（#71 / PR #74・挙動変更なしの移動のみ）。`worker/` の変更のためデプロイ。`migrations/` 未変更のためマイグレーション・シードは実行していない | `/api/health` OK。#70 の代表入力（`{"interests":["ラーメン"],"areas":["上野","新宿"]}`）が分割前と同一応答（`insufficient_granularity` + gaps 新宿）であることを確認 |
| 2026-08-18 | `d6afba6e-1451-4499-b00f-db06bf82d02c` | `unanswered` 応答に `gaps` を追加（#70 / PR #73）。`worker/` と `shared/core.ts` の変更のためデプロイ。`migrations/` 未変更のためマイグレーション・シードは実行していない | `/api/health` OK。`{"query":"","interests":["ラーメン"],"areas":["上野","新宿"]}` が `unanswered(insufficient_granularity)` + `gaps` に新宿（`out_of_area`・`area` 付き）で返ることを確認（本番 D1 への記録経路は同一実装のためテストで担保） |
| 2026-08-18 | `aceb02d5-4dc2-4227-8831-884933dc54ca` | `search_datasets` に構造化入力 `interests` / `areas` を追加（#58・#53 / PR #69 / ADR-011）。`worker/` と `shared/core.ts` の変更で、`migrations/` は未変更のためマイグレーション・シードは実行していない | 下記チェックリスト全項目 OK。加えて `POST /api/search-datasets` に `{"query":"渋谷から上野の美術館へ行きたい","areas":["上野"]}`（gaps なし＝出発地の過検知が消える）と `{"query":"上野で夜遊びしたい","interests":["ナイトライフ"]}`（銭湯＋興味の取り落ち gap）を投げて確認、`area`＋`areas` 同時指定の 400 も確認。**本番 D1 の `gaps` に `ナイトライフ、上野で夜遊びしたい / 上野 / other` の行が入ること**を確認。伝播直後の1回目は旧版が応答した（旧仕様どおり query から渋谷を過検知した行が1行残っている） |
| 2026-08-18 | `f4a09425-4bb5-4988-856a-ee4ed554af3a` | マナー・作法の問いを調査済み欠損（`data_not_published`）としてデータ公開リクエストへ還元（#43 / PR #66 / ADR-010）。`worker/core/operations.ts` のみの変更で、`migrations/` は未変更のためマイグレーション・シードは実行していない | 下記チェックリスト全項目 OK。加えて `POST /api/search-datasets` にマナー単独（`{"query":"日本のマナーを知りたい"}`）と混在（`{"query":"上野の美術館と作法"}`）を投げ、前者が `data_not_published` の全体応答・後者が `answered` ＋ `gaps` 添付で返ること、**本番 D1 の `gaps` に両方の `data_not_published` 行が入ること**を確認。伝播直後の1回目は旧版が応答した（`other` の記録が1行残っており、旧版でも記録自体は動いていた） |
| 2026-08-18 | （Worker 未変更・`npm run db:seed` のみ） | めぐりん停留所の施設名からのエリア継承（#36 / PR #64）。`scripts/` の変更で spots 3 件の `area` が変わるためリモート D1 へ再シード。`migrations/` 未変更のため migrate は実行せず、`worker/` 未変更のため deploy も実行していない | リモート D1 を実測: めぐりんのエリア別件数が 上野 18・浅草 14・判定不能 40（継承前は 上野 15・判定不能 43）、総 `spots` 1,645 件・`gaps` 17 行が保持されていることを確認 |
| 2026-08-18 | `93877284-fa41-4c66-934c-e8ca9d817a20` | 分類指定の空振り・最後のフォールバックの `message` を「実際に照合した集合の記述」へ変更（#59 / PR #62）。`worker/core/operations.ts` のみの変更で、`migrations/` は未変更のためマイグレーション・シードは実行していない | 下記チェックリスト全項目 OK。加えて `POST /api/search-datasets` に `{"query":"上野","category":"公園"}`（分類ガード）と `{"query":"演劇"}`（最後のフォールバック）を投げ、両分岐とも新文言（「見つかりませんでした」書き出し・断定なし）で返ること、**および本番 D1 の `gaps` に `上野/公園/other` と `演劇/null/other` の行が入ること**を確認。伝播待ちは不要だった（1回目で新版が応答） |
| 2026-08-18 | `e227f4bd-27d1-4cb9-bbc8-bd5836dc4c89` | 訊かれたエリアの取り落ちを欠損として残す修正（#52 / PR #57）。`worker/core/operations.ts` と `shared/core.ts` の変更で、`migrations/` は未変更のためマイグレーション・シードは実行していない | 下記チェックリスト全項目 OK（`spots` 1,645 件も確認）。加えて `POST /api/search-datasets` に `{"query":"上野・渋谷"}` を投げ、応答の `gaps` に `area: "渋谷"` が載ること、**および本番 D1 の `gaps` に `上野・渋谷 / 渋谷 / other` の行が入ること**を確認。伝播待ちは不要だった（1回目で新版が応答） |
| 2026-08-18 | `e59252e4-5b11-4ab7-88d4-d4dfe3f042b6` | エリア・フォールバックに欠損を添える修正（#50 / PR #51）。`worker/core/operations.ts` のみの変更で、`migrations/` は未変更のためマイグレーション・シードは実行していない | 下記のとおり全項目 OK。伝播直後の1回目は旧版が応答したため、数秒待って再確認した |
| 2026-08-17 | `fa5f556b-675b-43ea-9553-aedc2de4c361` | コア3操作（#22）・未回答記録（#27）・部分欠損（#29）・エリア判定修正（#30）・プラン画面の API 接続（#31）を一括反映。あわせてリモート D1 を初回マイグレーション＋シード（`datasets` 10 / `spots` 1,645） | 下記のとおり全項目 OK |

### デプロイ後の確認

```bash
U=https://tabi-concierge-tokyo.opendata-002.workers.dev
curl -s $U/api/health   # runtime が "Cloudflare-Workers" であること
curl -s -o /dev/null -w '%{http_code}\n' $U/            # 200（SPA）
curl -s -o /dev/null -w '%{http_code}\n' $U/showcase/   # 200（デザインプロトタイプ）
curl -s -o /dev/null -w '%{http_code}\n' $U/api/nope    # 404（SPA に倒れないこと）
```

`/api/health` の `runtime` は、**ローカルと本番が同じランタイムで動いているか**を実測するために置いている。設定ファイルの読み合わせでは確認できない。

**疎通だけでは足りない。** 2026-08-17 の事故は `/api/health` が正常に応答したまま起きた（古い Worker にも health はある）。コア3操作と D1 まで実際に叩く。

```bash
U=https://tabi-concierge-tokyo.opendata-002.workers.dev

# 1. コア3操作が生きている（404 でない）
curl -s -X POST $U/api/search-datasets -H 'content-type: application/json' \
  -d '{"query":"上野の寺社をめぐりたい","area":"上野"}'

# 2. 対象エリア外は HTTP 200 の unanswered（エラーにしない）
curl -s -X POST $U/api/search-datasets -H 'content-type: application/json' \
  -d '{"query":"新宿の美術館に行きたい","category":"美術館"}'

# 3. 上の呼び出しが gaps に記録されている（DOMAIN.md §8 不変条件4 が本番でも成立）
npx wrangler d1 execute tabi-concierge-tokyo --remote \
  --command "SELECT question, area, category, reason FROM gaps ORDER BY id DESC LIMIT 3"

# 4. データが入っている
npx wrangler d1 execute tabi-concierge-tokyo --remote \
  --command "SELECT COUNT(*) FROM spots"   # 1645
```

**3 が最重要。** `gaps` テーブルが無くても未回答の応答は 200 で正常に返り、記録の失敗は `console.error` に出るだけなので、**画面を見ても API を叩いても気づけない**（[Issue #27](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/27) でテストを2通り書いて捕まえた失敗モードそのもの）。

2026-08-17 の反映後、4項目すべてが期待どおりであることを確認済み。`gaps` には `out_of_area`（area=新宿・category=美術館）と `insufficient_granularity`（area=上野）が**解決後のエリアつきで**記録された。

### 静的アセットの挙動（注意）

- `not_found_handling: "single-page-application"` により、**存在しないパスだけ** `index.html` に倒れる。実在する `/showcase/*` はそのまま配信される
- 既定の `html_handling` により `/showcase/xxx.dc.html` は `/showcase/xxx.dc` へ 307 リダイレクトされる。ブラウザは追従するため実害はない
- 静的アセットへのリクエストは**無料・無制限**で、Worker のスクリプトサイズ上限（3 MB gzip）にもカウントされない

### 環境変数と secret

- 非機密: `wrangler.jsonc` の `vars`
- 機密: `npx wrangler secret put NAME`（対話プロンプト。**コマンド引数や `echo` パイプで値を渡さない**）
- ローカル: `.dev.vars`（gitignore 済み）

### バインディングを追加したとき

`wrangler.jsonc` を変更したら型を再生成する。`Env` は手書きしない。

```bash
npm run cf-typegen   # wrangler types
```

### ロールバック

```bash
npx wrangler versions list
npx wrangler rollback [<VERSION_ID>]
```

## 4. モニタリング

### 監視項目

- **アプリケーションメトリクス**: CPU、メモリ、レスポンスタイム
- **ビジネスメトリクス**: ユーザー数、エラー率、トランザクション
- **インフラメトリクス**: サーバー稼働率、ネットワーク

### アラート設定

- CPU使用率 > 80%
- エラー率 > 5%
- レスポンスタイム > 1秒（P95）

### 詳細ドキュメント

`deployment/monitoring.md`

## 5. ロールバック戦略

### 自動ロールバック条件

- エラー率が5%を超える
- P99レスポンスタイムが1秒を超える
- メモリ使用率が90%を超える

### 手動ロールバック

```bash
# 前バージョンにロールバック
./scripts/rollback.sh [deployment-id]
```

### 詳細ドキュメント

`deployment/infrastructure.md` の「4. ロールバック戦略」節

## 6. 災害復旧

### バックアップ戦略

- **データベース**: 日次バックアップ、30日保持
- **アプリケーションデータ**: 時間次バックアップ、7日保持
- **設定ファイル**: 変更時バックアップ、90日保持

### 復旧手順

```bash
# 最新バックアップから復元
./scripts/disaster-recovery.sh
```

### 詳細ドキュメント

`deployment/infrastructure.md` の「5. 災害復旧 (DR)」節

## 7. 運用手順

### 定期メンテナンス

| タスク             | 頻度  | 手順             | 担当   |
| ------------------ | ----- | ---------------- | ------ |
| セキュリティパッチ | 月次  | patch-update.sh  | DevOps |
| 証明書更新         | 3ヶ月 | cert-renewal.sh  | DevOps |
| ログローテーション | 週次  | 自動             | -      |
| バックアップ検証   | 月次  | backup-verify.sh | DevOps |

### トラブルシューティング

一般的な問題の対処方法は `deployment/monitoring.md` の「トラブルシューティング」節を参照。

## 8. 開発環境の最適化

### Claude Code SessionStart Hook

PRマージ後のブランチ切り替え忘れを防ぐため、セッション開始時に自動チェック。

### 設定方法

`.claude/hooks/check-branch-status.sh` を配置。

### 詳細ドキュメント

`deployment/ai-tools-integration.md` の「SessionStart Hook」節

---

## 📚 AIツール向けナビゲーション

### 検索クエリマッピング

> 参照ドキュメントはすべて初期セット外の `deployment/*.md`。未導入の場合は `${CLAUDE_PLUGIN_ROOT}/docs-template/05-operations/deployment/` からコピーしてください。

| 知りたいこと             | 参照ドキュメント                            | セクション           |
| ------------------------ | ------------------------------------------- | -------------------- |
| Gitワークフロー全体      | `deployment/git-workflow.md`                | 全体                 |
| セルフレビュー方法       | `deployment/self-review.md`                 | 全体                 |
| ナレッジ記録方法         | `deployment/knowledge-management.md`        | 全体                 |
| ACE Playbook更新         | `deployment/ace-cycle.md`                   | 全体                 |
| PRレビュー対応           | `deployment/git-workflow.md`                | ステップ7            |
| レビュー結果の対応ルール | `deployment/review-response-policy.md`      | 全体                 |
| ワークフロー運用原則     | `deployment/workflow-principles.md`         | 全体                 |
| 削除事故防止ハーネス     | `deployment/agent-deletion-prevention-harness.md` | 全体             |
| クロスモデルレビュー     | `deployment/multi-cli-review-orchestration.md` | クロスモデルレビュー |
| CI/CD設定                | `deployment/ci-cd.md`                       | GitHub Actions       |
| インフラ構成             | `deployment/infrastructure.md`              | Terraform            |
| モニタリング             | `deployment/monitoring.md`                  | CloudWatch           |

### AIツール向けプロンプトテンプレート

```
「[トピック]について、deployment/[ファイル名]を参照して説明してください」
```

例:

- 「セルフレビューについて、deployment/self-review.mdを参照して説明してください」
- 「CI/CDパイプラインについて、deployment/ci-cd.mdを参照して説明してください」

---

## Changelog

### [1.5.0] - 2026-08-21

#### 追加

- §3 に「AI Gateway / Workers AI」小節を追加（[Issue #116](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/116)・ADR-013）。ゲートウェイ ID `default` が自動作成される予約名であること、名前付きへ切り替える手順、未作成の名前を指定すると推論が `AiGatewayError: 2001` で落ちること、ローカル開発でも実 API を叩くこと、テストは `remoteBindings: false` で外へ出さないことを記載
- §3 のデプロイ契機の表に「`wrangler.jsonc` のバインディング・`vars` を変更したとき」の行を追加。バインディングは `npm run deploy` でしか本番へ渡らない

### [1.4.16] - 2026-08-21

#### 変更

- §3「デプロイ記録」に 2026-08-21 の反映（Version ID `5aebf720-384e-41e5-a119-30ce85a0c3b8`）を追記。Issue #53 / PR #113（プラン画面の構造化送信への切り替え）の `worker/` `src/` 変更を §3「いつデプロイするか」の契機に従って反映した。確認はチェックリスト全項目に加え、Issue #53 の実測ケース（切り替え前は欠損が沈黙していた入力）が本番で `gaps` を返し、D1 に記録されることまで実測した

### [1.4.15] - 2026-08-20

#### 追加

- §3「デプロイ記録」に 2026-08-20 の反映（Version ID `45f1755e-16ee-4682-8291-90b1c29accfe`）を追記。PR #109（#107・未回答 `message` から名乗りの一文を除去し画面見出しとの重複を解消）の `worker/` `shared/` 変更を §3「いつデプロイするか」の契機に従って反映した。確認欄には、チェックリスト全項目・新文面が本番で返ること・D1 の `gaps` 記録の実測を明記した

### [1.4.14] - 2026-08-20

#### 追加

- §3「デプロイ記録」に 2026-08-20 の反映（Version ID `b52c99fb-ad26-4f74-96df-7c2a30ade11b`）を追記。PR #98（#95・プラン画面で `aggregate_dataset` の `unanswered` を `gaps` へ合流させる。#89 のプラン版）の `src/` 変更を §3「いつデプロイするか」の注記（`src/` だけの変更も画面に出ない）に従って反映した。確認欄には、コア3操作の一連疎通と、修正が効く条件（クエリ `統計` で集計側の `insufficient_granularity` が発生する）を自然文 `query` 経由でも確認した記録を明記した

### [1.4.13] - 2026-08-20

#### 追加

- §3「デプロイ記録」に 2026-08-20 の反映（Version ID `9d4ee8c8-728c-4cad-a06a-c7538ae724ff`）を追記。PR #93（#89・あなたへ画面で `aggregate_dataset` の `unanswered` を `gaps` へ合流させる）の `src/` 変更を §3「いつデプロイするか」の注記（`src/` だけの変更も画面に出ない）に従って反映した。確認欄には、本修正が**現行のチップ構成では画面の見え方を変えない**ことを実測で確かめた記録（候補6件すべてが `aggregate_dataset` で `answered`）と、**到達したときに修正が効く条件**（興味「統計」で `samples: []` のデータセットが候補に入り `insufficient_granularity` を返す）を明記した

### [1.4.12] - 2026-08-19

#### 追加

- §3「デプロイ記録」に 2026-08-19 の反映（Version ID `b7680bf0-b47e-4a4d-81f8-f2b10b5ee315`）を追記。PR #86（#84・`search_datasets` の候補選定を興味カバレッジ優先にする）の `worker/` 変更を §3「いつデプロイするか」に従って反映した。確認欄にはチェックリスト全項目に加え、コア3操作の実測と、本修正の要点（`limit: 4` で都市公園が入り「自然」の欠損が消えること・`limit: 6` では従来と同一であること・枠が尽きたときは欠損が残ること）を明記した

### [1.4.11] - 2026-08-19

#### 追加

- §3「デプロイ記録」に 2026-08-19 の反映（Version ID `fa934ef5-e942-4e17-8ed1-1ae3871e70b5`）を追記。PR #82（あなたへ画面）の `src/` 変更を §3「いつデプロイするか」の注記（`src/` だけの変更も画面に出ない）に従って反映した。確認欄には実ブラウザでの本番操作結果と、本番 D1 に gaps 行が1行記録されることを明記した

### [1.4.10] - 2026-08-18

#### 追加

- §3「デプロイ記録」に 2026-08-18 の反映（Version ID `bc0c7593-5bd5-4c40-84e1-0d13157d257f`）を追記。Issue #78 / PR #79 の `worker/` 変更を §3「いつデプロイするか」の契機に従って反映した。確認欄には実施した範囲だけを書き、本番 D1 の実測を行っていないことと理由（記録経路に変更なし）を明記した

### [1.4.9] - 2026-08-18

#### 追加

- デプロイ記録に PR #49（プラン画面のペース別表示件数・データギャップ表示）の反映を追記。`src/` のみの変更でデプロイした最初の記録

### [1.4.8] - 2026-08-18

#### 追加

- デプロイ記録に PR #73（#70: unanswered の gaps）と PR #74（#71: operations.ts 分割）の反映を追記

### [1.4.7] - 2026-08-18

#### 追加

- デプロイ記録に PR #69（構造化入力 `interests` / `areas`・#58・#53・ADR-011）の反映を追記

### [1.4.6] - 2026-08-18

#### 追加

- §3「デプロイ記録」に 2026-08-18 の反映（Version ID `f4a09425-4bb5-4988-856a-ee4ed554af3a`）を追記。Issue #43 / PR #66（ADR-010・マナーのエスカレーション）の `worker/` 変更を §3「いつデプロイするか」の契機に従って反映した

### [1.4.5] - 2026-08-18

#### 追加

- §3「デプロイ記録」に 2026-08-18 の `npm run db:seed` 反映（Issue #36 / PR #64）を追記。Worker 未変更のデータのみの反映で、Version ID は変わらないため「Worker 未変更」と明記した。確認はリモート D1 のエリア別件数・総件数・`gaps` 行の保持を実測

### [1.4.4] - 2026-08-18

#### 追加

- §3「デプロイ記録」に 2026-08-18 の反映（Version ID `93877284-fa41-4c66-934c-e8ca9d817a20`）を追記。Issue #59 / PR #62 の `worker/` 変更を §3「いつデプロイするか」の契機に従って反映した。確認はチェックリスト全項目に加え、変更した2分岐（分類ガード・最後のフォールバック）の応答文言と本番 D1 の `gaps` 記録行まで実測した

### [1.4.3] - 2026-08-18

#### 修正

- 2026-08-18（`e227f4bd`）の記録の「確認」欄を、実際に行った範囲へ書き直した。当初は新規経路の応答だけを書いていたが、それでは §3 のチェックリストを実施したのか省いたのかが読み取れない。全項目を実行したうえで、**応答だけでなく本番 D1 の `gaps` 行まで確認した**ことを明記した（記録器は書き込み失敗を握りつぶしてログにしか出さないため、応答が正しくても記録が入っているとは限らない）

### [1.4.2] - 2026-08-18

#### 追加

- §3「デプロイ記録」に 2026-08-18 の反映（Version ID `e227f4bd-27d1-4cb9-bbc8-bd5836dc4c89`）を追記。Issue #52 / PR #57 の `worker/` `shared/` 変更を §3「いつデプロイするか」の契機に従って反映した

### [1.4.1] - 2026-08-18

#### 追加

- §3「デプロイ記録」に 2026-08-18 の反映（Version ID `e59252e4-5b11-4ab7-88d4-d4dfe3f042b6`）を追記。Issue #50 / PR #51 の `worker/` 変更を §3「いつデプロイするか」の契機に従って反映した。あわせて、**伝播直後の1回目のリクエストは旧版が応答した**（`gaps` が載らなかった）ため、デプロイ直後の確認は数秒待って再実行する必要がある点を記録


### [1.4.0] - 2026-08-17

#### 修正

- §1 主要ステップ7 の「`develop` マージでは `Closes #N` が発火しない」を訂正。デフォルトブランチが `develop` のため**発火する**（手動クローズは不要）
- §1 のブランチ戦略を実態へ書き換え（[ADR-009](../06-reference/DECISIONS.md)）。テンプレート由来の Git Flow（`main` / `release/*` / `hotfix/*`）が残っており、**実際には使っていない `main` を「本番リリース」と読ませる状態**だった

#### 追加

- §3 に「いつデプロイするか」を追加（[Issue #46](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/46)）。手動デプロイという設計は維持しつつ、契機を決めていなかったために本番が43コミット遅れる事故が起きたため
- §3 にデプロイ記録の表を追加。`main` を使わない以上、「今デプロイされているもの」は Cloudflare の Version ID でしか辿れない
- §3 のデプロイ後確認を4項目へ拡充。`/api/health` は古い Worker でも応答するため疎通だけでは足りない。**`gaps` に行が増えることまで確認する**（記録の失敗は画面でも API でも気づけない）

### [1.3.0] - 2026-08-16

#### 追加

- §3 に **Cloudflare への実デプロイ手順**を記述（従来は Cloudflare の記述が1件も無かった）。環境構成・認証・デプロイ・デプロイ後の確認・静的アセットの挙動・secret・型再生成・ロールバック

### [1.2.0] - 2026-08-15

#### 変更

- 主要ステップを軽量フロー（Issue 任意 / ブランチ・PR 必須 / ACE 任意）へ変更し、メンテナ環境のフル運用を別枠に分離（ADR-006 / Issue #7）

### [1.1.0] - 2026-08-15

#### 変更

- `deployment/ace-cycle.md` を「配置済み・コピー不要」と明記（`/ace-setup` で配置し本リポジトリ向けの修正を加えているため、テンプレートからの上書きコピーで巻き戻るのを防ぐ。Issue #3）

### [1.0.0] - 2026-08-15

#### 追加

- 初版作成
