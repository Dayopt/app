-- ============================================================
-- Supabase Vault の有効化
-- ============================================================
-- 目的: supabase_vault 拡張を有効化し、DB レベルの暗号化シークレット管理基盤を構築
--
-- Vault は Authenticated Encryption（AES-GCM）でシークレットをディスク上に暗号化保存し、
-- vault.decrypted_secrets ビュー経由でオンザフライ復号を提供する。
-- バックアップやレプリケーションストリームでも暗号化が維持される。
--
-- pgsodium は Supabase ホスト環境にプリインストール済み。
-- supabase_vault は内部で pgsodium に依存するが、API は安定しており
-- pgsodium の非推奨化サイクルの影響を受けない。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS supabase_vault;
