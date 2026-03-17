-- オンボーディング完了フラグをprofilesテーブルに追加
-- マイグレーション統合時に脱落していたため再追加
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
