# PLAYBOOK — 開発プロセス (process)

> **Parent**: [PLAYBOOK.md](../PLAYBOOK.md) — 運用ルール・エントリテンプレート・ID規則・記述ガイドラインは親ファイルの SSOT を参照。
>
> 新規エントリは本ファイル末尾に追記し、[PLAYBOOK.md の索引テーブル](../PLAYBOOK.md#エントリ一覧)にも 1 行追加する。

---

## エントリ一覧

<a id="ace-2-3"></a>

### ACE-2-3: `Closes #N` は develop 向け PR では発火しない — Git Flow では Issue クローズを手動前提で設計する

| Category | process | Origin | PR #2 |
| Date | 2026-08-15 |
| Helpful | 0 | Harmful | 0 |
| Status | deprecated |

GitHub の closing keyword はデフォルトブランチへのマージでのみ発動するため、base が `develop` の PR では `Closes #N` を書いても Issue は閉じず、`closingIssuesReferences` も空を返す（`/close-issue` の Issue 自動検出もこれに依存するため空振りする）。Git Flow を採るリポジトリでは毎回起きる。AC 照合はマージ前に済ませ、クローズはマージ直後の手動実行か `main` 昇格時に回す前提で運用する。

---
<a id="ace-9-1"></a>

### ACE-9-1: 「実装済み」というドキュメントの記述は、実物を開くまで信じない

| Category | process | Origin | PR #9 |
| Date | 2026-08-15 |
| Helpful | 0 | Harmful | 0 |
| Status | active |

企画資料と docs 5箇所以上が「UI は実装済み・動作確認済み」と断定していたが、実物は API 呼び出しを組み込めない別 runtime のデザインプロトタイプで、React コードベースは存在しなかった。着手見積もりが根本から変わる種類の誤りであり、**文書間で何度も繰り返されているほど検証されていない可能性がある**（引き写しで増殖するため）。既存資産に依存する計画を立てるときは、資産のファイル一覧を実際に開いて確認してから見積もる。

---
