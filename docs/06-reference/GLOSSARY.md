---
title: "GLOSSARY"
version: "1.0.0"
status: "draft"
owner: "@fffokazaki"
created: "2026-08-15"
updated: "2026-08-17"
changeImpact: "low"
---

# GLOSSARY.md - 用語集

> 「A」〜「Z」の節は**一般的な技術用語の辞書**であり、本プロジェクトでの採用を意味しない。本プロジェクトが実際に使う技術は [MASTER.md](../MASTER.md)「技術スタック」と [ARCHITECTURE.md](../02-design/ARCHITECTURE.md) §8 が SSOT。固有の用語は末尾の「プロジェクト固有用語」を参照。

## A

### API (Application Programming Interface)

アプリケーション間でデータや機能を共有するためのインターフェース。本プロジェクトの外部インターフェースは `/api/*`（JSON、[API.md](../02-design/API.md)）と `/mcp`（MCP ツール、[MCP.md](../02-design/MCP.md)）の二面（ADR-008）。REST 風の汎用 API や GraphQL は採用しない。

### API Gateway

マイクロサービスへのリクエストを一元管理し、ルーティング、認証、レート制限などを行うコンポーネント。

### Async/Await

JavaScriptの非同期処理を同期的に記述するための構文。Promiseベースの非同期処理を簡潔に記述できる。

### Authentication (認証)

ユーザーが誰であるかを確認するプロセス。本プロジェクトの POC では利用者認証を実装しない（[CONSTRAINTS.md](../01-context/CONSTRAINTS.md) §5）。

### Authorization (認可)

認証されたユーザーが特定のリソースやアクションにアクセスする権限があるかを確認するプロセス。

## B

### Backend

クライアントから見えないサーバー側の処理を担当する部分。データベース処理、ビジネスロジック、APIの提供を行う。

### Blue-Green Deployment

本番環境を2つ（BlueとGreen）用意し、新バージョンを片方にデプロイしてから切り替えるデプロイメント手法。

### Business Logic

アプリケーションの中核となるビジネスルールや処理。ドメイン層に実装される。

## C

### CI/CD (Continuous Integration/Continuous Deployment)

継続的インテグレーション/継続的デプロイメント。コードの変更を自動的にビルド、テスト、デプロイするプロセス。

### Cache

頻繁にアクセスされるデータを高速なストレージに一時保存する仕組み。Redis等を使用。

### Container

アプリケーションとその依存関係をパッケージ化した実行環境。本プロジェクトはサーバーレス（Cloudflare）のためコンテナを使用しない。

### CORS (Cross-Origin Resource Sharing)

異なるオリジン間でのリソース共有を可能にするメカニズム。

### CRUD

Create（作成）、Read（読み取り）、Update（更新）、Delete（削除）の基本的なデータ操作。

## D

### DAO (Data Access Object)

データベースへのアクセスを抽象化するデザインパターン。

### DDD (Domain-Driven Design)

ドメイン駆動設計。ビジネスドメインを中心にソフトウェアを設計する手法。

### DTO (Data Transfer Object)

レイヤー間でデータを転送するためのオブジェクト。

### Database Migration

データベーススキーマの変更を管理・実行するプロセス。

### Dependency Injection

依存性の注入。オブジェクトの依存関係を外部から注入するデザインパターン。

### Docker

コンテナ化技術。アプリケーションを隔離された環境で実行する。

## E

### Entity

ビジネスドメインの中核となるオブジェクト。一意の識別子を持つ。

### Environment Variables

環境変数。設定値を外部から注入するために使用。

### Event-Driven Architecture

イベントの発生と処理を中心にシステムを構築するアーキテクチャパターン。

### Exception Handling

例外処理。エラーが発生した際の処理フロー。

## F

### Factory Pattern

オブジェクトの生成を専門に行うデザインパターン。

### Frontend

ユーザーが直接操作するクライアント側のインターフェース。

### Function as a Service (FaaS)

サーバーレスコンピューティングの一形態。AWS Lambda等。

## G

### Git

分散型バージョン管理システム。

### GraphQL

Facebookが開発したAPIクエリ言語。クライアントが必要なデータを指定して取得できる。

### gRPC

