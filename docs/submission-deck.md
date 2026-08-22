---
title: "submission-deck"
version: "1.10.0"
status: "draft"
owner: "@fffokazaki"
created: "2026-08-21"
updated: "2026-08-22"
changeImpact: "medium"
---

<!-- markdownlint-disable MD013 MD024 MD025 -->

# 提出資料｜16:9・14枚構成

- 提出締切: **2026-08-23（日）17:00**（<https://form.jotform.com/261870604352051>）
- 形式: PowerPoint または PDF・16:9 横
- 添付: 画面キャプチャ **1600×900px** を1〜3点
- 登録: 利用オープンデータ 最低1件〜最大10件（データURL＋タイトル）
- 必須4項目: ①課題及び解決策 ②プロダクト ③利用オープンデータ ④チーム紹介

> **この原稿から PPTX を生成するビルダーは [`deck/`](../deck/) にある**（`cd deck && npm run build`）。本書を直したら `deck/build.js` 側も同期すること。`build.js` は冒頭コメントで参照している本書のバージョンを持っており、そこがズレていたら未同期のサインである。
>
> **First Stage の2分スライドとは別のデッキ**（[ROADMAP.md](07-project-management/ROADMAP.md) §4）。本書がフルバージョンで、[first-stage-presentation.md](first-stage-presentation.md) の8枚はここからの切り出し。スライド番号を書くときはどちらのデッキか明示すること。
>
> スライドの実体（PPTX / PDF）と動画は本リポジトリの管理外。本書は構成と文言の SSOT。

## 1. 設計方針

### 「答えられない」を物語の山に置く

出典が付くことを前半で見せてから、**付けられないときは答えない**（スライド8）に落とす。他チームが再現できない差別化はここにしかない。実装済みの `insufficient_granularity` 判定を実画面で見せる。

### 実装済みと構想を視覚的に区別する

このプロダクトは「根拠がなければ答えない」を掲げている。資料自身が根拠のない主張をすれば、その時点で主張が崩れる（[CLAUDE.md](../CLAUDE.md) 絶対ルール #1・#2）。全スライドで次の3層を見分けられる形にし、凡例をスライド4に置く。

