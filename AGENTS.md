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

- frontmatter を持つ文書（`MASTER.md` / `PROJECT.md` / `ARCHITECTURE.md` / `DOMAIN.md` / `PATTERNS.md` / `TESTING.md` / `DEPLOYMENT.md` / `DECISION_TREE.md` / `FALLBACK.md` / `PLAYBOOK.md`）を変更したら、`version`・`updated`・`changeImpact` と末尾の Changelog を**同時に**更新する
- `version` は SemVer。節の追加・方針変更は minor、文言修正は patch。`changeImpact` は小文字（`low` / `medium` / `high`）
- 冒頭に「⚠️ テンプレート未具体化」の注記がある文書は、まだ本プロジェクト向けに書き換えられていない。**そこに書かれている技術（DB・REST/GraphQL・コンテナ等）を本プロジェクトの決定と誤認しない**

## 技術スタックの注意

| 項目 | 実態 |
| --- | --- |
| フロントエンド | React 19（`src/`）。**ブラウザで動く**。workerd では動かない |
| Worker | Hono（`worker/`）。ローカルも本番も **workerd** で動く（Node ではない） |
| ビルド | Vite 8 ＋ `@cloudflare/vite-plugin`。ツールチェーンは Node 24（`.nvmrc`） |
| デプロイ先 | Cloudflare Workers（アカウント `opendata`）。<https://tabi-concierge-tokyo.opendata-002.workers.dev> |
| 接続（`/api/*`） | **接続済み**。プラン画面が `search_datasets` → `aggregate_dataset` → `get_provenance` の3操作を呼ぶ（Issue #31・`buildPlan.ts`）。中身は `worker/core/` の固定データによるスタブ（Issue #22）で、D1 を引く本実装（Text-to-SQL）は Step 5 |
| 接続（`/mcp`） | **未着手**（Step 5）。`createMcpHandler`（ステートレス。**Durable Objects は使わない**）を使う想定 |
| データベース | Cloudflare D1 ※Step 2 で導入 |
| 認証 | **実装しない**（POC 段階） |
| コンテナ | 使用しない（サーバーレス） |

> **workerd は Node ではない**。`worker/` のコードで `fs` / `net` を前提にしたライブラリは動かない。ローカル確認は必ず `npm run dev`（workerd 上で動く）で行い、`node` で直接実行しない。

> **既知の制限（`search_datasets` の area フォールバック）**: `worker/core/operations.ts` の `computeSearchDatasets` は、キーワードが1件も当たらず `category` も指定されていないとき、代表エリアが分かっていればそのエリア収録データセットをそのまま「回答あり」として返す汎用フォールバック（`byArea`）を持つ。渋谷はカタログ上の該当データが「都市公園・都立公園一覧」（データセット#10）1件しかないため、`SHIBUYA_SIGHTSEEING_TERMS`（観光・文化施設系の語彙）に当たらない渋谷の問い（例:「渋谷でナイトライフ」）はすべてこのフォールバックを通り、無関係な公園データを返してしまう。**渋谷に限らない**——「ショッピング、上野」も同じフォールバックで無関係な名所・文化施設データを返す（実測確認済み）。この経路は `collectPartialGaps` を通らないため `gaps` に載らず、D1 の未回答記録（Issue #27）にも残らない。
>
> **この限界を「ナイトライフ」等のキーワード追加で直さないこと。** 実測で確かめてあるのは「渋谷のカタログには観光・文化施設データが1件も無い」という事実のみで、「ナイトライフ／ショッピングという切り口で検証済み」ではない。キーワードを足すと、検証していないことを検証済みであるかのように主張することになり、絶対ルール #1（推測で埋めない）に反する。根本原因は `byArea` フォールバックの汎用性側にあり、[Issue #50](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/50) で Futoshi が起票済み。修正は Step 5（Text-to-SQL 化）まで見送る。

冒頭に「⚠️ テンプレート未具体化」の注記がある文書は本プロジェクト向けに書き換えられていない。そこに書かれた技術を本プロジェクトの決定と誤認しないこと。

## コミットメッセージ

Conventional Commits を日本語で書く。Issue があれば件名に含める（`feat: #12 ...`）。

## 提出物に関わる制約

2026-08-23（日）17:00 提出締切 / 16:9 資料 / 画面キャプチャ 1600×900px / 利用オープンデータ最大10件 / First Stage は **2分厳守・ライブデモ不可** / BGM 不可。詳細は [CONSTRAINTS.md](docs/01-context/CONSTRAINTS.md)。