Googleが開発した高性能なRPCフレームワーク。

## H

### Health Check

システムの正常性を確認するエンドポイントまたはプロセス。

### Horizontal Scaling

水平スケーリング。サーバーの台数を増やすことで処理能力を向上させる。

### HTTP Status Code

HTTPレスポンスの状態を示す3桁の数字コード。

## I

### IaC (Infrastructure as Code)

インフラストラクチャをコードで管理する手法。Terraform等を使用。

### Idempotency

冪等性。同じ操作を複数回実行しても結果が変わらない性質。

### Immutable

不変。一度作成されたら変更できないオブジェクトの性質。

### Integration Test

統合テスト。複数のコンポーネントを組み合わせて動作を確認するテスト。

## J

### JWT (JSON Web Token)

JSONベースの認証トークン。ステートレスな認証に使用。

### JSON (JavaScript Object Notation)

データ交換フォーマット。人間にも機械にも読みやすい。

## K

### Kubernetes (K8s)

コンテナオーケストレーションプラットフォーム。

### Key-Value Store

キーと値のペアでデータを保存するNoSQLデータベース。Redis等。

## L

### Load Balancer

負荷分散装置。複数のサーバーにリクエストを分配する。

### Logging

ログ記録。システムの動作やエラーを記録する。

### Loose Coupling

疎結合。コンポーネント間の依存関係を最小限にする設計。

## M

### Microservices

マイクロサービス。小さな独立したサービスの集合でシステムを構成するアーキテクチャ。

### Middleware

リクエストとレスポンスの間で処理を行うソフトウェアコンポーネント。

### Mock

テスト用の模擬オブジェクト。

### Monorepo

単一のリポジトリで複数のプロジェクトを管理する手法。

### MTBF (Mean Time Between Failures)

平均故障間隔。システムの信頼性指標。

### MTTR (Mean Time To Recovery)

平均復旧時間。障害からの復旧にかかる平均時間。

## N

### NoSQL

非リレーショナルデータベース。MongoDB、DynamoDB等。

### Node.js

JavaScriptランタイム環境。サーバーサイドJavaScriptの実行環境。

## O

### OAuth 2.0

認可のための業界標準プロトコル。

### ORM (Object-Relational Mapping)

オブジェクトとリレーショナルデータベースをマッピングする技術。

### Orchestration

複数のサービスやタスクを調整・管理すること。

## P

### PaaS (Platform as a Service)

プラットフォームサービス。Heroku、Google App Engine等。

### Pagination

ページネーション。大量のデータを複数ページに分割して表示する技術。

### Payload

送信されるデータの本体部分。

### Performance Testing

パフォーマンステスト。システムの性能を測定するテスト。

### Proxy

プロキシ。クライアントとサーバーの間で中継を行うサーバー。

## Q

### Query

クエリ。データベースへの問い合わせ。

### Queue

キュー。FIFO（先入れ先出し）でデータを処理するデータ構造。

## R

### RDBMS (Relational Database Management System)

リレーショナルデータベース管理システム。PostgreSQL、MySQL等。

### REST (Representational State Transfer)

Webサービスの設計原則。HTTPメソッドを使用してリソースを操作する。

### Repository Pattern

データアクセスロジックを抽象化するデザインパターン。

### Rollback

ロールバック。変更を元の状態に戻すこと。

### RTO (Recovery Time Objective)

目標復旧時間。障害発生から復旧までの目標時間。

### RPO (Recovery Point Objective)

目標復旧時点。どの時点までのデータを復旧するかの目標。

## S

### SaaS (Software as a Service)

ソフトウェアサービス。クラウド上で提供されるソフトウェア。

### Scalability

スケーラビリティ。システムの拡張性。

### Schema

スキーマ。データベースやAPIの構造定義。

### SDK (Software Development Kit)

ソフトウェア開発キット。開発に必要なツールのセット。

### Service Mesh

サービスメッシュ。マイクロサービス間の通信を管理する基盤。

### Singleton Pattern

シングルトンパターン。インスタンスを1つだけ生成するデザインパターン。

### SLA (Service Level Agreement)

サービスレベル合意。サービスの品質保証。

### SLI (Service Level Indicator)

