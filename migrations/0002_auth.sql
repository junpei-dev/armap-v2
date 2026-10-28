-- 管理コンソールのログイン（個人ごとのパスコード方式・2026-10-28）
-- Cloudflare Access は無料プランでも支払い情報の登録が必要だったため、アプリ側で認証する
-- 適用: npx wrangler d1 migrations apply armap-v2 --remote

-- 管理コンソールの利用者
CREATE TABLE admin_users (
  email          TEXT PRIMARY KEY,           -- 学校のメールアドレス（ログインID）
  pass_hash      TEXT NOT NULL,              -- パスコードのハッシュ（PBKDF2-SHA256・base64）
  pass_salt      TEXT NOT NULL,              -- ソルト（base64）
  role           TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('teacher', 'student')),
  disabled       INTEGER NOT NULL DEFAULT 0, -- 1 ならログインできない（卒業・担当替え）
  failed_count   INTEGER NOT NULL DEFAULT 0, -- 続けて間違えた回数
  locked_until   TEXT,                       -- この時刻まではログインできない（総当たり対策）
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ログイン中のセッション
CREATE TABLE admin_sessions (
  token_hash     TEXT PRIMARY KEY,           -- クッキーに入れたトークンの SHA-256（トークンそのものは保存しない）
  email          TEXT NOT NULL REFERENCES admin_users(email) ON DELETE CASCADE,
  expires_at     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_admin_sessions_email ON admin_sessions (email);
