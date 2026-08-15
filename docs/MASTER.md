---
title: "MASTER"
version: "1.0.0"
status: "draft"
owner: "@fffokazaki"
created: "2026-08-15"
updated: "2026-08-15"
---

# AI駆動開発マスタードキュメント

## 前提（重要・短文）

- ドキュメントはAIが迷わず理解できることを第一基準とする（人間の可読性は副次）。
- AI生成の推測/補完が混入し得るため、エンジニアは必ず一次情報（ソース/設定/設計資料/実行結果/テスト）で検証し、乖離はSSOTへ即時反映（重複は参照化）。
- 本ガイドの時間表記は目安。チーム/AIの習熟で短縮される。

## 🚨 AIツール向け重要ルール

### 情報不足時の必須確認プロトコル

AIツールは、ドキュメント生成やコード生成時に**情報が不足している場合、推論で埋めずに必ず確認を求めること**。

#### 必須確認が必要な情報

**プロジェクト基本情報**:

- [ ] プロジェクト名（具体的な名称）
- [ ] ターゲットユーザー（誰のために作るか）
- [ ] 主要機能（何を実現するか）
- [ ] 技術スタック（使用する言語・フレームワーク）

**技術的詳細**:

- [ ] データベース種別（PostgreSQL? MongoDB? MySQL?）
- [ ] 認証方式（JWT? OAuth? Session?）
- [ ] デプロイ環境（AWS? GCP? Azure? Vercel?）
- [ ] API形式（REST? GraphQL? gRPC?）

**ビジネス要件**:

- [ ] パフォーマンス要件（具体的な数値）
- [ ] セキュリティ要件（必須の対策）
- [ ] スケーラビリティ要件（同時接続数等）
- [ ] 予算・期間制約

#### 確認の出力形式

情報不足を検出した場合、以下の形式で出力すること：

```markdown
⚠️ 情報不足により確認が必要です

以下の情報が不足しているため、推論では進められません。
確認をお願いします：

【必須確認事項】

1. [項目名]: [何が不明か]
   - 例: データベース種別
   - 理由: PostgreSQLとMongoDBで設計が大きく異なるため
   - 推奨: PostgreSQL（リレーショナルデータの場合）/ MongoDB（ドキュメント指向の場合）

2. [項目名]: [何が不明か]
   ...

【オプション確認事項（推論で進める場合の前提）】

1. [項目名]: [推論内容]
   - 前提: [この前提で進めます]
   - リスク: [後で変更が必要になる可能性]
   - 確認推奨: はい/いいえ

【次のステップ】
上記を確認後、以下のコマンドで続行してください：
「[確認された情報]で進めてください」
```

#### 推論が許容される範囲

以下は**明示的な指示がない場合のデフォルト値**として使用可（ただし明記すること）：

- **TypeScript strict mode**: 常に有効（明記）
- **ランタイム/依存バージョン**: フルサポート中の最新LTS（LTS制度がない場合・フルサポート中のLTSが無い時期は最新安定版）を公式リリーススケジュール確認の上採用（明記。詳細は「バージョン選定ポリシー（LTSデフォルト）」参照）
- **テストカバレッジ目標**: 80%以上（明記）
- **マジックナンバー禁止**: 常に適用（明記）
- **エラーハンドリング**: Result pattern使用（明記）
- **命名規則**: MASTER.mdの規則に従う（明記）

**❌ 推論禁止の例**:

```
悪い例:
「データベースは一般的なので、PostgreSQLで進めます」
→ ユーザーがMySQLを想定していた場合、全て作り直し

良い例:
「データベース種別が指定されていません。
以下から選択してください：
1. PostgreSQL（推奨: リレーショナル、高機能）
2. MySQL（推奨: シンプル、広く普及）
3. MongoDB（推奨: ドキュメント指向、柔軟）
4. その他（具体的に指定してください）」
```

#### 段階的確認の推奨

大きな決定事項は段階的に確認：

```markdown
✅ 推奨フロー:

ステップ1: 大枠の確認
「このプロジェクトは、Webアプリケーションですか？
それともモバイルアプリですか？API専用ですか？」

↓

ステップ2: 技術スタックの確認
「Webアプリケーションの場合、
フロントエンド: React? Vue? Next.js?
バックエンド: Node.js? Python? Go?」

↓

ステップ3: 詳細仕様の確認
「Next.js採用の場合、

- App Router? Pages Router?
- 認証: NextAuth.js? Auth0? 独自実装?」
```

#### 人間の検証タイミング

AIが生成したドキュメント・コードは、以下のタイミングで**必ず人間が検証**：

1. **MASTER.md生成後** - プロジェクト全体の方向性確認
2. **ARCHITECTURE.md生成後** - 技術的決定事項の妥当性確認
3. **コード生成後** - ビジネスロジックとセキュリティの確認
4. **デプロイ前** - 本番環境設定の確認

---

## プロジェクト識別情報

- **プロジェクト名**: 旅コンシェルジュTOKYO（Tabi Concierge Tokyo）
- **バージョン**: Frontmatter の `version` を参照
- **使用AIツール**: Claude Code（本リポジトリの主要ツール）。GitHub Copilot / Cursor は未使用（使う場合は設定ファイルとあわせて追記する）
- **最終更新日**: Frontmatter の `updated` を参照
- **チーム**: チームshiwata（株式会社フィールフロウ / FeelFlow Inc.）
- **文脈**: 東京都知事杯オープンデータ・ハッカソン 2026 参加プロジェクト