サービスレベル指標。サービスの品質を測定する指標。

### SLO (Service Level Objective)

サービスレベル目標。SLIの目標値。

### SQL (Structured Query Language)

構造化問い合わせ言語。リレーショナルデータベースの操作言語。

### SSL/TLS

暗号化通信プロトコル。

### Stub

スタブ。テスト用の簡易実装。

## T

### TDD (Test-Driven Development)

テスト駆動開発。テストを先に書いてから実装する開発手法。

### Transaction

トランザクション。一連の処理をまとめた単位。

### TypeScript

JavaScriptに型システムを追加したプログラミング言語。

## U

### Unit Test

単体テスト。個々の機能を独立してテストする。

### UUID (Universally Unique Identifier)

汎用一意識別子。グローバルに一意なID。

## V

### Validation

バリデーション。入力値の妥当性検証。

### Value Object

値オブジェクト。DDDにおける不変のオブジェクト。

### Version Control

バージョン管理。コードの変更履歴を管理する。

### Vertical Scaling

垂直スケーリング。サーバーのスペックを向上させる。

### Virtual Machine

仮想マシン。物理マシン上で動作する仮想的なコンピュータ。

## W

### Webhook

Webフック。イベント発生時に外部サービスに通知する仕組み。

### WebSocket

双方向通信を実現するプロトコル。

### Worker

ワーカー。バックグラウンドでタスクを処理するプロセス。

## X

### XSS (Cross-Site Scripting)

クロスサイトスクリプティング。Webアプリケーションの脆弱性の一種。

### XML (eXtensible Markup Language)

拡張可能なマークアップ言語。

## Y

### YAML (YAML Ain't Markup Language)

設定ファイルによく使用される人間に読みやすいデータ形式。

## Z

### Zero Downtime Deployment

無停止デプロイメント。サービスを停止せずに新バージョンをデプロイする。

### Zero Trust Security

ゼロトラストセキュリティ。内部ネットワークも信頼しないセキュリティモデル。

---

## プロジェクト固有用語

### 旅コンシェルジュTOKYO（Tabi Concierge Tokyo）

訪日観光客向けの AI 旅行ガイドアプリ。本プロジェクトのフロントエンドであり、プロフィール／プラン／スキャン／周辺／あなたへ の5機能を提供する。オープンデータ・コンシェルジュの「最初のクライアント」という位置づけを持つ。

### オープンデータ・コンシェルジュ

バックエンドの総称。東京都オープンデータカタログ約9,600データセットから答えを組み立て、MCP サーバーとしてツールを公開する。旅行アプリに従属せず、他のクライアントからも利用できる基盤として設計する。

### MCP（Model Context Protocol）

AI クライアントがツールを選んで呼ぶためのプロトコル。本プロジェクトでは基盤開放面 `/mcp` として最小3ツール（データセット検索・集計・出典取得）を公開する（詳細は [MCP.md](../02-design/MCP.md)、スキーマは [API.md](../02-design/API.md) §3）。フロントエンド ⇄ バックエンドの接続には使わない — React アプリは `/api/*`（JSON）を呼ぶ（ADR-008）。

### メタデータRAG

データセット本体ではなく、約9,600件の**メタデータ**を検索対象とする RAG。質問に答えられるデータセットを特定する役割を担う。

### Text-to-SQL

自然言語の集計意図を SQL に変換し、特定したデータセットに対してその場で集計する技術。実行したクエリは出典の一部として回答に添える。

### 出典強制（Provenance by Design）

全回答にデータセットリンクと実行クエリを構造的に付与する設計方針。根拠がなければ回答を生成せず「ありません」と答える。CC BY 4.0 の表示義務をアーキテクチャレベルで自動的に満たす手段でもある。

### 未回答（Gap）

根拠となるオープンデータが見つからず答えられなかった質問。エラーではなく、改善還元コンテキストへの正常な入力として扱う。

### データ公開リクエスト

未回答を理由分類して集約した、東京都・GovTech東京への公開／更新提案。「使うほどデータが育つ」自己改善ループの中核。

### あるべきオープンデータの提案エンジン

データ公開リクエストを四半期ごとにレポート化し、都へ提出する仕組み。サービスを「データを使うアプリ」から「オープンデータ政策の改善センサー」へ変える。

