# CLAUDE.md — 旅コンシェルジュTOKYO

Claude Code がこのリポジトリで作業するときの指示。**このファイルは単独で完結している**（外部プラグインや個人設定に依存しない）。

## このプロジェクトについて

東京都知事杯オープンデータ・ハッカソン 2026 の参加作品。訪日観光客向け AI 旅行ガイド「旅コンシェルジュTOKYO」と、その背後で東京都オープンデータカタログ（約9,600データセット）を扱う「オープンデータ・コンシェルジュ」を MCP で接続する。

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

| 項目 | 扱い |
| --- | --- |
| **Issue 起票** | **任意**。仕様に議論が必要なとき・複数人で分担するときだけ起票する |
| **ブランチ** | **必須**。`develop` から切る。命名は `feature/` `fix/` `chore/` `docs/` + 内容（Issue があれば `feature/#12-xxx`） |
| **PR** | **必須**。base は `develop`。1行でよいので「何を・なぜ」を本文に書く |
| **レビュー** | 変更内容に応じて実施。設計判断を含む変更・出典強制に触れる変更は必ず見る |
| **マージ** | squash merge。マージ後はブランチを削除する |
| **ACE（知見記録）** | **任意**（[docs/08-knowledge/PLAYBOOK.md](docs/08-knowledge/PLAYBOOK.md)）。メンテナ環境では必須運用 |

**まとめて回してよい**: ユーザーが「マージして」等と言ったタイミングで、ブランチ作成 → コミット → PR 作成 → マージ → クリーンアップまで一括で実行してよい。各ステップごとに確認を取る必要はない。

**Issue のクローズは手動**: このリポジトリのデフォルトブランチは `main`、統合ブランチは `develop`。GitHub の `Closes #N` はデフォルトブランチへのマージでのみ発火するため、`develop` へマージしても Issue は閉じない。

## コミットメッセージ

Conventional Commits。日本語で書く。

```
feat: プラン画面にオープンデータの出典チップを表示

Issue があれば件名に含める: feat: #12 ...
```

## ドキュメントを変更したとき

- frontmatter を持つ文書（`MASTER.md` / `PROJECT.md` / `ARCHITECTURE.md` / `DOMAIN.md` / `PATTERNS.md` / `TESTING.md` / `DEPLOYMENT.md` ほか）を変更したら、`version`・`updated`・`changeImpact` と末尾の Changelog を同時に更新する
- 冒頭に「⚠️ テンプレート未具体化」の注記がある文書は、まだ本プロジェクト向けに書き換えられていない。**そこに書かれている技術（DB・REST/GraphQL・コンテナ等）を本プロジェクトの決定と誤認しない**

## 技術スタックの注意

| 項目 | 実態 |
| --- | --- |
| フロントエンド | React 19（`src/`）。**ブラウザで動く**。workerd では動かない |
| Worker | Hono（`worker/`）。ローカルも本番も **workerd** で動く（Node ではない） |
| ビルド | Vite 8 ＋ `@cloudflare/vite-plugin`。ツールチェーンは Node 24（`.nvmrc`） |
| デプロイ先 | Cloudflare Workers（アカウント `opendata`）。<https://tabi-concierge-tokyo.opendata-002.workers.dev> |
| 接続 | MCP は `createMcpHandler`（ステートレス。**Durable Objects は使わない**）※Step 5 |
| データベース | Cloudflare D1 ※Step 2 で導入 |
| 認証 | **実装しない**（POC 段階） |
| コンテナ | 使用しない（サーバーレス） |

> **workerd は Node ではない**。`worker/` のコードで `fs` / `net` を前提にしたライブラリは動かない。ローカル確認は必ず `npm run dev`（workerd 上で動く）で行い、`node` で直接実行しない。テストは `@cloudflare/vitest-pool-workers` を使う。

バージョンが「未確認」の項目は実装着手時に確認して [ARCHITECTURE.md](docs/02-design/ARCHITECTURE.md) §8 と [MASTER.md](docs/MASTER.md) を更新する。推測で書かない。

