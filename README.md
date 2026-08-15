# 🗼 旅コンシェルジュTOKYO (Tabi Concierge Tokyo)

> 9,600のオープンデータを、旅の相棒に。

東京都知事杯オープンデータ・ハッカソン 2026 参加プロジェクト（株式会社フィールフロウ / FeelFlow Inc.・チームshiwata）

## 概要

訪日観光客向けのAI旅行ガイドアプリ。東京都オープンデータカタログ（約9,600データセット）をバックエンドの「オープンデータ・コンシェルジュ」経由で活用し、出典付きで旅程提案・文化ガイド・周辺案内を提供する。

## アーキテクチャ

```
📱 旅コンシェルジュTOKYO（フロントエンド / React）
        ⇅
🔌 MCP（最小3ツール: データセット検索・集計・出典取得）
        ⇅
🧠 オープンデータ・コンシェルジュ（メタデータRAG＋Text-to-SQL＋出典強制）
```

- 回答には出典（東京都オープンデータカタログのデータセットリンク）を100%強制付与
- CC BY 4.0の出典表示義務を設計レベルで自動達成
- 答えられなかった質問は「データ公開リクエスト」として都へ自動還元

設計の詳細は [ARCHITECTURE.md](docs/02-design/ARCHITECTURE.md)、MCP ツールの仕様は [API.md](docs/02-design/API.md) を参照。

## 開発の進め方 — AI仕様駆動開発

本リポジトリは **AI仕様駆動開発（AI Spec-Driven Development）** を採用している。仕様を `docs/` に構造化して置き、人間と AI ツールが同じ文書を SSOT として参照しながら実装を進める。

### 読み始める場所

**[docs/MASTER.md](docs/MASTER.md) が起点**。プロジェクト識別情報・技術スタック・コード生成ルール・全文書への索引が集約されている。AI ツールはここから必要な文書だけを辿る。

| 目的 | 読む文書 |
| --- | --- |
| 何を作るのか知りたい | [PROJECT.md](docs/01-context/PROJECT.md) — ビジョン・対象ユーザー・5機能・KPI・スコープ |
| 守るべき制約を知りたい | [CONSTRAINTS.md](docs/01-context/CONSTRAINTS.md) — 提出要件・締切・CC BY 4.0・著作権ルール |
| 設計を知りたい | [ARCHITECTURE.md](docs/02-design/ARCHITECTURE.md) / [DOMAIN.md](docs/02-design/DOMAIN.md) / [API.md](docs/02-design/API.md) / [DATABASE.md](docs/02-design/DATABASE.md) |
| なぜそう決めたか知りたい | [DECISIONS.md](docs/06-reference/DECISIONS.md) — ADR-001〜005 |
| 用語を確認したい | [GLOSSARY.md](docs/06-reference/GLOSSARY.md) |
| 何を作業するか知りたい | [TASKS.md](docs/07-project-management/TASKS.md) / [ROADMAP.md](docs/07-project-management/ROADMAP.md) / [RISKS.md](docs/07-project-management/RISKS.md) |

### 3つの仕組み

| 仕組み | 場所 | 役割 |
| --- | --- | --- |
| **仕様文書（コア7文書＋拡張）** | [docs/](docs/MASTER.md) | 実装の前提を文書に固定する。未確定の値は推測で埋めず「未定」「未確認」と明示する |
| **開発規約スキル** | [.github/skills/](.github/skills) | コードレビュー・エラーハンドリング・テストの規約を AI が参照できる形で置く |
| **ACE Playbook** | [docs/08-knowledge/PLAYBOOK.md](docs/08-knowledge/PLAYBOOK.md) | PR ごとに得た知見を構造化エントリとして蓄積し、次のタスクで再利用する |

### この設計で守っていること

- **推測で埋めない** — 一次情報（Notion の企画資料）で確定できない値は「未定」「未確認（実装着手時に確定）」として残す。各技術のバージョン・レスポンスタイム・SLA・KPI 目標値が該当する
- **テンプレートのままの文書には印を付ける** — 実装が始まっていない領域の文書は冒頭に「テンプレート未具体化」バナーを持つ。AI がサンプル記述を本プロジェクトの決定と誤認しないため
- **出典なしの回答を作らない** — この原則はコードだけでなく文書にも適用し、根拠のある記述と未確定を区別する

### Git Workflow

Issue 起票 → `develop` からブランチ作成 → 実装 → Draft PR → セルフレビュー（ローカル + クロスモデル）→ ready → AC 照合 → squash merge → cleanup → ACE。

デフォルトブランチは `main`、統合ブランチは `develop`。`Closes #N` は `main` へのマージでのみ発火するため、`develop` マージ時の Issue クローズは手動で行う。

## ディレクトリ構成

```
docs/                 # AI仕様駆動開発ドキュメント（索引は docs/MASTER.md）
├── 01-context/       # プロジェクト定義・制約
├── 02-design/        # アーキテクチャ・ドメイン・API・データ
├── 03-implementation/# 実装パターン・規約（テンプレート未具体化）
├── 04-quality/       # テスト戦略・検証
├── 05-operations/    # デプロイ・運用・ACEサイクル
├── 06-reference/     # 用語集・ADR
├── 07-project-management/ # ロードマップ・タスク・リスク
└── 08-knowledge/     # ACE Playbook（知見の蓄積）
.github/skills/       # プロジェクト固有の開発規約スキル
```

以下は **Phase 2（POC 実装）で作成予定**であり、まだ存在しない。

```
frontend/    # 旅行アプリUI（React、5機能: プロフィール/プラン/スキャン/周辺/あなたへ）
mcp-server/  # MCPサーバー（オープンデータ・コンシェルジュ接続）
data/        # 利用オープンデータ（最大10件）のリストとメタ情報
```

## スケジュール

- 8/23 (日) 17:00 提出締切（16:9資料＋画面キャプチャ1600×900px＋利用データ登録）
- 8/26–30 First Stage収録（2分厳守・ライブデモ不可）
- 10/17 Final Stage

現在地とタスクは [ROADMAP.md](docs/07-project-management/ROADMAP.md) / [TASKS.md](docs/07-project-management/TASKS.md) を参照。

## 資料

- [開発ドキュメント（MASTER）](docs/MASTER.md) — AI仕様駆動開発の中央ハブ。各文書への索引はここから
- [企画概要](docs/proposal-summary.md)
- [First Stageプレゼン構成・台本](docs/first-stage-presentation.md)
