---
title: "API_REQUIREMENTS"
version: "1.10.2"
status: "draft"
owner: "@fffokazaki"
created: "2026-08-16"
updated: "2026-08-23"
changeImpact: "low"
---

<!-- markdownlint-disable MD013 MD022 MD024 MD025 MD032 -->

# フロントエンドが必要とするAPI要件（プラン画面）

**作成**: Sho（フロントエンド） → Okazaki 向けの共有ドラフト
**更新**: 2026-08-16 Okazaki 確認結果を反映（ProvenanceSource 3フィールド確定・`get_provenance` の `query` を必須化・API.md は PR #19 で §3.3 を修正済み）。同日、ADR-008 の二面公開を反映（下記注記参照）
**更新**: 2026-08-17 Sho が `aggregate_dataset` の出力語彙について Okazaki の逆提案（`name`/`summary` の汎用語彙）に合意。§2 の入出力例を更新し、`Stop.place`/`Stop.note` へのマッピングはフロントエンド側の責務であることを明記
**更新**: 2026-08-17 コア3操作の `/api/*` スタブを実装（Issue #22）。本書の提案はほぼそのまま採用され、エンドポイントパスと入出力スキーマは [API.md](./API.md) §3 で**確定**した。本書は「提案」から「確定した仕様に対するフロントエンド側の視点」に位置づけが変わっている
**位置づけ**: [API.md](./API.md)（フロントエンド ↔ バックエンドの `/api/*` API 仕様、正式なSSOT）に対する、フロントエンド実装から見た具体化。API.md を置き換えるものではありません。**入出力で食い違いがあれば API.md が正**です。

**呼び出し経路の注記（ADR-008）**: フロントエンドが呼ぶのは **`/api/*`（JSON）** であり、MCP を直接話すことはありません（React 側に MCP クライアントを実装するのは ADR-008 で禁止）。本書で `search_datasets` 等と呼んでいるのは `worker/core/` の**コア操作名**で、`/mcp`（[MCP.md](./MCP.md)、AI クライアント向け開放面）でも同名ツールとして公開されます。本書の入出力提案は経路によらずコア操作のスキーマに対するものなので、内容はそのまま有効です。

