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
| Status | active |

GitHub の closing keyword はデフォルトブランチへのマージでのみ発動するため、base が `develop` の PR では `Closes #N` を書いても Issue は閉じず、`closingIssuesReferences` も空を返す（`/close-issue` の Issue 自動検出もこれに依存するため空振りする）。Git Flow を採るリポジトリでは毎回起きる。AC 照合はマージ前に済ませ、クローズはマージ直後の手動実行か `main` 昇格時に回す前提で運用する。

---
