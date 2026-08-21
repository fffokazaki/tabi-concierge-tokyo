---
title: "LLM-MODEL-CANDIDATES"
version: "1.0.0"
status: "active"
owner: "@fffokazaki"
created: "2026-08-21"
updated: "2026-08-21"
changeImpact: "low"
---

# LLM-MODEL-CANDIDATES.md - Workers AI モデル候補比較

> **決定（2026-08-21・Futoshi）**: メタデータRAG / Text-to-SQL に使うモデルは **`@cf/qwen/qwen3-30b-a3b-fp8`** とする。
> ADR-002 が記載していた `@cf/meta/llama-3.1-8b-instruct-fp8-fast` からの変更。理由は §2。
> ARCHITECTURE.md §8・MASTER.md の技術スタック表への反映と ADR への追記は Issue [#118](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/118) の実装時に行う（親 Issue: [#121](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/121)）。

## 1. 背景

Step 3〜5（Issue #121）で LLM に担わせる仕事は「訪日観光客の質問文（日本語・英語ほか多言語）を構造化入力へ分解し、カタログ10件からデータセットを選定し、単一テーブルへの SELECT を生成する」こと。当初案の Llama 3.1 は**公式サポート8言語（en/de/fr/it/pt/hi/es/th）に日本語が入っておらず**、日本語理解が選定基準として不足していた。

## 2. 候補比較（価格は 2026-08-21 に公式ドキュメントで実測）

出典: <https://developers.cloudflare.com/workers-ai/platform/pricing/>

コスト列の前提: search 呼び出し ≈ 入力1,800/出力150トークン、aggregate 呼び出し ≈ 入力900/出力120トークン、旅程1本 = search 1回 + aggregate 4回。無料枠は 10,000 ニューロン/日。

| モデル | 日本語力 | 入力（neurons/M tok） | 出力（neurons/M tok） | ニューロン/プラン | 無料枠での目安 | 寸評 |
|---|---|---|---|---|---|---|
| `llama-3.1-8b-instruct-fp8-fast`（当初案） | △ 非公式 | 4,119 | 34,868 | ~45 | ~220プラン/日 | 基準。日本語は公式サポート外 |
| **`qwen3-30b-a3b-fp8`** ✅採用 | **◎** | 4,625 | 30,475 | **~45** | **~220プラン/日** | Qwen は CJK 学習が厚く日本語最強格。MoE（アクティブ3B）のため価格が 8B 並み。**日本語力を上げてコスト据え置き** |
| `gpt-oss-20b` | ○ | 18,182 | 27,273 | ~117 | ~85プラン/日 | 指示追従・JSON 出力が堅実。多言語は英語寄り |
| `gpt-oss-120b` | ○+ | 31,818 | 68,182 | ~216 | ~46プラン/日 | 候補中の総合力最強。品質で困ったときの上位互換 |
| `llama-3.3-70b-instruct-fp8-fast` | △ 非公式 | 26,668 | 204,805 | ~275 | ~36プラン/日 | 賢いが日本語は依然非公式・出力単価が高い |
| `gemma-3-12b-it` | ○（140言語） | 31,371 | 50,560 | ~150 | ~66プラン/日 | 多言語は広いが qwen3 への優位なし |
| `qwq-32b` | ◎ | 60,000 | 90,909 | ~330+ | — | 長考型の推論特化。レイテンシ・単価で不利。見送り |
| `qwen2.5-coder-32b-instruct` | ◎ | 60,000 | 90,909 | ~330+ | — | コード特化。SQL 生成のみへの用途別起用なら将来候補 |

## 3. 採用理由と留意点

**採用理由**:

1. 日本語（および中国語・韓国語などアジア圏言語）の理解が候補中で最も厚く、訪日観光客の質問分解という用途に合致する
2. ニューロン単価が当初案とほぼ同額（入力 4,625 vs 4,119 /M tok）。MoE 構造（総パラメータ30B・アクティブ3B）のため「賢くする＝高くなる」のトレードオフが成立しない稀な選択肢
3. 品質不足時の上位互換として `gpt-oss-120b`（約5倍・~46プラン/日）を控えに置ける

**留意点（実装時に実測確認 — Issue #118 の確認項目）**:

- JSON mode（`response_format`）の対応状況はモデルごとに癖がある。非対応でもパーサ側の寛容化で吸収する設計
- ニューロン試算は公表価格ベースの推定。AI Gateway ダッシュボードの実測で検算する
- モデル名は `worker/core/llm.ts` の定数1箇所。`LlmRequest.purpose` により将来「分解は qwen3・SQL 生成は coder 系」の用途別振り分けも interface 変更なしで可能

## Changelog

| 日付 | version | 変更 |
|---|---|---|
| 2026-08-21 | 1.0.0 | 新規作成。Workers AI テキスト生成モデル8候補の日本語力・価格比較と `qwen3-30b-a3b-fp8` 採用の決定を記録 |