## プロジェクト概要

東京都オープンデータカタログの約9,600データセットを、訪日観光客向け AI 旅行ガイドの背後で活用し、すべての提案に出典を付けて届けるサービス。答えられなかった質問はデータ公開リクエストとして東京都へ還元する。

- **何を作るか**: 旅行アプリ「旅コンシェルジュTOKYO」（5機能）＋ その頭脳である「オープンデータ・コンシェルジュ」（MCP サーバー）
- **なぜ作るか**: 約9,600データセットが公開されているのにカタログ閲覧は1日約200PV。「1データ＝1アプリ」という活用の型が、公開と活用を断絶させているため
- **誰のためか**: 一次は訪日観光客。二次は東京都・GovTech東京（データ改善の示唆）、および翌年のハッカソン参加者（MCP 基盤の開放）

## 技術スタック

### バージョン選定ポリシー（LTSデフォルト）

AIツールがランタイム・依存のバージョンを選定する際は、以下のルールに従うこと。

1. **フルサポート中の最新LTSをデフォルトとする** — LTS制度の有無は技術ごとに公式リリーススケジュールで確認する。LTS制度がある技術（Node.js / Java / .NET / Django 等）はフルサポート中の最新LTS（Node.js でいう Active LTS。Maintenance・セキュリティ限定フェーズは除く）を採用し、フルサポート中のLTSが存在しない時期はフルサポート中の最新安定版で代替する（次のLTSリリース時に移行を検討）。LTS制度がない技術（Python や多くのフレームワーク / ライブラリ）はフルサポート中の最新安定版を採用する
2. **EOL（サポート終了）バージョンの選定禁止** — セキュリティパッチが提供されないバージョンは、いかなるデフォルト選定でも使用しない
3. **選定時のWeb検証義務** — AIは学習データのバージョン知識を信用せず、選定時に公式リリーススケジュール（例: nodejs.org のリリースページ、github.com/nodejs/Release）を必ず確認する。集約サイト（例: endoflife.date。コミュニティ運営の二次情報）は補助として併用してよい。確認日と情報源URLを下の「概要（バージョン付き）」表の「確認日・情報源」列に記録する
4. **例外はユーザー承認 + 記録** — 既存依存の制約等でフルサポート外の古いバージョン（EOL 版を含む）が必要な場合は、理由とリスクをユーザーに提示して承認を得た上で、[DECISIONS.md](./06-reference/DECISIONS.md)（ADR）に記録する

> **なぜ必要か**: AIには学習データのカットオフがあるため、AIが「最新」と認識しているバージョンは古い可能性があります。ルールなしで選定を任せると、学習データ中の頻出バージョン（EOL済みを含む）に引っ張られます。

### 概要（バージョン付き）

> **重要**: AIには学習データのカットオフがあるため、バージョンを明記することで正しい書き方を指示できます。

| カテゴリ | 技術 | バージョン | 確認日・情報源 | AIへの注意点 |
| -------- | ---- | ---------- | -------------- | ------------ |
| Frontend | React | 18.x | 未確認（実装着手時に確定） | UI は実装済み。既存実装の書き方に合わせる |
| Frontend Runtime | dc-runtime | 未確認 | 未確認（実装着手時に確定） | 既存 UI がこの構成で動作している |
| Protocol | MCP（Model Context Protocol） | 未確認 | 未確認（実装着手時に確定） | ツールは汎用語彙で定義する（旅行アプリ固有の語彙を持ち込まない） |
| Backend | OpenCode ＋ Cloudflare Workers AI | 未確認 | 未確認（主催者提供スタック） | 主催者公認スタックで完結させる |
| Database | 使用しない | - | - | POC は同梱静的データ。DB を前提としたコードを生成しない |
| Infra | Cloudflare | マネージド | - | サーバーレス。コンテナ構成を前提にしない |

> **未確認の扱い**: 上表の「未確認」は、推測で埋めずに実装着手時へ持ち越している項目。実バージョンを確認したら本表と [ARCHITECTURE.md](./02-design/ARCHITECTURE.md) §8 を同時に更新すること。

### AIへの補足（カットオフ対策）

> 以下の技術はAIのカットオフ後にリリースされた可能性があります。
> 使用時は仕様書で書き方を明示してください。

- MCP（Model Context Protocol）: 仕様の更新が速い。ツール定義を書く前に採用バージョンの仕様を確認すること
- Cloudflare Workers AI: 提供モデル・API が変化しやすい。公式ドキュメントで現行の呼び出し形式を確認すること

### 詳細

#### フロントエンド

- フレームワーク: React 18.x（日本語版・英語版の2バージョンが実装済み・2026-08-15 動作確認）
- 状態管理: 未確認（既存 UI 実装に準ずる）
- スタイリング: 未確認（既存 UI 実装に準ずる）
- ビルド: JSX 事前変換 ＋ ローカル React バンドル（CDN 依存を外しオフライン動作を確認済み）

#### バックエンド

- 言語/フレームワーク: OpenCode ＋ Cloudflare Workers AI
- API形式: MCP ツール（最小3つ: データセット検索・集計・出典取得）
- 認証方式: なし（POC。外部公開時に再設計）

#### データベース

- 種別: 使用しない（ダウンロード済みオープンデータを同梱）
- ORM/ODM: 該当なし

#### インフラ/ホスティング

- クラウドプロバイダー: Cloudflare
- コンテナ/オーケストレーション: 使用しない（サーバーレス）

#### 開発ツール

