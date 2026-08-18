# CLAUDE.md — 旅コンシェルジュTOKYO

Claude Code がこのリポジトリで作業するときの指示。**このファイルは単独で完結している**（外部プラグインや個人設定に依存しない）。

## このプロジェクトについて

東京都知事杯オープンデータ・ハッカソン 2026 の参加作品。訪日観光客向け AI 旅行ガイド「旅コンシェルジュTOKYO」と、その背後で東京都オープンデータカタログ（約9,600データセット）を扱う「オープンデータ・コンシェルジュ」の2層構成。バックエンドは単一 Worker の二面公開で、React アプリは `/api/*`（JSON、[API.md](docs/02-design/API.md)）を呼び、MCP（`/mcp`、[MCP.md](docs/02-design/MCP.md)）は AI クライアント・翌年参加者向けの基盤開放面（ADR-008。React 側に MCP クライアントを実装するのは禁止）。

**まず [docs/MASTER.md](docs/MASTER.md) を読むこと。** プロジェクト識別情報・技術スタック・コード生成ルール・全文書への索引が集約されている。目的別の読み順は [README.md](README.md) にある。

## 絶対に守ること

1. **推測で埋めない** — 仕様が不明な点は推論で補わず、ユーザーに確認する。文書に「未定」「未確認（実装着手時に確定）」と書かれている値を、それらしい数値で置き換えない
2. **出典なしの回答を作らない** — このプロジェクトの中心設計。オープンデータに根拠を持たない回答は生成せず「ありません」と返す。詳細は [DOMAIN.md](docs/02-design/DOMAIN.md) §8
3. **未回答を握りつぶさない** — 「データが見つからない」はエラーではなく正常な出力。分類して記録する
4. **カタログ掲載データ以外を組み込まない** — 二次利用が許されるのは CC BY 4.0 のカタログ掲載データのみ。詳細は [CONSTRAINTS.md](docs/01-context/CONSTRAINTS.md) §3
5. **`main` / `develop` に直接コミットしない** — 必ずブランチを切って PR を出す

## Git Workflow（軽量フロー）

PoC 段階のため軽量な運用を採用している。判断の背景は [ADR-006](docs/06-reference/DECISIONS.md)。

```
ブランチ作成（develop から）→ 実装・コミット → PR 作成 → レビュー → squash merge → ブランチ削除
```

**`main` は使わない。運用方針が未定である**（[ADR-009](docs/06-reference/DECISIONS.md)）。`develop` が唯一の統合ブランチで、デフォルトブランチ・PR の base・デプロイ元をすべて兼ねる。`main` は `develop` から乖離したまま放置しており、**本番を指してはいない**。位置づけは提出（2026-08-23）後に決める。`release/*` / `hotfix/*` も使わない（リリース列が1本しか無いため）。

| 項目 | 扱い |
| --- | --- |
| **Issue 起票** | **任意**。仕様に議論が必要なとき・複数人で分担するときだけ起票する |
| **ブランチ** | **必須**。`develop` から切る。命名は `feature/` `fix/` `chore/` `docs/` + 内容（Issue があれば `feature/#12-xxx`） |
| **PR** | **必須**。base は `develop`。1行でよいので「何を・なぜ」を本文に書く |
| **レビュー** | 変更内容に応じて実施。設計判断を含む変更・出典強制に触れる変更は必ず見る |
| **マージ** | squash merge。マージ後はブランチを削除する |
| **ACE（知見記録）** | **任意**（[docs/08-knowledge/PLAYBOOK.md](docs/08-knowledge/PLAYBOOK.md)）。メンテナ環境では必須運用 |

**まとめて回してよい**: ユーザーが「マージして」等と言ったタイミングで、ブランチ作成 → コミット → PR 作成 → マージ → クリーンアップまで一括で実行してよい。各ステップごとに確認を取る必要はない。

**Issue は `Closes #N` で自動クローズされる**: このリポジトリのデフォルトブランチは **`develop`**（確認日: 2026-08-16）。`Closes #N` はデフォルトブランチへのマージで発火するため、`develop` へマージした時点で Issue は閉じる。手動クローズは不要。

## コミットメッセージ

Conventional Commits。日本語で書く。

```
feat: プラン画面にオープンデータの出典チップを表示

Issue があれば件名に含める: feat: #12 ...
```

## ドキュメントを変更したとき

- **`docs/` 配下の文書はすべて frontmatter を持つ**（例外は `docs/08-knowledge/playbook/*.md`。あれは `/ace-curate` が追記する子ファイルで、メタデータは親の `PLAYBOOK.md` が持つ）。変更したら `version`・`updated`・`changeImpact` と末尾の Changelog を同時に更新する
- 新しく `docs/` に文書を足すときも frontmatter（`title` / `version` / `status` / `owner` / `created` / `updated` / `changeImpact`）を付ける
- 冒頭に「⚠️ テンプレート未具体化」の注記がある文書は、まだ本プロジェクト向けに書き換えられていない。**そこに書かれている技術（DB・REST/GraphQL・コンテナ等）を本プロジェクトの決定と誤認しない**

## 技術スタックの注意