## 提出物に関わる制約

締切と規定は動かせない。作業前に [CONSTRAINTS.md](docs/01-context/CONSTRAINTS.md) を確認すること。

- 2026-08-23（日）17:00 提出締切 / 16:9 資料 / 画面キャプチャ 1600×900px / 利用オープンデータ最大10件
- First Stage 収録は **2分厳守・ライブデモ不可**
- BGM 不可 / Google Map のロゴ・帰属表示を隠さない / 引用は出典明記

## Team & frontend working notes (Sho)

> Added by Sho (frontend) as working notes. The rules above (「絶対に守ること」「Git Workflow」「技術スタックの注意」) take precedence wherever this section would otherwise conflict with them.

### Team
- **Sho (me)** — frontend development, GUI design, team coordination. Works at a directive/PM level rather than writing every line — gives Claude Code instructions and reviews/steers rather than hand-coding everything.
- **Futoshi Okazaki** — backend development (Open Data Concierge), project proposal, presentation script. Owns the GitHub repo.
- **Shiwata** — network/infrastructure, presentation delivery.
- Recruiting ~1–2 more engineers.

(Elsewhere in this repo's docs the team is referred to collectively as「チームshiwata」— see [docs/MASTER.md](docs/MASTER.md).)

### Stack, in plain terms
- Frontend: React. Backend: Cloudflare (free tier) + Cloudflare D1. See「技術スタックの注意」above for exact versions — that table is the source of truth, not this section.
- Deployment: push to GitHub → auto-deploys to Cloudflare.
- Known issue: Python isn't usable on Cloudflare in the current setup (backend-side, Okazaki's problem to solve).
- This repo is a single repo with `src/` (frontend) + `worker/` (backend) + `docs/` — the official `@cloudflare/vite-plugin` layout (see「ディレクトリ構造」in docs/MASTER.md), not a `frontend/`/`backend/` directory split.

### Design reference
The established design source-of-truth is `public/showcase/`（see「デザインの正典」in docs/MASTER.md）. Sho also has `Design.pdf` / `Design_English.pdf` reference files not yet added to the repo — once added, they'll go in a `design/` folder. Until then, match layout/colors/copy to `public/showcase/`. [Cloudinary export to be added once shared.]

### Sho's current TODOs
- [x] Build out frontend screens/components based on the design reference — 旅のプロフィール→プラン画面 done in `src/features/plan/`. PR open from `feature/trip-plan-screen` into `develop` (not yet merged)
- [ ] Generate a list of all API endpoints the frontend needs (request/response shape, purpose) and share with Okazaki — cross-check against [docs/02-design/API.md](docs/02-design/API.md), which already defines the MCP tool surface
- [ ] Write up the concrete API requirements list from what the built screen actually needs (see `src/features/plan/types.ts`: `Trip`, `Scenario`, `Stop`, `EtiquetteTip`, `ProvenanceSource`) and share with Okazaki — this is the actionable version of the item above, now that the shapes aren't hypothetical
- [ ] Add Cloudinary design URL/ZIP to `design/` once available

### Working conventions
- Branch/PR workflow: already governed by「絶対に守ること」#5 and「Git Workflow」above — branch off `develop`, PR into `develop`, never commit directly to `main`/`develop`. No separate policy needed; just confirm day-to-day cadence with Okazaki as the repo owner.
- (Add naming/style conventions here as they get established)

### Working with Sho (communication style)
Sho is the PM/frontend lead — he works at a directive level (reviews and steers) rather than hand-coding everything, and is still learning parts of the toolchain (Git, npm, terminal usage). When working with him:
- Before running commands or making changes, briefly explain in plain English what you're about to do and why — a sentence or two, not a tutorial
- When something fails or needs diagnosis, explain what you found and what it means, not just raw command output
- Clearly distinguish actions that change files/state (installs, commits, pushes) from ones that just check/read something
- Keep it concise — this is about clarity, not narrating every step