- パッケージマネージャー: 未確認
- ビルドツール: JSX 事前変換
- リンター/フォーマッター: 未確認
- AI駆動デバッグ: Playwright MCP（推奨）

※ 詳細な技術スタックと選定理由（ADR）は [ARCHITECTURE.md](./02-design/ARCHITECTURE.md) を参照

## アーキテクチャパターン

- [ ] Clean Architecture
- [ ] Repository Pattern
- [ ] CQRS (Command Query Responsibility Segregation)
- [ ] Event-Driven Architecture
- [ ] Microservices
- [ ] Monolithic
- [x] その他: **クライアント／MCP サーバー分離** — フロントエンド（旅行アプリ）とバックエンド（オープンデータ・コンシェルジュ）を MCP で接続し、バックエンドを再利用可能な基盤として独立させる（ADR-003）
- [x] その他: **出典強制（Provenance by Design）** — 全回答経路が出典生成を通過し、出典を作れない場合は回答を生成しない（ADR-005）

## ディレクトリ構造

リポジトリのトップレベル構造と各ディレクトリの責務。AIツールはコードの配置判断・探索の起点としてここを参照する。

```text
tabi-concierge-tokyo/
├── docs/                 # AI仕様駆動開発ドキュメント（詳細は「ドキュメント構造ガイド（AIツール向け）」を参照）
├── frontend/             # 旅コンシェルジュTOKYO（React UI・5機能: プロフィール/プラン/スキャン/周辺/あなたへ）
├── mcp-server/           # オープンデータ・コンシェルジュ（MCP サーバー。検索・集計・出典取得）
├── data/                 # 利用オープンデータ（最大10件）の実体とメタ情報（カタログURL・タイトル・取得日）
└── .github/
    └── skills/           # プロジェクト固有の開発規約スキル（レビュー・エラーハンドリング・テスト）
```

- `frontend/` `mcp-server/` `data/` は**未作成**（POC 実装時（〜2026-08-23）に作成する予定の構成）。実際に作成した時点で本節を実態に合わせて更新すること
- 層構成ではなく「クライアント／サーバー」で分割している。この境界は ADR-003 の設計判断そのものであり、安易に跨がせない
- 層構成の詳細は [ARCHITECTURE.md](./02-design/ARCHITECTURE.md)、テスト戦略は [TESTING.md](./04-quality/TESTING.md) を参照
- 新規コードの配置判断は、上記のディレクトリ構造と [ARCHITECTURE.md](./02-design/ARCHITECTURE.md) §3 を根拠にする。[DECISION_TREE.md](./03-implementation/DECISION_TREE.md) は Web API バックエンド前提のサンプルのままで**本プロジェクトに未適用**のため、固有化するまで必須の判断根拠にしない
- `docs/` 配下の詳細構造は本書の「ドキュメント構造ガイド（AIツール向け）」を参照（重複記載しない）

## コード生成ルール

### 必須事項

1. **型安全性**: すべての変数、関数、APIレスポンスに明示的な型定義を付与
2. **エラーハンドリング**: try-catchブロックで適切にエラーを処理し、ユーザーフレンドリーなメッセージを表示
3. **テストコード**: 各機能に対して単体テストを作成（カバレッジ目標の内訳は `.github/skills/test-patterns/SKILL.md` を SSOT とする: branches 70% / functions・lines・statements 各 80%）
4. **コメント**: 複雑なロジックには日本語でコメントを追加
5. **リーダブルコード**: 単一責任の原則に従い、関数は30行以内に収める
6. **マジックナンバー禁止**: 意味のある数値/文字列の直接埋め込みを禁止。必ず名前付き定数または設定から注入し、単位・範囲を明示（詳細は `PATTERNS.md` を参照）
7. **配置判断**: 新機能追加時の「どこに書くか」は「ディレクトリ構造」節と [ARCHITECTURE.md](./02-design/ARCHITECTURE.md) §3 で判断する（[DECISION_TREE.md](./03-implementation/DECISION_TREE.md) は本プロジェクト未適用のサンプル。固有化後に判断根拠へ昇格させる）。言語別の雛形（例: TypeScript）が用意されている場合は、実装前に `${CLAUDE_PLUGIN_ROOT}/docs-template/03-implementation/templates/README.md` からコピーして使う（初期セット外・必要時にコピー。SKELETON を直接 import しない）。

### 命名規則

#### コード

- **変数名**: camelCase（例: userName, isActive）
- **定数名**: UPPER_SNAKE_CASE（例: MAX_RETRY_COUNT）
- **型名/インターフェース**: PascalCase（例: UserProfile, ApiResponse）
- **ファイル名**:
  - コンポーネント: PascalCase（例: UserCard.tsx）
  - ユーティリティ: camelCase（例: dateHelpers.ts）
  - 設定ファイル: kebab-case（例: eslint-config.js）

#### ドキュメントファイル

- **ディレクトリ**:
  - 形式: `数字-英語小文字（ハイフン区切り）`
  - 例: `01-context`, `02-design`, `03-implementation`
- **ファイル名**:
  - メインドキュメント: `UPPER_SNAKE_CASE.md`（AI識別性優先・複数語はアンダースコア `_` 区切り）
  - 例: `MASTER.md`, `ARCHITECTURE.md`, `LESSONS_LEARNED.md`, `DEVELOPMENT_PREPARATION.md`
  - サブフォルダ内ファイル: `lowercase-with-hyphens.md`（例: `git-workflow.md`, `phased-rollout.md`）
  - 詳細・適用条件・逸脱判断は README.md（ff-dev-toolkit プラグイン同梱、`${CLAUDE_PLUGIN_ROOT}/docs-template/README.md` の「ファイル名命名規則」章、初期セット外）を SSOT とする