| 項目 | 実態 |
| --- | --- |
| フロントエンド | React 19（`src/`）。**ブラウザで動く**。workerd では動かない |
| Worker | Hono（`worker/`）。ローカルも本番も **workerd** で動く（Node ではない） |
| ビルド | Vite 8 ＋ `@cloudflare/vite-plugin`。ツールチェーンは Node 24（`.nvmrc`） |
| デプロイ先 | Cloudflare Workers（アカウント `opendata`）。<https://tabi-concierge-tokyo.opendata-002.workers.dev> |
| デプロイ方法 | **手動**。`npm run deploy`（= `wrangler deploy`）をローカルから実行する。`.github/workflows/ci.yml` は検証（typecheck / test / build）だけを行い、**デプロイはしない**。**いつ実行するかは [DEPLOYMENT.md](docs/05-operations/DEPLOYMENT.md) §3 で契機を定めた**（`worker/` `shared/` を変更したらデプロイ、`migrations/` なら先に `db:migrate`）。契機を決めていなかったため本番が43コミット遅れる事故があった（Issue #46） |
| 接続（`/api/*`） | **接続済み**。プラン画面（Issue #31・`src/features/plan/buildPlan.ts`）とあなたへ画面（`src/features/foryou/buildRecommendations.ts`）が、それぞれ独立に `search_datasets` → `aggregate_dataset` → `get_provenance` の3操作を呼ぶ。中身は `worker/core/` の固定データによるスタブ（Issue #22）で、D1 を引く本実装（Text-to-SQL）は Step 5 |
| 接続（`/mcp`） | **未着手**（Step 5）。`createMcpHandler`（ステートレス。**Durable Objects は使わない**）を使う想定 |
| データベース | Cloudflare D1（`tabi-concierge-tokyo`・導入済み）。スキーマは `migrations/`、取り込みは `scripts/`。開発は `npm run db:reset:local` |
| Python 実行環境 | **未確認**。「現状の構成では Cloudflare 上で Python が使えない」という報告があるが、本リポジトリ内に検証記録はなく未確認（実装で Python を前提にする前に要確認） |
| 認証 | **実装しない**（POC 段階） |
| コンテナ | 使用しない（サーバーレス） |

> **workerd は Node ではない**。`worker/` のコードで `fs` / `net` を前提にしたライブラリは動かない。ローカル確認は必ず `npm run dev`（workerd 上で動く）で行い、`node` で直接実行しない。テストは `@cloudflare/vitest-pool-workers` を使う。

> **`search_datasets` の area フォールバック**: キーワードが1件も当たらないとき代表エリア収録データセットをそのまま返す経路が、答えられていないことを見落としていた欠陥（[Issue #50](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/50)）は [PR #51](https://github.com/fffokazaki/tabi-concierge-tokyo/pull/51) で修正・デプロイ済み。挙動の詳細は [API.md](docs/02-design/API.md) §3.1 を参照（実装が変わるたびにここへ転記すると陳腐化するため、詳細はそちらに一本化する）。
>
> **`SHIBUYA_SIGHTSEEING_TERMS` に「ナイトライフ」等のキーワードを足す直し方は取らないこと。** 実測で確かめてあるのは「渋谷のカタログには観光・文化施設データが1件も無い」という事実のみで、「ナイトライフ／ショッピングという切り口で検証済み」ではない。キーワードを足すと、検証していないことを検証済みであるかのように主張することになり、絶対ルール #1（推測で埋めない）に反する。PR #51 の回帰テストでこの前提が固定されている。

> **あなたへ画面（`src/features/foryou/`）の興味チップは4種のうち2種が常に候補ゼロ**（2026-08-18 実測）。ラーメンはジャンル粒度不足（DATABASE.md「既知のデータ欠損」）、ナイトライフはカタログ全10件にキーワードが1件も当たらないため。どちらも `unanswered` の正直な空表示になるだけでバグではなく、DOMAIN.md §7 の「データが無いことを見せる」という設計思想どおりの挙動。**チップ構成（`FORYOU_INTEREST_TAGS`、`src/features/foryou/constants.ts`）をショッピング・自然（既存の `InterestTag` の値）へ差し替えるかは Futoshi との間で未解決** — 差し替えるだけなら同定数の配列を編集すればよい設計にしてある。キーワード表を拡張してこの2チップを「直そう」としないこと（同じ理由で絶対ルール #1 に反する）。

バージョンが「未確認」の項目は実装着手時に確認して [ARCHITECTURE.md](docs/02-design/ARCHITECTURE.md) §8 と [MASTER.md](docs/MASTER.md) を更新する。推測で書かない。

## 提出物に関わる制約

締切と規定は動かせない。作業前に [CONSTRAINTS.md](docs/01-context/CONSTRAINTS.md) を確認すること。

- 2026-08-23（日）17:00 提出締切 / 16:9 資料 / 画面キャプチャ 1600×900px / 利用オープンデータ最大10件
- First Stage 収録は **2分厳守・ライブデモ不可**
- BGM 不可 / Google Map のロゴ・帰属表示を隠さない / 引用は出典明記
