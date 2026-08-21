import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ApiError, SearchDatasetsOutput } from "../shared/core";
import {
  applyMigrations,
  clearGaps,
  expectAnswered,
  expectUnanswered,
  postJson,
  readGapRows,
  readJson,
  request,
} from "./test-support";

/**
 * `/mcp` 面（MCP.md・ADR-008）。
 *
 * ここで確かめたいのは「MCP のツールとしてコア3操作が呼べること」と、
 * **`/api/*` と同じ不変条件が `/mcp` でも成立すること**の2つ。後者が本命で、
 * とくに「未回答が `gaps` に記録される」（DOMAIN.md §8 不変条件4）は、記録が
 * 落ちても応答は正常に返るため**この経路で実測しないと誰も気づけない**。
 */

/** MCP の JSON-RPC 応答。テストが読む範囲だけを型にする。 */
type RpcResponse = {
  jsonrpc: "2.0";
  id: number | null;
  result?: {
    protocolVersion?: string;
    serverInfo?: { name: string; version: string };
    tools?: { name: string; title?: string; description?: string; inputSchema?: JsonSchemaObject }[];
    content?: { type: string; text: string }[];
    isError?: boolean;
  };
  error?: { code: number; message: string };
};

/** `tools/list` が返す JSON Schema のうち、本テストが検査する部分。 */
type JsonSchemaObject = {
  type?: string;
  properties?: Record<string, { type?: string; description?: string }>;
};

const rpc = (body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });

/**
 * 応答本体を JSON-RPC として読む。
 *
 * Streamable HTTP は同じ内容を `text/event-stream`（`event: message` ＋ `data:` 行）でも
 * 素の JSON でも返しうる。どちらで来ても同じ検査ができるように、ここで吸収する。
 */
async function readRpc(response: Response): Promise<RpcResponse> {
  const text = await response.text();
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return JSON.parse(text) as RpcResponse;
  }
  const data = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());
  expect(data, `SSE に data 行がない: ${text}`).not.toHaveLength(0);
  return JSON.parse(data[0]!) as RpcResponse;
}

let nextId = 1;

/** ツールを1回呼ぶ。`initialize` を先に送らないのは、ステートレスで不要だからである（下のテストで固定）。 */
async function callTool(name: string, args: unknown): Promise<{ text: string; isError: boolean }> {
  const response = await rpc({
    jsonrpc: "2.0",
    id: nextId++,
    method: "tools/call",
    params: { name, arguments: args },
  });
  expect(response.status).toBe(200);
  const body = await readRpc(response);
  expect(body.error, `JSON-RPC エラーが返った: ${JSON.stringify(body.error)}`).toBeUndefined();
  const content = body.result?.content;
  expect(content, `content がない: ${JSON.stringify(body.result)}`).toBeDefined();
  expect(content).toHaveLength(1);
  return { text: content![0]!.text, isError: body.result?.isError === true };
}

/** ツールの正常な出力（`answered` / `unanswered` のどちらも「正常」）をコアの型として読む。 */
async function callToolOk<T>(name: string, args: unknown): Promise<T> {
  const { text, isError } = await callTool(name, args);
  // `unanswered` を `isError` にしてしまう退行を、ここで必ず捕まえる
  expect(isError, `正常な結果を期待したが isError だった: ${text}`).toBe(false);
  return JSON.parse(text) as T;
}

beforeAll(applyMigrations);
beforeEach(clearGaps);