- **禁止事項**:
  - ❌ 日本語ファイル名
  - ❌ スペースを含むファイル名
  - ❌ メインドキュメントでのハイフン区切り（複数語は `UPPER_SNAKE_CASE.md` を使用）
  - ❌ ファイル名への番号プレフィックス（ディレクトリのみ使用）

- **例外**:
  - `README.md`（標準的な慣習）
  - `CLAUDE.md`, `AGENTS.md`（AIツール向け特殊ファイル）
  - `.github/copilot-instructions.md`, `.cursor/rules/*.mdc`（ツール固有の命名・配置。Legacy `.cursorrules` は後方互換）

### 禁止事項

- ❌ any型の使用（やむを得ない場合はコメントで理由を明記）
- ❌ console.logの本番コードへの残留
- ❌ マジックナンバーの直接使用（定数として定義すること）
- ❌ 未使用のインポートや変数の放置
- ❌ エラーの握りつぶし（catch節で何もしない）

## 実装優先順位

詳細は [ROADMAP.md](./07-project-management/ROADMAP.md)・[TASKS.md](./07-project-management/TASKS.md) を参照。

> **Phase 番号の SSOT は [ROADMAP.md](./07-project-management/ROADMAP.md)**。本節はその Phase 2 以降を実装観点で並べ直したもので、独自の採番はしない。

### Phase 2: POC 実装・提出準備（〜2026-08-23）

1. オープンデータをダウンロードしてアプリに組み込む（POC 実証）
2. MCP 最小3ツール（データセット検索・集計・出典取得）とフロントからの接続
3. 代表エリア（渋谷・上野）の画面イメージと、出典付き回答の縦貫通

### Phase 3〜4: 拡張機能（First Stage 収録 〜 Final Stage 準備）

1. 未回答ログの分類とデータ公開リクエストへの変換
2. スキャン（画像認識＋文化ガイド）の実装
3. 介助者モード・音声対応

### Final Stage 以降: 最適化・基盤開放

1. 同梱データから動的取り込みへの移行判断
2. MCP サーバーの外部公開（翌年参加者への開放）
3. 都への API 公開提案

## エラーハンドリング方針

- **API通信エラー**: リトライ機構とフォールバック表示（本番のみ。開発時はエラーを伝播）
- **バリデーションエラー**: フィールド単位でのリアルタイム表示
- **予期しないエラー**: エラーバウンダリーでキャッチし、エラー画面表示
- **ログ記録**: 構造化ログで詳細を記録（個人情報は除外）
- **フォールバック戦略**: 開発環境ではFail-Fast、本番環境でのみGraceful Degradation（詳細: [FALLBACK.md](./03-implementation/FALLBACK.md)）

### 本プロジェクト固有のルール

- **「データがない」はエラーではない**: 根拠となるデータセットが見つからない場合は、例外にせず「回答なし＋未回答理由の分類」を正常な結果として返す（[DOMAIN.md](./02-design/DOMAIN.md) §7）
- **未回答を握りつぶさない**: 未回答は必ず分類して記録する。ログを出さずに握りつぶす実装は、本プロジェクトでは機能の欠落そのもの
- **出典なしの回答を返さない**: 出典を生成できない場合、回答を生成せずに止める。「とりあえず答える」フォールバックを実装しない

## セキュリティ要件

- [ ] 入力値のサニタイゼーション
- [ ] SQLインジェクション対策 — Text-to-SQL で生成したクエリが同梱データ以外へ到達しないことを確認する
- [ ] XSS対策
- [ ] CSRF対策
- [ ] 適切な認証・認可 — POC では認証を伴う機能を実装しない方針（外部公開時に再設計）
- [ ] HTTPSの使用
- [ ] 環境変数での機密情報管理

> 取り扱うのは公開済みオープンデータのみで、個人を特定する情報は保持しない（[CONSTRAINTS.md](./01-context/CONSTRAINTS.md) §3）。

## パフォーマンス目標

- **ページロード時間**: 未定（POC 実装時に実測して設定）
- **API応答時間**: 未定（同上）
- **同時接続数**: 未定（First Stage はライブデモ不可のため、収録時点で負荷要件なし）
- **体験指標**: 情報探索時間 約30分 → 約3分（提出までに実測で更新。単一応答の SLA ではない）

## 開発フロー

1. 要件確認（PROJECT.md参照）
2. 設計確認（ARCHITECTURE.md参照）
3. 実装（PATTERNS.md参照）
4. テスト（TESTING.md参照）
5. デプロイ（DEPLOYMENT.md参照）
6. 開発環境最適化（DEPLOYMENT.md「開発環境の最適化」参照）

## AI仕様駆動Git Workflow

本プロジェクトでは、Git FlowをベースとしたAI開発ツール最適化ワークフローを採用しています。

**基本フロー**: Issue → Branch → Commit → **Self-Review** → PR → Review → Merge → Cleanup → **Knowledge (ACE + Discussions)** → Next Task

