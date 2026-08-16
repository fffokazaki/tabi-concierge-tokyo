-- 旅コンシェルジュTOKYO — 初期スキーマ
--
-- 用途は ADR-007 のとおり2つに限定する:
--   1. オープンデータの格納（Text-to-SQL の実行基盤）
--   2. 未回答ログ（gaps）
--
-- 設計の芯は「出典を持たない行を作れないようにする」こと。
-- DOMAIN.md §8 の不変条件1（回答は必ず1件以上の出典を持つ）を、
-- クエリ側の規約ではなくスキーマ制約として担保する。

-- ---------------------------------------------------------------------------
-- datasets — 出典の源。DATABASE.md §2 の確定10件と 1:1 で対応する
-- ---------------------------------------------------------------------------
CREATE TABLE datasets (
  -- カタログのデータセットID（例 t131067d0000000251）。CKAN の name と 1:1
  id               TEXT    PRIMARY KEY,
  -- DATABASE.md §2 の No.
  no               INTEGER NOT NULL UNIQUE,
  title            TEXT    NOT NULL,
  publisher        TEXT    NOT NULL,
  -- CC BY 4.0。出典表示の義務を果たすため回答に必ず添える
  license          TEXT    NOT NULL,
  catalog_url      TEXT    NOT NULL,
  -- CSV 実体のURL。カタログの format は自己申告のため、実体を取得して確認済み
  resource_url     TEXT    NOT NULL,
  -- スナップショットを取得した日。カタログ最新版との差異を明示するために必須
  retrieved_at     TEXT    NOT NULL,
  update_frequency TEXT    NOT NULL,
  -- 原本の行数（取り込み結果の突き合わせ用）
  row_count        INTEGER NOT NULL,
  -- spots へ取り込んだか。統計表（クロス集計）は 0 で、出典としてのみ存在する
  has_spots        INTEGER NOT NULL CHECK (has_spots IN (0, 1))
);

-- ---------------------------------------------------------------------------
-- spots — 地物（施設・史跡・停留所・店舗）。10件のうち施設一覧型9件をここへ集約する
-- ---------------------------------------------------------------------------
CREATE TABLE spots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 出典。NOT NULL + 外部キーにより「出典のないスポット」は物理的に作れない
  dataset_id TEXT    NOT NULL REFERENCES datasets(id),

  name       TEXT    NOT NULL,

  -- 分類。API_REQUIREMENTS.md の search_datasets({ category }) に対応する。
  -- 値は原データ由来の日本語（"神社" 等）。システムが定義する列挙値ではないため英語化しない
  category   TEXT    NOT NULL,

  -- 代表エリア。API_REQUIREMENTS.md の search_datasets({ area: "上野" }) に対応する。
  -- 住所の部分一致では代表施設を取りこぼすため、取り込み時に町字マッピングで確定させる
  -- （scripts/lib/area.ts に判断の根拠を記録）。代表エリア外は NULL
  area       TEXT,

  address    TEXT,

  -- 緯度経度。台東区の独自形式は X=経度・Y=緯度 で自治体標準と並びが逆のため、
  -- 取り違えを CHECK で弾く。範囲は東京都本土（島嶼部は対象外）
  lat        REAL    CHECK (lat IS NULL OR (lat BETWEEN 35.4 AND 35.9)),
  lon        REAL    CHECK (lon IS NULL OR (lon BETWEEN 138.9 AND 139.95)),

  -- 旅程に出せる一文の材料（営業時間・説明・多言語対応の有無など）
  note       TEXT,

  -- 原本CSVの行番号（1始まり・ヘッダを除く）。出典を行単位まで辿れるようにする
  source_row INTEGER NOT NULL
);

CREATE INDEX idx_spots_area     ON spots (area);
CREATE INDEX idx_spots_category ON spots (category);
CREATE INDEX idx_spots_dataset  ON spots (dataset_id);
-- エリア×分類はプラン生成の主経路（「上野の神社」等）
CREATE INDEX idx_spots_area_cat ON spots (area, category);

-- ---------------------------------------------------------------------------
-- gaps — 未回答ログ。DOMAIN.md §8 不変条件4「未回答は必ず理由分類され、記録される」
-- ---------------------------------------------------------------------------
CREATE TABLE gaps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 答えられなかった質問
  question   TEXT    NOT NULL,
  -- 絞り込み条件（あれば）。どのエリア・分類のデータが足りないかを集計するため
  area       TEXT,
  category   TEXT,
  -- 理由分類。値は API_REQUIREMENTS.md の unanswered.reason と同一の英語列挙。
  -- DOMAIN.md §11「コード上の識別子は英語」に従う
  reason     TEXT    NOT NULL CHECK (
               reason IN ('data_not_published', 'insufficient_granularity', 'out_of_area', 'other')
             ),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_gaps_reason ON gaps (reason);
CREATE INDEX idx_gaps_area   ON gaps (area);
