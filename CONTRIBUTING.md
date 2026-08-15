# CONTRIBUTING — 旅コンシェルジュTOKYO

東京都知事杯オープンデータ・ハッカソン 2026 の参加作品です。チーム外の方の参加も想定しているため、**このリポジトリだけを見れば作業できる**ように手順をまとめています。

## 最初に読むもの

| 目的 | 参照先 |
| --- | --- |
| プロジェクト全体を知る | [README.md](README.md) |
| 仕様・設計を知る | [docs/MASTER.md](docs/MASTER.md)（全文書への索引） |
| 何を作業するか知る | [docs/07-project-management/TASKS.md](docs/07-project-management/TASKS.md) |
| 守るべき制約を知る | [docs/01-context/CONSTRAINTS.md](docs/01-context/CONSTRAINTS.md) |

AI ツールを使う場合、[CLAUDE.md](CLAUDE.md)（Claude Code）／[AGENTS.md](AGENTS.md)（Codex 等）に同じ内容の指示を置いてあります。

## 開発の流れ（軽量フロー）

PoC 段階のため、手順は最小限にしています。判断の背景は [ADR-006](docs/06-reference/DECISIONS.md)。

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/短い説明     # Issue があれば feature/#12-短い説明
# 実装・コミット
git push -u origin feature/短い説明
gh pr create --base develop        # または GitHub の Web UI から
```

| 項目 | 扱い |
| --- | --- |
| **Issue 起票** | **任意**。仕様に議論が必要なとき・作業を分担するときだけ |
| **ブランチ** | **必須**。`develop` から切る。`main` / `develop` に直接コミットしない |
| **PR** | **必須**。base は `develop`。1行でよいので「何を・なぜ」を書く |
| **レビュー** | 変更内容に応じて。設計判断を含む変更・出典まわりの変更は必ず見てもらう |
| **マージ** | squash merge。マージ後はブランチを削除する |

### ブランチ命名

`feature/` `fix/` `chore/` `docs/` のいずれか + 短い説明。Issue があれば番号を含める（例: `feature/#12-provenance-chip`）。

### コミットメッセージ

Conventional Commits を日本語で。

```
feat: プラン画面にオープンデータの出典チップを表示
fix: 出典が空のときに回答を生成しないよう修正
docs: DATABASE.md に利用データの取得日を追記
```

### Issue のクローズについて

デフォルトブランチが `main`、統合ブランチが `develop` のため、`develop` へマージしても GitHub の `Closes #N` は発火しません。Issue は手動でクローズしてください。

## このプロジェクト固有のルール

コードを書く前に知っておいてほしいことが4つあります。

1. **出典なしの回答を作らない** — 全回答に東京都オープンデータカタログへのリンクを付ける。根拠がなければ「ありません」と答える。これは機能であると同時に CC BY 4.0 のライセンス遵守手段でもあります
2. **「データがない」はエラーではない** — 答えられなかった質問は握りつぶさず、分類して記録します（都へのデータ公開リクエストの材料になります）
3. **カタログ掲載データ以外を組み込まない** — カタログ外の「公表されただけのデータ」は二次利用できません
4. **推測で埋めない** — 文書に「未定」「未確認」とある値は、確定していないという情報そのものです。それらしい数値で置き換えないでください

## ドキュメントを変更するとき

- frontmatter（`version` / `updated` / `changeImpact`）と末尾の Changelog を同時に更新してください
- 冒頭に「⚠️ テンプレート未具体化」とある文書は、まだ本プロジェクト向けに書き換えられていません。そこに書かれている技術（DB・REST/GraphQL・コンテナ等）は**本プロジェクトの決定ではありません**

## 提出物に関わる制約

締切と規定は動かせません。資料・動画を作る前に [CONSTRAINTS.md](docs/01-context/CONSTRAINTS.md) を確認してください。

- 2026-08-23（日）17:00 提出締切
- First Stage 収録は **2分厳守・ライブデモ不可**（動くデモは資料内に動画として埋め込む）
- BGM は使わない / Google Map を使う場合はロゴ・帰属表示を隠さない / 引用は出典明記

## 困ったとき

- 仕様が分からない → [docs/MASTER.md](docs/MASTER.md) の索引から該当文書へ。それでも不明ならメンテナに確認してください（推測で進めない）
- 用語が分からない → [docs/06-reference/GLOSSARY.md](docs/06-reference/GLOSSARY.md) の「プロジェクト固有用語」
- なぜそう決まったか知りたい → [docs/06-reference/DECISIONS.md](docs/06-reference/DECISIONS.md)（ADR）
