---
title: "PLAYBOOK"
version: "1.24.0"
status: "approved"
created: "2026-08-15"
updated: "2026-08-18"
changeImpact: "medium"
owner: "@fffokazaki"
ace_entry_count: 66
tags: [ace, playbook, knowledge-management]
references:
  - docs/05-operations/deployment/ace-cycle.md
  - docs/MASTER.md
---

# ACE Playbook

> **Parent**: `08-knowledge/BEST_PRACTICES.md`（本リポジトリ未導入。必要時に ff-dev-toolkit の `docs-template/08-knowledge/BEST_PRACTICES.md` からコピー） | **関連**: [ACE サイクル運用手順](../05-operations/deployment/ace-cycle.md) | ACE フレームワーク概念（本リポジトリ未導入。理論的背景は <https://github.com/feel-flow/ai-spec-driven-development/blob/develop/docs/ACE_FRAMEWORK.md>）

## 概要

### 目的

ACE (Agentic Context Engineering) Playbook は、開発プロセスで得た知見を **AIツールが直接参照できる構造化形式** で蓄積するファイルです。

GitHub Discussions が「人間が読むためのナラティブ（物語的記録）」であるのに対し、Playbook は「AIが参照するための構造化知見（delta方式: 差分のみを末尾追記する更新方式）」として機能します。

> **本リポジトリでの ACE 実行は任意（2026-08-15 時点・[ADR-006](../06-reference/DECISIONS.md)）**: PoC 段階のため、PR ごとの ACE 実行を必須ゲートにしていない。メンテナ環境では必須運用とし、それ以外の作業者は任意とする。
>
> **本リポジトリでの前提（2026-08-15 時点）**: `scripts/ace/*.ts`（`check-entry-format` / `check-category-size` / `ace-reuse-report` 等）と対応する `npm run ace:*` は**未導入**。
> 以降に登場する「機械ゲートが強制する / exit 1 でブロックする」という記述は、**導入後に有効になる規約**として読むこと。エントリが増えて自動検証が必要になった時点で、ff-dev-toolkit の `docs-template/scripts/ace/` から導入する。

### 運用ルール

| ルール                             | 説明                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **末尾追記のみ**                   | エントリは常にファイル末尾に追記。既存エントリの本文書き換えは禁止。カウンター更新・Status変更は許可。**例外**: `/ace-refine` 実行中の意味保存要約のみ書き換え可（原文の `playbook/archive/` への verbatim 保全が必須条件） |
| **行数バジェット**                 | 1 エントリ 15 行以内（anchor 行〜終端 `---`）。反直感的な詳細が必要な場合のみ例外宣言を添えて 30 行以内。有効な宣言の判定は直下の「行数バジェット例外の有効条件」に従う |
| **カウンターはインクリメントのみ** | Helpful/Harmful は +1 のみ。減算・リセットはしない（`/ace-refine` の重複統合時の合算は例外）                                   |
| **削除禁止**                       | エントリを物理的に削除しない。不要な場合は `Status: deprecated` に変更、または `/ace-refine` で `playbook/archive/` へ原文保全のうえ移動 |
| **密度超過時は正準化 → refine → 必要なら分割** | 行数上限は**件数から導出**する（`ヘッダ行数 + 件数 × 16`。16 = 行数バジェット 15 + ブロック間の空行 1）。超過は「ファイルが大きい」ではなく「**1 エントリが太い**」の意味なので、第一対応は旧テーブル形式の正準化、次に `/ace-refine`。件数ゲートは二段（refine 目安 130 件・警告 / ブロック上限 180 件・exit 1）。分割は「同一カテゴリ内で検索語彙が明確に分岐する」ときだけ。ファイル分割だけでは Category 値が合算されるため件数ゲートは解除されない。分割レイアウトの索引 `PLAYBOOK.md` は行数監視対象外 |
| **定期 Refine**                    | 月次または件数・行数ゲート発火時に `/ace-refine` で stale アーカイブ・圧縮・統合・昇格を実行（dry-run → 承認 → 適用）          |
| **アーカイブの扱い**               | `playbook/archive/` 配下は `ace_entry_count`・カテゴリ件数ゲート・reuse 集計の対象外。参照リンクが切れていたら archive を ID で grep して探す |
| **Frontmatter更新**                | エントリ追加時に `version`, `updated`, `changeImpact`（minor 上げ = `medium`）, `ace_entry_count` を更新（`ace_entry_count` は live エントリ数 = archive を数えない） |
| **コミット規則**                   | 件名 `knowledge: ACE-XXX <要約>`、カテゴリは commit body の `Categories:` 行に記録                                             |

#### 行数バジェット例外の有効条件

`<!-- ace-line-budget-exception: 理由 -->` は、次の 4 条件をすべて満たす場合だけ有効な例外宣言として数える。

1. **エントリブロックの内側に置く** — anchor 行〜終端 `---` の範囲内だけが有効。ヘッダ・§運用ルール・Changelog の記述は加算されない
2. **閉じた HTML コメント span にする** — 上記のコメントが `<!--` から `-->` まで閉じている場合だけ有効。散文中の言及は数えない
3. **1 ブロックにつき最大 1 件** — 理由を書き分けて複数宣言しても、加算は 1 件で頭打ちになる
4. **コードとしての例示は数えない** — 同一行内で対になったインラインコードスパン、または閉じたコードフェンス内のマーカーは宣言ではない

### エントリID規則

ACE エントリ ID は **PRスコープ式** を採用する（このセクションが ID 規則の SSOT）。複数人・複数AIが並行で `/ace-curate` を回しても番号が衝突しないための構造である。

