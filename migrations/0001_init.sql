-- armap-v2 のテーブル定義（設計書 5.1）
-- 適用: npx wrangler d1 migrations apply armap-v2 --remote

-- 棟
CREATE TABLE buildings (
  id            TEXT PRIMARY KEY,          -- 施設台帳の棟番号（例: '1', '28'）
  name          TEXT NOT NULL,             -- 来校者向けの名前
  drawing_name  TEXT NOT NULL,             -- 図面上の名前
  floors        INTEGER NOT NULL,          -- 階数
  outline       TEXT NOT NULL,             -- 外形 [{"x":..,"y":..},...]（JSON文字列・全体座標m）
  label_x       REAL,                      -- 棟名の表示位置
  label_y       REAL,
  origin_x      REAL,                      -- ローカル座標の原点（全体座標）
  origin_y      REAL,
  rotation      INTEGER CHECK (rotation IN (0, 90, 180, 270)),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    TEXT
);

-- ノード（経路上の地点）
CREATE TABLE nodes (
  id            TEXT PRIMARY KEY,          -- 例: 'B1-1F-D-jimu'
  building_id   TEXT REFERENCES buildings(id),  -- 屋外は NULL
  floor         INTEGER NOT NULL DEFAULT 1,
  kind          TEXT NOT NULL CHECK (kind IN ('corridor', 'door', 'entrance', 'stairs', 'outdoor')),
  u             REAL,                      -- 棟のローカル座標（local）
  v             REAL,
  x             REAL,                      -- 全体座標（pos）
  y             REAL,
  landmark      TEXT,                      -- 目印の説明
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    TEXT
);

-- 辺（ノード同士のつながり）
CREATE TABLE edges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id       TEXT NOT NULL REFERENCES nodes(id),
  to_id         TEXT NOT NULL REFERENCES nodes(id),
  kind          TEXT NOT NULL DEFAULT 'walk' CHECK (kind IN ('walk', 'stairs', 'bridge')),
  oneway        INTEGER NOT NULL DEFAULT 0,
  closed        INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    TEXT,
  UNIQUE (from_id, to_id)
);

-- 部屋（目的地）
CREATE TABLE rooms (
  id            TEXT PRIMARY KEY,          -- 例: 'R-28-1F-staff'
  name          TEXT NOT NULL,             -- 来校者向けの名前（例: 機械科 職員室）
  drawing_name  TEXT NOT NULL,             -- 図面上の名前（例: 準備室）
  aliases       TEXT NOT NULL DEFAULT '[]',-- 検索用の別名（JSON文字列）
  building_id   TEXT NOT NULL REFERENCES buildings(id),
  floor         INTEGER NOT NULL,
  node_id       TEXT NOT NULL REFERENCES nodes(id),
  category      TEXT NOT NULL CHECK (category IN ('admin', 'department', 'general', 'special')),
  description   TEXT,
  visible       INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    TEXT
);

-- QRチェックポイント
CREATE TABLE checkpoints (
  id            TEXT PRIMARY KEY,          -- 例: 'CP01'
  node_id       TEXT NOT NULL REFERENCES nodes(id),
  facing        REAL NOT NULL CHECK (facing >= 0 AND facing < 360),  -- 掲示面の向き（図面角度）
  place         TEXT NOT NULL,             -- 掲示場所の説明
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    TEXT
);

-- 設定
CREATE TABLE config (
  key           TEXT PRIMARY KEY,
  value         TEXT
);

INSERT INTO config (key, value) VALUES
  ('dataVersion', '0'),        -- 保存のたびに1増える
  ('mapNorthBearing', NULL),   -- 図面の上方向が北から何度か（未実測）
  ('walkSpeed', '1.0'),        -- 歩く速さ m/s
  ('stairSeconds', '15');      -- 階段1階あたりの秒数

-- 現地調査メモ
CREATE TABLE survey_notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  x             REAL NOT NULL,
  y             REAL NOT NULL,
  floor         INTEGER NOT NULL DEFAULT 1,
  building_id   TEXT REFERENCES buildings(id),
  kind          TEXT NOT NULL CHECK (kind IN ('entrance', 'blocked', 'landmark', 'qr_wall', 'other')),
  text          TEXT NOT NULL DEFAULT '',
  resolved      INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 変更履歴
CREATE TABLE change_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL DEFAULT (datetime('now')),
  user_email    TEXT NOT NULL,
  table_name    TEXT NOT NULL,
  record_id     TEXT NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'undo')),
  before        TEXT,                      -- 変更前（JSON文字列）
  after         TEXT                       -- 変更後（JSON文字列）
);

CREATE INDEX idx_nodes_building_floor ON nodes (building_id, floor);
CREATE INDEX idx_edges_to ON edges (to_id);
CREATE INDEX idx_change_log_at ON change_log (at);
