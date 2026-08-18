---
title: "DEPLOYMENT"
version: "1.4.6"
status: "draft"
owner: "@fffokazaki"
created: "2026-08-15"
updated: "2026-08-18"
changeImpact: "high"
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
| **`data/` または `scripts/` を変更してデータの中身が変わるとき** | `npm run db:seed` |
| 提出直前（2026-08-23） | 3つすべて＋下記の確認 |

`src/`（フロントエンド）だけの変更もデプロイしないと画面に出ない点に注意する。

> **リモートへ反映する順番**: マイグレーション → シード → デプロイ。シードだけ流してもテーブルが無いため失敗する（[DATABASE.md](../02-design/DATABASE.md) §2）。

#### デプロイ記録

「今デプロイされているもの」は `main` では辿れない（ADR-009）。反映したらここに記録する。

| 日時 | Version ID | 内容 | 確認 |
| --- | --- | --- | --- |
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