- **形式**: `ACE-<PR番号>-<連番>`（例: `ACE-438-1`, `ACE-438-2`）
- **非PR由来の fallback**: `ACE-i<Issue番号>-<連番>`（例: `ACE-i425-1`）
- **採番**: 同一 PR の既存 `ACE-<PR番号>-*` の最大連番 +1 を連番とする（既存が無ければ連番 `1`、すなわち最初のエントリは `ACE-<PR番号>-1`）。**全体の最新 ID を読む必要がない**ため並行採番でも衝突しない（PR 番号は GitHub が全体一意に採番するため、別 PR = 別 namespace）。
- **連番の範囲**: 1 回の `/ace-curate` で同一 PR から 1〜3 件追記する想定。同一 PR を再 curate する場合は既存の最大連番から継続。
- **フェンス内の見出し例示は非正準形で**: コードフェンス内にエントリ見出しを例示する場合、ID は `ACE-XXX` のようなプレースホルダにする。正準形（実 ID の形）の例示は分割境界の判定を歪めるため、件数ゲート・形式ゲートが fail-loud に拒否する（レポート系は除外して警告する）。
- **妥当な形状**（機械ゲート `check-entry-format` が強制する）: `ACE-` + 省略可の `i` + 数字列（`-` 区切りで複数段可）。旧 3 桁形式（`ACE-001`）と 3 段以上（`ACE-1-2-3`）は妥当。**禁止**: 二重ハイフン（`ACE-337--1`）・アンダースコア（`ACE-1_9`）・英字 suffix（`ACE-01a` / `ACE-438-1a`）・連番の無い単段（`ACE-1` / `ACE-01` / `ACE-0001` / `ACE-i425` — 単段を許すのは旧 3 桁形式だけで、PR 由来・Issue 由来とも連番が必須）。枝番が要る場合は suffix ではなく `-<連番>` を 1 段増やす（suffix を許すと、参照走査の単語境界の都合で同じエントリが suffix の有無で 2 通りに参照され、Helpful カウンターと stale 判定が分裂する）。
- **見本用の予約**: `ACE-000-*` は本テンプレート同梱の見本エントリ専用に予約する。対応する PR は存在しないため、実プロジェクトでは採番しない（見本を消せば `ACE-000-*` も消える）。
- **既存 ID の扱い**: 旧 `ACE-{連番3桁}` 形式（`ACE-001`〜）のエントリは **改名しない**。旧 3 桁形式と新 PRスコープ式は恒久的に共存する（参照・anchor 互換の維持）。ID にファイル位置の情報は持たせないため、分割後も ID はそのまま維持する。

---

## カテゴリ一覧

| カテゴリ                | 説明                                                 | 例                                   |
| ----------------------- | ---------------------------------------------------- | ------------------------------------ |
| `coding`                | コーディングパターン、言語固有のベストプラクティス   | 型安全性、エラーハンドリング         |
| `architecture`          | 設計判断、構造上の決定事項                           | レイヤー設計、モジュール分割         |
| `testing`               | テスト戦略、テストパターン                           | モック設計、テストデータ管理         |
| `security`              | セキュリティ対策、脆弱性防止                         | 認証、暗号化、入力検証               |
| `performance`           | パフォーマンス最適化                                 | キャッシュ、クエリ最適化             |
| `devops`                | CI/CD、デプロイ、環境構築                            | パイプライン、インフラ設定           |
| `process`               | 開発プロセス、ワークフロー改善                       | レビュー手法、タスク管理             |
| `tooling`               | ツール設定、開発環境                                 | IDE設定、リンター、フォーマッター    |
| `documentation-quality` | ドキュメントの品質・整合性・記法統一                 | anchor整合、表記揺れ、リンク切れ防止 |
| `knowledge-management`  | 知見・Playbook自体の運用・構造化                     | ACE運用ルール、索引設計              |
| `documentation`         | ドキュメント作成・構成（品質観点を除く一般カテゴリ） | 文書構成、README整備                 |

---

## ステータス定義

| ステータス   | 説明                                   | 遷移条件                                                |
| ------------ | -------------------------------------- | ------------------------------------------------------- |
| `active`     | 有効な知見                             | 新規作成時のデフォルト                                  |
| `deprecated` | 非推奨（古い情報、矛盾が発見された等） | Harmful >= 3 かつ Helpful < Harmful、または明示的な判断 |
| `merged`     | 別エントリへ統合され live から消えた（`playbook/archive/` 側のコピーにのみ現れる） | `/ace-refine` の近似重複統合で「統合される側」になったとき（R3-c）。直上の `> Merged into:` ポインタと対になる |

`merged` は archive 専用のステータスである。`> Merged into:` ポインタは人間読者には効くが機械的には `active` と区別できないため、archive を ID で grep した人に「有効なエントリ」として誤読されるのを防ぐ。`Status` 変更は削除禁止・カウンター不変の契約と衝突しない（`/ace-curate` でも許可されている操作）。

---

## エントリテンプレート

新しいエントリは、以下の**コンパクト正準フォーマット**で追記してください：

```markdown
<a id="ace-XXX"></a>

### ACE-XXX: [検索可能な主張 1 文のタイトル]

| Category | [カテゴリ] | Origin | PR #XXX / Issue #YYY |
| Date | YYYY-MM-DD |
| Helpful | 0 | Harmful | 0 |
| Status | active |

[本文 2〜4 文。1 文目 = 知見の本質（何を学んだか）。非自明な適用条件（どんな状況で使うか）が 1 文。推奨アクションで締める。手順の列挙・叙述は書かない — 主張が明確なら詳細は読み手（AI）が再導出できる]

---
```

- **メタ 4 行は各行の行頭に置く**: `Category` / `Date` / `Helpful` / `Status` を行頭のパイプ区切りで書くことが、フィールドを読む集計スクリプト（`check-category-size` / `ace-reuse-report`）のパース互換条件。1 行に畳んだ `H:n | #PR` のような形式は集計から漏れる
- **GitHub 上でテーブル描画されない**: ヘッダ行・区切り行を持たないため、パイプ行はプレーンテキストとして表示される。Playbook は AI が参照するための構造化文書であり、これは意図した仕様（markdownlint / Prettier が警告する場合は当該ブロックに `<!-- prettier-ignore -->` を付与する局所抑制で対応 — ACE-011 の適用）
- **行数バジェット**: 1 エントリ 15 行以内（anchor 行〜終端 `---`）。反直感的な詳細が必要な場合のみ `<!-- ace-line-budget-exception: 理由 -->` を 1 行添えて 30 行以内
- **旧形式との共存**: 旧テーブル形式（`| フィールド | 値 |` ヘッダ + **Insight**/**Context**/**Action** ブロック）のエントリは読み取り互換として共存させる（改稿は `/ace-refine` の圧縮操作のみが行う）。新規追記には使わない
- **形式は機械ゲートで強制される**: `scripts/ace/check-entry-format.ts` が `playbook/*.md` 直下を走査し、PLAYBOOK.md と同階層の `legacy-format-allowlist.txt` に無い旧形式エントリを見つけると exit 1 でブロックする（allowlist ファイルが無ければ旧形式は全て赤 = strict）。**新規追記のために allowlist へ ID を足さない**（allowlist は既存エントリの互換維持のためのものであり、新規追記の抜け道ではない）。`/ace-refine` の allowlist 削除は変種で分岐する（完全正準化なら削除、ハイブリッド残置なら削除しない。手順は `/ace-refine` R3-e step 6）。`playbook/archive/` は原文を verbatim 保全する場所なので走査対象外