describe("プロトコルの入口", () => {
  it("initialize に応答し、SDK が対応するプロトコル版を返す", async () => {
    const body = await readRpc(
      await rpc({
        jsonrpc: "2.0",
        id: nextId++,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "vitest", version: "1" } },
      }),
    );
    expect(body.result?.protocolVersion).toBe("2025-11-25");
    expect(body.result?.serverInfo?.name).toBe("tabi-concierge-tokyo");
  });

  it("GET は 405 を JSON-RPC のエラーとして返す（SPA の index.html に落ちない）", async () => {
    const response = await request("/mcp", { method: "GET" });
    // 静的アセットへ落ちると 200 の HTML が返り、MCP クライアントは JSON を期待して壊れる。
    // `wrangler.jsonc` の run_worker_first に /mcp があっても、ルートが無ければ素通りする
    expect(response.status).toBe(405);
    const body = (await response.json()) as RpcResponse;
    expect(body.jsonrpc).toBe("2.0");
    expect(body.error?.message).toBe("Method not allowed.");
  });

  /**
   * modern era（2026-07-28）のリクエスト。legacy(2025) とは**線の引き方から違う**。
   *
   * - `initialize` を送らない。ハンドシェイクはリクエストごとの `_meta` エンベロープが運ぶ
   * - ヘッダとボディの一致を強制される（`Mcp-Method`、`tools/call` なら `Mcp-Name` も必須。
   *   欠けると 400 `-32020` で「headers and body disagree」と言われる）
   * - 応答は素の JSON で、`resultType` という 2026-07-28 固有の判別子が付く
   */
  const MODERN_META = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "vitest", version: "1" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };

  const modernRpc = (method: string, params: Record<string, unknown>, extraHeaders: Record<string, string> = {}) =>
    rpc({ jsonrpc: "2.0", id: nextId++, method, params: { _meta: MODERN_META, ...params } }, {
      "mcp-method": method,
      "mcp-protocol-version": "2026-07-28",
      ...extraHeaders,
    });

  it("modern era（2026-07-28）でも tools/list がコア3操作を返す", async () => {
    // SDK は2つの era を同時に喋る（MCP.md §4）。legacy(2025) だけを確かめていると、
    // modern クライアントだけ繋がらない状態を全テスト緑のまま見逃す
    const body = await readRpc(await modernRpc("tools/list", {}));
    expect(body.error).toBeUndefined();
    expect((body.result?.tools ?? []).map((tool) => tool.name).sort()).toEqual([
      "aggregate_dataset",
      "get_provenance",
      "search_datasets",
    ]);
  });

  it("modern era でも unanswered は正常な結果として返る", async () => {
    // 「答えられない」を届ける設計（DOMAIN.md §8）が era をまたいで成立していること。
    // 片方の era だけ isError になると、繋いだクライアント次第で見え方が変わる
    const body = await readRpc(
      await modernRpc(
        "tools/call",
        { name: "search_datasets", arguments: { query: "新宿の美術館に行きたい" } },
        { "mcp-name": "search_datasets" },
      ),
    );
    expect(body.error).toBeUndefined();
    expect(body.result?.isError).not.toBe(true);
    const output = JSON.parse(body.result!.content![0]!.text) as SearchDatasetsOutput;
    expect(expectUnanswered(output).reason).toBe("out_of_area");
  });

  it("DELETE も 405 を返す（GET と同じくセッション操作が無いため）", async () => {
    const response = await request("/mcp", { method: "DELETE" });
    expect(response.status).toBe(405);
    const body = (await response.json()) as RpcResponse;
    expect(body.error?.message).toBe("Method not allowed.");
  });

  it("ステートレス — initialize を送らなくてもツールを呼べる", async () => {
    // セッションを持たない設計（McpAgent / Durable Objects 不使用）の実測。
    // ここが落ちるなら、どこかでセッション状態を持ち始めている
    const output = await callToolOk<SearchDatasetsOutput>("search_datasets", {
      query: "上野の寺社をめぐりたい",
      area: "上野",
    });
    expectAnswered(output);
  });
});

describe("tools/list", () => {
  const listTools = async () => {
    const body = await readRpc(await rpc({ jsonrpc: "2.0", id: nextId++, method: "tools/list", params: {} }));
    return body.result?.tools ?? [];
  };

  it("コア3操作をツールとして公開する", async () => {
    expect((await listTools()).map((tool) => tool.name).sort()).toEqual([
      "aggregate_dataset",
      "get_provenance",
      "search_datasets",
    ]);
  });

  it("3ツールとも、全フィールドに説明があり型は主張しない", async () => {
    // AI クライアントが引数を知る唯一の手がかりが `.describe()` の散文なので、
    // 説明の欠落は「使えないツール」と同義。1ツール1フィールドだけ見ていると、
    // 他の2ツールの説明がまるごと落ちても気づけない
    const expected: Record<string, string[]> = {
      search_datasets: ["query", "area", "areas", "interests", "category", "limit"],
      aggregate_dataset: ["datasetId", "intent"],
      get_provenance: ["datasetIds", "query"],
    };
    for (const tool of await listTools()) {
      const properties = tool.inputSchema?.properties ?? {};
      expect(Object.keys(properties).sort(), `${tool.name} のフィールド`).toEqual(expected[tool.name]!.slice().sort());
      for (const [field, schema] of Object.entries(properties)) {
        expect(schema.description, `${tool.name}.${field} に説明が無い`).toBeTruthy();
        expect(schema.type, `${tool.name}.${field} に型が書かれている（parse.ts との二重定義になる）`).toBeUndefined();
      }
      expect(tool.description, `${tool.name} にツール説明が無い`).toBeTruthy();
    }
  });

  it("入力スキーマは説明を載せるが、型は主張しない", async () => {
    // 検査の実体は parse.ts にある（mcp.ts の doc 参照）。ここに忠実な型を書くと
    // API.md §3・shared/core.ts に続く3つ目の定義になり、黙って食い違う。
    // 「説明はある・型は無い」という形そのものを固定して、忠実な型がうっかり入るのを防ぐ
    const search = (await listTools()).find((tool) => tool.name === "search_datasets");
    const query = search?.inputSchema?.properties?.["query"];
    expect(query?.description, "query に説明が無い").toBeTruthy();
    expect(query?.type, "query に型が書かれている（parse.ts との二重定義になる）").toBeUndefined();
  });
});