**現状**: プラン画面は **2026-08-17 に3操作へ接続済み**（[Issue #31](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/31)）。`mockScenarios.ts` の静的な仮データは削除し、`search_datasets` → `aggregate_dataset` → `get_provenance` の応答から旅程と出典チップを組み立てています。組み立ては `src/features/plan/buildPlan.ts`、通信と障害分類は `src/api/coreOperations.ts`。

バックエンドは `worker/core/` の固定データによるスタブのままですが、**入出力の形は本実装（Step 5）でも変えません**。

**呼び出しの並びの注記（2026-08-22・[Issue #142](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/142)）**: プラン画面・あなたへ画面とも、**候補ごとの `aggregate_dataset` を同時に投げます**（`search_datasets` の応答を受けたら候補の件数ぶん一斉に送り、結果は候補順に待つ）。Step 5 で1リクエストが約1.1秒（ほぼ全部が推論の待ち時間）になり、1件ずつ待つと旅程が出るまで5〜6秒かかっていたためです。

- **プロトコルは変わりません。** 送る入出力も、呼ぶ順（`search_datasets` → `aggregate_dataset` → `get_provenance`）も従来どおりで、**バックエンドが同一 intent の並行リクエストを受けられること**だけが前提です（本番実測 2026-08-22: 4件同時で合計 1.55 秒・6件同時で合計 2.28 秒、いずれも全件 200 で 429 なし）
- **同時に飛ぶ最大件数は `search_datasets` の `limit` と同じ** — プラン画面が4件（`ROUTE_STOP_LIMIT`）、あなたへ画面が6件（`RECOMMENDATION_LIMIT`）
- **候補のどれかが障害を返したときは、候補順で最初のものを採って打ち切ります**（残りの応答は待たない）。未回答（`unanswered`）は従来どおり候補順に `gaps` へ積みます

**この接続で分かったこと2点**:

1. **エリアを指定する入力欄が無い。** `Trip` に `area` フィールドが無いため、`search_datasets` の `area` は送っていません。代表エリアを狙うには「その他のご希望」（`trip.notes`）に地名を書く経路しかなく、書かれた地名は質問文の一部として渡ります（実測で効くことを確認済み）。専用の入力欄は [Issue #42](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/42)
2. **マナー解説が空になった。** `mockScenarios.ts` のマナー文は出典を持たない仮データだったため、API 接続経路に残せませんでした（CLAUDE.md 絶対ルール #2）。出典のあるデータの確保は [Issue #43](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/43)

**✅ 全体注記（確認済み）**: `ProvenanceSource` の3フィールド（`datasetId` / `license` / `query`）は Okazaki 確認済み（2026-08-16）。**3フィールドともドラフトの想定どおりで確定**。根拠は本書末尾の「ProvenanceSource フィールド確認結果」を参照。あわせて `get_provenance` の入力 `query` は optional から**必須**に修正した（API.md §4）。

---

## 対応する画面

🗺️ プラン（`src/features/plan/PlanScreen.tsx`）。API.md の「フロントエンド5機能とコア操作の対応」表どおり、`search_datasets` → `aggregate_dataset` → `get_provenance` の3操作を `/api/*` 経由で使います。
👤 旅のプロフィール（`TripSetupScreen.tsx`）はツール呼び出しなし（`Trip` はクライアント側のコンテキストとして保持するのみ）なので、本書には含めません。
📊 データ還元ダッシュボード（`/gaps`・`src/features/gaps/GapsDashboard.tsx`）は `GET /api/gaps/summary` を使います。旅行者向け5機能とは対象ユーザーが異なるため、タブには加えず独立 URL に置きます。

---

## 1. `search_datasets` — データセット検索

### 目的
ユーザーの興味・エリアから、ルートの停留地候補になりうるデータセットを検索する。

### フロントエンドからの呼び出しタイミング
- 「ブリーフィングを作成」クリック時（`旅のプロフィール` → `プラン` 遷移）
- 障害表示の「再試行」クリック時（同じプロフィールで叩き直す）

> 旧版に書いていた「シナリオチップの切り替え時」は削除した。シナリオチップは `mockScenarios.ts` の仮データを切り替えるための足場で、[Issue #31](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/31) の API 接続とともに画面から消えている。

### 入力（2026-08-21 構造化送信へ切り替え済み・Issue #53）

```ts
{
  query?: string;       // trip.notes（その他のご希望）を trim して送る。空なら**キーごと送らない**
  interests?: string[]; // trip.interests を INTEREST_LABELS で日本語ラベルに変換した配列。空なら送らない
  area?: string;        // POC対象の代表エリア（例: "上野"、"渋谷"）
  category?: string;    // 例: "神社", "飲食店", "公共交通機関"
  limit?: number;       // 候補件数の上限。既定 4・上限 10（API.md §3.1 で確定）
}
```

> **`trip.interests` は ASCII の識別子**（`"ramen"` / `"culture"` …）になった（[Issue #17](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/17)）。`interests` へ載せるときは `src/features/plan/labels.ts` の `INTEREST_LABELS` で日本語ラベルに変換する。バックエンドのマッチは日本語の部分一致なので、識別子をそのまま送ると1件も当たらない。
>
> `area` / `category` は API 契約として受け付けるキーだが、**プラン画面からは送らない**（エリアの入力欄が無い — Issue #42。分類の入力 UI も無い）。

### ✅ 採用済み（2026-08-21）: 構造化入力への移行（`interests`・ADR-011）

旧版の「`trip.interests` を1つの自然文にまとめて送る」という前提には、**答えていない興味が沈黙する**構造上の問題があった（[Issue #53](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/53)。キーワードが1件でも当たると `answered` になり、興味を複数選ぶほど欠損が消える）。

バックエンドは `interests?: string[]`（興味の配列・日本語ラベル）と `areas?: string[]`（目的地エリアの配列）を **optional で受け付ける**（[API.md](./API.md) §3.1・[ADR-011](../06-reference/DECISIONS.md)）。プラン画面は `interests: trip.interests.map(t => INTEREST_LABELS[t])` と `query: trip.notes` を**分けて送る**形へ切り替えた（`src/features/plan/buildPlan.ts` の `buildSearchInput`）。これで**答えられなかった興味が興味ごとに `gaps` に載る**。畳み込んだ全文（`buildQuery`）は `aggregate_dataset` の `intent`・`get_provenance` の `query`・画面表示にのみ残る。`areas` は引き続き送らない（エリアの入力欄が無い — [Issue #42](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/42)）。

### 提案する出力

```ts
{
  status: "answered";
  candidates: Array<{
    datasetId: string;
    title: string;
    provider: string;
    url: string;
    matchReason: string;   // 適合理由
  }>;
  gaps?: Array<{          // 答えられなかった側面（Issue #29）。無いときはキーごと省かれる
    status: "unanswered";
    reason: "data_not_published" | "insufficient_granularity" | "out_of_area" | "other";
    message: string;
  }>;
} | {
  status: "unanswered";
  reason: "data_not_published" | "insufficient_granularity" | "out_of_area" | "other";  // 閉じた列挙（API.md §4）
  message: string;   // 画面に出せる日本語。何が無くて答えられなかったのか
}
```

### 備考
- API.md §4 のとおり、このツールは「実行クエリ」を持たない。出典には検索条件（`query`/`area`/`category`）をそのまま使う想定。
- `limit` は **既定 4・上限 10 で確定**（API.md §3.1）。既定値は「1ルートあたり3〜4停留地」という本書の想定に合わせたもの。範囲外は 400 で、黙って丸められない。

### ✅ 解決済み（2026-08-18）: `gaps`（部分欠損）の画面での出し方

旧実装（Issue #53 の切り替え前）のフロントエンドは `trip.interests` を**1つの自然文にまとめて送っていた**。すると「上野の美術館とラーメン」のように、答えられる興味と答えられない興味が1つの `query` に混ざる。当時はこの場合、答えられる候補だけが返り、**ラーメン側の欠損は応答のどこにも現れなかった**。

[Issue #29](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/29) で、`answered` に `gaps` を載せるようにした（バックエンド実装済み）。画面での出し方は、Okazaki の提案どおりの形で実装済み。

載るのは**求めているデータの種類**を指す語から判定できる2つだけ。ジャンル指定の飲食（`insufficient_granularity`）と、渋谷の観光データ未公開（`data_not_published`）。対象エリア外の地名は**載せない**（「新宿のホテルから上野の美術館へ」の新宿は出発地であって、新宿のデータを求めてはいないため）。

**実装した扱い**:

| 状況 | 画面 |
| --- | --- |
| `gaps` が無い | 今までどおり。何も足さない |
| `gaps` がある | ルートは通常どおり表示し、**その下に「答えられなかった点があります」の注記**を `message` つきで出す（見出しは「一部」を名乗らない。エリア・フォールバックで全体が代替表示になっているケース（Issue #50・#54）で「一部は答えられた」という誤った主張になるため） |
| `status: "unanswered"` | 従来どおり見出し「該当するオープンデータがありません」＋ `message`。エラー表示にはしない。名乗りは見出しだけが持ち、`message` は事実だけを述べる（[Issue #107](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/107) で `message` 側の名乗りを外した）。見出しは `reason` を問わず固定文のため、API.md §4 の断定／照合の使い分けは `message` 内でのみ成立する（見出しの扱いは [Issue #110](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/110)） |

**意図**: `gaps` をエラー扱いにしない。データが無いことは本プロジェクトでは**正常な出力**（DOMAIN.md §8 不変条件4）で、むしろ「どのデータが公開されていないか」を利用者に見せることが企画の芯の半分にあたる（DOMAIN.md §7 の「未回答 → データ公開リクエスト」）。赤いエラーバナーにすると、この意味が伝わらない。

**確認結果**（`src/features/plan/components/DataGapCard.tsx`、コミット `59fe6dd`）:
1. 「ルートの下に注記」を採用。興味チップ側への印付けはしない
2. `message` はバックエンドが返す日本語をそのまま表示する（英語表示は Issue #17 の多言語化とあわせて後日）
3. 表示は必須。`gaps.length > 0` のとき無条件に表示され、オプトアウトはない

承認済みデザインカンプ（[`design-canvas/Gap_Design_new_jap.pdf`](design-canvas/Gap_Design_new_jap.pdf)）のうち、「このデータをリクエストする」ボタンと件数表示は、対応するサーバー側のオプトイン機構が無いため意図的に実装から外した。

### 未回答の還元を画面に出す（2026-08-22・[Issue #192](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/192)）

上のボタンを外した判断は維持したまま、**記録され都へのデータ公開リクエストへ還元されること自体は画面に出す**ようにした（`src/features/plan/components/GapEscalationNote.tsx`）。それまで**答えられなかったことを告げている場所（`route-empty` / `DataGapCard`）の脇には**この説明が無く、仕組みは動いているのに利用者からは「答えられません」で行き止まりに見えていた（DOMAIN.md §7 の還元ループは企画の芯の半分）。

> **[Issue #201](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/201) で解消済み。** プラン画面のマナー欄フォールバックには以前「都へのデータ公開リクエストの候補として記録しています。」という一文があった。しかし `buildPlan` が `etiquette: []` を固定で入れるため、これはマナーを訊いていない成功プランでも必ず表示され、目の前の1件を記録したという受領証に読めていた。この固定文は削除し、成功プランでは調査済みのデータ欠損だけを述べる。マナーを含む問いが `unanswered` になった場合は、従来どおりサーバーの調査済み欠損メッセージと下記の機構説明を表示する。

| 決めたこと | 内容 |
| --- | --- |
| **ボタンは出さない** | 2026-08-17 の判断を維持。押す操作は増やさず、既に自動で動いている仕組みを述べるだけにする |
| **文言** | 「答えられなかった問いは記録されます。何が足りないのかを、東京都へのデータ公開リクエストに変えていきます。」 |
| **時制を分ける** | 「記録されます」＝実装済みの事実（D1 `gaps` は本番稼働中）／「変えていきます」＝意図（都への提出プロセスは**構想**）。`docs/first-stage-presentation.md` の発話原稿と同じ切り方にして、資料と画面で主張がずれないようにする。「提出しました」「送信しました」は書かない |
| **集計先の画面（§4）とは独立** | 記録の集計は `/gaps` のデータ還元ダッシュボード（[Issue #193](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/193)・§4）が見せる。旅行者向け画面の注記からは**リンクしない** —— 対象ユーザーが違い（都・GovTech東京向け）、旅行者を別画面へ誘導する導線は本 Issue の範囲外。「変えていきます」が構想である点は両画面で同じ扱い |
| **個別の受領証にはしない** | `d1GapRecorder`（`worker/core/gaps.ts`）は D1 への書き込み失敗を `console.error` に出して応答は通すため、**応答に記録の成否が載っていない**。よってフロントは目の前の1件について「記録済みです」と断定できない。この文は機構の説明。受領証にするには応答へ成否を載せる必要がある（[Issue #194](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/194)） |
| **出す条件** | `status: "unanswered"` のとき無条件（**内訳 `gaps` が空でも出す**）／`answered` のときは `gaps.length > 0`。**画面に1つだけ**。`reason` では出し分けない（下記） |
| **未回答のとき `gaps` が空になるのは1経路だけ** | 「未回答なら内訳は空」ではない。内訳が付かないのは**サーバー応答をそのまま返す経路**だけで（構造化欠損が `areas` の送信を要求するのに送っていないため）、ラーメン単独がこの形。一方フロント側が組み立てる未回答（候補全滅の `other`・`get_provenance` の未回答）は内訳を伴う。だから条件を `gaps.length > 0` にすると**ラーメンの画面にだけ注記が出ない** |

**`reason` で出し分けない理由**（実装途中に `reason !== "other"` を検討して棄却した）: サーバーが返す `other` も `gaps` テーブルへ記録されている（渋谷×ショッピング／ナイトライフが応答全体 `unanswered` / `other` で返る実測。CLAUDE.md）ため、`other` で黙ると記録されている実在の経路で注記が消える。一方フロント側が組み立てる `other`（「候補のデータセットから…取り出せませんでした」）は、原因となった候補ごとの未回答（サーバーが記録済み）を必ず `gaps` に伴う。`reason` は応答全体を代表する1つでしかなく（[Issue #94](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/94)）、記録の有無を判別する材料にはならない。

---

## 2. `aggregate_dataset` — 集計・抽出

### 目的
候補データセットから、実際にルート停留地として表示する具体的な情報（場所名・特徴の一文など）を抽出する。

### フロントエンドからの呼び出しタイミング
`search_datasets` の候補の中からルートに組み込む停留地を決めるたびに（1ルートにつき3〜4回程度）。

### 提案する入力

```ts
{
  datasetId: string;
  intent: string;   // 例: "上野エリアのラーメン店を1件、営業時間の傾向つきで"
}
```

### 提案する出力

```ts
{
  status: "answered";
  result: {
    name: string;      // 汎用語彙。フロントエンドが Stop.place にマッピングする
    summary: string;    // 汎用語彙。フロントエンドが Stop.note にマッピングする
    category: string;   // 選択行の分類。フロントエンドが Stop.category にマッピングする
    // その他の集計結果フィールドは要検討（例: 営業時間の生データ、混雑度など）
  };
  query: string;       // 実行したクエリ。出典に必須（API.md §4）
} | {
  status: "unanswered";
  reason: "data_not_published" | "insufficient_granularity" | "out_of_area" | "other";  // 閉じた列挙（API.md §4）
  message: string;   // 画面に出せる日本語。何が無くて答えられなかったのか
}
```

### 備考
- `query`（実行クエリ）は出典に必須。省略不可（API.md §4「実行クエリの不在を理由に出典を省略してはならない」）。
- **2026-08-17 合意**: 出力フィールド名は `place` / `note` ではなく `name` / `summary` の汎用語彙とする。API.md 設計原則4「アプリ固有の語彙を持ち込まない」（`/mcp` 経由で翌年参加者にも同じ操作を開放するため）に沿った Okazaki の逆提案に Sho が合意した。`Stop.place ← name`、`Stop.note ← summary` のマッピングはフロントエンド側の責務とする
- **2026-08-22 追加**: `category` は固定 SQL で検証した選択行の非空分類をそのまま返す。データセット内に複数分類があるため、フロントエンドはデータセット名から推測せず `Stop.category ← category` とする（[Issue #188](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/188)）
- **未対応**: `Stop.time`（表示用の時刻ラベル）は現在 `Scenario.schedule[position]` としてフロントエンド側で保持しており、データセット由来ではない（並べ替えても時刻が逆行しないための設計）。この集計結果に時刻情報を含める必要はありません。

---

## 3. `get_provenance` — 出典取得

### 目的
`EtiquetteTip.source`（出典チップ）を表示するための構造化データを取得する。CLAUDE.md の絶対ルール「出典なしの回答を作らない」を満たすため、表示前に必ず呼ぶ想定。

### フロントエンドからの呼び出しタイミング
`aggregate_dataset` の結果を画面に出す直前（集計を経ない検索のみの経路がある場合は `search_datasets` の直後）。

### 提案する入力

```ts
{
  datasetIds: string[];   // 複数可
  query: string;           // 集計を経た場合は実行クエリ、検索のみの場合は検索条件。必須（API.md §4「実行クエリの不在を理由に出典を省略してはならない」— 検索のみの経路でも検索条件が必ず入るため optional にしない）
}
```

### 提案する出力（`ProvenanceSource` に対応）

```ts
{
  status: "answered";
  sources: Array<{
    datasetId: string;         // ✅ 確認済み（下記参照）
    datasetTitle: string;
    provider: string;
    license: "CC BY 4.0";      // ✅ 確認済み（下記参照）
    url: string;
    query: string;              // ✅ 確認済み（下記参照）
    retrievedAt: string;
  }>;
} | {
  status: "unanswered";
  reason: "data_not_published" | "insufficient_granularity" | "out_of_area" | "other";  // 閉じた列挙（API.md §4）
  message: string;   // 画面に出せる日本語。何が無くて答えられなかったのか
}
```

---

## ProvenanceSource フィールド確認結果（✅ 確認済み 2026-08-16 / Okazaki）

3フィールドとも**ドラフトの想定どおりで確定**。フロントエンドの型 `src/features/plan/types.ts` の `ProvenanceSource` はこのまま使える。

| フィールド | 確定内容 | 根拠 |
| --- | --- | --- |
| `datasetId` | **出力に含まれる**。フロントエンド側で入力時の ID を別途保持して突き合わせる必要はない | API.md §4「根拠情報として必須」の表に `get_provenance` の必須項目として明記。§3.3 の出力欄に書かれていなかったのは §4 との記述ゆれで、PR #19 で §3.3 にも追記し解消済み |
| `license` | **`"CC BY 4.0"` リテラル型のまま維持**（カタログ外データを型レベルで弾く設計を維持） | CONSTRAINTS.md §3「カタログ掲載データは CC BY 4.0」（2026-08-15 チーム合意・事務局資料で確認）。加えて POC の利用データセットは最大10件をチームが選定するため、万一の例外ライセンスも選定段階で除外できる |
| `query` | **兼用1フィールドで確定**。`executedQuery` / `searchCondition` に分けない | API.md §4 が「実行クエリの**代わりに**検索条件を根拠情報とする」という同一スロット差し替えのモデルで書かれており、分けるとかえって仕様から乖離する |

---

## その他、実装未着手のツール（本書の対象外）

API.md §3.5 に記載のある以下は、専用のコア操作として未実装です。本書では既存のコア3操作を組み合わせる画面要件だけを扱い、専用操作の実装に着手する段階で改めて要件を出します。

- `recommend_spots`（仮称） — 「あなたへ」画面用
- `report_gap`（仮称） — 未回答のデータ公開リクエスト化用

---

## 4. `GET /api/gaps/summary` — 還元ダッシュボード

### 呼び出しタイミング

`/gaps` を開いたときに1回呼び出す。結果は D1 `gaps` の現時点のスナップショットで、画面側に固定件数を持たない。

### 出力

```ts
{
  total: number;
  byReason: Array<{ reason: UnansweredReason; count: number }>;
  byArea: Array<{ area: string | null; count: number }>;
  byReasonAndArea: Array<{
    reason: UnansweredReason;
    area: string | null;
    count: number;
  }>;
}
```

- `area: null` は画面で「エリア指定なし」と表示する
- API 入力由来の任意のエリア文字列は返さず、公開を決めた既知の地名以外は `"その他のエリア"` と表示する
- `reason` は日本語ラベルへ変換するが、API の閉じた英語列挙値は変えない
- `total: 0` では「未回答の記録はまだありません」と表示し、ダミーの棒グラフや件数を置かない
- 画面に**「構想」**と、東京都・GovTech東京への提出プロセス自体は未実装である旨を明記する
- `gaps.question` は表示にも応答型にも含めない。`gaps.area` も生値では受け取らず、既知の公開地名以外は SQL 側で `"その他のエリア"` にまとめる。利用者の自由入力を認証なしで公開しないため、画面は分類済みの集計だけを使う

---

## 前提として確認したいこと（API.md 側で未定の項目）

以下は API.md 自体が「未定」としている項目です。

- MCPエンドポイントのURL・プロトコルバージョン（`/mcp` 面は Step 5 で実装。フロントエンドは `/api/*` を使うため直接の影響はない）
- `search_datasets` のスコアリング方法（Step 5 のメタデータRAG で再設計。`limit` は下記のとおり確定済み）

### 解決済み（2026-08-17・Issue #22）

| 項目 | 決定 |
| ---- | ---- |
| `aggregate_dataset` の出力語彙 | `name` / `summary` / `category` の汎用語彙。`Stop.place` / `Stop.note` / `Stop.category` へのマッピングはフロントエンド側（§2 参照） |
| `search_datasets` の `limit` | 既定 4・上限 10。範囲外は 400（黙って丸めない）。既定値は1ルート3〜4停留地という本書 §1 の想定に合わせた |
| エラーレスポンスの形 | `{ error: "invalid_request" \| "not_found" \| "internal_error", message?: string }`。400 は**入力の形の違反だけ**に使い、「データが無い」は `unanswered` ＋ HTTP 200（API.md §4）。500 も JSON で返るので、画面は常に JSON として読んでよい |
| 複数データセット横断時の `query` の対応関係 | 入力の `query` を各 source に同じ値で複写する。同じ ID を重ねても出典は1件にまとまる。知らない `datasetId` が混ざったら既知のぶんだけ返さず全体を `unanswered` にする（画面上の並べ方はフロントエンド側の決定事項として残る） |
| `category` の意味 | 絞り込みの述語ではなく**スコアリングのヒント**。ただし指定して1件も当たらなければ `unanswered` になる（無関係な候補は返らない） |
| `aggregate_dataset` の `intent` にエリアを書いた場合 | **そのエリアの地物が返るとは限らない。** 保証は1つだけで、訊かれた代表エリアの行をそのデータセットが1行も収録していなければ `unanswered` にする（別エリアの行では埋めない）。それ以外は返る行の `area` を実行後に検証していないため、「上野の…」と訊いて浅草の行が返りうる（[Issue #152](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/152)）。**返ってきた `name` を「訊いたエリアの施設」として扱わないこと。** 詳細は [API.md](./API.md) §3.2 |

## Changelog

### [1.10.2] - 2026-08-23

#### 変更

- §5 のデザインカンプ参照を新しい配置へ更新。`Gap_Design_new_jap.pdf` を `public/showcase/uploads/` から [`design-canvas/`](design-canvas/) へ移した（[Issue #222](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/222)）。`public/` 配下は静的アセットとしてそのまま配信されるため、出典未記録の写真が埋め込まれた PDF を公開経路から外す必要があった

### [1.10.1] - 2026-08-22

#### 修正

- [Issue #201](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/201) により、成功プランで必ず出るマナー欄フォールバックから per-item の受領証に読める「都へのデータ公開リクエストの候補として記録しています。」を削除。マナーを訊いていない画面は調査済みの欠損だけを述べ、マナーを含む未回答では既存の欠損メッセージと還元機構の注記を維持する

### [1.10.0] - 2026-08-22

#### 追加

- `aggregate_dataset` の回答あり `result` に、選択行由来の必須 `category` と `Stop.category` への写像を追加（[Issue #188](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/188)）

### [1.9.0] - 2026-08-22

#### 変更

- **未回答の還元を画面に出す方針へ変更**（[Issue #192](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/192)。§1 に同名の節を追加）。**minor は節を足したからではなく方針変更のため** ―― 未回答・欠損の表示の脇でこれまで言っていなかった「記録され都へのデータ公開リクエストへ還元される」ことを言うようになる。2026-08-17 の「リクエストするボタンは出さない」判断は維持したうえで、押す操作を伴わない注記として出す。文言の時制の切り分け（「記録されます」＝事実／「変えていきます」＝構想）と、`reason` で出し分けない理由（サーバーが返す `other` も記録されている）を根拠つきで記録した
- 同節に、既存のマナー欄フォールバックが per-item の記録を名乗っている衝突を明記し、[Issue #201](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/201) へ分離した

### [1.8.0] - 2026-08-22

#### 追加

- [Issue #193](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/193) のデータ還元ダッシュボードと `GET /api/gaps/summary` のフロントエンド要件を §4 に追加
- 0件表示、`area: null` のラベル、都への提出が**構想**であることの表示、個票 `question` と任意の `area` を外へ出さない境界を確定。未知のエリアは「その他のエリア」へ集約する

#### 修正

- 追加候補の参照先を API.md §3.4 から §3.5 へ修正
- 実装済みの「あなたへ」画面まで未実装と読める旧説明を、追加候補の専用コア操作が未実装という現況へ修正

### [1.7.1] - 2026-08-22

#### 修正

- **「`intent` にエリアを書けばそのエリアの地物しか返らない」という保証を撤回した**（[Issue #168](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/168)）。これはスタブ時代の挙動で、主経路（D1 実照会）では成り立たない ―― 返る行の `area` を実行後に検証していないため、「上野の…」と訊いて浅草の行が返りうる（[Issue #152](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/152)）。**画面へ「返ってきた `name` をそのまま信用してよい」と指示していたので、`changeImpact` を `high` にした。** 保証は「訊かれた代表エリアの行を1行も収録していなければ `unanswered`」の1つだけである（[API.md](./API.md) §3.2）

### [1.7.0] - 2026-08-22

#### 追加

- 「現状」に**呼び出しの並びの注記**を追加（[Issue #142](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/142)）。候補ごとの `aggregate_dataset` を同時に投げるようになった。プロトコルは変わらないが、バックエンドが並行リクエストを受ける前提が増えるためインターフェース文書へ明記した（本番実測の裏取りつき）

### [1.6.0] - 2026-08-21

#### 変更

- §1 を構造化送信への切り替え（[Issue #53](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/53) のフロントエンド側）に合わせて更新: 入力仕様を `query`（`trip.notes` を trim・空なら省略）＋ `interests`（日本語ラベルの配列）へ書き換え、「🟡 提案」を「✅ 採用済み」に変更。`gaps` の節の「1つの自然文にまとめて送る」の記述を旧実装の説明へ改めた。`area` / `category` はプラン画面からは送らない旨の注記を追加（セルフレビュー指摘）

### [1.5.2] - 2026-08-20

#### 変更

- `status: "unanswered"` の表示の行に、名乗りの分担を明記（[Issue #107](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/107)）: 「該当するオープンデータがありません」の一文は画面の見出しだけが持ち、バックエンドの `message` は名乗りを持たず事実だけを述べる（API.md §4 の契約変更に対応。画面側の実装変更はない）

### [1.5.1] - 2026-08-18

#### 修正

- gaps 注記の見出し文言を「一部の興味には答えられませんでした」から「答えられなかった点があります」へ変更。エリア・フォールバックで全体が代替表示になっているケース（Issue #50・#54）だと「一部」が誤った主張になるため。`DataGapCard.tsx` の実装に合わせた

### [1.5.0] - 2026-08-18

#### 変更

- §1「🔴 未合意」を「✅ 解決済み」に更新。`gaps` の画面表示は `DataGapCard`（コミット `59fe6dd`）で実装済みであることを反映し、Sho への確認3点への回答を記録した

### [1.4.0] - 2026-08-18

#### 追加

- §1 に「🟡 提案: 構造化入力への移行（`interests` / `areas`・ADR-011）」を追加（[Issue #53](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/53)・[Issue #58](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/58)）。バックエンドは受け付け済み・optional。「`trip.interests` を1つの自然文にまとめて送る」前提の見直し提案で、**Sho との合意は未了**

### [1.3.0] - 2026-08-17

#### 修正

- 冒頭の「現状」を更新（[Issue #31](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/31)）。プラン画面は3操作へ接続済みで、`mockScenarios.ts` は削除された。組み立ては `buildPlan.ts`、通信と障害分類は `src/api/coreOperations.ts`
- §1 の呼び出しタイミングから「シナリオチップの切り替え時」を削除し「再試行クリック時」へ。シナリオチップは仮データの足場で、画面から消えている

#### 追加

- 接続で分かった2点を明記。エリアの入力欄が無く「その他のご希望」経由でしか指定できないこと（[Issue #42](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/42)）、出典を持つマナーのデータが無くマナー欄が空になったこと（[Issue #43](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/43)）

### [1.2.0] - 2026-08-17

#### 追加

- §1 の入力に注記を追加（[Issue #17](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/17)）。`trip.interests` が ASCII の識別子になったため、`query` を組み立てるときは `INTEREST_LABELS` で日本語ラベルへ変換する必要がある（バックエンドのマッチは日本語の部分一致）

### [1.1.0] - 2026-08-17

#### 追加

- §1 の出力に `gaps`（部分欠損）を追記（[Issue #29](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/29)）。バックエンドは実装済み
- §1 に「🔴 未合意: `gaps` の画面での出し方」を追加。**Okazaki からの提案であり、Sho との合意は未了**。確認したい3点を明記した

### [1.0.0] - 2026-08-17

#### 追加

- frontmatter（`title` / `version` / `status` / `owner` / `created` / `updated` / `changeImpact`）を導入し、コア文書と書式を揃えた。本文の変更はない
- `created` は Git の初回コミット日（実測）。この版より前の変更履歴は Git ログを参照する
