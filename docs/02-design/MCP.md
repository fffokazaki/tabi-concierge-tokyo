---
title: "MCP"
version: "1.1.0"
status: "draft"
owner: "@fffokazaki"
created: "2026-08-16"
updated: "2026-08-21"
changeImpact: "low"
---

# MCP.md - MCP設計書（基盤開放面 `/mcp`）

> 本書は単一 Worker の二面公開（[ADR-008](../06-reference/DECISIONS.md)）のうち、**AI クライアント向けの MCP（Model Context Protocol）面 `/mcp`** の設計書である。React アプリが呼ぶ `/api/*` は [API.md](./API.md) を参照。
>
> **ツールの入出力スキーマは本書に書かない。** `/mcp` の各ツールは `worker/core/` のコア操作をそのまま露出するため、スキーマの SSOT は [API.md](./API.md) §3、応答の共通仕様（出典必須・未回答分類）は同 §4 とする。二重定義は片方だけ読んだ読み手の誤認を生むため禁止（[ACE-19-1](../08-knowledge/playbook/documentation-quality.md#ace-19-1)）。

## 1. 位置づけ

- 「旅行アプリはコンシェルジュの最初のクライアントにすぎない」（ADR-003）という中心設計を、**実際に2つ目のクライアントが接続できる形**で証明するための開放面
- 想定クライアント: Claude Desktop 等の AI クライアント / 翌年のハッカソン参加者が作る任意のクライアント / 審査員の手元
- 審査席では Claude Desktop から同じサーバーへ接続してみせる想定（ADR-008「理由」）

## 2. ツール一覧

ツール名はコア操作名と同一。3操作とも **2026-08-17 に確定**（Issue #22。スキーマは API.md §3 が SSOT で、ここには二重定義しない）。`/mcp` 面は **2026-08-21 に実装済み**（[Issue #117](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/117)・`worker/mcp.ts`）。

| ツール | コア操作 | スキーマの参照先 |
| ------ | -------- | ---------------- |
| `search_datasets` | データセット検索 | [API.md §3.1](./API.md) |
| `aggregate_dataset` | 集計 | [API.md §3.2](./API.md) |
| `get_provenance` | 出典取得 | [API.md §3.3](./API.md) |

追加候補（`recommend_spots` / `report_gap`）も API.md §3.4 に従う。

## 3. 応答の共通仕様

[API.md §4](./API.md) がそのまま適用される。特に「**出典を伴わない回答ありは仕様違反**」「**未回答はエラーではなく正常な出力**」という不変条件は、`/api/*` と `/mcp` の両経路で満たす（両面が必ず `worker/core/` を通る構造で担保する。ADR-008「影響」）。

エラー表現のみ面ごとに異なる。**2026-08-21 に確定**（Issue #117）。

| 何が起きたか | `/api/*` | `/mcp` |
| --- | --- | --- |
| **答えられない**（`unanswered`） | HTTP 200 ＋ `status: "unanswered"` | **正常なツール結果**（`isError` を付けない）。本体は `/api/*` と同じ JSON を `content[0].text` に入れる |
| **入力の形の違反** | HTTP 400 ＋ `ApiError` | `isError: true` ＋ `content[0].text` に `parse.ts` の message（**`/api/*` と一言一句同じ**） |
| 想定外の例外 | HTTP 500 ＋ `ApiError` | SDK が JSON-RPC のエラーとして返す。`onerror` で `console.error` に記録する（応答は変えない） |

**`unanswered` を `isError` にしない**のが最も重要な一行である。`isError` はクライアントに「サーバが壊れた」と読ませる合図で、そこに未回答を入れると「答えられないことを answer として届ける」という本プロジェクトの中心設計（DOMAIN.md §8）が `/mcp` 面だけ成立しなくなる。

### スキーマは「広告」であって検査ではない

ツールの `inputSchema` は各フィールドを `z.unknown().optional()` にし、契約は `.describe()` の散文で渡している（`worker/mcp.ts`）。理由は2つある。

1. **正規定義を増やさない。** 入力の形の SSOT は [API.md](./API.md) §3、コード上の型は `shared/core.ts`。zod に忠実な型を書くと3つ目の定義になり、片方だけ直したときに黙って食い違う
2. **検査の実体を `parse.ts` に一本化する。** zod がここで弾くと、その入力は `parse.ts` に届かず**別の文言**のエラーが返る。実測（Issue #117）: `areas` に `z.array(z.string())` を書くと `"areas" は空でない文字列の配列で指定してください` ではなく `Input validation error: Invalid arguments for tool search_datasets: areas: Invalid input: expected array, received string` になる

この関係は `worker/mcp.test.ts` の「文言は /api/* と一言一句同じになる」で固定してある。忠実な型を書き足すとそのテストが落ちる。

## 4. 実装方式

| 項目 | 内容 |
| ---- | ---- |
| ハンドラ | `agents/mcp/server` の `createMcpHandler`（**ステートレス**。Durable Objects もマイグレーションも不要） |
| 禁止 | `McpAgent` の使用（公式ドキュメントで deprecated / feature-frozen と明記）。React 側に MCP クライアントを実装すること |
| トランスポート | Streamable HTTP |
| エンドポイント | `/mcp`（API.md §1 と同一 Worker 上） |
| プロトコルバージョン | **modern era = `2026-07-28`** / **legacy(2025) era = `2025-11-25`（`LATEST_PROTOCOL_VERSION`）**。両方を同時に扱う。詳細は下記 |
| 2025 世代の扱い | `legacy: 'stateless'`（**SDK の既定**）。リクエストごとに同じ factory から実体を作って応答する |
| GET / DELETE | `405 Method not allowed.`（JSON-RPC のエラー本体つき）。ステートレスなのでセッション操作が存在しないため |
| 実装時期 | **2026-08-21 実装済み**（Issue #117） |

#### プロトコルバージョンの読み方（2026-08-21・`@modelcontextprotocol/server@2.0.0` で実測）

SDK は **2つの era を同時に喋る**。ここを1つの数字だと思うと必ず取り違える。

| era | 版 | 備考 |
| --- | --- | --- |
| modern | `2026-07-28` | エンベロープ方式。`responseMode` などの新機能はこの era のもの |
| legacy(2025) | `2025-11-25` ← `LATEST_PROTOCOL_VERSION` | ほかに `2025-06-18` / `2025-03-26` / `2024-11-05` / `2024-10-07` を受ける（`SUPPORTED_PROTOCOL_VERSIONS`） |

`DEFAULT_NEGOTIATED_PROTOCOL_VERSION` は `2025-03-26`（版を送ってこないクライアント向けの既定）。

> **これらの値は SDK のバージョンとともに動く。** 上記は `@modelcontextprotocol/server@2.0.0` を 2026-08-21 に実測した値であり、SDK を上げたら再確認すること。`initialize` の応答で実際に何が返るかは `worker/mcp.test.ts` が固定している。

## 5. 認証・レート制限

- POC では認証・レート制限なし（API.md §2・§5 と同方針）
- CORS と `Host` 検証は SDK の既定に任せている。localhost と `*.workers.dev` は既定で許可されるため追加設定は不要（[Issue #117](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/117) で実測）
- 外部公開（翌年参加者への開放）の段階で、レート制限を含めて再設計する

## 6. バージョニング

- ツール名・スキーマの破壊的変更は [DECISIONS.md](../06-reference/DECISIONS.md) に記録する（API.md §8 と同じ運用）

## 7. 動作確認

```bash
# ローカル（npm run dev）
npx @modelcontextprotocol/inspector           # ブラウザから http://localhost:5173/mcp へ接続
claude mcp add --transport http tabi-local http://localhost:5173/mcp

# 本番
claude mcp add --transport http tabi https://tabi-concierge-tokyo.opendata-002.workers.dev/mcp
```

素の HTTP でも確かめられる（セッション不要なので `initialize` を先に送らなくてよい）。

```bash
U=https://tabi-concierge-tokyo.opendata-002.workers.dev
curl -s -X POST $U/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# GET は 405（SPA の index.html に落ちないこと）
curl -s -o /dev/null -w '%{http_code}\n' $U/mcp
```

## Changelog

### [1.1.0] - 2026-08-21

#### 変更

- `/mcp` 面の実装完了にあわせて「未実装」の記述を解消（[Issue #117](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/117)）
- §3: エラー表現を確定（表を追加）。`unanswered` を `isError` にしない理由と、入力スキーマを「広告」に留める設計判断（`parse.ts` との二重定義回避・文言一致）を実測つきで記載
- §4: プロトコルバージョンの「未確認」を実測値で解消。modern era `2026-07-28` と legacy(2025) era `2025-11-25` の2本立てであること、`legacy: 'stateless'` が SDK の既定であること、GET/DELETE が 405 になる理由を追記
- §5: CORS・Host 検証が SDK 既定で足りることを追記

#### 追加

- §7「動作確認」を新設（MCP Inspector / `claude mcp add` / 素の curl）

### [1.0.0] - 2026-08-17

#### 追加

- frontmatter（`title` / `version` / `status` / `owner` / `created` / `updated` / `changeImpact`）を導入し、コア文書と書式を揃えた。本文の変更はない
- `created` は Git の初回コミット日（実測）。この版より前の変更履歴は Git ログを参照する
