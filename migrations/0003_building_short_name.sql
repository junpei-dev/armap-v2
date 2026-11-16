-- 棟に「地図に出す短い名前」を足す（2026-11-16 実機テストの結果: 番号だけではどの棟か分からない）
-- 例: 28 → '機械'、64 → '情報技術'。空なら、これまで通り棟番号を出す
-- 適用: npx wrangler d1 migrations apply armap-v2 --remote
ALTER TABLE buildings ADD COLUMN short_name TEXT;
