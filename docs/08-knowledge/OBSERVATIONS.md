# 振り返り観測台帳（Retrospective Observations）

> **運用の正本**: ff-dev-toolkit プラグインの `skills/retrospective/SKILL.md` の「観測の記録 — 観測台帳（起票の前段バッファ）」。本ファイルは `/retrospective` が記録する Problem / Keep 観測の蓄積バッファであり、手順・閾値・承認境界はスキル側だけが定義する（ここへ複製しない）。
>
> - 記録・畳み込み（同一性の判定）・昇格閾値・特急レーン・archived の条件・コミット規約は、すべてスキル側の規定に従う。**数値や判定基準を本ファイルへ複製しない** — 契約ゲートが固定しているのはスキル側の規定と、下の `Status` 値域行（本体と配布テンプレの一致・所在の接頭辞）だけで、それ以外にここへ写した規則は古くなっても検出されない
> - Frontmatter は付与しない（機械管理の蓄積ファイルで、ACE Playbook の分割ファイルと同じ扱い。`docs/MASTER.md` §Frontmatter の例外注記を参照）
> - 台帳はリポジトリごとに持つ。このファイルが無い場合、`/retrospective` がプラグインの `docs-template/08-knowledge/OBSERVATIONS.md` から作成する

## エントリ形式

新規エントリは次の形式で「エントリ一覧」の末尾へ追記する（ID は `OBS-<3 桁連番>`。既存の最大連番 +1）:

```markdown
<a id="obs-XXX"></a>

### OBS-XXX: [検索可能な主張 1 文のタイトル]

| Kind | problem または keep | Count | 1 |
| First | YYYY-MM-DD | Last | YYYY-MM-DD |
| Status | active | Issue | なし |

[本文 1〜3 文。1 文目 = 主張。problem / keep の文形と Count の意味論はスキル側「記録手順」が正本 — ここへ複製しない]

- YYYY-MM-DD: [1 行の実測メモ]（初回）

---
```

- メタ 3 行は行頭のパイプ区切りで書く（ACE Playbook のコンパクト正準フォーマットと同じ機械可読性の担保）
- `Status` の値域: `active`（蓄積中）/ `promoted`（Issue 昇格済み。`Issue` にリポジトリ修飾の発行番号 `owner/repo#N` を書く）/ `mitigated`（対策済み。対策が別の場所に定義済みのため昇格を見送った。`Issue` に対策の所在を `owner/repo#N` / `skill:<スキル名>` / `doc:<path>#<アンカー>` の書式で書く。条件の正本はスキル側）/ `archived`（休眠。条件の正本はスキル側。再発したら `active` へ戻す）
- 観測メモは再発のたびに 1 行追記する（セッション固有の長い叙述は書かない — 詳細が必要になるのは昇格時で、その時点の Issue 本文に書けばよい）

## エントリ一覧

<a id="obs-001"></a>

### OBS-001: 同じ環境で 2 回目に出た CLI 除外の警告は、その場の引数ではなく恒久設定へ移す

| Kind | problem | Count | 1 |
| First | 2026-09-19 | Last | 2026-09-19 |
| Status | active | Issue | なし |

`/multi-review` の dry-run が grok-cli の sandbox 適用不可（docker.sock が symlink）を毎回警告するのに、3 回の実行すべてで `--exclude-cli grok-cli` を手で渡した。スキル本文は「同じ環境で 2 回目に同じ警告を見たら手動除外を繰り返さず `exclude_clis` へ移す」と明記しており、2 回目の時点で `.claude/agent-config.yaml` へ移すべきだった。渡し忘れた回にだけ壊れる形の運用を残さない。

- 2026-09-19: PR #234 のレビュー 3 ラウンドで同じ引数を 3 回手渡し（初回）

---

<a id="obs-002"></a>

### OBS-002: 出力整形フィルタで終わるパイプの直後で `$?` を読むと、ゲートの成否が測れない

| Kind | problem | Count | 1 |
| First | 2026-09-19 | Last | 2026-09-19 |
| Status | active | Issue | なし |

`cmd 2>&1 | tail -5; rc=$?` の形を書き、ff-dev-toolkit の exit-code ガードに 2 回ブロックされた（`docs:check-agents-sync` と `gh pr merge`）。読めるのは `tail` の終了コードで、測りたいコマンドの成否は運ばれない。検証コマンドは最初からログファイルへ受けて `rc=$?; exit $rc` で伝播させる形で書く。

- 2026-09-19: 同一セッションで 2 回ブロック。1 回目の指摘後に同じ形を再度書いた（初回）

---

<a id="obs-003"></a>

### OBS-003: 生成した図はコミット前にブラウザで実レンダリングする — ソースの目視では重なりが見えない

| Kind | keep | Count | 1 |
| First | 2026-09-19 | Last | 2026-09-19 |
| Status | active | Issue | なし |

README へ載せる SVG 2 点を、コミット前にブラウザで実際に描画して確認した。構文チェック（XML パース）は通っていたが、実描画で初めてラベルの重なりが 2 件見つかった（注釈がサブタイトルへかぶる / 縦書きラベルが破線に接触）。座標計算は目視では検算できないので、画像成果物は必ず描画して確認してからコミットする。

- 2026-09-19: PR #234 の SVG 2 点で重なり 2 件を検出・修正。1 件は利用者も独立に指摘（初回）

---
