# PLAYBOOK — 知見・Playbook 運用 (knowledge-management)

> **Parent**: [PLAYBOOK.md](../PLAYBOOK.md) — 運用ルール・エントリテンプレート・ID規則・記述ガイドラインは親ファイルの SSOT を参照。
>
> 新規エントリは本ファイル末尾に追記し、[PLAYBOOK.md の索引テーブル](../PLAYBOOK.md#エントリ一覧)にも 1 行追加する。

---

## エントリ一覧

<a id="ace-4-1"></a>

### ACE-4-1: 配置済みファイルを「必要時にコピー」と案内し続ける索引は、次の実行で自分の修正を消す経路になる

| Category | knowledge-management | Origin | PR #4 |
| Date | 2026-08-15 |
| Helpful | 0 | Harmful | 0 |
| Status | active |

テンプレート集からファイルを配置したとき、それを列挙している索引（DEPLOYMENT.md 等）が「未導入なのでコピーせよ」と案内したままだと、後続のセッションがその指示に従って原文を上書きし、配置時に加えた修正が黙って消える。配置と索引更新は必ず同じ PR で行い、索引側に「配置済み・コピー不要」を明示する。テンプレート由来ファイルを追加したら、そのファイルを指す索引を全て grep して状態を揃えること。

---