describe("コア3操作", () => {
  it("search_datasets が候補を返す", async () => {
    const answered = expectAnswered(
      await callToolOk<SearchDatasetsOutput>("search_datasets", { query: "上野の寺社をめぐりたい", area: "上野" }),
    );
    expect(answered.candidates[0].datasetId).toBeTruthy();
    // 出典に使える形で返っていること（URL の無い候補は出典を作れない）
    expect(answered.candidates[0].url).toContain("catalog.data.metro.tokyo.lg.jp");
  });

  it("aggregate_dataset が実行クエリつきで1件返す", async () => {
    const output = await callToolOk<{ status: string; result?: { name: string }; query?: string }>(
      "aggregate_dataset",
      { datasetId: "t131067d0000000251", intent: "上野エリアの寺社を1件" },
    );
    expect(output.status).toBe("answered");
    expect(output.result?.name).toBeTruthy();
    // 出典に添えるため省略できない（API.md §4）
    expect(output.query).toBeTruthy();
  });

  it("get_provenance が CC BY 4.0 の出典を返す", async () => {
    const output = await callToolOk<{ status: string; sources?: { license: string; datasetId: string }[] }>(
      "get_provenance",
      { datasetIds: ["t131067d0000000251"], query: "上野の寺社" },
    );
    expect(output.status).toBe("answered");
    expect(output.sources?.[0]?.license).toBe("CC BY 4.0");
  });
});

describe("答えられないときの扱い", () => {
  it("unanswered は正常な結果として返る（isError にしない）", async () => {
    // 「答えられない」を届けることが本プロジェクトの中心設計（DOMAIN.md §8）。
    // isError にすると MCP クライアントは「サーバが壊れた」と読み、この設計が /mcp 面だけ崩れる
    const output = await callToolOk<SearchDatasetsOutput>("search_datasets", {
      query: "新宿の美術館に行きたい",
      category: "美術館",
    });
    expect(expectUnanswered(output).reason).toBe("out_of_area");
  });

  it("**/mcp 経由の未回答が D1 の gaps に記録される**", async () => {
    // 不変条件4（DOMAIN.md §8）が /api/* だけでなく /mcp でも成立することの実測。
    //
    // 記録が落ちても応答は 200 の unanswered で正常に返り、失敗は console.error に出るだけ。
    // つまり**この経路で実測しない限り、記録の欠落は本番でもテストでも気づけない**。
    // GapRecorder をコア操作の必須引数にしてあるのは、渡し忘れを型で止めるためだが、
    // 型が守るのは「渡したかどうか」までで、「渡した先が本物の D1 か」は実測でしか分からない
    expect(await readGapRows()).toHaveLength(0);

    await callToolOk<SearchDatasetsOutput>("search_datasets", {
      query: "新宿の美術館に行きたい",
      category: "美術館",
    });

    expect(await readGapRows()).toEqual([
      // area は入力の area（未指定）ではなく、質問文から**解決したあとの値**が入る
      { question: "新宿の美術館に行きたい", area: "新宿", category: "美術館", reason: "out_of_area" },
    ]);
  });
});

describe("入力の形の違反", () => {
  it("isError つきで返し、文言は /api/* と一言一句同じになる", async () => {
    // 境界規則の SSOT を parse.ts 1箇所に保つ、という設計の実測。
    // zod のスキーマが「広告」に留まっている限りここは一致し、忠実な型を書いた瞬間に
    // zod が先に弾いて SDK 生成の別文言になるため、このテストが落ちて気づける
    const broken = { query: "上野", areas: "配列ではない" };

    const viaApi = await readJson<ApiError>(await postJson("/api/search-datasets", broken));
    const viaMcp = await callTool("search_datasets", broken);

    expect(viaMcp.isError).toBe(true);
    expect(viaMcp.text).toBe(viaApi.message);
    expect(viaMcp.text).toBe('"areas" は空でない文字列の配列で指定してください');
  });

  it("形の違反は未回答として記録しない（答えられなかったのではなく、問いになっていない）", async () => {
    await callTool("aggregate_dataset", { datasetId: "", intent: "寺社を1件" });
    expect(await readGapRows()).toHaveLength(0);
  });

  it("area と areas の同時指定を弾く（/api/* と同じ判定）", async () => {
    const { text, isError } = await callTool("search_datasets", { query: "上野", area: "上野", areas: ["浅草"] });
    expect(isError).toBe(true);
    expect(text).toBe('"area" と "areas" は同時に指定できません（"areas" に一本化してください）');
  });
});
