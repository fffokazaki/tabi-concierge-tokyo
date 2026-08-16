# MCP.md - MCP設計書（基盤開放面 `/mcp`）

> 本書は単一 Worker の二面公開（[ADR-008](../06-reference/DECISIONS.md)）のうち、**AI クライアント向けの MCP（Model Context Protocol）面 `/mcp`** の設計書である。React アプリが呼ぶ `/api/*` は [API.md](./API.md) を参照。
>
> **ツールの入出力スキーマは本書に書かない。** `/mcp` の各ツールは `worker/core/` のコア操作をそのまま露出するため、スキーマの SSOT は [API.md](./API.md) §3、応答の共通仕様（出典必須・未回答分類）は同 §4 とする。二重定義は片方だけ読んだ読み手の誤認を生むため禁止（[ACE-19-1](../08-knowledge/playbook/documentation-quality.md#ace-19-1)）。

## 1. 位置づけ

- 「旅行アプリはコンシェルジュの最初のクライアントにすぎない」（ADR-003）という中心設計を、**実際に2つ目のクライアントが接続できる形**で証明するための開放面
- 想定クライアント: Claude Desktop 等の AI クライアント / 翌年のハッカソン参加者が作る任意のクライアント / 審査員の手元
- 審査席では Claude Desktop から同じサーバーへ接続してみせる想定（ADR-008「理由」）

## 2. ツール一覧

ツール名はコア操作名と同一（**仮称・未確定**。API.md §3 と同時に確定させる）。

| ツール | コア操作 | スキーマの参照先 |
| ------ | -------- | ---------------- |
| `search_datasets`（仮称） | データセット検索 | [API.md §3.1](./API.md) |
| `aggregate_dataset`（仮称） | 集計 | [API.md §3.2](./API.md) |
| `get_provenance`（仮称） | 出典取得 | [API.md §3.3](./API.md) |

追加候補（`recommend_spots` / `report_gap`）も API.md §3.4 に従う。

## 3. 応答の共通仕様

[API.md §4](./API.md) がそのまま適用される。特に「**出典を伴わない回答ありは仕様違反**」「**未回答はエラーではなく正常な出力**」という不変条件は、`/api/*` と `/mcp` の両経路で満たす（両面が必ず `worker/core/` を通る構造で担保する。ADR-008「影響」）。

エラー表現のみ面ごとに異なる: `/mcp` は MCP のエラー表現に合わせる（具体形は未定。エラー分類自体は `worker/core/` で共通化する）。

## 4. 実装方式

| 項目 | 内容 |
| ---- | ---- |
| ハンドラ | `agents/mcp/server` の `createMcpHandler`（**ステートレス**。Durable Objects もマイグレーションも不要） |
| 禁止 | `McpAgent` の使用（公式ドキュメントで deprecated / feature-frozen と明記）。React 側に MCP クライアントを実装すること |
| トランスポート | Streamable HTTP |
| エンドポイント | `/mcp`（API.md §1 と同一 Worker 上） |
| プロトコルバージョン | 未確認（実装時に確定） |
| 実装時期 | Step 5（2026-08-16 時点で未着手） |

## 5. 認証・レート制限

- POC では認証・レート制限なし（API.md §2・§5 と同方針）
- 外部公開（翌年参加者への開放）の段階で、レート制限を含めて再設計する

## 6. バージョニング

- ツール名・スキーマの破壊的変更は [DECISIONS.md](../06-reference/DECISIONS.md) に記録する（API.md §8 と同じ運用）
