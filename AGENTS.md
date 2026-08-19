# AGENTS.md — 旅コンシェルジュTOKYO

AI エージェント（Codex CLI・その他）がこのリポジトリで作業するときの指示。内容は [CLAUDE.md](CLAUDE.md) と同一。**このファイルは単独で完結している**（外部プラグインや個人設定に依存しない）。

Claude Code を使う場合は [CLAUDE.md](CLAUDE.md)、人間の作業者は [CONTRIBUTING.md](CONTRIBUTING.md) を参照。

## まず読むもの

[docs/MASTER.md](docs/MASTER.md) — プロジェクト識別情報・技術スタック・コード生成ルール・全文書への索引。目的別の読み順は [README.md](README.md)。

## 絶対に守ること

1. **推測で埋めない** — 仕様が不明な点は推論で補わず確認する。「未定」「未確認」と書かれた値をそれらしい数値で置き換えない
2. **出典なしの回答を作らない** — オープンデータに根拠を持たない回答は生成せず「ありません」と返す（[DOMAIN.md](docs/02-design/DOMAIN.md) §8）
3. **未回答を握りつぶさない** — 「データが見つからない」はエラーではなく正常な出力。分類して記録する
4. **カタログ掲載データ以外を組み込まない** — CC BY 4.0 のカタログ掲載データのみ二次利用可（[CONSTRAINTS.md](docs/01-context/CONSTRAINTS.md) §3）
5. **`main` / `develop` に直接コミットしない** — 必ずブランチを切って PR を出す

## Git Workflow（軽量フロー）

PoC 段階のため軽量な運用を採用している。判断の背景は [ADR-006](docs/06-reference/DECISIONS.md)。

```
ブランチ作成（develop から）→ 実装・コミット → PR 作成 → レビュー → squash merge → ブランチ削除
```

- **Issue 起票は任意**（議論が必要なとき・分担するときだけ）
- **ブランチと PR は必須**。base は `develop`
- **ACE（知見記録）は任意**（[docs/08-knowledge/PLAYBOOK.md](docs/08-knowledge/PLAYBOOK.md)）
- ユーザーが「マージして」等と言ったタイミングで、ブランチ〜マージ〜クリーンアップまで**一括で実行してよい**
- デフォルトブランチは `develop`（確認日: 2026-08-16）なので、`develop` へのマージで `Closes #N` が発火し Issue は自動クローズされる。手動クローズは不要

コミットメッセージは Conventional Commits・日本語。

## ドキュメントを変更したとき

- **`docs/` 配下の文書はすべて frontmatter を持つ**（例外は `docs/08-knowledge/playbook/*.md`。あれは `/ace-curate` が追記する子ファイルで、メタデータは親の `PLAYBOOK.md` が持つ）。変更したら `version`・`updated`・`changeImpact` と末尾の Changelog を**同時に**更新する
- 新しく `docs/` に文書を足すときも frontmatter（`title` / `version` / `status` / `owner` / `created` / `updated` / `changeImpact`）を付ける
- `version` は SemVer。節の追加・方針変更は minor、文言修正は patch。`changeImpact` は小文字（`low` / `medium` / `high`）
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

> **あなたへ画面（`src/features/foryou/`）の興味チップはラーメンだけ意図的に候補ゼロのまま残してある。** 実データ検証済みの `insufficient_granularity`（粒度不足）を具体的な理由つきで返す、正直な「答えられない」実演として価値がある（DATABASE.md「既知のデータ欠損」・DOMAIN.md §7）。バグではないので、キーワード表を拡張して「直そう」としないこと（絶対ルール #1）。
>
> ナイトライフはカタログ全10件にキーワードが1件も当たらず常に候補ゼロだったため `nature`（自然）へ差し替え済み（2026-08-19・Futoshi が本番データで確認。渋谷区都市公園一覧で実在候補1件、search_datasets → aggregate_dataset → get_provenance の一連が実際に動くことまで確認済み）。差し替え候補として `shopping`（ショッピング）も検討したが、こちらは候補ゼロ（nightlife より悪い）で採用していない。チップ構成は `FORYOU_INTEREST_TAGS`（`src/features/foryou/constants.ts`）の配列を編集するだけで変えられる。

冒頭に「⚠️ テンプレート未具体化」の注記がある文書は本プロジェクト向けに書き換えられていない。そこに書かれた技術を本プロジェクトの決定と誤認しないこと。

## コミットメッセージ

Conventional Commits を日本語で書く。Issue があれば件名に含める（`feat: #12 ...`）。

## 提出物に関わる制約

2026-08-23（日）17:00 提出締切 / 16:9 資料 / 画面キャプチャ 1600×900px / 利用オープンデータ最大10件 / First Stage は **2分厳守・ライブデモ不可** / BGM 不可。詳細は [CONSTRAINTS.md](docs/01-context/CONSTRAINTS.md)。