### 記述ガイドライン

- **anchor**: 各エントリは見出し直前に `<a id="ace-XXX"></a>` を 1 行付与する。`XXX` は **エントリ ID を小文字化したもの**（新規は `ace-438-1` / `ace-i425-1`、旧エントリは `ace-001`。anchor 部分は常に小文字英数字＋ハイフン）。ファイルレベル参照（サブファイル単体）は常にファイル先頭に着地するため、anchor がなければ個別エントリへの誘導が成立しない。anchor 付与により他ドキュメントから `[ACE-438-1](path/to/playbook/<category>.md#ace-438-1)` 形式で**特定エントリに直接ジャンプ可能**になる。
- **参照リンク形式**: 他ドキュメントから ACE エントリを参照する場合は `[ACE-XXX](path/to/playbook/<category>.md#ace-XXX)` 形式に統一する（`<category>` はそのエントリの Category 値、`XXX` はエントリ ID の接頭辞 `ACE-` / `ace-` を除いた部分。新規は `438-1`、旧は 3 桁 `040`。label は `ACE-438-1`、anchor は `#ace-438-1`）。カテゴリが分からない場合は本ファイルの [索引テーブル](#エントリ一覧) で確認する。`[PLAYBOOK ACE-XXX]` / `[PLAYBOOK.md ACE-XXX]` 等の異なる label は使わない（label が揺れると同じエントリが別物に見え、索引検索でも到達できなくなる）。
- **本文の構成**: 1 文目 =「何を学んだか」（知見の本質）。2 文目 =「どんな状況で使うか」（非自明な適用条件。再現条件が明確であるほど価値が高い）。最後に「次回何をすべきか」（推奨アクション）。
- **書かないもの**: 実施手順の番号付き列挙、インシデントのタイムライン叙述、環境固有の調査ログ。主張と適用条件が明確なら、詳細手順は参照時に AI が再導出できる。一回性の記録は TROUBLESHOOTING.md / runbook へ。
- **タイトルが検索面**: 索引テーブルの検索は主にタイトルに対して行われる。タイトル単独で「主張 + 条件」が伝わる 1 文にする。

---

## Helpful / Harmful カウンター運用

### カウンター更新タイミング

| タイミング                                     | 更新内容            |
| ---------------------------------------------- | ------------------- |
| ACE サイクルで既存エントリと重複する知見を発見 | Helpful +1          |
| 既存エントリの知見に従って問題を回避できた     | Helpful +1          |
| 既存エントリの知見に従ったが問題が発生した     | Harmful +1          |
| 既存エントリの内容が古くなっていると判明       | 検討の上 deprecated |

### エントリ品質の目安

| カウンター状態                           | 解釈                                       |
| ---------------------------------------- | ------------------------------------------ |
| `Helpful >= 5`                           | 高品質エントリ。[PATTERNS.md](../03-implementation/PATTERNS.md) の「実証済みパターン（ACE 昇格）」節への蒸留昇格を検討（`/ace-refine` が実施。元エントリは active のまま残す） |
| `Helpful >= 3, Harmful == 0`             | 良質なエントリ                             |
| `Harmful >= 3, Helpful < Harmful`        | deprecated 候補                            |
| `Helpful == 0, Harmful == 0`（90日以上） | 有効性未検証。次回関連タスクで意識的に検証 |

---

## ファイル分割ルール

Playbook が導出上限（`ヘッダ行数 + 件数 × 16`）を超え、正準化・`/ace-refine` でも再超過が常態化する場合は、以下のように分割する：

```
08-knowledge/
├── PLAYBOOK.md           ← 索引 + 運用ルール
└── playbook/               ← 例。プロジェクトが実際に使うカテゴリだけ作る（増えたら追加）
    ├── coding.md            ← カテゴリ名はプロジェクトが実際に使うものだけ作る
    ├── testing.md
    └── archive/             ← /ace-refine が退避した原文（集計・ゲート対象外）
        └── <category>.md
```

分割時の手順：

1. カテゴリ別にエントリをサブファイルに移動
2. PLAYBOOK.md に索引テーブルを残す（エントリID + タイトル + 参照先）
3. 以降の新規追記は該当カテゴリのサブファイルに行う
4. Frontmatter の `ace_entry_count` は live エントリ（`playbook/` 直下）の合計を維持する。`playbook/archive/` 配下は数えない（集計スクリプトは `playbook/` 直下の `*.md` のみを非再帰で走査するため、archive は自動的に対象外になる）

### 新規カテゴリファイルのテンプレート

既存の `playbook/<category>.md` が無いカテゴリで初めてエントリを追記する場合、以下の内容で新規作成する：

```markdown
# PLAYBOOK — <カテゴリの日本語ラベル> (<category>)

> **Parent**: [PLAYBOOK.md](../PLAYBOOK.md) — 運用ルール・エントリテンプレート・ID規則・記述ガイドラインは親ファイルの SSOT を参照。
>
> 新規エントリは本ファイル末尾に追記し、[PLAYBOOK.md の索引テーブル](../PLAYBOOK.md#エントリ一覧)にも 1 行追加する。

---

## エントリ一覧

<a id="ace-XXX"></a>

### ACE-XXX: [タイトル]

...（以降は上記「エントリテンプレート」節と同じ）
```

作成後は本節冒頭の分割済みファイル一覧（ツリー図）にも追加し、[カテゴリ一覧](#カテゴリ一覧) 表に説明行が無ければ追記する。

### 件数ゲート超過時の判断

`check-category-size` がカテゴリ件数で止めた（または refine 目安の警告を出した）ときの手順:

1. `/ace-refine` の stale アーカイブ・近似重複統合を先に尽くす
2. 残件を候補軸で分類し、**読者の次アクションが軸ごとに分かれるか**を見る
3. 分かれる → Category 値ごとサブカテゴリ分割する（ファイルだけ分けてもゲートは合算する）
4. 分かれない → 分割せず、ブロック上限までの余裕を使う。安易なカテゴリ再配分はしない

---

## エントリ一覧

エントリ本体は Category 別に `playbook/` 配下のファイルへ分割されています。
新規エントリは該当カテゴリの `playbook/<category>.md` 末尾に追記し、下記索引テーブルにも 1 行追加してください。
エントリの記述テンプレートは [エントリテンプレート](#エントリテンプレート) を参照。

**索引行はタイトルのみ**とし、説明文・補足プロースを書かない（索引は検索面そのものであり、肥大させると全エントリの検索精度が下がる）。

| エントリID | タイトル                                                                                                                                                                    | Category              | 参照先                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| ACE-2-1 | テンプレート文書で危険なのは空のプレースホルダーではなく、確定事項と矛盾する「もっともらしい汎用記述」 | documentation-quality | [playbook/documentation-quality.md#ace-2-1](./playbook/documentation-quality.md#ace-2-1) |
| ACE-2-2 | 「未適用テンプレート」の警告は索引ではなく各ファイル本体に置く — 索引を通らない到達経路があるため | documentation-quality | [playbook/documentation-quality.md#ace-2-2](./playbook/documentation-quality.md#ace-2-2) |
| ACE-2-3 | `Closes #N` は develop 向け PR では発火しない — Git Flow では Issue クローズを手動前提で設計する | process | [playbook/process.md#ace-2-3](./playbook/process.md#ace-2-3) |
| ACE-4-1 | 配置済みファイルを「必要時にコピー」と案内し続ける索引は、次の実行で自分の修正を消す経路になる | knowledge-management | [playbook/knowledge-management.md#ace-4-1](./playbook/knowledge-management.md#ace-4-1) |
| ACE-4-2 | ベンダリングしたテンプレートをローカル修正したら、上流との差分を文書内に列挙する | documentation-quality | [playbook/documentation-quality.md#ace-4-2](./playbook/documentation-quality.md#ace-4-2) |
| ACE-6-1 | 入口ドキュメントに「すべての〜は〜を持つ」型の全称命題を書かない — 例外1件で嘘になる | documentation-quality | [playbook/documentation-quality.md#ace-6-1](./playbook/documentation-quality.md#ace-6-1) |
| ACE-6-2 | 文書へリンクするときは、リンク先が自分で持っている留保も一緒に運ぶ | documentation-quality | [playbook/documentation-quality.md#ace-6-2](./playbook/documentation-quality.md#ace-6-2) |
| ACE-8-1 | 規約を書いた PR は、その規約を最初に破る — 規約追加とセルフチェックを同じコミットに入れる | documentation-quality | [playbook/documentation-quality.md#ace-8-1](./playbook/documentation-quality.md#ace-8-1) |
| ACE-8-2 | チーム外の人が入る瞬間、個人設定に置いたルールは「緩い」のではなく「存在しない」 | knowledge-management | [playbook/knowledge-management.md#ace-8-2](./playbook/knowledge-management.md#ace-8-2) |
| ACE-9-1 | 「実装済み」というドキュメントの記述は、実物を開くまで信じない | process | [playbook/process.md#ace-9-1](./playbook/process.md#ace-9-1) |
| ACE-9-2 | ランタイムの同一性は、実行中のランタイム自身に答えさせて確認する | testing | [playbook/testing.md#ace-9-2](./playbook/testing.md#ace-9-2) |
| ACE-9-3 | ローカルに入れたスキル・リファレンスの「推奨 API」も陳腐化する — 公式ドキュメントで裏取りする | tooling | [playbook/tooling.md#ace-9-3](./playbook/tooling.md#ace-9-3) |
| ACE-18-1 | 「デフォルトブランチは main」を確認せずに前提にしない — closing keyword の挙動はそこで決まる | process | [playbook/process.md#ace-18-1](./playbook/process.md#ace-18-1) |
| ACE-19-1 | 同じ規定を文書内の2箇所に書くと、片方だけ読んだ読み手が「明記なし」と誤認する — 一元化するか「§Xと同一」と参照で書く | documentation-quality | [playbook/documentation-quality.md#ace-19-1](./playbook/documentation-quality.md#ace-19-1) |
| ACE-20-1 | リポジトリ外で受け取った仕様関連文書は、確認・更新した時点でリポジトリ取り込みまでを完了条件にする | process | [playbook/process.md#ace-20-1](./playbook/process.md#ace-20-1) |
| ACE-21-1 | ADR を承認したら、その旧前提で書かれた既存文書を grep で洗い出して同時に追随させる | documentation-quality | [playbook/documentation-quality.md#ace-21-1](./playbook/documentation-quality.md#ace-21-1) |
| ACE-23-1 | 外部カタログのメタデータは自己申告 — 採否は「実体を取得できるか」で決める | tooling | [playbook/tooling.md#ace-23-1](./playbook/tooling.md#ace-23-1) |
| ACE-23-2 | ステータスコードを根拠にする前に、対照群でそのコードの意味を確かめる | testing | [playbook/testing.md#ace-23-2](./playbook/testing.md#ace-23-2) |
| ACE-25-1 | 外部データの写像は列名ではなく「値の集合」を見てから書く | data-processing | [playbook/data-processing.md#ace-25-1](./playbook/data-processing.md#ace-25-1) |
| ACE-25-2 | 新しいディレクトリは references に入れるまで `tsc -b` の検査を素通りする | data-processing | [playbook/data-processing.md#ace-25-2](./playbook/data-processing.md#ace-25-2) |
| ACE-28-1 | 出典を強制する設計では、フォールバックの既定値が最大の欠陥になる | architecture | [playbook/architecture.md#ace-28-1](./playbook/architecture.md#ace-28-1) |
| ACE-28-2 | 自分で書いたテストは「発火しない条件」を無意識に選ぶ — 直したら戻して落ちることを確かめる | testing | [playbook/testing.md#ace-28-2](./playbook/testing.md#ace-28-2) |
| ACE-28-3 | 日本語の部分一致は語の境界を見ない — 語彙リストは誤爆の除外とセットで書く | data-processing | [playbook/data-processing.md#ace-28-3](./playbook/data-processing.md#ace-28-3) |
| ACE-28-4 | `tsc` の include が要るのは「どこからも import されていないファイル」— import 済みなら検査される | data-processing | [playbook/data-processing.md#ace-28-4](./playbook/data-processing.md#ace-28-4) |
| ACE-28-5 | 同期のスタブを Hono に載せるときは、戻り値の型と `await` で「後から async にする」に備える | tooling | [playbook/tooling.md#ace-28-5](./playbook/tooling.md#ace-28-5) |
| ACE-34-1 | デバッグ用の画面は「検証しないこと」が仕様 — 通常のフォームの作法を持ち込まない | tooling | [playbook/tooling.md#ace-34-1](./playbook/tooling.md#ace-34-1) |
| ACE-34-2 | レビューツールの規約指摘は、そのリポジトリの実績と照合してから採否を決める | process | [playbook/process.md#ace-34-2](./playbook/process.md#ace-34-2) |
| ACE-37-1 | 名称からエリアを引くとき、括弧書きは「その地物の所在地」ではない | data-processing | [playbook/data-processing.md#ace-37-1](./playbook/data-processing.md#ace-37-1) |
| ACE-38-1 | 「A / B / C ほか」で終わる規則は取りこぼす — 判定可能な条件に書き換える | documentation-quality | [playbook/documentation-quality.md#ace-38-1](./playbook/documentation-quality.md#ace-38-1) |
| ACE-39-1 | 「他が当たらなかったときだけ発火する判定」を「当たっても報告する」に変えると、誤検知の性質が変わる | architecture | [playbook/architecture.md#ace-39-1](./playbook/architecture.md#ace-39-1) |
| ACE-39-2 | `git stash` を使った「戻して落ちるか」検証は HEAD 基準 — ベース基準で見たいなら checkout する | testing | [playbook/testing.md#ace-39-2](./playbook/testing.md#ace-39-2) |
| ACE-40-1 | 書き込みの副作用は「読み戻すテスト」と「無効化して落ちるか」の二段で確かめる | testing | [playbook/testing.md#ace-40-1](./playbook/testing.md#ace-40-1) |
| ACE-44-1 | 「本番から落ちる」前提を持つモジュールは、置き場所そのものが契約になっている | architecture | [playbook/architecture.md#ace-44-1](./playbook/architecture.md#ace-44-1) |
| ACE-51-1 | ガードは「見ているフィールド」と「置かれた分岐」の両方で到達性を確かめる | architecture | [playbook/architecture.md#ace-51-1](./playbook/architecture.md#ace-51-1) |
| ACE-51-2 | 「すべての経路で同じ」型の不変条件を破るときは、コードのコメントと設計文書を同時に grep する | documentation-quality | [playbook/documentation-quality.md#ace-51-2](./playbook/documentation-quality.md#ace-51-2) |
| ACE-51-3 | 欠損・未回答の message には、実測で確かめたことだけを書く | architecture | [playbook/architecture.md#ace-51-3](./playbook/architecture.md#ace-51-3) |
| ACE-51-4 | 公開 API 経由で内部関数の境界を測るテストは、入力がその関数に到達しているか確かめる | testing | [playbook/testing.md#ace-51-4](./playbook/testing.md#ace-51-4) |
| ACE-51-5 | 自分が読まない設定ファイルの同期漏れは、それを読むモデルが見つける | process | [playbook/process.md#ace-51-5](./playbook/process.md#ace-51-5) |
| ACE-57-1 | 「訊かれたのに答えていない」は、入力で拾い落としたものではなく出力が覆っていないもので判定する | architecture | [playbook/architecture.md#ace-57-1](./playbook/architecture.md#ace-57-1) |
| ACE-57-2 | 「応答から記録を導出する」設計に行ごとの差分が要るなら、応答側に構造化して持たせる | architecture | [playbook/architecture.md#ace-57-2](./playbook/architecture.md#ace-57-2) |
| ACE-57-3 | 同じ文型の入力でも、対象範囲の内か外かで過検知の倒し方は逆になる | architecture | [playbook/architecture.md#ace-57-3](./playbook/architecture.md#ace-57-3) |
| ACE-57-4 | 対処案が併記された Issue では、案の魅力ではなく受け入れ条件が案を選ぶ | process | [playbook/process.md#ace-57-4](./playbook/process.md#ace-57-4) |
| ACE-57-5 | レビューが挙げた反例は、真偽値ではなく応答全文を出して読む | process | [playbook/process.md#ace-57-5](./playbook/process.md#ace-57-5) |
| ACE-62-1 | 応答の共通の書き出しも主張を運ぶ — 分岐で真偽が変わるなら使い分けて契約に書く | architecture | [playbook/architecture.md#ace-62-1](./playbook/architecture.md#ace-62-1) |
| ACE-62-2 | 文言の嘘を直す判断をしたら、同じ言い回しを grep して姉妹分岐へ同時適用する | process | [playbook/process.md#ace-62-2](./playbook/process.md#ace-62-2) |
| ACE-62-3 | 文言契約のテストは完全一致で固定し、到達性は副作用で確かめる | testing | [playbook/testing.md#ace-62-3](./playbook/testing.md#ace-62-3) |
| ACE-64-1 | 名称に構造があるなら、照合は包含ではなく構造に合わせて狭める | data-processing | [playbook/data-processing.md#ace-64-1](./playbook/data-processing.md#ace-64-1) |
| ACE-64-2 | 参照側に設定を再掲しない — 定義側のフラグ＋前提が崩れたら生成を止める | architecture | [playbook/architecture.md#ace-64-2](./playbook/architecture.md#ace-64-2) |
| ACE-64-3 | 文書が断定した実測値は、その実測を再現するテストで固定する | documentation-quality | [playbook/documentation-quality.md#ace-64-3](./playbook/documentation-quality.md#ace-64-3) |
| ACE-66-1 | 埋められない看板機能は、欠損の記録頻度を還元の根拠に変える（エスカレーション） | architecture | [playbook/architecture.md#ace-66-1](./playbook/architecture.md#ace-66-1) |
| ACE-66-2 | 調査済みの断定は、調査の範囲・粒度に文言を一致させる | documentation-quality | [playbook/documentation-quality.md#ace-66-2](./playbook/documentation-quality.md#ace-66-2) |
| ACE-69-1 | 呼び出し側が構造で持つ情報は、畳み込む前に受ける — 推測での復元はフォールバック | architecture | [playbook/architecture.md#ace-69-1](./playbook/architecture.md#ace-69-1) |
| ACE-69-2 | 部分一致の haystack に絞り込みキーを混ぜない — 「新宿」は「宿」に当たる | data-processing | [playbook/data-processing.md#ace-69-2](./playbook/data-processing.md#ace-69-2) |
| ACE-69-3 | 既知欠損との重複排除は、語のクラスではなく「報告された1件」との対応で畳む | architecture | [playbook/architecture.md#ace-69-3](./playbook/architecture.md#ace-69-3) |
| ACE-69-4 | 頻度が根拠になる記録は、1リクエスト内の入力重複を正規化してから積む | data-processing | [playbook/data-processing.md#ace-69-4](./playbook/data-processing.md#ace-69-4) |
| ACE-73-1 | 理由を1つしか運べない応答には、理由が覆っていない欠損を optional の gaps で併走させる | architecture | [playbook/architecture.md#ace-73-1](./playbook/architecture.md#ace-73-1) |
| ACE-73-2 | message が前提にする文脈が消える場所では、その文言を使わない（載せない判断も設計） | architecture | [playbook/architecture.md#ace-73-2](./playbook/architecture.md#ace-73-2) |
| ACE-73-3 | 生成系コマンドの失敗フォールバックに、劣化したプレースホルダを渡さない | process | [playbook/process.md#ace-73-3](./playbook/process.md#ace-73-3) |
| ACE-74-1 | 「移動のみ」リファクタは、旧版との行単位照合で機械的に証明する | process | [playbook/process.md#ace-74-1](./playbook/process.md#ace-74-1) |
| ACE-49-1 | 「push した」という申告は、PR の更新時刻ではなく remote の ref で確かめる | process | [playbook/process.md#ace-49-1](./playbook/process.md#ace-49-1) |
| ACE-49-2 | 統合ブランチから大きく遅れたブランチは、差分読解ではなく試験マージして検証する | process | [playbook/process.md#ace-49-2](./playbook/process.md#ace-49-2) |
| ACE-49-3 | 二重管理文書の同期照合は、その PR が触った領域ではなく文書全体で行う | documentation-quality | [playbook/documentation-quality.md#ace-49-3](./playbook/documentation-quality.md#ace-49-3) |
| ACE-49-4 | 文書の版番号はマージでは解決されない — 長命ブランチでは採番そのものが衝突する | documentation-quality | [playbook/documentation-quality.md#ace-49-4](./playbook/documentation-quality.md#ace-49-4) |
| ACE-49-5 | 「〜を描画しない」型の否定アサーションは、本番データの実物を確認してから書く | testing | [playbook/testing.md#ace-49-5](./playbook/testing.md#ace-49-5) |
| ACE-79-1 | 非網羅の語彙表による否定判定を「無い」と書かない — 書けるのは「見つからなかった」まで | documentation-quality | [playbook/documentation-quality.md#ace-79-1](./playbook/documentation-quality.md#ace-79-1) |
| ACE-79-2 | 全経路に共通する不変条件の注記は、経路ごとに書かず生成関数へ一元化する | architecture | [playbook/architecture.md#ace-79-2](./playbook/architecture.md#ace-79-2) |

## Changelog

### [1.24.0] - 2026-08-18

#### 追加

- ACE-79-1: 非網羅の語彙表による否定判定を「無い」と書かない — 書けるのは「見つからなかった」まで（Issue #78 / PR #79）
- ACE-79-2: 全経路に共通する不変条件の注記は、経路ごとに書かず生成関数へ一元化する（Issue #78 / PR #79）

### [1.23.0] - 2026-08-18

#### 追加

- ACE-49-1: 「push した」という申告は、PR の更新時刻ではなく remote の ref で確かめる（PR #49）
- ACE-49-2: 統合ブランチから大きく遅れたブランチは、差分読解ではなく試験マージして検証する（PR #49）
- ACE-49-3: 二重管理文書の同期照合は、その PR が触った領域ではなく文書全体で行う（PR #49）
- ACE-49-4: 文書の版番号はマージでは解決されない — 長命ブランチでは採番そのものが衝突する（PR #49）
- ACE-49-5: 「〜を描画しない」型の否定アサーションは、本番データの実物を確認してから書く（PR #49 / Issue #54）

#### カウンター更新

- ACE-51-5: Helpful +1（この規則があったため AGENTS.md の同期漏れを探しにいけた。ただし照合範囲が狭く、より古い3行は ACE-49-3 で拾い直した）

### [1.22.0] - 2026-08-18

#### 追加

- ACE-73-1: 理由を1つしか運べない応答には、理由が覆っていない欠損を optional の gaps で併走させる（Issue #70 / PR #73）
- ACE-73-2: message が前提にする文脈が消える場所では、その文言を使わない（載せない判断も設計）（Issue #70 / PR #73）
- ACE-73-3: 生成系コマンドの失敗フォールバックに、劣化したプレースホルダを渡さない（PR #73）
- ACE-74-1: 「移動のみ」リファクタは、旧版との行単位照合で機械的に証明する（Issue #71 / PR #74）

### [1.21.0] - 2026-08-18

#### 追加

- ACE-69-1: 呼び出し側が構造で持つ情報は、畳み込む前に受ける — 推測での復元はフォールバック（Issue #53 #58 / PR #69 / ADR-011）
- ACE-69-2: 部分一致の haystack に絞り込みキーを混ぜない — 「新宿」は「宿」に当たる（PR #69）
- ACE-69-3: 既知欠損との重複排除は、語のクラスではなく「報告された1件」との対応で畳む（PR #69）
- ACE-69-4: 頻度が根拠になる記録は、1リクエスト内の入力重複を正規化してから積む（PR #69）

### [1.20.0] - 2026-08-18

#### 追加

- ACE-66-1: 埋められない看板機能は、欠損の記録頻度を還元の根拠に変える — エスカレーション（Issue #43 / PR #66 / ADR-010）
- ACE-66-2: 調査済みの断定は、調査の範囲・粒度に文言を一致させる（Issue #43 / PR #66）

#### カウンター更新

- ACE-51-3: Helpful +1（`data_not_published` の文言を調査範囲へ絞る判断の下敷き）
- ACE-62-3: Helpful +1（マナー欠損の message を完全一致の文言契約テストで固定）

### [1.19.0] - 2026-08-18

#### 追加

- ACE-64-1: 名称に構造があるなら、照合は包含ではなく構造に合わせて狭める（Issue #36 / PR #64）
- ACE-64-2: 参照側に設定を再掲しない — 定義側のフラグ＋前提が崩れたら生成を止める（Issue #36 / PR #64）
- ACE-64-3: 文書が断定した実測値は、その実測を再現するテストで固定する（Issue #36 / PR #64）

#### カウンター更新

- ACE-37-1: Helpful +1（継承の照合でも括弧内の路線名を先に落とす同じ判断を再利用し、テストで固定した）

### [1.18.0] - 2026-08-18

#### 追加

- ACE-62-1: 応答の共通の書き出しも主張を運ぶ — 分岐で真偽が変わるなら使い分けて契約に書く（Issue #59 / PR #62）
- ACE-62-2: 文言の嘘を直す判断をしたら、同じ言い回しを grep して姉妹分岐へ同時適用する（Issue #59 / PR #62。取り残しは2回起きた）
- ACE-62-3: 文言契約のテストは完全一致で固定し、到達性は副作用で確かめる（Issue #59 / PR #62）

#### カウンター更新

- ACE-51-1: Helpful +1（レビューが末尾フォールバックの到達性を数え上げて Warning を確定した根拠）
- ACE-51-3: Helpful +1（分類ガード・末尾フォールバックの文言を「実際に照合した集合の記述」へ直す判断の下敷き）
- ACE-51-4: Helpful +1（否定アサートの判別力が他分岐の文言に依存していた指摘の根拠）

### [1.17.0] - 2026-08-18

#### 追加

- ACE-57-1: 「訊かれたのに答えていない」は、入力で拾い落としたものではなく出力が覆っていないもので判定する（Issue #52 / PR #57）
- ACE-57-2: 「応答から記録を導出する」設計に行ごとの差分が要るなら、応答側に構造化して持たせる（Issue #52 / PR #57）
- ACE-57-3: 同じ文型の入力でも、対象範囲の内か外かで過検知の倒し方は逆になる（Issue #52 / PR #57。別 Issue #58 に分離）
- ACE-57-4: 対処案が併記された Issue では、案の魅力ではなく受け入れ条件が案を選ぶ（Issue #52 / PR #57）
- ACE-57-5: レビューが挙げた反例は、真偽値ではなく応答全文を出して読む（Issue #52 / PR #57。別 Issue #59 の発見経路）

#### カウンター更新

- ACE-39-1: Helpful +1（判定を広げると誤検知の性質が変わる件。代表エリアの過検知をどちらへ倒すかの下敷きにした）
- ACE-51-2: Helpful +1（「この経路の gaps は必ず1件」を撤回する際、コードのコメントと API.md を同時に grep して直した）
- ACE-51-3: Helpful +1（取り落ちの message で「該当するオープンデータがありません」を使わない判断に再利用）

### [1.16.0] - 2026-08-18

#### 追加

- ACE-51-1: ガードは「見ているフィールド」と「置かれた分岐」の両方で到達性を確かめる（Issue #50 / PR #51）
- ACE-51-2: 「すべての経路で同じ」型の不変条件を破るときは、コードのコメントと設計文書を同時に grep する（Issue #50 / PR #51）
- ACE-51-3: 欠損・未回答の message には、実測で確かめたことだけを書く（Issue #50 / PR #51）
- ACE-51-4: 公開 API 経由で内部関数の境界を測るテストは、入力がその関数に到達しているか確かめる（Issue #50 / PR #51）
- ACE-51-5: 自分が読まない設定ファイルの同期漏れは、それを読むモデルが見つける（Issue #50 / PR #51。PR #49 のレビュー中に判明）

#### カウンター更新

- ACE-28-1: Helpful +1（出典つきフォールバックが誤答の説得力を上げる、を `search_datasets` 側でも踏んだ）
- ACE-28-2: Helpful +1（修正を戻して新規テストが落ちることを確認する手順を実行した）
- ACE-28-3: Helpful +1（銭湯のキーワード「夜」が「夜遊び」に部分一致してガードを無効化していた）
- ACE-39-1: Helpful +1（判定を広げると過検知の性質が変わる、を区切り記号の網羅で踏んだ）


### [1.15.0] - 2026-08-17

#### 追加

- ACE-37-1: 名称からエリアを引くとき、括弧書きは「その地物の所在地」ではない（PR #37 / Issue #30）
- ACE-38-1: 「A / B / C ほか」で終わる規則は取りこぼす — 判定可能な条件に書き換える（PR #38）
- ACE-39-1: 「他が当たらなかったときだけ発火する判定」を「当たっても報告する」に変えると、誤検知の性質が変わる（PR #39 / Issue #29）
- ACE-39-2: `git stash` を使った「戻して落ちるか」検証は HEAD 基準 — ベース基準で見たいなら checkout する（PR #39 / Issue #29）
- ACE-40-1: 書き込みの副作用は「読み戻すテスト」と「無効化して落ちるか」の二段で確かめる（PR #40 / Issue #27）
- ACE-44-1: 「本番から落ちる」前提を持つモジュールは、置き場所そのものが契約になっている（PR #44 / Issue #31）

### [1.14.0] - 2026-08-17

#### 追加

- ACE-34-1: デバッグ用の画面は「検証しないこと」が仕様 — 通常のフォームの作法を持ち込まない（Issue #33 / PR #34）
- ACE-34-2: レビューツールの規約指摘は、そのリポジトリの実績と照合してから採否を決める（Issue #33 / PR #34）

#### カウンター更新

- ACE-21-1: Helpful +1（README の API ガイド追加時に、ADR-008 以前の旧前提（MCP 直結の図・未作成ディレクトリの記述）を洗い出して同時追随した。PR #35）


### [1.13.0] - 2026-08-17

#### 追加

- ACE-28-1: 出典を強制する設計では、フォールバックの既定値が最大の欠陥になる（Issue #22 / PR #28）
- ACE-28-2: 自分で書いたテストは「発火しない条件」を無意識に選ぶ — 直したら戻して落ちることを確かめる（Issue #22 / PR #28）
- ACE-28-3: 日本語の部分一致は語の境界を見ない — 語彙リストは誤爆の除外とセットで書く（Issue #22 / PR #28）
- ACE-28-4: `tsc` の include が要るのは「どこからも import されていないファイル」— import 済みなら検査される（Issue #22 / PR #28）
- ACE-28-5: 同期のスタブを Hono に載せるときは、戻り値の型と `await` で「後から async にする」に備える（Issue #22 / PR #28）
- カテゴリ `architecture` を新設（`playbook/architecture.md`）

#### カウンター更新

- ACE-19-1: Helpful +1（確定した規定が API_REQUIREMENTS.md の2箇所で食い違っていたのを、grep で洗って同時に追随させた）
- ACE-23-2: Helpful +1（tsconfig の include の効果を、入れた場合だけでなく外した場合も測って因果を特定した）
- ACE-25-2: Helpful +1（`shared/` 追加時にわざと型エラーを入れて検査が効くことを確認。その過程で ACE-28-4 の精緻化に至った）


### [1.12.0] - 2026-08-16

#### 追加

- ACE-25-1: 外部データの写像は列名ではなく「値の集合」を見てから書く（Issue #24 / PR #25）
- ACE-25-2: 新しいディレクトリは references に入れるまで `tsc -b` の検査を素通りする（Issue #24 / PR #25）
- カテゴリ `data-processing` を新設（`playbook/data-processing.md`）


### [1.11.0] - 2026-08-16

#### 追加

- ACE-23-1: 外部カタログのメタデータは自己申告 — 採否は「実体を取得できるか」で決める（Issue #10 / PR #23）
- ACE-23-2: ステータスコードを根拠にする前に、対照群でそのコードの意味を確かめる（Issue #10 / PR #23）

#### カウンター更新

- ACE-9-1: Helpful +1（「format=CSV」というメタデータ記述を実体取得まで信じない、という同型の教訓が再現した）


### [1.10.0] - 2026-08-16

#### 追加

- ACE-21-1: ADR 承認時に旧前提の既存文書を grep で洗い出して同時追随させる（PR #21）

#### カウンター更新

- ACE-19-1: Helpful +1（MCP.md 新設時にスキーマを API.md への参照で運び、二重定義による食い違いを設計段階で回避した）

### [1.9.0] - 2026-08-16

#### 追加

- ACE-20-1: リポジトリ外で受け取った仕様関連文書はリポジトリ取り込みまでを完了条件にする（PR #20）

### [1.8.0] - 2026-08-16

#### 追加

- ACE-19-1: 同じ規定を文書内の2箇所に書くと片方だけ読んだ読み手が「明記なし」と誤認する（PR #19）

### [1.7.0] - 2026-08-16

#### 追加

- ACE-18-1: 「デフォルトブランチは main」を確認せずに前提にしない（PR #18）

#### カウンター更新

- ACE-9-1: Helpful +1（文書間の引き写しで誤りが増殖するパターンを、デフォルトブランチの誤記5箇所として再確認した）
- ACE-2-3: Status を `deprecated` に変更（前提が本リポジトリに当てはまらないことが判明。ACE-18-1 が置き換える）

### [1.6.0] - 2026-08-15

#### 追加

- ACE-9-1: 「実装済み」の記述は実物を開くまで信じない（PR #9）
- ACE-9-2: ランタイムの同一性は実行中のランタイム自身に答えさせる（PR #9）
- ACE-9-3: ローカルスキルの推奨 API も陳腐化する（PR #9）

### [1.5.0] - 2026-08-15

#### 追加

- ACE-8-1: 規約を書いた PR はその規約を最初に破る（Issue #7 / PR #8）
- ACE-8-2: 個人設定のルールは外部メンバーには存在しないのと同じ（Issue #7 / PR #8）

### [1.4.0] - 2026-08-15

#### 変更

- 冒頭に「本リポジトリでの ACE 実行は任意（メンテナ環境では必須）」を明記（ADR-006）

### [1.3.0] - 2026-08-15

#### 追加

- ACE-6-1: 入口ドキュメントに全称命題を書かない（Issue #5 / PR #6）
- ACE-6-2: リンクするときはリンク先の留保も一緒に運ぶ（Issue #5 / PR #6）

### [1.2.0] - 2026-08-15

#### 追加

- ACE-4-1: 配置済みファイルを「コピーせよ」と案内し続ける索引は上書き経路になる（Issue #3 / PR #4）
- ACE-4-2: ベンダリングしたテンプレートの上流との差分を文書内に列挙する（Issue #3 / PR #4）

### [1.1.0] - 2026-08-15

#### 追加

- ACE-2-1: テンプレート文書の「もっともらしい汎用記述」が確定事項と矛盾する（Issue #1 / PR #2）
- ACE-2-2: 未適用テンプレートの警告は索引ではなく本体に置く（Issue #1 / PR #2）
- ACE-2-3: `Closes #N` は develop 向け PR では発火しない（Issue #1 / PR #2）

### [1.0.0] - 2026-08-15

#### 追加

- `/ace-setup` により初版を配置（エントリ 0 件）