### 1データ＝1アプリ

「誰かがアプリを作ったデータしか利用者に届かない」という現在のオープンデータ活用の型を指す本プロジェクトの問題提起。約9,600データセットに対しカタログ閲覧が1日約200PVという断絶の原因と位置づけている。

### CC BY 4.0

東京都オープンデータカタログ掲載データのライセンス。出典表示のみで、加工・組込・商用を含む二次利用が可能。カタログ外の「公表されただけのデータ」はこの対象外で二次利用できない（[CONSTRAINTS.md](../01-context/CONSTRAINTS.md) §3）。

### 東京都オープンデータカタログ

都庁全局と62区市町村のオープンデータを集約したカタログサイト（<https://catalog.data.metro.tokyo.lg.jp/>）。本プロジェクトが扱うデータの唯一の出所。

### workerd

Cloudflare Workers を動かしているランタイム。**Node.js ではない**。同じ V8 エンジンを使うため JS の文法・標準ライブラリは共通だが、周辺 API は Web 標準（`fetch` / `Request` / `Response` / `WebCrypto`）＋ Cloudflare のバインディングで構成され、`fs` や `net` は存在しない。ローカル開発（`wrangler dev` / `@cloudflare/vite-plugin`）でも同じ workerd が動くため、本番と挙動が一致する。

### compatibility_date

`wrangler.jsonc` に書く日付で、**workerd の挙動を固定する実質的なバージョン指定**。この日付より後に入った破壊的変更は適用されない。workerd 自体のバージョン（`1.YYYYMMDD.N` 形式）はアプリ側で選べない。

### nodejs_compat

`compatibility_flags` に指定すると、workerd 上で Node.js 組み込みモジュールの一部（`node:crypto` / `node:buffer` / `node:stream` / `process.env` / `path` など）が使えるようになるフラグ。**すべての Node API が使えるようになるわけではない**。

### dc-runtime

デザインプロトタイプ（`public/showcase/`）が使っている宣言的コンポーネント runtime（`<x-dc>` / `<sc-if>` / `{{ }}` テンプレート ＋ `support.js`）。**React ではなく、API 呼び出しを組み込めない**。本番アプリの実装には使わない。

### showcase

`public/showcase/` に保全したデザインプロトタイプと、その公開 URL（`/showcase/`）。デザインの正典であり、**動作するアプリではない**。

### 代表エリア

POC の対象として絞り込んだエリア（渋谷・上野・浅草など）。全都域対応はスコープ外（ADR-004）。

---

## 略語一覧

| 略語  | 正式名称                                     | 説明                               |
| ----- | -------------------------------------------- | ---------------------------------- |
| API   | Application Programming Interface            | アプリケーション間インターフェース |
| CI/CD | Continuous Integration/Continuous Deployment | 継続的統合/デプロイメント          |
| CRUD  | Create, Read, Update, Delete                 | 基本的なデータ操作                 |
| DDD   | Domain-Driven Design                         | ドメイン駆動設計                   |
| DTO   | Data Transfer Object                         | データ転送オブジェクト             |
| HTTP  | HyperText Transfer Protocol                  | Web通信プロトコル                  |
| JSON  | JavaScript Object Notation                   | データ交換フォーマット             |
| JWT   | JSON Web Token                               | 認証トークン                       |
| ORM   | Object-Relational Mapping                    | O/Rマッピング                      |
| REST  | Representational State Transfer              | Webサービス設計原則                |
| SQL   | Structured Query Language                    | データベース問い合わせ言語         |
| UUID  | Universally Unique Identifier                | 汎用一意識別子                     |
| XML   | eXtensible Markup Language                   | 拡張可能マークアップ言語           |
| XSS   | Cross-Site Scripting                         | クロスサイトスクリプティング       |

## Changelog

### [1.0.0] - 2026-08-17

#### 追加

- frontmatter（`title` / `version` / `status` / `owner` / `created` / `updated` / `changeImpact`）を導入し、コア文書と書式を揃えた。本文の変更はない
- `created` は Git の初回コミット日（実測）。この版より前の変更履歴は Git ログを参照する
