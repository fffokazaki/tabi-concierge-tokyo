# PLAYBOOK — ツール・開発環境 (tooling)

> **Parent**: [PLAYBOOK.md](../PLAYBOOK.md) — 運用ルール・エントリテンプレート・ID規則・記述ガイドラインは親ファイルの SSOT を参照。
>
> 新規エントリは本ファイル末尾に追記し、[PLAYBOOK.md の索引テーブル](../PLAYBOOK.md#エントリ一覧)にも 1 行追加する。

---

## エントリ一覧

<a id="ace-9-3"></a>

### ACE-9-3: ローカルに入れたスキル・リファレンスの「推奨 API」も陳腐化する — 公式ドキュメントで裏取りする

| Category | tooling | Origin | PR #9 |
| Date | 2026-08-15 |
| Helpful | 0 | Harmful | 0 |
| Status | active |

インストール済みの Cloudflare スキルが推奨していた MCP 実装 API（`McpAgent`）は、公式ドキュメントでは既に deprecated / feature-frozen とされ、推奨は別 API（`createMcpHandler`）に変わっていた。従っていれば不要な Durable Objects 依存を抱え込むところだった。スキル自身も冒頭で「訓練データより retrieval を優先せよ／リファレンスと docs が食い違ったら docs を信じよ」と書いている。**採用を決める API については、着手前に公式ドキュメントを1枚引く**。

---