詳細は [DEPLOYMENT.md](./05-operations/DEPLOYMENT.md#1-ai仕様駆動git-workflow) を参照してください。

**重要なポイント**:

- すべての作業はIssueから開始
- ブランチ名: `feature/{issue-number}-{description}`
- コミットメッセージにドキュメント参照を含める（例: `docs/MASTER.md:29`）
- **【重要】PR作成前にセルフレビューを実施** - AIツールを活用してコーディング規約・仕様整合性・テスト充実度を事前確認
- AIがPRレビュー指摘を自動読み取り・対応
- **【重要】マージ後にナレッジを体系化** - ACE Playbook に構造化知見を追記（AIツール向け）し、重要な知見は GitHub Discussions にも記録（人間向け）
- ロードマップ更新と次タスク提案

## AIへのプロンプト補助（貼り付け用）

以下をプロンプト末尾に追加し、マジックナンバー回避と設定注入を徹底してください。

```
制約: マジックナンバー／ハードコード禁止。意味のある値は名前付き定数へ抽出し、環境変数や設定モジュールから注入する。単位（ms, KB など）と有効範囲をコメント/型で明示すること。URL, パス, ヘッダ名, エラーコードは定数化する。

推奨ツール: Playwright MCP統合によりAI駆動のビジュアルデバッグ・自動テスト修復を活用すること。E2Eテストの失敗時は自動的にスクリーンショット分析と修正提案を生成する。
```

## Spec Kit 運用ガイド（AI Spec Driven 拡張）

> ⚠️ **本節は未導入（2026-08-15 時点）**
> 本節が前提とする `docs/specs/`・`scripts/build-spec-index.mjs`・MCP ツール `spec_lookup` / `spec_search` は**本リポジトリに存在しません**。記載の手順をそのまま実行しないこと。
> また本節に登場する MCP ツール名は Spec Kit 側の別体系であり、本プロジェクトのツール（[API.md](./02-design/API.md) の最小3つ）とは無関係です。メトリクス例（`login_success_rate` 等）も認証前提のサンプルで、本プロジェクトは POC で認証を実装しません。
> 仕様の粒度管理が必要になった時点で `docs/specs/` を導入し、本節を有効化すること。

Spec Kit 風の粒度管理で AI Spec Driven Development を拡張し、仕様ライフサイクルとLLM利活用を統合する運用ガイド（導入後に適用）。

### 目的

- 仕様を小さく明確な単位 (spec) に分割し、変更追跡・レビュー・検索性を高める。
- Front Matter メタデータでステータス/責任者/リンクを明示し、CI検証を自動化。
- MCPツール (`spec_lookup`, `spec_search`) を通じて LLM に最小コンテキストを供給。

### 仕様配置

- ディレクトリ: `docs/specs/`
- テンプレート: `docs/specs/spec-template.md`
- サンプル: `docs/specs/authentication.md`

### Front Matter スキーマ（必須フィールド）

```
specId: ASDD-DOMAIN-###   # 一意。例: ASDD-AUTH-001
title: <短く的確>
owners:                   # 配列（将来GitHubハンドルやチームID）
  - github: your-handle
status: draft|review|approved|implementing|done|deprecated
version: semver
lastUpdated: YYYY-MM-DD
tags: [mvp, security, ...]
links:                    # 任意。Issue/PR/関連doc参照
  issues: []
  prs: []
  docs: []
summary: >- 1〜2文要約
riskLevel: low|medium|high
impact: >- 影響領域要約
metrics:
  success:
    - 指標例: login_success_rate >= 98%
  guardrails:
    - 指標例: auth_latency_p95 < 150ms
```

### ライフサイクル

| 状態         | 目的     | 代表アクション     | 出口条件           |
| ------------ | -------- | ------------------ | ------------------ |
| draft        | 初稿作成 | 草案コミット       | レビューワ割当     |
| review       | 内容検証 | フィードバック反映 | 全必須コメント解消 |
| approved     | 合意済   | 実装Issue紐付      | 実装着手           |
| implementing | 実装中   | PRリンク追加       | 全PRマージ         |
| done         | 運用     | メトリクス監視     | 非推奨決定         |
| deprecated   | 廃止準備 | 代替spec参照       | 削除 or 置換       |

### 命名規約（specId）

`ASDD-<DOMAIN>-<連番3桁>` 例: `ASDD-AUTH-001`, `ASDD-OBS-002`

- DOMAIN: AUTH, USER, OBS(Observability), DATA など領域識別
- 連番は領域内でインクリメント（欠番許容）

### バリデーション

- スクリプト: `node scripts/build-spec-index.mjs`
- 失敗条件: specId欠落 / 重複 / status不正 / title欠落 / version欠落
- 出力: `dist/spec-index.json`（MCPおよびCI用）

### MCP連携

| ツール        | 目的                  | 入力         | 出力                |
| ------------- | --------------------- | ------------ | ------------------- |
| `spec_lookup` | spec詳細取得          | specId       | front matter + 本文 |
| `spec_search` | タイトル/タグ簡易検索 | query, limit | specId/score一覧    |

### 開発フロー統合

1. Issue起票（新仕様 or 変更）
2. テンプレコピー→ `specId` 割当 → draftコミット
3. PRでレビュー（reviewステータス）
4. Merge後 `approved` に更新 & 実装Issue作成
5. 実装ブランチ / PRリンク (`links.prs`) 追記 → 全マージで `done`
6. 古い仕様再編時は新spec参照付与後 `deprecated`

### 追跡と自動化（将来拡張）

- CI: spec-index再生成 → エラーでPR失敗
- Bot: 未リンク `approved` spec に自動Issue起票
- 差分ハイライト: 直前バージョン比較で変更要約生成

### ベストプラクティス

- 1仕様 = 1つの「判断 + 境界 + 目的」単位。過剰分割は避ける。
- 仕様本文は「Why → What → Constraints → Risks → Metrics」の順で簡潔。
- 実装詳細が複雑化した場合は派生specを分けて依存リンク明示。

### レビューチェック項目（追加）

- [ ] specIdユニーク / パターン適合
- [ ] Goals と Non-Goals 明確
- [ ] Metrics に成功指標とガードレール両方が定義
- [ ] リスクに少なくとも1件の緩和策
- [ ] links.docs / issues / prs の更新整合

### LLM利用時推奨プロンプト追記例

```
必要spec: ASDD-AUTH-001 を `spec_lookup` で取得し、未定義領域が他specに依存する場合は spec_search で補集合を提案せよ。
```

---

## 関連ドキュメント

### 初心者・新規プロジェクト向け（初期セット外・必要時にコピー）

- GETTING_STARTED_ABSOLUTE_BEGINNER.md — 完全初心者ガイド（何も決まっていない状態から始める、約4.5時間）。`${CLAUDE_PLUGIN_ROOT}/docs-template/GETTING_STARTED_ABSOLUTE_BEGINNER.md` からコピー
- GETTING_STARTED_NEW_PROJECT.md — 新規プロジェクト完全ガイド（企画から実装準備まで、8-12時間）。`${CLAUDE_PLUGIN_ROOT}/docs-template/GETTING_STARTED_NEW_PROJECT.md` からコピー
- 00-planning/PLANNING_TEMPLATE.md — プロジェクト企画書テンプレート。`${CLAUDE_PLUGIN_ROOT}/docs-template/00-planning/PLANNING_TEMPLATE.md` からコピー

### AIツール初期設定ガイド（初期セット外・必要時にコピー）

- SETUP_GITHUB_COPILOT.md — GitHub Copilot設定（約30分）。`${CLAUDE_PLUGIN_ROOT}/docs-template/SETUP_GITHUB_COPILOT.md` からコピー
- SETUP_CLAUDE_CODE.md — Claude Code設定（約40分）。`${CLAUDE_PLUGIN_ROOT}/docs-template/SETUP_CLAUDE_CODE.md` からコピー

### 既存プロジェクト向け（初期セット外・必要時にコピー）

- GETTING_STARTED.md — Quickstart（既存プロジェクトへの導入・AI駆動・読み順・プロンプト）。`${CLAUDE_PLUGIN_ROOT}/docs-template/GETTING_STARTED.md` からコピー

### コア7文書（起点）

本リポジトリのテンプレートでは、中央の **MASTER.md** と以下6文書をコア7と位置づける。

- [01-context/PROJECT.md](./01-context/PROJECT.md) - ビジョンと要件
- [02-design/ARCHITECTURE.md](./02-design/ARCHITECTURE.md) - システム設計
- [02-design/DOMAIN.md](./02-design/DOMAIN.md) - ビジネスロジック
- [03-implementation/PATTERNS.md](./03-implementation/PATTERNS.md) - 実装パターン
- [04-quality/TESTING.md](./04-quality/TESTING.md) - テスト戦略
- [05-operations/DEPLOYMENT.md](./05-operations/DEPLOYMENT.md) - デプロイ戦略

> コア7文書はプロジェクトの最小構成です。成長に応じて各フォルダ内に文書を追加してください。全文書が揃わなくてもAIと対話しながら段階的に仕様を策定できます。

### 初期セットのその他文書（本リポジトリに存在）

コア7以外に、`/init-docs` の初期セットとして次の13文書が本リポジトリに存在する。

- [01-context/CONSTRAINTS.md](./01-context/CONSTRAINTS.md) - 制約条件（提出要件・締切・ライセンス・著作権ルール）
- [02-design/API.md](./02-design/API.md) - MCP ツール仕様
- [02-design/DATABASE.md](./02-design/DATABASE.md) - データ資産（DB 未使用の判断と利用オープンデータ一覧）
- [03-implementation/CONVENTIONS.md](./03-implementation/CONVENTIONS.md) - 命名・コーディング規約（テンプレート未具体化・実装着手時に具体化）
- [03-implementation/INTEGRATIONS.md](./03-implementation/INTEGRATIONS.md) - 外部連携（テンプレート未具体化・実装着手時に具体化）
- [03-implementation/DECISION_TREE.md](./03-implementation/DECISION_TREE.md) - 新規コードの配置判断（Web API 前提の SAMPLE・本プロジェクト未適用）
- [03-implementation/FALLBACK.md](./03-implementation/FALLBACK.md) - フォールバック戦略（テンプレート未具体化・実装着手時に具体化）
- [04-quality/VALIDATION.md](./04-quality/VALIDATION.md) - 検証・バリデーション方針（テンプレート未具体化・DB 前提の記述を含む）
- [06-reference/GLOSSARY.md](./06-reference/GLOSSARY.md) - 用語集（プロジェクト固有用語を含む）
- [06-reference/DECISIONS.md](./06-reference/DECISIONS.md) - 設計判断記録（ADR-001〜005）
- [07-project-management/ROADMAP.md](./07-project-management/ROADMAP.md) - ロードマップ
- [07-project-management/TASKS.md](./07-project-management/TASKS.md) - タスク管理
- [07-project-management/RISKS.md](./07-project-management/RISKS.md) - リスク管理

### 企画・プレゼン資料（`/init-docs` 以前から存在）

- [proposal-summary.md](./proposal-summary.md) - 企画概要 v1.0
- [first-stage-presentation.md](./first-stage-presentation.md) - First Stage プレゼン構成・台本

### 品質・セキュリティ（推奨拡張・初期セット外）

コア7以外に、次を参照すると品質ゲートとレビュー観点が揃いやすい。必要時に `${CLAUDE_PLUGIN_ROOT}/docs-template/` の同一相対パスからコピーする。

- 04-quality/GUARDRAILS_THREE_LAYERS.md — ガードレール3層（仕様・自動チェック・人間レビュー）
- 04-quality/SECURITY_REVIEW_CHECKLIST.md — セキュリティレビューチェックリスト（PR用）

### ナレッジベース（初期セット外・`/ace-setup` が作成）

- 08-knowledge/LESSONS_LEARNED.md — 開発過程で得た知見・解決策
- 08-knowledge/TROUBLESHOOTING.md — トラブルシューティング集
- 08-knowledge/BEST_PRACTICES.md — ベストプラクティス集
- 08-knowledge/FAQ.md — よくある質問と回答
- 08-knowledge/PLAYBOOK.md — ACE Playbook（AIツール向け構造化知見）

### 開発プロセスガイド（初期セット外・必要時にコピー）

- 06-reference/DEVELOPMENT_PREPARATION.md — 開発準備ガイド（5 Phases: Issue-First → Document-Driven → MECE検証 → AI Spec-Driven → Git Workflow）。`${CLAUDE_PLUGIN_ROOT}/docs-template/06-reference/DEVELOPMENT_PREPARATION.md` からコピー
- 00-planning/POC_WORKFLOW.md — PoCワークフロー・結果記録テンプレート・仕様マッピングガイド。`${CLAUDE_PLUGIN_ROOT}/docs-template/00-planning/POC_WORKFLOW.md` からコピー
- 06-reference/DECISION_MATRIX.md — 「どの文書に書く？」判断ガイド（Decision Matrix・曖昧ケース例・機能×文書マトリクス）。`${CLAUDE_PLUGIN_ROOT}/docs-template/06-reference/DECISION_MATRIX.md` からコピー
- 06-reference/COPILOT_AGENTS.md — GitHub Copilot Agents設定リファレンス（6種のレビューエージェントテンプレート）。`${CLAUDE_PLUGIN_ROOT}/docs-template/06-reference/COPILOT_AGENTS.md` からコピー
- 06-reference/ISSUE_TEMPLATE_PATTERNS.md — Issue テンプレ設計パターン（ストーリー型=推奨 / 従来型=代替）。`${CLAUDE_PLUGIN_ROOT}/docs-template/06-reference/ISSUE_TEMPLATE_PATTERNS.md` からコピー
- 05-operations/ORGANIZATIONAL_ROLLOUT.md — 組織展開ガイド索引（段階的導入の Phase 1〜4・文書分割・アーカイブ・月次ヘルスチェック）。`${CLAUDE_PLUGIN_ROOT}/docs-template/05-operations/ORGANIZATIONAL_ROLLOUT.md` からコピー

## ドキュメント構造ガイド（AIツール向け）

> **詳細ガイドは 05-operations/ORGANIZATIONAL_ROLLOUT.md（初期セット外・必要時に `${CLAUDE_PLUGIN_ROOT}/docs-template/05-operations/ORGANIZATIONAL_ROLLOUT.md` からコピー）を参照**。本節はサマリーのみを掲載する（SSOT は新ガイド）。

### AIツールの読み込み戦略

**ステップ1**: 索引ドキュメントを読み、必要なトピックを特定
**ステップ2**: 該当する詳細ドキュメントのみを読み込み
**ステップ3**: 必要に応じて関連ドキュメントを追加読み込み

**例**:

```
ユーザー: 「セルフレビューの方法を教えて」
AI: DEPLOYMENT.md（索引）→ deployment/self-review.md を読み込み
```

### ファイル名命名規則

ファイル名命名規則の SSOT は ff-dev-toolkit プラグイン同梱の README.md（`${CLAUDE_PLUGIN_ROOT}/docs-template/README.md` の「ファイル名命名規則」章、初期セット外）です。短縮版:

- ルート直下 / 番号付きフォルダ直下の MD: `UPPER_SNAKE_CASE.md`（例: `MASTER.md`, `DEPLOYMENT.md`）
- サブフォルダ名・サブフォルダ内 MD: `lowercase-with-hyphens(.md)`（例: `deployment/git-workflow.md`）
- 例外（`README.md`, `CLAUDE.md` 等）・逸脱判断・新規追加チェックリストは SSOT を参照

### ファイルサイズの閾値（書籍 第14章準拠）

| 行数      | 判断           |
| --------- | -------------- |
| 〜 500 行 | 適正           |
| 500 行超  | 分割を検討     |
| 800 行超  | 分割を推奨     |
| 1200 行超 | **分割を必須** |

> 親（索引）+ 子（詳細）への分割手順・分割しない判断・実例は organizational-rollout/document-splitting.md（初期セット外・`${CLAUDE_PLUGIN_ROOT}/docs-template/05-operations/organizational-rollout/document-splitting.md` からコピー）を SSOT とする。

### 簡潔化の原則

**削除すべきもの**:

- 一般的なコマンド例（AIは既知）
- 公式ドキュメントに詳細がある内容（URLのみで十分）
- 汎用的なコード例（プロジェクト固有でない）

**残すべきもの**:

- プロジェクト固有の規約・パターン
- 複数ツールの組み合わせ例
- ハマりポイントの回避策
- AIツールへのプロンプトテンプレート

## 月次ドキュメント参照チェック

毎月1日に以下4項目を確認する。手順・自動化スクリプト・レポートテンプレートは organizational-rollout/health-check.md（初期セット外・`${CLAUDE_PLUGIN_ROOT}/docs-template/05-operations/organizational-rollout/health-check.md` からコピー）を参照。

1. **MASTER.md からの参照確認** — 新規文書が索引から到達可能か
2. **ファイルサイズ確認** — 上記閾値（500/800/1200）超過の検出
3. **鮮度確認** — 6 ヶ月以上更新なしの文書を分類（保持／修正／アーカイブ）
4. **孤立文書の確認** — どこからも参照されていない文書の検出

### アーカイブ対象（要約）

以下に該当する文書は `archive/` への退避を **検討**。判定フロー・手順・リダイレクト管理ルールは organizational-rollout/archive-strategy.md（初期セット外・`${CLAUDE_PLUGIN_ROOT}/docs-template/05-operations/organizational-rollout/archive-strategy.md` からコピー）を参照。

- 6 ヶ月参照なし
- 技術的に陳腐化
- 別文書に統合された
- PoC・実験用途で完了

## 文書運用ルール

### Frontmatter

コア7文書（MASTER/PROJECT/ARCHITECTURE/DOMAIN/PATTERNS/TESTING/DEPLOYMENT）およびプロジェクトで追加した文書に以下の YAML Frontmatter を付与する。Frontmatter が文書のメタデータの正式なソースとなる。

> **注**（`docs/specs/` は本リポジトリ未導入。導入後に適用）: `docs/specs/` 配下の仕様ファイルには Spec Kit 運用ガイドの Front Matter スキーマ（6ステータス: draft/review/approved/implementing/done/deprecated）を適用すること。上記 Frontmatter ルールはコア7文書および拡張文書に適用される。

必須フィールド:

| フィールド | 説明                                                | 例           |
| ---------- | --------------------------------------------------- | ------------ |
| title      | 文書タイトル                                        | ARCHITECTURE |
| version    | セマンティックバージョン                            | 1.2.0        |
| status     | 文書の状態（有効値: `draft`, `review`, `approved`, `deprecated`） | draft        |
| owner      | 責任者                                              | @username    |
| created    | 作成日                                              | 2026-01-01   |
| updated    | 最終更新日                                          | 2026-01-15   |

任意フィールド:

| フィールド   | 説明             | 用途                |
| ------------ | ---------------- | ------------------- |
| reviewers    | レビュワー一覧   | 承認フロー管理      |
| tags         | タグ             | 検索・分類          |
| related      | 関連文書         | 相互参照            |
| changeImpact | 最新変更の影響度 | low / medium / high |

### ステータスワークフロー

```text
draft → review → approved
  ↑__________________|
     （修正が必要な場合）

任意の状態 → deprecated（終端: 廃止準備・アーカイブ。復活時は draft/approved へ戻す）
```

| status     | 意味                     | AIへの扱い                   |
| ---------- | ------------------------ | ---------------------------- |
| draft      | 作成中・未確定           | 参考情報として扱う           |
| review     | レビュー中               | ほぼ確定だが変更の可能性あり |
| approved   | 承認済み                 | 正式な仕様として遵守         |
| deprecated | 廃止準備・アーカイブ済み | 新規実装の参照元に使用しない |

> `deprecated` はコア/拡張文書の終端状態。役目を終えた文書のアーカイブ（organizational-rollout/archive-strategy.md — 初期セット外・必要時に `${CLAUDE_PLUGIN_ROOT}/docs-template/05-operations/organizational-rollout/archive-strategy.md` からコピー）や、移動しない ADR の in-place 陳腐化に用いる。`docs/specs/` の 6 ステータス（中間 `implementing`/`done` を含む）とは異なり、コアは終端 1 つのみを持つ。

`review` ステータスの文書に対し1週間レビューコメントがなければ、ドキュメントオーナーが `approved` に昇格する。

### バージョニングルール

文書の変更時は影響度に応じてバージョンを更新する。

| 影響度 | 基準                         | バージョン更新    |
| ------ | ---------------------------- | ----------------- |
| low    | 誤字修正、文言調整           | パッチ（0.0.x）   |
| medium | 項目追加、既存概念の拡張     | マイナー（0.x.0） |
| high   | 構造変更、概念の再定義・削除 | メジャー（x.0.0） |

変更時は Frontmatter の `version`、`updated`、`changeImpact` を同時に更新し、末尾の Changelog セクションにエントリを追加すること。`changeImpact` は小文字（`low` / `medium` / `high`）で記録する。`changeImpact` は初版では省略可。初回変更時に Frontmatter へ追加する。

### Changelog カテゴリ

Changelog エントリには以下のカテゴリを使用する（[Keep a Changelog](https://keepachangelog.com/) 準拠）。

| カテゴリ     | 用途                   |
| ------------ | ---------------------- |
| 追加         | 新機能・新項目         |
| 変更         | 既存機能の変更         |
| 非推奨       | 将来削除予定の機能     |
| 削除         | 削除された機能         |
| 修正         | バグ修正               |
| セキュリティ | セキュリティ関連の修正 |

## コードレビュー チェックリスト（追補）

- [ ] マジックナンバー/ハードコードがない（定数/設定化、単位・範囲の明示）
- [ ] 定数の配置が層責務に沿っている（Domain/Application/Infrastructure）

## Changelog

### [1.0.0] - 2026-08-15

#### 追加

- 初版作成
