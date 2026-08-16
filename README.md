# 🗼 旅コンシェルジュTOKYO (Tabi Concierge Tokyo)

> 9,600のオープンデータを、旅の相棒に。

東京都知事杯オープンデータ・ハッカソン 2026 参加プロジェクト（チームshiwata）

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

本リポジトリは **AI仕様駆動開発（AI Spec-Driven Development）** を採用している。企画の一次情報（Notion）を `docs/` へ構造化して置き、人間と AI ツールが同じ文書を参照しながら実装を進める。企画内容の SSOT は Notion、実装の参照先は `docs/`。

### 読み始める場所

**[docs/MASTER.md](docs/MASTER.md) が起点**。プロジェクト識別情報・技術スタック・コード生成ルール・全文書への索引が集約されている。AI ツールはここから必要な文書だけを辿る。

| 目的 | 読む文書 |
| --- | --- |
| 何を作るのか知りたい | [PROJECT.md](docs/01-context/PROJECT.md) — ビジョン・対象ユーザー・5機能・KPI・スコープ |
| 守るべき制約を知りたい | [CONSTRAINTS.md](docs/01-context/CONSTRAINTS.md) — 提出要件・締切・CC BY 4.0・著作権ルール |
| 設計を知りたい | [ARCHITECTURE.md](docs/02-design/ARCHITECTURE.md) / [DOMAIN.md](docs/02-design/DOMAIN.md) / [API.md](docs/02-design/API.md) / [DATABASE.md](docs/02-design/DATABASE.md) |
| なぜそう決めたか知りたい | [DECISIONS.md](docs/06-reference/DECISIONS.md) — 設計判断記録（ADR） |
| 用語を確認したい | [GLOSSARY.md](docs/06-reference/GLOSSARY.md) — A〜Z 節は一般的な技術用語の辞書。本プロジェクト固有の用語は末尾の節 |
| 何を作業するか知りたい | [TASKS.md](docs/07-project-management/TASKS.md) / [ROADMAP.md](docs/07-project-management/ROADMAP.md) / [RISKS.md](docs/07-project-management/RISKS.md) |

### 3つの仕組み

| 仕組み | 場所 | 役割 |
| --- | --- | --- |
| **仕様文書（コア7文書＋拡張）** | [docs/MASTER.md](docs/MASTER.md) | 実装の前提を文書に固定する。未確定の値は推測で埋めず「未定」「未確認」と明示する |
| **開発規約スキル** | [.github/skills/](.github/skills) | コードレビュー・エラーハンドリング・テスト・スキル作成安全性の4本。AI が参照できる形で規約を置く |
| **ACE Playbook** | [docs/08-knowledge/PLAYBOOK.md](docs/08-knowledge/PLAYBOOK.md) | PR ごとに得た知見を構造化エントリとして蓄積し、次のタスクで再利用する |

### この設計で守っていること

- **推測で埋めない** — 一次情報（Notion の企画資料）で確定できない値は「未定」「未確認（実装着手時に確定）」として残す。各技術のバージョン・レスポンスタイム・SLA・KPI 目標値が該当する
- **テンプレートのままの文書には印を付ける** — 実装が始まっていない領域の文書は、冒頭に未具体化である旨の注記を持つ（文言は文書により異なる）。AI がサンプル記述を本プロジェクトの決定と誤認しないため。どの文書がテンプレート段階かは [MASTER.md](docs/MASTER.md) の文書索引を参照
- **出典なしの回答を作らない** — この原則はコードだけでなく文書にも適用し、根拠のある記述と未確定を区別する

### Git Workflow

PoC 段階のため**軽量フロー**を既定としている（[ADR-006](docs/06-reference/DECISIONS.md)。この方針は PR #8 自身から適用した）。実行に外部プラグインを必要としないので、チーム外の方もこのリポジトリだけで作業できる。

```
develop からブランチ作成 → 実装・コミット → PR 作成 → レビュー → squash merge → ブランチ削除
```

| 項目 | 扱い |
| --- | --- |
| Issue 起票 | **任意**（仕様に議論が必要なとき・作業を分担するときだけ） |
| ブランチ・PR | **必須**（`main` / `develop` への直接コミットは禁止） |
| ACE（知見記録） | **任意**。メンテナ環境では必須運用 |

手順の詳細は [CONTRIBUTING.md](CONTRIBUTING.md)（人間向け）、[CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md)（AI ツール向け）にある。いずれも単独で完結しており、個人設定やプラグインに依存しない。

デフォルトブランチは `develop`（確認日: 2026-08-16）。`Closes #N` はデフォルトブランチへのマージで発火するため、`develop` へマージした時点で Issue は自動的にクローズされる。

## ディレクトリ構成

```
docs/                 # AI仕様駆動開発ドキュメント（索引は docs/MASTER.md）
├── 01-context/       # プロジェクト定義・制約
├── 02-design/        # アーキテクチャ・ドメイン・API・データ
├── 03-implementation/# 実装パターン・規約
├── 04-quality/       # テスト戦略・検証
├── 05-operations/    # デプロイ・運用・ACEサイクル
├── 06-reference/     # 用語集・ADR
├── 07-project-management/ # ロードマップ・タスク・リスク
└── 08-knowledge/     # ACE Playbook（知見の蓄積）
.github/skills/       # プロジェクト固有の開発規約スキル
```

アプリケーションのディレクトリ（`frontend/` `mcp-server/` `data/`）は **Phase 2（POC 実装）で作成予定**でまだ存在しない。構成と各ディレクトリの責務は [MASTER.md](docs/MASTER.md) の「ディレクトリ構造」を参照（更新箇所を1つに保つため、README では再掲しない）。

## スケジュール

- 8/23 (日) 17:00 提出締切（16:9資料＋画面キャプチャ1600×900px＋利用データ登録）
- 8/26–30 First Stage収録（2分厳守・ライブデモ不可）
- 10/17 Final Stage

現在地とタスクは [ROADMAP.md](docs/07-project-management/ROADMAP.md) / [TASKS.md](docs/07-project-management/TASKS.md) を参照。

## 公開URL

| URL | 内容 |
| --- | --- |
| <https://tabi-concierge-tokyo.opendata-002.workers.dev> | アプリ本体（実装中） |
| <https://tabi-concierge-tokyo.opendata-002.workers.dev/showcase/> | **デザインプロトタイプ**（5画面・日英）。デザインの正典であり実装ではない |

## 開発

```bash
npm install     # Node 24（.nvmrc）
npm run dev     # Vite + workerd。http://localhost:5173
npm run build
npm run deploy  # Cloudflare へデプロイ

npm test        # src/ を jsdom、worker/ を workerd で。両方まとめて
npm run typecheck
```

`npm run dev` は `worker/` のコードを**本番と同じ workerd 上で**実行する。`/api/health` の `runtime` が `Cloudflare-Workers` を返すことで確認できる。

テストも同じ考え方で、`worker/` は本番と同じ workerd 上で走らせる。設定を2つに分けている理由と、片方だけ走らせるコマンドは [TESTING.md](docs/04-quality/TESTING.md)「テスト環境（実装の実態）」にある。

## 資料

- [開発ドキュメント（MASTER）](docs/MASTER.md) — AI仕様駆動開発の中央ハブ。各文書への索引はここから
- [企画概要](docs/proposal-summary.md)
- [First Stageプレゼン構成・台本](docs/first-stage-presentation.md)
