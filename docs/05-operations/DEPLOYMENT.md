---
title: "DEPLOYMENT"
version: "1.2.0"
status: "draft"
owner: "@fffokazaki"
created: "2026-08-15"
updated: "2026-08-15"
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
7. **マージ** - Squash 推奨。`develop` マージでは `Closes #N` が発火しないため Issue は手動クローズ
8. **クリーンアップ** - ブランチ削除、`git fetch --prune`
9. **ナレッジ体系化（ACE）** - **任意**。メンテナ環境では必須運用 ← ACE Playbook: `deployment/ace-cycle.md`

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

### ブランチ戦略（Git Flow準拠）

```
main/master    ← 本番リリース（常時デプロイ可能）
  ↑
develop       ← 開発統合（次期リリース）
  ↑
feature/*     ← 機能開発（Issueベース）
hotfix/*      ← 緊急修正
release/*     ← リリース準備
```

**命名規則**:

- `feature/{issue-number}-{description}` 例: `feature/123-user-auth`
- `hotfix/{issue-number}-{description}` 例: `hotfix/456-security-patch`
- `release/{version}` 例: `release/1.2.0`

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

## 3. インフラストラクチャ

### 環境構成

| 環境        | 用途         | URL例               | インフラ |
| ----------- | ------------ | ------------------- | -------- |
| Development | 開発環境     | dev.example.com     | 軽量構成 |
| Staging     | ステージング | staging.example.com | 本番同等 |
| Production  | 本番環境     | app.example.com     | 高可用性 |

### デプロイメント方式

- **Blue-Green Deployment**: 本番環境
- **Rolling Update**: ステージング環境
- **Direct Deployment**: 開発環境

### 詳細ドキュメント

`deployment/infrastructure.md`

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

### [1.2.0] - 2026-08-15

#### 変更

- 主要ステップを軽量フロー（Issue 任意 / ブランチ・PR 必須 / ACE 任意）へ変更し、メンテナ環境のフル運用を別枠に分離（ADR-006 / Issue #7）

### [1.1.0] - 2026-08-15

#### 変更

- `deployment/ace-cycle.md` を「配置済み・コピー不要」と明記（`/ace-setup` で配置し本リポジトリ向けの修正を加えているため、テンプレートからの上書きコピーで巻き戻るのを防ぐ。Issue #3）

### [1.0.0] - 2026-08-15

#### 追加

- 初版作成
