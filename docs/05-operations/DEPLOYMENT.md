---
title: "DEPLOYMENT"
version: "1.19.1"
status: "draft"
owner: "@fffokazaki"
created: "2026-08-15"
updated: "2026-08-23"
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
9. **デプロイ** - `worker/` `shared/` `migrations/` `src/` `public/` `wrangler.jsonc` `data/` `scripts/` を変更したときは §3「いつデプロイするか」に従って反映する（**対象は §3 の契機テーブルが正**。ここの列挙はその写しなので、片方だけ増やさない）
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
| 本番 | 提出・共有 | <https://tabi-concierge-tokyo.tokyo-odh-091.workers.dev> | Cloudflare Workers |

ステージングは設けない（First Stage はライブデモ不可のため、常時公開の可用性要件が無い）。

### 前提

| 項目 | 値 |
| --- | --- |
| Cloudflare アカウント | `tokyo_odh_091`（ハッカソン事務局発行・`8795c0673f8ae5de9884da4a25c7f7dd`）。`wrangler.jsonc` の `account_id` に明示。PoC 中は仮アカウント `opendata` を使っていた（Issue #171 で移設） |
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
| キャッシュ TTL | 3600 秒（既定） | `wrangler.jsonc` の `"vars".AI_GATEWAY_CACHE_TTL` |

- **`default` は予約名**で、初回の認証済みリクエストでゲートウェイが**自動作成**される。ダッシュボード（AI → AI Gateway）でログ・ニューロン消費・キャッシュ HIT を確認できる
- **名前付きゲートウェイに変えたい場合**は、先にダッシュボードか API で作成してから `vars.AI_GATEWAY_ID` を差し替える。**作成せずに名前を指定すると推論そのものが落ちる**（`AiGatewayError: 2001: Please configure AI Gateway in the Cloudflare dashboard`）
- ローカルだけ別ゲートウェイへ向けたいときは `.dev.vars` に `AI_GATEWAY_ID=...` を置く（`.dev.vars` は Git 管理外）

> **AI バインディングはローカルでも実 API を叩く。** `npm run dev` の推論は本物で、無料枠（10,000 ニューロン/日）を消費する。`--remote` は要らない。
> テストは `vitest.worker.config.ts` の `remoteBindings: false` で外へ出ないようにしてある（外すと Cloudflare 認証情報を持たない CI が全滅する）。

#### 収録前の手順 — キャッシュの引き直しとニューロン残量（[Issue #143](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/143)）

キャッシュキーは**リクエストボディ全体**なので、同じ質問文は TTL の間ずっと**同じ推論結果**を返す。ふだんは利点（無料枠の節約・応答の安定）だが、収録リハーサルでは**「たまたま良くない読み取り」がそのまま TTL のあいだ固定される**。引き直すには TTL を切る。

**1. 引き直す（ローカル）** — `.dev.vars` に置いて `npm run dev` を起動し直す。`.dev.vars` は Git 管理外なので、戻し忘れても本番へは出ない。

```bash
echo 'AI_GATEWAY_CACHE_TTL=0' >> .dev.vars   # 0 = キャッシュを使わない（skipCache）
npm run dev                                  # AI バインディングはローカルでも実 API を叩く
```

**2. 引き直す（本番）** — `wrangler.jsonc` の `vars.AI_GATEWAY_CACHE_TTL` を `"0"` にして `npm run deploy`。**収録が終わったら `"3600"` へ戻して deploy し直すこと**（戻し忘れると毎回推論が走り、無料枠の消費が読めなくなる）。

> **この書き換えをコミットする必要はない。** `npm run deploy` はワークツリーの `wrangler.jsonc` を読むので、**編集して deploy し、終わったら `git checkout -- wrangler.jsonc` で戻して deploy し直す**だけでよい（絶対ルール #5「`develop` に直接コミットしない」に触れない）。戻し忘れは `git status` に未コミット変更として残るため、次の作業で必ず気づく。

| 値 | 意味 |
| --- | --- |
| `"0"` | キャッシュを使わない（`skipCache: true`）。同じ質問文で何度でも引き直せる |
| `"60"`〜`"2592000"` | その秒数だけキャッシュする。AI Gateway 側の下限 60 秒・上限 1ヶ月をそのまま採っている |
| 上記以外（範囲外・小数・空・未設定、`"6e1"` `"0x3c"` `"+60"` などの非10進表記） | **既定の 3600 秒へ倒れ、`console.error` が出る**（`npx wrangler tail` で拾う）。Worker は落とさない — 収録直前に全体が死ぬほうが害が大きいため |

> 解釈は `worker/core/llm.ts` の `resolveCachePolicy`。**キャッシュを使わない指定は `skipCache` であって `cacheTtl: 0` ではない**（0 を TTL として渡すとキャッシュが効いたまま「引き直したつもり」になる）。この取り違えは `llm.test.ts` の「skip は skipCache で渡す」で固定してある。

> **実測（2026-08-22・ローカル `npm run dev`・実 API。サーバをウォームアップしてから各6回）**
>
> | | 同一の質問文を6回 | 毎回ちがう質問文を6回（対照） |
> | --- | --- | --- |
> | 既定 `"3600"` | 0.41〜0.78 秒（中央値 **0.43**） | 0.98〜1.40 秒（中央値 1.03） |
> | `"0"` | 0.74〜0.98 秒（中央値 **0.87**） | 0.72〜1.11 秒（中央値 0.89） |
>
> 既定では**同じ質問文だけが速くなる**（＝キャッシュに当たっている）のに対し、`"0"` では同一・別の差が消える。
>
> **「1回目より2回目が速い」だけでは判別できない。** サーバの立ち上がりで同じ形の低下が出るため、最初に対照なしで測ったときは逆の結論が出かけた。確かめるときは必ず「毎回ちがう質問文」を並べて測ること。**`cf-aig-cache-status` はバインディング経由では読めない**ので、確証はダッシュボード（AI → AI Gateway → `default`）の Cache HIT / MISS で取る。
>
> 不正値（`AI_GATEWAY_CACHE_TTL=いちじかん`）では HTTP 200 のまま `console.error` が出て既定へ倒れることも同日に実測した。

**3. ニューロン残量を確認する（収録直前・必須）** — ダッシュボード AI → AI Gateway → `default` の消費量を見る。無料枠は 10,000 ニューロン/日、旅程1本 ≒ **20.7 ニューロン**（[LLM-MODEL-CANDIDATES.md](../06-reference/LLM-MODEL-CANDIDATES.md) §4.3 の実測）なので約 480 プラン/日にあたる。リハーサルを繰り返しても枯れる心配はまず無い。