| 層 | 定義 | 該当 |
| --- | --- | --- |
| **稼働中** | 本番URLで今動く | 旅のプロフィール入力・プラン生成・あなたへ・出典チップ・`gaps` 記録・D1（10データセット / 1,645スポット）・**`/mcp` のコア3操作公開**（[Issue #117](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/117)）・**Text-to-SQL による D1 実照会**（[Issue #119](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/119)）・**メタデータRAG による自然文の分解**（[Issue #120](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/120)） |
| **設計済み・未実装** | 仕様が文書で確定していて、コードがまだ無い | データ公開リクエストの都への提出・コンシェルジュの別リポジトリ切り出しと MIT での OSS 公開（[Issue #129](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/129)） |
| **デザイン構想** | 画面デザインのみ存在 | スキャン・周辺（`public/showcase/`） |

### 使う数字は3つに絞る

「9,600 ／ 1日200PV ／ 30分→3分」（[CONSTRAINTS.md](01-context/CONSTRAINTS.md) §7）。うち「30分→3分」は、**30分＝開発メンバーが初めてカタログを人手で探した際の体験に基づく目安、3分＝本アプリの操作一巡（条件入力〜出典付きルート表示）の目安**として提示する（生成応答は本番で押下から約13秒後に表示済みを確認・2026-08-22・1回計測。操作一巡の通し計測は行っていない）。統制された比較計測ではないため「実測30分」等の断定表記はしない（[PROJECT.md](01-context/PROJECT.md) §8・[Issue #130](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/130)）。

## 2. スライド構成（14枚）

| # | 必須項目 | 内容 | 素材・注記 |
| --- | --- | --- | --- |
| 1 | — | 表紙「9,600のオープンデータを、旅の相棒に。」／旅コンシェルジュTOKYO／チームshiwata | — |
| 2 | ① | 課題A：9,600データセットが公開されている一方、カタログの閲覧は1日約200PV。原因は「1データ＝1アプリ」という活用の型 | — |
| 3 | ① | 課題B：訪日観光客は文化・マナーの壁に当たっても、公共データに到達する手段を持たない | — |
| 4 | ① | 解決策：会話から9,600件に到達する入口をつくる。**根拠がなければ答えない**を設計の中心に置く | **3層の凡例をここに置く** |
| 5 | ② | プロダクト全体像：5画面のうち3画面が実データ接続で稼働。残り2画面はデザイン構想 | `public/showcase/` の5画面図＋層バッジ |
| 6 | ② | 動く画面①：旅のプロフィール → プラン生成。全提案に出典チップが付く | **キャプチャ候補1** |
| 7 | ② | 動く画面②：あなたへ。興味チップ → 出典つきレコメンド | **キャプチャ候補2** |
| 8 | ② | **【山】答えられないときは、答えません**：ラーメン → 粒度不足と判定し理由を返す | **キャプチャ候補3**。文言は §3 で固定 |
| 9 | ② | 仕組み：React → `/api/*` コア3操作（`search_datasets` / `aggregate_dataset` / `get_provenance`）→ D1。**技術的特異点をパイプラインで見せる：自然文 → メタデータRAGでデータセット特定 → Text-to-SQLでD1実照会 → 出典強制（根拠がなければ答えない）。いずれも稼働中**（[Issue #117](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/117) / [#119](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/119) / [#120](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/120)）。同じコア3操作を `/mcp` でも公開。出典強制により CC BY 4.0 の表示義務をアーキテクチャで自動達成 | 図中で稼働中／設計済みを区別 |
| 10 | ② | データが育つループ：未回答を `gaps` に記録（本番D1で実際に動作）→ 分類 → 都への公開リクエスト（提出プロセスは構想） | — |
| 11 | ② | 基盤の開放：コンシェルジュは MCP サーバーとして開放予定。**別リポジトリへ切り出し MIT ライセンスで OSS 公開予定**（[Issue #129](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/129)）。旅行アプリは「最初のクライアント」にすぎない | **OSS 化の対象はコンシェルジュのみ**（旅行アプリ `src/` は対象外）。データ側 CC BY 4.0 とコード側 MIT を**別物として並記** |
| 12 | ③ | 利用オープンデータ10件：タイトル・提供元・役割・ライセンス・カタログURL | [DATABASE.md](02-design/DATABASE.md) §2 の確定表をそのまま |
| 13 | ① | インパクト／KPI：探索30分→3分（体験・操作一巡に基づく目安）、観光の分散、都政への還元 | 「30分は初めてカタログを人手で探した開発メンバーの体験に基づく目安、3分はアプリ操作一巡の目安」と注記（「実測」とは書かない。§1・[Issue #130](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/130)） |
| 14 | ④ | チーム紹介（チームshiwata・3名）＋**開発スタイル（AI仕様駆動開発）** | §4 |

## 3. スライド8の文言（固定）

このスライドは「主張しすぎない」ことが価値の源泉なので、言い回しを先に確定させる。

- **見出し**: 答えられないときは、答えません
- **キャプション**: このケースでは **粒度不足** と判定し、理由とともに返します
- **実測の並置**: 東京都内の飲食店バリアフリー情報 210件中、ラーメン店は3件（板橋区・武蔵野市・青梅市）。代表エリアには0件

### 使ってはいけない表現

- 「データが無いものには答えません」のような**一般化した断定**
- 「〇〇という切り口で検証済み」という**広い主張**

検証済みなのは、このラーメンの粒度不足の実測（[DATABASE.md](02-design/DATABASE.md)「既知のデータ欠損」）と、渋谷のカタログに観光・文化施設データが1件も無いことだけ。それ以上を主張すると、この資料が回避しようとしている過剰主張を資料自身がやることになる。

## 4. チーム紹介（スライド14）

チームshiwata・3名。役割分担と開発スタイルを載せる。

| 氏名 | 役割 |
| --- | --- |
| shiwata | 発起人／プレゼンター |
| sho gamoh | 本サービスの発案者／フロントエンド担当 |
| フトシ | オープンデータ・コンシェルジュ発案者／バックエンド・クラウド・AI駆動開発支援 |

**開発スタイル（1行で添える）**: 仕様書（`docs/`）を SSOT に、**Claude Code / Codex による AI 仕様駆動開発でフルオート実装**。仕様→実装→検証のループを AI が回す。

## 5. 提出前チェックリスト

- [ ] **必須4項目の充足** — ①②③④が全て資料内に存在することを指差し確認
- [x] **スライド6/7/8のキャプチャを3枚とも撮り直した**（2026-08-22・現本番URL `tokyo-odh-091`・480×874）。当初はスライド6のみの想定だったが、**7/8 も変わっていた** ―― [Issue #192](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/192) が「答えられなかった問いは記録されます。…」の注記を未回答表示の脇に追加しており、旧キャプチャにはこれが写っていない。操作条件は従来どおり、興味チップのみ・自由文は空、スライド6はラーメンを外した「文化・家族向け・自然」、スライド7は文化チップ、スライド8はラーメンチップ
- [x] **スライド6/7のキャプチャは画面上部のみ**。#188 のイラストと #192 の注記で内容が縦に伸び、フレーム全体が 480×1113（プラン）/ 480×874→1550（あなたへ）になった。全高を貼ると資料の枠（比率 0.549）で幅 1.6〜2.2in の短冊になり本文が 2.8pt 相当まで潰れるため、**比率を保って上部を表示する**方を採った。タブバーが写らなくなったので、6/7 のキャプションからタブの断り書きを外した（`SCROLL_CAPTION`）。スライド8は 480×874 に収まりタブバーまで写るため従来の `TAB_CAPTION` のまま
- [ ] **タブバーの見え方を確認** — スキャン・周辺は `AppTabs.tsx` の `INACTIVE_TABS` で disabled 表示。キャプチャだけを見る審査員はスライド4の凡例を見ないため、「未完成に見える」ならキャプチャ内かキャプション側に「スキャン・周辺はデザイン構想」と明示する。**見え方の確認は済み**（2026-08-22・薄いグレーのラベルで「壊れている」ようには見えないが、キャプチャ単体では「まだ作っていない」と読める）。**キャプション側に置く方針**で、記載は資料作成（[Issue #127](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/127)）で行うため未チェックのまま残す
- [ ] **カタログURL の生存確認** — 確定10件を提出直前に再確認（[DATABASE.md](02-design/DATABASE.md) §3）
- [ ] **スライド11 の OSS 記述の確認** — OSS 化の対象は**コンシェルジュ（`worker/` `shared/` `scripts/` `migrations/`）のみ**で、旅行アプリ `src/` は含まない。切り出しの実施は提出後〜Final Stage（[Issue #129](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/129)）のため、提出資料には「公開予定」と書く
- [ ] **著作権ルール** — BGM なし／『いらすとや』は1資料20個まで／地図を使う場合は帰属表示を隠さない／引用は出典明記（[CONSTRAINTS.md](01-context/CONSTRAINTS.md) §3）
- [ ] **提出後ただちに収録枠を予約**（30分単位・早い者順）

## 参照

- [first-stage-presentation.md](first-stage-presentation.md) — 本書から切り出す2分版8枚
- [proposal-summary.md](proposal-summary.md) — 企画概要 v1.0
- [DATABASE.md](02-design/DATABASE.md) §2 — 利用オープンデータ確定10件
- [CONSTRAINTS.md](01-context/CONSTRAINTS.md) — 提出規定・著作権ルール
- [TASKS.md](07-project-management/TASKS.md) — 提出物タスクの進捗

## Changelog

### [1.10.0] - 2026-08-22

#### 修正

- 「必須4項目」が「必颈4項目」に壊れていた3箇所を修正（[Issue #211](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/211)）。v1.9.0 の編集で入った置換ミス。提出要件の固定語であり、提出前チェックリストの項目名でもあった

#### 変更

- **v1.9.0 で未実施だった `deck/build.js` への同期を実施**（[Issue #211](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/211)）:
  - スライド9を「React／コア3操作／D1」の3層から、**自然文 → メタデータRAG → Text-to-SQL → 出典強制の4段パイプライン**へ。層と `/mcp` 公開は1枚のカードへ集約（[Issue #117](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/117) / [#119](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/119) / [#120](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/120)）
  - スライド14に開発スタイル（AI 仕様駆動開発）の帯を追加
- **キャプチャ3枚を撮り直した**（§5 参照）。スライド6/7は画面上部のみの表示に変え、キャプションをタブバーに言及しない `SCROLL_CAPTION` へ分離した

### [1.9.0] - 2026-08-22

#### 変更

- スライド9に技術的特異点のパイプライン（自然文 → メタデータRAGでデータセット特定 → Text-to-SQLでD1実照会 → 出典強制、同じコア3操作を `/mcp` でも公開）の明記を追加。いずれも稼働中の実装のみを記載（[Issue #117](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/117) / [#119](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/119) / [#120](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/120)）
- スライド14（§4）に開発スタイルを追加。仕様書（`docs/`）を SSOT とした Claude Code / Codex による AI 仕様駆動開発（フルオート実装）をチーム紹介でアピールする
- **`deck/build.js` への同期は未実施**。スライド9・14の文言変更を `build.js` 側にも反映すること

### [1.8.0] - 2026-08-22

#### 追加

- 冒頭に PPTX ビルダー [`deck/`](../deck/) への参照を追加（[PR #202](https://github.com/fffokazaki/tabi-concierge-tokyo/pull/202)）。ビルダーはセッション固有の一時領域にしか無く、原稿から辿れなかった。併せて `deck/build.js` 側を本書へ同期した:
  - スライド13の「30分→3分」を v1.6.0 の確定文言（体験・操作一巡に基づく目安）へ差し替え。v1.3.0 当時の「企画時の推定値・未実測」が残っていた
  - スライド12にデータセットIDの列を追加し、カタログURL をテンプレートから解決可能な形へ。件数の説明を実データに合わせて修正（列の合計 1,667 と注記の「合計 1,645」が 22 件ズレていた。差は No.9 の統計表で、`spots` へは取り込んでいない）
  - スライド14の URL を移設前の `opendata-002` から現行の `tokyo-odh-091` へ差し替え（旧アカウントのデプロイは提出までのロールバック先・[DEPLOYMENT.md](05-operations/DEPLOYMENT.md)）
- **`deck/img/deck-plan.png` は Issue #188 の反映後の画面ではない。** 直上の 1.7.0 が定めたスライド6の撮り直しは、本書のチェックリストだけでなく `deck/img/deck-plan.png` の差し替えも意味する（`build.js` はこのファイル名を固定参照しているため、同じ名前で上書きすれば足りる）

### [1.7.0] - 2026-08-22

#### 変更

- Issue #188 でスライド6のプラン画面にカテゴリイラストが加わるため、旧キャプチャを不一致として撮り直し必須へ変更。対象外のスライド7/8は取得済みのまま維持

### [1.6.0] - 2026-08-22

#### 変更

- §1「使う数字は3つに絞る」とスライド13の「30分→3分」の扱いを確定（[Issue #130](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/130)）。「企画時の推定値」から「30分＝開発メンバーの初回探索体験に基づく目安・3分＝操作一巡の目安（生成応答は本番で押下から約13秒後に表示済みを確認）」へ根拠を差し替え。「実測」と表記しない方針は維持

### [1.5.0] - 2026-08-22

#### 変更

- §5 キャプチャ行の判断を確定（[Issue #172](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/172)）。撮り直し不要 — 新本番で3画面とも同一操作を再現し、表示内容の一致を実測した。一致の前提が [Issue #174](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/174) の行選定修正であることも明記

### [1.4.0] - 2026-08-22

#### 変更

- §5 のキャプチャ行を事実に合わせて訂正。**取得元は移設前の旧URL（Version `712c2277`）**であることを明記し、画像自体の差し替えが不要な根拠（アドレスバー非写り込み・取得後の変更はいずれも正常系の表示を変えない）を残した。撮り直しの要否は [Issue #172](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/172) へ切り出した

### [1.3.0] - 2026-08-22

#### 変更

- §1 の3層表を実装の現況に合わせた。**MCP サーバー公開と Text-to-SQL を「設計済み・未実装」から「稼働中」へ移した** — `/mcp` は本番で `tools/list` が3ツールを返し（2026-08-22 実測）、`aggregate_dataset` は D1 実照会で応答する（同日実測。[Issue #117](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/117) / [#119](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/119) / [#120](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/120) はいずれもマージ・デプロイ済み）。本書 v1.0 は #117 のマージ当日に書かれており、その時点の状態のまま据え置かれていた
- 「設計済み・未実装」には、データ公開リクエストの都への提出と、コンシェルジュの別リポジトリ切り出し・MIT 公開（[Issue #129](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/129)）が残る

### [1.2.0] - 2026-08-22

#### 変更

- §5 チェックリストの「キャプチャ3点」を取得済みに更新（[Issue #126](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/126)）。**撮るときの操作条件**（興味チップのみ・自由文は空／スライド6はラーメンを外す）を根拠つきで明記した。ラーメンを入れたままだとスライド6に未回答バナーが出て、§2 が定めた「出典を見せてから答えられないへ落とす」順序が崩れる
- §5「タブバーの見え方を確認」に、確認の結果（薄いグレーのラベルで壊れて見えはしないが、キャプチャ単体では未完成と読める）と、キャプション側に明示する方針を追記した。記載自体は [Issue #127](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/127) で行うため未チェックのまま残している

### [1.1.0] - 2026-08-21

#### 変更

- スライド11 の OSS 記述を具体化。「ソースコードを MIT で公開予定」から「**コンシェルジュを別リポジトリへ切り出して** MIT で公開予定」へ改め、OSS 化の対象がコンシェルジュのみ（旅行アプリ `src/` は対象外）であることを明記した（[Issue #129](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/129)）
- §5 チェックリストの「`LICENSE` の設置」を、切り出し時期（提出後〜Final Stage）に合わせて「スライド11 の OSS 記述の確認」へ置き換えた

### [1.0.0] - 2026-08-21

#### 追加

- 初版作成。提出資料（16:9・必須4項目）の14枚構成、3層区別ルール、スライド8の固定文言、チーム紹介、提出前チェックリストを定義した
