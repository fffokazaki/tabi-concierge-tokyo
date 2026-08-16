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

<a id="ace-23-1"></a>

### ACE-23-1: 外部カタログのメタデータは自己申告 — 採否は「実体を取得できるか」で決める

| Category | tooling | Origin | PR #23 |
| Date | 2026-08-16 |
| Helpful | 0 | Harmful | 0 |
| Status | active |

東京都オープンデータカタログから利用データ10件を選定する際、CKAN API の `resources[].format` が `CSV` でも、リソースURLの実体が HTML ページのデータセットが**候補中5件**あった。さらに「観光ポイント」は名称に反して29件のみ・緯度経度が全件空欄で、地図表示にも旅程生成にも使えなかった。カタログの `format` とタイトルは登録者の自己申告であり、機械可読性も内容の充足も保証しない。API が `success: true` を返すことは「登録されている」証明にすぎず、「使える」証明ではない。**外部データソースの採否は、リソースURLを実際に取得し、先頭バイトで実体形式を判定し、必要な列（座標等）の充足率を数えてから決める**。名称と `format` だけで一覧表を埋めると、取り込み工程に入って初めて半数が使えないと判明する。関連: [ACE-9-1](./process.md#ace-9-1)（記述は実物を開くまで信じない）

---