> **枯れても画面からは気づけない。** 無料枠を使い切ると LLM 経路が失敗し、コア操作は**キーワード実装へ静かに縮退する**（#119・#120）。応答は 200 で返り、旅程も表示されるので**画面を見ても API を叩いても気づけない**。`npx wrangler tail` の `console.error` とゲートウェイのログの両方で確かめること（下の「デプロイ後の確認」と同じ失敗モード）。

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
| **`src/` を変更する PR をマージしたとき** | `npm run deploy` |
| **`public/` を変更する PR をマージしたとき** | `npm run deploy`（Vite が Worker の静的アセットへ同梱する） |
| **`data/` または `scripts/` を変更してデータの中身が変わるとき** | `npm run db:seed` |
| 提出直前（2026-08-23） | 3つすべて＋下記の確認 |

> **`src/` だけの変更にも契機が要る**（[Issue #164](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/164)）。React アプリは同じ Worker に同梱されて配信されるため、`src/` だけの PR をマージしても `npm run deploy` を打つまで本番の画面は変わらない。当初この事実は表の下に散文で書いてあるだけで**契機として列挙されていなかった**が、散文の注意書きはチェックリストとして機能しない ―― 契機を決めていなかったこと自体が43コミット遅れ（Issue #46）の原因だったので、表の行として持つ。
>
> 実例: PR #163（Issue #146・`callCoreOperation` のタイムアウト）は変更が 100% `src/` で、マージしただけでは「応答しない候補で画面が固まる」症状は本番で直らなかった。

> **リモートへ反映する順番**: マイグレーション → シード → デプロイ。シードだけ流してもテーブルが無いため失敗する（[DATABASE.md](../02-design/DATABASE.md) §2）。

#### デプロイ記録

「今デプロイされているもの」は `main` では辿れない（ADR-009）。反映したらここに記録する。

| 日時 | Version ID | 内容 | 確認 |
| --- | --- | --- | --- |
| 2026-08-23 | `57ee95fe-95b9-41c1-a089-0fe30e85769a` | Jotform 3-8 へ記載する申請用操作デモ動画1本を、Worker の静的アセット `/demo/operation-demo.mp4` として公開（#131 / PR #224）。`public/` と申請物SSOT、First Stage の2シーンとの区別、`public/` のデプロイ契機を追加した。デプロイ対象の統合コミットは `901dbcee5827ec362d9032df6a5191b7380e1cfd`。`migrations/` `data/` `scripts/` `worker/` `shared/` `src/` は未変更のため、マイグレーション・シードは実行していない | Wrangler が `/demo/README.md` と `/demo/operation-demo.mp4` の2静的アセットを新規アップロード。動画URLは HTTP 200 / `video/mp4` / 1,056,224 bytes で、取得ファイルがリポジトリの SHA-256 `912e97fee190beed3317c05379a9fb28e59688fda16d01cb487135f86c84aa3b` とバイト一致。`ffprobe` で25.133秒・1600×900・30fps・H.264を再確認した。Range要求は206ではなく全体200で返る。標準チェックは health 200（`runtime: Cloudflare-Workers`）/ SPA `/` 200 / `/api/nope` 404。テスト44ファイル・903件、typecheck・build・文書検証は PR #224 で通過 |
| 2026-08-22 | `3fbb592c-8221-4749-a31f-89b3399305db` | `search_datasets` の最後のフォールバックが、呼び出し元から実際に送られた入力に合わせて `message` の照合対象を「興味の語」・「質問文・興味の語」・「質問文の語」と言い分ける修正（#114 / PR #214・#216）。PR #214 のマージ後に Version `543a6a35-6ee7-451b-a976-7071449feb3d` を一度デプロイしたが、本番確認で query-only の LLM 成功経路が未検証と判明したため Issue を再オープンし、PR #216 で候補選定には LLM 解釈後入力を維持しつつ、文言だけを元入力から決めるよう補完した。最終デプロイ対象の統合コミットは `4d8782ceee691ffc51189acd3ec7b08df7979ae4`。`worker/` の変更なので §3 の契機に該当し、`migrations/` `data/` `scripts/` `src/` は未変更のため migrate・seed は実行していない | チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404）。**変更した3分岐を本番で実測** ―― `interests` のみは「興味の語」、`query + interests` は「質問文・興味の語」、query-only（`エリア指定なし。ショッピングだけ`）は LLM 分解を通ったうえで「質問文の語」を返し、すべて HTTP 200 の `unanswered(other)`。コア3操作も実測し、`aggregate_dataset` は D1 実照会で寛永寺、`get_provenance` は CC BY 4.0 の出典1件を返した。リモート D1 は datasets 10 / spots 1,645、上記未回答は `gaps` に記録済み。テスト 44ファイル・903件、typecheck・build・文書検証は PR #216 で通過 |
| 2026-08-22 | `c607291d-c80d-45dd-a4fa-dcf6a08f5155` | 停留地へカテゴリ別イラストを表示し、`aggregate_dataset` の回答へ実データの非空 `category` を追加（#188 / PR #204）。現在の全16カテゴリ・1,645行を9種の ImageGen 製 WebP（8グループ＋将来の未知カテゴリ用）へ割り当て、角丸枠の外側を実アルファ透過にした。`worker/` `shared/` `src/` の変更なので §3 の契機に該当。`migrations/` とデータ内容は未変更のため、マイグレーション・シードは実行していない。デプロイ対象の統合コミットは `085c4073d5433c1c575dd6c09ea7342be965ba3d` | チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404）。**D1 主経路を実測** ―― `aggregate_dataset({datasetId:"t131067d0000000251", intent:"上野エリアの寺社を1件"})` が寛永寺と `category: "名所・史跡"` を返し、`query` は `D1 実照会:` と id の固定照会を含む。**配信物の同一性を実測** ―― 本番 `/index.html` が手元の 718 bytes と `cmp` で一致し、カテゴリ画像9ファイルも全件バイト一致。実ブラウザでは寛永寺カード内の装飾画像が `/assets/heritage-BwLfrU-A.webp`、`alt=""` で1件表示され、後続の文化観光施設・文化財にも各画像が表示された。伝播待ちは不要だった。テスト 44ファイル・899件、typecheck・build・文書検証は PR #204 で通過 |
| 2026-08-22 | `688c5cb7-0c64-4440-9f59-cbbedec9463e` | 未回答が記録され都へのデータ公開リクエストへ還元されることの注記を、未回答・欠損の表示の脇に出す（#192 / PR #198）。**変更は `src/` と `docs/` のみ**だが、React アプリは同じ Worker に同梱されて配信されるため §3 の「`src/` を変更する PR をマージしたとき」の契機に該当する。`worker/` `shared/` `migrations/` `data/` `scripts/` は未変更のため、マイグレーション・シードは実行していない。2026-08-17 の「リクエストするボタンは出さない」判断は維持（押す操作は増やしていない） | **配信中の bundle が手元のビルドとバイト一致することで確認** ―― `curl --compressed` で取得した `/assets/index-CMI8dFSf.js`（226,884 bytes）が `dist/client/assets/index-CMI8dFSf.js` と `cmp` で完全一致し、注記の文言「答えられなかった問いは記録されます。…」を含む。`/assets/index-CP_BfR62.css` にも `.gap-escalation-note` が入っている。**実ブラウザで2ケース実測** ―― プラン画面（興味＝ラーメン・文化）で `route-panel` の並びが `data-gap-card` → `gap-escalation-note` → 停留地となり注記は1つだけ。あなたへ画面のラーメン単独では `route-empty`（`分類: insufficient_granularity`）→ `gap-escalation-note` の2要素で、**内訳が空でも注記が出ることを本番で確認**（`DataGapCard` は出ない）。**伝播待ちは不要だった**（デプロイ直後の1回目から新 bundle）。テスト 869 件（+62 は #193 のダッシュボードぶんを含む。#192 単体では +18） |
| 2026-08-22 | `460c9237-4423-436d-aa93-e1b0942bd4a5` | 応答に載せる行を代表エリア優先で選ぶ（#174 / PR 後述）。生成 SQL が area 条件を `OR` で繋ぐと（同一入力8回で4〜6回・実測）対象エリア外の行が category だけで当たり、`rows[0]` 固定の取り出しが蔵前の行を旅程の1番目に載せていた。**プロンプトで「AND で繋げ」と頼む修正は効かなかった**（追加後も8回中6回が OR 形・Version `9df28168` で実測 → revert）。SQL は直さず `pickPreferredRow`（`worker/core/text-to-sql.ts`）が返った行から intent の代表エリア → 代表エリアいずれか → 先頭の順で選ぶ。`worker/` の変更なので §3 の契機に該当 | **AC を本番で実測** ―― キャッシュ無効（`AI_GATEWAY_CACHE_TTL="0"` を一時設定）で同一入力`{"datasetId":"t131067d0000000251","intent":"文化、家族向け、自然"}` を8回引き直し、SQL は AND 5 / OR 3 と揺れたまま**8回全部が寛永寺（上野）**。修正前は OR 形のたび初代川柳墓（蔵前）だった。測定後に TTL を 3600 へ戻して再デプロイし、焼き付く1発目も寛永寺であることを確認。テスト 773 件（+3。#153 の「別エリアの行が返る」を固定していたテストは意図的に書き換え）。**引き直し測定の途中版**（`60ee2fac` 効かないプロンプト入り・`9df28168` 同+TTL0・`e6957718`/`e39c60b9` 行選定入り・`1787a736` 一時復旧）**が本番に載った時間帯がある** ―― いずれも短時間。その後 Codex レビュー指摘（同名別エリアの取り違え・「銅鐘」実例）対応で `a9fdf7f6-3ba0-44f8-ac18-3b594bb3388d` を最終版としてデプロイ。`PREFERRED_COLUMNS` に `area` を足したため生成 SQL の SELECT に area が入るようになったことを本番応答の `query` で確認（`SELECT dataset_id, name, address, note, area FROM ...`）。名指し経路（上野の寺社を1件 → 寛永寺）も回帰なし |
| 2026-08-22 | `a17750ee-4a0d-472b-b8ee-5afa6fd5084a` | **デプロイ先アカウントの移設**（#171）。ハッカソン事務局発行の `tokyo_odh_091` へ Worker・D1 ごと移した。URL が <https://tabi-concierge-tokyo.opendata-002.workers.dev> から <https://tabi-concierge-tokyo.tokyo-odh-091.workers.dev> へ変わる。`wrangler.jsonc` の `account_id` と `d1_databases[].database_id` を同時に差し替え、新アカウントの D1（`202adb68-a563-4475-885e-5605f17d89b4`）へ **migrate ＋ seed を実行**した。コードは無変更。**旧アカウントのデプロイは提出まで残す**（ロールバック先） | チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404）。**新アカウントでは LLM 経路の生死を疎通で判定できない** ―― 障害時は `extractFromSamples` へ縮退して **HTTP 200 のまま旅程を返す**ため、`npx wrangler tail` を張ったうえで確認した。5リクエスト中、縮退マーカー（`[aggregate] … 縮退` / `[search] 質問の分解に失敗` / `[llm] 推論の呼び出しに失敗`）は **0件**。加えて**縮退していないことの積極的な証拠**として、`aggregate_dataset` の応答 `query` が `D1 実照会: SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = 't131067d0000000251' AND category = '名所・史跡' AND area IN ('上野') LIMIT 50` と、LLM が生成した SQL そのものであることを確認（縮退時はスタブ文言になる）。AI Gateway `default` は新アカウントで自動生成され、未作成時の `AiGatewayError: 2001` は出ていない。**データ一致を旧新で突き合わせ** ―― `datasets` 10 = 10 / `spots` 1,645 = 1,645。`gaps` は 127 → 0 だが、これは稼働中に積まれる未回答ログでシード対象外のため正常。新 D1 への書き込みも確認（`新宿の美術館に行きたい / 新宿 / 美術館 / out_of_area` が記録された）。`/mcp` の `tools/list` はコア3ツール（`search_datasets` / `aggregate_dataset` / `get_provenance`）を返す。**伝播待ちは不要だった**（新規デプロイのため旧版が存在しない） |
| 2026-08-22 | `1e2a4be9-4f3a-4ce2-9bb6-6813f3f6bed0` | 名指しされた施設が候補データセットに無いときの扱いを、決定（①すり替える）として明文化（#153 / PR #167）。**ランタイムの挙動は変えていない** ―― 実行時に変わった値は `worker/mcp.ts` の `aggregate_dataset` の**ツール説明（`tools/list` で外部 MCP クライアントへ配る広告文）だけ**である。「集計意図に合う1件を取り出す」という言い切りをやめ、名指しが外れたら別の行が返ること・返る行が意図のエリアである保証は無いことを明示した。`worker/` の変更なので §3 の契機に該当する。`migrations/` `data/` `scripts/` `src/` は未変更のため、マイグレーション・シード・フロントの再確認は不要 | **配布中の広告文そのもので確認** ―― 本番の `/mcp` へ `tools/list` を投げ、`aggregate_dataset.description` に「返る行が意図のエリアである保証は無い」が含まれ、旧文言「集計意図に合う1件」が消えていることを確認。正常系は `/api/search-datasets {"query":"上野の文化財","limit":2}` が `answered` で文化財一覧・名所史跡を返すこと、SPA `/` が 200 を返すことを確認。**すり替えの挙動そのものは本番で実測していない** ―― この PR は挙動を変えていないため、確認対象は「広告文が反映されたこと」である |
| 2026-08-22 | `c2efd7b1-5b71-40ba-a16d-b9a1bf18b0c5` | コア3操作の呼び出しにタイムアウト（既定 6000ms）を追加し、応答なしを `network` ではなく `timeout` として分類（#146 / PR #163）。**変更は 100% `src/`** ―― 本 PR で §3 の契機テーブルに `src/` の行を足すまで、この症状は「マージしただけでは本番で直らない」状態だった（#164）。`worker/` `shared/` `migrations/` `data/` `scripts/` は未変更のため、マイグレーション・シードは不要 | **配信中の bundle が手元のビルドとバイト一致することで確認** — `curl --compressed` で取得した `/assets/index-v_gVxkjl.js`（221,328 bytes）が `dist/client/assets/index-v_gVxkjl.js` と `cmp` で完全一致。タイムアウト時の文言（プラン・あなたへの「応答がありませんでした」×4、`◯◯ms 以内に応答がありませんでした` ×2）が bundle 内に存在する。**開発コンソール（ApiConsole）の文言は本番 bundle に無いのが正しい** ―― `App.tsx` の `import.meta.env.DEV` ガードで本番ビルドからは落ちるため、`でタイムアウト` が0件でも欠落ではない。正常系は `search_datasets({query:"上野の文化財",limit:3})` が `answered` で文化財一覧・名所史跡を返すことを確認。**タイムアウト自体の本番実測は行っていない** ―― 6秒を超える応答を意図的に作れないため（この行は「反映されたこと」の確認であって、打ち切り挙動の実測ではない） |
| 2026-08-22 | `712c2277-22f8-4db0-8cbc-f296a79891cb` | 停留地の説明から原本の管理用メタデータ（`最終確認日`・`座標精度`）を落とす（#144 / PR #158）。`worker/core/text-to-sql.ts` の変更のためデプロイ（§3「いつデプロイするか」の1契機に該当）。`migrations/` `data/` `scripts/` `src/` は未変更のため、マイグレーション・シード・フロントの再確認は不要 | **Issue に載っていた実例そのもので実測** — `aggregate_dataset({ datasetId: "t131067d0000000393", intent: "上野エリアの文化財を1件" })` が「所在地は東京都台東区上野桜木1丁目。美術工芸品 / 所有: 寛永寺。台東区が文化財一覧として公開している190件のうちの1件。」を返す（修正前は末尾に `/ 最終確認日2024-01-09・座標精度：小字・丁目代表点` が付いていた）。**伝播待ちは不要だった**（デプロイ直後の1回目から新挙動）。**AI Gateway のキャッシュの影響を受けない** — キャッシュは SQL 生成の推論に効き、`toResult` はその後段で毎回走るため、TTL 内でも修正が即座に出る。提出用キャプチャ3点（#126）を本番から取得し、あなたへ画面の説明文も修正後であることを確認した |
| 2026-08-22 | `6229d576-67ba-4f4d-af05-81331d6d93f3` | AI Gateway のキャッシュ TTL を呼び出し側のハードコードから `vars.AI_GATEWAY_CACHE_TTL` へ出し、`"0"` をキャッシュ無効（`skipCache`）に割り当て（#143 / PR #155）。`worker/core/llm.ts` と `wrangler.jsonc` の `vars` 変更のためデプロイ（§3「いつデプロイするか」の2契機に該当）。**既定は 3600 秒のままなので挙動は変えていない。** `migrations/` `data/` `scripts/` `src/` は未変更のため、マイグレーション・シード・フロントの再確認は不要 | **バインディングが本番へ渡ったことを deploy 出力で確認** — `env.AI_GATEWAY_CACHE_TTL ("3600")` が一覧に並ぶ。チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404 / 対象エリア外が HTTP 200 の `unanswered(out_of_area)` / `gaps` に記録 / `spots` 1,645行）。**伝播の観測はできない** — 既定値のままで挙動が変わらないため、新旧を区別する手掛かりが応答に無い（過去の反映で使った「`query` が `D1 実照会:` で始まるか」のような判別材料が存在しない）。**#143 の質問文3つを本番で引き直し、Issue 本文の観察が現行ビルド（#119/#120/#148 反映後）でも再現することを確認** — 「上野の寺社とナイトライフを楽しみたい」「上野でお寺めぐりとナイトライフ」はどちらも名所・史跡 ＋「ナイトライフ」の欠損報告、「上野の神社と夜遊びスポット」は名所・史跡 ＋ 銭湯で**欠損が出ない**（「夜」が銭湯のキーワードに当たる既知の限界・API.md §3.1）。候補の `aggregate_dataset` も D1 実照会で寛永寺を返し、**#148 の「旅程が痩せる」症状は出ていない**。**キャッシュの効きは所要時間だけでは判別できない** — 「1回目より2回目が速い」はサーバの立ち上がりでも同じ形に出るため、対照なしで測ると逆の結論が出る。毎回ちがう質問文を対照に置くと、既定では同一質問文だけが速く（中央値 0.43秒 vs 1.03秒）、`"0"` ではその差が消える（0.87秒 vs 0.89秒） |
| 2026-08-22 | `3489ed69-2eac-4c69-99b9-daa543641a48` | 生成 SQL が実在しない値で絞って0行になり、偽の未回答を返していた不具合の修正（#148 / PR #150）。`worker/core/text-to-sql.ts`（実在値・列・演算子の検査＋0行の裏取り）と `worker/core/operations.ts`（0行 SQL のログ）の変更のためデプロイ。`migrations/` `data/` `scripts/` `src/` は未変更のため、マイグレーション・シード・フロントの再確認は不要 | チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404）。**修正の要点を本番で実測** — 興味4件（ラーメン・文化・家族向け・自然）を候補4件へ投げて **4/4 answered**（修正前は 1/4）。実ブラウザのプラン画面も **1停留地 → 3停留地**（寛永寺／上野観光連盟／上野公園大黒天横。バランス型の表示上限が3）で、欠損はラーメンの粒度不足1件だけ（意図した正直な未回答）。**所要時間には書き直しのぶんが乗る** — キャッシュなしで **4,264ms**（拒否された候補は推論2回になる）、同じ入力の2回目は AI Gateway のキャッシュが効いて **1,175ms**。#142 の並列化（キャッシュなし1,786ms）と比べると**初回は約2.4倍**なので、収録前に同じ入力を1回流してキャッシュを温めること（キャッシュは1時間固定・#143）。**伝播待ちは不要だった**（デプロイ直後の1回目から新挙動） |
| 2026-08-22 | `c957fa38-18c3-47b1-9104-e985d5ea06f5` | プラン画面・あなたへ画面で候補ごとの `aggregate_dataset` を同時に投げる並列化（#142 / PR #145）。**`src/` と `docs/` のみの変更**だが、フロントエンドはデプロイしないと画面に出ないためデプロイ（§3「いつデプロイするか」）。`worker/` `shared/` `migrations/` `data/` `scripts/` は未変更のため、マイグレーション・シードは実行していない | チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404）。`index.html` のバンドル（`assets/index-Bu0ZQQSY.js`）はローカルビルドとハッシュ一致。**本番の実ブラウザでプラン画面を生成して並列化を確認** — 興味4件（ラーメン・文化・家族向け・自然）で `aggregate` 4本が **1ミリ秒以内に開始**（`PerformanceResourceTiming` 実測: 97442 / 97443 ×3）、`search` から `provenance` 完了まで **1,786ms**。直列なら**少なくとも**約5.9秒（並列時の個々 1,296〜1,412ms の単純合計。**これは推定で、実測ではない** — 直列の1回あたりは並列時より遅く出るため実際はこれ以上になる。本番 API 単体の実測では4件直列が 8.81 秒だった）。**欠損の並びも候補順のまま** — 検索側の「ラーメン」粒度不足を先頭に、集計側3件が候補順（名所・史跡 → トイレ情報 → 都市公園・都立公園一覧）で並ぶ。本番 API 単体でも実測 — `aggregate_dataset` 4件同時が合計 **1.55秒**（直列は 8.81秒）、あなたへ画面と同じ6件同時が合計 **2.28秒**、いずれも全件 200 で **429 は出ない**（同時に投げても1件あたりの応答時間は単発とほぼ同じ）。**伝播待ちは不要だった**（デプロイ直後の1回目から新バンドル） |
| 2026-08-22 | `8fade466-5782-4ae1-88db-9a523bd909aa` | 集計の絞り込みが強すぎて旅程の停留地が減るのを修正（PR #140・#119/#120 の後始末）。`worker/core/text-to-sql.ts` のプロンプト文言のみの変更で、構造とテストは無変更 | **この不具合は curl では見つからなかった** — コア操作を個別に叩くと全部 `answered` を返すので、`npm run dev` でプラン画面を実際に生成して初めて「停留地が1件しかない」と分かった。デプロイ後の確認も同じで、同一 intent（`ラーメン、文化`）を4候補すべてに投げて何件 `answered` になるかを見る必要がある。実測 — 伝播中は 2/4、約20秒後に **4/4**。修正前は 1/4 で、画面の旅程が4件から1件へ減っていた |
| 2026-08-22 | `ee918275-88ec-4e63-b4e1-d9aadbfe5cb1` | `search_datasets` にメタデータRAG（自然文の分解）を接続（#120 / PR #138）。**これで Step 3〜5（#121）の実装がすべて本番に載った**。`worker/core/` の変更のためデプロイ。`migrations/` `data/` `scripts/` `src/` は未変更 | **伝播中は欠損の有無が揺れた** — 新旧が混ざる時間帯に「上野と新宿を回りたい」の `out_of_area:新宿` が出たり出なかったりした。伝播後は同一クエリ6回で完全一致（AI Gateway のキャッシュが効くため）。実測 — 「上野の寺社とナイトライフを楽しみたい」が名所・史跡を返しつつ**「ナイトライフ」の取り落としを欠損として報告**（本 Issue の中核。従来は自然文だけの呼び出しでは報告できなかった）。「渋谷から上野の美術館へ行きたい」は文化観光施設／文化財一覧を返す（**従来の名所・史跡より質問に合っている**）。`aggregate_dataset` は引き続き D1 実照会（寛永寺）、`GET /mcp` は 405。本番 D1 の `gaps` に `上野の寺社とナイトライフを楽しみたい / 上野 / other` が**利用者の言葉のまま**記録された（LLM が読み取った興味は混ぜない）。**言い回しによって結果が変わる** — 「上野の神社と夜遊びスポット」は「夜」が銭湯のキーワードに当たり欠損が出ない（キーワード判定側の既知の限界で、分解では解消しない。API.md §3.1） |
| 2026-08-22 | `6984c9e6-c2b5-446f-9f52-440e7e783aa5` | `aggregate_dataset` を D1 実照会（Text-to-SQL）へ差し替え（#119 / PR #137）。**本番で初めて LLM 推論が動く**。`worker/core/` の変更のためデプロイ。`migrations/` `data/` `scripts/` `src/` は未変更のため、マイグレーション・シード・フロントの再確認は不要 | **伝播待ちが要った（前回より紛らわしい形で）** — デプロイ直後は同じ入力でも旧版（スタブ）と新版（D1 実照会）が混ざって返った。**どちらも `answered` を返すため HTTP コードや status では区別できない**。`query` が `D1 実照会:` で始まるか `固定データ抽出（スタブ）` かで判定すること。約1分後に 6/6 が D1 実照会になった。伝播後の実測 — 上野の寺社＝寛永寺（`WHERE ... category = '名所・史跡' AND area = '上野'`）、上野の美術館＝国立西洋美術館（`note` の電話番号まで要約に載る）、浅草の名所＝鷲神社。**ラーメンは `insufficient_granularity` のまま**（前段ガードが LLM より手前で効いていることの本番確認）。0行の経路は `other` ＋「…に当てはまる行は見つかりませんでした。」。`/mcp` 経由でも同じく D1 実照会（両面が同じコアを通っていることの確認）。**本番 D1 への書き込みも確認** — `gaps` に `本番確認・渋谷のイタリアンを1件 / 渋谷 / other`（0行経路）と `上野のラーメン屋を1件 / 上野 / insufficient_granularity`（前段ガード）が記録された。1リクエストの wallTime は約1.1秒（`wrangler tail` 実測・cpuTime 13ms） |
| 2026-08-22 | `5cd0c44f-a4ca-4814-98b7-4d74b32dae30` | `/mcp` 面の公開（#117 / PR #134 / ADR-008・MCP.md）。`worker/mcp.ts` の新規追加と `worker/index.ts` の1ルート追加のためデプロイ。`migrations/` `data/` `scripts/` `src/` は未変更のため、マイグレーション・シード・フロントの再確認は不要。**依存が増えたためバンドルが 131KB → 805KB**（gzip 193.36 KiB。Free の上限3MBに対し約6%）、Worker Startup Time は 4ms → 65ms（上限400ms） | **伝播待ちが要った** — デプロイ直後は `POST /mcp` が旧版に当たって Hono 既定の 404（`text/plain`）を返した。約20秒後に 200。GET だけ先に新版へ切り替わって見えるため、片方だけ見て判断しないこと。伝播後は両 era で確認 — legacy(2025): `tools/list` が3ツール、対象エリア外の `tools/call` が `isError` なしの `unanswered(out_of_area)`、入力の形の違反が `isError: true` ＋ `/api/*` と同一文言。modern(2026-07-28): `Mcp-Method` / `Mcp-Name` ヘッダ ＋ `_meta` エンベロープつきの `tools/call` が `resultType: "complete"` で `answered`。`GET /mcp` は 405（JSON-RPC のエラー本体つき・SPA に落ちない）。`/api/health` の `runtime` = `Cloudflare-Workers` で `/api/*` は従来どおり。**本番 D1 への書き込みが `/mcp` 経由で発生することを確認** — `gaps` に `MCP経由の本番確認・新宿の美術館 / 新宿 / 美術館 / out_of_area` が**解決後のエリアつきで**記録された（DOMAIN.md §8 不変条件4 が `/api/*` と `/mcp` の両経路で成立）。実クライアントの接続も確認 — `claude mcp add --transport http` → `claude mcp list` が `✔ Connected`。**推論の実行はまだ発生していない**（`env.AI.run()` を呼ぶコードが無いため AI Gateway のログにも積まれない） |
| 2026-08-21 | `01092dd6-b67c-494a-af78-8199369841a9` | Workers AI の `ai` バインディングと AI Gateway 設定（`vars.AI_GATEWAY_ID`）の導入（#116 / PR #123 / ADR-013）。**挙動は変えていない**（コアからの LLM 呼び出しはまだ無い）。`wrangler.jsonc` のバインディング変更のためデプロイ（§3「いつデプロイするか」に本 PR で追加した契機そのもの）。`migrations/` `data/` `scripts/` `src/` は未変更のため、マイグレーション・シード・フロントの再確認は不要 | **バインディングが本番に渡ったことを deploy 出力で確認** — `env.AI`（AI）と `env.AI_GATEWAY_ID ("default")`（Environment Variable）が一覧に並ぶ。チェックリスト全項目 OK（health の `runtime` = `Cloudflare-Workers` / SPA `/` 200 / `/showcase/` 200 / `/api/nope` 404）。コア3操作の挙動が従来と同一であることを実測 — `上野の寺社をめぐりたい` が `answered`（台東区・名所・史跡）、`新宿の美術館に行きたい` が HTTP 200 の `unanswered(out_of_area)` で文言も従来どおり。**本番 D1 への書き込みも従来どおり発生している** — 上記の実測で `gaps` に `新宿の美術館に行きたい / 新宿 / 美術館 / out_of_area` の行が**解決後のエリアつきで**記録された（DOMAIN.md §8 不変条件4 が本番で成立）。**推論の実行は本デプロイでは発生していない**（`env.AI.run()` を呼ぶコードがまだ無いため、AI Gateway のログにも積まれない。ゲートウェイ経由の実測はローカル `npm run dev` で実施済み） |
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
U=https://tabi-concierge-tokyo.tokyo-odh-091.workers.dev
curl -s $U/api/health   # runtime が "Cloudflare-Workers" であること
curl -s -o /dev/null -w '%{http_code}\n' $U/            # 200（SPA）
curl -s -o /dev/null -w '%{http_code}\n' $U/showcase/   # 200（デザインプロトタイプ）
curl -s -o /dev/null -w '%{http_code}\n' $U/api/nope    # 404（SPA に倒れないこと）
```

`/api/health` の `runtime` は、**ローカルと本番が同じランタイムで動いているか**を実測するために置いている。設定ファイルの読み合わせでは確認できない。

**疎通だけでは足りない。** 2026-08-17 の事故は `/api/health` が正常に応答したまま起きた（古い Worker にも health はある）。コア3操作と D1 まで実際に叩く。

```bash
U=https://tabi-concierge-tokyo.tokyo-odh-091.workers.dev

# 1. コア3操作が生きている（404 でない）
curl -s -X POST $U/api/search-datasets -H 'content-type: application/json' \
  -d '{"query":"上野の寺社をめぐりたい","area":"上野"}'

# 2. 対象エリア外は HTTP 200 の unanswered（エラーにしない）
curl -s -X POST $U/api/search-datasets -H 'content-type: application/json' \
  -d '{"query":"新宿の美術館に行きたい","category":"美術館"}'

# 3. 上の呼び出しが gaps に記録されている（DOMAIN.md §8 不変条件4 が本番でも成立）
npm run --silent db:query -- \
  "SELECT question, area, category, reason FROM gaps ORDER BY id DESC LIMIT 3"

# 4. データが入っている
npm run --silent db:query -- "SELECT COUNT(*) AS n FROM spots"   # [{"n":1645}]
```

**3 が最重要。** `gaps` テーブルが無くても未回答の応答は 200 で正常に返り、記録の失敗は `console.error` に出るだけなので、**画面を見ても API を叩いても気づけない**（[Issue #27](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/27) でテストを2通り書いて捕まえた失敗モードそのもの）。

#### AI Gateway / Workers AI の確認（[ADR-013](../06-reference/DECISIONS.md)）

**ここは自動テストが**意図的に**見ていない領域である。** `vitest.worker.config.ts` の `remoteBindings: false` は、CI を外部 API・認証情報・無料枠から切り離すために置いてある（外すと認証情報を持たない CI が全滅する）。その代償として、**バインディングが本番に渡っているか・ゲートウェイを実際に経由しているかを検証するのはこの手順だけ**になる。デプロイのたびに飛ばさずに実行する。

```bash
# 5. バインディングが本番の Worker に渡っている
#    （deploy の出力に AI と AI_GATEWAY_ID が並ぶことを目視する。
#     wrangler.jsonc を直しても deploy しなければ本番には反映されない）
npm run deploy 2>&1 | grep -A10 'Your Worker has access to'
```

推論を実際に叩く確認（LLM 経路が入る [#119](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/119) / [#120](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/120) 以降に有効）:

| 確認すること | 見る場所 |
| --- | --- |
| 推論が成功している | コア操作の応答が LLM 経路の結果になっている（縮退していない） |
| **ゲートウェイを経由している** | ダッシュボード AI → AI Gateway → `default` にログが積まれる。**積まれない＝素の `env.AI.run()` を書いてしまっている**（ADR-013 決定1 違反） |
| キャッシュが効いている | 同一入力を2回投げて2回目が Cache HIT になる |
| 無料枠の残り | 同ダッシュボードのニューロン消費。10,000/日が上限 |

> **縮退は静かに起きる。** LLM 障害時はキーワード実装へ落ちて 200 を返す設計なので（#119・#120）、**応答が返ることは推論が動いている証拠にならない**。`console.error`（`npx wrangler tail`）とゲートウェイのログの両方で確かめる。これは上の「3 が最重要」と同じ失敗モードである。

`ai` バインディングと `vars.AI_GATEWAY_ID` の導入時（[Issue #116](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/116)）に、ローカル実 API で `env.AI.run()` の成功・ゲートウェイ経由・`default` の自動作成を実測済み。

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

### [1.19.1] - 2026-08-23

#### 追加

- §3「デプロイ記録」に、申請用操作デモ動画の公開（Version ID `57ee95fe-95b9-41c1-a089-0fe30e85769a`・[Issue #131](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/131) / [PR #224](https://github.com/fffokazaki/tabi-concierge-tokyo/pull/224)）を追加。公開MP4とリポジトリのバイト一致、形式、標準チェック、Range応答を実測した

### [1.19.0] - 2026-08-23

#### 追加

- §1 の主要ステップと §3「いつデプロイするか」に、`public/` の変更を `npm run deploy` の契機として追加。Vite が `public/` を Worker の静的アセットへ同梱するため、マージだけでは申請用動画などの公開ファイルが本番へ反映されない

### [1.18.4] - 2026-08-22

#### 追加

- §3「デプロイ記録」に Issue #114 / PR #214・#216 の最終反映（Version ID `3fbb592c-8221-4749-a31f-89b3399305db`）を追記。3入力分岐、標準チェックリスト、コア3操作、リモート D1 の件数と `gaps` 記録を実測し、補完前の中間 Version が短時間載った経緯も隠さず記録した

### [1.18.3] - 2026-08-22

#### 追加

- §3 デプロイ記録に `c607291d-c80d-45dd-a4fa-dcf6a08f5155` を追加（[Issue #188](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/188) / [PR #204](https://github.com/fffokazaki/tabi-concierge-tokyo/pull/204)）。本番 D1 が寛永寺へ `category: "名所・史跡"` を返すこと、寛永寺カードが `heritage` 画像を表示すること、配信中の HTML とカテゴリ画像9件が手元のビルドとバイト一致することまで実測した

### [1.18.2] - 2026-08-22

#### 追加

- §3 デプロイ記録に `688c5cb7-0c64-4440-9f59-cbbedec9463e` を追加（[Issue #192](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/192) / [PR #198](https://github.com/fffokazaki/tabi-concierge-tokyo/pull/198)）。未回答の還元を画面に出した回。**`src/` と `docs/` だけの変更**なので `src/` 行の契機に該当する。確認は bundle のバイト一致に加え、**内訳が空の未回答（あなたへ画面のラーメン単独）で注記が出ることを本番の実ブラウザで実測**した ―― この経路はテストでは固定できても、条件を `gaps.length > 0` に書き換えると本番でだけ静かに消える

### [1.18.1] - 2026-08-22

#### 変更

- §3 の確認手順 3・4 を `npx wrangler d1 execute --remote --command …` から `npm run --silent db:query -- …` へ（[Issue #189](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/189)）。結果行だけが出るので、実行メタ情報に押し出されて読めない状態にならない

### [1.18.0] - 2026-08-22

#### 追加

- §3 デプロイ記録に `460c9237-4423-436d-aa93-e1b0942bd4a5` を追加（[Issue #174](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/174)）。対象エリア外の行が旅程に混ざる不具合を、SQL ではなく行の選定側（`pickPreferredRow`）で修正した回。**プロンプトへ指示を足す修正は効かないことを実測してから捨てた**（8回中6回が OR 形のまま）。測定のため `AI_GATEWAY_CACHE_TTL="0"` の一時版が本番に載った時間帯があることも記録した

### [1.17.0] - 2026-08-22

#### 追加

- §3 デプロイ記録に `a17750ee-4a0d-472b-b8ee-5afa6fd5084a` を追加（[Issue #171](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/171)）。デプロイ先アカウントを `tokyo_odh_091` へ移設した回。**新アカウントでは疎通確認では LLM 経路の生死を判定できない**（縮退しても HTTP 200 で旅程が返る）ため、`wrangler tail` の縮退マーカー0件と、`aggregate_dataset` の `query` が LLM 生成 SQL であることの両方で確認したことを記録に残した
- 環境一覧の Cloudflare アカウント行を `tokyo_odh_091`（ID 併記）へ更新し、本番URLを差し替えた

### [1.16.0] - 2026-08-22

#### 追加

- §3 デプロイ記録に `1e2a4be9-4f3a-4ce2-9bb6-6813f3f6bed0` を追加（[Issue #153](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/153) / [PR #167](https://github.com/fffokazaki/tabi-concierge-tokyo/pull/167)）。名指しされた施設が無いときの扱いを決定として明文化した回。**ランタイムの挙動は変えておらず**、実行時に変わったのは `tools/list` が配る `aggregate_dataset` のツール説明だけなので、確認も「広告文が反映されたこと」を対象にしたことを記録に明記した

### [1.15.0] - 2026-08-22

#### 追加

- §3「いつデプロイするか」の契機テーブルに **`src/` を変更する PR をマージしたとき → `npm run deploy`** の行を追加（Issue #164）。従来は表の下に散文で「`src/` だけの変更もデプロイしないと画面に出ない」と書いてあるだけで**契機として列挙されておらず**、提出前チェックリスト項番9 が §3 を参照させているのに §3 に `src/` が無いという食い違いがあった。散文の注意書きはチェックリストとして機能しない ―― 契機を決めていなかったこと自体が43コミット遅れ（Issue #46）の原因だったため、表の行として持つ
- §3 のデプロイ記録に 2026-08-22 の反映（Version `c2efd7b1`・PR #163 / Issue #146）を追記。コア3操作の呼び出しにタイムアウト（既定 6000ms）を追加。**配信中の bundle が手元のビルドとバイト一致すること**で反映を確認した（`src/` だけの変更は API 応答に痕跡が出ないため、従来の「応答の中身で新旧を見分ける」手が使えない）

### [1.14.0] - 2026-08-22

#### 追加

- §3 のデプロイ記録に 2026-08-22 の反映（Version `712c2277`・PR #158 / Issue #144）を追記。停留地の説明から管理用メタデータを落とす修正。**AI Gateway のキャッシュの影響を受けない**（キャッシュは SQL 生成の推論に効き、`toResult` はその後段で毎回走る）ため、TTL 内でも修正が即座に出ることを記録した

### [1.13.1] - 2026-08-22

#### 変更

- §3「収録前の手順」の本番での引き直しに、**書き換えをコミットする必要がない**ことを追記（[Issue #143](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/143)）。`npm run deploy` はワークツリーを読むため、絶対ルール #5（`develop` 直コミット禁止）と衝突しない。戻し忘れは `git status` に残ることも明記した

### [1.13.0] - 2026-08-22

#### 追加

- §3 のデプロイ記録に 2026-08-22 の反映（Version `6229d576`・PR #155 / Issue #143）を追記。キャッシュ TTL の vars 化。**既定値のままなので伝播の観測はできない**ことと、**キャッシュの効きは所要時間だけでは判別できない**（対照なしで測ると逆の結論が出る）ことを記録した。#143 の質問文3つを現行ビルドで引き直した結果も残している

### [1.12.0] - 2026-08-22

#### 追加

- §3 に「収録前の手順 — キャッシュの引き直しとニューロン残量」を追加（[Issue #143](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/143)）。`vars.AI_GATEWAY_CACHE_TTL` でキャッシュ TTL を切り替える手順（ローカルは `.dev.vars`・本番は deploy）と、収録直前のニューロン残量確認を明文化した

#### 変更

- §3 の設定表「キャッシュ TTL」の置き場所を「呼び出し側（`env.AI.run` の第3引数）」から `wrangler.jsonc` の `"vars".AI_GATEWAY_CACHE_TTL` へ更新（ハードコードをやめたため）

### [1.11.0] - 2026-08-22

#### 追加

- §3 のデプロイ記録に 2026-08-22 の反映（Version `3489ed69`・PR #150 / Issue #148）を追記。偽の未回答の修正。本番で **4/4 answered**（修正前 1/4）・画面が **1停留地 → 3停留地**であることを実測した。**書き直しのぶん初回が遅くなる**（4,264ms / キャッシュ時 1,175ms）ため、収録前にキャッシュを温める手順を記録

### [1.10.1] - 2026-08-22

#### 変更

- §3 のデプロイ記録（Version `c957fa38`）の「直列なら約5.9秒」が、**並列実測値の単純合計から導いた推定**であることを明記。直列の1回あたりは並列時より遅く出る（本番 API 単体の実測で4件直列 8.81 秒）ため、実測値と推定値が並んで読めてしまう書き方を直した

### [1.10.0] - 2026-08-22

#### 追加

- §3 のデプロイ記録に 2026-08-22 の反映（Version `c957fa38`・PR #145 / Issue #142）を追記。候補ごとの `aggregate_dataset` の並列化。**本番の実ブラウザで4本が同時に開始していること（1ミリ秒以内）と end-to-end 1,786ms** を実測し、`aggregate_dataset` の同時実行で 429 が出ない（4件・6件とも）ことも記録した

### [1.9.0] - 2026-08-22

#### 追加

- §3 のデプロイ記録に 2026-08-22 の反映（Version `8fade466`・PR #140）を追記。**コア操作を個別に curl で叩くだけでは見つからない種類の不具合**（画面の停留地が減る）だったこと、確認には同一 intent を複数候補へ投げて `answered` の数を見る必要があることを記録

### [1.8.0] - 2026-08-22

#### 追加

- §3 のデプロイ記録に 2026-08-22 の反映（Version `ee918275`・#120 / PR #138）を追記。Step 3〜5（#121）の実装がすべて本番に載った回。伝播中は欠損の有無が揺れること、伝播後は AI Gateway のキャッシュで同一クエリが安定すること、言い回しによって結果が変わること（キーワード判定側の既知の限界）を記録

### [1.7.0] - 2026-08-22

#### 追加

- §3 のデプロイ記録に 2026-08-22 の反映（Version `6984c9e6`・#119 / PR #137）を追記。本番で初めて LLM 推論が動いた回。**伝播中は旧版（スタブ）と新版（D1 実照会）がどちらも `answered` を返すため status では区別できず、`query` の先頭で判定する必要がある**点を明記

### [1.6.0] - 2026-08-22

#### 追加

- §3 のデプロイ記録に 2026-08-22 の反映（Version `5cd0c44f`・#117 / PR #134）を追記。`/mcp` 面の公開。伝播待ちで `POST /mcp` だけ旧版に当たった経緯（GET は先に切り替わって見える）、両 era での確認内容、`/mcp` 経由で本番 D1 に `gaps` が記録されたこと、`claude mcp add` で実クライアントが接続できたことを記録

### [1.5.1] - 2026-08-21

#### 追加

- §3 のデプロイ記録に 2026-08-21 の反映（Version `01092dd6`・#116 / PR #123）を追記。`ai` バインディングと `vars.AI_GATEWAY_ID` の導入で、挙動は不変。推論の実行はまだ発生していない旨も記録

### [1.5.0] - 2026-08-21

#### 追加

- §3 に「AI Gateway / Workers AI」小節を追加（[Issue #116](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/116)・ADR-013）。ゲートウェイ ID `default` が自動作成される予約名であること、名前付きへ切り替える手順、未作成の名前を指定すると推論が `AiGatewayError: 2001` で落ちること、ローカル開発でも実 API を叩くこと、テストは `remoteBindings: false` で外へ出さないことを記載
- §3 のデプロイ契機の表に「`wrangler.jsonc` のバインディング・`vars` を変更したとき」の行を追加。バインディングは `npm run deploy` でしか本番へ渡らない
- §3 のデプロイ後の確認に「AI Gateway / Workers AI の確認」を追加（PR #123 の Codex レビュー指摘）。`remoteBindings: false` で CI が触らない領域を、デプロイ後手順で塞ぐ。ゲートウェイ経由でないと素の `env.AI.run()` を書いた事故に気づけない点、縮退が静かに起きる点を明記

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
